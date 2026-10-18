/* SA.errp.features — browser ErrP feature extraction, identical to research/errp/{preprocess,features}.py
 * (ADR 0002 D4/D5/D24; docs/architecture.md §2.3).
 *   raw (64 x 922 µV, channel-major) -> CAR over all channels -> causal SA.dsp.sosfilt(model.sos) with
 *   zi = model.ziUnit * x[0] per channel -> subtract mean of model.baseline [b0,b1) -> mean of each of
 *   9 model.windows [w0,w1) on the 8 model.featureChannelIndex channels -> 72 features in model.featureOrder.
 *   fczMinUv = min of the preprocessed FCz over model.fczWindow [i0,i1) (descriptive only, D20).
 * float64 throughout.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.errp = SA.errp || {};

  var cache = {};   // epoch id -> Float64Array raw (decoded once)

  function decodeF32(str) {
    if (SA.core && SA.core.b64 && SA.core.b64.decodeF32) return SA.core.b64.decodeF32(str);
    var bin = (typeof atob === 'function') ? atob(str) : Buffer.from(str, 'base64').toString('binary');
    var n = bin.length, u8 = new Uint8Array(n);
    for (var i = 0; i < n; i++) u8[i] = bin.charCodeAt(i);
    var dv = new DataView(u8.buffer), m = n >> 2, out = new Float64Array(m);
    for (var j = 0; j < m; j++) out[j] = dv.getFloat32(j * 4, true);
    return out;
  }

  function rawOf(epoch) {
    if (epoch.X) return epoch.X;
    var key = epoch.id;
    if (key && cache[key]) return cache[key];
    var data = epoch.dataB64;
    if (Array.isArray(data)) data = data.join('');
    if (typeof data !== 'string') throw new Error('errp.features: epoch has no dataB64/X');
    var x = decodeF32(data);
    if (key) cache[key] = x;
    return x;
  }

  function nChannels(model) { return model.nChannels || (model.channels ? model.channels.length : 64); }

  /* Full pipeline -> preprocessed Float64Array[C*T]. */
  function preprocess(X, model) {
    var C = nChannels(model), T = model.nSamples, c, t;
    if (X.length !== C * T) throw new Error('errp.features: expected ' + C + 'x' + T + ' samples, got ' + X.length);
    var out = new Float64Array(C * T);
    // 1. CAR over all channels
    var mean = new Float64Array(T);
    for (c = 0; c < C; c++) for (t = 0; t < T; t++) mean[t] += X[c * T + t];
    for (t = 0; t < T; t++) mean[t] /= C;
    var b0 = model.baseline[0], b1 = model.baseline[1];
    var row = new Float64Array(T);
    for (c = 0; c < C; c++) {
      for (t = 0; t < T; t++) row[t] = X[c * T + t] - mean[t];
      // 2. causal filter with step-steady-state zi scaled by x[0]
      var x0 = row[0];
      var zi = model.ziUnit.map(function (z) { return [z[0] * x0, z[1] * x0]; });
      var y = SA.dsp.sosfilt(model.sos, row, zi).y;
      // 3. baseline
      var s = 0;
      for (t = b0; t < b1; t++) s += y[t];
      var bl = s / (b1 - b0);
      for (t = 0; t < T; t++) out[c * T + t] = y[t] - bl;
    }
    return out;
  }

  function channelMajor(model) { return /^\s*channel-major/i.test(String(model.featureOrder || '')); }

  function featuresFromPre(P, model) {
    var T = model.nSamples, chs = model.featureChannelIndex, wins = model.windows;
    var nC = chs.length, nW = wins.length, x = new Float64Array(nC * nW), cm = channelMajor(model);
    for (var ci = 0; ci < nC; ci++) {
      var base = chs[ci] * T;
      for (var k = 0; k < nW; k++) {
        var a = wins[k][0], b = wins[k][1], s = 0;
        for (var t = a; t < b; t++) s += P[base + t];
        x[cm ? ci * nW + k : k * nC + ci] = s / (b - a);
      }
    }
    return x;
  }

  function fczMin(P, model) {
    var T = model.nSamples, base = model.fczIndex * T, w = model.fczWindow, m = Infinity;
    for (var t = w[0]; t < w[1]; t++) if (P[base + t] < m) m = P[base + t];
    return m;
  }

  function extract(epoch, model) {
    model = model || (SA.data && SA.data.errpModel);
    if (!model) throw new Error('errp.features: SA.data.errpModel missing');
    var P = preprocess(rawOf(epoch), model);
    return { x: featuresFromPre(P, model), fczMinUv: fczMin(P, model) };
  }

  SA.errp.features = { extract: extract, preprocess: preprocess, featuresFromPre: featuresFromPre,
    fczMin: fczMin, rawOf: rawOf, decodeF32: decodeF32,
    clearCache: function () { cache = {}; } };
})(typeof window !== 'undefined' ? window : globalThis);
