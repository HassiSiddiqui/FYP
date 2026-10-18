/*
 * SA.kg.store — indexed in-memory triple store.
 *
 *   var st = SA.kg.store.create(triples, opts)
 *     triples  Array of {s,p,o} terms (e.g. from SA.kg.turtle.parse); its
 *              .prefixes (if any) are copied to st.prefixes
 *     opts.subClassOf     materialise rdfs:subClassOf (rdfs9 + rdfs11)
 *     opts.subPropertyOf  materialise rdfs:subPropertyOf (rdfs7 + rdfs5)
 *     opts.rdfs           shorthand for both
 *     opts.prefixes       extra prefixes
 *
 * Terms are interned to integer ids; three nested hash indexes
 * SPO Map<s,Map<p,Set<o>>>, POS Map<p,Map<o,Set<s>>>, OSP Map<o,Map<s,Set<p>>>
 * answer every bound/unbound access pattern with a prefix lookup.
 * Inferred triples are kept apart from asserted ones and are recomputed
 * lazily (next read) after any change that can affect them.
 *
 * Public API (terms are SA.kg.term objects; null/undefined = wildcard):
 *   st.add(s,p,o) / st.add({s,p,o})   -> true if newly asserted
 *   st.remove(s,p,o)                  -> true if an asserted triple was removed
 *   st.removeMatches(s,p,o)           -> number removed (asserted only)
 *   st.set(s,p,o)                     replace every (s,p,*) by (s,p,o)
 *   st.addAll(triples)
 *   st.has(s,p,o), st.match(s,p,o) -> [{s,p,o}], st.count(s,p,o)
 *   st.objects(s,p), st.subjects(p,o), st.one(s,p) -> term|null
 *   st.isInferred(s,p,o), st.triples({inferred:false}), st.size, st.version
 *   st.subscribe(fn) -> unsubscribe; fn({type:'add'|'remove', triple, version})
 *   st.toNTriples()
 * Id-level API used by SA.kg.sparql: id(term) (-1 if unknown), intern(term),
 *   term(id), forEachIds(s,p,o,cb(s,p,o)) with -1/undefined as wildcard.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.kg = SA.kg || {};

  var RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
  var SUBCLASS = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';
  var SUBPROP = 'http://www.w3.org/2000/01/rdf-schema#subPropertyOf';

  function T() {
    if (!SA.kg.term) throw new Error('SA.kg.store needs SA.kg.term (load kg/turtle.js first)');
    return SA.kg.term;
  }
  function idx3(m, a, b, c) {
    var m2 = m.get(a);
    if (!m2) { m2 = new Map(); m.set(a, m2); }
    var s = m2.get(b);
    if (!s) { s = new Set(); m2.set(b, s); }
    if (s.has(c)) return false;
    s.add(c);
    return true;
  }
  function del3(m, a, b, c) {
    var m2 = m.get(a); if (!m2) return;
    var s = m2.get(b); if (!s) return;
    s.delete(c);
    if (!s.size) { m2.delete(b); if (!m2.size) m.delete(a); }
  }
  function tkey(s, p, o) { return s + ' ' + p + ' ' + o; }

  function Store(opts) {
    opts = opts || {};
    this.terms = [];
    this.keys = new Map();
    this.spo = new Map(); this.pos = new Map(); this.osp = new Map();
    this.inferred = new Set();          // tkeys present only by inference
    this.size = 0;
    this.version = 0;
    this.listeners = [];
    this.prefixes = {};
    this.reason = {
      subClassOf: !!(opts.rdfs || opts.subClassOf),
      subPropertyOf: !!(opts.rdfs || opts.subPropertyOf)
    };
    this.dirty = false;
    this.superProps = new Map();        // p id -> [super p ids] (when subPropertyOf on)
    var k;
    if (opts.prefixes) for (k in opts.prefixes) this.prefixes[k] = opts.prefixes[k];
  }
  var P = Store.prototype;

  // ---- dictionary
  P.intern = function (t) {
    var k = T().key(t), id = this.keys.get(k);
    if (id === undefined) { id = this.terms.length; this.terms.push(t); this.keys.set(k, id); }
    return id;
  };
  P.id = function (t) {
    if (t === null || t === undefined) return -1;
    var id = this.keys.get(T().key(t));
    return id === undefined ? -1 : id;
  };
  P.term = function (id) { return this.terms[id]; };
  P.iriId = function (v) { return this.id({ type: 'iri', value: v }); };

  // ---- raw index ops (no inference bookkeeping)
  P._insert = function (s, p, o) {
    if (!idx3(this.spo, s, p, o)) return false;
    idx3(this.pos, p, o, s);
    idx3(this.osp, o, s, p);
    this.size++;
    return true;
  };
  P._delete = function (s, p, o) {
    del3(this.spo, s, p, o); del3(this.pos, p, o, s); del3(this.osp, o, s, p);
    this.size--;
  };
  P._hasIds = function (s, p, o) {
    var m = this.spo.get(s), st = m && m.get(p);
    return !!st && st.has(o);
  };
  P._affectsInference = function (p) {
    if (!this.reason.subClassOf && !this.reason.subPropertyOf) return false;
    var v = this.terms[p].value;
    return v === RDF_TYPE || v === SUBCLASS || v === SUBPROP || this.superProps.has(p);
  };
  P._notify = function (type, s, p, o) {
    this.version++;
    if (!this.listeners.length) return;
    var ev = { type: type, triple: { s: this.terms[s], p: this.terms[p], o: this.terms[o] }, version: this.version };
    this.listeners.slice().forEach(function (fn) { fn(ev); });
  };
  function args(a, b, c) { return (a && a.s !== undefined && b === undefined) ? [a.s, a.p, a.o] : [a, b, c]; }

  // ---- mutation
  P.add = function (a, b, c) {
    var t = args(a, b, c);
    if (!t[0] || !t[1] || !t[2]) throw new Error('store.add needs s, p and o');
    var s = this.intern(t[0]), p = this.intern(t[1]), o = this.intern(t[2]), k = tkey(s, p, o);
    if (this.inferred.has(k)) { this.inferred.delete(k); this._notify('add', s, p, o); return true; }
    if (!this._insert(s, p, o)) return false;
    if (this._affectsInference(p)) this.dirty = true;
    this._notify('add', s, p, o);
    return true;
  };
  P.addAll = function (triples) {
    for (var i = 0; i < triples.length; i++) this.add(triples[i]);
    return this;
  };
  P.remove = function (a, b, c) {
    var t = args(a, b, c);
    var s = this.id(t[0]), p = this.id(t[1]), o = this.id(t[2]);
    if (s < 0 || p < 0 || o < 0) return false;
    this._ensure();
    if (!this._hasIds(s, p, o) || this.inferred.has(tkey(s, p, o))) return false;
    this._delete(s, p, o);
    if (this._affectsInference(p)) this.dirty = true;
    this._notify('remove', s, p, o);
    return true;
  };
  P.removeMatches = function (s, p, o) {
    var self = this, list = this.match(s, p, o, { inferred: false }), n = 0;
    list.forEach(function (t) { if (self.remove(t.s, t.p, t.o)) n++; });
    return n;
  };
  P.set = function (s, p, o) {
    var self = this, had = false;
    this.match(s, p, null, { inferred: false }).forEach(function (t) {
      if (T().equals(t.o, o)) had = true; else self.remove(t.s, t.p, t.o);
    });
    if (!had) this.add(s, p, o);
    return this;
  };
  P.subscribe = function (fn) {
    var ls = this.listeners;
    ls.push(fn);
    return function () { var i = ls.indexOf(fn); if (i >= 0) ls.splice(i, 1); };
  };

  // ---- inference (RDFS rules 5, 7, 9, 11 only)
  function closure(edges) {           // Map a -> Set b  =>  Map a -> Array of all reachable b (excl. a)
    var out = new Map();
    edges.forEach(function (_, a) {
      var seen = new Set(), stack = [a];
      while (stack.length) {
        var x = stack.pop(), nx = edges.get(x);
        if (nx) nx.forEach(function (y) { if (!seen.has(y)) { seen.add(y); stack.push(y); } });
      }
      seen.delete(a);
      if (seen.size) out.set(a, Array.from(seen));
    });
    return out;
  }
  P._edges = function (pid) {
    var edges = new Map(), m = this.pos.get(pid);
    if (m) m.forEach(function (subs, o) {
      subs.forEach(function (s) { if (!edges.has(s)) edges.set(s, new Set()); edges.get(s).add(o); });
    });
    return edges;
  };
  P._infer = function (s, p, o) {
    if (this._insert(s, p, o)) this.inferred.add(tkey(s, p, o));
  };
  P.materialise = function () {
    var self = this;
    this.inferred.forEach(function (k) { var a = k.split(' '); self._delete(+a[0], +a[1], +a[2]); });
    this.inferred.clear();
    this.superProps = new Map();
    this.dirty = false;
    var typeId = this.iriId(RDF_TYPE), scId = this.iriId(SUBCLASS), spId = this.iriId(SUBPROP);
    if (this.reason.subPropertyOf && spId >= 0) {
      var supers = closure(this._edges(spId));
      this.superProps = supers;
      supers.forEach(function (ups, p) {
        ups.forEach(function (q) { self._infer(p, spId, q); });             // rdfs5
        var rows = [];
        self.forEachIds(-1, p, -1, function (s, _, o) { rows.push([s, o]); });
        rows.forEach(function (r) { ups.forEach(function (q) { self._infer(r[0], q, r[1]); }); }); // rdfs7
      });
    }
    if (this.reason.subClassOf && scId >= 0) {
      var sc = closure(this._edges(scId));
      sc.forEach(function (ups, c) { ups.forEach(function (d) { self._infer(c, scId, d); }); }); // rdfs11
      if (typeId >= 0) {
        var typed = [];
        this.forEachIds(-1, typeId, -1, function (x, _, c) { if (sc.has(c)) typed.push([x, c]); });
        typed.forEach(function (r) { sc.get(r[1]).forEach(function (d) { self._infer(r[0], typeId, d); }); }); // rdfs9
      }
    }
    return this;
  };
  P._ensure = function () { if (this.dirty) this.materialise(); };

  // ---- reads
  P.forEachIds = function (s, p, o, cb) {
    this._ensure();
    var S = s !== undefined && s !== null && s >= 0, Pb = p !== undefined && p !== null && p >= 0,
      O = o !== undefined && o !== null && o >= 0, m, st;
    if (S && Pb) {
      m = this.spo.get(s); st = m && m.get(p);
      if (!st) return;
      if (O) { if (st.has(o)) cb(s, p, o); return; }
      st.forEach(function (x) { cb(s, p, x); });
    } else if (S && O) {
      m = this.osp.get(o); st = m && m.get(s);
      if (st) st.forEach(function (x) { cb(s, x, o); });
    } else if (Pb && O) {
      m = this.pos.get(p); st = m && m.get(o);
      if (st) st.forEach(function (x) { cb(x, p, o); });
    } else if (S) {
      m = this.spo.get(s);
      if (m) m.forEach(function (os, pp) { os.forEach(function (x) { cb(s, pp, x); }); });
    } else if (Pb) {
      m = this.pos.get(p);
      if (m) m.forEach(function (ss, oo) { ss.forEach(function (x) { cb(x, p, oo); }); });
    } else if (O) {
      m = this.osp.get(o);
      if (m) m.forEach(function (ps, ss) { ps.forEach(function (x) { cb(ss, x, o); }); });
    } else {
      this.spo.forEach(function (m2, ss) { m2.forEach(function (os, pp) { os.forEach(function (x) { cb(ss, pp, x); }); }); });
    }
  };
  // Cheap cardinality estimate (exact) for the SPARQL join planner.
  P.countIds = function (s, p, o) {
    var S = s >= 0, Pb = p >= 0, O = o >= 0, m, st, n = 0;
    this._ensure();
    if (S && Pb) { m = this.spo.get(s); st = m && m.get(p); return st ? (O ? (st.has(o) ? 1 : 0) : st.size) : 0; }
    if (S && O) { m = this.osp.get(o); st = m && m.get(s); return st ? st.size : 0; }
    if (Pb && O) { m = this.pos.get(p); st = m && m.get(o); return st ? st.size : 0; }
    m = S ? this.spo.get(s) : Pb ? this.pos.get(p) : O ? this.osp.get(o) : null;
    if (!S && !Pb && !O) return this.size;
    if (m) m.forEach(function (x) { n += x.size; });
    return n;
  };
  // Resolve terms for a public read; returns null if a bound term is unknown.
  P._ids = function (s, p, o) {
    var r = [s ? this.id(s) : -1, p ? this.id(p) : -1, o ? this.id(o) : -1];
    if ((s && r[0] < 0) || (p && r[1] < 0) || (o && r[2] < 0)) return null;
    return r;
  };
  P.match = function (s, p, o, opts) {
    var r = this._ids(s, p, o), out = [], self = this, skipInf = opts && opts.inferred === false;
    if (!r) return out;
    this.forEachIds(r[0], r[1], r[2], function (a, b, c) {
      if (skipInf && self.inferred.has(tkey(a, b, c))) return;
      out.push({ s: self.terms[a], p: self.terms[b], o: self.terms[c] });
    });
    return out;
  };
  P.count = function (s, p, o) { var r = this._ids(s, p, o); return r ? this.countIds(r[0], r[1], r[2]) : 0; };
  P.has = function (s, p, o) { return this.count(s, p, o) > 0; };
  P.objects = function (s, p) { return this.match(s, p, null).map(function (t) { return t.o; }); };
  P.subjects = function (p, o) { return this.match(null, p, o).map(function (t) { return t.s; }); };
  P.one = function (s, p) { var a = this.objects(s, p); return a.length ? a[0] : null; };
  P.isInferred = function (s, p, o) {
    var r = this._ids(s, p, o);
    this._ensure();
    return !!r && this.inferred.has(tkey(r[0], r[1], r[2]));
  };
  P.triples = function (opts) { return this.match(null, null, null, opts); };
  P.toNTriples = function () {
    var term = T();
    return this.triples().map(function (t) {
      return term.toString(t.s) + ' ' + term.toString(t.p) + ' ' +
        (t.o.type === 'literal' ? term.key(t.o) : term.toString(t.o)) + ' .';
    }).join('\n');
  };

  function create(triples, opts) {
    var st = new Store(opts), k;
    if (triples && triples.prefixes) for (k in triples.prefixes) if (!st.prefixes[k]) st.prefixes[k] = triples.prefixes[k];
    if (triples) st.addAll(triples);
    st.version = 0;
    if (st.reason.subClassOf || st.reason.subPropertyOf) st.materialise();
    return st;
  }

  SA.kg.store = { create: create, Store: Store };
})(typeof window !== 'undefined' ? window : globalThis);
