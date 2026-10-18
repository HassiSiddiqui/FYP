/*
 * SA.eeg.psdFeatures (EEG) — filter-bank band-power node features (paper Eqs. 6-8;
 * research/sfegat/preprocess.filterbank_psd; ADR 0001 D24/D25).
 *   compute(X, C, T, m, keep?) -> Float64Array[C*B]   H[c*B + k]
 *     m = manifest.features: {bands [[lo,hi]...], sos [B][sections][6], fs, nperseg,
 *          noverlap, window:'hann', integration:'simpson', edges:'closed', log10}
 *     for band k: y = SA.dsp.sosfiltfilt(sos[k], x) (odd pad, scipy default padlen);
 *     {f, Pxx} = SA.dsp.welch(y, {fs, nperseg, noverlap, window:'hann', detrend
 *     'constant', scaling 'density'}); integrate Pxx over the inclusive bins
 *     lo <= f <= hi with Simpson at dx = f[1]-f[0] (= scipy.integrate.simpson(sel, dx=df),
 *     identical to SA.dsp.bandPower on the uniform 1 Hz grid). Units uV^2 (log10 if m.log10).
 *     keep = true -> returns {H, filtered: [B] Float64Array[C*T]} for parity dumps.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.eeg = SA.eeg || {};
  var pf = SA.eeg.psdFeatures = SA.eeg.psdFeatures || {};

  function integrateBand(f, P, lo, hi, method) {
    var sel = [];
    for (var i = 0; i < f.length; i++) if (f[i] >= lo - 1e-9 && f[i] <= hi + 1e-9) sel.push(P[i]);
    if (sel.length < 2) throw new Error('psdFeatures: band [' + lo + ',' + hi + '] has < 2 bins');
    var df = f[1] - f[0], y = Float64Array.from(sel);
    method = method || 'simpson';
    if (method === 'simpson') return SA.dsp.integrate.simpson(y, null, df);
    if (method === 'trapezoid') return SA.dsp.integrate.trapezoid(y, null, df);
    if (method === 'rect') { var s = 0; for (var k = 0; k < y.length; k++) s += y[k]; return s * df; }
    throw new Error('psdFeatures: unknown integration ' + method);
  }
  pf.integrateBand = integrateBand;

  pf.compute = function (X, C, T, m, keep) {
    var bands = m.bands, B = bands.length;
    var fs = m.fs || 250, nperseg = m.nperseg || 250;
    var noverlap = m.noverlap == null ? Math.floor(nperseg / 2) : m.noverlap;
    var H = new Float64Array(C * B), filtered = keep ? [] : null;
    for (var k = 0; k < B; k++) {
      var Yk = keep ? new Float64Array(C * T) : null;
      for (var c = 0; c < C; c++) {
        var x = X.subarray(c * T, (c + 1) * T);
        var y = SA.dsp.sosfiltfilt(m.sos[k], x);
        if (Yk) Yk.set(y, c * T);
        var w = SA.dsp.welch(y, { fs: fs, nperseg: nperseg, noverlap: noverlap, window: m.window || 'hann',
                                  detrend: 'constant', scaling: 'density' });
        var v = integrateBand(w.f, w.Pxx, bands[k][0], bands[k][1], m.integration);
        H[c * B + k] = m.log10 ? Math.log10(v) : v;
      }
      if (keep) filtered.push(Yk);
    }
    if (keep) return { H: H, filtered: filtered };
    return H;
  };
})(typeof window !== 'undefined' ? window : globalThis);
