"""Preprocessing invariants for SFE-GAT (data, PSD features, PLV graph, cache)."""

import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sfegat import data, graph, preprocess  # noqa: E402

FS = 250
HAVE_DATA = os.path.isfile(data.mat_path(1, "T"))
needs_data = pytest.mark.skipif(not HAVE_DATA, reason="BNCI .mat files not present")


@pytest.fixture(scope="module")
def a01t():
    return data.load_subject(1, "T")


# ----------------------------------------------------------------------- data

@needs_data
@pytest.mark.parametrize("subject", data.SUBJECTS)
@pytest.mark.parametrize("session", data.SESSIONS)
def test_288_trials_72_per_class(subject, session):
    X, y, meta = data.load_subject(subject, session)
    assert X.shape == (288, 22, 1000)
    assert X.dtype == np.float64
    assert y.dtype == np.int64
    assert np.bincount(y, minlength=4).tolist() == [72, 72, 72, 72]
    assert np.isfinite(X).all()
    # units: microvolts -> median per-trial SD in a plausible EEG range
    assert 2.0 < np.median(X.std(-1)) < 60.0
    assert meta["fs"] == FS and len(meta["channels"]) == 22
    assert meta["artifact"].shape == (288,)


@needs_data
def test_window_is_exact_slice(a01t):
    from scipy.io import loadmat
    X, y, meta = a01t
    runs = np.atleast_1d(loadmat(data.mat_path(1, "T"), struct_as_record=False,
                                 squeeze_me=True)["data"])
    for k in (0, 47, 48, 287):
        run = runs[meta["run"][k]]
        s = int(np.atleast_1d(run.trial)[meta["trial_in_run"][k]]) - 1
        np.testing.assert_array_equal(X[k], run.X[s + 500:s + 1500, :22].T)
        assert y[k] == int(np.atleast_1d(run.y)[meta["trial_in_run"][k]]) - 1


def test_class_and_token_order():
    assert data.CLASSES == ("left_hand", "right_hand", "feet", "tongue")
    assert data.TOKENS == ("PREVIOUS", "NEXT", "SELECT", "BACK")
    assert data.CHANNELS[3] == "FCz" and data.CHANNELS[9] == "Cz"


def test_bad_args():
    with pytest.raises(ValueError):
        data.load_subject(10, "T")
    with pytest.raises(ValueError):
        data.load_subject(1, "X")


# ----------------------------------------------------------------------- PSD

def test_band_edges():
    b = preprocess.band_edges()
    assert len(b) == 8 and b[0] == (8.0, 12.0) and b[-1] == (36.0, 40.0)


@pytest.mark.parametrize("order,nperseg", [(4, 250), (5, 500), (4, 500), (5, 250)])
@pytest.mark.parametrize("integration", ["simpson", "trapezoid", "rect"])
def test_filterbank_psd_shape_and_sign(order, nperseg, integration):
    rng = np.random.default_rng(0)
    X = rng.standard_normal((3, 22, 1000)) * 10
    H = preprocess.filterbank_psd(X, order=order, nperseg=nperseg, integration=integration)
    assert H.shape == (3, 22, 8) and H.dtype == np.float64
    assert (H > 0).all()


@pytest.mark.parametrize("variant", ["paper", "code"])
def test_sine_power_lands_in_its_band(variant):
    p = preprocess.VARIANTS[variant]
    t = np.arange(1000) / FS
    amp = 10.0
    x = np.tile(amp * np.sin(2 * np.pi * 10.0 * t), (22, 1))[None]
    H = preprocess.filterbank_psd(x, order=p["order"], nperseg=p["nperseg"])
    assert np.argmax(H[0, 0]) == 0  # 10 Hz -> band 8-12
    # Parseval: sine power = amp^2/2; allow filter edge effects / window leakage
    assert abs(H[0, 0, 0] - amp ** 2 / 2) / (amp ** 2 / 2) < 0.2
    assert H[0, 0, 3:].max() < 1e-3 * H[0, 0, 0]


def test_2d_input_and_bad_integration():
    x = np.random.default_rng(1).standard_normal((22, 1000))
    assert preprocess.filterbank_psd(x).shape == (22, 8)
    with pytest.raises(ValueError):
        preprocess.filterbank_psd(x, integration="bogus")


# ----------------------------------------------------------------------- PLV

def _rand(n=4, seed=0):
    return np.random.default_rng(seed).standard_normal((n, 22, 1000))


def test_plv_symmetric_bounded_diag_one():
    P = graph.plv(_rand())
    assert P.shape == (4, 22, 22)
    np.testing.assert_array_equal(P, np.swapaxes(P, 1, 2))
    assert P.min() >= 0.0 and P.max() <= 1.0
    np.testing.assert_allclose(np.diagonal(P, axis1=1, axis2=2), 1.0, atol=1e-12)


def test_plv_known_values():
    t = np.arange(1000) / FS
    a = np.sin(2 * np.pi * 10 * t)
    b = np.sin(2 * np.pi * 10 * t + 1.0)  # constant phase lag -> PLV ~ 1
    noise = np.random.default_rng(3).standard_normal(1000)
    X = np.zeros((22, 1000))
    X[0], X[1], X[2] = a, b, noise
    X[3:] = np.random.default_rng(4).standard_normal((19, 1000))
    P = graph.plv(X)
    assert P.shape == (22, 22)
    assert P[0, 1] > 0.98
    assert P[0, 2] < 0.3


def test_plv_band_option():
    P = graph.plv(_rand(2), band=(8, 30))
    assert P.shape == (2, 22, 22) and P.min() >= 0 and P.max() <= 1


def test_zscore_whole_matrix_including_diagonal():
    P = graph.plv(_rand())
    Z = graph.zscore(P, zero_diag=False)
    np.testing.assert_allclose(Z.mean(axis=(1, 2)), 0.0, atol=1e-10)
    np.testing.assert_allclose(Z.std(axis=(1, 2)), 1.0, atol=1e-6)
    Z0 = graph.zscore(P)
    assert (np.diagonal(Z0, axis1=1, axis2=2) == 0).all()


@pytest.mark.parametrize("tau", [-0.5, 0.0, 0.3, 1.0])
@pytest.mark.parametrize("weighted", [True, False])
def test_threshold_invariants(tau, weighted):
    P = graph.plv(_rand())
    g = graph.zscore_threshold(P, tau=tau, weighted=weighted)
    A, M = g["A"], g["mask"]
    assert A.shape == (4, 22, 22) and M.dtype == bool
    assert (np.diagonal(A, axis1=1, axis2=2) == 0).all()
    assert not np.diagonal(M, axis1=1, axis2=2).any()
    np.testing.assert_array_equal(A, np.swapaxes(A, 1, 2))
    np.testing.assert_array_equal(M, np.swapaxes(M, 1, 2))
    assert (g["Z"][M] > tau).all()
    if not weighted:
        assert set(np.unique(A)).issubset({0.0, 1.0})
    else:
        np.testing.assert_array_equal(A[M], g["Z"][M])
    for k in range(4):
        ei = g["edge_index"][k]
        assert ei.shape == (2, int(M[k].sum())) and ei.dtype == np.int64
        assert M[k][ei[0], ei[1]].all()
        np.testing.assert_array_equal(g["edge_weight"][k], A[k][ei[0], ei[1]])


def test_threshold_monotone_in_tau():
    P = graph.plv(_rand())
    d = [graph.edge_density(graph.zscore_threshold(P, t)["mask"]).mean()
         for t in (-1, 0, 0.3, 1, 2)]
    assert all(a >= b for a, b in zip(d, d[1:]))


def test_strict_vs_inclusive():
    P = np.full((22, 22), 0.5)
    P[0, 1] = P[1, 0] = 0.9
    tau = graph.zscore(P)[0, 1]
    assert graph.zscore_threshold(P, tau=tau, strict=True)["mask"].sum() == 0
    assert graph.zscore_threshold(P, tau=tau, strict=False)["mask"].sum() == 2


def test_random_adjacency():
    R = graph.random_adjacency(5, density=0.3, seed=1)
    assert R.shape == (5, 22, 22)
    np.testing.assert_array_equal(R, np.swapaxes(R, 1, 2))
    assert not np.diagonal(R, axis1=1, axis2=2).any()
    assert 0.15 < graph.edge_density(R).mean() < 0.45


@needs_data
def test_real_plv_and_features(a01t):
    X, y, _ = a01t
    P = graph.plv(X[:16])
    assert P.min() >= 0 and P.max() <= 1
    np.testing.assert_array_equal(P, np.swapaxes(P, 1, 2))
    H = preprocess.filterbank_psd(X[:16])
    assert H.shape == (16, 22, 8) and np.isfinite(H).all() and (H > 0).all()


# ----------------------------------------------------------------------- cache

@needs_data
@pytest.mark.parametrize("variant", ["paper", "code"])
def test_cache_matches_recompute(variant):
    path = preprocess.cache_path(1, "T", variant)
    if not os.path.exists(path):
        pytest.skip("cache not built: python -m sfegat.preprocess")
    c = preprocess.load_features(1, "T", variant)
    assert c["H"].shape == (288, 22, 8) and c["H"].dtype == np.float64
    assert c["plv"].shape == (288, 22, 22) and c["plv"].dtype == np.float64
    assert np.bincount(c["y"]).tolist() == [72] * 4
    p = preprocess.VARIANTS[variant]
    assert int(c["order"]) == p["order"] and int(c["nperseg"]) == p["nperseg"]
    X, y, _ = data.load_subject(1, "T")
    idx = [0, 100, 287]
    np.testing.assert_allclose(
        c["H"][idx], preprocess.filterbank_psd(X[idx], order=p["order"], nperseg=p["nperseg"]),
        rtol=1e-12)
    np.testing.assert_allclose(c["plv"][idx], graph.plv(X[idx]), atol=1e-12)
    np.testing.assert_array_equal(c["y"], y)


def test_to_pyg_list():
    torch = pytest.importorskip("torch")
    pytest.importorskip("torch_geometric")
    P = graph.plv(_rand(3))
    g = graph.zscore_threshold(P, 0.3)
    H = preprocess.filterbank_psd(_rand(3))
    ds = graph.to_pyg_list(H, g["edge_index"], y=[0, 1, 2], edge_weight=g["edge_weight"])
    assert len(ds) == 3 and ds[0].x.shape == (22, 8) and ds[0].x.dtype == torch.float32
    assert ds[1].edge_index.shape[1] == int(g["mask"][1].sum())
    assert ds[2].y.item() == 2
