# Debate transcript: replication-fidelity (ADR 0001)

- **Date:** 2026-10-14
- **Judge:** a fresh, impartial judge subagent.
- **Ruling:** `docs/adr/0001-replication-fidelity.md`.
- **Reproduction:** the proposer and rebuttal texts below are reproduced verbatim from `docs/debate/_inputs/replication-fidelity.md` (the workflow journal, which the harness also relayed to the judge). The critic and Rebuttal B failed and are recorded as failures.

---

## Question set

Replication fidelity for SFE-GAT. Settle:
1. The precedence rule: paper text vs Table 1 vs released code.
2. τ (the PLV z-threshold) and η (the eval mask threshold) values.
3. GAE reconstruction loss: yes or no (+ λ).
4. The gradient path through the hard MC mask (none / straight-through / Gumbel / mask-weighted operator), and how we honestly report the paper's "differentiable sampling" claim.
5. Residual connection; dropout 0.5 vs 0.2; Butterworth order 4 vs 5; Welch nperseg 250 vs 500; binary vs weighted edges into the GCN; BN/ReLU order; stem layer.
6. SD as 9 per-subject models vs pooled; LOSO under Plan B; model selection (last epoch, no test peeking); seeds.
7. The definition of "successfully reproduced" (tolerance band) given Plan B.
8. The primary run vs the list of labelled variants, and which variants run tonight vs post-mid-eval.
9. The deployment subject for the browser, plus a session-1 calibration hold-out for temperature scaling.
10. The JS↔PyTorch parity strategy across hard thresholds (float64 on both sides, float32-rounded shared inputs, margin-based trial selection, stage-by-stage parity): gaps G1/G2.
11. The t-SNE / Table 2 protocol (G14).
12. A concrete timeline for tonight: calibration benchmark, then SD, then LOSO-T, then a subset of ablations.

Hard constraints:
- Mid evaluation is tomorrow morning (2026-10-15).
- Plan B compute: SD with 1 seed; LOSO trained on T only, 1 seed; partial ablations. Plan A is a config change. Plan B numbers are labelled PRELIMINARY.
- CPU only: i7-10510U, 4C/8T, 15.6 GB.
- README exactness.
- `file://`, offline, IIFE modules on `window.SA`.
- Local only.
- Licence default: embed with attribution, pending supervisor confirmation.
- Fidelity precedence is decided by this debate.

---

## Proposer A (Rigor-first)

# Proposer A (Rigor-first): replication-fidelity position

**Status.** The Plan B scope is fixed by the user. Every choice below can be built tonight unless it is marked **post-mid-eval**. Sources: `base-paper.md` (BP), `reference-code.md` (RC), `bci-eeg.md` (BE), `_cross-check.md` (XC), and `_paper-text.txt` (P, with line numbers).

**Blocking fact found while preparing this position.** `research/data/bnci2014_001/A02E.mat` is still `A02E.mat.part` (34.66 MB of about 44 MB). Several BNCI 013-2015 files are also `.part`. **Gate 0 below forbids any SD or LOSO training until all 18 IV-2a files are complete and match `SHA256SUMS.txt`.** A02 is a test subject in SD and a training subject in 8 of the 9 LOSO folds.

---

## 1. Precedence rule (resolves XC C1)

**Choice.** Sources rank in this order (level 4 is a fallback, not an authority):

| Level | Source | When it wins |
|---|---|---|
| 1 | Explicit statements in the paper's equations and prose | Always, where they are explicit |
| 2 | The paper's own *checkable quantitative* statements: Table 1 per-layer counts and the "≈0.15M" in the text | They override paper prose on **structure**, where the prose is silent or garbled |
| 3 | The released code | Only to **fill gaps** the paper leaves silent. Never to override an explicit paper statement |
| 4 | An ADR choice, justified only with session-T evidence | When none of the above decides |

Code-only *additions* that contradict an explicit equation become **labelled variants, never the primary**. The primary configuration is **frozen in this ADR before any result exists**. A variant is **never promoted** to primary because of session-E results. That closes the outcome-driven leakage path XC flags in C2 (BE L2).

**Rationale.**
- CLAUDE.md §5 ranks README > paper > ADRs and says nothing about code. Code therefore has no authority of its own; it is evidence of the authors' intent where the paper is silent.
- The repo is a non-runnable fragment (RC §2.1: `TypeError` on the evo-block call, three undefined functions, no licence). Ranking it above explicit text would mean trusting unverifiable code over the peer-reviewed text.
- Ranking Table 1 above prose is defensible because it is internally checkable: 2560 + 3×(33,280+256+4,192) + 33,536 + 516 = **149,796**, consistent with the stated "≈0.15M" (P l.536). The text-only reading gives 116,516 ≈ 0.12M, which contradicts the paper's own number (BP §3, RC §2.3).

**Consequences** (each is settled below):

| Item | Decided by | Result |
|---|---|---|
| Stem GATv2 (8→32×4) | Level 2 | Include |
| GAE BN(32) | Level 2 | Include |
| Head merging | Level 2 | Concat (C4, C5 agree) |
| Classifier ReLU | Paper inconsistent with itself, so level 3 | ReLU → BN |
| Residual | Level 1 (Eq. 12) | None |
| Dropout | Level 1 (Eq. 23) | 0.5 |
| Butterworth order | Level 1 | 4 |
| Welch nperseg | Level 1 | 250 |
| GCN edges | Level 1 (Eq. 5 + Eq. 15) | Weighted |
| Band integration quadrature | Silent, so level 3 | Simpson over inclusive bins |
| τ | Level 3 | 0.3 |
| SD headline target | Level 1 | **77.70 % / κ 0.7027**. 77.05 is a typo (BP A7, BE §3.2) |

**Risk.** The primary run may undershoot the paper if the authors actually ran their code's choices. That is mitigated by the pre-registered code-faithful bundle V5 (§8), reported next to the primary. If V5 matches the paper and the primary does not, that is a reported *finding about the paper's underspecification*, not grounds to swap.

---

## 2. τ and η

**τ = 0.3**, applied to the per-trial whole-matrix z-scored PLV.
- μ and σ are computed over all C² = 484 entries, **diagonal included** (Eq. 2 literal), with ddof = 0 and ε = 1e-8 in the denominator (BP Eq. 3).
- Then zero the diagonal (Eq. 4). Then keep an edge iff **z > 0.3 (strict)**, for both the edge list and its weight. Eq. 5 prints `>`. The code mixes `>` and `>=` (XC C6), which differ only on ties of measure zero, but we pin `>` for parity.
- Label it **"code default argument; call site unreleased; not confirmed"**, never "resolved" (XC C6, §7).
- Log the realised evo0 edge density per subject. RC §8 estimates about 38 %, unverified.

**η = 0.5**, strict `M = 1(P > 0.5)` (Eq. 18 prints `>`).
- It is the mode of Bernoulli(P), so the eval graph is the most probable training graph (RC dec. 1, BP D2).
- It is non-trivial only because BN(32) after ReLU lets P fall below 0.5 (BP Eq. 16 analysis; this is moot under level 2).
- Call it **"η, our label; the paper's symbol is a garbled ø/τ"** (XC §1.2).

**Sensitivity (post-mid-eval, session T only).** Stratified 5-fold CV inside session T, never touching E. Union grid: τ ∈ {0, 0.3, 0.5, 1.0}; η ∈ {0.3, 0.4, 0.5, 0.6, 0.7}. **The primary stays at (0.3, 0.5) whatever the outcome.** The sweep is descriptive.

**Tonight.** Zero-cost diagnostics only: evo0 edge counts per τ value on session T, and realised eval-mode retention at η = 0.5.

---

## 3. GAE reconstruction loss

**Primary: no reconstruction loss, CE only (λ = 0).**
- §3.3 names only categorical cross-entropy (P l.551–552).
- The released code never calls `recon_loss` (RC §4).
- Both briefs agree (XC C8).

**Mandatory honest consequence.** Under CE-only, the 3 × 4,192 = **12,576 GAE parameters (8.4 %) get `grad = None`**. SGD skips them, weight decay included, so they stay at their initial values (RC §5, BP A4). Their BN(32) running statistics still update.
- Report the model as "**149,796 parameters, of which 137,220 receive gradient**".
- Add a pytest (`test_gae_receives_no_grad`) that asserts this. If our implementation ever gives the GAE a gradient under λ = 0, that is a bug.
- `docs/replication.md` must say: "Under the paper's equations, the 'evolution' is a feature-conditioned pruning through a fixed random GCN projection of learned GAT features. The paper's own Discussion calls it 'a guided form of DropEdge' (P l.913)."

**Variant V6 (post-mid-eval).** Loss = CE + λ·(1/3)Σ_blocks `GAE.recon_loss(z_ℓ, A^(ℓ−1) edge_index)`.
- This is PyG BCE on the block's input edges plus an equal number of negative-sampled pairs within each 22-node graph.
- λ = **1.0** first, then λ = 0.1. Seed 0, SD, 9 subjects.

---

## 4. Gradient through the hard Monte Carlo mask, and how we report "differentiable sampling"

**Primary: none.**
- Training mask: M = 1(P > R). R ~ U(0,1) is drawn **per directed edge, freshly on every forward pass**, from a seeded generator.
- Eval mask: 1(P > 0.5). Pruning is **cumulative**: A^(ℓ) = A^(ℓ−1) ⊙ M^(ℓ), so the edge set can only shrink (BP D14, RC §3).
- Masked edges are physically removed from `edge_index`.

**Why the alternatives are rejected for the primary.**
- Straight-through and Gumbel are **no-ops** unless the mask value enters an operator on the logit path.
- GATv2 has no `edge_dim`: Table 1's counts exclude it, and `edge_dim = 1` would make each GATv2 33,408 parameters.
- The GCN output feeds only P. So no estimator alone gives a gradient path (BP A4, RC §5).
- Adding one requires an operator the paper does not describe.

**Variant V7 (post-mid-eval), "mask-weighted attention, straight-through".**
- m = hard + P − P.detach(). Multiply the GATv2 attention by m and renormalise: α′_ij = α_ij·m_ij / Σ_k α_ik·m_ik.
- With hard m ∈ {0,1}, **the forward pass is identical to the primary** (a softmax over the retained neighbours). Only the backward pass differs, and it adds 0 parameters, so 149,796 is preserved.
- This is the most defensible way to test the paper's claim. Gumbel-sigmoid is rejected as redundant with V7.

**Reporting text** (for `docs/replication.md` and ADR 0001):
> "The paper states that SFE-GAT updates the graph 'through a differentiable sampling strategy' (§1, P l.92). Neither Eqs. 15–18 nor the released code realise this: M is an indicator function (∂M/∂P = 0 a.e.), the downstream GATv2 layers consume only topology, and the released `monte_carlo_new_edge_index` returns an integer `edge_index`. Our primary replication implements the equations as written; consequently the GAE receives no gradient under the stated CE-only loss. Variants V6 (reconstruction loss) and V7 (straight-through mask-weighted attention) test the two plausible intended readings."

This is a finding about the paper, not a defect in our build.

---

## 5. Architecture and DSP pins

| Item | Primary | Basis | Variant |
|---|---|---|---|
| Residual `relu(conv(x)) + x` | **None** | Eq. 12 explicitly says H = ReLU(GATv2(H, A)). The residual is code-only (A19) | V1 |
| Dropout after the pool | **0.5** | Eq. 23 explicit. Blocks: 0. Attention dropout: 0 | V2 = 0.2 |
| Butterworth | **`butter(4, [lo, hi], 'bandpass', fs=250, output='sos')` + `sosfiltfilt`** (default `padtype='odd'`, default padlen) | Paper says order 4 and zero-phase; Rp/Rs are meaningless for Butterworth. SOS form per SciPy docs | V3 = order 5 |
| Welch | **nperseg 250, noverlap 125, periodic Hann (`get_window('hann', 250, fftbins=True)`), detrend 'constant', scaling 'density', one-sided, mean** | Paper explicit: 7 segments, 1 Hz bins | V3 = 500 |
| Band integral | **Composite Simpson over inclusive bins [lo, hi]**, 5 points at 1 Hz: (f0 + 4f1 + 2f2 + 4f3 + f4)/3 | Paper silent on quadrature; code fills the gap (RC §2.2) | — |
| Units | **µV²** (`.mat` is µV), no log, no normalisation | BE D4, BP D11 | V10 = log10 |
| GCN edges | **Weighted A**: z-score weights on retained edges; `gcn_norm` self-loop fill = 1 | Eq. 5 defines A as weighted and Eq. 15 passes A to GCNConv (level 1 beats the code's dropped weights). GATv2 sees topology only (forced by the counts) | V4 = binary |
| BN/ReLU order | Blocks: **GATv2 → ReLU → BN(128)** (Eqs. 12–14 and code agree). GAE: **GCN → ReLU → BN(32)** (4,192 + code). Classifier: **GATv2 → ReLU → BN(128)** | Eq. 20–21 vs Fig. 1 is the paper contradicting itself, so level 3 decides. Logged as a deviation from literal Eq. 20 | — |
| Stem | **GATv2Conv(8, 32, heads=4, concat=True)**, no activation, no BN | Table 1 row with an empty Blocks cell (BP §3) + code | — |
| GATv2 defaults | `share_weights=False`, `add_self_loops=True`, `negative_slope=0.2`, `dropout=0`, `bias=True`, no `edge_dim` | PyG 2.8.0.post1 | — |
| BN | eps 1e-5, momentum 0.1, eval uses running stats | PyTorch defaults | — |
| Optimiser | SGD lr 0.01, **momentum 0**, no Nesterov, no schedule, wd 1e-3 on all params with grads; batch 64, shuffled per epoch, `drop_last=False` (288 = 4×64 + 32); 500 epochs | P §3.3 literal; BP D18 | — |
| Window / PLV | **[2.0, 6.0) s = 1000 samples**, crop first, then filter (BE D2a). PLV is broadband, per trial, Hilbert on the 1000-sample crop. All 288 trials kept | BE D2, D3, D12 | V9 = PLV on 8–30 Hz; V12 = padded [1.5, 6.5) |

**Pytests:**
- total = 149,796, with per-module counts 2,560 / 33,280 / 256 / 4,192 / 516;
- κ = (acc − 0.25)/0.75 to 1e-9;
- eval logits identical at batch size 1 and 64;
- the trainer cannot be passed session E.

**Contingency, pre-registered and session T only (tonight, about 1 min).**
- Run a trainability probe: A01 session T, stratified 80/20 inner split (seed 0), 100 epochs, µV² features.
- **If train accuracy < 40 % and inner-val accuracy < 35 % at epoch 100**, switch globally to log10(µV²) and log it as deviation D-units in the ADR.
- Session E is never consulted.

---

## 6. Protocols, selection, seeds

**SD.**
- **9 per-subject models**: train on A0xT (288), test once on A0xE (288). Basis: Fig. 3a per-subject bars, "subject-dependent" convention, and per-subject `load_data` (BP D15, BE D5, RC dec. 10).
- Pooled SD = V11, post-mid-eval.

**LOSO (Plan B).**
- Train on the 8 other subjects' **session T (2,304 graphs)**. Test on the held-out subject's **session E (288)**. Every Fig. 3b value is k/288 (BE §3.3), and E keeps the test trials identical to SD.
- Config key `loso.train_sessions: [T]`. Plan A sets `[T, E]` (4,608). Using other subjects' E data is not leakage.
- BN running stats come from training subjects only. No test-subject alignment (BE L5).

**Model selection.**
- **Last epoch (500), no validation, no early stopping.** Session E is evaluated **exactly once** per run, after training.
- Enforce this structurally: `train()` takes only the training tensors; `evaluate()` is a separate entry point (BE L1, D7).

**Seeds.**
- Plan B is **seed 0 only** for every run. Plan A is {0, 1, 2}, reusing the seed-0 results whose config hash is unchanged.
- The seed sets python/numpy/torch, the MC-mask generator and the shuffle generator. Use `torch.use_deterministic_algorithms(True)` and `torch.set_num_threads(1)` per worker.
- Every seed is reported; there is no best-of-N.

**Config skeleton** (`research/configs/sfegat/base.yaml`; Plan A is an overlay file):

```yaml
graph:    {tau: 0.3, tau_cmp: ">", plv_band: broadband, zscore_include_diag: true}
features: {butter_order: 4, nperseg: 250, noverlap: 125, integrate: simpson_inclusive, units: uV2, log: false}
model:    {residual: false, dropout: 0.5, gcn_edge_weight: true, classifier_relu: true, stem_act: none}
gae:      {recon_lambda: 0.0}
mask:     {eta: 0.5, grad: none, granularity: directed_edge, resample: every_forward}
train:    {optimizer: sgd, lr: 0.01, momentum: 0.0, weight_decay: 1.0e-3, batch_size: 64, epochs: 500, select: last}
loso:     {train_sessions: [T], test_session: E}
seeds:    [0]
status:   "PRELIMINARY (Plan B: 1 seed; LOSO trained on session T only)"
```

The overlay files are `plan_b.yaml` (above) and `plan_a.yaml` (`seeds: [0,1,2]`, `loso.train_sessions: [T,E]`, status FINAL).

---

## 7. Definition of "successfully reproduced"

All verdicts are computed on the mean over 9 subjects. They are **pre-registered and reported whatever the outcome**, and our numbers are never rounded in our favour.

**SD, target 77.70.**

| Verdict | Condition |
|---|---|
| **Reproduced** | \|Δ\| ≤ 3.0 pp, i.e. 74.70–80.70 |
| **Consistent** | 3.0 < \|Δ\| ≤ 5.0 pp |
| **Not reproduced** | \|Δ\| > 5.0 pp |

- The ±3 inner band is roughly twice the ±1.6 pp binomial half-width on n = 2,592 (BE §3.5), plus seed variance that is still unmeasured [UNVERIFIED].
- The ±5 outer band reflects the 1.5–8.5 pp drift seen in independent baseline reruns (BE §6) and the unresolved τ/η/units questions. This answers XC C13's concern that ±3 alone is too tight.

**SI, target 66.59.** Reproduced if ≤ 4.0 pp; consistent if ≤ 6.0 pp; otherwise not reproduced.

**Plan B caps.**
- Under Plan B, every verdict carries the suffix **"(PRELIMINARY, 1 seed)"**.
- **The SI verdict is capped at "Consistent"**, because training on T only is a protocol deviation (half the training data). "Reproduced" for SI can only be awarded under Plan A.

**Secondary, all reported.**
- Spearman ρ between our per-subject accuracies and Fig. 3. Label "rank pattern reproduced" only if ρ ≥ 0.60 (one-sided p < 0.05 at n = 9). ρ ≤ 0 downgrades any verdict by one tier.
- Macro-precision, macro-F1 and κ, plus the κ identity.

**Guards.**
- **Floor:** the primary must beat a log-band-power + logistic-regression baseline on the same splits; if not, audit the pipeline before claiming anything.
- **Leakage alarm:** an SD mean above 82.7 % triggers an audit (BE §6).

**Ablations.** These are judged on **ordering**, not on bands. The paper's Fig. 4 order is SFE-GAT > FE-GAT > SFE-GCN > PLV-GAT, and R-SFE-GAT > R-GAT. Report every Δ next to the paper's Δ (for example FE-GAT −2.43 pp; PLV-GAT −12.5 pp).

---

## 8. Primary run, variant register, and what runs tonight

**P0 (primary).** Exactly §§1–6. Run ID `{YYYYMMDD-HHMM}_{sd|loso}_{P0|Vn|An}_s{seed}`, logged to `research/runs/<id>/` with config, metrics, environment and the config hash.

**Ablations** (BP D20 definitions):
- **A1 PLV-GAT:** stem + classifier only.
- **A2 SFE-GCN:** every GATv2Conv → GCNConv(·, 128).
- **A3 FE-GAT:** blocks without GAE/MC.
- **A4 R-GAT** and **A5 R-SFE-GAT:** symmetric Erdős–Rényi A, density matched to the mean P0 evo0 density computed on session T, redrawn per trial.

**Variants** (one change each from P0 unless noted):
- V1 residual
- V2 dropout 0.2
- V3 order-5 filter + nperseg 500
- V4 binary GCN edges
- **V5 code-faithful bundle (V1 + V2 + V3 + V4)**
- V6 recon λ = 1 (then 0.1)
- V7 straight-through mask-weighted attention
- V8 τ/η sweep (session-T CV)
- V9 PLV 8–30 Hz
- V10 log10 PSD
- V11 pooled SD
- V12 padded window

**Tonight (Plan B):**
- P0 SD, 9 subjects, seed 0
- P0 LOSO-T, 9 folds, seed 0
- **A3 FE-GAT** and **A1 PLV-GAT**, SD, all 9 subjects, seed 0
- floor baseline
- deployment model (§9)
- Fig. 6 edge counts
- Fig. 5 / Table 2 (§11)
- latency

Why A3 and A1: A3 isolates the contested GAE + MC mechanism, which is exactly where our frozen-GAE finding bites. A1 is the cheapest and has the largest expected Δ. Running **all 9 subjects** on two ablations beats a biased 3-subject subset across five ablations (this rejects BE Plan B (iii)).

**Post-mid-eval (Plan A):**
1. Seeds 1 and 2 for SD and for A1/A3.
2. LOSO T+E × 3 seeds.
3. A2, A4, A5.
4. V5 first. Run V1–V4 individually only if V5 differs from P0 by more than 2 pp.
5. Then V6, V7, V8–V12.

---

## 9. Deployment subject and calibration hold-out

**Subject: A01.** It is pre-declared now, before any of our results exist, so the choice cannot be made on session E (BE L7).
- It is the paper's own Fig. 5 and Fig. 6 subject, so the browser's evo0→evo3 view mirrors the paper directly.
- Its 80.21 % is near the paper mean: representative, not cherry-picked. A03 at 89.24 % would be.
- Its T and E files are fully downloaded.
- If our A01 result is poor, **we still use A01 and disclose it.**

**Separate run `deploy_A01_s0`.** This resolves XC §1.4 and G13: the replication models stay paper-faithful, and the deployment model is a distinct, disclosed run.
1. **Split A01 session T.** Use `StratifiedShuffleSplit(n_splits=1, test_size=48, random_state=0)`, giving a 48-trial calibration hold-out (12 per class) and 240 training trials.
2. **Train.** P0 hyperparameters, 500 epochs, last epoch.
3. **Temperature scaling.** Fit one temperature T on the 48 hold-out logits by NLL minimisation (L-BFGS on log T, bounded to [0.05, 20]).
4. **Report.** Hold-out ECE (15 bins) before and after scaling, and session-E accuracy and ECE **for reporting only**. Session E is never used for fitting. The deployment model is explicitly *not* the SD replication model.

**Replay export.**
- From A01 **session E**: 5 trials per class = 20 trials ≈ 2.35 MB base64, under the 3 MB budget (XC G3).
- Selection rule: the first 5 per class in E order that pass the parity-margin check (§10). Selection is blind to correctness, so misclassified trials stay in and are shown as wrong.
- A trial-hash test proves none was seen in training.

**Licence.** Embed with attribution, flagged "pending supervisor confirmation" (user default; XC G11).

---

## 10. JS ↔ PyTorch parity across hard thresholds (gaps G1, G2)

1. **One rounding, shared by both sides.**
   - Every number crossing the boundary is float32-rounded **once at export**.
   - Raw trials go out as Float32 base64. Weights and BN stats are natively float32, so their export is lossless.
   - **Both sides upcast to float64 and compute everything in float64.** JS converts Float32Array → Float64Array before the DSP and keeps intermediates in Number arrays.
   - The Python reference reads the **same** float32-rounded samples (saved as `research/export/out/mi_replay_f32.npy` and byte-compared against the decoded JS payload).
   - Report how many replay predictions differ between float32-rounded and original float64 input; expected 0.
2. **Reference implementation.** PyG model `.double().eval()` in float64, plus a numpy float64 dense forward, asserted equal to PyG to ≤ 1e-10.
3. **Remove filter-design parity risk.**
   - Export the SciPy SOS coefficients and `sosfilt_zi` as float64 (17-significant-digit literals) in `sfegat-weights.js`. JS does not redesign Butterworth filters.
   - JS mirrors `sosfiltfilt` odd-padding and padlen exactly.
4. **FFT.** N = 1000 (Hilbert) and N = 250 (Welch) are both 2^a·5^b, so JS uses an exact mixed-radix (2, 5) FFT with **no zero-padding to 1024** (BE §4.3). The Hilbert multiplier matches `scipy.signal.hilbert`.
5. **Stage-by-stage tolerances, per exported trial:**

| Stage | Tolerance |
|---|---|
| Filter bank, PSD, H | ≤ 1e-9 relative |
| Analytic signal, PLV, z-PLV | ≤ 1e-10 absolute |
| Edge sets A^(0), A^(1), A^(2), A^(3) | identical |
| P on edges, per block | ≤ 1e-9 |
| BN outputs | ≤ 1e-9 |
| **Logits** | **≤ 1e-4** (the acceptance criterion; expected ~1e-9) |

6. **Margins.**
   - In Python float64, compute min|z − τ| over off-diagonal entries and min|P − η| over the evaluated edges of every block.
   - **Export only trials with both margins ≥ 1e-6.** Disclose how many were skipped and why.
   - The selection criterion is independent of labels and correctness, so it introduces no favourable bias.
7. **Harness (G4).**
   - `research/export/parity_node.js` loads the POC scripts in `index.html` order into a Node `vm` context with `window = globalThis`, runs the forward pass and dumps every stage as JSON.
   - `research/tests/test_parity_sfegat.py` calls it via `subprocess`. Owner: export & parity engineer.
   - The same principle applies to ErrP.

---

## 11. t-SNE / Table 2 / Fig. 5 / Fig. 6 protocol (G14)

**Model.** The P0 SD seed-0 model for each subject, in eval mode.

**Data.** That subject's **session E (288 trials)**. t-SNE is unsupervised; labels are used only to score clusters, never to tune anything.

**Points: node-level**, as the paper says "node features" (P l.741) and the code's `get_embeddings` returns node-level tensors. That gives 288 × 22 = 6,336 points per stage, each labelled with its trial's class.
- evo0 = raw µV² PSD H (8-d), as in the code.
- evo1, evo2, evo3 = the 128-d post-BN block outputs.

**t-SNE settings.** `sklearn.manifold.TSNE(n_components=2, perplexity=30, init='pca', learning_rate='auto', max_iter=1000, random_state=0)`.

**Scores.** `silhouette_score` and `davies_bouldin_score` on the **2-D t-SNE coordinates** with class labels as clusters. This is the paper's wording: "the t-SNE results were quantitatively evaluated" (P l.737–739).
- **Supplementary:** the same scores on the high-dimensional features, and a graph-level (mean-pooled, 288-point) version, labelled as such.
- Table 2 = the mean over 9 subjects. Fig. 5 = A01.

**Fig. 6.** A01, session E, eval mode. Count retained directed edges per class (72 trials) at A^(0) and A^(3).

**Latency.** Single thread. Report model-only and DSP + model times at batch sizes 1 and 288, as the median of 100 runs. Never compare directly with the 3090 figure.

---

## 12. Tonight's timeline

T0 = the moment the package and tests exist. All times are [EST] until step 3 replaces them. Workers are single-threaded processes on 4 physical cores.

| # | Window | Step | Notes |
|---|---|---|---|
| 0 | Gate | All 18 IV-2a files complete and match `SHA256SUMS.txt` (**A02E currently `.part`**). pytest green: shapes 288×22×1000, 72 per class, µV scale, κ identity, 149,796 and per-module counts, GAE `grad is None`, batch-1 ≡ batch-64 in eval, trainer refuses E, PyG float64 ≡ numpy dense ≤ 1e-10 | No training before this passes |
| 1 | T0 → +5 min | Preprocess all 5,184 trials → `research/cache/features_<confighash>.npz` (H, z-PLV, A^(0)) | |
| 2 | +5 → +6 | Floor baseline (log-band-power LR, per subject); µV² trainability probe (§5) | Session T only |
| 3 | +6 → +11 | **Calibration benchmark:** A01 T, 10 epochs, ms/step at 1 worker and at 4 concurrent workers. Re-issue the time table | Per CLAUDE.md, report the calibrated estimates to the user under the Plan B approval |
| 4 | +11 → ~+30 | **P0 SD**, 9 subjects, seed 0, 4 workers | About 2,500 steps per subject × 40–80 ms ≈ 2–3.5 min each, 3 rounds, +30 % throttle allowance |
| 5 | ~+30 → ~+40 | **`deploy_A01_s0`** + temperature scaling + export of `sfegat-weights.js` and `mi-replay.js` + margin check + parity run | Unblocks the browser Replay demo; highest priority for the mid eval |
| 6 | ~+40 → ~+3 h | **P0 LOSO-T**, 9 folds on 3 workers (3 rounds × 12–24 min/fold [EST], +throttle) | |
| 7 | in parallel, worker 4 | A3 FE-GAT then A1 PLV-GAT (18 SD runs, ~30–50 min), then Fig. 6, A01 Fig. 5, Table 2 (36 t-SNE fits), latency | |
| 8 | ~+3 h | Write `docs/replication.md` and `docs/traceability.md` with **PRELIMINARY** headers; verdicts per §7; ADR `docs/adr/0001-replication-fidelity.md` | |

**Decision rules.**
- **If step 3 projects LOSO beyond about +5 h:** finish SD, deploy and A1/A3 first. LOSO then runs overnight or after the mid eval, presented as "in progress", never as partial results.
- **Epochs are never cut** after seeing any curve. Test sets are never subsampled. A02 is never dropped (BE §8.4).

**Residual dissent I expect, and my answer.** Proposer B will likely argue for code-first defaults (residual, binary edges) "because that is what produced 77.70". That cannot be verified: the code does not run as released and its training script is missing. V5 measures exactly that question and is reported alongside P0, with no promotion.

**Revisit P0 only if:** the authors release `monte_carlo_new_edge_index` or the training script, or the user obtains them from cghcust@163.com.

---

## Proposer B (Demo-first)

# Proposer B (Demo-first): replication-fidelity position

**Approach.** For tonight, every choice below is the simplest one I can still defend to an examiner. Each choice is fixed before any result exists, so no choice can depend on session E. Everything that costs extra compute or extra code is marked **POST-MID-EVAL**. Every Plan B number carries the label **"PRELIMINARY (Plan B: 1 seed; LOSO trained on session T only)"**.

**Sources.** Briefs are cited as:
- BP = `docs/research/base-paper.md`
- RC = `docs/research/reference-code.md`
- BE = `docs/research/bci-eeg.md`
- XC = `docs/research/_cross-check.md`

**Current state.** I checked `research/data/bnci2014_001/`. All T files and all E files except A02E (still `.part`) are present, so the deployment subject below is unaffected by the download.

---

## 1. Precedence rule: paper text vs Table 1 vs released code (resolves XC C1)

**Choice.** A strict four-tier rule, applied mechanically:

1. **Explicit equation or number in the paper text wins.** This gives τ-in-z-units (Eq. 5), dropout 0.5 (Eq. 23), Butterworth order 4, Welch 250 with 50 % overlap and Hann, `H = ReLU(GATv2(H,A))` with no residual (Eq. 12), weighted A into the GCN (Eqs. 5 and 15), SGD 0.01 / batch 64 / wd 1e-3 / 500 epochs, and 77.70 as the SD target.
2. **The Table 1 parameter arithmetic decides structure.** The target is 149,796 parameters: a stem GATv2(8→32×4), concatenated heads, `share_weights=False`, no `edge_dim`, and GAE = GCN(128→32) + BN(32).
3. **The released code decides only where the paper is silent or contradicts itself.** This gives τ = 0.3, Simpson integration over inclusive bins, no log on band power, ReLU in the classifier (Eq. 20 and Fig. 1 disagree), and decoding only on existing directed edges.
4. **Anything none of these fixes gets the simplest defensible default, set in an ADR.** This covers η, mask granularity, seeds and model selection. Any sensitivity check runs only on a session-1 internal split, and only after the mid-eval.

**Rationale.**
- CLAUDE.md §5 ranks the paper above everything except the README, and says nothing about code. So code can only fill gaps; it cannot override explicit paper text.
- The rule settles C2 and C3 without an outcome-driven choice. That closes BP D9's "add a residual only if we undershoot" path, which XC C2 flags as a session-2 leakage path.
- It is RC §9's rule, with one change: an explicit paper equation beats code even on structure (residual, edge weights).

**Evidence.** RC §9; BP "Decisions" preamble; XC C1–C3; CLAUDE.md §5–6.

**Risks.**
- The code residual may genuinely matter for training stability. This is mitigated by the pre-registered as-released code-bundle variant in item 8, which runs tonight.
- An examiner may ask why code beats Fig. 1 on the classifier ReLU. The answer is that Fig. 1 and the code agree and only Eq. 20 omits it, so this is a paper self-contradiction broken by tier 3.

---

## 2. τ and η

**τ = 0.3, applied to the per-trial whole-matrix z-scored PLV, with strict `>`.**
- μ and σ are taken over all 22² entries *including* the unit diagonal, using the population SD (ddof = 0) and ε = 1e-8 in the denominator. The diagonal is zeroed after that.
- Edges are directed pairs i≠j with z_ij > 0.3. Weights are z_ij, which are all positive because τ > 0.
- Docs record τ = 0.3 as a "code default argument (call site unreleased)", not as "resolved" (XC C6a).
- The code's `>=` differs from `>` only on exact ties. That is measure-zero, and item 10's margin rule excludes such trials from export anyway (XC C6b).

**η = 0.5, with strict `>` (Eq. 18), applied to σ(z_iᵀz_j) on the surviving directed edges in eval mode.**
- 0.5 is the mode of Bernoulli(P), so the deterministic eval graph is the most likely training graph.
- η is not a no-op: BN(32) after the ReLU lets P range over (0, 1) (BP Eq. 16 analysis; XC C7).

**Sensitivity (POST-MID-EVAL, session-1 internal 4-fold only):**
- η ∈ {0.3, 0.4, 0.5, 0.6, 0.7}, the superset of the BP and RC grids;
- τ ∈ {0, 0.5, 1.0}.

**Evidence.** BP Eqs. 2–5 and 16–18, A1, A2, D1, D2; RC §4 and Dec. 1; XC C6–C7.

**Risk.** Neither value comes from the paper. The ADR says so verbatim.

---

## 3. GAE reconstruction loss

**Choice.** None. The primary loss is cross-entropy only, with λ = 0 (paper §3.3 names only CE; the released code has no `recon_loss`).

**How we report it honestly.**
- A pytest (`test_gae_receives_no_grad`) asserts that after `loss.backward()` every GAE parameter has `grad is None`. That is 3 × 4,192 = 12,576 parameters, 8.4 % of the model.
- So under the paper's stated loss, the GAE stays at its seeded Glorot initialisation. SGD skips parameters with `grad = None`, including weight decay.
- The "evolution" is therefore a feature-conditioned random-projection DropEdge. This matches the paper's own "guided DropEdge" wording.
- We present this as a **finding of the replication**, not a defect of ours.
- The BN(32) running statistics still update and are exported.

**Variant (POST-MID-EVAL).** CE + λ·Σ over the 3 blocks of PyG `GAE.recon_loss(z, pos_edge_index)` (negative sampling), with λ ∈ {0.1, 1.0} (XC C8 union). This needs no new layers.

**Evidence.** RC §5; BP A3, A4, D3; XC C8.

**Risk.** The authors' unreleased training script may contain a reconstruction loss. We cannot know, and the ADR says so.

---

## 4. Gradient path through the hard Monte Carlo mask

**Choice.** None (hard mask), implemented exactly as the equations and the code do.

**Training mask.**
- Draw R ~ U(0, 1) with one value per *directed* edge of the current `edge_index`. Resample on every forward pass and for every trial, using the global seeded torch RNG.
- Keep an edge if P_e > R_e.

**Eval mask.** Keep an edge if P_e > 0.5.

**Pruning.** Edges are removed by boolean indexing of `edge_index` and `edge_weight`, so the pruning is cumulative: A ⊇ Â₁ ⊇ Â₂ ⊇ Â₃. Nodes stay alive through the GATv2 self-loops.

**Why not straight-through or Gumbel.** No estimator helps unless the mask also enters a continuous operator on the logits path, such as α_ij·M_ij or `edge_dim`. Either one breaks the 149,796 count or adds an operator absent from Table 1 (BP A4; RC §5.1).

**Honest wording for the slide and the ADR:**
> "The paper (§1) describes a 'differentiable sampling strategy'. Its Eqs. 15–18 and its released code implement a hard Bernoulli edge mask with no gradient path into the GAE. We implement the equations as written. A straight-through or Gumbel mask with mask-weighted attention would be a non-paper extension, listed as future work."

**Variant (POST-MID-EVAL).** Straight-through `m = hard + p − p.detach()` multiplied into the attention α, labelled "extension, not paper".

**Evidence.** BP A4, D4, D14, A16; RC §5 and Dec. 3; XC C9.

**Risk.** A reviewer may read the label as "we broke the method". The pytest from item 3 is the rebuttal.

---

## 5. Architecture and DSP details

Each item gives the value and the precedence tier that decides it.

- **Residual connection: none in the primary run.** Eq. 12 is explicit (tier 1). `relu(conv(x)) + x_in` goes into the code-bundle variant V1, which runs tonight. This resolves C2 a priori, not by outcome.
- **Dropout: 0.5 after the mean pool** (Eq. 23, tier 1). Block dropout and attention dropout are 0. The code's 0.2 goes into V1.
- **Butterworth: order 4.** Use `scipy.signal.butter(4, [lo, hi], btype='bandpass', fs=250, output='sos')` with `sosfiltfilt`, default `padtype='odd'` and default `padlen`, over the 8 bands 8–12 … 36–40 Hz.
  - Crop first, then filter (BE L9, D2a).
  - Rp and Rs are documented as having no effect on a Butterworth design.
  - Order 5 goes into V1.
- **Welch: `welch(x, fs=250, window='hann' (periodic), nperseg=250, noverlap=125, detrend='constant', scaling='density')`.** This gives 7 segments and 1 Hz bins.
  - Band power: `scipy.integrate.simpson` over the inclusive bins lo ≤ f ≤ hi (5 points, dx = 1), taken from the code.
  - Units are µV² (the `.mat` files are in µV), with no log.
  - nperseg = 500 goes into V1.
- **Edges: GATv2 sees topology only** (forced by the counts). **The GCN encoder gets the weighted A** (z-PLV weights, masked with the same indices), as Eqs. 5 and 15 state (tier 1). Self-loop fill is 1.0 (PyG default, `improved=False`). Binary edges go into V1. This resolves C3. The impact is small, because the GCN only drives the mask.
- **BN/ReLU order:**
  - Blocks: GATv2 → ReLU → BN(128). Eqs. 12–14 and the code agree.
  - Classifier: GATv2 → ReLU → BN(128) → mean pool → Dropout(0.5) → Linear(128→4). Eq. 20 vs Fig. 1 is broken by the code (tier 3), and the deviation from Eq. 20 is logged.
  - GAE encoder: GCN(128→32) → ReLU → BN(32).
- **Stem: `GATv2Conv(8, 32, heads=4, concat=True)`** with no activation and no BN. The stem is decided by the Table 1 horizontal rule and the 2,560 parameter count; the absence of an activation by the code.
- **Other unstated values (tier 4 defaults):**
  - PyG defaults: `negative_slope = 0.2`, `add_self_loops = True`, `share_weights = False`.
  - BN: eps 1e-5, momentum 0.1.
  - SGD momentum 0; no LR schedule.
  - Shuffle every epoch; keep the partial last batch (288 = 4×64 + 32).
- **Remaining PROMPT ambiguities:**
  - Heads are concatenated (settled).
  - Table 1 = stem + 3 × (33,280 + 256 + 4,192) + 33,280 + 256 + 516 = **149,796**. This is a pytest, with per-module checks.
  - **77.70 / κ 0.7027** is the SD target. 77.05 is logged as a typo (BP A7; BE §3.2).
- **PLV and window:**
  - Window: samples `trial−1+500 : trial−1+1500`, i.e. [2.0, 6.0), exactly 1000 samples, all 288 trials kept.
  - PLV: broadband, per trial, `scipy.signal.hilbert` with N = 1000 on the crop, no padding (BE D2a, D3a).

**Evidence.** BP §3 and A6–A19, D8–D13; RC §2–4; BE §4–5, D2–D4.

**Risk.** Raw µV² with no input normalisation may train poorly. This is handled by the training-data-only gate in item 12, step 1.

---

## 6. Protocols, model selection and seeds

- **SD: 9 per-subject models**, trained on session T (288 trials) and tested once on session E (288 trials).
  - The pooled reading ("288 × 9") is logged as an alternative and run POST-MID-EVAL.
  - Evidence: BP A15/D15; BE D5; RC Dec. 10.
- **LOSO under Plan B:** train on the other 8 subjects' **session T only (2,304 graphs)** and test on the held-out subject's **session E (288)**.
  - Fig. 3b's k/288 shows a one-session test set. Using E keeps SD and SI test trials identical.
  - The paper's "remaining subjects" literally favours T+E. Plan A does that by changing config only: `loso.train_sessions: [T, E]`.
  - Evidence: BE §3.3 and D6; XC C11.
- **Model selection:** a fixed 500 epochs; report the **last epoch**.
  - No validation split in replication runs, and no early stopping.
  - E is evaluated exactly once. The trainer API never receives E, enforced by a test.
  - Evidence: BE L1, D7; RC Dec. 11.
- **Seeds:**
  - Plan B: seed **0** for every run tonight (torch, numpy and random; `torch.set_num_threads(1)` per worker; 4 parallel workers).
  - Plan A: seeds {0, 1, 2}, pre-declared, reported as mean ± SD with every per-seed value.
  - Resolves XC C12.
- **Config files (Plan A is a config change only):**
  - `research/configs/base.yaml` holds the primary "P0-paper" hyperparameters.
  - `research/configs/plan_b.yaml` sets `seeds: [0]`, `loso.train_sessions: [T]`, `ablations: [fe_gat, plv_gat, r_gat]`.
  - `research/configs/plan_a.yaml` sets `seeds: [0, 1, 2]`, `loso.train_sessions: [T, E]`, `ablations: [plv_gat, sfe_gcn, fe_gat, r_gat, r_sfe_gat]`.
  - Variants live in `research/configs/variants/*.yaml` as overlays.
  - Run directories: `research/runs/<YYYYMMDD-HHMM>-<protocol>-<variant>-s<seed>/<subject>/` (config, metrics, environment).

---

## 7. Definition of "successfully reproduced"

**Band: ±5 pp on the 9-subject mean accuracy** (BE D9). This rejects BP's ±3 pp (XC C13).
- **SD:** our mean must lie in **[72.70, 82.70] %**.
- **SI (LOSO):** our mean must lie in **[61.59, 71.59] %**.
- Each protocol gets its own verdict.

**Why ±5 and not ±3.**
- Test-set sampling alone is ±1.6 pp on n = 2,592 (BE §3.5).
- One seed hides the seed variance.
- Plan B's LOSO uses half the paper's plausible training data.
- Independent reruns of the Table 3 baselines drift 1.5–8.5 pp (BE §6).
- BP's "1–2 pp seed variance" figure is [UNVERIFIED] (XC §2).

**Verdict labels.**
- Inside the band: **"Reproduced within ±5 pp: PRELIMINARY (Plan B)"**.
- Outside the band: **"Not reproduced (PRELIMINARY)"**, with analysis. There are no softer words.
- An LOSO-T shortfall is still "not reproduced". The T-only confound is stated as a reason, not as an excuse, and Plan A re-judges with the same band applied to the mean of the seed means.

**Reported alongside, not gating:**
- per-subject accuracy, macro-precision, macro-F1 and κ next to Fig. 3;
- Spearman ρ against Fig. 3 (n = 9 is too noisy to gate on);
- the κ = (acc − 0.25)/0.75 identity, as a pytest;
- the floor baseline V0. If SFE-GAT falls below the floor, that is flagged.

**Leakage alarm.** SD above 82.70 % triggers a leakage audit before we claim anything (BE §6).

**Ablations under Plan B.** Report only the *direction* of the differences. A 2.4 pp gap (FE-GAT) is inside one-seed noise, so we make no "reproduced" claim for Fig. 4 until Plan A.

---

## 8. Primary run and labelled variants

**P0-paper (primary)** is items 1–6 exactly. It is the only configuration whose numbers sit in the headline results table.

**Tonight, in priority order:**

| ID | What | Protocol | Notes |
|---|---|---|---|
| V0 | Floor baseline: logistic regression on log10(H), 176 features | SD, all subjects | Takes seconds |
| P0 | SFE-GAT primary | SD × 9 | — |
| DEP | 4 cross-fit fold models on A01 T | — | See item 9 |
| P0 | SFE-GAT primary | LOSO-T × 9 folds | — |
| V1 | "As-released code bundle": residual + dropout 0.2 + order 5 + nperseg 500 + binary GCN edges | SD × 9 | **One** pre-registered bundle instead of 5 single-factor runs. Labelled "code-faithful variant", never headline |
| AB-FE | FE-GAT: blocks without GAE/MC, A fixed | SD × 9 | — |
| AB-PLV | PLV-GAT: stem + classifier on the PLV graph | SD × 9 | Cheap |
| AB-R | R-GAT: PLV-GAT on a symmetric Erdős–Rényi graph | SD × 9 | Only if the queue reaches it before the 06:00 cutoff. Density matched to the subject's mean session-T PLV density; redrawn per trial from seed 0 |
| — | Table 2 / Fig. 5 / Fig. 6 / latency | Inference only | From the P0 SD models |

**POST-MID-EVAL (Plan A, config only):**
- seeds 1 and 2;
- LOSO on T+E;
- the SFE-GCN and R-SFE-GAT ablations (plus R-GAT if it did not run);
- GAE recon at λ ∈ {0.1, 1.0};
- the straight-through + α·M extension;
- a single-factor decomposition of V1 (residual, dropout 0.2, order 5, nperseg 500, binary edges, each alone);
- PLV at 8–30 Hz;
- log10 PSD (unless the item 12 gate already triggered it);
- the padded [1.5, 6.5) window;
- pooled SD;
- the τ and η sweeps on a session-1 internal split;
- OpenBMI stays out of scope (BP D22).

**Rules.** V1 and the ablations never replace P0, whichever scores higher. The variants are declared now, before any number exists.

---

## 9. Deployment subject and calibration hold-out

**Subject: A01, fixed now, before any of our results exist.**
- It is the paper's own Fig. 5 and Fig. 6 subject, so the browser's evo0→evo3 view can sit next to Fig. 6.
- It is typical rather than cherry-picked: 80.21 % against the 77.70 % mean, where A03's 89.24 % would be the obvious pick.
- Choosing it a priori avoids BE L7 (selecting by test accuracy).
- Its T and E files are fully downloaded.

**Exported model.** `sfegat-weights.js` carries the **P0 SD A01 seed-0 model itself**, trained on all 288 T trials. The browser's Replay accuracy is therefore the reported A01 replication number.

**Calibration hold-out (resolves XC §1.4 and part of G13).**
- Run a **4-fold stratified cross-fit on A01 session T**: 4 runs, each training on 216 trials and holding out 54 (18 per class), with the same P0 config, seed 0 and 500 epochs. This adds about 3 min of wall time.
- Collect the 288 out-of-fold logits and fit one temperature T* by minimising NLL over log T, with T* bounded to [0.05, 20].
- Apply T* to the exported full-T model's logits.
- The out-of-fold error rate also gives the session-1-only MI error prior π for the ErrP debate (XC G13/X5), so E is never touched.
- Fallback if time runs out: fold 0 alone (54 trials).

**Replay set: 20 A01 session-E trials, 5 per class, about 2.35 MB in base64 Float32** (XC G3).
- Eligible trials are those passing the item 10 parity-margin test.
- Among those, take the first 5 per class by trial index. Trials are **never** selected by correctness.
- `replication.md` reports the subset's accuracy next to the full A01E accuracy.
- The 5-minute demo script may pick a correctly decoded trial for the keystroke sequence, and says so. The picker shows all 20 trials with their ground truth.

**Licence.** IV-2a / BNCI 001-2014 is attributed to Brunner et al. 2008 / BNCI Horizon in the file header and the UI. It is flagged "pending supervisor confirmation" (XC G11).

---

## 10. JS↔PyTorch parity across hard thresholds (XC G1, G2, G4)

1. **Identical inputs.** The export writes raw A01E samples as float32. The Python parity reference reads those **same float32-rounded samples**, upcasts them to float64, and runs the whole pipeline in float64: DSP, then `model.double()` with the float32 weights cast exactly. JS decodes base64 into a Float32Array and immediately upcasts to Float64Array. All JS DSP and NN code runs in float64. Both sides compute the same mathematics from bit-identical inputs, so the expected discrepancy is about 1e-12.
2. **No re-design in JS.**
   - The 8 SOS matrices and `sosfilt_zi` vectors are exported from scipy into `sfegat-weights.js`, so JS never designs a Butterworth filter.
   - JS reproduces the `sosfiltfilt` odd-extension padding (padlen = 3·(2·n_sections+1 − …), scipy's formula) and the zi·x₀ initial conditions.
   - The periodic Hann window, constant detrend and density scaling (one-sided doubling except at DC and Nyquist) are reproduced.
   - The FFT must handle N = 1000 and N = 250 exactly, with **no zero-padding to 1024**. Tonight that is a direct DFT with precomputed twiddles; mixed-radix 2·5 is POST-MID-EVAL (BE §4.3).
3. **PyG semantics mirrored exactly.**
   - GATv2: `lin_l` on the source, `lin_r` on the target, existing self-loops removed and then added, LeakyReLU 0.2, softmax per target over incoming edges, heads concatenated, bias added after concat.
   - `gcn_norm`: self-loop weight 1, degree computed on the **target (col)** index. This matters because the per-directed-edge masks make the graph asymmetric.
   - BN uses running statistics. Eval mode means no dropout and the deterministic η mask, so JS needs no RNG.
4. **Margin-based trial eligibility, disclosed in `replication.md` and the export log.** A trial is exportable only if, in float64 Python:
   - min over i≠j of |z_ij − 0.3| ≥ 1e-6; and
   - for every block ℓ = 1..3, min over surviving edges of |P_e − 0.5| ≥ 1e-6.

   The log records how many A01E trials failed the margin.
5. **Stage-by-stage parity, with diagnostics tighter than the acceptance limit.**

   | Stage | Check |
   |---|---|
   | PLV | abs ≤ 1e-9 |
   | z-PLV | abs ≤ 1e-9 |
   | H (µV²) | rel ≤ 1e-7 |
   | Edge sets A⁰, Â¹, Â², Â³ | **exact equality** |
   | Per-block node features | abs ≤ 1e-6 |
   | P_e | abs ≤ 1e-9 |
   | Logits (acceptance) | **abs ≤ 1e-4** |
   | Temperature-scaled softmax | abs ≤ 1e-6 |

6. **Runner.**
   - `research/export/node_parity.js` sets up `globalThis.window = {SA: {}}`, loads the POC scripts with `vm` in `index.html` order, runs the 20 trials and writes the intermediates as JSON.
   - `research/tests/test_parity_sfegat.py` calls it through `subprocess` (Node v24, no install) and compares against `research/runs/<deploy-run>/parity_ref.json`.
   - The export engineer owns both files.

---

## 11. t-SNE / Table 2 protocol (XC G14)

- **Input.** P0 SD seed-0 model per subject, eval mode, on that subject's session E (288 trials). Nothing is tuned on these trials, so this is visualisation only.
- **Stages** (following the code's `get_embeddings`):
  - evo0 = the raw input H, flattened per trial to 176-d;
  - evo1, evo2, evo3 = the post-BN node features after each block, flattened per trial to 22 × 128 = 2,816-d.
- **Embedding.** sklearn `TSNE(n_components=2, perplexity=30, init='pca', learning_rate='auto', max_iter=1000, random_state=0)`.
- **Scores.** Silhouette and Davies–Bouldin on the **2-D t-SNE coordinates** with the true class labels, per subject, then averaged over the 9 subjects for comparison with Table 2 (0.3088→0.3992 and 0.9427→0.7909).
- **Plots and counts.**
  - Fig. 5 equivalent: an A01 plot.
  - Fig. 6 equivalent: per-class edge-retention counts (out of 72) on A01E at k = 0 and k = 3, as 22×22 heatmaps.
- **Latency.** Python CPU, model-only and DSP+model, at batch sizes 1 and 288, median of 100 runs. It is not compared with the 3090 figure.
- **Cost.** All of this runs tonight in under 10 min.
- **POST-MID-EVAL.** A mean-pooled variant and original-space silhouette as robustness checks.
- **Honesty.** Evolved graphs are described as model-internal structure, not as neural networks (BE D13).

---

## 12. Tonight's timeline

T0 is the moment the loader, features and model tests pass: shapes, the 72/72/72/72 class balance, the κ identity, 149,796 parameters, `test_gae_receives_no_grad`, and the trainer refusing session E.

| Step | Start | Work | Estimated duration |
|---|---|---|---|
| 0 | T0 − 10 min | Vectorised feature cache for all available T/E files (P0 and V1 features) → `research/cache/` | 2–5 min |
| 1 | T0 | **Calibration benchmark (R0).** A01 T, P0 config, 50 epochs, 1 thread vs 4 threads; measures ms/step and records the session-T training loss. **Pre-registered gate, training data only:** if CE at epoch 50 is not ≥ 10 % below epoch 1 in µV², switch P0 to log10 µV² and log the deviation in the ADR. The orchestrator re-issues the time table from the measured numbers; Plan B is already approved. Epochs are never cut | ≤ 5 min |
| 2 | T0 + 5 min | **V0** floor baseline (seconds). **P0 SD × 9** plus **DEP 4 folds**, as 13 jobs on 4 single-thread workers | about 10–15 min wall |
| 3 | after A01 finishes | **Export and parity (demo critical path)**, in parallel with step 4: temperature fit → `sfegat-weights.js` + `mi-replay.js` → Node parity → browser Replay wired | — |
| 4 | T0 + 20 min | **LOSO-T, 9 folds**, first in the queue | about 45–90 min wall (BE), +20–40 % throttling |
| 4a | after SD finishes | Table 2 / Fig. 5 / Fig. 6 / latency (item 11), slotted in | under 10 min |
| 5 | queue | **V1 SD × 9 → AB-FE × 9 → AB-PLV × 9 → AB-R × 9** | about 1–2 h wall in total |
| 6 | 06:00 | **Cutoff.** No new jobs launch; running jobs finish | — |
| 7 | 07:00 | Results frozen. `docs/replication.md` is regenerated by script from `research/runs/` with PRELIMINARY labels | — |

**What happens to work that did not finish.** Any ablation not completed for all 9 subjects is reported as **"not run (post-mid-eval)"**, never as partial means. LOSO-T is the same: if it is unfinished at 07:00, it is reported as "in progress, post-mid-eval". It is never reported from incomplete folds.

**Risks.**
- The CPU estimates are [EST] until step 1 measures them.
- If the measured cost is above about 150 ms/step, AB-R and probably AB-PLV move to post-mid-eval. The demo-critical path (steps 1–3) does not depend on them.

---

## Critic

(critic failed)

---

## Rebuttal A (Rigor-first)

# Proposer A (Rigor-first): rebuttal

The critic step failed, so this rebuttal answers Proposer B only. B and I already agree on most of the substance:
- the precedence ladder: explicit paper text, then Table 1 arithmetic, then code to fill gaps, then ADR choices;
- τ = 0.3 and η = 0.5, both strict `>`, with the same "code default; not confirmed" label;
- CE-only training, with the `test_gae_receives_no_grad` finding;
- a hard mask with no gradient path;
- every architecture and DSP pin, and the 149,796 parameter total;
- SD as 9 per-subject models, LOSO trained on T and tested on E, last-epoch selection, seed 0;
- A01 as the deployment subject, chosen before any results exist;
- parity using float32-rounded inputs, float64 on both sides, exported SOS coefficients and the margin rule.

Below, I adopt what B does better and defend the rest.

## 0. Fact update (withdraws my blocker)

I re-checked the data folders. `A02E.mat` is now complete (44,218,409 bytes), and all 12 BNCI 013-2015 `.mat` files are present. Gate 0 stays: no training starts until all 18 IV-2a files match `SHA256SUMS.txt`. It is now expected to pass.

## 1. Concessions (what I change)

**C-a. Deployment model: adopt B's design.** This replaces my separate 240/48 `deploy_A01_s0` run.
- The exported model is the P0 SD A01 seed-0 model, trained on all 288 T trials. The Replay accuracy is then the reported A01 replication number, so the demo and `replication.md` show the same model.
- Temperature is fitted on the **288 out-of-fold logits** from a 4-fold stratified cross-fit on A01 T: 216 training and 72 held-out trials per fold. (B wrote "54 held out, 18 per class", but 288/4 = 72, 18 per class.) Use `StratifiedKFold(4, shuffle=True, random_state=0)` with P0 config, 500 epochs and the last epoch. T* is bounded to [0.05, 20].
  - This is standard cross-validated calibration (the `CalibratedClassifierCV(ensemble=False)` pattern). It uses 6× more calibration data than my 48 trials.
  - It also gives the session-T-only MI error prior π for the ErrP debate.
  - Fallback if time runs short: fold 0 alone, 72 trials.
- I keep three items from my version:
  - report out-of-fold ECE (15 bins) before and after scaling;
  - report A01E ECE for information only;
  - a trial-hash test that proves no Replay trial was used in training.

**C-b. Run the code-faithful bundle tonight.** My V5 equals B's V1: residual + dropout 0.2 + order 5 + nperseg 500 + binary GCN edges, SD × 9, seed 0.
- It costs about the same as P0 SD (about 10–15 min wall).
- It is the single most likely examiner question: "would the authors' code have scored differently?"
- It is labelled "code-faithful variant", never the headline, and is never promoted.

**C-c. Adopt B's queue, cutoff and freeze.**
- Queue order: P0 SD × 9 + DEP 4 folds → LOSO-T × 9 → V5 → A3 FE-GAT → A1 PLV-GAT → A4 R-GAT if time allows.
- No new jobs launch after **06:00**. Results freeze at **07:00**, and `replication.md` is then regenerated by script from `research/runs/`.
- Anything incomplete is reported as "not run / in progress (post-mid-eval)", never as partial means.

**C-d. FFT: direct DFT tonight; mixed-radix 2·5 is post-mid-eval.**
- An exact length-N DFT with precomputed twiddles (N = 1000 and N = 250, no padding) is mathematically identical. Its rounding error is about N·ε, roughly 1e-13 relative, well inside the 1e-9 diagnostics.
- It is simpler to get right tonight.
- I convert my absolute tolerances on the analytic signal and PLV to **relative ≤ 1e-9**, because µV amplitudes make absolute 1e-10 fragile.

**C-e. Ablation claims under Plan B.** I adopt B's wording: direction only, and **no "reproduced" claim for Fig. 4 until Plan A**. The paper's Δ values are still printed next to ours.

**C-f. Config layout.** I adopt B's flat `research/configs/{base,plan_b,plan_a}.yaml` + `variants/*.yaml`. It matches CLAUDE.md's "Configs live in YAML". The keys are unchanged from my skeleton.

## 2. Points I defend

**D-1. The verdict needs tiers, not one ±5 pp band.**
- Under B's band, an SD mean of 72.70 % is called "Reproduced". That is 5.0 pp below the paper, which is twice the paper's own FE-GAT ablation gap (−2.43 pp).
- So a build that lost the entire GAE + MC contribution could still be called "reproduced". A label that cannot tell the method from its ablation is too weak.
- We already agree on the fail line, so tiers cost nothing. Final SD verdicts:
  - **Reproduced:** |Δ| ≤ 3
  - **Consistent:** 3 < |Δ| ≤ 5
  - **Not reproduced:** |Δ| > 5
- Final SI verdicts:
  - **Reproduced:** |Δ| ≤ 4
  - **Consistent:** 4 < |Δ| ≤ 6
  - **Not reproduced:** |Δ| > 6
  - Under Plan B the SI verdict is **capped at "Consistent"**, because training on T only halves the training data. A shortfall is still "Not reproduced", as B says.
- Every verdict carries "(PRELIMINARY, 1 seed)". Spearman ρ is reported but does **not** gate a verdict (I concede B's point that n = 9 is too noisy). I drop my "ρ ≤ 0 downgrades a tier" rule.

**D-2. The t-SNE primary is node-level (6,336 points), not trial-flattened.**
- The paper says "visualization results of **node features** at different graph evolution stages" (P l.740–741, re-read just now) and "the node features from the initial graph structure" (l.733).
- RC §3 resolves `get_embeddings` as node-level embeddings.
- B's 2,816-d per-trial flattening appears in neither source.
- Final: the primary is node-level (evo0 = 8-d raw PSD; evo1–evo3 = 128-d post-BN), with Silhouette and DBI on the 2-D t-SNE coordinates. B's flattened per-trial version and the mean-pooled version run tonight as **labelled supplementaries**; together they add only 72 t-SNE fits of 288 points.

**D-3. The trainability gate measures accuracy, not a CE drop.**
- B's gate ("CE at epoch 50 ≥ 10 % below epoch 1") passes trivially when large raw µV² inputs inflate the epoch-1 CE. It also passes on memorisation.
- I fold my gate into B's calibration benchmark (R0), so it adds no separate step. The benchmark runs on A01 session T with a stratified 80/20 inner split (seed 0) for 100 epochs, about 30 s.
- **Switch globally to log10 µV² only if train accuracy < 40 % AND inner-val accuracy < 35 % at epoch 100.** The switch is logged as deviation D-units. Session E is never consulted.

**D-4. The ER density matching and determinism are kept as stated.**
- R-GAT density is matched to the mean evo0 density on session T. This is the same quantity as B's "subject's mean session-T PLV density".
- Each worker sets `torch.use_deterministic_algorithms(True)` and `set_num_threads(1)`. The MC-mask generator is a **dedicated seeded `torch.Generator`**, not the global RNG. This keeps the mask draws independent of batch order and of how many other random calls happen, and costs nothing.

## 3. Final revised choices (only the sub-questions that changed)

| Sub-question | Final |
|---|---|
| §8/§12 tonight | P0 SD × 9 + DEP 4-fold → LOSO-T × 9 → V5 code bundle → A3 → A1 → A4 if time; floor baseline; Table 2 / Fig. 5 / Fig. 6 / latency. Cutoff 06:00, freeze 07:00 |
| §9 deployment | Export the P0 SD A01 s0 model (all 288 T trials); temperature from 4-fold OOF logits (72 per fold); OOF ECE reported; Replay = first 5 per class in A01E passing the margin rule, never selected by correctness |
| §7 verdicts | Tiers as in D-1; ρ reported but not gating; Fig. 4 direction only under Plan B |
| §10 FFT | Direct exact DFT tonight; mixed-radix post-mid-eval; DSP tolerances relative ≤ 1e-9; logits acceptance ≤ 1e-4 |
| §5 gate | Accuracy gate run inside the R0 benchmark (D-3) |
| §11 | Node-level primary; trial-flattened and mean-pooled versions as labelled supplementaries |
| Configs | `research/configs/{base,plan_b,plan_a}.yaml` + `variants/` |
| Gate 0 | Unchanged; A02E is now complete and pending its SHA check |

All other parts of my original position stand unchanged.

---

## Rebuttal B (Demo-first)

(failed)

---

## Judge's ruling

The full decision, with exact values, file paths and tests, is in `docs/adr/0001-replication-fidelity.md`. This section gives the outcome per question and the reasons.

### Facts the judge verified (the critic failed)

**Data.** At 15:40, `sha256sum -c` reported OK for all 18 IV-2a files. `A02E.mat` is complete (44,218,409 B), and all 12 BNCI 013-2015 files are present.

**Measured calibration benchmark.** `research/runs/benchmark-20261014-131237/metrics.json` was **not used by either proposer**. It shows:
- 149,796 parameters;
- A01T evo0 density 0.382 at τ = 0.3;
- **566 ms/step per process with 4 concurrent single-thread processes**;
- 203 ms/step for one process with 4 threads;
- a projected LOSO-T of ≈ 7.1 h with ideal packing.

Both proposals assumed 40–80 ms/step. The timeline is rebuilt on the measured figure.

**Paper text.** l.733 and l.740–741 say t-SNE is applied to "node features". l.539–547 give the SD/LOSO protocol, l.536 says ≈ 0.15M parameters, l.92 claims "differentiable sampling" and l.913 says "guided form of DropEdge".

**Existing code.**
- `POC/js/dsp/fft.js` already computes exact length-N DFTs (radix-2 + Bluestein) with a relative error ≤ 1.3e-15.
- The whole JS DSP chain passes scipy parity at ≤ 1.8e-12.
- `research/sfegat/graph.py` already implements the strict, diagonal-inclusive z-threshold.

**Arithmetic.** 288/4 = 72 held-out trials per fold. A's correction of B is right.

### Rulings

| Q | Ruling | Prevailing side / reason |
|---|---|---|
| 1 | Ladder: explicit paper text > Table 1 arithmetic and "0.15M" (structure) > code (gaps and self-contradictions only) > ADR. P0 is frozen before results, with no promotion | A and B agree. The code is a non-runnable fragment, and CLAUDE.md §5 gives code no authority |
| 2 | τ = 0.3 on the diagonal-inclusive whole-matrix z-PLV, strict `>`, labelled "code default; call site unreleased; not confirmed". η = 0.5, strict `>`. Sweep post-mid-eval on session-T CV, descriptive only | Agreement. A's union grid adopted |
| 3 | CE only, λ = 0. `test_gae_receives_no_grad`. Report "149,796 parameters, 137,220 receive gradient". V6 (λ = 1.0, then 0.1) post-mid-eval | Agreement |
| 4 | Hard mask, no gradient. Per directed edge, resampled every forward pass from a dedicated seeded generator. Cumulative pruning. Verbatim honesty text (ADR D9). V7 (straight-through mask-weighted attention) post-mid-eval | Agreement. A's dedicated generator adopted |
| 5 | No residual; dropout 0.5; order 4; nperseg 250; weighted GCN edges; GATv2 → ReLU → BN in blocks and classifier (deviation from Eq. 20 logged); GCN → ReLU → BN(32); stem GATv2(8 → 32×4) with no activation; Simpson over inclusive bins; µV², subject to the gate | Agreement. Level-1 text beats code |
| 6 | SD = 9 per-subject models. LOSO-T = 2,304 training graphs, tested on the held-out subject's session E. Last epoch. E evaluated once, enforced by test. Seed 0 (Plan A: {0, 1, 2}). Config overlays `base` / `plan_b` / `plan_a` | Agreement |
| 7 | **Tiers**: SD Reproduced ≤ 3 / Consistent ≤ 5 / Not > 5 pp. SI ≤ 4 / ≤ 6 / > 6, with SI **capped at Consistent** under Plan B. ρ reported but not gating. Floor B0 and leakage alarm at > 82.70. Ablations: direction only | **A**. A single ±5 band would call a build that lost the whole SFE contribution "reproduced". The tiers keep B's fail line |
| 8 | P0 + register V1–V12 and A1–A5. Tonight: B0, P0 SD, DEP, P0 LOSO-T, V5 code bundle, A3, A1, A4 (subject to the cutoff). Everything else post-mid-eval | B's queue + A's register |
| 9 | A01, declared a priori. The exported model **is** the P0 SD A01 s0 model. T* from 4-fold cross-fit OOF logits on A01T (72 per fold). Replay = the first 5 per class in A01E passing the margin rule, never chosen by correctness. ADR 0002 remains the π source | **B's design**, conceded by A, with A's arithmetic correction |
| 10 | Float32 rounding once at export, float64 on both sides; exported SOS authoritative; existing Bluestein FFT accepted; margin ≥ 1e-6 on \|z − τ\| and \|P − η\|; stage tolerances rel ≤ 1e-9; logits ≤ 1e-4; Node `vm` runner under `research/tests/js_parity/sfegat/` | Merged. The FFT question is moot given the existing code |
| 11 | **Node-level** primary (6,336 points/stage, session E, TSNE perplexity 30, PCA init, seed 0). Silhouette and DBI on the 2-D coordinates. Trial-flattened and mean-pooled versions as supplementaries | **A**: the paper text says "node features" |
| 12 | Gates G0 (done) / G1 pytest / G2 caches + B0 / G3 accuracy trainability gate. FIFO queue on 4 single-thread slots: A01 SD → DEP × 4 → SD A02–A09 → LOSO-T × 9 → V5 → A3 → A1 → A4. Export and parity run as soon as A01 and DEP finish. Cutoff 06:00 (and no launch that cannot finish by 07:00); freeze 07:00. Projected all done by ≈ T0 + 10 h | Rebuilt on the measured benchmark. A's accuracy gate beats B's CE-drop gate |

### Residual dissent

See the ADR. The main points:
- B's single band and B's trial-flattened t-SNE were not defended in a rebuttal, because Rebuttal B failed. They are retained as a recorded alternative and as a supplementary respectively.
- Both proposers' compute estimates are superseded by the measured benchmark.
