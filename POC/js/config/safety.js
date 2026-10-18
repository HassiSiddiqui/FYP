/* SA.config.safety — SAFETY builder (docs/architecture.md §5.5). */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.config = SA.config || {};
  SA.config.safety = {
    approvalTimeoutMs: 300000,
    hashAlgo: 'SHA-256',
    fallbackAlgo: 'FNV-1a',
    maxRollbacksPerEpisode: 1
  };
})(typeof window !== 'undefined' ? window : globalThis);
