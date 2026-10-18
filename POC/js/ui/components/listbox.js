/* SilentAssist — generic listbox renderer (ADR 0005 D1–D3, D36). Owner: UI.
 * render(el, {screenId, ariaLabel, columns, items:[{id,title,subtitle,badge,bracketed,disabled}], focus}) */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  SA.ui = SA.ui || {};
  SA.ui.components = SA.ui.components || {};

  function domId(screenId, itemId) { return 'opt-' + String(screenId).replace(/\//g, '-') + '-' + String(itemId).replace(/[^A-Za-z0-9_-]/g, '-'); }

  function sig(model) {
    return model.screenId + '|' + model.items.map(function (it) {
      return [it.id, it.title, it.subtitle, it.badge || '', it.bracketed ? 1 : 0, it.disabled ? 1 : 0].join('~');
    }).join('|');
  }

  function buildCard(doc, model, it, i) {
    var card = doc.createElement('div');
    card.className = 'sa-card' + (it.disabled ? ' is-disabled' : '');
    card.setAttribute('role', 'option');
    card.id = domId(model.screenId, it.id);
    card.setAttribute('data-item-id', it.id);
    card.setAttribute('aria-posinset', String(i + 1));
    card.setAttribute('aria-setsize', String(model.items.length));
    if (it.disabled) card.setAttribute('aria-disabled', 'true');

    var marker = doc.createElement('span');
    marker.className = 'sa-focus-marker';
    marker.setAttribute('aria-hidden', 'true');
    marker.textContent = '● Focused';
    card.appendChild(marker);

    var title = doc.createElement('span');
    title.className = 'sa-card-title';
    if (it.bracketed) {
      var b = doc.createElement('span');
      b.className = 'sa-bracketed';
      b.textContent = it.title;
      title.appendChild(b);
    } else {
      title.textContent = it.title;
    }
    card.appendChild(title);

    var sub = doc.createElement('span');
    sub.className = 'sa-card-sub';
    sub.textContent = it.badge ? '' : (it.subtitle || '');
    card.appendChild(sub);

    if (it.badge) {
      var badge = doc.createElement('span');
      badge.className = 'sa-badge';
      badge.textContent = it.badge;
      sub.appendChild(badge);
    }
    return card;
  }

  function render(el, model) {
    if (!el || !model) return;
    var doc = el.ownerDocument;
    model.items = model.items || [];
    el.setAttribute('aria-label', model.ariaLabel || '');
    el.setAttribute('aria-orientation', 'horizontal');
    el.setAttribute('data-columns', String(model.columns || 1));
    el.style.setProperty('--cols', String(model.columns || 1));
    var s = sig(model);
    if (el.__saSig !== s) {
      while (el.firstChild) el.removeChild(el.firstChild);
      model.items.forEach(function (it, i) { el.appendChild(buildCard(doc, model, it, i)); });
      el.__saSig = s;
      el.__saFocus = -1;
    }
    var n = model.items.length;
    var f = n ? Math.max(0, Math.min(n - 1, model.focus | 0)) : -1;
    var cards = el.children;
    for (var i = 0; i < cards.length; i++) {
      var on = i === f;
      cards[i].classList.toggle('is-focused', on);
      cards[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    if (f >= 0) {
      el.setAttribute('aria-activedescendant', cards[f].id);
      if (el.__saFocus !== f) {
        el.__saFocus = f;
        try { cards[f].scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* old engines */ }
      }
    } else {
      el.removeAttribute('aria-activedescendant');
    }
  }

  SA.ui.components.listbox = { render: render, domId: domId };
})(typeof window !== 'undefined' ? window : globalThis);
