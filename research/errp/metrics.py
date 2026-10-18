"""Metrics (ADR 0002 D8): AUC, BA/TPR/TNR/LR+, Brier, ECE (10 equal-mass bins), log-loss, dE[C]."""
from __future__ import annotations

import numpy as np
from sklearn.metrics import roc_auc_score


def auc(y, s) -> float:
    return float(roc_auc_score(y, s))


def rates(y, pred) -> dict:
    y = np.asarray(y).astype(bool)
    pred = np.asarray(pred).astype(bool)
    tpr = float(pred[y].mean()) if y.any() else float("nan")
    tnr = float((~pred[~y]).mean()) if (~y).any() else float("nan")
    fpr = 1.0 - tnr
    lrp = tpr / fpr if fpr > 0 else float("inf")
    return dict(ba=(tpr + tnr) / 2.0, tpr=tpr, tnr=tnr, fpr=fpr, lr_plus=lrp,
                n_pos_pred=int(pred.sum()))


def ba_max_threshold(y, q) -> float:
    """Threshold on q maximising BA (pred = q > t); midpoint between sorted unique values."""
    u = np.unique(q)
    cands = np.concatenate([[u[0] - 1e-12], (u[:-1] + u[1:]) / 2.0])
    best, bt = -1.0, 0.5
    for t in cands:
        b = rates(y, q > t)["ba"]
        if b > best:
            best, bt = b, float(t)
    return bt


def brier(y, q) -> float:
    return float(np.mean((np.asarray(q) - np.asarray(y)) ** 2))


def logloss(y, q) -> float:
    q = np.clip(np.asarray(q, dtype=np.float64), 1e-12, 1 - 1e-12)
    y = np.asarray(y)
    return float(-np.mean(y * np.log(q) + (1 - y) * np.log(1 - q)))


def ece(y, q, n_bins: int = 10) -> tuple[float, list]:
    q = np.asarray(q, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    order = np.argsort(q, kind="stable")
    bins = np.array_split(order, n_bins)
    e, rel = 0.0, []
    for b in bins:
        if len(b) == 0:
            continue
        conf, acc = float(q[b].mean()), float(y[b].mean())
        e += len(b) / len(q) * abs(conf - acc)
        rel.append(dict(n=int(len(b)), mean_q=conf, frac_error=acc))
    return float(e), rel


def expected_cost(tpr: float, fpr: float, pi: float, c: dict) -> float:
    """Per-epoch expected cost under prior pi (class-conditional rates reweighted; TN cost 0)."""
    return pi * (tpr * c["C_TP"] + (1 - tpr) * c["C_FN"]) + (1 - pi) * fpr * c["C_FP"]


def delta_cost(tpr: float, fpr: float, pi: float, c: dict) -> dict:
    e = expected_cost(tpr, fpr, pi, c)
    never = expected_cost(0.0, 0.0, pi, c)
    always = expected_cost(1.0, 1.0, pi, c)
    return dict(E=e, E_never=never, E_always=always, dE_vs_never=e - never, dE_vs_always=e - always)
