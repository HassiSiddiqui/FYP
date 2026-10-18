/* SA.errp.synth — accessor over ErrP epochs (docs/architecture.md §2.3; ADR 0002 D21-D23).
 * epoch(kind)              -> the exported synthetic record ('error'|'correct') from SA.data.errpReplay
 *                             (Python-generated, ADR 0002 D21). If that file is absent, a DETERMINISTIC
 *                             JS fallback epoch (no RNG) is built through the same causal pipeline:
 *                             sinusoidal background + fronto-central Ne/Pe Gaussian bumps scaled so the
 *                             filtered single-trial FCz minimum (200-350 ms) is exactly -8.4 µV. Labelled
 *                             generator:'js-fallback' — an honest stand-in until errp-replay.js exists.
 * nextReplay(kind, cursor) -> {epoch, cursor}: real session-2 epochs, error -> TP, TP, FN; correct -> TN, TN, FP.
 * list()                   -> [{id, source, category}]
 * The detector, never this module, decides whether an epoch is an ErrP.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.errp = SA.errp || {};

  var TARGET_UV = -8.4;
  var fallback = {};

  function records() {
    var r = SA.data && SA.data.errpReplay;
    if (!r) return [];
    return r.records || r.epochs || [];
  }
  function isSynth(rec, kind) {
    var cat = String(rec.category || '');
    return cat === 'synth-' + kind || cat === 'synthetic-' + kind ||
      (rec.source === 'synthetic' && rec.label === kind);
  }

  /* ---------- deterministic JS fallback ---------- */
  var TOPO = { FCz: 1.0, Fz: 0.85, FC1: 0.85, FC2: 0.85, Cz: 0.85, C1: 0.65, C2: 0.65, CPz: 0.65, F1: 0.65,
    F2: 0.65, FC3: 0.4, FC4: 0.4, C3: 0.4, C4: 0.4, AFz: 0.4, CP1: 0.4, CP2: 0.4 };

  function background(model) {
    var C = model.channels.length, T = model.nSamples, fs = model.fs, X = new Float64Array(C * T);
    for (var c = 0; c < C; c++) {
      var dc = 1500 * Math.sin(1.7 * c + 0.3);              // per-channel DC offset (exercises zi init)
      var p1 = 0.37 * c, p2 = 1.13 * c + 0.5, p3 = 0.71 * c + 1.1;
      for (var t = 0; t < T; t++) {
        var s = t / fs;
        X[c * T + t] = dc + 2.0 * Math.sin(2 * Math.PI * 10 * s + p1) + 1.0 * Math.sin(2 * Math.PI * 6 * s + p2) +
          0.8 * Math.sin(2 * Math.PI * 3.3 * s + p3);
      }
    }
    return X;
  }
  function component(model) {
    var C = model.channels.length, T = model.nSamples, fs = model.fs, ev = model.eventIndex;
    // filtered-time latencies (Ne ~260 ms, Pe ~420 ms), shifted earlier by the peak lag of broad bumps through
    // the causal 1-10 Hz filter (~0.4 x the 4 Hz group delay, measured on this pipeline)
    var gd = 0.4 * (model.groupDelayMs || 70) / 1000, X = new Float64Array(C * T);
    var bumps = [{ t: 0.260, a: -1.0, s: 0.040 }, { t: 0.420, a: 1.1, s: 0.060 }];
    for (var c = 0; c < C; c++) {
      var w = TOPO[model.channels[c]] || 0.05;
      for (var t = 0; t < T; t++) {
        var s = (t - ev) / fs, v = 0;
        for (var b = 0; b < bumps.length; b++) {
          var d = (s - (bumps[b].t - gd)) / bumps[b].s;
          v += bumps[b].a * Math.exp(-0.5 * d * d);
        }
        X[c * T + t] = w * v;
      }
    }
    return X;
  }
  function buildFallback(kind) {
    var model = SA.data && SA.data.errpModel;
    if (!model) return null;
    var F = SA.errp.features, bg = background(model), X = bg, alpha = null;
    if (kind === 'error') {
      var comp = component(model), T = model.nSamples, fz = model.fczIndex, w = model.fczWindow;
      var Pb = F.preprocess(bg, model), Pc = F.preprocess(comp, model);   // pipeline is linear in the input
      var minAt = function (a) {
        var m = Infinity;
        for (var t = w[0]; t < w[1]; t++) { var v = Pb[fz * T + t] + a * Pc[fz * T + t]; if (v < m) m = v; }
        return m;
      };
      var lo = 0, hi = 1;
      while (minAt(hi) > TARGET_UV && hi < 1e4) hi *= 2;
      for (var i = 0; i < 200; i++) { var mid = 0.5 * (lo + hi); if (minAt(mid) > TARGET_UV) lo = mid; else hi = mid; }
      alpha = hi;
      X = new Float64Array(bg.length);
      for (var j = 0; j < X.length; j++) X[j] = bg[j] + alpha * comp[j];
    }
    return { id: 'SYN-JS-' + kind, source: 'synthetic', category: 'synth-' + kind, generator: 'js-fallback',
      label: kind, subject: null, session: null, X: X, alpha: alpha, expected: null,
      caption: 'Synthetic (JS fallback generator; errp-replay.js not loaded)' };
  }

  function epoch(kind) {
    kind = kind === 'error' ? 'error' : 'correct';
    var recs = records();
    for (var i = 0; i < recs.length; i++) if (isSynth(recs[i], kind)) return recs[i];
    if (!fallback[kind]) fallback[kind] = buildFallback(kind);
    return fallback[kind];
  }

  function sequence(kind) {
    var recs = records().filter(function (r) { return r.source === 'replay' || /^(TP|TN|FP|FN)$/.test(r.category); });
    var order = kind === 'error' ? ['TP', 'FN'] : ['TN', 'FP'];
    var seq = [];
    order.forEach(function (cat) { recs.forEach(function (r) { if (r.category === cat) seq.push(r); }); });
    return seq;
  }

  function nextReplay(kind, cursor) {
    kind = kind === 'error' ? 'error' : 'correct';
    var seq = sequence(kind), k = (cursor | 0);
    if (!seq.length) return { epoch: epoch(kind), cursor: k + 1, fallback: true };
    return { epoch: seq[((k % seq.length) + seq.length) % seq.length], cursor: k + 1 };
  }

  function byId(id) {
    var recs = records();
    for (var i = 0; i < recs.length; i++) if (recs[i].id === id) return recs[i];
    return (fallback.error && fallback.error.id === id) ? fallback.error : (fallback.correct && fallback.correct.id === id ? fallback.correct : null);
  }

  function list() {
    return records().map(function (r) { return { id: r.id, source: r.source, category: r.category }; });
  }

  function status() {
    var m = SA.data && SA.data.errpModel;
    return { model: m ? (m.stub || (m.run && m.run.stub) ? 'stub' : 'ok') : 'missing',
      replay: records().length ? 'ok' : 'missing' };
  }

  SA.errp.synth = { epoch: epoch, nextReplay: nextReplay, list: list, byId: byId, status: status,
    TARGET_UV: TARGET_UV, _clearFallback: function () { fallback = {}; } };
})(typeof window !== 'undefined' ? window : globalThis);
