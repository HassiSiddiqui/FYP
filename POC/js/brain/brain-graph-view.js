/* SA.brain.view — 22-electrode scalp map (inline SVG) animating SFE-GAT evolution graphs evo0 → evo3.
 * Contract: docs/architecture.md §2.7, ADR 0005 D24/D34. Mounts into #sa-brain-view and #cv-brain.
 * Graphs arrive ONLY in eeg:decoded.graphs / eeg:exemplar payloads; positions from SA.brain.montage.
 * Scripted mode = static montage + caption; no animation is tied to keypresses.
 * Timers via SA.clock.after only. No DOM access at load time. */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.brain = SA.brain || {};

  var SVGNS = 'http://www.w3.org/2000/svg';
  // RT2-02: the GAE is never trained under the paper's CE-only loss (ADR 0001 D9), so "learned mask" is not claimed.
  var CAP_MODEL = 'Edges kept by the model\'s evolution mask (GAE untrained under the paper\'s CE-only loss) — model behaviour, not neurophysiology';
  var CAP_NO_PRUNE = 'On this model the mask keeps every edge (P ≈ 1), so evo0–evo3 are identical — no pruning learned (PRELIMINARY)';
  var CAP_SCRIPTED = 'Scripted mode: tokens are not decoded from EEG. Switch to Replay to see the SFE-GAT graph stages evo0→evo3 for a real trial.';
  var CAP_STUB = 'STUB DATA — not model output';
  var MOUNTS = ['sa-brain-view', 'cv-brain'];
  var CX = 120, CY = 122, R = 100;
  var N_CH = 22;

  var st = fresh();
  var inited = false;

  function fresh() {
    return { mode: 'scripted', graphs: null, counts: null, diff: null, step: -1, stub: false,
      preliminary: false, source: '', status: '', radar: false, radarH: null, animH: null };
  }

  // ---------- pure helpers (exported for tests) ----------
  function pairs(g) {
    // Undirected unique pairs [i, j] with i < j from a directed edge list {src, dst, n}.
    var seen = {}, out = [];
    if (!g || !g.src || !g.dst) return out;
    var n = typeof g.n === 'number' ? g.n : g.src.length;
    for (var e = 0; e < n; e++) {
      var a = g.src[e] | 0, b = g.dst[e] | 0;
      if (a === b || a < 0 || b < 0 || a >= N_CH || b >= N_CH) continue;
      var i = Math.min(a, b), j = Math.max(a, b), key = i * 64 + j;
      if (!seen[key]) { seen[key] = 1; out.push([i, j]); }
    }
    out.sort(function (p, q) { return p[0] - q[0] || p[1] - q[1]; });
    return out;
  }

  function diffSteps(graphs) {
    var steps = [];
    for (var k = 0; k < graphs.length; k++) {
      var kept = pairs(graphs[k]);
      var removed = [];
      if (k > 0) {
        var now = {};
        kept.forEach(function (p) { now[p[0] * 64 + p[1]] = 1; });
        steps[k - 1].kept.forEach(function (p) { if (!now[p[0] * 64 + p[1]]) removed.push(p); });
      }
      steps.push({ kept: kept, removed: removed });
    }
    return steps;
  }

  function noPruning() {
    if (!st.diff || st.diff.length < 2) return false;
    for (var k = 1; k < st.diff.length; k++) if (st.diff[k].removed.length) return false;
    return true;
  }

  function countsOf(graphs, edgeCounts) {
    if (edgeCounts && edgeCounts.length === graphs.length) return Array.prototype.slice.call(edgeCounts);
    return graphs.map(function (g) { return g && typeof g.n === 'number' ? g.n : (g && g.src ? g.src.length : 0); });
  }

  /** Deterministic ILLUSTRATIVE trace for tests/selftest only — never rendered as model output. */
  function cannedTrace() {
    var pos = SA.brain.montage.positions(), src = [], dst = [], w = [];
    for (var i = 0; i < pos.length; i++) for (var j = 0; j < pos.length; j++) {
      if (i === j) continue;
      var dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y;
      if (Math.sqrt(dx * dx + dy * dy) < 0.42) { src.push(i); dst.push(j); w.push(1); }
    }
    var graphs = [{ src: src, dst: dst, w: w, n: src.length }];
    for (var k = 1; k < 4; k++) {
      var p = graphs[k - 1], s2 = [], d2 = [], w2 = [];
      for (var e = 0; e < p.n; e++) {
        var lo = Math.min(p.src[e], p.dst[e]), hi = Math.max(p.src[e], p.dst[e]);
        if (((lo * 31 + hi * 17 + k * 7) % 5) !== 0) { s2.push(p.src[e]); d2.push(p.dst[e]); w2.push(1); }
      }
      graphs.push({ src: s2, dst: d2, w: w2, n: s2.length });
    }
    return { graphs: graphs, edgeCounts: graphs.map(function (g) { return g.n; }), canned: true };
  }

  // ---------- store / timing ----------
  function pref(key, dflt) {
    try { var v = SA.store.get('prefs.' + key); return v === undefined || v === null ? dflt : v; } catch (e) { return dflt; }
  }
  function stepMs() {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue('--dur-evo-step');
      var ms = parseFloat(v);
      if (isFinite(ms) && ms > 0) return /ms/.test(v) ? ms : ms * 1000;
    } catch (e) { /* headless */ }
    return 700;
  }
  function cancel(h) { if (h && SA.clock && SA.clock.cancel) SA.clock.cancel(h); }
  function after(ms, fn) { return SA.clock && SA.clock.after ? SA.clock.after(ms, fn) : null; }

  // ---------- state transitions ----------
  function start(graphs, edgeCounts, meta) {
    if (!graphs || graphs.length !== 4) return;
    cancel(st.animH); st.animH = null;
    st.graphs = graphs;
    st.counts = countsOf(graphs, edgeCounts);
    st.diff = diffSteps(graphs);
    st.stub = !!meta.stub;
    st.preliminary = !!meta.preliminary;
    st.source = meta.source || '';
    st.status = '';
    var animate = pref('decodeAnimation', true) && !!(SA.clock && SA.clock.after);
    if (!animate) { st.step = 3; renderAll(); return; }
    st.step = 0; renderAll();
    var ms = stepMs();
    var tick = function () {
      st.animH = null;
      if (st.step >= 3) return;
      st.step++; renderAll();
      if (st.step < 3) st.animH = after(ms, tick);
    };
    st.animH = after(ms, tick);
  }

  function onDecoded(p) {
    if (!p) return;
    if (p.mode) st.mode = p.mode;
    if (p.graphs && p.graphs.length === 4) {
      var t = p.trial;
      var src = t ? ('Trial ' + t.id + (t.trueCls ? ' • truth ' + t.trueCls : '')) : (p.source || '');
      start(p.graphs, p.edgeCounts, { stub: p.stub, preliminary: p.preliminary, source: src });
    } else {
      st.status = ''; renderAll();   // scripted token: no animation tied to keypresses
    }
  }

  function onExemplar(p) {
    if (!p || !p.graphs) return;
    start(p.graphs, p.edgeCounts, { stub: p.stub, preliminary: p.preliminary !== false, source: p.caption || ('Exemplar ' + (p.trialId || '')) });
  }

  function onMode(p) {
    if (!p) return;
    st.mode = p.mode || 'scripted';
    cancel(st.animH); st.animH = null;
    st.graphs = null; st.counts = null; st.diff = null; st.step = -1; st.source = ''; st.status = '';
    renderAll();
  }

  function radarOn(p) {
    cancel(st.radarH);
    st.radar = true; renderAll();
    var ms = p && p.durationMs ? p.durationMs : 1000;
    st.radarH = after(ms, function () { st.radarH = null; st.radar = false; renderAll(); });
  }
  function radarOff() { cancel(st.radarH); st.radarH = null; st.radar = false; renderAll(); }

  function onReset() {
    cancel(st.animH); cancel(st.radarH);
    st = fresh(); renderAll();
  }

  // ---------- DOM ----------
  function svg(tag, attrs, parent) {
    var el = document.createElementNS(SVGNS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }
  function html(tag, cls, parent, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    if (parent) parent.appendChild(el);
    return el;
  }
  function px(p) { return { x: CX + p.x * R, y: CY - p.y * R }; }

  function build(host) {
    host.textContent = '';
    var card = html('div', 'bv-card', host);
    card.setAttribute('data-bv', '1');
    var head = html('div', 'bv-head', card);
    html('span', 'bv-title', head, 'Brain graph · SFE-GAT');
    html('span', 'bv-badge', head);
    var chips = html('div', 'bv-chips', card);
    for (var k = 0; k < 4; k++) {
      var c = html('span', 'bv-chip', chips);
      c.setAttribute('data-step', String(k));
      html('span', 'bv-chip-name', c, 'evo' + k);
      html('span', 'bv-chip-n', c, '—');
    }
    var s = svg('svg', { viewBox: '0 0 240 240', class: 'bv-svg', role: 'img', 'aria-label': '22-electrode scalp map' }, card);
    var scalp = svg('g', { class: 'bv-scalp' }, s);
    svg('path', { class: 'bv-nose', d: 'M' + (CX - 9) + ' ' + (CY - R + 2) + ' L' + CX + ' ' + (CY - R - 13) + ' L' + (CX + 9) + ' ' + (CY - R + 2) }, scalp);
    svg('ellipse', { class: 'bv-ear', cx: CX - R - 4, cy: CY, rx: 5, ry: 14 }, scalp);
    svg('ellipse', { class: 'bv-ear', cx: CX + R + 4, cy: CY, rx: 5, ry: 14 }, scalp);
    svg('circle', { class: 'bv-head-outline', cx: CX, cy: CY, r: R }, scalp);
    svg('g', { class: 'bv-edges' }, s);
    var radar = svg('g', { class: 'bv-radar' }, s);
    var nodes = svg('g', { class: 'bv-nodes' }, s);
    var M = SA.brain.montage;
    M.positions().forEach(function (p) {
      var q = px(p), key = p.idx === M.FCZ || p.idx === M.CZ;
      var g = svg('g', { class: 'bv-electrode' + (key ? ' bv-key' : ''), 'data-idx': p.idx, 'data-name': p.name }, nodes);
      svg('title', {}, g).textContent = p.name + ' (channel ' + (p.idx + 1) + ')';
      if (key) {
        svg('circle', { class: 'bv-key-ring', cx: q.x, cy: q.y, r: 9.5 }, g);
        svg('circle', { class: 'bv-radar-ring', cx: q.x, cy: q.y, r: 14 }, radar);
      }
      svg('circle', { class: 'bv-dot', cx: q.x, cy: q.y, r: key ? 5.5 : 4.5 }, g);
      var t = svg('text', { class: 'bv-label', x: q.x, y: q.y + (key ? 17 : 12), 'text-anchor': 'middle' }, g);
      t.textContent = p.name;
    });
    html('p', 'bv-status', card);
    html('p', 'bv-caption', card);
    return card;
  }

  function drawEdges(g, pos) {
    while (g.firstChild) g.removeChild(g.firstChild);
    if (!st.diff || st.step < 0) return;
    var d = st.diff[st.step];
    d.removed.forEach(function (pr) {
      var a = px(pos[pr[0]]), b = px(pos[pr[1]]);
      svg('line', { class: 'bv-edge-removed', x1: a.x, y1: a.y, x2: b.x, y2: b.y }, g);
    });
    d.kept.forEach(function (pr) {
      var a = px(pos[pr[0]]), b = px(pos[pr[1]]);
      svg('line', { class: 'bv-edge', x1: a.x, y1: a.y, x2: b.x, y2: b.y }, g);
    });
  }

  function render(host) {
    var card = host.querySelector('[data-bv]') || build(host);
    var pos = SA.brain.montage.positions();
    card.setAttribute('data-mode', st.mode);
    card.setAttribute('data-step', String(st.step));
    card.classList.toggle('is-radar', st.radar);
    card.classList.toggle('has-graph', !!st.graphs);
    drawEdges(card.querySelector('.bv-edges'), pos);
    var chips = card.querySelectorAll('.bv-chip');
    for (var k = 0; k < chips.length; k++) {
      chips[k].classList.toggle('is-active', k === st.step);
      chips[k].classList.toggle('is-done', st.step >= 0 && k < st.step);
      chips[k].querySelector('.bv-chip-n').textContent = st.counts ? String(st.counts[k]) : '—';
    }
    var badge = [];
    if (st.stub) badge.push(CAP_STUB);
    else if (st.graphs && st.preliminary) badge.push('PRELIMINARY (Plan B)');
    if (!st.graphs && st.mode === 'scripted') badge.push('Scripted');
    card.querySelector('.bv-badge').textContent = badge.join(' • ');
    card.querySelector('.bv-badge').classList.toggle('is-stub', st.stub);
    var status = st.status || st.source;
    if (st.radar) status = 'Observing post-action EEG • FCz / Cz' + (status ? ' • ' + status : '');
    card.querySelector('.bv-status').textContent = status;
    var cap = st.graphs ? CAP_MODEL : (st.mode === 'scripted' ? CAP_SCRIPTED : 'Awaiting a decoded trial (Decode trial ► inject token).');
    if (st.graphs && noPruning()) cap = CAP_NO_PRUNE + ' • ' + cap;   // RT1-04: lead with it when evo0..evo3 do not differ
    if (SA.brain.montage.isSchematic()) cap += ' • Electrode layout: schematic (montage data missing)';
    card.querySelector('.bv-caption').textContent = cap;
    var svgEl = card.querySelector('svg');
    svgEl.setAttribute('aria-label', '22-electrode scalp map, FCz and Cz ringed' +
      (st.graphs ? ', evo' + st.step + ': ' + st.counts[st.step] + ' edges' : ', no graph'));
  }

  function renderAll() {
    if (typeof document === 'undefined') return;
    MOUNTS.forEach(function (id) {
      var host = document.getElementById(id);
      if (host) { try { render(host); } catch (e) { console.error('brain view render', e); } }
    });
  }

  function init() {
    if (inited) return;
    inited = true;
    var bus = SA.bus;
    bus.on('eeg:decoded', onDecoded);
    bus.on('eeg:exemplar', onExemplar);
    bus.on('decoder:modeChanged', onMode);
    bus.on('eeg:decodeStart', function () { st.status = 'Decoding…'; renderAll(); });
    bus.on('errp:observeStart', radarOn);
    bus.on('errp:observed', radarOff);
    bus.on('ui:dashboardToggled', function () { renderAll(); });
    bus.on('demo:reset', onReset);
    try { var m = SA.store.get('decoder.mode'); if (m) st.mode = m; } catch (e) { /* store absent */ }
    renderAll();
  }

  SA.brain.view = {
    init: init,
    render: renderAll,
    pairs: pairs,
    diffSteps: diffSteps,
    cannedTrace: cannedTrace,
    state: function () {
      return { mode: st.mode, step: st.step, counts: st.counts ? st.counts.slice() : null,
        radar: st.radar, stub: st.stub, hasGraph: !!st.graphs };
    },
    captions: { model: CAP_MODEL, noPrune: CAP_NO_PRUNE, scripted: CAP_SCRIPTED, stub: CAP_STUB }
  };
})(typeof window !== 'undefined' ? window : globalThis);
