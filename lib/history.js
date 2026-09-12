// Henter hele ølhistorikken side for side, med pause mellom hver, slik «Show More»-knappen gjør.
// Brukes bare når brukeren ber om det, eller for å hente det nye siden forrige gang.
(function (root) {
  const PAGE_SIZE = 25;
  const DELAY_MS = 1500;
  const MAX_PAGES = 400;
  const url = (user, offset) => `https://untappd.com/profile/more_beer/${encodeURIComponent(user)}/${offset}?sort=date`;

  const sleep = (ms, signal) => new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(id); reject(new DOMException('Avbrutt', 'AbortError')); }, { once: true });
  });

  // Untappd krever headeren «Show More»-knappen sender. Uten den svarer serveren 200 med tomt innhold.
  async function request(link, signal, xhrHeader = true) {
    const res = await fetch(link, {
      credentials: 'include', cache: 'no-store', signal,
      headers: xhrHeader ? { 'X-Requested-With': 'XMLHttpRequest' } : undefined,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // Fragmentet har samme oppbygning som ølsiden, så samme tolker leser det.
    const beers = root.DFU.parse.parseBeersPage(doc, null).recent;
    if (!beers.length && !html.trim()) throw new Error('Tomt svar fra Untappd');
    return beers;
  }

  const fetchPage = (user, offset, signal) => request(url(user, offset), signal);

  // Slår sammen kjent historikk med nye sider. Nye verdier vinner, men klokkeslett beholdes.
  function merge(known, fresh) {
    const map = new Map((known ?? []).map(b => [b.id, b]));
    for (const b of fresh) {
      const prev = map.get(b.id);
      map.set(b.id, prev ? { ...prev, ...b, firstAt: b.firstAt ?? prev.firstAt, recentAt: b.recentAt ?? prev.recentAt } : b);
    }
    return [...map.values()].sort((a, b) => String(b.first ?? '').localeCompare(String(a.first ?? '')));
  }

  // Stopper når en hel side allerede er kjent (uendret siste innsjekking), med mindre full = true.
  function pageIsKnown(beers, knownMap) {
    return beers.every(b => {
      const k = knownMap.get(b.id);
      return k && k.recent === b.recent;
    });
  }

  async function sync(user, { known = [], full = false, expected = null, onProgress, signal } = {}) {
    const knownMap = new Map(known.map(b => [b.id, b]));
    const collected = new Map();
    let offset = 0;
    let pages = 0;
    let stopped = 'end';

    try {
      while (pages < MAX_PAGES) {
        const beers = await fetchPage(user, offset, signal);
        pages++;
        for (const b of beers) collected.set(b.id, b);
        onProgress?.({
          pages, offset, fetched: collected.size, oldest: beers.at(-1)?.first ?? null,
          total: expected, done: false,
        });
        if (!beers.length || beers.length < PAGE_SIZE) break;
        if (!full && pageIsKnown(beers, knownMap)) { stopped = 'known'; break; }
        offset += PAGE_SIZE;
        await sleep(DELAY_MS, signal);
      }
    } catch (err) {
      // Ved avbrudd beholder vi sidene som allerede er hentet.
      if (err.name !== 'AbortError') throw err;
      stopped = 'aborted';
    }
    if (pages >= MAX_PAGES) stopped = 'limit';

    const beers = merge(known, [...collected.values()]);
    onProgress?.({ pages, offset, fetched: collected.size, total: expected, done: true });
    return { beers, pages, fetched: collected.size, stopped, complete: full || stopped === 'known' || pages < MAX_PAGES };
  }

  const api = { sync, merge, pageIsKnown, PAGE_SIZE, DELAY_MS };
  root.DFU = root.DFU || {};
  root.DFU.history = api;
  if (typeof module === 'object' && module.exports) module.exports = { merge, pageIsKnown, PAGE_SIZE, DELAY_MS };
})(globalThis);
