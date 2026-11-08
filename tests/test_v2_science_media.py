"""Studio support: synthetic sandbox labelling, stage-series consistency, licence filtering, asset inventory."""
import json
from pathlib import Path

import numpy as np
import pytest

from backend.ethnoharvest import media, simulate as sim

ROOT = Path(__file__).resolve().parents[1]


def test_study_series_stage_vectors_sum_to_totals():
    r = sim.study_comparison("nardostachys-ghimire2008", horizon=10)
    for s in r["series"]:
        st, tot = np.array(s["trajectory"]["stages"]), np.array(s["trajectory"]["total"])
        assert st.shape == (11, 6)
        assert np.allclose(st.sum(1), tot, atol=1e-2)
    # E03 flagship: 25% treatment declines, control grows
    lam = {s["label"][:3]: s["lambda"] for s in r["series"]}
    assert lam["0% "] == pytest.approx(1.0277, abs=1e-3) and lam["25%"] < 0.95


def test_synthetic_is_labelled_and_validated():
    r = sim.synthetic(["small", "large"], [0.5, 0.9], [0.3], 1.0, horizon=5)
    assert r["synthetic"] is True and "SYNTHETIC" in r["label"]
    assert len(r["trajectory"]["total"]) == 6
    with pytest.raises(ValueError):
        sim.synthetic(["a", "b"], [1.2, 0.5], [0.3], 1.0)
    with pytest.raises(ValueError):
        sim.synthetic(["a"], [0.5], [], 1.0)


@pytest.mark.parametrize("raw,ok", [
    ("CC_BY_4_0", "CC BY 4.0"), ("CC0_1_0", "CC0"), ("http://creativecommons.org/licenses/by-sa/3.0/", "CC BY-SA 3.0"),
    ("ping sun (cc-by-sa)", "CC BY-SA (version unspecified)"), ("cc-by-nc", None),
    ("http://creativecommons.org/licenses/by-nc/4.0/", None), ("cc-by-nd", None), ("All rights reserved", None), (None, None),
])
def test_licence_filter(raw, ok):
    assert media.normalise_licence(raw)[0] == ok


def test_media_rejects_unlicensed_and_wrong_species(monkeypatch, tmp_path):
    from backend.ethnoharvest import store, taxonomy
    monkeypatch.setattr(store, "DB", tmp_path / "m.sqlite3")
    monkeypatch.setattr(media, "_init_done", False)
    monkeypatch.setattr(media, "MEDIA_DIR", tmp_path / "media")
    monkeypatch.setattr(media, "CURATED_DIR", tmp_path / "curated")  # the hand-picked tier would answer first
    monkeypatch.setattr(taxonomy, "resolve", lambda n: {"accepted": n, "status": "ACCEPTED"})
    cands = [{"source": "x", "licence_raw": "cc-by-nc", "image_url": "https://a/1.jpg", "matched_name": "Prunus africana"},
             {"source": "x", "licence_raw": "CC_BY_4_0", "image_url": "https://a/2.jpg", "matched_name": "Prunus avium"}]
    monkeypatch.setattr(media, "PROVIDERS", [("Stub", lambda n: cands)])
    monkeypatch.setattr(media, "_download", lambda u: pytest.fail("must not download a rejected candidate"))
    r = media.species_image("Prunus africana")
    assert r["status"] == "none" and "2 candidates rejected" in r["reason"]


def test_media_file_rejects_path_tricks():
    assert media.media_file("../../etc/passwd") is None
    assert media.media_file("m_zz") is None


def test_asset_inventory_covers_every_model():
    inv = json.loads((ROOT / "frontend/src/data/plant-assets.generated.json").read_text(encoding="utf-8"))
    glbs = list((ROOT / "Plants").glob("*.glb"))
    assert len([a for a in inv["assets"] if not a["derived_from"]]) == len(glbs)
    # project-authored models (Plants New/): compressed web copies, one per source GLB
    project = [a for a in inv["assets"] if a.get("kind") in ("species", "generic")]
    assert {a["source_file"] for a in project} == {f"Plants New/{p.relative_to(ROOT / 'Plants New').as_posix()}" for p in (ROOT / "Plants New").rglob("*.glb")}
    for a in inv["assets"]:
        assert a["status"] == "ok", a
        assert (ROOT / "frontend/public" / a["file"]).exists()
        assert a["height"] > 0 and a["triangles"] > 0
        if a in project:
            assert a["licence"]["licence"] == "Project asset (AI-generated)" and "illustration" in a["licence"]["attribution"]
        else:
            assert a["licence"] and a["licence"]["source_url"].startswith("https://poly.pizza/")


def test_media_never_shows_a_photo_for_a_higher_taxon(monkeypatch, tmp_path):
    from backend.ethnoharvest import store, taxonomy
    monkeypatch.setattr(store, "DB", tmp_path / "m.sqlite3")
    monkeypatch.setattr(media, "_init_done", False)
    monkeypatch.setattr(media, "MEDIA_DIR", tmp_path / "media")
    monkeypatch.setattr(taxonomy, "resolve", lambda n: {"accepted": "Plantae", "status": "HIGHERRANK"})
    monkeypatch.setattr(media, "PROVIDERS", [("Stub", lambda n: pytest.fail("must not query providers for a higher taxon"))])
    assert media.species_image("Plantago imaginaria")["status"] == "none"
    assert not media._same_species("Plantae", "Plantae")
