'use strict';
/* Closed-loop tests: episode + approvals + rollback + ErrP, with the REAL KG resolver/mirror and policy modules
 * when they exist on disk (otherwise the episode's documented fallbacks run). Fake clock. */
const test = require('node:test');
const assert = require('node:assert');
const { load } = require('./_harness.js');

const KG = ['js/config/kg.js', 'js/config/policy.js', 'js/config/ui.js', 'js/kg/ontology.js', 'js/kg/turtle.js',
  'js/kg/triplestore.js', 'js/kg/sparql.js', 'js/kg/resolver.js', 'js/kg/mirror.js', 'js/policy/risk.js', 'js/policy/policy.js'];
const ERR = 'Possible Error Detected • ErrP Deflection at FCz (-8.4 µV)';
const OK = 'No Error Detected • Action Confirmed';

function boot() {
  const env = load({ fakeClock: true, extra: KG });
  const SA = env.SA;
  if (env.errors.length) throw new Error(env.errors.join('\n'));
  ['safety.audit', 'kg.resolver', 'kg.mirror', 'errp.memory', 'errp.detector', 'safety.rollback', 'safety.approvals', 'safety.episode']
    .forEach(p => { const m = p.split('.').reduce((o, k) => o && o[k], SA); if (m && m.init) m.init(); });
  const ev = [];
  ['policy:decided', 'episode:phase', 'errp:observed', 'action:executed', 'action:rolledBack', 'action:confirmed',
    'action:flagged', 'approval:requested', 'approval:resolved', 'errp:observeStart'].forEach(e => SA.bus.on(e, p => ev.push([e, p])));
  return { SA, ev, real: !!(SA.kg && SA.kg.resolve && SA.policy && SA.policy.decide) };
}
function act(SA, id, command, args, kind) {
  SA.bus.emit('eeg:decoded', { token: 'SELECT', cls: 'feet', conf: SA.store.get('decoder.sliders.neural'), decoded: false });
  SA.bus.emit('ui:actionRequested', { target: { kind: kind || 'device', id }, command, args: args || {}, origin: { screen: 'S4', index: 0 } });
}
const last = (ev, name) => { for (let i = ev.length - 1; i >= 0; i--) if (ev[i][0] === name) return ev[i][1]; return null; };
const ep = (SA) => SA.store.get('episode');

test('canonical journey: EXECUTE -> observing -> [Simulate ErrP] -> rollback ON➔OFF, Bedside Lamp offered; Retry -> [No ErrP] confirms', async () => {
  const { SA, ev, real } = boot();
  act(SA, 'BedroomCeilingLight', 'TurnOn');
  const d = last(ev, 'policy:decided');
  assert.strictEqual(d.decision, 'EXECUTE');
  if (real) { assert.strictEqual(d.c, 0.8188); assert.strictEqual(d.s, 0.89); }
  assert.strictEqual(ep(SA).phase, 'deciding', 'decision dwell inside the lockout');
  // lockout: a second request during the dwell/observation is ignored
  act(SA, 'BedsideLamp', 'TurnOn');
  assert.strictEqual(ep(SA).action.id, 'BedroomCeilingLight');
  SA.clock.advance(800);
  assert.strictEqual(ep(SA).phase, 'observing');
  assert.strictEqual(SA.store.get('devices.BedroomCeilingLight.power'), 'on');
  const os = last(ev, 'errp:observeStart');
  assert.ok(Math.abs(os.pi - (1 - d.c)) < 1e-12); assert.strictEqual(os.costClass, 'light-select');
  SA.bus.emit('errp:inject', { kind: 'error', source: 'operator' });
  const r = last(ev, 'errp:observed');
  assert.strictEqual(r.decision, 'rollback', `q=${r.q}`);
  const e1 = ep(SA);
  assert.strictEqual(e1.outcome, 'rolledBack');
  assert.strictEqual(e1.observation.status, ERR);
  assert.strictEqual(SA.store.get('devices.BedroomCeilingLight.power'), 'off');
  const rb = last(ev, 'action:rolledBack');
  assert.strictEqual(rb.steps[0].before.power, 'on'); assert.strictEqual(rb.steps[0].after.power, 'off');
  if (real) assert.strictEqual(e1.alternative && e1.alternative.label, 'Bedside Lamp');
  if (!real) return;
  // Retry -> Bedside Lamp through the full policy
  SA.bus.emit('ui:outcomeChoice', { episodeId: e1.id, choice: 'retry' });
  const d2 = last(ev, 'policy:decided');
  assert.ok(['EXECUTE', 'CONFIRM'].includes(d2.decision), d2.decision);
  if (d2.decision === 'CONFIRM') SA.bus.emit('ui:confirmAccepted', { episodeId: ep(SA).id }); else SA.clock.advance(800);
  assert.strictEqual(ep(SA).phase, 'observing');
  SA.bus.emit('errp:inject', { kind: 'correct', source: 'operator' });
  assert.strictEqual(ep(SA).observation.status, OK);
  assert.strictEqual(ep(SA).outcome, 'confirmed');
  assert.strictEqual(SA.store.get('devices.BedsideLamp.power'), 'on');
  await SA.safety.audit.pending();
  const types = SA.safety.audit.entries().map(e => e.type);
  for (const t of ['RESOLVE', 'DECISION', 'EXECUTE', 'ERRP_OBS', 'ROLLBACK', 'CONFIRMED']) assert.ok(types.includes(t), t);
  assert.strictEqual((await SA.safety.audit.verify()).ok, true);
});

test('false rollback -> Return to Home -> re-select Ceiling: CONFIRM (h-flag), never REJECT (ADR 0002 D18)', () => {
  const { SA, ev, real } = boot();
  act(SA, 'BedroomCeilingLight', 'TurnOn'); SA.clock.advance(800);
  SA.bus.emit('errp:inject', { kind: 'error', source: 'operator' });
  SA.bus.emit('ui:outcomeChoice', { episodeId: ep(SA).id, choice: 'home' });
  assert.strictEqual(ep(SA).phase, 'idle');
  act(SA, 'BedroomCeilingLight', 'TurnOn');
  const d = last(ev, 'policy:decided');
  assert.strictEqual(d.decision, 'CONFIRM', JSON.stringify(d.trace));
  if (real) assert.strictEqual(d.s, 0.89, 'penalty never touches s');
  SA.bus.emit('ui:confirmAccepted', { episodeId: ep(SA).id });
  assert.strictEqual(SA.store.get('devices.BedroomCeilingLight.power'), 'on');
  // post-CONFIRM prior pi' = (1-c) f / ((1-c) f + c t)
  const c = d.c, pi = (1 - c) * 0.074 / ((1 - c) * 0.074 + c * 0.913);
  assert.ok(Math.abs(last(ev, 'errp:observeStart').pi - Math.max(0.02, pi)) < 1e-12);
});

test('preset at default sliders: post-preview prior pi\' floors at 0.02, detector KEEPS and reports disagreement (never forced)', () => {
  const { SA, ev } = boot();
  act(SA, 'NightMode', 'Activate', {}, 'preset');
  SA.bus.emit('ui:confirmAccepted', { episodeId: ep(SA).id });
  assert.strictEqual(last(ev, 'errp:observeStart').pi, 0.02);
  SA.bus.emit('errp:inject', { kind: 'error', source: 'operator' });
  const r = last(ev, 'errp:observed');
  assert.strictEqual(r.decision, r.q > Math.max(r.tStar, r.pi) ? 'rollback' : 'keep');
  assert.strictEqual(r.decision, 'keep', `q=${r.q}`);
  assert.strictEqual(ep(SA).observation.disagreed, true);
  assert.strictEqual(SA.store.get('devices.LivingRoomLight.power'), 'off');
});

test('preset Night Mode (n = 0.60): preview(=confirm) -> execute -> ErrP rollback restores every device atomically', () => {
  const { SA, ev } = boot();
  SA.store.set('decoder.sliders.neural', 0.60, 'decoder');
  const before = SA.store.get('devices');
  act(SA, 'NightMode', 'Activate', {}, 'preset');
  assert.strictEqual(ep(SA).phase, 'confirm');
  SA.bus.emit('ui:confirmAccepted', { episodeId: ep(SA).id });
  assert.strictEqual(SA.store.get('devices.LivingRoomLight.power'), 'off');
  assert.strictEqual(SA.store.get('devices.AirConditioner.setpoint'), 25);
  assert.strictEqual(last(ev, 'errp:observeStart').costClass, 'preset');
  SA.bus.emit('errp:inject', { kind: 'error', source: 'operator' });
  assert.strictEqual(last(ev, 'errp:observed').decision, 'rollback');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(SA.store.get('devices'))), JSON.parse(JSON.stringify(before)));
  assert.strictEqual(ep(SA).alternative.kind, 'preset');
});

test('High tier: AC 17°C -> CAREGIVER -> approve -> executes; ErrP is log-only (no rollback)', async () => {
  const { SA, ev } = boot();
  act(SA, 'AirConditioner', 'SetTemperature', { value: 17 });
  assert.strictEqual(last(ev, 'policy:decided').decision, 'CAREGIVER');
  assert.strictEqual(ep(SA).phase, 'pendingCaregiver');
  const req = last(ev, 'approval:requested');
  assert.match(req.reason, /17°C is below the 18°C minimum/);
  SA.bus.emit('caregiver:approve', { approvalId: req.approvalId });
  assert.strictEqual(last(ev, 'approval:resolved').outcome, 'approved');
  assert.strictEqual(SA.store.get('devices.AirConditioner.setpoint'), 17);
  SA.bus.emit('errp:inject', { kind: 'error', source: 'operator' });
  assert.strictEqual(last(ev, 'errp:observed').decision, 'log');
  assert.strictEqual(SA.store.get('devices.AirConditioner.setpoint'), 17);
  assert.strictEqual(ep(SA).outcome, 'logged');
  await SA.safety.audit.pending();
  const types = SA.safety.audit.entries().map(e => e.type);
  assert.ok(types.includes('APPROVAL_REQUESTED') && types.includes('APPROVED') && !types.includes('ROLLBACK'));
});

test('approvals: reject, withdraw, expiry (never auto-approved), seeded ap-seed-1 runs the real path', async () => {
  const { SA, ev } = boot();
  act(SA, 'AirConditioner', 'SetTemperature', { value: 17 });
  SA.bus.emit('caregiver:reject', { approvalId: last(ev, 'approval:requested').approvalId });
  assert.strictEqual(ep(SA).phase, 'idle'); assert.strictEqual(SA.store.get('devices.AirConditioner.setpoint'), 24);
  act(SA, 'AirConditioner', 'SetTemperature', { value: 17 });
  SA.bus.emit('ui:requestWithdrawn', { episodeId: ep(SA).id, approvalId: last(ev, 'approval:requested').approvalId });
  assert.strictEqual(last(ev, 'approval:resolved').outcome, 'withdrawn'); assert.strictEqual(ep(SA).phase, 'idle');
  act(SA, 'AirConditioner', 'SetTemperature', { value: 17 });
  SA.clock.advance(300000);
  assert.strictEqual(last(ev, 'approval:resolved').outcome, 'expired');
  assert.strictEqual(SA.store.get('devices.AirConditioner.setpoint'), 24);
  SA.bus.emit('caregiver:approve', { approvalId: 'ap-seed-1' });
  assert.strictEqual(SA.store.get('devices.AirConditioner.setpoint'), 16);
  await SA.safety.audit.pending();
  const obs = SA.safety.audit.entries().filter(e => e.type === 'ERRP_OBS' && e.data.seeded);
  assert.strictEqual(obs.length, 1); assert.strictEqual(obs[0].data.decision, 'log');
});

test('reset during observation: no compensation, EPISODE_ABORTED, no device mutation after 5 s', async () => {
  const { SA } = boot();
  SA.store.set('prefs.errpAutoConfirm', true, 'harness');
  act(SA, 'BedroomCeilingLight', 'TurnOn'); SA.clock.advance(800);
  assert.strictEqual(ep(SA).phase, 'observing');
  await SA.core.reset();
  const after = JSON.stringify(SA.store.get('devices'));
  SA.clock.advance(5000);
  assert.strictEqual(JSON.stringify(SA.store.get('devices')), after);
  assert.strictEqual(SA.store.get('devices.BedroomCeilingLight.power'), 'off');
  await SA.safety.audit.pending();
  const types = SA.safety.audit.entries().map(e => e.type);
  assert.ok(types.includes('EPISODE_ABORTED')); assert.ok(!types.includes('ROLLBACK')); assert.strictEqual(types[types.length - 1], 'RESET');
});

test('auto-confirm runs the synthetic-correct epoch through the detector (decision computed)', () => {
  const { SA, ev } = boot();
  SA.store.set('prefs.errpAutoConfirm', true, 'harness');
  act(SA, 'BedroomCeilingLight', 'TurnOn'); SA.clock.advance(800);
  SA.clock.advance(1500);
  const r = last(ev, 'errp:observed');
  assert.ok(r && r.decision === 'keep' && r.source === 'synthetic');
  assert.strictEqual(ep(SA).observation.status, OK);
});
