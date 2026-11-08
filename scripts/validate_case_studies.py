"""Run candidate case-study species through the whole EthnoHarvest pipeline and record what each stage produces.

Explore -> Simulate -> Conservation Plan -> Harvest Methods -> Evidence Agent -> HarvestOps (passport + cautions)
-> Document checks -> Inventory -> Reports.

Scientific numbers come from COMPADRE matrices and audited studies. Operational records (harvest masses, documents)
are SYNTHETIC: every PDF carries the demo watermark and every passport lives in the demo workspace. Each case plants
exactly one known document problem so the checker is scored on recall (planted rule found) and false alarms (any
other mismatch raised on consistent documents).

Runs against a throwaway SQLite database; never touches data/app.sqlite3.

    python scripts/validate_case_studies.py                 # live literature + JEV/Groq (keys from .env.local)
    python scripts/validate_case_studies.py --no-literature # deterministic stages only
    python scripts/validate_case_studies.py --only panax,colchicum --out experiments/results/x.json
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

ap = argparse.ArgumentParser()
ap.add_argument("--no-literature", action="store_true")
ap.add_argument("--only", default="")
ap.add_argument("--out", default=str(ROOT / "experiments" / "results" / "case_validation.json"))
args = ap.parse_args()
os.environ["OPS_WORKFLOW"] = "0"  # research is called synchronously below, not on a background thread
os.environ["OPS_LITERATURE"] = "0" if args.no_literature else "1"

from backend.ethnoharvest import catalog, eligibility as el, harvest as hv, media, methods, planner, simulate, store  # noqa: E402
from backend.ethnoharvest.ops import cautions, db, documents, ledger, passport as pp, reports  # noqa: E402
from backend.ethnoharvest.ops.tasks import list_tasks, update_task  # noqa: E402
import generate_demo_documents as gd  # noqa: E402

tmp = Path(tempfile.mkdtemp(prefix="eh-cases-"))
store.DB = tmp / "cases.sqlite3"
db._ready = False
store.init()
# Species photos are not part of this validation; skip the network download and say so in the output.
media.species_image = lambda n, **k: {"status": "none", "reason": "not fetched during case validation"}

WS, ROLE = "demo", "manager"
FORBIDDEN = re.compile(r"\b(safe (harvest )?(rate|level|limit)\s+(is|of)|sustainable (yield|quota) (is|of)|quota of \d|you may harvest|"
                       r"harvest up to \d|\d+\s?% (is|are) (safe|sustainable))", re.I)

# One planted document problem per case: (rule expected, how the weigh-in / drying log is altered)
CASES = [
    {"id": "jatamansi", "species": "Nardostachys jatamansi", "organ": "rhizome", "jurisdiction": "Nepal",
     "studies": ["nardostachys-ghimire2008"], "plant": "quantity_exceeds_authorised", "fresh": 80, "dry": 24},
    {"id": "panax", "species": "Panax quinquefolius", "organ": "root", "jurisdiction": "United States",
     "studies": ["panax-vandervoort2006"], "plant": "date_outside_authorisation", "fresh": 12, "dry": 4},
    {"id": "echinacea", "species": "Echinacea angustifolia", "organ": "root", "jurisdiction": "United States",
     "studies": ["echinacea-hurlburt1999"], "plant": "species_mismatch", "fresh": 40, "dry": 13},
    {"id": "prunus", "species": "Prunus africana", "organ": "bark", "jurisdiction": "Cameroon",
     "studies": ["prunus-stewart2001"], "plant": "organ_mismatch", "fresh": 300, "dry": 180},
    {"id": "khaya", "species": "Khaya senegalensis", "organ": "bark", "jurisdiction": "Benin",
     "studies": ["khaya-gaoue2010", "khaya-gaoue2013"], "plant": "area_mismatch", "fresh": 60, "dry": 36},
    {"id": "boswellia", "species": "Boswellia papyrifera", "organ": "resin", "jurisdiction": "Ethiopia",
     "studies": ["boswellia-groenendijk2012"], "plant": "mass_balance_gap", "fresh": 50, "dry": 45},
    {"id": "phyllanthus", "species": "Phyllanthus emblica", "organ": "fruit", "jurisdiction": "India",
     "studies": ["phyllanthus-ticktin2012"], "plant": "lot_not_traceable", "fresh": 90, "dry": 18},
    {"id": "colchicum", "species": "Colchicum autumnale", "organ": "leaf", "jurisdiction": "Austria",
     "studies": ["colchicum-winter2014-cut", "colchicum-winter2014-flower"], "plant": "quantity_exceeds_authorised", "fresh": 80, "dry": 16},
    {"id": "garcinia", "species": "Garcinia lucida", "organ": "bark", "jurisdiction": "Cameroon",
     "studies": ["garcinia-guedje2007"], "plant": "date_outside_authorisation", "fresh": 70, "dry": 42},
    {"id": "carapa", "species": "Carapa guianensis", "organ": "seed", "jurisdiction": "Brazil",
     "studies": [], "plant": "organ_mismatch", "fresh": 100, "dry": 60},
]
LOOKALIKE = {"Echinacea angustifolia": "Echinacea pallida"}
WRONG_PART = {"bark": "leaf", "seed": "bark", "root": "leaf", "rhizome": "leaf", "resin": "bark", "fruit": "bark", "leaf": "root"}


def short(x, n=220):
    return x if not isinstance(x, str) or len(x) <= n else x[:n] + "…"


def stage(rec, name, fn):
    t0 = time.time()
    try:
        rec[name] = {"ok": True, **fn()}
    except Exception as e:  # noqa: BLE001 - a failing stage is a result, not a crash
        rec[name] = {"ok": False, "error": f"{type(e).__name__}: {short(str(e), 300)}"}
    rec[name]["ms"] = int((time.time() - t0) * 1000)


def explore(c):
    prof = catalog.species_profile(c["species"])
    if not prof:
        return {"in_catalog": False}
    a = prof["eligibility"]
    return {"in_catalog": True, "tier": prof["tier"], "n_matrices": prof["n_matrices"], "n_studies": prof["n_studies"],
            "n_populations": prof["n_populations"], "median_lambda": prof["median_lambda"], "family": prof["family"],
            "harvest_studies": [s["id"] for s in prof["harvest_studies"]], "medicinal_sources": prof["medicinal_sources"],
            "example_uses": short(prof["example_uses"], 160), "sensitive": prof["sensitive"],
            "overall_tier": a["overall_tier"], "quota_answer": a["quota_answer"],
            "tasks": {k: v["status"] for k, v in a["tasks"].items()}}


def simulate_stage(c):
    out = []
    for sid in c["studies"]:
        r = simulate.study_comparison(sid, horizon=30)
        cmp = r["comparison"]
        out.append({"study": sid, "design": r["study"]["design"], "caveat": r["design_caveat"],
                     "series": [{"matrix": s["matrix_id"], "role": s["role"], "label": s["label"], "lambda": round(s["lambda"], 4),
                                 "qc_ok": s["qc_ok"], "relative_size_y30": round(s["trajectory"]["total"][-1] / s["trajectory"]["total"][0] * 100, 1)}
                                for s in r["series"]],
                     "mean_control": round(cmp["mean_control"], 4), "mean_treatment": round(cmp["mean_treatment"], 4),
                     "delta_mean": round(cmp["delta_mean"], 4), "permutation_test": cmp.get("permutation_test"),
                     "ltre_main_process": {str(k): max(v, key=lambda p: abs(v[p])) for k, v in (cmp.get("ltre_by_process") or {}).items()
                                           if isinstance(v, dict) and v}})
    if not out:
        pres = el.preset_matrices(c["species"])
        if len(pres):
            mid = int(pres.iloc[0].MatrixID)
            r = simulate.projection(mid, horizon=30)
            out.append({"projection_only": mid, "lambda": round(r["matrix"]["lambda"], 4), "treatment": r["matrix"]["treatment"]})
    q = simulate.quota_question(c["species"])
    return {"studies": out, "quota_question": {"answer": q["answer_status"], "missing": len(q["missing"])}}


def plan_stage(c):
    r = planner.plan_evidence(c["species"], budget=20)
    return {"selected_items": r["optimal"]["items"], "unlocks": r["optimal"]["unlocks"], "cost_person_days": r["optimal"]["cost"],
            "greedy_unlocks": r["greedy_baseline"]["unlocks"], "flip_probability": r["decision_uncertainty"].get("flip_probability"),
            "decisions_currently": {k: v["currently"] for k, v in r["decisions"].items()}}


def methods_stage(c):
    oid = methods.organ_id(c["organ"])
    o = methods.ORGAN_BY_ID.get(oid) or {}
    return {"organ_id": oid, "agent_organ": o.get("agent_organ"), "process": short(o.get("process") or o.get("processes") or "", 160),
            "methods": [m["label"] for m in o.get("methods", [])],
            "sources": len(o.get("sources", []))}


def research_stage(c, rec):
    p = pp.create(WS, ROLE, species=c["species"], organ=c["organ"], activity=f"{c['organ']} collection (synthetic validation)",
                  region_label=f"validation site, {c['jurisdiction']}", region_public=None, jurisdiction=c["jurisdiction"])
    rec["passport_id"] = p["id"]
    body = cautions.cautions_for(WS, ROLE, p["id"], refresh=True)
    cards = body.get("cards", [])
    text = " ".join(f"{k['issue']} {k['why_it_matters']} {k['recommended_next']}" for k in cards)
    ag = body.get("agent") or {}
    kinds = {}
    for k in cards:
        kinds[k["evidence_kind"]] = kinds.get(k["evidence_kind"], 0) + 1
    ai = [k for k in cards if k["evidence_kind"] == "ai-found-literature"]
    return {"passport": p["code"], "prefill": {"organ": p["prefill"]["organ"]["value"], "evidence_tier": p["prefill"]["evidence_tier"]["value"],
                                              "quota_answer": p["prefill"]["quota_answer"]["value"],
                                              "cites": {k: p["prefill"]["cites"]["value"].get(k) for k in ("status", "listed", "appendices")}},
            "research_status": body.get("status"), "cards_by_kind": kinds,
            "cards": [{"issue": short(k["issue"], 140), "kind": k["evidence_kind"], "applicability": k["applicability"],
                       "review": k.get("human_review_status"), "route": (k.get("review_route") or {}).get("route")} for k in cards],
            "same_species_study_cards": sum(k["evidence_kind"] == "supported-by-study" for k in cards),
            "ai_findings": [{"text": short(k["issue"], 200), "applicability": k["applicability"], "route": (k.get("review_route") or {}).get("route"),
                             "proof": [{"quote": short(s.get("excerpt"), 260), "url": s.get("url"), "label": s.get("summary")} for s in k["sources"][:3]]}
                            for k in ai],
            "agent": {k: ag.get(k) for k in ("retrieved", "triage", "triage_mode", "jev_calls", "agreement", "claims", "claims_dropped",
                                              "claims_mode", "verification", "flags", "duration_ms")} if ag else None,
            "sensitivity": (ag or {}).get("sensitivity"), "stochastic": (ag or {}).get("stochastic"),
            "forbidden_phrases": FORBIDDEN.findall(text), "tasks_open": sum(t["status"] == "open" for t in list_tasks(WS, p["id"]))}


def inventory_stage(c, rec):
    pid, code = rec["passport_id"], c["id"].upper()[:3]
    for t in list_tasks(WS, pid):  # demo: preparation tasks waived so collection can be recorded
        if t["blocking"] and t["phase"] == "planned":
            update_task(WS, ROLE, t["id"], "waived", "synthetic validation run: confirmed offline (not a real confirmation)")
    h = pp.record_harvest(WS, ROLE, pid, idem=f"{c['id']}-h1", collector="Collector A (fictional)", date="2026-09-12",
                          qty=c["fresh"], unit="kg", basis="fresh", lot_code=f"{code}-F1")
    lot = h["lot"]["id"]
    water = c["fresh"] - c["dry"] - 2 - 1
    pr = ledger.process(WS, ROLE, f"{c['id']}-p1", in_lot_id=lot, consume_qty=c["fresh"], consume_unit="kg", out_lot_code=f"{code}-D1",
                        out_qty=c["dry"], out_unit="kg", out_basis="dry", moisture_loss=water, rejected=2, waste=1)
    rec["_lots"] = (f"{code}-F1", f"{code}-D1", water)
    rc = ledger.reconciliation(WS, pid)
    inv = ledger.inventory(WS, pid)
    lin = ledger.lineage(WS, lot)
    return {"received_g": h["received_g"], "process": {"unexplained_g": pr["mass_balance"]["unexplained_g"], "flag": bool(pr.get("reconciliation_flag"))},
            "reconciliation": {"unexplained_total_g": rc["unexplained_total_g"], "dry_on_hand_g": rc["per_basis"]["dry"]["on_hand_g"]},
            "lots": [{"code": l["code"], "basis": l["basis"], "on_hand_g": l["on_hand_g"], "synthetic": l.get("synthetic")}
                     for l in inv["lots"]], "lineage_nodes": len(lin["nodes"]), "lineage_edges": len(lin["edges"]),
            "regeneration_task": any("Regeneration" in t["title"] for t in list_tasks(WS, pid))}


def documents_stage(c, rec):
    pid = rec["passport_id"]
    f1, d1, water = rec["_lots"]
    gd.ORG.setdefault(c["jurisdiction"], f"Validation Cooperative ({c['jurisdiction']}, fictional)")
    p = {"species": c["species"], "organ": c["organ"], "jurisdiction": c["jurisdiction"]}
    plant = c["plant"]
    a = gd.auth(p, 900, qty=f"{c['fresh'] - 20 if plant == 'quantity_exceeds_authorised' else c['fresh'] + 20} kg fresh",
                valid_until="2026-08-31" if plant == "date_outside_authorisation" else "2026-12-31")
    w = gd.weigh(p, 900, f1, qty=f"{c['fresh']} kg fresh",
                 species=LOOKALIKE.get(c["species"], "Valeriana officinalis") if plant == "species_mismatch" else None,
                 organ=WRONG_PART.get(c["organ"], "leaf") if plant == "organ_mismatch" else None)
    if plant == "area_mismatch":
        w["area"] = "Block C"
        a["area"] = "Block A"
    dry = c["dry"] - 5 if plant == "mass_balance_gap" else c["dry"]
    dl = gd.drying(p, 900, f1, d1, fresh=f"{c['fresh']} kg", dry=f"{dry} kg", water=f"{water} kg", rej="2 kg", waste="1 kg")
    files = [("authorisation.pdf", "authorisation", a), ("weigh-in.pdf", "weigh_in", w), ("drying-log.pdf", "drying_log", dl)]
    if plant == "lot_not_traceable":  # the rule covers batch statements, CoAs and invoices (a weigh-in lot is not checked)
        files.append(("batch.pdf", "batch_statement", gd.batch(p, 900, "UNKNOWN-LOT-77", qty=f"{c['dry']} kg dry")))
    if plant == "area_mismatch":  # the weigh-in template has no area field; the collection plan carries it
        files.append(("plan.pdf", "collection_plan", gd.plan(p, 900, area="Block C", qty=f"{c['fresh']} kg fresh")))
    out = None
    for name, kind, fields in files:
        out = documents.ingest(WS, ROLE, pid, name, gd.render(kind, gd.ORG[c["jurisdiction"]], gd.clean(fields)))
    issues = (out or {}).get("issues", [])
    rules = sorted({i["rule"] for i in issues})
    flagged = {i["rule"] for i in issues if i.get("severity") in ("mismatch", "missing", "review", "jurisdiction")}
    extra = sorted(flagged - {plant, "cites_cross_border"})
    return {"planted": plant, "found": plant in rules, "rules": rules, "false_alarms": extra,
            "issues": [{"rule": i["rule"], "severity": i.get("severity"), "detail": short(i["message"], 160)} for i in issues]}


def reports_stage(c, rec):
    out = {}
    for kind in reports.KINDS:
        data, _ = reports.build(WS, ROLE, rec["passport_id"], kind)
        out[kind] = {"bytes": len(data), "pdf": data[:5] == b"%PDF-"}
    return {"exports": out, "all_valid_pdf": all(v["pdf"] for v in out.values())}


def main():
    only = {x.strip() for x in args.only.split(",") if x.strip()}
    known = set(hv.BY_ID)
    results = []
    for c in CASES:
        if only and c["id"] not in only:
            continue
        missing = [s for s in c["studies"] if s not in known]
        rec = {"id": c["id"], "species": c["species"], "organ": c["organ"], "jurisdiction": c["jurisdiction"], "missing_studies": missing}
        print(f"== {c['id']}: {c['species']} · {c['organ']} · {c['jurisdiction']}", flush=True)
        c = {**c, "studies": [s for s in c["studies"] if s in known]}
        stage(rec, "explore", lambda: explore(c))
        stage(rec, "simulate", lambda: simulate_stage(c))
        stage(rec, "plan", lambda: plan_stage(c))
        stage(rec, "methods", lambda: methods_stage(c))
        stage(rec, "harvestops_research", lambda: research_stage(c, rec))
        if "passport_id" in rec:
            stage(rec, "inventory", lambda: inventory_stage(c, rec))
            if "_lots" in rec:
                stage(rec, "documents", lambda: documents_stage(c, rec))
            stage(rec, "reports", lambda: reports_stage(c, rec))
        rec.pop("_lots", None)
        for k in ("explore", "simulate", "plan", "methods", "harvestops_research", "inventory", "documents", "reports"):
            if k in rec:
                print(f"   {k:20s} {'ok ' if rec[k]['ok'] else 'FAIL'} {rec[k]['ms']:>6} ms {'' if rec[k]['ok'] else rec[k]['error']}", flush=True)
        results.append(rec)
    out = {"generated": time.strftime("%Y-%m-%d %H:%M:%S"), "literature": not args.no_literature,
           "note": "Operational records and documents are SYNTHETIC (demo workspace, watermarked PDFs). Scientific numbers come from "
                   "COMPADRE v6.26.3.0 matrices. No result here is a harvest rate, quota or permit.",
           "cases": results}
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(out, indent=2, default=str), encoding="utf-8")
    print("wrote", args.out)


if __name__ == "__main__":
    main()
