"""WCVP (POWO) + WFO name check and native range: precomputed table and region verdicts."""
import pytest

from backend.ethnoharvest import checklists as c

pytestmark = pytest.mark.skipif(not c.FILE.exists(), reason="run scripts/checklists.py first")


def test_table_counts_and_sources():
    m = c.meta()
    assert m["counts"]["species"] >= 800 and m["counts"]["wcvp_matched"] > 700
    assert m["sources"]["wcvp"]["licence"] == "CC BY 3.0"


def test_species_record():
    s = c.species("Nardostachys jatamansi")
    assert s["wcvp"]["status"] == "accepted" and "NEP" in s["wcvp"]["native_l3"]
    assert s["wfo"]["wfo_id"] == "wfo-0000381007" and s["agree"] is True


def test_region_verdicts():
    assert c.region_overlap("Nardostachys jatamansi", [85.0, 27.5, 86.0, 28.5])["verdict"] == "native"
    far = c.region_overlap("Nardostachys jatamansi", [9, 50, 10, 51])
    assert far["verdict"] == "not recorded" and "not proof of absence" in far["note"]


def test_unknown_is_not_absent():
    # non-vascular (seaweed) is outside WCVP: reported unavailable, never "not native"
    assert c.region_overlap("Fucus vesiculosus", [9, 50, 10, 51])["status"] == "unavailable"
    assert c.species("Madeupus plantus") is None
