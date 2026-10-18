"""Full ADR 0002 D7 evaluation protocol on sLDA (PRELIMINARY, Plan B).

python -m errp.evaluate [--perms N]
Writes research/runs/<run-id>/{config.yaml, env.json, metrics.json, dataset_report.json, models.json}.
No session-2 data are used for fitting, Platt, threshold, mode gate or deployment-subject choice (all from session 1).
Caveats (docs/errp.md): S2 EEG of S02/S04 was viewed during design; S01 S2 replay epochs are picked by detector outcome.
The permutation test is on within-session S1-LOBO AUC with labels permuted across the whole session.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import sys
import time

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

import numpy as np
import yaml
from sklearn.model_selection import StratifiedKFold

from . import cache, data, model, preprocess
from . import metrics as M


def lobo_oof(F, y, block, cfg):
    oof = np.zeros(len(y))
    for b in np.unique(block):
        te = block == b
        w, c = model.fit_slda(F[~te], y[~te], cfg)
        oof[te] = model.score(F[te], w, c)
    return oof


def lobo_auc(F, y, block, cfg, fast=False):
    if not fast:
        return M.auc(y, lobo_oof(F, y, block, cfg))
    oof = np.zeros(len(y))
    for b in np.unique(block):
        te = block == b
        w, c = model.fit_slda_fast(F[~te], y[~te])
        oof[te] = F[te] @ w + c
    return M.auc(y, oof)


def nested_platt_q(oof, y, block, cfg):
    """For each block: Platt fitted on the other blocks' OOF scores, applied to this block."""
    q = np.zeros(len(y))
    C = cfg["calibration"]["platt_C"]
    for b in np.unique(block):
        te = block == b
        A, B = model.fit_platt(oof[~te], y[~te], C)
        q[te] = model.platt(oof[te], A, B)
    return q


def mode_gate(oof, y, block, pi_tr, cfg):
    """ADR 0002 D14 nested gate for light-select at pi = canonical."""
    pi = cfg["canonical_pi"]
    c = cfg["costs"]["light-select"]
    t = model.t_star(**c)
    qn = nested_platt_q(oof, y, block, cfg)
    qpi = model.prior_shift(qn, pi_tr, pi)
    pred = model.decide(qpi, t, pi)
    per = []
    for b in np.unique(block):
        m = block == b
        r = M.rates(y[m], pred[m])
        per.append(M.delta_cost(r["tpr"], r["fpr"], pi, c)["dE_vs_never"])
    r = M.rates(y, pred)
    dE = M.delta_cost(r["tpr"], r["fpr"], pi, c)
    verdict = "flag" if dE["dE_vs_never"] >= 0 else "auto"
    return dict(cost_class="light-select", pi=pi, t_star=t, pooled=dict(r, **dE),
                per_block_dE_vs_never=per, mean_block_dE=float(np.mean(per)),
                rule="flag if pooled dE[C] vs never-rollback >= 0 else auto", verdict=verdict), qn


def recursive_t_star(qn, y, pi_tr, pi, c, iters=100):
    """Fixed point t = C_FP' / (C_FP' + C_FN - C_TP), C_FP' = C_FP / (1 - FPR(t)), FPR on S1 nested OOF."""
    t0 = model.t_star(**c)
    t = t0
    qpi = model.prior_shift(qn, pi_tr, pi)
    neg = y == 0
    for _ in range(iters):
        fpr = float(model.decide(qpi[neg], t, pi).mean())
        cfp = c["C_FP"] / max(1e-9, 1.0 - fpr)
        tn = cfp / (cfp + c["C_FN"] - c["C_TP"])
        if abs(tn - t) < 1e-12:
            break
        t = tn
    return dict(closed_form=t0, recursive=t, abs_diff=abs(t - t0), fpr_at_t=fpr,
                C_FP_recursive=cfp, ok=abs(t - t0) < 0.02)


def permutation_auc(F, y, block, cfg, n, seed):
    rng = np.random.default_rng(seed)
    out = np.empty(n)
    for i in range(n):
        out[i] = lobo_auc(F, rng.permutation(y), block, cfg, fast=True)
    return out


def subject_eval(s, cfg, perms):
    d1, d2 = cache.load(s, 1), cache.load(s, 2)
    F1, y1, b1 = d1["F"], d1["y"], d1["block"]
    F2, y2, b2 = d2["F"], d2["y"], d2["block"]
    C = cfg["calibration"]["platt_C"]
    pi_tr = float(y1.mean())
    oof = lobo_oof(F1, y1, b1, cfg)
    A, B = model.fit_platt(oof, y1, C)
    q_oof = model.platt(oof, A, B)
    t_ba = M.ba_max_threshold(y1, q_oof)
    w, b = model.fit_slda(F1, y1, cfg)
    s2 = model.score(F2, w, b)
    q2 = model.platt(s2, A, B)
    out = dict(subject=s, pi_train=pi_tr, pi_s2=float(y2.mean()), n_s1=int(len(y1)), n_s2=int(len(y2)),
               s1_lobo_auc=M.auc(y1, oof), platt=dict(A=A, B=B), t_ba_s1=t_ba)
    out["s2_auc"] = M.auc(y2, s2)
    out["s2_thr_i_q_gt_0.5"] = M.rates(y2, q2 > 0.5)
    out["s2_thr_ii_ba_max"] = M.rates(y2, q2 > t_ba)
    cost = {}
    for cname, c in cfg["costs"].items():
        t = model.t_star(**c)
        cost[cname] = {}
        for pi in cfg["priors"]:
            r = M.rates(y2, model.decide(model.prior_shift(q2, pi_tr, pi), t, pi))
            cost[cname][str(pi)] = dict(r, t_star=t, **M.delta_cost(r["tpr"], r["fpr"], pi, c))
    out["s2_thr_iii_cost"] = cost
    e, rel = M.ece(y2, q2)
    out["s2_calibration"] = dict(brier=M.brier(y2, q2), ece10=e, logloss=M.logloss(y2, q2), reliability=rel,
                                 note="q_tr at the training prior; S2 prior differs slightly")
    out["mode_gate"], qn = mode_gate(oof, y1, b1, pi_tr, cfg)
    out["recursive_t_star_light"] = recursive_t_star(qn, y1, pi_tr, cfg["canonical_pi"], cfg["costs"]["light-select"])
    pre = cfg["costs"]["preset"]
    out["preset_fpr_s1_oof"] = {str(pi): float(model.decide(model.prior_shift(qn[y1 == 0], pi_tr, pi),
                                                         model.t_star(**pre), pi).mean())
                                for pi in (0.02, cfg["canonical_pi"])}
    # secondaries
    oof2 = lobo_oof(F2, y2, b2, cfg)
    out["s2_lobo"] = dict(auc=M.auc(y2, oof2), native=M.rates(y2, oof2 > 0))
    skf = StratifiedKFold(10, shuffle=True, random_state=cfg["seed"])
    oofr = np.zeros(len(y1))
    for tr, te in skf.split(F1, y1):
        ww, bb = model.fit_slda(F1[tr], y1[tr], cfg)
        oofr[te] = model.score(F1[te], ww, bb)
    out["s1_random10fold"] = dict(auc=M.auc(y1, oofr), native=M.rates(y1, oofr > 0),
                                  label="optimistic, for comparison with [Yasemin23] 77.14 % [UNVERIFIED]")
    if perms:
        t0 = time.time()
        null = permutation_auc(F1, y1, b1, cfg, perms, cfg["seed"] + s)
        out["permutation"] = dict(n=perms, p95=float(np.percentile(null, 95)), null_mean=float(null.mean()),
                                  p_value=float((1 + np.sum(null >= out["s1_lobo_auc"])) / (1 + perms)),
                                  above_p95=bool(out["s1_lobo_auc"] > np.percentile(null, 95)),
                                  seconds=time.time() - t0)
    mdl = dict(w=w.tolist(), b=b, platt=dict(A=A, B=B), piTrain=pi_tr, t_ba=t_ba)
    return out, mdl


def loso(cfg):
    res = {}
    for s in cfg["subjects"]:
        Fs, ys = [], []
        for o in cfg["subjects"]:
            if o == s:
                continue
            for ses in (1, 2):
                d = cache.load(o, ses)
                Fs.append(d["F"]); ys.append(d["y"])
        w, b = model.fit_slda(np.vstack(Fs), np.concatenate(ys), cfg)
        d = cache.load(s, 2)
        sc = model.score(d["F"], w, b)
        res[f"S{s:02d}"] = dict(auc=M.auc(d["y"], sc), native=M.rates(d["y"], sc > 0))
    return res


def summarise(per, key_fn, subjects):
    v = np.array([key_fn(per[f"S{s:02d}"]) for s in subjects], dtype=float)
    return dict(mean=float(v.mean()), sd=float(v.std(ddof=1)) if len(v) > 1 else 0.0, values=v.tolist())


def code_sha():
    h = hashlib.sha256()
    here = os.path.dirname(os.path.abspath(__file__))
    for f in sorted(os.listdir(here)):
        if f.endswith(".py"):
            with open(os.path.join(here, f), "rb") as fh:
                h.update(fh.read())
    return h.hexdigest()


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--perms", type=int, default=None)
    a = ap.parse_args(argv)
    cfg = data.load_config()
    perms = cfg["permutations"] if a.perms is None else a.perms
    cache.build(cfg)
    from .export_real import ensure_window_major
    ensure_window_major(cfg)
    sha8 = hashlib.sha256(json.dumps(cfg, sort_keys=True).encode()).hexdigest()[:8]
    run_id = f"errp-B-slda-{time.strftime('%Y%m%d-%H%M%S')}-{sha8}"
    rd = os.path.join(data.RESEARCH, "runs", run_id)
    os.makedirs(rd, exist_ok=True)
    with open(os.path.join(rd, "config.yaml"), "w") as f:
        yaml.safe_dump(cfg, f, sort_keys=False)
    import scipy, sklearn
    with open(os.path.join(rd, "env.json"), "w") as f:
        json.dump(dict(python=sys.version, platform=platform.platform(), numpy=np.__version__,
                       scipy=scipy.__version__, sklearn=sklearn.__version__,
                       omp=os.environ.get("OMP_NUM_THREADS")), f, indent=2)
    rep = {}
    for s in cfg["subjects"]:
        for ses in (1, 2):
            z = np.load(cache.cache_path(s, ses))
            rep[f"S{s:02d}_s{ses}"] = dict(codes=json.loads(str(z["codes"])), n_epochs=int(len(z["y"])),
                                           n_error=int(z["y"].sum()), error_fraction=float(z["y"].mean()))
    with open(os.path.join(rd, "dataset_report.json"), "w") as f:
        json.dump(dict(per_file=rep, code_note="1,2,4,8 single-bit codes per description.pdf; semantics "
                       "[UNVERIFIED]; excluded per paper/MOABB convention. Epoched: 5,10 correct; 6,9 error."),
                  f, indent=2)
    per, mdls = {}, {}
    for s in cfg["subjects"]:
        t0 = time.time()
        per[f"S{s:02d}"], mdls[f"S{s:02d}"] = subject_eval(s, cfg, perms)
        print(f"S{s:02d} s1-LOBO AUC {per[f'S{s:02d}']['s1_lobo_auc']:.4f} s2 AUC {per[f'S{s:02d}']['s2_auc']:.4f}"
              f" ({time.time() - t0:.0f}s)", flush=True)
    elig = cfg["deploy"]["eligible"]
    dep = max(elig, key=lambda s: per[f"S{s:02d}"]["s1_lobo_auc"])
    subs = cfg["subjects"]
    clean = [s for s in subs if s in elig]
    summ = {}
    for name, fn in [("s2_auc", lambda r: r["s2_auc"]), ("s1_lobo_auc", lambda r: r["s1_lobo_auc"]),
                     ("s2_ba_thr_ii", lambda r: r["s2_thr_ii_ba_max"]["ba"]),
                     ("s2_tpr_thr_ii", lambda r: r["s2_thr_ii_ba_max"]["tpr"]),
                     ("s2_tnr_thr_ii", lambda r: r["s2_thr_ii_ba_max"]["tnr"]),
                     ("s2_ba_thr_i", lambda r: r["s2_thr_i_q_gt_0.5"]["ba"]),
                     ("s2_lobo_auc", lambda r: r["s2_lobo"]["auc"]),
                     ("s1_random10fold_auc", lambda r: r["s1_random10fold"]["auc"])]:
        summ[name] = dict(all6=summarise(per, fn, subs), without_S02_S04=summarise(per, fn, clean))
    lo = loso(cfg)
    n_perm_ok = sum(per[f"S{s:02d}"].get("permutation", {}).get("above_p95", False) for s in subs)
    ba_ii = summ["s2_ba_thr_ii"]["all6"]["mean"]
    out = dict(run_id=run_id, plan="B", preliminary=True, seeds=[cfg["seed"]], code_sha256=code_sha(),
               protocol="cross-session S1->S2 per subject; paper-like, not paper-identical",
               group_delay=preprocess.group_delay_ms(preprocess.design_sos(cfg), cfg["fs"]),
               per_subject=per, summary=summ, loso=lo,
               deployment=dict(subject=dep, eligible=elig, rule="argmax S1-LOBO AUC over eligible",
                               ledger=dict(cfg["deploy"]["ineligible_reason"]),
                               scanned=cfg["deploy"]["scanned_codes_only"]),
               success_band=dict(ba_thr_ii_mean=ba_ii, ba_target=0.645, ba_met=bool(ba_ii >= 0.645),
                                 auc_above_perm_p95=n_perm_ok, auc_target="5 of 6", auc_met=bool(n_perm_ok >= 5)))
    seg = os.path.join(cache.CACHE, "segment_vs_continuous.json")
    if os.path.exists(seg):
        with open(seg) as f:
            out["segment_vs_continuous"] = json.load(f)
    with open(os.path.join(rd, "metrics.json"), "w") as f:
        json.dump(out, f, indent=2)
    with open(os.path.join(rd, "models.json"), "w") as f:
        json.dump(mdls, f, indent=2)
    with open(os.path.join(data.RESEARCH, "cache", "errp", "LATEST_RUN.txt"), "w") as f:
        f.write(run_id)
    print("run", run_id, "deploy S%02d" % dep, "BA(ii) mean", round(ba_ii, 4), "perm ok", n_perm_ok)
    return rd


if __name__ == "__main__":
    main()
