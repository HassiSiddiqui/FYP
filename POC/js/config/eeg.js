/* SA.config.eeg — EEG builder (docs/architecture.md §5.7; ADR 0004 D7, A8).
 * Model hyperparameters (tau, eta, bands, sos, nperseg, temperature, class order) are NEVER
 * here; they come only from SA.data.sfegatWeights.manifest. */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.config = SA.config || {};
  SA.config.eeg = {
    decodeAnimMs: 1600,
    replayEnabled: true,
    scriptedExemplar: 'auto',
    synthEnabled: false,
    synth: { seed: 20261015, nEval: 40, sigmaMm: 30 },
    classes: ['left', 'right', 'feet', 'tongue'],
    tokenOf: { left: 'PREV', right: 'NEXT', feet: 'SELECT', tongue: 'BACK' }
  };
})(typeof window !== 'undefined' ? window : globalThis);
