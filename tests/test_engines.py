"""Regression tests for gates, simulator, planner and geometry (require data/clean built)."""
import json

import pytest

from backend.ethnoharvest import eligibility as el, harvest as hv, planner, simulate as sim, spatial

FULL = {k: True for k in el.LOCAL_QUOTA_REQUIREMENTS}


def test_flagship_dose_response_reproduces():
    r = hv.compare("nardostachys-ghimire2008")
    lams = [d["lambda"] for d in r["dose_response"]]
    assert lams == sorted(lams, reverse=True)
    assert lams[0] == pytest.approx(1.0277, abs=1e-3) and lams[-1] == pytest.approx(0.7369, abs=1e-3)


@pytest.mark.parametrize("species,expected", [
    ("Nardostachys jatamansi", "study-backed scenario only"),
    ("Khaya senegalensis", "study-backed scenario only"),
    ("Primula veris", "cannot estimate safe local rate"),
    ("Arnica montana", "cannot estimate safe local rate"),
    ("Unknownus plantus", "cannot estimate safe local rate"),
])
def test_quota_never_enabled_without_local_evidence(species, expected):
    q = sim.quota_question(species)
    assert q["answer_status"] == expected and q["status"] == "blocked" and len(q["missing"]) == 6


def test_quota_needs_all_six_local_items():
    assert sim.quota_question("Nardostachys jatamansi", FULL)["answer_status"] == "conditional field assessment eligible"
    for k in FULL:
        assert sim.quota_question("Nardostachys jatamansi", {**FULL, k: False})["status"] == "blocked"


def test_rotation_only_for_experimental_studies():
    with pytest.raises(ValueError):
        sim.rotation("khaya-gaoue2010", 247614, 5)
    r = sim.rotation("nardostachys-ghimire2008", 244456, 5)
    assert r["tier"] == "A-extrapolated" and r["annualised_lambda"] > sim.rotation("nardostachys-ghimire2008", 244456, 1)["annualised_lambda"]


def test_simulation_deterministic():
    a = sim.study_comparison("nardostachys-ghimire2008", 25)
    b = sim.study_comparison("nardostachys-ghimire2008", 25)
    assert json.dumps(a, default=str) == json.dumps(b, default=str)


def test_hypothetical_carries_calibration_warning():
    h = sim.hypothetical(244454, [5], 0.3)
    assert h["tier"] == "B" and "E05" in h["calibration_warning"] and h["lambda_scenario"] < h["lambda_baseline"]


def test_geometry_validation():
    with pytest.raises(ValueError):
        spatial.parse_region({"bbox": [10, 10, 5, 5]})
    with pytest.raises(ValueError):
        spatial.parse_region({"bbox": [-170, -60, 170, 80]})
    r = spatial.parse_region({"geometry": {"type": "Polygon", "coordinates": [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]]}})
    assert r["issues"] and r["geometry"].is_valid


def test_grid_never_finer_than_worldclim():
    reg = spatial.parse_region({"point": [11.0, 47.5], "radius_km": 3})
    cells = spatial.planning_grid(reg)
    assert cells and all(c["bounds"][2] - c["bounds"][0] >= spatial.WC_RES - 1e-9 for c in cells)


def _cells(n=6):
    out = []
    for i in range(n):
        for j in range(n):
            out.append({"id": f"c{i}_{j}", "bounds": [i, j, i + 1, j + 1], "center": [i + .5, j + .5],
                        "bio1": float(i), "bio12": float(j * 100), "bio15": 50.0, "elevation_m": 1000.0 + 400 * i,
                        "n_records": (i + j) % 3 == 0, "years_since_record": 5, "last_record_year": 2020,
                        "suitability": None, "cost": 1 + 0.2 * i})
    return out


def test_planner_respects_budget_and_is_monotone():
    prev = -1
    for B in (2, 4, 8, 16):
        r = planner.survey_with_baselines(_cells(), B)
        o = r["optimal"]
        assert o["constraint_satisfied"] and o["cost_used"] <= B + 1e-9
        obj = 10 * o["strata_covered"] + o["total_benefit"]
        g = r["baselines"]["greedy"]
        assert obj >= 10 * g["strata_covered"] + g["total_benefit"] - 1e-6
        assert obj >= prev - 1e-6
        prev = obj


def test_evidence_planner_handles_all_of_requirements():
    e = planner.plan_evidence("Nardostachys jatamansi", 80)
    assert "local_quota" in e["optimal"]["unlocks"]
    assert e["optimal"]["value"] >= e["greedy_baseline"]["value"]
    assert e["optimal"]["cost"] <= 80


def test_evidence_planner_is_species_specific():
    plans = {sp: planner.plan_evidence(sp, 40) for sp in
             ["Nardostachys jatamansi", "Khaya senegalensis", "Arnica montana", "Phyllanthus emblica", "Sabal yapa", "Prunus africana"]}
    bundles = {tuple(sorted(p["optimal"]["items"])) for p in plans.values()}
    assert len(bundles) >= 4, bundles
    # phenology matters for a flower or fruit harvest, not for digging roots
    assert "phenology_monitoring" in plans["Arnica montana"]["optimal"]["items"]
    assert plans["Nardostachys jatamansi"]["decision_values"]["phenology_window"] == 0
    # long-lived trees pay more for multi-year fieldwork, and the target measurement follows the harvested part
    cost = lambda p, k: next(i["cost"] for i in p["items"] if i["id"] == k)  # noqa: E731
    assert cost(plans["Khaya senegalensis"], "local_stage_counts") > cost(plans["Nardostachys jatamansi"], "local_stage_counts")
    label = lambda p: next(i["label"] for i in p["items"] if i["id"] == "targeted_vital_rate")  # noqa: E731
    assert "bark" in label(plans["Prunus africana"]) and "digging" in label(plans["Nardostachys jatamansi"])
    # every selected item explains itself
    for p in plans.values():
        assert all(i["why"] for i in p["items"] if i["selected"])


def test_plan_sweep_endpoint_ilp_dominates_and_is_monotone():
    from fastapi.testclient import TestClient
    from backend.ethnoharvest.api import app
    r = TestClient(app).post("/api/plan/sweep", json={"species": "Khaya senegalensis", "region": {"bbox": [1.4, 9.0, 3.2, 11.8]},
                                                      "budgets": [2, 6, 12, 20]})
    assert r.status_code == 200
    rows = r.json()["rows"]
    assert [x["budget"] for x in rows] == [2, 6, 12, 20]
    for a, b in zip(rows, rows[1:]):
        assert b["ilp"] >= a["ilp"] - 1e-6
    for x in rows:
        assert x["ilp"] >= x["greedy"] - 1e-6 and x["ilp"] >= x["random"] - 1e-6
        assert x["top_suitability"] is None  # withheld: no validated habitat model for Khaya


def test_active_fire_pending_without_key_and_never_leaks_key(monkeypatch, tmp_path):
    import dotenv
    monkeypatch.setattr(dotenv, "dotenv_values", lambda *_a, **_k: {})
    assert spatial.active_fire((10.0, 10.0, 10.5, 10.5))["status"] == "pending"

    secret = "TESTKEY0123456789abcdef"
    monkeypatch.setattr(dotenv, "dotenv_values", lambda *_a, **_k: {"NASA_FIRMS_MAP_KEY": secret})
    monkeypatch.setattr(spatial, "CACHE", tmp_path)

    def boom(url, **_k):
        raise RuntimeError(f"connection failed for {url}")
    monkeypatch.setattr(spatial.httpx, "get", boom)
    out = spatial.active_fire((10.0, 10.0, 10.5, 10.5))
    assert out["status"] == "unavailable"
    assert secret not in json.dumps(out)
    assert not any(tmp_path.rglob("*.json"))  # failures are never cached
