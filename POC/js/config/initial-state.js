/*
 * SA.config.initialState / SA.config.input / SA.config.devices (CORE).
 * docs/architecture.md §4 and §5.1 — values are README state; do not edit
 * without a contract change.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.config = SA.config || {};

  SA.config.initialState = {
    ui: {
      screen: 'S1', focus: { S1: 0 }, focusMemory: {},
      subState: 'list',
      dashboardOpen: false, navMode: null,
      lockout: false, alert: null, caption: '', repromptCount: 0
    },
    prefs: {
      voice: false, decodeAnimation: true, errpAutoConfirm: false, reducedMotion: false
    },
    decoder: {
      mode: 'scripted',
      sliders: { neural: 0.92, semantic: 0.89, semanticOverride: false },
      cursor: { left: 0, right: 0, feet: 0, tongue: 0 }, pin: null,
      errpCursor: { error: 0, correct: 0 }, errpPin: null,
      last: null, catalog: [], dataStatus: { weights: 'missing', replay: 'missing', errp: 'missing' }
    },
    context: { activeRoom: 'MasterBedroom', user: 'Patient', clock: '2026-03-01T21:00:00' },
    devices: {
      BedroomCeilingLight: { kind: 'light', label: 'Bedroom Ceiling Light', room: 'MasterBedroom', order: 1, power: 'off', brightness: 100 },
      BedsideLamp:         { kind: 'light', label: 'Bedside Lamp',          room: 'MasterBedroom', order: 2, power: 'off', brightness: 100 },
      LivingRoomLight:     { kind: 'light', label: 'Living Room Light',     room: 'LivingRoom',    order: 3, power: 'on',  brightness: 100 },
      CeilingFan:     { kind: 'fan', label: 'Ceiling Fan',     room: 'MasterBedroom', power: 'off', speed: null },
      AirConditioner: { kind: 'ac',  label: 'Air Conditioner', room: 'MasterBedroom', power: 'on', setpoint: 24, mode: 'cool' },
      SmartTV:        { kind: 'tv',  label: 'Smart TV',        room: 'MasterBedroom', power: 'standby', channel: 1, volume: 20 }
    },
    episode: { id: null, phase: 'idle' },
    approvals: [
      { id: 'ap-seed-1', seeded: true, episodeId: null, status: 'pending',
        action: { kind: 'device', id: 'AirConditioner', command: 'SetTemperature', args: { value: 16 } },
        intentLabel: 'Set Temperature 16°C', n: 0.92, s: 0.95,
        reason: 'Setpoint 16°C is below the 18°C minimum', label: 'Example request (seeded by Reset Demo)' }
    ],
    errp: { memory: [] },
    telemetry: { n: null, s: null, c: null, tier: null, lastDecision: null, lastQ: null, lastErrpDecision: null }
  };

  SA.config.input = { minInterTokenMs: 250 };

  SA.config.devices = {
    brightnessLevels: [25, 50, 75, 100],
    fanSpeeds: ['low', 'medium', 'high'],
    ac: { min: 16, max: 32, step: 1, modes: ['cool', 'fan', 'dry'] },
    tv: { chMin: 1, chMax: 99, volMin: 0, volMax: 100, volumeStep: 5 }
  };
})(typeof window !== 'undefined' ? window : globalThis);
