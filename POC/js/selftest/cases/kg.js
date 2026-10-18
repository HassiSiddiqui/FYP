/*
 * Selftest cases, domain 'kg' (KG builder) — architecture §8.2, ADR 0003 Consequences.
 * kg/cq-1..16, kg/canonical-scores, kg/query-is-executed (needsDom), kg/kg-equals-store,
 * kg/ttl-is-ontology, kg/policy-canonical, kg/policy-sliders, kg/noop-reject,
 * kg/thermal-17-caregiver, kg/thermal-18-30-not-high, kg/errp-ranking-flip.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};

  function reg(id, fn, opts) {
    if (!SA.selftest || !SA.selftest.register) return;
    SA.selftest.register('kg', id, fn, opts);
  }
  function canon() {
    return SA.kg.resolve({ episodeId: null, kind: 'device', id: 'BedroomCeilingLight', command: 'TurnOn' },
      { activeRoom: 'MasterBedroom', roomConfidence: SA.config.kg.roomConfidence });
  }
  function score(r, id) { for (var i = 0; i < r.ranked.length; i++) if (r.ranked[i].id === id) return r.ranked[i].score; return null; }
  function devices() { return (SA.store && SA.store.get) ? SA.store.get('devices') : SA.kg.mirror.deviceStates(); }
  function plain(x) { return JSON.parse(JSON.stringify(x)); }

  // ---- competency questions (expected answers are for the reset state)
  for (var k = 1; k <= 16; k++) {
    (function (n) {
      reg('cq-' + n, function (t) {
        var def = SA.kg.competencyQuestions[n - 1];
        def.runs.forEach(function (run) {
          var r = SA.kg.resolver.cq(n, run.bindings);
          t.eq(plain(r.rows), plain(run.expected), def.id + (run.bindings ? ' ' + JSON.stringify(run.bindings) : ''));
        });
      });
    })(k);
  }

  reg('canonical-scores', function (t) {
    var r = canon();
    t.eq(score(r, 'BedroomCeilingLight'), 0.94, 'ceiling S');
    t.eq(score(r, 'BedsideLamp'), 0.88, 'lamp S');
    t.eq(score(r, 'LivingRoomLight'), 0.38, 'living S');
    t.eq(r.semanticConfidence, 0.89, 's');
    t.eq(r.intentLabel, 'Turn On Light', 'intent');
    t.eq(r.spatialContext, 'Master Bedroom (Active User Room)', 'space');
    t.eq(r.actedOn.iri, ':BedroomCeilingLight', 'entity');
  });

  reg('query-is-executed', function (t) {
    var r = canon();
    t.eq(r.query.text, SA.kg.resolver.lastQuery, 'payload query === lastQuery');
    return t.waitFor(function () {
      var el = root.document && root.document.getElementById('cl-sparql-text');
      return !!el && el.textContent === SA.kg.resolver.lastQuery;
    }, 1500, 'panel #cl-sparql-text').then(function (ok) {
      t.ok(ok, 'panel query text === SA.kg.resolver.lastQuery');
    });
  }, { needsDom: true });

  reg('kg-equals-store', function (t) {
    t.eq(plain(SA.kg.mirror.deviceStates()), plain(devices()), 'KG mirror read-back == store.devices');
  });

  reg('ttl-is-ontology', function (t) {
    var tr = SA.kg.turtle.parse(SA.kg.ontologyTTL);
    t.eq(tr.length, 466, 'asserted triples');
    t.eq(SA.kg.resolver.triples().size, 515, 'closed triples');
  });

  reg('policy-canonical', function (t) {
    var req = { kind: 'device', id: 'BedroomCeilingLight', command: 'TurnOn' };
    var r = canon(), risk = SA.policy.risk.assess(req, devices());
    var d = SA.policy.decide({ n: 0.92, s: r.semanticConfidence, tier: risk.tier, noop: r.noop, hFlag: r.hFlag });
    t.eq(risk.tierLabel, 'Low: Autonomic', 'tier label');
    t.eq(d.c, 0.8188, 'c');
    t.eq(d.decision, 'EXECUTE', 'decision');
  });

  reg('policy-sliders', function (t) {
    t.eq(SA.policy.decide({ n: 0.84, s: 0.89, tier: 'Low' }).decision, 'CONFIRM', 'n 0.84');
    t.eq(SA.policy.decide({ n: 0.85, s: 0.89, tier: 'Low' }).decision, 'EXECUTE', 'n 0.85');
    t.eq(SA.policy.decide({ n: 0.57, s: 0.89, tier: 'Low' }).decision, 'CONFIRM', 'n 0.57');
    t.eq(SA.policy.decide({ n: 0.56, s: 0.89, tier: 'Low' }).decision, 'REJECT', 'n 0.56');
    t.eq(SA.policy.decide({ n: 0.35, s: 0.89, tier: 'Low' }).decision, 'REJECT', 'n 0.35 neural floor');
    t.eq(SA.policy.decide({ n: 0.92, s: 0.60, tier: 'Low' }).decision, 'CONFIRM', 'semantic override 0.60');
  });

  reg('noop-reject', function (t) {
    var r = SA.kg.resolve({ kind: 'device', id: 'LivingRoomLight', command: 'TurnOn' }, { activeRoom: 'MasterBedroom' });
    var d = SA.policy.decide({ n: 0.92, s: r.semanticConfidence, tier: 'Low', noop: r.noop, noopReason: r.noopReason });
    t.eq(d.decision, 'REJECT', 'decision');
    t.eq(d.reason, 'No change: Living Room Light is already ON', 'reason');
  });

  reg('thermal-17-caregiver', function (t) {
    var devs = devices();
    devs.AirConditioner.setpoint = 18;
    var risk = SA.policy.risk.assess({ kind: 'device', id: 'AirConditioner', command: 'SetTemperature', args: { delta: -1 } }, devs);
    var d = SA.policy.decide({ n: 0.92, s: 0.95, tier: risk.tier, ruleText: risk.rule && risk.rule.text });
    t.eq(risk.tier, 'High', 'tier');
    t.eq(risk.rule && risk.rule.text, 'Setpoint 17°C is below the 18°C minimum', 'rule text');
    t.eq(d.decision, 'CAREGIVER', 'decision');
  });

  reg('thermal-18-30-not-high', function (t) {
    var devs = devices();
    [18, 30].forEach(function (v) {
      var r = SA.policy.risk.assess({ kind: 'device', id: 'AirConditioner', command: 'SetTemperature', args: { value: v } }, devs);
      t.eq(r.tier, 'Medium', v + ' degC');
    });
  });

  reg('errp-ranking-flip', function (t) {
    SA.kg.resolver.registerModifier('selftestFlip', function (id) { return id === 'BedroomCeilingLight' ? 0.5 : 1; });
    try {
      var r = canon();
      t.eq(r.ranked[0].id, 'BedsideLamp', 'ranking flip (0.47 < 0.88)');
      t.eq(score(r, 'BedroomCeilingLight'), 0.94, 'panel keeps unpenalised S');
      t.eq(r.semanticConfidence, 0.89, 'M never touches s');
      t.ok(r.hFlag === true, 'h-flag set');
    } finally {
      SA.kg.resolver.registerModifier('selftestFlip', null);
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
