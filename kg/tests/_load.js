/*
 * Test loader: runs the KG/policy IIFEs in a fresh vm context with
 * globalThis.window = {} semantics (ADR 0003 D5 / ADR 0002 D26 pattern).
 *   load({bus: true}) -> {SA, ctx, events}
 * A minimal synchronous bus stub is provided when opts.bus is set (the real
 * SA.bus is CORE's; these tests only need on/emit).
 */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.resolve(__dirname, '..', '..');
var FILES = [
  'POC/js/config/initial-state.js', 'POC/js/config/kg.js', 'POC/js/config/policy.js',
  'POC/js/kg/turtle.js', 'POC/js/kg/triplestore.js', 'POC/js/kg/sparql.js', 'POC/js/kg/ontology.js',
  'POC/js/kg/resolver.js', 'POC/js/kg/mirror.js', 'POC/js/policy/risk.js', 'POC/js/policy/policy.js'
];

function load(opts) {
  opts = opts || {};
  var ctx = { console: console };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  FILES.forEach(function (f) {
    var p = path.join(ROOT, f);
    if (!fs.existsSync(p)) { if (/initial-state/.test(f)) return; throw new Error('missing ' + f); }
    vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
  });
  var events = [];
  if (opts.bus) {
    var subs = {};
    ctx.SA.bus = {
      on: function (e, fn) { (subs[e] = subs[e] || []).push(fn); return function () { subs[e] = subs[e].filter(function (g) { return g !== fn; }); }; },
      emit: function (e, p) { events.push({ evt: e, payload: p }); (subs[e] || []).slice().forEach(function (fn) { fn(p); }); }
    };
  }
  ctx.SA.kg.resolver.init();
  if (opts.bus) ctx.SA.kg.mirror.init();
  return { SA: ctx.SA, ctx: ctx, events: events, ROOT: ROOT };
}

// Plain-JS copy (vm objects have a different Object prototype; deepStrictEqual needs same-realm values)
function plain(x) { return JSON.parse(JSON.stringify(x)); }

module.exports = { load: load, plain: plain, ROOT: ROOT };
