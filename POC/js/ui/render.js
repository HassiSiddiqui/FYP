/* SilentAssist — SA.ui.render (owner: UI). Renders top bar, patient stage and CogLign panel from SA.store,
 * batched per animation frame on store:changed. Caches kg:resolved / policy:decided / voice:status bus payloads. */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.ui = SA.ui || {};

  var inited = false, scheduled = false, doc = null;
  var cache = { resolved: null, decided: null, voice: null, lastAlert: undefined, lastScreen: null, lastSub: null };

  var OK_ALERTS = ['Caregiver approved the request'];   // positive outcomes: not styled as a danger alert
  function $(id) { return doc && doc.getElementById(id); }
  function C() { return SA.ui.components; }

  function schedule() {
    if (scheduled || !doc) return;
    scheduled = true;
    var w = root;
    var run = function () { scheduled = false; try { renderNow(); } catch (e) { console.error('ui/render', e); } };
    if (typeof w.requestAnimationFrame === 'function') w.requestAnimationFrame(run);
    else run();
  }

  function renderNow() {
    if (!doc) return;
    var snap = SA.store.snapshot();
    var u = snap.ui, dec = snap.decoder || {}, prefs = snap.prefs || {};
    var html = doc.documentElement;
    html.setAttribute('data-reduced-motion', prefs.reducedMotion ? 'true' : 'false');
    var app = $('sa-app');
    if (app) {
      app.setAttribute('data-screen', u.screen);
      app.setAttribute('data-decoder-mode', dec.mode || 'scripted');
      app.setAttribute('data-dashboard', u.dashboardOpen ? 'open' : 'closed');
      app.setAttribute('data-substate', u.subState || 'list');
      app.classList.toggle('is-locked', !!u.lockout);
    }
    C().pills.render($('sa-topbar'), { decoder: dec, voice: cache.voice, voiceOn: !!prefs.voice || u.navMode === 'audio', dashboardOpen: u.dashboardOpen });

    var def = SA.ui.screens[u.screen] || SA.ui.screens.S1;
    var titleEl = $('sa-screen-title');
    if (titleEl && titleEl.textContent !== def.title) titleEl.textContent = def.title;

    // alert banner: written on change only (voice/speech also writes safety text here)
    if (u.alert !== cache.lastAlert) {
      cache.lastAlert = u.alert;
      var al = $('sa-alert');
      if (al) C().caption.render(al, { text: u.alert || '' });   // '' clears text + intended text, adds is-empty
      if (al) al.setAttribute('data-kind', OK_ALERTS.indexOf(u.alert) >= 0 ? 'ok' : 'danger');   // RT1-11
    }
    // RT1-02: emptiness follows the INTENDED text (caption.render blanks textContent for one frame on repeats)
    var alEl = $('sa-alert');
    if (alEl) alEl.classList.toggle('is-empty', !(typeof alEl.__saText === 'string' ? alEl.__saText : alEl.textContent));

    C().observation.renderBand($('sa-observation'), u.band || null);

    var items = def.items(snap);
    var focus = (u.focus && typeof u.focus[u.screen] === 'number') ? u.focus[u.screen] : 0;
    var lb = $('sa-listbox');
    C().listbox.render(lb, { screenId: u.screen, ariaLabel: def.ariaLabel, columns: def.columns, items: items, focus: focus });
    if (lb) lb.hidden = items.length === 0;
    var pos = $('sa-position');
    if (pos) {
      var t = items.length ? (Math.min(focus, items.length - 1) + 1) + ' of ' + items.length : '';
      if (pos.textContent !== t) pos.textContent = t;
    }
    C().observation.renderResult($('sa-result'), u.screen === 'S5' ? (u.result || null) : null);
    C().observation.renderDialog($('sa-dialog'), (u.subState === 'confirm' || u.subState === 'pending') ? (u.dialog || null) : null);

    // CogLign panel: last resolution + decision; Preview badge when the focus is not on the acted action
    var preview = !cache.decided || (u.screen === 'S4' && [0, 1].indexOf(focus) < 0);
    C().coglignPanel.render($('sa-coglign'), { resolved: cache.resolved, decided: cache.decided, sliders: dec.sliders,
      decoderLast: dec.last, preview: preview });

    if (cache.lastScreen !== u.screen || cache.lastSub !== u.subState) {
      cache.lastScreen = u.screen; cache.lastSub = u.subState;
      refocus();
    }
  }

  function refocus() {
    if (!doc) return;
    var u = SA.store.get('ui');
    if (u.dashboardOpen) return;
    var dl = $('sa-dialog-listbox');
    var target = (dl && !$('sa-dialog').hidden) ? dl : $('sa-listbox');
    var ae = doc.activeElement;
    if (ae && ae.closest && ae.closest('#sa-caregiver')) return;
    try { if (target && !target.hidden) target.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  function init() {
    if (inited || typeof document === 'undefined') return;
    inited = true;
    doc = document;
    var on = function (e, fn) { return SA.bus.on(e, fn); };
    on('store:changed', schedule);
    on('kg:resolved', function (p) { cache.resolved = p; schedule(); });
    on('policy:decided', function (p) { cache.decided = p; schedule(); });
    on('voice:status', function (p) { cache.voice = p; schedule(); });
    on('decoder:modeChanged', schedule);
    on('ui:dashboardToggled', function (p) { if (!p || !p.open) { cache.lastScreen = null; } schedule(); });
    on('demo:reset', function () { cache.resolved = null; cache.decided = null; cache.lastAlert = undefined; cache.lastScreen = null; schedule(); });
    var btn = $('btn-caregiver');
    if (btn) {
      btn.setAttribute('tabindex', '-1');
      btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
      btn.addEventListener('click', function () { SA.bus.emit('ui:dashboardToggleRequested', {}); });
    }
    var app = $('sa-app');
    if (app) app.setAttribute('data-ui', 'ready');
    renderNow();
  }

  SA.ui.render = { init: init, renderNow: renderNow, refocus: refocus, _cache: cache };
})(typeof window !== 'undefined' ? window : globalThis);
