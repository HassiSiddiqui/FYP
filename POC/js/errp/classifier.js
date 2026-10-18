/* SA.errp.classifier — sLDA forward pass + Platt + prior shift (ADR 0002 D5/D9; docs/architecture.md §2.3).
 *   score = w . x + b
 *   qTr   = 1 / (1 + exp(A*score + B))          (contract convention; research/errp/model.py::platt_contract)
 *   lr    = qTr/(1-qTr) * (1-piTr)/piTr          (Lambda)
 *   q     = Lambda*pi / (Lambda*pi + 1 - pi)     [Saerens02]
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.errp = SA.errp || {};

  function score(x, model) {
    var w = model.w, s = 0;
    if (w.length !== x.length) throw new Error('errp.classifier: |w| = ' + w.length + ' but |x| = ' + x.length);
    for (var i = 0; i < w.length; i++) s += w[i] * x[i];
    return s + model.b;
  }
  function platt(s, model) {
    var p = model.platt || { A: -1, B: 0 };
    return 1 / (1 + Math.exp(p.A * s + p.B));
  }
  function clampP(q) { return Math.min(1 - 1e-15, Math.max(1e-15, q)); }
  function lr(qTr, piTr) { qTr = clampP(qTr); return qTr / (1 - qTr) * (1 - piTr) / piTr; }
  function priorShift(qTr, piTr, pi) {
    var L = lr(qTr, piTr);
    return L * pi / (L * pi + 1 - pi);
  }

  SA.errp.classifier = { score: score, platt: platt, lr: lr, priorShift: priorShift };
})(typeof window !== 'undefined' ? window : globalThis);
