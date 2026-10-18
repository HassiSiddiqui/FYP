'use strict';
const test = require('node:test');
const assert = require('node:assert');
const P = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
const deq = (a, b, m) => assert.deepStrictEqual(P(a), P(b), m);
const { load } = require('./_harness.js');

function setup() {
  const { SA } = load({ fakeClock: true });
  SA.safety.audit.init(); SA.safety.rollback.init();
  return SA;
}

test('rollback.plan: presets expand per ADR 0003, no-op steps omitted', () => {
  const SA = setup(), R = SA.safety.rollback, dev = SA.store.get('devices');
  const night = R.plan({ kind: 'preset', id: 'NightMode' }, dev);
  deq(night.map(s => s.deviceId), ['LivingRoomLight', 'AirConditioner']);  // diff from reset
  assert.strictEqual(night[1].after.setpoint, 25);
  deq(R.plan({ kind: 'preset', id: 'AllLightsOff' }, dev).map(s => s.deviceId), ['LivingRoomLight']);
  const cool = R.plan({ kind: 'preset', id: 'CoolingMode' }, dev);
  deq(cool.map(s => [s.deviceId, s.after.setpoint || s.after.speed]), [['AirConditioner', 22], ['CeilingFan', 'medium']]);
  const tv = R.plan({ kind: 'preset', id: 'WatchTV' }, dev);
  deq(tv.map(s => s.deviceId), ['SmartTV', 'BedsideLamp']);
  assert.strictEqual(tv[1].after.brightness, 25);
  assert.strictEqual(R.plan({ kind: 'device', id: 'LivingRoomLight', command: 'TurnOn' }, dev).length, 0);
  const on = R.plan({ kind: 'device', id: 'BedroomCeilingLight', command: 'TurnOn' }, dev);
  assert.strictEqual(on[0].before.power, 'off'); assert.strictEqual(on[0].after.power, 'on');
  assert.strictEqual(R.plan({ kind: 'device', id: 'SmartTV', command: 'VolumeUp' }, dev).length, 0, 'volume in standby is a no-op');
  assert.strictEqual(R.plan({ kind: 'device', id: 'AirConditioner', command: 'SetTemperature', args: { value: 17 } }, dev)[0].after.setpoint, 17);
});

test('preset rollback is atomic: execute then compensate restores every device in reverse order', async () => {
  const SA = setup(), R = SA.safety.rollback;
  const before = SA.store.get('devices');
  const changes = [];
  SA.bus.on('device:stateChanged', p => changes.push([p.deviceId, p.cause]));
  const steps = R.plan({ kind: 'preset', id: 'CoolingMode' }, before);
  const saga = R.execute('ep-1', steps, 'patient');
  assert.strictEqual(SA.store.get('devices.AirConditioner.setpoint'), 22);
  assert.strictEqual(SA.store.get('devices.CeilingFan.speed'), 'medium');
  const comp = R.compensate('ep-1', saga);
  deq(comp.map(s => s.deviceId), ['CeilingFan', 'AirConditioner'], 'reverse order');
  deq(SA.store.get('devices'), before);
  deq(changes, [['AirConditioner', 'execute'], ['CeilingFan', 'execute'], ['CeilingFan', 'compensate'], ['AirConditioner', 'compensate']]);
  deq(R.compensate('ep-1', saga), [], 'compensating twice is a no-op');
  await SA.safety.audit.pending();
  const types = SA.safety.audit.entries().map(e => e.type);
  deq(types, ['EXECUTE', 'ROLLBACK']);
  assert.strictEqual((await SA.safety.audit.verify()).ok, true);
});

test('preset execute is all-or-nothing: a failing step undoes the applied ones', () => {
  const SA = setup(), R = SA.safety.rollback;
  const before = SA.store.get('devices');
  const steps = R.plan({ kind: 'preset', id: 'WatchTV' }, before);
  const realSet = SA.store.set; let n = 0;
  SA.store.set = function (p, v, by) { if (p.startsWith('devices.') && ++n === 2) throw new Error('simulated actuator failure'); return realSet.call(this, p, v, by); };
  assert.throws(() => R.execute('ep-2', steps, 'patient'), /simulated actuator failure/);
  SA.store.set = realSet;
  deq(SA.store.get('devices'), before);
});

test('compensation skips a device changed after execute and never re-enters a thermal hazard', () => {
  const SA = setup(), R = SA.safety.rollback;
  const s1 = R.plan({ kind: 'preset', id: 'NightMode' }, SA.store.get('devices'));
  const saga = R.execute('ep-3', s1, 'patient');
  // someone else changes the AC after the preset
  SA.store.set('devices.AirConditioner.setpoint', 23, 'rollback');
  const comp = R.compensate('ep-3', saga);
  deq(comp.map(s => s.deviceId), ['LivingRoomLight']);
  assert.strictEqual(SA.store.get('devices.AirConditioner.setpoint'), 23);
  assert.strictEqual(SA.store.get('devices.LivingRoomLight.power'), 'on');
  // hazard: AC currently at 17 (approved), action to 20; compensation back to 17 is withheld
  SA.store.set('devices.AirConditioner.setpoint', 17, 'rollback');
  const s2 = R.plan({ kind: 'device', id: 'AirConditioner', command: 'SetTemperature', args: { value: 20 } }, SA.store.get('devices'));
  const sg2 = R.execute('ep-4', s2, 'patient');
  deq(R.compensate('ep-4', sg2), []);
  assert.strictEqual(SA.store.get('devices.AirConditioner.setpoint'), 20);
});
