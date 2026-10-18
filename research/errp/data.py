"""BNCI 013-2015 loader (ADR 0002 D2). scipy.io.loadmat on v5 MAT files; no MOABB.

Labels: y=1 (error) for TYP in {6, 9}; y=0 (correct) for TYP in {5, 10}.
Sample index = EVENT.POS - 1 (1-based positions, as in MOABB _convert_run_epfl).
"""
from __future__ import annotations

import os
from collections import Counter

import numpy as np
import scipy.io as sio
import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
RESEARCH = os.path.dirname(HERE)
CONFIG_PATH = os.path.join(RESEARCH, "configs", "errp.yaml")

ERROR_CODES = (6, 9)
CORRECT_CODES = (5, 10)


def load_config(path: str = CONFIG_PATH) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def mat_path(subject: int, session: int, cfg: dict | None = None) -> str:
    cfg = cfg or load_config()
    d = cfg["data_dir"]
    if not os.path.isabs(d):
        d = os.path.join(RESEARCH, d)
    return os.path.join(d, f"Subject{subject:02d}_s{session}.mat")


def load_runs(subject: int, session: int, cfg: dict | None = None):
    """Return list of (eeg[n,64] float64 µV, typ[int], pos0[int], labels[64], fs) per run (10 runs)."""
    m = sio.loadmat(mat_path(subject, session, cfg), squeeze_me=True, struct_as_record=False)
    out = []
    for run in np.atleast_1d(m["run"]):
        h = run.header
        labels = [str(s) for s in h.Label]
        assert labels[-1] == "Status" and len(labels) == 65, labels[-3:]
        eeg = np.asarray(run.eeg, dtype=np.float64)
        assert eeg.shape[1] == 64
        typ = np.atleast_1d(h.EVENT.TYP).astype(int)
        pos0 = np.atleast_1d(h.EVENT.POS).astype(np.int64) - 1
        out.append((eeg, typ, pos0, labels[:64], int(h.SampleRate)))
    return out


def load_session(subject: int, session: int, cfg: dict | None = None) -> dict:
    """Raw (unfiltered) segments around every 5/6/9/10 event.

    Returns dict(X[n,64,922] µV raw, y[n], typ[n], block[n], trial[n] (index within session),
    pos[n], channels[64], fs, session, subject, codes{code: count}).
    Segments are cut from the continuous run: [pos-512, pos+410) -> 922 samples, event at 512.
    """
    cfg = cfg or load_config()
    n = cfg["epoch"]["n_samples"]
    ev = cfg["epoch"]["event_index"]
    Xs, ys, typs, blocks, poss = [], [], [], [], []
    codes = Counter()
    chans = None
    fs = None
    for b, (eeg, typ, pos0, labels, sr) in enumerate(load_runs(subject, session, cfg)):
        chans = labels if chans is None else chans
        assert labels == chans
        fs = sr
        codes.update(int(t) for t in typ)
        for t, p in zip(typ, pos0):
            if t not in ERROR_CODES + CORRECT_CODES:
                continue
            s0 = p - ev
            if s0 < 0 or s0 + n > eeg.shape[0]:
                continue  # incomplete segment (none expected; counted in tests)
            Xs.append(eeg[s0:s0 + n].T)
            ys.append(1 if t in ERROR_CODES else 0)
            typs.append(int(t))
            blocks.append(b)
            poss.append(int(p))
    X = np.stack(Xs).astype(np.float64)
    return dict(X=X, y=np.array(ys, dtype=int), typ=np.array(typs, dtype=int),
                block=np.array(blocks, dtype=int), trial=np.arange(len(ys)),
                pos=np.array(poss), channels=list(chans), fs=fs,
                session=session, subject=subject,
                codes={int(k): int(v) for k, v in sorted(codes.items())})


def dataset_report(cfg: dict | None = None) -> dict:
    cfg = cfg or load_config()
    rep = {}
    for s in cfg["subjects"]:
        for ses in (1, 2):
            d = load_session(s, ses, cfg)
            rep[f"S{s:02d}_s{ses}"] = dict(codes=d["codes"], n_epochs=int(len(d["y"])),
                                           n_error=int(d["y"].sum()),
                                           error_fraction=float(d["y"].mean()))
    return rep
