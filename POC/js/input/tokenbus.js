/*
 * SA.input.tokenbus (CORE) — docs/architecture.md §2.1, ADR 0005 D4.
 *   emitToken(cls, source) -> true if emitted
 *     validates cls, debounces (SA.config.input.minInterTokenMs, real time;
 *     source 'auto' — selftest/automation — is not debounced), drops tokens
 *     while store.ui.dashboardOpen (input:dropped {cls, reason}), emits
 *     input:token {cls, token, source, ts}.
 *   init(): listens to input:operatorToken {cls} (harness buttons),
 *     harness:set for context.* and prefs.* keys (store owner tag 'harness'),
 *     demo:reset (clears debounce).
 * UI-side module: talks only through SA.bus / SA.store.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.input = SA.input || {};
  var tb = SA.input.tokenbus = SA.input.tokenbus || {};

  var TOKEN_OF = { left: 'PREV', right: 'NEXT', feet: 'SELECT', tongue: 'BACK' };
  var SOURCES = { keyboard: 1, operator: 1, auto: 1 };
  var HARNESS_KEYS = ['context.activeRoom', 'prefs.voice', 'prefs.decodeAnimation', 'prefs.errpAutoConfirm', 'prefs.reducedMotion'];

  var lastAccepted = -Infinity;
  var offs = [];

  function realNow() {
    var p = root.performance;
    return (p && typeof p.now === 'function') ? p.now() : Date.now();
  }

  function minGap() {
    return (SA.config && SA.config.input && SA.config.input.minInterTokenMs) || 250;
  }

  tb.TOKEN_OF = TOKEN_OF;

  tb.emitToken = function (cls, source) {
    source = source || 'keyboard';
    if (!Object.prototype.hasOwnProperty.call(TOKEN_OF, cls)) {
      SA.bus.emit('input:dropped', { cls: cls, reason: 'invalid' });
      return false;
    }
    if (!SOURCES[source]) source = 'operator';
    if (SA.store.get('ui.dashboardOpen')) {
      SA.bus.emit('input:dropped', { cls: cls, reason: 'dashboard' });
      return false;
    }
    var t = realNow();
    if (source !== 'auto' && t - lastAccepted < minGap()) {
      SA.bus.emit('input:dropped', { cls: cls, reason: 'debounce' });
      return false;
    }
    if (source !== 'auto') lastAccepted = t;
    SA.bus.emit('input:token', { cls: cls, token: TOKEN_OF[cls], source: source, ts: SA.clock.now() });
    return true;
  };

  tb.resetDebounce = function () { lastAccepted = -Infinity; };

  function applyReducedMotion(v) {
    var doc = root.document;
    if (doc && doc.documentElement && doc.documentElement.setAttribute) {
      doc.documentElement.setAttribute('data-reduced-motion', v ? 'true' : 'false');
    }
  }

  function onHarnessSet(p) {
    if (!p || HARNESS_KEYS.indexOf(p.key) < 0) return; // decoder.* belongs to eeg/decoder
    if (p.key === 'context.activeRoom') {
      var prev = SA.store.get('context.activeRoom');
      if (prev === p.value) return;
      SA.store.set('context.activeRoom', p.value, 'harness');
      SA.bus.emit('context:roomChanged', { room: p.value, prev: prev, source: 'operator' });
      SA.bus.emit('audit:request', { type: 'ROOM', data: { room: p.value, prev: prev }, actor: 'operator' });
      return;
    }
    var v = !!p.value;
    SA.store.set(p.key, v, 'harness');
    if (p.key === 'prefs.reducedMotion') applyReducedMotion(v);
  }

  tb.init = function () {
    if (offs.length) return; // idempotent
    offs.push(SA.bus.on('input:operatorToken', function (p) {
      if (p && p.cls) tb.emitToken(p.cls, 'operator');
    }));
    offs.push(SA.bus.on('harness:set', onHarnessSet));
    offs.push(SA.bus.on('demo:reset', function () {
      tb.resetDebounce();
      applyReducedMotion(!!SA.store.get('prefs.reducedMotion'));
    }));
    applyReducedMotion(!!SA.store.get('prefs.reducedMotion'));
  };
})(typeof window !== 'undefined' ? window : globalThis);
