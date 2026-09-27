// Merker i sammenligningen: maks nivå og spesialmerker, felles og hver for dere, i valgt tidsrom.
// Vennenes merker hentes automatisk når de legges til, og lagres under hver venns egen nøkkel.
(function (root) {
  const { i18n, store, history, progress, badges: badgesLib } = root.DFU;
  const { html, render, listMore, listClass } = root.DFU.html;
  const { t } = i18n;
  const $ = id => document.getElementById(id);
  const num = n => i18n.number(n);
  const WEEK_MS = 7 * 24 * 3600 * 1000;
  const MAX_ROWS = 300;
  const UNTAPPD = 'https://untappd.com';

  const idle = () => ({ running: false, error: null, controller: null });
  // Vennens navn fra vennelisten i sammenligningen, ellers brukernavnet.
  const label = name => root.DFU.compare?.label?.(name) ?? name;
  const C = {
    // Vennene i rekkefølgen de ble lagt til: navn → { name, count, data, sync }.
    friends: new Map(),
    kind: 'maxed',
    show: null,
  };

  const needsSync = (data, count, force) => force || !data.syncedAt || !data.complete ||
    (count != null && data.count !== count) || Date.now() - data.syncedAt > WEEK_MS;

  const dateText = d => (d ? i18n.date(`${d}T12:00:00`) : '–');

  async function sync(friend) {
    const { name } = friend;
    const controller = new AbortController();
    const current = () => C.friends.get(name) === friend && friend.sync.controller === controller;
    const start = friend.data;
    const full = !start.complete;
    const task = progress.taskFor?.($('cmp-tasks'), `${name}|badges`) ?? null;
    friend.sync = { running: true, error: null, controller };
    const eta = progress.createEta({ fallbackMs: history.DELAY_MS + 400 });
    let total = full ? history.badgePagesFor(friend.count, Math.round((friend.count ?? 0) / 10)) : null;
    const show = p => {
      if (full && p.counts?.all != null) total = history.badgePagesFor(p.counts.all, p.counts.special);
      const { fraction, remainingMs } = eta.update(p.pages, total);
      progress.showTask(task, {
        label: t('progress_badgesLabel', label(name)),
        detail: p.segment ? t('progress_badgesDetail', t(`badges_segment_${p.segment}`), num(p.pages)) : '',
        fraction,
        eta: progress.formatEta(remainingMs, t),
      });
    };
    show({ pages: 0 });
    renderBadges();
    try {
      const res = await history.syncBadges(name, {
        known: start.badges,
        full,
        signal: controller.signal,
        // Mellomlagring beholder forrige merketall, så en avbrutt henting prøves igjen.
        onCheckpoint: async ({ badges, own }) => {
          const value = await store.saveBadges(name, { badges, count: start.count, own: own ?? start.own, complete: false, syncedAt: start.syncedAt });
          if (current()) { friend.data = value; renderBadges(); }
        },
        onProgress: p => { if (current()) show(p); },
      });
      const value = await store.saveBadges(name, {
        badges: res.badges,
        count: res.complete ? friend.count : start.count,
        own: res.own ?? start.own,
        complete: res.complete,
        syncedAt: res.complete ? Date.now() : start.syncedAt,
      });
      if (current()) friend.data = value;
    } catch (err) {
      if (current()) friend.sync.error = err.message;
    }
    if (!current()) return;
    friend.sync.running = false;
    progress.hideTask(task);
    renderBadges();
  }

  // Kalles når en venn er lagt til eller hentes på nytt. Lagrede merker vises med en gang.
  // Returnerer en funksjon som henter merkene når det trengs; sammenligningen kjører den i køen
  // etter landkoblingen, så det ikke går flere enn to hentinger mot Untappd samtidig.
  async function addFriend(name, count, { force = false } = {}) {
    let friend = C.friends.get(name);
    if (!friend) {
      friend = { name, count: null, data: null, sync: idle() };
      C.friends.set(name, friend);
    }
    friend.count = count ?? null;
    const data = await store.loadBadges(name);
    const alive = () => C.friends.get(name) === friend;
    if (!alive()) return async () => {};
    if (!friend.sync.running) friend.data = data;
    renderBadges();
    return async () => {
      if (!alive() || friend.sync.running) return;
      if (needsSync(friend.data, friend.count, force)) await sync(friend);
    };
  }

  function removeFriend(name) {
    const friend = C.friends.get(name);
    if (!friend) return;
    C.friends.delete(name);
    friend.sync.controller?.abort();
    progress.removeTasks?.($('cmp-tasks'), name);
    renderBadges();
  }

  function badgeCell(b, user, sub) {
    return html`<span class="cmp-badge-row">
      ${b.image ? html`<img src="${b.image}" alt="" width="32" height="32" loading="lazy" referrerpolicy="no-referrer">` : html`<span class="ph" aria-hidden="true"></span>`}
      <span><a href="${UNTAPPD}/user/${encodeURIComponent(user)}/badges/${b.id}" target="_blank" rel="noopener">${b.base || b.name}</a>
        <span class="sub-line">${sub}</span></span></span>`;
  }

  function column(title, rows, row, col) {
    const more = rows.length > MAX_ROWS ? html`<li><span>… +${num(rows.length - MAX_ROWS)}</span><span></span></li>` : '';
    const list = `badges|${col}`;
    return html`<section class="cmp-col"><h3>${title} <span>${num(rows.length)}</span></h3>
      <ol class="${listClass(list)}">${rows.slice(0, MAX_ROWS).map(row)}${more}${rows.length ? '' : html`<li class="meta">${t('compare_empty')}</li>`}${listMore(list, rows.length)}</ol></section>`;
  }

  // Med år eller periode valgt øverst vises bare merker tatt i tidsrommet; felles merker når en av dere tok det da.
  function inScope(s) {
    const { mode, from, to } = root.DFU.yearsView?.cmpScope?.() ?? { mode: 'all' };
    if (mode === 'all' || !from || !to) return s;
    const at = d => typeof d === 'string' && d.slice(0, 10) >= from && d.slice(0, 10) <= to;
    const keep = row => row.holders.some(x => x && at(x.date));
    return { all: s.all.filter(keep), only: s.only.map(list => list.filter(keep)), some: s.some.filter(keep) };
  }

  function renderBadges() {
    const el = $('cmp-badges');
    if (!el) return;
    el.hidden = !C.friends.size;
    if (!C.friends.size) return;
    for (const b of document.querySelectorAll('#cmp-badge-kind button')) b.setAttribute('aria-pressed', String(b.dataset.kind === C.kind));

    const view = root.DFU.badgesView;
    const me = view?.state?.user ?? '';
    const mine = view?.badges() ?? [];
    const friends = [...C.friends.values()];
    const ready = friends.filter(f => f.data?.badges?.length);
    const notes = [];
    if (!mine.length) notes.push(t('compare_badgesNeedMine'));
    for (const f of friends) {
      if (f.sync.error) notes.push(t('years_error', `${label(f.name)}: ${f.sync.error}`));
      else if (f.sync.running) notes.push(t(f.data?.badges?.length ? 'compare_badgesPartial' : 'compare_badgesLoading', label(f.name)));
    }
    if (!mine.length || !ready.length) {
      render($('cmp-badges-out'), notes.length ? html`<p class="meta">${notes.join(' ')}</p>` : '');
      return;
    }

    const names = [t('compare_you'), ...ready.map(f => label(f.name))];
    const users = [me, ...ready.map(f => f.name)];
    const c = badgesLib.compareMany(mine, ready.map(f => f.data.badges), {
      mineNextKnown: view.showOpts().nextKnown,
      othersNextKnown: ready.map(f => f.data.own === true),
    });
    const s = inScope(c[C.kind]);
    const maxed = C.kind === 'maxed';
    const kindLabel = t(maxed ? 'compare_badgesMaxed' : 'compare_badgesSpecial');
    const tones = ['p0', ...ready.map(f => root.DFU.compare.tone(f.name))];
    const cards = root.DFU.compare.buckets(names, s, tones, ['me', ...ready.map(f => f.name)]);
    // Med flere enn to står personene som merker (Du, 1, 2 …) i stedet for navn, så radene passer i bredden.
    const many = names.length > 2;
    const key = i => root.DFU.compare.personKey({ name: names[i], tone: tones[i] });
    // Prikk på mobil, hele navnet på bred skjerm (se CSS for cmp-fullname).
    const who = i => html`${key(i)}${root.DFU.compare.fullName(names[i])}`;
    const whoList = items => html`<span class="cmp-who">${items.map(([i, text]) => html`<span>${who(i)}${text}</span>`)}</span>`;
    const firstText = row => (row.first === 'same' ? t('compare_badgesSameDay')
      : row.first == null ? ''
      : many ? html`<span class="cmp-who">${t('compare_badgesFirst', '').trim()}${[].concat(row.first).map(i => html`<span>${who(i)}</span>`)}</span>`
      : t('compare_badgesFirst', [].concat(row.first).map(i => names[i]).join(', ')));
    const otherText = (row, i) => names.map((who, j) => (j === i ? null
      : row.other[j] ? t('compare_badgesOtherLevel', who, num(row.other[j].level ?? 1)) : t('compare_badgesOtherMissing', who)))
      .filter(Boolean).join(' · ');
    const onlySub = x => [maxed ? t('badges_level', num(x.level)) : '', dateText(x.date)].filter(Boolean).join(' · ');
    // Merkene flere av dere har: datoen for hver som har det, og hvem som tok det først.
    const sharedRow = row => {
      const i = row.holders.findIndex(Boolean);
      if (many) {
        const dates = whoList(row.holders.flatMap((x, j) => (x ? [[j, dateText(x.date)]] : [])));
        return html`<li>${badgeCell(row.holders[i], users[i], html`${dates}${firstText(row) ? html`<span class="cmp-who-first">${firstText(row)}</span>` : ''}`)}</li>`;
      }
      const dates = row.holders.flatMap((x, j) => (x ? [`${names[j]} ${dateText(x.date)}`] : [])).join(' · ');
      return html`<li>${badgeCell(row.holders[i], users[i], dates)}<span>${firstText(row)}</span></li>`;
    };
    // Bare én har merket: med flere enn to står de andres nivå under, ellers til høyre.
    const others = (row, i) => whoList(names.flatMap((_, j) => (j === i ? []
      : [[j, row.other[j] ? t('badges_level', num(row.other[j].level ?? 1)) : '–']])));
    const onlyRow = i => row => (many
      ? html`<li>${badgeCell(row.holders[i], users[i], html`${onlySub(row.holders[i])}${maxed ? others(row, i) : ''}`)}</li>`
      : html`<li>${badgeCell(row.holders[i], users[i], onlySub(row.holders[i]))}<span>${maxed ? otherText(row, i) : ''}</span></li>`);
    const picked = cards.find(card => card.key === C.show);
    const rules = ready.filter(f => !f.data.own).map(f => label(f.name));

    render($('cmp-badges-out'), [
      notes.length ? html`<p class="meta">${notes.join(' ')}</p>` : '',
      html`<div class="cmp-metrics${cards.length > 3 ? ' many' : ''}">${cards.map(card => html`<button type="button" class="cmp-stat ${card.tone}" data-show="${card.key}" aria-pressed="${C.show === card.key ? 'true' : 'false'}" aria-label="${card.label}">${root.DFU.compare.cardLabel(card)}<strong>${num(card.rows.length)}</strong><small>${kindLabel}</small></button>`)}</div>`,
      maxed && rules.length ? html`<p class="meta">${t('compare_badgesRule', rules.join(', '))}</p>` : '',
      html`<div class="cmp-cols">${picked
        ? column(picked.title, picked.rows, picked.only == null ? sharedRow : onlyRow(picked.only), picked.key)
        : html`<p class="meta">${t('compare_pickList')}</p>`}</div>`,
    ]);
  }

  function init() {
    $('cmp-badge-kind')?.addEventListener('click', e => {
      const b = e.target.closest('button[data-kind]');
      if (!b) return;
      C.kind = b.dataset.kind;
      renderBadges();
    });
    $('cmp-badges-out')?.addEventListener('click', e => {
      const b = e.target.closest('button[data-show]');
      if (!b) return;
      C.show = C.show === b.dataset.show ? null : b.dataset.show;
      renderBadges();
    });
    for (const name of ['dfu:badges', 'dfu:cmp-scope', 'dfu:friend-names']) document.addEventListener(name, () => renderBadges());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  root.DFU.compareBadges = { addFriend, removeFriend, render: renderBadges, state: C };
})(globalThis);
