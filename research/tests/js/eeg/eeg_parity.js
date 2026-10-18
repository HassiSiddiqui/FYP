#!/usr/bin/env node
/*
 * EEG JS <-> PyTorch parity (EEG builder; ADR 0001 D27 tolerances).
 *   1. research/.venv/Scripts/python.exe research/tests/js/eeg/make_eeg_parity.py
 *   2. node research/tests/js/eeg/eeg_parity.js        (prints a table, exit 1 on failure)
 * Loads POC core + dsp + eeg scripts (index.html order) in a vm context, runs
 * SA.eeg.sfegat on each reference trial for every reference model and compares every stage.
 * Report: research/.cache/parity/eeg_js_report.json
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { loadPOC } = require('../run_node.js');

const PAR = path.resolve(__dirname, '..', '..', '..', '.cache', 'parity');
const TOL = { rel: 1e-9, pAbs: 1e-9, logitsAbs: 1e-4, probsAbs: 1e-6 };

function maxAbs(a) { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i])); return m; }
function maxDiff(a, b) {
  if (a.length !== b.length) return Infinity;
  let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m;
}
function sameEdges(js, py) {
  if (js.n !== py.n) return false;
  for (let e = 0; e < js.n; e++) if (js.src[e] !== py.src[e] || js.dst[e] !== py.dst[e]) return false;
  return true;
}

function run() {
  const r = loadPOC({ only: ['js/core/', 'js/config/eeg.js', 'js/dsp/', 'js/eeg/'], allowMissing: true, quiet: true });
  if (r.errors.length) throw new Error('load errors: ' + JSON.stringify(r.errors));
  const SA = r.SA;
  const trials = JSON.parse(fs.readFileSync(path.join(PAR, 'eeg_trials.json'), 'utf8'));
  const ref = JSON.parse(fs.readFileSync(path.join(PAR, 'eeg_ref.json'), 'utf8'));
  const rows = [], fails = [];
  for (const tag of Object.keys(ref)) {
    const data = JSON.parse(fs.readFileSync(path.join(PAR, 'eeg_weights_' + tag + '.json'), 'utf8'));
    const model = SA.eeg.sfegat.load(data);
    for (const tr of trials) {
      const R = ref[tag][tr.id];
      const X = SA.core.b64.decodeF32(tr.b64);
      const out = SA.eeg.sfegat.forward(model, X, tr.C, tr.T);
      const st = out.stages, row = { model: tag, trial: tr.id, ms: +out.elapsedMs.toFixed(1) };
      const rel = (k) => maxDiff(st[k], R[k]) / Math.max(maxAbs(R[k]), 1e-300);
      ['H', 'P', 'Z', 'h0', 'h1', 'h2', 'h3', 'z1', 'z2', 'z3', 'cls', 'g'].forEach((k) => { row['rel_' + k] = rel(k); });
      row.abs_p = Math.max(maxDiff(st.p1, R.p1), maxDiff(st.p2, R.p2), maxDiff(st.p3, R.p3));
      row.edgesIdentical = out.graphs.every((g, i) => sameEdges(g, R.edges[i]));
      row.edgeWeightsAbs = Math.max.apply(null, out.graphs.map((g, i) => maxDiff(g.w, R.edges[i].w)));
      row.edgeCounts = out.edgeCounts.join('/');
      row.abs_logits = maxDiff(out.logits, R.logits);
      row.abs_logits_vs_model_forward = maxDiff(out.logits, R.logitsModelForward);
      row.abs_probs = maxDiff(out.probs, R.probs);
      row.logits = Array.from(out.logits);
      const bad = [];
      Object.keys(row).filter((k) => k.indexOf('rel_') === 0).forEach((k) => { if (!(row[k] <= TOL.rel)) bad.push(k); });
      if (!(row.abs_p <= TOL.pAbs)) bad.push('p');
      if (!row.edgesIdentical) bad.push('edges');
      if (!(row.abs_logits <= TOL.logitsAbs) || !(row.abs_logits_vs_model_forward <= TOL.logitsAbs)) bad.push('logits');
      if (!(row.abs_probs <= TOL.probsAbs)) bad.push('probs');
      row.pass = bad.length === 0; row.bad = bad;
      if (bad.length) fails.push(tag + '/' + tr.id + ': ' + bad.join(','));
      rows.push(row);
    }
  }
  const report = { tolerances: TOL, rows, fails, pass: fails.length === 0 };
  fs.writeFileSync(path.join(PAR, 'eeg_js_report.json'), JSON.stringify(report, null, 1));
  return report;
}

module.exports = { run };

if (require.main === module) {
  const rep = run();
  const fmt = (v) => (typeof v === 'number' ? v.toExponential(2) : String(v));
  for (const r of rep.rows) {
    console.log([r.model, r.trial, 'edges ' + r.edgeCounts, 'identical=' + r.edgesIdentical,
      'H ' + fmt(r.rel_H), 'P ' + fmt(r.rel_P), 'Z ' + fmt(r.rel_Z), 'h3 ' + fmt(r.rel_h3), 'p ' + fmt(r.abs_p),
      'logits ' + fmt(r.abs_logits), 'probs ' + fmt(r.abs_probs), r.ms + 'ms', r.pass ? 'PASS' : 'FAIL ' + r.bad].join(' | '));
  }
  console.log(rep.pass ? 'EEG PARITY PASS (' + rep.rows.length + ' model x trial cases)' : 'EEG PARITY FAIL: ' + rep.fails.join('; '));
  process.exit(rep.pass ? 0 : 1);
}
