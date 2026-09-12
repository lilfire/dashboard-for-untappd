// Tolker Untappds ølside (/user/<navn>/beers) til et rent dataobjekt.
// Tar et Document, så samme kode virker i innholdsskript (ekte side) og i
// dashbordet (DOMParser på hentet HTML).
(function (root) {
  const text = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  const pad = n => String(n).padStart(2, '0');
  const toInt = s => {
    const n = parseInt(String(s ?? '').replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  };
  const toFloat = s => {
    const n = parseFloat(String(s ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };

  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

  // Rå HTML har «Thu, 03 Sep 2026 23:16:28 +0200». Etter at sidens JavaScript har kjørt,
  // står det «09/03/26» (MM/DD/YY). Dato tas fra teksten, så den ikke forskyves av tidssone.
  function parseUntappdDate(s) {
    const str = String(s ?? '').trim();
    let m = str.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/);
    if (m && MONTHS[m[2].toLowerCase()]) {
      const t = Date.parse(str);
      return {
        date: `${m[3]}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(m[1])}`,
        at: Number.isFinite(t) ? new Date(t).toISOString() : null,
      };
    }
    m = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) {
      const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      return { date: `${year}-${pad(m[1])}-${pad(m[2])}`, at: null };
    }
    return { date: null, at: null };
  }

  // Nedtrekkslistene (id="brewery_picker" osv.) har tekst som «Navn (antall)» og ID som value.
  function parsePicker(doc, name) {
    const sel = doc.querySelector(`select#${name}, select[name="${name}"]`);
    if (!sel) return null;
    const out = [];
    for (const o of sel.querySelectorAll('option')) {
      if (o.value === 'all') continue;
      const m = text(o).match(/^(.*)\s\((\d[\d,.]*)\)$/);
      if (m) out.push({ id: o.value, name: m[1].trim(), count: toInt(m[2]) });
    }
    return out;
  }

  function parseStats(doc) {
    const stats = {};
    for (const stat of doc.querySelectorAll('.stats .stat')) {
      const key = text(stat.parentElement.querySelector('.title')).toLowerCase();
      if (['total', 'unique', 'badges', 'friends'].includes(key)) stats[key] = toInt(text(stat));
    }
    return stats;
  }

  function isLoggedIn(doc) {
    return !!doc.querySelector('a[href="/logout"], a[href$="untappd.com/logout"]');
  }

  function parseLoggedInUser(doc) {
    if (!isLoggedIn(doc)) return null;
    const a = doc.querySelector('.nav_user_desktop a[href^="/user/"], #mobile_nav_user a[href^="/user/"]');
    const m = a && a.getAttribute('href').match(/^\/user\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function parsePageOwner(doc, url) {
    const more = doc.querySelector('.more-list-items[data-user-name]');
    if (more) return more.dataset.userName;
    const m = String(url ?? '').match(/\/user\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function detectChallenge(doc) {
    return /just a moment|attention required/i.test(doc.title || '') ||
      !!doc.querySelector('#challenge-form, #cf-challenge-running, script[src*="challenge-platform"]');
  }

  // «First:»/«Recent:»-linjene: dato, tidspunkt og innsjekkings-ID fra lenken.
  function parseCheckinDate(p) {
    if (!p) return { date: null, at: null, checkinId: null };
    const { date, at } = parseUntappdDate(text(p.querySelector('abbr') || p));
    const href = p.querySelector('a')?.getAttribute('href') ?? '';
    return { date, at, checkinId: href.match(/\/checkin\/(\d+)/)?.[1] ?? null };
  }

  function parseRecent(doc) {
    return [...doc.querySelectorAll('.beer-item')].map(item => {
      const nameA = item.querySelector('.name a');
      const breweryA = item.querySelector('.brewery a');
      let ratingYou = null;
      let ratingGlobal = null;
      for (const r of item.querySelectorAll('.ratings .you')) {
        // Ølsiden skriver «Your Rating», «Show More»-fragmentet skriver «You Rating».
        const label = text(r.querySelector('p'));
        const value = toFloat(r.querySelector('.caps[data-rating]')?.dataset.rating);
        if (/global/i.test(label)) ratingGlobal = value;
        else if (/\byou/i.test(label)) ratingYou = value;
      }
      const [first, recent] = [...item.querySelectorAll('.date')].map(parseCheckinDate);
      return {
        id: item.dataset.bid || null,
        name: text(nameA),
        url: nameA?.getAttribute('href') ?? null,
        brewery: text(breweryA),
        breweryUrl: breweryA?.getAttribute('href') ?? null,
        style: text(item.querySelector('.style')),
        ratingYou,
        ratingGlobal,
        abv: toFloat(text(item.querySelector('.abv'))),
        ibu: toFloat(text(item.querySelector('.ibu'))),
        first: first?.date ?? null,
        firstAt: first?.at ?? null,
        firstCheckinId: first?.checkinId ?? null,
        recent: recent?.date ?? null,
        recentAt: recent?.at ?? null,
        recentCheckinId: recent?.checkinId ?? null,
        checkins: toInt(text(item.querySelector('.check-ins'))),
      };
    });
  }

  function parseBeersPage(doc, url) {
    const breweries = parsePicker(doc, 'brewery_picker');
    return {
      version: 1,
      parsedAt: new Date().toISOString(),
      url: url ?? null,
      loggedIn: isLoggedIn(doc),
      loggedInUser: parseLoggedInUser(doc),
      pageOwner: parsePageOwner(doc, url),
      challenge: detectChallenge(doc),
      hasData: breweries !== null,
      stats: parseStats(doc),
      breweries: breweries ?? [],
      styles: parsePicker(doc, 'style_picker') ?? [],
      countries: parsePicker(doc, 'country_picker') ?? [],
      recent: parseRecent(doc),
    };
  }

  const api = { parseBeersPage, parseLoggedInUser, isLoggedIn, detectChallenge, parseUntappdDate };
  root.DFU = root.DFU || {};
  root.DFU.parse = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
