const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { parseHTML } = require('linkedom');

const countries = [{ id: 'no', name: 'Norway', count: 1 }, { id: 'se', name: 'Sweden', count: 2 }];
const flush = () => new Promise(resolve => setImmediate(resolve));

async function setup(saved) {
  const { document } = parseHTML('<button id="c-sync-btn"></button><button id="c-sync-stop"></button><p id="c-sync-text"></p><div id="c-progress"><span></span></div>');
  let resolveLoad;
  const requests = [];
  const writes = [];
  const DFU = {
    i18n: { t: key => key, number: String, relative: String },
    yearsView: { state: { history: { beers: [{}] } } },
    store: {
      getSettings: async () => ({ username: 'me' }),
      load: async () => ({ snapshots: [{ data: { countries } }] }),
      loadCountries: () => new Promise(resolve => { resolveLoad = resolve; }),
      saveCountries: async (user, value) => { writes.push(value); return value; },
    },
    history: { PAGE_SIZE: 25, syncCountries: async (user, options) => {
      requests.push(options.countries.map(c => c.id));
      return { byBeer: {}, counts: {}, complete: true };
    } },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../dashboard/countries.js'), 'utf8'), {
    DFU, document, CustomEvent: document.defaultView.CustomEvent, AbortController,
  });
  await flush();
  document.dispatchEvent(new document.defaultView.CustomEvent('dfu:history'));
  assert.equal(requests.length, 0, 'must wait for stored countries before auto sync');
  resolveLoad(saved);
  await flush();
  return { requests, writes, document };
}

test('reload waits for persisted country counts and skips unchanged countries', async () => {
  const { requests, document } = await setup({ byBeer: {}, counts: { no: 1, se: 2 }, at: 1 });
  assert.equal(requests.length, 0);
  document.getElementById('c-sync-btn').click();
  await flush();
  assert.equal(requests.length, 0, 'update should also reuse unchanged countries');
});

test('reload reuses legacy beer mappings and persists recovered counts', async () => {
  const { requests, writes } = await setup({ byBeer: { 1: 'Norway', 2: 'Sweden', 3: 'Sweden' }, at: 1 });
  assert.equal(requests.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(writes[0].counts)), { no: 1, se: 2 });
});

test('reload fetches only countries with missing or changed counts', async () => {
  const { requests } = await setup({ byBeer: { 1: 'Norway', 2: 'Sweden' }, counts: { no: 1, se: 1 }, at: 1 });
  assert.deepEqual(JSON.parse(JSON.stringify(requests)), [['se']]);
});
