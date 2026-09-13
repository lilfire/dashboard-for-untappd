// Henting av Untappd-sider fra utvidelsens egne sider (dashbord/diagnose).
// Kjøres i siden og ikke i bakgrunnen, fordi Chromes service worker mangler DOMParser.
(function (root) {
  const BASE = 'https://untappd.com';

  async function getDocument(url, xhr = false) {
    const res = await fetch(url, {
      credentials: 'include', cache: 'no-store',
      headers: xhr ? { 'X-Requested-With': 'XMLHttpRequest' } : undefined,
    });
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

  // Les vennelisten med samme innlogging som resten av dashbordet.
  async function fetchFriends(username, { onProgress } = {}) {
    const user = encodeURIComponent(username);
    const friends = new Map();
    let expected = null;
    try {
      for (let offset = 0; ; offset += 25) {
        const url = offset === 0 ? `${BASE}/user/${user}/friends` : `${BASE}/friend/more_friends/${user}/${offset}?sort=`;
        const { doc, meta } = await getDocument(url, offset > 0);
        if (root.DFU.parse.detectChallenge(doc)) throw new Error('friends_challenge');
        if (meta.status !== 200) throw new Error(`HTTP ${meta.status}`);
        // AJAX-sidene er HTML-fragmenter uten navigasjon og logout-lenke.
        if ((offset === 0 && !root.DFU.parse.isLoggedIn(doc)) ||
            /\/(?:login|signin)(?:[/?#]|$)/.test(meta.finalUrl || '') ||
            doc.querySelector('input[type="password"]')) throw new Error('friends_logged_out');
        if (offset === 0) {
          const total = doc.querySelector('.stats a[href$="/friends"] .stat')?.textContent;
          if (total != null && /\d/.test(total)) expected = Number(total.replace(/[^\d]/g, ''));
        }
        const content = doc.querySelector('.main, main, #main') || doc.body;
        const page = readFriends(content, username);
        const before = friends.size;
        for (const friend of page) friends.set(friend.username.toLowerCase(), friend);
        onProgress?.(friends.size);
        if (expected != null && friends.size >= expected) break;
        if (page.length < 25) {
          if (expected != null && friends.size < expected) throw new Error('friends_incomplete');
          break;
        }
        if (friends.size === before) throw new Error('friends_pagination_stalled');
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    } catch (err) {
      if (!friends.size) throw err;
      return { friends: [...friends.values()], partial: true, error: err.message };
    }
    return { friends: [...friends.values()], partial: false };
  }

  function readFriends(content, username) {
    const friends = new Map();
    for (const a of content.querySelectorAll('a[href]')) {
        if (a.closest('nav, header, .sidebar, .user-info')) continue;
        const href = new URL(a.getAttribute('href'), BASE);
        const match = href.origin === BASE && href.pathname.match(/^\/user\/([^/]+)\/?$/);
        const name = a.textContent.replace(/\s+/g, ' ').trim();
        if (!match || !name) continue;
        const user = decodeURIComponent(match[1]);
        if (user.toLowerCase() === username.toLowerCase()) continue;
        const key = user.toLowerCase();
        if (!friends.has(key) || friends.get(key).name === user) friends.set(key, { username: user, name });
      }
    return [...friends.values()];
  }

  // Reserve: bakgrunnen åpner siden i en fane, innholdsskriptet leser den.
  function fetchViaTab(username) {
    return root.DFU.api.runtime.sendMessage({ type: 'dfu:fetch-via-tab', url: beersUrl(username) });
  }

  root.DFU = root.DFU || {};
  root.DFU.fetch = { detectUser, fetchDirect, fetchFriends, readFriends, fetchViaTab, beersUrl };
})(globalThis);
