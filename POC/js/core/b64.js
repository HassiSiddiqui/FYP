/*
 * SA.core.b64 (CORE) — docs/architecture.md §2.1 / §7.1.
 *   decodeBytes(str) -> Uint8Array
 *   decodeF32(str)   -> Float64Array (little-endian float32 upcast)
 *   encodeF32(arr)   -> base64 of little-endian float32 (tests)
 * Pure JS (no atob dependency) so it behaves identically in Node and browser.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.core = SA.core || {};
  var b64 = SA.core.b64 = SA.core.b64 || {};

  var ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var LUT = null;
  function lut() {
    if (LUT) return LUT;
    LUT = new Int16Array(256);
    for (var i = 0; i < 256; i++) LUT[i] = -1;
    for (var j = 0; j < 64; j++) LUT[ALPHA.charCodeAt(j)] = j;
    LUT['-'.charCodeAt(0)] = 62; LUT['_'.charCodeAt(0)] = 63; // url-safe tolerance
    return LUT;
  }

  b64.decodeBytes = function (str) {
    var L = lut();
    str = String(str || '');
    var clean = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 256 && L[c] >= 0) clean.push(L[c]);
      else if (str[i] === '=') break;
      // whitespace and other chars ignored
    }
    var n = clean.length;
    if (n % 4 === 1) throw new Error('b64: invalid length');
    var outLen = Math.floor(n * 3 / 4);
    var out = new Uint8Array(outLen);
    var o = 0;
    for (var k = 0; k < n; k += 4) {
      var a = clean[k], b = clean[k + 1], cc = k + 2 < n ? clean[k + 2] : 0, d = k + 3 < n ? clean[k + 3] : 0;
      var v = (a << 18) | (b << 12) | (cc << 6) | d;
      if (o < outLen) out[o++] = (v >> 16) & 255;
      if (o < outLen) out[o++] = (v >> 8) & 255;
      if (o < outLen) out[o++] = v & 255;
    }
    return out;
  };

  b64.decodeF32 = function (str) {
    var bytes = b64.decodeBytes(str);
    if (bytes.length % 4 !== 0) throw new Error('b64.decodeF32: byte length ' + bytes.length + ' not a multiple of 4');
    var n = bytes.length / 4;
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var out = new Float64Array(n);
    for (var i = 0; i < n; i++) out[i] = dv.getFloat32(i * 4, true);
    return out;
  };

  b64.encodeBytes = function (bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 3) {
      var a = bytes[i], b = i + 1 < bytes.length ? bytes[i + 1] : 0, c = i + 2 < bytes.length ? bytes[i + 2] : 0;
      var v = (a << 16) | (b << 8) | c;
      s += ALPHA[(v >> 18) & 63] + ALPHA[(v >> 12) & 63] +
        (i + 1 < bytes.length ? ALPHA[(v >> 6) & 63] : '=') +
        (i + 2 < bytes.length ? ALPHA[v & 63] : '=');
    }
    return s;
  };

  b64.encodeF32 = function (arr) {
    var buf = new ArrayBuffer(arr.length * 4);
    var dv = new DataView(buf);
    for (var i = 0; i < arr.length; i++) dv.setFloat32(i * 4, arr[i], true);
    return b64.encodeBytes(new Uint8Array(buf));
  };
})(typeof window !== 'undefined' ? window : globalThis);
