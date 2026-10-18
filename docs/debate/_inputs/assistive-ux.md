# Raw debate inputs: assistive-ux
(Collected from the workflow journal; agents not listed failed with network errors.)

=== propose:assistive-ux:A ===

# Proposer A (Rigor-first): Assistive-UX position

Sources: README.md (§2, §3), PROMPT.md §D, CLAUDE.md §3/§6, `docs/research/assistive-ux-safety.md` (cited as UX §n / D n), `docs/research/knowledge-graph.md` (KG §n / D n), `docs/research/_cross-check.md` (XC X n / G n). I computed every contrast ratio below locally with the WCAG relative-luminance formula, in Node. Token-cost figures use P = 0.777. Per the cross-check, I drop the brief's "0.7705" ITR row because 77.05 is a typo by consensus.

---

## 1. Focus treatment

**Choice.**
- **Source of truth.** The patient's focus lives in `SA.store` as `ui.focus[screenId]` (an integer index). It never comes from DOM focus, `:focus` or `:focus-visible`.
- **Rendering.** `SA.ui.render` sets the following on every store change:
  - `.is-focused` on exactly one `role="option"`;
  - `aria-selected="true"` on that option and `"false"` on the others;
  - `aria-activedescendant=<option id>` on the `role="listbox"`.
  - Each listbox has `tabindex="0"`, an `aria-label` (e.g. "Home categories") and `aria-orientation="horizontal"`. Options also carry `aria-posinset`/`aria-setsize`.
  - Cards contain no nested interactive elements, per the APG listbox caveat.
  - When a screen is entered, the listbox gets `focus({preventScroll:true})`.
  - On every focus change the renderer calls `scrollIntoView({block:'nearest'})`, and cards have `scroll-margin: 24px` (SC 2.4.11).
- **Outline.** `outline: 6px solid var(--focus-ring)` with `outline-offset: 4px`.
  - That is 3× the 2 px minimum for SC 2.4.13.
  - The ring is #FFC94D. Measured contrast: 12.19:1 against the page and 10.72:1 against the card surface. Every pixel the ring covers changes by ≥ 3:1.
  - The focused card background changes to `--surface-focus` #2A2410 (body text on it is 13.24:1).
  - The unfocused card border is 2 px #6E7D8F (3.90:1 against the surface, 4.44:1 against the page, so it meets SC 1.4.11).
- **Scale.** A static `transform: scale(1.04)`.
  - With motion allowed, it transitions over 120 ms. Under reduced motion it is applied instantly; it is a state, not an animation (UX §3, [19]).
  - Grid gap ≥ 24 px and container padding ≥ 20 px, so the scaled card plus the 10 px ring never overlaps a neighbour or gets clipped.
- **Marker.** A "● Focused" pill at the top-left inside the card: 18 px, 700 weight, #0E1318 on #FFC94D (12.19:1).
  - It is `aria-hidden="true"`, because `aria-selected` already conveys focus and this stops screen readers repeating it.
  - Every card reserves the marker row (`visibility:hidden` when unfocused), so content never shifts.
  - Focus is therefore conveyed by thickness, scale and text, not colour alone (SC 1.4.1).
- **Position text.** "2 of 5" appears under each listbox and is spoken, so the user doesn't spend tokens just to orient (UX §1.5d).
- **Harness must not steal focus.**
  1. The keyboard listener sits on `window` in the capture phase, so tokens work whatever has DOM focus.
  2. A delegated `mousedown → preventDefault()` on `#harness button` and `#caregiver button` keeps DOM focus on the listbox.
  3. `input`/`select` elements (sliders, trial picker, room selector) must take focus to work. On `change`/`pointerup` they call `SA.ui.navigator.restoreFocus()`, which blurs them and refocuses the active listbox.
  4. The keyboard module ignores token keys when `event.target.closest('input,select,textarea')`. A focused slider's arrow keys must never also fire NEXT/PREV.
  5. On caregiver-dashboard buttons, Enter/Space activate the button natively and are not tokens. A/D/S/W, the arrows and Esc/Backspace stay tokens.
  6. Every harness token is emitted with `source:'operator'` and audited with `actor:'operator'` (UX H12).
- **Keyboard hygiene** (UX §1.7, D14):
  - ignore `event.repeat`;
  - `SA.config.input.minInterTokenMs = 250`;
  - `preventDefault()` on Space, the arrows, Enter, Esc and Backspace;
  - ignore keys held with Ctrl/Alt/Meta, so browser shortcuts survive;
  - `C` toggles the dashboard.

**Evidence.** UX §3 "Focus treatment", D11. APG listbox [17]. MDN on `:focus-visible` being heuristic [20]. WCAG 2.4.7, 2.4.11 and 2.4.13 [15][16].

**Self-test asserts.**
- Exactly one `.is-focused` per active listbox, and its id equals `aria-activedescendant`.
- Exactly one `aria-selected="true"`.
- A harness click leaves `ui.focus` unchanged.
- `scrollY` is unchanged after Space.

**Risks.**
- APG warns that selection-follows-focus can degrade screen-reader experience, and `menu`/`menuitem` is arguably the better fit. PROMPT mandates listbox, so record this as residual dissent.
- The scale plus ring could be clipped by an `overflow:hidden` ancestor. Forbid `overflow:hidden` on listbox containers.

---

## 2. Navigation, screen by screen

**Global rules.**
- **Wrap-around is ON for every list with ≥ 2 items.**
  - This is README-faithful: §2 says NEXT/PREV "**Cycle** forward/backward through cards".
  - It cuts the mean hub cost from 2.0 to 1.2 tokens (UX §1.6).
  - A wrap is announced, e.g. "Wrapped to first. Lights, 1 of 5".
- **Order.** NEXT/PREV follow DOM reading order, row-major, even when the grid wraps visually.
- **Focus on entry.** Entering a screen focuses item 1.
- **Focus memory.** When ascending with BACK, focus returns to the card you entered from (`ui.focusMemory`).
- **No timers.** Focus never auto-advances (UX §1.5b).
- **BACK on a "Back" card.** SELECT on a Back card does exactly what the BACK token does.

| Screen | Items (in order) | SELECT | BACK |
|---|---|---|---|
| S1 Mode Selection | **Visual Navigation**, **Audio-Assisted Navigation** (README §3 headings, exact) | → Hub. Visual sets `ui.audioMode='visual'` (navigation speech off, safety speech still on). Audio-Assisted sets `'audio'` (all speech). | **Root no-op.** Announces "This is the first screen" in `#sa-status`. Audited as TOKEN. Never exits or reloads. |
| S2 Hub | Lights, Fans, Air Conditioner, TV & Media, Presets. Subtitles are rendered live from the store: "1 Active of 3", "Ceiling Fan: OFF", "24°C • Cool Mode", "Smart TV: Standby", "4 Multi-Device Semantic Routines" | Lights → S3. Fans → Fan actions. AC → AC actions. TV → TV actions. Presets → S6. **Single-device categories go straight to their action screen**, saving one SELECT (UX §1.6 depth cost). | → S1, focus restored |
| S3 Lights Fixtures | Bedroom Ceiling Light (OFF), Bedside Lamp (OFF), Living Room Light (ON). No Back card, because the README lists exactly three. | → S4 for that fixture | → Hub, focus on Lights |
| S4 Actions | Turn On, Turn Off, Adjust Brightness, Back (README) | Runs resolver + policy (§3). Adjust Brightness → sub-list 25% / 50% / 75% / 100%. Picking a level on an OFF light turns it ON at that level, and the diff shows "OFF ➔ ON 50%". | → S3, focus on the fixture. In the brightness sub-list: → S4. |
| Fan actions | Off, Low, Medium, High, Back. The option matching the current state carries a "Current" text badge. | policy → S5 | → Hub |
| AC actions | Turn Off (or Turn On), Temp −, Temp +, Mode: Cool, Mode: Fan, Mode: Dry, Back | policy → S5. **After a Temp ± actuation, focus returns to that same control**, so the control works as a stepper (UX §2.3). Step 1 °C. Reachable UI range 16–32 °C, so < 18 and > 30 can be demonstrated. | → Hub |
| TV actions | Turn On (or Turn Off), Channel −, Channel +, Volume −, Volume +, Back. Channel 1–99, wrapping. Volume 0–100 in steps of 10, clamped, initial 20 [A]. In Standby, Channel/Volume show "(TV in standby)", and SELECT announces "Turn the TV on first" with no actuation. | policy → S5 | → Hub |
| S5 Result | Observing state: no listbox, and tokens are locked out for the ErrP window. Outcome state, success path: **Continue**, **Return to Home**. Outcome state, rollback path: **[Retry]**, **[Return to Home]**, with Retry focused. | Continue → the previous action screen, focus kept. Retry → policy on the alternative. Return to Home → Hub. | Success: = Continue. Rollback: = **Return to Home** (1 token instead of 2; UX D7). |
| S6 Presets | Night Mode, All Lights Off, Cooling Mode, Watch TV. No Back card. | Policy runs first. REJECT/CAREGIVER are handled as in §3. Otherwise a **diff preview** appears, and the preview *is* the confirm step (§3). | → Hub, focus on Presets |

**Post-actuation lockout.**
- Lockout = the ErrP observation window, `SA.config.errp.windowMs`, taken from the ErrP ADR (≈ 1000 ms per XC X10).
- When ErrP auto-confirm is OFF (the default, because README S5 says "Click `[No ErrP]`"), the lockout lasts until the outcome.
- Tokens that arrive during the lockout are ignored, and "Observing — please wait" is announced once.

**Screen 4 reading.** I use explicit names, because the briefs swap the (a)/(b) labels (XC X9). **Choice: "Validate-the-focused-fixture".**
- **Target.** The patient's explicit S3 selection is *always* the actuated entity. The KG never overrides an explicit choice; doing so would undermine the user's agency and make a resolver error silent.
- **Resolver call.** When the S4 focus lands on a verb, `SA.kg.resolve({command, targetClass: category}, ctx)` re-scores **all** fixtures (KG D18 rec.).
  - **Decoded Intent** = verb + category class, e.g. "Turn On Light".
  - **Resolved Entity** = the entity that will be acted on.
  - **SPARQL Match** = *that entity's* score.
  - A line underneath reads "CogLign rank 1 of 3 ✓", or, on a mismatch, "rank 2 of 3 — CogLign top: Bedroom Ceiling Light 0.94".
  - Semantic confidence comes from the resolver output (its definition is Debate 4/5's ruling, XC X4). The UI computes nothing itself.
- **Canonical case.** The selection *is* the KG top, so the README values (`:BedroomCeilingLight`, 0.94, 89%) render exactly.
- **What the KG adds.** It catches mis-decoded navigation. Example: a stray NEXT lands on Living Room Light (already ON). "Turn On" then scores f_X = 0, so the policy sees a low semantic score and returns CONFIRM or REJECT.
- **Rejected alternative.** "KG chooses from category intent" would make S3 decorative and would act on something the user did not pick.

**Fixtures pre-focus: NO for tomorrow** (post-mid-eval).
- **The verb is unknown on S3.** The resolver scores (command, class) pairs (KG §3.2), but the verb is only chosen on S4. Pre-focusing would need an invented verb assumption.
- **No benefit to the canonical flow.** The KG top for Turn On is already item 1, so pre-focus saves 0 tokens there.
- **It is unvalidated.** Moving the focus would change token costs without any evaluation behind it.
- S3 focus therefore starts on item 1.

**Risks.**
- A mismatch display could confuse the panel. Mitigation: show it only when rank ≠ 1.
- Focus memory plus wrap could disorient a user. Mitigation: always speak "n of m".

---

## 3. CONFIRM interaction and its token cost

**Choice: the UX brief's design B plus gate C** (UX §2.2, D5). CONFIRM is a sub-state of S4 (`ui.subState='confirm'`), not a new screen, so README labels are untouched.
- The action list is replaced by one prompt card. It shows:
  - the **diff**, e.g. "Bedroom Ceiling Light: OFF ➔ ON";
  - the **reason**, i.e. the policy trace with the threshold it missed, e.g. "0.92 × 0.80 = 0.736 < 0.75";
  - "Both Feet ✓ Confirm · Tongue ✕ Cancel".
- Speech uses the same text, under 160 characters.
- **Token mapping:**
  - **SELECT (Both Feet) confirms.**
  - **BACK (Tongue) cancels.** The S4 list returns with focus on the same action.
  - **NEXT/PREV are a no-op and re-prompt.** The prompt is re-spoken and a counter "re-prompt 1" is shown.
- **Gate C.** If the confirming token's own neural confidence is below `SA.config.policy.confirmTokenMinConf = 0.60`, the system re-prompts instead of executing. In Scripted mode that confidence is the slider value.
- **No deadline.** `policy.confirmTimeoutMs = 0` disables it. If it is ever set, a timeout means auto-*cancel*, never execute (SC 2.2.1; UX §3).
- **Audit entries:** `DECISION(CONFIRM)`, then `CONFIRM_ACCEPTED` or `CONFIRM_CANCELLED`, plus the re-prompt count.
- **Presets.** The mandatory diff preview counts as the confirm step, with the same SELECT/BACK/re-prompt grammar and gate. A policy CONFIRM on a preset therefore never asks twice (UX §2.3). REJECT and CAREGIVER are evaluated *before* the preview, so no token is wasted on a preview that cannot be committed.
- **REJECT.** S4 stays on the list, focus is unchanged, and "Policy Decision: REJECT" is shown with the trace. "Not sure, please try again" goes to `#sa-alert`. There is no actuation.
- **CAREGIVER APPROVAL: modal pending card on S4 for tomorrow.**
  - The card reads "Waiting for caregiver approval" plus the rule that fired, e.g. "Setpoint 17°C is below the 18°C minimum", plus "Tongue ✕ Back to withdraw".
  - BACK withdraws (`WITHDRAWN`, audited). NEXT/PREV/SELECT re-prompt.
  - Rationale for modal over non-modal (UX D8 preferred non-modal): a non-modal wait lets the patient change the AC while the request is pending, so the caregiver could approve a stale request. That is a hazardous situation like H8. Modal-with-withdraw keeps the patient's veto and avoids it. **Non-modal with compare-before-execute is post-mid-eval.**
  - Approve → spoken and `#sa-alert`, then S5. Reject → spoken, and back to AC actions with focus on Temp −.
  - Timeout `caregiver.requestTimeoutMs = 300000` → EXPIRED, never auto-approved.
- **Token cost** (UX §2.2, [MODEL], uniform confusion, P = 0.777; recomputed locally):
  - **Design B:** expected **1.175 tokens** per confirm (≈ +7 s at 6 s/token, ≈ +16 % on the 7.2-token canonical flow). P(confirm | resolved) = 0.913. False-cancel ≈ 8.7 %. **False-confirm (1−P)/3 = 7.4 %.**
  - **Design A** (generic dialog where NEXT/PREV move focus): 1.81 tokens. Rejected.
  - **Honest caveat.** README fixes CONFIRM = feet and CANCEL = tongue, and feet↔tongue may be the most-confused IV-2a pair [UNVERIFIED]. If the Plan-B SD confusion matrix exists before build freeze, compute the non-uniform expected cost and false-confirm rate from it and print them in `docs/verification.md`, labelled PRELIMINARY. Otherwise that is post-mid-eval. This is also why gate C exists.

---

## 4. Audio

**Choice: an `SA.voice.speech` contract** (UX §4, D12; LOCAL-TEST findings).
1. **Voice selection.** `pickVoice()` prefers `localService === true && lang.startsWith('en')`, then `en-US` over other `en` variants.
   - **Online voices are never auto-selected** (`voice.allowOnline = false`). Headless Edge listed 321 voices, all "Online (Natural)", all with `localService=false`, even when offline (LOCAL-TEST).
   - If no local voice exists, the app goes **text-only** and the top bar shows the pill "Voice: text only (no offline voice)".
2. **Voice loading.** Call `pickVoice()` at load, on every `voiceschanged`, and once more after `voice.recheckMs = 1500` (the measured load delay).
3. **No speech at page load.** Chromium has deprecated `speak()` without user activation since M71 [behaviour in Edge 155 UNVERIFIED]. The first utterance plays after the first keydown or pointerdown. The Screen-1 prompt therefore lives in the caption and is spoken on the first token.
4. **Two priorities.**
   - *Navigation* utterances: `cancel()` then `speak()`, so the newest wins. They are **dropped** from speech, but still mirrored to text, while a safety utterance is speaking or queued.
   - *Safety* utterances (REJECT, rollback, caregiver decision, thermal note, withdraw): queued and never cancelled by navigation. A safety utterance arriving while navigation speech is playing cancels the navigation speech.
   - The `speak()` after `cancel()` is issued in a `setTimeout(0)` to dodge a reported Chromium drop [UNVERIFIED].
5. **Short utterances.** ≤ `voice.maxChars = 160`, split at sentence boundaries, to avoid the ~15 s Chromium cutoff (issue 679437 [22]). Rate 0.95, pitch 1.0.
6. **Speech text ≠ display text.** `SA.voice.lexicon` maps "FCz" → "F C z", "-8.4 µV" → "minus 8 point 4 microvolts", "24°C" → "24 degrees Celsius", "➔" → "to". The display keeps README strings byte-exact, including the hyphen-minus in "-8.4".
7. **Never blocks.** No state transition awaits `onend`. `canceled`/`interrupted` errors are treated as normal.
8. **aria-live mirroring.** `index.html` ships, empty at load:
   - `#sa-status` (`role="status"`, `aria-live="polite"`, `aria-atomic="true"`). It is rendered **visibly as the caption bar** at the bottom of the patient stage. This is the always-on text fallback, and it gives Visual mode a channel.
   - `#sa-alert` (`role="alert"`, *without* `aria-live="assertive"`, which double-speaks on VoiceOver [18]). It is rendered as a banner at the top of the stage that persists until the next token.
   - Every `say()` writes the display text into the right region whether or not speech is on.
   - Repeated identical messages are cleared, then set in the next animation frame.
   - The harness Voice toggle exists for screen-reader users, to avoid hearing everything twice.
9. **Self-test** asserts on `#sa-status`/`#sa-alert` text, never on speech.

**Risk.** It is unverified whether headed Edge or Chrome expose David, Zira and Mark as local voices. The user's 30-second DevTools check (UX open question 1) is needed before the viva. The text-only fallback keeps the demo honest either way.

---

## 5. Layout

**Grid** (`css/layout.css`). Rows are top bar 56 px, then main `1fr`, then the harness dock. The dock is **in flow and never overlays content** (SC 2.4.11).

**1366×768.** Also tested at the realistic in-browser height 1366×640.
- **Top bar.** Title; the README pills `EEG: Simulation Mode` • `Environment: Smart-Home Simulator` (verbatim, in every mode); a separate **decoder badge** ("Decoder: Scripted", or "Decoder: Replay · A0xE trial #n · true Feet / pred Feet · model PRELIMINARY (Plan B)"); the voice pill; the `Caregiver Dashboard` switch.
- **Main columns:** `minmax(0,1fr) 400px`, gap 16. The stage is ≈ 918 px wide.
- **Card grids** (explicit columns, not auto-fit, so screenshots are deterministic):

  | Screen | Columns at < 1600 px |
  |---|---|
  | S1 | 2 |
  | Hub | 3 (3 + 2) |
  | S3 | 3 |
  | S4 | 2 × 2 |
  | Brightness | 4 |
  | Fan | 3 |
  | AC | 4 (4 + 3) |
  | TV | 3 |
  | S6 | 2 × 2 |

- **Card height.** min-height 148 px, or 128 px when `max-height: 700px`.
- **Stage stack:** screen title (32 px), the listbox, "n of m", then the caption bar `#sa-status`.
- **Right rail, top:** the **CogLign Context-Resolution panel**.
  - On S4/S5 it shows all README fields verbatim, plus the policy trace line and the per-feature arithmetic for the top two candidates (KG §6).
  - It also shows **the SPARQL that actually ran**, always visible in a 6-line monospace block that scrolls internally (`max-height: 120px`). It is not hidden behind a disclosure.
  - Before S4 is reached, a "Preview" badge sits next to the header; the README field labels are never altered.
  - On S1–S3 and S6 the panel collapses to one line: "Resolves on action selection".
- **Right rail, bottom:** one **Graph card** with a two-tab switch, `Brain graph` | `Knowledge graph`.
  - Auto-follow rule: the token/decode events of the decoder (`decode:*`) select Brain; `kg:resolved` selects Knowledge graph.
  - An operator click on a tab pins it until Reset.
  - At most one graph is shown at a time at this size. That is how the screen is not overwhelmed.
- **Harness dock:**
  - **Compact (76 px), the default when `innerHeight < 900`.** It holds the label "Operator Harness — not patient-facing", the four token buttons in README order, `[No ErrP]`, `[Simulate ErrP]`, the decoder-mode select and `[More controls ▾]`.
  - **Expanded (+150 px).** It adds the Neural MI and Semantic sliders with numeric values, the replay-trial picker, the active-room selector, the toggles (Voice, Decode animation, ErrP auto-confirm, Reduced motion), `[Reset Demo]`, and a data line: "Data: BCI Competition IV-2a (BNCI 001-2014) / BNCI 013-2015 — attribution; licence pending supervisor confirmation".
  - The expanded dock pushes content up and never covers it.
- **Zoom.** Below 1100 CSS px wide (e.g. 150 % zoom on 1366 ≈ 911 px), the rail drops below the stage, the page scrolls vertically, and the dock is forced to compact.

**1920×1080** (`min-width:1600px and min-height:900px`).
- Columns `minmax(0,1fr) 400px 400px`; the stage is ≈ 1056 px.
- Rail A: the CogLign panel at full height.
- Rail B: **both graphs at once**, the KG subgraph on top and the brain graph below, each ≈ 368×360.
- Hub 5 columns, S4 4, S6 4. Card min-height 180 px. The dock is expanded by default.

**Graph contents.**
- **Brain graph** (`brain/brain-graph-view.js`):
  - **Scalp map.** A 22-electrode inline SVG laid out per paper Fig. 2a. Rows are 1 / 5 / 7 / 5 / 3 / 1 (bci-eeg brief); FCz (channel 4) and Cz (channel 10) are ringed.
  - **Evolution.** A stepper labelled evo0 · evo1 · evo2 · evo3, auto-stepping at `--dur-evo-step = 700 ms`. Reduced motion gives discrete steps with no ghosting.
  - **Edges.** Kept edges are 2 px #6CC8E4 (9.29:1 on the rail). Edges just removed are drawn dashed for one step.
  - **Counts.** The computed edge count is shown per stage, never invented.
  - **Caption:** "Edges kept by the model's learned mask — model behaviour, not neurophysiology" (bci-eeg D13).
  - **Scripted mode.** The view shows the forward pass on a fixed exported replay trial, labelled "Illustration — Scripted mode does not decode EEG".
- **KG subgraph** (`kg/kg-view.js`):
  - **Nodes (≤ 8):** Patient, MasterBedroom, LivingRoom, the 3 lights, and an intent node ("Turn On Light").
  - **Edges:** `sa:activeRoom` and `bot:containsElement`.
  - **Ranking display.** The winner has a 4 px solid ring and the text "1st · 0.94". The runner-up has a 3 px dashed ring and "2nd · 0.88". The third shows "3rd · 0.38". Rank is shown as text, not colour alone.
  - **After an ErrP:** an annotation "−0.27 ErrP penalty", or whatever the resolver returns.

**Caregiver dashboard** (toggled by `C`; it replaces the stage and rail, and the dock stays):
- **Row 1.** A "Patient view" strip: current screen, focused item, decoder mode, last decision. Patient tokens keep driving the patient model while the dashboard is open.
- **Row 2, left 7/12: High-Risk Action Approval Queue** (with a "1 pending" counter and the rule that fired). `[Approve]`/`[Reject]` are 44 px tall. Below it, the **shadow table**: device, room, state, last change, actor.
- **Row 2, right 5/12: three gauges, Neural, Semantic and ErrP health.**
  - Each gauge is a bar plus a numeric value, so it never relies on colour.
  - ErrP health = the rolling ErrP rate over the last 10 actuations plus the last posterior, labelled "fatigue proxy, not clinical".
  - Under the gauges, a live brain graph at 360×240.
- **Row 3, full width: the audit log** (it scrolls internally). It shows:
  - the badge "Chain verified ✓ (SHA-256)", or "(FNV-1a — integrity only, not tamper-proof)";
  - the head hash (first 12 hex characters) and its seq, as the anchor;
  - `[Verify chain]` and `[Tamper demo]`.

**Evidence.** PROMPT §D layout, "both graphs" (PROMPT §0), KG §6, UX §3/§8.2, XC G6.

**Screenshot verification** uses `--user-data-dir=<scratchpad>/edge-profile` (XC G6) at 1366,768, 1366,640, 1920,1080, and 911,512 (emulating 150 % zoom).

**Risk.** At 1366×640 the expanded dock leaves about 330 px for the stage. Mitigation: compact is the default below 900 px height. The self-test asserts no horizontal overflow and that the focused card's rectangle lies inside the stage.

---

## 6. README extras: what is in for tomorrow and what waits

**In tomorrow** (none of these alters a README label, value or flow):
- (a) **Wrap-around.** README says "Cycle".
- (b) **Focus memory and "n of m".**
- (c) **Caption-bar text fallback** and the voice-unavailable pill.
- (d) **BACK semantics on S1 and S5** (§2).
- (e) **Thermal advisory, as information only.**
  - When a Temp ± target is inside the README-safe range but outside 20–26 °C, the AC card subtitle and a safety utterance say, e.g., "19°C is below the 20°C advised for vulnerable people".
  - **The policy decision is unchanged.** README defines CONFIRM as "medium confidence", so escalating to CONFIRM for temperature would change README semantics.
  - Config: `ui.thermalAdvisory = {enabled:true, lowC:20, highC:26}`.
  - Sources: WHO 1987 20 °C via the Scottish Government review [31] and CIBSE TM59 26 °C [33], both secondary, and labelled so in the docs.
  - README's < 18 / > 30 → CAREGIVER rule is untouched.

**Post-mid-eval:**
- **Standby/pause.** It needs a new token grammar, e.g. a sustained Tongue, that the README does not define. It stays in the ADR as hazard H9 and Huggins' standby requirement [7].
- **"Call caregiver".** A 6th hub card would break README's "5 large selectable category cards". It is post-mid-eval as a separate affordance after a user/supervisor ruling.
- **KG pre-focus** (reasons in §2).
- **Escalating the advisory band to CONFIRM.** That is a Debate-5 policy ruling.
- **Non-modal caregiver wait.**
- **HMAC caregiver PIN.**
- **CONFIRM cost from the measured confusion matrix**, unless it is ready by freeze.

---

## 7. Visual design tokens (`POC/css/tokens.css`)

Every ratio below was measured.

**Surfaces.**

| Token | Value |
|---|---|
| `--bg-page` | #0E1318 |
| `--bg-surface` (cards) | #18202A |
| `--bg-raised` | #212B37 |
| `--bg-rail` | #121920 |
| `--bg-harness` (a warm tint marks the operator zone) | #1A1712 |
| `--harness-edge` (2 px dashed top border) | #A08C5C (5.45:1 on harness) |
| `--surface-focus` | #2A2410 |

**Text.**
- `--text` #E9EEF3: 15.99 on page, 14.07 on surface, 12.28 on raised, 13.24 on focus.
- `--text-muted` #AEB9C5: 8.25 on surface, 7.20 on raised, 7.76 on focus.
- `--text-subtle` #8C98A6: 5.60 on surface. Non-patient labels only.
- **Patient text uses only `--text` and `--text-muted`, so it is ≥ 7:1 (AAA 1.4.6) everywhere.**

**Lines.**
- `--border` #6E7D8F: 3.90 on surface, 4.44 on page.
- `--focus-ring` #FFC94D: 10.72 on surface, 12.19 on page.
- `--on-focus` #0E1318, for marker text.

**Semantic colours** (always paired with a text label and an icon):

| Token | Value | On surface |
|---|---|---|
| `--ok` | #7DDB98 | 9.74 |
| `--warn` (orange, kept distinct from the amber focus) | #FF9F68 | 8.14 |
| `--danger` | #FF8A8A | 7.24 |
| `--info` | #6CC8E4 | 8.62 |
| `--care` (caregiver) | #C3A8FF | 8.11 |

**Typography** (system stacks only, no web fonts).
- `--font-ui: "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif`.
- `--font-mono: "Cascadia Mono", Consolas, "Courier New", monospace`, for SPARQL, IRIs and hashes.

| Token | Size / line height / weight |
|---|---|
| `--fs-screen-title` | 32px / 1.2 / 600 |
| `--fs-card-title` | 28px / 1.2 / 600 (title ≥ 28) |
| `--fs-card-sub` and `--fs-body` | 20px / 1.4 / 400 (patient text ≥ 20; not "large", so it needs ≥ 4.5:1, which it exceeds) |
| `--fs-marker` | 18px / 700 |
| `--fs-hero-transition` (S5 "Bedroom Ceiling Light: OFF ➔ ON") | 36px |
| `--fs-panel` (CogLign/rail, not patient text) | 16px |
| `--fs-harness` | 14px, minimum |
| `--fs-code` | 14px |

**Spacing.** `--sp-1` 4, `--sp-2` 8, `--sp-3` 12, `--sp-4` 16, `--sp-5` 24, `--sp-6` 32, `--sp-7` 48 (px).

**Shape and focus.** `--r-card` 16px, `--r-pill` 999px, `--focus-width` 6px, `--focus-offset` 4px, `--focus-scale` 1.04, `--card-gap` 24px, `--target-min` 44px (caregiver and harness controls; SC 2.5.8 needs only 24).

**Motion.**
- `--dur-focus` 120ms, `--dur-evo-step` 700ms.
- `--radar-period` 2000ms: one sweep per 2 s, so nothing flashes more than 3 times per second (SC 2.3.1).
- `html[data-reduced-motion="true"]` is set from `prefers-reduced-motion` *or* the harness toggle. It zeroes every `transition`/`animation`, keeps the static scale, steps the brain graph discretely, and makes the radar static (SC 2.3.3).

**Bracket rule.**
- README writes some labels with brackets: `[Right Hand ► Next]`, `[No ErrP]`, `[Simulate ErrP]`, `[Retry]`, `[Return to Home]`, `[Approve]`, `[Reject]`.
- Render them with class `.sa-bracketed`, whose `::before`/`::after` add "[" and "]". The screenshots then read exactly as the README, while the accessible name stays "Right Hand ► Next".
- The self-test checks textContent without the brackets.
- Every other README string is reproduced byte-exact: `Observing post-action EEG...`, `No Error Detected • Action Confirmed`, `Possible Error Detected • ErrP Deflection at FCz (-8.4 µV)`, `Action Rolled Back`.

**Self-test contrast check.** It parses `tokens.css` and asserts:
- ≥ 7:1 for `--text`/`--text-muted` on surface, raised and focus;
- ≥ 3:1 for `--border` and `--focus-ring` against the surface and page.

---

## Cross-check items resolved from the UX side

- **X9.** The swapped (a)/(b) labels are replaced by the names "Validate-the-focused-fixture" (chosen) and "Choose-from-category" (rejected). See §2.
- **X6** (ErrP on caregiver-approved High-tier actions). UX D9's "alert only" premise is wrong for the thermal case: rolling back a 17 °C approval restores the prior in-bounds setpoint, which moves the room *out of* the hazard. **The UX position is therefore: auto-rollback applies to approved actions too**, and the caregiver gets an alert ("Patient ErrP — approved action rolled back"). The only exception is the UX §7.2 rule: if a compensation would *enter* a hazardous state, escalate to CAREGIVER. Final thresholds remain with Debate 2/5.
- **XC §1.5 (Reset vs audit).** `[Reset Demo]` restores devices, the KG, policy memory, screen S1 with focus on item 1, decoder = Scripted, sliders 92/89, room = Master Bedroom, and the harness toggles' defaults. It **appends** a `RESET` audit entry carrying the previous head hash and never wipes the log. The log is ruled outside the "initial state".
- **G9** (README-silent UI semantics) is settled in §2: the S1 card names, fan states shown uppercase ("Ceiling Fan: LOW"), AC initially ON [A] with step and range, TV ranges, and brightness turning a light on.
- **G12 (Replay mode).** A harness token press emits the class of the chosen replay trial. The UI shows intended vs decoded, and **a mis-decode moves the cursor for real**, which is honest about fragility (UX §1.3). The mapping itself is Debate 3's.

## Proposed file and contract additions (UI builder)

**Files.**
- `POC/js/input/`: tokenbus.js, keyboard.js, harness-input.js.
- `POC/js/voice/`: speech.js, lexicon.js.
- `POC/js/ui/`: navigator.js, render.js.
- `POC/js/ui/components/`: listbox.js, card.js, confirm-prompt.js, coglign-panel.js, graph-card.js, caption.js, pills.js.
- `POC/js/ui/screens/`: s1-mode.js, s2-hub.js, s3-fixtures.js, s4-actions.js, brightness.js, device-fan.js, device-ac.js, device-tv.js, s5-result.js, s6-presets.js, caregiver-dashboard.js.
- `POC/css/`: tokens.css, base.css, layout.css, components.css, screens.css, harness.css, caregiver.css.

**Store keys:** `ui.screen`, `ui.focus{}`, `ui.focusMemory{}`, `ui.subState ∈ {list, confirm, pendingCaregiver, observing, outcome}`, `ui.dashboardOpen`, `ui.audioMode`, `ui.voiceEnabled`, `ui.reducedMotion`, `ui.graphTab`, `ui.graphTabPinned`.

**Config keys:** `ui.wrap = true`, `ui.decisionDwellMs = 800` (the EXECUTE decision stays visible on S4 before S5), `input.minInterTokenMs = 250`, `policy.confirmTokenMinConf = 0.60`, `policy.confirmTimeoutMs = 0`, `caregiver.requestTimeoutMs = 300000`, `voice.{preferLocal: true, allowOnline: false, maxChars: 160, rate: 0.95, recheckMs: 1500}`, `ui.thermalAdvisory`.

**Bus events emitted:** `input:token`, `ui:focusChanged`, `ui:screenChanged`, `ui:actionRequested`, `ui:confirmAccepted`, `ui:confirmCancelled`, `ui:requestWithdrawn`, `caregiver:approve`, `caregiver:reject`, `voice:say {display, speech, priority}`.

Everything above is buildable tonight with no new libraries. All heavier items are listed as post-mid-eval in §6.

=== propose:assistive-ux:B ===

# Proposer B (Demo-first): Assistive UX position, Debate #7

**Stance.** Ship a polished, working and honest demo by the mid evaluation on 2026-10-15. Every README label, value, initial state and shortcut is reproduced exactly. Each decision below is the simplest one an examiner can still defend. Anything that adds states, screens or policy outcomes is marked **POST-MID-EVAL**. Where a value is reserved in config for later, the key is named and its tomorrow default is given.

**Cross-check items resolved here:** X9, X6 (UX side), X8 (UX dependency), X1/X4 (display contract only), §1.5 (Reset vs audit), G5/G6 (the self-test must not depend on speech), G9 (README-silent device semantics), G12 (Replay inside navigation).

**Naming (resolves X9).** The two briefs label their (a)/(b) options in opposite ways, so I use explicit names:
- **"KG-validates-focused"**: the patient picks the fixture on Screen 3; the KG scores and validates that choice.
- **"KG-chooses-from-category"**: the KG picks the fixture from a category-level intent such as "Turn On Light".

---

## 1. Focus treatment

**Choice**
- **Source of truth.** `SA.store.ui.focus = {screenId, index}`. `POC/js/ui/navigator.js` is the only writer.
- **Rendering.** On each store change the renderer:
  - puts the class `.is-focused` and `aria-selected="true"` on exactly one `role="option"` (all other options get `aria-selected="false"`);
  - sets `aria-activedescendant` on the screen's `role="listbox"` to that option's `id`;
  - sets `aria-orientation="horizontal"` and an `aria-label` per screen (for example "Home categories" or "Light fixtures").
- **DOM focus.** On screen mount the listbox gets `tabindex="0"` and `listbox.focus({preventScroll:true})`. The visual focus never relies on `:focus` or `:focus-visible`. Set `[role=listbox]:focus{outline:none}` because the card carries the indicator.
- **Visual spec of the focused card:**
  - `outline: 6px solid var(--focus-ring)` with `outline-offset: 4px`;
  - the card border changes to `var(--focus-ring)`;
  - background changes to `var(--surface-focused)`;
  - a static `transform: scale(1.04)`; under motion, a 120 ms ease-out transition, set to 0 ms under `[data-reduced-motion]`;
  - a text marker **"● Focused"**: a pill in the top-right corner, 20px bold, dark text `--bg` on a `--focus-ring` background (13.0:1).
- **Unfocused cards.** 2px border `var(--border)` (≥3.44:1 against every surface). There is no marker.
- **Cards contain no nested interactive elements** (APG listbox caveat).
- **Harness buttons must not steal focus:**
  - every harness `<button>` has `tabindex="-1"` and a delegated `mousedown → preventDefault()` handler in `POC/js/input/harness-input.js`;
  - sliders and `<select>`s *do* take DOM focus, so on their `change`/`pointerup` the harness calls `SA.ui.navigator.refocus()`;
  - `POC/js/input/keyboard.js` listens on `window` in the capture phase. It ignores `Arrow*`, `Space` and `Enter` only when the event target is a harness form control, so the operator can still nudge a slider. The letter keys A/D/S/W and `C` always work.
- **Self-test.** Assert exactly one `.is-focused` per active listbox, and that `aria-activedescendant` equals its `id`.

**Rationale.** A store-driven focus survives harness clicks, headless runs and screen switches. It is one code path, so it is cheap tonight. The 6px outline is 3× the 2px minimum for SC 2.4.13. Scale plus the text marker satisfies SC 1.4.1 (colour is not the only cue). That combination is what PROMPT §D asks for: "unmistakable from across a room".

**Evidence.** assistive-ux-safety §0.8, §3 (SC 1.4.1, 2.4.7, 2.4.11, 2.4.13, 2.3.3), D11; MDN `:focus-visible` is heuristic [20]; APG listbox [17].

**Risks**
- A scaled card could clip under the rail or dock (SC 2.4.11). Mitigation: `scroll-margin: 24px`, `scrollIntoView({block:'nearest'})`, and 12px padding inside the listbox so the 1.04 scale has room.
- APG purists prefer `menu`. PROMPT mandates listbox, so record this as residual dissent.

## 2. Navigation for every screen

**General rules (all list screens)**
- NEXT/PREV **wrap around**.
- On a wrap the app speaks and posts "Wrapped to <label>, <i> of <n>".
- Each screen header shows the position as text, "2 / 5". This adds text only; no README label changes.
- **Parent-focus memory.** BACK returns to the parent screen with focus on the card you entered from (Hub → Lights → BACK lands on Lights, not item 1).
- **Default focus on entering a screen is item 1**, except where stated below.
- `SA.config.input.minInterTokenMs = 250`. `keydown` events with `event.repeat` are ignored.
- `preventDefault()` on Space, the arrow keys, Backspace and Enter. Hub-level `C` toggles the dashboard.

**Screen 1, Mode Selection** (resolves G9 card names)
- Two cards: **"Visual Navigation"** and **"Audio-Assisted Navigation"**, with the README pills `EEG: Simulation Mode` • `Environment: Smart-Home Simulator`.
- A third pill, separate from the README pills, always shows the decoder mode: `Decoder: Scripted` / `Decoder: Replay (BCI IV-2a A0x, session E)` / `Decoder: Synthetic`.
- SELECT on Visual sets `store.prefs.voice=false`. SELECT on Audio-Assisted sets it to `true`. Both go to the Hub. The harness voice toggle mirrors the value and can override it.
- **BACK on the root is a no-op.** It posts and speaks "Already at the start screen". It never exits and never reloads.

**Screen 2, Hub**
- Five cards in README order. The live subtitles are:
  - `Lights (n Active of 3)`;
  - `Ceiling Fan: OFF|Low|Medium|High`;
  - AC: `24°C • Cool Mode`, prefixed with `OFF • ` when the power is off;
  - `Smart TV: Standby`, or `Smart TV: On • Ch 1 • Vol 20` when on;
  - `4 Multi-Device Semantic Routines`.
- SELECT goes to Lights (S3), Fans, AC, TV or Presets (S6). BACK goes to S1.
- With wrap-around, Presets is reached in 1 token (PREV).

**Screen 3, Lights Fixtures**
- Three fixtures in README order with their README states.
- SELECT goes to S4 for that fixture. BACK goes to the Hub with focus on Lights.
- **No KG pre-focus tomorrow** (POST-MID-EVAL; key `SA.config.ui.kgPrefocus=false` is reserved). The KG's top candidate, Bedroom Ceiling Light, is already item 1 in the canonical case, so pre-focus saves **0 tokens in the demo**. It only adds a focus that moves on its own after a rollback.

**Screen 4, Actions**
- Options: **Turn On, Turn Off, Adjust Brightness, Back**, with default focus on Turn On.
- The **Back** card behaves exactly like the BACK token.
- **Adjust Brightness** swaps the same listbox to the sub-list **25% / 50% / 75% / 100%**. Default focus is the value nearest the current brightness (KG initial 100%). BACK returns to the action list.
- **Screen 4 reading is "KG-validates-focused"** (agrees with KG D18(b); the UX brief also scores via validation):
  - "Decoded Intent: `Turn On Light`" is the category-level verb plus class.
  - The resolver re-scores **all** fixtures in the class.
  - "Resolved Entity" and "SPARQL Match" show **the fixture the patient chose**, with its own score (0.94 for the ceiling light).
  - The panel adds one line: `KG top candidate: :BedroomCeilingLight ✓ matches selection`, or `KG top: <iri> (score) ≠ selection`.
  - **An explicit patient choice is never overridden.** The policy uses the chosen entity's semantic score.
  - This is the only reading where Screen 3's explicit choice and Screen 4's resolver both mean something. Under "KG-chooses-from-category", Screen 3 would be pointless.

**Screen 5, Result**
- Shows the README strings exactly.
- **Lockout.** During "Observing post-action EEG..." tokens are ignored, and a visible line says "Input paused during EEG observation". The lockout lasts `SA.config.errp.windowMs` (1000 ms; consistent with X10).
- `[No ErrP]` and `[Simulate ErrP]` are harness-only.
- The harness toggle "ErrP auto-confirm" is **default OFF** so the presenter controls the pace. When ON, it auto-fires No ErrP after 1500 ms.
- **Success path.** Options [Return to Home] (focused) and [Back to Fixtures]. BACK goes to Fixtures with focus on the acted fixture.
- **Rollback path.** Options **[Retry]** (focused) and **[Return to Home]**, exactly as in the README.
  - Retry re-runs the policy for the alternative (Bedside Lamp, Turn On) and goes through S4 policy evaluation to S5.
  - **BACK = Return to Home** (1 token instead of 2; UX D7).

**Fans screen**
- Options: Off, Low, Medium, High, Back. Default focus is the current speed, or Low when the fan is OFF (resolves G9).

**AC screen**
- Options: Power, Temp −, Temp +, Cool, Fan, Dry, Back.
- Temp step is **1 °C**. The UI allows **16–32 °C** so that a hazard is reachable.
- Temp ± is a **stepper**: focus stays on it after each actuation.
- 24 → 17 takes 7 SELECTs. The press to 17 fires CAREGIVER APPROVAL.
- **UX dependency on Debate 5 (X8).** In-band setpoint changes must be **Low tier tomorrow**, as in the KG TTL. If they were Medium with an EXECUTE threshold of 0.85, the canonical 0.819 would force a CONFIRM on every press, about 14 tokens for the thermal demo.

**TV screen**
- Options: Power, Channel −, Channel +, Volume −, Volume +, Back.
- Channels 1–99 with wrap. Volume 0–100 in steps of 5. Initial values Ch 1 / Vol 20 (KG assumption). Volume steppers keep focus.

**Screen 6, Presets**
- Four cards in README order. SELECT opens a **diff preview** (for example "Bedside Lamp: ON ➔ OFF").
- The preview uses the same interaction as CONFIRM (§3): SELECT commits atomically, BACK cancels, NEXT/PREV re-prompt.
- The diff preview *is* the confirmation, so no second CONFIRM is asked unless the policy returns CAREGIVER.

**Caregiver-pending state (tomorrow)**
- A **patient-modal** waiting card: "Waiting for caregiver approval. Tongue to withdraw."
- Its single option is [Withdraw request]. BACK withdraws (WITHDRAWN). Expiry is `SA.config.approvals.expiryMs = 300000` (EXPIRED), and nothing is ever auto-approved.
- The non-modal variant (UX D8) is POST-MID-EVAL. Modal keeps tomorrow's state machine to one path while preserving the patient's veto.

**Replay mode inside navigation (G12)**
- The decoded class *is* the token. Right hand → NEXT, and so on.
- The operator picks a trial in the replay picker, and a harness button "Decode trial ► inject token" sends it.
- A decode strip in the rail shows `Pred: Both Feet (0.71) • Truth: Both Feet ✓`, or ✗.
- **A mis-decode really moves the cursor wrongly.** That is the honest demonstration of fragility (UX §1.3).
- The neural confidence for the policy is that trial's softmax maximum.

**Rationale.** Wrap-around cuts the Hub's mean cost from 2.0 to 1.2 tokens. Focus memory and BACK = Return to Home cut tokens further, without changing any README label or order. Pre-focus and the non-modal approval wait add moving parts while saving nothing in the scripted demo.

**Evidence.** UX §1.5 (fatigue: never auto-advance; show the position); §1.6 (wrap); §1.7 (lockout and debounce); §2.1 (Screen 4 tension); §2.3 (AC stepper); D6–D8; KG D18; cross-check X9, X10, G9, G12.

**Risks**
- An examiner may ask why the KG does not pick the fixture. The answer: it validates the explicit choice, shows its own ranking, and supplies the post-ErrP alternative. Pre-focus is the planned extension.
- A modal approval wait blocks other navigation, which is documented as a known limitation.

## 3. CONFIRM interaction

**Choice: Design B plus the confidence gate from C.**
- **SELECT (Both Feet) confirms, BACK (Tongue) cancels.**
- **NEXT/PREV do nothing except re-prompt.** They re-speak the prompt and show "Use Both Feet to confirm or Tongue to cancel" for 2 s, with no flashing.
- **Rendering:**
  - a `role="dialog"` with `aria-modal="true"` and `aria-labelledby`;
  - it contains a listbox with **one** option, `✓ Confirm: Turn On Bedroom Ceiling Light`, which is focused. There is **no Cancel card** that an erroneous NEXT could land on;
  - the diff line `Bedroom Ceiling Light: OFF ➔ ON`;
  - the reason line, e.g. `Confirmation needed: 0.80 × 0.80 = 0.64 < 0.75 (Low tier)`, using whatever combination rule Debate 5 rules, printed from the policy trace;
  - the instruction `Both Feet ✓ to confirm • Tongue ✕ to cancel`.
- Speech: "Confirm turning on Bedroom Ceiling Light? Both feet to confirm, tongue to cancel." (≤140 characters).
- **Gate.** `SA.config.policy.confirmTokenMin = 0.60`. A confirm token whose own neural confidence is below 0.60 re-prompts instead of executing. In Scripted mode the confidence is the slider value; in Replay it is the trial's softmax.
- **Timeout.** None by default (`SA.config.policy.confirmTimeoutMs = 0`, meaning off). If enabled, a timeout cancels and never executes (SC 2.2.1).
- **Cancel** returns to S4 with focus on the same action. It writes a `DECISION` audit entry with outcome `CANCELLED_BY_PATIENT`.
- **REJECT** (not a dialog):
  - posts "Not sure, please try again" to `#sa-alert` and speaks it;
  - stays on S4 with focus unchanged, with no actuation.

**Token cost.** Nominally **+1 Both-Feet token**, as PROMPT states. Expected cost **1.17 tokens at P = 0.777** (1.35 at A02's 0.615), against 1.81 for a generic two-button dialog. That is +16% on the canonical 4-token flow instead of +25%. Modelled false-cancel rate 8.7%; false-confirm rate (1−P)/3 = 7.4% under uniform confusion [MODEL]. Feet↔tongue confusion may be higher [UNVERIFIED until our confusion matrix exists].

**Evidence.** UX §2.2 (designs A/B/C), §0.3, D5; WCAG 2.2.1 and 3.3.4 mapping in UX §3.

**Risks**
- Feet/tongue confusion makes false confirms likelier than the uniform model assumes. Report the measured confusion matrix after the replication.
- The single-option listbox is unusual. Its `aria-label` must state the Tongue-to-cancel rule.

## 4. Audio

**Choice: `POC/js/voice/speech.js` (`SA.voice.speech`)**
1. **Voice choice:**
   - prefer `localService === true` voices with `lang` starting `en`, ranked en-US first, then by name (Zira, then David, then Mark);
   - else the `default` voice **only if** it has `localService === true`;
   - else **text-only**, with a visible pill `Voice: text only (no offline voice)`;
   - online "(Natural)" voices are used only if the harness toggle `Allow online voices` is ON (`SA.config.voice.allowOnlineVoices=false`). This is the safety valve for the viva if the headed Edge check shows no local voices (UX open question 1).
2. **`voiceschanged`.** Re-run the choice on every `voiceschanged` event, and also poll `getVoices()` at 0, 250, 1000 and 3000 ms, because the list starts empty (LOCAL-TEST: 0 voices synchronously, 321 after about 1.5 s).
3. **Cancel-before-speak for navigation.** Navigation speech is `cancel()` then `speak()`, so the newest wins. **Exception:** while a *safety* utterance is active (flag set on `start`, cleared on `end`/`error`), navigation speech is not voiced. Only the latest navigation string is kept, and it is spoken when the safety utterance ends. Safety utterances (REJECT, rollback, thermal hazard, caregiver decision) are queued and never cancelled by navigation.
4. **Utterance format.**
   - At most 140 characters, split at sentence boundaries (Chromium 15 s cutoff [22]).
   - rate, pitch and volume 1.0; `lang 'en-US'`.
   - A pronunciation map turns display text into speech text: `FCz→"F C z"`, `Cz→"C z"`, `−8.4 µV→"minus 8 point 4 microvolts"`, `°C→" degrees Celsius"`, `➔→" to "`, `•→", "`.
5. **Never block.** No state transition awaits `onend`. `canceled` and `interrupted` errors are treated as normal.
6. **User activation.** Chromium requires a user gesture before `speak()`. That is from memory: deprecated around Chrome 71 [UNVERIFIED]. The first token keypress counts as the gesture, so there is no boot announcement.
7. **aria-live mirroring.** `#sa-status` (`role="status"`, `aria-live="polite"`, `aria-atomic="true"`) and `#sa-alert` (`role="alert"`, with no added `aria-live`) are in the **initial `index.html` markup**, empty at load.
   - Every spoken string is mirrored. Clear the region, then set the text in the next `requestAnimationFrame`, so repeated identical strings are re-announced.
   - The same text appears in a visible **caption bar** at the bottom of the patient stage (22px, `--text-muted` label "Spoken:"). That bar *is* the text fallback.
8. **Testing (G5).** The self-test asserts on `#sa-status` and `#sa-alert` text, never on speech. Headless commands use `--user-data-dir=<scratchpad>/edge-profile` (G6) and `--virtual-time-budget=5000` (G5).
9. **Documentation note.** Screen-reader users should turn Voice OFF to avoid hearing everything twice.

**Evidence.** UX §0.7, §4 (LOCAL-TEST: headless Edge lists only online voices; the Windows registry has David, Zira and Mark), D12; Web Speech spec [21]; MDN live regions [18].

**Risk.** If headed Edge does not list local voices, tomorrow's demo is text-only unless online voices are allowed over Wi-Fi. **Action item for the user tonight:** the 30-second DevTools check `speechSynthesis.getVoices().filter(v=>v.localService).map(v=>v.name)`.

## 5. Layout

**Shell (`POC/css/layout.css`, CSS grid).** Three regions:
- a **top bar** with the title, the README status pills, the decoder-mode pill, the voice pill, and the `Caregiver Dashboard` switch;
- the **patient stage** on the left and the **right rail** on the right;
- a full-width **harness dock** at the bottom. It has a dashed `--harness-border` border, a `--surface-harness` tint, and the header **"Operator Harness — not patient-facing"**. A collapse button shrinks it to a 36px strip.

**1920×1080 (≥1600px wide)**
- Top bar 64px; harness dock 184px; stage height ≈ 832px.
- Columns: stage `minmax(960px, 1fr)`, rail `600px`, 24px gutters.
- The rail stacks three cards:
  1. the **CogLign panel**, about 360px, with every README field: Decoded Intent, Spatial Context, Resolved Entity, SPARQL Match, Confidence Telemetry, Policy Decision, plus the "KG top candidate" line and a collapsible `<details>` showing the SPARQL that actually ran;
  2. the **KG subgraph**, 220px tall;
  3. the **brain graph evo0→evo3**, 220px tall.
- **Both graphs are visible at once.**

**1366×768 (1200–1599px wide)**
- Top bar 48px; dock 152px (collapsible); stage ≈ 568px tall.
- Columns: stage `1fr`, rail `420px`.
- The rail holds the CogLign panel in compact form (~300px; the SPARQL is collapsed by default) and **one shared graph slot** (~250px) with two tab buttons, `[Knowledge graph]` and `[Brain graph]`.
- The tab **auto-follows the last event.** `eeg:decoded` switches to Brain while evo0→evo3 plays. `kg:resolved` switches to KG. The operator can click a tab; tab buttons use `mousedown preventDefault`.
- Hub cards sit in a 3+2 grid, with linear NEXT/PREV order still matching README order.

**Below 1200px (150% zoom)**
- A single column: the stage, then the rail. The dock is collapsed by default via `@media (max-height:600px)`.
- Sizes are in rem with `clamp()`, so 90–150% zoom does not break the layout.

**How the views avoid overwhelming the screen**
- **KG subgraph:** an inline SVG of at most 9 nodes:
  - Patient, Master Bedroom, Living Room, and the 3 lights, plus at most 3 context nodes;
  - the winner has a 4px border and the label "1st 0.94";
  - the runner-up has a dashed border and "2nd 0.88";
  - after an ErrP, the penalised entity shows "ErrP −0.27" as text;
  - every cue is text plus line style, never colour alone. This is not the whole ontology.
- **Brain graph:**
  - the 22-electrode montage from the paper's Fig. 2a rows, with FCz = channel 4 and Cz = channel 10;
  - stage chips `evo0 evo1 evo2 evo3`, each with its edge count;
  - 600 ms per stage, shown as discrete steps under reduced motion;
  - the caption **"Model-internal SFE-GAT graph — not a measured change in brain networks"** (bci-eeg honesty note).
- **Scripted mode:** the brain slot shows the static montage and the caption "Scripted mode: tokens are not decoded from EEG. Switch to Replay to see SFE-GAT evolve the graph." That is honest, and needs no fake animation.
- **Screen 1 and Screen 2:** the CogLign panel shows "Awaiting intent", collapsed to 120px.

**Caregiver dashboard (`C` key or top-bar switch; full view swap)**
- While the dashboard is shown, patient token keys are ignored. Only `C` and the mouse act.
- A banner reads **"Caregiver view — simulated, no authentication"**.
- At 1920 (12-column grid):
  - row 1: the **High-Risk Action Approval Queue** (7 columns). Each card shows the decoded intent, n and s, current ➔ target state, the hazard rule that fired ("setpoint 17 °C < 18 °C minimum"), elapsed time, and [Approve]/[Reject]. Next to it, the **gauges** (5 columns): three half-arc gauges, Neural, Semantic and ErrP health, each with its numeric value as text;
  - row 2: the **live shadow table** (6 columns) and the **brain graph live** (6 columns);
  - row 3: the **audit log**, full width, scrollable, with the badge "Chain verified ✓" (or "Chain verified ✓ (FNV-1a — integrity only, not tamper-proof)"), the head hash with its sequence number, [Verify chain], and [Tamper entry (demo)].
- At 1366: two columns. The approval queue is full width at the top when anything is pending. The gauges and shadow table share row 2, and the brain graph and log row 3.
- The result of Approve or Reject is spoken to the patient and posted to `#sa-alert`.

**Reset vs audit (resolves §1.5).**
- `[Reset Demo]` restores the device, store and UI state: Screen 1, focus index 0, voice per the default, decoder Scripted, sliders 92/89.
- It **appends** a `RESET` audit entry and never wipes the log. The audit log is explicitly **outside** "initial state".
- The self-test compares device, store and UI state only.

**Evidence.** PROMPT §0 (both graphs must be visible), §D (the brain graph also live in the dashboard); UX §3 (SC 2.4.11, 2.3.3), §5, §8.2; KG §6 (panel prints the query that ran; subgraph highlights winner and runner-up); bci-eeg montage note.

**Risks**
- The 1366×768 height is tight, so the dock must collapse. Verify with headless screenshots at both sizes and at 150% zoom.
- An auto-switching tab could surprise a viewer, so the tab label always states which graph is shown.

## 6. Features beyond the README

| Item | Tomorrow? | Detail |
|---|---|---|
| Wrap-around plus position text "i / n" | **IN** | Additive text only, no README label changes; spoken wrap |
| Debounce (250 ms, `event.repeat`) and post-actuation lockout (1000 ms) | **IN** | Safety controls H11; no visible label change except "Input paused during EEG observation" |
| Visible speech caption bar | **IN** | The required text fallback |
| Standby / pause | **POST-MID-EVAL** | Adds a state and an exit gesture that need their own false-exit analysis (Huggins: ≤ 1 per 2–4 h [7]). Listed as future work in the viva. |
| "Call caregiver" | **POST-MID-EVAL** | Needs a non-README patient card or token gesture (H9). Future work. |
| Thermal advisory band 18–19 / 27–30 °C | **POST-MID-EVAL** | `SA.config.policy.thermal.advisoryBand = null` is reserved. It would change policy outcomes of in-band AC presses and complicate tomorrow's thermal demo. Tomorrow the rule is exactly the README's: < 18 or > 30 °C → CAREGIVER APPROVAL. |
| KG pre-focus on Fixtures | **POST-MID-EVAL** | `SA.config.ui.kgPrefocus = false` is reserved. It saves 0 tokens in the canonical demo. |
| Non-modal caregiver wait | **POST-MID-EVAL** | Modal wait with Withdraw tomorrow |
| HMAC caregiver PIN for the audit log | **POST-MID-EVAL** | The head-hash anchor is shown tomorrow |

**ErrP after a caregiver-approved High-tier action (X6, UX side).**
- The UI supports both outcomes through the observation result field `{rollback: true|false}`.
- **My position: alert only.** No auto-rollback. The UI shows "Possible patient disagreement — caregiver alerted" and posts it to `#sa-alert` (UX D9).
- Debates 2 and 5 own the final ruling. The demo script never fires an ErrP on an approved thermal action, so the demo is unaffected either way.

**Bedside Lamp alternative (X1) and Semantic 89% (X4): UI contract only.**
- The S5 screen renders `result.alternative` (one IRI plus label plus score) and the CogLign panel renders `semanticConfidence` with its one-line derivation as supplied by `SA.kg`. The UI does not depend on which mechanism Debates 2 and 4 pick.
- For a one-line explanation in the panel I prefer the KG option `0.94 × room 0.95 = 0.893 → 89%`.

## 7. Visual design tokens (`POC/css/tokens.css`)

**Colours.** All ratios were computed with the WCAG relative-luminance formula in this session.

| Token | Value | Contrast |
|---|---|---|
| `--bg` | `#0E1419` | page background |
| `--surface-1` | `#161F27` | cards |
| `--surface-2` | `#1C2731` | rail panels, dashboard tiles |
| `--surface-focused` | `#1E2A35` | |
| `--surface-harness` | `#1B1726` | |
| `--text` | `#E8EEF2` | 15.8:1 on bg, 14.3 on surface-1, 12.5 on surface-focused |
| `--text-muted` | `#A9B8C4` | ≥ 7.19:1 on every surface; AAA even for muted text |
| `--focus-ring` | `#FFD447` | ≥ 10.3:1 on every surface; dark text on it 13.0:1 |
| `--border` | `#6B7D8D` | ≥ 3.44:1 on every surface (SC 1.4.11) |
| `--accent` | `#5CCFE0` | ≥ 7.97:1 |
| `--ok` | `#5CD69B` | ≥ 8.0:1 |
| `--warn` | `#F5B94A` | ≥ 8.3:1 |
| `--danger` | `#FF9E95` | ≥ 7.36:1 |
| `--info` | `#8CC4FF` | ≥ 7.97:1 |
| `--harness-border` | `#9C8CCF` | dashed |
| `--edge-weak` | `#6B7D8D` | weak graph edges |
| `--edge-strong` | `#5CCFE0` | strong graph edges; edge strength is also shown by stroke width, 1–4px |

- **Contrast targets:** patient-facing text ≥ 7:1 (AAA 1.4.6); harness and caregiver text ≥ 4.5:1; all non-text UI and meaningful graph strokes ≥ 3:1.
- **Self-test:** `POC/js/selftest/selftest.js` recomputes these ratios from computed styles.
- **Policy decisions** always carry text plus a glyph, never colour alone: `✓ EXECUTE`, `? CONFIRM`, `✕ REJECT`, `⚑ CAREGIVER APPROVAL`.

**Typography.** No web fonts.
- Font stack: `"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif`; monospace `Consolas, "Cascadia Mono", monospace` for SPARQL and hashes.

| Use | Size |
|---|---|
| Screen title | 36px / 600 |
| Card title | 30px / 600 (≥ 28 required) |
| Card subtitle and patient body | 22px / 400 (≥ 20 required; not "large text", hence the 7:1 target) |
| "● Focused" marker | 20px / 700 |
| Status pills | 18px / 600 |
| CogLign panel | 16px; values 18px / 600 |
| Caregiver dashboard | 16px |
| Harness | 14px (operator only) |

- Line height 1.4. Use `font-variant-numeric: tabular-nums` for telemetry.

**Spacing and shape**
- Scale 4 / 8 / 12 / 16 / 24 / 32 / 48px.
- Card radius 16px; panel radius 12px; minimum card size 240×160px (Hub).
- Pointer targets on the harness and dashboard ≥ 32×32px (above the 24px minimum of SC 2.5.8).

**Motion**
- `--dur-focus: 120ms`, `--dur-evo-step: 600ms`, radar sweep period 2000ms (continuous rotation, never > 3 flashes/s).
- `prefers-reduced-motion` **or** the harness toggle sets `html[data-reduced-motion]`, which forces all durations to 0ms, shows evo stages as discrete steps and keeps the radar static. The focus scale stays, because it is a state and not an animation.

**Evidence.** UX §0.9 (20px is not large text), §3 (SC 1.4.3, 1.4.6, 1.4.11, 2.3.1, 2.3.3, 2.5.8); PROMPT §D design line; CLAUDE.md §3 (all colours and spacing in `css/tokens.css`).

**Risk.** Yellow focus on a dark ground is very salient. That is intended: the focus must be unmistakable from across a room, per PROMPT. Every other colour stays desaturated to keep the theme "clinical-calm".

---

**Build note for tonight (UI engineer owns `POC/js/ui/`, `POC/js/input/`, `POC/js/voice/`, `POC/css/`).**
- One generic listbox component (`POC/js/ui/components/listbox.js`) drives every screen, the CONFIRM dialog and the preset diff. That keeps the screen modules thin and each file under 400 lines.
- Everything marked POST-MID-EVAL has a reserved config key and no code. Plan A work is config-only, consistent with the compute plan.

=== critique:assistive-ux ===


# Critic: Debate 7 (Assistive UX)

## What I checked

All checks were read-only.

- **README codepoints** (`od -c`):
  - "-8.4 µV" uses a hyphen-minus (0x2D) and the micro sign U+00B5.
  - The Observing string is written in the README as `“Observing post-action EEG...”`. The curly quotes U+201C/U+201D are *inside* the code span.
- **Contrast.** I recomputed every palette ratio with the WCAG formula in Node.
- **KG arithmetic.** I recomputed scores from knowledge-graph.md §3.2–3.5.
- **The user's display:**
  - `Win32_VideoController` reports 1920×1080.
  - `Screen.AllScreens` reports bounds 1536×864 and working area 1536×816.
  - `AppliedDPI` is 120, which is 125 % scaling.
  - **So the real viva machine gives a CSS viewport of about 1536 × ~730 inside Edge. Neither proposer designed for this.**

## Severity key

- **[BLOCKER]**: breaks the README, the PROMPT or the demo tomorrow.
- **[MAJOR]**: a real defect or hazard.
- **[MINOR]**: polish, or a ruling is needed.

---

## A. Navigation and Screen 4 semantics

**1. [BLOCKER] Both: "validate-the-focused-fixture" plus "policy uses the chosen entity's KG score" REJECTs legitimate explicit choices.**

These are the KG brief's own formula and weights (§3.2–3.5), with Debate-4 option A for the semantic term (s = S × 0.95) and the UX product rule (c = n·s):

| Explicit choice | S | s | c | Decision |
|---|---|---|---|---|
| Turn Off on Living Room Light (the only light that is ON, i.e. "1 Active of 3") | 0.35 + 0 (other room) + 0.20 + 0 (no TurnOff history) = 0.55 | 0.5225 | 0.92 × 0.5225 = **0.481 < 0.50** | **REJECT** |
| Turn On TV from the bedroom (TV is in the Living Room) | 0.55 | 0.5225 | 0.481 | **REJECT** |

- The Watch TV preset's TV step is the same case.
- The patient therefore can never turn off the one lit lamp, or turn on the TV, without an operator changing the room selector. "Not sure, please try again" repeats forever.
- **The root cause.** The resolver's spatial and recency prior answers "which referent did an *ambiguous* intent mean?". Both proposers feed it into the policy as "how plausible is this *explicit* request?". A's claim that "the KG never overrides an explicit choice" is false in effect: the KG vetoes it.
- **Neither proposer defines where s comes from for Fan, AC, TV or Presets.** Those are single-candidate or no-candidate actions, and README S4 only defines the panel for lights.
- **Needed in the ADR:**
  - (a) For an explicit selection, the semantic term must not include the spatial/recency prior. For example: s = feasibility (type gate × no-op guard) × room confidence. The prior is used only for ranking, the mismatch line and the alternative. Or the KG may escalate an explicit choice at most to CONFIRM, never to REJECT.
  - (b) A defined s for non-light devices and presets.
  - (c) Debate 4/5 must be told this.
  - The canonical case still prints 0.94 / 89 % under (a), because it is the top candidate.

**2. [MAJOR] Both: the README's Retry *is* KG-chooses semantics, and neither proposal admits it.**

- After a rollback, SELECT on [Retry] actuates Bedside Lamp, which the patient never picked on S3. "Validate-focused only" (A: "KG never overrides an explicit choice") contradicts README §3 S5.
- The ADR must state a hybrid: explicit choice on S3, and a KG-chosen referent only on the post-ErrP alternative. The alternative is spoken and visible before the SELECT.
- **Fragility.** Retry's c = 0.92 × 0.88 × 0.95 = **0.769**. That is EXECUTE at a Low threshold of 0.75, but **CONFIRM at the Chow-derived 0.77** (UX §6.3). The UX ADR must state that Retry's decision comes from Debate 5 and the UI handles both outcomes.

**3. [BLOCKER] Both: the stepper conflicts with the S5 flow, so the thermal demo is unworkable as specified.**

- Both route every AC press to S5 (Observing, then the outcome options). With ErrP auto-confirm OFF (both proposers' default), 24 → 17 °C costs 7 × (SELECT + operator [No ErrP] + SELECT Continue) ≈ **14 patient tokens + 7 operator clicks**. That is about a minute of a 5-minute demo.
- **B is internally contradictory.** Its S5 success path focuses [Return to Home] and offers [Back to Fixtures], which does not exist for the AC. Every Temp − press therefore exits to Home, and the claimed "focus stays on the stepper" never happens.
- A's "Continue → previous action screen, focus kept" works but is still slow.
- If Debate 5 makes in-band AC Medium (UX §7.2, X8), every press also CONFIRMs: about 21 tokens. A does not mention X8 at all.
- **Needed:**
  - either inline observation on device screens (an observing band plus lockout, staying on the AC screen with focus kept), keeping S5 for the light/preset flows the README describes;
  - or the demo script turns auto-confirm ON for the thermal segment;
  - and the X8 dependency written into the ADR (B did this; A did not).

**4. [MAJOR] Both: following the demo script with "Continue / focus kept" walks the presenter off the README values.**

- After step 1 (EXECUTE, No ErrP), the ceiling light is ON and its recency is 7/10.
  - Re-issuing Turn On gives f_X = 0 → S = 0.755 → CONFIRM.
  - Turning it off first and then on again gives f_R = 0.7 → **0.955, not 0.94**.
- The README numbers reappear only after `[Reset Demo]`. The ADR and demo script must put Reset between segments, and Reset must reload the KG recency seed.
- **[MINOR]** A says it restores the KG; B's Reset lists only "device, store and UI".

**5. [MAJOR] B: the caregiver-pending card's single focused option [Withdraw request] means SELECT also withdraws.**

- Two of the four MI classes then cancel a hazard approval, which inverts the CONFIRM grammar (SELECT = yes).
- A's version (NEXT/PREV/SELECT re-prompt, BACK withdraws) is consistent. **Adopt A's.**

**6. [MAJOR] B: S5 success options introduce a non-README label, [Back to Fixtures], with brackets as if from the README, and it is undefined for Fan, AC, TV and Presets.**

- A's "Continue" is also invented, but it is device-agnostic.
- **Both** leave the S5 *rollback* path undefined for non-light actions and presets. There is no KG alternative, so what does [Retry] do: re-issue the same action that just drew an ErrP?
- Ruling needed. One option: for unambiguous actions, rollback offers [Retry] = the same action, escalated to CONFIRM by the ErrP-history flag, plus [Return to Home].

**7. [MAJOR] A: `ui.decisionDwellMs = 800` keeps S4 visible after EXECUTE, but the lockout starts only at actuation.**

- A second SELECT inside 250–800 ms passes the debounce and requests the action twice.
- The lockout must start at the committing SELECT.
- B has no dwell but has a different gap: after its 1000 ms lockout, it does not say what tokens do while S5 is still "Observing" (auto-confirm OFF).
- **A's rule is better:** lock until `errp:result`, documented as operator-gated in the POC.

**8. [MAJOR] Both: [No ErrP] and [Simulate ErrP] are described as outcome switches.**

- PROMPT §B requires the detector to "genuinely detect" the injected epoch and "not fire on correct ones". The UI must emit an injection event (`errp:inject {kind}`) and render whatever the detector returns, including a false positive on [No ErrP].
- Neither says this. B's `{rollback: true|false}` is closer.

**9. [MINOR] Both: Adjust Brightness on an OFF light is a compound command (TurnOn + SetBrightness).**

- The KG has no f_X for SetBrightness, because Brightness is a property, not a power state. The semantic score is therefore undefined.
- Rollback is a 2-step saga (power and brightness).
- A specifies the diff ("OFF ➔ ON 50%") but not the score or the saga. B does not cover the OFF case.

**10. [MINOR] A: dynamic "Turn Off / Turn On" AC/TV cards deviate from PROMPT §D's "Power".**

- Toggling labels under a stepper-style kept focus means a repeated SELECT flips the device back.
- B's "Power" with a state badge is safer.

**11. [MINOR] Unresolved G9 values on which the proposers conflict.** The judge must pick one:

| Value | A | B |
|---|---|---|
| TV volume step | 10 | 5 |
| Hub fan subtitle casing | "Ceiling Fan: LOW" | "Low" (README initial is uppercase "OFF"; KG labels are "Low") |
| AC-off hub subtitle | — | "OFF • 24°C • Cool Mode" |

- **Back cards:** both add them on device screens but not on S3/S6. With wrap, that is an extra stop per cycle. State why.
- **Wording:** B's "Hub-level `C`" must be global (README: "or C key").

---

## B. CONFIRM

**12. [BLOCKER] Both: in Scripted mode, gate C (confirm token confidence ≥ 0.60) livelocks.**

- The same neural slider drives the original token and the confirm token. Any CONFIRM case with n in [0.40, 0.60) can never be confirmed: SELECT re-prompts forever. With UX §6.4's floor, n = 0.55 and s = 0.99 gives c = 0.545, which is CONFIRM.
- **Fix:**
  - either the gate threshold must be ≤ the REJECT neural floor in Scripted mode;
  - or there is a separate "confirm-token confidence" slider, defaulting to 0.92;
  - or the gate applies only in Replay/Synthetic modes.
- The demo script's "slider-forced CONFIRM" must use n ≥ 0.60.

**13. [MAJOR] Both understate the false-confirm rate.**

- (1−P)/3 = 7.4 % is the *per-token* rate. Under design B, NEXT/PREV re-prompt, so the probability a cancel-intending user *ends* confirming is 0.0743 / 0.8513 = **8.7 %**, symmetric with false-cancel.
- CLAUDE.md §6 says "never round in our favour". Also, both quote 1.17 tokens *without* gate C, and the gate raises the cost; it is not computed.
- Both must print 8.7 % and say "gate cost not modelled".
- The feet↔tongue concern is correctly flagged [UNVERIFIED] by both. If the Plan-B confusion matrix exists at freeze, report it labelled PRELIMINARY (A says this; B defers).

**14. [MINOR] Both prompt examples presume the product rule.**

- A: "0.92 × 0.80 = 0.736". B: "0.80 × 0.80 = 0.64 < 0.75 (Low tier)".
- The UX ADR must say the reason line is rendered from `policy.trace` verbatim, with no arithmetic in UI code (A says this for confidence only).

**15. [MINOR] A replaces the list with a "prompt card" but does not say it lives inside a focused `role=listbox` (or dialog).**

- If the old listbox node is removed, DOM focus drops to `<body>` and `aria-activedescendant` context is lost.
- B's `role="dialog"` + single-option listbox is explicit.

---

## C. Focus and input

**16. [BLOCKER] Both: "refocus the listbox on `pointerup`" breaks every `<select>` in the harness.**

- Chromium opens a select's popup on mousedown. Blurring it on pointerup closes the popup, so the trial picker, room selector and decoder-mode select become unusable.
- Separately, Esc-closing a select fires no `change`. Under A's rule (token keys are ignored while an input or select has focus), all tokens are then dead until the operator clicks elsewhere.
- **Fix:**
  - `<select>`: refocus on `change`, on `blur`, and on keydown Escape.
  - `<input type=range>`: refocus on `pointerup`/`change`.

**17. [MAJOR] B: letter tokens "always work" even when a harness `<select>` has focus.**

- Type-ahead then fires as well. Pressing **A** (PREV) on the trial picker also jumps to the first "A0x…" trial, which silently changes the replay trial.
- A's "ignore token keys when target is input/select" is correct once #16 is fixed.

**18. [MAJOR] A: patient tokens keep actuating while the dashboard *replaces* the stage and rail.**

- A presenter pressing Space on the dashboard actuates the focused patient control invisibly (for example, Temp −).
- B ignores patient tokens while the dashboard is open, but then the "patient withdraws while the caregiver decides" story cannot be shown.
- **Ruling needed.** One option: the dashboard ignores SELECT but lets BACK withdraw. Another: the dashboard keeps a live patient-stage thumbnail.
- **A also lacks the label** "Caregiver view — simulated, no authentication" (UX §5 requires it; B has it).

**19. [MINOR] A: the "● Focused" marker is 18 px. PROMPT §D says "Patient text ≥ 20px".**

- `aria-hidden` does not make it non-patient text.
- B's status pills are also 18 px, and they are README patient-visible pills.
- A leaves the caption bar, "n of m" and confirm-prompt sizes unspecified.
- **Rule:** every patient-stage string ≥ 20 px.
- The rail/CogLign panel (16 px in both) must be explicitly classified in the ADR as examiner/clinician text, ≥ 4.5:1, or it violates the same rule.

**20. [MINOR] B's 12 px listbox padding is less than the overhang of the scaled, ringed card.**

- The overhang is outline 6 + offset 4 + 1.04 scale on a ≥ 240 px card (≈ 5 px) ≈ 15 px.
- Any scrolling or overflow container clips the ring (SC 2.4.11/2.4.13). A's 20 px plus "no overflow:hidden" is fine.

**21. [MINOR] Speech activation.**

- Per the HTML user-activation rules (from memory, [UNVERIFIED]), keydown of **Esc** does not grant activation. If the first token is BACK (Esc), the first utterance is dropped.
- Harmless if documented. The caption covers it.

---

## D. Audio

**22. [BLOCKER] B: the "Allow online voices" harness toggle sends every utterance to Microsoft's cloud TTS.**

- That includes device states and the patient journey. It violates CLAUDE.md §1 ("Nothing leaves this machine… don't send project content to any external service") and PROMPT's offline requirement.
- **Drop it.** A's `allowOnline=false` with no override is the only compliant option.
- If headed Edge has no local voice, the demo is text-only and says so.

**23. [MAJOR] B: Visual mode sets voice=false entirely.**

- PROMPT §D requires the caregiver Approve/Reject result to be "reported back to the patient **and spoken**". Rollback and REJECT also go silent.
- A's split (navigation speech off, safety speech on, in Visual mode) satisfies both the README and the PROMPT. **Adopt A's.**
- B's caption label "Spoken:" is false in Visual mode.

**24. [MINOR] B: the lexicon key is written "−8.4 µV" with U+2212.**

- The README string is hyphen-minus (0x2D) plus U+00B5, so the key will not match.
- The lexicon must be keyed on README bytes, and the self-test should assert the lexicon hit.

**25. [MINOR] A claims "byte-exact" for `Observing post-action EEG...` but drops the curly quotes.**

- The quotes are inside the README code span (verified by `od`).
- Rule explicitly either way, and make the self-test match the ruling.
- A's bracket rule (CSS `::before/::after` "[ ]") is sensible for harness buttons. For patient cards ([Retry], [Return to Home]), rule whether brackets render. B has no rule at all.

**26. [MINOR] A's thermal advisory as a *safety-priority* utterance.**

- On the way to 17 °C it fires at 19 and 18. Protected safety speech then suppresses navigation speech during the very segment where the stepper matters most, and it dilutes the meaning of alerts.
- If it is kept in at all, it should be a navigation-priority note, not `#sa-alert`.

---

## E. Layout

**27. [BLOCKER] Both: the real viva viewport is ~1536 × ~730 CSS px (1920×1080 at 125 %, verified). Neither "1920" tier ever activates on the user's machine.**

- Both gate the two-graph layout at ≥ 1600 px, so tomorrow will show the 1366-tier tabbed single graph. PROMPT §0 says "the build must make both visible".
- Add 1536×730 (and 1280×~600 = 1920 at 150 %) to the screenshot matrix.
- Consider making the side-by-side or stacked-graph tier start at ~1440 px wide **and** ≥ 700 px tall.

**28. [MAJOR] Both: the 1920 tier overflows vertically in a headed browser.**

- Headed 1920×1080 has innerHeight ≈ 950.
- **A:** main = 950 − 56 − 226 (expanded dock by default) = **668 px**, but rail B needs 2 × 360 + 16 = **736 px**.
- **B:** stage = 950 − 64 − 184 = **702 px**, but its rail stack is 360 + 220 + 220 + 2 × 24 = **848 px**.
- **B's "stage ≈ 568 px at 1366×768"** assumes the whole screen is viewport. Headed is ~635–657, so ≈ 430–460. Its 240×160 min cards in 3 + 2 rows plus title and caption (≈ 470 px) overflow. Its 7-item AC screen cannot fit 4 columns of 240 px in a ~900 px stage, so it becomes 3 rows. B also never gives per-screen column counts.
- **B's 1920 grid** (`minmax(960px,1fr)` + 600 + gutters ≈ 1608+) overflows horizontally at widths between 1600 and ~1640.
- A's explicit per-screen column table and its 1366×640 analysis are the better basis.

**29. [MAJOR] Both: tab auto-follow races in Replay (the demo step 5 money shot).**

- A decoded token emits `decode:*`, which selects the Brain tab and starts evo0→evo3 (4 × 600–700 ms ≈ 2.4–2.8 s).
- The resulting focus change on S4 triggers `kg:resolved` (A resolves on *every* verb focus), which flips to the KG tab mid-animation.
- **Fix:** a brain animation in progress holds the tab until it completes, then KG follows. Or use a stacked mini-graph layout at the viva viewport.
- Also, A re-running SPARQL on every NEXT/PREV across S4 verbs must define the panel content when focus is on "Back" or "Adjust Brightness".

**30. [MAJOR] A: Scripted-mode brain graph runs "the forward pass on a fixed exported replay trial" on every keyboard token.**

- The token did not come from that trial, and the trial's prediction may even disagree with the scripted token. Even with the "Illustration" caption, animating an unrelated decode on each keypress implies decoding happened.
- B's static montage plus "Switch to Replay to see SFE-GAT evolve the graph" is the honest choice.

**31. [MAJOR] Both: there is no stub-data contingency for tonight.**

- The brain graph, Replay pill and decode strip depend on `sfegat-weights.js` and `mi-replay.js` from a Plan-B run that may not finish or pass parity by morning.
- The UX ADR must specify the rendering when data are stubs: a visible "STUB DATA — not model output" banner on the brain card and the decoder pill, with Replay disabled.

**32. [MAJOR] B fails two of the user's hard constraints.**

- Its Replay pill and decode strip carry no **PRELIMINARY (Plan B)** label.
- No dataset **attribution / "licence pending supervisor confirmation"** line appears anywhere in its UI.
- A has both, in the decoder badge and the harness data line.
- **[MINOR]** A's top bar at 1366 (two README pills, a long decoder badge, the voice pill and the switch in 56 px) will wrap. Specify truncation, or move the trial details to the decode strip.

**33. [MINOR] A: the self-test "parses tokens.css".**

- On `file://`, Chromium treats local stylesheets as opaque-origin, and reading `cssRules` throws a SecurityError (from memory, [UNVERIFIED in Edge 155]); `fetch` is banned.
- Use `getComputedStyle(document.documentElement).getPropertyValue('--token')`, as B proposes.

---

## F. Colour tokens (recomputed)

**34.** Every ratio in both tables reproduces to two decimals:

| Palette | Checks that reproduce |
|---|---|
| A | text 15.99 / 14.07 / 12.28 / 13.24; muted 8.25 / 7.20 / 7.76; border 3.90 / 4.44; ring 10.72 / 12.19; marker 12.19; harness edge 5.45; semantic colours 9.74 / 8.14 / 7.24 / 8.62 / 8.11 |
| B | text ≥ 12.48; muted ≥ 7.19; ring ≥ 10.27; border ≥ 3.44; marker 13.03 |

Defects:

- **[MAJOR] B: `--warn` #F5B94A vs `--focus-ring` #FFD447 is 1.24:1 at nearly the same hue.** A CONFIRM or advisory chip or border will read as focus.
- A's orange #FF9F68 vs amber #FFC94D is 1.32:1. The hue is distinguishable for trichromats but confusable for deuteranopes.
- **Rule:** warn may never be used as a card border or ring, only as glyph-plus-text chips.
- **[MINOR] A:**
  - `--danger` is 6.81 on `--surface-focus` and 6.32 on `--bg-raised`, under the 7:1 patient target if danger text ever sits on the patient stage (e.g. the REJECT line).
  - The border on raised is 3.41 (OK).
  - The focused-card background change is 1.06:1 (A) and 1.14:1 (B). It is decorative only, so the outline must carry 2.4.13. Both rings change pixels against the page by ≥ 12:1, so this passes.

---

## G. Cross-check items

**35. X6** (ErrP on caregiver-approved actions): the proposers conflict.

- A argues that rolling back a 17 °C approval returns to the prior *in-bounds* setpoint, which refutes UX D9's premise. This is correct: a state above 30 or below 18 °C can only have been reached by approval.
- B asserts alert-only without answering this. "The demo never fires an ErrP there" is not a design argument.
- The UX ADR should carry A's analysis to Debates 2/5 and require the UI to render both outcomes.

**36. G12** (Replay navigation): incompatible.

- A's "a harness token press emits the class of the chosen replay trial" makes the [Right Hand ► Next] button emit a possibly different class, which mislabels a README button.
- B's separate "Decode trial ► inject token" keeps the README buttons honest.
- Neither defines:
  - what *keyboard* tokens do in Replay mode;
  - a "Decoding…" state and lockout covering in-browser forward-pass latency;
  - the store/bus names. A's `decode:*` vs B's `eeg:decoded` must be frozen by Debate 6, not here.

**37. README extras for tomorrow.** The proposers agree that standby, "call caregiver", KG pre-focus, non-modal wait and HMAC are post-mid-eval. That is correct.

- On the thermal advisory, A's information-only version is README-safe in principle. But:
  - it adds untested code tonight;
  - it uses secondary sources;
  - it collides with #26;
  - "AC card subtitle" is ambiguous. If it means the hub card, it changes the README "24°C • Cool Mode" format.
- **Recommend post-mid-eval** (B), with the config key reserved in `SA.config.ui`, not in Debate 5's `policy.*` namespace (B overreaches there).
- **Pre-focus: no.** This is agreed, and both "0 tokens saved" arguments are correct.

**38. Buildability tonight.**

- A's 11 screen modules plus 7 components plus 7 CSS files is too much for one UI agent overnight.
- Recommend B's single generic listbox component driven by a declarative screen table (items, SELECT target, BACK target, wrap). This also gives Debate 6 its screen graph.
- Keep A's per-screen column table, its 1366×640 analysis, its focus-memory rule and its speech contract.

---

## H. What should survive

| Topic | Adopt |
|---|---|
| Focus | Store-driven `.is-focused` + `aria-selected` + `aria-activedescendant`; 6 px ring, offset 4; static scale(1.04); the marker raised to 20 px |
| Wrap and memory | Wrap-around with a spoken wrap and "n of m"; focus memory on BACK |
| BACK | Root BACK is a no-op; rollback BACK = Return to Home |
| Confirm | Design B CONFIRM, with the gate fixed per #12 |
| Caregiver wait | A's modal wait with BACK-only withdraw |
| Audio | A's speech contract (local voices only, Visual mode still speaks safety, the `#sa-status` caption as fallback) |
| Layout | A's explicit grid tables, re-tiered for 1536×730 |
| Honesty | A's honesty labels: PRELIMINARY, attribution, STUB |
| Self-test | Contrast from computed styles |

Every BLOCKER (#1, #3, #12, #16, #22, #27) must be resolved in the ADR before the UI builder starts.
