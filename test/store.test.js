const { test } = require('node:test');
const assert = require('node:assert/strict');
const store = require('../lib/store.js');

const data = ({ unique = 3, breweries = [['1', 'A', 2], ['2', 'B', 1]], recent = [] } = {}) => ({
  stats: { unique, total: unique + 1 },
  breweries: breweries.map(([id, name, count]) => ({ id, name, count })),
  countries: [{ id: 'no', name: 'Norway', count: unique }],
  styles: [{ id: 's', name: 'IPA', count: unique }],
  recent,
});

test('uendrede data erstatter siste øyeblikksbilde', () => {
  let s = store.addSnapshot(null, { at: 1, via: 'direct', data: data() });
  s = store.addSnapshot(s, { at: 2, via: 'direct', data: data() });
  assert.equal(s.snapshots.length, 1);
  assert.equal(s.snapshots[0].at, 2);
});

test('endrede data legger til nytt og holder maks antall', () => {
  let s = null;
  for (let i = 0; i < store.MAX_SNAPSHOTS + 5; i++) {
    s = store.addSnapshot(s, { at: i, via: 'direct', data: data({ unique: 3 + i, breweries: [['1', 'A', 3 + i]] }) });
  }
  assert.equal(s.snapshots.length, store.MAX_SNAPSHOTS);
  assert.equal(s.snapshots.at(-1).data.stats.unique, 3 + store.MAX_SNAPSHOTS + 4);
});

test('daglige totaltall', () => {
  const at = new Date(2026, 8, 11, 12).getTime();
  const s = store.addSnapshot(null, { at, via: 'direct', data: data() });
  assert.deepEqual(s.daily['2026-09-11'], { unique: 3, total: 4, breweries: 2, countries: 1, styles: 1 });
});

test('diff finner nye og økte', () => {
  const d = store.diff(data(), data({ unique: 6, breweries: [['1', 'A', 4], ['2', 'B', 1], ['3', 'C', 1]] }));
  assert.equal(d.unique, 3);
  assert.deepEqual(d.breweries.added.map(x => x.name), ['C']);
  assert.deepEqual(d.breweries.increased.map(x => [x.name, x.delta]), [['A', 2]]);
});

test('latestChange sammenligner de to siste', () => {
  let s = store.addSnapshot(null, { at: 1, via: 'direct', data: data() });
  assert.equal(store.latestChange(s), null);
  s = store.addSnapshot(s, { at: 5, via: 'visit', data: data({ unique: 4, breweries: [['1', 'A', 2], ['2', 'B', 2]] }) });
  const c = store.latestChange(s);
  assert.equal(c.since, 1);
  assert.equal(c.breweries.increased.length, 1);
});

test('fillTimes henter klokkeslett fra forrige øyeblikksbilde', () => {
  const prev = data({ recent: [{ firstCheckinId: '9', firstAt: '2026-09-03T21:16:28.000Z', recentCheckinId: '9', recentAt: '2026-09-03T21:16:28.000Z' }] });
  const cur = data({ recent: [{ firstCheckinId: '9', firstAt: null, recentCheckinId: '9', recentAt: null }] });
  const filled = store.fillTimes(cur, prev);
  assert.equal(filled.recent[0].firstAt, '2026-09-03T21:16:28.000Z');
  assert.equal(filled.recent[0].recentAt, '2026-09-03T21:16:28.000Z');
});
