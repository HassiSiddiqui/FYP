"""EEG JS<->PyTorch parity reference (EEG builder; ADR 0001 D23-D27).

Writes, under research/.cache/parity/:
  eeg_weights_<tag>.json : SA.data.sfegatWeights-shaped blob (manifest + float32 base64) for a
                           randomly initialised SFEGAT (tag 'init': torch.manual_seed(0) as built;
                           tag 'bnrand': same seed but BN affine/running stats randomised so BN is
                           actually exercised).
  eeg_trials.json        : trials as float32 base64 (channel-major 22x1000, uV).
  eeg_ref.json           : per model x trial float64 reference stages (H, P, Z, edges A0..A3,
                           h0, h1..h3, z1..z3, p1..p3, cls, g, logits, probs) + margins.

Reference = research/sfegat (preprocess.filterbank_psd 'paper' variant, graph.plv,
graph.zscore_threshold tau 0.3 weighted) and model.double().eval() on the float32-rounded
input and float32 weights (D23). Light CPU: one thread, a handful of trials.

Run:  research/.venv/Scripts/python.exe research/tests/js/eeg/make_eeg_parity.py
"""
import base64
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
RESEARCH = os.path.normpath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, RESEARCH)
OUT = os.path.join(RESEARCH, ".cache", "parity")

import torch  # noqa: E402
import torch.nn.functional as F  # noqa: E402

torch.set_num_threads(1)

from sfegat import graph, preprocess  # noqa: E402
from sfegat.model import SFEGAT, n_params  # noqa: E402

CHANNELS = ['Fz', 'FC3', 'FC1', 'FCz', 'FC2', 'FC4', 'C5', 'C3', 'C1', 'Cz', 'C2', 'C4', 'C6',
            'CP3', 'CP1', 'CPz', 'CP2', 'CP4', 'P1', 'Pz', 'P2', 'POz']
TAU, ETA = 0.3, 0.5


def b64f32(a):
    return base64.b64encode(np.ascontiguousarray(a, dtype="<f4").tobytes()).decode("ascii")


def manifest(model, tensors, total):
    bands = preprocess.band_edges()
    sos = [preprocess.butter_sos(lo, hi, 4).tolist() for lo, hi in bands]
    return {
        "format": "sfegat-weights/1",
        "run": {"id": "parity-random-init", "plan": "B", "preliminary": True, "seed": 0, "stub": True},
        "classes": ["left", "right", "feet", "tongue"], "tokens": ["PREV", "NEXT", "SELECT", "BACK"],
        "fs": 250, "nChannels": 22, "nSamples": 1000, "window": [2.0, 6.0], "channels": CHANNELS,
        "features": {"variant": "paper", "bands": [list(b) for b in bands], "order": 4, "sos": sos,
                     "nperseg": 250, "noverlap": 125, "window": "hann", "integration": "simpson",
                     "edges": "closed", "log10": False, "units": "uV^2"},
        "plv": {"band": None, "sos": None},
        "graph": {"tau": TAU, "cmp": ">", "zscoreIncludeDiag": True, "eps": 1e-8, "weighted": True},
        "mask": {"eta": ETA, "cmp": ">"},
        "model": {"inDim": 8, "hidden": 32, "heads": 4, "nBlocks": 3, "bottleneck": 32, "nClasses": 4,
                  "residual": False, "gcnEdgeWeight": True, "evolve": True,
                  "gat": {"negativeSlope": 0.2, "addSelfLoops": True, "shareWeights": False, "concat": True},
                  "gcn": {"addSelfLoops": True, "normalize": True}, "bnEps": 1e-5, "nParams": n_params(model)},
        "calibration": {"temperature": None},
        "dtype": "float32-le", "totalElements": total, "tensors": tensors,
    }


def export_weights(model):
    sd = model.state_dict()
    tensors, chunks, off = [], [], 0
    for name, t in sd.items():
        if name.endswith("num_batches_tracked"):
            continue
        a = t.detach().cpu().numpy().astype(np.float32).ravel()
        tensors.append({"name": name, "shape": list(t.shape), "offset": off, "length": int(a.size)})
        chunks.append(a)
        off += a.size
    blob = np.concatenate(chunks)
    return {"manifest": manifest(model, tensors, int(off)), "b64": b64f32(blob)}


def make_model(tag):
    torch.manual_seed(0)
    m = SFEGAT()
    if tag in ("bnrand", "mixsign"):
        g = torch.Generator().manual_seed(1)
        with torch.no_grad():
            for mod in m.modules():
                if isinstance(mod, torch.nn.BatchNorm1d):
                    n = mod.num_features
                    w = 0.5 + torch.rand(n, generator=g)
                    if tag == "mixsign":
                        w = w * torch.sign(torch.randn(n, generator=g))
                    mod.weight.copy_(w)
                    mod.bias.copy_(0.2 * torch.randn(n, generator=g))
                    mod.running_mean.copy_(0.3 * torch.randn(n, generator=g))
                    mod.running_var.copy_(0.5 + 1.5 * torch.rand(n, generator=g))
                    if tag == "mixsign" and n == 32:  # bn_z: small signed affine -> p_e straddles eta
                        mod.weight.copy_(0.15 * torch.randn(n, generator=g))
                        mod.bias.copy_(0.1 * torch.randn(n, generator=g))
    # weights are float32 -> exact in the export; compute in float64 (D23)
    return m.double().eval()


def calibrated_model(trials):
    """BN running stats set from one train-mode pass (momentum 1) on the A01E trials, so z is
    centred and the GAE mask p_e straddles eta: exercises edge pruning A0 -> A3."""
    m = make_model("init").float()
    for mod in m.modules():
        if isinstance(mod, torch.nn.BatchNorm1d):
            mod.momentum = 1.0
    Xs = [t["X32"].astype(np.float64) for t in trials if t["source"] == "A01E"] or [trials[0]["X32"].astype(np.float64)]
    torch.manual_seed(3)
    m.train()
    with torch.no_grad():
        for X in Xs[:1]:
            H = preprocess.filterbank_psd(X, order=4, nperseg=250, integration="simpson")
            gg = graph.zscore_threshold(graph.plv(X), tau=TAU, weighted=True)
            m(torch.tensor(H, dtype=torch.float32), torch.tensor(gg["edge_index"]), torch.zeros(22, dtype=torch.long),
              torch.tensor(gg["edge_weight"], dtype=torch.float32))
    for mod in m.modules():
        if isinstance(mod, torch.nn.BatchNorm1d):
            mod.momentum = 0.1
    return m.double().eval()


def synth_trial(seed):
    rng = np.random.default_rng(seed)
    t = np.arange(1000) / 250.0
    X = rng.standard_normal((22, 1000)) * 5.0
    common = np.sin(2 * np.pi * 10 * t + rng.uniform(0, 6.28))
    for c in range(22):
        X[c] += (3 + 2 * rng.random()) * common + 4 * np.sin(2 * np.pi * (18 + 4 * rng.random()) * t + rng.uniform(0, 6.28))
    return X


def load_trials():
    trials = []
    for s in (11, 12):
        trials.append({"id": "RND-%d" % s, "source": "random", "X": synth_trial(s)})
    try:
        from sfegat import data
        X, y, meta = data.load_subject(1, "E")
        for i in (0, 1):
            trials.append({"id": "A01E-t%03d" % i, "source": "A01E", "trueIdx": int(y[i]), "X": X[i]})
    except Exception as e:  # data missing -> random trials only
        print("A01E unavailable:", e)
    for tr in trials:
        tr["X32"] = np.asarray(tr["X"], dtype=np.float32)
    return trials


def ei_plain(ei):
    ei = ei.cpu().numpy() if hasattr(ei, "cpu") else np.asarray(ei)
    return {"src": ei[0].tolist(), "dst": ei[1].tolist(), "n": int(ei.shape[1])}


def reference(model, X32):
    X = X32.astype(np.float64)
    H = preprocess.filterbank_psd(X, order=4, nperseg=250, integration="simpson")
    P = graph.plv(X)
    g = graph.zscore_threshold(P, tau=TAU, weighted=True)
    st = {"H": H.ravel().tolist(), "P": P.ravel().tolist(), "Z": g["Z"].ravel().tolist()}
    off = g["Z"][~np.eye(22, dtype=bool)]
    margins = {"z": float(np.min(np.abs(off - TAU)))}
    x = torch.tensor(H, dtype=torch.float64)
    ei = torch.tensor(g["edge_index"], dtype=torch.long)
    ew = torch.tensor(g["edge_weight"], dtype=torch.float64)
    batch = torch.zeros(22, dtype=torch.long)
    edges = [ei_plain(ei)]
    edges[0]["w"] = ew.tolist()
    with torch.no_grad():
        full, trace, _ = model(x, ei, batch, ew, return_trace=True)
        h = model.stem(x, ei)
        st["h0"] = h.ravel().tolist()
        cur_ei, cur_ew = ei, ew
        for b, blk in enumerate(model.blocks, 1):
            hh, nei, new, p = blk(h, cur_ei, cur_ew)
            z = blk.bn_z(F.relu(blk.enc(hh, cur_ei, cur_ew)))
            st["h%d" % b] = hh.ravel().tolist()
            st["z%d" % b] = z.ravel().tolist()
            st["p%d" % b] = p.tolist()
            margins["p%d" % b] = float(torch.min(torch.abs(p - ETA))) if p.numel() else None
            cur_ei, cur_ew = nei, new
            e = ei_plain(cur_ei)
            e["w"] = cur_ew.tolist()
            edges.append(e)
            h = hh
        c = model.cls_bn(F.relu(model.cls_gat(h, cur_ei)))
        gpool = c.mean(0)
        logits = model.lin(gpool)
    st["cls"] = c.ravel().tolist()
    st["g"] = gpool.tolist()
    st["logits"] = logits.tolist()
    st["logitsModelForward"] = full[0].tolist()
    st["probs"] = torch.softmax(logits, -1).tolist()
    st["edges"] = edges
    st["traceCounts"] = [int(t.shape[1]) for t in trace]
    st["margins"] = margins
    return st


def main():
    os.makedirs(OUT, exist_ok=True)
    trials = load_trials()
    with open(os.path.join(OUT, "eeg_trials.json"), "w") as f:
        json.dump([{"id": t["id"], "source": t["source"], "trueIdx": t.get("trueIdx"),
                    "C": 22, "T": 1000, "b64": b64f32(t["X32"])} for t in trials], f)
    ref = {}
    for tag in ("init", "bnrand", "mixsign", "calib"):
        model = make_model(tag) if tag != "calib" else calibrated_model(trials)
        with open(os.path.join(OUT, "eeg_weights_%s.json" % tag), "w") as f:
            json.dump(export_weights(model), f)
        ref[tag] = {t["id"]: reference(model, t["X32"]) for t in trials}
        for tid, r in ref[tag].items():
            print(tag, tid, "edges", [e["n"] for e in r["edges"]], "logits", np.round(r["logits"], 6).tolist(),
                  "margins", r["margins"])
    with open(os.path.join(OUT, "eeg_ref.json"), "w") as f:
        json.dump(ref, f)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
