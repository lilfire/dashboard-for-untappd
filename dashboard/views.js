// Visningene i dashbordet: bryggerier, land, stiler og siste øl.
(function (root) {
  const { i18n } = root.DFU;
  const { html, raw, render, escText } = root.DFU.html;
  const { t } = i18n;
  const $ = id => document.getElementById(id);
  const UNTAPPD = 'https://untappd.com';

  const fold = s => String(s).normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase();
  const sum = list => list.reduce((s, x) => s + x.count, 0);
  const collator = () => new Intl.Collator(i18n.locale(), { sensitivity: 'base' });
  const num = n => i18n.number(n);
  const label = x => x.label ?? x.name;

  // Markerer søketreffet i navnet, også når søket ignorerer aksenter (brau → Bräu).
  function highlight(name, q) {
    if (!q) return name;
    const chars = [...name];
    const map = [];
    let folded = '';
    chars.forEach((ch, i) => { const f = fold(ch); for (let k = 0; k < f.length; k++) map.push(i); folded += f; });
    const at = folded.indexOf(q);
    if (at < 0) return name;
    const start = map[at], end = map[at + q.length - 1] + 1;
    return raw(escText(chars.slice(0, start).join('')) + '<mark>' + escText(chars.slice(start, end).join('')) +
      '</mark>' + escText(chars.slice(end).join('')));
  }

  // Sorterer etter antall og gir delt plass ved likt antall.
  // label er navnet som vises (land oversettes); søket treffer både det og det opprinnelige navnet.
  function ranked(list) {
    const c = collator();
    const rows = list.map(x => ({ ...x, folded: [x.name, x.label].filter(Boolean).map(fold).join('\n') }))
      .sort((a, b) => b.count - a.count || c.compare(label(a), label(b)));
    let place = 0;
    rows.forEach((r, i) => {
      if (i === 0 || r.count !== rows[i - 1].count) place = i + 1;
      r.rank = place;
    });
    rows.forEach((r, i) => { r.tie = rows[i - 1]?.count === r.count || rows[i + 1]?.count === r.count; });
    return rows;
  }

  // sort = 'count-desc' | 'count-asc' | 'name-asc' | 'name-desc', som i sorteringsvelgerne.
  function sorter(sort) {
    const [key, dir] = sort.split('-');
    const sign = dir === 'asc' ? 1 : -1;
    const c = collator();
    return key === 'name'
      ? (x, y) => sign * c.compare(label(x), label(y))
      : (x, y) => sign * (x.count - y.count) || c.compare(label(x), label(y));
  }

  /* ---------- Søk og sortering (felles for bryggerier, land og stiler) ---------- */
  function initControls(prefix, state, rerender) {
    $(`${prefix}-q`).addEventListener('input', e => { state.q = e.target.value; rerender(); });
    $(`${prefix}-sort`).addEventListener('change', e => { state.sort = e.target.value; rerender(); });
    onQuickFilter(prefix, state, rerender);
  }

  const bar = (count, max) =>
    html`<div class="cnt"><b>${num(count)}</b><span class="bar"><i style="width:${(count / max * 100).toFixed(1)}%"></i></span></div>`;
  const newTag = on => (on ? html` <span class="tag-new">${t('badge_new')}</span>` : '');
  const emptyRow = cols => html`<tr><td class="empty" colspan="${cols}">${t('emptySearch')}</td></tr>`;
  const rankCell = r => html`<td class="rank${r.tie ? ' tie' : ''}">${r.rank}</td>`;

  /* ---------- Bryggerier ---------- */
  const BUCKETS = [
    { id: '1', min: 1, max: 1 },
    { id: '2', min: 2, max: 2 },
    { id: '3-4', min: 3, max: 4 },
    { id: '5-9', min: 5, max: 9 },
    { id: '10-19', min: 10, max: 19 },
    { id: '20', min: 20, max: Infinity },
  ];
  const bucketLabel = b => (b.min === 1 && b.max === 1 ? t('bucket_one')
    : b.max === Infinity ? t('bucket_plus', b.min)
    : b.min === b.max ? t('totalBeers', b.min) : t('bucket_range', b.min, b.max));

  // Etiketten lages ved bruk, så den følger valgt språk.
  const countGroups = () => BUCKETS.map(b => ({ id: b.id, label: bucketLabel(b), test: r => r.count >= b.min && r.count <= b.max }));

  /* ---------- Hurtigfilter (felles for bryggerier, land og stiler) ---------- */
  // groups = [{ id, label, test(rad), hideEmpty }]. Stripen viser andelen av alle ølene.
  function renderQuickFilter(prefix, groups, rows, unit, total) {
    render($(`${prefix}-dist`), groups.flatMap(g => {
      const inG = rows.filter(g.test);
      if (g.hideEmpty && !inG.length) return [];
      const beers = sum(inG);
      const pct = total ? Math.round(beers / total * 100) : 0;
      return [html`<button class="bucket" type="button" data-bucket="${g.id}" aria-pressed="false">
        <span class="lbl">${g.label}</span>
        <span class="num">${num(inG.length)} <small>${t(unit)}</small></span>
        <span class="share"><i style="width:${Math.max(pct, inG.length ? 1 : 0)}%"></i></span>
        <span class="sub">${t('bucket_share', num(beers), pct)}</span>
      </button>`];
    }));
  }

  // Markerer valgt gruppe, og viser den i overskriften så filteret synes også når boksen er lukket.
  function markQuickFilter(prefix, group) {
    for (const el of $(`${prefix}-dist`).querySelectorAll('.bucket')) el.setAttribute('aria-pressed', String(el.dataset.bucket === group?.id));
    $(`${prefix}-dist-active`).textContent = group ? group.label : '';
  }

  // Klikk på en gruppe velger den, klikk igjen fjerner filteret.
  function onQuickFilter(prefix, state, rerender) {
    $(`${prefix}-dist`).addEventListener('click', e => {
      const btn = e.target.closest('.bucket');
      if (!btn) return;
      state.bucket = state.bucket === btn.dataset.bucket ? null : btn.dataset.bucket;
      rerender();
    });
  }

  const B = { q: '', bucket: null, sort: 'count-desc', rows: [], total: 0, max: 1, isNew: new Set() };

  const openBreweries = new Set();
  const MAX_BEERS_PER_ROW = 300;

  // Ølene per bryggeri kommer fra hele ølhistorikken, som hentes under fanen «År».
  // Navn er hovednøkkelen, siden bryggeri-ID bare finnes i sidene som hentes med «Show More».
  function beersByBrewery() {
    const beers = root.DFU.yearsView?.state?.history?.beers ?? [];
    const byId = new Map();
    const byName = new Map();
    const push = (map, key, beer) => {
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(beer);
    };
    for (const beer of beers) {
      push(byName, fold(beer.brewery ?? ''), beer);
      push(byId, String(beer.breweryUrl ?? '').match(/\/(\d+)\/?$/)?.[1] ?? '', beer);
    }
    const newestFirst = (a, b) => String(b.first ?? '').localeCompare(String(a.first ?? ''));
    for (const list of byName.values()) list.sort(newestFirst);
    for (const list of byId.values()) list.sort(newestFirst);
    return { byId, byName, count: beers.length };
  }

  // Ølliste brukt av utvidede rader: dato, navn med undertekst, og din rangering.
  function beerTable(list, subline) {
    const fmt = v => (v == null ? '–' : v.toLocaleString(i18n.locale(), { maximumFractionDigits: 2 }));
    const rows = list.slice(0, MAX_BEERS_PER_ROW).map(b => html`<tr>
      <td class="num">${b.first ? i18n.date(`${b.first}T12:00:00`) : '–'}</td>
      <td><a href="${UNTAPPD}${b.url ?? ''}" target="_blank" rel="noopener">${b.name}</a>
        <span class="sub-line">${subline(b)}</span></td>
      <td class="num">${fmt(b.ratingYou)}</td></tr>`);
    const more = list.length > MAX_BEERS_PER_ROW
      ? html`<tr><td colspan="3" class="meta">… +${num(list.length - MAX_BEERS_PER_ROW)}</td></tr>` : '';
    return html`<table class="list beer-list"><tbody>${rows}${more}</tbody></table>`;
  }

  // Klikk på et bryggeri åpner eller lukker ølene fra det bryggeriet.
  document.addEventListener('click', e => {
    const btn = e.target.closest?.('#b-rows .row-toggle');
    if (!btn) return;
    const id = btn.dataset.brewery;
    if (openBreweries.has(id)) openBreweries.delete(id);
    else openBreweries.add(id);
    renderBreweries();
  });

  document.addEventListener('dfu:history', () => { if (B.rows.length) renderBreweries(); });

  function renderBreweries() {
    const q = fold(B.q.trim());
    const b = countGroups().find(x => x.id === B.bucket);
    const list = B.rows.filter(r => (!q || r.folded.includes(q)) && (!b || b.test(r))).sort(sorter(B.sort));

    const beers = beersByBrewery();
    const hasHistory = beers.count > 0;
    const forBrewery = r => beers.byName.get(fold(r.name)) ?? beers.byId.get(String(r.id)) ?? [];

    const rows = list.flatMap(r => {
      const open = hasHistory && openBreweries.has(r.id);
      const name = hasHistory
        ? html`<button type="button" class="row-toggle" data-brewery="${r.id}" aria-expanded="${open ? 'true' : 'false'}">${highlight(r.name, q)}</button>`
        : highlight(r.name, q);
      const main = html`<tr>${rankCell(r)}
        <td>${name}${newTag(B.isNew.has(r.id))}
          <a class="ext" href="${UNTAPPD}/brewery/${encodeURIComponent(r.id)}" target="_blank" rel="noopener" title="Untappd">↗</a></td>
        <td>${bar(r.count, B.max)}</td></tr>`;
      if (!open) return [main];
      const list2 = forBrewery(r);
      return [main, html`<tr class="beers"><td colspan="3">${list2.length
        ? beerTable(list2, b2 => b2.style)
        : html`<p class="meta">${t('breweries_noBeers')}</p>`}</td></tr>`];
    });
    render($('b-rows'), rows.length ? rows : emptyRow(3));

    const filtered = q || b;
    $('b-meta').textContent = (filtered
      ? `${t('showing', num(list.length), num(B.rows.length))} · ${t('totalBeers', num(sum(list)))}`
      : `${num(B.rows.length)} ${t('kpi_breweries').toLowerCase()} · ${t('totalBeers', num(B.total))}`)
      + (hasHistory ? '' : ` · ${t('breweries_needHistory')}`);
    $('b-sort').value = B.sort;
    markQuickFilter('b', b);
  }

  /* ---------- Land ---------- */
  const C = { q: '', bucket: null, sort: 'count-desc', rows: [], total: 0, max: 1, isNew: new Set() };

  // Verdensdel per land; «Annet» og tomme verdensdeler vises bare når de har land.
  const continentGroups = () => [...root.DFU.continents.CONTINENTS, 'other']
    .map(id => ({ id, label: t(`continent_${id}`), test: r => r.continent === id, hideEmpty: true }));

  const openCountries = new Set();
  const openCountryBreweries = new Set();

  // Bryggeriene i ett land, med ølene, satt sammen av historikken og koblingen øl → land.
  function breweriesInCountry(country) {
    const byBeer = root.DFU.countries?.byBeer() ?? {};
    const beers = root.DFU.yearsView?.state?.history?.beers ?? [];
    const map = new Map();
    for (const beer of beers) {
      if (byBeer[beer.id] !== country) continue;
      const name = beer.brewery || '?';
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(beer);
    }
    const c = collator();
    for (const list of map.values()) list.sort((a, b) => String(b.first ?? '').localeCompare(String(a.first ?? '')));
    return [...map.entries()].map(([name, list]) => ({ name, beers: list }))
      .sort((a, b) => b.beers.length - a.beers.length || c.compare(a.name, b.name));
  }

  function countryDetail(country) {
    const breweries = breweriesInCountry(country);
    if (!breweries.length) return html`<p class="meta">${t('countries_noBreweries')}</p>`;
    const max = breweries[0].beers.length;
    return html`<div class="styles">${breweries.map(b => {
      const key = `${country}|${b.name}`;
      return html`<details class="style" data-cb="${key}"${openCountryBreweries.has(key) ? raw(' open') : ''}>
        <summary><span class="name">${b.name}</span>${bar(b.beers.length, max)}</summary>
        ${beerTable(b.beers, x => x.style)}</details>`;
    })}</div>`;
  }

  function renderCountries() {
    const q = fold(C.q.trim());
    const g = continentGroups().find(x => x.id === C.bucket);
    const list = C.rows.filter(r => (!q || r.folded.includes(q)) && (!g || g.test(r))).sort(sorter(C.sort));
    const pct = r => (r.count / C.total * 100).toLocaleString(i18n.locale(), { maximumFractionDigits: 1 });
    const mapped = Object.keys(root.DFU.countries?.byBeer() ?? {}).length > 0;
    const hasHistory = (root.DFU.yearsView?.state?.history?.beers ?? []).length > 0;
    const canExpand = mapped && hasHistory;

    const rows = list.flatMap(r => {
      const open = canExpand && openCountries.has(r.name);
      const name = canExpand
        ? html`<button type="button" class="row-toggle" data-country="${r.name}" aria-expanded="${open ? 'true' : 'false'}">${highlight(r.label, q)}</button>`
        : highlight(r.label, q);
      const main = html`<tr>${rankCell(r)}
        <td>${name}${newTag(C.isNew.has(r.id))}</td>
        <td>${bar(r.count, C.max)}</td>
        <td class="num">${pct(r)} %</td></tr>`;
      return open ? [main, html`<tr class="beers"><td colspan="4">${countryDetail(r.name)}</td></tr>`] : [main];
    });
    render($('c-rows'), rows.length ? rows : emptyRow(4));

    const hint = canExpand ? '' : ` · ${hasHistory ? t('countries_needSyncHint') : t('countries_needHistory')}`;
    $('c-meta').textContent = q || g
      ? `${t('showing', num(list.length), num(C.rows.length))} · ${t('totalBeers', num(sum(list)))}`
      : `${num(C.rows.length)} ${t('kpi_countries').toLowerCase()} · ${t('untappdCounts')}${hint}`;
    $('c-sort').value = C.sort;
    markQuickFilter('c', g);
  }

  // Klikk på et land åpner bryggeriene der, og hvert bryggeri kan åpnes videre.
  document.addEventListener('click', e => {
    const btn = e.target.closest?.('#c-rows .row-toggle');
    if (!btn) return;
    const name = btn.dataset.country;
    if (openCountries.has(name)) openCountries.delete(name);
    else openCountries.add(name);
    renderCountries();
  });

  document.addEventListener('toggle', e => {
    const key = e.target?.dataset?.cb;
    if (!key) return;
    if (e.target.open) openCountryBreweries.add(key); else openCountryBreweries.delete(key);
  }, true);

  document.addEventListener('dfu:countries', () => { if (C.rows.length) renderCountries(); });
  document.addEventListener('dfu:history', () => { if (C.rows.length) renderCountries(); });

  /* ---------- Stiler ---------- */
  const S = { q: '', bucket: null, sort: 'count-desc', families: [], max: 1, isNew: new Set(), open: new Set() };

  function groupStyles(styles) {
    const map = new Map();
    for (const s of styles) {
      const family = s.name.split(' - ')[0].trim();
      if (!map.has(family)) map.set(family, { name: family, folded: fold(family), count: 0, styles: [] });
      const f = map.get(family);
      f.count += s.count;
      f.styles.push({ ...s, folded: fold(s.name) });
    }
    const c = collator();
    const families = [...map.values()].sort((a, b) => b.count - a.count || c.compare(a.name, b.name));
    for (const f of families) f.styles.sort((a, b) => b.count - a.count || c.compare(a.name, b.name));
    return families;
  }

  const openStyles = new Set();
  const MAX_BEERS_PER_STYLE = 300;

  // Ølene per stil kommer fra hele ølhistorikken, som hentes under fanen «År».
  function beersByStyle() {
    const beers = root.DFU.yearsView?.state?.history?.beers ?? [];
    const map = new Map();
    for (const b of beers) {
      if (!b.style) continue;
      if (!map.has(b.style)) map.set(b.style, []);
      map.get(b.style).push(b);
    }
    for (const list of map.values()) list.sort((a, b) => String(b.first ?? '').localeCompare(String(a.first ?? '')));
    return map;
  }

  function styleBeers(list) {
    const fmt = v => (v == null ? '–' : v.toLocaleString(i18n.locale(), { maximumFractionDigits: 2 }));
    const rows = list.slice(0, MAX_BEERS_PER_STYLE).map(b => html`<tr>
      <td class="num">${b.first ? i18n.date(`${b.first}T12:00:00`) : '–'}</td>
      <td><a href="${UNTAPPD}${b.url ?? ''}" target="_blank" rel="noopener">${b.name}</a>
        <span class="sub-line">${b.brewery}</span></td>
      <td class="num">${fmt(b.ratingYou)}</td></tr>`);
    const more = list.length > MAX_BEERS_PER_STYLE
      ? html`<tr><td colspan="3" class="meta">… +${num(list.length - MAX_BEERS_PER_STYLE)}</td></tr>` : '';
    return html`<table class="list beer-list"><tbody>${rows}${more}</tbody></table>`;
  }

  function renderStyles() {
    const q = fold(S.q.trim());
    const byStyle = beersByStyle();
    const hasHistory = byStyle.size > 0;
    const g = countGroups().find(x => x.id === S.bucket);
    const filtered = Boolean(q || g);
    const order = sorter(S.sort);
    // f.styles beholder rekkefølgen etter antall, så f.styles[0] er største stil i familien (brukes av baren).
    const shown = S.families
      .map(f => ({ ...f, hits: f.styles.filter(s => (!q || s.folded.includes(q) || f.folded.includes(q)) && (!g || g.test(s))).sort(order) }))
      .filter(f => f.hits.length)
      .sort(order);

    const styleBlock = (s, f) => {
      const list = byStyle.get(s.name) ?? [];
      const head = html`<summary><span class="name">${highlight(s.name, q)}${newTag(S.isNew.has(s.id))}</span>
        ${bar(s.count, f.styles[0].count)}</summary>`;
      if (!hasHistory) return html`<div class="style flat">${head}</div>`;
      return html`<details class="style" data-style="${s.name}"${q || openStyles.has(s.name) ? raw(' open') : ''}>
        ${head}${list.length ? styleBeers(list) : html`<p class="meta">${t('styles_noBeers')}</p>`}</details>`;
    };

    render($('s-rows'), shown.length ? shown.map(f => html`<details class="family" data-family="${f.name}"${filtered || S.open.has(f.name) ? raw(' open') : ''}>
        <summary><span class="name">${highlight(f.name, q)}<small>${t('styles_in', f.styles.length)}</small>${newTag(f.styles.some(s => S.isNew.has(s.id)))}</span>
          ${bar(f.count, S.max)}</summary>
        <div class="styles">${f.hits.map(s => styleBlock(s, f))}</div>
      </details>`) : html`<p class="meta">${t('emptySearch')}</p>`);

    const styleCount = S.families.reduce((n, f) => n + f.styles.length, 0);
    const hitStyles = shown.flatMap(f => f.hits);
    $('s-meta').textContent = (filtered
      ? `${t('showing', num(hitStyles.length), num(styleCount))} · ${t('totalBeers', num(sum(hitStyles)))}`
      : `${num(styleCount)} ${t('kpi_styles').toLowerCase()} · ${t('families_count', num(S.families.length))}`)
      + (hasHistory ? '' : ` · ${t('styles_needHistory')}`);
    $('s-sort').value = S.sort;
    markQuickFilter('s', g);
  }

  // Årsfanen sier fra når historikken er hentet, så ølene kan vises under hver stil.
  document.addEventListener('dfu:history', () => { if (S.families.length) renderStyles(); });

  /* ---------- Siste øl ---------- */
  function renderRecent(recent, username) {
    const fmt = v => (v == null ? '–' : v.toLocaleString(i18n.locale(), { maximumFractionDigits: 2 }));
    render($('r-rows'), recent.length ? recent.map(b => {
      let rating = html`<span class="sub-line">${t('notRated')} / ${fmt(b.ratingGlobal)}</span>`;
      if (b.ratingYou != null) {
        const d = b.ratingGlobal != null ? b.ratingYou - b.ratingGlobal : null;
        const cls = d == null ? '' : d >= 0.25 ? 'up' : d <= -0.25 ? 'down' : '';
        rating = html`<b class="${cls}">${fmt(b.ratingYou)}</b> / ${fmt(b.ratingGlobal)}`;
      }
      const when = b.recentAt || b.recent;
      const whenText = when ? i18n.date(when) : '–';
      const checkin = b.recentCheckinId && username
        ? html`<a href="${UNTAPPD}/user/${encodeURIComponent(username)}/checkin/${b.recentCheckinId}" target="_blank" rel="noopener">${whenText}</a>`
        : whenText;
      return html`<tr>
        <td><a href="${UNTAPPD}${b.url ?? ''}" target="_blank" rel="noopener">${b.name}</a>
          <span class="sub-line">${b.brewery} · ${b.style}</span></td>
        <td class="rating">${rating}</td>
        <td class="num">${b.abv == null ? '–' : `${fmt(b.abv)} %`}</td>
        <td class="num">${checkin}</td></tr>`;
    }) : emptyRow(4));
  }

  function init() {
    initControls('b', B, renderBreweries);
    initControls('c', C, renderCountries);
    initControls('s', S, renderStyles);
    $('s-rows').addEventListener('toggle', e => {
      if (S.q || S.bucket) return;
      const { family, style } = e.target.dataset ?? {};
      const set = family ? S.open : style ? openStyles : null;
      const name = family ?? style;
      if (!set || !name) return;
      if (e.target.open) set.add(name); else set.delete(name);
    }, true);
  }

  // change = resultat fra store.latestChange (eller null), brukes til «ny»-merker.
  function setData(data, change, username) {
    const ids = kind => new Set((change?.[kind]?.added ?? []).map(x => x.id));

    B.rows = ranked(data.breweries);
    B.total = sum(data.breweries);
    B.max = B.rows[0]?.count || 1;
    B.isNew = ids('breweries');
    renderQuickFilter('b', countGroups(), B.rows, 'bucket_unit', B.total);
    renderBreweries();

    const { localName } = root.DFU.countryNames;
    C.rows = ranked(data.countries.map(r => ({ ...r, label: localName(r.name, i18n.locale()) })))
      .map(r => ({ ...r, continent: root.DFU.continents.continentOf(r.name) }));
    C.total = sum(data.countries) || 1;
    C.max = C.rows[0]?.count || 1;
    C.isNew = ids('countries');
    renderQuickFilter('c', continentGroups(), C.rows, 'bucket_unitCountries', C.total);
    renderCountries();

    S.families = groupStyles(data.styles);
    S.max = S.families[0]?.count || 1;
    S.isNew = ids('styles');
    renderQuickFilter('s', countGroups(), S.families.flatMap(f => f.styles), 'bucket_unitStyles', sum(data.styles));
    renderStyles();

    renderRecent(data.recent, username);
  }

  // Nøkkeltallene øverst, og samme stripe for vennen i sammenligningen.
  function renderKpis(el, data) {
    const s = data.stats ?? {};
    const tiles = [
      ['kpi_total', s.total],
      ['kpi_unique', s.unique],
      ['kpi_breweries', data.breweries?.length],
      ['kpi_countries', data.countries?.length],
      ['kpi_styles', data.styles?.length],
      ['kpi_badges', s.badges],
      ['kpi_friends', s.friends],
    ];
    render(el, tiles.map(([key, value]) => html`<div class="kpi">
      <span class="v">${value == null ? '–' : num(value)}</span><span class="l">${t(key)}</span></div>`));
  }

  root.DFU = root.DFU || {};
  root.DFU.views = { init, setData, renderKpis, helpers: { fold, highlight, ranked, sum } };
})(globalThis);
