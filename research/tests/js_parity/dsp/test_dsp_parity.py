"""pytest: browser DSP (POC/js/dsp) parity with scipy, float64, tol 1e-9.

Regenerates the scipy reference JSON, runs the Node checker, and asserts
it reports zero failures. Skipped if `node` is not on PATH.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
FYP = HERE.parents[3]
REF = FYP / "research" / ".cache" / "parity" / "dsp_reference.json"
REPORT = REF.parent / "dsp_parity_report.json"


@pytest.mark.skipif(shutil.which("node") is None, reason="node not available")
def test_dsp_parity_with_scipy():
    subprocess.run([sys.executable, str(HERE / "gen_dsp_reference.py")], check=True)
    proc = subprocess.run(["node", str(HERE / "run_dsp_parity.js"), str(REF), "--tol", "1e-9"],
                          capture_output=True, text=True)
    print(proc.stdout)
    report = json.loads(REPORT.read_text(encoding="utf-8"))
    failed = [r for r in report["results"] if not r["ok"]]
    assert proc.returncode == 0 and not failed, failed
    assert report["worstRelScale"] <= 1e-9
    assert report["worstMaxAbs"] <= 1e-9
