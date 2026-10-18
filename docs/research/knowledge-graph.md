# Research brief: CogLign Knowledge Graph (SAREF / BOT / SOSA, resolver scoring, in-browser SPARQL)

**Role:** Knowledge-Graph Engineer (Phase 1). **Feeds:** Debate 4 (Knowledge graph), Debate 5 (Policy & risk), Debate 6 (Architecture). **Status:** research only. Nothing was installed or downloaded into the project.

**Honesty notes.**
- The base paper (Gao, Cao & Ma, *Sensors* 2026, 26:1730) contains **no** knowledge-graph, ontology, SPARQL or smart-home content. I grepped the full extraction `docs/research/_paper-text.txt` for "knowledge", "ontolog", "smart home", "assistive", "sparql" and "semantic" and found no matches. So everything in this brief comes from external standards and literature, cited below, or is our own design, labelled **[PROPOSAL]**.
- Everything I say about the SAREF TTL files comes from WebFetch reads of `saref.etsi.org`. That tool summarises long pages with a smaller model and truncates at about 100 kB. Claims that rest only on that are flagged where it matters.
- I checked the ontology, the Turtle subset, the SPARQL subset, every competency-question (CQ) answer and the scoring arithmetic by **running a throwaway Node prototype** in the session scratchpad. It is not project code and is not in `FYP/`. The numbers it produced are quoted as "prototype-verified".
- One WebFetch of the Pérez et al. PDF was cached automatically by the tool, outside the project. I converted it to text in the scratchpad only to quote Theorem 3.1.

---

## 0. TL;DR

1. **SAREF core is at v4.1.1** (issued 2024-10-31), namespace `https://saref.etsi.org/core/` [S1, S2]. **`saref:LightingDevice`, `saref:OnState`, `saref:OffState`, `saref:OnOffState`, `saref:OnCommand`, `saref:OffCommand`, `saref:OnOffFunction`, `saref:Switch` and `saref:LightSwitch` are not declared in v4.1.1.**
   - `LightingDevice` was moved to examples in v3.1.1.
   - The On/Off state, command, function and switch terms were deprecated in v3.2.1, and v4.1.1 says "Deprecated classes and properties have been deleted" [S2].
   - `saref:actsUpon` was renamed `saref:targets` [S2].
   - We must therefore mint our own `sa:Light`, `sa:On` and so on, and use the v4 **State / StateOfInterest / StateValue** pattern [S1, S2].
2. **BOT** (`https://w3id.org/bot#`) gives the building, storey, space and element structure. BOT explicitly lists "lights, smart sensors" and "air conditioner" as examples of `bot:Element` [S4]. **SOSA** (`http://www.w3.org/ns/sosa/`, W3C Rec 2017) models the user-location observation and the ErrP detections as `sosa:Observation`s [S5]. **SAREF4BLDG is not recommended**: it has its own space model and no light class [S3].
3. **[PROPOSAL] Resolver score.** The score is a linear, gated function with weights that sum to 1:
   `S = gate_type · clamp01(0.35·f_type + 0.30·f_space + 0.20·f_state + 0.15·f_recency − π_ErrP)`.
   - For "Turn On Light" with the user in the Master Bedroom:
     - **:BedroomCeilingLight = 0.35 + 0.30 + 0.20 + 0.15·0.6 = 0.94**
     - :BedsideLamp = 0.88
     - :LivingRoomLight = 0.38
   - The 0.94 is *explained*, not hard-coded. With Σw = 1 it equals `1 − w_rec·(1 − 0.6)`: the light matches type, room and state perfectly but accounts for only 6 of the last 10 confirmed light activations. Prototype-verified.
4. **ErrP penalty.** `π = λ·p_ErrP·2^(−Δt/h)` with λ = 0.30 and h = 60 min. After the scripted ErrP (posterior 0.91) the Ceiling Light drops to 0.67, so the **Bedside Lamp (0.88) becomes the offered alternative**. The ranking swaps back after about 131 min. Prototype-verified.
5. **Engine.** We write our own Turtle-subset parser (no blank nodes), a triple store with three hash indexes (SPO/POS/OSP) and materialised `rdfs:subClassOf` typing, and a SPARQL subset evaluator using index nested-loop joins. The prototype covers all of this in about 190 dense lines:
   - the draft ontology parses to **413 asserted triples, 447 after subclass closure**;
   - parse, index and closure take about 26 ms in Node 24;
   - each CQ runs in 0.2–4 ms.
6. **Libraries.** N3.js has no SPARQL. Comunica is at least 1 MB minified. Oxigraph needs a 4.05 MB wasm file plus an ES-module loader that `file://` blocks. **Recommendation:** our own engine, with N3.js optionally used *only* as a Node-side test oracle. That needs an install, so it needs approval.

---

## 1. Standards findings

### 1.1 SAREF core (ETSI TS 103 264)

| Fact | Value | Source |
|---|---|---|
| Latest version | **v4.1.1**, `dcterms:issued 2024-10-31`. Note `dcterms:modified 2024-03-06` is earlier than the issue date, an upstream quirk. | [S1, S2] |
| Namespace (latest) / prefix | `https://saref.etsi.org/core/` / `saref:` | [S1] |
| Version IRI | `https://saref.etsi.org/core/v4.1.1/` | [S1, S2] |
| Previous version | 3.2.1 | [S1] |
| v4.1.1 headline changes | Deprecated classes and properties deleted; `saref:DeviceKind` introduced; `saref:StateValue` and `saref:hasStateValue` introduced; `saref:hasValue` now optional on `saref:PropertyValue`; `saref:actsUpon` renamed `saref:targets` | [S2] (header changelog literals) |
| `saref:Device` | Subclass of `saref:FeatureOfInterest` and `s4syst:System`. "A tangible object designed to accomplish a particular task." | [S2] |
| `saref:Actuator` | Subclass of Device, with `owl:minCardinality 1` on `saref:controls` | [S2] |
| `saref:Appliance` | Subclass of Device. "designed to accomplish a particular task for occupant use" | [S2] |
| `saref:hasFunction` | Domain FeatureKind ∪ FeatureOfInterest (so a Device is valid), range `saref:Function` | [S2] |
| `saref:hasCommand` / `saref:isCommandOf` | Function (or FunctionOfInterest) ↔ `saref:Command` | [S2] |
| `saref:targets` / `saref:controls` | Device, Function, Command, … → FeatureKind, FeatureOfInterest, Property, State, … (`controls` is a sub-property of `targets`) | [S2] |
| `saref:hasState` | Domain FeatureKind ∪ FeatureOfInterest ∪ StateOfInterest, range `saref:State`. **Its v3.1.1 domain was `saref:Device`.** | [S2, S6] |
| `saref:hasStateOfInterest`, `saref:isStateOf`, `saref:hasStateKind`, `saref:hasStateValue`, `saref:isValueOfState` | All declared. `hasStateValue` and `isValueOfState` are **not** inverses. | [S1, S2] |
| `saref:hasPropertyOfInterest`, `saref:hasPropertyKind`, `saref:hasPropertyValue`, `saref:isValueOfProperty`, `saref:hasValue`, `saref:isMeasuredIn` | All declared. `isPropertyOfInterestOf` is functional. | [S2] |
| `saref:hasTimestamp` | DatatypeProperty, domain ProcedureExecution ∪ Profile, range `xsd:dateTime` | [S2] |
| Class list in the v4.1.1 docs | Actuation, Actuator, Appliance, Command, CommandExecution, CommandOfInterest, Commodity, Device, DeviceKind, FeatureKind, FeatureOfInterest, Function, FunctionOfInterest, Meter, Observation, Operation, OperationExecution, ProcedureExecution, Profile, Property, PropertyOfInterest, PropertyValue, Sensor, Service, State, StateOfInterest, StateValue, Task, UnitOfMeasure | [S1] |

**Terms the task asked about that do *not* exist in v4.1.1:**

| Term | Status | Source |
|---|---|---|
| `saref:LightingDevice` | Moved to examples in v3.1.1: "Some instances of saref:Device have been moved to examples: saref:WashingMachine, saref:LightingDevice …" | [S2, S6] |
| `saref:OnState`, `saref:OffState`, `saref:OnOffState` | Classes in v3.1.1 (`OnState ⊑ OnOffState ⊑ State`) [S6]. Deprecated in 3.2.1 ("may be defined as instances of saref:State in the next release"). Absent as declarations in v4.1.1, where they appear only inside changelog or example literals. | [S2, S6] |
| `saref:OnCommand`, `saref:OffCommand`, `saref:OnOffFunction`, `saref:Switch`, `saref:LightSwitch` | Defined in v3.1.1. Deprecated in v3.2.1 ("Deprecated saref:Switch for it is only an example"). Deleted in v4.1.1. | [S2, S6] |
| `saref:actsUpon` | Renamed `saref:targets` in v4.1.1 | [S2] |

**Caveat [UNVERIFIED nuance].** The v4.1.1 HTML documentation still shows an example that uses `saref:OnState a saref:StateValue ; saref:isValueOfState saref:OnOffState`, but the v4.1.1 TTL does not declare those IRIs [S1, S2]. Reusing them would mean referencing undeclared SAREF terms. I recommend minting `sa:On`, `sa:Off` and `sa:Standby` in our namespace (see D1).

**SAREF v4 state pattern** (from the official example [S1]):

```turtle
ex:OnOffState a saref:State .                                   # the state "kind"
saref:OnState a saref:StateValue ; saref:isValueOfState saref:OnOffState .
<switch> saref:hasStateOfInterest <switch#btn1> .
<switch#btn1> a saref:StateOfInterest ; saref:isStateOf <switch> ; saref:hasStateValue saref:OnState .
```

The property-value example in [S1] is `[] a saref:PropertyValue ; saref:hasValue 22.7 ; saref:isMeasuredIn <https://qudt.org/2.1/vocab/unit/DEG_C>`.

### 1.2 SAREF4BLDG

- v2.1.1, namespace `https://saref.etsi.org/saref4bldg/`, prefix `s4bldg:`, published 2025-04-24 per its page [S3].
- Its spaces are `s4bldg:BuildingSpace ⊑ geo:SpatialThing`, linked with `s4bldg:hasSpace`, `s4bldg:isSpaceOf` and `s4bldg:contains`.
- It has **no LightingDevice, Light or LightFixture class**. The nearest is `s4bldg:Lamp`, whose superclass I could not read **[UNVERIFIED]**. It has `s4bldg:Fan`. It has no air-conditioner or unitary-equipment class [S3].
- BOT publishes an alignment module to SAREF4BLDG [S4].
- **Conclusion.** S4BLDG adds IFC-derived product classes we do not need, and a second space model that competes with BOT. Do not import it. If we want, cite the BOT alignment as the bridge.

### 1.3 BOT (Building Topology Ontology, W3C LBD CG)

- Namespace `https://w3id.org/bot#`, prefix `bot`. Status: Community Group draft. The page cites revision v0.3.2 [S4].
- **Classes:** `bot:Zone` with subclasses `bot:Site`, `bot:Building`, `bot:Storey` and `bot:Space`; `bot:Element`; `bot:Interface`. Zone, Element and Interface are pairwise disjoint [S4].
- **Properties:**
  - `bot:containsZone` (transitive) has sub-properties `bot:hasBuilding`, `bot:hasStorey` and `bot:hasSpace`.
  - `bot:hasElement` (Zone → Element) has sub-properties **`bot:containsElement`**, `bot:adjacentElement` and `bot:intersectingElement`. BOT says `hasElement` is "not to be stated explicitly, but to be inferred from its sub-properties".
  - `bot:adjacentZone` is symmetric.
  - `bot:hasSubElement` links Element → Element [S4].
- **Fit for us.** The `bot:Element` examples include "walls, doors, pipes, heaters, lights, smart sensors, tables, chairs" and "air conditioner" [S4]. So `sa:Light ⊑ bot:Element` is idiomatic BOT. We assert `bot:containsElement` and never `bot:hasElement`.

### 1.4 SOSA / SSN

- W3C Recommendation, 19 Oct 2017. Namespaces: `http://www.w3.org/ns/sosa/` and `http://www.w3.org/ns/ssn/` [S5].
- A "2023 Edition" is still a **Working Draft**, with snapshots through Sept 2026. Its version IRIs are `…/sosa/2023/` and `…/ssn/2023/` [S7]. **Use the 2017 namespace.**
- **Terms we use:**
  - `sosa:Sensor` and `sosa:Observation`;
  - `sosa:madeBySensor`;
  - `sosa:hasFeatureOfInterest`;
  - `sosa:observedProperty`, with `sosa:ObservableProperty`;
  - `sosa:hasResult`;
  - `sosa:resultTime` (`xsd:dateTime`);
  - `sosa:hasSimpleResult`, which takes a literal, so we use `sosa:hasResult` when the result is an IRI such as a room [S5].
- **Why SOSA at all.** It gives a standard shape to the two pieces of *evidence* the resolver consumes:
  1. "the user is in the Master Bedroom", observed by the operator's room selector with confidence 0.95;
  2. "an ErrP was detected after execution X", with posterior *p*, peak amplitude −8.4 µV and channel FCz.
  
  SAREF also has an `Observation` class [S1]. SOSA is the W3C/OGC standard, though, and it is what the ErrP literature's "sensor" framing maps to. See D2.

---

## 2. Ontology design [PROPOSAL]

### 2.1 Namespaces

| Prefix | IRI | Why |
|---|---|---|
| `saref:` | `https://saref.etsi.org/core/` | SAREF v4.1.1, latest namespace [S1] |
| `bot:` | `https://w3id.org/bot#` | [S4] |
| `sosa:` | `http://www.w3.org/ns/sosa/` | [S5] |
| `unit:` | `https://qudt.org/2.1/vocab/unit/` | Same form as SAREF's own example [S1]. The canonical QUDT form `http://qudt.org/vocab/unit/` is also common **[UNVERIFIED which QUDT prefers today]**. |
| `sa:` | `https://silentassist.example/ns#` | Our TBox. `.example` is a TLD reserved by RFC 2606 [S8], so the IRI never collides with a real domain and we publish nothing. A `w3id.org` IRI would require a public pull request, which breaks the local-only rule. |
| `:` | `https://silentassist.example/home#` | Instance data. Gives the README's literal `:BedroomCeilingLight` |

We do **not** import SAREF, BOT or SOSA. We copy only the two upstream axioms the queries need: `saref:Actuator ⊑ saref:Device` and `saref:Appliance ⊑ saref:Device`. That keeps the browser KG at about 450 triples.

### 2.2 Classes

| Class | Superclasses | Note |
|---|---|---|
| `sa:Light` | `saref:Actuator`, `bot:Element` | Replaces the removed `saref:LightingDevice`. `sa:hubLabel "Lights"`. |
| `sa:CeilingLight`, `sa:Lamp` | `sa:Light` | Used for display and future type grading. Both have `f_type = 1` for the intent "Light". |
| `sa:Fan` ⊐ `sa:CeilingFan` | `saref:Actuator`, `bot:Element` | Hub card "Fans" |
| `sa:AirConditioner` | `saref:Appliance`, `bot:Element` | Hub card "Air Conditioner" |
| `sa:Television` | `saref:Appliance`, `bot:Element` | Hub card "TV & Media" |
| `sa:Preset` | (none) | Hub card "Presets". Has steps (`sa:hasStep`). |
| `sa:RiskTier`, `sa:RiskRule` | (none) | Extension: risk |
| `sa:User` | (none) | Extension: user context |
| `sa:ActionExecution` | `saref:CommandExecution` | One per executed or rolled-back action. Carries the history used for recency. Whether CommandExecution ⊑ ProcedureExecution is **[UNVERIFIED]**; it matters only for the domain of `saref:hasTimestamp`. |
| `sa:ErrPObservation` | `sosa:Observation` | Extension: ErrP feedback history |
| `sa:VirtualSensor` | `sosa:Sensor` | The operator room selector and the ErrP detector, both simulated and labelled so |

### 2.3 Properties

| Property | Domain → Range | Use |
|---|---|---|
| `saref:hasFunction`, `saref:hasCommand` | Device → Function → Command | "Which actions does this device offer?" (Screen 4) |
| `saref:hasStateOfInterest`, `saref:hasStateKind`, `saref:hasStateValue` | Device → SOI → State / StateValue | Power, fan speed, AC mode |
| `saref:hasPropertyOfInterest`, `saref:hasPropertyKind`, `saref:hasPropertyValue`, `saref:hasValue`, `saref:isMeasuredIn` | Device → POI → PropertyValue → literal | Brightness %, setpoint °C, channel, volume |
| `saref:targets` | Command → State / Property | Which state or property a command changes |
| `bot:hasStorey`, `bot:hasSpace`, `bot:containsElement` | Building → Storey → Space → device | Spatial context |
| `sa:isActive` (boolean) | StateValue | On → true; Off and Standby → false. Drives state compatibility. |
| `sa:prefersActive` (boolean) | Command | TurnOn → false (prefers devices that are OFF); TurnOff → true |
| `sa:hasRiskTier` | Command / Preset → RiskTier | Default tier |
| `sa:appliesToCommand`, `sa:minSafe`, `sa:maxSafe`, `sa:tierIfViolated` | RiskRule | Thermal rule: 18 ≤ T ≤ 30 is safe (Mission §2.D) |
| `sa:activeRoom`, `sa:activeRoomConfidence` | User → Space / decimal | "Master Bedroom (Active User Room)" |
| `sa:resolvedEntity`, `sa:command`, `sa:inRoom`, `sa:outcome` (`sa:Confirmed`/`sa:RolledBack`), `saref:hasTimestamp` | ActionExecution | History for recency and the audit trail |
| `sa:aboutExecution`, `sa:posterior`, `sa:peakAmplitude`, `sa:peakChannel`, `sosa:resultTime` | ErrPObservation | ErrP feedback history |
| `sa:hasStep`, `sa:targetDevice`, `sa:targetStateValue`, `sa:targetValue` | Preset / step | Preset diff |
| `sa:displayOrder`, `sa:hubLabel`, `rdfs:label` | any | Exact README labels and ordering |

### 2.4 Modelling decisions

1. **State uses the SAREF v4 StateOfInterest pattern, not a shortcut property.** This costs a two-hop join (`?d saref:hasStateOfInterest ?s . ?s saref:hasStateValue ?v`), but it is standard-conformant and exercises real BGP joins. The alternative is in D4.
2. **No blank nodes.** Every node gets a name such as `:AirConditioner_setpoint_v`. This keeps the Turtle subset small and makes query results displayable, since there are no `_:b12` rows in the CogLign panel.
3. **Subclass typing is materialised at load** (rule rdfs9 over the transitive closure of rule rdfs11), so `?d a saref:Device` and `?d a sa:Light` work without property paths. In the prototype this adds 34 type triples.
4. **Mutable triples.** On every state change the KG module replaces exactly one `saref:hasStateValue` or `saref:hasValue` triple. Executions and ErrP observations are only ever appended. **[Reset Demo]** reloads the canonical TTL text. Who owns state is debated in D5.
5. **Assumptions where the README is silent.** These need the user's answer (§Open questions). Each one is marked `[A]` in the table below.

### 2.5 README → KG mapping (initial state)

| README item | IRI | Room | Initial state in KG |
|---|---|---|---|
| Bedroom Ceiling Light (OFF) | `:BedroomCeilingLight` a `sa:CeilingLight` | `:MasterBedroom` | power `sa:Off`; brightness 100 % [A] |
| Bedside Lamp (OFF) | `:BedsideLamp` a `sa:Lamp` | `:MasterBedroom` | power `sa:Off`; brightness 100 % [A] |
| Living Room Light (ON) | `:LivingRoomLight` a `sa:CeilingLight` [A: ceiling vs lamp] | `:LivingRoom` | power `sa:On`; brightness 100 % [A] |
| Lights (1 Active of 3) | derived by CQ2 | (none) | 1 row of 3 |
| Ceiling Fan: OFF | `:CeilingFan` a `sa:CeilingFan` | `:MasterBedroom` [A] | power `sa:Off`; speed *unbound* [A] |
| Air Conditioner (24°C • Cool Mode) | `:AirConditioner` | `:MasterBedroom` [A] | power `sa:On` [A]; mode `sa:ModeCool`; setpoint 24 `unit:DEG_C` |
| Smart TV: Standby | `:SmartTV` a `sa:Television` | `:LivingRoom` [A] | power `sa:Standby`; channel 1 [A]; volume 20 [A] |
| Presets ×4 | `:NightMode`, `:AllLightsOff`, `:CoolingMode`, `:WatchTV` | (none) | Step contents are all [A]; see the TTL |
| "Master Bedroom (Active User Room)" | `:Patient sa:activeRoom :MasterBedroom` | (none) | confidence 0.95 [A, see §3.5] |
| "Risk Tier (Low: Autonomic)" | `sa:LowRisk rdfs:label "Low: Autonomic"` | (none) | The Medium and High labels are [A] |
| Recency history | `:H01…:H10` | (none) | 6× ceiling, 2× lamp, 2× living room; the seed is [A] |

### 2.6 Draft Turtle

The text below is prototype-verified: 175 lines and 14,534 bytes. It parses with the §4.1 subset to **413 asserted triples, 447 after subclass closure**. It is the proposed starting point for `kg/silentassist.ttl`.

```turtle
@prefix rdf:   <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs:  <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd:   <http://www.w3.org/2001/XMLSchema#> .
@prefix saref: <https://saref.etsi.org/core/> .
@prefix bot:   <https://w3id.org/bot#> .
@prefix sosa:  <http://www.w3.org/ns/sosa/> .
@prefix unit:  <https://qudt.org/2.1/vocab/unit/> .
@prefix sa:    <https://silentassist.example/ns#> .
@prefix :      <https://silentassist.example/home#> .

# ---------- 1. Upstream axioms we rely on (copied, not imported) ----------
saref:Actuator  rdfs:subClassOf saref:Device .
saref:Appliance rdfs:subClassOf saref:Device .

# ---------- 2. SilentAssist TBox (sa:) ----------
sa:Light          rdfs:subClassOf saref:Actuator , bot:Element ; rdfs:label "Light" ; sa:hubLabel "Lights" .
sa:CeilingLight   rdfs:subClassOf sa:Light ; rdfs:label "Ceiling light" .
sa:Lamp           rdfs:subClassOf sa:Light ; rdfs:label "Lamp" .
sa:Fan            rdfs:subClassOf saref:Actuator , bot:Element ; rdfs:label "Fan" ; sa:hubLabel "Fans" .
sa:CeilingFan     rdfs:subClassOf sa:Fan ; rdfs:label "Ceiling fan" .
sa:AirConditioner rdfs:subClassOf saref:Appliance , bot:Element ; rdfs:label "Air conditioner" ; sa:hubLabel "Air Conditioner" .
sa:Television     rdfs:subClassOf saref:Appliance , bot:Element ; rdfs:label "Television" ; sa:hubLabel "TV & Media" .
sa:Preset         rdfs:label "Semantic preset" ; sa:hubLabel "Presets" .
sa:ActionExecution rdfs:subClassOf saref:CommandExecution .
sa:ErrPObservation rdfs:subClassOf sosa:Observation .
sa:VirtualSensor  rdfs:subClassOf sosa:Sensor .

# States (SAREF v4.1.1 pattern: State kind + StateValue individuals)
sa:PowerState    a saref:State ; rdfs:label "Power" .
sa:On      a saref:StateValue ; saref:isValueOfState sa:PowerState ; rdfs:label "ON" ;      sa:isActive true .
sa:Off     a saref:StateValue ; saref:isValueOfState sa:PowerState ; rdfs:label "OFF" ;     sa:isActive false .
sa:Standby a saref:StateValue ; saref:isValueOfState sa:PowerState ; rdfs:label "Standby" ; sa:isActive false .
sa:FanSpeedState a saref:State ; rdfs:label "Fan speed" .
sa:SpeedLow    a saref:StateValue ; saref:isValueOfState sa:FanSpeedState ; rdfs:label "Low" ;    sa:level 1 .
sa:SpeedMedium a saref:StateValue ; saref:isValueOfState sa:FanSpeedState ; rdfs:label "Medium" ; sa:level 2 .
sa:SpeedHigh   a saref:StateValue ; saref:isValueOfState sa:FanSpeedState ; rdfs:label "High" ;   sa:level 3 .
sa:ACModeState a saref:State ; rdfs:label "AC mode" .
sa:ModeCool a saref:StateValue ; saref:isValueOfState sa:ACModeState ; rdfs:label "Cool" .
sa:ModeFan  a saref:StateValue ; saref:isValueOfState sa:ACModeState ; rdfs:label "Fan" .
sa:ModeDry  a saref:StateValue ; saref:isValueOfState sa:ACModeState ; rdfs:label "Dry" .

# Property kinds
sa:Brightness        a saref:Property ; rdfs:label "Brightness" .
sa:TargetTemperature a saref:Property ; rdfs:label "Setpoint" .
sa:Channel           a saref:Property ; rdfs:label "Channel" .
sa:Volume            a saref:Property ; rdfs:label "Volume" .

# Functions and command kinds
sa:OnOffFunction    a saref:Function ; saref:hasCommand sa:TurnOn , sa:TurnOff .
sa:DimmingFunction  a saref:Function ; saref:hasCommand sa:SetBrightness .
sa:FanSpeedFunction a saref:Function ; saref:hasCommand sa:SetFanSpeed .
sa:ThermostatFunction a saref:Function ; saref:hasCommand sa:SetTemperature .
sa:ACModeFunction   a saref:Function ; saref:hasCommand sa:SetMode .
sa:ChannelFunction  a saref:Function ; saref:hasCommand sa:ChannelUp , sa:ChannelDown .
sa:VolumeFunction   a saref:Function ; saref:hasCommand sa:VolumeUp , sa:VolumeDown .

sa:TurnOn  a saref:Command ; rdfs:label "Turn On" ;  saref:targets sa:PowerState ; sa:prefersActive false ; sa:hasRiskTier sa:LowRisk .
sa:TurnOff a saref:Command ; rdfs:label "Turn Off" ; saref:targets sa:PowerState ; sa:prefersActive true ;  sa:hasRiskTier sa:LowRisk .
sa:SetBrightness  a saref:Command ; rdfs:label "Adjust Brightness" ; saref:targets sa:Brightness ; sa:hasRiskTier sa:LowRisk .
sa:SetFanSpeed    a saref:Command ; rdfs:label "Set Fan Speed" ; saref:targets sa:FanSpeedState ; sa:hasRiskTier sa:LowRisk .
sa:SetTemperature a saref:Command ; rdfs:label "Set Temperature" ; saref:targets sa:TargetTemperature ; sa:hasRiskTier sa:LowRisk .
sa:SetMode        a saref:Command ; rdfs:label "Set Mode" ; saref:targets sa:ACModeState ; sa:hasRiskTier sa:LowRisk .
sa:ChannelUp   a saref:Command ; rdfs:label "Channel +" ; saref:targets sa:Channel ; sa:hasRiskTier sa:LowRisk .
sa:ChannelDown a saref:Command ; rdfs:label "Channel -" ; saref:targets sa:Channel ; sa:hasRiskTier sa:LowRisk .
sa:VolumeUp    a saref:Command ; rdfs:label "Volume +" ;  saref:targets sa:Volume ;  sa:hasRiskTier sa:LowRisk .
sa:VolumeDown  a saref:Command ; rdfs:label "Volume -" ;  saref:targets sa:Volume ;  sa:hasRiskTier sa:LowRisk .

# Risk tiers and the thermal rule
sa:LowRisk    a sa:RiskTier ; rdfs:label "Low: Autonomic" ; sa:rank 1 .
sa:MediumRisk a sa:RiskTier ; rdfs:label "Medium: Confirm" ; sa:rank 2 .
sa:HighRisk   a sa:RiskTier ; rdfs:label "High: Caregiver Approval" ; sa:rank 3 .
sa:ThermalHazardRule a sa:RiskRule ; rdfs:label "AC setpoint outside 18-30 °C" ;
    sa:appliesToCommand sa:SetTemperature ; sa:minSafe 18 ; sa:maxSafe 30 ; sa:tierIfViolated sa:HighRisk .

# ---------- 3. Building (BOT) ----------
:Home a bot:Building ; rdfs:label "Home" ; bot:hasStorey :GroundFloor .
:GroundFloor a bot:Storey ; rdfs:label "Ground Floor" ; bot:hasSpace :MasterBedroom , :LivingRoom .
:MasterBedroom a bot:Space ; rdfs:label "Master Bedroom" ;
    bot:containsElement :BedroomCeilingLight , :BedsideLamp , :CeilingFan , :AirConditioner .
:LivingRoom a bot:Space ; rdfs:label "Living Room" ;
    bot:containsElement :LivingRoomLight , :SmartTV .

# ---------- 4. Devices (README initial state) ----------
:BedroomCeilingLight a sa:CeilingLight ; rdfs:label "Bedroom Ceiling Light" ; sa:displayOrder 1 ;
    saref:hasFunction sa:OnOffFunction , sa:DimmingFunction ;
    saref:hasStateOfInterest :BedroomCeilingLight_power ; saref:hasPropertyOfInterest :BedroomCeilingLight_brightness .
:BedroomCeilingLight_power a saref:StateOfInterest ; saref:hasStateKind sa:PowerState ; saref:hasStateValue sa:Off .
:BedroomCeilingLight_brightness a saref:PropertyOfInterest ; saref:hasPropertyKind sa:Brightness ; saref:hasPropertyValue :BedroomCeilingLight_brightness_v .
:BedroomCeilingLight_brightness_v a saref:PropertyValue ; saref:hasValue 100 ; saref:isMeasuredIn unit:PERCENT .

:BedsideLamp a sa:Lamp ; rdfs:label "Bedside Lamp" ; sa:displayOrder 2 ;
    saref:hasFunction sa:OnOffFunction , sa:DimmingFunction ;
    saref:hasStateOfInterest :BedsideLamp_power ; saref:hasPropertyOfInterest :BedsideLamp_brightness .
:BedsideLamp_power a saref:StateOfInterest ; saref:hasStateKind sa:PowerState ; saref:hasStateValue sa:Off .
:BedsideLamp_brightness a saref:PropertyOfInterest ; saref:hasPropertyKind sa:Brightness ; saref:hasPropertyValue :BedsideLamp_brightness_v .
:BedsideLamp_brightness_v a saref:PropertyValue ; saref:hasValue 100 ; saref:isMeasuredIn unit:PERCENT .

:LivingRoomLight a sa:CeilingLight ; rdfs:label "Living Room Light" ; sa:displayOrder 3 ;
    saref:hasFunction sa:OnOffFunction , sa:DimmingFunction ;
    saref:hasStateOfInterest :LivingRoomLight_power ; saref:hasPropertyOfInterest :LivingRoomLight_brightness .
:LivingRoomLight_power a saref:StateOfInterest ; saref:hasStateKind sa:PowerState ; saref:hasStateValue sa:On .
:LivingRoomLight_brightness a saref:PropertyOfInterest ; saref:hasPropertyKind sa:Brightness ; saref:hasPropertyValue :LivingRoomLight_brightness_v .
:LivingRoomLight_brightness_v a saref:PropertyValue ; saref:hasValue 100 ; saref:isMeasuredIn unit:PERCENT .

:CeilingFan a sa:CeilingFan ; rdfs:label "Ceiling Fan" ;
    saref:hasFunction sa:OnOffFunction , sa:FanSpeedFunction ;
    saref:hasStateOfInterest :CeilingFan_power , :CeilingFan_speed .
:CeilingFan_power a saref:StateOfInterest ; saref:hasStateKind sa:PowerState ; saref:hasStateValue sa:Off .
:CeilingFan_speed a saref:StateOfInterest ; saref:hasStateKind sa:FanSpeedState .

:AirConditioner a sa:AirConditioner ; rdfs:label "Air Conditioner" ;
    saref:hasFunction sa:OnOffFunction , sa:ThermostatFunction , sa:ACModeFunction ;
    saref:hasStateOfInterest :AirConditioner_power , :AirConditioner_mode ;
    saref:hasPropertyOfInterest :AirConditioner_setpoint .
:AirConditioner_power a saref:StateOfInterest ; saref:hasStateKind sa:PowerState ; saref:hasStateValue sa:On .
:AirConditioner_mode  a saref:StateOfInterest ; saref:hasStateKind sa:ACModeState ; saref:hasStateValue sa:ModeCool .
:AirConditioner_setpoint a saref:PropertyOfInterest ; saref:hasPropertyKind sa:TargetTemperature ; saref:hasPropertyValue :AirConditioner_setpoint_v .
:AirConditioner_setpoint_v a saref:PropertyValue ; saref:hasValue 24 ; saref:isMeasuredIn unit:DEG_C .

:SmartTV a sa:Television ; rdfs:label "Smart TV" ;
    saref:hasFunction sa:OnOffFunction , sa:ChannelFunction , sa:VolumeFunction ;
    saref:hasStateOfInterest :SmartTV_power ;
    saref:hasPropertyOfInterest :SmartTV_channel , :SmartTV_volume .
:SmartTV_power a saref:StateOfInterest ; saref:hasStateKind sa:PowerState ; saref:hasStateValue sa:Standby .
:SmartTV_channel a saref:PropertyOfInterest ; saref:hasPropertyKind sa:Channel ; saref:hasPropertyValue :SmartTV_channel_v .
:SmartTV_channel_v a saref:PropertyValue ; saref:hasValue 1 .
:SmartTV_volume a saref:PropertyOfInterest ; saref:hasPropertyKind sa:Volume ; saref:hasPropertyValue :SmartTV_volume_v .
:SmartTV_volume_v a saref:PropertyValue ; saref:hasValue 20 ; saref:isMeasuredIn unit:PERCENT .

# ---------- 5. Presets (contents are a PROPOSAL; README names only) ----------
:NightMode a sa:Preset ; rdfs:label "Night Mode" ; sa:displayOrder 1 ; sa:hasRiskTier sa:MediumRisk ;
    sa:hasStep :NightMode_1 , :NightMode_2 , :NightMode_3 , :NightMode_4 .
:NightMode_1 sa:targetDevice :BedroomCeilingLight ; sa:command sa:TurnOff ; sa:targetStateValue sa:Off .
:NightMode_2 sa:targetDevice :LivingRoomLight ;     sa:command sa:TurnOff ; sa:targetStateValue sa:Off .
:NightMode_3 sa:targetDevice :SmartTV ;             sa:command sa:TurnOff ; sa:targetStateValue sa:Standby .
:NightMode_4 sa:targetDevice :AirConditioner ;      sa:command sa:SetTemperature ; sa:targetValue 26 .

:AllLightsOff a sa:Preset ; rdfs:label "All Lights Off" ; sa:displayOrder 2 ; sa:hasRiskTier sa:LowRisk ;
    sa:hasStep :AllLightsOff_1 , :AllLightsOff_2 , :AllLightsOff_3 .
:AllLightsOff_1 sa:targetDevice :BedroomCeilingLight ; sa:command sa:TurnOff ; sa:targetStateValue sa:Off .
:AllLightsOff_2 sa:targetDevice :BedsideLamp ;         sa:command sa:TurnOff ; sa:targetStateValue sa:Off .
:AllLightsOff_3 sa:targetDevice :LivingRoomLight ;     sa:command sa:TurnOff ; sa:targetStateValue sa:Off .

:CoolingMode a sa:Preset ; rdfs:label "Cooling Mode" ; sa:displayOrder 3 ; sa:hasRiskTier sa:MediumRisk ;
    sa:hasStep :CoolingMode_1 , :CoolingMode_2 , :CoolingMode_3 , :CoolingMode_4 .
:CoolingMode_1 sa:targetDevice :AirConditioner ; sa:command sa:TurnOn ;  sa:targetStateValue sa:On .
:CoolingMode_2 sa:targetDevice :AirConditioner ; sa:command sa:SetMode ; sa:targetStateValue sa:ModeCool .
:CoolingMode_3 sa:targetDevice :AirConditioner ; sa:command sa:SetTemperature ; sa:targetValue 22 .
:CoolingMode_4 sa:targetDevice :CeilingFan ;     sa:command sa:SetFanSpeed ; sa:targetStateValue sa:SpeedMedium .

:WatchTV a sa:Preset ; rdfs:label "Watch TV" ; sa:displayOrder 4 ; sa:hasRiskTier sa:LowRisk ;
    sa:hasStep :WatchTV_1 , :WatchTV_2 .
:WatchTV_1 sa:targetDevice :SmartTV ;         sa:command sa:TurnOn ; sa:targetStateValue sa:On .
:WatchTV_2 sa:targetDevice :LivingRoomLight ; sa:command sa:SetBrightness ; sa:targetValue 25 .

# ---------- 6. User context (SOSA) ----------
sa:Occupancy a sosa:ObservableProperty ; rdfs:label "room occupancy" .
:RoomSelector a sa:VirtualSensor ; rdfs:label "Operator active-room selector (simulated)" .
:ErrPDetector a sa:VirtualSensor ; rdfs:label "ErrP detector (FCz/Cz)" .
:Patient a sa:User ; rdfs:label "Patient" ; sa:activeRoom :MasterBedroom ; sa:activeRoomConfidence 0.95 .
:Obs_room_0 a sosa:Observation ; sosa:madeBySensor :RoomSelector ; sosa:hasFeatureOfInterest :Patient ;
    sosa:observedProperty sa:Occupancy ; sosa:hasResult :MasterBedroom ; sa:confidence 0.95 ;
    sosa:resultTime "2026-03-01T21:00:00"^^xsd:dateTime .

# ---------- 7. Seed history: last 10 confirmed light activations (6 / 2 / 2) ----------
:H01 a sa:ActionExecution ; sa:resolvedEntity :BedroomCeilingLight ; sa:command sa:TurnOn ; sa:inRoom :MasterBedroom ; sa:outcome sa:Confirmed ; saref:hasTimestamp "2026-03-01T20:30:00"^^xsd:dateTime .
:H02 a sa:ActionExecution ; sa:resolvedEntity :BedsideLamp ;         sa:command sa:TurnOn ; sa:inRoom :MasterBedroom ; sa:outcome sa:Confirmed ; saref:hasTimestamp "2026-03-01T19:10:00"^^xsd:dateTime .
:H03 a sa:ActionExecution ; sa:resolvedEntity :BedroomCeilingLight ; sa:command sa:TurnOn ; sa:inRoom :MasterBedroom ; sa:outcome sa:Confirmed ; saref:hasTimestamp "2026-03-01T07:00:00"^^xsd:dateTime .
:H04 a sa:ActionExecution ; sa:resolvedEntity :LivingRoomLight ;     sa:command sa:TurnOn ; sa:inRoom :LivingRoom ;    sa:outcome sa:Confirmed ; saref:hasTimestamp "2026-02-28T18:40:00"^^xsd:dateTime .
:H05 a sa:ActionExecution ; sa:resolvedEntity :BedroomCeilingLight ; sa:command sa:TurnOn ; sa:inRoom :MasterBedroom ; sa:outcome sa:Confirmed ; saref:hasTimestamp "2026-02-28T07:05:00"^^xsd:dateTime .
:H06 a sa:ActionExecution ; sa:resolvedEntity :BedroomCeilingLight ; sa:command sa:TurnOn ; sa:inRoom :MasterBedroom ; sa:outcome sa:Confirmed ; saref:hasTimestamp "2026-02-27T21:15:00"^^xsd:dateTime .
:H07 a sa:ActionExecution ; sa:resolvedEntity :BedsideLamp ;         sa:command sa:TurnOn ; sa:inRoom :MasterBedroom ; sa:outcome sa:Confirmed ; saref:hasTimestamp "2026-02-27T20:30:00"^^xsd:dateTime .
:H08 a sa:ActionExecution ; sa:resolvedEntity :LivingRoomLight ;     sa:command sa:TurnOn ; sa:inRoom :LivingRoom ;    sa:outcome sa:Confirmed ; saref:hasTimestamp "2026-02-27T17:50:00"^^xsd:dateTime .
:H09 a sa:ActionExecution ; sa:resolvedEntity :BedroomCeilingLight ; sa:command sa:TurnOn ; sa:inRoom :MasterBedroom ; sa:outcome sa:Confirmed ; saref:hasTimestamp "2026-02-27T07:10:00"^^xsd:dateTime .
:H10 a sa:ActionExecution ; sa:resolvedEntity :BedroomCeilingLight ; sa:command sa:TurnOn ; sa:inRoom :MasterBedroom ; sa:outcome sa:Confirmed ; saref:hasTimestamp "2026-02-26T21:05:00"^^xsd:dateTime .
```

**Runtime triples appended after the scripted ErrP** (prototype-verified to produce the §3.4 table):

```turtle
:R01 a sa:ActionExecution ; sa:resolvedEntity :BedroomCeilingLight ; sa:command sa:TurnOn ; sa:inRoom :MasterBedroom ;
     sa:outcome sa:RolledBack ; saref:hasTimestamp "2026-03-01T21:01:00"^^xsd:dateTime .
:E01 a sa:ErrPObservation ; sosa:madeBySensor :ErrPDetector ; sa:aboutExecution :R01 ; sa:posterior 0.91 ;
     sa:peakAmplitude -8.4 ; sa:peakChannel "FCz" ; sosa:resultTime "2026-03-01T21:01:00"^^xsd:dateTime .
```

The fixed timestamps sit on a **demo clock** (`SA.clock`), so the scripted demo is deterministic.

---

## 3. Intent → entity disambiguation

### 3.1 Prior art

- **Spatial context is the dominant cue in deployed assistants.**
  - Amazon's patent *Contextual resolver for voice requests* (US 11,756,541 B1, granted 2023-09-12) resolves "turn off this light" to "a light in proximity to the location of the user or the voice-controlled device" [L1].
  - Intel's US 10,274,911 B2 (2019) fills a missing room for "turn the lights on" first from the conversation context and then from "the room of the user's current location" [L2].
  - Home Assistant Assist (2023): "turn on the lights" acts on the lights in the voice satellite's own area, and an explicitly named area overrides that [L3].
  - **Implication:** spatial match with the active room deserves a large weight. When a room is named explicitly, it should override the inferred one.
- **State as a cue.** Using current device state as a resolution signal (a light that is already ON is an unlikely target of "turn on") is intuitive. It was suggested as a patent example, but I could **not verify** that from the patent's text: the fetched portion of US 12,087,320 B1 does not contain such a sentence [L4]. **[UNVERIFIED as a citation]**. Treat it as our own design rationale. It is also the README's explicit rule ("Turn On prefers devices that are OFF", Mission §2.C).
- **KG and ontology approaches.**
  - Labutin & Chuprina (ISP RAS, 2024) generate a BCI–IoT "smart mediator" layer from a managing ontology, but they do not do context-scored device selection [L5].
  - Sasha (King, Yu, Lee & Julien, IMWUT 2024) shows that LLMs can ground under-specified commands such as "make it cozy", but it also documents failure modes [L6].
  - I found **no** published work that combines MI-BCI, a SAREF KG and context-scored device resolution. This is a plausible novelty claim for the FYP report, worded as "we did not find" **[UNVERIFIED as exhaustive]**.
- **ErrP-driven correction with the runner-up.**
  - Perrin et al. (2012) implemented online ErrP detection *with automatic correction*. After a detected error, the system re-decided using the **second-best guess** of its probabilistic classifier (16 participants) [L7]. This is the direct precedent for "rollback, then offer the Bedside Lamp".
  - Chavarriaga & Millán (2010) used single-trial ErrPs to *lower the probability of the agent decisions that triggered them*, i.e. as negative reward [L8]. Iturrate et al. (2015) generalised this into "teaching" BMIs [L9]. Both support down-weighting the rejected entity in context.
  - **Caution:** Mainsah et al. (2015) found that ErrP-based delete-and-replace correction performed poorly in a P300 speller (−47 % to 0 %) compared with confidence-based correction [L10]. So the penalty should depend on the detector's **posterior**, not on a hard flag, and the rollback is debated jointly with the ErrP brief.

### 3.2 Scoring function [PROPOSAL]

For decoded intent *i* (command *c_i*, target class *K_i*), context *x* (active room *r*, demo clock *now*) and candidate device *d*:

```
S(d | i, x) = g(d) · clamp01( w_T·f_T + w_S·f_S + w_X·f_X + w_R·f_R − π(d, i, x) )

g(d)  = 1 if d a K_i (after subclass closure) AND d saref:hasFunction/saref:hasCommand c_i, else 0   (hard gate, done by the SPARQL BGP)
f_T   = 1 if d is typed K_i; 0.5 if d only offers c_i through another kind (e.g. a fan with a light kit; unused today)
f_S   = 1 if r bot:containsElement d, else 0                                                         (graded variant: 0.5 if bot:adjacentZone; not used)
f_X   = 1 if sa:isActive(current value of d's c_i-targeted state) ≠ sa:prefersActive(c_i), else 0     (TurnOn prefers OFF/Standby)
f_R   = n_d / K, where n_d = how many of the last K = 10 confirmed executions of c_i on class K_i resolved to d
π     = λ · Σ_k p_k · 2^(−(now − t_k)/h) over ErrP observations k about executions of (d, c_i, r);   λ = 0.30, h = 60 min
w     = (w_T, w_S, w_X, w_R) = (0.35, 0.30, 0.20, 0.15),  Σw = 1
```

### 3.3 Calibration: why 0.94, with the arithmetic

The canonical case is decoded intent **Turn On Light**, active room **Master Bedroom**, initial README state, and the seed history (ceiling 6, lamp 2, living room 2 of the last 10).

| Candidate | f_T | f_S | f_X | f_R | Arithmetic | **S** |
|---|---|---|---|---|---|---|
| :BedroomCeilingLight | 1 | 1 (Master Bedroom) | 1 (OFF) | 6/10 = 0.6 | 0.35·1 + 0.30·1 + 0.20·1 + 0.15·0.6 = 0.35 + 0.30 + 0.20 + 0.09 | **0.94** |
| :BedsideLamp | 1 | 1 | 1 (OFF) | 2/10 = 0.2 | 0.35 + 0.30 + 0.20 + 0.15·0.2 = 0.85 + 0.03 | **0.88** |
| :LivingRoomLight | 1 | 0 (Living Room) | 0 (already ON) | 2/10 = 0.2 | 0.35 + 0 + 0 + 0.03 | **0.38** |

These are prototype-verified. The ranking is Ceiling Light, then Bedside Lamp (runner-up), then Living Room Light (last), as required.

**How the weights were obtained.** This shows which parts the 0.94 fixes and which are design choices.
1. Σw = 1, so that S = 1 means "perfect on every cue".
2. In the canonical case the ceiling light is perfect on T, S and X, so **S = 1 − w_R·(1 − f_R) = 1 − w_R·0.4**. Setting S = 0.94 gives **w_R = 0.15 exactly**.
   - The *only* thing that keeps the top candidate below 1.0 is habit uncertainty: it was used for 6 of the last 10 activations, not all 10.
3. Splitting the remaining 0.85 among w_T > w_S > w_X is a **design choice**, not something the 0.94 determines:
   - type is the near-mandatory semantic requirement;
   - space is the README's highlighted context and the deployed-assistant cue [L1–L3];
   - state prevents no-op actions.
   
   *Any* split with w_T + w_S + w_X = 0.85 keeps 0.94 and 0.88. The Living Room Light scores w_T + 0.03, so it is last if and only if w_S + w_X > 0.
4. **Margins.** Ceiling − Lamp = w_R·(0.6 − 0.2) = **0.06**. Lamp − Living Room = w_S + w_X = **0.50**.
   - The policy debate must know this. A "minimum top-2 margin" rule above 0.06 would turn the README's canonical EXECUTE into CONFIRM.

**Floating-point note (verified in Node 24).** `0.35+0.30+0.20+0.15*0.6` evaluates to `0.9399999999999998`. Compute in integer hundredths, `(35+30+20+15*0.6)/100 = 0.94`, or round once at the end. Tests should use a tolerance of 1e-9.

### 3.4 ErrP penalty and the Bedside Lamp alternative

The scripted ErrP after executing :BedroomCeilingLight has posterior p = 0.91 (placeholder: the real value comes from the ErrP detector). The rollback restores OFF, so f_X is still 1. The rolled-back execution does not count towards f_R.

| Candidate | before | π | after | rank |
|---|---|---|---|---|
| :BedsideLamp | 0.88 | 0 | **0.88** | **1, offered with [Retry]** |
| :BedroomCeilingLight | 0.94 | 0.30·0.91·2^(−1/60) ≈ 0.2699 | **0.6701** | 2 |
| :LivingRoomLight | 0.38 | 0 | 0.38 | 3 |

These are prototype-verified, with Δt = 1 min.

- **Swap condition:** λ·p > 0.06. With λ = 0.30 that holds for any posterior above 0.20.
- **Decay:** the swap persists while 0.273·2^(−Δt/60) > 0.06, i.e. for **about 131 min**. At 3 h the prototype gives Ceiling 0.906 against Lamp 0.88.
- **Scope:** the penalty is scoped to the triple (entity, command, room), not to the entity globally. An ErrP on "Turn On Light in the Bedroom" should not penalise "Turn Off" of the same light. This is debate item D11.

### 3.5 "Semantic Context (89%)": how it relates to 0.94

The README shows *both* "SPARQL Match: Score 0.94" and "Semantic Context (89%)", so they must be different quantities. The options:

| Option | Formula | Canonical value | Pros / cons |
|---|---|---|---|
| **A [recommended]** | c_sem = S_top · P(active room), with P from the SOSA room observation (`sa:confidence 0.95`) | 0.94 × 0.95 = 0.893 → **"89%"** | Transparent. Only one new number (0.95), and it has a meaning. It ignores the top-2 ambiguity, which policy handles via the margin. |
| B | Softmax over candidates with temperature T | T = 0.0287 gives 0.890 (computed) | Captures ambiguity, but T is a magic number. With T = 0.03 you get 0.881. Sensitive. |
| C | A separate, slider-driven value in Scripted mode | 0.89 | Honest only in Scripted mode. It leaves Replay mode without a definition. |

After the ErrP, option A gives the Bedside Lamp 0.88 × 0.95 = 0.836, displayed as "84%".

### 3.6 Known failure modes, to be argued in the debate

1. **No-op winners.** For "Turn On Light" with the user in the **Living Room**: Living Room Light 0.35 + 0.30 + 0 + 0.03 = **0.68**, Ceiling Light 0.64, Lamp 0.58. The already-ON light wins, so the action would be a no-op.
   - Options: make f_X a hard gate for TurnOn and TurnOff; or let the policy turn a no-op into CONFIRM or REJECT. See D10.
2. **"Turn Off Light" in the Bedroom when both bedroom lights are OFF.** Ceiling 0.74, Lamp 0.68, Living Room 0.58. The top result is again a no-op. The same fix applies.
3. **Without the type gate**, a ceiling fan in the bedroom would score 0 + 0.30 + 0.20 + 0 = **0.50** for "Turn On Light" and beat the Living Room Light. **The type gate is mandatory.** It is implemented in the BGP (`?device a sa:Light`).
4. **Feedback loops.** Recency rewards whatever was executed and confirmed, so an early mis-resolution that the ErrP detector missed becomes self-reinforcing. Only `sa:Confirmed` executions count, and the window is capped at K = 10.

---

## 4. In-browser engine (Turtle subset, store, SPARQL subset)

### 4.1 Turtle subset (based on RDF 1.1 Turtle [T1])

```
doc        := ( directive | triples '.' )*
directive  := '@prefix' PNAME_NS IRIREF '.' | 'PREFIX' PNAME_NS IRIREF
triples    := iri predObjList
predObjList:= verb objList ( ';' ( verb objList )? )*
objList    := object ( ',' object )*
verb       := iri | 'a'
object     := iri | literal
iri        := IRIREF (absolute only) | PNAME  (prefix [A-Za-z][\w-]* or empty; local [\w][\w-]*)
literal    := STRING_DQ ( LANGTAG | '^^' iri )? | INTEGER | DECIMAL | 'true' | 'false'
comments   := '#' to end of line
```

**Excluded, and must throw with line and column:**
- blank nodes (`_:x`, `[ … ]`);
- collections `( … )`;
- long strings (`"""…"""`);
- `@base` and relative IRIs;
- `\u` escapes and PN_LOCAL escapes;
- dots inside local names;
- doubles with exponents.

All of these are legal in full Turtle [T1], but we do not need them.

**Algorithm:** one sticky-regex tokenizer pass, then a recursive-descent parser. The cost is O(n) in characters, plus O(t) triples emitted.

**Parity test:** `kg/silentassist.ttl` must be byte-identical to the string wrapped in `POC/js/kg/ontology.js`. The test strips the JS wrapper and compares, or compares hashes.

### 4.2 Triple store

- **Term dictionary:** term key → term object. IRI keys look like `<…>`, literal keys like `"v"^^dt`. Later this can become an integer id.
- **Three nested hash indexes:** `SPO: Map<s,Map<p,Set<o>>>`, `POS: Map<p,Map<o,Set<s>>>` and `OSP: Map<o,Map<s,Set<p>>>`.
- These three rotations cover all 8 bound/unbound access patterns with a prefix lookup:
  - s?? / sp? / spo use SPO;
  - ?p? / ?po use POS;
  - ??o / s?o use OSP;
  - ??? is a full scan.
- Hexastore keeps all 6 permutations for sorted merge joins [T4]. We don't need them at about 450 triples.
- **Cost:** add and delete are O(1) expected. A lookup costs O(1) plus the number of matches. Memory is 3 × |triples| entries.
- `closeSubclass()`: build the subClassOf adjacency, then for each `x a C` add `x a D` for every D in closure(C). The cost is O(|types|·|closure|). In the prototype that adds 34 triples.
- The store emits `kg:changed` on the bus after a state-triple replacement.

### 4.3 SPARQL subset (based on SPARQL 1.1 Query [T2])

```
Query     := Prologue 'SELECT' 'DISTINCT'? ( Var+ | '*' ) 'WHERE'? Group OrderBy? Limit?
Prologue  := ( 'PREFIX' PNAME_NS IRIREF )*
Group     := '{' ( TriplesBlock | 'FILTER' '(' Expr ')' | 'OPTIONAL' Group )* '}'
TriplesBlock := TermOrVar PropList ('.')?          (with ';' and ',' and 'a', as in Turtle)
Expr      := Or ; Or := And ('||' And)* ; And := Rel ('&&' Rel)* ;
Rel       := Add ( ('='|'!='|'<'|'>'|'<='|'>=') Add )? ; Add := Mul (('+'|'-') Mul)* ;
Mul       := Un (('*'|'/') Un)* ; Un := '!' Un | '-' Un | Prim ;
Prim      := '(' Expr ')' | 'BOUND' '(' Var ')' | Var | iri | literal | 'true' | 'false'
OrderBy   := 'ORDER' 'BY' ( ('ASC'|'DESC') '(' Var ')' | Var )+
Limit     := 'LIMIT' INTEGER
```

- The mandated features are PREFIX, SELECT, BGP, FILTER, OPTIONAL, ORDER BY and LIMIT. `DISTINCT`, `BOUND`, `ASC`/`DESC` and arithmetic are cheap extras, needed by CQ15 and by the negation idiom in CQ3b.
- **Not supported, and must throw:** UNION, MINUS, GRAPH, BIND, VALUES, sub-queries, aggregates, property paths, CONSTRUCT/ASK/DESCRIBE, OFFSET, REGEX and string functions.
- **Lexing pitfall:** `<` is both the IRIREF opener and the less-than operator. An IRIREF cannot contain whitespace [T2], so require that an IRIREF closes with `>` before any whitespace. Otherwise lex `<` as an operator. The prototype does this; `?a<?b>`-style input is pathological and rejected.

**Evaluation**, in which μ is a solution mapping:

```
evalGroup(G, Ω):                                  // Ω initially [{}]
  Ω ← evalBGP(reorder(G.bgp, Ω), Ω)               // index nested-loop join
  for each OPTIONAL group R in G (in order):      // left outer join, SPARQL §6.1, §18
      Ω ← ⋃_{μ∈Ω} ( let E = evalGroup(R, [μ]) in E ≠ ∅ ? E : [μ] )
  return [ μ ∈ Ω | ∀ f ∈ G.filters: EBV(f, μ) = true ]   // filter scope = whole group (§5.2.2); errors → drop (§17.2)
evalBGP(patterns, Ω):
  for each pattern tp (greedy order: most positions bound by current vars first; tie → smallest index fan-out):
      Ω ← [ μ ∪ {vars of tp ↦ terms of t} | μ ∈ Ω, t ∈ store.match(subst(tp, μ)), compatible ]
query:  Ω ← evalGroup(where, [{}]); if ORDER BY: stable sort using the SPARQL order unbound < bnode < IRI < literal (§15.1),
        numeric compare for xsd numeric types, else lexical; DISTINCT on projected keys; slice(0, LIMIT); project.
```

**Three-valued logic:** `||` with one error and one TRUE gives TRUE; `&&` with one error and one FALSE gives FALSE; any other error propagates and drops the row [T2 §17.2]. The prototype implements `||` this way.

**Complexity.**
- Checking a candidate mapping against an AND/FILTER pattern is **O(|P|·|D|)** (Pérez, Arenas & Gutierrez 2009, Theorem 3.1) [T3].
- *Enumerating* answers to a k-pattern BGP is worst-case **O(N^k)** for N triples.
- Adding OPT makes the general evaluation problem **PSPACE-complete** (Theorem 3.3, Corollary 3.5). For *well-designed* patterns it is coNP-complete (Theorem 4.6) [T3].
- Our OPTIONALs are single-level and well-designed, except the `!BOUND` negation idiom. The data complexity is polynomial (Theorem 3.6: LOGSPACE for a fixed P) [T3].
- In practice, with index lookups and greedy ordering, the cost is O(Σ_i |Ω_i| · fan-out_i) plus O(n log n) for ORDER BY.

**Measured (prototype, Node v24.21.0, cold JIT, this machine):**
- parse, index and closure of 14.5 kB / 413 triples took 26 ms;
- each of the 16 CQ queries took **0.17–3.96 ms**, without join reordering.

Browser timings will differ **[UNVERIFIED]**, but there is about 1000× headroom.

**File plan,** to stay under the 400-line rule. These are estimates from the prototype's 186 dense lines, expanded to readable code:

| File | Estimate |
|---|---|
| `kg/turtle.js` | ~180 lines |
| `kg/triplestore.js` | ~150 lines |
| `kg/sparql-parser.js` | ~260 lines |
| `kg/sparql-eval.js` | ~220 lines |
| `kg/resolver.js` | ~200 lines |
| `kg/kg-view.js` | ~300 lines |

The Mission's single `sparql` file should be split into two (D16).

### 4.4 Existing JS libraries under the `file://`, no-CDN, no-build, no-ES-module constraint

| Library | Version / licence | Browser artefact | SPARQL | Fits `file://` classic scripts? |
|---|---|---|---|---|
| **N3.js** | 2.13.12, MIT [J1] | `browser/n3.min.js`, **213 kB**, a classic script exposing global `N3` [J2, J3] | **None.** It has a pattern-matching Store (`getQuads`); a BGP add-on, `n3-match-bgp`, is experimental [J2]. | Yes, if vendored locally. But it covers only the parser and store, so we would still write the SPARQL engine. |
| **Comunica** | `@comunica/query-sparql` 5.4.1, MIT [J4] | A prebuilt `comunica-browser.js` exposing global `Comunica`, served from rdf.js.org [J5]. The "lite" RDF/JS package is **1.09 MB minified, 225 kB gzipped** [J6]. The full bundle size is **[UNVERIFIED]**. | Full SPARQL 1.1, async streams | Possibly, if vendored, but it is more than 1 MB of opaque code for about 10 queries. The async API complicates a synchronous resolver. |
| **Oxigraph (wasm)** | 0.5.11, MIT/Apache-2.0 [J7] | `web.js` (50.8 kB, an **ES module**) plus `web_bg.wasm` (**4.05 MB**) [J8]. The README says a "bundler compatible with WebAssembly … is likely required" [J9]. | SPARQL 1.1 Query and Update [J9] | **No, as shipped.** ES modules from `file://` hit CORS errors [J10], and the `.wasm` is normally fetched. It would need a hand-made classic wrapper with the wasm base64-inlined (about 5.4 MB of JS). That is a build step in all but name. |

**Recommendation:** write our own engine. Reasons:
1. The Mission requires a Turtle parser, an indexed store and a SPARQL subset (Workstream C).
2. The subset is about 800 readable lines and is fully explainable at the viva.
3. A vendored single-file library would be the largest file in `POC/`, would violate the spirit of the ~400-line rule, and N3.js would not even provide SPARQL.

**Optional:** use N3.js **only in Node tests**, as an oracle (parse `kg/silentassist.ttl` with N3 and with our parser, then compare the triple sets). That needs `npm install n3` into the project and therefore approval. Vendoring is debate item D13.

---

## 5. Competency questions

All queries share this prologue:

```sparql
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX saref: <https://saref.etsi.org/core/>
PREFIX bot: <https://w3id.org/bot#>
PREFIX sosa: <http://www.w3.org/ns/sosa/>
PREFIX sa: <https://silentassist.example/ns#>
PREFIX : <https://silentassist.example/home#>
```

The expected answers below are for the **README initial state** and are prototype-verified by actual execution. Rows are shown in result order.

**CQ1 — Which light fixtures exist, in display order, and what is their power state?** (Screen 3)
```sparql
SELECT ?device ?label ?state WHERE {
  ?device a sa:Light ; rdfs:label ?label ; sa:displayOrder ?ord ; saref:hasStateOfInterest ?soi .
  ?soi saref:hasStateKind sa:PowerState ; saref:hasStateValue ?v .
  ?v rdfs:label ?state .
} ORDER BY ?ord
```
Expected:
- `:BedroomCeilingLight` "Bedroom Ceiling Light" "OFF"
- `:BedsideLamp` "Bedside Lamp" "OFF"
- `:LivingRoomLight` "Living Room Light" "ON"

**CQ2 — How many lights are active?** (Hub subtitle "1 Active of 3")
```sparql
SELECT ?device WHERE {
  ?device a sa:Light ; saref:hasStateOfInterest ?soi .
  ?soi saref:hasStateKind sa:PowerState ; saref:hasStateValue ?v .
  ?v sa:isActive true .
}
```
Expected: one row, `:LivingRoomLight`. The JS counts the rows and takes the denominator, 3, from CQ1.

**CQ3 — Which devices are in the user's active room?**
```sparql
SELECT ?device ?label WHERE {
  :Patient sa:activeRoom ?room . ?room bot:containsElement ?device .
  ?device a saref:Device ; rdfs:label ?label .
} ORDER BY ?label
```
Expected: `:AirConditioner`, `:BedroomCeilingLight`, `:BedsideLamp`, `:CeilingFan`. Rooms for the fan and AC are an assumption.

**CQ3b — Which lights are *not* in the active room?** (Negation via OPTIONAL + !BOUND)
```sparql
SELECT ?device WHERE {
  ?device a sa:Light .
  OPTIONAL { :Patient sa:activeRoom ?r . ?r bot:containsElement ?device . }
  FILTER (!BOUND(?r))
}
```
Expected: `:LivingRoomLight`.

**CQ4 — Where is the user, and on what evidence?** (Panel: "Spatial Context")
```sparql
SELECT ?room ?label ?conf ?sensor WHERE {
  :Patient sa:activeRoom ?room . ?room rdfs:label ?label .
  OPTIONAL { ?obs sosa:hasFeatureOfInterest :Patient ; sosa:hasResult ?room ; sa:confidence ?conf ; sosa:madeBySensor ?sensor . }
}
```
Expected: `:MasterBedroom` "Master Bedroom" 0.95 `:RoomSelector`.

**CQ5 — Canonical resolver candidates for "Turn On Light".** This is the query the CogLign panel shows.
```sparql
SELECT ?device ?label ?room ?active WHERE {
  ?device a sa:Light ; rdfs:label ?label ; saref:hasFunction ?fn ; saref:hasStateOfInterest ?soi .
  ?fn saref:hasCommand sa:TurnOn .
  ?soi saref:hasStateKind sa:PowerState ; saref:hasStateValue ?v .
  ?v sa:isActive ?active .
  OPTIONAL { ?room bot:containsElement ?device . }
} ORDER BY ?label
```
Expected:
- `:BedroomCeilingLight`, `:MasterBedroom`, false
- `:BedsideLamp`, `:MasterBedroom`, false
- `:LivingRoomLight`, `:LivingRoom`, true

The resolver then gives 0.94, 0.88 and 0.38 (§3.3).

**CQ6 — What are the AC setpoint, mode and power?** (Hub "24°C • Cool Mode")
```sparql
SELECT ?setpoint ?mode ?power WHERE {
  :AirConditioner saref:hasPropertyOfInterest ?p ; saref:hasStateOfInterest ?m , ?pw .
  ?p saref:hasPropertyKind sa:TargetTemperature ; saref:hasPropertyValue ?pv . ?pv saref:hasValue ?setpoint .
  ?m saref:hasStateKind sa:ACModeState ; saref:hasStateValue ?mv . ?mv rdfs:label ?mode .
  ?pw saref:hasStateKind sa:PowerState ; saref:hasStateValue ?pwv . ?pwv rdfs:label ?power .
}
```
Expected: 24, "Cool", "ON". The power value is an assumption.

**CQ7 — What state is the TV in?** (Hub "Smart TV: Standby")
```sparql
SELECT ?state ?channel ?volume WHERE {
  :SmartTV saref:hasStateOfInterest ?s . ?s saref:hasStateValue ?v . ?v rdfs:label ?state .
  :SmartTV saref:hasPropertyOfInterest ?c , ?vo .
  ?c saref:hasPropertyKind sa:Channel ; saref:hasPropertyValue ?cv . ?cv saref:hasValue ?channel .
  ?vo saref:hasPropertyKind sa:Volume ; saref:hasPropertyValue ?vv . ?vv saref:hasValue ?volume .
}
```
Expected: "Standby", 1, 20. Channel and volume are assumptions.

**CQ8 — Which actions does the Bedroom Ceiling Light support?** (Screen 4 actions)
```sparql
SELECT ?cmd ?label WHERE {
  :BedroomCeilingLight saref:hasFunction ?fn . ?fn saref:hasCommand ?cmd . ?cmd rdfs:label ?label .
} ORDER BY ?label
```
Expected: `sa:SetBrightness` "Adjust Brightness", `sa:TurnOff` "Turn Off", `sa:TurnOn` "Turn On". The UI orders them as in the README: Turn On, Turn Off, Adjust Brightness, Back.

**CQ9 — What is the risk tier of Turn On?** (Panel "Risk Tier (Low: Autonomic)")
```sparql
SELECT ?tier ?label WHERE { sa:TurnOn sa:hasRiskTier ?tier . ?tier rdfs:label ?label . }
```
Expected: `sa:LowRisk` "Low: Autonomic".

**CQ10 — Is an AC setpoint of 16 °C a hazard, and is 24 °C?** (Thermal rule, which routes to caregiver approval)
```sparql
SELECT ?rule ?tier WHERE {
  ?rule a sa:RiskRule ; sa:appliesToCommand sa:SetTemperature ;
        sa:minSafe ?lo ; sa:maxSafe ?hi ; sa:tierIfViolated ?tier .
  FILTER (16 < ?lo || 16 > ?hi)
}
```
Expected:
- With 16: one row, `sa:ThermalHazardRule` `sa:HighRisk`.
- With 24 substituted: **no rows**.
- The boundaries 18 and 30 return no rows, i.e. they are safe. This is the reading of "below 18 / above 30" in Mission §2.D.

**CQ11 — Which presets exist, in order, and what is their risk tier?** (Screen 6)
```sparql
SELECT ?preset ?label ?tier WHERE { ?preset a sa:Preset ; rdfs:label ?label ; sa:displayOrder ?o ; sa:hasRiskTier ?tier . } ORDER BY ?o
```
Expected:
- Night Mode (Medium)
- All Lights Off (Low)
- Cooling Mode (Medium)
- Watch TV (Low)

The tiers are a proposal.

**CQ12 — What would "All Lights Off" actually change?** (The preset diff shown before commit)
```sparql
SELECT ?device ?from ?to WHERE {
  :AllLightsOff sa:hasStep ?step . ?step sa:targetDevice ?device ; sa:targetStateValue ?to .
  ?device saref:hasStateOfInterest ?soi . ?soi saref:hasStateKind sa:PowerState ; saref:hasStateValue ?from .
  FILTER (?from != ?to)
}
```
Expected: one row, `:LivingRoomLight` `sa:On` → `sa:Off`. The other two lights are already OFF.

**CQ13 — What is the fan state, including its speed if set?** (OPTIONAL with an unbound result)
```sparql
SELECT ?power ?speed WHERE {
  :CeilingFan saref:hasStateOfInterest ?p , ?s .
  ?p saref:hasStateKind sa:PowerState ; saref:hasStateValue ?pv . ?pv rdfs:label ?power .
  ?s saref:hasStateKind sa:FanSpeedState .
  OPTIONAL { ?s saref:hasStateValue ?sv . ?sv rdfs:label ?speed . }
}
```
Expected: "OFF", with ?speed **unbound**.

**CQ14 — Has the user's brain rejected "Turn On → Bedroom Ceiling Light" in the bedroom?** (ErrP feedback history)
```sparql
SELECT ?obs ?p ?t WHERE {
  ?obs a sa:ErrPObservation ; sa:aboutExecution ?x ; sa:posterior ?p ; sosa:resultTime ?t .
  ?x sa:resolvedEntity :BedroomCeilingLight ; sa:inRoom :MasterBedroom ; sa:command sa:TurnOn .
} ORDER BY DESC(?t)
```
Expected:
- **No rows** at reset.
- After [Simulate ErrP]: one row, `:E01` 0.91 "2026-03-01T21:01:00". That row feeds π = 0.27 (§3.4).

**CQ15 — What are the last 10 confirmed light activations?** (Recency feature)
```sparql
SELECT ?x ?device ?t WHERE {
  ?x a sa:ActionExecution ; sa:command sa:TurnOn ; sa:outcome sa:Confirmed ; sa:resolvedEntity ?device ; saref:hasTimestamp ?t .
  ?device a sa:Light .
} ORDER BY DESC(?t) LIMIT 10
```
Expected: H01, H02, …, H10 in that order. Counted per device: Ceiling 6, Lamp 2, Living Room 2, so f_R is 0.6, 0.2 and 0.2.

---

## 6. Integration notes for the architecture debate [PROPOSAL]

- **API:** `SA.kg.resolve({command:'sa:TurnOn', targetClass:'sa:Light'}, ctx)` returns `{ ranked:[{iri,label,score,features:{T,S,X,R},penalty}], queries:{candidates, history, errp}, semanticConfidence }`.
- The CogLign panel prints `queries.candidates` verbatim (CQ5 text), which is "the query that actually ran". It also shows a per-feature arithmetic row for the top two candidates. The KG view highlights the winner and the runner-up.
- **Bus events consumed:**
  - `device:stateChanged` → replace one state or value triple;
  - `action:executed`, `action:confirmed`, `action:rolledBack` → append or update an `sa:ActionExecution`;
  - `errp:detected` → append an `sa:ErrPObservation`;
  - `context:roomChanged` → replace `sa:activeRoom` and append a SOSA observation;
  - `demo:reset` → reload the canonical TTL.
- **Config keys (`SA.config.kg`):** `weights {type:0.35, space:0.30, state:0.20, recency:0.15}`, `recencyWindow 10`, `errpLambda 0.30`, `errpHalfLifeMin 60`, `roomConfidence 0.95`.

---

## Decisions the debates must settle

| # | Decision | Options | My recommendation | Evidence |
|---|---|---|---|---|
| D1 | SAREF version and on/off terms | (a) v4.1.1 State/StateOfInterest/StateValue pattern with our own `sa:On/Off/Standby`. (b) Reuse `saref:OnState`/`saref:OffState` IRIs as in the v4 doc example. (c) Pin v3.1.1, where `OnState` and `OnCommand` are classes. | **(a)** | v4.1.1 deleted the deprecated terms; the doc example uses undeclared IRIs [S1, S2, S6] |
| D2 | Location and evidence vocabularies | BOT + SOSA (proposed); SAREF4BLDG spaces; SAREF's own Observation class; no standard (plain `sa:inRoom`) | **BOT for topology, SOSA for room and ErrP evidence** | BOT lists lights and ACs as Elements and has a S4BLDG alignment [S4]; S4BLDG has no light class [S3]; SOSA is a W3C Rec [S5] |
| D3 | Our namespace IRI | `https://silentassist.example/…` (RFC 2606); a `w3id.org` IRI (requires a public PR, which breaks the rules); a `urn:` IRI | **`.example`** | [S8], CLAUDE.md §1 |
| D4 | State representation | SAREF StateOfInterest (2-hop join); a direct shortcut `sa:powerState`; both, with a consistency check | **StateOfInterest only** | Standard-conformant [S1]; still under 4 ms per query in the prototype |
| D5 | Source of truth for device state | `SA.store` authoritative with the KG mirrored via the bus (proposed); the KG authoritative; dual writes | **Store authoritative; KG is a single-writer mirror; selftest asserts they agree** | Mission §2.D: modules talk only via `SA.bus` and `SA.store` |
| D6 | Subclass reasoning | Materialise at load; SPARQL property paths `rdfs:subClassOf*`; none (assert all types) | **Materialise (rdfs9 + rdfs11)** | Keeps the SPARQL subset within the Mission list; +34 triples |
| D7 | Is the score computed *in* SPARQL? | (a) The SPARQL BGP gates and fetches features, and JS scores them (proposed). (b) Add `BIND`, arithmetic and `IF` so that `ORDER BY DESC(?score) LIMIT 3` ranks in-query. | **(a)**, with a per-feature arithmetic table in the panel. Revisit if the panel judges "SPARQL Match: 0.94" misleading. | (b) also needs the recency and ErrP aggregates, which need GROUP BY/COUNT, far beyond the subset. The README label "SPARQL Match" is ambiguous. |
| D8 | Scoring family and weights | Linear additive (0.35/0.30/0.20/0.15); multiplicative/log-linear; Bayesian (prior × likelihoods); learned weights | **Linear, Σw = 1; w_R = 0.15 is forced by 0.94 and f_R = 0.6; the rest is a documented choice** | §3.3 arithmetic; transparent for a viva |
| D9 | Type match | Hard gate (BGP) + f_T term; soft only | **Gate + f_T** | Without the gate a bedroom fan scores 0.50 > Living Room Light (§3.6) |
| D10 | State compatibility | Soft (proposed); hard gate for On/Off commands; soft + policy turns a no-op into CONFIRM | **Soft + a no-op guard in the policy** | Living-room "Turn On Light" picks an already-ON light at 0.68 (§3.6) |
| D11 | ErrP penalty | Subtractive λ·p·2^(−Δt/h) (λ = 0.30, h = 60 min, scope entity × command × room); multiplicative (1 − p)^n; permanent; entity-global | **Subtractive, posterior-weighted, decaying, context-scoped** | Perrin 2012 second-best [L7]; Chavarriaga 2010 [L8]; Mainsah 2015 caution [L10]; swap needs λp > 0.06 |
| D12 | "Semantic Context 89%" | S_top × P(room); softmax with T ≈ 0.0287; a scripted constant | **S_top × P(room) = 0.94 × 0.95 = 0.893** | §3.5 |
| D13 | Engine vs a library | Own engine; vendored N3.js (213 kB, no SPARQL); vendored Comunica (≥ 1.09 MB); Oxigraph wasm (4.05 MB + ES module) | **Own engine; N3.js only as an optional Node test oracle** | [J1–J10]; Mission Workstream C; `file://` blocks ES modules [J10] |
| D14 | Turtle subset scope | No blank nodes/collections/long strings (proposed); full Turtle 1.1 | **Subset; throw on anything else** | §4.1; the KG authors control the input |
| D15 | Rooms for the fan, AC and TV; preset contents | See the open questions | **Fan and AC in Master Bedroom, TV in Living Room; presets as in the TTL** | README is silent |
| D16 | File split | One `sparql.js` file (Mission layout); `sparql-parser.js` + `sparql-eval.js` | **Split** | ~480 lines combined would exceed the 400-line rule |
| D17 | Policy coupling | Top-2 margin rule (margin = 0.06 in the canonical case); no margin rule | **If a margin rule is adopted, its threshold must be ≤ 0.06, or the canonical case becomes CONFIRM** | §3.3 |
| D18 | What the KG disambiguates in the README flow | (a) Category-level intent (Lights + Turn On), with the KG picking the fixture. (b) The fixture is chosen on Screen 3, and the KG *validates* it and supplies the alternative. | **(b) in the UI, with the resolver re-scoring all fixtures; the panel shows whether the user's focus matches the KG's top result** | The README's Screen 3 lists fixtures, yet Screen 4 says "Decoded Intent: Turn On Light" (no fixture). This needs a ruling. |

## Open questions for the user

1. **Rooms.** Which rooms hold the **Ceiling Fan**, the **Air Conditioner** and the **Smart TV**? I assumed Master Bedroom, Master Bedroom and Living Room. Are there only two rooms, or should we add a kitchen or bathroom?
2. **AC power.** Is the AC initially **ON** (24°C, Cool)? The README gives the setpoint and mode but not the power.
3. **Preset contents.** The README names the four presets, but what does each one do? My proposal:
   - **Night Mode:** both ceiling lights OFF, TV Standby, AC 26 °C;
   - **All Lights Off:** all three lights OFF;
   - **Cooling Mode:** AC ON, Cool, 22 °C, fan Medium;
   - **Watch TV:** TV ON, Living Room Light 25 %.
4. **Unstated initial values.** I assumed light brightness 100 %, TV channel 1 and volume 20, and fan speed unset. Is that acceptable?
5. **Meaning of the canonical flow** (D18). On Screen 4, is the KG choosing the fixture from a category-level intent, or validating a fixture the patient already focused?
6. **Recency seed.** Is a *seeded* usage history (6/2/2 over the last 10 activations) acceptable for the demo, provided the UI and docs say it is synthetic?
7. **Medium/High tier labels.** The README gives only "Low: Autonomic". Are "Medium: Confirm" and "High: Caregiver Approval" acceptable?

## Things requiring user approval

- **None are required for this workstream.** The KG engine and its tests need only Node v24, which is already installed (`node --check` and plain `node` test scripts). No downloads are needed, because we copy only the two SAREF axioms we use.
- **Optional:** `npm install --save-dev n3@2.13.12` into the project, as a Node-only test oracle that cross-checks our Turtle parser. The download is about 1 MB unpacked [J1], plus its few transitive dependencies **[UNVERIFIED count]**. It is never loaded by `POC/`. It needs approval, and a `package.json` in the FYP folder.
- **Optional:** nothing else. No long runs: the KG tests run in well under one second, based on the prototype.

## References

**Standards and ontologies**
- [S1] ETSI SmartM2M, *SAREF: the Smart Applications REFerence ontology*, v4.1.1 documentation (namespace, version history, class list, state and property-value examples). https://saref.etsi.org/core/ and https://saref.etsi.org/core/v4.1.1/
- [S2] SAREF core v4.1.1 ontology file (header changelog, declarations of Device, Actuator, hasState, hasStateOfInterest, hasStateKind, StateValue, targets, controls, hasPropertyKind, hasTimestamp, …). https://saref.etsi.org/core/v4.1.1/saref.ttl
- [S3] ETSI, *SAREF4BLDG* v2.1.1 documentation. https://saref.etsi.org/saref4bldg/
- [S4] W3C Linked Building Data CG, *Building Topology Ontology (BOT)*, Draft CG report (revision v0.3.2 cited on the page). https://w3c-lbd-cg.github.io/bot/ (namespace https://w3id.org/bot#)
- [S5] W3C/OGC, *Semantic Sensor Network Ontology*, W3C Recommendation 19 Oct 2017. https://www.w3.org/TR/vocab-ssn/
- [S6] SAREF core v3.1.1 ontology file (`OnState`, `OffState`, `OnOffState`, `OnCommand`, `OnOffFunction`, `Switch`, `LightSwitch`, `actsUpon`, `hasState` domain Device; issued 2020-02-11). https://saref.etsi.org/core/v3.1.1/saref.ttl
- [S7] W3C, *Semantic Sensor Network Ontology – 2023 Edition*, Working Draft. https://www.w3.org/TR/vocab-ssn-2023/ (e.g. https://www.w3.org/TR/2026/WD-vocab-ssn-2023-20260909/)
- [S8] D. Eastlake, A. Panitz, *Reserved Top Level DNS Names*, RFC 2606, IETF, 1999. https://www.rfc-editor.org/rfc/rfc2606

**Query languages and theory**
- [T1] W3C, *RDF 1.1 Turtle*, W3C Recommendation 25 Feb 2014. https://www.w3.org/TR/turtle/ (RDF 1.2 Turtle is still a Working Draft as of the 2026 snapshots, e.g. https://www.w3.org/TR/2026/WD-rdf12-turtle-20260903/)
- [T2] W3C, *SPARQL 1.1 Query Language*, W3C Recommendation 21 Mar 2013. Sections cited: §5.2.2 filter scope, §6.1 OPTIONAL, §15.1 ORDER BY ordering, §17.2 filter evaluation and error logic. https://www.w3.org/TR/sparql11-query/
- [T3] J. Pérez, M. Arenas, C. Gutierrez, "Semantics and complexity of SPARQL", *ACM Trans. Database Syst.* 34(3):16, 2009, doi:10.1145/1567274.1567278 (Theorems 3.1, 3.2, 3.3, 3.6, 4.6; Corollary 3.5). https://users.dcc.uchile.cl/~cgutierr/papers/tods09.pdf
- [T4] C. Weiss, P. Karras, A. Bernstein, "Hexastore: sextuple indexing for semantic web data management", *PVLDB* 1(1), 2008. **[UNVERIFIED in this session; cited from memory, so verify before quoting]**

**Disambiguation and ErrP-correction literature**
- [L1] Amazon Technologies Inc., *Contextual resolver for voice requests*, US 11,756,541 B1, granted 2023-09-12. https://patents.google.com/patent/US11756541B1/en
- [L2] Intel Corp., *Conversational interface for matching text of spoken input based on context model*, US 10,274,911 B2, 2019-04-30. https://patents.google.com/patent/US10274911B2/en
- [L3] Home Assistant, *Year of the Voice – Chapter 5* (area-aware satellites), 2023-12-13. https://www.home-assistant.io/blog/2023/12/13/year-of-the-voice-chapter-5
- [L4] Amazon Technologies Inc., *Acoustic event detection*, US 12,087,320 B1, 2024-09-10. https://patents.google.com/patent/US12087320B1/en (the device-state claim was **not** found in the fetched text)
- [L5] Labutin & Chuprina, ontology-driven BCI–IoT mediator, Proc. ISP RAS, 2024. https://ispranproceedings.elpub.ru/jour/article/download/1794/1637 **[full citation details UNVERIFIED]**
- [L6] E. King, H. Yu, S. Lee, C. Julien, "Sasha: Creative goal-oriented reasoning in smart homes with large language models", *Proc. ACM IMWUT* 2024; arXiv:2305.09802. https://arxiv.org/abs/2305.09802
- [L7] M. Perrin, E. Maby, S. Daligault, O. Bertrand, J. Mattout, "Objective and subjective evaluation of online error correction during P300-based spelling", *Advances in Human-Computer Interaction* 2012, 578295, doi:10.1155/2012/578295.
- [L8] R. Chavarriaga, J. del R. Millán, "Learning from EEG error-related potentials in noninvasive brain-computer interfaces", *IEEE TNSRE* 18(4):381–388, 2010, doi:10.1109/TNSRE.2010.2053387. https://infoscience.epfl.ch/record/149292
- [L9] I. Iturrate, R. Chavarriaga, L. Montesano, J. Minguez, J. del R. Millán, "Teaching brain-machine interfaces as an alternative paradigm to neuroprosthetics control", *Scientific Reports* 5:13893, 2015, doi:10.1038/srep13893. https://pmc.ncbi.nlm.nih.gov/articles/PMC4564803
- [L10] B. Mainsah et al., "Moving away from error-related potentials to achieve spelling correction in P300 spellers", *IEEE TNSRE* 2015. https://amll.pratt.duke.edu/publications/moving-away-error-related-potentials-achieve-spelling-correction-p300-spellers

**JavaScript libraries and the browser platform**
- [J1] npm registry, `n3` latest (2.13.12, MIT, unpacked 952,790 B). https://registry.npmjs.org/n3/latest
- [J2] rdfjs/N3.js README (classic-script global `N3`, Store `getQuads`, experimental `n3-match-bgp`). https://github.com/rdfjs/N3.js
- [J3] unpkg file listing, `n3@2.13.12/browser` (n3.min.js 213 kB). https://app.unpkg.com/n3@2.13.12/files/browser
- [J4] npm registry, `@comunica/query-sparql` latest (5.4.1, MIT). https://registry.npmjs.org/@comunica/query-sparql/latest
- [J5] Comunica docs, *Querying in a JavaScript browser app* (global `Comunica`, prebuilt `comunica-browser.js`). https://comunica.dev/docs/query/getting_started/query_browser_app/
- [J6] `@comunica/query-sparql-rdfjs-lite@5.3.0` README (1.09 MB minified, 225.21 KB gzipped). https://unpkg.com/@comunica/query-sparql-rdfjs-lite@5.3.0/README.md
- [J7] npm registry, `oxigraph` latest (0.5.11, MIT OR Apache-2.0, `browser: web.js`). https://registry.npmjs.org/oxigraph/latest
- [J8] unpkg file listing, `oxigraph@0.5.11` (web_bg.wasm 4.05 MB, web.js 50.8 kB). https://app.unpkg.com/oxigraph@0.5.11/files
- [J9] Oxigraph JS README (bundler note, SPARQL 1.1 Query and Update). https://github.com/oxigraph/oxigraph/tree/main/js
- [J10] MDN, *JavaScript modules* ("if you try to load the HTML file locally (i.e., with a file:// URL), you'll run into CORS errors"). https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules

**Project inputs**
- `README.md`, `PROMPT.md` (Workstream C, §2.D thermal rule), and `CLAUDE.md` in `C:/Users/AK/Documents/FYP/`.
- Base paper: X. Gao, G. Cao, G. Ma, "SFE-GAT: Structure-Feature Evolution Graph Attention Network for Motor Imagery Decoding", *Sensors* 2026, 26, 1730, doi:10.3390/s26051730. It has no KG content.
