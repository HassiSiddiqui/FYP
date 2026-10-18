/*
 * Selftest cases — domain 'core' (CORE). docs/architecture.md §8.2.
 * Unit checks of core/input plus cross-module end-to-end checks driven ONLY
 * through public surfaces (tokens via SA.input.tokenbus with source 'auto',
 * bus events, store reads, and the §2 public APIs).
 * Final checks (always run last): console-clean, audit-chain, tamper,
 * reset-equality.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.selftest = SA.selftest || {};
  if (typeof SA.selftest.register !== 'function') return;
  var R = SA.selftest.register;

  var NAMESPACES = [
    'util', 'bus', 'store', 'clock', 'core.b64', 'core.reset',
    'eeg.tensor', 'eeg.plv', 'eeg.graph', 'eeg.psdFeatures', 'eeg.gatv2', 'eeg.gcn', 'eeg.batchnorm',
    'eeg.gae', 'eeg.sfegat', 'eeg.synth', 'eeg.decoder',
    'errp.features', 'errp.classifier', 'errp.detector', 'errp.memory', 'errp.synth',
    'kg.ontologyTTL', 'kg.resolver', 'kg.resolve', 'kg.mirror', 'kg.view',
    'policy.risk', 'policy.decide',
    'safety.audit', 'safety.rollback', 'safety.approvals', 'safety.episode',
    'input.tokenbus', 'input.keyboard',
    'ui.format', 'ui.screens', 'nav', 'ui.render', 'ui.navigator', 'ui.harness',
    'ui.components.pills', 'ui.components.listbox', 'ui.components.coglignPanel',
    'ui.components.caption', 'ui.components.observation',
    'ui.caregiver', 'voice.speech', 'brain.montage', 'brain.view', 'selftest', 'app'
  ];

  function get(p) {
    var parts = p.split('.'), cur = SA;
    for (var i = 0; i < parts.length; i++) { if (cur == null) return undefined; cur = cur[parts[i]]; }
    return cur;
  }
  function tok(cls) { return SA.input.tokenbus.emitToken(cls, 'auto'); }
  function hasDom() { return !!(root.document && root.document.getElementById); }
  function text(id) {
    var e = hasDom() && root.document.getElementById(id);
    return e ? (e.textContent || '').replace(/\s+/g, ' ').trim() : null;
  }
  function capture(evts) {
    var seen = {}, offs = [];
    evts.forEach(function (e) {
      seen[e] = [];
      offs.push(SA.bus.on(e, function (p) { seen[e].push(p); }));
    });
    seen.off = function () { offs.forEach(function (o) { o(); }); };
    return seen;
  }
  var E2E_DEPS = ['eeg.decoder', 'ui.navigator', 'safety.episode', 'kg.resolve', 'policy.decide', 'safety.rollback', 'errp.detector', 'safety.audit'];
  // Fail fast (instead of timing out) when another builder's module is absent.
  function need(t, deps) {
    var miss = (deps || E2E_DEPS).filter(function (n) { return get(n) === undefined; });
    if (miss.length) t.ok(false, 'blocked: missing ' + miss.map(function (m) { return 'SA.' + m; }).join(', '));
    return miss.length === 0;
  }
  function last(arr) { return arr && arr.length ? arr[arr.length - 1] : null; }

  // Navigate S1 -> S2 -> S3 -> S4 (Bedroom Ceiling Light) and SELECT Turn On.
  function canonicalTurnOn(t) {
    tok('feet');
    t.eq(SA.store.get('ui.screen'), 'S2', 'S1 SELECT -> S2');
    tok('feet');
    t.eq(SA.store.get('ui.screen'), 'S3', 'Lights -> S3');
    tok('feet');
    t.eq(SA.store.get('ui.screen'), 'S4', 'Bedroom Ceiling Light -> S4');
    tok('feet');
  }

  /* ---------------- unit checks ---------------- */

  R('core', 'namespaces', function (t) {
    var missing = NAMESPACES.filter(function (n) { return get(n) === undefined; });
    t.ok(missing.length === 0, 'missing namespaces: ' + missing.join(', '));
    t.note(NAMESPACES.length + ' namespaces present');
  });

  R('core', 'initial-state-readme', function (t) {
    var s = SA.store.snapshot();
    t.eq(s.ui.screen, 'S1', 'starts on S1');
    t.eq(s.decoder.mode, 'scripted', 'mode default Scripted');
    t.eq([s.decoder.sliders.neural, s.decoder.sliders.semantic], [0.92, 0.89], 'sliders 92/89');
    var lightsOn = ['BedroomCeilingLight', 'BedsideLamp', 'LivingRoomLight'].filter(function (k) { return s.devices[k].power === 'on'; });
    t.eq(lightsOn, ['LivingRoomLight'], '1 Active of 3');
    t.eq([s.devices.CeilingFan.power, s.devices.AirConditioner.setpoint, s.devices.AirConditioner.mode, s.devices.SmartTV.power],
      ['off', 24, 'cool', 'standby'], 'Fan OFF, 24°C Cool, TV Standby');
    t.eq(s.approvals.length, 1, 'one seeded approval');
    if (SA.ui && SA.ui.format && SA.ui.format.hubSubtitle) {
      t.eq(SA.ui.format.hubSubtitle('lights', s.devices), '1 Active of 3', 'hub Lights subtitle');
    }
  });

  R('core', 'store-ownership', function (t) {
    function throws(fn) { try { fn(); return false; } catch (e) { return /may not write/.test(e.message); } }
    t.ok(throws(function () { SA.store.set('devices.BedsideLamp.power', 'on', 'ui'); }), 'ui may not write devices');
    t.ok(throws(function () { SA.store.set('prefs.decodeAnimation', false, 'ui'); }), 'ui may only write prefs.voice');
    t.ok(throws(function () { SA.store.set('decoder.mode', 'replay', 'episode'); }), 'episode may not write decoder.mode');
    t.ok(!throws(function () { SA.store.set('decoder.errpCursor.error', 1, 'episode'); }), 'episode may write errpCursor');
    var g = SA.store.get('devices');
    g.BedsideLamp.power = 'on';
    t.eq(SA.store.get('devices.BedsideLamp.power'), 'off', 'get returns a deep clone');
  });

  R('core', 'bus-fifo-and-errors', function (t) {
    var order = [];
    var o1 = SA.bus.on('selftest:a', function () { order.push('a1'); SA.bus.emit('selftest:b', {}); order.push('a1-end'); });
    var o2 = SA.bus.on('selftest:a', function () { order.push('a2'); });
    var o3 = SA.bus.on('selftest:b', function () { order.push('b'); });
    SA.bus.emit('selftest:a', {});
    o1(); o2(); o3();
    t.eq(order, ['a1', 'a1-end', 'a2', 'b'], 'nested emit queued FIFO after current dispatch');
    var ec = SA.bus.errorCount, cc = SA.consoleErrors, logLen = (SA.consoleErrorLog || []).length;
    var o4 = SA.bus.on('selftest:c', function () { throw new Error('deliberate selftest throw'); });
    var after = false;
    var o5 = SA.bus.on('selftest:c', function () { after = true; });
    var con = root.console, origErr = con && con.error;
    if (con) con.error = function () { SA.consoleErrors += 1; };   // silence the deliberate error
    try { SA.bus.emit('selftest:c', {}); } finally { if (con) con.error = origErr; }
    o4(); o5();
    t.eq(SA.bus.errorCount, ec + 1, 'handler exception counted');
    t.ok(after, 'later handlers still run');
    SA.bus.errorCount = ec; SA.consoleErrors = cc;                 // deliberate error: not a real one
    if (SA.consoleErrorLog) SA.consoleErrorLog.length = logLen;
    t.ok(SA.bus.log.length > 0 && SA.bus.log.length <= 200, 'bus.log bounded');
  });

  R('core', 'clock', function (t) {
    t.ok(/^2026-03-01T21:00:\d\d$/.test(SA.clock.iso()), 'clock starts at initial context clock: ' + SA.clock.iso());
    var fired = 0, cancelled = 0;
    SA.clock.after(100, function () { fired++; });
    var h = SA.clock.after(100, function () { cancelled++; });
    SA.clock.cancel(h);
    return t.sleep(60).then(function () {
      t.eq(fired, 1, 'after(100 demo ms) fired at speed 10');
      t.eq(cancelled, 0, 'cancel works');
      var n = 0;
      SA.clock.after(50, function () { n++; });
      SA.clock.cancelAll();
      return t.sleep(30).then(function () { t.eq(n, 0, 'cancelAll cancels'); });
    });
  });

  R('core', 'b64', function (t) {
    var v = [1.5, -2.25, 3.1415927, 0, -8.4];
    var s = SA.core.b64.encodeF32(v);
    var d = SA.core.b64.decodeF32(s);
    t.eq(d.length, 5, 'length');
    for (var i = 0; i < v.length; i++) t.near(d[i], Math.fround(v[i]), 0, 'value ' + i);
    t.eq(Array.prototype.slice.call(SA.core.b64.decodeBytes('AQID')), [1, 2, 3], 'decodeBytes');
  });

  R('core', 'keyboard-map', function (t) {
    var K = SA.input.keyboard;
    var want = { ArrowRight: 'right', d: 'right', D: 'right', ArrowLeft: 'left', a: 'left', A: 'left',
      Enter: 'feet', ' ': 'feet', s: 'feet', S: 'feet', Escape: 'tongue', Backspace: 'tongue', w: 'tongue', W: 'tongue' };
    Object.keys(want).forEach(function (k) {
      var r = K.classify({ key: k });
      t.ok(r && r.kind === 'token' && r.cls === want[k], 'key ' + JSON.stringify(k) + ' -> ' + want[k]);
    });
    t.eq(K.classify({ key: 'c' }).kind, 'dashboard', 'c toggles dashboard');
    t.eq(K.classify({ key: 'C' }).kind, 'dashboard', 'C toggles dashboard');
    t.eq(K.classify({ key: 'd', repeat: true }).kind, 'ignored', 'repeat ignored');
    t.eq(K.classify({ key: 'd', ctrlKey: true }).kind, 'native', 'Ctrl ignored');
    var field = { closest: function (sel) { return /input/.test(sel) ? {} : null; } };
    t.eq(K.classify({ key: 'a', target: field }).kind, 'native', 'form fields ignored');
    ['ArrowRight', 'ArrowLeft', ' ', 'Enter', 'Escape', 'Backspace'].forEach(function (k) {
      t.ok(K.classify({ key: k }).prevent === true, 'preventDefault on ' + JSON.stringify(k));
    });
    t.ok(!K.classify({ key: 'd' }).prevent, 'no preventDefault on letters');
    var prevented = false;
    SA.input.tokenbus.resetDebounce();
    K.handle({ key: ' ', preventDefault: function () { prevented = true; } });
    t.ok(prevented, 'Space handled with preventDefault (no scroll)');
  });

  R('core', 'tokenbus-debounce-and-dashboard', function (t) {
    if (!need(t, ['ui.navigator'])) return;
    var cap = capture(['input:token', 'input:dropped']);
    SA.input.tokenbus.resetDebounce();
    SA.input.tokenbus.emitToken('right', 'keyboard');
    SA.input.tokenbus.emitToken('right', 'keyboard');
    t.eq(cap['input:token'].length, 1, 'second token within 250 ms debounced');
    t.eq((last(cap['input:dropped']) || {}).reason, 'debounce', 'drop reason debounce');
    t.eq(last(cap['input:token']).token, 'NEXT', 'right -> NEXT');
    SA.input.tokenbus.emitToken('bogus', 'auto');
    t.eq((last(cap['input:dropped']) || {}).reason, 'invalid', 'invalid class rejected');
    SA.bus.emit('ui:dashboardToggleRequested', {});
    t.ok(SA.store.get('ui.dashboardOpen') === true, 'C/switch opens dashboard (via navigator)');
    var n = cap['input:token'].length;
    SA.input.tokenbus.emitToken('left', 'auto');
    t.eq(cap['input:token'].length, n, 'tokens dropped while dashboard open');
    t.eq((last(cap['input:dropped']) || {}).reason, 'dashboard', 'drop reason dashboard');
    SA.bus.emit('ui:dashboardToggleRequested', {});
    t.ok(SA.store.get('ui.dashboardOpen') === false, 'dashboard closes again');
    cap.off();
  });

  R('core', 'harness-set-glue', function (t) {
    if (!need(t, ['eeg.decoder', 'ui.navigator'])) return;
    var cap = capture(['context:roomChanged']);
    SA.bus.emit('harness:set', { key: 'context.activeRoom', value: 'LivingRoom' });
    t.eq(SA.store.get('context.activeRoom'), 'LivingRoom', 'room applied');
    t.eq((last(cap['context:roomChanged']) || {}).prev, 'MasterBedroom', 'context:roomChanged emitted');
    SA.bus.emit('harness:set', { key: 'prefs.errpAutoConfirm', value: true });
    t.eq(SA.store.get('prefs.errpAutoConfirm'), true, 'prefs applied');
    SA.bus.emit('harness:set', { key: 'decoder.sliders.neural', value: 0.7 });
    t.near(SA.store.get('decoder.sliders.neural'), 0.7, 1e-12, 'decoder slider applied by eeg/decoder');
    SA.bus.emit('input:operatorToken', { cls: 'feet' });
    t.eq(SA.store.get('ui.screen'), 'S2', 'operator token navigates');
    cap.off();
  });

  /* ---------------- end-to-end (public surfaces only) ---------------- */

  R('core', 'e2e-canonical-coglign', function (t) {
    if (!need(t)) return;
    var cap = capture(['kg:resolved', 'policy:decided', 'eeg:decoded']);
    canonicalTurnOn(t);
    var kg = last(cap['kg:resolved']), pd = last(cap['policy:decided']);
    t.ok(!!kg, 'kg:resolved emitted');
    t.ok(!!pd, 'policy:decided emitted');
    if (kg) {
      t.eq(kg.intentLabel, 'Turn On Light', 'Decoded Intent');
      t.eq(kg.spatialContext, 'Master Bedroom (Active User Room)', 'Spatial Context');
      t.eq(kg.actedOn && kg.actedOn.iri, ':BedroomCeilingLight', 'Resolved Entity');
      t.eq(kg.actedOn && SA.util.round(kg.actedOn.score, 2), 0.94, 'SPARQL Match 0.94');
    }
    if (pd) {
      t.eq(Math.round(pd.n * 100), 92, 'Neural MI 92%');
      t.eq(Math.round(pd.s * 100), 89, 'Semantic Context 89%');
      t.eq(pd.tierLabel, 'Low: Autonomic', 'Risk Tier');
      t.eq(pd.decision, 'EXECUTE', 'Policy Decision');
    }
    cap.off();
    return t.waitFor(function () { return SA.store.get('episode.phase') === 'observing'; }, 2000, 'observing phase')
      .then(function () {
        t.eq(SA.store.get('devices.BedroomCeilingLight.power'), 'on', 'OFF ➔ ON executed');
        t.eq(SA.store.get('ui.screen'), 'S5', 'S5 Action Result');
        if (!hasDom()) return;
        return t.sleep(120).then(function () {
          t.eq(text('cl-sparql-score'), '0.94', 'panel #cl-sparql-score');
          t.eq(text('cl-neural'), '92%', 'panel #cl-neural');
          t.eq(text('cl-semantic'), '89%', 'panel #cl-semantic');
          t.ok(/EXECUTE/.test(text('cl-decision') || ''), 'panel #cl-decision EXECUTE');
          t.ok((text('sa-app') || '').indexOf('“Observing post-action EEG...”') >= 0, 'observing caption shown');
        });
      });
  }, { timeoutMs: 5000 });

  function toObserving(t) {
    canonicalTurnOn(t);
    return t.waitFor(function () { return SA.store.get('episode.phase') === 'observing'; }, 2000, 'observing phase');
  }

  R('core', 'e2e-no-errp-confirm', function (t) {
    if (!need(t)) return;
    return toObserving(t).then(function () {
      SA.bus.emit('errp:inject', { kind: 'correct', source: 'operator' });
      return t.waitFor(function () { return SA.store.get('episode.outcome') === 'confirmed'; }, 2000, 'outcome confirmed');
    }).then(function () {
      t.eq(SA.store.get('devices.BedroomCeilingLight.power'), 'on', 'state remains ON');
      return SA.safety.audit.pending ? SA.safety.audit.pending() : null;
    }).then(function () {
      var types = SA.safety.audit.entries().map(function (e) { return e.type; });
      t.ok(types.indexOf('CONFIRMED') >= 0, 'CONFIRMED audit entry');
      if (hasDom()) return t.sleep(120).then(function () {
        t.ok((text('sa-app') || '').indexOf('No Error Detected • Action Confirmed') >= 0, 'success text shown');
      });
    });
  }, { timeoutMs: 6000 });

  R('core', 'e2e-errp-rollback', function (t) {
    if (!need(t)) return;
    var cap = capture(['errp:observed']);
    return toObserving(t).then(function () {
      SA.bus.emit('errp:inject', { kind: 'error', source: 'operator' });
      return t.waitFor(function () { return SA.store.get('episode.outcome') === 'rolledBack'; }, 2000, 'outcome rolledBack');
    }).then(function () {
      cap.off();
      var obs = last(cap['errp:observed']);
      t.ok(obs && obs.decision === 'rollback', 'detector decision rollback');
      if (obs) t.eq(SA.util.round(obs.fczMinUv, 1), -8.4, 'FCz deflection -8.4 µV');
      if (obs && SA.ui.format && SA.ui.format.errpStatus) {
        t.eq(SA.ui.format.errpStatus(obs.fczMinUv), 'Possible Error Detected • ErrP Deflection at FCz (-8.4 µV)', 'status string');
      }
      t.eq(SA.store.get('devices.BedroomCeilingLight.power'), 'off', 'ON ➔ OFF restored');
      var alt = SA.store.get('episode.alternative');
      t.eq(alt && alt.label, 'Bedside Lamp', 'semantic alternative Bedside Lamp');
      if (hasDom()) return t.sleep(120).then(function () {
        var all = text('sa-app') || '';
        ['Action Rolled Back', 'Bedside Lamp', 'Retry', 'Return to Home', 'ON ➔ OFF'].forEach(function (s) {
          t.ok(all.indexOf(s) >= 0, 'shows ' + s);
        });
      });
    });
  }, { timeoutMs: 6000 });

  R('core', 'e2e-sliders-confirm-reject', function (t) {
    if (!need(t)) return;
    var cap = capture(['policy:decided']);
    SA.bus.emit('harness:set', { key: 'decoder.sliders.neural', value: 0.70 });
    canonicalTurnOn(t);
    t.eq((last(cap['policy:decided']) || {}).decision, 'CONFIRM', 'neural 70% -> c 0.623 -> CONFIRM');
    return SA.core.reset().then(function () {
      SA.bus.emit('harness:set', { key: 'decoder.sliders.neural', value: 0.35 });
      canonicalTurnOn(t);
      t.eq((last(cap['policy:decided']) || {}).decision, 'REJECT', 'neural 35% -> REJECT');
      t.eq(SA.store.get('devices.BedroomCeilingLight.power'), 'off', 'REJECT leaves device unchanged');
      cap.off();
    });
  }, { timeoutMs: 5000 });

  R('core', 'e2e-thermal-caregiver', function (t) {
    if (!need(t, ['policy.risk', 'policy.decide'])) return;
    var action = { kind: 'device', id: 'AirConditioner', command: 'SetTemperature', args: { value: 17 } };
    var risk = SA.policy.risk.assess(action, SA.store.get('devices'));
    t.eq(risk.tier, 'High', 'setpoint 17 -> High tier');
    var d = SA.policy.decide({ n: 0.92, s: 0.89, tier: risk.tier, noop: false, hFlag: false, ruleText: risk.rule && risk.rule.text });
    t.eq(d.decision, 'CAREGIVER', 'thermal -> CAREGIVER');
    var ok = SA.policy.risk.assess({ kind: 'device', id: 'AirConditioner', command: 'SetTemperature', args: { value: 23 } }, SA.store.get('devices'));
    t.eq(ok.tier, 'Medium', 'setpoint 23 -> Medium (AC)');
  });

  /* ---------------- final checks ---------------- */

  function tamperTolerated(entries, brokenAt) {
    return entries.some(function (e) { return e.type === 'TAMPER_DEMO' && e.seq > brokenAt; });
  }

  R('core', 'audit-chain-verifies', function (t) {
    if (!need(t, ['safety.audit'])) return;
    return SA.safety.audit.verify().then(function (r) {
      var ok = r.ok || tamperTolerated(SA.safety.audit.entries(), r.brokenAt);
      t.ok(ok, 'chain verify ' + JSON.stringify(r));
      var types = SA.safety.audit.entries().map(function (e) { return e.type; });
      t.ok(types.indexOf('BOOT') >= 0, 'BOOT entry present');
      t.ok(types.indexOf('RESET') >= 0, 'RESET entry present');
      t.note('algo ' + r.algo + ', ' + types.length + ' entries' + (r.ok ? '' : ', broken only at deliberately tampered #' + r.brokenAt));
    });
  }, { final: true });

  R('core', 'audit-tamper-detected', function (t) {
    if (!need(t, ['safety.audit'])) return;
    var target = SA.safety.audit.head().seq;
    return SA.safety.audit.tamperDemo(target).then(function (r) {
      t.ok(r && r.ok === false, 'tamper detected');
      t.eq(r && r.brokenAt, target, 'broken at tampered entry #' + target);
    });
  }, { final: true, noReset: true });

  R('core', 'reset-equality', function (t) {
    // Dirty some state first, then Reset Demo through the bus (harness path).
    tok('feet'); tok('right');
    SA.bus.emit('harness:set', { key: 'context.activeRoom', value: 'LivingRoom' });
    SA.bus.emit('harness:set', { key: 'decoder.sliders.neural', value: 0.5 });
    SA.bus.emit('demo:resetRequested', {});
    var snap = SA.store.snapshot(), init = SA.util.deepClone(SA.config.initialState);
    snap.prefs.reducedMotion = init.prefs.reducedMotion;
    t.ok(SA.util.deepEqual(snap, init), 'store deep-equals initialState after Reset Demo');
    if (!SA.util.deepEqual(snap, init)) {
      Object.keys(init).forEach(function (k) { if (!SA.util.deepEqual(snap[k], init[k])) t.ok(false, 'slice differs: ' + k + ' ' + JSON.stringify(snap[k]).slice(0, 200)); });
    }
    var p = SA.safety.audit.pending ? SA.safety.audit.pending() : Promise.resolve();
    return Promise.resolve(p).then(function () {
      var e = SA.safety.audit.entries();
      t.eq(e[e.length - 1].type, 'RESET', 'Reset appended RESET audit entry');
      if (!hasDom()) return;
      return t.sleep(120).then(function () {
        t.eq(text('pill-eeg'), 'EEG: Simulation Mode', 'pill-eeg');
        t.eq(text('pill-env'), 'Environment: Smart-Home Simulator', 'pill-env');
        t.eq(text('btn-caregiver'), 'Caregiver Dashboard', 'dashboard switch');
        t.eq(text('sa-screen-title'), 'Mode Selection', 'S1 title after reset');
      });
    });
  }, { final: true, noReset: true });

  R('core', 'readme-labels-dom', function (t) {
    return t.sleep(100).then(function () {
      var want = { 'hz-next': 'Right Hand ► Next', 'hz-prev': 'Left Hand ◄ Previous', 'hz-select': 'Both Feet ✓ Select',
        'hz-back': 'Tongue ✕ Back', 'hz-noerrp': 'No ErrP', 'hz-simerrp': 'Simulate ErrP',
        'pill-eeg': 'EEG: Simulation Mode', 'pill-env': 'Environment: Smart-Home Simulator', 'btn-caregiver': 'Caregiver Dashboard' };
      Object.keys(want).forEach(function (id) { t.ok((text(id) || '').indexOf(want[id]) >= 0, '#' + id + ' contains ' + want[id] + ' (got ' + JSON.stringify(text(id)) + ')'); });
      var lb = text('sa-listbox') || '';
      t.ok(lb.indexOf('Visual Navigation') >= 0 && lb.indexOf('Audio-Assisted Navigation') >= 0, 'S1 cards');
      t.eq(text('sa-screen-title'), 'Mode Selection', 'S1 title');
    });
  }, { needsDom: true });
  R('core', 'console-clean', function (t) {
    t.eq(SA.consoleErrors, 0, 'console.error count since boot' + (SA.consoleErrors ? ' — ' + (SA.consoleErrorLog || []).slice(-3).join(' || ') : ''));
    t.eq(SA.bus.errorCount, 0, 'bus handler errors');
    t.eq((SA.app.initErrors || []).length, 0, 'module init errors ' + JSON.stringify(SA.app.initErrors || []));
  }, { final: true, noReset: true });
})(typeof window !== 'undefined' ? window : globalThis);
