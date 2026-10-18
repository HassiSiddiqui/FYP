'use strict';
var test = require('node:test'), assert = require('node:assert/strict');
var fs = require('fs'), path = require('path');
var L = require('./_load.js');

test('kg/silentassist.ttl is byte-identical to SA.kg.ontologyTTL', function () {
  var env = L.load(), raw = fs.readFileSync(path.join(L.ROOT, 'kg', 'silentassist.ttl'));
  assert.ok(Buffer.compare(raw, Buffer.from(env.SA.kg.ontologyTTL, 'utf8')) === 0, 'TTL file != ontology.js string');
  assert.ok(raw.indexOf(13) < 0, 'TTL must be LF only');
  assert.ok(!/[^\x00-\x7f]/.test(raw.toString('latin1')), 'TTL must be ASCII');
  var js = fs.readFileSync(path.join(L.ROOT, 'POC', 'js', 'kg', 'ontology.js'), 'utf8');
  assert.match(js.split('\n')[0], /GENERATED/);
});

test('golden triple counts (asserted 466, after rdfs:subClassOf closure 515)', function () {
  var env = L.load(), SA = env.SA;
  var t = SA.kg.turtle.parse(SA.kg.ontologyTTL);
  assert.equal(t.length, 466);
  assert.equal(SA.kg.resolver.triples().size, 515);
});

test('15 spot-checked triples', function () {
  var SA = L.load().SA, st = SA.kg.resolver.triples(), T = SA.kg.term;
  var P = st.prefixes;
  function term(x) {
    if (typeof x === 'number' || typeof x === 'boolean') return T.fromJS(x);
    if (x.charAt(0) === '"') return T.literal(x.slice(1, -1));
    var i = x.indexOf(':'), pf = x.slice(0, i);
    if (pf === 'a') return T.iri('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
    return T.iri(P[pf] + x.slice(i + 1));
  }
  var spots = [
    [':BedroomCeilingLight', 'a:type', 'sa:CeilingLight'],
    [':BedroomCeilingLight', 'a:type', 'sa:Light'],                 // inferred (rdfs9)
    [':BedroomCeilingLight', 'a:type', 'saref:Device'],             // inferred through saref:Actuator
    [':MasterBedroom', 'bot:containsElement', ':SmartTV'],          // ADR 0003 D18: TV in the bedroom
    [':LivingRoom', 'bot:containsElement', ':LivingRoomLight'],
    [':LivingRoomLight_power', 'saref:hasStateValue', 'sa:On'],
    [':SmartTV_power', 'saref:hasStateValue', 'sa:Standby'],
    [':AirConditioner_setpoint_v', 'saref:hasValue', 24],
    [':AirConditioner', 'sa:hasRiskTier', 'sa:MediumRisk'],
    [':BedsideLamp', 'sa:hasRiskTier', 'sa:LowRisk'],
    ['sa:MediumRisk', 'rdfs:label', '"Medium: Guarded"'],
    ['sa:ThermalHazardRule', 'sa:minSafe', 18],
    ['sa:ThermalHazardRule', 'sa:maxSafe', 30],
    [':NightMode_4', 'sa:targetValue', 25],
    [':H10', 'sa:resolvedEntity', ':BedroomCeilingLight']
  ];
  spots.forEach(function (sp) {
    var p = sp[1] === 'a:type' ? term('a:') : term(sp[1]);
    assert.ok(st.has(term(sp[0]), p, term(sp[2])), 'missing ' + sp.join(' '));
  });
  assert.equal(spots.length, 15);
  // Negative checks (ADR 0003 D1/D2)
  assert.equal(st.count(null, T.iri('https://w3id.org/bot#hasElement'), null), 0, 'bot:hasElement is never asserted');
  assert.equal(st.count(T.iri(P.sa + 'TurnOn'), T.iri(P.sa + 'hasRiskTier'), null), 0, 'tiers attach to devices, not commands');
  assert.equal(st.count(T.iri(P[''] + 'NightMode'), T.iri(P.sa + 'hasRiskTier'), null), 0, 'preset tiers are computed');
  assert.equal(st.count(null, null, T.iri(P.saref + 'OnState')), 0, 'saref:OnState (deleted in v4.1.1) unused');
});

test('excluded constructs throw', function () {
  var SA = L.load().SA, st = SA.kg.resolver.triples();
  ['SELECT ?a WHERE { { ?a ?b ?c } UNION { ?a ?b ?c } }', 'ASK { ?a ?b ?c }', 'SELECT (COUNT(?a) AS ?n) WHERE { ?a ?b ?c }',
    'SELECT ?a WHERE { ?a rdfs:subClassOf+ ?c }', 'SELECT ?a WHERE { BIND(1 AS ?a) }', 'CONSTRUCT { ?a ?b ?c } WHERE { ?a ?b ?c }']
    .forEach(function (q) { assert.throws(function () { SA.kg.sparql.query(st, q); }, q); });
  assert.throws(function () { SA.kg.turtle.parse('@prefix : <x#> . :a :b ( :c :d ) .'); }, /collection|\(|line/i);
});

test('CQ5 text is exactly the resolver panel query for Turn On / sa:Light', function () {
  var SA = L.load().SA;
  assert.equal(SA.kg.competencyQuestions[4].sparql, SA.kg.resolver.candidateQuery('sa:Light', 'sa:TurnOn'));
  assert.equal(SA.kg.competencyQuestions.length, 16);
});
