"""Brain functional-connectivity graph (paper Eqs. 1-5).

- ``plv``: per-trial phase-locking value from the Hilbert phase (Eq. 1). Broadband by
  default (paper literal); ``band=(lo, hi)`` band-passes first (sensitivity variant).
- ``zscore``: whole-matrix z-score per trial, diagonal INCLUDED in mu/sigma (Eqs. 2-3,
  population std, ddof=0), then diagonal zeroed (Eq. 4).
- ``zscore_threshold``: keep entries with z > tau (strict by default, Eq. 5). Returns a
  weighted (z values) or binary adjacency plus a per-trial ``edge_index``.

Edge-index convention (shared with the JS port): row-major ``np.nonzero(mask[i])``,
``edge_index[0] = i`` (source/row), ``edge_index[1] = j`` (target/column). Because the
mask is symmetric both directions are present.
"""

import numpy as np
from scipy import signal

FS = 250


def analytic_phasors(X, band=None, fs=FS, order=4):
    """Unit phasors exp(i*phase) of the Hilbert analytic signal along the last axis."""
    X = np.asarray(X, dtype=np.float64)
    if band is not None:
        from .preprocess import bandpass
        X = bandpass(X, band[0], band[1], order, fs)
    a = signal.hilbert(X, axis=-1)
    mag = np.abs(a)
    u = np.where(mag > 0, a / np.where(mag > 0, mag, 1.0), 0.0)
    return u


def plv(X, band=None, fs=FS, order=4):
    """PLV_ij = |mean_t exp(i(theta_i - theta_j))|.

    X : [n, C, T] or [C, T]. Returns [n, C, C] (or [C, C]) float64, symmetric, in [0, 1],
    diagonal 1 (0 for an all-zero channel).
    """
    u = analytic_phasors(X, band, fs, order)
    T = u.shape[-1]
    M = np.matmul(u, np.conj(np.swapaxes(u, -1, -2))) / T
    P = np.abs(M)
    P = 0.5 * (P + np.swapaxes(P, -1, -2))  # exact symmetry
    return np.clip(P, 0.0, 1.0)


def zscore(P, eps=1e-8, zero_diag=True):
    """Whole-matrix z-score per trial (Eqs. 2-4). Diagonal included in mu/sigma."""
    P = np.asarray(P, dtype=np.float64)
    mu = P.mean(axis=(-2, -1), keepdims=True)
    sd = P.std(axis=(-2, -1), keepdims=True)  # ddof=0
    Z = (P - mu) / (sd + eps)
    if zero_diag:
        Z = Z.copy()
        idx = np.arange(Z.shape[-1])
        Z[..., idx, idx] = 0.0
    return Z


def adjacency_to_edge_index(mask):
    """[C, C] boolean -> int64 [2, E] in row-major order."""
    r, c = np.nonzero(np.asarray(mask))
    return np.stack([r, c], 0).astype(np.int64)


def zscore_threshold(P, tau=0.3, eps=1e-8, weighted=True, strict=True,
                     return_edge_index=True):
    """Eq. 5 on the z-scored PLV.

    Parameters
    ----------
    P : raw PLV [n, C, C] or [C, C].
    tau : threshold on z-scored PLV (code default 0.3; ADR-0001 decides).
    weighted : True -> A_ij = z_ij on kept edges (Eq. 5); False -> A_ij = 1 (released
        code, which discards weights).
    strict : True -> z > tau (Eq. 5); False -> z >= tau.

    Returns
    -------
    dict with ``A`` (adjacency, float64, diag 0), ``mask`` (bool, diag False),
    ``Z`` (z-scored PLV, diag 0) and, if requested, ``edge_index`` (list of [2, E_k]
    int64 arrays, or a single array for 2-D input) and ``edge_weight`` (matching
    list of A values on those edges).
    """
    Z = zscore(P, eps=eps, zero_diag=True)
    mask = (Z > tau) if strict else (Z >= tau)
    idx = np.arange(Z.shape[-1])
    mask[..., idx, idx] = False
    A = np.where(mask, Z if weighted else 1.0, 0.0)
    out = {"A": A, "mask": mask, "Z": Z}
    if return_edge_index:
        if mask.ndim == 2:
            ei = adjacency_to_edge_index(mask)
            out["edge_index"] = ei
            out["edge_weight"] = A[ei[0], ei[1]]
        else:
            eis = [adjacency_to_edge_index(m) for m in mask]
            out["edge_index"] = eis
            out["edge_weight"] = [A[k][e[0], e[1]] for k, e in enumerate(eis)]
    return out


def edge_density(mask):
    """Fraction of off-diagonal entries kept, per trial."""
    mask = np.asarray(mask, dtype=bool)
    C = mask.shape[-1]
    return mask.sum(axis=(-2, -1)) / float(C * (C - 1))


def random_adjacency(n, n_nodes=22, density=0.3, seed=0):
    """Symmetric Erdos-Renyi masks [n, C, C] (diag False) for the R-GAT / R-SFE-GAT
    ablations; redrawn per trial, density matched by the caller."""
    rng = np.random.default_rng(seed)
    iu = np.triu_indices(n_nodes, 1)
    out = np.zeros((n, n_nodes, n_nodes), dtype=bool)
    for k in range(n):
        keep = rng.random(len(iu[0])) < density
        out[k, iu[0][keep], iu[1][keep]] = True
    return out | np.swapaxes(out, -1, -2)


def to_pyg_list(H, edge_index, y=None, edge_weight=None, dtype=None):
    """Build a list of ``torch_geometric.data.Data`` (imports torch lazily).

    H : [n, C, B]; edge_index : list of [2, E_k]; y : [n]; edge_weight : optional list.
    Node features are cast to float32 by default (dtype=torch.float32).
    """
    import torch
    from torch_geometric.data import Data

    dtype = dtype or torch.float32
    out = []
    for k in range(len(H)):
        d = Data(x=torch.as_tensor(np.asarray(H[k]), dtype=dtype),
                 edge_index=torch.as_tensor(np.asarray(edge_index[k]), dtype=torch.long))
        if y is not None:
            d.y = torch.as_tensor([int(y[k])], dtype=torch.long)
        if edge_weight is not None:
            d.edge_weight = torch.as_tensor(np.asarray(edge_weight[k]), dtype=dtype)
        out.append(d)
    return out
