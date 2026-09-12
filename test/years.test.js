const { test } = require('node:test');
const assert = require('node:assert/strict');
const years = require('../lib/years.js');

const beer = (id, first, o = {}) => ({
  id: String(id), name: o.name ?? `Beer ${id}`, brewery: o.brewery ?? 'Bryggeri A', breweryUrl: o.breweryUrl ?? `/${o.brewery ?? 'BryggeriA'}`,
  style: o.style ?? 'IPA - American', ratingYou: o.ratingYou ?? null, ratingGlobal: o.ratingGlobal ?? null,
  abv: o.abv ?? null, first, firstAt: `${first}T18:00:00.000Z`, recent: first, checkins: o.checkins ?? 1,
});

const data = [
  beer(1, '2024-03-05', { ratingYou: 4, ratingGlobal: 3.5, abv: 6 }),
  beer(2, '2024-11-20', { brewery: 'Bryggeri B', breweryUrl: '/B', style: 'Stout - Imperial / Double', ratingYou: 3, ratingGlobal: 3.8, abv: 11 }),
  beer(3, '2025-01-02', { ratingYou: 5, ratingGlobal: 4.1, abv: 8 }),
  beer(4, '2025-01-31', { brewery: 'Bryggeri C', breweryUrl: '/C', style: 'Lager - Pale', ratingYou: 2, ratingGlobal: 3.2, abv: 4.7 }),
  beer(5, '2025-06-14', { brewery: 'Bryggeri B', breweryUrl: '/B', ratingYou: 4.5, ratingGlobal: 3.9, abv: 7.2 }),
  beer(6, '2025-06-15', { style: 'Lager - Pale', abv: 5 }),
  { id: '7', name: 'Uten dato', brewery: 'X', style: 'IPA - American', first: null },
];

test('bygger år sortert nyest først', () => {
  const { years: y, total, skipped } = years.buildYears(data);
  assert.deepEqual(y.map(x => x.year), [2025, 2024]);
  assert.equal(total, 6);
  assert.equal(skipped, 1, 'øl uten dato hoppes over');
});

test('teller nye øl, bryggerier og stiler per år', () => {
  const [y2025, y2024] = years.buildYears(data).years;
  assert.equal(y2024.beers, 2);
  assert.equal(y2024.breweries, 2, 'A og B er nye i 2024');
  assert.deepEqual(y2024.newStyles, ['IPA - American', 'Stout - Imperial / Double']);
  assert.equal(y2025.beers, 4);
  assert.equal(y2025.breweries, 1, 'bare C er ny i 2025');
  assert.deepEqual(y2025.newStyles, ['Lager - Pale']);
});

test('rangeringer, alkohol og topplister', () => {
  const [y2025] = years.buildYears(data).years;
  assert.equal(y2025.ratedCount, 3);
  assert.equal(y2025.avgRating, 3.83);
  assert.equal(y2025.generosity, 0.1, 'snitt av din rangering minus global: (0,9 − 1,2 + 0,6) / 3');
  assert.equal(y2025.strongest.abv, 8);
  assert.deepEqual(y2025.topRated.map(b => b.id), ['3', '5', '4']);
  assert.deepEqual(y2025.lowestRated.map(b => b.id), ['4', '5', '3']);
  assert.equal(y2025.topStyles[0].count, 2);
  assert.equal(y2025.topBreweries[0].name, 'Bryggeri A');
});

test('måneder og ukedager', () => {
  const [y2025] = years.buildYears(data).years;
  assert.equal(y2025.months[0], 2, 'to øl i januar');
  assert.equal(y2025.months[5], 2, 'to øl i juni');
  assert.equal(y2025.busiestMonth, 0);
  assert.equal(y2025.weekdays.reduce((a, b) => a + b, 0), 4);
  assert.equal(y2025.firstBeer.id, '3');
  assert.equal(y2025.lastBeer.id, '6');
});

test('sammenligner ett år mellom to personer', () => {
  const mine = [beer(1, '2025-02-01'), beer(2, '2025-03-01')];
  const theirs = [beer(2, '2025-04-01'), beer(9, '2025-05-01')];
  const c = years.compareYear(mine, theirs);
  assert.deepEqual(c.both.map(b => b.id), ['2']);
  assert.deepEqual(c.onlyMine.map(b => b.id), ['1']);
  assert.deepEqual(c.onlyTheirs.map(b => b.id), ['9']);
});

test('tåler tom historikk', () => {
  assert.deepEqual(years.buildYears([]).years, []);
  assert.deepEqual(years.buildYears(null).years, []);
});
