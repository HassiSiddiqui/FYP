/*
 * SA.policy.risk — risk tiers + thermal overlay (ADR 0003 D16, D17; architecture §2.4, §5.6).
 *
 *   assess(action, devices) -> {tier, tierLabel, rule, advisory, costClass, steps?}
 *     action  = {kind:'device'|'preset', id, command, args}
 *     devices = store.devices map (optional; defaults to the KG mirror's read-back)
 *   Device tier = SA.config.policy.tiers[kind] (mirrors sa:hasRiskTier in the KG; tests assert equality).
 *   Thermal overlay: any SetTemperature whose RESULTING setpoint is < 18 or > 30 degC (strict) -> High,
 *   whatever the AC power state, from a device action or a preset step.
 *   Advisory band [18, 20) or (26, 30]: one-line advisory, no tier change (advisoryEscalates: false).
 *   Preset tier = max over its non-no-op steps (with the overlay).
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.policy = SA.policy || {};

  var RANK = { Low: 1, Medium: 2, High: 3 }, DEG = '°';

  function pc() {
    var p = (SA.config && SA.config.policy) || {};
    return {
      thermal: p.thermal || { min: 18, max: 30, advisory: [20, 26], advisoryEscalates: false },
      labels: p.tierLabels || { Low: 'Low: Autonomic', Medium: 'Medium: Guarded', High: 'High: Caregiver Approval' },
      tiers: p.tiers || { light: 'Low', fan: 'Low', tv: 'Low', ac: 'Medium' }
    };
  }
  function devicesOr(devices) { return devices || SA.kg.mirror.deviceStates(); }

  function thermal(setpoint) {
    var t = pc().thermal;
    if (setpoint < t.min) return { id: 'thermal', text: 'Setpoint ' + setpoint + DEG + 'C is below the ' + t.min + DEG + 'C minimum' };
    if (setpoint > t.max) return { id: 'thermal', text: 'Setpoint ' + setpoint + DEG + 'C is above the ' + t.max + DEG + 'C maximum' };
    return null;
  }
  function advisory(setpoint) {
    var t = pc().thermal, a = t.advisory || [20, 26];
    if ((setpoint >= t.min && setpoint < a[0]) || (setpoint > a[1] && setpoint <= t.max)) {
      return 'Advisory: outside the ' + a[0] + '–' + a[1] + ' ' + DEG + 'C comfort band for impaired thermoregulation';
    }
    return null;
  }

  function costClass(kind, command) {
    if (kind === 'preset') return 'preset';
    if (kind === 'ac') return 'setting-medium';
    if (kind === 'light') return command === 'TurnOn' || command === 'TurnOff' ? 'light-select' : 'setting';
    if (kind === 'tv') return command === 'TurnOn' || command === 'TurnOff' ? 'power' : 'setting';
    return 'setting';                                   // fan speed / off
  }

  // One device command against a given device state -> {tier, rule, advisory, after, noop, command}
  function assessStep(dev, command, args) {
    var M = SA.kg.mirror, n = M.normalize(dev, command, args), after = M.effect(dev, n.command, n.args);
    var tier = pc().tiers[dev.kind] || 'Low', rule = null, adv = null;
    if (n.command === 'SetTemperature') {
      rule = thermal(after.setpoint);
      if (rule) tier = 'High';
      else adv = advisory(after.setpoint);
      if (adv && pc().thermal.advisoryEscalates && RANK[tier] < RANK.Medium) tier = 'Medium';
    }
    return { tier: tier, rule: rule, advisory: adv, after: after, command: n.command,
      noop: JSON.stringify(after) === JSON.stringify(dev) };
  }

  function assess(action, devices) {
    var c = pc(), devs = devicesOr(devices);
    if (action.kind === 'preset') {
      var steps = SA.kg.resolver.presetSteps(action.id, devs), tier = null, rule = null, adv = null, sim = {};
      var detail = steps.map(function (s) {
        var before = sim[s.deviceId] || devs[s.deviceId], r = assessStep(before, s.command, s.args);
        sim[s.deviceId] = r.after;
        if (!r.noop) {
          if (!tier || RANK[r.tier] > RANK[tier]) tier = r.tier;
          if (r.rule && !rule) rule = r.rule;
          if (r.advisory && !adv) adv = r.advisory;
        }
        return { deviceId: s.deviceId, command: s.command, args: s.args, tier: r.tier, noop: r.noop };
      });
      tier = tier || 'Low';
      return { tier: tier, tierLabel: c.labels[tier], rule: rule, advisory: adv, costClass: 'preset', steps: detail };
    }
    var dev = devs[action.id];
    if (!dev) throw new Error('SA.policy.risk.assess: unknown device ' + action.id);
    var r = assessStep(dev, action.command, action.args);
    return { tier: r.tier, tierLabel: c.labels[r.tier], rule: r.rule, advisory: r.advisory,
      costClass: costClass(dev.kind, r.command) };
  }

  SA.policy.risk = { assess: assess, thermal: thermal, advisory: advisory, costClass: costClass, rank: RANK };
})(typeof window !== 'undefined' ? window : globalThis);
