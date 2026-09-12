// Fanen «År»: årsoppsummering regnet ut fra hele ølhistorikken, og året side om side med en venn.
(function (root) {
  const { i18n, store, history, years: yearsLib } = root.DFU;
  const { html, raw, render } = root.DFU.html;
  const { t } = i18n;
  const $ = id => document.getElementById(id);
  const num = n => i18n.number(n);
  const UNTAPPD = 'https://untappd.com';

  const S = {
    user: null,
    expected: null,
    history: null,
    built: null,
    year: null,
    syncing: false,
    controller: null,
    friend: { name: null, history: null, built: null },
  };

  const rate = v => (v == null ? '–' : v.toLocaleString(i18n.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const signed = v => (v == null ? '–' : (v > 0 ? '+' : '') + v.toLocaleString(i18n.locale(), { maximumFractionDigits: 2 }));
  const beerLink = b => (b ? html`<a href="${UNTAPPD}${b.url ?? ''}" target="_blank" rel="noopener">${b.name}</a>` : '–');

  const monthLabels = () => {
    const f = new Intl.DateTimeFormat(i18n.locale(), { month: 'short' });
    return Array.from({ length: 12 }, (_, m) => f.format(new Date(2025, m, 1)));
  };
  const weekdayLabels = () => {
    const f = new Intl.DateTimeFormat(i18n.locale(), { weekday: 'short' });
    // 1. september 2024 var en søndag, så rekkefølgen matcher getUTCDay().
    return Array.from({ length: 7 }, (_, d) => f.format(new Date(Date.UTC(2024, 8, 1 + d))));
  };

  function bars(values, labels, peak, cls) {
    const max = Math.max(1, ...values);
    return html`<div class="bars ${cls}">${values.map((v, i) => html`<div class="b${i === peak && v > 0 ? ' peak' : ''}">
        <em>${v || ''}</em><i style="height:${Math.round(v / max * 100)}%"></i></div>`)}</div>
      <div class="bar-labels ${cls}">${labels.map(l => html`<span>${l}</span>`)}</div>`;
  }

  const listCard = (label, items, value, extra = '') => html`<div class="card ${extra}">
    <span class="label">${label}</span>
    <ol>${items.map(x => html`<li><span>${x.name}</span><b>${value(x)}</b></li>`)}</ol></div>`;

  /* ---------- Årskort ---------- */
  function renderYear() {
    const y = S.built?.years.find(x => x.year === S.year);
    if (!y) { render($('y-cards'), ''); return; }
    const cards = [
      html`<div class="card"><span class="label">${t('card_newBeers')}</span><span class="value">${num(y.beers)}</span>
        <span class="note">${t('years_note')}</span></div>`,
      html`<div class="card"><span class="label">${t('card_newBreweries')}</span><span class="value">${num(y.breweries)}</span>
        <span class="note">${y.newBreweries.slice(0, 3).join(', ')}${y.newBreweries.length > 3 ? ' …' : ''}</span></div>`,
      html`<div class="card"><span class="label">${t('card_newStyles')}</span><span class="value">${num(y.styles)}</span>
        <span class="note">${y.newStyles.slice(0, 3).join(', ')}${y.newStyles.length > 3 ? ' …' : ''}</span></div>`,
      html`<div class="card"><span class="label">${t('card_avgRating')}</span><span class="value">${rate(y.avgRating)}</span>
        <span class="note">${t('card_ratedOf', num(y.ratedCount), num(y.beers))}${y.generosity == null ? '' : ` · ${t('card_vsGlobal', signed(y.generosity))}`}</span></div>`,
      html`<div class="card"><span class="label">${t('card_avgAbv')}</span><span class="value">${y.avgAbv == null ? '–' : `${y.avgAbv.toLocaleString(i18n.locale())} %`}</span>
        <span class="note">${y.strongest ? t('card_strongest', y.strongest.name, y.strongest.abv.toLocaleString(i18n.locale())) : ''}</span></div>`,
      html`<div class="card"><span class="label">${t('card_topRated')}</span>
        <span class="value small">${beerLink(y.topRated[0])}</span>
        <span class="note">${y.topRated[0] ? `${y.topRated[0].brewery} · ${rate(y.topRated[0].ratingYou)}` : '–'}</span></div>`,
      listCard(t('card_top5'), y.topRated, b => rate(b.ratingYou)),
      listCard(t('card_lowest'), y.lowestRated, b => rate(b.ratingYou)),
      listCard(t('card_topStyles'), y.topStyles, x => num(x.count)),
      listCard(t('card_topBreweries'), y.topBreweries, x => num(x.count)),
      html`<div class="card"><span class="label">${t('card_firstLast')}</span>
        <span class="note">${t('card_first', '')} ${beerLink(y.firstBeer)} · ${y.firstBeer ? i18n.date(y.firstBeer.first) : ''}</span>
        <span class="note">${t('card_last', '')} ${beerLink(y.lastBeer)} · ${y.lastBeer ? i18n.date(y.lastBeer.first) : ''}</span></div>`,
      html`<div class="card wide"><span class="label">${t('card_months')}</span>${bars(y.months, monthLabels(), y.busiestMonth, 'months')}</div>`,
      html`<div class="card wide"><span class="label">${t('card_weekdays')}</span>${bars(y.weekdays, weekdayLabels(), y.busiestWeekday, 'weekdays')}</div>`,
    ];
    render($('y-cards'), cards);
    $('y-summary').textContent = t('year_summary', num(y.beers), num(y.breweries), num(y.styles));
  }

  function renderYearPicker() {
    const list = S.built?.years ?? [];
    $('y-bar').hidden = !list.length;
    if (!list.length) return;
    if (!list.some(y => y.year === S.year)) S.year = list[0].year;
    render($('y-year'), list.map(y => html`<option value="${y.year}"${y.year === S.year ? root.DFU.html.raw(' selected') : ''}>${y.year}</option>`));
    renderYear();
    renderFriendCompare();
  }

  function build() {
    S.built = yearsLib.buildYears(S.history?.beers ?? []);
    renderSync();
    renderYearPicker();
    root.DFU.dashboardTrend?.();
    if (!S.built.years.length && S.history?.beers?.length) $('y-summary').textContent = t('years_none');
  }

  /* ---------- Henting ---------- */
  function renderSync() {
    const h = S.history;
    const pages = S.expected ? Math.ceil(S.expected / history.PAGE_SIZE) : null;
    $('y-sync-btn').textContent = h?.syncedAt ? t('years_syncUpdate') : t('years_syncBtn');
    $('y-sync-btn').disabled = S.syncing || !S.user;
    $('y-sync-stop').hidden = !S.syncing;
    $('y-progress').hidden = !S.syncing;
    if (S.syncing) return;
    if (!S.user) {
      $('y-sync-text').textContent = t('err_noUser');
    } else if (!h?.syncedAt) {
      $('y-sync-text').textContent = t('years_syncNever', num(pages ?? 0));
    } else if (!h.complete) {
      $('y-sync-text').textContent = t('years_incomplete', num(h.count), num(S.expected ?? h.count));
    } else {
      $('y-sync-text').textContent = t('years_synced', num(h.count), i18n.relative(h.syncedAt));
    }
  }

  function progress(p) {
    $('y-sync-text').textContent = t('years_syncing', num(p.pages), num(p.fetched));
    if (S.expected) $('y-progress').firstElementChild.style.width = `${Math.min(100, Math.round(p.fetched / S.expected * 100))}%`;
  }

  async function runSync(full) {
    if (S.syncing || !S.user) return;
    S.syncing = true;
    S.controller = new AbortController();
    renderSync();
    try {
      const res = await history.sync(S.user, {
        known: S.history?.beers ?? [], full, expected: S.expected,
        signal: S.controller.signal, onProgress: progress,
      });
      if (!res.beers.length) {
        // Tomt resultat skal ikke lagres som en fullført historikk.
        S.syncing = false;
        renderSync();
        $('y-sync-text').textContent = t('years_error', `tomt svar (${res.via ?? '?'}, ${res.pages} sider, ${res.stopped})`);
        return;
      }
      S.history = await store.saveHistory(S.user, { beers: res.beers, complete: res.complete && res.stopped !== 'aborted' });
      S.syncing = false;
      build();
      if (res.stopped === 'aborted') $('y-sync-text').textContent = t('years_aborted');
    } catch (err) {
      S.syncing = false;
      renderSync();
      $('y-sync-text').textContent = t('years_error', err.message);
    }
  }

  /* ---------- Året side om side med en venn ---------- */
  const cell = v => (v == null ? '–' : typeof v === 'number' ? (Number.isInteger(v) ? num(v) : rate(v)) : v);
  const beerList = (title, beers, value) => html`<section class="cmp-col">
    <h3>${title} <span>${num(beers.length)}</span></h3>
    <ol>${beers.slice(0, 200).map(b => html`<li><span>${b.name}</span><span>${value(b)}</span></li>`)}
      ${beers.length > 200 ? html`<li><span>… +${num(beers.length - 200)}</span><span></span></li>` : ''}</ol></section>`;

  // Årene begge har øl fra, nyeste først.
  function comparableYears() {
    const all = new Set([...(S.built?.years ?? []).map(y => y.year), ...(S.friend.built?.years ?? []).map(y => y.year)]);
    return [...all].sort((a, b) => b - a);
  }

  function renderFriendCompare() {
    const box = $('cmp-years');
    if (!box) return;
    const name = S.friend.name;
    box.hidden = !name;
    if (!name) return;

    $('cmp-year-btn').textContent = t('cmpYears_btn', name);
    // Knappen blir stående, så historikken kan hentes på nytt når noe er oppdatert.
    $('cmp-year-btn').hidden = S.syncing;
    if (!S.friend.built) {
      $('cmp-year-meta').textContent = t('cmpYears_hint', name);
      $('cmp-year-bar').hidden = true;
      $('cmp-all-title').hidden = true;
      for (const id of ['cmp-year-table', 'cmp-year-cols', 'cmp-all-years']) render($(id), '');
      return;
    }

    const years = comparableYears();
    if (!years.includes(S.cmpYear)) S.cmpYear = years[0] ?? null;
    $('cmp-year-meta').textContent = '';
    $('cmp-year-bar').hidden = false;
    $('cmp-all-title').hidden = false;
    render($('cmp-year-select'), years.map(y => html`<option value="${y}"${y === S.cmpYear ? raw(' selected') : ''}>${y}</option>`));
    $('cmp-year-select').onchange = e => { S.cmpYear = Number(e.target.value); renderFriendCompare(); };

    const mine = S.built?.years.find(y => y.year === S.cmpYear);
    const theirs = S.friend.built.years.find(y => y.year === S.cmpYear);
    const split = yearsLib.compareYear(S.built?.byYear.get(S.cmpYear) ?? [], S.friend.built.byYear.get(S.cmpYear) ?? []);
    $('cmp-year-summary').textContent = t('compare_summary', num(split.both.length), num(split.onlyMine.length), num(split.onlyTheirs.length), name);

    const months = new Intl.DateTimeFormat(i18n.locale(), { month: 'long' });
    const monthName = y => (y && y.beers ? months.format(new Date(2025, y.busiestMonth, 1)) : null);
    const rows = [
      [t('cmpYears_row_beers'), mine?.beers ?? 0, theirs?.beers ?? 0, 'high'],
      [t('cmpYears_row_breweries'), mine?.breweries ?? 0, theirs?.breweries ?? 0, 'high'],
      [t('cmpYears_row_styles'), mine?.styles ?? 0, theirs?.styles ?? 0, 'high'],
      [t('cmpYears_row_rated'), mine?.ratedCount ?? 0, theirs?.ratedCount ?? 0, 'high'],
      [t('cmpYears_row_avgRating'), mine?.avgRating ?? null, theirs?.avgRating ?? null, 'high'],
      [t('cmpYears_row_avgAbv'), mine?.avgAbv ?? null, theirs?.avgAbv ?? null, 'high'],
      [t('cmpYears_row_strongest'), mine?.strongest?.name ?? null, theirs?.strongest?.name ?? null],
      [t('cmpYears_row_topStyle'), mine?.topStyles[0]?.name ?? null, theirs?.topStyles[0]?.name ?? null],
      [t('cmpYears_row_topBrewery'), mine?.topBreweries[0]?.name ?? null, theirs?.topBreweries[0]?.name ?? null],
      [t('cmpYears_row_busiestMonth'), monthName(mine), monthName(theirs)],
    ];
    const win = (a, b, mode) => (mode === 'high' && typeof a === 'number' && typeof b === 'number' && a > b ? 'win' : '');
    render($('cmp-year-table'), html`<thead><tr><th>${S.cmpYear}</th><th>${t('compare_you')}</th><th>${name}</th></tr></thead>
      <tbody>${rows.map(([label, a, b, mode]) => html`<tr><td>${label}</td>
        <td class="${win(a, b, mode)}">${cell(a)}</td><td class="${win(b, a, mode)}">${cell(b)}</td></tr>`)}
        <tr><td>${t('cmpYears_row_shared')}</td><td colspan="2">${num(split.both.length)}</td></tr></tbody>`);

    render($('cmp-year-cols'), [
      beerList(t('compare_both'), split.both, b => rate(b.ratingYou)),
      beerList(t('compare_onlyMe'), split.onlyMine, b => rate(b.ratingYou)),
      beerList(t('compare_onlyThem', name), split.onlyTheirs, b => rate(b.ratingYou)),
    ]);

    render($('cmp-all-years'), html`<thead><tr><th>${t('cmpYears_year')}</th><th>${t('compare_you')}</th><th>${name}</th><th>${t('cmpYears_row_shared')}</th></tr></thead>
      <tbody>${years.map(y => {
        const a = S.built?.years.find(x => x.year === y);
        const b = S.friend.built.years.find(x => x.year === y);
        const both = yearsLib.compareYear(S.built?.byYear.get(y) ?? [], S.friend.built.byYear.get(y) ?? []).both.length;
        return html`<tr><td>${y}</td><td class="${win(a?.beers ?? 0, b?.beers ?? 0, 'high')}">${num(a?.beers ?? 0)}</td>
          <td class="${win(b?.beers ?? 0, a?.beers ?? 0, 'high')}">${num(b?.beers ?? 0)}</td><td>${num(both)}</td></tr>`;
      })}</tbody>`);
  }

  async function syncFriend() {
    const name = S.friend.name;
    if (!name || S.syncing) return;
    S.syncing = true;
    $('cmp-year-btn').hidden = true;
    try {
      const known = (await store.loadHistory(name)).beers;
      const res = await history.sync(name, {
        // Alltid full henting: da erstattes også eldre rader som manglet vennens rangering.
        known, full: true, expected: null,
        onProgress: p => { $('cmp-year-meta').textContent = t('years_syncing', num(p.pages), num(p.fetched)); },
      });
      S.friend.history = await store.saveHistory(name, { beers: res.beers, complete: res.complete });
      S.friend.built = yearsLib.buildYears(res.beers);
    } catch (err) {
      $('cmp-year-meta').textContent = t('years_error', err.message);
    } finally {
      S.syncing = false;
      renderFriendCompare();
    }
  }

  /* ---------- API ---------- */
  function init() {
    $('y-sync-btn').addEventListener('click', () => runSync(!S.history?.complete));
    $('y-sync-stop').addEventListener('click', () => S.controller?.abort());
    $('y-year').addEventListener('change', e => { S.year = Number(e.target.value); renderYear(); renderFriendCompare(); });
    $('cmp-year-btn')?.addEventListener('click', syncFriend);
    renderSync();
    void bootstrap();
  }

  // Finner brukeren og antall unike øl selv, fra det dashbordet allerede har lagret.
  async function bootstrap() {
    const settings = await store.getSettings();
    const user = settings.username || (await store.lastUser());
    if (!user) return;
    const state = await store.load(user);
    await setUser(user, state.snapshots.at(-1)?.data?.stats?.unique ?? null);
  }

  // Kalles av dashbordet når brukeren og antall unike øl er kjent.
  async function setUser(user, expected) {
    if (!user || S.syncing) return;
    const same = S.user && S.user.toLowerCase() === user.toLowerCase();
    S.user = user;
    S.expected = expected ?? S.expected;
    if (!same || !S.history) S.history = await store.loadHistory(user);
    build();
  }

  // Kalles av sammenligningsfanen når en venn er hentet.
  async function setFriend(name) {
    S.friend = { name, history: null, built: null };
    const stored = await store.loadHistory(name);
    if (stored.beers.length) {
      S.friend.history = stored;
      S.friend.built = yearsLib.buildYears(stored.beers);
    }
    renderFriendCompare();
  }

  root.DFU = root.DFU || {};
  root.DFU.yearsView = { init, setUser, setFriend, state: S };
})(globalThis);
