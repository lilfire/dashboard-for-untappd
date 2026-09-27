// Sammenligning med en venn: felles, bare du og bare vennen, for øl, bryggerier, land eller stiler,
// for hele tiden eller tidsrommet som er valgt øverst.
(function (root) {
  const { i18n, fetch: net, store, history, progress } = root.DFU;
  const { html, render, listMore, listClass } = root.DFU.html;
  const { t } = i18n;
  const $ = id => document.getElementById(id);
  const num = n => i18n.number(n);
  const MAX_ITEMS = 300;
  const MAX_BEERS = 300;
  const UNTAPPD = 'https://untappd.com';
  const fold = s => String(s).normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase();

  const K = { me: null, them: null, themName: '', kind: 'breweries', show: null, trendMetric: 'unique', theirCountries: { byBeer: {}, counts: {} } };
  // Åpne rader, nøkkel «type|kolonne|id», og hentingen av vennens land.
  const open = new Set();
  let countrySync = { friend: null, running: false, error: null, controller: null };
  let friends = [];
  let friendsOwner = null;
  let friendsRequest = 0;
  const friendLabel = friend => `${friend.name} (@${friend.username})`;
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
    suggestions = query
      ? friends.filter(friend => hit(friend, s => s.includes(query))).sort((a, b) => starts(b) - starts(a)).slice(0, MAX_SUGGESTIONS)
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

  function split(mine, theirs) {
    const mineById = new Map(mine.map(x => [x.id, x]));
    const theirsById = new Map(theirs.map(x => [x.id, x]));
    const both = [];
    const onlyMe = [];
    for (const x of mine) {
      const y = theirsById.get(x.id);
      if (y) both.push({ ...x, me: x.count, them: y.count });
      else onlyMe.push(x);
    }
    const onlyThem = theirs.filter(y => !mineById.has(y.id));
    const byCount = (a, b) => b.count - a.count;
    both.sort((a, b) => (b.me + b.them) - (a.me + a.them));
    return { both, onlyMe: onlyMe.sort(byCount), onlyThem: onlyThem.sort(byCount) };
  }

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
  function theirBeers() {
    const friend = root.DFU.yearsView?.state?.friend;
    return friend?.name === K.themName ? friend.history?.beers ?? [] : [];
  }
  const myCountries = () => root.DFU.countries?.byBeer() ?? {};

  // Tidsfilteret øverst: hele tiden, ett år eller en periode.
  const scope = () => root.DFU.yearsView?.cmpScope?.() ?? { mode: 'all' };
  const scoped = who => {
    const all = who === 'me' ? myBeers() : theirBeers();
    if (scope().mode === 'all' || !all.length) return all;
    return root.DFU.yearsView.cmpBeers(who === 'me' ? 'me' : 'friend');
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
  function itemsFor(who) {
    if (K.kind === 'beers') return asItems(scoped(who));
    if (scope().mode === 'all') return (who === 'me' ? K.me : K.them)[K.kind];
    return groupBeers(scoped(who), K.kind, who === 'me' ? myCountries() : K.theirCountries.byBeer);
  }

  // Hvorfor ølhistorikken ikke kan vises ennå, eller en tom liste.
  function historyNotes({ countries = false } = {}) {
    const notes = [];
    if (!myBeers().length) notes.push(t('compare_needHistory'));
    else if (countries && !Object.keys(myCountries()).length) notes.push(t('countries_needSyncHint'));
    if (!theirBeers().length) notes.push(t('compare_friendHistoryLoading', K.themName));
    else if (countries) {
      if (countrySync.error && countrySync.friend === K.themName) notes.push(t('years_error', countrySync.error));
      else if (countrySync.running || !Object.keys(K.theirCountries.byBeer ?? {}).length) notes.push(t('compare_countryLoading', K.themName));
    }
    return notes;
  }
  // Kobler alle vennens øl til land med en gang vennen er hentet, via ølsidens landfilter.
  // Bare land som mangler, eller der antallet har endret seg, hentes. Koblingen lagres.
  async function syncFriendCountries() {
    const friend = K.themName;
    if (countrySync.friend === friend && countrySync.running) return;
    countrySync.controller?.abort();
    progress.hideTask($('cmp-task-countries'));
    const stale = (K.them?.countries ?? []).filter(c => K.theirCountries.counts?.[c.id] !== (c.count ?? 0));
    countrySync = { friend, running: stale.length > 0, error: null, controller: new AbortController() };
    if (!stale.length) return;
    const current = () => countrySync.friend === friend && K.themName === friend;
    const start = K.theirCountries;
    const save = async ({ byBeer, counts }, complete) => {
      const value = await store.saveCountries(friend, {
        byBeer: { ...start.byBeer, ...byBeer },
        counts: { ...start.counts, ...counts },
        complete,
      });
      if (current()) K.theirCountries = value;
    };
    const task = $('cmp-task-countries');
    const eta = progress.createEta({ fallbackMs: history.DELAY_MS + 400 });
    const totalPages = history.pagesFor(stale);
    const show = p => {
      const { fraction, remainingMs } = eta.update(p.pages, totalPages);
      progress.showTask(task, {
        label: t('progress_countriesLabel', friend),
        detail: p.country ? t('progress_countriesDetail', p.country, num(p.index + 1), num(p.total), num(p.beers)) : '',
        fraction,
        eta: progress.formatEta(remainingMs, t),
      });
    };
    show({ pages: 0 });
    renderCompare();
    try {
      const res = await history.syncCountries(friend, {
        countries: stale,
        signal: countrySync.controller.signal,
        onCheckpoint: checkpoint => save(checkpoint, false),
        onProgress: p => { if (current()) show(p); },
      });
      if (!current()) return;
      await save(res, res.complete);
    } catch (err) {
      if (!current()) return;
      countrySync.error = err.message;
    }
    countrySync.running = false;
    progress.hideTask(task);
    $('cmp-meta').textContent = countrySync.error ? t('years_error', countrySync.error) : '';
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
  function detail(col, item) {
    const needMine = col !== 'them';
    const needTheirs = col !== 'me';
    const notes = [];
    if (needMine && !myBeers().length) notes.push(t('compare_needHistory'));
    else if (needMine && K.kind === 'countries' && !Object.keys(myCountries()).length) notes.push(t('countries_needSyncHint'));
    if (needTheirs && !theirBeers().length) notes.push(t('compare_friendHistoryLoading', K.themName));
    else if (needTheirs && K.kind === 'countries' && countrySync.friend === K.themName) {
      if (countrySync.running) notes.push(t('compare_countryLoading', K.themName));
      else if (countrySync.error) notes.push(t('years_error', countrySync.error));
    }
    if (notes.length) return html`<p class="meta">${notes.join(' ')}</p>`;

    const mine = needMine ? beersFor(K.kind, item, scoped('me'), myCountries()) : [];
    const theirs = needTheirs ? beersFor(K.kind, item, scoped('them'), K.theirCountries.byBeer) : [];
    if (col === 'me') return group(t('compare_onlyMe'), mine, b => rate(b.ratingYou));
    if (col === 'them') return group(t('compare_onlyThem', K.themName), theirs, b => rate(b.ratingYou));
    const key = b => b.id ?? b.name;
    const theirsByKey = new Map(theirs.map(b => [key(b), b]));
    const s = root.DFU.years.compareYear(mine, theirs);
    return [
      group(`${t('compare_sharedBeers')} (${t('compare_you')} / ${K.themName})`, s.both,
        b => `${rate(b.ratingYou)} / ${rate(theirsByKey.get(key(b))?.ratingYou)}`),
      group(t('compare_onlyMe'), s.onlyMine, b => rate(b.ratingYou)),
      group(t('compare_onlyThem', K.themName), s.onlyTheirs, b => rate(b.ratingYou)),
    ];
  }

  function column(title, items, value, col) {
    const more = items.length > MAX_ITEMS ? html`<li><span>… +${num(items.length - MAX_ITEMS)}</span><span></span></li>` : '';
    const row = K.kind === 'beers' ? x => html`<li><span><a href="${UNTAPPD}${x.url ?? ''}" target="_blank" rel="noopener">${x.name}</a><span class="sub-line">${[x.brewery, x.style].filter(Boolean).join(' · ')}</span></span><span>${value(x)}</span></li>` : x => {
      const key = `${K.kind}|${col}|${x.id}`;
      const isOpen = open.has(key);
      return html`<li><span><button type="button" class="row-toggle" data-cmp="${key}" aria-expanded="${isOpen ? 'true' : 'false'}">${K.kind === 'countries' ? root.DFU.countryNames.localName(x.name, i18n.locale()) : x.name}</button></span><span>${value(x)}</span>${isOpen ? html`<div class="cmp-detail">${detail(col, x)}</div>` : ''}</li>`;
    };
    const list = `cmp|${K.kind}|${col}`;
    return html`<section class="cmp-col"><h3>${title} <span>${num(items.length)}</span></h3>
      <ol class="${listClass(list)}">${items.slice(0, MAX_ITEMS).map(row)}${more}${items.length ? "" : html`<li class="meta">${t("compare_empty")}</li>`}${listMore(list, items.length)}</ol></section>`;
  }

  // Kumulativ utvikling for deg og vennen i samme diagram, for hele tiden eller valgt tidsrom.
  function renderTrend() {
    const metric = K.trendMetric;
    for (const b of document.querySelectorAll('#cmp-trend-metric button')) b.setAttribute('aria-pressed', String(b.dataset.metric === metric));
    if (!K.me || !K.them) return;
    const chart = $('cmp-trend-chart');
    const note = $('cmp-trend-note');
    render($('cmp-trend-legend'), html`<span><i class="mine"></i>${t('compare_you')}</span><span><i class="theirs"></i>${K.themName}</span>`);

    const notes = historyNotes({ countries: metric === 'countries' });
    if (notes.length) {
      chart.replaceChildren();
      note.textContent = notes.join(' ');
      return;
    }

    const { mode, from, to } = scope();
    const years = root.DFU.years;
    const pick = list => list.map(p => ({ date: p.date, value: p[metric] }));
    const draw = (mine, theirs, fmtDate) => root.DFU.charts.lineChart(chart, [
      { points: mine, cls: 'mine', label: t('compare_you') },
      { points: theirs, cls: 'theirs', label: K.themName },
    ], { fmtValue: v => num(v), fmtDate });
    const monthLabel = d => i18n.date(`${d}T12:00:00`, { month: 'short', year: '2-digit' });

    if (mode !== 'all' && from && to) {
      // Kurven stopper i dag, så et år eller en periode som ikke er over ikke flater ut mot fremtiden.
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const line = (who, byCountry) => years.rangeTimeline(scoped(who), from, to, byCountry, { until: today });
      const mine = line('me', myCountries());
      const theirs = line('them', K.theirCountries.byBeer);
      const days = mine.unit === 'day';
      draw(pick(mine.points), pick(theirs.points), days ? d => i18n.date(`${d}T12:00:00`, { day: 'numeric', month: 'short' }) : monthLabel);
      const last = list => list.at(-1)?.[metric] ?? 0;
      note.textContent = `${t(days ? 'compare_trendNoteDays' : 'compare_trendNoteMonths')} ${t('compare_trendTotal', num(last(mine.points)), K.themName, num(last(theirs.points)))}`;
      return;
    }

    const lastMonth = beers => beers.reduce((max, b) => (typeof b.first === 'string' && b.first.slice(0, 7) > max ? b.first.slice(0, 7) : max), '');
    const until = [lastMonth(myBeers()), lastMonth(theirBeers())].sort().at(-1);
    const mine = pick(years.timeline(myBeers(), myCountries(), { until }));
    const theirs = pick(years.timeline(theirBeers(), K.theirCountries.byBeer, { until }));
    draw(mine, theirs, monthLabel);
    // Vekst de siste tolv månedene, regnet fra samme sluttmåned for begge.
    const growth = list => (list.at(-1)?.value ?? 0) - (list.at(-13)?.value ?? 0);
    note.textContent = `${t('compare_trendNote')} ${t('compare_trendLast12', num(growth(mine)), K.themName, num(growth(theirs)))}`;
  }

  function renderCompare() {
    for (const b of document.querySelectorAll('#cmp-kind button')) b.setAttribute('aria-pressed', String(b.dataset.kind === K.kind));
    if (!K.me || !K.them) return;
    $('cmp-kpis-title').textContent = t('compare_totals', K.themName);
    root.DFU.views.renderKpis($('cmp-kpis'), K.them);
    const beers = K.kind === 'beers';
    const ranged = scope().mode !== 'all';
    const notes = beers || ranged ? historyNotes({ countries: ranged && K.kind === 'countries' }) : [];
    if (notes.length) {
      $('cmp-summary').textContent = '';
      if ($('cmp-overlap')) render($('cmp-overlap'), []);
      render($('cmp-cols'), html`<p class="meta">${notes.join(' ')}</p>`);
      renderTrend();
      $('cmp-out').hidden = false;
      return;
    }
    const s = split(itemsFor('me'), itemsFor('them'));
    const unit = beers ? t('compare_beers') : t('tab_' + K.kind);
    $('cmp-summary').textContent = t('compare_summary', num(s.both.length), num(s.onlyMe.length), num(s.onlyThem.length), K.themName);
    const total = s.both.length + s.onlyMe.length + s.onlyThem.length;
    const segments = [
      [t('compare_onlyMe'), s.onlyMe.length, 'mine', 'me'],
      [t('compare_both'), s.both.length, 'shared', 'both'],
      [t('compare_onlyThem', K.themName), s.onlyThem.length, 'theirs', 'them'],
    ];
    // Kortene velger hvilken liste som vises under; bare én om gangen.
    if ($('cmp-overlap')) render($('cmp-overlap'), html`
      <div class="cmp-metrics">${segments.map(([label, count, tone, col]) => html`<button type="button" class="cmp-stat ${tone}" data-show="${col}" aria-pressed="${K.show === col ? 'true' : 'false'}"><span>${label}</span><strong>${num(count)}</strong><small>${unit}</small></button>`)}</div>
      <div class="cmp-overlap-track" aria-hidden="true">${segments.map(([, count, tone]) => html`<i class="${tone}" style="width:${total ? count / total * 100 : 0}%"></i>`)}</div>
      ${total ? '' : html`<p class="meta">${t('compare_empty')}</p>`}`);
    // Øl viser ratingene; de andre fanene antall.
    const theirById = beers ? new Map(itemsFor('them').map(x => [x.id, x])) : null;
    const bothValue = beers ? x => `${rate(x.ratingYou)} / ${rate(theirById.get(x.id)?.ratingYou)}` : x => `${num(x.me)} / ${num(x.them)}`;
    const oneValue = beers ? x => rate(x.ratingYou) : x => num(x.count);
    const cols = {
      both: () => column(`${t('compare_both')} (${t('compare_you')} / ${K.themName})`, s.both, bothValue, 'both'),
      me: () => column(t('compare_onlyMe'), s.onlyMe, oneValue, 'me'),
      them: () => column(t('compare_onlyThem', K.themName), s.onlyThem, oneValue, 'them'),
    };
    render($('cmp-cols'), cols[K.show]?.() ?? html`<p class="meta">${t('compare_pickList')}</p>`);
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
    await loadFriend(name);
  }

  // Henter vennens profil og setter i gang historikk og land. force hentes historikken selv om den er ny.
  async function loadFriend(name, { force = false } = {}) {
    const btn = $('cmp-form').querySelector('button');
    btn.disabled = true;
    $('cmp-meta').textContent = t('compare_loading', name);
    try {
      const r = await net.fetchDirect(name);
      if (!r.data.hasData) {
        $('cmp-meta').textContent = t('compare_notFound', name);
        return;
      }
      const themName = r.data.pageOwner || name;
      if (themName !== K.themName) {
        open.clear();
        K.theirCountries = await store.loadCountries(themName);
      }
      K.them = r.data;
      K.themName = themName;
      $('cmp-meta').textContent = '';
      renderCompare();
      root.DFU.yearsView?.setFriend(K.themName, K.them?.stats?.unique ?? null, { force });
      const countries = syncFriendCountries();
      void root.DFU.compareBadges?.setFriend(K.themName, K.them?.stats?.badges ?? null, { force, waitFor: countries });
    } catch (err) {
      $('cmp-meta').textContent = t('err_network', err.message);
    } finally {
      btn.disabled = false;
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
    // Klikk på et navn i en kolonne åpner eller lukker ølene bak raden.
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
      document.addEventListener(name, () => { if (open.size || K.kind === 'beers') renderCompare(); else renderTrend(); });
    }
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

  // Kalles av Oppdater-knappen i headeren: henter vennen det sammenlignes med på nytt.
  async function refresh() {
    if (K.themName) await loadFriend(K.themName, { force: true });
  }

  root.DFU = root.DFU || {};
  root.DFU.compare = { init, setMe, split, beersFor, groupBeers, refresh };
})(globalThis);
