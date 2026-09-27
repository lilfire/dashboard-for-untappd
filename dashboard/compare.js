// Sammenligning med opptil fire venner: felles for alle, bare du, bare hver venn og noen av dere,
// for øl, bryggerier, land eller stiler, for hele tiden eller tidsrommet som er valgt øverst.
(function (root) {
  const { i18n, fetch: net, store, history, progress } = root.DFU;
  const { html, render, listMore, listClass } = root.DFU.html;
  const { t } = i18n;
  const $ = id => document.getElementById(id);
  const num = n => i18n.number(n);
  const MAX_ITEMS = 300;
  const MAX_BEERS = 300;
  const MAX_FRIENDS = 4;
  const UNTAPPD = 'https://untappd.com';
  const fold = s => String(s).normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase();

  // Vennene i rekkefølgen de ble lagt til: { key, name, data, countries, sync }. data er profilen når den er hentet.
  const K = { me: null, friends: [], kind: 'breweries', show: null, trendMetric: 'unique' };
  const idle = () => ({ running: false, error: null, controller: null });
  // Åpne rader, nøkkel «type|kort|id».
  const open = new Set();
  // Tunge hentinger (historikk, land, merker) går for én venn om gangen.
  let queue = Promise.resolve();
  const enqueue = job => { queue = queue.then(job).catch(() => {}); return queue; };
  let friends = [];
  let friendsOwner = null;
  let friendsRequest = 0;
  const friendLabel = friend => `${friend.name} (@${friend.username})`;
  // Navnet som vises for en venn: navnet fra vennelisten (samme som i søket), ellers brukernavnet.
  const label = username => friends.find(f => f.username.toLowerCase() === String(username).toLowerCase())?.name || username;
  // Vennelisten er ny: tegn navnene på nytt overalt i sammenligningen.
  const namesChanged = () => {
    if (!K.friends.length) return;
    renderPeople();
    renderCompare();
    document.dispatchEvent(new CustomEvent('dfu:friend-names'));
  };
  const MAX_SUGGESTIONS = 8;
  // Forslagene som vises under søkefeltet, og hvilket av dem som er uthevet.
  let suggestions = [];
  let active = -1;

  function closeSuggestions() {
    suggestions = [];
    active = -1;
    const input = $('cmp-user');
    $('cmp-friends').hidden = true;
    render($('cmp-friends'), []);
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  // Vennene som passer søket på navn eller brukernavn; treff i starten av ordet først.
  function renderSuggestions() {
    const input = $('cmp-user');
    const query = fold(input.value.trim());
    const hit = (friend, test) => test(fold(friend.name)) || test(fold(friend.username));
    const starts = friend => hit(friend, s => s.startsWith(query));
    const added = friend => K.friends.some(f => f.key === friend.username.toLowerCase() || f.name.toLowerCase() === friend.username.toLowerCase());
    suggestions = query
      ? friends.filter(friend => !added(friend) && hit(friend, s => s.includes(query))).sort((a, b) => starts(b) - starts(a)).slice(0, MAX_SUGGESTIONS)
      : [];
    if (!suggestions.length) return closeSuggestions();
    active = Math.min(active, suggestions.length - 1);
    render($('cmp-friends'), suggestions.map((friend, i) => html`<li role="option" id="cmp-friend-${i}" data-index="${i}" aria-selected="${i === active ? 'true' : 'false'}">
      <span class="combo-name">${friend.name}</span><span class="combo-user">@${friend.username}</span></li>`));
    $('cmp-friends').hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (active < 0) input.removeAttribute('aria-activedescendant');
    else {
      input.setAttribute('aria-activedescendant', `cmp-friend-${active}`);
      $(`cmp-friend-${active}`)?.scrollIntoView?.({ block: 'nearest' });
    }
  }

  function pickFriend(friend) {
    $('cmp-user').value = friendLabel(friend);
    closeSuggestions();
    void run();
  }

  function onSearchKey(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!suggestions.length) renderSuggestions();
      const n = suggestions.length;
      if (!n) return;
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      active = active < 0 ? (step > 0 ? 0 : n - 1) : (active + step + n) % n;
      renderSuggestions();
    } else if (e.key === 'Enter' && active >= 0 && suggestions[active]) {
      e.preventDefault();
      pickFriend(suggestions[active]);
    } else if (e.key === 'Escape' && suggestions.length) {
      e.preventDefault();
      closeSuggestions();
    }
  }
  function friendsError(reason) {
    const keys = {
      friends_logged_out: 'compare_friendsLoggedOut',
      friends_challenge: 'compare_friendsChallenge',
      friends_pagination_stalled: 'compare_friendsStalled',
      friends_incomplete: 'compare_friendsIncomplete',
    };
    return keys[reason] ? t(keys[reason]) : t('compare_friendsDetails', reason || 'Unknown error');
  }

  // Nye venner fra lager eller nett oppdaterer forslagene bare mens brukeren står i feltet.
  const refreshSuggestions = () => { if (document.activeElement === $('cmp-user')) renderSuggestions(); };

  async function loadFriends() {
    const owner = K.me?.pageOwner;
    if (!owner || owner === friendsOwner) return;
    friendsOwner = owner;
    const request = ++friendsRequest;
    friends = [];
    closeSuggestions();
    $('cmp-friends-meta').textContent = t('compare_friendsLoading');
    try {
      const [cached, settings] = await Promise.all([store.loadFriends(owner), store.getSettings()]);
      if (request !== friendsRequest) return;
      friends = cached.friends;
      refreshSuggestions();
      namesChanged();
      const expected = K.me?.stats?.friends;
      const fresh = cached.complete && cached.syncedAt != null &&
        Date.now() - cached.syncedAt < settings.staleHours * 3600000 &&
        (expected == null || expected === friends.length);
      if (fresh) {
        $('cmp-friends-meta').textContent = '';
        return;
      }
      const result = await net.fetchFriends(owner, { onProgress: count => {
        if (request === friendsRequest) $('cmp-friends-meta').textContent = t('compare_friendsProgress', num(count));
      } });
      if (request !== friendsRequest) return;
      friends = result.partial
        ? [...new Map([...friends, ...result.friends].map(friend => [friend.username.toLowerCase(), friend])).values()]
        : result.friends;
      refreshSuggestions();
      namesChanged();
      if (!result.partial || !cached.complete) await store.saveFriends(owner, { friends, complete: !result.partial });
      if (request !== friendsRequest) return;
      $('cmp-friends-meta').textContent = result.partial ? t('compare_friendsPartial') : '';
      if (result.partial) {
        friendsOwner = null;
        if (result.error) $('cmp-friends-meta').textContent += ` ${friendsError(result.error)}`;
      }
    } catch (err) {
      if (request !== friendsRequest) return;
      friendsOwner = null; // Tillat et nytt forsøk ved neste fokus.
      $('cmp-friends-meta').textContent = friendsError(err.message);
    }
  }

  // Deler listene til flere personer i felles for alle, bare hver person og noen av dere.
  // lists[i] er elementene til person i ({ id, name, count }); 0 er deg. counts har antallet per person, eller null.
  function splitMany(lists) {
    const c = root.DFU.years.compareMany(lists, x => x.id);
    const row = r => ({ ...r.item, items: r.items, counts: r.items.map(x => (x ? x.count : null)) });
    const total = r => r.counts.reduce((sum, n) => sum + (n ?? 0), 0);
    const held = r => r.counts.filter(n => n != null).length;
    const byTotal = (a, b) => total(b) - total(a);
    return {
      all: c.all.map(row).sort(byTotal),
      only: c.only.map((list, i) => list.map(row).sort((a, b) => b.counts[i] - a.counts[i])),
      some: c.some.map(row).sort((a, b) => held(b) - held(a) || byTotal(a, b)),
    };
  }

  // Kortene over listene: bare du, felles, noen av dere (bare med flere enn to) og bare hver venn.
  // s har bøttene all, only og some; names og tones følger personene.
  // keys er det kortene kjennes igjen på (brukernavn); standard er names.
  function buckets(names, s, tones = names.map((_, i) => `p${i}`), keys = names) {
    const n = names.length;
    const everyone = names.map((_, i) => i);
    const only = i => {
      const label = i ? t('compare_onlyThem', names[i]) : t('compare_onlyMe');
      return { key: i ? `only:${keys[i]}` : 'me', label, title: label, rows: s.only[i], tone: tones[i], only: i, cols: [i], many: n > 2 };
    };
    const allLabel = n > 2 ? t('compare_allShared') : t('compare_both');
    // Med flere enn to blir navnelisten i tittelen for lang; forklaringen over listen viser navnene.
    return [
      only(0),
      { key: 'all', label: allLabel, title: n > 2 ? allLabel : `${allLabel} (${names.join(' / ')})`, rows: s.all, tone: 'shared', only: null, cols: everyone, many: n > 2 },
      ...(n > 2 ? [{ key: 'some', label: t('compare_some'), title: t('compare_some'), rows: s.some, tone: 'some', only: null, cols: everyone, many: true }] : []),
      ...names.slice(1).map((_, i) => only(i + 1)),
    ];
  }

  // Teksten på et kort. Hele navnet står alltid; kortet har personens farge som kant øverst.
  const cardLabel = card => html`<span>${card.label}</span>`;

  // Fargen til en venn følger plassen i listen, så den er den samme i kort, kurve og brikker.
  const tone = name => `p${K.friends.findIndex(f => f.name === name) + 1}`;

  // Med flere enn to personer er det på mobil ikke plass til navnene i kolonnene. Da står personens farge
  // som en prikk, og forklaringen over tabellen eller listen viser prikken med fullt navn, alltid synlig
  // (ingen hover på touchskjerm). Begge deler skrives ut; CSS viser prikkene på smal skjerm og hele
  // navnet (cmp-fullname) på bred skjerm, der forklaringen skjules.
  const personKey = p => html`<b class="cmp-key ${p.tone}" role="img" aria-label="${p.name}"></b>`;
  const fullName = text => html`<span class="cmp-fullname">${text}</span>`;
  const legendItems = ps => ps.map(p => html`<span>${personKey(p)}${p.name}</span>`);
  // shared: teksten for en «Felles for alle»-kolonne, som da står i forklaringen med grønn prikk.
  const namesCaption = (ps, shared = null) => (ps.length > 2
    ? html`<caption class="cmp-names">${legendItems(ps)}${shared ? html`<span><b class="cmp-key shared" aria-hidden="true"></b>${shared}</span>` : ''}</caption>`
    : '');
  const namesLegend = ps => (ps.length > 2 ? html`<div class="cmp-names">${legendItems(ps)}</div>` : '');
  const nameHead = (p, many, cls = '') => (many
    ? html`<th class="cmp-name keyed ${cls}">${personKey(p)}${fullName(p.name)}</th>`
    : html`<th class="cmp-name ${p.tone} ${cls}">${p.name}</th>`);

  // Ølene som hører til ett bryggeri, én stil eller ett land, nyest først.
  function beersFor(kind, item, beers, byBeer = {}) {
    const name = fold(item.name ?? '');
    const id = String(item.id ?? '');
    const match = kind === 'breweries'
      ? b => (b.brewery != null && fold(b.brewery) === name) || (!!id && String(b.breweryUrl ?? '').match(/\/(\d+)\/?$/)?.[1] === id)
      : kind === 'styles' ? b => b.style === item.name
      : b => byBeer[b.id] === item.name;
    return (beers ?? []).filter(match).sort((a, b) => String(b.first ?? '').localeCompare(String(a.first ?? '')));
  }

  // Hele historikken, brukt av trenden og for å se om historikken er hentet.
  const myBeers = () => root.DFU.yearsView?.state?.history?.beers ?? [];
  const friendBeers = name => root.DFU.yearsView?.state?.friends?.get?.(name)?.history?.beers ?? [];
  const myCountries = () => root.DFU.countries?.byBeer() ?? {};
  const ready = () => K.friends.filter(f => f.data);

  // Deg og vennene som er hentet, i rekkefølge. who er 'me' eller vennens navn.
  function persons() {
    return [
      { who: 'me', name: t('compare_you'), data: K.me, beers: myBeers(), byBeer: myCountries(), tone: 'p0', friend: null },
      ...ready().map(f => ({ who: f.name, name: label(f.name), data: f.data, beers: friendBeers(f.name), byBeer: f.countries.byBeer ?? {}, tone: tone(f.name), friend: f })),
    ];
  }

  // Tidsfilteret øverst: hele tiden, ett år eller en periode.
  const scope = () => root.DFU.yearsView?.cmpScope?.() ?? { mode: 'all' };
  const scoped = p => {
    if (scope().mode === 'all' || !p.beers.length) return p.beers;
    return root.DFU.yearsView.cmpBeers(p.who);
  };

  // Bryggerier, stiler eller land for en liste med øl, med antall øl i hver.
  function groupBeers(beers, kind, byBeer = {}) {
    const groups = new Map();
    for (const b of beers ?? []) {
      let id, name;
      if (kind === 'breweries') {
        if (!b.brewery && !b.breweryUrl) continue;
        id = String(b.breweryUrl ?? '').match(/\/(\d+)\/?$/)?.[1] ?? (b.breweryUrl || fold(b.brewery));
        name = b.brewery ?? id;
      } else {
        name = kind === 'styles' ? b.style : byBeer[b.id];
        if (!name) continue;
        id = name;
      }
      const cur = groups.get(id) ?? { id, name, count: 0 };
      cur.count++;
      groups.set(id, cur);
    }
    return [...groups.values()];
  }

  // Radene for fanen: ølene fra historikken, ellers listene fra profilen.
  // Med år eller periode regnes også bryggerier, stiler og land ut fra ølene i tidsrommet.
  const asItems = beers => beers.map(b => ({ ...b, id: b.id ?? b.name, count: b.checkins ?? 1 }));
  function itemsFor(p) {
    if (K.kind === 'beers') return asItems(scoped(p));
    if (scope().mode === 'all') return p.data?.[K.kind] ?? [];
    return groupBeers(scoped(p), K.kind, p.byBeer);
  }

  // Hvorfor ølhistorikken ikke kan vises ennå for noen av personene i ps.
  function historyNotes(ps, { countries = false } = {}) {
    const notes = [];
    for (const p of ps) {
      if (!p.friend) {
        if (!p.beers.length) notes.push(t('compare_needHistory'));
        else if (countries && !Object.keys(p.byBeer).length) notes.push(t('countries_needSyncHint'));
      } else if (!p.beers.length) notes.push(t('compare_friendHistoryLoading', p.name));
      else if (countries) {
        const sync = p.friend.sync;
        if (sync.error) notes.push(t('years_error', sync.error));
        else if (sync.running || !Object.keys(p.byBeer).length) notes.push(t('compare_countryLoading', p.name));
      }
    }
    return notes;
  }

  // Kobler alle vennens øl til land, via ølsidens landfilter.
  // Bare land som mangler, eller der antallet har endret seg, hentes. Koblingen lagres.
  async function syncFriendCountries(friend) {
    const { name } = friend;
    if (friend.sync.running) return;
    const stale = (friend.data?.countries ?? []).filter(c => friend.countries.counts?.[c.id] !== (c.count ?? 0));
    const controller = new AbortController();
    friend.sync = { running: stale.length > 0, error: null, controller };
    if (!stale.length) return;
    const current = () => K.friends.includes(friend) && friend.sync.controller === controller;
    const start = friend.countries;
    const save = async ({ byBeer, counts }, complete) => {
      const value = await store.saveCountries(name, {
        byBeer: { ...start.byBeer, ...byBeer },
        counts: { ...start.counts, ...counts },
        complete,
      });
      if (current()) friend.countries = value;
    };
    const task = progress.taskFor?.($('cmp-tasks'), `${name}|countries`, 'countries') ?? null;
    const eta = progress.createEta({ fallbackMs: history.DELAY_MS + 400 });
    const totalPages = history.pagesFor(stale);
    const show = p => {
      const { fraction, remainingMs } = eta.update(p.pages, totalPages);
      progress.showTask(task, {
        label: t('progress_countriesLabel', label(name)),
        detail: p.country ? t('progress_countriesDetail', p.country, num(p.index + 1), num(p.total), num(p.beers)) : '',
        fraction,
        eta: progress.formatEta(remainingMs, t),
      });
    };
    show({ pages: 0 });
    renderCompare();
    try {
      const res = await history.syncCountries(name, {
        countries: stale,
        signal: controller.signal,
        onCheckpoint: checkpoint => save(checkpoint, false),
        onProgress: p => { if (current()) show(p); },
      });
      if (!current()) return;
      await save(res, res.complete);
    } catch (err) {
      if (!current()) return;
      friend.sync.error = err.message;
    }
    if (!current()) return;
    friend.sync.running = false;
    progress.hideTask(task);
    renderCompare();
  }

  const rate = v => (v == null ? '–' : v.toLocaleString(i18n.locale(), { maximumFractionDigits: 2 }));

  function beerList(list, rating) {
    const sub = b => (K.kind === 'breweries' ? b.style : K.kind === 'styles' ? b.brewery : [b.brewery, b.style].filter(Boolean).join(' · '));
    const more = list.length > MAX_BEERS ? html`<li class="meta">… +${num(list.length - MAX_BEERS)}</li>` : '';
    return html`<ul class="cmp-beers">${list.slice(0, MAX_BEERS).map(b => html`<li>
      <span><a href="${UNTAPPD}${b.url ?? ''}" target="_blank" rel="noopener">${b.name}</a><span class="sub-line">${sub(b)}</span></span>
      <span>${rating(b)}</span></li>`)}${more}</ul>`;
  }

  const group = (title, list, rating) => html`<h4>${title} <span>${num(list.length)}</span></h4>
    ${list.length ? beerList(list, rating) : html`<p class="meta">${t('compare_noBeers')}</p>`}`;

  // Innholdet under en åpnet rad, eller en melding når dataene mangler.
  function detail(card, item, ps) {
    const needed = card.cols.map(i => ps[i]);
    const notes = historyNotes(needed, { countries: K.kind === 'countries' });
    if (notes.length) return html`<p class="meta">${notes.join(' ')}</p>`;

    const lists = ps.map((p, i) => (card.cols.includes(i) ? beersFor(K.kind, item, scoped(p), p.byBeer) : []));
    if (card.only != null) return group(card.label, lists[card.only], b => rate(b.ratingYou));
    const c = root.DFU.years.compareMany(lists);
    const beers = rows => rows.map(r => ({ ...r.item, rowItems: r.items }));
    const ratings = b => b.rowItems.map(x => rate(x?.ratingYou)).join(' / ');
    const names = ps.map(p => p.name).join(' / ');
    return [
      group(`${ps.length > 2 ? t('compare_allShared') : t('compare_sharedBeers')} (${names})`, beers(c.all), ratings),
      ps.length > 2 ? group(`${t('compare_some')} (${names})`, beers(c.some), ratings) : '',
      ...ps.map((p, i) => group(i ? t('compare_onlyThem', p.name) : t('compare_onlyMe'), beers(c.only[i]), b => rate(b.rowItems[i]?.ratingYou))),
    ];
  }

  // Listen bak et kort, med én verdi per person i kortet (antall, eller rating for øl).
  function column(card, ps) {
    const { rows, cols } = card;
    const beers = K.kind === 'beers';
    const value = (x, i) => (beers ? (x.items[i] ? rate(x.items[i].ratingYou) : '–') : x.counts[i] == null ? '–' : num(x.counts[i]));
    const values = x => html`<span class="cmp-vals">${cols.map(i => html`<span>${value(x, i)}</span>`)}</span>`;
    const many = cols.length > 2;
    const head = cols.length > 1 ? html`${many ? namesLegend(cols.map(i => ps[i])) : ''}<div class="cmp-head${many ? ' keyed' : ''}" aria-hidden="true"><span class="cmp-vals">${cols.map(i => html`<span class="${ps[i].tone}">${many ? html`${personKey(ps[i])}${fullName(ps[i].name)}` : ps[i].name}</span>`)}</span></div>` : '';
    const more = rows.length > MAX_ITEMS ? html`<li><span>… +${num(rows.length - MAX_ITEMS)}</span><span></span></li>` : '';
    const row = beers ? x => html`<li><span><a href="${UNTAPPD}${x.url ?? ''}" target="_blank" rel="noopener">${x.name}</a><span class="sub-line">${[x.brewery, x.style].filter(Boolean).join(' · ')}</span></span>${values(x)}</li>` : x => {
      const key = `${K.kind}|${card.key}|${x.id}`;
      const isOpen = open.has(key);
      return html`<li><span><button type="button" class="row-toggle" data-cmp="${key}" aria-expanded="${isOpen ? 'true' : 'false'}">${K.kind === 'countries' ? root.DFU.countryNames.localName(x.name, i18n.locale()) : x.name}</button></span>${values(x)}${isOpen ? html`<div class="cmp-detail">${detail(card, x, ps)}</div>` : ''}</li>`;
    };
    const list = `cmp|${K.kind}|${card.key}`;
    return html`<section class="cmp-col${many ? ' many' : ''}"><h3>${many ? card.label : card.title} <span>${num(rows.length)}</span></h3>${head}
      <ol class="${listClass(list)}">${rows.slice(0, MAX_ITEMS).map(row)}${more}${rows.length ? '' : html`<li class="meta">${t('compare_empty')}</li>`}${listMore(list, rows.length)}</ol></section>`;
  }

  // Nøkkeltallene fra profilene, én kolonne per person. Høyeste tall utheves.
  function renderKpis(ps) {
    const rows = [
      ['kpi_total', d => d?.stats?.total],
      ['kpi_unique', d => d?.stats?.unique],
      ['kpi_breweries', d => d?.breweries?.length],
      ['kpi_countries', d => d?.countries?.length],
      ['kpi_styles', d => d?.styles?.length],
      ['kpi_badges', d => d?.stats?.badges],
      ['kpi_friends', d => d?.stats?.friends],
    ];
    $('cmp-kpis').classList.toggle('many', ps.length > 2);
    render($('cmp-kpis'), html`${namesCaption(ps)}<thead><tr><th>${t('compare_totalsMany')}</th>${ps.map(p => nameHead(p, ps.length > 2))}</tr></thead>
      <tbody>${rows.map(([key, pick]) => {
        const values = ps.map(p => pick(p.data) ?? null);
        const lead = root.DFU.years.leaders(values);
        return html`<tr><td>${t(key)}</td>${values.map((v, i) => html`<td class="${lead[i] ? 'win' : ''}">${v == null ? '–' : num(v)}</td>`)}</tr>`;
      })}</tbody>`);
  }

  // Kumulativ utvikling for deg og vennene i samme diagram, for hele tiden eller valgt tidsrom.
  function renderTrend() {
    const metric = K.trendMetric;
    for (const b of document.querySelectorAll('#cmp-trend-metric button')) b.setAttribute('aria-pressed', String(b.dataset.metric === metric));
    const ps = persons();
    if (!K.me || ps.length < 2) return;
    const chart = $('cmp-trend-chart');
    const note = $('cmp-trend-note');
    render($('cmp-trend-legend'), ps.map(p => html`<span><i class="${p.tone}"></i>${p.name}</span>`));

    const notes = historyNotes(ps, { countries: metric === 'countries' });
    if (notes.length) {
      chart.replaceChildren();
      note.textContent = notes.join(' ');
      return;
    }

    const { mode, from, to } = scope();
    const years = root.DFU.years;
    const pick = list => list.map(p => ({ date: p.date, value: p[metric] }));
    const draw = (series, fmtDate) => root.DFU.charts.lineChart(chart,
      series.map((points, i) => ({ points, cls: ps[i].tone, label: ps[i].name })), { fmtValue: v => num(v), fmtDate });
    const monthLabel = d => i18n.date(`${d}T12:00:00`, { month: 'short', year: '2-digit' });
    // To personer: samme setning som før. Flere: «navn tall» for hver.
    const each = (values, sign = '') => ps.map((p, i) => `${p.name} ${sign}${num(values[i])}`).join(', ');

    if (mode !== 'all' && from && to) {
      // Kurven stopper i dag, så et år eller en periode som ikke er over ikke flater ut mot fremtiden.
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const lines = ps.map(p => years.rangeTimeline(scoped(p), from, to, p.byBeer, { until: today }));
      const days = lines[0].unit === 'day';
      draw(lines.map(l => pick(l.points)), days ? d => i18n.date(`${d}T12:00:00`, { day: 'numeric', month: 'short' }) : monthLabel);
      const last = lines.map(l => l.points.at(-1)?.[metric] ?? 0);
      const total = ps.length === 2 ? t('compare_trendTotal', num(last[0]), ps[1].name, num(last[1])) : t('compare_trendTotalMany', each(last));
      note.textContent = `${t(days ? 'compare_trendNoteDays' : 'compare_trendNoteMonths')} ${total}`;
      return;
    }

    const lastMonth = beers => beers.reduce((max, b) => (typeof b.first === 'string' && b.first.slice(0, 7) > max ? b.first.slice(0, 7) : max), '');
    const until = ps.map(p => lastMonth(p.beers)).sort().at(-1);
    const series = ps.map(p => pick(years.timeline(p.beers, p.byBeer, { until })));
    draw(series, monthLabel);
    // Vekst de siste tolv månedene, regnet fra samme sluttmåned for alle.
    const growth = series.map(list => (list.at(-1)?.value ?? 0) - (list.at(-13)?.value ?? 0));
    const last12 = ps.length === 2 ? t('compare_trendLast12', num(growth[0]), ps[1].name, num(growth[1])) : t('compare_trendLast12Many', each(growth, '+'));
    note.textContent = `${t('compare_trendNote')} ${last12}`;
  }

  // Brikkene for vennene som er med. Feltet stenges når det er fullt.
  function renderPeople() {
    const list = $('cmp-people');
    if (list) {
      list.hidden = !K.friends.length;
      render(list, K.friends.map((f, i) => html`<li class="cmp-person p${i + 1}${f.data ? '' : ' pending'}">
        <b class="cmp-key p${i + 1}" aria-hidden="true"></b><span>${label(f.name)}</span>
        <button type="button" data-remove="${f.key}" aria-label="${t('compare_removeFriend', label(f.name))}">×</button></li>`));
    }
    const full = K.friends.length >= MAX_FRIENDS;
    $('cmp-user').disabled = full;
    const button = $('cmp-form').querySelector('button[type="submit"]') ?? $('cmp-form').querySelector('button');
    if (button) button.disabled = full;
    if (full) closeSuggestions();
  }

  function renderCompare() {
    for (const b of document.querySelectorAll('#cmp-kind button')) b.setAttribute('aria-pressed', String(b.dataset.kind === K.kind));
    const ps = persons();
    if (!K.me || ps.length < 2) {
      if ($('cmp-out')) $('cmp-out').hidden = true;
      return;
    }
    renderKpis(ps);
    const beers = K.kind === 'beers';
    const ranged = scope().mode !== 'all';
    const notes = beers || ranged ? historyNotes(ps, { countries: ranged && K.kind === 'countries' }) : [];
    if (notes.length) {
      $('cmp-summary').textContent = '';
      if ($('cmp-overlap')) render($('cmp-overlap'), []);
      render($('cmp-cols'), html`<p class="meta">${notes.join(' ')}</p>`);
      renderTrend();
      $('cmp-out').hidden = false;
      return;
    }
    const s = splitMany(ps.map(itemsFor));
    const names = ps.map(p => p.name);
    const unit = beers ? t('compare_beers') : t('tab_' + K.kind);
    $('cmp-summary').textContent = ps.length === 2
      ? t('compare_summary', num(s.all.length), num(s.only[0].length), num(s.only[1].length), names[1])
      : t('compare_summaryMany', num(s.all.length), num(s.only[0].length), num(s.some.length));
    const cards = buckets(names, s, ps.map(p => p.tone), ps.map(p => p.who));
    const total = cards.reduce((sum, card) => sum + card.rows.length, 0);
    // Kortene velger hvilken liste som vises under; bare én om gangen.
    if ($('cmp-overlap')) render($('cmp-overlap'), html`
      <div class="cmp-metrics${cards.length > 3 ? ' many' : ''}">${cards.map(card => html`<button type="button" class="cmp-stat ${card.tone}" data-show="${card.key}" aria-pressed="${K.show === card.key ? 'true' : 'false'}" aria-label="${card.label}">${cardLabel(card)}<strong>${num(card.rows.length)}</strong><small>${unit}</small></button>`)}</div>
      <div class="cmp-overlap-track" aria-hidden="true">${cards.map(card => html`<i class="${card.tone}" style="width:${total ? card.rows.length / total * 100 : 0}%"></i>`)}</div>
      ${total ? '' : html`<p class="meta">${t('compare_empty')}</p>`}`);
    const picked = cards.find(card => card.key === K.show);
    render($('cmp-cols'), picked ? column(picked, ps) : html`<p class="meta">${t('compare_pickList')}</p>`);
    renderTrend();
    $('cmp-out').hidden = false;
  }

  async function run(e) {
    e?.preventDefault();
    const input = $('cmp-user').value.trim();
    const matches = friends.filter(friend => friendLabel(friend).toLowerCase() === input.toLowerCase() ||
      friend.username.toLowerCase() === input.toLowerCase() || friend.name.toLowerCase() === input.toLowerCase());
    if (matches.length > 1) {
      $('cmp-meta').textContent = t('compare_chooseFriend');
      renderSuggestions();
      return;
    }
    closeSuggestions();
    const name = matches[0]?.username || input;
    if (!name) return;
    $('cmp-user').value = '';
    await addFriend(name);
  }

  // Legger til en venn, hvis vennen ikke er med fra før og det er plass.
  async function addFriend(name) {
    const key = name.toLowerCase();
    if (K.friends.some(f => f.key === key || f.name.toLowerCase() === key)) {
      $('cmp-meta').textContent = t('compare_alreadyAdded', label(name));
      return;
    }
    if (K.friends.length >= MAX_FRIENDS) {
      $('cmp-meta').textContent = t('compare_maxFriends', num(MAX_FRIENDS));
      return;
    }
    const friend = { key, name, data: null, countries: { byBeer: {}, counts: {} }, sync: idle() };
    K.friends.push(friend);
    renderPeople();
    await loadFriend(friend);
  }

  // Tar en venn ut: stopper hentingene og tegner på nytt uten vennen.
  function removeFriend(friend) {
    if (!K.friends.includes(friend)) return;
    K.friends = K.friends.filter(f => f !== friend);
    friend.sync.controller?.abort();
    if (friend.data) {
      root.DFU.yearsView?.removeFriend?.(friend.name);
      root.DFU.compareBadges?.removeFriend?.(friend.name);
    }
    progress?.removeTasks?.($('cmp-tasks'), friend.name);
    if (K.show === `only:${friend.name}`) K.show = null;
    for (const key of open) if (key.split('|')[1] === `only:${friend.name}`) open.delete(key);
    renderPeople();
    renderCompare();
  }

  // Henter profilen til vennen og viser lagrede data med en gang. Historikk, land og merker hentes i køen,
  // én venn om gangen. force (Oppdater-knappen) henter historikken selv om den er ny.
  async function loadFriend(friend, { force = false } = {}) {
    const alive = () => K.friends.includes(friend);
    $('cmp-meta').textContent = t('compare_loading', label(friend.name));
    try {
      const r = await net.fetchDirect(friend.name);
      if (!alive()) return;
      if (!r.data.hasData) {
        $('cmp-meta').textContent = t('compare_notFound', label(friend.name));
        removeFriend(friend);
        return;
      }
      const name = r.data.pageOwner || friend.name;
      if (K.friends.some(f => f !== friend && f.name === name)) {
        $('cmp-meta').textContent = t('compare_alreadyAdded', label(name));
        removeFriend(friend);
        return;
      }
      if (name !== friend.name || !friend.data) {
        const countries = await store.loadCountries(name);
        if (!alive()) return;
        friend.countries = countries;
      }
      friend.name = name;
      friend.data = r.data;
      $('cmp-meta').textContent = '';
      renderPeople();
      renderCompare();
      const stats = r.data.stats ?? {};
      const years = await root.DFU.yearsView?.addFriend?.(name, stats.unique ?? null, { force });
      const badges = await root.DFU.compareBadges?.addFriend?.(name, stats.badges ?? null, { force });
      if (!alive()) return;
      // Historikken og land + merker går side om side, så det aldri er mer enn to hentinger mot Untappd samtidig.
      void enqueue(async () => {
        if (!alive()) return;
        await Promise.all([
          years?.(),
          (async () => { await syncFriendCountries(friend); if (alive()) await badges?.(); })(),
        ]);
      });
    } catch (err) {
      if (!alive()) return;
      $('cmp-meta').textContent = t('err_network', err.message);
      if (!friend.data) removeFriend(friend);
    }
  }

  function init() {
    const input = $('cmp-user');
    input.addEventListener('focus', () => { void loadFriends(); renderSuggestions(); });
    input.addEventListener('input', () => { active = -1; renderSuggestions(); });
    input.addEventListener('keydown', onSearchKey);
    input.addEventListener('blur', closeSuggestions);
    // mousedown i stedet for click, så feltet ikke mister fokus og lukker listen før valget.
    $('cmp-friends').addEventListener('mousedown', e => {
      e.preventDefault();
      const option = e.target.closest('[data-index]');
      if (option) pickFriend(suggestions[Number(option.dataset.index)]);
    });
    $('cmp-form').addEventListener('submit', run);
    $('cmp-people')?.addEventListener('click', e => {
      const b = e.target.closest('button[data-remove]');
      if (!b) return;
      const friend = K.friends.find(f => f.key === b.dataset.remove);
      if (friend) removeFriend(friend);
      $('cmp-meta').textContent = '';
    });
    $('cmp-kind').addEventListener('click', e => {
      const b = e.target.closest('button[data-kind]');
      if (!b) return;
      K.kind = b.dataset.kind;
      renderCompare();
    });
    $('cmp-trend-metric')?.addEventListener('click', e => {
      const b = e.target.closest('button[data-metric]');
      if (!b) return;
      K.trendMetric = b.dataset.metric;
      renderTrend();
    });
    $('cmp-overlap')?.addEventListener('click', e => {
      const b = e.target.closest('button[data-show]');
      if (!b) return;
      K.show = K.show === b.dataset.show ? null : b.dataset.show;
      renderCompare();
    });
    // Klikk på et navn i en liste åpner eller lukker ølene bak raden.
    $('cmp-cols')?.addEventListener('click', e => {
      const btn = e.target.closest('.row-toggle[data-cmp]');
      if (!btn) return;
      const key = btn.dataset.cmp;
      if (open.has(key)) open.delete(key); else open.add(key);
      renderCompare();
    });
    // Nytt tidsfilter: lukk åpne rader, siden de hører til forrige tidsrom.
    let lastScope = JSON.stringify(scope());
    document.addEventListener('dfu:cmp-scope', () => {
      const now = JSON.stringify(scope());
      if (now !== lastScope) open.clear();
      lastScope = now;
      renderCompare();
    });
    for (const name of ['dfu:history', 'dfu:countries', 'dfu:friend-history']) {
      document.addEventListener(name, () => { if (open.size || K.kind === 'beers' || scope().mode !== 'all') renderCompare(); else renderTrend(); });
    }
    renderPeople();
    renderCompare();
  }

  function setMe(data) {
    if (K.me?.stats?.friends !== data?.stats?.friends) friendsOwner = null;
    if (K.me?.pageOwner !== data?.pageOwner) {
      friendsRequest++;
      friendsOwner = null;
      friends = [];
      closeSuggestions();
      $('cmp-friends-meta').textContent = '';
    }
    K.me = data;
    if (document.activeElement === $('cmp-user')) loadFriends();
    renderCompare();
  }

  // Kalles av Oppdater-knappen i headeren: henter vennene det sammenlignes med på nytt.
  async function refresh() {
    await Promise.all(K.friends.filter(f => f.data).map(f => loadFriend(f, { force: true })));
  }

  root.DFU = root.DFU || {};
  root.DFU.compare = { init, setMe, splitMany, buckets, cardLabel, tone, fullName, label, namesCaption, nameHead, personKey, beersFor, groupBeers, refresh };
})(globalThis);
