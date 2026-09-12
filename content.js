// Kjører på /user/*/beers: leser siden og sender dataene til bakgrunnen.
// Kan også hente historikksider på oppdrag, med samme opphav som siden selv.
(() => {
  const data = DFU.parse.parseBeersPage(document, location.href);
  DFU.api.runtime.sendMessage({ type: 'dfu:page-data', data }).catch(() => {});

  DFU.api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'dfu:ping') { sendResponse({ ok: true, url: location.href }); return false; }
    if (msg?.type !== 'dfu:fetch-history') return false;
    fetch(msg.url, {
      credentials: 'include', cache: 'no-store',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    })
      .then(async res => {
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        sendResponse({
          ok: res.ok, status: res.status, bytes: html.length,
          beers: DFU.parse.parseBeersPage(doc, null).recent,
        });
      })
      .catch(err => sendResponse({ ok: false, error: `${err.name}: ${err.message}` }));
    return true;
  });
})();
