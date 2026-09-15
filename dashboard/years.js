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
    friendSyncing: false,
    friendController: null,
    // Henting av innsjekkingsdatoer, for deg og for vennen.
    checkins: { me: { name: null, running: false, error: null, controller: null }, friend: { name: null, running: false, error: null, controller: null } },
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

  function bars(values, labels, peak, cls, clickable = false) {
    const max = Math.max(1, ...values);
    const height = v => `height:${Math.round(v / max * 78)}%`;
    const bar = (v, i) => (clickable
      ? html`<button type="button" class="b${i === peak && v > 0 ? ' peak' : ''}${i === S.month ? ' sel' : ''}" data-month="${i}" aria-label="${labels[i]}: ${num(v)}" aria-pressed="${i === S.month}">
          <em>${v || ''}</em><i style="${height(v)}"></i></button>`
      : html`<div class="b${i === peak && v > 0 ? ' peak' : ''}"><em>${v || ''}</em><i style="${height(v)}"></i></div>`);
    return html`<div class="year-chart-scroll"><div class="year-chart ${cls}"><div class="bars ${cls}">${values.map(bar)}</div>
      <div class="bar-labels ${cls}">${labels.map(l => html`<span>${l}</span>`)}</div></div></div>`;
  }

  // Dagvisning for én måned, åpnet ved å klikke på en månedssøyle.
  function monthCard(year) {
    const { list, counts } = yearsLib.monthBreakdown(S.history?.beers ?? [], year, S.month);
    const labels = counts.map((_, i) => (i === 0 || (i + 1) % 5 === 0 ? String(i + 1) : ''));
    const peak = list.length ? counts.indexOf(Math.max(...counts)) : -1;
    return html`<div class="card wide" id="y-month">
      <span class="label">${t('month_title', monthLabels()[S.month], year)}</span>
      <span class="note">${t('month_count', num(list.length))}</span>
      ${bars(counts, labels, peak, 'days')}
      <div class="table-wrap"><table class="list"><tbody>${list.map(b => html`<tr>
        <td class="num">${i18n.date(`${b.first}T12:00:00`, { day: 'numeric', month: 'short' })}</td>
        <td>${beerLink(b)}<span class="sub-line">${b.brewery} · ${b.style}</span></td>
        <td class="num">${rate(b.ratingYou)}</td></tr>`)}</tbody></table></div></div>`;
  }

  // Klikk på en månedssøyle åpner eller lukker dagvisningen.
  document.addEventListener('click', e => {
    const btn = e.target.closest?.('#panel-years .bars.months .b');
    if (!btn) return;
    const month = Number(btn.dataset.month);
    S.month = S.month === month ? null : month;
    renderYear();
    if (S.month != null) document.getElementById('y-month')?.scrollIntoView({ block: 'nearest' });
  });

  const listCard = (label, items, value, extra = '', name = x => x.name) => html`<div class="card year-ranking ${extra}">
    <span class="label">${label}</span>
    <ol>${items.map(x => html`<li><span>${name(x)}</span><b>${value(x)}</b></li>`)}</ol></div>`;

  /* ---------- Årskort ---------- */
  function rankingDrilldown(y, kind) {
    const styles = kind === 'styles';
    const items = styles ? y.topStyles : y.topBreweries;
    return html`<div class="card year-ranking-drilldown" data-ranking="${kind}">
      <span class="label">${t(styles ? 'card_topStyles' : 'card_topBreweries')}</span>
      <span class="note">${t('year_rankingHint')}</span>
      <div>${items.map((item, index) => {
        const beers = (S.built.byYear.get(y.year) ?? [])
          .filter(b => (styles ? b.style : b.breweryUrl || b.brewery || null) === item.key)
          .sort((a, b) => (b.ratingYou ?? -1) - (a.ratingYou ?? -1) || a.name.localeCompare(b.name));
        return html`<details class="year-rating-detail"><summary class="year-ranking-row">
          <span class="year-ranking-position">${index + 1}</span><span>${item.name}</span><b>${num(item.count)}</b>
          <span class="year-rating-chevron" aria-hidden="true">›</span></summary>
          <div class="year-rating-beers"><ol>${beers.map(b => html`<li>
            <div>${beerLink(b)}<span class="sub-line">${b.brewery} · ${b.style}</span></div>
            <b>${rate(b.ratingYou)}${b.ratingYou == null ? '' : ' ★'}</b></li>`)}</ol></div>
        </details>`;
      })}</div></div>`;
  }

  function ratingDrilldown(y, count, bucket) {
    const beers = (S.built.byYear.get(y.year) ?? [])
      .filter(b => b.ratingYou != null && b.ratingYou >= bucket &&
        (bucket === 4 ? b.ratingYou <= 5 : b.ratingYou < bucket + 1))
      .sort((a, b) => b.ratingYou - a.ratingYou || a.name.localeCompare(b.name));
    return html`<details class="year-rating-detail"><summary class="year-rating-row">
      <span>${bucket}–${bucket + 1} ★</span><span class="year-rating-track" aria-hidden="true"><i style="width:${count / Math.max(1, ...y.ratingBuckets) * 100}%"></i></span><b>${num(count)}</b>
      <span class="year-rating-chevron" aria-hidden="true">›</span></summary>
      <div class="year-rating-beers">${beers.length ? html`<ol>${beers.map(b => html`<li>
        <div>${beerLink(b)}<span class="sub-line">${b.brewery} · ${b.style}</span></div>
        <b>${rate(b.ratingYou)} ★</b></li>`)}</ol>` : html`<p class="note">${t('year_ratingEmpty')}</p>`}</div>
    </details>`;
  }

  // Spesialmerker og maks nivå nådd i året, fra merkefanen. Vises bare når det finnes noen.
  function badgeSection(year) {
    const view = root.DFU.badgesView;
    if (!view || !root.DFU.badges) return '';
    const { maxed, special } = root.DFU.badges.inYear(view.badges(), year, view.showOpts());
    if (!maxed.length && !special.length) return '';
    return html`<section class="year-section" aria-labelledby="year_badges">
      <h2 id="year_badges">${t('year_badges')}</h2>
      <div class="card wide"><span class="note">${[
        special.length ? t(special.length === 1 ? 'year_badgesSpecialOne' : 'year_badgesSpecial', num(special.length)) : '',
        maxed.length ? t('year_badgesMaxed', num(maxed.length)) : '',
      ].filter(Boolean).join(' · ')}</span>
        <div class="badge-grid">${maxed.map(b => view.tile(b, { maxed: true }))}${special.map(b => view.tile(b))}</div></div>
    </section>`;
  }

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
        <span class="note">${y.strongest ? t('card_strongest', '{0}', y.strongest.abv.toLocaleString(i18n.locale())).split('{0}').map((part, i) => html`${i ? beerLink(y.strongest) : ''}${part}`) : ''}</span></div>`,
      html`<div class="card"><span class="label">${t('card_topRated')}</span>
        <span class="value small">${beerLink(y.topRated[0])}</span>
        <span class="note">${y.topRated[0] ? `${y.topRated[0].brewery} · ${rate(y.topRated[0].ratingYou)}` : '–'}</span></div>`,
      listCard(t('card_top5'), y.topRated, b => rate(b.ratingYou), '', beerLink),
      listCard(t('card_lowest'), y.lowestRated, b => rate(b.ratingYou), '', beerLink),
      rankingDrilldown(y, 'styles'),
      rankingDrilldown(y, 'breweries'),
      html`<div class="card"><span class="label">${t('card_firstLast')}</span>
        <span class="note">${t('card_first', '')} ${beerLink(y.firstBeer)} · ${y.firstBeer ? i18n.date(y.firstBeer.first) : ''}</span>
        <span class="note">${t('card_last', '')} ${beerLink(y.lastBeer)} · ${y.lastBeer ? i18n.date(y.lastBeer.first) : ''}</span></div>`,
      html`<div class="card wide"><span class="label">${t('card_months')}</span><span class="note">${t('card_monthsHint')}</span>
        ${bars(y.months, monthLabels(), y.busiestMonth, 'months', true)}</div>`,
      S.month != null ? monthCard(y.year) : '',
      html`<div class="card wide"><span class="label">${t('card_weekdays')}</span>${bars(y.weekdays, weekdayLabels(), y.busiestWeekday, 'weekdays')}</div>`,
    ];
    const [beers, breweries, styles, rating, abv, favorite, top, lowest, topStyles, topBreweries, firstLast, months, month, weekdays] = cards;
    const section = (key, content, cls) => html`<section class="year-section" aria-labelledby="${key}">
      <h2 id="${key}">${t(key)}</h2><div class="${cls}">${content}</div></section>`;
    render($('y-cards'), [
      html`<header class="year-hero"><div><span class="year-eyebrow">${t('year_recap')}</span>
        <h2>${t('year_headline', y.year)}</h2><p>${t('year_intro')}</p>
        <span class="year-scope">${t('years_note')}</span></div>
        <span class="year-stamp" aria-hidden="true">${y.year}</span></header>`,
      section('year_overview', [beers, breweries, styles], 'year-metrics'),
      section('year_discoveries', [
        html`<div class="card year-spotlight"><span class="label">${t('year_signature')}</span>
          <span class="value small">${y.topStyles[0]?.name ?? '–'}</span>
          <span class="note">${y.topStyles[0] ? t('year_styleShare', num(y.topStyles[0].count), num(Math.round(y.topStyles[0].count / y.beers * 100))) : '–'}</span></div>`,
        html`<div class="card"><span class="label">${t('year_discoveryDays')}</span><span class="value">${num(y.discoveryDays)}</span>
          <span class="note">${t('year_activeMonths', num(y.activeMonths))}</span></div>`,
        html`<div class="card"><span class="label">${t('year_peakMonth')}</span>
          <span class="value small">${new Intl.DateTimeFormat(i18n.locale(), { month: 'long' }).format(new Date(y.year, y.busiestMonth, 1))}</span>
          <span class="note">${t('year_peakCount', num(y.months[y.busiestMonth]))}</span></div>`,
      ], 'year-highlights'),
      section('year_activity', [months, month, weekdays], 'year-activity'),
      section('year_ratings', html`<div class="card"><span class="note">${t('year_ratingsNote', num(y.ratedCount), num(y.beers))}</span>
        <span class="note">${t('year_ratingHint')}</span>
        <div class="year-rating-dist">${y.ratingBuckets.map((count, i) => ratingDrilldown(y, count, i))}</div>${y.ratedCount ? '' : html`<span class="note">${t('year_noRatings')}</span>`}</div>`, 'year-activity'),
      badgeSection(y.year),
      section('year_favorites', [top, lowest, topStyles, topBreweries], 'year-rankings'),
      section('year_details', [favorite, firstLast, rating, abv], 'year-details'),
    ]);
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
    document.dispatchEvent(new CustomEvent('dfu:history'));
    if (!S.built.years.length && S.history?.beers?.length) $('y-summary').textContent = t('years_none');
    if (S.friend.name) void syncCheckinDates('me');
  }

  // Henter datoene for innsjekkinger historikken ikke plasserer i et år, og lagrer dem på ølene.
  async function syncCheckinDates(who) {
    const friend = who === 'friend';
    const job = S.checkins[who];
    const name = friend ? S.friend.name : S.user;
    const record = () => (friend ? S.friend.history : S.history);
    if (!name || (friend ? S.friendSyncing : S.syncing) || (job.running && job.name === name)) return;
    const wanted = (record()?.beers ?? []).filter(yearsLib.needsCheckinDates);
    if (!wanted.length) return;
    job.controller?.abort();
    const controller = new AbortController();
    Object.assign(job, { name, running: true, error: null, controller });
    const current = () => job.controller === controller && (friend ? S.friend.name : S.user) === name;
    const task = $(friend ? 'cmp-task-checkins-friend' : 'cmp-task-checkins-me');
    const eta = newEta();
    const show = p => {
      const { fraction, remainingMs } = eta.update(p.index, wanted.length);
      root.DFU.progress.showTask(task, {
        label: t('progress_checkinsLabel', name),
        detail: t('progress_checkinsDetail', num(Math.min(p.index + 1, wanted.length)), num(wanted.length), num(p.pages)),
        fraction,
        eta: root.DFU.progress.formatEta(remainingMs, t),
      });
    };
    // Legger datoene inn i den lagrede historikken uten å endre når den sist ble hentet.
    const save = async dates => {
      const latest = record();
      if (!current() || !latest?.beers?.length) return;
      const beers = latest.beers.map(b => (dates[b.id] ? { ...b, checkinDates: dates[b.id] } : b));
      const saved = await store.saveHistory(name, { beers, complete: latest.complete, syncedAt: latest.syncedAt });
      if (!current()) return;
      if (friend) { S.friend.history = saved; S.friend.built = yearsLib.buildYears(saved.beers); } else { S.history = saved; S.built = yearsLib.buildYears(saved.beers); }
      renderFriendCompare();
    };
    show({ index: 0, pages: 0 });
    renderFriendCompare();
    try {
      const res = await history.syncCheckins(name, {
        beers: wanted, self: !friend, signal: controller.signal,
        onProgress: p => { if (current()) show(p); },
        onCheckpoint: ({ dates }) => save(dates),
      });
      await save(res.dates);
      if (current() && res.stopped !== 'aborted' && !res.complete) job.error = t('cmpYears_checkinsIncomplete');
    } catch (err) {
      if (current()) job.error = err.message;
    } finally {
      if (job.controller === controller) {
        job.running = false;
        job.controller = null;
        root.DFU.progress.hideTask(task);
        renderFriendCompare();
      }
    }
  }

  /* ---------- Henting ---------- */
  function renderSync() {
    const h = S.history;
    const pages = S.expected ? Math.ceil(S.expected / history.PAGE_SIZE) : null;
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
      $('y-sync-text').textContent = '';
    }
  }

  const pageCount = expected => (expected ? Math.ceil(expected / history.PAGE_SIZE) : null);
  const newEta = () => root.DFU.progress.createEta({ fallbackMs: history.DELAY_MS + 400 });

  function progress(p) {
    const { remainingMs } = S.eta.update(p.pages, pageCount(S.expected));
    const left = root.DFU.progress.formatEta(remainingMs, t);
    $('y-sync-text').textContent = [t('years_syncing', num(p.pages), num(p.fetched)), left].filter(Boolean).join(' · ');
    if (S.expected) $('y-progress').firstElementChild.style.width = `${Math.min(100, Math.round(p.fetched / S.expected * 100))}%`;
  }

  async function runSync(full) {
    if (S.syncing || !S.user) return;
    S.syncing = true;
    S.controller = new AbortController();
    S.eta = newEta();
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
    <ol>${beers.slice(0, 200).map(b => html`<li><span>${beerLink(b)}</span><span>${value(b)}</span></li>`)}
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

    if (!S.friend.built) {
      if (S.friendSyncing) $('cmp-year-meta').textContent ||= t('cmpYears_loading', name);
      $('cmp-year-bar').hidden = true;
      $('cmp-all-title').hidden = true;
      if ($('cmp-year-chart')) render($('cmp-year-chart'), '');
      for (const id of ['cmp-year-table', 'cmp-year-cols', 'cmp-all-years']) render($(id), '');
      $('cmp-year-note').textContent = '';
      return;
    }

    const years = comparableYears();
    if (!years.includes(S.cmpYear)) S.cmpYear = years[0] ?? null;
    // Fremdriften vises i oppgaveraden øverst, så meldingsfeltet kan tømmes.
    $('cmp-year-meta').textContent = '';
    $('cmp-year-bar').hidden = false;
    $('cmp-all-title').hidden = false;
    render($('cmp-year-select'), years.map(y => html`<option value="${y}"${y === S.cmpYear ? raw(' selected') : ''}>${y}</option>`));
    $('cmp-year-select').onchange = e => { S.cmpYear = Number(e.target.value); renderFriendCompare(); };

    const mine = S.built?.years.find(y => y.year === S.cmpYear);
    const theirs = S.friend.built.years.find(y => y.year === S.cmpYear);
    const split = yearsLib.compareYear(S.built?.byYear.get(S.cmpYear) ?? [], S.friend.built.byYear.get(S.cmpYear) ?? []);
    $('cmp-year-summary').textContent = t('compare_summary', num(split.both.length), num(split.onlyMine.length), num(split.onlyTheirs.length), name);

    const monthly = Array.from({ length: 12 }, (_, i) => [mine?.months[i] ?? 0, theirs?.months[i] ?? 0]);
    const maxMonthly = Math.max(1, ...monthly.flat());
    if ($('cmp-year-chart')) render($('cmp-year-chart'), html`<section class="cmp-chart-card">
      <h3>${t('compare_monthly')}</h3><p class="meta">${t('years_note')}</p>
      <div class="cmp-legend"><span><i class="mine"></i>${t('compare_you')}</span><span><i class="theirs"></i>${name}</span></div>
      <div class="cmp-months">${monthly.map(([a, b], i) => html`<div class="cmp-month">
        <span class="cmp-month-label">${monthLabels()[i]}</span>
        <div class="cmp-pair"><div><span class="cmp-meter" aria-hidden="true"><i class="mine" style="width:${a / maxMonthly * 100}%"></i></span><b aria-label="${t('compare_you')}: ${num(a)}">${num(a)}</b></div>
        <div><span class="cmp-meter" aria-hidden="true"><i class="theirs" style="width:${b / maxMonthly * 100}%"></i></span><b aria-label="${name}: ${num(b)}">${num(b)}</b></div></div>
      </div>`)}</div></section>`);
    const months = new Intl.DateTimeFormat(i18n.locale(), { month: 'long' });
    const monthName = y => (y && y.beers ? months.format(new Date(2025, y.busiestMonth, 1)) : null);
    // Innsjekkinger og unike øl vises først når alle datoene for året er kjent.
    const yearCount = (built, key, year = S.cmpYear) => built?.[key]?.get(year) ?? { count: 0, pending: false };
    const jobs = [S.checkins.me, S.checkins.friend];
    const loading = jobs.some(j => j.running) || S.friendSyncing;
    const countCell = c => (c.pending ? (loading ? '…' : '–') : num(c.count));
    const known = c => (c.pending ? null : c.count);
    const countRow = (label, key) => {
      const [a, b] = [yearCount(S.built, key), yearCount(S.friend.built, key)];
      return [label, known(a), known(b), 'high', [countCell(a), countCell(b)]];
    };
    const pending = ['checkins', 'unique'].some(key => yearCount(S.built, key).pending || yearCount(S.friend.built, key).pending);
    const rows = [
      countRow(t('cmpYears_row_checkins'), 'checkins'),
      countRow(t('cmpYears_row_unique'), 'unique'),
      [t('cmpYears_row_beers'), mine?.beers ?? 0, theirs?.beers ?? 0, 'high'],
      [t('cmpYears_row_breweries'), mine?.breweries ?? 0, theirs?.breweries ?? 0, 'high'],
      [t('cmpYears_row_styles'), mine?.styles ?? 0, theirs?.styles ?? 0, 'high'],
      [t('cmpYears_row_rated'), mine?.ratedCount ?? 0, theirs?.ratedCount ?? 0, 'high'],
      [t('cmpYears_row_avgRating'), mine?.avgRating ?? null, theirs?.avgRating ?? null, 'high'],
      [t('cmpYears_row_avgAbv'), mine?.avgAbv ?? null, theirs?.avgAbv ?? null, 'high'],
      [t('cmpYears_row_strongest'), beerLink(mine?.strongest), beerLink(theirs?.strongest)],
      [t('cmpYears_row_topStyle'), mine?.topStyles[0]?.name ?? null, theirs?.topStyles[0]?.name ?? null],
      [t('cmpYears_row_topBrewery'), mine?.topBreweries[0]?.name ?? null, theirs?.topBreweries[0]?.name ?? null],
      [t('cmpYears_row_busiestMonth'), monthName(mine), monthName(theirs)],
    ];
    const win = (a, b, mode) => (mode === 'high' && typeof a === 'number' && typeof b === 'number' && a > b ? 'win' : '');
    render($('cmp-year-table'), html`<thead><tr><th>${S.cmpYear}</th><th>${t('compare_you')}</th><th>${name}</th></tr></thead>
      <tbody>${rows.map(([label, a, b, mode, shown = [cell(a), cell(b)]]) => html`<tr><td>${label}</td>
        <td class="${win(a, b, mode)}">${shown[0]}</td><td class="${win(b, a, mode)}">${shown[1]}</td></tr>`)}
        <tr><td>${t('cmpYears_row_shared')}</td><td colspan="2">${num(split.both.length)}</td></tr></tbody>`);
    const errors = jobs.map(j => j.error).filter(Boolean);
    $('cmp-year-note').textContent = !pending ? ''
      : loading ? t('cmpYears_checkinsLoading')
      : errors.length ? t('years_error', errors.join(' · ')) : t('cmpYears_checkinsIncomplete');

    render($('cmp-year-cols'), [
      beerList(t('compare_both'), split.both, b => rate(b.ratingYou)),
      beerList(t('compare_onlyMe'), split.onlyMine, b => rate(b.ratingYou)),
      beerList(t('compare_onlyThem', name), split.onlyTheirs, b => rate(b.ratingYou)),
    ]);

    const pair = (a, b, shown = [num(a), num(b)]) => html`<td class="${win(a, b, 'high')}">${shown[0]}</td><td class="${win(b, a, 'high')}">${shown[1]}</td>`;
    render($('cmp-all-years'), html`<thead>
        <tr><th rowspan="2">${t('cmpYears_year')}</th><th colspan="2">${t('cmpYears_col_checkins')}</th><th colspan="2">${t('cmpYears_col_new')}</th><th rowspan="2">${t('cmpYears_row_shared')}</th></tr>
        <tr><th>${t('compare_you')}</th><th>${name}</th><th>${t('compare_you')}</th><th>${name}</th></tr></thead>
      <tbody>${years.map(y => {
        const a = S.built?.years.find(x => x.year === y);
        const b = S.friend.built.years.find(x => x.year === y);
        const [ca, cb] = [yearCount(S.built, 'checkins', y), yearCount(S.friend.built, 'checkins', y)];
        const both = yearsLib.compareYear(S.built?.byYear.get(y) ?? [], S.friend.built.byYear.get(y) ?? []).both.length;
        return html`<tr><td>${y}</td>${pair(known(ca), known(cb), [countCell(ca), countCell(cb)])}
          ${pair(a?.beers ?? 0, b?.beers ?? 0)}<td>${num(both)}</td></tr>`;
      })}</tbody>`);
  }

  // Henter vennens historikk. Egen henting bruker S.syncing, så de to blokkerer ikke hverandre.
  async function syncFriend(name, known, expected) {
    const controller = new AbortController();
    S.friendController = controller;
    S.friendSyncing = true;
    const current = () => S.friend.name === name && S.friendController === controller;
    const task = $('cmp-task-history');
    const eta = newEta();
    const totalPages = pageCount(expected);
    const show = p => {
      const { fraction, remainingMs } = eta.update(p.pages, totalPages);
      root.DFU.progress.showTask(task, {
        label: t('cmpYears_loading', name),
        detail: totalPages
          ? t('progress_historyDetail', num(Math.min(p.pages, totalPages)), num(totalPages), num(p.fetched))
          : t('years_syncing', num(p.pages), num(p.fetched)),
        fraction: expected ? Math.min(1, p.fetched / expected) : fraction,
        eta: root.DFU.progress.formatEta(remainingMs, t),
      });
    };
    $('cmp-year-meta').textContent = '';
    show({ pages: 0, fetched: 0 });
    renderFriendCompare();
    try {
      const res = await history.sync(name, {
        // Alltid full henting: da erstattes også eldre rader som manglet vennens rangering.
        known, full: true, expected, signal: controller.signal,
        onProgress: p => { if (current() && !p.done) show(p); },
      });
      // Avbrutt betyr at en annen venn er valgt. Da lagres ikke den halve hentingen.
      if (res.stopped === 'aborted') return;
      const saved = await store.saveHistory(name, { beers: res.beers, complete: res.complete });
      if (!current()) return;
      S.friend.history = saved;
      S.friend.built = yearsLib.buildYears(res.beers);
      $('cmp-year-meta').textContent = '';
    } catch (err) {
      if (current()) $('cmp-year-meta').textContent = t('years_error', err.message);
    } finally {
      if (S.friendController === controller) {
        root.DFU.progress.hideTask(task);
        S.friendSyncing = false;
        S.friendController = null;
        renderFriendCompare();
        document.dispatchEvent(new CustomEvent('dfu:friend-history'));
        void syncCheckinDates('friend');
      }
    }
  }

  /* ---------- API ---------- */
  function init() {
    $('y-sync-stop').addEventListener('click', () => S.controller?.abort());
    $('y-year').addEventListener('change', e => { S.year = Number(e.target.value); renderYear(); renderFriendCompare(); });
    document.addEventListener('dfu:badges', () => renderYear());
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

  // Kalles av sammenligningsfanen når en venn er hentet. Historikken hentes automatisk
  // når den mangler, er ufullstendig, er gammel eller vennen har flere unike øl enn lagret.
  // force (Oppdater-knappen) henter historikken selv om den er ny.
  async function setFriend(name, expected = null, { force = false } = {}) {
    if (S.friend.name !== name) {
      S.friendController?.abort();
      S.friendController = null;
      S.friendSyncing = false;
      root.DFU.progress.hideTask($('cmp-task-history'));
      const job = S.checkins.friend;
      job.controller?.abort();
      Object.assign(job, { name: null, running: false, error: null, controller: null });
      root.DFU.progress.hideTask($('cmp-task-checkins-friend'));
    }
    S.friend = { name, history: null, built: null };
    if (!S.friendSyncing) $('cmp-year-meta').textContent = '';
    const [stored, settings] = await Promise.all([store.loadHistory(name), store.getSettings()]);
    if (S.friend.name !== name) return;
    if (stored.beers.length) {
      S.friend.history = stored;
      S.friend.built = yearsLib.buildYears(stored.beers);
    }
    renderFriendCompare();
    document.dispatchEvent(new CustomEvent('dfu:friend-history'));
    const fresh = !force && stored.beers.length > 0 && stored.complete && stored.syncedAt != null &&
      Date.now() - stored.syncedAt < settings.staleHours * 3600000 &&
      (expected == null || expected <= stored.count);
    void syncCheckinDates('me');
    if (!fresh && !S.friendSyncing) void syncFriend(name, stored.beers, expected);
    else void syncCheckinDates('friend');
  }

  root.DFU = root.DFU || {};
  root.DFU.yearsView = { init, setUser, setFriend, refresh: () => runSync(!S.history?.complete), state: S };
})(globalThis);
