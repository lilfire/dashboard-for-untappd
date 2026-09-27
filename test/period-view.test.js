const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');

test('periodevisning: nye øl og øl smakt igjen, med drilldown fra perioden', async () => {
  const { document, DOMParser, CustomEvent, Event } = parseHTML(fs.readFileSync(require.resolve('../dashboard/index.html'), 'utf8'));
  const context = vm.createContext({ document, DOMParser, CustomEvent, Intl, navigator: { language: 'nb' } });
  for (const path of ['../lib/html.js', '../lib/i18n.js', '../lib/years.js']) {
    vm.runInContext(fs.readFileSync(require.resolve(path), 'utf8'), context);
  }
  const beer = (id, first, o = {}) => ({
    id: String(id), name: `Beer ${id}`, url: `/b/test/${id}`, first, recent: first, checkins: 1,
    brewery: 'Brewery', breweryUrl: '/brewery/a', style: 'IPA', ratingYou: 4, ...o,
  });
  const beers = [
    beer(1, '2025-06-13'),
    beer(2, '2025-06-14', { style: 'Stout', ratingYou: 3 }),
    beer(3, '2024-01-01', { recent: '2025-06-15', checkins: 2 }),
    beer(4, '2025-06-20'),
    beer(5, '2024-01-01', { recent: '2025-12-01', checkins: 5 }),
  ];
  context.DFU.store = {
    loadHistory: async () => ({ beers, complete: true, syncedAt: 1 }),
    getSettings: async () => ({}), lastUser: async () => null,
  };
  context.DFU.history = {};
  vm.runInContext(fs.readFileSync(require.resolve('../dashboard/years.js'), 'utf8'), context);
  context.DFU.yearsView.init();
  await context.DFU.yearsView.setUser('test', beers.length);

  const set = (id, value) => {
    const el = document.getElementById(id);
    // linkedom kan ikke sette value på select, men forstår selected.
    if (el.localName === 'select') for (const o of el.querySelectorAll('option')) o.selected = o.value === value;
    else el.value = value;
    el.dispatchEvent(new Event('change'));
  };
  set('y-mode', 'period');
  assert.equal(document.getElementById('y-period').hidden, false);
  assert.equal(document.getElementById('y-year').hidden, true);
  set('y-from', '2025-06-13');
  set('y-to', '2025-06-15');
  assert.equal(context.DFU.yearsView.state.view.preset, 'custom');

  const rows = [...document.querySelectorAll('#y-period-list tr')];
  assert.deepEqual(rows.map(r => r.querySelector('a').textContent), ['Beer 1', 'Beer 2', 'Beer 3']);
  assert.deepEqual(rows.map(r => r.querySelector('.period-tag').textContent), ['Ny', 'Ny', 'Igjen']);
  assert.match(document.getElementById('y-summary').textContent, /^3 øl, hvorav 2 nye og 1 smakt igjen$/);
  assert.ok(document.getElementById('y-fetch-dates'), 'øl 5 kan ha vært drukket i perioden');

  const styles = document.querySelector('.year-ranking-drilldown[data-ranking="styles"]');
  const ipa = [...styles.querySelectorAll('details')].find(d => d.querySelector('summary').textContent.includes('IPA'));
  assert.equal(ipa.querySelectorAll('li').length, 2);

  set('y-mode', 'year');
  assert.equal(document.getElementById('y-period').hidden, true);
  assert.ok(document.querySelector('.year-stamp'));
});

test('sammenligningen: ett filter for hele tiden, år og periode', async () => {
  const { document, DOMParser, CustomEvent, Event } = parseHTML(fs.readFileSync(require.resolve('../dashboard/index.html'), 'utf8'));
  const context = vm.createContext({ document, DOMParser, CustomEvent, Intl, AbortController, navigator: { language: 'nb' } });
  for (const path of ['../lib/html.js', '../lib/i18n.js', '../lib/years.js']) {
    vm.runInContext(fs.readFileSync(require.resolve(path), 'utf8'), context);
  }
  const beer = (id, first) => ({ id: String(id), name: `Beer ${id}`, first, recent: first, checkins: 1, brewery: 'B', style: 'IPA' });
  const histories = {
    me: [beer(1, '2025-06-13'), beer(2, '2024-03-01')],
    anne: [beer(1, '2025-07-01'), beer(3, '2024-05-01')],
    bob: [beer(1, '2024-02-01'), beer(3, '2024-06-01'), beer(4, '2025-01-01')],
  };
  context.DFU.store = {
    loadHistory: async name => ({ beers: histories[name], count: histories[name].length, complete: true, syncedAt: Date.now() }),
    getSettings: async () => ({ staleHours: 24 }), lastUser: async () => null,
  };
  context.DFU.history = {};
  context.DFU.progress = { hideTask() {} };
  vm.runInContext(fs.readFileSync(require.resolve('../dashboard/compare.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(require.resolve('../dashboard/years.js'), 'utf8'), context);
  const view = context.DFU.yearsView;
  view.init();
  await view.setUser('me', 2);
  await view.addFriend('anne', 2);

  const $ = id => document.getElementById(id);
  const set = (id, value) => {
    for (const o of $(id).querySelectorAll('option')) o.toggleAttribute('selected', o.value === value);
    $(id).dispatchEvent(new Event('change'));
  };
  let events = 0;
  document.addEventListener('dfu:cmp-scope', () => events++);
  const ids = list => JSON.parse(JSON.stringify(list.map(b => b.id)));

  assert.deepEqual([...$('cmp-mode').querySelectorAll('option')].map(o => o.value), ['all', 'year', 'period']);
  assert.equal(view.cmpScope().mode, 'all');
  assert.equal($('cmp-all-block').hidden, false);
  assert.equal($('cmp-year-select').hidden, true);
  assert.deepEqual(ids(view.cmpBeers('anne')), ['1', '3']);
  const table = () => [...$('cmp-year-table').querySelectorAll('tr')].map(r => [...r.children].map(c => c.textContent.trim()));
  assert.deepEqual(table()[0], ['Hele tiden', 'Du', 'anne']);
  assert.deepEqual(table().find(r => r[0] === 'Unike øl'), ['Unike øl', '2', '2']);
  assert.deepEqual(table().at(-1), ['Felles øl', '1']);

  set('cmp-mode', 'year');
  assert.equal(events, 1);
  assert.equal($('cmp-all-block').hidden, true);
  assert.equal($('cmp-year-select').hidden, false);
  assert.deepEqual(JSON.parse(JSON.stringify(view.cmpScope())), { mode: 'year', year: 2025, from: '2025-01-01', to: '2025-12-31' });
  assert.deepEqual(ids(view.cmpBeers('me')), ['1']);
  assert.ok($('cmp-year-table').textContent.includes('2025'));

  set('cmp-mode', 'period');
  set('cmp-preset', 'custom');
  $('cmp-from').value = '2024-01-01';
  $('cmp-to').value = '2024-12-31';
  $('cmp-to').dispatchEvent(new Event('change'));
  assert.deepEqual(ids(view.cmpBeers('anne')), ['3']);
  assert.equal($('cmp-year-select').hidden, true);

  // En venn til: én kolonne per person, høyeste tall uthevet og «Felles for alle».
  await view.addFriend('bob', 3);
  set('cmp-mode', 'all');
  assert.deepEqual(table()[0], ['Hele tiden', 'Du', 'anne', 'bob'], 'hele navnet (bred skjerm), prikk ved siden av (mobil)');
  assert.equal($('cmp-year-table').querySelectorAll('thead .cmp-key').length, 3);
  assert.deepEqual([...$('cmp-year-table').querySelectorAll('caption span')].map(el => el.textContent), ['Du', 'anne', 'bob']);
  assert.deepEqual(table().find(r => r[0] === 'Unike øl'), ['Unike øl', '2', '2', '3']);
  const unique = [...$('cmp-year-table').querySelectorAll('tr')].find(r => r.firstElementChild.textContent === 'Unike øl');
  assert.deepEqual([...unique.querySelectorAll('td')].map(td => td.className), ['', '', '', 'win']);
  assert.deepEqual(table().at(-1), ['Felles for alle', '1']);
  const allYears = [...$('cmp-all-years').querySelectorAll('thead tr')].map(r => [...r.children].map(c => c.textContent.trim()));
  assert.deepEqual(allYears[0], ['År', 'Innsjekkinger', 'Nye øl', 'Felles for alle'], 'bred skjerm viser begge');
  const alt = () => [...$('cmp-all-years').querySelectorAll('thead tr:first-child th')].map(th => th.classList.contains('cmp-alt'));
  assert.deepEqual(alt(), [false, false, true, false], 'mobil skjuler nye øl til det velges');
  assert.deepEqual([...$('cmp-all-years').querySelectorAll('thead .cmp-key')].map(k => k.getAttribute('aria-label')), ['Felles for alle', 'Du', 'anne', 'bob', 'Du', 'anne', 'bob']);
  assert.deepEqual([...$('cmp-all-years').querySelectorAll('caption span')].map(el => el.textContent), ['Du', 'anne', 'bob', 'Felles for alle'], 'navnene og «Felles for alle» står i forklaringen');
  assert.equal($('cmp-all-metric').hidden, false);
  $('cmp-all-metric').querySelector('[data-metric="new"]').click();
  assert.deepEqual(alt(), [false, true, false, false]);

  view.removeFriend('bob');
  assert.deepEqual(table()[0], ['Hele tiden', 'Du', 'anne']);
  assert.deepEqual(table().at(-1), ['Felles øl', '1']);
  assert.equal($('cmp-all-metric').hidden, true);
});
