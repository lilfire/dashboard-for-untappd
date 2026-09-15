const { test } = require('node:test');
const assert = require('node:assert/strict');
const history = require('../lib/history.js');
const vm = require('node:vm');
const fs = require('node:fs');

function countryHistory(pages) {
  const DFU = { parse: { parseBeersPage: doc => ({ recent: doc }) } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../lib/history.js'), 'utf8'), {
    DFU, DOMException,
    DOMParser: class { parseFromString(html) { return JSON.parse(html); } },
    fetch: async () => {
      const page = pages.shift();
      if (page instanceof Error) throw page;
      return { ok: true, text: async () => JSON.stringify(page) };
    },
    setTimeout: fn => { queueMicrotask(fn); return 1; }, clearTimeout() {},
  });
  return DFU.history;
}

test('country checkpoints preserve finished countries when a later request is aborted', async () => {
  const checkpoints = [];
  const api = countryHistory([[{ id: '1' }], new DOMException('Stopped', 'AbortError')]);
  const result = await api.syncCountries('me', {
    countries: [{ id: 'no', name: 'Norway', count: 1 }, { id: 'se', name: 'Sweden', count: 1 }],
    onCheckpoint: async data => checkpoints.push(JSON.parse(JSON.stringify(data))),
  });
  assert.equal(result.stopped, 'aborted');
  assert.deepEqual(checkpoints, [{ byBeer: { '1': 'Norway' }, counts: { no: 1 } }]);
  assert.equal(result.counts.no, 1);
  assert.equal(result.counts.se, undefined);
});

test('country pages are checkpointed before the entire country is finished', async () => {
  const checkpoints = [];
  const api = countryHistory([Array.from({ length: 25 }, (_, id) => ({ id: String(id + 1) })), new DOMException('Stopped', 'AbortError')]);
  const result = await api.syncCountries('me', {
    countries: [{ id: 'no', name: 'Norway', count: 30 }],
    onCheckpoint: async data => checkpoints.push(data),
  });
  assert.equal(result.stopped, 'aborted');
  assert.equal(Object.keys(checkpoints[0].byBeer).length, 25);
  assert.equal(Object.keys(checkpoints[0].counts).length, 0);
});

const beer = (id, first, recent = first, extra = {}) => ({ id: String(id), name: `Beer ${id}`, first, recent, ...extra });

test('merge legger til nye og beholder klokkeslett', () => {
  const known = [beer(1, '2024-01-01', '2024-01-01', { firstAt: '2024-01-01T18:00:00.000Z', ratingYou: 4 })];
  const fresh = [beer(1, '2024-01-01', '2026-02-02'), beer(2, '2026-03-03')];
  const merged = history.merge(known, fresh);
  assert.equal(merged.length, 2);
  const first = merged.find(b => b.id === '1');
  assert.equal(first.recent, '2026-02-02', 'nye verdier vinner');
  assert.equal(first.firstAt, '2024-01-01T18:00:00.000Z', 'klokkeslett beholdes');
  assert.equal(first.ratingYou, 4, 'felt som mangler i fragmentet beholdes');
});

test('merge sorterer nyest først', () => {
  const merged = history.merge([], [beer(1, '2020-05-05'), beer(2, '2026-01-01'), beer(3, '2023-07-07')]);
  assert.deepEqual(merged.map(b => b.id), ['2', '3', '1']);
});

test('merge takler tom kjent historikk og duplikater', () => {
  const merged = history.merge(null, [beer(1, '2026-01-01'), beer(1, '2026-01-01', '2026-06-06')]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].recent, '2026-06-06');
});

test('pageIsKnown stopper bare når hele siden er uendret', () => {
  const known = new Map([['1', beer(1, '2024-01-01')], ['2', beer(2, '2024-02-02')]]);
  assert.equal(history.pageIsKnown([beer(1, '2024-01-01'), beer(2, '2024-02-02')], known), true);
  assert.equal(history.pageIsKnown([beer(1, '2024-01-01'), beer(3, '2026-01-01')], known), false, 'ukjent øl');
  assert.equal(history.pageIsKnown([beer(1, '2024-01-01', '2026-09-09')], known), false, 'ny innsjekking på kjent øl');
});

test('pagesFor counts at least one page per country', () => {
  assert.equal(history.pagesFor([]), 0);
  assert.equal(history.pagesFor([{ count: 0 }, { count: 25 }, { count: 26 }, {}]), 1 + 1 + 2 + 1);
});

function checkinHistory(respond) {
  const requests = [];
  const DFU = { parse: { parseCheckinFeed: doc => doc } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../lib/history.js'), 'utf8'), {
    DFU, DOMException,
    DOMParser: class { parseFromString(html) { return JSON.parse(html); } },
    fetch: async (url, options) => {
      requests.push({ url, xhr: options.headers?.['X-Requested-With'] });
      return { ok: true, text: async () => JSON.stringify(respond(url)) };
    },
    setTimeout: fn => { queueMicrotask(fn); return 1; }, clearTimeout() {},
  });
  return { api: DFU.history, requests };
}

const checkin = (id, user, date, beerId = '10') => ({ id: String(id), user, beerId, date });
const repeated = { id: '10', url: '/b/x/10', first: '2020-06-01', recent: '2024-06-01', firstCheckinId: '100', recentCheckinId: '900', checkins: 4 };

test('syncCheckins pages the beer feed for your own check-ins between first and latest', async () => {
  const { api, requests } = checkinHistory(url => (url.includes('/1900?')
    ? [checkin(900, 'Me', '2024-06-01'), checkin(700, 'me', '2023-02-01'), checkin(650, 'Me', '2022-01-01', '11')]
    : [checkin(500, 'Me', '2021-12-31'), checkin(100, 'Me', '2020-06-01')]));
  const res = await api.syncCheckins('me', { beers: [repeated], self: true });
  assert.equal(res.complete, true);
  assert.deepEqual(JSON.parse(JSON.stringify(res.dates)), { 10: ['2020-06-01', '2021-12-31', '2023-02-01', '2024-06-01'] });
  assert.deepEqual(requests.map(r => r.url), [
    'https://untappd.com/beer/more_feed/10/1900?filter=you',
    'https://untappd.com/beer/more_feed/10/650?filter=you',
  ]);
  assert.ok(requests.every(r => r.xhr === 'XMLHttpRequest'));
});

test('syncCheckins filters friends by username and falls back to the profile feed for non-friends', async () => {
  const other = { ...repeated, id: '20', url: '/b/y/20', firstCheckinId: '300', recentCheckinId: '800', checkins: 3 };
  const { api, requests } = checkinHistory(url => {
    if (url.includes('/beer/more_feed/10/')) return [checkin(900, 'Venn', '2024-06-01'), checkin(600, 'Venn', '2022-03-03'), checkin(400, 'Annen', '2021-01-01'), checkin(100, 'Venn', '2020-06-01')];
    if (url.includes('/beer/more_feed/20/')) return [checkin(750, 'Annen', '2023-01-01', '20'), checkin(200, 'Annen', '2019-01-01', '20')];
    return [checkin(800, 'venn', '2024-01-01', '20'), checkin(500, 'Venn', '2022-05-05', '20'), checkin(300, 'Venn', '2021-01-01', '20')];
  });
  const res = await api.syncCheckins('Venn', { beers: [{ ...repeated, checkins: 3 }, other] });
  assert.deepEqual(JSON.parse(JSON.stringify(res.dates)), { 10: ['2020-06-01', '2022-03-03', '2024-06-01'], 20: ['2020-06-01', '2022-05-05', '2024-06-01'] });
  assert.equal(res.complete, true);
  assert.equal(requests.at(-1).url, 'https://untappd.com/profile/more_feed/Venn/1800?v2=true');
});

test('syncCheckins leaves beers out when the count does not match', async () => {
  const { api } = checkinHistory(() => [checkin(900, 'Me', '2024-06-01'), checkin(100, 'Me', '2020-06-01')]);
  const res = await api.syncCheckins('me', { beers: [repeated], self: true });
  assert.deepEqual(JSON.parse(JSON.stringify(res.dates)), {});
  assert.equal(res.complete, false);
});

function badgeHistory(pages, urls) {
  const DFU = {
    badges: require('../lib/badges.js'),
    parse: { parseBadges: doc => doc.items, parseBadgeCounts: doc => doc.counts ?? {}, parseBadgeListOwn: doc => doc.own ?? false },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../lib/history.js'), 'utf8'), {
    DFU, DOMException,
    DOMParser: class { parseFromString(json) { const page = JSON.parse(json); return { ...page, querySelector: () => ({}) }; } },
    fetch: async url => {
      urls.push(url);
      const page = pages.shift();
      if (page instanceof Error) throw page;
      return { ok: true, text: async () => JSON.stringify(page) };
    },
    setTimeout: fn => { queueMicrotask(fn); return 1; }, clearTimeout() {},
  });
  return DFU.history;
}

const badgeItem = (id, name = `Merke ${id}`) => ({ id: String(id), name, base: name, level: null, next: false, retired: false, date: '2026-01-01' });

test('syncBadges henter spesialfilteret og så alle merker, side for side', async () => {
  const urls = [];
  const special = [badgeItem(1, 'Event')];
  const all = Array.from({ length: 52 }, (_, i) => badgeItem(100 + i));
  const api = badgeHistory([{ items: special, counts: { all: 55, special: 1 }, own: true }, { items: all, counts: { all: 55 }, own: true }, { items: [badgeItem(2), badgeItem(3), badgeItem(1, 'Event')] }], urls);
  const res = await api.syncBadges('Meg', {});
  assert.deepEqual(urls, [
    'https://untappd.com/user/Meg/badges?segment=special',
    'https://untappd.com/user/Meg/badges',
    'https://untappd.com/profile/more_badges/Meg/52?sort=unlocked&segment=all',
  ]);
  assert.equal(res.complete, true);
  assert.equal(res.badges.length, 55);
  assert.equal(res.badges.find(b => b.id === '1').special, true, 'spesialflagget overlever at merket kommer igjen under alle');
  assert.equal(res.counts.special, 1);
  assert.equal(res.own, true, 'egen merkeside');
});

test('syncBadges stopper på første kjente side, med mindre full = true', async () => {
  const urls = [];
  const known = Array.from({ length: 52 }, (_, i) => badgeItem(i + 1));
  const api = badgeHistory([{ items: known }, { items: known }], urls);
  const res = await api.syncBadges('Meg', { known });
  assert.equal(urls.length, 2, 'én side per filter');
  assert.equal(res.stopped, 'end');
  assert.equal(api.badgePagesFor(2235, 189), 43 + 4);
});
