const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');

test('rating drilldown matches counts, year and boundaries and sorts highest first', async () => {
  const { document, DOMParser, CustomEvent } = parseHTML(fs.readFileSync(require.resolve('../dashboard/index.html'), 'utf8'));
  const context = vm.createContext({ document, DOMParser, CustomEvent, Intl, navigator: { language: 'nb' } });
  for (const path of ['../lib/html.js', '../lib/i18n.js', '../lib/years.js']) {
    vm.runInContext(fs.readFileSync(require.resolve(path), 'utf8'), context);
  }
  const beers = [0, 1, 3.75, 4, 5, null].map((ratingYou, i) => ({
    id: String(i), name: `Beer ${i}`, url: `/b/test/${i}`, first: '2025-01-02',
    brewery: 'Brewery', breweryUrl: i < 3 ? '/brewery/a' : '/brewery/b',
    style: i < 2 ? 'Stout' : 'IPA', ratingYou,
  }));
  beers.push({ ...beers[4], id: 'old', name: 'Previous year', first: '2024-01-02' });
  context.DFU.store = { loadHistory: async () => ({ beers, complete: true, syncedAt: 1 }) };
  context.DFU.history = {};
  vm.runInContext(fs.readFileSync(require.resolve('../dashboard/years.js'), 'utf8'), context);
  await context.DFU.yearsView.setUser('test', beers.length);
  const groups = [...document.querySelectorAll('.year-rating-dist .year-rating-detail')];
  assert.equal(groups.length, 5);
  assert.deepEqual(groups.map(g => g.querySelectorAll('li').length), [1, 1, 0, 1, 2]);
  for (const group of groups) {
    assert.equal(Number(group.querySelector('summary b').textContent), group.querySelectorAll('li').length);
    assert.equal(group.hasAttribute('open'), false);
  }
  assert.deepEqual([...groups[4].querySelectorAll('a')].map(a => a.textContent), ['Beer 4', 'Beer 3']);
  assert.equal(groups[4].querySelector('a').getAttribute('href'), 'https://untappd.com/b/test/4');
  assert.match(groups[2].textContent, /Ingen øl/);
  assert.ok(!document.querySelector('.year-rating-dist').textContent.includes('Previous year'));
  // Identical brewery names with different URLs must remain separate groups.
  const breweries = [...document.querySelectorAll('[data-ranking="breweries"] details')];
  assert.equal(breweries.length, 2);
  assert.deepEqual(breweries.map(g => [...g.querySelectorAll('a')].map(a => a.textContent)),
    [['Beer 2', 'Beer 1', 'Beer 0'], ['Beer 4', 'Beer 3', 'Beer 5']]);
  const styles = [...document.querySelectorAll('[data-ranking="styles"] details')];
  assert.deepEqual(styles.map(g => [...g.querySelectorAll('a')].map(a => a.textContent)),
    [['Beer 4', 'Beer 3', 'Beer 2', 'Beer 5'], ['Beer 1', 'Beer 0']]);
  for (const group of [...breweries, ...styles]) {
    assert.equal(Number(group.querySelector('summary b').textContent), group.querySelectorAll('li').length);
    assert.equal(group.hasAttribute('open'), false);
    assert.ok(!group.textContent.includes('Previous year'));
  }
});
