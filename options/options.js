(async function () {
  const { store, i18n } = DFU;
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

  $('reset').addEventListener('click', async () => {
    if (!confirm(t('settings_resetConfirm'))) return;
    await store.clearAll();
    $('username').value = '';
    $('stale').value = store.DEFAULT_SETTINGS.staleHours;
    $('language').value = store.DEFAULT_SETTINGS.language;
    $('reset-done').textContent = t('settings_resetDone');
  });
})();
