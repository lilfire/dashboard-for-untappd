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
  assert.equal(input.value, 'Per Olsen (@per2)');
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
  const state = { history: { beers: [] }, friend: null };
  const DFU = {
    i18n: { t: (key, ...args) => [key, ...args].join(':'), number: String, locale: () => 'en', date: String },
    store: { loadCountries: async () => ({ byBeer: {}, counts: {} }) },
    fetch: { fetchDirect: async () => ({ data: { hasData: true, pageOwner: 'anne', breweries: [], countries: [], styles: [] } }) },
    progress: { hideTask() {} },
    views: { renderKpis() {} },
    charts: { lineChart() {} },
    yearsView: { state, setFriend() {} },
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
  state.friend = { name: 'anne', history: { beers: [beer(2, 4.25), beer(3, 3)] } };
  document.dispatchEvent(new document.defaultView.Event('dfu:friend-history'));
  const lists = () => [...cols().querySelectorAll('.cmp-col')].map(col => [...col.querySelectorAll('li a')].map(a => a.textContent));
  const pick = col => document.querySelector(`#cmp-overlap [data-show="${col}"]`).click();
  assert.deepEqual(lists(), []);
  assert.match(cols().textContent, /compare_pickList/);
  pick('both');
  assert.deepEqual(lists(), [['Beer 2']]);
  assert.match(cols().querySelector('.cmp-col li').textContent, /3\.5 \/ 4\.25/);
  assert.equal(document.querySelector('[data-show="both"]').getAttribute('aria-pressed'), 'true');
  pick('me');
  assert.deepEqual(lists(), [['Beer 1']]);
  pick('them');
  assert.deepEqual(lists(), [['Beer 3']]);
  pick('them');
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
  const state = { history: { beers: mine }, friend: null };
  const DFU = {
    i18n: { t: (key, ...args) => [key, ...args].join(':'), number: String, locale: () => 'en', date: String },
    store: { loadCountries: async () => ({ byBeer: {}, counts: {} }) },
    fetch: { fetchDirect: async () => ({ data: { hasData: true, pageOwner: 'anne', breweries: [{ id: '65', name: 'A', count: 1 }], countries: [], styles: [] } }) },
    progress: { hideTask() {} },
    views: { renderKpis() {} },
    charts: { lineChart() {} },
    yearsView: {
      state, setFriend() {},
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
  state.friend = { name: 'anne', history: { beers: theirs } };
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
