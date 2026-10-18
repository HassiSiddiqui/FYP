/* SilentAssist — live-region writer (ADR 0005 D20). Owner: UI.
 * render(el, {text}) — repeated identical text: clear, then set in the next animation frame so AT re-announces. */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.ui = SA.ui || {};
  SA.ui.components = SA.ui.components || {};

  function nextFrame(fn) {
    var w = (typeof window !== 'undefined') ? window : null;
    if (w && typeof w.requestAnimationFrame === 'function') w.requestAnimationFrame(fn);
    else fn();
  }

  function render(el, model) {
    if (!el) return;
    var text = (model && model.text) || '';
    var seq = (el.__saSeq = (el.__saSeq || 0) + 1);
    el.__saText = text;   // intended text; textContent may be blank for one frame (re-announce trick, RT1-02)
    if (text && el.textContent === text) {
      el.textContent = '';
      nextFrame(function () { if (el.__saSeq === seq) el.textContent = text; });
    } else {
      el.textContent = text;
    }
    el.classList.toggle('is-empty', !text);
  }

  SA.ui.components.caption = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
