"""Harvest Evidence Agent: grounding, triage policy, matrix computation and fallbacks (providers mocked, no network)."""
import pytest

from backend.ethnoharvest import evidence_agent as E, providers as pv
from backend.ethnoharvest.ops import cautions as C

ABS = ("We stripped bark from Prunus africana trees in Cameroon. Bark harvest reduced survival of large trees and "
       "slowed growth over five years.")
RECS = [
    {"id": "W1", "doi": "10.1/a", "title": "Bark harvest of Prunus africana and tree survival", "abstract": ABS, "url": "u1"},
    {"id": "W2", "doi": "10.1/b", "title": "Phytochemical profile of Prunus africana bark", "abstract":
        "HPLC analysis of extract compounds and antioxidant activity in vitro from stem bark samples collected in markets.", "url": "u2"},
    {"id": "W3", "doi": "10.1/c", "title": "A note on trees", "abstract": "Trees in montane forest were described briefly by visitors to the area.", "url": "u3"},
]


def fake_jev(choices):
    def f(state, instructions, criteria, simulate_low_confidence=False):
        title = state.get("title", "")
        for key, (choice, conf) in choices.items():
            if key in title or key in state.get("finding", ""):
                return {"choice": choice, "confidence": conf, "probabilities": None, "model": "jev-test", "latency_ms": 1.0,
                        "accepted": conf >= 0.85, "threshold": 0.85}
        return {"choice": list(criteria)[0], "confidence": 0.5, "probabilities": None, "model": "jev-test", "latency_ms": 1.0,
                "accepted": False, "threshold": 0.85}
    return f


def test_triage_policy_agree_override_and_disagreement(monkeypatch):
    monkeypatch.setattr(pv, "jev_choice", fake_jev({
        "Bark harvest": ("harvest_effect_same_species", 0.6),   # agrees with rules, low confidence -> kept
        "Phytochemical": ("other_topic", 0.97),                  # rules say other_topic too -> kept
        "A note": ("harvest_effect_same_species", 0.5),          # rules say needs_human, JEV unsure -> needs_human
    }))
    t = E.jev_triage(RECS, "Prunus africana", "bark", [], None, set())
    final = {it["id"]: it["final"] for it in t["items"]}
    assert final == {"W1": "harvest_effect_same_species", "W2": "other_topic", "W3": "needs_human"}
    assert t["jev_calls"] == 3


def test_confident_jev_overrides_keyword_rule(monkeypatch):
    monkeypatch.setattr(pv, "jev_choice", fake_jev({"Phytochemical": ("harvest_effect_same_species", 0.95)}))
    t = E.jev_triage(RECS[1:2], "Prunus africana", "bark", [], None, set())
    assert t["items"][0]["final"] == "harvest_effect_same_species" and t["items"][0]["basis"].startswith("JEV (confident)")


def test_jev_unavailable_falls_back_to_rules(monkeypatch):
    def boom(*a, **k):
        raise pv.ProviderError("JEV key not configured")
    monkeypatch.setattr(pv, "jev_choice", boom)
    t = E.jev_triage(RECS, "Prunus africana", "bark", [], None, set())
    assert not t["jev_used"] and t["mode"].startswith("rule baseline")
    assert {it["final"] for it in t["items"]} <= set(E.TRIAGE)


def test_claims_without_a_verbatim_quote_are_dropped(monkeypatch):
    monkeypatch.setattr(E.os, "environ", {**E.os.environ, "OPS_LLM_EXTRACTION": "1"})

    def groq(system, user, hint, max_tokens=900):
        return {"model": "groq-test", "data": {"claims": [
            {"record_id": "W1", "plant_part": "bark", "harvest_type": "stripping", "affected_process": "survival",
             "direction": "decrease", "quote": "Bark harvest reduced survival of large trees"},
            {"record_id": "W1", "plant_part": "bark", "harvest_type": "stripping", "affected_process": "population",
             "direction": "decrease", "quote": "the population collapsed by 80 percent"},  # not in the abstract
        ]}}
    monkeypatch.setattr(pv, "llm_json", groq)
    tri = {"items": [{"id": "W1", "final": "harvest_effect_same_species"}]}
    out = E.extract_claims(RECS, tri, "bark", set())
    assert len(out["claims"]) == 1 and out["dropped"] == 1
    assert out["claims"][0]["quote"] in ABS


def test_matrix_sensitivity_differs_by_plant_part_and_is_deterministic():
    rh = E.matrix_sensitivity("Nardostachys jatamansi", "rhizome")
    bark = E.matrix_sensitivity("Prunus africana", "bark")
    leaf = E.matrix_sensitivity("Khaya senegalensis", "leaf")
    resin = E.matrix_sensitivity("Boswellia papyrifera", "resin (stem tapping)")
    assert {rh["process"], bark["process"], leaf["process"], resin["process"]} == {
        "survival", "survival and growth of established plants", "growth", "reproduction"}
    for s in (rh, bark, leaf, resin):
        assert s["status"] == "ok" and 0 <= s["share_ci95"][0] <= s["share_mean"] <= s["share_ci95"][1] <= 1
    assert E.matrix_sensitivity("Prunus africana", "bark")["share_ci95"] == bark["share_ci95"]  # seeded bootstrap
    assert leaf["share_mean"] < 0.2 < rh["share_mean"]


def test_species_without_matrices_uses_labelled_transfer_or_reports_none():
    s = E.matrix_sensitivity("Plantago imaginaria", "bark")
    assert s["status"] == "ok" and s["basis"].startswith("transferred") and "Prunus africana" in s["species_used"]
    assert "Colchicum autumnale" in E.matrix_sensitivity("Plantago imaginaria", "flower")["species_used"]  # flower-removal study
    assert E.matrix_sensitivity("Plantago imaginaria", "seed")["status"] == "no-matrices"


def test_treatment_classes_keep_non_harvest_manipulations_out_of_the_harvest_contrast():
    assert [E.treatment_class(t) for t in ("Early May cut", "Tapped", "Unmanipulated + High Harvest", "Flower removal", "Ring-barking entire circumference", "Felling tree to 1 m after fruit production")] == ["harvested"] * 6
    assert [E.treatment_class(t) for t in ("Unmanipulated", "Unmanipualted", "nan")] == ["unharvested"] * 3
    assert [E.treatment_class(t) for t in ("Grazing", "Protected", "Mown", "Shrub removal", "Mistletoe cover")] == ["other"] * 5


def test_full_run_offline_produces_cards_without_rates(monkeypatch):
    monkeypatch.setattr(E, "retrieve", lambda qs, anchors, cap=40, sources=(): {"records": RECS, "retrieved": 3, "without_abstract": 0,
                                                                     "per_query": [], "errors": [], "anchors_found": 0, "latency_ms": 1})
    monkeypatch.setattr(pv, "jev_choice", fake_jev({"Bark harvest": ("harvest_effect_same_species", 0.9),
                                                    "Phytochemical": ("other_topic", 0.9)}))
    monkeypatch.setattr(pv, "llm_json", lambda *a, **k: {"model": "g", "data": {"claims": [
        {"record_id": "W1", "plant_part": "bark", "harvest_type": "stripping", "affected_process": "survival", "direction": "decrease",
         "quote": "Bark harvest reduced survival of large trees"}]}})
    monkeypatch.setenv("OPS_LITERATURE", "1")
    monkeypatch.setenv("OPS_LLM_EXTRACTION", "1")
    r = E.run("Prunus africana", "bark")
    kinds = {f.get("computed", False) for f in r["findings"]}
    assert kinds == {True, False}
    cards = C.agent_cards(r, "bark")
    assert any(c["evidence_kind"] == "ai-found-literature" and c["sources"][0]["excerpt"] in ABS for c in cards)
    assert any(c["evidence_kind"] == "computed-from-matrices" for c in cards)
    text = " ".join(c["issue"] + c["why_it_matters"] + c["recommended_next"] for c in cards).lower()
    for banned in ("safe harvest rate is", "quota of", "you may harvest", "sustainable rate of"):
        assert banned not in text
    # JEV can only make review routing stricter than the rules
    for f in r["findings"]:
        rank = list(E.REVIEW)
        assert rank.index(f["review"]) >= rank.index(E.rule_review(f))


@pytest.mark.parametrize("sp,organ,part", [("Nardostachys jatamansi", "rhizome", "rhizome"), ("Prunus africana", "bark", "bark")])
def test_query_plan_is_species_and_part_specific(sp, organ, part):
    qs = E.query_plan(sp, organ, [])
    assert qs[0].startswith(sp) and any(part in q for q in qs) and len(qs) <= 8


def test_pipeline_normalisation_keeps_required_and_drops_unmet_needs():
    pipe, notes = E.normalise_pipeline(["claim_verify", "bogus"])
    assert {"query_plan", "retrieve", "search_openalex"} <= set(pipe) and "claim_verify" not in pipe
    assert any("needs Extract quoted findings" in n for n in notes) and any("bogus" in n for n in notes)
    assert E.normalise_pipeline(None)[0] == E.DEFAULT_PIPELINE
    parents = E.graph_parents(pipe)
    assert all(p in set(pipe) | {"taxonomy_match"} for ps in parents.values() for p in ps)


def test_removing_jev_uses_rules_and_skips_routing(monkeypatch):
    called = []
    monkeypatch.setattr(pv, "jev_choice", lambda *a, **k: called.append(1))
    monkeypatch.setattr(E, "retrieve", lambda qs, anchors, cap=40, sources=(): {"records": RECS, "retrieved": 3, "without_abstract": 0,
                                                                                 "per_query": [], "errors": [], "anchors_found": 0, "latency_ms": 1})
    monkeypatch.setenv("OPS_LITERATURE", "1")
    r = E.run("Prunus africana", "bark", pipeline=["search_openalex", "matrix_sensitivity"])
    assert not called and r["triage"]["mode"].startswith("rule baseline")
    assert all(f["review_by"].startswith("rules") for f in r["findings"])
    assert r["stochastic"] is None and r["sensitivity"]["status"] == "ok"


def test_second_model_check_removes_unsupported_claims(monkeypatch):
    claims = [{"direction": "decrease", "affected_process": "survival", "plant_part": "bark", "quote": "a"},
              {"direction": "increase", "affected_process": "growth", "plant_part": "bark", "quote": "b"}]
    monkeypatch.setattr(pv, "llm_json", lambda *a, **k: {"model": "gemini:test", "data": {"verdicts": [
        {"i": 0, "supports": "yes", "why": "explicit"}, {"i": 1, "supports": "no", "why": "quote says nothing about growth"}]}})
    out = E.claim_verify(claims, set())
    assert out["rejected"] == 1 and len(out["claims"]) == 1 and out["claims"][0]["verified"] == "yes"


def test_stochastic_lambda_by_group_is_reported_per_treatment():
    s = E.stochastic_by_group("Prunus africana", "bark", years=3000)
    assert s["status"] == "ok" and {"harvested", "unharvested"} <= set(s["groups"])
    assert all(0.5 < g["stochastic_lambda"] < 1.5 for g in s["groups"].values() if "stochastic_lambda" in g)


def test_llm_json_falls_back_to_gemini(monkeypatch):
    def groq_fail(*a, **k):
        raise pv.ProviderError("Groq HTTP 429 rate_limit_exceeded")
    monkeypatch.setattr(pv, "groq_json", groq_fail)
    monkeypatch.setattr(pv, "gemini_json", lambda *a, **k: {"data": {"ok": True}, "model": "gemini:test", "provider": "gemini"})
    r = pv.llm_json("s", "u", "{}")
    assert r["provider"] == "gemini" and "429" in r["fallback_from"][0]


def test_same_species_label_requires_the_record_to_name_the_species():
    assert not E.names_species({"title": "Recovery of goldenseal after harvest", "abstract": "Hydrastis canadensis stems"}, "Panax quinquefolius", [])
    assert E.names_species({"title": "x", "abstract": "American ginseng (P. quinquefolius) roots"}, "Panax quinquefolius", [])
    assert E.names_species({"title": "Nardostachys grandiflora harvest", "abstract": ""}, "Nardostachys jatamansi", ["Nardostachys grandiflora"])


def test_harvest_contrasts_are_within_study_and_stochastic_prefers_single_years():
    # Echinacea: 43 unharvested matrices come from other studies; only the Hurlburt study pairs both groups.
    s = E.matrix_sensitivity("Echinacea angustifolia", "root")
    assert s["groups"]["unharvested"]["matrices"] == 7 and s["groups_basis"].startswith("within-study: 1 study")
    st = E.stochastic_by_group("Echinacea angustifolia", "root", years=2000)
    assert st["studies"] == ["Hurlburt 1999"] and st["groups"]["harvested"]["matrix_kind"] == "single-year matrices"
    # Carapa: every matrix in the harvest study is 'Harvesting'; no within-study control, so no contrast.
    assert E.matrix_sensitivity("Carapa guianensis", "seed")["groups"] == {}


def test_claim_about_another_species_in_a_shared_abstract_is_not_same_species():
    assert E.same_taxon("", "Panax quinquefolius") and E.same_taxon("Panax quinquefolius L.", "Panax quinquefolius")
    assert E.same_taxon("P. quinquefolius", "Panax quinquefolius")
    assert not E.same_taxon("Hydrastis canadensis", "Panax quinquefolius") and not E.same_taxon("Panax ginseng", "Panax quinquefolius")
    triage = {"items": [{"id": "r1", "final": "harvest_effect_same_species", "confidence": 0.9}]}
    claims = [{"record_id": "r1", "species": "Hydrastis canadensis", "plant_part": "rhizome", "harvest_type": "harvest",
               "affected_process": "population", "direction": "increase", "quote": "a goldenseal population recovered to 932 stems"}]
    f = E.compose("Panax quinquefolius", "root", triage, claims, {"status": "none"}, {"flags": []})
    assert f[0]["scope"] == "other-species"


def test_context_nodes_are_opt_in_and_reuse_the_engines(monkeypatch):
    monkeypatch.setenv("OPS_LITERATURE", "0")
    assert not set(E.CONTEXT_IDS) & set(E.DEFAULT_PIPELINE)
    r = E.run("Nardostachys jatamansi", "rhizome", pipeline=["search_openalex", *E.CONTEXT_IDS])
    ctx = r["context"]
    assert set(ctx) == set(E.CONTEXT_IDS)
    assert ctx["harvest_compare"]["studies"][0]["harvested_lambda"] < ctx["harvest_compare"]["studies"][0]["control_lambda"]
    assert ctx["recovery_rotation"]["cycles"][0]["rest_years"] == 0 and "not a rotation schedule" in ctx["recovery_rotation"]["caveat"]
    assert "Valeriana jatamansi" in ctx["identity_check"]["lookalikes"]
    assert ctx["evidence_gaps"]["next_steps"] and all(s["why"] for s in ctx["evidence_gaps"]["next_steps"])
    assert E.graph_parents(["recovery_rotation", "harvest_compare"])["recovery_rotation"] == ["harvest_compare"]
