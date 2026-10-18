'use strict';
var test = require('node:test'), assert = require('node:assert/strict');
var L = require('./_load.js');

var SA = L.load().SA;
function dec(n, s, tier, extra) { return SA.policy.decide(Object.assign({ n: n, s: s, tier: tier || 'Low' }, extra || {})); }

test('canonical case: c = 0.92 x 0.89 = 0.8188 -> EXECUTE (Low: Autonomic), pi = 0.181', function () {
  var d = dec(0.92, 0.89, 'Low');
  assert.equal(d.decision, 'EXECUTE');
  assert.equal(d.c, 0.8188);
  assert.equal(d.c.toFixed(3), '0.819');
  assert.equal((1 - d.c).toFixed(3), '0.181');
  assert.equal(d.tierLabel, 'Low: Autonomic');
  assert.equal(d.trace[0], 'c = 0.92 × 0.89 = 0.8188 ≥ 0.75 (Low) → EXECUTE');
});

test('ADR 0003 D14 table', function () {
  var rows = [
    [0.92, 0.89, 'Low', 'EXECUTE'], [0.80, 0.89, 'Low', 'CONFIRM'], [0.75, 0.89, 'Low', 'CONFIRM'],
    [0.60, 0.89, 'Low', 'CONFIRM'], [0.55, 0.89, 'Low', 'REJECT'], [0.45, 0.89, 'Low', 'REJECT'],
    [0.35, 0.89, 'Low', 'REJECT'], [0.92, 0.60, 'Low', 'CONFIRM'], [0.92, 0.84, 'Low', 'EXECUTE'],
    [0.92, 0.95, 'Medium', 'EXECUTE'], [0.92, 0.95, 'High', 'CAREGIVER'], [0.92, 0.57, 'Low', 'CONFIRM']
  ];
  rows.forEach(function (r) { assert.equal(dec(r[0], r[1], r[2]).decision, r[3], JSON.stringify(r)); });
  assert.equal(dec(0.92, 0.84).c, 0.7728);
  assert.equal(dec(0.92, 0.95, 'Medium').c, 0.874);
  assert.equal(dec(0.35, 0.89).trace[0], 'Neural floor: n = 0.35 < 0.40 → REJECT');
  assert.equal(dec(0.55, 0.89).reason, 'Not sure, please try again');
  assert.equal(dec(0.92, 0.89, 'Low', { hFlag: true, errpFactor: 0.5 }).decision, 'CONFIRM');
  assert.equal(dec(0.92, 0.89, 'Low', { noop: true, noopReason: 'No change: Bedroom Ceiling Light is already ON' }).decision, 'REJECT');
});

test('neural slider sweep (s = 0.89): EXECUTE n >= 0.85, CONFIRM 0.57..0.84, REJECT n <= 0.56', function () {
  for (var k = 0; k <= 100; k++) {
    var n = k / 100, d = dec(n, 0.89).decision;
    var want = k >= 85 ? 'EXECUTE' : k >= 57 ? 'CONFIRM' : 'REJECT';
    assert.equal(d, want, 'n = ' + n);
  }
});

test('High tier is reached only after the reject rules; CAREGIVER reason is the thermal rule text', function () {
  var d = dec(0.92, 0.95, 'High', { ruleText: 'Setpoint 17°C is below the 18°C minimum' });
  assert.equal(d.decision, 'CAREGIVER');
  assert.equal(d.reason, 'Setpoint 17°C is below the 18°C minimum');
  assert.equal(dec(0.30, 0.95, 'High').decision, 'REJECT');
});

test('17 degC -> CAREGIVER through resolver + risk + policy; 6th Temp - from 24 reaches 18 -> EXECUTE', function () {
  var S = L.load().SA, ac = S.kg.mirror.readState('AirConditioner');
  for (var i = 1; i <= 7; i++) {
    var req = { kind: 'device', id: 'AirConditioner', command: 'Temp -' };
    var r = S.kg.resolve(req, { activeRoom: 'MasterBedroom' });
    var devs = S.kg.mirror.deviceStates();
    var risk = S.policy.risk.assess(req, devs);
    var d = S.policy.decide({ n: 0.92, s: r.semanticConfidence, tier: risk.tier, noop: r.noop, noopReason: r.noopReason,
      hFlag: r.hFlag, ruleText: risk.rule && risk.rule.text });
    if (i <= 6) {
      assert.equal(d.decision, 'EXECUTE', 'press ' + i);
      assert.equal(risk.tier, 'Medium');
      assert.equal(risk.tierLabel, 'Medium: Guarded');
      assert.equal(risk.costClass, 'setting-medium');
      S.kg.mirror.writeState('AirConditioner', r.after);      // what safety/rollback + mirror would do
    } else {
      assert.equal(r.after.setpoint, 17);
      assert.equal(risk.tier, 'High');
      assert.equal(risk.tierLabel, 'High: Caregiver Approval');
      assert.equal(risk.rule.text, 'Setpoint 17°C is below the 18°C minimum');
      assert.equal(d.decision, 'CAREGIVER');
    }
  }
  assert.equal(S.kg.mirror.readState('AirConditioner').setpoint, 18);
  assert.equal(ac.setpoint, 24);
});

test('thermal overlay is strict: 18 and 30 not High; 16 and 31 High; advisory band 18-20 / 26-30', function () {
  var devs = SA.kg.mirror.deviceStates();
  function at(v) { return SA.policy.risk.assess({ kind: 'device', id: 'AirConditioner', command: 'SetTemperature', args: { value: v } }, devs); }
  assert.equal(at(18).tier, 'Medium'); assert.equal(at(30).tier, 'Medium');
  assert.equal(at(17).tier, 'High'); assert.equal(at(16).tier, 'High'); assert.equal(at(31).tier, 'High');
  assert.equal(at(31).rule.text, 'Setpoint 31°C is above the 30°C maximum');
  assert.equal(at(19).advisory, 'Advisory: outside the 20–26 °C comfort band for impaired thermoregulation');
  assert.equal(at(27).advisory !== null, true);
  assert.equal(at(24).advisory, null); assert.equal(at(26).advisory, null); assert.equal(at(20).advisory, null);
  // overlay applies whatever the AC power state
  var off = JSON.parse(JSON.stringify(devs)); off.AirConditioner.power = 'off';
  assert.equal(SA.policy.risk.assess({ kind: 'device', id: 'AirConditioner', command: 'SetTemperature', args: { value: 17 } }, off).tier, 'High');
});

test('tier map: config tiers == KG sa:hasRiskTier for every device; preset tiers computed == config', function () {
  var st = SA.kg.resolver.triples(), devs = SA.kg.mirror.deviceStates();
  Object.keys(devs).forEach(function (id) {
    var t = SA.kg.sparql.values(SA.kg.sparql.query(st, 'SELECT ?n WHERE { :' + id + ' sa:hasRiskTier ?t . ?t sa:tierName ?n }'))[0].n;
    assert.equal(t, SA.config.policy.tiers[devs[id].kind], id);
  });
  Object.keys(SA.config.policy.presetTiers).forEach(function (p) {
    assert.equal(SA.policy.risk.assess({ kind: 'preset', id: p }, devs).tier, SA.config.policy.presetTiers[p], p);
  });
});

test('costClass per architecture 5.6', function () {
  var devs = SA.kg.mirror.deviceStates(), a = function (id, cmd, args) {
    return SA.policy.risk.assess({ kind: 'device', id: id, command: cmd, args: args || {} }, devs).costClass;
  };
  assert.equal(a('BedroomCeilingLight', 'TurnOn'), 'light-select');
  assert.equal(a('BedroomCeilingLight', 'SetBrightness', { value: 50 }), 'setting');
  assert.equal(a('CeilingFan', 'SetFanSpeed', { value: 'low' }), 'setting');
  assert.equal(a('SmartTV', 'Power'), 'power');
  assert.equal(a('SmartTV', 'VolumeUp'), 'setting');
  assert.equal(a('AirConditioner', 'SetMode', { value: 'dry' }), 'setting-medium');
  assert.equal(SA.policy.risk.assess({ kind: 'preset', id: 'NightMode' }, devs).costClass, 'preset');
});

test('canonical end-to-end: resolve + risk + decide -> EXECUTE; no-op -> REJECT', function () {
  var S = L.load().SA, req = { kind: 'device', id: 'BedroomCeilingLight', command: 'TurnOn' };
  var r = S.kg.resolve(req, { activeRoom: 'MasterBedroom' }), risk = S.policy.risk.assess(req, S.kg.mirror.deviceStates());
  var d = S.policy.decide({ n: 0.92, s: r.semanticConfidence, tier: risk.tier, noop: r.noop, hFlag: r.hFlag });
  assert.equal(r.actedOn.score.toFixed(2), '0.94'); assert.equal(Math.round(r.semanticConfidence * 100) + '%', '89%');
  assert.equal(risk.tierLabel, 'Low: Autonomic'); assert.equal(d.decision, 'EXECUTE');
  S.kg.mirror.writeState('BedroomCeilingLight', r.after);
  var r2 = S.kg.resolve(req, { activeRoom: 'MasterBedroom' });
  var d2 = S.policy.decide({ n: 0.92, s: r2.semanticConfidence, tier: 'Low', noop: r2.noop, noopReason: r2.noopReason });
  assert.equal(d2.decision, 'REJECT');
  assert.equal(d2.reason, 'No change: Bedroom Ceiling Light is already ON');
});
