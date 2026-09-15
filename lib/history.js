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

  // Reserve: hent sidene inne i en Untappd-fane. Da er kallet samme opphav som siden selv,
  // og vi slipper alt som kan stoppe et kall fra utvidelsens egen side.
  async function openTabSession(user) {
    const res = await root.DFU.api.runtime.sendMessage({
      type: 'dfu:history-open',
      url: `https://untappd.com/user/${encodeURIComponent(user)}/beers`,
    });
    if (!res?.ok) throw new Error(res?.reason === 'timeout' ? 'Fikk ikke kontakt med Untappd-fanen' : (res?.error ?? 'Kunne ikke åpne fane'));
    return res.tabId;
  }

  async function fetchInTab(tabId, link, kind = 'beers') {
    const res = await root.DFU.api.runtime.sendMessage({ type: 'dfu:history-page', tabId, url: link, kind });
    if (!res?.ok) throw new Error(res?.error ?? `HTTP ${res?.status ?? '?'}`);
    return (kind === 'checkins' ? res.checkins : res.beers) ?? [];
  }

  const closeTabSession = tabId => root.DFU.api.runtime.sendMessage({ type: 'dfu:history-close', tabId }).catch(() => {});

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

  async function sync(user, { known = [], full = false, expected = null, onProgress, signal, maxPages = MAX_PAGES } = {}) {
    const knownMap = new Map(known.map(b => [b.id, b]));
    const collected = new Map();
    let offset = 0;
    let pages = 0;
    let stopped = 'end';
    let tabId = null;
    let via = 'direct';

    // De 25 første ølene står på selve ølsiden. «more_beer» begynner på 25 og svarer tomt på 0.
    const linkFor = off => (off === 0 ? `https://untappd.com/user/${encodeURIComponent(user)}/beers` : url(user, off));

    // Prøver direkte først. Svarer Untappd tomt eller feiler kallet, går vi over til fane.
    const getPage = async off => {
      const link = linkFor(off);
      if (tabId != null) return fetchInTab(tabId, link);
      try {
        const beers = await request(link, signal, off !== 0);
        if (beers.length || off > 0) return beers;
      } catch (err) {
        if (err.name === 'AbortError') throw err;
      }
      tabId = await openTabSession(user);
      via = 'tab';
      return fetchInTab(tabId, link);
    };

    try {
      while (pages < maxPages) {
        const beers = await getPage(offset);
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
      if (err.name !== 'AbortError') {
        if (tabId != null) closeTabSession(tabId);
        throw err;
      }
      stopped = 'aborted';
    }
    if (tabId != null) closeTabSession(tabId);
    if (pages >= maxPages) stopped = 'limit';

    const beers = merge(known, [...collected.values()]);
    onProgress?.({ pages, offset, fetched: collected.size, total: expected, done: true });
    return { beers, pages, fetched: collected.size, stopped, via, complete: full || stopped === 'known' || pages < maxPages };
  }

  // Historikken sier ikke hvilket land et øl hører til. Eneste vei er ølsidens landfilter:
  // første side på /user/<bruker>/beers?country_id=<id>, resten på more_beer med samme parameter.
  async function syncCountries(user, { countries = [], onProgress, onCheckpoint, signal } = {}) {
    const byBeer = {};
    const counts = {};
    let tabId = null;
    let via = 'direct';
    let pages = 0;
    let stopped = 'end';

    const link = (id, off) => (off === 0
      ? `https://untappd.com/user/${encodeURIComponent(user)}/beers?country_id=${encodeURIComponent(id)}`
      : `${url(user, off)}&country_id=${encodeURIComponent(id)}`);

    const getPage = async (id, off) => {
      const target = link(id, off);
      if (tabId != null) return fetchInTab(tabId, target);
      try {
        const beers = await request(target, signal, off !== 0);
        if (beers.length || off > 0) return beers;
      } catch (err) {
        if (err.name === 'AbortError') throw err;
      }
      tabId = await openTabSession(user);
      via = 'tab';
      return fetchInTab(tabId, target);
    };

    try {
      for (const [index, country] of countries.entries()) {
        let finished = false;
        for (let off = 0; off < MAX_PAGES * PAGE_SIZE; off += PAGE_SIZE) {
          signal?.throwIfAborted();
          const beers = await getPage(country.id, off);
          pages++;
          for (const b of beers) if (b.id) byBeer[b.id] = country.name;
          onProgress?.({ index, total: countries.length, country: country.name, pages, beers: Object.keys(byBeer).length });
          finished = beers.length < PAGE_SIZE;
          if (finished) counts[country.id] = country.count ?? 0;
          await onCheckpoint?.({ byBeer: { ...byBeer }, counts: { ...counts } });
          if (finished) break;
          await sleep(DELAY_MS, signal);
        }
        if (!finished) stopped = 'limit';
        if (index < countries.length - 1) await sleep(DELAY_MS, signal);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        if (tabId != null) closeTabSession(tabId);
        throw err;
      }
      stopped = 'aborted';
    }
    if (tabId != null) closeTabSession(tabId);
    return { byBeer, counts, pages, via, stopped, complete: stopped === 'end' };
  }

  // Ølhistorikken har bare første og siste innsjekking per øl. Datoene for de andre hentes fra ølets
  // innsjekkingsliste: filter=you for egen bruker, filter=friends for en venn. Er brukeren ikke venn
  // (ingen av brukerens innsjekkinger i listen), leses profilens logg fra siste til første innsjekking.
  // Svarer med alle datoene per øl-ID, bare for øl der alle innsjekkingene ble funnet.
  const CHECKIN_SLACK = 1000;
  async function syncCheckins(user, { beers = [], self = false, onProgress, onCheckpoint, signal } = {}) {
    const dates = {};
    let tabId = null;
    let via = 'direct';
    let pages = 0;
    let stopped = 'end';
    const who = String(user).toLowerCase();

    // Tom side er et gyldig svar (slutten av listen), men ikke når vi vet at det finnes innsjekkinger.
    const getPage = async (link, xhr, expectItems) => {
      if (tabId != null) return fetchInTab(tabId, link, 'checkins');
      try {
        const res = await fetch(link, {
          credentials: 'include', cache: 'no-store', signal,
          headers: xhr ? { 'X-Requested-With': 'XMLHttpRequest' } : undefined,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const items = root.DFU.parse.parseCheckinFeed(new DOMParser().parseFromString(await res.text(), 'text/html'));
        if (items.length || !expectItems) return items;
      } catch (err) {
        if (err.name === 'AbortError') throw err;
      }
      tabId = await openTabSession(user);
      via = 'tab';
      return fetchInTab(tabId, link, 'checkins');
    };

    const range = b => ({ lo: Number(b.firstCheckinId), hi: Number(b.recentCheckinId) });
    const hasIds = b => Number.isFinite(range(b).lo) && Number.isFinite(range(b).hi) && !!b.firstCheckinId && !!b.recentCheckinId;
    // Med kjente ID-er samles bare de mellomste; datoene for første og siste står allerede i historikken.
    const take = (b, c, found) => {
      if (String(c.user ?? '').toLowerCase() !== who || !c.date || (c.beerId && c.beerId !== String(b.id))) return;
      if (hasIds(b)) {
        const id = Number(c.id);
        if (id > range(b).lo && id < range(b).hi) found.set(c.id, c.date);
      } else {
        found.set(c.id, c.date);
      }
    };
    const finish = (b, found) => {
      const need = hasIds(b) ? b.checkins - 2 : b.checkins;
      if (found.size !== need) return false;
      const middle = [...found.values()];
      dates[b.id] = (hasIds(b) ? [b.first, ...middle, b.recent] : middle).sort();
      return true;
    };
    const progress = (index, total) => onProgress?.({ index, total, pages, done: Object.keys(dates).length });

    let friendsFailed = false;
    const rest = [];
    try {
      for (const [index, b] of beers.entries()) {
        if (!hasIds(b) && !b.url) continue;
        if (!self && friendsFailed && hasIds(b)) { rest.push(b); continue; }
        const filter = self ? 'you' : 'friends';
        const found = new Map();
        let seen = false;
        let max = hasIds(b) ? range(b).hi + CHECKIN_SLACK : null;
        for (let page = 0; page < MAX_PAGES; page++) {
          signal?.throwIfAborted();
          const link = max == null
            ? `https://untappd.com${b.url}?filter=${filter}`
            : `https://untappd.com/beer/more_feed/${encodeURIComponent(b.id)}/${max}?filter=${filter}`;
          const items = await getPage(link, max != null, page === 0);
          pages++;
          for (const c of items) {
            if (String(c.user ?? '').toLowerCase() === who) seen = true;
            take(b, c, found);
          }
          progress(index, beers.length);
          const last = Number(items.at(-1)?.id);
          if (!items.length || finish(b, found) || (hasIds(b) && last <= range(b).lo)) break;
          max = last;
          await sleep(DELAY_MS, signal);
        }
        if (!dates[b.id] && !self && !seen && hasIds(b)) { friendsFailed = true; rest.push(b); }
        if (dates[b.id]) await onCheckpoint?.({ dates: { ...dates } });
        if (index < beers.length - 1) await sleep(DELAY_MS, signal);
      }

      // Profilens logg, fra den nyeste av de siste innsjekkingene og ned til den eldste første.
      if (rest.length) {
        const left = new Map(rest.map(b => [String(b.id), { b, found: new Map() }]));
        const floor = Math.min(...rest.map(b => range(b).lo));
        let max = Math.max(...rest.map(b => range(b).hi)) + CHECKIN_SLACK;
        for (let page = 0; page < MAX_PAGES * 4 && left.size; page++) {
          signal?.throwIfAborted();
          const items = await getPage(`https://untappd.com/profile/more_feed/${encodeURIComponent(user)}/${max}?v2=true`, true, page === 0);
          pages++;
          for (const c of items) {
            const entry = left.get(String(c.beerId));
            if (!entry) continue;
            take(entry.b, c, entry.found);
            if (finish(entry.b, entry.found)) left.delete(String(c.beerId));
          }
          progress(beers.length - 1, beers.length);
          await onCheckpoint?.({ dates: { ...dates } });
          const last = Number(items.at(-1)?.id);
          if (!items.length || last <= floor) break;
          max = last;
          await sleep(DELAY_MS, signal);
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        if (tabId != null) closeTabSession(tabId);
        throw err;
      }
      stopped = 'aborted';
    }
    if (tabId != null) closeTabSession(tabId);
    return { dates, pages, via, stopped, complete: stopped === 'end' && beers.every(b => dates[b.id]) };
  }

  // Merkene hentes to ganger: først Untappds spesialfilter (for å vite hvilke merker som er spesielle),
  // så alle merker (for maks nivå). Listen er sortert på sist tatt, så en hel kjent side betyr at resten er kjent.
  const BADGE_PAGE = 52;
  const BADGE_SEGMENTS = ['special', 'all'];
  const badgeLink = (user, segment, off) => (off === 0
    ? `https://untappd.com/user/${encodeURIComponent(user)}/badges${segment === 'all' ? '' : `?segment=${segment}`}`
    : `https://untappd.com/profile/more_badges/${encodeURIComponent(user)}/${off}?sort=unlocked&segment=${segment}`);

  async function syncBadges(user, { known = [], full = false, onProgress, onCheckpoint, signal } = {}) {
    const { merge, pageIsKnown } = root.DFU.badges;
    let badges = known;
    let counts = {};
    let own = null;
    let tabId = null;
    let via = 'direct';
    let pages = 0;
    let stopped = 'end';

    const viaTab = async link => {
      const res = await root.DFU.api.runtime.sendMessage({ type: 'dfu:history-page', tabId, url: link, kind: 'badges' });
      if (!res?.ok) throw new Error(res?.error ?? `HTTP ${res?.status ?? '?'}`);
      return { items: res.badges ?? [], counts: res.counts ?? {}, own: res.own ?? null };
    };

    // Første side må ha merkelisten. Mangler den, er vi utlogget eller stoppet av en sjekk, og fanen tar over.
    const getPage = async (link, first) => {
      if (tabId != null) return viaTab(link);
      try {
        const res = await fetch(link, {
          credentials: 'include', cache: 'no-store', signal,
          headers: first ? undefined : { 'X-Requested-With': 'XMLHttpRequest' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        if (!first || doc.querySelector('.badges')) {
          return { items: root.DFU.parse.parseBadges(doc), counts: root.DFU.parse.parseBadgeCounts(doc), own: root.DFU.parse.parseBadgeListOwn(doc) };
        }
      } catch (err) {
        if (err.name === 'AbortError') throw err;
      }
      tabId = await openTabSession(user);
      via = 'tab';
      return viaTab(link);
    };

    try {
      for (const [index, segment] of BADGE_SEGMENTS.entries()) {
        let finished = false;
        for (let off = 0; off < MAX_PAGES * BADGE_PAGE; off += BADGE_PAGE) {
          signal?.throwIfAborted();
          const page = await getPage(badgeLink(user, segment, off), off === 0);
          pages++;
          if (off === 0) {
            counts = { ...counts, ...page.counts };
            own ??= page.own;
          }
          const seen = pageIsKnown(page.items, badges);
          badges = merge(badges, page.items, { special: segment === 'special' });
          onProgress?.({ segment, pages, counts, fetched: badges.length });
          await onCheckpoint?.({ badges, own });
          finished = page.items.length < BADGE_PAGE || (!full && seen);
          if (finished) break;
          await sleep(DELAY_MS, signal);
        }
        if (!finished) stopped = 'limit';
        if (index < BADGE_SEGMENTS.length - 1) await sleep(DELAY_MS, signal);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        if (tabId != null) closeTabSession(tabId);
        throw err;
      }
      stopped = 'aborted';
    }
    if (tabId != null) closeTabSession(tabId);
    return { badges, counts, own, pages, via, stopped, complete: stopped === 'end' };
  }

  // Omtrent hvor mange sider en full merkehenting tar, ut fra antallet i filterlenkene eller på profilen.
  const badgePagesFor = (all, special = 0) =>
    Math.max(1, Math.ceil((all ?? 0) / BADGE_PAGE)) + Math.max(1, Math.ceil((special ?? 0) / BADGE_PAGE));

  // Omtrent hvor mange sider landkoblingen henter: minst én side per land.
  const pagesFor = countries =>
    countries.reduce((n, c) => n + Math.max(1, Math.ceil((c.count ?? 0) / PAGE_SIZE)), 0);

  const api = { sync, syncCountries, syncCheckins, syncBadges, merge, pageIsKnown, pagesFor, badgePagesFor, PAGE_SIZE, DELAY_MS };
  root.DFU = root.DFU || {};
  root.DFU.history = api;
  if (typeof module === 'object' && module.exports) module.exports = { merge, pageIsKnown, pagesFor, badgePagesFor, PAGE_SIZE, DELAY_MS };
})(globalThis);
