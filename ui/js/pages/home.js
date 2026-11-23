// Home + in-app official news / changelog / event reader (docs/design/03).
import { h, mount, icon, get, post, badge, notice, relTime, fmtDate, extLink, setting, saveSettings, state, on, cap, typeChips, toast, spriteOrFallback, sizedSprite, fitSprite, seg, pad3 } from '../core.js';
import { go, qaInfo, openPopout } from '../shell.js';
import { createRun } from './guides.js';
import { loadList } from './pokedex.js';
import { currentCard, startTimers } from './live.js';

let unsub = [];
let newsCache = null;
const KIND_LABEL = { changelog: 'Changelog', announcement: 'Announcement' };

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
  return h('div', { class: 'row wrap small muted' }, badge(item.provenance),
    item.channel === 'pts' ? h('span', { class: 'badge bad' }, 'PTS — test server, not live') : null,
    h('span', null, 'Published ', fmtDate(item.published)), item.updated ? h('span', null, '· updated ', fmtDate(item.updated)) : null);
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
    !cur.source.enabled ? 'Alpha/Swarm feed off' : `${active} Alpha/Swarm report${active === 1 ? '' : 's'} likely active`,
    `Roaming this month: ${leg.current.kanto.name} & ${leg.current.johto.name}`,
    n.latest ? `Latest update ${fmtDate(n.latest.published)}` : null].filter(Boolean).join(' · ');
  page.append(h('div', { class: 'page-head home-head' }, h('div', null, h('h1', null, greeting()), h('div', { class: 'sub' }, status)),
    h('div', { class: 'actions' }, h('button', { class: 'btn ghost small', onclick: () => go('#/settings/appearance') }, icon('gear'), 'Customize Home'))));
  if (!setting('app.onboarded')) page.append(getStarted(data, runs, () => renderHome(el)));
  else if (data.update_available) page.append(installBanner(data, () => renderHome(el), true));
  const grid = h('div', { class: 'home-v3' });
  page.append(grid);

  if (on_('roamers')) grid.append(roamersCard(leg));
  if (on_('live')) grid.append(liveCard(cur, el));
  if (on_('update') && n.latest) grid.append(await updateCard(n, () => { newsCache = null; renderHome(el); }));
  if (on_('events') || on_('quick')) grid.append(h('div', { class: 'home-side stack' }, on_('events') ? eventsCard(n) : null, on_('quick') ? quickCard() : null));
  if (on_('news')) grid.append(newsCard(n));
  if (on_('run')) grid.append(await continueCard(runs, () => renderHome(el)));
  if (on_('favourites')) grid.append(favouritesCard(species));
  grid.querySelectorAll(':scope > *').forEach((c, i, all) => { if (i === all.length - 1 && all.length % 2 === 1 && c.classList.contains('half')) c.classList.add('wide'); });

  unsub.push(on('news', () => { if (location.hash.startsWith('#/home')) { newsCache = null; renderHome(el); } }));
}

function greeting() {
  const hr = new Date().getHours();
  return hr < 5 ? 'Good night' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
}

// ------------------------------------------------------------ roaming Legendaries
function motionOK() {
  const pref = setting('pokedex.animate');
  if (pref === true || pref === false) return pref;
  return !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) && !document.documentElement.classList.contains('reduced-motion');
}
/** Animated Gen V sprite from your sprite library (only these two on Home), else the still; large tier, never stretched. */
function roamerArt(m, size) {
  if (m.ani && motionOK()) {
    const img = h('img', { class: 'pixel', src: m.ani, alt: m.name, decoding: 'async', style: { visibility: 'hidden' } });
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
  const month = (mm, y) => new Date(y, mm - 1, 1).toLocaleString(undefined, { month: 'long' });
  const tile = (region, m) => h('button', { class: 'roamer', onclick: () => go('#/pokedex/' + m.id), title: `${m.name} — open in the Pokédex` },
    roamerArt(m, 116), h('div', { class: 'roamer-name' }, m.name), h('div', { class: 'tiny muted roamer-region' }, cap(region)), typeChips(m.types, true));
  return h('section', { class: 'card home-roamers half', 'aria-labelledby': 'roam-h' },
    h('div', { class: 'card-head' }, h('h2', { id: 'roam-h' }, 'Roaming Legendaries'), h('span', { class: 'tiny muted' }, month(cur.month, cur.year)),
      h('div', { class: 'right' }, h('button', { class: 'btn ghost small', onclick: () => go('#/live/legendaries') }, 'Calendar', icon('chev')))),
    h('div', { class: 'roamer-row' }, tile('kanto', cur.kanto), tile('johto', cur.johto)),
    h('div', { class: 'tiny muted roamer-foot', title: leg.status_note },
      h('span', { class: 'chip' }, 'Community cycle'), ' Not checked in-game this month · rollover time unknown',
      nxt ? ` · ${month(nxt.month, nxt.year)}: ${nxt.kanto.name} & ${nxt.johto.name}` : '', ' · ', extLink(leg.source_url, 'Source')));
}

// ------------------------------------------------------------ Alpha & Swarm
function liveCard(cur, el) {
  const box = h('div', { class: 'cur-grid home-cur' });
  const head = h('div', { class: 'row small home-feed' });
  const card = h('section', { class: 'card home-live half', 'aria-labelledby': 'live-h' },
    h('div', { class: 'card-head' }, h('h2', { id: 'live-h' }, 'Alpha & Swarm'), h('span', { class: 'tiny muted' }, 'recently reported'),
      h('div', { class: 'right' }, h('button', { class: 'btn ghost small', onclick: () => go('#/live/reports') }, 'History', icon('chev')))), head, box);
  let stop = null;
  const draw = (c) => {
    const src = c.source;
    mount(head, h('span', { class: 'dot ' + (src.enabled ? src.status : '') }), h('span', { class: 'muted' },
      !src.enabled ? (c.current.length ? 'Feed off — showing reports received while it was on' : 'Feed off — no claim about current Alphas or Swarms') : src.status === 'connected' ? `Feed connected${src.last_success_at ? ' · last data ' + relTime(src.last_success_at) : ''}`
        : `Feed ${src.status}${src.last_success_at ? ' · last data ' + relTime(src.last_success_at) : ''} — reports may be missing`));
    const list = c.current.slice(0, 4);
    mount(box, list.length ? list.map((g) => currentCard(g, { compact: true })) :
      h('div', { class: 'small muted', style: { gridColumn: '1/-1', padding: '6px 2px' } }, src.enabled ? 'Nothing reported recently. This does not mean none are active.' : 'Connect the read-only report feed in Live to see community reports here.'));
    if (stop) stop();
    stop = startTimers(box, Date.parse(c.now) - Date.now(), () => refresh());
  };
  const refresh = async () => { if (!card.isConnected || document.visibilityState === 'hidden') return; draw(await get('/api/live/current')); };
  draw(cur);
  const every = setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', refresh);
  unsub.push(() => { clearInterval(every); document.removeEventListener('visibilitychange', refresh); if (stop) stop(); });
  unsub.push(on('live.report', refresh));
  void el;
  return card;
}

// ------------------------------------------------------------ official updates
async function updateCard(n, rerender) {
  const full = await get('/api/news/' + n.latest.id);
  const points = (full.groups || []).flatMap((g) => g.points).slice(0, 3);
  const f = n.feed;
  const feed = !f ? 'Official feed not checked yet' : f.ok ? (f.unchanged ? `Official feed up to date · checked ${relTime(f.checked_at)}` : `Official feed checked ${relTime(f.checked_at)} · ${f.count} posts listed`)
    : `Last check failed ${relTime(f.checked_at)} — ${f.error}. Showing saved summaries.`;
  return h('section', { class: 'card hero home-update', 'aria-labelledby': 'latest-h' },
    h('div', { class: 'hero-eyebrow' }, icon('book'), 'Latest official update', h('span', { class: 'grow' }), provenanceLine(n.latest)),
    h('h2', { class: 'headline', id: 'latest-h' }, n.latest.title),
    h('p', { class: 'hero-summary' }, n.latest.summary),
    points.length ? h('ul', { class: 'hero-points' }, points.map((p) => h('li', null, p))) : null,
    h('div', { class: 'row wrap' }, h('button', { class: 'btn primary small', onclick: () => go('#/news/' + n.latest.id) }, 'Read details'),
      h('button', { class: 'btn small', onclick: () => go('#/news') }, 'All updates & events')),
    h('div', { class: 'update-foot row wrap tiny' }, h('span', { class: 'dot ' + (!f ? '' : f.ok ? 'connected' : 'offline') }), h('span', null, feed),
      h('span', { class: 'muted' }, n.auto_check ? `· automatic check every ${n.check_hours} h` : '· automatic checks off'),
      h('span', { class: 'muted', title: 'Summaries in the Companion are written and dated by hand; new official titles show “Summary pending verification” until then.' },
        `· summaries written ${fmtDate(n.snapshot_checked_at)}`),
      n.new_posts.length ? h('strong', null, `· ${n.new_posts.length} new post${n.new_posts.length === 1 ? '' : 's'} since`) : null,
      h('span', { class: 'grow' }),
      h('button', { class: 'btn ghost small', onclick: async (e) => { e.currentTarget.disabled = true; const r = await post('/api/news/check');
        toast(r.throttled ? 'Checked less than a minute ago.' : r.ok ? `Official feed checked${r.unchanged ? ' — no changes' : ''}.` : `Could not refresh: ${r.error}`, { kind: r.ok ? 'info' : 'warn', timeout: 6000 });
        rerender(); } }, icon('refresh'), 'Check now')));
}

function newsCard(n) {
  // Home lists only posts PUBLISHED in the last 90 days (n.home, computed by the backend). A post the feed check
  // only just discovered can still be old news (e.g. last year's holiday event) — that stays in the archive.
  const hm = n.home || { new_posts: n.new_posts, articles: n.articles, window_days: 90 };
  const fresh = hm.new_posts.slice(0, 3);
  const rest = hm.articles.filter((a) => !n.latest || a.id !== n.latest.id).slice(0, 5 - fresh.length);
  const rows = [
    ...fresh.map((p) => h('div', { class: 'list-row compact new-post' }, h('span', { class: 'chip' }, p.edited ? 'Edited' : 'New'),
      h('span', { class: 'grow ellipsis' }, p.title, h('span', { class: 'tiny muted' }, ' · summary pending verification')), h('span', { class: 'when' }, fmtDate(p.published)), extLink(p.link, 'Open'))),
    ...rest.map((a) => h('button', { class: 'list-row compact', onclick: () => go('#/news/' + a.id) },
      a.channel === 'pts' ? h('span', { class: 'badge bad' }, 'PTS') : h('span', { class: 'chip' }, KIND_LABEL[a.kind] || a.kind),
      h('span', { class: 'grow ellipsis' }, a.title), h('span', { class: 'when' }, fmtDate(a.published))))];
  return h('section', { class: 'card home-news half' }, h('div', { class: 'card-head' }, h('h2', null, 'More official updates'),
    h('span', { class: 'tiny muted' }, `published in the last ${hm.window_days} days`),
    h('div', { class: 'right' }, h('button', { class: 'btn ghost small', onclick: () => go('#/news') }, 'Archive', icon('chev')))),
  rows.length ? h('div', { class: 'list-rows' }, rows) : h('div', { class: 'small muted home-empty' }, `Nothing published in the last ${hm.window_days} days besides the update above. Older posts are in the archive.`));
}

function eventsCard(n) {
  // Only ongoing (scheduled window open) and upcoming events. Past events live in the archive, not on Home.
  const evs = ((n.home && n.home.events) || n.upcoming).slice(0, 3);
  return h('section', { class: 'card home-events' }, h('div', { class: 'card-head' }, h('h2', null, 'Official events'), h('div', { class: 'right' },
    h('button', { class: 'btn ghost small', onclick: () => go('#/events') }, 'Archive', icon('chev')))),
  evs.length ? h('div', { class: 'list-rows' }, evs.map((e) => eventRow(e))) :
    h('div', { class: 'small muted home-empty' }, 'No ongoing or upcoming official events',
      h('span', { class: 'tiny' }, ` (snapshot ${fmtDate(n.snapshot_checked_at)}${n.feed && n.feed.ok ? `, feed checked ${relTime(n.feed.checked_at)}` : ''})`)));
}

async function continueCard(runs, rerender) {
  const run = runs.runs.find((r) => r.id === runs.active) || runs.runs[0];
  if (!run) {
    return h('section', { class: 'card half home-run row' }, icon('guides'), h('div', { class: 'grow small' }, h('strong', null, 'Storyline run'), h('div', { class: 'muted' }, 'Track storyline progress per character.')),
      h('button', { class: 'btn small', onclick: async () => { if (await createRun()) rerender(); } }, icon('plus'), 'Create a run'));
  }
  const st = await get(`/api/guides/runs/${run.id}/state?region=${run.last_region}`);
  const step = st.steps.find((x) => x.id === st.active_step_id);
  const c = st.source === 'imported' ? st.counts.unclassified : st.counts.mandatory;
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
  return h('section', { class: 'card home-quick' }, h('div', { class: 'card-head' }, h('h2', null, 'Quick access'),
    h('div', { class: 'right' }, h('button', { class: 'btn ghost small', onclick: () => go('#/tools') }, 'Tools', icon('chev')))),
  list.length ? h('div', { class: 'quick-chips' }, list.map(({ info }) => h('button', { class: 'quick-chip' + (info.disabled ? ' disabled' : ''), title: info.disabled || info.label,
    onclick: () => (info.disabled ? toast(info.disabled, { kind: 'warn' }) : go(info.route)) },
  info.sprite ? h('img', { class: 'pixel', src: info.sprite, width: 24, height: 24, alt: '' }) : icon(info.icon), h('span', null, info.label)))) :
    h('div', { class: 'small muted' }, 'Pin tools with “Pin to sidebar”; they appear here and in the sidebar.'));
}

function favouritesCard(species) {
  const favs = species.filter((x) => x.fav).slice(0, 18);
  return h('section', { class: 'card half home-favs' }, h('div', { class: 'card-head' }, h('h2', null, 'Favourite Pokémon'),
    h('div', { class: 'right' }, h('button', { class: 'btn ghost small', onclick: () => go('#/pokedex') }, 'Pokédex', icon('chev')))),
  favs.length ? h('div', { class: 'fav-strip' }, favs.map((x) => h('button', { class: 'fav-tile', title: `${x.name} — ${x.avail}`, onclick: () => go('#/pokedex/' + x.id) },
    sizedSprite(x, 48, { still: x.still, url: x.icon, tier: x.size || 'm' }), h('span', { class: 'tiny' }, x.name)))) :
    h('div', { class: 'small muted' }, 'Star Pokémon in the Pokédex to keep them here.'));
}

function getStarted(data, runs, rerender) {
  const step = (done, title, body, action) => h('div', { class: 'gs-step' + (done ? ' done' : '') }, h('span', { class: 'gs-dot' }, done ? icon('check') : null),
    h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, title), h('div', { class: 'small muted' }, body)), action);
  return h('section', { class: 'card get-started' }, h('div', { class: 'card-head' }, h('h2', null, 'Get started'), h('div', { class: 'right' },
    h('button', { class: 'btn ghost small', onclick: async () => { await saveSettings({ 'app.onboarded': true }); rerender(); } }, 'Done — hide this'))),
  h('div', { class: 'gs-steps' },
    step(true, 'PokeMMO data and region maps are built in', 'Pokédex, moves, items, encounters and all five interactive region maps work right away, offline. Nothing to install.', null),
    step(runs.runs.length > 0, 'Create a named character run', 'Tracks storyline progress per character in all five regions.',
      runs.runs.length ? null : h('button', { class: 'btn small', onclick: async () => { if (await createRun()) rerender(); } }, 'Create run')),
    step(false, 'Pick your navigation', 'Vertical sidebar (with Quick access) or a horizontal top bar.',
      seg([['vertical', 'Vertical'], ['horizontal', 'Horizontal']], setting('appearance.nav'), async (v) => { await saveSettings({ 'appearance.nav': v }); document.dispatchEvent(new CustomEvent('settings-changed', { detail: { 'appearance.nav': v } })); }, 'Navigation'))));
}

function installBanner(data, rerender, update) {
  const c = update ? data.update_available : data.candidates[0];
  return h('div', { class: 'notice info', style: { marginBottom: '14px' } }, icon('download'),
    h('div', { class: 'grow' }, h('strong', null, update ? 'Your PokeMMO dump changed since it was installed. ' : 'Your PokeMMO data was found. '),
      `${c.folder} — install it once for stats, locations, moves and sprites (stays on this computer).`),
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
    const items = listFilter === 'events' ? [] : n.articles.filter((a) => listFilter === 'all' || (listFilter === 'pts' ? a.channel === 'pts' : a.kind === listFilter && a.channel === 'live'));
    mount(page,
      h('div', { class: 'page-head' }, h('button', { class: 'btn ghost', onclick: () => go('#/home') }, icon('back'), 'Home'),
        h('div', null, h('h1', null, 'Official updates & events'), h('div', { class: 'sub' }, `In-app summaries · snapshot checked ${fmtDate(n.snapshot_checked_at)}`))),
      h('div', { class: 'row wrap', style: { marginBottom: '14px' } },
        ['all', 'changelog', 'announcement', 'pts', 'events'].map((f) => h('button', { class: 'chip btnlike' + (listFilter === f ? ' active' : ''), onclick: () => { listFilter = f; draw(); } },
          { all: 'All', changelog: 'Changelogs', announcement: 'Announcements', pts: 'Test server (PTS)', events: 'Events' }[f]))),
      h('div', { class: 'content-narrow stack' },
        listFilter === 'events' || listFilter === 'all' ? h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Events')),
          n.upcoming.length ? null : h('p', { class: 'muted', style: { marginTop: 0 } }, 'No upcoming official events confirmed in this snapshot.'),
          h('div', { class: 'list-rows' }, n.events.map(eventRow))) : null,
        items.length ? h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Posts')),
          h('div', { class: 'list-rows' }, items.map((a) => h('button', { class: 'list-row', onclick: () => go('#/news/' + a.id) },
            h('div', { class: 'grow' }, h('div', { class: 'row wrap' }, h('span', { style: { fontWeight: 600 } }, a.title),
              a.channel === 'pts' ? h('span', { class: 'badge bad' }, 'PTS') : h('span', { class: 'chip' }, KIND_LABEL[a.kind] || a.kind)),
            h('div', { class: 'small muted ellipsis' }, a.summary)), h('span', { class: 'when' }, fmtDate(a.published)))))) : null,
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
    h('div', { class: 'row', style: { marginBottom: '12px' } }, h('button', { class: 'btn ghost', onclick: () => history.length > 1 ? history.back() : go('#/news') }, icon('back'), 'Back')),
    h('article', { class: 'card article' },
      h('div', { class: 'band' }, h('div', { class: 'eyebrow card-head', style: { margin: 0 } }, a.channel === 'pts' ? 'Public Test Server' : (KIND_LABEL[a.kind] || a.kind)),
        h('h1', { style: { margin: '4px 0 6px', fontSize: '1.45rem' } }, a.title), provenanceLine(a)),
      a.channel === 'pts' ? notice('warn', h('strong', null, 'Test server only. '), 'Nothing here is part of the live game until a stable changelog confirms it.') : null,
      h('p', { style: { fontSize: '1.05rem', color: 'var(--text-secondary)' } }, a.summary),
      (a.groups || []).map((g) => [h('h2', null, g.heading), h('ul', null, g.points.map((p) => h('li', null, p)))]),
      a.companion_impact && a.companion_impact.length ? [h('h2', null, 'What this changes in the Companion'), h('ul', null, a.companion_impact.map((p) => h('li', null, p)))] : null,
      h('hr'),
      h('div', { class: 'small muted stack tight' },
        h('div', null, 'Source: ', extLink(a.source_url, 'Original post on the official PokeMMO forum')),
        h('div', null, 'This is an independently written summary, not the full post. Provenance: ', badge(a.provenance), '.')))));
}

async function renderEvent(el, id) {
  const page = h('div', { class: 'page' });
  mount(el, page);
  let e;
  try { e = await get('/api/events/' + id); } catch (err) { mount(page, notice('bad', err.message)); return; }
  const local = (iso) => iso && iso.length > 10 ? `${fmtDate(iso, true)} (your time) · ${iso.replace('T', ' ').replace(':00Z', ' UTC')}` : fmtDate(iso);
  const kindLabel = { seasonal: 'Seasonal world event', competition: 'Catching competition', test: 'Test-server event', tournament: 'PvP tournament' }[e.kind] || cap(e.kind);
  mount(page, h('div', { class: 'content-narrow' },
    h('div', { class: 'row', style: { marginBottom: '12px' } }, h('button', { class: 'btn ghost', onclick: () => history.length > 1 ? history.back() : go('#/events') }, icon('back'), 'Back')),
    h('article', { class: 'card article' },
      h('div', { class: 'band' }, h('div', { class: 'eyebrow card-head', style: { margin: 0 } }, kindLabel),
        h('h1', { style: { margin: '4px 0 6px', fontSize: '1.45rem' } }, e.title),
        h('div', { class: 'row wrap' }, statusBadge(e.status), badge(e.provenance))),
      h('dl', { class: 'kv' }, h('dt', null, 'Starts'), h('dd', null, local(e.starts)), h('dt', null, 'Ends'), h('dd', null, local(e.ends)),
        h('dt', null, 'Time zone'), h('dd', null, e.timezone_note || '—'),
        (e.details || []).map((d) => [h('dt', null, d.label), h('dd', null, d.value)])),
      h('p', { style: { color: 'var(--text-secondary)' } }, e.summary),
      e.status.code === 'concluded' ? notice('info', 'This event has ended. It is kept as history and never shown as active.') : null,
      h('hr'),
      h('div', { class: 'small muted' }, 'Source: ', extLink(e.source_url, 'Official announcement / changelog')))));
}
