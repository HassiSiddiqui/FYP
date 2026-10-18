'use strict';
// node --test research/tests/js/core/  — CORE unit tests (no DOM, core+input only).
const test = require('node:test');
const assert = require('node:assert');
const { loadPOC, scriptList, lint } = require('../run_node.js');

function core() {
  const r = loadPOC({ only: ['js/core/', 'js/config/initial-state.js', 'js/input/'], quiet: true });
  assert.deepStrictEqual(r.errors, []);
  return r.SA;
}

test('index.html script order matches the frozen contract head/tail', () => {
  const s = scriptList();
  assert.strictEqual(s[0], 'js/core/namespace.js');
  assert.strictEqual(s[1], 'js/config/initial-state.js');
  assert.strictEqual(s[s.length - 1], 'js/app.js');
  assert.strictEqual(s.length, 81);
  assert.ok(s.indexOf('js/core/bus.js') < s.indexOf('js/input/tokenbus.js'));
  assert.ok(s.indexOf('js/selftest/selftest.js') < s.indexOf('js/selftest/cases/core.js'));
});

test('store ownership and clone semantics', () => {
  const SA = core();
  SA.store.reset();
  assert.throws(() => SA.store.set('devices.BedsideLamp.power', 'on', 'ui'), /ui may not write devices/);
  assert.throws(() => SA.store.set('prefs.decodeAnimation', false, 'ui'), /may not write prefs/);
  SA.store.set('prefs.voice', true, 'ui');
  assert.strictEqual(SA.store.get('prefs.voice'), true);
  assert.throws(() => SA.store.patch('decoder', { mode: 'replay' }, 'episode'));
  SA.store.patch('decoder', { errpPin: 'x' }, 'episode');
  SA.store.set('devices.BedsideLamp.power', 'on', 'rollback');
  const snap = SA.store.snapshot();
  snap.devices.BedsideLamp.power = 'off';
  assert.strictEqual(SA.store.get('devices.BedsideLamp.power'), 'on');
  SA.store.set('prefs.reducedMotion', true, 'harness');
  SA.store.reset();
  assert.strictEqual(SA.store.get('prefs.reducedMotion'), true, 'reset keeps reducedMotion');
  const s2 = SA.store.snapshot();
  s2.prefs.reducedMotion = false;
  assert.ok(SA.util.deepEqual(s2, SA.config.initialState));
});

test('bus FIFO, defer ordering, error counting', () => {
  const SA = core();
  const order = [];
  SA.bus.on('a', () => { order.push('a'); SA.bus.emit('b'); order.push('a-end'); });
  SA.bus.on('b', () => order.push('b'));
  SA.bus.emit('a');
  assert.deepStrictEqual(order, ['a', 'a-end', 'b']);
  // reset requested from inside a handler keeps resetting -> store reset -> reset order
  SA.store.reset();
  const seq = [];
  SA.bus.on('demo:resetting', () => seq.push('resetting:' + SA.store.get('ui.screen')));
  SA.bus.on('demo:reset', () => seq.push('reset:' + SA.store.get('ui.screen')));
  SA.bus.on('demo:resetRequested', () => SA.core.resetRequested());
  SA.store.set('ui.screen', 'S3', 'ui');
  SA.bus.emit('demo:resetRequested', {});
  assert.deepStrictEqual(seq, ['resetting:S3', 'reset:S1']);
  const before = SA.bus.errorCount;
  SA.bus.on('boom', () => { throw new Error('x'); });
  SA.bus.emit('boom');
  assert.strictEqual(SA.bus.errorCount, before + 1);
  assert.ok(SA.consoleErrors >= 1);
});

test('clock: demo start time, speed, cancelAll', async () => {
  const SA = core();
  SA.clock.reset();
  assert.match(SA.clock.iso(), /^2026-03-01T21:00:0\d$/);
  SA.clock.speed = 10;
  let fired = 0, killed = 0;
  SA.clock.after(200, () => fired++);
  SA.clock.after(200, () => killed++);
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual(fired, 1);
  SA.clock.after(300, () => killed++);
  SA.clock.cancelAll();
  await new Promise((r) => setTimeout(r, 60));
  assert.strictEqual(killed, 1);
});

test('b64 float32 round trip', () => {
  const SA = core();
  const v = [0, 1.5, -8.4, 3.4e38, -1e-7];
  const d = SA.core.b64.decodeF32(SA.core.b64.encodeF32(v));
  assert.deepStrictEqual(Array.from(d), v.map(Math.fround));
  assert.strictEqual(SA.core.b64.encodeF32([1]), Buffer.from(new Float32Array([1]).buffer).toString('base64'));
});

test('keyboard map + tokenbus hygiene', () => {
  const SA = core();
  SA.store.reset();
  SA.input.tokenbus.init();
  const toks = [], drops = [], dash = [];
  SA.bus.on('input:token', (p) => toks.push(p.token));
  SA.bus.on('input:dropped', (p) => drops.push(p.reason));
  SA.bus.on('ui:dashboardToggleRequested', () => dash.push(1));
  const K = SA.input.keyboard;
  const press = (key, extra) => { SA.input.tokenbus.resetDebounce(); let pd = false; K.handle(Object.assign({ key, preventDefault: () => { pd = true; } }, extra)); return pd; };
  const map = { ArrowRight: 'NEXT', d: 'NEXT', D: 'NEXT', ArrowLeft: 'PREV', a: 'PREV', A: 'PREV', Enter: 'SELECT', ' ': 'SELECT', s: 'SELECT', S: 'SELECT', Escape: 'BACK', Backspace: 'BACK', w: 'BACK', W: 'BACK' };
  for (const k of Object.keys(map)) { toks.length = 0; press(k); assert.deepStrictEqual(toks, [map[k]], 'key ' + k); }
  assert.strictEqual(press(' '), true, 'Space preventDefault');
  assert.strictEqual(press('Backspace'), true, 'Backspace preventDefault');
  assert.strictEqual(press('d'), false);
  toks.length = 0;
  press('d', { repeat: true }); press('d', { ctrlKey: true });
  press('a', { target: { closest: (s) => (/select/.test(s) ? {} : null) } });
  assert.deepStrictEqual(toks, []);
  press('c'); press('C');
  assert.strictEqual(dash.length, 2);
  SA.input.tokenbus.resetDebounce();
  SA.input.tokenbus.emitToken('right', 'keyboard');
  SA.input.tokenbus.emitToken('right', 'keyboard');
  assert.strictEqual(drops[drops.length - 1], 'debounce');
  SA.store.set('ui.dashboardOpen', true, 'ui');
  SA.input.tokenbus.emitToken('left', 'auto');
  assert.strictEqual(drops[drops.length - 1], 'dashboard');
  // operator glue + harness:set
  SA.store.set('ui.dashboardOpen', false, 'ui');
  toks.length = 0;
  SA.input.tokenbus.resetDebounce();
  SA.bus.emit('input:operatorToken', { cls: 'tongue' });
  assert.deepStrictEqual(toks, ['BACK']);
  const rooms = [];
  SA.bus.on('context:roomChanged', (p) => rooms.push(p));
  SA.bus.emit('harness:set', { key: 'context.activeRoom', value: 'LivingRoom' });
  assert.strictEqual(SA.store.get('context.activeRoom'), 'LivingRoom');
  assert.strictEqual(rooms[0].prev, 'MasterBedroom');
});

test('lint: no forbidden APIs in POC', () => {
  const r = lint();
  const mine = r.problems.filter((p) => !/missing/.test(p));
  assert.deepStrictEqual(mine, []);
});
