/* SilentAssist — CogLign Context-Resolution Panel (README §3 Screen 4; ADR 0005 D10). Owner: UI.
 * render(el, {resolved, decided, sliders, selectionId, decoderLast, preview})
 * Values are written into #cl-* elements; labels are separate spans (architecture §6.2). */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.ui = SA.ui || {};
  SA.ui.components = SA.ui.components || {};

  var ROWS = [
    ['intent', 'cl-intent'], ['space', 'cl-space'], ['entity', 'cl-entity'], ['sparql', 'cl-sparql-score']
  ];
  var TELE = [['neural', 'cl-neural'], ['semantic', 'cl-semantic'], ['risk', 'cl-risk']];

  function mk(doc, tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function row(doc, parent, label, id) {
    var r = mk(doc, 'div', 'cl-row');
    r.appendChild(mk(doc, 'span', 'cl-label', label));
    var v = mk(doc, 'span', 'cl-value', '—'); v.id = id;
    if (id === 'cl-sparql-score') {   // README "SPARQL Match: Score 0.94" — the word is a label, the value stays bare
      var w = mk(doc, 'span', 'cl-value-wrap');
      w.appendChild(mk(doc, 'span', 'cl-unit', 'Score '));
      w.appendChild(v);
      r.appendChild(w);
      parent.appendChild(r);
      return v;
    }
    r.appendChild(v);
    parent.appendChild(r);
    return v;
  }

  function build(el) {
    var doc = el.ownerDocument, P = SA.config.ui.strings.panel;
    while (el.firstChild) el.removeChild(el.firstChild);
    var h = mk(doc, 'h2', 'cl-heading', 'CogLign Context-Resolution Panel');
    el.appendChild(h);
    var badge = mk(doc, 'span', 'cl-preview', 'Preview'); badge.id = 'cl-preview'; badge.hidden = true;
    h.appendChild(badge);
    ROWS.forEach(function (r) { row(doc, el, P[r[0]], r[1]); });
    var tele = mk(doc, 'div', 'cl-group');
    tele.appendChild(mk(doc, 'span', 'cl-group-label', P.telemetry));
    TELE.forEach(function (r) { row(doc, tele, P[r[0]], r[1]); });
    el.appendChild(tele);
    var dr = mk(doc, 'div', 'cl-row cl-row-decision');
    dr.appendChild(mk(doc, 'span', 'cl-label', P.decision));
    var dv = mk(doc, 'span', 'cl-value cl-chip', '—'); dv.id = 'cl-decision';
    dr.appendChild(dv);
    el.appendChild(dr);
    var kt = mk(doc, 'div', 'cl-line'); kt.id = 'cl-kgtop'; el.appendChild(kt);
    var tr = mk(doc, 'div', 'cl-trace'); tr.id = 'cl-trace'; el.appendChild(tr);
    var dec = mk(doc, 'div', 'cl-line cl-decode'); dec.id = 'cl-decode'; el.appendChild(dec);
    var det = doc.createElement('details'); det.id = 'cl-sparql';
    var sum = mk(doc, 'summary', null, 'SPARQL query (executed)');
    det.appendChild(sum);
    var pre = mk(doc, 'pre', null, ''); pre.id = 'cl-sparql-text';
    det.appendChild(pre);
    try { if (root.matchMedia && root.matchMedia('(min-width: 1800px) and (min-height: 900px)').matches) det.open = true; } catch (e) { /* ignore */ }
    el.appendChild(det);
    el.__saBuilt = true;
  }

  function set(doc, id, text) { var e = doc.getElementById(id); if (e && e.textContent !== text) e.textContent = text; return e; }

  function chipClass(d) {
    return { EXECUTE: 'ok', CONFIRM: 'warn', REJECT: 'danger', CAREGIVER: 'care' }[d] || 'none';
  }

  function render(el, model) {
    if (!el) return;
    if (!el.__saBuilt) build(el);
    var doc = el.ownerDocument, F = SA.ui.format;
    model = model || {};
    var r = model.resolved, d = model.decided;
    var acted = r && r.actedOn;
    set(doc, 'cl-intent', r ? (r.intentLabel || '—') : '—');
    set(doc, 'cl-space', r ? (r.spatialContext || '—') : '—');
    set(doc, 'cl-entity', acted ? (acted.iri || (':' + acted.id)) : '—');
    set(doc, 'cl-sparql-score', acted && acted.score != null ? F.score(acted.score) : '—');
    var sl = model.sliders || {};
    set(doc, 'cl-neural', F.pct(d ? d.n : sl.neural));
    set(doc, 'cl-semantic', F.pct(d ? d.s : (sl.semanticOverride ? sl.semantic : (r ? r.semanticConfidence : null))));
    set(doc, 'cl-risk', d ? (d.tierLabel || F.tierLabel(d.tier)) : '—');
    var dv = set(doc, 'cl-decision', d ? F.decisionChip(d.decision) : '—');
    if (dv) dv.setAttribute('data-kind', d ? chipClass(d.decision) : 'none');
    var pv = doc.getElementById('cl-preview');
    if (pv) pv.hidden = !model.preview;

    var kg = '';
    if (r && r.kgTop && acted) {
      kg = r.kgTop.id === acted.id ? 'KG top candidate: ' + (r.kgTop.iri || ':' + r.kgTop.id) + ' ✓ matches selection'
        : 'KG top: ' + (r.kgTop.iri || ':' + r.kgTop.id) + ' (' + F.score(r.kgTop.score) + ') ≠ selection';
    }
    set(doc, 'cl-kgtop', kg);

    var trEl = doc.getElementById('cl-trace');
    if (trEl) {
      var lines = [];
      if (d && d.trace) lines = lines.concat(d.trace);
      if (d && d.rule && d.rule.text) lines.push('Rule: ' + d.rule.text);
      if (d && d.advisory) lines.push(d.advisory);
      var txt = lines.join('\n');
      if (trEl.textContent !== txt) trEl.textContent = txt;
    }
    var last = model.decoderLast;
    var decTxt = '';
    if (last && last.decoded && last.trial) {
      decTxt = 'Cue: ' + (last.cuedCls || last.trial.trueCls || '?') + ' · Decoded: ' + last.cls + ' (' + last.token + ') ' +
        (last.correct === true ? '✓' : last.correct === false ? '✗' : '') + ' · ' + last.trial.id + ' · p = ' + F.score(last.conf) +
        (last.preliminary !== false ? ' · PRELIMINARY (Plan B)' : '');
    }
    set(doc, 'cl-decode', decTxt);
    var q = r && r.query ? r.query.text || '' : '';
    var pre = doc.getElementById('cl-sparql-text');
    if (pre && pre.textContent !== q) pre.textContent = q;
  }

  SA.ui.components.coglignPanel = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
