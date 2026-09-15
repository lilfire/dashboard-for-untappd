// Årsstatistikk regnet ut fra hele ølhistorikken (unike øl med første innsjekking).
// Rene funksjoner, så de kan testes i Node.
(function (root) {
  const yearOf = b => Number(String(b.first).slice(0, 4));
  const monthOf = b => Number(String(b.first).slice(5, 7));
  const weekdayOf = b => new Date(`${b.first}T12:00:00Z`).getUTCDay();
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

  function newInYear(map, year) {
    return [...map.values()].filter(x => Number(x.first.slice(0, 4)) === year);
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

  function statsFor(year, list, breweryFirst, styleFirst) {
    const byDate = [...list].sort((a, b) => a.first.localeCompare(b.first));
    const rated = list.filter(b => b.ratingYou != null).sort((a, b) => b.ratingYou - a.ratingYou || a.name.localeCompare(b.name));
    const withAbv = list.filter(b => b.abv != null && b.abv > 0);
    const months = Array(12).fill(0);
    const weekdays = Array(7).fill(0);
    for (const b of list) {
      months[monthOf(b) - 1]++;
      weekdays[weekdayOf(b)]++;
    }
    const newBreweries = newInYear(breweryFirst, year);
    const newStyles = newInYear(styleFirst, year);
    const ratingsAgainstGlobal = list.filter(b => b.ratingYou != null && b.ratingGlobal != null);
    return {
      year,
      beers: list.length,
      breweries: newBreweries.length,
      newBreweries: newBreweries.map(x => x.name).sort(),
      styles: newStyles.length,
      newStyles: newStyles.map(x => x.name).sort(),
      ratedCount: rated.length,
      discoveryDays: new Set(list.map(b => b.first)).size,
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

  const api = { buildYears, checkinsByYear, uniqueByYear, needsCheckinDates, compareYear, timeline, monthBreakdown, statsFor, topCounts, firstSeen };
  root.DFU = root.DFU || {};
  root.DFU.years = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
