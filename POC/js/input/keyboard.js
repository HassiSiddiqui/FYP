/*
 * SA.input.keyboard (CORE) — README §2 key map, ADR 0005 D4 input hygiene.
 *   classify(e) -> {kind:'token', cls} | {kind:'dashboard'} | {kind:'native', reason} | null
 *     pure: e = {key, repeat, ctrlKey, altKey, metaKey, target}
 *   handle(e) -> the classification, after acting on it (preventDefault,
 *     tokenbus.emitToken(cls,'keyboard') or ui:dashboardToggleRequested)
 *   init(): capture-phase keydown on window (idempotent).
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.input = SA.input || {};
  var kb = SA.input.keyboard = SA.input.keyboard || {};

  var MAP = {
    ArrowRight: 'right', d: 'right', D: 'right',
    ArrowLeft: 'left', a: 'left', A: 'left',
    Enter: 'feet', ' ': 'feet', Spacebar: 'feet', s: 'feet', S: 'feet',
    Escape: 'tongue', Esc: 'tongue', Backspace: 'tongue', w: 'tongue', W: 'tongue'
  };
  var PREVENT = { ' ': 1, Spacebar: 1, ArrowRight: 1, ArrowLeft: 1, ArrowUp: 1, ArrowDown: 1, Enter: 1, Escape: 1, Esc: 1, Backspace: 1 };
  kb.MAP = MAP;

  function closest(target, sel) {
    if (!target || typeof target.closest !== 'function') return null;
    try { return target.closest(sel); } catch (e) { return null; }
  }

  function dashboardOpen() {
    try { return !!SA.store.get('ui.dashboardOpen'); } catch (e) { return false; }
  }

  kb.classify = function (e) {
    if (!e || typeof e.key !== 'string') return null;
    var key = e.key;
    var isToken = Object.prototype.hasOwnProperty.call(MAP, key);
    var isDash = key === 'c' || key === 'C';
    if (!isToken && !isDash) return null;
    if (e.ctrlKey || e.altKey || e.metaKey) return { kind: 'native', reason: 'modifier' };
    if (closest(e.target, 'input,select,textarea')) return { kind: 'native', reason: 'form-field' };
    if (e.repeat) return { kind: 'ignored', reason: 'repeat', prevent: !!PREVENT[key] };
    if (isDash) return { kind: 'dashboard' };
    if ((key === 'Enter' || key === ' ' || key === 'Spacebar') && dashboardOpen()) {
      var btn = closest(e.target, 'button');
      if (btn) return { kind: 'native', reason: 'dashboard-button' };
    }
    return { kind: 'token', cls: MAP[key], prevent: !!PREVENT[key] };
  };

  kb.handle = function (e) {
    var r = kb.classify(e);
    if (!r) return null;
    if ((r.kind === 'token' || r.kind === 'ignored') && r.prevent && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    if (r.kind === 'token') {
      r.emitted = SA.input.tokenbus.emitToken(r.cls, 'keyboard');
    } else if (r.kind === 'dashboard') {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      SA.bus.emit('ui:dashboardToggleRequested', {});
    }
    return r;
  };

  var attached = false;
  function onKeyDown(e) {
    try { kb.handle(e); } catch (err) {
      if (root.console && root.console.error) root.console.error('[SA.input.keyboard]', err);
    }
  }

  kb.init = function () {
    if (attached) return;
    if (typeof root.addEventListener !== 'function') return; // headless
    root.addEventListener('keydown', onKeyDown, true);
    attached = true;
  };
})(typeof window !== 'undefined' ? window : globalThis);
