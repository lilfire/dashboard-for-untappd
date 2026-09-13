// Sammenligning med en venn: felles, bare du og bare vennen, for bryggerier, land eller stiler.
(function (root) {
  const { i18n, fetch: net, store } = root.DFU;
  const { html, render } = root.DFU.html;
  const { t } = i18n;
  const $ = id => document.getElementById(id);
  const num = n => i18n.number(n);
  const MAX_ITEMS = 300;

  const K = { me: null, them: null, themName: '', kind: 'breweries' };
  let friends = [];
  let friendsOwner = null;
  let friendsRequest = 0;
  const friendLabel = friend => `${friend.name} (@${friend.username})`;
  function friendsError(reason) {
    const keys = {
      friends_logged_out: 'compare_friendsLoggedOut',
      friends_challenge: 'compare_friendsChallenge',
      friends_pagination_stalled: 'compare_friendsStalled',
      friends_incomplete: 'compare_friendsIncomplete',
    };
    return keys[reason] ? t(keys[reason]) : t('compare_friendsDetails', reason || 'Unknown error');
  }

  async function loadFriends() {
    const owner = K.me?.pageOwner;
    if (!owner || owner === friendsOwner) return;
    friendsOwner = owner;
    const request = ++friendsRequest;
    friends = [];
    render($('cmp-friends'), []);
    $('cmp-friends-meta').textContent = t('compare_friendsLoading');
    try {
      const [cached, settings] = await Promise.all([store.loadFriends(owner), store.getSettings()]);
      if (request !== friendsRequest) return;
      friends = cached.friends;
      render($('cmp-friends'), friends.map(friend => html`<option value="${friendLabel(friend)}"></option>`));
      const expected = K.me?.stats?.friends;
      const fresh = cached.complete && cached.syncedAt != null &&
        Date.now() - cached.syncedAt < settings.staleHours * 3600000 &&
        (expected == null || expected === friends.length);
      if (fresh) {
        $('cmp-friends-meta').textContent = '';
        return;
      }
      const result = await net.fetchFriends(owner, { onProgress: count => {
        if (request === friendsRequest) $('cmp-friends-meta').textContent = t('compare_friendsProgress', num(count));
      } });
      if (request !== friendsRequest) return;
      friends = result.partial
        ? [...new Map([...friends, ...result.friends].map(friend => [friend.username.toLowerCase(), friend])).values()]
        : result.friends;
      render($('cmp-friends'), friends.map(friend => html`<option value="${friendLabel(friend)}"></option>`));
      if (!result.partial || !cached.complete) await store.saveFriends(owner, { friends, complete: !result.partial });
      if (request !== friendsRequest) return;
      $('cmp-friends-meta').textContent = result.partial ? t('compare_friendsPartial') : '';
      if (result.partial) {
        friendsOwner = null;
        if (result.error) $('cmp-friends-meta').textContent += ` ${friendsError(result.error)}`;
      }
    } catch (err) {
      if (request !== friendsRequest) return;
      friendsOwner = null; // Tillat et nytt forsøk ved neste fokus.
      $('cmp-friends-meta').textContent = friendsError(err.message);
    }
  }

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
      <ol>${items.slice(0, MAX_ITEMS).map(x => html`<li><span>${x.name}</span><span>${value(x)}</span></li>`)}${more}${items.length ? "" : html`<li class="meta">${t("compare_empty")}</li>`}</ol></section>`;
  }

  function renderCompare() {
    for (const b of document.querySelectorAll('#cmp-kind button')) b.setAttribute('aria-pressed', String(b.dataset.kind === K.kind));
    if (!K.me || !K.them) return;
    const s = split(K.me[K.kind], K.them[K.kind]);
    $('cmp-summary').textContent = t('compare_summary', num(s.both.length), num(s.onlyMe.length), num(s.onlyThem.length), K.themName);
    const total = s.both.length + s.onlyMe.length + s.onlyThem.length;
    const segments = [
      [t('compare_onlyMe'), s.onlyMe.length, 'mine'],
      [t('compare_both'), s.both.length, 'shared'],
      [t('compare_onlyThem', K.themName), s.onlyThem.length, 'theirs'],
    ];
    if ($('cmp-overlap')) render($('cmp-overlap'), html`
      <div class="cmp-metrics">${segments.map(([label, count, tone]) => html`<div class="cmp-stat ${tone}"><span>${label}</span><strong>${num(count)}</strong><small>${t('tab_' + K.kind)}</small></div>`)}</div>
      <section class="cmp-chart-card"><h3>${t('compare_overlap')}</h3>
        <p class="meta">${t('compare_overlapNote')}</p>
        <div class="cmp-overlap-track" aria-hidden="true">${segments.map(([, count, tone]) => html`<i class="${tone}" style="width:${total ? count / total * 100 : 0}%"></i>`)}</div>
        <div class="cmp-legend">${segments.map(([label, count, tone]) => html`<span><i class="${tone}"></i>${label}: <b>${num(count)}</b></span>`)}</div>
        ${total ? '' : html`<p class="meta">${t('compare_empty')}</p>`}
      </section>`);
    render($('cmp-cols'), [
      column(`${t('compare_both')} (${t('compare_you')} / ${K.themName})`, s.both, x => `${num(x.me)} / ${num(x.them)}`),
      column(t('compare_onlyMe'), s.onlyMe, x => num(x.count)),
      column(t('compare_onlyThem', K.themName), s.onlyThem, x => num(x.count)),
    ]);
    $('cmp-out').hidden = false;
  }

  async function run(e) {
    e.preventDefault();
    const input = $('cmp-user').value.trim();
    const matches = friends.filter(friend => friendLabel(friend).toLowerCase() === input.toLowerCase() ||
      friend.username.toLowerCase() === input.toLowerCase() || friend.name.toLowerCase() === input.toLowerCase());
    if (matches.length > 1) {
      $('cmp-meta').textContent = t('compare_chooseFriend');
      return;
    }
    const name = matches[0]?.username || input;
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
    $('cmp-user').addEventListener('focus', loadFriends);
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
    if (K.me?.stats?.friends !== data?.stats?.friends) friendsOwner = null;
    if (K.me?.pageOwner !== data?.pageOwner) {
      friendsRequest++;
      friendsOwner = null;
      friends = [];
      render($('cmp-friends'), []);
      $('cmp-friends-meta').textContent = '';
    }
    K.me = data;
    if (document.activeElement === $('cmp-user')) loadFriends();
    renderCompare();
  }

  root.DFU = root.DFU || {};
  root.DFU.compare = { init, setMe, split };
})(globalThis);
