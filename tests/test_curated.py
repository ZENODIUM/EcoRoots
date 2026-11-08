"""Hand-picked images and AI-annotated illustrations: provenance, checked-only serving and safe file ids (offline)."""
import pytest

from backend.ethnoharvest import illustrations as il, media, methods

pytestmark = pytest.mark.skipif(not (media.CURATED_DIR / "index.json").exists(), reason="curated media not built")


def test_every_curated_image_has_provenance_and_an_open_licence():
    ix = media.curated()
    recs = ix["parts"] + [v for e in ix["species"].values() for v in e.values() if v]
    assert len(ix["parts"]) >= 30
    for r in recs:
        assert r["creator"] and r["landing"] and r["review"]
        assert media.normalise_licence(r["licence"])[0], r["licence"]
        assert "nc" not in r["licence"].lower() and "nd" not in r["licence"].lower().split("-")
        assert media.media_file(r["id"]), r["id"]


def test_curated_species_photo_wins_and_missing_species_says_none():
    assert media.species_image("Boswellia papyrifera")["cache"] == "curated"
    g = media.species_image("Garcinia lucida")
    assert g["status"] == "none" and "checked by hand" in g["reason"]


def test_organ_photos_put_this_species_first_and_catalogue_groups_by_part():
    r = methods.organ_photos("root", "Panax quinquefolius")
    assert r["curated"] and r["photos"][0]["this_species"]
    assert {p["kind"] for p in r["photos"]} >= {"part", "tool"}
    cat = methods.photo_catalogue()
    assert cat["count"] == len(media.curated()["parts"])
    assert [g["organ"] for g in cat["groups"]][0] == "root"


def test_only_checked_illustrations_are_served_and_text_comes_from_our_data():
    out = il.get("Arnica montana")
    assert out["tier"] == "curated" and out["checked"] and out["visible"]
    assert out["facts"]["parts"][0]["role"] == "harvested"
    assert "not from the model" in out["note"]
    assert il.get("Garcinia lucida")["status"] == "not generated"


def test_illustration_ids_are_validated():
    assert il.file("../index") is None
    assert il.file("c-xyz") is None
    assert il.file("arnica-montana") is not None
    assert media.media_file("cu-../../x") is None
