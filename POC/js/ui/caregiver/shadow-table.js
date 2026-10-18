/* SA.ui.caregiver.shadowTable — live appliance shadow table (ADR 0005 D28 row 2):
 * device, room, state, last change, actor. Reads store.devices; last-change/actor come from
 * device:stateChanged and action:executed payloads. No DOM access at load time. */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.ui = SA.ui || {};
  SA.ui.caregiver = SA.ui.caregiver || {};

  var last = {};         // deviceId -> {ts, actor, cause}
  var flash = {};        // deviceId -> true until next render
  var inited = false;

  function cap(s) { s = String(s == null ? '' : s); return s.charAt(0).toUpperCase() + s.slice(1); }

  /** Human state string for one device object (pure). */
  function stateText(d) {
    if (!d) return '—';
    switch (d.kind) {
      case 'light':
        return d.power === 'on' ? 'ON • ' + d.brightness + '%' : 'OFF';
      case 'fan':
        return d.power === 'on' ? 'ON • ' + cap(d.speed || 'on') : 'OFF';
      case 'ac':
        return (d.power === 'on' ? 'ON' : 'OFF') + ' • ' + d.setpoint + '°C • ' + cap(d.mode) + ' Mode';
      case 'tv':
        return d.power === 'on' ? 'ON • Ch ' + d.channel + ' • Vol ' + d.volume : 'Standby';
      default:
        return d.power ? String(d.power).toUpperCase() : '—';
    }
  }

  function roomName(id) {
    var rooms = (SA.config && SA.config.kg && SA.config.kg.rooms) || { MasterBedroom: 'Master Bedroom', LivingRoom: 'Living Room' };
    return rooms[id] || id || '—';
  }

  function nowIso() {
    try { return SA.clock.iso(); } catch (e) { return new Date().toISOString().slice(0, 19); }
  }

  /** Rows model (pure given devices + change map). */
  function rows(devices, changes) {
    devices = devices || {};
    changes = changes || {};
    return Object.keys(devices).map(function (id) {
      var d = devices[id], c = changes[id];
      return { id: id, device: d.label || id, room: roomName(d.room), state: stateText(d),
        on: d.power === 'on', lastChange: c ? c.ts.slice(11, 19) : '—', actor: c ? c.actor : 'initial state' };
    });
  }

  function render(host, state) {
    if (!host) return;
    var devices = (state && state.devices) || {};
    var rs = rows(devices, last);
    var wrap = host.querySelector('.cv-shadow-body');
    if (!wrap) {
      host.textContent = '';
      var h = document.createElement('h2');
      h.className = 'cv-h';
      h.textContent = 'Appliance Shadow Table';
      host.appendChild(h);
      var sub = document.createElement('p');
      sub.className = 'cv-sub';
      sub.textContent = 'Live-synchronized with the simulated home';
      host.appendChild(sub);
      wrap = document.createElement('div');
      wrap.className = 'cv-shadow-body cv-table-wrap';
      host.appendChild(wrap);
    }
    var t = document.createElement('table');
    t.className = 'cv-table';
    var thead = t.createTHead().insertRow();
    ['Device', 'Room', 'State', 'Last change', 'Actor'].forEach(function (x) {
      var th = document.createElement('th'); th.scope = 'col'; th.textContent = x; thead.appendChild(th);
    });
    var tb = t.createTBody();
    rs.forEach(function (r) {
      var tr = tb.insertRow();
      tr.setAttribute('data-device-id', r.id);
      if (flash[r.id]) tr.className = 'is-changed';
      [r.device, r.room, r.state, r.lastChange, r.actor].forEach(function (v, i) {
        var td = tr.insertCell();
        td.textContent = v;
        if (i === 2) td.className = 'cv-state' + (r.on ? ' is-on' : '');
      });
    });
    wrap.textContent = '';
    wrap.appendChild(t);
    flash = {};
  }

  function init() {
    if (inited) return;
    inited = true;
    var pendingActor = null;
    SA.bus.on('action:executed', function (p) {
      if (!p || !p.steps) return;
      p.steps.forEach(function (s) { if (last[s.deviceId]) last[s.deviceId].actor = p.actor || last[s.deviceId].actor; });
      pendingActor = null;
    });
    SA.bus.on('device:stateChanged', function (p) {
      if (!p || !p.deviceId) return;
      var actor = p.cause === 'compensate' ? 'system (ErrP rollback)' : (p.actor || pendingActor || 'patient');
      last[p.deviceId] = { ts: nowIso(), actor: actor, cause: p.cause };
      flash[p.deviceId] = true;
    });
    SA.bus.on('demo:reset', function () { last = {}; flash = {}; });
  }

  SA.ui.caregiver.shadowTable = { init: init, render: render, rows: rows, stateText: stateText,
    changes: function () { return JSON.parse(JSON.stringify(last)); } };
})(typeof window !== 'undefined' ? window : globalThis);
