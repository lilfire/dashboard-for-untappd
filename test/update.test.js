const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compareVersions, pickAsset, checkLatest } = require('../lib/update.js');

const release = {
  tag_name: 'v1.4.0',
  html_url: 'https://github.com/lilfire/dashboard-for-untappd/releases/tag/v1.4.0',
  assets: [
    { name: 'dashboard-for-untappd-1.4.0.xpi', browser_download_url: 'https://x/ff.xpi' },
    { name: 'dashboard-for-untappd-chrome-1.4.0.zip', browser_download_url: 'https://x/chrome.zip' },
  ],
};
const fakeFetch = (body, ok = true) => async () => ({ ok, json: async () => body });

test('compareVersions', () => {
  assert.equal(compareVersions('1.3.0', '1.3.0'), 0);
  assert.ok(compareVersions('1.4.0', '1.3.0') > 0);
  assert.ok(compareVersions('1.2.10', '1.3.0') < 0);
  assert.ok(compareVersions('1.2.10', '1.2.9') > 0);
  assert.equal(compareVersions('v1.3.0', '1.3.0'), 0);
  assert.equal(compareVersions('1.3', '1.3.0'), 0);
  assert.ok(compareVersions('1.3.0.1', '1.3') > 0);
});

test('pickAsset velger fil etter nettleser', () => {
  assert.equal(pickAsset(release, true), 'https://x/ff.xpi');
  assert.equal(pickAsset(release, false), 'https://x/chrome.zip');
  assert.equal(pickAsset({ ...release, assets: [] }, true), release.html_url);
  assert.equal(pickAsset(null, false), null);
});

test('checkLatest: nyere versjon', async () => {
  const r = await checkLatest('1.3.0', false, fakeFetch(release));
  assert.deepEqual(r, { status: 'newer', latest: '1.4.0', url: 'https://x/chrome.zip', pageUrl: release.html_url });
});

test('checkLatest: allerede siste', async () => {
  const r = await checkLatest('1.4.0', true, fakeFetch(release));
  assert.equal(r.status, 'current');
  assert.equal(r.latest, '1.4.0');
});

test('checkLatest: feil', async () => {
  assert.equal((await checkLatest('1.3.0', true, fakeFetch({}, false))).status, 'error');
  assert.equal((await checkLatest('1.3.0', true, fakeFetch({}))).status, 'error');
  assert.equal((await checkLatest('1.3.0', true, async () => { throw new Error('offline'); })).status, 'error');
});
