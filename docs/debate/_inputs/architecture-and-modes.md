# Raw debate inputs: architecture-and-modes
(Collected from the workflow journal; agents not listed failed with network errors.)

=== critique:architecture-and-modes ===

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

Files referenced: C:/Users/AK/Documents/FYP/README.md, C:/Users/AK/Documents/FYP/PROMPT.md, C:/Users/AK/Documents/FYP/CLAUDE.md, C:/Users/AK/Documents/FYP/docs/research/_cross-check.md, C:/Users/AK/Documents/FYP/POC/js/dsp/*.js, C:/Users/AK/Documents/FYP/research/sfegat/{data,preprocess,graph}.py, C:/Users/AK/Documents/FYP/research/data/bnci2015_013/SHA256SUMS.txt.