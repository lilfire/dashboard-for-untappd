(async function () {
  const { api, i18n, store, fetch: net, views, compare, charts } = DFU;
  const { t } = i18n;
  const $ = id => document.getElementById(id);
  const ORIGINS = { origins: ['https://untappd.com/*'] };
  const TABS = [...document.querySelectorAll('#tabs [role="tab"]')].map(b => b.dataset.tab);

  let settings = await store.getSettings();
  let user = null;
  let state = null;
  let refreshing = false;
  let trendMetric = 'unique';

  const latest = () => state?.snapshots?.at(-1) ?? null;
  const num = n => (n == null ? '–' : i18n.number(n));

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
    $('status').textContent = refreshing ? t('refreshing')
      : snap ? `${t('updated', i18n.relative(snap.at))} · ${t(`via_${snap.via}`)}` : t('neverUpdated');
  }

  function setBusy(busy) {
    refreshing = busy;
    $('refresh').disabled = busy;
    $('refresh').textContent = busy ? t('refreshing') : t('refresh');
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
      render();
    } catch (err) {
      showAlert(t('err_network', err.message));
    } finally {
      setBusy(false);
    }
  }

  /* ---------- Visning ---------- */
  const { html, render: renderHTML } = DFU.html;

  function renderKpis(data, change) {
    const s = data.stats ?? {};
    const tiles = [
      ['kpi_total', s.total, change?.total],
      ['kpi_unique', s.unique, change?.unique],
      ['kpi_breweries', data.breweries.length, change?.breweries.added.length],
      ['kpi_countries', data.countries.length, change?.countries.added.length],
      ['kpi_styles', data.styles.length, change?.styles.added.length],
      ['kpi_badges', s.badges, null],
      ['kpi_friends', s.friends, null],
    ];
    renderHTML($('kpis'), tiles.map(([key, value, delta]) => html`<div class="kpi">
      <span class="v">${num(value)}</span><span class="l">${t(key)}</span>
      ${delta > 0 ? html`<span class="d">+${num(delta)}</span>` : ''}</div>`));
  }

  function renderChange(change) {
    const chips = (items, label) => [
      items.slice(0, 12).map(label),
      items.length > 12 ? html`<span class="chip">+${num(items.length - 12)}</span>` : '',
    ];
    const group = (title, items, label) => (items.length
      ? html`<div class="change-group"><span>${title}</span>${chips(items, label)}</div>` : '');
    const name = x => html`<span class="chip">${x.name}</span>`;
    const has = change && (change.unique > 0 || change.total > 0 || change.breweries.added.length ||
      change.breweries.increased.length || change.countries.added.length || change.styles.added.length);
    if (!has) {
      renderHTML($('change'), html`<div class="change-head"><strong>${t('change_title')}</strong></div><p>${t('change_none')}</p>`);
      return;
    }
    renderHTML($('change'), html`<div class="change-head"><strong>${t('change_title')}</strong>
      <span class="meta">${t('change_since', i18n.date(change.since))}</span></div>
      <div class="change-groups">
        <div class="change-group">
          ${change.unique > 0 ? html`<span class="chip"><b>${t('change_unique', num(change.unique))}</b></span>` : ''}
          ${change.total > 0 ? html`<span class="chip"><b>+${num(change.total)}</b> ${t('kpi_total').toLowerCase()}</span>` : ''}
        </div>
        ${group(t('change_newBreweries'), change.breweries.added, name)}
        ${group(t('change_moreBeers'), change.breweries.increased, x => html`<span class="chip">${x.name} <b>+${x.delta}</b></span>`)}
        ${group(t('change_newCountries'), change.countries.added, name)}
        ${group(t('change_newStyles'), change.styles.added, name)}
      </div>`);
  }

  function renderTrend() {
    for (const b of document.querySelectorAll('#trend-metric button')) b.setAttribute('aria-pressed', String(b.dataset.metric === trendMetric));

    // Har vi hele ølhistorikken, viser vi den måned for måned. Ellers bare dagene siden utvidelsen ble installert.
    const beers = DFU.yearsView?.state?.history?.beers ?? [];
    const fromHistory = beers.length > 0 && ['unique', 'breweries', 'styles'].includes(trendMetric);
    const points = fromHistory
      ? DFU.years.timeline(beers).map(p => ({ date: p.date, value: trendMetric === 'unique' ? p.unique : p[trendMetric] }))
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

  function render() {
    const snap = latest();
    if (!snap) return;
    const change = store.latestChange(state);
    $('loading').hidden = true;
    $('content').hidden = false;
    $('user-name').textContent = snap.data.pageOwner || user;
    document.title = `${snap.data.pageOwner || user} · Dashboard for Untappd`;
    renderKpis(snap.data, change);
    renderChange(change);
    views.setData(snap.data, change, user);
    compare.setMe(snap.data);
    DFU.yearsView.setUser(snap.data.pageOwner || user, snap.data.stats?.unique ?? null);
    renderTrend();
    updateStatus();
  }

  /* ---------- Faner ---------- */
  function selectTab(name) {
    if (!TABS.includes(name)) name = 'breweries';
    for (const b of document.querySelectorAll('#tabs [role="tab"]')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
    for (const id of TABS) $(`panel-${id}`).hidden = id !== name;
    if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
  }

  /* ---------- Oppstart ---------- */
  i18n.setLanguage(settings.language);
  i18n.apply();
  views.init();
  compare.init();
  DFU.yearsView.init();
  $('tabs').addEventListener('click', e => { const b = e.target.closest('[role="tab"]'); if (b) selectTab(b.dataset.tab); });
  $('trend-metric').addEventListener('click', e => {
    const b = e.target.closest('button[data-metric]');
    if (b) { trendMetric = b.dataset.metric; renderTrend(); }
  });
  $('refresh').addEventListener('click', () => refresh());
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
