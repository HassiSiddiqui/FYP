/* SA.safety.audit — append-only, hash-chained caregiver audit log (docs/architecture.md §2.5; ADR 0004 D35/D37).
 * - Every append goes through ONE serialised promise queue, so seq order == chain order even when two
 *   appends happen in the same tick and the digest is async (crypto.subtle).
 * - hash = SHA-256 hex of the canonical JSON (sorted keys; µV values (keys ending in 'Uv'/'uV') to 1 dp;
 *   non-finite numbers as strings) of the entry WITHOUT its hash field.
 * - Fallback when crypto.subtle is missing: FNV-1a 64-bit — integrity only, NOT cryptographic / not tamper-proof.
 * - The chain lives here (never in SA.store) and is never truncated; Reset appends RESET.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.safety = SA.safety || {};

  var GENESIS = '0000000000000000000000000000000000000000000000000000000000000000';
  var TYPES = ['BOOT', 'TOKEN', 'DECODE', 'MODE', 'ROOM', 'RESOLVE', 'DECISION', 'CONFIRM_ACCEPTED',
    'CONFIRM_CANCELLED', 'EXECUTE', 'ERRP_OBS', 'CONFIRMED', 'ROLLBACK', 'FLAGGED', 'APPROVAL_REQUESTED',
    'APPROVED', 'REJECTED', 'WITHDRAWN', 'EXPIRED', 'APPROVAL_CANCELLED', 'EPISODE_ABORTED', 'RESET', 'TAMPER_DEMO'];
  var ACTORS = ['patient', 'operator', 'operator-harness', 'caregiver', 'system'];

  var chain = [];          // completed entries, in seq order
  var nextSeq = 0;         // assigned synchronously at append() time
  var queue = null;        // Promise chain (serialises digests)
  var algo = null;         // fixed at first use for the whole chain
  var inited = false;
  var offs = [];
  var tamperBackups = [];  // [{seq, data}] originals of tamper-demo mutations (selftest restores them)

  function subtle() {
    var c = root.crypto;
    return (c && c.subtle && typeof c.subtle.digest === 'function') ? c.subtle : null;
  }
  function getAlgo() {
    if (!algo) algo = subtle() ? 'SHA-256' : 'FNV-1a';
    return algo;
  }
  function q() { return queue || (queue = Promise.resolve()); }

  /* ---------- canonical JSON ---------- */
  function isUvKey(k) { return /(Uv|uV|UV)$/.test(k) || /^uv$/i.test(k); }
  function canon(v, key) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') {
      if (!isFinite(v)) return String(v);                       // Infinity / -Infinity / NaN
      if (key && isUvKey(key)) return Math.round((v + (v >= 0 ? 1 : -1) * Number.EPSILON) * 10) / 10;
      return v;
    }
    if (typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'function') return undefined;
    if (ArrayBuffer.isView(v)) v = Array.prototype.slice.call(v);
    if (Array.isArray(v)) {
      return v.map(function (x) { var c = canon(x, key); return c === undefined ? null : c; });
    }
    if (typeof v === 'object') {
      var out = {}, keys = Object.keys(v).sort();
      for (var i = 0; i < keys.length; i++) {
        var c = canon(v[keys[i]], keys[i]);
        if (c !== undefined) out[keys[i]] = c;
      }
      return out;
    }
    return String(v);
  }
  // Serialise with sorted keys at every level (canon() already sorted insertion order; re-sort defensively).
  function stringify(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(stringify).join(',') + ']';
    var keys = Object.keys(v).sort(), parts = [];
    for (var i = 0; i < keys.length; i++) parts.push(JSON.stringify(keys[i]) + ':' + stringify(v[keys[i]]));
    return '{' + parts.join(',') + '}';
  }
  function canonicalJSON(entry) {
    var o = {};
    for (var k in entry) if (Object.prototype.hasOwnProperty.call(entry, k) && k !== 'hash') o[k] = entry[k];
    return stringify(canon(o));
  }

  /* ---------- digests ---------- */
  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    var b = unescape(encodeURIComponent(s)), u = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return u;
  }
  function hex(buf) {
    var u = new Uint8Array(buf), s = '';
    for (var i = 0; i < u.length; i++) s += (u[i] < 16 ? '0' : '') + u[i].toString(16);
    return s;
  }
  // FNV-1a 64-bit (offset 0xcbf29ce484222325, prime 0x100000001b3) on UTF-8 bytes, using 4 x 16-bit limbs.
  function fnv1a64(str) {
    var bytes = utf8(str);
    var h = [0x2325, 0x8422, 0x9ce4, 0xcbf2]; // little-endian 16-bit limbs
    for (var i = 0; i < bytes.length; i++) {
      h[0] ^= bytes[i];
      // multiply by prime 0x0000_0100_0000_01b3: limbs p = [0x01b3, 0x0000, 0x0100, 0x0000]
      var a0 = h[0], a1 = h[1], a2 = h[2], a3 = h[3];
      var r0 = a0 * 0x01b3;
      var r1 = a1 * 0x01b3 + (r0 >>> 16);
      var r2 = a2 * 0x01b3 + a0 * 0x0100 + (r1 >>> 16);
      var r3 = a3 * 0x01b3 + a1 * 0x0100 + (r2 >>> 16);
      h = [r0 & 0xffff, r1 & 0xffff, r2 & 0xffff, r3 & 0xffff];
    }
    var s = '';
    for (var j = 3; j >= 0; j--) s += ('0000' + h[j].toString(16)).slice(-4);
    return s;
  }
  function digest(str) {
    if (getAlgo() === 'SHA-256') {
      return subtle().digest('SHA-256', utf8(str)).then(hex);
    }
    return Promise.resolve(fnv1a64(str));
  }

  /* ---------- helpers ---------- */
  function iso() {
    if (SA.clock && typeof SA.clock.iso === 'function') return SA.clock.iso();
    return new Date().toISOString().slice(0, 19);
  }
  function emit(evt, p) { if (SA.bus && SA.bus.emit) SA.bus.emit(evt, p); }
  function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
  function lastHash() { return chain.length ? chain[chain.length - 1].hash : GENESIS; }

  /* ---------- public API ---------- */
  function append(type, data, actor) {
    if (TYPES.indexOf(type) < 0 && typeof console !== 'undefined') console.warn('audit: unknown type ' + type);
    if (ACTORS.indexOf(actor) < 0) actor = actor ? String(actor) : 'system';
    var entry = { seq: nextSeq++, ts: iso(), type: String(type), actor: actor,
      data: canon(data === undefined ? {} : data), prevHash: null, hash: null };
    var p = q().then(function () {
      entry.prevHash = lastHash();
      return digest(canonicalJSON(entry));
    }).then(function (h) {
      entry.hash = h;
      chain.push(entry);
      emit('audit:appended', { seq: entry.seq, type: entry.type, hash: h, entry: clone(entry) });
      return { seq: entry.seq, hash: h };
    });
    queue = p.catch(function (e) { if (typeof console !== 'undefined') console.error('audit append failed', e); });
    return p;
  }

  function verifyNow() {
    var prev = GENESIS, i = 0, a = getAlgo();
    function step() {
      if (i >= chain.length) return Promise.resolve({ ok: true, brokenAt: null, algo: a, n: chain.length });
      var e = chain[i];
      if (e.prevHash !== prev) return Promise.resolve({ ok: false, brokenAt: e.seq, algo: a, n: chain.length });
      return digest(canonicalJSON(e)).then(function (h) {
        if (h !== e.hash) return { ok: false, brokenAt: e.seq, algo: a, n: chain.length };
        prev = e.hash; i++;
        return step();
      });
    }
    return step();
  }
  function verify() {
    var p = q().then(verifyNow).then(function (r) { emit('audit:verified', r); return r; });
    queue = p.catch(function () {});
    return p;
  }

  // Tamper demo: log the intent, then mutate the target entry's data IN PLACE (hash untouched), then re-verify.
  function tamperDemo(seq) {
    var target = (seq === undefined || seq === null) ? null : Number(seq);
    return append('TAMPER_DEMO', { targetSeq: target, note: 'operator-initiated integrity demo' }, 'operator')
      .then(function () {
        if (target === null || !chain.some(function (e) { return e.seq === target; })) {
          target = chain.length > 1 ? chain[Math.max(0, chain.length - 2)].seq : chain[0].seq;
        }
        for (var i = 0; i < chain.length; i++) {
          if (chain[i].seq === target) {
            tamperBackups.push({ seq: target, data: clone(chain[i].data) });
            var d = chain[i].data;
            if (d && typeof d === 'object' && !Array.isArray(d)) d.tampered = true; else chain[i].data = { tampered: true };
            break;
          }
        }
        return verify();
      });
  }

  function entries() { return chain.map(clone); }
  function head() { return chain.length ? { seq: chain[chain.length - 1].seq, hash: lastHash() } : { seq: -1, hash: GENESIS }; }
  function pending() { return q(); }

  function init() {
    if (inited) return;
    inited = true;
    getAlgo();
    if (!SA.bus || !SA.bus.on) return;
    offs.push(SA.bus.on('audit:request', function (p) {
      if (p && p.type) append(p.type, p.data || {}, p.actor || 'system');
    }));
    offs.push(SA.bus.on('audit:verifyRequested', function () { verify(); }));
    offs.push(SA.bus.on('audit:tamperRequested', function (p) { tamperDemo(p ? p.seq : null); }));
  }

  // Tests only: drop the chain (never called by the app; Reset never truncates).
  function _resetForTests() { chain = []; nextSeq = 0; queue = null; algo = null; inited = false;
    offs.forEach(function (o) { try { o(); } catch (e) {} }); offs = []; }
  function _forceAlgo(a) { algo = a; }
  // Selftest only: undo tamper-demo mutations so later cases start from an intact chain.
  function _restoreTamper() {
    while (tamperBackups.length) {
      var b = tamperBackups.pop();
      for (var i = 0; i < chain.length; i++) if (chain[i].seq === b.seq) chain[i].data = b.data;
    }
  }

  SA.safety.audit = {
    init: init, append: append, entries: entries, head: head, verify: verify, tamperDemo: tamperDemo,
    pending: pending, algo: function () { return getAlgo(); },
    canonicalJSON: canonicalJSON, fnv1a64: fnv1a64, GENESIS: GENESIS, TYPES: TYPES,
    _resetForTests: _resetForTests, _forceAlgo: _forceAlgo, _restoreTamper: _restoreTamper
  };
})(typeof window !== 'undefined' ? window : globalThis);
