# Phase-1 cross-check: completeness and consistency critic

**Role:** adversarial critic over the six Phase-1 briefs · **Date:** 2026-10-14 · **Scope:** `base-paper.md`, `reference-code.md`, `bci-eeg.md`, `errp.md`, `knowledge-graph.md`, `assistive-ux-safety.md`, checked against `PROMPT.md`, `CLAUDE.md`, `README.md` and spot-checks of `_paper-text.txt`. The other briefs were not edited.

**How spot-checks were done.** I ran read-only WebFetch/WebSearch, HTTP `HEAD` requests (`curl -I`, no bodies) and PyPI/GitHub JSON metadata queries on 2026-10-14. Nothing was downloaded or installed. Each spot-check says ✔ verified, ✘ contradicted, or ~ partly verified.

---

## 0. Bottom line

1. **The hardware premise is wrong in four of six briefs.** The orchestrator, the Paper Analyst, the Code Auditor and the ErrP Scientist assume an "8-core CPU". The MI-EEG brief checked locally and found an **Intel i7-10510U: 4 cores / 8 threads, a 15 W laptop part that throttles, 15.6 GB RAM** (`bci-eeg.md` §8.1). Every time estimate that says "8 cores" is optimistic. Use the bci-eeg numbers, and treat them as [EST] until the ≤3–5 min calibration run.
2. **One citation the ErrP cost analysis depends on looks swapped.** The [Chavarriaga10] abstract says "erroneous and correct agent decisions … 75.8 % and 63.2 %, *respectively*", so TPR = 0.758 and TNR = 0.632. `errp.md` uses TNR 0.758 / TPR 0.632 throughout (§0, §2, §7, §9.2, §9.4). That changes LR+ from 2.61 to **2.06**, and with it the "ErrP helps by 13 %" result (§3.2 below). Check the full text before Debate 2.
3. **The briefs propose three incompatible ErrP→KG mechanisms and two incompatible "Semantic 89 %" definitions.** The ErrP and UX briefs also contradict each other on rolling back high-risk actions. Debates 2, 4 and 5 must be run with these conflicts listed explicitly (§1.3).
4. **The SFE-GAT briefs disagree on the fidelity precedence rule, and so on residual connections and edge weights.** That is a framing decision the user should make *before* Debate 1 (§1.1).
5. **There are real gaps against the acceptance checklist:**
   - parity across hard thresholds (τ, η) and float32 vs float64;
   - the Synthetic MI mode;
   - the licence for embedding IV-2a trials;
   - headless self-test timing and where the browser profile is written;
   - a Node harness for the JS parity tests;
   - export size budgets.
   
   No brief covers these (§4).

---

## 1. Contradictions between briefs

### 1.1 SFE-GAT replication (Paper Analyst `base-paper.md` vs Code Auditor `reference-code.md` vs MI-EEG `bci-eeg.md`)

| # | Topic | base-paper | reference-code | bci-eeg | Critic's note |
|---|---|---|---|---|---|
| C1 | **Fidelity precedence** | paper text > Table 1 > code as tie-breaker (D-preamble, Q1) | (1) explicit paper numbers, (2) **code where the paper is silent or garbled**, (3) Table 1 sum as tie-breaker (§9) | "paper > repo per CLAUDE.md §5" (D4) | CLAUDE.md §5 ranks README > paper > ADRs and **says nothing about code**. This meta-rule decides C2–C4, so it should be ruled first in Debate 1 or by the user. |
| C2 | **Residual `relu(conv(x)) + x_in` in evo blocks** | **None** in the primary run; a variant only if the replication undershoots (D9) | **Include it** (code version; "likely matters for 3-block stability") (§9 rec. 4) | not addressed | Both agree it adds 0 params, so the 149,796 count cannot decide it. base-paper's "add the residual only if we undershoot" is outcome-driven selection. If the outcome is judged on session 2, that is a leakage path (bci L2). |
| C3 | **Edge weights in the GCN encoder** | **Weighted A** (literal Eq. 15), with binary as a variant (D13) | **Binary** (code `Data` has no weights) (§9 rec. 7) | defers | GATv2 is topology-only in both readings. Only the GCN differs. |
| C4 | **Stem GATv2** | Include (H1) | Include | (PyG reproduces 2,560) | **Agree.** 149,796 is independently verified by two briefs. |
| C5 | **Head merging** | concat | concat | concat | **Agree.** Settled by the parameter counts. |
| C6 | **τ** | 0.3 on z-scored PLV, strict `>` (D1) | 0.3, "Resolved by code (default argument)" | notes `>` for weights vs `>=` for `edge_index` | Agree on 0.3. Two caveats: (a) 0.3 is a *default argument*, and the call site is unreleased, so "resolved" overstates it; (b) `>` vs `>=` differ only on ties, but still pin it for parity. |
| C7 | **η** | 0.5; sweep {0.7, 0.9} on session-1 validation (D2) | 0.5; sweep {0.3, 0.4, 0.5, 0.6, 0.7} on session-1 validation | — | Agree on 0.5; the sweep grids differ. base-paper's point that η ≤ 0.5 is a no-op without BN(32) is moot under H1 (BN(32) included). |
| C8 | **GAE loss** | (a) CE only primary; (b) recon variant at **λ = 1** | (a) primary; (b) at **λ ∈ {0.1, 1.0}** | — | Agree on the primary. The variant grids differ. Both agree the GAE gets **no gradient** under CE-only, a strong finding that is consistent between the two briefs. |
| C9 | **Gradient through the MC mask** | none | none | — | Agree. |
| C10 | **Filter order / Welch nperseg / dropout** | 4 / 250 / 0.5 | 4 / 250 / 0.5 (paper wins on explicit numbers) | 4 / 250 | Agree. |
| C11 | **LOSO training set** | Both sessions of the 8 others (4,608); test the held-out subject's session E (D16) | Unresolved | 4,608 if the budget allows, else 2,304; test on E (D6) | Agree on E as the test session. 4,608 doubles LOSO cost (§5). |
| C12 | **Seeds** | 3 seeds everywhere (D17), "≈6–16 h" | — | 3 seeds SD; **1 seed LOSO**; 1 seed ablations | Budget conflict; the user decides. |
| C13 | **"Successfully reproduced" band** | SD ±3 pp, SI ±4 pp, **plus Spearman ρ ≥ 0.7** vs Fig. 3 (D19) | — | **±5 pp** on both means, **plus ρ > 0** (D9) | Large disagreement. bci-eeg's CI analysis (±1.6 pp test noise on the 9-subject mean, baseline reruns drifting 1.5–8.5 pp) argues the ±3 pp band is too tight. ρ ≥ 0.7 on n = 9 is a strong extra requirement. |
| C14 | **Software stack** | Python 3.14; versions open (Q4) | **torch 2.9.1+cpu, PyG 2.7.0 / 2.8.0.post1** | **torch 2.14.1, PyG 2.8.1** | Spot-check ✔: torch 2.14.1 cp314 win wheel = 124,110,781 B, uploaded 2026-09-30 (14 days old). **PyG 2.8.1 was uploaded 2026-10-12, only 2 days ago**, which is too fresh by reference-code's own "≥ 2 weeks old" rule. Recommend **PyG 2.8.0.post1 (2026-07-20)**. |
| C15 | **MOABB vs direct loader** | Assumes MOABB install | Assumes MOABB | **Direct `scipy.io.loadmat` loader canonical; MOABB optional** (D1) | Changes the install list. MNE is still needed for ErrP epoching (errp §5.2), so it can't be dropped entirely. |
| C16 | **Dataset size, IV-2a** | 0.4–0.8 GB [UNVERIFIED] | **0.4–0.5 GB** [UNVERIFIED] | **779,873,919 B** (HEAD-measured) | ✔ My HEAD on A01T.mat = 42,806,453 B, Last-Modified 12 Oct 2022, consistent with bci-eeg. **reference-code's estimate is wrong by about 60 %.** |
| C17 | **Time per SGD step (64 graphs)** | 15–40 ms | 20–60 ms | 40–80 ms (4C/8T laptop) | Only bci-eeg used the real CPU. Its FLOP estimate counts "three 128→128 GATv2" but there are **four** (3 blocks + classifier). That is a minor undercount, so lean to the upper end. |
| C18 | **SD 9 subjects × 1 seed** | 6–15 min | 10–30 min | 15–30 min (seq.) | |
| C19 | **LOSO 9 folds × 1 seed** | 1.4–3.6 h (4,608) | 1–5 h | 1.8–3.6 h (2,304) / **3.6–7.2 h (4,608)** sequential | base-paper's 4,608 estimate is about half of bci-eeg's. |
| C20 | **Units / band-power magnitude** | V band power "≈ 1e-11" | "≈ 1e-12 V²" | "≈ 1e-12 of µV²" | All are [UNVERIFIED]. They agree on the remedy (use µV²). Harmless. |

### 1.2 Paper-text facts spot-checked against `_paper-text.txt`

| Claim | Brief | Result |
|---|---|---|
| The paper says the full code is "available from the corresponding author upon reasonable request" [P, Data Availability] | base-paper Q2 | ✘ **Misattributed.** The paper's Data Availability (l.1036–1038) says *data* are "available upon reasonable request", and that "source code, trained models, and preprocessing scripts are publicly available at https://github.com/GaoHSin/SFE-GAT". The "on request" wording for code is in the **repo README**, as reference-code §1 correctly reports. |
| Eq. 18 prose reads "fixed threshold η" | reference-code §4 table | ✘ The extraction shows "fixed threshold :" with a garbled glyph. base-paper's glyph analysis says the prose glyph is τ and the equation glyph is a bold ø. "η" is the PROMPT's label, not the paper's. |
| Eight improvement deltas, all equal to 77.70 − baseline | bci-eeg §3.2 (8 deltas) vs base-paper A7 (6 listed) | ✔ The paper lists 8 values (5.48, 3.05, 3.05, 7.56, 0.96, 2.01, 1.66, 1.66). base-paper de-duplicated them; there is no real conflict. **77.05 being a typo is agreed by base-paper, bci-eeg and implicitly UX.** |
| "288 trials × 9 subjects from the first session" (pooled-SD ambiguity) | base-paper A15, bci-eeg D5, reference-code | ✔ The text is as quoted (l.539–541). |
| ≈ 0.15M parameters | all | ✔ l.536. |

### 1.3 ErrP / KG / policy / UX (Workstreams B, C, D)

| # | Topic | errp.md | knowledge-graph.md | assistive-ux-safety.md | Critic's note |
|---|---|---|---|---|---|
| X1 | **How a detected ErrP yields the Bedside Lamp** | **Do not flip the ranking.** Use the second-best rule [Perrin12]: offer argmax over H ≠ h\*. A single realistic ErrP leaves Ceiling ahead (0.585–0.633 vs 0.275–0.311) (§10.1) | **Flip the ranking** with a subtractive penalty: Ceiling 0.94 − 0.27 = 0.67 < Lamp 0.88 (§3.4) | — | Both give "Bedside Lamp", but by different mechanisms. The PROMPT says the ErrP "should down-weight the rejected entity … and **this is what makes Bedside Lamp the offered alternative**", which literally favours the KG mechanism. errp.md argues that it is statistically unjustified. **Debate 2/4 must rule.** |
| X2 | **Persistent penalty form** | Multiplicative `(1/Λ̂)^γ`, γ = 0.5, **floor 0.5**; decay **half-life 20 interactions**; scope (user, room, verb, entity) | Subtractive `λ·p·2^(−Δt/h)`, λ = 0.30, **h = 60 min** (demo clock); scope (entity, command, room) | ErrP-history **flag** h → escalate EXECUTE to CONFIRM, window `errpMemoryMs` | Three mechanisms with different units (interactions vs minutes vs ms) and different magnitudes. errp's version takes 0.94 to **≈ 0.51**; KG's to **0.67**. They must be unified, or at least layered explicitly, in one ADR. |
| X3 | **ErrP posterior in the canonical demo** | Realistic hard-ErrP posteriors are **0.48–0.55** after calibration and prior shift (§10.1) | Placeholder **0.91** (§3.4, CQ14) | — | KG's swap condition (p > 0.20) still holds at 0.5, so the demo survives. The 0.91 in CQ14's "expected answer" must come from the detector, not be scripted. |
| X4 | **"Semantic Context 89 %"** | Uses an "illustrative entity prior 0.80" (§9.2, §10.1) | **S_top × P(room) = 0.94 × 0.95 = 0.893** (D12) | **Normalised resolver posterior** (softmax or ratio over candidates) mapping 0.94 to 0.89 (D3) | Three definitions. KG notes its own softmax variant needs T ≈ 0.0287, a magic number. UX's recommendation is KG's rejected option B. **Debate 4/5 must pick one.** errp's π calculations must then be redone with it. |
| X5 | **Deployment error prior π** | 0.223 (1 − SD acc) or **0.264** (= 1 − 0.92 × 0.80) | — | Policy gives c = n·s = **0.819**, read as P(action correct), so π = **0.181** for the canonical action; Low-tier EXECUTE needs c ≥ 0.75, so π ≤ 0.25; Medium needs c ≥ 0.85, so π ≤ 0.15 | **An interaction no brief noticed.** If UX's product rule is adopted, the executed-action error rate is *bounded by the policy*. At π = 0.181 with costs (8, 4, 1), break-even LR+ = (0.819/0.181)·(4/7) = **2.59**. That is essentially the [Chavarriaga10] value as errp.md quotes it (2.61), and **above** it if the TPR/TNR swap in §2 is real (2.06). For Medium-tier actions (π ≤ 0.15) the break-even is ≥ 3.24. **On the briefs' own numbers, auto-rollback is break-even or harmful for most executed actions.** errp D8's "flag only" fallback becomes a live option, but the README mandates auto-rollback in the demo. |
| X6 | **High-risk actions and ErrP** | High-risk tier gets C_FN = 20, so **t\* = 0.174**: roll back *more* readily (§9.3) | — | **Never auto-roll back a caregiver-approved High-tier action; alert only** (D9) | **Direct contradiction.** Every High-tier action goes through caregiver approval, so errp's high-risk threshold would never fire under UX's rule. |
| X7 | **Token costs of errors** | C_FP = 4, C_FN = 8, C_TP = 1 | — | Low-tier C_err = 5; false rollback ≈ 4–7; missed error ≈ 4–8 (+ thermal) | Two token-cost models built from the same README flow disagree (8 vs 5 for a wrong light). Use one table for both the policy thresholds and t\*. |
| X8 | **Risk tier of AC power/mode and presets** | — | TTL: `SetMode`, `SetTemperature`, `TurnOn` all **LowRisk**. Only the thermal rule escalates. Presets fixed: NightMode/CoolingMode **Medium**, AllLightsOff/WatchTV **Low** | AC power/mode = **Medium**; advisory band 18–19 / 27–30 °C = Medium; presets = **max(constituent tiers)**, computed | The TTL tiers and UX's tier table don't match. The KG TTL must encode whatever Debate 5 rules. |
| X9 | **What CogLign resolves on Screen 4 (README tension)** | — | D18 (b): the user picks the fixture on S3; the KG *validates* and re-scores | §2.1 (a) validates + (b) pre-focuses the KG top candidate | Same idea, but the brief labels **(a)/(b) are swapped** between the two briefs. Use explicit names in the debate to avoid confusion. |
| X10 | **ErrP observation window / lockout** | Decision about 0.8–1.0 s after feedback | — | About 1 s; post-actuation lockout = that window | Consistent. |
| X11 | **Margin rule** | — | Any top-2 margin rule must be ≤ 0.06 or the canonical case becomes CONFIRM | Policy has no margin rule | Consistent, but Debate 5 must not add one carelessly. |
| X12 | **−8.4 µV** | Implausible as a grand-average Ne (2× the literature). Plausible as a single-trial minimum. Synthetic template plus a seed chosen to hit −8.4 | Stored as `sa:peakAmplitude -8.4` | Spoken "minus 8 point 4 microvolts" | Consistent once read as a single-trial value. **Unchecked risk:** nobody showed that the noise-seeded synthetic epoch is classified as an error at t\* by the *trained* sLDA. The PROMPT requires that [Simulate ErrP] "genuinely detect it". See gap G7. |

### 1.4 Data-split tension (neural calibration vs replication protocol)

- **UX D4** wants SFE-GAT softmax **temperature-scaled on a validation split carved from session 1**.
- **base-paper D17 and bci-eeg D7** train on **all of session 1** with no validation split (paper-faithful).

These are compatible only if the **deployment model** (PROMPT export step) is a separate run with a session-1 hold-out, distinct from the replication models. No brief says this, so add it to Debate 3. It also costs one extra (short) training run.

### 1.5 Reset vs audit

- **PROMPT/README:** `[Reset Demo]` "restores the exact README initial state".
- **UX §8.2:** Reset must **append** a `RESET` entry and never wipe the log.

These are compatible only if the audit log is ruled *outside* the "initial state". Debate 6 should state this explicitly. The self-test must then compare device, store and UI state, not the log.

---

## 2. Suspect, weakly cited, or possibly fabricated claims

**Spot-check results (12 checks; 5+ were requested):**

| # | Claim (brief) | Check | Result |
|---|---|---|---|
| S1 | [Chavarriaga10]: TNR 75.81 % / TPR 63.21 % (errp §0, §2, §7, §9) | infoscience.epfl.ch/record/149292 abstract: "to recognize erroneous and correct agent decisions from EEG (average recognition rates of 75.8 % and 63.2 %, respectively)" | **✘ Likely swapped.** The abstract gives erroneous (TPR) = 75.8 % and correct (TNR) = 63.2 %. LR+ becomes 0.758/0.368 = **2.06**, not 2.61. With costs (8, 4, 1) at π = 0.223, E[C] ≈ 1.744 vs 1.784 for no ErrP (**−2 %**, not −13 %). With equal costs, +52 % (not +21 %). The full-text tables (per p = 0.2/0.4, cross-session) may label it differently, so verify against the PDF before Debate 2. |
| S2 | [Keyl19] FCz wN1 −1.55 / −0.01 µV (controls), SCI −0.27; wP2 +2.79 / −0.23; SCI +1.29 (errp §1.3) | Frontiers full text, Table 2 | ✔ Exact. (Volume is Front. Neurol. 9, published 31 Jan 2019.) |
| S3 | [Yasemin23] J. Neural Eng. 20(1):016015 (2023), authors Yasemin, Cruz, Nunes, Pires | IOPscience page | ✔ Bibliographic details correct. ~ The abstract has **no** BA numbers, so 77.14 % (BNCI) and 72.35 % (mean) are **unverified** from body tables. A plain web search failed to find the paper, so the DOI is the reliable route. |
| S4 | Huggins 2011: ≥ 90 % accuracy satisfied 84 %; standby exits ≤ once every 2–4 h, 84 %; 15–19 letters/min, 72 %; n = 61 (UX §1.4) | PMC3286341 | ✔ All four. |
| S5 | Mainsah 2015: ErrP delete-and-replace correction −47 % to 0 % (KG §3.1 [L10]) | Duke/ETSU listing | ✔ IEEE TNSRE 23(5):737–743, 2015. ~ KG says "compared with confidence-based correction". The comparators were dictionary / Bayesian-dictionary corrections using P300 confidences, and these were **offline simulations**. The nuance is slightly overstated. |
| S6 | BNCI 001-2014 total 779,873,919 B; Last-Modified 12 Oct 2022 (bci-eeg) | HEAD A01T.mat | ✔ 42,806,453 B, same Last-Modified. |
| S7 | BNCI 013-2015 Subject01_s1 = 269,644,558 B; total 3.42 GB (errp §5.2) | HEAD | ✔ Exact. |
| S8 | torch 2.14.1 cp314 win wheel 124.1 MB, 30 Sep 2026 (bci-eeg) | PyPI JSON | ✔ 124,110,781 B, 2026-09-30. |
| S9 | PyG 2.8.1 released 2026-10-12; 2.8.0.post1 2026-07-20 (reference-code) | PyPI JSON | ✔ 2.8.1 at 2026-10-12T11:47Z. **It is only 2 days old.** |
| S10 | SAREF v4.1.1 declares no `OnState`/`LightingDevice`/`OnOffState`, but does declare `StateValue` (KG §1.1) | grep of `saref.etsi.org/core/v4.1.1/saref.ttl` | ✔ 0 declarations of the deleted terms; `saref:StateValue` present. |
| S11 | GaoHSin/SFE-GAT: `license: null`, last push 2026-01-12 (reference-code) | GitHub API | ✔ |
| S12 | Paper Data Availability wording (base-paper Q2) | `_paper-text.txt` l.1036–1038 | ✘ Misattributed (see §1.2). |

**Weak or uncited claims still standing (flag in debates; label [UNVERIFIED] in final docs):**

*base-paper*
- "Seed variance of GNNs on 288-trial sets ≈ 1–2 pp". This underpins the ±3 pp tolerance and is **[UNVERIFIED]**.
- All CPU timings; band-power magnitudes.
- D9's "residual only if undershooting" (see C2).

*reference-code*
- τ = 0.3 described as "resolved" when it comes only from a default argument.
- Install sizes (0.4–0.5 GB dataset: wrong).
- PyG MIT licence not fetched.

*bci-eeg*
- SciPy 1.18 default window named `'hann_periodic'` (not spot-checked; unusual naming, so verify before writing parity code).
- A04–A06 Fig. 3 subject assignment [UNVERIFIED against the rendered figure].
- LightConvNet 79.48 % from a search snippet; IFNet, SF-TGCN and MSVTNet originals unverified.
- "py help" may have triggered a Python install-manager self-update outside the project. That would be an unintended out-of-folder write; it is flagged honestly in the brief but should be reported to the user.

*errp*
- S1 above.
- The summary sentence "LR+ > 3.48 at π = 0.223 *with equal costs* … (LR+ > 5.1 at π = 0.10)" **mixes cost scenarios**: 5.14 is the (8, 4, 1) value; under equal costs it is 9.0.
- D8's "π < about 0.12 ⇒ harmful" is not derived. The break-even π depends on LR+ (≈ 0.145 for LR+ 3.37; ≈ 0.18 for 2.61; ≈ 0.22 for 2.06).
- EEGNet "≈ 1 h on 8 CPU cores" uses the wrong hardware.
- Kaggle session count, licence and MOABB presence are all [UNVERIFIED].
- MOABB `BNCI2015_013` label mapping conflicts with its own docs (flagged by the brief).
- `.mat` v5 vs v7.3 is unknown. If it is v7.3, `scipy.io.loadmat` fails and `h5py` is needed.
- MOABB/MNE cache "3–7 GB extra" [UNVERIFIED].
- Combrisson15, Platt99, NiculescuMizil05, Saerens02, Zadrozny02 and Rivet09 are all marked not verified this session. They are real, well-known references, so the risk is low.

*knowledge-graph*
- The novelty claim "no published work combines MI-BCI + SAREF KG" (properly worded "we did not find").
- Hexastore cited from memory.
- Labutin & Chuprina details.
- The US 12,087,320 patent claim is correctly retracted.
- **Design caution:** the "explained" 0.94 is reverse-engineered by choosing the seed history (6/10) and w_R = 0.15 together. The PROMPT says "explain the 0.94 rather than hard-coding it", so the panel may see the seeded history as hard-coding by another name. Disclose the seed as synthetic (KG Q6 already does).

*assistive-ux-safety*
- WHO 24 °C heat cut-off and exact wording (reCAPTCHA-blocked snippets).
- SCI optimum 23–25 °C.
- Dal Seno's closed form.
- Quasi-movement refractory figures.
- [35] authors; Islamabad climate.
- CIBSE TM59 through a secondary planning document.
- The ITR table's "SFE-GAT SD, body text 0.7705" row legitimises a value every other brief calls a typo. Drop it.

---

## 3. Coverage map against the PROMPT §5 acceptance checklist

| Checklist item | Covered by | Status |
|---|---|---|
| Double-click offline, zero console errors, namespaced modules, no ES module/fetch/CDN | KG §4.4 (ES modules blocked on `file://`), UX §8.1 (`crypto.subtle` on `file://` LOCAL-TEST), UX §4 (offline voices) | **Partial.** Nobody covered script load order, base64 → Float32Array decoding cost in classic scripts, or the 400-line budget for DSP files (FFT + Bluestein + filtfilt + Welch). See G3/G4. |
| Every README label/value/state/shortcut; four-token journey | UX §2 (token costs, Space/Backspace preventDefault), KG §2.5 (initial state) | Partial. **README-silent values** need user answers (KG Q1–Q7). Control ranges for TV channel/volume, fan steps and AC setpoint steps are unspecified (G9). |
| SFE-GAT replication run, SD/SI per subject, ablations, ambiguities in ADRs | base-paper, reference-code, bci-eeg | **Well covered**, apart from the contradictions in §1.1. |
| JS forward passes match PyTorch within 1e-4 (SFE-GAT and ErrP) | bci-eeg §4.3 (N = 1000 FFT), §5.2 (odd padding); errp §11 (float64) | **Gap** (G1, G2): discontinuities at τ/η, Float32 export, and how JS runs under a test harness. |
| Replay decodes held-out trials; prediction vs truth; brain graph evo0→evo3 | bci-eeg L7 (session-E hash test), §1.2 (montage, FCz = ch 4, Cz = ch 10), base-paper §8.4 (store A^(0..3)) | Covered. 2-D electrode coordinates need MNE `colin27_1005` or a hard-coded table (G10). |
| ErrP trained/evaluated on a real public dataset, honest metrics; genuinely detects injected/replayed epochs; atomic rollback incl. presets | errp (dataset, protocol, cost model), UX §8.3 (sagas) | Covered, with the S1 risk and gap G7 (does the synthetic epoch actually trigger the detector?). |
| KG answers every CQ; 0.94 explained; ErrP penalises; SPARQL shown is what ran | KG (16 CQs, prototype-verified) | Covered. Conflicts X1–X4 remain. |
| Sliders → EXECUTE/CONFIRM/REJECT; thermal → CAREGIVER; audit chain verifies and breaks on tamper | UX §6.4 test vectors, §8 | Covered. |
| 7 debates with transcript + ADR; every research claim cited | — | Process item. §2 lists claims needing a verified label. |
| `[Reset Demo]` restores the exact initial state | KG (reload TTL), UX (RESET entry) | Tension §1.5. |
| Nothing committed or published; all work inside the folder | bci-eeg (MNE_DATA, pip cache, MPLCONFIGDIR) | **Gap** G6: headless Edge writes a profile to `%LOCALAPPDATA%` unless `--user-data-dir` is set. Possible py-manager self-update (§2). WebFetch tool caches (KG note) are outside our control. |

---

## 4. Gaps: what the checklist needs that no brief covers

- **G1. Parity across hard thresholds.** The browser pipeline thresholds z-scored PLV at τ and P_Â at η.
  - A ~1e-7 difference between scipy and JS (Hilbert via FFT, filtfilt padding) can flip an edge whose z-score sits near 0.3. That changes the graph, and the logits then differ by far more than 1e-4.
  - The same applies to η = 0.5 on sigmoid outputs.
  - **Needed:** a parity test design that (a) compares intermediates stage by stage (PLV, H, A^(k), logits), (b) asserts a minimum distance |z − τ| and |P − η| over the exported trials, or exports trials only where that margin exceeds, e.g., 1e-6, with the selection disclosed, and (c) fixes float64 in both runtimes.
- **G2. Float32 vs float64.**
  - The PROMPT mandates Float32 + base64 for `mi-replay.js`. errp §11 insists on float64 for causal IIR parity.
  - Nobody decided whether JS upcasts Float32 replay data to float64 before the DSP (it should), or whether Python's parity reference reads the *same* float32-rounded samples (it must).
- **G3. Export size budgets (not computed anywhere).**
  - `sfegat-weights.js`: 149,796 params + 4×BN(128) + 3×BN(32) running stats ≈ 151k floats ≈ 605 kB float32 ≈ **0.8 MB base64**.
  - `mi-replay.js`: one trial is 22 × 1000 × 4 B = 88 kB, ≈ 117 kB base64. Under 3 MB that is **about 25 trials (~6 per class)**. With the padded [1.5, 6.5) window (bci-eeg D2 b), about 20.
  - `errp-replay.js`: 64-channel CAR epochs ≈ 524 kB each (errp §11), which forces the reference-scheme decision.
  - Each file must also respect the "~400 lines per file" rule, or that rule must be ruled inapplicable to generated data files.
- **G4. How JS forward passes run in the parity tests.** pytest cannot execute browser IIFEs.
  - **Needed:** a Node runner that sets up `globalThis.window = {SA:{}}`, loads the POC scripts in `index.html` order and dumps logits, called from pytest via `subprocess`. Alternatively, run parity in headless Edge.
  - Node v24 is installed, so no install is needed, but nobody has designed it.
- **G5. Headless self-test timing.**
  - `msedge --headless=new --dump-dom` serialises the DOM when the load completes. An async self-test (`crypto.subtle.digest`, `speechSynthesis` `voiceschanged`, `setTimeout`-driven animations) may not have written `#selftest-report` by then.
  - **Needed:** `--virtual-time-budget=<ms>` and/or a synchronous-first self-test design. UX ran headless probes but did not test `--dump-dom` timing.
- **G6. Out-of-folder writes during verification.** Headless Edge creates or uses a user profile under `%LOCALAPPDATA%` by default. CLAUDE.md §1 says write only inside FYP or the scratchpad, so add `--user-data-dir=<scratchpad>/edge-profile` to every msedge command. pip, MNE and matplotlib caches are covered by bci-eeg.
- **G7. Synthetic ErrP epoch vs the trained detector.**
  - errp proposes a literature-sized template plus a seed chosen so that the FCz minimum = −8.4 µV.
  - The detector uses 8 channels × 9 windowed means (after CAR or a subset reference). So the synthetic epoch must be **multichannel and match the reference scheme**, and must produce q > t\* on the *trained* weights.
  - A no-ErrP synthetic epoch must produce q < t\*.
  - Nobody specified the channel topography of the synthetic ErrP or a test that checks this.
- **G8. Synthetic MI mode (PROMPT §D mode 3) is not researched at all.**
  - Open questions: how to generate 22-channel EEG with class-specific ERD (mu/beta suppression over C3/C4 for the hands, Cz for the feet, and an unclear, commonly lateral/bilateral pattern for the tongue); the background model (1/f + alpha); volume conduction (needed for PLV to look EEG-like); and whether an SFE-GAT trained on *real* session-1 data classifies these synthetic trials above chance.
  - If it does not, Synthetic mode will show mostly wrong predictions. Debate 3 must decide whether that is acceptable or whether the generator is tuned (with disclosure).
- **G9. README-silent device semantics.** These need user rulings or a Debate 7 ADR:
  - TV channel range and wrap; volume step and cap (UX's Medium tier at > 80 % volume presumes a cap);
  - AC setpoint step and allowable range (the UI must be able to *reach* < 18 °C to demo the hazard);
  - whether the fan goes to Low when Turned On from OFF;
  - how the hub subtitles change (e.g. "Ceiling Fan: Medium");
  - the Screen 1 card names (UX assumes [Visual, Audio]).
- **G10. Montage coordinates.** bci-eeg suggests exporting 2-D positions from MNE's `colin27_1005`. That needs MNE in the venv, or a hard-coded, cited 22-electrode table. Decide who owns `POC/js/brain/montage.js` data.
- **G11. Licence of BCI IV-2a / BNCI 001-2014 for embedding raw trials in `mi-replay.js`.**
  - Every brief discussed the NC-ND licence for the *ErrP* dataset; **none checked the licence of the MI dataset** we also embed.
  - BNCI Horizon lists licences per dataset; 001-2014 is likely also CC BY-NC-ND 4.0 **[UNVERIFIED]**. If so, the same "raw excerpts only, processing in JS" argument (errp §11) applies to the MI replay export.
- **G12. Replay-mode integration with navigation.** In Replay mode a decoded class drives a token, but the canonical flow needs specific tokens (SELECT ×4).
  - Nobody specified how a replayed trial maps into the navigation flow: the operator picks a trial of the needed class, and a mis-decode moves the cursor wrongly.
  - Nor what the policy's neural confidence is when the replayed prediction is wrong.
  - Debate 3 should cover this.
- **G13. Deployment-model calibration run** (see §1.4) and the ErrP **deployment prior π** source (X5) need a concrete data source. Replay over session-E trials of the deployment subject would give a measured MI error rate, but using it to set π is a test-session use. Disclose it, or estimate π on session-1 cross-validation instead.
- **G14. t-SNE / Table 2 protocol.** Briefs list the unknowns (input, perplexity, split) but propose no defaults. base-paper D22 calls it "cheap" without a protocol. reference-code notes that `evo0` is the raw PSD (from `get_embeddings`). Debate 1 needs a concrete pick.

---

## 5. Consolidated approvals the user must give

These are corrected for the real hardware (**i7-10510U, 4C/8T, 15 W, 15.6 GB RAM, no GPU, 311 GB free on C:**). All writes go under `C:\Users\AK\Documents\FYP` (CLAUDE.md §1).

### 5.1 Environment and installs

| # | Action | Size | Notes |
|---|---|---|---|
| I1 | `py -3.14 -m venv research\.venv` (Python 3.14.7 already installed) | ~25 MB | No second interpreter. Matching the paper's Python 3.10 / torch 2.7.0 would need a Python ≤ 3.13 install *outside* the folder: not recommended (bci-eeg D11, reference-code §6). |
| I2 | `torch` CPU wheel | **124.1 MB** download (torch 2.14.1 cp314, ✔ verified; ≥ 14 days old) | Alternatively torch 2.9.1 (Nov 2025) as the more conservative choice (reference-code). Installed footprint is ≈ 0.5–1 GB [UNVERIFIED]. |
| I3 | `torch_geometric` | ~1.3 MB, pure Python | **Pin 2.8.0.post1 (2026-07-20)**, not 2.8.1 (2 days old, ✔ verified). No `torch_scatter`/`torch_sparse`/`pyg-lib`. |
| I4 | numpy, scipy, scikit-learn, pandas, matplotlib, pyyaml, pytest | ≈ 80–100 MB download (bci-eeg per-wheel sizes) | |
| I5 | `mne` 1.13.2 | 7.7 MB + deps | Needed for ErrP epoching and montage coordinates. |
| I6 | `pyriemann` 0.12 | small, pure Python | ErrP xDAWN/Riemannian comparators only. |
| I7 | `moabb` 1.7.2 (**optional**) | ~1 MB + ~25 MB deps | bci-eeg recommends a direct `.mat` loader for IV-2a; errp recommends MOABB for BNCI 2015-013 (with the label-mapping trap). The user can decline and we write both loaders. |
| I8 | `h5py` (conditional) | small | Only if BNCI 013-2015 `.mat` files are v7.3 [UNVERIFIED]. |
| I9 | (Optional) `npm install --save-dev n3@2.13.12` | ~1 MB + few deps; creates `package.json` in FYP | Node-only Turtle-parser test oracle (KG). |
| I10 | (Optional, not recommended) `axe-core` via npm | a few MB [UNVERIFIED] | UX recommends no install (self-test computes contrast). |
| | **Total core** | **≈ 230–260 MB download; ≈ 0.9–1.2 GB installed [EST]** | Redirect the pip cache to `research/.pip-cache` or use `--no-cache-dir`. Set `MNE_DATA`, `MNE_DATASETS_BNCI_PATH` and `MPLCONFIGDIR` inside the project. |

### 5.2 Dataset downloads

| # | Dataset | Source | Size | Licence | Notes |
|---|---|---|---|---|---|
| D1 | **BCI Competition IV-2a** (BNCI 001-2014), 18 files A01T…A09E.mat | `https://lampx.tugraz.at/~bci/database/001-2014/` (BNCI Horizon redirects there) | **779,873,919 B ≈ 780 MB** (✔ A01T = 42,806,453 B) | **Not researched by any brief** (G11). BNCI 001-2014 is likely CC BY-NC-ND 4.0 **[UNVERIFIED]** | → `research/data/bnci2014_001/` plus a SHA-256 manifest. About 2–10 min. |
| D2 | **BNCI 013-2015 "Monitoring ErrP"** (Chavarriaga & Millán), 12 files SubjectNN_sK.mat | `https://lampx.tugraz.at/~bci/database/013-2015/` | **3,416,997,751 B ≈ 3.42 GB** (✔ S01 s1 = 269,644,558 B) | **CC BY-NC-ND 4.0**. No login | MOABB/MNE conversion may need 3–7 GB extra [UNVERIFIED]. A subjects 1–2 bring-up subset is 1.06 GB. |
| D3 | (Fallback only) Iwane et al. 2023 `data.zip` | Zenodo 6415455 | 8.0 GB | CC BY 4.0 | Only if NC-ND is rejected. |
| — | Kaggle BCI Challenge @ NER 2015 | Kaggle | — | Login + rules acceptance | **Rejected:** violates the no-login rule. The user could download it themselves. |
| — | OpenBMI (Table 4) | — | large | — | Recommended out of scope (base-paper D22). |

### 5.3 Long runs (CPU-only, i7-10510U; all [EST] until calibrated)

| # | Run | Sequential | Wall with 3–4 single-thread processes | Needs approval (> 15 min)? |
|---|---|---|---|---|
| R0 | **Calibration micro-benchmark** (A01, 10 epochs; PyG sparse vs dense) | ≤ 3–5 min | — | No. **Run this first, then re-issue this table with measured numbers.** |
| R1 | Preprocessing (filter bank + Welch + Hilbert PLV, 5,184 trials), vectorised | < 2–5 min | — | No |
| R2 | SD, 9 subjects × 1 seed × 500 epochs | 15–30 min | 6–12 min | Yes (borderline) |
| R3 | SD, 9 subjects × 3 seeds | 45–90 min | 18–35 min | Yes |
| R4 | LOSO, 9 folds × 1 seed, 2,304 training graphs (T only) | 1.8–3.6 h | 45–90 min | Yes |
| R5 | LOSO, 9 folds × 1 seed, 4,608 graphs (T + E of the 8 others) | 3.6–7.2 h | 1.5–3 h | Yes |
| R6 | Fig. 4 ablations: 5 variants × 9 subjects × 1 seed (SD) | 1.2–2.5 h | 30–60 min | Yes |
| R7 | Sensitivity/variants (GAE recon λ, residual, binary vs weighted edges, PLV 8–30 Hz, log-PSD, η sweep, pooled SD, padded window), each SD × 1 seed, **session-1 validation only** | 15–30 min each | 6–12 min each | Yes, as a batch |
| R8 | t-SNE / Silhouette / DBI, edge counts, latency | < 10 min | — | No |
| R9 | **Deployment model** (one subject, with a session-1 calibration hold-out for temperature scaling; §1.4) | ~2–5 min | — | No (not listed by any brief) |
| R10 | ErrP sLDA (6 subjects, cross-session + blocked CV + LOSO, Platt, 1000-permutation test) | 5–15 min | — | No |
| R11 | ErrP xDAWN + tangent-space comparator | 5–10 min | — | No |
| R12 | ErrP EEGNet comparator (optional) | **≈ 1–2 h** (errp said "1 h on 8 cores"; the real CPU has 4) | — | Yes |
| | **Plan A total** (R0–R4 or R5, R6, R8–R11) | ≈ 6–14 h sequential | **≈ 3–7 h wall** | Staged approvals |
| | **Plan B** (bci-eeg §8.4): SD complete; LOSO on T only; partial R-GAT/R-SFE-GAT on 3 labelled subjects | | ≈ 2–3 h wall | |

Thermal-throttling caveat (bci-eeg): expect 20–40 % slower under sustained load on a U-series part. Keep the laptop plugged in, in "Best performance" mode.

---

## 6. Top open questions for the user (de-duplicated across the six briefs)

1. **Compute envelope.** Approve Plan A (≈ 3–7 h wall in staged runs, some overnight?) or Plan B? 1 or 3 seeds for SD, ablations and LOSO? LOSO on T-only (2,304) or T + E (4,608) training?
2. **Fidelity precedence (C1).** Primary replication as paper-text-first, with code-only features (residual, binary edges, dropout 0.2, order-5 filter, nperseg 500) as labelled variants? Or code-first where the paper is silent?
3. **Stack.** OK with Python 3.14 + torch 2.14.1 (or 2.9.1) + PyG 2.8.0.post1 instead of the paper's 3.10 / 2.7.0 / 2.6.1? MOABB installed, or direct loaders only?
4. **Licences.** Is CC BY-NC-ND 4.0 acceptable for embedding raw ErrP excerpts (and probably IV-2a trials, G11) in a POC that may be shown or handed to the panel? If not, Iwane 2023 (CC BY 4.0, 8 GB) for ErrP.
5. **ErrP policy.** Accept the token-cost model, and decide which single model (errp 8/4/1 vs UX 5/4–7) is used for both the policy and t\*. Should a caregiver-approved High-tier action ever be auto-rolled back (X6)? If measured LR+ is below break-even (X5, S1), keep README-mandated auto-rollback in the demo with disclosure, or degrade to "flag and confirm"?
6. **KG/README-silent facts.** Rooms of the fan, AC and TV; AC initially ON; preset contents; brightness, channel and volume initial values; TV/AC/fan ranges (G9); Medium/High tier labels; whether a *seeded* recency history (6/2/2) is acceptable.
7. **"Semantic Context 89 %".** Which definition (X4): S_top × P(room), the normalised posterior, or a separate factor?
8. **Contacting the authors.** Do you want to email cghcust@163.com yourself for `compute_plv`, `z_score_norm`, `monte_carlo_new_edge_index`, η and the training script? Agents cannot.
9. **Out-of-README features.** May we add standby/"call caregiver" (harness- or caregiver-only), a thermal advisory band 18–19 / 27–30 °C, KG pre-focus on the Fixtures screen, and wrap-around navigation?
10. **Manual checks.** Please do the 30-second headed-Edge voice check (`speechSynthesis.getVoices().filter(v=>v.localService)`), and name the viva browser.

---

## 7. Recommended corrections before Phase 2 (none applied; briefs untouched)

- errp.md: re-verify [Chavarriaga10] TPR/TNR against the full text, and recompute §0, §9.2, §9.4 and §10.1. Fix the §0 cost-scenario mix-up and the 8-core assumption.
- base-paper.md Q2: re-attribute the "on request" wording to the repo README.
- reference-code.md: correct the dataset size; do not quote η as the paper's symbol; soften "τ resolved" to "τ = 0.3 default argument".
- All briefs: replace "8-core" with "4C/8T i7-10510U". Pin PyG 2.8.0.post1.
- UX: drop the "SD, body text 0.7705" ITR row (77.05 is a typo by consensus).
- Debates 2/4/5 should receive X1–X8 as a single conflict list. Debate 1 should receive C1–C3 and C13. Debate 3 should receive G1–G3, G8, G12 and §1.4.

## References (for checks made in this critique)

- Chavarriaga R., Millán J. d. R. *Learning from EEG error-related potentials in noninvasive brain-computer interfaces.* IEEE TNSRE 18(4):381–388, 2010. Abstract: https://infoscience.epfl.ch/record/149292
- Keyl P. et al. *Front. Neurol.* 9:1192 (2019), Table 2. https://www.frontiersin.org/journals/neurology/articles/10.3389/fneur.2018.01192/full
- Yasemin M., Cruz A., Nunes U. J., Pires G. *J. Neural Eng.* 20(1):016015, 2023. https://iopscience.iop.org/article/10.1088/1741-2552/acabe9
- Huggins J. E., Wren P. A., Gruis K. L. *Amyotroph. Lateral Scler.* 12:318–324, 2011. https://pmc.ncbi.nlm.nih.gov/articles/PMC3286341/
- Mainsah B. O. et al. *IEEE TNSRE* 23(5):737–743, 2015. https://amll.pratt.duke.edu/publications/moving-away-error-related-potentials-achieve-spelling-correction-p300-spellers
- HTTP HEAD, 2026-10-14: https://lampx.tugraz.at/~bci/database/001-2014/A01T.mat ; https://lampx.tugraz.at/~bci/database/013-2015/Subject01_s1.mat
- PyPI JSON, 2026-10-14: https://pypi.org/pypi/torch/json ; https://pypi.org/pypi/torch-geometric/json
- SAREF core v4.1.1 TTL: https://saref.etsi.org/core/v4.1.1/saref.ttl
- GitHub API: https://api.github.com/repos/GaoHSin/SFE-GAT
- Base paper, local extraction `docs/research/_paper-text.txt` l.398–406, 536–541, 815–821, 1036–1038.
