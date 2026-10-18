/*
 * SA.eeg.graph (EEG) — z-scored, thresholded PLV adjacency (paper Eqs. 2-5;
 * research/sfegat/graph.zscore_threshold; ADR 0001).
 *   build(P, C, opts) -> {Z, mask, edges, mu, sd}
 *     Whole-matrix z-score INCLUDING the diagonal (mean and population std, ddof 0,
 *     over all C² entries), Z = (P - mu)/(sd + eps), diag set to 0;
 *     mask = Z > tau (strict; opts.cmp '>=' for the non-strict variant), diag false.
 *     edges = {src: Int32Array, dst: Int32Array, w: Float64Array, n} in ROW-MAJOR
 *     order of the mask (src = row, dst = col; PyG edge_index[0] = src).
 *     w = Z[src,dst] when opts.weighted !== false, else 1.
 *   opts = {tau: 0.3, eps: 1e-8, cmp: '>', weighted: true} (manifest.graph)
 *   subset(edges, keep) -> edges restricted to keep[e] = 1 (order preserved).
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.eeg = SA.eeg || {};
  var g = SA.eeg.graph = SA.eeg.graph || {};

  g.zscore = function (P, C, eps) {
    var n = C * C, i, mu = 0, v = 0;
    for (i = 0; i < n; i++) mu += P[i];
    mu /= n;
    for (i = 0; i < n; i++) { var d = P[i] - mu; v += d * d; }
    var sd = Math.sqrt(v / n);
    var Z = new Float64Array(n);
    for (i = 0; i < n; i++) Z[i] = (P[i] - mu) / (sd + eps);
    for (i = 0; i < C; i++) Z[i * C + i] = 0;
    return { Z: Z, mu: mu, sd: sd };
  };

  g.build = function (P, C, opts) {
    opts = opts || {};
    var tau = opts.tau == null ? 0.3 : +opts.tau;
    var eps = opts.eps == null ? 1e-8 : +opts.eps;
    var strict = (opts.cmp || '>') === '>';
    var weighted = opts.weighted !== false;
    var zs = g.zscore(P, C, eps), Z = zs.Z;
    var mask = new Uint8Array(C * C), src = [], dst = [], w = [];
    for (var i = 0; i < C; i++) {
      for (var j = 0; j < C; j++) {
        if (i === j) continue;
        var z = Z[i * C + j];
        if (strict ? z > tau : z >= tau) {
          mask[i * C + j] = 1; src.push(i); dst.push(j); w.push(weighted ? z : 1);
        }
      }
    }
    return { Z: Z, mask: mask, mu: zs.mu, sd: zs.sd,
             edges: { src: Int32Array.from(src), dst: Int32Array.from(dst), w: Float64Array.from(w), n: src.length } };
  };

  g.subset = function (edges, keep) {
    var src = [], dst = [], w = [];
    for (var e = 0; e < edges.n; e++) {
      if (keep[e]) { src.push(edges.src[e]); dst.push(edges.dst[e]); w.push(edges.w ? edges.w[e] : 1); }
    }
    return { src: Int32Array.from(src), dst: Int32Array.from(dst), w: Float64Array.from(w), n: src.length };
  };

  g.toPlain = function (edges) {
    return { src: Array.prototype.slice.call(edges.src), dst: Array.prototype.slice.call(edges.dst),
             w: Array.prototype.slice.call(edges.w), n: edges.n };
  };
})(typeof window !== 'undefined' ? window : globalThis);
