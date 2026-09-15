// Kjører på /user/*/beers: leser siden og sender dataene til bakgrunnen.
// Kan også hente historikksider på oppdrag, med samme opphav som siden selv.
(() => {
  const data = DFU.parse.parseBeersPage(document, location.href);
  DFU.api.runtime.sendMessage({ type: 'dfu:page-data', data }).catch(() => {});

  DFU.api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'dfu:ping') { sendResponse({ ok: true, url: location.href }); return false; }
    if (msg?.type !== 'dfu:fetch-history') return false;
    // «more_beer», «more_feed» og «more_badges» krever headeren «Show More» sender. Vanlige sider skal hentes uten.
    fetch(msg.url, {
      credentials: 'include', cache: 'no-store',
      headers: /\/more_(beer|feed|badges)\//.test(msg.url) ? { 'X-Requested-With': 'XMLHttpRequest' } : undefined,
    })
      .then(async res => {
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const base = { ok: res.ok, status: res.status, bytes: html.length };
        if (msg.kind === 'checkins') sendResponse({ ...base, checkins: DFU.parse.parseCheckinFeed(doc) });
        else if (msg.kind === 'badges') sendResponse({ ...base, badges: DFU.parse.parseBadges(doc), counts: DFU.parse.parseBadgeCounts(doc), own: DFU.parse.parseBadgeListOwn(doc) });
        else sendResponse({ ...base, beers: DFU.parse.parseBeersPage(doc, null).recent });
      })
      .catch(err => sendResponse({ ok: false, error: `${err.name}: ${err.message}` }));
    return true;
  });
})();
