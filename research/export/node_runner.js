#!/usr/bin/env node
/*
 * EXPORT parity runner — docs/architecture.md §8.1, ADR-0001 D23/D24/D27.
 *   node research/export/node_runner.js sfegat <in.json> <out.json>
 * in.json : {"records": null | ["A01E-t000", ...], "stages": true}
 * out.json: {ok, error?, weights: {stub, run, temperature}, butterMaxAbsDiff,
 *            records: [{id, shaOk, logits, probs, probsCal, pred, conf, calibrated,
 *                       edgeCounts, graphs, stages: {name: [numbers]}, elapsedMs}]}
 * Loads POC scripts via research/tests/js/run_node.js (CORE) in index.html order:
 * core + config + data + dsp + eeg only (no UI). Uses only the public §2.2 API:
 * SA.eeg.sfegat.load / forward, SA.core.b64.decodeF32, SA.dsp.butter.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadPOC } = require('../tests/js/run_node.js');

function arr(a) {
  if (a == null) return null;
  if (ArrayBuffer.isView(a) || Array.isArray(a)) return Array.from(a, (v) => (typeof v === 'number' ? v : Number(v)));
  return a;
}

function graphOut(g) {
  if (!g) return null;
  return { src: arr(g.src), dst: arr(g.dst), w: arr(g.w), n: g.n };
}

function sha32(x64) {
  const f = new Float32Array(x64.length);
  for (let i = 0; i < x64.length; i++) f[i] = x64[i];
  return crypto.createHash('sha256').update(Buffer.from(f.buffer)).digest('hex');
}

function butterDiff(SA, man) {
  if (!SA.dsp || typeof SA.dsp.butter !== 'function') return null;
  let worst = 0;
  man.features.bands.forEach(function (b, k) {
    const sos = SA.dsp.butter(man.features.order, b, { btype: 'bandpass', fs: man.fs });
    const ref = man.features.sos[k];
    if (sos.length !== ref.length) { worst = Infinity; return; }
    for (let s = 0; s < ref.length; s++) for (let j = 0; j < 6; j++) worst = Math.max(worst, Math.abs(sos[s][j] - ref[s][j]));
  });
  return worst;
}

function runSfegat(inp) {
  const { SA, errors } = loadPOC({ only: ['js/core/', 'js/config/', 'js/data/', 'js/dsp/', 'js/eeg/'], allowMissing: true, quiet: true });
  const out = { ok: false, loadErrors: errors, records: [] };
  if (!SA || !SA.data || !SA.data.sfegatWeights) { out.error = 'SA.data.sfegatWeights missing'; return out; }
  if (!SA.data.miReplay) { out.error = 'SA.data.miReplay missing'; return out; }
  const man = SA.data.sfegatWeights.manifest;
  out.weights = { stub: man.run.stub, run: man.run.id, temperature: man.calibration.temperature };
  out.butterMaxAbsDiff = butterDiff(SA, man);
  if (!SA.eeg || !SA.eeg.sfegat || typeof SA.eeg.sfegat.load !== 'function' || typeof SA.eeg.sfegat.forward !== 'function') {
    out.error = 'SA.eeg.sfegat.load/forward missing (EEG builder not ready)';
    return out;
  }
  let model;
  try { model = SA.eeg.sfegat.load(SA.data.sfegatWeights); } catch (e) { out.error = 'load threw: ' + e.message; return out; }
  const want = inp.records ? new Set(inp.records) : null;
  for (const rec of SA.data.miReplay.records) {
    if (want && !want.has(rec.id)) continue;
    const X = SA.core.b64.decodeF32(rec.b64);
    const o = { id: rec.id, shaOk: sha32(X) === rec.sha256 };
    try {
      const r = SA.eeg.sfegat.forward(model, X, 22, 1000);
      o.logits = arr(r.logits); o.probs = arr(r.probs); o.probsCal = arr(r.probsCal);
      o.pred = r.pred; o.conf = r.conf; o.calibrated = r.calibrated;
      o.edgeCounts = arr(r.edgeCounts); o.elapsedMs = r.elapsedMs;
      o.graphs = (r.graphs || []).map(graphOut);
      if (inp.stages !== false && r.stages) {
        o.stages = {};
        for (const k of Object.keys(r.stages)) {
          const v = r.stages[k];
          if (v && (ArrayBuffer.isView(v) || Array.isArray(v))) o.stages[k] = arr(v);
        }
      }
    } catch (e) {
      o.error = String(e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e);
    }
    out.records.push(o);
  }
  out.ok = out.records.length > 0 && out.records.every((r) => !r.error);
  return out;
}

function main(argv) {
  const [cmd, inFile, outFile] = argv;
  if (cmd !== 'sfegat' || !inFile || !outFile) {
    process.stderr.write('usage: node research/export/node_runner.js sfegat <in.json> <out.json>\n');
    return 2;
  }
  const inp = JSON.parse(fs.readFileSync(inFile, 'utf8'));
  const out = runSfegat(inp);
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(out));
  process.stdout.write(JSON.stringify({ ok: out.ok, error: out.error || null, n: out.records.length,
    butterMaxAbsDiff: out.butterMaxAbsDiff, loadErrors: out.loadErrors.length }) + '\n');
  return out.ok ? 0 : 1;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { runSfegat };
