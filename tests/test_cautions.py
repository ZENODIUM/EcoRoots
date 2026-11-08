"""Cautions are species-, organ- and jurisdiction-aware, never invent rules, and research runs are traced on the run store."""
import pytest

from backend.ethnoharvest import media, spatial, store, taxonomy
from backend.ethnoharvest.ops import cautions as C, db, passport as pp
from backend.ethnoharvest.ops.sources import SOURCES

LISTED = {"status": "available", "listed": True, "appendices": ["II"]}


def kinds(b):
    return {c["evidence_kind"] for c in b["cards"]}


def issues(b):
    return " | ".join(c["issue"] for c in b["cards"])


def test_jatamansi_rhizome_nepal_has_study_guidance_cites_and_nepal_rule():
    b = C.build("Nardostachys jatamansi", "rhizome", "Nepal", LISTED, literature=False)
    assert {"supported-by-study", "practitioner-guidance", "regulatory-listing", "requires-authority-confirmation", "general"} <= kinds(b)
    study = [c for c in b["cards"] if c["evidence_kind"] == "supported-by-study"][0]
    assert "25% harvest: λ" in study["why_it_matters"]  # numbers come from the COMPADRE matrices
    assert any("np-jatamansi-export" in c["scope"] for c in b["cards"])


def test_organ_changes_the_cards():
    bark = C.build("Khaya senegalensis", "bark", "Benin", None, literature=False)
    leaf = C.build("Khaya senegalensis", "leaf", "Benin", None, literature=False)
    assert "Foliage harvest (pruning)" in issues(leaf) and "Foliage harvest (pruning)" not in issues(bark)
    # bark harvest pulls in bark studies of other species (Prunus), foliage does not
    assert "Prunus africana" in issues(bark) and "Prunus africana" not in issues(leaf)


def test_jurisdiction_changes_the_cards():
    np_ = C.build("Nardostachys jatamansi", "rhizome", "Nepal", LISTED, literature=False)
    in_ = C.build("Nardostachys jatamansi", "rhizome", "India", LISTED, literature=False)
    assert any("np-jatamansi-export" in c["scope"] for c in np_["cards"])
    assert not any("np-jatamansi-export" in c["scope"] for c in in_["cards"])
    assert "No rule recorded for India" in issues(in_)


def test_unknown_species_gets_no_study_claims_and_cites_unknown_is_not_unlisted():
    b = C.build("Plantago imaginaria", "leaf", None, {"status": "pending", "reason": "token missing"}, literature=False)
    assert "supported-by-study" not in kinds(b)
    assert "CITES status unknown" in issues(b)


def test_every_card_is_labelled_unreviewed_and_not_a_permit_and_sources_are_registered():
    b = C.build("Prunus africana", "bark", "Cameroon", LISTED, literature=False)
    urls = {s["url"] for s in SOURCES.values()}
    for c in b["cards"]:
        assert c["not_a_permit"] and c["human_review_status"] == "awaiting expert review"
        for s in c["sources"]:
            assert s["kind"] == "study" or s["url"] in urls


def test_research_run_is_traced_and_cached(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DB", tmp_path / "c.sqlite3")
    monkeypatch.setattr(db, "_ready", False)
    store.init()
    monkeypatch.setattr(media, "species_image", lambda n, **k: {"status": "none", "reason": "stub"})
    monkeypatch.setattr(spatial, "cites_status", lambda n: LISTED)
    monkeypatch.setattr(taxonomy, "resolve", lambda n: {"accepted": n, "status": "ACCEPTED"})
    p = pp.create("main", "manager", species="Prunus africana", organ="bark", activity=None, region_label=None, region_public=None, jurisdiction="Cameroon")
    r = C.cautions_for("main", "manager", p["id"])
    assert r["status"] == "ok" and r["run_id"] and not r["cached"]
    ev = store.events(r["run_id"])
    done = {e["node"] for e in ev if e["state"] == "completed"}
    assert {"taxonomy_match", "organ_specific_research", "regulation_retrieve", "science_gate", "create_tasks", "report"} <= done
    assert C.cautions_for("main", "manager", p["id"])["cached"] is True
    with pytest.raises(db.OpsError):
        C.cautions_for("demo", "manager", p["id"])  # other workspace cannot read it


def test_transferred_studies_merge_per_species_and_card_ids_are_unique():
    from backend.ethnoharvest.ops import cautions as C
    for sp, organ in (("Prunus africana", "bark"), ("Khaya senegalensis", "bark"), ("Colchicum autumnale", "leaf")):
        cards = C.study_cards(sp, organ)
        assert len({c["id"] for c in cards}) == len(cards)
    prunus = C.study_cards("Prunus africana", "bark")
    assert sum(c["scope"] == "Khaya senegalensis" for c in prunus) == 1  # two Khaya studies, one card with both sources
    assert len(next(c for c in prunus if c["scope"] == "Khaya senegalensis")["sources"]) == 2


def test_modelled_and_labelled_studies_show_each_scenario():
    from backend.ethnoharvest.ops import cautions as C
    c = next(c for c in C.study_cards("Panax quinquefolius", "root") if c["evidence_kind"] == "supported-by-study")
    assert c["issue"].startswith("Published modelled harvest scenarios")
    assert "Non-compliant harvester" in c["why_it_matters"] and "Steward harvester" in c["why_it_matters"]
    assert not any(w in c["why_it_matters"].lower() for w in ("safe", "quota", "sustainable rate"))


def test_garcinia_bark_case_runs_with_mixed_stage_matrices_and_warns_about_stock():
    from backend.ethnoharvest import catalog, simulate
    from backend.ethnoharvest.ops import cautions as C
    assert catalog.species_profile("Garcinia lucida")["tier"] == "A"  # curated medicinal entry with a published source
    r = simulate.study_comparison("garcinia-guedje2007", horizon=10)
    assert sum(s["own_stage_classes"] for s in r["series"]) == 2  # 9-stage felling matrices start from their own structure
    card = next(c for c in C.study_cards("Garcinia lucida", "bark") if c["evidence_kind"] == "supported-by-study")
    assert "harvestable trees" in card["uncertainty"]
