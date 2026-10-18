# ADR 0001: SFE-GAT replication fidelity

**Status:** Accepted 2026-10-14. This is the judge's ruling on the `replication-fidelity` debate; the transcript is `docs/debate/replication-fidelity.md`.

**Scope:**
- the precedence rule;
- τ and η;
- the GAE loss and the gradient through the mask;
- architecture and DSP pins;
- protocols, model selection and seeds;
- the definition of "reproduced";
- the run register;
- the deployment subject and calibration;
- JS↔PyTorch parity;
- the t-SNE / Table 2 / Fig. 6 protocol;
- tonight's timeline.

**Plan:** Plan B tonight. The mid evaluation is on 2026-10-15.
- Every number produced tonight is labelled **"PRELIMINARY (Plan B: 1 seed; LOSO trained on session T only)"**.
- Moving to Plan A changes only configuration files (D15).

---

## Context

**What the briefs say.**
- The paper underspecifies the method in several places: τ, η, the GAE loss, the gradient path, Table 1 vs the prose, and 77.70 vs 77.05.
- The released code is a non-runnable fragment. The evolution-block call raises a `TypeError`, three functions are undefined, and the repository has no licence (`reference-code.md` §2.1).
- `_cross-check.md` lists items for this debate: contradictions C1–C13, the data-split tension in §1.4, and gaps G1–G4, G13 and G14. All are resolved below.

**How the debate went.**
- Proposer A (rigor-first) and Proposer B (demo-first) both filed opening positions.
- The critic step failed, and so did Rebuttal B. Rebuttal A answers B directly and concedes six points.
- Because there was no critic, I checked the decisive facts myself:

1. **Gate 0 data integrity passes.**
   - At 15:40 on 2026-10-14, `sha256sum -c research/data/bnci2014_001/SHA256SUMS.txt` reported OK for all 18 files.
   - `A02E.mat` is 44,218,409 B and is no longer `.part`. All 12 BNCI 013-2015 files are present.
   - Caveat: the checksums were recorded locally after download. Upstream size agreement has been checked only for A01T: 42,806,453 B, per XC C16.
2. **The calibration benchmark already exists. Neither proposer used it, and it is the decisive evidence for the timeline.**
   - Source: `research/runs/benchmark-20261014-131237/metrics.json`, from an SFE-GAT-shaped PyG model.
   - Parameters: **149,796**.
   - Mean evo0 edge density on A01T at τ = 0.3: **0.382**.
   - 1 process × 4 threads: **203 ms/step**.
   - 1 process × 1 thread: 337 ms/step.
   - **4 concurrent 1-thread processes: 2.83 s/epoch each on A01T** (5 steps), i.e. **≈ 566 ms/step per process**.
   - LOSO-T fold (2,304 graphs) at 4 threads: 205 ms/step.
   - Projections in that file: SD 9 × 500 epochs ≈ **0.89 h**; LOSO-T 9 × 500 ≈ **7.1 h**, assuming ideal packing on 4 processes.
   - Both proposers planned with 40–80 ms/step. That is 4–8× too optimistic, so tonight's timeline (D31) is rebuilt from the measured figures.
   - The dense [B, 22, 22] variant is not faster: 241 vs 203 ms/step.
3. **Paper text.**
   - l.536: "approximately 0.15M trainable parameters".
   - l.539–547: the SD split is session 1 for training and session 2 for testing. For LOSO, "the remaining subjects were used for training".
   - l.733 and l.740–741: t-SNE is applied to **"node features"**.
   - l.92: "differentiable sampling strategy".
   - l.913: "a guided form of DropEdge".
4. **Existing code that the decisions must fit.**
   - `research/sfegat/{data,preprocess,graph}.py` already parameterise the contested choices: order, nperseg, integration, weighted/strict τ, and the z-score including the diagonal.
   - `POC/js/dsp/{fft,butterworth,sosfilt,welch,hilbert,integrate}.js` already pass scipy parity at a worst-case relative error of ≤ 1.8e-12 (`research/.cache/parity/dsp_parity_report.json`).
   - `fft.js` computes an exact length-N DFT: radix-2 for powers of two, Bluestein otherwise, with no zero-padding of the signal. Its N = 1000 relative error is 1.0e-15.
5. **The fold arithmetic.** 288 / 4 = 72 held-out trials per fold (18 per class). A's correction of B's "54" is right.
6. **ADR 0002 D11** already defines the ErrP prior π as a modelling convention (π = 1 − c). The MI out-of-fold (OOF) error rate computed here is therefore *reported*, but it is not the source of π.

---

## Decision

### A. Precedence (Q1; resolves XC C1)

**D1. Source ranking.** The following ladder decides every replication choice:

| Level | Source | Role |
|---|---|---|
| 1 | Explicit statements in the paper's equations and prose | Always wins where explicit |
| 2 | The paper's checkable quantitative statements: Table 1 per-layer counts and "≈ 0.15M" | Decides **structure** where the prose is silent or garbled |
| 3 | Released code (`GaoHSin/SFE-GAT`) | **Fills gaps only**: where the paper is silent, or where it contradicts itself. Never overrides levels 1–2 |
| 4 | This ADR's choice, justified on session-T evidence or convention | When nothing above decides |

- CLAUDE.md §5 (README > paper > ADRs) gives code no authority of its own.
- The README governs the browser screens. It does not govern the replication numbers.

**D2. Pre-registration.**
- The primary configuration **P0** is frozen by this ADR before any result exists.
- No variant or ablation is ever promoted to primary on the basis of any result, whether from session T or session E.
- A code-only addition that contradicts an explicit equation can only be a labelled variant.

**D3. Settled PROMPT ambiguities.** Each of these becomes a `docs/traceability.md` row.

| PROMPT item | Ruling |
|---|---|
| 1. τ, η | D4, D5 |
| 2. Reconstruction loss | D7 |
| 3. Gradient through the mask | D8, D9 |
| 4. Heads | **Concatenate** (level 2: 2,560 and 33,280 require concat; XC C5) |
| 5. Table 1 inconsistency | The stem row with an empty Blocks cell is a **separate stem layer**, GATv2Conv(8, 32, heads 4). Total = 2,560 + 3 × (33,280 + 256 + 4,192) + 33,280 + 256 + 516 = **149,796**. The text-only reading gives 116,516 ≈ 0.12M and contradicts l.536 |
| 6. 77.70 vs 77.05 | **77.70 / κ 0.7027** is the SD target. 77.05 is a typo: Table 3, the abstract and all 8 improvement deltas agree on 77.70 (XC §1.2) |

### B. Graph thresholds (Q2; resolves XC C6, C7)

**D4. τ = 0.3**, applied to the per-trial, whole-matrix z-scored broadband PLV.
- μ and σ are taken over all 22² = 484 entries, **diagonal included**, with ddof = 0 and ε = 1e-8 added to σ.
- The diagonal is then zeroed.
- An edge (i ≠ j, directed) is kept iff **z_ij > 0.3** (strict, as Eq. 5 prints). Its weight is z_ij.
- The current `sfegat.graph.zscore_threshold(tau=0.3, strict=True)` already does this.
- Documentation label: **"τ = 0.3: released-code default argument; call site unreleased; not confirmed by the paper."** Never write "resolved".
- Log the realised evo0 density per subject. Measured on A01T: 0.382.

**D5. η = 0.5**, with strict `M = 1(P > 0.5)` (Eq. 18 prints `>`), applied in eval mode to P on the surviving directed edges.
- Rationale: 0.5 is the mode of Bernoulli(P). It is non-trivial because BN(32) follows the ReLU, so zᵢᵀzⱼ can be negative.
- Label: **"η is the PROMPT's symbol; the paper's glyph is garbled. The value is an ADR convention, not from the paper."**

**D6. Sensitivity sweep is post-mid-eval and descriptive only.**
- Grid: τ ∈ {0, 0.3, 0.5, 1.0} × η ∈ {0.3, 0.4, 0.5, 0.6, 0.7}.
- Evaluated by stratified 5-fold CV *inside session T*, SD, seed 0.
- P0 stays at (0.3, 0.5) whatever the outcome.
- Tonight we run zero-cost diagnostics only: evo0 density per τ on session T, and eval-mode edge retention per block at η = 0.5.

### C. Loss and gradient (Q3, Q4; resolves XC C8, C9)

**D7. Loss = cross-entropy only (λ_recon = 0).**
- Basis: §3.3 names only categorical CE (l.551), and the code never calls `recon_loss`.
- Mandatory consequence and test: under P0, all **12,576 GAE parameters** (3 × 4,192, 8.4 %) get `grad is None` after `backward()`.
  - SGD skips them, weight decay included, so they keep their seeded Glorot initialisation.
  - Their BN(32) running statistics still update and are exported.
  - Test name: `research/tests/test_model.py::test_gae_receives_no_grad`.
- Wording for reports: "**149,796 parameters, of which 137,220 receive gradient under the paper's stated loss.**"
- If the GAE ever receives a gradient in P0, that is a bug.

**D8. Mask: hard, with no gradient path. Implemented exactly as Eqs. 15–18.**

Per block ℓ = 1..3:
1. H_ℓ = BN₁₂₈(ReLU(GATv2(H_{ℓ−1}, A^{(ℓ−1)})))
2. Z = BN₃₂(ReLU(GCN(H_ℓ, A^{(ℓ−1)}, w)))
3. P_e = σ(z_srcᵀ z_dst) for each directed edge e in A^{(ℓ−1)}

Mask:
- Training: draw R_e ~ U(0, 1) per directed edge, fresh on every forward pass, from a **dedicated seeded `torch.Generator`** (D14). Keep e iff P_e > R_e.
- Eval: keep e iff P_e > 0.5.

Pruning is **cumulative**: A^{(ℓ)} = A^{(ℓ−1)} restricted to the kept edges. `edge_index` and `edge_weight` are boolean-indexed together, and a pruned edge is never re-added. Nodes survive through the GATv2 self-loops.

Rejected for P0: straight-through and Gumbel estimators. Both are no-ops unless the mask enters an operator on the logit path, and that operator is in neither the paper nor the parameter count.

**D9. Required reporting text.** This goes verbatim into `docs/replication.md` and `docs/traceability.md`:
> "The paper states that SFE-GAT updates the graph 'through a differentiable sampling strategy' (§1, l.92). Neither Eqs. 15–18 nor the released code realise this: M is an indicator function (∂M/∂P = 0 almost everywhere), the downstream GATv2 layers consume only topology, and the released `monte_carlo_new_edge_index` returns an integer `edge_index`. Our primary replication implements the equations as written; consequently the GAE receives no gradient under the stated cross-entropy-only loss, and the 'evolution' is a feature-conditioned pruning through a fixed random GCN projection of learned GAT features, which the paper's own Discussion calls 'a guided form of DropEdge' (l.913). Variants V6 (reconstruction loss) and V7 (straight-through, mask-weighted attention) test the two plausible intended readings."

This is reported as a finding about the paper, not as a defect of our build.

### D. Architecture and DSP pins (Q5; resolves XC C2, C3, C10)

**D10. P0 pins.**

| Item | P0 value | Basis | Variant |
|---|---|---|---|
| Residual `relu(conv(x)) + x` | **None** | L1: Eq. 12. Code-only (A19). Decided a priori, never by outcome (XC C2) | V1 |
| Dropout | **0.5** after the mean pool. Blocks: 0. GATv2 attention dropout: 0 | L1: Eq. 23 | V2 = 0.2 |
| Butterworth | `butter(4, [lo, hi], 'bandpass', fs=250, output='sos')` + `sosfiltfilt`, default `padtype='odd'` and default padlen. Bands 8–12 … 36–40 Hz (8 bands). Rp and Rs are documented as having no effect on a Butterworth design | L1 | V3a = order 5 |
| Welch | `nperseg=250, noverlap=125`, periodic Hann, `detrend='constant'`, `scaling='density'`, one-sided, mean averaging (7 segments, 1 Hz bins) | L1 | V3b = 500 |
| Band integral | `scipy.integrate.simpson` over the **inclusive** bins lo ≤ f ≤ hi (5 points, dx = 1 Hz) | L3: paper silent | — |
| Units | **µV²** (the `.mat` files are in µV). No log, no normalisation. Subject to the D-units gate in D31 | L4 | V10 = log10 |
| GCN encoder edges | **Weighted**: z_ij on retained edges, same indices as `edge_index`. `gcn_norm` defaults: self-loop fill 1.0, `improved=False`, degree on the target index | L1: Eqs. 5 and 15 (XC C3) | V4 = binary |
| GATv2 edges | Topology only, no `edge_dim` | L2: the counts forbid `edge_dim` | — |
| Block order | GATv2 → ReLU → BN(128) | L1 + code agree | — |
| GAE encoder | GCN(128→32) → ReLU → BN(32) | L2: 4,192 = 4,128 + 64 | — |
| Classifier | GATv2(128→32×4, concat) → **ReLU** → BN(128) → global mean pool → Dropout(0.5) → Linear(128→4) | L3: Eq. 20 omits the ReLU, but Fig. 1 and the code show it. A paper self-contradiction, so code breaks the tie. **Logged as a deviation from Eq. 20 and from PROMPT §A's listing** | — |
| Stem | `GATv2Conv(8, 32, heads=4, concat=True)` with no activation and no BN | L2: count 2,560. L3: no activation | — |
| GATv2 settings | `share_weights=False`, `add_self_loops=True`, `negative_slope=0.2`, `dropout=0`, `bias=True` (PyG 2.8.0.post1) | L2 / L4 | — |
| BatchNorm | eps 1e-5, momentum 0.1; eval mode uses running statistics | L4 (PyTorch defaults) | — |
| Optimiser | SGD, lr 0.01, **momentum 0**, no Nesterov, no schedule, weight_decay 1e-3 on every parameter with a gradient. CE with mean reduction. Batch 64, shuffled every epoch, `drop_last=False` (288 = 4 × 64 + 32). 500 epochs | L1, plus L4 for momentum | — |
| Window | **[2.0, 6.0) s** after trial start, 1,000 samples. Crop first, then filter. All 288 trials kept; artifact flags are recorded but not used | L4 (BE D2a, D12) | V12 = padded [1.5, 6.5) |
| PLV | Broadband, per trial, `scipy.signal.hilbert` with N = 1000 on the crop, no padding | L4 (BE D3a) | V9 = 8–30 Hz |

**D10a. Code-faithful bundle V5.** V5 = V1 + V2 + V3a + V3b + V4: residual, dropout 0.2, order 5, nperseg 500, binary GCN edges. It is a labelled variant, never the headline. Its features come from the existing `*_code.npz` cache path.

### E. Protocols, selection, seeds (Q6; resolves XC C11, C12, §1.4)

**D11. SD: 9 per-subject models.** Each trains on A0xT (288 trials) and is tested once on A0xE (288 trials).
- Basis: the Fig. 3a per-subject bars, the IV-2a convention, and the code's per-subject `load_data`.
- Pooled SD ("288 × 9") is variant V11, post-mid-eval.

**D12. LOSO under Plan B.**
- Fold k trains on the other 8 subjects' **session T only (2,304 graphs)** and tests on subject k's **session E (288 trials)**.
- BN statistics come from the training subjects only. There is no test-subject alignment.
- Config key: `loso.train_sessions: [T]`.
- Plan A sets `[T, E]` (4,608 graphs), which is the literal reading of "remaining subjects".
- Plan B's T-only training is a **disclosed protocol deviation**.

**D13. Model selection.**
- Use the model at the last epoch (500). There is no validation split in replication runs and no early stopping.
- Session E is evaluated **exactly once per run**, after training.
- This is enforced structurally:
  - `sfegat.train.train(cfg, train_set)` accepts only tensors tagged as allowed training data;
  - `sfegat.evaluate.evaluate(model, test_set)` is a separate entry point;
  - `research/tests/test_protocol.py::test_trainer_refuses_test_data` asserts that `train()` raises if it is given session E of the SD subject, the LOSO test subject's data, or any session E under Plan B.

**D14. Seeds and determinism.**
- Plan B uses seed **0** for every run. Plan A uses {0, 1, 2}; seed-0 runs whose config hash is unchanged are reused. There is no best-of-N, and every per-seed value is reported.
- Per run:
  - `random.seed(s)`, `np.random.seed(s)`, `torch.manual_seed(s)`, which covers the initialisation;
  - shuffle generator `torch.Generator().manual_seed(s + 1000)`, passed to the PyG `DataLoader`;
  - MC-mask generator `torch.Generator().manual_seed(s + 2000)`, used only by the mask;
  - `torch.use_deterministic_algorithms(True, warn_only=True)`;
  - `torch.set_num_threads(1)` in every queue worker.
- The thread count is recorded in `env.json`. Bitwise reproducibility is claimed only for the same thread count.
- Random graphs for A4/A5 (D18) use `np.random.default_rng(s + 3000 + subject)`.

**D15. Configuration layout.** Plan A must be a configuration change only.
- `research/configs/base.yaml` holds P0 exactly as in D4–D14. Its keys are A's skeleton:
  - `graph`: tau, tau_cmp, plv_band, zscore_include_diag
  - `features`: butter_order, nperseg, noverlap, integrate, units, log
  - `model`: residual, dropout, gcn_edge_weight, classifier_relu, stem_act
  - `gae`: recon_lambda
  - `mask`: eta, grad, granularity, resample
  - `train`
  - `loso`
  - `seeds`
  - `status`
- `research/configs/plan_b.yaml` is an overlay:
  ```yaml
  seeds: [0]
  loso: {train_sessions: [T], test_session: E}
  ablations: [A3, A1, A4]
  variants: [V5]
  status: "PRELIMINARY (Plan B: 1 seed; LOSO trained on session T only)"
  ```
- `research/configs/plan_a.yaml` is an overlay:
  ```yaml
  seeds: [0, 1, 2]
  loso: {train_sessions: [T, E], test_session: E}
  ablations: [A1, A2, A3, A4, A5]
  variants: [V5]
  status: FINAL
  ```
- One overlay per variant or ablation: `research/configs/variants/V{n}_*.yaml` and `research/configs/ablations/A{n}_*.yaml`.
- Run directories: `research/runs/<YYYYMMDD-HHMM>_<sd|loso|dep|probe|floor>_<P0|Vn|An>_s<seed>/<A0x|fold0x>/`. Each contains:
  - `config.yaml` (resolved) and `config_hash.txt`;
  - `metrics.json` and `env.json`;
  - `test_logits.npy` and `model.pt`.

### F. Definition of "successfully reproduced" (Q7; resolves XC C13)

**D16. Tiered verdicts on the 9-subject mean accuracy.** These are pre-registered and reported whatever the outcome. Numbers are reported as computed: k/2592 to two decimals, never rounded in our favour.

| Protocol | Target | Reproduced | Consistent | Not reproduced |
|---|---|---|---|---|
| SD | 77.70 % | \|Δ\| ≤ 3.0 pp (74.70–80.70) | 3.0 < \|Δ\| ≤ 5.0 pp | \|Δ\| > 5.0 pp |
| SI (LOSO) | 66.59 % | \|Δ\| ≤ 4.0 pp | 4.0 < \|Δ\| ≤ 6.0 pp | \|Δ\| > 6.0 pp |

- Under Plan B, every verdict carries "**(PRELIMINARY, 1 seed)**".
- **The SI verdict is capped at "Consistent"** because T-only training is a protocol deviation. "Reproduced" for SI requires Plan A.
- An SI shortfall beyond 6 pp is "Not reproduced". The T-only confound is stated as context, not as an excuse.

**D17. Reported alongside, not gating.**
- Per-subject accuracy, macro-precision, macro-F1 (`zero_division=0`) and κ, shown next to Fig. 3.
- The pytest `κ = (acc − 0.25)/0.75` to 1e-9, which holds exactly for 72/72/72/72 test labels.
- Spearman ρ against Fig. 3 per protocol. n = 9 is too noisy to gate on.
- Floor baseline B0 (D18). If P0 falls below B0, the pipeline is audited before any claim is made.
- **Leakage alarm:** an SD mean above 82.70 % triggers an audit before anything is reported.
- **Ablations under Plan B report direction only.** Each Δ is printed next to the paper's Δ (e.g. FE-GAT −2.43 pp, PLV-GAT −12.5 pp). Fig. 4 is not claimed as "reproduced" until Plan A.

### G. Run register (Q8)

**D18. IDs.** Every ID below is an overlay on P0 and changes one factor unless stated otherwise.

**Primary and floor.**
- **P0**: the primary run, D4–D14.
- **B0**: the floor. Features are log10(H), 176 per trial. `StandardScaler` + `LogisticRegression(C=1.0, max_iter=2000)`, fitted on T and tested on E, for SD and LOSO-T.

**Ablations** (the paper's Fig. 4 set):
- **A1 PLV-GAT**: stem + classifier on the PLV graph, no blocks.
- **A2 SFE-GCN**: every GATv2Conv replaced by GCNConv(·, 128).
- **A3 FE-GAT**: three GATv2 → ReLU → BN blocks with no GAE or MC; A is fixed.
- **A4 R-GAT**: A1 on a symmetric Erdős–Rényi graph.
  - Density is matched to *that subject's* mean session-T evo0 density.
  - One graph is drawn per trial at preprocessing and then fixed.
  - Edge weights are 1.
- **A5 R-SFE-GAT**: P0 on the A4 graphs.

**Variants.**
- **V1** residual.
- **V2** dropout 0.2.
- **V3a** order 5; **V3b** nperseg 500.
- **V4** binary GCN edges.
- **V5** code bundle (D10a).
- **V6** reconstruction loss: CE + λ · (1/3) Σ_blocks `GAE.recon_loss(z_ℓ, edge_index^{(ℓ−1)})` (PyG negative sampling), λ = 1.0, then 0.1.
- **V7** straight-through mask-weighted attention:
  - m = hard + P − P.detach(), and α′ = α·m / Σ α·m;
  - the forward pass is identical to P0; there are 0 extra parameters.
- **V8** τ/η sweep (D6).
- **V9** PLV on 8–30 Hz.
- **V10** log10 PSD.
- **V11** pooled SD.
- **V12** padded window.
- **DEP**: the 4-fold cross-fit for calibration (D21).

**D19. Tonight vs post-mid-eval.**
- Tonight, if the D31 rules allow: B0, P0 SD × 9, DEP × 4, P0 LOSO-T × 9, V5 SD × 9, A3 SD × 9, A1 SD × 9, A4 SD × 9, the D28–D30 analyses, and latency.
- Post-mid-eval, in this order:
  1. seeds 1 and 2 for SD and for every completed ablation;
  2. LOSO on T+E × 3 seeds;
  3. A2 and A5 (plus A4 if it did not run);
  4. single-factor V1–V4, run only if V5 differs from P0 by more than 2 pp;
  5. V6, then V7, then V8–V12.
- OpenBMI stays out of scope.

### H. Deployment model and calibration (Q9; resolves XC §1.4, G13 in part)

**D20. Deployment subject: A01.** This is declared now, before any of our results exist.
- It is the paper's own Fig. 5 / Fig. 6 subject.
- It is typical rather than cherry-picked: 80.21 % against the 77.70 % mean. A03 at 89.24 % would have been the cherry-picked choice.
- If our A01 result turns out poor, A01 is kept and the result is disclosed.

**D21. The exported model is the P0 SD A01 seed-0 model itself**, trained on all 288 T trials. The Replay accuracy is therefore the reported A01 replication number. No separate deployment training run is made. This supersedes A's original 240/48 design, which A withdrew.

Temperature scaling uses a **cross-fit on A01 session T**:
1. Split A01 session T with `StratifiedKFold(n_splits=4, shuffle=True, random_state=0)`: 216 trials for training and **72 held out per fold (18 per class)**. Each fold uses the P0 config, seed 0, 500 epochs and the last epoch.
2. Collect the 288 OOF logits.
3. Fit one scalar T* by minimising NLL over log T with `scipy.optimize.minimize_scalar(method='bounded', bounds=(ln 0.05, ln 20))`.
4. Apply T* to the exported full-T model.
5. Report:
   - OOF ECE (15 equal-width bins on max-softmax) before and after scaling;
   - OOF accuracy, which is the session-T-only MI error estimate;
   - A01E ECE and NLL, **for information only and never used for fitting**.
6. Disclose that T* comes from 216-trial fold models and is applied to the 288-trial model.

The OOF error rate is reported as a reference for ADR 0002. **ADR 0002 D11 remains the source of π.**

Fallback if time runs short: fold 0 alone, with 72 calibration trials, disclosed.

**D22. Replay set** (`POC/js/data/mi-replay.js`):
- **20 A01 session-E trials, 5 per class**: the first 5 per class, by trial index, that pass the D26 margin rule.
- Format: Float32 base64. 20 × 88 kB ≈ 1.76 MB raw ≈ **2.35 MB base64**, under 3 MB (XC G3).
- Trials are never selected by correctness, so misclassified trials stay in and are shown as wrong.
- `docs/replication.md` reports the subset's accuracy next to the full A01E accuracy.
- The 5-minute viva script may pick a correctly decoded trial for the canonical keystroke sequence, and says so on screen and in the script.
- `research/tests/test_export.py::test_replay_trials_unseen` asserts that the hash of every exported trial matches an A01E trial and no A01T trial.
- Licence (XC G11):
  - Attribute "BCI Competition IV 2a / BNCI Horizon 001-2014, Brunner et al. 2008" in the file header and in the UI.
  - Flag it **"pending supervisor confirmation"**.

### I. JS↔PyTorch parity across hard thresholds (Q10; resolves XC G1, G2, G4)

**D23. One rounding, float64 everywhere after it.**
- Every number crossing the boundary is rounded to float32 **once, at export**. That covers raw samples and the weights and BN statistics, which are natively float32 and therefore exported losslessly.
- Both sides upcast to float64 and compute in float64:
  - JS converts `Float32Array` → `Float64Array` before any DSP.
  - The Python parity reference reads the **same float32-rounded samples** (`research/.cache/parity/mi_replay_f32.npy`, byte-compared with the decoded JS payload). It runs the numpy/scipy DSP in float64, then `model.double().eval()` with the float32 weights cast exactly.
- Report how many of the 20 replay predictions differ between float32-rounded and original float64 input. Expected: 0.

**D24. Filters.**
- `sfegat-weights.js` carries the 8 SciPy SOS matrices and their `sosfilt_zi` vectors as float64 literals with 17 significant digits. These are **authoritative for the MI pipeline**.
- `POC/js/dsp/butterworth.js` stays as it is, but the parity test asserts that its design equals the exported SOS to ≤ 1e-12. This already holds: the measured difference is 2.2e-16.
- JS mirrors `sosfiltfilt` odd padding and the default padlen; `sosfilt.js` already passes parity.

**D25. FFT.**
- Rule: an exact length-N DFT for N = 1000 (Hilbert) and N = 250 (Welch), **with no zero-padding of the signal to 1024**.
- The existing `POC/js/dsp/fft.js` (radix-2 + Bluestein) satisfies this and is accepted. Its measured relative error is ≤ 1.3e-15.
- Both proposers' "direct DFT tonight / mixed-radix later" is moot.

**D26. Margin rule for export eligibility.** A trial is exportable only if, in float64 Python on the float32-rounded input:
- min over i ≠ j of |z_ij − 0.3| ≥ 1e-6; and
- for each block ℓ = 1..3, min over the evaluated edges of |P_e − 0.5| ≥ 1e-6.

The rule is blind to labels and correctness. The export log and `replication.md` disclose how many A01E trials failed it and why.

**D27. Stage-by-stage tolerances.** Per exported trial, all are hard assertions in pytest. Relative errors are taken against max|ref|.

| Stage | Tolerance |
|---|---|
| Filter-bank output, PSD H | rel ≤ 1e-9 |
| Analytic signal, PLV, z-PLV | rel ≤ 1e-9 |
| Edge sets A^(0), A^(1), A^(2), A^(3) | **identical** |
| P_e per block | abs ≤ 1e-9 |
| Post-BN node features per block | rel ≤ 1e-9 |
| **Logits** (acceptance) | **abs ≤ 1e-4** (expected ~1e-9) |
| Temperature-scaled softmax | abs ≤ 1e-6 |

The runner follows the existing DSP harness layout:
- `research/tests/js_parity/sfegat/run_sfegat_parity.js`: a Node `vm` context with a stub `window`. It loads the POC scripts in `index.html` order and dumps every stage as JSON to `research/.cache/parity/sfegat_parity_report.json`.
- `research/tests/js_parity/sfegat/test_sfegat_parity.py`: calls the runner via `subprocess` (Node v24, no install) and compares against `research/.cache/parity/sfegat_reference.json`, which `python -m sfegat.export` writes.
- Owner: the export and parity engineer.

### J. t-SNE / Table 2 / Fig. 5 / Fig. 6 / latency (Q11; resolves XC G14)

**D28. Table 2 / Fig. 5 primary: node-level.**
- Basis: paper l.733 and l.740–741 say "node features", and `get_embeddings` is node-level (RC §3).
- Model: the P0 SD seed-0 model of each subject, in eval mode.
- Data: that subject's session E, 288 trials × 22 nodes = **6,336 points per stage**, each labelled with its trial's class.
- Stages:
  - evo0 = raw µV² H (8-d), as in the code;
  - evo1–evo3 = the 128-d post-BN block outputs.
- Embedding: `sklearn.manifold.TSNE(n_components=2, perplexity=30, init='pca', learning_rate='auto', max_iter=1000, random_state=0)`.
- Scores: `silhouette_score` and `davies_bouldin_score` on the **2-D t-SNE coordinates**, with class labels as clusters ("the t-SNE results were quantitatively evaluated", l.738–739).
- Table 2 = the mean over the 9 subjects. Fig. 5 = A01.
- Disclose that the paper does not say which session it used. We use session E; nothing is tuned on it.

**D29. Supplementaries, labelled as such and run tonight.**
- Trial-flattened (22 × 128 = 2,816-d; evo0 176-d) and mean-pooled (128-d) versions, each with 288 points per stage.
- Silhouette and DBI on the original high-dimensional features.

**D30. Fig. 6 and latency.**
- Fig. 6: A01 session E, eval mode. For each class (72 trials), count per directed edge how many trials retain it at A^(0) and A^(3). Plot as 22 × 22 heatmaps, and give total retained edges per class.
- Latency: Python CPU, single thread. Report model-only and DSP + model times at batch sizes 1 and 288, as the median of 100 runs.
  - Run it **after the training queue drains**. If it must run while jobs are still going, label it "measured under load".
  - Never compare it with the paper's RTX 3090 figure.
- Edge-graph wording: evolved graphs are model-internal structure, not neural connectivity.

### K. Tonight's timeline (Q12)

**D31. Gates, then one FIFO queue.**
- The queue has **4 slots of single-threaded workers**.
- Per-job costs come from the measured **566 ms/step per process when 4 processes run concurrently**:
  - SD subject (5 steps × 500) ≈ **24 min**;
  - DEP fold (4 steps) ≈ **19 min**;
  - LOSO-T fold (36 steps × 500) ≈ **2.83 h**;
  - V5 ≈ 24 min;
  - A3 ≈ 20 min [EST];
  - A1 and A4 ≈ 10 min [EST]: 2 GATv2 layers instead of 5.

| Step | When | What |
|---|---|---|
| G0 | done | Data integrity: 18/18 SHA256 OK (verified 15:40) |
| G1 | before T0 | Pytest suite must pass. Checks shapes 288 × 22 × 1000; 72 per class; µV scale; κ identity; 149,796 total with per-module counts 2,560 / 33,280 / 256 / 4,192 / 516; `test_gae_receives_no_grad`; eval logits batch-1 ≡ batch-64; `test_trainer_refuses_test_data`; PyG float64 ≡ numpy dense float64 to ≤ 1e-10. **No training starts before G1 passes.** T0 is when G1 passes, projected for **≈ 17:30 [EST]** |
| G2 | T0 − 5 min | Feature caches for P0, V5 and A4 graphs, all 5,184 trials, written to `research/cache/`. B0 floor (seconds) |
| G3 | T0 − 3 min | **Trainability gate (D-units)**: A01 session T, `StratifiedShuffleSplit` 80/20 with seed 0, P0 config, 100 epochs, 4 threads (~1.5 min). **If train accuracy < 40 % AND inner-val accuracy < 35 % at epoch 100**, switch P0 globally to log10(µV²) and record it as deviation D-units in this ADR. Session E is never consulted. The benchmark's 42 % train accuracy after 10 epochs suggests the gate will pass |
| Q | T0 → | FIFO queue, in this order: **P0 SD A01; DEP folds 0–3; P0 SD A02–A09; P0 LOSO-T folds 1–9; V5 SD × 9; A3 × 9; A1 × 9; A4 × 9** |
| E | ≈ T0 + 0:40 | When A01 and DEP are done (outside the slots, on the spare hyperthreads): temperature fit → `python -m sfegat.export` → `sfegat-weights.js` + `mi-replay.js` → margin check → Node parity. **This is the demo critical path** |
| S | ≈ T0 + 1:25 | When SD × 9 is done (outside the slots): SD metrics and verdict, then the D28–D30 analyses except latency (~30–45 min [EST], 36 node-level t-SNE fits) |
| L | ≈ T0 + 9:35 | LOSO-T complete. Projected fold starts: 4 folds at ≈ T0 + 1:05–1:25, 4 at ≈ T0 + 3:55–4:15, and the last at ≈ T0 + 6:45 |
| V | ≈ T0 + 10:00 | V5, A3, A1 and A4 complete on the 3 slots freed after the second LOSO round |
| LAT | after the queue drains | Latency (D30) |
| 06:00 | cutoff | No job launches after 06:00. A job, or an ablation's set of 9 jobs, also launches only if its projected end, from measured durations, is before 07:00 |
| 07:00 | freeze | `docs/replication.md` is regenerated by script from `research/runs/` with PRELIMINARY headers |

- With T0 = 17:30, everything is projected to finish by ≈ 03:30, leaving about 2.5 h of slack.
- **Before launching the queue, the orchestrator reports these measured projections to the user** (CLAUDE.md §1, long jobs). The user's Plan B decision covers this scope. Anything beyond Plan B needs fresh approval.

**D32. Decision rules.**
- Epochs are never cut after seeing a curve. Test sets are never subsampled. No subject is dropped.
- If T0 slips, the tail of the queue drops in this order: A4, then A1, then A3. V5 and LOSO-T are not dropped.
- Anything incomplete at 07:00 is reported as **"not run / in progress (post-mid-eval)"**, never as a partial mean or from incomplete folds.
- If LOSO-T is incomplete at 07:00, SI is reported as "in progress".
- Each finished job writes its own run directory immediately. The report script never reads a run without `metrics.json`.

---

## Rejected alternatives

| Alternative | Reason rejected |
|---|---|
| Code ranked above, or equal to, explicit paper text (RC §9 as written) | The code does not run as released and its training script and call sites are missing. CLAUDE.md §5 gives code no authority. Code may only fill gaps |
| "Add the residual only if we undershoot" (BP D9) | An outcome-driven selection, and a session-E leakage path (XC C2). Replaced by the pre-registered V5 |
| Residual, dropout 0.2, order 5, nperseg 500 or binary GCN edges in P0 | Each contradicts an explicit equation or number (level 1). All are kept as V1–V5 |
| Reconstruction loss in P0 | Not in §3.3 or in the code. Kept as V6 |
| Straight-through or Gumbel estimator in P0 | Either is a no-op without an extra operator that is in neither the paper nor the parameter count. V7 tests the reading. Gumbel is redundant with V7 |
| Pooled SD as primary | Fig. 3a and the IV-2a convention imply per-subject models. Kept as V11 |
| LOSO on T+E tonight | Doubles the measured 9.6 h, so it does not fit before the mid evaluation. Plan A |
| A validation split or early stopping in replication runs | Not in the paper. It creates a selection path |
| Best-of-N seeds | Selection bias. Every seed is reported |
| A single ±5 pp band (Proposer B) | It labels 72.70 % "Reproduced", although that is 5 pp below the paper and more than twice the paper's own FE-GAT ablation gap. The tiers keep B's ±5 fail line and add an informative inner tier |
| ±3 pp only (BP D19) | Too tight given ±1.6 pp test-set noise, one seed, and 1.5–8.5 pp drift in baseline reruns (BE §6) |
| Gating on Spearman ρ ≥ 0.7 or ρ ≤ 0 | n = 9 is too noisy. ρ is reported only (A withdrew the gate) |
| A CE-drop trainability gate (Proposer B) | It passes trivially when large µV² inputs inflate epoch-1 CE, and it passes on memorisation. The accuracy gate on an inner split is informative |
| A separate 240/48 deployment run (A's original) | A withdrew it. The cross-fit uses 6× more calibration data, and the exported model is then exactly the reported replication model |
| A03, or any subject chosen by test accuracy, as the deployment subject | Cherry-picking on session E (BE L7) |
| Selecting replay trials by correctness | Biased. Only the D26 label-blind margin rule filters trials |
| Float32 compute in JS, or Python reading different samples from JS | Threshold flips break parity (XC G1, G2) |
| Zero-padding the FFT to 1024 | Changes the Hilbert transform. The exact length-N DFT already exists |
| Trial-flattened t-SNE as primary (Proposer B) | Neither the paper ("node features") nor `get_embeddings` supports it. It runs as a supplementary |
| A 3-subject ablation subset (BE Plan B iii) | Subject selection biases the comparison. Fewer ablations on all 9 subjects is better |
| Choosing τ or η from results | Outcome-driven. The sweep is descriptive and post-mid-eval, on session-T CV only |

## Residual dissent

- **Proposer B's single ±5 pp band.** B's rebuttal failed, so B never answered A's tier argument. The tiers keep B's fail line exactly for SD. They add "Consistent" for 3–5 pp, so B's concern about over-tight bands is honoured.
- **Proposer B's trial-flattened t-SNE.** It is kept as a labelled supplementary (D29). It is not primary.
- **The SI cap at "Consistent" under Plan B.** B argued that a shortfall is still "not reproduced", and that remains true. B did not address the upward cap. I adopt it because T-only training is a protocol deviation.
- **FFT.** Both proposers expected a new DFT implementation. The existing Bluestein `fft.js` makes this moot (D25).
- **Timeline.** Both proposers' 40–80 ms/step estimates are superseded by the measured 566 ms/step per concurrent process. D31's schedule is mine, not either proposer's.

## Consequences

**Replication outputs.**
- `docs/replication.md` reports the P0 numbers per subject next to Fig. 3 and Table 3, with D16 verdicts and PRELIMINARY labels. V5, the ablations and B0 are reported beside P0, never in its place.
- `docs/traceability.md` gets one row per PROMPT ambiguity (D3), each mapped to Python function → JS function → test ID.
- The frozen-GAE / "differentiable sampling" finding (D7, D9) is a headline honesty item for the viva.

**Browser and docs.**
- The browser's Replay mode uses the very model whose A01 accuracy is reported, temperature-scaled with T* from session-T cross-fit only.
- How Replay confidence maps onto the README's "Neural MI (92%)" telemetry is for the architecture/policy ADRs. This ADR supplies only calibrated probabilities.
- README screens, labels and values are unaffected.

**Compute.**
- Tonight's compute is about 40 worker-hours, about 10 h wall on 4 slots.
- Plan A (3 seeds, T+E LOSO, all 5 ablations) needs only a configuration change. Its compute (≈ 20 h for LOSO-T+E per seed) needs separate user approval.

**What this ADR imposes on the existing code.**
- The benchmark model's global-RNG mask and binary GCN edges must change to D8, D10 and D14 in `sfegat/model.py`.
- `graph.py` and `preprocess.py` already comply.

## Tonight vs post-mid-eval

**Tonight (Plan B, PRELIMINARY):**
- G1 tests, G2 caches and B0 floor, G3 trainability gate.
- P0 SD × 9 and DEP × 4, with T* and the ECE report.
- Export of `POC/js/data/sfegat-weights.js` and `POC/js/data/mi-replay.js`, plus the margin log and Node parity.
- P0 LOSO-T × 9.
- V5 SD × 9; A3, A1 and A4 SD × 9 each, subject to D31/D32.
- Table 2, Fig. 5 (A01) and Fig. 6 (A01), with supplementaries; latency.
- τ/η diagnostics (evo0 density per τ; eval retention at η = 0.5).
- `replication.md` and `traceability.md` regenerated at 07:00.

**Post-mid-eval (Plan A):**
- Seeds 1 and 2.
- LOSO on T+E × 3 seeds.
- A2 and A5 (plus A4 if skipped).
- Single-factor V1–V4, if |V5 − P0| > 2 pp.
- V6 (λ = 1.0, then 0.1), V7, V8 sweep, V9, V10 (unless D-units fired), V11, V12.
- Original-space robustness checks for t-SNE.
- The licence answer from the supervisor.

## Revisit conditions

1. The authors release the training script, the `monte_carlo_new_edge_index` call site or τ's call site, or the user obtains them from the corresponding author (cghcust@163.com). Then re-examine D4, D5, D7, D8 and D10 under the same precedence ladder.
2. Gate G3 fires. D-units is then recorded here as an amendment, and log10 becomes P0 for every run.
3. P0 SD falls below the B0 floor, or exceeds 82.70 %. The pipeline is audited before any number is reported.
4. More than 50 % of A01E trials fail the D26 margin rule. The margin stays fixed; the export takes the next eligible trials and the disclosure is expanded. If fewer than 5 per class remain, revisit D20.
5. Measured per-job times deviate from D31 by more than 30 %. The orchestrator re-issues the schedule and applies D32. The ladder of decisions does not change.
6. The supervisor rules that embedding IV-2a trials is not permitted. Replay then falls back to the other modes, and D22 is revisited.
7. New evidence about the paper's t-SNE input (for example an author reply) may change D28's primary. It never changes the numbers already reported.

## Amendment 2026-10-14 (revisit condition 3 fired; red-team round 1, RT2-01/03/08/10)

**Status:** recorded by the red-team fixer. Numbers are as measured. P0 is **not** changed (D2). Ledger: `docs/redteam-round1.md`.

**1. Revisit condition 3 fired.** P0 SD (Plan B, seed 0, run `research/runs/20261014-1549-planb-sd-p0/summary_sd.json`, all 9 subjects complete) is below the B0 floor on **every** subject:

| Subject | P0 SD on E (k/288) | B0 floor (log10-PSD + LR, T→E) | Paper Fig. 3 |
|---|---|---|---|
| A01 | 34.37 % (99/288) | 54.5 % | 80.21 % |
| A02 | 29.51 % (85/288; at the 95 % chance bound, p = 0.046 uncorrected) | 36.1 % | 61.46 % |
| A03 | 37.15 % (107/288) | 63.2 % | 89.24 % |
| A04 | 38.54 % (111/288) | 43.8 % | — |
| A05 | 26.38 % (76/288) | 32.3 % | — |
| A06 | 30.20 % (87/288) | 40.3 % | — |
| A07 | 39.23 % (113/288) | 60.8 % | — |
| A08 | 34.02 % (98/288) | 57.3 % | — |
| A09 | 51.73 % (149/288) | 63.5 % | — |

Mean over 9 subjects (written by the trainer): 35.68 % (floored). The paper column lists only the values verified for this amendment; the rest go into `docs/replication.md` from Fig. 3. **B0 caveat:** the B0 values were measured ad hoc and are **not yet logged** under `research/runs/` (no `floor_*` run). They must not be cited as a pre-registered floor until `research/sfegat/floor.py` (D18: StandardScaler + LogisticRegression(C = 1.0, max_iter = 2000) on log10 band power, fit on T, test on E) writes `runs/<stamp>_floor_B0_s0/`. That script is deferred to after the mid-evaluation.

**2. Audit findings (RT2).** No leakage was found. In evidence order:
- (i) **Within-session overfitting.** On the A01 calibration fold 0, held-out session-T accuracy is 37.5 % (27/72) against ≈ 99 % training accuracy (`calib_A01/result.json`). The failure is therefore not only session shift.
- (ii) **Unnormalised, heavy-tailed µV² node features** (paper-literal, D10). A01T median 1.75, p99 16.6, max 81 µV². The log10 + z-scored B0 beats P0 on every subject.
- (iii) **Cross-session power shift**, severe for A02 (24–40 Hz band power on E is about 6–9× that on T).
- The gap is **not** attributed to the paper being wrong; its protocol details are underspecified (D1 context).

**3. D9 measured.** Appended to the D9 reporting text: "Measured on our P0 A01 model: σ(z_iᵀz_j) ≥ 0.994 on every directed edge of every A01 trial (576 trials, T + E), so eval-mode pruning at η = 0.5 removes 0 edges in all 3 blocks, and the training-time MC mask removes about 10⁻⁴–10⁻⁵ of edges. In our replication the 'evolution' is therefore inert, and P0 is functionally FE-GAT (A3)." Evidence: `research/.cache/redteam2/mask_check.json`, `mask_train_check.json`. RT2 also reports that the GAE encoder weights are bitwise equal to their seed-0 initialisation (expected from D9: no gradient reaches them); the fixer did not re-verify this. The browser brain graph now says so on screen (`brain-graph-view.js`, RT1-04), and PROMPT §5 "the brain graph visibly evolves evo0→evo3" is reported as **not met**, with this reason.

**4. Gate G3** was not run before T0. This is a protocol deviation. Its rule (train acc < 40 % AND inner-val < 35 %) would have passed on memorisation anyway (RT2, not re-verified: epoch-100 train accuracy 0.72 / 0.63 / 0.81 for A01–A03).

**5. Deviation: Plan B scope (RT2-10).** Plan B as run (user-approved scope, 2026-10-14) trains SD × 9 + calibration fold 0 only. LOSO-T, V5, A1, A3 and A4 were not run, despite D32 ("V5 and LOSO-T are not dropped") and the line-19 label. SI is reported as "not run (post-mid-eval)", never as a partial value. `plan_b.yaml` keeps its label "PRELIMINARY (Plan B: 1 seed; LOSO deferred to Plan A)".

**6. Temperature scaling (RT2-11).** T* = 8.019 comes from fold 0 only (72 held-out A01T trials; NLL 2.927 → 1.320), the D21 fallback, chosen up front. On A01E (information only, never used for fitting): scaled NLL 1.426 vs 1.386 for a uniform guess; ECE15 0.059. The UI now says "temperature-scaled (T* = 8.0, fit on 72 A01T trials)" rather than "calibrated". Folds 1–3 run after the mid-evaluation.

**7. Reporting rule from now on.** Every SD number is reported as k/288, floored, with: "below pre-registered floor B0; audit per ADR-0001 revisit 3".
