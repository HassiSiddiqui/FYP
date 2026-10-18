/* SA.safety.approvals — High-tier caregiver approval queue (docs/architecture.md §2.5; ADR 0005 D14; ADR 0002 D16).
 * request(episodeId, action, reasonText, extra) -> approvalId; adds to store.approvals, emits approval:requested,
 *   audits APPROVAL_REQUESTED, expires after SA.config.safety.approvalTimeoutMs (never auto-approved).
 * caregiver:approve / caregiver:reject {approvalId} and ui:requestWithdrawn {approvalId} resolve it and emit
 *   approval:resolved {approvalId, episodeId, outcome, actor}; demo:resetting cancels pending real requests.
 * The seeded example ap-seed-1 runs the REAL path on approval: plan + execute + log-only ErrP + audit (seeded:true).
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.safety = SA.safety || {};

  var OWNER = 'approvals';
  var timers = {};
  var counter = 0;
  var inited = false;

  function list() { var a = SA.store.get('approvals'); return Array.isArray(a) ? a : []; }
  function save(a) { SA.store.set('approvals', a, OWNER); }
  function find(id) { var a = list(); for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
  function emit(e, p) { if (SA.bus && SA.bus.emit) SA.bus.emit(e, p); }
  function audit(type, data, actor) { if (SA.safety.audit) SA.safety.audit.append(type, data, actor); }
  function timeoutMs() { return (SA.config && SA.config.safety && SA.config.safety.approvalTimeoutMs) || 300000; }

  function request(episodeId, action, reasonText, extra) {
    extra = extra || {};
    var id = 'ap-' + (++counter);
    var item = { id: id, seeded: false, episodeId: episodeId || null, status: 'pending', action: action,
      intentLabel: extra.intentLabel || null, n: extra.n != null ? extra.n : null, s: extra.s != null ? extra.s : null,
      reason: reasonText || '', label: extra.label || null, requestedAt: SA.clock ? SA.clock.now() : Date.now() };
    var a = list(); a.push(item); save(a);
    if (SA.clock && SA.clock.after) {
      timers[id] = SA.clock.after(timeoutMs(), function () { delete timers[id]; resolve(id, 'expired', 'system'); });
    }
    audit('APPROVAL_REQUESTED', { approvalId: id, episodeId: episodeId, action: action, reason: reasonText }, 'system');
    emit('approval:requested', { approvalId: id, episodeId: episodeId, action: action, reason: reasonText, seeded: false });
    return id;
  }

  var AUDIT_TYPE = { approved: 'APPROVED', rejected: 'REJECTED', withdrawn: 'WITHDRAWN', expired: 'EXPIRED',
    cancelled: 'APPROVAL_CANCELLED' };

  function resolve(id, outcome, actor) {
    var item = find(id);
    if (!item || item.status !== 'pending') return false;
    if (timers[id] && SA.clock && SA.clock.cancel) { SA.clock.cancel(timers[id]); delete timers[id]; }
    var a = list().map(function (x) {
      if (x.id === id) { x.status = outcome; x.resolvedAt = SA.clock ? SA.clock.now() : Date.now(); x.resolvedBy = actor; }
      return x;
    });
    save(a);
    audit(AUDIT_TYPE[outcome] || 'APPROVED', { approvalId: id, episodeId: item.episodeId, action: item.action,
      seeded: !!item.seeded, outcome: outcome }, actor);
    if (item.seeded && outcome === 'approved') runSeeded(item);
    emit('approval:resolved', { approvalId: id, episodeId: item.episodeId, outcome: outcome, actor: actor,
      seeded: !!item.seeded });
    return true;
  }

  // Seeded example: the real execution path (no episode), then log-only ErrP (ADR 0002 D16).
  function runSeeded(item) {
    try {
      var steps = SA.safety.rollback.plan(item.action, SA.store.get('devices'));
      var sagaId = steps.length ? SA.safety.rollback.execute(null, steps, 'caregiver') : null;
      var res = null;
      if (SA.errp && SA.errp.detector && SA.errp.synth) {
        var ep = SA.errp.synth.epoch('correct');
        res = SA.errp.detector.observe(ep, { episodeId: null, costClass: 'setting-medium', tier: 'High',
          pi: SA.config.errp ? SA.config.errp.canonicalPi : 0.181, approvedHigh: true, mode: 'auto',
          target: { entityId: item.action.id, command: item.action.command, room: SA.store.get('context.activeRoom') } });
      }
      audit('ERRP_OBS', { approvalId: item.id, seeded: true, sagaId: sagaId, q: res && res.q, pi: res && res.pi,
        epochId: res && res.epochId, decision: res ? res.decision : 'log', fczMinUv: res && res.fczMinUv,
        note: 'approved High-tier action: log-only, never auto-rolled back' }, 'system');
    } catch (e) {
      if (typeof console !== 'undefined') console.error('approvals: seeded execution failed', e);
    }
  }

  function pending() { return list().filter(function (x) { return x.status === 'pending'; }); }

  function init() {
    if (inited) return;
    inited = true;
    if (!SA.bus || !SA.bus.on) return;
    SA.bus.on('caregiver:approve', function (p) { if (p) resolve(p.approvalId, 'approved', 'caregiver'); });
    SA.bus.on('caregiver:reject', function (p) { if (p) resolve(p.approvalId, 'rejected', 'caregiver'); });
    SA.bus.on('ui:requestWithdrawn', function (p) {
      if (!p) return;
      var id = p.approvalId;
      if (!id && p.episodeId) list().forEach(function (x) { if (x.episodeId === p.episodeId && x.status === 'pending') id = x.id; });
      if (id) resolve(id, 'withdrawn', 'patient');
    });
    SA.bus.on('demo:resetting', function () {
      list().forEach(function (x) { if (x.status === 'pending' && !x.seeded) resolve(x.id, 'cancelled', 'system'); });
      Object.keys(timers).forEach(function (k) { if (SA.clock && SA.clock.cancel) SA.clock.cancel(timers[k]); });
      timers = {};
    });
    SA.bus.on('demo:reset', function () { counter = 0; timers = {}; });
  }

  SA.safety.approvals = { init: init, request: request, resolve: resolve, pending: pending, list: list };
})(typeof window !== 'undefined' ? window : globalThis);
