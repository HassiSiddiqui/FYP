"""Float64 Python reference for one trial (ADR-0001 D23, D26, D27).

Input: the float32-rounded raw trial (22 x 1000 uV) upcast to float64.
DSP in numpy/scipy float64 (the sfegat package functions), then the trained model
cast with ``model.double().eval()`` (float32 weights cast exactly).

``reference(model, X, cfg)`` returns every stage the JS port also exposes:
P, Z, H, edges A0..A3, h0 (stem), h1..h3 (post-BN GAT), z1..z3 (post-BN GAE code),
p1..p3 (edge probabilities on the evaluated edges), logits, probs, margins.
"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
RESEARCH = os.path.dirname(HERE)
if RESEARCH not in sys.path:
    sys.path.insert(0, RESEARCH)

from sfegat import data as sdata  # noqa: E402
from sfegat import graph as sgraph  # noqa: E402
from sfegat import preprocess as spre  # noqa: E402

CLASSES = ("left", "right", "feet", "tongue")
TOKENS = ("PREV", "NEXT", "SELECT", "BACK")
MARGIN = 1e-6

P0 = {"features": {"variant": "paper", "log10": False}, "graph": {"tau": 0.3, "eta": 0.5},
      "model": {"dropout": 0.5, "residual": False, "gcn_edge_weight": True, "evolve": True}}


def load_cfg(run_dir=None):
    """Resolved run config (config.json written by sfegat/train.py) or P0 defaults."""
    import json
    if run_dir and os.path.isfile(os.path.join(run_dir, "config.json")):
        with open(os.path.join(run_dir, "config.json")) as f:
            return json.load(f)["config"]
    return P0


def make_model(cfg=None, state_dict_path=None, seed=0):
    import torch
    from sfegat.model import SFEGAT
    cfg = cfg or P0
    m = cfg["model"]
    torch.manual_seed(seed)
    model = SFEGAT(dropout=m["dropout"], residual=m["residual"], eta=cfg["graph"]["eta"],
                   gcn_edge_weight=m["gcn_edge_weight"], evolve=m.get("evolve", True))
    if state_dict_path:
        sd = torch.load(state_dict_path, map_location="cpu", weights_only=True)
        model.load_state_dict(sd, strict=True)
    return model.eval()


def f32_round(X):
    return np.asarray(X, dtype=np.float32).astype(np.float64)


def load_A01(session):
    X, y, meta = sdata.load_subject(1, session)
    return f32_round(X), y, meta


def features(X, cfg=None):
    """X [C, T] float64 -> H [C, 8], P [C, C], graph dict (Z, edge_index, edge_weight)."""
    cfg = cfg or P0
    p = spre.variant_params(cfg["features"]["variant"])
    H = spre.filterbank_psd(X[None], order=p["order"], nperseg=p["nperseg"],
                            noverlap=p["noverlap"], integration=p["integration"])[0]
    if cfg["features"].get("log10"):
        H = np.log10(H)
    P = sgraph.plv(X)
    g = sgraph.zscore_threshold(P, tau=cfg["graph"]["tau"], weighted=True)
    return H, P, g


def features_batch(X, cfg=None):
    cfg = cfg or P0
    p = spre.variant_params(cfg["features"]["variant"])
    H = spre.filterbank_psd(X, order=p["order"], nperseg=p["nperseg"],
                            noverlap=p["noverlap"], integration=p["integration"])
    if cfg["features"].get("log10"):
        H = np.log10(H)
    P = sgraph.plv(X)
    return H, P


def _edges(ei, ew):
    return {"src": ei[0].tolist(), "dst": ei[1].tolist(), "w": ew.tolist(), "n": int(ei.shape[1])}


def forward_graph(model, H, P, cfg=None, temperature=None):
    """Stage-by-stage float64 forward. ``model`` is cast to double in place."""
    import torch
    import torch.nn.functional as F
    cfg = cfg or P0
    tau, eta = cfg["graph"]["tau"], cfg["graph"]["eta"]
    g = sgraph.zscore_threshold(P, tau=tau, weighted=True)
    Z = g["Z"]
    off = ~np.eye(Z.shape[0], dtype=bool)
    model.double().eval()
    st = {"P": P, "Z": Z, "H": H}
    ei = torch.as_tensor(g["edge_index"], dtype=torch.long)
    ew = torch.as_tensor(g["edge_weight"], dtype=torch.float64)
    graphs = [_edges(g["edge_index"], g["edge_weight"])]
    pmins = []
    with torch.no_grad():
        x = model.stem(torch.as_tensor(H, dtype=torch.float64), ei)
        st["h0"] = x.numpy().copy()
        for b, blk in enumerate(model.blocks, 1):
            h = blk.bn(F.relu(blk.gat(x, ei)))
            if blk.residual:
                raise NotImplementedError("residual variant not exported")
            z = blk.bn_z(F.relu(blk.enc(h, ei, ew if blk.gcn_edge_weight else None)))
            p = torch.sigmoid((z[ei[0]] * z[ei[1]]).sum(-1))
            keep = p > eta
            # cross-check against the module's own forward (same maths)
            h2, ei2, _, p2 = blk(x, ei, ew)
            assert torch.equal(ei2, ei[:, keep]) and torch.allclose(h2, h, rtol=0, atol=1e-12)
            st["h%d" % b] = h.numpy().copy()
            st["z%d" % b] = z.numpy().copy()
            st["p%d" % b] = p.numpy().copy()
            pmins.append(float(np.min(np.abs(p.numpy() - eta))) if p.numel() else float("inf"))
            if model.evolve:
                ei, ew = ei[:, keep], ew[keep]
            graphs.append(_edges(ei.numpy(), ew.numpy()))
            x = h
        c = model.cls_bn(F.relu(model.cls_gat(x, ei)))
        st["cls"] = c.numpy().copy()
        gvec = c.mean(0)
        logits = model.lin(gvec).numpy().astype(np.float64)
    probs = _softmax(logits)
    probs_cal = _softmax(logits / temperature) if temperature else None
    zmin = float(np.min(np.abs(Z[off] - tau)))
    return {
        "stages": st, "graphs": graphs, "edgeCounts": [gr["n"] for gr in graphs],
        "logits": logits, "probs": probs, "probsCal": probs_cal,
        "pred": int(np.argmax(logits)),
        "margin": {"zMin": zmin, "pMin": pmins,
                   "ok": bool(zmin >= MARGIN and all(m >= MARGIN for m in pmins))},
    }


def reference(model, X, cfg=None, temperature=None):
    H, P, _ = features(X, cfg)
    return forward_graph(model, H, P, cfg, temperature)


def _softmax(v):
    v = np.asarray(v, dtype=np.float64)
    e = np.exp(v - v.max())
    return e / e.sum()
