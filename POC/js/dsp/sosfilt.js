/*
 * SA.dsp.sosfilt / sosfiltZi / sosfiltfilt — float64 ports of scipy 1.18
 * scipy.signal.sosfilt, sosfilt_zi (via lfilter_zi) and sosfiltfilt.
 *
 *   SA.dsp.sosfilt(sos, x, zi?) -> {y: Float64Array, zf: Array<[z0,z1]>}
 *       Cascade of transposed direct-form-II biquads (scipy's kernel).
 *       zi: optional per-section state [[z0,z1], ...] (default zeros).
 *   SA.dsp.sosfiltZi(sos) -> Array<[z0,z1]>  (step-response steady state)
 *   SA.dsp.sosfiltfilt(sos, x, opts?) -> Float64Array  (zero-phase)
 *       opts.padtype: 'odd' (default) | 'even' | 'constant' | null
 *       opts.padlen : integer or null (default null => scipy's default)
 *
 * scipy default padding (padlen=None) for sosfiltfilt:
 *   ntaps  = 2*n_sections + 1
 *            - min( #(sos[:,2]==0), #(sos[:,5]==0) )
 *   edge   = 3 * ntaps
 *   e.g. butter(4,[8,12],'band',fs=250) has 4 sections, no zero b2/a2
 *        -> ntaps = 9 -> edge = 27 samples of odd extension per side.
 *   The input must be longer than edge (scipy raises otherwise).
 * Then: zi = sosfilt_zi(sos); forward pass with zi * ext[0];
 *       backward pass on the reversed output with zi * y[-1];
 *       reverse and trim `edge` samples from both ends.
 *
 * SA.dsp.sosfiltfiltRows(sos, X, opts) applies it to each row of a 2-D array.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.dsp = SA.dsp || {};

  function normSection(s) {
    var a0 = s[3];
    if (a0 === 1) return s;
    if (a0 === 0) throw new Error('sosfilt: a0 must be non-zero');
    return [s[0] / a0, s[1] / a0, s[2] / a0, 1, s[4] / a0, s[5] / a0];
  }

  function sosfilt(sos, x, zi) {
    var n = x.length, y = new Float64Array(n), i;
    for (i = 0; i < n; i++) y[i] = +x[i];
    var zf = [];
    for (var s = 0; s < sos.length; s++) {
      var c = normSection(sos[s]);
      var b0 = c[0], b1 = c[1], b2 = c[2], a1 = c[4], a2 = c[5];
      var z0 = zi ? zi[s][0] : 0, z1 = zi ? zi[s][1] : 0;
      for (i = 0; i < n; i++) {
        var xn = y[i];
        var yn = b0 * xn + z0;
        z0 = b1 * xn - a1 * yn + z1;
        z1 = b2 * xn - a2 * yn;
        y[i] = yn;
      }
      zf.push([z0, z1]);
    }
    return { y: y, zf: zf };
  }

  // scipy lfilter_zi for one biquad: zi = flip(cumsum(flip(b - y_inf*a)))[1:]
  function lfilterZi3(b, a) {
    if (a[0] !== 1) {
      var a0 = a[0];
      b = [b[0] / a0, b[1] / a0, b[2] / a0];
      a = [1, a[1] / a0, a[2] / a0];
    }
    var sumA = a[0] + a[1] + a[2];
    if (sumA === 0) throw new Error('sosfiltZi: pole at z = 1');
    var yInf = (b[0] + b[1] + b[2]) / sumA;
    var c1 = b[1] - yInf * a[1], c2 = b[2] - yInf * a[2];
    return [c2 + c1, c2];
  }

  function sosfiltZi(sos) {
    var zi = [], scale = 1.0;
    for (var s = 0; s < sos.length; s++) {
      var b = [sos[s][0], sos[s][1], sos[s][2]], a = [sos[s][3], sos[s][4], sos[s][5]];
      var z = lfilterZi3(b, a);
      zi.push([scale * z[0], scale * z[1]]);
      scale *= (b[0] + b[1] + b[2]) / (a[0] + a[1] + a[2]);
    }
    return zi;
  }

  function defaultPadlen(sos) {
    var zb = 0, za = 0;
    for (var s = 0; s < sos.length; s++) {
      if (sos[s][2] === 0) zb++;
      if (sos[s][5] === 0) za++;
    }
    var ntaps = 2 * sos.length + 1 - Math.min(zb, za);
    return 3 * ntaps;
  }

  // scipy odd_ext / even_ext / const_ext
  function extend(x, n, padtype) {
    var len = x.length, out = new Float64Array(len + 2 * n), i;
    if (n > len - 1) throw new Error('sosfiltfilt: extension length ' + n + ' too big for signal of length ' + len);
    var first = +x[0], last = +x[len - 1];
    for (i = 0; i < n; i++) {
      var l = +x[n - i], r = +x[len - 2 - i]; // mirror samples (excluding endpoints)
      if (padtype === 'odd') { out[i] = 2 * first - l; out[len + n + i] = 2 * last - r; }
      else if (padtype === 'even') { out[i] = l; out[len + n + i] = r; }
      else { out[i] = first; out[len + n + i] = last; }
    }
    for (i = 0; i < len; i++) out[n + i] = +x[i];
    return out;
  }

  function sosfiltfilt(sos, x, opts) {
    opts = opts || {};
    var padtype = opts.padtype === undefined ? 'odd' : opts.padtype;
    if (padtype !== null && ['odd', 'even', 'constant'].indexOf(padtype) < 0) {
      throw new Error("sosfiltfilt: padtype must be 'odd', 'even', 'constant' or null");
    }
    var edge = padtype === null ? 0 : (opts.padlen == null ? defaultPadlen(sos) : opts.padlen);
    if (x.length <= edge) {
      throw new Error('sosfiltfilt: input length must be greater than padlen (' + edge + ')');
    }
    var ext = (padtype !== null && edge > 0) ? extend(x, edge, padtype) : Float64Array.from(x);
    var zi = sosfiltZi(sos), n = ext.length, i;
    var x0 = ext[0];
    var fwd = sosfilt(sos, ext, zi.map(function (z) { return [z[0] * x0, z[1] * x0]; })).y;
    var y0 = fwd[n - 1];
    var rev = new Float64Array(n);
    for (i = 0; i < n; i++) rev[i] = fwd[n - 1 - i];
    var bwd = sosfilt(sos, rev, zi.map(function (z) { return [z[0] * y0, z[1] * y0]; })).y;
    var outLen = n - 2 * edge, out = new Float64Array(outLen);
    for (i = 0; i < outLen; i++) out[i] = bwd[n - 1 - edge - i];
    return out;
  }

  function sosfiltfiltRows(sos, X, opts) {
    return X.map(function (row) { return sosfiltfilt(sos, row, opts); });
  }

  SA.dsp.sosfilt = sosfilt;
  SA.dsp.sosfiltZi = sosfiltZi;
  SA.dsp.sosfiltfilt = sosfiltfilt;
  SA.dsp.sosfiltfiltRows = sosfiltfiltRows;
  SA.dsp.sosfiltfiltPadlen = defaultPadlen;
})(typeof window !== 'undefined' ? window : globalThis);
