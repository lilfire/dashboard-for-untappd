const { test } = require('node:test');
const assert = require('node:assert/strict');
const history = require('../lib/history.js');

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
