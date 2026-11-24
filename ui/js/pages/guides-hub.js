// Guides — one place for the bundled Storyline walkthroughs (per character run) and My Guides (your own
// checklists, reruns, routines). Routes:
//   #/guides                  All guides (overview)
//   #/guides/storyline        Storyline (old #/guides?region=… and #/guides?jump=1 still open it)
//   #/guides/mine[/<id>]      My Guides (old #/tools/cguides[/<id>] redirects here)
import { h, mount, icon, get, cap, relTime } from '../core.js';
import { go } from '../shell.js';
import * as storyline from './guides.js';
import * as mine from './cguides.js';
import { SCOPES } from './cguides.js';

let sub = null;
export function dispose() { if (sub && sub.dispose) sub.dispose(); sub = null; }

export function tabOf(route) {
  const p = route.parts[0];
  if (p === 'storyline' || p === 'mine') return p;
  if (route.query.get('jump') || route.query.get('region')) return 'storyline';   // old storyline links
  return 'all';
}

export async function render(el, route) {
  dispose();
  const tab = tabOf(route);
  const body = h('div', { class: 'guides-body' });
  mount(el, h('div', { class: 'guides-hub' },
    h('div', { class: 'guides-tabs', role: 'tablist', 'aria-label': 'Guides' }, [['all', 'All guides', '#/guides'], ['storyline', 'Storyline', '#/guides/storyline'], ['mine', 'My Guides', '#/guides/mine']].map(([id, label, href]) =>
      h('button', { class: 'tab' + (tab === id ? ' active' : ''), role: 'tab', 'aria-selected': String(tab === id), dataset: { tab: id }, onclick: () => go(href) }, label))),
    body));
  if (tab === 'storyline') { sub = storyline; return storyline.render(body, { ...route, parts: route.parts.slice(1) }); }
  if (tab === 'mine') { sub = mine; return mine.render(body, { ...route, parts: ['mine', ...route.parts.slice(1)] }); }
  sub = null;
  return renderAll(body);
}

async function renderAll(el) {
  const [runs, cg] = await Promise.all([get('/api/guides/runs'), get('/api/cguides')]);
  const page = h('div', { class: 'page' });
  mount(el, page);
  const active = runs.runs.find((r) => r.id === runs.active) || runs.runs[0];
  const overview = active ? await get(`/api/guides/runs/${active.id}/overview`).catch(() => null) : null;
  page.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Guides'),
    h('div', { class: 'sub' }, 'Storyline walkthroughs with your per-character progress, and your own guides — with checklists, timers and teams.')),
  h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: () => go('#/guides/mine?new=1') }, icon('plus'), 'New guide'))));
  const REG = ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova'];
  // Region cards always show: with a run they open it at that region; without one they open the read-only walkthrough.
  const totals = active && overview ? null : Object.fromEntries(await Promise.all(REG.map((r) => get('/api/guides/catalog/' + r).then((c) => [r, c.steps.length]).catch(() => [r, 0]))));
  const story = h('section', { class: 'card stack tight guides-card' }, h('div', { class: 'card-head' }, h('h2', null, 'Storyline'),
    h('div', { class: 'right' }, h('button', { class: 'btn ghost small', onclick: () => go('#/guides/storyline') }, active ? 'Open' : 'Start', icon('chev')))),
    h('div', { class: 'small muted' }, active ? `Character run: ${active.display || active.character_name}` : 'Walkthroughs for all five regions. Browse now; create a character run to tick steps.'),
    h('div', { class: 'guides-regions' }, REG.map((r) => {
      if (overview) {
        const c = overview[r].mandatory.total ? overview[r].mandatory : overview[r].unclassified;
        const pct = c.total ? Math.round(c.done / c.total * 100) : 0;
        return h('button', { class: 'guides-region', dataset: { region: r }, onclick: () => go(`#/guides/storyline?region=${r}`) }, h('span', null, cap(r)),
          h('div', { class: 'progress' }, h('span', { style: { width: pct + '%' } })), h('span', { class: 'tiny muted' }, `${c.done}/${c.total}`));
      }
      return h('button', { class: 'guides-region', dataset: { region: r }, onclick: () => go(`#/guides/storyline?browse=1&region=${r}`) }, h('span', null, cap(r)),
        h('span', { class: 'tiny muted' }, `${totals[r]} steps`));
    })),
    h('div', { class: 'row wrap tight guides-foot' }, active ? h('button', { class: 'btn ghost small', onclick: () => go('#/guides/storyline?browse=1&region=kanto') }, 'Browse without ticking')
      : h('button', { class: 'btn small', onclick: () => go('#/guides/storyline') }, icon('plus'), 'Create a character run'),
      h('span', { class: 'tiny muted' }, 'Walkthroughs by their original author, bundled with permission.')));
  const list = cg.guides.filter((g) => !g.archived_at);
  const count = (k) => list.filter((g) => g.scope === k).length;
  const shortcuts = SCOPES.filter(([k]) => k !== 'custom');
  const minePane = h('section', { class: 'card stack tight guides-card' }, h('div', { class: 'card-head' }, h('h2', null, 'My Guides'),
    h('div', { class: 'right' }, h('button', { class: 'btn ghost small', onclick: () => go('#/guides/mine') }, 'All', icon('chev')))),
  list.length ? h('div', { class: 'stack tight' }, list.slice(0, 5).map((g) => h('button', { class: 'tool-link', onclick: () => go('#/guides/mine/' + g.id) }, icon('list'),
    h('div', null, h('div', { class: 'tl-title' }, g.title), h('div', { class: 'small muted' }, `${g.scope_label} · ${g.done}/${g.checks} done · edited ${relTime(g.updated_at)}`))))) :
    h('div', { class: 'small muted' }, 'Your own checklists, reruns and routines. No character run needed.'),
  h('div', { class: 'tiny muted' }, 'Categories — open yours, or start a new one:'),
  h('div', { class: 'guides-cats' }, shortcuts.map(([k, l]) => h('button', { class: 'chip btnlike', dataset: { scope: k },
    title: count(k) ? `Open your ${l} guides` : `Start a ${l} guide`, onclick: () => go(count(k) ? '#/guides/mine?cat=' + k : `#/guides/mine?new=1&scope=${k}`) },
    l, count(k) ? h('span', { class: 'count' }, count(k)) : h('span', { class: 'count' }, '+')))));
  page.append(h('div', { class: 'guides-all' }, story, minePane));
}
