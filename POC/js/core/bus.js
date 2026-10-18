/*
 * SA.bus — synchronous event bus (CORE), docs/architecture.md §2.1.
 *   on(evt, fn) -> off(); once(evt, fn) -> off(); emit(evt, payload); clear()
 *   Emits made during a dispatch are queued FIFO and drained after the
 *   current dispatch. defer(fn) queues a function in the same FIFO (runs
 *   immediately if nothing is dispatching) — used by core/reset so a reset
 *   requested from inside a handler keeps the contract's event order.
 *   Handler exceptions are caught, console.error'd and counted (errorCount).
 *   log keeps the last 200 {evt, payload, ts}.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  var bus = SA.bus = SA.bus || {};

  var LOG_MAX = 200;
  var handlers = {};      // evt -> [{fn, once}]
  var queue = [];
  var dispatching = false;

  bus.errorCount = 0;
  bus.log = [];

  function nowTs() {
    try { if (SA.clock && typeof SA.clock.now === 'function') return SA.clock.now(); } catch (e) { /* ignore */ }
    return Date.now();
  }

  bus.on = function (evt, fn) {
    if (typeof fn !== 'function') throw new Error('bus.on: handler for ' + evt + ' is not a function');
    var rec = { fn: fn, once: false };
    (handlers[evt] = handlers[evt] || []).push(rec);
    return function off() {
      var list = handlers[evt];
      if (!list) return;
      var i = list.indexOf(rec);
      if (i >= 0) list.splice(i, 1);
    };
  };

  bus.once = function (evt, fn) {
    var off = bus.on(evt, function (p) { off(); fn(p); });
    return off;
  };

  function dispatch(evt, payload) {
    bus.log.push({ evt: evt, payload: payload, ts: nowTs() });
    if (bus.log.length > LOG_MAX) bus.log.splice(0, bus.log.length - LOG_MAX);
    var list = (handlers[evt] || []).slice();
    for (var i = 0; i < list.length; i++) {
      try {
        list[i].fn(payload);
      } catch (err) {
        bus.errorCount += 1;
        if (root.console && root.console.error) {
          root.console.error('[SA.bus] handler for "' + evt + '" threw:', err);
        }
      }
    }
  }

  function drain() {
    dispatching = true;
    try {
      while (queue.length) {
        var item = queue.shift();
        if (item.fn) {
          // Run the deferred fn as if at top level: its emits dispatch
          // synchronously (in order), then the remaining queue resumes.
          var rest = queue;
          queue = [];
          dispatching = false;
          try { item.fn(); } catch (err) {
            bus.errorCount += 1;
            if (root.console && root.console.error) root.console.error('[SA.bus] deferred fn threw:', err);
          }
          queue = rest.concat(queue);
          dispatching = true;
        } else {
          dispatch(item.evt, item.payload);
        }
      }
    } finally {
      dispatching = false;
    }
  }

  bus.emit = function (evt, payload) {
    if (payload === undefined) payload = {};
    queue.push({ evt: evt, payload: payload });
    if (!dispatching) drain();
  };

  bus.defer = function (fn) {
    queue.push({ fn: fn });
    if (!dispatching) drain();
  };

  bus.isDispatching = function () { return dispatching; };

  bus.listenerCount = function (evt) { return (handlers[evt] || []).length; };

  bus.clear = function () {
    handlers = {};
    queue = [];
    dispatching = false;
    bus.log = [];
    bus.errorCount = 0;
  };
})(typeof window !== 'undefined' ? window : globalThis);
