/* SilentAssist — top-bar pills (ADR 0005 D21). Owner: UI.
 * render(topbarEl, {decoder, voice:{available, voiceName}|null, dashboardOpen}) */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.ui = SA.ui || {};
  SA.ui.components = SA.ui.components || {};

  function setText(el, t) { if (el && el.textContent !== t) el.textContent = t; }

  function render(el, model) {
    if (!el) return;
    var doc = el.ownerDocument, S = SA.config.ui.strings, F = SA.ui.format;
    model = model || {};
    var dec = model.decoder || { mode: 'scripted' };
    var q = function (id) { return doc.getElementById(id); };
    setText(q('sa-title'), 'SilentAssist');
    setText(q('pill-eeg'), F.eegPill(dec));
    setText(q('pill-env'), S.pillEnv);
    var dp = q('pill-decoder');
    if (dp) {
      setText(dp, F.decoderPill(dec));
      dp.setAttribute('title', F.decoderPill(dec));
      dp.classList.toggle('is-prelim', dec.mode !== 'scripted');
    }
    var vp = q('pill-voice');
    if (vp) {
      var v = model.voice;
      var t;
      if (!v) t = 'Voice: checking…';
      else if (!v.available) t = S.voiceTextOnly;
      else t = 'Voice: ' + (model.voiceOn ? 'on' : 'off') + ' · ' + String(v.voiceName || 'local').replace(/^Microsoft\s+/, '').replace(/\s+-\s+.*$/, '');
      setText(vp, t);
    }
    var btn = q('btn-caregiver');
    if (btn) {
      setText(btn, S.dashboardSwitch);
      btn.setAttribute('aria-pressed', model.dashboardOpen ? 'true' : 'false');
      btn.classList.toggle('is-on', !!model.dashboardOpen);
    }
  }

  SA.ui.components.pills = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
