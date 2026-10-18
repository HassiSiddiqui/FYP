/* SA.config.errp — SAFETY builder (docs/architecture.md §5.6; ADR 0002 D12-D14, D18, D24).
 * Costs are nominal MI tokens; t* = fp / (fp + fn - tp). null = flag-only class. */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.config = SA.config || {};
  SA.config.errp = {
    observeMs: 1000,
    autoConfirmDelayMs: 1500,
    mode: 'auto',
    piFloor: 0.02,
    flagOnlyThreshold: 0.5,   // RT1-03: flag-only classes (costs null) flag iff q > max(0.5, π); never roll back (D15)
    canonicalPi: 0.181,
    crossSubjectNote: '6-subject mean cross-session BA 0.71 ± 0.09 · PRELIMINARY',   // RT1-12; docs/errp.md (run errp-B-slda-20261014-160835)
    confirmRates: { trueConfirm: 0.913, falseConfirm: 0.074 },
    penalty: { gamma: 0.5, floor: 0.5, halfLife: 20, hFlag: 0.9 },
    costs: {
      'light-select':   { fp: 5, fn: 7,  tp: 2.92 },  // t* = 0.5507 (README S5)
      'preset':         { fp: 5, fn: 15, tp: 3 },     // t* = 0.2941
      'setting-medium': { fp: 1, fn: 6,  tp: 2 },     // t* = 0.2 (AC setpoint/mode/power in band)
      'setting':        null,                         // Low settings: flag only
      'power':          null                          // fan/TV power: flag only tonight (gap)
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
