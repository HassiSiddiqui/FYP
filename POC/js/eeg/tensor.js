/*
 * SA.eeg.tensor (EEG) — float64 dense helpers, row-major (docs/architecture.md §2.2).
 *   linear(x, N, Fin, W, b, Fout) -> Float64Array[N*Fout] = x·Wᵀ + b
 *       (PyTorch Linear weight layout W[Fout*Fin]; b may be null)
 *   relu(a)      in place, returns a
 *   softmax(v)   -> Float64Array (max-subtracted)
 *   argmax(v)    -> int (first on ties)
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.eeg = SA.eeg || {};
  var T = SA.eeg.tensor = SA.eeg.tensor || {};

  T.linear = function (x, N, Fin, W, b, Fout) {
    if (x.length !== N * Fin) throw new Error('tensor.linear: x has ' + x.length + ' != ' + N + 'x' + Fin);
    if (W.length !== Fout * Fin) throw new Error('tensor.linear: W has ' + W.length + ' != ' + Fout + 'x' + Fin);
    var out = new Float64Array(N * Fout);
    for (var n = 0; n < N; n++) {
      var xo = n * Fin, oo = n * Fout;
      for (var o = 0; o < Fout; o++) {
        var wo = o * Fin, s = 0;
        for (var i = 0; i < Fin; i++) s += x[xo + i] * W[wo + i];
        out[oo + o] = b ? s + b[o] : s;
      }
    }
    return out;
  };

  T.relu = function (a) {
    for (var i = 0; i < a.length; i++) if (!(a[i] > 0)) a[i] = 0;
    return a;
  };

  T.softmax = function (v) {
    var m = -Infinity, i, out = new Float64Array(v.length), s = 0;
    for (i = 0; i < v.length; i++) if (v[i] > m) m = v[i];
    for (i = 0; i < v.length; i++) { out[i] = Math.exp(v[i] - m); s += out[i]; }
    for (i = 0; i < v.length; i++) out[i] /= s;
    return out;
  };

  T.argmax = function (v) {
    var k = 0;
    for (var i = 1; i < v.length; i++) if (v[i] > v[k]) k = i;
    return k;
  };

  T.toArray = function (a) { return Array.prototype.slice.call(a); };
})(typeof window !== 'undefined' ? window : globalThis);
