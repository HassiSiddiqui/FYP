'use strict';
var test = require('node:test'), assert = require('node:assert/strict');
var L = require('./_load.js');

var env = L.load(), SA = env.SA;
SA.kg.competencyQuestions.forEach(function (def, i) {
  def.runs.forEach(function (run, j) {
    var name = def.id + (def.runs.length > 1 ? ' run ' + (j + 1) + ' ' + JSON.stringify(run.bindings) : '') + ': ' + def.question;
    test(name, function () {
      var r = SA.kg.resolver.cq(i + 1, run.bindings);
      assert.deepStrictEqual(L.plain(r.rows), L.plain(run.expected));
    });
  });
});

test('CQ15 after an ErrP rollback: one row whose posterior equals the detector q', function () {
  var e2 = L.load({ bus: true }), S = e2.SA;
  var res = S.kg.resolve({ episodeId: 'ep-1', kind: 'device', id: 'BedroomCeilingLight', command: 'TurnOn' }, { activeRoom: 'MasterBedroom' });
  assert.equal(res.actedOn.score, 0.94);
  var q = 0.8731, piTr = 0.5, qTr = 0.6, lambda = (qTr / (1 - qTr)) * ((1 - piTr) / piTr);
  S.bus.emit('errp:observed', { episodeId: 'ep-1', decision: 'rollback', q: q, qTr: qTr, lambda: lambda, pi: 0.181, tStar: 0.5507 });
  var r = S.kg.resolver.cq(15);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].q, q);
  assert.equal(r.rows[0].prior, 0.181);
  // a 'keep' observation is mirrored as sa:ErrPObservation but is NOT feedback
  S.bus.emit('errp:observed', { episodeId: 'ep-1', decision: 'keep', q: 0.1, lambda: 0.2, pi: 0.181 });
  assert.equal(S.kg.resolver.cq(15).rows.length, 1);
});

test('CQ16 counts are 6 / 2 / 2 (f_R = 0.6 / 0.2 / 0.2)', function () {
  var rows = SA.kg.resolver.cq(16).rows, c = {};
  rows.forEach(function (r) { c[r.d] = (c[r.d] || 0) + 1; });
  assert.deepStrictEqual(L.plain(c), { ':BedroomCeilingLight': 6, ':BedsideLamp': 2, ':LivingRoomLight': 2 });
});
