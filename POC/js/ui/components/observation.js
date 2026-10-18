/* SilentAssist — observation band, S5 result and confirm/pending dialog (ADR 0005 D8, D9, D12, D14). Owner: UI.
 * renderBand(el, band|null), renderResult(el, result|null), renderDialog(el, dialog|null); render(el, model) = renderBand. */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.ui = SA.ui || {};
  SA.ui.components = SA.ui.components || {};

  function mk(doc, tag, cls, text, id) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (id) e.id = id;
    if (text != null) e.textContent = text;
    return e;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function radar(doc) {
    var r = mk(doc, 'span', 'sa-radar');
    r.setAttribute('aria-hidden', 'true');
    r.appendChild(mk(doc, 'span', 'sa-radar-dot', 'FCz'));
    r.appendChild(mk(doc, 'span', 'sa-radar-dot', 'Cz'));
    return r;
  }
  function key(o) { try { return JSON.stringify(o); } catch (e) { return String(Math.random()); } }

  function renderBand(el, band) {
    if (!el) return;
    var k = key(band);
    if (el.__saKey === k) return;
    el.__saKey = k;
    clear(el);
    if (!band) { el.hidden = true; el.removeAttribute('data-kind'); return; }
    var doc = el.ownerDocument;
    el.hidden = false;
    el.setAttribute('data-kind', band.kind || 'info');
    if (band.kind === 'observing') el.appendChild(radar(doc));
    var box = mk(doc, 'div', 'sa-band-lines');
    (band.lines || []).forEach(function (ln) {
      String(ln).split('\n').forEach(function (l2) { if (l2) box.appendChild(mk(doc, 'div', 'sa-band-line', l2)); });
    });
    el.appendChild(box);
  }

  function renderResult(el, r) {
    if (!el) return;
    var k = key(r);
    if (el.__saKey === k) return;
    el.__saKey = k;
    clear(el);
    if (!r) { el.hidden = true; el.removeAttribute('data-kind'); return; }
    var doc = el.ownerDocument, S = SA.config.ui.strings;
    el.hidden = false;
    el.setAttribute('data-kind', r.kind || '');
    var errp = mk(doc, 'div', 'sa-result-errp', r.errp || '', 'sa-result-errp');
    if (!r.errp) errp.hidden = true;
    el.appendChild(errp);
    var tr = mk(doc, 'div', 'sa-result-transition' + (r.kind === 'observing' ? ' is-animating' : ''), null, 'sa-result-transition');
    String(r.transition || '').split('\n').forEach(function (l) { if (l) tr.appendChild(mk(doc, 'div', 'sa-transition-line', l)); });
    el.appendChild(tr);
    var stEl = mk(doc, 'div', 'sa-result-status', null, 'sa-result-status');
    stEl.setAttribute('data-kind', r.statusKind || (r.kind === 'observing' ? 'info' : ''));
    if (r.kind === 'observing') stEl.appendChild(radar(doc));
    stEl.appendChild(mk(doc, 'span', 'sa-status-text', r.status || ''));
    el.appendChild(stEl);
    if (r.note) el.appendChild(mk(doc, 'div', 'sa-result-note', r.note));
    var alt = mk(doc, 'div', 'sa-result-alt', null, 'sa-result-alt');
    if (r.alt && r.alt.label) {
      alt.appendChild(doc.createTextNode(S.altPrefix || 'Suggested alternative: '));
      alt.appendChild(mk(doc, 'strong', null, r.alt.label));
    } else {
      alt.hidden = true;
    }
    el.appendChild(alt);
  }

  function renderDialog(el, d) {
    if (!el) return;
    var k = key(d);
    if (el.__saKey === k) return;
    el.__saKey = k;
    clear(el);
    if (!d) { el.hidden = true; el.removeAttribute('data-kind'); return; }
    var doc = el.ownerDocument;
    el.hidden = false;
    el.setAttribute('data-kind', d.kind);
    el.setAttribute('aria-labelledby', 'sa-dialog-title');
    var card = mk(doc, 'div', 'sa-dialog-card');
    if (d.kind === 'confirm') {
      var lb = mk(doc, 'div', 'sa-listbox sa-dialog-listbox', null, 'sa-dialog-listbox');
      lb.setAttribute('role', 'listbox');
      lb.setAttribute('tabindex', '0');
      lb.setAttribute('aria-label', 'Both Feet to confirm, Tongue to cancel');
      var opt = mk(doc, 'div', 'sa-card is-focused', null, 'opt-confirm-ok');
      opt.setAttribute('role', 'option');
      opt.setAttribute('aria-selected', 'true');
      opt.setAttribute('data-item-id', 'ok');
      var mkr = mk(doc, 'span', 'sa-focus-marker', '● Focused'); mkr.setAttribute('aria-hidden', 'true');
      opt.appendChild(mkr);
      opt.appendChild(mk(doc, 'span', 'sa-card-title', d.title, 'sa-dialog-title'));
      lb.appendChild(opt);
      lb.setAttribute('aria-activedescendant', 'opt-confirm-ok');
      card.appendChild(lb);
      if (d.diff) String(d.diff).split('\n').forEach(function (l) { card.appendChild(mk(doc, 'div', 'sa-dialog-diff', l)); });
      if (d.reason) card.appendChild(mk(doc, 'div', 'sa-dialog-reason', d.reason));
    } else {
      card.appendChild(mk(doc, 'div', 'sa-dialog-title', '⚑ ' + d.title, 'sa-dialog-title'));
      if (d.reason) card.appendChild(mk(doc, 'div', 'sa-dialog-reason', d.reason));
    }
    if (d.hint) card.appendChild(mk(doc, 'div', 'sa-dialog-hint', d.hint));
    el.appendChild(card);
  }

  SA.ui.components.observation = { render: renderBand, renderBand: renderBand, renderResult: renderResult, renderDialog: renderDialog };
})(typeof window !== 'undefined' ? window : globalThis);
