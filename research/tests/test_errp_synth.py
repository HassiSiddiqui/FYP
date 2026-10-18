"""ADR 0002 D22 (closes G7) + export format/size + Python-vs-JS reference parity on the exported files."""
import json
import os
import subprocess
import sys

import numpy as np
import pytest

RESEARCH = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RESEARCH)
from errp import export, jswrite, model  # noqa: E402

FYP = os.path.dirname(RESEARCH)
MODEL = os.path.join(FYP, "POC", "js", "data", "errp-model.js")
REPLAY = os.path.join(FYP, "POC", "js", "data", "errp-replay.js")
PARITY = os.path.join(RESEARCH, ".cache", "parity")


@pytest.fixture(scope="module")
def exported():
    if not os.path.exists(REPLAY):
        pytest.skip("errp-replay.js not exported yet")
    m = jswrite.read_js(MODEL)
    r = jswrite.read_js(REPLAY)
    if m.get("stub"):
        pytest.skip("stub model")
    return m, r


def test_sizes_and_header(exported):
    assert os.path.getsize(MODEL) <= 10 * 1024
    assert os.path.getsize(REPLAY) <= int(2.6 * 1024 * 1024)
    for p in (MODEL, REPLAY):
        with open(p, encoding="utf-8") as f:
            head = f.read(600)
        assert "GENERATED" in head.splitlines()[0]
        assert "CC BY-NC-ND 4.0" in head and "pending supervisor confirmation" in head


def test_replay_contents(exported):
    m, r = exported
    cats = [e["category"] for e in r["epochs"]]
    assert sorted(cats) == sorted(["TP", "TP", "TN", "TN", "FN", "FP", "synthetic-error", "synthetic-correct"])
    for e in r["epochs"]:
        assert len(jswrite.b64_f64(e["dataB64"])) == 64 * 922
        if e["source"] == "replay":
            assert e["session"] == 2 and e["subject"] == m["subject"]
            assert abs(e["expected"]["q"] - max(m["tStarLightSelect"], 0.181)) >= 1e-3
            assert (e["label"] == "error") == (e["category"] in ("TP", "FN"))


@pytest.mark.parametrize("pi", [0.10, 0.181, 0.36])
def test_synthetic_decisions(exported, pi):
    m, r = exported
    t = model.t_star(**m["costs"]["light-select"])
    syn = {e["category"]: e for e in r["epochs"] if e["source"] == "synthetic"}
    for cat, want in (("synthetic-error", "rollback"), ("synthetic-correct", "keep")):
        x = jswrite.b64_f64(syn[cat]["dataB64"]).reshape(64, 922)
        ref = export.run_reference(x, m, pi)
        assert ref["decision"] == want, (cat, pi, ref["q"], t)
        if cat == "synthetic-error":
            assert ref["q"] > max(t, pi)
        else:
            assert ref["q"] < t


def test_synthetic_fcz_min(exported):
    m, r = exported
    e = [e for e in r["epochs"] if e["category"] == "synthetic-error"][0]
    assert abs(e["fczMinUv"] - (-8.4)) <= 0.05


def test_js_reference_parity(exported, tmp_path):
    """Node runs the architecture §2.3 pipeline (frozen SA.dsp.sosfilt) on the shipped bytes; compare with
    the Python reference in research/.cache/parity/errp_ref.json and with every record's expected."""
    m, r = exported
    out = tmp_path / "errp_js.json"
    subprocess.run(["node", os.path.join(RESEARCH, "errp", "js_reference.js"), str(out)], check=True)
    js = {e["epochId"]: e for e in json.loads(out.read_text())["epochs"]}
    with open(os.path.join(PARITY, "errp_ref.json")) as f:
        ref = json.load(f)
    assert len(ref["epochs"]) == 3
    for e in ref["epochs"]:
        j = js[e["epochId"]]
        assert np.max(np.abs(np.array(j["features"]) - np.array(e["features"]))) <= 1e-9
        assert abs(j["score"] - e["score"]) <= 1e-6 and abs(j["q"] - e["q"]) <= 1e-6
        assert j["decision"] == e["decision"]
        assert abs(j["fczMinUv"] - e["fczMinUv"]) <= 1e-9
    for e in r["epochs"]:
        assert js[e["id"]]["decision"] == e["expected"]["decision"]
        assert abs(js[e["id"]]["q"] - e["expected"]["q"]) <= 1e-6
