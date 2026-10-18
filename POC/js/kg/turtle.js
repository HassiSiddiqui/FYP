/*
 * SA.kg.term + SA.kg.turtle — RDF term helpers, a shared lexer, and a
 * Turtle-subset parser (RDF 1.1 Turtle, https://www.w3.org/TR/turtle/).
 *
 * Terms are plain objects:
 *   {type:'iri', value}            {type:'bnode', value}
 *   {type:'literal', value, datatype, lang}   (datatype always set; lang '' if none)
 * A triple is {s, p, o} of terms.
 *
 *   SA.kg.turtle.parse(text, opts) -> Array of triples, with .prefixes {pfx: iri}
 *       opts.prefixes  extra prefixes known before parsing
 *       opts.base      base IRI for relative <iri> (naive concatenation)
 *   SA.kg.turtle.tokenize(text, sparqlMode) -> tokens (also used by SA.kg.sparql)
 *
 * Supported: @prefix/PREFIX, @base/BASE, <iri>, prefixed names (incl. dots
 * inside local names), 'a', "..."/'...'/"""..."""/'''...''' with escapes,
 * @lang, ^^datatype, integer/decimal/double/true/false shorthands, ';' and
 * ',' lists (incl. trailing ';'), '#' comments, blank nodes _:x, [] and
 * [ predicate-object list ].
 * Not supported (throws with line:col): collections ( ... ), non-ASCII
 * names in prefixed names (ASCII \w only), PN_LOCAL '\' escapes.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.kg = SA.kg || {};

  // ---------------------------------------------------------------- terms
  var XSD = 'http://www.w3.org/2001/XMLSchema#';
  var RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  var RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
  var NUMERIC = {};
  ['integer', 'decimal', 'double', 'float', 'int', 'long', 'short', 'byte',
    'nonNegativeInteger', 'positiveInteger', 'negativeInteger', 'nonPositiveInteger',
    'unsignedInt', 'unsignedLong', 'unsignedShort', 'unsignedByte'
  ].forEach(function (n) { NUMERIC[XSD + n] = true; });

  function iri(v) { return { type: 'iri', value: v }; }
  function bnode(v) { return { type: 'bnode', value: v }; }
  function literal(v, datatype, lang) {
    lang = lang ? String(lang).toLowerCase() : '';
    return { type: 'literal', value: String(v), lang: lang,
      datatype: lang ? RDF + 'langString' : (datatype || XSD + 'string') };
  }
  function key(t) {
    if (t.type === 'iri') return '<' + t.value + '>';
    if (t.type === 'bnode') return '_:' + t.value;
    var k = JSON.stringify(t.value);
    if (t.lang) return k + '@' + t.lang;
    return t.datatype === XSD + 'string' ? k : k + '^^<' + t.datatype + '>';
  }
  function equals(a, b) { return !!a && !!b && key(a) === key(b); }
  function isNumeric(t) { return !!t && t.type === 'literal' && NUMERIC[t.datatype] === true; }
  function fromJS(v) {
    if (v && typeof v === 'object' && v.type) return v;
    if (typeof v === 'boolean') return literal(String(v), XSD + 'boolean');
    if (typeof v === 'number') {
      return Number.isInteger(v) ? literal(String(v), XSD + 'integer') : literal(String(v), XSD + 'decimal');
    }
    return literal(String(v));
  }
  function toJS(t) {
    if (!t) return null;
    if (t.type !== 'literal') return t.value;
    if (NUMERIC[t.datatype]) return Number(t.value);
    if (t.datatype === XSD + 'boolean') return t.value === 'true' || t.value === '1';
    return t.value;
  }
  // Compact an IRI with the longest matching namespace in prefixes {pfx: ns}.
  function shorten(v, prefixes) {
    var best = null, bestLen = 0;
    for (var p in prefixes) {
      var ns = prefixes[p];
      if (ns.length > bestLen && v.lastIndexOf(ns, 0) === 0 && /^[\w.-]*$/.test(v.slice(ns.length))) {
        best = p; bestLen = ns.length;
      }
    }
    return best === null ? '<' + v + '>' : best + ':' + v.slice(bestLen);
  }
  function toString(t, prefixes) {
    if (!t) return 'UNBOUND';
    if (t.type === 'iri') return prefixes ? shorten(t.value, prefixes) : '<' + t.value + '>';
    if (t.type === 'bnode') return '_:' + t.value;
    if (NUMERIC[t.datatype] || t.datatype === XSD + 'boolean') return t.value;
    var s = JSON.stringify(t.value);
    if (t.lang) return s + '@' + t.lang;
    if (t.datatype === XSD + 'string') return s;
    return s + '^^' + (prefixes ? shorten(t.datatype, prefixes) : '<' + t.datatype + '>');
  }

  // ---- SPARQL value semantics (SPARQL 1.1 §17), shared with SA.kg.sparql.
  // Operations throw ERR (a type error) where SPARQL raises an error.
  var ERR = { sparqlError: true };
  // 'n' numeric, 'b' boolean, 'd' dateTime/date, 's' string/langString,
  // 'o' other literal, else the term type ('iri' | 'bnode').
  function kind(t) {
    if (t.type !== 'literal') return t.type;
    if (NUMERIC[t.datatype]) return 'n';
    if (t.datatype === XSD + 'boolean') return 'b';
    if (t.datatype === XSD + 'dateTime' || t.datatype === XSD + 'date') return 'd';
    if (t.datatype === XSD + 'string' || t.lang) return 's';
    return 'o';
  }
  function val(t, k) {
    if (k === 'n') return Number(t.value);
    if (k === 'b') return (t.value === 'true' || t.value === '1') ? 1 : 0;
    if (k === 'd') return Date.parse(t.value);
    return t.value;
  }
  function bool(b) { return literal(b ? 'true' : 'false', XSD + 'boolean'); }
  function ebv(t) {              // effective boolean value (§17.2.2)
    var k = kind(t);
    if (k === 'b') return val(t, k) === 1;
    if (k === 'n') { var n = val(t, k); return n !== 0 && !isNaN(n); }
    if (k === 's') return t.value.length > 0;
    throw ERR;
  }
  function relop(op, a, b) {     // = != < > <= >= -> boolean, or throws ERR
    var ka = kind(a), kb = kind(b), x, y;
    if (ka === kb && (ka === 'n' || ka === 'b' || ka === 'd' || (ka === 's' && a.lang === b.lang))) {
      x = val(a, ka); y = val(b, kb);
      switch (op) {
        case '=': return x === y; case '!=': return x !== y;
        case '<': return x < y; case '>': return x > y;
        case '<=': return x <= y; case '>=': return x >= y;
      }
    }
    if (op === '=') return equals(a, b);
    if (op === '!=') return !equals(a, b);
    throw ERR;
  }
  function arith(op, a, b) {     // + - * / on numeric literals
    if (kind(a) !== 'n' || kind(b) !== 'n') throw ERR;
    var x = Number(a.value), y = Number(b.value);
    if (op === '/' && y === 0) throw ERR;
    var r = op === '+' ? x + y : op === '-' ? x - y : op === '*' ? x * y : x / y;
    var dt = (a.datatype === XSD + 'double' || b.datatype === XSD + 'double') ? XSD + 'double'
      : (op !== '/' && Number.isInteger(x) && Number.isInteger(y) &&
         a.datatype !== XSD + 'decimal' && b.datatype !== XSD + 'decimal') ? XSD + 'integer' : XSD + 'decimal';
    return literal(String(r), dt);
  }
  // ORDER BY comparator (§15.1): unbound < bnode < IRI < literal.
  function order(a, b) {
    var R = { bnode: 1, iri: 2, literal: 3 }, ra = a ? R[a.type] : 0, rb = b ? R[b.type] : 0;
    if (ra !== rb) return ra - rb;
    if (!a) return 0;
    var ka = kind(a), kb = kind(b);
    if (ka === kb && (ka === 'n' || ka === 'b' || ka === 'd')) {
      var x = val(a, ka), y = val(b, kb);
      if (x !== y) return x < y ? -1 : 1;
    }
    if (a.value !== b.value) return a.value < b.value ? -1 : 1;
    var da = (a.datatype || '') + '@' + (a.lang || ''), db = (b.datatype || '') + '@' + (b.lang || '');
    return da < db ? -1 : da > db ? 1 : 0;
  }

  SA.kg.term = {
    XSD: XSD, RDF: RDF, RDFS: RDFS, NUMERIC: NUMERIC, ERR: ERR,
    iri: iri, bnode: bnode, literal: literal, key: key, equals: equals,
    isNumeric: isNumeric, fromJS: fromJS, toJS: toJS, shorten: shorten, toString: toString,
    kind: kind, value: val, bool: bool, ebv: ebv, relop: relop, arith: arith, order: order
  };

  // ---------------------------------------------------------------- lexer
  // Token: {t: type, v: value, p: prefix (pname only), pos: offset}
  // Types: iri pname bnode str lang dt num word var op punct eof
  var RX = {
    ws: /(?:\s+|#[^\n]*)+/y,
    iri: /<([^<>"{}|^`\\\x00-\x20]*)>/y,
    str3d: /"""((?:[^"\\]|\\[\s\S]|"(?!""))*)"""/y,
    str3s: /'''((?:[^'\\]|\\[\s\S]|'(?!''))*)'''/y,
    strd: /"((?:[^"\\\n\r]|\\.)*)"/y,
    strs: /'((?:[^'\\\n\r]|\\.)*)'/y,
    vr: /[?$]([A-Za-z_][\w]*)/y,
    lang: /@([A-Za-z]+(?:-[A-Za-z0-9]+)*)/y,
    dt: /\^\^/y,
    bnode: /_:([\w-]+(?:\.[\w-]+)*)/y,
    pname: /((?:[A-Za-z](?:[\w-]|\.(?=[\w-]))*)?):((?:[\w:%-]|\.(?=[\w:%-]))*)/y,
    numT: /[+-]?(?:\d+\.\d*[eE][+-]?\d+|\.\d+[eE][+-]?\d+|\d+[eE][+-]?\d+|\d*\.\d+|\d+)/y,
    numS: /(?:\d+\.\d*[eE][+-]?\d+|\.\d+[eE][+-]?\d+|\d+[eE][+-]?\d+|\d*\.\d+|\d+)/y,
    word: /[A-Za-z_][\w]*/y,
    op: /\|\||&&|!=|<=|>=|[=<>!+*\/-]/y,
    punct: /[.;,\[\]\(\)\{\}]/y
  };
  var ESC = { t: '\t', b: '\b', n: '\n', r: '\r', f: '\f', '"': '"', "'": "'", '\\': '\\' };

  function lineCol(text, pos) {
    var before = text.slice(0, pos), lines = before.split('\n');
    return 'line ' + lines.length + ', col ' + (lines[lines.length - 1].length + 1);
  }
  function syntaxError(text, pos, msg) {
    var e = new SyntaxError(msg + ' at ' + lineCol(text, pos));
    e.pos = pos;
    return e;
  }
  function unescape(s, text, pos) {
    return s.replace(/\\(u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8}|[\s\S])/g, function (m, c) {
      if (c.length > 1) return String.fromCodePoint(parseInt(c.slice(1), 16));
      if (ESC.hasOwnProperty(c)) return ESC[c];
      throw syntaxError(text, pos, 'Bad string escape \\' + c);
    });
  }
  function numType(lex) {
    if (/[eE]/.test(lex)) return XSD + 'double';
    return lex.indexOf('.') >= 0 ? XSD + 'decimal' : XSD + 'integer';
  }

  function tokenize(text, sparql) {
    var toks = [], pos = 0, n = text.length, m;
    function at(re) { re.lastIndex = pos; m = re.exec(text); return m; }
    while (true) {
      if (at(RX.ws)) pos = RX.ws.lastIndex;
      if (pos >= n) break;
      var start = pos, tok = null;
      if (at(RX.iri)) tok = { t: 'iri', v: unescape(m[1], text, start) };
      else if (at(RX.str3d) || at(RX.str3s) || at(RX.strd) || at(RX.strs)) tok = { t: 'str', v: unescape(m[1], text, start) };
      else if (sparql && at(RX.vr)) tok = { t: 'var', v: m[1] };
      else if (at(RX.lang)) tok = { t: 'lang', v: m[1] };
      else if (at(RX.dt)) tok = { t: 'dt', v: '^^' };
      else if (at(RX.bnode)) tok = { t: 'bnode', v: m[1] };
      else if (at(RX.pname)) tok = { t: 'pname', p: m[1], v: m[2] };
      else if (at(sparql ? RX.numS : RX.numT)) tok = { t: 'num', v: m[0], dt: numType(m[0]) };
      else if (at(RX.word)) tok = { t: 'word', v: m[0] };
      else if (sparql && at(RX.op)) tok = { t: 'op', v: m[0] };
      else if (at(RX.punct)) tok = { t: 'punct', v: m[0] };
      else throw syntaxError(text, pos, 'Unexpected character ' + JSON.stringify(text.charAt(pos)));
      tok.pos = start;
      pos = start + m[0].length;
      toks.push(tok);
    }
    toks.push({ t: 'eof', v: '', pos: n });
    return toks;
  }

  // Small cursor over tokens, shared with the SPARQL parser.
  function Cursor(text, toks) { this.text = text; this.toks = toks; this.i = 0; }
  Cursor.prototype.peek = function (k) { return this.toks[this.i + (k || 0)]; };
  Cursor.prototype.next = function () { return this.toks[this.i++]; };
  Cursor.prototype.is = function (t, v) {
    var tok = this.toks[this.i];
    return tok.t === t && (v === undefined || tok.v === v);
  };
  Cursor.prototype.isWord = function (w) {
    var tok = this.toks[this.i];
    return tok.t === 'word' && tok.v.toUpperCase() === w;
  };
  Cursor.prototype.accept = function (t, v) { if (this.is(t, v)) return this.next(); return null; };
  Cursor.prototype.expect = function (t, v) {
    if (this.is(t, v)) return this.next();
    throw this.error('Expected ' + (v || t));
  };
  Cursor.prototype.error = function (msg) {
    var tok = this.toks[this.i];
    return syntaxError(this.text, tok.pos, msg + ', found ' + (tok.t === 'eof' ? 'end of input' : JSON.stringify(tok.v)));
  };
  // Expand an iri/pname token, resolving relative IRIs against base (naive).
  Cursor.prototype.iriOf = function (tok, prefixes, base) {
    if (tok.t === 'iri') {
      return (base && !/^[A-Za-z][\w+.-]*:/.test(tok.v)) ? base + tok.v : tok.v;
    }
    if (!Object.prototype.hasOwnProperty.call(prefixes, tok.p)) {
      throw syntaxError(this.text, tok.pos, 'Unknown prefix "' + tok.p + ':"');
    }
    return prefixes[tok.p] + tok.v;
  };
  // Literal after a 'str' token: optional @lang or ^^datatype.
  Cursor.prototype.literalRest = function (strTok, prefixes, base) {
    var l = this.accept('lang');
    if (l) return literal(strTok.v, null, l.v);
    if (this.accept('dt')) {
      var d = this.next();
      if (d.t !== 'iri' && d.t !== 'pname') { this.i--; throw this.error('Expected datatype IRI'); }
      return literal(strTok.v, this.iriOf(d, prefixes, base));
    }
    return literal(strTok.v);
  };

  // ---------------------------------------------------------------- Turtle parser
  function parse(text, opts) {
    opts = opts || {};
    var c = new Cursor(text, tokenize(text, false));
    var prefixes = {}, base = opts.base || '', out = [], bn = 0;
    var k;
    if (opts.prefixes) for (k in opts.prefixes) prefixes[k] = opts.prefixes[k];
    var RDF_TYPE = iri(RDF + 'type');
    var bprefix = 'b' + (parse.counter = (parse.counter || 0) + 1) + '_';

    function freshBnode() { return bnode(bprefix + (bn++)); }
    function nsToken() {
      var tok = c.next();
      if (tok.t !== 'pname' || tok.v !== '') { c.i--; throw c.error('Expected prefix name like "ex:"'); }
      return tok.p;
    }
    function directive() {
      var tok = c.peek();
      var at = tok.t === 'lang' && (tok.v === 'prefix' || tok.v === 'base');
      var kw = tok.t === 'word' && /^(PREFIX|BASE)$/i.test(tok.v);
      if (!at && !kw) return false;
      c.next();
      var isPrefix = tok.v.toLowerCase() === 'prefix';
      var p = isPrefix ? nsToken() : null;
      var ref = c.expect('iri');
      var v = c.iriOf(ref, prefixes, base);
      if (isPrefix) prefixes[p] = v; else base = v;
      if (at) c.expect('punct', '.');
      return true;
    }
    function subject() {
      var tok = c.next();
      if (tok.t === 'iri' || tok.t === 'pname') return iri(c.iriOf(tok, prefixes, base));
      if (tok.t === 'bnode') return bnode(bprefix + 'l_' + tok.v);
      if (tok.t === 'punct' && tok.v === '[') return blankPropList();
      c.i--;
      if (tok.t === 'punct' && tok.v === '(') throw c.error('RDF collections are not supported');
      throw c.error('Expected subject');
    }
    function verb() {
      var tok = c.next();
      if (tok.t === 'word' && tok.v === 'a') return RDF_TYPE;
      if (tok.t === 'iri' || tok.t === 'pname') return iri(c.iriOf(tok, prefixes, base));
      c.i--;
      throw c.error('Expected predicate');
    }
    function object() {
      var tok = c.next();
      switch (tok.t) {
        case 'iri': case 'pname': return iri(c.iriOf(tok, prefixes, base));
        case 'bnode': return bnode(bprefix + 'l_' + tok.v);
        case 'str': return c.literalRest(tok, prefixes, base);
        case 'num': return literal(tok.v, tok.dt);
        case 'word':
          if (tok.v === 'true' || tok.v === 'false') return literal(tok.v, XSD + 'boolean');
          break;
        case 'punct':
          if (tok.v === '[') return blankPropList();
          if (tok.v === '(') { c.i--; throw c.error('RDF collections are not supported'); }
          break;
      }
      c.i--;
      throw c.error('Expected object');
    }
    // After '[': returns the new blank node; consumes up to and including ']'.
    function blankPropList() {
      var b = freshBnode();
      if (!c.accept('punct', ']')) { predObjList(b); c.expect('punct', ']'); }
      return b;
    }
    function predObjList(s) {
      while (true) {
        var p = verb();
        do { out.push({ s: s, p: p, o: object() }); } while (c.accept('punct', ','));
        if (!c.accept('punct', ';')) return;
        while (c.accept('punct', ';')) { /* repeated ';' allowed */ }
        if (c.is('punct', '.') || c.is('punct', ']') || c.is('eof')) return;
      }
    }

    while (!c.is('eof')) {
      if (directive()) continue;
      var startTok = c.peek();
      var s = subject();
      var bareBlank = startTok.t === 'punct' && startTok.v === '[';
      if (!(bareBlank && c.is('punct', '.'))) predObjList(s);
      c.expect('punct', '.');
    }
    out.prefixes = prefixes;
    out.base = base;
    return out;
  }

  SA.kg.turtle = {
    parse: parse,
    tokenize: tokenize,
    Cursor: Cursor,
    syntaxError: syntaxError
  };
})(typeof window !== 'undefined' ? window : globalThis);
