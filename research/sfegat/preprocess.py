"""Node features: filter bank + Welch PSD + in-band integral (paper Eqs. 6-8).

Every choice that ADR-0001 may still settle is a parameter:

- ``order``: Butterworth prototype order N (paper 4, released code 5). The band-pass
  designed by ``scipy.signal.butter(N, [lo, hi], 'bandpass', output='sos')`` has order
  2N; it is applied zero-phase with ``sosfiltfilt`` (scipy default padding:
  padtype='odd', padlen=3*(2*len(sos)+1-min(...)) -- the JS port must match).
- ``nperseg`` / ``noverlap``: Welch segment (paper 250 = 1 s, code 500 = 2 s),
  Hann window, 50 % overlap by default, detrend='constant', scaling='density'.
- ``integration``: 'simpson' (code: scipy.integrate.simpson over the inclusive
  [lo, hi] bins, dx = bin width), 'trapezoid', or 'rect' (sum * df).
- ``bands``: list of (lo, hi); default 8..40 Hz in 4 Hz steps -> B = 8.

Units: X in microvolts -> band power in microvolts^2 (absolute, no log).

Named variants (``VARIANTS``):
    paper : order 4, nperseg 250, simpson
    code  : order 5, nperseg 500, simpson
"""

import os

import numpy as np
from scipy import signal
from scipy import integrate

FS = 250

VARIANTS = {
    "paper": {"order": 4, "nperseg": 250, "noverlap": None, "integration": "simpson"},
    "code": {"order": 5, "nperseg": 500, "noverlap": None, "integration": "simpson"},
}

_HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CACHE_DIR = os.path.normpath(os.path.join(_HERE, "..", "cache"))
CACHE_VERSION = 1


def band_edges(fmin=8.0, fmax=40.0, step=4.0):
    """[(8,12), (12,16), ..., (36,40)] for the defaults (B = 8)."""
    lows = np.arange(fmin, fmax, step)
    return [(float(lo), float(lo + step)) for lo in lows if lo + step <= fmax + 1e-9]


def butter_sos(lo, hi, order=4, fs=FS):
    """Zero-phase-ready band-pass SOS (prototype order ``order``, band-pass order 2N)."""
    if order not in (1, 2, 3, 4, 5, 6, 7, 8):
        raise ValueError("unsupported order %r" % (order,))
    return signal.butter(order, [lo, hi], btype="bandpass", fs=fs, output="sos")


def bandpass(X, lo, hi, order=4, fs=FS):
    """Zero-phase Butterworth band-pass along the last axis (float64)."""
    sos = butter_sos(lo, hi, order, fs)
    return signal.sosfiltfilt(sos, np.asarray(X, dtype=np.float64), axis=-1)


def filter_bank(X, bands=None, order=4, fs=FS):
    """Apply each band-pass. Returns [B, *X.shape]."""
    bands = band_edges() if bands is None else bands
    return np.stack([bandpass(X, lo, hi, order, fs) for lo, hi in bands], 0)


def welch_psd(x, fs=FS, nperseg=250, noverlap=None, window="hann"):
    """scipy.signal.welch along the last axis. noverlap=None -> nperseg // 2."""
    nov = nperseg // 2 if noverlap is None else int(noverlap)
    f, p = signal.welch(x, fs=fs, window=window, nperseg=nperseg, noverlap=nov,
                        detrend="constant", scaling="density", average="mean", axis=-1)
    return f, p


def integrate_band(f, psd, lo, hi, method="simpson"):
    """Integrate ``psd`` (last axis = frequency) over the inclusive bins lo <= f <= hi."""
    idx = (f >= lo - 1e-9) & (f <= hi + 1e-9)
    if idx.sum() < 2:
        raise ValueError("band [%g, %g] has < 2 bins; increase nperseg" % (lo, hi))
    sel = psd[..., idx]
    df = float(f[1] - f[0])
    if method == "simpson":
        return integrate.simpson(sel, dx=df, axis=-1)
    if method == "trapezoid":
        return integrate.trapezoid(sel, dx=df, axis=-1)
    if method == "rect":
        return sel.sum(-1) * df
    raise ValueError("integration must be 'simpson', 'trapezoid' or 'rect', got %r" % (method,))


def filterbank_psd(X, order=4, nperseg=250, noverlap=None, bands=None, fs=FS,
                   integration="simpson", window="hann"):
    """Node features H.

    X : [n, C, T] (or [C, T]) microvolts.
    Returns H : [n, C, B] float64, H[..., k] = integral of Welch-PSD(bandpass_k(x))
    over band k (paper Eqs. 6-8).
    """
    X = np.asarray(X, dtype=np.float64)
    bands = band_edges() if bands is None else list(bands)
    out = []
    for lo, hi in bands:
        xk = bandpass(X, lo, hi, order, fs)
        f, p = welch_psd(xk, fs, nperseg, noverlap, window)
        out.append(integrate_band(f, p, lo, hi, integration))
    return np.stack(out, -1)


def variant_params(variant):
    if isinstance(variant, dict):
        return dict(variant)
    if variant not in VARIANTS:
        raise ValueError("unknown variant %r (have %s)" % (variant, sorted(VARIANTS)))
    return dict(VARIANTS[variant])


# --------------------------------------------------------------------------- cache

def cache_path(subject, session, variant, cache_dir=None):
    d = cache_dir or DEFAULT_CACHE_DIR
    return os.path.join(d, "A%02d%s_%s.npz" % (int(subject), session, variant))


def compute_features(subject, session, variant="paper", data_dir=None, plv_band=None):
    """Load raw trials and compute H (variant-specific) and raw PLV (broadband).

    Returns a dict: H [n,22,8], plv [n,22,22] (raw, NOT z-scored or thresholded so tau
    stays a run-time choice), y [n], artifact [n], run [n], trial_in_run [n], plus params.
    """
    from . import data as _data
    from . import graph as _graph

    p = variant_params(variant)
    X, y, meta = _data.load_subject(subject, session, data_dir=data_dir)
    H = filterbank_psd(X, order=p["order"], nperseg=p["nperseg"], noverlap=p["noverlap"],
                       integration=p["integration"], fs=meta["fs"])
    P = _graph.plv(X, band=plv_band, fs=meta["fs"])
    bands = np.asarray(band_edges(), dtype=np.float64)
    return {
        "H": H.astype(np.float64),
        "plv": P.astype(np.float64),
        "y": y,
        "artifact": meta["artifact"],
        "run": meta["run"],
        "trial_in_run": meta["trial_in_run"],
        "bands": bands,
        "order": np.int64(p["order"]),
        "nperseg": np.int64(p["nperseg"]),
        "noverlap": np.int64(p["nperseg"] // 2 if p["noverlap"] is None else p["noverlap"]),
        "integration": np.str_(p["integration"]),
        "plv_band": np.asarray([] if plv_band is None else plv_band, dtype=np.float64),
        "subject": np.int64(subject),
        "session": np.str_(session),
        "units": np.str_("H: uV^2 (absolute band power); plv: unitless [0,1]"),
        "cache_version": np.int64(CACHE_VERSION),
    }


def build_cache(subjects=range(1, 10), sessions=("T", "E"), variants=("paper", "code"),
                cache_dir=None, data_dir=None, overwrite=False, verbose=True):
    """Compute and save ``cache/A0sS_<variant>.npz`` for every combination."""
    d = cache_dir or DEFAULT_CACHE_DIR
    os.makedirs(d, exist_ok=True)
    written = []
    for s in subjects:
        for se in sessions:
            for v in variants:
                path = cache_path(s, se, v, d)
                if os.path.exists(path) and not overwrite:
                    continue
                feats = compute_features(s, se, v, data_dir=data_dir)
                np.savez(path, **feats)
                written.append(path)
                if verbose:
                    print("wrote", path, feats["H"].shape, feats["plv"].shape)
    return written


def load_features(subject, session, variant="paper", cache_dir=None, data_dir=None,
                  rebuild=False):
    """Load cached features (computing and caching them on a miss)."""
    path = cache_path(subject, session, variant, cache_dir)
    if rebuild or not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        np.savez(path, **compute_features(subject, session, variant, data_dir=data_dir))
    with np.load(path, allow_pickle=False) as z:
        out = {k: z[k] for k in z.files}
    if int(out.get("cache_version", -1)) != CACHE_VERSION:
        return load_features(subject, session, variant, cache_dir, data_dir, rebuild=True)
    return out


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="Build the SFE-GAT feature cache.")
    ap.add_argument("--subjects", type=int, nargs="*", default=list(range(1, 10)))
    ap.add_argument("--sessions", nargs="*", default=["T", "E"])
    ap.add_argument("--variants", nargs="*", default=["paper", "code"])
    ap.add_argument("--overwrite", action="store_true")
    a = ap.parse_args()
    build_cache(a.subjects, a.sessions, a.variants, overwrite=a.overwrite)
