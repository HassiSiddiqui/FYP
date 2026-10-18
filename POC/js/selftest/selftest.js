/*
 * SA.selftest (CORE) — docs/architecture.md §8.2.
 *   register(domain, id, fn, opts)  opts = {needsDom, timeoutMs (3000),
 *     noReset, final}. fn(t) may return a Promise; a throw is a fail.
 *     t.ok(cond, detail) t.eq(a, b, detail) t.near(a, b, tol, detail)
 *     t.note(detail) t.sleep(realMs) -> Promise
 *     t.waitFor(predicate, realMs, label) -> Promise<bool>
 *   run(opts) -> Promise<report>; opts = {domains:[..], headless}
 *   report (live). Writes progressively to pre#selftest-report; final text
 *   is the JSON then the sentinel line "SELFTEST-DONE pass=N fail=M".
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  var st = SA.selftest = SA.selftest || {};

  var ORDER = ['core', 'kg', 'safety', 'eeg', 'ui', 'viz'];
  var cases = st._cases = st._cases || [];
  st.report = null;
  st.running = false;

  st.register = function (domain, id, fn, opts) {
    opts = opts || {};
    for (var i = 0; i < cases.length; i++) {
      if (cases[i].domain === domain && cases[i].id === id) { cases[i] = { domain: domain, id: id, fn: fn, opts: opts }; return; }
    }
    cases.push({ domain: domain, id: id, fn: fn, opts: opts });
  };

  function realNow() {
    var p = root.performance;
    return (p && typeof p.now === 'function') ? p.now() : Date.now();
  }

  function fmt(v) {
    try { var s = JSON.stringify(v); return s && s.length > 160 ? s.slice(0, 157) + '...' : s; } catch (e) { return String(v); }
  }

  function makeT() {
    var t = { fails: [], notes: [], n: 0 };
    t.ok = function (cond, detail) {
      t.n++;
      if (!cond) t.fails.push(detail || ('assertion ' + t.n));
      return !!cond;
    };
    t.eq = function (a, b, detail) {
      var ok = SA.util.deepEqual(a, b);
      return t.ok(ok, (detail || 'eq') + (ok ? '' : ': got ' + fmt(a) + ', want ' + fmt(b)));
    };
    t.near = function (a, b, tol, detail) {
      var ok = typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol;
      return t.ok(ok, (detail || 'near') + (ok ? '' : ': got ' + fmt(a) + ', want ' + b + ' ± ' + tol));
    };
    t.note = function (d) { t.notes.push(String(d)); };
    t.sleep = function (ms) {
      return new Promise(function (res) { SA.clock.afterReal(ms, res); });
    };
    t.waitFor = function (pred, ms, label) {
      var deadline = realNow() + (ms || 1000);
      return new Promise(function (res) {
        (function poll() {
          var ok = false;
          try { ok = !!pred(); } catch (e) { ok = false; }
          if (ok) return res(true);
          if (realNow() > deadline) { if (label) t.fails.push('timed out waiting for ' + label); return res(false); }
          SA.clock.afterReal(10, poll);
        })();
      });
    };
    return t;
  }

  function el() {
    var d = root.document;
    return d && d.getElementById ? d.getElementById('selftest-report') : null;
  }

  function write(report, final) {
    var e = el();
    if (!e) return;
    try {
      e.hidden = false;
      e.removeAttribute && e.removeAttribute('hidden');
      e.setAttribute('data-status', final ? 'done' : 'running');
      var txt = JSON.stringify(report, null, 1);
      if (final) txt += '\nSELFTEST-DONE pass=' + report.pass + ' fail=' + report.fail;
      e.textContent = txt;
    } catch (err) { /* never throw from the reporter */ }
  }

  function runOne(c, report, headless) {
    var started = realNow();
    var rec = { domain: c.domain, id: c.id, ok: false, detail: '', ms: 0 };
    if (headless && c.opts.needsDom) {
      rec.ok = true; rec.skipped = true; rec.detail = 'skipped (needsDom, headless)';
      report.checks.push(rec);
      return Promise.resolve();
    }
    var t = makeT();
    var timeoutMs = c.opts.timeoutMs || 3000;
    var pre = c.opts.noReset ? Promise.resolve() : Promise.resolve().then(function () { return SA.core.reset(); });
    return pre.then(function () {
      return new Promise(function (resolve) {
        var settled = false;
        var h = SA.clock.afterReal(timeoutMs, function () {
          if (settled) return; settled = true; t.fails.push('timeout ' + timeoutMs + 'ms'); resolve();
        });
        var done = function (err) {
          if (settled) return; settled = true; SA.clock.cancelReal(h);
          if (err) t.fails.push('threw: ' + (err && err.message ? err.message : String(err)));
          resolve();
        };
        try {
          var r = c.fn(t);
          if (r && typeof r.then === 'function') r.then(function () { done(); }, done);
          else done();
        } catch (err) { done(err); }
      });
    }, function (err) {
      t.fails.push('reset before case failed: ' + (err && err.message || err));
    }).then(function () {
      rec.ok = t.fails.length === 0;
      rec.detail = rec.ok ? (t.notes.join('; ') || (t.n + ' assertions')) : t.fails.join('; ');
      rec.ms = Math.round(realNow() - started);
      report.checks.push(rec);
      if (rec.ok) report.pass++; else report.fail++;
      write(report, false);
    });
  }

  st.run = function (opts) {
    opts = opts || {};
    if (st.running) return st.running;
    var t0 = realNow();
    var prevSpeed = SA.clock.speed;
    SA.clock.speed = 10;
    var report = st.report = {
      suite: 'silentassist-selftest', version: SA.version, done: false,
      pass: 0, fail: 0, durationMs: 0, checks: []
    };
    write(report, false);

    var domains = opts.domains && opts.domains.length ? opts.domains : null;
    var order = ORDER.slice();
    cases.forEach(function (c) { if (order.indexOf(c.domain) < 0) order.push(c.domain); });
    var queue = [];
    order.forEach(function (d) {
      if (domains && domains.indexOf(d) < 0) return;
      cases.forEach(function (c) { if (c.domain === d && !c.opts.final) queue.push(c); });
    });
    cases.forEach(function (c) { if (c.opts.final) queue.push(c); }); // always run final checks

    var chain = Promise.resolve();
    queue.forEach(function (c) { chain = chain.then(function () { return runOne(c, report, !!opts.headless); }); });

    st.running = chain.then(function () {
      report.done = true;
      report.durationMs = Math.round(realNow() - t0);
      SA.clock.speed = prevSpeed;
      write(report, true);
      st.running = false;
      try { SA.bus.emit('selftest:done', { pass: report.pass, fail: report.fail }); } catch (e) { /* ignore */ }
      return report;
    });
    return st.running;
  };

  st.text = function (report) {
    report = report || st.report;
    return JSON.stringify(report, null, 1) + '\nSELFTEST-DONE pass=' + report.pass + ' fail=' + report.fail;
  };
})(typeof window !== 'undefined' ? window : globalThis);
