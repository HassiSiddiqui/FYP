/* SA.safety.rollback — saga executor with compensating actions (docs/architecture.md §2.5; ADR 0003 D18).
 * plan(action, devices)          -> steps [{deviceId, before, after}] (full device objects, no-op steps omitted)
 * execute(episodeId, steps, actor) -> sagaId   (atomic: a failing step compensates the applied ones and rethrows)
 * compensate(episodeId, sagaId)  -> steps      (reverse order; restores `before` only where device still == `after`;
 *                                               atomic across the preset; never re-enters a thermal hazard)
 * Sole writer of store.devices (owner tag 'rollback'). Appends EXECUTE / ROLLBACK to the audit chain itself,
 * so every saga is audited exactly once whoever calls it.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.safety = SA.safety || {};

  var OWNER = 'rollback';
  var sagas = {};
  var sagaCounter = 0;
  var inited = false;

  // Preset steps (ADR 0003 "Presets" table). Each step = {deviceId, set:{...}} merged onto the current device.
  var PRESETS = {
    NightMode:    [{ deviceId: 'BedroomCeilingLight', set: { power: 'off' } },
                   { deviceId: 'LivingRoomLight', set: { power: 'off' } },
                   { deviceId: 'SmartTV', set: { power: 'standby' } },
                   { deviceId: 'AirConditioner', set: { setpoint: 25 } }],
    AllLightsOff: [{ deviceId: 'BedroomCeilingLight', set: { power: 'off' } },
                   { deviceId: 'BedsideLamp', set: { power: 'off' } },
                   { deviceId: 'LivingRoomLight', set: { power: 'off' } }],
    CoolingMode:  [{ deviceId: 'AirConditioner', set: { power: 'on', mode: 'cool', setpoint: 22 } },
                   { deviceId: 'CeilingFan', set: { power: 'on', speed: 'medium' } }],
    WatchTV:      [{ deviceId: 'SmartTV', set: { power: 'on' } },
                   { deviceId: 'BedroomCeilingLight', set: { power: 'off' } },
                   { deviceId: 'BedsideLamp', set: { power: 'on', brightness: 25 } }]
  };

  function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
  function eq(a, b) {
    if (SA.util && SA.util.deepEqual) return SA.util.deepEqual(a, b);
    return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
  }
  function sortKeys(o) {
    if (o === null || typeof o !== 'object') return o;
    if (Array.isArray(o)) return o.map(sortKeys);
    var r = {}; Object.keys(o).sort().forEach(function (k) { r[k] = sortKeys(o[k]); }); return r;
  }
  function devCfg() { return (SA.config && SA.config.devices) || {}; }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function argVal(args) { return args ? (args.value !== undefined ? args.value : (args.level !== undefined ? args.level : args.speed)) : undefined; }
  function lc(s) { return String(s || '').replace(/[\s_-]/g, '').toLowerCase(); }

  /* Apply one device command to a device object; returns the new object (may equal input = no-op). */
  function applyCommand(dev, command, args) {
    var d = clone(dev), c = lc(command), v = argVal(args), cfg = devCfg();
    var ac = cfg.ac || { min: 16, max: 32, step: 1 }, tv = cfg.tv || { chMin: 1, chMax: 99, volMin: 0, volMax: 100, volumeStep: 5 };
    var onWord = d.kind === 'tv' ? 'on' : 'on', offWord = d.kind === 'tv' ? 'standby' : 'off';
    if (c === 'turnon' || c === 'poweron') { d.power = onWord; return d; }
    if (c === 'turnoff' || c === 'poweroff' || c === 'standby') { d.power = offWord; return d; }
    if (c === 'togglepower' || c === 'power' || c === 'toggle') { d.power = d.power === onWord ? offWord : onWord; return d; }
    if (d.kind === 'light') {
      if (c === 'setbrightness' || c === 'adjustbrightness' || c === 'brightness') { d.power = 'on'; d.brightness = Number(v); }
      return d;
    }
    if (d.kind === 'fan') {
      if (c === 'setspeed' || c === 'setfanspeed' || c === 'speed' || c === 'fanspeed') {
        if (v === 'off' || v === null) d.power = 'off'; else { d.power = 'on'; d.speed = String(v).toLowerCase(); }
      } else if (c === 'fanoff') d.power = 'off';
      else if (c === 'fanlow' || c === 'fanmedium' || c === 'fanhigh') { d.power = 'on'; d.speed = c.slice(3); }
      return d;
    }
    if (d.kind === 'ac') {
      if (c === 'settemperature' || c === 'setsetpoint' || c === 'temperature') {
        if (args && args.delta !== undefined && v === undefined) v = d.setpoint + Number(args.delta);
        d.setpoint = clamp(Number(v), ac.min, ac.max);
      } else if (c === 'tempup' || c === 'temperatureup' || c === 'increasetemperature' || c === 'tempplus') d.setpoint = clamp(d.setpoint + (ac.step || 1), ac.min, ac.max);
      else if (c === 'tempdown' || c === 'temperaturedown' || c === 'decreasetemperature' || c === 'tempminus') d.setpoint = clamp(d.setpoint - (ac.step || 1), ac.min, ac.max);
      else if (c === 'setmode' || c === 'mode') d.mode = String(v).toLowerCase();
      return d;
    }
    if (d.kind === 'tv') {
      var on = d.power === 'on', step = tv.volumeStep || 5, span = tv.chMax - tv.chMin + 1;
      if (!on && /channel|volume/.test(c)) return d;  // no-op in Standby (ADR 0003 D8)
      if (c === 'channelup' || c === 'channelplus') d.channel = ((d.channel - tv.chMin + 1) % span) + tv.chMin;
      else if (c === 'channeldown' || c === 'channelminus') d.channel = ((d.channel - tv.chMin - 1 + span) % span) + tv.chMin;
      else if (c === 'setchannel') d.channel = clamp(Number(v), tv.chMin, tv.chMax);
      else if (c === 'volumeup' || c === 'volumeplus') d.volume = clamp(d.volume + step, tv.volMin, tv.volMax);
      else if (c === 'volumedown' || c === 'volumeminus') d.volume = clamp(d.volume - step, tv.volMin, tv.volMax);
      else if (c === 'setvolume') d.volume = clamp(Number(v), tv.volMin, tv.volMax);
      return d;
    }
    return d;
  }

  function presetSteps(id, args) {
    if (args && Array.isArray(args.steps)) return args.steps;
    return PRESETS[id] || PRESETS[String(id).replace(/[\s:]/g, '')] || null;
  }

  function plan(action, devices) {
    if (!action) return [];
    devices = devices || (SA.store ? SA.store.get('devices') : {});
    var work = clone(devices), steps = [], order = [];
    function push(id, after) {
      if (!work[id]) throw new Error('rollback.plan: unknown device ' + id);
      if (eq(work[id], after)) return;
      if (order.indexOf(id) < 0) order.push(id);
      work[id] = after;
    }
    if (action.kind === 'preset') {
      var ps = presetSteps(action.id, action.args);
      if (!ps) throw new Error('rollback.plan: unknown preset ' + action.id);
      ps.forEach(function (s) {
        var d = clone(work[s.deviceId]);
        if (!d) throw new Error('rollback.plan: unknown device ' + s.deviceId);
        if (s.set) Object.keys(s.set).forEach(function (k) { d[k] = s.set[k]; });
        else if (s.command) d = applyCommand(d, s.command, s.args);
        push(s.deviceId, d);
      });
    } else {
      push(action.id, applyCommand(work[action.id], action.command, action.args));
    }
    order.forEach(function (id) {
      if (!eq(devices[id], work[id])) steps.push({ deviceId: id, before: clone(devices[id]), after: clone(work[id]) });
    });
    return steps;
  }

  function writeDevice(id, value) { SA.store.set('devices.' + id, clone(value), OWNER); }
  function readDevice(id) { return SA.store.get('devices.' + id); }
  function emit(evt, p) { if (SA.bus && SA.bus.emit) SA.bus.emit(evt, p); }
  function audit(type, data, actor) {
    if (SA.safety.audit && SA.safety.audit.append) SA.safety.audit.append(type, data, actor || 'system');
  }
  function hazardous(dev) {
    var t = (SA.config && SA.config.policy && SA.config.policy.thermal) || { min: 18, max: 30 };
    return dev && dev.kind === 'ac' && (dev.setpoint < t.min || dev.setpoint > t.max);
  }

  function execute(episodeId, steps, actor) {
    var sagaId = 'saga-' + (++sagaCounter);
    var applied = [];
    try {
      steps.forEach(function (s) {
        var cur = readDevice(s.deviceId);
        if (!eq(cur, s.before)) throw new Error('rollback.execute: ' + s.deviceId + ' changed since plan');
        writeDevice(s.deviceId, s.after);
        applied.push(s);
      });
    } catch (err) {
      // atomic: undo whatever was applied, in reverse, then rethrow
      for (var i = applied.length - 1; i >= 0; i--) writeDevice(applied[i].deviceId, applied[i].before);
      audit('EPISODE_ABORTED', { episodeId: episodeId, sagaId: sagaId, reason: String(err && err.message), undone: applied.length }, 'system');
      throw err;
    }
    sagas[sagaId] = { sagaId: sagaId, episodeId: episodeId, steps: clone(steps), state: 'executed', actor: actor };
    steps.forEach(function (s) {
      emit('device:stateChanged', { deviceId: s.deviceId, before: clone(s.before), after: clone(s.after), cause: 'execute' });
    });
    audit('EXECUTE', { episodeId: episodeId, sagaId: sagaId, steps: steps }, actor || 'system');
    emit('action:executed', { episodeId: episodeId, sagaId: sagaId, steps: clone(steps), actor: actor });
    return sagaId;
  }

  function compensate(episodeId, sagaId, opts) {
    var saga = sagas[sagaId];
    if (!saga) throw new Error('rollback.compensate: unknown saga ' + sagaId);
    if (saga.state !== 'executed') return [];
    var todo = [], skipped = [];
    for (var i = saga.steps.length - 1; i >= 0; i--) {
      var s = saga.steps[i], cur = readDevice(s.deviceId);
      if (!eq(cur, s.after)) { skipped.push({ deviceId: s.deviceId, reason: 'changed-since-execute' }); continue; }
      if (hazardous(s.before)) { skipped.push({ deviceId: s.deviceId, reason: 'compensation-enters-hazard' }); continue; }
      todo.push({ deviceId: s.deviceId, before: clone(s.after), after: clone(s.before) });
    }
    var done = [];
    try {
      todo.forEach(function (c) { writeDevice(c.deviceId, c.after); done.push(c); });
    } catch (err) {
      for (var j = done.length - 1; j >= 0; j--) writeDevice(done[j].deviceId, done[j].before);
      throw err;
    }
    saga.state = 'compensated';
    todo.forEach(function (c) {
      emit('device:stateChanged', { deviceId: c.deviceId, before: clone(c.before), after: clone(c.after), cause: 'compensate' });
    });
    audit('ROLLBACK', { episodeId: episodeId, sagaId: sagaId, steps: todo, skipped: skipped,
      reason: (opts && opts.reason) || 'errp' }, (opts && opts.actor) || 'system');
    emit('action:rolledBack', { episodeId: episodeId, sagaId: sagaId, steps: clone(todo), skipped: skipped, alternative: null });
    return todo;
  }

  function saga(id) { return clone(sagas[id]); }

  function init() {
    if (inited) return;
    inited = true;
    if (SA.bus && SA.bus.on) SA.bus.on('demo:reset', function () { sagas = {}; sagaCounter = 0; });
  }

  SA.safety.rollback = { init: init, plan: plan, execute: execute, compensate: compensate, saga: saga,
    applyCommand: applyCommand, PRESETS: PRESETS };
})(typeof window !== 'undefined' ? window : globalThis);
