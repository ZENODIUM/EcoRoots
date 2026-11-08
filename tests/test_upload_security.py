"""Upload hardening and configurable reconciliation tolerance."""
import io

import pytest
from fastapi.testclient import TestClient
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from backend.ethnoharvest import media, spatial, store, taxonomy
from backend.ethnoharvest.api import app
from backend.ethnoharvest.ops import db, documents as D, ledger, passport as pp


def make_pdf(pages=1, encrypt=None, text="Weigh-in slip"):
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4, encrypt=encrypt)
    for i in range(pages):
        c.drawString(72, 750, f"{text} page {i + 1}")
        c.showPage()
    c.save()
    return buf.getvalue()


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DB", tmp_path / "s.sqlite3")
    monkeypatch.setattr(db, "_ready", False)
    monkeypatch.setattr(D, "DOC_DIR", tmp_path / "docs")
    monkeypatch.setenv("OPS_LLM_EXTRACTION", "0")
    store.init()
    monkeypatch.setattr(media, "species_image", lambda n, **k: {"status": "none", "reason": "stub"})
    monkeypatch.setattr(spatial, "cites_status", lambda n: {"status": "available", "listed": False})
    monkeypatch.setattr(taxonomy, "resolve", lambda n: {"accepted": n, "status": "ACCEPTED"})
    p = pp.create("main", "manager", species="Prunus africana", organ="bark", activity=None, region_label=None,
                  region_public=None, jurisdiction="Cameroon")
    return TestClient(app), p["id"]


H = {"X-EH-Role": "manager", "X-EH-Workspace": "main"}


def up(c, pid, data, name="slip.pdf", ctype="application/pdf"):
    return c.post(f"/api/ops/passports/{pid}/documents", headers=H, files={"file": (name, data, ctype)})


def test_encrypted_pdf_is_rejected_with_a_reason(client):
    c, pid = client
    r = D.analyse(make_pdf(encrypt="secret"), use_llm=False)
    assert r["status"] == "rejected" and "password" in r["reason"]
    res = up(c, pid, make_pdf(encrypt="secret"))
    assert res.status_code == 200 and res.json()["document"]["status"] == "rejected"


def test_page_cap(client):
    r = D.analyse(make_pdf(pages=D.MAX_PAGES + 1), use_llm=False)
    assert r["status"] == "rejected" and "pages" in r["reason"]


def test_oversize_is_refused_before_parsing(client):
    c, pid = client
    big = b"%PDF-1.4\n" + b"0" * (D.MAX_BYTES + 200_000)
    assert up(c, pid, big).status_code == 413


def test_non_pdf_and_wrong_type_refused(client):
    c, pid = client
    assert up(c, pid, b"GIF89a" + b"0" * 100, "x.pdf").status_code == 415
    assert up(c, pid, make_pdf(), "x.pdf", "text/html").status_code == 415


@pytest.mark.parametrize("raw,expect", [("../../etc/passwd", "passwd.pdf"), ("..\\..\\win.ini", "win.ini.pdf"),
                                        ("slip<script>.pdf", "slip_script_.pdf"), ("", "document.pdf"), ("é ü.pdf", "é ü.pdf")])
def test_filenames_are_sanitised(raw, expect):
    assert D.safe_name(raw) == expect


def test_stored_file_served_with_safe_headers_and_workspace_scope(client):
    c, pid = client
    res = up(c, pid, make_pdf(), "../evil\".pdf")
    did = res.json()["document"]["id"]
    f = c.get(f"/api/ops/documents/{did}/file?role=manager&ws=main")
    assert f.status_code == 200 and f.content.startswith(b"%PDF")
    assert f.headers["x-content-type-options"] == "nosniff" and f.headers["cache-control"] == "no-store"
    assert '"' not in f.headers["content-disposition"].split("filename=")[1].strip('"')
    assert c.get(f"/api/ops/documents/{did}/file?role=manager&ws=demo").status_code == 404


def test_tampered_stored_path_is_never_served(client):
    c, pid = client
    did = up(c, pid, make_pdf()).json()["document"]["id"]
    with db.conn() as k:
        k.execute("UPDATE ops_document SET stored_path='../../app.sqlite3' WHERE id=?", (did,))
    assert D.file_path("main", did) is None


def test_collector_cannot_correct_fields(client):
    with pytest.raises(db.OpsError) as e:
        D.correct_field("main", "collector", "fld_x", "bark", "typo")
    assert e.value.status == 403


def test_mass_tolerance_is_configurable_and_labelled(monkeypatch):
    monkeypatch.delenv("OPS_MASS_TOLERANCE_G", raising=False)
    monkeypatch.delenv("OPS_MASS_TOLERANCE_PCT", raising=False)
    assert ledger.tolerance_for(10_000) == 200.0  # default max(50 g, 2 %)
    monkeypatch.setenv("OPS_MASS_TOLERANCE_PCT", "5")
    assert ledger.tolerance_for(10_000) == 500.0
    monkeypatch.setenv("OPS_MASS_TOLERANCE_G", "1000")
    assert ledger.tolerance_for(10_000) == 1000.0
    monkeypatch.setenv("OPS_MASS_TOLERANCE_G", "nonsense")
    assert ledger.tolerance_for(10_000) == 200.0
    assert "not a scientific or legal standard" in ledger.TOLERANCE_LABEL
    m = TestClient(app).get("/api/ops/meta").json()
    assert "not production security" in m["access_model"] and m["mass_tolerance"]["label"] == ledger.TOLERANCE_LABEL


def test_harvest_adds_regeneration_follow_up_and_overview_lists_exceptions(client):
    from backend.ethnoharvest.ops import passport as P
    c, pid = client
    P.record_harvest("main", "manager", pid, idem="h1", collector="c", date="2025-01-31", qty=5, unit="kg", basis="fresh", lot_code="L-1")
    t = [x for x in P.list_tasks("main", pid) if x["kind"] == "monitoring"]
    assert len(t) == 1 and t[0]["due"] == "2026-01-28" and "scheduling default" in t[0]["detail"]
    o = P.overview("main", "manager")
    assert o["counts"]["overdue"] >= 1  # 2026-01-28 is in the past
    assert any(e["kind"] == "overdue task" for e in o["exceptions"])
    sev = [e["severity"] for e in o["exceptions"]]
    assert sev == sorted(sev, reverse=True)
