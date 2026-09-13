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
