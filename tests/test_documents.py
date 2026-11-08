"""HarvestOps documents: fixture watermarking, extraction, cross-document rules, abstention, corrections, report exports."""
import json
from pathlib import Path

import pdfplumber
import pytest

from backend.ethnoharvest import media, spatial, store, taxonomy
from backend.ethnoharvest.ops import db, documents as D, passport as pp, reports
from backend.ethnoharvest.ops.db import OpsError
from backend.ethnoharvest.ops.tasks import list_tasks

ROOT = Path(__file__).resolve().parents[1]
FIX = ROOT / "tests" / "fixtures" / "harvestops"
GT = json.loads((FIX / "ground_truth.json").read_text(encoding="utf-8"))
PACKETS = {p["id"]: p for p in GT["packets"]}


@pytest.fixture(autouse=True)
def no_llm(monkeypatch):
    monkeypatch.setenv("OPS_LLM_EXTRACTION", "0")


@pytest.fixture
def tmp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DB", tmp_path / "ops.sqlite3")
    monkeypatch.setattr(db, "_ready", False)
    monkeypatch.setattr(D, "DOC_DIR", tmp_path / "docs")
    store.init()
    monkeypatch.setattr(media, "species_image", lambda n, **k: {"status": "none", "reason": "stub"})
    monkeypatch.setattr(spatial, "cites_status", lambda n: {"status": "available", "listed": n == "Prunus africana", "appendices": ["II"]})
    monkeypatch.setattr(taxonomy, "resolve", lambda n: {"accepted": n, "status": "ACCEPTED"})


def pdf(packet, name):
    return (FIX / "pdfs" / packet / name).read_bytes()


def analyse_packet(pid):
    pk = PACKETS[pid]
    docs = []
    for d in pk["documents"]:
        data = pdf(pid, d["file"])
        a = D.analyse(data, use_llm=False)
        docs.append({"filename": d["file"], "kind": a["kind"], "status": a["status"], "reason": a.get("reason"),
                     "sha256": __import__("hashlib").sha256(data).hexdigest(), "fields": {f["name"]: f for f in a["fields"]}})
    return D.cross_check(pk["passport"], docs, set(), pk["cites_listed"])


def test_fixture_set_size_and_watermark_on_every_text_page():
    files = list((FIX / "pdfs").rglob("*.pdf"))
    assert len(files) >= 24 and len(GT["packets"]) >= 12
    kinds = {d["kind"] for p in GT["packets"] for d in p["documents"] if d["kind"]}
    assert len(kinds) == 9
    for f in files:
        if "corrupt" in f.name:
            continue
        with pdfplumber.open(f) as doc:
            for page in doc.pages:
                assert "SYNTHETIC DEMO" in (page.extract_text() or ""), f


@pytest.mark.parametrize("pid", [p for p in PACKETS if not p.startswith("P13")])
def test_packet_flags_exactly_the_expected_findings(pid):
    fired = {i["rule"] for i in analyse_packet(pid)} - {"fields_not_found"}
    assert fired == set(PACKETS[pid]["expected_rules"])


def test_consistent_packet_has_no_mismatch():
    assert not [i for i in analyse_packet("P01-consistent") if i["severity"] in ("mismatch", "missing", "review")]


def test_unseen_layout_abstains_instead_of_passing():
    issues = analyse_packet("P13-heldout-unseen-labels")
    assert any(i["rule"] == "fields_not_found" for i in issues)  # rules extractor misses the new labels and says so


def test_normalisers():
    assert D.parse_quantity("24000 g fresh") == (24000.0, "fresh")
    assert D.parse_quantity("300 kg frais") == (300000.0, "fresh")
    assert D.parse_date("12/09/2026") == "2026-09-12" and D.parse_date("Sep 14, 2026") == "2026-09-14"
    assert D.species_name("Nardostachys grandiflora DC.") == ("Nardostachys jatamansi", True)
    assert D.organ_name("écorce") == "bark" and D.organ_name("resin (stem tapping)") == "resin"
    assert D.normalise("limit:loss on drying", "≤ 12 %") == "<= 12"


def test_rejects_non_pdf_and_marks_corrupt_unreadable():
    with pytest.raises(OpsError) as e:
        D.validate(b"GIF89a....", "x.pdf")
    assert e.value.status == 415
    a = D.analyse(pdf("P12-corrupt-and-scanned", "corrupt.pdf"), use_llm=False)
    assert a["status"] == "rejected"
    s = D.analyse(pdf("P12-corrupt-and-scanned", "scanned-weigh-in.pdf"), use_llm=False)
    assert s["status"] == "needs-ocr" and s["fields"] == []  # never guessed


def test_ingest_creates_tasks_and_correction_clears_them(tmp_db):
    p = pp.create("main", "manager", species="Prunus africana", organ="bark", activity=None, region_label=None, region_public=None, jurisdiction="Cameroon")
    pd = "P04-wrong-organ"
    D.ingest("main", "manager", p["id"], "authorisation.pdf", pdf(pd, "authorisation.pdf"))
    r = D.ingest("main", "collector", p["id"], "weigh-in.pdf", pdf(pd, "weigh-in.pdf"))
    assert [i["rule"] for i in r["issues"] if i["severity"] == "mismatch"] == ["organ_mismatch"]
    t = [t for t in list_tasks("main", p["id"]) if t["kind"] == "document"][0]
    assert t["blocking"] and t["status"] == "open"
    d = pp.detail("main", "manager", p["id"])
    auth = [x for x in d["documents"] if x["doc_kind"] == "authorisation"][0]
    fid = [f for f in auth["extraction"]["fields"] if f["name"] == "organ"][0]["id"]
    with pytest.raises(OpsError):
        D.correct_field("main", "collector", fid, "bark", "typo")  # collectors cannot correct
    out = D.correct_field("main", "manager", fid, "bark", "issuer confirmed bark by phone (synthetic)")
    assert not [i for i in out["issues"] if i["rule"] == "organ_mismatch"]
    t2 = [x for x in list_tasks("main", p["id"]) if x["id"] == t["id"]][0]
    assert t2["status"] == "resolved" and "cleared automatically" in t2["resolution"]


def test_duplicate_upload_is_flagged(tmp_db):
    p = pp.create("main", "manager", species="Prunus africana", organ="bark", activity=None, region_label=None, region_public=None, jurisdiction="Cameroon")
    b = pdf("P08-duplicate-record", "weigh-in.pdf")
    D.ingest("main", "collector", p["id"], "slip.pdf", b)
    r = D.ingest("main", "collector", p["id"], "slip.pdf", b)
    assert "duplicate_document" in {i["rule"] for i in r["issues"]}
    assert r["document"]["version"] == 2


def test_reports_build_and_hide_restricted_site(tmp_db):
    p = pp.create("main", "manager", species="Prunus africana", organ="bark", activity=None, region_label=None, region_public=None,
                  jurisdiction="Cameroon", private_locality="4.1234N 9.5678E exact grove")
    for kind in reports.KINDS:
        data, name = reports.build("main", "collector", p["id"], kind)
        assert data.startswith(b"%PDF") and kind in name
        import io
        with pdfplumber.open(io.BytesIO(data)) as doc:
            text = "\n".join(pg.extract_text() or "" for pg in doc.pages)
        assert "Not a permit" in text and "4.1234N" not in text
    with pytest.raises(OpsError):
        reports.build("main", "manager", p["id"], "certificate")
