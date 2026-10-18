# SilentAssist: Interactive FYP-I Web Prototype (POC)

**Project:** SilentAssist — Adaptive EEG-Based Assistive Home & Cognitive Support System  
**Institution:** FAST-NUCES Islamabad, Department of AI & Data Science  
**Supervisor:** Dr. Adil Majeed  
**Team:** Ali Farqaleet, Abdul Haseeb, Issa Sultan  

---

## 1. Prototype Overview

This is a proposal-stage, functional interactive prototype demonstrating how a patient with severe motor impairment (ALS, tetraplegia, SCI) can navigate a simulated smart-home environment using **four discrete motor-imagery (MI) EEG tokens**, backed by **CogLign Knowledge Graph disambiguation** and **closed-loop Error-Related Potential (ErrP) rollback**.

> [!NOTE]
> All EEG signals and classification confidences in this prototype are **simulated** via the embedded operator harness and keyboard shortcuts. The interface intentionally does not require mouse clicks for assistive navigation.

---

## 2. Fixed 4-Token Motor-Imagery Command Vocabulary

| Motor Imagery Class | Navigation Role | Keyboard Shortcuts | Operator Simulation Button |
| :--- | :--- | :--- | :--- |
| **Right Hand** | **NEXT** (Cycle forward through cards) | `→` / `D` | `[Right Hand ► Next]` |
| **Left Hand** | **PREVIOUS** (Cycle backward through cards) | `←` / `A` | `[Left Hand ◄ Previous]` |
| **Both Feet** | **SELECT / CONFIRM** (Commit action or enter menu) | `Enter` / `Space` / `S` | `[Both Feet ✓ Select]` |
| **Tongue** | **BACK / CANCEL** (Ascend menu hierarchy / abort) | `Esc` / `Backspace` / `W` | `[Tongue ✕ Back]` |

---

## 3. Screen Walkthrough & Evaluation Script

### Screen 1 — Mode Selection
- **Visual Navigation:** Large accessible cards, high-contrast active focus outlines, zero ocular strain.
- **Audio-Assisted Navigation:** Spoken auditory announcements (Web Speech API) for focused devices and action verifications.
- **Status Pills:** `EEG: Simulation Mode` • `Environment: Smart-Home Simulator`.

### Screen 2 — Assistive Home Hub
- 5 large selectable category cards:
  1. **Lights** (1 Active of 3)
  2. **Fans** (Ceiling Fan: OFF)
  3. **Air Conditioner** (24°C • Cool Mode)
  4. **TV & Media** (Smart TV: Standby)
  5. **Presets** (4 Multi-Device Semantic Routines)

### Screen 3 — Lights Fixtures
- Fixtures:
  1. **Bedroom Ceiling Light** (OFF)
  2. **Bedside Lamp** (OFF)
  3. **Living Room Light** (ON)

### Screen 4 — Action Selection & Context Reasoning Panel
- Actions: **Turn On**, **Turn Off**, **Adjust Brightness**, **Back**.
- **CogLign Context-Resolution Panel:**
  - *Decoded Intent:* `Turn On Light`
  - *Spatial Context:* `Master Bedroom (Active User Room)`
  - *Resolved Entity:* `:BedroomCeilingLight`
  - *SPARQL Match:* Score 0.94
  - *Confidence Telemetry:* Neural MI (92%), Semantic Context (89%), Risk Tier (Low: Autonomic).
  - *Policy Decision:* **EXECUTE** (or **CONFIRM** if medium confidence, **REJECT** if low, **CAREGIVER APPROVAL** if high-risk).

### Screen 5 — Action Result & Post-Action EEG Observation
- Animated state transition: `Bedroom Ceiling Light: OFF ➔ ON`.
- Enters `“Observing post-action EEG...”` with radar monitoring on electrodes `FCz` and `Cz`.
- **Success Path:** Click `[No ErrP]` in the operator panel:
  - Displays `No Error Detected • Action Confirmed`.
  - State remains `ON`.
  - Adds verified event to Caregiver Audit Log.
- **Correction Path (Rollback):** Click `[Simulate ErrP]` in the operator panel:
  - Displays `Possible Error Detected • ErrP Deflection at FCz (-8.4 µV)`.
  - Automatically restores previous state: `ON ➔ OFF`.
  - Displays `Action Rolled Back`.
  - Presents semantic disambiguation alternative: **Bedside Lamp** with `[Retry]` or `[Return to Home]` options!

### Screen 6 — Semantic Presets
- Pre-configured multi-device routines navigated with the standard 4 tokens:
  - **Night Mode**
  - **All Lights Off**
  - **Cooling Mode**
  - **Watch TV**

### Caregiver Supervision Dashboard
- Accessible via the top bar switch (`Caregiver Dashboard`) or `C` key.
- Live-synchronized appliance shadow table.
- Telemetry gauges (Neural confidence, semantic score, ErrP health).
- **High-Risk Action Approval Queue:** Interactive example of Caregiver Authorization for thermal hazard with `[Approve]` and `[Reject]` controls.
- Tamper-evident chronological audit log.

---

## 4. How to Run

1. Open `POC/index.html` in Google Chrome, Microsoft Edge, or any modern web browser.
2. No installation or Node.js server required (pure static web technologies).
3. Use the keyboard shortcuts (`A`/`D` to navigate, `Space`/`Enter` to select, `Esc` to go back) to test the hands-free navigation experience.

---

## 5. Architecture

SilentAssist is one closed loop with two graphs in it: a **brain functional-connectivity graph** (SFE-GAT) and a **semantic knowledge graph** (CogLign).

```
EEG trial --> SFE-GAT decoder --> token (Next / Previous / Select / Back) --> navigator (Screens 1-6)
                                                                                 | action request
CogLign KG (SAREF + BOT, in-browser SPARQL) --> resolver score (0.94) --> policy engine
                     ^                              EXECUTE / CONFIRM / REJECT / CAREGIVER APPROVAL
                     | ErrP penalty                                              |
ErrP detector <-- post-action EEG (FCz/Cz) <-- device state change <-------------+
     +-- q > max(t*, pi) --> atomic rollback + alternative (Bedside Lamp) --> hash-chained audit log
```

- **Browser (`POC/`):** namespaced classic scripts on `window.SA` (no ES modules, no `fetch`, no CDN). It runs from `file://` offline. Modules talk only through `SA.bus` (events) and `SA.store` (the home model). Tunables live in `SA.config`.
- **Research (`research/`):** Python packages `sfegat/`, `errp/` and `export/`. Their export scripts write model weights and replay data as JS files into `POC/js/data/`.
- **Decoder modes:** **Scripted** (the README values, no EEG), **Replay** (real held-out BCI IV-2a A01 session-E trials through the in-browser SFE-GAT forward pass), and **Synthetic** (post-mid-eval). The active mode is always shown in the top bar.
- Frozen contracts (APIs, bus events, store schema, export formats): [`docs/architecture.md`](docs/architecture.md). Decisions: [`docs/adr/`](docs/adr/) 0001–0005.

## 6. Replication Results (PRELIMINARY)

**Base paper:** SFE-GAT (Gao, Cao & Ma, *Sensors* 2026, 26, 1730). **Protocol P0:** paper-literal, settled in [ADR 0001](docs/adr/0001-replication-fidelity.md). Subject-dependent: train on session T, test once on session E. 1 seed. Full write-up: [`docs/replication.md`](docs/replication.md).

| Subject | Ours (k/288, floored) | Paper Fig. 3a |
|---|---|---|
| A01 | 34.37 % (99/288) | 80.21 % |
| A02 | 29.51 % (85/288) | 61.46 % |
| A03 | 37.15 % (107/288) | 89.24 % |
| A04 | 38.54 % (111/288) | 70.49 % |
| A05 | 26.38 % (76/288) | 72.92 % |
| A06 | 30.20 % (87/288) | 71.88 % |
| A07 | 39.23 % (113/288) | 86.11 % |
| A08 | 34.02 % (98/288) | 85.07 % |
| A09 | 51.73 % (149/288) | 81.94 % |
| **Mean** | **35.68 % (925/2592), κ 0.1424** | **77.70 %, κ 0.7027** |

- **Verdict (pre-registered bands):** **Not reproduced (PRELIMINARY, 1 seed)**, Δ = −42.02 pp.
- **Below the floor:** every subject is below the B0 floor (log10 band power + logistic regression, about 50 % mean; measured ad hoc and not yet logged as a registered run). That triggered the audit in ADR 0001.
- **Audit findings (no leakage found):**
  1. Overfitting: training accuracy reaches 91–99 %, but held-out session-T accuracy for A01 is 37.5 % (27/72).
  2. Unnormalised, heavy-tailed µV² node features.
  3. Session power shift (A02 mean band power 3.21 → 9.00 µV²).
  4. Under the paper's cross-entropy-only loss, the GAE gets no gradient. On the trained model the evolution mask keeps every edge (P ≥ 0.994), so evo0–evo3 are identical.
- **Not run tonight:** subject-independent LOSO (paper 66.59 %), ablations, Table 2 and Fig. 5/6.
- **JS ↔ PyTorch parity:** DSP 81/81 cases (worst relative error 1.8e-12). SFE-GAT logits max abs error 9.8e-15 on all 20 exported trials (gate 1e-4).
- **Exported browser model:** `sd_A01`, temperature-scaled with T* = 8.0 fit on 72 held-out A01T trials (held-out accuracy 37.5 %).

**Note on §1:** Section 1 says all EEG signals are simulated. That is true in the default **Scripted** mode. In **Replay** mode the browser decodes real, publicly available EEG with our replicated SFE-GAT model: BCI Competition IV-2a, subject A01, session E. That model scores **34.37 % (99/288) on A01E, against the paper's 80.21 %**. ErrP epochs in Replay mode come from BNCI 013-2015. The UI always says which source is active. None of this is clinically validated.

## 7. ErrP

- **Dataset:** BNCI Horizon 2020 013-2015, the monitoring-ErrP dataset (Chavarriaga & Millán 2010): 6 subjects × 2 sessions.
- **Pipeline:** CAR → causal 1–10 Hz Butterworth → baseline −0.2–0 s → 72 features (8 frontocentral channels × 9 windows, 200–650 ms) → shrinkage LDA → Platt scaling → prior shift to the action's error prior π.
- **Rollback rule:** roll back if q > max(t*, π), with t* taken from an explicit cost model (light-select t* = 0.5507).
- **Results (PRELIMINARY):**
  - cross-session (train session 1, test session 2) balanced accuracy **0.710 ± 0.092** (target ≥ 0.645, met);
  - session-2 AUC 0.780 ± 0.099;
  - deployed subject S01: BA 0.823, AUC 0.890.
  - Within-session AUC is above the 95th percentile of a 1000-permutation null for 6 of 6 subjects. The cross-session result was not permutation-tested.
- **In the browser:** the same detector runs on the exported weights, and its JS output matches Python to ≤ 1e-14.
  - **Scripted mode:** [Simulate ErrP] injects a synthetic error epoch (seed 509, FCz minimum −8.4 µV, q = 0.80), and the detector genuinely detects it.
  - **Replay mode:** a real BNCI epoch is used instead (e.g. S01 session 2, FCz −21.8 µV, q = 0.60).
- A detected ErrP penalises the rejected entity in the knowledge graph, which is why Bedside Lamp is offered.
- Full details: [`docs/errp.md`](docs/errp.md), [ADR 0002](docs/adr/0002-errp-design.md).

## 8. Live Demo Script (5 min)

The script was rehearsed end to end in headless Edge with these exact keys and clicks ([`docs/verification.md`](docs/verification.md) §4).

**Setup:**
- Double-click `POC/index.html` in Edge or Chrome. Use a full-screen window, ideally 1920×1080 or browser zoom at 90 %. At 1366×768 the policy reasoning line is clipped.
- The page opens on **Screen 1 — Mode Selection** in **Scripted** mode.
- [Simulate ErrP], [No ErrP], the Decoder menu and **More controls** are in the **operator harness** at the bottom. The sliders, the replay-trial picker, ErrP auto-confirm and [Reset Demo] are under **More controls**.
- Before you start, do one **[Reset Demo]**.

**1. Scripted EXECUTE (0:00–0:45)**
- `Enter` → Hub, `Enter` → Lights, `Enter` → Bedroom Ceiling Light, `Enter` → **Turn On**.
- The CogLign panel shows: Turn On Light • Master Bedroom (Active User Room) • :BedroomCeilingLight • Score 0.94 • Neural MI 92% • Semantic 89% • Low: Autonomic • **EXECUTE**.
- Screen 5 shows `Bedroom Ceiling Light: OFF ➔ ON` and "Observing post-action EEG...".
- Say: c = 0.92 × 0.89 = 0.8188 ≥ 0.75. The 0.94 is computed live from SPARQL results.

**2. ErrP rollback → Bedside Lamp → Retry (0:45–1:30)**
- Click **[Simulate ErrP]** (the observation waits for you).
- Screen 5 shows `Possible Error Detected • ErrP Deflection at FCz (-8.4 µV)` → `ON ➔ OFF` → `Action Rolled Back` → Bedside Lamp, with [Retry] and [Return to Home].
- Point at the epoch note: synthetic seed 509, detection uses 72 features, q = 0.80.
- `Enter` → **[Retry]** (Bedside Lamp OFF ➔ ON), then click **[No ErrP]** → `No Error Detected • Action Confirmed`.

**3. Slider-forced CONFIRM, then REJECT (1:30–2:30)**
- **More controls → [Reset Demo]**.
- `Enter`, `Enter`, `Enter` (Screen 4, Bedroom Ceiling Light).
- Drag **Neural MI** to **70 %**, then `Enter` (Turn On). The CONFIRM dialog shows "c = 0.70 × 0.89 = 0.6230 < 0.75 (Low) → CONFIRM · Both Feet ✓ Confirm · Tongue ✕ Cancel".
- Press `Esc` (Tongue ✕ Cancel). You stay on Screen 4.
  - Alternatively, `Enter` confirms and you then click **[No ErrP]**. In that case, [Reset Demo] and `Enter` ×3 to get back to Screen 4.
- Drag **Neural MI** to **40 %**, then `Enter` (Turn On). The banner shows "Not sure, please try again" and the panel shows **REJECT**.

**4. Thermal hazard → caregiver approval (2:30–3:30)**
- **[Reset Demo]** (this restores Neural MI to 92 %). Tick **ErrP auto-confirm**.
- `Enter` (Hub), `D`, `D`, `Enter` (Air Conditioner), `D` (Temp −).
- Press `Enter` **7 times**, about 2 s apart. Presses 1–6 execute and auto-confirm (24 → 18 °C). Press 7 shows "Waiting for caregiver approval · Setpoint 17°C is below the 18°C minimum".
- `C` opens the Caregiver Dashboard. The live request "Set Temperature 17°C" is listed first, with focus on its [Approve].
- `Enter` approves it. `C` returns to the patient view, which shows "Caregiver approved the request" and `Air Conditioner: 18°C ➔ 17°C`.

**5. Replay: decode a real held-out trial (3:30–4:15)**
- **[Reset Demo]** (this also turns ErrP auto-confirm off and returns to Screen 1).
- Set **Decoder → Replay** and, under More controls, **Replay trial → A01E-t020 · truth Both Feet**.
- On Screen 1, click **[Decode trial ► inject token]**.
- The strip shows "Pred: Both Feet (0.39) • Truth: Both Feet ✓ · A01E-t020 · temperature-scaled (T* = 8.0, fit on 72 A01T trials)", and the decoded Select moves to the Hub.
- Say:
  - "This trial was picked because it decodes correctly. The model's full A01E accuracy is 34.37 % (99/288), against the paper's 80.21 %."
  - Point at the brain graph: "evo0–evo3 are identical. Under the paper's cross-entropy-only loss the GAE gets no gradient, so on our model the mask keeps every edge."

**6. Replay a real ErrP epoch (4:15–4:45)**
- `Enter` (Lights), `Enter` (Bedroom Ceiling Light), `Enter` (Turn On), then click **[Simulate ErrP]**.
- A real BNCI 013-2015 epoch (BNCI013-S01s2-t018) shows a **measured** `ErrP Deflection at FCz (-21.8 µV)`, q = 0.60, and the action rolls back.
- `→`, `Enter` (Return to Home).

**7. Audit chain (4:45–5:00)**
- `C`, then **[Verify chain]** → "Chain verified ✓ (SHA-256)".
- Then **[Tamper demo]** → "Chain broken at seq … — tampering detected".
- **Always do this last.** The chain stays broken until the page is reloaded.

**Avoid during the demo:**
- **Never inject ErrP after a CONFIRM on a light.** At CONFIRM the error prior is small, so the detector correctly keeps the action. That is by design (ADR 0002), not a bug.
- For a **preset** rollback demo, set Neural MI to 70–75 % first.
- [Simulate ErrP] on **Fan or TV settings** shows "Possible Error Detected • not rolled back (setting: flag only)". That is by design.
- **Decode Replay trials only on Screen 1 or the Hub.** On Screen 4, a decoded confidence such as 0.39 is a REJECT.
- In Replay, successive [Simulate ErrP] / [No ErrP] presses step through a fixed list of real epochs, and that list includes a miss and a false alarm. [Reset Demo] rewinds it, so the first [Simulate ErrP] after a Reset is a true detection.
- After a caregiver-approved action, the line "ErrP logged for caregiver review (approved action)" means the post-action EEG was **logged, not acted on**. It appears even when no ErrP was detected.
- [Reset Demo] sits under **More controls**. If the window is shorter than 900 px, scroll the harness. In Replay mode at 1366/1280 the top bar wraps to 2 rows.

## 9. Verification

Re-run on 2026-10-14 after the red-team fixes ([`docs/verification.md`](docs/verification.md)):

| Check | Result |
|---|---|
| In-page selftest in headless Edge (`research/scripts/run_selftest.py`) | **SELFTEST-DONE pass=76 fail=0** |
| Same cases in headless Node | pass=71 fail=0 (DOM-only cases skipped) |
| Lint and `node --check` | 81 files, 0 problems, 0 failures |
| Node unit tests | core, safety, ui, viz, eeg: 54/54; KG: 54/54 |
| SFE-GAT stage parity | 16/16 |
| Viz DOM | 35/35 |
| pytest (`research/tests`) | **103 passed, 1 xfailed** (a documented ErrP filtering deviation) |
| Parity | DSP 81/81 (≤ 1.8e-12); SFE-GAT logits ≤ 9.8e-15; ErrP ≤ 1e-14 (gate 1e-4) |

**PROMPT §5 checklist items not met:**
- SI (LOSO) and the ablations were not run.
- The brain graph does not visibly evolve evo0→evo3 on the trained model.
- `docs/traceability.md` has not been written.

Screenshots are in [`docs/verification/`](docs/verification/).

## 10. How to run

1. **Double-click `POC/index.html`.** It opens in Edge or Chrome from `file://` and works fully offline: no server, no install, no internet.
2. Use the keyboard as in §2:
   - `→`/`D` Next, `←`/`A` Previous;
   - `Enter`/`Space`/`S` Select, `Esc`/`Backspace`/`W` Back;
   - `C` opens or closes the Caregiver Dashboard.
3. The operator harness at the bottom is **not patient-facing**. It holds the token buttons, [No ErrP] / [Simulate ErrP], and the Decoder menu (Scripted / Replay). Under **More controls** are the confidence sliders, the replay-trial picker, room, voice, ErrP auto-confirm, reduced motion and **[Reset Demo]**.
4. Self-test: open `POC/index.html?selftest=1`, or run `research/.venv/Scripts/python.exe research/scripts/run_selftest.py`.
