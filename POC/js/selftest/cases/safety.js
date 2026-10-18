/* Selftest cases — SAFETY domain (docs/architecture.md §8.2 required ids). DOM-free; run headless and in-page.
 * Every case starts from SA.core.reset() (selftest default). Timing uses SA.clock (selftest speed 10). */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.selftestCases = SA.selftestCases || {};

  var ERR = 'Possible Error Detected • ErrP Deflection at FCz (-8.4 µV)';
  var OK = 'No Error Detected • Action Confirmed';

  function reg(id, fn, opts) { SA.selftest.register('safety', id, fn, opts || { timeoutMs: 6000 }); }
  function wait(ms) { return new Promise(function (r) { SA.clock.after(ms, r); }); }
  function ep() { return SA.store.get('episode'); }
  function capture(evts) {
    var got = {}, offs = evts.map(function (e) { return SA.bus.on(e, function (p) { got[e] = p; }); });
    return { last: function (e) { return got[e] || null; }, off: function () { offs.forEach(function (o) { o(); }); } };
  }
  function act(id, command, args, kind) {
    SA.bus.emit('eeg:decoded', { token: 'SELECT', cls: 'feet', conf: SA.store.get('decoder.sliders.neural'), decoded: false });
    SA.bus.emit('ui:actionRequested', { target: { kind: kind || 'device', id: id }, command: command, args: args || {},
      origin: { screen: 'S4', index: 0 } });
  }
  // EXECUTE has a decision dwell; wait until the episode reaches `phase` (bounded)
  function until(phase, maxMs) {
    var waited = 0;
    function loop() {
      if (ep().phase === phase || waited >= (maxMs || 2000)) return Promise.resolve(ep().phase === phase);
      waited += 50;
      return wait(50).then(loop);
    }
    return loop();
  }

  function register() {
    if (!SA.selftest || !SA.selftest.register) return;

    reg('policy-table', function (t) {   // ADR 0003 D14 rows (pure policy)
      var D = SA.policy.decide;
      t.eq(D({ n: 0.92, s: 0.89, tier: 'Low' }).decision, 'EXECUTE', 'canonical');
      t.eq(D({ n: 0.92, s: 0.89, tier: 'Low' }).c, 0.8188, 'canonical c');
      t.eq(D({ n: 0.80, s: 0.89, tier: 'Low' }).decision, 'CONFIRM', 'n 0.80');
      t.eq(D({ n: 0.60, s: 0.89, tier: 'Low' }).decision, 'CONFIRM', 'n 0.60');
      t.eq(D({ n: 0.55, s: 0.89, tier: 'Low' }).decision, 'REJECT', 'n 0.55');
      t.eq(D({ n: 0.35, s: 0.89, tier: 'Low' }).decision, 'REJECT', 'neural floor');
      t.eq(D({ n: 0.92, s: 0.60, tier: 'Low' }).decision, 'CONFIRM', 'semantic 0.60');
      t.eq(D({ n: 0.92, s: 0.95, tier: 'Medium' }).decision, 'EXECUTE', 'AC in band');
      t.eq(D({ n: 0.92, s: 0.95, tier: 'High' }).decision, 'CAREGIVER', 'AC 17');
      t.eq(D({ n: 0.92, s: 0.89, tier: 'Low', hFlag: true }).decision, 'CONFIRM', 'h-flag');
      t.eq(D({ n: 0.92, s: 0.89, tier: 'Low', noop: true, noopReason: 'x' }).decision, 'REJECT', 'noop');
    });

    reg('thermal-caregiver', function (t) {
      var cap = capture(['policy:decided', 'approval:requested', 'approval:resolved']);
      SA.store.set('devices.AirConditioner.setpoint', 18, 'rollback');
      act('AirConditioner', 'SetTemperature', { value: 17 });
      t.eq(cap.last('policy:decided') && cap.last('policy:decided').decision, 'CAREGIVER', 'AC 18 -> 17');
      t.eq(ep().phase, 'pendingCaregiver', 'pending');
      var req = cap.last('approval:requested');
      t.ok(req && /17°C is below the 18°C minimum/.test(req.reason), 'rule text: ' + (req && req.reason));
      SA.bus.emit('caregiver:approve', { approvalId: req.approvalId });
      t.eq(SA.store.get('devices.AirConditioner.setpoint'), 17, 'executed after approval');
      SA.bus.emit('errp:inject', { kind: 'error', source: 'operator' });
      t.eq(ep().outcome, 'logged', 'approved High: ErrP log-only');
      t.eq(SA.store.get('devices.AirConditioner.setpoint'), 17, 'never auto-rolled back');
      cap.off();
    });

    reg('audit-verify-and-tamper', function (t) {
      var A = SA.safety.audit;
      var p1 = A.append('TOKEN', { cls: 'feet', n: 1 }, 'patient'), p2 = A.append('TOKEN', { cls: 'right', n: 2 }, 'patient');
      return Promise.all([p1, p2]).then(function (r) {
        t.eq(r[1].seq, r[0].seq + 1, 'same-tick appends keep seq order');
        return A.verify();
      }).then(function (v) {
        t.ok(v.ok, 'chain verifies (' + v.algo + ')');
        t.ok(v.algo === 'SHA-256' || v.algo === 'FNV-1a', 'algo ' + v.algo);
        return A.tamperDemo(A.head().seq - 1);
      }).then(function (v2) {
        t.ok(!v2.ok, 'tamper detected');
        t.ok(v2.brokenAt !== null, 'Chain broken at #' + v2.brokenAt);
        A._restoreTamper();
        return A.verify();
      }).then(function (v3) {
        t.ok(v3.ok, 'intact again after the selftest restores the tampered entry');
      });
    });

    reg('errp-synthetic-3-priors', function (t) {
      var S = SA.errp.synth, D = SA.errp.detector, e = S.epoch('error'), c = S.epoch('correct');
      t.ok(e && c, 'synthetic epochs available (' + (e && e.id) + ', ' + (c && c.id) + ')');
      [0.10, 0.181, 0.36].forEach(function (pi) {
        var re = D.observe(e, { costClass: 'light-select', pi: pi, mode: 'auto' });
        var rc = D.observe(c, { costClass: 'light-select', pi: pi, mode: 'auto' });
        t.eq(re.decision, 'rollback', 'synth-error at pi ' + pi + ' (q = ' + (re.q && re.q.toFixed(3)) + ')');
        t.eq(rc.decision, 'keep', 'synth-correct at pi ' + pi + ' (q = ' + (rc.q && rc.q.toFixed(3)) + ')');
      });
      t.eq(D.observe(e, { costClass: 'light-select', pi: 0.181 }).fczMinUv.toFixed(1), '-8.4', 'FCz single-trial min');
    });

    reg('preset-rollback-atomic', function (t) {
      var R = SA.safety.rollback, before = SA.store.get('devices');
      var steps = R.plan({ kind: 'preset', id: 'CoolingMode' }, before);
      t.eq(steps.length, 2, 'Cooling Mode diff = AC + fan');
      var saga = R.execute('ep-selftest', steps, 'operator');
      t.eq(SA.store.get('devices.AirConditioner.setpoint'), 22, 'AC 22');
      var comp = R.compensate('ep-selftest', saga);
      t.eq(comp.map(function (s) { return s.deviceId; }), ['CeilingFan', 'AirConditioner'], 'reverse order');
      t.eq(SA.store.get('devices'), before, 'all devices restored');
    });

    reg('false-rollback-confirm', function (t) {   // ADR 0002 D18
      var cap = capture(['policy:decided']);
      act('BedroomCeilingLight', 'TurnOn');
      return until('observing').then(function (ok) {
        t.ok(ok, 'observing');
        SA.bus.emit('errp:inject', { kind: 'error', source: 'operator' });
        t.eq(ep().outcome, 'rolledBack', 'rolled back');
        t.eq(ep().observation.status, ERR, 'README S5 string');
        t.eq(SA.store.get('devices.BedroomCeilingLight.power'), 'off', 'ON ➔ OFF');
        t.eq(ep().alternative && ep().alternative.label, 'Bedside Lamp', 'alternative');
        SA.bus.emit('ui:outcomeChoice', { episodeId: ep().id, choice: 'home' });
        act('BedroomCeilingLight', 'TurnOn');
        var d = cap.last('policy:decided');
        t.eq(d.decision, 'CONFIRM', 're-select gives CONFIRM, never REJECT');
        SA.bus.emit('ui:confirmAccepted', { episodeId: ep().id });
        t.eq(SA.store.get('devices.BedroomCeilingLight.power'), 'on', 'SELECT executes');
        SA.bus.emit('errp:inject', { kind: 'correct', source: 'operator' });
        t.eq(ep().observation.status, OK, 'No ErrP path');
        cap.off();
      });
    });

    reg('reset-during-observation', function (t) {
      act('BedroomCeilingLight', 'TurnOn');
      return until('observing').then(function (ok) {
        t.ok(ok, 'observing');
        return SA.core.reset();
      }).then(function () {
        var after = JSON.stringify(SA.store.get('devices'));
        return wait(5000).then(function () {
          t.eq(JSON.stringify(SA.store.get('devices')), after, 'no device mutation 5 s after reset');
          return SA.safety.audit.pending();
        });
      }).then(function () {
        var types = SA.safety.audit.entries().map(function (e) { return e.type; });
        var i = types.lastIndexOf('RESET');
        t.ok(types.slice(0, i).lastIndexOf('EPISODE_ABORTED') > types.slice(0, i).lastIndexOf('EXECUTE'), 'EPISODE_ABORTED logged');
        t.ok(types.slice(i).indexOf('ROLLBACK') < 0, 'no ROLLBACK after reset');
      });
    }, { timeoutMs: 8000 });
  }

  SA.selftestCases.safety = register;
  register();
})(typeof window !== 'undefined' ? window : globalThis);
