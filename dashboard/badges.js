// Fanen «Merker»: et troféskap med merker på maks nivå og spesialmerker. Mellomnivåer og antall vises ikke.
// Merkene hentes automatisk når merketallet på profilen har endret seg, eller når det er lenge siden sist.
(function (root) {
  const { i18n, store, history, badges: badgesLib } = root.DFU;
  const { html, render } = root.DFU.html;
  const { t } = i18n;
  const $ = id => document.getElementById(id);
  const num = n => i18n.number(n);
  const WEEK_MS = 7 * 24 * 3600 * 1000;

  const B = {
    user: null,
    count: null,
    data: { badges: [], count: null, syncedAt: null, complete: false },
    syncing: false,
    loading: true,
    controller: null,
    stoppedByUser: false,
  };

  // Merketallet på profilen øker også når et merke går opp et nivå. Ukesgrensen er en reserve i tilfelle det ikke gjør det.
  const needsSync = () => !B.data.syncedAt || !B.data.complete ||
    (B.count != null && B.data.count !== B.count) || Date.now() - B.data.syncedAt > WEEK_MS;

  const dateText = d => (d ? i18n.date(`${d}T12:00:00`) : '');
  // Er listen hentet fra en annen brukers side (brukernavn i innstillingene), vises ikke neste nivå.
  const showOpts = () => ({ nextKnown: B.data.own !== false });

  // Brukes også av årsfanen og sammenligningen.
  function tile(b, { maxed = false, user = B.user } = {}) {
    const sub = [maxed ? t('badges_level', num(b.level)) : '', dateText(b.date)].filter(Boolean).join(' · ');
    return html`<a class="badge-tile${maxed ? ' maxed' : ''}" href="https://untappd.com/user/${encodeURIComponent(user ?? '')}/badges/${b.id}" target="_blank" rel="noopener">
      ${b.image ? html`<img src="${b.image}" alt="" width="72" height="72" loading="lazy" referrerpolicy="no-referrer">` : html`<span class="ph" aria-hidden="true"></span>`}
      <span class="name">${b.base || b.name}</span>
      <span class="sub">${sub}</span>
      ${b.retired ? html`<span class="tag-retired" title="${t('badges_retiredTitle')}">${t('badges_retired')}</span>` : ''}
    </a>`;
  }

  function renderSync() {
    $('bd-sync-stop').hidden = !B.syncing;
    $('bd-progress').hidden = !B.syncing;
    if (B.syncing) return;
    $('bd-sync-text').textContent = B.loading || !B.user ? ''
      : B.stoppedByUser ? t('badges_aborted')
      : !B.data.syncedAt ? t('badges_pending', num(history.badgePagesFor(B.count, Math.round((B.count ?? 0) / 10))))
      : '';
  }

  function renderList() {
    if (B.loading) return;
    const { maxed, special } = badgesLib.showcase(B.data.badges, showOpts());
    if (!B.data.syncedAt && !B.data.badges.length) { render($('bd-out'), ''); return; }
    render($('bd-out'), [
      html`<section class="badge-section" aria-labelledby="bd-maxed">
        <h2 id="bd-maxed">${t('badges_maxed')} <span class="badge-count">${num(maxed.length)}</span></h2>
        <p class="meta">${t('badges_maxedHint')}</p>
        ${maxed.length ? html`<div class="badge-grid">${maxed.map(b => tile(b, { maxed: true }))}</div>` : html`<p class="meta">${t('badges_noneMaxed')}</p>`}
      </section>`,
      html`<section class="badge-section" aria-labelledby="bd-special">
        <h2 id="bd-special">${t('badges_special')} <span class="badge-count">${num(special.length)}</span></h2>
        <p class="meta">${t('badges_specialHint')}</p>
        ${special.length ? badgesLib.groupByYear(special).map(g => html`<h3 class="badge-year">${g.year ?? t('badges_undated')}</h3>
          <div class="badge-grid">${g.badges.map(b => tile(b))}</div>`) : html`<p class="meta">${t('badges_noneSpecial')}</p>`}
      </section>`,
    ]);
  }

  function renderAll() {
    renderSync();
    renderList();
  }

  let currentSync = null;
  function run() {
    if (currentSync) return currentSync;
    currentSync = sync().finally(() => { currentSync = null; });
    return currentSync;
  }

  async function sync() {
    if (B.loading || B.syncing || !B.user) return;
    const user = B.user;
    const full = !B.data.complete;
    B.syncing = true;
    B.controller = new AbortController();
    renderSync();
    const eta = root.DFU.progress.createEta({ fallbackMs: history.DELAY_MS + 400 });
    let total = full ? history.badgePagesFor(B.count, Math.round((B.count ?? 0) / 10)) : null;
    try {
      const res = await history.syncBadges(user, {
        known: B.data.badges,
        full,
        signal: B.controller.signal,
        // Mellomlagring beholder forrige merketall, så en avbrutt henting prøves igjen.
        onCheckpoint: async ({ badges, own }) => {
          B.data = await store.saveBadges(user, { badges, count: B.data.count, own: own ?? B.data.own, complete: false, syncedAt: B.data.syncedAt });
        },
        onProgress: p => {
          if (full && p.counts.all != null) total = history.badgePagesFor(p.counts.all, p.counts.special);
          const { fraction, remainingMs } = eta.update(p.pages, total);
          const left = root.DFU.progress.formatEta(remainingMs, t);
          $('bd-sync-text').textContent = [t('badges_syncing', t(`badges_segment_${p.segment}`), num(p.pages)), left].filter(Boolean).join(' · ');
          $('bd-progress').firstElementChild.style.width = `${Math.round((fraction ?? 0) * 100)}%`;
        },
      });
      B.stoppedByUser = res.stopped === 'aborted';
      B.data = await store.saveBadges(user, {
        badges: res.badges,
        count: res.complete ? B.count : B.data.count,
        own: res.own ?? B.data.own,
        complete: res.complete,
        syncedAt: res.complete ? Date.now() : B.data.syncedAt,
      });
      B.syncing = false;
      renderAll();
      document.dispatchEvent(new CustomEvent('dfu:badges'));
    } catch (err) {
      B.syncing = false;
      renderAll();
      $('bd-sync-text').textContent = t('years_error', err.message);
    }
  }

  function maybeAutoSync() {
    if (B.loading || B.syncing || B.stoppedByUser || !B.user || !needsSync()) return;
    void run();
  }

  async function setUser(user, count, { autoSync = true } = {}) {
    if (!user) return;
    if (currentSync) await currentSync;
    const same = B.user && B.user.toLowerCase() === user.toLowerCase();
    B.loading = true;
    B.user = user;
    B.count = count ?? (same ? B.count : null);
    B.data = await store.loadBadges(user);
    B.loading = false;
    renderAll();
    document.dispatchEvent(new CustomEvent('dfu:badges'));
    if (autoSync) maybeAutoSync();
  }

  // Kalles av dashbordet etter Oppdater, med merketallet fra profilen.
  async function refresh(user, count) {
    await setUser(user, count, { autoSync: false });
    B.stoppedByUser = false;
    if (needsSync()) await run();
    else renderSync();
  }

  async function bootstrap() {
    const settings = await store.getSettings();
    const user = settings.username || (await store.lastUser());
    if (!user) return;
    const state = await store.load(user);
    await setUser(user, state.snapshots.at(-1)?.data?.stats?.badges ?? null);
  }

  function init() {
    $('bd-sync-stop').addEventListener('click', () => B.controller?.abort());
    renderSync();
    void bootstrap();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  root.DFU.badgesView = { setUser, refresh, tile, badges: () => B.data.badges, showOpts, state: B };
})(globalThis);
