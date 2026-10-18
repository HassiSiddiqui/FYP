/*
 * SA.dsp.butter — digital Butterworth IIR design returning second-order
 * sections (SOS), a line-by-line port of scipy 1.18:
 *   iirfilter -> buttap -> lp2{lp,hp,bp}_zpk -> bilinear_zpk -> zpk2sos
 * (zpk2sos with pairing='nearest', the digital default).
 *
 *   SA.dsp.butter(N, Wn, opts) -> Array of [b0,b1,b2,a0,a1,a2] rows
 *     N     filter order (bandpass yields N sections, 2N-th order overall)
 *     Wn    number (lowpass/highpass) or [lo, hi] (bandpass), in Hz if
 *           opts.fs is given, else normalised to Nyquist (0..1)
 *     opts  {btype: 'bandpass'|'band'|'lowpass'|'highpass' (default 'bandpass'),
 *            fs: sampling rate (default undefined => Wn normalised)}
 *   SA.dsp.butterZpk(N, Wn, opts) -> {z, p, k}  (complex as {re, im})
 *
 * Equivalent to scipy.signal.butter(N, Wn, btype, fs=fs, output='sos').
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.dsp = SA.dsp || {};

  // ---------- minimal complex arithmetic ({re, im}) ----------
  function C(re, im) { return { re: re, im: im || 0 }; }
  function cadd(a, b) { return C(a.re + b.re, a.im + b.im); }
  function csub(a, b) { return C(a.re - b.re, a.im - b.im); }
  function cmul(a, b) { return C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re); }
  function cscale(a, s) { return C(a.re * s, a.im * s); }
  function cconj(a) { return C(a.re, -a.im); }
  function cabs(a) { return Math.hypot(a.re, a.im); }
  function cdiv(a, b) {
    // Smith's algorithm (stable)
    if (Math.abs(b.re) >= Math.abs(b.im)) {
      var r = b.im / b.re, d = b.re + b.im * r;
      return C((a.re + a.im * r) / d, (a.im - a.re * r) / d);
    }
    var r2 = b.re / b.im, d2 = b.re * r2 + b.im;
    return C((a.re * r2 + a.im) / d2, (a.im * r2 - a.re) / d2);
  }
  function csqrt(a) { // principal branch, like numpy
    if (a.re === 0 && a.im === 0) return C(0, a.im);
    var r = Math.hypot(a.re, a.im), t;
    if (a.re >= 0) { t = Math.sqrt((r + a.re) / 2); return C(t, a.im / (2 * t)); }
    t = Math.sqrt((r - a.re) / 2);
    var im = (a.im < 0 || (a.im === 0 && 1 / a.im < 0)) ? -t : t;
    return C(Math.abs(a.im) / (2 * t), im);
  }
  function isReal(a) { return a.im === 0; } // np.isreal: imag exactly 0

  // ---------- analog prototype + transforms ----------
  function buttap(N) {
    var p = [];
    for (var m = -N + 1; m < N; m += 2) {
      var ang = Math.PI * m / (2 * N);
      p.push(C(-Math.cos(ang), -Math.sin(ang))); // -exp(i*ang)
    }
    return { z: [], p: p, k: 1.0 };
  }

  function lp2lp(zpk, wo) {
    var deg = zpk.p.length - zpk.z.length;
    return { z: zpk.z.map(function (v) { return cscale(v, wo); }),
             p: zpk.p.map(function (v) { return cscale(v, wo); }),
             k: zpk.k * Math.pow(wo, deg) };
  }

  function lp2hp(zpk, wo) {
    var deg = zpk.p.length - zpk.z.length, w = C(wo, 0);
    var z = zpk.z.map(function (v) { return cdiv(w, v); });
    var p = zpk.p.map(function (v) { return cdiv(w, v); });
    for (var i = 0; i < deg; i++) z.push(C(0, 0));
    var num = C(1, 0), den = C(1, 0);
    zpk.z.forEach(function (v) { num = cmul(num, C(-v.re, -v.im)); });
    zpk.p.forEach(function (v) { den = cmul(den, C(-v.re, -v.im)); });
    return { z: z, p: p, k: zpk.k * cdiv(num, den).re };
  }

  function lp2bp(zpk, wo, bw) {
    var deg = zpk.p.length - zpk.z.length, wo2 = C(wo * wo, 0);
    function shift(list) {
      var lo = list.map(function (v) { return cscale(v, bw / 2); });
      var plus = lo.map(function (v) { return cadd(v, csqrt(csub(cmul(v, v), wo2))); });
      var minus = lo.map(function (v) { return csub(v, csqrt(csub(cmul(v, v), wo2))); });
      return plus.concat(minus);
    }
    var z = shift(zpk.z), p = shift(zpk.p);
    for (var i = 0; i < deg; i++) z.push(C(0, 0));
    return { z: z, p: p, k: zpk.k * Math.pow(bw, deg) };
  }

  function bilinear(zpk, fs) {
    var deg = zpk.p.length - zpk.z.length, fs2 = C(2.0 * fs, 0);
    var z = zpk.z.map(function (v) { return cdiv(cadd(fs2, v), csub(fs2, v)); });
    var p = zpk.p.map(function (v) { return cdiv(cadd(fs2, v), csub(fs2, v)); });
    for (var i = 0; i < deg; i++) z.push(C(-1, 0));
    var num = C(1, 0), den = C(1, 0);
    zpk.z.forEach(function (v) { num = cmul(num, csub(fs2, v)); });
    zpk.p.forEach(function (v) { den = cmul(den, csub(fs2, v)); });
    return { z: z, p: p, k: zpk.k * cdiv(num, den).re };
  }

  // ---------- zpk2sos (pairing='nearest') ----------
  // scipy _cplxreal: returns {zc (positive-imag halves), zr (reals)}
  function cplxreal(list) {
    var tol = 100 * 2.220446049250313e-16;
    var z = list.slice().sort(function (a, b) {
      return (a.re - b.re) || (Math.abs(a.im) - Math.abs(b.im));
    });
    var zr = [], cx = [];
    z.forEach(function (v) { if (Math.abs(v.im) <= tol * cabs(v)) zr.push(v.re); else cx.push(v); });
    var zp = cx.filter(function (v) { return v.im > 0; });
    var zn = cx.filter(function (v) { return v.im < 0; });
    if (zp.length !== zn.length) throw new Error('butter: unmatched complex conjugate');
    // runs of (approximately) equal real part: sort each by |imag|
    var i = 0;
    while (i < zp.length) {
      var j = i;
      while (j + 1 < zp.length && (zp[j + 1].re - zp[j].re) <= tol * cabs(zp[j])) j++;
      if (j > i) {
        var byIm = function (a, b) { return Math.abs(a.im) - Math.abs(b.im); };
        var sp = zp.slice(i, j + 1).sort(byIm), sn = zn.slice(i, j + 1).sort(byIm);
        for (var q = i; q <= j; q++) { zp[q] = sp[q - i]; zn[q] = sn[q - i]; }
      }
      i = j + 1;
    }
    var zc = zp.map(function (v, idx) { return cscale(cadd(v, cconj(zn[idx])), 0.5); });
    return zc.concat(zr.map(function (r) { return C(r, 0); }));
  }

  function idxWorst(p) { // digital: closest to the unit circle (first on ties)
    var best = 0, bv = Infinity;
    for (var i = 0; i < p.length; i++) {
      var v = Math.abs(1 - cabs(p[i]));
      if (v < bv) { bv = v; best = i; }
    }
    return best;
  }

  // nearest element of `fro` to `to`, restricted by which: 'any'|'real'|'complex'
  function nearestIdx(fro, to, which) {
    var order = fro.map(function (v, i) { return i; });
    var d = fro.map(function (v) { return cabs(csub(v, to)); });
    order.sort(function (a, b) { return (d[a] - d[b]) || (a - b); });
    for (var k = 0; k < order.length; k++) {
      var v = fro[order[k]];
      if (which === 'any' || (which === 'real') === isReal(v)) return order[k];
    }
    throw new Error('butter: no ' + which + ' zero available');
  }

  function poly(roots) { // numpy.poly via repeated convolution, real part kept
    var a = [C(1, 0)];
    roots.forEach(function (r) {
      var out = [];
      for (var i = 0; i <= a.length; i++) {
        var t = C(0, 0);
        if (i < a.length) t = cadd(t, a[i]);
        if (i > 0) t = cadd(t, cmul(a[i - 1], C(-r.re, -r.im)));
        out.push(t);
      }
      a = out;
    });
    return a.map(function (v) { return v.re; });
  }

  function singleSos(z, p) {
    var row = [0, 0, 0, 0, 0, 0], b = poly(z), a = poly(p), i;
    for (i = 0; i < b.length; i++) row[3 - b.length + i] = b[i];
    for (i = 0; i < a.length; i++) row[6 - a.length + i] = a[i];
    return row;
  }

  function countReal(list) { return list.filter(isReal).length; }

  function zpk2sos(zIn, pIn, k) {
    var z = zIn.slice(), p = pIn.slice();
    while (p.length < z.length) p.push(C(0, 0));
    while (z.length < p.length) z.push(C(0, 0));
    var nSections = Math.floor((Math.max(p.length, z.length) + 1) / 2);
    if (p.length % 2 === 1) { p.push(C(0, 0)); z.push(C(0, 0)); }
    z = cplxreal(z); p = cplxreal(p);
    var sos = new Array(nSections);
    for (var si = nSections - 1; si >= 0; si--) {
      var p1 = p.splice(idxWorst(p), 1)[0], z1, z2, p2;
      if (isReal(p1) && countReal(p) === 0) {
        z1 = z.splice(nearestIdx(z, p1, 'real'), 1)[0];
        sos[si] = singleSos([z1, C(0, 0)], [p1, C(0, 0)]);
      } else if (p.length + 1 === z.length && !isReal(p1) &&
                 countReal(p) === 1 && countReal(z) === 1) {
        z1 = z.splice(nearestIdx(z, p1, 'complex'), 1)[0];
        sos[si] = singleSos([z1, cconj(z1)], [p1, cconj(p1)]);
      } else {
        if (isReal(p1)) {
          var realIdx = [], realVals = [];
          p.forEach(function (v, i) { if (isReal(v)) { realIdx.push(i); realVals.push(v); } });
          p2 = p.splice(realIdx[idxWorst(realVals)], 1)[0];
        } else {
          p2 = cconj(p1);
        }
        if (z.length > 0) {
          z1 = z.splice(nearestIdx(z, p1, 'any'), 1)[0];
          if (!isReal(z1)) {
            sos[si] = singleSos([z1, cconj(z1)], [p1, p2]);
          } else if (z.length > 0) {
            z2 = z.splice(nearestIdx(z, p1, 'real'), 1)[0];
            sos[si] = singleSos([z1, z2], [p1, p2]);
          } else {
            sos[si] = singleSos([z1], [p1, p2]);
          }
        } else {
          sos[si] = singleSos([], [p1, p2]);
        }
      }
    }
    for (var c = 0; c < 3; c++) sos[0][c] *= k;
    return sos;
  }

  // ---------- public design entry ----------
  var BTYPES = { band: 'bandpass', bandpass: 'bandpass', bp: 'bandpass', pass: 'bandpass',
                 low: 'lowpass', lowpass: 'lowpass', lp: 'lowpass',
                 high: 'highpass', highpass: 'highpass', hp: 'highpass' };

  function butterZpk(N, Wn, opts) {
    opts = opts || {};
    var btype = BTYPES[(opts.btype || 'bandpass').toLowerCase()];
    if (!btype) throw new Error('butter: unsupported btype ' + opts.btype);
    if (!(N >= 1 && Math.floor(N) === N)) throw new Error('butter: N must be a positive integer');
    var w = Array.isArray(Wn) ? Wn.slice() : [Wn];
    if (opts.fs != null) w = w.map(function (v) { return v / (opts.fs / 2); });
    w.forEach(function (v) {
      if (!(v > 0 && v < 1)) throw new Error('butter: critical frequencies must satisfy 0 < Wn < fs/2');
    });
    var fsd = 2.0;
    var warped = w.map(function (v) { return 2 * fsd * Math.tan(Math.PI * v / fsd); });
    var zpk = buttap(N);
    if (btype === 'bandpass') {
      if (w.length !== 2 || !(w[0] < w[1])) throw new Error('butter: bandpass needs [lo, hi] with lo < hi');
      zpk = lp2bp(zpk, Math.sqrt(warped[0] * warped[1]), warped[1] - warped[0]);
    } else {
      if (w.length !== 1) throw new Error('butter: ' + btype + ' needs a single Wn');
      zpk = btype === 'lowpass' ? lp2lp(zpk, warped[0]) : lp2hp(zpk, warped[0]);
    }
    return bilinear(zpk, fsd);
  }

  function butter(N, Wn, opts) {
    var zpk = butterZpk(N, Wn, opts);
    return zpk2sos(zpk.z, zpk.p, zpk.k);
  }

  SA.dsp.butter = butter;
  SA.dsp.butterZpk = butterZpk;
  SA.dsp._zpk2sos = zpk2sos;
})(typeof window !== 'undefined' ? window : globalThis);
