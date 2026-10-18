/* SA.kg.view — KG subgraph card (inline SVG, <= 8 nodes) in #sa-kg-view.
 * Contract: docs/architecture.md §2.7, ADR 0005 D24, ADR 0003 (hand-placed coordinates).
 * Nodes: Patient, MasterBedroom, LivingRoom, the intent node, up to 4 devices (the 3 lights by default;
 * for a non-light request, the resolver's ranked devices). Edges: sa:activeRoom, bot:containsElement.
 * Winner: 4 px solid ring + "1st · 0.94"; runner-up: 3 px dashed ring + "2nd · 0.88"; third "3rd · 0.38".
 * Data arrives only in kg:resolved / errp:observed payloads and SA.store (UI-side isolation rule).
 * No DOM access at load time. */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.kg = SA.kg || {};

  var SVGNS = 'http://www.w3.org/2000/svg';
  var SHORT = { BedroomCeilingLight: 'Ceiling', BedsideLamp: 'Lamp', LivingRoomLight: 'Living',
    CeilingFan: 'Fan', AirConditioner: 'AC', SmartTV: 'TV' };
  var ROOMS_DEFAULT = { MasterBedroom: 'Master Bedroom', LivingRoom: 'Living Room' };
  var LIGHTS_DEFAULT = [
    { id: 'BedroomCeilingLight', room: 'MasterBedroom', power: 'off' },
    { id: 'BedsideLamp', room: 'MasterBedroom', power: 'off' },
    { id: 'LivingRoomLight', room: 'LivingRoom', power: 'on' }];
  var ORD = ['1st', '2nd', '3rd', '4th'];

  var st = fresh();
  var inited = false;

  function fresh() { return { intent: null, kind: null, ranked: [], actedOn: null, noop: false, errpNote: '' }; }

  // ---------- pure helpers ----------
  function shortLabel(id, label) {
    if (SHORT[id]) return SHORT[id];
    var s = String(label || id || '');
    return s.split(/\s+/)[0].slice(0, 9);
  }
  function fmt2(x) {
    if (typeof x !== 'number' || !isFinite(x)) return '—';
    try { if (SA.ui && SA.ui.format && SA.ui.format.score) return SA.ui.format.score(x); } catch (e) { /* fall through */ }
    return x.toFixed(2);
  }
  function rankScore(r) { return typeof r.scorePenalised === 'number' ? r.scorePenalised : r.score; }

  /** Builds the view model from state + store devices (pure; exported for tests). */
  function model(state, devices, activeRoom, rooms) {
    devices = devices || {};
    var ranked = state.ranked || [];
    var lights = Object.keys(devices).filter(function (id) { return devices[id] && devices[id].kind === 'light'; })
      .sort(function (a, b) { return (devices[a].order || 0) - (devices[b].order || 0); })
      .map(function (id) { return { id: id, room: devices[id].room, power: devices[id].power, label: devices[id].label }; });
    if (!lights.length) lights = LIGHTS_DEFAULT.slice();
    var shown = lights;
    var lightIds = lights.map(function (d) { return d.id; });
    var outside = ranked.some(function (r) { return lightIds.indexOf(r.id) < 0; });
    if (ranked.length && outside) {
      shown = ranked.slice(0, 4).map(function (r) {
        var d = devices[r.id] || {};
        return { id: r.id, room: d.room || 'MasterBedroom', power: d.power, label: r.label || d.label || r.id };
      });
    }
    var rankOf = {};
    ranked.forEach(function (r, i) { if (i < 4) rankOf[r.id] = { i: i, s: rankScore(r), r: r }; });
    var nodes = shown.map(function (d) {
      var rk = rankOf[d.id];
      return { id: d.id, room: d.room, on: d.power === 'on', short: shortLabel(d.id, d.label),
        rank: rk ? rk.i : -1, rankText: rk ? ORD[rk.i] + ' · ' + fmt2(rk.s) : '',
        actedOn: !!(state.actedOn && state.actedOn.id === d.id) };
    });
    var notes = [];
    ranked.forEach(function (r) {
      var m = r.modifiers && r.modifiers.errpMemory;
      if (typeof m === 'number' && m < 1) {
        notes.push('ErrP memory ×' + m.toFixed(2) + ' on ' + shortLabel(r.id, r.label) + ' (' + fmt2(r.score) + ' → ' + fmt2(rankScore(r)) + ')');
      }
    });
    if (state.errpNote) notes.push(state.errpNote);
    if (state.noop) notes.push('No-op: target already in requested state');
    return { intent: state.intent, activeRoom: activeRoom || 'MasterBedroom', rooms: rooms || ROOMS_DEFAULT,
      nodes: nodes, notes: notes, winner: ranked[0] ? ranked[0].id : null, runnerUp: ranked[1] ? ranked[1].id : null };
  }

  // ---------- events ----------
  function onResolved(p) {
    if (!p) return;
    st.intent = p.intentLabel || p.command || null;
    st.kind = p.kind || null;
    st.ranked = (p.ranked || []).slice();
    st.actedOn = p.actedOn || null;
    st.noop = !!p.noop;
    render();
  }
  function onErrp(p) {
    if (!p) return;
    var q = typeof p.q === 'number' ? ' (q = ' + p.q.toFixed(2) + ')' : '';
    st.errpNote = 'ErrP ' + (p.decision || 'observed') + q + (p.decision === 'rollback' || p.decision === 'flag' ? ' — penalty applies on next resolve' : '');
    render();
  }

  // ---------- DOM ----------
  function el(tag, attrs, parent, text) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function storeGet(path, dflt) { try { var v = SA.store.get(path); return v === undefined ? dflt : v; } catch (e) { return dflt; } }

  function layout(m) {
    var P = { Patient: { x: 44, y: 16 }, Intent: { x: 190, y: 16 },
      MasterBedroom: { x: 86, y: 78 }, LivingRoom: { x: 214, y: 78 } };
    var mb = m.nodes.filter(function (n) { return n.room !== 'LivingRoom'; });
    var lr = m.nodes.filter(function (n) { return n.room === 'LivingRoom'; });
    mb.forEach(function (n, i) { P[n.id] = { x: mb.length === 1 ? 86 : 26 + i * (120 / Math.max(1, mb.length - 1)), y: 146 }; });
    lr.forEach(function (n, i) { P[n.id] = { x: lr.length === 1 ? 214 : 190 + i * (56 / Math.max(1, lr.length - 1)), y: 146 }; });
    return P;
  }

  function draw(host) {
    var devices = storeGet('devices', null);
    var activeRoom = storeGet('context.activeRoom', 'MasterBedroom');
    var rooms = (SA.config && SA.config.kg && SA.config.kg.rooms) || ROOMS_DEFAULT;
    var m = model(st, devices, activeRoom, rooms);
    var P = layout(m);
    host.textContent = '';
    var card = document.createElement('div');
    card.className = 'kv-card';
    card.setAttribute('data-kv', '1');
    var head = document.createElement('div');
    head.className = 'kv-head';
    head.textContent = 'Knowledge graph · CogLign';
    card.appendChild(head);
    var s = el('svg', { viewBox: '0 0 260 196', class: 'kv-svg', role: 'img',
      'aria-label': 'Knowledge-graph subgraph' + (m.winner ? ', resolved ' + m.winner + (m.runnerUp ? ', runner-up ' + m.runnerUp : '') : '') }, card);
    var gE = el('g', { class: 'kv-edges' }, s), gN = el('g', { class: 'kv-nodes' }, s);
    // Edges
    var ar = P[m.activeRoom] || P.MasterBedroom;
    el('line', { class: 'kv-edge kv-edge-active', x1: P.Patient.x, y1: P.Patient.y + 13, x2: ar.x, y2: ar.y - 13 }, gE);
    el('text', { class: 'kv-edge-label', x: (P.Patient.x + ar.x) / 2 + 6, y: (P.Patient.y + ar.y) / 2 }, gE, 'activeRoom');
    m.nodes.forEach(function (n) {
      var r = P[n.room] || P.MasterBedroom, d = P[n.id];
      el('line', { class: 'kv-edge', x1: r.x, y1: r.y + 13, x2: d.x, y2: d.y - 19 }, gE);
    });
    el('text', { class: 'kv-edge-label', x: 2, y: 110 }, gE, 'containsElement');
    if (m.winner && P[m.winner] && m.intent) {
      el('path', { class: 'kv-edge kv-edge-resolve', d: 'M' + P.Intent.x + ' ' + (P.Intent.y + 12) + ' Q 258 96 ' + (P[m.winner].x + 16) + ' ' + (P[m.winner].y - 12) }, gE);
    }
    // Box nodes
    function box(id, x, y, w, label, cls) {
      var g = el('g', { class: 'kv-node kv-box ' + (cls || ''), 'data-node': id }, gN);
      el('rect', { x: x - w / 2, y: y - 13, width: w, height: 26, rx: 6 }, g);
      el('text', { x: x, y: y + 4.5, 'text-anchor': 'middle' }, g, label);
      return g;
    }
    box('Patient', P.Patient.x, P.Patient.y, 76, 'Patient', 'kv-patient');
    box('Intent', P.Intent.x, P.Intent.y, 132, m.intent || 'Intent: —', 'kv-intent' + (m.intent ? '' : ' is-empty'));
    Object.keys(m.rooms).forEach(function (rid) {
      if (!P[rid]) return;
      box(rid, P[rid].x, P[rid].y, rid === 'LivingRoom' ? 88 : 126, m.rooms[rid], 'kv-room' + (rid === m.activeRoom ? ' is-active' : ''));
    });
    // Device nodes
    m.nodes.forEach(function (n) {
      var d = P[n.id];
      var cls = 'kv-node kv-device' + (n.on ? ' is-on' : '') + (n.rank === 0 ? ' is-winner' : n.rank === 1 ? ' is-runner' : n.rank >= 2 ? ' is-ranked' : '');
      var g = el('g', { class: cls, 'data-node': n.id }, gN);
      el('title', {}, g, ':' + n.id);
      if (n.rank === 0 || n.rank === 1) el('circle', { class: 'kv-ring', cx: d.x, cy: d.y, r: 23 }, g);
      el('circle', { class: 'kv-dot', cx: d.x, cy: d.y, r: 18 }, g);
      el('text', { class: 'kv-dev-label', x: d.x, y: d.y + 4, 'text-anchor': 'middle' }, g, n.short);
      if (n.rankText) el('text', { class: 'kv-rank', x: d.x, y: d.y + 39, 'text-anchor': 'middle' }, g, n.rankText);
      if (n.actedOn && n.rank !== 0) el('text', { class: 'kv-acted', x: d.x, y: d.y - 27, 'text-anchor': 'middle' }, g, 'acted on');
    });
    card.appendChild(s);
    var notes = document.createElement('p');
    notes.className = 'kv-notes';
    notes.textContent = m.notes.join(' • ');
    card.appendChild(notes);
    host.appendChild(card);
    return m;
  }

  function render() {
    if (typeof document === 'undefined') return;
    var host = document.getElementById('sa-kg-view');
    if (!host) return;
    try { draw(host); } catch (e) { console.error('kg view render', e); }
  }

  function init() {
    if (inited) return;
    inited = true;
    SA.bus.on('kg:resolved', onResolved);
    SA.bus.on('errp:observed', onErrp);
    SA.bus.on('store:changed', function (p) {
      var path = (p && p.path) || '';
      if (path === '' || path.indexOf('devices') === 0 || path.indexOf('context') === 0) render();
    });
    SA.bus.on('demo:reset', function () { st = fresh(); render(); });
    render();
  }

  SA.kg.view = {
    init: init,
    render: render,
    model: model,
    shortLabel: shortLabel,
    state: function () { return JSON.parse(JSON.stringify(st)); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
