// Sammenligning med en venn: felles, bare du og bare vennen, for bryggerier, land eller stiler.
(function (root) {
  const { i18n, fetch: net } = root.DFU;
  const { html, render } = root.DFU.html;
  const { t } = i18n;
  const $ = id => document.getElementById(id);
  const num = n => i18n.number(n);
  const MAX_ITEMS = 300;

  const K = { me: null, them: null, themName: '', kind: 'breweries' };

  function split(mine, theirs) {
    const mineById = new Map(mine.map(x => [x.id, x]));
    const theirsById = new Map(theirs.map(x => [x.id, x]));
    const both = [];
    const onlyMe = [];
    for (const x of mine) {
      const y = theirsById.get(x.id);
      if (y) both.push({ ...x, me: x.count, them: y.count });
      else onlyMe.push(x);
    }
    const onlyThem = theirs.filter(y => !mineById.has(y.id));
    const byCount = (a, b) => b.count - a.count;
    both.sort((a, b) => (b.me + b.them) - (a.me + a.them));
    return { both, onlyMe: onlyMe.sort(byCount), onlyThem: onlyThem.sort(byCount) };
  }

  function column(title, items, value) {
    const more = items.length > MAX_ITEMS ? html`<li><span>… +${num(items.length - MAX_ITEMS)}</span><span></span></li>` : '';
    return html`<section class="cmp-col"><h3>${title} <span>${num(items.length)}</span></h3>
      <ol>${items.slice(0, MAX_ITEMS).map(x => html`<li><span>${x.name}</span><span>${value(x)}</span></li>`)}${more}</ol></section>`;
  }

  function renderCompare() {
    for (const b of document.querySelectorAll('#cmp-kind button')) b.setAttribute('aria-pressed', String(b.dataset.kind === K.kind));
    if (!K.me || !K.them) return;
    const s = split(K.me[K.kind], K.them[K.kind]);
    $('cmp-summary').textContent = t('compare_summary', num(s.both.length), num(s.onlyMe.length), num(s.onlyThem.length), K.themName);
    render($('cmp-cols'), [
      column(`${t('compare_both')} (${t('compare_you')} / ${K.themName})`, s.both, x => `${num(x.me)} / ${num(x.them)}`),
      column(t('compare_onlyMe'), s.onlyMe, x => num(x.count)),
      column(t('compare_onlyThem', K.themName), s.onlyThem, x => num(x.count)),
    ]);
    $('cmp-out').hidden = false;
  }

  async function run(e) {
    e.preventDefault();
    const name = $('cmp-user').value.trim();
    if (!name) return;
    const btn = $('cmp-form').querySelector('button');
    btn.disabled = true;
    $('cmp-meta').textContent = t('compare_loading', name);
    try {
      const r = await net.fetchDirect(name);
      if (!r.data.hasData) {
        $('cmp-meta').textContent = t('compare_notFound', name);
        return;
      }
      K.them = r.data;
      K.themName = r.data.pageOwner || name;
      $('cmp-meta').textContent = t('compare_hint');
      renderCompare();
      root.DFU.yearsView?.setFriend(K.themName);
    } catch (err) {
      $('cmp-meta').textContent = t('err_network', err.message);
    } finally {
      btn.disabled = false;
    }
  }

  function init() {
    $('cmp-form').addEventListener('submit', run);
    $('cmp-kind').addEventListener('click', e => {
      const b = e.target.closest('button[data-kind]');
      if (!b) return;
      K.kind = b.dataset.kind;
      renderCompare();
    });
    renderCompare();
  }

  function setMe(data) {
    K.me = data;
    renderCompare();
  }

  root.DFU = root.DFU || {};
  root.DFU.compare = { init, setMe, split };
})(globalThis);
