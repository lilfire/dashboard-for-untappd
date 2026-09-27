(async function () {
  const { api, store, i18n, update } = DFU;
  const { t } = i18n;
  const $ = id => document.getElementById(id);

  const settings = await store.getSettings();
  i18n.setLanguage(settings.language);
  i18n.apply();

  $('username').value = settings.username;
  $('stale').value = settings.staleHours;
  $('language').value = settings.language;

  $('form').addEventListener('submit', async e => {
    e.preventDefault();
    const hours = Math.min(168, Math.max(1, Math.round(Number($('stale').value) || store.DEFAULT_SETTINGS.staleHours)));
    const saved = await store.setSettings({
      username: $('username').value.trim(),
      staleHours: hours,
      language: $('language').value,
    });
    $('stale').value = saved.staleHours;
    i18n.setLanguage(saved.language);
    i18n.apply();
    $('saved').textContent = t('settings_saved');
  });

  const current = api.runtime.getManifest().version;
  // getBrowserInfo finnes bare i Firefox.
  const isFirefox = typeof api.runtime.getBrowserInfo === 'function';
  $('version').textContent = t('settings_version', current);

  $('check-update').addEventListener('click', async () => {
    const btn = $('check-update');
    btn.disabled = true;
    $('update-download').hidden = true;
    $('update-status').textContent = t('settings_checking');
    const r = await update.checkLatest(current, isFirefox);
    btn.disabled = false;
    if (r.status === 'error') {
      $('update-status').textContent = t('settings_updateError');
    } else if (r.status === 'current') {
      $('update-status').textContent = t('settings_upToDate');
    } else {
      $('update-status').textContent = t('settings_updateAvailable', r.latest);
      // Firefox blokkerer .xpi åpnet direkte fra utvidelsen; klikket må skje på GitHub-siden.
      $('download').href = isFirefox ? (r.pageUrl ?? r.url) : r.url;
      $('download').textContent = t(isFirefox ? 'settings_openRelease' : 'settings_download', r.latest);
      $('update-hint').textContent = t(isFirefox ? 'settings_updateHintFirefox' : 'settings_updateHintChrome');
      $('update-download').hidden = false;
    }
  });

  $('reset').addEventListener('click', async () => {
    if (!confirm(t('settings_resetConfirm'))) return;
    await store.clearAll();
    $('username').value = '';
    $('stale').value = store.DEFAULT_SETTINGS.staleHours;
    $('language').value = store.DEFAULT_SETTINGS.language;
    $('reset-done').textContent = t('settings_resetDone');
  });
})();
