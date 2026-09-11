// Firefox laster lib/api.js via manifestet; Chromes service worker må importere selv.
if (typeof importScripts === 'function' && typeof DFU === 'undefined') importScripts('lib/api.js');

const api = DFU.api;
const START_PAGE = 'dev/diagnose.html';
const TAB_TIMEOUT_MS = 30000;

// Faner åpnet av «fetch via tab», nøkkel = tab-ID.
const pending = new Map();

api.action.onClicked.addListener(() => {
  api.tabs.create({ url: api.runtime.getURL(START_PAGE) });
});

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'dfu:fetch-via-tab') {
    fetchViaTab(msg.url).then(sendResponse, err => sendResponse({ ok: false, reason: 'error', error: String(err) }));
    return true;
  }
  if (msg?.type === 'dfu:page-data' && sender.tab) {
    handlePageData(msg.data, sender.tab.id);
  }
  return false;
});

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
    api.storage.local.set({ lastCapture: { at: Date.now(), via: 'visit', data } });
  }
}
