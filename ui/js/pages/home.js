// Home + in-app official news / changelog / event reader (docs/design/03).
import { h, mount, icon, get, post, badge, notice, relTime, fmtDate, extLink, setting, state, on, cap, typeChips, toast, spriteOrFallback } from '../core.js';
import { go } from '../shell.js';

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

async function renderHome(el) {
  const page = h('div', { class: 'page' });
  mount(el, page);
  page.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Home'),
    h('div', { class: 'sub' }, 'What changed, what’s coming up, and what you were doing.'))));
  const [n, rep, leg, runs] = await Promise.all([news(), get('/api/live/reports?tests=1'), get('/api/live/legendaries'), get('/api/guides/runs')]);

  if (!state.boot.dex.imported) {
    page.append(h('div', { style: { marginBottom: '16px' } }, notice('info',
      h('strong', null, 'Pokédex details and sprites need your local PokeMMO data. '),
      'Names, numbers and types are bundled; stats, locations, moves and sprites come from your own dump files and stay on this computer. ',
      h('button', { class: 'btn small', style: { marginLeft: '6px' }, onclick: () => go('#/settings/data') }, 'Import data'))));
  }

  const left = h('div', { class: 'stack' });
  const right = h('div', { class: 'stack' });
  page.append(h('div', { class: 'home-grid' }, left, right));
  const sections = setting('home.sections') || ['update', 'events', 'live', 'shortcuts'];

  // 1. Latest official update
  if (sections.includes('update') && n.latest) {
    const a = n.latest;
    const feed = n.feed;
    left.append(h('section', { class: 'card', 'aria-labelledby': 'latest-h' },
      h('div', { class: 'band row' }, h('span', { class: 'card-head eyebrow', style: { margin: 0 } }, 'Latest official update'), h('span', { class: 'grow' }),
        h('button', { class: 'btn ghost small', onclick: () => go('#/news') }, 'All updates', icon('chev'))),
      h('div', { class: 'headline', id: 'latest-h' }, a.title),
      provenanceLine(a),
      h('p', { style: { margin: '10px 0 12px', color: 'var(--text-secondary)' } }, a.summary),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn primary', onclick: () => go('#/news/' + a.id) }, 'Read details'),
        h('span', { class: 'grow' }),
        h('span', { class: 'small muted' }, 'Snapshot checked ', fmtDate(n.snapshot_checked_at)),
        h('button', { class: 'btn ghost small', title: 'Fetch the official Updates feed (titles only)', onclick: async (e) => {
          e.currentTarget.disabled = true; const r = await post('/api/news/check');
          toast(r.ok ? `Official forum checked: ${r.count} posts listed.` : `Cannot refresh official updates — ${r.error}`, { kind: r.ok ? 'info' : 'warn', timeout: 6000 });
          renderHome(el); } }, icon('refresh'), 'Check forum')),
      feed ? h('div', { class: 'small muted', style: { marginTop: '8px' } },
        feed.ok ? `Last forum check ${relTime(feed.checked_at)}.` : `Last forum check failed ${relTime(feed.checked_at)} (${feed.error}). Showing the bundled snapshot.`) : null,
      n.new_posts.length ? h('div', { class: 'stack tight', style: { marginTop: '10px' } },
        h('div', { class: 'label' }, 'New official posts since the snapshot — no in-app summary yet'),
        n.new_posts.slice(0, 4).map((p) => h('div', { class: 'list-row' }, h('span', { class: 'grow' }, p.title), h('span', { class: 'when' }, fmtDate(p.published)), extLink(p.link, 'Open')))) : null));
  }

  // 2. Official events
  if (sections.includes('events')) {
    const card = h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Official events'), h('div', { class: 'right' },
      h('button', { class: 'btn ghost small', onclick: () => go('#/events') }, 'All events', icon('chev')))));
    if (!n.upcoming.length) {
      card.append(h('div', { class: 'notice info', style: { marginBottom: '10px' } }, icon('calendar'),
        h('div', null, h('strong', null, 'No upcoming official events confirmed'), ` in the snapshot checked ${fmtDate(n.snapshot_checked_at)}. Use “Check forum” for newer posts.`)));
    }
    const rows = [...n.upcoming, ...n.events.filter((e) => !n.upcoming.includes(e))].slice(0, 3);
    card.append(h('div', { class: 'list-rows' }, rows.map((e) => eventRow(e))));
    left.append(card);
  }

  // 3. Live activity summary
  if (sections.includes('live')) {
    const src = rep.source;
    const real = rep.reports.filter((r) => !r.is_test).slice(0, 2);
    const lastTest = rep.reports.find((r) => r.is_test);
    const card = h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Live activity'),
      h('div', { class: 'right' }, h('button', { class: 'btn ghost small', onclick: () => go('#/live') }, 'Open Live', icon('chev')))));
    const status = !src.enabled ? 'Report feed off (opt-in in Live)' : src.status === 'connected' ? `Feed connected · last data ${relTime(src.last_success_at)}`
      : `Reports unavailable — ${src.status}${src.last_success_at ? ', last update ' + relTime(src.last_success_at) : ''}`;
    card.append(h('div', { class: 'row small', style: { marginBottom: '8px' } }, h('span', { class: 'dot ' + (src.enabled ? src.status : '') }), h('span', { class: 'muted' }, status)));
    const list = h('div', { class: 'list-rows' });
    for (const r of real) {
      list.append(h('button', { class: 'list-row', onclick: () => go('#/live/reports/' + r.id) },
        h('span', { class: `kind-label kind-${r.kind}` }, r.kind), h('span', { class: 'grow ellipsis' }, r.title || r.body),
        h('span', { class: 'when' }, 'Reported ', relTime(r.source_time || r.received_at))));
    }
    if (!real.length) list.append(h('div', { class: 'small muted', style: { padding: '4px 2px' } },
      src.enabled ? 'No reports received yet.' : 'No community reports — the feed is off, so nothing is claimed about current Alphas or Swarms.'));
    if (lastTest) list.append(h('div', { class: 'small muted', style: { padding: '0 2px' } }, `Last TEST notification ${relTime(lastTest.received_at)} (not a real report).`));
    card.append(list, h('hr'));
    const cur = leg.current;
    card.append(h('button', { class: 'list-row', onclick: () => go('#/live/legendaries') },
      icon('crown'), h('span', { class: 'grow' }, `Roamers this month: ${cur.kanto.name} (Kanto) · ${cur.johto.name} (Johto)`),
      badge('COMMUNITY-CYCLE', 'Community cycle · unverified')),
    h('button', { class: 'list-row', style: { marginTop: '4px' }, onclick: () => go('#/live/cave') },
      icon('crystal'), h('span', { class: 'grow' }, 'Altering Cave: current rotation unknown'), badge('UNKNOWN', 'No verified source')));
    right.append(card);
  }

  // 4. Shortcuts
  if (sections.includes('shortcuts')) {
    const sc = await shortcuts(runs);
    if (sc.length) right.append(h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Continue')), h('div', { class: 'stack tight' }, sc)));
  }
  unsub.push(on('live.report', () => { if (location.hash.startsWith('#/home')) renderHome(el); }));
}

async function shortcuts(runs) {
  const want = setting('home.shortcuts') || [];
  const out = [];
  if (want.includes('guide') && runs.active) {
    try {
      const run = runs.runs.find((r) => r.id === runs.active);
      if (run) {
        const st = await get(`/api/guides/runs/${run.id}/state?region=${run.last_region}`);
        const step = st.steps.find((s) => s.id === st.active_step_id);
        out.push(h('button', { class: 'shortcut', onclick: () => go('#/guides') }, icon('guides'),
          h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, `Continue ${run.display} — ${cap(st.region)}`),
            h('div', { class: 'small muted ellipsis' }, step ? step.text : 'No current step'))));
      }
    } catch (_) { /* run may be gone */ }
  }
  const last = setting('pokedex.last_species');
  if (want.includes('pokedex_last') && last) {
    const idx = (state.dexCache || (state.dexCache = (await get('/api/dex/species')).species));
    const sp = idx.find((s) => s.id === last);
    if (sp) out.push(h('button', { class: 'shortcut', onclick: () => go('#/pokedex/' + sp.id) },
      h('div', { style: { width: '36px', height: '36px', display: 'grid', placeItems: 'center' } }, spriteOrFallback(sp.icon, sp, 36)),
      h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, `Last viewed: ${sp.name}`), typeChips(sp.types, true))));
  }
  if (want.includes('breeding')) out.push(h('button', { class: 'shortcut', onclick: () => go('#/tools/breeding') }, icon('egg'),
    h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, 'Breeding planner'), h('div', { class: 'small muted' }, 'Parent A | Offspring | Parent B'))));
  if (want.includes('typechart')) out.push(h('button', { class: 'shortcut', onclick: () => go('#/tools/typechart') }, icon('shield'),
    h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, 'Type matchups'))));
  return out;
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
