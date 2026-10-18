/* SilentAssist — SA.voice.speech + SA.voice.lexicon (ADR 0005 D15–D20). Owner: UI.
 * Local voices only (allowOnline:false, hard). Text always mirrored to #sa-status (nav) / #sa-alert (safety).
 * setTimeout is permitted here only for speak-after-cancel and the 250/1000/3000 ms re-pick (architecture §0.1). */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.voice = SA.voice || {};

  /* Lexicon keyed on README display bytes → spoken form (D19). Order matters (longest first). */
  var LEX = [
    { key: '-8.4 µV', spoken: 'minus 8 point 4 microvolts' },
    { key: 'FCz', spoken: 'F C z' },
    { key: 'Cz', spoken: 'C z' },
    { key: '°C', spoken: ' degrees Celsius' },
    { key: '➔', spoken: ' to ' },
    { key: '•', spoken: ', ' }
  ];
  function speakable(text) {
    var s = String(text || '');
    s = s.replace(/(-?)(\d+)\.(\d+) µV/g, function (m, neg, a, b) {
      return (neg ? 'minus ' : '') + a + ' point ' + b.split('').join(' ') + ' microvolts';
    });
    LEX.forEach(function (e) {
      if (e.key === 'Cz') s = s.replace(/\bCz\b/g, e.spoken);
      else s = s.split(e.key).join(e.spoken);
    });
    return s.replace(/[“”]/g, '').replace(/\s+/g, ' ').trim();
  }
  function hit(display) { return LEX.some(function (e) { return e.key === display; }) ; }
  SA.voice.lexicon = { entries: LEX, speakable: speakable, hit: hit, spoken: function (k) {
    for (var i = 0; i < LEX.length; i++) if (LEX[i].key === k) return LEX[i].spoken;
    return null;
  } };

  function chunks(text, max) {
    var out = [], parts = String(text).match(/[^.!?]+[.!?]*\s*/g) || [String(text)], cur = '';
    parts.forEach(function (p) {
      if ((cur + p).length > max && cur) { out.push(cur.trim()); cur = ''; }
      while (p.length > max) { out.push(p.slice(0, max)); p = p.slice(max); }
      cur += p;
    });
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  var inited = false, voice = null, activated = false, safetyQueue = [], safetyActive = false, pendingNav = null;
  var lastStatus = null;

  function synth() { return (typeof window !== 'undefined' && window.speechSynthesis) ? window.speechSynthesis : null; }
  function cfg() { return SA.config.voice || {}; }

  function pickVoice() {
    var ss = synth();
    var list = [];
    try { list = ss ? ss.getVoices() || [] : []; } catch (e) { list = []; }
    var local = list.filter(function (v) { return v.localService === true && /^en/i.test(v.lang || ''); });
    function rank(v) {
      var n = v.name || '';
      if (/^en[-_]US/i.test(v.lang)) {
        if (/Zira/i.test(n)) return 1; if (/David/i.test(n)) return 2; if (/Mark/i.test(n)) return 3; return 0.5;
      }
      if (/Zira/i.test(n)) return 4; if (/David/i.test(n)) return 5; if (/Mark/i.test(n)) return 6;
      return 7;
    }
    local.sort(function (a, b) { return rank(a) - rank(b); });
    voice = local[0] || null;   // online voices are never used (allowOnline:false)
    var st = { available: !!voice, voiceName: voice ? voice.name : null };
    if (!lastStatus || lastStatus.available !== st.available || lastStatus.voiceName !== st.voiceName) {
      lastStatus = st;
      SA.bus.emit('voice:status', st);
    }
    return voice;
  }

  function allowed(priority) {
    var prefs = SA.store.get('prefs') || {}, navMode = SA.store.get('ui.navMode');
    if (priority === 'safety') return !!prefs.voice || navMode === 'visual';
    return !!prefs.voice && navMode !== 'visual';
  }

  function utter(text, onDone) {
    var ss = synth();
    if (!ss || !voice || typeof SpeechSynthesisUtterance === 'undefined') { if (onDone) onDone(); return; }
    var parts = chunks(text, cfg().maxChars || 160);
    parts.forEach(function (p, i) {
      var u = new SpeechSynthesisUtterance(p);
      u.voice = voice; u.lang = cfg().lang || 'en-US'; u.rate = cfg().rate || 0.95; u.pitch = cfg().pitch || 1.0;
      if (i === parts.length - 1 && onDone) { u.onend = onDone; u.onerror = onDone; }   // canceled/interrupted are normal
      try { ss.speak(u); } catch (e) { if (onDone) onDone(); }
    });
  }

  function drainSafety() {
    if (!safetyQueue.length) {
      safetyActive = false;
      if (pendingNav) { var n = pendingNav; pendingNav = null; speakNav(n); }
      return;
    }
    safetyActive = true;
    utter(safetyQueue.shift(), drainSafety);
  }
  function speakNav(text) {
    var ss = synth();
    if (!ss) return;
    try { ss.cancel(); } catch (e) { /* ignore */ }
    setTimeout(function () { if (!safetyActive) utter(text); }, 0);
  }

  function region(priority) {
    if (typeof document === 'undefined') return null;
    return document.getElementById(priority === 'safety' ? 'sa-alert' : 'sa-status');
  }

  function say(display, speech, priority) {
    priority = priority === 'safety' ? 'safety' : 'nav';
    var el = region(priority);
    if (el && SA.ui && SA.ui.components && SA.ui.components.caption) SA.ui.components.caption.render(el, { text: display });
    else if (el) el.textContent = display;
    if (!activated || !voice || !allowed(priority)) return;
    var spoken = speakable(speech || display);
    if (priority === 'safety') {
      if (!safetyActive) { var ss = synth(); try { if (ss) ss.cancel(); } catch (e) { /* ignore */ } }
      safetyQueue.push(spoken);
      if (!safetyActive) { safetyActive = true; setTimeout(drainSafety, 0); }
    } else if (safetyActive) {
      pendingNav = spoken;   // only the latest navigation string is kept
    } else {
      speakNav(spoken);
    }
  }

  function init() {
    if (inited) return;
    inited = true;
    SA.bus.on('voice:say', function (p) { if (p) say(p.display || '', p.speech, p.priority); });
    SA.bus.on('demo:reset', function () {
      safetyQueue = []; safetyActive = false; pendingNav = null;
      var ss = synth(); try { if (ss) ss.cancel(); } catch (e) { /* ignore */ }
      var s = region('nav'); if (s) s.textContent = '';
    });
    if (typeof window === 'undefined' || !window.addEventListener) { pickVoice(); return; }
    var act = function () { activated = true; };
    window.addEventListener('keydown', act, true);
    window.addEventListener('pointerdown', act, true);
    var ss = synth();
    if (ss && ss.addEventListener) ss.addEventListener('voiceschanged', pickVoice);
    else if (ss) ss.onvoiceschanged = pickVoice;
    pickVoice();
    (cfg().repickMs || [250, 1000, 3000]).forEach(function (ms) { setTimeout(pickVoice, ms); });
  }

  SA.voice.speech = { init: init, say: say, pickVoice: pickVoice, status: function () { return lastStatus; }, _chunks: chunks };
})(typeof window !== 'undefined' ? window : globalThis);
