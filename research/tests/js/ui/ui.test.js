/* UI builder Node tests: README strings, screen table, headless canonical + rollback journeys (DOM-free navigator).
 * Run: node --test research/tests/js/ui/ */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadPOC } = require('../run_node.js');
const deq = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m);

function boot() {
  const r = loadPOC({ allowMissing: true, quiet: true });
  const SA = r.SA;
  SA.app.start({ headless: true });
  if (SA.clock) SA.clock.speed = 20;
  return SA;
}
const CLS = { NEXT: 'right', PREV: 'left', SELECT: 'feet', BACK: 'tongue' };
function tok(SA, token) {
  SA.bus.emit('eeg:decoded', { token, cls: CLS[token], conf: 0.92, probs: null, calibrated: false, decoded: false,
    mode: 'scripted', source: 'operator', trial: null, correct: null, graphs: null, ts: 0 });
}
function waitFor(SA, pred, ms) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    (function poll() {
      try { if (pred()) return resolve(); } catch (e) { /* keep polling */ }
      if (Date.now() - t0 > Math.max(ms || 0, 10000)) return reject(new Error('timeout waiting; ui=' + JSON.stringify(SA.store.get('ui')) + ' ep=' + JSON.stringify(SA.store.get('episode.phase'))));
      setTimeout(poll, 10);
    })();
  });
}

test('format: README hub subtitles, S3 states, errp string, pills', () => {
  const SA = boot();
  const F = SA.ui.format, d = SA.store.get('devices');
  assert.strictEqual(F.hubSubtitle('lights', d), '1 Active of 3');
  assert.strictEqual(F.hubSubtitle('fans', d), 'Ceiling Fan: OFF');
  assert.strictEqual(F.hubSubtitle('ac', d), '24°C • Cool Mode');
  assert.strictEqual(F.hubSubtitle('tv', d), 'Smart TV: Standby');
  assert.strictEqual(F.hubSubtitle('presets', d), '4 Multi-Device Semantic Routines');
  assert.strictEqual(F.errpStatus(-8.4), 'Possible Error Detected • ErrP Deflection at FCz (-8.4 µV)');
  assert.ok(F.errpStatus(-8.4).includes('-8.4 µV'));
  assert.strictEqual(F.transition({ deviceId: 'BedroomCeilingLight', before: d.BedroomCeilingLight, after: Object.assign({}, d.BedroomCeilingLight, { power: 'on' }) }),
    'Bedroom Ceiling Light: OFF ➔ ON');
  assert.strictEqual(F.eegPill({ mode: 'scripted' }), 'EEG: Simulation Mode');
  assert.strictEqual(F.decisionChip('CAREGIVER'), '⚑ CAREGIVER APPROVAL');
  assert.strictEqual(SA.config.ui.strings.observing, '“Observing post-action EEG...”');
});

test('screens: README items/titles per screen + BFS', () => {
  const SA = boot();
  const s = { ui: SA.store.get('ui'), devices: SA.store.get('devices') };
  const T = (id) => SA.ui.screens[id].items(s).map((i) => i.title);
  deq(T('S1'), ['Visual Navigation', 'Audio-Assisted Navigation']);
  deq(T('S2'), ['Lights', 'Fans', 'Air Conditioner', 'TV & Media', 'Presets']);
  deq(SA.ui.screens.S2.items(s).map((i) => i.subtitle),
    ['1 Active of 3', 'Ceiling Fan: OFF', '24°C • Cool Mode', 'Smart TV: Standby', '4 Multi-Device Semantic Routines']);
  deq(T('S3'), ['Bedroom Ceiling Light', 'Bedside Lamp', 'Living Room Light']);
  deq(SA.ui.screens.S3.items(s).map((i) => i.subtitle), ['OFF', 'OFF', 'ON']);
  deq(T('S4'), ['Turn On', 'Turn Off', 'Adjust Brightness', 'Back']);
  deq(T('S6'), ['Night Mode', 'All Lights Off', 'Cooling Mode', 'Watch TV']);
  assert.strictEqual(SA.ui.screens.S4.title, 'Action Selection & Context Reasoning Panel');
  deq(SA.nav.shortestPath('S1', 'S4'), ['S1', 'S2', 'S3', 'S4']);
});

test('navigator: wrap-around, focus memory, S1 BACK no-op', () => {
  const SA = boot();
  tok(SA, 'BACK');
  assert.strictEqual(SA.store.get('ui.screen'), 'S1');
  assert.strictEqual(SA.store.get('ui.caption'), 'This is the first screen');
  tok(SA, 'PREV');
  assert.strictEqual(SA.store.get('ui.focus.S1'), 1, 'wraps to last');
  tok(SA, 'NEXT');
  assert.strictEqual(SA.store.get('ui.focus.S1'), 0);
  tok(SA, 'SELECT');
  assert.strictEqual(SA.store.get('ui.screen'), 'S2');
  assert.strictEqual(SA.store.get('ui.navMode'), 'visual');
  tok(SA, 'NEXT'); tok(SA, 'NEXT');            // AC
  tok(SA, 'SELECT');
  assert.strictEqual(SA.store.get('ui.screen'), 'devices/ac');
  tok(SA, 'BACK');
  assert.strictEqual(SA.store.get('ui.screen'), 'S2');
  assert.strictEqual(SA.store.get('ui.focus.S2'), 2, 'focus returns to AC card');
});

async function toS4TurnOn(SA) {
  tok(SA, 'SELECT');   // S1 -> S2
  tok(SA, 'SELECT');   // Lights -> S3
  tok(SA, 'SELECT');   // Bedroom Ceiling Light -> S4
  assert.strictEqual(SA.store.get('ui.screen'), 'S4');
  tok(SA, 'SELECT');   // Turn On
  await waitFor(SA, () => SA.store.get('ui.screen') === 'S5' && SA.store.get('ui.result.kind') === 'observing');
}

test('canonical journey: S1→S4 Turn On → EXECUTE → S5 observing → [No ErrP] confirmed', async () => {
  const SA = boot();
  let resolved = null, decided = null;
  SA.bus.on('kg:resolved', (p) => { resolved = p; });
  SA.bus.on('policy:decided', (p) => { decided = p; });
  await toS4TurnOn(SA);
  if (resolved) {
    assert.strictEqual(resolved.intentLabel, 'Turn On Light');
    assert.strictEqual(resolved.spatialContext, 'Master Bedroom (Active User Room)');
    assert.strictEqual(resolved.actedOn.iri, ':BedroomCeilingLight');
    assert.strictEqual(SA.ui.format.score(resolved.actedOn.score), '0.94');
  }
  assert.ok(decided, 'policy:decided emitted');
  assert.strictEqual(SA.ui.format.pct(decided.n), '92%');
  assert.strictEqual(SA.ui.format.pct(decided.s), '89%');
  assert.strictEqual(decided.decision, 'EXECUTE');
  assert.strictEqual(SA.ui.format.tierLabel(decided.tier), 'Low: Autonomic');
  const r = SA.store.get('ui.result');
  assert.strictEqual(r.status, '“Observing post-action EEG...”');
  assert.ok(r.transition.includes('Bedroom Ceiling Light: OFF ➔ ON'), r.transition);
  tok(SA, 'NEXT');   // locked: ignored
  assert.strictEqual(SA.store.get('ui.caption'), 'Observing — please wait');
  SA.bus.emit('errp:inject', { kind: 'correct', source: 'operator' });
  await waitFor(SA, () => SA.store.get('ui.result.kind') === 'success');
  const r2 = SA.store.get('ui.result');
  assert.strictEqual(r2.status, 'No Error Detected • Action Confirmed');
  assert.strictEqual(SA.store.get('devices.BedroomCeilingLight.power'), 'on');
  deq(r2.cards.map((c) => c.title), ['Continue', 'Return to Home']);
  tok(SA, 'SELECT');  // Continue → back to S4 with focus kept
  assert.strictEqual(SA.store.get('ui.screen'), 'S4');
  assert.strictEqual(SA.store.get('ui.focus.S4'), 0);
});

test('rollback journey: [Simulate ErrP] → -8.4 µV, ON ➔ OFF, Action Rolled Back, Bedside Lamp, [Retry]/[Return to Home]', async () => {
  const SA = boot();
  await toS4TurnOn(SA);
  SA.bus.emit('errp:inject', { kind: 'error', source: 'operator' });
  await waitFor(SA, () => /rollback/.test(SA.store.get('ui.result.kind') || ''));
  const r = SA.store.get('ui.result');
  assert.strictEqual(r.errp, 'Possible Error Detected • ErrP Deflection at FCz (-8.4 µV)');
  assert.ok(r.transition.includes('ON ➔ OFF'), r.transition);
  assert.strictEqual(r.status, 'Action Rolled Back');
  assert.strictEqual(SA.store.get('devices.BedroomCeilingLight.power'), 'off');
  assert.ok(r.alt && r.alt.label === 'Bedside Lamp', JSON.stringify(r.alt));
  deq(r.cards.map((c) => c.title), ['Retry', 'Return to Home']);
  assert.ok(r.cards.every((c) => c.bracketed));
  assert.strictEqual(r.cards[0].subtitle, 'Turn On Bedside Lamp');
  // Retry → full policy on the alternative (EXECUTE or CONFIRM)
  tok(SA, 'SELECT');
  await waitFor(SA, () => SA.store.get('ui.subState') === 'confirm' || SA.store.get('ui.result.kind') === 'observing', 5000);
  if (SA.store.get('ui.subState') === 'confirm') tok(SA, 'SELECT');
  await waitFor(SA, () => SA.store.get('ui.result.kind') === 'observing');
  assert.ok(SA.store.get('ui.result.transition').includes('Bedside Lamp: OFF ➔ ON'));
  SA.bus.emit('errp:inject', { kind: 'correct', source: 'operator' });
  await waitFor(SA, () => SA.store.get('ui.result.kind') === 'success');
  tok(SA, 'NEXT'); tok(SA, 'SELECT');   // Return to Home
  assert.strictEqual(SA.store.get('ui.screen'), 'S2');
});

test('inline observation on device screen + thermal CAREGIVER pending + withdraw', async () => {
  const SA = boot();
  tok(SA, 'SELECT'); tok(SA, 'NEXT'); tok(SA, 'SELECT');   // Fans
  assert.strictEqual(SA.store.get('ui.screen'), 'devices/fan');
  assert.strictEqual(SA.store.get('ui.focus')['devices/fan'], 1, 'entry focus Low when OFF');
  tok(SA, 'SELECT');   // Low
  await waitFor(SA, () => SA.store.get('ui.band') && SA.store.get('ui.band.kind') === 'observing');
  assert.strictEqual(SA.store.get('ui.screen'), 'devices/fan');
  SA.bus.emit('errp:inject', { kind: 'correct', source: 'operator' });
  await waitFor(SA, () => SA.store.get('ui.band.kind') !== 'observing');
  assert.strictEqual(SA.store.get('devices.CeilingFan.speed'), 'low');
  tok(SA, 'BACK'); tok(SA, 'NEXT'); tok(SA, 'SELECT');   // AC
  assert.strictEqual(SA.store.get('ui.screen'), 'devices/ac');
  // Push the setpoint straight to 18 via the harness-independent store? No: drive Temp − with auto-confirm-free injections.
  tok(SA, 'NEXT');     // Temp −
  for (let i = 0; i < 7; i++) {
    tok(SA, 'SELECT');
    await waitFor(SA, () => SA.store.get('ui.subState') === 'pending' || SA.store.get('ui.subState') === 'confirm' || (SA.store.get('ui.band') && SA.store.get('ui.band.kind') === 'observing'), 4000);
    if (SA.store.get('ui.subState') === 'pending') break;
    if (SA.store.get('ui.subState') === 'confirm') { tok(SA, 'SELECT'); await waitFor(SA, () => SA.store.get('ui.band.kind') === 'observing'); }
    SA.bus.emit('errp:inject', { kind: 'correct', source: 'operator' });
    await waitFor(SA, () => !SA.store.get('ui.lockout'));
  }
  assert.strictEqual(SA.store.get('ui.subState'), 'pending');
  assert.strictEqual(SA.store.get('ui.dialog.title'), 'Waiting for caregiver approval');
  assert.ok(/17°C is below the 18°C minimum/.test(SA.store.get('ui.dialog.reason')), SA.store.get('ui.dialog.reason'));
  tok(SA, 'SELECT');   // never withdraws
  assert.strictEqual(SA.store.get('ui.subState'), 'pending');
  tok(SA, 'BACK');     // withdraw
  assert.strictEqual(SA.store.get('ui.subState'), 'list');
  assert.strictEqual(SA.store.get('devices.AirConditioner.setpoint'), 18);
});
