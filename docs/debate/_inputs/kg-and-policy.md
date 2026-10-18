# Raw debate inputs: kg-and-policy
(Collected from the workflow journal; agents not listed failed with network errors.)

=== propose:kg-and-policy:B ===

# Proposer B (Demo-first): position on the "kg-and-policy" debate

**Stance.** Ship a small, fully explainable KG and policy engine tonight that reproduces the README canonical values from live computation. It must reach EXECUTE, CONFIRM, REJECT and CAREGIVER from the harness. Every number the README pins down is disclosed as README-pinned. Anything that adds code paths the 5-minute demo does not exercise is moved to post-mid-eval behind config keys, so Plan A is a config change.

**Sources.** The KG, UX, ErrP and cross-check citations below refer to `docs/research/knowledge-graph.md`, `docs/research/assistive-ux-safety.md`, `docs/research/errp.md` and `docs/research/_cross-check.md`.

**How the README numbers come out (verified with node):**
- **SPARQL Match:** S = 0.35 + 0.30 + 0.20 + 0.15·0.6 = 0.94. Raw float is 0.9399999999999998, so it is rounded to 4 dp.
- **Semantic Context:** s = 0.94 × 0.95 = 0.893, shown as "89%".
- **Combined:** c = 0.92 × 0.893 = 0.8216. That is ≥ 0.75 on the Low tier, so the decision is EXECUTE.

---

## 1. Ontology alignment, scope, engine and SPARQL subset

**Choice.**
- **SAREF v4.1.1** (`https://saref.etsi.org/core/`), using the State / StateOfInterest / StateValue pattern. Mint `sa:On`, `sa:Off` and `sa:Standby`, because `saref:OnState`, `OnOffState`, `LightingDevice` and `OnCommand` are deleted in v4.1.1 (KG §1.1 [S1, S2]; critic spot-check S10 ✔).
- **BOT** (`https://w3id.org/bot#`) for Building → Storey → Space and `bot:containsElement`. Never assert `bot:hasElement` (KG §1.3 [S4]).
- **SOSA 2017** (`http://www.w3.org/ns/sosa/`), used for exactly two kinds of evidence: the room-selector observation and the ErrP observations (KG §1.4 [S5]).
- **SAREF4BLDG is not imported.** It has a competing space model and no light class (KG §1.2).
- **Extension namespace:** `sa:` = `https://silentassist.example/ns#` (RFC 2606, nothing is published). Instance namespace: `:` = `https://silentassist.example/home#`, so the README's literal `:BedroomCeilingLight` appears unchanged.
- **Copy, don't import.** Only two upstream axioms are copied: `saref:Actuator ⊑ saref:Device` and `saref:Appliance ⊑ saref:Device`.

**Scope (about 470 triples).** Start from the KG brief's §2.6 draft TTL, with these changes:
- (a) Risk tier is attached per **device**, as `sa:riskTier` on each of the 6 devices, instead of per command. AC "Turn On" must be Medium while light "Turn On" is Low, and a single `sa:TurnOn` IRI can't carry both. Fixes X8.
- (b) Preset tiers are not stored; they are computed (see §5).
- (c) `sa:ThermalHazardRule` applies to `sa:SetTemperature` only (minSafe 18, maxSafe 30, tierIfViolated `sa:HighRisk`).
- (d) The device and room changes from §6.
- (e) Fan uses two SOIs, power and speed, with speed unbound at reset, so CQ13 tests OPTIONAL.
- (f) Store and KG relationship: `SA.store` is authoritative. The KG is a single-writer mirror updated from `device:stateChanged`, and the selftest asserts they agree (KG D5).
- (g) Subclass typing is materialised at load (rdfs9 + rdfs11), so no property paths are needed (KG D6).

**Engine: our own, no vendoring, no npm.** Files:

| File | Est. lines |
|---|---|
| `POC/js/kg/ontology.js` | wraps the TTL text |
| `turtle.js` | ~180 |
| `triplestore.js` | ~150 (SPO/POS/OSP hash indexes) |
| `sparql-parser.js` | ~230 |
| `sparql-eval.js` | ~220 |
| `resolver.js` | ~200 |
| `kg-view.js` | ~300 |

- **Why not N3.js:** it has no SPARQL. It would be the largest file in `POC/` and would still leave the hardest part unwritten (KG §4.4 [J1–J3]).
- **Why not Comunica or Oxigraph:** Comunica is over 1 MB. Oxigraph is an ES module plus 4 MB of wasm, which `file://` blocks [J6, J8, J10].
- **The Mission requires this:** it explicitly asks for "a Turtle parser, an indexed triple store, and a SPARQL subset" (PROMPT §C).
- **Feasibility:** the KG brief's throwaway prototype did all of this in about 190 dense lines and ran every CQ in 0.2–4 ms. That makes it a one-evening job.

**Node test oracle:** none tonight, since there is no install approval. Instead, `kg/tests/*.test.js` runs under plain `node` and checks:
- (i) the asserted and closed triple counts, as golden numbers;
- (ii) 15 spot-checked triples;
- (iii) that every excluded construct throws with line and column;
- (iv) that `kg/silentassist.ttl` is byte-identical to the string in `POC/js/kg/ontology.js`, comparing raw bytes and failing on CRLF, so both files are kept LF;
- (v) all CQs (§7).

The `n3@2.13.12` oracle is post-mid-eval and needs approval.

**Turtle subset** (KG §4.1):
- Supported: `@prefix` and `PREFIX`, IRIs, prefixed names, `a`, `;` and `,`, string literals with datatype or language tag, signed integers and decimals, `true`/`false`, `#` comments.
- Throws on: blank nodes, collections, long strings, `@base`, escapes, exponents.

**SPARQL subset (frozen):**
- `PREFIX`; `SELECT [DISTINCT] (?v+ | *)`; `WHERE`.
- BGP with `;`, `,` and `a`.
- `OPTIONAL` (nested allowed, left-join per SPARQL §6.1).
- `FILTER` with `= != < > <= >=`, `&& || !`, `BOUND()`, parentheses, and 3-valued error logic (§17.2).
- `ORDER BY` with `ASC()`, `DESC()` or a bare variable, using the §15.1 ordering.
- `LIMIT`.
- **Dropped versus the KG brief: arithmetic (`+ - * /`).** No CQ uses it, and it saves the lexer and parser cases. Restoring it is post-mid-eval.
- Everything else throws `Unsupported: <KEYWORD> at line:col`: UNION, MINUS, BIND, VALUES, GRAPH, subqueries, aggregates, paths, OFFSET, REGEX, CONSTRUCT, ASK, DESCRIBE.

**Risks.** The `<` lexing ambiguity: an IRIREF must close before any whitespace (KG §4.3). Mitigation is a parser test with `FILTER(?a<?b)`.

## 2. Resolver: scoring, weights, gates and an honest account of 0.94

**Function (KG §3.2, adopted with two clarifications):**
`S(d) = gate(d) · clamp01(0.35·f_T + 0.30·f_S + 0.20·f_X + 0.15·f_R − π_ErrP(d,cmd,room))`, rounded once to 4 dp. It is displayed with `toFixed(2)`, and tests use a tolerance of 1e-9 against the rounded value.

**Features:**
- **f_T:** 1 if d is typed K. K is the class from the hub category, e.g. `sa:Light`.
- **f_S:** 1 if the active room `bot:containsElement` d, else 0.
- **f_X:** 1 if the action changes d's state, else 0. For TurnOn/TurnOff this is `isActive ≠ prefersActive`. For value commands it means target ≠ current and within range.
- **f_R:** n_d / K over the last K ≤ 10 `sa:Confirmed` executions of the same (command, class). **Clarification 1 (new):** if K = 0, f_R = 1/N_candidates, a uniform prior meaning "no habit information". This makes single-candidate devices (fan, AC, TV) score S = 1.00, and makes commands with no history, such as TurnOff, well-defined.

**Type gate.** This is a hard gate in the BGP (`?device a sa:Light ; saref:hasFunction/saref:hasCommand`). Without it, a bedroom fan would score 0.50 for "Turn On Light" (KG §3.6.3).

**No-op guard.** This is **clarification 2**. When f_X = 0 for the entity being acted on, the resolver returns `noop:true`, and the policy returns REJECT with the reason "No change: <device> is already <state>". No actuation and no ErrP window follow. f_X stays soft in the score, so ranking still works, but no-op actions never execute (resolves KG D10).

**What the resolver decides (X9, with explicit names):**
- **"Validate-focused"** tonight. The patient's focused fixture on Screen 3 is the entity acted on. The resolver re-scores all gated candidates, and the panel shows the focused entity's S, plus "KG top: X" if X differs.
- **"Pre-focus suggestion"**, where Screen 3 default focus goes to the KG's top candidate, is post-mid-eval. In the canonical case it changes nothing.

**Canonical arithmetic** (KG §3.3, re-verified):

| Candidate | Arithmetic | S |
|---|---|---|
| Bedroom Ceiling Light | 0.35 + 0.30 + 0.20 + 0.15·0.6 | **0.94** |
| Bedside Lamp | 0.35 + 0.30 + 0.20 + 0.15·0.2 | 0.88 |
| Living Room Light | 0.35 + 0 + 0 + 0.03 | 0.38 |

Margins: 0.06 to the runner-up, 0.50 to the last.

**Honest account of 0.94 (critic §2 "hard-coding by another name").** We present it exactly as follows in `docs/kg.md` and in the panel's expandable "Why 0.94?" row.

1. **The structure of the score is a design choice:** a linear model with Σw = 1, so that 1.0 means "perfect on every cue". The cue ordering type > space > state > habit is justified by deployed assistants (spatial context [L1–L3]) and by the Mission's "Turn On prefers OFF".
2. **What the README fixes:** the README's 0.94 fixes exactly one quantity, **w_R·(1 − f_R) = 0.06**. The other parts of the canonical light are perfect, so the 0.06 shortfall is entirely habit uncertainty.
3. **What we chose to hit it:** the pair (w_R = 0.15, seeded f_R = 6/10). The pair (0.20, 7/10) would hit it equally well. We say this plainly: *"0.94 is a README calibration target. Our free choice was the habit weight and a synthetic 10-event history (6 ceiling / 2 lamp / 2 living), which is labelled 'Synthetic seed history' in the UI and in the TTL comments."*
4. **What makes it not hard-coded:**
   - (a) The score is recomputed live from four SPARQL-fetched features on every decision.
   - (b) A sensitivity table in `docs/kg.md` shows f_R ∈ {0.4, 0.5, 0.6, 0.7, 0.8} → S ∈ {0.91, 0.925, 0.94, 0.955, 0.97}.
   - (c) The selftest mutates the history and asserts that S changes.
   - (d) The demo itself changes it. After "Retry → Bedside Lamp" is confirmed, the ceiling becomes 5/10 → 0.925 and the lamp 3/10 → 0.895. After a [No ErrP] success the ceiling stays at 6/10 → 0.94, because the oldest event H10 drops out.
5. **Split of the remaining 0.85:** w_T/w_S/w_X = 0.35/0.30/0.20 is a documented choice that the README does not determine. Any split with w_S + w_X > 0 preserves the ranking (KG §3.3 step 3).

**ErrP penalty.** One mechanism, layered with a guaranteed fallback. This resolves X1, X2 and X3.
- **Persistent penalty:** `π = λ·q·2^(−Δt/h)` with λ = 0.30, h = 60 demo-clock minutes, scoped to (entity, command, room). q is the **detector's calibrated posterior** for the injected or replayed epoch, never a scripted 0.91. Subtractive, in score units, so the panel can print "ErrP penalty −0.27".
- **Unifying invariant:** a rollback only happens when q > t\* (ErrP ADR). The selftest asserts **λ·t\* > 0.06** (the top-2 margin). So any ErrP that triggers a rollback flips Ceiling below Lamp: at t\* = 0.364 the penalty is 0.108, giving Ceiling 0.832 < 0.88; at q = 0.91, Ceiling falls to 0.670. **"The penalty is what makes Bedside Lamp the alternative" is therefore literally true** (PROMPT §B).
- **Guaranteed fallback:** the offered alternative is computed as argmax over gated candidates excluding the rolled-back entity, i.e. Perrin 2012's second-best rule [L7], which errp §10.1 recommends. By the invariant it equals the post-penalty ranking.
- **Rejected for tonight:**
  - errp's multiplicative `(1/Λ̂)^γ`, floor 0.5. It works in different units, needs the measured LR+, and also flips (0.94 → ~0.51), but it is harder to show as arithmetic. It is post-mid-eval as a documented alternative.
  - Half-life counted in interactions; we use the demo clock instead.
  - UX's separate `errpMemoryMs` flag. It is replaced by deriving the flag from the same penalty record (§4).
- **Decay:** at q = 0.91 the swap lasts about 131 demo-minutes; at q = t\* about 52.
- At most one automatic alternative per episode (errp D11).
- Disconfirmation (cancel the penalty on a later clean re-selection) is post-mid-eval.

**Risks.**
- **Score format:** "SPARQL Match" is a JS score over SPARQL-fetched features, not an in-query score. The panel label stays README-exact, and the expander states the formula (KG D7a).
- **What the panel shows:** the resolver keeps the exact query string it executed, and the panel renders that same string. Selftest: `panel.textContent === SA.kg.lastQuery`.

## 3. ONE definition of "Semantic Context 89%"

**Definition (KG option A / D12):**
**s = S(acted-on entity) × P(active room)**, where P(active room) = `sa:confidence` of the latest SOSA room observation, 0.95 in config `kg.roomConfidence`. Canonical: 0.94 × 0.95 = 0.893 → `Math.round(100·s)` = **"89%"**.

**Honest disclosure.** Given 0.94, the README's "89%" forces P(room) into [0.9415, 0.9521]. So **0.95 is README-pinned, not derived from a sensor model.** The room selector is a simulated operator sensor in every mode, and the UI already labels it "simulated".

**Other device types:**
- **Presets:** s = (number of steps passing the KG gate) / (number of steps) = 1.00, shown as "100% (explicit routine, KG-validated 4/4 steps)". No entity disambiguation is involved and the room is irrelevant.
- **Single-candidate devices** (fan, AC, TV) in the active room: S = 1.00, s = 0.95.
- **After rollback:** the Bedside Lamp's s = 0.88 × 0.95 = 0.836, shown as "84%".

**Scripted-mode semantic slider.** It initialises to the KG-computed value. If the operator moves it, the panel shows "Semantic Context (operator override)" and the policy uses the override.

**Rejected:**
- the softmax posterior: needs a magic T ≈ 0.0287, sensitive (T = 0.03 gives 0.881); UX D3(a);
- a scripted constant: no Replay definition;
- errp's illustrative entity prior of 0.80.

**Consequence for the ErrP debate (X4/X5):** errp's π calculations must be redone with this s. The canonical executed-action error is 1 − 0.92 × 0.893 = **0.178**.

## 4. Neural × semantic combination and thresholds

**Combination: product, c = n · s** (UX §6.2, D1). It is the only rule with a probabilistic reading (P(intent ∧ entity correct) under calibration and independence), and it is non-compensatory.
- Rejected: log-odds (overconfident, 0.989); weighted mean (compensatory, a bad s can be outvoted); min (not a probability, and it ignores the stronger signal). Min is the runner-up if the judge distrusts calibration.
- **Honesty caveat, stated in the panel docs:** s is a heuristic score scaled by a simulated room confidence, not a calibrated probability, so c is a "monotone confidence". Calibrating s is post-mid-eval and needs interaction logs.

**Decision procedure** (`SA.policy.decide`, all values in `SA.config.policy`). The rules run in order:
1. `noop` → **REJECT** ("No change").
2. n < 0.40 **or** c < 0.50 → **REJECT** ("Not sure, please try again").
3. Tier High → **CAREGIVER APPROVAL**.
4. Medium tier: c ≥ 0.85 → EXECUTE, else **CONFIRM**.
5. Low tier: c ≥ 0.75 → EXECUTE, else **CONFIRM**.
6. If EXECUTE **and** there is an active ErrP penalty ≥ 0.05 on (entity, command, room) → **CONFIRM**. This is UX's history flag, derived from the same record.

There is no top-2 margin rule (X11: one above 0.06 would break the canonical case).

**One cost table for the policy and for t\*** (resolves X7). It uses errp's costs: C_FN = 8, C_FP = 4, C_TP = 1, C_TN = 0. The CONFIRM cost is 1.17 tokens (UX design B).
- **Low tier:** errors are partly caught by ErrP rollback. At errp's cost-optimal operating point (TPR 0.466), the effective error cost is 0.466·1 + 0.534·8 = 4.74. Chow's rule gives 1 − 1.17/4.74 = **0.753 → 0.75**. This is UX's "C_err ≈ 5" explained as cost net of the ErrP safety net.
- **Medium tier:** no ErrP credit is taken, because thermal consequences outlast the 1 s observation window. C_err = 8 gives 1 − 1.17/8 = **0.854 → 0.85**.
- **REJECT at c < 0.50:** below that, the proposal is more likely wrong than right (UX §6.3).

**Values the demo will hit** (s_canon = 0.893):

| Neural slider | c | Result |
|---|---|---|
| 92 | 0.822 | **EXECUTE** (canonical) |
| 80 | 0.714 | **CONFIRM** |
| 75 | 0.670 | **CONFIRM** (demo step 3a) |
| 60 | 0.536 | CONFIRM |
| 55 | 0.491 | **REJECT** |
| 45 | 0.402 | **REJECT** (demo step 3b) |
| 35 | — | **REJECT** (neural floor) |

Other cases:
- **Retry → Bedside Lamp:** c = 0.92 × 0.836 = 0.769 → EXECUTE. The margin is only 0.019, so `[Reset Demo]` must restore the sliders to 92.
- **AC Temp − from 18 → 17:** s = 0.95, c = 0.874, tier High → **CAREGIVER**.
- **Turning off the Living Room Light from the bedroom:** S = 0.60, c = 0.524 → CONFIRM. A sensible "other room" confirm.

**CONFIRM UX** (UX design B): SELECT confirms, BACK cancels, NEXT/PREV re-prompts. The confirm-token confidence gate (design C) is post-mid-eval.

**Presets:** the diff preview *is* the confirm step, so a preset's EXECUTE and CONFIRM both commit on the single SELECT on the preview (UX §2.3).

**CAREGIVER-approved High actions:** the ErrP is still observed, but **alert only, no auto-rollback**. This follows UX D9 and resolves X6. errp's High-tier t\* = 0.174 is therefore unused in the POC and noted as such.

**X5:** the policy bounds the executed-action error at ≤ 0.25 (Low) and ≤ 0.15 (Medium), so ErrP auto-rollback is near break-even on literature LR+. We keep it because the README mandates it, and disclose this in `docs/errp.md`. Per-action prior π = 1 − c is post-mid-eval.

## 5. Risk tier for every action

**Tiers are attached to the device** (`sa:riskTier`), with the thermal rule as an overlay. They live in the TTL, which is the single source of truth, and the policy reads `tier` and `ruleFired` from the resolver result.

| Device / action | Tier |
|---|---|
| Lights: Turn On, Turn Off, Adjust Brightness 25/50/75/100 | **Low** |
| Fan: Off, Low, Medium, High | **Low** |
| TV: Power, Channel ±, Volume ± | **Low**. UX's "Medium above 80% volume" is post-mid-eval. |
| AC: Power, Mode (Cool/Fan/Dry), Temp ± to a setpoint in [18, 30] | **Medium** (UX §7.2: thermal environment of a user with impaired thermoregulation) |
| AC: SetTemperature with target < 18 or > 30 (strict; 18 and 30 are safe, README literal) | **High** → CAREGIVER |

**Presets: max over constituents, computed, not static.** The computation is a tiny loop, never contradicts the device data, and applies the thermal rule to any setpoint step:

| Preset | Tier |
|---|---|
| Night Mode | **Medium** (contains AC) |
| All Lights Off | **Low** |
| Cooling Mode | **Medium** |
| Watch TV | **Low** |

These match the KG brief's static values, so nothing in the TTL proposal is contradicted (resolves X8).

**Rollback compensations** bypass the policy unless they would enter a hazardous state, in which case they go to CAREGIVER (UX §7.2). Rollback is atomic per preset: compensating actions run in reverse order, with compare-before-compensate.

**Thermal rule.** Exactly as in the README: < 18 or > 30 → High.

**Advisory band.** For setpoints in 18–19 °C or 27–30 °C, the patient gets a **spoken and text advisory only, with no tier change**: "Outside the 20–26 °C comfort band advised for impaired thermoregulation" (WHO 1987 20 °C minimum for vulnerable groups [31]; CIBSE TM59 26 °C bedroom [33]; SCI [34, 35]). Config: `policy.thermal = {min: 18, max: 30, advisory: [20, 26], advisoryEscalates: false}`. Setting it to `true` (escalate to Medium/CONFIRM) is the post-mid-eval option and needs supervisor input. The reason for not escalating tonight: an escalation adds CONFIRM steps to demo step 4 and goes beyond the README.

**Post-mid-eval edge case:** turning the AC on while the stored setpoint is already out of range (only reachable after a caregiver approval).

## 6. Device facts the README leaves open (concrete defaults; `SA.config.initialState`, mirrored in the TTL)

**Rooms.** Two rooms: Master Bedroom and Living Room.
- Bedroom Ceiling Light, Bedside Lamp, **Ceiling Fan**, **Air Conditioner** and **Smart TV** are all in **Master Bedroom**. Only the Living Room Light is in the Living Room.
- **This changes the KG brief, which put the TV in the Living Room.** The rationale: the target users are bed-bound (ALS, tetraplegia), so their devices belong in their room. Otherwise every TV command from the bedroom would land on CONFIRM (S = 0.70, c = 0.61).
- The Living Room Light stays the deliberate out-of-room contrast. The harness room selector (options: Master Bedroom / Living Room, confidence 0.95 each) can demonstrate out-of-room CONFIRMs.

**Lights.** Initial brightness is 100% for all three. Ceiling and Lamp are OFF; Living Room Light is ON (README).
- Adjust Brightness on an OFF light turns it ON at that level.
- Hub subtitle: "N Active of 3", from CQ2 and CQ1.

**Fan.** Power OFF, speed unbound (README "Ceiling Fan: OFF").
- Actions: Off, Low, Medium, High, Back. Choosing a speed sets power ON plus that speed. Off keeps the last speed.
- Subtitle: "Ceiling Fan: OFF", or "Ceiling Fan: Medium" when running.

**AC.** **Initially ON**, Cool, 24 °C (README "24°C • Cool Mode").
- Actions: Turn Off / Turn On (toggle label), Temp −, Temp +, Mode: Cool, Mode: Fan, Mode: Dry, Back.
- Setpoint range **16–32 °C, step 1 °C**, clamped with no wrap. This makes both < 18 and > 30 reachable. From 24 °C, the hazard is reached at the 7th Temp − press (17 °C).
- After a Temp ± press, focus stays on that control (stepper; UX §2.3).
- Subtitle: "24°C • Cool Mode", or "OFF • 24°C".

**TV.** **Standby**, channel **1**, volume **20%**.
- Actions: Power (Standby ↔ ON), Channel −, Channel +, Volume −, Volume +, Back.
- Channels 1–99, wrap 99 ↔ 1. Volume 0–100, step 5, clamped.
- Channel or volume changes while in Standby are no-ops, so they REJECT with "Smart TV is in Standby".
- Subtitle: "Smart TV: Standby", or "Smart TV: ON • Ch 1".

**Presets** (diffs computed against current state; no-op steps are hidden from the diff):

| Preset | Steps | Diff from the reset state |
|---|---|---|
| Night Mode | Bedroom Ceiling Light OFF; Living Room Light OFF; Smart TV Standby; AC setpoint **25 °C** (not the brief's 26, which sits on the CIBSE edge) | Living Room ON→OFF; AC 24→25 |
| All Lights Off | all three lights OFF | Living Room ON→OFF |
| Cooling Mode | AC ON, Cool, 22 °C; Ceiling Fan Medium | AC 24→22; fan OFF→Medium |
| Watch TV | Smart TV ON; Bedroom Ceiling Light OFF; Bedside Lamp ON at 25% (changed because the TV moved) | TV Standby→ON; Lamp OFF→ON 25% |

**Tier labels.**
- **"Low: Autonomic"** (README exact).
- **"Medium: Guarded"**. Not "Confirm", because Medium still EXECUTEs at c ≥ 0.85.
- **"High: Caregiver Approval"**, matching the README decision label.

**Demo clock.** Reset sets it to 2026-03-01T21:00:00. Seed history H01–H10 is as in the KG brief (6/2/2).

**Demo-script consequence.** A successful step 1 leaves the ceiling light ON, which would make step 2 a no-op. The Live Demo Script must press `[Reset Demo]` between steps 1 and 2, and before step 4.

## 7. Final competency questions

These go in `docs/kg.md` and `kg/tests/cq.test.js`, and also run in `?selftest=1`. All share the KG brief's §5 prologue. Expected answers are for the reset state with the §6 facts.

1. **CQ1. Light fixtures in display order, with power state.** Ceiling "OFF", Lamp "OFF", Living Room "ON".
2. **CQ2. Active lights.** One row, `:LivingRoomLight`, giving "1 Active of 3".
3. **CQ3. Devices in the active room** (ORDER BY label). Air Conditioner, Bedroom Ceiling Light, Bedside Lamp, Ceiling Fan, Smart TV.
4. **CQ3b. Lights not in the active room** (OPTIONAL + `!BOUND`). `:LivingRoomLight`.
5. **CQ4. Where the user is, and the evidence.** `:MasterBedroom`, "Master Bedroom", 0.95, `:RoomSelector`.
6. **CQ5. Candidates for "Turn On Light"** (the panel query, verbatim). Ceiling / Master Bedroom / false; Lamp / Master Bedroom / false; Living Room / Living Room / true. The resolver then gives 0.94, 0.88, 0.38.
7. **CQ6. AC setpoint, mode and power.** 24, "Cool", "ON".
8. **CQ7. TV state, channel and volume.** "Standby", 1, 20.
9. **CQ8. Commands the Bedroom Ceiling Light supports.** Adjust Brightness, Turn Off, Turn On.
10. **CQ9. Risk tier of `:BedroomCeilingLight`.** `sa:LowRisk`, "Low: Autonomic".
11. **CQ10. Is 17 °C a thermal hazard?** One row: `sa:ThermalHazardRule`, `sa:HighRisk`. With 24, 18 or 30 substituted: no rows.
12. **CQ11. Presets in display order.** Night Mode, All Lights Off, Cooling Mode, Watch TV.
13. **CQ11b. Highest-risk step of each preset** (ORDER BY DESC(?rank) LIMIT 1, run per preset). Night Mode Medium, All Lights Off Low, Cooling Mode Medium, Watch TV Low.
14. **CQ12. What "All Lights Off" would change.** One row: `:LivingRoomLight` `sa:On` → `sa:Off`.
15. **CQ13. Fan power and optional speed.** "OFF", with ?speed unbound.
16. **CQ14. ErrP history for (Ceiling, Turn On, Master Bedroom).** No rows at reset. After [Simulate ErrP], one row whose `sa:posterior` equals **the detector's q (> t\*)**, not a scripted 0.91 (fixes X3).
17. **CQ15. Last 10 confirmed light activations.** H01…H10, counts 6/2/2, so f_R = 0.6 / 0.2 / 0.2.

## 8. Cross-check conflicts resolved here

- **X1/X2:** one subtractive, posterior-weighted, decaying, context-scoped penalty. Plus the second-best rule as a guaranteed fallback, made consistent by the λ·t\* > margin invariant.
- **X3:** q comes from the detector.
- **X4:** s = S × P(room).
- **X5:** the bound is disclosed; auto-rollback is kept per the README.
- **X6:** alert only for caregiver-approved actions.
- **X7:** one cost table, with Chow thresholds of 0.75 and 0.85.
- **X8:** tiers per device, presets computed as max.
- **X9:** named "Validate-focused" (tonight) and "Pre-focus suggestion" (post-mid-eval).
- **X11:** no margin rule.
- **G9:** concrete ranges in §6.

## 9. Post-mid-eval (all behind config keys, no code fork)

- n3 Node test oracle (needs install approval);
- SPARQL arithmetic;
- KG pre-focus on Screen 3;
- advisory-band escalation;
- TV volume > 80% → Medium;
- penalty disconfirmation;
- the multiplicative Bayesian penalty as a comparator;
- per-action ErrP prior π = 1 − c;
- confirm-token confidence gate;
- the TurnOn-at-hazardous-setpoint rule;
- graded `bot:adjacentZone` spatial scoring;
- calibrating s on logged interactions;
- a generic KG-view layout. Tonight the view uses hand-placed coordinates for 2 rooms, 6 devices and the patient, highlighting the winner and runner-up.

**Config keys tonight:**
- `SA.config.kg = {weights: {type: .35, space: .30, state: .20, recency: .15}, recencyWindow: 10, recencyEmpty: 'uniform', roomConfidence: .95, errp: {lambda: .30, halfLifeMin: 60, escalateAt: .05}}`
- `SA.config.policy = {combine: 'product', reject: {cMin: .50, nMin: .40}, execute: {low: .75, medium: .85}, noopGuard: true, maxAlternativesPerEpisode: 1, approvedHighErrp: 'alert', thermal: {min: 18, max: 30, advisory: [20, 26], advisoryEscalates: false}}`

**Files:**
- `kg/silentassist.ttl`, `kg/tests/*.test.js`
- `POC/js/kg/{ontology,turtle,triplestore,sparql-parser,sparql-eval,resolver,kg-view}.js`
- `POC/js/policy/{risk,policy}.js`

**Main residual risk.** The examiner may still read the seeded history and the 0.95 as tuning. The mitigation is to state openly, in the panel expander and in `docs/kg.md`, which values the README pins (0.06 shortfall, 0.95) and which are free choices (the weight split, 6/10), with the live sensitivity demonstration.