"""Write all three EXPORT stubs in one process (architecture §7.7).

    .venv/Scripts/python.exe -m export.stubs

- montage-data.js : real (MNE colin27_1005)
- sfegat-weights.js: untrained SFEGAT(), torch.manual_seed(0), run.stub = true, temperature null
- mi-replay.js    : 4 real A01E trials (1 per class, D26 margin rule against the stub model),
                    run.stub = true, ``expected`` from the Python float64 reference
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RESEARCH = os.path.dirname(HERE)
if RESEARCH not in sys.path:
    sys.path.insert(0, RESEARCH)


def main():
    from export import mi_replay, montage, sfegat_weights
    out = {"montage": montage.export()}
    print("montage", json.dumps(out["montage"]), flush=True)
    info, model, cfg = sfegat_weights.export(stub=True)
    print("weights", json.dumps(info), flush=True)
    run = {"id": "stub-untrained-seed0", "plan": "B", "preliminary": True, "seed": 0, "stub": True}
    r = mi_replay.export(model, cfg, run, None, per_class=1)
    print("replay", json.dumps({k: r[k] for k in ("bytes", "taken", "accFull", "accSubset")}), flush=True)


if __name__ == "__main__":
    main()
