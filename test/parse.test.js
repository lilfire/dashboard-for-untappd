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

test('tolker merkelisten', () => {
  const doc = docOf(fixture('sample-badges.html'));
  const list = parse.parseBadges(doc);
  assert.equal(list.length, 8);
  assert.equal(parse.parseBadgeListOwn(doc), true);
  const byId = Object.fromEntries(list.map(b => [b.id, b]));
  assert.deepEqual(byId['9010'], {
    id: '9010', name: 'Testbryggeri Pioneer (Level 100)', base: 'Testbryggeri Pioneer',
    image: 'https://assets.untappd.com/badges/pioneer_lg.jpg', level: 100, next: false, retired: false, date: '2026-08-28',
  });
  assert.deepEqual([byId['9009'].level, byId['9009'].next], [3, true]);
  assert.deepEqual([byId['9001'].level, byId['9001'].next, byId['9001'].date], [null, true, '2023-11-30']);
  assert.equal(byId['9008'].name, 'Festival & Fanatic');
  assert.deepEqual([byId['9007'].retired, byId['9007'].level], [true, null]);
  assert.equal(byId['9005'].image, null, 'bilder utenfor untappd.com tas ikke med');
  assert.equal(byId['9005'].date, '2015-03-03', 'kort månedsnavn');
  assert.equal(byId['9004'].date, '2026-06-04', 'datoformatet fra andres sider');
  assert.deepEqual(parse.parseBadgeCounts(doc), { all: 7, beer: 4, special: 3 });
});

test('merkelisten til en venn: annen overskrift og ingen «neste nivå»', () => {
  const doc = docOf(`<div class="box"><div class="content"><div class="header"><h3>Test User's Badges</h3></div>
    <div class="badges"><div class="item badge-item not-retired level">
      <a href="/user/Venn/badges/77"><div class="level-box">100</div><img src="https://assets.untappd.com/b.jpg">
      <p class="name">Pioneer (Level 100)</p><p class="date time">Fri, 23 Sep 2022 20:23:01 +0000</p></a></div></div></div></div>`);
  assert.equal(parse.parseBadgeListOwn(doc), false);
  const [b] = parse.parseBadges(doc);
  assert.deepEqual([b.level, b.next, b.date], [100, false, '2022-09-23']);
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

test('«Their Rating» på en annen brukers side teller som sideeierens rangering', () => {
  const html = `<div class="beer-item" data-bid="77"><div class="beer-details">
      <p class="name"><a href="/b/x/77">Vennens øl</a></p><p class="brewery"><a href="/w/y/1">Bryggeri</a></p>
      <p class="style">IPA - American</p>
      <div class="ratings">
        <div class="you"><p>Their Rating (4)</p><div class="caps" data-rating="4"></div></div>
        <div class="you"><p>Global Rating (3.83)</p><div class="caps" data-rating="3.83"></div></div>
      </div></div>
      <div class="details"><p class="abv">6% ABV</p><p class="ibu">N/A IBU</p>
      <p class="date"> First: <a href="/user/Venn/checkin/1/"><abbr>Fri, 10 Jan 2025 19:30:00 +0100</abbr></a> </p>
      <p class="date"> Recent: <a href="/user/Venn/checkin/1/"><abbr>Fri, 10 Jan 2025 19:30:00 +0100</abbr></a> </p>
      <p class="check-ins">Total: 1</p></div></div>`;
  const [beer] = parse.parseBeersPage(docOf(html)).recent;
  assert.equal(beer.ratingYou, 4, 'vennens egen rangering');
  assert.equal(beer.ratingGlobal, 3.83);
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

test('tolker innsjekkingslister med bruker, øl og dato', () => {
  const item = (id, user, time) => `<div class="item" id="checkin_${id}" data-checkin-id="${id}">
    <div class="avatar"><a href="/user/${user}"><img></a></div>
    <div class="checkin" id="checkin_comments_${id}"><p class="text"><a href="/user/${user}">Navn</a> is drinking a
      <a href="/b/nøisom-juleol/1796301">Juleøl</a> by <a href="/w/noisom/1">Nøisom</a></p>
      <a href="/user/${user}/checkin/${id}" class="time timezoner" data-checkin-id="${id}">${time}</a></div></div>`;
  const rows = parse.parseCheckinFeed(docOf(`<div>${item('692518830', 'Lilfire', 'Tue, 25 Dec 2018 12:47:42 +0000')}${item('539855118', 'Venn', 'nonsense')}</div>`));
  assert.equal(rows.length, 2, 'bare elementer med checkin_<tall>');
  assert.deepEqual(rows[0], { id: '692518830', user: 'Lilfire', beerId: '1796301', at: '2018-12-25T12:47:42.000Z', date: '2018-12-25' });
  assert.equal(rows[1].date, null);
});
