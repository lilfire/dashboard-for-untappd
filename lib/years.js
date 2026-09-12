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
    return { years, byYear, total: valid.length, skipped: (beers ?? []).length - valid.length };
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

  const api = { buildYears, compareYear, statsFor, topCounts, firstSeen };
  root.DFU = root.DFU || {};
  root.DFU.years = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
