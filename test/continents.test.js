const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CONTINENTS, continentOf } = require('../lib/continents.js');

test('known Untappd country names map to a continent', () => {
  assert.equal(continentOf('Norway'), 'europe');
  assert.equal(continentOf('England'), 'europe');
  assert.equal(continentOf('United States'), 'northAmerica');
  assert.equal(continentOf('Brazil'), 'southAmerica');
  assert.equal(continentOf('Japan'), 'asia');
  assert.equal(continentOf('South Africa'), 'africa');
  assert.equal(continentOf('New Zealand'), 'oceania');
  assert.equal(continentOf("China / People's Republic of China"), 'asia');
});

test('matching ignores case, accents and surrounding space', () => {
  assert.equal(continentOf(' norway '), 'europe');
  assert.equal(continentOf('Curacao'), 'northAmerica');
  assert.equal(continentOf('Réunion'), 'africa');
});

test('unknown or missing names fall back to other', () => {
  assert.equal(continentOf('Atlantis'), 'other');
  assert.equal(continentOf(undefined), 'other');
  assert.ok(!CONTINENTS.includes('other'));
});
