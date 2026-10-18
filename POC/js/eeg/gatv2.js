/*
 * SA.eeg.gatv2 (EEG) — PyG GATv2Conv forward, float64 (torch_geometric
 * nn/conv/gatv2_conv.py: GATv2Conv(Fin, Fo, heads=H, concat=True, negative_slope=0.2,
 * add_self_loops=True, share_weights=False, bias=True; dropout inactive in eval)).
 *   forward(x, N, Fin, edges, W, opts) -> Float64Array[N*H*Fo]
 *     Self loops: remove_self_loops, then one loop per node appended after the edges.
 *     xl = lin_l(x), xr = lin_r(x), viewed [N, H, Fo].
 *     Edge j->i (j = src, i = dst), head h: e = sum_f att[h,f] * leakyReLU(xl_j + xr_i).
 *     alpha = PyG softmax over edges sharing target i: exp(e - max) / (sum + 1e-16).
 *     out_i[h] = sum alpha * xl_j[h]; heads concatenated; + bias.
 *   W = {lin_l_w, lin_l_b, lin_r_w, lin_r_b, att [H*Fo], bias [H*Fo]}
 *   opts = {heads, outPerHead, negativeSlope}
 *   forwardTrace(...) -> {out, alpha [E'*H], edges (with self loops)}
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.eeg = SA.eeg || {};
  var gat = SA.eeg.gatv2 = SA.eeg.gatv2 || {};

  function withSelfLoops(edges, N) {
    var src = [], dst = [];
    for (var e = 0; e < edges.n; e++) {
      if (edges.src[e] !== edges.dst[e]) { src.push(edges.src[e]); dst.push(edges.dst[e]); }
    }
    for (var i = 0; i < N; i++) { src.push(i); dst.push(i); }
    return { src: src, dst: dst, n: src.length };
  }
  gat.withSelfLoops = withSelfLoops;

  gat.forwardTrace = function (x, N, Fin, edges, W, opts) {
    var H = opts.heads, Fo = opts.outPerHead, ns = opts.negativeSlope == null ? 0.2 : opts.negativeSlope;
    var HF = H * Fo, lin = SA.eeg.tensor.linear;
    var xl = lin(x, N, Fin, W.lin_l_w, W.lin_l_b, HF);
    var xr = lin(x, N, Fin, W.lin_r_w, W.lin_r_b, HF);
    var E = withSelfLoops(edges, N), nE = E.n, e, h, f, k;
    var score = new Float64Array(nE * H);
    for (e = 0; e < nE; e++) {
      var oj = E.src[e] * HF, oi = E.dst[e] * HF;
      for (h = 0; h < H; h++) {
        var s = 0, ho = h * Fo;
        for (f = 0; f < Fo; f++) {
          var v = xl[oj + ho + f] + xr[oi + ho + f];
          if (v < 0) v = v * ns;
          s += v * W.att[ho + f];
        }
        score[e * H + h] = s;
      }
    }
    var mx = new Float64Array(N * H).fill(-Infinity), sum = new Float64Array(N * H);
    for (e = 0; e < nE; e++) for (h = 0; h < H; h++) {
      k = E.dst[e] * H + h;
      if (score[e * H + h] > mx[k]) mx[k] = score[e * H + h];
    }
    var alpha = new Float64Array(nE * H);
    for (e = 0; e < nE; e++) for (h = 0; h < H; h++) {
      k = E.dst[e] * H + h;
      var a = Math.exp(score[e * H + h] - mx[k]);
      alpha[e * H + h] = a; sum[k] += a;
    }
    for (e = 0; e < nE; e++) for (h = 0; h < H; h++) alpha[e * H + h] /= (sum[E.dst[e] * H + h] + 1e-16);
    var out = new Float64Array(N * HF);
    for (e = 0; e < nE; e++) {
      var sj = E.src[e] * HF, di = E.dst[e] * HF;
      for (h = 0; h < H; h++) {
        var al = alpha[e * H + h], b0 = h * Fo;
        for (f = 0; f < Fo; f++) out[di + b0 + f] += al * xl[sj + b0 + f];
      }
    }
    if (W.bias) for (var n = 0; n < N; n++) for (f = 0; f < HF; f++) out[n * HF + f] += W.bias[f];
    return { out: out, alpha: alpha, edges: E };
  };

  gat.forward = function (x, N, Fin, edges, W, opts) {
    return gat.forwardTrace(x, N, Fin, edges, W, opts).out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
