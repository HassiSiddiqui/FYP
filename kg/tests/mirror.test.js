'use strict';
var test = require('node:test'), assert = require('node:assert/strict');
var L = require('./_load.js');

test('KG == store at reset: deviceStates() equals SA.config.initialState.devices', function (t) {
  var SA = L.load().SA;
  if (!SA.config.initialState) { t.skip('config/initial-state.js (CORE) not present yet'); return; }
  assert.deepStrictEqual(L.plain(SA.kg.mirror.deviceStates()), L.plain(SA.config.initialState.devices));
});

test('device:stateChanged rewrites state triples (round trip for every kind)', function () {
  var env = L.load({ bus: true }), SA = env.SA, M = SA.kg.mirror;
  var cases = {
    BedsideLamp: { power: 'on', brightness: 25 },
    CeilingFan: { power: 'on', speed: 'medium' },
    AirConditioner: { power: 'off', setpoint: 22, mode: 'dry' },
    SmartTV: { power: 'on', channel: 99, volume: 35 }
  };
  Object.keys(cases).forEach(function (id) {
    var before = M.readState(id), after = Object.assign({}, before, cases[id]);
    SA.bus.emit('device:stateChanged', { deviceId: id, before: before, after: after, cause: 'execute' });
    assert.deepStrictEqual(L.plain(M.readState(id)), L.plain(after), id);
  });
  var fan = M.readState('CeilingFan'), fan2 = Object.assign({}, fan, { speed: null, power: 'off' });
  SA.bus.emit('device:stateChanged', { deviceId: 'CeilingFan', after: fan2 });
  assert.equal(M.readState('CeilingFan').speed, null);
  assert.equal(SA.kg.resolver.cq(8).rows[0].speed, null);
});

test('effects: clamps, wraps, standby no-ops, Off keeps last fan speed', function () {
  var M = L.load().SA.kg.mirror, devs = M.deviceStates();
  assert.equal(M.effect(Object.assign({}, devs.AirConditioner, { setpoint: 32 }), 'Temp +').setpoint, 32);
  assert.equal(M.effect(Object.assign({}, devs.SmartTV, { power: 'on', channel: 99 }), 'ChannelUp').channel, 1);
  assert.equal(M.effect(Object.assign({}, devs.SmartTV, { power: 'on', channel: 1 }), 'ChannelDown').channel, 99);
  assert.equal(M.effect(Object.assign({}, devs.SmartTV, { power: 'on', volume: 100 }), 'VolumeUp').volume, 100);
  assert.equal(M.effect(Object.assign({}, devs.SmartTV, { power: 'on', volume: 20 }), 'VolumeUp').volume, 25);
  assert.deepStrictEqual(L.plain(M.effect(devs.SmartTV, 'VolumeUp')), L.plain(devs.SmartTV));
  assert.equal(M.effect(devs.SmartTV, 'TurnOff').power, 'standby');
  var fanOn = M.effect(devs.CeilingFan, 'SetFanSpeed', { value: 'high' });
  assert.deepStrictEqual([fanOn.power, fanOn.speed], ['on', 'high']);
  var fanOff = M.effect(fanOn, 'TurnOff');
  assert.deepStrictEqual([fanOff.power, fanOff.speed], ['off', 'high']);
  var lamp = M.effect(devs.BedsideLamp, 'SetBrightness', { value: 50 });
  assert.deepStrictEqual([lamp.power, lamp.brightness], ['on', 50]);
});

test('action:confirmed appends a confirmed execution; context:roomChanged adds a room observation', function () {
  var env = L.load({ bus: true }), SA = env.SA;
  SA.kg.resolve({ episodeId: 'ep-7', kind: 'device', id: 'BedsideLamp', command: 'TurnOn' }, { activeRoom: 'MasterBedroom' });
  SA.bus.emit('action:confirmed', { episodeId: 'ep-7', sagaId: 's-1' });
  var rows = SA.kg.resolver.cq(16).rows;
  assert.equal(rows[0].d, ':BedsideLamp');
  assert.equal(rows.filter(function (r) { return r.d === ':BedsideLamp'; }).length, 3);
  SA.bus.emit('context:roomChanged', { room: 'LivingRoom', prev: 'MasterBedroom', source: 'operator' });
  var cq4 = SA.kg.resolver.cq(4).rows[0];
  assert.equal(cq4.room, ':LivingRoom'); assert.equal(cq4.confidence, 0.95);
  var r = SA.kg.resolve({ kind: 'device', id: 'LivingRoomLight', command: 'TurnOff' }, { activeRoom: 'LivingRoom' });
  assert.equal(r.spatialContext, 'Living Room (Active User Room)');
  assert.equal(r.actedOn.score, 0.9);     // .35 + .30 + .20 + .15 * (1/3), no TurnOff history
});
