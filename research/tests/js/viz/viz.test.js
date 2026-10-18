// VIZ unit tests (Node, no DOM): node --test research/tests/js/viz/
// Loads the VIZ files into a vm context with a minimal stub SA.bus/SA.store/SA.clock so the tests
// run even before CORE's research/tests/js/run_node.js exists. If run_node.js exists, an extra
// test loads the full POC through it and checks the VIZ namespaces.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const plain = (x) => JSON.parse(JSON.stringify(x));
const POC = path.resolve(__dirname, '../../../../POC');
const FILES = ['js/brain/montage.js', 'js/brain/brain-graph-view.js', 'js/kg/kg-view.js',
  'js/ui/caregiver/dashboard.js', 'js/ui/caregiver/queue.js', 'js/ui/caregiver/gauges.js',
  'js/ui/caregiver/shadow-table.js', 'js/ui/caregiver/audit-view.js', 'js/selftest/cases/viz.js'];

const INITIAL = {
  devices: {
    BedroomCeilingLight: { kind: 'light', label: 'Bedroom Ceiling Light', room: 'MasterBedroom', order: 1, power: 'off', brightness: 100 },
    BedsideLamp: { kind: 'light', label: 'Bedside Lamp', room: 'MasterBedroom', order: 2, power: 'off', brightness: 100 },
    LivingRoomLight: { kind: 'light', label: 'Living Room Light', room: 'LivingRoom', order: 3, power: 'on', brightness: 100 },
    CeilingFan: { kind: 'fan', label: 'Ceiling Fan', room: 'MasterBedroom', power: 'off', speed: null },
    AirConditioner: { kind: 'ac', label: 'Air Conditioner', room: 'MasterBedroom', power: 'on', setpoint: 24, mode: 'cool' },
    SmartTV: { kind: 'tv', label: 'Smart TV', room: 'MasterBedroom', power: 'standby', channel: 1, volume: 20 }
  },
  approvals: [{ id: 'ap-seed-1', seeded: true, episodeId: null, status: 'pending',
    action: { kind: 'device', id: 'AirConditioner', command: 'SetTemperature', args: { value: 16 } },
    intentLabel: 'Set Temperature 16°C', n: 0.92, s: 0.95,
    reason: 'Setpoint 16°C is below the 18°C minimum', label: 'Example request (seeded by Reset Demo)' }],
  telemetry: { n: null, s: null, c: null, tier: null, lastDecision: null, lastQ: null, lastErrpDecision: null },
  decoder: { mode: 'scripted', sliders: { neural: 0.92, semantic: 0.89, semanticOverride: false }, dataStatus: { errp: 'missing' } },
  errp: { memory: [] }, prefs: { decodeAnimation: true }, context: { activeRoom: 'MasterBedroom' },
  ui: { screen: 'S1', focus: { S1: 0 }, dashboardOpen: false }
};

function makeCtx(extraData) {
  const handlers = {};
  const emitted = [];
  const timers = [];
  const state = JSON.parse(JSON.stringify(INITIAL));
  const ctx = { console, Math, JSON };
  ctx.window = ctx; ctx.globalThis = ctx;
  ctx.SA = {
    data: extraData || {},
    config: { kg: { rooms: { MasterBedroom: 'Master Bedroom', LivingRoom: 'Living Room' } } },
    bus: {
      on(e, fn) { (handlers[e] = handlers[e] || []).push(fn); return () => {}; },
      emit(e, p) { emitted.push({ e, p }); (handlers[e] || []).slice().forEach((fn) => fn(p)); }
    },
    store: { get(p) { let v = state; for (const k of p.split('.')) v = v == null ? undefined : v[k]; return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); } },
    clock: {
      after(ms, fn) { const h = { ms, fn, done: false }; timers.push(h); return h; },
      cancel(h) { if (h) h.done = true; }, now: () => 0, iso: () => '2026-03-01T21:00:05'
    }
  };
  vm.createContext(ctx);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(POC, f), 'utf8'), ctx, { filename: f });
  const flush = () => { let h; while ((h = timers.find((x) => !x.done))) { h.done = true; h.fn(); } };
  return { ctx, SA: ctx.SA, emitted, flush, state };
}

test('all VIZ files load with no document and register namespaces', () => {
  const { SA } = makeCtx();
  for (const ns of ['brain.montage', 'brain.view', 'kg.view', 'ui.caregiver', 'ui.caregiver.queue',
    'ui.caregiver.gauges', 'ui.caregiver.shadowTable', 'ui.caregiver.auditView']) {
    const v = ns.split('.').reduce((o, k) => o && o[k], SA);
    assert.ok(v, ns);
  }
  assert.equal(typeof SA.ui.caregiver.init, 'function');
  assert.equal(typeof SA.brain.view.init, 'function');
  assert.equal(typeof SA.kg.view.init, 'function');
});

test('montage: schematic fallback has 22 electrodes, rows 1/5/7/5/3/1, FCz=3, Cz=9', () => {
  const { SA } = makeCtx();
  const pos = SA.brain.montage.positions();
  assert.equal(pos.length, 22);
  assert.equal(SA.brain.montage.index('FCz'), 3);
  assert.equal(SA.brain.montage.index('Cz'), 9);
  assert.ok(SA.brain.montage.isSchematic());
  const rows = {};
  pos.forEach((p) => { rows[p.y.toFixed(4)] = (rows[p.y.toFixed(4)] || 0) + 1; });
  assert.deepEqual(Object.values(rows), [1, 5, 7, 5, 3, 1]);
  assert.ok(pos.every((p) => Math.hypot(p.x, p.y) < 1));
  assert.ok(pos[0].y > pos[21].y, 'Fz (front) above POz (back): +y = nose');
});

test('montage: uses SA.data.montage when present and scales into the head', () => {
  const names = ['Fz', 'FC3', 'FC1', 'FCz', 'FC2', 'FC4', 'C5', 'C3', 'C1', 'Cz', 'C2', 'C4', 'C6', 'CP3', 'CP1', 'CPz', 'CP2', 'CP4', 'P1', 'Pz', 'P2', 'POz'];
  const channels = names.map((n, i) => ({ name: n, paperIdx: i + 1, x: Math.cos(i) * 1.1, y: Math.sin(i) * 1.1 }));
  const { SA } = makeCtx({ montage: { manifest: { source: 'test-src' }, channels } });
  const pos = SA.brain.montage.positions();
  assert.equal(SA.brain.montage.isSchematic(), false);
  assert.equal(SA.brain.montage.source(), 'test-src');
  const maxR = Math.max(...pos.map((p) => Math.hypot(p.x, p.y)));
  assert.ok(Math.abs(maxR - 0.86) < 1e-12, 'max radius scaled to 0.86, got ' + maxR);
  const r0 = pos[1].x / pos[0].x; // uniform scale preserves ratios
  assert.ok(Math.abs(r0 - Math.cos(1) / Math.cos(0)) < 1e-12);
});

test('brain view: pairs() dedupes directed edges, drops self-loops/out-of-range', () => {
  const { SA } = makeCtx();
  const p = SA.brain.view.pairs({ src: [0, 1, 2, 3, 5, 30], dst: [1, 0, 2, 4, 3, 1], n: 6 });
  assert.deepEqual(JSON.parse(JSON.stringify(p)), [[0, 1], [3, 4], [3, 5]]);
  const p2 = SA.brain.view.pairs({ src: new Int32Array([0, 1]), dst: new Int32Array([1, 2]), n: 1 });
  assert.deepEqual(JSON.parse(JSON.stringify(p2)), [[0, 1]], 'respects n');
});

test('brain view: diffSteps on canned trace is consistent and non-increasing', () => {
  const { SA } = makeCtx();
  const tr = SA.brain.view.cannedTrace();
  assert.equal(tr.graphs.length, 4);
  const d = SA.brain.view.diffSteps(tr.graphs);
  assert.equal(d[0].removed.length, 0);
  for (let k = 1; k < 4; k++) {
    assert.ok(d[k].kept.length <= d[k - 1].kept.length);
    assert.equal(d[k].kept.length + d[k].removed.length, d[k - 1].kept.length);
    assert.ok(tr.edgeCounts[k] <= tr.edgeCounts[k - 1]);
  }
  assert.ok(d[0].kept.length > 10, 'canned evo0 has edges: ' + d[0].kept.length);
});

test('brain view: event flow (decoded graphs animate evo0→evo3 via SA.clock; scripted token does not; radar; reset)', () => {
  const { SA, flush } = makeCtx();
  SA.brain.view.init();
  SA.bus.emit('eeg:decoded', { token: 'SELECT', decoded: false, mode: 'scripted', graphs: null });
  assert.equal(SA.brain.view.state().hasGraph, false, 'scripted token: no graph, no animation');
  const tr = SA.brain.view.cannedTrace();
  SA.bus.emit('eeg:decoded', { token: 'SELECT', decoded: true, mode: 'replay', graphs: tr.graphs, edgeCounts: tr.edgeCounts,
    preliminary: true, stub: true, trial: { id: 'A01E-t017', trueCls: 'feet' } });
  let s = SA.brain.view.state();
  assert.equal(s.step, 0); assert.equal(s.mode, 'replay'); assert.equal(s.stub, true);
  assert.deepEqual(plain(s.counts), plain(tr.edgeCounts));
  flush();
  assert.equal(SA.brain.view.state().step, 3, 'animation reached evo3');
  SA.bus.emit('errp:observeStart', { durationMs: 1000 });
  assert.equal(SA.brain.view.state().radar, true);
  flush();
  assert.equal(SA.brain.view.state().radar, false, 'radar off after durationMs');
  SA.bus.emit('decoder:modeChanged', { mode: 'scripted', prev: 'replay' });
  assert.equal(SA.brain.view.state().hasGraph, false);
  SA.bus.emit('eeg:exemplar', { trialId: 'A01E-t017', graphs: tr.graphs, edgeCounts: tr.edgeCounts, caption: 'Exemplar' });
  flush();
  assert.equal(SA.brain.view.state().step, 3);
  SA.bus.emit('demo:reset', { resetSeq: 1 });
  assert.equal(SA.brain.view.state().hasGraph, false);
  assert.equal(SA.brain.view.state().step, -1);
});

test('brain view: decodeAnimation=false jumps straight to evo3', () => {
  const { SA, state } = makeCtx();
  state.prefs.decodeAnimation = false;
  SA.brain.view.init();
  const tr = SA.brain.view.cannedTrace();
  SA.bus.emit('eeg:decoded', { decoded: true, mode: 'replay', graphs: tr.graphs, edgeCounts: tr.edgeCounts });
  assert.equal(SA.brain.view.state().step, 3);
});

test('kg view: canonical ranking model 1st 0.94 / 2nd 0.88 / 3rd 0.38 and ErrP penalty note', () => {
  const { SA } = makeCtx();
  const ranked = [
    { id: 'BedroomCeilingLight', label: 'Bedroom Ceiling Light', score: 0.94, scorePenalised: 0.94, modifiers: { errpMemory: 1 } },
    { id: 'BedsideLamp', label: 'Bedside Lamp', score: 0.88, scorePenalised: 0.88, modifiers: { errpMemory: 1 } },
    { id: 'LivingRoomLight', label: 'Living Room Light', score: 0.38, scorePenalised: 0.38, modifiers: { errpMemory: 1 } }];
  const m = SA.kg.view.model({ intent: 'Turn On Light', actedOn: { id: 'BedroomCeilingLight' }, ranked }, INITIAL.devices, 'MasterBedroom');
  assert.deepEqual(plain(m.nodes.map((n) => n.rankText)), ['1st · 0.94', '2nd · 0.88', '3rd · 0.38']);
  assert.deepEqual(plain(m.nodes.map((n) => n.short)), ['Ceiling', 'Lamp', 'Living']);
  assert.equal(m.winner, 'BedroomCeilingLight'); assert.equal(m.runnerUp, 'BedsideLamp');
  assert.ok(m.nodes.length + 4 <= 8);
  // After a rollback the resolver re-ranks with the ErrP-memory modifier (ADR 0003: 0.94 -> 0.47)
  const ranked2 = [ranked[1], Object.assign({}, ranked[0], { scorePenalised: 0.47, modifiers: { errpMemory: 0.5 } }), ranked[2]];
  const m2 = SA.kg.view.model({ intent: 'Turn On Light', actedOn: { id: 'BedsideLamp' }, ranked: ranked2 }, INITIAL.devices, 'MasterBedroom');
  assert.equal(m2.winner, 'BedsideLamp');
  assert.equal(m2.nodes.find((n) => n.id === 'BedroomCeilingLight').rankText, '2nd · 0.47');
  assert.ok(m2.notes[0].includes('ErrP memory ×0.50 on Ceiling (0.94 → 0.47)'), m2.notes[0]);
  // Non-light request: shows the ranked devices instead (<= 4)
  const m3 = SA.kg.view.model({ intent: 'Set Temperature', ranked: [{ id: 'AirConditioner', label: 'Air Conditioner', score: 1 }] }, INITIAL.devices, 'MasterBedroom');
  assert.deepEqual(plain(m3.nodes.map((n) => n.short)), ['AC']);
});

test('caregiver queue / shadow / gauges / audit models', () => {
  const { SA } = makeCtx();
  const Q = SA.ui.caregiver.queue, S = SA.ui.caregiver.shadowTable, G = SA.ui.caregiver.gauges, A = SA.ui.caregiver.auditView;
  const q = Q.model(INITIAL.approvals, INITIAL.devices);
  assert.equal(q.count, 1);
  assert.equal(q.pending[0].target, 'Air Conditioner: 24°C ➔ 16°C');
  assert.equal(q.pending[0].n, '92%'); assert.equal(q.pending[0].s, '95%');
  assert.equal(q.pending[0].rule, 'Setpoint 16°C is below the 18°C minimum');
  assert.equal(Q.targetText({ kind: 'device', id: 'BedroomCeilingLight', command: 'TurnOn' }, INITIAL.devices), 'Bedroom Ceiling Light: OFF ➔ ON');
  const rows = S.rows(INITIAL.devices, {});
  assert.equal(rows.length, 6);
  assert.deepEqual(plain(rows.map((r) => r.state)), ['OFF', 'OFF', 'ON • 100%', 'OFF', 'ON • 24°C • Cool Mode', 'Standby']);
  assert.equal(rows[0].room, 'Master Bedroom');
  const g = G.model(INITIAL);
  assert.deepEqual(plain(g.map((x) => x.text)), ['92%', '89%', 'STUB']);
  assert.ok(g[2].detail.includes('mode auto'));
  const g2 = G.model(Object.assign({}, INITIAL, { telemetry: { n: 0.92, s: 0.89, c: 0.8188, tier: 'Low', lastDecision: 'EXECUTE', lastQ: 0.97, lastErrpDecision: 'rollback' } }));
  assert.ok(g2[1].detail.includes('c = n × s = 0.8188'), g2[1].detail);
  assert.ok(g2[2].detail.includes('last q 0.97'));
  assert.equal(A.badge(null).text, 'Chain not yet verified');
  assert.equal(A.badge({ ok: true, algo: 'SHA-256' }).text, 'Chain verified ✓ (SHA-256)');
  assert.equal(A.badge({ ok: false, brokenAt: 3, algo: 'SHA-256' }).tone, 'danger');
});

test('caregiver: shadow change tracking + audit entries via bus; patient strip', () => {
  const { SA } = makeCtx();
  SA.ui.caregiver.init();   // no document: subscribes only
  SA.bus.emit('device:stateChanged', { deviceId: 'BedroomCeilingLight', before: {}, after: {}, cause: 'execute' });
  SA.bus.emit('action:executed', { episodeId: 'ep-1', sagaId: 's1', steps: [{ deviceId: 'BedroomCeilingLight' }], actor: 'patient' });
  SA.bus.emit('device:stateChanged', { deviceId: 'BedroomCeilingLight', before: {}, after: {}, cause: 'compensate' });
  const ch = SA.ui.caregiver.shadowTable.changes();
  assert.equal(ch.BedroomCeilingLight.actor, 'system (ErrP rollback)');
  assert.equal(SA.ui.caregiver.shadowTable.rows(INITIAL.devices, ch)[0].lastChange, '21:00:05');
  SA.bus.emit('audit:appended', { seq: 0, type: 'BOOT', hash: 'a'.repeat(64), entry: { seq: 0, ts: '2026-03-01T21:00:00', type: 'BOOT', actor: 'system', data: {}, prevHash: '0'.repeat(64) } });
  SA.bus.emit('audit:appended', { seq: 1, type: 'TOKEN', hash: 'b'.repeat(64), entry: { seq: 1, ts: '2026-03-01T21:00:01', type: 'TOKEN', actor: 'patient', data: { cls: 'feet' }, prevHash: 'a'.repeat(64) } });
  assert.equal(SA.ui.caregiver.auditView.entries().length, 2);
  assert.equal(SA.ui.caregiver.auditView.tamperTarget(), 1);
  SA.bus.emit('audit:verified', { ok: false, brokenAt: 1, algo: 'SHA-256' });
  assert.deepEqual(plain(SA.ui.caregiver.auditView.verdict()), { ok: false, brokenAt: 1, algo: 'SHA-256' });
  const txt = SA.ui.caregiver.patientText(INITIAL, 'opt-S1-visual');
  assert.equal(txt, 'Patient view: screen S1 • focus opt-S1-visual • decoder Scripted • pending: Set Temperature 16°C');
});

test('isolation: VIZ files never reference forbidden domain modules or raw timers', () => {
  for (const f of FILES) {
    const src = fs.readFileSync(path.join(POC, f), 'utf8');
    assert.ok(!/SA\.(eeg|errp|policy|safety)\./.test(src), f + ' references a domain module');
    assert.ok(!/SA\.kg\.(resolver|resolve|mirror)/.test(src), f + ' references kg resolver/mirror');
    assert.ok(!/\bset(Timeout|Interval)\s*\(/.test(src), f + ' uses raw timers');
    assert.ok(!/\bfetch\(|import\(|XMLHttpRequest/.test(src), f + ' uses fetch/import/XHR');
    assert.ok(src.split('\n').length <= 400, f + ' over 400 lines');
  }
});

test('full POC load through CORE run_node.js (VIZ files load cleanly; other builders may still be missing)', (t) => {
  const runner = path.resolve(__dirname, '../run_node.js');
  if (!fs.existsSync(runner)) { t.skip('research/tests/js/run_node.js not on disk yet'); return; }
  const { loadPOC } = require(runner);
  const { SA, errors } = loadPOC({ allowMissing: true, quiet: true });
  const real = errors.filter((e) => e.error !== 'missing file');
  assert.deepEqual(plain(real), [], 'no load-time errors other than missing files');
  const vizMissing = errors.filter((e) => FILES.includes(e.file));
  assert.deepEqual(plain(vizMissing), [], 'no VIZ file missing');
  assert.ok(SA.brain.view && SA.kg.view && SA.ui.caregiver.queue && SA.ui.caregiver.init);
});
