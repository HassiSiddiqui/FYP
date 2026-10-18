"""SFE-GAT trainer: subject-dependent (SD) runs and the A01 deployment run.

Usage (from anywhere):
    research/.venv/Scripts/python.exe research/sfegat/train.py --config research/configs/plan_b.yaml
    ... --only deploy            # just the A01 deployment model
    ... --subjects 1 2 3         # subset

Protocol (replication debate, P0): one model per subject, trained on session T for a
fixed number of epochs, last epoch reported, evaluated once on session E. Session E is
never used for fitting or model selection. One process per job, torch.set_num_threads(1).
"""
import argparse
import json
import os
import platform
import sys
import time
from multiprocessing import get_context

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
RESEARCH = os.path.dirname(HERE)
sys.path.insert(0, RESEARCH)


def _seed(seed):
    import random
    import torch
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def build_data(subject, session, cfg, idx=None):
    from sfegat import graph, preprocess
    c = preprocess.load_features(subject, session, cfg["features"]["variant"])
    H, y = c["H"], c["y"]
    if cfg["features"].get("log10"):
        H = np.log10(H)
    g = graph.zscore_threshold(c["plv"], tau=cfg["graph"]["tau"], weighted=True)
    ew = g["edge_weight"] if cfg["model"]["gcn_edge_weight"] else None
    data = graph.to_pyg_list(H, g["edge_index"], y, edge_weight=ew)
    if idx is not None:
        data = [data[i] for i in idx]
    return data


def metrics(y_true, y_pred):
    from sklearn.metrics import accuracy_score, cohen_kappa_score, f1_score, precision_score
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision_macro": float(precision_score(y_true, y_pred, average="macro", zero_division=0)),
        "f1_macro": float(f1_score(y_true, y_pred, average="macro")),
        "kappa": float(cohen_kappa_score(y_true, y_pred)),
        "n": int(len(y_true)),
    }


def make_model(cfg):
    from sfegat.model import SFEGAT
    m = cfg["model"]
    return SFEGAT(dropout=m["dropout"], residual=m["residual"], eta=cfg["graph"]["eta"],
                  gcn_edge_weight=m["gcn_edge_weight"], evolve=m.get("evolve", True))


def fit(model, train, cfg, log_path):
    import torch
    import torch.nn.functional as F
    from torch_geometric.loader import DataLoader
    t = cfg["train"]
    opt = torch.optim.SGD(model.parameters(), lr=t["lr"], momentum=t.get("momentum", 0.0),
                          weight_decay=t["weight_decay"])
    loader = DataLoader(train, batch_size=t["batch_size"], shuffle=True)
    with open(log_path, "w") as log:
        for ep in range(1, t["epochs"] + 1):
            model.train()
            tot, n, correct = 0.0, 0, 0
            for b in loader:
                opt.zero_grad(set_to_none=True)
                out = model(b.x, b.edge_index, b.batch, getattr(b, "edge_weight", None))
                loss = F.cross_entropy(out, b.y)
                loss.backward()
                opt.step()
                tot += float(loss) * b.num_graphs
                n += b.num_graphs
                correct += int((out.argmax(-1) == b.y).sum())
            log.write(json.dumps({"epoch": ep, "train_loss": tot / n, "train_acc": correct / n}) + "\n")
            log.flush()


def predict(model, data):
    import torch
    from torch_geometric.loader import DataLoader
    model.eval()
    logits = []
    with torch.no_grad():
        for b in DataLoader(data, batch_size=64, shuffle=False):
            logits.append(model(b.x, b.edge_index, b.batch, getattr(b, "edge_weight", None)))
    return torch.cat(logits).numpy()


def fit_temperature(logits, y):
    """Single temperature T* minimising NLL on held-out logits (bounded [0.05, 20])."""
    from scipy.optimize import minimize_scalar
    from scipy.special import log_softmax

    def nll(logT):
        return -log_softmax(logits / np.exp(logT), axis=1)[np.arange(len(y)), y].mean()
    r = minimize_scalar(nll, bounds=(np.log(0.05), np.log(20.0)), method="bounded")
    return float(np.exp(r.x)), float(nll(0.0)), float(r.fun)


def job(spec):
    import torch
    torch.set_num_threads(1)
    cfg, kind, subject, run_dir = spec["cfg"], spec["kind"], spec["subject"], spec["run_dir"]
    out_dir = os.path.join(run_dir, f"{kind}_A{subject:02d}")
    os.makedirs(out_dir, exist_ok=True)
    seed = cfg["seeds"][0]
    _seed(seed)
    t0 = time.time()
    res = {"kind": kind, "subject": subject, "seed": seed}
    test = build_data(subject, "E", cfg)
    y_test = np.array([int(d.y) for d in test])
    if kind == "sd":
        train = build_data(subject, "T", cfg)
        model = make_model(cfg)
        fit(model, train, cfg, os.path.join(out_dir, "train_log.jsonl"))
        logits = predict(model, test)
        res["test_E"] = metrics(y_test, logits.argmax(1))
    else:  # calib: ADR-0001 D21 cross-fit on session T (fallback: fold 0 only, disclosed)
        from sklearn.model_selection import StratifiedKFold
        data_T = build_data(subject, "T", cfg)
        yT = np.array([int(d.y) for d in data_T])
        folds = list(StratifiedKFold(n_splits=4, shuffle=True, random_state=0).split(yT, yT))
        tr, cal = folds[spec.get("fold", 0)]
        model = make_model(cfg)
        fit(model, [data_T[i] for i in tr], cfg, os.path.join(out_dir, "train_log.jsonl"))
        cal_logits = predict(model, [data_T[i] for i in cal])
        np.save(os.path.join(out_dir, "oof_logits.npy"), cal_logits)
        np.save(os.path.join(out_dir, "oof_idx.npy"), cal)
        T, nll_before, nll_after = fit_temperature(cal_logits, yT[cal])
        logits = predict(model, test)
        res.update({"fold": spec.get("fold", 0), "temperature": T, "calib_nll_before": nll_before,
                    "calib_nll_after": nll_after, "oof_accuracy": float((cal_logits.argmax(1) == yT[cal]).mean()),
                    "test_E": metrics(y_test, logits.argmax(1)),
                    "note": "calibration fold model (216 train / 72 held out from T); E for information only"})
    np.save(os.path.join(out_dir, "test_E_logits.npy"), logits)
    torch.save(model.state_dict(), os.path.join(out_dir, "model.pt"))
    res["seconds"] = time.time() - t0
    with open(os.path.join(out_dir, "result.json"), "w") as f:
        json.dump(res, f, indent=2)
    return res


def main():
    import yaml
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--only", choices=["sd", "deploy", "all"], default="all")
    ap.add_argument("--subjects", type=int, nargs="*", default=list(range(1, 10)))
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--tag", default="")
    a = ap.parse_args()
    with open(a.config) as f:
        cfg = yaml.safe_load(f)
    stamp = time.strftime("%Y%m%d-%H%M")
    run_dir = os.path.join(RESEARCH, "runs", f"{stamp}-{cfg['name']}{a.tag}")
    os.makedirs(run_dir, exist_ok=True)
    import torch
    import torch_geometric
    with open(os.path.join(run_dir, "config.json"), "w") as f:
        json.dump({"config": cfg, "args": vars(a), "python": sys.version, "torch": torch.__version__,
                   "pyg": torch_geometric.__version__, "platform": platform.platform()}, f, indent=2)
    # A01 SD first (it is the exported model), then the calibration fold, then the rest.
    dep = cfg["deploy"]["subject"]
    sd = [{"cfg": cfg, "kind": "sd", "subject": s, "run_dir": run_dir} for s in a.subjects]
    sd.sort(key=lambda s: s["subject"] != dep)
    specs = []
    if a.only in ("sd", "all"):
        specs += sd[:1]
    if a.only in ("deploy", "all"):
        specs += [{"cfg": cfg, "kind": "calib", "subject": dep, "fold": 0, "run_dir": run_dir}]
    if a.only in ("sd", "all"):
        specs += sd[1:]
    print("run_dir", run_dir, "jobs", len(specs), flush=True)
    with get_context("spawn").Pool(a.workers) as pool:
        results = []
        for r in pool.imap_unordered(job, specs):
            print(json.dumps({k: r[k] for k in ("kind", "subject", "test_E", "seconds")}), flush=True)
            results.append(r)
    sd = [r for r in results if r["kind"] == "sd"]
    if sd:
        summary = {k: float(np.mean([r["test_E"][k] for r in sd])) for k in ("accuracy", "kappa", "precision_macro", "f1_macro")}
        summary["label"] = cfg.get("label", "")
        with open(os.path.join(run_dir, "summary_sd.json"), "w") as f:
            json.dump({"mean": summary, "per_subject": sorted(sd, key=lambda r: r["subject"])}, f, indent=2)
        print("SD mean", json.dumps(summary), flush=True)


if __name__ == "__main__":
    main()
