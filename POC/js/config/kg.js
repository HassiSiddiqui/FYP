/* SA.config.kg — KG resolver tunables (ADR 0003 D6, D11; architecture §5.3). Owner: KG builder. */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.config = SA.config || {};
  SA.config.kg = {
    weights: { type: .35, space: .30, state: .20, recency: .15 },
    recencyWindow: 10,
    recencyEmpty: 'uniform',
    roomConfidence: .95,
    rooms: { MasterBedroom: 'Master Bedroom', LivingRoom: 'Living Room' }
  };
})(typeof window !== 'undefined' ? window : globalThis);
