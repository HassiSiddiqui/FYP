"""Windowed-mean features (ADR 0002 D5): 8 channels x 9 windows = 72 features.

Window k = [512 + round((0.20 + 0.05k) * 512), +51) for k = 0..8 (0.2-0.7 s post-event).
Rounding is round-half-up (no ties occur) so JS can reproduce it; JS uses the exported windows anyway.
Feature order: WINDOW-major (feature index = k * 8 + ch_i), channels in cfg order
(docs/architecture.md §2.3: "window-major, then channel").
"""
from __future__ import annotations

import math

import numpy as np


def windows(cfg: dict) -> list[list[int]]:
    fs, ev = cfg["fs"], cfg["epoch"]["event_index"]
    fc = cfg["features"]
    out = []
    for k in range(fc["n_windows"]):
        s = ev + int(math.floor((fc["win_start_s"] + fc["win_step_s"] * k) * fs + 0.5))
        out.append([s, s + fc["win_len"]])
    return out


def channel_indices(channels: list[str], names: list[str]) -> list[int]:
    return [channels.index(n) for n in names]


def window_means(Xp: np.ndarray, ch_idx: list[int], wins: list[list[int]]) -> np.ndarray:
    """Xp: preprocessed (n, 64, 922) -> (n, 72)."""
    Xp = np.atleast_3d(Xp) if Xp.ndim == 3 else Xp[None]
    sub = Xp[:, ch_idx, :]
    F = np.stack([sub[:, :, a:b].mean(axis=-1) for a, b in wins], axis=1)  # (n, 9 windows, 8 ch)
    return F.reshape(F.shape[0], -1)


def fcz_window(cfg: dict) -> list[int]:
    """FCz min window, 200-350 ms in filtered-signal time."""
    fs, ev = cfg["fs"], cfg["epoch"]["event_index"]
    return [ev + int(math.floor(0.200 * fs + 0.5)), ev + int(math.floor(0.350 * fs + 0.5))]


def fcz_min(Xp: np.ndarray, fcz_idx: int, win: list[int]) -> np.ndarray:
    Xp = Xp if Xp.ndim == 3 else Xp[None]
    return Xp[:, fcz_idx, win[0]:win[1]].min(axis=-1)
