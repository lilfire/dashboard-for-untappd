// Troféskapet: merker på maks nivå og spesialmerker (event, høytid, kampanjer).
// Mellomnivåer og antall merker vises ikke. Rene funksjoner, så de kan testes i Node.
(function (root) {
  const keyOf = b => String(b.base ?? b.name ?? '').toLowerCase();
  const newestFirst = (a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')) || a.name.localeCompare(b.name);

  const MAX_LEVEL = 100;

  // Nivåmerke uten neste nivå. Pensjonerte merker kan ikke gå videre, så der vet vi ikke om nivået er maks.
  // På andres merkesider viser Untappd aldri neste nivå (nextKnown = false). Da regnes nivå 100 som maks,
  // og i tillegg nivået fra reference (dine egne merker på maks), for merker som stopper tidligere.
  function isMaxed(b, { nextKnown = true, reference = null } = {}) {
    if (b.level == null || b.level < 2 || b.retired) return false;
    if (nextKnown) return !b.next;
    const known = reference?.get(keyOf(b));
    return b.level >= MAX_LEVEL || (known != null && b.level >= known);
  }

  // Nøkkel → nivå for merkene på maks nivå, brukt som referanse for andres merker.
  function maxLevels(badges, opts) {
    return new Map((badges ?? []).filter(b => isMaxed(b, opts)).map(b => [keyOf(b), b.level]));
  }

  // Untappds egen kategori «Special», uten nivåer som fortsatt kan tas.
  const isSpecial = b => !!b.special && b.level == null && !b.next;

  // Merker nøkles på navnet uten «(Level N)», så et nytt nivå erstatter det forrige.
  // special = true når sidene kommer fra Untappds spesialfilter. Merket beholder det senere.
  function merge(known, fresh, { special = false } = {}) {
    const map = new Map((known ?? []).map(b => [keyOf(b), b]));
    for (const b of fresh) {
      const prev = map.get(keyOf(b));
      map.set(keyOf(b), { ...prev, ...b, special: special || !!b.special || !!prev?.special });
    }
    return [...map.values()].sort(newestFirst);
  }

  // Siden er kjent når alle merkene har samme ID som før. Et nytt nivå gir ny ID.
  function pageIsKnown(page, known) {
    const ids = new Set((known ?? []).map(b => b.id));
    return page.length > 0 && page.every(b => ids.has(b.id));
  }

  function showcase(badges, opts) {
    const list = badges ?? [];
    return {
      maxed: list.filter(b => isMaxed(b, opts)).sort(newestFirst),
      special: list.filter(isSpecial).sort(newestFirst),
    };
  }

  // [{ year, badges }], nyeste år først. Merker uten dato samles til slutt med year = null.
  function groupByYear(badges) {
    const map = new Map();
    for (const b of [...badges].sort(newestFirst)) {
      const year = b.date ? Number(b.date.slice(0, 4)) : null;
      if (!map.has(year)) map.set(year, []);
      map.get(year).push(b);
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a == null) - (b == null) || b - a)
      .map(([year, list]) => ({ year, badges: list }));
  }

  function inYear(badges, year, opts) {
    const { maxed, special } = showcase(badges, opts);
    const of = b => b.date?.startsWith(`${year}-`);
    return { maxed: maxed.filter(of), special: special.filter(of) };
  }

  const firstOf = (a, b) => (!a.date || !b.date ? null : a.date < b.date ? 'me' : a.date > b.date ? 'them' : 'same');

  // Deg mot en venn: felles, bare du og bare vennen, for maks nivå og spesialmerker.
  // Radene med bare én av dere har den andres merke i «other» (for nivået), eller null når det mangler.
  function compare(mine, theirs, { mineNextKnown = true, theirsNextKnown = false } = {}) {
    const reference = maxLevels(mine, { nextKnown: mineNextKnown });
    const a = showcase(mine, { nextKnown: mineNextKnown });
    const b = showcase(theirs, { nextKnown: theirsNextKnown, reference });
    const allMine = new Map((mine ?? []).map(x => [keyOf(x), x]));
    const allTheirs = new Map((theirs ?? []).map(x => [keyOf(x), x]));
    const split = (meList, themList) => {
      const themByKey = new Map(themList.map(x => [keyOf(x), x]));
      const meKeys = new Set(meList.map(keyOf));
      const both = meList.filter(x => themByKey.has(keyOf(x))).map(x => {
        const them = themByKey.get(keyOf(x));
        return { key: keyOf(x), name: x.base || x.name, image: x.image ?? them.image, me: x, them, first: firstOf(x, them) };
      });
      return {
        both,
        onlyMe: meList.filter(x => !themByKey.has(keyOf(x))).map(x => ({ ...x, other: allTheirs.get(keyOf(x)) ?? null })),
        onlyThem: themList.filter(x => !meKeys.has(keyOf(x))).map(x => ({ ...x, other: allMine.get(keyOf(x)) ?? null })),
      };
    };
    return { maxed: split(a.maxed, b.maxed), special: split(a.special, b.special) };
  }

  const api = { isMaxed, isSpecial, maxLevels, merge, pageIsKnown, showcase, groupByYear, inYear, compare, keyOf, MAX_LEVEL };
  root.DFU = root.DFU || {};
  root.DFU.badges = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
