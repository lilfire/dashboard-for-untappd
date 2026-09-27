// Trygg HTML: html`...` escaper alle verdier automatisk, unntatt verdier som allerede er
// laget med html`` eller raw(). render() setter innholdet uten innerHTML.
(function (root) {
  const RAW = Symbol('raw');

  const escText = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const raw = s => ({ [RAW]: String(s) });

  function piece(v) {
    if (v == null || v === false) return '';
    if (Array.isArray(v)) return v.map(piece).join('');
    if (typeof v === 'object' && RAW in v) return v[RAW];
    return escText(v);
  }

  function html(strings, ...values) {
    let out = strings[0];
    values.forEach((v, i) => { out += piece(v) + strings[i + 1]; });
    return raw(out);
  }

  const fragment = content => {
    const doc = new DOMParser().parseFromString(`<template>${piece(content)}</template>`, 'text/html');
    return document.importNode(doc.querySelector('template').content, true);
  };

  function render(el, content) {
    el.replaceChildren(fragment(content));
  }

  // Som render, men legger innholdet til etter det som allerede står der.
  function append(el, content) {
    el.append(fragment(content));
  }

  // Lange lister på smal skjerm: de første radene vises, resten bak «Vis alle», i stedet for
  // en egen scrollboks inne i siden. Hvilke lister som er åpnet huskes på tvers av ny tegning.
  const LIST_PREVIEW = 12;
  const openLists = new Set();
  const listLabel = (open, count) => {
    const { t, number } = root.DFU.i18n;
    return open ? t('list_showFewer') : t('list_showAll', number(count));
  };
  const listClass = key => (openLists.has(key) ? 'all' : '');
  const listMore = (key, count) => (count > LIST_PREVIEW
    ? html`<li class="list-more"><button type="button" class="btn list-more-btn" data-list="${key}" data-count="${count}">${listLabel(openLists.has(key), count)}</button></li>`
    : '');

  if (typeof document !== 'undefined') {
    document.addEventListener('click', e => {
      const btn = e.target.closest?.('.list-more-btn');
      if (!btn) return;
      const key = btn.dataset.list;
      const open = !openLists.has(key);
      if (open) openLists.add(key); else openLists.delete(key);
      btn.closest('ol')?.classList.toggle('all', open);
      btn.textContent = listLabel(open, Number(btn.dataset.count));
      if (!open) btn.closest('ol')?.parentElement?.scrollIntoView({ block: 'nearest' });
    });
  }

  root.DFU = root.DFU || {};
  root.DFU.html = { html, raw, render, append, escText, listMore, listClass };
})(globalThis);
