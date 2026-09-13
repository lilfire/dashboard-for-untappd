const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { parseHTML } = require('linkedom');

function setup(friends, cached = { friends: [], complete: false }, stats = undefined) {
  const { document } = parseHTML('<form id="cmp-form"><input id="cmp-user"><button></button></form><datalist id="cmp-friends"></datalist><p id="cmp-friends-meta"></p><p id="cmp-meta"></p><div id="cmp-kind"></div>');
  const requested = [];
  const fetches = [];
  const saved = [];
  const DFU = {
    i18n: { t: key => key, number: String },
    html: { html: () => '', render: () => {} },
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
  vm.runInNewContext(fs.readFileSync(require.resolve('../dashboard/compare.js'), 'utf8'), { DFU, document });
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
