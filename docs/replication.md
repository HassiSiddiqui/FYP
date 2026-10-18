# SFE-GAT replication on BCI IV-2a: results (PRELIMINARY, Plan B)

**Status:** 2026-10-14, evening before the mid evaluation. Written by the docs writer from the run files named below. Every number is copied or recomputed from a file on disk and nothing is rounded up. Accuracies are given as **k/288, floored to 2 decimals** (ADR 0001 amendment §7).
**Label on every number:** **PRELIMINARY (Plan B: 1 seed; LOSO deferred to Plan A).**
**One-line verdict:** under the paper-literal protocol, our SD replication reaches **35.68 % (925/2592)** against the paper's **77.70 %**. By the pre-registered D16 bands that is **Not reproduced (PRELIMINARY, 1 seed)**, and it is **below the B0 floor on every subject** (ADR 0001 revisit condition 3 fired; audit below).

Contents: §1 protocol · §2 per-subject results · §3 calibration and the exported model · §4 analysis of the gap · §5 the paper's own inconsistencies · §6 JS↔PyTorch parity · §7 what Plan A will test · §8 provenance and how to re-run.

---

## 1. Protocol P0 (summary; the authority is [ADR 0001](adr/0001-replication-fidelity.md))

| Item | P0 setting (ADR 0001 decision) |
|---|---|
| Data | BCI Competition IV-2a (BNCI 2014-001), 22 EEG channels, 250 Hz, window **[2.0, 6.0) s**, 1,000 samples, crop then filter, all 288 trials per session kept (D10) |
| Protocol | **SD:** 9 per-subject models, train on A0xT (288), test once on A0xE (288) (D11). No tuning on E, last epoch, no early stopping (D13) |
| Graph | Hilbert phase → broadband PLV → whole-matrix z-score (ε = 1e-8) → zero diagonal → edges with z > **τ = 0.3** (D4) |
| Node features | 8 Butterworth bands 8–40 Hz (4th order, zero phase) → Welch PSD (250-sample Hann, 50 % overlap) integrated per band. **Units µV², no log, no normalisation** (D10, paper-literal) |
| Model | stem GATv2(8→32×4) → 3 × [GATv2 → ReLU → BN(128); GAE: GCN(128→32) → ReLU → BN(32), P = σ(zᵢᵀzⱼ); mask: train M = 1(P > R), eval M = 1(P > **η = 0.5**)] → GATv2 → ReLU → BN → mean pool → Dropout(0.5) → Linear(128→4). **149,796 parameters** |
| Loss and gradient | cross-entropy only (λ_recon = 0); hard mask with no gradient path (D7, D8) |
| Training | SGD lr 0.01, momentum 0, weight decay 1e-3, batch 64, **500 epochs**, seed 0, 1 thread per job |
| Seeds | **1** (seed 0). Plan A uses 3 |
| Pre-registered verdict (D16) | SD target 77.70 %: Reproduced if \|Δ\| ≤ 3.0 pp, Consistent if ≤ 5.0 pp, Not reproduced if > 5.0 pp |
| Floor B0 (D18) | log10 band power (176 features) → StandardScaler → LogisticRegression(C = 1, max_iter = 2000), fit on T, test on E |

**Plan B as run** (ADR 0001 amendment §5, a disclosed deviation): SD × 9 plus calibration fold 0 only. **LOSO-T, V5, A1, A3 and A4 were not run.** SI is reported as "not run (post-mid-eval)", never as a partial value. Gate G3 was not run before training either (amendment §4).

---

## 2. Per-subject results: subject-dependent (SD), session T → session E

Run `research/runs/20261014-1549-planb-sd-p0/` (config `configs/plan_b.yaml`; Python 3.14.7, torch 2.14.1+cpu, PyG 2.8.0.post1, Windows 11). **All 9 subjects are finished** (`summary_sd.json`, 17:18). Paper values come from Fig. 3a, read from the PDF bar labels ([docs/research/base-paper.md](research/base-paper.md) §"Fig. 3").

| Subject | **Ours P0** acc, k/288 | Ours κ | Ours macro-F1 | Train acc, epoch 500 | **Paper Fig. 3a** acc (k/288) | Paper κ | B0 floor (ADR, ad hoc) | B0 floor (recomputed here) | p vs chance† |
|---|---|---|---|---|---|---|---|---|---|
| A01 | **34.37 % (99/288)** | 0.1250 | 0.3336 | 98.26 % | 80.21 (231) | 0.736 | 54.5 % | 54.86 % (158) | 2.4e-4 |
| A02 | **29.51 % (85/288)** | 0.0601 | 0.2813 | 93.75 % | 61.46 (177) | 0.486 | 36.1 % | 34.02 % (98) | 0.046 (at the bound) |
| A03 | **37.15 % (107/288)** | 0.1620 | 0.3645 | 98.95 % | 89.24 (257) | 0.856 | 63.2 % | 64.93 % (187) | 3.3e-6 |
| A04 | **38.54 % (111/288)** | 0.1805 | 0.3724 | 96.87 % | 70.49 (203) | 0.606 | 43.8 % | 44.09 % (127) | 2.8e-7 |
| A05 | **26.38 % (76/288)** | 0.0185 | 0.2512 | 91.31 % | 72.92 (210) | 0.639 | 32.3 % | 30.90 % (89) | **0.31 (not above chance)** |
| A06 | **30.20 % (87/288)** | 0.0694 | 0.2908 | 98.26 % | 71.88 (207) | 0.625 | 40.3 % | 37.50 % (108) | 0.026 |
| A07 | **39.23 % (113/288)** | 0.1898 | 0.3873 | 95.83 % | 86.11 (248) | 0.815 | 60.8 % | 62.84 % (181) | 7.3e-8 |
| A08 | **34.02 % (98/288)** | 0.1203 | 0.3304 | 95.48 % | 85.07 (245) | 0.801 | 57.3 % | 59.02 % (170) | 3.8e-4 |
| A09 | **51.73 % (149/288)** | 0.3564 | 0.4994 | 99.30 % | 81.94 (236) | 0.759 | 63.5 % | 62.50 % (180) | 2.4e-22 |
| **Mean** | **35.68 % (925/2592)** | **0.1424** | **0.3457** | — | **77.70 (2014/2592)** | 0.7026 | ≈ 50.2 % | 50.07 % (1298/2592) | — |

† One-sided binomial test against 25 % chance, n = 288, uncorrected. 85/288 is the 95 % chance bound.

**Verdict (D16):** Δ = 35.68 − 77.70 = **−42.02 pp → Not reproduced (PRELIMINARY, 1 seed)**. Below the B0 floor on 9/9 subjects; audit per ADR 0001 revisit 3 (§4).
**SI (LOSO):** **not run** (post-mid-eval). Paper 66.59 % / κ 0.5545.
**Ablations (Fig. 4):** **none run** under Plan B. The paper's values (FE-GAT 75.32, SFE-GCN 71.45, PLV-GAT 65.22, R-SFE-GAT 59.57, R-GAT 47.80) are in [base-paper.md](research/base-paper.md) §"Ablations".
**Table 2 / Fig. 5 / Fig. 6 / latency:** not run.

Other measures:
- **Macro precision**, ours: 0.3327, 0.3197, 0.3714, 0.4290, 0.2631, 0.2917, 0.3911, 0.3545, 0.5214; mean **0.3638** (paper 0.7801).
- **κ identity:** every κ above equals (acc − 0.25)/0.75 exactly, as it must with 72/72/72/72 test labels (D17).
- **Rank agreement with Fig. 3a** (Spearman, n = 9): P0 vs paper ρ = **0.48** (p = 0.19). B0 (recomputed) vs paper ρ = **0.87** (p = 0.0025). The simple floor ranks subjects much as the paper does; P0 does not.
- **Training-mode accuracy at epoch 500** is the last line of each `sd_A0x/train_log.jsonl`. It is measured in train mode, with dropout and the MC mask active.

**About the two B0 columns.** The ADR 0001 amendment values were measured ad hoc during red-team round 1 and are **not logged under `research/runs/`**. The "recomputed here" column comes from the docs writer's own ad hoc run of the D18 recipe on the cached `*_paper.npz` features (`research/.cache/docs/b0_check.json`). The two columns differ by up to 2.8 pp per subject (A06), and the cause has not been found (candidates: solver or feature-cache version). **Neither column is a pre-registered B0** until `research/sfegat/floor.py` writes `runs/<stamp>_floor_B0_s0/` (deferred, post-mid-eval). The conclusion does not depend on which column is used: P0 is below both on every subject.

**Training log note.** `research/runs/planb-sd.log` ends with a `BrokenPipeError: [WinError 232]` from a multiprocessing pool worker. It happened **after** all 10 jobs had written `result.json` and the parent had written `summary_sd.json` and printed `SD mean` (`planb-sd-run.log`). No result is affected.

**Superseded run `20261014-1547-planb-sd-p0`.** An earlier launch of the same config. It holds `sd_A01–A03` and a `deploy_A01` built on the withdrawn 240/48 design (T* = 16.03; E accuracy 37.15 %, 107/288). It is **not used** for any reported number or export, because D21 makes the exported model the P0 SD A01 model itself. It is still useful as a determinism check: its `sd_A01–A03` reproduce run 1549's E accuracy, precision, F1 and κ, and its epoch-500 training loss, **identically**.

---

## 3. Calibration fold and the exported browser model

**Exported model:** `POC/js/data/sfegat-weights.js` = run 1549 `sd_A01` (D21), seed 0, trained on all 288 A01T trials, A01E accuracy **34.37 % (99/288)**. Paper A01: 80.21 %.

**Temperature scaling** (D21 fallback "fold 0 only, disclosed"; `calib_A01/result.json`, cross-checked in `research/.cache/redteam2/calib_check.json`):

| Quantity | Value |
|---|---|
| Fold | StratifiedKFold(4, shuffle, rs = 0), **fold 0 only**: 216 A01T trials train, **72 held out** (18 per class) |
| **T\*** | **8.019** (bounded NLL fit over log T in [ln 0.05, ln 20]) |
| **OOF accuracy** (held-out A01T, the session-T-only error estimate) | **37.50 % (27/72)** |
| OOF NLL before → after | 2.927 → 1.320 |
| OOF ECE15 before → after | 0.481 → 0.055 |
| A01E NLL before → after (information only, never used for fitting) | 4.088 → **1.426** (a uniform guess scores ln 4 = 1.386) |
| A01E ECE15 before → after (information only) | 0.494 → 0.059 |
| A01E mean max-probability after scaling | 0.400 |
| Fold-0 model on A01E (information only) | 31.94 % (92/288) |

Reading: T\* = 8 flattens the softmax until the confidence roughly matches the true ≈ 35 % hit rate (ECE 0.06). **Scaled NLL on E is still worse than a uniform guess**, so the probabilities carry almost no information. The UI therefore says "temperature-scaled (T* = 8.0, fit on 72 A01T trials)", not "calibrated". T\* was fitted on 216-trial fold models and applied to the 288-trial model (disclosed per D21). Folds 1–3 run after the mid evaluation.

**Replay set** (`POC/js/data/mi-replay.js`, D22; `research/.cache/parity/mi_replay_log.json`):
- 20 A01E trials, the **first 5 per class in trial order** (indices 0–11, 13–17, 20, 24, 27).
- **D26 margin rule excluded 0 trials** (0/288 A01E trials failed). Float32-vs-float64 prediction disagreements: 0.
- **Subset accuracy 10/20 (50 %) vs full A01E 99/288 (34.37 %).** The subset is better by chance; it was not chosen by correctness.
- `test_replay_trials_unseen` passes: every exported trial hashes to an A01E trial and to no A01T trial.
- The viva script picks **A01E-t020** (truth Both Feet, decoded correctly, p = 0.39 after scaling) and says on screen that it was picked because it decodes correctly.

---

## 4. Analysis of the gap (audit per ADR 0001 revisit condition 3)

No leakage was found (E is used only after training, the epoch count is fixed at 500, the last epoch is used, and replay trials are hash-checked). The failure is in **generalisation**, not in the evaluation. Findings, ordered by the strength of the evidence:

**(i) Overfitting within a session, not only between sessions.** Training-mode accuracy ends at **91–99 %** for every subject (table above). On the A01 calibration fold, the model scores **37.5 % (27/72) on held-out trials from the same session T**. Session shift therefore cannot be the whole story: the model memorises its 288 training graphs and does not generalise even inside session T. With 149,796 parameters and 288 trials, nothing stops this except Dropout(0.5) and weight decay 1e-3.

**(ii) Unnormalised, heavy-tailed µV² node features (paper-literal, D10).** Measured on the feature cache (`research/.cache/redteam2/feat_scale.py`):
- A01T band powers have median 1.75, p99 16.6 and max 81.4 µV².
- A03T has max 176 µV², and band 1 (8–12 Hz) has a mean about 8× that of band 8.
- The stem GATv2 has **no BN or log in front of it**, so a few large-power channels and trials dominate the input scale.
- The same features after `log10` and z-scoring, fed to a plain logistic regression (B0), beat P0 on **every** subject: ≈ 50 % vs 35.68 % mean.

**(iii) Session-to-session power shift.** Measured on the same cache:
- **A02:** mean band power **3.21 µV² (T) vs 9.00 µV² (E)**; median 1.41 vs 5.85. Band by band, 20–24 Hz is 5.9× and 24–40 Hz is **7.9–9.9× higher on E**.
- Raw µV² inputs pass such a shift straight into the network.
- **But** A03 is stable (mean 6.28 vs 5.74 µV²) and still only scores 37.15 %. So the shift is real but secondary to (i) and (ii).

**(iv) The "evolution" is inert on the trained model, so P0 is functionally FE-GAT (A3).**
- Under the stated CE-only loss, the hard mask passes no gradient to the GAE (ADR 0001 D7–D9). The GAE's GCN projection stays at its seed-0 initialisation. (RT2 reports its weights as bitwise equal to the init; the fixer did not re-verify this.)
- Measured on our P0 A01 model (`research/.cache/redteam2/mask_check.json`, `mask_train_check.json`):
  - eval-mode keep fraction is **1.0 in all 3 blocks** for both A01T and A01E;
  - min P = 0.9939 (T) and 0.9988 (E);
  - train-mode MC keep fraction is ≥ 0.99998.
- **The evolution is inert even at initialisation:** the untrained seed-0 model keeps 100 % of edges at η = 0.5 (min P 0.64 at block 3). Training pushes P towards 1 because the learned GATv2 features grow in scale, and the fixed random GCN projection turns that into large inner products, which saturate the sigmoid.
- **Browser evidence:** on all 20 replay trials the JS forward pass gives identical edge counts at evo0, evo1, evo2 and evo3 (e.g. 172/172/172/172). The brain-graph caption says so.
- **PROMPT §5 "the brain graph visibly evolves evo0→evo3" is NOT MET** on the trained model.
- **How much of the gap this explains:** the paper's own ablation puts the value of evolution at about 2.4 pp (FE-GAT 75.32 vs 77.69). It cannot explain a 42 pp gap.
- **The machinery itself is verified:** the JS parity suite has a non-trained weight set ("calib") on which the mask does prune (A01E-t000: 172 → 146 → 142 → 142 edges), matching PyTorch exactly.

**(v) One seed, no variance estimate.** With 288 test trials, the 95 % sampling interval on one subject at about 35 % accuracy is about ±5.5 pp, and about ±1.8 pp on the 9-subject mean. Seed-to-seed variance is unknown until Plan A, but no plausible seed effect closes 42 pp.

**(vi) What the paper does not tell us.** These are protocol details that could explain a large part of the gap. They are not claims that the paper is wrong:
- no feature scaling is stated;
- the training script is not public (`monte_carlo_new_edge_index` and the τ call site are missing);
- no validation set or model-selection rule is given;
- the public code differs from the paper in several places: residual connections, dropout 0.2, filter order 5, nperseg 500 (base-paper.md A8, A17–A19).

All of these are pre-registered variants (§7). They were not run tonight.

**What we do not claim.** We do not claim the paper's numbers are wrong. Our result shows only that **the method as literally written, with the unspecified details resolved as in ADR 0001**, does not reach them on our pipeline.

---

## 5. The paper's own inconsistencies (from [base-paper.md](research/base-paper.md) §6, A1–A23)

| # | Inconsistency | How we resolved it |
|---|---|---|
| A7 | SD accuracy is **77.70 %** in the abstract and Table 3 but **77.05 %** in §3.8 | 77.70 is correct: it is the mean of Fig. 3a (2014/2592), every §3.8 delta is computed from it, and the Fig. 4 mean is 77.69. 77.05 is logged as a typo |
| A4 | "differentiable sampling strategy" (§1), but Eqs. 15–18 use a hard indicator, and GATv2 ignores edge values | Implemented as written (D8). The GAE gets no gradient; the D9 text below is the required disclosure |
| A1, A2 | τ and η have no values; the η symbol collides with τ in the prose and prints as a bold ø in the equation | τ = 0.3 (code default) on z-PLV; η = 0.5 strict (D4, D5) |
| A6 | Table 1: the stem GATv2(8→128) and the GAE's BN(32) are counted but never described | Both included; the count is 149,796 ≈ 0.15 M ✓ |
| A17 | BN/ReLU order: Eqs. 12–14 say GATv2 → ReLU → BN; Eqs. 20–21 have no ReLU in the classifier, but Fig. 1 and the code do | GATv2 → ReLU → BN everywhere, and the classifier ReLU is kept (deviation logged) |
| A20 | Eq. 9 prints the GATv1 formula | GATv2 is used: the parameter counts match only GATv2 |
| A8 | Eq. 7 is a periodogram, but the text says Welch | Welch, as the text says |
| A22 | **Every baseline κ in Table 3 and every ablation κ in Fig. 4 is inconsistent with its accuracy** (κ must equal (acc − 0.25)/0.75 for balanced 4-class tests); Table 4 κ values are impossible for balanced binary κ | Reported, not "fixed". Only SFE-GAT's own κ values are self-consistent |
| A23 | Precision is called "significantly higher" without a test, and SD precision 0.7802 is below three baselines; small arithmetic slips in §3.5 | Reported |
| A15 | "288 trials × 9 subjects" could be read as one pooled SD model | Per-subject models (standard reading); pooled SD is V11 |

**Required D9 text (verbatim):**
> "The paper states that SFE-GAT updates the graph 'through a differentiable sampling strategy' (§1, l.92). Neither Eqs. 15–18 nor the released code realise this: M is an indicator function (∂M/∂P = 0 almost everywhere), the downstream GATv2 layers consume only topology, and the released `monte_carlo_new_edge_index` returns an integer `edge_index`. Our primary replication implements the equations as written; consequently the GAE receives no gradient under the stated cross-entropy-only loss, and the 'evolution' is a feature-conditioned pruning through a fixed random GCN projection of learned GAT features, which the paper's own Discussion calls 'a guided form of DropEdge' (l.913). Variants V6 (reconstruction loss) and V7 (straight-through, mask-weighted attention) test the two plausible intended readings."

**Measured addendum (ADR 0001 amendment §3):** on our P0 A01 model, σ(zᵢᵀzⱼ) ≥ 0.994 on every directed edge of every A01 trial (576 trials, T + E). So eval-mode pruning at η = 0.5 removes 0 edges in all 3 blocks, and the training-time MC mask removes about 10⁻⁴–10⁻⁵ of edges.

---

## 6. JS ↔ PyTorch parity (browser = Python, numerically)

Re-run on 2026-10-14 by the docs writer, unless marked "build log". Details are in [verification.md](verification.md).

| Check | Result | Gate |
|---|---|---|
| DSP (filter bank, filtfilt, Welch, Hilbert, FFT) vs SciPy, `tests/js_parity/dsp/test_dsp_parity.py` | **81/81 cases**, worst relative error **1.76e-12** | rel ≤ 1e-9 |
| SFE-GAT on the **trained exported weights**, all 20 replay trials (`tests/test_sfegat_parity.py`, 6 tests) | logits max abs error **9.77e-15**; temperature-scaled probabilities **3.3e-16**; edge sets A0–A3 **identical**; predicted class equal on 20/20 | logits abs ≤ 1e-4 |
| SFE-GAT stage parity on 4 weight sets × 4 trials (`node research/tests/js/eeg/eeg_parity.js`) | **16/16 PASS**; H ≤ 4.1e-16, P ≤ 2.3e-15, Z ≤ 6.8e-15, post-BN h ≤ 5.2e-14, edge sets identical | D27 stage gates |
| ErrP features, score and q on the shipped bytes (`tests/test_errp_synth.py::test_js_reference_parity`) | pass. Build log: features ≤ 6.2e-15 µV, score ≤ 3.6e-15, q ≤ 4.4e-16 | features ≤ 1e-9, score/q ≤ 1e-6 |

PROMPT §5 asks for parity within 1e-4: **met for both SFE-GAT and ErrP.** Parity shows that the browser runs the same model as PyTorch. It says nothing about whether that model is good (§2).

---

## 7. What Plan A and the variants will test (post-mid-eval; needs user approval for compute)

| Run | One-factor change | Hypothesis it tests | Code status |
|---|---|---|---|
| **B0 `floor.py`** | none (log10 PSD + LR) | puts the floor on the record as a logged run | **not written** (deferred) |
| **V10** log10 PSD | node features = log10(H) | the feature-scale cause (ii). B0 suggests the largest single gain is here | config flag exists (`features.log10`) |
| **V6** reconstruction loss | CE + λ · mean_blocks GAE recon BCE, λ = 1.0 then 0.1 | whether a trained GAE makes the evolution non-inert (P < 0.5 on some edges) and adds the paper's ≈ 2.4 pp | **not implemented** |
| **V7** straight-through | m = hard + P − P.detach(), attention α′ = α·m / Σα·m; 0 extra parameters | the "differentiable sampling" reading | **not implemented** |
| **V5** code bundle | V1 residual + V2 dropout 0.2 + V3a order 5 + V3b nperseg 500 + V4 binary GCN edges | whether the authors' public code, not the paper text, gives their numbers | flags for V1/V2/V4 exist; V3a/V3b via the `*_code.npz` cache |
| V1–V4 singly | each of the above | attribution, only if \|V5 − P0\| > 2 pp | as above |
| Seeds 1, 2 | seed | seed variance (v) | config |
| LOSO T + E × 3 seeds | protocol | the SI number (paper 66.59 %) | **not implemented in `train.py`** |
| A1–A5 ablations | Fig. 4 set | direction of each component | only A3 (`model.evolve = false`) is wired |
| V8 τ/η sweep, V9 PLV 8–30 Hz, V11 pooled SD, V12 padded window | as named | ambiguities A1/A2, A10, A15, A21 | not implemented |

**Correction to earlier docs.** ADR 0001 D15 and the study guide said that "Plan A is only a configuration change". **As of tonight that is not true.** `research/sfegat/train.py` runs only `sd` and `calib` jobs. LOSO, the ablations other than A3, V6, V7 and B0 all need code before `plan_a.yaml` can run. The model-level flags (log10, residual, dropout, GCN edge weights, evolve) do exist.

**Not yet tested, also owed:** `research/tests/test_model.py` (parameter count 149,796, GAE no-grad, κ identity) and a protocol guard test. The MC mask uses the global RNG (`torch.rand_like`, seeded by `torch.manual_seed(0)`) instead of the dedicated generator that D8/D14 require. Runs are still deterministic, as run 1547 shows, but the mask stream is not isolated.

---

## 8. Provenance and how to re-run

| Artefact | Path |
|---|---|
| Config, environment | `research/runs/20261014-1549-planb-sd-p0/config.json` |
| Per-subject results | `research/runs/20261014-1549-planb-sd-p0/sd_A0{1..9}/result.json`, `train_log.jsonl`, `test_E_logits.npy`, `model.pt` |
| Summary | `research/runs/20261014-1549-planb-sd-p0/summary_sd.json` |
| Calibration fold | `research/runs/20261014-1549-planb-sd-p0/calib_A01/result.json`, `oof_logits.npy`, `oof_idx.npy` |
| Logs | `research/runs/planb-sd-run.log` (results), `research/runs/planb-sd.log` (stderr, BrokenPipeError after completion) |
| Audit evidence | `research/.cache/redteam2/{mask_check,mask_train_check,calib_check}.json`, `feat_scale.py` |
| B0 recomputation | `research/.cache/docs/b0_check.json` (ad hoc; not a registered run) |
| Export log | `research/.cache/parity/export_run.log`, `mi_replay_log.json` |

Re-run (about 5–10 h of wall time on this 4-core CPU; ask before starting, per CLAUDE.md):
```
research/.venv/Scripts/python.exe research/sfegat/train.py --config research/configs/plan_b.yaml --workers 4
```

*All numbers PRELIMINARY (Plan B: 1 seed; LOSO deferred to Plan A). No clinical claim. Data: BCI Competition IV-2a / BNCI Horizon 001-2014, Brunner et al. 2008; embedding excerpts pending supervisor confirmation.*
