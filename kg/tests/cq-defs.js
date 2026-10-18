/*
 * Competency questions CQ1-CQ16 (ADR 0003 D19) - single source.
 * kg/tests/build-ontology.js embeds this array into POC/js/kg/ontology.js
 * (SA.kg.competencyQuestions) so the browser selftest, the Node tests and
 * docs/kg.md all use the same query text and expected answers.
 *
 * Each CQ: {id, question, sparql, runs:[{bindings, expected}]}.
 *   bindings: {var: number | 'pname'} - a string is a prefixed IRI (':X', 'sa:Y').
 *   expected: rows of SA.kg.sparql.values(result, store.prefixes) (IRIs compacted).
 * Expected answers are for the reset state.
 */
'use strict';

var P = 'PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\n' +
  'PREFIX saref: <https://saref.etsi.org/core/>\n' +
  'PREFIX bot: <https://w3id.org/bot#>\n' +
  'PREFIX sosa: <http://www.w3.org/ns/sosa/>\n' +
  'PREFIX sa: <https://silentassist.example/ns#>\n' +
  'PREFIX : <https://silentassist.example/home#>\n';

function row(o) { return o; }

module.exports = [
  { id: 'CQ1', question: 'Light fixtures in display order, with power state',
    sparql: P + 'SELECT ?d ?label ?power WHERE {\n  ?d a sa:Light ; rdfs:label ?label ; sa:displayOrder ?order ;\n     saref:hasStateOfInterest ?soi .\n  ?soi saref:hasStateKind sa:PowerState ; saref:hasStateValue ?power .\n}\nORDER BY ?order',
    runs: [{ bindings: null, expected: [
      row({ d: ':BedroomCeilingLight', label: 'Bedroom Ceiling Light', power: 'sa:Off' }),
      row({ d: ':BedsideLamp', label: 'Bedside Lamp', power: 'sa:Off' }),
      row({ d: ':LivingRoomLight', label: 'Living Room Light', power: 'sa:On' })] }] },

  { id: 'CQ2', question: 'Devices in the active room, ordered by label (?room bound to the active room)',
    sparql: P + 'SELECT ?d ?label WHERE {\n  ?room bot:containsElement ?d .\n  ?d rdfs:label ?label .\n}\nORDER BY ?label',
    runs: [{ bindings: { room: ':MasterBedroom' }, expected: [
      { d: ':AirConditioner', label: 'Air Conditioner' }, { d: ':BedroomCeilingLight', label: 'Bedroom Ceiling Light' },
      { d: ':BedsideLamp', label: 'Bedside Lamp' }, { d: ':CeilingFan', label: 'Ceiling Fan' }, { d: ':SmartTV', label: 'Smart TV' }] }] },

  { id: 'CQ3', question: 'Lights not in the active room (OPTIONAL + !BOUND)',
    sparql: P + 'SELECT ?d WHERE {\n  ?d a sa:Light .\n  OPTIONAL { ?active bot:containsElement ?d . ?d rdfs:label ?here }\n  FILTER(!BOUND(?here))\n}',
    runs: [{ bindings: { active: ':MasterBedroom' }, expected: [{ d: ':LivingRoomLight' }] }] },

  { id: 'CQ4', question: 'Where the user is, and the evidence (latest room observation)',
    sparql: P + 'SELECT ?room ?label ?confidence ?sensor WHERE {\n  ?o a sa:RoomObservation ; sosa:hasFeatureOfInterest :Patient ; sosa:hasResult ?room ;\n     sa:confidence ?confidence ; sosa:madeBySensor ?sensor ; sa:sequence ?seq .\n  ?room rdfs:label ?label .\n}\nORDER BY DESC(?seq)\nLIMIT 1',
    runs: [{ bindings: null, expected: [{ room: ':MasterBedroom', label: 'Master Bedroom', confidence: 0.95, sensor: ':RoomSelector' }] }] },

  { id: 'CQ5', question: 'Gated candidates for "Turn On Light" (the panel query, verbatim; resolver result 0.94 / 0.88 / 0.38)',
    sparql: P + 'SELECT ?d ?label ?space ?power ?order WHERE {\n  ?d a sa:Light ;\n     rdfs:label ?label ;\n     saref:hasFunction ?fn ;\n     saref:hasStateOfInterest ?soi .\n  ?fn saref:hasCommand sa:TurnOn .\n  ?soi saref:hasStateKind sa:PowerState ;\n       saref:hasStateValue ?power .\n  ?space a bot:Space ;\n         bot:containsElement ?d .\n  OPTIONAL { ?d sa:displayOrder ?order }\n}\nORDER BY ?order ?label',
    runs: [{ bindings: null, expected: [
      { d: ':BedroomCeilingLight', label: 'Bedroom Ceiling Light', space: ':MasterBedroom', power: 'sa:Off', order: 1 },
      { d: ':BedsideLamp', label: 'Bedside Lamp', space: ':MasterBedroom', power: 'sa:Off', order: 2 },
      { d: ':LivingRoomLight', label: 'Living Room Light', space: ':LivingRoom', power: 'sa:On', order: 3 }] }] },

  { id: 'CQ6', question: 'Air Conditioner power, mode and setpoint',
    sparql: P + 'SELECT ?power ?mode ?setpoint WHERE {\n  :AirConditioner saref:hasStateOfInterest ?p , ?m ; saref:hasPropertyOfInterest ?sp .\n  ?p saref:hasStateKind sa:PowerState ; saref:hasStateValue ?pv . ?pv rdfs:label ?power .\n  ?m saref:hasStateKind sa:ACModeState ; saref:hasStateValue ?mv . ?mv rdfs:label ?mode .\n  ?sp saref:hasPropertyKind sa:TargetTemperature ; saref:hasPropertyValue ?v . ?v saref:hasValue ?setpoint .\n}',
    runs: [{ bindings: null, expected: [{ power: 'ON', mode: 'Cool', setpoint: 24 }] }] },

  { id: 'CQ7', question: 'Smart TV power, channel and volume',
    sparql: P + 'SELECT ?power ?channel ?volume WHERE {\n  :SmartTV saref:hasStateOfInterest ?p ; saref:hasPropertyOfInterest ?c , ?vo .\n  ?p saref:hasStateKind sa:PowerState ; saref:hasStateValue ?pv . ?pv rdfs:label ?power .\n  ?c saref:hasPropertyKind sa:Channel ; saref:hasPropertyValue ?cv . ?cv saref:hasValue ?channel .\n  ?vo saref:hasPropertyKind sa:Volume ; saref:hasPropertyValue ?vv . ?vv saref:hasValue ?volume .\n}',
    runs: [{ bindings: null, expected: [{ power: 'Standby', channel: 1, volume: 20 }] }] },

  { id: 'CQ8', question: 'Ceiling Fan power and OPTIONAL speed',
    sparql: P + 'SELECT ?power ?speed WHERE {\n  :CeilingFan saref:hasStateOfInterest ?p .\n  ?p saref:hasStateKind sa:PowerState ; saref:hasStateValue ?pv . ?pv rdfs:label ?power .\n  OPTIONAL { :CeilingFan saref:hasStateOfInterest ?s .\n             ?s saref:hasStateKind sa:FanSpeedState ; saref:hasStateValue ?sv . ?sv rdfs:label ?speed }\n}',
    runs: [{ bindings: null, expected: [{ power: 'OFF', speed: null }] }] },

  { id: 'CQ9', question: 'Commands the Bedroom Ceiling Light supports',
    sparql: P + 'SELECT DISTINCT ?label WHERE {\n  :BedroomCeilingLight saref:hasFunction ?f .\n  ?f saref:hasCommand ?c .\n  ?c rdfs:label ?label .\n}\nORDER BY ?label',
    runs: [{ bindings: null, expected: [{ label: 'Adjust Brightness' }, { label: 'Turn Off' }, { label: 'Turn On' }] }] },

  { id: 'CQ10', question: 'Risk tier of :BedroomCeilingLight',
    sparql: P + 'SELECT ?tier ?label WHERE {\n  :BedroomCeilingLight sa:hasRiskTier ?tier .\n  ?tier rdfs:label ?label .\n}',
    runs: [{ bindings: null, expected: [{ tier: 'sa:LowRisk', label: 'Low: Autonomic' }] }] },

  { id: 'CQ11', question: 'Is setpoint ?t a thermal hazard? (parameterised; strict < 18 or > 30)',
    sparql: P + 'SELECT ?rule ?tier WHERE {\n  ?rule sa:appliesToCommand sa:SetTemperature ; sa:minSafe ?min ; sa:maxSafe ?max ;\n        sa:tierIfViolated ?tier .\n  FILTER(?t < ?min || ?t > ?max)\n}',
    runs: [
      { bindings: { t: 17 }, expected: [{ rule: 'sa:ThermalHazardRule', tier: 'sa:HighRisk' }] },
      { bindings: { t: 18 }, expected: [] },
      { bindings: { t: 24 }, expected: [] },
      { bindings: { t: 30 }, expected: [] },
      { bindings: { t: 31 }, expected: [{ rule: 'sa:ThermalHazardRule', tier: 'sa:HighRisk' }] }] },

  { id: 'CQ12', question: 'Presets in display order',
    sparql: P + 'SELECT ?p ?label WHERE {\n  ?p a sa:Preset ; rdfs:label ?label ; sa:displayOrder ?order .\n}\nORDER BY ?order',
    runs: [{ bindings: null, expected: [
      { p: ':NightMode', label: 'Night Mode' }, { p: ':AllLightsOff', label: 'All Lights Off' },
      { p: ':CoolingMode', label: 'Cooling Mode' }, { p: ':WatchTV', label: 'Watch TV' }] }] },

  { id: 'CQ13', question: 'Highest-tier step of preset ?p (run per preset)',
    sparql: P + 'SELECT ?tierName ?rank WHERE {\n  ?p sa:hasStep ?st .\n  ?st sa:targetDevice ?d .\n  ?d sa:hasRiskTier ?t .\n  ?t sa:rank ?rank ; sa:tierName ?tierName .\n}\nORDER BY DESC(?rank)\nLIMIT 1',
    runs: [
      { bindings: { p: ':NightMode' }, expected: [{ tierName: 'Medium', rank: 2 }] },
      { bindings: { p: ':AllLightsOff' }, expected: [{ tierName: 'Low', rank: 1 }] },
      { bindings: { p: ':CoolingMode' }, expected: [{ tierName: 'Medium', rank: 2 }] },
      { bindings: { p: ':WatchTV' }, expected: [{ tierName: 'Low', rank: 1 }] }] },

  { id: 'CQ14', question: 'What "All Lights Off" would change',
    sparql: P + 'SELECT ?d ?from ?to WHERE {\n  :AllLightsOff sa:hasStep ?st .\n  ?st sa:targetDevice ?d ; sa:targetStateValue ?to .\n  ?d saref:hasStateOfInterest ?soi .\n  ?soi saref:hasStateKind sa:PowerState ; saref:hasStateValue ?from .\n  FILTER(?from != ?to)\n}',
    runs: [{ bindings: null, expected: [{ d: ':LivingRoomLight', from: 'sa:On', to: 'sa:Off' }] }] },

  { id: 'CQ15', question: 'ErrP feedback for (Bedroom Ceiling Light, Turn On, Master Bedroom)',
    sparql: P + 'SELECT ?f ?q ?lambda ?prior ?n WHERE {\n  ?f a sa:ErrPFeedback ; sa:aboutEntity :BedroomCeilingLight ; sa:command sa:TurnOn ;\n     sa:inRoom :MasterBedroom ; sa:posterior ?q ; sa:likelihoodRatio ?lambda ;\n     sa:prior ?prior ; sa:interactionsSince ?n .\n}',
    runs: [{ bindings: null, expected: [] }],
    note: 'No rows at reset. After [Simulate ErrP]: one row whose sa:posterior equals the detector q (> t*).' },

  { id: 'CQ16', question: 'Last 10 confirmed light activations (recency f_R; synthetic seed history)',
    sparql: P + 'SELECT ?e ?d WHERE {\n  ?e a sa:ActionExecution ; sa:outcome sa:Confirmed ; sa:command sa:TurnOn ;\n     sa:resolvedEntity ?d ; saref:hasTimestamp ?ts .\n  ?d a sa:Light .\n}\nORDER BY DESC(?ts)\nLIMIT 10',
    runs: [{ bindings: null, expected: [
      { e: ':H01', d: ':BedroomCeilingLight' }, { e: ':H02', d: ':BedsideLamp' }, { e: ':H03', d: ':BedroomCeilingLight' },
      { e: ':H04', d: ':LivingRoomLight' }, { e: ':H05', d: ':BedroomCeilingLight' }, { e: ':H06', d: ':BedroomCeilingLight' },
      { e: ':H07', d: ':BedsideLamp' }, { e: ':H08', d: ':LivingRoomLight' }, { e: ':H09', d: ':BedroomCeilingLight' },
      { e: ':H10', d: ':BedroomCeilingLight' }] }],
    note: 'Counts 6/2/2, so f_R = 0.6 / 0.2 / 0.2. Synthetic seed history.' }
];
