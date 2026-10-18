"""ADR 0002 D2/D3 dataset invariants and the label trap (events 5/10 correct, 6/9 error)."""
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from errp import cache, data  # noqa: E402

CFG = data.load_config()
HAVE_DATA = os.path.isfile(data.mat_path(1, 1, CFG))
pytestmark = pytest.mark.skipif(not HAVE_DATA, reason="BNCI 013-2015 .mat dataset not present in CI environment")


def test_mat_files_are_v5_not_v73():
    with open(data.mat_path(1, 1, CFG), "rb") as f:
        head = f.read(116)
    assert head.startswith(b"MATLAB 5.0 MAT-file")
    assert b"7.3" not in head


@pytest.fixture(scope="module")
def s01s1():
    return data.load_session(1, 1, CFG)


def test_shape_and_channels(s01s1):
    X = s01s1["X"]
    assert X.shape[1:] == (64, 922)
    assert len(s01s1["channels"]) == 64 and "Status" not in s01s1["channels"]
    for ch in ("FCz", "Cz", "Fz", "FC1", "FC2", "C1", "C2", "CPz"):
        assert ch in s01s1["channels"]
    assert s01s1["fs"] == 512


def test_only_target_codes_epoched_and_label_trap(s01s1):
    typ, y = s01s1["typ"], s01s1["y"]
    assert set(np.unique(typ)) <= {5, 6, 9, 10}
    assert np.all(y[np.isin(typ, [6, 9])] == 1)
    assert np.all(y[np.isin(typ, [5, 10])] == 0)
    # count of epochs equals the raw count of codes 5/6/9/10 (no segment dropped)
    c = s01s1["codes"]
    assert len(y) == sum(c.get(k, 0) for k in (5, 6, 9, 10))
    # trap direction check: the error class is the MINORITY (~20 % error rate paradigm)
    assert y.mean() < 0.5


def test_one_based_event_positions(s01s1):
    eeg, typ, pos0, labels, fs = data.load_runs(1, 1, CFG)[0]
    m = __import__("scipy.io", fromlist=["loadmat"]).loadmat(
        data.mat_path(1, 1, CFG), squeeze_me=True, struct_as_record=False)
    raw_pos = np.atleast_1d(m["run"][0].header.EVENT.POS)
    assert np.array_equal(pos0, raw_pos.astype(np.int64) - 1)


@pytest.mark.parametrize("s", CFG["subjects"])
@pytest.mark.parametrize("ses", [1, 2])
def test_error_fraction_in_band(s, ses):
    if not os.path.exists(cache.cache_path(s, ses)):
        cache.build(CFG)
    d = cache.load(s, ses)
    assert 0.15 <= d["y"].mean() <= 0.30
    assert d["F"].shape == (len(d["y"]), 72)
    assert set(np.unique(d["typ"])) <= {5, 6, 9, 10}
    assert np.array_equal(d["y"], np.isin(d["typ"], [6, 9]).astype(int))
