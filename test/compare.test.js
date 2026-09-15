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

test('beers under a shared brewery split into shared, only mine and only theirs', () => {
  const { beersFor } = compareModule();
  const years = require('../lib/years.js');
  const item = { id: '10', name: 'Brew' };
  const mine = [{ id: 1, name: 'A', brewery: 'Brew' }, { id: 2, name: 'B', brewery: 'Brew' }, { id: 9, name: 'X', brewery: 'Else' }];
  const theirs = [{ id: 2, name: 'B', brewery: 'Brew' }, { id: 3, name: 'C', brewery: 'Brew' }];
  const s = years.compareYear(beersFor('breweries', item, mine), beersFor('breweries', item, theirs));
  assert.deepEqual([s.both, s.onlyMine, s.onlyTheirs].map(l => l.map(b => b.id)), [[2], [1], [3]]);
});
