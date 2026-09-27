// Ser etter nyere versjon på GitHub Releases. Kjøres bare når brukeren ber om det.
// Rene funksjoner (fetch kan byttes ut), så de kan testes i Node.
(function (root) {
  const LATEST_URL = 'https://api.github.com/repos/lilfire/dashboard-for-untappd/releases/latest';

  const parts = v => String(v).trim().replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);

  // Negativ når a er eldre enn b, 0 når like, positiv når a er nyere.
  function compareVersions(a, b) {
    const pa = parts(a), pb = parts(b);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] ?? 0) - (pb[i] ?? 0);
      if (d) return d;
    }
    return 0;
  }

  // Firefox får den signerte .xpi-en, Chromium-nettlesere zip-en. Ellers: selve release-siden.
  function pickAsset(release, isFirefox) {
    const assets = release?.assets ?? [];
    const match = isFirefox
      ? a => /\.xpi$/i.test(a.name)
      : a => /-chrome-.*\.zip$/i.test(a.name);
    return assets.find(match)?.browser_download_url ?? release?.html_url ?? null;
  }

  async function checkLatest(current, isFirefox, fetchFn = root.fetch) {
    try {
      const res = await fetchFn(LATEST_URL, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
      if (!res.ok) return { status: 'error' };
      const release = await res.json();
      const latest = String(release.tag_name ?? '').replace(/^v/i, '');
      if (!latest) return { status: 'error' };
      const status = compareVersions(latest, current) > 0 ? 'newer' : 'current';
      return { status, latest, url: pickAsset(release, isFirefox), pageUrl: release.html_url ?? null };
    } catch {
      return { status: 'error' };
    }
  }

  const api = { compareVersions, pickAsset, checkLatest, LATEST_URL };
  root.DFU = root.DFU || {};
  root.DFU.update = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
