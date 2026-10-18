# Debate 7: assistive-ux — transcript and judge ruling

**Date:** 2026-10-14
**Outcome:** ADR `docs/adr/0005-assistive-ux.md` (Accepted 2026-10-14).

## Participants and status (degraded debate)

| Role | Status |
|---|---|
| Proposer A (rigor-first), opening | Filed |
| Proposer B (demo-first), opening | Filed |
| Critic | Filed: 38 findings, 6 BLOCKERs |
| Rebuttal A | **Failed (network error)**. Nothing filed. |
| Rebuttal B | **Failed (network error)**. Nothing filed. |
| Original judge | **Failed (network error)**. This ruling is a fresh, impartial re-run. |

## Surviving inputs

The verbatim inputs (Proposer A, Proposer B, Critic) are in `docs/debate/_inputs/assistive-ux.md`. They total about 83 KB, so they are referenced rather than copied here.

Context the judge also read:
- README.md;
- `docs/research/assistive-ux-safety.md` and `docs/research/knowledge-graph.md`, referenced via the proposals;
- ADR 0002 (ErrP), accepted, which binds D14–D17 and D23;
- the Proposer-B-only input of Debate 5 (kg-and-policy), not yet ruled.

## Judge ruling, item by item on the critic's findings

Because no rebuttals arrived, each finding is ruled on its merits.

| # | Sev | Finding | Ruling | ADR ref |
|---|---|---|---|---|
| 1 | BLOCKER | The policy uses the chosen entity's prior-laden score, so explicit choices get REJECTed | **Upheld.** An explicit selection that passes the type gate can drop at most to CONFIRM on the semantic term; a no-op is announced and not actuated. Binding requirement handed to Debate 5. Non-light s comes from Debate 5 (0.95 single-candidate, 1.00 presets). | D10 |
| 2 | MAJOR | The README's Retry is KG-chooses semantics | **Upheld.** Stated as a hybrid: explicit on S3, KG-chosen only for the post-ErrP alternative, shown and spoken before SELECT. Retry at 0.769 must handle EXECUTE or CONFIRM. | D8, D10 |
| 3 | BLOCKER | The stepper conflicts with the S5 flow | **Upheld.** Device actions (fan/AC/TV/brightness) use inline observation on the device screen; S5 is only for lights and presets. The thermal segment runs with auto-confirm ON, so 24 → 17 costs 7 SELECTs. X8: Debate 5's in-band AC c = 0.874 ≥ 0.85, so EXECUTE (listed as a revisit trigger). | D9, D11 |
| 4 | MAJOR | The demo script drifts off the README values | **Upheld.** Reset between segments; Reset reloads the KG recency seed. | D27 |
| 5 | MAJOR | B's [Withdraw] option makes SELECT withdraw | **Upheld.** Adopt A: only BACK withdraws. | D14 |
| 6 | MAJOR | `[Back to Fixtures]` is invented; rollback is undefined for non-lights | **Upheld.** Success: Continue / Return to Home (unbracketed Continue). Preset rollback: [Retry] = same preset with the h-flag forcing CONFIRM. Device rollback is inline. | D8, D9 |
| 7 | MAJOR | The dwell lets a double SELECT through | **Upheld.** The lockout starts at the committing SELECT and lasts until the errp result. | D11 |
| 8 | MAJOR | ErrP buttons were treated as outcome switches | **Upheld.** The buttons inject events and the UI renders the detector's verdict (consistent with ADR 0002 D23). | D11 |
| 9 | MINOR | Brightness on an OFF light is compound | **Ruled.** Diff "OFF ➔ ON 50%". It is the ADR 0002 `setting` class, i.e. flag-only, so no rollback saga is needed tonight. | D6 |
| 10 | MINOR | Dynamic Turn On/Off labels | **Upheld.** "Power" + "Currently ON/OFF". | D6 |
| 11 | MINOR | G9 values | **Ruled.** TV volume step 10; uppercase fan state ("Ceiling Fan: LOW"); AC off → "OFF • 24°C • Cool Mode"; device Back cards kept, S3/S6 none; `C` is global. | D4, D6, D7 |
| 12 | BLOCKER | Gate C livelocks in Scripted mode | **Upheld.** The gate applies only in Replay/Synthetic. | D12 |
| 13 | MAJOR | The false-confirm rate is understated | **Upheld.** 8.7 % end-to-end (7.4 % per token); gate cost not modelled; 1.175 tokens. B's "+16 % of a 4-token flow" is arithmetically wrong; the correct statement is +1 nominal (4 → 5), or +16 % of 7.2 expected tokens. | D13 |
| 14 | MINOR | Reason-line arithmetic in the UI | **Upheld.** Render `policy.trace` verbatim. | D12 |
| 15 | MINOR | The CONFIRM container is unspecified | **Upheld.** B's dialog with a single-option listbox. | D12 |
| 16 | BLOCKER | Refocus on pointerup breaks `<select>` | **Upheld.** Select: refocus on change, blur and Esc. Range: refocus on pointerup and change. | D4 |
| 17 | MAJOR | Letter tokens fire with a select focused | **Upheld.** Ignore all token keys when an input or select is the target. | D4 |
| 18 | MAJOR | Patient tokens stay live under the dashboard | **Ruled for B.** All patient tokens are ignored while the dashboard is open; withdrawal is shown on the patient stage. A's patient strip and B's "simulated, no authentication" banner are both adopted. | D28 |
| 19 | MINOR | 18 px patient text | **Upheld.** Every patient-stage string ≥ 20 px (marker 20, README pills 20, caption 22). The rail is classified as examiner text. | D32 |
| 20 | MINOR | 12 px padding clips the ring | **Upheld.** 20 px padding; no `overflow:hidden`. | D3 |
| 21 | MINOR | Esc and user activation | **Noted.** Documented; the caption covers it. | D17 |
| 22 | BLOCKER | The online-voice toggle | **Upheld.** Removed; `allowOnline = false` is hard. | D15 |
| 23 | MAJOR | Visual mode silences safety speech | **Upheld.** A's split; the caption label is "Caption:". | D18, D20 |
| 24 | MINOR | The lexicon key uses U+2212 | **Upheld.** Keyed on README bytes; the self-test asserts the hit. | D19 |
| 25 | MINOR | Curly quotes and brackets | **Ruled.** Render `“Observing post-action EEG...”` with the quotes. All README-bracketed labels use CSS brackets. | D35 |
| 26 | MINOR | The thermal advisory as safety speech | **Upheld.** The advisory is post-mid-eval; if enabled later, it is a navigation-priority caption only. | D30 |
| 27 | BLOCKER | The viva viewport is 1536×730 | **Upheld.** The Standard tier (≥ 1280×600) shows both graphs side by side at all times; 1536×730 heads the screenshot matrix. | D22 |
| 28 | MAJOR | The 1920 tier overflows | **Upheld.** The Large tier is gated at ≥ 1800×900, with graphs at 50 % of the rail height each and a compact dock below 900 px tall. | D22, D26 |
| 29 | MAJOR | The tab auto-follow race | **Moot.** No tabs; both graphs are always visible. The S4 panel holds the last result on Adjust Brightness/Back. | D10, D22 |
| 30 | MAJOR | Fake forward pass in Scripted mode | **Upheld.** Static montage + caption. | D24 |
| 31 | MAJOR | No stub contingency | **Upheld.** "STUB DATA — not model output" banner; Replay disabled. | D24 |
| 32 | MAJOR | B lacks PRELIMINARY and attribution labels | **Upheld.** PRELIMINARY in the decoder pill and decode strip; the attribution line is always visible in the dock. The decoder pill is shortened so the top bar does not wrap. | D21, D25, D26 |
| 33 | MINOR | `cssRules` on `file://` | **Upheld.** Use computed styles. | D35 |
| 34 | MAJOR/MINOR | Colour defects | **Upheld.** A's palette; warn is never a border or ring; danger lightened to `#FF9C9C` (≥ 7.16 everywhere, recomputed tonight). | D31 |
| 35 | — | X6 conflict | **Bound by ADR 0002 D16** (no auto-rollback after approval; log-only tonight). A's argument is recorded as residual dissent for the post-mid-eval [Undo]/[Keep]. | Residual dissent |
| 36 | — | G12 Replay | **Ruled for B's separate "Decode trial ► inject token".** Keyboard and README buttons stay scripted tokens; a "Decoding…" lockout applies; bus names belong to Debate 6. | D25 |
| 37 | — | README extras | **Upheld.** Standby, call-caregiver, pre-focus, thermal advisory, non-modal wait and HMAC are all post-mid-eval. | D29, D30 |
| 38 | — | Buildability | **Upheld.** One listbox + a declarative screen table; 4 CSS files; a prioritised build order. | D36 |

## Positions adopted, by proposer

**Proposer A:**
- store-driven focus spec;
- focus memory;
- BACK semantics;
- Design B + gate C (with the gate scoped);
- the modal pending card;
- the speech contract (local-only, priorities, lexicon);
- explicit per-screen column tables;
- honesty labels;
- the palette;
- Reset-appends-audit.

**Proposer B:**
- the CONFIRM dialog markup;
- the "Power" cards;
- fan entry focus;
- the Scripted-mode static brain graph;
- the dashboard token lockout and "simulated" banner;
- the declarative single-listbox build;
- the separate Replay decode button;
- the voice poll schedule and the latest-navigation-after-safety behaviour;
- the computed-style contrast check;
- the thermal advisory deferred.

**Judge's own additions:**
- the explicit-choice floor;
- inline device observation;
- the Standard tier with both graphs always visible;
- danger `#FF9C9C`;
- the "Caption:" label;
- unbracketed "Continue";
- the dock attribution line always visible;
- the dashboard ignoring all patient tokens;
- TV volume step 10.

## Full ruling

The full, numbered ruling (D1–D36), rejected alternatives, residual dissent, consequences, the tonight/post-mid-eval split and revisit conditions follow verbatim from ADR 0005.

---

## Decision

### A. Focus treatment

**D1. Focus lives in the store, not the DOM.**
- `SA.store.ui.focus[screenId]` holds an integer index. `SA.ui.navigator` is the only writer.
- On every change, the renderer:
  - sets `.is-focused` and `aria-selected="true"` on exactly one `role="option"`, and `aria-selected="false"` on the rest;
  - sets `aria-activedescendant` on the `role="listbox"`.
- Each listbox has `tabindex="0"`, `aria-orientation="horizontal"` and a per-screen `aria-label` (e.g. "Home categories", "Light fixtures"). Each option has `aria-posinset` and `aria-setsize`.
- On mount, the screen calls `listbox.focus({preventScroll:true})`.
- `[role=listbox]:focus { outline: none }`. The card carries the indicator. Nothing depends on `:focus` or `:focus-visible`.
- Cards contain no nested interactive elements.

**D2. Look of the focused card.**
- `outline: 6px solid var(--focus-ring)`, `outline-offset: 4px`.
- The border becomes `--focus-ring`.
- The background becomes `--surface-focus`. This is decorative only.
- Static `transform: scale(1.04)`. With motion it transitions over 120 ms; under reduced motion it applies instantly, because it is a state, not an animation.
- Text marker **"● Focused"** at the top-left inside the card: **20 px / 700**, `--on-focus` on `--focus-ring` (12.19:1), `aria-hidden="true"`.
  - Every card reserves the marker row (`visibility:hidden` when unfocused), so content never shifts.
- Unfocused cards have a 2 px `--border`.
- Focus is conveyed by ring thickness, scale and text, never by colour alone.

**D3. Overflow safety.**
- Listbox container padding is **20 px**. The overhang (ring 6 + offset 4 + scale ≈ 5) is ≈ 15 px, so the padding covers it.
- Card gap is 24 px.
- **`overflow:hidden` is forbidden** on listbox containers and their ancestors inside the stage.
- Cards have `scroll-margin: 24px`. The renderer calls `scrollIntoView({block:'nearest'})` on each focus change.

**D4. Input hygiene** (`POC/js/input/keyboard.js`, `POC/js/input/harness.js`).
- The listener is on `window`, in the capture phase.
- It ignores `event.repeat`, keys held with Ctrl/Alt/Meta, and any token key whose `event.target.closest('input,select,textarea')` matches. That includes letter keys, so select type-ahead cannot fire as well.
- Debounce: `SA.config.input.minInterTokenMs = 250`.
- `preventDefault()` on Space, the arrows, Enter, Esc and Backspace.
- `C` toggles the dashboard globally.
- Harness and caregiver `<button>`s:
  - get `tabindex="-1"`;
  - get a delegated `mousedown → preventDefault()`.
- Refocus rules (fixes critic #16):
  - `<select>`: call `SA.ui.navigator.refocus()` on `change`, on `blur`, and on `keydown` Escape. **Never on `pointerup`**, which would close the popup.
  - `<input type=range>`: refocus on `pointerup` and `change`.
- Every harness-originated token carries `source:'operator'` and is audited with `actor:'operator'`.

### B. Navigation

**D5. Global rules.**
- **Wrap-around** is on for every list with ≥ 2 items (`SA.config.ui.wrap = true`; README says "Cycle").
- A wrap is announced as "Wrapped to first. Lights, 1 of 5".
- Order is DOM order, row-major.
- A position line **"n of m"** (20 px) sits under every listbox and is spoken.
- **Focus memory:** BACK returns focus to the card you entered from (`ui.focusMemory`).
- There are **no timers**: focus never auto-advances.
- A "Back" card does exactly what the BACK token does.
- Default entry focus is item 1, except as listed in D6.

**D6. Screen table.** Implement it as **one declarative table** (`SA.ui.screens`), with one generic listbox. Each row gives items, SELECT target, BACK target and entry focus. Screen ids for PROMPT additions are non-numbered (`devices/fan`, `devices/ac`, `devices/tv`, `lights/brightness`, `confirm`, `pending`). Card titles below are exact; README parenthetical values render as the card subtitle without the parentheses.

| Screen | Items, in order | SELECT | BACK |
|---|---|---|---|
| S1 Mode Selection | **Visual Navigation**, **Audio-Assisted Navigation**. Subtitles are the README description sentences. | → Hub. Visual sets `ui.audioMode='visual'` (navigation speech off, safety speech on). Audio-Assisted sets `'audio'` (all speech). | **No-op.** Says and captions "This is the first screen". Audited as TOKEN. Never exits or reloads. |
| S2 Hub | Lights `1 Active of 3`; Fans `Ceiling Fan: OFF`; Air Conditioner `24°C • Cool Mode`; TV & Media `Smart TV: Standby`; Presets `4 Multi-Device Semantic Routines`. Subtitles render live from the store (D7). | Lights → S3. Fans/AC/TV go straight to their device screen. Presets → S6. | → S1, focus restored |
| S3 Lights Fixtures | Bedroom Ceiling Light `OFF`; Bedside Lamp `OFF`; Living Room Light `ON`. **No Back card** (README lists exactly three). | → S4 for that fixture | → Hub, focus on Lights |
| S4 Actions | **Turn On**, **Turn Off**, **Adjust Brightness**, **Back**. Entry focus: Turn On. | Turn On/Off → policy (D10). Adjust Brightness → `lights/brightness`. Back = BACK. | → S3, focus on the fixture |
| lights/brightness | 25%, 50%, 75%, 100%, Back. Entry focus: the level nearest the current brightness. | Policy. On an OFF light the diff is "OFF ➔ ON 50%" (power + level). Observation is **inline** (D9). Focus stays. | → S4 |
| devices/fan | Off, Low, Medium, High, Back. Entry focus: current speed, or Low when OFF. A "Current" text badge marks the active option. | Policy → inline observation. Focus stays. Off keeps the last speed. | → Hub, focus on Fans |
| devices/ac | Power (subtitle "Currently ON"/"Currently OFF"), Temp −, Temp +, Mode: Cool, Mode: Fan, Mode: Dry, Back | Policy → inline observation. Focus stays, so the Temp keys act as steppers. Step 1 °C, range **16–32 °C**, clamped. | → Hub, focus on AC |
| devices/tv | Power (subtitle "Currently ON"/"Currently Standby"), Channel −, Channel +, Volume −, Volume +, Back | In Standby, Channel/Volume show "(TV in standby)". SELECT says "Turn the TV on first", with no actuation. Channel 1–99 wraps. **Volume 0–100, step 10**, clamped. Initial Ch 1 / Vol 20. Focus stays. | → Hub, focus on TV |
| S5 Result | Used **only for light Turn On/Turn Off and presets** (the README flow). Observing state: no listbox, tokens locked (D11). Outcome cards in D8. | see D8 | see D8 |
| S6 Presets | **Night Mode**, **All Lights Off**, **Cooling Mode**, **Watch TV**. No Back card. | Policy runs first. REJECT/CAREGIVER are handled per D10/D12; otherwise a diff preview (D10). | → Hub, focus on Presets |

- Device screens have a Back card for consistency with README S4. S3 and S6 do not, because the README lists their items exactly. The extra stop per wrap cycle is accepted.

**D7. Hub subtitles** (fixes the open G9 values; states are uppercase, as README writes "OFF"/"ON"):
- `n Active of 3`.
- `Ceiling Fan: OFF`, or `Ceiling Fan: LOW` / `MEDIUM` / `HIGH`.
- `24°C • Cool Mode` (also `Fan Mode`, `Dry Mode`). When the AC is off: `OFF • 24°C • Cool Mode`.
- `Smart TV: Standby`, or `Smart TV: ON • Ch 1 • Vol 20`.
- `4 Multi-Device Semantic Routines`.
- Initial state reproduces README exactly. AC is initially ON, Cool, 24 °C.

**D8. S5 outcome cards.**
- **Success path** (`No Error Detected • Action Confirmed`):
  - cards **Continue** (focused; → the screen the action came from, with focus kept) and **Return to Home**;
  - BACK = Continue;
  - "Continue" is a PROMPT-level addition and is rendered **without brackets**.
- **Rollback path, light** (README):
  - `Possible Error Detected • ErrP Deflection at FCz (-8.4 µV)`, then `ON ➔ OFF`, then `Action Rolled Back`;
  - the line "Suggested alternative: **Bedside Lamp**";
  - cards **[Retry]** (focused, subtitle "Turn On Bedside Lamp") and **[Return to Home]**;
  - Retry sends the alternative through the full policy and renders whatever it returns. At the default sliders c = 0.769, which is EXECUTE at 0.75 but only 0.019 above it, so CONFIRM must also work;
  - **BACK = Return to Home**.
- **Rollback path, preset** (no KG alternative):
  - **[Retry]** re-issues the same preset, and the ErrP h-flag forces CONFIRM, so the diff preview is shown again;
  - **[Return to Home]**.
- **A second rollback in the same episode** returns to Home (ADR 0002 D17).
- **Flag-only outcomes** (ADR 0002 D14/D15) render the ADR 0002 strings and the Continue/Return to Home cards.

**D9. Inline observation on device screens** (fixes critic #3).
- Fan, AC, TV and brightness actions **do not go to S5**. The device screen stays, and an **observation band** appears at the top of the stage:
  - `“Observing post-action EEG...”` with the static FCz/Cz radar glyph;
  - then the outcome line, using the README string or the ADR 0002 flag-only string.
- Tokens are locked as in D11. Focus stays on the control just used.
- The band clears on the next token.
- Thermal demo cost: 24 → 17 °C is **7 SELECTs** with ErrP auto-confirm ON.

**D10. Screen 4 reading: "KG-validates-focused", with a hybrid for Retry** (resolves X9 and critic #1, #2).
- **Target.**
  - The S3 selection is always the actuated entity.
  - The only KG-chosen referent is the **post-ErrP alternative** on S5, and it is shown and spoken before the SELECT that acts on it. That is the README's own hybrid.
- **When the resolver runs.** It runs when S4 focus lands on Turn On or Turn Off: `SA.kg.resolve({command, targetClass}, ctx)` re-scores all fixtures.
- **Panel values:**
  - Decoded Intent is verb + class (`Turn On Light`).
  - Resolved Entity and SPARQL Match are **the chosen fixture** and its score.
  - An extra line reads `KG top candidate: :BedroomCeilingLight ✓ matches selection`, or `KG top: <iri> (<score>) ≠ selection`.
  - With focus on Adjust Brightness or Back, the panel keeps the last result and shows a "Preview" badge.
- **Canonical case.** It renders `:BedroomCeilingLight`, 0.94, 92 %, 89 %, Low: Autonomic, EXECUTE exactly.
- **Requirement handed to Debate 5 (binding on the UX side):**
  - An **explicit selection that passes the type gate can never be REJECTed on the semantic term alone**. The spatial/recency prior can drop it at most to **CONFIRM**.
  - REJECT stays for neural confidence below the floor (n < 0.40).
  - A **no-op** (Turn On on an ON light) shows "Living Room Light is already ON", with no actuation, audited as `REJECT(noop)`.
  - Without this, "Turn Off Living Room Light" (c ≈ 0.481) would be unreachable from the bedroom.
- **Non-light semantic term.** Use the Debate 5 values (single-candidate s = 0.95; presets s = 1.00, "KG-validated 4/4 steps"). The panel prints them from the trace.
- **KG pre-focus on S3 is OFF tomorrow.** `SA.config.ui.kgPrefocus = false` is reserved. The verb is unknown on S3, and pre-focus saves 0 tokens in the canonical flow.

**D11. Lockout and dwell** (fixes critic #7).
- The lockout starts **at the committing SELECT**, not at actuation.
- It lasts until the detector's `errp` result.
- Tokens that arrive inside it are ignored. "Observing — please wait" is captioned once.
- `SA.config.ui.decisionDwellMs = 800`: the EXECUTE decision stays visible on S4/S6 before S5, and sits inside the lockout.
- ErrP auto-confirm (harness toggle, **default OFF**) fires `[No ErrP]` after `SA.config.errp.autoConfirmDelayMs = 1500` ms. Per ADR 0002 D23 that runs the synthetic-correct epoch; it never sets an outcome.
- The harness emits an injection event (proposed `errp:inject {kind:'error'|'correct'}`). The UI renders the detector's verdict, including a disagreement.

### C. CONFIRM and caregiver-pending

**D12. CONFIRM** (Design B + gate C; sub-state `ui.subState='confirm'`, screen id `confirm`; no README label changes).
- **Markup:** a `role="dialog"` with `aria-modal="true"` and `aria-labelledby`. Inside it, a listbox with **one** option, focused: "✓ Confirm: Turn On Bedroom Ceiling Light".
  - There is no Cancel card for a stray NEXT to land on.
  - The listbox `aria-label` states "Both Feet to confirm, Tongue to cancel".
- **Content:**
  - diff line `Bedroom Ceiling Light: OFF ➔ ON`;
  - reason line **rendered verbatim from `policy.trace`**, with no arithmetic in UI code;
  - instruction `Both Feet ✓ Confirm · Tongue ✕ Cancel`.
- **Tokens:**
  - SELECT confirms.
  - BACK cancels: back to the list, focus on the same action, audited `CONFIRM_CANCELLED`.
  - NEXT/PREV re-prompt: the prompt is re-spoken and the counter "Re-prompt n" increases.
- **Gate C:** `SA.config.policy.confirmTokenMinConf = 0.60`, applied **only in Replay/Synthetic** decoder modes (the token's own softmax). **It is disabled in Scripted mode** (fixes the critic #12 livelock).
- **No deadline.** `confirmTimeoutMs = 0`. If it is ever enabled, a timeout cancels and never executes.
- **Presets.** The mandatory diff preview **is** the confirm step, with the same grammar, so a preset is never asked twice. REJECT/CAREGIVER are evaluated before the preview.
- **REJECT** is not a dialog:
  - S4 stays, focus is unchanged;
  - "✕ REJECT" with the trace in the panel;
  - "Not sure, please try again" to `#sa-alert` and speech;
  - no actuation.
- **Audit:** `DECISION(CONFIRM)`, then `CONFIRM_ACCEPTED` or `CONFIRM_CANCELLED`, plus the re-prompt count.

**D13. Token cost, stated honestly** (UX §2.2, uniform confusion, P = 0.777, [MODEL]).
- Nominal: **+1 Both-Feet token**. The canonical flow from S1 goes from 4 to 5 nominal tokens.
- Expected **1.175 tokens per confirm**, i.e. 1 / (1 − 2(1−P)/3). That is about +16 % on the 7.2 expected-token canonical flow.
- P(confirm | intended confirm) = 0.913, so **false-cancel is 8.7 %**.
- **False-confirm is 8.7 % end-to-end** (7.4 % per token).
- **Gate C cost is not modelled.**
- Design A (generic two-button dialog) costs 1.81 and is rejected.
- Feet↔tongue confusion may exceed the uniform model [UNVERIFIED]. If the Plan-B confusion matrix exists at build freeze, print the non-uniform figures in `docs/verification.md`, labelled PRELIMINARY; otherwise this is post-mid-eval.

**D14. CAREGIVER APPROVAL: modal pending card** (screen id `pending`).
- **Card:** "Waiting for caregiver approval", plus the rule that fired from the trace (e.g. "Setpoint 17°C is below the 18°C minimum"), plus "Tongue ✕ Back to withdraw".
- **Tokens:**
  - **BACK withdraws** (`WITHDRAWN`, audited, removed from the queue).
  - NEXT/PREV/SELECT only re-prompt. **SELECT never withdraws** (critic #5).
- **Outcomes:**
  - Approve: spoken (safety priority), `#sa-alert`, then inline observation on the AC screen.
  - Reject: spoken, then back to the AC screen with focus on Temp −.
- **Expiry:** `SA.config.caregiver.requestTimeoutMs = 300000` → EXPIRED. Never auto-approved.
- **After approval, ErrP is log-only** (ADR 0002 D16). The UI shows no rollback.

### D. Audio (`POC/js/voice/speech.js`, `SA.voice.speech`)

**D15. Voice selection.**
- `pickVoice()` takes the first voice with `localService === true` and `lang` starting `en`, ranked en-US first, then Zira, David, Mark, then any other.
- **Online voices are never used, and there is no override toggle** (`SA.config.voice.allowOnline = false`, hard; critic #22, CLAUDE.md §1).
- If no local voice exists, the app is **text-only**, with the top-bar pill `Voice: text only (no offline voice)`.

**D16. Loading.** Run `pickVoice()` at load, on every `voiceschanged`, and at 250, 1000 and 3000 ms.

**D17. Activation.**
- No speech at page load. The first token keydown or pointerdown is the gesture.
- Esc may not grant user activation [UNVERIFIED], so the first BACK's utterance may be dropped. The caption still shows it. This is documented.

**D18. Priorities.**
- **Navigation utterances:** `cancel()`, then `speak()` inside `setTimeout(0)`; the newest wins.
- **Safety utterances** (REJECT, rollback, caregiver result, withdraw, expiry): queued, and never cancelled by navigation. A safety utterance cancels any navigation speech in progress.
- While safety speech is active, navigation text is still captioned. Only the **latest** navigation string is kept, and it is spoken when the safety queue drains.
- **Visual mode:** navigation speech off, safety speech on.
- **Audio-Assisted mode:** all speech.

**D19. Format.**
- Each utterance is ≤ `SA.config.voice.maxChars = 160`, split at sentence boundaries.
- rate 0.95, pitch 1.0, `lang 'en-US'`.
- Speech text ≠ display text. `SA.voice.lexicon` is **keyed on README bytes**:

  | Display (README bytes) | Spoken |
  |---|---|
  | `FCz` | "F C z" |
  | `Cz` | "C z" |
  | `-8.4 µV` (hyphen-minus 0x2D, micro sign U+00B5) | "minus 8 point 4 microvolts" |
  | `°C` | " degrees Celsius" |
  | `➔` | " to " |
  | `•` | ", " |

- The self-test asserts that the `-8.4 µV` lexicon key hits.
- No state transition awaits `onend`. `canceled`/`interrupted` errors are normal.

**D20. Text fallback and aria-live.** `index.html` ships both regions, empty at load:
- `#sa-status`: `role="status"`, `aria-live="polite"`, `aria-atomic="true"`. It is **visible as the caption bar** at the bottom of the stage: 22 px, `--text-muted` label "Caption:" (not "Spoken:", which would be false in Visual mode).
- `#sa-alert`: `role="alert"` and **no** `aria-live` attribute. It is a banner at the top of the stage that persists until the next token.
- Every `say()` writes to its region whether or not speech is on.
- Repeated identical text: clear the region, then set it in the next animation frame.
- The self-test asserts on region text only, never on speech.
- Documented: screen-reader users should turn Voice off to avoid hearing everything twice.

### E. Layout (`POC/css/layout.css`)

**D21. Shell.**
- Grid rows: top bar **56 px**, then `main 1fr`, then the harness dock (**in flow, never overlays**).
- Top bar contents:
  - the title "SilentAssist";
  - README pills `EEG: Simulation Mode` • `Environment: Smart-Home Simulator`, verbatim, always, at 20 px;
  - the decoder pill (16 px), short form `Decoder: Scripted` or `Decoder: Replay · PRELIMINARY (Plan B)`. Trial details go in the decode strip, not the top bar;
  - the voice pill (16 px);
  - the `Caregiver Dashboard` switch.
- Below 1440 px wide, the title collapses to an icon plus "SilentAssist" and the pills keep one line (`white-space:nowrap`, `text-overflow:ellipsis` only on the decoder pill).

**D22. Tiers** (critic #27/#28; the viva viewport is the design target).

| Tier | Media query | Columns | Rail |
|---|---|---|---|
| **Standard** (viva 1536×730, 1366×768 headed ≈ 1366×657) | `min-width:1280px and min-height:600px` (default) | `minmax(0,1fr) 480px`, gap 16, padding 16 | Top: **CogLign panel** (flex 1, scrolls internally; README fields + trace line + KG-top line; SPARQL in a `<details>`, collapsed). Bottom: **both graphs side by side**, each 232 × 220 px: KG subgraph left, brain graph right. **Both are always visible; there are no tabs.** |
| **Large** (true 1920×1080 at 100 %, headed ≈ 1920×950) | `min-width:1800px and min-height:900px` | `minmax(0,1fr) 440px 440px` | Rail A: CogLign panel at full height, SPARQL **always visible** (6-line mono block, `max-height:120px`). Rail B: KG subgraph above brain graph, each 50 % of the height. |
| **Narrow** (150 % zoom, < 1280 wide or < 600 tall) | otherwise | single column | Stage, then rail below. The page scrolls vertically; the dock is forced compact. |

- With both graphs always visible, the critic's auto-follow tab race (#29) cannot occur.

**D23. Stage.**
- Stack: screen title (32 px), `#sa-alert` banner when present, observation band (D9) when present, listbox, "n of m", then the caption bar.
- Explicit per-screen columns, the same at every tier, so screenshots are deterministic:

  | Screen | Columns |
  |---|---|
  | S1 | 2 |
  | Hub | 3 (3 + 2) |
  | S3 | 3 |
  | S4 | 2 × 2 |
  | brightness | 5 |
  | fan | 5 |
  | AC | 4 (4 + 3) |
  | TV | 3 (3 + 3) |
  | S5 outcome | 2 |
  | S6 | 2 × 2 |
  | confirm / pending | 1 |

- Card min-height: **128 px** under `max-height:700px`, **148 px** otherwise, **180 px** in the Large tier.

**D24. Graph contents.**
- **KG subgraph** (`kg/kg-view.js`, inline SVG, ≤ 8 nodes):
  - nodes: Patient, MasterBedroom, LivingRoom, the 3 lights, and the intent node;
  - edges: `sa:activeRoom` and `bot:containsElement`;
  - the winner has a 4 px solid ring and "1st · 0.94"; the runner-up a 3 px dashed ring and "2nd · 0.88"; the third "3rd · 0.38";
  - after an ErrP, a text annotation of the penalty the resolver returns;
  - short node labels ("Ceiling", "Lamp", "Living"), with full IRIs in the panel.
- **Brain graph** (`brain/brain-graph-view.js`):
  - a 22-electrode scalp SVG (rows 1/5/7/5/3/1), with FCz (channel 4) and Cz (channel 10) ringed;
  - stage chips `evo0 evo1 evo2 evo3`, each with its **computed** edge count;
  - kept edges 2 px `--info`; just-removed edges dashed for one step;
  - `--dur-evo-step 700ms`, discrete under reduced motion;
  - caption "Edges kept by the model's learned mask — model behaviour, not neurophysiology".
- **Scripted mode** (critic #30): a static montage with the caption "Scripted mode: tokens are not decoded from EEG. Switch to Replay to see SFE-GAT evolve the graph." There is **no animation tied to keypresses**.
- **Stub data** (critic #31): if `sfegat-weights.js`/`mi-replay.js` are missing or flagged stub:
  - the brain card and the decoder pill show **"STUB DATA — not model output"**;
  - the Replay option is disabled.

**D25. Replay inside navigation** (G12, critic #36).
- README token buttons and keyboard keys **always emit their labelled token**, as operator-scripted tokens with slider confidence. The decode strip says "Scripted token (not decoded)".
- Only a separate harness button, **"Decode trial ► inject token"**, emits a decoded token from the chosen replay trial:
  - "Decoding…" lockout until the forward pass returns;
  - decode strip `Pred: Both Feet (0.71) • Truth: Both Feet ✓/✗ · PRELIMINARY (Plan B)`;
  - **a mis-decode moves the cursor for real**.
- Bus names are Debate 6's.

**D26. Harness dock** (label "Operator Harness — not patient-facing"; 2 px dashed `--harness-edge` top border; `--bg-harness`).
- **Compact (76 px), the default when `innerHeight < 900`:**
  - row 1: the four README buttons in README order (`[Right Hand ► Next]`, `[Left Hand ◄ Previous]`, `[Both Feet ✓ Select]`, `[Tongue ✕ Back]`), then `[No ErrP]`, `[Simulate ErrP]`, the decoder-mode select, `[More controls ▾]`;
  - row 2, always visible: the data line "Data: BCI Competition IV-2a (BNCI 001-2014) / BNCI 013-2015 — attribution; licence pending supervisor confirmation".
- **Expanded (+150 px; default when `innerHeight ≥ 900`):**
  - Neural MI and Semantic sliders with numeric values (defaults 92/89);
  - the replay-trial picker and "Decode trial ► inject token";
  - the active-room select;
  - toggles: Voice, ErrP auto-confirm, Reduced motion;
  - `[Reset Demo]`.
  - It pushes content up and never covers it.

**D27. Reset.** `[Reset Demo]` restores:
- devices;
- **the KG, including the recency seed** (so 0.94 / 89 % reappear);
- policy memory and the ErrP episode state;
- S1 with focus on item 1;
- decoder Scripted, sliders 92/89, room Master Bedroom, toggle defaults.

It **appends** a `RESET` audit entry carrying the previous head hash and never wipes the log. **The demo script puts Reset between segments** (critic #4).

**D28. Caregiver dashboard** (`C` or the top-bar switch; it replaces stage and rail; the dock stays).
- A banner **"Caregiver view — simulated, no authentication"**.
- A "Patient view" strip: screen, focused item, decoder mode, pending request.
- **While it is open, all patient tokens are ignored** (critic #18). Enter/Space activate dashboard buttons natively; `C` closes it. Withdrawal is demonstrated on the patient stage.
- 12-column grid:

  | Row | Contents |
  |---|---|
  | 1 | **High-Risk Action Approval Queue** (7 col): the pending count; per item, decoded intent, n and s, current ➔ target, the rule that fired, elapsed time, and `[Approve]`/`[Reject]` at 44 px. **Gauges** (5 col): Neural, Semantic and ErrP health, each a bar plus a number, ErrP labelled per ADR 0002 D23. |
  | 2 | **Shadow table** (6 col): device, room, state, last change, actor. **Live brain graph** (6 col). |
  | 3 | **Audit log**, full width, internal scroll: badge "Chain verified ✓ (SHA-256)" or "(FNV-1a — integrity only, not tamper-proof)", head hash (12 hex chars) plus seq, `[Verify chain]`, `[Tamper demo]`. |

- In the Standard tier the dashboard area scrolls vertically, with the queue first.

### F. README extras

**D29. In tomorrow** (none alters a README label, value or flow):
- wrap-around + "n of m" + spoken wrap;
- focus memory;
- debounce and lockout;
- the caption bar + voice pill;
- BACK semantics on S1/S5;
- inline device observation;
- modal pending + withdraw;
- the CONFIRM dialog;
- honesty labels (PRELIMINARY, STUB, attribution);
- Reset-appends-audit.

**D30. Post-mid-eval** (reserved config keys only, no code tonight):
- standby/pause (H9; needs a new token grammar);
- "Call caregiver" (a 6th hub card would break README's "5 large selectable category cards");
- KG pre-focus;
- the **thermal advisory band** (`SA.config.ui.thermalAdvisory = {enabled:false}`). If Debate 5 enables it, it renders as a **navigation-priority caption only**: never `#sa-alert`, never in the hub subtitle;
- non-modal caregiver wait with compare-before-execute;
- HMAC caregiver PIN;
- "Patient may disagree [Undo]/[Keep]" after an approval (ADR 0002 D16);
- TV volume > 80 % → Medium;
- non-uniform CONFIRM cost from the measured confusion matrix (unless ready at freeze).

### G. Visual design tokens (`POC/css/tokens.css`)

**D31. Colours.** Ratios were computed tonight with the WCAG formula. Dark theme only; no light theme tonight.

**Surfaces**

| Token | Value |
|---|---|
| `--bg-page` | `#0E1318` |
| `--bg-surface` (cards) | `#18202A` |
| `--bg-raised` (panels, dashboard tiles) | `#212B37` |
| `--bg-rail` | `#121920` |
| `--bg-harness` | `#1A1712` |
| `--surface-focus` | `#2A2410` (1.06:1 vs surface, decorative only) |

**Text**

| Token | Value | Contrast | Use |
|---|---|---|---|
| `--text` | `#E9EEF3` | page 15.99, surface 14.07, raised 12.28, focus 13.24, harness 15.31 | all text |
| `--text-muted` | `#AEB9C5` | surface 8.25, raised 7.20, focus 7.76, rail 8.89 | all text |
| `--text-subtle` | `#8C98A6` | surface 5.60, raised 4.88 | harness and dashboard meta only, never patient stage |

**Lines**

| Token | Value | Contrast |
|---|---|---|
| `--border` | `#6E7D8F` | surface 3.90, page 4.44, raised 3.41 |
| `--focus-ring` | `#FFC94D` | page 12.19, surface 10.72, raised 9.36, focus 10.10 |
| `--on-focus` | `#0E1318` | on the ring, 12.19 |
| `--harness-edge` | `#A08C5C` | 5.45 on harness |

**Semantic colours.** Always paired with a glyph and a text label.

| Token | Value | Lowest ratio on any surface |
|---|---|---|
| `--ok` | `#7DDB98` | 8.50 (raised) |
| `--warn` | `#FF9F68` | 7.10 (raised). **Glyph-plus-text chips only, never a border or ring**: it is 1.32:1 against the focus ring. |
| `--danger` | `#FF9C9C` (lightened from A's #FF8A8A, which fell to 6.32 on raised) | 7.16 |
| `--info` (also kept graph edges) | `#6CC8E4` | 7.52 |
| `--care` | `#C3A8FF` | 7.07 |

- Policy chips: `✓ EXECUTE`, `? CONFIRM`, `✕ REJECT`, `⚑ CAREGIVER APPROVAL`.

**D32. Typography.** System stacks only.
- UI font: `"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif`.
- Mono font: `"Cascadia Mono", Consolas, "Courier New", monospace`.
- `font-variant-numeric: tabular-nums` for telemetry.
- **Every patient-stage string is ≥ 20 px.**
- The rail and CogLign panel are classified as **examiner/clinician text** (≥ 4.5:1 required; ≥ 7:1 delivered).

| Token | Size / line height / weight |
|---|---|
| `--fs-screen-title` | 32px / 1.2 / 600 |
| `--fs-card-title` | 28px / 1.2 / 600 |
| `--fs-card-sub`, `--fs-body` | 20px / 1.4 / 400 |
| `--fs-marker` | 20px / 700 |
| `--fs-caption` | 22px / 1.4 |
| `--fs-hero-transition` (S5 diff) | 36px / 600 |
| `--fs-pill-readme` | 20px / 600 |
| `--fs-pill-meta` | 16px / 600 |
| `--fs-panel` | 16px (values 18px / 600) |
| `--fs-dashboard` | 16px |
| `--fs-harness`, `--fs-code` | 14px |

**D33. Spacing, shape and focus.**
- Spacing: `--sp-1` 4, `--sp-2` 8, `--sp-3` 12, `--sp-4` 16, `--sp-5` 24, `--sp-6` 32, `--sp-7` 48 (px).
- Shape: `--r-card` 16px, `--r-panel` 12px, `--r-pill` 999px.
- Focus: `--focus-width` 6px, `--focus-offset` 4px, `--focus-scale` 1.04.
- Layout: `--card-gap` 24px, `--listbox-pad` 20px.
- Targets: `--target-min` 44px (caregiver and harness).

**D34. Motion.**
- `--dur-focus` 120ms, `--dur-evo-step` 700ms.
- `--radar-period` 2000ms: continuous, never more than 3 flashes per second.
- `html[data-reduced-motion="true"]` is set by `prefers-reduced-motion` **or** the harness toggle. It zeroes all transitions and animations, keeps the static scale, steps evo discretely and makes the radar static.

**D35. Exact strings.**
- **Observing string:** rendered as `“Observing post-action EEG...”`, **including** the curly quotes U+201C/U+201D and three ASCII dots. They are inside the README code span.
- **README-bracketed labels** use class `.sa-bracketed`, whose CSS `::before`/`::after` add "[" and "]". The screenshot then reads like the README while the accessible name stays clean. The labels are the harness buttons, `[No ErrP]`, `[Simulate ErrP]`, `[Retry]`, `[Return to Home]`, `[Approve]` and `[Reject]`.
- **Self-test:**
  - checks textContent without brackets, plus the class;
  - checks `-8.4` with hyphen-minus and `µ` U+00B5.
- **Contrast check:** reads `getComputedStyle(document.documentElement).getPropertyValue('--token')`, never `cssRules` (opaque on `file://`). It asserts:
  - ≥ 7:1 for text and muted on surface, raised and focus;
  - ≥ 3:1 for border and ring against surface and page.

**D36. Build shape tonight.**
- **One** generic `components/listbox.js` driven by the declarative `SA.ui.screens` table. It also serves as Debate 6's screen graph and ADR 0002's BFS cost source.
- Files: `ui/screens.js`, `ui/navigator.js`, `ui/render.js`, `ui/components/{listbox,coglign-panel,caption,pills}.js`, `ui/caregiver.js`, `input/{keyboard,harness}.js`, `voice/speech.js` (lexicon inside), and `css/{tokens,base,layout,components}.css`.
- Each file is under 400 lines.

---

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| Focus via `:focus-visible` / DOM focus | Heuristic and fragile under harness clicks and headless runs. |
| `menu`/`menuitem` instead of listbox | PROMPT mandates listbox (residual dissent). |
| No wrap-around | README says "Cycle". Mean hub cost goes 1.2 → 2.0 tokens. |
| "KG-chooses-from-category" on S4 | Makes S3 decorative and acts on something not selected. Kept only for the README Retry alternative, shown before SELECT. |
| Policy free to REJECT an explicit selection on the spatial/recency prior | Makes "Turn Off Living Room Light" unreachable (c ≈ 0.481). |
| KG pre-focus on S3 | Verb unknown on S3; saves 0 tokens; unvalidated. |
| Design A CONFIRM (two-button dialog) | 1.81 expected tokens; NEXT can land on Cancel. |
| Gate C in Scripted mode | Livelocks for n in [0.40, 0.60). |
| B's single [Withdraw request] option | Makes SELECT a withdrawal, which inverts the SELECT = yes grammar. |
| Every device action via S5 | 24 → 17 °C would cost ≈ 14 patient tokens + 7 operator clicks. |
| B's `[Back to Fixtures]` | A non-README label in README bracket style, undefined for non-lights. |
| Dynamic "Turn On/Turn Off" AC/TV cards | Labels flip under a kept focus. "Power" + state subtitle instead. |
| B's "Allow online voices" toggle | Sends patient content to cloud TTS; violates offline/local-only. |
| B's Visual mode = all speech off | Silences REJECT, rollback and caregiver results, which PROMPT requires to be spoken. |
| Two-graph layout gated at ≥ 1600 px; tabbed single graph | Never activates at the viva viewport; tab auto-follow races in Replay. |
| A's Scripted-mode "illustrative" forward pass on each keypress | Implies decoding that did not happen. |
| A's patient tokens live under the dashboard | Invisible actuation by a stray Space. |
| Parsing `tokens.css` via `cssRules` | Opaque origin on `file://`. |
| B's palette (`--warn` #F5B94A) | 1.24:1 against its focus ring at the same hue. |
| Thermal advisory tonight | Untested code, secondary sources, competes with the stepper's speech, and is Debate 5's call. |
| 11 screen modules + 7 components + 7 CSS files | Not buildable by one agent in 2–3 h. |

## Residual dissent

- **X6 (Proposer A).** Rolling back an approved 17 °C setpoint returns to a prior *in-bounds* setpoint, so it moves the room out of the hazard; auto-rollback would therefore be safe. ADR 0002 D16 has already ruled log-only. A's argument is forwarded as the main input for the post-mid-eval "[Undo]/[Keep]" design.
- **Listbox vs menu.** The APG warns that selection-follows-focus listboxes can degrade the screen-reader experience. Kept because PROMPT mandates listbox.
- **Modal vs non-modal caregiver wait** (UX D8 prefers non-modal). Modal is kept tonight to avoid stale approvals; non-modal with compare-before-execute is post-mid-eval.
- **The explicit-choice floor (D10)** constrains Debate 5. If Debate 5 rejects it, the UX side must at least show the reason and the room selector hint; reopen this ADR.
- **Rebuttals never happened.** Both proposers lost the chance to contest the critic's six BLOCKERs. My rulings on #3 (inline observation) and #18 (dashboard ignores tokens) are the ones a rebuttal would most plausibly have challenged.

## Consequences

- The README walkthrough reproduces byte-exactly at the viva viewport, with both graphs visible.
- The thermal demo costs 7 SELECTs (auto-confirm ON) + `C` + `[Approve]`.
- CONFIRM costs a nominal +1 token. The expected cost is 1.175 tokens at 8.7 %/8.7 % false-cancel/false-confirm [MODEL], disclosed.
- Debate 5 receives two binding UX requirements: the explicit-choice floor (D10), and trace-rendered reasons with no UI arithmetic.
- Debate 6 receives the screen table (D6), the store keys (`ui.screen`, `ui.focus{}`, `ui.focusMemory{}`, `ui.subState ∈ {list, confirm, pending, observing, outcome}`, `ui.dashboardOpen`, `ui.audioMode`, `ui.voiceEnabled`, `ui.reducedMotion`) and the proposed events (`input:token`, `ui:focusChanged`, `ui:screenChanged`, `ui:actionRequested`, `ui:confirmAccepted`, `ui:confirmCancelled`, `ui:requestWithdrawn`, `caregiver:approve`, `caregiver:reject`, `errp:inject`, `voice:say`). Names are final only once Debate 6 rules.
- Self-test additions:
  - exactly one `.is-focused` and one `aria-selected="true"` per active listbox, with ids matching `aria-activedescendant`;
  - a harness click leaves `ui.focus` unchanged;
  - `scrollY` is unchanged after Space;
  - no horizontal overflow, and the focused card's rect lies inside the stage;
  - contrast via computed styles;
  - README strings;
  - the lexicon hit.
- Screenshot matrix (`--user-data-dir=<scratchpad>/edge-profile`): **1536×730**, 1366×657, 1920×950, 1280×600, 911×512.

## Tonight vs post-mid-eval

**Tonight**, in this order. Stop at any point with a working demo.
1. `tokens.css` + shell layout (D21–D23, D31–D34).
2. Declarative screen table + generic listbox + navigator (D1–D7).
3. Keyboard/harness input hygiene (D4).
4. S4 panel + policy hookup + S5 with the README strings (D8, D10, D11, D35).
5. Caption/alert regions + speech (D15–D20).
6. CONFIRM dialog + pending card + dashboard (D12, D14, D28).
7. Inline device observation (D9).
8. Graph cards with Scripted/STUB/PRELIMINARY labels (D24–D25).
9. Reset (D27) and the self-test asserts.
10. Screenshots at the matrix sizes.

**User action tonight (30 s):** in headed Edge DevTools, run `speechSynthesis.getVoices().filter(v=>v.localService).map(v=>v.name)`. If it returns nothing, the demo is text-only and says so.

**Post-mid-eval:** everything in D30; the measured-confusion CONFIRM cost; a light theme; a Large-tier review on a 100 %-scaled display.

## Revisit conditions

- Debate 5 rules against the D10 explicit-choice floor, or sets in-band AC thresholds that make the canonical AC press (c = 0.874) CONFIRM.
- Debate 6 renames screen ids, store keys or events (rename only; semantics stand).
- The headed-Edge voice check shows no local voices (audio becomes text-only; no design change).
- The Plan-B confusion matrix shows feet↔tongue confusion > 2× uniform. Then re-evaluate gate C and Design B.
- The supervisor rules on "Call caregiver", standby, or the thermal advisory.
- Viva hardware differs from 1536×730 (re-run the screenshot matrix; adjust the tier breakpoints only).
