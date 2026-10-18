/* SA.ui.caregiver — Caregiver Supervision Dashboard (README §3; ADR 0005 D28; architecture §2.7, §6.2).
 * Renders #sa-caregiver when store.ui.dashboardOpen (toggled by ui/navigator → ui:dashboardToggled).
 * Sub-renderers: SA.ui.caregiver.{queue, gauges, shadowTable, auditView} (loaded after this file; read lazily).
 * Emits ONLY caregiver:approve, caregiver:reject, audit:verifyRequested, audit:tamperRequested.
 * UI-side isolation: talks to the rest only via SA.bus / SA.store. No DOM access at load time. */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.ui = SA.ui || {};
  SA.ui.caregiver = SA.ui.caregiver || {};
  var CG = SA.ui.caregiver;

  var inited = false;
  var open = false;
  var host = null;
  var focusItem = null;       // last ui:focusChanged itemId (patient strip)
  var verifyPending = false;
  var tickH = null;
  var rafPending = false;

  function storeGet(path, dflt) { try { var v = SA.store.get(path); return v === undefined ? dflt : v; } catch (e) { return dflt; } }
  function str(key, dflt) { var s = SA.config && SA.config.ui && SA.config.ui.strings; return (s && s[key]) || dflt; }

  function state() {
    return { approvals: storeGet('approvals', []), devices: storeGet('devices', {}), telemetry: storeGet('telemetry', {}),
      errp: storeGet('errp', {}), decoder: storeGet('decoder', {}), ui: storeGet('ui', {}) };
  }

  /** Patient-view strip text (pure given state). */
  function patientText(s, item) {
    var ui = s.ui || {}, dec = s.decoder || {};
    var pending = (s.approvals || []).filter(function (a) { return a && a.status === 'pending'; });
    pending = pending.filter(function (a) { return !a.seeded; }).concat(pending.filter(function (a) { return !!a.seeded; }));   // RT1-06
    var mode = dec.mode ? dec.mode.charAt(0).toUpperCase() + dec.mode.slice(1) : '—';
    var focus = item || (ui.focus && ui.screen && ui.focus[ui.screen] !== undefined ? 'item ' + (ui.focus[ui.screen] + 1) : '—');
    return 'Patient view: screen ' + (ui.screen || '—') + ' • focus ' + focus + ' • decoder ' + mode +
      ' • ' + (pending.length ? 'pending: ' + (pending[0].intentLabel || pending[0].id) + (pending.length > 1 ? ' (+' + (pending.length - 1) + ')' : '') : 'no pending request');
  }

  function el(tag, id, cls, parent, text) {
    var e = document.createElement(tag);
    if (id) e.id = id;
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  function build() {
    host.textContent = '';
    el('div', 'cv-banner', 'cv-banner', host, str('caregiverBanner', 'Caregiver view — simulated, no authentication'));
    var top = el('div', null, 'cv-titlebar', host);
    el('h1', null, 'cv-title', top, 'Caregiver Supervision Dashboard');
    el('span', null, 'cv-hint', top, 'Press C to return to the patient view • patient tokens are ignored while open');
    el('div', 'cv-patient', 'cv-patient', host);
    var grid = el('div', null, 'cv-grid', host);
    el('section', 'cv-queue', 'cv-tile cv-span-7', grid).setAttribute('aria-label', 'High-Risk Action Approval Queue');
    el('section', 'cv-gauges', 'cv-tile cv-span-5', grid).setAttribute('aria-label', 'Telemetry gauges');
    el('section', 'cv-shadow', 'cv-tile cv-span-6', grid).setAttribute('aria-label', 'Appliance shadow table');
    el('section', 'cv-brain', 'cv-tile cv-span-6', grid).setAttribute('aria-label', 'Live brain graph');
    el('section', 'cv-audit', 'cv-tile cv-span-12', grid).setAttribute('aria-label', 'Audit log');
  }

  function call(sub, fn, a, b) {
    try { if (CG[sub] && CG[sub][fn]) CG[sub][fn](a, b); } catch (e) { console.error('caregiver ' + sub + '.' + fn, e); }
  }

  function renderNow() {
    rafPending = false;
    if (!host || !open) return;
    if (!host.querySelector('#cv-queue')) build();
    var s = state();
    host.querySelector('#cv-patient').textContent = patientText(s, focusItem);
    call('queue', 'render', host.querySelector('#cv-queue'), s);
    call('gauges', 'render', host.querySelector('#cv-gauges'), s);
    call('shadowTable', 'render', host.querySelector('#cv-shadow'), s);
    call('auditView', 'render', host.querySelector('#cv-audit'));
    // #cv-brain is filled by SA.brain.view (it listens to ui:dashboardToggled itself).
  }

  function render() {
    if (!host || !open) return;
    // Microtask batching: many store:changed events in one synchronous burst → one render.
    if (rafPending) return;
    rafPending = true;
    Promise.resolve().then(renderNow);
  }

  function requestVerify() {
    if (verifyPending) return;
    verifyPending = true;
    SA.bus.emit('audit:verifyRequested', {});
  }

  function tick() {
    tickH = null;
    if (!open) return;
    var q = host && host.querySelector('#cv-queue');
    if (q) call('queue', 'render', q, state());
    if (SA.clock && SA.clock.after) tickH = SA.clock.after(1000, tick);
  }

  function setOpen(v) {
    open = !!v;
    if (host) host.hidden = !open;
    if (open) {
      renderNow();
      requestVerify();
      // RT1-10: start keyboard focus on the first live (non-seeded) Approve, else the first Approve
      var first = host && host.querySelector('#cv-queue .cv-approve');
      if (first && first.focus) first.focus();
      if (!tickH && SA.clock && SA.clock.after) tickH = SA.clock.after(1000, tick);
    } else if (tickH && SA.clock && SA.clock.cancel) { SA.clock.cancel(tickH); tickH = null; }
  }

  function onClick(ev) {
    var b = ev.target && ev.target.closest ? ev.target.closest('button') : null;
    if (!b || !host.contains(b) || b.disabled) return;
    var id = b.getAttribute('data-approval-id');
    if (b.classList.contains('cv-approve') && id) { b.disabled = true; SA.bus.emit('caregiver:approve', { approvalId: id }); }
    else if (b.classList.contains('cv-reject') && id) { b.disabled = true; SA.bus.emit('caregiver:reject', { approvalId: id }); }
    else if (b.id === 'cv-verify') { verifyPending = false; requestVerify(); }
    else if (b.id === 'cv-tamper') {
      var seq = CG.auditView ? CG.auditView.tamperTarget() : null;
      if (seq !== null && seq !== undefined) SA.bus.emit('audit:tamperRequested', { seq: seq });
    }
  }

  function init() {
    if (inited) return;
    inited = true;
    call('shadowTable', 'init');
    call('auditView', 'init');
    var bus = SA.bus;
    bus.on('ui:dashboardToggled', function (p) { setOpen(p && p.open); });
    bus.on('store:changed', function () {
      var o = !!storeGet('ui.dashboardOpen', false);   // covers reset() writes whatever path they report
      if (o !== open) { setOpen(o); return; }
      render();
    });
    bus.on('ui:focusChanged', function (p) { focusItem = p && p.itemId ? p.itemId : null; render(); });
    bus.on('audit:appended', function () { render(); if (open) requestVerify(); });
    bus.on('audit:verified', function () { verifyPending = false; render(); });
    bus.on('approval:requested', render);
    bus.on('approval:resolved', render);
    bus.on('demo:reset', function () {
      tickH = null; verifyPending = false; focusItem = null;
      call('queue', 'reset');
      if (open) setOpen(true);
    });
    if (typeof document === 'undefined') return;
    host = document.getElementById('sa-caregiver');
    if (!host) return;
    build();
    host.addEventListener('click', onClick);
    host.addEventListener('mousedown', function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest('button')) ev.preventDefault();
    });
    setOpen(!!storeGet('ui.dashboardOpen', false));
  }

  CG.init = init;
  CG.render = renderNow;
  CG.isOpen = function () { return open; };
  CG.patientText = patientText;
})(typeof window !== 'undefined' ? window : globalThis);
