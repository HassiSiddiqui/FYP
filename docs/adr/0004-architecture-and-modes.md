# ADR 0004 — Software architecture, decoder modes, export formats, verification harness, and tonight's build plan

**Status:** Accepted 2026-10-14 (fresh-judge ruling on the `architecture-and-modes` debate; transcript: `docs/debate/architecture-and-modes.md`).
**Scope:** browser module map and load order, `SA.bus` event catalogue, `SA.store` schema and write ownership, screen graph, `SA.config` layout; Scripted / Replay / Synthetic decoder modes (including G8 and G12); export file formats, precision and size budgets (G1–G3); Python package layout and the Plan A/B config mechanism; Node and pytest testing of IIFE modules (G4); the headless Edge self-test (G5/G6); montage coordinates (G10); `[Reset Demo]` vs the append-only audit log (cross-check §1.5); and the exclusive-ownership build plan for tonight.
**Plan:** Plan B tonight (mid evaluation 2026-10-15). Every model-derived number shown tonight is labelled **PRELIMINARY (Plan B, 1 seed)**, and the label is read from data, not hard-coded (D22). Plan A is a config overlay change (D27).

---

## Context

- **Debate outcome.** Both proposers (A rigor-first, B demo-first) failed to file, and there was no rebuttal round. Only the critic filed. So this ruling is **not** a default win for the PROMPT §2 layout: each item below was weighed against the briefs, the critic and the files on disk, and was verified where that was cheap.
- **Facts I verified myself (2026-10-14, 15:30–15:45):**
  1. **Headless Edge 155.0.4283.45** (`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`). I used a scratchpad test page with a per-run `--user-data-dir`.
     - `--dump-dom` **without** `--virtual-time-budget` captured synchronous writes and a resolved `crypto.subtle.digest`, but **not** `setTimeout` callbacks (500 ms, 2000 ms).
     - **With `--virtual-time-budget=10000`, every timer fired** before the dump.
     - A call made without `--user-data-dir` printed "Opening in existing browser session", i.e. it handed off to the user's running Edge. This confirms the critic's §6.3 hazard.
     - Both test profiles were deleted afterwards.
  2. **Node v24.21.0.** A `vm` context with `ctx.window = ctx` loads every existing IIFE (`POC/js/dsp/*.js`, `POC/js/kg/{turtle,triplestore,sparql}.js`) without error and registers `SA.dsp.{fft, butter, sosfilt, sosfiltZi, sosfiltfilt, welch, hilbert, integrate, bandPower, …}` and `SA.kg.{term, turtle, store, sparql}`. `atob` and `crypto.subtle` exist in Node 24.
  3. **MNE on Windows ignores `MNE_DONTWRITE_HOME`.** `mne/utils/config.py::_get_extra_data_path` reads it only in the non-`nt` branch. On Windows the home is `%USERPROFILE%` unless **`_MNE_FAKE_HOME_DIR`** is set. This corrects the critic's §6.4. No `~/.mne` or `%APPDATA%/.mne` exists yet, so no violation has occurred.
  4. **Measured training cost** (`research/runs/benchmark-20261014-131237/metrics.json`):
     - 149,796 params;
     - SD, one subject, 500 epochs ≈ 8.3 min at 4 threads;
     - SD Plan B, 9 subjects ≈ **0.89 h** wall as 4 × 1-thread processes;
     - LOSO-T Plan B, 9 folds × 500 epochs ≈ **7.1 h** wall as 4 × 1-thread processes;
     - dense vs PyG logits differ by 1.2e-7.
  5. **On-disk state:**
     - `POC/js/dsp/` has `fft, butterworth, sosfilt, welch, hilbert, integrate` (889 lines). Its parity report is at `research/.cache/parity/dsp_parity_report.json` (tol 1e-9).
     - `POC/js/kg/` has `turtle` (377), `triplestore` (310) and `sparql` (448).
     - `research/sfegat/` has `{data, preprocess, graph}.py`, with `VARIANTS = {paper, code}`.
     - Both caches exist: `research/cache/` (feature `.npz`) and `research/.cache/` (pip, tmp, parity).
     - All 18 IV-2a files and all 12 BNCI 013-2015 files are present with SHA256SUMS.
- **Accepted ADR 0002 already fixes:**
  - `errp-model.js` / `errp-replay.js` formats (errp-replay ≤ 2.6 MB, 8 epochs of 64 × 922);
  - `research/export/node_runner.js`;
  - `research/export/export_errp.py`;
  - the `errp:observed` event;
  - the synthetic ErrP epochs being generated in Python;
  - "Reset clears ErrP memory".

  This ADR conforms to all of them. The one naming alignment is D10.
- **Sibling debates not yet ruled:**
  - replication fidelity: C1–C3, window, deployment subject;
  - KG and policy: X1–X4, X8, initial-state facts;
  - assistive UX: per-screen token grammar, G9.

  This ADR leaves **hooks**, not answers, for those (D17, D21, D39).

---

## Decision

### A. Decoder modes (Q3, G8, G12)

**D1. Scripted is the viva default and the Reset state.**
- README exactness is guaranteed **in Scripted mode from the Reset state**:
  - every README label, value, initial state and shortcut;
  - MI 92 %, Semantic 89 %, SPARQL 0.94, −8.4 µV.
- The README-string selftest runs only in that state: at boot and again after its final Reset.

**D2. Mode is named `decoder.mode ∈ {'scripted','replay','synthetic'}`. It is distinct from `ui.navMode ∈ {null,'visual','audio'}`** (README Screen 1 "Mode Selection"). No store key is called plain `mode`.

**D3. The status pill and labelling.**
- Scripted shows the README-literal `EEG: Simulation Mode`.
- Replay shows `EEG: Replay Mode (BCI IV-2a A01, session E)`, with the subject read from the manifest.
- Synthetic shows `EEG: Synthetic Mode (generated, seed n)`.
- The README NOTE is left untouched. The appended README "Architecture" section explains that the NOTE describes the default Scripted mode.
- `Environment: Smart-Home Simulator` never changes.

**D4. One token path for all modes: "cued decoding".**
1. `input/*` emits `input:token {cls, token, source}` only. It never calls `eeg/`.
2. `eeg/decoder.js` is the **only** module that knows `decoder.mode`. It consumes `input:token` and emits exactly one `eeg:decoded`:
   - **Scripted:** `cls = cued`, `conf = store.decoder.sliders.neural` (default 0.92), `probs = null`, `trial = null`.
   - **Replay:** draws the next held-out trial of the **cued** class from `SA.data.miReplay`, using a deterministic per-class round-robin cursor stored in `decoder.cursor`.
     - If the operator pinned a trial in the picker, that trial is used instead, and the cue becomes that trial's true class. The pin clears after use.
     - The decoder runs the in-browser SFE-GAT forward pass and emits `cls = argmax`, `conf = max softmax` (temperature-scaled if `manifest.calibration.temperature` exists, otherwise labelled "uncalibrated softmax"), `probs[4]`, `trial {id, subject, session, index, trueCls}`, `correct = (argmax === trueCls)`, and `graphs {A0..A3}` (edge lists).
   - **Synthetic:** the same as Replay, on a trial from `eeg/synth.js` (D7). `trueCls` = the generating class.
3. `ui/navigator.js` consumes **only** `eeg:decoded`. **The decoded class acts, even when it is wrong.** A mis-decode moves the cursor or selects for real.
4. The harness and the S4 telemetry show `Cue: Both Feet · Decoded: Both Feet (SELECT) ✓ · A01E trial #17 · p = 0.73`. The harness caption reads: "cued replay: the operator chooses the cue class; the trial is drawn from the held-out pool".

**D5. The policy and a mis-decoded trial (G12).**
- The neural score `n` for an action is the `conf` of the `eeg:decoded` SELECT that triggered it.
- The policy is **blind to the truth**. `safety/episode.js` strips `trueCls` and `correct` before calling `SA.policy.decide`, and a Node test asserts that the decide input has no such keys.
- `trueCls` and `correct` are written to the audit entry as operator-side metadata (`actor: 'operator-harness'`).
- If an action is triggered by a decode with `correct === false`, the harness shows the hint: `Decoded ≠ cue: this is a genuine error. [Simulate ErrP] replays an error epoch.`
  - ErrP is **never** auto-linked to the MI trial, because the epochs come from a different dataset and subject.
  - The S5 caption states the two identities, per ADR 0002 D11.
- In Replay and Synthetic, the Neural slider is disabled (captioned "set by decoder").
- Where the semantic score comes from (slider vs KG `semanticConfidence`) is the KG/policy ADR's call (X4). The architecture provides both: `kg:resolved.semanticConfidence` is always emitted, and `store.decoder.sliders.semantic` exists.

**D6. ErrP epoch source by mode.** This refines ADR 0002 D23 for Replay only.
- Scripted and Synthetic: `[Simulate ErrP]` / `[No ErrP]` run the ADR 0002 synthetic error / correct epochs.
- Replay: `[Simulate ErrP]` takes the next **real** error epoch (round-robin TP, TP, FN), and `[No ErrP]` takes the next **real** correct epoch (TN, TN, FP). Both come from `SA.data.errpReplay`, and an epoch picker can pin one.
- The ErrP auto-confirm toggle always uses the synthetic-correct epoch, as in ADR 0002 D23.
- A FN epoch shows "detector disagreed" (ADR 0002 D22). It never forces a rollback.

**D7. Synthetic MI (G8): a labelled, ungated pipeline demonstration.**
- `POC/js/eeg/synth.js`, seeded `mulberry32(SA.config.eeg.synth.seed + k)`. Each trial is 22 ch × 1000 samples at 250 Hz, built from:
  - per-channel 1/f background, shaped in frequency with `SA.dsp.fft`;
  - mu (10 ± 1 Hz) and beta (20 ± 2 Hz) oscillators with random phase drift;
  - class ERD as a 50 % amplitude reduction of mu/beta:
    - left → C4, C2, C6, FC4, CP4;
    - right → C3, C1, C5, FC3, CP3;
    - feet → Cz, FCz, CPz, C1, C2;
    - tongue → bilateral C5, C6, CP3, CP4 (labelled "illustrative");
  - volume conduction: a row-normalised Gaussian kernel (σ = 30 mm) on the 3-D electrode distances from `SA.data.montage`;
  - scale: per channel × band, matched to `sfegatWeights.manifest.norm.trainBandPowerMedian` (22 × 8, computed by the exporter from the deployment subject's **session T only**).
- **No accuracy gate.** The generator is never tuned against model output.
  - The UI caption reads `Synthetic EEG — not expected to decode reliably; accuracy on 40 seeded trials: x % (no claim)`.
  - That number is computed live, once, on first entry to the mode.
- Node tests cover only determinism (same seed gives identical samples) and that the ERD direction is present (cued-hemisphere mu power < contralateral).
- Tonight it is **tier 3** (D41). If it is not built, the mode option renders disabled as `Synthetic (post-mid-eval)` and appears in "unchecked boxes and why".

**D8. Brain-graph view in Scripted mode.**
- It animates the A0→A3 graphs of a fixed exemplar trial (`miReplay.manifest.exemplarId`, set by the exporter to the first SELECT-class trial in the file).
- Caption: `Illustrative: BCI IV-2a A01 session E trial #k — Scripted mode does not decode EEG`.
- The forward pass is computed lazily, on the first view.

### B. Browser module map, load order, isolation rules (Q1)

**D9. Module map.** This is the PROMPT §2 layout with the amendments marked ✚. Every file is a classic IIFE ending `})(typeof window !== 'undefined' ? window : globalThis);`.

| Dir | Files (load order within dir) | Namespace | Owner |
|---|---|---|---|
| `core/` | `namespace, bus, store, clock, b64 ✚, reset ✚` | `SA.bus, SA.store, SA.clock, SA.core.b64, SA.core.reset` | Core |
| `config/` ✚ | `initial-state, ui, kg, policy, eeg, errp` | `SA.config.{initialState, ui, kg, policy, eeg, errp}` | per file (D17) |
| `data/` | `montage-data ✚, sfegat-weights, mi-replay, errp-model, errp-replay` (GENERATED) | `SA.data.{montage, sfegatWeights, miReplay, errpModel, errpReplay}` | Export |
| `dsp/` | `fft, butterworth, sosfilt ✚, welch, hilbert, integrate ✚` (as built) | `SA.dsp.*` | Browser EEG |
| `eeg/` | `tensor ✚, plv, graph, psd-features, gatv2, gcn, batchnorm, gae, sfegat, synth, decoder` | `SA.eeg.*` | Browser EEG |
| `errp/` | `features, classifier, detector, memory, synth` (ADR 0002 D24) | `SA.errp.*` | Browser EEG |
| `kg/` | `ontology, turtle, triplestore, sparql, resolver, kg-view` | `SA.kg.*` | KG |
| `brain/` | `montage, brain-graph-view` | `SA.brain.*` | Browser EEG |
| `policy/` | `risk, policy` | `SA.policy.*` | Policy & safety |
| `safety/` | `audit, rollback, approvals, episode ✚` | `SA.safety.*` | Policy & safety |
| `voice/` | `speech` | `SA.voice` | UI |
| `input/` | `tokenbus, keyboard, harness-input` | `SA.input.*` | UI |
| `ui/` | `screen-graph ✚, format ✚, navigator, render, components/*, screens/*` | `SA.nav, SA.ui.*` | UI |
| `selftest/` | `selftest` (runner), `cases/<domain>.js` ✚ | `SA.selftest` | runner: Core; each case file: its domain owner |
| — | `app.js` | `SA.app.start()` | Core |

- **`index.html` load order is the table order:** core/namespace → config → rest of core → data → dsp → eeg → errp → kg → brain → policy → safety → voice → input → ui → selftest → app.js.
- **Core writes the full `<script>` list once**, from the file lists declared in `docs/architecture.md`.
- **Every builder creates every declared file within 15 minutes**, even as a stub IIFE that only registers its namespace, because a missing script is a console error.
- A new file needs a one-line request to Core.
- `kg/sparql.js` (448 lines) is grandfathered. Its split into `sparql-parser.js` + `sparql-eval.js` (KG D16) is post-mid-eval.
- `safety/episode.js` is the per-action pipeline state machine:
  1. `ui:actionRequested`
  2. `SA.kg.resolve`
  3. `SA.policy.decide`
  4. confirm / caregiver / execute
  5. ErrP observe
  6. outcome

**D10. As-built DSP names are canonical.**
- Use `SA.dsp.butter` (design), `SA.dsp.sosfilt`, `SA.dsp.sosfiltZi`, `SA.dsp.sosfiltfilt` and `SA.dsp.welch`.
- ADR 0002 D24's `SA.dsp.butterworth.sosfilt` reads as `SA.dsp.sosfilt`. This is editorial, not a reopening.
- **Runtime filters use exported `sos` coefficients from the manifests.** JS `SA.dsp.butter` is kept as a cross-check only: a Node test asserts that it matches the exported `sos` to 1e-12.

**D11. Isolation rules** (each one is enforced by a test).
1. **No module touches `document`, `navigator`, `localStorage` or DOM APIs at load time.**
   - DOM work happens only inside functions called after `SA.app.start()` (on `DOMContentLoaded`).
   - Test: `node_runner.js load-only` loads **all** scripts in `index.html` order into a DOM-less `vm` context. Any load-time DOM access throws and names the file.
   - This replaces the critic's whitelist-prefix idea: one rule for every file.
2. UI modules (`ui/`, `input/`, `voice/`, `brain/brain-graph-view`, `kg/kg-view`) read `SA.store` and `SA.bus` only. They never call `SA.eeg/errp/kg/policy` internals.
   - Domain modules may call each other's **public** APIs as listed in `docs/architecture.md`: `SA.kg.resolve`, `SA.policy.decide`, `SA.errp.detector.observe`, `SA.eeg.decoder.forward`, `SA.safety.audit.append`.
   - A grep test rejects `SA.(eeg|errp|kg|policy)\.` inside `ui/`, `input/` and `voice/`, except for `SA.kg.view` mounting by `ui/screens/s4-actions.js`.
3. No ES modules, `fetch`, `import(`, `XMLHttpRequest`, CDN URLs or web fonts. Enforced by a grep test.
4. Hand-written JS: 400 lines is the target, and the test fails above **450**. Generated `data/*.js` files (header line 1 contains `GENERATED`) are exempt.

### C. Bus event catalogue (frozen; payloads are the minimum, extra fields allowed)

**D12. `SA.bus` semantics.**
- Synchronous dispatch in subscription order.
- An `emit` made during a dispatch is **queued FIFO** and drained after the current dispatch, so ordering is deterministic.
- A handler exception is caught, `console.error`-ed and counted by the selftest (it fails the zero-console-errors box).
- API: `on(evt, fn) → off`, `once`, `emit(evt, payload)`.

**D13. Catalogue.**

| Event | Payload | Emitter (only) | Main consumers |
|---|---|---|---|
| `input:token` | `{cls:'left'|'right'|'feet'|'tongue', token:'PREV'|'NEXT'|'SELECT'|'BACK', source:'keyboard'|'operator'|'auto', ts}` | `input/tokenbus` | eeg/decoder |
| `eeg:decodeStart` | `{mode, cuedCls, trialId}` | eeg/decoder | brain view |
| `eeg:decoded` | `{token, cls, cuedCls, conf, probs, calibrated, mode, trial, correct, graphs}` | eeg/decoder | ui/navigator, brain view, harness |
| `decoder:modeChanged` | `{mode, prev}` | eeg/decoder | ui, selftest |
| `harness:set` | `{key, value}` (keys: `decoder.mode`, `decoder.sliders.*`, `decoder.pin`, `errp.pin`, `context.activeRoom`, `prefs.*`) | input/harness-input | the slice owner applies it |
| `ui:focusChanged` | `{screen, index, itemId}` | ui/navigator | voice, kg-view |
| `ui:screenChanged` | `{from, to}` | ui/navigator | voice, selftest |
| `ui:actionRequested` | `{target:{kind:'device'|'preset', id}, command, args, decodeRef}` | ui/navigator | safety/episode |
| `ui:confirmAccepted` / `ui:confirmCancelled` / `ui:requestWithdrawn` | `{episodeId}` | ui/navigator | safety/episode |
| `ui:outcomeChoice` | `{episodeId, choice:'retry'|'home'}` | ui/navigator | safety/episode |
| `ui:dashboardToggled` | `{open}` | ui/navigator | caregiver screen |
| `caregiver:approve` / `caregiver:reject` | `{approvalId}` | ui (caregiver screen) | safety/approvals |
| `kg:resolved` | `{episodeId, intentLabel, ranked[{id,label,score,features,modifiers}], query:{text, elapsedMs}, semanticConfidence, explanation[]}` | kg/resolver | episode, S4 panel, kg-view |
| `policy:decided` | `{episodeId, decision:'EXECUTE'|'CONFIRM'|'REJECT'|'CAREGIVER', n, s, c, tier, trace[]}` | policy/policy | episode, S4 panel, audit |
| `action:executed` | `{episodeId, sagaId, steps[{deviceId, before, after}], actor}` | safety/rollback | kg mirror, audit |
| `device:stateChanged` | `{deviceId, before, after, cause}` | safety/rollback | kg mirror, ui |
| `errp:observeStart` | `{episodeId, epochId, source:'synthetic'|'replay', costClass, tier, pi, durationMs}` | safety/episode | S5 radar |
| `errp:observed` | ADR 0002 D24 `observe()` result `+ {episodeId, epochId, source}` | errp/detector | episode, errp/memory, kg mirror, audit, gauges |
| `action:confirmed` / `action:rolledBack` / `action:flagged` | `{episodeId, sagaId, steps?, reason?}` | safety/rollback (rolledBack), safety/episode (confirmed, flagged) | kg mirror, audit, ui |
| `approval:requested` / `approval:resolved` | `{approvalId, action, reason, seeded}` / `{approvalId, outcome:'approved'|'rejected'|'cancelled', actor}` | safety/approvals | caregiver screen, voice, episode |
| `context:roomChanged` | `{room, prev, source}` | input/harness-input | kg mirror |
| `voice:say` | `{display, speech, priority}` | any UI/domain module | voice/speech (+ the aria-live mirror) |
| `audit:appended` / `audit:verified` | `{seq, type, hash}` / `{ok, brokenAt, algo:'SHA-256'|'FNV-1a'}` | safety/audit | caregiver screen |
| `store:changed` | `{path, by}` | core/store | ui/render |
| `demo:reset` | `{resetSeq}` | core/reset (last step) | every module that holds private state |
| `selftest:done` | `{pass, fail}` | selftest | — |

- KG brief names are superseded: `errp:detected` → `errp:observed` (decision ∈ {rollback, flag}). UX input names (`input:token`, `ui:*`, `caregiver:*`, `voice:say`) are adopted as they are.
- **Selftest:** after the canonical journey, after a rollback and after a reset, the store's `devices` and `context` equal the KG mirror's state triples (the store is authoritative, the KG a single-writer mirror, KG D5).

### D. Store schema and write ownership

**D14. `SA.store` API.**
- `get(path)`, `set(path, value, by)`, `patch(path, partial, by)`, `snapshot()` (deep clone), `reset()` (deep clone of `SA.config.initialState`), `own(slice, by)`.
- `set`/`patch` throw if `by` is not the registered owner of the top-level slice.
- Every write emits `store:changed`.

**D15. Schema and owners.** Initial values live in `config/initial-state.js`. README-silent values are **provisional** and are overridden by the KG/policy and UX ADRs without code changes.

| Slice | Shape (initial value) | Sole writer |
|---|---|---|
| `ui` | `{screen:'S1', focus:{S1:0}, focusMemory:{}, subState:'list', dashboardOpen:false, navMode:null, graphTab:'brain', graphTabPinned:false}` | ui/navigator |
| `prefs` | `{voice:false, decodeAnimation:true, errpAutoConfirm:false, reducedMotion:<from prefers-reduced-motion>}` | input/harness-input (ui/navigator sets `voice` on the S1 select, UX) |
| `decoder` | `{mode:'scripted', sliders:{neural:0.92, semantic:0.89}, cursor:{left:0,right:0,feet:0,tongue:0}, pin:null, errpCursor:{error:0, correct:0}, errpPin:null, last:null}` | eeg/decoder (`errp*` keys: safety/episode) |
| `context` | `{activeRoom:'MasterBedroom', user:'Patient'}` | input/harness-input |
| `devices` | `BedroomCeilingLight {kind:'light', room:'MasterBedroom', power:'off', brightness:100}`, `BedsideLamp {… power:'off'}`, `LivingRoomLight {room:'LivingRoom', power:'on'}`, `CeilingFan {speed:'off'}` (enum off/low/medium/high), `AirConditioner {power:'on'*, setpoint:24, mode:'cool'}` (enum cool/fan/dry), `SmartTV {power:'standby', channel:1*, volume:20*}` (enum standby/on). `*` = provisional (G9). Rooms of the fan/AC/TV come from the KG ADR | safety/rollback |
| `episode` | `{id:null, phase:'idle'}`. Phases: idle, resolving, deciding, confirm, pendingCaregiver, executing, observing, outcome | safety/episode |
| `approvals` | `[{id:'ap-seed-1', seeded:true, action:{device:'AirConditioner', command:'SetTemperature', value:16}, reason:'thermal hazard < 18 °C', status:'pending'}]` | safety/approvals |
| `errp` | `{memory:[]}` (ADR 0002 D18) | errp/memory |
| `telemetry` | `{n:null, s:null, c:null, q:null, lastDecision:null}` | safety/episode |

- **Store ids equal KG local names** (`sa:BedroomCeilingLight` ↔ `BedroomCeilingLight`), so the mirror is a direct mapping.
- The audit chain is **not** in the store (D35).
- **The seeded approval** makes the README's "Interactive example … thermal hazard" visible on the first dashboard open. Its card is labelled `Example request (seeded by Reset Demo)`. Approving it runs the real path (actuation, ErrP observation, audit). Its audit entries carry `seeded:true`.
- All display strings come from pure, DOM-free `SA.ui.format.*` functions and `SA.config.ui.strings`. Examples: `Ceiling Fan: OFF` (upper-case OFF in the subtitle), `24°C • Cool Mode`, `Smart TV: Standby`, `1 Active of 3`.

### E. Screen graph

**D16. Screen graph.** Declarative, in `ui/screen-graph.js` → `SA.nav = {graph, shortestPath(from, to)}` (DOM-free; used by ADR 0002 D12's cost BFS).
- README screens keep the ids `S1`…`S6`. PROMPT additions get **non-numbered** ids: `fan`, `ac`, `tv`, `brightness`. The caregiver dashboard is an overlay, `caregiver`, outside the patient graph.
- Primary edges:
  - `S1 –SELECT→ S2` (sets `ui.navMode`);
  - `S2 → S3 | fan | ac | tv | S6`;
  - `S3 –fixture→ S4`;
  - `S4 –Adjust Brightness→ brightness`;
  - any action → episode → `S5`;
  - `S5 → S4 | S2` per outcome;
  - `S6 → S5` (preset episode).
- Episode sub-states (`confirm`, `pendingCaregiver`, `observing`, `outcome`) render on the current screen; they are not separate nodes.
- **BACK on S1 is a no-op** that says "Already at the top".
- Per-screen token grammar, wrap-around and pre-focus belong to the assistive-UX ADR. They are data in this graph, not navigator code.

### F. Config

**D17. Config layout.** `SA.config` is split across `POC/js/config/*.js`, one file per owner. It is deep-frozen by `SA.app.start()`. Runtime-adjustable values (sliders, toggles, room) live in the **store**, never in config.
- `initial-state.js` (Core): the D15 store.
- `ui.js` (UI): `strings` (README text, verbatim), `screens` overrides, `voice`, `layout`.
- `kg.js` (KG): weights, recency, `roomConfidence` (KG ADR values). The resolver exposes `SA.kg.resolver.registerModifier(name, fn)`; ErrP memory M(d) registers through it (ADR 0002 D18).
- `policy.js` (Policy & safety):
  - `thresholds`, `combine:'product'|'min'|'weighted'` (Debate 5 fills it), `tiers`, `thermal:{min:18, max:30}`, `costs` (ADR 0002 D12);
  - `timing:{confirmTimeoutMs, approvalTimeoutMs}`;
  - the tier map is asserted equal to the TTL tiers by a selftest.
- `eeg.js` (Browser EEG): `decodeAnimMs:1600`, `synth:{seed:20261015, nEval:40, sigmaMm:30}`, `replayEnabled:true`, `scriptedExemplar:'auto'`.
- `errp.js` (Browser EEG): ADR 0002 D24 keys (`observeMs:1000`, `mode`, `penalty`, `confirmRates`, `piFloor`).
- **Model-intrinsic hyperparameters are NOT in `SA.config`.** They are read only from `SA.data.*.manifest`:
  - τ and its comparison (`>`), η, sos, window, nperseg/noverlap, integration rule, bands;
  - residual on/off, GCN edge weighting, GATv2 options (`add_self_loops`, `negative_slope`, `share_weights`), GCN normalisation, head concat;
  - class order and class→token map, temperature.
- This is a deliberate clarification of CLAUDE.md §3 ("tunables"): these are *trained-artefact constants*, and duplicating them would let a re-export silently break parity. A Node test asserts that no file under `eeg/` contains a numeric literal for τ or η.
- **Class→token map** (README §2): `right→NEXT`, `left→PREV`, `feet→SELECT`, `tongue→BACK`. The model's output index order is `manifest.classes` (exporter-written from the loader's label order).

### G. Export formats, precision, size budgets (Q4, G1–G3, G11)

**D18. File format.** Every `POC/js/data/*.js` is written by `research/export/jsdata.py::write_js(name, manifest, blobs)` and read back for parity by `jsdata.read_js(path)`.

```
/* GENERATED by research/export/<script>.py — DO NOT EDIT
 * run: <run-id>  plan: B  preliminary: true  stub: false
 * source: <dataset, subject/session>  licence: <text> — embedding pending supervisor confirmation
 * payload-sha256: <hex>  bytes: <n>
 */
(function (root) { var SA = root.SA = root.SA || {}; SA.data = SA.data || {};
SA.data.<name> = { manifest: <JSON>, b64: [
"<≤1000 base64 chars>",
...
].join("") };          // replay files: records[i].b64 = [...].join("")
})(typeof window !== 'undefined' ? window : globalThis);
```

- Arrays are **Float32, little-endian, base64, wrapped at 1000 chars per line.**
- `sfegat-weights.js` is **one blob** with a tensor table `manifest.tensors = [{name, shape, offset, length}]`, where `offset` and `length` count elements and `name` is the PyTorch `state_dict` key verbatim (`…lin_l.weight`, `…lin_r.weight`, `…att`, `…bias`, `…running_mean`, `…running_var`). The JS loader throws on any missing or extra name.
- Replay files have **one base64 string per trial or epoch record** (ADR 0002 D25 format for ErrP; same shape for MI).
- Decoding is **lazy**: on first use, never at load.

**D19. Precision.** Store float32 and compute float64.
- `SA.core.b64.decodeF32(str) → Float64Array` upcasts immediately. All DSP and model maths are float64.
- The Python parity reference loads weights **and** samples via `jsdata.read_js` (the float32-rounded bytes actually shipped), upcasts to float64, and runs `model.double().eval()`.
- It never uses the original float64 `.mat` samples.

**D20. Threshold-margin guard (G1).**
- For each exported MI trial under the exported weights:
  - min over off-diagonal entries of |z − τ| > 1e-6;
  - min over all edges and all 3 blocks of |P_Â − η| > 1e-6.
- Trials that fail are excluded, with the reason in `manifest.selection.excluded[]`.
- Stage-wise parity is checked at PLV, H, z, A^(0), A^(1..3) (exact edge-set equality) and logits/probs. Internal targets are 1e-9 for DSP, 1e-6 for logits; the acceptance gate is the mandated **1e-4**.
- The guard is **re-run on every re-export**, because η margins depend on the weights: stub and real trial sets may differ, so the UI never hard-codes trial ids.

**D21. `mi-replay.js` content.**
- Deployment subject and window come from the replication-fidelity ADR (converging on **A01, [2.0, 6.0) s**). Session **E only**.
- **5 trials per class, 20 in total.** That is 2.35 MB with a 1000-sample window, or 2.93 MB if the padded 1250-sample window is ruled in, so 5 per class fits the 3 MB cap under either window.
- **Selection:** the first 5 per class in A01E trial order that pass the D20 guard. **Never filtered by correctness in either direction.**
- `manifest`: `dataset`, `subject`, `session`, `fs`, `window`, `nSamples`, `channels[22]`, `units:'uV'`, `classes`, `selection{rule, excluded[]}`, `deployment{sessionEAccuracy, n, calibrated, temperature, ece}`, `exemplarId`, `licence`.
- Each record: `{id:'A01E-t017', index, trueCls, sha256, expected:{probs, pred}, b64}`.
- The UI shows the selection rule, the per-trial ✓/✗, and the full session-E accuracy of the deployment model.
- `test_export_mi_replay.py` asserts every sha256 matches an A01E trial and none matches any A01T trial (bci-eeg L7).
- **Raw µV excerpts only.** No filtering in Python.
- `manifest.norm.trainBandPowerMedian` (22 × 8, session T) lives in `sfegat-weights.js` for D7.

**D22. Plan B honesty is data-driven.**
- Every manifest carries `run:{id, plan, preliminary, seed, stub}`.
- The UI renders `PRELIMINARY (Plan B, 1 seed)` from these fields. If `stub:true`, it renders a red `STUB WEIGHTS — not a trained model` banner and disables the accuracy display.
- Any accuracy shown sits next to the paper's value and is never rounded up.

**D23. Size caps** (test-enforced by `research/tests/test_export_sizes.py`).

| File | Cap |
|---|---|
| `sfegat-weights.js` (≈ 0.81 MB) | 1.0 MB |
| `mi-replay.js` | 3.0 MB |
| `errp-replay.js` | 2.6 MB (ADR 0002) |
| `errp-model.js` | 10 KB |
| `montage-data.js` | 16 KB |
| **Total `POC/js/data/`** | **6.6 MB** |
| **Whole `POC/`** | **8 MB** |

Stubs obey the same caps and shapes.

**D24. Licence header.**
- MI: `BCI Competition IV-2a / BNCI Horizon 2020 001-2014, Graz University of Technology (Brunner et al. 2008); licence [UNVERIFIED]`.
- ErrP: per ADR 0002 D27.
- Both carry `— embedding pending supervisor confirmation`, and the same line appears in the expanded harness.

### H. Python layout and the Plan A/B mechanism (Q2)

**D25. Layout** (cwd `research/`, run as `.venv/Scripts/python.exe -m <pkg>.<module>`; `research/pytest.ini` sets `pythonpath = .`).

```
research/
  common/   env.py (D38), config.py (load_config), runlog.py (run-id, env.json, metrics.json), hashing.py
  sfegat/   data.py preprocess.py graph.py (as built), layers.py model.py train.py evaluate.py
            calibrate.py (temperature, deployment) ablations.py analysis.py (t-SNE, edges, latency)
  errp/     per ADR 0002 D2–D21
  export/   jsdata.py, stubs.py, sfegat_weights.py, mi_replay.py, export_errp.py (ADR 0002), montage.py,
            node_runner.js (single JS runner for every Node-side check)
  configs/  base.yaml, plan_a.yaml, plan_b.yaml, variants/{paper,code,...}.yaml, deploy.yaml, export.yaml, errp.yaml
  scripts/  benchmark.py (as built), run_selftest.py, screenshots.py
  tests/    see D30 for per-file ownership
  runs/<run-id>/  config.yaml (merged), env.json, metrics.json, log.txt, units/<subject|fold>.json, ckpt/
  cache/    derived data (feature .npz from sfegat; cache/errp/ from errp)
  .cache/   tool scratch: pip, tmp, mne-home, edge-profile/<pid>, parity/ (prefix-namespaced; nobody deletes another's files)
```

Both cache dirs are ratified with the roles above, so there is no refactor tonight.

**D26. Run identity.**
- Format: `<task>-<plan>-<variant>-<YYYYmmdd-HHMMSS>-<sha8(canonical merged config)>`, e.g. `sd-B-paper-20261014-1910-3fa2c1d0`.
- `metrics.json` carries `plan`, `preliminary`, `run_id`, `code_sha256` (hash of `research/sfegat/*.py`) and `seeds`.
- Runs are **resumable per unit** (subject or fold). `--resume <run-id>` skips units whose `units/<u>.json` exists, so an unfinished LOSO is reportable as "k of 9 folds".

**D27. Plan A is a config overlay.**
- `common.config.load_config(base, plan_overlay, variant_overlay, sets)` deep-merges.
- The **plan overlay may only touch**: `plan`, `preliminary`, `seeds`, `loso.train_sessions`, `ablations.variants`, `ablations.subjects`, `ablations.seeds`.
- The loader raises on any other key in a plan file, and `test_config_plans.py` asserts that `plan_a.yaml` and `plan_b.yaml` differ only in those keys.
  - `plan_b.yaml`: `{plan: B, preliminary: true, seeds: [0], loso: {train_sessions: [T]}, ablations: {...partial, per the replication ADR}}`.
  - `plan_a.yaml`: `{plan: A, preliminary: false, seeds: [0,1,2], loso: {train_sessions: [T, E]}, ablations: {variants: [PLV-GAT, SFE-GCN, FE-GAT, R-GAT, R-SFE-GAT]}}`.
- Model and fidelity choices (C1–C3) live in `variants/*.yaml`, never in plan files.

**D28. CPU discipline.**
- Each training worker sets `OMP_NUM_THREADS=1`, `MKL_NUM_THREADS=1` and `torch.set_num_threads(1)`.
- At most **3** concurrent training processes while builders are active; 4 after 03:00 if nothing else runs.
- Priority: deployment run > SD Plan B > LOSO > ablations.
- **Any run over 15 min needs the user's approval with the measured estimate** (CLAUDE.md §1). The computed "already decided" does not replace that.

### I. Testing and verification (Q5, Q6)

**D29. Node runner** (`research/export/node_runner.js`, CommonJS, no npm install).
- Parses `<script src>` from `POC/index.html` in document order.
- Builds `ctx = vm.createContext({console, atob, btoa, TextEncoder, TextDecoder, crypto: require('crypto').webcrypto, performance, setTimeout, clearTimeout})` and sets `ctx.window = ctx`. There is no `document`.
- Loads **all** scripts. Subcommands:
  - `load-only` (D11.1);
  - `sfegat <in.json> <out.json>` (stage-wise dump);
  - `errp …`;
  - `dsp …`;
  - `kg …`;
  - `cases <domain>` (runs DOM-free selftest cases).
- pytest calls it via `subprocess.run(["node", runner, …], check=True)` and exchanges JSON files under `research/.cache/parity/`.
- It supersedes the `node_parity.js` / `parity_node.js` names in the replication inputs.
- Pure JS unit tests use built-in `node --test` (`research/tests/js_<domain>/*.test.js`), wrapped by `research/tests/test_js_node.py`.
- `node --check` runs on every `POC/**/*.js` (`test_poc_static.py`).

**D30. Test-file ownership** (by path, so no two builders share a file).

| Owner | Files |
|---|---|
| SFE-GAT | `test_preprocess.py` (as built), `test_sfegat_*.py`, `test_config_*.py`, `conftest.py`, `pytest.ini` |
| ErrP | `test_errp_*.py` except `test_errp_parity.py` |
| Export | `test_*_parity.py`, `test_export_*.py`, `js_parity/` (except `js_parity/dsp/`) |
| Browser EEG | `js_parity/dsp/`, `js_eeg/`, `js_errp/` |
| KG | `js_kg/` (as built), `test_kg_*.py` |
| Policy & safety | `js_policy/`, `js_safety/` |
| UI | `js_ui/` |
| Core | `test_poc_static.py`, `test_js_node.py`, `test_readme_strings.py`, `test_selftest_edge.py` |

**D31. In-page selftest** (`?selftest=1`).
- It runs inside the live app. **Sync-first**: every synchronous check writes its line to `<pre id="selftest-report">` immediately. Async checks append later.
- The last line is the sentinel **`SELFTEST-DONE pass=N fail=M`**. A missing sentinel is a FAIL.
- It caps work at 2 Replay forward passes and 2 ErrP epochs, and sets `SA.clock.speed = 10`.
- It **ends by calling `SA.core.reset()`** and asserting `store.snapshot()` deep-equals `SA.config.initialState` (with the D35 exemptions), plus the README strings in the Scripted/Reset DOM.
- It never waits for `voiceschanged`.
- Screenshots use the URL **without** `?selftest`.

**D32. Headless command** (verified working tonight, D-Context 1). This is the only form allowed in docs and agents:

```
"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --no-first-run
  --no-default-browser-check --user-data-dir="C:/Users/AK/Documents/FYP/research/.cache/edge-profile/<tag>-<pid>"
  --virtual-time-budget=15000 --dump-dom "file:///C:/Users/AK/Documents/FYP/POC/index.html?selftest=1"
```

- Wrapped by `research/scripts/run_selftest.py`. It creates a **fresh profile dir per invocation** (no profile-lock collisions between parallel builders, and no hand-off to the user's Edge), parses the sentinel, deletes the profile, and exits non-zero on failure.
- `screenshots.py` uses the same flags with `--screenshot=docs/verification/<name>.png --window-size=1366,768` and `1920,1080`.

**D33. Browser claim.**
- Edge 155 is the verified viva browser.
- `docs/verification.md` records that Chrome is unverified unless a manual open is done, and that Firefox is untested (`crypto.subtle` on `file://` and local voices are unverified there).
- README §4 is not edited. The gap is listed in the final report.

### J. Montage (G10)

**D34. Montage export.** `research/export/montage.py` → `POC/js/data/montage-data.js` (`SA.data.montage`).
- Source: MNE 1.13.2 `make_standard_montage('colin27_1005')`. `standard_1005` is deprecated and forbidden.
- 22 IV-2a channels, which include every ADR 0002 ErrP feature channel (Fz, FC1, FCz, FC2, C1, Cz, C2, CPz).
- Each record: `{name, paperIdx (1–22, Fig. 2a numbering), pos3d_mm, x, y}`.
- Projection: azimuthal-equidistant from the vertex, scaled so the head circle has radius 1 (the MNE topomap convention).
- Header: `positions: MNE colin27_1005, projected; numbering per paper Fig. 2a`.
- `brain/montage.js` is code only. Coordinates are never typed by hand.

### K. Reset and audit (Q8)

**D35. The audit log is outside the "initial state".**
- `SA.safety.audit` keeps its own chain, not in the store.
- `[Reset Demo]` **appends** `RESET {prevHead}` and never truncates.
- The D31 equality check excludes only the audit chain and `prefs.reducedMotion`.

**D36. Reset sequence** (`SA.core.reset`, all synchronous except the audit append):
1. `SA.clock.cancelAll()`: every timer is a cancellable `SA.clock.after` handle, and `setTimeout` outside `core/clock.js` is grep-forbidden.
2. Pending real approvals → `APPROVAL_CANCELLED`. An in-flight episode → `EPISODE_ABORTED`, with no compensation run.
3. `store.reset()`, preserving `prefs.reducedMotion` (an accessibility preference, not README state).
4. The KG reloads the canonical TTL. This restores the seeded 6/2/2 history and clears ErrP memory (ADR 0002 D18).
5. Decoder cursors and pins go to 0/null, so a second walkthrough is identical to the first.
6. `audit.append('RESET')`.
7. `bus.emit('demo:reset')`.
8. `ui.navigator` re-renders S1, focus 0.

- `decoder.mode` returns to `scripted`, because the pill is README state.
- **Selftest:** reset during an ErrP observation, then advance the clock by 5 s, and assert no device mutation and no ROLLBACK entry.

**D37. Audit appends are serialised** through one promise queue in `safety/audit.js`.
- Canonical JSON with sorted keys; µV fixed to 1 decimal place.
- The FNV-1a fallback badge reads `Chain verified ✓ (FNV-1a — integrity only, not tamper-proof)` (UX §8.1).
- **Selftest:** two appends in the same tick; tamper one entry and the badge shows `Chain broken at #k`.

### L. Out-of-folder hygiene

**D38. `research/common/env.py` runs before heavy imports in every entry point.** It sets:
- `_MNE_FAKE_HOME_DIR` = `research/.cache/mne-home` (the variable MNE actually honours on Windows, D-Context 3);
- `MNE_DATA` = `research/.cache/mne-data`;
- `MPLCONFIGDIR` = `research/.cache/mpl`;
- `TMP`/`TEMP`/`TORCHINDUCTOR_CACHE_DIR` = `research/.cache/tmp`;
- `PIP_CACHE_DIR` = `research/.cache/pip`.

Every msedge call follows D32. No git, no publishing.

### M. Build plan for tonight (Q9)

**D39. Cross-topic hooks, so nobody waits on Debates 1, 4, 5 or 7:**
- the variant manifest (D17);
- `SA.kg.resolver.registerModifier`;
- `SA.config.policy.combine`, `thresholds`, `tiers`;
- the declarative screen graph (D16);
- provisional initial values (D15).

When a sibling ADR lands, only config, TTL or variant files change.

**D40. Exclusive ownership.** This extends the PROMPT §3 table; everything not listed belongs to the orchestrator.

| Builder | Owns exclusively |
|---|---|
| Orchestrator / integrator | `docs/architecture.md` (transcribed from this ADR and frozen **before** builders start), `docs/adr/`, `docs/debate/`, `_snapshots/`, README appendix, integration |
| SFE-GAT trainer | `research/sfegat/`, `research/common/`, `research/configs/` (except `errp.yaml`), `research/scripts/benchmark.py`, `research/cache/` (except `cache/errp/`), its runs, its tests (D30) |
| ErrP trainer | `research/errp/`, `research/configs/errp.yaml`, `research/cache/errp/`, its tests |
| Export & parity | `research/export/` (incl. `node_runner.js`, `jsdata.py`, `stubs.py`, `montage.py`), `POC/js/data/`, its tests |
| Browser DSP/EEG | `POC/js/{dsp,eeg,errp,brain}/`, `POC/js/config/{eeg,errp}.js`, `POC/js/selftest/cases/{eeg,errp}.js`, its tests |
| KG | `kg/`, `POC/js/kg/`, `POC/js/config/kg.js`, `POC/js/selftest/cases/kg.js`, its tests |
| Policy & safety | `POC/js/{policy,safety}/`, `POC/js/config/policy.js`, `POC/js/selftest/cases/{policy,safety}.js`, its tests |
| UI | `POC/js/{ui,input,voice}/`, `POC/css/` (incl. `tokens.css`), `POC/js/config/ui.js`, `POC/js/selftest/cases/ui.js`, its tests |
| Core & test | `POC/js/core/`, `POC/js/config/initial-state.js`, `POC/js/app.js`, `POC/index.html`, `POC/js/selftest/selftest.js`, `research/scripts/{run_selftest,screenshots}.py`, `docs/verification/`, its tests |

**D41. Order and tiers.** Tier 1 cannot slip. Tier 3 slips first.

| When | Who | What |
|---|---|---|
| T0 (≈ 16:00) | Orchestrator | `docs/architecture.md` frozen from this ADR plus the accepted sibling ADRs |
| T0 + 15 min | All browser builders | every declared file exists as a namespace stub; Core lands `index.html` + `core/*` + `config/initial-state.js` |
| T0 + 1 h | **Export** | `jsdata.py`, `stubs.py` → `sfegat-weights.js` from a seeded (`torch.manual_seed(0)`), **untrained** model through the real exporter, with `run.stub:true`; **real** `mi-replay.js` from A01E (D20 guard under the stub weights); `montage-data.js`; `errp-replay.js` raw epochs with `expected:null` until the ErrP model exists; `node_runner.js load-only` |
| T0 → +3 h | SFE-GAT | `common/`, `layers/model/train`; **deployment run first** (replication ADR §9 design, ≈ 30–40 min measured-basis), then SD Plan B (≈ 0.9 h) |
| T0 → +3 h | Browser EEG | `eeg/*` forward pass against the **stub** weights; stage-wise parity against the stub. **Parity needs no trained weights and can go green before training ends** |
| T0 → +3 h | ErrP, KG, Policy & safety, UI | per their ADRs, against stubs; Scripted path end to end |
| as soon as the deploy run ends | Export | re-export real weights (`stub:false`), re-run the D20 selection and parity |
| hourly, and after every green | Orchestrator | `run_selftest.py`; on PASS, copy `POC/` → `_snapshots/POC-<YYYYmmdd-HHMM>/` and write `_snapshots/LAST_GREEN.txt` |

- **Tier 1:** Scripted README path; ErrP Scripted; audit; reset; selftest.
- **Tier 2:** Replay with parity green; ErrP Replay; brain graph evo0→3.
- **Tier 3:** Synthetic MI; extra screenshots; comparators.

**D42. Cut-offs.**
- **02:00:** if SFE-GAT parity on the real weights is not green, set `SA.config.eeg.replayEnabled = false`. Replay renders as `Replay (parity pending — disabled)` and is listed in unchecked boxes. It is **never** shown as in-browser SFE-GAT without parity.
- **05:00:** code freeze.
- **06:00:** the final green snapshot is the viva build. The demo runs from `_snapshots/LAST_GREEN.txt`, not from the working tree.

---

## Rejected alternatives

| Alternative | Reason |
|---|---|
| Replay as the viva default | It cannot reproduce README MI 92 % / SPARQL 0.94 values. With 4–6 tokens at a per-trial accuracy of 0.75–0.85, an end-to-end walkthrough succeeds only 18–38 % of the time. |
| Free-running Replay (trial chosen independently of the operator's cue) | Turns the walkthrough into a random walk. Cued decoding keeps the operator's narrative and is honest because it is labelled. |
| Overriding a mis-decode with the cued class | It hides the very error the policy and ErrP exist to catch. Dishonest. |
| Auto-firing an ErrP replay epoch after an MI mis-decode | The epochs come from another dataset and subject, so this would fake a causal brain response. The operator presses `[Simulate ErrP]` on a hint. |
| Synthetic MI must decode above chance (a gate) | It can be met only by tuning the generator against the model, which is circular. A scale match to session-T statistics is principled. Accuracy is shown, with no claim attached. |
| Fourier/IAAFT surrogates of real trials for Synthetic | Session T replays training data, session E duplicates Replay, and both are an NC-ND "adaptation" risk. |
| Synthetic MI generated in Python and exported | Adds megabytes for no gain. A seeded JS generator is deterministic and testable in Node. ErrP stays Python-side per ADR 0002 because it needs the detector-fitted α and seed search. |
| A whitelisted DOM-free script prefix for the Node runner | Brittle as files are added. The universal "no DOM at load time" rule lets the runner load everything and catches violations itself. |
| A single `SA.config` file owned by Core | Four builders would edit one file tonight with no git. Per-owner config files under one namespace keep CLAUDE §3 satisfied. |
| Model hyperparameters in `SA.config` | A re-export or a Debate-1 variant change would silently break parity. They come from the manifest. |
| One base64 string per weight tensor | 40+ strings and error-prone ordering. One blob plus a verbatim `state_dict` tensor table fails loudly. |
| Float64 storage | Doubles the weights to 1.6 MB and halves the replay budget for no parity gain once Python reads the same float32 bytes (D19). |
| Correctness-filtered replay trials (errp §11 rec. 12 style) for MI | Cherry-picking. The first 5 per class that pass a disclosed numerical guard are used. |
| 6 per class (24 trials) | Fits only the 1000-sample window. 5 per class fits either window, leaves headroom and matches the replication inputs. |
| Wiping the audit log on reset | Violates append-only (UX §8.2). The log is ruled outside the initial state. |
| `MNE_DONTWRITE_HOME=true` (critic §6.4) | Verified to be ignored on Windows. `_MNE_FAKE_HOME_DIR` is the effective variable. |
| `--user-data-dir` in the session scratchpad | Not re-runnable by the user from `docs/verification.md`. A per-invocation dir under `research/.cache/` is inside FYP and never shipped. |
| Relying on `--dump-dom` without a virtual time budget | Verified to miss timer-driven writes. |
| Refactoring the two cache dirs or moving `research/tests/js_parity/dsp` | It costs time tonight and gains nothing. Roles and ownership are ratified instead. |
| Splitting `kg/sparql.js` tonight | It is 448 lines, under the 450 hard cap. The split is post-mid-eval. |
| Replay pill reading `EEG: Simulation Mode` | Violates CLAUDE §6 when real EEG is decoded. |
| An empty approval queue at reset | The README's "interactive example" would be invisible to a panel member who opens the dashboard first. A labelled seeded example is used. |

## Residual dissent

1. **Seeded approval example.** One can argue a seeded pending request is a fabricated event. Mitigation: it is labelled `Example request (seeded by Reset Demo)`, flagged `seeded:true` in audit, and real requests come from the thermal path. Revisit if the supervisor objects.
2. **Reset preserves `prefs.reducedMotion`.** The UX input wanted all harness toggles reset to defaults. I preserve only reduced motion, because it is an accessibility and safety preference, not README state. Voice, decode animation and auto-confirm do reset.
3. **ErrP Replay epochs on `[No ErrP]`** (D6) extend ADR 0002 D23 to Replay mode. If the ErrP judge holds that `[No ErrP]` must always be synthetic-correct, revert D6's Replay row. The real TN/FP epochs then stay reachable via the epoch picker only.
4. **Cued decoding is an oracle on the cue.** The operator chooses which class's trial is drawn. The label discloses this. A fully blind "random held-out trial" button is post-mid-eval.
5. **Synthetic tongue ERD pattern** has no firm literature topography. It is labelled "illustrative".
6. **The 450-line hard cap** is looser than "about 400". It is chosen to avoid splitting working files hours before a viva. The target stays 400.

## Consequences

- README exactness, honesty labelling and real decoding coexist: README exactness holds in Scripted/Reset, and real decoding is labelled everywhere else.
- Browser builders start immediately against an exporter-produced stub with real replay data. Parity is on the critical path, not training.
- A Plan A re-run changes only `plan_a.yaml` plus a re-export. The UI's PRELIMINARY label disappears automatically when `preliminary:false`.
- `docs/architecture.md` must transcribe D9–D17 and D18–D24 verbatim as the frozen contract.
- `docs/verification.md` must use D32 and D38 exactly.
- Measured LOSO-T Plan B cost (≈ 7.1 h wall) means LOSO may not finish before the morning. Per-unit resume (D26) makes a partial LOSO reportable as "k/9 folds, PRELIMINARY".

## Tonight vs post-mid-eval

**Tonight:**
- Everything in D1–D6, D8–D42.
- Synthetic MI (D7) only as tier 3.

**Post-mid-eval:**
- Synthetic MI if it was not reached.
- `sparql.js` split.
- Chrome/Firefox verification.
- A blind random-trial Replay button.
- Plan A runs (3 seeds, LOSO T+E, 5 ablations) via `plan_a.yaml`.
- An HMAC caregiver-PIN audit option.
- Removing the seeded approval if the supervisor objects.

## Revisit conditions

- The replication ADR picks a different deployment subject or window: the exporter config changes, and D21's count holds (5 per class fits ≤ 1250 samples).
- The KG/policy ADR decides X4 (the semantic source), X8 (tiers) or the initial-state facts: only `config/*.js` and the TTL change.
- The UX ADR changes per-screen grammar or BACK semantics: only the screen-graph data changes. ADR 0002 costs recompute.
- Edge `--virtual-time-budget` stops honouring timers after an Edge update: fall back to a sync-only selftest plus a second dump after a 10 s real wait.
- Parity is not green by 02:00 (D42).
- The supervisor rejects embedding the IV-2a or BNCI data: Replay is disabled and Synthetic becomes the only non-scripted mode.

---

## Addendum A — Contracts architect ruling for the build (2026-10-14 16:05)

**Why this addendum exists.** The workflow reported that the Debate 4 judge timed out. The ADR text above was nevertheless found complete on disk (written 15:48, transcript 15:49), so it is **ratified as written**, with the amendments below. Be clear about how degraded the debate was. Both proposers failed. There was no rebuttal round. The only surviving input was the critic (`docs/debate/_inputs/architecture-and-modes.md`). ADR 0005 (assistive UX) and ADR 0003 (KG/policy) were accepted at about the same time, and the judge did not see them ("sibling debates not yet ruled"). This addendum reconciles the conflicts. It does not reopen any decision without a concrete reason. The build budget is now **about 2 hours** for a working build, not an overnight plan. `docs/architecture.md` is the frozen contract that builders code against.

**A1. Ownership (supersedes D40 for tonight).** Eight builders: CORE, UI, VIZ, KG, SAFETY, EEG, EXPORT, ERRP. The exact file map is `docs/architecture.md` §1.2. Notable moves:
- `input/` goes to CORE.
- Caregiver UI, brain view and `kg/kg-view.js` go to VIZ.
- `policy/` goes to KG.
- `errp/` (browser) goes to SAFETY.

**A2. File list amendments to D9:**
- `input/harness-input.js` is replaced by `ui/harness.js` (UI). It emits `harness:set` and `input:operatorToken`, and `input/tokenbus` applies `context.*`/`prefs.*`.
- New `kg/mirror.js` (KG) and `config/safety.js` (SAFETY).
- Caregiver files are `ui/caregiver/{dashboard,queue,gauges,shadow-table,audit-view}.js`.
- Selftest cases are split per builder.
- The generic Node loader is `research/tests/js/run_node.js` (CORE). `research/export/node_runner.js` (EXPORT) `require`s it.

**A3. Replay token path (amends D4/D5 to agree with ADR 0005 D25).**
- README keys and harness token buttons always emit their labelled token at slider confidence (`decoded:false`), in every mode.
- The harness button **"Decode trial ► inject token"** draws a held-out trial. It uses the D4 cued pool: the cue class round-robin, or a pinned trial. It then runs the real in-browser SFE-GAT, and the **decoded** class acts even when it is wrong (`decoded:true`).
- So the walkthrough cannot derail, yet a real mis-decode can still be shown on demand.
- The Neural slider stays enabled in all modes. Its caption reads "applies to scripted tokens".
- D5's blindness rule is unchanged: the policy never sees `trueCls`/`correct`.

**A4. Naming and other alignments:**
- Screen ids follow ADR 0005 D6 (`devices/fan`, `devices/ac`, `devices/tv`, `lights/brightness`).
- `ui.navMode` is kept (not `audioMode`).
- The fan's initial state is `{power:'off', speed:null}` (ADR 0003 D18).
- TV volume step is 5 (ADR 0003).
- Subtitles follow ADR 0005 D7.
- `SA.policy.decide` is pure, and `safety/episode` emits `policy:decided`.

**A5. ErrP cost cells.** ADR 0002 D12 wants cells derived by BFS over the screen graph. Tonight `SA.config.errp.costs` carries the ADR 0002 D13 values:
- `light-select` 5/7/2.92 (t* 0.5507);
- `preset` 5/15/3 (t* 0.2941);
- `setting-medium` 1/6/2 (t* 0.20).

Classes without derived cells (`setting`, `power`) are **flag-only**, which is conservative because it never rolls back. This is a documented gap. A selftest compares the cells against `SA.nav.shortestPath` once it exists.

**A6. Montage (D34 confirmed).** `data/montage-data.js` is a generated table. It is built from MNE 1.13.2 `colin27_1005` (installed in the venv) and projected to 2-D. That generated table is the "hard-coded 2-D positions" the build brief asked for. Browser code never hand-types coordinates.

**A7. Reset vs audit (D35/D36 confirmed).**
- `[Reset Demo]` appends a `RESET {prevHead}` entry and never wipes the chain.
- Store equality after reset exempts only `prefs.reducedMotion`.

**A8. Schedule (replaces the clock times in D41/D42):**
- **T0:** contracts frozen.
- **T0 + 15 min:** every declared file exists as a stub, and EXPORT/ERRP stubs exist (`docs/architecture.md` §7.7).
- **T0 + 2 h:** Tier 1 is green under `run_selftest.py`.
- Replay counts as shown only when parity is green. Otherwise `SA.config.eeg.replayEnabled = false` and the option is labelled `Replay (parity pending — disabled)`.
- Synthetic MI stays tier 3: `synthEnabled:false` until built, and the option reads `Synthetic (post-mid-eval)`.
- Plan B SD training is running, so builders must not start heavy CPU jobs.
