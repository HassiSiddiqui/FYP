"""Print markdown tables from the latest ErrP run (python -m errp.report) for docs/errp.md."""
from __future__ import annotations

import json
import os

from .export_real import latest_run

LEDGER = {2: "S2 viewed during design (exploratory probe)", 4: "S2 viewed during design (exploratory probe)",
          1: "s1 event codes scanned only (no EEG)", 5: "s2 event codes scanned only (no EEG)"}


def f(x, d=3):
    return "—" if x is None else f"{x:.{d}f}"


def main():
    rid, rd, m = latest_run()
    print(f"run `{rid}`\n")
    print("| Subj | S1-LOBO AUC | perm p95 | p | S2 AUC | t_BA (S1) | S2 BA (ii) | TPR | TNR | S2 BA q>0.5 | "
          "S2-LOBO AUC | rand10 AUC (S1) | LOSO AUC | gate | ledger |")
    print("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    for k, v in m["per_subject"].items():
        s = int(k[1:])
        p = v.get("permutation", {})
        ii = v["s2_thr_ii_ba_max"]
        print(f"| {k} | {f(v['s1_lobo_auc'])} | {f(p.get('p95'))} | {f(p.get('p_value'), 4)} | {f(v['s2_auc'])} | "
              f"{f(v['t_ba_s1'])} | {f(ii['ba'])} | {f(ii['tpr'])} | {f(ii['tnr'])} | "
              f"{f(v['s2_thr_i_q_gt_0.5']['ba'])} | {f(v['s2_lobo']['auc'])} | {f(v['s1_random10fold']['auc'])} | "
              f"{f(m['loso'][k]['auc'])} | {v['mode_gate']['verdict']} ({v['mode_gate']['pooled']['dE_vs_never']:+.3f}) | "
              f"{LEDGER.get(s, '')} |")
    print()
    for name, sm in m["summary"].items():
        a, c = sm["all6"], sm["without_S02_S04"]
        print(f"- {name}: all 6 = {a['mean']:.3f} ± {a['sd']:.3f}; without S02/S04 = {c['mean']:.3f} ± {c['sd']:.3f}")
    print()
    print("Cost-model rows (S2, rule q > max(t*, pi)):\n")
    print("| Subj | class | pi | t* | TPR | FPR | LR+ | dE vs never | dE vs always |")
    print("|---|---|---|---|---|---|---|---|---|")
    for k, v in m["per_subject"].items():
        for cl, rows in v["s2_thr_iii_cost"].items():
            for pi, r in rows.items():
                print(f"| {k} | {cl} | {pi} | {r['t_star']:.3f} | {r['tpr']:.3f} | {r['fpr']:.3f} | "
                      f"{r['lr_plus']:.2f} | {r['dE_vs_never']:+.3f} | {r['dE_vs_always']:+.3f} |")
    print()
    for k, v in m["per_subject"].items():
        c = v["s2_calibration"]
        rt = v["recursive_t_star_light"]
        print(f"- {k}: Brier {c['brier']:.4f}, ECE10 {c['ece10']:.4f}, log-loss {c['logloss']:.4f}; "
              f"recursive t* {rt['recursive']:.4f} vs closed {rt['closed_form']:.4f} (|d| {rt['abs_diff']:.4f}); "
              f"preset FPR S1 OOF {v['preset_fpr_s1_oof']}")
    print("\nsuccess band:", json.dumps(m["success_band"]))
    print("group delay:", m["group_delay"])
    ex = os.path.join(rd, "export.json")
    if os.path.exists(ex):
        with open(ex) as fh:
            e = json.load(fh)
        s = e["synth"]
        print("synth:", json.dumps({k: s[k] for k in ("alpha", "alpha_shortfall", "alpha_search", "tpr", "fpr",
                                                       "errSeed", "corSeed", "components", "bump_lag_ms")}, default=str))
        print("export:", e["sizes"], e["replay_ids"])


if __name__ == "__main__":
    main()
