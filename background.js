// Firefox laster lib/*.js via manifestet; Chromes service worker må importere selv.
if (typeof importScripts === 'function' && typeof DFU === 'undefined') importScripts('lib/api.js', 'lib/store.js');

const { api, store } = DFU;
const DASHBOARD = 'dashboard/index.html';
const TAB_TIMEOUT_MS = 30000;

// Faner åpnet av «hent via fane», nøkkel = tab-ID.
const pending = new Map();

const openDashboard = () => api.tabs.create({ url: api.runtime.getURL(DASHBOARD) });

api.action.onClicked.addListener(openDashboard);

api.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') openDashboard();
});

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'dfu:fetch-via-tab') {
    fetchViaTab(msg.url).then(sendResponse, err => sendResponse({ ok: false, reason: 'error', error: String(err) }));
    return true;
  }
  if (msg?.type === 'dfu:history-open') {
    openHistoryTab(msg.url).then(sendResponse, err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg?.type === 'dfu:history-page') {
    api.tabs.sendMessage(msg.tabId, { type: 'dfu:fetch-history', url: msg.url })
      .then(sendResponse, err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg?.type === 'dfu:history-close') {
    api.tabs.remove(msg.tabId).catch(() => {});
    return false;
  }
  if (msg?.type === 'dfu:page-data' && sender.tab) {
    handlePageData(msg.data, sender.tab.id);
  }
  return false;
});

// Åpner ølsiden i en bakgrunnsfane og venter til innholdsskriptet svarer.
// Derfra hentes historikksidene med samme opphav som siden selv.
async function openHistoryTab(url) {
  const tab = await api.tabs.create({ url, active: false });
  const deadline = Date.now() + TAB_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 400));
    try {
      const pong = await api.tabs.sendMessage(tab.id, { type: 'dfu:ping' });
      if (pong?.ok) return { ok: true, tabId: tab.id };
    } catch { /* siden laster fortsatt */ }
  }
  api.tabs.remove(tab.id).catch(() => {});
  return { ok: false, reason: 'timeout' };
}

async function fetchViaTab(url) {
  const tab = await api.tabs.create({ url, active: false });
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      pending.delete(tab.id);
      api.tabs.update(tab.id, { active: true }).catch(() => {});
      resolve({ ok: false, reason: 'timeout', via: 'tab' });
    }, TAB_TIMEOUT_MS);
    pending.set(tab.id, { resolve, timer });
  });
}

function handlePageData(data, tabId) {
  const job = pending.get(tabId);
  if (job) {
    clearTimeout(job.timer);
    pending.delete(tabId);
    if (data.hasData) {
      api.tabs.remove(tabId).catch(() => {});
      job.resolve({ ok: true, via: 'tab', data });
    } else {
      // Innlogging eller sjekk: vis fanen så brukeren kan ordne det selv.
      api.tabs.update(tabId, { active: true }).catch(() => {});
      const reason = data.challenge ? 'challenge' : data.loggedIn ? 'no-data' : 'logged-out';
      job.resolve({ ok: false, reason, via: 'tab', data });
    }
    return;
  }

  // Brukeren besøkte selv ølsiden: lagre, men bare for egen side.
  const own = data.loggedInUser && data.pageOwner &&
    data.loggedInUser.toLowerCase() === data.pageOwner.toLowerCase();
  if (data.hasData && own) {
    store.save(data.pageOwner, { at: Date.now(), via: 'visit', data }).catch(() => {});
  }
}
