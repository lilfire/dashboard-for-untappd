// Merker i sammenligningen: maks nivå og spesialmerker, felles og hver for dere.
// Vennens merker hentes automatisk når vennen velges, og lagres under vennens egen nøkkel.
(function (root) {
  const { i18n, store, history, progress, badges: badgesLib } = root.DFU;
  const { html, render } = root.DFU.html;
  const { t } = i18n;
  const $ = id => document.getElementById(id);
  const num = n => i18n.number(n);
  const WEEK_MS = 7 * 24 * 3600 * 1000;
  const MAX_ROWS = 300;
  const UNTAPPD = 'https://untappd.com';

  const C = {
    friend: null,
    count: null,
    data: null,
    kind: 'maxed',
    sync: { friend: null, running: false, error: null, controller: null },
  };

  const needsSync = (data, count, force) => force || !data.syncedAt || !data.complete ||
    (count != null && data.count !== count) || Date.now() - data.syncedAt > WEEK_MS;

  const dateText = d => (d ? i18n.date(`${d}T12:00:00`) : '–');

  async function sync(name) {
    const current = () => C.friend === name && C.sync.friend === name;
    const start = C.data;
    const full = !start.complete;
    const task = $('cmp-task-badges');
    C.sync = { friend: name, running: true, error: null, controller: new AbortController() };
    const eta = progress.createEta({ fallbackMs: history.DELAY_MS + 400 });
    let total = full ? history.badgePagesFor(C.count, Math.round((C.count ?? 0) / 10)) : null;
    const show = p => {
      if (full && p.counts?.all != null) total = history.badgePagesFor(p.counts.all, p.counts.special);
      const { fraction, remainingMs } = eta.update(p.pages, total);
      progress.showTask(task, {
        label: t('progress_badgesLabel', name),
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
        signal: C.sync.controller.signal,
        // Mellomlagring beholder forrige merketall, så en avbrutt henting prøves igjen.
        onCheckpoint: async ({ badges, own }) => {
          const value = await store.saveBadges(name, { badges, count: start.count, own: own ?? start.own, complete: false, syncedAt: start.syncedAt });
          if (current()) { C.data = value; renderBadges(); }
        },
        onProgress: p => { if (current()) show(p); },
      });
      const value = await store.saveBadges(name, {
        badges: res.badges,
        count: res.complete ? C.count : start.count,
        own: res.own ?? start.own,
        complete: res.complete,
        syncedAt: res.complete ? Date.now() : start.syncedAt,
      });
      if (current()) C.data = value;
    } catch (err) {
      if (current()) C.sync.error = err.message;
    }
    if (!current()) return;
    C.sync.running = false;
    progress.hideTask(task);
    renderBadges();
  }

  // Kalles når en venn er hentet. Lagrede merker vises med en gang. Hentingen venter på waitFor
  // (landkoblingen), så det ikke går flere enn to hentinger mot Untappd samtidig.
  async function setFriend(name, count, { force = false, waitFor = null } = {}) {
    if (C.friend !== name) {
      C.sync.controller?.abort();
      C.sync = { friend: null, running: false, error: null, controller: null };
      progress.hideTask($('cmp-task-badges'));
    }
    C.friend = name;
    C.count = count ?? null;
    const data = await store.loadBadges(name);
    if (C.friend !== name) return;
    C.data = data;
    renderBadges();
    await waitFor;
    if (C.friend !== name || (C.sync.friend === name && C.sync.running)) return;
    if (needsSync(C.data, C.count, force)) await sync(name);
  }

  function badgeCell(b, user, sub) {
    return html`<span class="cmp-badge-row">
      ${b.image ? html`<img src="${b.image}" alt="" width="32" height="32" loading="lazy" referrerpolicy="no-referrer">` : html`<span class="ph" aria-hidden="true"></span>`}
      <span><a href="${UNTAPPD}/user/${encodeURIComponent(user)}/badges/${b.id}" target="_blank" rel="noopener">${b.base || b.name}</a>
        <span class="sub-line">${sub}</span></span></span>`;
  }

  function column(title, rows, row) {
    const more = rows.length > MAX_ROWS ? html`<li><span>… +${num(rows.length - MAX_ROWS)}</span><span></span></li>` : '';
    return html`<section class="cmp-col"><h3>${title} <span>${num(rows.length)}</span></h3>
      <ol>${rows.slice(0, MAX_ROWS).map(row)}${more}${rows.length ? '' : html`<li class="meta">${t('compare_empty')}</li>`}</ol></section>`;
  }

  function renderBadges() {
    const el = $('cmp-badges');
    if (!el) return;
    el.hidden = !C.friend;
    if (!C.friend) return;
    for (const b of document.querySelectorAll('#cmp-badge-kind button')) b.setAttribute('aria-pressed', String(b.dataset.kind === C.kind));

    const view = root.DFU.badgesView;
    const me = view?.state?.user ?? '';
    const mine = view?.badges() ?? [];
    const theirs = C.data?.badges ?? [];
    const running = C.sync.friend === C.friend && C.sync.running;
    const notes = [];
    if (!mine.length) notes.push(t('compare_badgesNeedMine'));
    if (C.sync.friend === C.friend && C.sync.error) notes.push(t('years_error', C.sync.error));
    else if (running) notes.push(t(theirs.length ? 'compare_badgesPartial' : 'compare_badgesLoading', C.friend));
    if (!mine.length || !theirs.length) {
      render($('cmp-badges-out'), notes.length ? html`<p class="meta">${notes.join(' ')}</p>` : '');
      return;
    }

    const c = badgesLib.compare(mine, theirs, { mineNextKnown: view.showOpts().nextKnown, theirsNextKnown: C.data.own === true });
    const s = c[C.kind];
    const maxed = C.kind === 'maxed';
    const kindLabel = t(maxed ? 'compare_badgesMaxed' : 'compare_badgesSpecial');
    const segments = [
      [t('compare_onlyMe'), s.onlyMe.length, 'mine'],
      [t('compare_both'), s.both.length, 'shared'],
      [t('compare_onlyThem', C.friend), s.onlyThem.length, 'theirs'],
    ];
    const firstText = x => (x.first === 'me' ? t('compare_badgesFirst', t('compare_you'))
      : x.first === 'them' ? t('compare_badgesFirst', C.friend)
      : x.first === 'same' ? t('compare_badgesSameDay') : '');
    const otherText = (x, who) => (x.other ? t('compare_badgesOtherLevel', who, num(x.other.level ?? 1)) : t('compare_badgesOtherMissing', who));
    const onlySub = x => [maxed ? t('badges_level', num(x.level)) : '', dateText(x.date)].filter(Boolean).join(' · ');

    render($('cmp-badges-out'), [
      notes.length ? html`<p class="meta">${notes.join(' ')}</p>` : '',
      html`<div class="cmp-metrics">${segments.map(([label, count, tone]) => html`<div class="cmp-stat ${tone}"><span>${label}</span><strong>${num(count)}</strong><small>${kindLabel}</small></div>`)}</div>`,
      maxed && !C.data.own ? html`<p class="meta">${t('compare_badgesRule', C.friend)}</p>` : '',
      html`<div class="cmp-cols">${[
        column(`${t('compare_both')} (${t('compare_you')} / ${C.friend})`, s.both, x => html`<li>
          ${badgeCell(x.me, me, `${t('compare_you')} ${dateText(x.me.date)} · ${C.friend} ${dateText(x.them.date)}`)}<span>${firstText(x)}</span></li>`),
        column(t('compare_onlyMe'), s.onlyMe, x => html`<li>
          ${badgeCell(x, me, onlySub(x))}<span>${maxed ? otherText(x, C.friend) : ''}</span></li>`),
        column(t('compare_onlyThem', C.friend), s.onlyThem, x => html`<li>
          ${badgeCell(x, C.friend, onlySub(x))}<span>${maxed ? otherText(x, t('compare_you')) : ''}</span></li>`),
      ]}</div>`,
    ]);
  }

  function init() {
    $('cmp-badge-kind')?.addEventListener('click', e => {
      const b = e.target.closest('button[data-kind]');
      if (!b) return;
      C.kind = b.dataset.kind;
      renderBadges();
    });
    document.addEventListener('dfu:badges', () => renderBadges());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  root.DFU.compareBadges = { setFriend, render: renderBadges, state: C };
})(globalThis);
