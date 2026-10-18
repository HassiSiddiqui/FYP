/*
 * SA.clock — demo clock and the ONLY place setTimeout is used (CORE).
 * docs/architecture.md §2.1.
 *   now() -> demo ms (starts at initialState.context.clock on reset, then
 *            advances in real time x speed)
 *   after(ms, fn) -> handle (real delay ms / speed); cancel(h); cancelAll()
 *   speed (get/set, default 1; selftest uses 10); iso() -> 'YYYY-MM-DDTHH:MM:SS'
 *   reset() re-bases the demo clock (called by core/reset and app start)
 *   afterReal(ms, fn) -> handle: real-time timer NOT cancelled by cancelAll
 *            (selftest timeouts/sleeps only); cancelReal(h)
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  var clock = SA.clock = SA.clock || {};

  function st(fn, ms) { return root.setTimeout(fn, ms); }
  function ct(id) { return root.clearTimeout(id); }
  var speed = 1;
  var baseDemo = null;   // demo ms at baseReal
  var baseReal = 0;
  var timers = {};       // handle -> native id
  var realTimers = {};
  var nextHandle = 1;

  function realNow() {
    var p = root.performance;
    return (p && typeof p.now === 'function') ? p.now() : Date.now();
  }

  function startDemo() {
    var iso = SA.config && SA.config.initialState && SA.config.initialState.context && SA.config.initialState.context.clock;
    var t = iso ? Date.parse(iso) : NaN;
    return isNaN(t) ? Date.now() : t;
  }

  clock.now = function () {
    if (baseDemo === null) { baseDemo = startDemo(); baseReal = realNow(); }
    return Math.round(baseDemo + (realNow() - baseReal) * speed);
  };

  clock.reset = function () {
    baseDemo = startDemo();
    baseReal = realNow();
  };

  Object.defineProperty(clock, 'speed', {
    configurable: true, enumerable: true,
    get: function () { return speed; },
    set: function (v) {
      v = Number(v);
      if (!(v > 0)) throw new Error('clock.speed must be > 0');
      var n = clock.now();            // re-base so now() stays continuous
      baseDemo = n; baseReal = realNow();
      speed = v;
    }
  });

  clock.after = function (ms, fn) {
    var h = nextHandle++;
    var delay = Math.max(0, (Number(ms) || 0) / speed);
    timers[h] = st(function () {
      delete timers[h];
      try { fn(); } catch (err) {
        if (root.console && root.console.error) root.console.error('[SA.clock] timer callback threw:', err);
      }
    }, delay);
    return h;
  };

  clock.cancel = function (h) {
    if (timers[h] !== undefined) { ct(timers[h]); delete timers[h]; }
    if (realTimers[h] !== undefined) { ct(realTimers[h]); delete realTimers[h]; }
  };

  clock.cancelAll = function () {
    for (var h in timers) if (Object.prototype.hasOwnProperty.call(timers, h)) ct(timers[h]);
    timers = {};
  };

  clock.pending = function () { return Object.keys(timers).length; };

  clock.afterReal = function (ms, fn) {
    var h = nextHandle++;
    realTimers[h] = st(function () { delete realTimers[h]; fn(); }, Math.max(0, Number(ms) || 0));
    return h;
  };
  clock.cancelReal = clock.cancel;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  clock.iso = function () {
    var d = new Date(clock.now());
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  };
})(typeof window !== 'undefined' ? window : globalThis);
