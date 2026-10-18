/*
 * SA.eeg.sfegat (EEG) — in-browser SFE-GAT forward pass, float64 (research/sfegat/model.py,
 * P0 configuration; docs/architecture.md §2.2; ADR 0001 D23-D27).
 *   load(data = SA.data.sfegatWeights) -> model
 *     decodes the float32 base64 blob once (float64 out), maps tensors by exact
 *     state_dict name, THROWS on missing / extra / wrong-shape tensors.
 *   features(model, X, C, T) -> {H, P}
 *   forwardGraph(model, H, P, C) -> result
 *   forward(model, X, C, T) -> result
 *   result = {logits, probs, probsCal|null, pred, predIdx, conf, calibrated, graphs [A0..A3],
 *             edgeCounts, stages {P, Z, H, h0, h1..h3, z1..z3, p1..p3, cls, g}, elapsedMs, timings}
 * Pipeline: x = stem(H, A0) (no activation) -> for b = 1..3: h = BN_b(ReLU(GATv2_b(x, A))),
 *   z = BNz_b(ReLU(GCN_b(h, A, w))), A <- gae.mask(z, A, eta), x = h -> ReLU(cls_gat(x, A3))
 *   -> cls_bn -> mean over nodes -> (dropout = identity) -> lin -> logits.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.eeg = SA.eeg || {};
  var M = SA.eeg.sfegat = SA.eeg.sfegat || {};

  function now() {
    var p = root.performance;
    return p && typeof p.now === 'function' ? p.now() : Date.now();
  }

  function expectedShapes(m) {
    var H = m.heads, Fh = m.hidden, D = H * Fh, ex = {};
    function gat(pre, fin) {
      ex[pre + '.att'] = [1, H, Fh]; ex[pre + '.bias'] = [D];
      ex[pre + '.lin_l.weight'] = [D, fin]; ex[pre + '.lin_l.bias'] = [D];
      ex[pre + '.lin_r.weight'] = [D, fin]; ex[pre + '.lin_r.bias'] = [D];
    }
    function bn(pre, f) {
      ex[pre + '.weight'] = [f]; ex[pre + '.bias'] = [f];
      ex[pre + '.running_mean'] = [f]; ex[pre + '.running_var'] = [f];
    }
    gat('stem', m.inDim);
    for (var k = 0; k < m.nBlocks; k++) {
      var b = 'blocks.' + k;
      gat(b + '.gat', D); bn(b + '.bn', D);
      ex[b + '.enc.bias'] = [m.bottleneck]; ex[b + '.enc.lin.weight'] = [m.bottleneck, D];
      bn(b + '.bn_z', m.bottleneck);
    }
    gat('cls_gat', D); bn('cls_bn', D);
    ex['lin.weight'] = [m.nClasses, D]; ex['lin.bias'] = [m.nClasses];
    return ex;
  }
  M.expectedShapes = expectedShapes;

  function sameShape(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (+a[i] !== +b[i]) return false;
    return true;
  }

  M.load = function (data) {
    data = data || SA.data && SA.data.sfegatWeights;
    if (!data || !data.manifest) throw new Error('sfegat.load: no SA.data.sfegatWeights');
    if (data.__model) return data.__model;
    var man = data.manifest, mm = man.model;
    var blob = SA.core.b64.decodeF32(data.b64);
    if (man.totalElements != null && blob.length !== man.totalElements) {
      throw new Error('sfegat.load: blob has ' + blob.length + ' elements, manifest says ' + man.totalElements);
    }
    var ex = expectedShapes(mm), t = {}, seen = {};
    man.tensors.forEach(function (d) {
      if (!(d.name in ex)) throw new Error('sfegat.load: unexpected tensor ' + d.name);
      if (!sameShape(d.shape, ex[d.name])) {
        throw new Error('sfegat.load: ' + d.name + ' shape ' + JSON.stringify(d.shape) + ' != ' + JSON.stringify(ex[d.name]));
      }
      var len = d.shape.reduce(function (a, b) { return a * b; }, 1);
      if (d.length !== len || d.offset + len > blob.length) throw new Error('sfegat.load: bad offset/length for ' + d.name);
      t[d.name] = blob.subarray(d.offset, d.offset + len);
      seen[d.name] = true;
    });
    Object.keys(ex).forEach(function (n) { if (!seen[n]) throw new Error('sfegat.load: missing tensor ' + n); });
    var eps = mm.bnEps == null ? 1e-5 : mm.bnEps;
    function gat(pre) {
      return { lin_l_w: t[pre + '.lin_l.weight'], lin_l_b: t[pre + '.lin_l.bias'], lin_r_w: t[pre + '.lin_r.weight'],
               lin_r_b: t[pre + '.lin_r.bias'], att: t[pre + '.att'], bias: t[pre + '.bias'] };
    }
    function bn(pre) {
      return { weight: t[pre + '.weight'], bias: t[pre + '.bias'], running_mean: t[pre + '.running_mean'],
               running_var: t[pre + '.running_var'], eps: eps };
    }
    var blocks = [];
    for (var k = 0; k < mm.nBlocks; k++) {
      var b = 'blocks.' + k;
      blocks.push({ gat: gat(b + '.gat'), bn: bn(b + '.bn'), enc: { lin_w: t[b + '.enc.lin.weight'], bias: t[b + '.enc.bias'] },
                    bnz: bn(b + '.bn_z') });
    }
    var model = { manifest: man, tensors: t, stem: gat('stem'), blocks: blocks, clsGat: gat('cls_gat'), clsBn: bn('cls_bn'),
                  lin: { w: t['lin.weight'], b: t['lin.bias'] },
                  nParams: Object.keys(t).reduce(function (a, n) { return /running_/.test(n) ? a : a + t[n].length; }, 0) };
    try { Object.defineProperty(data, '__model', { value: model, enumerable: false, configurable: true }); } catch (e) { /* frozen */ }
    return model;
  };

  M.features = function (model, X, C, T) {
    var man = model.manifest;
    var feat = {};
    for (var k in man.features) feat[k] = man.features[k];
    if (feat.fs == null) feat.fs = man.fs;
    var H = SA.eeg.psdFeatures.compute(X, C, T, feat);
    var P = SA.eeg.plv.compute(X, C, T, man.plv || { band: null });
    return { H: H, P: P };
  };

  M.forwardGraph = function (model, H, P, C, timings) {
    var man = model.manifest, mm = man.model, B = man.features.bands.length;
    var Hh = mm.heads, Fh = mm.hidden, D = Hh * Fh, Z = mm.bottleneck;
    var ten = SA.eeg.tensor, gatOpts = { heads: Hh, outPerHead: Fh, negativeSlope: (mm.gat && mm.gat.negativeSlope) || 0.2 };
    var eta = man.mask && man.mask.eta != null ? man.mask.eta : 0.5;
    var t0 = now();
    var gr = SA.eeg.graph.build(P, C, man.graph || {});
    var A = gr.edges, graphs = [A], stages = { P: P, Z: gr.Z, H: H };
    var x = SA.eeg.gatv2.forward(H, C, B, A, model.stem, gatOpts);
    stages.h0 = x;
    for (var b = 0; b < model.blocks.length; b++) {
      var blk = model.blocks[b];
      var h = ten.relu(SA.eeg.gatv2.forward(x, C, D, A, blk.gat, gatOpts));
      if (mm.residual) for (var i = 0; i < h.length; i++) h[i] += x[i];
      h = SA.eeg.batchnorm.forward(h, C, D, blk.bn);
      var z = ten.relu(SA.eeg.gcn.forward(h, C, D, A, blk.enc, { useEdgeWeight: mm.gcnEdgeWeight !== false }));
      z = SA.eeg.batchnorm.forward(z, C, Z, blk.bnz);
      var mk = SA.eeg.gae.mask(z, C, Z, A, eta);
      stages['h' + (b + 1)] = h; stages['z' + (b + 1)] = z; stages['p' + (b + 1)] = mk.p;
      if (mm.evolve !== false) A = mk.edges;
      graphs.push(A);
      x = h;
    }
    var c = ten.relu(SA.eeg.gatv2.forward(x, C, D, A, model.clsGat, gatOpts));
    c = SA.eeg.batchnorm.forward(c, C, D, model.clsBn);
    var g = new Float64Array(D);
    for (var n = 0; n < C; n++) for (var f = 0; f < D; f++) g[f] += c[n * D + f];
    for (f = 0; f < D; f++) g[f] /= C;
    stages.cls = c; stages.g = g;
    var logits = ten.linear(g, 1, D, model.lin.w, model.lin.b, mm.nClasses);
    var probs = ten.softmax(logits);
    var T = man.calibration && typeof man.calibration.temperature === 'number' ? man.calibration.temperature : null;
    var probsCal = null;
    if (T) {
      var sc = new Float64Array(logits.length);
      for (var j = 0; j < logits.length; j++) sc[j] = logits[j] / T;
      probsCal = ten.softmax(sc);
    }
    var idx = ten.argmax(logits), use = probsCal || probs;
    if (timings) timings.graphMs = now() - t0;
    return { logits: logits, probs: probs, probsCal: probsCal, predIdx: idx, pred: man.classes[idx],
             conf: use[idx], calibrated: !!probsCal, temperature: T, graphs: graphs,
             edgeCounts: graphs.map(function (a) { return a.n; }), stages: stages, timings: timings || null };
  };

  M.forward = function (model, X, C, T) {
    var t0 = now(), timings = {};
    var f = M.features(model, X, C, T);
    timings.featuresMs = now() - t0;
    var r = M.forwardGraph(model, f.H, f.P, C, timings);
    r.elapsedMs = now() - t0;
    timings.totalMs = r.elapsedMs;
    return r;
  };
})(typeof window !== 'undefined' ? window : globalThis);
