/* SA.ui.caregiver.auditView — tamper-evident chained audit log (ADR 0005 D28 row 3).
 * Entries arrive only via audit:appended {seq, type, hash, entry}; verification results via
 * audit:verified {ok, brokenAt, algo} (safety/audit runs its verify() on audit:verifyRequested).
 * Badge "Chain verified ✓ (SHA-256)" or "(FNV-1a — integrity only, not tamper-proof)";
 * head hash = 12 hex chars + seq. No DOM access at load time. */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.ui = SA.ui || {};
  SA.ui.caregiver = SA.ui.caregiver || {};

  var MAX_ROWS = 300;
  var entries = [];                       // newest last; never truncated by Reset (chain is append-only)
  var verdict = null;                     // {ok, brokenAt, algo} | null
  var stale = true;                       // an entry arrived after the last verdict
  var inited = false;

  function shortHash(h) { return typeof h === 'string' && h.length ? h.slice(0, 12) : '—'; }

  function badge(v, isStale) {
    if (!v) return { text: 'Chain not yet verified', tone: 'pending' };
    if (!v.ok) return { text: '✕ Chain broken at seq ' + v.brokenAt + ' — tampering detected', tone: 'danger' };
    var algo = v.algo === 'FNV-1a' ? 'FNV-1a — integrity only, not tamper-proof' : (v.algo || 'SHA-256');
    return { text: 'Chain verified ✓ (' + algo + ')' + (isStale ? ' • re-verifying…' : ''), tone: isStale ? 'pending' : 'ok' };
  }

  function summary(data) {
    if (data === undefined || data === null) return '';
    var s;
    try { s = JSON.stringify(data); } catch (e) { s = String(data); }
    if (s === '{}') return '';
    return s.length > 96 ? s.slice(0, 95) + '…' : s;
  }

  function onAppended(p) {
    if (!p) return;
    var e = p.entry || {};
    entries.push({ seq: typeof p.seq === 'number' ? p.seq : e.seq, type: p.type || e.type, hash: p.hash || e.hash,
      prevHash: e.prevHash, ts: e.ts || '', actor: e.actor || '', detail: summary(e.data) });
    if (entries.length > MAX_ROWS) entries.splice(0, entries.length - MAX_ROWS);
    stale = true;
  }
  function onVerified(p) { verdict = p ? { ok: !!p.ok, brokenAt: p.brokenAt, algo: p.algo } : null; stale = false; }

  function el(tag, cls, text, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  /** Builds the static skeleton once: badge, head, buttons, list. */
  function ensure(host) {
    if (host.querySelector('#cv-audit-list')) return;
    host.textContent = '';
    var head = el('div', 'cv-panel-head', undefined, host);
    el('h2', 'cv-h', 'Tamper-Evident Audit Log', head);
    var b = el('span', 'cv-audit-badge', '', head); b.id = 'cv-audit-badge'; b.setAttribute('role', 'status');
    var hh = el('span', 'cv-audit-head', '', head); hh.id = 'cv-audit-head';
    var v = el('button', 'cv-btn', 'Verify chain', head); v.id = 'cv-verify'; v.type = 'button'; v.tabIndex = 0;
    var t = el('button', 'cv-btn cv-btn-danger', 'Tamper demo', head); t.id = 'cv-tamper'; t.type = 'button'; t.tabIndex = 0;
    var wrap = el('div', 'cv-table-wrap cv-audit-scroll', undefined, host);
    var list = el('div', 'cv-audit-list', undefined, wrap); list.id = 'cv-audit-list';
  }

  function render(host) {
    if (!host) return;
    ensure(host);
    var bd = badge(verdict, stale && !!verdict);
    var b = host.querySelector('#cv-audit-badge');
    b.textContent = bd.text;
    b.className = 'cv-audit-badge tone-' + bd.tone;
    var last = entries[entries.length - 1];
    host.querySelector('#cv-audit-head').textContent = last ? 'head ' + shortHash(last.hash) + ' • seq ' + last.seq : 'head —';
    var t = document.createElement('table');
    t.className = 'cv-table cv-audit-table';
    var hr = t.createTHead().insertRow();
    ['Seq', 'Time', 'Type', 'Actor', 'Hash', 'Prev', 'Data'].forEach(function (x) {
      var th = document.createElement('th'); th.scope = 'col'; th.textContent = x; hr.appendChild(th);
    });
    var tb = t.createTBody();
    for (var i = entries.length - 1; i >= 0; i--) {
      var e = entries[i], tr = tb.insertRow();
      tr.setAttribute('data-seq', String(e.seq));
      var broken = verdict && !verdict.ok && typeof verdict.brokenAt === 'number' && e.seq >= verdict.brokenAt;
      if (broken) tr.className = e.seq === verdict.brokenAt ? 'is-broken' : 'is-after-break';
      [String(e.seq), e.ts.slice(11, 19) || e.ts, e.type, e.actor, shortHash(e.hash), shortHash(e.prevHash), e.detail].forEach(function (v, k) {
        var td = tr.insertCell();
        td.textContent = v;
        if (k === 4 || k === 5) td.className = 'cv-mono';
        if (k === 6) { td.className = 'cv-mono cv-data'; td.title = v; }
      });
    }
    var list = host.querySelector('#cv-audit-list');
    list.textContent = '';
    if (!entries.length) el('p', 'cv-empty', 'No audit entries received yet.', list);
    else list.appendChild(t);
  }

  /** seq the Tamper demo targets: the newest non-BOOT/RESET entry, else the newest entry. */
  function tamperTarget() {
    for (var i = entries.length - 1; i >= 0; i--) if (entries[i].type !== 'RESET' && entries[i].type !== 'BOOT') return entries[i].seq;
    return entries.length ? entries[entries.length - 1].seq : null;
  }

  function init() {
    if (inited) return;
    inited = true;
    SA.bus.on('audit:appended', onAppended);
    SA.bus.on('audit:verified', onVerified);
  }

  SA.ui.caregiver.auditView = {
    init: init, render: render, shortHash: shortHash, badge: badge, tamperTarget: tamperTarget,
    isStale: function () { return stale; },
    entries: function () { return entries.slice(); },
    verdict: function () { return verdict ? { ok: verdict.ok, brokenAt: verdict.brokenAt, algo: verdict.algo } : null; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
