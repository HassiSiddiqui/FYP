/*
 * SA.store — the home model (CORE), docs/architecture.md §2.1 / §4.
 *   get(path) (deep clone), set(path, value, by), patch(path, obj, by),
 *   snapshot(), reset(), owners(slice).
 * Each top-level slice has exactly one writer; 'core' may write anything
 * (reset only). Every write emits store:changed {path, by}.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  var store = SA.store = SA.store || {};

  var OWNERS = {
    ui: ['ui'],
    prefs: ['harness', 'ui'],
    decoder: ['decoder', 'episode'],
    context: ['harness'],
    devices: ['rollback'],
    episode: ['episode'],
    approvals: ['approvals'],
    errp: ['errp-memory'],
    telemetry: ['episode']
  };

  var state = {};

  function clone(v) { return SA.util.deepClone(v); }

  function split(path) {
    if (path === undefined || path === null || path === '') return [];
    return String(path).split('.');
  }

  function under(path, prefix) {
    return path === prefix || path.indexOf(prefix + '.') === 0;
  }

  // Restricted secondary writers (contract §2.1).
  function allowedRestricted(by, slice, path, partialKeys) {
    if (slice === 'prefs' && by === 'ui') {
      if (under(path, 'prefs.voice')) return true;
      if (path === 'prefs' && partialKeys && partialKeys.length === 1 && partialKeys[0] === 'voice') return true;
      return false;
    }
    if (slice === 'decoder' && by === 'episode') {
      if (under(path, 'decoder.errpCursor') || under(path, 'decoder.errpPin')) return true;
      if (path === 'decoder' && partialKeys && partialKeys.every(function (k) { return k === 'errpCursor' || k === 'errpPin'; })) return true;
      return false;
    }
    return true;
  }

  function checkOwner(path, by, partialKeys) {
    var parts = split(path);
    if (!parts.length) throw new Error('store: empty path');
    var slice = parts[0];
    if (by === 'core') return slice;
    var owners = OWNERS[slice];
    if (!owners) throw new Error('store: unknown slice ' + slice);
    if (owners.indexOf(by) < 0 || !allowedRestricted(by, slice, path, partialKeys)) {
      throw new Error('store: ' + by + ' may not write ' + slice);
    }
    return slice;
  }

  function getRef(parts) {
    var cur = state;
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || typeof cur !== 'object') return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function changed(path, by) {
    if (SA.bus && SA.bus.emit) SA.bus.emit('store:changed', { path: path, by: by });
  }

  store.get = function (path) {
    var v = getRef(split(path));
    return (v !== null && typeof v === 'object') ? clone(v) : v;
  };

  store.set = function (path, value, by) {
    checkOwner(path, by);
    var parts = split(path);
    var cur = state;
    for (var i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] === null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = clone(value);
    changed(path, by);
  };

  store.patch = function (path, partial, by) {
    if (partial === null || typeof partial !== 'object' || Array.isArray(partial)) {
      throw new Error('store.patch: partial must be a plain object');
    }
    checkOwner(path, by, Object.keys(partial));
    var parts = split(path);
    var cur = state;
    for (var i = 0; i < parts.length; i++) {
      if (cur[parts[i]] === null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    for (var k in partial) if (Object.prototype.hasOwnProperty.call(partial, k)) cur[k] = clone(partial[k]);
    changed(path, by);
  };

  store.snapshot = function () { return clone(state); };

  store.reset = function () {
    var keepRM = state.prefs ? !!state.prefs.reducedMotion : null;
    var init = (SA.config && SA.config.initialState) || {};
    state = clone(init);
    if (keepRM !== null && state.prefs) state.prefs.reducedMotion = keepRM;
    changed('', 'core');
  };

  store.owners = function (slice) { return (OWNERS[slice] || []).slice(); };
})(typeof window !== 'undefined' ? window : globalThis);
