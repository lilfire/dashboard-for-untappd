// Fremdrift og anslått gjenværende tid for hentinger som går side for side.
(function (root) {
  const MINUTE = 60000;

  // Tempoet måles fra første kall, så oppstarten ikke teller. Før to sider er målt,
  // brukes fallbackMs per side, slik at et anslag vises med en gang.
  function createEta({ now = Date.now, fallbackMs = 2000 } = {}) {
    let t0 = null;
    let done0 = 0;
    return {
      update(done, total) {
        const at = now();
        if (t0 == null) { t0 = at; done0 = done; }
        if (!total) return { fraction: null, remainingMs: null };
        const fraction = Math.min(1, Math.max(0, done / total));
        const measured = done - done0;
        const perPage = measured >= 2 ? (at - t0) / measured : fallbackMs;
        return { fraction, remainingMs: Math.max(0, total - done) * perPage };
      },
    };
  }

  // «under 1 min igjen», «ca. 3 min igjen», «ca. 1 t 10 min igjen». Runder opp til hele minutter.
  function formatEta(ms, t) {
    if (ms == null) return '';
    if (ms < MINUTE) return t('eta_under1');
    const minutes = Math.ceil(ms / MINUTE);
    if (minutes < 60) return t('eta_minutes', minutes);
    return t('eta_hours', Math.floor(minutes / 60), minutes % 60);
  }

  // Fyller en oppgaverad: .task-label, .task-detail, .task-eta og .progress med <i>.
  function showTask(el, { label, detail = '', fraction = null, eta = '' }) {
    if (!el) return;
    const set = (sel, text) => { const node = el.querySelector(sel); if (node) node.textContent = text; };
    set('.task-label', label);
    set('.task-detail', detail);
    set('.task-eta', eta);
    const bar = el.querySelector('.progress');
    if (bar) {
      const known = fraction != null;
      bar.classList.toggle('indeterminate', !known);
      if (known) bar.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
      else bar.removeAttribute('aria-valuenow');
      bar.firstElementChild.style.width = known ? `${fraction * 100}%` : '';
    }
    el.hidden = false;
  }

  const hideTask = el => { if (el) el.hidden = true; };

  const api = { createEta, formatEta, showTask, hideTask };
  root.DFU = root.DFU || {};
  root.DFU.progress = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
