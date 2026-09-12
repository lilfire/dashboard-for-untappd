// Fanen «År»: årsoppsummering regnet ut fra hele ølhistorikken, og året side om side med en venn.
(function (root) {
  const { i18n, store, history, years: yearsLib } = root.DFU;
  const { html, render } = root.DFU.html;
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
    if (!h?.syncedAt) {
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
  function renderFriendCompare() {
    const box = $('cmp-years');
    if (!box) return;
    const name = S.friend.name;
    box.hidden = !name;
    if (!name) return;
    $('cmp-year-btn').textContent = t('cmpYears_btn', name);
    $('cmp-year-btn').hidden = S.syncing;
    const mine = S.built?.years.find(y => y.year === S.year);
    const theirs = S.friend.built?.years.find(y => y.year === S.year);
    if (!theirs) {
      $('cmp-year-meta').textContent = t('cmpYears_hint', name);
      render($('cmp-year-table'), '');
      return;
    }
    $('cmp-year-meta').textContent = `${S.year}`;
    const shared = yearsLib.compareYear(S.built.byYear.get(S.year) ?? [], S.friend.built.byYear.get(S.year) ?? []).both.length;
    const rows = [
      [t('cmpYears_row_beers'), mine?.beers ?? 0, theirs.beers],
      [t('cmpYears_row_breweries'), mine?.breweries ?? 0, theirs.breweries],
      [t('cmpYears_row_styles'), mine?.styles ?? 0, theirs.styles],
      [t('cmpYears_row_avgRating'), mine?.avgRating ?? null, theirs.avgRating],
    ];
    render($('cmp-year-table'), html`<thead><tr><th>${S.year}</th><th>${t('compare_you')}</th><th>${name}</th></tr></thead>
      <tbody>${rows.map(([label, a, b]) => html`<tr><td>${label}</td>
        <td class="${a != null && b != null && a > b ? 'win' : ''}">${a == null ? '–' : typeof a === 'number' && !Number.isInteger(a) ? rate(a) : num(a)}</td>
        <td class="${a != null && b != null && b > a ? 'win' : ''}">${b == null ? '–' : typeof b === 'number' && !Number.isInteger(b) ? rate(b) : num(b)}</td></tr>`)}
        <tr><td>${t('cmpYears_row_shared')}</td><td colspan="2">${num(shared)}</td></tr></tbody>`);
  }

  async function syncFriend() {
    const name = S.friend.name;
    if (!name || S.syncing) return;
    S.syncing = true;
    $('cmp-year-btn').hidden = true;
    try {
      const known = (await store.loadHistory(name)).beers;
      const res = await history.sync(name, {
        known, full: !known.length, expected: null,
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
    S.user = user;
    S.expected = expected ?? null;
    S.history = await store.loadHistory(user);
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
