"""HarvestOps: ledger correctness, idempotency, passport state machine, roles, privacy, workspace separation."""
import pytest

from backend.ethnoharvest import media, spatial, store, taxonomy
from backend.ethnoharvest.ops import db, ledger, passport as pp
from backend.ethnoharvest.ops.db import OpsError
from backend.ethnoharvest.ops.tasks import list_tasks, update_task

WS = "main"


@pytest.fixture(autouse=True)
def tmp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DB", tmp_path / "ops.sqlite3")
    monkeypatch.setattr(db, "_ready", False)
    store.init()
    monkeypatch.setattr(media, "species_image", lambda n, **k: {"status": "none", "reason": "stub"})
    monkeypatch.setattr(spatial, "cites_status", lambda n: {"status": "available", "listed": n == "Prunus africana", "appendices": ["II"]})
    monkeypatch.setattr(taxonomy, "resolve", lambda n: {"accepted": n, "status": "ACCEPTED"})
    yield


def new_passport(species="Nardostachys jatamansi", role="manager", ws=WS, **kw):
    return pp.create(ws, role, species=species, organ=kw.get("organ"), activity="rhizome collection", region_label="Dolpa, Nepal",
                     region_public=None, jurisdiction="Nepal", private_locality=kw.get("private_locality"))


def clear_planning_tasks(pid, ws=WS):
    for t in list_tasks(ws, pid):
        if t["blocking"] and t["phase"] == "planned":
            update_task(ws, "manager", t["id"], "waived", "demo: confirmed offline by the cooperative")


def test_prefill_labels_provenance_and_never_grants_quota():
    p = new_passport()
    assert p["status"] == "draft" and p["organ"] == "rhizome"
    assert p["prefill"]["organ"]["provenance"] == "prefilled-source"
    assert p["prefill"]["quota_answer"]["value"] == "study-backed scenario only"
    titles = [t["title"] for t in p["tasks"]]
    assert any("identity" in t for t in titles) and any("authorisation" in t for t in titles)
    assert "not a government permit" in p["not_a_permit"]


def test_ledger_mass_balance_and_reconciliation_task():
    p = new_passport()
    r = pp.record_harvest(WS, "collector", p["id"], idem="h1", collector="Collector A", date="2026-09-10", qty=80, unit="kg",
                          basis="fresh", lot_code="L-FRESH-1")
    assert r["received_g"] == 80000 and r["balance"]["on_hand_g"] == 80000
    out = ledger.process(WS, "manager", "p1", in_lot_id=r["lot"]["id"], consume_qty=80, consume_unit="kg", out_lot_code="L-DRY-1",
                         out_qty=24, out_unit="kg", out_basis="dry", moisture_loss=30, rejected=0, waste=0)
    mb = out["mass_balance"]
    assert mb["unexplained_g"] == 26000  # 80 - 24 - 30
    assert out["reconciliation_flag"] and "not an accusation" in out["reconciliation_flag"]["message"]
    assert any(t["kind"] == "reconciliation" for t in list_tasks(WS, p["id"]))
    inv = ledger.inventory(WS, p["id"])
    fresh = [l for l in inv["lots"] if l["basis"] == "fresh"][0]
    dry = [l for l in inv["lots"] if l["basis"] == "dry"][0]
    assert fresh["on_hand_g"] == 0 and dry["on_hand_g"] == 24000
    # ledger rows reproduce the balance exactly
    led = ledger.lot_ledger(WS, dry["id"])
    assert led["events"][-1]["running_g"] == led["lot"]["on_hand_g"] == 24000


def test_explained_losses_create_no_task():
    p = new_passport()
    r = pp.record_harvest(WS, "collector", p["id"], idem="h1", collector="A", date="2026-09-10", qty=50, unit="kg", basis="fresh", lot_code="F1")
    out = ledger.process(WS, "manager", "p1", in_lot_id=r["lot"]["id"], consume_qty=50, consume_unit="kg", out_lot_code="D1",
                         out_qty=15, out_unit="kg", out_basis="dry", moisture_loss=32, rejected=2, waste=1)
    assert out["mass_balance"]["unexplained_g"] == 0 and out["reconciliation_flag"] is None
    assert out["rejected_lot"]["status"] == "quarantined"


def test_idempotency_replay_and_conflict():
    p = new_passport()
    a = pp.record_harvest(WS, "collector", p["id"], idem="same", collector="A", date="2026-09-10", qty=10, unit="kg", basis="fresh", lot_code="F1")
    b = pp.record_harvest(WS, "collector", p["id"], idem="same", collector="A", date="2026-09-10", qty=10, unit="kg", basis="fresh", lot_code="F1")
    assert b["replayed"] is True and b["op_id"] == a["op_id"]
    assert ledger.inventory(WS)["lots"][0]["on_hand_g"] == 10000  # not doubled
    with pytest.raises(OpsError) as e:
        ledger.receive(WS, "manager", "same", lot_code="F1", basis="fresh", qty=99, unit="kg")
    assert e.value.status == 409


def test_negative_balance_and_basis_mixing_rejected():
    r = ledger.receive(WS, "manager", "r1", lot_code="F1", basis="fresh", qty=5, unit="kg")
    with pytest.raises(OpsError, match="insufficient"):
        ledger.split(WS, "manager", "s1", lot_id=r["lot"]["id"], qty=6, unit="kg", new_code="F1b")
    with pytest.raises(OpsError, match="separate lot"):
        ledger.receive(WS, "manager", "r2", lot_code="F1", basis="dry", qty=1, unit="kg")
    with pytest.raises(OpsError):
        ledger.receive(WS, "manager", "r3", lot_code="F2", basis="fresh", qty=1, unit="lb")
    s = ledger.split(WS, "manager", "s2", lot_id=r["lot"]["id"], qty=2, unit="kg", new_code="F1b")
    assert s["balances"]["F1"]["on_hand_g"] == 3000 and s["balances"]["F1b"]["on_hand_g"] == 2000


def test_quarantine_blocks_movement_and_reservations_respected():
    r = ledger.receive(WS, "manager", "r1", lot_code="D1", basis="dry", qty=10, unit="kg")
    lid = r["lot"]["id"]
    ledger.reserve(WS, "manager", "res1", lot_id=lid, qty=8, unit="kg")
    with pytest.raises(OpsError, match="reserved"):
        ledger.split(WS, "manager", "s1", lot_id=lid, qty=3, unit="kg", new_code="D2")
    ledger.set_quarantine(WS, "quality-reviewer", "q1", lot_id=lid, quarantine=True, reason="out-of-range moisture")
    with pytest.raises(OpsError, match="quarantined"):
        ledger.split(WS, "manager", "s2", lot_id=lid, qty=1, unit="kg", new_code="D3")


def test_adjustment_requires_manager_and_reason():
    r = ledger.receive(WS, "manager", "r1", lot_code="D1", basis="dry", qty=1, unit="kg")
    with pytest.raises(OpsError) as e:
        ledger.adjust(WS, "collector", "a1", lot_id=r["lot"]["id"], delta_qty=-0.1, unit="kg", reason="spill")
    assert e.value.status == 403
    with pytest.raises(OpsError):
        ledger.adjust(WS, "manager", "a2", lot_id=r["lot"]["id"], delta_qty=-0.1, unit="kg", reason="")


def test_state_machine_roles_and_blocking_tasks():
    p = new_passport()
    with pytest.raises(OpsError) as e:
        pp.transition(WS, "quality-reviewer", p["id"], "evidence-review")
    assert e.value.status == 403
    pp.transition(WS, "manager", p["id"], "evidence-review")
    with pytest.raises(OpsError, match="resolve or waive first"):
        pp.transition(WS, "manager", p["id"], "planned")
    with pytest.raises(OpsError) as e:  # collectors cannot waive
        t = [t for t in list_tasks(WS, p["id"]) if t["blocking"]][0]
        update_task(WS, "collector", t["id"], "waived", "not needed")
    assert e.value.status == 403
    clear_planning_tasks(p["id"])
    pp.transition(WS, "manager", p["id"], "planned")
    with pytest.raises(OpsError, match="collection event"):
        pp.transition(WS, "collector", p["id"], "collected")
    with pytest.raises(OpsError, match="cannot move"):
        pp.transition(WS, "manager", p["id"], "transferred")


def test_full_lifecycle_requires_human_transfer_decision():
    p = new_passport("Prunus africana", organ="bark")
    pid = p["id"]
    pp.transition(WS, "manager", pid, "evidence-review")
    clear_planning_tasks(pid)
    pp.transition(WS, "manager", pid, "planned")
    r = pp.record_harvest(WS, "collector", pid, idem="h", collector="A", date="2026-09-01", qty=40, unit="kg", basis="fresh", lot_code="PA-F1")
    pp.transition(WS, "collector", pid, "collected")
    pp.transition(WS, "manager", pid, "processing")
    out = ledger.process(WS, "manager", "p", in_lot_id=r["lot"]["id"], consume_qty=40, consume_unit="kg", out_lot_code="PA-D1",
                         out_qty=18, out_unit="kg", out_basis="dry", moisture_loss=22)
    pp.transition(WS, "manager", pid, "quality-review")
    q = pp.add_quality_test(WS, "quality-reviewer", lot_id=out["out_lot"]["id"], analyte="loss on drying", result=9.5, unit="%",
                            criterion_op="<=", criterion_value=12, criterion_source="synthetic buyer specification")
    assert q["outcome"] == "within-criterion"
    pp.transition(WS, "quality-reviewer", pid, "ready-for-authorised-human-review")
    s = pp.create_shipment(WS, "manager", pid, idem="sh", lot_id=out["out_lot"]["id"], qty=10, unit="kg", destination_country="France", cross_border=True)
    assert any("CITES" in c["item"] for c in s["checklist"])
    with pytest.raises(OpsError, match="resolve or waive first"):  # CITES screening task blocks transfer
        pp.transition(WS, "manager", pid, "transferred")
    for t in list_tasks(WS, pid):
        if t["status"] == "open" and t["blocking"]:
            update_task(WS, "manager", t["id"], "resolved", "screened with the Management Authority (demo)")
    with pytest.raises(OpsError, match="transfer decision"):
        pp.transition(WS, "manager", pid, "transferred")
    pp.review(WS, "manager", pid, target="transfer", decision="approve", reason="all checks reviewed by the cooperative board")
    d = pp.transition(WS, "manager", pid, "transferred")
    assert d["status"] == "transferred"


def test_quality_outside_criterion_creates_blocking_review():
    r = ledger.receive(WS, "manager", "r", lot_code="D1", basis="dry", qty=1, unit="kg", passport_id=new_passport()["id"])
    q = pp.add_quality_test(WS, "quality-reviewer", lot_id=r["lot"]["id"], analyte="moisture", result=15, unit="%",
                            criterion_op="<=", criterion_value=12, criterion_source="synthetic spec")
    assert q["outcome"] == "outside-criterion"
    q2 = pp.add_quality_test(WS, "quality-reviewer", lot_id=r["lot"]["id"], analyte="ash", result=4, unit="%")
    assert q2["outcome"] == "no-documented-criterion"
    assert sum(t["kind"] == "quality" for t in list_tasks(WS)) == 2


def test_private_locality_hidden_and_workspaces_separated():
    p = new_passport(private_locality="27.123N 84.456E exact patch")
    assert pp.detail(WS, "manager", p["id"])["private_locality"].startswith("27.123")
    assert "restricted" in pp.detail(WS, "collector", p["id"])["private_locality"]
    with pytest.raises(OpsError) as e:
        pp.detail("demo", "manager", p["id"])
    assert e.value.status == 404
    d = pp.create("demo", "manager", species="Sabal yapa", organ="leaf", activity=None, region_label=None, region_public=None, jurisdiction=None)
    assert d["synthetic"] == 1 and d["code"].startswith("DEMO-")
    assert all(x["id"] != d["id"] for x in pp.list_passports(WS, "manager"))


def test_lineage_and_trace_hold_quarantine_descendants_with_recall_tasks():
    p = new_passport()
    r = pp.record_harvest(WS, "collector", p["id"], idem="h1", collector="Collector A", date="2026-09-10", qty=40, unit="kg",
                          basis="fresh", lot_code="F1")
    fresh = r["lot"]["id"]
    d = ledger.process(WS, "manager", "p1", in_lot_id=fresh, consume_qty=30, consume_unit="kg", out_lot_code="D1",
                       out_qty=9, out_unit="kg", out_basis="dry", moisture_loss=20, rejected=1, waste=0)
    dry = d["out_lot"]["id"] if "out_lot" in d else [l for l in ledger.inventory(WS, p["id"])["lots"] if l["code"] == "D1"][0]["id"]
    ledger.split(WS, "manager", "s1", lot_id=dry, qty=4, unit="kg", new_code="D1b")
    lin = ledger.lineage(WS, dry)
    codes = {n["code"] for n in lin["nodes"]}
    assert lin["root"] == fresh and codes == {"F1", "D1", "D1-REJ", "D1b"}
    assert len(lin["edges"]) == 3 and lin["processing"][0]["in_g"] == 30000
    with pytest.raises(OpsError):
        ledger.trace_hold(WS, "collector", "t0", lot_id=fresh, reason="contamination reported")
    out = ledger.trace_hold(WS, "quality-reviewer", "t1", lot_id=fresh, reason="contamination reported")
    assert {h["lot"] for h in out["held"]} == {"F1", "D1", "D1b"}  # D1-REJ was already quarantined
    assert {s["lot"] for s in out["skipped"]} == {"D1-REJ"}
    recall = [t for t in list_tasks(WS, p["id"]) if t["kind"] == "recall"]
    assert len(recall) == 3 and all(t["blocking"] for t in recall)
    with pytest.raises(OpsError):
        ledger.split(WS, "manager", "s2", lot_id=dry, qty=1, unit="kg", new_code="D1c")
    assert ledger.trace_hold(WS, "quality-reviewer", "t1", lot_id=fresh, reason="contamination reported")["replayed"]
