(async function () {
  const { api, i18n, store, fetch: net, views, compare, charts } = DFU;
  const { t } = i18n;
  const $ = id => document.getElementById(id);
  const ORIGINS = { origins: ['https://untappd.com/*'] };
  const TABS = [...document.querySelectorAll('#menu [data-tab]')].map(b => b.dataset.tab);

  let settings = await store.getSettings();
  let user = null;
  let state = null;
  let refreshing = false;
  let trendMetric = 'unique';

  const latest = () => state?.snapshots?.at(-1) ?? null;

  /* ---------- Varsler og status ---------- */
  function showAlert(text, actionLabel, action, kind = 'error') {
    $('alert').hidden = false;
    $('alert').classList.toggle('info', kind === 'info');
    $('alert-text').textContent = text;
    const btn = $('alert-action');
    btn.hidden = !action;
    btn.textContent = actionLabel ?? '';
    btn.onclick = action ?? null;
  }
  const hideAlert = () => { $('alert').hidden = true; };

  function updateStatus() {
    const snap = latest();
    const text = refreshing ? t('refreshing')
      : snap ? `${t('updated', i18n.relative(snap.at))} · ${t(`via_${snap.via}`)}` : t('neverUpdated');
    $('status').textContent = text;
    $('menu-status').textContent = text;
  }

  function setBusy(busy) {
    refreshing = busy;
    $('refresh').disabled = busy;
    $('refresh-label').textContent = busy ? t('refreshing') : t('refresh');
    $('menu-toggle').classList.toggle('busy', busy);
    updateStatus();
  }

  const openLogin = () => api.tabs.create({ url: 'https://untappd.com/login' });

  async function requestPermission() {
    if (await api.permissions.request(ORIGINS).catch(() => false)) refresh();
  }

  function failureAlert(reason) {
    if (reason === 'logged-out') return showAlert(t('err_loggedOut'), t('err_loggedOutAction'), openLogin);
    if (reason === 'challenge') return showAlert(t('err_challenge'));
    if (reason === 'timeout') return showAlert(t('err_timeout'));
    if (reason === 'no-data') return showAlert(t('err_noData'));
    return showAlert(t('err_network', reason ?? '?'));
  }

  /* ---------- Henting ---------- */
  async function whoAmI() {
    if (settings.username) return { name: settings.username };
    const who = await net.detectUser();
    if (who.user) return { name: who.user };
    if (who.challenge) return { name: await store.lastUser(), reason: 'challenge' };
    return { name: null, reason: who.loggedIn ? 'no-user' : 'logged-out' };
  }

  async function refresh() {
    if (refreshing) return;
    setBusy(true);
    hideAlert();
    try {
      if (!(await api.permissions.contains(ORIGINS))) {
        showAlert(t('err_permission'), t('err_permissionAction'), requestPermission);
        return;
      }
      const who = await whoAmI();
      if (!who.name) {
        if (who.reason === 'challenge') { api.tabs.create({ url: 'https://untappd.com/' }); showAlert(t('err_challenge')); }
        else if (who.reason === 'no-user') showAlert(t('err_noUser'));
        else failureAlert('logged-out');
        return;
      }

      let via = 'direct';
      let { data } = await net.fetchDirect(who.name);
      if (!data.hasData) {
        // Reserve: les siden i en fane. Innlogging og sjekk ordner brukeren selv i fanen.
        const tab = await net.fetchViaTab(who.name);
        if (!tab.ok) { failureAlert(tab.reason); return; }
        via = 'tab';
        data = tab.data;
      }

      const name = data.pageOwner || who.name;
      if (!user || user.toLowerCase() !== name.toLowerCase()) user = name;
      state = await store.save(user, { at: Date.now(), via, data });
      await render();
      await DFU.yearsView.refresh();
      await DFU.countries.refresh(user, data.countries);
      await compare.refresh();
      await DFU.badgesView.refresh(user, data.stats?.badges ?? null);
    } catch (err) {
      showAlert(t('err_network', err.message));
    } finally {
      setBusy(false);
    }
  }

  /* ---------- Visning ---------- */
  function renderTrend() {
    for (const b of document.querySelectorAll('#trend-metric button')) b.setAttribute('aria-pressed', String(b.dataset.metric === trendMetric));

    // Har vi hele ølhistorikken, viser vi den måned for måned. Ellers bare dagene siden utvidelsen ble installert.
    // Land krever i tillegg at ølene er koblet til land, siden historikken ikke har landinfo.
    const beers = DFU.yearsView?.state?.history?.beers ?? [];
    const byCountry = DFU.countries?.byBeer() ?? {};
    const metrics = ['unique', 'breweries', 'styles', ...(Object.keys(byCountry).length ? ['countries'] : [])];
    const fromHistory = beers.length > 0 && metrics.includes(trendMetric);
    const points = fromHistory
      ? DFU.years.timeline(beers, byCountry).map(p => ({ date: p.date, value: trendMetric === 'unique' ? p.unique : p[trendMetric] }))
      : Object.entries(state?.daily ?? {}).sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, value: v[trendMetric] })).filter(p => p.value != null);

    if (!points.length) { $('trend-chart').replaceChildren(); $('trend-note').textContent = t('trend_empty'); return; }
    charts.lineChart($('trend-chart'), points, {
      fmtValue: v => i18n.number(v),
      fmtDate: d => i18n.date(`${d}T12:00:00`, fromHistory ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' }),
    });
    $('trend-note').textContent = fromHistory ? t('trend_history') : points.length < 2 ? t('trend_empty') : t('trend_hint');
  }

  // Årsfanen kaller denne når historikken er hentet.
  DFU.dashboardTrend = renderTrend;

  // Landkurven blir tilgjengelig først når ølene er koblet til land.
  document.addEventListener('dfu:countries', () => renderTrend());

  async function render() {
    const snap = latest();
    if (!snap) return;
    const change = store.latestChange(state);
    $('loading').hidden = true;
    $('content').hidden = false;
    $('user-name').textContent = snap.data.pageOwner || user;
    document.title = `${snap.data.pageOwner || user} · Dashboard for Untappd`;
    views.renderKpis($('kpis'), snap.data);
    views.setData(snap.data, change, user);
    compare.setMe(snap.data);
    await DFU.yearsView.setUser(snap.data.pageOwner || user, snap.data.stats?.unique ?? null);
    renderTrend();
    updateStatus();
  }

  /* ---------- Faner ---------- */
  function selectTab(name, { scroll = false } = {}) {
    if (name === 'recent') name = 'beers'; // gamle lenker til «Siste øl»
    if (!TABS.includes(name)) name = 'years';
    for (const b of document.querySelectorAll('#menu [data-tab]')) {
      if (b.dataset.tab === name) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
    for (const id of TABS) $(`panel-${id}`).hidden = id !== name;
    $('section-name').textContent = t(`tab_${name}`);
    if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
    // Står toppen fast, start den nye fanen rett under den i stedet for midt i.
    if (scroll) {
      const y = $(`panel-${name}`).getBoundingClientRect().top + window.scrollY - document.querySelector('.appbar').offsetHeight - 12;
      if (window.scrollY > y) window.scrollTo(0, y);
    }
  }

  /* ---------- Meny ---------- */
  function setMenu(open, { returnFocus = false } = {}) {
    $('menu').hidden = !open;
    $('menu-toggle').setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('menu-open', open);
    if (open) ($('menu').querySelector('[aria-current="page"]') ?? $('menu').querySelector('button')).focus();
    else if (returnFocus) $('menu-toggle').focus();
  }

  /* ---------- Oppstart ---------- */
  i18n.setLanguage(settings.language);
  i18n.apply();
  views.init();
  compare.init();
  DFU.yearsView.init();
  $('menu-toggle').addEventListener('click', () => setMenu($('menu').hidden));
  $('menu').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (b) { setMenu(false); selectTab(b.dataset.tab, { scroll: true }); }
  });
  document.addEventListener('click', e => { if (!$('menu').hidden && !e.target.closest('#menu, #menu-toggle')) setMenu(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('menu').hidden) setMenu(false, { returnFocus: true }); });
  $('trend-metric').addEventListener('click', e => {
    const b = e.target.closest('button[data-metric]');
    if (b) { trendMetric = b.dataset.metric; renderTrend(); }
  });
  $('refresh').addEventListener('click', () => { setMenu(false); refresh(); });
  selectTab(location.hash.slice(1));
  setInterval(updateStatus, 60000);

  // Lagring ved besøk (fra bakgrunnen) oppdaterer dashbordet mens det er åpent.
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !user || refreshing) return;
    const change = changes[`u:${user.toLowerCase()}:state`];
    if (change?.newValue) { state = change.newValue; render(); }
  });

  user = settings.username || await store.lastUser();
  if (user) state = await store.load(user);
  if (latest()) render();
  else $('loading').hidden = false;

  const snap = latest();
  const stale = !snap || Date.now() - snap.at > settings.staleHours * 3600 * 1000;
  if (stale) refresh();
  else updateStatus();
})();
