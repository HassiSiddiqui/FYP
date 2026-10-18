/*
 * SA.dsp.fft — float64 complex FFT for ARBITRARY length N.
 *
 *   - N a power of two  -> iterative radix-2 Cooley-Tukey (twiddles computed
 *                          directly with Math.cos/sin, no recurrence drift).
 *   - any other N       -> Bluestein chirp-z: the DFT is rewritten as a
 *                          convolution and evaluated with a power-of-two FFT
 *                          of length M >= 2N-1. The chirp angle uses
 *                          (k*k mod 2N) so it stays exact for large k.
 *
 * Conventions match numpy.fft / scipy.fft:
 *   forward  X[k] = sum_n x[n] exp(-2*pi*i*k*n/N)
 *   inverse  x[n] = (1/N) sum_k X[k] exp(+2*pi*i*k*n/N)
 *
 * API (all inputs: Array or Float64Array; im may be omitted => real input):
 *   SA.dsp.fft(re, im)   -> {re: Float64Array, im: Float64Array}
 *   SA.dsp.ifft(re, im)  -> {re, im}   (scaled by 1/N)
 *   SA.dsp.rfft(x)       -> {re, im} of length floor(N/2)+1 (one-sided)
 *   SA.dsp.fftPlanInfo(N)-> {N, kind: 'radix2'|'bluestein'|'trivial', M}
 * Plans (twiddles, chirps) are cached per N.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.dsp = SA.dsp || {};

  function isPow2(n) { return n > 0 && (n & (n - 1)) === 0; }
  function nextPow2(n) { var m = 1; while (m < n) m *= 2; return m; }

  // ---------------- radix-2 ----------------
  var r2cache = {};
  function radix2Plan(n) {
    if (r2cache[n]) return r2cache[n];
    var half = n >> 1;
    var cos = new Float64Array(half), sin = new Float64Array(half);
    for (var k = 0; k < half; k++) {
      var ang = 2 * Math.PI * k / n;
      cos[k] = Math.cos(ang);
      sin[k] = Math.sin(ang);
    }
    var rev = new Uint32Array(n);
    var bits = 0; while ((1 << bits) < n) bits++;
    for (var i = 0; i < n; i++) {
      var r = 0, v = i;
      for (var b = 0; b < bits; b++) { r = (r << 1) | (v & 1); v >>= 1; }
      rev[i] = r;
    }
    r2cache[n] = { cos: cos, sin: sin, rev: rev };
    return r2cache[n];
  }

  // In-place radix-2 transform on (re, im) Float64Arrays, length power of 2.
  // sign = -1 forward, +1 inverse (unscaled).
  function radix2InPlace(re, im, sign) {
    var n = re.length;
    if (n <= 1) return;
    var plan = radix2Plan(n), rev = plan.rev, cs = plan.cos, sn = plan.sin;
    var i, j, t;
    for (i = 0; i < n; i++) {
      j = rev[i];
      if (j > i) {
        t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (var size = 2; size <= n; size *= 2) {
      var halfsize = size >> 1, step = (n / size) | 0;
      for (var k = 0, tw = 0; k < halfsize; k++, tw += step) {
        var wr = cs[tw], wi = sign * sn[tw];
        for (var a = k; a < n; a += size) {
          var bIdx = a + halfsize;
          var br = re[bIdx], bi = im[bIdx];
          var xr = br * wr - bi * wi;
          var xi = br * wi + bi * wr;
          var ar = re[a], ai = im[a];
          re[bIdx] = ar - xr; im[bIdx] = ai - xi;
          re[a] = ar + xr; im[a] = ai + xi;
        }
      }
    }
  }

  // ---------------- Bluestein ----------------
  var blCache = {};
  function bluesteinPlan(n) {
    if (blCache[n]) return blCache[n];
    var m = nextPow2(2 * n - 1);
    // chirp w[k] = exp(-i*pi*k^2/n); k^2 reduced mod 2n for accuracy
    var wr = new Float64Array(n), wi = new Float64Array(n);
    var twoN = 2 * n;
    for (var k = 0; k < n; k++) {
      var kk = (k * k) % twoN;
      var ang = Math.PI * kk / n;
      wr[k] = Math.cos(ang);
      wi[k] = -Math.sin(ang);
    }
    // b = conj(w), wrapped; precompute its FFT
    var br = new Float64Array(m), bi = new Float64Array(m);
    br[0] = wr[0]; bi[0] = -wi[0];
    for (var j = 1; j < n; j++) {
      br[j] = wr[j]; bi[j] = -wi[j];
      br[m - j] = wr[j]; bi[m - j] = -wi[j];
    }
    radix2InPlace(br, bi, -1);
    blCache[n] = { m: m, wr: wr, wi: wi, Br: br, Bi: bi };
    return blCache[n];
  }

  // Forward DFT via Bluestein (returns new arrays).
  function bluesteinForward(xr, xi) {
    var n = xr.length, p = bluesteinPlan(n), m = p.m;
    var ar = new Float64Array(m), ai = new Float64Array(m);
    var k;
    for (k = 0; k < n; k++) {
      ar[k] = xr[k] * p.wr[k] - xi[k] * p.wi[k];
      ai[k] = xr[k] * p.wi[k] + xi[k] * p.wr[k];
    }
    radix2InPlace(ar, ai, -1);
    for (k = 0; k < m; k++) {
      var r = ar[k] * p.Br[k] - ai[k] * p.Bi[k];
      var i = ar[k] * p.Bi[k] + ai[k] * p.Br[k];
      ar[k] = r; ai[k] = i;
    }
    radix2InPlace(ar, ai, +1);
    var outR = new Float64Array(n), outI = new Float64Array(n);
    for (k = 0; k < n; k++) {
      var cr = ar[k] / m, ci = ai[k] / m;
      outR[k] = cr * p.wr[k] - ci * p.wi[k];
      outI[k] = cr * p.wi[k] + ci * p.wr[k];
    }
    return { re: outR, im: outI };
  }

  function toF64(a, n) {
    var out = new Float64Array(n);
    if (a) for (var i = 0; i < n; i++) out[i] = +a[i];
    return out;
  }

  // Unscaled transform, sign -1 forward / +1 inverse.
  function transform(re, im, sign) {
    var n = re.length;
    if (im && im.length !== n) throw new Error('SA.dsp.fft: re/im length mismatch');
    var xr = toF64(re, n), xi = toF64(im, n);
    if (n === 0) return { re: xr, im: xi };
    if (sign > 0) for (var a = 0; a < n; a++) xi[a] = -xi[a]; // conj trick
    var out;
    if (isPow2(n)) { radix2InPlace(xr, xi, -1); out = { re: xr, im: xi }; }
    else out = bluesteinForward(xr, xi);
    if (sign > 0) for (var b = 0; b < n; b++) out.im[b] = -out.im[b];
    return out;
  }

  function fft(re, im) { return transform(re, im, -1); }

  function ifft(re, im) {
    var out = transform(re, im, +1), n = out.re.length;
    for (var i = 0; i < n; i++) { out.re[i] /= n; out.im[i] /= n; }
    return out;
  }

  function rfft(x) {
    var full = fft(x, null), h = Math.floor(x.length / 2) + 1;
    return { re: full.re.slice(0, h), im: full.im.slice(0, h) };
  }

  function fftPlanInfo(n) {
    if (n <= 1) return { N: n, kind: 'trivial', M: n };
    if (isPow2(n)) return { N: n, kind: 'radix2', M: n };
    return { N: n, kind: 'bluestein', M: nextPow2(2 * n - 1) };
  }

  SA.dsp.fft = fft;
  SA.dsp.ifft = ifft;
  SA.dsp.rfft = rfft;
  SA.dsp.fftPlanInfo = fftPlanInfo;
  SA.dsp._nextPow2 = nextPow2;
})(typeof window !== 'undefined' ? window : globalThis);
