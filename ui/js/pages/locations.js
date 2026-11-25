import { number, plural, t as translateUI, uiLabel } from '../i18n.js';
import { compareLabels, findSpecies, gameTerm, matchesTerm, speciesLabel, speciesMatches } from '../game-locale.js';
// Location explorer: a searchable directory of every PokeMMO location, grouped by region, sub-region (Sevii Islands)
// and kind of place, with the full encounter tables. Data: the built-in PokeMMO reference (or your own client
// data when you imported it). The interactive map work (artwork, geometry, personal marks) is kept in the
// repository and database but is no longer part of this page (owner decision, 2026-11-24).
import { h, mount, icon, get, debounce, cap, pad3, typeChips, notice, sizedSprite, TYPE_LIST, setting, saveSettings } from '../core.js';
import { animatedIn, scaled } from '../sprites.js';
import { go, popoutButton, pinButton } from '../shell.js';
import { t } from '../i18n.js';
import { linkedNotes, openRoute } from '../links.js';

export const REGIONS = ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova'];
const TIMES = [['morning', 'ui.morning', 1], ['day', 'ui.day', 2], ['night', 'ui.night', 4]];
export const CATEGORIES = [['all', 'ui.loc_all_locations'], ['routes', 'ui.loc_routes'], ['towns', 'ui.loc_towns'], ['caves', 'ui.loc_caves'], ['forests', 'ui.loc_forests'],
  ['islands', 'ui.loc_islands'], ['special', 'ui.loc_special_areas']];
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

const KIND_LABEL = { town: 'ui.loc_kind_town', route: 'ui.loc_kind_route', sea: 'ui.loc_kind_sea', cave: 'ui.loc_kind_cave', landmark: 'ui.loc_kind_landmark', area: 'ui.loc_kind_area', list: 'ui.loc_kind_list' };

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
    h('div', null, h('h1', null, t('loc.title')), h('div', { class: 'sub' }, translateUI('ui.loc_intro'))),
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
      if (matchesTerm('location', e.name, q) || e.location_ids.some((i) => matchesTerm('location', locById[i].name, q))) return true;
      return ids.some((i) => locById[i].species.some((sid) => speciesMatches({ id: sid, name: species[sid]?.name }, q)));
    });
  }

  // ---- region tabs (+ "All regions"), with match counts when searching / filtering
  const tabsEl = h('div', { class: 'tabs loc-tabs', role: 'tablist', 'aria-label': translateUI('ui.region') });
  function drawTabs() {
    const searching = filtersActive() || f.q.trim();
    mount(tabsEl, [...REGIONS, 'all'].map((r) => h('button', { class: 'tab' + (r === region ? ' active' : ''), role: 'tab', 'aria-selected': String(r === region), dataset: { region: r },
      onclick: async () => { region = r; if (r !== 'all') saveSettings({ 'locations.region': r }).catch(() => {}); ui.sub = 'all'; await Promise.all((r === 'all' ? REGIONS : [r]).map(loadEnc)); closeDetail(); draw(); } },
    r === 'all' ? translateUI('ui.all_regions') : gameTerm('region', cap(r)), searching ? h('span', { class: 'count' }, visibleEntries(r).length) : null)));
  }

  // ---- filters
  const methods = [...new Set(data.locations.flatMap((l) => l.methods))].sort(naturalCompare);
  const sel_ = (label, key, opts) => h('select', { class: 'input', 'aria-label': label, onchange: (e) => { f[key] = e.target.value; draw(); } },
    opts.map(([v, l]) => h('option', { value: v, selected: f[key] === v ? 'selected' : null }, l)));
  const pokeIn = h('input', { class: 'input', list: 'loc-species-dl', placeholder: translateUI('ui.loc_picker'), 'aria-label': translateUI('ui.pokemon'), autocomplete: 'off',
    value: f.species && species[f.species] ? speciesLabel(f.species, species[f.species].name) : '' });
  const dl = h('datalist', { id: 'loc-species-dl' }, Object.values(species).map((s) => h('option', { value: speciesLabel(s.id, s.name) }, '#' + pad3(s.id))));
  pokeIn.addEventListener('change', async () => {
    const s = findSpecies(Object.values(species), pokeIn.value);
    f.species = s ? s.id : null;
    if (s) { pokeIn.value = speciesLabel(s.id, s.name); await Promise.all(REGIONS.map(loadEnc)); }
    draw();
  });
  const pokeCard = h('div', { class: 'loc-poke' });
  const searchIn = h('input', { class: 'input', type: 'search', value: f.q, placeholder: translateUI('ui.loc_search'), 'aria-label': translateUI('ui.search_location'), oninput: debounce((e) => { f.q = e.target.value; draw(); }, 120) });
  const hordeChip = h('button', { class: 'chip btnlike' + (f.horde ? ' active' : ''), 'aria-pressed': String(f.horde), onclick: (e) => { f.horde = !f.horde; e.currentTarget.classList.toggle('active', f.horde); e.currentTarget.setAttribute('aria-pressed', String(f.horde)); draw(); } }, translateUI('ui.loc_hordes_only'));
  const searchBox = h('div', { class: 'search loc-search', role: 'search' }, icon('search'), searchIn);
  const filters = h('div', { class: 'loc-filters' },
    h('div', { class: 'field' }, pokeIn, dl), pokeCard,
    h('div', { class: 'loc-filter-grid' },
      sel_(translateUI('ui.type'), 'type', [['', translateUI('ui.loc_any_type')], ...TYPE_LIST.map((x) => [x, gameTerm('type', cap(x))])]),
      sel_(translateUI('ui.loc_method'), 'method', [['', translateUI('ui.loc_any_method')], ...methods.map((m) => [m, gameTerm('encounter', m)])]),
      sel_(translateUI('ui.loc_time'), 'time', [['', translateUI('ui.loc_any_time')], ...TIMES.map(([value, key]) => [value, translateUI(key)])]),
      sel_(translateUI('ui.season'), 'season', [['', translateUI('ui.loc_any_season')], ...['Spring', 'Summer', 'Autumn', 'Winter'].map((season) => [season, uiLabel(season)])]), hordeChip),
    h('button', { class: 'btn small ghost', onclick: () => { Object.assign(f, { q: '', species: null, type: '', method: '', horde: false, time: '', season: '' }); ui.cat = 'all'; explorer(host, { region, sel: null, variant, nav }); } }, icon('close'), translateUI('ui.loc_clear_filters')));
  const filterToggle = h('button', { class: 'btn small loc-filter-toggle', 'aria-expanded': 'false', onclick: (e) => { const open = wrap.classList.toggle('filters-open'); e.currentTarget.setAttribute('aria-expanded', String(open)); } }, icon('filter'), h('span', null, translateUI('ui.filters')));

  // ---- list
  const catsEl = h('div', { class: 'loc-cats', role: 'tablist', 'aria-label': translateUI('ui.loc_place_kind') });
  const subsEl = h('div', { class: 'loc-subs' });
  const count = h('div', { class: 'tiny muted loc-count', 'aria-live': 'polite' });
  const listEl = h('div', { class: 'loc-cards', role: 'list' });
  const listPane = h('div', { class: 'loc-listpane' }, subsEl, catsEl, count, listEl);
  const detail = h('div', { class: 'loc-detail-pane' });

  function drawPokeCard() {
    const s = f.species && species[f.species];
    mount(pokeCard, s ? h('div', { class: 'row tight' }, sizedSprite(s, 40, { still: s.still, url: s.icon, tier: s.size || 'm' }),
      h('div', { class: 'grow' }, h('div', { class: 'small' }, speciesLabel(s.id, s.name), h('span', { class: 'tiny muted' }, ' #' + pad3(s.id))), typeChips(s.types, true)),
      h('button', { class: 'btn small ghost', onclick: () => nav('#/pokedex/' + s.id + '?tab=locations') }, translateUI('ui.summary')),
      h('button', { class: 'icon-btn', 'aria-label': translateUI('ui.loc_clear_pokemon'), onclick: () => { f.species = null; pokeIn.value = ''; draw(); } }, icon('close'))) : null);
  }
  function card(e, ok) {
    const ids = ok ? e.location_ids.filter((i) => ok.has(i)) : e.location_ids;
    const sp = new Set(ids.flatMap((i) => locById[i].species));
    const meth = [...new Set(ids.flatMap((i) => locById[i].methods))];
    return h('button', { class: 'loc-card' + (selected && selected.key === e.key ? ' selected' : '') + (e.location_ids.length ? '' : ' empty'), role: 'listitem', dataset: { key: e.key, feature: e.feature || '' },
      onclick: () => openEntry(e) },
    h('span', { class: 'loc-card-name' }, gameTerm('location', e.name)),
    h('span', { class: 'tiny muted' }, e.location_ids.length ? [
      e.location_ids.length > 1 ? translateUI('ui.loc_sections', { count: number(e.location_ids.length) }) + ' · ' : '', translateUI('ui.loc_pokemon_count', { count: number(sp.size) }), meth.length ? ' · ' + meth.slice(0, 3).map((m) => gameTerm('encounter', m)).join(', ') + (meth.length > 3 ? '…' : '') : ''] : translateUI('ui.loc_no_wild')),
    region === 'all' ? h('span', { class: 'chip tiny' }, gameTerm('region', cap(e.region))) : null);
  }
  function draw() {
    const nActive = [f.species, f.type, f.method, f.horde, f.time, f.season].filter(Boolean).length;
    filterToggle.lastChild.textContent = nActive ? translateUI('ui.loc_filters_count', { count: number(nActive) }) : translateUI('ui.filters');
    drawTabs();
    drawPokeCard();
    const ok = passingLocations();
    let list = visibleEntries(region);
    // sub-regions (Kanto mainland / Sevii Islands)
    const hasSevii = region === 'kanto' && list.some((e) => e.sub === 'sevii');
    mount(subsEl, region === 'kanto' ? h('div', { class: 'seg small', role: 'tablist', 'aria-label': translateUI('ui.loc_sub_region') }, [['all', translateUI('ui.loc_all_kanto')], ['main', translateUI('ui.loc_mainland')], ['sevii', translateUI('ui.loc_sevii')]].map(([v, l]) =>
      h('button', { class: ui.sub === v ? 'active' : '', role: 'tab', 'aria-selected': String(ui.sub === v), dataset: { sub: v }, onclick: () => { ui.sub = v; draw(); } }, l))) : null);
    if (region === 'kanto' && ui.sub !== 'all') list = list.filter((e) => e.sub === ui.sub);
    void hasSevii;
    // only show entries without encounters when not filtering by encounter details
    if (ok || f.q.trim()) list = list.filter((e) => e.location_ids.length);
    const byCat = Object.fromEntries(CATEGORIES.map(([c]) => [c, c === 'all' ? list.length : list.filter((e) => e.cats.includes(c)).length]));
    mount(catsEl, CATEGORIES.filter(([c]) => c === 'all' || byCat[c]).map(([c, l]) => h('button', { class: 'chip btnlike' + (ui.cat === c ? ' active' : ''), role: 'tab', 'aria-selected': String(ui.cat === c), dataset: { cat: c },
      onclick: () => { ui.cat = c; draw(); } }, translateUI(l), h('span', { class: 'count' }, byCat[c]))));
    if (ui.cat !== 'all') list = list.filter((e) => e.cats.includes(ui.cat));
    const regTotal = entries.filter((e) => (region === 'all' || e.region === region) && e.location_ids.length).length;
    const locCount = new Set(list.flatMap((e) => e.location_ids)).size;
    count.textContent = translateUI('ui.loc_results', {
      places: plural('ui.loc_results_places', list.length), areas: plural('ui.loc_results_areas', locCount),
      wild: number(regTotal), region: region === 'all' ? translateUI('ui.loc_all_regions_lower') : gameTerm('region', cap(region)),
    });
    const sorted = [...list].sort((a, b) => (region === 'all' ? REGIONS.indexOf(a.region) - REGIONS.indexOf(b.region) : 0) || compareLabels(gameTerm('location', a.name), gameTerm('location', b.name)));
    if (!sorted.length) { mount(listEl, h('div', { class: 'empty' }, translateUI('ui.loc_empty'), h('button', { class: 'btn small ghost', onclick: () => { Object.assign(f, { q: '', species: null, type: '', method: '', horde: false, time: '', season: '' }); ui.cat = 'all'; explorer(host, { region, sel: null, variant, nav }); } }, translateUI('ui.loc_clear_filters')))); return; }
    if (region === 'all') {
      mount(listEl, REGIONS.filter((r) => sorted.some((e) => e.region === r)).map((r) => h('section', { class: 'loc-group' },
        h('h3', { class: 'loc-group-head' }, gameTerm('region', cap(r)), h('span', { class: 'tiny muted' }, ` · ${sorted.filter((e) => e.region === r).length}`)),
        h('div', { class: 'loc-card-grid' }, sorted.filter((e) => e.region === r).map((e) => card(e, ok))))));
    } else if (ui.cat === 'all' && !f.q.trim() && !ok) {
      // "All locations": one section per kind of place, routes in natural order
      const order = ['towns', 'routes', 'caves', 'forests', 'islands', 'special'];
      const prim = (e) => order.find((c) => e.cats.includes(c)) || 'special';
      mount(listEl, order.filter((c) => sorted.some((e) => prim(e) === c)).map((c) => h('section', { class: 'loc-group', dataset: { cat: c } },
        h('h3', { class: 'loc-group-head' }, translateUI(CATEGORIES.find((x) => x[0] === c)[1]), h('span', { class: 'tiny muted' }, ` · ${sorted.filter((e) => prim(e) === c).length}`)),
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
      h('div', { class: 'row' }, h('button', { class: 'btn ghost small loc-back', onclick: closeDetail }, icon('back'), translateUI('ui.loc_all_locations')),
        h('span', { class: 'chip' }, gameTerm('region', cap(e.region))), e.sub === 'sevii' ? h('span', { class: 'chip tiny' }, translateUI('ui.loc_sevii')) : null,
        h('span', { class: 'chip tiny' }, translateUI(KIND_LABEL[e.kind] || 'ui.loc_place')), h('span', { class: 'grow' }),
        h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: closeDetail }, icon('close'))),
      h('h2', null, gameTerm('location', e.name))));
    mount(detail, h('div', { class: 'loc-detail', dataset: { key: e.key } }, head,
      ids.length > 1 ? h('div', { class: 'tabs loc-subareas', role: 'tablist', 'aria-label': translateUI('ui.loc_floors') }, ids.map((id) => h('button', {
        class: 'tab' + (id === first ? ' active' : ''), role: 'tab', 'aria-selected': String(id === first), dataset: { loc: id },
        onclick: (ev) => { for (const b of detail.querySelectorAll('.loc-subareas .tab')) { b.classList.toggle('active', b === ev.currentTarget); b.setAttribute('aria-selected', String(b === ev.currentTarget)); }
          renderLocation(body, id, { popout: variant !== 'page', nav, embedded: true }); } },
      subName(locById[id].name, e.name), ok && ok.has(id) ? h('span', { class: 'count' }, '●') : null))) : null,
      ids.length ? body : notice('info', translateUI('ui.loc_no_wild_at', { name: gameTerm('location', e.name) }))));
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
  if (name.startsWith(featureName + ' (')) return gameTerm('location_section', name.slice(featureName.length + 2, -1));
  return gameTerm('location', name);
}

// ===================================================================== location detail
const on_ = (x) => !!x && x.kind !== 'none';
function rate(r) {
  if (!r || r.kind === 'none') return h('td', { class: 'rate none', title: r ? translateUI('ui.loc_unavailable_time') : '' }, '—');
  return h('td', { class: 'rate ' + (r.kind || ''), title: r.raw ? uiLabel(r.label) : '' }, uiLabel(r.label));
}

export async function renderLocation(pane, id, { back, popout, nav, onMap, embedded } = {}) {
  let d;
  try { d = await get('/api/locations/' + encodeURIComponent(id)); } catch (e) { mount(pane, h('div', { class: 'detail-body' }, notice('bad', translateUI('ui.loc_not_found')))); return; }
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
    const seasonText = (ss) => (!ss.length || ss.includes('Any') || ss.length === 4 ? translateUI('ui.loc_all_year') : ss.map(uiLabel).join(', '));
    mount(body,
      filtersActive() ? h('div', { class: 'row tight small' }, h('span', { class: 'muted' }, translateUI('ui.loc_matching_rows', { matches: number(rows.length), total: number(d.rows.length) })),
        h('button', { class: 'btn small ghost', onclick: () => { all = !all; draw(); } }, all ? translateUI('ui.loc_only_matching') : translateUI('ui.loc_show_all'))) : null,
      [...byMethod.entries()].map(([method, m]) => h('section', { class: 'loc-method', dataset: { method } },
        h('h3', { class: 'loc-method-head' }, gameTerm('encounter', method), h('span', { class: 'tiny muted' }, ' · ' + translateUI('ui.loc_pokemon_count', { count: number(new Set([...m.values()].map((r) => r.species_id)).size) }))),
        h('div', { class: 'table-scroll' }, h('table', { class: 'table compact loc-enc' }, h('thead', null, h('tr', null, ['', translateUI('ui.pokemon'), translateUI('ui.loc_level'), translateUI('ui.season'), translateUI('ui.morning'), translateUI('ui.day'), translateUI('ui.night')].map((c) => h('th', null, c)))),
          h('tbody', null, [...m.values()].sort((x, y) => compareLabels(speciesLabel(x.species_id, x.name), speciesLabel(y.species_id, y.name))).map((r) => {
            const sp = species[r.species_id] || { id: r.species_id, name: r.name, types: r.types, icon: r.icon };
            return h('tr', { dataset: { sid: r.species_id } },
              h('td', { class: 'loc-sprite' }, sizedSprite(sp, scaled('locations', 36), { still: sp.still, url: sp.icon || r.icon, tier: sp.size || 'm', ani: animatedIn('locations') ? sp.ani : null })),
              h('td', null, h('a', { href: '#/pokedex/' + r.species_id, onclick: (e) => { e.preventDefault(); go_('#/pokedex/' + r.species_id + '?tab=locations'); } }, speciesLabel(r.species_id, r.name)),
                h('span', { class: 'tiny muted' }, ' #' + pad3(r.species_id)), r.horde5 || r.horde3 ? h('span', { class: 'chip tiny' }, translateUI('ui.loc_horde_count', { count: r.horde5 ? 5 : 3 })) : null,
                h('div', null, typeChips(r.types || sp.types || [], true))),
              h('td', { class: 'nowrap' }, r.min === r.max ? r.min : `${r.min}–${r.max}`),
              h('td', { class: 'small' }, seasonText(r.seasons)), rate(r.morning), rate(r.day), rate(r.night));
          })))))),
      !rows.length ? h('div', { class: 'empty small' }, translateUI('ui.loc_no_rows')) : null,
      h('div', { class: 'tiny muted' }, translateUI(d.source_kind === 'bundled' ? 'ui.loc_provenance_bundled' : 'ui.loc_provenance_private', {
        date: d.dump_date || translateUI('ui.loc_unknown_date'),
      }), translateUI('ui.loc_rarity_help')),
      d.guides.length ? h('div', { class: 'stack tight' }, h('span', { class: 'label' }, translateUI('ui.loc_linked_guides')), d.guides.map((g) => h('button', { class: 'tool-link', onclick: () => go_('#/guides/mine/' + g.id) }, icon('list'), g.title))) : null,
      linkedNotes('location', d.id, `${d.name} (${cap(d.region)})`));
  };
  const summary = translateUI('ui.loc_encounter_summary', {
    species: number(new Set(d.rows.map((row) => row.species_id)).size), rows: number(d.rows.length),
  });
  if (embedded) {
    mount(pane, h('div', { class: 'loc-sub-head small muted' }, h('strong', { class: 'loc-sub-name' }, gameTerm('location', d.name)), ' · ' + summary), body);
    draw();
    return;
  }
  mount(pane, h('div', { class: 'detail-head' }, h('div', { class: 'grow' },
    h('div', { class: 'row' }, h('span', { class: 'chip' }, gameTerm('region', cap(d.region))),
      h('span', { class: 'grow' }), back ? h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: back }, icon('close')) : null),
    h('h2', null, gameTerm('location', d.name)), h('div', { class: 'small muted' }, summary))), body);
  draw();
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
