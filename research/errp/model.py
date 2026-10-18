"""sLDA detector, Platt calibration, prior shift and the cost-model decision rule (ADR 0002 D5, D9, D13).

score   = w . x + b                  (LDA decision_function, error class positive)
q_tr    = 1 / (1 + exp(-(A*score + B)))   (Platt, fitted on S1 LOBO out-of-fold scores)
Lambda  = q_tr/(1-q_tr) * (1-pi_tr)/pi_tr
q(pi)   = Lambda*pi / (Lambda*pi + 1 - pi)      [Saerens02]
t*      = C_FP / (C_FP + C_FN - C_TP)
rollback iff q > max(t*, pi)
"""
from __future__ import annotations

import numpy as np
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
from sklearn.linear_model import LogisticRegression


def fit_slda(F: np.ndarray, y: np.ndarray, cfg: dict | None = None) -> tuple[np.ndarray, float]:
    c = (cfg or {}).get("classifier", {"solver": "lsqr", "shrinkage": "auto"})
    lda = LinearDiscriminantAnalysis(solver=c["solver"], shrinkage=c["shrinkage"])  # empirical priors
    lda.fit(F, y)
    return lda.coef_[0].astype(np.float64).copy(), float(lda.intercept_[0])


def score(F: np.ndarray, w: np.ndarray, b: float) -> np.ndarray:
    return np.asarray(F, dtype=np.float64) @ w + b


def fit_platt(s: np.ndarray, y: np.ndarray, C: float = 1e6) -> tuple[float, float]:
    lr = LogisticRegression(C=float(C), solver="lbfgs", max_iter=1000)
    lr.fit(np.asarray(s).reshape(-1, 1), y)
    return float(lr.coef_[0, 0]), float(lr.intercept_[0])


def platt(s, A: float, B: float):
    return 1.0 / (1.0 + np.exp(-(A * np.asarray(s, dtype=np.float64) + B)))


def to_contract(A: float, B: float) -> dict:
    """sklearn convention p = 1/(1+exp(-(a s + c))) -> contract qTr = 1/(1+exp(A s + B)) (A=-a, B=-c)."""
    return dict(A=-A, B=-B)


def platt_contract(s, A: float, B: float):
    """docs/architecture.md §2.3: qTr = 1/(1 + exp(A*score + B))."""
    return 1.0 / (1.0 + np.exp(A * np.asarray(s, dtype=np.float64) + B))


def lam(q_tr, pi_tr: float):
    q_tr = np.asarray(q_tr, dtype=np.float64)
    return q_tr / (1.0 - q_tr) * (1.0 - pi_tr) / pi_tr


def prior_shift(q_tr, pi_tr: float, pi: float):
    L = lam(q_tr, pi_tr)
    return L * pi / (L * pi + 1.0 - pi)


def t_star(C_FP: float, C_FN: float, C_TP: float) -> float:
    return C_FP / (C_FP + C_FN - C_TP)


def decide(q, t: float, pi: float):
    return np.asarray(q) > max(t, pi)


def _lw_cov(X: np.ndarray) -> np.ndarray:
    """sklearn discriminant_analysis._cov(X, 'auto'): StandardScaler -> ledoit_wolf -> rescale."""
    mu = X.mean(axis=0)
    sd = X.std(axis=0)
    sd[sd == 0.0] = 1.0
    Z = (X - mu) / sd
    n, p = Z.shape
    Z2 = Z ** 2
    emp_tr = Z2.sum(axis=0) / n
    m = emp_tr.sum() / p
    beta_ = float(np.sum(Z2.T @ Z2))
    delta_ = float(np.sum((Z.T @ Z) ** 2)) / n ** 2
    beta = 1.0 / (p * n) * (beta_ / n - delta_)
    delta = (delta_ - 2.0 * m * emp_tr.sum() + p * m ** 2) / p
    beta = min(beta, delta)
    sh = 0.0 if beta == 0 else beta / delta
    S = (1.0 - sh) * (Z.T @ Z / n)
    S.flat[:: p + 1] += sh * m
    return sd[:, None] * S * sd[None, :]


def fit_slda_fast(F: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, float]:
    """Exact numpy re-implementation of LDA(solver='lsqr', shrinkage='auto') for binary y (used for the
    permutation test only; equality with sklearn is asserted in tests/test_errp_pipeline.py)."""
    pri = np.array([np.mean(y == 0), np.mean(y == 1)])
    mus = [F[y == k].mean(axis=0) for k in (0, 1)]
    C = pri[0] * _lw_cov(F[y == 0]) + pri[1] * _lw_cov(F[y == 1])
    M = np.stack(mus)
    coef = np.linalg.lstsq(C, M.T, rcond=None)[0].T
    ic = -0.5 * np.diag(M @ coef.T) + np.log(pri)
    return coef[1] - coef[0], float(ic[1] - ic[0])
