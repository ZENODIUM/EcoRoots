"""Scientific Engine Readiness Audit: executes every engine on NEW inputs and records evidence.

Usage: python scripts/readiness_audit.py      -> experiments/readiness/audit.json
"""
from __future__ import annotations

import json
import sys
import time
import traceback
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.ethnoharvest import (agent, catalog, compadre, demography as dm, eligibility as el, habitat,  # noqa: E402
                                  harvest as hv, planner, simulate as sim, spatial, store)

OUT = ROOT / "experiments" / "readiness"
R: dict = {"started_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}


def section(name):
    def deco(fn):
        t0 = time.time()
        try:
            R[name] = fn() | {"_ok": True, "_seconds": round(time.time() - t0, 1)}
        except Exception as e:
            R[name] = {"_ok": False, "_error": f"{type(e).__name__}: {e}", "_trace": traceback.format_exc()[-1500:]}
        print(f"[{name}] ok={R[name]['_ok']} {R[name].get('_seconds', '')}s")
        return fn
    return deco


@section("demography_all_medicinal")
def _():
    cat = catalog.catalog()
    rows, fail = [], []
    for c in cat:
        pres = el.preset_matrices(c["name"])
        if pres.empty:
            rows.append({"species": c["name"], "presets": 0})
            continue
        mid = int(pres.MatrixID.iloc[0])
        try:
            p = sim.projection(mid, 25)
            lam, chk = p["matrix"]["lambda"], p["matrix"]["lambda_power_check"]
            T = np.array(p["trajectory"]["stages"])
            ok = np.isfinite(lam) and T.shape == (26, len(p["matrix"]["A"])) and (T >= -1e-9).all()
            prim = p["matrix"]["validation"].get("primitive")
            rows.append({"species": c["name"], "presets": int(len(pres)), "matrix": mid, "lambda": lam,
                         "power_agree": abs(lam - chk) < 1e-6, "primitive": prim, "ok": bool(ok),
                         "split": bool(pres.qc_split_available.iloc[0])})
        except Exception as e:
            fail.append({"species": c["name"], "error": str(e)[:200]})
    sup = [r for r in rows if r.get("ok")]
    return {"medicinal_taxa": len(cat), "with_qc_preset": sum(1 for r in rows if r.get("presets")),
            "projection_executes": len(sup), "failures": fail,
            "power_disagree_species": [r["species"] for r in sup if not r["power_agree"]],
            "imprimitive_presets": [r["species"] for r in sup if r["primitive"] is False],
            "no_preset_species": [r["species"] for r in rows if not r.get("presets")],
            "with_uf_split": sum(1 for r in sup if r["split"])}


@section("simulator")
def _():
    out = {"studies": {}}
    for s in hv.STUDIES:
        r = sim.study_comparison(s["id"], 30)
        out["studies"][s["id"]] = {"series": len(r["series"]), "lambdas": {x["label"][:40]: round(x["lambda"], 4) for x in r["series"]},
                                   "all_qc_ok": all(x["qc_ok"] for x in r["series"]), "design": s["design"]}
    rot = {}
    for mid, pct in hv.BY_ID["nardostachys-ghimire2008"]["intensity"].items():
        if pct == 0:
            continue
        rot[pct] = {r: round(sim.rotation("nardostachys-ghimire2008", mid, r, 40)["annualised_lambda"], 4) for r in (1, 3, 5, 10)}
    out["rotation_nardostachys"] = rot
    try:
        sim.rotation("khaya-gaoue2010", 247614, 5)
        out["rotation_observational_blocked"] = False
    except ValueError:
        out["rotation_observational_blocked"] = True
    a = sim.study_comparison("nardostachys-ghimire2008", 30)
    b = sim.study_comparison("nardostachys-ghimire2008", 30)
    out["deterministic_repeat_identical"] = json.dumps(a, default=str) == json.dumps(b, default=str)
    h = sim.hypothetical(244454, [3, 4, 5], 0.2, 20)
    out["hypothetical_example"] = {"lambda_baseline": h["lambda_baseline"], "lambda_scenario": h["lambda_scenario"], "tier": h["tier"]}
    out["quota"] = {sp: sim.quota_question(sp)["answer_status"] for sp in
                    ["Nardostachys jatamansi", "Khaya senegalensis", "Arnica montana", "Valeriana jatamansi", "Unknownus plantus"]}
    full = {k: True for k in el.LOCAL_QUOTA_REQUIREMENTS}
    out["quota_with_full_local_evidence"] = sim.quota_question("Nardostachys jatamansi", full)["answer_status"]
    out["quota_with_5_of_6"] = sim.quota_question("Nardostachys jatamansi", {**full, "site_rights": False})["answer_status"]
    store.init()
    ids = [store.save_item("scenario", f"audit-{i}", {"mode": "study", "i": i})["id"] for i in range(3)]
    out["scenarios_saved_and_listed"] = all(i in {x["id"] for x in store.list_items("scenario")} for i in ids)
    for i in ids:
        store.delete_item(i)
    md = compadre.metadata()
    n = md[md.SpeciesAccepted == "Nardostachys jatamansi"]
    out["nardostachys_matrices_in_compadre"] = {"n": int(len(n)), "composites": sorted(set(map(str, n.MatrixComposite))),
                                                "year_specific_available": bool((pd.to_numeric(n.MatrixEndYear) - pd.to_numeric(n.MatrixStartYear) == 1).any()),
                                                "years": sorted(set(zip(map(str, n.MatrixStartYear), map(str, n.MatrixEndYear))))}
    return out


@section("eligibility_species_panel")
def _():
    panel = ["Nardostachys jatamansi", "Khaya senegalensis", "Prunus africana", "Echinacea angustifolia", "Panax quinquefolius",
             "Arnica montana", "Primula veris", "Hydrastis canadensis", "Valeriana jatamansi"]
    return {"rows": {sp: {"tier": (a := el.assess(sp))["overall_tier"], "quota": a["quota_answer"],
                          "enabled": [k for k, v in a["tasks"].items() if v["status"].startswith("enabled")]} for sp in panel},
            "tier_counts_all_medicinal": {t: sum(1 for c in catalog.catalog() if c["tier"] == t) for t in "ABC"}}


@section("spatial_new_regions")
def _():
    regs = {
        "Mt Kenya (Prunus africana)": ("Prunus africana", {"bbox": [36.9, -0.4, 37.6, 0.1]}),
        "Benin north (Khaya)": ("Khaya senegalensis", {"bbox": [1.5, 10.0, 2.6, 11.0]}),
        "Pyrenees (Arnica)": ("Arnica montana", {"bbox": [0.0, 42.4, 2.0, 43.0]}),
        "Bhutan (Nardostachys)": ("Nardostachys jatamansi", {"bbox": [89.5, 27.3, 90.6, 28.0]}),
        "Mid-Atlantic ocean": ("Arnica montana", {"bbox": [-35, 30, -33, 31]}),
        "Point radius Andes": (None, {"point": [-78.5, -0.2], "radius_km": 30}),
    }
    out = {}
    for label, (sp, reg) in regs.items():
        t0 = time.time()
        ctx = spatial.region_context(sp, reg, sensitive=True)
        suit = habitat.predict_cells(sp, ctx["grid"]) if sp else {"status": "no species"}
        L = ctx["layers"]
        out[label] = {"seconds": round(time.time() - t0, 1), "cells": len(ctx["grid"]),
                      "cells_with_climate": sum(1 for c in ctx["grid"] if c["bio1"] is not None),
                      "layer_status": {k: v.get("status") for k, v in L.items()},
                      "clean_occurrences": L.get("occurrences", {}).get("clean_count"),
                      "suitability": suit.get("status"),
                      "extrapolated_cells": sum(1 for p in suit.get("predictions", []) if p.get("extrapolation")),
                      "georeferenced_cell_example": ctx["grid"][0]["bounds"] if ctx["grid"] else None}
    # repeatability / zoom independence: identical request -> identical numbers
    a = spatial.region_context("Arnica montana", {"bbox": [0.0, 42.4, 2.0, 43.0]})
    b = spatial.region_context("Arnica montana", {"bbox": [0.0, 42.4, 2.0, 43.0]})
    out["_repeatable"] = [c["bio1"] for c in a["grid"]] == [c["bio1"] for c in b["grid"]]
    errs = {}
    for label, reg in {"too large": {"bbox": [-170, -60, 170, 80]}, "inverted": {"bbox": [10, 10, 5, 5]},
                       "bowtie polygon": {"geometry": {"type": "Polygon", "coordinates": [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]]}}}.items():
        try:
            r = spatial.parse_region(reg)
            errs[label] = {"accepted": True, "issues": r["issues"], "area_km2": round(r["area_km2"])}
        except Exception as e:
            errs[label] = {"accepted": False, "error": str(e)[:160]}
    out["_geometry_checks"] = errs
    return out


@section("planner_new_region")
def _():
    ctx = spatial.region_context("Khaya senegalensis", {"bbox": [1.5, 9.5, 3.0, 11.5]}, sensitive=True)
    cells = planner.planning_units(ctx, habitat.predict_cells("Khaya senegalensis", ctx["grid"]))
    sweep = []
    for B in (3, 6, 12, 24):
        r = planner.survey_with_baselines([dict(c) for c in cells], B)
        o = r["optimal"]
        sweep.append({"budget": B, "selected": o["n_selected"], "strata": f"{o['strata_covered']}/{o['strata_total']}",
                      "cost": o["cost_used"], "within_budget": o["constraint_satisfied"],
                      "obj": round(10 * o["strata_covered"] + o["total_benefit"], 3),
                      "greedy_obj": round(10 * r["baselines"]["greedy"]["strata_covered"] + r["baselines"]["greedy"]["total_benefit"], 3)})
    rv = planner.plan_reverification([dict(c) for c in cells], 6)
    ev = planner.plan_evidence("Khaya senegalensis", 60)
    return {"cells": len(cells), "sweep": sweep, "monotone": all(sweep[i]["obj"] <= sweep[i + 1]["obj"] + 1e-9 for i in range(3)),
            "reverify": {"status": rv.get("status"), "selected": len(rv.get("selected", []))},
            "evidence": {"items": ev["optimal"]["items"], "unlocks": ev["optimal"]["unlocks"], "greedy_unlocks": ev["greedy_baseline"]["unlocks"]}}


@section("agent_runs")
def _():
    store.init()
    cases = {
        "normal": {"species": "Khaya senegalensis", "question": "Does bark harvesting reduce population growth of African mahogany?",
                   "region": {"bbox": [1.5, 10.0, 2.6, 11.0]}, "budget": 10},
        "provider_failure": {"species": "Arnica montana", "region": {"bbox": [9, 46.5, 10.5, 47.5]}, "goal": "survey_planning", "inject": ["provider_failure"]},
        "unknown_study": {"species": "Nardostachys jatamansi", "goal": "harvest_research", "inject": ["unknown_study"]},
        "low_jev_confidence": {"species": "Arnica montana", "question": "tell me about arnica", "inject": ["low_jev_confidence"]},
        "unsupported_population_model": {"species": "Arnica montana", "goal": "population_demography", "inject": ["unsupported_population_model"]},
        "jev+groq unavailable": {"species": "Primula veris", "question": "where should we survey cowslip?", "inject": ["jev_unavailable", "groq_unavailable"]},
    }
    out = {}
    for k, req in cases.items():
        t0 = time.time()
        rid = agent.run_assessment(req)
        r = store.get_run(rid)
        ev = store.events(rid)
        states = (r.get("outputs") or {}).get("node_states", {})
        out[k] = {"run_id": rid, "status": r["status"], "seconds": round(time.time() - t0, 1), "node_states": states,
                  "events": len(ev), "jev_decisions": [(j["question"], j["choice"], j["confidence"], bool(j["accepted"]))
                                                       for j in store.jev_for_run(rid)],
                  "route": ((r.get("outputs") or {}).get("route") or {}).get("method"),
                  "quota_answer": ((r.get("outputs") or {}).get("gate") or {}).get("quota_answer"),
                  "trace_matches_final_states": all(
                      [e for e in ev if e["node"] == n and e["state"] not in ("queued", "running")][-1]["state"] == st
                      for n, st in states.items() if st)}
    return out


@section("api_contract")
def _():
    from fastapi.testclient import TestClient
    from backend.ethnoharvest.api import app
    c = TestClient(app)
    res = {}

    def chk(name, resp, cond=lambda j: True):
        ok = resp.status_code == 200
        try:
            j = resp.json()
        except Exception:
            j = None
        res[name] = {"status": resp.status_code, "ok": bool(ok and cond(j))}
    chk("health", c.get("/api/health"), lambda j: j["matrices"] == 9178)
    chk("species search", c.get("/api/species?q=jata"), lambda j: j["results"][0]["name"] == "Nardostachys jatamansi")
    chk("species profile", c.get("/api/species/Khaya senegalensis"), lambda j: j["tier"] == "A")
    chk("species outside catalog", c.get("/api/species/Valeriana jatamansi"), lambda j: j["tier"] == "C")
    chk("cases", c.get("/api/cases"), lambda j: len(j["cases"]) == 4)
    chk("layers", c.get("/api/layers"))
    chk("matrix", c.get("/api/matrix/244457"), lambda j: abs(j["lambda"] - 0.8912) < 1e-3)
    chk("simulate study", c.post("/api/simulate", json={"mode": "study", "study_id": "khaya-gaoue2010"}))
    chk("simulate rotation", c.post("/api/simulate", json={"mode": "rotation", "study_id": "nardostachys-ghimire2008", "treatment_id": 244457, "rest_years": 7}))
    res["simulate rotation on observational -> 422"] = {"status": (s := c.post("/api/simulate", json={"mode": "rotation", "study_id": "khaya-gaoue2010", "treatment_id": 247614})).status_code, "ok": s.status_code == 422}
    chk("quota", c.post("/api/quota", json={"species": "Arnica montana"}), lambda j: j["answer_status"] == "cannot estimate safe local rate")
    chk("plan evidence", c.post("/api/plan", json={"intent": "evidence", "species": "Arnica montana", "budget": 40}))
    res["plan survey w/o region -> 422"] = {"status": (s := c.post("/api/plan", json={"intent": "survey", "species": "Arnica montana"})).status_code, "ok": s.status_code == 422}
    res["bad bbox -> 422"] = {"status": (s := c.post("/api/runs", json={"species": "Arnica montana", "region": {"bbox": [5, 5, 1, 1]}})).status_code, "ok": s.status_code == 422}
    chk("experiments", c.get("/api/experiments"), lambda j: len(j) >= 13)
    chk("sources", c.get("/api/sources"))
    chk("studies", c.get("/api/studies"), lambda j: len(j["audited"]) == 8)
    r = c.post("/api/items/scenario", json={"name": "t", "body": {"x": 1}}).json()
    chk("scenario list", c.get("/api/items/scenario"), lambda j: any(i["id"] == r["id"] for i in j["items"]))
    c.delete(f"/api/items/scenario/{r['id']}")
    runs = c.get("/api/runs").json()["runs"]
    if runs:
        chk("run detail", c.get(f"/api/runs/{runs[0]['id']}"), lambda j: len(j["events"]) > 0)
        chk("report html", c.get(f"/api/report/{runs[0]['id']}"))
        with c.stream("GET", f"/api/runs/{runs[0]['id']}/events") as s:
            body = "".join(s.iter_text())
        res["sse replay of finished run"] = {"status": 200, "ok": "event: done" in body and "event: node" in body}
    return {"checks": res, "passed": sum(v["ok"] for v in res.values()), "total": len(res)}


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    R["finished_utc"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    (OUT / "audit.json").write_text(json.dumps(R, indent=1, default=str))
    print("written", OUT / "audit.json")
