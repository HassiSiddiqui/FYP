"""Generate scipy/numpy reference outputs for the browser DSP parity test.

Writes research/.cache/parity/dsp_reference.json, consumed by
run_dsp_parity.js (Node), which evaluates POC/js/dsp/*.js and compares.

Run:  research/.venv/Scripts/python.exe research/tests/js_parity/dsp/gen_dsp_reference.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import scipy
from scipy import signal
from scipy.integrate import simpson, trapezoid

FS = 250.0
SEED = 20261014
ROOT = Path(__file__).resolve().parents[4]  # .../FYP
OUT = ROOT / "research" / ".cache" / "parity" / "dsp_reference.json"

PAPER_BANDS = [[8 + 4 * i, 12 + 4 * i] for i in range(8)]  # 8-12 ... 36-40 Hz
EXTRA_BANDS = [[1.0, 10.0], [0.5, 40.0], [4.0, 8.0], [1.0, 100.0], [0.1, 2.0]]


def cplx(a):
    a = np.asarray(a)
    return {"re": a.real.tolist(), "im": a.imag.tolist()}


def make_signals(rng: np.random.Generator) -> np.ndarray:
    """22 x 1000 EEG-like test signals: noise + rhythms + DC offset + drift."""
    t = np.arange(1000) / FS
    x = 10.0 * rng.standard_normal((22, 1000))
    for c in range(22):
        x[c] += rng.uniform(5, 20) * np.sin(2 * np.pi * rng.uniform(8, 13) * t + rng.uniform(0, 6.3))
        x[c] += rng.uniform(2, 8) * np.sin(2 * np.pi * rng.uniform(15, 30) * t + rng.uniform(0, 6.3))
        x[c] += rng.uniform(-50, 50) + rng.uniform(-20, 20) * t  # offset + drift
    return x


def bandpower_ref(x, band, method, edges):
    sos = signal.butter(4, band, btype="band", fs=FS, output="sos")
    y = signal.sosfiltfilt(sos, x, axis=-1)
    f, p = signal.welch(y, fs=FS, window="hann", nperseg=250, noverlap=125, axis=-1)
    lo, hi = band
    m = (f >= lo) & ((f < hi) if edges == "half-open" else (f <= hi))
    integ = simpson if method == "simpson" else trapezoid
    return integ(p[:, m], x=f[m], axis=-1)


def main() -> None:
    rng = np.random.default_rng(SEED)
    X = make_signals(rng)
    ref: dict = {"meta": {"scipy": scipy.__version__, "numpy": np.__version__,
                          "seed": SEED, "fs": FS, "shape": list(X.shape)},
                 "X": X.tolist()}

    # ---- FFT, arbitrary N ----
    ffts = []
    for n in [1, 2, 3, 4, 5, 7, 8, 16, 31, 64, 97, 125, 250, 256, 500, 997, 1000, 1024, 2000]:
        z = rng.standard_normal(n) + 1j * rng.standard_normal(n)
        ffts.append({"n": n, "x": cplx(z), "fft": cplx(np.fft.fft(z)), "ifft": cplx(np.fft.ifft(z))})
    ref["fft"] = ffts
    ref["rfft"] = {"x": X[0].tolist(), "out": cplx(np.fft.rfft(X[0]))}

    # ---- Butterworth design + zero-phase filtering ----
    filt = []
    for order in (4, 5):
        for band in PAPER_BANDS:
            sos = signal.butter(order, band, btype="band", fs=FS, output="sos")
            filt.append({"order": order, "band": band, "btype": "bandpass", "sos": sos.tolist(),
                         "zi": signal.sosfilt_zi(sos).tolist(),
                         "padlen": int(3 * (2 * len(sos) + 1 - min((sos[:, 2] == 0).sum(), (sos[:, 5] == 0).sum()))),
                         "filtfilt": signal.sosfiltfilt(sos, X, axis=-1).tolist()})
    for order in (2, 3, 4, 5):
        for band in EXTRA_BANDS:
            sos = signal.butter(order, band, btype="band", fs=FS, output="sos")
            filt.append({"order": order, "band": band, "btype": "bandpass", "sos": sos.tolist(),
                         "zi": signal.sosfilt_zi(sos).tolist(),
                         "filtfilt": signal.sosfiltfilt(sos, X[:3], axis=-1).tolist(), "rows": 3})
    for order, wn, bt in [(4, 40.0, "lowpass"), (5, 30.0, "lowpass"), (4, 0.5, "highpass"), (3, 1.0, "highpass")]:
        sos = signal.butter(order, wn, btype=bt, fs=FS, output="sos")
        filt.append({"order": order, "band": wn, "btype": bt, "sos": sos.tolist(),
                     "zi": signal.sosfilt_zi(sos).tolist(),
                     "filtfilt": signal.sosfiltfilt(sos, X[:3], axis=-1).tolist(), "rows": 3})
    ref["filters"] = filt

    sos = signal.butter(4, [8, 12], btype="band", fs=FS, output="sos")
    ref["sosfilt_plain"] = {"sos": sos.tolist(), "y": signal.sosfilt(sos, X[0]).tolist()}
    ref["filtfilt_variants"] = [
        {"padtype": pt, "padlen": pl, "y": signal.sosfiltfilt(sos, X[1], padtype=pt, padlen=pl).tolist()}
        for pt, pl in [("even", None), ("constant", None), (None, None), ("odd", 100), ("odd", 0)]
    ]

    # ---- Welch ----
    welch_cases = []
    for kw in [dict(nperseg=250, noverlap=125), dict(nperseg=256), dict(nperseg=128, noverlap=64),
               dict(nperseg=250, noverlap=125, nfft=512), dict(nperseg=125, noverlap=0),
               dict(nperseg=250, noverlap=125, scaling="spectrum"), dict(nperseg=250, noverlap=125, detrend=False),
               dict(nperseg=250, noverlap=200, average="median"), dict(nperseg=2000)]:
        f, p = signal.welch(X, fs=FS, window="hann", axis=-1, **kw)
        welch_cases.append({"kw": kw, "f": f.tolist(), "P": p.tolist()})
    ref["welch"] = welch_cases

    # ---- Hilbert ----
    ref["hilbert"] = {"full": cplx(signal.hilbert(X, axis=-1)),
                      "odd999": cplx(signal.hilbert(X[:2, :999], axis=-1)),
                      "N1024": cplx(signal.hilbert(X[:2], N=1024, axis=-1))}
    yb = signal.sosfiltfilt(signal.butter(4, [8, 12], btype="band", fs=FS, output="sos"), X, axis=-1)
    ref["hilbert"]["bandpassed_phase"] = np.angle(signal.hilbert(yb, axis=-1)).tolist()

    # ---- Integration ----
    integ = []
    for n in range(1, 12):
        y = rng.standard_normal(n)
        x = np.cumsum(rng.uniform(0.2, 2.0, n))
        integ.append({"y": y.tolist(), "x": x.tolist(),
                      "simpson_x": float(simpson(y, x=x)), "simpson_dx": float(simpson(y, dx=0.7)),
                      "trap_x": float(trapezoid(y, x=x)), "trap_dx": float(trapezoid(y, dx=0.7))})
    ref["integrate"] = integ

    # ---- Paper pipeline: filter-bank band power H (22 x 8) ----
    bp = {}
    for method in ("simpson", "trapezoid"):
        for edges in ("closed", "half-open"):
            bp[f"{method}|{edges}"] = np.stack([bandpower_ref(X, b, method, edges) for b in PAPER_BANDS],
                                               axis=1).tolist()
    ref["bandpower"] = {"bands": PAPER_BANDS, "H": bp}

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(ref), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size / 1e6:.1f} MB) scipy {scipy.__version__}", file=sys.stderr)


if __name__ == "__main__":
    main()
