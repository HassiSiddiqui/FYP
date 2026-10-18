# Verification: what was run, and what came out

**Date:** 2026-10-14, about 17:20–17:45 local, after red-team round 1 fixes and after Plan B SD training finished. **Machine:** Windows 11 Pro 10.0.26200, 4-core CPU, no GPU; Node v24; Python 3.14.7 in `research/.venv`; the Microsoft Edge that ships with Windows.
**Rules followed:** local only; no installs; headless Edge only with a fresh `--user-data-dir` under `research/.cache/edge-profile*` (deleted after each run); nothing committed, pushed or uploaded. The docs writer ran **every count in §1–§3 for this document**; nothing is copied from earlier logs unless it is marked "build log". Training had **finished** before these checks started (no Python process running), so they did not compete with it for CPU.

## 1. Summary

| Suite | Command (from the project root) | Result |
|---|---|---|
| **In-page selftest, headless Edge** | `research/.venv/Scripts/python.exe research/scripts/run_selftest.py --json research/.cache/docs/selftest.json` | **`SELFTEST-DONE pass=76 fail=0`** (core 19, kg 26, safety 7, eeg 9, ui 9, viz 6; in-page duration 3.7 s; 7.8 s wall) |
| In-page selftest cases, headless Node (DOM-only cases skipped) | `node research/tests/js/run_node.js cases` | **`SELFTEST-DONE pass=71 fail=0`** |
| Lint (forbidden APIs: ES modules, `fetch`, CDN, load order, file size) | `node research/tests/js/run_node.js lint` | **81 files, 0 problems** |
| Syntax | `node --check` on every `POC/js/**/*.js` | **81 files, 0 failures** |
| Node unit tests: core, safety ×4, ui, viz, eeg | `node --test research/tests/js/core/core.test.js research/tests/js/safety/*.test.js research/tests/js/ui/ui.test.js research/tests/js/viz/viz.test.js research/tests/js/eeg/eeg.test.js` | **tests 54, pass 54, fail 0** (11.3 s) |
| Knowledge-graph tests (TTL = ontology.js, 16 CQs, resolver, policy, mirror) | `node --test kg/tests/*.test.js` | **tests 54, pass 54, fail 0** (1.1 s) |
| SFE-GAT JS parity, 4 weight sets × 4 trials | `node research/tests/js/eeg/eeg_parity.js` | **EEG PARITY PASS (16 model × trial cases)** |
| Viz DOM, headless Edge | `research/.venv/Scripts/python.exe research/tests/js/viz/run_viz_dom.py` | **`VIZ-DOM pass=35 fail=0`** |
| **pytest**, all of `research/tests` | `cd research && .venv/Scripts/python.exe -m pytest -q -p no:cacheprovider tests` | **103 passed, 1 xfailed** (68 s; 233 library deprecation warnings) |

**pytest by file** (104 collected):

| File | Tests |
|---|---|
| `test_preprocess.py` | 56 |
| `test_errp_data.py` | 16 |
| `test_export.py` | 11 |
| `test_errp_pipeline.py` | 7 |
| `test_errp_synth.py` | 7 |
| `test_sfegat_parity.py` | 6 |
| `js_parity/dsp/test_dsp_parity.py` | 1 |

- **The one xfail is expected and documented:** `test_errp_pipeline.py::test_segment_vs_continuous_reported`. Filtering each segment vs the continuous recording gives max |ΔF| = 9.639 µV, above the 0.05 µV tolerance. This is the ADR 0002 D4.5 deviation, disclosed in `docs/errp.md`.
- **All pytest suites were run;** none was heavy enough to skip. The slowest single test took 10.1 s.
- **Not run:** any training, `errp.evaluate` (about 9 min with 1000 permutations), and the export scripts. Their outputs on disk are what the tests above check.

## 2. Parity (PROMPT §5: browser forward pass = PyTorch within 1e-4)

| Pipeline | Evidence (re-run today) | Worst error | Gate | Verdict |
|---|---|---|---|---|
| DSP vs SciPy | `research/.cache/parity/dsp_parity_report.json`, rewritten by pytest at 17:32 | **81/81 cases ok**; worst relative 1.756e-12 | rel ≤ 1e-9 | **pass** |
| SFE-GAT, trained A01 weights, all 20 replay trials | `test_sfegat_parity.py` (6 tests) + `research/.cache/parity/runner_out.json` vs `sfegat_reference.npz` | **logits max abs 9.77e-15**; scaled probabilities 3.33e-16; edge sets A0–A3 identical; predicted class equal 20/20 | logits abs ≤ 1e-4 | **pass** |
| SFE-GAT stages, random and trained weights | `eeg_parity.js`, 16 cases | H ≤ 4.1e-16, P ≤ 2.3e-15, Z ≤ 6.8e-15, post-BN ≤ 5.2e-14, logits ≤ 7.1e-12 | D27 stage gates | **pass** |
| ErrP (features → sLDA score → Platt → prior shift → q) | `test_errp_synth.py::test_js_reference_parity` passes. Build log: features ≤ 6.2e-15 µV, score ≤ 3.6e-15, q ≤ 4.4e-16 | see left | features ≤ 1e-9; score, q ≤ 1e-6 | **pass** |

Parity shows that the browser computes the same function as PyTorch. It does **not** make the model accurate: A01E accuracy is 34.37 % (99/288), see [replication.md](replication.md).

## 3. Screenshots (headless Edge, 1366×768, taken today and inspected one by one)

Driver: a Chrome DevTools Protocol script adapted from `research/.cache/redteam1/cdp.js`. It sends **real key events** for patient tokens and **clicks** for operator-harness buttons. Recorded states are in `research/.cache/docs/shots.json` and `demo_1366.json`. **Console errors: 0 in every run.**

| File | What it shows | What I checked by eye |
|---|---|---|
| `verification/s1-mode-selection-1366x768.png` | S1 Mode Selection at boot | Pills read `EEG: Simulation Mode` • `Environment: Smart-Home Simulator`, plus "Decoder: Scripted". Visual Navigation is focused with the "● Focused" marker. The harness is labelled "OPERATOR HARNESS — NOT PATIENT-FACING". Data attribution line present |
| `verification/s2-hub-1366x768.png` | S2 Hub | 5 cards with README subtitles (1 Active of 3; Ceiling Fan: OFF; 24°C • Cool Mode; Smart TV: Standby; 4 Multi-Device Semantic Routines) |
| `verification/s4-actions-preview-1366x768.png` | S4 before selecting | Turn On / Turn Off / Adjust Brightness / Back; the panel is in "Preview" with dashes |
| `verification/s4-coglign-canonical-1366x768.png` | **Canonical CogLign panel** right after Turn On (S5 observing) | Turn On Light • Master Bedroom (Active User Room) • :BedroomCeilingLight • Score **0.94** • Neural MI **92%** • Semantic **89%** • **Low: Autonomic** • **✓ EXECUTE**. KG view: Ceiling 1st 0.94, Lamp 2nd 0.88, Living 3rd 0.38. `Bedroom Ceiling Light: OFF ➔ ON` and "Observing post-action EEG..." with FCz/Cz |
| `verification/s5-rollback-1366x768.png` | **S5 rollback** after [Simulate ErrP] | `Possible Error Detected • ErrP Deflection at FCz (-8.4 µV)` → `Bedroom Ceiling Light: ON ➔ OFF` → `Action Rolled Back` → epoch note "Synthetic (generated, SYN-error-seed509; seed selected to show the README value; α = 1.0; synthetic TPR 0.51 / FPR 0.005 at π = 0.18) · FCz value is a descriptive single-trial minimum; detection uses 72 features; q = 0.80" → "Suggested alternative: **Bedside Lamp**" with [Retry] / [Return to Home] |
| `verification/s5-noerrp-confirmed-1366x768.png` | Retry → Bedside Lamp → [No ErrP] | `Bedside Lamp: OFF ➔ ON`, `No Error Detected • Action Confirmed` |
| `verification/ac-caregiver-pending-1366x768.png` | AC Temp − pressed 7 times from 24 °C | Presses 1–6 EXECUTE (24 → 18). Press 7 shows "⚑ Waiting for caregiver approval · Setpoint 17°C is below the 18°C minimum · Tongue ✕ Back to withdraw" |
| `verification/dashboard-pending-1366x768.png` | **Caregiver dashboard** (key `C`) | The live request "Set Temperature 17°C" is listed **first** with focus on [Approve] (RT1-06/RT1-10). The seeded example is second. Telemetry: c = n × s = 0.8740 • High • CAREGIVER; ErrP health 0.89 with "6-subject mean cross-session BA 0.71 ± 0.09 · PRELIMINARY" |
| `verification/dashboard-approved-1366x768.png` | **After [Approve]** | "✓ Set Temperature 17°C — approved by caregiver" in ok style. "1 pending" (only the seeded example is left). The shadow table shows AC 17 °C, actor "caregiver" |
| `verification/ac-approved-patient-1366x768.png` | Patient view after approval | "✓ Caregiver approved the request"; `Air Conditioner: 18°C ➔ 17°C`; CAREGIVER APPROVAL in the panel (High: Caregiver Approval) |
| `verification/replay-decode-t020-1366x768.png` (+ `-full`) | **Replay mode decodes a real held-out trial** | Top bar "EEG: Replay Mode (BCI IV-2a A01, session E)" and "Decoder: Replay · PRELIMINARY (Plan B)" (wraps to 2 rows at 1366). Strip: "Pred: Both Feet (0.39) • Truth: Both Feet ✓ · A01E-t020 · temperature-scaled (T* = 8.0, fit on 72 A01T trials) · PRELIMINARY (Plan B)". The decoded SELECT moved S1 → Hub. Brain graph: evo0–evo3 all **178** edges with the caption "On this model the mask keeps every edge (P ≈ 1), so evo0–evo3 are identical — no pruning learned (PRELIMINARY)". The harness option names the full-session figure: "34.37 % (99/288; paper A01: 80.21 %) · these 20 trials … (10/20 correct)" |
| `verification/demo-reject-1366x768.png` | Neural MI slider 40 % → Turn On | "⚠ Not sure, please try again" banner visible (RT1-02 fixed); panel ✕ REJECT |
| `verification/demo-confirm-1366x768.png` | Neural MI slider 70 % → Turn On | CONFIRM dialog: "c = 0.70 × 0.89 = 0.6230 < 0.75 (Low) → CONFIRM · Both Feet ✓ Confirm · Tongue ✕ Cancel" |
| `verification/demo-replay-errp-1366x768.png` | Replay mode, Turn On, [Simulate ErrP] | **Real BNCI 013-2015 epoch**: "ErrP Deflection at FCz (-21.8 µV)" (measured), "Replay (BNCI 013-2015, BNCI013-S01s2-t018) … q = 0.60" → rollback → Bedside Lamp |
| `verification/demo-tamper-1366x768.png` | Dashboard after [Verify chain] then [Tamper demo] | "Chain verified ✓ (SHA-256)" before; "Chain broken at seq 91 — tampering detected" after |
| `verification/boot-1366x768.png`, `boot-1920x1080.png` | Boot via `research/scripts/screenshots.py --name boot` (refreshed today) | At 1920×1080 the KG and brain views sit in their own column |

## 4. Demo rehearsal (the README "Live Demo Script", run end to end in headless Edge)

Every step of the script in README §"Live Demo Script (5 min)" was executed with real keys and clicks (`demo.js`, results in `research/.cache/docs/demo_1366.json`):

| Step | Observed |
|---|---|
| Enter ×3 → S4 ceiling; Enter (Turn On) | EXECUTE, S5 observing, ceiling ON |
| [Simulate ErrP] | rolledBack, ceiling OFF, cards [Retry: Turn On Bedside Lamp] / [Return to Home] |
| Enter (Retry), [No ErrP] | Bedside Lamp ON, "No Error Detected • Action Confirmed", cards Continue / Return to Home |
| [Reset Demo] | S1, lights off/off/on, AC 24, the seeded approval only |
| Neural MI 40 %, Enter ×3, Enter | REJECT, banner "Not sure, please try again" visible |
| Neural MI 70 %, Enter; Enter | CONFIRM dialog; Both Feet confirms → observing → [No ErrP] → confirmed |
| [Reset Demo], ErrP auto-confirm on, Enter, D, D, Enter, D, then Enter ×7 | presses 1–6 confirmed (AC 23 … 18); press 7 → pendingCaregiver at 17 °C |
| `C`, Enter (on the focused [Approve]), `C` | approved; AC 17 °C; patient sees "Caregiver approved the request" |
| [Reset Demo], Decoder = Replay, trial A01E-t020, [Decode trial ► inject token] | Pred Both Feet ✓ (0.39) → Hub |
| Enter ×2, Enter (Turn On), [Simulate ErrP] | Replay epoch BNCI013-S01s2-t018, FCz −21.8 µV, q = 0.60 → rollback |
| `C`, [Verify chain], [Tamper demo] | "Chain verified ✓ (SHA-256)" → "Chain broken at seq 91 — tampering detected" |

## 5. PROMPT §5 acceptance checklist: honest status

| Box | Status | Evidence |
|---|---|---|
| Double-click, offline, zero console errors; namespaced classic scripts; no ES modules, fetch or CDN | **met** | `core/console-clean`, lint 81/0, `node --check` 81/0, file:// in headless Edge |
| README labels, values, initial states and shortcuts; full journey with 4 tokens | **met** | `ui/readme-strings` (34 assertions), `core/initial-state-readme`, `ui/keyboard-map`, `ui/canonical-journey`, demo rehearsal |
| SFE-GAT replication run; SD and SI per subject next to the paper, with ablations; ambiguities in an ADR | **partly met** | SD 9/9 done (**not reproduced**: 35.68 % vs 77.70 %). **SI not run. Ablations not run.** Ambiguities: ADR 0001. `docs/traceability.md` **does not exist yet** |
| JS = PyTorch within 1e-4 (SFE-GAT and ErrP) | **met** | §2 |
| Replay decodes real held-out trials with prediction next to truth; brain graph visibly evolves evo0→evo3 | **first half met; second half NOT MET** | Replay strip shows Pred/Truth. On the trained model the mask keeps every edge, so evo0 = evo3 (ADR 0001 amendment §3); the UI says so |
| ErrP trained and evaluated on a real public dataset with honest metrics; genuinely detects injected or replayed epochs and does not fire on correct ones; atomic rollback including presets | **met (PRELIMINARY)** | `docs/errp.md`: BNCI 013-2015, cross-session BA 0.710 ± 0.092. `safety/errp-synthetic-3-priors`, `safety/preset-rollback-atomic`, `safety/false-rollback-confirm`, replay TP rollback above. Replay epochs include an FN and an FP by design, so not every replayed error rolls back |
| KG answers every CQ; 0.94 first and Bedside Lamp second with the score explained; ErrP penalty; the SPARQL shown is the one that ran | **met** | kg `cq-1`…`cq-16`, `kg/canonical-scores`, `kg/errp-ranking-flip`, `kg/query-is-executed`; `node --test kg` 54/54 |
| Sliders give EXECUTE / CONFIRM / REJECT; thermal → CAREGIVER APPROVAL; audit verifies; tamper breaks it | **met** | `kg/policy-sliders`, `core/e2e-sliders-confirm-reject`, `safety/thermal-caregiver`, `core/audit-chain-verifies`, `core/audit-tamper-detected`, demo rehearsal |
| All 7 debates have a transcript and an ADR; every research claim cited | **met with merging** | 7 topics in 5 transcripts and 5 ADRs (KG + policy merged; README-fidelity + architecture merged). Citation completeness was not re-audited here |
| [Reset Demo] restores the exact initial state | **met** | `core/reset-equality`, demo rehearsal |
| Nothing committed, pushed, uploaded or published; everything inside this folder | **met** | no git repository; all outputs under `C:\Users\AK\Documents\FYP` |

## 6. Issues found while verifying (not fixed by the docs writer, who does not own these files)

1. **"ErrP logged for caregiver review (approved action)" appears even when the detector said keep (q = 0.02).**
   - Cause: `detector.js:58` returns `'log'` for every caregiver-approved action, and `navigator.js:336` maps `'log'` to that sentence.
   - The behaviour is by design (approved actions are never auto-rolled back), but the wording suggests that an ErrP occurred.
   - **Presenter:** read it as "the post-action EEG was logged for the caregiver, not acted on".
   - Suggested post-mid-eval wording: "Post-action EEG logged for caregiver review (approved action; q = …)".
2. **Plan A is not "only a config change" yet.** `research/sfegat/train.py` runs `sd` and `calib` jobs only. LOSO, ablations A1/A2/A4/A5, V6, V7 and `floor.py` need code ([replication.md](replication.md) §7). The study guide is corrected; ADR 0001 D15 still states the old intent.
3. **`docs/traceability.md` is missing.** It is a PROMPT Phase 5 deliverable (paper equation → Python function → JS function → test id).
4. **Cosmetic at 1366×768:** the policy reasoning-trace line under "Policy Decision" is clipped by the panel's bottom edge (visible in `s4-coglign-canonical`). At 1920×1080 boot, the collapsed "SPARQL query (executed)" row renders as an empty strip. Both belong to RT1-09 (deferred). Presenting at 1920×1080 or 90 % zoom avoids them.
5. **B0 numbers are not reproducible exactly yet.** A docs-writer recomputation of the D18 recipe gives a mean of 50.07 % vs the ADR amendment's ≈ 50.2 %, with per-subject differences up to 2.8 pp. Both are ad hoc; `floor.py` is still owed.
6. **Not re-verified here:** RT2's claim that the GAE weights are bitwise equal to the seed-0 init, and its epoch-100 training accuracies.

## 7. How to reproduce this page

```
cd C:/Users/AK/Documents/FYP
research/.venv/Scripts/python.exe research/scripts/run_selftest.py
node research/tests/js/run_node.js lint
node research/tests/js/run_node.js cases
node --test research/tests/js/core/core.test.js research/tests/js/safety/*.test.js research/tests/js/ui/ui.test.js research/tests/js/viz/viz.test.js research/tests/js/eeg/eeg.test.js
node --test kg/tests/*.test.js
node research/tests/js/eeg/eeg_parity.js
research/.venv/Scripts/python.exe research/tests/js/viz/run_viz_dom.py
cd research && .venv/Scripts/python.exe -m pytest -q -p no:cacheprovider tests
research/.venv/Scripts/python.exe research/scripts/screenshots.py --name boot
```

The other screenshots came from a CDP driver in the session scratchpad. It is the same pattern as `research/.cache/redteam1/cdp.js`, and it uses its own `research/.cache/edge-profile-docs-*` profile, deleted after use.
