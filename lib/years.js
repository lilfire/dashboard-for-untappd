// Årsstatistikk regnet ut fra hele ølhistorikken (unike øl med første innsjekking).
// Rene funksjoner, så de kan testes i Node.
(function (root) {
  const yearOf = b => Number(String(b.first).slice(0, 4));
  // I en periode kan et øl være smakt igjen; da er «seen» datoen det ble drukket i perioden.
  const dateOf = b => b.seen ?? b.first;
  const monthOf = b => Number(String(dateOf(b)).slice(5, 7));
  const weekdayOf = b => new Date(`${dateOf(b)}T12:00:00Z`).getUTCDay();
  const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const round = (v, n = 2) => (v == null ? null : Math.round(v * 10 ** n) / 10 ** n);

  const breweryKey = b => b.breweryUrl || b.brewery || null;

  // Kartlegger når hvert bryggeri/hver stil ble prøvd første gang.
  function firstSeen(beers, keyFn, nameFn) {
    const map = new Map();
    for (const b of beers) {
      const key = keyFn(b);
      if (!key) continue;
      const cur = map.get(key);
      if (!cur || b.first < cur.first) map.set(key, { key, name: nameFn(b), first: b.first });
    }
    return map;
  }

  function newInRange(map, from, to) {
    return [...map.values()].filter(x => x.first >= from && x.first <= to);
  }

  function topCounts(list, keyFn, nameFn, limit = 5) {
    const counts = new Map();
    for (const b of list) {
      const key = keyFn(b);
      if (!key) continue;
      const cur = counts.get(key) ?? { key, name: nameFn(b), count: 0 };
      cur.count++;
      counts.set(key, cur);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit);
  }

  // range er et år, eller { from, to } (YYYY-MM-DD, begge med) for en valgfri periode.
  function statsFor(range, list, breweryFirst, styleFirst) {
    const { year = null, from, to } = typeof range === 'number' ? { year: range, from: `${range}-01-01`, to: `${range}-12-31` } : range;
    const byDate = [...list].sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
    const rated = list.filter(b => b.ratingYou != null).sort((a, b) => b.ratingYou - a.ratingYou || a.name.localeCompare(b.name));
    const withAbv = list.filter(b => b.abv != null && b.abv > 0);
    const months = Array(12).fill(0);
    const weekdays = Array(7).fill(0);
    for (const b of list) {
      months[monthOf(b) - 1]++;
      weekdays[weekdayOf(b)]++;
    }
    const newBreweries = newInRange(breweryFirst, from, to);
    const newStyles = newInRange(styleFirst, from, to);
    const ratingsAgainstGlobal = list.filter(b => b.ratingYou != null && b.ratingGlobal != null);
    return {
      year,
      beers: list.length,
      breweries: newBreweries.length,
      newBreweries: newBreweries.map(x => x.name).sort(),
      styles: newStyles.length,
      newStyles: newStyles.map(x => x.name).sort(),
      ratedCount: rated.length,
      discoveryDays: new Set(list.map(dateOf)).size,
      activeMonths: months.filter(n => n > 0).length,
      ratingBuckets: Array.from({ length: 5 }, (_, i) => rated.filter(b =>
        b.ratingYou >= i && (i === 4 ? b.ratingYou <= 5 : b.ratingYou < i + 1)).length),
      avgRating: round(mean(rated.map(b => b.ratingYou))),
      avgGlobal: round(mean(ratingsAgainstGlobal.map(b => b.ratingGlobal))),
      generosity: round(mean(ratingsAgainstGlobal.map(b => b.ratingYou - b.ratingGlobal))),
      avgAbv: round(mean(withAbv.map(b => b.abv)), 1),
      strongest: withAbv.sort((a, b) => b.abv - a.abv)[0] ?? null,
      topRated: rated.slice(0, 5),
      lowestRated: rated.slice(-3).reverse(),
      topStyles: topCounts(list, b => b.style, b => b.style),
      topBreweries: topCounts(list, breweryKey, b => b.brewery),
      months,
      weekdays,
      busiestMonth: months.indexOf(Math.max(...months)),
      busiestWeekday: weekdays.indexOf(Math.max(...weekdays)),
      firstBeer: byDate[0] ?? null,
      lastBeer: byDate.at(-1) ?? null,
    };
  }

  const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const checkinCount = b => b.checkins ?? (isDate(b.recent) && b.recent !== b.first ? 2 : 1);

  // Øl der ølhistorikken ikke sier hvilket år hver innsjekking hører til: mer enn to innsjekkinger,
  // spredt over flere år, og ingen hentede datoer som stemmer med antallet.
  function needsCheckinDates(b) {
    const n = checkinCount(b);
    if (!b?.id || !isDate(b.first) || n < 3 || b.checkinDates?.length === n) return false;
    return !isDate(b.recent) || b.recent.slice(0, 4) !== b.first.slice(0, 4);
  }

  // Innsjekkinger per år. Første og siste dato står i historikken; for øl drukket flere ganger over
  // flere år brukes de hentede datoene (checkinDates). Mangler de, er året markert «pending».
  // Antall per år, der et år kan være markert «pending» når tallet ikke kan regnes ut ennå.
  function tally() {
    const out = new Map();
    const add = (year, count, pending = false) => {
      const cur = out.get(year) ?? { count: 0, pending: false };
      cur.count += count;
      cur.pending ||= pending;
      out.set(year, cur);
    };
    return { out, add };
  }

  function checkinsByYear(beers) {
    const { out, add } = tally();
    for (const b of beers ?? []) {
      if (!isDate(b?.first)) continue;
      const n = checkinCount(b);
      const firstYear = yearOf(b);
      if (!needsCheckinDates(b)) {
        if (b.checkinDates?.length === n && n >= 3) for (const d of b.checkinDates) add(Number(d.slice(0, 4)), 1);
        else if (n === 2 && isDate(b.recent)) { add(firstYear, 1); add(Number(b.recent.slice(0, 4)), 1); }
        else add(firstYear, n);
        continue;
      }
      // De mellomste kan høre til ethvert år mellom første og siste.
      const lastYear = isDate(b.recent) ? Number(b.recent.slice(0, 4)) : firstYear;
      add(firstYear, 1);
      if (isDate(b.recent)) add(lastYear, 1);
      for (let y = firstYear; y <= lastYear; y++) add(y, 0, true);
    }
    return out;
  }

  // Unike øl per år: ulike øl sjekket inn i året, også øl smakt tidligere, slik Untappd teller.
  // Mangler datoene for de mellomste innsjekkingene, er årene mellom første og siste «pending».
  function uniqueByYear(beers) {
    const { out, add } = tally();
    for (const b of beers ?? []) {
      if (!isDate(b?.first)) continue;
      const n = checkinCount(b);
      const years = new Set([yearOf(b)]);
      if (b.checkinDates?.length === n && n >= 3) for (const d of b.checkinDates) years.add(Number(d.slice(0, 4)));
      else if (isDate(b.recent)) years.add(Number(b.recent.slice(0, 4)));
      for (const y of years) add(y, 1);
      if (needsCheckinDates(b) && isDate(b.recent)) {
        for (let y = yearOf(b) + 1; y < Number(b.recent.slice(0, 4)); y++) add(y, 0, true);
      }
    }
    return out;
  }

  // beers: hele historikken. Returnerer år sortert nyest først.
  function buildYears(beers) {
    const valid = (beers ?? []).filter(b => b && typeof b.first === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.first));
    const breweryFirst = firstSeen(valid, breweryKey, b => b.brewery);
    const styleFirst = firstSeen(valid, b => b.style, b => b.style);
    const byYear = new Map();
    for (const b of valid) {
      const y = yearOf(b);
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y).push(b);
    }
    const years = [...byYear.keys()].sort((a, b) => b - a).map(y => statsFor(y, byYear.get(y), breweryFirst, styleFirst));
    return { years, byYear, checkins: checkinsByYear(valid), unique: uniqueByYear(valid), total: valid.length, skipped: (beers ?? []).length - valid.length };
  }

  // Én måned i detalj: antall nye øl per dag, og ølene sortert etter dato. month er 0–11.
  function monthBreakdown(beers, year, month) {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
    const list = (beers ?? [])
      .filter(b => typeof b?.first === 'string' && b.first.startsWith(prefix))
      .sort((a, b) => a.first.localeCompare(b.first));
    const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const counts = Array(days).fill(0);
    for (const b of list) {
      const day = Number(b.first.slice(8, 10));
      if (day >= 1 && day <= days) counts[day - 1]++;
    }
    return { list, counts, days };
  }

  // Kumulativ utvikling måned for måned: unike øl, bryggerier og stiler.
  // until ('YYYY-MM') fyller ut med siste verdi frem til den måneden, så to kurver kan ende likt.
  function timeline(beers, countryByBeer = null, { until = null } = {}) {
    const valid = (beers ?? []).filter(b => b && typeof b.first === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.first))
      .sort((a, b) => a.first.localeCompare(b.first));
    if (!valid.length) return [];
    const seenBreweries = new Set();
    const seenStyles = new Set();
    const seenCountries = new Set();
    const byMonth = new Map();
    let unique = 0;
    for (const b of valid) {
      unique++;
      const bk = breweryKey(b);
      if (bk) seenBreweries.add(bk);
      if (b.style) seenStyles.add(b.style);
      const country = countryByBeer?.[b.id];
      if (country) seenCountries.add(country);
      byMonth.set(b.first.slice(0, 7), {
        unique, breweries: seenBreweries.size, styles: seenStyles.size, countries: seenCountries.size,
      });
    }
    // Fyller ut månedene uten nye øl, så kurven ikke hopper over tomme perioder.
    const out = [];
    const [firstYear, firstMonth] = [...byMonth.keys()][0].split('-').map(Number);
    const lastBeer = [...byMonth.keys()].at(-1);
    const lastKey = until && /^\d{4}-\d{2}$/.test(until) && until > lastBeer ? until : lastBeer;
    let cur = { unique: 0, breweries: 0, styles: 0, countries: 0 };
    // Nullpunkt måneden før første øl, så kurven starter på 0.
    const [prevYear, prevMonth] = firstMonth === 1 ? [firstYear - 1, 12] : [firstYear, firstMonth - 1];
    out.push({ date: `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`, ...cur });
    for (let y = firstYear, m = firstMonth; ; m === 12 ? (m = 1, y++) : m++) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      cur = byMonth.get(key) ?? cur;
      out.push({ date: `${key}-01`, ...cur });
      if (key === lastKey) break;
    }
    return out;
  }

  /* ---------- Valgfri periode ---------- */
  const DAY = 86400000;
  const toUtc = d => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  const fromUtc = ms => new Date(ms).toISOString().slice(0, 10);
  const addDays = (d, n) => fromUtc(toUtc(d) + n * DAY);
  const localDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const PRESETS = ['today', 'yesterday', 'weekend', 'thisWeek', 'last7', 'thisMonth', 'lastMonth'];

  // Forhåndsvalgte perioder regnet fra today (YYYY-MM-DD eller Date). Uken starter på mandag.
  function presetRange(name, today = new Date()) {
    const d = today instanceof Date ? localDate(today) : today;
    const weekday = new Date(toUtc(d)).getUTCDay();
    switch (name) {
      case 'today': return { from: d, to: d };
      case 'yesterday': { const y = addDays(d, -1); return { from: y, to: y }; }
      case 'weekend': {
        // Fredag til søndag: inneværende helg fra fredag, ellers forrige.
        const friday = addDays(d, -(weekday === 5 || weekday === 6 || weekday === 0 ? (weekday + 2) % 7 : weekday + 2));
        return { from: friday, to: addDays(friday, 2) };
      }
      case 'thisWeek': return { from: addDays(d, -((weekday + 6) % 7)), to: d };
      case 'last7': return { from: addDays(d, -6), to: d };
      case 'thisMonth': return { from: `${d.slice(0, 8)}01`, to: d };
      case 'lastMonth': {
        const last = addDays(`${d.slice(0, 8)}01`, -1);
        return { from: `${last.slice(0, 8)}01`, to: last };
      }
      default: return null;
    }
  }

  // Alle kjente datoer for ett øl: første, siste og eventuelt hentede innsjekkingsdatoer.
  const knownDates = b => [...new Set([b.first, b.recent, ...(b.checkinDates ?? [])].filter(isDate))];

  // Øl smakt før perioden og sist etter den, med innsjekkinger imellom som ikke har kjent dato.
  function needsDatesInRange(b, from, to) {
    if (!b?.id || !isDate(b.first) || !isDate(b.recent) || b.first >= from || b.recent <= to) return false;
    const n = checkinCount(b);
    if (n < 3 || b.checkinDates?.length === n) return false;
    return !knownDates(b).some(d => d >= from && d <= to);
  }

  // Statistikk for en valgfri periode: nye øl (første innsjekking i perioden) og øl smakt igjen
  // (smakt før, med en kjent innsjekking i perioden). Nye bryggerier og stiler teller bare første gang.
  function periodStats(beers, from, to) {
    if (!isDate(from) || !isDate(to)) return null;
    if (to < from) [from, to] = [to, from];
    const valid = (beers ?? []).filter(b => b && isDate(b.first));
    const breweryFirst = firstSeen(valid, breweryKey, b => b.brewery);
    const styleFirst = firstSeen(valid, b => b.style, b => b.style);
    const list = [];
    let uncertain = 0;
    for (const b of valid) {
      if (b.first > to) continue;
      if (b.first >= from) { list.push({ ...b, seen: b.first, again: false }); continue; }
      const inside = knownDates(b).filter(d => d >= from && d <= to).sort();
      if (inside.length) list.push({ ...b, seen: inside.at(-1), again: true });
      else if (needsDatesInRange(b, from, to)) uncertain++;
    }
    list.sort((a, b) => a.seen.localeCompare(b.seen) || a.name.localeCompare(b.name));
    const length = Math.round((toUtc(to) - toUtc(from)) / DAY) + 1;
    // Per dag, eller per måned når perioden er lang.
    const unit = length > 62 ? 'month' : 'day';
    const keys = [];
    if (unit === 'day') for (let i = 0; i < length; i++) keys.push(addDays(from, i));
    else for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = addDays(`${m}-28`, 7).slice(0, 7)) keys.push(m);
    const counts = keys.map(k => list.filter(b => b.seen.startsWith(k)).length);
    return {
      ...statsFor({ from, to }, list, breweryFirst, styleFirst),
      from, to, length, list,
      freshCount: list.filter(b => !b.again).length,
      againCount: list.filter(b => b.again).length,
      days: { unit, keys, counts },
      uncertain,
    };
  }

  // Statistikk for hele historikken, med samme felter som et år eller en periode, pluss innsjekkinger.
  function allTimeStats(beers) {
    const valid = (beers ?? []).filter(b => b && isDate(b.first));
    return {
      ...statsFor({ from: '0000-01-01', to: '9999-12-31' }, valid, firstSeen(valid, breweryKey, b => b.brewery), firstSeen(valid, b => b.style, b => b.style)),
      checkins: valid.reduce((sum, b) => sum + checkinCount(b), 0),
    };
  }

  // Kumulativ utvikling innenfor et tidsrom: dag for dag, eller måned for måned når det er langt.
  // Datoen for et øl er seen (periode) eller first (år). until kutter kurven, f.eks. ved dagens dato.
  function rangeTimeline(beers, from, to, countryByBeer = null, { until = null } = {}) {
    if (!isDate(from) || !isDate(to)) return { unit: 'day', points: [] };
    if (to < from) [from, to] = [to, from];
    const end = isDate(until) && until >= from && until < to ? until : to;
    const unit = Math.round((toUtc(to) - toUtc(from)) / DAY) + 1 > 62 ? 'month' : 'day';
    const keyOf = d => (unit === 'day' ? d : d.slice(0, 7));
    const next = k => (unit === 'day' ? addDays(k, 1) : addDays(`${k}-28`, 7).slice(0, 7));
    // Månedspunkter står på siste dag i måneden, så et år går fra 1. januar til 31. desember.
    const dateOfKey = k => (unit === 'day' ? k : addDays(`${next(k)}-01`, -1));
    const list = (beers ?? []).map(b => ({ b, d: b?.seen ?? b?.first }))
      .filter(x => isDate(x.d) && x.d >= from && x.d <= end)
      .sort((a, b) => a.d.localeCompare(b.d));
    const seen = { beers: new Set(), breweries: new Set(), styles: new Set(), countries: new Set() };
    const byKey = new Map();
    for (const { b, d } of list) {
      seen.beers.add(b.id ?? b.name);
      const bk = breweryKey(b);
      if (bk) seen.breweries.add(bk);
      if (b.style) seen.styles.add(b.style);
      const country = countryByBeer?.[b.id];
      if (country) seen.countries.add(country);
      byKey.set(keyOf(d), { unique: seen.beers.size, breweries: seen.breweries.size, styles: seen.styles.size, countries: seen.countries.size });
    }
    // Nullpunkt før tidsrommet, så kurven starter på 0.
    const first = keyOf(from);
    const before = unit === 'day' ? addDays(from, -1) : from;
    let cur = { unique: 0, breweries: 0, styles: 0, countries: 0 };
    const points = [{ date: before, ...cur }];
    for (let k = first; k <= keyOf(end); k = next(k)) {
      cur = byKey.get(k) ?? cur;
      const date = dateOfKey(k);
      points.push({ date: date > end ? end : date, ...cur });
    }
    return { unit, points };
  }

  // Sammenligning av ett år mellom to personer.
  function compareYear(mine, theirs) {
    const key = b => b.id ?? b.name;
    const mineIds = new Set((mine ?? []).map(key));
    const theirsIds = new Set((theirs ?? []).map(key));
    return {
      both: (mine ?? []).filter(b => theirsIds.has(key(b))),
      onlyMine: (mine ?? []).filter(b => !theirsIds.has(key(b))),
      onlyTheirs: (theirs ?? []).filter(b => !mineIds.has(key(b))),
    };
  }

  const api = { buildYears, periodStats, allTimeStats, rangeTimeline, presetRange, needsDatesInRange, PRESETS, checkinsByYear, uniqueByYear, needsCheckinDates, compareYear, timeline, monthBreakdown, statsFor, topCounts, firstSeen };
  root.DFU = root.DFU || {};
  root.DFU.years = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
