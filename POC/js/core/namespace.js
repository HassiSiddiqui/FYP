/*
 * SA namespace root (CORE) — docs/architecture.md §2.1.
 *   SA.version, SA.util {deepClone, deepFreeze, deepEqual, round, uid, resetUids}
 *   SA.consoleErrors / SA.consoleErrorLog: console.error is wrapped at load so
 *   the selftest can assert "zero console errors since boot".
 * No DOM access at load time.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.version = SA.version || '0.1.0-mideval';
  SA.util = SA.util || {};
  SA.core = SA.core || {};

  /* ---------- console.error capture ---------- */
  if (typeof SA.consoleErrors !== 'number') SA.consoleErrors = 0;
  SA.consoleErrorLog = SA.consoleErrorLog || [];
  (function wrapConsole() {
    var c = root.console;
    if (!c || typeof c.error !== 'function' || c.error.__saWrapped) return;
    var orig = c.error;
    var wrapped = function () {
      SA.consoleErrors += 1;
      try {
        var parts = [];
        for (var i = 0; i < arguments.length; i++) {
          var a = arguments[i];
          parts.push(a && a.stack ? String(a.stack) : String(a));
        }
        SA.consoleErrorLog.push(parts.join(' ').slice(0, 500));
        if (SA.consoleErrorLog.length > 50) SA.consoleErrorLog.shift();
      } catch (e) { /* ignore */ }
      return orig.apply(c, arguments);
    };
    wrapped.__saWrapped = true;
    try { c.error = wrapped; } catch (e) { /* read-only console: skip */ }
  })();

  /* ---------- util ---------- */
  function isTyped(o) {
    return typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(o) && !(o instanceof DataView);
  }

  function deepClone(o) {
    if (o === null || typeof o !== 'object') return o;
    if (isTyped(o)) return o.slice();
    if (o instanceof Date) return new Date(o.getTime());
    if (Array.isArray(o)) {
      var a = new Array(o.length);
      for (var i = 0; i < o.length; i++) a[i] = deepClone(o[i]);
      return a;
    }
    var r = {};
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = deepClone(o[k]);
    return r;
  }

  function deepFreeze(o) {
    if (o === null || typeof o !== 'object' || isTyped(o) || Object.isFrozen(o)) return o;
    Object.freeze(o);
    var keys = Object.getOwnPropertyNames(o);
    for (var i = 0; i < keys.length; i++) {
      var v = o[keys[i]];
      if (v && typeof v === 'object') deepFreeze(v);
    }
    return o;
  }

  function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a === 'number' && typeof b === 'number') return a !== a && b !== b; // NaN
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
    var aArr = Array.isArray(a) || isTyped(a), bArr = Array.isArray(b) || isTyped(b);
    if (aArr !== bArr) return false;
    if (aArr) {
      if (a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
      return true;
    }
    var ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (var j = 0; j < ka.length; j++) {
      if (!Object.prototype.hasOwnProperty.call(b, ka[j])) return false;
      if (!deepEqual(a[ka[j]], b[ka[j]])) return false;
    }
    return true;
  }

  function round(x, dp) {
    var p = Math.pow(10, dp || 0);
    var s = x < 0 ? -1 : 1;
    return Math.round((x + Number.EPSILON * s) * p) / p;
  }

  var uidCounters = {};
  function uid(prefix) {
    prefix = prefix || 'id';
    uidCounters[prefix] = (uidCounters[prefix] || 0) + 1;
    return prefix + '-' + uidCounters[prefix];
  }
  function resetUids() { uidCounters = {}; }

  SA.util.deepClone = deepClone;
  SA.util.deepFreeze = deepFreeze;
  SA.util.deepEqual = deepEqual;
  SA.util.round = round;
  SA.util.uid = uid;
  SA.util.resetUids = resetUids;
})(typeof window !== 'undefined' ? window : globalThis);
