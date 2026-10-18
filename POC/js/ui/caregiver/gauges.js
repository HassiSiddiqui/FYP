/* SA.ui.caregiver.gauges — Neural, Semantic and ErrP-health gauges (ADR 0005 D28 row 1, 5 col;
 * ADR 0002 D23): each a bar plus a number. ErrP health shows deployment-subject S2 AUC/BA
 * (PRELIMINARY), last q and current mode, and STUB when the ErrP model is a stub.
 * Values come from store.telemetry / store.decoder / store.errp and policy:decided / errp:observed
 * payloads; the ErrP model's static metrics are read from SA.data.errpModel (read-only data).
 * No DOM access at load time. */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.ui = SA.ui || {};
  SA.ui.caregiver = SA.ui.caregiver || {};

  function num(x) { return typeof x === 'number' && isFinite(x); }
  function pct(x) { return num(x) ? Math.round(x * 100) + '%' : '—'; }
  function f2(x) { return num(x) ? x.toFixed(2) : '—'; }

  function errpMeta(dataStatus) {
    var m = SA.data && SA.data.errpModel;
    var stub = !m || !!(m.stub || (m.run && m.run.stub)) || dataStatus === 'stub';
    var met = m && m.s2Metrics;
    var mode = (m && m.mode) || (SA.config && SA.config.errp && SA.config.errp.mode) || 'auto';
    var ba = met ? (num(met.ba) ? met.ba : (num(met.baAtTBA) ? met.baAtTBA : null)) : null;
    return { present: !!m, stub: stub, auc: met && num(met.auc) ? met.auc : null, ba: ba,
      subject: m && m.subject != null ? m.subject : null, mode: mode };
  }

  /** Gauge models (pure given state). */
  function model(state) {
    state = state || {};
    var tel = state.telemetry || {};
    var dec = state.decoder || {};
    var sliders = dec.sliders || {};
    var n = num(tel.n) ? tel.n : sliders.neural;
    var s = num(tel.s) ? tel.s : sliders.semantic;
    var meta = errpMeta(dec.dataStatus && dec.dataStatus.errp);
    var errpVal = meta.auc;
    var errpDetail = [];
    // RT1-12: name the subject and metric; put the 6-subject headline next to the single-subject value
    if (meta.auc !== null) errpDetail.push((meta.subject != null ? 'subject ' + meta.subject + ', ' : '') + 'session 2 AUC ' + f2(meta.auc) +
      (meta.ba !== null ? ' (BA ' + f2(meta.ba) + ')' : ''));
    var cs = SA.config && SA.config.errp && SA.config.errp.crossSubjectNote;
    if (cs) errpDetail.push(cs);
    if (meta.auc === null) errpDetail.push('S2 metrics pending');
    errpDetail.push('last q ' + f2(tel.lastQ));
    errpDetail.push('mode ' + meta.mode);
    if (tel.lastErrpDecision) errpDetail.push('last ' + tel.lastErrpDecision);
    var mem = state.errp && state.errp.memory ? state.errp.memory.length : 0;
    errpDetail.push(mem + ' in ErrP memory');
    return [
      { id: 'neural', label: 'Neural confidence', value: n, text: pct(n),
        detail: num(tel.n) ? 'last SELECT (n)' : 'slider (applies to scripted tokens)', tone: n >= 0.75 ? 'ok' : n >= 0.4 ? 'warn' : 'danger' },
      { id: 'semantic', label: 'Semantic score', value: s, text: pct(s),
        detail: num(tel.c) ? 'c = n × s = ' + tel.c.toFixed(4) + (tel.tier ? ' • ' + tel.tier : '') + (tel.lastDecision ? ' • ' + tel.lastDecision : '') : 'awaiting first decision',
        tone: s >= 0.75 ? 'ok' : s >= 0.5 ? 'warn' : 'danger' },
      { id: 'errp', label: 'ErrP health', value: errpVal, text: meta.auc !== null ? f2(meta.auc) : (meta.stub ? 'STUB' : '—'),
        detail: errpDetail.join(' • '), badge: meta.stub ? 'STUB — not a trained model' : 'PRELIMINARY (Plan B)',
        tone: meta.stub ? 'warn' : (errpVal >= 0.7 ? 'ok' : 'warn') }
    ];
  }

  function render(host, state) {
    if (!host) return;
    var gs = model(state);
    host.textContent = '';
    var h = document.createElement('h2');
    h.className = 'cv-h';
    h.textContent = 'Telemetry';
    host.appendChild(h);
    gs.forEach(function (g) {
      var box = document.createElement('div');
      box.className = 'cv-gauge tone-' + g.tone;
      box.setAttribute('data-gauge', g.id);
      var top = document.createElement('div');
      top.className = 'cv-gauge-top';
      var l = document.createElement('span'); l.className = 'cv-gauge-label'; l.textContent = g.label;
      var v = document.createElement('span'); v.className = 'cv-gauge-value'; v.textContent = g.text;
      top.appendChild(l); top.appendChild(v);
      box.appendChild(top);
      var bar = document.createElement('div');
      bar.className = 'cv-bar';
      bar.setAttribute('role', 'meter');
      bar.setAttribute('aria-label', g.label);
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '100');
      var val = num(g.value) ? Math.max(0, Math.min(1, g.value)) : 0;
      bar.setAttribute('aria-valuenow', String(Math.round(val * 100)));
      var fill = document.createElement('div');
      fill.className = 'cv-bar-fill';
      fill.style.width = (val * 100).toFixed(1) + '%';
      bar.appendChild(fill);
      box.appendChild(bar);
      var d = document.createElement('p'); d.className = 'cv-gauge-detail'; d.textContent = g.detail;
      box.appendChild(d);
      if (g.badge) { var b = document.createElement('span'); b.className = 'cv-badge-mini'; b.textContent = g.badge; box.appendChild(b); }
      host.appendChild(box);
    });
  }

  SA.ui.caregiver.gauges = { render: render, model: model };
})(typeof window !== 'undefined' ? window : globalThis);
