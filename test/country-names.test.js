const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NAMES } = require('../lib/continents.js');
const { localName, regionCode } = require('../lib/country-names.js');

test('Untappd country names get their Norwegian name', () => {
  assert.equal(localName('China', 'nb-NO'), 'Kina');
  assert.equal(localName('Germany', 'nb-NO'), 'Tyskland');
  assert.equal(localName('Czech Republic', 'nb-NO'), 'Tsjekkia');
  assert.equal(localName('The Gambia', 'nb-NO'), 'Gambia');
  assert.equal(localName("Côte d'Ivoire", 'nb-NO'), 'Elfenbenskysten');
  assert.equal(localName('Hong Kong', 'nb-NO'), 'Hongkong');
  assert.equal(localName("China / People's Republic of China", 'nb-NO'), 'Kina');
});

test('UK nations without an ISO code are translated by hand', () => {
  assert.equal(localName('Scotland', 'nb-NO'), 'Skottland');
  assert.equal(localName('Northern Ireland', 'nb-NO'), 'Nord-Irland');
  assert.equal(localName('England', 'nb-NO'), 'England');
});

test('English keeps the Untappd name, and unknown names pass through', () => {
  assert.equal(localName('Czech Republic', 'en-GB'), 'Czech Republic');
  assert.equal(localName('Atlantis', 'nb-NO'), 'Atlantis');
  assert.equal(localName(undefined, 'nb-NO'), undefined);
});

test('every country known to the continent list resolves to a region', () => {
  const subregions = new Set(['England', 'Scotland', 'Wales', 'Northern Ireland']);
  const missing = Object.values(NAMES).flat().filter(name => !subregions.has(name) && !regionCode(name));
  assert.deepEqual(missing, []);
});
