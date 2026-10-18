/* SA.config.policy — policy constants (ADR 0003 D13, D16, D17; architecture §5.4). Owner: KG builder. */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.config = SA.config || {};
  SA.config.policy = { combine: 'product', reject: { cMin: .50, nMin: .40 }, execute: { low: .75, medium: .85 },
    noopGuard: true, maxAlternativesPerEpisode: 1, approvedHighErrp: 'log', confirmTokenMinConf: .60, confirmTimeoutMs: 0,
    thermal: { min: 18, max: 30, advisory: [20, 26], advisoryEscalates: false },
    tierLabels: { Low: 'Low: Autonomic', Medium: 'Medium: Guarded', High: 'High: Caregiver Approval' },
    tiers: { light: 'Low', fan: 'Low', tv: 'Low', ac: 'Medium' },
    presetTiers: { NightMode: 'Medium', AllLightsOff: 'Low', CoolingMode: 'Medium', WatchTV: 'Low' } };  // asserted == computed
})(typeof window !== 'undefined' ? window : globalThis);
