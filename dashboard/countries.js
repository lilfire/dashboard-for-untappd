// Kobler ølene dine til land, ved å gå gjennom ølsidens landfilter. Uten dette vet vi bare
// hvor mange øl hvert land har, ikke hvilke øl eller bryggerier som hører til.
// Kjøres automatisk, og bare for land der antallet har endret seg siden sist.
(function (root) {
  const { i18n, store, history } = root.DFU;
  const { t } = i18n;
  const $ = id => document.getElementById(id);
  const num = n => i18n.number(n);

  const C = {
    user: null,
    countries: [],
    data: { byBeer: {}, counts: {}, at: null, complete: false, count: 0 },
    syncing: false,
    loading: true,
    controller: null,
    stoppedByUser: false,
  };

  const hasHistory = () => (root.DFU.yearsView?.state?.history?.beers ?? []).length > 0;

  // Land som mangler, eller som har fått flere øl siden forrige kobling.
  const staleCountries = () => {
    const stored = C.data.counts ?? {};
    return C.countries.filter(c => (stored[c.id] ?? -1) !== (c.count ?? 0));
  };

  const pagesFor = list =>
    list.reduce((n, c) => n + Math.max(1, Math.ceil((c.count ?? 0) / history.PAGE_SIZE)), 0);

  function renderSync() {
    if (!$('c-sync-text')) return;
    $('c-sync-stop').hidden = !C.syncing;
    $('c-progress').hidden = !C.syncing;
    if (C.syncing) return;
    const stale = staleCountries();
    $('c-sync-text').textContent = !hasHistory() ? t('countries_needHistory2')
      : C.data.at && !stale.length ? ''
      : C.stoppedByUser ? t('countries_aborted')
      : t('countries_pending', num(stale.length), num(pagesFor(stale)));
  }

  let currentSync = null;
  function run(list) {
    if (currentSync) return currentSync;
    currentSync = sync(list).finally(() => { currentSync = null; });
    return currentSync;
  }

  async function sync(list) {
    if (C.loading || C.syncing || !C.user || !list.length) return;
    C.syncing = true;
    C.controller = new AbortController();
    renderSync();
    try {
      const res = await history.syncCountries(C.user, {
        countries: list,
        signal: C.controller.signal,
        onCheckpoint: async ({ byBeer, counts }) => {
          C.data = await store.saveCountries(C.user, {
            byBeer: { ...C.data.byBeer, ...byBeer },
            counts: { ...C.data.counts, ...counts },
            complete: false,
          });
        },
        onProgress: p => {
          $('c-sync-text').textContent = t('countries_syncing', p.country, num(p.index + 1), num(p.total), num(p.beers));
          $('c-progress').firstElementChild.style.width = `${Math.round((p.index + 1) / p.total * 100)}%`;
        },
      });
      const byBeer = { ...C.data.byBeer, ...res.byBeer };
      const counts = { ...C.data.counts, ...res.counts };
      C.stoppedByUser = res.stopped === 'aborted';
      C.data = await store.saveCountries(C.user, { byBeer, counts, complete: res.complete });
      C.syncing = false;
      renderSync();
      document.dispatchEvent(new CustomEvent('dfu:countries'));
    } catch (err) {
      C.syncing = false;
      renderSync();
      $('c-sync-text').textContent = t('years_error', err.message);
    }
  }

  // Starter av seg selv når historikken finnes og noe mangler, med mindre brukeren stoppet den.
  function maybeAutoSync() {
    if (C.loading || C.syncing || C.stoppedByUser || !C.user || !hasHistory()) return;
    const stale = staleCountries();
    if (stale.length) void run(stale);
  }

  async function setUser(user, countries, { autoSync = true } = {}) {
    if (!user) return;
    if (currentSync) await currentSync;
    C.loading = true;
    C.user = user;
    if (countries) C.countries = countries;
    C.data = await store.loadCountries(user);
    // Eldre lagring har øl → land, men mangler antall per land.
    // Gjenbruk bare land der de lagrede koblingene dekker hele dagens antall.
    const byName = new Map();
    for (const name of Object.values(C.data.byBeer ?? {})) byName.set(name, (byName.get(name) ?? 0) + 1);
    const counts = { ...C.data.counts };
    let migrated = false;
    for (const country of C.countries) {
      if (counts[country.id] == null && byName.get(country.name) === country.count) {
        counts[country.id] = country.count;
        migrated = true;
      }
    }
    if (migrated) C.data = await store.saveCountries(user, { ...C.data, counts });
    C.loading = false;
    renderSync();
    document.dispatchEvent(new CustomEvent('dfu:countries'));
    if (autoSync) maybeAutoSync();
  }

  async function refresh(user, countries) {
    await setUser(user, countries, { autoSync: false });
    C.stoppedByUser = false;
    renderSync();
    await run(staleCountries());
  }

  // Finner bruker og landliste selv, fra det dashbordet allerede har lagret.
  async function bootstrap() {
    const settings = await store.getSettings();
    const user = settings.username || (await store.lastUser());
    if (!user) return;
    const state = await store.load(user);
    await setUser(user, state.snapshots.at(-1)?.data?.countries ?? []);
  }

  function init() {
    $('c-sync-stop')?.addEventListener('click', () => C.controller?.abort());
    // Ny historikk kan bety nye øl som ennå ikke har land.
    document.addEventListener('dfu:history', () => { renderSync(); maybeAutoSync(); });
    renderSync();
    void bootstrap();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  root.DFU.countries = { setUser, refresh, byBeer: () => C.data.byBeer, state: C };
})(globalThis);
