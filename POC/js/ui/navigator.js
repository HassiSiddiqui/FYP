/* SilentAssist — SA.ui.navigator (owner: UI). Sole writer of store.ui. DOM-free (runs headless in Node).
 * Consumes only eeg:decoded as tokens; follows episode/approval/outcome events (docs/architecture.md §2.6, ADR 0005 B/C). */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.ui = SA.ui || {};

  var BY = 'ui';
  var subs = [];
  var st = fresh();
  function fresh() {
    return { episodeId: null, origin: null, steps: null, obs: null, inject: null, decision: null, approvalByEp: {},
      waitCaptioned: false, actionInFlight: false };
  }

  function S() { return (SA.config && SA.config.ui && SA.config.ui.strings) || {}; }
  function F() { return SA.ui.format; }
  function ui() { return SA.store.get('ui'); }
  function setUi(p) { SA.store.patch('ui', p, BY); }
  function state() { return { ui: SA.store.get('ui'), devices: SA.store.get('devices'), episode: SA.store.get('episode') }; }
  function scr(id) { return SA.ui.screens[id]; }
  function say(display, priority, speech) {
    var p = { display: display, priority: priority || 'nav' };
    if (speech) p.speech = speech;
    SA.bus.emit('voice:say', p);
  }
  function caption(text) { setUi({ caption: text }); say(text, 'nav'); }
  function alertMsg(text) { setUi({ alert: text }); say(text, 'safety'); }
  function audit(type, data, actor) { SA.bus.emit('audit:request', { type: type, data: data, actor: actor || 'patient' }); }

  function items(screenId, s) { var d = scr(screenId); return d ? d.items(s || state()) : []; }
  function focusOf(u, screenId) { var f = u.focus && u.focus[screenId]; return typeof f === 'number' ? f : 0; }

  function announceFocus(screenId, idx, list, prefix) {
    var it = list[idx];
    if (!it) return;
    SA.bus.emit('ui:focusChanged', { screen: screenId, index: idx, itemId: it.id });
    var text = (prefix || '') + it.title + (it.subtitle ? ', ' + it.subtitle : '') + ', ' + (idx + 1) + ' of ' + list.length;
    setUi({ caption: text });
    say(text, 'nav');
  }

  function setFocus(screenId, idx, prefix) {
    var u = ui(), list = items(screenId);
    if (!list.length) return;
    idx = Math.max(0, Math.min(list.length - 1, idx | 0));
    var f = Object.assign({}, u.focus); f[screenId] = idx;
    setUi({ focus: f });
    announceFocus(screenId, idx, list, prefix);
  }

  function go(to, focus, extra) {
    var u = ui(), from = u.screen, def = scr(to);
    if (!def) return;
    var mem = Object.assign({}, u.focusMemory); mem[from] = focusOf(u, from);
    var patch = Object.assign({ screen: to, focusMemory: mem }, extra || {});
    setUi(patch);
    var idx = typeof focus === 'number' ? focus : def.entryFocus(state());
    var f = Object.assign({}, ui().focus); f[to] = idx;
    setUi({ focus: f });
    if (from !== to) SA.bus.emit('ui:screenChanged', { from: from, to: to });
    var list = items(to);
    if (list.length) announceFocus(to, Math.min(idx, list.length - 1), list, def.title + '. ');
  }

  function move(delta) {
    var u = ui(), list = items(u.screen);
    if (!list.length) return;
    var i = focusOf(u, u.screen), n = list.length, j = i + delta, prefix = '';
    if (j >= n) { j = (SA.config.ui.wrap && n >= 2) ? 0 : n - 1; if (j === 0) prefix = 'Wrapped to first. '; }
    if (j < 0) { j = (SA.config.ui.wrap && n >= 2) ? n - 1 : 0; if (j === n - 1) prefix = 'Wrapped to last. '; }
    setFocus(u.screen, j, prefix);
  }

  /* ---------- token dispatch ---------- */
  function onDecoded(p) {
    if (!p || !p.token) return;
    var u = ui();
    if (u.dashboardOpen) return;
    if (u.subState === 'decoding') { setUi({ subState: 'list', lockout: false }); u = ui(); }
    audit('TOKEN', { token: p.token, cls: p.cls, screen: u.screen, decoded: !!p.decoded, conf: p.conf, source: p.source || null },
      p.source === 'operator' ? 'operator' : 'patient');
    if (u.lockout) {
      if (!st.waitCaptioned) { st.waitCaptioned = true; caption(S().observingWait || 'Observing — please wait'); }
      return;
    }
    var clear = {};
    if (u.alert) clear.alert = null;
    if (u.band) clear.band = null;
    if (Object.keys(clear).length) setUi(clear);
    if (u.subState === 'confirm') return confirmToken(p);
    if (u.subState === 'pending') return pendingToken(p);
    switch (p.token) {
      case 'NEXT': return move(1);
      case 'PREV': return move(-1);
      case 'SELECT': return doSelect();
      case 'BACK': return doBack();
    }
  }

  function gateC(p) {   // ADR 0005 D12 gate C: only for decoded (Replay/Synthetic) tokens
    var min = SA.config.policy && SA.config.policy.confirmTokenMinConf;
    return !(p.decoded && typeof min === 'number' && typeof p.conf === 'number' && p.conf < min);
  }

  function confirmToken(p) {
    var u = ui();
    if (p.token === 'SELECT' && gateC(p)) {
      setUi({ subState: 'list', dialog: null, lockout: true, repromptCount: 0 });
      st.waitCaptioned = false;
      SA.bus.emit('ui:confirmAccepted', { episodeId: st.episodeId });
    } else if (p.token === 'BACK' && gateC(p)) {
      setUi({ subState: 'list', dialog: null, lockout: false });
      audit('CONFIRM_CANCELLED', { episodeId: st.episodeId, reprompts: u.repromptCount || 0 }, 'patient');
      SA.bus.emit('ui:confirmCancelled', { episodeId: st.episodeId });
      st.actionInFlight = false;
      caption('Cancelled');
      restorePrev();
      setUi({ repromptCount: 0 });
    } else {
      var n = (u.repromptCount || 0) + 1;
      setUi({ repromptCount: n });
      var d = u.dialog || {};
      caption('Re-prompt ' + n + '. ' + (d.title || '') + '. ' + (S().confirmHint || ''));
    }
  }

  function pendingToken(p) {
    var u = ui();
    if (p.token === 'BACK') {
      var apId = st.approvalByEp[st.episodeId] || findApproval(st.episodeId);
      setUi({ subState: 'list', dialog: null, lockout: false, repromptCount: 0 });
      SA.bus.emit('ui:requestWithdrawn', { episodeId: st.episodeId, approvalId: apId });
      st.actionInFlight = false;
      alertMsg('Request withdrawn');
    } else {
      var n = (u.repromptCount || 0) + 1;
      setUi({ repromptCount: n });
      caption('Re-prompt ' + n + '. ' + (S().waitingCaregiver || '') + '. ' + (S().withdrawHint || ''));
    }
  }

  function findApproval(epId) {
    var aps = SA.store.get('approvals') || [];
    for (var i = 0; i < aps.length; i++) if (aps[i].episodeId === epId && aps[i].status === 'pending') return aps[i].id;
    return null;
  }

  function doSelect() {
    var u = ui(), def = scr(u.screen), list = items(u.screen);
    var it = list[focusOf(u, u.screen)];
    if (!def || !it) return;
    if (it.disabled) return caption(it.title + ' is unavailable');
    var r = def.select(it, state()) || {};
    if (r.navMode) {
      setUi({ navMode: r.navMode });
      if (r.navMode === 'audio') { try { SA.store.set('prefs.voice', true, BY); } catch (e) { /* owner table may forbid */ } }
    }
    if (r.goto) return go(r.goto, r.focus, r.fixture ? { fixture: r.fixture } : null);
    if (r.back) return doBack();
    if (r.noop) return alertMsg(r.noop);
    if (r.action) return requestAction(r.action, u.screen, focusOf(u, u.screen));
    if (r.outcome) return outcomeChoice(r.outcome);
  }

  function doBack() {
    var u = ui(), def = scr(u.screen);
    if (!def) return;
    var r = def.back(state()) || {};
    if (r.noop) return caption(r.noop);
    if (r.outcome) return outcomeChoice(r.outcome);
    if (r.goto) return go(r.goto, r.focus);
  }

  function requestAction(action, screenId, index) {
    st.origin = { screen: screenId, index: index };
    st.steps = null; st.obs = null; st.decision = null; st.actionInFlight = true; st.waitCaptioned = false;
    setUi({ lockout: true });
    SA.bus.emit('ui:actionRequested', { target: action.target, command: action.command, args: action.args || {}, origin: { screen: screenId, index: index } });
  }

  function outcomeChoice(choice) {
    var u = ui(), r = u.result || {};
    SA.bus.emit('ui:outcomeChoice', { episodeId: st.episodeId, choice: choice });
    if (choice === 'retry') {
      var alt = r.alt;
      st.steps = null; st.obs = null; st.actionInFlight = true; st.waitCaptioned = false;
      st.pendingOutcome = null; st.alt = null; st.rbSteps = null; st.flagReason = null;
      st.prevResult = r;
      var patch = { lockout: true, result: Object.assign({}, r, { cards: null }) };
      if (alt && alt.id && SA.store.get('devices.' + alt.id)) patch.fixture = alt.id;
      setUi(patch);
      return;
    }
    setUi({ result: null, subState: 'list' });
    st.actionInFlight = false;
    if (choice === 'continue' && st.origin && st.origin.screen) return go(st.origin.screen, st.origin.index);
    return go('S2', 0);
  }

  /* ---------- episode / outcome rendering models ---------- */
  function usesS5() {
    var eo = epField('origin'), o = eo && eo.screen;
    if (ui().screen === 'S5') return true;
    var d = o && scr(o);
    return !!(d && d.resultScreen);
  }
  function stepsText(steps, reverse) {
    if (!steps || !steps.length) return '';
    var f = F();
    return steps.map(function (s) { return reverse ? f.reverseTransition(s) : f.transition(s); }).join('\n');
  }
  function epField(k) { var e = SA.store.get('episode') || {}; return e[k]; }

  function onPhase(p) {
    if (!p) return;
    var ph = p.phase;
    if (p.episodeId) st.episodeId = p.episodeId;
    if (ph === 'confirm') {
      var action = epField('action') || {};
      var steps = epField('steps') || st.steps;
      var dec = epField('decision') || st.decision || {};
      var trace = (dec.trace && dec.trace.length) ? dec.trace[dec.trace.length - 1] : (dec.reason || '');
      var title = '✓ Confirm: ' + F().actionLabel(action, SA.store.get('devices'));
      setUi({ subState: 'confirm', lockout: false, repromptCount: 0,
        dialog: { kind: 'confirm', title: title, diff: stepsText(steps), reason: trace, hint: S().confirmHint } });
      say(title + '. ' + (S().confirmHint || ''), 'nav');
    } else if (ph === 'pendingCaregiver') {
      var d2 = epField('decision') || st.decision || {};
      var rule = (d2.rule && d2.rule.text) || d2.reason || '';
      setUi({ subState: 'pending', lockout: false, repromptCount: 0,
        dialog: { kind: 'pending', title: S().waitingCaregiver, reason: rule, hint: S().withdrawHint } });
      say(S().waitingCaregiver + '. ' + rule, 'safety');
    } else if (ph === 'observing') {
      st.waitCaptioned = false;
      var steps2 = epField('steps') || st.steps;
      var obsText = S().observing;
      if (usesS5()) {
        if (ui().screen !== 'S5') go('S5', 0);
        setUi({ lockout: true, subState: 'observing', result: { kind: 'observing', transition: stepsText(steps2), status: obsText, cards: null } });
      } else {
        setUi({ lockout: true, subState: 'observing', band: { kind: 'observing', lines: [stepsText(steps2), obsText].filter(Boolean) } });
      }
      say(obsText, 'nav', 'Observing post-action EEG');
    } else if (ph === 'outcome') {
      buildOutcome();
    } else if (ph === 'idle') {
      var u = ui();
      if (u.subState === 'confirm' || u.subState === 'pending' || u.subState === 'observing') setUi({ subState: 'list', dialog: null });
      if (u.lockout && !u.result) setUi({ lockout: false });
      if (u.result && !u.result.cards) buildOutcome();
      st.actionInFlight = false;
    }
  }

  function restorePrev() {   // a Retry that ends without actuation returns to the previous S5 outcome cards
    if (ui().screen === 'S5' && st.prevResult && !(ui().result && ui().result.cards)) {
      setUi({ result: st.prevResult, subState: 'outcome', lockout: false });
    }
  }

  function onDecided(p) {
    if (!p) return;
    st.decision = p;
    if (p.episodeId) st.episodeId = p.episodeId;
    if (p.decision === 'REJECT') {
      setUi({ lockout: false, subState: 'list', dialog: null, alert: p.reason || S().notSure });
      st.actionInFlight = false;
      restorePrev();
    } else if (p.decision === 'EXECUTE') {
      setUi({ caption: F().decisionChip('EXECUTE') });
    }
  }

  function onExecuted(p) {
    if (!p || !p.steps) return;
    st.steps = p.steps;
    var u = ui(), text = stepsText(p.steps);
    if (u.result && u.result.kind === 'observing') setUi({ result: Object.assign({}, u.result, { transition: text }) });
    if (u.band && u.band.kind === 'observing') setUi({ band: { kind: 'observing', lines: [text, S().observing] } });
  }

  function onObserved(p) {
    st.obs = p;
    if (!p || !st.inject) return;
    var disagree = (st.inject === 'error' && p.decision === 'keep') || (st.inject === 'correct' && p.decision === 'rollback');
    st.obs = Object.assign({}, p, { disagreed: disagree });
  }

  var lastOutcomeKey = null;
  function outcomeKind() {
    var o = epField('outcome');
    if (o === 'rolledBack' || o === 'rolledBackHome' || o === 'confirmed' || o === 'flagged') return o;
    if (o === 'logged') return 'flagged';
    return st.pendingOutcome || null;
  }

  // RT2-06 (ADR 0002 D20/D21): say where the ErrP epoch came from and that the µV value is descriptive only.
  function epochNote(obs) {
    if (!obs || !obs.epochId) return '';
    var src = obs.epochSource || obs.source, id = obs.epochId;
    var head = src === 'replay' ? 'ErrP epoch: Replay (BNCI 013-2015, ' + id + ')'
      : 'ErrP epoch: Synthetic (generated, ' + id + (/seed509\b/.test(id) ? '; seed selected to show the README value; α = 1.0; synthetic TPR 0.51 / FPR 0.005 at π = 0.18' : '') + ')';
    return head + ' · FCz value is a descriptive single-trial minimum; detection uses 72 features; q = ' + F().score(obs.q);
  }

  function buildOutcome() {
    var kind = outcomeKind();
    if (!kind) return;
    var f = F(), obs = st.obs || epField('observation') || {};
    var steps = st.steps || epField('steps') || st.rbSteps;
    var disagree = obs.disagreed ? 'detector disagreed (q = ' + f.score(obs.q) + ')' : '';
    var model, lines;
    if (kind === 'confirmed') {
      model = { kind: 'success', transition: stepsText(st.steps || steps), status: S().noErrp, statusKind: 'ok', note: disagree,
        cards: [{ id: 'continue', title: S().btnContinue }, { id: 'home', title: S().btnHome, bracketed: true }] };
      lines = [stepsText(st.steps || steps), S().noErrp].filter(Boolean);
    } else if (kind === 'rolledBack' || kind === 'rolledBackHome') {
      var alt = epField('alternative') || st.alt || null;
      var home = kind === 'rolledBackHome';
      var errp = f.errpStatus(obs.fczMinUv);
      var cards = [];
      var retrySub = '';
      if (!home) {
        var act = alt ? { target: { kind: alt.kind === 'preset' ? 'preset' : 'device', id: alt.id }, command: (epField('action') || {}).command || 'TurnOn' } : epField('action');
        retrySub = act ? f.actionLabel(act, SA.store.get('devices')) : '';
        cards.push({ id: 'retry', title: S().btnRetry, subtitle: retrySub, bracketed: true });
      }
      cards.push({ id: 'home', title: S().btnHome, bracketed: true });
      model = { kind: home ? 'rollbackHome' : 'rollback', errp: errp, transition: stepsText(steps, true), status: S().rolledBack,
        statusKind: 'danger', alt: alt && !home ? { id: alt.id, label: alt.label, score: alt.score } : null,
        note: [disagree, epochNote(obs)].filter(Boolean).join(' · '), cards: cards };
      lines = [errp, stepsText(steps, true), S().rolledBack];
    } else {
      var reason = st.flagReason || 'flag';
      var txt = reason === 'log' ? 'ErrP logged for caregiver review (approved action)'
        : reason === 'setting' ? 'Possible Error Detected • not rolled back (setting: flag only)'
          : 'Possible Error Detected • not rolled back (flag only)';
      model = { kind: 'flag', transition: stepsText(st.steps || steps), status: txt, statusKind: reason === 'log' ? 'ok' : 'warn', note: disagree,
        cards: [{ id: 'continue', title: S().btnContinue }, { id: 'home', title: S().btnHome, bracketed: true }] };
      lines = [stepsText(st.steps || steps), txt].filter(Boolean);
    }
    var key = st.episodeId + ':' + kind;
    var fresh2 = key !== lastOutcomeKey;
    lastOutcomeKey = key;
    st.actionInFlight = false;
    if (ui().screen === 'S5') {
      setUi({ lockout: false, subState: 'outcome', result: model, focus: Object.assign({}, ui().focus, { S5: 0 }) });
    } else {
      setUi({ lockout: false, subState: 'list', band: { kind: model.statusKind, lines: lines.concat(disagree ? [disagree] : []) } });
    }
    if (fresh2) {
      var pr = 'nav';   // episode already voices the safety status (#sa-alert); this is the caption + alternative
      var spoken = lines.concat(model.alt ? [S().altPrefix + model.alt.label] : []).join('. ');
      say(spoken, pr);
      if (ui().screen === 'S5' && model.cards) announceFocus('S5', 0, items('S5'));
    }
  }

  function onApprovalRequested(p) { if (p && p.episodeId) st.approvalByEp[p.episodeId] = p.approvalId; }
  function onApprovalResolved(p) {
    if (!p) return;
    var mine = p.episodeId && p.episodeId === st.episodeId;
    if (!mine) return;
    if (p.outcome === 'approved') {
      setUi({ subState: 'list', dialog: null, lockout: true });
      alertMsg('Caregiver approved the request');
    } else if (p.outcome === 'rejected' || p.outcome === 'expired') {
      setUi({ subState: 'list', dialog: null, lockout: false });
      st.actionInFlight = false;
      alertMsg(p.outcome === 'rejected' ? 'Caregiver rejected the request' : 'Request expired');
      if (ui().screen === 'devices/ac') setFocus('devices/ac', 1);
    } else if (p.outcome === 'cancelled' || p.outcome === 'withdrawn') {
      if (ui().subState === 'pending') setUi({ subState: 'list', dialog: null, lockout: false });
    }
  }

  function toggleDashboard() {
    var open = !ui().dashboardOpen;
    setUi({ dashboardOpen: open });
    SA.bus.emit('ui:dashboardToggled', { open: open });
  }

  function init() {
    if (subs.length) return;
    var on = function (e, fn) { subs.push(SA.bus.on(e, fn)); };
    on('eeg:decoded', function (p) { st.pendingTok = null; onDecoded(p); });
    on('eeg:decodeStart', function () { st.pendingTok = null; setUi({ subState: 'decoding', lockout: true, caption: S().decoding }); });
    // Safety net: if no decoder answers an input:token (decoder file missing), act on it as a scripted token.
    on('input:token', function (p) {
      if (!p || !SA.clock || !SA.clock.after) return;
      st.pendingTok = p;
      SA.clock.after(120, function () {
        if (st.pendingTok !== p) return;
        st.pendingTok = null;
        onDecoded({ token: p.token, cls: p.cls, conf: SA.store.get('decoder.sliders.neural'), decoded: false, source: p.source, fallback: true });
      });
    });
    on('input:dropped', function (p) { if (p && p.reason !== 'dashboard') setUi({ caption: 'Token dropped (' + (p.reason || '') + ')' }); });
    // RT1-01: every safety string shown in #sa-alert (incl. the episode's ErrP status) is mirrored into
    // store.ui.alert, so the existing clear-on-next-token / reset logic removes it (no stale banner).
    on('voice:say', function (p) {
      if (p && p.priority === 'safety' && p.display && ui().alert !== p.display) setUi({ alert: p.display });
    });
    on('episode:phase', onPhase);
    on('policy:decided', onDecided);
    on('action:executed', onExecuted);
    on('errp:inject', function (p) { st.inject = p && p.kind; });
    on('errp:observed', onObserved);
    on('action:confirmed', function () { st.pendingOutcome = 'confirmed'; buildOutcome(); });
    on('action:rolledBack', function (p) {
      st.pendingOutcome = 'rolledBack';
      if (p && p.steps && !st.steps) st.rbSteps = p.steps.map(function (s) { return { deviceId: s.deviceId, before: s.after, after: s.before }; });
      if (p && p.alternative) st.alt = p.alternative;
      buildOutcome();
    });
    on('action:flagged', function (p) { st.pendingOutcome = 'flagged'; st.flagReason = p && p.reason; buildOutcome(); });
    on('approval:requested', onApprovalRequested);
    on('approval:resolved', onApprovalResolved);
    on('ui:dashboardToggleRequested', toggleDashboard);
    on('demo:resetting', function () { st = fresh(); lastOutcomeKey = null; });
    on('demo:reset', function () { st = fresh(); lastOutcomeKey = null; });
    on('ui:actionRequested', function () { st.pendingOutcome = null; st.rbSteps = null; st.alt = null; st.flagReason = null; });
  }

  SA.ui.navigator = {
    init: init,
    refocus: function () { if (SA.ui.render && SA.ui.render.refocus) SA.ui.render.refocus(); },
    _state: function () { return st; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
