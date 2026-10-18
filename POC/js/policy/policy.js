/*
 * SA.policy.decide — confidence-gated policy (ADR 0003 D12-D14; architecture §2.4). PURE: no emit.
 *
 *   decide(ctx) -> {decision:'EXECUTE'|'CONFIRM'|'REJECT'|'CAREGIVER', reason, n, s, c, tier, tierLabel, trace:[string]}
 *   ctx = {n, s, tier:'Low'|'Medium'|'High', noop, noopReason, hFlag, ruleText, errpFactor?}
 *   n rounded to 2 dp; c = round4(n x s)  (a monotone confidence, NOT a probability).
 *   Rules, first match wins:
 *     1 noop -> REJECT ("No change: ...")
 *     2 n < 0.40 or c < 0.50 -> REJECT ("Not sure, please try again")
 *     3 High -> CAREGIVER
 *     4 Medium: c >= 0.85 -> EXECUTE else CONFIRM
 *     5 Low:    c >= 0.75 -> EXECUTE else CONFIRM
 *     6 EXECUTE and h-flag (ErrP memory M < 0.9, ADR 0002 D18) -> CONFIRM
 *   Thresholds are declared constants (SA.config.policy); the policy takes no ErrP credit (ADR 0002 D12).
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.policy = SA.policy || {};

  var TIMES = '×', GE = '≥', ARROW = '→';

  function round(x, dp) { var f = Math.pow(10, dp); return Math.round((x + (x < 0 ? -1 : 1) * Number.EPSILON) * f) / f; }
  function pc() {
    var p = (SA.config && SA.config.policy) || {};
    return { reject: p.reject || { cMin: .50, nMin: .40 }, execute: p.execute || { low: .75, medium: .85 },
      labels: p.tierLabels || { Low: 'Low: Autonomic', Medium: 'Medium: Guarded', High: 'High: Caregiver Approval' },
      noopGuard: p.noopGuard !== false };
  }
  function f2(x) { return x.toFixed(2); }
  function cmp(a, b) { return a >= b - 1e-12; }    // c is already round4; guard against representation noise

  function decide(ctx) {
    var p = pc(), tier = ctx.tier || 'Low';
    var n = round(Number(ctx.n), 2), s = round(Number(ctx.s), 4), c = round(n * s, 4);
    var trace = [], out = function (decision, reason) {
      return { decision: decision, reason: reason, n: n, s: s, c: c, tier: tier, tierLabel: p.labels[tier], trace: trace };
    };
    var cLine = 'c = ' + f2(n) + ' ' + TIMES + ' ' + f2(s) + ' = ' + c.toFixed(4);

    if (ctx.noop && p.noopGuard) {
      trace.push('No-op guard: ' + (ctx.noopReason || 'no state change') + ' ' + ARROW + ' REJECT');
      return out('REJECT', ctx.noopReason || 'No change');
    }
    if (n < p.reject.nMin) {
      trace.push('Neural floor: n = ' + f2(n) + ' < ' + f2(p.reject.nMin) + ' ' + ARROW + ' REJECT');
      return out('REJECT', 'Not sure, please try again');
    }
    if (c < p.reject.cMin) {
      trace.push(cLine + ' < ' + f2(p.reject.cMin) + ' ' + ARROW + ' REJECT');
      return out('REJECT', 'Not sure, please try again');
    }
    if (tier === 'High') {
      trace.push(cLine + '; tier High' + (ctx.ruleText ? ' (' + ctx.ruleText + ')' : '') + ' ' + ARROW + ' CAREGIVER APPROVAL');
      return out('CAREGIVER', ctx.ruleText || 'High-risk action needs caregiver approval');
    }
    var theta = tier === 'Medium' ? p.execute.medium : p.execute.low, decision, reason;
    if (cmp(c, theta)) {
      trace.push(cLine + ' ' + GE + ' ' + f2(theta) + ' (' + tier + ') ' + ARROW + ' EXECUTE');
      decision = 'EXECUTE'; reason = 'Confident: c ' + GE + ' ' + f2(theta) + ' (' + tier + ')';
    } else {
      trace.push(cLine + ' < ' + f2(theta) + ' (' + tier + ') ' + ARROW + ' CONFIRM');
      decision = 'CONFIRM'; reason = 'Please confirm: c < ' + f2(theta) + ' (' + tier + ')';
    }
    if (decision === 'EXECUTE' && ctx.hFlag) {
      var m = ctx.errpFactor != null ? ' ' + TIMES + Number(ctx.errpFactor).toFixed(2) : '';
      trace.push('ErrP memory' + m + ' (ranking only) < 0.90 h-flag ' + ARROW + ' CONFIRM');
      decision = 'CONFIRM'; reason = 'Please confirm: this choice was recently flagged by ErrP';
    }
    return out(decision, reason);
  }

  SA.policy.decide = decide;
})(typeof window !== 'undefined' ? window : globalThis);
