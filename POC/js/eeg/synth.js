/*
 * SA.eeg.synth (EEG) — labelled synthetic motor-imagery trials (ADR 0004 D7; Tier 3).
 * NOT real EEG. A pipeline demonstration only: the generator is never tuned against the model.
 *   trial(cls, k) -> {X: Float64Array[22*1000], C:22, T:1000, fs:250, cls, seed, id:'SYN-<cls>-<k>',
 *                     source:'synthetic', meta:{muHz, betaHz, erdChannels, volumeConduction, scaled}}
 *     rng = mulberry32(SA.config.eeg.synth.seed + k)  (same k -> same background for every class,
 *     so class differences are exactly the ERD).
 *   Per channel: 1/f background (white Gaussian shaped by 1/sqrt(f) in the SA.dsp.fft domain)
 *   + mu (10 +- 1 Hz) and beta (20 +- 2 Hz) oscillators with random phase drift;
 *   class ERD = 50 % amplitude reduction of mu/beta on:
 *     left -> C4, C2, C6, FC4, CP4      right -> C3, C1, C5, FC3, CP3
 *     feet -> Cz, FCz, CPz, C1, C2      tongue -> C5, C6, CP3, CP4 (illustrative)
 *   Volume conduction: row-normalised Gaussian kernel (sigma = synth.sigmaMm) on 3-D electrode
 *   distances from SA.data.montage (skipped, and flagged, if the montage is absent).
 *   Scale: one gain per channel = sqrt(median_k(trainBandPowerMedian[c,k] / H_ref[c,k])) where
 *   H_ref are the band powers of a reference (no-ERD) trial; skipped if the norm is absent.
 *   mulberry32(seed) -> () => uniform [0,1)
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.eeg = SA.eeg || {};
  var syn = SA.eeg.synth = SA.eeg.synth || {};

  var CH = ['Fz', 'FC3', 'FC1', 'FCz', 'FC2', 'FC4', 'C5', 'C3', 'C1', 'Cz', 'C2', 'C4', 'C6',
            'CP3', 'CP1', 'CPz', 'CP2', 'CP4', 'P1', 'Pz', 'P2', 'POz'];
  var ERD = { left: ['C4', 'C2', 'C6', 'FC4', 'CP4'], right: ['C3', 'C1', 'C5', 'FC3', 'CP3'],
              feet: ['Cz', 'FCz', 'CPz', 'C1', 'C2'], tongue: ['C5', 'C6', 'CP3', 'CP4'] };
  var C = 22, T = 1000, FS = 250, BG_UV = 6, MU_UV = 8;
  var imul = Math.imul, sqrt = Math.sqrt, log = Math.log, cos = Math.cos, sin = Math.sin, PI = Math.PI;
  syn.channels = CH;
  syn.erdChannels = ERD;

  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = imul(t ^ (t >>> 15), t | 1);
      t ^= t + imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  syn.mulberry32 = mulberry32;

  function gaussFn(rng) {
    return function () {
      var u = 0, v = 0;
      while (u <= 1e-12) u = rng();
      v = rng();
      return sqrt(-2 * log(u)) * cos(2 * PI * v);
    };
  }

  function cfg() { return (SA.config && SA.config.eeg && SA.config.eeg.synth) || { seed: 20261015, sigmaMm: 30 }; }

  function spatialWeight(name) {
    if (/^C[1-6z]$/.test(name)) return 1.0;
    if (/^(FC|CP)/.test(name)) return 0.7;
    return 0.4;
  }

  function pinkNoise(gauss) {
    var re = new Float64Array(T), im = new Float64Array(T), i;
    for (i = 0; i < T; i++) re[i] = gauss();
    var F = SA.dsp.fft(re, im);
    for (i = 0; i < T; i++) {
      var f = Math.min(i, T - i) * FS / T;
      var g = i === 0 ? 0 : 1 / Math.sqrt(Math.max(f, 1));
      F.re[i] *= g; F.im[i] *= g;
    }
    var x = SA.dsp.ifft(F.re, F.im).re, s = 0;
    for (i = 0; i < T; i++) s += x[i] * x[i];
    var rms = Math.sqrt(s / T) || 1, out = new Float64Array(T);
    for (i = 0; i < T; i++) out[i] = x[i] / rms * BG_UV;
    return out;
  }

  var kernelCache = null;
  function kernel() {
    if (kernelCache) return kernelCache;
    var mont = SA.data && SA.data.montage && SA.data.montage.channels;
    if (!mont) return null;
    var pos = {};
    mont.forEach(function (m) { pos[m.name] = m.pos3dMm; });
    if (!CH.every(function (n) { return pos[n] && pos[n].length === 3; })) return null;
    var sig = cfg().sigmaMm || 30, K = new Float64Array(C * C);
    for (var i = 0; i < C; i++) {
      var s = 0;
      for (var j = 0; j < C; j++) {
        var a = pos[CH[i]], b = pos[CH[j]];
        var d2 = (a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]) + (a[2] - b[2]) * (a[2] - b[2]);
        K[i * C + j] = Math.exp(-d2 / (2 * sig * sig)); s += K[i * C + j];
      }
      for (j = 0; j < C; j++) K[i * C + j] /= s;
    }
    kernelCache = K;
    return K;
  }

  function raw(cls, k) {
    var seed = (cfg().seed + k) >>> 0, rng = mulberry32(seed), gauss = gaussFn(rng);
    var muHz = 10 + (2 * rng() - 1), betaHz = 20 + 2 * (2 * rng() - 1);
    var erd = {};
    (ERD[cls] || []).forEach(function (n) { erd[n] = true; });
    var S = new Float64Array(C * T);
    for (var c = 0; c < C; c++) {
      var bg = pinkNoise(gauss), w = spatialWeight(CH[c]), att = erd[CH[c]] ? 0.5 : 1.0;
      var pm = 2 * Math.PI * rng(), pb = 2 * Math.PI * rng();
      var am = MU_UV * w * att, ab = 0.5 * MU_UV * w * att, dm = 2 * PI * muHz / FS, db = 2 * PI * betaHz / FS;
      for (var t = 0; t < T; t++) {
        pm += dm + 0.05 * gauss();
        pb += db + 0.05 * gauss();
        S[c * T + t] = bg[t] + am * sin(pm) + ab * sin(pb);
      }
    }
    var K = kernel(), X = S;
    if (K) {
      X = new Float64Array(C * T);
      for (var i = 0; i < C; i++) for (var j = 0; j < C; j++) {
        var kij = K[i * C + j];
        if (kij < 1e-6) continue;
        for (var u = 0; u < T; u++) X[i * T + u] += kij * S[j * T + u];
      }
    }
    return { X: X, seed: seed, muHz: muHz, betaHz: betaHz, vc: !!K };
  }

  var gainCache = null;
  function gains() {
    if (gainCache) return gainCache;
    var w = SA.data && SA.data.sfegatWeights, man = w && w.manifest;
    var target = man && man.norm && man.norm.trainBandPowerMedian;
    if (!man || !target || target.length !== C * man.features.bands.length) return null;
    var feat = {};
    for (var key in man.features) feat[key] = man.features[key];
    if (feat.fs == null) feat.fs = man.fs;
    var B = feat.bands.length, ref = raw(null, -1);
    var H = SA.eeg.psdFeatures.compute(ref.X, C, T, feat), g = new Float64Array(C);
    for (var c = 0; c < C; c++) {
      var r = [];
      for (var b = 0; b < B; b++) if (H[c * B + b] > 0 && target[c * B + b] > 0) r.push(target[c * B + b] / H[c * B + b]);
      r.sort(function (a, b2) { return a - b2; });
      var med = r.length ? (r.length % 2 ? r[(r.length - 1) / 2] : 0.5 * (r[r.length / 2 - 1] + r[r.length / 2])) : 1;
      g[c] = Math.sqrt(med);
    }
    gainCache = g;
    return g;
  }

  syn.trial = function (cls, k) {
    k = k | 0;
    var r = raw(cls, k), g = gains(), X = r.X;
    if (g) for (var c = 0; c < C; c++) for (var t = 0; t < T; t++) X[c * T + t] *= g[c];
    return { X: X, C: C, T: T, fs: FS, cls: cls, seed: r.seed, id: 'SYN-' + cls + '-' + k, source: 'synthetic',
             meta: { muHz: r.muHz, betaHz: r.betaHz, erdChannels: (ERD[cls] || []).slice(),
                     volumeConduction: r.vc, scaled: !!g, illustrative: cls === 'tongue' } };
  };

  syn.resetCaches = function () { kernelCache = null; gainCache = null; };
})(typeof window !== 'undefined' ? window : globalThis);
