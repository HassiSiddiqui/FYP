/*
 * SA.eeg.gae (EEG) — inner-product decoder + eval-mode evolution mask (paper Eqs. 16-18).
 *   mask(z, N, D, edges, eta) -> {p: Float64Array[E], keep: Uint8Array[E], edges}
 *     p_e = sigmoid(z_src . z_dst) on the existing directed edges (in order);
 *     keep iff p_e > eta (strict; eval threshold eta = 0.5 from the manifest);
 *     edges = kept sub-list (order and weights preserved).
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.eeg = SA.eeg || {};
  var gae = SA.eeg.gae = SA.eeg.gae || {};

  gae.sigmoid = function (v) { return 1 / (1 + Math.exp(-v)); };

  gae.mask = function (z, N, D, edges, eta) {
    if (eta == null) eta = 0.5;
    var p = new Float64Array(edges.n), keep = new Uint8Array(edges.n);
    for (var e = 0; e < edges.n; e++) {
      var a = edges.src[e] * D, b = edges.dst[e] * D, s = 0;
      for (var d = 0; d < D; d++) s += z[a + d] * z[b + d];
      p[e] = gae.sigmoid(s);
      keep[e] = p[e] > eta ? 1 : 0;
    }
    return { p: p, keep: keep, edges: SA.eeg.graph.subset(edges, keep) };
  };
})(typeof window !== 'undefined' ? window : globalThis);
