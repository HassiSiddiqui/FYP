/* EEG builder Node tests: node --test research/tests/js/eeg/
 * - JS <-> PyTorch parity on randomly initialised SFE-GAT models (needs make_eeg_parity.py output)
 * - synthetic MI determinism + ERD direction (ADR 0004 D7)
 * - decoder event flow (scripted passthrough, replay cued pool, pin, harness:set, reset) */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadPOC } = require('../run_node.js');

const PAR = path.resolve(__dirname, '..', '..', '..', '.cache', 'parity');

test('JS SFE-GAT forward == PyTorch (all stages, D27 tolerances)', { skip: !fs.existsSync(path.join(PAR, 'eeg_ref.json')) && 'run make_eeg_parity.py first' }, () => {
  const rep = require('./eeg_parity.js').run();
  for (const r of rep.rows) {
    assert.ok(r.pass, r.model + '/' + r.trial + ' failed: ' + r.bad.join(','));
    assert.ok(r.abs_logits <= 1e-4, 'logits');
    assert.ok(r.edgesIdentical, 'edges');
  }
  assert.ok(rep.rows.some((r) => r.edgeCounts.split('/')[0] !== r.edgeCounts.split('/')[3]), 'at least one case prunes edges');
});

function boot() {
  const r = loadPOC({ quiet: true });
  assert.deepStrictEqual(r.errors, []);
  r.SA.app.start({ headless: true });
  return r.SA;
}

test('synthetic MI: deterministic, labelled, ERD present', () => {
  const { SA } = loadPOC({ only: ['js/core/', 'js/config/', 'js/data/', 'js/dsp/', 'js/eeg/'], quiet: true });
  const a = SA.eeg.synth.trial('feet', 5), b = SA.eeg.synth.trial('feet', 5);
  assert.strictEqual(a.X.length, 22000);
  assert.deepStrictEqual(Array.from(a.X), Array.from(b.X));
  assert.strictEqual(a.id, 'SYN-feet-5');
  assert.strictEqual(a.seed, SA.config.eeg.synth.seed + 5);
  const mu = (tr, ch) => {
    const c = SA.eeg.synth.channels.indexOf(ch), w = SA.dsp.welch(tr.X.subarray(c * 1000, c * 1000 + 1000), { fs: 250, nperseg: 250 });
    return SA.dsp.bandPower(w.f, w.Pxx, 8, 12);
  };
  for (let k = 0; k < 3; k++) {
    const L = SA.eeg.synth.trial('left', k), R = SA.eeg.synth.trial('right', k), F = SA.eeg.synth.trial('feet', k);
    assert.ok(mu(L, 'C4') / mu(L, 'C3') < mu(R, 'C4') / mu(R, 'C3'), 'lateralised ERD k=' + k);
    assert.ok(mu(F, 'Cz') < mu(L, 'Cz'), 'feet ERD at Cz k=' + k);
  }
  assert.ok(a.meta.volumeConduction === !!(SA.data.montage), 'volume conduction iff montage present');
});

test('decoder: scripted token passthrough + harness sliders', () => {
  const SA = boot();
  const got = [];
  SA.bus.on('eeg:decoded', (p) => got.push(p));
  SA.bus.emit('harness:set', { key: 'decoder.sliders.neural', value: 0.5 });
  SA.bus.emit('input:token', { cls: 'right', token: 'NEXT', source: 'keyboard', ts: 1 });
  assert.strictEqual(got.length, 1);
  assert.strictEqual(got[0].decoded, false);
  assert.strictEqual(got[0].conf, 0.5);
  assert.strictEqual(got[0].token, 'NEXT');
  SA.bus.emit('harness:set', { key: 'decoder.sliders.semantic', value: 0.3 });
  assert.strictEqual(SA.store.get('decoder.sliders.semanticOverride'), true);
  assert.strictEqual(SA.eeg.decoder.decodeTrial({ cuedCls: 'feet' }), null, 'scripted mode never decodes');
});

test('decoder: replay cued pool, pin, payload contract', { skip: !(fs.existsSync(path.resolve(__dirname, '../../../../POC/js/data/mi-replay.js'))) && 'no mi-replay.js' }, () => {
  const SA = boot();
  SA.store.set('prefs.decodeAnimation', false, 'harness');
  const ds = SA.store.get('decoder.dataStatus');
  assert.notStrictEqual(ds.weights, 'missing');
  assert.ok(SA.store.get('decoder.catalog').length > 0);
  const modes = [];
  SA.bus.on('decoder:modeChanged', (p) => modes.push(p));
  SA.bus.emit('harness:set', { key: 'decoder.mode', value: 'replay' });
  assert.strictEqual(JSON.stringify(modes), JSON.stringify([{ mode: 'replay', prev: 'scripted' }]));
  const got = [], starts = [];
  SA.bus.on('eeg:decoded', (p) => got.push(p));
  SA.bus.on('eeg:decodeStart', (p) => starts.push(p));
  SA.bus.emit('input:decodeRequest', { cuedCls: 'left' });
  assert.strictEqual(starts.length, 1);
  assert.strictEqual(got.length, 1);
  const p = got[0];
  assert.strictEqual(p.decoded, true);
  assert.strictEqual(p.trial.trueCls, 'left');
  assert.strictEqual(p.cuedCls, 'left');
  assert.strictEqual(p.probs.length, 4);
  assert.ok(Math.abs(p.probs.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  assert.strictEqual(p.token, SA.config.eeg.tokenOf[p.cls]);
  assert.strictEqual(p.correct, p.cls === 'left');
  assert.strictEqual(p.graphs.length, 4);
  assert.deepStrictEqual(p.edgeCounts, p.graphs.map((g) => g.n));
  assert.strictEqual(SA.store.get('decoder.cursor.left'), 1);
  // pin: next decode uses the pinned trial; cue becomes its true class; pin clears
  const cat = SA.store.get('decoder.catalog'), pick = cat[cat.length - 1];
  SA.bus.emit('harness:set', { key: 'decoder.pin', value: pick.id });
  SA.bus.emit('input:decodeRequest', { cuedCls: 'left' });
  assert.strictEqual(got[1].trial.id, pick.id);
  assert.strictEqual(got[1].cuedCls, pick.trueCls);
  assert.strictEqual(SA.store.get('decoder.pin'), null);
  // JSON-safe payload (bus / audit)
  assert.doesNotThrow(() => JSON.stringify(got[0]));
});

test('decoder: decode(trial) API returns probs, pred, evo0..evo3 trace, timings', () => {
  const SA = boot();
  const t = SA.eeg.synth.trial('tongue', 1);
  const r = SA.eeg.decoder.decode(t);
  assert.strictEqual(r.probs.length, 4);
  assert.ok(SA.config.eeg.classes.indexOf(r.pred) >= 0);
  for (const k of ['evo0', 'evo1', 'evo2', 'evo3']) assert.ok(r.trace[k] && r.trace[k].src.length === r.trace[k].n, k);
  assert.ok(r.timings.totalMs > 0 && r.timings.featuresMs > 0);
});
