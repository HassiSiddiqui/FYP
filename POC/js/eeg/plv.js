/*
 * SA.eeg.plv (EEG) — phase-locking value graph input (paper Eq. 1; research/sfegat/graph.plv).
 *   compute(X, C, T, opts) -> Float64Array[C*C]
 *     X channel-major X[c*T + t] (µV). Per channel analytic signal (SA.dsp.hilbert),
 *     unit phasor u = a/|a| (0 where |a| = 0), P_ij = |mean_t u_i·conj(u_j)|,
 *     symmetrised 0.5(P + Pᵀ), clipped to [0, 1].
 *     opts = {band: null | [lo, hi], sos}: with a band, x is first filtered with
 *     SA.dsp.sosfiltfilt(opts.sos, x). band null = broadband (paper literal).
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.eeg = SA.eeg || {};
  var plv = SA.eeg.plv = SA.eeg.plv || {};

  plv.phasors = function (X, C, T, opts) {
    opts = opts || {};
    var ur = new Float64Array(C * T), ui = new Float64Array(C * T);
    for (var c = 0; c < C; c++) {
      var x = X.subarray ? X.subarray(c * T, (c + 1) * T) : X.slice(c * T, (c + 1) * T);
      if (opts.band && opts.sos) x = SA.dsp.sosfiltfilt(opts.sos, x);
      var a = SA.dsp.hilbert(x);
      for (var t = 0; t < T; t++) {
        var re = a.re[t], im = a.im[t];
        var mag = Math.sqrt(re * re + im * im); // numpy abs = hypot
        if (mag > 0) { ur[c * T + t] = re / mag; ui[c * T + t] = im / mag; }
      }
    }
    return { re: ur, im: ui };
  };

  plv.compute = function (X, C, T, opts) {
    var u = plv.phasors(X, C, T, opts);
    var ur = u.re, ui = u.im;
    var P = new Float64Array(C * C), i, j, t;
    for (i = 0; i < C; i++) {
      for (j = 0; j < C; j++) {
        // M_ij = sum_t u_i * conj(u_j) / T
        var sr = 0, si = 0, oi = i * T, oj = j * T;
        for (t = 0; t < T; t++) {
          var ar = ur[oi + t], ai = ui[oi + t], br = ur[oj + t], bi = ui[oj + t];
          sr += ar * br + ai * bi;
          si += ai * br - ar * bi;
        }
        sr /= T; si /= T;
        P[i * C + j] = Math.sqrt(sr * sr + si * si);
      }
    }
    var S = new Float64Array(C * C);
    for (i = 0; i < C; i++) {
      for (j = 0; j < C; j++) {
        var v = 0.5 * (P[i * C + j] + P[j * C + i]);
        S[i * C + j] = v < 0 ? 0 : (v > 1 ? 1 : v);
      }
    }
    return S;
  };
})(typeof window !== 'undefined' ? window : globalThis);
