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

  function render(el, content) {
    const doc = new DOMParser().parseFromString(`<template>${piece(content)}</template>`, 'text/html');
    el.replaceChildren(document.importNode(doc.querySelector('template').content, true));
  }

  root.DFU = root.DFU || {};
  root.DFU.html = { html, raw, render, escText };
})(globalThis);
