/*
 * Selftest cases, domain 'eeg' (EEG builder) — docs/architecture.md §8.2.
 * eeg/weights-load, eeg/exemplar-matches-expected, eeg/edges-nonincreasing,
 * eeg/graph-zscore, eeg/gatv2-selfloop-only, eeg/synth-deterministic, eeg/synth-erd,
 * eeg/token-passthrough, eeg/decode-replay.
 * Cases whose generated data file is absent pass with a note (the UI disables Replay then).
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};

  function reg(id, fn, opts) {
    if (!SA.selftest || !SA.selftest.register) return;
    SA.selftest.register('eeg', id, fn, opts);
  }
  function haveWeights() { return !!(SA.data && SA.data.sfegatWeights); }
  function haveReplay() { return !!(SA.data && SA.data.miReplay && SA.data.miReplay.records && SA.data.miReplay.records.length); }

  reg('weights-load', function (t) {
    if (!haveWeights()) { t.note('SA.data.sfegatWeights missing'); t.ok(true, 'skipped: no weights'); return; }
    var m = SA.eeg.sfegat.load(SA.data.sfegatWeights);
    t.eq(m.nParams, 149796, 'trainable parameter count');
    t.eq(m.blocks.length, 3, 'three evolution blocks');
  });

  reg('exemplar-matches-expected', function (t) {
    if (!haveWeights() || !haveReplay()) { t.note('weights or replay missing'); t.ok(true, 'skipped: no data'); return; }
    var recs = SA.data.miReplay.records.filter(function (r) { return r.expected && r.expected.probs; });
    if (!recs.length) { t.note('no record carries expected'); t.ok(true, 'skipped: no expected'); return; }
    var wr = (SA.data.sfegatWeights.manifest.run || {}).id, rr = (SA.data.miReplay.manifest.run || {}).id;
    if (wr !== rr) t.note('weights run ' + wr + ' != replay run ' + rr + ' (EXPORT files out of sync; expected was computed with other weights)');
    var rec = recs[0], X = SA.core.b64.decodeF32(rec.b64);
    var r = SA.eeg.decoder.decode({ X: X, C: 22, T: 1000 });
    var d = 0;
    for (var i = 0; i < 4; i++) d = Math.max(d, Math.abs(r.probs[i] - rec.expected.probs[i]));
    t.ok(d <= 1e-4, rec.id + ' |dprobs| = ' + d.toExponential(2));
    if (rec.expected.edgeCounts) t.eq(r.edgeCounts, rec.expected.edgeCounts, 'edge counts A0..A3');
    if (rec.expected.pred) t.eq(r.pred, rec.expected.pred, 'predicted class');
  });

  reg('edges-nonincreasing', function (t) {
    if (!haveWeights()) { t.ok(true, 'skipped: no weights'); return; }
    var trial = haveReplay() ? { X: SA.core.b64.decodeF32(SA.data.miReplay.records[0].b64), C: 22, T: 1000 }
      : SA.eeg.synth.trial('feet', 0);
    var r = SA.eeg.decoder.decode(trial), c = r.edgeCounts;
    t.ok(c[0] >= c[1] && c[1] >= c[2] && c[2] >= c[3], 'edge counts ' + c.join('/'));
    var ok = true;
    ['evo1', 'evo2', 'evo3'].forEach(function (k, i) {
      var prev = r.trace['evo' + i], cur = r.trace[k], seen = {};
      for (var e = 0; e < prev.n; e++) seen[prev.src[e] * 64 + prev.dst[e]] = 1;
      for (e = 0; e < cur.n; e++) if (!seen[cur.src[e] * 64 + cur.dst[e]]) ok = false;
    });
    t.ok(ok, 'each A(l) is a subset of A(l-1)');
    var s = r.probs.reduce(function (a, b) { return a + b; }, 0);
    t.near(s, 1, 1e-12, 'softmax sums to 1');
  });

  reg('graph-zscore', function (t) {
    var C = 3, P = Float64Array.from([1, 0.9, 0.1, 0.9, 1, 0.2, 0.1, 0.2, 1]);
    var g = SA.eeg.graph.build(P, C, { tau: 0.3, eps: 1e-8, cmp: '>', weighted: true });
    var mu = 5.4 / 9, v = 0;
    for (var i = 0; i < 9; i++) v += (P[i] - mu) * (P[i] - mu);
    var sd = Math.sqrt(v / 9);
    t.near(g.Z[1], (0.9 - mu) / (sd + 1e-8), 1e-15, 'z includes the diagonal, ddof 0');
    t.eq(g.Z[0], 0, 'diag zeroed');
    t.eq([g.edges.n, Array.from(g.edges.src), Array.from(g.edges.dst)], [2, [0, 1], [1, 0]], 'row-major strict edges');
  });

  reg('gatv2-selfloop-only', function (t) {
    // No edges: every node attends only to itself (alpha = 1) -> out = lin_l(x) + bias.
    var W = { lin_l_w: [1, 2], lin_l_b: [0.5], lin_r_w: [3, -1], lin_r_b: [0], att: [0.7], bias: [0.25] };
    var x = Float64Array.from([1, 1, 2, -1]);
    var out = SA.eeg.gatv2.forward(x, 2, 2, { src: [], dst: [], n: 0 }, W, { heads: 1, outPerHead: 1 });
    t.near(out[0], 3.75, 1e-15, 'node 0'); t.near(out[1], 0.75, 1e-15, 'node 1');
    var gc = SA.eeg.gcn.forward(x, 2, 2, { src: [], dst: [], w: [], n: 0 }, { lin_w: [1, 2], bias: [0.1] }, {});
    t.near(gc[0], 3.1, 1e-15, 'gcn self loop only');
  });

  reg('synth-deterministic', function (t) {
    var a = SA.eeg.synth.trial('left', 3), b = SA.eeg.synth.trial('left', 3), same = a.X.length === 22000;
    for (var i = 0; i < a.X.length && same; i++) if (a.X[i] !== b.X[i]) same = false;
    t.ok(same, 'same seed -> identical samples');
    t.eq(a.id, 'SYN-left-3', 'id');
  });

  function muPower(tr, name) {
    var c = SA.eeg.synth.channels.indexOf(name), x = tr.X.subarray(c * 1000, (c + 1) * 1000);
    var w = SA.dsp.welch(x, { fs: 250, nperseg: 250, noverlap: 125, window: 'hann' });
    return SA.dsp.bandPower(w.f, w.Pxx, 8, 12);
  }
  reg('synth-erd', function (t) {
    var L = SA.eeg.synth.trial('left', 0), R = SA.eeg.synth.trial('right', 0);
    t.ok(muPower(L, 'C4') < muPower(R, 'C4'), 'left-hand MI: C4 mu power drops (contralateral ERD)');
    t.ok(muPower(R, 'C3') < muPower(L, 'C3'), 'right-hand MI: C3 mu power drops');
    t.ok(muPower(L, 'C4') / muPower(L, 'C3') < muPower(R, 'C4') / muPower(R, 'C3'), 'lateralisation ratio');
  });

  reg('token-passthrough', function (t) {
    var got = null, off = SA.bus.on('eeg:decoded', function (p) { got = p; });
    SA.bus.emit('input:token', { cls: 'feet', token: 'SELECT', source: 'keyboard', ts: 0 });
    off();
    t.ok(got && got.decoded === false && got.token === 'SELECT' && got.probs === null, 'scripted token -> eeg:decoded{decoded:false}');
    t.eq(got && got.conf, SA.store.get('decoder.sliders.neural'), 'conf = Neural slider');
  });

  reg('decode-replay', function (t) {
    if (!SA.eeg.decoder.available('replay')) { t.note('Replay unavailable'); t.ok(true, 'skipped: replay unavailable'); return; }
    SA.store.set('prefs.decodeAnimation', false, 'harness');
    SA.bus.emit('harness:set', { key: 'decoder.mode', value: 'replay' });
    var got = null, off = SA.bus.on('eeg:decoded', function (p) { got = p; });
    SA.bus.emit('input:decodeRequest', { cuedCls: 'feet' });
    off();
    t.ok(got && got.decoded === true && got.probs && got.probs.length === 4, 'decoded payload');
    t.ok(got && got.graphs && got.graphs.length === 4, 'A0..A3 graphs');
    t.eq(got && got.trial && got.trial.trueCls, 'feet', 'cued pool');
    t.eq(SA.store.get('decoder.cursor.feet'), 1, 'cursor advanced');
  });
})(typeof window !== 'undefined' ? window : globalThis);
