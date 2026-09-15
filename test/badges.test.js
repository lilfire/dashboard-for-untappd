const { test } = require('node:test');
const assert = require('node:assert/strict');
const badges = require('../lib/badges.js');

const badge = (id, name, o = {}) => ({
  id: String(id), name, base: name.replace(/\s*\(Level \d+\)$/, ''), image: null,
  level: o.level ?? null, next: o.next ?? false, retired: o.retired ?? false, date: 'date' in o ? o.date : '2026-01-01',
  ...(o.special ? { special: true } : {}),
});

test('maks nivå: nivåboks uten neste nivå, og ikke pensjonert', () => {
  assert.equal(badges.isMaxed(badge(1, 'Pioneer (Level 100)', { level: 100 })), true);
  assert.equal(badges.isMaxed(badge(2, 'Hjemme (Level 3)', { level: 3, next: true })), false, 'kan gå videre');
  assert.equal(badges.isMaxed(badge(3, 'Lokalt', { next: true })), false, 'nivå 1 har ingen nivåboks');
  assert.equal(badges.isMaxed(badge(4, 'Gammel (Level 5)', { level: 5, retired: true })), false, 'pensjonert: ukjent om maks');
  assert.equal(badges.isMaxed(badge(5, 'Newbie')), false);
});

test('spesialmerker: fra spesialfilteret, uten nivå som kan tas videre', () => {
  assert.equal(badges.isSpecial(badge(1, 'IPA Day (2024)', { special: true, retired: true })), true);
  assert.equal(badges.isSpecial(badge(2, 'Hjemme (Level 3)', { special: true, level: 3, next: true })), false);
  assert.equal(badges.isSpecial(badge(3, 'Kampanje', { special: true, next: true })), false, 'nivå 1 av et nivåmerke');
  assert.equal(badges.isSpecial(badge(4, 'Newbie')), false, 'ikke i spesialfilteret');
});

test('merge: nytt nivå erstatter det forrige, og spesialflagget beholdes', () => {
  const known = badges.merge([], [badge(1, 'Hjemme (Level 3)', { level: 3, next: true, date: '2025-01-01' })], { special: true });
  const merged = badges.merge(known, [
    badge(9, 'Hjemme (Level 4)', { level: 4, next: true, date: '2026-02-01' }),
    badge(8, 'Newbie', { date: '2015-03-03' }),
  ]);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map(b => b.id), ['9', '8'], 'nyeste først');
  assert.equal(merged[0].special, true, 'spesialflagget fra forrige henting beholdes');
  assert.equal(merged[1].special, false);
  assert.equal(badges.merge([], [badge(7, 'Lagret', { special: true })])[0].special, true, 'flagget på merket selv beholdes');
});

test('pageIsKnown ser på ID, så et nytt nivå regnes som nytt', () => {
  const known = [badge(1, 'A'), badge(2, 'B (Level 2)', { level: 2 })];
  assert.equal(badges.pageIsKnown([badge(1, 'A'), badge(2, 'B (Level 2)')], known), true);
  assert.equal(badges.pageIsKnown([badge(1, 'A'), badge(3, 'B (Level 3)')], known), false);
  assert.equal(badges.pageIsKnown([], known), false);
});

test('showcase, grupper etter år og merker i ett år', () => {
  const list = [
    badge(1, 'Pioneer (Level 100)', { level: 100, date: '2026-08-28' }),
    badge(2, 'IPA Day (2024)', { special: true, retired: true, date: '2024-08-07' }),
    badge(3, 'Festival', { special: true, date: '2026-06-01' }),
    badge(4, 'Hjemme (Level 3)', { level: 3, next: true }),
    badge(5, 'Udatert', { special: true, date: null }),
  ];
  const { maxed, special } = badges.showcase(list);
  assert.deepEqual(maxed.map(b => b.id), ['1']);
  assert.deepEqual(special.map(b => b.id), ['3', '2', '5']);
  assert.deepEqual(badges.groupByYear(special).map(g => g.year), [2026, 2024, null]);
  const y = badges.inYear(list, 2026);
  assert.deepEqual([y.maxed.length, y.special.length], [1, 1]);
});

test('andres merker: nivå 100 er maks, eller samme nivå som ditt eget maks', () => {
  const reference = badges.maxLevels([badge(1, 'Liten (Level 20)', { level: 20 }), badge(2, 'Midt (Level 7)', { level: 7, next: true })]);
  assert.deepEqual([...reference], [['liten', 20]]);
  const opts = { nextKnown: false, reference };
  assert.equal(badges.isMaxed(badge(3, 'Pioneer (Level 100)', { level: 100 }), opts), true);
  assert.equal(badges.isMaxed(badge(4, 'Hjemme (Level 47)', { level: 47 }), opts), false);
  assert.equal(badges.isMaxed(badge(5, 'Liten (Level 20)', { level: 20 }), opts), true, 'merket stopper på 20 hos deg');
  assert.equal(badges.isMaxed(badge(6, 'Midt (Level 7)', { level: 7 }), opts), false, 'du kan selv gå videre');
  assert.equal(badges.isMaxed(badge(7, 'Gammel (Level 100)', { level: 100, retired: true }), opts), false);
});

test('compare: felles, bare du og bare vennen, med hvem som var først og den andres nivå', () => {
  const mine = [
    badge(1, 'Pioneer (Level 100)', { level: 100, date: '2026-08-01' }),
    badge(2, 'Hjemme (Level 100)', { level: 100, date: '2025-01-01' }),
    badge(3, 'Bar (Level 12)', { level: 12, next: true }),
    badge(4, 'IPA Day (2024)', { special: true, retired: true, date: '2024-08-07' }),
    badge(5, 'Festival', { special: true, date: '2026-06-01' }),
  ];
  const theirs = [
    badge(11, 'Pioneer (Level 100)', { level: 100, date: '2025-02-01' }),
    badge(12, 'Hjemme (Level 47)', { level: 47 }),
    badge(13, 'Bar (Level 100)', { level: 100 }),
    badge(14, 'IPA Day (2024)', { special: true, retired: true, date: '2024-08-07' }),
    badge(15, 'Kampanje', { special: true }),
  ];
  const c = badges.compare(mine, theirs);
  assert.deepEqual(c.maxed.both.map(x => [x.name, x.first]), [['Pioneer', 'them']]);
  assert.deepEqual(c.maxed.onlyMe.map(x => [x.id, x.other?.level]), [['2', 47]]);
  assert.deepEqual(c.maxed.onlyThem.map(x => [x.id, x.other?.level]), [['13', 12]]);
  assert.deepEqual(c.special.both.map(x => [x.name, x.first]), [['IPA Day (2024)', 'same']]);
  assert.deepEqual(c.special.onlyMe.map(x => x.id), ['5']);
  assert.deepEqual(c.special.onlyThem.map(x => [x.id, x.other]), [['15', null]]);
});
