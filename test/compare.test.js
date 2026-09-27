const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { parseHTML } = require('linkedom');

function setup(friends, cached = { friends: [], complete: false }, stats = undefined) {
  const { document, DOMParser } = parseHTML('<form id="cmp-form"><div class="combo"><input id="cmp-user"><ul id="cmp-friends" hidden></ul></div><button></button></form><p id="cmp-friends-meta"></p><p id="cmp-meta"></p><div id="cmp-kind"></div>');
  const requested = [];
  const fetches = [];
  const saved = [];
  const DFU = {
    i18n: { t: key => key, number: String },
    store: {
      loadFriends: async () => cached,
      getSettings: async () => ({ staleHours: 6 }),
      saveFriends: async (owner, value) => { saved.push({ owner, value }); },
    },
    fetch: {
      fetchFriends: async () => { fetches.push(true); return { friends }; },
      fetchDirect: async name => { requested.push(name); return { data: { hasData: false } }; },
    },
  };
  const context = vm.createContext({ DFU, document, DOMParser });
  vm.runInContext(fs.readFileSync(require.resolve('../lib/html.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(require.resolve('../dashboard/compare.js'), 'utf8'), context);
  DFU.compare.init();
  DFU.compare.setMe({ pageOwner: 'me', stats });
  return { document, requested, fetches, saved };
}

test('fresh persisted friends are searchable without fetching again', async () => {
  const friend = { name: 'Anne Hansen', username: 'anne' };
  const { document, fetches, requested } = setup([], { friends: [friend], complete: true, syncedAt: Date.now() }, { friends: 1 });
  const input = document.getElementById('cmp-user');
  input.dispatchEvent(new document.defaultView.Event('focus'));
  await new Promise(resolve => setImmediate(resolve));
  input.value = 'Anne Hansen';
  document.getElementById('cmp-form').dispatchEvent(new document.defaultView.Event('submit', { cancelable: true }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fetches.length, 0);
  assert.deepEqual(requested, ['anne']);
});

for (const [name, syncedAt, complete, count] of [
  ['expired', 1, true, 1], ['count changed', Date.now(), true, 2], ['incomplete', Date.now(), false, 1],
]) test(`refreshes ${name} cache and persists complete result`, async () => {
  const { document, fetches, saved } = setup([{ name: 'New Friend', username: 'new' }], {
    friends: [{ name: 'Old Friend', username: 'old' }], syncedAt, complete,
  }, { friends: count });
  document.getElementById('cmp-user').dispatchEvent(new document.defaultView.Event('focus'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fetches.length, 1);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].value.complete, true);
  assert.equal(saved[0].value.friends.length, 1);
  assert.equal(saved[0].value.friends[0].username, 'new');
});

test('name and selected suggestion resolve to username; duplicate names require selection', async () => {
  const { document, requested } = setup([
    { name: 'Anne Hansen', username: 'beer_anne' },
    { name: 'Per Olsen', username: 'per1' },
    { name: 'Per Olsen', username: 'per2' },
  ]);
  const input = document.getElementById('cmp-user');
  input.dispatchEvent(new document.defaultView.Event('focus'));
  await new Promise(resolve => setImmediate(resolve));
  for (const value of ['anne hansen', 'Anne Hansen (@beer_anne)', 'Per Olsen', 'Per Olsen (@per2)', 'someone_else']) {
    input.value = value;
    document.getElementById('cmp-form').dispatchEvent(new document.defaultView.Event('submit', { cancelable: true }));
    await new Promise(resolve => setImmediate(resolve));
    if (value === 'Per Olsen') assert.equal(document.getElementById('cmp-meta').textContent, 'compare_chooseFriend');
  }
  assert.deepEqual(requested, ['beer_anne', 'beer_anne', 'per2', 'someone_else']);
});

test('suggestions filter friends and can be picked with the keyboard', async () => {
  const { document, requested } = setup([
    { name: 'Anne Hansen', username: 'beer_anne' },
    { name: 'Per Olsen', username: 'per1' },
    { name: 'Per Olsen', username: 'per2' },
  ]);
  const { Event } = document.defaultView;
  const input = document.getElementById('cmp-user');
  const list = document.getElementById('cmp-friends');
  const key = k => input.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: k }));
  input.dispatchEvent(new Event('focus'));
  await new Promise(resolve => setImmediate(resolve));

  input.value = 'per';
  input.dispatchEvent(new Event('input'));
  assert.equal(list.hidden, false);
  assert.deepEqual([...list.querySelectorAll('.combo-user')].map(el => el.textContent), ['@per1', '@per2']);
  assert.equal(input.getAttribute('aria-expanded'), 'true');

  key('Escape');
  assert.equal(list.hidden, true);

  key('ArrowDown');
  key('ArrowDown');
  assert.equal(input.getAttribute('aria-activedescendant'), 'cmp-friend-1');
  key('Enter');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(input.value, '', 'feltet tømmes når vennen legges til');
  assert.equal(list.hidden, true);
  assert.deepEqual(requested, ['per2']);
});

function friendPage(start, count) {
  return Array.from({ length: count }, (_, i) => `<a href="/user/friend${start + i}">Friend ${start + i}</a><a href="/user/friend${start + i}"><img></a>`).join('');
}
function fetchSetup(pages, total) {
  const requests = [];
  const DFU = { parse: {
    isLoggedIn: doc => !!doc.querySelector('a[href="/logout"]'),
    detectChallenge: doc => doc.title === 'Just a moment',
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../lib/fetch.js'), 'utf8'), {
    DFU, URL, setTimeout: fn => setImmediate(fn),
    DOMParser: class { parseFromString(html) { return parseHTML(`<html><head></head><body>${html}</body></html>`).document; } },
    fetch: async (url, options) => {
      const first = requests.length === 0;
      requests.push({ url, options });
      const page = pages.shift();
      if (page instanceof Error) throw page;
      assert.notEqual(page, undefined, 'must stop when all pages are read');
      const html = first ? `<a href="/logout">Logout</a><nav><a href="/user/stranger">Stranger</a></nav>${total == null ? '' : `<div class="stats"><a href="/user/me/friends"><span class="stat">${total}</span></a></div>`}<main><a href="/user/me">Me</a>${page}</main>` : page;
      return { text: async () => html, status: 200, url, headers: { get: () => null } };
    },
  });
  return { fetchFriends: DFU.fetch.fetchFriends, requests };
}

test('loads 53 friends from initial page and two AJAX fragments without logout links', async () => {
  const { fetchFriends, requests } = fetchSetup([friendPage(1, 25), friendPage(26, 25), friendPage(51, 3)], 53);
  const progress = [];
  const result = await fetchFriends('me', { onProgress: count => progress.push(count) });
  assert.equal(result.partial, false);
  assert.equal(result.friends.length, 53);
  assert.equal(result.friends.at(-1).username, 'friend53');
  assert.deepEqual(progress, [25, 50, 53]);
  assert.deepEqual(requests.map(r => r.url), [
    'https://untappd.com/user/me/friends',
    'https://untappd.com/friend/more_friends/me/25?sort=',
    'https://untappd.com/friend/more_friends/me/50?sort=',
  ]);
  assert.equal(requests[0].options.headers, undefined);
  for (const request of requests.slice(1)) {
    assert.equal(request.options.headers['X-Requested-With'], 'XMLHttpRequest');
    assert.equal(request.options.credentials, 'include');
  }
});

test('stops at known total even when the last page has 25 friends', async () => {
  const { fetchFriends, requests } = fetchSetup([friendPage(1, 25), friendPage(26, 25)], 50);
  assert.equal((await fetchFriends('me')).friends.length, 50);
  assert.equal(requests.length, 2);
});

test('without a total, continues until an empty fragment after full pages', async () => {
  const { fetchFriends, requests } = fetchSetup([friendPage(1, 25), friendPage(26, 25), '']);
  const result = await fetchFriends('me');
  assert.equal(result.partial, false);
  assert.equal(result.friends.length, 50);
  assert.equal(requests.length, 3);
});

for (const [name, page, expected] of [
  ['network failure', new Error('HTTP 503'), 'HTTP 503'],
  ['premature empty page', '', 'friends_incomplete'],
  ['repeated page', friendPage(1, 25), 'friends_pagination_stalled'],
  ['login form', '<input type="password">', 'friends_logged_out'],
]) test(`preserves first page and reports ${name}`, async () => {
  const { fetchFriends } = fetchSetup([friendPage(1, 25), page], 53);
  const result = await fetchFriends('me');
  assert.equal(result.partial, true);
  assert.equal(result.friends.length, 25);
  assert.equal(result.error, expected);
});

function compareModuleWithYears() {
  const DFU = { i18n: { t: (key, ...args) => [key, ...args].join(':'), number: String }, html: { html: () => '', render: () => {} }, store: {}, fetch: {} };
  const context = vm.createContext({ DFU, document: parseHTML('<div></div>').document });
  vm.runInContext(fs.readFileSync(require.resolve('../lib/years.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(require.resolve('../dashboard/compare.js'), 'utf8'), context);
  return DFU.compare;
}

function compareModule() {
  const DFU = { i18n: { t: key => key, number: String }, html: { html: () => '', render: () => {} }, store: {}, fetch: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../dashboard/compare.js'), 'utf8'), { DFU, document: parseHTML('<div></div>').document });
  return DFU.compare;
}

test('beersFor finds beers per brewery by name or id, per style and per country', () => {
  const { beersFor } = compareModule();
  const beers = [
    { id: 1, name: 'A', brewery: 'Bräu Haus', breweryUrl: '/w/brau-haus/10', style: 'IPA - American', first: '2024-01-01' },
    { id: 2, name: 'B', brewery: 'Brau Haus', breweryUrl: null, style: 'Stout', first: '2025-01-01' },
    { id: 3, name: 'C', brewery: 'Renamed', breweryUrl: '/w/renamed/10', style: 'IPA - American', first: '2023-01-01' },
    { id: 4, name: 'D', brewery: 'Other', breweryUrl: '/w/other/11', style: 'Stout', first: '2022-01-01' },
  ];
  assert.deepEqual(beersFor('breweries', { id: '10', name: 'BRAU HAUS' }, beers).map(b => b.id), [2, 1, 3]);
  assert.deepEqual(beersFor('styles', { id: 's', name: 'Stout' }, beers).map(b => b.id), [2, 4]);
  assert.deepEqual(beersFor('countries', { id: 'no', name: 'Norway' }, beers, { 1: 'Norway', 4: 'Norway', 2: 'Sweden' }).map(b => b.id), [1, 4]);
  assert.deepEqual(beersFor('countries', { id: 'no', name: 'Norway' }, beers).map(b => b.id), []);
});

test('groupBeers counts beers per brewery (by id or name), style and country', () => {
  const { groupBeers } = compareModule();
  const beers = [
    { id: 1, brewery: 'Bräu', breweryUrl: '/w/brau/10', style: 'IPA' },
    { id: 2, brewery: 'Renamed', breweryUrl: '/w/renamed/10', style: 'IPA' },
    { id: 3, brewery: 'Garage', breweryUrl: null, style: 'Stout' },
    { id: 4, brewery: 'GARAGE', breweryUrl: null, style: null },
  ];
  const plain = list => JSON.parse(JSON.stringify(list));
  assert.deepEqual(plain(groupBeers(beers, 'breweries')), [{ id: '10', name: 'Bräu', count: 2 }, { id: 'garage', name: 'Garage', count: 2 }]);
  assert.deepEqual(plain(groupBeers(beers, 'styles')), [{ id: 'IPA', name: 'IPA', count: 2 }, { id: 'Stout', name: 'Stout', count: 1 }]);
  assert.deepEqual(plain(groupBeers(beers, 'countries', { 1: 'Norway', 3: 'Norway', 4: 'Sweden' })), [{ id: 'Norway', name: 'Norway', count: 2 }, { id: 'Sweden', name: 'Sweden', count: 1 }]);
});

test('splitMany: two people match the old split, three add a "some" bucket', () => {
  const { splitMany, buckets } = compareModuleWithYears();
  const item = (id, count) => ({ id, name: id, count });
  const plain = v => JSON.parse(JSON.stringify(v));
  const ids = rows => plain(rows.map(r => r.id));
  const two = splitMany([[item('a', 1), item('b', 5)], [item('b', 2), item('c', 3)]]);
  assert.deepEqual([ids(two.all), plain(two.only).map(ids), ids(two.some)], [['b'], [['a'], ['c']], []]);
  assert.deepEqual([...two.all[0].counts], [5, 2]);
  assert.deepEqual(plain(buckets(['Du', 'anne'], two).map(b => b.key)), ['me', 'all', 'only:anne']);

  const three = splitMany([[item('a', 1), item('b', 5), item('d', 1)], [item('b', 2), item('c', 3)], [item('b', 1), item('d', 4), item('e', 2)]]);
  assert.deepEqual([ids(three.all), plain(three.only).map(ids), ids(three.some)], [['b'], [['a'], ['c'], ['e']], ['d']]);
  assert.deepEqual([...three.some[0].counts], [1, null, 4]);
  const cards = buckets(['Du', 'anne', 'bob'], three);
  assert.deepEqual(plain(cards.map(b => [b.key, b.rows.length, b.tone])), [['me', 1, 'p0'], ['all', 1, 'shared'], ['some', 1, 'some'], ['only:anne', 1, 'p1'], ['only:bob', 1, 'p2']]);
});

test('beers under a shared brewery split into shared, only mine and only theirs', () => {
  const { beersFor } = compareModule();
  const years = require('../lib/years.js');
  const item = { id: '10', name: 'Brew' };
  const mine = [{ id: 1, name: 'A', brewery: 'Brew' }, { id: 2, name: 'B', brewery: 'Brew' }, { id: 9, name: 'X', brewery: 'Else' }];
  const theirs = [{ id: 2, name: 'B', brewery: 'Brew' }, { id: 3, name: 'C', brewery: 'Brew' }];
  const s = years.compareYear(beersFor('breweries', item, mine), beersFor('breweries', item, theirs));
  assert.deepEqual([s.both, s.onlyMine, s.onlyTheirs].map(l => l.map(b => b.id)), [[2], [1], [3]]);
});

test('beers tab splits both histories and waits for missing history', async () => {
  const { document, DOMParser } = parseHTML(`<form id="cmp-form"><input id="cmp-user"><ul id="cmp-friends" hidden></ul><button></button></form>
    <p id="cmp-friends-meta"></p><p id="cmp-meta"></p><div id="cmp-task-countries"></div>
    <div id="cmp-out" hidden><h3 id="cmp-kpis-title"></h3><section id="cmp-kpis"></section>
    <div id="cmp-trend-metric"></div><div id="cmp-trend-legend"></div><div id="cmp-trend-chart"></div><p id="cmp-trend-note"></p>
    <div id="cmp-kind"><button type="button" data-kind="beers"></button></div>
    <div id="cmp-overlap"></div><p id="cmp-summary"></p><div id="cmp-cols"></div></div>`);
  const beer = (id, ratingYou) => ({ id, name: `Beer ${id}`, brewery: 'B', style: 'IPA', ratingYou, first: '2025-01-01', url: `/b/${id}` });
  const state = { history: { beers: [] }, friends: new Map() };
  const DFU = {
    i18n: { t: (key, ...args) => [key, ...args].join(':'), number: String, locale: () => 'en', date: String },
    store: { loadCountries: async () => ({ byBeer: {}, counts: {} }) },
    fetch: { fetchDirect: async () => ({ data: { hasData: true, pageOwner: 'anne', breweries: [], countries: [], styles: [] } }) },
    progress: { hideTask() {} },
    views: { renderKpis() {} },
    charts: { lineChart() {} },
    yearsView: { state, addFriend: async () => async () => {}, removeFriend() {} },
  };
  const context = vm.createContext({ DFU, document, DOMParser, AbortController });
  vm.runInContext(fs.readFileSync(require.resolve('../lib/html.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(require.resolve('../lib/years.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(require.resolve('../dashboard/compare.js'), 'utf8'), context);
  DFU.compare.init();
  DFU.compare.setMe({ pageOwner: 'me', breweries: [], countries: [], styles: [] });
  document.querySelector('[data-kind="beers"]').click();
  document.getElementById('cmp-user').value = 'anne';
  document.getElementById('cmp-form').dispatchEvent(new document.defaultView.Event('submit', { cancelable: true }));
  await new Promise(resolve => setImmediate(resolve));

  const cols = () => document.getElementById('cmp-cols');
  assert.match(cols().textContent, /compare_needHistory/);
  assert.match(cols().textContent, /compare_friendHistoryLoading:anne/);

  state.history.beers = [beer(1, 4), beer(2, 3.5)];
  state.friends.set('anne', { name: 'anne', history: { beers: [beer(2, 4.25), beer(3, 3)] } });
  document.dispatchEvent(new document.defaultView.Event('dfu:friend-history'));
  const lists = () => [...cols().querySelectorAll('.cmp-col')].map(col => [...col.querySelectorAll('li a')].map(a => a.textContent));
  const pick = col => document.querySelector(`#cmp-overlap [data-show="${col}"]`).click();
  assert.deepEqual(lists(), []);
  assert.match(cols().textContent, /compare_pickList/);
  assert.deepEqual([...document.querySelectorAll('#cmp-overlap [data-show]')].map(b => b.dataset.show), ['me', 'all', 'only:anne']);
  pick('all');
  assert.deepEqual(lists(), [['Beer 2']]);
  const vals = li => [...li.querySelectorAll('.cmp-vals span')].map(el => el.textContent);
  assert.deepEqual(vals(cols().querySelector('.cmp-col li')), ['3.5', '4.25']);
  assert.deepEqual(vals(cols().querySelector('.cmp-head')), ['compare_you', 'anne']);
  assert.equal(document.querySelector('[data-show="all"]').getAttribute('aria-pressed'), 'true');
  pick('me');
  assert.deepEqual(lists(), [['Beer 1']]);
  pick('only:anne');
  assert.deepEqual(lists(), [['Beer 3']]);
  pick('only:anne');
  assert.deepEqual(lists(), []);
  assert.equal(document.getElementById('cmp-summary').textContent, 'compare_summary:1:1:1:anne');
});

test('year filter limits beers and breweries to the beers in the chosen time', async () => {
  const { document, DOMParser } = parseHTML(`<form id="cmp-form"><input id="cmp-user"><ul id="cmp-friends" hidden></ul><button></button></form>
    <p id="cmp-friends-meta"></p><p id="cmp-meta"></p><div id="cmp-task-countries"></div>
    <div id="cmp-out" hidden><h3 id="cmp-kpis-title"></h3><section id="cmp-kpis"></section>
    <div id="cmp-trend-metric"></div><div id="cmp-trend-legend"></div><div id="cmp-trend-chart"></div><p id="cmp-trend-note"></p>
    <div id="cmp-kind"><button type="button" data-kind="beers"></button><button type="button" data-kind="breweries"></button></div>
    <div id="cmp-overlap"></div><p id="cmp-summary"></p><div id="cmp-cols"></div></div>`);
  const beer = (id, brewery, first) => ({ id, name: `Beer ${id}`, brewery, breweryUrl: `/w/x/${brewery.charCodeAt(0)}`, style: 'IPA', first, url: `/b/${id}` });
  const mine = [beer(1, 'A', '2025-02-01'), beer(2, 'B', '2024-02-01'), beer(3, 'C', '2025-03-01')];
  const theirs = [beer(1, 'A', '2025-05-01'), beer(4, 'B', '2025-01-01')];
  let mode = 'all';
  const inYear = list => list.filter(b => b.first.startsWith('2025'));
  const state = { history: { beers: mine }, friends: new Map() };
  const DFU = {
    i18n: { t: (key, ...args) => [key, ...args].join(':'), number: String, locale: () => 'en', date: String },
    store: { loadCountries: async () => ({ byBeer: {}, counts: {} }) },
    fetch: { fetchDirect: async () => ({ data: { hasData: true, pageOwner: 'anne', breweries: [{ id: '65', name: 'A', count: 1 }], countries: [], styles: [] } }) },
    progress: { hideTask() {} },
    views: { renderKpis() {} },
    charts: { lineChart() {} },
    yearsView: {
      state, addFriend: async () => async () => {}, removeFriend() {},
      cmpScope: () => (mode === 'all' ? { mode } : { mode, year: 2025, from: '2025-01-01', to: '2025-12-31' }),
      cmpBeers: who => inYear(who === 'me' ? mine : theirs),
    },
  };
  const context = vm.createContext({ DFU, document, DOMParser, AbortController });
  vm.runInContext(fs.readFileSync(require.resolve('../lib/html.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(require.resolve('../lib/years.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(require.resolve('../dashboard/compare.js'), 'utf8'), context);
  DFU.compare.init();
  DFU.compare.setMe({ pageOwner: 'me', breweries: [{ id: '65', name: 'A', count: 1 }, { id: '66', name: 'B', count: 1 }, { id: '67', name: 'C', count: 1 }], countries: [], styles: [] });
  document.getElementById('cmp-user').value = 'anne';
  document.getElementById('cmp-form').dispatchEvent(new document.defaultView.Event('submit', { cancelable: true }));
  await new Promise(resolve => setImmediate(resolve));
  state.friends.set('anne', { name: 'anne', history: { beers: theirs } });
  const summary = () => document.getElementById('cmp-summary').textContent;
  const kind = k => document.querySelector(`#cmp-kind [data-kind="${k}"]`).click();

  kind('beers');
  assert.equal(summary(), 'compare_summary:1:2:1:anne');
  kind('breweries');
  assert.equal(summary(), 'compare_summary:1:2:0:anne', 'hele tiden bruker profilens bryggerier');

  mode = 'year';
  document.dispatchEvent(new document.defaultView.Event('dfu:cmp-scope'));
  assert.equal(summary(), 'compare_summary:1:1:1:anne', '2025: A felles, C bare meg, B bare anne');
  kind('beers');
  assert.equal(summary(), 'compare_summary:1:1:1:anne', '2025: øl 1 felles, øl 3 bare meg, øl 4 bare anne');
});

test('two friends: chips, one column per person, five cards, and removal with ×', async () => {
  const { document, DOMParser } = parseHTML(`<form id="cmp-form"><input id="cmp-user"><ul id="cmp-friends" hidden></ul><button type="submit"></button></form>
    <ul id="cmp-people" hidden></ul><p id="cmp-friends-meta"></p><p id="cmp-meta"></p><div id="cmp-tasks"></div>
    <div id="cmp-out" hidden><table id="cmp-kpis"></table>
    <div id="cmp-trend-metric"></div><div id="cmp-trend-legend"></div><div id="cmp-trend-chart"></div><p id="cmp-trend-note"></p>
    <div id="cmp-kind"><button type="button" data-kind="beers"></button></div>
    <div id="cmp-overlap"></div><p id="cmp-summary"></p><div id="cmp-cols"></div></div>`);
  const beer = id => ({ id, name: `Beer ${id}`, brewery: 'B', style: 'IPA', ratingYou: id, first: '2025-01-01', url: `/b/${id}` });
  const histories = { anne: [beer(2), beer(3)], bob: [beer(2), beer(4), beer(1)] };
  const state = { history: { beers: [beer(1), beer(2)] }, friends: new Map() };
  const removed = [];
  const profile = name => ({ data: { hasData: true, pageOwner: name, stats: { total: name.length }, breweries: [], countries: [], styles: [] } });
  const DFU = {
    i18n: { t: (key, ...args) => [key, ...args].join(':'), number: String, locale: () => 'en', date: String },
    store: { loadCountries: async () => ({ byBeer: {}, counts: {} }) },
    fetch: { fetchDirect: async name => profile(name) },
    progress: { hideTask() {}, removeTasks() {} },
    charts: { lineChart() {} },
    yearsView: {
      state,
      addFriend: async name => {
        state.friends.set(name, { name, history: { beers: histories[name] } });
        document.dispatchEvent(new document.defaultView.Event('dfu:friend-history'));
        return async () => {};
      },
      removeFriend: name => { removed.push(name); state.friends.delete(name); },
    },
  };
  const context = vm.createContext({ DFU, document, DOMParser, AbortController });
  for (const path of ['../lib/html.js', '../lib/years.js', '../dashboard/compare.js']) vm.runInContext(fs.readFileSync(require.resolve(path), 'utf8'), context);
  DFU.compare.init();
  DFU.compare.setMe({ pageOwner: 'me', stats: { total: 1 }, breweries: [], countries: [], styles: [] });
  document.querySelector('[data-kind="beers"]').click();
  const add = async name => {
    document.getElementById('cmp-user').value = name;
    document.getElementById('cmp-form').dispatchEvent(new document.defaultView.Event('submit', { cancelable: true }));
    for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
  };
  await add('anne');
  await add('bob');
  await add('anne');
  assert.equal(document.getElementById('cmp-meta').textContent, 'compare_alreadyAdded:anne');

  const chips = () => [...document.querySelectorAll('#cmp-people li span')].map(el => el.textContent);
  assert.deepEqual(chips(), ['anne', 'bob']);
  const shows = () => [...document.querySelectorAll('#cmp-overlap [data-show]')].map(b => [b.dataset.show, b.querySelector('strong').textContent]);
  assert.deepEqual(shows(), [['me', '0'], ['all', '1'], ['some', '1'], ['only:anne', '1'], ['only:bob', '1']]);
  assert.equal(document.getElementById('cmp-summary').textContent, 'compare_summaryMany:1:0:1');
  const header = [...document.querySelectorAll('#cmp-kpis thead th')].map(th => th.textContent);
  assert.deepEqual(header, ['compare_totalsMany', 'compare_you', 'anne', 'bob'], 'hele navnet (vises på bred skjerm)');
  const keys = [...document.querySelectorAll('#cmp-kpis thead .cmp-key')].map(el => [el.className, el.getAttribute('aria-label')]);
  assert.deepEqual(keys, [['cmp-key p0', 'compare_you'], ['cmp-key p1', 'anne'], ['cmp-key p2', 'bob']]);
  const legend = [...document.querySelectorAll('#cmp-kpis caption span')].map(el => el.textContent);
  assert.deepEqual(legend, ['compare_you', 'anne', 'bob'], 'forklaringen viser fargen og hele navnet');

  document.querySelector('#cmp-overlap [data-show="some"]').click();
  const li = document.querySelector('#cmp-cols .cmp-col li');
  assert.equal(li.querySelector('a').textContent, 'Beer 1');
  assert.deepEqual([...li.querySelectorAll('.cmp-vals span')].map(el => el.textContent), ['1', '–', '1']);

  document.querySelector('#cmp-people [data-remove="anne"]').click();
  assert.deepEqual(removed, ['anne']);
  assert.deepEqual(chips(), ['bob']);
  assert.deepEqual(shows(), [['me', '0'], ['all', '2'], ['only:bob', '1']]);
  assert.equal(document.getElementById('cmp-summary').textContent, 'compare_summary:2:0:1:bob');
});

test('friends show with the name from the friend list, but are still keyed by username', async () => {
  const { document, DOMParser } = parseHTML(`<form id="cmp-form"><input id="cmp-user"><ul id="cmp-friends" hidden></ul><button type="submit"></button></form>
    <ul id="cmp-people" hidden></ul><p id="cmp-friends-meta"></p><p id="cmp-meta"></p><div id="cmp-tasks"></div>
    <div id="cmp-out" hidden><table id="cmp-kpis"></table>
    <div id="cmp-trend-metric"></div><div id="cmp-trend-legend"></div><div id="cmp-trend-chart"></div><p id="cmp-trend-note"></p>
    <div id="cmp-kind"><button type="button" data-kind="beers"></button></div>
    <div id="cmp-overlap"></div><p id="cmp-summary"></p><div id="cmp-cols"></div></div>`);
  const beer = id => ({ id, name: `Beer ${id}`, brewery: 'B', style: 'IPA', first: '2025-01-01', url: `/b/${id}` });
  const state = { history: { beers: [beer(1), beer(2)] }, friends: new Map() };
  const added = [];
  const removed = [];
  const DFU = {
    i18n: { t: (key, ...args) => [key, ...args].join(':'), number: String, locale: () => 'en', date: String },
    store: {
      loadCountries: async () => ({ byBeer: {}, counts: {} }),
      loadFriends: async () => ({ friends: [{ username: 'anne', name: 'Anne Hansen' }], complete: true, syncedAt: Date.now() }),
      getSettings: async () => ({ staleHours: 6 }),
    },
    fetch: { fetchDirect: async name => ({ data: { hasData: true, pageOwner: name, stats: {}, breweries: [], countries: [], styles: [] } }) },
    progress: { hideTask() {}, removeTasks() {} },
    charts: { lineChart() {} },
    yearsView: {
      state,
      addFriend: async name => {
        added.push(name);
        state.friends.set(name, { name, history: { beers: [beer(2), beer(3)] } });
        return async () => {};
      },
      removeFriend: name => { removed.push(name); state.friends.delete(name); },
    },
  };
  const context = vm.createContext({ DFU, document, DOMParser, AbortController, CustomEvent: document.defaultView.CustomEvent });
  for (const path of ['../lib/html.js', '../lib/years.js', '../dashboard/compare.js']) vm.runInContext(fs.readFileSync(require.resolve(path), 'utf8'), context);
  DFU.compare.init();
  DFU.compare.setMe({ pageOwner: 'me', stats: {}, breweries: [], countries: [], styles: [] });
  document.querySelector('[data-kind="beers"]').click();
  const tick = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
  const add = async name => {
    document.getElementById('cmp-user').value = name;
    document.getElementById('cmp-form').dispatchEvent(new document.defaultView.Event('submit', { cancelable: true }));
    await tick();
  };
  const chips = () => [...document.querySelectorAll('#cmp-people li span')].map(el => el.textContent);

  // Lagt til før vennelisten er lastet: brukernavnet, til listen kommer.
  await add('anne');
  await add('bob');
  assert.deepEqual(chips(), ['anne', 'bob']);
  document.getElementById('cmp-user').dispatchEvent(new document.defaultView.Event('focus'));
  await tick();
  assert.deepEqual(chips(), ['Anne Hansen', 'bob'], 'bob er ikke i vennelisten og beholder brukernavnet');
  assert.equal(DFU.compare.label('ANNE'), 'Anne Hansen');
  assert.deepEqual(added, ['anne', 'bob']);

  const legend = [...document.querySelectorAll('#cmp-kpis caption span')].map(el => el.textContent);
  assert.deepEqual(legend, ['compare_you', 'Anne Hansen', 'bob']);
  const shows = () => [...document.querySelectorAll('#cmp-overlap [data-show]')].map(b => [b.dataset.show, b.textContent.includes('Anne Hansen')]);
  assert.deepEqual(shows().find(([key]) => key === 'only:anne'), ['only:anne', true], 'kortet viser navnet, men nøkkelen er brukernavnet');

  document.querySelector('#cmp-overlap [data-show="only:anne"]').click();
  document.querySelector('#cmp-people [data-remove="anne"]').click();
  assert.deepEqual(removed, ['anne']);
  assert.deepEqual(chips(), ['bob']);
});
