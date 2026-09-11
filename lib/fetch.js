// Henting av Untappd-sider fra utvidelsens egne sider (dashbord/diagnose).
// Kjøres i siden og ikke i bakgrunnen, fordi Chromes service worker mangler DOMParser.
(function (root) {
  const BASE = 'https://untappd.com';

  async function getDocument(url) {
    const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return {
      doc,
      meta: {
        status: res.status,
        finalUrl: res.url,
        redirected: res.redirected,
        bytes: html.length,
        cfMitigated: res.headers.get('cf-mitigated'),
      },
    };
  }

  // Finner hvem som er innlogget på Untappd i denne nettleseren.
  async function detectUser() {
    const { doc, meta } = await getDocument(`${BASE}/`);
    return {
      ...meta,
      loggedIn: root.DFU.parse.isLoggedIn(doc),
      user: root.DFU.parse.parseLoggedInUser(doc),
      challenge: root.DFU.parse.detectChallenge(doc),
    };
  }

  function beersUrl(username) {
    return `${BASE}/user/${encodeURIComponent(username)}/beers`;
  }

  // Direkte henting: rask og usynlig.
  async function fetchDirect(username) {
    const { doc, meta } = await getDocument(beersUrl(username));
    return { ...meta, data: root.DFU.parse.parseBeersPage(doc, meta.finalUrl) };
  }

  // Reserve: bakgrunnen åpner siden i en fane, innholdsskriptet leser den.
  function fetchViaTab(username) {
    return root.DFU.api.runtime.sendMessage({ type: 'dfu:fetch-via-tab', url: beersUrl(username) });
  }

  root.DFU = root.DFU || {};
  root.DFU.fetch = { detectUser, fetchDirect, fetchViaTab, beersUrl };
})(globalThis);
