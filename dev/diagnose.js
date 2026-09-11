const { api, fetch: net } = DFU;
const ORIGINS = { origins: ['https://untappd.com/*'] };
const $ = id => document.getElementById(id);

const result = {
  extension: api.runtime.getManifest().version,
  browser: navigator.userAgent,
  time: new Date().toISOString(),
  steps: {},
};

function verdict(id, state, message) {
  const el = $(id);
  el.dataset.state = state;
  el.textContent = message;
}

function output(id, value) {
  $(id).textContent = value == null ? '' : JSON.stringify(value, null, 2);
}

function record(step, value) {
  result.steps[step] = value;
  $('result').value = JSON.stringify(result, null, 2);
}

// Kort sammendrag av tolkede data, uten hele listene.
function summarize(data) {
  if (!data) return null;
  const sum = list => list.reduce((s, x) => s + (x.count ?? 0), 0);
  const top = list => [...list].sort((a, b) => b.count - a.count).slice(0, 3).map(x => `${x.name} (${x.count})`);
  return {
    loggedIn: data.loggedIn,
    loggedInUser: data.loggedInUser,
    pageOwner: data.pageOwner,
    challenge: data.challenge,
    hasData: data.hasData,
    stats: data.stats,
    breweries: data.breweries.length,
    breweriesSum: sum(data.breweries),
    styles: data.styles.length,
    countries: data.countries.length,
    recent: data.recent.length,
    topBreweries: top(data.breweries),
    topCountries: top(data.countries),
    newestBeer: data.recent[0] ?? null,
  };
}

function judge(id, summary) {
  if (!summary) return verdict(id, 'bad', 'Ingen data.');
  if (summary.challenge) return verdict(id, 'bad', 'Stoppet av Cloudflare-sjekk.');
  if (!summary.loggedIn) return verdict(id, 'bad', 'Ikke innlogget på Untappd i denne nettleseren.');
  if (!summary.hasData) return verdict(id, 'bad', 'Siden manglet bryggerilisten.');
  const sumOk = summary.stats.unique == null || summary.breweriesSum === summary.stats.unique;
  verdict(id, sumOk ? 'ok' : 'warn',
    `OK: ${summary.breweries} bryggerier, ${summary.styles} stiler, ${summary.countries} land. ` +
    (sumOk ? `Summen stemmer med ${summary.breweriesSum} unike øl.` : `Summen ${summary.breweriesSum} avviker fra ${summary.stats.unique} unike øl.`));
}

async function guarded(button, fn) {
  button.disabled = true;
  try { await fn(); } finally { button.disabled = false; }
}

async function checkPermission() {
  const granted = await api.permissions.contains(ORIGINS);
  verdict('perm-verdict', granted ? 'ok' : 'warn', granted ? 'Tilgang gitt.' : 'Mangler tilgang. Trykk «Gi tilgang».');
  $('perm-request').hidden = granted;
  record('permission', { granted });
  return granted;
}

$('perm-request').addEventListener('click', async () => {
  // Må kalles direkte i klikket, ellers avviser Firefox forespørselen.
  const granted = await api.permissions.request(ORIGINS).catch(() => false);
  record('permissionRequest', { granted });
  await checkPermission();
});

$('user-run').addEventListener('click', e => guarded(e.target, async () => {
  verdict('user-verdict', 'warn', 'Henter …');
  try {
    const r = await net.detectUser();
    output('user-out', r);
    record('user', r);
    if (r.user) {
      $('username').value = r.user;
      verdict('user-verdict', 'ok', `Innlogget som ${r.user}.`);
    } else {
      verdict('user-verdict', 'bad', r.challenge ? 'Stoppet av Cloudflare-sjekk.' :
        r.loggedIn ? 'Innlogget, men fant ikke brukernavnet. Skriv det inn manuelt.' : 'Ikke innlogget på Untappd i denne nettleseren.');
    }
  } catch (err) {
    verdict('user-verdict', 'bad', `Feil: ${err.message}`);
    record('user', { error: String(err) });
  }
}));

function requireUsername(verdictId) {
  const u = $('username').value.trim();
  if (!u) verdict(verdictId, 'bad', 'Kjør steg 2 først, eller skriv inn brukernavn.');
  return u;
}

$('direct-run').addEventListener('click', e => guarded(e.target, async () => {
  const u = requireUsername('direct-verdict');
  if (!u) return;
  verdict('direct-verdict', 'warn', 'Henter …');
  try {
    const r = await net.fetchDirect(u);
    const summary = summarize(r.data);
    const view = { status: r.status, finalUrl: r.finalUrl, redirected: r.redirected, bytes: r.bytes, cfMitigated: r.cfMitigated, ...summary };
    output('direct-out', view);
    record('direct', view);
    judge('direct-verdict', summary);
  } catch (err) {
    verdict('direct-verdict', 'bad', `Feil: ${err.message}`);
    record('direct', { error: String(err) });
  }
}));

$('tab-run').addEventListener('click', e => guarded(e.target, async () => {
  const u = requireUsername('tab-verdict');
  if (!u) return;
  verdict('tab-verdict', 'warn', 'Åpner fane …');
  const started = performance.now();
  try {
    const r = await net.fetchViaTab(u);
    const view = { ok: r.ok, reason: r.reason ?? null, ms: Math.round(performance.now() - started), ...summarize(r.data) };
    output('tab-out', view);
    record('tab', view);
    if (r.ok) judge('tab-verdict', summarize(r.data));
    else verdict('tab-verdict', 'bad', {
      timeout: 'Fikk ikke svar innen 30 sekunder. Fanen er vist.',
      challenge: 'Stoppet av Cloudflare-sjekk. Fanen er vist.',
      'logged-out': 'Ikke innlogget. Logg inn i fanen og prøv igjen.',
      'no-data': 'Siden manglet bryggerilisten. Fanen er vist.',
    }[r.reason] ?? `Feil: ${r.error ?? r.reason}`);
  } catch (err) {
    verdict('tab-verdict', 'bad', `Feil: ${err.message}`);
    record('tab', { error: String(err) });
  }
}));

$('visit-run').addEventListener('click', e => guarded(e.target, async () => {
  const { lastCapture } = await api.storage.local.get('lastCapture');
  if (!lastCapture) {
    verdict('visit-verdict', 'warn', 'Ingenting lagret ennå. Åpne ølsiden din på Untappd og prøv igjen.');
    record('visit', { captured: false });
    return;
  }
  const view = { at: new Date(lastCapture.at).toISOString(), via: lastCapture.via, ...summarize(lastCapture.data) };
  output('visit-out', view);
  record('visit', view);
  judge('visit-verdict', summarize(lastCapture.data));
}));

$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('result').value);
    verdict('copy-verdict', 'ok', 'Kopiert.');
  } catch {
    $('result').select();
    verdict('copy-verdict', 'warn', 'Merket teksten. Trykk Ctrl+C.');
  }
});

record('start', { ok: true });
checkPermission();
