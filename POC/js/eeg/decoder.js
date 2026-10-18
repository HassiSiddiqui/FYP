/*
 * SA.eeg.decoder (EEG) — the only module that reads decoder.mode (docs/architecture.md §2.2;
 * ADR 0004 D4/D7/D8 + Addendum A3; ADR 0005 D25).
 *   init()  idempotent; subscribes input:token, input:decodeRequest, harness:set (decoder.* except
 *           errpPin), demo:reset; writes decoder.catalog + decoder.dataStatus.
 *   input:token -> eeg:decoded {decoded:false, conf: sliders.neural, probs:null, trial:null} (every mode)
 *   input:decodeRequest {cuedCls}|{trialId} -> decodeTrial (Replay / Synthetic only)
 *   decodeTrial(ref) -> payload (sync forward pass; eeg:decodeStart now, eeg:decoded after
 *           decodeAnimMs when prefs.decodeAnimation, via SA.clock.after)
 *   decode(trial)    -> {logits, probs, probsCal, pred, conf, calibrated, trace:{evo0..evo3},
 *           edgeCounts, timings, result}   pure; trial = {X, C, T}
 *   exemplar()       -> eeg:exemplar payload for the Scripted-mode brain view (D8), cached
 *   synthEval(n, done) -> chunked accuracy of the model on n seeded synthetic trials (no claim)
 * Emits eeg:decodeStart, eeg:decoded, decoder:modeChanged, eeg:exemplar.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.eeg = SA.eeg || {};
  var D = SA.eeg.decoder = SA.eeg.decoder || {};
  var BY = 'decoder', MODES = ['scripted', 'replay', 'synthetic'];
  var st = { subs: [], timer: null, xCache: {}, exemplar: null, synthStats: null };

  function cfg() { return (SA.config && SA.config.eeg) || {}; }
  function classes() { return cfg().classes || ['left', 'right', 'feet', 'tongue']; }
  function tokenOf(c) { return (cfg().tokenOf || {})[c] || null; }
  function sget(p, dflt) { try { var v = SA.store.get(p); return v === undefined ? dflt : v; } catch (e) { return dflt; } }
  function sset(p, v) { SA.store.set(p, v, BY); }
  function now() { return (SA.clock && SA.clock.now) ? SA.clock.now() : Date.now(); }
  function emit(evt, p) { if (SA.bus) SA.bus.emit(evt, p); }
  function isStub(d) { return !!(d && d.manifest && ((d.manifest.run && d.manifest.run.stub) || d.manifest.stub)); }
  function weights() { return SA.data && SA.data.sfegatWeights; }
  function replay() { return SA.data && SA.data.miReplay; }
  function arr(a) { return a ? Array.prototype.slice.call(a) : null; }

  function status(d, stubFn) { return !d ? 'missing' : ((stubFn || isStub)(d) ? 'stub' : 'ok'); }
  D.dataStatus = function () {
    var em = SA.data && SA.data.errpModel;
    return { weights: status(weights()), replay: status(replay()),
             errp: status(em, function (m) { return !!(m.stub || (m.run && m.run.stub)); }) };
  };
  D.catalog = function () {
    var r = replay();
    if (!r || !r.records) return [];
    return r.records.map(function (x) { return { id: x.id, index: x.index, trueCls: x.trueCls, source: 'replay' }; });
  };
  D.available = function (mode) {
    var ds = D.dataStatus();
    if (mode === 'scripted') return true;
    if (mode === 'replay') return cfg().replayEnabled !== false && ds.weights !== 'missing' && ds.replay !== 'missing';
    if (mode === 'synthetic') return !!cfg().synthEnabled && ds.weights !== 'missing';
    return false;
  };

  function model() { return SA.eeg.sfegat.load(weights()); }

  D.decode = function (trial) {
    var r = SA.eeg.sfegat.forward(model(), trial.X, trial.C || 22, trial.T || 1000);
    var g = SA.eeg.graph;
    return { logits: arr(r.logits), probs: arr(r.probs), probsCal: arr(r.probsCal), pred: r.pred, predIdx: r.predIdx,
             conf: r.conf, calibrated: r.calibrated,
             trace: { evo0: g.toPlain(r.graphs[0]), evo1: g.toPlain(r.graphs[1]), evo2: g.toPlain(r.graphs[2]), evo3: g.toPlain(r.graphs[3]) },
             edgeCounts: r.edgeCounts.slice(), timings: r.timings, result: r };
  };

  function replayX(rec) {
    if (!st.xCache[rec.id]) st.xCache[rec.id] = SA.core.b64.decodeF32(rec.b64);
    return st.xCache[rec.id];
  }
  function findRec(id) {
    var r = replay(), recs = (r && r.records) || [];
    for (var i = 0; i < recs.length; i++) if (recs[i].id === id) return recs[i];
    return null;
  }
  function bumpCursor(cls) {
    var cur = sget('decoder.cursor', {}) || {}, k = cur[cls] || 0;
    cur[cls] = k + 1;
    sset('decoder.cursor', cur);
    return k;
  }

  // -> {X, C, T, trial:{id, subject, session, index, trueCls}, cuedCls, source, expected}
  function pick(mode, ref) {
    ref = ref || {};
    var pin = sget('decoder.pin', null), id = ref.trialId || pin || null, cls = ref.cuedCls;
    if (mode === 'replay') {
      var rec = null;
      if (id) { rec = findRec(id); if (!rec) throw new Error('decoder: unknown trial ' + id); }
      else {
        if (classes().indexOf(cls) < 0) throw new Error('decoder: bad cue ' + cls);
        var pool = (replay().records || []).filter(function (x) { return x.trueCls === cls; });
        if (!pool.length) throw new Error('decoder: no replay trial of class ' + cls);
        rec = pool[bumpCursor(cls) % pool.length];
      }
      if (pin && !ref.trialId) sset('decoder.pin', null);
      var man = replay().manifest || {};
      return { X: replayX(rec), C: 22, T: 1000, source: 'replay', cuedCls: id ? rec.trueCls : cls, expected: rec.expected || null,
               trial: { id: rec.id, subject: man.subject || 'A01', session: man.session || 'E', index: rec.index, trueCls: rec.trueCls } };
    }
    if (mode === 'synthetic') {
      var k;
      if (id && /^SYN-/.test(id)) { var parts = id.split('-'); cls = parts[1]; k = +parts[2]; }
      else { if (classes().indexOf(cls) < 0) throw new Error('decoder: bad cue ' + cls); k = bumpCursor(cls); }
      if (pin) sset('decoder.pin', null);
      var s = SA.eeg.synth.trial(cls, k);
      return { X: s.X, C: s.C, T: s.T, source: 'synthetic', cuedCls: cls, expected: null,
               trial: { id: s.id, subject: null, session: null, index: k, trueCls: cls } };
    }
    throw new Error('decoder: mode ' + mode + ' does not decode EEG');
  }

  function meta() {
    var w = weights(), run = (w && w.manifest && w.manifest.run) || {};
    var r = replay(), rrun = (r && r.manifest && r.manifest.run) || {};
    return { preliminary: run.preliminary !== false, stub: !!(run.stub || rrun.stub) };
  }

  D.decodeTrial = function (ref) {
    var mode = sget('decoder.mode', 'scripted');
    if (!D.available(mode) || mode === 'scripted') return null;
    var p = pick(mode, ref), m = meta();
    emit('eeg:decodeStart', { mode: mode, cuedCls: p.cuedCls, trialId: p.trial.id });
    var r = D.decode(p);
    var pred = r.pred, use = r.probsCal || r.probs;
    var payload = { token: tokenOf(pred), cls: pred, conf: r.conf, probs: use, probsRaw: r.probs, calibrated: r.calibrated,
                    decoded: true, mode: mode, source: p.source, cuedCls: p.cuedCls, trial: p.trial,
                    correct: pred === p.trial.trueCls,
                    graphs: [r.trace.evo0, r.trace.evo1, r.trace.evo2, r.trace.evo3], edgeCounts: r.edgeCounts,
                    preliminary: m.preliminary, stub: m.stub, elapsedMs: r.timings && r.timings.totalMs, ts: now() };
    if (p.expected && p.expected.probs) {
      var d = 0;
      for (var i = 0; i < r.probs.length; i++) d = Math.max(d, Math.abs(r.probs[i] - p.expected.probs[i]));
      payload.expectedMaxAbs = d;
    }
    sset('decoder.last', { trialId: p.trial.id, cls: pred, conf: r.conf, correct: payload.correct, probs: use,
                           edgeCounts: r.edgeCounts, mode: mode, elapsedMs: payload.elapsedMs });
    var delay = sget('prefs.decodeAnimation', true) ? (cfg().decodeAnimMs || 0) : 0;
    if (st.timer != null && SA.clock) SA.clock.cancel(st.timer);
    if (delay > 0 && SA.clock && SA.clock.after) {
      st.timer = SA.clock.after(delay, function () { st.timer = null; emit('eeg:decoded', payload); });
    } else emit('eeg:decoded', payload);
    return payload;
  };

  D.exemplar = function () {
    if (st.exemplar) return st.exemplar;
    var r = replay(), w = weights();
    if (!r || !w || !r.records || !r.records.length) return null;
    var id = r.manifest && r.manifest.exemplarId, rec = (id && findRec(id)) || r.records.filter(function (x) { return x.trueCls === 'feet'; })[0] || r.records[0];
    var out = D.decode({ X: replayX(rec), C: 22, T: 1000 }), m = meta();
    st.exemplar = { trialId: rec.id, graphs: [out.trace.evo0, out.trace.evo1, out.trace.evo2, out.trace.evo3], edgeCounts: out.edgeCounts,
                    caption: 'Illustrative: BCI IV-2a A01 session E trial #' + rec.index + ' — Scripted mode does not decode EEG' +
                      (id && rec.id === id ? ' · picked because it decodes correctly (viva script); not representative' : ''),   // RT2-07 / ADR 0001 D22
                    stub: m.stub, preliminary: m.preliminary };
    return st.exemplar;
  };
  function emitExemplar() {
    if (cfg().scriptedExemplar === false || cfg().scriptedExemplar === 'off') return;
    try { var e = D.exemplar(); if (e) emit('eeg:exemplar', e); } catch (err) { if (root.console) root.console.error('[eeg] exemplar', err); }
  }

  D.synthEval = function (n, done) {
    n = n || cfg().synth && cfg().synth.nEval || 40;
    var cl = classes(), i = 0, ok = 0, rows = [];
    function step() {
      if (i >= n) { st.synthStats = { n: n, correct: ok, accuracy: ok / n, rows: rows }; if (done) done(st.synthStats); return; }
      var cls = cl[i % cl.length], k = Math.floor(i / cl.length), t = SA.eeg.synth.trial(cls, k);
      var r = D.decode(t); rows.push({ id: t.id, pred: r.pred }); if (r.pred === cls) ok++;
      i++;
      if (SA.clock && SA.clock.after && done) SA.clock.after(0, step); else step();
    }
    step();
    return st.synthStats;
  };
  D.synthStats = function () { return st.synthStats; };

  function onToken(p) {
    if (!p || !p.cls) return;
    emit('eeg:decoded', { token: p.token || tokenOf(p.cls), cls: p.cls, conf: sget('decoder.sliders.neural', 0.92), probs: null,
                          calibrated: false, decoded: false, mode: sget('decoder.mode', 'scripted'), source: p.source || 'keyboard',
                          cuedCls: p.cls, trial: null, correct: null, graphs: null, edgeCounts: null,
                          preliminary: false, stub: false, ts: p.ts || now() });
  }

  function onDecodeRequest(p) {
    try { D.decodeTrial(p || {}); } catch (err) { if (root.console) root.console.error('[eeg] decode failed', err); }
  }

  function onHarnessSet(p) {
    if (!p || typeof p.key !== 'string' || p.key.indexOf('decoder.') !== 0 || p.key === 'decoder.errpPin') return;
    var k = p.key, v = p.value;
    if (k === 'decoder.mode') {
      if (MODES.indexOf(v) < 0 || !D.available(v)) return;
      var prev = sget('decoder.mode', 'scripted');
      if (prev === v) return;
      sset('decoder.mode', v);
      emit('decoder:modeChanged', { mode: v, prev: prev });
      if (v === 'scripted') emitExemplar();
    } else if (k === 'decoder.sliders.neural' || k === 'decoder.sliders.semantic') {
      var x = Math.max(0, Math.min(1, +v));
      if (!isFinite(x)) return;
      sset(k, x);
      if (k === 'decoder.sliders.semantic') sset('decoder.sliders.semanticOverride', true);
    } else if (k === 'decoder.pin') {
      sset('decoder.pin', v || null);
    } else if (k === 'decoder.sliders.semanticOverride') {
      sset(k, !!v);
    }
  }

  function writeData() {
    try { sset('decoder.catalog', D.catalog()); sset('decoder.dataStatus', D.dataStatus()); }
    catch (err) { if (root.console) root.console.error('[eeg] store write', err); }
  }

  function onReset() {
    if (st.timer != null && SA.clock) SA.clock.cancel(st.timer);
    st.timer = null;
    // Deferred so Reset Demo first restores the exact initial state (reset-equality), then
    // the data catalogue / status and the Scripted exemplar come back.
    if (SA.clock && SA.clock.after) SA.clock.after(0, function () { writeData(); emitExemplar(); });
  }

  D.init = function () {
    if (st.subs.length) return;
    var on = function (e, fn) { st.subs.push(SA.bus.on(e, fn)); };
    on('input:token', onToken);
    on('input:decodeRequest', onDecodeRequest);
    on('harness:set', onHarnessSet);
    on('demo:reset', onReset);
    writeData();
    if (SA.clock && SA.clock.after) SA.clock.after(0, emitExemplar);
  };
})(typeof window !== 'undefined' ? window : globalThis);
