# ADR 0003: CogLign knowledge graph, resolver, and the confidence-gated policy

**Status:** Accepted 2026-10-14. This is the judge ruling on the `kg-and-policy` debate. Transcript: `docs/debate/kg-and-policy.md`. Verbatim inputs: `docs/debate/_inputs/kg-and-policy.md`.

**Scope:** This ADR covers:
- ontology alignment and scope;
- the Turtle/SPARQL engine;
- resolver scoring, the gate and the no-op guard;
- what "SPARQL Match 0.94" and "Semantic Context 89%" mean;
- how n and s are combined, and the decision thresholds;
- risk tiers and the thermal rule;
- every device fact the README leaves open;
- tier labels;
- the competency questions.

**Plan:** Plan B tonight. The mid evaluation is 2026-10-15 in the morning, and the build budget is about 2–3 hours. Constraints:
- `file://` only, with classic IIFE modules on `window.SA`;
- offline and local only;
- README.md must be matched exactly.

---

## Context

**What the README fixes:**
- Screen 2 subtitles:
  - "1 Active of 3"
  - "Ceiling Fan: OFF"
  - "24°C • Cool Mode"
  - "Smart TV: Standby"
  - "4 Multi-Device Semantic Routines"
- Screen 3 states:
  - Bedroom Ceiling Light OFF
  - Bedside Lamp OFF
  - Living Room Light ON
- The Screen 4 panel:
  - `Turn On Light`
  - `Master Bedroom (Active User Room)`
  - `:BedroomCeilingLight`
  - `Score 0.94`
  - Neural MI (92%), Semantic Context (89%), Risk Tier (Low: Autonomic)
  - **EXECUTE**, plus the CONFIRM / REJECT / CAREGIVER APPROVAL alternatives
- The four preset names.
- The thermal hazard used for caregiver approval. Its numbers (< 18 / > 30 °C) come from the PROMPT and the briefs and are kept unchanged.

**What the README leaves open:** device rooms, preset contents, ranges, steps, and every number behind the panel.

**ADR 0002 (ErrP) already fixes:**
- **D11:** π = 1 − c; canonical value 0.181.
- **D12:** policy thresholds are declared constants and the policy takes **no ErrP credit**.
- **D16:** caregiver-approved High actions are log-only.
- **D18:** one multiplicative, ranking-only penalty, `M(d) = max(0.5, min(1, Π Λ^(−γ·2^(−n/20))))`. The h-flag is M < 0.9 → CONFIRM. M never touches `s`. The subtractive KG penalty is rejected.
- **D19:** no scripted posterior.

This ADR must be consistent with all of these, and it is.

**Already built:** `POC/js/kg/turtle.js` (377 lines), `triplestore.js` (310 lines, SPO/POS/OSP indexes, rdfs9/11 materialisation) and `sparql.js` (448 lines).

**The debate was degraded.**
- Only one agent's output survived: **Proposer B (demo-first) — opening position**.
- **Proposer A (rigor-first) failed.** It filed no opening and no rebuttal.
- **The Critic failed.** It filed no critique.
- **All rebuttal rounds failed.**
- Every failure was a network error in the workflow run.
- The "critic" references inside B's text (S10, "§2 hard-coding by another name") point to the Phase-1 `_cross-check.md` and research critique, not to a critique of this debate.

**How the judge compensated.** No adversarial round took place, so the judge acted as critic:
- checked every B number against the briefs and ADR 0002;
- re-ran the arithmetic in Node;
- overruled B wherever B contradicts ADR 0002, which B was written without.

The rulings below therefore carry **less adversarial testing than ADR 0002**. The Revisit conditions reflect this.

---

## Decision

### A. Ontology and engine

**D1. Alignment.**

| Vocabulary | IRI | Use |
|---|---|---|
| SAREF v4.1.1 | `https://saref.etsi.org/core/` | State / StateOfInterest / StateValue pattern |
| BOT | `https://w3id.org/bot#` | Building → Storey → Space, `bot:containsElement` |
| SOSA 2017 | `http://www.w3.org/ns/sosa/` | Room-selector observations and ErrP observations only |
| `sa:` extension | `https://silentassist.example/ns#` | Our TBox |
| `:` instances | `https://silentassist.example/home#` | Instance data, so the README literal `:BedroomCeilingLight` appears as is |
| `unit:` | `https://qudt.org/2.1/vocab/unit/` | Units |

- **On/off terms.** We mint `sa:On`, `sa:Off` and `sa:Standby`. The terms `saref:OnState`, `OnOffState`, `LightingDevice` and `OnCommand` are deleted in v4.1.1, so we never use them.
- **SAREF4BLDG** is not used.
- **Copy, don't import.** Only two upstream axioms are copied: `saref:Actuator ⊑ saref:Device` and `saref:Appliance ⊑ saref:Device`.
- **BOT direction.** `bot:hasElement` is never asserted.

**D2. Scope.**
- Start from KG-brief §2.6, then apply the changes in D13–D16.
- Target size is about 470 asserted triples.
- Subclass typing is **materialised at load** (`SA.kg.store.create(triples, {subClassOf: true})`), so no property paths are needed.
- **Risk tiers attach to the device**, using the brief's property name `sa:hasRiskTier`. They are not attached to commands, because one `sa:TurnOn` IRI cannot be Low for a light and Medium for the AC.
- `sa:ThermalHazardRule` has:
  - `sa:appliesToCommand sa:SetTemperature`
  - `sa:minSafe 18`
  - `sa:maxSafe 30`
  - `sa:tierIfViolated sa:HighRisk`
- Preset tiers are **not stored**. They are computed (D11).

**D3. Source of truth.**
- `SA.store` holds device state and is authoritative. The KG is a single-writer mirror, updated on `device:stateChanged`.
- `SA.errp.memory` (ADR 0002) holds the penalty records. The KG mirrors them as `sa:ErrPFeedback` nodes.
- The selftest asserts that store and KG agree after every actuation and after reset.

**D4. Engine.**
- **Keep the built engine** (`turtle.js`, `triplestore.js`, `sparql.js`) as it is. Do not strip features tonight.
- B's proposals to split the code into `sparql-parser.js` + `sparql-eval.js` and to drop arithmetic are **not adopted**. The built engine already supports more than B's frozen subset, and rewriting working code the night before the evaluation is pure risk.
- **The documented subset** is the one in the file headers:
  - Turtle: prefixes, IRIs, pnames, `a`, `;` and `,`, literals with escapes, lang and datatype, numeric and boolean shorthands, comments, blank nodes. Collections and non-ASCII throw with line:col.
  - SPARQL: `SELECT [DISTINCT]` / BGP / `OPTIONAL` / `FILTER` (with §17.2 error logic) / `ORDER BY` / `LIMIT` / `OFFSET`. UNION, MINUS, BIND, VALUES, GRAPH, subqueries, aggregates, paths, CONSTRUCT, ASK and DESCRIBE throw `Unsupported SPARQL feature`.
- `sparql.js` is 48 lines over the 400-line guideline. The split goes to post-mid-eval.
- **Rejected:** N3.js (no SPARQL), Comunica (> 1 MB) and Oxigraph (an ES module plus wasm, which `file://` blocks).

**D5. New files tonight.**

| File | Role |
|---|---|
| `kg/silentassist.ttl` | Canonical source, LF only |
| `POC/js/kg/ontology.js` | Assigns `SA.kg.ontologyTTL`; byte-identical string to the TTL |
| `POC/js/kg/resolver.js` | `SA.kg.resolver` |
| `POC/js/kg/kg-view.js` | Hand-placed coordinates for 2 rooms, 6 devices and the patient; highlights the winner and runner-up |
| `POC/js/policy/risk.js` | `SA.policy.risk` |
| `POC/js/policy/policy.js` | `SA.policy.decide` |
| `kg/tests/*.test.js` | Run under plain `node` |

The tests set `globalThis.window = {}` and load the IIFEs via `vm`, the same pattern as ADR 0002 D26. They check:
- golden asserted and closed triple counts;
- 15 spot-checked triples;
- that excluded constructs throw;
- TTL ≡ `ontology.js` as raw bytes;
- all CQs (D19).

The same CQs also run under `?selftest=1`. An N3.js oracle is post-mid-eval and needs install approval.

### B. Resolver

**D6. Score.**

`S(d) = gate(d) · clamp01(0.35·f_T + 0.30·f_S + 0.20·f_X + 0.15·f_R)`

- S is rounded **once** to 4 dp and displayed with `toFixed(2)`. Tests compare against the rounded value with a tolerance of 1e-9.

**Features:**

| Feature | Value |
|---|---|
| f_T | 1 if d is typed with the category class (`sa:Light`, `sa:Fan`, `sa:AirConditioner`, `sa:Television`) |
| f_S | 1 if the active room `bot:containsElement` d, else 0 |
| f_X | 1 if the command changes d's state. For TurnOn/TurnOff: power ≠ target. For value commands: target ≠ current, after clamping to range. |
| f_R | n_d / K over the last K ≤ 10 `sa:Confirmed` executions of the same (command, device class) |

- **f_R when there is no history:** if K = 0, f_R = 1/N_candidates (uniform prior, `recencyEmpty: 'uniform'`). As a result:
  - single-candidate devices (fan, AC, TV) score S = 1.00 when f_S = f_X = 1;
  - TurnOff with no history is well defined.

**Config:** `SA.config.kg = {weights:{type:.35, space:.30, state:.20, recency:.15}, recencyWindow:10, recencyEmpty:'uniform', roomConfidence:.95}`.

**D7. Type gate.**
- The gate is a **hard** gate: it is part of the BGP (`?d a <class> ; saref:hasFunction/…`).
- f_T is also kept as a term in the score.
- Without the gate, a bedroom fan would score 0.50 for "Turn On Light".

**D8. No-op guard.**
- f_X stays soft in the score, so ranking is unaffected.
- When f_X = 0 for the **acted-on** entity, the resolver returns `noop: true` and the policy returns **REJECT**, with reason `No change: <label> is already <state>`.
- There is no actuation and no ErrP window.
- The same rule covers:
  - TV channel/volume while in Standby: `Smart TV is in Standby`;
  - AC Temp − at 16 °C or Temp + at 32 °C;
  - a preset whose every step is a no-op.

**D9. What the resolver decides: "Validate-focused".**
- The fixture the patient focused and selected on Screen 3 is the entity acted on.
- The resolver re-scores **all** gated candidates. The panel shows the acted-on entity's S, plus `KG top: <label>` when that differs.
- Whether Screen 3 pre-focuses the KG top candidate is a UX-debate matter. **Tonight there is no pre-focus.** In the canonical case it makes no difference.
- The panel renders the exact query string the resolver executed. Selftest: `panel query text === SA.kg.lastQuery`.

**D10. The honest account of 0.94.** This text goes verbatim in `docs/kg.md` and in the panel's "Why 0.94?" expander.

Canonical arithmetic:

| Candidate | f_R | S |
|---|---|---|
| Bedroom Ceiling Light | 6/10 | 0.35 + 0.30 + 0.20 + 0.15·0.6 = **0.94** (raw float 0.9399999999999998 → 0.94) |
| Bedside Lamp | 2/10 | **0.88** |
| Living Room Light | 2/10 | 0.35 + 0 + 0 + 0.03 = **0.38** (it is already ON, so f_X = 0) |

What is pinned and what is chosen:
- **Pinned by the README.** Since the ceiling light is perfect on type, space and state, the README's 0.94 fixes exactly one quantity: **w_R·(1 − f_R) = 0.06**.
- **Our free choice.** We chose (w_R = 0.15, seeded f_R = 6/10). The pair (0.20, 7/10) would hit 0.94 equally well. The history is a **synthetic 10-event seed** (6 ceiling / 2 lamp / 2 living) and is labelled "Synthetic seed history" in the UI and in TTL comments.
- **The split 0.35 / 0.30 / 0.20 is a documented design choice.** It follows the cue order type > space > state > habit. Any split with w_S + w_X > 0 preserves the ranking.
- **Why this is not hard-coded:**
  - S is recomputed live from SPARQL-fetched features on every decision.
  - Sensitivity table: f_R ∈ {0.4, 0.5, 0.6, 0.7, 0.8} → S ∈ {0.91, 0.925, 0.94, 0.955, 0.97}.
  - The selftest mutates the history and asserts that S changes.
  - The demo itself moves it. After "Retry → Bedside Lamp" is confirmed: ceiling 5/10 → 0.925, lamp 3/10 → 0.895.

**ErrP penalty: per ADR 0002 D18, not B's proposal.**
- Ranking uses `S'(d) = S(d)·M(d)`. With M at its 0.5 floor, the Ceiling light goes 0.94 → 0.47 < Lamp 0.88.
- The offered alternative is the argmax excluding the rolled-back entity (second-best rule).
- **The panel always shows the unpenalised S** plus a trace line, `ErrP memory ×0.50 (ranking only)`.
- B's subtractive λ = 0.30 with a 60-minute half-life is **overruled** (D-rejected in ADR 0002).

### C. Semantic Context and the policy

**D11. The one definition of "Semantic Context".**
- **s = round2(S(acted-on entity) × P(active room))**
  - P(active room) = `sa:confidence` of the latest SOSA room observation, which is `SA.config.kg.roomConfidence = 0.95`.
  - Canonical: 0.94 × 0.95 = 0.893 → **s = 0.89 → "89%"**.
- **Why round2.** The policy consumes the displayed value, so every panel number can be reproduced by hand: `0.92 × 0.89 = 0.819`. This also keeps ADR 0002 D11's canonical π = 1 − 0.819 = **0.181 unchanged**.
- **Disclosure: 0.95 is README-pinned.** Given 0.94, the README's "89%" forces P(room) ∈ [0.9415, 0.9521]. The room selector is a simulated operator sensor, and it is labelled "simulated".
- **Presets:** s = (steps passing the KG gate) / (steps) = 1.00, displayed as `100% (explicit routine, KG-validated n/n steps)`. The room is not used.
- **Single-candidate devices in the active room:** s = 0.95.
- **Operator override.** In Scripted mode the semantic slider initialises to the KG-computed s. If the operator moves it, the label becomes `Semantic Context (operator override)` and the policy uses the override.
- **Penalty.** The ErrP penalty M never enters s (ADR 0002 D18).
- **Rejected:** the softmax posterior (it needs a magic T ≈ 0.0287 and is fragile), a scripted constant, and the unrounded s = 0.893.

**D12. Combination: c = round4(n × s)** (product).
- n is the neural slider or the calibrated MI softmax, taken to 2 dp.
- **Caveat stated in the docs:** s is a heuristic score scaled by a simulated room confidence, not a calibrated probability. c is therefore a "monotone confidence", not a probability.
- **Rejected:** log-odds (overconfident, 0.989), weighted mean (compensatory) and min.

**D13. Decision procedure.** `SA.policy.decide(ctx) → {decision, reason, trace}`. The rules run in order; the first match wins.
1. `noop` → **REJECT** (`No change: …`).
2. n < 0.40 **or** c < 0.50 → **REJECT** (`Not sure, please try again`).
3. tier = High → **CAREGIVER APPROVAL**.
4. tier = Medium: c ≥ 0.85 → **EXECUTE**, else **CONFIRM**.
5. tier = Low: c ≥ 0.75 → **EXECUTE**, else **CONFIRM**.
6. If the decision is EXECUTE **and** h-flag (ADR 0002: M(entity, command, room) < 0.9) → **CONFIRM**.

- There is no top-2 margin rule. Any margin threshold above 0.06 would break the canonical case.

**Config:**

```
SA.config.policy = {combine:'product', reject:{cMin:.50, nMin:.40}, execute:{low:.75, medium:.85},
  noopGuard:true, maxAlternativesPerEpisode:1, approvedHighErrp:'log',
  thermal:{min:18, max:30, advisory:[20,26], advisoryEscalates:false}}
```

**Where the thresholds come from.** They are **declared constants**, consistent with ADR 0002 D12:
- They follow UX D2 and come from Chow's rule c > 1 − C_confirm / C_err, with C_confirm = 1.17 tokens (UX design B) and assumed C_err of 5 (Low) and 10 (Medium). That gives 0.77 and 0.88.
- They are **rounded down to 0.75 / 0.85, and this is disclosed.** Rounding down keeps a 0.069 canonical margin and keeps the in-band AC steps (c = 0.874) at EXECUTE.
- B's derivation, which credits the ErrP safety net (TPR 0.466 → 0.753), is **rejected**. ADR 0002 D12 says the policy takes no ErrP credit.

**D14. Values the demo will hit.** Verified in Node. Canonical s = 0.89.

| Case | n | s | c | Tier | Decision |
|---|---|---|---|---|---|
| Canonical (README) | 0.92 | 0.89 | 0.819 | Low | **EXECUTE** |
| Neural slider 80 | 0.80 | 0.89 | 0.712 | Low | **CONFIRM** |
| Neural slider 75 | 0.75 | 0.89 | 0.668 | Low | **CONFIRM** |
| Neural slider 60 | 0.60 | 0.89 | 0.534 | Low | CONFIRM |
| Neural slider 55 | 0.55 | 0.89 | 0.490 | Low | **REJECT** |
| Neural slider 45 | 0.45 | 0.89 | 0.401 | Low | **REJECT** |
| Neural slider 35 | 0.35 | — | — | — | **REJECT** (neural floor) |
| Semantic slider 60 (override) | 0.92 | 0.60 | 0.552 | Low | CONFIRM |
| Retry → Bedside Lamp | 0.92 | 0.84 (0.88×0.95) | 0.773 | Low | **EXECUTE** (margin 0.023; `[Reset Demo]` must restore sliders to 92) |
| AC Temp − within 18–30 | 0.92 | 0.95 | 0.874 | Medium | **EXECUTE** |
| AC Temp − 18 → 17 | 0.92 | 0.95 | 0.874 | High | **CAREGIVER APPROVAL** |
| Living Room Light Turn Off, from the bedroom | 0.92 | 0.57 (S 0.60) | 0.524 | Low | CONFIRM |
| Re-select Ceiling after a false rollback | 0.92 | 0.89 | 0.819 | Low | EXECUTE → h-flag → **CONFIRM** (ADR 0002 selftest) |
| Ceiling Turn On while already ON | — | — | — | — | **REJECT** (no-op) |

**D15. Interaction rules.**
- **CONFIRM** uses UX design B: SELECT confirms, BACK cancels, NEXT/PREV re-prompt. The confirm-token confidence gate is post-mid-eval.
- **Presets:** the diff preview is the confirm step. EXECUTE and CONFIRM both commit on the single SELECT on the preview.
- **Caregiver-approved High actions:** the ErrP is observed **log-only**, per ADR 0002 D16. B's "alert only" is overruled.
- **Rollback compensations** bypass the policy. A compensation that would *enter* a hazardous state goes to CAREGIVER.
- **Preset rollback** is atomic: the steps are compensated in reverse order, comparing state before each compensation.

### D. Risk tiers and the thermal rule

**D16. Tier map.** Stored as `sa:hasRiskTier` on the device.

| Device / action | Tier |
|---|---|
| Lights: Turn On, Turn Off, Adjust Brightness | **Low** |
| Ceiling Fan: Off, Low, Medium, High | **Low** |
| Smart TV: Power, Channel ±, Volume ± | **Low** (volume > 80% → Medium is post-mid-eval) |
| Air Conditioner: Power, Mode, Temp ± to a setpoint in [18, 30] °C | **Medium** |
| Air Conditioner: any setpoint < 18 or > 30 °C (strict; 18 and 30 are safe) | **High** → CAREGIVER APPROVAL |

- **The thermal rule** is applied by `SA.policy.risk` as an overlay on every `SetTemperature`, whether it comes from a device action or a preset step, and whatever the AC's power state.
- **Advisory band.**
  - Setpoints in [18, 20) or (26, 30] °C produce a one-line panel and trace advisory, also appended to the spoken result: `Advisory: outside the 20–26 °C comfort band for impaired thermoregulation`.
  - There is **no tier change** (`advisoryEscalates: false`). The AC is already Medium across the band.
- **Preset tier = max over its non-no-op steps, computed** (with the thermal overlay):

| Preset | Tier |
|---|---|
| Night Mode | **Medium** |
| All Lights Off | **Low** |
| Cooling Mode | **Medium** |
| Watch TV | **Low** |

These agree with ADR 0002 D12's provisional map.

**D17. Tier labels.**
- `Low: Autonomic` (README exact)
- `Medium: Guarded` (not "Confirm", because Medium still EXECUTEs at c ≥ 0.85)
- `High: Caregiver Approval`

### E. Device facts the README leaves open

**D18. Initial state and behaviour.** Stored in `SA.config.initialState` and mirrored in the TTL. `[Reset Demo]` restores all of it, clears ErrP memory, restores sliders to n = 92 and room = Master Bedroom, and sets the demo clock to `2026-03-01T21:00:00`.

**Rooms.**
- There are two rooms, `:MasterBedroom` ("Master Bedroom") and `:LivingRoom` ("Living Room"), on `:GroundFloor` of `:Home`.
- **Master Bedroom** contains `:BedroomCeilingLight`, `:BedsideLamp`, `:CeilingFan`, `:AirConditioner` and **`:SmartTV`**.
- **Living Room** contains `:LivingRoomLight` only.
- This **changes the KG brief, which put the TV in the Living Room.** The users are bed-bound, and otherwise every TV command would CONFIRM.
- Room selector:
  - Options: Master Bedroom / Living Room.
  - Confidence: 0.95.
  - Initial room: Master Bedroom.

**Lights.**

| Fixture | Display order | Power | Brightness |
|---|---|---|---|
| Bedroom Ceiling Light | 1 | OFF | 100% |
| Bedside Lamp | 2 | OFF | 100% |
| Living Room Light | 3 | ON | 100% |

- Adjust Brightness levels: {25, 50, 75, 100}%.
- Adjust Brightness on an OFF light turns it ON at that level.
- The presentation of the levels is a UX-debate matter. The default is a sub-list of the 4 levels + Back.
- Hub subtitle: `N Active of 3`.

**Ceiling Fan.**
- Initial state: power OFF, speed unbound.
- Actions: Off, Low, Medium, High, Back.
- A speed action sets power ON plus that speed. Off keeps the last speed.
- Subtitle: `Ceiling Fan: OFF`, or `Ceiling Fan: <Speed>` when running.

**Air Conditioner.**
- Initial state: **ON**, Cool, **24 °C**.
- Actions: Turn Off / Turn On (the label toggles), Temp −, Temp +, Mode: Cool, Mode: Fan, Mode: Dry, Back.
- Setpoint range **16–32 °C, step 1 °C, clamped, no wrap**.
- From 24 °C:
  - the 6th Temp − press reaches 18 (Medium, EXECUTE);
  - the 7th reaches **17 (High → CAREGIVER)**.
- Focus stays on Temp ± after a press.
- Setpoint and mode may be changed while the AC is OFF.
- Subtitle: `24°C • Cool Mode`, or `OFF • 24°C`.

**Smart TV.**
- Initial state: **Standby**, channel **1**, volume **20%**.
- Actions: Power (Standby ↔ ON), Channel −, Channel +, Volume −, Volume +, Back.
- Channels run 1–99 and wrap 99 ↔ 1.
- Volume runs 0–100, step 5, clamped.
- Channel or volume changes in Standby are no-ops (D8).
- Subtitle: `Smart TV: Standby`, or `Smart TV: ON • Ch N`.

**Presets.** Display order 1–4. Diffs are computed against the current state, and no-op steps are hidden.

| Preset | Steps | Diff from reset |
|---|---|---|
| Night Mode | Bedroom Ceiling Light OFF; Living Room Light OFF; Smart TV Standby; AC setpoint **25 °C** | Living Room Light ON→OFF; AC 24→25 °C |
| All Lights Off | All three lights OFF | Living Room Light ON→OFF |
| Cooling Mode | AC ON, Cool, 22 °C; Ceiling Fan Medium | AC 24→22 °C; Fan OFF→Medium |
| Watch TV | Smart TV ON; Bedroom Ceiling Light OFF; Bedside Lamp ON at 25% | TV Standby→ON; Bedside Lamp OFF→ON (25%) |

**Seed history.**
- H01–H10 are `sa:ActionExecution` with `sa:outcome sa:Confirmed`, TurnOn, as in KG-brief §2.6: 6 ceiling / 2 lamp / 2 living.
- H10, the oldest, is a ceiling event, so a later confirmed ceiling activation keeps 6/10.
- A confirmed execution is appended only on an ErrP `keep` outcome. Rollback and flag outcomes are not appended.

**ErrP mirror nodes.**
- Each observation is `sa:ErrPObservation` (⊑ `sosa:Observation`), with `sosa:madeBySensor :ErrPDetector`.
- Observations with decision `rollback`/`flag` and Λ > 1 are additionally typed `sa:ErrPFeedback`. Their properties are `sa:posterior`, `sa:likelihoodRatio`, `sa:prior`, `sa:interactionsSince`, `sa:aboutEntity`, `sa:command` and `sa:inRoom`.
- The values come from the detector; nothing is scripted.

**Demo-script consequence.** A successful step 1 leaves the ceiling ON, so Turn On would then be a no-op REJECT. The Live Demo Script presses `[Reset Demo]` before the rollback step and before the thermal step.

### F. Competency questions

**D19. Final CQ list (16).** These go in `docs/kg.md` and `kg/tests/cq.test.js`, and also run in `?selftest=1`. Expected answers are for the reset state.

| # | Question | Expected answer |
|---|---|---|
| CQ1 | Light fixtures in display order, with power state | Ceiling OFF, Lamp OFF, Living ON. The hub's "1 Active of 3" is computed from this. |
| CQ2 | Devices in the active room, ORDER BY label | Air Conditioner, Bedroom Ceiling Light, Bedside Lamp, Ceiling Fan, Smart TV |
| CQ3 | Lights not in the active room (OPTIONAL + `!BOUND`) | `:LivingRoomLight` |
| CQ4 | Where the user is, and the evidence | `:MasterBedroom`, "Master Bedroom", 0.95, `:RoomSelector` |
| CQ5 | Gated candidates for "Turn On Light" (the panel query, verbatim) | 3 rows: room and power for each. Resolver result: 0.94 / 0.88 / 0.38. |
| CQ6 | AC power, mode, setpoint | ON, Cool, 24 |
| CQ7 | TV power, channel, volume | Standby, 1, 20 |
| CQ8 | Fan power and OPTIONAL speed | OFF, `?speed` unbound |
| CQ9 | Commands the Bedroom Ceiling Light supports | Adjust Brightness, Turn Off, Turn On |
| CQ10 | Risk tier of `:BedroomCeilingLight` | `sa:LowRisk`, "Low: Autonomic" |
| CQ11 | Is a setpoint of 17 °C a thermal hazard? (parameterised via `opts.bindings`) | One row: `sa:ThermalHazardRule`, `sa:HighRisk`. For 18, 24 and 30: no rows. |
| CQ12 | Presets in display order | Night Mode, All Lights Off, Cooling Mode, Watch TV |
| CQ13 | Highest-tier step of a preset (ORDER BY DESC(?rank) LIMIT 1, run per preset) | Medium, Low, Medium, Low |
| CQ14 | What "All Lights Off" would change | One row: `:LivingRoomLight` `sa:On` → `sa:Off` |
| CQ15 | ErrP feedback for (Ceiling, TurnOn, Master Bedroom) | No rows at reset. After `[Simulate ErrP]`: one row whose `sa:posterior` equals the detector's q (> t*). |
| CQ16 | Last 10 confirmed light activations | H01–H10, counts 6/2/2, so f_R = 0.6 / 0.2 / 0.2 |

B's "active lights" CQ is dropped; it is derived from CQ1. The other B CQs are renumbered as above.

---

## Rejected alternatives

| Alternative | Reason |
|---|---|
| Subtractive KG penalty λ·q·2^(−Δt/h) (Proposer B; KG brief D11) | Already rejected by ADR 0002 D18: wall-clock units, and nondeterministic across resets. The multiplicative, ranking-only M(d) is used instead. |
| B's h-flag "active penalty ≥ 0.05" | Replaced by ADR 0002's M < 0.9. |
| B's EXECUTE threshold derived with ErrP credit (0.466 TPR) | Contradicts ADR 0002 D12, which says the policy takes no ErrP credit. The 0.75/0.85 values are kept as declared constants with the UX Chow derivation. |
| "Alert only" for caregiver-approved High actions | ADR 0002 D16 says log-only tonight. |
| Unrounded s = 0.893 → c = 0.8216 | Panel arithmetic would not be reproducible from the displayed numbers, and it would shift ADR 0002's canonical π from 0.181 to 0.178 (re-export churn) for no benefit. |
| Softmax posterior for s (UX D3a) | Needs a tuned T ≈ 0.0287 and is sensitive to it (T = 0.03 → 0.881). |
| Scripted constant 0.89 | Has no meaning in Replay, and is hard-coding. |
| Splitting `sparql.js` / dropping SPARQL arithmetic tonight | The working engine already exists, so rewriting it is pure risk. The split is post-mid-eval. |
| Vendoring N3.js, Comunica or Oxigraph | No SPARQL; too large; ES modules and wasm are blocked on `file://`. |
| Tiers per command (KG brief) | One `sa:TurnOn` IRI cannot carry Low and Medium. |
| Static preset tiers in the TTL | Could contradict the device data. They are computed instead. |
| Top-2 margin rule | Any margin above 0.06 breaks the canonical EXECUTE. |
| Tightening High to 20/26 °C, or escalating the advisory band | Contradicts the README rule, and adds CONFIRM steps to the thermal demo. Kept as config for post-mid-eval. |
| AC setpoint range 18–30 | The UI must reach < 18 °C and > 30 °C to demonstrate CAREGIVER APPROVAL. |
| TV in the Living Room (KG brief) | Every TV command from the bedbound user's room would CONFIRM. |
| Night Mode setpoint 26 °C | It sits on the CIBSE TM59 bedroom-overheating edge. 25 °C is used instead. |
| KG pre-focus on Screen 3 | A UX-debate matter. It is not needed for the canonical case. |
| Medium label "Confirm" | Misleading, because Medium EXECUTEs at c ≥ 0.85. |

## Residual dissent

1. **Proposer A and the Critic never filed.** No opposing case was heard on any item. Where the judge filled the gap, ADR 0002 decided the outcome:
   - the penalty form;
   - the h-flag;
   - High-tier log-only;
   - no ErrP credit in the thresholds.

   The remaining items carry only B's case plus the judge's own check:
   - the TV room;
   - the AC range;
   - preset contents;
   - rounding s.
2. **"0.94 is tuning."** An examiner may still read the seed history and P(room) = 0.95 as curve-fitting. The mitigation is full disclosure (D10, D11):
   - what the README pins: the 0.06 shortfall and 0.95;
   - what is a free choice: the weight split and 6/10;
   - live sensitivity.

   Nothing more can be done without real interaction logs.
3. **Threshold rounding.** The Chow derivation gives 0.77 / 0.88. We use 0.75 / 0.85. The Medium rounding is what keeps in-band AC steps at EXECUTE (0.874 < 0.88). This is a demo-friendly choice, disclosed as such.
4. **c is not a probability.** s is a heuristic, so the product is a monotone confidence. Calibrating s needs logs and is post-mid-eval.
5. **The advisory band** does not change behaviour. The UX brief recommended Medium + advisory; the AC is Medium anyway, so the remaining question is only whether to escalate to CONFIRM. That needs supervisor input.

## Consequences

- Every README Screen 4 number is computed live: 0.94, 89%, Low: Autonomic, EXECUTE. The sliders reach CONFIRM (n ≤ 0.84) and REJECT (n ≤ 0.56), and the AC reaches CAREGIVER at 17 °C.
- ADR 0002 is unchanged: canonical c = 0.819 and π = 0.181 still hold. The tier map matches D12's provisional map, which is now final.
- `docs/kg.md` must carry:
  - D10's honest account and sensitivity table;
  - D11's disclosure;
  - the D4 subset;
  - the CQ table.
- **Selftests:**
  - canonical EXECUTE;
  - each D14 row;
  - KG ≡ store;
  - TTL ≡ `ontology.js`;
  - ranking flip plus second-best = Bedside (with ADR 0002);
  - no-op REJECT;
  - 17 °C → CAREGIVER;
  - 18 and 30 °C → not High.

## Tonight vs post-mid-eval

**Tonight**, in build order. Slots 1–3 cannot slip.

1. `kg/silentassist.ttl` + `POC/js/kg/ontology.js` + `kg/tests/{load,cq}.test.js`. This covers the D18 facts and the D19 CQs.
2. `POC/js/kg/resolver.js`: D6–D10, with ADR 0002 M(d) for ranking only. Also `POC/js/policy/{risk,policy}.js`: D11–D17. Config keys go in `SA.config.kg` / `SA.config.policy`.
3. Panel wiring: the README-exact labels, the "Why 0.94?" expander, the query text, the trace line `n × s = c ≥ θ (tier) → DECISION`, and the selftests.
4. `POC/js/kg/kg-view.js`, the hand-placed graph view. This slot slips first.

**Post-mid-eval:**
- N3.js Node oracle (needs approval);
- the `sparql.js` split;
- KG pre-focus;
- advisory escalation;
- TV volume > 80% → Medium;
- the confirm-token gate;
- the AC-on-at-hazardous-setpoint rule;
- graded `bot:adjacentZone` spatial scoring;
- calibration of s on logs;
- a generic graph layout.

## Revisit conditions

- **Proposer A or the Critic files late.** Re-open any item where they raise a README conflict or an ADR 0002 inconsistency. This is likely to concern D10, D11, D13 or D18.
- **The UX debate** sets a Screen 3 pre-focus, a brightness presentation, or BACK semantics. Only the UI changes; the resolver and policy do not.
- **The supervisor** asks for advisory-band escalation or tighter thermal limits. Change `SA.config.policy.thermal`, with no code change.
- **The README changes** any panel number. Re-derive the pinned quantities (D10, D11).
- **Real interaction logs** become available. Calibrate s and revisit the product rule and thresholds.
- **ADR 0002 changes** D12 or D18. Re-check D13 rule 6 and the D14 table.
