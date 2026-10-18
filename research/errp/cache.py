"""Build the per-session feature cache under research/cache/errp/ (light CPU, single thread).

python -m errp.cache  -> cache/errp/S0x_sY.npz with F[n,72], y, typ, block, trial, fczmin
plus cache/errp/segment_vs_continuous.json (ADR 0002 D4.5, session-1 files only).
"""
from __future__ import annotations

import json
import os

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

import numpy as np

from . import data, features, preprocess

CACHE = os.path.join(data.RESEARCH, "cache", "errp")


def cache_path(subject: int, session: int) -> str:
    return os.path.join(CACHE, f"S{subject:02d}_s{session}.npz")


def session_features(d: dict, cfg: dict, sos=None):
    sos = preprocess.design_sos(cfg) if sos is None else sos
    Xp = preprocess.preprocess(d["X"], sos, cfg)
    ch = features.channel_indices(d["channels"], cfg["features"]["channels"])
    F = features.window_means(Xp, ch, features.windows(cfg))
    fz = features.fcz_min(Xp, d["channels"].index("FCz"), features.fcz_window(cfg))
    return F, fz, Xp


def continuous_features(subject: int, session: int, cfg: dict, sos) -> np.ndarray:
    """Reference: CAR + causal filter over each whole run, then cut, baseline, window means."""
    n, ev = cfg["epoch"]["n_samples"], cfg["epoch"]["event_index"]
    wins = features.windows(cfg)
    Fs = []
    for eeg, typ, pos0, labels, _ in data.load_runs(subject, session, cfg):
        Y = preprocess.preprocess_continuous(eeg, sos)
        ch = features.channel_indices(labels, cfg["features"]["channels"])
        for t, p in zip(typ, pos0):
            if t not in data.ERROR_CODES + data.CORRECT_CODES:
                continue
            s0 = p - ev
            if s0 < 0 or s0 + n > Y.shape[1]:
                continue
            seg = preprocess.baseline(Y[:, s0:s0 + n], tuple(cfg["baseline"]))
            Fs.append(features.window_means(seg[None], ch, wins)[0])
    return np.array(Fs)


def build(cfg: dict | None = None, force: bool = False) -> dict:
    cfg = cfg or data.load_config()
    os.makedirs(CACHE, exist_ok=True)
    sos = preprocess.design_sos(cfg)
    seg_vs_cont = {}
    for s in cfg["subjects"]:
        for ses in (1, 2):
            p = cache_path(s, ses)
            if os.path.exists(p) and not force:
                continue
            d = data.load_session(s, ses, cfg)
            F, fz, _ = session_features(d, cfg, sos)
            np.savez(p, F=F, y=d["y"], typ=d["typ"], block=d["block"], trial=d["trial"],
                     fczmin=fz, codes=json.dumps(d["codes"]), order=np.array("window-major"))
            if ses == 1:
                Fc = continuous_features(s, ses, cfg, sos)
                seg_vs_cont[f"S{s:02d}_s1"] = float(np.max(np.abs(Fc - F)))
            print(f"cached S{s:02d}_s{ses}: {F.shape} err={int(d['y'].sum())}", flush=True)
    if seg_vs_cont:
        with open(os.path.join(CACHE, "segment_vs_continuous.json"), "w") as f:
            json.dump(dict(quantity="max |dfeature| uV, segment vs continuous-run filtering, session 1",
                           tolerance_uv=0.05, per_subject=seg_vs_cont,
                           max_uv=max(seg_vs_cont.values())), f, indent=2)
    return seg_vs_cont


def load(subject: int, session: int) -> dict:
    z = np.load(cache_path(subject, session))
    return {k: z[k] for k in ("F", "y", "typ", "block", "trial", "fczmin")}


if __name__ == "__main__":
    print(build())
