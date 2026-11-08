import numpy as np
import pytest

from backend.ethnoharvest import demography as d


def test_two_stage_analytic_lambda():
    A = np.array([[0.5, 2.0], [0.5, 0.0]])
    # characteristic polynomial: l^2 - 0.5 l - 1 = 0
    expected = (0.5 + np.sqrt(0.25 + 4)) / 2
    assert d.eig_analysis(A)["lambda"] == pytest.approx(expected, abs=1e-12)
    assert d.lambda_power(A) == pytest.approx(expected, abs=1e-9)


def test_leslie_stable_stage_analytic():
    A = np.array([[0.0, 1.0, 5.0], [0.5, 0.0, 0.0], [0.0, 0.4, 0.0]])
    e = d.eig_analysis(A)
    lam, w = e["lambda"], e["stable_stage"]
    # Euler-Lotka: 1 = sum l_x m_x lam^-x  with l1=.5, l2=.2
    assert 0.5 * 1 / lam ** 2 + 0.2 * 5 / lam ** 3 == pytest.approx(1, abs=1e-10)
    assert np.allclose(A @ w, lam * w, atol=1e-10)
    assert w.sum() == pytest.approx(1)


def test_elasticities_sum_to_one_and_sensitivity_matches_numeric_derivative():
    rng = np.random.default_rng(0)
    U = rng.uniform(0, 0.3, (4, 4))
    F = np.zeros((4, 4)); F[0, 2:] = [3.0, 6.0]
    A = U + F
    assert d.elasticity(A).sum() == pytest.approx(1, abs=1e-10)
    S = d.sensitivity(A)
    h = 1e-7
    for i, j in [(0, 3), (2, 1), (3, 3)]:
        Ah = A.copy(); Ah[i, j] += h
        num = (d.eig_analysis(Ah)["lambda"] - d.eig_analysis(A)["lambda"]) / h
        assert S[i, j] == pytest.approx(num, rel=1e-4)
    proc = d.elasticity_by_process(A, U, F)
    assert sum(proc.values()) == pytest.approx(1, abs=1e-9)


@pytest.mark.parametrize("A,msg", [
    (np.array([[0.5, np.nan], [0.2, 0.1]]), "NA"),
    (np.array([[0.5, -0.1], [0.2, 0.1]]), "negative"),
    (np.zeros((3, 3)), "all zeros"),
    (np.ones((2, 3)), "square"),
])
def test_invalid_matrices_rejected(A, msg):
    v = d.validate(A)
    assert not v.ok and any(msg in e for e in v.errors)


def test_survival_above_one_rejected():
    U = np.array([[0.7, 0.0], [0.6, 0.9]])
    v = d.validate(U, U, np.zeros((2, 2)), np.zeros((2, 2)))
    assert not v.ok and "survival > 1" in v.errors[0]


def test_reducible_and_imprimitive_flagged():
    red = np.array([[0.5, 0.0], [0.3, 0.9]])
    assert d.validate(red).irreducible is False
    imp = np.array([[0.0, 2.0], [0.5, 0.0]])
    v = d.validate(imp)
    assert v.irreducible and v.primitive is False


def test_projection_matches_lambda_asymptotically():
    A = np.array([[0.2, 1.5, 3.0], [0.4, 0.5, 0.0], [0.0, 0.3, 0.8]])
    traj = d.project(A, np.array([10, 5, 1]), 300)
    assert traj[-1].sum() / traj[-2].sum() == pytest.approx(d.eig_analysis(A)["lambda"], rel=1e-8)


def test_ltre_contributions_approximate_delta_lambda():
    A = np.array([[0.2, 1.5, 3.0], [0.4, 0.5, 0.0], [0.0, 0.3, 0.8]])
    B = A * np.array([[1, .9, .9], [1, .95, 1], [1, .95, .9]])
    r = d.ltre_fixed(B, A)
    assert abs(r["approximation_error"]) < 0.05 * abs(r["observed_delta_lambda"])


def test_stochastic_lambda_seeded_and_close_to_small_noise_approx():
    A1 = np.array([[0.2, 1.5, 3.0], [0.4, 0.5, 0.0], [0.0, 0.3, 0.8]])
    A2 = A1 * 0.95
    r1 = d.stochastic_lambda([A1, A2], years=20000, seed=7)
    r2 = d.stochastic_lambda([A1, A2], years=20000, seed=7)
    assert r1 == r2
    assert r1["lambda_s"] == pytest.approx(r1["tuljapurkar_approx_lambda_s"], rel=2e-3)
    assert r1["lambda_s"] < r1["lambda_mean_matrix"] + 1e-6


def test_periodic_lambda_rotation_one_equals_harvest_matrix():
    A = np.array([[0.2, 1.5], [0.4, 0.5]])
    H = A * 0.7
    assert d.periodic_lambda(H, A, 1) == pytest.approx(d.eig_analysis(H)["lambda"])
    # longer rest periods move the annualised rate toward the control lambda
    l2, l10 = d.periodic_lambda(H, A, 2), d.periodic_lambda(H, A, 10)
    assert d.eig_analysis(H)["lambda"] < l2 < l10 < d.eig_analysis(A)["lambda"]


def test_hypothetical_removal_reduces_lambda_monotonically():
    U = np.array([[0.3, 0.0, 0.0], [0.3, 0.6, 0.0], [0.0, 0.2, 0.9]])
    F = np.zeros((3, 3)); F[0, 2] = 2.0
    lams = [d.eig_analysis(d.hypothetical_removal(U, F, None, [2], f))["lambda"] for f in (0, .1, .3, .6)]
    assert lams == sorted(lams, reverse=True)
    with pytest.raises(ValueError):
        d.hypothetical_removal(U, F, None, [2], 1.0)
