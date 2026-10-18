'use strict';
var test = require('node:test'), assert = require('node:assert/strict');
var L = require('./_load.js');

function canon(SA, extra) {
  return SA.kg.resolve(Object.assign({ episodeId: 'ep-1', kind: 'device', id: 'BedroomCeilingLight', command: 'TurnOn' }, extra || {}),
    { activeRoom: 'MasterBedroom', roomConfidence: 0.95 });
}
function byId(r) { var o = {}; r.ranked.forEach(function (x) { o[x.id] = x; }); return o; }

test('canonical scores 0.94 / 0.88 / 0.38, s = 0.89, README panel strings', function () {
  var env = L.load({ bus: true }), SA = env.SA, r = canon(SA), m = byId(r);
  assert.equal(m.BedroomCeilingLight.score, 0.94);
  assert.equal(m.BedsideLamp.score, 0.88);
  assert.equal(m.LivingRoomLight.score, 0.38);
  assert.ok(Math.abs(m.BedroomCeilingLight.score - 0.94) < 1e-9);
  assert.equal(m.BedroomCeilingLight.score.toFixed(2), '0.94');
  assert.equal(r.semanticConfidence, 0.89);
  assert.equal(r.intentLabel, 'Turn On Light');
  assert.equal(r.spatialContext, 'Master Bedroom (Active User Room)');
  assert.equal(r.actedOn.iri, ':BedroomCeilingLight');
  assert.equal(r.kgTop.id, 'BedroomCeilingLight');
  assert.deepStrictEqual(L.plain(r.ranked.map(function (x) { return x.id; })), ['BedroomCeilingLight', 'BedsideLamp', 'LivingRoomLight']);
  assert.deepStrictEqual(L.plain(m.LivingRoomLight.features), { fT: 1, fS: 0, fX: 0, fR: 0.2 });
  assert.equal(r.noop, false);
  assert.equal(r.hFlag, false);
  assert.equal(env.events.filter(function (e) { return e.evt === 'kg:resolved'; }).length, 1);
});

test('the displayed query is the query actually executed (lastQuery === query.text === CQ5)', function () {
  var SA = L.load().SA, r = canon(SA);
  assert.equal(r.query.text, SA.kg.resolver.lastQuery);
  assert.equal(r.query.text, SA.kg.competencyQuestions[4].sparql);
  var rerun = SA.kg.sparql.query(SA.kg.resolver.triples(), SA.kg.resolver.lastQuery);
  assert.equal(rerun.rows.length, 3);
});

test('history mutation moves S (not hard-coded): Retry -> Bedside confirmed gives 0.925 / 0.895', function () {
  var SA = L.load().SA;
  SA.kg.mirror.recordConfirmed('BedsideLamp', 'TurnOn', 'MasterBedroom');
  var m = byId(canon(SA));
  assert.equal(m.BedroomCeilingLight.score, 0.925);
  assert.equal(m.BedsideLamp.score, 0.895);
});

test('a confirmed ceiling activation keeps the ceiling at 6/10 (H10 drops out)', function () {
  var SA = L.load().SA;
  SA.kg.mirror.recordConfirmed('BedroomCeilingLight', 'TurnOn', 'MasterBedroom');
  var m = byId(canon(SA));
  assert.equal(m.BedroomCeilingLight.score, 0.94);
  assert.deepStrictEqual(L.plain(m.BedroomCeilingLight.recency), { n: 6, K: 10 });
});

test('ErrP memory (ADR 0002 D18): M = 0.5 flips ranking to Bedside, s unchanged, h-flag set', function () {
  var SA = L.load().SA;
  SA.kg.resolver.registerModifier('errpMemory', function (id, cmd, room) {
    return id === 'BedroomCeilingLight' && cmd === 'TurnOn' && room === 'MasterBedroom' ? 0.5 : 1;
  });
  var r = canon(SA), m = byId(r);
  assert.equal(m.BedroomCeilingLight.score, 0.94, 'panel shows the unpenalised S');
  assert.equal(m.BedroomCeilingLight.scorePenalised, 0.47);
  assert.equal(r.ranked[0].id, 'BedsideLamp', 'ranking flip');
  var second = r.ranked.filter(function (x) { return x.id !== 'BedroomCeilingLight'; })[0];
  assert.equal(second.id, 'BedsideLamp', 'second-best rule');
  assert.equal(r.semanticConfidence, 0.89, 'M never touches s');
  assert.equal(r.hFlag, true);
  assert.ok(r.explanation.some(function (l) { return /ErrP memory ×0\.50 \(ranking only\)/.test(l); }));
  var d = SA.policy.decide({ n: 0.92, s: r.semanticConfidence, tier: 'Low', noop: r.noop, hFlag: r.hFlag, errpFactor: r.errpFactor });
  assert.equal(d.decision, 'CONFIRM', 'false rollback -> re-select ceiling -> CONFIRM, never REJECT');
});

test('sensitivity: f_R in {0.4..0.8} -> S in {0.91, 0.925, 0.94, 0.955, 0.97}', function () {
  // S = 0.35 + 0.30 + 0.20 + 0.15 f_R, rounded once
  var expect = [0.91, 0.925, 0.94, 0.955, 0.97];
  [0.4, 0.5, 0.6, 0.7, 0.8].forEach(function (fR, i) {
    var S = Math.round((0.35 + 0.30 + 0.20 + 0.15 * fR + Number.EPSILON) * 1e4) / 1e4;
    assert.equal(S, expect[i]);
  });
});

test('no-op guard: Turn On an already-ON light; TV channel in Standby; AC Temp - at 16', function () {
  var SA = L.load().SA;
  var r = SA.kg.resolve({ kind: 'device', id: 'LivingRoomLight', command: 'TurnOn' }, { activeRoom: 'MasterBedroom' });
  assert.equal(r.noop, true);
  assert.equal(r.noopReason, 'No change: Living Room Light is already ON');
  var tv = SA.kg.resolve({ kind: 'device', id: 'SmartTV', command: 'ChannelUp' }, { activeRoom: 'MasterBedroom' });
  assert.equal(tv.noop, true);
  assert.equal(tv.noopReason, 'Smart TV is in Standby');
  SA.kg.mirror.writeState('AirConditioner', { kind: 'ac', power: 'on', setpoint: 16, mode: 'cool' });
  var ac = SA.kg.resolve({ kind: 'device', id: 'AirConditioner', command: 'SetTemperature', args: { delta: -1 } }, { activeRoom: 'MasterBedroom' });
  assert.equal(ac.noop, true);
  assert.equal(ac.noopReason, 'No change: Air Conditioner is already at 16°C');
});

test('Living Room Light Turn Off from the bedroom: S 0.60 (no history -> uniform 1/3), s 0.57', function () {
  var SA = L.load().SA;
  var r = SA.kg.resolve({ kind: 'device', id: 'LivingRoomLight', command: 'TurnOff' }, { activeRoom: 'MasterBedroom' });
  assert.equal(r.actedOn.score, 0.6);
  assert.equal(r.semanticConfidence, 0.57);
  assert.equal(r.noop, false);
});

test('single-candidate devices score 1.00 -> s = 0.95 (fan speed, AC setpoint, TV power)', function () {
  var SA = L.load().SA;
  [['CeilingFan', 'SetFanSpeed', { value: 'medium' }], ['AirConditioner', 'SetTemperature', { delta: -1 }], ['SmartTV', 'Power', {}]]
    .forEach(function (c) {
      var r = SA.kg.resolve({ kind: 'device', id: c[0], command: c[1], args: c[2] }, { activeRoom: 'MasterBedroom' });
      assert.equal(r.actedOn.score, 1, c[0]);
      assert.equal(r.semanticConfidence, 0.95, c[0]);
    });
  var ac = SA.kg.resolve({ kind: 'device', id: 'AirConditioner', command: 'SetTemperature', args: { delta: -1 } }, {});
  assert.equal(ac.intentLabel, 'Set Temperature 23°C');
  assert.equal(SA.kg.resolve({ kind: 'device', id: 'SmartTV', command: 'Power' }, {}).command, 'TurnOn');
});

test('presets: s = 1.00 (KG-validated n/n steps), diffs from reset per ADR 0003 D18', function () {
  var SA = L.load().SA;
  var diff = function (id) {
    var r = SA.kg.resolve({ kind: 'preset', id: id });
    assert.equal(r.semanticConfidence, 1);
    assert.equal(r.query.text, SA.kg.resolver.lastQuery);
    return r.steps.filter(function (s) { return !s.noop; }).map(function (s) { return s.deviceId + ':' + s.command; });
  };
  assert.deepStrictEqual(L.plain(diff('NightMode')), ['LivingRoomLight:TurnOff', 'AirConditioner:SetTemperature']);
  assert.deepStrictEqual(L.plain(diff('AllLightsOff')), ['LivingRoomLight:TurnOff']);
  assert.deepStrictEqual(L.plain(diff('CoolingMode')), ['AirConditioner:SetTemperature', 'CeilingFan:SetFanSpeed']);
  assert.deepStrictEqual(L.plain(diff('WatchTV')), ['SmartTV:TurnOn', 'BedsideLamp:SetBrightness']);
  var wt = SA.kg.resolve({ kind: 'preset', id: 'WatchTV' });
  assert.equal(wt.semanticText, '100% (explicit routine, KG-validated 3/3 steps)');
  var lamp = wt.steps.filter(function (s) { return s.deviceId === 'BedsideLamp'; })[0];
  assert.equal(lamp.after.power, 'on'); assert.equal(lamp.after.brightness, 25);
});

test('demo:reset reloads the canonical TTL (history and state restored)', function () {
  var env = L.load({ bus: true }), SA = env.SA;
  SA.kg.mirror.recordConfirmed('BedsideLamp', 'TurnOn', 'MasterBedroom');
  SA.bus.emit('device:stateChanged', { deviceId: 'BedroomCeilingLight', after: { kind: 'light', power: 'on', brightness: 100 } });
  assert.equal(SA.kg.mirror.readState('BedroomCeilingLight').power, 'on');
  SA.bus.emit('demo:reset', { resetSeq: 1 });
  assert.equal(SA.kg.mirror.readState('BedroomCeilingLight').power, 'off');
  assert.equal(byId(canon(SA)).BedroomCeilingLight.score, 0.94);
});
