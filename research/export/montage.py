"""Export the 22-electrode montage -> POC/js/data/montage-data.js (architecture §7.4, ADR-0004 D34).

Positions come from MNE ``make_standard_montage("colin27_1005")`` (head coordinates).
2-D layout: azimuthal-equidistant projection about the vertex (+z) of the head-frame
origin, polar angle 90 deg -> radius 1 (the head circle), +y = nose, +x = right ear.

    .venv/Scripts/python.exe -m export.montage
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
RESEARCH = os.path.dirname(HERE)
ROOT = os.path.dirname(RESEARCH)
if RESEARCH not in sys.path:
    sys.path.insert(0, RESEARCH)

from export import jsdata  # noqa: E402

OUT = os.path.join(ROOT, "POC", "js", "data", "montage-data.js")
CAP_BYTES = 16_000


def build():
    import mne
    from sfegat.data import CHANNELS
    mont = mne.channels.make_standard_montage("colin27_1005")
    pos = mont.get_positions()["ch_pos"]
    chans = []
    for k, name in enumerate(CHANNELS, 1):
        x, y, z = (float(v) for v in pos[name])
        r = np.sqrt(x * x + y * y + z * z)
        polar = np.arccos(np.clip(z / r, -1.0, 1.0))  # angle from vertex
        az = np.arctan2(y, x)
        rho = polar / (np.pi / 2)
        chans.append({"name": name, "paperIdx": k,
                      "x": round(float(rho * np.cos(az)), 6), "y": round(float(rho * np.sin(az)), 6),
                      "pos3dMm": [round(x * 1000, 3), round(y * 1000, 3), round(z * 1000, 3)]})
    manifest = {"source": 'MNE %s make_standard_montage("colin27_1005"), projected' % mne.__version__,
                "projection": "azimuthal-equidistant from vertex, head radius = 1, +y nose",
                "numbering": "paper Fig. 2a",
                "run": {"id": "montage-colin27_1005", "plan": "B", "preliminary": True, "seed": 0, "stub": False}}
    return {"manifest": manifest, "channels": chans}


def export(out=OUT):
    obj = build()
    info = jsdata.write_js(out, "montage", obj, "montage.py", obj["manifest"]["run"],
                           obj["manifest"]["source"], "MNE-Python (BSD-3-Clause) template positions")
    if info["bytes"] > CAP_BYTES:
        raise AssertionError("montage-data.js too large: %d" % info["bytes"])
    return info


if __name__ == "__main__":
    print(json.dumps(export(), indent=1))
