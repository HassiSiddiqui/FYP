# Debate transcript: kg-and-policy (ADR 0003)

**Date:** 2026-10-14
**Judge:** fresh, impartial judge agent
**Outcome:** ADR `docs/adr/0003-kg-and-policy.md`, Accepted

## 1. Participation (degraded debate)

| Role | Status |
|---|---|
| Proposer A (rigor-first): opening | **FAILED** (network error; nothing filed) |
| Proposer B (demo-first): opening | Filed. This is the only surviving input. |
| Critic | **FAILED** (network error; nothing filed) |
| Rebuttals (A and B) | **FAILED** (network error; nothing filed) |

**Verbatim inputs** are in `docs/debate/_inputs/kg-and-policy.md`. That file contains only Proposer B's opening position and is incorporated here by reference.

**Note on B's critic references.** B's mentions of a "critic" (spot-check S10, "§2 hard-coding by another name") refer to the Phase-1 research cross-check (`docs/research/_cross-check.md`). They do not refer to a critique filed in this debate.

**How the judge handled the missing roles.** With no opposing proposer and no critic, the judge acted as critic:
- every number B gives was re-computed in Node;
- B's position was checked against the README, the KG brief, the UX brief (§6, §7, D1–D10) and **ADR 0002**, which B was written without;
- where B conflicts with ADR 0002, ADR 0002 prevails.

## 2. Summary of Proposer B's position

Full text is in the inputs file.

- **Ontology.** SAREF v4.1.1, BOT and SOSA, plus `sa:`/`:` on `.example`. Copy, don't import. Risk tiers sit on devices; preset tiers are computed.
- **Engine.** Our own engine, split into parser and evaluator files, with SPARQL arithmetic dropped.
- **Resolver.** Linear 0.35/0.30/0.20/0.15 with a hard type gate, a uniform recency prior when there is no history, and a no-op guard (→ REJECT). "Validate-focused" mode. An honest account of 0.94: the README pins w_R(1 − f_R) = 0.06.
- **ErrP penalty.** Subtractive: λ = 0.30, 60-minute half-life, invariant λ·t* > 0.06. Second-best fallback.
- **Semantic Context.** s = S × P(room) = 0.94 × 0.95 = 0.893 → 89%.
- **Combination.** Product c = n·s, so the canonical c is 0.8216.
- **Decision rules.** noop → REJECT; n < 0.40 or c < 0.50 → REJECT; High → CAREGIVER; Medium 0.85; Low 0.75; an active penalty ≥ 0.05 escalates to CONFIRM.
- **Threshold derivation.** Takes ErrP credit (TPR 0.466) for Low.
- **Caregiver-approved High actions.** Alert only.
- **Tiers.** Lights, fan and TV Low; AC Medium; setpoint < 18 or > 30 → High. Advisory band 20–26 is text only.
- **Devices.** TV moves to the Master Bedroom. AC range 16–32, step 1. TV channel 1, volume 20%, Standby.
- **Presets.** Night Mode at 25 °C; Watch TV uses the Bedside Lamp at 25%.
- **Tier labels.** Low: Autonomic / Medium: Guarded / High: Caregiver Approval.
- **Competency questions.** 17.

## 3. Judge's verification (Node, 2026-10-14)

**Scores:**
- S(ceiling) = 0.35 + 0.30 + 0.20 + 0.15·0.6 = 0.9399999999999998 → round4 = **0.94**.
- S(lamp) = **0.88**. S(living) = **0.38**.

**Semantic Context:**
- s raw = 0.94 × 0.95 = 0.8929999999999999. round2 → **0.89**.

**Combined confidence:**
- c(canonical) = 0.92 × 0.89 = **0.8188 → EXECUTE**.

**Slider cases:**

| n | c | Decision |
|---|---|---|
| 0.80 | 0.712 | CONFIRM |
| 0.75 | 0.6675 | CONFIRM |
| 0.60 | 0.534 | CONFIRM |
| 0.55 | 0.4895 | REJECT |
| 0.45 | 0.4005 | REJECT |

**Other cases:**
- Lamp after Retry: s = round2(0.836) = 0.84, c = 0.7728 → EXECUTE.
- AC in band: 0.92 × 0.95 = 0.874. Medium, so EXECUTE; at 17 °C, High → CAREGIVER.
- Living Room Light Turn Off from the bedroom: S = 0.60, s = 0.57, c = 0.5244 → CONFIRM.

**Thresholds the sliders cross:**
- CONFIRM at n ≤ 0.84 (0.84 × 0.89 = 0.7476).
- REJECT at n ≤ 0.56 (0.56 × 0.89 = 0.4984).

**Code checked:**
- **Built engine:** `turtle.js` (377 lines), `triplestore.js` (310 lines, with rdfs9/11 materialisation) and `sparql.js` (448 lines). The SPARQL subset already includes OPTIONAL, FILTER, ORDER BY, LIMIT/OFFSET, arithmetic and `opts.bindings`.

## 4. Ruling

The ADR is authoritative. Each item's ruling is summarised here.

| # | Item | Ruling | Relation to B |
|---|---|---|---|
| 1 | Ontology alignment and scope | SAREF v4.1.1 State pattern; BOT topology; SOSA for room and ErrP evidence only; `sa:` = `https://silentassist.example/ns#`, `:` = `https://silentassist.example/home#`. No SAREF4BLDG. Two copied axioms. About 470 triples, subclass materialised at load. Tiers on devices as `sa:hasRiskTier`; preset tiers computed. Store is authoritative; KG is a mirror. | Adopted |
| 2 | Engine | Keep the built `turtle.js` / `triplestore.js` / `sparql.js` unchanged. Document the subset as implemented. The split and the removal of arithmetic are rejected for tonight; the split is post-mid-eval. New files: `ontology.js`, `resolver.js`, `kg-view.js`, `policy/{risk,policy}.js`, plus `kg/tests`. | Modified |
| 3 | Resolver scoring | S = gate·clamp01(0.35 f_T + 0.30 f_S + 0.20 f_X + 0.15 f_R), round4. f_R = n_d/K over the last ≤ 10 confirmed (command, class); uniform 1/N when K = 0. | Adopted |
| 4 | Type gate | Hard gate in the BGP, plus the f_T term. | Adopted |
| 5 | No-op guard | f_X = 0 on the acted-on entity → REJECT `No change: …`. No actuation, no ErrP window. Also covers TV in Standby, AC at range ends, and all-no-op presets. | Adopted |
| 6 | Honest account of 0.94 | README pins w_R(1 − f_R) = 0.06. The free choices are (0.15, 6/10) and the 0.35/0.30/0.20 split. "Synthetic seed history" label. Sensitivity table; selftest mutation. Text goes in `docs/kg.md` and the panel expander. | Adopted |
| 7 | ErrP penalty | **ADR 0002 D18**: multiplicative M(d), ranking only, floor 0.5. The panel shows the unpenalised S plus a trace line. Second-best offer. | **B overruled** (subtractive λ = 0.30 / 60 min) |
| 8 | Semantic Context 89% | **s = round2(S × P(room))**, P = 0.95 (README-pinned, disclosed) → 0.89. Presets: s = 1.00 (gate fraction). Single-candidate devices: 0.95. Operator override is labelled. M never enters s. | Modified (rounding added so panel arithmetic is reproducible and ADR 0002's π = 0.181 stands) |
| 9 | Combination | c = round4(n × s), product. "Monotone confidence" caveat. | Adopted |
| 10 | Thresholds | noop → REJECT; n < 0.40 or c < 0.50 → REJECT; High → CAREGIVER; Medium EXECUTE at c ≥ 0.85, else CONFIRM; Low EXECUTE at c ≥ 0.75, else CONFIRM; EXECUTE with M < 0.9 → CONFIRM. These are declared constants (UX Chow 0.77/0.88, rounded down, disclosed). No ErrP credit. No margin rule. | Values adopted; **derivation overruled** (ADR 0002 D12) |
| 11 | Canonical and slider reachability | Canonical 0.92 / 0.89 / Low → c = 0.819 → EXECUTE. CONFIRM at n ≤ 84; REJECT at n ≤ 56. | Verified |
| 12 | Caregiver-approved ErrP | Log-only. | **B overruled** (alert only; ADR 0002 D16) |
| 13 | Risk tiers | Lights, fan and TV Low. AC power, mode and in-band setpoint Medium. Setpoint < 18 or > 30 High (strict). Presets: Night Mode Medium, All Lights Off Low, Cooling Mode Medium, Watch TV Low (computed max). | Adopted |
| 14 | Thermal rule and advisory | The < 18 / > 30 → High overlay applies to every SetTemperature. Advisory band [20, 26] gives text and speech only, `advisoryEscalates: false`. | Adopted |
| 15 | Rooms | Master Bedroom: ceiling light, lamp, fan, AC, **TV**. Living Room: Living Room Light. | Adopted (changes the KG brief) |
| 16 | Lights | All brightness 100%. Levels {25, 50, 75, 100}. Adjusting an OFF light turns it ON. | Adopted |
| 17 | Fan | OFF, speed unbound. Actions Off / Low / Medium / High. | Adopted |
| 18 | AC | ON, Cool, 24 °C. Range 16–32, step 1, clamp. Temp − ×7 reaches 17 (High). Changes allowed while OFF. | Adopted |
| 19 | TV | Standby, channel 1 (1–99, wraps), volume 20% (0–100, step 5, clamp). | Adopted |
| 20 | Presets | Night Mode: ceiling OFF, living OFF, TV Standby, AC 25 °C. All Lights Off: 3 lights OFF. Cooling Mode: AC ON / Cool / 22 °C + fan Medium. Watch TV: TV ON, ceiling OFF, lamp ON 25%. | Adopted |
| 21 | Tier labels | `Low: Autonomic` / `Medium: Guarded` / `High: Caregiver Approval` | Adopted |
| 22 | Competency questions | 16 (CQ1–CQ16; see ADR D19). B's "active lights" CQ is dropped (derived from CQ1). CQ15 posterior = detector q. | Modified (17 → 16) |
| 23 | Demo script | `[Reset Demo]` before the rollback step and before the thermal step. Reset restores sliders to 92. | Adopted |

**Overall:** B's position is adopted in substance. It is overruled on three points, all to make it consistent with ADR 0002:
1. the penalty form (and with it the h-flag);
2. the threshold derivation (no ErrP credit);
3. caregiver-approved ErrP handling (log-only).

It is modified on three points:
1. s is rounded to 2 dp;
2. the engine is kept as built;
3. the CQs are cut to 16.

Residual dissent and revisit conditions are in the ADR. The main one is that Proposer A and the Critic never filed, so any late filing re-opens the affected items.
