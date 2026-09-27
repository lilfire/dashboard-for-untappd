// Fanen «År»: årsoppsummering regnet ut fra hele ølhistorikken, og året side om side med vennene.
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
    // Visning: et helt år eller en valgfri periode for deg; sammenligningen kan også vise hele tiden.
    view: { mode: 'year', preset: 'weekend', from: null, to: null },
    cmpView: { mode: 'all', preset: 'weekend', from: null, to: null },
    // Hva «Alle år» viser når flere enn to sammenlignes: 'checkins' eller 'new'.
    allYearsMetric: 'checkins',
    // Vennene i sammenligningen, i rekkefølgen de ble lagt til: navn → { name, history, built, syncing, controller, checkins }.
    friends: new Map(),
    // Henting av innsjekkingsdatoer for deg; vennenes ligger på hver venn.
    checkins: { me: { name: null, running: false, error: null, controller: null } },
  };
  const newJob = () => ({ name: null, running: false, error: null, controller: null });
  const cmpTasks = () => $('cmp-tasks');
  const taskFor = key => root.DFU.progress?.taskFor?.(cmpTasks(), key) ?? null;

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
  // list: ølene kortet gjelder (året eller perioden).
  function rankingDrilldown(y, kind, list, hint = t('year_rankingHint')) {
    const styles = kind === 'styles';
    const items = styles ? y.topStyles : y.topBreweries;
    return html`<div class="card year-ranking-drilldown" data-ranking="${kind}">
      <span class="label">${t(styles ? 'card_topStyles' : 'card_topBreweries')}</span>
      <span class="note">${hint}</span>
      <div>${items.map((item, index) => {
        const beers = list
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

  function ratingDrilldown(y, count, bucket, list, empty = t('year_ratingEmpty')) {
    const beers = list
      .filter(b => b.ratingYou != null && b.ratingYou >= bucket &&
        (bucket === 4 ? b.ratingYou <= 5 : b.ratingYou < bucket + 1))
      .sort((a, b) => b.ratingYou - a.ratingYou || a.name.localeCompare(b.name));
    return html`<details class="year-rating-detail"><summary class="year-rating-row">
      <span>${bucket}–${bucket + 1} ★</span><span class="year-rating-track" aria-hidden="true"><i style="width:${count / Math.max(1, ...y.ratingBuckets) * 100}%"></i></span><b>${num(count)}</b>
      <span class="year-rating-chevron" aria-hidden="true">›</span></summary>
      <div class="year-rating-beers">${beers.length ? html`<ol>${beers.map(b => html`<li>
        <div>${beerLink(b)}<span class="sub-line">${b.brewery} · ${b.style}</span></div>
        <b>${rate(b.ratingYou)} ★</b></li>`)}</ol>` : html`<p class="note">${empty}</p>`}</div>
    </details>`;
  }

  // Spesialmerker og maks nivå nådd i året, fra merkefanen. Vises bare når det finnes noen.
  function badgeSection(from, to, title = 'year_badges') {
    const view = root.DFU.badgesView;
    if (!view || !root.DFU.badges) return '';
    const { maxed, special } = root.DFU.badges.inRange(view.badges(), from, to, view.showOpts());
    if (!maxed.length && !special.length) return '';
    return html`<section class="year-section" aria-labelledby="${title}">
      <h2 id="${title}">${t(title)}</h2>
      <div class="card wide"><span class="note">${[
        special.length ? t(special.length === 1 ? 'year_badgesSpecialOne' : 'year_badgesSpecial', num(special.length)) : '',
        maxed.length ? t('year_badgesMaxed', num(maxed.length)) : '',
      ].filter(Boolean).join(' · ')}</span>
        <div class="badge-grid">${maxed.map(b => view.tile(b, { maxed: true }))}${special.map(b => view.tile(b))}</div></div>
    </section>`;
  }

  function renderYear() {
    if (S.view.mode === 'period') { renderPeriod(); return; }
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
      rankingDrilldown(y, 'styles', S.built.byYear.get(y.year) ?? []),
      rankingDrilldown(y, 'breweries', S.built.byYear.get(y.year) ?? []),
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
        <div class="year-rating-dist">${y.ratingBuckets.map((count, i) => ratingDrilldown(y, count, i, S.built.byYear.get(y.year) ?? []))}</div>${y.ratedCount ? '' : html`<span class="note">${t('year_noRatings')}</span>`}</div>`, 'year-activity'),
      badgeSection(`${y.year}-01-01`, `${y.year}-12-31`),
      section('year_favorites', [top, lowest, topStyles, topBreweries], 'year-rankings'),
      section('year_details', [favorite, firstLast, rating, abv], 'year-details'),
    ]);
    $('y-summary').textContent = t('year_summary', num(y.beers), num(y.breweries), num(y.styles));
  }

  /* ---------- Valgfri periode ---------- */
  const rangeLabel = (from, to) => {
    const f = new Intl.DateTimeFormat(i18n.locale(), { day: 'numeric', month: 'short', year: 'numeric' });
    const [a, b] = [new Date(`${from}T12:00:00`), new Date(`${to}T12:00:00`)];
    return from === to ? f.format(a) : (f.formatRange ? f.formatRange(a, b) : `${f.format(a)} – ${f.format(b)}`);
  };

  // Etiketter for søylene i en periode: ukedag og dato for korte perioder, dag i måneden ellers.
  function periodLabels({ unit, keys }) {
    const loc = i18n.locale();
    if (unit === 'month') {
      const spans = keys[0].slice(0, 4) !== keys.at(-1).slice(0, 4);
      const f = new Intl.DateTimeFormat(loc, spans ? { month: 'short', year: '2-digit' } : { month: 'short' });
      return keys.map(k => f.format(new Date(`${k}-15T12:00:00`)));
    }
    if (keys.length <= 14) {
      const f = new Intl.DateTimeFormat(loc, { weekday: 'short', day: 'numeric' });
      return keys.map(k => f.format(new Date(`${k}T12:00:00`)));
    }
    return keys.map((k, i) => {
      const day = Number(k.slice(8, 10));
      return i === 0 || day === 1 || day % 5 === 0 ? String(day) : '';
    });
  }

  const periodTag = b => html`<span class="period-tag${b.again ? ' again' : ''}">${t(b.again ? 'period_tagAgain' : 'period_tagNew')}</span>`;

  // Merknad om øl som kan ha vært drukket igjen i perioden, med knapp for å hente datoene.
  function uncertainNote(count, jobs, id) {
    const running = jobs.some(j => j.running);
    if (!count && !running) return '';
    const errors = jobs.map(j => j.error).filter(Boolean);
    return html`<div class="card wide period-uncertain">
      <span class="note">${running ? t('period_fetching') : t('period_uncertain', num(count))}</span>
      ${errors.length && !running ? html`<span class="note">${t('years_error', errors.join(' · '))}</span>` : ''}
      ${running ? '' : html`<div><button class="btn" type="button" id="${id}">${t('period_fetchDates')}</button></div>`}</div>`;
  }

  function renderPeriod() {
    const p = yearsLib.periodStats(S.history?.beers ?? [], S.view.from, S.view.to);
    if (!p) { render($('y-cards'), ''); $('y-summary').textContent = ''; return; }
    const peak = p.beers ? p.days.counts.indexOf(Math.max(...p.days.counts)) : -1;
    const section = (key, content, cls) => html`<section class="year-section" aria-labelledby="${key}">
      <h2 id="${key}">${t(key)}</h2><div class="${cls}">${content}</div></section>`;
    const top = p.topStyles[0];
    const has = p.beers > 0;
    render($('y-cards'), [
      html`<header class="year-hero"><div><span class="year-eyebrow">${t('period_recap')}</span>
        <h2>${t('year_headline', rangeLabel(p.from, p.to))}</h2><p>${t('period_intro')}</p>
        <span class="year-scope">${t('period_note')}</span></div></header>`,
      uncertainNote(p.uncertain, [S.checkins.me], 'y-fetch-dates'),
      section('period_overview', [
        html`<div class="card"><span class="label">${t('card_periodBeers')}</span><span class="value">${num(p.beers)}</span>
          <span class="note">${t('period_activeDays', num(p.discoveryDays), num(p.length))}</span></div>`,
        html`<div class="card"><span class="label">${t('card_newBeers')}</span><span class="value">${num(p.freshCount)}</span>
          <span class="note">${t('period_freshNote')}</span></div>`,
        html`<div class="card"><span class="label">${t('card_again')}</span><span class="value">${num(p.againCount)}</span>
          <span class="note">${t('card_againNote')}</span></div>`,
        html`<div class="card"><span class="label">${t('card_newBreweries')}</span><span class="value">${num(p.breweries)}</span>
          <span class="note">${p.newBreweries.slice(0, 3).join(', ')}${p.newBreweries.length > 3 ? ' …' : ''}</span></div>`,
        html`<div class="card"><span class="label">${t('card_newStyles')}</span><span class="value">${num(p.styles)}</span>
          <span class="note">${p.newStyles.slice(0, 3).join(', ')}${p.newStyles.length > 3 ? ' …' : ''}</span></div>`,
      ], 'year-metrics'),
      has ? '' : html`<p class="note">${t('period_empty')}</p>`,
      has ? section('period_activity', [
        p.length > 1 ? html`<div class="card wide"><span class="label">${t(p.days.unit === 'month' ? 'card_periodMonths' : 'card_days')}</span>
          ${bars(p.days.counts, periodLabels(p.days), peak, p.days.unit === 'month' ? 'months' : 'days')}</div>` : '',
        p.length > 7 ? html`<div class="card wide"><span class="label">${t('card_periodWeekdays')}</span>${bars(p.weekdays, weekdayLabels(), p.busiestWeekday, 'weekdays')}</div>` : '',
        html`<div class="card wide" id="y-period-list"><span class="label">${t('period_list')}</span>
          <div class="table-wrap"><table class="list"><tbody>${p.list.map(b => html`<tr>
            <td class="num">${i18n.date(`${b.seen}T12:00:00`, { day: 'numeric', month: 'short' })}</td>
            <td>${beerLink(b)} ${periodTag(b)}<span class="sub-line">${b.brewery} · ${b.style}</span></td>
            <td class="num">${rate(b.ratingYou)}</td></tr>`)}</tbody></table></div></div>`,
      ], 'year-activity') : '',
      has ? section('year_ratings', html`<div class="card"><span class="note">${t('period_ratingsNote', num(p.ratedCount), num(p.beers))}</span>
        <span class="note">${t('year_ratingHint')}</span>
        <div class="year-rating-dist">${p.ratingBuckets.map((count, i) => ratingDrilldown(p, count, i, p.list, t('period_ratingEmpty')))}</div>${p.ratedCount ? '' : html`<span class="note">${t('year_noRatings')}</span>`}</div>`, 'year-activity') : '',
      badgeSection(p.from, p.to, 'period_badges'),
      has ? section('year_favorites', [
        listCard(t('period_top5'), p.topRated, b => rate(b.ratingYou), '', beerLink),
        listCard(t('card_lowest'), p.lowestRated, b => rate(b.ratingYou), '', beerLink),
        rankingDrilldown(p, 'styles', p.list, t('period_rankingHint')),
        rankingDrilldown(p, 'breweries', p.list, t('period_rankingHint')),
      ], 'year-rankings') : '',
      has ? section('period_details', [
        html`<div class="card year-spotlight"><span class="label">${t('period_signature')}</span>
          <span class="value small">${top?.name ?? '–'}</span>
          <span class="note">${top ? t('period_styleShare', num(top.count), num(Math.round(top.count / p.beers * 100))) : '–'}</span></div>`,
        html`<div class="card"><span class="label">${t('card_avgRating')}</span><span class="value">${rate(p.avgRating)}</span>
          <span class="note">${t('card_ratedOf', num(p.ratedCount), num(p.beers))}${p.generosity == null ? '' : ` · ${t('card_vsGlobal', signed(p.generosity))}`}</span></div>`,
        html`<div class="card"><span class="label">${t('card_avgAbv')}</span><span class="value">${p.avgAbv == null ? '–' : `${p.avgAbv.toLocaleString(i18n.locale())} %`}</span>
          <span class="note">${p.strongest ? t('card_strongest', '{0}', p.strongest.abv.toLocaleString(i18n.locale())).split('{0}').map((part, i) => html`${i ? beerLink(p.strongest) : ''}${part}`) : ''}</span></div>`,
      ], 'year-details') : '',
    ]);
    $('y-summary').textContent = t('period_summary', num(p.beers), num(p.freshCount), num(p.againCount));
  }

  // Henter datoene for øl som kan ha vært drukket igjen i perioden.
  document.addEventListener('click', e => {
    const mine = e.target.closest?.('#y-fetch-dates');
    const cmp = e.target.closest?.('#cmp-fetch-dates');
    if (!mine && !cmp) return;
    const { from, to } = mine ? S.view : S.cmpView;
    const filter = b => yearsLib.needsDatesInRange(b, from, to);
    void syncCheckinDates('me', filter);
    if (cmp) for (const name of S.friends.keys()) void syncCheckinDates(name, filter);
  });

  function applyPreset(view, preset) {
    view.preset = preset;
    const range = yearsLib.presetRange(preset);
    if (range) Object.assign(view, range);
  }

  // Kobler velgeren for år eller periode. ids: modus, årsvelger, periodeboks, forhåndsvalg, fra, til.
  function setupPeriodControls(ids, view, onChange, modes = ['year', 'period']) {
    const [mode, year, box, preset, from, to] = ids.map($);
    if (!mode) return;
    render(mode, modes.map(m => html`<option value="${m}">${t(`period_mode_${m}`)}</option>`));
    render(preset, [...yearsLib.PRESETS, 'custom'].map(p => html`<option value="${p}">${t(`period_preset_${p}`)}</option>`));
    if (!view.from) applyPreset(view, view.preset);
    const sync = () => {
      mode.value = view.mode;
      box.hidden = view.mode !== 'period';
      year.hidden = view.mode !== 'year';
      preset.value = view.preset;
      // Datofeltene vises bare for en egendefinert periode.
      for (const input of [from, to]) input.closest('label').hidden = view.preset !== 'custom';
      from.value = view.from;
      to.value = view.to;
    };
    const changed = () => { sync(); onChange(); };
    mode.addEventListener('change', () => { view.mode = mode.value; changed(); });
    preset.addEventListener('change', () => {
      if (preset.value === 'custom') view.preset = 'custom';
      else applyPreset(view, preset.value);
      changed();
    });
    for (const input of [from, to]) {
      input.addEventListener('change', () => {
        if (!from.value || !to.value) return;
        [view.from, view.to] = from.value <= to.value ? [from.value, to.value] : [to.value, from.value];
        view.preset = 'custom';
        changed();
      });
    }
    sync();
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
    if (S.friends.size) void syncCheckinDates('me');
  }

  // Henter datoene for innsjekkinger historikken ikke plasserer i et år, og lagrer dem på ølene.
  // who er 'me' eller navnet på en venn. filter velger hvilke øl som trenger datoer;
  // standard er øl som ikke kan plasseres i et år.
  async function syncCheckinDates(who, filter = yearsLib.needsCheckinDates) {
    const friend = who === 'me' ? null : S.friends.get(who);
    if (who !== 'me' && !friend) return;
    const job = friend ? friend.checkins : S.checkins.me;
    const name = friend ? friend.name : S.user;
    const record = () => (friend ? friend.history : S.history);
    if (!name || (friend ? friend.syncing : S.syncing) || (job.running && job.name === name)) return;
    const wanted = (record()?.beers ?? []).filter(filter);
    if (!wanted.length) return;
    job.controller?.abort();
    const controller = new AbortController();
    Object.assign(job, { name, running: true, error: null, controller });
    const current = () => job.controller === controller && (friend ? S.friends.get(name) === friend : S.user === name);
    const task = friend ? taskFor(`${name}|checkins`) : $('cmp-task-checkins-me');
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
      const saved = await store.saveHistory(name, { beers, complete: latest.complete, syncedAt: latest.syncedAt, format: latest.format });
      if (!current()) return;
      if (friend) { friend.history = saved; friend.built = yearsLib.buildYears(saved.beers); } else { S.history = saved; S.built = yearsLib.buildYears(saved.beers); }
      if (S.view.mode === 'period') renderYear();
      renderFriendCompare();
      if (S.cmpView.mode === 'period') scopeChanged();
    };
    show({ index: 0, pages: 0 });
    if (S.view.mode === 'period') renderYear();
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
        if (S.view.mode === 'period') renderYear();
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
      S.history = await store.saveHistory(S.user, { beers: res.beers, complete: res.complete && res.stopped !== 'aborted', format: history.HISTORY_FORMAT });
      S.syncing = false;
      build();
      if (res.stopped === 'aborted') $('y-sync-text').textContent = t('years_aborted');
    } catch (err) {
      S.syncing = false;
      renderSync();
      $('y-sync-text').textContent = t('years_error', err.message);
    }
  }

  /* ---------- Deg og vennene side om side ---------- */
  // Uthever høyeste tall, med mindre alle er like.
  const winners = (values, mode) => (mode === 'high' ? yearsLib.leaders(values) : values.map(() => false)).map(w => (w ? 'win' : ''));
  const cell = v => (v == null ? '–' : typeof v === 'number' ? (Number.isInteger(v) ? num(v) : rate(v)) : v);
  // Snitt vises alltid med to desimaler, så 8 og 7,70 står likt.
  const asRate = ([label, values, mode]) => [label, values, mode, values.map(v => (v == null ? '–' : rate(v)))];
  const cells = (values, mode, shown = values.map(cell), cls = '') => {
    const w = winners(values, mode);
    return shown.map((v, i) => html`<td class="${w[i]} ${cls}">${v}</td>`);
  };

  // Deg og vennene som har historikk, i samme rekkefølge som i sammenligningen.
  // tone er personens farge (samme som i brikkene og kurven).
  // Vennens navn fra vennelisten i sammenligningen, ellers brukernavnet.
  const label = name => root.DFU.compare?.label?.(name) ?? name;
  const people = () => [
    { name: t('compare_you'), history: S.history, built: S.built, tone: 'p0' },
    ...[...S.friends.values()].filter(f => f.built).map(f => ({ name: label(f.name), history: f.history, built: f.built, tone: root.DFU.compare?.tone?.(f.name) ?? '' })),
  ];
  // Kolonneoverskrift med navn og forklaringen med fulle navn, felles med resten av sammenligningen.
  const nameHead = (p, many, cls) => root.DFU.compare?.nameHead?.(p, many, cls) ?? html`<th class="cmp-name ${p.tone} ${cls ?? ''}">${p.name}</th>`;
  const fullName = text => root.DFU.compare?.fullName?.(text) ?? text;
  const namesCaption = (ps, shared) => root.DFU.compare?.namesCaption?.(ps, shared) ?? '';
  // Antall øl alle har. Med flere enn to personer heter raden «Felles for alle».
  const sharedCount = lists => yearsLib.compareMany(lists).all.length;
  const sharedLabel = (n, key) => (n > 2 ? t('compare_allShared') : t(key));
  // «Felles for alle» har sin egen farge (grønn, som kortet), på linje med fargene til personene.
  const sharedKey = html`<b class="cmp-key shared" aria-hidden="true"></b>`;
  const sharedKeyHead = html`<b class="cmp-key shared" role="img" aria-label="${t('compare_allShared')}"></b>`;

  // Tabell med én kolonne per person. Rader: [etikett, verdier, 'high' for å utheve høyeste, visning].
  // Med flere enn to personer er det ikke plass til tekst (øl, stil, bryggeri) i hver sin smale kolonne.
  // Tekstradene vises da som en liste under radnavnet, én linje per person med merket foran.
  function cmpTable(head, ps, rows, [sharedText, shared]) {
    const many = ps.length > 2;
    const personKey = p => root.DFU.compare?.personKey?.(p) ?? p.name;
    const textRow = (label, values) => html`<tr class="cmp-text-row cmp-narrow-row"><td colspan="${ps.length + 1}"><span class="cmp-text-label">${label}</span>
      <ul class="cmp-text-list">${values.map((v, i) => html`<li>${personKey(ps[i])}<span>${cell(v)}</span></li>`)}</ul></td></tr>`;
    $('cmp-year-table').classList.toggle('many', many);
    render($('cmp-year-table'), html`${namesCaption(ps)}<thead><tr><th>${head}</th>${ps.map(p => nameHead(p, many))}</tr></thead>
      <tbody>${rows.map(([label, values, mode, shown]) => {
        // Tekst (øl, stil, bryggeri): vanlige kolonner på bred skjerm, liste under radnavnet på mobil.
        const text = many && mode !== 'high';
        const row = html`<tr class="${text ? 'cmp-wide-row' : ''}"><td>${label}</td>${cells(values, mode, shown)}</tr>`;
        return text ? [row, textRow(label, values)] : row;
      })}
        <tr><td>${many ? sharedKey : ''}${sharedText}</td><td colspan="${ps.length}">${num(shared)}</td></tr></tbody>`);
  }

  // Årene noen av dere har øl fra, nyeste først.
  function comparableYears(ps) {
    const all = new Set(ps.flatMap(p => (p.built?.years ?? []).map(y => y.year)));
    return [...all].sort((a, b) => b - a);
  }

  // Deg og vennene over hele historikken, med samme tabell som for et år eller en periode.
  function renderFriendAll(ps) {
    const stats = ps.map(p => yearsLib.allTimeStats(p.history?.beers ?? []));
    const row = (label, pick, mode) => [label, stats.map(pick), mode];
    cmpTable(t('period_mode_all'), ps, [
      row(t('cmpYears_row_checkins'), s => s.checkins, 'high'),
      row(t('kpi_unique'), s => s.beers, 'high'),
      row(t('kpi_breweries'), s => s.breweries, 'high'),
      row(t('kpi_styles'), s => s.styles, 'high'),
      row(t('cmpYears_row_rated'), s => s.ratedCount, 'high'),
      asRate(row(t('cmpYears_row_avgRating'), s => s.avgRating, 'high')),
      asRate(row(t('cmpYears_row_avgAbv'), s => s.avgAbv, 'high')),
      row(t('cmpYears_row_strongest'), s => beerLink(s.strongest)),
      row(t('cmpYears_row_topStyle'), s => s.topStyles[0]?.name ?? null),
      row(t('cmpYears_row_topBrewery'), s => s.topBreweries[0]?.name ?? null),
    ], [sharedLabel(ps.length, 'cmpAll_shared'), sharedCount(ps.map(p => p.history?.beers ?? []))]);
    $('cmp-year-note').textContent = '';
  }

  // Deg og vennene i en valgfri periode: nye øl og øl smakt igjen.
  function renderFriendPeriod(ps, jobs, loading) {
    const stats = ps.map(p => yearsLib.periodStats(p.history?.beers ?? [], S.cmpView.from, S.cmpView.to));
    if (stats.some(s => !s)) {
      render($('cmp-year-table'), '');
      $('cmp-year-note').textContent = '';
      return;
    }
    const row = (label, pick, mode) => [label, stats.map(pick), mode];
    cmpTable(rangeLabel(stats[0].from, stats[0].to), ps, [
      row(t('card_periodBeers'), s => s.beers, 'high'),
      row(t('cmpYears_row_beers'), s => s.freshCount, 'high'),
      row(t('card_again'), s => s.againCount, 'high'),
      row(t('cmpYears_row_breweries'), s => s.breweries, 'high'),
      row(t('cmpYears_row_styles'), s => s.styles, 'high'),
      row(t('cmpYears_row_rated'), s => s.ratedCount, 'high'),
      asRate(row(t('cmpYears_row_avgRating'), s => s.avgRating, 'high')),
      asRate(row(t('cmpYears_row_avgAbv'), s => s.avgAbv, 'high')),
      row(t('cmpYears_row_strongest'), s => beerLink(s.strongest)),
      row(t('cmpYears_row_topStyle'), s => s.topStyles[0]?.name ?? null),
      row(t('cmpYears_row_topBrewery'), s => s.topBreweries[0]?.name ?? null),
    ], [sharedLabel(ps.length, 'cmpPeriod_shared'), sharedCount(stats.map(s => s.list))]);

    const uncertain = stats.reduce((sum, s) => sum + s.uncertain, 0);
    $('cmp-period-fetch').hidden = !uncertain || jobs.some(j => j.running);
    const errors = jobs.map(j => j.error).filter(Boolean);
    $('cmp-year-note').textContent = loading && jobs.some(j => j.running) ? t('period_fetching')
      : uncertain ? [t('period_uncertain', num(uncertain)), errors.length ? t('years_error', errors.join(' · ')) : ''].filter(Boolean).join(' ') : '';
  }

  // Tidsfilteret i sammenligningen: hele tiden, ett år eller en periode.
  function cmpScope() {
    const { mode, from, to } = S.cmpView;
    if (mode === 'year') return { mode, year: S.cmpYear, from: `${S.cmpYear}-01-01`, to: `${S.cmpYear}-12-31` };
    if (mode === 'period') return { mode, from, to };
    return { mode: 'all' };
  }

  // Ølene i valgt tid for 'me' eller en venn: hele historikken, nye øl i året, eller øl smakt i perioden.
  function cmpBeers(who) {
    const friend = who === 'me' ? null : S.friends.get(who);
    const record = friend ? friend.history : who === 'me' ? S.history : null;
    const built = friend ? friend.built : who === 'me' ? S.built : null;
    const beers = record?.beers ?? [];
    const { mode } = S.cmpView;
    if (mode === 'year') return built?.byYear.get(S.cmpYear) ?? [];
    if (mode === 'period') return yearsLib.periodStats(beers, S.cmpView.from, S.cmpView.to)?.list ?? [];
    return beers;
  }

  const scopeChanged = () => document.dispatchEvent(new CustomEvent('dfu:cmp-scope'));

  function renderFriendCompare() {
    if (!S.friends.size || !$('cmp-year-bar')) return;
    const friends = [...S.friends.values()];
    const ps = people();
    const mode = S.cmpView.mode;
    const years = comparableYears(ps);
    if (!years.includes(S.cmpYear)) S.cmpYear = years[0] ?? null;
    render($('cmp-year-select'), years.map(y => html`<option value="${y}"${y === S.cmpYear ? raw(' selected') : ''}>${y}</option>`));
    $('cmp-year-select').onchange = e => { S.cmpYear = Number(e.target.value); renderFriendCompare(); scopeChanged(); };
    const ready = ps.length > 1;
    $('cmp-all-block').hidden = mode !== 'all' || !ready;

    // Fremdriften vises i oppgaveradene øverst; meldingsfeltet har bare feil og ventetekst.
    const syncing = friends.filter(f => f.syncing && !f.built).map(f => label(f.name));
    const errors = friends.filter(f => f.error).map(f => t('years_error', `${label(f.name)}: ${f.error}`));
    $('cmp-year-meta').textContent = errors.length ? errors.join(' ') : !ready && syncing.length ? t('cmpYears_loading', syncing.join(', ')) : '';
    if (!ready) {
      for (const id of ['cmp-year-table', 'cmp-all-years']) render($(id), '');
      $('cmp-year-note').textContent = '';
      $('cmp-period-fetch').hidden = true;
      return;
    }

    // Innsjekkinger og unike øl vises først når alle datoene for året er kjent.
    const yearCount = (built, key, year = S.cmpYear) => built?.[key]?.get(year) ?? { count: 0, pending: false };
    const jobs = [S.checkins.me, ...friends.map(f => f.checkins)];
    const loading = jobs.some(j => j.running) || friends.some(f => f.syncing);
    const countCell = c => (c.pending ? (loading ? '…' : '–') : num(c.count));
    const known = c => (c.pending ? null : c.count);
    $('cmp-year-definitions').hidden = mode !== 'year';
    if (mode !== 'period') $('cmp-period-fetch').hidden = true;
    if (mode === 'all') renderFriendAll(ps);
    else if (mode === 'period') renderFriendPeriod(ps, jobs, loading);
    else if (mode === 'year') {
      const ys = ps.map(p => p.built?.years.find(y => y.year === S.cmpYear));
      const months = new Intl.DateTimeFormat(i18n.locale(), { month: 'long' });
      const monthName = y => (y && y.beers ? months.format(new Date(2025, y.busiestMonth, 1)) : null);
      const countRow = (label, key) => {
        const c = ps.map(p => yearCount(p.built, key));
        return [label, c.map(known), 'high', c.map(countCell)];
      };
      const row = (label, pick, mode) => [label, ys.map(pick), mode];
      const pending = ['checkins', 'unique'].some(key => ps.some(p => yearCount(p.built, key).pending));
      cmpTable(S.cmpYear, ps, [
        countRow(t('cmpYears_row_checkins'), 'checkins'),
        countRow(t('cmpYears_row_unique'), 'unique'),
        row(t('cmpYears_row_beers'), y => y?.beers ?? 0, 'high'),
        row(t('cmpYears_row_breweries'), y => y?.breweries ?? 0, 'high'),
        row(t('cmpYears_row_styles'), y => y?.styles ?? 0, 'high'),
        row(t('cmpYears_row_rated'), y => y?.ratedCount ?? 0, 'high'),
        asRate(row(t('cmpYears_row_avgRating'), y => y?.avgRating ?? null, 'high')),
        asRate(row(t('cmpYears_row_avgAbv'), y => y?.avgAbv ?? null, 'high')),
        row(t('cmpYears_row_strongest'), y => beerLink(y?.strongest)),
        row(t('cmpYears_row_topStyle'), y => y?.topStyles[0]?.name ?? null),
        row(t('cmpYears_row_topBrewery'), y => y?.topBreweries[0]?.name ?? null),
        row(t('cmpYears_row_busiestMonth'), monthName),
      ], [sharedLabel(ps.length, 'cmpYears_row_shared'), sharedCount(ps.map(p => p.built?.byYear.get(S.cmpYear) ?? []))]);
      const jobErrors = jobs.map(j => j.error).filter(Boolean);
      $('cmp-year-note').textContent = !pending ? ''
        : loading ? t('cmpYears_checkinsLoading')
        : jobErrors.length ? t('years_error', jobErrors.join(' · ')) : t('cmpYears_checkinsIncomplete');
    }

    if (mode !== 'all') return;
    const n = ps.length;
    // Med flere enn to personer viser mobil én ting om gangen (innsjekkinger eller nye øl), så tabellen passer
    // i bredden. Begge skrives ut; det som ikke er valgt får klassen cmp-alt og skjules bare på smal skjerm.
    const many = n > 2;
    const metric = S.allYearsMetric;
    const toggle = $('cmp-all-metric');
    if (toggle) {
      toggle.hidden = !many;
      for (const b of toggle.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.metric === metric));
    }
    $('cmp-all-years').classList.toggle('many', many);
    const checksAlt = many && metric !== 'checkins' ? 'cmp-alt' : '';
    const newAlt = many && metric !== 'new' ? 'cmp-alt' : '';
    render($('cmp-all-years'), html`${namesCaption(ps, sharedLabel(n, 'cmpYears_row_shared'))}<thead>
        <tr><th rowspan="2">${t('cmpYears_year')}</th><th colspan="${n}" class="${checksAlt}">${t('cmpYears_col_checkins')}</th><th colspan="${n}" class="${newAlt}">${t('cmpYears_col_new')}</th>${many
          ? html`<th rowspan="2" class="cmp-name keyed cmp-shared">${sharedKeyHead}${fullName(sharedLabel(n, 'cmpYears_row_shared'))}</th>`
          : html`<th rowspan="2">${sharedLabel(n, 'cmpYears_row_shared')}</th>`}</tr>
        <tr>${ps.map(p => nameHead(p, many, checksAlt))}${ps.map(p => nameHead(p, many, newAlt))}</tr></thead>
      <tbody>${years.map(y => {
        const c = ps.map(p => yearCount(p.built, 'checkins', y));
        const fresh = ps.map(p => p.built?.years.find(x => x.year === y)?.beers ?? 0);
        const shared = sharedCount(ps.map(p => p.built?.byYear.get(y) ?? []));
        return html`<tr><td>${y}</td>${cells(c.map(known), 'high', c.map(countCell), checksAlt)}${cells(fresh, 'high', undefined, newAlt)}<td>${num(shared)}</td></tr>`;
      })}</tbody>`);
  }

  // Henter historikken til en venn. Egen henting bruker S.syncing, så de to blokkerer ikke hverandre.
  async function syncFriend(friend, stored, expected) {
    const { name } = friend;
    const known = stored.beers;
    const full = history.needsFullSync(stored);
    const controller = new AbortController();
    friend.controller = controller;
    friend.syncing = true;
    friend.error = null;
    const current = () => S.friends.get(name) === friend && friend.controller === controller;
    const task = taskFor(`${name}|history`);
    const eta = newEta();
    const totalPages = pageCount(expected);
    const show = p => {
      const { fraction, remainingMs } = eta.update(p.pages, totalPages);
      root.DFU.progress.showTask(task, {
        label: t('cmpYears_loading', label(name)),
        detail: totalPages
          ? t('progress_historyDetail', num(Math.min(p.pages, totalPages)), num(totalPages), num(p.fetched))
          : t('years_syncing', num(p.pages), num(p.fetched)),
        fraction: expected ? Math.min(1, p.fetched / expected) : fraction,
        eta: root.DFU.progress.formatEta(remainingMs, t),
      });
    };
    show({ pages: 0, fetched: 0 });
    renderFriendCompare();
    try {
      const res = await history.sync(name, {
        // Full henting bare første gang eller for gammel lagring; ellers bare det nye, som for deg.
        known, full, expected, signal: controller.signal,
        onProgress: p => { if (current() && !p.done) show(p); },
      });
      // Avbrutt betyr at vennen er fjernet. Da lagres ikke den halve hentingen.
      if (res.stopped === 'aborted') return;
      const saved = await store.saveHistory(name, {
        beers: res.beers, complete: res.complete,
        format: full ? history.HISTORY_FORMAT : stored.format ?? null,
      });
      if (!current()) return;
      friend.history = saved;
      friend.built = yearsLib.buildYears(res.beers);
    } catch (err) {
      if (current()) friend.error = err.message;
    } finally {
      if (friend.controller === controller) {
        root.DFU.progress.hideTask(task);
        friend.syncing = false;
        friend.controller = null;
        renderFriendCompare();
        document.dispatchEvent(new CustomEvent('dfu:friend-history'));
      }
    }
  }

  /* ---------- API ---------- */
  function init() {
    $('y-sync-stop').addEventListener('click', () => S.controller?.abort());
    $('y-year').addEventListener('change', e => { S.year = Number(e.target.value); renderYear(); renderFriendCompare(); });
    setupPeriodControls(['y-mode', 'y-year', 'y-period', 'y-preset', 'y-from', 'y-to'], S.view, renderYear);
    setupPeriodControls(['cmp-mode', 'cmp-year-select', 'cmp-period', 'cmp-preset', 'cmp-from', 'cmp-to'], S.cmpView, () => { renderFriendCompare(); scopeChanged(); }, ['all', 'year', 'period']);
    document.addEventListener('dfu:badges', () => renderYear());
    document.addEventListener('dfu:friend-names', () => renderFriendCompare());
    $('cmp-all-metric')?.addEventListener('click', e => {
      const b = e.target.closest('button[data-metric]');
      if (!b) return;
      S.allYearsMetric = b.dataset.metric;
      renderFriendCompare();
    });
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

  // Kalles av sammenligningen når en venn legges til eller hentes på nytt. Lagret historikk vises med en gang.
  // Returnerer en funksjon som henter det som mangler: historikken når den mangler, er ufullstendig, er gammel
  // eller vennen har flere unike øl enn lagret, og deretter innsjekkingsdatoene. Sammenligningen kjører den i
  // køen sin, så det hentes for én venn om gangen. force (Oppdater-knappen) henter historikken selv om den er ny.
  async function addFriend(name, expected = null, { force = false } = {}) {
    let friend = S.friends.get(name);
    if (!friend) {
      friend = { name, history: null, built: null, syncing: false, controller: null, error: null, checkins: newJob() };
      S.friends.set(name, friend);
    }
    const [stored, settings] = await Promise.all([store.loadHistory(name), store.getSettings()]);
    const alive = () => S.friends.get(name) === friend;
    if (!alive()) return async () => {};
    if (stored.beers.length && !friend.syncing) {
      friend.history = stored;
      friend.built = yearsLib.buildYears(stored.beers);
    }
    renderFriendCompare();
    document.dispatchEvent(new CustomEvent('dfu:friend-history'));
    const fresh = !force && stored.beers.length > 0 && stored.complete && stored.syncedAt != null &&
      Date.now() - stored.syncedAt < settings.staleHours * 3600000 &&
      (expected == null || expected <= stored.count);
    void syncCheckinDates('me');
    return async () => {
      if (!alive()) return;
      if (!fresh && !friend.syncing) await syncFriend(friend, stored, expected);
      if (alive()) await syncCheckinDates(name);
    };
  }

  // Tar en venn ut av sammenligningen og stopper hentingene for vennen.
  function removeFriend(name) {
    const friend = S.friends.get(name);
    if (!friend) return;
    S.friends.delete(name);
    friend.controller?.abort();
    friend.checkins.controller?.abort();
    root.DFU.progress?.removeTasks?.(cmpTasks(), name);
    renderFriendCompare();
  }

  root.DFU = root.DFU || {};
  root.DFU.yearsView = { init, setUser, addFriend, removeFriend, cmpScope, cmpBeers, refresh: () => runSync(!S.history?.complete), state: S };
})(globalThis);
