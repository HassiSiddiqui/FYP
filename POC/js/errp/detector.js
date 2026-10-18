/* SA.errp.detector — ADR 0002 D13/D14/D16/D19/D24; docs/architecture.md §2.3.
 * threshold(costClass, tier) -> t* = fp/(fp+fn-tp) from SA.config.errp.costs (Infinity = flag-only/missing/t*>=1)
 * observe(epoch, ctx) -> result; ctx = {episodeId, costClass, tier, pi, approvedHigh, mode, target?}
 *   flag-only class (t* = Infinity): q > max(flagOnlyThreshold, pi) -> 'flag' (RT1-03, ADR 0002 D15).
 *   approvedHigh -> 'log'; else q > max(t*, pi) -> 'rollback' (finite t* and mode 'auto') or 'flag'; else 'keep'.
 * The decision is always COMPUTED from the epoch; there is no scripted posterior anywhere (D19).
 * Emits errp:observed (payload = result). Otherwise pure.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.errp = SA.errp || {};

  var last = null;

  function cfg() { return (SA.config && SA.config.errp) || {}; }

  function threshold(costClass, tier) {
    var costs = cfg().costs || {}, c = costs[costClass];
    if (!c) return Infinity;
    var fp = c.fp, fn = c.fn, tp = c.tp;
    if (c.override && typeof c.override.fp === 'number') fp = c.override.fp;
    var t = fp / (fp + fn - tp);
    return (isFinite(t) && t > 0 && t < 1) ? t : Infinity;
  }

  // Flag-only classes (t* = Infinity) never roll back; they flag when q > max(flagOnlyThreshold, π) (default 0.5 = MAP).
  function flagOnlyT() { var t = cfg().flagOnlyThreshold; return (typeof t === 'number' && t > 0 && t < 1) ? t : 0.5; }

  function priorOf(ctx) {
    var c = cfg(), floor = typeof c.piFloor === 'number' ? c.piFloor : 0.02;
    var pi = (ctx && typeof ctx.pi === 'number' && isFinite(ctx.pi)) ? ctx.pi : (c.canonicalPi || 0.181);
    return Math.min(0.999, Math.max(floor, pi));
  }

  function observe(epoch, ctx) {
    ctx = ctx || {};
    var model = SA.data && SA.data.errpModel;
    var pi = priorOf(ctx), tStar = threshold(ctx.costClass, ctx.tier);
    var res = { episodeId: ctx.episodeId || null, epochId: epoch ? epoch.id : null,
      source: epoch ? (epoch.source || 'synthetic') : null, label: epoch ? (epoch.label || null) : null,
      costClass: ctx.costClass || null, tier: ctx.tier || null, target: ctx.target || null,
      score: null, qTr: null, q: null, lambda: null, tStar: tStar, pi: pi, decision: 'log', fczMinUv: null,
      modelStub: !!(model && (model.stub || (model.run && model.run.stub))), preliminary: true,
      mode: ctx.mode || cfg().mode || 'auto', ts: SA.clock && SA.clock.now ? SA.clock.now() : Date.now() };
    if (!model || !epoch) {
      res.error = !model ? 'errp-model-missing' : 'epoch-missing';
      emit(res);
      return res;
    }
    var f = SA.errp.features.extract(epoch, model);
    var C = SA.errp.classifier;
    res.score = C.score(f.x, model);
    res.qTr = C.platt(res.score, model);
    res.lambda = C.lr(res.qTr, model.piTrain);
    res.q = C.priorShift(res.qTr, model.piTrain, pi);
    res.fczMinUv = f.fczMinUv;
    if (ctx.approvedHigh) res.decision = 'log';
    else if (res.q > Math.max(tStar, pi)) res.decision = (isFinite(tStar) && res.mode === 'auto') ? 'rollback' : 'flag';
    else if (!isFinite(tStar) && res.q > Math.max(flagOnlyT(), pi)) res.decision = 'flag';   // RT1-03: ADR 0002 D14/D15 flag-only classes
    else res.decision = 'keep';
    emit(res);
    return res;
  }

  function emit(res) {
    last = res;
    if (SA.bus && SA.bus.emit) SA.bus.emit('errp:observed', res);
  }

  function init() { /* stateless apart from `last`; nothing to subscribe */ }

  SA.errp.detector = { init: init, threshold: threshold, observe: observe, prior: priorOf,
    last: function () { return last; } };
})(typeof window !== 'undefined' ? window : globalThis);
