/*
 * SA.core.reset (CORE) — ADR 0004 D36 as ruled by docs/architecture.md §2.1:
 *   1. SA.clock.cancelAll()
 *   2. bus.emit('demo:resetting')  (approvals cancel, episode aborts)
 *   3. SA.store.reset()            (keeps prefs.reducedMotion)
 *   4. bus.emit('demo:reset', {resetSeq})
 *   5. SA.safety.audit.append('RESET', {prevHead}, 'operator')
 * Returns the audit append promise (or a resolved promise if audit absent).
 * SA.core.resetRequested() — the demo:resetRequested handler; if invoked
 * during a bus dispatch it is deferred via SA.bus.defer so the step order
 * above is preserved (nested emits would otherwise be queued behind it).
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.core = SA.core || {};

  var resetSeq = 0;

  function resolved(v) {
    return (typeof Promise !== 'undefined') ? Promise.resolve(v) : { then: function (f) { f(v); } };
  }

  function reset() {
    resetSeq += 1;
    if (SA.clock && SA.clock.cancelAll) SA.clock.cancelAll();

    var prevHead = null;
    try {
      if (SA.safety && SA.safety.audit && typeof SA.safety.audit.head === 'function') prevHead = SA.safety.audit.head();
    } catch (e) { prevHead = null; }

    SA.bus.emit('demo:resetting', {});
    SA.store.reset();
    if (SA.clock && SA.clock.reset) SA.clock.reset();
    if (SA.util && SA.util.resetUids) SA.util.resetUids();
    SA.bus.emit('demo:reset', { resetSeq: resetSeq });

    var p = null;
    try {
      if (SA.safety && SA.safety.audit && typeof SA.safety.audit.append === 'function') {
        p = SA.safety.audit.append('RESET', { prevHead: prevHead, resetSeq: resetSeq }, 'operator');
      }
    } catch (err) {
      if (root.console && root.console.error) root.console.error('[SA.core.reset] audit append failed:', err);
    }
    return p && typeof p.then === 'function' ? p : resolved(null);
  }

  SA.core.reset = reset;
  SA.core.resetSeq = function () { return resetSeq; };

  SA.core.resetRequested = function () {
    if (SA.bus.isDispatching && SA.bus.isDispatching()) {
      SA.bus.defer(function () { reset(); });
    } else {
      reset();
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
