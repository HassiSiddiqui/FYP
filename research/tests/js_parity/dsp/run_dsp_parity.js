/*
 * Node parity runner for POC/js/dsp/*.js against scipy references.
 *   node research/tests/js_parity/dsp/run_dsp_parity.js [refJson] [--tol 1e-9]
 * Loads the browser IIFE files with a stub `window`, recomputes every case
 * in dsp_reference.json, and prints per-check errors:
 *   maxAbs  = max |js - ref|
 *   relScale= maxAbs / max|ref|        (pass criterion: <= tol)
 * Writes research/.cache/parity/dsp_parity_report.json. Exit code 1 on failure.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var FYP = path.resolve(__dirname, '..', '..', '..', '..');
var DSP_DIR = path.join(FYP, 'POC', 'js', 'dsp');
var FILES = ['fft.js', 'butterworth.js', 'sosfilt.js', 'welch.js', 'hilbert.js', 'integrate.js'];
var args = process.argv.slice(2);
var tolIdx = args.indexOf('--tol');
var TOL = tolIdx >= 0 ? parseFloat(args[tolIdx + 1]) : 1e-9;
var refPath = args.filter(function (a, i) { return a !== '--tol' && i !== tolIdx + 1; })[0] ||
  path.join(FYP, 'research', '.cache', 'parity', 'dsp_reference.json');

// ---- load browser modules with a stub window ----
var ctx = { window: {}, console: console, Math: Math };
vm.createContext(ctx);
FILES.forEach(function (f) {
  var src = fs.readFileSync(path.join(DSP_DIR, f), 'utf8');
  var lines = src.split('\n').length;
  if (lines > 400) console.warn('WARN ' + f + ' has ' + lines + ' lines (> 400)');
  vm.runInContext(src, ctx, { filename: f });
});
var SA = ctx.window.SA;
['fft', 'ifft', 'butter', 'sosfiltfilt', 'welch', 'hilbert', 'integrate'].forEach(function (k) {
  if (typeof SA.dsp[k] !== 'function') throw new Error('SA.dsp.' + k + ' missing');
});

var ref = JSON.parse(fs.readFileSync(refPath, 'utf8'));
var results = [];

function flat(a, out) {
  out = out || [];
  if (a == null) return out;
  if (typeof a === 'number') { out.push(a); return out; }
  for (var i = 0; i < a.length; i++) flat(a[i], out);
  return out;
}
function compare(name, js, py) {
  var a = flat(js), b = flat(py);
  if (a.length !== b.length) {
    results.push({ name: name, ok: false, err: 'length ' + a.length + ' vs ' + b.length });
    return;
  }
  var maxAbs = 0, scale = 0, bad = false;
  for (var i = 0; i < a.length; i++) {
    if (!isFinite(a[i])) bad = true;
    var d = Math.abs(a[i] - b[i]);
    if (d > maxAbs) maxAbs = d;
    if (Math.abs(b[i]) > scale) scale = Math.abs(b[i]);
  }
  var rel = scale > 0 ? maxAbs / scale : maxAbs;
  results.push({ name: name, n: a.length, maxAbs: maxAbs, maxRef: scale, relScale: rel, ok: !bad && rel <= TOL });
}
function arr(o) { return Array.prototype.slice.call(o); }
function cplxOut(o) { return [arr(o.re), arr(o.im)]; }

var t0 = Date.now();
var X = ref.X;

// ---- FFT ----
ref.fft.forEach(function (c) {
  compare('fft N=' + c.n + ' (' + SA.dsp.fftPlanInfo(c.n).kind + ')', cplxOut(SA.dsp.fft(c.x.re, c.x.im)), [c.fft.re, c.fft.im]);
  compare('ifft N=' + c.n, cplxOut(SA.dsp.ifft(c.x.re, c.x.im)), [c.ifft.re, c.ifft.im]);
});
compare('rfft N=1000', cplxOut(SA.dsp.rfft(ref.rfft.x)), [ref.rfft.out.re, ref.rfft.out.im]);

// ---- Butterworth + sosfiltfilt ----
var agg = {};
function aggregate(key, name, js, py) {
  var before = results.length;
  compare(name, js, py);
  var r = results.pop();
  void before;
  var a = agg[key] || (agg[key] = { name: key, n: 0, maxAbs: 0, maxRef: 0, relScale: 0, ok: true, cases: 0 });
  a.cases++; a.n += r.n || 0;
  a.maxAbs = Math.max(a.maxAbs, r.maxAbs || 0); a.maxRef = Math.max(a.maxRef, r.maxRef || 0);
  a.relScale = Math.max(a.relScale, r.relScale || 0); a.ok = a.ok && r.ok;
  if (!r.ok) { a.failures = a.failures || []; a.failures.push(r); }
}
ref.filters.forEach(function (c) {
  var tag = c.btype + ' N=' + c.order + ' ' + JSON.stringify(c.band);
  var sos = SA.dsp.butter(c.order, c.band, { btype: c.btype, fs: ref.meta.fs });
  var grp = (c.btype === 'bandpass' && !c.rows) ? 'paper bands N=' + c.order : 'extra filters';
  aggregate('butter SOS: ' + grp, tag, sos, c.sos);
  aggregate('sosfilt_zi: ' + grp, tag, SA.dsp.sosfiltZi(c.sos), c.zi);
  if (c.padlen != null && SA.dsp.sosfiltfiltPadlen(c.sos) !== c.padlen) {
    results.push({ name: 'padlen ' + tag, ok: false, err: SA.dsp.sosfiltfiltPadlen(c.sos) + ' vs ' + c.padlen });
  }
  var rows = c.rows ? X.slice(0, c.rows) : X;
  // filter with the JS-designed SOS: end-to-end parity of design + filtering
  var y = rows.map(function (r) { return arr(SA.dsp.sosfiltfilt(sos, r)); });
  aggregate('sosfiltfilt (22x1000): ' + grp, tag, y, c.filtfilt);
});
Object.keys(agg).forEach(function (k) { results.push(agg[k]); });

compare('sosfilt (no zi) 8-12 N=4', arr(SA.dsp.sosfilt(ref.sosfilt_plain.sos, X[0]).y), ref.sosfilt_plain.y);
ref.filtfilt_variants.forEach(function (v) {
  compare('sosfiltfilt padtype=' + v.padtype + ' padlen=' + v.padlen,
    arr(SA.dsp.sosfiltfilt(ref.sosfilt_plain.sos, X[1], { padtype: v.padtype, padlen: v.padlen })), v.y);
});

// ---- Welch ----
ref.welch.forEach(function (c) {
  var kw = c.kw, fOut = null;
  var P = X.map(function (row) {
    var w = SA.dsp.welch(row, { fs: ref.meta.fs, window: 'hann', nperseg: kw.nperseg, noverlap: kw.noverlap,
      nfft: kw.nfft, scaling: kw.scaling, detrend: kw.detrend === undefined ? 'constant' : kw.detrend,
      average: kw.average });
    fOut = w.f;
    return arr(w.Pxx);
  });
  compare('welch f ' + JSON.stringify(kw), arr(fOut), c.f);
  compare('welch Pxx 22ch ' + JSON.stringify(kw), P, c.P);
});

// ---- Hilbert ----
function hil(rows, N) {
  var re = [], im = [];
  rows.forEach(function (r) { var h = SA.dsp.hilbert(r, N); re.push(arr(h.re)); im.push(arr(h.im)); });
  return [re, im];
}
compare('hilbert 22x1000', hil(X), [ref.hilbert.full.re, ref.hilbert.full.im]);
compare('hilbert 2x999 (odd N)', hil(X.slice(0, 2).map(function (r) { return r.slice(0, 999); })),
  [ref.hilbert.odd999.re, ref.hilbert.odd999.im]);
compare('hilbert N=1024 (zero-pad)', hil(X.slice(0, 2), 1024), [ref.hilbert.N1024.re, ref.hilbert.N1024.im]);
var sos812 = SA.dsp.butter(4, [8, 12], { fs: 250 });
var ph = X.map(function (r) { return arr(SA.dsp.instPhase(SA.dsp.sosfiltfilt(sos812, r))); });
(function () { // wrap phase difference into (-pi, pi]
  var a = flat(ph), b = flat(ref.hilbert.bandpassed_phase), m = 0;
  for (var i = 0; i < a.length; i++) {
    var d = a[i] - b[i]; d = Math.atan2(Math.sin(d), Math.cos(d)); m = Math.max(m, Math.abs(d));
  }
  results.push({ name: 'phase of hilbert(bandpass 8-12) 22x1000 [rad]', n: a.length, maxAbs: m,
    maxRef: Math.PI, relScale: m / Math.PI, ok: m / Math.PI <= TOL });
})();

// ---- Integration ----
var integJs = [], integPy = [];
ref.integrate.forEach(function (c) {
  integJs.push(SA.dsp.integrate(c.y, c.x, { method: 'simpson' }), SA.dsp.integrate(c.y, null, { method: 'simpson', dx: 0.7 }),
    SA.dsp.integrate(c.y, c.x, { method: 'trapezoid' }), SA.dsp.integrate(c.y, null, { method: 'trapezoid', dx: 0.7 }));
  integPy.push(c.simpson_x, c.simpson_dx, c.trap_x, c.trap_dx);
});
compare('integrate simpson/trapezoid, N=1..11, x & dx', integJs, integPy);

// ---- Paper pipeline: band power H (22 x 8) ----
Object.keys(ref.bandpower.H).forEach(function (key) {
  var parts = key.split('|');
  var H = X.map(function (row) {
    return ref.bandpower.bands.map(function (b) {
      var y = SA.dsp.sosfiltfilt(SA.dsp.butter(4, b, { fs: 250 }), row);
      var w = SA.dsp.welch(y, { fs: 250, nperseg: 250, noverlap: 125 });
      return SA.dsp.bandPower(w.f, w.Pxx, b[0], b[1], { method: parts[0], edges: parts[1] });
    });
  });
  compare('bandpower H 22x8 [' + key + ']', H, ref.bandpower.H[key]);
});

// ---- report ----
var elapsed = (Date.now() - t0) / 1000;
var fails = results.filter(function (r) { return !r.ok; });
function fmt(v) { return v == null ? '-' : v.toExponential(2); }
console.log('DSP parity vs scipy ' + ref.meta.scipy + ' / numpy ' + ref.meta.numpy + '  tol(relScale)=' + TOL);
console.log('check'.padEnd(64) + 'maxAbs'.padStart(10) + 'relScale'.padStart(10) + '  ok');
results.forEach(function (r) {
  console.log(String(r.name).slice(0, 63).padEnd(64) + fmt(r.maxAbs).padStart(10) + fmt(r.relScale).padStart(10) +
    '  ' + (r.ok ? 'PASS' : 'FAIL' + (r.err ? ' ' + r.err : '')));
});
var worst = results.reduce(function (m, r) { return Math.max(m, r.relScale || 0); }, 0);
var worstAbs = results.reduce(function (m, r) { return Math.max(m, r.maxAbs || 0); }, 0);
console.log('checks: ' + results.length + ', failed: ' + fails.length + ', worst relScale ' + fmt(worst) +
  ', worst maxAbs ' + fmt(worstAbs) + ', js compute time ' + elapsed.toFixed(2) + ' s');
fs.writeFileSync(path.join(path.dirname(refPath), 'dsp_parity_report.json'),
  JSON.stringify({ tol: TOL, meta: ref.meta, results: results, worstRelScale: worst, worstMaxAbs: worstAbs }, null, 1));
process.exit(fails.length ? 1 : 0);
