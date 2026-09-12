// Ett-klikks feilrapport i årsfanen: tester hentingen og kopierer et sammendrag,
// slik at brukeren kan lime det inn ved feilsøking. Sender ingenting selv.
(function (root) {
  const { api, i18n, store, parse } = root.DFU;
  const { t } = i18n;
  const $ = id => document.getElementById(id);

  // Untappd krever headeren «Show More» sender, men den kan utløse en CORS-preflight.
  // Vi tester derfor begge varianter, så rapporten viser hvilken som slipper gjennom.
  async function testFetch(user, xhrHeader) {
    const url = `https://untappd.com/profile/more_beer/${encodeURIComponent(user || 'x')}/25?sort=date`;
    try {
      const res = await fetch(url, {
        credentials: 'include', cache: 'no-store',
        headers: xhrHeader ? { 'X-Requested-With': 'XMLHttpRequest' } : undefined,
      });
      const text = await res.text();
      const doc = new DOMParser().parseFromString(text, 'text/html');
      const beers = parse.parseBeersPage(doc, null).recent;
      return {
        status: res.status, finalUrl: res.url, redirected: res.redirected, bytes: text.length,
        cfMitigated: res.headers.get('cf-mitigated'),
        beers: beers.length, withDate: beers.filter(b => b.first).length, withRating: beers.filter(b => b.ratingYou != null).length,
        bodyStart: beers.length ? null : text.slice(0, 200),
      };
    } catch (err) {
      return { error: `${err.name}: ${err.message}`, url };
    }
  }

  // Tester reserven: hentingen kjørt inne i en Untappd-fane, med samme opphav som siden selv.
  async function testViaTab(user) {
    const name = encodeURIComponent(user || 'x');
    try {
      const open = await api.runtime.sendMessage({ type: 'dfu:history-open', url: `https://untappd.com/user/${name}/beers` });
      if (!open?.ok) return { ok: false, open };
      const page = await api.runtime.sendMessage({
        type: 'dfu:history-page', tabId: open.tabId,
        url: `https://untappd.com/profile/more_beer/${name}/25?sort=date`,
      });
      api.runtime.sendMessage({ type: 'dfu:history-close', tabId: open.tabId }).catch(() => {});
      return { ok: !!page?.ok, status: page?.status ?? null, bytes: page?.bytes ?? null, beers: page?.beers?.length ?? 0, error: page?.error ?? null };
    } catch (err) {
      return { error: `${err.name}: ${err.message}` };
    }
  }

  async function buildReport() {
    const s = root.DFU.yearsView?.state ?? {};
    const settings = await store.getSettings().catch(e => ({ error: String(e) }));
    const lastUser = await store.lastUser().catch(() => null);
    let storageOk = null;
    try {
      await api.storage.local.set({ __selftest: Date.now() });
      storageOk = Object.keys(await api.storage.local.get('__selftest')).length === 1;
      await api.storage.local.remove('__selftest');
    } catch (err) { storageOk = `feil: ${err.message}`; }
    return {
      version: api.runtime.getManifest().version,
      browser: navigator.userAgent,
      time: new Date().toISOString(),
      permission: await api.permissions.contains({ origins: ['https://untappd.com/*'] }).catch(e => String(e)),
      storageOk,
      settingsUsername: settings.username ?? null,
      lastUser,
      yearsTab: {
        user: s.user ?? null,
        expected: s.expected ?? null,
        syncing: !!s.syncing,
        historyCount: s.history?.count ?? 0,
        historyComplete: s.history?.complete ?? null,
        historySyncedAt: s.history?.syncedAt ? new Date(s.history.syncedAt).toISOString() : null,
        statusText: $('y-sync-text')?.textContent ?? null,
        buttonDisabled: $('y-sync-btn')?.disabled ?? null,
      },
      historyFetchWithHeader: await testFetch(s.user || settings.username || lastUser, true),
      historyFetchNoHeader: await testFetch(s.user || settings.username || lastUser, false),
      historyViaTab: await testViaTab(s.user || settings.username || lastUser),
    };
  }

  function mount() {
    const row = $('y-sync-btn')?.parentElement;
    if (!row) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
    btn.id = 'y-report';
    btn.textContent = t('report_btn');
    row.append(btn);

    const out = document.createElement('pre');
    out.id = 'y-report-out';
    out.hidden = true;
    row.closest('.sync')?.append(out);

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = t('report_running');
      try {
        const report = JSON.stringify(await buildReport(), null, 2);
        out.hidden = false;
        out.textContent = report;
        try {
          await navigator.clipboard.writeText(report);
          btn.textContent = t('report_copied');
        } catch {
          btn.textContent = t('report_btn');
        }
      } finally {
        btn.disabled = false;
        setTimeout(() => { btn.textContent = t('report_btn'); }, 4000);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})(globalThis);
