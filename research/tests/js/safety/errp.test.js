'use strict';
const test = require('node:test');
const assert = require('node:assert');
const P = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
const deq = (a, b, m) => assert.deepStrictEqual(P(a), P(b), m);
const fs = require('fs');
const path = require('path');
const { load, fczStubModel } = require('./_harness.js');

const PRIORS = [0.10, 0.181, 0.36];
const REF = path.resolve(__dirname, '../../../.cache/parity/errp_ref.json');

test('t* from SA.config.errp.costs (ADR 0002 D13); flag-only classes are Infinity', () => {
  const { SA } = load();
  const D = SA.errp.detector;
  assert.ok(Math.abs(D.threshold('light-select') - 5 / (5 + 7 - 2.92)) < 1e-12);
  assert.ok(Math.abs(D.threshold('light-select') - 0.5507) < 1e-4);
  assert.ok(Math.abs(D.threshold('preset') - 0.2941) < 1e-4);
  assert.ok(Math.abs(D.threshold('setting-medium') - 0.2) < 1e-12);
  assert.strictEqual(D.threshold('setting'), Infinity);
  assert.strictEqual(D.threshold('power'), Infinity);
  assert.strictEqual(D.threshold('nope'), Infinity);
});

test('STUB model (FCz template w) + JS-fallback synthetic epochs: error crosses, correct stays below, at 3 priors', () => {
  const { SA } = load({ skip: ['js/data/errp-replay.js'] });
  assert.strictEqual(SA.data.errpReplay, undefined);
  SA.data.errpModel = fczStubModel(SA.data.errpModel);
  const S = SA.errp.synth, D = SA.errp.detector;
  const e = S.epoch('error'), c = S.epoch('correct');
  assert.strictEqual(e.generator, 'js-fallback');
  for (const pi of PRIORS) {
    const re = D.observe(e, { costClass: 'light-select', pi, mode: 'auto' });
    const rc = D.observe(c, { costClass: 'light-select', pi, mode: 'auto' });
    assert.ok(re.q > Math.max(re.tStar, pi), `error q=${re.q} pi=${pi}`);
    assert.strictEqual(re.decision, 'rollback');
    assert.ok(rc.q < rc.tStar, `correct q=${rc.q} pi=${pi}`);
    assert.strictEqual(rc.decision, 'keep');
  }
  const r = D.observe(e, { costClass: 'light-select', pi: 0.181 });
  assert.strictEqual(r.fczMinUv.toFixed(1), '-8.4');
  assert.ok(Math.abs(r.fczMinUv + 8.4) < 1e-6, 'JS fallback FCz min is -8.4 by construction');
});

test('on-disk w=0 stub cannot detect anything: [Simulate ErrP] fails loudly (keep), never forced', () => {
  const { SA } = load({ skip: ['js/data/errp-replay.js'] });
  const m = SA.data.errpModel;
  SA.data.errpModel = Object.assign({}, m, { w: new Array(72).fill(0), b: 0, platt: { A: 1, B: 0 }, piTrain: 0.2, stub: true });
  const r = SA.errp.detector.observe(SA.errp.synth.epoch('error'), { costClass: 'light-select', pi: 0.181 });
  assert.strictEqual(r.decision, 'keep');
  assert.ok(Math.abs(r.qTr - 0.5) < 1e-12);
});

test('REAL exported model + Python synthetic epochs (D22 at 3 priors) and |q_js - q_py|', (t) => {
  const { SA } = load();
  const m = SA.data.errpModel;
  if (!m || m.stub || !SA.data.errpReplay) { t.skip('real model / replay not exported yet'); return; }
  const recs = SA.data.errpReplay.records || SA.data.errpReplay.epochs;
  const e = SA.errp.synth.epoch('error'), c = SA.errp.synth.epoch('correct');
  assert.notStrictEqual(e.generator, 'js-fallback');
  for (const pi of PRIORS) {
    const re = SA.errp.detector.observe(e, { costClass: 'light-select', pi });
    const rc = SA.errp.detector.observe(c, { costClass: 'light-select', pi });
    assert.strictEqual(re.decision, 'rollback', `error pi=${pi} q=${re.q}`);
    assert.strictEqual(rc.decision, 'keep', `correct pi=${pi} q=${rc.q}`);
    assert.ok(rc.q < rc.tStar);
    if (e.expectedAt) assert.ok(Math.abs(e.expectedAt[String(pi)].q - re.q) < 1e-6);
  }
  assert.strictEqual(SA.errp.detector.observe(e, { costClass: 'light-select', pi: 0.181 }).fczMinUv.toFixed(1), '-8.4');
  // every exported record reproduces its Python expected decision at canonical pi
  for (const r of recs) {
    if (!r.expected) continue;
    const o = SA.errp.detector.observe(r, { costClass: 'light-select', pi: r.expected.pi || 0.181 });
    assert.ok(Math.abs(o.q - r.expected.q) < 1e-6, r.id);
    assert.strictEqual(o.decision, r.expected.decision, r.id);
  }
});

test('feature parity vs Python reference (research/.cache/parity/errp_ref.json): features <= 1e-9, score/q <= 1e-6', (t) => {
  if (!fs.existsSync(REF)) { t.skip('no parity reference'); return; }
  const ref = JSON.parse(fs.readFileSync(REF, 'utf8'));
  const { SA } = load();
  const recs = SA.data.errpReplay.records || SA.data.errpReplay.epochs;
  for (const r of ref.epochs) {
    const ep = recs.find(x => x.id === r.epochId);
    const f = SA.errp.features.extract(ep, SA.data.errpModel);
    let mx = 0; for (let i = 0; i < 72; i++) mx = Math.max(mx, Math.abs(f.x[i] - r.features[i]));
    assert.ok(mx <= 1e-9, `${r.epochId} maxdF=${mx}`);
    const o = SA.errp.detector.observe(ep, { costClass: 'light-select', pi: r.pi });
    assert.ok(Math.abs(o.score - r.score) <= 1e-6 && Math.abs(o.q - r.q) <= 1e-6, r.epochId);
    assert.strictEqual(o.decision, r.decision);
  }
});

test('replay sequence: error -> TP, TP, FN; correct -> TN, TN, FP (round robin)', (t) => {
  const { SA } = load();
  if (!SA.data.errpReplay) { t.skip('no replay'); return; }
  const S = SA.errp.synth; let cur = 0; const cats = [];
  for (let i = 0; i < 4; i++) { const r = S.nextReplay('error', cur); cats.push(r.epoch.category); cur = r.cursor; }
  deq(cats, ['TP', 'TP', 'FN', 'TP']);
  cur = 0; const cc = [];
  for (let i = 0; i < 3; i++) { const r = S.nextReplay('correct', cur); cc.push(r.epoch.category); cur = r.cursor; }
  deq(cc, ['TN', 'TN', 'FP']);
});

test('ErrP memory M(d) (D18): rollback at light-select floors M at 0.5, h-flag set; keep disconfirms', () => {
  const { SA } = load();
  SA.errp.memory.init();
  const D = SA.errp.detector, M = SA.errp.memory;
  const tg = { entityId: 'BedroomCeilingLight', command: 'TurnOn', room: 'MasterBedroom' };
  const r = D.observe(SA.errp.synth.epoch('error'), { costClass: 'light-select', pi: 0.181, target: tg, mode: 'auto' });
  assert.strictEqual(r.decision, 'rollback');
  assert.ok(r.lambda > 1);
  const f = M.factor('BedroomCeilingLight', 'TurnOn', 'MasterBedroom');
  assert.ok(f >= 0.5 && f < 0.9, `M=${f}`);
  assert.strictEqual(M.hFlag('BedroomCeilingLight', 'TurnOn', 'MasterBedroom'), true);
  assert.strictEqual(M.factor('BedsideLamp', 'TurnOn', 'MasterBedroom'), 1);
  // canonical ranking flip (ADR 0002 D18): 0.94 * M < 0.88
  assert.ok(0.94 * f < 0.88);
  D.observe(SA.errp.synth.epoch('correct'), { costClass: 'light-select', pi: 0.181, target: tg });
  assert.strictEqual(M.factor('BedroomCeilingLight', 'TurnOn', 'MasterBedroom'), 1);
});
