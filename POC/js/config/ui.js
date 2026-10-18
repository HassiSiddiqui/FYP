/* SilentAssist — UI configuration (owner: UI). README strings are verbatim bytes (docs/architecture.md §5.2). */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.config = SA.config || {};

  SA.config.ui = {
    wrap: true, decisionDwellMs: 800, kgPrefocus: false, thermalAdvisory: { enabled: false },
    strings: {   // README bytes, verbatim
      pillEeg: 'EEG: Simulation Mode', pillEnv: 'Environment: Smart-Home Simulator',
      dashboardSwitch: 'Caregiver Dashboard',
      btnNext: 'Right Hand ► Next', btnPrev: 'Left Hand ◄ Previous', btnSelect: 'Both Feet ✓ Select', btnBack: 'Tongue ✕ Back',  // rendered with .sa-bracketed
      btnNoErrp: 'No ErrP', btnSimErrp: 'Simulate ErrP', btnRetry: 'Retry', btnHome: 'Return to Home', btnApprove: 'Approve', btnReject: 'Reject',
      s1Title: 'Mode Selection', s1Visual: 'Visual Navigation', s1Audio: 'Audio-Assisted Navigation',
      s2Title: 'Assistive Home Hub', hubLights: 'Lights', hubFans: 'Fans', hubAc: 'Air Conditioner', hubTv: 'TV & Media', hubPresets: 'Presets',
      presetsSub: '4 Multi-Device Semantic Routines',
      s3Title: 'Lights Fixtures', s4Title: 'Action Selection & Context Reasoning Panel',
      actTurnOn: 'Turn On', actTurnOff: 'Turn Off', actBrightness: 'Adjust Brightness', actBack: 'Back',
      observing: '“Observing post-action EEG...”',
      noErrp: 'No Error Detected • Action Confirmed',
      errpPrefix: 'Possible Error Detected • ErrP Deflection at FCz (', rolledBack: 'Action Rolled Back',
      s6Title: 'Semantic Presets', presets: ['Night Mode', 'All Lights Off', 'Cooling Mode', 'Watch TV'],
      panel: { intent: 'Decoded Intent', space: 'Spatial Context', entity: 'Resolved Entity', sparql: 'SPARQL Match',
               telemetry: 'Confidence Telemetry', neural: 'Neural MI', semantic: 'Semantic Context', risk: 'Risk Tier', decision: 'Policy Decision' },
      harnessLabel: 'Operator Harness — not patient-facing',
      caregiverBanner: 'Caregiver view — simulated, no authentication',
      // PROMPT-level / ADR 0005 additions (not README labels)
      s1VisualSub: 'Large accessible cards, high-contrast active focus outlines, zero ocular strain.',
      s1AudioSub: 'Spoken auditory announcements (Web Speech API) for focused devices and action verifications.',
      s5Title: 'Action Result', fanTitle: 'Fans', acTitle: 'Air Conditioner', tvTitle: 'TV & Media', brightnessTitle: 'Adjust Brightness',
      btnContinue: 'Continue', firstScreen: 'This is the first screen', observingWait: 'Observing — please wait',
      decoding: 'Decoding…', notSure: 'Not sure, please try again',
      waitingCaregiver: 'Waiting for caregiver approval', withdrawHint: 'Tongue ✕ Back to withdraw',
      confirmHint: 'Both Feet ✓ Confirm · Tongue ✕ Cancel', tvStandbyHint: '(TV in standby)', tvOnFirst: 'Turn the TV on first',
      altPrefix: 'Suggested alternative: ', captionLabel: 'Caption:',
      btnMore: 'More controls ▾', btnLess: 'Fewer controls ▴', btnDecode: 'Decode trial ► inject token', btnReset: 'Reset Demo',
      dataLine: 'Data: BCI Competition IV-2a (BNCI 001-2014) / BNCI 013-2015 — attribution; licence pending supervisor confirmation',
      scriptedStrip: 'Scripted token (not decoded)',
      neuralCaption: 'applies to scripted tokens',
      voiceTextOnly: 'Voice: text only (no offline voice)'
    }
  };

  SA.config.voice = { allowOnline: false, maxChars: 160, rate: 0.95, pitch: 1.0, lang: 'en-US', repickMs: [250, 1000, 3000] };
})(typeof window !== 'undefined' ? window : globalThis);
