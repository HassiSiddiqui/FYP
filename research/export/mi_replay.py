"""Export A01 session-E replay trials -> POC/js/data/mi-replay.js (architecture §7.3, ADR-0001 D22/D26).

    .venv/Scripts/python.exe -m export.mi_replay --run-dir runs/<stamp>-planb-sd-p0   # real (20 trials)
    .venv/Scripts/python.exe -m export.mi_replay --stub --per-class 1                # stub (4 trials)

Selection (label-blind except for the per-class quota): walk A01E in trial order, keep
the first ``per_class`` trials of each class that pass the D26 margin rule
(min |z_ij - tau| >= 1e-6 and, per block, min |P_e - eta| >= 1e-6, float64 Python on the
float32-rounded input). Never filtered by correctness.

Also writes the parity reference (D23/D27):
    research/.cache/parity/mi_replay_f32.npy        [n, 22, 1000] float32 (the exported bytes)
    research/.cache/parity/sfegat_reference.npz     per-record stages
    research/.cache/parity/mi_replay_log.json       margin log, accuracies, f32-vs-f64 disagreements
"""
import argparse
import hashlib
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

OUT = os.path.join(ROOT, "POC", "js", "data", "mi-replay.js")
PARITY_DIR = os.path.join(RESEARCH, ".cache", "parity")
CAP_BYTES = 3_000_000
LICENCE = ("BCI Competition IV 2a / BNCI Horizon 001-2014, Brunner et al. 2008 — CC BY-NC-ND 4.0 "
           "(pending supervisor confirmation)")


def trial_sha(x32):
    return hashlib.sha256(np.ascontiguousarray(x32, dtype="<f4").tobytes()).hexdigest()


def select(model, X, y, cfg, per_class, temperature):
    """Run the reference on every A01E trial; return (records, log)."""
    H, P = ref.features_batch(X, cfg)
    results, excluded = [], []
    for i in range(len(X)):
        r = ref.forward_graph(model, H[i], P[i], cfg, temperature)
        results.append(r)
        if not r["margin"]["ok"]:
            excluded.append({"index": i, "reason": "margin: zMin=%.3g pMin=%s" % (
                r["margin"]["zMin"], ",".join("%.3g" % v for v in r["margin"]["pMin"]))})
    taken, counts = [], {c: 0 for c in range(4)}
    for i in range(len(X)):
        c = int(y[i])
        if counts[c] < per_class and results[i]["margin"]["ok"]:
            taken.append(i)
            counts[c] += 1
    if any(v < per_class for v in counts.values()):
        raise AssertionError("fewer than %d eligible trials for some class: %r" % (per_class, counts))
    preds = np.array([r["pred"] for r in results])
    return taken, results, excluded, preds


def float64_disagreements(model, Xraw, cfg, idx):
    """D23: how many selected predictions change between float64 and float32-rounded input."""
    n = 0
    for i in idx:
        r64 = ref.reference(model, np.asarray(Xraw[i], dtype=np.float64), cfg)
        H, P, _ = ref.features(ref.f32_round(Xraw[i]), cfg)
        r32 = ref.forward_graph(model, H, P, cfg)
        n += int(r64["pred"] != r32["pred"])
    return n


def export(model, cfg, run, temperature, per_class=5, out=OUT, write_parity=True, calibrated=None):
    from sfegat import data as sdata
    Xraw, y, meta = sdata.load_subject(1, "E")
    X32 = np.asarray(Xraw, dtype=np.float32)
    X = X32.astype(np.float64)
    taken, results, excluded, preds = select(model, X, y, cfg, per_class, temperature)
    acc_full = float((preds == y).mean())
    acc_sub = float((preds[taken] == y[taken]).mean())
    n_dis = float64_disagreements(model, Xraw, cfg, taken)
    recs = []
    for i in taken:
        r = results[i]
        recs.append({
            "id": "A01E-t%03d" % i, "index": int(i), "trueCls": ref.CLASSES[int(y[i])],
            "sha256": trial_sha(X32[i]),
            "expected": {"logits": r["logits"].tolist(), "probs": r["probs"].tolist(),
                         "probsCal": None if r["probsCal"] is None else r["probsCal"].tolist(),
                         "pred": ref.CLASSES[r["pred"]], "edgeCounts": r["edgeCounts"]},
            "b64": jsdata.B64(X32[i]),
        })
    # exemplar: first correctly decoded 'feet' (SELECT) trial; disclosed on screen (D22)
    ex = next((r for r in recs if r["trueCls"] == "feet" and r["expected"]["pred"] == "feet"), None) \
        or next((r for r in recs if r["trueCls"] == r["expected"]["pred"]), None) or recs[0]
    manifest = {
        "format": "mi-replay/1", "run": run, "dataset": "BCI Competition IV-2a (BNCI 001-2014)",
        "subject": "A01", "session": "E", "fs": 250, "window": [2.0, 6.0], "nSamples": 1000,
        "channels": list(sdata.CHANNELS), "units": "uV", "classes": list(ref.CLASSES),
        "selection": {"rule": "first %d per class in A01E trial order passing the |z−τ|,|p−η| > 1e-6 margin "
                              "guard; never filtered by correctness" % per_class,
                      "excluded": excluded, "nFailedMargin": len(excluded), "nScanned": int(len(X))},
        "deployment": {"sessionEAccuracy": acc_full, "subsetAccuracy": acc_sub, "n": int(len(X)),
                       "nSubset": len(recs), "calibrated": bool(temperature) if calibrated is None else calibrated,
                       "temperature": temperature, "f32VsF64PredDisagreements": n_dis,
                       "accuracyNote": "float64 reference on float32-rounded input (D23); trainer-reported "
                                       "accuracy is in sfegat-weights manifest.deployment"},
        "exemplarId": ex["id"],
        "exemplarRule": "first correctly decoded feet (SELECT) trial; picked for the viva script and disclosed",
        "licence": LICENCE,
    }
    obj = {"manifest": manifest, "records": recs}
    info = jsdata.write_js(out, "miReplay", obj, "mi_replay.py", run,
                           "BCI Competition IV-2a A01 session E (%d trials)" % len(recs), LICENCE)
    if info["bytes"] > CAP_BYTES:
        raise AssertionError("mi-replay.js is %d bytes > cap %d" % (info["bytes"], CAP_BYTES))
    log = {"run": run, "taken": taken, "excluded": excluded, "accFull": acc_full, "accSubset": acc_sub,
           "f32VsF64PredDisagreements": n_dis, "bytes": info["bytes"], "temperature": temperature}
    if write_parity:
        os.makedirs(PARITY_DIR, exist_ok=True)
        np.save(os.path.join(PARITY_DIR, "mi_replay_f32.npy"), X32[taken])
        st = {}
        for k, i in enumerate(taken):
            r = results[i]
            for name, a in r["stages"].items():
                st["%d/%s" % (k, name)] = np.asarray(a, dtype=np.float64)
            st["%d/logits" % k] = r["logits"]
            st["%d/probs" % k] = r["probs"]
            if r["probsCal"] is not None:
                st["%d/probsCal" % k] = r["probsCal"]
            for g, e in enumerate(r["graphs"]):
                st["%d/A%d" % (k, g)] = np.stack([np.asarray(e["src"]), np.asarray(e["dst"])]).astype(np.int64)
                st["%d/A%dw" % (k, g)] = np.asarray(e["w"], dtype=np.float64)
        st["ids"] = np.array([r["id"] for r in recs])
        np.savez(os.path.join(PARITY_DIR, "sfegat_reference.npz"), **st)
        with open(os.path.join(PARITY_DIR, "mi_replay_log.json"), "w") as f:
            json.dump(log, f, indent=1)
    info.update(log)
    return info


def main(argv=None):
    from export import sfegat_weights as sw
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--stub", action="store_true")
    ap.add_argument("--run-dir")
    ap.add_argument("--model")
    ap.add_argument("--calib")
    ap.add_argument("--per-class", type=int, default=5)
    ap.add_argument("--out", default=OUT)
    a = ap.parse_args(argv)
    if a.stub:
        cfg = ref.P0
        model = ref.make_model(cfg, None, seed=0)
        run = {"id": "stub-untrained-seed0", "plan": "B", "preliminary": True, "seed": 0, "stub": True}
        T = None
    else:
        run_dir = a.run_dir or (os.path.dirname(os.path.dirname(a.model)) if a.model else sw.find_run_dir())
        if not run_dir:
            raise SystemExit("no research/runs/*-planb-sd-p0/sd_A01/model.pt yet")
        mp = a.model or os.path.join(run_dir, "sd_A01", "model.pt")
        cfg = ref.load_cfg(run_dir)
        model = ref.make_model(cfg, mp)
        T, _ = sw.load_temperature(a.calib or sw.find_calib(run_dir))
        rid = os.path.basename(run_dir.rstrip("/\\")) + "/" + os.path.basename(os.path.dirname(mp))
        run = {"id": rid, "plan": "B", "preliminary": True, "seed": int(cfg.get("seeds", [0])[0]), "stub": False}
    info = export(model, cfg, run, T, a.per_class, a.out)
    print(json.dumps({k: v for k, v in info.items() if k != "excluded"}, indent=1))
    print("excluded (margin):", len(info["excluded"]))


if __name__ == "__main__":
    main()
