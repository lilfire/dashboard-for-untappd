const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseHTML } = require('linkedom');
const parse = require('../lib/parse.js');

const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const docOf = html => parseHTML(html).document;
const sum = list => list.reduce((s, x) => s + x.count, 0);

test('tolker eksempelsiden', () => {
  const d = parse.parseBeersPage(docOf(fixture('sample-beers.html')), 'https://untappd.com/user/TestUser/beers');
  assert.equal(d.hasData, true);
  assert.equal(d.loggedIn, true);
  assert.equal(d.loggedInUser, 'TestUser');
  assert.equal(d.pageOwner, 'TestUser');
  assert.equal(d.challenge, false);
  assert.deepEqual(d.stats, { total: 1012, unique: 9, badges: 42, friends: 3 });
  assert.deepEqual(d.breweries, [
    { id: '101', name: 'Eksempel Bryggeri', count: 5 },
    { id: '102', name: 'Ølverket & Co', count: 3 },
    { id: '103', name: 'Brasserie Test (Belgium)', count: 1 },
  ]);
  assert.equal(d.styles.length, 2);
  assert.equal(d.countries[0].name, 'Norway');
  for (const list of [d.breweries, d.styles, d.countries]) assert.equal(sum(list), d.stats.unique);
});

test('tolker siste øl med begge datoformater', () => {
  const [a, b] = parse.parseBeersPage(docOf(fixture('sample-beers.html'))).recent;
  assert.equal(a.id, '5001');
  assert.equal(a.name, 'Eksempel Hazy');
  assert.equal(a.brewery, 'Eksempel Bryggeri');
  assert.equal(a.ratingYou, 3.75);
  assert.equal(a.ratingGlobal, 3.90512);
  assert.equal(a.abv, 6.5);
  assert.equal(a.ibu, null);
  assert.equal(a.first, '2026-09-03');
  assert.equal(a.firstAt, '2026-09-03T21:16:28.000Z');
  assert.equal(a.firstCheckinId, '900001');
  assert.equal(a.recent, '2026-09-04');
  assert.equal(a.checkins, 2);

  assert.equal(b.ratingYou, null, 'uten egen rangering');
  assert.equal(b.ratingGlobal, 4.1);
  assert.equal(b.ibu, 60);
  assert.equal(b.first, '2026-08-30');
  assert.equal(b.firstAt, null);
});

test('utlogget side', () => {
  const d = parse.parseBeersPage(docOf('<html><head><title>Untappd</title></head><body><a href="/login">Sign In</a></body></html>'));
  assert.equal(d.loggedIn, false);
  assert.equal(d.loggedInUser, null);
  assert.equal(d.hasData, false);
  assert.deepEqual(d.breweries, []);
});

test('Cloudflare-sjekk', () => {
  const d = parse.parseBeersPage(docOf('<html><head><title>Just a moment...</title></head><body></body></html>'));
  assert.equal(d.challenge, true);
  assert.equal(d.hasData, false);
});

test('parseUntappdDate', () => {
  assert.deepEqual(parse.parseUntappdDate('Wed, 01 Jan 2025 00:30:00 +0100'), { date: '2025-01-01', at: '2024-12-31T23:30:00.000Z' });
  assert.deepEqual(parse.parseUntappdDate('12/31/19'), { date: '2019-12-31', at: null });
  assert.deepEqual(parse.parseUntappdDate('N/A'), { date: null, at: null });
});

test('tolker fragmentet fra «Show More»', () => {
  // Fragmentet har ingen nedtrekkslister, men samme ølrader – og skriver «You Rating».
  const d = parse.parseBeersPage(docOf(fixture('sample-more-beer.html')));
  assert.equal(d.hasData, false, 'fragmentet har ingen filtre');
  assert.equal(d.recent.length, 2);
  const [a, b] = d.recent;
  assert.equal(a.ratingYou, 3.5, '«You Rating» må telle som din rangering');
  assert.equal(a.ratingGlobal, 3.75);
  assert.equal(a.brewery, 'Pivovar U Fleků');
  assert.equal(a.breweryUrl, '/w/pivovar-u-fleku/6265');
  assert.equal(a.first, '2022-09-03');
  assert.equal(a.firstCheckinId, '500001');
  assert.equal(b.ratingYou, null, 'uten egen rangering');
  assert.equal(b.ratingGlobal, 3.9);
  assert.equal(b.first, '2025-01-10');
  assert.equal(b.recent, '2025-01-12');
  assert.equal(b.checkins, 2);
});

// Valgfri test mot en lagret kopi av din egen ølside (ligger i .gitignore).
const privateFixture = path.join(__dirname, 'fixtures', 'private-beers.html');
test('ekte ølside (private-beers.html)', { skip: !fs.existsSync(privateFixture) && 'ingen private-beers.html' }, () => {
  const d = parse.parseBeersPage(docOf(fs.readFileSync(privateFixture, 'utf8')));
  assert.equal(d.hasData, true);
  assert.ok(d.breweries.length > 0);
  for (const list of [d.breweries, d.styles, d.countries]) assert.equal(sum(list), d.stats.unique);
  assert.ok(d.recent.every(b => b.first && b.firstCheckinId));
});
