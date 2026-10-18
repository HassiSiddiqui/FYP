"""Export SFE-GAT weights -> POC/js/data/sfegat-weights.js (docs/architecture.md §7.2).

Real export (ADR-0001 D21: the exported model IS the P0 SD A01 seed-0 model):
    .venv/Scripts/python.exe -m export.sfegat_weights --run-dir runs/<stamp>-planb-sd-p0
        [--model <path/model.pt>] [--calib <path/calib_A01/result.json>]
Stub (untrained SFEGAT(), torch.manual_seed(0), temperature null):
    .venv/Scripts/python.exe -m export.sfegat_weights --stub

Temperature: ``calib_A01/result.json["temperature"]`` (fold-0 cross-fit on A01 session T,
D21 fallback, disclosed). If only ``oof_logits.npy`` + ``oof_idx.npy`` exist it is
refitted from them with the trainer's own ``fit_temperature``.
"""
import argparse
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
RESEARCH = os.path.dirname(HERE)
ROOT = os.path.dirname(RESEARCH)
if RESEARCH not in sys.path:
    sys.path.insert(0, RESEARCH)

from export import jsdata, reference as ref  # noqa: E402

OUT = os.path.join(ROOT, "POC", "js", "data", "sfegat-weights.js")
CAP_BYTES = 1_000_000
EXPECTED_ELEMENTS = 151_012
LICENCE_W = ("weights trained by us on BCI Competition IV-2a / BNCI Horizon 001-2014 "
             "(Brunner et al. 2008), A01 session T")


def find_run_dir(pattern_root=None):
    """Newest research/runs/*-planb-sd-p0 that has sd_A01/model.pt (None if none)."""
    root = pattern_root or os.path.join(RESEARCH, "runs")
    cands = []
    for d in sorted(os.listdir(root)):
        p = os.path.join(root, d)
        if d.endswith("planb-sd-p0") and os.path.isfile(os.path.join(p, "sd_A01", "model.pt")):
            cands.append(p)
    # prefer a run that also has its own calibration fold
    with_cal = [p for p in cands if os.path.isfile(os.path.join(p, "calib_A01", "result.json"))]
    return (with_cal or cands or [None])[-1]


def find_calib(run_dir):
    """calib_A01/result.json in this run, else the newest one in any planb run."""
    p = os.path.join(run_dir, "calib_A01", "result.json") if run_dir else None
    if p and os.path.isfile(p):
        return p
    root = os.path.join(RESEARCH, "runs")
    hits = [os.path.join(root, d, "calib_A01", "result.json") for d in sorted(os.listdir(root))]
    hits = [h for h in hits if os.path.isfile(h)]
    return hits[-1] if hits else None


def load_temperature(calib_json):
    """(T*, info) from the calibration fold (ADR-0001 D21)."""
    if not calib_json:
        return None, {"fitOn": "none (no calibration fold found)"}
    with open(calib_json) as f:
        r = json.load(f)
    T = r.get("temperature")
    d = os.path.dirname(calib_json)
    if T is None and os.path.isfile(os.path.join(d, "oof_logits.npy")):
        from sfegat.train import fit_temperature
        lg = np.load(os.path.join(d, "oof_logits.npy"))
        idx = np.load(os.path.join(d, "oof_idx.npy"))
        _, yT, _ = ref.load_A01("T")
        T = fit_temperature(lg, yT[idx])[0]
    info = {"fitOn": "A01T held-out split (StratifiedKFold(4, shuffle, rs=0) fold %s: 216 train / 72 held out; "
                     "T* from the fold model, applied to the 288-trial model — D21 fallback, disclosed)"
                     % r.get("fold", 0),
            "source": os.path.relpath(calib_json, ROOT).replace("\\", "/"),
            "nllBefore": r.get("calib_nll_before"), "nllAfter": r.get("calib_nll_after"),
            "oofAccuracy": r.get("oof_accuracy")}
    return (float(T) if T is not None else None), info


def filter_manifest(cfg):
    from scipy import signal
    from sfegat import preprocess as spre
    p = spre.variant_params(cfg["features"]["variant"])
    bands = spre.band_edges()
    sos = [spre.butter_sos(lo, hi, p["order"]).tolist() for lo, hi in bands]
    zi = [signal.sosfilt_zi(np.asarray(s)).tolist() for s in sos]
    nov = p["nperseg"] // 2 if p["noverlap"] is None else p["noverlap"]
    return {"variant": cfg["features"]["variant"], "bands": [[int(lo), int(hi)] for lo, hi in bands],
            "order": p["order"], "sos": sos, "zi": zi, "nperseg": p["nperseg"], "noverlap": nov,
            "window": "hann", "integration": p["integration"], "edges": "closed",
            "log10": bool(cfg["features"].get("log10", False)), "units": "uV^2"}


def train_band_power_median(cfg):
    from sfegat import preprocess as spre
    c = spre.load_features(1, "T", cfg["features"]["variant"])
    return np.median(c["H"], axis=0).ravel().tolist()  # [22*8], channel-major


def tensors_of(model):
    names, arrs, out, off = [], [], [], 0
    for k, v in model.state_dict().items():
        if k.endswith("num_batches_tracked"):
            continue
        a = v.detach().cpu().numpy().astype(np.float32)
        out.append({"name": k, "shape": list(a.shape), "offset": off, "length": int(a.size)})
        arrs.append(a.ravel())
        off += a.size
        names.append(k)
    return out, np.concatenate(arrs)


def build(model, cfg, run, source, temperature, cal_info, e_accuracy):
    from sfegat import data as sdata
    from sfegat.model import n_params
    tensors, flat = tensors_of(model)
    if flat.size != EXPECTED_ELEMENTS:
        raise AssertionError("expected %d elements, got %d" % (EXPECTED_ELEMENTS, flat.size))
    m = cfg["model"]
    manifest = {
        "format": "sfegat-weights/1", "run": run, "source": source, "licence": LICENCE_W,
        "classes": list(ref.CLASSES), "classesSource": list(sdata.CLASSES), "tokens": list(ref.TOKENS),
        "fs": 250, "nChannels": 22, "nSamples": 1000, "window": [2.0, 6.0], "channels": list(sdata.CHANNELS),
        "features": filter_manifest(cfg),
        "plv": {"band": None, "sos": None},
        "graph": {"tau": cfg["graph"]["tau"], "cmp": ">", "zscoreIncludeDiag": True, "eps": 1e-8, "weighted": True},
        "mask": {"eta": cfg["graph"]["eta"], "cmp": ">"},
        "model": {"inDim": 8, "hidden": 32, "heads": 4, "nBlocks": 3, "bottleneck": 32, "nClasses": 4,
                  "residual": bool(m["residual"]), "gcnEdgeWeight": bool(m["gcn_edge_weight"]),
                  "evolve": bool(m.get("evolve", True)),
                  "gat": {"negativeSlope": 0.2, "addSelfLoops": True, "shareWeights": False, "concat": True},
                  "gcn": {"addSelfLoops": True, "normalize": True}, "bnEps": 1e-5, "nParams": int(n_params(model))},
        "calibration": dict({"temperature": temperature}, **cal_info),
        "deployment": {"subject": "A01", "sessionEAccuracy": e_accuracy, "n": 288},
        "norm": {"trainBandPowerMedian": train_band_power_median(cfg)},
        "dtype": "float32-le", "totalElements": int(flat.size), "tensors": tensors,
    }
    return {"manifest": manifest, "b64": jsdata.B64(flat)}


def export(model_path=None, run_dir=None, calib_json=None, stub=False, out=OUT):
    import torch
    if stub:
        cfg = ref.P0
        model = ref.make_model(cfg, None, seed=0)
        run = {"id": "stub-untrained-seed0", "plan": "B", "preliminary": True, "seed": 0, "stub": True}
        source = "untrained SFEGAT(), torch.manual_seed(0) — STUB WEIGHTS, not a trained model"
        T, cal_info, e_acc = None, {"fitOn": "A01T held-out split"}, None
    else:
        run_dir = run_dir or (os.path.dirname(os.path.dirname(model_path)) if model_path else find_run_dir())
        if not run_dir:
            raise SystemExit("no research/runs/*-planb-sd-p0/sd_A01/model.pt yet")
        model_path = model_path or os.path.join(run_dir, "sd_A01", "model.pt")
        cfg = ref.load_cfg(run_dir)
        model = ref.make_model(cfg, model_path)
        T, cal_info = load_temperature(calib_json or find_calib(run_dir))
        e_acc = None
        rj = os.path.join(os.path.dirname(model_path), "result.json")
        if os.path.isfile(rj):
            with open(rj) as f:
                e_acc = json.load(f).get("test_E", {}).get("accuracy")
        rid = os.path.basename(run_dir.rstrip("/\\")) + "/" + os.path.basename(os.path.dirname(model_path))
        run = {"id": rid, "plan": "B", "preliminary": True, "seed": int(cfg.get("seeds", [0])[0]), "stub": False}
        source = os.path.relpath(model_path, ROOT).replace("\\", "/")
    obj = build(model, cfg, run, source, T, cal_info, e_acc)
    info = jsdata.write_js(out, "sfegatWeights", obj, "sfegat_weights.py", run,
                           "SFE-GAT state_dict (%s)" % source, LICENCE_W)
    if info["bytes"] > CAP_BYTES:
        raise AssertionError("sfegat-weights.js is %d bytes > cap %d" % (info["bytes"], CAP_BYTES))
    info.update({"temperature": T, "stub": stub, "run": run["id"], "sessionEAccuracy": e_acc})
    return info, model, cfg


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--stub", action="store_true")
    ap.add_argument("--run-dir")
    ap.add_argument("--model")
    ap.add_argument("--calib")
    ap.add_argument("--out", default=OUT)
    a = ap.parse_args(argv)
    info, _, _ = export(a.model, a.run_dir, a.calib, a.stub, a.out)
    print(json.dumps(info, indent=1))


if __name__ == "__main__":
    main()
