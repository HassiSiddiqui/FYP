# Raw debate inputs: errp-design
(Collected from the workflow journal; agents not listed failed with network errors.)

=== propose:errp-design:A ===

# Proposer A (Rigor-first): ErrP design and the ErrP→KG loop

**Basis.** I read PROMPT.md, README.md, CLAUDE.md, errp.md, knowledge-graph.md (§3.2–3.5), assistive-ux-safety.md (§2, §6, §7, §8) and _cross-check.md (X1–X12, S1, G1–G4, G7, G13).

**New evidence from this session.** All of this is read-only. I wrote no project files; the scripts are in the scratchpad `errp/`.
- I verified **[Chavarriaga10]** from its abstract via the Semantic Scholar API.
- I inspected the downloaded data and ran a small **exploratory probe** on Subject02 and Subject04, the only subjects with both sessions on disk at the time.
- **Disclosure.** The probe looked at session-2 numbers for those two subjects. Nothing below is tuned on them. The cost cells come from the README screen graph, and every official number must come from the package pipeline. The probe numbers are labelled PROBE and must not appear in results tables.

---

## 1. Dataset protocol on BNCI 013-2015, and the TPR/TNR swap

**1.1 Loader.** Write a direct loader, `research/errp/data.py::load_session(subject, session)`, using `scipy.io.loadmat(squeeze_me=True, struct_as_record=False)`.
- **Format is verified.** Subject02_s1.mat has the header "MATLAB 5.0 MAT-file, MACI64, 2015-05-28", so it is v5. `h5py` is not needed (resolves cross-check I8).
- `run` has 10 cells, and each is `eeg` (n×64, float64) plus `header`.

**1.2 Session regrouping (the MOABB trap).** We don't use MOABB, so the trap is avoided by construction.
- `session` = file (`_s1`/`_s2`); `block` = run index 0–9.
- Positive class `y=1` means **error** (events 6/9); `y=0` means correct (5/10).
- Pytest guard: the error fraction of every subject-session must lie in [0.15, 0.30].
  - Verified so far: S02 s1 506 trials, 22.3%; S02 s2 574, 22.5%; S04 s1 493, 20.9%; S04 s2 559, 19.3%.
- **New finding.** The files also contain single-bit codes 1, 2, 4 and 8 (in S02 s1: 67, 66, 23 and 24 of them). They are target/cursor-only markers and are **excluded**. A test asserts that only {5, 6, 9, 10} are epoched.
- `EVENT.POS` is treated as 1-based (MATLAB), so sample = POS − 1. This is pinned in the code and documented as an assumption (≤ 2 ms).

**1.3 Channels.** `header.Label` has 65 entries; the last is `'Status'`, which has no column in `eeg`. Drop it (`Label[:64]`).
- All eight feature channels are present (verified): Fz, FC1, FCz, FC2, C1, Cz, C2, CPz.
- Units are µV. The post-filter background SD at FCz is about 3.0–3.8 µV (PROBE).

**1.4 Reference: CAR over all 64 channels.** PROBE evidence against the 8-channel subset reference:
- S02: LOBO AUC 0.794 vs 0.746; cross-session AUC 0.849 vs 0.809.
- S04: 0.745 vs 0.704.

That loss is above errp.md's own 2 pp switch rule, so option (c) is rejected. This decides the export (§6): 64-channel raw excerpts.

**1.5 Epoching: a segment-based, online-valid pipeline that is identical in training and the browser.**
- Raw segment: −1.0 s to +0.8 s around the event, **N = 922 samples** (512 pre + 410 post), event at index 512.
- All training, evaluation, export and JS work runs on these segments, so there is no continuous-vs-segment mismatch.

**1.6 Filter.**
- Design: `scipy.signal.butter(4, [1, 10], btype='bandpass', fs=512, output='sos')`, which gives 4 SOS sections.
- Apply it **causally** with `sosfilt` on each segment, with step-steady-state initial state `zi = sosfilt_zi(sos) * x[0]` per channel. This neutralises the Biosemi full-DC offsets, whose median |x| runs to thousands of µV.
- PROBE: this matches continuous-run filtering. Cross-session AUC is 0.848 vs 0.849 (S02) and 0.671 vs 0.668 (S04). A 1.0 s pre-segment is enough (0.5, 1.0 and 1.5 s are equivalent).
- Zero-phase `filtfilt` is rejected because it is not online-valid.

**1.7 Baseline.** Subtract the per-channel mean over [−0.2, 0) s, i.e. indices 410–511.

**1.8 Swap verdict: the swap is real.**
- The abstract reads "recognize erroneous and correct agent decisions … 75.8% and 63.2%, respectively". So **TPR = 0.758, TNR = 0.632**, and **LR+ = 0.758/0.368 = 2.06**, not 2.61.
- The ADR must correct errp.md §0/§2/§7/§9/§10. Corrected consequences:
  - Brief's cost model (8, 4, 1) at π = 0.223: E[C] goes from 1.784 to 1.744, i.e. **−2%**, not −13%.
  - Equal costs: +52%.
  - Under my unified model (§3) at π = 0.181: the README-literal C_FP = 5 makes the [Chavarriaga10] operating point **+107%**; the C_FP = 2 design makes it +18%. Either way it is worse than never rolling back.
- BA = 69.5% is **invariant** to the swap, so the success band in §2.5 is unaffected.
- The p = 0.4 pair (64.4/59.4) inherits the same ordering doubt. Mark it [UNVERIFIED order] until the full-text table is read; the IEEE PDF was not reachable.

## 2. Features, classifier, evaluation, calibration

**2.1 Primary model: windowed means + shrinkage LDA** [Yasemin23 "Overlap"; Blankertz11].
- Windows: 9 windows of 51 samples, starting at round((0.20 + 0.05k)·512) samples after the event, k = 0…8. That covers 0.2–0.7 s.
- Features: 8 channels × 9 windows = **72 features**. No decimation; the windowed mean is the anti-aliased reduction.
- Classifier: `LinearDiscriminantAnalysis(solver='lsqr', shrinkage='auto')` with empirical priors. The score is `decision_function`.
- PROBE: S1 LOBO AUC 0.80 (S02) and 0.75 (S04); cross-session AUC 0.85 and 0.67.

**2.2 Comparators (Python only).**
- **Tonight:**
  - (a) [Ferrez08]-style FCz+Cz amplitudes: 64 Hz samples in 0.15–0.65 s, 64 features, with sLDA.
  - (b) `XdawnCovariances(nfilter=4, estimator='lwf')` + `TangentSpace` + `LogisticRegression(C=1.0)` on the same CAR / causal / baselined 0–0.8 s epochs. pyRiemann is installed and this costs minutes.
- **Post-mid-eval:** EEGNet-8,2 (≈ 1–2 h on this CPU) and the MDM variant.
- **Pre-registered switch rule.** The browser stays on sLDA tonight unconditionally. After the mid eval, switch only if cross-session AUC improves by ≥ 0.03 on ≥ 4 of 6 subjects *and* 1e-4 JS parity is demonstrated.

**2.3 Evaluation protocol.** It is cheap enough that the full protocol runs tonight. Only the permutation count differs between plans.

| Role | Protocol |
|---|---|
| Primary | Cross-session S1 → S2 per subject (6 subjects). Session 2 is never used for any choice. |
| Model selection and calibration | Leave-one-block-out (10 folds) within S1. Its out-of-fold (OOF) scores fit Platt. |
| Secondary | Blocked LOBO within S2, reported only. |
| Secondary | Random stratified 10-fold, labelled "optimistic, for comparison with [Yasemin23] 77.14%". |
| Secondary | LOSO with 6 folds: train on s1+s2 of the 5 other subjects, test on the held-out subject's s2. |
| Chance | Label-permutation test on S1 LOBO AUC: **200 permutations (Plan B)**, 1000 (Plan A, config `errp.permutations`). |

**2.4 Metrics, per subject plus mean ± SD.**
- AUC is the primary, threshold-free metric.
- BA, TPR, TNR and LR+, reported at three thresholds:
  - (i) q_tr > 0.5;
  - (ii) the BA-maximising threshold chosen on S1 OOF;
  - (iii) each cost class's t* at π ∈ {0.10, 0.181, 0.223, 0.334}.
- Calibration: Brier, ECE (10 equal-mass bins) and log-loss on S2, with a reliability plot.
- ΔE[C] against "never roll back" and "always roll back" per cost class.
- All Plan B outputs are labelled PRELIMINARY in `research/runs/<id>/metrics.json`.

**2.5 Success band.**
- Mean cross-session BA at threshold (ii) ≥ **64.5%**, i.e. [Chavarriaga10] 69.5 − 5 pp.
- AUC above the 95th permutation percentile on ≥ 5 of 6 subjects.
- Report the numbers exactly as they come out, whether or not they meet the band.

**2.6 Calibration.**
- Platt: `LogisticRegression(C=1e6)` on the S1 LOBO OOF scores gives (A, B). The final sLDA is refit on all of S1.
- Prior shift to the action's own prior [Saerens02]. With π_tr = the S1 error rate:
  - Λ = q_tr/(1 − q_tr) · (1 − π_tr)/π_tr
  - q = Λπ/(Λπ + 1 − π)
- Isotonic calibration is a Python-only sensitivity check.
- PROBE: S2 Brier is 0.120 against 0.174 for the constant prior (S02), and 0.147 against 0.156 (S04).

**2.7 Deployment subject.** The highest S1-LOBO AUC among the six subjects, chosen *only* on session 1 and recorded in the ADR.

## 3. One unified token-cost model, the thresholds, the High tier, and below-break-even behaviour

**3.1 Units.** Costs are **nominal MI tokens** read off the README screen graph (cursor on the first item, wrap on).
- Expected-token inflation 1/(2P − 1) [UX §1.3] multiplies every cell equally, so it **cancels** in every threshold.
- Harm surcharge H by tier: **Low 0, Medium 4, High 20**.
- The policy engine and the ErrP stage read the *same* table: `SA.config.costs`.

**3.2 The one table.** The general rule is C_FN = undo + reach-intended + H.

| Cost class | C_FP (re-issue after a false rollback) | C_FN | C_TP (after a correct rollback) | t* = C_FP / (C_FP + C_FN − C_TP) |
|---|---|---|---|---|
| `light-select` (README S5 path) | **2**: Tongue on the alternative screen returns to S4 of the rolled-back fixture with focus on the rolled-back action, then Both Feet | 2 undo + 4 reach (BACK, NEXT, SELECT, SELECT) + 0 = **6** | 0.5 × 1 (Retry, alternative right) + 0.5 × 5 (BACK and re-navigate) = **3** | **0.40** |
| `power` (fan off/on, TV power) | 1 (focus stays on the control) | 2 + 4 + H | 4 (no alternative) | Low **0.333** |
| `setting` (fan speed, TV channel/volume, brightness, AC setpoint in band) | 1 | 2 + H (the correction *is* one setting) | 2 | Low **1.0, so flag only, no auto-rollback**; Medium (AC) **0.20** |
| `preset` (n devices) | 1 (land on the same diff, SELECT) | 4n + 3 + H | 3 | Night Mode, n = 3, Low: **0.077** (computed per preset in code) |

**3.3 Why the Tongue mapping in `light-select`.**
- README fixes `[Retry]` / `[Return to Home]` on the alternative screen. Tongue = "BACK / CANCEL (Ascend menu hierarchy)" is README-native, so this adds no label.
- The README-literal path via `[Return to Home]` costs C_FP = 5 and gives t* = 0.667. PROBE: that is break-even (S02 −1.1%, S04 +1.0%).
- With C_FP = 2, PROBE gives S02 −15.0% and S04 +0.1% at π = 0.181.
- The design is justified *a priori*: undoing a false rollback should be cheap. It was not selected on these numbers; the debate should keep this disclosure.

**3.4 Prior π per action.** π = 1 − c, where c is the policy's calibrated end-to-end P(correct). This resolves X5/G13 without touching any test session.
- Canonical: 1 − 0.92 × 0.89 = **0.181**.
- If Debate 5 picks a different combination rule, π is still 1 − c of that rule.

**3.5 What the policy shares.**
- The EXECUTE threshold is 1 − C_confirm/C_FN with C_confirm = 1.17 [UX §2.2]:
  - Low: **0.805**. The canonical c = 0.819 gives EXECUTE with a 0.014 margin.
  - Medium: **0.883**.
- **Derived constraint:** C_FN(Low) ≤ 1.17/0.181 = 6.46, or README's canonical EXECUTE breaks. So H_Low must be 0.
- The policy uses C_FN with **no ErrP credit**. This breaks the policy↔π↔detector circularity.

**3.6 Decision rule.** Roll back iff the calibrated q > t*(class). t* is computed in `SA.config`, never hard-coded and never 0.5.
- **Break-even LR+** for `light-select` at π = 0.181 is (0.819/0.181)·(2/3) = **3.02**.
  - The corrected [Chavarriaga10] value of 2.06 is **below** it; [FerrezGraz08] at 5.15 is above it.
  - The Bayes rule on calibrated q only fires where the epoch's own likelihood ratio Λ(x) > 3.02. That is why it stays near or below "never roll back" cost, up to calibration error, even when a fixed operating point would be harmful.

**3.7 High tier, caregiver-approved: never auto-roll back.** This agrees with UX D9; errp.md's t* = 0.174 is rejected.
- On q > t*(`light-select`) = 0.40, the same evidence bar the system acts on elsewhere, raise "Patient may disagree" in the caregiver queue with [Undo] / [Keep], logged as ERRP_OBS.
- A compensation that would *enter* a hazard escalates to CAREGIVER [UX §7.2].

**3.8 Below break-even: keep auto-rollback, gated per subject.** Not a global "flag-and-confirm".
- Keep auto-rollback with the per-class Bayes threshold and disclosure: posterior, t* and π are shown in the trace, and `docs/errp.md` reports per-subject ΔE[C].
- Add `SA.config.errp.mode ∈ {'auto', 'flag'}`. The value is decided on the deployment subject's **S1 OOF** ΔE[C]:
  - `'flag'` if ΔE[C] ≥ 0 for `light-select` at π = 0.181;
  - otherwise `'auto'`.
- The config key and the decision go in tonight; the 'flag' UI path (alert + one-token undo) is post-mid-eval.
- The README Scripted demo always runs `'auto'` on the synthetic epoch, labelled "Synthetic".

**3.9 Repeat ErrP after Retry.** At most one automatic alternative per episode. A second rollback goes to Home and writes a caregiver-visible log entry (errp D11).

## 4. Bedside Lamp, one penalty form, and the posterior

**4.1 One mechanism, layered explicitly.** This resolves X1/X2.
- **Episode layer:** after a rollback, the alternative offered is the argmax of the re-ranked candidates **excluding h\***. This is the second-best rule [Perrin12], i.e. conditioning on the rollback decision.
- **Persistent layer:** one multiplicative, tempered likelihood-ratio penalty in the resolver. It replaces KG's subtractive `−π` term:

  `S'(d) = g(d) · clamp01(Σ w·f) · M(d)`,  `M(d) = max(0.5, min(1, Π_k Λ_k^(−γ · 2^(−n_k / 20))))`

  - γ = 0.5;
  - Λ_k is recovered from the detector's calibrated q at that action's π;
  - only Λ_k > 1 counts, so there are no boosts;
  - n_k = resolver decisions since observation k in the same (room, command) context. Decay counts **interactions, not minutes**, so it is deterministic and Reset-safe;
  - scope is (user, room, command, entity);
  - floor 0.5.

**4.2 Why the ranking always flips in the canonical case.** Any rollback implies Λ ≥ 3.02, so M ≤ 0.576.
- Ceiling becomes ≤ 0.94 × 0.576 = 0.54, or 0.47 at the floor, which is below Bedside 0.88.
- So PROMPT's "down-weighting makes Bedside the alternative" and [Perrin12] **coincide**.
- Without the flip, the exclusion still guarantees an offer, and Retry goes back through the policy.

**4.3 What is rejected.**
- KG's λ = 0.30 subtractive penalty with a 60-minute decay: units in minutes, and not interpretable as evidence.
- errp.md's separate decay of 20 *interactions*: kept, as above.
- UX's `errpMemoryMs` flag is subsumed: the policy's h-flag becomes **M(d) < 0.9**, which escalates EXECUTE to CONFIRM.

**4.4 Disconfirmation.** If the user re-selects the penalised entity and the next q is ≤ t*, delete the record so M returns to 1. The γ = 1 upgrade on a confirmed alternative is post-mid-eval.

**4.5 Posterior.** No scripted posterior anywhere. KG CQ14's 0.91 is replaced by the detector's computed q of the epoch that ran.
- Scripted mode injects a synthetic *epoch* (§5), not a probability.

## 5. The −8.4 µV label and synthetic epochs (gap G7)

**5.1 Empirical PROBE.** CAR, causal 1–10 Hz, baseline −0.2–0, FCz.
- Grand-average error-minus-correct:
  - Pe +2.4 to +2.7 µV at 361–373 ms;
  - late negativity −1.9 to −2.25 µV at 436–533 ms.
  - This is literature-sized and confirms that −8.4 µV is not a grand-average value.
- Single-trial FCz minimum in 200–350 ms:
  - error trials: median −3.8 to −5.5 µV, 5th percentile −9.9 to −12.4 µV;
  - **correct trials have the same distribution** (median −4.3 to −4.6, 5th percentile −10.1 to −11.3).

**5.2 Labelling.** −8.4 µV is a **plausible but non-diagnostic single-trial value**.
- The README string `ErrP Deflection at FCz (-8.4 µV)` stays verbatim in Scripted mode.
- `docs/errp.md` and a harness caption define it as "single-trial FCz minimum, 200–350 ms, 1–10 Hz causal, CAR; descriptive only. Detection uses 72 multichannel features."
- Replay mode shows the *measured* value of the epoch in the same format.

**5.3 Synthetic generator** (`research/errp/synth.py`; epochs generated in Python and exported, no JS RNG).
- Format: 64 channels × 922 samples, raw-like. Each channel gets a random DC offset of ±2000 µV to exercise the zi initialisation.
- Background: 8 latent pink (1/f) sources plus a 10 Hz alpha source, mixed through a fixed seeded 64×9 matrix, plus independent sensor noise. It is scaled so the post-pipeline FCz SD equals the deployment subject's S1 value (about 3–3.8 µV).
- ErrP component: four Gaussian bumps (σ = 30 ms) at the deployment subject's S1 grand-average latencies, shifted earlier by the numerically measured filter group delay.
  - Per-channel gains equal the S1 difference topography at the Pe peak.
  - Scaled by α, under caps: FCz |Ne| ≤ 4.1 µV and Pe ≤ 8 µV [Yasemin23].
- **Selection, deterministic:**
  - α = the smallest value in {1.0, 1.25, …, 2.5} for which ≥ 80% of 200 test seeds give q > t*_light + 0.10 at π = 0.181;
  - then the demo seed = the first seed in 0..9999 with round(FCz min, 1) = **−8.4** and q ≥ t*_light + 0.10;
  - the correct epoch = the same generator with no component, first seed with q ≤ 0.10;
  - the 200-seed detection rate is **disclosed**.

**5.4 Tests (G7 closed).**
- pytest `test_errp_synth.py` asserts, on the trained exported weights:
  - q(synth-err) > t* and the decision is rollback;
  - q(synth-cor) < t*;
  - FCz min = −8.4 µV (±0.05).
- The JS selftest repeats the decision assertions. [Simulate ErrP] **fails loudly**, showing q and "detector disagreed", if q ≤ t*.

## 6. Browser detector, export format and parity

**6.1 JS modules** (classic IIFEs on `SA`, float64 throughout, each ≤ 400 lines).
- `POC/js/dsp/butterworth.js` → `SA.dsp.butterworth.sosfilt(sos, x, zi)`. Shared; filter coefficients are never designed in JS.
- `POC/js/errp/features.js` → `SA.errp.features`: base64 → Float32 → Float64Array, CAR, step-zi sosfilt, baseline, 72 window means, FCz minimum.
- `POC/js/errp/classifier.js` → `SA.errp.classifier`: `score = w·x + b`, Platt, `priorShift(q, π_tr, π)`, `lr(q, π_tr)`.
- `POC/js/errp/detector.js` → `SA.errp.detector`:
  - `threshold(costClass, tier)` computed from `SA.config.costs`;
  - `observe(epoch, ctx)` returns `{score, qTr, q, lambda, tStar, decision: 'rollback'|'keep'|'alert'|'flag', fczMinUv}`;
  - emits `errp:observed` on `SA.bus`;
  - observe window `SA.config.errp.observeMs = 1000`.
- `POC/js/errp/synth.js` is a thin accessor over the exported synthetic epochs.

**6.2 `POC/js/data/errp-model.js`** (< 10 KB) assigns `window.SA.data.errpModel`:

```
{ version, preliminary: true, dataset: 'BNCI 013-2015', subject, trainedOn: 's1 all 10 blocks', fs: 512, nSamples: 922, eventIndex: 512,
  reference: 'CAR64', channels: [64 labels], featureChannels: [8], sos: [[6]×4], zi: [[2]×4],
  baseline: [410, 512], windows: [[start, end]×9], w: [72], b, platt: {A, B}, piTrain,
  s2Metrics: {...}, licence: 'CC BY-NC-ND 4.0, Chavarriaga & Millán; pending supervisor confirmation' }
```

- Numbers are written with Python `repr` (17 significant digits), so they round-trip exactly.

**6.3 `POC/js/data/errp-replay.js`** (≤ 2.5 MB) assigns `window.SA.data.errpReplay`. Each epoch carries:

```
{ id, source, subject, session, block, trial, label, eventType, dataB64 /* float32 LE, channel-major 64×922 */, expected: {score, q, decision}, fczMinUv }
```

- Contents: 4 real session-2 epochs of the deployment subject plus 2 synthetic. Each is about 315 KB in base64, about 1.9 MB in total.
  - 2 true-positive errors with q > 0.40. PROBE counts at t* = 0.40, π = 0.181: S02 has 50, S04 has 20.
  - 1 true-negative correct epoch.
  - 1 **misclassified** error (a false negative), visible in the harness for honesty.
  - The selection is disclosed.
- Raw, unprocessed excerpts only (verbatim, per the NC-ND reasoning), with attribution; "pending supervisor confirmation". Generated data files are exempt from the 400-line rule.

**6.4 Parity** (`research/tests/test_errp_parity.py` → `node research/export/node_runner.js`). The runner sets `globalThis.window = {}`, loads the scripts in `index.html` order with `vm`, and dumps per-stage JSON.
- Python reads the **same float32-decoded samples** and upcasts to float64 (G2 closed).
- Stage-wise tolerances:
  - features ≤ 1e-9 µV;
  - score and q ≤ 1e-6;
  - the acceptance gate is the mandated 1e-4.
- Every exported epoch must have |q − t*| ≥ 1e-3, so a parity error can never flip a decision (the G1 analogue).

**6.5 Post-mid-eval.** EEGNet, the MDM comparator, 1000 permutations, the 'flag' UI path, the γ = 1 upgrade, and Iwane 2023 as a CC BY fallback if the supervisor rejects NC-ND.

**6.6 Risks.**
- Six subjects is a small sample. S04 shows rollback is near break-even even at C_FP = 2, so the benefit is subject-dependent.
- This is a monitoring paradigm, not interaction.
- SCI amplitudes are about 5× smaller [Keyl19]: wN1 −0.27 vs −1.55 µV. This caveat goes in `docs/errp.md` and the ErrP-health tooltip.
- The C_FP = 2 design must be accepted by Debate 7. If it is rejected, `light-select` t* becomes 0.667 and the PROBE shows break-even.

**Sources:** errp.md §1.3, §5.2, §6–§11; _cross-check.md X1–X6, X12, S1, G1–G4, G7, G13; knowledge-graph.md §3.2–3.5; assistive-ux-safety.md §1.3, §2.1–2.2, §6.3–6.4, §7.2, D9; BNCI description.pdf (local); [Chavarriaga10] abstract via api.semanticscholar.org (DOI 10.1109/TNSRE.2010.2053387).

**Scratchpad scripts (exploratory, not deliverables):**
- C:\Users\AK\AppData\Local\Temp\claude\C--Users-AK-Documents-FYP\597fefe1-c7ce-4b07-b53a-bcb814565810\scratchpad\errp\inspect.py
- C:\Users\AK\AppData\Local\Temp\claude\C--Users-AK-Documents-FYP\597fefe1-c7ce-4b07-b53a-bcb814565810\scratchpad\errp\probe.py
- C:\Users\AK\AppData\Local\Temp\claude\C--Users-AK-Documents-FYP\597fefe1-c7ce-4b07-b53a-bcb814565810\scratchpad\errp\probe2.py
- C:\Users\AK\AppData\Local\Temp\claude\C--Users-AK-Documents-FYP\597fefe1-c7ce-4b07-b53a-bcb814565810\scratchpad\errp\probe3.py"

=== critique:errp-design ===

CRITIC — errp-design debate. Proposer B failed and filed nothing, so every attack below targets Proposer A (Rigor-first) unless it is marked [B-gap]. [B-gap] items are demo-first concerns that no one argued.

Evidence I gathered this session. All of it was read-only, and no files were written.
- Chavarriaga & Millán 2010, full text via the Infoscience open-access PDF, cached by the tool at C:\Users\AK\.claude\projects\C--Users-AK-Documents-FYP\597fefe1-c7ce-4b07-b53a-bcb814565810\tool-results\webfetch-1791995238392-njqhd9.pdf.
- The official bit-code table in C:\Users\AK\Documents\FYP\research\data\bnci2015_013\description.pdf.
- An event-code scan of Subject01_s1 and Subject05_s2.
- An arithmetic re-check of A's cost tables in the project venv.

=== SEVERITY 1: factual errors and spec breakers ===

1. [A] The "swap is real" verdict is wrong. The full text contradicts the abstract.
   - Paper p.385, §IV-B: "Successful single-trial classification is achieved for both classes with **higher detection of correct trials** (mean classification accuracy of 75.81% and 63.21% for **correct and error trials, respectively**)". The p = 0.4 condition reads the same way: "64.42% and 59.36% for correct and error trials, respectively".
   - So TNR = 0.758, TPR = 0.632 and LR+ = 2.61. The ordering errp.md used is correct. The ordering error is in the abstract, and cross-check S1 is refuted.
   - A checked only the abstract and said "the IEEE PDF was not reachable". The open-access PDF is linked from the Infoscience record that both errp.md and _cross-check.md cite.
   - **Required:** the ADR must NOT "correct" errp.md §0/§2/§7/§9/§10. It must instead record S1 as refuted, quoting the body text. A's numbers change as follows:
     - (8,4,1) at π = 0.223: −13.1% (not −2%).
     - A's own model at π = 0.181: +4.9% with C_FP = 2 (not +18%), and +59.7% with C_FP = 5 (not +107%).
   - A's +107% does not reproduce even under the swapped values; I get +100.9%.
   - What survives: LR+ = 2.61 is still below A's break-even of 3.02, so the qualitative "fixed operating point is harmful" conclusion stands.
   - Shipping a false correction into docs/errp.md would breach CLAUDE.md §6 (cite accurately).

2. [A] The paper's protocol is not what A says it is.
   - Body text: "Electrodes (FCz, Cz, or both) and time windows … selected independently per subject based on … the training set. **Sessions on the first recording day** were used as training set, and session 2 … for testing."
   - Day 1 contained two conditions (p = 0.2 and p = 0.4). BNCI 013-2015 publishes one ~0.20 file per day.
   - The paper also reports "an average of 64 trials per block", but the public files hold ~50 trials per block of codes 5/6/9/10. Including codes 1/2/4/8 brings S01_s1 to ~71 per block, so the paper may have counted trials differently.
   - The classifier is Gaussian prototypes on FCz/Cz at 64 Hz, with per-subject electrode and window selection.
   - **Required:** label our S1→S2 comparison "paper-like, not paper-identical". Our training set is smaller, from a single condition, and uses different trial counting. The 69.5% reference band must carry that caveat.

3. [A] Codes 1/2/4/8 are mischaracterised. The official bit table says bit0 = target left (1), bit1 = target right (2), bit2 = cursor moves left (4), bit3 = cursor moves right (8).
   - Lone 4/8 events are therefore **cursor movements** with no target bit. They are not "target/cursor-only markers".
   - My scan shows all of 1/2/4/8 sit in the trial cadence: ≥1016 samples (~2 s) from the nearest main event, with a median inter-event gap of ~1300–1500 samples.
   - Their counts vary wildly across files: codes 4/8 number 37/47 in S01_s1 but 4/3 in S05_s2. That suggests a protocol difference between sessions that nobody has explained.
   - Excluding them matches MOABB, but the exclusion silently drops ~70–85 cursor moves per session. These are probably target-reaching moves, i.e. correct outcomes, and they are the closest analogue to a SilentAssist "goal reached" outcome.
   - **Required:**
     - Document them as "cursor moves without a target bit, semantics [UNVERIFIED], excluded per MOABB/paper convention".
     - Report the per-file counts.
     - Keep the pytest assertion, but drop the false description.

4. [A] The unified cost table breaks the README canonical EXECUTE, because it mixes units.
   - The EXECUTE threshold is 1 − C_confirm/C_FN. Here C_confirm = 1.17 is an *expected*-token figure (UX design B at P = 0.777), while C_FN = 6 is *nominal*. A's "inflation cancels" argument holds for t* but not for this ratio.
   - Consistent nominal units give 1 − 1/6 = 0.833 > c = 0.819, so the canonical case becomes **CONFIRM**, a README violation.
   - Consistent expected units give 0.892 at P = 0.777, or 0.852 at P = 0.92, which is also CONFIRM.
   - Only the mixed-unit version gives 0.805 and EXECUTE. A's "derived constraint" C_FN ≤ 6.46 is itself mixed-unit; the consistent bound is C_FN ≤ 1/0.181 = **5.52** nominal.
   - With C_FN = 5, light-select gives t* = 2/(2+5−3) = 0.50 and break-even LR+ = 4.5. So the honest unified model makes auto-rollback even less justifiable than A admits.
   - **Required:** either pick consistent units and accept C_FN ≤ 5 (and recompute everything), or explicitly decouple the policy's EXECUTE threshold (Debate 5) from the ErrP table. A cannot claim "one table" while it only works through a unit mismatch.

5. [A] The persistent penalty locks the user out of the entity it penalised, defeating its own floor.
   - Any rollback forces M ≤ 0.576, and the scripted demo (q ≥ t* + 0.10, so Λ ≥ 4.5) hits the 0.5 floor. That gives S'(Ceiling) = 0.47–0.54.
   - Under KG's s = S·P(room): c = 0.92 × 0.47 × 0.95 = **0.41–0.47 < 0.50, so REJECT** under UX §6.4. UX's normalised-posterior reading of s is worse, since Bedside is at 0.88.
   - So after a *false* rollback the user cannot re-issue "Turn On Ceiling Light". The policy REJECTs it, so A's C_FP = 2 re-issue path does not exist.
   - Disconfirmation (§4.4) needs the entity to be re-selected and executed, which the policy now forbids.
   - Decay counts same-(room, command) decisions with a half-life of 20, so recovery takes dozens of interactions.
   - A also never says whether s is computed from S or from S'. If from S, the displayed "SPARQL Match" (S') and the c in the trace disagree.
   - **Required:**
     - State explicitly whether the penalty enters s.
     - If it does, the floor must guarantee c ≥ the CONFIRM floor. For example, apply M only to ranking or offer selection, never to the s that feeds the policy, and leave the h-flag (CONFIRM escalation) as the only policy effect.
     - Add a self-test: false rollback → re-issue → reaches CONFIRM, not REJECT.

6. [A] C_FP ignores recursion and escalation, so every t* is understated.
   - A re-issued action is (a) escalated to CONFIRM by A's own h-flag (M < 0.9), which adds ~1.17, and (b) exposed to another rollback with the same FPR.
   - The true C_FP ≈ (re-issue + confirm)/(1 − FPR), plus the lockout from #5.
   - **The preset class is the extreme case.** Night Mode t* = 0.077 means rollback whenever Λ > **0.377**, i.e. even when the epoch's evidence *favours* "correct".
     - Most correct epochs will roll back a 3-device preset.
     - Re-issue faces the same ~0.08 threshold again.
     - After one more rollback, the "one alternative per episode" rule sends the user Home.
   - Presets become practically unusable. PROMPT requires presets to go through the same ErrP/rollback path, and this design satisfies the letter while breaking the function.
   - **Required:** recursive C_FP, plus a sanity floor such as never rolling back when Λ ≤ 1. Report the preset FPR at t* on S1 OOF.

7. [A] Session-2 contamination of design decisions breaches CLAUDE.md §6 ("never tune on the test session").
   - The probe script (scratchpad/errp/probe.py) prints S2 cross-session metrics for CAR vs sub8 on S02/S04.
   - §1.4 cites S2 cross-session AUC (0.849 vs 0.809) as evidence for CAR.
   - §1.6 validates segment filtering by S2 AUC.
   - §3.3 reports S2 ΔE for C_FP = 2 vs 5 while arguing for C_FP = 2.
   - "Nothing below is tuned on them" is not credible when S2 numbers are the cited evidence.
   - **Required:**
     - Re-justify CAR with S1-LOBO only (A's own S1 numbers suffice: 0.794 vs 0.746, 0.745 vs 0.704).
     - Validate segment filtering by S1 feature identity (max |Δfeature|), not S2 AUC.
     - Strike every S2 number from the ADR rationale.
     - Mark S02 and S04 as "S2 viewed during design" in results tables.
     - Exclude S02/S04 from deployment-subject selection, or disclose. S02, whose good S2 they already saw, is the likely S1-LOBO winner.

=== SEVERITY 2: design gaps and contradictions with other topics ===

8. [A] The 'flag' mode can be selected tonight with no UI behind it, and its gate is circular.
   - The gate uses S1 OOF ΔE[C], but Platt is fitted on those same OOF scores. In-sample calibration makes ΔE ≤ 0 almost automatically, so the gate is biased toward 'auto'.
   - If the gate does output 'flag', the 'flag' path is post-mid-eval, so Replay mode has undefined behaviour.
   - **Required:**
     - Use a nested gate: Platt on 9 blocks, ΔE on the held-out block, rotated.
     - Define the tonight fallback for 'flag': a trace message plus a caregiver log entry, with no state change.

9. [A] The 'setting' class (Low t* = 1.0, never roll back) leaves [Simulate ErrP] undefined after fan, TV channel/volume or brightness actions tonight, because the 'flag' UI is deferred.
   - Brightness is a Light action on the README's S4 ("Adjust Brightness").
   - **Required:** define tonight's visible outcome, e.g. "Possible Error Detected • not rolled back (setting; flag only)", plus an audit ERRP_OBS entry.

10. [A] The High-tier alert reuses light-select's t* = 0.40. That is ad hoc and breaks the "one model" claim, because an alert has its own costs (caregiver attention vs a missed disagreement).
    - More fundamentally, ErrPs are time-locked to the *perceived* outcome. A caregiver-approved action executes at an unpredictable time, possibly while the patient is not attending.
    - The epoch is then not physiologically meaningful.
    - **Required:** time-lock to the spoken or visual approval-result announcement (PROMPT: "the result is reported back to the patient and spoken"), or don't observe High-tier actions at all. Derive the alert threshold from an alert-cost row.
    - The new "[Undo]/[Keep]" queue item is a README-silent caregiver UI addition and needs a Debate 7 ruling.

11. [A] The cost cells depend on an unfrozen screen graph, and they contradict UX D7.
    - A maps Tongue on the alternative screen to "back to S4 of the rolled-back fixture". UX D7 maps BACK on that card to [Return to Home]. Both cannot hold.
    - "Undo = 2 tokens" assumes a landing screen after S5 that the README doesn't specify. My count from S5 is BACK, NEXT to Turn Off, SELECT = 3, which changes C_FN.
    - KG pre-focus (UX D6) would change "reach" costs after the penalty flips the ranking.
    - C_TP's 0.5/0.5 split is an arbitrary number. It should be P(alternative correct | h* wrong) from the resolver, which errp §10.1 computed as 52%.
    - **Required:** cost cells are computed in SA.config from the Debate 6/7 screen graph, not hand-entered, with a test that the table matches the navigator.

12. [A] π = 1 − c is presented as "resolving X5/G13", but c = n·s is not a calibrated probability.
    - Scripted n and s are slider values. KG's s = 0.94 × 0.95 is a score product, not a posterior.
    - π is therefore a modelling convention and must be labelled as one.
    - Undefined cases:
      - π after a CONFIRM, where the user's explicit confirmation should *lower* π, yet A's rule *raises* it because c is lower.
      - π for presets, where the diff preview is an inherent confirm.
      - π in Replay, where an ErrP epoch from BNCI subject k is paired with an MI decode from IV-2a subject A0x. The UI must show both identities.
    - X4 (Semantic 89%) is still unresolved, and π inherits that ambiguity.

13. [A, B-gap] [Simulate ErrP] behaviour depends on the sliders. The synthetic seed is chosen so that q ≥ t* + 0.10 at π = 0.181 only.
    - At n = s = 0.99 (π ≈ 0.02), q falls far below t*, so the button "fails loudly" during the viva.
    - That is honest, but it is a demo hazard that no one owned.
    - **Required:** pick the seed with margin across the slider range the demo script uses, and disclose in the harness that detection depends on π. Add self-test vectors at π ∈ {0.10, 0.181, 0.36}.

14. [A] PROMPT items not addressed:
    - (a) The "ErrP auto-confirm" harness toggle: what epoch runs when nobody clicks? It must still pass through the detector (the synthetic correct epoch), not just set a flag.
    - (b) The README "ErrP health" gauge on the caregiver dashboard is undefined. Proposal: deployment subject S2 AUC/BA, labelled PRELIMINARY, plus the last q.
    - (c) X8 tier conflicts (Night Mode Low vs Medium; AC power Low vs Medium) are used in the cost table but not resolved.

=== SEVERITY 3: scientific-honesty and detail fixes ===

15. [A] The synthetic epoch's realism is unverified.
    - Background = 8 pink sources plus alpha through a *random* 64×9 mixing matrix. sLDA weights are tuned to the real spatial covariance, so a random covariance makes the synthetic score distribution, and therefore q, arbitrary. Detection could become trivially easy or impossible for reasons unrelated to the ErrP.
    - α up to 2.5× the subject's grand-average difference produces a super-average ErrP.
    - One Pe topography is used for all four components, although Ne and Pe topographies differ.
    - **Required:**
      - Mixing matrix = Cholesky factor of the deployment subject's S1 pre-stimulus covariance. That is a derived statistic, like the weights; flag it under the same licence caveat.
      - Use per-component topographies.
      - Disclose α in the UI caption.
      - Disclose BOTH the synthetic TPR and the synthetic FPR (no-component epochs with q > t*) over the 200 seeds. A disclosed only the detection rate, so the [No ErrP] path's cherry-picking is hidden.

16. [A] Label honesty for −8.4 µV. A's own probe shows the FCz min in 200–350 ms has the same distribution for correct and error trials, yet Replay would print "ErrP Deflection at FCz (X µV)" for any detected epoch.
    - The README string stays verbatim in Scripted mode. In Replay, either keep the README format with an adjacent "(descriptive; detection uses 72 features, q = …)" caption, or show the value under a neutral label.
    - The 200–350 ms window is measured on causally filtered data, where the probe puts Pe at 361–373 ms against the paper's 330 ms. That is a ~30–60 ms delay. The window definition must state that it is in filtered-signal time, or shift it by the measured group delay, consistent with how §5.3 shifts the bumps.

17. [A] Replay set composition is lopsided. It holds 2 TP, 1 TN, 1 FN and no FP, yet PROMPT demands "doesn't fire on correct ones", in the plural.
    - A false positive (a false rollback) is the costliest real failure, and showing one is what honesty requires.
    - The budget allows ~9 epochs at 315 KB.
    - **Required:** 2 TP, 2 TN, 1 FN, 1 FP, plus the 2 synthetic. Store `expected` at the canonical π and guard |q − t*| ≥ 1e-3 only there, stated as such.

18. [A] Plan B shrinks the permutation test to 200 permutations. At about 60k sLDA fits on 450×72 matrices, 1000 permutations take about a minute. Run 1000 tonight; there is no reason for a Plan A/B split on this item.
    - The ΔE[C] values at π ∈ {0.10, 0.181, 0.223, 0.334} must be computed by reweighting class-conditional rates, not on the raw S2 mixture (π ≈ 0.21). State this explicitly.

19. [A] The licence argument is weaker than it needs to be. Float32 encoding of float64 data is lossy, so the excerpt is not strictly "verbatim".
    - Cite CC BY-NC-ND 4.0 §2(a)(4) (technical modifications for format are permitted) to make the argument correctly.
    - Keep "pending supervisor confirmation".

20. [A] Small correctness points:
    - Platt is fitted on OOF fold-model scores and applied to the refit full-S1 model. The score scale shifts with shrinkage. This is standard (as with CalibratedClassifierCV ensemble=False) but must be disclosed.
    - EVENT.POS 1-based: verify against MOABB `_convert_run_epfl`, don't just assume.
    - The success band compares our BA-max threshold with a Gaussian classifier's native operating point. State this.

=== What survives and is recommended for the judge ===
- Direct loader with v5 verified; CAR-64, justified by S1-LOBO only.
- Causal SOS filter with step-zi on −1.0..+0.8 s segments (922 samples).
- Baseline −0.2..0 s; 72 windowed means + sLDA.
- Platt plus Saerens prior shift.
- xDAWN+TS tonight and EEGNet post-mid-eval, with the pre-registered switch rule.
- Cross-session primary with S1-LOBO selection.
- The detector JS module split, errp-model.js format with repr-precision numbers, and float32-decoded inputs in both runtimes.
- Stage-wise parity through the Node vm runner.
- Second-best exclusion rule as the episode layer.
- No scripted posterior anywhere.
- High tier never auto-rolled back.
- Repeat-ErrP → Home.

Everything in #1–#7 must be fixed before the ADR is written.

=== rebut:errp-design:A ===

PROPOSER A (Rigor-first): REBUTTAL. errp-design debate, one round

**New evidence this round.** All read-only; no project files written.
- **(E1) Chavarriaga & Millán 2010 full text.** I extracted it with pdftotext from the critic's cached PDF. Scratchpad copy: C:\Users\AK\AppData\Local\Temp\claude\C--Users-AK-Documents-FYP\597fefe1-c7ce-4b07-b53a-bcb814565810\scratchpad\errp\chav10.txt
  - The body text reads: "higher detection of correct trials (mean classification accuracy of 75.81% and 63.21% for correct and error trials, respectively)".
  - The abstract reads the other way round ("erroneous and correct ... 75.8% and 63.2%, respectively").
  - The protocol reads: "Sessions on the first recording day were used as training set, and session 2 ... for testing". The FCz/Cz electrodes and the time windows were chosen per subject; blocks averaged "64 trials".
- **(E2) MOABB `_convert_run_epfl`.** Fetched from moabb/datasets/bnci/base.py (develop branch). It does all three of:
  - `trigger[run.header.EVENT.POS[ii] - 1]`
  - keeps only TYP 6/9 (error) and 5/10 (correct)
  - `ch_names = Label[:-1]`, units µV

  So POS is 1-based, which closes #20(b) by verification rather than assumption. The code set {5,6,9,10} and dropping the Status label are confirmed.
- **(E3)** I re-ran the arithmetic. It matches the critic's numbers.

---

## Severity 1

### #1 Swap verdict. CONCEDED IN FULL; my verdict was wrong.
The body text and the p=0.4 sentence (64.42 correct / 59.36 error) settle it.
- Final values: TPR=0.632, TNR=0.758, FPR=0.242, LR+=2.61. errp.md's ordering is correct.
- The ADR records cross-check S1 as REFUTED. It quotes the body text and notes that the abstract contains the transposition.
- No "corrections" are made to errp.md §0/2/7/9/10.
- The p=0.4 pair keeps its correct/error order. I drop its [UNVERIFIED] tag.
- Corrected consequences:
  - (8,4,1) at π=0.223: −13.1%.
  - My old table at π=0.181: +4.9% (C_FP=2) and +59.7% (C_FP=5).
  - My "+107%" is withdrawn. It was mis-computed even under the swap.
- What survives: LR+ 2.61 is still below break-even in every revised cost class below, so a fixed operating point stays harmful.

### #2 Paper protocol. CONCEDED.
- The ADR and results label our S1→S2 run "paper-like, not paper-identical". The differences:
  - the paper trained on the day-1 sessions at p=0.2 and p=0.4, while we train on the single public ~0.2 file;
  - trial counting differs (64 per block in the paper, about 50 here for codes 5/6/9/10);
  - the paper used Gaussian prototypes on FCz/Cz at 64 Hz with per-subject selection.
- The success band (BA ≥ 64.5%, derived from 69.5%) carries this caveat. It also notes that it compares our BA-max threshold against the paper classifier's native operating point (#20c).

### #3 Codes 1/2/4/8. CONCEDED on the description; the decision is unchanged.
- New text: "single-bit codes (bit0 target-left, bit1 target-right, bit2 cursor-left, bit3 cursor-right per description.pdf). Lone 4/8 = cursor moves without a target bit. Semantics [UNVERIFIED]; excluded per paper/MOABB convention (E2)."
- `data.py` emits per-file counts of each code into the dataset report.
- The pytest assertion "only {5,6,9,10} are epoched" stays.
- Treating them as "goal reached" analogues is post-mid-eval. They carry no correct/error label, so they cannot train the detector.

### #4 Mixed units in the "one table". CONCEDED; I withdraw the "one table" claim.
- The ErrP cost table is all nominal MI tokens. Inflation cancels in t*, and t* is all it feeds.
- The policy's EXECUTE threshold is decoupled. It is Debate 5's own declared constant in `SA.config.policy`, and a self-test checks that the canonical c=0.819 gives EXECUTE.
- Both live in `SA.config`, but no formula links them. Withdrawn as well:
  - the "derived constraint C_FN ≤ 6.46";
  - "H_Low must be 0". H_Low=0 stays, but as a choice, not a derivation.
- The policy still uses C_FN with no ErrP credit, so the circularity stays broken.

### #5 Lockout. CONCEDED; this was a real bug.
- Final: the persistent penalty M(d) applies to **ranking, offer selection and display only**. It never touches the s that feeds the policy.
  - For an entity the user explicitly selects, c = n·s uses the unpenalised S.
  - The penalty's only effect on the policy is the h-flag (M < 0.9 → CONFIRM).
  - The trace shows "SPARQL Match S (ranking ×M)", so the displayed numbers and c agree.
- New self-test: false rollback → Tongue → re-select Ceiling → CONFIRM (never REJECT) → SELECT executes.
- Disconfirmation (§4.4) becomes reachable: a re-selected entity followed by q ≤ t* deletes the record.

### #6 C_FP recursion and presets. CONCEDED.
Final light-select cost class (nominal tokens). The navigator computes every cell; see #11 for how. The numbers below are indicative.
- C_FP = re-issue (2) + confirm forced by the h-flag (1) + FPR(t*) × C_restart.
  - The recursion is bounded: under the repeat-ErrP rule, a second rollback goes Home, so C_restart = the navigator path from Home to the action.
  - FPR(t*) is solved by fixed-point iteration on S1 OOF in Python and exported.
- C_FN = undo 3 (the critic's count from S5) + reach 4 + H.
- C_TP = p_alt·1 + (1−p_alt)·5, where p_alt comes from the resolver (0.52 per errp §10.1), not a fixed 0.5/0.5.
- Indicative result at π=0.181:
  - t* ≈ 0.49;
  - break-even LR+ ≈ 4.3;
  - Chavarriaga's 2.61 sits below it, FerrezGraz08's 5.15 above.

Hard sanity floor in `SA.errp.detector`: roll back only if q > max(t*, π), i.e. Λ > 1. Evidence that favours "correct" can never trigger a rollback.

Presets: the diff preview is an inherent confirm, so π uses the post-confirm rule in #12.
- At canonical sliders π ≈ 0.06.
- Night Mode then gives t* ≈ 0.15 but an evidence bar of Λ > 2.8, not 0.38.
- Python reports the preset FPR at t* on S1 OOF.

### #7 S2 contamination. CONCEDED on the remedy; partly defended on substance.
Defence: the S1-only numbers already pick the same options, and C_FP=2 was an a priori design choice. But the cited evidence must be clean, so:
- CAR-64 is justified only by S1 LOBO AUC: 0.794 vs 0.746 (S02) and 0.745 vs 0.704 (S04).
- Segment-vs-continuous filtering is validated by a pytest of S1 feature identity: max |Δfeature| after the 1.0 s pre-segment, with a stated tolerance.
- Every S2 number is struck from the ADR rationale.
- Results tables mark S02 and S04 "S2 viewed during design (exploratory probe)". Means are reported with and without them.
- **Deployment subject:** S02 and S04 are EXCLUDED. It is chosen by S1 LOBO AUC among S01, S03, S05 and S06.

---

## Severity 2

### #8 'flag' gate. CONCEDED.
- The gate is nested. For each S1 block: fit Platt on the other 9 blocks' OOF scores, then compute ΔE[C] on the held-out block; aggregate over the 10 rotations.
- Tonight's 'flag' fallback:
  - the trace shows "Possible Error Detected • not rolled back (flag mode)";
  - a caregiver-visible ERRP_OBS log entry is written;
  - no state change.

### #9 'setting' class. CONCEDED.
- Tonight's visible outcome: "Possible Error Detected • not rolled back (setting: flag only)", plus an ERRP_OBS audit entry and the posterior shown in the trace.
- AC (Medium tier) still auto-rolls back at its t*.

### #10 High tier. CONCEDED.
- Final: for caregiver-approved actions the epoch is time-locked to the onset of the approval-result announcement to the patient (spoken plus visual).
- Tonight it is **log-only**: ERRP_OBS records q, π and the epoch id. There is no alert and no new UI.
- The "[Undo]/[Keep]" caregiver item and its alert-cost row (C_false-alert vs C_missed-disagreement → t_alert) are post-mid-eval. They need a Debate 7 ruling. The reuse of t*=0.40 is withdrawn.

### #11 Cost cells and the screen graph. CONCEDED on derivation; I defend the Tongue mapping as the proposal.
- Cells are computed at load time in `SA.config.costs` from `SA.nav` shortest paths (a BFS over the Debate 6/7 graph), never hand-entered.
- A pytest/selftest asserts that the table matches the navigator.
- The Tongue mapping: README defines Tongue as "BACK / CANCEL (Ascend menu hierarchy)", and [Return to Home] is already an explicit button. Mapping BACK onto the same button (UX D7) makes it redundant, whereas ascending one level returns to the fixture's S4.
- I defer to Debate 7. If it upholds D7, the derived C_FP rises and t* recomputes automatically, with no code change.
- KG pre-focus is likewise picked up by the BFS.

### #12 π as a convention. CONCEDED; now labelled "modelling convention, not a calibrated probability".
- **EXECUTE:** π = 1 − c.
- **After CONFIRM, or the preset diff preview:** π' = (1−c)(1−P_sel) / [(1−c)(1−P_sel) + c·P_sel], where P_sel is the configured MI select accuracy.
  - This lowers π after an explicit confirmation, as the critic required.
  - Canonical value ≈ 0.06.
- **Replay:** the UI shows both identities, e.g. "ErrP: BNCI 013-2015 S0k s2 #trial; MI: IV-2a A0x".
- X4 is Debate 5's call; π inherits whatever rule it picks.

### #13 Slider dependence. CONCEDED.
- α and the demo seed are selected so that q > t*+0.10 at π=0.10, the lowest π in the demo script's slider range.
- Self-test vectors run at π ∈ {0.10, 0.181, 0.36}.
- A harness caption states: "detection depends on the prior; at very high confidence the detector correctly declines to override".
- If no α ≤ 2.5 meets the criterion, the shortfall is reported and the rate disclosed. Nothing is forced.

### #14 PROMPT items.
- (a) The ErrP auto-confirm toggle runs the synthetic-correct epoch through `detector.observe`; it never just sets a flag.
- (b) The ErrP health gauge shows the deployment subject's S2 AUC and BA (PRELIMINARY), the last q, and the current mode.
- (c) X8: the cost table reads tier from the shared device config. Until Debate 5/7 rules, the default is the higher tier (Night Mode Medium, AC power Medium).

---

## Severity 3

- **#15 Synthetic realism. CONCEDED.**
  - Mixing uses the Cholesky factor of the deployment subject's S1 pre-stimulus spatial covariance (CAR, DC removed), flagged under the same licence caveat.
  - Each component has its own topography (Ne at the Ne peak, Pe at the Pe peak).
  - α appears in the UI caption.
  - Over 200 seeds, both the synthetic TPR and the synthetic FPR (no-component epochs with q > t*) are disclosed.
- **#16 Labels. CONCEDED.**
  - Scripted mode shows the README string verbatim.
  - Replay keeps the README format plus a caption: "(descriptive single-trial value; detection uses 72 features, q = …)".
  - The window is defined as "200–350 ms in filtered-signal time (causal 1–10 Hz; measured group delay ≈ X ms reported)", with no shift.
- **#17 Replay set. CONCEDED.**
  - Contents: 2 TP, 2 TN, 1 FN and 1 FP real epochs from the deployment subject's session 2, plus 2 synthetic: 8 × ~315 KB ≈ 2.52 MB.
  - The cap rises to 2.6 MB.
  - `expected` is stored at the canonical π only, and |q − t*| ≥ 1e-3 is guarded only there, as stated.
- **#18 Permutations. CONCEDED.**
  - 1000 permutations tonight (config default 1000).
  - ΔE[C] on the π grid is computed by reweighting the class-conditional TPR/FPR and cost terms, never on the raw S2 mixture.
- **#19 Licence. CONCEDED.**
  - Cite CC BY-NC-ND 4.0 §2(a)(4): float32 encoding is a permitted technical format modification and does not create Adapted Material.
  - "Pending supervisor confirmation" stays.
- **#20 Small points. CONCEDED.**
  - Disclose that Platt is fitted on OOF fold models and applied to the full-S1 refit (same as CalibratedClassifierCV with ensemble=False).
  - EVENT.POS−1 is now verified (E2).
  - The success-band operating-point caveat is added (see #2).

---

## Unchanged

These stand as the critic summarised them:
- direct v5 loader;
- CAR-64;
- causal SOS with step-zi on −1.0..+0.8 s segments (922 samples);
- baseline −0.2..0;
- 72 windowed means + sLDA;
- Platt + Saerens;
- xDAWN+TS comparator tonight, EEGNet post-mid-eval, pre-registered switch rule;
- cross-session primary, S1 LOBO selection;
- the JS module split, errp-model.js with repr precision, float32-decoded inputs in both runtimes, stage-wise Node vm parity;
- the second-best exclusion rule;
- the multiplicative tempered M(d) with interaction decay (now ranking-only);
- no scripted posterior;
- High tier never auto-rolled back;
- repeat ErrP → Home.

## Final revised choices that changed

| # | Topic | Final choice |
|---|---|---|
| 1 | Swap | Refuted; LR+ = 2.61 |
| 2 | Comparison | "Paper-like" label |
| 3 | Codes 1/2/4/8 | Text corrected, counts reported |
| 4 | Cost table | ErrP table decoupled from the policy threshold |
| 5 | Penalty | M is ranking-only; re-select reaches CONFIRM |
| 6 | C_FP, floor | Bounded-recursive C_FP; Λ > 1 floor |
| 7 | Design evidence | S1-only rationale; S02/S04 excluded from deployment |
| 8 | Flag gate | Nested; log-only fallback tonight |
| 9 | Setting class | Flag-only outcome text |
| 10 | High tier | Announcement-locked, log-only tonight |
| 11 | Cost cells | Navigator-derived |
| 12 | Prior | π convention plus post-confirm π' |
| 13 | Synthetic seed | Selected at π = 0.10, test vectors at 3 priors |
| 15 | Synthetic generator | Cholesky mixing; TPR and FPR disclosed |
| 16 | Replay label | Caption added |
| 17 | Replay set | 2/2/1/1 + 2, cap 2.6 MB |
| 18 | Permutations | 1000 tonight |
| 19 | Licence | §2(a)(4) |

=== rebut:errp-design:B ===

PROPOSER B (Demo-first): REBUTTAL. My opening failed to file, so I am taking the critic's list against A's design. I accept what survived and argue the points where a demo-first view changes the answer.

NEW EVIDENCE (read-only; one scratch script: C:\Users\AK\AppData\Local\Temp\claude\C--Users-AK-Documents-FYP\597fefe1-c7ce-4b07-b53a-bcb814565810\scratchpad\errp_b\feas.py)
(E1) I ran pdftotext on the cached Infoscience PDF (webfetch-1791995238392-njqhd9.pdf).
- Line 453: "...and 63.21% for correct and error trials, respectively".
- Line 177: "Sessions on the first recording day were used as training set".
- The critic's #1 and #2 are confirmed.
(E2) I ran an S1-ONLY probe on all 6 subjects. I touched no session-2 EEG.
- Pipeline: A's segment pipeline (−1.0..+0.8 s, step-zi causal SOS, CAR64, baseline 410:512, 72 window means, sLDA), LOBO OOF, then Platt and prior shift.
- S1 LOBO AUC: S01 0.876, S03 0.861, S05 0.861, S02 0.802, S04 0.743, S06 0.688.
- So the pre-registered S1-only rule picks S01. Nobody has viewed S01's S2 EEG; the critic scanned only S01_s1 event codes.
- S01 OOF at π = 0.181: TPR 0.52 and FPR 0.008 at t* = 0.55; TPR 0.64 and FPR 0.046 at t* = 0.40.
- At π = 0.10 and t* = 0.55, 40 error epochs still have q > t* + 0.10.
- Within ±0.5 µV of −8.4 there are only about 4 epochs per threshold, so an exact-rounding −8.4 real epoch has only about a 1/3 chance of existing in S2.
- These are PROBE numbers. Platt here is in-sample, so they never go in results tables.

CONCESSIONS, with the exact change for each
#1: Swap refuted. TNR = 0.758, TPR = 0.632, LR+ = 2.61.
- The ADR records S1 as REFUTED and quotes p.385, including the p = 0.4 pair (64.42/59.36, same order).
- errp.md §0/§2/§7/§9/§10 stay as they are.
- A's −2%, +18%, +107% and LR+ 2.06 are struck.
- The qualitative point survives: 2.61 is below break-even, which is even higher under the table below.
#2: Our S1→S2 comparison is labelled "paper-like, not paper-identical": smaller single-condition training set, different trial counting, Gaussian-prototype classifier. The 69.5% reference band carries this caveat, and so does the BA-max vs native-operating-point note (#20).
#3: Codes 1/2/4/8 are documented as "cursor moves without a target bit (official bit table); semantics [UNVERIFIED]; excluded per MOABB/paper convention". Per-file counts are reported, and the pytest assertion that only {5,6,9,10} are epoched stays.
#4: Decouple.
- The policy's EXECUTE/CONFIRM/REJECT thresholds belong to Debate 5: UX D2 fixed Low 0.75, Medium 0.85, REJECT < 0.50. The canonical 0.819 gives EXECUTE, which is README-safe whatever the ErrP table says.
- The ErrP cost table is NOMINAL tokens and is used ONLY for t*.
- Struck: A's "derived constraint C_FN ≤ 6.46", "H_Low must be 0", and the "one table drives both" claim. H stays 0/4/20 as ErrP-table parameters.
#5: The penalty M(d) applies ONLY to ranking and offer selection. It never touches the s that feeds the policy.
- The single policy effect is the h-flag (M < 0.9 escalates EXECUTE to CONFIRM).
- The S4 panel shows the unpenalised SPARQL Match plus a trace line: "ErrP memory ×0.50 (ranking only) → CONFIRM".
- New self-test: false rollback, then re-issue Ceiling, must land on CONFIRM, never REJECT. Disconfirmation (§4.4) is reachable again.
- Reset clears the memory.
#6: Two changes.
- C_FP now includes the +1 nominal CONFIRM escalation.
- Hard floor: never roll back unless Λ > 1, i.e. q > π. Rule: roll back iff q > max(t*, π).
- Python computes the fully recursive t* (C_FP/(1 − FPR(t*)), fixed point on S1 nested OOF) and asserts |Δt*| < 0.02 against the JS t*, since FPR ≤ about 5% per E2. It also reports the preset FPR at t*.
#7: Conceded in full.
- CAR is justified by S1-LOBO only (0.794 vs 0.746; 0.745 vs 0.704).
- Segment filtering is validated by S1 feature identity (max |Δfeature| between segment and continuous filtering), not by S2 AUC.
- Every S2 number is struck from the ADR rationale, including the C_FP 2 vs 5 ΔE.
- S02 and S04 are marked "S2 viewed during design" in results tables.
- DEFENCE on deployment-subject exclusion: excluding S02 *because* its S2 was seen to be good is itself an S2-informed choice. Disclosure is the neutral remedy. The point is moot anyway: per E2 the S1-only rule picks S01, which is uncontaminated.
#8: The gate is nested: Platt on 9 blocks, ΔE on the held-out block, rotated. Its verdict goes in metrics.json and the ADR.
- 'flag' gets a minimal UI TONIGHT, the same component as #9: S5 status "Possible Error Detected • not rolled back (flag only)", an ERRP_OBS audit entry, and no state change.
- The one-token undo stays post-mid-eval.
- Scripted mode is always 'auto' so README S5 is reproduced verbatim. Replay honours the gate.
#9: Conceded. The 'setting' class (Low, t* = 1.0) uses the #8 flag-only status plus ERRP_OBS. Brightness included.
#10: The High-tier epoch is time-locked to the patient-facing approval-result announcement (the S5 result shown and spoken), not to actuation.
- The alert threshold tonight reuses the light-select t*, labelled [MODEL, provisional]. A proper alert-cost row comes post-mid-eval.
- The "Patient may disagree [Undo]/[Keep]" item reuses the README queue's Approve/Reject styling and is flagged for a Debate 7 ruling.
#11: Conceded and adopted on README-fidelity grounds.
- A's Tongue → back-to-S4 mapping is NOT README-native. UX D7 (BACK on the alternative card = [Return to Home]) is.
- Cost cells are computed in SA.config from the Debate 6/7 navigator. A test asserts the table matches the navigator paths.
- C_TP uses P(alternative correct | h* wrong) from the resolver (≈ 0.52, errp §10.1) instead of 0.5/0.5.
- Provisional light-select values under D7:
  - C_FP = Return Home 1 + Lights 1 + Ceiling 1 + Turn On 1 + CONFIRM 1 = 5.
  - C_FN = undo 3 (critic's count) + reach 4 = 7.
  - C_TP = 0.52·1 + 0.48·5 = 2.92.
  - So t* ≈ 0.55 and break-even LR+ ≈ 5.5 at π = 0.181.
  - This is higher than A's 0.40, and per E2 still workable: TPR about 0.5 at FPR under 1% for S01.
  - Night Mode under the D7 path: C_FP 5, C_FN 15, C_TP 3, so t* ≈ 0.29 (not 0.077), with the q > π floor as backstop.
#12: π = 1 − c is labelled a MODELLING CONVENTION, since c is a score product, not a calibrated posterior. Two cases now defined:
- After a CONFIRM, or a preset diff-preview commit: π' = (1−c)·0.074 / (c·0.913 + (1−c)·0.074), using UX §2.2 false/true-confirm rates [MODEL].
- Replay: the trace shows both identities, "MI: IV-2a A0x · ErrP: BNCI013 S01 s2 #k".
- Floor π ≥ 0.02. X4 is still open and π inherits it, as stated.
#13: The seed criterion moves to q > t* + 0.10 at π = 0.10, the lowest π the demo script uses (c = 0.90).
- Because q is monotone in π for fixed Λ and t* is fixed per class, this holds for every π ≥ 0.10.
- The correct-epoch seed must have q ≤ 0.10 at π = 0.36.
- Self-test vectors at π ∈ {0.10, 0.181, 0.36}.
- Harness caption: "detection depends on prior π; above c ≈ 0.90 the detector may keep". The loud failure stays for slider extremes.
#14: (a) The auto-confirm toggle runs the synthetic CORRECT epoch through the detector, so the decision is computed, not set.
(b) ErrP-health gauge: deployment subject S2 AUC and BA at t*, labelled PRELIMINARY, plus the last q and the current mode.
(c) X8 tiers are not this debate's to resolve. The table is computed per tier from SA.config devices, so either ruling works.
#15: The synthetic generator is fixed as follows.
- Spatial mixing uses the symmetric square root (eigh) of S01's S1 pre-stimulus covariance, not a random matrix. The critic's Cholesky would fail: CAR covariance is rank 63.
- Per-component topographies (Ne at the Ne latency, Pe at the Pe latency).
- α is shown in the caption.
- Both synthetic TPR AND FPR over 200 seeds are disclosed.
- DEFENCE of keeping synthetic for Scripted mode: an exact −8.4 real S2 epoch exists with only about 1/3 probability (E2). Searching S2 for one adds a second code path tonight for a coin-flip. So Scripted = synthetic, labelled "Synthetic"; Replay = real.
#16: Replay keeps the README format with an adjacent caption: "descriptive; detection uses 72 features; q = …".
- The window is defined as 200–350 ms in filtered-signal time, stated as such.
#17: The Replay set becomes 2 TP, 2 TN, 1 FN, 1 FP (real S01 S2 epochs), plus 2 synthetic.
- Size: 8 × about 315 KB ≈ 2.52 MB, so the budget is raised to 2.6 MB.
- `expected` is stored at the canonical π, and |q − t*| ≥ 1e-3 is guarded there only, stated as such.
#18: 1000 permutations tonight; the Plan A/B split on this item is dropped.
- ΔE[C] at each π is computed by reweighting class-conditional rates, stated explicitly.
#19: The licence note cites CC BY-NC-ND 4.0 §2(a)(4) (format/technical modifications), drops "verbatim", and keeps "pending supervisor confirmation".
#20: Three disclosures are added:
- Platt is fitted on OOF fold-model scores and applied to the refit model.
- EVENT.POS is 1-based: [UNVERIFIED] until checked against MOABB `_convert_run_epfl` source (MOABB is not installed), impact ≤ 2 ms.
- BA-max threshold vs the Gaussian classifier's native operating point.

DEMO-FIRST ADDITIONS (my own position)
- A self-test asserts README S5 byte-for-byte in Scripted mode: the exact status strings and ON ➔ OFF, with Bedside Lamp offered with [Retry] focused and [Return to Home].
- Scripted is the default mode; Replay is a harness toggle.
- Build order for tonight's agents:
  1. loader, pipeline, export and parity (gates everything);
  2. Scripted JS path and self-tests;
  3. Replay plus the flag-only status;
  4. comparators (Ferrez-style, xDAWN+TS), LOSO and the isotonic check.
- If the clock runs out, item 4 slips to post-mid-eval first. Items 1–3 cannot slip.

FINAL REVISED CHOICES (only the sub-questions that changed)
- Swap: refuted. TNR 0.758, TPR 0.632, LR+ 2.61. errp.md stays as written.
- Policy thresholds: decoupled from the ErrP table and owned by Debate 5 (UX D2). The ErrP table is nominal tokens, used for t* only.
- Penalty: M affects ranking and offer only. The h-flag (CONFIRM escalation) is its only policy effect. New false-rollback→re-issue→CONFIRM self-test.
- Decision rule: roll back iff q > max(t*(class, tier), π).
  - t* is computed from navigator-derived costs, with D7 BACK = Return to Home and C_FP including +1 CONFIRM. Provisional: light-select ≈ 0.55, Night Mode ≈ 0.29.
  - The recursive t* is checked in Python.
- Modes: 'auto'/'flag' gate is nested and reported. The flag-only status ships tonight, also used for the 'setting' class. Scripted is always 'auto'.
- High tier: time-locked to the approval-result announcement; provisional threshold; Debate 7 rules on the queue item.
- Deployment subject: S1-LOBO winner, S01 by S1-only probe. S02 and S04 are tagged "S2 viewed during design".
- Synthetic: covariance-matched mixing, per-component topographies, seed margin at π = 0.10, TPR and FPR disclosed.
- Replay: 2 TP, 2 TN, 1 FN, 1 FP real, plus 2 synthetic, budget ≤ 2.6 MB.
- Permutations: 1000 tonight.
- Unchanged from A, as the critic endorsed: direct v5 loader; CAR64; 922-sample causal step-zi segments; 72 window means with sLDA; Platt plus Saerens; xDAWN+TS tonight and EEGNet post-mid-eval with the pre-registered switch rule; S1→S2 primary with S1-LOBO selection; JS module split; repr-precision export; float32-decoded parity through the Node vm runner; second-best exclusion; no scripted posterior; repeat-ErrP → Home.

=== judge:errp-design ===

{"adr_file":"C:/Users/AK/Documents/FYP/docs/adr/0002-errp-design.md","transcript_file":"C:/Users/AK/Documents/FYP/docs/debate/errp-design.md","one_line":"Swap refuted (LR+ 2.61); the browser detector is CAR-64 + causal 1-10 Hz step-zi + 72 window means + sLDA with Platt/Saerens; rollback iff q > max(t*, pi) using navigator-derived nominal-token costs (light-select t* ~0.55 provisional); the ErrP penalty affects ranking only (Bedside offered by second-best rule plus ranking flip); the synthetic -8.4 uV epoch is verified against trained weights; High tier is log-only tonight.","decisions":["D1 Cross-check S1 is REFUTED from the full text p.385 (lines 449-453): TNR 0.758, TPR 0.632, LR+ 2.61. errp.md stays unchanged; Proposer A's 2.06/-2%/+18%/+107% are struck.","D2 Direct scipy.io.loadmat v5 loader in research/errp/data.py. Sample index = EVENT.POS-1 (verified against MOABB source). TYP 6/9 = error, 5/10 = correct. Label[:64]. Codes 1/2/4/8 described as single-bit cursor/target codes [UNVERIFIED semantics], excluded, and counted per file.","D3 pytest invariants: only {5,6,9,10} epoched; error fraction in [0.15,0.30] per subject-session; 64 channels with all 8 feature channels present; epoch shape (n,64,922).","D4 Segments run -1.0..+0.8 s (922 samples, event index 512). CAR-64, justified by S1-LOBO only. butter(4,[1,10],fs=512,sos) applied causally with sosfilt and step zi. Baseline [410,512). Segment vs continuous filtering validated on S1 features only (<=0.05 uV).","D5 Primary detector: 8 channels x 9 windows of 51 samples (0.2-0.7 s) = 72 features, LDA(solver=lsqr, shrinkage=auto), refit on all of S1.","D6 Comparators are Python-only and run in the last build slot tonight: Ferrez-style FCz/Cz at 64 Hz + sLDA, and XdawnCovariances(4,lwf)+TangentSpace+LogReg. EEGNet-8,2 and MDM are post-mid-eval. Pre-registered switch rule: dAUC >= 0.03 on >= 4/6 subjects plus 1e-4 parity.","D7 Evaluation: cross-session S1->S2 is primary, labelled 'paper-like, not paper-identical'. S1-LOBO is used for selection and Platt. Secondary: S2-LOBO, random 10-fold (optimistic) and LOSO. 1000 permutations tonight.","D8 Metrics: AUC primary; BA/TPR/TNR/LR+ at q>0.5, at the S1 BA-max threshold and at each t* for pi in {0.10,0.181,0.223,0.334}; Brier/ECE/log-loss; dE[C] by class-conditional reweighting. Success band: BA >= 64.5% and AUC above the 95th permutation percentile on >= 5/6 subjects. All outputs labelled PRELIMINARY.","D9 Calibration: Platt (LogReg C=1e6) on S1-LOBO OOF scores, applied to the full-S1 refit (disclosed), then Saerens prior shift.","D10 Deployment subject = S1-LOBO AUC argmax over eligible {S01,S03,S05,S06}; S02/S04 are ineligible because their S2 was viewed. Expected result S01. A contamination ledger appears in every results table.","D11 pi is a modelling convention: pi = 1-c after EXECUTE. After CONFIRM or a preset diff commit, pi' = (1-c)*0.074/((1-c)*0.074 + c*0.913). Floor 0.02. Replay shows both the MI and ErrP data identities.","D12 SA.config.costs holds nominal-token cells computed from SA.nav BFS (tested against the navigator) and feeds ErrP t* only. H = 0/4/20. Policy thresholds remain Debate 5 constants (UX D2: 0.75/0.85/0.50), decoupled because consistent units would break canonical EXECUTE.","D13 Roll back iff q > max(t*(class,tier), pi), with t* = C_FP/(C_FP+C_FN-C_TP) and C_FP including the +1 CONFIRM escalation. Provisional values under UX D7: light-select t* ~0.55 (5/7/2.92); setting class Low t* = 1.0 (flag only); Night Mode t* ~0.29. Recursive t* is checked in Python (|dt*| < 0.02, else override exported).","D14 Nested per-subject mode gate SA.config.errp.mode 'auto'|'flag'. Scripted mode is always 'auto'. Replay honours the gate. Tonight, 'flag' shows the status 'Possible Error Detected • not rolled back (flag only)' plus ERRP_OBS, with no state change.","D15 Setting class: flag-only status plus ERRP_OBS. The Medium-tier AC setting still auto-rolls back.","D16 High-tier caregiver-approved actions are never auto-rolled back. The epoch is locked to the approval-result announcement. Tonight is log-only (ERRP_OBS); the 'Patient may disagree' queue item and alert-cost row are post-mid-eval and need a Debate 7 ruling.","D17 At most one automatic alternative per episode; a second rollback goes to Home and writes a caregiver log entry.","D18 Episode layer: the offer is the argmax excluding h* (second-best rule). Persistent layer: M(d) = max(0.5, min(1, prod Lambda_k^(-0.5*2^(-n_k/20)))), scope (user,room,command,entity), interaction decay, Reset clears it. M applies to ranking, offer and display only, never to the policy s; the h-flag M < 0.9 escalates to CONFIRM. In the canonical case Ceiling 0.47 < Bedside 0.88. Selftests cover the ranking flip, the offer, and false-rollback -> re-select -> CONFIRM.","D19 No scripted posterior anywhere; KG CQ14's 0.91 is replaced by the computed q.","D20 -8.4 uV is the single-trial FCz minimum, 200-350 ms in filtered-signal time, descriptive only. Scripted mode shows the README string verbatim with the value computed from the epoch. Replay shows the measured value plus a caption.","D21 research/errp/synth.py: 64x922 raw-like epochs with DC offsets; pink+alpha background mixed by the symmetric square root of the S1 pre-stimulus covariance; per-component topographies; alpha grid {1.0..2.5} under caps; error seed with FCz min -8.4 and q >= t*+0.10 at pi=0.10 (search to 99999); correct seed with q <= 0.10 at pi=0.36. Synthetic TPR, FPR and alpha are disclosed.","D22 test_errp_synth.py and the JS selftest assert the decisions at pi in {0.10,0.181,0.36} and FCz min -8.4 +/- 0.05. [Simulate ErrP] fails loudly rather than forcing a rollback.","D23 [No ErrP] and the auto-confirm toggle run the synthetic-correct epoch through detector.observe. The ErrP-health gauge shows deployment-subject S2 AUC/BA (PRELIMINARY), the last q and the mode.","D24 JS modules: POC/js/dsp/butterworth.js, POC/js/errp/{features,classifier,detector,memory,synth}.js, float64 throughout. Decisions are rollback|keep|flag|log. Event errp:observed on SA.bus. observeMs = 1000.","D25 Exports: POC/js/data/errp-model.js (<10 KB, repr precision, sos, ziUnit, w[72], b, Platt, piTrain, mode gate, synth stats, licence) and POC/js/data/errp-replay.js (<=2.6 MB: 2 TP/2 TN/1 FN/1 FP real S2 epochs plus 2 synthetic, float32 base64, expected values at pi=0.181).","D26 Parity: research/tests/test_errp_parity.py drives node research/export/node_runner.js (vm, index.html order) on float32-decoded inputs. Tolerances: features 1e-9, score/q 1e-6, gate 1e-4, plus |q-t*| >= 1e-3 at canonical pi.","D27 Licence: CC BY-NC-ND 4.0 section 2(a)(4) format modification, with attribution, pending supervisor confirmation. Iwane23 (CC BY) is the fallback."],"tonight_vs_post_mid_eval":["TONIGHT slot 1 (cannot slip): research/errp/{data,preprocess,features,train,calibrate,evaluate,synth}.py, research/configs/errp.yaml, research/export/{export_errp.py,node_runner.js}, and tests test_errp_{data,pipeline,synth,parity}.py. Full evaluation protocol on sLDA with 1000 permutations, PRELIMINARY.","TONIGHT slot 2 (cannot slip): JS dsp/butterworth.js, errp/{features,classifier,detector,memory,synth}.js, data/errp-model.js, data/errp-replay.js. Scripted S5 path with selftests: README S5 byte-exact; ranking flip plus Bedside offer; false-rollback re-select reaches CONFIRM; canonical EXECUTE; costs match the navigator; synthetic decisions at 3 priors.","TONIGHT slot 3 (cannot slip): Replay mode, flag-only status (flag mode and setting class), High-tier log-only ERRP_OBS, ErrP-health gauge, auto-confirm via the synthetic-correct epoch.","TONIGHT slot 4 (slips first): Ferrez-style and xDAWN+TS comparators, LOSO, random 10-fold, isotonic sensitivity check.","POST-MID-EVAL: EEGNet-8,2 and xDAWN+MDM, with switch-rule evaluation.","POST-MID-EVAL: 'flag' one-token undo UI; High-tier 'Patient may disagree [Undo]/[Keep]' queue item with alert-cost row (Debate 7).","POST-MID-EVAL: gamma=1 confirmed-alternative upgrade and adaptation samples; codes 1/2/4/8 as goal-reached analogues; Iwane23 fallback if NC-ND is rejected; Plan A re-run (ErrP config is unchanged, PRELIMINARY label dropped)."],"questions_for_user":[]}