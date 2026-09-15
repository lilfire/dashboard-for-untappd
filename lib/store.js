// Lagring per Untappd-bruker: øyeblikksbilder (for «nytt siden sist») og daglige totaltall (for kurven).
// De rene funksjonene eksporteres også til Node for testing.
(function (root) {
  const MAX_SNAPSHOTS = 10;
  const DEFAULT_SETTINGS = { username: '', staleHours: 6, language: 'auto' };
  const pad = n => String(n).padStart(2, '0');
  const stateKey = user => `u:${String(user).toLowerCase()}:state`;

  function localDate(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function totals(data) {
    const sum = list => list.reduce((s, x) => s + (x.count ?? 0), 0);
    return {
      unique: data.stats?.unique ?? sum(data.breweries),
      total: data.stats?.total ?? null,
      breweries: data.breweries.length,
      countries: data.countries.length,
      styles: data.styles.length,
    };
  }

  const signature = data => Object.values(totals(data)).join('/');

  // Fane og besøk mangler klokkeslett; hent det fra et tidligere øyeblikksbilde via innsjekkings-ID.
  function fillTimes(data, prev) {
    if (!prev) return data;
    const times = new Map();
    for (const b of prev.recent ?? []) {
      if (b.firstCheckinId && b.firstAt) times.set(b.firstCheckinId, b.firstAt);
      if (b.recentCheckinId && b.recentAt) times.set(b.recentCheckinId, b.recentAt);
    }
    return {
      ...data,
      recent: data.recent.map(b => ({
        ...b,
        firstAt: b.firstAt ?? times.get(b.firstCheckinId) ?? null,
        recentAt: b.recentAt ?? times.get(b.recentCheckinId) ?? null,
      })),
    };
  }

  // Legger til et øyeblikksbilde. Uendrede data erstatter det siste i stedet for å legge til nytt,
  // så det nest siste alltid er forrige endring.
  function addSnapshot(state, snap) {
    const snapshots = [...(state?.snapshots ?? [])];
    const last = snapshots[snapshots.length - 1];
    const data = fillTimes(snap.data, last?.data);
    const entry = { at: snap.at, via: snap.via, data };
    if (last && signature(last.data) === signature(data)) snapshots[snapshots.length - 1] = entry;
    else snapshots.push(entry);
    while (snapshots.length > MAX_SNAPSHOTS) snapshots.shift();
    const daily = { ...(state?.daily ?? {}), [localDate(snap.at)]: totals(data) };
    return { snapshots, daily };
  }

  function diffList(before = [], after = []) {
    const prev = new Map(before.map(x => [x.id, x]));
    const added = [];
    const increased = [];
    for (const x of after) {
      const p = prev.get(x.id);
      if (!p) added.push(x);
      else if (x.count > p.count) increased.push({ ...x, delta: x.count - p.count });
    }
    return { added, increased };
  }

  function diff(prev, cur) {
    const a = totals(prev);
    const b = totals(cur);
    return {
      unique: b.unique - a.unique,
      total: a.total != null && b.total != null ? b.total - a.total : null,
      breweries: diffList(prev.breweries, cur.breweries),
      countries: diffList(prev.countries, cur.countries),
      styles: diffList(prev.styles, cur.styles),
    };
  }

  // Siste endring: sammenligner de to siste øyeblikksbildene.
  function latestChange(state) {
    const s = state?.snapshots ?? [];
    if (s.length < 2) return null;
    const prev = s[s.length - 2];
    const cur = s[s.length - 1];
    return { since: prev.at, ...diff(prev.data, cur.data) };
  }

  const storage = () => root.DFU.api.storage.local;

  async function load(user) {
    const k = stateKey(user);
    const r = await storage().get(k);
    return r[k] ?? { snapshots: [], daily: {} };
  }

  async function save(user, snap) {
    const state = addSnapshot(await load(user), snap);
    await storage().set({ [stateKey(user)]: state, lastUser: user });
    return state;
  }

  // Hele ølhistorikken (unike øl med datoer) per bruker, brukt til årsstatistikk.
  const historyKey = user => `u:${String(user).toLowerCase()}:history`;

  async function loadHistory(user) {
    const k = historyKey(user);
    const r = await storage().get(k);
    return r[k] ?? { beers: [], syncedAt: null, complete: false, count: 0 };
  }

  // syncedAt kan beholdes når bare innsjekkingsdatoer legges til, så historikken ikke ser nyhentet ut.
  async function saveHistory(user, { beers, complete, syncedAt = Date.now() }) {
    const value = { beers, syncedAt, complete: !!complete, count: beers.length };
    await storage().set({ [historyKey(user)]: value });
    return value;
  }

  const friendsKey = user => `u:${String(user).toLowerCase()}:friends`;

  async function loadFriends(user) {
    const k = friendsKey(user);
    const r = await storage().get(k);
    return r[k] ?? { friends: [], syncedAt: null, complete: false };
  }

  async function saveFriends(user, { friends, complete }) {
    const value = { friends, syncedAt: Date.now(), complete: !!complete };
    await storage().set({ [friendsKey(user)]: value });
    return value;
  }

  async function getSettings() {
    const { settings } = await storage().get('settings');
    return { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
  }

  async function setSettings(patch) {
    const settings = { ...(await getSettings()), ...patch };
    await storage().set({ settings });
    return settings;
  }

  async function lastUser() {
    return (await storage().get('lastUser')).lastUser ?? null;
  }

  async function clearAll() {
    await storage().clear();
  }

  const pure = { addSnapshot, diff, diffList, latestChange, fillTimes, totals, localDate, MAX_SNAPSHOTS };
  root.DFU = root.DFU || {};
  // Kobling øl → land, hentet med ølsidens landfilter.
  const countriesKey = user => `u:${String(user).toLowerCase()}:countries`;

  async function loadCountries(user) {
    const k = countriesKey(user);
    const r = await storage().get(k);
    return r[k] ?? { byBeer: {}, counts: {}, at: null, complete: false, count: 0 };
  }

  // counts = antall øl per land ved forrige kobling, så bare endrede land hentes på nytt.
  async function saveCountries(user, { byBeer, counts = {}, complete }) {
    const value = { byBeer, counts, at: Date.now(), complete: !!complete, count: Object.keys(byBeer).length };
    await storage().set({ [countriesKey(user)]: value });
    return value;
  }

  // Merkene fra merkesiden. count = merketallet på profilen ved siste henting, så vi vet når noe er nytt.
  // own = listen er brukerens egen (bare da viser Untappd om et merke har flere nivåer). null = ukjent.
  const badgesKey = user => `u:${String(user).toLowerCase()}:badges`;

  async function loadBadges(user) {
    const k = badgesKey(user);
    const r = await storage().get(k);
    return r[k] ?? { badges: [], count: null, own: null, syncedAt: null, complete: false };
  }

  async function saveBadges(user, { badges, count = null, own = null, complete, syncedAt = Date.now() }) {
    const value = { badges, count, own, syncedAt, complete: !!complete };
    await storage().set({ [badgesKey(user)]: value });
    return value;
  }

  root.DFU.store = { ...pure, load, save, loadHistory, saveHistory, loadFriends, saveFriends, loadCountries, saveCountries, loadBadges, saveBadges, getSettings, setSettings, lastUser, clearAll, DEFAULT_SETTINGS };
  if (typeof module === 'object' && module.exports) module.exports = pure;
})(globalThis);
