/* SA.ui.caregiver.queue — High-Risk Action Approval Queue (ADR 0005 D28 row 1, 7 col).
 * Per pending item: decoded intent, n and s, current ➔ target, rule that fired, elapsed time,
 * [Approve]/[Reject] (button.cv-approve / button.cv-reject with data-approval-id; .sa-bracketed).
 * Buttons only render; the dashboard's delegated click handler emits caregiver:approve / caregiver:reject.
 * No DOM access at load time. */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.ui = SA.ui || {};
  SA.ui.caregiver = SA.ui.caregiver || {};

  var seenAt = {};   // approvalId -> demo-clock ms when first seen pending (fallback for elapsed time)

  function str(key, dflt) {
    var s = SA.config && SA.config.ui && SA.config.ui.strings;
    return (s && s[key]) || dflt;
  }
  function pct(x) {
    if (typeof x !== 'number' || !isFinite(x)) return '—';
    try { if (SA.ui.format && SA.ui.format.pct) return SA.ui.format.pct(x); } catch (e) { /* fall through */ }
    return Math.round(x * 100) + '%';
  }
  function now() { try { return SA.clock.now(); } catch (e) { return Date.now(); } }

  /** "Air Conditioner: 24°C ➔ 16°C" (pure; current state from store.devices). */
  function targetText(action, devices) {
    if (!action) return '—';
    devices = devices || {};
    if (action.kind === 'preset') return 'Preset: ' + action.id;
    var d = devices[action.id] || {};
    var label = d.label || action.id;
    var a = action.args || {};
    var c = action.command || '';
    if (/SetTemperature|Setpoint/i.test(c) && a.value !== undefined) return label + ': ' + d.setpoint + '°C ➔ ' + a.value + '°C';
    if (/TurnOn/i.test(c)) return label + ': ' + String(d.power || 'off').toUpperCase() + ' ➔ ON';
    if (/TurnOff/i.test(c)) return label + ': ' + String(d.power || 'on').toUpperCase() + ' ➔ OFF';
    if (/Mode/i.test(c) && a.value !== undefined) return label + ': ' + d.mode + ' ➔ ' + a.value;
    var argTxt = Object.keys(a).map(function (k) { return k + ' ' + a[k]; }).join(', ');
    return label + ': ' + c + (argTxt ? ' (' + argTxt + ')' : '');
  }

  function elapsed(item) {
    var t0 = typeof item.requestedAt === 'number' ? item.requestedAt
      : (typeof item.ts === 'number' ? item.ts : seenAt[item.id]);
    if (typeof t0 !== 'number') return '—';
    var s = Math.max(0, Math.floor((now() - t0) / 1000));
    var m = Math.floor(s / 60);
    return (m ? m + ' min ' : '') + (s % 60) + ' s ago';
  }

  /** Queue model (pure-ish; records first-seen times). */
  function model(approvals, devices) {
    approvals = approvals || [];
    var pending = approvals.filter(function (a) { return a && a.status === 'pending'; });
    // RT1-06: the patient's live requests are listed above seeded examples (stable within each group)
    pending = pending.filter(function (a) { return !a.seeded; }).concat(pending.filter(function (a) { return !!a.seeded; }));
    pending.forEach(function (a) { if (seenAt[a.id] === undefined) seenAt[a.id] = now(); });
    var done = approvals.filter(function (a) { return a && a.status !== 'pending'; });
    return {
      count: pending.length,
      pending: pending.map(function (a) {
        return { id: a.id, seeded: !!a.seeded, intent: a.intentLabel || (a.action && a.action.command) || '—',
          n: pct(a.n), s: pct(a.s), target: targetText(a.action, devices),
          rule: a.reason || a.ruleText || '—', label: a.label || '', elapsed: elapsed(a) };
      }),
      history: done.slice(-5).reverse().map(function (a) {
        return { id: a.id, intent: a.intentLabel || '—', status: a.status, actor: a.actor || a.resolvedBy || '' };
      })
    };
  }

  function txt(tag, cls, text, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  function button(cls, label, id, parent) {
    var b = txt('button', cls + ' sa-bracketed cv-btn', label, parent);
    b.type = 'button';
    b.tabIndex = 0;   // RT1-10: keyboard-operable (the dashboard is display:none when closed)
    b.setAttribute('data-approval-id', id);
    return b;
  }

  function render(host, state) {
    if (!host) return;
    var m = model(state && state.approvals, state && state.devices);
    // RT1-10: the queue is rebuilt every second; keep keyboard focus on the same button across rebuilds
    var ae = (typeof document !== 'undefined') ? document.activeElement : null, keep = null;
    if (ae && host.contains(ae) && ae.getAttribute) keep = { id: ae.getAttribute('data-approval-id'), approve: ae.classList.contains('cv-approve') };
    host.textContent = '';
    var head = txt('div', 'cv-panel-head', undefined, host);
    txt('h2', 'cv-h', 'High-Risk Action Approval Queue', head);
    txt('span', 'cv-count' + (m.count ? ' is-pending' : ''), m.count + ' pending', head);
    if (!m.count) txt('p', 'cv-empty', 'No requests awaiting approval.', host);
    var list = txt('ul', 'cv-queue-list', undefined, host);
    m.pending.forEach(function (p) {
      var li = txt('li', 'cv-req', undefined, list);
      li.setAttribute('data-approval-id', p.id);
      var top = txt('div', 'cv-req-top', undefined, li);
      txt('span', 'cv-chip cv-chip-care', '⚑ CAREGIVER APPROVAL', top);
      txt('span', 'cv-req-intent', p.intent, top);
      txt('span', 'cv-req-elapsed', p.elapsed, top);
      var dl = txt('dl', 'cv-req-facts', undefined, li);
      [['Confidence', 'Neural MI ' + p.n + ' • Semantic ' + p.s], ['Change', p.target], ['Rule', p.rule]].forEach(function (kv) {
        var row = txt('div', 'cv-fact', undefined, dl);
        txt('dt', '', kv[0], row);
        txt('dd', kv[0] === 'Rule' ? 'cv-rule' : '', kv[1], row);
      });
      if (p.label) txt('p', 'cv-req-label', p.label, li);
      var act = txt('div', 'cv-req-actions', undefined, li);
      button('cv-approve', str('btnApprove', 'Approve'), p.id, act);
      button('cv-reject', str('btnReject', 'Reject'), p.id, act);
    });
    if (keep && keep.id) {
      var again = host.querySelector('button.' + (keep.approve ? 'cv-approve' : 'cv-reject') + '[data-approval-id="' + keep.id + '"]');
      if (again && again.focus) again.focus();
    }
    if (m.history.length) {
      var hist = txt('ul', 'cv-queue-history', undefined, host);
      m.history.forEach(function (h) {
        var li = txt('li', 'cv-hist is-' + h.status, undefined, hist);
        var glyph = h.status === 'approved' ? '✓ ' : h.status === 'rejected' ? '✕ ' : '• ';
        li.textContent = glyph + h.intent + ' — ' + h.status + (h.actor ? ' by ' + h.actor : '');
      });
    }
  }

  SA.ui.caregiver.queue = { render: render, model: model, targetText: targetText,
    reset: function () { seenAt = {}; } };
})(typeof window !== 'undefined' ? window : globalThis);
