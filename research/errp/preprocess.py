"""Segment-based, online-valid preprocessing (ADR 0002 D4).

1. raw segment -1.0..+0.8 s (922 samples @512 Hz, event at 512)
2. CAR over all 64 channels
3. causal sosfilt, butter(4, [1,10], bandpass, fs=512), zi = sosfilt_zi(sos) * x[0] per channel
4. baseline: subtract per-channel mean of samples [410, 512)
All maths float64.
"""
from __future__ import annotations

import numpy as np
from scipy import signal


def design_sos(cfg: dict) -> np.ndarray:
    f = cfg["filter"]
    return signal.butter(f["order"], f["band"], btype="bandpass", fs=cfg["fs"], output="sos")


def zi_unit(sos: np.ndarray) -> np.ndarray:
    return signal.sosfilt_zi(sos)  # (n_sections, 2)


def car(X: np.ndarray) -> np.ndarray:
    """Common average reference over the channel axis (-2). X[..., ch, t]."""
    return X - X.mean(axis=-2, keepdims=True)


def causal_filter(X: np.ndarray, sos: np.ndarray) -> np.ndarray:
    """Causal sosfilt along last axis with step-steady-state zi scaled by each channel's x[0]."""
    zu = zi_unit(sos)  # (S,2)
    x0 = X[..., 0]  # (..., ch)
    zi = zu[:, None, None, :] * x0[None, ..., None] if X.ndim == 3 else zu[:, None, :] * x0[None, :, None]
    y, _ = signal.sosfilt(sos, X, axis=-1, zi=zi)
    return y


def baseline(X: np.ndarray, bl=(410, 512)) -> np.ndarray:
    return X - X[..., bl[0]:bl[1]].mean(axis=-1, keepdims=True)


def preprocess(X: np.ndarray, sos: np.ndarray, cfg: dict) -> np.ndarray:
    """X: (n, 64, 922) or (64, 922) raw µV -> filtered, baselined µV (float64)."""
    X = np.asarray(X, dtype=np.float64)
    return baseline(causal_filter(car(X), sos), tuple(cfg["baseline"]))


def preprocess_continuous(eeg: np.ndarray, sos: np.ndarray) -> np.ndarray:
    """Continuous-run reference pipeline (validation only): eeg (n_samples, 64) -> (64, n_samples)."""
    X = car(np.asarray(eeg, dtype=np.float64).T)
    return causal_filter(X, sos)


def group_delay_ms(sos: np.ndarray, fs: int, f_lo: float = 2.0, f_hi: float = 8.0) -> dict:
    """Numerically measured group delay of the causal filter (ms), median over the passband core
    and at 4 Hz (typical ErrP energy), from scipy.signal.group_delay on the expanded b/a."""
    # numerically stable: unwrap the phase of the SOS response on a dense grid and differentiate
    f = np.linspace(0.05, 30.0, 60000)
    _, h = signal.sosfreqz(sos, worN=f, fs=fs)
    ph = np.unwrap(np.angle(h))
    gd_s = -np.gradient(ph, 2 * np.pi * f)  # seconds
    core = (f >= f_lo) & (f <= f_hi)
    return dict(median_2_8Hz_ms=float(np.median(gd_s[core]) * 1000.0),
                at_4Hz_ms=float(np.interp(4.0, f, gd_s) * 1000.0),
                method="-d(unwrapped phase)/d(omega) of sosfreqz")
