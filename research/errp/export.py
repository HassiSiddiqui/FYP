"""Export the ErrP detector and replay epochs to POC/js/data/ (ADR 0002 D25, ADR 0004 D18).

python -m errp.export --stub          -> errp-model.js with w = 0 (stub:true), no data needed
python -m errp.export [--run <id>]    -> real model from the evaluate run + errp-replay.js
                                         + research/.cache/parity/errp_ref.json (3 epochs)
"""
from __future__ import annotations

import argparse
import json
import os

os.environ.setdefault("OMP_NUM_THREADS", "1")

import numpy as np

from . import data, features, jswrite, model, preprocess

FYP = os.path.dirname(data.RESEARCH)
OUT_DIR = os.path.join(FYP, "POC", "js", "data")
PARITY = os.path.join(data.RESEARCH, ".cache", "parity")
LICENCE = ("CC BY-NC-ND 4.0, Chavarriaga & Millán (BNCI 013-2015); format conversion per §2(a)(4); "
           "pending supervisor confirmation")
SOURCE = "BNCI 013-2015 (Chavarriaga & Millán 2010), bnci-horizon-2020.eu"


def static_fields(cfg: dict, channels: list[str]) -> dict:
    sos = preprocess.design_sos(cfg)
    return dict(fs=cfg["fs"], nSamples=cfg["epoch"]["n_samples"], eventIndex=cfg["epoch"]["event_index"],
                reference="CAR64", channels=channels, featureChannels=cfg["features"]["channels"],
                featureChannelIndex=features.channel_indices(channels, cfg["features"]["channels"]),
                fczIndex=channels.index("FCz"), fczWindow=features.fcz_window(cfg),
                sos=sos.tolist(), ziUnit=preprocess.zi_unit(sos).tolist(),
                baseline=list(cfg["baseline"]), windows=features.windows(cfg),
                featureOrder="window-major: index = window_k * 8 + featureChannel_i",
                groupDelayMs=preprocess.group_delay_ms(sos, cfg["fs"])["at_4Hz_ms"],
                formulas=dict(score="w . x + b", qTr="1 / (1 + exp(platt.A * score + platt.B))",
                              lambda_="qTr/(1-qTr) * (1-piTrain)/piTrain",
                              q="lambda*pi / (lambda*pi + 1 - pi)",
                              tStar="C_FP / (C_FP + C_FN - C_TP)", rollback="q > max(tStar, pi)"),
                licence=LICENCE)


def channels_of(subject: int = 1, cfg=None) -> list[str]:
    return data.load_runs(subject, 1, cfg)[0][3]


def write_model(obj: dict, run: dict) -> dict:
    os.makedirs(OUT_DIR, exist_ok=True)
    return jswrite.write_js(os.path.join(OUT_DIR, "errp-model.js"), "errpModel", obj, run,
                            SOURCE + f", subject S{obj['subject']:02d} session 1", LICENCE)


def export_stub(cfg=None):
    cfg = cfg or data.load_config()
    ch = channels_of(1, cfg)
    run = dict(id="errp-stub", plan="B", preliminary=True, seed=0, stub=True)
    obj = dict(version=1, preliminary=True, stub=True, run=run, dataset="BNCI 013-2015", subject=1,
               trainedOn="STUB — not a trained model (w = 0)", **static_fields(cfg, ch),
               w=[0.0] * 72, b=0.0, platt=dict(A=1.0, B=0.0), piTrain=0.2, mode="auto",
               modeGate=None, s2Metrics=None, synth=None, costs=cfg["costs"])
    return write_model(obj, run)


def epoch_record(eid, src, subj, ses, block, trial, label, etype, raw, cfgm, pi, expected=True):
    """raw: (64, 922) float64 µV. Python reference computed from the float32-rounded samples (D19)."""
    raw32 = raw.astype("<f4").astype(np.float64)
    rec = dict(id=eid, source=src, subject=subj, session=ses, block=block, trial=trial, label=label,
               eventType=etype, dataB64=None)
    ref = run_reference(raw32, cfgm, pi)
    rec["expected"] = dict(score=ref["score"], q=ref["q"], decision=ref["decision"], pi=pi) if expected else None
    rec["fczMinUv"] = ref["fczMinUv"]
    return rec, raw32, ref


def run_reference(raw32: np.ndarray, m: dict, pi: float) -> dict:
    """Python reference of the browser pipeline on one epoch, from the exported model dict m."""
    sos = np.array(m["sos"])
    cfgp = {"baseline": m["baseline"]}
    Xp = preprocess.preprocess(raw32[None], sos, cfgp)[0]
    F = features.window_means(Xp[None], m["featureChannelIndex"], m["windows"])[0]
    s = float(F @ np.array(m["w"]) + m["b"])
    qtr = float(model.platt_contract(s, m["platt"]["A"], m["platt"]["B"]))
    lam = float(model.lam(qtr, m["piTrain"]))
    q = float(model.prior_shift(qtr, m["piTrain"], pi))
    t = model.t_star(**m["costs"]["light-select"])
    fz = float(features.fcz_min(Xp[None], m["fczIndex"], m["fczWindow"])[0])
    return dict(features=F.tolist(), score=s, qTr=qtr, lambda_=lam, q=q, tStar=t, pi=pi,
                decision="rollback" if q > max(t, pi) else "keep", fczMinUv=fz)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--stub", action="store_true")
    ap.add_argument("--run", default=None)
    a = ap.parse_args()
    if a.stub:
        print(export_stub())
    else:
        from .export_real import main
        main(a.run)
