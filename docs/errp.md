# ErrP detector: implementation and results (PRELIMINARY, Plan B)

**Status:** 2026-10-14, built for the mid evaluation. Implements ADR 0002 (`docs/adr/0002-errp-design.md`) and the `SA.data.errpModel` / `SA.data.errpReplay` contract in `docs/architecture.md` §2.3. Every number below is **PRELIMINARY (Plan B)**. They are reported exactly as they came out of the run named in §3. No session-2 data were used for fitting, Platt calibration, threshold, mode gate or deployment-subject choice. S2 EEG of S02 and S04 was viewed during design (ledger, §3), and S01 S2 epochs were picked for display by detector outcome (§5).
**Not clinically valid.** The data come from 6 able-bodied subjects in a *monitoring* paradigm (BNCI 013-2015). The browser always labels an epoch **Synthetic** or **Replay (BNCI 013-2015)**.

Citation keys refer to `docs/research/errp.md` §16. Anything marked [UNVERIFIED] is unverified.

## 0. Citation fix (ADR 0002 D1)

[Chavarriaga10] cross-session: **TNR 75.8 %, TPR 63.2 %** (LR+ 2.61). The body text (p. 385, §IV-B) is authoritative; the abstract transposes the order. The suspected swap (cross-check S1) is **refuted**.

## 1. Pipeline (as built; `research/errp/`)

| Step | Implementation | File |
|---|---|---|
| Load | `scipy.io.loadmat(squeeze_me, struct_as_record=False)`. The files are v5 (`MATLAB 5.0 MAT-file, Platform: MACI64`), so h5py is not needed. 10 runs per file; `eeg` n × 64 µV; `header.Label[:64]` (drops `Status`); sample = `EVENT.POS − 1` | `data.py` |
| Labels | **y = 1 (error) for TYP ∈ {6, 9}; y = 0 (correct) for TYP ∈ {5, 10}.** Codes 1/2/4/8 are not epoched. Verified by test: the error class is the minority in every file (0.165–0.241), as the p ≈ 0.2 paradigm requires | `data.py`, `test_errp_data.py` |
| Segment | −1.0 … +0.8 s, 922 samples, event at index 512 | `data.py` |
| Reference | CAR over all 64 channels | `preprocess.py` |
| Filter | `butter(4, [1, 10], 'bandpass', fs=512, output='sos')` (4 sections), **causal** `sosfilt`, `zi = sosfilt_zi(sos) · x[0]` per channel | `preprocess.py` |
| Baseline | subtract the mean of samples [410, 512) (−0.2 … 0 s) | `preprocess.py` |
| Features | 8 ch (Fz, FC1, FCz, FC2, C1, Cz, C2, CPz) × 9 windows `[512 + round((0.20 + 0.05k)·512), +51)` = 72 features. **Order is window-major (index = k·8 + ch)**, per architecture §2.3 | `features.py` |
| Classifier | `LinearDiscriminantAnalysis(solver='lsqr', shrinkage='auto')`, empirical priors; score = `w·x + b`; final model refit on all of session 1 | `model.py` |
| Calibration | Platt `LogisticRegression(C=1e6)` on S1 leave-one-block-out (LOBO) out-of-fold scores, applied to the full-S1 refit model (equivalent to `CalibratedClassifierCV(ensemble=False)`; the score scale may shift slightly with shrinkage). Exported in the **contract sign**: `qTr = 1/(1 + exp(A·score + B))` | `model.py` |
| Prior shift | Λ = qTr/(1 − qTr)·(1 − π_tr)/π_tr; q = Λπ/(Λπ + 1 − π) [Saerens02] | `model.py` |
| Decision | roll back iff **q > max(t\*, π)**, t\* = C_FP/(C_FP + C_FN − C_TP). light-select: 5/(5 + 7 − 2.92) = **0.5507** | `model.py` |
| Synthetic | ADR 0002 D21 generator, deterministic seeds | `synth.py` |
| Evaluation | full D7 protocol | `evaluate.py` |
| Export | `POC/js/data/errp-model.js`, `errp-replay.js` (ADR 0004 D18 header/format) | `export.py`, `export_real.py`, `jswrite.py` |

Run: `cd research && .venv/Scripts/python.exe -m errp.evaluate` (about 9 min on one thread with 1000 permutations), then `-m errp.export`. Tests: `pytest tests/test_errp_*.py`.

**Measured filter group delay:** **75.9 ms at 4 Hz** (median 71.6 ms over 2–8 Hz), from −d(unwrapped phase)/dω of `sosfreqz`. The impulse-response peak is at 43 ms, and a 30 ms-σ Gaussian bump peaks 33.2 ms later after filtering.

## 2. Dataset report and label trap

Run `errp-B-slda-20261014-160835-36b562d0` (`research/runs/<id>/dataset_report.json`). Epochs = count of codes 5 + 6 + 9 + 10. Error = 6 + 9.

| File | epochs | error | error fraction | | File | epochs | error | error fraction |
|---|---|---|---|---|---|---|---|---|
| S01 s1 | 489 | 118 | 0.241 | | S01 s2 | 555 | 117 | 0.211 |
| S02 s1 | 506 | 113 | 0.223 | | S02 s2 | 574 | 129 | 0.225 |
| S03 s1 | 498 | 99 | 0.199 | | S03 s2 | 538 | 89 | 0.165 |
| S04 s1 | 493 | 103 | 0.209 | | S04 s2 | 559 | 108 | 0.193 |
| S05 s1 | 565 | 119 | 0.211 | | S05 s2 | 558 | 122 | 0.219 |
| S06 s1 | 556 | 113 | 0.203 | | S06 s2 | 546 | 92 | 0.168 |

- **Label trap verified:** every file has 5/10 as the majority (correct) and 6/9 as the minority (error, 16.5–24.1 %). That matches the paradigm's ~20 % error rate. Reversing the mapping would give 76–83 % "errors". All 12 files lie in the D3 band [0.15, 0.30], and pytest asserts this.
- Codes 1, 2, 4 and 8 are single-bit codes per `description.pdf` (bit0 target-left, bit1 target-right, bit2 cursor-left, bit3 cursor-right). A lone 4 or 8 is a cursor move without a target bit. Their semantics are [UNVERIFIED], and they are excluded per the paper/MOABB convention.

## 3. Results (PRELIMINARY, Plan B; sLDA; 1 deterministic fit, 1000 permutations)

**Protocol label: cross-session S1 → S2, "paper-like, not paper-identical".** [Chavarriaga10] trained on two day-1 conditions (p = 0.2 and 0.4), used about 64 trials per block, Gaussian prototypes on FCz/Cz at 64 Hz, and per-subject electrode/window selection. We train on one ~0.2 file with about 50 trials per block, with a fixed electrode set and fixed windows.

**Contamination ledger:** S02 and S04: "S2 viewed during design (exploratory probe)", so they are **ineligible for deployment**. S01 s1 and S05 s2: "event codes scanned only (no EEG)".

| Subj | S1-LOBO AUC | perm p95 | p | **S2 AUC** | t_BA (S1 OOF) | **S2 BA (ii)** | S2 TPR (ii) | S2 TNR (ii) | S2 BA q>0.5 (i) | S2-LOBO AUC | rand-10-fold AUC (S1) | LOSO AUC (S2) | mode gate (ΔE vs never) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **S01** (deployed) | 0.876 | 0.560 | 0.0010 | **0.890** | 0.375 | **0.823** | 0.761 | 0.886 | 0.798 | 0.932 | 0.873 | 0.862 | auto (−0.327) |
| S02 † | 0.802 | 0.560 | 0.0010 | 0.847 | 0.197 | 0.766 | 0.744 | 0.789 | 0.659 | 0.844 | 0.812 | 0.795 | auto (−0.104) |
| S03 | 0.861 | 0.567 | 0.0010 | 0.868 | 0.343 | 0.788 | 0.685 | 0.891 | 0.753 | 0.891 | 0.865 | 0.812 | auto (−0.319) |
| S04 † | 0.743 | 0.562 | 0.0010 | 0.669 | 0.237 | 0.624 | 0.509 | 0.738 | 0.541 | 0.651 | 0.758 | 0.658 | auto (−0.040) |
| S05 | 0.861 | 0.558 | 0.0010 | 0.693 | 0.220 | 0.615 | 0.533 | 0.697 | 0.632 | 0.780 | 0.872 | 0.747 | auto (−0.132) |
| S06 | 0.688 | 0.562 | 0.0010 | 0.714 | 0.201 | 0.646 | 0.761 | 0.531 | 0.536 | 0.762 | 0.717 | 0.708 | **flag** (+0.003) |

† S2 viewed during design. p = 0.0010 is the smallest value reachable with 1000 permutations, (1 + 0)/(1 + 1000).

| Mean ± SD | all 6 | without S02/S04 |
|---|---|---|
| S2 AUC (primary) | 0.780 ± 0.099 | 0.791 ± 0.102 |
| S2 BA at (ii) BA-max threshold from S1 OOF | **0.710 ± 0.092** | 0.718 ± 0.103 |
| S2 TPR / TNR at (ii) | 0.666 ± 0.116 / 0.755 ± 0.135 | 0.685 ± 0.107 / 0.751 ± 0.172 |
| S2 BA at (i) q > 0.5 | 0.653 ± 0.107 | 0.680 ± 0.119 |
| S1-LOBO AUC | 0.805 ± 0.076 | 0.822 ± 0.089 |
| S2-LOBO AUC (secondary) | 0.810 ± 0.101 | 0.841 ± 0.083 |
| S1 random stratified 10-fold AUC ("optimistic, for comparison with [Yasemin23] 77.14 % [UNVERIFIED]") | 0.816 ± 0.066 | 0.832 ± 0.077 |

**Success band (D8):**
- Mean cross-session BA at (ii) = **0.710**, against a target of ≥ 0.645 (**met**). The paper's cross-session BA is 69.5 % ([Chavarriaga10], (75.8 + 63.2)/2).
- Within-session S1-LOBO AUC is above the 95th percentile of a 1000-permutation null (labels permuted across the whole session, not within blocks) on **6 of 6** subjects, against a target of ≥ 5 (**met**). The cross-session result is the BA/AUC above; it was not permutation-tested.
- Caveats: the protocol is paper-like, not paper-identical, and our BA-max threshold is not their classifier's native operating point.

**Deployment subject (D10):** argmax S1-LOBO AUC over the eligible {S01, S03, S05, S06} → **S01** (0.876).

### 3.1 Calibration on S2 (q_tr at the training prior)

| Subj | Brier | ECE (10 equal-mass bins) | log-loss |
|---|---|---|---|
| S01 | 0.0938 | 0.0505 | 0.3166 |
| S02 | 0.1201 | 0.0432 | 0.3839 |
| S03 | 0.0892 | 0.0516 | 0.3062 |
| S04 | 0.1472 | 0.0686 | 0.4709 |
| S05 | 0.1755 | 0.1286 | 0.6124 |
| S06 | 0.1329 | 0.0697 | 0.4288 |

The reliability bins are in `metrics.json` (`s2_calibration.reliability`). No plot is rendered tonight.

### 3.2 Cost model on S2: rule q > max(t\*, π), rates reweighted to π (ΔE in nominal MI tokens per executed action; negative = better)

t\*(light-select) = 5/(5 + 7 − 2.92) = **0.5507**; t\*(preset) = 5/(5 + 15 − 3) = **0.2941**. Both are provisional ADR 0002 D13 cells.

| Subj | light-select π=0.181: TPR / FPR / LR+ | ΔE vs never | ΔE vs always | preset π=0.181: TPR / FPR | ΔE vs never |
|---|---|---|---|---|---|
| S01 | 0.556 / 0.041 / 13.5 | **−0.242** | −3.598 | 0.761 / 0.116 | −1.175 |
| S02 | 0.225 / 0.011 / 20.0 | −0.120 | −3.477 | 0.543 / 0.070 | −0.893 |
| S03 | 0.517 / 0.031 / 16.6 | −0.254 | −3.611 | 0.719 / 0.125 | −1.051 |
| S04 | 0.065 / 0.016 / 4.2 | **+0.016** | −3.341 | 0.361 / 0.118 | −0.303 |
| S05 | 0.344 / 0.089 / 3.9 | **+0.112** | −3.244 | 0.459 / 0.213 | −0.124 |
| S06 | 0.054 / 0.011 / 4.9 | **+0.005** | −3.352 | 0.478 / 0.167 | −0.353 |

- All four priors {0.10, 0.181, 0.223, 0.334} are tabulated per subject and class in `research/cache/errp/report.md` (`python -m errp.report`) and `metrics.json`.
- **Reading:** for 3 of 6 subjects (S04, S05, S06), light-select auto-rollback **increases** expected cost at π = 0.181 on S2. That is ADR 0002 residual dissent #4 in numbers.
- The nested S1 gate (D14) caught S06 (flag) but not S04 or S05, whose S2 sessions degrade (AUC 0.67 and 0.69).
- For the deployed S01, auto-rollback lowers expected cost at every π tested.

**Recursive t\* (D13):** |Δt\*| between the recursive and closed-form values on S1 nested OOF is 0.0006–0.0067 for all subjects, below 0.02. So **no override** is exported. For S01: recursive 0.5533 vs closed 0.5507.
**Preset FPR at t\* on S1 nested OOF (S01):** 0.000 at π' = 0.02, 0.075 at π = 0.181.
**Mode gate (D14), deployed S01: `auto`.** Pooled nested-OOF ΔE[C] for light-select at π = 0.181 is −0.327. Scripted mode is always `auto`; Replay honours this verdict.

## 4. Synthetic epochs (D21, closes G7)

Generator `research/errp/synth.py`, deployment subject S01, statistics from session 1 only:
- **Background:** 64 unit-variance 1/f sources plus 10 Hz alpha, mixed by the symmetric square root (`eigh`, clipped) of the S01 S1 pre-stimulus CAR + band-passed spatial covariance, plus 5 % sensor noise. It is scaled so the post-pipeline FCz SD equals S01's (4.93 µV), and a per-channel DC offset ~ U(−2000, 2000) µV is added.
- **Components:** taken from the S01 S1 error − correct FCz difference: P2/early+ 248 ms (+1.60 µV), **Ne 309 ms (−5.32 µV)**, Pe 371 ms (+7.02 µV) and late N 527 ms (−3.18 µV), in filtered time. Each is a σ = 30 ms Gaussian with its own topography (the S1 difference at its peak). Each is shifted earlier by the **measured** 33.2 ms lag between a raw 30 ms bump and its filtered peak. Gains are fitted jointly by least squares so that α = 1 reproduces the filtered grand-average difference at FCz.
- **Caps:** S01's grand-average Ne (−5.32 µV) already exceeds the 4.1 µV cap at α = 1. So the Ne and Pe gains are capped per component, and the α grid is restricted to values where the **realised** composite FCz |Ne| ≤ 4.1 and Pe ≤ 8 µV. Only **α = 1.0** qualifies (realised Ne 3.86 µV, Pe 6.63 µV). At α = 1.5, overlap pushes Ne to 4.83 µV.
- **α shortfall (disclosed):** at α = 1.0, only **19.5 %** of 200 seeds give q > t\* + 0.10 at π = 0.10, against the 80 % target. Per D21 the largest admissible α is used and the shortfall reported.
- **Synthetic rates over 200 seeds:**
  - TPR = **0.505 at π = 0.181**, 0.280 at π = 0.10;
  - FPR (no component) = **0.005 at π = 0.181**, 0.000 at π = 0.10.
  - Detection depends on the prior π: above c ≈ 0.90 the detector may keep.
- **Demo epochs:**
  - Error seed **509**: FCz min **−8.42 µV** (→ −8.4), q = 0.672 / 0.803 / 0.912 at π = 0.10 / 0.181 / 0.36, rollback at all three.
  - Correct seed **0**: q = 0.018 / 0.035 / 0.085, keep at all three.
  - `test_errp_synth.py` asserts these decisions and FCz min = −8.4 ± 0.05 µV.

## 5. Export and parity

| File | Size | Cap | Content |
|---|---|---|---|
| `POC/js/data/errp-model.js` | 5,825 B | 10 KB | `SA.data.errpModel`. Includes `w[72]` (window-major), `b`, `platt{A,B}` (contract sign), `piTrain` 0.2413, `sos[4×6]`, `ziUnit[4×2]`, `baseline`, `windows[9]`, `featureChannels` + `featureChannelIndex`, `channels[64]`, `fczIndex` 46, `fczWindow` [614, 691), `costs`, `tStarLightSelect`, `mode:'auto'`, `modeGate`, `s2Metrics`, `synth`, `run{id, plan:'B', preliminary:true, stub:false}`, licence |
| `POC/js/data/errp-replay.js` | 2,537,270 B | 2.6 MB | `SA.data.errpReplay = {manifest, epochs[8]}`. Each epoch is `{id, source, category, subject, session, block, trial, label, eventType, dataB64 (float32 LE, 64×922 channel-major, raw µV), expected{score, q, decision, pi:0.181}, fczMinUv}`. Synthetic records also carry `seed`, `alpha` and `expectedAt{0.1, 0.181, 0.36}` |

- **Replay selection (disclosed):** S01 **session 2**, the first epoch in trial order per category with |q − max(t\*, π)| ≥ 1e-3 at π = 0.181:
  - TP t018, t030;
  - TN t000, t001;
  - FN t011;
  - FP t016;
  - plus `SYN-error-seed509` and `SYN-correct-seed0`.
- `category` ∈ TP/TN/FN/FP/synthetic-error/synthetic-correct, for `SA.errp.synth.nextReplay` (error → TP, TP, FN; correct → TN, TN, FP).

**Python ↔ JS parity note for the SAFETY builder:**
- `research/.cache/parity/errp_ref.json` holds 3 epochs: TP t018, TN t000 and SYN-error. For each it holds the 72 features, score, qTr, Λ, q, t\*, decision and fczMinUv at π = 0.181.
- All of them are computed from the **float32-decoded shipped bytes**, upcast to float64 (ADR 0004 D19).
- `research/errp/js_reference.js` is a Node reference that implements architecture §2.3 with the frozen `SA.dsp.sosfilt` on the exported files. It is research-side only, not POC code.
- Measured max |Δ| vs Python:
  - features 6.2e-15 µV;
  - score 2.6e-15;
  - q 3.3e-16;
  - fczMin 1.8e-15.
- Tolerances: features ≤ 1e-9, score/q ≤ 1e-6, gate 1e-4.
- All 8 exported `expected` decisions are reproduced.
- Things to match:
  - `qTr = 1/(1 + exp(A·score + B))`;
  - `zi[s] = ziUnit[s] · x[0]` after CAR;
  - baseline before windowing;
  - window-major feature order.

**Licence:** CC BY-NC-ND 4.0, Chavarriaga & Millán (BNCI 013-2015). This is a format conversion per §2(a)(4). Embedding is **pending supervisor confirmation**. The fallback after the mid evaluation is [Iwane23] (CC BY 4.0).

## 6. Deviations and open findings

1. **D4.5 segment-vs-continuous tolerance FAILS.**
   - Max |Δfeature| on session 1 is **6.20 / 5.64 / 2.63 / 2.72 / 2.30 / 9.64 µV** (S01–S06). The median on S03 is 0.24 µV. The tolerance is 0.05 µV.
   - Cause: the 4th-order 1–10 Hz band-pass still holds about 7 % of a step 1.2 s after onset. The 1 s pre-roll with step-steady-state zi cannot absorb drift present before the segment.
   - Training, evaluation, export and the browser all use the **same** segment pipeline, so train/browser identity holds. What does not hold is "segment = continuous".
   - Recorded as `xfail` in `test_errp_pipeline.py`. Needs an ADR addendum: a longer pre-roll or a relaxed tolerance.
   - **Impact:** every reported ErrP metric applies to the −1.0…+0.8 s segment pipeline with step-steady-state zi. Feature differences against continuous filtering reach the size of the ErrP itself (Ne −5.3 µV), so performance in a continuous online loop is unvalidated. The browser uses the identical segment pipeline, so the demo is internally consistent.
2. **Synthetic α shortfall:** see §4.
3. **Permutation speed:** sklearn LDA takes 31 ms per fit, about 31 min for 1000 permutations. Permutations use `model.fit_slda_fast`, an exact numpy re-implementation of `LDA(lsqr, shrinkage='auto')`, equal to sklearn to ≤ 2e-14 relative on all 6 subjects (pytest-asserted). The main models use sklearn.
4. **Feature order** is window-major, per the frozen contract §2.3.
5. **Not run (D6 slot 4 slipped):**
   - the [Ferrez08]-style comparator;
   - xDAWN + TS (`pyriemann` is not installed);
   - the isotonic check;
   - the reliability plot.
6. **Exporter location:** the exporter lives in `research/errp/` (ERRP-owned), not `research/export/export_errp.py`. `jswrite.py` follows the ADR 0004 D18 header and format.

## 7. Caveats (D28)

- This is a monitoring paradigm, not interaction (dataset shift).
- Six subjects is a small sample. S2 performance is subject-dependent (S2 AUC 0.669–0.890).
- SCI ErrP amplitudes are about 5× smaller [Keyl19]: wN1 −0.27 vs −1.55 µV.
- [Chavarriaga10] LR+ 2.61 and [FerrezGraz08] 5.15 lie at or below the light-select break-even (≈ 5.5 at π = 0.181). A fixed operating point would be harmful. Even the per-epoch Bayes rule with the nested gate loses on 3 of 6 subjects (§3.2).
- **Segment pipeline only:** every metric holds for the epoch-segmented pipeline (§6 item 1); performance on a continuous online stream is unvalidated.
- **Not clinically valid.** The UI labels each rollback epoch Synthetic or Replay (BNCI 013-2015) in the S5 note (added 2026-10-14, RT2-06).
