/* SilentAssist — SA.ui.screens (declarative screen table, ADR 0005 D6) + SA.nav (screen graph, BFS). DOM-free. Owner: UI. */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.ui = SA.ui || {};

  function S() { return (SA.config && SA.config.ui && SA.config.ui.strings) || {}; }
  function F() { return SA.ui.format; }
  function devs(state) { return (state && state.devices) || {}; }
  function mem(state, screen, dflt) {
    var m = state && state.ui && state.ui.focusMemory;
    return (m && typeof m[screen] === 'number') ? m[screen] : dflt;
  }
  function devItem(id, title, subtitle, extra) {
    var o = { id: id, title: title, subtitle: subtitle || '', disabled: false };
    if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }
  function act(kind, id, command, args) { return { action: { target: { kind: kind, id: id }, command: command, args: args || {} } }; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function dcfg() { return (SA.config && SA.config.devices) || { brightnessLevels: [25, 50, 75, 100], fanSpeeds: ['low', 'medium', 'high'], ac: { min: 16, max: 32, step: 1 }, tv: { chMin: 1, chMax: 99, volMin: 0, volMax: 100, volumeStep: 5 } }; }

  function lights(state) {
    var d = devs(state);
    return Object.keys(d).filter(function (k) { return d[k].kind === 'light'; })
      .sort(function (a, b) { return (d[a].order || 0) - (d[b].order || 0); });
  }
  function fixtureOf(state) {
    var f = state && state.ui && state.ui.fixture;
    return f || lights(state)[0] || 'BedroomCeilingLight';
  }
  var BACK_ITEM = function () { return devItem('back', S().actBack || 'Back', ''); };

  var screens = {
    S1: {
      get title() { return S().s1Title; }, ariaLabel: 'Navigation modes', columns: 2,
      items: function () {
        return [devItem('visual', S().s1Visual, S().s1VisualSub), devItem('audio', S().s1Audio, S().s1AudioSub)];
      },
      select: function (item) { return { goto: 'S2', focus: 0, navMode: item.id === 'audio' ? 'audio' : 'visual' }; },
      back: function () { return { noop: S().firstScreen || 'This is the first screen' }; },
      entryFocus: function () { return 0; }
    },
    S2: {
      get title() { return S().s2Title; }, ariaLabel: 'Home categories', columns: 3,
      items: function (state) {
        var d = devs(state), f = F();
        return [devItem('lights', S().hubLights, f.hubSubtitle('lights', d)), devItem('fans', S().hubFans, f.hubSubtitle('fans', d)),
          devItem('ac', S().hubAc, f.hubSubtitle('ac', d)), devItem('tv', S().hubTv, f.hubSubtitle('tv', d)),
          devItem('presets', S().hubPresets, f.hubSubtitle('presets', d))];
      },
      select: function (item) {
        var to = { lights: 'S3', fans: 'devices/fan', ac: 'devices/ac', tv: 'devices/tv', presets: 'S6' }[item.id];
        return { goto: to };
      },
      back: function (state) { return { goto: 'S1', focus: mem(state, 'S1', 0) }; },
      entryFocus: function () { return 0; }
    },
    S3: {
      get title() { return S().s3Title; }, ariaLabel: 'Light fixtures', columns: 3,
      items: function (state) {
        var d = devs(state);
        return lights(state).map(function (k) { return devItem(k, d[k].label, F().fixtureState(d[k])); });
      },
      select: function (item) { return { goto: 'S4', fixture: item.id }; },
      back: function (state) { return { goto: 'S2', focus: 0 }; },
      entryFocus: function () { return 0; }
    },
    S4: {
      get title() { return S().s4Title; }, ariaLabel: 'Light actions', columns: 2,
      items: function (state) {
        var d = devs(state)[fixtureOf(state)];
        var sub = d ? d.label + ' • ' + F().fixtureState(d) : '';
        return [devItem('on', S().actTurnOn, sub), devItem('off', S().actTurnOff, sub),
          devItem('brightness', S().actBrightness, d && d.power === 'on' ? 'Now ' + d.brightness + '%' : ''), BACK_ITEM()];
      },
      select: function (item, state) {
        var fx = fixtureOf(state);
        if (item.id === 'on') return act('device', fx, 'TurnOn');
        if (item.id === 'off') return act('device', fx, 'TurnOff');
        if (item.id === 'brightness') return { goto: 'lights/brightness' };
        return { back: true };
      },
      back: function (state) {
        var idx = lights(state).indexOf(fixtureOf(state));
        return { goto: 'S3', focus: idx < 0 ? 0 : idx };
      },
      entryFocus: function () { return 0; }, s5: true
    },
    'lights/brightness': {
      get title() { return S().brightnessTitle || 'Adjust Brightness'; }, ariaLabel: 'Brightness levels', columns: 5,
      items: function (state) {
        var d = devs(state)[fixtureOf(state)];
        return dcfg().brightnessLevels.map(function (lv) {
          var cur = d && d.power === 'on' && d.brightness === lv;
          return devItem('b' + lv, lv + '%', cur ? 'Current' : '', { badge: cur ? 'Current' : '' });
        }).concat([BACK_ITEM()]);
      },
      select: function (item, state) {
        if (item.id === 'back') return { back: true };
        return act('device', fixtureOf(state), 'SetBrightness', { value: parseInt(item.id.slice(1), 10) });
      },
      back: function () { return { goto: 'S4', focus: 2 }; },
      entryFocus: function (state) {
        var d = devs(state)[fixtureOf(state)], lv = dcfg().brightnessLevels, best = lv.length - 1;
        if (d && d.brightness != null) {
          lv.forEach(function (x, i) { if (Math.abs(x - d.brightness) < Math.abs(lv[best] - d.brightness)) best = i; });
        }
        return best;
      }
    },
    'devices/fan': {
      get title() { return S().fanTitle || 'Fans'; }, ariaLabel: 'Ceiling fan controls', columns: 5,
      items: function (state) {
        var d = devs(state).CeilingFan || {}, on = d.power === 'on';
        var it = [devItem('off', 'Off', !on ? 'Current' : '', { badge: !on ? 'Current' : '' })];
        dcfg().fanSpeeds.forEach(function (sp) {
          var cur = on && d.speed === sp;
          it.push(devItem(sp, F().cap(sp), cur ? 'Current' : '', { badge: cur ? 'Current' : '' }));
        });
        return it.concat([BACK_ITEM()]);
      },
      select: function (item) {
        if (item.id === 'back') return { back: true };
        if (item.id === 'off') return act('device', 'CeilingFan', 'TurnOff');
        return act('device', 'CeilingFan', 'SetFanSpeed', { value: item.id });
      },
      back: function () { return { goto: 'S2', focus: 1 }; },
      entryFocus: function (state) {
        var d = devs(state).CeilingFan || {};
        var i = d.power === 'on' ? dcfg().fanSpeeds.indexOf(d.speed) : -1;
        return i >= 0 ? i + 1 : 1;
      }
    },
    'devices/ac': {
      get title() { return S().acTitle || 'Air Conditioner'; }, ariaLabel: 'Air conditioner controls', columns: 4,
      items: function (state) {
        var d = devs(state).AirConditioner || {};
        function m(x) { return d.mode === x ? 'Current' : ''; }
        return [devItem('power', 'Power', d.power === 'on' ? 'Currently ON' : 'Currently OFF'),
          devItem('tempDown', 'Temp −', 'Setpoint ' + d.setpoint + '°C'), devItem('tempUp', 'Temp +', 'Setpoint ' + d.setpoint + '°C'),
          devItem('modeCool', 'Mode: Cool', m('cool'), { badge: m('cool') }), devItem('modeFan', 'Mode: Fan', m('fan'), { badge: m('fan') }),
          devItem('modeDry', 'Mode: Dry', m('dry'), { badge: m('dry') }), BACK_ITEM()];
      },
      select: function (item, state) {
        var d = devs(state).AirConditioner || {}, c = dcfg().ac;
        switch (item.id) {
          case 'power': return act('device', 'AirConditioner', d.power === 'on' ? 'TurnOff' : 'TurnOn');
          case 'tempDown': return act('device', 'AirConditioner', 'SetTemperature', { value: clamp(d.setpoint - c.step, c.min, c.max), delta: -c.step });
          case 'tempUp': return act('device', 'AirConditioner', 'SetTemperature', { value: clamp(d.setpoint + c.step, c.min, c.max), delta: c.step });
          case 'modeCool': return act('device', 'AirConditioner', 'SetMode', { value: 'cool' });
          case 'modeFan': return act('device', 'AirConditioner', 'SetMode', { value: 'fan' });
          case 'modeDry': return act('device', 'AirConditioner', 'SetMode', { value: 'dry' });
          default: return { back: true };
        }
      },
      back: function () { return { goto: 'S2', focus: 2 }; },
      entryFocus: function () { return 0; }
    },
    'devices/tv': {
      get title() { return S().tvTitle || 'TV & Media'; }, ariaLabel: 'TV controls', columns: 3,
      items: function (state) {
        var d = devs(state).SmartTV || {}, on = d.power === 'on', hint = S().tvStandbyHint || '(TV in standby)';
        return [devItem('power', 'Power', on ? 'Currently ON' : 'Currently Standby'),
          devItem('chDown', 'Channel −', on ? 'Ch ' + d.channel : hint), devItem('chUp', 'Channel +', on ? 'Ch ' + d.channel : hint),
          devItem('volDown', 'Volume −', on ? 'Vol ' + d.volume : hint), devItem('volUp', 'Volume +', on ? 'Vol ' + d.volume : hint), BACK_ITEM()];
      },
      select: function (item, state) {
        var d = devs(state).SmartTV || {}, c = dcfg().tv;
        if (item.id === 'back') return { back: true };
        if (item.id === 'power') return act('device', 'SmartTV', d.power === 'on' ? 'TurnOff' : 'TurnOn');
        if (d.power !== 'on') return { noop: S().tvOnFirst || 'Turn the TV on first' };
        var span = c.chMax - c.chMin + 1;
        switch (item.id) {
          case 'chDown': return act('device', 'SmartTV', 'ChannelDown', { value: ((d.channel - 1 - c.chMin + span) % span) + c.chMin });
          case 'chUp': return act('device', 'SmartTV', 'ChannelUp', { value: ((d.channel + 1 - c.chMin) % span) + c.chMin });
          case 'volDown': return act('device', 'SmartTV', 'VolumeDown', { value: clamp(d.volume - c.volumeStep, c.volMin, c.volMax) });
          default: return act('device', 'SmartTV', 'VolumeUp', { value: clamp(d.volume + c.volumeStep, c.volMin, c.volMax) });
        }
      },
      back: function () { return { goto: 'S2', focus: 3 }; },
      entryFocus: function () { return 0; }
    },
    S5: {
      get title() { return S().s5Title || 'Action Result'; }, ariaLabel: 'Action result options', columns: 2,
      items: function (state) {
        var r = state && state.ui && state.ui.result;
        if (!r || !r.cards) return [];
        return r.cards.map(function (c) { return devItem(c.id, c.title, c.subtitle || '', { bracketed: !!c.bracketed }); });
      },
      select: function (item) { return { outcome: item.id }; },
      back: function (state) {
        var r = state && state.ui && state.ui.result;
        if (!r || !r.cards) return { noop: S().observingWait };
        return { outcome: r.kind === 'success' || r.kind === 'flag' ? 'continue' : 'home' };
      },
      entryFocus: function () { return 0; }
    },
    S6: {
      get title() { return S().s6Title; }, ariaLabel: 'Semantic presets', columns: 2,
      items: function () {
        return F().PRESET_IDS.map(function (id, i) { return devItem(id, S().presets[i], ''); });
      },
      select: function (item) { return act('preset', item.id, 'ApplyPreset'); },
      back: function () { return { goto: 'S2', focus: 4 }; },
      entryFocus: function () { return 0; }, s5: true
    }
  };

  /* Screens that route actions to S5 (README flow); the rest observe inline (ADR 0005 D9). */
  screens.S4.resultScreen = 'S5'; screens.S6.resultScreen = 'S5';

  var graph = {
    S1: ['S2'], S2: ['S1', 'S3', 'devices/fan', 'devices/ac', 'devices/tv', 'S6'], S3: ['S2', 'S4'],
    S4: ['S3', 'lights/brightness', 'S5'], 'lights/brightness': ['S4'], 'devices/fan': ['S2'], 'devices/ac': ['S2'],
    'devices/tv': ['S2'], S5: ['S4', 'S2', 'S6'], S6: ['S2', 'S5']
  };
  function shortestPath(from, to) {
    if (!graph[from] || !graph[to]) return null;
    if (from === to) return [from];
    var prev = {}, q = [from], seen = {}; seen[from] = true;
    while (q.length) {
      var cur = q.shift();
      var nx = graph[cur] || [];
      for (var i = 0; i < nx.length; i++) {
        if (seen[nx[i]]) continue;
        seen[nx[i]] = true; prev[nx[i]] = cur;
        if (nx[i] === to) {
          var path = [to], p = to;
          while (prev[p]) { p = prev[p]; path.unshift(p); }
          return path;
        }
        q.push(nx[i]);
      }
    }
    return null;
  }

  SA.ui.screens = screens;
  SA.nav = { graph: graph, shortestPath: shortestPath };
  SA.ui.screenUtil = { lights: lights, fixtureOf: fixtureOf };
})(typeof window !== 'undefined' ? window : globalThis);
