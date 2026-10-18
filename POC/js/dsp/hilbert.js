/*
 * SA.dsp.hilbert — analytic signal, float64 port of scipy.signal.hilbert:
 *   Xf = fft(x, N); h[0]=1; h[1..N/2-1]=2; h[N/2]=1 (N even) / h[1..(N-1)/2]=2
 *   (N odd); remaining bins zeroed; xa = ifft(Xf * h).
 * Works for any N (N=1000 uses the Bluestein path of SA.dsp.fft).
 *
 *   SA.dsp.hilbert(x, N?) -> {re, im}  (re ~= x, im = Hilbert transform of x)
 *       N optional FFT length (zero-pads / truncates like scipy).
 *   SA.dsp.instPhase(x)   -> Float64Array  atan2(im, re) of the analytic signal
 *   SA.dsp.envelope(x)    -> Float64Array  |analytic signal|
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.dsp = SA.dsp || {};

  function hilbert(x, N) {
    if (N == null) N = x.length;
    if (!(N > 0)) throw new Error('hilbert: N must be positive');
    var buf = new Float64Array(N), i;
    var m = Math.min(N, x.length);
    for (i = 0; i < m; i++) buf[i] = +x[i];
    var X = SA.dsp.fft(buf, null);
    var re = X.re, im = X.im;
    var dblEnd = N % 2 === 0 ? N / 2 : (N + 1) / 2;
    for (i = 1; i < dblEnd; i++) { re[i] *= 2; im[i] *= 2; }
    var zeroStart = N % 2 === 0 ? N / 2 + 1 : (N + 1) / 2;
    for (i = zeroStart; i < N; i++) { re[i] = 0; im[i] = 0; }
    return SA.dsp.ifft(re, im);
  }

  function instPhase(x) {
    var a = hilbert(x), out = new Float64Array(a.re.length);
    for (var i = 0; i < out.length; i++) out[i] = Math.atan2(a.im[i], a.re[i]);
    return out;
  }

  function envelope(x) {
    var a = hilbert(x), out = new Float64Array(a.re.length);
    for (var i = 0; i < out.length; i++) out[i] = Math.hypot(a.re[i], a.im[i]);
    return out;
  }

  SA.dsp.hilbert = hilbert;
  SA.dsp.instPhase = instPhase;
  SA.dsp.envelope = envelope;
})(typeof window !== 'undefined' ? window : globalThis);
