/*
 * SA.dsp.integrate — 1-D numerical integration + band-power helper.
 *
 *   SA.dsp.integrate(y, x?, opts?) -> number
 *     opts.method: 'simpson' (default) | 'trapezoid'
 *     opts.dx    : sample spacing when x is omitted (default 1.0)
 *   SA.dsp.integrate.simpson(y, x?, dx?)   port of scipy.integrate.simpson
 *   SA.dsp.integrate.trapezoid(y, x?, dx?) port of scipy.integrate.trapezoid
 *
 * What scipy.integrate.simpson (scipy >= 1.11, incl. 1.18) does on the bins:
 *   - N odd (even number of intervals): composite Simpson 1/3 over all
 *     points; for uneven x the per-pair formula
 *       (h0+h1)/6 * [y0*(2 - h1/h0) + y1*(h0+h1)^2/(h0*h1) + y2*(2 - h0/h1)].
 *   - N even (odd number of intervals): Simpson on the first N-1 points
 *     (N-2 intervals) PLUS Cartwright's correction for the last interval:
 *       alpha*y[-1] + beta*y[-2] - eta*y[-3] with
 *       alpha = (2h1^2 + 3h0h1)/(6(h0+h1)), beta = (h1^2 + 3h0h1)/(6h0),
 *       eta = h1^3/(6h0(h0+h1)), h0,h1 = last two spacings.
 *     (The old 'even=avg' option was removed in scipy 1.13.)
 *   - N == 2: plain trapezoid. N == 1: 0 (scipy returns 0 for a single point).
 *   With Welch bins at fs/nperseg = 1 Hz spacing, a band [8,12] Hz selected
 *   inclusively has 5 bins -> pure Simpson 1/3; a half-open [8,12) has 4 bins
 *   -> Simpson + Cartwright tail. The edge convention is a parameter below.
 *
 *   SA.dsp.bandPower(f, P, lo, hi, opts?) -> number
 *     integrates P over bins with lo <= f <= hi (opts.edges='closed', default)
 *     or lo <= f < hi (opts.edges='half-open'); opts.method as above.
 *     Integration uses the selected f values as x (like
 *     simpson(P[mask], x=f[mask])). Returns 0 if no bin is selected.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.dsp = SA.dsp || {};

  function basicSimpson(y, stop, x, dx) { // scipy _basic_simpson(start=0)
    var res = 0, i;
    if (!x) {
      for (i = 0; i < stop; i += 2) res += y[i] + 4.0 * y[i + 1] + y[i + 2];
      return dx / 3.0 * res;
    }
    for (i = 0; i < stop; i += 2) {
      var h0 = x[i + 1] - x[i], h1 = x[i + 2] - x[i + 1];
      var hsum = h0 + h1, hprod = h0 * h1;
      var h0divh1 = h1 !== 0 ? h0 / h1 : 0;
      var inv = h0divh1 !== 0 ? 1 / h0divh1 : 0;
      var mid = hprod !== 0 ? hsum / hprod : 0;
      res += hsum / 6.0 * (y[i] * (2.0 - inv) + y[i + 1] * (hsum * mid) + y[i + 2] * (2.0 - h0divh1));
    }
    return res;
  }

  function simpson(y, x, dx) {
    if (dx == null) dx = 1.0;
    var N = y.length;
    if (x && x.length !== N) throw new Error('simpson: x and y lengths differ');
    if (N === 0) return 0;
    if (N === 1) return 0;
    if (N % 2 === 1) return basicSimpson(y, N - 2, x, dx);
    if (N === 2) {
      var ld = x ? x[1] - x[0] : dx;
      return 0.5 * ld * (y[1] + y[0]);
    }
    var result = basicSimpson(y, N - 3, x, dx);
    var h0 = x ? x[N - 2] - x[N - 3] : dx, h1 = x ? x[N - 1] - x[N - 2] : dx;
    var den = 6 * (h1 + h0);
    var alpha = den !== 0 ? (2 * h1 * h1 + 3 * h0 * h1) / den : 0;
    den = 6 * h0;
    var beta = den !== 0 ? (h1 * h1 + 3.0 * h0 * h1) / den : 0;
    den = 6 * h0 * (h0 + h1);
    var eta = den !== 0 ? (h1 * h1 * h1) / den : 0;
    return result + (alpha * y[N - 1] + beta * y[N - 2] - eta * y[N - 3]);
  }

  function trapezoid(y, x, dx) {
    if (dx == null) dx = 1.0;
    var s = 0;
    for (var i = 1; i < y.length; i++) {
      var d = x ? x[i] - x[i - 1] : dx;
      s += d * (y[i] + y[i - 1]) / 2.0;
    }
    return s;
  }

  function integrate(y, x, opts) {
    opts = opts || {};
    var method = opts.method || 'simpson';
    if (method === 'simpson') return simpson(y, x, opts.dx);
    if (method === 'trapezoid' || method === 'trapz') return trapezoid(y, x, opts.dx);
    throw new Error("integrate: method must be 'simpson' or 'trapezoid'");
  }
  integrate.simpson = simpson;
  integrate.trapezoid = trapezoid;

  function bandPower(f, P, lo, hi, opts) {
    opts = opts || {};
    var halfOpen = opts.edges === 'half-open';
    var xs = [], ys = [];
    for (var i = 0; i < f.length; i++) {
      if (f[i] >= lo && (halfOpen ? f[i] < hi : f[i] <= hi)) { xs.push(f[i]); ys.push(P[i]); }
    }
    if (ys.length === 0) return 0;
    return integrate(ys, xs, { method: opts.method || 'simpson' });
  }

  SA.dsp.integrate = integrate;
  SA.dsp.bandPower = bandPower;
})(typeof window !== 'undefined' ? window : globalThis);
