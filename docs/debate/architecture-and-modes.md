# Debate 6 transcript: architecture-and-modes

**Date:** 2026-10-14 · **Ruling:** `docs/adr/0004-architecture-and-modes.md` (Accepted 2026-10-14)
**Protocol:** PROMPT §3 Phase 2. Two proposers, a critic, one rebuttal round, then a fresh judge. This run was time-boxed for the mid evaluation on 2026-10-15.
**Participation:** Proposer A (rigor-first) and Proposer B (demo-first) both **failed** (network errors in the workflow journal). There was **no rebuttal round**. The critic filed. The critic text below is copied verbatim from `docs/debate/_inputs/architecture-and-modes.md`.

---

## Question set (as issued to the debate)

Software architecture + decoder modes. Settle:

1. browser module map (start from PROMPT.md proposed layout), bus event catalogue, SA.store schema, screen graph, config keys;
2. Python package layout under research/ (sfegat, errp, export, configs, tests, runs) and Plan A/B config mechanism;
3. Scripted / Replay / Synthetic modes: which is the viva default, how Replay-decoded trials map onto the token-driven flow and what the policy does with a mis-decoded trial (G12); synthetic MI generator design and whether the trained model must classify it above chance (G8);
4. export file formats, float32/base64 vs float64, size budgets (G3: weights ~0.8 MB, ~117 KB/trial → how many trials), whether the 400-line rule applies to generated data files;
5. how JS IIFE modules are tested from Node/pytest (G4: Node runner with stub window loading scripts in index.html order);
6. headless Edge self-test: --virtual-time-budget / sync-first, and --user-data-dir inside the scratchpad or project to obey write-only-inside-FYP (G5/G6);
7. montage 2-D coordinates source (G10);
8. [Reset Demo] vs append-only audit log;
9. BUILD PLAN for tonight: builder list with EXCLUSIVE file ownership, order, and stub data so browser builders don't wait on training.

**Hard constraints from the user** (not debatable):
- the mid eval is tomorrow morning;
- Plan B compute (SD with 1 seed; LOSO on T only, 1 seed; partial ablations), with Plan A as a config change afterwards and Plan B numbers labelled PRELIMINARY;
- CPU-only i7-10510U;
- MOABB not installed;
- data downloaded;
- fidelity precedence goes to debate;
- licence default: embed with attribution, pending supervisor confirmation;
- `file://` browser with IIFE modules on `window.SA`;
- local only.

---

## Proposer A (rigor-first)

(proposer A failed)

## Proposer B (demo-first)

(proposer B failed)

## Critic

CRITIC — Debate 6 "architecture-and-modes"

0. PROCEDURAL ATTACKS (target: the debate itself, and both proposers)
0.1 Neither proposer submitted a position: A (rigor-first) and B (demo-first) both failed. There is nothing to rebut, so the judge must not rule "by default" as if the PROMPT §2 layout had been defended. Below I attack the default positions any ruling would fall back on: the PROMPT §2 proposed layout, the briefs' proposals (KG §6, UX §8, errp §11, bci-eeg L7/D2, base-paper §8.4), and the code already on disk. Each attack says which camp it hits: [A] means a rigor-first ruling would make this mistake, [B] a demo-first ruling, [A+B] both.
0.2 Building has started before this ADR exists (verified on disk). Present now: POC/js/dsp/{fft,butterworth,sosfilt,welch,hilbert,integrate}.js (871 lines); research/sfegat/{data,preprocess,graph}.py; research/cache/A01{T,E}_paper.npz; empty research/.cache/parity and research/tests/js_parity/dsp. These already depart from the PROMPT layout: dsp has sosfilt.js and integrate.js (PROMPT lists "butterworth(filtfilt)"), there are two cache dirs (research/cache and research/.cache), and parity tests sit under research/tests/, which PROMPT §3 gives to the SFE-GAT trainer although parity belongs to the Export & parity engineer. The ADR must either ratify these as-built paths or order a refactor. Otherwise two builders will own the same directory tonight, which breaks the exclusive-ownership rule with no git to recover. [A+B]
0.3 Data is complete. Checked: SHA256SUMS exist, all 18 IV-2a files are present, and all 12 BNCI 013-2015 files are present (3,416,997,751 B, log says "DONE"). So "stub data so browser builders don't wait" applies only to trained weights. mi-replay.js and errp-replay.js can be exported from real data right away, and any plan that stubs them is wasted work. [A+B]

1. README VIOLATIONS AND MODE SEMANTICS (Q3)
1.1 The viva default must be Scripted. README §3 is titled "Screen Walkthrough & Evaluation Script" and hard-codes Neural MI (92%), Semantic Context (89%), SPARQL 0.94 and -8.4 µV. CLAUDE §5 puts README first. Replay cannot reproduce those values. A Replay default fails the acceptance box "Every README label, value… matches" at first render. [B, if it argues "real decoding is more impressive, make it the default"]
1.2 The status pill `EEG: Simulation Mode` and the README NOTE ("All EEG signals… are simulated") are literal README text. In Replay mode, showing "Simulation Mode" while decoding real IV-2a EEG breaks CLAUDE §6 ("UI must always say which"). Changing the pill breaks README exactness. The ADR must state the scope: README exactness is guaranteed in Scripted mode starting from the Reset state. In Replay and Synthetic the pill reads, for example, "EEG: Replay Mode (BCI IV-2a A0x, session E)". The README NOTE stays untouched, and the appended Architecture section clarifies it. The self-test must check README strings only in the Scripted/Reset state, or it will fail itself in Replay. [A+B]
1.3 The word "mode" is overloaded. README Screen 1 "Mode Selection" (Visual vs Audio navigation) is unrelated to the decoder mode. A store with a single `mode` key will collide. Require `ui.navMode ∈ {visual, audio}` and `decoder.mode ∈ {scripted, replay, synthetic}`. [A+B]
1.4 Some README initial states are under-specified, and a store schema that defaults them silently is a README violation:
- TV is "Standby", not OFF, so the power enum must be {standby, on}, not a boolean.
- Fan subtitle is "Ceiling Fan: OFF" (upper case) while the speeds are Off/Low/Medium/High, so a display formatter rule is needed.
- AC subtitle "24°C • Cool Mode" does not state power. G9 is unresolved.
- Is the "High-Risk Action Approval Queue: Interactive example… thermal hazard" pre-seeded at reset or empty? If it is empty, a panel member who opens the dashboard first sees no example. This must be ruled explicitly, not left to the UI builder.
[A+B]
1.5 README §4 says "Chrome, Microsoft Edge, or any modern web browser", but every verification step is Edge-only. crypto.subtle on file:// and local voices in Firefox are unverified. Either test in one more browser or record the gap. Do not claim "any modern browser". [A]

2. REPLAY ↔ TOKEN FLOW AND MIS-DECODES (G12)
2.1 Free-running Replay derails the walkthrough. The canonical journey (Hub → Lights → Ceiling → Turn On) needs about 4–6 tokens. At a deployment-subject accuracy of 0.75–0.85 per trial, P(all correct) ≈ 0.85^6 ≈ 0.38 down to 0.75^6 ≈ 0.18. A Replay-driven viva fails most of the time. Any position that runs the README walkthrough end to end in Replay is not viable. [B]
2.2 What I propose the ruling adopt, so it can be attacked: one path, "cued replay".
- input/ emits `token:intent {cls}` from a key or harness button.
- eeg/decoder consumes it:
  - Scripted: passes the class through with the slider confidence.
  - Replay: draws the next held-out session-E trial of the cued class (deterministic round-robin, or the trial-picker override), runs the forward pass, and emits `token:decoded {cls: argmax, conf: max softmax, probs, trueCls, trialId, subject, graphs:A0..A3}`.
  - Synthetic: same as Replay on a generated trial.
- The navigator consumes only `token:decoded`. The decoded class acts, even when it is wrong. That is honest, and it is exactly the error that the policy and ErrP exist to catch.
- The policy's neural score for an action is the `conf` of the SELECT-decoded trial that triggered it.
- If decoded ≠ cued and the result is an action, the harness may optionally suggest "true error → replay an error ErrP epoch". [No ErrP]/[Simulate ErrP] stay operator-driven because the README requires them.
- Label it on screen: "cued replay: operator chooses the cue class; trial drawn from held-out pool". Choosing the cue is an oracle, and hiding that would be dishonest. [A+B]
2.3 Replay must only use session-E trials of the deployment subject, verified with a hash test (bci-eeg L7). The deployment model needs its own run with a session-1 hold-out for temperature scaling (cross-check §1.4, R9). That run is not in Plan B as briefed and must be added to tonight's critical path. If temperature scaling is dropped tonight, say "uncalibrated softmax" in the UI, because a raw softmax shown as "Neural MI 73%" implies calibration. [A+B]
2.4 Trial selection bias. Export about 6 per class (see 4.2). If only correctly classified trials are exported, the demo is cherry-picked, as UX §1 and errp §11 rec 12 warn. Use a seeded, stratified selection. At least one known mis-decode must be visible in the picker. Embed the selection rule, the per-trial correctness and the full session-E accuracy of the deployment subject in the data file and show them. [B]

3. SYNTHETIC MI (G8)
3.1 "The trained model must classify the synthetic trials above chance" cannot be met honestly tonight with a parametric generator: 1/f + alpha/beta + ERD on C3/C4/Cz, mixed for volume conduction. SFE-GAT features are absolute µV² band powers normalised by BN running statistics fitted to one real subject. A generator that is not scale-matched lands outside the BN distribution, and predictions collapse to one class. If someone tunes the generator until the model agrees, that is circular, and it must not be presented as validation. [A, if it demands "above chance" as a gate]
3.2 The alternative also fails. Multivariate Fourier surrogates of real trials (Prichard–Theiler) preserve PSD and cross-spectra, so they would classify, but:
(a) built from session-T trials, they replay the model's own training data;
(b) built from session-E trials, they duplicate Replay;
(c) both are arguably "adaptations" under the NC-ND licence (G11, pending).
Reject this. [B]
3.3 Ruling I would accept: Synthetic is a pipeline and visualisation demonstration with a seeded JS generator in eeg/synth.js. The UI shows "Synthetic EEG — not expected to decode reliably", and accuracy over N generated trials is reported but carries no claim. For tonight it is a harness option labelled "post-mid-eval", or it runs with that disclaimer. It is not a gate. The PROMPT lists three modes, so a missing mode must appear in "unchecked boxes and why", not be quietly half-built. [A+B]
3.4 The same trap exists for ErrP (G7). The Scripted −8.4 µV synthetic epoch must be generated raw and multichannel in the detector's reference scheme (errp §11 option a or c). It must give q > t* on the trained sLDA, and the synthetic no-ErrP epoch must give q < t*. A Node test must check both. The −8.4 must be measured by the JS pipeline from the generated epoch, not printed as a constant. Otherwise "[Simulate ErrP] genuinely detects" is a flag-flip by another name. [B]

4. EXPORT FORMATS, PRECISION, SIZE (G1–G3)
4.1 Float32 vs float64.
- Store weights and samples as Float32 + base64, little-endian, decoded with `atob`, which exists in browsers and in Node 24.
- JS upcasts everything to Float64Array before any DSP or matmul. The existing dsp/*.js are already "float64 ports", which is good.
- The Python parity reference must run model.double() on the float32-rounded weights AND the float32-rounded samples read back from the exported file, not the original float64 .mat data. Otherwise there is a guaranteed ~1e-7 input mismatch, amplified by filtfilt and z-scoring.
- errp's "float64 throughout" is compatible only under this rule.
[A+B]
4.2 Thresholds break 1e-4 parity (G1). A z-scored PLV within about 1e-6 of τ = 0.3, or a P_Â within about 1e-6 of η, flips an edge, and the logits then differ by far more than 1e-4. Required:
(a) stage-wise parity at PLV, H, z, A^(0), A^(1..3) and logits;
(b) a test asserting min|z−τ| and min|P−η| > 1e-6 over the exported trials;
(c) if (b) fails for a trial, drop it from the export with the reason recorded, and keep the drop rate in the manifest.
"Parity passed" without (b) is fragile, because the next re-export can fail at random. [A+B]
4.3 Model-intrinsic hyperparameters must come from the exported manifest, not from SA.config or literals in the JS. That covers τ, strict ">", η, filter order, nperseg, integration rule, bands, residual on/off, weighted vs binary GCN edges, head concat, GATv2 add_self_loops/negative_slope/share_weights, GCN normalisation, class→token map and window. preprocess.py already carries `VARIANTS = {paper, code}`, and fidelity precedence is still being debated (C1–C3). If the JS hard-codes "paper", a Debate-1 ruling or a Plan A re-export silently breaks parity. SA.config keeps the UX, policy and timing tunables. Write this split down, because CLAUDE §3 ("all tunables in SA.config") read literally contradicts it. [A+B]
4.4 Format. Each `POC/js/data/*.js` is:
`/* GENERATED by research/export/<script>.py — do not edit; run-id, plan, preliminary flag, licence/attribution, sha256 of payload */ window.SA=window.SA||{};SA.data=SA.data||{};SA.data.sfegatWeights={manifest:{…tensors:[{name,shape,offset,len}]…, variant:{…}, run:{id, plan:'B', preliminary:true, seed}}, b64:"…"};`
- One concatenated blob per file with offsets. Avoid one base64 string per tensor, which means 40+ strings and error-prone ordering.
- Use PyTorch state_dict names verbatim, so the JS loader fails loudly on any rename (PyG GATv2Conv: lin_l/lin_r/att/bias).
4.5 Size budget (G3, recomputed).
- sfegat-weights: 149,796 params + BN stats ≈ 151k floats ≈ 605 kB ≈ 0.81 MB base64.
- mi-replay: 22×1000×4 B = 88 kB = 117 kB base64 per trial. The ≤ 3 MB cap allows 25 at most. Use 24 (6 per class) unwritten-window, or 20 if the padded [1.5, 6.5) window from bci-eeg D2(b) is ruled in. That window choice changes the export shape, so Debate 1 must fix it before the export format freezes.
- errp-replay: option (c) is about 65 kB base64 per epoch, so about 20 epochs ≈ 1.3 MB. Option (a) at 64 channels allows only about 5.
- errp-model < 5 kB.
- Total ≈ 5 MB. That is acceptable for file:// classic scripts but must be a test-enforced cap.
- Use the same budget for the stubs, so that load-time behaviour is realistic. [A+B]
4.6 The 400-line rule must be ruled inapplicable to generated data files, identified by the GENERATED header. Wrap base64 at a fixed width (e.g. 1000 chars per line) so editors and diffs survive. A 3 MB single line is legal JS but hostile, and a line-count lint that scans data/ will either fail or tempt someone to split data across files. [A]
4.7 Licence. Every data file header and the Replay UI carry the BNCI attribution and "CC BY-NC-ND 4.0 (ErrP) / IV-2a licence [UNVERIFIED] — embedding pending supervisor confirmation". Export raw µV excerpts only; do no filtering in Python before export. This also keeps the JS processing genuine. [B]
4.8 Plan B honesty must be data-driven. The UI and docs read `manifest.run.plan` and `preliminary` and render "PRELIMINARY (Plan B, 1 seed)". A hard-coded string survives a Plan A re-export, and its absence goes unnoticed. If the UI shows any accuracy, it is next to the paper's value and never rounded up. [A+B]

5. JS TESTING FROM NODE/PYTEST (G4)
5.1 Runner: research/tests/js_parity/run.mjs (or .cjs) uses `vm.createContext({})`, sets `ctx.window = ctx`, extracts `<script src>` from POC/index.html with a regex in document order, and loads them with `vm.runInContext`. pytest calls it via `subprocess.run(["node", …], check=True)`, passing paths as arguments and getting logits back as JSON on stdout. The existing IIFEs end with `(typeof window !== 'undefined' ? window : globalThis)`, so this works (checked).
Hidden assumption: index.html also loads ui/*, voice/* and app.js, which touch `document`. The runner must load a whitelisted prefix (core, dsp, eeg, errp, kg, policy, safety, data), and the ADR must make a hard rule: no non-UI module touches document/window DOM APIs at load time. A one-line test can assert this. Without the rule the runner crashes the first time a builder adds a DOM call to policy/. [A+B]
5.2 Node 24 has crypto.webcrypto and atob, so audit-chain and base64 tests run without installs. node --check stays as the syntax gate. `node --test` is built in, so do not install a framework. [A]

6. HEADLESS EDGE SELF-TEST (G5/G6)
6.1 `--dump-dom` serialises at load. Design the self-test sync-first:
- Synchronous checks write `#selftest-report` before load ends.
- Async checks (crypto.subtle digest, timers) append afterwards.
- The final line is a sentinel `SELFTEST-DONE pass=N fail=M`.
- The runner treats a missing sentinel as FAIL, never as pass.
- Add `--virtual-time-budget=10000`. Whether Edge 155 `--headless=new` honours it with `--dump-dom` is UNVERIFIED, and I did not test it because I was told not to write files. It is the first 2-minute task tonight, in the scratchpad.
- Never await `voiceschanged`: headless returned 0 voices synchronously, per UX [LOCAL-TEST].
[A+B]
6.2 `?selftest=1` runs inside the live app and mutates it (tokens, rollback, audit entries). It must end by calling Reset and asserting the post-reset snapshot. Screenshots must use a URL without ?selftest. The self-test must cap the Replay forward passes, e.g. 2 trials, to stay inside the budget. [A]
6.3 `--user-data-dir` is required on every msedge call, for two reasons: CLAUDE §1 (otherwise a profile lands in %LOCALAPPDATA%), and correctness. A headless msedge that shares the default profile with the user's open Edge can hand off to the running instance and exit with empty stdout. Parallel builders running self-tests at the same time on one profile dir hit the Chromium profile lock the same way.
- Use one dir per invocation, e.g. `C:/Users/AK/Documents/FYP/research/.cache/edge-profile-<pid>`, under the project, not POC/, so it is never shipped. The scratchpad is session-specific, and documented commands in docs/verification.md must be re-runnable by the user.
- Clean up afterwards.
[A+B]
6.4 MNE writes ~/.mne config outside FYP by default. Every Python entry point that imports mne (montage export, ErrP epoching) must set MNE_DONTWRITE_HOME=true and MNE_DATA inside research/. This is the same class of violation as G6, and nobody listed it for the export scripts. [A+B]

7. MONTAGE (G10)
7.1 Verified in the venv: MNE 1.13.2 has `colin27_1005`, and `standard_1005` is deprecated ("removed in MNE 1.14"; FutureWarning seen). bci-eeg's colin27_1005 is therefore correct. A builder copying MOABB-era code with 'standard_1005' gets a warning now and a break after an upgrade. [A+B]
7.2 Positions are 3-D (e.g. Cz = 0.0004, −0.0092, 0.1002 m), so a 2-D projection must be chosen and stated: an azimuthal-equidistant projection as in MNE topomaps. Export the 22 IV-2a channels (plus FCz/Cz for the ErrP view) once, via research/export/montage.py, to POC/js/data/montage-data.js with a citation header. brain/montage.js is code only. Do not hand-type coordinates. The paper's Fig. 2a is a row schematic, not true positions, so say "positions: MNE colin27_1005, projected; numbering per paper Fig. 2a". [A]

8. RESET VS APPEND-ONLY AUDIT
8.1 Rule: the audit log is outside "initial state". Reset appends a RESET entry and never truncates. The acceptance self-test compares a deep snapshot of store minus `audit` against `SA.config.initialState`. [A+B]
8.2 Hidden failure mode: in-flight timers. A reset during the ErrP observation window, an approval pending, or a preset saga mid-step lets a scheduled rollback fire after the reset and restore a pre-reset "before" state. All delays must go through SA.clock with cancellable handles, and reset must cancel them all through a `demo:reset` handler. Pending approvals get APPROVAL_CANCELLED audit entries. A self-test must reset during an observation and assert no later mutation. [A+B]
8.3 Reset must reload the canonical TTL (KG §6). That also wipes the ErrP penalties and restores the seeded 6/2/2 recency history. Otherwise the second walkthrough of the viva yields 0.67 instead of 0.94.
Define what Reset does not touch: harness preferences (voice, reduced motion), decoder mode and trial cursor. My position: decoder mode returns to Scripted, because "exact README initial state" includes the pill.
[A+B]
8.4 Async hashing race. crypto.subtle.digest is async. Two appends in the same tick, such as ROLLBACK and ERRP_OBS, both read the same prevHash and fork the chain, so "Chain verified ✓" fails at random. Appends must be serialised through a promise queue. The FNV fallback badge must say "integrity only, not tamper-proof" (UX §8.1). [A+B]

9. MODULE MAP, BUS, STORE, SCREEN GRAPH (Q1)
9.1 The PROMPT layout is mostly sound. Amend it:
- dsp gets sosfilt.js and integrate.js, as already built.
- kg splits sparql into sparql-parser.js and sparql-eval.js (KG D16, about 480 lines combined).
- eeg/decoder.js is the only place that knows the decoder mode.
- input/ never calls eeg/; it emits `token:intent` only.
- montage data moves to data/.
[A]
9.2 Minimum bus catalogue the ADR must freeze, with payloads:
- Tokens: `token:intent`, `token:decoded`.
- Navigation and decisions: `nav:focusChanged`, `screen:changed`, `intent:resolved` (KG result plus the SPARQL text that ran), `policy:decided` (with trace).
- Actions: `action:executed`, `action:confirmed`, `action:rolledBack`, `device:stateChanged`.
- ErrP: `errp:observe:start`, `errp:result {q, t*, label, measured µV, source}`.
- Approvals: `approval:requested`, `approval:resolved`.
- Context and controls: `context:roomChanged`, `decoder:modeChanged`, `harness:set`, `demo:reset`, `audit:appended`, `selftest:done`.
KG §6 already consumes a subset. If those names drift, the KG mirror (KG D5: store authoritative, KG single-writer mirror) diverges silently, so a self-test must assert that the store and the KG agree. [A+B]
9.3 Keyboard routing. The harness has a slider and a room <select>. If either has DOM focus, ←/→/Space/Backspace both change the control and emit a token, so a double action fires mid-demo. Rule:
- one capture-phase keydown handler in input/keyboard.js with preventDefault for the token keys (Space must not scroll, Backspace must not navigate);
- harness controls use tabindex=-1, or the handler ignores events whose target is a harness control;
- patient focus comes from the store, not DOM focus (UX §1 item 8).
[B]
9.4 Screen graph. README defines S1–S6. Fans, AC, TV, Adjust Brightness and Confirm/Pending-approval are PROMPT additions. Give them non-numbered ids (e.g. `devices/fan`) so they are never confused with README "Screen N" labels. BACK at the top level (S1) is a no-op, announced to the user. Do not exit. [A]

10. PYTHON LAYOUT AND PLAN A/B (Q2)
10.1 research/ layout:
- sfegat/{data, preprocess, graph, layers, model, train, evaluate, ablations}.py, with the first three existing;
- errp/;
- export/{sfegat_weights, mi_replay, errp_model, errp_replay, montage}.py;
- configs/{base.yaml, plan_a.yaml, plan_b.yaml, variants/*.yaml};
- tests/{sfegat, errp, export, js_parity}/;
- runs/<run-id>/, which does not exist yet;
- cache/, merging research/.cache/parity into it or documenting both.
The ownership table must split research/tests/ by subdirectory. [A+B]
10.2 Plan A is a config change only if:
(a) plan_*.yaml is a pure overlay (seeds, loso.train_sessions [T] vs [T,E], ablations list) loaded through one `load_config(base, overlay, cli_overrides)`;
(b) the run-id embeds the plan and a hash of the merged config, so Plan A never overwrites Plan B;
(c) metrics.json carries `plan` and `preliminary`, and the report and export read them;
(d) a test asserts that plan_a differs from plan_b only in the allowed keys.
Without (d), someone will "fix" a hyperparameter in plan_a, and A vs B stops being comparable. [A]
10.3 CPU contention tonight. LOSO Plan B is 45–90 min wall with 3–4 single-thread processes (cross-check R4) on a 4C/8T 15 W part, while agents also run node, pytest and Edge. Set torch.set_num_threads(1) and OMP_NUM_THREADS=1 per process, and cap concurrency at 3. Every timing is [EST] until R0 runs. LOSO longer than 15 minutes still needs the user's approval under CLAUDE §1; the computed task's "already decided" does not replace a per-run time estimate. [A+B]

11. BUILD PLAN FOR TONIGHT (Q9) — attacks and required properties
11.1 There is no git, and the demo is in the morning. A builder that breaks index.html at 03:00 kills the viva. Add a "known-good snapshot" step: after each green self-test, the integrator copies POC/ to `C:/Users/AK/Documents/FYP/_snapshots/POC-<time>/` (local, inside FYP, allowed), and the demo runs from the last green snapshot. Neither failed proposer would have had this, and it is the single highest-value item. [A+B]
11.2 The critical path is JS SFE-GAT parity (GATv2/GCN/BN/η semantics plus the threshold margins in 4.2), not training. Order:
(1) Export & parity engineer, within the first hour: export a seeded, untrained model through the real exporter as sfegat-weights.js with `manifest.run.stub=true`, and the UI shows a "STUB WEIGHTS" banner. Real mi-replay.js and errp-replay.js come straight from the downloaded data.
(2) Browser EEG engineer builds against those stubs, and parity runs against the stub weights. Parity does not need trained weights, so it can turn green before training ends.
(3) Deployment run R9, then a re-export.
Cut-off rule: if parity is not green by a fixed time (e.g. 04:00), Replay is shown as "UNVERIFIED — parity pending" or disabled. It is never shown as "in-browser SFE-GAT" without parity. [B]
11.3 Exclusive ownership must include everything outside the PROMPT table:
- POC/js/data/montage-data.js → Export;
- research/tests/js_parity/ → Export;
- research/cache/ → SFE-GAT;
- kg/silentassist.ttl and POC/js/kg/ontology.js, with the identity test → KG;
- docs/architecture.md → orchestrator only, frozen before any builder starts;
- css/tokens.css → UI;
- `SA.config` initialState and the device/preset content → Core, using the KG and policy ADR values. KG D15 and the preset contents are still README-silent decisions.
The orphan that will cause a collision is SA.config: policy, KG, ErrP and UI all want keys in it. Either Core owns one config.js assembled from per-domain sections that each builder hands over in docs/architecture.md, or split into config/{policy,kg,errp,ui}.js, each owned by its domain builder. [A+B]
11.4 Cross-topic dependencies this ADR must not pre-empt: X1–X8 (ErrP→KG mechanism, Semantic 89% definition, tier tables, the X6 high-risk rollback contradiction), C1–C3 fidelity precedence, and the padded window. The architecture must leave hooks (resolver penalty plug-in, policy combine function, variant manifest) rather than hard-code one side. A builder starting tonight before Debates 1, 2, 4 and 5 rule needs these as config or manifest switches. [A+B]

Bottom line: the ruling must (1) make Scripted the viva default, with README exactness scoped to Scripted/Reset; (2) adopt one cued-replay token path where the decoded class acts, labelled, with no cherry-picking; (3) make Synthetic MI a labelled, ungated demonstration (post-mid-eval if needed) while gating the ErrP synthetic epoch with a detector test; (4) read model constants from exported manifests, with a float32-storage, float64-compute rule and threshold-margin parity; (5) exempt generated data files from 400 lines under a test-enforced ≈ 5 MB cap; (6) use a Node vm runner over a DOM-free script prefix; (7) run a sync-first self-test with a DONE sentinel and a per-run --user-data-dir under FYP; (8) take montage from MNE colin27_1005 projected to 2-D; (9) keep the audit append-only with reset cancelling timers; and (10) build in the parity-first order with stub weights, real replay data and green-snapshot copies.



## Rebuttal A

(no rebuttal round for this topic — time-boxed for the mid eval)

## Rebuttal B

(none filed)

---

## Judge's ruling

**Judge:** a fresh, impartial judge with no earlier role in this debate. The full decision text is ADR 0004. This section records **how each critic point was disposed of and why**, plus what I verified myself.

### Procedure

- Neither proposer filed, so I did **not** rule by default for the PROMPT §2 layout. I treated the critic's attacks on the default positions as the record, and I weighed each against the briefs, the accepted ADR 0002 and the files on disk.
- Where a fact was cheap to check, I checked it instead of choosing between assertions.

### Facts the judge verified (2026-10-14)

1. **Headless Edge 155.0.4283.45, scratchpad test page, per-run `--user-data-dir`:**
   - **Without** `--virtual-time-budget`, the dump contained synchronous writes and the resolved `crypto.subtle.digest`, but **not** `setTimeout` callbacks.
   - **With `--virtual-time-budget=10000`, all timers fired** before the dump.
   - A call made without `--user-data-dir` printed "Opening in existing browser session", which confirms the hand-off hazard (critic §6.3).
   - The test profiles were deleted.
2. **Node v24.21.0, `vm` context with `ctx.window = ctx`:** it loaded all six `POC/js/dsp/*.js` files and `POC/js/kg/{turtle,triplestore,sparql}.js` without error, and `atob` and `crypto.subtle` are present. The critic's runner premise (§5.1) holds.
3. **MNE 1.13.2 on Windows:** `_get_extra_data_path` honours `MNE_DONTWRITE_HOME` **only on non-Windows**. On Windows it uses `%USERPROFILE%` unless `_MNE_FAKE_HOME_DIR` is set. The critic's §6.4 remedy would not work here, so it is corrected. No `~/.mne` exists yet.
4. **Measured benchmark** (`research/runs/benchmark-20261014-131237/metrics.json`):
   - SD Plan B ≈ 0.89 h wall;
   - **LOSO-T Plan B ≈ 7.1 h wall** (4 × 1-thread processes);
   - 149,796 params.
   
   This puts real numbers behind critic §10.3.
5. **On-disk state:**
   - DSP files total 889 lines (the critic said 871).
   - `kg/sparql.js` is 448 lines and already exists.
   - Both cache dirs exist.
   - ADR 0002 is accepted and already fixes `node_runner.js`, the ErrP export formats and `errp:observed`.

### Disposition of the critic's points

| # | Critic point | Ruling | ADR ref |
|---|---|---|---|
| 0.1 | No proposer filed; don't rule by default | **Accepted.** Every item was weighed on evidence. | Context |
| 0.2 | Building started before the ADR; ratify or refactor | **Ratify as built.** `sosfilt.js` and `integrate.js` stay; both cache dirs get defined roles; `tests/js_parity/dsp/` goes to the Browser EEG builder and the rest of `js_parity/` to Export. A refactor tonight is pure risk. | D9, D10, D25, D30 |
| 0.3 | Data is complete; stub only the weights | **Accepted.** `mi-replay.js` is real from hour 1, and the weights stub goes through the real exporter. | D41 |
| 1.1 | Scripted is the viva default | **Accepted.** | D1 |
| 1.2 | Pill vs README NOTE; scope README exactness | **Accepted.** The pill is mode-specific outside Scripted; the NOTE is untouched and explained in the README appendix; the README-string check runs only in Scripted/Reset. | D1, D3, D31 |
| 1.3 | "mode" is overloaded | **Accepted.** `decoder.mode` vs `ui.navMode`. | D2 |
| 1.4 | Under-specified initial states (TV enum, fan "OFF", AC power, approval queue) | **Accepted with values.** TV enum `standby/on`; a display formatter handles `OFF`; AC power `on` is *provisional*, pending the KG/UX ADRs; the approval queue is **pre-seeded with a labelled example**. | D15 |
| 1.5 | "Any modern browser" is unverified | **Accepted.** Edge is the verified browser; the gap is recorded in `verification.md`; README §4 is not edited. | D33 |
| 2.1 | Free-running Replay derails the walkthrough | **Accepted** (the arithmetic checks: 0.75⁶ ≈ 0.18, 0.85⁶ ≈ 0.38). | D1, rejected alternatives |
| 2.2 | One "cued replay" path; the decoded class acts; labelled | **Accepted and extended to all three modes.** Names follow the UX inputs (`input:token`, then `eeg:decoded`). A pinned trial overrides the cue. | D4 |
| 2.2 | Policy neural score = conf of the triggering SELECT | **Accepted, with an added rule:** the policy is blind to `trueCls`/`correct`, enforced by a test. | D5 |
| 2.3 | Session-E-only replay with a hash test; deployment run with calibration | **Accepted.** The hash test is in the exporter tests. The deployment and temperature design belongs to the replication ADR; the UI says "uncalibrated softmax" if the manifest has no temperature. | D4, D21 |
| 2.4 | Selection bias: stratified, mis-decodes visible | **Accepted in substance.** The rule is the first 5 per class passing the numerical guard, never filtered by correctness, with per-trial ✓/✗ and full session-E accuracy shown. I did not adopt the critic's "seeded random" draw: trial order is equally neutral and simpler to audit. Forcing a mis-decode in is rejected as bias the other way; at a plausible accuracy, P(no error in 20) is negligible, and if it happens it is disclosed. | D21 |
| 3.1 | An "above chance" gate for Synthetic is circular | **Accepted.** No gate. The scale is matched to session-T band-power medians, a principled match that is not tuned on model output. | D7 |
| 3.2 | Reject surrogates | **Accepted.** | rejected alternatives |
| 3.3 | Synthetic is labelled and ungated, post-mid-eval if needed | **Accepted.** Tier 3 tonight, otherwise disabled and listed. | D7, D41 |
| 3.4 | Synthetic ErrP must pass the trained detector | **Already settled by ADR 0002 D21/D22.** Not reopened. | — |
| 4.1 | Float32 storage, float64 compute; Python reads the shipped bytes | **Accepted.** | D19 |
| 4.2 | Threshold margins and stage-wise parity | **Accepted.** Margin 1e-6, exclusion with reason, re-run on every export. | D20 |
| 4.3 | Model constants from the manifest, not `SA.config` | **Accepted**, recorded as a clarification of CLAUDE §3. | D17 |
| 4.4 | Format: one blob plus a tensor table, `state_dict` names | **Accepted for weights.** Replay files use one string per record, matching the ADR 0002 ErrP format. | D18 |
| 4.5 | Size budget | **Accepted, recomputed against ADR 0002.** errp-replay is 2.6 MB under ADR 0002 (CAR-64), not the critic's 1.3 MB option (c). MI at **5 per class** fits 3 MB under either window. The total cap is 6.6 MB, not 5 MB. | D21, D23 |
| 4.6 | 400-line rule exempt for generated files; wrap base64 | **Accepted.** Wrap at 1000 chars; hand-written files have a 450 hard cap with a 400 target. | D11, D18 |
| 4.7 | Licence header; raw µV only | **Accepted.** | D21, D24 |
| 4.8 | Data-driven PRELIMINARY label | **Accepted**, plus a `STUB WEIGHTS` banner. | D22 |
| 5.1 | Node vm runner; DOM-free at load | **Accepted, generalised.** Instead of a whitelisted prefix, **no module may touch the DOM at load time**, and the runner loads every script and fails on a violation. The single runner is ADR 0002's `research/export/node_runner.js`. | D11, D29 |
| 5.2 | `node --test`, no installs | **Accepted.** | D29 |
| 6.1 | Sync-first selftest, sentinel, virtual time budget | **Accepted and verified** (the budget works on Edge 155). | D31, D32 |
| 6.2 | Selftest ends with Reset; cap forward passes | **Accepted.** | D31 |
| 6.3 | Per-invocation `--user-data-dir` under FYP | **Accepted.** `research/.cache/edge-profile/<tag>-<pid>`, deleted after each run. | D32 |
| 6.4 | MNE home writes | **Accepted in aim, corrected in means:** `_MNE_FAKE_HOME_DIR`, not `MNE_DONTWRITE_HOME` (verified). | D38 |
| 7.1–7.2 | colin27_1005; projected 2-D; exported, never hand-typed | **Accepted.** The 22 IV-2a channels already include every ErrP feature channel. | D34 |
| 8.1 | Audit outside the initial state | **Accepted.** | D35 |
| 8.2 | In-flight timers survive reset | **Accepted.** `SA.clock` handles, `cancelAll`, grep-forbidden raw `setTimeout`, and a reset-mid-observation selftest. | D36 |
| 8.3 | Reset reloads the TTL; decoder back to Scripted | **Accepted.** `prefs.reducedMotion` is preserved (residual dissent 2). | D36 |
| 8.4 | Async hashing race | **Accepted.** Promise queue. | D37 |
| 9.1 | Module-map amendments | **Accepted**, plus `config/`, `core/b64`, `core/reset`, `eeg/tensor`, `safety/episode`, `ui/screen-graph`, `ui/format` and `selftest/cases/`. The `sparql.js` split is post-mid-eval (448 lines < 450). | D9 |
| 9.2 | Freeze the bus catalogue; store/KG agreement test | **Accepted.** UX-input names are adopted; the KG brief's `errp:detected` gives way to ADR 0002's `errp:observed`. | D13 |
| 9.3 | Keyboard routing vs harness controls | **Accepted** as in the UX input: capture phase; buttons get `tabindex=-1` plus `mousedown` preventDefault; form controls refocus; letter keys always work. Detail is owned by the UX ADR. | D9 (UI owner), UX ADR |
| 9.4 | Non-numbered ids for added screens; BACK at S1 is a no-op | **Accepted.** | D16 |
| 10.1 | Python layout; split tests by owner | **Accepted**, with ownership **by file path** (D30), because ADR 0002 already fixed flat `test_errp_*.py` names. | D25, D30 |
| 10.2 | Plan overlay rules (a)–(d) | **Accepted.** The loader itself rejects disallowed keys, and a test also asserts it. | D26, D27 |
| 10.3 | CPU contention; approvals | **Accepted** with measured numbers. LOSO-T ≈ 7.1 h still needs explicit user approval. | D28 |
| 11.1 | Green snapshots | **Accepted.** The demo runs from `LAST_GREEN`. | D41, D42 |
| 11.2 | Parity-first order with stub weights; cut-off | **Accepted.** The cut-off is **02:00** rather than 04:00, to leave margin before the 05:00 freeze. | D41, D42 |
| 11.3 | Ownership gaps; the `SA.config` orphan | **Accepted.** Per-owner `config/*.js` files; full ownership table. | D17, D40 |
| 11.4 | Don't pre-empt sibling debates; leave hooks | **Accepted.** | D39 |

### Where I departed from the critic, and why

1. **Runner scope (5.1).** A universal no-DOM-at-load rule beats a whitelist. It is simpler to state, the runner itself enforces it, and screen-graph and format helpers (UI-owned but DOM-free) become Node-testable.
2. **Trial selection (2.4).** The first passing trials in file order instead of a seeded random draw. Both are neutral; trial order is easier to audit and matches the replication inputs.
3. **Size cap (4.5).** 6.6 MB, not ≈ 5 MB, because ADR 0002 (accepted) set errp-replay at 2.6 MB with CAR-64. I do not reopen ADR 0002 without new evidence.
4. **MNE variable (6.4).** Verified wrong for Windows. Replaced.
5. **Cut-off time (11.2).** Earlier, at 02:00.

### Blocking item for the user (via the orchestrator)

- LOSO-T Plan B is measured at ≈ 7.1 h wall (4 × 1-thread). CLAUDE.md §1 requires approval with an estimate for any run over 15 min. Started at about 19:00, it would end at about 02:00 if nothing else competes, which it will. The per-unit resume (D26) makes a partial result reportable.
