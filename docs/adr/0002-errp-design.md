# ADR 0002 — ErrP detector design and the ErrP → KG feedback loop

**Status:** Accepted 2026-10-14 (judge ruling on the `errp-design` debate; transcript: `docs/debate/errp-design.md`).
**Scope:** BNCI 013-2015 protocol, detector, evaluation, calibration, ErrP cost model and rollback thresholds, the Bedside Lamp mechanism, the persistent penalty, the −8.4 µV label, synthetic epochs (gap G7), browser detector, export and parity.
**Plan:** Plan B tonight (mid evaluation 2026-10-15). Every number produced tonight is labelled **PRELIMINARY**. The ErrP pipeline is cheap (sLDA, deterministic), so the full evaluation protocol runs tonight. Plan A changes only config keys.

---

## Context

- PROMPT requires that the ErrP detector genuinely detects ErrPs, does not fire on correct trials, and down-weights the rejected entity so that **Bedside Lamp** becomes the offered alternative.
- README S5 fixes these strings: `Possible Error Detected • ErrP Deflection at FCz (-8.4 µV)`, `ON ➔ OFF`, `Action Rolled Back`, **Bedside Lamp** with `[Retry]` / `[Return to Home]`, and `No Error Detected • Action Confirmed`.
- `_cross-check.md` raised the following, all resolved below:
  - X1/X2: three incompatible penalty mechanisms.
  - X3: a scripted posterior of 0.91.
  - X5/G13: no deployment prior π.
  - X6: High tier vs auto-rollback.
  - X7: two cost tables.
  - X12/G7: the synthetic epoch was never shown to pass the trained detector.
  - S1: a suspected TPR/TNR swap in [Chavarriaga10].
  - G1–G4: parity, float32 vs float64, size budgets, the Node runner.
- Debate outcome:
  - Proposer A (rigor-first) filed an opening proposal.
  - Proposer B (demo-first) failed to file an opening and filed only a rebuttal.
  - The critic found 20 issues. Both rebuttals conceded nearly all of them.
- I verified the decisive fact myself: line 451–453 of the pdftotext extraction of the Infoscience PDF reads "higher detection of correct trials (mean classification accuracy of 75.81% and 63.21% for correct and error trials, respectively)". Line 177 reads "Sessions on the first recording day were used as training set, and session 2 was used for testing".

---

## Decision

### A. Citation and dataset protocol

**D1. Cross-check S1 is REFUTED.**
- [Chavarriaga10]: TNR = 0.758, TPR = 0.632, FPR = 0.242, **LR+ = 2.61**. The p = 0.4 pair is 64.42 % correct / 59.36 % error, in the same order.
- The abstract transposes the order; the body text (p. 385, §IV-B) is authoritative.
- `docs/research/errp.md` §0/§2/§7/§9/§10 stay **unchanged**.
- `_cross-check.md` S1 gets an appended note: "Refuted by full text p. 385; see ADR 0002 D1".
- Struck from the record: Proposer A's 2.06, −2 %, +18 % and +107 %.

**D2. Loader.**
- Module: `research/errp/data.py::load_session(subject:int, session:int) -> Epochs-like dict`.
- Load with `scipy.io.loadmat(path, squeeze_me=True, struct_as_record=False)`. The files are v5 (`MACI64`), so h5py is not needed (closes I8).
- Data structure: `run` has 10 cells; each cell has `eeg` (n × 64, µV) and `header`.
- Sample index = `EVENT.POS − 1`. This is 1-based, verified against MOABB `_convert_run_epfl` (`trigger[run.header.EVENT.POS[ii] - 1]`).
- Channel names = `header.Label[:64]`. Drop the trailing `'Status'`.
- Labels:
  - `session` = file (`_s1` → 1, `_s2` → 2).
  - `block` = run index 0–9.
  - `y = 1` (error) for TYP ∈ {6, 9}; `y = 0` (correct) for TYP ∈ {5, 10}.
  - MOABB is not used, so the MOABB session-regrouping trap cannot occur.
- Codes 1, 2, 4 and 8 are documented as "single-bit codes per `description.pdf`: bit0 target-left, bit1 target-right, bit2 cursor-left, bit3 cursor-right. Lone 4/8 = cursor moves without a target bit. Semantics [UNVERIFIED]. Excluded per paper/MOABB convention."
  - Per-file counts of every code go into `research/runs/<id>/dataset_report.json`.

**D3. Dataset invariants** (`research/tests/test_errp_data.py`).
- Only TYP {5, 6, 9, 10} are epoched.
- The error fraction of every subject-session lies in [0.15, 0.30].
- There are 64 channels, and FCz, Cz, Fz, FC1, FC2, C1, C2 and CPz are present.
- The epoch shape is (n, 64, 922).

**D4. Preprocessing** (`research/errp/preprocess.py`). The same segment-based, online-valid pipeline is used in training, evaluation, export and JS.
1. Raw segment: **−1.0 s to +0.8 s**, fs = 512, **N = 922** samples, event at index **512**.
2. **CAR over all 64 channels.**
   - Justified by S1-LOBO AUC only: 0.794 vs 0.746 (S02) and 0.745 vs 0.704 (S04) against the 8-channel subset reference. These numbers come from the PROBE.
3. Filter design: `sos = scipy.signal.butter(4, [1, 10], btype='bandpass', fs=512, output='sos')`, which gives 4 sections.
   - The filter is applied **causally** with `sosfilt`.
   - Per channel, the step-steady-state initial condition is `zi = sosfilt_zi(sos) * x[0]`.
   - `filtfilt` is rejected because it is not online-valid.
4. Baseline: subtract the per-channel mean of indices **[410, 512)**, i.e. −0.2 to 0 s.
5. Validation that segment filtering equals continuous filtering is a pytest on **session-1 features only**:
   - quantity: max |Δfeature| between segment and continuous-run filtering over S1;
   - tolerance: ≤ 0.05 µV, with the measured value reported.
   - No S2 metric is used for this.

### B. Detector, evaluation, calibration

**D5. Primary detector** (`research/errp/features.py`, `research/errp/train.py`).
- Features: windowed means on 8 channels (Fz, FC1, FCz, FC2, C1, Cz, C2, CPz) × 9 windows.
  - Window k = [round((0.20 + 0.05k)·512), +51 samples) after the event, for k = 0…8, covering 0.2–0.7 s.
  - That gives **72 features**, with no decimation.
- Classifier: `LinearDiscriminantAnalysis(solver='lsqr', shrinkage='auto')` with empirical priors.
  - The score is `decision_function`.
  - The final model is refit on all of session 1.

**D6. Comparators** (Python only; `research/errp/comparators.py`). These run tonight in build-order slot 4, so they slip first.
- (a) [Ferrez08]-style: FCz + Cz amplitudes at 64 Hz in 0.15–0.65 s (64 features), with sLDA.
- (b) `XdawnCovariances(nfilter=4, estimator='lwf')` → `TangentSpace` → `LogisticRegression(C=1.0)` on the D4 epochs, 0–0.8 s.
- Post-mid-eval: EEGNet-8,2, xDAWN + MDM, and an isotonic-calibration sensitivity check.
  - The isotonic check may run tonight if time allows, because it is Python-only.
- **Pre-registered switch rule:**
  - The browser stays on sLDA tonight unconditionally.
  - After the mid eval, switch only if cross-session AUC improves by ≥ 0.03 on ≥ 4 of 6 subjects *and* 1e-4 JS parity is demonstrated.

**D7. Evaluation protocol** (`research/errp/evaluate.py`, config `research/configs/errp.yaml`).

| Role | Protocol |
|---|---|
| **Primary** | Cross-session S1 → S2 per subject, for all 6 subjects. Session 2 is never used for any choice. Labelled **"paper-like, not paper-identical"**. The paper trained on two day-1 conditions (p = 0.2 and 0.4), used about 64 trials per block, Gaussian prototypes on FCz/Cz at 64 Hz, and per-subject electrode/window selection. We train on a single ~0.2 file with about 50 trials per block. |
| Selection + calibration | Leave-one-block-out (LOBO, 10 folds) within S1. Its out-of-fold (OOF) scores fit Platt. |
| Secondary | Blocked LOBO within S2, reported only. |
| Secondary | Random stratified 10-fold, labelled "optimistic, for comparison with [Yasemin23] 77.14 % [UNVERIFIED]". |
| Secondary | LOSO, 6 folds: train on s1 + s2 of the other 5 subjects, test on the held-out subject's s2. |
| Chance | Label-permutation test on S1-LOBO AUC with **1000 permutations tonight** (`errp.permutations: 1000`). There is no Plan A/B split on this item. |

**D8. Metrics, per subject plus mean ± SD.**
- AUC is the primary metric.
- BA, TPR, TNR and LR+ at three thresholds:
  - (i) q_tr > 0.5;
  - (ii) the BA-max threshold chosen on S1 OOF;
  - (iii) each cost class's t* (D13) at π ∈ {0.10, 0.181, 0.223, 0.334}.
- Brier, ECE (10 equal-mass bins), log-loss and a reliability plot on S2.
- ΔE[C] against "never roll back" and "always roll back", per cost class.
  - These are computed by **reweighting class-conditional TPR/FPR to each π**, never on the raw S2 mixture.
- **Success band:**
  - mean cross-session BA at threshold (ii) ≥ **64.5 %** ([Chavarriaga10] 69.5 − 5 pp);
  - AUC above the 95th permutation percentile on ≥ 5 of 6 subjects.
  - Caveats stated alongside: "paper-like" (D7); our BA-max threshold vs their classifier's native operating point.
- Numbers are reported exactly as they come out. All outputs go to `research/runs/<id>/metrics.json` with `"preliminary": true`.

**D9. Calibration.**
- Platt: `LogisticRegression(C=1e6)` on the S1-LOBO OOF scores → (A, B). It is applied to the full-S1 refit model.
  - Disclosed as equivalent to `CalibratedClassifierCV(ensemble=False)`.
  - Disclosed that the score scale may shift slightly with shrinkage.
- Prior shift [Saerens02], with π_tr = the S1 error rate:
  - Λ = q_tr/(1 − q_tr) · (1 − π_tr)/π_tr
  - q = Λπ / (Λπ + 1 − π)

**D10. Deployment subject.**
- The deployment subject is the S1-LOBO-AUC argmax over the **eligible** subjects {S01, S03, S05, S06}.
- S02 and S04 are **ineligible**, because their S2 EEG was viewed during design (Proposer A's probe). This is a pre-registered contamination rule, not a performance-based choice.
- Expected result: S01 (PROBE S1-LOBO AUC 0.876, Proposer B). The official pipeline value decides.
- Ledger in every results table:
  - S02 and S04: "S2 viewed during design (exploratory probe)".
  - S01 s1 and S05 s2: "event codes scanned only (no EEG)".
  - Means are reported both with and without S02/S04.

**D11. Prior π: a modelling convention, not a calibrated probability.**
- After **EXECUTE**: π = 1 − c, where c is the policy's combined score (Debate 5's combination rule; X4 open). Canonical value: 1 − 0.819 = **0.181**.
- After **CONFIRM**, or a preset diff-preview commit:
  - π' = (1−c)·f / ((1−c)·f + c·t), with f = 0.074 (false-confirm) and t = 0.913 (true-confirm) [UX §2.2, MODEL];
  - keys: `SA.config.errp.confirmRates = {trueConfirm: 0.913, falseConfirm: 0.074}`.
- Floor: π ≥ 0.02.
- In Replay the trace shows both identities, e.g. `MI: IV-2a A0x · ErrP: BNCI013 S01 s2 #k`.

### C. Cost model, thresholds, modes

**D12. One cost table (`SA.config.costs`) feeds the ErrP thresholds only. The policy thresholds are a separate, declared constant set.**
- `SA.config.costs` is the single source of ErrP token costs. Units are **nominal MI tokens**.
- Cells are **computed at load time** from `SA.nav` shortest paths (BFS over the Debate 6/7 screen graph), never hand-entered.
  - A selftest plus pytest asserts that the table matches the navigator.
- General form:
  - C_FN = undo + reach-intended + H(tier);
  - C_FP = re-issue path + 1 (CONFIRM forced by the h-flag, D18);
  - C_TP = p_alt·(Retry path) + (1 − p_alt)·(re-navigate path), with p_alt = P(alternative correct | h* wrong) from the resolver (≈ 0.52, errp §10.1).
- H (ErrP-table parameter): **Low 0, Medium 4, High 20**.
- Tier is read from the shared device config. Until Debate 5/7 resolves X8, the default is the **higher** tier where briefs disagree (Night Mode Medium; AC power/mode Medium).
- The policy's EXECUTE/CONFIRM/REJECT thresholds are Debate 5's constants. Placeholder until then is UX D2: Low 0.75, Medium 0.85, REJECT < 0.50, High → CAREGIVER.
  - They are documented as derived in expected-token units at P = 0.777 [MODEL].
  - They are **not** recomputed from `SA.config.costs`, because consistent units would make the README canonical case CONFIRM (critic #4).
  - Selftest: canonical c = 0.819 → EXECUTE.
- What the two stages share: the tier map, H, the h-flag, and the trace display. The policy never takes ErrP credit, so there is no circularity.
- Resolution of X7: one data table, two derivations with explicit units. Not one formula.

**D13. Decision rule** (`SA.errp.detector`).
- Roll back iff **q > max(t*(class, tier), π)**, with t* = C_FP / (C_FP + C_FN − C_TP).
- The floor q > π is equivalent to Λ > 1. Evidence favouring "correct" can never roll back.
- t* is computed in `SA.config`, never hard-coded and never 0.5.
- Recursion: Python computes the fully recursive t* (C_FP/(1 − FPR(t*)), fixed point on S1 nested OOF) and asserts |Δt*| < 0.02 against the closed-form JS t*. If the check fails, Python exports the recursive C_FP as `SA.config.costs.override` and the JS uses it.
- Python reports the preset FPR at t* on S1 OOF.
- Provisional values. BACK on the alternative card = `[Return to Home]` per UX D7, pending the Debate 7 ruling; any change recomputes automatically.

  | Class | C_FP | C_FN | C_TP | t* | Break-even LR+ at π = 0.181 |
  |---|---|---|---|---|---|
  | `light-select` (README S5) | 5 | 7 | 2.92 | **≈ 0.55** | ≈ 5.5 |
  | `power` (fan/TV power), Low | navigator | navigator | navigator (no alternative) | computed | computed |
  | `setting` (fan speed, TV ch/vol, **brightness**), Low | 1 | 2 | 2 | **1.0 → never auto-roll back; flag only** | — |
  | `setting`, Medium (AC setpoint in band) | navigator | +4 | navigator | computed (≈ 0.2) | computed |
  | `preset` (Night Mode), at the post-confirm π' | 5 | 15 | 3 | **≈ 0.29** (floor q > π' also applies) | computed |

- Stated in the docs: [Chavarriaga10] LR+ 2.61 and [FerrezGraz08] LR+ 5.15 both lie at or below the `light-select` break-even, so **a fixed operating point would be harmful**. Only the per-epoch Bayes rule on calibrated q (rolling back where Λ(x) exceeds break-even) can avoid harm.

**D14. Below break-even: keep auto-rollback, with a disclosed per-subject mode gate.**
- Key `SA.config.errp.mode ∈ {'auto', 'flag'}`.
- **Nested gate:** for each S1 block, fit Platt on the other 9 blocks' OOF scores and compute ΔE[C] for `light-select` at π = 0.181 on the held-out block; aggregate over the 10 rotations.
  - Result: `'flag'` if aggregate ΔE[C] ≥ 0, otherwise `'auto'`.
  - The verdict is written to `metrics.json`, to this ADR's results addendum, and to the export.
- **Scripted mode is always `'auto'`**, so README S5 is reproduced verbatim. The epoch is labelled "Synthetic".
- Replay honours the gate.
- `'flag'` outcome **tonight**:
  - S5 status `Possible Error Detected • not rolled back (flag only)`;
  - an `ERRP_OBS` audit-log entry with q, π, t* and epoch id;
  - **no state change**.
  - The one-token undo UI is post-mid-eval.

**D15. `setting` class.**
- Same flag-only outcome as D14: status `Possible Error Detected • not rolled back (setting: flag only)`, an `ERRP_OBS` entry, and the posterior in the trace.
- The Medium-tier AC setting still auto-rolls back at its t*.

**D16. High tier, caregiver-approved actions: never auto-rolled back.** This resolves X6 in favour of UX D9; errp's t* = 0.174 is rejected.
- The epoch is time-locked to the **onset of the approval-result announcement to the patient** (S5 result shown and spoken), not to actuation.
- **Tonight: log-only.** An `ERRP_OBS` entry records q, π and the epoch id in the caregiver audit log. There is no alert, no new queue item and no threshold.
- Post-mid-eval, pending a Debate 7 ruling (the item is README-silent):
  - a "Patient may disagree [Undo]/[Keep]" item;
  - its own alert-cost row (C_false-alert vs C_missed-disagreement → t_alert).
- A compensation that would *enter* a hazard escalates to CAREGIVER [UX §7.2].

**D17. Repeat ErrP.**
- At most one automatic alternative per episode.
- A second rollback in the same episode returns to Home and writes a caregiver-visible log entry (errp D11).

### D. ErrP → KG loop

**D18. Bedside Lamp: the two layers named explicitly** (resolves X1/X2).
- **Episode layer (offer selection):** after a rollback, the offered alternative = argmax of the re-ranked candidates **excluding h*** (second-best rule [Perrin12]). This guarantees an offer even when the ranking does not flip.
- **Persistent layer (one penalty form, in the resolver):**

  `S'(d) = S(d) · M(d)`,  `M(d) = max(0.5, min(1, Π_k Λ_k^(−γ · 2^(−n_k/20))))`

  - γ = 0.5 (`SA.config.errp.penalty.gamma`).
  - Λ_k = q_tr/(1 − q_tr)·(1 − π_tr)/π_tr of observation k.
  - Only observations whose decision was `rollback` or `flag` and that have Λ_k > 1 are stored, so there are no boosts.
  - n_k = resolver decisions in the same (room, command) context since observation k. The decay counts **interactions**, not minutes.
  - Floor 0.5 (`penalty.floor`); half-life 20 (`penalty.halfLife`).
  - Scope: (user, room, command, entity).
  - Stored as a KG `:ErrPFeedback` record (q, Λ, π, n).
  - **Reset clears it.**
- **M applies to ranking, offer selection and display only. It never touches the `s` that feeds the policy.**
  - Its only policy effect is the h-flag: M(d) < 0.9 escalates EXECUTE to CONFIRM. This replaces UX `errpMemoryMs`.
  - The S4 panel shows the unpenalised SPARQL Match plus a trace line, e.g. `ErrP memory ×0.50 (ranking only) → CONFIRM`.
- **Rejected** (see below): KG's subtractive λ = 0.30 with a 60-minute half-life.
- **Canonical consequence:** under D13, any `light-select` rollback at π = 0.181 implies Λ > ≈ 5.5, so M hits the 0.5 floor.
  - Ceiling 0.94 → 0.47 < Bedside 0.88.
  - So in the canonical case the **ranking flip and the second-best rule coincide**, and PROMPT's "down-weighting makes Bedside the alternative" holds literally. A selftest asserts both.
- **Disconfirmation:** if the penalised entity is re-selected, executed, and the next q ≤ t*, delete the record. The γ = 1 upgrade on an accepted alternative is post-mid-eval.
- **Selftest:** false rollback → `[Return to Home]` → re-select Ceiling → policy gives **CONFIRM, never REJECT** → SELECT executes.

**D19. No scripted posterior anywhere.**
- KG CQ14's 0.91 (X3) is replaced by the detector's computed q of the epoch that actually ran.
- Scripted mode injects a synthetic **epoch**, not a probability.

### E. −8.4 µV and synthetic epochs (G7)

**D20. Labelling.**
- −8.4 µV is a **plausible but non-diagnostic single-trial value**, defined as "single-trial FCz minimum, 200–350 ms in filtered-signal time (causal 1–10 Hz, CAR, baseline −0.2–0 s); descriptive only; detection uses 72 multichannel features". The measured filter group delay is reported in `docs/errp.md`.
- Scripted mode shows the README string **verbatim**. The value is **computed** from the synthetic epoch and equals −8.4 by construction (D21).
- Replay shows the same README format with the measured value plus an adjacent caption: `descriptive single-trial value; detection uses 72 features; q = …`.

**D21. Synthetic generator** (`research/errp/synth.py`). Epochs are generated in Python and exported; there is no JS RNG.
- **Format:** 64 × 922 raw-like samples, with a per-channel DC offset ~ U(−2000, 2000) µV to exercise the zi initialisation.
- **Background:**
  - 64 independent unit-variance 1/f (pink) sources plus a 10 Hz alpha component;
  - spatially mixed by the **symmetric square root** (`eigh`, negative eigenvalues clipped to 0) of the deployment subject's S1 pre-stimulus (−1.0 to 0 s) CAR spatial covariance. Cholesky is rejected because the CAR covariance has rank 63;
  - plus small independent sensor noise;
  - scaled so the post-pipeline FCz SD equals the subject's S1 value.
- **ErrP component:**
  - Gaussian bumps (σ = 30 ms) at the subject's S1 grand-average error-minus-correct latencies (Ne, Pe, late negativity; up to 4 components);
  - shifted earlier by the numerically measured filter group delay;
  - **per-component topographies**, each taken from the S1 difference at that component's peak;
  - scaled by α ∈ {1.0, 1.25, …, 2.5} under caps FCz |Ne| ≤ 4.1 µV and Pe ≤ 8 µV [Yasemin23].
- **Deterministic selection:**
  1. α = the smallest grid value at which ≥ 80 % of 200 seeds give q > t*_light + 0.10 at **π = 0.10**, the lowest π in the demo script. If no α qualifies, take the largest α and **report the shortfall**.
  2. Error demo seed = the first seed in 0..99 999 with round(FCz min, 1) = **−8.4** and q ≥ t*_light + 0.10 at π = 0.10. Because q is monotone in π, this holds for all π ≥ 0.10.
  3. Correct demo seed = the same generator with no component; the first seed with q ≤ 0.10 at π = 0.36.
- **Disclosed** in `docs/errp.md` and the harness caption: α, the 200-seed synthetic TPR *and* synthetic FPR (no-component epochs with q > t*), and "detection depends on the prior π; above c ≈ 0.90 the detector may keep".
- The covariance and topographies are derived statistics under the dataset licence caveat (D27). They are not exported themselves.

**D22. Tests that close G7.**
- `research/tests/test_errp_synth.py`, on the exported weights:
  - q(synth-err) > max(t*, π) and the decision is `rollback`, at π ∈ {0.10, 0.181, 0.36};
  - q(synth-cor) < t* at the same π values;
  - FCz min = −8.4 ± 0.05 µV.
- The JS selftest repeats the decision assertions.
- `[Simulate ErrP]` **fails loudly** (shows q and "detector disagreed") if q ≤ the threshold at the current sliders. It never forces a rollback.

**D23. Harness buttons.**
- `[No ErrP]` and the ErrP auto-confirm toggle both run the **synthetic-correct epoch** through `SA.errp.detector.observe`. The decision is computed, never set.
- The ErrP-health gauge on the caregiver dashboard shows:
  - deployment-subject S2 AUC and BA at t*, labelled PRELIMINARY;
  - last q;
  - current mode.

### F. Browser, export, parity

**D24. JS modules.** Classic IIFEs on `SA`, float64 throughout, ≤ 400 lines each.
- `POC/js/dsp/butterworth.js` → `SA.dsp.butterworth.sosfilt(sos, x, zi)`. Coefficients are never designed in JS.
- `POC/js/errp/features.js` → `SA.errp.features`. Steps: base64 → Float32 → Float64Array, CAR, step-zi sosfilt, baseline, 72 window means, FCz min.
- `POC/js/errp/classifier.js` → `SA.errp.classifier`: `score = w·x + b`, `platt`, `priorShift(qTr, piTr, pi)`, `lr(qTr, piTr)`.
- `POC/js/errp/detector.js` → `SA.errp.detector`:
  - `threshold(costClass, tier)`;
  - `observe(epoch, ctx)` → `{score, qTr, q, lambda, tStar, pi, decision: 'rollback'|'keep'|'flag'|'log', fczMinUv}`;
  - emits `errp:observed` on `SA.bus`.
- `POC/js/errp/memory.js` → `SA.errp.memory`: the M(d) records. It is read by the KG resolver via `SA.bus`/`SA.store` only.
- `POC/js/errp/synth.js`: a thin accessor over the exported synthetic epochs.
- Config keys:
  - `SA.config.errp.observeMs = 1000` (X10);
  - `SA.config.errp.mode`;
  - `SA.config.errp.penalty = {gamma: 0.5, floor: 0.5, halfLife: 20, hFlag: 0.9}`;
  - `SA.config.errp.confirmRates`;
  - `SA.config.errp.piFloor = 0.02`.

**D25. Export** (`research/export/export_errp.py`).
- `POC/js/data/errp-model.js` (< 10 KB) assigns `window.SA.data.errpModel`:

  ```
  { version, preliminary: true, dataset: 'BNCI 013-2015', subject, trainedOn: 's1 all 10 blocks',
    fs: 512, nSamples: 922, eventIndex: 512, reference: 'CAR64', channels: [64], featureChannels: [8],
    fczIndex, sos: [[6]×4], baseline: [410, 512], windows: [[start,end]×9], w: [72], b,
    platt: {A, B}, piTrain, groupDelayMs, mode: 'auto'|'flag', modeGate: {...},
    s2Metrics: {...}, synth: {alpha, tpr, fpr, nSeeds: 200, errSeed, corSeed},
    licence: 'CC BY-NC-ND 4.0, Chavarriaga & Millán (BNCI 013-2015); format conversion per §2(a)(4); pending supervisor confirmation' }
  ```

  - zi is computed in JS from `sos` × x[0] using the exported unit-step `ziUnit: [[2]×4]` (= `sosfilt_zi(sos)`).
  - Numbers are written with Python `repr` (17 significant digits).
- `POC/js/data/errp-replay.js` (**≤ 2.6 MB**) assigns `window.SA.data.errpReplay`. Each epoch is:

  `{id, source:'replay'|'synthetic', subject, session, block, trial, label, eventType, dataB64 /* float32 LE, channel-major 64×922 */, expected:{score, q, decision} /* at canonical π = 0.181 */, fczMinUv}`.

  - Contents: the deployment subject's **session 2** real epochs, **2 TP, 2 TN, 1 FN, 1 FP**, chosen as the first in trial order per category with |q − t*| ≥ 1e-3 at π = 0.181. Plus **2 synthetic** (error and correct). 8 × ~315 KB ≈ 2.52 MB.
  - Selection is disclosed. Generated data files are exempt from the 400-line rule.

**D26. Parity** (`research/tests/test_errp_parity.py` → `node research/export/node_runner.js`).
- The runner sets `globalThis.window = {}`, loads the POC scripts in `index.html` order via `vm`, and dumps per-stage JSON.
- Python reads the **same float32-decoded samples** and upcasts to float64 (closes G2 for ErrP).
- Tolerances:
  - features ≤ 1e-9 µV;
  - score and q ≤ 1e-6;
  - acceptance gate is the mandated 1e-4.
- Every exported epoch has |q − t*| ≥ 1e-3 at canonical π, so a parity error cannot flip a stored decision (the G1 analogue). The guard applies at that π only, as stated.

**D27. Licence.**
- Raw excerpts are embedded with attribution, citing CC BY-NC-ND 4.0 §2(a)(4) (technical format modification does not create Adapted Material).
- Marked "**pending supervisor confirmation**".
- Fallback post-mid-eval: [Iwane23] (CC BY 4.0).

**D28. Caveats in `docs/errp.md` and the ErrP-health tooltip.**
- Monitoring paradigm, not interaction.
- Six subjects is a small sample.
- SCI ErrP amplitudes are about 5× smaller [Keyl19]: wN1 −0.27 vs −1.55 µV.
- Not clinically valid. The UI always labels epochs Synthetic or Replay (BNCI 013-2015).

---

## Rejected alternatives

| Alternative | Reason |
|---|---|
| "Correct" errp.md to TPR 0.758 / TNR 0.632 (LR+ 2.06) | Refuted by the full text, p. 385. The abstract is transposed. |
| MOABB loader | Not installed. A direct v5 loader is verified and avoids the session-regrouping trap. |
| 8-channel subset reference | Lower S1-LOBO AUC (≥ 4 pp) than CAR-64. |
| Zero-phase `filtfilt` | Not online-valid; would break training/browser identity. |
| Decimation before windowing | Window means are already the anti-aliased reduction. |
| EEGNet or xDAWN+TS as the browser model tonight | Unverified parity and run time; the switch rule is pre-registered for after the mid eval. |
| 200 permutations (Plan B split) | 1000 cost about a minute. |
| Choosing the deployment subject among all six | S02/S04 S2 were viewed; the contamination rule makes them ineligible. Disclosure alone (Proposer B) was weaker, and the outcome (S01) is the same. |
| A single formula coupling policy EXECUTE thresholds to the ErrP table (Proposer A's opening) | Works only by mixing expected and nominal units. Consistent units break README canonical EXECUTE (critic #4). |
| Hand-entered cost cells; Proposer A's 0.5/0.5 C_TP split | They contradict the screen graph. The navigator derives cells; p_alt comes from the resolver. |
| errp.md's High-tier t* = 0.174 auto-rollback; Proposer B's alert reusing light-select t* | Two humans approved the action (UX D9). Reusing t* is ad hoc. The queue item is README-silent and needs Debate 7. |
| Global "flag-and-confirm" for every action | Would contradict the README S5 auto-rollback. The per-subject nested gate plus disclosure is the honest middle. |
| A rollback threshold without the Λ > 1 floor | Presets (t* < π) would roll back on evidence favouring "correct" (critic #6). |
| KG subtractive penalty (λ = 0.30, 60-minute half-life) | Wall-clock units, not interpretable as evidence, and nondeterministic across demo resets. |
| Penalty entering the policy's `s` | Locks the user out: c < 0.50 → REJECT after a false rollback (critic #5). |
| UX `errpMemoryMs` as a separate mechanism | Subsumed by the h-flag M < 0.9. |
| Scripted posterior 0.91 (KG CQ14) | PROMPT requires genuine detection; q is computed. |
| −8.4 µV as a grand-average value | 2× the literature; the probe confirms it is a single-trial value. |
| Random 64 × 9 mixing matrix for synthetic background | Arbitrary covariance makes q arbitrary relative to sLDA weights. |
| Cholesky mixing | CAR covariance is rank 63. |
| A real S2 epoch with exactly −8.4 µV for Scripted mode | About 1/3 chance one exists; a second code path tonight for a coin-flip. |
| Replay set 2 TP / 1 TN / 1 FN / 0 FP | Hides the costliest failure (false rollback). |
| float32 DSP in JS | Causal IIR error accumulation; float64 throughout. |

## Residual dissent

1. **BACK on the alternative card.**
   - Proposer A: Tongue ascends to the fixture's S4, so C_FP = 2 and t* ≈ 0.40–0.49.
   - UX D7 and Proposer B: BACK = `[Return to Home]`, so C_FP = 5 and t* ≈ 0.55.
   - This ADR adopts D7 provisionally. It is the README-literal button, and it is the conservative choice (fewer false rollbacks).
   - Debate 7 owns the ruling. The navigator-derived costs recompute with no code change.
2. **"One unified cost model".** PROMPT/X7 asked for one table driving both policy and ErrP. This ADR delivers one data table with two derivations. A single coupled formula is incompatible with README canonical EXECUTE under consistent units. Revisit if Debate 5 changes the threshold derivation.
3. **Deployment-subject exclusion.** Proposer B argued that excluding S02/S04 is itself S2-informed. The judge holds that excluding *viewed* subjects is neutral to their performance. The outcome is the same either way.
4. **Whether auto-rollback is net-beneficial at all.** On the evidence (LR+ 2.61–5.15 vs break-even ≈ 5.5), a fixed operating point is harmful, and a calibrated per-epoch rule may be break-even. The README mandates the demo behaviour. The nested gate and the per-subject ΔE[C] disclosure are the honesty mechanism.

## Consequences

- The README S5 Scripted path is reproduced byte-for-byte, and every number on it is computed by the trained detector on a disclosed synthetic epoch. G7 is closed by tests.
- The rollback rate in Replay will be low. Proposer B's PROBE: for S01, TPR ≈ 0.5 at FPR < 1 % at t* ≈ 0.55. That is correct behaviour under these costs, and it will be shown and explained, not hidden.
- Cost cells depend on Debates 5–7. Their rulings change thresholds automatically and require a re-export of `expected` fields only.
- `docs/errp.md` must carry: D1 (S1 refuted), the "paper-like" label, the contamination ledger, synthetic α/TPR/FPR, the group delay, the mode-gate verdict, per-subject ΔE[C], and the D28 caveats.

## Tonight vs post-mid-eval

**Tonight. Build order; slots 1–3 cannot slip, slot 4 slips first:**
1. `research/errp/{data,preprocess,features,train,calibrate,evaluate,synth}.py`, `research/configs/errp.yaml`, `research/export/{export_errp.py,node_runner.js}`, and tests `test_errp_data.py`, `test_errp_pipeline.py`, `test_errp_synth.py`, `test_errp_parity.py`. Full D7 protocol on sLDA with 1000 permutations, PRELIMINARY.
2. JS: `dsp/butterworth.js`, `errp/{features,classifier,detector,memory,synth}.js`, `data/errp-model.js`, `data/errp-replay.js`. Scripted path plus selftests:
   - README S5 byte-exact;
   - ranking flip plus second-best offer = Bedside;
   - false-rollback re-issue gives CONFIRM;
   - canonical EXECUTE;
   - costs table matches the navigator;
   - synthetic decisions at 3 priors.
3. Replay mode, the flag-only status (D14/D15), High-tier log-only (D16), ErrP-health gauge, auto-confirm via the synthetic-correct epoch.
4. Comparators (a) and (b), LOSO, random 10-fold, isotonic sensitivity.

**Post-mid-eval:**
- EEGNet-8,2 and xDAWN + MDM, plus the switch-rule evaluation.
- The `'flag'` one-token undo UI.
- High-tier "Patient may disagree" queue item with its alert-cost row (needs Debate 7).
- The γ = 1 confirmed-alternative upgrade and adaptation samples.
- Using codes 1/2/4/8 as "goal reached" analogues.
- [Iwane23] fallback if NC-ND is rejected.
- Plan A re-run with a fresh run id. Plan A is identical for ErrP except for dropping the PRELIMINARY label once the MI-side Plan A completes.

## Revisit conditions

- Debate 7 rules BACK ≠ `[Return to Home]`, or changes the screen graph or pre-focus. Costs recompute automatically; re-export `expected` and re-check the |q − t*| guard.
- Debate 5 changes the combination rule for c (X4) or the tier map (X8). π and thresholds recompute; re-run the synthetic seed selection.
- The supervisor rejects embedding NC-ND data. Switch to [Iwane23] or synthetic-only Replay.
- A comparator meets the D6 switch rule.
- The official S1-LOBO winner is not S01, or the nested gate returns `'flag'` for the deployment subject. The plan stays the same, but the change is disclosed and the Replay narrative is updated.
- Synthetic selection fails: no α meets 80 %, or no −8.4 seed exists within the search. Report it, and bring it back to the judge rather than forcing the result.
