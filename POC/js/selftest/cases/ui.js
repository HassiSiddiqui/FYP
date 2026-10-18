/* Selftest cases — domain 'ui' (owner: UI). docs/architecture.md §8.2 required ids:
 * ui/readme-strings, ui/keyboard-map, ui/canonical-journey, ui/rollback-journey (+ contrast, lexicon, wrap). */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.selftest = SA.selftest || {};
  if (typeof SA.selftest.register !== 'function') return;
  var R = SA.selftest.register;
  var CLS = { NEXT: 'right', PREV: 'left', SELECT: 'feet', BACK: 'tongue' };

  function hasDom() { return typeof document !== 'undefined' && !!document.getElementById('sa-app'); }
  function $(id) { return hasDom() ? document.getElementById(id) : null; }
  function txt(id) { var e = $(id); return e ? e.textContent : null; }
  function flush() { if (hasDom() && SA.ui.render && SA.ui.render.renderNow) SA.ui.render.renderNow(); }
  function ui(k) { return SA.store.get('ui' + (k ? '.' + k : '')); }

  /* Scripted token: through tokenbus (source 'auto' bypasses debounce) when the decoder exists, else straight as eeg:decoded. */
  function tok(token) {
    var cls = CLS[token];
    if (SA.eeg && SA.eeg.decoder && SA.input && SA.input.tokenbus) { SA.input.tokenbus.emitToken(cls, 'auto'); return; }
    SA.bus.emit('eeg:decoded', { token: token, cls: cls, conf: SA.store.get('decoder.sliders.neural'), probs: null, calibrated: false,
      decoded: false, mode: 'scripted', source: 'auto', trial: null, correct: null, graphs: null, ts: 0 });
  }

  function toTurnOn(t) {
    tok('SELECT'); tok('SELECT'); tok('SELECT');
    t.eq(ui('screen'), 'S4', 'reached S4');
    t.eq(ui('fixture'), 'BedroomCeilingLight', 'fixture');
    tok('SELECT');
    return t.waitFor(function () { return ui('screen') === 'S5' && ui('result.kind') === 'observing'; }, 8000, 'S5 observing');
  }

  R('ui', 'readme-strings', function (t) {
    var st = { ui: ui(), devices: SA.store.get('devices') }, S = SA.ui.screens;
    function titles(id) { return S[id].items(st).map(function (i) { return i.title; }); }
    function subs(id) { return S[id].items(st).map(function (i) { return i.subtitle; }); }
    t.eq(S.S1.title, 'Mode Selection');
    t.eq(titles('S1'), ['Visual Navigation', 'Audio-Assisted Navigation']);
    t.eq(S.S2.title, 'Assistive Home Hub');
    t.eq(titles('S2'), ['Lights', 'Fans', 'Air Conditioner', 'TV & Media', 'Presets']);
    t.eq(subs('S2'), ['1 Active of 3', 'Ceiling Fan: OFF', '24°C • Cool Mode', 'Smart TV: Standby', '4 Multi-Device Semantic Routines']);
    t.eq(S.S3.title, 'Lights Fixtures');
    t.eq(titles('S3'), ['Bedroom Ceiling Light', 'Bedside Lamp', 'Living Room Light']);
    t.eq(subs('S3'), ['OFF', 'OFF', 'ON']);
    t.eq(S.S4.title, 'Action Selection & Context Reasoning Panel');
    t.eq(titles('S4'), ['Turn On', 'Turn Off', 'Adjust Brightness', 'Back']);
    t.eq(S.S6.title, 'Semantic Presets');
    t.eq(titles('S6'), ['Night Mode', 'All Lights Off', 'Cooling Mode', 'Watch TV']);
    t.eq(SA.ui.format.eegPill({ mode: 'scripted' }), 'EEG: Simulation Mode');
    if (hasDom()) {
      flush();
      t.eq(txt('pill-eeg'), 'EEG: Simulation Mode', 'pill-eeg');
      t.eq(txt('pill-env'), 'Environment: Smart-Home Simulator', 'pill-env');
      t.eq(txt('btn-caregiver'), 'Caregiver Dashboard', 'switch');
      t.eq(txt('hz-label'), 'Operator Harness — not patient-facing', 'harness label');
      [['hz-next', 'Right Hand ► Next'], ['hz-prev', 'Left Hand ◄ Previous'], ['hz-select', 'Both Feet ✓ Select'],
        ['hz-back', 'Tongue ✕ Back'], ['hz-noerrp', 'No ErrP'], ['hz-simerrp', 'Simulate ErrP']].forEach(function (p) {
        var b = $(p[0]);
        t.ok(b && b.textContent === p[1] && !!b.querySelector('.sa-bracketed'), p[0] + ' = [' + p[1] + ']');
        t.ok(b && b.getAttribute('tabindex') === '-1', p[0] + ' tabindex -1');
      });
      var order = Array.prototype.map.call(document.querySelectorAll('#sa-harness .hz-row-main button'), function (b) { return b.id; }).slice(0, 4);
      t.eq(order, ['hz-next', 'hz-prev', 'hz-select', 'hz-back'], 'README button order');
      t.eq(txt('sa-screen-title'), 'Mode Selection', 'S1 title in DOM');
      var cards = document.querySelectorAll('#sa-listbox .sa-card[role=option]');
      t.eq(cards.length, 2, 'two S1 cards');
      t.eq(document.querySelectorAll('#sa-listbox .is-focused[aria-selected=true]').length, 1, 'exactly one focused');
      t.eq(txt('sa-position'), '1 of 2', 'position line');
    }
  });

  R('ui', 'keyboard-map', function (t) {
    var K = SA.input && SA.input.keyboard;
    t.ok(!!(K && K.classify), 'keyboard.classify exists');
    if (!K || !K.classify) return;
    var map = { ArrowRight: 'right', d: 'right', D: 'right', ArrowLeft: 'left', a: 'left', A: 'left', Enter: 'feet', ' ': 'feet',
      s: 'feet', S: 'feet', Escape: 'tongue', Backspace: 'tongue', w: 'tongue', W: 'tongue' };
    Object.keys(map).forEach(function (k) {
      var r = K.classify({ key: k, repeat: false, target: null });
      t.ok(r && r.kind === 'token' && r.cls === map[k], 'key ' + JSON.stringify(k) + ' → ' + map[k]);
    });
    var c = K.classify({ key: 'c', repeat: false, target: null });
    t.ok(c && c.kind === 'dashboard', 'c toggles dashboard');
    if (!hasDom() || typeof KeyboardEvent === 'undefined') return;
    var got = [], off = SA.bus.on('input:token', function (p) { got.push(p.cls); });
    var keys = ['d', 'a', 'S', 'Escape'];
    var i = 0;
    function next() {
      if (i >= keys.length) { off(); t.eq(got, ['right', 'left', 'feet', 'tongue'], 'real KeyboardEvents → tokens'); return null; }
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: keys[i++], bubbles: true, cancelable: true }));
      return t.sleep(280).then(next);
    }
    return t.sleep(280).then(next);
  }, { timeoutMs: 6000 });

  R('ui', 'canonical-journey', function (t) {
    var resolved = null, decided = null;
    var o1 = SA.bus.on('kg:resolved', function (p) { resolved = p; });
    var o2 = SA.bus.on('policy:decided', function (p) { decided = p; });
    return toTurnOn(t).then(function () {
      o1(); o2();
      var F = SA.ui.format;
      t.ok(!!resolved, 'kg:resolved seen');
      if (resolved) {
        t.eq(resolved.intentLabel, 'Turn On Light');
        t.eq(resolved.spatialContext, 'Master Bedroom (Active User Room)');
        t.eq(resolved.actedOn && resolved.actedOn.iri, ':BedroomCeilingLight');
        t.eq(F.score(resolved.actedOn && resolved.actedOn.score), '0.94');
      }
      t.ok(!!decided, 'policy:decided seen');
      if (decided) {
        t.eq(F.pct(decided.n), '92%'); t.eq(F.pct(decided.s), '89%');
        t.eq(decided.tierLabel || F.tierLabel(decided.tier), 'Low: Autonomic');
        t.eq(decided.decision, 'EXECUTE');
      }
      t.eq(ui('result.status'), '“Observing post-action EEG...”');
      if (hasDom()) {
        flush();
        t.eq(txt('cl-intent'), 'Turn On Light', 'panel intent');
        t.eq(txt('cl-space'), 'Master Bedroom (Active User Room)', 'panel space');
        t.eq(txt('cl-entity'), ':BedroomCeilingLight', 'panel entity');
        t.ok(/0\.94/.test(txt('cl-sparql-score')), 'panel score 0.94');
        t.eq(txt('cl-neural'), '92%'); t.eq(txt('cl-semantic'), '89%');
        t.eq(txt('cl-risk'), 'Low: Autonomic');
        t.ok(/EXECUTE/.test(txt('cl-decision')), 'panel EXECUTE');
        t.ok(/Bedroom Ceiling Light: OFF ➔ ON/.test(txt('sa-result-transition')), 'S5 transition');
        t.ok((txt('sa-result-status') || '').indexOf('“Observing post-action EEG...”') >= 0, 'S5 observing text');
      }
      SA.bus.emit('errp:inject', { kind: 'correct', source: 'operator' });
      return t.waitFor(function () { return ui('result.kind') === 'success'; }, 6000, 'confirmed');
    }).then(function () {
      t.eq(ui('result.status'), 'No Error Detected • Action Confirmed');
      t.eq(SA.store.get('devices.BedroomCeilingLight.power'), 'on', 'state remains ON');
      if (hasDom()) { flush(); t.ok((txt('sa-result-status') || '').indexOf('No Error Detected • Action Confirmed') >= 0, 'DOM status'); }
    });
  }, { timeoutMs: 15000 });

  R('ui', 'rollback-journey', function (t) {
    return toTurnOn(t).then(function () {
      SA.bus.emit('errp:inject', { kind: 'error', source: 'operator' });
      return t.waitFor(function () { return ui('result.kind') === 'rollback'; }, 6000, 'rolled back');
    }).then(function () {
      var r = ui('result');
      t.eq(r.errp, 'Possible Error Detected • ErrP Deflection at FCz (-8.4 µV)');
      t.ok(r.errp.indexOf('-8.4 µV') >= 0, 'hyphen-minus + micro sign');
      t.ok(/ON ➔ OFF/.test(r.transition), 'ON ➔ OFF');
      t.eq(r.status, 'Action Rolled Back');
      t.eq(r.alt && r.alt.label, 'Bedside Lamp', 'alternative');
      t.eq(r.cards.map(function (c) { return c.title; }), ['Retry', 'Return to Home']);
      t.eq(SA.store.get('devices.BedroomCeilingLight.power'), 'off', 'restored OFF');
      if (hasDom()) {
        flush();
        t.ok((txt('sa-result-errp') || '').indexOf('ErrP Deflection at FCz (-8.4 µV)') >= 0, 'DOM errp line');
        t.ok(/ON ➔ OFF/.test(txt('sa-result-transition')), 'DOM ON ➔ OFF');
        t.ok((txt('sa-result-status') || '').indexOf('Action Rolled Back') >= 0, 'DOM rolled back');
        t.ok(/Bedside Lamp/.test(txt('sa-result-alt')), 'DOM alternative');
        var br = document.querySelectorAll('#sa-listbox .sa-card .sa-bracketed');
        t.eq(Array.prototype.map.call(br, function (b) { return b.textContent; }), ['Retry', 'Return to Home'], 'bracketed cards');
      }
      tok('NEXT'); tok('SELECT');   // [Return to Home]
      t.eq(ui('screen'), 'S2', 'home');
      // RT1-01: the ErrP safety banner must not survive into the next screen
      t.eq(ui('alert'), null, 'store alert cleared');
      if (hasDom()) { flush(); t.eq(getComputedStyle($('sa-alert')).display, 'none', '#sa-alert hidden on the Hub'); }
    });
  }, { timeoutMs: 15000 });

  // RT1-02: a REJECT must be visible on the patient stage, not only in the CogLign panel
  R('ui', 'reject-alert-visible', function (t) {
    SA.bus.emit('harness:set', { key: 'decoder.sliders.neural', value: 0.40 });
    tok('SELECT'); tok('SELECT'); tok('SELECT'); tok('SELECT');
    return t.waitFor(function () { return ui('alert') === 'Not sure, please try again'; }, 4000, 'REJECT alert in store').then(function () {
      if (!hasDom()) return null;
      flush();
      return t.sleep(80).then(function () {
        flush();
        var el = $('sa-alert');
        t.eq(el.textContent, 'Not sure, please try again', 'alert text');
        t.ok(getComputedStyle(el).display !== 'none', '#sa-alert visible after REJECT');
      });
    });
  }, { timeoutMs: 8000 });

  // RT1-03 (ADR 0002 D15): a flag-only class with an error epoch flags; it never rolls back and never says "confirmed"
  R('ui', 'flag-only-setting', function (t) {
    var D = SA.errp && SA.errp.detector, ep = SA.errp && SA.errp.synth && SA.errp.synth.epoch('error');
    t.ok(!!(D && ep), 'detector + error epoch');
    if (!D || !ep) return;
    t.ok(!isFinite(D.threshold('setting')), 'setting is flag-only (t* = ∞)');
    var r = D.observe(ep, { costClass: 'setting', tier: 'Low', pi: 0.181, mode: 'auto' });
    t.eq(r.decision, 'flag', 'fan speed + error epoch -> flag (q = ' + (r.q == null ? 'n/a' : r.q.toFixed(3)) + ')');
    var c = D.observe(SA.errp.synth.epoch('correct'), { costClass: 'setting', tier: 'Low', pi: 0.181, mode: 'auto' });
    t.eq(c.decision, 'keep', 'fan speed + correct epoch -> keep');
    var p = D.observe(ep, { costClass: 'power', tier: 'Low', pi: 0.181, mode: 'auto' });
    t.eq(p.decision, 'flag', 'TV/fan power + error epoch -> flag');
  });

  R('ui', 'wrap-and-memory', function (t) {
    tok('PREV');
    t.eq(ui('focus').S1, 1, 'wrap to last');
    tok('BACK');
    t.eq(ui('screen'), 'S1', 'S1 BACK is a no-op');
    tok('SELECT'); tok('NEXT'); tok('NEXT'); tok('SELECT');
    t.eq(ui('screen'), 'devices/ac');
    tok('BACK');
    t.eq(ui('focus').S2, 2, 'focus memory to AC');
  });

  R('ui', 'voice-lexicon', function (t) {
    var L = SA.voice && SA.voice.lexicon;
    t.ok(!!L, 'lexicon');
    if (!L) return;
    t.ok(L.hit('-8.4 µV'), '-8.4 µV key hits');
    t.eq(L.spoken('-8.4 µV'), 'minus 8 point 4 microvolts');
    t.ok(/minus 8 point 4 microvolts/.test(L.speakable('ErrP Deflection at FCz (-8.4 µV)')), 'speakable');
    t.eq(SA.config.voice.allowOnline, false, 'online voices never used');
  });

  R('ui', 'contrast-tokens', function (t) {
    var cs = getComputedStyle(document.documentElement);
    function hex(n) { return cs.getPropertyValue(n).trim(); }
    function lum(h) {
      var v = h.replace('#', ''), c = [0, 2, 4].map(function (i) { var x = parseInt(v.substr(i, 2), 16) / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    }
    function ratio(a, b) { var A = lum(hex(a)), B = lum(hex(b)); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); }
    t.eq(hex('--focus-ring').toUpperCase(), '#FFC94D', 'focus ring');
    t.eq(hex('--focus-width'), '6px', 'focus width');
    ['--bg-surface', '--bg-raised', '--surface-focus'].forEach(function (bg) {
      t.ok(ratio('--text', bg) >= 7, '--text on ' + bg);
      t.ok(ratio('--text-muted', bg) >= 7, '--text-muted on ' + bg);
    });
    ['--bg-surface', '--bg-page'].forEach(function (bg) {
      t.ok(ratio('--border', bg) >= 3, '--border on ' + bg);
      t.ok(ratio('--focus-ring', bg) >= 3, '--focus-ring on ' + bg);
    });
  }, { needsDom: true });
})(typeof window !== 'undefined' ? window : globalThis);
