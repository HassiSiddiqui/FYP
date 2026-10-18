// ErrP JS reference (Node, CommonJS) — research-side check that the exported errp-model.js /
// errp-replay.js are consumable by the browser pipeline described in docs/architecture.md §2.3,
// using the frozen POC/js/dsp/sosfilt.js. Not shipped in POC. Usage:
//   node research/errp/js_reference.js <out.json> [epochIds...]
'use strict';
var vm = require('vm');
var fs = require('fs');
var path = require('path');

var FYP = path.resolve(__dirname, '..', '..');
var ctx = vm.createContext({ console: console, atob: atob, btoa: btoa, Float32Array: Float32Array });
ctx.window = ctx;
['POC/js/dsp/sosfilt.js', 'POC/js/data/errp-model.js', 'POC/js/data/errp-replay.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(FYP, f), 'utf8'), ctx, { filename: f });
});
var SA = ctx.SA;
var m = SA.data.errpModel;

function decodeF32(b64) {
  var buf = Buffer.from(b64, 'base64');
  var n = buf.length / 4, out = new Float64Array(n);
  for (var i = 0; i < n; i++) out[i] = buf.readFloatLE(i * 4);
  return out;
}

function extract(epoch) {
  var C = 64, T = m.nSamples, X = decodeF32(epoch.dataB64), c, t, s;
  var car = new Float64Array(T);
  for (t = 0; t < T; t++) { s = 0; for (c = 0; c < C; c++) s += X[c * T + t]; car[t] = s / C; }
  var Y = new Float64Array(C * T);
  for (c = 0; c < C; c++) {
    var x = new Float64Array(T);
    for (t = 0; t < T; t++) x[t] = X[c * T + t] - car[t];
    var zi = m.ziUnit.map(function (z) { return [z[0] * x[0], z[1] * x[0]]; });
    var y = SA.dsp.sosfilt(m.sos, x, zi).y;
    var bl = 0;
    for (t = m.baseline[0]; t < m.baseline[1]; t++) bl += y[t];
    bl /= (m.baseline[1] - m.baseline[0]);
    for (t = 0; t < T; t++) Y[c * T + t] = y[t] - bl;
  }
  var F = [];
  m.windows.forEach(function (w) {               // window-major, then channel
    m.featureChannels.forEach(function (name) {
      var ci = m.channels.indexOf(name), a = 0;
      for (t = w[0]; t < w[1]; t++) a += Y[ci * T + t];
      F.push(a / (w[1] - w[0]));
    });
  });
  var mn = Infinity;
  for (t = m.fczWindow[0]; t < m.fczWindow[1]; t++) mn = Math.min(mn, Y[m.fczIndex * T + t]);
  return { features: F, fczMinUv: mn };
}

function observe(epoch, pi) {
  var e = extract(epoch), score = m.b;
  for (var i = 0; i < 72; i++) score += m.w[i] * e.features[i];
  var qTr = 1 / (1 + Math.exp(m.platt.A * score + m.platt.B));
  var lam = qTr / (1 - qTr) * (1 - m.piTrain) / m.piTrain;
  var q = lam * pi / (lam * pi + 1 - pi);
  var c = m.costs['light-select'], tStar = c.C_FP / (c.C_FP + c.C_FN - c.C_TP);
  return { epochId: epoch.id, features: e.features, score: score, qTr: qTr, lambda_: lam, q: q, tStar: tStar,
           pi: pi, decision: q > Math.max(tStar, pi) ? 'rollback' : 'keep', fczMinUv: e.fczMinUv };
}

var out = process.argv[2];
var ids = process.argv.slice(3);
var eps = SA.data.errpReplay.epochs.filter(function (e) { return !ids.length || ids.indexOf(e.id) >= 0; });
var pis = [0.10, 0.181, 0.36];
var res = eps.map(function (e) {
  var r = observe(e, 0.181);
  r.at = {};
  pis.forEach(function (p) { var o = observe(e, p); r.at[String(p)] = { q: o.q, decision: o.decision }; });
  return r;
});
fs.writeFileSync(out, JSON.stringify({ stub: m.stub, run: m.run.id, epochs: res }, null, 1));
console.log('ok', res.length);
