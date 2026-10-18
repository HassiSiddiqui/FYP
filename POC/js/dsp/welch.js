/*
 * SA.dsp.welch — Welch PSD, float64 port of scipy 1.18 scipy.signal.welch
 * (which calls csd -> ShortTimeFFT.spectrogram with p0=0,
 *  p1=(n - noverlap)//hop, i.e. no boundary extension, no zero padding of
 *  the tail: trailing samples that do not fill a whole segment are dropped).
 *
 *   SA.dsp.welch(x, opts) -> {f: Float64Array, Pxx: Float64Array, nseg}
 *     opts.fs        sampling rate (default 1.0)
 *     opts.nperseg   segment length (default 256; clipped to len(x) as scipy)
 *     opts.noverlap  default floor(nperseg/2)
 *     opts.nfft      default nperseg (>= nperseg; zero-padded FFT)
 *     opts.window    'hann' (periodic, = scipy get_window('hann', M), the
 *                    default) | 'hann_sym' | 'boxcar' | Array of weights
 *     opts.detrend   'constant' (default, subtract segment mean) | false
 *     opts.scaling   'density' (default, V^2/Hz) | 'spectrum' (V^2)
 *     opts.onesided  true (default) | false
 *     opts.average   'mean' (default) | 'median' (scipy bias-corrected)
 *
 * Density scaling: P = |FFT(w * (seg - mean))|^2 / (fs * sum(w^2)),
 * one-sided doubling of bins 1..nfft/2-1 (even nfft) or 1..end (odd).
 * Spectrum scaling uses 1/(sum(w))^2 instead.
 *
 * SA.dsp.getWindow(name, M) -> Float64Array
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.dsp = SA.dsp || {};

  function getWindow(name, M) {
    var w = new Float64Array(M), i;
    if (Array.isArray(name) || (name && name.length !== undefined && typeof name !== 'string')) {
      if (name.length !== M) throw new Error('getWindow: window length != nperseg');
      for (i = 0; i < M; i++) w[i] = +name[i];
      return w;
    }
    if (M === 1) { w[0] = 1; return w; }
    if (name === 'hann' || name === 'hann_periodic' || name === 'hanning') {
      // periodic: symmetric window of length M+1 with the last point dropped
      for (i = 0; i < M; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / M);
    } else if (name === 'hann_sym') {
      for (i = 0; i < M; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (M - 1));
    } else if (name === 'boxcar' || name === 'rect') {
      for (i = 0; i < M; i++) w[i] = 1;
    } else {
      throw new Error('getWindow: unsupported window ' + name);
    }
    return w;
  }

  function medianBias(n) { // scipy _median_bias
    var s = 0; // 1 + sum_{k=2,4,..<n} (1/(k+1) - 1/k)
    for (var k = 2; k < n; k += 2) s += 1 / (k + 1) - 1 / k;
    return 1 + s;
  }

  function median(arr) {
    var a = Array.prototype.slice.call(arr).sort(function (p, q) { return p - q; });
    var m = a.length >> 1;
    return a.length % 2 ? a[m] : 0.5 * (a[m - 1] + a[m]);
  }

  function welch(x, opts) {
    opts = opts || {};
    var n = x.length;
    var fs = opts.fs == null ? 1.0 : +opts.fs;
    var nperseg = opts.nperseg == null ? 256 : Math.floor(opts.nperseg);
    if (nperseg < 1) throw new Error('welch: nperseg must be positive');
    if (n < nperseg) nperseg = n; // scipy warns and clips
    var winSpec = opts.window == null ? 'hann' : opts.window;
    var win = getWindow(winSpec, nperseg);
    var nfft = opts.nfft == null ? nperseg : Math.floor(opts.nfft);
    if (nfft < nperseg) throw new Error('welch: nfft must be >= nperseg');
    var noverlap = opts.noverlap == null ? Math.floor(nperseg / 2) : Math.floor(opts.noverlap);
    if (noverlap >= nperseg) throw new Error('welch: noverlap must be < nperseg');
    var detrend = opts.detrend === undefined ? 'constant' : opts.detrend;
    if (detrend !== 'constant' && detrend !== false && detrend !== null) {
      throw new Error("welch: detrend must be 'constant' or false");
    }
    var scaling = opts.scaling || 'density';
    var onesided = opts.onesided !== false;
    var average = opts.average || 'mean';

    var hop = nperseg - noverlap;
    var nseg = Math.floor((n - noverlap) / hop);
    var i, k, s;
    var sumW = 0, sumW2 = 0;
    for (i = 0; i < nperseg; i++) { sumW += win[i]; sumW2 += win[i] * win[i]; }
    var scale;
    if (scaling === 'density') scale = 1 / (fs * sumW2);
    else if (scaling === 'spectrum') scale = 1 / (sumW * sumW);
    else throw new Error("welch: scaling must be 'density' or 'spectrum'");

    var nf = onesided ? Math.floor(nfft / 2) + 1 : nfft;
    // Two real segments are packed into one complex FFT (a + i*b) and
    // separated with the conjugate-symmetry identity:
    //   |A[k]|^2 = |Z[k] + conj(Z[-k])|^2 / 4,  |B[k]|^2 = |Z[k] - conj(Z[-k])|^2 / 4
    var per = []; // per-segment spectra
    var bufRe = new Float64Array(nfft), bufIm = new Float64Array(nfft);
    var end = onesided ? (nfft % 2 === 0 ? nf - 1 : nf) : 0;
    function fillSeg(dst, sIdx) {
      var off = sIdx * hop, mean = 0, j;
      if (detrend === 'constant') {
        for (j = 0; j < nperseg; j++) mean += +x[off + j];
        mean /= nperseg;
      }
      for (j = 0; j < nperseg; j++) dst[j] = (+x[off + j] - mean) * win[j];
    }
    function finish(P) {
      for (var j = 1; j < end; j++) P[j] *= 2;
      per.push(P);
    }
    for (s = 0; s < nseg; s += 2) {
      var pair = s + 1 < nseg;
      bufRe.fill(0); bufIm.fill(0);
      fillSeg(bufRe, s);
      if (pair) fillSeg(bufIm, s + 1);
      var Z = SA.dsp.fft(bufRe, bufIm);
      var Pa = new Float64Array(nf), Pb = pair ? new Float64Array(nf) : null;
      for (k = 0; k < nf; k++) {
        var zr = Z.re[k], zi = Z.im[k];
        if (!pair) { Pa[k] = (zr * zr + zi * zi) * scale; continue; }
        var m = (nfft - k) % nfft, mr = Z.re[m], mi = Z.im[m];
        var ar = zr + mr, ai = zi - mi, br = zi + mi, bi = zr - mr;
        Pa[k] = (ar * ar + ai * ai) * 0.25 * scale;
        Pb[k] = (br * br + bi * bi) * 0.25 * scale;
      }
      finish(Pa);
      if (pair) finish(Pb);
    }

    var Pxx = new Float64Array(nf);
    if (nseg === 1) {
      Pxx.set(per[0]);
    } else if (average === 'mean') {
      for (k = 0; k < nf; k++) {
        var acc = 0;
        for (s = 0; s < nseg; s++) acc += per[s][k];
        Pxx[k] = acc / nseg;
      }
    } else if (average === 'median') {
      var bias = medianBias(nseg), col = new Float64Array(nseg);
      for (k = 0; k < nf; k++) {
        for (s = 0; s < nseg; s++) col[s] = per[s][k];
        Pxx[k] = median(col) / bias;
      }
    } else {
      throw new Error("welch: average must be 'mean' or 'median'");
    }

    var f = new Float64Array(nf);
    for (k = 0; k < nf; k++) {
      // numpy rfftfreq / fftfreq conventions
      var kk = (!onesided && k >= Math.ceil(nfft / 2)) ? k - nfft : k;
      f[k] = kk * fs / nfft;
    }
    return { f: f, Pxx: Pxx, nseg: nseg };
  }

  SA.dsp.welch = welch;
  SA.dsp.getWindow = getWindow;
})(typeof window !== 'undefined' ? window : globalThis);
