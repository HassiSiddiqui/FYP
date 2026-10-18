/*
 * SA.eeg.gcn (EEG) — PyG GCNConv forward with gcn_norm, float64
 * (torch_geometric nn/conv/gcn_conv.py: normalize=True, add_self_loops=True,
 * improved=False -> self-loop fill value 1, flow source_to_target).
 *   forward(x, N, Fin, edges, W, opts) -> Float64Array[N*Fo]
 *     add_remaining_self_loops (weight 1, appended); deg_i = sum_{j->i} w_ji (incl. loop);
 *     dis = deg^-1/2 (inf -> 0); norm_ji = dis_j * w_ji * dis_i;
 *     out_i = sum norm_ji * (x_j W^T), then + bias. lin has no bias.
 *   W = {lin_w [Fo*Fin], bias [Fo]}; opts = {useEdgeWeight} (false -> all w = 1).
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.eeg = SA.eeg || {};
  var gcn = SA.eeg.gcn = SA.eeg.gcn || {};

  gcn.forward = function (x, N, Fin, edges, W, opts) {
    opts = opts || {};
    var Fo = W.bias ? W.bias.length : W.lin_w.length / Fin;
    var useW = opts.useEdgeWeight !== false && !!edges.w;
    var xw = SA.eeg.tensor.linear(x, N, Fin, W.lin_w, null, Fo);
    var src = [], dst = [], w = [], hasLoop = new Uint8Array(N), e, i;
    for (e = 0; e < edges.n; e++) {
      var s = edges.src[e], d = edges.dst[e];
      if (s === d) hasLoop[s] = 1;
      src.push(s); dst.push(d); w.push(useW ? edges.w[e] : 1);
    }
    // add_remaining_self_loops: existing loops keep their weight; missing ones get fill 1
    for (i = 0; i < N; i++) if (!hasLoop[i]) { src.push(i); dst.push(i); w.push(1); }
    var deg = new Float64Array(N);
    for (e = 0; e < src.length; e++) deg[dst[e]] += w[e];
    var dis = new Float64Array(N);
    for (i = 0; i < N; i++) { var v = Math.pow(deg[i], -0.5); dis[i] = v === Infinity ? 0 : v; }
    var out = new Float64Array(N * Fo);
    for (e = 0; e < src.length; e++) {
      var nrm = dis[src[e]] * w[e] * dis[dst[e]], so = src[e] * Fo, doff = dst[e] * Fo;
      for (var f = 0; f < Fo; f++) out[doff + f] += nrm * xw[so + f];
    }
    if (W.bias) for (i = 0; i < N; i++) for (var g = 0; g < Fo; g++) out[i * Fo + g] += W.bias[g];
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
