import { locale, number, uiLabel } from '../i18n.js';
import { plural, t as translateUI } from '../i18n.js';
import { gameTerm, speciesLabel } from '../game-locale.js';
// Home + in-app official news / changelog / event reader (docs/design/03).
import { h, mount, icon, get, post, badge, notice, relTime, fmtDate, extLink, setting, saveSettings, state, on, cap, typeChips, toast, spriteOrFallback, sizedSprite, fitSprite, seg, pad3, sourceInfo, sourceText } from '../core.js';
import { go, qaInfo, openPopout } from '../shell.js';
import { createRun } from './guides.js';
import { LANGS } from '../i18n.js';
import { animatedIn, scaled } from '../sprites.js';
import { loadList } from './pokedex.js';
import { currentCard, startTimers, likelyActive } from './live.js';
import { homePhenomena } from './phenomena.js';

let unsub = [];
let newsCache = null;
const KIND_LABEL = { changelog: 'ui.news_kind_changelog', hotfix: 'ui.news_kind_hotfix', announcement: 'ui.news_kind_announcement', event: 'ui.news_kind_event' };
const kindLabel = (kind) => KIND_LABEL[kind] ? translateUI(KIND_LABEL[kind]) : (kind || translateUI('ui.news_kind_post'));

export function dispose() { unsub.forEach((u) => u()); unsub = []; }

export async function render(el, route) {
  dispose();
  if (route.page === 'news' && route.parts[0]) return renderArticle(el, route.parts[0]);
  if (route.page === 'news') return renderNewsList(el, route);
  if (route.page === 'events' && route.parts[0]) return renderEvent(el, route.parts[0]);
  if (route.page === 'events') return renderNewsList(el, route, 'events');
  return renderHome(el);
}

async function news() { newsCache = await get('/api/news'); return newsCache; }

function provenanceLine(item) {
  return h('div', { class: 'row wrap small muted' }, sourceInfo(item.provenance),
    item.channel === 'pts' ? h('span', { class: 'badge bad' }, 'PTS — test server, not live') : null,
    h('span', null, translateUI('ui.news_published', { date: fmtDate(item.published) })), item.updated ? h('span', null, translateUI('ui.news_updated', { date: fmtDate(item.updated) })) : null);
}

// Home sections. Default: roamers, live, update, news, events, quick. The storyline run and favourites cards are
// opt-in (Settings › Appearance › Home sections). Lists saved by earlier builds are translated, never discarded:
// update → update + news, live → live + roamers, shortcuts → quick + run (Altering Cave is no longer on Home).
export const HOME_SECTIONS = [['roamers', 'Roaming Legendaries'], ['live', 'Alpha & Swarm'], ['update', 'Latest official update'], ['news', 'More official updates'],
  ['events', 'Official events'], ['quick', 'Quick access'], ['run', 'Storyline run'], ['favourites', 'Favourite Pokémon']];
export const HOME_DEFAULT = ['roamers', 'live', 'update', 'news', 'events', 'quick'];
export function homeSections(saved = setting('home.sections')) {
  if (!Array.isArray(saved)) return [...HOME_DEFAULT];
  const known = new Set(HOME_SECTIONS.map(([k]) => k));
  const legacy = saved.length > 0 && saved.every((k) => ['update', 'events', 'live', 'shortcuts'].includes(k)) &&
    (saved.includes('shortcuts') || !saved.some((k) => ['roamers', 'news', 'quick'].includes(k)));
  if (!legacy) return saved.filter((k) => known.has(k));
  const out = [];
  for (const k of saved) out.push(...({ update: ['update', 'news'], live: ['live', 'roamers'], shortcuts: ['quick', 'run'], events: ['events'] })[k] || []);
  return [...new Set(out)];
}

async function renderHome(el) {
  dispose();
  const page = h('div', { class: 'page home-page' });
  mount(el, page);
  const sections = homeSections();
  const on_ = (k) => sections.includes(k);
  const [n, cur, leg, runs, data, species] = await Promise.all([news(), get('/api/live/current'), get('/api/live/legendaries'),
    get('/api/guides/runs'), get('/api/data/status'), on_('favourites') ? loadList().catch(() => []) : Promise.resolve([])]);
  const active = cur.current.filter((g) => g.status.state === 'recent').length;
  const status = [
    !cur.source.enabled ? translateUI('ui.home_feed_off') : plural('ui.home_feed_active', active),
    translateUI('ui.home_roaming', { first: speciesLabel(leg.current.kanto.id, leg.current.kanto.name), second: speciesLabel(leg.current.johto.id, leg.current.johto.name) }),
    n.latest ? translateUI('ui.home_last_update', { date: fmtDate(n.latest.published) }) : null].filter(Boolean).join(' · ');
  page.append(h('div', { class: 'page-head home-head' }, h('div', null, h('h1', null, greeting()), h('div', { class: 'sub' }, status)),
    h('div', { class: 'actions' }, communityLink(), h('button', { class: 'btn ghost small', onclick: () => go('#/settings/home') }, icon('gear'), translateUI('ui.customize_home')))));
  if (!setting('app.onboarded')) page.append(getStarted(data, runs, () => renderHome(el)));
  else if (data.update_available) page.append(installBanner(data, () => renderHome(el), true));
  const grid = h('div', { class: 'home-v3' });
  page.append(grid);

  // Sections render in the order chosen in Settings › Home. Events and Quick access share one column where the
  // first of them sits. Wide windows pack sections into 12-column rows; the last card of a row takes up whatever
  // is left, so no row ends in an empty gap. Cards in one row are the same height.
  const build = {
    roamers: () => roamersCard(leg), live: () => liveCard(cur),
    update: async () => n.latest ? updateCard(n, () => { newsCache = null; renderHome(el); }) : null,
    side: () => h('div', { class: 'home-side stack' }, on_('events') ? eventsCard(n) : null, on_('quick') ? quickCard() : null),
    news: () => newsCard(n), run: () => continueCard(runs, () => renderHome(el)), favourites: () => favouritesCard(species),
  };
  const order = [...new Set(sections.map((k) => (k === 'events' || k === 'quick') ? 'side' : k))];
  const cards = [];
  for (const k of order) { const c = await build[k]?.(); if (c) { c.dataset.section = k; cards.push([k, c]); } }
  packRows(cards).forEach(([c, span]) => { c.style.setProperty('--span', span); grid.append(c); });

  unsub.push(on('news', () => { if (location.hash.startsWith('#/home')) { newsCache = null; renderHome(el); } }));
}

const HOME_SPAN = { roamers: 5, live: 7, update: 8, side: 4, news: 8, run: 6, favourites: 6 };
/** [[key, card]] → [[card, columns]]: rows of 12 columns in the chosen order. When the next card does not fit,
 *  a later card that does (e.g. the narrow Events/Quick column) moves up to fill the row; the last card of each
 *  row stretches to fill it, so a row never ends in an empty gap. */
export function packRows(cards, spans = HOME_SPAN) {
  const out = [], rest = cards.map(([k, c]) => [c, spans[k] || 12]);
  while (rest.length) {
    const row = [rest.shift()]; let used = row[0][1];
    for (let i = 0; i < rest.length && used < 12;) {
      if (used + rest[i][1] <= 12) { used += rest[i][1]; row.push(rest.splice(i, 1)[0]); } else i++;
    }
    row[row.length - 1] = [row[row.length - 1][0], row[row.length - 1][1] + 12 - used];
    out.push(...row);
  }
  return out;
}

/** Optional community link (Settings › Home can hide it). Nothing when no valid invite is configured. */
function communityLink() {
  const url = state.boot && state.boot.community && state.boot.community.discord;
  if (!url || setting('home.community_link') === false) return null;
  const a = extLink(url, translateUI('ui.home_community'));
  a.classList.add('btn', 'ghost', 'small', 'home-community');
  a.title = translateUI('ui.home_community_desc');
  return a;
}

function greeting() {
  const hr = new Date().getHours();
  return translateUI(hr < 5 ? 'ui.hello_night' : hr < 12 ? 'ui.hello_morning' : hr < 18 ? 'ui.hello_afternoon' : 'ui.hello_evening');
}

// ------------------------------------------------------------ roaming Legendaries
const motionOK = () => animatedIn('roamers');
/** Animated Gen V sprite from your sprite library (only these two on Home), else the still; large tier, never stretched. */
function roamerArt(m, size) {
  if (m.ani && motionOK()) {
    const img = h('img', { class: 'pixel', src: m.ani, alt: speciesLabel(m.id, m.name), decoding: 'async', style: { visibility: 'hidden' } });
    const box = h('div', { class: 'still-art roamer-art', style: { width: size + 'px', height: size + 'px' }, dataset: { tier: 'l' } }, img);
    img.addEventListener('load', () => {
      const f = fitSprite(img.naturalWidth, img.naturalHeight, null, 'l', size, size);
      Object.assign(img.style, { width: f.width + 'px', height: f.height + 'px', left: f.left + 'px', top: f.top + 'px', visibility: '' });
      box.classList.toggle('smooth', f.smooth);
    });
    img.addEventListener('error', () => box.replaceWith(sizedSprite(m, size, { still: m.still, url: m.icon, tier: 'l' })));
    return box;
  }
  return sizedSprite(m, size, { still: m.still, url: m.icon, tier: 'l' });
}
function roamersCard(leg) {
  const cur = leg.current, nxt = leg.next;
  const month = (mm, y) => new Date(y, mm - 1, 1).toLocaleString(locale(), { month: 'long' });
  const tile = (region, m) => h('button', { class: 'roamer', onclick: () => go('#/pokedex/' + m.id), title: translateUI('ui.home_open_dex', { species: speciesLabel(m.id, m.name) }) },
    roamerArt(m, scaled('roamers', 116)), h('div', { class: 'roamer-name' }, speciesLabel(m.id, m.name)), h('div', { class: 'tiny muted roamer-region' }, gameTerm('region', cap(region))), typeChips(m.types, true));
  return h('section', { class: 'card home-roamers half', 'aria-labelledby': 'roam-h' },
    h('div', { class: 'card-head' }, h('h2', { id: 'roam-h' }, translateUI('ui.roaming_legendaries')), h('span', { class: 'tiny muted' }, month(cur.month, cur.year)),
      h('div', { class: 'right' }, h('button', { class: 'btn ghost small', onclick: () => go('#/live/legendaries') }, translateUI('ui.calendar'), icon('chev')))),
    h('div', { class: 'roamer-row' }, tile('kanto', cur.kanto), tile('johto', cur.johto)),
    h('div', { class: 'tiny muted roamer-foot', title: leg.status_note },
      nxt ? translateUI('ui.home_next_roam', { month: month(nxt.month, nxt.year), first: speciesLabel(nxt.kanto.id, nxt.kanto.name), second: speciesLabel(nxt.johto.id, nxt.johto.name) }) : '',
      sourceInfo('COMMUNITY-CYCLE', translateUI('ui.home_unchecked_roam')), extLink(leg.source_url, translateUI('ui.source'))));
}

// ------------------------------------------------------------ Alpha & Swarm
function liveCard(cur) {
  const box = h('div', { class: 'cur-grid home-cur' });
  const head = h('div', { class: 'row small home-feed' });
  const card = h('section', { class: 'card home-live half', 'aria-labelledby': 'live-h' },
    h('div', { class: 'card-head' }, h('h2', { id: 'live-h' }, translateUI('ui.alpha_swarm')), h('span', { class: 'tiny muted' }, translateUI('ui.home_report_recent')),
      h('div', { class: 'right' }, h('button', { class: 'btn ghost small', onclick: () => go('#/live/reports') }, translateUI('ui.history'), icon('chev')))), head, box, homePhenomena());
  let stop = null, expiry = null, sprites = new Map();
  const draw = (c) => {
    const src = c.source;
    const last = src.last_success_at ? translateUI('ui.home_feed_last', { age: relTime(src.last_success_at) }) : '';
    mount(head, h('span', { class: 'dot ' + (src.enabled ? src.status : '') }), h('span', { class: 'muted' },
      !src.enabled ? (c.current.length ? translateUI('ui.home_feed_cached') : translateUI('ui.home_feed_unknown')) : src.status === 'connected' ? translateUI('ui.home_feed_connected') + last
        : translateUI('ui.home_feed_degraded', { status: uiLabel(src.status), last })));
    const list = c.current.slice(0, 4);
    const skew = Date.parse(c.now) - Date.now();
    // Sprites are kept between refreshes (same report group, same animated/still state) so an animation never
    // restarts because the list or a countdown was refreshed.
    const keep = new Map();
    const cards = list.map((g) => {
      // Active reports and expired ones each follow their own Static/Animated preference (Settings › Pokémon & sprites).
      const anim = likelyActive(g, Date.now() + skew) ? animatedIn('report_active') : animatedIn('report_expired');
      const k = `${g.id}:${anim ? 'a' : 's'}`;
      const node = currentCard(g, { compact: true, animate: anim });
      const old = sprites.get(k);
      if (old) node.querySelector('.rep-sprite').replaceWith(old);
      keep.set(k, old || node.querySelector('.rep-sprite'));
      return node;
    });
    sprites = keep;
    clearTimeout(expiry);
    const ends = list.filter((g) => likelyActive(g, Date.now() + skew)).map((g) => Date.parse(g.status.ends_at) - (Date.now() + skew));
    if (ends.length) expiry = setTimeout(() => refresh(), Math.max(1000, Math.min(...ends) + 1000));   // switch to the still image when the estimate ends
    box.dataset.count = String(Math.min(list.length, 9));
    mount(box, list.length ? cards :
      h('div', { class: 'small muted', style: { gridColumn: '1/-1', padding: '6px 2px' } }, src.enabled ? translateUI('ui.home_feed_empty') : translateUI('ui.home_feed_connect')));
    if (stop) stop();
    stop = startTimers(box, Date.parse(c.now) - Date.now(), () => refresh());
  };
  const refresh = async () => { if (!card.isConnected || document.visibilityState === 'hidden') return; draw(await get('/api/live/current')); };
  draw(cur);
  const every = setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', refresh);
  unsub.push(() => { clearInterval(every); clearTimeout(expiry); document.removeEventListener('visibilitychange', refresh); if (stop) stop(); });
  unsub.push(on('live.report', refresh));
  return card;
}

// ------------------------------------------------------------ official updates
async function updateCard(n, rerender) {
  const L = n.latest;
  const full = L.discovered ? null : await get('/api/news/' + L.id).catch(() => null);
  const points = ((full && full.groups) || []).flatMap((g) => g.points).slice(0, 3);
  const f = n.feed;
  // One short status line; details (interval, summaries date, errors) live in the tooltip.
  const status = !f ? translateUI('ui.news_unknown_check') : f.ok ? translateUI('ui.news_checked', { age: relTime(f.last_ok_at || f.checked_at) }) : translateUI('ui.news_check_offline', { age: f.last_ok_at ? relTime(f.last_ok_at) : translateUI('ui.news_check_never') });
  const detail = [n.auto_check ? translateUI('ui.news_check_every', { hours: number(n.check_hours) }) : translateUI('ui.news_check_off'),
    f && !f.ok ? translateUI('ui.news_check_failure', { error: f.error }) : '', f && f.stale ? translateUI('ui.news_check_stale') : '',
    translateUI('ui.news_check_summary', { date: fmtDate(n.snapshot_checked_at) })].filter(Boolean).join(' ');
  return h('section', { class: 'card hero home-update', 'aria-labelledby': 'latest-h' },
    h('div', { class: 'hero-eyebrow' }, icon('book'), translateUI('ui.official_update'), h('span', { class: 'grow' }), provenanceLine(L)),
    h('h2', { class: 'headline', id: 'latest-h' }, L.title),
    L.has_summary === false || !L.summary ? h('p', { class: 'hero-summary muted' }, 'New official post — only its title, date and link are known in the Companion. Open it on the forum for the full changelog.')
      : h('p', { class: 'hero-summary' }, L.summary),
    points.length ? h('ul', { class: 'hero-points' }, points.map((p) => h('li', null, p))) : null,
    L.edited_upstream ? h('div', { class: 'small', style: { color: 'var(--warn)' } }, 'The official post was edited after this summary was written — check the forum for changes.') : null,
    h('div', { class: 'row wrap' }, L.discovered ? extLink(L.source_url, translateUI('ui.news_open_official'))
      : h('button', { class: 'btn primary small', onclick: () => go('#/news/' + L.id) }, translateUI('ui.read_details')),
    h('button', { class: 'btn small', onclick: () => go('#/news') }, translateUI('ui.news_open_all'))),
    h('div', { class: 'update-foot row wrap tiny', title: detail }, h('span', { class: 'dot ' + (!f ? '' : f.ok && !f.stale ? 'connected' : 'offline') }), h('span', null, status),
      n.new_posts.length ? h('span', { class: 'muted' }, `· ${n.new_posts.length} post${n.new_posts.length === 1 ? '' : 's'} without a summary yet`) : null,
      h('span', { class: 'grow' }),
      h('button', { class: 'btn ghost small', title: detail, onclick: async (e) => { e.currentTarget.disabled = true; const r = await post('/api/news/check');
        toast(r.throttled ? 'Checked less than a minute ago.' : r.ok ? `Official updates checked${r.unchanged ? ' — no changes' : ''}.` : `Could not check: ${r.error}`, { kind: r.ok ? 'info' : 'warn', timeout: 6000 });
        rerender(); } }, icon('refresh'), translateUI('ui.news_check_now'))));
}

function newsCard(n) {
  // Home lists only posts PUBLISHED in the last 90 days (n.home, computed by the backend). A post the feed check
  // only just discovered can still be old news (e.g. last year's holiday event) — that stays in the archive.
  const hm = n.home || { posts: n.records || [], window_days: 90 };
  // One list, merged and sorted by PUBLICATION date in the backend (bundled + feed). Discovery or edit time never
  // moves a post up; labels say what it is: New (published in the last 7 days), Edited, or found late.
  const posts = (hm.posts || []).filter((p) => !n.latest || p.id !== n.latest.id).slice(0, 5);
  const label = (p) => p.channel === 'pts' ? h('span', { class: 'badge bad' }, 'PTS')
    : h('span', { class: 'chip' }, kindLabel(p.kind));
  const flag = (p) => p.is_edited ? h('span', { class: 'chip tiny', title: 'The official post was edited after it was published' }, translateUI('ui.news_edited'))
    : p.is_new ? h('span', { class: 'chip tiny accent', title: 'Published in the last 7 days' }, translateUI('ui.news_new'))
      : p.found_late ? h('span', { class: 'tiny muted', title: `Found by the feed check ${fmtDate(p.first_seen_at)}; published ${fmtDate(p.published)}` }, translateUI('ui.news_discovered_late')) : null;
  const rows = posts.map((p) => {
    const inner = [label(p), h('span', { class: 'grow ellipsis', title: p.summary_status || p.title }, p.title), flag(p), h('span', { class: 'when' }, fmtDate(p.published))];
    return p.has_summary === false || p.discovered
      ? h('div', { class: 'list-row compact new-post', dataset: { published: p.published } }, ...inner, extLink(p.source_url || p.link, 'Open'))
      : h('button', { class: 'list-row compact', dataset: { published: p.published }, onclick: () => go('#/news/' + p.id) }, ...inner);
  });
  return h('section', { class: 'card home-news half' }, h('div', { class: 'card-head' }, h('h2', null, translateUI('ui.official_updates_more')),
    h('span', { class: 'tiny muted' }, translateUI('ui.news_archive_recent', { days: number(hm.window_days) })),
    h('div', { class: 'right' }, h('button', { class: 'btn ghost small', onclick: () => go('#/news') }, translateUI('ui.news_archive'), icon('chev')))),
  rows.length ? h('div', { class: 'list-rows' }, rows) : h('div', { class: 'small muted home-empty' }, translateUI('ui.news_archive_empty', { days: number(hm.window_days) })));
}

function eventsCard(n) {
  // Only ongoing (scheduled window open) and upcoming events. Past events live in the archive, not on Home.
  const evs = ((n.home && n.home.events) || n.upcoming).slice(0, 3);
  return h('section', { class: 'card home-events' }, h('div', { class: 'card-head' }, h('h2', null, translateUI('ui.official_events')), h('div', { class: 'right' },
    h('button', { class: 'btn ghost small', onclick: () => go('#/events') }, translateUI('ui.news_archive'), icon('chev')))),
  evs.length ? h('div', { class: 'list-rows' }, evs.map((e) => eventRow(e))) :
    h('div', { class: 'small muted home-empty', title: `Event list written ${fmtDate(n.snapshot_checked_at)}; new official event posts appear under official updates.` }, translateUI('ui.news_events_empty')));
}

async function continueCard(runs, rerender) {
  const run = runs.runs.find((r) => r.id === runs.active) || runs.runs[0];
  if (!run) {
    return h('section', { class: 'card half home-run row' }, icon('guides'), h('div', { class: 'grow small' }, h('strong', null, translateUI('ui.storyline_run')), h('div', { class: 'muted' }, 'Track storyline progress per character.')),
      h('button', { class: 'btn small', onclick: async () => { if (await createRun()) rerender(); } }, icon('plus'), 'Create a run'));
  }
  const st = await get(`/api/guides/runs/${run.id}/state?region=${run.last_region}`);
  const step = st.steps.find((x) => x.id === st.active_step_id);
  const c = st.source === 'milestones' ? st.counts.mandatory : st.counts.unclassified;
  const pct = c.total ? Math.round(c.done / c.total * 100) : 0;
  return h('section', { class: 'card half home-run stack tight' },
    h('div', { class: 'row' }, h('span', { class: 'initial' }, run.character_name.charAt(0).toUpperCase()), h('div', { class: 'grow' },
      h('div', { class: 'eyebrow-text' }, 'Continue'), h('div', { style: { fontWeight: 700 } }, `${run.display} — ${cap(st.region)}`)),
      h('button', { class: 'btn small', onclick: () => go('#/guides?jump=1') }, 'Open guide'), h('button', { class: 'btn ghost small', title: 'Storyline popout', onclick: () => openPopout('storyline') }, icon('popout'))),
    h('div', { class: 'row' }, h('div', { class: 'progress grow' }, h('span', { style: { width: pct + '%' } })), h('span', { class: 'small nowrap' }, `${c.done}/${c.total}`)),
    step ? h('div', { class: 'small' }, h('span', { class: 'muted' }, `${step.chapter} · `), step.text) : null);
}

function quickCard() {
  const list = (setting('nav.quick_access') || []).map((it) => ({ it, info: qaInfo(it) })).filter((x) => x.info);
  return h('section', { class: 'card home-quick' }, h('div', { class: 'card-head' }, h('h2', null, translateUI('ui.quick_access')),
    h('div', { class: 'right' }, h('button', { class: 'btn ghost small', onclick: () => go('#/tools') }, 'Tools', icon('chev')))),
  list.length ? h('div', { class: 'quick-chips' }, list.map(({ info }) => h('button', { class: 'quick-chip' + (info.disabled ? ' disabled' : ''), title: info.disabled || info.label,
    onclick: () => (info.disabled ? toast(info.disabled, { kind: 'warn' }) : go(info.route)) },
  info.sprite ? h('img', { class: 'pixel', src: info.sprite, width: 24, height: 24, alt: '' }) : icon(info.icon), h('span', null, info.label)))) :
    h('div', { class: 'small muted' }, 'Pin tools with “Pin to sidebar”; they appear here and in the sidebar.'));
}

function favouritesCard(species) {
  const favs = species.filter((x) => x.fav).slice(0, 18);
  return h('section', { class: 'card half home-favs' }, h('div', { class: 'card-head' }, h('h2', null, translateUI('ui.favourite_pokemon')),
    h('div', { class: 'right' }, h('button', { class: 'btn ghost small', onclick: () => go('#/pokedex') }, 'Pokédex', icon('chev')))),
  favs.length ? h('div', { class: 'fav-strip' }, favs.map((x) => h('button', { class: 'fav-tile', title: `${x.name} — ${x.avail}`, onclick: () => go('#/pokedex/' + x.id) },
    sizedSprite(x, 48, { still: x.still, url: x.icon, tier: x.size || 'm' }), h('span', { class: 'tiny' }, x.name)))) :
    h('div', { class: 'small muted' }, 'Star Pokémon in the Pokédex to keep them here.'));
}

function getStarted(data, runs, rerender) {
  // A short, skippable welcome: everything here is optional and already works without it.
  const step = (done, title, body, ...action) => h('div', { class: 'gs-step' + (done ? ' done' : '') }, h('span', { class: 'gs-dot' }, done ? icon('check') : null),
    h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, title), h('div', { class: 'small muted' }, body), action.length ? h('div', { class: 'row wrap tight', style: { marginTop: '6px' } }, action) : null));
  const steps = h('div', { class: 'gs-steps' });
  const live = { enabled: !!setting('live.ntfy.enabled') };
  const draw = (game) => mount(steps,
    step(true, 'Ready to use', 'Pokédex, moves, items and encounters for all five regions are built in and work offline. Nothing to install or import.'),
    step(false, 'Language', 'Menus and texts; Pokémon names stay English.',
      h('select', { class: 'input', style: { width: 'auto', minHeight: '28px' }, 'aria-label': translateUI('ui.language'), onchange: async (e) => { await saveSettings({ 'app.language': e.target.value }); location.reload(); } },
        LANGS.map((l) => h('option', { value: l.id, selected: setting('app.language') === l.id ? 'selected' : null }, l.native)))),
    step(!!(game && game.chosen), 'PokeMMO', game && game.chosen ? `Found: ${game.chosen.label}. You can start it from Companion.` : 'Not found automatically — you can choose it later. Companion works without it.',
      game && game.chosen ? h('button', { class: 'btn small', onclick: async () => { try { const r = await post('/api/game/launch'); toast(r.already_running ? 'PokeMMO is already running' : r.already_starting ? 'PokeMMO is already starting' : 'Starting PokeMMO…'); } catch (e) { toast(e.message, { kind: 'warn' }); } } }, icon('play'), 'Launch PokeMMO') : null,
      h('button', { class: 'btn small ghost', onclick: () => go('#/settings/startup') }, 'Startup & game settings')),
    step(!!live.enabled, 'Alpha & Swarm alerts', 'Optional community reports. Off until you turn them on.',
      h('button', { class: 'btn small', onclick: () => go('#/live') }, live.enabled ? 'Open Live' : 'Turn on in Live'),
      h('button', { class: 'btn small ghost', onclick: async () => { try { await post('/api/live/test', { kind: 'alpha' }); } catch (e) { toast(e.message, { kind: 'warn' }); } } }, 'Test a notification')),
    step(false, 'Floating tools', 'Timers, guides, the Pokédex and more can float over the game — draggable, resizable, compact or expanded.',
      h('button', { class: 'btn small', onclick: () => openPopout('timers') }, icon('popout'), 'Try the Timers popout')),
    step(true, 'Stays up to date', 'Official news, PokeMMO data and Companion releases are checked in the background. Nothing installs or restarts without you.',
      h('button', { class: 'btn small ghost', onclick: () => go('#/settings/updates') }, 'Update settings')));
  draw(null);
  get('/api/game/status').then(draw).catch(() => {});
  return h('section', { class: 'card get-started' }, h('div', { class: 'card-head' }, h('h2', null, 'Welcome'), h('div', { class: 'right' },
    h('button', { class: 'btn ghost small', onclick: async () => { await saveSettings({ 'app.onboarded': true }); rerender(); } }, 'Skip — hide this'))), steps);
}

function installBanner(data, rerender, update) {
  const c = update ? data.update_available : data.candidates[0];
  return h('div', { class: 'notice info', style: { marginBottom: '14px' } }, icon('download'),
    h('div', { class: 'grow' }, h('strong', null, update ? 'Your optional PokeMMO client import changed. ' : 'Optional: PokeMMO client files found. '),
      `${c.folder} — importing them adds your client’s sprites and icons (stays on this computer). Everything else already works without it.`),
    h('button', { class: 'btn primary small', onclick: () => installNow(c.folder, rerender) }, update ? 'Re-install' : 'Install'));
}

async function installNow(folder, rerender) {
  const { job } = await post('/api/import/dumps', { folder });
  toast('Installing your PokeMMO data…', { timeout: 2500 });
  const poll = async () => {
    const j = await get('/api/import/jobs/' + job);
    if (j.state === 'running') { setTimeout(poll, 400); return; }
    if (j.state === 'error') { toast(j.error, { kind: 'warn', timeout: 8000 }); return; }
    const { loadBoot } = await import('../core.js');
    await loadBoot(); state.dexCache = null;
    toast(`Installed: ${j.result.counts.species} species, ${j.result.counts.icons || 0} icons.`);
    rerender();
  };
  poll();
}

function statusBadge(st) {
  const map = { upcoming: 'corroborated', concluded: 'unknown', window_passed: 'unknown', window_open: 'dump', cancelled: 'bad', unknown: 'unknown' };
  return h('span', { class: 'badge ' + (map[st.code] || 'unknown') }, st.label);
}
function eventRow(e) {
  return h('button', { class: 'list-row', onclick: () => go('#/events/' + e.id) },
    icon('calendar'), h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, e.title),
      h('div', { class: 'small muted' }, `${fmtDate(e.starts)} – ${fmtDate(e.ends)}`)), statusBadge(e.status));
}

let listFilter = 'all';
async function renderNewsList(el, route, initial) {
  if (initial) listFilter = initial;
  const n = newsCache || await news();
  const page = h('div', { class: 'page' });
  mount(el, page);
  const draw = () => {
    // Bundled summaries and newly discovered official posts in one list (newest first).
    const all = n.records || n.articles;
    const items = listFilter === 'events' ? [] : all.filter((a) => listFilter === 'all' || (listFilter === 'pts' ? a.channel === 'pts'
      : listFilter === 'changelog' ? ['changelog', 'hotfix'].includes(a.kind) && a.channel === 'live' : a.kind === listFilter && a.channel === 'live'));
    mount(page,
      h('div', { class: 'page-head' }, h('button', { class: 'btn ghost', onclick: () => go('#/home') }, icon('back'), translateUI('ui.home')),
        h('div', null, h('h1', null, 'Official updates & events'), h('div', { class: 'sub' }, n.feed && n.feed.last_ok_at ? `Official forum checked ${relTime(n.feed.last_ok_at)}` : `Summaries written ${fmtDate(n.snapshot_checked_at)}`))),
      h('div', { class: 'row wrap', style: { marginBottom: '14px' } },
        ['all', 'changelog', 'announcement', 'pts', 'events'].map((f) => h('button', { class: 'chip btnlike' + (listFilter === f ? ' active' : ''), onclick: () => { listFilter = f; draw(); } },
          { all: 'All', changelog: 'Changelogs', announcement: 'Announcements', pts: 'Test server (PTS)', events: 'Events' }[f]))),
      h('div', { class: 'content-narrow stack' },
        listFilter === 'events' || listFilter === 'all' ? h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, translateUI('ui.events'))),
          n.upcoming.length ? null : h('p', { class: 'muted', style: { marginTop: 0 } }, 'No upcoming official events confirmed in this snapshot.'),
          h('div', { class: 'list-rows' }, n.events.map(eventRow))) : null,
        items.length ? h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Posts')),
          h('div', { class: 'list-rows' }, items.map((a) => h(a.discovered ? 'a' : 'button', a.discovered ? { class: 'list-row', href: a.source_url, target: '_blank', rel: 'noopener noreferrer' } : { class: 'list-row', onclick: () => go('#/news/' + a.id) },
            h('div', { class: 'grow' }, h('div', { class: 'row wrap' }, h('span', { style: { fontWeight: 600 } }, a.title),
              a.channel === 'pts' ? h('span', { class: 'badge bad' }, 'PTS') : h('span', { class: 'chip' }, kindLabel(a.kind))),
            h('div', { class: 'small muted ellipsis' }, a.summary || 'Official post — title, date and link only. Opens on the forum.')), h('span', { class: 'when' }, fmtDate(a.published)))))) : null,
        h('p', { class: 'small muted' }, n.about)));
  };
  draw();
}

async function renderArticle(el, id) {
  const page = h('div', { class: 'page' });
  mount(el, page, );
  let a;
  try { a = await get('/api/news/' + id); } catch (e) { mount(page, notice('bad', e.message)); return; }
  mount(page, h('div', { class: 'content-narrow' },
    h('div', { class: 'row', style: { marginBottom: '12px' } }, h('button', { class: 'btn ghost', onclick: () => history.length > 1 ? history.back() : go('#/news') }, icon('back'), translateUI('ui.back'))),
    h('article', { class: 'card article' },
      h('div', { class: 'band' }, h('div', { class: 'eyebrow card-head', style: { margin: 0 } }, a.channel === 'pts' ? 'Public Test Server' : (kindLabel(a.kind))),
        h('h1', { style: { margin: '4px 0 6px', fontSize: '1.45rem' } }, a.title), provenanceLine(a)),
      a.channel === 'pts' ? notice('warn', h('strong', null, 'Test server only. '), 'Nothing here is part of the live game until a stable changelog confirms it.') : null,
      h('p', { style: { fontSize: '1.05rem', color: 'var(--text-secondary)' } }, a.summary),
      (a.groups || []).map((g) => [h('h2', null, g.heading), h('ul', null, g.points.map((p) => h('li', null, p)))]),
      a.companion_impact && a.companion_impact.length ? [h('h2', null, 'What this changes in the Companion'), h('ul', null, a.companion_impact.map((p) => h('li', null, p)))] : null,
      h('hr'),
      h('div', { class: 'small muted stack tight' },
        h('div', null, 'Source: ', extLink(a.source_url, translateUI('ui.news_official_source'))),
        h('div', null, 'This is an independently written summary, not the full post. ', sourceText(a.provenance))))));
}

async function renderEvent(el, id) {
  const page = h('div', { class: 'page' });
  mount(el, page);
  let e;
  try { e = await get('/api/events/' + id); } catch (err) { mount(page, notice('bad', err.message)); return; }
  const local = (iso) => iso && iso.length > 10 ? `${fmtDate(iso, true)} (your time) · ${iso.replace('T', ' ').replace(':00Z', ' UTC')}` : fmtDate(iso);
  const kindLabel = { seasonal: 'Seasonal world event', competition: 'Catching competition', test: 'Test-server event', tournament: 'PvP tournament' }[e.kind] || cap(e.kind);
  mount(page, h('div', { class: 'content-narrow' },
    h('div', { class: 'row', style: { marginBottom: '12px' } }, h('button', { class: 'btn ghost', onclick: () => history.length > 1 ? history.back() : go('#/events') }, icon('back'), translateUI('ui.back'))),
    h('article', { class: 'card article' },
      h('div', { class: 'band' }, h('div', { class: 'eyebrow card-head', style: { margin: 0 } }, kindLabel),
        h('h1', { style: { margin: '4px 0 6px', fontSize: '1.45rem' } }, e.title),
        h('div', { class: 'row wrap' }, statusBadge(e.status), sourceInfo(e.provenance))),
      h('dl', { class: 'kv' }, h('dt', null, 'Starts'), h('dd', null, local(e.starts)), h('dt', null, 'Ends'), h('dd', null, local(e.ends)),
        h('dt', null, 'Time zone'), h('dd', null, e.timezone_note || '—'),
        (e.details || []).map((d) => [h('dt', null, d.label), h('dd', null, d.value)])),
      h('p', { style: { color: 'var(--text-secondary)' } }, e.summary),
      e.status.code === 'concluded' ? notice('info', 'This event has ended. It is kept as history and never shown as active.') : null,
      h('hr'),
      h('div', { class: 'small muted' }, 'Source: ', extLink(e.source_url, 'Official announcement / changelog')))));
}
