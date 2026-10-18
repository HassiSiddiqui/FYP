"""BCI Competition IV-2a loader, reading the BNCI Horizon 001-2014 ``.mat`` files.

These are the same bytes MOABB's ``BNCI2014_001`` uses (see docs/research/bci-eeg.md
section 1.3). Each file holds a ``data`` struct array, one element per run, with
fields ``X`` (samples x 25, microvolts), ``trial`` (1-indexed sample of trial start,
t = 0), ``y`` (1..4), ``fs``, ``classes``, ``artifacts`` (0/1 per trial).
The first runs of each session are EOG calibration runs with no trials and are
skipped.

Window: t = 2..6 s after trial start, i.e. samples [start+500, start+1500) at 250 Hz,
exactly 1000 samples (not MNE's inclusive 1001). No filtering, no artifact rejection
(all 288 trials are kept, matching the paper's 288-trial test sets).
"""

import os

import numpy as np

FS = 250
N_CHANNELS = 22

# Paper Fig. 2a numbering 1..22 == column order of the .mat files (bci-eeg.md 1.2).
CHANNELS = (
    "Fz",
    "FC3", "FC1", "FCz", "FC2", "FC4",
    "C5", "C3", "C1", "Cz", "C2", "C4", "C6",
    "CP3", "CP1", "CPz", "CP2", "CP4",
    "P1", "Pz", "P2",
    "POz",
)

# Label index 0..3. Order follows the .mat ``classes`` field (y = 1..4).
CLASSES = ("left_hand", "right_hand", "feet", "tongue")
# README navigation tokens for each class index.
TOKENS = ("PREVIOUS", "NEXT", "SELECT", "BACK")

SUBJECTS = tuple(range(1, 10))
SESSIONS = ("T", "E")

_HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DATA_DIR = os.path.normpath(os.path.join(_HERE, "..", "data", "bnci2014_001"))


def mat_path(subject, session, data_dir=None):
    """Path of ``A0{subject}{session}.mat``."""
    _check_subject_session(subject, session)
    d = data_dir or DEFAULT_DATA_DIR
    return os.path.join(d, "A%02d%s.mat" % (int(subject), session))


def _check_subject_session(subject, session):
    if int(subject) not in SUBJECTS:
        raise ValueError("subject must be 1..9, got %r" % (subject,))
    if session not in SESSIONS:
        raise ValueError("session must be 'T' or 'E', got %r" % (session,))


def _runs(path):
    from scipy.io import loadmat

    m = loadmat(path, struct_as_record=False, squeeze_me=True)
    runs = m["data"]
    return np.atleast_1d(runs)


def load_subject(subject, session="T", tmin=2.0, tmax=6.0, data_dir=None,
                 dtype=np.float64):
    """Load one session of one subject.

    Parameters
    ----------
    subject : int, 1..9
    session : 'T' (session 1, training day) or 'E' (session 2, evaluation day)
    tmin, tmax : window in seconds relative to trial start (t = 0). Default 2..6 s.
    data_dir : directory containing the ``A0xS.mat`` files.
    dtype : output dtype (float64 by default).

    Returns
    -------
    X : ndarray [n_trials, 22, n_samples] in microvolts. n_samples = round((tmax-tmin)*fs)
        (1000 for the default window).
    y : ndarray [n_trials] int64, 0..3 in the order left_hand, right_hand, feet, tongue.
    meta : dict with per-trial arrays ``run`` (index into the file's run array),
        ``trial_in_run``, ``start_sample`` (0-indexed trial start within the run),
        ``artifact`` (expert artifact flag, 0/1; trials are NOT removed) and scalars
        ``subject``, ``session``, ``fs``, ``channels``, ``classes``, ``tmin``, ``tmax``,
        ``file``.
    """
    path = mat_path(subject, session, data_dir)
    if not os.path.isfile(path):
        raise FileNotFoundError(path)
    runs = _runs(path)

    xs, ys, run_idx, tr_idx, starts, arts = [], [], [], [], [], []
    fs_seen = None
    for r_i, run in enumerate(runs):
        trial = np.atleast_1d(np.asarray(run.trial)).astype(np.int64)
        if trial.size == 0:
            continue  # EOG calibration run, no trials
        fs = int(run.fs)
        if fs_seen is None:
            fs_seen = fs
        elif fs != fs_seen:
            raise ValueError("inconsistent fs across runs in %s" % path)
        i0 = int(round(tmin * fs))
        n = int(round((tmax - tmin) * fs))
        Xr = np.asarray(run.X)
        yr = np.atleast_1d(np.asarray(run.y)).astype(np.int64)
        ar = np.atleast_1d(np.asarray(run.artifacts)).astype(np.int64)
        if yr.shape != trial.shape:
            raise ValueError("y/trial length mismatch in %s run %d" % (path, r_i))
        if ar.size != trial.size:
            ar = np.zeros_like(trial)
        for k, t1 in enumerate(trial):
            s = int(t1) - 1 + i0  # 1-indexed trial start -> 0-indexed, + window offset
            if s < 0 or s + n > Xr.shape[0]:
                raise ValueError("window out of range: %s run %d trial %d" % (path, r_i, k))
            xs.append(Xr[s:s + n, :N_CHANNELS].T)
            ys.append(yr[k] - 1)
            run_idx.append(r_i)
            tr_idx.append(k)
            starts.append(int(t1) - 1)
            arts.append(ar[k])

    if not xs:
        raise ValueError("no trials found in %s" % path)
    X = np.ascontiguousarray(np.stack(xs, 0), dtype=dtype)
    y = np.asarray(ys, dtype=np.int64)
    if not np.isfinite(X).all():
        raise ValueError("non-finite samples in %s" % path)
    if y.min() < 0 or y.max() > 3:
        raise ValueError("labels outside 1..4 in %s" % path)
    meta = {
        "subject": int(subject),
        "session": session,
        "fs": fs_seen,
        "tmin": float(tmin),
        "tmax": float(tmax),
        "channels": CHANNELS,
        "classes": CLASSES,
        "file": os.path.basename(path),
        "run": np.asarray(run_idx, dtype=np.int64),
        "trial_in_run": np.asarray(tr_idx, dtype=np.int64),
        "start_sample": np.asarray(starts, dtype=np.int64),
        "artifact": np.asarray(arts, dtype=np.int64),
    }
    return X, y, meta


def load_subjects(subjects=SUBJECTS, sessions=SESSIONS, **kw):
    """Concatenate several (subject, session) pairs.

    Returns X, y, groups where ``groups`` is an int array of subject ids and
    ``sess`` is an array of session letters, both per trial.
    """
    Xs, ys, gs, ss = [], [], [], []
    for s in subjects:
        for se in sessions:
            X, y, _ = load_subject(s, se, **kw)
            Xs.append(X)
            ys.append(y)
            gs.append(np.full(len(y), int(s), dtype=np.int64))
            ss.append(np.full(len(y), se))
    return np.concatenate(Xs), np.concatenate(ys), np.concatenate(gs), np.concatenate(ss)
