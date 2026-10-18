"""Real export in one process (one torch import): weights + 20 replay trials + montage.

    .venv/Scripts/python.exe -m export.run_all [--run-dir runs/<stamp>-planb-sd-p0] [--model ...] [--calib ...]

Defaults: newest research/runs/*-planb-sd-p0 with sd_A01/model.pt (preferring one that
also holds calib_A01/result.json), temperature from that calib fold (ADR-0001 D21).
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RESEARCH = os.path.dirname(HERE)
if RESEARCH not in sys.path:
    sys.path.insert(0, RESEARCH)


def main(argv=None):
    from export import mi_replay, montage, sfegat_weights as sw
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--run-dir")
    ap.add_argument("--model")
    ap.add_argument("--calib")
    ap.add_argument("--per-class", type=int, default=5)
    a = ap.parse_args(argv)
    print("montage", json.dumps(montage.export()), flush=True)
    info, model, cfg = sw.export(a.model, a.run_dir, a.calib, stub=False)
    print("weights", json.dumps(info), flush=True)
    run ={"id": info["run"], "plan": "B", "preliminary": True, "seed": int(cfg.get("seeds", [0])[0]), "stub": False}
    r = mi_replay.export(model, cfg, run, info["temperature"], per_class=a.per_class)
    print("replay", json.dumps({k: r[k] for k in ("bytes", "taken", "accFull", "accSubset",
                                                 "f32VsF64PredDisagreements", "temperature")}), flush=True)
    print("replay excluded by D26 margin:", len(r["excluded"]), flush=True)


if __name__ == "__main__":
    main()
