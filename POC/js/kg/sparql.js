/*
 * SA.kg.sparql — SPARQL 1.1 SELECT subset over an SA.kg.store.
 *
 *   SA.kg.sparql.query(store, text, opts) -> {vars, rows, elapsedMs}
 *       rows: [{varName: term}] (unbound vars are absent from the row)
 *       opts.bindings  {var: term|number|boolean|string} initial solution
 *                      (parameterised queries; like a one-row VALUES)
 *       Prefixes known to the store are implicitly declared (PREFIX wins).
 *   SA.kg.sparql.parse(text, defaultPrefixes) -> AST
 *   SA.kg.sparql.exec(store, ast, opts)        -> {vars, rows, elapsedMs}
 *   SA.kg.sparql.values(result, prefixes?)     -> rows of plain JS values
 *       (IRIs compacted when prefixes given, numbers, booleans, strings, null)
 *
 * Supported: PREFIX, BASE, SELECT [DISTINCT|REDUCED] (?v... | *) [WHERE] {
 *   triple patterns with ';' ',' 'a', vars, IRIs, prefixed names, literals,
 *   _:x / [] / [ p o ] as hidden variables; FILTER; OPTIONAL {...} (nestable);
 *   nested {...} groups } ORDER BY (?v | ASC(e) | DESC(e) | (e))+ LIMIT n OFFSET n.
 * Expressions: || && ! = != < > <= >= + - * / unary -, BOUND, REGEX, STR,
 *   LANG, DATATYPE, isIRI/isURI, isLiteral, isBlank, isNumeric, sameTerm,
 *   LCASE, UCASE, STRLEN, CONTAINS, STRSTARTS, STRENDS, ABS.
 * Unsupported constructs throw: UNION, MINUS, GRAPH, BIND, VALUES, SERVICE,
 *   sub-queries, aggregates/GROUP BY, property paths, CONSTRUCT/ASK/DESCRIBE.
 *
 * Semantics (SPARQL 1.1 §18): group elements are joined left to right;
 * OPTIONAL is a left join evaluated per solution (exact for well-designed
 * patterns); FILTERs are group-scoped and applied after the group; filter
 * errors drop the row, with the §17.2 three-valued || and &&. ORDER BY uses
 * unbound < blank < IRI < literal, numeric/boolean/dateTime by value,
 * otherwise lexical; sort is stable. BGPs use index nested-loop joins with
 * a greedy order (connected first, most bound positions, smallest count).
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.kg = SA.kg || {};

  var UNSUPPORTED = { UNION: 1, MINUS: 1, GRAPH: 1, BIND: 1, VALUES: 1, SERVICE: 1, SELECT: 1,
    CONSTRUCT: 1, ASK: 1, DESCRIBE: 1, FROM: 1, GROUP: 1, HAVING: 1, NOT: 1, EXISTS: 1, IN: 1,
    COUNT: 1, SUM: 1, MIN: 1, MAX: 1, AVG: 1, SAMPLE: 1, GROUP_CONCAT: 1 };
  var REL = { '=': 1, '!=': 1, '<': 1, '>': 1, '<=': 1, '>=': 1 };
  var T = function () { return SA.kg.term; };   // value semantics live in kg/turtle.js
  function kind(t) { return T().kind(t); }
  function bool(b) { return T().bool(b); }
  function ebv(t) { return T().ebv(t); }
  function isErr(x) { return x === T().ERR; }
  function fail() { throw T().ERR; }

  function unsupported(c, what) {
    var e = c.error('Unsupported SPARQL feature: ' + what);
    e.unsupported = true;
    return e;
  }

  // ------------------------------------------------------------------ parser
  function parse(text, defaults) {
    var K = SA.kg.turtle, term = T(), c = new K.Cursor(text, K.tokenize(text, true));
    var prefixes = {}, base = '', allVars = [], seen = {}, anon = 0, k;
    if (defaults) for (k in defaults) prefixes[k] = defaults[k];
    function noteVar(v) { if (!seen[v]) { seen[v] = 1; allVars.push(v); } }
    function iriTerm(tok) { return term.iri(c.iriOf(tok, prefixes, base)); }

    while (true) {
      if (c.isWord('PREFIX')) {
        c.next();
        var ns = c.next();
        if (ns.t !== 'pname' || ns.v !== '') { c.i--; throw c.error('Expected prefix name like "ex:"'); }
        prefixes[ns.p] = c.iriOf(c.expect('iri'), prefixes, base);
      } else if (c.isWord('BASE')) {
        c.next(); base = c.iriOf(c.expect('iri'), prefixes, base);
      } else break;
    }
    if (!c.isWord('SELECT')) {
      var w = c.peek();
      if (w.t === 'word' && UNSUPPORTED[w.v.toUpperCase()]) throw unsupported(c, w.v);
      throw c.error('Expected SELECT');
    }
    c.next();
    var distinct = false, vars = null;
    if (c.isWord('DISTINCT') || c.isWord('REDUCED')) { c.next(); distinct = true; }
    if (!c.accept('op', '*')) {
      vars = [];
      while (c.is('var')) vars.push(c.next().v);
      if (c.is('punct', '(')) throw unsupported(c, 'SELECT expressions');
      if (!vars.length) throw c.error('Expected variables or *');
    }
    if (c.isWord('FROM')) throw unsupported(c, 'FROM');
    if (c.isWord('WHERE')) c.next();
    var where = group();
    var order = [], limit = -1, offset = 0;
    if (c.isWord('GROUP') || c.isWord('HAVING')) throw unsupported(c, 'GROUP BY / HAVING');
    if (c.isWord('ORDER')) {
      c.next();
      if (!c.isWord('BY')) throw c.error('Expected BY');
      c.next();
      while (true) {
        if (c.isWord('ASC') || c.isWord('DESC')) {
          var desc = c.next().v.toUpperCase() === 'DESC';
          c.expect('punct', '('); var e = expr(); c.expect('punct', ')');
          order.push({ expr: e, desc: desc });
        } else if (c.is('var')) order.push({ expr: { op: 'var', v: c.next().v }, desc: false });
        else if (c.is('punct', '(') || (c.is('word') && !c.isWord('LIMIT') && !c.isWord('OFFSET'))) {
          order.push({ expr: prim(), desc: false });
        } else break;
      }
      if (!order.length) throw c.error('Expected ORDER BY condition');
    }
    while (c.isWord('LIMIT') || c.isWord('OFFSET')) {
      var isLimit = c.next().v.toUpperCase() === 'LIMIT', n = c.expect('num');
      if (!/^\d+$/.test(n.v)) throw c.error('Expected integer');
      if (isLimit) limit = +n.v; else offset = +n.v;
    }
    if (!c.is('eof')) throw c.error('Unexpected token after query');
    return { prefixes: prefixes, distinct: distinct, vars: vars, allVars: allVars,
      where: where, order: order, limit: limit, offset: offset };

    function group() {
      c.expect('punct', '{');
      var items = [];
      while (!c.accept('punct', '}')) {
        if (c.is('eof')) throw c.error('Expected }');
        if (c.accept('punct', '.')) continue;
        if (c.isWord('OPTIONAL')) { c.next(); items.push({ type: 'optional', group: group() }); continue; }
        if (c.isWord('FILTER')) { c.next(); items.push({ type: 'filter', expr: constraint() }); continue; }
        if (c.is('punct', '{')) {
          var g = group();
          if (c.isWord('UNION')) throw unsupported(c, 'UNION');
          items.push({ type: 'group', group: g });
          continue;
        }
        var w = c.peek();
        if (w.t === 'word' && w.v !== 'a' && UNSUPPORTED[w.v.toUpperCase()]) throw unsupported(c, w.v);
        var pats = bgpOf(items);
        predObjList(node(pats), pats);
      }
      return { items: items };
    }
    function bgpOf(items) {        // BGPs are not split by FILTERs (group-scoped)
      for (var i = items.length - 1; i >= 0; i--) {
        if (items[i].type === 'bgp') return items[i].patterns;
        if (items[i].type !== 'filter') break;
      }
      var b = { type: 'bgp', patterns: [] };
      items.push(b);
      return b.patterns;
    }
    function predObjList(s, pats) {
      while (true) {
        var p = verb();
        do { pats.push([s, p, node(pats)]); } while (c.accept('punct', ','));
        if (!c.accept('punct', ';')) break;
        while (c.accept('punct', ';')) { /* empty */ }
        if (c.is('punct', '.') || c.is('punct', '}') || c.is('punct', ']') ||
            c.isWord('FILTER') || c.isWord('OPTIONAL')) break;
      }
      if (c.is('op', '/') || c.is('op', '|') || c.is('op', '*') || c.is('op', '+')) throw unsupported(c, 'property paths');
    }
    function verb() {
      var tok = c.next();
      if (tok.t === 'var') { noteVar(tok.v); return { v: tok.v }; }
      if (tok.t === 'word' && tok.v === 'a') return term.iri(term.RDF + 'type');
      if (tok.t === 'iri' || tok.t === 'pname') {
        if (c.is('op', '/') || c.is('op', '|') || c.is('op', '*') || c.is('op', '+')) throw unsupported(c, 'property paths');
        return iriTerm(tok);
      }
      c.i--;
      throw c.error('Expected predicate');
    }
    function node(pats) {
      var tok = c.next();
      switch (tok.t) {
        case 'var': noteVar(tok.v); return { v: tok.v };
        case 'iri': case 'pname': return iriTerm(tok);
        case 'bnode': return { v: '_:' + tok.v };
        case 'str': return c.literalRest(tok, prefixes, base);
        case 'num': return term.literal(tok.v, tok.dt);
        case 'word':
          if (tok.v === 'true' || tok.v === 'false') return term.literal(tok.v, term.XSD + 'boolean');
          break;
        case 'op':
          if (tok.v === '-' || tok.v === '+') {
            var n = c.expect('num');
            return term.literal((tok.v === '-' ? '-' : '') + n.v, n.dt);
          }
          break;
        case 'punct':
          if (tok.v === '[') {
            var b = { v: '_:anon' + (anon++) };
            if (!c.accept('punct', ']')) { predObjList(b, pats); c.expect('punct', ']'); }
            return b;
          }
          if (tok.v === '(') { c.i--; throw unsupported(c, 'RDF collections'); }
      }
      c.i--;
      throw c.error('Expected term or variable');
    }
    function constraint() {
      if (c.accept('punct', '(')) { var e = expr(); c.expect('punct', ')'); return e; }
      return prim();
    }
    function expr() {
      var a = andE();
      while (c.accept('op', '||')) a = { op: '||', a: a, b: andE() };
      return a;
    }
    function andE() {
      var a = rel();
      while (c.accept('op', '&&')) a = { op: '&&', a: a, b: rel() };
      return a;
    }
    function rel() {
      var a = add(), t = c.peek();
      if (t.t === 'op' && REL[t.v]) { c.next(); return { op: t.v, a: a, b: add() }; }
      if (c.isWord('IN') || c.isWord('NOT')) throw unsupported(c, 'IN / NOT IN');
      return a;
    }
    function add() {
      var a = mul();
      while (c.is('op', '+') || c.is('op', '-')) { var o = c.next().v; a = { op: o, a: a, b: mul() }; }
      return a;
    }
    function mul() {
      var a = un();
      while (c.is('op', '*') || c.is('op', '/')) { var o = c.next().v; a = { op: o, a: a, b: un() }; }
      return a;
    }
    function un() {
      if (c.accept('op', '!')) return { op: '!', a: un() };
      if (c.accept('op', '-')) return { op: 'neg', a: un() };
      if (c.accept('op', '+')) return un();
      return prim();
    }
    function prim() {
      var tok = c.next();
      switch (tok.t) {
        case 'punct':
          if (tok.v === '(') { var e = expr(); c.expect('punct', ')'); return e; }
          break;
        case 'var': return { op: 'var', v: tok.v };
        case 'iri': case 'pname':
          if (c.is('punct', '(')) throw unsupported(c, 'extension functions');
          return { op: 'const', term: iriTerm(tok) };
        case 'str': return { op: 'const', term: c.literalRest(tok, prefixes, base) };
        case 'num': return { op: 'const', term: term.literal(tok.v, tok.dt) };
        case 'word':
          if (tok.v === 'true' || tok.v === 'false') return { op: 'const', term: term.literal(tok.v, term.XSD + 'boolean') };
          var name = tok.v.toUpperCase(), f = FUNCS[name];
          if (!f && name !== 'BOUND') { c.i--; throw unsupported(c, tok.v); }
          c.expect('punct', '(');
          var args = [];
          if (name === 'BOUND') args.push({ op: 'var', v: c.expect('var').v });
          else if (!c.is('punct', ')')) { args.push(expr()); while (c.accept('punct', ',')) args.push(expr()); }
          c.expect('punct', ')');
          if (f && (args.length < f[0] || args.length > f[1])) throw c.error(name + ' takes ' + f[0] + '-' + f[1] + ' arguments');
          return { op: 'fn', name: name, args: args };
      }
      c.i--;
      throw c.error('Expected expression');
    }
  }

  // ------------------------------------------------------------------ values & expressions
  function lit(t) { if (t.type !== 'literal') fail(); return t.value; }
  function str(v) { return T().literal(v); }
  var rxCache = new Map();
  var FUNCS = {
    REGEX: [2, 3, function (a) {
      var pat = lit(a[1]), fl = a[2] ? lit(a[2]).replace(/[^ims]/g, '') : '', k = fl + '/' + pat, re = rxCache.get(k);
      if (!re) { try { re = new RegExp(pat, fl); } catch (e) { fail(); } rxCache.set(k, re); }
      return bool(re.test(lit(a[0])));
    }],
    STR: [1, 1, function (a) { if (a[0].type === 'bnode') fail(); return str(a[0].value); }],
    LANG: [1, 1, function (a) { lit(a[0]); return str(a[0].lang || ''); }],
    DATATYPE: [1, 1, function (a) { lit(a[0]); return T().iri(a[0].datatype); }],
    ISIRI: [1, 1, function (a) { return bool(a[0].type === 'iri'); }],
    ISURI: [1, 1, function (a) { return bool(a[0].type === 'iri'); }],
    ISLITERAL: [1, 1, function (a) { return bool(a[0].type === 'literal'); }],
    ISBLANK: [1, 1, function (a) { return bool(a[0].type === 'bnode'); }],
    ISNUMERIC: [1, 1, function (a) { return bool(kind(a[0]) === 'n'); }],
    SAMETERM: [2, 2, function (a) { return bool(T().equals(a[0], a[1])); }],
    LCASE: [1, 1, function (a) { return str(lit(a[0]).toLowerCase()); }],
    UCASE: [1, 1, function (a) { return str(lit(a[0]).toUpperCase()); }],
    STRLEN: [1, 1, function (a) { return T().literal(String(lit(a[0]).length), T().XSD + 'integer'); }],
    CONTAINS: [2, 2, function (a) { return bool(lit(a[0]).indexOf(lit(a[1])) >= 0); }],
    STRSTARTS: [2, 2, function (a) { return bool(lit(a[0]).lastIndexOf(lit(a[1]), 0) === 0); }],
    STRENDS: [2, 2, function (a) { var s = lit(a[0]), e = lit(a[1]); return bool(s.slice(s.length - e.length) === e); }],
    ABS: [1, 1, function (a) { if (kind(a[0]) !== 'n') fail(); return T().literal(String(Math.abs(+a[0].value)), a[0].datatype); }]
  };

  function ev(st, e, mu) {
    var a, ea;
    switch (e.op) {
      case 'var': if (mu[e.v] === undefined) fail(); return st.term(mu[e.v]);
      case 'const': return e.term;
      case '||':
        ea = false;
        try { if (ebv(ev(st, e.a, mu))) return bool(true); } catch (x) { if (!isErr(x)) throw x; ea = true; }
        if (ebv(ev(st, e.b, mu))) return bool(true);
        if (ea) fail();
        return bool(false);
      case '&&':
        ea = false;
        try { if (!ebv(ev(st, e.a, mu))) return bool(false); } catch (x) { if (!isErr(x)) throw x; ea = true; }
        if (!ebv(ev(st, e.b, mu))) return bool(false);
        if (ea) fail();
        return bool(true);
      case '!': return bool(!ebv(ev(st, e.a, mu)));
      case 'neg': a = ev(st, e.a, mu); if (kind(a) !== 'n') fail(); return T().literal(String(-Number(a.value)), a.datatype);
      case 'fn':
        if (e.name === 'BOUND') return bool(mu[e.args[0].v] !== undefined);
        return FUNCS[e.name][2](e.args.map(function (x) { return ev(st, x, mu); }));
      case '+': case '-': case '*': case '/': return T().arith(e.op, ev(st, e.a, mu), ev(st, e.b, mu));
      default: return bool(T().relop(e.op, ev(st, e.a, mu), ev(st, e.b, mu)));
    }
  }
  function test(st, e, mu) {
    try { return ebv(ev(st, e, mu)); } catch (x) { if (isErr(x)) return false; throw x; }
  }

  // ------------------------------------------------------------------ evaluation
  function evalBGP(ctx, pats, omega) {
    if (!omega.length || !pats.length) return omega;
    var st = ctx.store, bound = {}, rest = pats.slice(), plan = [], k, i, j;
    for (k in omega[0]) bound[k] = 1;
    for (i = 0; i < pats.length; i++) for (j = 0; j < 3; j++) {
      if (pats[i][j].v === undefined && ctx.cid(pats[i][j]) < 0) return [];   // unknown constant
    }
    while (rest.length) {
      var best = 0, bk = null;
      for (i = 0; i < rest.length; i++) {
        var p = rest[i], nb = 0, conn = 0, nv = 0, ids = [-1, -1, -1];
        for (j = 0; j < 3; j++) {
          if (p[j].v === undefined) { nb++; ids[j] = ctx.cid(p[j]); } else { nv++; if (bound[p[j].v]) { nb++; conn = 1; } }
        }
        var key = [conn || (nv === 0 ? 1 : 0), nb, -st.countIds(ids[0], ids[1], ids[2])];
        if (!bk || key[0] > bk[0] || (key[0] === bk[0] && (key[1] > bk[1] || (key[1] === bk[1] && key[2] > bk[2])))) { bk = key; best = i; }
      }
      var chosen = rest.splice(best, 1)[0];
      plan.push(chosen);
      for (j = 0; j < 3; j++) if (chosen[j].v !== undefined) bound[chosen[j].v] = 1;
    }
    plan.forEach(function (tp) {
      if (!omega.length) return;
      var next = [];
      omega.forEach(function (mu) {
        var r = tp.map(function (x) { return x.v === undefined ? ctx.cid(x) : (mu[x.v] === undefined ? -1 : mu[x.v]); });
        st.forEachIds(r[0], r[1], r[2], function (s, p, o) {
          var m = {}, q, vals = [s, p, o];
          for (q in mu) m[q] = mu[q];
          for (q = 0; q < 3; q++) {
            var x = tp[q];
            if (x.v === undefined) continue;
            if (m[x.v] !== undefined && m[x.v] !== vals[q]) return;
            m[x.v] = vals[q];
          }
          next.push(m);
        });
      });
      omega = next;
    });
    return omega;
  }
  function evalGroup(ctx, g, omega) {
    var filters = [];
    g.items.forEach(function (it) {
      if (it.type === 'bgp') omega = evalBGP(ctx, it.patterns, omega);
      else if (it.type === 'group') omega = evalGroup(ctx, it.group, omega);
      else if (it.type === 'filter') filters.push(it.expr);
      else {
        var out = [];
        omega.forEach(function (mu) {
          var e = evalGroup(ctx, it.group, [mu]);
          if (e.length) Array.prototype.push.apply(out, e); else out.push(mu);
        });
        omega = out;
      }
    });
    if (!filters.length) return omega;
    return omega.filter(function (mu) {
      for (var i = 0; i < filters.length; i++) if (!test(ctx.store, filters[i], mu)) return false;
      return true;
    });
  }
  function now() { return (root.performance && root.performance.now) ? root.performance.now() : Date.now(); }

  function exec(store, q, opts) {
    opts = opts || {};
    var t0 = now(), cmap = new Map(), init = {}, k;
    var ctx = { store: store, cid: function (t) { var id = cmap.get(t); if (id === undefined) { id = store.id(t); cmap.set(t, id); } return id; } };
    if (opts.bindings) for (k in opts.bindings) init[k.replace(/^[?$]/, '')] = store.intern(T().fromJS(opts.bindings[k]));
    var omega = evalGroup(ctx, q.where, [init]);
    if (q.order.length) {
      var keyed = omega.map(function (mu, i) {
        return { mu: mu, i: i, keys: q.order.map(function (o) {
          try { return ev(store, o.expr, mu); } catch (x) { if (!isErr(x)) throw x; return undefined; }
        }) };
      });
      keyed.sort(function (a, b) {
        for (var j = 0; j < q.order.length; j++) {
          var c = T().order(a.keys[j], b.keys[j]);
          if (c) return q.order[j].desc ? -c : c;
        }
        return a.i - b.i;
      });
      omega = keyed.map(function (x) { return x.mu; });
    }
    var vars = (q.vars || q.allVars).slice();
    if (q.distinct) {
      var seen = new Set();
      omega = omega.filter(function (mu) {
        var key = vars.map(function (v) { return mu[v] === undefined ? '' : mu[v]; }).join(',');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    omega = omega.slice(q.offset, q.limit >= 0 ? q.offset + q.limit : undefined);
    var rows = omega.map(function (mu) {
      var r = {};
      vars.forEach(function (v) { if (mu[v] !== undefined) r[v] = store.term(mu[v]); });
      return r;
    });
    return { vars: vars, rows: rows, elapsedMs: now() - t0 };
  }

  function query(store, text, opts) {
    var cache = store._sparqlCache || (store._sparqlCache = new Map()), ast = cache.get(text);
    if (!ast) {
      ast = parse(text, store.prefixes);
      if (cache.size > 256) cache.clear();
      cache.set(text, ast);
    }
    return exec(store, ast, opts);
  }
  function values(result, prefixes) {
    var term = T();
    return result.rows.map(function (row) {
      var out = {};
      result.vars.forEach(function (v) {
        var t = row[v];
        out[v] = t === undefined ? null : t.type === 'iri' ? (prefixes ? term.shorten(t.value, prefixes) : t.value)
          : t.type === 'bnode' ? '_:' + t.value : term.toJS(t);
      });
      return out;
    });
  }

  SA.kg.sparql = { parse: parse, exec: exec, query: query, values: values };
})(typeof window !== 'undefined' ? window : globalThis);
