/* SA.safety.episode — per-action state machine (docs/architecture.md §2.5 flow 1-6; ADR 0002 D11/D13-D19;
 * ADR 0005 D8-D14).
 * ui:actionRequested -> resolving -> deciding (KG resolve, risk, policy) -> idle (REJECT) | confirm | pendingCaregiver
 *   | (dwell) -> observing -> outcome. Lockout: while an episode is in any non-idle phase other than 'outcome', new
 *   action requests are ignored (ADR 0005 D11); the observing phase lasts until the detector's result.
 * errp:inject {kind} while observing -> epoch (Scripted/Synthetic: synthetic record; Replay: real epochs) ->
 *   SA.errp.detector.observe(...) -> keep | rollback | flag | log. The decision is computed, never forced (D22/D23).
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.safety = SA.safety || {};

  var OWNER = 'episode';
  var lastSelectConf = null;
  var dwellHandle = null, autoHandle = null;
  var counter = 0;
  var inited = false;
  var BUSY = ['resolving', 'deciding', 'confirm', 'pendingCaregiver', 'executing', 'observing'];

  function cfgE() { return (SA.config && SA.config.errp) || {}; }
  function emit(e, p) { if (SA.bus && SA.bus.emit) SA.bus.emit(e, p); }
  function audit(type, data, actor) { if (SA.safety.audit) SA.safety.audit.append(type, data, actor || 'system'); }
  function get(p) { return SA.store.get(p); }
  function cur() { return get('episode') || { id: null, phase: 'idle' }; }
  function r2(x) { return Math.round((x + 1e-12) * 100) / 100; }
  function r4(x) { return Math.round((x + 1e-12) * 10000) / 10000; }
  function uid() { return (SA.util && SA.util.uid) ? SA.util.uid('ep') : 'ep-' + (++counter); }
  function cancelTimers() {
    if (SA.clock && SA.clock.cancel) { if (dwellHandle) SA.clock.cancel(dwellHandle); if (autoHandle) SA.clock.cancel(autoHandle); }
    dwellHandle = autoHandle = null;
  }

  function write(ep) { SA.store.set('episode', ep, OWNER); }
  function setPhase(phase, extra) {
    var ep = cur(), prev = ep.phase;
    ep.phase = phase;
    if (extra) Object.keys(extra).forEach(function (k) { ep[k] = extra[k]; });
    write(ep);
    emit('episode:phase', { episodeId: ep.id, phase: phase, prev: prev, lockout: BUSY.indexOf(phase) >= 0 });
    return ep;
  }
  function telemetry(patch) { SA.store.patch('telemetry', patch, OWNER); }

  /* ---------- fallbacks used only when KG/policy modules are absent ---------- */
  function fallbackRisk(action, devices) {
    var P = (SA.config && SA.config.policy) || {}, tiers = P.tiers || { light: 'Low', fan: 'Low', tv: 'Low', ac: 'Medium' };
    var labels = P.tierLabels || { Low: 'Low: Autonomic', Medium: 'Medium: Guarded', High: 'High: Caregiver Approval' };
    var tier, cc, rule = null;
    if (action.kind === 'preset') { tier = (P.presetTiers || {})[action.id] || 'Medium'; cc = 'preset'; }
    else {
      var d = devices[action.id] || {}, c = String(action.command || '').toLowerCase();
      tier = tiers[d.kind] || 'Low';
      cc = d.kind === 'light' ? (/turnon|turnoff/.test(c) ? 'light-select' : 'setting') : d.kind === 'ac' ? 'setting-medium'
        : (/power/.test(c) ? 'power' : 'setting');
    }
    var steps = SA.safety.rollback.plan(action, devices), th = P.thermal || { min: 18, max: 30 };
    steps.forEach(function (s) {
      if (s.after.kind === 'ac' && (s.after.setpoint < th.min || s.after.setpoint > th.max)) {
        tier = 'High'; rule = { id: 'thermal', text: 'Setpoint ' + s.after.setpoint + '°C is ' + (s.after.setpoint < th.min ? 'below the ' + th.min : 'above the ' + th.max) + '°C ' + (s.after.setpoint < th.min ? 'minimum' : 'maximum') };
      }
    });
    return { tier: tier, tierLabel: labels[tier], rule: rule, advisory: null, costClass: cc };
  }
  function fallbackDecide(ctx) {
    var P = (SA.config && SA.config.policy) || {}, rj = P.reject || { cMin: 0.5, nMin: 0.4 }, ex = P.execute || { low: 0.75, medium: 0.85 };
    var n = r2(ctx.n), s = ctx.s, c = r4(n * s), d, reason;
    if (ctx.noop) { d = 'REJECT'; reason = ctx.noopReason || 'No change'; }
    else if (n < rj.nMin || c < rj.cMin) { d = 'REJECT'; reason = 'Not sure, please try again'; }
    else if (ctx.tier === 'High') { d = 'CAREGIVER'; reason = ctx.ruleText || 'High-risk action'; }
    else { d = c >= (ctx.tier === 'Medium' ? ex.medium : ex.low) ? 'EXECUTE' : 'CONFIRM'; reason = 'c = ' + c; }
    if (d === 'EXECUTE' && ctx.hFlag) { d = 'CONFIRM'; reason = 'ErrP memory h-flag'; }
    return { decision: d, reason: reason, n: n, s: s, c: c, tier: ctx.tier, trace: ['fallback policy (policy module absent): ' + reason] };
  }

  function slim(res) {
    if (!res) return null;
    return { kind: res.kind, command: res.command, intentLabel: res.intentLabel, actedOn: res.actedOn, kgTop: res.kgTop,
      ranked: res.ranked, semanticConfidence: res.semanticConfidence, roomConfidence: res.roomConfidence,
      spatialContext: res.spatialContext, noop: res.noop, noopReason: res.noopReason, hFlag: res.hFlag };
  }

  /* ---------- 1. request -> resolve -> decide ---------- */
  function start(req, lineage) {
    var ep0 = cur();
    if (ep0.id && BUSY.indexOf(ep0.phase) >= 0) {
      emit('voice:say', { display: 'Observing — please wait', priority: 'nav' });
      return null;                                         // lockout (ADR 0005 D11)
    }
    cancelTimers();
    var target = req.target || { kind: req.kind, id: req.id };
    var action = { kind: target.kind, id: target.id, command: req.command || (target.kind === 'preset' ? 'Activate' : null), args: req.args || {} };
    var id = uid(), room = get('context.activeRoom'), devices = get('devices');
    write({ id: id, phase: 'idle', action: action, origin: req.origin || null, rollbacks: lineage ? lineage.rollbacks : 0,
      retryOf: lineage ? lineage.retryOf : null, approved: false });
    setPhase('resolving');
    var resolved = null;
    try {
      if (SA.kg && typeof SA.kg.resolve === 'function') {
        resolved = SA.kg.resolve({ episodeId: id, kind: action.kind, id: action.id, command: action.command, args: action.args },
          { activeRoom: room, roomConfidence: (SA.config.kg && SA.config.kg.roomConfidence) || 0.95 });
      }
    } catch (e) { if (typeof console !== 'undefined') console.error('episode: resolve failed', e); }
    setPhase('deciding', { resolved: slim(resolved) });
    var risk = (SA.policy && SA.policy.risk && SA.policy.risk.assess) ? SA.policy.risk.assess(action, devices) : fallbackRisk(action, devices);
    var steps = SA.safety.rollback.plan(action, devices);
    var sl = get('decoder.sliders') || { neural: 0.92, semantic: 0.89 };
    var n = lastSelectConf != null ? lastSelectConf : sl.neural;
    var s = sl.semanticOverride ? sl.semantic : (resolved && typeof resolved.semanticConfidence === 'number' ? resolved.semanticConfidence : sl.semantic);
    var noop = resolved && typeof resolved.noop === 'boolean' ? resolved.noop : steps.length === 0;
    var noopReason = (resolved && resolved.noopReason) || (noop ? 'No change: ' + (devices[action.id] ? devices[action.id].label : action.id) + ' is already in that state' : null);
    var mem = SA.errp && SA.errp.memory;
    var hFlag = !!((resolved && resolved.hFlag) || (mem && mem.hFlag(action.id, action.command, room)));
    var pctx = { n: n, s: s, tier: risk.tier, noop: noop, noopReason: noopReason, hFlag: hFlag, ruleText: risk.rule ? risk.rule.text : null };
    var dec = (SA.policy && typeof SA.policy.decide === 'function') ? SA.policy.decide(pctx) : fallbackDecide(pctx);
    var c = typeof dec.c === 'number' ? dec.c : r4(r2(n) * s);
    telemetry({ n: dec.n != null ? dec.n : n, s: s, c: c, tier: risk.tier, lastDecision: dec.decision });
    setPhase('deciding', { decision: { decision: dec.decision, reason: dec.reason, c: c, n: dec.n, s: s, trace: dec.trace },
      tier: risk.tier, costClass: risk.costClass, rule: risk.rule, steps: steps, hFlag: hFlag });
    emit('policy:decided', { episodeId: id, decision: dec.decision, reason: dec.reason, n: dec.n != null ? dec.n : n, s: s, c: c,
      tier: risk.tier, tierLabel: risk.tierLabel, rule: risk.rule, advisory: risk.advisory, trace: dec.trace || [] });
    audit('RESOLVE', { episodeId: id, action: action, actedOn: resolved && resolved.actedOn, kgTop: resolved && resolved.kgTop,
      semanticConfidence: s, room: room }, 'system');
    audit('DECISION', { episodeId: id, decision: dec.decision, reason: dec.reason, n: dec.n, s: s, c: c, tier: risk.tier,
      hFlag: hFlag, costClass: risk.costClass }, 'system');

    if (dec.decision === 'REJECT') {
      setPhase('idle', { outcome: 'rejected' });
      emit('voice:say', { display: dec.reason, priority: 'safety' });
    } else if (dec.decision === 'CAREGIVER') {
      var apId = SA.safety.approvals.request(id, action, risk.rule ? risk.rule.text : dec.reason,
        { intentLabel: resolved && resolved.intentLabel, n: dec.n != null ? dec.n : n, s: s });
      setPhase('pendingCaregiver', { approvalId: apId });
    } else if (dec.decision === 'CONFIRM' || action.kind === 'preset') {
      setPhase('confirm', { confirmKind: action.kind === 'preset' ? 'preview' : 'confirm' });   // preset diff preview = confirm
    } else {
      var dwell = (SA.config.ui && SA.config.ui.decisionDwellMs) || 0;
      if (dwell > 0 && SA.clock && SA.clock.after) dwellHandle = SA.clock.after(dwell, function () { dwellHandle = null; execute('EXECUTE'); });
      else execute('EXECUTE');
    }
    return id;
  }

  /* ---------- 3. execute -> observe ---------- */
  function priorFor(how, c) {
    var E = cfgE(), floor = E.piFloor || 0.02, pi;
    if (how === 'EXECUTE') pi = 1 - c;
    else {
      var f = (E.confirmRates && E.confirmRates.falseConfirm) || 0.074, t = (E.confirmRates && E.confirmRates.trueConfirm) || 0.913;
      pi = (1 - c) * f / ((1 - c) * f + c * t);
    }
    return Math.max(floor, pi);
  }

  function execute(how, opts) {
    opts = opts || {};
    var ep = cur();
    if (!ep.id) return;
    setPhase('executing');
    var steps;
    try {
      steps = SA.safety.rollback.plan(ep.action, get('devices'));
      ep = cur();
      ep.sagaId = SA.safety.rollback.execute(ep.id, steps, opts.actor || 'patient');
    } catch (e) {
      if (typeof console !== 'undefined') console.error('episode: execute failed', e);
      setPhase('idle', { outcome: 'failed' });
      return;
    }
    var c = ep.decision ? ep.decision.c : 0.5;
    var pi = priorFor(how, c);
    var obs = { pi: pi, how: how, startedAt: SA.clock ? SA.clock.now() : Date.now(), windowMs: cfgE().observeMs || 1000,
      approvedHigh: !!opts.approvedHigh };
    setPhase('observing', { steps: steps, sagaId: ep.sagaId, observation: obs, approved: !!opts.approvedHigh });
    emit('errp:observeStart', { episodeId: ep.id, costClass: ep.costClass, tier: ep.tier, pi: pi, durationMs: obs.windowMs });
    if (get('prefs.errpAutoConfirm') && SA.clock && SA.clock.after) {
      autoHandle = SA.clock.after(cfgE().autoConfirmDelayMs || 1500, function () {
        autoHandle = null; emit('errp:inject', { kind: 'correct', source: 'auto' });
      });
    }
  }

  /* ---------- 4/5. inject -> detect -> outcome ---------- */
  function pickEpoch(kind, source) {
    var S = SA.errp.synth, mode = get('decoder.mode');
    if (source === 'auto') return S.epoch('correct');
    if (mode === 'replay') {
      var pin = get('decoder.errpPin');
      if (pin && S.byId(pin)) return S.byId(pin);
      var curs = get('decoder.errpCursor') || { error: 0, correct: 0 };
      var r = S.nextReplay(kind, curs[kind] || 0);
      curs[kind] = r.cursor;
      SA.store.patch('decoder', { errpCursor: curs }, OWNER);
      return r.epoch;
    }
    return S.epoch(kind);
  }

  function alternativeFor(ep) {
    var a = ep.action, room = get('context.activeRoom'), mem = SA.errp && SA.errp.memory;
    if (a.kind === 'preset') {
      return { id: a.id, kind: 'preset', label: a.id.replace(/([a-z])([A-Z])/g, '$1 $2'), score: 1, command: a.command };
    }
    var ranked = (ep.resolved && ep.resolved.ranked) || [];
    var best = null;
    ranked.forEach(function (r) {
      if (r.id === a.id) return;
      var m = mem ? mem.factor(r.id, a.command, room) : 1;
      var sc = (typeof r.score === 'number' ? r.score : 0) * m;
      if (!best || sc > best.scorePenalised) best = { id: r.id, iri: r.iri, label: r.label, score: r.score, scorePenalised: sc, kind: 'device', command: a.command };
    });
    return best;
  }

  function statusFor(res) {
    var uv = res.fczMinUv;
    if (res.decision === 'keep') return 'No Error Detected • Action Confirmed';
    if (res.decision === 'rollback') return 'Possible Error Detected • ErrP Deflection at FCz (' + (uv == null ? '?' : uv.toFixed(1)) + ' µV)';
    if (res.decision === 'flag') return res.costClass === 'setting' ? 'Possible Error Detected • not rolled back (setting: flag only)' : 'Possible Error Detected • not rolled back (flag only)';
    return 'ErrP observation logged (approved High-tier action; log-only)';
  }

  function onInject(p) {
    var ep = cur();
    if (!ep.id || ep.phase !== 'observing') {
      emit('voice:say', { display: 'No action is being observed', priority: 'nav' });
      return null;
    }
    var kind = p && p.kind === 'error' ? 'error' : 'correct', source = (p && p.source) || 'operator';
    if (autoHandle && SA.clock) { SA.clock.cancel(autoHandle); autoHandle = null; }
    var epoch = pickEpoch(kind, source);
    var model = SA.data && SA.data.errpModel;
    var mode = get('decoder.mode') === 'scripted' ? 'auto' : ((model && model.mode) || cfgE().mode || 'auto');
    var room = get('context.activeRoom');
    var res = SA.errp.detector.observe(epoch, { episodeId: ep.id, costClass: ep.costClass, tier: ep.tier,
      pi: ep.observation.pi, approvedHigh: !!ep.approved, mode: mode,
      target: { entityId: ep.action.id, command: ep.action.command, room: room } });
    var expected = kind === 'error' ? 'rollback' : 'keep';
    var disagreed = res.decision !== expected && !(res.decision === 'flag' && kind === 'error') && res.decision !== 'log';
    var obs = Object.assign({}, ep.observation, { kind: kind, source: source, epochId: res.epochId, epochSource: res.source,
      q: res.q, qTr: res.qTr, lambda: res.lambda, tStar: res.tStar, decision: res.decision, fczMinUv: res.fczMinUv,
      disagreed: disagreed, status: statusFor(res), stub: res.modelStub,
      detail: 'q = ' + (res.q == null ? 'n/a' : res.q.toFixed(3)) + ', t* = ' + (isFinite(res.tStar) ? res.tStar.toFixed(3) : '∞') + ', π = ' + res.pi.toFixed(3) });
    telemetry({ lastQ: res.q, lastErrpDecision: res.decision });
    audit('ERRP_OBS', { episodeId: ep.id, injected: kind, source: source, epochId: res.epochId, epochSource: res.source,
      label: res.label, q: res.q, pi: res.pi, tStar: isFinite(res.tStar) ? res.tStar : null, lambda: res.lambda,
      decision: res.decision, fczMinUv: res.fczMinUv, costClass: ep.costClass, stub: res.modelStub }, source === 'operator' ? 'operator-harness' : 'system');
    if (disagreed) emit('voice:say', { display: 'detector disagreed (q = ' + (res.q == null ? 'n/a' : res.q.toFixed(2)) + ')', priority: 'nav' });

    if (res.decision === 'keep') {
      audit('CONFIRMED', { episodeId: ep.id, sagaId: ep.sagaId }, 'system');
      setPhase('outcome', { observation: obs, outcome: 'confirmed', alternative: null });
      emit('action:confirmed', { episodeId: ep.id, sagaId: ep.sagaId });
    } else if (res.decision === 'rollback') {
      var rb = (ep.rollbacks || 0) + 1, max = (SA.config.safety && SA.config.safety.maxRollbacksPerEpisode) || 1;
      SA.safety.rollback.compensate(ep.id, ep.sagaId, { reason: 'errp', actor: 'system' });
      var home = rb > max;
      var alt = home ? null : alternativeFor(ep);
      setPhase('outcome', { observation: obs, outcome: home ? 'rolledBackHome' : 'rolledBack', alternative: alt, rollbacks: rb });
      emit('voice:say', { display: obs.status, priority: 'safety' });
    } else {
      if (res.decision === 'flag') audit('FLAGGED', { episodeId: ep.id, q: res.q, costClass: ep.costClass }, 'system');
      setPhase('outcome', { observation: obs, outcome: res.decision === 'flag' ? 'flagged' : 'logged', alternative: null });
      emit('action:flagged', { episodeId: ep.id, reason: res.decision === 'log' ? 'log' : (ep.costClass === 'setting' ? 'setting' : 'flag') });
    }
    return res;
  }

  /* ---------- 6. outcome choices, confirm, approvals, reset ---------- */
  function onOutcome(p) {
    var ep = cur();
    if (!ep.id || ep.phase !== 'outcome' || (p && p.episodeId && p.episodeId !== ep.id)) return;
    if (p && p.choice === 'retry' && ep.alternative) {
      var alt = ep.alternative, lineage = { rollbacks: ep.rollbacks || 0, retryOf: ep.id };
      setPhase('idle');
      start({ target: { kind: alt.kind === 'preset' ? 'preset' : 'device', id: alt.id }, command: ep.action.command,
        args: ep.action.args, origin: ep.origin }, lineage);
    } else setPhase('idle');
  }
  function onConfirm(p, accepted) {
    var ep = cur();
    if (!ep.id || ep.phase !== 'confirm' || (p && p.episodeId && p.episodeId !== ep.id)) return;
    audit(accepted ? 'CONFIRM_ACCEPTED' : 'CONFIRM_CANCELLED', { episodeId: ep.id, kind: ep.confirmKind }, 'patient');
    if (accepted) execute(ep.confirmKind === 'preview' && ep.decision && ep.decision.decision === 'EXECUTE' ? 'PREVIEW' : 'CONFIRM');
    else setPhase('idle', { outcome: 'cancelled' });
  }
  function onApproval(p) {
    var ep = cur();
    if (!p || !ep.id || ep.phase !== 'pendingCaregiver' || p.episodeId !== ep.id) return;
    if (p.outcome === 'approved') execute('EXECUTE', { approvedHigh: true, actor: 'caregiver' });
    else setPhase('idle', { outcome: p.outcome });
  }
  function onResetting() {
    var ep = cur();
    cancelTimers();
    if (ep.id && ep.phase !== 'idle' && ep.phase !== 'outcome') audit('EPISODE_ABORTED', { episodeId: ep.id, phase: ep.phase, reason: 'reset' }, 'operator');
    lastSelectConf = null;
  }

  function init() {
    if (inited) return;
    inited = true;
    var B = SA.bus;
    B.on('eeg:decoded', function (p) { if (p && p.token === 'SELECT' && typeof p.conf === 'number') lastSelectConf = p.conf; });
    B.on('ui:actionRequested', function (p) { if (p) start(p); });
    B.on('ui:confirmAccepted', function (p) { onConfirm(p, true); });
    B.on('ui:confirmCancelled', function (p) { onConfirm(p, false); });
    B.on('ui:outcomeChoice', onOutcome);
    B.on('errp:inject', onInject);
    B.on('approval:resolved', onApproval);
    B.on('demo:resetting', onResetting);
    B.on('demo:reset', function () { counter = 0; lastSelectConf = null; cancelTimers(); });
  }

  SA.safety.episode = { init: init, current: cur, start: start, inject: onInject, priorFor: priorFor,
    _lastSelectConf: function () { return lastSelectConf; } };
})(typeof window !== 'undefined' ? window : globalThis);
