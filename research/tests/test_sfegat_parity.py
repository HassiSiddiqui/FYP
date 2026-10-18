"""JS (POC/js/eeg + dsp, under Node) vs Python float64 reference — ADR-0001 D23/D24/D27.

Reference: research/.cache/parity/sfegat_reference.npz + mi_replay_f32.npy, written by
``python -m export.mi_replay`` / ``export.run_all`` / ``export.stubs`` together with
POC/js/data/mi-replay.js (so they always describe the same records).
Runner:    node research/export/node_runner.js sfegat <in.json> <out.json>

Tolerances (relative = against max|ref|): DSP stages P, Z, H rel <= 1e-9; edge sets
identical; P_e abs <= 1e-9; post-BN node features rel <= 1e-9; logits abs <= 1e-4 (gate,
expected ~1e-9); temperature-scaled softmax abs <= 1e-6; butter design vs exported SOS
<= 1e-12.
"""
import json
import os
import shutil
import subprocess

import numpy as np
import pytest

RESEARCH = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(RESEARCH)
PARITY = os.path.join(RESEARCH, ".cache", "parity")
REF = os.path.join(PARITY, "sfegat_reference.npz")
RUNNER = os.path.join(RESEARCH, "export", "node_runner.js")

NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None or not os.path.isfile(REF),
                                reason="node or parity reference missing (run python -m export.stubs)")

REL = {"P": 1e-9, "Z": 1e-9, "H": 1e-9, "h0": 1e-9, "h1": 1e-9, "h2": 1e-9, "h3": 1e-9,
       "z1": 1e-9, "z2": 1e-9, "z3": 1e-9, "cls": 1e-9}
ABS_P = 1e-9
LOGIT_GATE = 1e-4
PROB_CAL = 1e-6


@pytest.fixture(scope="module")
def js():
    inp = os.path.join(PARITY, "runner_in.json")
    out = os.path.join(PARITY, "runner_out.json")
    with open(inp, "w") as f:
        json.dump({"records": None, "stages": True}, f)
    p = subprocess.run([NODE, RUNNER, "sfegat", inp, out], capture_output=True, text=True, timeout=300)
    with open(out) as f:
        o = json.load(f)
    if o.get("error", "").startswith("SA.eeg.sfegat"):
        pytest.skip(o["error"])
    assert p.returncode == 0, p.stdout + p.stderr
    return o


@pytest.fixture(scope="module")
def ref():
    z = np.load(REF, allow_pickle=False)
    return {k: z[k] for k in z.files}


def _rel(a, b):
    a, b = np.asarray(a, dtype=np.float64).ravel(), np.asarray(b, dtype=np.float64).ravel()
    assert a.shape == b.shape, (a.shape, b.shape)
    s = max(np.max(np.abs(b)), 1e-300)
    return float(np.max(np.abs(a - b)) / s)


def test_reference_matches_exported_records(js, ref):
    ids = [str(i) for i in ref["ids"]]
    assert [r["id"] for r in js["records"]] == ids, "reference npz is stale vs mi-replay.js"
    assert all(r["shaOk"] for r in js["records"]), "decoded JS samples != exported float32 bytes"


def test_butter_design_matches_exported_sos(js):
    assert js["butterMaxAbsDiff"] is not None and js["butterMaxAbsDiff"] <= 1e-12


def test_stage_parity(js, ref):
    worst = {}
    for k, r in enumerate(js["records"]):
        st = r["stages"]
        for name, tol in REL.items():
            key = "%d/%s" % (k, name)
            if key not in ref or name not in st:
                continue
            e = _rel(st[name], ref[key])
            worst[name] = max(worst.get(name, 0.0), e)
            assert e <= tol, "%s %s rel err %.3g > %.0e" % (r["id"], name, e, tol)
        for b in (1, 2, 3):
            pk = "p%d" % b
            if pk in st:
                e = float(np.max(np.abs(np.asarray(st[pk]) - ref["%d/%s" % (k, pk)]))) if len(st[pk]) else 0.0
                worst[pk] = max(worst.get(pk, 0.0), e)
                assert e <= ABS_P, "%s %s abs err %.3g" % (r["id"], pk, e)
    print("worst stage errors:", json.dumps(worst))
    assert {"P", "Z", "H"} <= set(worst), "JS did not expose P/Z/H stages"


def test_edge_sets_identical(js, ref):
    for k, r in enumerate(js["records"]):
        assert r["edgeCounts"] == [int(ref["%d/A%d" % (k, g)].shape[1]) for g in range(4)], r["id"]
        for g, gr in enumerate(r["graphs"]):
            A = ref["%d/A%d" % (k, g)]
            assert gr["src"] == A[0].tolist() and gr["dst"] == A[1].tolist(), "%s A%d" % (r["id"], g)
            assert np.max(np.abs(np.asarray(gr["w"]) - ref["%d/A%dw" % (k, g)]), initial=0.0) <= 1e-9
        # edges never increase through the evolution blocks
        assert all(a >= b for a, b in zip(r["edgeCounts"], r["edgeCounts"][1:]))


def test_logits_and_probs(js, ref):
    worst = 0.0
    for k, r in enumerate(js["records"]):
        d = float(np.max(np.abs(np.asarray(r["logits"]) - ref["%d/logits" % k])))
        worst = max(worst, d)
        assert d <= LOGIT_GATE, "%s logits abs err %.3g" % (r["id"], d)
        assert int(np.argmax(r["logits"])) == int(np.argmax(ref["%d/logits" % k]))
        if "%d/probsCal" % k in ref:
            assert r["probsCal"] is not None and r["calibrated"] is True
            assert np.max(np.abs(np.asarray(r["probsCal"]) - ref["%d/probsCal" % k])) <= PROB_CAL
        else:
            assert r["probsCal"] is None and r["calibrated"] is False
    print("worst logit abs err: %.3g" % worst)


def test_expected_in_data_file_matches_js(js):
    """What the in-page selftest eeg/exemplar-matches-expected checks, done here in Node."""
    import re
    path = os.path.join(ROOT, "POC", "js", "data", "mi-replay.js")
    txt = open(path, encoding="utf-8").read()
    exp = {m.group(1): json.loads(m.group(2)) for m in
           re.finditer(r'"id": "(A01E-t\d+)".*?"expected": (\{.*?\]\})', txt)}
    for r in js["records"]:
        e = exp[r["id"]]
        assert np.max(np.abs(np.asarray(r["probs"]) - np.asarray(e["probs"]))) <= 1e-4
