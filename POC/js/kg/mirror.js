/*
 * SA.kg.mirror — keeps the KG a single-writer mirror of SA.store (ADR 0003 D3)
 * and owns the device-state <-> triple mapping plus command effects.
 *
 *   init()                     subscribes device:stateChanged, kg:resolved, action:confirmed,
 *                              errp:observed, context:roomChanged, demo:reset
 *   readState(id) -> device    store-shaped object read back from triples
 *   deviceStates() -> {id: device}   (selftest: equals store.devices)
 *   writeState(id, device)     rewrites that device's state triples
 *   normalize(device, command, args) -> {command, args}   (aliases: Power/TogglePower,
 *                              TempDown/TempUp, 'Temp -'/'Temp +')
 *   effect(device, command, args) -> after   pure; clamps/wraps per SA.config.devices
 *   recordConfirmed(entityId, command, room), recordErrp(result, about), recordRoom(room, conf)
 *
 * Command vocabulary (KG local names in sa:): TurnOn, TurnOff, SetBrightness {value},
 * SetFanSpeed {value:'low'|'medium'|'high'}, SetTemperature {value} | {delta},
 * SetMode {value:'cool'|'fan'|'dry'}, ChannelUp, ChannelDown, VolumeUp, VolumeDown.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.kg = SA.kg || {};

  var SA_NS = 'https://silentassist.example/ns#', HOME = 'https://silentassist.example/home#';
  var SAREF = 'https://saref.etsi.org/core/', BOT = 'https://w3id.org/bot#', SOSA = 'http://www.w3.org/ns/sosa/';
  var RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
  var XSD = 'http://www.w3.org/2001/XMLSchema#';
  var KIND_OF_CLASS = [['Light', 'light'], ['Fan', 'fan'], ['AirConditioner', 'ac'], ['Television', 'tv']];
  var POWER = { On: 'on', Off: 'off', Standby: 'standby' };
  var POWER_IRI = { on: 'On', off: 'Off', standby: 'Standby' };
  var SPEED = { SpeedLow: 'low', SpeedMedium: 'medium', SpeedHigh: 'high' };
  var MODE = { ModeCool: 'cool', ModeFan: 'fan', ModeDry: 'dry' };
  function inv(m) { var o = {}; for (var k in m) o[m[k]] = k; return o; }
  var SPEED_IRI = inv(SPEED), MODE_IRI = inv(MODE);

  var episodes = {}, seq = { exec: 0, errp: 0, room: 0 }, offs = [], fallbackTick = 0;

  function T() { return SA.kg.term; }
  function st() { return SA.kg.resolver.triples(); }
  function iri(v) { return T().iri(v); }
  function h(local) { return iri(HOME + local); }
  function s(local) { return iri(SA_NS + local); }
  function local(term) { if (!term) return null; var v = term.value; return v.slice(Math.max(v.lastIndexOf('#'), v.lastIndexOf('/')) + 1); }
  function num(term) { return term ? Number(term.value) : null; }
  function lit(v) { return T().fromJS(v); }
  function dt(iso) { return T().literal(iso, XSD + 'dateTime'); }

  function devCfg() {
    var d = (SA.config && SA.config.devices) || {};
    return { ac: d.ac || { min: 16, max: 32, step: 1 }, tv: d.tv || { chMin: 1, chMax: 99, volMin: 0, volMax: 100, volumeStep: 5 } };
  }

  // ------------------------------------------------------------ read / write
  function kindOf(store, d) {
    for (var i = 0; i < KIND_OF_CLASS.length; i++) {
      if (store.has(d, iri(RDF_TYPE), s(KIND_OF_CLASS[i][0]))) return KIND_OF_CLASS[i][1];
    }
    return null;
  }
  function soiValue(store, d, kind) {      // StateOfInterest of the given kind -> value local name
    var sois = store.objects(d, iri(SAREF + 'hasStateOfInterest'));
    for (var i = 0; i < sois.length; i++) {
      if (store.has(sois[i], iri(SAREF + 'hasStateKind'), s(kind))) return local(store.one(sois[i], iri(SAREF + 'hasStateValue')));
    }
    return null;
  }
  function propValue(store, id, prop) {
    return num(store.one(h(id + '_' + prop + '_v'), iri(SAREF + 'hasValue')));
  }

  function readState(id) {
    var store = st(), d = h(id), kind = kindOf(store, d);
    if (!kind) return null;
    var room = store.subjects(iri(BOT + 'containsElement'), d)[0];
    var o = { kind: kind, label: store.one(d, iri(RDFS_LABEL)).value, room: local(room) };
    var order = store.one(d, s('displayOrder'));
    if (kind === 'light') o.order = num(order);
    o.power = POWER[soiValue(store, d, 'PowerState')] || null;
    if (kind === 'light') o.brightness = propValue(store, id, 'brightness');
    if (kind === 'fan') { var sp = soiValue(store, d, 'FanSpeedState'); o.speed = sp ? SPEED[sp] : null; }
    if (kind === 'ac') { o.setpoint = propValue(store, id, 'setpoint'); o.mode = MODE[soiValue(store, d, 'ACModeState')] || null; }
    if (kind === 'tv') { o.channel = propValue(store, id, 'channel'); o.volume = propValue(store, id, 'volume'); }
    return o;
  }

  function deviceIds() {
    var store = st(), out = [];
    KIND_OF_CLASS.forEach(function (k) {
      store.subjects(iri(RDF_TYPE), s(k[0])).forEach(function (d) {
        if (d.value.indexOf(HOME) === 0 && out.indexOf(local(d)) < 0) out.push(local(d));
      });
    });
    return out;
  }
  function deviceStates() {
    var o = {};
    deviceIds().forEach(function (id) { o[id] = readState(id); });
    return o;
  }

  function writeState(id, dev) {
    var store = st(), hv = iri(SAREF + 'hasStateValue'), val = iri(SAREF + 'hasValue');
    if (!dev) return;
    if (dev.power != null) store.set(h(id + '_power'), hv, s(POWER_IRI[dev.power]));
    if (dev.kind === 'light' && dev.brightness != null) store.set(h(id + '_brightness_v'), val, lit(dev.brightness));
    if (dev.kind === 'fan') {
      if (dev.speed == null) store.removeMatches(h(id + '_speed'), hv, null);
      else store.set(h(id + '_speed'), hv, s(SPEED_IRI[dev.speed]));
    }
    if (dev.kind === 'ac') {
      if (dev.setpoint != null) store.set(h(id + '_setpoint_v'), val, lit(dev.setpoint));
      if (dev.mode != null) store.set(h(id + '_mode'), hv, s(MODE_IRI[dev.mode]));
    }
    if (dev.kind === 'tv') {
      if (dev.channel != null) store.set(h(id + '_channel_v'), val, lit(dev.channel));
      if (dev.volume != null) store.set(h(id + '_volume_v'), val, lit(dev.volume));
    }
  }

  // ------------------------------------------------------------ command effects
  var ALIAS = { 'Temp -': ['SetTemperature', -1], 'Temp +': ['SetTemperature', 1], TempDown: ['SetTemperature', -1],
    TempUp: ['SetTemperature', 1], 'Channel -': ['ChannelDown'], 'Channel +': ['ChannelUp'], 'Volume -': ['VolumeDown'],
    'Volume +': ['VolumeUp'], SetSpeed: ['SetFanSpeed'] };

  function normalize(dev, command, args) {
    args = args || {};
    if (command === 'Power' || command === 'TogglePower') {
      command = dev && dev.power === 'on' ? 'TurnOff' : 'TurnOn';
    } else if (ALIAS[command]) {
      var a = ALIAS[command];
      command = a[0];
      if (a.length > 1 && args.value == null && args.delta == null) args = { delta: a[1] };
    }
    return { command: command, args: args };
  }

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  function effect(dev, command, args) {
    var n = normalize(dev, command, args), a = n.args, c = devCfg(), o = JSON.parse(JSON.stringify(dev));
    switch (n.command) {
      case 'TurnOn': o.power = 'on'; break;
      case 'TurnOff': o.power = dev.kind === 'tv' ? 'standby' : 'off'; break;
      case 'SetBrightness': o.power = 'on'; o.brightness = Number(a.value); break;
      case 'SetFanSpeed': o.power = 'on'; o.speed = String(a.value).toLowerCase(); break;
      case 'SetTemperature':
        var t = a.value != null ? Number(a.value) : dev.setpoint + Number(a.delta || 0) * (c.ac.step || 1);
        o.setpoint = clamp(t, c.ac.min, c.ac.max); break;
      case 'SetMode': o.mode = String(a.value).toLowerCase(); break;
      case 'ChannelUp': case 'ChannelDown':
        if (dev.power !== 'on') break;
        var ch = dev.channel + (n.command === 'ChannelUp' ? 1 : -1);
        o.channel = ch > c.tv.chMax ? c.tv.chMin : ch < c.tv.chMin ? c.tv.chMax : ch; break;
      case 'VolumeUp': case 'VolumeDown':
        if (dev.power !== 'on') break;
        o.volume = clamp(dev.volume + (n.command === 'VolumeUp' ? 1 : -1) * (c.tv.volumeStep || 5), c.tv.volMin, c.tv.volMax); break;
      default: throw new Error('SA.kg.mirror.effect: unknown command ' + n.command);
    }
    return o;
  }

  // ------------------------------------------------------------ runtime records
  function nowIso() {
    if (SA.clock && SA.clock.iso) return SA.clock.iso();
    fallbackTick += 1;
    return '2026-03-01T21:' + ('0' + Math.floor(fallbackTick / 60) % 60).slice(-2) + ':' + ('0' + fallbackTick % 60).slice(-2);
  }
  function add(sj, p, o) { st().add(sj, p, o); }

  function recordConfirmed(entityId, command, room) {
    seq.exec += 1;
    var e = h('Exec_' + seq.exec);
    add(e, iri(RDF_TYPE), s('ActionExecution'));
    add(e, s('resolvedEntity'), h(entityId));
    add(e, s('command'), s(command));
    if (room) add(e, s('inRoom'), h(room));
    add(e, s('outcome'), s('Confirmed'));
    add(e, iri(SAREF + 'hasTimestamp'), dt(nowIso()));
    return local(e);
  }

  function recordErrp(r, about) {
    if (!r) return null;
    seq.errp += 1;
    var e = h('ErrP_' + seq.errp), feedback = (r.decision === 'rollback' || r.decision === 'flag') && r.lambda > 1;
    add(e, iri(RDF_TYPE), s('ErrPObservation'));
    if (feedback) add(e, iri(RDF_TYPE), s('ErrPFeedback'));
    add(e, iri(SOSA + 'madeBySensor'), h('ErrPDetector'));
    add(e, iri(SOSA + 'resultTime'), dt(nowIso()));
    if (r.q != null) add(e, s('posterior'), lit(Number(r.q)));
    if (r.lambda != null && isFinite(r.lambda)) add(e, s('likelihoodRatio'), lit(Number(r.lambda)));
    if (r.pi != null) add(e, s('prior'), lit(Number(r.pi)));
    add(e, s('interactionsSince'), lit(0));
    if (r.decision) add(e, s('decision'), T().literal(String(r.decision)));
    if (about) {
      if (about.entity) add(e, s('aboutEntity'), h(about.entity));
      if (about.command) add(e, s('command'), s(about.command));
      if (about.room) add(e, s('inRoom'), h(about.room));
    }
    return local(e);
  }

  function recordRoom(room, conf) {
    seq.room += 1;
    var o = h('Obs_room_' + seq.room);
    add(o, iri(RDF_TYPE), s('RoomObservation'));
    add(o, iri(SOSA + 'madeBySensor'), h('RoomSelector'));
    add(o, iri(SOSA + 'hasFeatureOfInterest'), h('Patient'));
    add(o, iri(SOSA + 'observedProperty'), s('Occupancy'));
    add(o, iri(SOSA + 'hasResult'), h(room));
    add(o, s('confidence'), lit(conf != null ? conf : ((SA.config && SA.config.kg && SA.config.kg.roomConfidence) || 0.95)));
    add(o, s('sequence'), lit(seq.room));
    add(o, iri(SOSA + 'resultTime'), dt(nowIso()));
    return local(o);
  }

  // ------------------------------------------------------------ wiring
  function clear() { episodes = {}; seq = { exec: 0, errp: 0, room: 0 }; fallbackTick = 0; }

  function init() {
    if (!SA.bus || offs.length) return;
    var on = function (evt, fn) { offs.push(SA.bus.on(evt, fn)); };
    on('device:stateChanged', function (p) { if (p && p.deviceId) writeState(p.deviceId, p.after); });
    on('kg:resolved', function (r) {
      if (r && r.episodeId) episodes[r.episodeId] = { kind: r.kind, entity: r.actedOn && r.actedOn.id, command: r.command, room: r.activeRoom };
    });
    on('action:confirmed', function (p) {
      var e = p && episodes[p.episodeId];
      if (e && e.kind === 'device') recordConfirmed(e.entity, e.command, e.room);
    });
    on('errp:observed', function (r) {
      var e = r && episodes[r.episodeId];
      recordErrp(r, e && e.kind === 'device' ? e : null);
    });
    on('context:roomChanged', function (p) { if (p && p.room) recordRoom(p.room); });
    on('demo:reset', clear);
  }

  SA.kg.mirror = { init: init, readState: readState, deviceStates: deviceStates, deviceIds: deviceIds, writeState: writeState,
    normalize: normalize, effect: effect, recordConfirmed: recordConfirmed, recordErrp: recordErrp, recordRoom: recordRoom,
    clear: clear, localName: local };
})(typeof window !== 'undefined' ? window : globalThis);
