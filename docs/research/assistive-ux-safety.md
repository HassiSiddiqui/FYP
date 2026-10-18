# Assistive-UX & Safety Brief — SilentAssist (Phase 1)

**Author role:** Assistive-UX & Safety Analyst · **Date:** 2026-10-14 · **Status:** research input for the Policy & Risk debate (#5), the Assistive UX debate (#7), and the safety parts of the Architecture debate (#6).

> **Honesty frame.** This brief borrows *vocabulary* from ISO 14971 (hazard, hazardous situation, harm, risk control) and IEC 62304 (software system, item, safety class). **SilentAssist does not claim compliance with either standard, and no clinical validity is claimed.** All EEG in the POC is synthetic or replayed from a public dataset (README §1 note; CLAUDE.md §6).
>
> Citations are numbered `[n]` (see References). **[UNVERIFIED]** marks claims I could not confirm from a primary source. **[LOCAL-TEST]** marks facts I measured on this machine (Edge 155 headless, 2026-10-14). Lines marked **[MODEL]** are my own derivations, with their assumptions stated.

---

## 0. Executive summary (the numbers that matter)

1. **Every token is expensive.** In the BCI IV-2a paradigm one MI trial is cue at t = 2 s plus imagery to t = 6 s plus a break, so about 7–8 s per trial [3]. At the paper's SD mean accuracy, P = 0.777 [2], the Wolpaw ITR is **0.881 bit/selection**, which is **8.8 bit/min at 6 s/token** [4] [MODEL calc]. Users with ALS want **≥ 90 % accuracy** (this target satisfied 84 % of 61 respondents) and **standby false-exits no more than once every 2–4 h** [7]. SFE-GAT's mean (77.7 %) is below that target. Only A03 (89.2 %) comes close [2].
2. **Error correction roughly doubles the cost.** In a 4-token system where each error needs one corrective token, net progress per token is 2P − 1 **[MODEL]**. At P = 0.777 that is **1.81 tokens per intended token**. At P = 0.615 (A02 SD) it is 4.36, and at P = 0.521 (A02 SI) it is 24.
3. **The README canonical flow is 4 SELECT tokens**: Mode → Lights → Bedroom Ceiling Light → Turn On, assuming focus starts on item 1 everywhere. The expected cost is **≈ 7.2 tokens ≈ 43 s** at P = 0.777 and 6 s/token. **CONFIRM adds 1 nominal token (≈ +1.8 expected), about +25 % on this flow.** If the confirm dialog maps NEXT/PREV to "no-op, ask again", the expected confirm cost drops to **1.17 tokens**, with a false-cancel rate of **8.7 %** **[MODEL, uniform-confusion assumption]**.
4. **Combining the scores.** For the canonical (0.92, 0.89) the rules give: min = 0.89, mean = 0.905, product = **0.819**, geometric mean = 0.905, log-odds sum = 0.989. **Recommendation:** the product rule on *calibrated* probabilities, read as P(end-to-end correct action) under independence, with tier-specific thresholds. **Low tier: EXECUTE ≥ 0.75. Medium tier: EXECUTE ≥ 0.85, otherwise CONFIRM. REJECT if c < 0.50 or neural < 0.40. High tier → CAREGIVER.** The README canonical case still gives EXECUTE (0.819 ≥ 0.75).
5. **Thermal evidence.** WHO gives 18 °C as the general-population cold-season minimum [30], and WHO's 1987 report gave a **20 °C** minimum for "the elderly, the sick, disabled" [31]. WHO's heat chapter uses a 24 °C cut-off [30, UNVERIFIED-snippet]. CIBSE TM59 treats bedrooms above **26 °C** at night as overheating [33]. People with SCI above T6 can become hyperthermic or hypothermic at *mild* ambient temperatures [34][35]. **The README's 18/30 °C rule is permissive at both ends.** Keep it exactly as written (High → CAREGIVER), and add a configurable Medium "advisory band" (18–19 °C and 27–30 °C → CONFIRM plus a spoken advisory).
6. **`crypto.subtle` works on `file://` in Chromium. [LOCAL-TEST]** On this machine, Edge 155 headless gave `isSecureContext = true` and `origin = "file://"`, and `crypto.subtle.digest('SHA-256', 'abc')` returned the correct NIST vector `ba7816bf…15ad`. The W3C Secure Contexts spec says UAs "SHOULD" treat `file` as potentially trustworthy [25], and MDN lists `file://` as secure [26]. **Keep the FNV-1a fallback, but label it non-cryptographic in the UI.**
7. **Offline speech is the biggest runtime risk. [LOCAL-TEST]** In headless Edge, `getVoices()` returned **0 voices synchronously** and **321 voices after load, every one an "Online (Natural)" voice with `localService = false`**, even with DNS blocked. Windows has the local voices **David, Zira (SAPI desktop + OneCore) and Mark (OneCore)** installed (registry). Headless did not list them. The speech module must **prefer `localService === true`** voices, listen for `voiceschanged`, keep utterances short (the Chrome long-utterance cutoff is an open bug [22]), and never block the state machine waiting for speech.
8. **Focus rendering must not depend on DOM focus or `:focus-visible`.** Harness button clicks would steal DOM focus, and `:focus-visible` heuristics vary by input modality [20]. Render the patient focus from `SA.store` as a class/attribute. Expose it through `role="listbox"` + `aria-activedescendant` [17]. Use an outline ≥ 4 px, which is twice the 2 px minimum for SC 2.4.13 AAA [16], plus a static scale and a "● Focused" text marker (SC 1.4.1).
9. **20 px body text is *not* "large text"** under WCAG. Large text is ≥ 18 pt ≈ 24 px, or ≥ 14 pt ≈ 18.66 px bold [15]. Body text therefore needs ≥ 4.5:1 (AA), and I recommend ≥ 7:1. 28 px titles count as large (≥ 3:1 AA).
10. **A hash chain is only tamper-*evident* against someone who cannot recompute it.** In a browser anyone can recompute it. Anchor the head hash (display it, export it, or optionally HMAC it with a caregiver PIN). Serialize the async digests. Use canonical JSON (RFC 8785-style key ordering [42]). Treat rollback as a **compensating action appended to the log** (Sagas [43]). Never delete or rewrite entries.

---

## 1. BCI interaction economics

### 1.1 What one token costs in time

| Source | Timing | Notes |
|---|---|---|
| BCI IV-2a paradigm [3] | Fixation + beep at t = 0; cue (arrow, 1.25 s) at t = 2 s; MI "until the fixation cross disappeared … at t = 6 s"; then "a short break" | 6 runs × 48 trials = 288 trials per session. The break length is not stated in the description PDF. Paper Fig. 2b axis runs to 8 s [2]. |
| SFE-GAT decoding window [2] | t = 2–6 s (4 s of EEG) | Inference latency **0.066 ms/sample** [2], which is negligible next to the 4 s window. |
| Li et al. 2021 (2-class MI, online) [9] | 2 s pre-feedback, 3–6 s feedback, 0.5 s post, 3.5 s ITI → **≈ 9–12 s/trial**; 400 trials ≈ 65 min | Healthy subjects only, n = 12. |

**Working assumption for the token budget:** T_token ≈ **6 s** (a self-paced 4 s window plus about 2 s of cue and feedback). Each *actuation* adds an **ErrP observation window of about 1 s**, since ErrP components fall roughly 200–500 ms after feedback (PROMPT §B; review in [47]; exact latencies are the ErrP Scientist's brief). In the POC, tokens come from the keyboard or harness, so these times only matter for the token-cost analysis and the demo narrative. **[MODEL]**

### 1.2 Information transfer rate (Wolpaw definition)

B = log2 N + P log2 P + (1 − P) log2[(1 − P)/(N − 1)] bits per selection. Divide by trial duration for bits/min. Equation (1) in McFarland, Sarnacki & Wolpaw 2003 [4]. The same study found that **4 targets maximised bit rate for 6 of 8 users** [4], which supports a 4-token vocabulary.

| Accuracy case (N = 4) | P | bits/selection | bits/min @ 4 s | @ 6 s | @ 7.5 s |
|---|---|---|---|---|---|
| SFE-GAT SD mean, Table 3 [2] | 0.7770 | 0.881 | 13.2 | 8.8 | 7.0 |
| SFE-GAT SD, body text [2] | 0.7705 | 0.859 | 12.9 | 8.6 | 6.9 |
| SFE-GAT SI mean [2] | 0.6659 | 0.551 | 8.3 | 5.5 | 4.4 |
| A02 SD (worst) [2] | 0.6146 | 0.427 | 6.4 | 4.3 | 3.4 |
| A02 SI (worst) [2] | 0.5208 | 0.242 | 3.6 | 2.4 | 1.9 |
| A03 SD (best) [2] | 0.8924 | 1.337 | 20.1 | 13.4 | 10.7 |
| ALS-user target [7] | 0.90 | 1.373 | 20.6 | 13.7 | 11.0 |

(Computed with Python's stdlib. The paper reports accuracies, not ITR.) Wolpaw ITR assumes errors are uniform across classes and that every selection takes the same time. Both assumptions are optimistic for IV-2a, where feet/tongue confusions are thought to dominate **[UNVERIFIED — check against our replication's confusion matrix]**.

### 1.3 The cost of correcting errors

**[MODEL]** Assume each mis-decoded token creates exactly one extra required token: a wrong NEXT needs a PREV, a wrong SELECT needs a BACK or a rollback, and a wrong BACK needs a re-SELECT. Then the expected net progress per token is P − (1 − P) = **2P − 1**, and a k-token task costs **k / (2P − 1)** tokens on average. This is the same intuition as Dal Seno et al.'s *Utility* metric for interfaces with an undo [6]. **[UNVERIFIED that [6] uses exactly this closed form; I could not access the primary text.]** Two things break the model: errors on SELECT can cause *actuations*, which are handled by ErrP rollback and not by a token, and a BACK on Screen 1 is a no-op.

| P | tokens per net step | canonical 4-token flow | with CONFIRM (5) | time @ 6 s (4 / 5) |
|---|---|---|---|---|
| 0.777 | 1.81 | 7.2 | 9.0 | 43 s / 54 s |
| 0.666 | 3.01 | 12.1 | 15.1 | 72 s / 90 s |
| 0.615 | 4.36 | 17.5 | 21.8 | 105 s / 131 s |
| 0.892 | 1.27 | 5.1 | 6.4 | 31 s / 38 s |
| 0.521 | 24.0 | 96 | 120 | ≈ 10–12 min |

**Implication:** the POC must not hide how fragile the system is at A02-level accuracy. The Replay mode should be able to show a mis-decode (prediction vs. truth is already required). The "Live Demo Script" should name the subject used and its accuracy.

### 1.4 What users actually want

- **ALS survey** (n = 61, Huggins, Wren & Gruis 2011) [7]: accuracy **≥ 90 %** satisfied 84 % of respondents. Speed **15–19 letters/min** satisfied 72 %. Accidental exits from standby **≤ once every 2–4 h** satisfied 84 %. "Communicate" and "use the bathroom" independently scored highest. Environmental control was **not** reported as a top respondent priority [7].
- **BCI inefficiency.** An estimated **15–30 %** of users cannot control SMR/MI BCIs [8], consistent with A02 in the paper [2].
- **Patients can still benefit.** In a user-centred study, 3 of 4 severely motor-impaired patients reached significant MI or attempted-movement BCI control within 6 sessions. For the most affected patient, the BCI beat their best existing assistive technology on accuracy, reaction time and ITR [10].
- **Home use depends on caregivers.** In Sellers et al. 2010, caregivers learned to place the cap, apply gel and start the BCI in **4–5 one-hour practice sessions**. Recalibration was done **remotely**, and accuracy held at **83 % for > 2.5 years** (P300, ALS) [11]. Long-term independent home use was also shown by Holz et al. 2015 (locked-in, P300 "Brain Painting") [12].

### 1.5 MI fatigue

- Li et al. 2021 [9] (12 healthy subjects, 400 MI trials, ≈ 65 min): subjective general and mental fatigue and distress **rose**, and engagement **fell**. Alpha ERD modulation **decreased** within the session. Online performance (PVC 77.1 ± 4.6 %, ITR 0.251 bit/trial) showed **no significant change**. The authors caution that their adaptive normaliser may have masked drift [9].
- **Design implications [MODEL]:** (a) minimise the token count per goal (wrap-around, sensible default focus, presets); (b) never auto-advance focus on a timer; (c) do not impose short response deadlines (see WCAG 2.2.1 [15]); (d) show and speak the position ("2 of 5") so the user does not spend tokens just to orient. Fatigue in ALS patients has not been characterised here **[UNVERIFIED for this population]**.

### 1.6 Scanning vs. direct selection; menu depth vs. breadth

- The 4-token scheme is **user-stepped ("directed") scanning**. NEXT/PREV move a cursor and SELECT commits. It is not automatic scanning, which advances on a timer and needs only one switch. The AAC literature generally finds direct selection faster and lower in cognitive load than scanning, and recommends it where possible (PubMed 16533077 [14]). In a 2010 preschool study, directed scanning was more accurate but slower than group-item scanning [14b]. Since a 4-class MI user cannot point directly, directed scanning is the right choice, and auto-scanning should be rejected. Auto-scanning would turn every second into an opportunity for an unintended SELECT, the "standby false exit" problem in [7].
- **Wrap-around matters most on the 5-card hub.** Without wrap, the mean NEXT/PREV cost to reach an item from item 1 is (0+1+2+3+4)/5 = **2.0 tokens**. With wrap it is (0+1+2+2+1)/5 = **1.2 tokens**, and Presets drops from 4 tokens to 1 (PREV). **[MODEL]** Wrap-around must be announced ("wrapped to Lights, 1 of 5") so the user does not get lost.
- **Depth.** The README fixes four levels: Mode → Hub → Fixtures → Actions. Each extra level costs at least one SELECT, which is about 1.8 expected tokens at P = 0.777. Flattening the levels would break README conformance. The cheaper lever is **default focus** (§2.3).

### 1.7 Dwell, refractory periods and debouncing

- In asynchronous (self-paced) MI, a "brain switch" gates commands to cut false positives [13]. One quasi-movement study used 4 consecutive positive 1.5 s windows followed by a **3 s refractory period**, and got about 0.03–0.04 false alarms/s [49, secondary; UNVERIFIED details]. The POC is effectively **synchronous**: one decode window per token. A dwell rule is therefore not needed, but the following are:
  1. **A post-actuation lockout** that equals the ErrP observation window. Tokens arriving during it are queued or ignored, so that the user's reaction to feedback is not mixed up with a new command. The exact window comes from the ErrP brief.
  2. **Keyboard debouncing:** ignore `keydown` with `event.repeat === true`, and enforce a minimum inter-token interval (`SA.config.input.minInterTokenMs`, suggested 250 ms in keyboard mode). A held key must never flood the bus.
  3. Call **`preventDefault()` on Space, the arrow keys and Backspace** (PROMPT §D). Chrome stopped Backspace-to-navigate in Chrome 52 [48], but the prevention is still needed for Space and arrow scrolling and for other browsers.
- **Standby mode** (Huggins' "accidental exit from standby" [7]) is not in the README. That gap is listed under Open questions.

---

## 2. Token-cost analysis of the README flows

Assumptions: the cursor starts on the first item of each screen, Screen 1 cards are [Visual, Audio], the Hub has 5 cards in README order, wrap-around is on, and Fixtures and Actions follow README order.

### 2.1 Canonical flow: "Turn On Bedroom Ceiling Light" (README §3)

| # | Screen | Token | Count | Notes |
|---|---|---|---|---|
| 1 | S1 Mode Selection (focus: Visual Navigation) | Both Feet = SELECT | 1 | |
| 2 | S2 Hub (focus: Lights) | SELECT | 1 | |
| 3 | S3 Lights (focus: Bedroom Ceiling Light) | SELECT | 1 | |
| 4 | S4 Actions (focus: Turn On) | SELECT | 1 | The policy runs here: (0.92, 0.89, Low) → **EXECUTE** |
| 5 | S5 Result + "Observing post-action EEG..." | — | 0 | ErrP window ≈ 1 s; [No ErrP] is operator-only |
| | **Total** | | **4 nominal** | **≈ 7.2 expected tokens @ P = 0.777 ≈ 43 s + 1 s ErrP** |

**Correction path** (README S5): `[Simulate ErrP]` triggers an automatic rollback (0 tokens), then the **Bedside Lamp** alternative with [Retry] focused → SELECT (1) → policy → EXECUTE → ErrP window. **Total 5 nominal.** If [Return to Home] is used instead, it costs NEXT + SELECT = 2 nominal. Mapping BACK to "Return to Home" would make it 1 token (debate item D7).

**Design tension to resolve:** on S4 the user has *already* picked the fixture explicitly on S3. So what is CogLign "resolving"? There are two defensible readings. (a) The KG validates the explicit choice and supplies the context score: it checks that the device is in the active room, that the state is compatible, and the ErrP history. (b) The KG resolves an under-specified intent such as "Turn On Light" and chooses or **pre-focuses** the fixture. Reading (b) lets the KG save tokens by putting the default focus on the KG's top candidate. That changes no README label or order, and saves NEXT tokens whenever the top candidate is not first in the list. **Recommendation: (a) for the policy score, plus (b) as smart default focus**, with focus speech such as "Bedroom Ceiling Light, suggested, 1 of 3". Debate item D6.

### 2.2 Cost of CONFIRM

| Confirm design | Expected tokens to resolve | P(resolve = confirm, given user wants confirm) | Notes |
|---|---|---|---|
| A. Generic dialog [Confirm][Cancel] with NEXT/PREV moving focus | ≈ 1/(2P−1) = **1.81** @ 0.777 | — | An erroneous NEXT moves focus onto Cancel, and the next SELECT cancels. Bad. |
| B. **SELECT = confirm, BACK = cancel, NEXT/PREV = no-op + re-prompt** | 1/(P + (1−P)/3) = **1.17** @ 0.777; 1.35 @ 0.615 | 0.913 @ 0.777 | False-cancel 8.7 %. A false *confirm* happens only when the user intends Tongue and the decoder outputs Feet: (1−P)/3 = **7.4 %** under uniform confusion. **[MODEL]** Feet↔tongue confusion may be higher in IV-2a **[UNVERIFIED]**. |
| C. B plus the confirm token's own neural confidence ≥ θ_c (e.g. 0.6) | slightly > 1.17 | higher | A low-confidence confirm re-prompts instead of executing. |

**Recommendation: B, plus the gate from C.** CONFIRM costs about **+1.17 tokens (≈ 7 s)**, roughly +16 % on the canonical flow. Design A would cost about +25 %. The confirm screen must show and speak the **diff** ("Bedroom Ceiling Light: OFF → ON. Both Feet to confirm, Tongue to cancel") and the reason ("medium confidence, 0.66").

### 2.3 Other README flows (nominal tokens, wrap on)

| Flow | Tokens (nominal) | Comment |
|---|---|---|
| Hub → AC → Temp − from 24 °C to 17 °C | NEXT×2, SELECT, NEXT×k to reach "Temp −", then SELECT×7 | **≈ 12–13 nominal, ≈ 22 expected.** Each press is a separate actuation with its own policy check and ErrP window. **Recommendation:** after a Temp ± press, focus stays on that control (a stepper), so repeated SELECTs continue. The press to 17 °C triggers CAREGIVER (README thermal rule). |
| Hub → Presets → "Watch TV" → diff preview → commit | PREV(wrap), SELECT, NEXT×3, SELECT, SELECT | The diff preview is an *inherent* confirm, so the policy should not demand a second CONFIRM on top of it unless the risk tier requires it. |
| Adjust Brightness 25/50/75/100 | +1 level: NEXT×k, SELECT | Default focus on the brightness nearest the current value. |
| Caregiver Approve/Reject | 0 patient tokens | The patient only waits. BACK while pending = **withdraw request** (§5). |

---

## 3. Accessibility specification (WCAG 2.2 mapping)

| SC (level) | Normative core [15] | SilentAssist implementation | Test |
|---|---|---|---|
| 1.4.3 Contrast (Min) (AA) | 4.5:1 for text; 3:1 for large text, where **large = ≥ 18 pt (24 px) or ≥ 14 pt (≈ 18.66 px) bold** | Patient body ≥ 20 px is **not large**, so ≥ 4.5:1 is required. **Target ≥ 7:1** (1.4.6 AAA) on the dark theme. Titles ≥ 28 px: ≥ 3:1 required, target 4.5:1. | Self-test computes contrast from `tokens.css` values with the WCAG luminance formula (L1 + 0.05)/(L2 + 0.05) [15]. |
| 1.4.11 Non-text Contrast (AA) | ≥ 3:1 against adjacent colours for UI components and graphics | Card borders, focus ring, gauge arcs and the brain-graph edges used for meaning: ≥ 3:1 | As above |
| 1.4.1 Use of Color (A) | Colour is not the only means | Focus = outline + scale + **"● Focused"** text. Policy decision = text label + icon, not colour alone. | Visual check plus screenshots |
| 2.4.7 Focus Visible (AA) | A visible focus indicator exists | The logical patient focus is always rendered | Self-test: exactly one `.is-focused` per active listbox |
| 2.4.11 Focus Not Obscured (Min) (AA) | The focused component is "not entirely hidden" by author content | The scaled card must not slip under a sticky header or the harness panel. Use `scroll-margin` and `scrollIntoView({block:'nearest'})`. | Screenshots at 1366×768 and 150 % zoom |
| 2.4.13 Focus Appearance (AAA) | Indicator area ≥ a 2 CSS px perimeter **and** ≥ 3:1 change between focused and unfocused pixels [16] | **Outline 4–6 px solid, offset 3–4 px**, ≥ 3:1 against both the card and the page background. An inset outline would need to be thicker [16]. | Contrast check of the ring colour |
| 2.3.1 Three Flashes (A) | Nothing flashes > 3 times per second | Radar sweep and ErrP "alert" must not strobe | Code review of the animation period |
| 2.3.3 Animation from Interactions (AAA) | Motion triggered by interaction can be disabled | `prefers-reduced-motion` **and** the harness toggle both set `data-reduced-motion` on `<html>`. With it set: no transitions, card scale applied without animating, brain graph evo0→3 shown as discrete steps, radar static [19] | Self-test toggles the attribute and asserts computed `transition-duration` is 0 |
| 2.2.1 Timing Adjustable (A) | Content-set time limits can be turned off, adjusted or extended | Any CONFIRM or caregiver-wait timeout lives in `SA.config` and can be disabled. Default: **no patient-facing deadline**; a timeout means auto-cancel, never auto-execute. | Config test |
| 3.3.4 / 3.3.6 Error Prevention | Submissions are reversible, checked, or confirmed | Analogue: actions are **reversible** (rollback), **checked** (KG/policy) and **confirmed** (CONFIRM or caregiver) | — |
| 4.1.3 Status Messages (AA) | Status messages are programmatically determinable without focus | `role="status"` live region mirrors speech; `role="alert"` for safety events | DOM check |
| 2.5.8 Target Size (Min) (AA) | Pointer targets ≥ 24×24 CSS px | Harness and caregiver mouse controls ≥ 24 px (patient cards are far larger) | CSS check |

**Focus treatment.** Render patient focus from `SA.store.ui.focusIndex` as `.is-focused` plus `aria-selected="true"`. **Do not rely on `:focus` or `:focus-visible`.** MDN describes `:focus-visible` as heuristic and dependent on modality [20], and clicking an operator-harness button moves DOM focus away from the cards. Harness buttons should use `mousedown → preventDefault()` so they do not steal focus from the listbox. Use a static `transform: scale(1.04)`, which is allowed under reduced motion because it is a state and not an animation. Scaling large objects *in motion* is a vestibular trigger [19].

**ARIA pattern** [17]. Each screen's card group is `role="listbox"` with `aria-label` (e.g. "Home categories") and `aria-orientation="horizontal"` for card rows (the default is vertical [17]). Each card is `role="option"` with `id`. The listbox holds DOM focus and uses `aria-activedescendant` to point at the focused option. **Selection follows focus** (`aria-selected` = focused), and SELECT means "activate". Caveats: the APG says listboxes should not contain interactive descendants, and that selection-follows-focus "can severely degrade accessibility in others" [17]. Cards must therefore contain no nested buttons. `aria-posinset`/`aria-setsize` are optional, because all options are in the DOM [17]. A purist might argue that `menu`/`menuitem` fits "options that perform actions" better. PROMPT mandates listbox/option, so record this as residual dissent in the ADR.

**Live regions** [18]. Two regions go in the **initial markup**, empty at load: `#sa-status` (`role="status"`, `aria-live="polite"`, `aria-atomic="true"`) mirrors every spoken focus or status string, and `#sa-alert` (`role="alert"`) is for REJECT, ErrP rollback and caregiver decisions only. Do not add `aria-live="assertive"` to `role="alert"`, because it double-speaks on VoiceOver iOS [18]. Use assertive sparingly [18]. If a screen reader *and* Web Speech are both active, the user hears everything twice. Document that the voice toggle exists for screen-reader users.

---

## 4. Web Speech API behaviour and recommended speech module

**Spec facts** [21]: `speak()` **appends** to a global queue. `cancel()` **removes all utterances** and stops the current one immediately. Utterances that were removed fire `error` with `canceled`, and the utterance being spoken fires `interrupted`. `getVoices()` may return an **empty list** until voices load, and `voiceschanged` fires when the list changes. `localService` is true for voices from a local synthesiser. `default` is true for at most one voice per language.

**Measured here [LOCAL-TEST], Edge 155 headless, `file://` page:**
- `getVoices()` returned **0** synchronously and **321 after about 1.5 s**. **All 321 were `"Microsoft … Online (Natural)"`, `localService = false`**, including with `--host-resolver-rules="MAP * ~NOTFOUND"` (offline simulation). In headless mode, **the voice list does not reveal that the voices are unusable offline.**
- With `--headless=old`, `getVoices()` returned **0** voices.
- Installed Windows voices (registry): `Microsoft David Desktop`, `Microsoft Zira Desktop` (SAPI 5), `Microsoft David`, `Microsoft Mark`, `Microsoft Zira` (OneCore). Headless did not list them. **Whether headed Edge or Chrome lists them with `localService = true` is [UNVERIFIED]**, and it needs a 30-second manual check by the user (Open questions).
- Edge's online voices have a history of breaking. Edge 150 returned "Microsoft undefined Online (Natural)" names until it was patched [23].

**Known Chromium issue:** long utterances stop after about 15 s, and pausing for more than 15 s kills audio (Chromium issue 679437, still open as of Nov 2025 [22]).

**Recommended `SA.voice.speech` contract [MODEL]:**
1. **Voice choice:** prefer `localService === true` with `lang` starting `en`. Otherwise use the `default` voice. Otherwise go **text-only**, and show a visible "Voice unavailable offline" pill. Re-run the choice on `voiceschanged`. Never prefer "Online (Natural)" voices while offline-first.
2. **Two priorities.** *Navigation* utterances such as "Fans, 2 of 5" run `cancel()` then `speak()`, so the newest wins and stale focus speech never queues up. *Safety* utterances (rollback, REJECT, caregiver decision, thermal warning) are **queued and protected**: navigation speech may not cancel them, and they are also posted to `#sa-alert`.
3. **Short utterances.** Keep each under about 120–160 characters, and split at sentence boundaries to avoid the 15 s bug [22].
4. **Separate speech text from display text.** "FCz" → "F C z"; "−8.4 µV" → "minus 8 point 4 microvolts"; "24°C" → "24 degrees Celsius"; "➔" → "to".
5. **Never block on speech.** State transitions must not wait for `onend`. Treat `canceled` and `interrupted` errors as normal.
6. **The self-test must not depend on speech.** Headless can return 0 voices with `--headless=old`. Assert on `#sa-status` text instead.

---

## 5. Caregiver workflow and remote approval

Evidence base: caregivers are the people who make home BCI use possible. They do setup, troubleshooting and logging, and recalibration can be done remotely [11][12]. The README asks for a live shadow table, gauges, a **High-Risk Action Approval Queue** with [Approve]/[Reject], and a tamper-evident log.

**Approval state machine (recommended):**

```
REQUESTED --(caregiver Approve)--> APPROVED --> EXECUTING --> OBSERVING(ErrP) --> DONE | ROLLED_BACK
    |--(caregiver Reject)--> REJECTED_BY_CAREGIVER   (spoken to patient + #sa-alert)
    |--(patient Tongue/BACK)--> WITHDRAWN            (patient keeps veto)
    |--(timeout, config, default 5 min)--> EXPIRED   (never auto-approve)
```

- The request card shows the caregiver the **decoded intent, the neural and semantic confidences, the current and target state, the hazard rule that fired** ("setpoint 17 °C < 18 °C minimum"), and the time since the request.
- The patient sees and hears "Waiting for caregiver approval. Tongue to withdraw." The patient can keep navigating elsewhere, or the UI stays modal (debate D8).
- Every transition is an audit entry with `actor: patient | caregiver | system`.
- **The POC has no authentication.** The "caregiver" is whoever toggles the dashboard (`C` key). It must be labelled as simulated. Real remote approval would need authenticated transport, which is out of scope and against CLAUDE.md §1 (local only).
- **ErrP after a caregiver-approved action:** the patient's brain still reacts to the outcome. Recommendation: still observe, but on ErrP **do not auto-roll back a caregiver-approved high-risk action**. Instead raise a "patient may disagree" alert to the caregiver, because two humans already agreed on it. Debate D9.

**"ErrP health" gauge (suggested definition):** a rolling rate of detected ErrPs per actuation over the last N actions, plus the detector's posterior on the last epoch. A rising rate is a cue for the caregiver to suggest rest or recalibration. That is a fatigue proxy, **not** a clinical measure [9][47].

---

## 6. Policy engine: confidence-gated actuation

### 6.1 Inputs

- **n**: neural confidence, the softmax max of SFE-GAT. **This must be calibrated** (temperature scaling [46]) on a **validation split carved from session 1**, never session 2 (CLAUDE.md §6). Modern networks with BatchNorm and weight decay tend to be miscalibrated [46], and SFE-GAT uses both [2]. In Scripted mode n is the slider value (README: 92 %).
- **s**: semantic confidence (README "Semantic Context 89 %"). **Note: the README shows two numbers**: SPARQL Match 0.94 (the resolver's raw score for the winner) and Semantic Context 0.89. Recommended reading: **s = the resolver's normalised posterior for the winner**, e.g. a softmax or ratio over candidate scores, so 0.94 vs. Bedside Lamp's score maps to 0.89. The KG debate must make that mapping produce exactly 0.89, or keep 0.89 as a separate, documented factor.
- **r**: risk tier ∈ {Low, Medium, High} from `SA.policy.risk` (§7).
- **h**: ErrP history flag. True if this entity in this context drew an ErrP within the last `SA.config.policy.errpMemoryMs`.

### 6.2 How to combine the scores (canonical n = 0.92, s = 0.89)

| Rule | Formula | Canonical | Pros | Cons |
|---|---|---|---|---|
| **Min** (weakest link) | min(n, s) | 0.890 | No independence assumption. Conservative. Easy to explain. Kittler's framework covers it [44]. | Ignores the stronger signal. Two mediocre scores (0.80, 0.80) look as good as (0.80, 0.99). Not a probability of anything. |
| **Weighted mean** | w·n + (1−w)·s | 0.905 (w = .5); 0.908 (w = .6) | Smooth. Kittler et al. found the sum rule the most robust to estimation error [44]. | **Compensatory:** (0.99, 0.40) → 0.695, so a garbage semantic score can be outvoted. Needs floors. The weights are arbitrary. |
| **Product** (independence) | n·s | **0.819** | Interpretable as P(intent correct ∧ entity correct), the probability the *action* is right, if both are calibrated and conditionally independent. Penalises a weakness in either score. | Over-penalises if errors are positively correlated. Thresholds must sit lower (0.75, not 0.85). |
| Geometric mean | √(n·s) | 0.905 | Scale like a mean, non-compensatory like a product | Not a probability. Arbitrary. |
| **Bayesian log-odds sum** | σ(logit n + logit s − logit prior) | 0.989 (prior 0.5) | Principled when the two are independent evidence about the *same* hypothesis | Here n and s address *different* hypotheses (which token, which entity). Double-counts correlated evidence, so it is overconfident. **Not recommended.** |

**Recommendation: product**, with a neural floor. It is the only rule whose output means something the caregiver can read ("estimated 82 % chance this action is what you meant"). It also maps directly onto the cost model below. **Runner-up: min**, if the debate decides calibration cannot be trusted.

### 6.3 Thresholds from a cost model (Chow's reject option [45])

Chow's optimal rule rejects when the top posterior falls below a threshold set by the ratio of reject cost to error cost [45]. **[MODEL]** applied to EXECUTE vs. CONFIRM: EXECUTE is cheaper when (1 − c)·C_err < C_confirm, i.e. **c > 1 − C_confirm / C_err**.

| Tier | C_err (tokens-equivalent, assumed) | C_confirm | Implied EXECUTE threshold |
|---|---|---|---|
| Low (wrong light; ErrP may auto-roll back; re-navigate ≈ 3–5 tokens) | 5 | 1.17 | **0.77** |
| Medium (AC mode or setpoint inside the safe band; discomfort + correction ≈ 10) | 10 | 1.17 | **0.88** |
| High (thermal hazard; harm is possible) | ≫ 10 | — | Always a human in the loop → CAREGIVER |

CONFIRM vs. REJECT: showing a proposal is worth a token only when the proposal is more likely right than wrong. Below **c ≈ 0.5**, REJECT ("not sure, please try again") is cheaper and safer **[MODEL]**.

### 6.4 Recommended policy (all values in `SA.config.policy`)

```
c = n * s
if n < 0.40 or c < 0.50            -> REJECT            (re-try token; spoken "Not sure, please try again")
else if tier == High               -> CAREGIVER APPROVAL
else if tier == Medium             -> EXECUTE if c >= 0.85 else CONFIRM
else /* Low */                     -> EXECUTE if c >= 0.75 else CONFIRM
if h (recent ErrP on this entity) and decision == EXECUTE -> CONFIRM   (escalate one step)
if decision == CONFIRM and confirm-token n_c < 0.60 -> re-prompt (no execute)
```

**Slider test vectors (Scripted mode) for the acceptance checklist:**

| n | s | c | Tier | Expected |
|---|---|---|---|---|
| 0.92 | 0.89 | 0.819 | Low | **EXECUTE** (README canonical; margin 0.069) |
| 0.80 | 0.80 | 0.640 | Low | **CONFIRM** |
| 0.60 | 0.70 | 0.420 | Low | **REJECT** |
| 0.35 | 0.99 | 0.347 | Low | **REJECT** (neural floor) |
| 0.92 | 0.89 | 0.819 | Medium | CONFIRM |
| 0.92 | 0.89 | 0.819 | High (AC → 17 °C) | **CAREGIVER APPROVAL** |

**Reasoning trace (visible, README S4):** `n=0.92 × s=0.89 = 0.819 ≥ 0.75 (Low tier) → EXECUTE`, plus the risk rule that fired and the ErrP-history flag. Speak a short form only.

**Near-threshold behaviour:** show the margin. Hysteresis is not needed, because each decision is a one-shot evaluation per token.

---

## 7. Risk tiers and the thermal rule

### 7.1 Evidence on safe indoor temperatures

| Source | Finding |
|---|---|
| WHO Housing & Health Guidelines 2018 [30] | **Strong** recommendation: indoor temperatures high enough to protect from cold. **18 °C** is proposed as "safe and well-balanced" for *general populations* in temperate or colder climates during cold seasons. The heat recommendation is **conditional** (heat-protection strategies). The heat chapter used a **24 °C** categorical cut-off, following an earlier WHO group's finding of no demonstrable risk for healthy sedentary people at 18–24 °C. **[UNVERIFIED-snippet: NCBI Bookshelf was behind reCAPTCHA; text taken from search extracts of NBK535294 / ch5]** |
| WHO history, via the Scottish Government fuel-poverty review [31] | 1984: 18–24 °C for non-vulnerable households. **1987: minimum 20 °C (range 20–24 °C) for vulnerable groups: "the elderly, the sick, disabled, and preschool children."** Retained in 2007. WHO panels suggested vulnerable people live about 2 °C warmer. |
| UKHSA (PHE) 2014 [32] | Heat homes to **at least 18 °C**, with "scope for flexibility". People who are "less active due to mobility problems" or ill may need higher temperatures. |
| CIBSE TM59:2017, via UK planning reports [33] | Bedroom overheating: operative temperature **> 26 °C for > 1 % of annual hours between 22:00 and 07:00** fails (≈ 32 h/yr). **[secondary source]** |
| SCI thermoregulation [34][35] | Lesions above T6 impair sweating and vasomotor control. People with high-level SCI are vulnerable to **both hyper- and hypothermia "even during exposure to relatively mild ambient temperatures"** [34]. The imbalance is more marked in heat [35]. A tetraplegia heat protocol used **27 °C as thermoneutral baseline vs 35 °C heat** [36]. A cool-exposure study used about 18 °C (64 °F) [36b]. A narrow optimum of 23–25 °C for cervical SCI is reported in a secondary review **[UNVERIFIED]**. |

**Synthesis [MODEL]:** for an immobile user with impaired thermoregulation, the evidence-backed comfortable/safe *room* band is about **20–26 °C**. The README hazard rule (setpoint < 18 °C or > 30 °C → High) catches only the extremes. Two more nuances. (1) **The setpoint is not the room temperature.** A 30 °C setpoint in Cool mode means "don't cool until 30 °C", which in a hot climate leaves the room hot. (2) **AC Power OFF** during hot weather may be as hazardous as a high setpoint, and the POC has no outdoor-temperature model.

### 7.2 Tier assignment (proposal for debate #5)

| Device / action | Tier | Rationale (hazard → harm) |
|---|---|---|
| Lights On/Off/Brightness | **Low** ("Autonomic", README) | Wrong light means annoyance or glare. Darkness could cause a caregiver fall; residual risk is low. |
| Fan Off/Low/Medium/High | **Low** | Comfort only. |
| TV Power / Channel ± | **Low** | Comfort only. |
| TV Volume + (above a configured cap, e.g. 80 %) | Medium | Startle or noise; disturbs others. |
| AC Power on/off; Mode Cool/Fan/Dry | **Medium** | Thermal comfort; slow onset; reversible. |
| AC setpoint in [18, 19] or [27, 30] °C | **Medium + spoken advisory** (proposed config band) | Outside the 20–26 °C evidence band for vulnerable users [31][33][34]. |
| AC setpoint < 18 °C or > 30 °C | **High → CAREGIVER** (README rule, unchanged) | Hypothermia or hyperthermia risk for impaired thermoregulation [34][35]. |
| Presets | **max(tier of each constituent action)** | Cooling Mode / Night Mode include AC, so their tier follows the setpoint. A preset is atomic (§8.3). |
| Rollback (compensating action) | Inherits from the target state; **bypasses the policy** if the target is within bounds | If a compensation would *enter* a hazardous state, escalate to CAREGIVER instead (an edge case; it should not occur if the hazard rules held at actuation time). |

---

## 8. Audit log, secure context, rollback

### 8.1 Is `crypto.subtle` usable on `file://`?

- **Spec:** "Is origin potentially trustworthy?" step 6: *"If origin's scheme is "file", return "Potentially Trustworthy"."* UAs "SHOULD treat file URLs as potentially trustworthy" and "MAY" be stricter [25]. MDN's table lists `file:///…` as ✅ secure [26]. `SubtleCrypto` is secure-context-only [27]. Chromium has listed `file://` as a secure origin for WebCrypto since the 2014 restriction CL [28].
- **[LOCAL-TEST]** On Edge 155 (Chromium 155) headless, a `file:///C:/…/t.html` page gave `isSecureContext=true`, `location.origin="file://"`, `!!crypto.subtle=true`, and `SHA-256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`, which matches the FIPS 180-2 test vector.
- **Still keep the fallback:** a future UA or enterprise policy could be stricter (spec "MAY" [25]). Check `window.isSecureContext && crypto && crypto.subtle` at startup. If FNV-1a is used, the badge must say **"Chain verified ✓ (FNV-1a — integrity only, not tamper-proof)"**. FNV-1a is not collision-resistant.

### 8.2 Hash-chained log design

```
entry = { seq, ts, actor, type, payload, prevHash }
hash  = SHA-256( canonicalJSON(entry) )      // keys sorted, no whitespace (RFC 8785-style [42])
genesis.prevHash = "0" * 64
verify(): recompute every hash in order; first mismatch -> "Chain broken at #k"
```

- **Serialize appends.** `digest()` is async, so two events in the same tick could interleave. Use a single promise queue in `SA.safety.audit`.
- **Canonicalize.** `JSON.stringify` key order follows insertion order, so sort keys explicitly. Format numbers deterministically (e.g. fixed decimals for µV).
- **Threat-model honesty.** Schneier & Kelsey's scheme gets forward integrity from *evolving secret keys* (MACs) [39]. Crosby & Wallach use Merkle trees with external auditors [40]. Plain hash chains are vulnerable to **truncation** and **full recomputation** by whoever controls the log [41]. In a single browser page, an attacker who edits entry k can recompute k…N. The tamper demo therefore proves only **"an edit without re-chaining is detected"**. Mitigations, cheapest first: (a) show the **head hash** and its sequence number on the dashboard (an "anchor" the caregiver can note); (b) **optional HMAC-SHA-256** keyed by a caregiver PIN via `crypto.subtle.importKey`/`sign`; (c) export the log as a JS/JSON file. **No network anchoring** (CLAUDE.md §1).
- **Entry types:** `TOKEN`, `DECISION` (with full trace), `ACTUATE`, `ERRP_OBS` (posterior, label), `ROLLBACK` (references the original seq), `APPROVAL_*`, `CONFIG_CHANGE`, `RESET`. `[Reset Demo]` should **append** a `RESET` entry, or start a new chain with the previous head recorded. It should never silently wipe the log.

### 8.3 Atomic rollback as compensating actions (Sagas [43])

- Each actuation records `before` and `after` state for every device it touches. A **preset is one saga** over N device steps. If any step fails, or an ErrP is detected, the completed steps are compensated **in reverse order**.
- **Compare-before-compensate:** restore device d only if `current(d) == after(d)`. If something else (the caregiver, another action) changed d in the meantime, flag a conflict and do not overwrite it.
- Compensations are **idempotent** and **appended** to the audit log (`ROLLBACK` refs seq). The forward entry is never removed.
- **Rollback window = ErrP observation window.** After DONE, undo is a new, explicit user action (e.g. a preset or Turn Off) and goes through the policy.
- **False rollbacks** (ErrP false positives) undo correct actions, and missed ErrPs leave wrong ones in place. The **threshold comes from the ErrP cost model** (ErrP brief), not 0.5. From the UX side: C(false rollback) ≈ re-issuing the action, about 4–7 tokens in the canonical flow. C(missed error) ≈ a manual undo plus re-navigation, about 4–8 tokens, plus a thermal harm term for AC. These figures feed the ErrP debate **[MODEL]**.

---

## 9. Hazard analysis in ISO 14971 vocabulary (no compliance claimed)

Definitions (ISO 14971:2019, as presented by FDA [37]): **harm** = injury or damage to the health of people, or damage to property or the environment. **Hazard** = potential source of harm. **Hazardous situation** = circumstance in which people, property or the environment are exposed to one or more hazards. **Risk control** = the process of deciding on and implementing measures that reduce risks or keep them within specified levels. Risk-control options are usually ranked **inherent safety by design > protective measures > information for safety** [37b, secondary; check against clause 7.1/Annex A].

| ID | Hazard / sequence of events | Hazardous situation → harm | Risk controls (type) |
|---|---|---|---|
| H1 | Mis-decoded MI token → wrong device actuated | Unwanted device state → annoyance; for AC, thermal discomfort | Policy gating (protective); CONFIRM; ErrP rollback (protective); spoken feedback (information) |
| H2 | Token(s) drive AC setpoint below 18 °C or above 30 °C | Immobile user at an unsafe temperature → hypo/hyperthermia [34][35] | **Hard bounds + CAREGIVER** (inherent and protective); advisory band; spoken warning |
| H3 | ErrP false positive → a correct action is rolled back | User denied the wanted state; frustration, wasted tokens | Cost-based threshold (ErrP brief); Retry focused by default |
| H4 | ErrP miss → a wrong action persists | Same as H1 | Visible "Action Confirmed" status; easy undo path |
| H5 | Caregiver slow or absent → high-risk request pending | User left in the hazardous ambient condition → harm | Expiry + escalation **[out of POC scope]**; patient withdraw; never auto-approve |
| H6 | Speech unavailable offline (online-only voices) | User unaware of the decision or rollback | Local-voice preference; text-only fallback pill; `aria-live` mirror |
| H7 | Audit log edited | Loss of accountability | Hash chain + anchored head (+ optional HMAC); honest labelling |
| H8 | Compensation restores a stale state over a newer human change | Wrong state | Compare-before-compensate |
| H9 | User cannot summon help (BCI down, fatigue, standby false exits) | Unattended distress | **Not in README.** Open question: "Call caregiver" affordance / standby |
| H10 | Flashing or large motion | Photosensitive or vestibular reaction | 2.3.1 limit; reduced motion (2.3.3) |
| H11 | Key auto-repeat or held key floods tokens | Unintended rapid actuation | `event.repeat` filter; min inter-token interval; post-actuation lockout |
| H12 | Operator harness used as if it were the patient's control | Confusing provenance | "Not patient-facing" label; audit `actor` field |

**IEC 62304 vocabulary only:** a real product that actuates the thermal environment of a vulnerable user would have to classify its software system and items (Class A/B/C, by whether a failure could cause no injury, non-serious injury, or serious injury or death) through ISO 14971 analysis [38]. **We make no classification claim.** The architecture should still *isolate* the safety-relevant items (`policy/`, `safety/`), which makes such a classification possible later.

---

## Decisions the debates must settle

**D1. Score combination (debate #5).** Options: min / weighted mean / product / geometric / log-odds. **Recommend: product on calibrated n and s, with a neural floor of 0.40.** Evidence: §6.2. Product is the only rule with a probabilistic reading. Kittler [44] favours sum for robustness, so the critic should test robustness with slider sweeps. Log-odds is overconfident at 0.989.

**D2. Thresholds (debate #5).** Options: (i) one global set; (ii) **tier-specific EXECUTE thresholds derived from costs**; (iii) always CONFIRM for anything above Low. **Recommend (ii): Low 0.75, Medium 0.85, REJECT < 0.50, High → CAREGIVER.** Evidence: the Chow cost derivation in §6.3 gives 0.77 and 0.88. The canonical case still gives EXECUTE with a 0.069 margin.

**D3. Semantics of "Semantic Context 89 %" vs. "SPARQL Match 0.94" (debates #4 and #5).** Options: (a) s = normalised resolver posterior, so 0.94 maps to 0.89; (b) s is a separate context factor; (c) s = raw 0.94, which breaks README conformance. **Recommend (a)**, with the mapping documented and tested.

**D4. Neural calibration (debates #1 and #5).** Options: raw softmax / temperature scaling on a session-1 validation split / none in Scripted mode. **Recommend temperature scaling on a session-1 hold-out**, reporting ECE before and after [46]. Never touch session 2.

**D5. CONFIRM interaction design (debate #7).** Options A, B or C (§2.2). **Recommend B + C:** SELECT = confirm, BACK = cancel, NEXT/PREV = re-prompt, plus a gate on the confirm token's confidence. Costs: 1.17 vs. 1.81 expected tokens.

**D6. Default focus (debate #7).** Options: always item 1 / **KG top candidate pre-focused with "suggested" announced** / last-used. **Recommend: KG pre-focus, but only on screens where the KG ranks entities (Fixtures). Everything else starts on item 1.** README orders and labels are unchanged. Evidence: §1.6 and §2.1.

**D7. Wrap-around and BACK semantics (debate #7).** **Recommend wrap-around ON** (hub mean 2.0 → 1.2 tokens) **with spoken wrap**. On S5's alternative card, BACK = [Return to Home] (1 token instead of 2).

**D8. Is the caregiver-pending state modal for the patient? (debates #5 and #7).** Options: modal wait / non-modal with a status pill. **Recommend non-modal, with BACK on the pending card = withdraw.** This keeps the patient's agency; never auto-approve.

**D9. ErrP on caregiver-approved actions (debates #2 and #5).** Options: auto-roll back as usual / **alert only** / ignore. **Recommend alert only** for High-tier caregiver-approved actions. Two humans agreed, so rolling back into a state that was just judged hazardous to leave is itself a risk.

**D10. Thermal band (debate #5).** Options: README 18/30 only / **README 18/30 → High, plus a configurable Medium advisory band 18–19 and 27–30 °C** / tighten High to 20/26. **Recommend the middle option.** The README must match exactly, and the evidence supports 20–26 °C for vulnerable users [31][33][34]. Tightening High would contradict the README.

**D11. Focus rendering source of truth (debates #6 and #7).** **Recommend:** a store-driven `.is-focused` + `aria-selected` + `aria-activedescendant`, harness buttons that do not steal focus, and no reliance on `:focus-visible`. Evidence: [17][20] and §3.

**D12. Speech priorities and voice selection (debate #7).** **Recommend:** two priorities (interruptible navigation / protected safety), local voices first, a text-only fallback pill, utterances < 160 chars, no blocking. Evidence: §4 [LOCAL-TEST][21][22].

**D13. Audit integrity claim (debate #6).** Options: plain SHA-256 chain / chain + displayed head anchor / chain + HMAC (caregiver PIN). **Recommend chain + head anchor** for the POC, with HMAC as a stretch goal. Label the FNV-1a fallback honestly. The tamper demo must say what it proves. Evidence: [39][40][41].

**D14. Lockout and debounce timings (debate #6).** **Recommend** `minInterTokenMs = 250` (keyboard), post-actuation lockout = the ErrP window (from the ErrP ADR), `event.repeat` ignored. Evidence: §1.7.

## Open questions for the user

1. **Headed voice check (30 s, no install):** please open any page in normal (non-headless) Edge, run `speechSynthesis.getVoices().filter(v=>v.localService).map(v=>v.name)` in DevTools, and tell us the output. That confirms whether David, Zira and Mark are exposed offline. Headless showed only online voices.
2. **Viva browser:** Edge or Chrome? Which voices are installed differs per browser and machine.
3. **Standby / "call caregiver":** the README has no standby (pause) mode and no "call for help" affordance. Both matter for real ALS users ([7]: standby false exits ≤ once every 2–4 h). May we add them as **harness-only or caregiver-only** features, or must the patient UI stay strictly as in the README?
4. **Thermal advisory band:** do you accept a Medium "advisory" tier for 18–19 °C and 27–30 °C (CONFIRM plus a spoken note), on top of the README's High rule for < 18 and > 30?
5. **Default focus:** may the Fixtures screen pre-focus the KG's suggested fixture? It saves tokens, and labels and order are unchanged.
6. **Climate context:** should the POC assume a hot-season context (Islamabad summer), in which "AC Power Off" would be Medium rather than Low? I have not researched Islamabad climate figures **[UNVERIFIED]**.
7. **Audit anchoring:** is an optional caregiver PIN (HMAC) acceptable in the demo, or is it unnecessary friction?

## Things requiring user approval

- **This brief needs no installs, downloads or long runs.** The only execution was a local headless-Edge probe page in the session scratchpad (about 3 runs, < 1 min each) and a read-only registry query of installed voices.
- **Optional, for later phases (approval needed if wanted):** an automated accessibility checker such as `axe-core` via npm into a project-local folder, for red-team round 1. Package size is about a few MB **[UNVERIFIED size]**. Alternative with no install: the self-test computes contrast ratios from `tokens.css` and checks ARIA roles itself. **Recommended alternative: no install.**
- **Long runs:** none from this workstream. Calibration (temperature scaling) piggybacks on the SFE-GAT training run, which is approved separately.

## References

1. SilentAssist `README.md` and `PROMPT.md`, local files, C:/Users/AK/Documents/FYP (read 2026-10-14).
2. Gao X, Cao G, Ma G. SFE-GAT: Structure-Feature Evolution Graph Attention Network for Motor Imagery Decoding. *Sensors* 2026, 26, 1730. doi:10.3390/s26051730 (local text `docs/research/_paper-text.txt`: abstract; §3 per-subject A02/A03/A08; Table 3; latency 0.066 ms).
3. Brunner C, Leeb R, Müller-Putz GR, Schlögl A, Pfurtscheller G. *BCI Competition 2008 – Graz data set A* (description). https://www.bbci.de/competition/iv/desc_2a.pdf
4. McFarland DJ, Sarnacki WA, Wolpaw JR. Brain–computer interface (BCI) operation: optimizing information transfer rates. *Biological Psychology* 2003;63:237–251. doi:10.1016/S0301-0511(03)00073-5. PDF: https://www.neurotechcenter.org/sites/default/files/misc/Brain-computer%20interface%20%28BCI%29%20operation%20optimizing%20information%20transfer%20rates.pdf (Eq. 1 verified).
5. Wolpaw JR, Birbaumer N, McFarland DJ, Pfurtscheller G, Vaughan TM. Brain–computer interfaces for communication and control. *Clin Neurophysiol* 2002;113:767–791 (origin of the ITR usage; formula verified via [4]).
6. Dal Seno B, Matteucci M, Mainardi L. The utility metric: a novel method to assess the overall performance of discrete brain–computer interfaces. *IEEE TNSRE* 2010;18(1):20–28. doi:10.1109/TNSRE.2009.2032642 (closed form [UNVERIFIED]); related: Dal Seno et al., *Comput Intell Neurosci* 2010:307254, https://pmc.ncbi.nlm.nih.gov/articles/PMC2821756/
7. Huggins JE, Wren PA, Gruis KL. What would brain-computer interface users want? Opinions and priorities of potential users with ALS. *Amyotroph Lateral Scler* 2011;12:318–324. https://pmc.ncbi.nlm.nih.gov/articles/PMC3286341/
8. Vidaurre C, Blankertz B. Towards a cure for BCI illiteracy. *Brain Topogr* 2010;23:194–198. doi:10.1007/s10548-009-0121-6. https://link.springer.com/article/10.1007/s10548-009-0121-6
9. Li S, Duan J, Sun Y, Sheng X, Zhu X, Meng J. Exploring fatigue effects on performance variation of intensive brain–computer interface practice. *Front Neurosci* 2021;15:773790. https://www.frontiersin.org/journals/neuroscience/articles/10.3389/fnins.2021.773790/full
10. Höhne J, Holz E, Staiger-Sälzer P, Müller K-R, Kübler A, Tangermann M. Motor imagery for severely motor-impaired patients: evidence for brain-computer interfacing as superior control solution. *PLoS ONE* 2014;9(8):e104854. https://pmc.ncbi.nlm.nih.gov/articles/PMC4146550/
11. Sellers EW, Vaughan TM, Wolpaw JR. A brain-computer interface for long-term independent home use. *Amyotroph Lateral Scler* 2010;11:449–455. https://www.neurotechcenter.org/sites/default/files/misc/sellers2010.pdf
12. Holz EM, Botrel L, Kaufmann T, Kübler A. Long-term independent brain-computer interface home use improves quality of life of a patient in the locked-in state: a case study. *Arch Phys Med Rehabil* 2015;96(3 Suppl):S16–26. doi:10.1016/j.apmr.2014.03.035
13. Müller-Putz GR, Kaiser V, Solis-Escalante T, Pfurtscheller G. Fast set-up asynchronous brain-switch based on detection of foot motor imagery in 1-channel EEG. *Med Biol Eng Comput* 2010;48:229–233. doi:10.1007/s11517-009-0572-7 (author list partly [UNVERIFIED]).
14. Direct selection vs. visual scanning in AAC (children). PubMed 16533077. https://pubmed.ncbi.nlm.nih.gov/16533077 (authors [UNVERIFIED]). 14b. Directed vs. group-item scanning in 4-year-olds. *Am J Speech Lang Pathol* 2010. https://pubs.asha.org/doi/10.1044/1058-0360%282010/09-0017%29
15. W3C. Web Content Accessibility Guidelines (WCAG) 2.2. https://www.w3.org/TR/WCAG22/ (SC 1.4.3, 1.4.11, 2.2.1, 2.3.3, 2.4.7, 2.4.11, 2.4.12, 2.4.13, 2.5.8, 3.3.4, 3.3.6, 4.1.3; "large scale"; contrast ratio).
16. W3C WAI. Understanding SC 2.4.13 Focus Appearance. https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html
17. W3C WAI-ARIA APG. Listbox Pattern. https://www.w3.org/WAI/ARIA/apg/patterns/listbox/
18. MDN. ARIA live regions. https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions
19. MDN. prefers-reduced-motion. https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
20. MDN. :focus-visible. https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible
21. W3C CG. Web Speech API (draft). https://webaudio.github.io/web-speech-api/
22. Caktus Group. "The Halting Problem" (Chrome speechSynthesis cutoff, Chromium issue 679437), 2025-11-03. https://www.caktusgroup.com/blog/2025/11/03/the-halting-problem/
23. Microsoft Tech Community. Edge 150 `speechSynthesis.getVoices()` "undefined" Natural voices (community thread, 2026). https://techcommunity.microsoft.com/discussions/edgeinsiderdiscussions/edge-version-150-javascript-speechsynthesis-getvoices-undefined-voices/4538591
24. MDN. SpeechSynthesisVoice.localService. https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService
25. W3C. Secure Contexts, §3.1 "Is origin potentially trustworthy?". https://w3c.github.io/webappsec-secure-contexts/
26. MDN. Secure contexts. https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts
27. MDN. SubtleCrypto. https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto
28. Chromium code review 299253003 (restricting WebCrypto to secure origins; lists file:// as secure), 2014. https://codereview.chromium.org/299253003
29. [LOCAL-TEST] Headless Edge 155.0.0.0 probe on `file://` page, 2026-10-14 (scratchpad `sc/t.html`); Windows registry `HKLM\SOFTWARE\Microsoft\Speech\Voices\Tokens` and `Speech_OneCore\Voices\Tokens`.
30. WHO. *WHO Housing and Health Guidelines*. Geneva: WHO; 2018. ISBN 978-92-4-155037-6. NCBI Bookshelf NBK535294 (low temperatures) and ch5 (high temperatures): https://www.ncbi.nlm.nih.gov/books/NBK535294/ ; news: https://www.who.int/news/item/26-11-2018-housing-impacts-health-new-who-guidelines-on-housing-and-health (exact wording [UNVERIFIED-snippet]).
31. Scottish Government. *A new definition of fuel poverty in Scotland: review of recent evidence*, §5 (WHO 1961/1984/1987/2007 history). https://www.gov.scot/publications/new-definition-fuel-poverty-scotland-review-recent-evidence/pages/10/
32. UK Health Security Agency (PHE) blog. Preventing avoidable deaths this winter, 2014-10-21. https://ukhsa.blog.gov.uk/2014/10/21/preventing-avoidable-deaths-this-winter/
33. CIBSE TM59:2017 overheating criteria, as quoted in London Borough of Camden planning overheating assessments, e.g. https://camdocs.camden.gov.uk/CMWebDrawer/Record/9554543/file/document [secondary].
34. Handrakis JP, Trbovich M, Hagen EM, Price M. Thermodysregulation in persons with spinal cord injury: case series on use of the autonomic standards. *Spinal Cord Ser Cases* 2017. https://pureportal.coventry.ac.uk/en/publications/thermodysregulation-in-persons-with-spinal-cord-injury-case-serie/
35. Thermoregulation following spinal cord injury. *Handb Clin Neurol* 2018;157:799–820 (authors [UNVERIFIED]; Price MJ, Trbovich M likely). https://scholars.uthscsa.edu/en/publications/thermoregulation-following-spinal-cord-injury/
36. ClinicalTrials.gov NCT01890915. Body Temperature in Persons With Tetraplegia When Exposed to Heat. https://clinicaltrials.gov/study/NCT01890915 · 36b. NCT02379156. Thermoregulation and Cognition During Cool Ambient Exposure in Tetraplegia. https://clinicaltrials.gov/study/NCT02379156
37. US FDA. ISO 14971:2019 terminology slides. https://fda.gov/media/163912/download · 37b. RAPS Regulatory Open Forum discussion of ISO 14971 Annex A.2.7.1 priority order. https://connect.raps.org:443/discussion/risk-assessment-reduction-in-severity-of-harm [secondary].
38. Johner Institute. IEC 62304 safety classes. https://blog.johner-institute.com/iec-62304-medical-software/safety-class-iec-62304/
39. Schneier B, Kelsey J. Secure audit logs to support computer forensics. *ACM TISSEC* 1999, pp. 159–176 (volume/issue cited inconsistently across sources: 2(2) vs "v.1 n.3" on schneier.com — [UNVERIFIED]). https://www.schneier.com/academic/archives/1999/05/secure_audit_logs_to.html
40. Crosby SA, Wallach DS. Efficient data structures for tamper-evident logging. *USENIX Security* 2009:317–334. https://www.usenix.org/conference/usenixsecurity09/technical-sessions/presentation/efficient-data-structures-tamper-evident
41. Ma D, Tsudik G. A new approach to secure logging. *DBSec* 2008 (truncation and delayed-detection attacks). https://dl.ifip.org/index.html/db/conf/dbsec/dbsec2008/MaT08.pdf
42. Rundgren A, Jordan B, Erdtman S. RFC 8785: JSON Canonicalization Scheme (JCS), 2020. https://www.rfc-editor.org/rfc/rfc8785
43. Garcia-Molina H, Salem K. Sagas. *Proc. ACM SIGMOD* 1987:249–259. doi:10.1145/38713.38742. https://www.cs.princeton.edu/research/techreps/598
44. Kittler J, Hatef M, Duin RPW, Matas J. On combining classifiers. *IEEE TPAMI* 1998;20(3):226–239. https://people.cs.pitt.edu/~chang/231/y14/combineclassifier.pdf
45. Chow CK. On optimum recognition error and reject tradeoff. *IEEE Trans Inf Theory* 1970;IT-16(1):41–46 (via secondary summaries, e.g. https://arxiv.org/pdf/1504.03740).
46. Guo C, Pleiss G, Sun Y, Weinberger KQ. On calibration of modern neural networks. *ICML* 2017, PMLR 70:1321–1330. https://proceedings.mlr.press/v70/guo17a.html
47. Chavarriaga R, Sobolewski A, Millán JdR. Errare machinale est: the use of error-related potentials in brain-machine interfaces. *Front Neurosci* 2014;8:208. doi:10.3389/fnins.2014.00208
48. 9to5Google. Chrome 52 removes Backspace back-navigation (2016). https://9to5google.com/?p=142507
49. Quasi-movements and attempted movements as an alternative to MI (refractory 3 s, FA ≈ 0.03–0.04/s) [secondary; details UNVERIFIED]. https://ogarev-online.ru/2313-1829/article/view/256303
