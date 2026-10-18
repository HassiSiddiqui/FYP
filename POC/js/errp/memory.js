/* SA.errp.memory — persistent ErrP penalty, ranking-only (ADR 0002 D18; docs/architecture.md §2.3).
 *   M(d) = max(floor, min(1, Π_k Λ_k^(−γ · 2^(−n_k / halfLife))))
 *   Records: only observations with decision 'rollback'|'flag' and Λ > 1 (no boosts), scoped (room, command, entity).
 *   n_k = resolver decisions in the same (room, command) context since observation k (interactions, not minutes).
 *   Disconfirmation: a later 'keep' on the same (room, command, entity) deletes its records.
 *   M never touches the policy's s; its only policy effect is the h-flag (M < penalty.hFlag -> CONFIRM).
 * Store slice store.errp.memory (owner 'errp-memory'). Reset clears it.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.errp = SA.errp || {};

  var OWNER = 'errp-memory';
  var inited = false;

  function pen() {
    var p = (SA.config && SA.config.errp && SA.config.errp.penalty) || {};
    return { gamma: p.gamma != null ? p.gamma : 0.5, floor: p.floor != null ? p.floor : 0.5,
      halfLife: p.halfLife || 20, hFlag: p.hFlag != null ? p.hFlag : 0.9 };
  }
  function records() { var r = SA.store && SA.store.get('errp.memory'); return Array.isArray(r) ? r : []; }
  function save(list) { SA.store.set('errp.memory', list, OWNER); }
  function same(a, b) { return String(a || '') === String(b || ''); }

  function factor(entityId, command, room) {
    var p = pen(), logM = 0, any = false;
    records().forEach(function (r) {
      if (!same(r.entityId, entityId) || !same(r.command, command) || !same(r.room, room)) return;
      if (!(r.lambda > 1)) return;
      any = true;
      logM += -p.gamma * Math.pow(2, -r.n / p.halfLife) * Math.log(r.lambda);
    });
    if (!any) return 1;
    return Math.max(p.floor, Math.min(1, Math.exp(logM)));
  }
  function hFlag(entityId, command, room) { return factor(entityId, command, room) < pen().hFlag; }

  function noteDecision(room, command) {
    var list = records(), touched = false;
    list.forEach(function (r) { if (same(r.room, room) && same(r.command, command)) { r.n += 1; touched = true; } });
    if (touched) save(list);
  }

  function targetOf(res) {
    if (res && res.target && res.target.entityId) return res.target;
    var ep = SA.store && SA.store.get('episode');
    if (ep && ep.action && ep.action.id) {
      return { entityId: ep.action.id, command: ep.action.command, room: SA.store.get('context.activeRoom') };
    }
    return null;
  }

  function onObserved(res) {
    if (!res || res.q === null || res.q === undefined) return;
    var tg = targetOf(res);
    if (!tg) return;
    var list = records();
    if ((res.decision === 'rollback' || res.decision === 'flag') && res.lambda > 1) {
      list.push({ entityId: tg.entityId, command: tg.command, room: tg.room, user: 'Patient',
        q: res.q, lambda: res.lambda, pi: res.pi, n: 0, epochId: res.epochId, episodeId: res.episodeId,
        decision: res.decision });
      save(list);
    } else if (res.decision === 'keep') {
      var kept = list.filter(function (r) {
        return !(same(r.entityId, tg.entityId) && same(r.command, tg.command) && same(r.room, tg.room));
      });
      if (kept.length !== list.length) save(kept);
    }
  }

  function clear() { if (SA.store) save([]); }

  function register() {
    var R = SA.kg && SA.kg.resolver;
    if (R && typeof R.registerModifier === 'function') {
      R.registerModifier('errpMemory', factor);
      return true;
    }
    return false;
  }

  function init() {
    if (inited) return;
    inited = true;
    register();
    if (SA.bus && SA.bus.on) {
      SA.bus.on('errp:observed', onObserved);
      SA.bus.on('demo:reset', function () { if (records().length) clear(); register(); });
    }
  }

  SA.errp.memory = { init: init, factor: factor, hFlag: hFlag, noteDecision: noteDecision, clear: clear,
    records: records, register: register };
})(typeof window !== 'undefined' ? window : globalThis);
