/* SilentAssist — SA.ui.format: pure, DOM-free display helpers (owner: UI). docs/architecture.md §2.6 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.ui = SA.ui || {};

  var ARROW = ' ➔ ';
  function cap(s) { s = String(s == null ? '' : s); return s.charAt(0).toUpperCase() + s.slice(1); }
  function up(s) { return String(s == null ? '' : s).toUpperCase(); }
  function str() { return (SA.config && SA.config.ui && SA.config.ui.strings) || {}; }

  function fixtureState(d) { return d && d.power === 'on' ? 'ON' : 'OFF'; }

  function fanState(d) {
    if (!d || d.power !== 'on' || !d.speed) return 'OFF';
    return up(d.speed);
  }
  function acSummary(d) {
    if (!d) return '';
    var core = d.setpoint + '°C • ' + cap(d.mode) + ' Mode';
    return d.power === 'on' ? core : 'OFF • ' + core;
  }
  function tvSummary(d) {
    if (!d) return '';
    if (d.power !== 'on') return 'Smart TV: Standby';
    return 'Smart TV: ON • Ch ' + d.channel + ' • Vol ' + d.volume;
  }

  function hubSubtitle(itemId, devices) {
    devices = devices || {};
    switch (itemId) {
      case 'lights': {
        var n = 0, total = 0;
        Object.keys(devices).forEach(function (k) {
          if (devices[k].kind === 'light') { total++; if (devices[k].power === 'on') n++; }
        });
        return n + ' Active of ' + (total || 3);
      }
      case 'fans': return 'Ceiling Fan: ' + fanState(devices.CeilingFan);
      case 'ac': return acSummary(devices.AirConditioner);
      case 'tv': return tvSummary(devices.SmartTV);
      case 'presets': return str().presetsSub || '4 Multi-Device Semantic Routines';
      default: return '';
    }
  }

  /* One-line summary of a device state, used on either side of the ➔ arrow. */
  function stateText(d) {
    if (!d) return '';
    switch (d.kind) {
      case 'light':
        return d.power === 'on' ? (d.brightness != null && d.brightness !== 100 ? 'ON ' + d.brightness + '%' : 'ON') : 'OFF';
      case 'fan': return fanState(d);
      case 'ac': return acSummary(d);
      case 'tv': return d.power === 'on' ? 'ON • Ch ' + d.channel + ' • Vol ' + d.volume : 'Standby';
      default: return d.power != null ? up(d.power) : '';
    }
  }

  /* Diff text for a step {deviceId, before, after}: 'Bedroom Ceiling Light: OFF ➔ ON'. */
  function transition(step) {
    if (!step) return '';
    var b = step.before || {}, a = step.after || {};
    var label = a.label || b.label || step.label || step.deviceId || '';
    var bt, at;
    var kind = a.kind || b.kind;
    if (kind === 'light') {
      bt = b.power === 'on' ? 'ON' : 'OFF';
      at = a.power === 'on' ? 'ON' : 'OFF';
      if (a.power === 'on' && a.brightness !== b.brightness) at = 'ON ' + a.brightness + '%';
      else if (a.power === 'on' && b.power !== 'on' && a.brightness != null && a.brightness !== 100) at = 'ON ' + a.brightness + '%';
      if (b.power === 'on' && a.power === 'on' && a.brightness !== b.brightness) bt = b.brightness + '%';
    } else if (kind === 'ac') {
      var parts = [];
      if (a.power !== b.power) parts.push(up(b.power) + ARROW + up(a.power));
      if (a.setpoint !== b.setpoint) parts.push(b.setpoint + '°C' + ARROW + a.setpoint + '°C');
      if (a.mode !== b.mode) parts.push(cap(b.mode) + ' Mode' + ARROW + cap(a.mode) + ' Mode');
      return label + ': ' + (parts.join(', ') || stateText(b) + ARROW + stateText(a));
    } else if (kind === 'tv') {
      var p = [];
      if (a.power !== b.power) p.push((b.power === 'on' ? 'ON' : 'Standby') + ARROW + (a.power === 'on' ? 'ON' : 'Standby'));
      if (a.channel !== b.channel) p.push('Ch ' + b.channel + ARROW + 'Ch ' + a.channel);
      if (a.volume !== b.volume) p.push('Vol ' + b.volume + ARROW + 'Vol ' + a.volume);
      return label + ': ' + (p.join(', ') || stateText(b) + ARROW + stateText(a));
    } else {
      bt = stateText(b); at = stateText(a);
    }
    return label + ': ' + bt + ARROW + at;
  }

  /* Reverse of a step (used for the rollback line 'ON ➔ OFF'). */
  function reverseTransition(step) {
    if (!step) return '';
    return transition({ deviceId: step.deviceId, before: step.after, after: step.before });
  }

  function pct(x) { return (x == null || isNaN(x)) ? '—' : Math.round(x * 100) + '%'; }
  function score(x) { return (x == null || isNaN(x)) ? '—' : Number(x).toFixed(2); }
  function tierLabel(tier) {
    var map = (SA.config && SA.config.policy && SA.config.policy.tierLabels) ||
      { Low: 'Low: Autonomic', Medium: 'Medium: Guarded', High: 'High: Caregiver Approval' };
    return tier ? (map[tier] || String(tier)) : '—';
  }
  function decisionChip(d) {
    switch (d) {
      case 'EXECUTE': return '✓ EXECUTE';
      case 'CONFIRM': return '? CONFIRM';
      case 'REJECT': return '✕ REJECT';
      case 'CAREGIVER': case 'CAREGIVER APPROVAL': return '⚑ CAREGIVER APPROVAL';
      default: return d ? String(d) : '—';
    }
  }
  function errpStatus(uv) {
    var v = (uv == null || isNaN(uv)) ? -8.4 : Number(uv);
    var s = v.toFixed(1);
    if (s === '-0.0') s = '0.0';
    return 'Possible Error Detected • ErrP Deflection at FCz (' + s + ' µV)';
  }

  function synthSeed() {
    return (SA.config && SA.config.eeg && SA.config.eeg.synth && SA.config.eeg.synth.seed) || 0;
  }
  function eegPill(dec) {
    var mode = dec && dec.mode;
    if (mode === 'replay') return 'EEG: Replay Mode (BCI IV-2a A01, session E)';
    if (mode === 'synthetic') return 'EEG: Synthetic Mode (generated, seed ' + synthSeed() + ')';
    return 'EEG: Simulation Mode';
  }
  function decoderPill(dec) {
    var mode = dec && dec.mode;
    var stub = dec && dec.dataStatus && (dec.dataStatus.weights === 'stub' || dec.dataStatus.replay === 'stub');
    if (mode === 'replay') return 'Decoder: Replay · PRELIMINARY (Plan B)' + (stub ? ' · STUB DATA — not model output' : '');
    if (mode === 'synthetic') return 'Decoder: Synthetic · PRELIMINARY (Plan B)' + (stub ? ' · STUB DATA — not model output' : '');
    return 'Decoder: Scripted';
  }

  var CMD_LABEL = { TurnOn: 'Turn On', TurnOff: 'Turn Off', SetBrightness: 'Set Brightness', SetFanSpeed: 'Set Fan Speed',
    SetTemperature: 'Set Temperature', SetMode: 'Set Mode', ChannelUp: 'Channel +', ChannelDown: 'Channel −',
    VolumeUp: 'Volume +', VolumeDown: 'Volume −', ApplyPreset: 'Run' };

  /* 'Turn On Bedroom Ceiling Light' — used by the confirm card and Retry subtitle. */
  function actionLabel(action, devices) {
    if (!action) return '';
    var target = action.target || { kind: action.kind, id: action.id };
    var dev = devices && devices[target.id];
    var name = dev ? dev.label : (target.label || presetLabel(target.id) || target.id || '');
    var verb = CMD_LABEL[action.command] || action.command || '';
    var v = action.args && action.args.value;
    if (action.command === 'SetTemperature' && v != null) return 'Set ' + name + ' to ' + v + '°C';
    if (action.command === 'SetBrightness' && v != null) return 'Set ' + name + ' to ' + v + '%';
    if (action.command === 'SetFanSpeed' && v != null) return 'Set ' + name + ' to ' + cap(v);
    if (action.command === 'SetMode' && v != null) return 'Set ' + name + ' to ' + cap(v) + ' Mode';
    if (target.kind === 'preset') return name;
    return verb + ' ' + name;
  }

  var PRESET_IDS = ['NightMode', 'AllLightsOff', 'CoolingMode', 'WatchTV'];
  function presetLabel(id) {
    var i = PRESET_IDS.indexOf(id);
    var names = str().presets || ['Night Mode', 'All Lights Off', 'Cooling Mode', 'Watch TV'];
    return i >= 0 ? names[i] : '';
  }

  SA.ui.format = {
    hubSubtitle: hubSubtitle, fixtureState: fixtureState, fanState: fanState, acSummary: acSummary, tvSummary: tvSummary,
    stateText: stateText, transition: transition, reverseTransition: reverseTransition,
    pct: pct, score: score, tierLabel: tierLabel, decisionChip: decisionChip, errpStatus: errpStatus,
    eegPill: eegPill, decoderPill: decoderPill, actionLabel: actionLabel, presetLabel: presetLabel,
    PRESET_IDS: PRESET_IDS, cap: cap
  };
})(typeof window !== 'undefined' ? window : globalThis);
