/*
 * SA.eeg.batchnorm (EEG) — BatchNorm1d in eval mode (running statistics).
 *   forward(x, N, F, W) -> Float64Array[N*F]
 *     (x - running_mean) / sqrt(running_var + eps) * weight + bias
 *   W = {weight, bias, running_mean, running_var, eps (manifest bnEps, default 1e-5)}
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.eeg = SA.eeg || {};
  var bn = SA.eeg.batchnorm = SA.eeg.batchnorm || {};

  bn.forward = function (x, N, F, W) {
    var eps = W.eps == null ? 1e-5 : W.eps;
    var out = new Float64Array(N * F), inv = new Float64Array(F), f;
    for (f = 0; f < F; f++) inv[f] = 1 / Math.sqrt(W.running_var[f] + eps);
    for (var n = 0; n < N; n++) {
      for (f = 0; f < F; f++) {
        var k = n * F + f;
        out[k] = (x[k] - W.running_mean[f]) * inv[f] * W.weight[f] + W.bias[f];
      }
    }
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
