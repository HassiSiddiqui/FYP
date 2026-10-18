/*
 * SA.app (CORE) — boot sequence, docs/architecture.md §1.3.
 *   start(opts): 1 deep-freeze SA.config; 2 store.reset (+ reducedMotion
 *   from matchMedia); 3 init() each module that exists (try/catch, errors
 *   console.error'd and counted); 4 audit BOOT; 5 emit app:ready;
 *   6 ?selftest=1 -> SA.selftest.run().
 *   opts.headless (Node): restricted init list, no DOM, no selftest auto-run.
 * Mode defaults to Scripted (store initial state). Reset Demo: the harness
 * emits demo:resetRequested -> SA.core.resetRequested.
 * Auto-starts on DOMContentLoaded in a browser.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  var app = SA.app = SA.app || {};

  var BROWSER_INIT = [
    'safety.audit', 'kg.resolver', 'kg.mirror', 'errp.memory', 'errp.detector', 'eeg.decoder',
    'safety.rollback', 'safety.approvals', 'safety.episode', 'voice.speech', 'input.tokenbus',
    'input.keyboard', 'ui.render', 'ui.navigator', 'ui.harness', 'kg.view', 'brain.view', 'ui.caregiver'
  ];
  var HEADLESS_INIT = [
    'safety.audit', 'kg.resolver', 'kg.mirror', 'errp.memory', 'errp.detector', 'eeg.decoder',
    'safety.rollback', 'safety.approvals', 'safety.episode', 'input.tokenbus', 'ui.navigator'
  ];
  app.BROWSER_INIT = BROWSER_INIT;
  app.HEADLESS_INIT = HEADLESS_INIT;

  function lookup(path) {
    var parts = path.split('.'), cur = SA;
    for (var i = 0; i < parts.length; i++) {
      if (!cur) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  app.started = false;
  app.initErrors = [];
  app.initialized = [];
  app.missing = [];

  function captureGlobalErrors() {
    if (typeof root.addEventListener !== 'function') return;
    root.addEventListener('error', function (e) {
      SA.consoleErrors = (SA.consoleErrors || 0) + 1;
      (SA.consoleErrorLog = SA.consoleErrorLog || []).push('window.onerror: ' + (e && (e.message || (e.target && e.target.src))));
    }, true);
    root.addEventListener('unhandledrejection', function (e) {
      SA.consoleErrors = (SA.consoleErrors || 0) + 1;
      (SA.consoleErrorLog = SA.consoleErrorLog || []).push('unhandledrejection: ' + (e && e.reason && (e.reason.stack || e.reason)));
    });
  }

  function prefersReducedMotion() {
    try {
      return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }

  app.start = function (opts) {
    opts = opts || {};
    if (app.started) return app;
    app.started = true;
    app.headless = !!opts.headless;

    if (!app.headless) captureGlobalErrors();

    // 1. freeze config
    SA.util.deepFreeze(SA.config);

    // 2. store from initial state
    SA.store.reset();
    SA.clock.reset();
    if (!app.headless && prefersReducedMotion()) SA.store.set('prefs.reducedMotion', true, 'core');

    // Reset Demo wiring (core/reset has no init of its own)
    SA.bus.on('demo:resetRequested', function () { SA.core.resetRequested(); });

    // 3. module inits
    var list = app.headless ? HEADLESS_INIT : BROWSER_INIT;
    for (var i = 0; i < list.length; i++) {
      var mod = lookup(list[i]);
      if (!mod || typeof mod.init !== 'function') { app.missing.push(list[i]); continue; }
      try {
        mod.init();
        app.initialized.push(list[i]);
      } catch (err) {
        app.initErrors.push({ module: list[i], error: String(err && err.stack || err) });
        if (root.console && root.console.error) root.console.error('[SA.app] init failed: SA.' + list[i], err);
      }
    }

    // 4. BOOT audit entry
    try {
      if (SA.safety && SA.safety.audit && typeof SA.safety.audit.append === 'function') {
        var p = SA.safety.audit.append('BOOT', { version: SA.version, decoderMode: 'scripted' }, 'system');
        if (p && typeof p.then === 'function') {
          p.then(null, function (err) {
            if (root.console && root.console.error) root.console.error('[SA.app] BOOT audit failed', err);
          });
        }
      }
    } catch (err) {
      if (root.console && root.console.error) root.console.error('[SA.app] BOOT audit failed', err);
    }

    // 5. ready
    SA.bus.emit('app:ready', {});

    // 6. selftest
    if (!app.headless) {
      var search = '';
      try { search = (root.location && root.location.search) || ''; } catch (e) { search = ''; }
      if (/[?&]selftest=1\b/.test(search) && SA.selftest && typeof SA.selftest.run === 'function') {
        SA.selftest.run({});
      }
    }
    return app;
  };

  // Browser auto-start (registers a listener only; no DOM access at load).
  if (typeof root.addEventListener === 'function' && root.document) {
    var boot = function () { app.start({}); };
    if (root.document.readyState === 'loading') root.addEventListener('DOMContentLoaded', boot);
    else root.addEventListener('load', boot);
  }
})(typeof window !== 'undefined' ? window : globalThis);
