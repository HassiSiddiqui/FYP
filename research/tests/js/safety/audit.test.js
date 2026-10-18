'use strict';
const test = require('node:test');
const assert = require('node:assert');
const P = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
const deq = (a, b, m) => assert.deepStrictEqual(P(a), P(b), m);
const { load } = require('./_harness.js');

async function chainOf(opts) {
  const { SA } = load(Object.assign({ fakeClock: true }, opts));
  const A = SA.safety.audit;
  A.init();
  // two appends in the same tick (ADR 0004 D37) + a burst
  const p1 = A.append('BOOT', { version: SA.version || 't' }, 'system');
  const p2 = A.append('TOKEN', { cls: 'feet', token: 'SELECT' }, 'patient');
  for (let i = 0; i < 8; i++) A.append('ERRP_OBS', { q: 0.8 + i / 100, fczMinUv: -8.4217, tStar: Infinity, i }, 'system');
  const [r1, r2] = await Promise.all([p1, p2]);
  return { SA, A, r1, r2 };
}

test('audit: SHA-256 chain links, same-tick appends serialise in seq order, verify ok', async () => {
  const { A, r1, r2 } = await chainOf();
  assert.strictEqual(A.algo(), 'SHA-256');
  assert.strictEqual(r1.seq, 0); assert.strictEqual(r2.seq, 1);
  await A.pending();
  const es = A.entries();
  assert.strictEqual(es.length, 10);
  assert.strictEqual(es[0].prevHash, '0'.repeat(64));
  for (let i = 1; i < es.length; i++) { assert.strictEqual(es[i].seq, i); assert.strictEqual(es[i].prevHash, es[i - 1].hash); }
  assert.match(es[0].hash, /^[0-9a-f]{64}$/);
  // µV rounded to 1 dp, non-finite as string, sorted keys
  assert.strictEqual(es[2].data.fczMinUv, -8.4);
  assert.strictEqual(es[2].data.tStar, 'Infinity');
  const cj = A.canonicalJSON(es[2]);
  assert.ok(cj.indexOf('"actor"') < cj.indexOf('"data"') && cj.indexOf('"data"') < cj.indexOf('"prevHash"'));
  // independent recomputation with node crypto
  const h = require('crypto').createHash('sha256').update(cj, 'utf8').digest('hex');
  assert.strictEqual(h, es[2].hash);
  const v = await A.verify();
  deq({ ok: v.ok, brokenAt: v.brokenAt, algo: v.algo }, { ok: true, brokenAt: null, algo: 'SHA-256' });
});

test('audit: tamper demo breaks the chain at the tampered seq; audit:verified emitted', async () => {
  const { SA, A } = await chainOf();
  let verified = null;
  SA.bus.on('audit:verified', (p) => { verified = p; });
  const r = await A.tamperDemo(4);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.brokenAt, 4);
  assert.strictEqual(verified.brokenAt, 4);
  assert.strictEqual(A.entries().filter(e => e.type === 'TAMPER_DEMO').length, 1);
});

test('audit: bus-driven verify/tamper + audit:request', async () => {
  const { SA, A } = await chainOf();
  SA.bus.emit('audit:request', { type: 'ROOM', data: { room: 'LivingRoom' }, actor: 'operator' });
  await A.pending();
  assert.strictEqual(A.entries().slice(-1)[0].type, 'ROOM');
  let v = null; SA.bus.on('audit:verified', p => { v = p; });
  SA.bus.emit('audit:verifyRequested', {});
  await A.pending(); await new Promise(r => setImmediate(r));
  assert.strictEqual(v.ok, true);
  SA.bus.emit('audit:tamperRequested', { seq: 1 });
  for (let i = 0; i < 5; i++) { await A.pending(); await new Promise(r => setImmediate(r)); }
  assert.strictEqual(v.ok, false); assert.strictEqual(v.brokenAt, 1);
});

test('audit: FNV-1a fallback when crypto.subtle is missing (labelled, still verifies, still detects tamper)', async () => {
  const { A } = await chainOf({ noCrypto: true });
  assert.strictEqual(A.algo(), 'FNV-1a');
  assert.strictEqual(A.fnv1a64(''), 'cbf29ce484222325');
  assert.strictEqual(A.fnv1a64('a'), 'af63dc4c8601ec8c');
  assert.strictEqual(A.fnv1a64('foobar'), '85944171f73967e8');
  const v = await A.verify();
  assert.strictEqual(v.ok, true); assert.strictEqual(v.algo, 'FNV-1a');
  const t = await A.tamperDemo(3);
  assert.strictEqual(t.ok, false); assert.strictEqual(t.brokenAt, 3);
});

test('audit: reset appends RESET with prevHead and never truncates', async () => {
  const { SA, A } = await chainOf();
  await A.pending();
  const n0 = A.entries().length, head = A.head();
  await SA.core.reset();
  await A.pending();
  const es = A.entries();
  assert.strictEqual(es.length, n0 + 1);
  assert.strictEqual(es[es.length - 1].type, 'RESET');
  assert.strictEqual(es[es.length - 1].data.prevHead.hash, head.hash);
  assert.strictEqual((await A.verify()).ok, true);
});
