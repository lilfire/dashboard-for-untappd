// Kobler ølene dine til land, ved å gå gjennom ølsidens landfilter. Uten dette vet vi bare
// hvor mange øl hvert land har, ikke hvilke øl eller bryggerier som hører til.
(function (root) {
  const { i18n, store, history } = root.DFU;
  const { t } = i18n;
  const $ = id => document.getElementById(id);
  const num = n => i18n.number(n);

  const C = {
    user: null,
    countries: [],
    data: { byBeer: {}, at: null, complete: false, count: 0 },
    syncing: false,
    controller: null,
  };

  const estimatePages = () =>
    C.countries.reduce((n, c) => n + Math.max(1, Math.ceil((c.count ?? 0) / history.PAGE_SIZE)), 0);

  function renderSync() {
    const btn = $('c-sync-btn');
    if (!btn) return;
    btn.textContent = C.data.at ? t('countries_syncUpdate') : t('countries_syncBtn');
    btn.disabled = C.syncing || !C.user || !C.countries.length;
    $('c-sync-stop').hidden = !C.syncing;
    $('c-progress').hidden = !C.syncing;
    if (C.syncing) return;
    $('c-sync-text').textContent = C.data.at
      ? t('countries_synced', num(C.data.count), i18n.relative(C.data.at))
      : t('countries_syncNever', num(estimatePages()));
  }

  async function run() {
    if (C.syncing || !C.user) return;
    C.syncing = true;
    C.controller = new AbortController();
    renderSync();
    try {
      const res = await history.syncCountries(C.user, {
        countries: C.countries,
        signal: C.controller.signal,
        onProgress: p => {
          $('c-sync-text').textContent = t('countries_syncing', p.country, num(p.index + 1), num(p.total), num(p.beers));
          $('c-progress').firstElementChild.style.width = `${Math.round((p.index + 1) / p.total * 100)}%`;
        },
      });
      C.data = await store.saveCountries(C.user, { byBeer: res.byBeer, complete: res.complete });
      C.syncing = false;
      renderSync();
      if (res.stopped === 'aborted') $('c-sync-text').textContent = t('countries_aborted');
      document.dispatchEvent(new CustomEvent('dfu:countries'));
    } catch (err) {
      C.syncing = false;
      renderSync();
      $('c-sync-text').textContent = t('years_error', err.message);
    }
  }

  async function setUser(user, countries) {
    if (!user || C.syncing) return;
    C.user = user;
    if (countries?.length) C.countries = countries;
    C.data = await store.loadCountries(user);
    renderSync();
    document.dispatchEvent(new CustomEvent('dfu:countries'));
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
    $('c-sync-btn')?.addEventListener('click', run);
    $('c-sync-stop')?.addEventListener('click', () => C.controller?.abort());
    renderSync();
    void bootstrap();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  root.DFU.countries = { setUser, byBeer: () => C.data.byBeer, state: C };
})(globalThis);
