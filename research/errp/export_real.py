"""Real ErrP export (ADR 0002 D21, D25, D26): errp-model.js, errp-replay.js, parity reference.

Session 2 of the deployment subject is used only for the replay excerpt and the reported S2 metrics;
nothing exported is chosen on S2 performance except the disclosed TP/TN/FN/FP category picks.
"""
from __future__ import annotations

import json
import os
import time

import numpy as np

from . import cache, data, model, preprocess, synth
from . import metrics as M
from .evaluate import lobo_oof
from .export import (OUT_DIR, PARITY, LICENCE, SOURCE, epoch_record, run_reference, static_fields, write_model)
from . import jswrite

CAPS = {"errp-model.js": 10 * 1024, "errp-replay.js": int(2.6 * 1024 * 1024)}


def ensure_window_major(cfg):
    """Cache files written before the switch to window-major order are permuted in place."""
    for s in cfg["subjects"]:
        for ses in (1, 2):
            p = cache.cache_path(s, ses)
            z = dict(np.load(p))
            if str(z.get("order", "")) == "window-major":
                continue
            F = z["F"]
            z["F"] = F.reshape(len(F), 8, 9).transpose(0, 2, 1).reshape(len(F), 72)
            z["order"] = np.array("window-major")
            np.savez(p, **z)


def latest_run():
    with open(os.path.join(cache.CACHE, "LATEST_RUN.txt")) as f:
        rid = f.read().strip()
    rd = os.path.join(data.RESEARCH, "runs", rid)
    with open(os.path.join(rd, "metrics.json")) as f:
        return rid, rd, json.load(f)


def main(run_id=None):
    cfg = data.load_config()
    ensure_window_major(cfg)
    rid, rd, met = latest_run() if run_id is None else (run_id, os.path.join(data.RESEARCH, "runs", run_id), None)
    if met is None:
        with open(os.path.join(rd, "metrics.json")) as f:
            met = json.load(f)
    dep = met["deployment"]["subject"]
    ps = met["per_subject"][f"S{dep:02d}"]
    d1 = cache.load(dep, 1)
    F1, y1, b1 = d1["F"], d1["y"], d1["block"]
    w, b = model.fit_slda(F1, y1, cfg)
    oof = lobo_oof(F1, y1, b1, cfg)
    a_sk, c_sk = model.fit_platt(oof, y1, cfg["calibration"]["platt_C"])
    assert abs(a_sk - ps["platt"]["A"]) < 1e-6 * max(1, abs(a_sk)), (a_sk, ps["platt"])
    pl = model.to_contract(a_sk, c_sk)
    pi_tr = float(y1.mean())
    raw1 = data.load_session(dep, 1, cfg)
    ch = raw1["channels"]
    t_light = model.t_star(**cfg["costs"]["light-select"])
    run = dict(id=rid, plan="B", preliminary=True, seed=cfg["seed"], stub=False)
    gate = ps["mode_gate"]
    s2m = dict(auc=ps["s2_auc"], baAtTBA=ps["s2_thr_ii_ba_max"]["ba"], tprAtTBA=ps["s2_thr_ii_ba_max"]["tpr"],
               tnrAtTBA=ps["s2_thr_ii_ba_max"]["tnr"], tBA=ps["t_ba_s1"],
               lightSelectAtPi0181=ps["s2_thr_iii_cost"]["light-select"]["0.181"],
               s1LoboAuc=ps["s1_lobo_auc"], label="PRELIMINARY (Plan B); cross-session S1->S2; paper-like")
    mdl = dict(version=1, preliminary=True, stub=False, run=run, dataset="BNCI 013-2015", subject=dep,
               trainedOn="s1 all 10 blocks", **static_fields(cfg, ch), w=w.tolist(), b=b,
               platt=pl, piTrain=pi_tr, mode=gate["verdict"],
               modeGate=dict(verdict=gate["verdict"], rule=gate["rule"], pi=gate["pi"],
                             dE_vs_never=gate["pooled"]["dE_vs_never"], tpr=gate["pooled"]["tpr"],
                             fpr=gate["pooled"]["fpr"]),
               s2Metrics=s2m, costs=cfg["costs"], tStarLightSelect=t_light,
               recursiveTStar=ps["recursive_t_star_light"])
    # --- synthetic epochs (D21) ---
    t0 = time.time()
    gen = synth.Generator(raw1["X"], raw1["y"], ch, cfg, mdl)
    del raw1
    syn = synth.build(gen, cfg)
    print("synth", {k: syn[k] for k in ("alpha", "alpha_shortfall", "tpr", "fpr", "errSeed", "corSeed")},
          f"{time.time() - t0:.0f}s", flush=True)
    mdl["synth"] = dict(alpha=syn["alpha"], tpr=syn["tpr"], fpr=syn["fpr"], nSeeds=syn["nSeeds"],
                        errSeed=syn["errSeed"], corSeed=syn["corSeed"], alphaShortfall=syn["alpha_shortfall"],
                        note=syn["note"])
    # --- replay epochs from session 2 (D25) ---
    pi = cfg["canonical_pi"]
    d2 = data.load_session(dep, 2, cfg)
    want = [("TP", 2), ("TN", 2), ("FN", 1), ("FP", 1)]
    picks = {k: [] for k, _ in want}
    X2_32 = d2["X"].astype("<f4").astype(np.float64)
    for i in range(len(d2["y"])):
        ref = run_reference(X2_32[i], mdl, pi)
        if abs(ref["q"] - max(t_light, pi)) < 1e-3:
            continue
        rb = ref["decision"] == "rollback"
        cat = ("TP" if rb else "FN") if d2["y"][i] == 1 else ("FP" if rb else "TN")
        if len(picks[cat]) < dict(want)[cat]:
            picks[cat].append(i)
        if all(len(picks[k]) == n for k, n in want):
            break
    recs, raws = [], []
    for cat in ("TP", "TN", "FN", "FP"):
        for i in picks[cat]:
            r, raw32, _ = epoch_record(f"BNCI013-S{dep:02d}s2-t{int(d2['trial'][i]):03d}", "replay", dep, 2,
                                       int(d2["block"][i]), int(d2["trial"][i]), "error" if d2["y"][i] else "correct",
                                       int(d2["typ"][i]), d2["X"][i], mdl, pi)
            r["category"] = cat
            recs.append(r); raws.append(raw32)
    for kind, seed, alpha in (("error", syn["errSeed"], syn["alpha"]), ("correct", syn["corSeed"], None)):
        r, raw32, _ = epoch_record(f"SYN-{kind}-seed{seed}", "synthetic", dep, None, None, None, kind, None,
                                   gen.epoch(seed, alpha), mdl, pi)
        r["category"] = f"synthetic-{kind}"
        r["seed"], r["alpha"] = seed, alpha
        r["expectedAt"] = {str(p): {k: v for k, v in run_reference(raw32, mdl, p).items() if k in ("q", "decision")}
                           for p in (0.10, 0.181, 0.36)}
        recs.append(r); raws.append(raw32)
    for i, r in enumerate(recs):
        r["dataB64"] = f"__B64_{i}__"
    rep = dict(manifest=dict(version=1, run=run, dataset="BNCI 013-2015", subject=dep, session=2,
                             nChannels=64, nSamples=922, fs=512, layout="float32 LE, channel-major 64x922, uV, raw",
                             canonicalPi=pi, tStarLightSelect=t_light,
                             selection="deployment subject session 2, first in trial order per category "
                                       "(2 TP, 2 TN, 1 FN, 1 FP) with |q - max(t*, pi)| >= 1e-3 at pi = 0.181; "
                                       "plus 2 synthetic (D21). Categories use the exported model.",
                             licence=LICENCE),
               epochs=recs)
    os.makedirs(OUT_DIR, exist_ok=True)
    rinfo = jswrite.write_js(os.path.join(OUT_DIR, "errp-replay.js"), "errpReplay", rep, run,
                             SOURCE + f", subject S{dep:02d} session 2 excerpt + synthetic", LICENCE,
                             b64_fields={i: jswrite.f32_b64(x) for i, x in enumerate(raws)})
    minfo = write_model(mdl, run)
    sizes = {"errp-model.js": minfo["bytes"], "errp-replay.js": rinfo["bytes"]}
    for k, v in sizes.items():
        assert v <= CAPS[k], (k, v, CAPS[k])
    # --- parity reference from the shipped float32 bytes (D19, D26) ---
    back = jswrite.read_js(os.path.join(OUT_DIR, "errp-replay.js"))
    os.makedirs(PARITY, exist_ok=True)
    refs = []
    for e in [back["epochs"][0], back["epochs"][2], back["epochs"][-2]]:
        x = jswrite.b64_f64(e["dataB64"]).reshape(64, 922)
        ref = run_reference(x, mdl, pi)
        assert abs(ref["q"] - e["expected"]["q"]) < 1e-12
        refs.append(dict(epochId=e["id"], category=e["category"], **ref))
    with open(os.path.join(PARITY, "errp_ref.json"), "w") as f:
        json.dump(dict(run=rid, model="POC/js/data/errp-model.js", replay="POC/js/data/errp-replay.js",
                       note="Python reference on float32-decoded samples upcast to float64; features "
                            "window-major (k*8+ch); qTr = 1/(1+exp(A*score+B)); tolerances: features <= 1e-9 uV, "
                            "score/q <= 1e-6, gate 1e-4", epochs=refs), f, indent=2)
    with open(os.path.join(rd, "export.json"), "w") as f:
        json.dump(dict(sizes=sizes, picks={k: [int(i) for i in v] for k, v in picks.items()}, synth=syn,
                       replay_ids=[r["id"] for r in recs]), f, indent=2, default=float)
    print("exported", sizes, {k: len(v) for k, v in picks.items()})
