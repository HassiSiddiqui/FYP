#!/usr/bin/env node
/*
 * SilentAssist POC Node runner (CORE) — docs/architecture.md §8.1.
 *   const {loadPOC} = require('./run_node.js');
 *   loadPOC({only, allowMissing, quiet}) -> {ctx, SA, errors, loaded, missing}
 * CLI:
 *   node research/tests/js/run_node.js load-only [--allow-missing]
 *   node research/tests/js/run_node.js cases [domain...] [--allow-missing]
 *   node research/tests/js/run_node.js lint
 * Scripts are read from POC/index.html <script src> in document order and run
 * in a vm context with NO document/navigator (load-time DOM access fails).
 * CommonJS, no npm dependencies.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const POC = path.join(ROOT, 'POC');
const INDEX = path.join(POC, 'index.html');

function scriptList() {
  const html = fs.readFileSync(INDEX, 'utf8');
  const re = /<script\b[^>]*\bsrc\s*=\s*"([^"]+)"[^>]*>\s*<\/script>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

function makeConsole(quiet) {
  // A private console object so namespace.js's console.error wrapper never
  // touches Node's global console.
  const c = {};
  for (const k of ['log', 'info', 'warn', 'error', 'debug', 'trace', 'table', 'dir', 'group', 'groupEnd', 'time', 'timeEnd']) {
    const f = console[k] ? console[k].bind(console) : function () {};
    c[k] = quiet && k !== 'error' ? function () {} : f;
  }
  if (quiet) c.error = function () {};
  return c;
}

function loadPOC(opts) {
  opts = opts || {};
  const sandbox = {
    console: makeConsole(!!opts.quiet), atob, btoa, TextEncoder, TextDecoder,
    crypto: require('crypto').webcrypto, performance, setTimeout, clearTimeout,
    setInterval, clearInterval, URLSearchParams, Promise
  };
  const ctx = vm.createContext(sandbox);
  ctx.window = ctx;
  ctx.globalThis = ctx;
  const errors = [];
  const missing = [];
  let loaded = 0;
  for (const src of scriptList()) {
    if (opts.only && !opts.only.some((p) => src.indexOf(p) === 0 || src.indexOf('js/' + p) === 0)) continue;
    const file = path.join(POC, src);
    if (!fs.existsSync(file)) {
      missing.push(src);
      if (!opts.allowMissing) errors.push({ file: src, error: 'missing file' });
      continue;
    }
    try {
      vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
      loaded++;
    } catch (e) {
      errors.push({ file: src, error: String(e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e) });
    }
  }
  return { ctx, SA: ctx.SA, errors, loaded, missing };
}

function listJs(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(listJs(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

function lint() {
  const problems = [];
  const html = fs.readFileSync(INDEX, 'utf8');
  if (/type\s*=\s*["']module["']/i.test(html)) problems.push('index.html: type="module"');
  if (/<(script|link)[^>]+(src|href)\s*=\s*["']https?:\/\//i.test(html)) problems.push('index.html: remote URL in <script>/<link>');
  for (const src of scriptList()) if (!fs.existsSync(path.join(POC, src))) problems.push('index.html references missing ' + src);
  const files = listJs(path.join(POC, 'js'));
  for (const f of files) {
    const rel = path.relative(POC, f).split(path.sep).join('/');
    const text = fs.readFileSync(f, 'utf8');
    const generated = /GENERATED/.test(text.split('\n')[0]);
    try { new vm.Script(text, { filename: f }); } catch (e) { problems.push(rel + ': syntax ' + e.message); }
    const lines = text.split('\n').length;
    if (!generated && lines > 450) problems.push(rel + ': ' + lines + ' lines (> 450)');
    if (generated) continue;
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
    if (/\bfetch\s*\(/.test(code)) problems.push(rel + ': fetch(');
    if (/\bimport\s*\(/.test(code)) problems.push(rel + ': import(');
    if (/XMLHttpRequest/.test(code)) problems.push(rel + ': XMLHttpRequest');
    if (/\bset(Timeout|Interval)\s*\(/.test(code) && rel !== 'js/core/clock.js' && rel !== 'js/voice/speech.js') {
      problems.push(rel + ': setTimeout/setInterval outside core/clock.js');
    }
    const uiSide = /^js\/(ui|input|voice|brain)\//.test(rel) || rel === 'js/kg/kg-view.js';
    if (uiSide && /SA\.(eeg|errp|policy|safety)\.|SA\.kg\.(resolver|resolve|mirror)\b/.test(code)) {
      problems.push(rel + ': UI-side module references a domain module');
    }
  }
  return { files: files.length, problems };
}

function main(argv) {
  const cmd = argv[0] || 'load-only';
  const allowMissing = argv.indexOf('--allow-missing') >= 0;
  const rest = argv.slice(1).filter((a) => a.indexOf('--') !== 0);
  if (cmd === 'load-only') {
    const r = loadPOC({ allowMissing });
    console.log(JSON.stringify({ loaded: r.loaded, errors: r.errors, missing: r.missing }, null, 1));
    process.exit(r.errors.length ? 1 : 0);
  } else if (cmd === 'lint') {
    const r = lint();
    console.log(JSON.stringify(r, null, 1));
    process.exit(r.problems.length ? 1 : 0);
  } else if (cmd === 'cases') {
    const r = loadPOC({ allowMissing, quiet: argv.indexOf('--verbose') < 0 });
    if (r.errors.length) {
      console.log(JSON.stringify({ loadErrors: r.errors }, null, 1));
      process.exit(1);
    }
    const SA = r.SA;
    SA.app.start({ headless: true });
    const guard = setTimeout(() => { console.log('{"error":"selftest did not finish in 120 s"}'); process.exit(1); }, 120000);
    SA.selftest.run({ domains: rest.length ? rest : null, headless: true }).then((rep) => {
      clearTimeout(guard);
      rep.missingFiles = r.missing;
      rep.initMissing = SA.app.missing;
      rep.initErrors = SA.app.initErrors;
      rep.consoleErrorLog = SA.consoleErrorLog;
      console.log(JSON.stringify(rep, null, 1));
      console.log('SELFTEST-DONE pass=' + rep.pass + ' fail=' + rep.fail);
      process.exit(rep.fail ? 1 : 0);
    }, (e) => { console.log(String(e && e.stack || e)); process.exit(1); });
  } else {
    console.log('usage: run_node.js load-only|cases [domain...]|lint [--allow-missing]');
    process.exit(2);
  }
}

module.exports = { loadPOC, scriptList, lint, ROOT, POC };

if (require.main === module) main(process.argv.slice(2));
