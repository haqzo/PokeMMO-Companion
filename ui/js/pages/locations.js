// Location explorer: a searchable directory of every PokeMMO location, grouped by region, sub-region (Sevii Islands)
// and kind of place, with the full encounter tables. Data: the built-in PokeMMO reference (or your own client
// data when you imported it). The interactive map work (artwork, geometry, personal marks) is kept in the
// repository and database but is no longer part of this page (owner decision, 2026-11-24).
import { h, mount, icon, get, debounce, cap, pad3, typeChips, notice, sizedSprite, TYPE_LIST, setting, saveSettings } from '../core.js';
import { go, popoutButton, pinButton } from '../shell.js';
import { t } from '../i18n.js';
import { linkedNotes, openRoute } from '../links.js';

export const REGIONS = ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova'];
const TIMES = [['morning', 'Morning', 1], ['day', 'Day', 2], ['night', 'Night', 4]];
export const CATEGORIES = [['all', 'All locations'], ['routes', 'Routes'], ['towns', 'Towns & cities'], ['caves', 'Caves'], ['forests', 'Forests'],
  ['islands', 'Islands'], ['special', 'Special areas']];
const f = { q: '', species: null, type: '', method: '', horde: false, time: '', season: '' };
const ui = { cat: 'all', sub: 'all' };
const cache = { locs: null, species: null, enc: {}, builtin: null };
let unsub = [];
export function dispose() { unsub.forEach((u) => u()); unsub = []; }

async function loadLocs() { if (!cache.locs) cache.locs = await get('/api/locations'); return cache.locs; }
async function loadSpecies() {
  if (!cache.species) { const sp = await get('/api/dex/species?run=none'); cache.species = Object.fromEntries(sp.species.map((s) => [s.id, s])); }
  return cache.species;
}
async function loadEnc(region) { if (!cache.enc[region]) cache.enc[region] = (await get('/api/locations-encounters?region=' + region)).rows; return cache.enc[region]; }
async function loadBuiltin() { if (!cache.builtin) cache.builtin = await get('/api/maps/builtin'); return cache.builtin; }

export function filtersActive() { return !!(f.species || f.type || f.method || f.horde || f.time || f.season); }
/** Encounter rows of one region that pass the current row-level filters. Row: [loc, sid, method, horde, season, times, min, max]. */
export function rowPasses(r, species, flt = f) {
  if (flt.species && r[1] !== flt.species) return false;
  if (flt.type && !((species[r[1]] || {}).types || []).includes(flt.type)) return false;
  if (flt.method && r[2] !== flt.method) return false;
  if (flt.horde && !r[3]) return false;
  if (flt.time && !(r[5] & TIMES.find((x) => x[0] === flt.time)[2])) return false;
  if (flt.season && !(r[4] === flt.season || r[4] === 'Any' || r[4] === '')) return false;
  return true;
}

/** "Route 2" < "Route 10"; text compared case-insensitively. */
export function naturalCompare(a, b) {
  const ax = String(a).toLowerCase().match(/(\d+|\D+)/g) || [];
  const bx = String(b).toLowerCase().match(/(\d+|\D+)/g) || [];
  for (let i = 0; i < Math.min(ax.length, bx.length); i++) {
    const x = ax[i], y = bx[i];
    if (x === y) continue;
    const nx = /^\d/.test(x), ny = /^\d/.test(y);
    if (nx && ny) return Number(x) - Number(y);
    if (nx !== ny) return nx ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return ax.length - bx.length;
}

/** Categories of a directory entry (a place may be in several, e.g. Seafoam Islands = cave + island). */
export function categoriesOf(kind, name) {
  const c = new Set();
  if (kind === 'route' || kind === 'sea') c.add('routes');
  if (kind === 'town') c.add('towns');
  if (kind === 'cave' || /\b(Cave|Tunnel|Cavern|Underpass|Mt\.|Mountain|Falls|Den|Mine|Chamber|Victory Road|Ice Path|Fiery Path|Hole)\b/.test(name)) c.add('caves');
  if (/\b(Forest|Woods)\b/.test(name)) c.add('forests');
  if (kind !== 'town' && /\b(Island|Islands|Isle)\b/.test(name)) c.add('islands');
  if (!c.size) c.add('special');
  return [...c];
}

/** Directory entries: one per place (floors / sections of the same place stay together as tabs). */
export function buildEntries(locations, builtin) {
  const locById = Object.fromEntries(locations.map((l) => [l.id, l]));
  const out = [];
  const seen = new Set();
  for (const m of builtin.maps.filter((x) => x.style !== 'game')) {
    const sub = m.id.startsWith('sevii') ? 'sevii' : 'main';
    for (const ft of m.features) {
      const ids = ft.location_ids.filter((i) => locById[i]);
      ids.forEach((i) => seen.add(i));
      out.push({ key: `${m.region}:${ft.id}`, feature: ft.id, name: ft.name, region: m.region, sub, kind: ft.kind,
        cats: categoriesOf(ft.kind === 'list' ? 'area' : ft.kind, ft.name), location_ids: ids.sort((a, b) => naturalCompare(locById[a].name, locById[b].name)) });
    }
  }
  for (const l of locations) {   // anything not grouped by the layout data still gets its own entry
    if (seen.has(l.id)) continue;
    out.push({ key: l.id, feature: null, name: l.name, region: l.region, sub: 'main', kind: 'area', cats: categoriesOf('area', l.name), location_ids: [l.id] });
  }
  return out;
}

const KIND_LABEL = { town: 'Town / city', route: 'Route', sea: 'Water route', cave: 'Cave / dungeon', landmark: 'Building / landmark', area: 'Area', list: 'Several places' };

// ===================================================================== page
export async function render(el, route) {
  dispose();
  const q = route.query || new URLSearchParams();
  let region = q.get('region') || setting('locations.region') || 'kanto';
  if (region !== 'all' && !REGIONS.includes(region)) region = 'kanto';
  let sel = route.parts[1] ? decodeURIComponent(route.parts[1]) : null;
  if (sel && REGIONS.includes(sel.split(':')[0])) region = sel.split(':')[0];
  if (q.get('species')) f.species = Number(q.get('species')) || null;
  const page = h('div', { class: 'page flush loc-page' });
  mount(el, page);
  page.append(h('div', { class: 'page-head', style: { padding: '14px 18px 4px' } },
    h('button', { class: 'btn ghost', onclick: () => go('#/tools') }, icon('back'), t('tools.title')),
    h('div', null, h('h1', null, t('loc.title')), h('div', { class: 'sub' }, 'Every PokeMMO location with its wild encounters — search a place or a Pokémon. Built in, offline.')),
    h('div', { class: 'actions' }, pinButton({ kind: 'tool', id: 'locations' }), popoutButton('locations'))));
  const host = h('div', { class: 'loc-host' });
  page.append(host);
  await explorer(host, { region, sel, variant: 'page', nav: go });
}

/** The directory, shared by the page and the popout. */
export async function explorer(host, { region, sel, variant = 'page', nav = go }) {
  unsub.forEach((u) => u()); unsub = [];
  const data = await loadLocs();
  const [species, built] = await Promise.all([loadSpecies().catch(() => ({})), loadBuiltin()]);
  const regionsNeeded = region === 'all' || f.species ? REGIONS : [region];
  await Promise.all(regionsNeeded.map(loadEnc));
  const entries = buildEntries(data.locations, built);
  const locById = Object.fromEntries(data.locations.map((l) => [l.id, l]));
  const wrap = h('div', { class: `loc-dir v-${variant}` });
  mount(host, wrap);
  let selected = null;

  // ---- which locations pass the filters (row-level filters use the compact encounter rows)
  function passingLocations() {
    if (!filtersActive()) return null;
    const ok = new Set();
    for (const r of REGIONS) for (const row of cache.enc[r] || []) if (rowPasses(row, species)) ok.add(row[0]);
    return ok;
  }
  function visibleEntries(reg) {
    const ok = passingLocations();
    const q = f.q.trim().toLowerCase();
    return entries.filter((e) => (reg === 'all' || e.region === reg)).filter((e) => {
      const ids = ok ? e.location_ids.filter((i) => ok.has(i)) : e.location_ids;
      if (ok && !ids.length) return false;
      if (!q) return true;
      if (e.name.toLowerCase().includes(q) || e.location_ids.some((i) => locById[i].name.toLowerCase().includes(q))) return true;
      return ids.some((i) => locById[i].species.some((sid) => ((species[sid] || {}).name || '').toLowerCase().includes(q)));
    });
  }

  // ---- region tabs (+ "All regions"), with match counts when searching / filtering
  const tabsEl = h('div', { class: 'tabs loc-tabs', role: 'tablist', 'aria-label': 'Region' });
  function drawTabs() {
    const searching = filtersActive() || f.q.trim();
    mount(tabsEl, [...REGIONS, 'all'].map((r) => h('button', { class: 'tab' + (r === region ? ' active' : ''), role: 'tab', 'aria-selected': String(r === region), dataset: { region: r },
      onclick: async () => { region = r; if (r !== 'all') saveSettings({ 'locations.region': r }).catch(() => {}); ui.sub = 'all'; await Promise.all((r === 'all' ? REGIONS : [r]).map(loadEnc)); closeDetail(); draw(); } },
    r === 'all' ? 'All regions' : cap(r), searching ? h('span', { class: 'count' }, visibleEntries(r).length) : null)));
  }

  // ---- filters
  const methods = [...new Set(data.locations.flatMap((l) => l.methods))].sort(naturalCompare);
  const sel_ = (label, key, opts) => h('select', { class: 'input', 'aria-label': label, onchange: (e) => { f[key] = e.target.value; draw(); } },
    opts.map(([v, l]) => h('option', { value: v, selected: f[key] === v ? 'selected' : null }, l)));
  const pokeIn = h('input', { class: 'input', list: 'loc-species-dl', placeholder: 'Pokémon (name or #)', 'aria-label': 'Pokémon', autocomplete: 'off',
    value: f.species && species[f.species] ? species[f.species].name : '' });
  const dl = h('datalist', { id: 'loc-species-dl' }, Object.values(species).map((s) => h('option', { value: s.name }, '#' + pad3(s.id))));
  pokeIn.addEventListener('change', async () => {
    const v = pokeIn.value.trim().toLowerCase().replace(/^#/, '');
    const s = Object.values(species).find((x) => x.name.toLowerCase() === v) || (/^\d+$/.test(v) ? species[Number(v)] : null);
    f.species = s ? s.id : null;
    if (s) { pokeIn.value = s.name; await Promise.all(REGIONS.map(loadEnc)); }
    draw();
  });
  const pokeCard = h('div', { class: 'loc-poke' });
  const searchIn = h('input', { class: 'input', type: 'search', value: f.q, placeholder: 'Search a location or Pokémon', 'aria-label': 'Search locations', oninput: debounce((e) => { f.q = e.target.value; draw(); }, 120) });
  const hordeChip = h('button', { class: 'chip btnlike' + (f.horde ? ' active' : ''), 'aria-pressed': String(f.horde), onclick: (e) => { f.horde = !f.horde; e.currentTarget.classList.toggle('active', f.horde); e.currentTarget.setAttribute('aria-pressed', String(f.horde)); draw(); } }, 'Hordes only');
  const searchBox = h('div', { class: 'search loc-search', role: 'search' }, icon('search'), searchIn);
  const filters = h('div', { class: 'loc-filters' },
    h('div', { class: 'field' }, pokeIn, dl), pokeCard,
    h('div', { class: 'loc-filter-grid' },
      sel_('Type', 'type', [['', 'Any type'], ...TYPE_LIST.map((x) => [x, cap(x)])]),
      sel_('Encounter type', 'method', [['', 'Any encounter type'], ...methods.map((m) => [m, m])]),
      sel_('Time of day', 'time', [['', 'Any time'], ...TIMES.map(([v, l]) => [v, l])]),
      sel_('Season', 'season', [['', 'Any season'], ...['Spring', 'Summer', 'Autumn', 'Winter'].map((s) => [s, s])]), hordeChip),
    h('button', { class: 'btn small ghost', onclick: () => { Object.assign(f, { q: '', species: null, type: '', method: '', horde: false, time: '', season: '' }); ui.cat = 'all'; explorer(host, { region, sel: null, variant, nav }); } }, icon('close'), 'Clear filters'));
  const filterToggle = h('button', { class: 'btn small loc-filter-toggle', 'aria-expanded': 'false', onclick: (e) => { const open = wrap.classList.toggle('filters-open'); e.currentTarget.setAttribute('aria-expanded', String(open)); } }, icon('filter'), h('span', null, 'Filters'));

  // ---- list
  const catsEl = h('div', { class: 'loc-cats', role: 'tablist', 'aria-label': 'Kind of place' });
  const subsEl = h('div', { class: 'loc-subs' });
  const count = h('div', { class: 'tiny muted loc-count', 'aria-live': 'polite' });
  const listEl = h('div', { class: 'loc-cards', role: 'list' });
  const listPane = h('div', { class: 'loc-listpane' }, subsEl, catsEl, count, listEl);
  const detail = h('div', { class: 'loc-detail-pane' });

  function drawPokeCard() {
    const s = f.species && species[f.species];
    mount(pokeCard, s ? h('div', { class: 'row tight' }, sizedSprite(s, 40, { still: s.still, url: s.icon, tier: s.size || 'm' }),
      h('div', { class: 'grow' }, h('div', { class: 'small' }, s.name, h('span', { class: 'tiny muted' }, ' #' + pad3(s.id))), typeChips(s.types, true)),
      h('button', { class: 'btn small ghost', onclick: () => nav('#/pokedex/' + s.id + '?tab=locations') }, 'Summary'),
      h('button', { class: 'icon-btn', 'aria-label': 'Clear Pokémon', onclick: () => { f.species = null; pokeIn.value = ''; draw(); } }, icon('close'))) : null);
  }
  function card(e, ok) {
    const ids = ok ? e.location_ids.filter((i) => ok.has(i)) : e.location_ids;
    const sp = new Set(ids.flatMap((i) => locById[i].species));
    const meth = [...new Set(ids.flatMap((i) => locById[i].methods))];
    return h('button', { class: 'loc-card' + (selected && selected.key === e.key ? ' selected' : '') + (e.location_ids.length ? '' : ' empty'), role: 'listitem', dataset: { key: e.key, feature: e.feature || '' },
      onclick: () => openEntry(e) },
    h('span', { class: 'loc-card-name' }, e.name),
    h('span', { class: 'tiny muted' }, e.location_ids.length ? [
      e.location_ids.length > 1 ? `${e.location_ids.length} sections · ` : '', `${sp.size} Pokémon`, meth.length ? ' · ' + meth.slice(0, 3).join(', ') + (meth.length > 3 ? '…' : '') : ''] : 'No wild Pokémon listed'),
    region === 'all' ? h('span', { class: 'chip tiny' }, cap(e.region)) : null);
  }
  function draw() {
    const nActive = [f.species, f.type, f.method, f.horde, f.time, f.season].filter(Boolean).length;
    filterToggle.lastChild.textContent = nActive ? `Filters (${nActive})` : 'Filters';
    drawTabs();
    drawPokeCard();
    const ok = passingLocations();
    let list = visibleEntries(region);
    // sub-regions (Kanto mainland / Sevii Islands)
    const hasSevii = region === 'kanto' && list.some((e) => e.sub === 'sevii');
    mount(subsEl, region === 'kanto' ? h('div', { class: 'seg small', role: 'tablist', 'aria-label': 'Sub-region' }, [['all', 'All of Kanto'], ['main', 'Mainland'], ['sevii', 'Sevii Islands']].map(([v, l]) =>
      h('button', { class: ui.sub === v ? 'active' : '', role: 'tab', 'aria-selected': String(ui.sub === v), dataset: { sub: v }, onclick: () => { ui.sub = v; draw(); } }, l))) : null);
    if (region === 'kanto' && ui.sub !== 'all') list = list.filter((e) => e.sub === ui.sub);
    void hasSevii;
    // only show entries without encounters when not filtering by encounter details
    if (ok || f.q.trim()) list = list.filter((e) => e.location_ids.length);
    const byCat = Object.fromEntries(CATEGORIES.map(([c]) => [c, c === 'all' ? list.length : list.filter((e) => e.cats.includes(c)).length]));
    mount(catsEl, CATEGORIES.filter(([c]) => c === 'all' || byCat[c]).map(([c, l]) => h('button', { class: 'chip btnlike' + (ui.cat === c ? ' active' : ''), role: 'tab', 'aria-selected': String(ui.cat === c), dataset: { cat: c },
      onclick: () => { ui.cat = c; draw(); } }, l, h('span', { class: 'count' }, byCat[c]))));
    if (ui.cat !== 'all') list = list.filter((e) => e.cats.includes(ui.cat));
    const regTotal = entries.filter((e) => (region === 'all' || e.region === region) && e.location_ids.length).length;
    const locCount = new Set(list.flatMap((e) => e.location_ids)).size;
    count.textContent = `${list.length} place${list.length === 1 ? '' : 's'} (${locCount} encounter area${locCount === 1 ? '' : 's'}) · ${regTotal} places with wild Pokémon in ${region === 'all' ? 'all regions' : cap(region)}`;
    const sorted = [...list].sort((a, b) => (region === 'all' ? REGIONS.indexOf(a.region) - REGIONS.indexOf(b.region) : 0) || naturalCompare(a.name, b.name));
    if (!sorted.length) { mount(listEl, h('div', { class: 'empty' }, 'No locations match. ', h('button', { class: 'btn small ghost', onclick: () => { Object.assign(f, { q: '', species: null, type: '', method: '', horde: false, time: '', season: '' }); ui.cat = 'all'; explorer(host, { region, sel: null, variant, nav }); } }, 'Clear filters'))); return; }
    if (region === 'all') {
      mount(listEl, REGIONS.filter((r) => sorted.some((e) => e.region === r)).map((r) => h('section', { class: 'loc-group' },
        h('h3', { class: 'loc-group-head' }, cap(r), h('span', { class: 'tiny muted' }, ` · ${sorted.filter((e) => e.region === r).length}`)),
        h('div', { class: 'loc-card-grid' }, sorted.filter((e) => e.region === r).map((e) => card(e, ok))))));
    } else if (ui.cat === 'all' && !f.q.trim() && !ok) {
      // "All locations": one section per kind of place, routes in natural order
      const order = ['towns', 'routes', 'caves', 'forests', 'islands', 'special'];
      const prim = (e) => order.find((c) => e.cats.includes(c)) || 'special';
      mount(listEl, order.filter((c) => sorted.some((e) => prim(e) === c)).map((c) => h('section', { class: 'loc-group', dataset: { cat: c } },
        h('h3', { class: 'loc-group-head' }, CATEGORIES.find((x) => x[0] === c)[1], h('span', { class: 'tiny muted' }, ` · ${sorted.filter((e) => prim(e) === c).length}`)),
        h('div', { class: 'loc-card-grid' }, sorted.filter((e) => prim(e) === c).map((e) => card(e, ok))))));
    } else mount(listEl, h('div', { class: 'loc-card-grid' }, sorted.map((e) => card(e, ok))));
  }

  // ---- detail
  // Who scrolls the directory: its own pane on wide windows, the whole explorer when narrow.
  const listScroller = () => (wrap.classList.contains('narrow') ? wrap : listPane);
  let savedScroll = 0;
  function closeDetail() {
    const key = selected && selected.key;
    selected = null;
    wrap.classList.remove('has-sel');
    mount(detail, null);
    for (const b of listEl.querySelectorAll('.loc-card.selected')) b.classList.remove('selected');
    if (variant === 'page' && location.hash.startsWith('#/tools/locations/')) history.replaceState(null, '', '#/tools/locations');
    // back to exactly where you were in the directory, with the card you came from focused
    listScroller().scrollTop = savedScroll;
    const cardEl = key && listEl.querySelector(`.loc-card[data-key="${CSS.escape(key)}"]`);
    if (cardEl) cardEl.focus({ preventScroll: true });
  }
  async function openEntry(e, focusLoc) {
    if (!wrap.classList.contains('has-sel') || !wrap.classList.contains('narrow')) savedScroll = listScroller().scrollTop;
    selected = e;
    wrap.classList.add('has-sel');
    for (const b of listEl.querySelectorAll('.loc-card')) b.classList.toggle('selected', b.dataset.key === e.key);
    const ids = e.location_ids;
    const ok = passingLocations();
    const first = focusLoc && ids.includes(focusLoc) ? focusLoc : (ok && ids.find((i) => ok.has(i))) || ids[0];
    if (variant === 'page') history.replaceState(null, '', '#/tools/locations/' + encodeURIComponent(first || 'place:' + e.key));
    const body = h('div');
    const head = h('div', { class: 'detail-head' }, h('div', { class: 'grow' },
      h('div', { class: 'row' }, h('button', { class: 'btn ghost small loc-back', onclick: closeDetail }, icon('back'), 'All locations'),
        h('span', { class: 'chip' }, cap(e.region)), e.sub === 'sevii' ? h('span', { class: 'chip tiny' }, 'Sevii Islands') : null,
        h('span', { class: 'chip tiny' }, KIND_LABEL[e.kind] || 'Place'), h('span', { class: 'grow' }),
        h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: closeDetail }, icon('close'))),
      h('h2', null, e.name)));
    mount(detail, h('div', { class: 'loc-detail', dataset: { key: e.key } }, head,
      ids.length > 1 ? h('div', { class: 'tabs loc-subareas', role: 'tablist', 'aria-label': 'Floors and sections' }, ids.map((id) => h('button', {
        class: 'tab' + (id === first ? ' active' : ''), role: 'tab', 'aria-selected': String(id === first), dataset: { loc: id },
        onclick: (ev) => { for (const b of detail.querySelectorAll('.loc-subareas .tab')) { b.classList.toggle('active', b === ev.currentTarget); b.setAttribute('aria-selected', String(b === ev.currentTarget)); }
          renderLocation(body, id, { popout: variant !== 'page', nav, embedded: true }); } },
      subName(locById[id].name, e.name), ok && ok.has(id) ? h('span', { class: 'count' }, '●') : null))) : null,
      ids.length ? body : notice('info', `No wild Pokémon are listed for ${e.name} in the PokeMMO data. Nothing is guessed here.`)));
    if (ids.length) await renderLocation(body, first, { popout: variant !== 'page', nav, embedded: true });
    if (wrap.classList.contains('narrow')) wrap.scrollTop = 0; else detail.scrollTop = 0;
  }

  // ---- layout: list + detail side by side when wide, detail replaces the list when narrow
  wrap.append(tabsEl, h('div', { class: 'loc-dir-grid' }, h('div', { class: 'loc-left' }, h('div', { class: 'loc-searchrow' }, searchBox, filterToggle), filters), listPane, detail));
  // Layout from the explorer's real width: wide = filters | list | detail, medium = folded filters, list | detail,
  // narrow = one column where the detail replaces the list. The card at the top of the list stays in view across changes.
  const ro = new ResizeObserver(() => {
    const w = wrap.clientWidth, popout = variant !== 'page';
    const mode = w < (popout ? 760 : 900) ? 'narrow' : w < (popout ? 1100 : 1240) ? 'medium' : 'wide';
    if (wrap.dataset.mode === mode) return;
    const sc = wrap.dataset.mode ? listScroller() : null;
    const anchor = sc && [...listEl.querySelectorAll('.loc-card')].find((c) => c.getBoundingClientRect().top >= sc.getBoundingClientRect().top);
    wrap.dataset.mode = mode;
    wrap.classList.toggle('narrow', mode === 'narrow');
    wrap.classList.toggle('medium', mode === 'medium');
    if (anchor && !(mode === 'narrow' && selected)) anchor.scrollIntoView({ block: 'nearest' });
  });
  ro.observe(wrap);
  unsub.push(() => ro.disconnect());
  draw();
  if (sel) {
    const key = sel.startsWith('place:') ? sel.slice(6) : null;
    const e = key ? entries.find((x) => x.key === key) : entries.find((x) => x.location_ids.includes(sel));
    if (e) { if (region !== 'all' && e.region !== region) { region = e.region; draw(); } await openEntry(e, key ? null : sel); }
  }
}

/** "Mt. Moon (B1F)" under "Mt. Moon" → "B1F". */
function subName(name, featureName) {
  if (name.startsWith(featureName + ' (')) return name.slice(featureName.length + 2, -1);
  return name;
}

// ===================================================================== location detail
const on_ = (x) => !!x && x.kind !== 'none';
function rate(r) {
  if (!r || r.kind === 'none') return h('td', { class: 'rate none', title: r ? 'Not encountered at this time of day' : '' }, '—');
  return h('td', { class: 'rate ' + (r.kind || ''), title: r.raw || '' }, r.label);
}

export async function renderLocation(pane, id, { back, popout, nav, onMap, embedded } = {}) {
  let d;
  try { d = await get('/api/locations/' + encodeURIComponent(id)); } catch (e) { mount(pane, h('div', { class: 'detail-body' }, notice('bad', 'Location not found in your installed data.'))); return; }
  const go_ = nav || (popout ? openRoute : go);
  const species = await loadSpecies().catch(() => ({}));
  let all = false;
  const body = h('div', { class: 'detail-body stack' });
  const draw = () => {
    const flt = { ...f };
    const rows = d.rows.filter((r) => all || !filtersActive() || rowPasses([id, r.species_id, r.method, r.horde5 ? 5 : r.horde3 ? 3 : 0, r.season || '',
      (on_(r.morning) ? 1 : 0) | (on_(r.day) ? 2 : 0) | (on_(r.night) ? 4 : 0)], species, flt));
    // Serebii-like structure: one table per encounter method; rows that differ only by season are merged.
    const byMethod = new Map();
    for (const r of rows) {
      const key = [r.species_id, r.min, r.max, r.horde3, r.horde5, (r.morning || {}).label, (r.day || {}).label, (r.night || {}).label].join('|');
      const m = byMethod.get(r.method) || byMethod.set(r.method, new Map()).get(r.method);
      const prev = m.get(key);
      if (prev) { if (r.season && !prev.seasons.includes(r.season)) prev.seasons.push(r.season); } else m.set(key, { ...r, seasons: r.season ? [r.season] : [] });
    }
    const seasonText = (ss) => (!ss.length || ss.includes('Any') || ss.length === 4 ? 'All year' : ss.join(', '));
    mount(body,
      filtersActive() ? h('div', { class: 'row tight small' }, h('span', { class: 'muted' }, `${rows.length} of ${d.rows.length} rows match your filters`),
        h('button', { class: 'btn small ghost', onclick: () => { all = !all; draw(); } }, all ? 'Only matching' : 'Show all')) : null,
      [...byMethod.entries()].map(([method, m]) => h('section', { class: 'loc-method', dataset: { method } },
        h('h3', { class: 'loc-method-head' }, method, h('span', { class: 'tiny muted' }, ` · ${new Set([...m.values()].map((r) => r.species_id)).size} Pokémon`)),
        h('div', { class: 'table-scroll' }, h('table', { class: 'table compact loc-enc' }, h('thead', null, h('tr', null, ['', 'Pokémon', 'Lv', 'Season', 'Morning', 'Day', 'Night'].map((c) => h('th', null, c)))),
          h('tbody', null, [...m.values()].sort((x, y) => x.name.localeCompare(y.name)).map((r) => {
            const sp = species[r.species_id] || { id: r.species_id, name: r.name, types: r.types, icon: r.icon };
            return h('tr', { dataset: { sid: r.species_id } },
              h('td', { class: 'loc-sprite' }, sizedSprite(sp, 36, { still: sp.still, url: sp.icon || r.icon, tier: sp.size || 'm' })),
              h('td', null, h('a', { href: '#/pokedex/' + r.species_id, onclick: (e) => { e.preventDefault(); go_('#/pokedex/' + r.species_id + '?tab=locations'); } }, r.name),
                h('span', { class: 'tiny muted' }, ' #' + pad3(r.species_id)), r.horde5 ? h('span', { class: 'chip tiny' }, 'Horde ×5') : r.horde3 ? h('span', { class: 'chip tiny' }, 'Horde ×3') : null,
                h('div', null, typeChips(r.types || sp.types || [], true))),
              h('td', { class: 'nowrap' }, r.min === r.max ? r.min : `${r.min}–${r.max}`),
              h('td', { class: 'small' }, seasonText(r.seasons)), rate(r.morning), rate(r.day), rate(r.night));
          })))))),
      !rows.length ? h('div', { class: 'empty small' }, 'No rows match the current filters.') : null,
      h('div', { class: 'tiny muted' }, d.provenance, ' Rarity labels are shown exactly as the data gives them; “Not in this period” means not encountered at that time of day.'),
      d.guides.length ? h('div', { class: 'stack tight' }, h('span', { class: 'label' }, 'Your guides for this location'), d.guides.map((g) => h('button', { class: 'tool-link', onclick: () => go_('#/guides/mine/' + g.id) }, icon('list'), g.title))) : null,
      linkedNotes('location', d.id, `${d.name} (${cap(d.region)})`));
  };
  if (embedded) {
    mount(pane, h('div', { class: 'loc-sub-head small muted' }, h('strong', { class: 'loc-sub-name' }, d.name), ` · ${new Set(d.rows.map((r) => r.species_id)).size} Pokémon · ${d.rows.length} encounter rows`), body);
    draw();
    return;
  }
  mount(pane, h('div', { class: 'detail-head' }, h('div', { class: 'grow' },
    h('div', { class: 'row' }, h('span', { class: 'chip' }, cap(d.region)),
      h('span', { class: 'grow' }), back ? h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: back }, icon('close')) : null),
    h('h2', null, d.name), h('div', { class: 'small muted' }, `${new Set(d.rows.map((r) => r.species_id)).size} Pokémon · ${d.rows.length} encounter rows`))), body);
  draw();
  void typeChip;
}

// ===================================================================== popout
export async function renderLocationsPopout(el, mode) {
  const data = await loadLocs();
  const m = location.hash.match(/^#\/loc\/(.+)$/);
  if (m) {
    const pane = h('div');
    mount(el, h('button', { class: 'btn ghost small', onclick: () => { location.hash = '#/'; } }, icon('back'), t('common.back')), pane);
    await renderLocation(pane, decodeURIComponent(m[1]), { popout: true });
    return;
  }
  const region = setting('locations.region') && REGIONS.includes(setting('locations.region')) ? setting('locations.region') : 'kanto';
  await explorer(el, { region, sel: null, variant: mode || 'standard', nav: openRoute });
}
