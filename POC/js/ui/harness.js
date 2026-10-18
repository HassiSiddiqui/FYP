/* SilentAssist — Operator Harness dock (ADR 0005 D25–D27; architecture §2.6, §6.2). Owner: UI.
 * Emits only: input:operatorToken, input:decodeRequest, errp:inject, harness:set, demo:resetRequested. */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.ui = SA.ui || {};

  var inited = false, doc = null, expanded = null;
  var CLS_NAME = { left: 'Left Hand', right: 'Right Hand', feet: 'Both Feet', tongue: 'Tongue' };

  function $(id) { return doc.getElementById(id); }
  function mk(tag, attrs, text) {
    var e = doc.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'className') e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
    });
    if (text != null) e.textContent = text;
    return e;
  }
  function button(id, label, bracketed, onClick) {
    var b = mk('button', { id: id, type: 'button', tabindex: '-1', className: 'hz-btn' });
    if (bracketed) b.appendChild(mk('span', { className: 'sa-bracketed' }, label)); else b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }
  function emitSet(key, value) { SA.bus.emit('harness:set', { key: key, value: value }); }
  function refocus() { if (SA.ui.navigator && SA.ui.navigator.refocus) SA.ui.navigator.refocus(); }
  function wireSelect(sel, fn) {
    sel.setAttribute('tabindex', '-1');
    sel.addEventListener('change', function () { fn(sel.value); refocus(); });
    sel.addEventListener('blur', refocus);
    sel.addEventListener('keydown', function (e) { if (e.key === 'Escape') refocus(); });
  }
  function toggle(id, label, key) {
    var wrap = mk('label', { className: 'hz-toggle' });
    var cb = mk('input', { id: id, type: 'checkbox', tabindex: '-1' });
    cb.addEventListener('change', function () { emitSet(key, !!cb.checked); refocus(); });
    wrap.appendChild(cb);
    wrap.appendChild(doc.createTextNode(' ' + label));
    return wrap;
  }
  function slider(id, label, key, caption) {
    var wrap = mk('label', { className: 'hz-slider' });
    wrap.appendChild(doc.createTextNode(label + ' '));
    var r = mk('input', { id: id, type: 'range', min: '0', max: '100', step: '1', tabindex: '-1' });
    var out = mk('output', { id: id + '-val', className: 'hz-val' }, '');
    r.addEventListener('input', function () { out.textContent = r.value + '%'; });
    r.addEventListener('change', function () { emitSet(key, Number(r.value) / 100); refocus(); });
    r.addEventListener('pointerup', refocus);
    wrap.appendChild(r); wrap.appendChild(out);
    if (caption) wrap.appendChild(mk('span', { className: 'hz-cap' }, caption));
    return wrap;
  }

  function build(el) {
    var S = SA.config.ui.strings;
    while (el.firstChild) el.removeChild(el.firstChild);
    el.setAttribute('aria-label', S.harnessLabel);
    el.appendChild(mk('div', { id: 'hz-label', className: 'hz-label' }, S.harnessLabel));

    var row1 = mk('div', { className: 'hz-row hz-row-main' });
    [['hz-next', S.btnNext, 'right'], ['hz-prev', S.btnPrev, 'left'], ['hz-select', S.btnSelect, 'feet'], ['hz-back', S.btnBack, 'tongue']]
      .forEach(function (d) {
        row1.appendChild(button(d[0], d[1], true, function () { SA.bus.emit('input:operatorToken', { cls: d[2] }); }));
      });
    row1.appendChild(mk('span', { className: 'hz-sep', 'aria-hidden': 'true' }, ''));
    row1.appendChild(button('hz-noerrp', S.btnNoErrp, true, function () { SA.bus.emit('errp:inject', { kind: 'correct', source: 'operator' }); }));
    row1.appendChild(button('hz-simerrp', S.btnSimErrp, true, function () { SA.bus.emit('errp:inject', { kind: 'error', source: 'operator' }); }));
    var modeWrap = mk('label', { className: 'hz-field' }, 'Decoder ');
    var mode = mk('select', { id: 'hz-mode' });
    wireSelect(mode, function (v) { emitSet('decoder.mode', v); });
    modeWrap.appendChild(mode);
    row1.appendChild(modeWrap);
    row1.appendChild(button('hz-more', S.btnMore, false, function () { setExpanded(!expanded); }));
    el.appendChild(row1);

    var row2 = mk('div', { className: 'hz-row hz-row-meta' });
    row2.appendChild(mk('span', { id: 'hz-decode-strip', className: 'hz-strip', role: 'status' }, S.scriptedStrip));
    row2.appendChild(mk('span', { id: 'hz-dataline', className: 'hz-dataline' }, S.dataLine));
    el.appendChild(row2);

    var ex = mk('div', { id: 'hz-expanded', className: 'hz-row hz-expanded' });
    ex.appendChild(slider('hz-neural', 'Neural MI', 'decoder.sliders.neural', S.neuralCaption));
    ex.appendChild(slider('hz-semantic', 'Semantic', 'decoder.sliders.semantic', 'overrides KG s'));
    var trWrap = mk('label', { className: 'hz-field' }, 'Replay trial ');
    var trial = mk('select', { id: 'hz-trial' });
    wireSelect(trial, function () { /* picked; acted on by Decode */ });
    trWrap.appendChild(trial);
    ex.appendChild(trWrap);
    ex.appendChild(button('hz-decode', S.btnDecode, false, function () {
      var v = trial.value || 'cue:feet';
      var p = v.indexOf('trial:') === 0 ? { trialId: v.slice(6) } : { cuedCls: v.slice(4) };
      SA.bus.emit('input:decodeRequest', p);
    }));
    var roomWrap = mk('label', { className: 'hz-field' }, 'Active room ');
    var room = mk('select', { id: 'hz-room' });
    var rooms = (SA.config.kg && SA.config.kg.rooms) || { MasterBedroom: 'Master Bedroom', LivingRoom: 'Living Room' };
    Object.keys(rooms).forEach(function (k) { room.appendChild(mk('option', { value: k }, rooms[k])); });
    wireSelect(room, function (v) { emitSet('context.activeRoom', v); });
    roomWrap.appendChild(room);
    ex.appendChild(roomWrap);
    ex.appendChild(toggle('hz-voice', 'Voice', 'prefs.voice'));
    ex.appendChild(toggle('hz-anim', 'Decode animation', 'prefs.decodeAnimation'));
    ex.appendChild(toggle('hz-autoconfirm', 'ErrP auto-confirm', 'prefs.errpAutoConfirm'));
    ex.appendChild(toggle('hz-reduced-motion', 'Reduced motion', 'prefs.reducedMotion'));
    ex.appendChild(button('hz-reset', S.btnReset, true, function () { SA.bus.emit('demo:resetRequested', {}); }));
    el.appendChild(ex);

    el.addEventListener('mousedown', function (e) {
      if (e.target && e.target.closest && e.target.closest('button')) e.preventDefault();
    });
  }

  function setExpanded(v) {
    expanded = !!v;
    var ex = $('hz-expanded'), more = $('hz-more'), dock = $('sa-harness');
    if (ex) ex.hidden = !expanded;
    if (more) { more.textContent = expanded ? SA.config.ui.strings.btnLess : SA.config.ui.strings.btnMore; more.setAttribute('aria-expanded', String(expanded)); }
    if (dock) dock.setAttribute('data-expanded', String(expanded));
  }

  // RT2-07 (ADR 0004 / ADR 0001 D16): full-session accuracy, paper value and subset rule, read from the export,
  // floored to 2 dp (never rounded up).
  function floorPct(x) { return (Math.floor(x * 10000) / 100).toFixed(2) + ' %'; }
  function replayAccText() {
    var m = SA.data && SA.data.miReplay && SA.data.miReplay.manifest, d = m && m.deployment;
    if (!d || typeof d.sessionEAccuracy !== 'number') return '';
    var nS = d.nSubset || 0, kS = Math.round((d.subsetAccuracy || 0) * nS);
    return ' · model accuracy on all ' + d.n + ' A01E trials: ' + floorPct(d.sessionEAccuracy) +
      ' (' + Math.round(d.sessionEAccuracy * d.n) + '/' + d.n + '; paper A01: 80.21 %)' +
      (nS ? ' · these ' + nS + ' trials: first 5 per class in trial order, not chosen by correctness (' + kS + '/' + nS + ' correct)' : '');
  }

  function modeOptions(dec) {
    var eegCfg = SA.config.eeg || {};
    var ds = dec.dataStatus || {};
    var replayOk = eegCfg.replayEnabled !== false && ds.replay !== 'missing' && ds.weights !== 'missing';
    var replayLabel = replayOk ? 'Replay (BCI IV-2a A01E) · PRELIMINARY (Plan B, 1 seed)' + replayAccText() + ((ds.weights === 'stub' || ds.replay === 'stub') ? ' · STUB' : '')
      : 'Replay (parity pending — disabled)';
    return [
      { v: 'scripted', t: 'Scripted (no EEG)', ok: true },
      { v: 'replay', t: replayLabel, ok: replayOk },
      { v: 'synthetic', t: eegCfg.synthEnabled ? 'Synthetic (generated) · PRELIMINARY' : 'Synthetic (post-mid-eval)', ok: !!eegCfg.synthEnabled }
    ];
  }

  function sync() {
    if (!doc || !$('hz-mode')) return;
    var snap = SA.store.snapshot(), dec = snap.decoder || {}, prefs = snap.prefs || {}, ctx = snap.context || {};
    var mode = $('hz-mode');
    var opts = modeOptions(dec), sig = JSON.stringify(opts);
    if (mode.__sig !== sig) {
      while (mode.firstChild) mode.removeChild(mode.firstChild);
      opts.forEach(function (o) { var op = mk('option', { value: o.v }, o.t); if (!o.ok) op.disabled = true; mode.appendChild(op); });
      mode.__sig = sig;
    }
    if (mode.value !== dec.mode) mode.value = dec.mode || 'scripted';
    var trial = $('hz-trial');
    var cat = dec.catalog || [];
    var tsig = JSON.stringify(cat.map(function (c) { return c.id; }));
    if (trial.__sig !== tsig) {
      var keep = trial.value;
      while (trial.firstChild) trial.removeChild(trial.firstChild);
      ['left', 'right', 'feet', 'tongue'].forEach(function (c) { trial.appendChild(mk('option', { value: 'cue:' + c }, 'Cue: ' + CLS_NAME[c] + ' (next held-out trial)')); });
      cat.forEach(function (c) {
        trial.appendChild(mk('option', { value: 'trial:' + c.id }, c.id + ' · truth ' + (CLS_NAME[c.trueCls] || c.trueCls || '?')));
      });
      trial.value = keep || 'cue:feet';
      if (!trial.value) trial.value = 'cue:feet';
      trial.__sig = tsig;
    }
    var nonScripted = dec.mode && dec.mode !== 'scripted';
    $('hz-decode').disabled = !nonScripted;
    $('hz-decode').title = nonScripted ? '' : 'Switch the decoder to Replay to decode a trial';
    var sl = dec.sliders || {};
    [['hz-neural', sl.neural], ['hz-semantic', sl.semantic]].forEach(function (p) {
      var r = $(p[0]), val = Math.round((p[1] == null ? 0 : p[1]) * 100);
      if (doc.activeElement !== r && Number(r.value) !== val) r.value = String(val);
      var out = $(p[0] + '-val'); if (out) out.textContent = r.value + '%';
    });
    if ($('hz-room').value !== ctx.activeRoom) $('hz-room').value = ctx.activeRoom;
    [['hz-voice', 'voice'], ['hz-anim', 'decodeAnimation'], ['hz-autoconfirm', 'errpAutoConfirm'], ['hz-reduced-motion', 'reducedMotion']]
      .forEach(function (p) { var cb = $(p[0]); if (cb.checked !== !!prefs[p[1]]) cb.checked = !!prefs[p[1]]; });
    var noErr = $('hz-noerrp'), simErr = $('hz-simerrp');
    var ph = snap.episode && snap.episode.phase;
    noErr.classList.toggle('is-live', ph === 'observing');
    simErr.classList.toggle('is-live', ph === 'observing');
  }

  function strip(p) {
    var el = $('hz-decode-strip');
    if (!el || !p) return;
    var S = SA.config.ui.strings, F = SA.ui.format;
    var name = CLS_NAME[p.cls] || p.cls;
    var t;
    if (!p.decoded) {
      t = S.scriptedStrip + ' · ' + name + ' → ' + p.token + ' · n = ' + F.pct(p.conf);
    } else {
      var truth = p.trial ? (CLS_NAME[p.trial.trueCls] || p.trial.trueCls) : '?';
      t = 'Pred: ' + name + ' (' + F.score(p.conf) + ') • Truth: ' + truth + ' ' + (p.correct ? '✓' : '✗') +
        (p.trial ? ' · ' + p.trial.id : '') + (p.calibrated ? ' · temperature-scaled (T* = 8.0, fit on 72 A01T trials)' : ' · uncalibrated') +
        ' · PRELIMINARY (Plan B)' + (p.stub ? ' · STUB DATA — not model output' : '');
    }
    el.textContent = t;
    el.setAttribute('data-kind', p.decoded ? (p.correct ? 'ok' : 'warn') : 'scripted');
  }

  function init() {
    if (inited || typeof document === 'undefined') return;
    doc = document;
    var el = $('sa-harness');
    if (!el) return;
    inited = true;
    build(el);
    var h = root.innerHeight || 0;
    setExpanded(h >= 900);
    SA.bus.on('store:changed', function (p) {
      if (!p || !p.path || /^(decoder|prefs|context|episode)/.test(p.path) || p.path === '' || p.path === '*') sync();
    });
    SA.bus.on('eeg:decoded', strip);
    SA.bus.on('eeg:decodeStart', function () { var e = $('hz-decode-strip'); if (e) e.textContent = SA.config.ui.strings.decoding; });
    SA.bus.on('decoder:modeChanged', sync);
    SA.bus.on('demo:reset', function () { var e = $('hz-decode-strip'); if (e) e.textContent = SA.config.ui.strings.scriptedStrip; sync(); });
    sync();
  }

  SA.ui.harness = { init: init, sync: sync, setExpanded: setExpanded };
})(typeof window !== 'undefined' ? window : globalThis);
