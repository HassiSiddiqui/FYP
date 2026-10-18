/*
 * SA.kg.resolver (+ alias SA.kg.resolve) — CogLign entity resolver (ADR 0003 D6-D11).
 *
 *   S(d) = gate(d) * clamp01(.35 f_T + .30 f_S + .20 f_X + .15 f_R), rounded ONCE to 4 dp.
 *   gate  = the SPARQL BGP (?d a <class> ; saref:hasFunction ?fn . ?fn saref:hasCommand <cmd>)
 *   f_T   = 1 for every gated candidate (typed with the category class)
 *   f_S   = 1 if the active room bot:containsElement d
 *   f_X   = 1 if the command changes d's state (after clamping); f_X = 0 on the acted-on entity -> noop
 *   f_R   = n_d / K over the last K <= 10 sa:Confirmed executions of (command, class); K = 0 -> 1/N
 *   s     = round2(S(acted-on) x roomConfidence); presets s = gated steps / steps.
 *   Ranking uses S' = S x prod(modifiers) (ErrP memory, ADR 0002 D18) - never s.
 *
 *   init()  resolve(req, ctx) -> resolved (emits kg:resolved)   registerModifier(name, fn)
 *   lastQuery   cq(n, bindings) -> {id, text, vars, rows}   presetSteps(id, devices)
 *   candidateQuery(cls, cmd)   triples()   reload()
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.kg = SA.kg || {};

  var HOME = 'https://silentassist.example/home#';
  var PREFIXES = 'PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\n' +
    'PREFIX saref: <https://saref.etsi.org/core/>\n' +
    'PREFIX bot: <https://w3id.org/bot#>\n' +
    'PREFIX sosa: <http://www.w3.org/ns/sosa/>\n' +
    'PREFIX sa: <https://silentassist.example/ns#>\n' +
    'PREFIX : <https://silentassist.example/home#>\n';
  var CATEGORY = { light: 'sa:Light', fan: 'sa:Fan', ac: 'sa:AirConditioner', tv: 'sa:Television' };
  var NOUN = { light: 'Light', fan: 'Fan', ac: 'Air Conditioner', tv: 'TV' };
  var DEG = '°', TIMES = '×', MIDDOT = '·';

  var store = null, modifiers = {}, offs = [];
  var R = { lastQuery: null, lastResolved: null };

  function round(x, dp) { var f = Math.pow(10, dp); return Math.round((x + (x < 0 ? -1 : 1) * Number.EPSILON) * f) / f; }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function cfg() {
    var k = (SA.config && SA.config.kg) || {};
    return { w: k.weights || { type: .35, space: .30, state: .20, recency: .15 }, K: k.recencyWindow || 10,
      roomConfidence: k.roomConfidence != null ? k.roomConfidence : .95,
      rooms: k.rooms || { MasterBedroom: 'Master Bedroom', LivingRoom: 'Living Room' } };
  }
  function hFlagThreshold() {
    var e = SA.config && SA.config.errp && SA.config.errp.penalty;
    return e && e.hFlag != null ? e.hFlag : 0.9;
  }
  function M() { return SA.kg.mirror; }
  function vals(res) { return SA.kg.sparql.values(res, store.prefixes); }
  function loc(v) { return v && v.charAt(0) === ':' ? v.slice(1) : v; }

  function reload() {
    store = SA.kg.store.create(SA.kg.turtle.parse(SA.kg.ontologyTTL), { subClassOf: true });
    R.lastQuery = null; R.lastResolved = null;
    return store;
  }
  function triples() { return store || reload(); }
  function run(text, opts) { triples(); return SA.kg.sparql.query(store, text, opts); }

  // ------------------------------------------------------------ query text
  function candidateQuery(cls, cmd) {
    return PREFIXES + 'SELECT ?d ?label ?space ?power ?order WHERE {\n  ?d a ' + cls + ' ;\n     rdfs:label ?label ;\n' +
      '     saref:hasFunction ?fn ;\n     saref:hasStateOfInterest ?soi .\n  ?fn saref:hasCommand ' + cmd + ' .\n' +
      '  ?soi saref:hasStateKind sa:PowerState ;\n       saref:hasStateValue ?power .\n  ?space a bot:Space ;\n' +
      '         bot:containsElement ?d .\n  OPTIONAL { ?d sa:displayOrder ?order }\n}\nORDER BY ?order ?label';
  }
  function recencyQuery(cls, cmd, K) {
    return PREFIXES + 'SELECT ?e ?d WHERE {\n  ?e a sa:ActionExecution ; sa:outcome sa:Confirmed ; sa:command ' + cmd + ' ;\n' +
      '     sa:resolvedEntity ?d ; saref:hasTimestamp ?ts .\n  ?d a ' + cls + ' .\n}\nORDER BY DESC(?ts)\nLIMIT ' + K;
  }
  function presetQuery(id) {
    return PREFIXES + 'SELECT ?step ?order ?d ?cmd ?value ?sv ?svLabel ?fn WHERE {\n  :' + id + ' sa:hasStep ?step .\n' +
      '  ?step sa:stepOrder ?order ; sa:targetDevice ?d ; sa:command ?cmd .\n  OPTIONAL { ?step sa:targetValue ?value }\n' +
      '  OPTIONAL { ?step sa:targetStateValue ?sv . ?sv rdfs:label ?svLabel }\n' +
      '  OPTIONAL { ?d saref:hasFunction ?fn . ?fn saref:hasCommand ?cmd }\n}\nORDER BY ?order';
  }

  // ------------------------------------------------------------ helpers
  function stateText(dev, command) {
    switch (command) {
      case 'SetBrightness': return 'at ' + dev.brightness + '%';
      case 'SetFanSpeed': return 'at ' + (dev.speed ? dev.speed.charAt(0).toUpperCase() + dev.speed.slice(1) : 'that speed');
      case 'SetTemperature': return 'at ' + dev.setpoint + DEG + 'C';
      case 'SetMode': return 'in ' + dev.mode.charAt(0).toUpperCase() + dev.mode.slice(1) + ' mode';
      case 'ChannelUp': case 'ChannelDown': return 'on channel ' + dev.channel;
      case 'VolumeUp': case 'VolumeDown': return 'at volume ' + dev.volume + '%';
      default: return dev.power === 'standby' ? 'in Standby' : dev.power === 'on' ? 'ON' : 'OFF';
    }
  }
  function noopReason(dev, command) {
    if (dev.kind === 'tv' && dev.power !== 'on' && /^(Channel|Volume)/.test(command)) return 'Smart TV is in Standby';
    return 'No change: ' + dev.label + ' is already ' + stateText(dev, command);
  }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function commandLabel(cmd) {
    var r = vals(run(PREFIXES + 'SELECT ?l WHERE { sa:' + cmd + ' rdfs:label ?l }'));
    return r.length ? r[0].l : cmd;
  }
  function intentLabel(dev, n, after) {
    if (n.command === 'SetTemperature') return 'Set Temperature ' + after.setpoint + DEG + 'C';
    if (n.command === 'SetBrightness') return 'Adjust Brightness ' + after.brightness + '%';
    if (n.command === 'SetFanSpeed') return 'Set Fan Speed ' + after.speed.charAt(0).toUpperCase() + after.speed.slice(1);
    if (n.command === 'SetMode') return 'Set Mode ' + after.mode.charAt(0).toUpperCase() + after.mode.slice(1);
    return commandLabel(n.command) + ' ' + NOUN[dev.kind];
  }
  function modifierProduct(id, command, room) {
    var m = 1, parts = {};
    for (var k in modifiers) {
      var f = Number(modifiers[k](id, command, room));
      if (!isFinite(f)) f = 1;
      parts[k] = f; m *= f;
    }
    return { m: m, parts: parts };
  }
  function activeRoomOf(ctx) {
    if (ctx && ctx.activeRoom) return ctx.activeRoom;
    try { var r = SA.store && SA.store.get && SA.store.get('context.activeRoom'); if (r) return r; } catch (e) { /* no store */ }
    return 'MasterBedroom';
  }
  function emit(resolved) {
    R.lastResolved = resolved;
    if (SA.bus && SA.bus.emit) SA.bus.emit('kg:resolved', resolved);
    return resolved;
  }

  // ------------------------------------------------------------ device resolution
  function resolveDevice(req, ctx) {
    var c = cfg(), room = activeRoomOf(ctx), pRoom = ctx && ctx.roomConfidence != null ? ctx.roomConfidence : c.roomConfidence;
    var dev = M().readState(req.id);
    if (!dev) throw new Error('SA.kg.resolve: unknown device ' + req.id);
    var n = M().normalize(dev, req.command, req.args), cls = CATEGORY[dev.kind], cmd = 'sa:' + n.command;
    var text = candidateQuery(cls, cmd), res = run(text), rows = vals(res);
    R.lastQuery = text;
    var hist = vals(run(recencyQuery(cls, cmd, c.K))), counts = {}, K = hist.length;
    hist.forEach(function (h) { counts[loc(h.d)] = (counts[loc(h.d)] || 0) + 1; });
    var seen = {}, cands = [];
    rows.forEach(function (r) { var id = loc(r.d); if (!seen[id]) { seen[id] = 1; cands.push(r); } });
    var N = cands.length, w = c.w;
    var ranked = cands.map(function (r) {
      var id = loc(r.d), st = M().readState(id), after = M().effect(st, n.command, n.args);
      var f = { fT: 1, fS: loc(r.space) === room ? 1 : 0, fX: same(st, after) ? 0 : 1, fR: K ? (counts[id] || 0) / K : 1 / N };
      var S = round(clamp01(w.type * f.fT + w.space * f.fS + w.state * f.fX + w.recency * f.fR), 4);
      var mod = modifierProduct(id, n.command, room);
      return { id: id, iri: ':' + id, label: r.label, order: r.order, score: S, scorePenalised: round(S * mod.m, 4),
        features: f, recency: { n: counts[id] || 0, K: K }, modifiers: mod.parts, M: mod.m, room: loc(r.space) };
    });
    ranked.sort(function (a, b) {
      return b.scorePenalised - a.scorePenalised || b.score - a.score || (a.order || 99) - (b.order || 99);
    });
    var acted = null;
    ranked.forEach(function (r) { if (r.id === req.id) acted = r; });
    var actedAfter = M().effect(dev, n.command, n.args);
    var noop = acted ? acted.features.fX === 0 : same(dev, actedAfter);
    var S = acted ? acted.score : 0, mAct = acted ? acted.M : 1;
    var sem = round(S * pRoom, 2), top = ranked[0] || null;
    var hFlag = mAct < hFlagThreshold();
    if (SA.errp && SA.errp.memory && SA.errp.memory.noteDecision) {
      try { SA.errp.memory.noteDecision(room, n.command); } catch (e) { /* memory optional */ }
    }
    var roomLabel = c.rooms[room] || room;
    var explanation = [
      'Gate: ?d a ' + cls + ' ; saref:hasFunction/saref:hasCommand ' + cmd + ' -> ' + N + ' candidate' + (N === 1 ? '' : 's'),
      'Recency: last ' + K + ' confirmed ' + cmd + ' on ' + cls + (K ? ' (synthetic seed history + confirmed demo actions)' : ' (none: uniform 1/' + N + ')')
    ];
    ranked.forEach(function (r) {
      var f = r.features;
      explanation.push(r.label + ': .35' + MIDDOT + f.fT + ' + .30' + MIDDOT + f.fS + ' + .20' + MIDDOT + f.fX + ' + .15' + MIDDOT +
        (K ? r.recency.n + '/' + K : '1/' + N) + ' = ' + r.score.toFixed(2) + (r.M < 1 ? ' (ranking ' + TIMES + r.M.toFixed(2) + ' = ' + r.scorePenalised.toFixed(2) + ')' : ''));
    });
    explanation.push('Semantic Context s = round2(' + S.toFixed(2) + ' ' + TIMES + ' ' + pRoom.toFixed(2) + ' P(room, simulated)) = ' + sem.toFixed(2));
    if (mAct < 1) explanation.push('ErrP memory ' + TIMES + mAct.toFixed(2) + ' (ranking only)' + (hFlag ? ' → CONFIRM' : ''));
    if (noop) explanation.push(noopReason(dev, n.command));
    return emit({
      episodeId: req.episodeId || null, kind: 'device', command: n.command, args: n.args,
      intentLabel: intentLabel(dev, n, actedAfter),
      actedOn: { id: req.id, iri: ':' + req.id, label: dev.label, score: S },
      ranked: ranked, kgTop: top ? { id: top.id, iri: top.iri, label: top.label, score: top.score } : null,
      noop: noop, noopReason: noop ? noopReason(dev, n.command) : null,
      semanticConfidence: sem, roomConfidence: pRoom, activeRoom: room,
      spatialContext: roomLabel + ' (Active User Room)', hFlag: hFlag, errpFactor: mAct,
      before: dev, after: actedAfter,
      query: { text: text, elapsedMs: res.elapsedMs }, explanation: explanation
    });
  }

  // ------------------------------------------------------------ presets
  function presetSteps(id, devices) {
    var rows = vals(run(presetQuery(id))), seen = {}, sim = {}, out = [];
    function cur(dev) {
      if (!sim[dev]) sim[dev] = JSON.parse(JSON.stringify((devices && devices[dev]) || M().readState(dev)));
      return sim[dev];
    }
    rows.forEach(function (r) {
      if (seen[r.step]) return;
      seen[r.step] = 1;
      var dev = loc(r.d), cmd = r.cmd.replace(/^sa:/, ''), args = {};
      if (r.value != null) args.value = r.value;
      else if (r.svLabel != null && (cmd === 'SetFanSpeed' || cmd === 'SetMode')) args.value = String(r.svLabel).toLowerCase();
      var before = cur(dev), after = M().effect(before, cmd, args);
      out.push({ step: loc(r.step), order: r.order, deviceId: dev, command: cmd, args: args, gated: r.fn != null,
        before: JSON.parse(JSON.stringify(before)), after: after, noop: same(before, after) });
      sim[dev] = after;
    });
    return out;
  }

  function resolvePreset(req) {
    var text = presetQuery(req.id), t0 = Date.now();
    var steps = presetSteps(req.id), lbl = vals(run(PREFIXES + 'SELECT ?l WHERE { :' + req.id + ' rdfs:label ?l }'));
    R.lastQuery = text;
    var label = lbl.length ? lbl[0].l : req.id, gated = steps.filter(function (s) { return s.gated; }).length;
    var s = steps.length ? round(gated / steps.length, 2) : 0;
    var noop = steps.every(function (x) { return x.noop; });
    return emit({
      episodeId: req.episodeId || null, kind: 'preset', command: 'Activate', args: {}, intentLabel: label,
      actedOn: { id: req.id, iri: ':' + req.id, label: label, score: s },
      ranked: [{ id: req.id, iri: ':' + req.id, label: label, score: s, scorePenalised: s, features: null, modifiers: {} }],
      kgTop: { id: req.id, iri: ':' + req.id, label: label, score: s },
      noop: noop, noopReason: noop ? 'No change: ' + label + ' is already in effect' : null,
      semanticConfidence: s, semanticText: Math.round(s * 100) + '% (explicit routine, KG-validated ' + gated + '/' + steps.length + ' steps)',
      roomConfidence: null, activeRoom: activeRoomOf(null), spatialContext: (cfg().rooms[activeRoomOf(null)] || activeRoomOf(null)) + ' (Active User Room)',
      hFlag: false, errpFactor: 1, steps: steps,
      query: { text: text, elapsedMs: Date.now() - t0 },
      explanation: ['Preset ' + label + ': ' + gated + '/' + steps.length + ' steps pass the KG gate; ' +
        steps.filter(function (x) { return !x.noop; }).length + ' would change state']
    });
  }

  function resolve(req, ctx) {
    triples();
    return req && req.kind === 'preset' ? resolvePreset(req) : resolveDevice(req, ctx || {});
  }

  // ------------------------------------------------------------ CQs
  function binding(v) {
    if (typeof v !== 'string') return v;
    var i = v.indexOf(':'), ns = store.prefixes[v.slice(0, i)];
    return SA.kg.term.iri(ns + v.slice(i + 1));
  }
  function cq(n, bindings) {
    triples();
    var def = (SA.kg.competencyQuestions || [])[n - 1];
    if (!def) throw new Error('No CQ' + n);
    var b = bindings !== undefined ? bindings : def.runs[0].bindings, ob;
    if (b) { ob = {}; for (var k in b) ob[k] = binding(b[k]); }
    var res = run(def.sparql, ob ? { bindings: ob } : undefined);
    return { id: def.id, question: def.question, text: def.sparql, vars: res.vars, rows: vals(res), elapsedMs: res.elapsedMs };
  }

  function registerModifier(name, fn) { if (typeof fn === 'function') modifiers[name] = fn; else delete modifiers[name]; }

  function init() {
    triples();
    if (SA.bus && !offs.length) offs.push(SA.bus.on('demo:reset', function () { reload(); }));
  }

  R.init = init; R.resolve = resolve; R.reload = reload; R.triples = triples; R.cq = cq;
  R.registerModifier = registerModifier; R.presetSteps = presetSteps; R.candidateQuery = candidateQuery;
  R.recencyQuery = recencyQuery; R.presetQuery = presetQuery; R.prefixes = PREFIXES;
  R.honestAccount = [
    'Since the Bedroom Ceiling Light is perfect on type, space and state, the README\'s 0.94 fixes exactly one quantity: w_R' + MIDDOT + '(1 − f_R) = 0.06.',
    'Our free choice: w_R = 0.15 with a synthetic 10-event seed history (6 ceiling / 2 lamp / 2 living), so f_R = 6/10. (0.20, 7/10) would hit 0.94 equally well.',
    'The split 0.35 / 0.30 / 0.20 follows the cue order type > space > state > habit; any split with w_S + w_X > 0 preserves the ranking.',
    'S is recomputed live from SPARQL-fetched features on every decision. f_R in {0.4, 0.5, 0.6, 0.7, 0.8} gives S in {0.91, 0.925, 0.94, 0.955, 0.97}.',
    'Semantic Context = round2(S ' + TIMES + ' P(room)) with P(room) = 0.95 from the simulated room selector; README "89%" pins P(room) to [0.9415, 0.9521].'
  ];
  SA.kg.resolver = R;
  SA.kg.resolve = function (req, ctx) { return R.resolve(req, ctx); };
})(typeof window !== 'undefined' ? window : globalThis);
