/* Test loader for SAFETY tests (CommonJS, no npm). Loads CORE files when they exist, the SAFETY/ErrP files and
 * their deps into a vm context, and shims only the core modules (bus/store/clock/util) that are still missing. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const POC = path.resolve(__dirname, '../../../../POC');

const CORE = ['js/core/namespace.js', 'js/config/initial-state.js', 'js/core/bus.js', 'js/core/store.js',
  'js/core/clock.js', 'js/core/b64.js', 'js/core/reset.js'];
const FILES = [
  'js/config/safety.js', 'js/config/errp.js',
  'js/data/errp-model.js', 'js/data/errp-replay.js',
  'js/dsp/sosfilt.js',
  'js/errp/features.js', 'js/errp/classifier.js', 'js/errp/detector.js', 'js/errp/memory.js', 'js/errp/synth.js',
  'js/safety/audit.js', 'js/safety/rollback.js', 'js/safety/approvals.js', 'js/safety/episode.js'
];

function sortKeys(o) {
  if (o === null || typeof o !== 'object') return o;
  if (Array.isArray(o)) return o.map(sortKeys);
  const r = {}; Object.keys(o).sort().forEach(k => { r[k] = sortKeys(o[k]); }); return r;
}

function shimCore(ctx, opts) {
  const SA = ctx.SA = ctx.SA || {};
  SA.config = SA.config || {};
  if (!SA.util) SA.util = {
    deepEqual: (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b)),
    deepClone: (o) => JSON.parse(JSON.stringify(o))
  };
  if (!SA.bus) {
    const subs = {}; const log = [];
    let queue = null;
    SA.bus = { errorCount: 0, log, _shim: true,
      on(e, f) { (subs[e] = subs[e] || []).push(f); return () => { subs[e] = (subs[e] || []).filter(g => g !== f); }; },
      once(e, f) { const off = SA.bus.on(e, (p) => { off(); f(p); }); return off; },
      emit(e, p) {
        if (queue) { queue.push([e, p]); return; }
        queue = [[e, p]];
        while (queue.length) {
          const [ev, pl] = queue.shift();
          log.push({ evt: ev, payload: pl });
          (subs[ev] || []).slice().forEach(f => { try { f(pl); } catch (err) { SA.bus.errorCount++; console.error(err); } });
        }
        queue = null;
      },
      clear() { Object.keys(subs).forEach(k => delete subs[k]); } };
  }
  if (!SA.store) {
    let state = {};
    const owners = { devices: ['rollback'], episode: ['episode'], approvals: ['approvals'], errp: ['errp-memory'],
      telemetry: ['episode'], decoder: ['decoder', 'episode'], ui: ['ui'], prefs: ['harness', 'ui'], context: ['harness'] };
    const cl = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
    const get = (p) => { let o = state; if (!p) return cl(o); for (const k of p.split('.')) { if (o == null) return undefined; o = o[k]; } return cl(o); };
    const set = (p, v, by) => {
      const ks = p.split('.');
      if (by !== 'core' && !(owners[ks[0]] || []).includes(by)) throw new Error('store: ' + by + ' may not write ' + ks[0]);
      let o = state; for (let i = 0; i < ks.length - 1; i++) { o = o[ks[i]] = o[ks[i]] || {}; }
      o[ks[ks.length - 1]] = cl(v); SA.bus.emit('store:changed', { path: p, by });
    };
    SA.store = { get, set, patch: (p, obj, by) => set(p, Object.assign(get(p) || {}, obj), by),
      snapshot: () => cl(state), reset: () => { state = cl(SA.config.initialState); }, _shim: true };
  }
  if (!SA.clock || opts.fakeClock) {
    let t = Date.parse('2026-03-01T21:00:00Z'); let timers = []; let id = 0;
    SA.clock = { speed: 1, now: () => t, iso: () => new Date(t).toISOString().slice(0, 19),
      after(ms, fn) { const h = ++id; timers.push({ h, at: t + ms, fn }); return h; },
      cancel(h) { timers = timers.filter(x => x.h !== h); }, cancelAll() { timers = []; },
      advance(ms) {
        const end = t + ms;
        for (;;) { timers.sort((a, b) => a.at - b.at); const nx = timers[0]; if (!nx || nx.at > end) break; timers.shift(); t = nx.at; nx.fn(); }
        t = end;
      }, _shim: true };
  }
  if (!SA.config.initialState) SA.config.initialState = INITIAL;
}

const INITIAL = {
  ui: { screen: 'S1', focus: { S1: 0 }, focusMemory: {}, subState: 'list', dashboardOpen: false, navMode: null, lockout: false, alert: null, caption: '', repromptCount: 0 },
  prefs: { voice: false, decodeAnimation: true, errpAutoConfirm: false, reducedMotion: false },
  decoder: { mode: 'scripted', sliders: { neural: 0.92, semantic: 0.89, semanticOverride: false }, cursor: { left: 0, right: 0, feet: 0, tongue: 0 }, pin: null, errpCursor: { error: 0, correct: 0 }, errpPin: null, last: null, catalog: [], dataStatus: { weights: 'missing', replay: 'missing', errp: 'missing' } },
  context: { activeRoom: 'MasterBedroom', user: 'Patient', clock: '2026-03-01T21:00:00' },
  devices: {
    BedroomCeilingLight: { kind: 'light', label: 'Bedroom Ceiling Light', room: 'MasterBedroom', order: 1, power: 'off', brightness: 100 },
    BedsideLamp: { kind: 'light', label: 'Bedside Lamp', room: 'MasterBedroom', order: 2, power: 'off', brightness: 100 },
    LivingRoomLight: { kind: 'light', label: 'Living Room Light', room: 'LivingRoom', order: 3, power: 'on', brightness: 100 },
    CeilingFan: { kind: 'fan', label: 'Ceiling Fan', room: 'MasterBedroom', power: 'off', speed: null },
    AirConditioner: { kind: 'ac', label: 'Air Conditioner', room: 'MasterBedroom', power: 'on', setpoint: 24, mode: 'cool' },
    SmartTV: { kind: 'tv', label: 'Smart TV', room: 'MasterBedroom', power: 'standby', channel: 1, volume: 20 }
  },
  episode: { id: null, phase: 'idle' },
  approvals: [{ id: 'ap-seed-1', seeded: true, episodeId: null, status: 'pending',
    action: { kind: 'device', id: 'AirConditioner', command: 'SetTemperature', args: { value: 16 } },
    intentLabel: 'Set Temperature 16°C', n: 0.92, s: 0.95, reason: 'Setpoint 16°C is below the 18°C minimum', label: 'Example request (seeded by Reset Demo)' }],
  errp: { memory: [] },
  telemetry: { n: null, s: null, c: null, tier: null, lastDecision: null, lastQ: null, lastErrpDecision: null }
};

function load(opts) {
  opts = opts || {};
  const sandbox = { console, atob, btoa, TextEncoder, TextDecoder, performance, Buffer, setTimeout, clearTimeout,
    setInterval, clearInterval, URLSearchParams };
  if (!opts.noCrypto) sandbox.crypto = require('crypto').webcrypto;
  const ctx = vm.createContext(sandbox);
  ctx.window = ctx; ctx.globalThis = ctx;
  const errors = []; const loaded = [];
  const run = (rel) => {
    const p = path.join(POC, rel);
    if (!fs.existsSync(p)) return false;
    try { vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: p }); loaded.push(rel); return true; }
    catch (e) { errors.push(rel + ': ' + e.message); return false; }
  };
  if (!opts.noCore) CORE.forEach(run);
  FILES.forEach(f => { if (!(opts.skip || []).includes(f)) run(f); });
  (opts.extra || []).forEach(run);
  shimCore(ctx, opts);
  ctx.SA.store.reset();
  return { ctx, SA: ctx.SA, errors, loaded };
}

/* A stub-shaped model whose w is concentrated on FCz window means (docs/architecture.md §7.7 "stub w concentrated
 * on FCz window means"). Physiological template, NOT fitted to the test epochs: negative weight on the Ne windows
 * (0.20-0.35 s), positive on the Pe windows (0.30-0.45 s), negative on the late windows (0.45-0.60 s). Platt in contract convention (qTr = 1/(1+exp(A s + B))). */
function fczStubModel(base) {
  const m = JSON.parse(JSON.stringify(base));
  const nC = m.featureChannelIndex.length, nW = m.windows.length;
  const fcz = m.featureChannels.indexOf('FCz');
  const cm = /^\s*channel-major/i.test(String(m.featureOrder || ''));
  const w = new Array(nC * nW).fill(0);
  const tmpl = [-1, -0.5, 0.6, 0.6, 0, -0.3, -0.3, 0, 0];   // per window k: Ne-, Pe+, late negativity-
  for (let k = 0; k < nW; k++) w[cm ? fcz * nW + k : k * nC + fcz] = tmpl[k];
  m.w = w; m.b = -2.0; m.platt = { A: -1.0, B: 0.0 }; m.piTrain = 0.2;
  m.stub = true; m.run = Object.assign({}, m.run, { id: 'test-fcz-stub', stub: true });
  m.trainedOn = 'TEST STUB — FCz template weights, not trained';
  return m;
}

module.exports = { load, POC, INITIAL, fczStubModel, sortKeys };
