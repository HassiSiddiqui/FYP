/* Selftest cases — domain 'viz' (VIZ builder). Required ids (architecture §8.2):
 * viz/dashboard-toggle, viz/seeded-approval-visible, viz/brain-22-electrodes.
 * Extra DOM-free checks: montage indices, evo diffing, KG-view ranking model, caregiver models.
 * Registration happens at load if SA.selftest exists (it loads earlier in index order). */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.selftest = SA.selftest || {};

  function reg(id, fn, opts) {
    if (typeof SA.selftest.register === 'function') SA.selftest.register('viz', id, fn, opts || {});
    else (SA.selftest._pending = SA.selftest._pending || []).push(['viz', id, fn, opts || {}]);
  }
  function toggle() { SA.bus.emit('ui:dashboardToggleRequested', {}); }
  function cg() { return document.getElementById('sa-caregiver'); }

  reg('dashboard-toggle', function (t) {
    var host = cg();
    t.ok(!!host, '#sa-caregiver exists');
    t.ok(host.hidden === true, 'hidden at start');
    toggle();
    t.eq(SA.store.get('ui.dashboardOpen'), true, 'store.ui.dashboardOpen true after toggle');
    t.ok(host.hidden === false, 'visible after toggle');
    var banner = document.getElementById('cv-banner');
    t.eq(banner && banner.textContent, 'Caregiver view — simulated, no authentication', 'banner text');
    ['cv-patient', 'cv-queue', 'cv-gauges', 'cv-shadow', 'cv-brain', 'cv-audit', 'cv-audit-badge', 'cv-audit-head', 'cv-audit-list', 'cv-verify', 'cv-tamper']
      .forEach(function (id) { t.ok(!!document.getElementById(id), '#' + id + ' present'); });
    t.eq(document.querySelectorAll('#cv-shadow tbody tr').length, 6, 'shadow table has 6 devices');
    t.eq(document.querySelectorAll('#cv-gauges [data-gauge]').length, 3, '3 gauges');
    toggle();
    t.ok(host.hidden === true, 'hidden after second toggle');
  }, { needsDom: true });

  reg('seeded-approval-visible', function (t) {
    toggle();
    var ap = document.querySelector('button.cv-approve[data-approval-id="ap-seed-1"]');
    var rj = document.querySelector('button.cv-reject[data-approval-id="ap-seed-1"]');
    t.ok(!!ap && !!rj, 'seeded [Approve]/[Reject] buttons present');
    t.eq(ap && ap.textContent, 'Approve', 'Approve label (brackets via CSS)');
    t.eq(rj && rj.textContent, 'Reject', 'Reject label');
    t.ok(ap && ap.classList.contains('sa-bracketed'), '.sa-bracketed');
    var li = document.querySelector('#cv-queue li[data-approval-id="ap-seed-1"]');
    var txt = li ? li.textContent : '';
    t.ok(txt.indexOf('Setpoint 16°C is below the 18°C minimum') >= 0, 'rule text shown');
    t.ok(txt.indexOf('24°C ➔ 16°C') >= 0, 'current ➔ target shown');
    t.ok(txt.indexOf('92%') >= 0 && txt.indexOf('95%') >= 0, 'n and s shown');
    toggle();
  }, { needsDom: true });

  reg('brain-22-electrodes', function (t) {
    var pos = SA.brain.montage.positions();
    t.eq(pos.length, 22, '22 montage positions');
    t.eq(SA.brain.montage.index('FCz'), 3, 'FCz index 3 (paper 4)');
    t.eq(SA.brain.montage.index('Cz'), 9, 'Cz index 9 (paper 10)');
    var inside = pos.every(function (p) { return Math.sqrt(p.x * p.x + p.y * p.y) < 1; });
    t.ok(inside, 'all electrodes inside the unit head circle');
    if (typeof document !== 'undefined' && document.getElementById('sa-brain-view')) {
      var els = document.querySelectorAll('#sa-brain-view .bv-electrode');
      t.eq(els.length, 22, '22 electrode nodes in #sa-brain-view');
      var keys = Array.prototype.map.call(document.querySelectorAll('#sa-brain-view .bv-electrode.bv-key'), function (e) { return e.getAttribute('data-name'); });
      t.eq(keys, ['FCz', 'Cz'], 'FCz and Cz ringed');
      t.eq(document.querySelectorAll('#sa-brain-view .bv-chip').length, 4, 'evo0..evo3 chips');
    }
  });

  reg('brain-evo-diff', function (t) {
    var tr = SA.brain.view.cannedTrace();
    var d = SA.brain.view.diffSteps(tr.graphs);
    t.eq(d.length, 4, '4 steps');
    t.eq(d[0].removed.length, 0, 'evo0 removes nothing');
    for (var k = 1; k < 4; k++) {
      t.ok(d[k].kept.length <= d[k - 1].kept.length, 'evo' + k + ' kept pairs non-increasing');
      t.eq(d[k].kept.length + d[k].removed.length, d[k - 1].kept.length, 'evo' + k + ' kept + removed = previous');
    }
  });

  reg('kg-view-model', function (t) {
    var devices = SA.store.get('devices');
    var m = SA.kg.view.model({ intent: 'Turn On Light', actedOn: { id: 'BedroomCeilingLight' }, ranked: [
      { id: 'BedroomCeilingLight', label: 'Bedroom Ceiling Light', score: 0.94, scorePenalised: 0.94, modifiers: { errpMemory: 1 } },
      { id: 'BedsideLamp', label: 'Bedside Lamp', score: 0.88, scorePenalised: 0.88, modifiers: { errpMemory: 1 } },
      { id: 'LivingRoomLight', label: 'Living Room Light', score: 0.38, scorePenalised: 0.38, modifiers: { errpMemory: 1 } }] },
      devices, 'MasterBedroom', SA.config.kg && SA.config.kg.rooms);
    t.eq(m.nodes.map(function (n) { return n.short; }), ['Ceiling', 'Lamp', 'Living'], 'short labels');
    t.eq(m.nodes.map(function (n) { return n.rankText; }), ['1st · 0.94', '2nd · 0.88', '3rd · 0.38'], 'rank texts');
    t.eq(m.winner, 'BedroomCeilingLight', 'winner');
    t.eq(m.runnerUp, 'BedsideLamp', 'runner-up');
    t.ok(m.nodes.length + 4 <= 8, '<= 8 nodes');
  });

  reg('caregiver-models', function (t) {
    var Q = SA.ui.caregiver.queue, S = SA.ui.caregiver.shadowTable, A = SA.ui.caregiver.auditView;
    var devices = SA.store.get('devices');
    var q = Q.model(SA.store.get('approvals'), devices);
    t.eq(q.count, 1, 'one seeded pending approval');
    t.eq(q.pending[0].target, 'Air Conditioner: 24°C ➔ 16°C', 'target text');
    t.eq(S.stateText(devices.AirConditioner), 'ON • 24°C • Cool Mode', 'AC state text');
    t.eq(S.stateText(devices.SmartTV), 'Standby', 'TV state text');
    t.eq(S.stateText(devices.CeilingFan), 'OFF', 'fan state text');
    t.eq(A.badge({ ok: true, algo: 'SHA-256' }).text, 'Chain verified ✓ (SHA-256)', 'SHA-256 badge');
    t.eq(A.badge({ ok: true, algo: 'FNV-1a' }).text, 'Chain verified ✓ (FNV-1a — integrity only, not tamper-proof)', 'FNV badge');
    t.eq(A.shortHash('0123456789abcdef0123'), '0123456789ab', '12-hex short hash');
  });
})(typeof window !== 'undefined' ? window : globalThis);
