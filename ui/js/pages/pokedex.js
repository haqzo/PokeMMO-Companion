// Pokédex (docs/design/06, 19 + 2026-11-22 accuracy pass).
// Main Pokédex shows one tile for each of 649 Gen I–V species. The 82 researched
// alternate forms remain selectable INSIDE their species details, not as duplicate cards.
// Reference catalog, in-game membership, acquisition and manual registration stay independent.
import { h, mount, clear, icon, get, api, post, state, setting, saveSettings, on, badge, notice, typeChip, typeChips, pad3, cap,
  spriteOrFallback, silhouette, sizedSprite, fitSprite, debounce, tabs, seg, toast, extLink, modal, relTime, fmtDate, WINDOW_ID } from '../core.js';
import { go, popoutButton, openPopout, pinButton, makePinDraggable } from '../shell.js';
import { downloadJson } from '../components.js';
import { linkedNotes, openRoute } from '../links.js';

export const TYPES = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel'];
const REGIONS = ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova'];
const STAT_ORDER = [['hp', 'HP'], ['attack', 'Attack'], ['defense', 'Defense'], ['sp_attack', 'Sp. Atk'], ['sp_defense', 'Sp. Def'], ['speed', 'Speed']];
export const REG_LEVELS = [['unregistered', 'Unregistered'], ['seen', 'Seen'], ['owned', 'Owned'], ['caught_ot', 'Caught OT']];
const TAG_CHIPS = [['permanent', 'Available permanently'], ['wild', 'Wild'], ['raid', 'Raids'], ['roaming', 'Roaming'], ['temporary', 'Special / temporary'],
  ['event', 'Event'], ['gift_fossil', 'Gift / fossil'], ['evolution', 'Evolve / breed'], ['unverified', 'Unverified'], ['needs_review', 'Needs review'],
  ['listed', 'Listed (your check)'], ['not_listed', 'Not listed (your check)']];
const GEN_NAMES = ['Generation I', 'Generation II', 'Generation III', 'Generation IV', 'Generation V'];
const entryRoute = (s) => '#/pokedex/' + s.id + (s.form_key ? '/' + s.form_key : '');
const DEFAULT_F = { q: '', gen: 'all', types: [], typeSlot: 'any', region: '', horde: '', egg: '', fav: false, sort: 'num', season: '',
  ability: '', held: '', statKey: '', statMin: '', classes: [], reg: [] };
let F = null;
let ui = { drawer: false, tab: 'summary', side: null, scroll: 0, locSeason: 'all', moveFilter: 'all', moveSort: 'method', shiny: false };
let unsub = [];
let gridEl = null, countEl = null, meta = null;

export function dispose() { unsub.forEach((u) => u()); unsub = []; }

export async function loadList(force) {
  const run = setting('pokedex.progress_run');
  const key = run || 'none';
  if (!state.dexCache || force || state.dexCacheRun !== key) {
    let res;
    try { res = await get('/api/dex/species?run=' + encodeURIComponent(key)); }
    catch (_) { await saveSettings({ 'pokedex.progress_run': null }); res = await get('/api/dex/species?run=none'); }
    state.dexCache = res.species; state.dexCacheRun = res.progress_run || 'none';
    state.dexForms = (res.forms || []).map((f) => ({ ...f, abilities: f.abilities || [] }));
    meta = res;
  }
  // Even if a previous build saved pokedex.catalog='forms', always show one species tile.
  // Form details are still available in the per-species form selector.
  return state.dexCache;
}
export function dexMeta() { return meta; }
// The cached list is shared with Home and the popouts; drop it whenever its contents change elsewhere,
// even while the Pokédex page isn't open, so nothing shows stale favourites or registrations.
for (const t of ['favourites', 'dex.roster', 'dex.progress']) on(t, () => { state.dexCache = null; });
on('import', (d) => { if (d && d.state === 'done') state.dexCache = null; });
// Lower-case "form name + full name" text of each species' alternate forms, built once per loaded list (search).
let formTextFor = null, formTextMap = new Map();
function formText() {
  if (formTextFor !== state.dexForms) {
    formTextFor = state.dexForms; formTextMap = new Map();
    for (const f of state.dexForms || []) formTextMap.set(f.id, (formTextMap.get(f.id) || '') + ` ${f.form_name || ''} ${f.name || ''}`.toLowerCase());
  }
  return formTextMap;
}
// Main-grid card elements are built once per loaded list and reused by filters, search, sort and returning to the page.
// Anything that changes a card's content (favourite, registration, import) reloads the list, which empties this cache.
const cardCache = { list: null, sig: '', cards: new Map() };
const persistFilters = debounce(() => saveSettings({ 'pokedex.filters': { ...F, q: '' } }).catch(() => {}), 700);
export function currentFilters() { if (!F) F = { ...DEFAULT_F, ...(setting('pokedex.filters') || {}) }; return F; }

export function applyFilters(all, f = currentFilters(), scope = setting('pokedex.scope')) {
  const q = (f.q || '').trim().toLowerCase();
  const tracking = !!setting('pokedex.progress_run');
  const out = all.filter((s) => {
    if (scope === 'pokemmo' && s.dex === 'no') return false;
    if (q) {
      const num = q.replace(/^#/, '');
      const formHit = (formText().get(s.id) || '').includes(q);
      const hit = s.name.toLowerCase().includes(q) || formHit || (/^\d+$/.test(num) && String(s.id) === String(Number(num))) ||
        (s.abilities || []).some((a) => a.toLowerCase().includes(q)) || s.types.includes(q);
      if (!hit) return false;
    }
    if (f.gen !== 'all' && String(s.gen) !== f.gen) return false;
    if (f.types.length) {
      if (f.typeSlot === 'primary' && !f.types.includes(s.types[0])) return false;
      if (f.typeSlot === 'secondary' && !(s.types[1] && f.types.includes(s.types[1]))) return false;
      if (f.typeSlot === 'any' && !f.types.every((t) => s.types.includes(t))) return false;
    }
    if (f.region && !(s.regions || []).includes(f.region)) return false;
    if (f.horde === 'any' && !s.horde) return false;
    if (f.horde === '5' && !s.horde5) return false;
    if (f.egg && !(s.egg_groups || []).includes(f.egg)) return false;
    if (f.season && !(s.seasons || []).some((x) => x === f.season || x === 'Any')) return false;
    if (f.ability && !(s.abilities || []).some((a) => a.toLowerCase().includes(f.ability.toLowerCase()))) return false;
    if (f.held && !(s.held_items || []).some((a) => a.toLowerCase().includes(f.held.toLowerCase()))) return false;
    if (f.statKey && f.statMin !== '' && !((f.statKey === 'bst' ? s.bst : (s.stats || {})[f.statKey]) >= Number(f.statMin))) return false;
    if (f.classes.length && !f.classes.some((c) => (s.tags || []).includes(c))) return false;
    if (tracking && f.reg.length) {
      const p = s.progress || { status: 'unregistered' };
      const ok = f.reg.some((r) => (r === 'caught_alpha' ? p.caught_alpha : r === 'owned_shiny' ? p.owned_shiny : r === 'owned_costume' ? p.owned_costume : p.status === r));
      if (!ok) return false;
    }
    if (f.fav && !s.fav) return false;
    return true;
  });
  const by = { num: (a, b) => a.id - b.id || (a.form_key ? 1 : 0) - (b.form_key ? 1 : 0), name: (a, b) => a.name.localeCompare(b.name), bst: (a, b) => (b.bst || 0) - (a.bst || 0) || a.id - b.id,
    fav: (a, b) => (b.fav - a.fav) || a.id - b.id };
  out.sort(by[f.sort] || by.num);
  return out;
}
function activeFilterCount() {
  return F.types.length + (F.region ? 1 : 0) + (F.horde ? 1 : 0) + (F.egg ? 1 : 0) + (F.fav ? 1 : 0) + (F.season ? 1 : 0) +
    (F.ability ? 1 : 0) + (F.held ? 1 : 0) + (F.statKey && F.statMin !== '' ? 1 : 0) + F.classes.length + F.reg.length;
}
const rerender = () => { pageKey = null; return render(document.getElementById('main'), parseHash()); };

// Pokémon Summary = large popup INSIDE the Companion, layered over the grid (owner decision 2026-11-23).
// Opening/closing it only changes the URL hash; the grid, its search/filters and scroll stay mounted.
let pageKey = null;      // route state other than the selection; when unchanged, only the popup is updated
let lastFocus = null;
let staleGrid = false;
let renderSeq = 0;       // a render that a newer navigation overtook stops before touching the page
// Escape closes the Summary. Registered once, so it also works while a refresh is rebuilding the page.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && location.hash.startsWith('#/pokedex/') && document.querySelector('#main .dex-summary-back') &&
      !document.querySelector('.modal-back, .menu')) { e.preventDefault(); go('#/pokedex'); }
});   // a registration was saved inside the popup; redraw the grid (same filters/scroll) once it closes
function routeKey(route) {
  const q = new URLSearchParams(route.query); q.delete('tab');
  return q.toString();
}
function closeIfStale() { if (!/^#\/pokedex\/\d/.test(location.hash)) closeSummary(); }
function closeSummary() {
  const back = document.querySelector('#main .dex-summary-back');
  if (back) back.remove();
  document.querySelector('#main .dex-page')?.removeAttribute('aria-hidden');
  if (lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
}
async function openSummary(el, sel, selForm) {
  const host = el.querySelector('.dex-page');
  let back = el.querySelector('.dex-summary-back');
  if (!back) {
    if (!lastFocus) lastFocus = document.activeElement;
    back = h('div', { class: 'dex-summary-back', onmousedown: (e) => { if (e.target === back) go('#/pokedex'); } },
      h('div', { class: 'dex-summary', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Pokémon summary', tabindex: '-1' }));
    el.append(back);
    host && host.setAttribute('aria-hidden', 'true');
  }
  const pane = back.firstChild;
  const keepScroll = pane.dataset.id === String(sel) ? pane.scrollTop : 0;
  pane.dataset.id = String(sel);
  await renderDetail(pane, sel, { back: () => go('#/pokedex'), form: selForm });
  pane.scrollTop = keepScroll;
  if (!pane.contains(document.activeElement)) pane.focus({ preventScroll: true });
  gridEl && gridEl.querySelectorAll('.dex-card.selected').forEach((c) => c.classList.remove('selected'));
  const card = gridEl && gridEl.querySelector(`[data-entry="${sel}"]`);
  if (card) card.classList.add('selected');
}

export async function render(el, route) {
  const seq = ++renderSeq;
  const sel = route.parts[0] ? Number(route.parts[0]) : null;
  const selForm = route.parts[1] || null;
  if (route.query.get('tab')) { ui.tab = route.query.get('tab'); }
  // Same grid state, only the selection changed → update the popup, keep the grid exactly as it is.
  if (gridEl && gridEl.isConnected && el.contains(gridEl) && pageKey === routeKey(route)) {
    if (sel) { await openSummary(el, sel, selForm); if (seq !== renderSeq) closeIfStale(); return; }
    closeSummary(); lastFocus = null;
    if (!staleGrid) return;
  }
  staleGrid = false;
  dispose();
  currentFilters();
  const all = await loadList();
  if (seq !== renderSeq) return;
  pageKey = routeKey(route);
  const page = h('div', { class: 'page flush dex-page' });
  mount(el, page);
  const layout = h('div', { class: 'dex-layout' });
  page.append(layout);
  const gridWrap = h('div', { class: 'dex-grid-wrap' });
  layout.append(gridWrap);
  await buildToolbar(gridWrap, all);
  if (seq !== renderSeq) return;
  const scroll = h('div', { class: 'dex-scroll', tabindex: '-1' });
  gridEl = h('div', { class: 'dex-grid density-' + (setting('pokedex.density') || 'standard'), role: 'grid', 'aria-label': 'Pokémon' });
  scroll.append(gridEl);
  gridWrap.append(scroll);
  drawGrid(all, sel, selForm);
  scroll.scrollTop = ui.scroll;
  scroll.addEventListener('scroll', () => { ui.scroll = scroll.scrollTop; });
  if (sel) {
    const card = gridEl.querySelector(`[data-entry="${sel}"]`);
    if (card && !ui.scroll) card.scrollIntoView({ block: 'center' });
    lastFocus = card || null;
    await openSummary(el, sel, selForm);
    if (seq !== renderSeq) return;
  }
  const refresh = async () => { await loadList(true); if (gridEl && gridEl.isConnected) rerender(); };
  unsub.push(on('favourites', refresh));
  unsub.push(on('dex.roster', refresh));
  unsub.push(on('dex.progress', (d, ev) => { if (ev.origin !== WINDOW_ID) refresh(); }));
  unsub.push(on('import', async (d) => { if (d.state === 'done' && d.kind === 'dumps') refresh(); }));
  unsub.push(() => { pageKey = null; });
}
function parseHash() { const raw = location.hash.replace(/^#\/?/, ''); const [p, qs] = raw.split('?'); const parts = p.split('/').filter(Boolean);
  return { page: parts[0], parts: parts.slice(1), query: new URLSearchParams(qs || ''), hash: location.hash }; }

async function buildToolbar(wrap, all) {
  const search = h('input', { id: 'dex-search', class: 'input', type: 'search', placeholder: 'Name, number, type or ability', value: F.q,
    'aria-label': 'Search Pokémon', oninput: debounce((e) => { F.q = e.target.value; drawGrid(all); }, 120) });
  countEl = h('span', { class: 'small muted nowrap' });
  const filterBtn = h('button', { class: 'btn' + (ui.drawer ? ' primary' : ''), 'aria-expanded': String(ui.drawer), onclick: () => { ui.drawer = !ui.drawer; rerender(); } },
    icon('filter'), 'Filters', activeFilterCount() ? h('span', { class: 'chip', style: { padding: '0 6px' } }, activeFilterCount()) : null);
  const sort = h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': 'Sort', onchange: (e) => { F.sort = e.target.value; persistFilters(); drawGrid(all); } },
    [['num', 'National #'], ['name', 'Name A–Z'], ['bst', 'Base stat total'], ['fav', 'Favourites first']].map(([v, t]) =>
      h('option', { value: v, selected: F.sort === v ? 'selected' : null, disabled: v === 'bst' && !state.boot.dex.imported ? 'disabled' : null }, t)));
  wrap.append(h('div', { class: 'dex-toolbar' },
    h('div', { class: 'search' }, icon('search'), search),
    seg([['all', 'All'], ['1', 'I'], ['2', 'II'], ['3', 'III'], ['4', 'IV'], ['5', 'V']], F.gen, (v) => { F.gen = v; persistFilters(); rerender(); }, 'Generation of introduction'),
    filterBtn, sort,
    seg([['compact', 'Small'], ['standard', 'Medium'], ['large', 'Large']], setting('pokedex.density') || 'standard', async (v) => {
      await saveSettings({ 'pokedex.density': v }); gridEl.className = 'dex-grid density-' + v; drawGrid(all); }, 'Card size'),
    h('span', { class: 'grow' }), popoutButton('pokedex')));
  wrap.append(await infoBar(all));
  if (ui.drawer) wrap.append(filterDrawer(all));
  const chips = activeChips();
  if (chips) wrap.append(chips);
}

async function infoBar(all) {
  const scope = setting('pokedex.scope') || 'reference';
  const runs = await get('/api/guides/runs');
  const runId = setting('pokedex.progress_run');
  const reg = meta && meta.registry;
  const forms = (state.dexForms || []).length;
  const hidden = all.filter((s) => s.dex === 'no').length;
  const runSel = h('select', { class: 'input', style: { width: 'auto', minHeight: '28px', padding: '2px 6px' }, 'aria-label': 'Registration tracking',
    onchange: async (e) => { await saveSettings({ 'pokedex.progress_run': e.target.value || null }); await loadList(true); rerender(); } },
  h('option', { value: '' }, 'Registration: not tracked'),
  runs.runs.map((r) => h('option', { value: r.id, selected: r.id === runId ? 'selected' : null }, `Registration: ${r.display}`)));
  const counters = h('div', { class: 'row wrap small' });
  if (runId) {
    get(`/api/dex/progress/${runId}/counts?scope=${scope}`).then((c) => mount(counters,
      [['Seen', c.seen], ['Owned', c.owned], ['Caught OT', c.caught_ot], ['Caught Alpha', c.caught_alpha], ['Owned Shiny', c.owned_shiny], ['Costumes', c.owned_costume]]
        .map(([l, v]) => h('span', { class: 'counter' }, h('span', { class: 'muted' }, l + ' '), h('strong', null, v))),
      h('span', { class: 'tiny muted', title: c.note }, '· species you marked (forms don’t count separately) · in-game maxima differ per counter'))).catch(() => {});
  }
  return h('div', { class: 'dex-info' },
    h('div', { class: 'row wrap grow', style: { gap: '6px 14px' } },
      countEl,
      h('span', { class: 'small muted', title: 'PokeMMO’s own Seen / Owned / Caught counters use different, patch-dependent totals. Record yours in the Availability report.' },
        `Gen I–V reference: ${all.length} species${forms ? ` · ${forms} alternate forms inside each Pokémon’s summary` : ''} · not the in-game Pokédex total, and being listed does not mean obtainable`),
      scope === 'pokemmo' && hidden ? h('span', { class: 'small muted' }, `${hidden} you marked “Not listed” hidden`) : null,
      h('button', { class: 'btn ghost small', onclick: rosterDialog, title: 'Availability by source, your in-game checks and your counter readings' }, icon('info'), 'Availability report'),
      reg ? h('span', { class: 'tiny muted' }, `Registry ${reg.registry_version}`) : null,
      state.boot.dex.imported ? null : h('button', { class: 'btn small', onclick: () => go('#/settings/data') }, icon('download'), 'Install your PokeMMO data')),
    h('div', { class: 'row wrap', style: { gap: '6px 12px' } }, runs.runs.length ? runSel : h('span', { class: 'tiny muted' }, 'Create a run in Guides to track registration per character'), counters));
}

function filterDrawer(all) {
  const imported = state.boot.dex.imported;
  const redraw = () => { persistFilters(); rerender(); };
  const chip = (label, on_, fn, disabled) => h('button', { class: 'chip btnlike' + (on_ ? ' active' : ''), disabled: disabled ? 'disabled' : null, 'aria-pressed': String(!!on_), onclick: fn }, label);
  const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const eggGroups = [...new Set(all.flatMap((s) => s.egg_groups || []))].sort();
  const tracking = !!setting('pokedex.progress_run');
  return h('div', { class: 'filter-drawer' },
    h('div', { class: 'fgroup wide' }, h('span', { class: 'label' }, 'Type'), h('div', { class: 'chips' },
      TYPES.map((t) => h('button', { class: 'chip btnlike' + (F.types.includes(t) ? ' active' : ''), 'aria-pressed': String(F.types.includes(t)), onclick: () => {
        F.types = F.types.includes(t) ? F.types.filter((x) => x !== t) : [...F.types, t].slice(-2); redraw(); } }, typeChip(t, true)))),
    seg([['any', 'Has all selected'], ['primary', 'Primary type'], ['secondary', 'Secondary type']], F.typeSlot, (v) => { F.typeSlot = v; redraw(); }, 'Type slot')),
    h('div', { class: 'fgroup' }, h('span', { class: 'label' }, 'PokeMMO acquisition (sourced registry · your dump · your checks)'), h('div', { class: 'chips' },
      TAG_CHIPS.map(([k, l]) => chip(l, F.classes.includes(k), () => { F.classes = toggle(F.classes, k); redraw(); })),
      chip('Hide species I marked “Not listed”', setting('pokedex.scope') === 'pokemmo', async () => {
        await saveSettings({ 'pokedex.scope': setting('pokedex.scope') === 'pokemmo' ? 'reference' : 'pokemmo' }); rerender(); }))),
    tracking ? h('div', { class: 'fgroup' }, h('span', { class: 'label' }, 'Your registration (manual)'), h('div', { class: 'chips' },
      [...REG_LEVELS, ['caught_alpha', 'Caught Alpha'], ['owned_shiny', 'Owned Shiny'], ['owned_costume', 'Owned Costume']].map(([k, l]) =>
        chip(l, F.reg.includes(k), () => { F.reg = toggle(F.reg, k); redraw(); })))) : null,
    h('div', { class: 'fgroup' }, h('span', { class: 'label' }, 'Encounter region' + (imported ? '' : ' — needs data')), h('div', { class: 'chips' },
      chip('Any', !F.region, () => { F.region = ''; redraw(); }, !imported),
      REGIONS.map((r) => chip(cap(r), F.region === r, () => { F.region = F.region === r ? '' : r; redraw(); }, !imported)))),
    h('div', { class: 'fgroup' }, h('span', { class: 'label' }, 'Hunting'), h('div', { class: 'chips' },
      chip('Any', !F.horde, () => { F.horde = ''; redraw(); }, !imported), chip('In any horde', F.horde === 'any', () => { F.horde = F.horde === 'any' ? '' : 'any'; redraw(); }, !imported),
      chip('Horde ×5', F.horde === '5', () => { F.horde = F.horde === '5' ? '' : '5'; redraw(); }, !imported))),
    h('div', { class: 'fgroup' }, h('span', { class: 'label' }, 'Season (dump rows)'), h('div', { class: 'chips' },
      chip('Any', !F.season, () => { F.season = ''; redraw(); }, !imported),
      ['Spring', 'Summer', 'Autumn', 'Winter'].map((s) => chip(s, F.season === s, () => { F.season = F.season === s ? '' : s; redraw(); }, !imported)))),
    h('div', { class: 'fgroup' }, h('span', { class: 'label' }, 'Egg group'),
      h('select', { class: 'input', disabled: imported ? null : 'disabled', onchange: (e) => { F.egg = e.target.value; redraw(); } },
        h('option', { value: '' }, 'Any'), eggGroups.map((g) => h('option', { value: g, selected: F.egg === g ? 'selected' : null }, cap(g))))),
    h('div', { class: 'fgroup' }, h('span', { class: 'label' }, 'Ability contains'),
      h('input', { class: 'input', value: F.ability, disabled: imported ? null : 'disabled', placeholder: 'e.g. Levitate', onchange: (e) => { F.ability = e.target.value.trim(); redraw(); } })),
    h('div', { class: 'fgroup' }, h('span', { class: 'label' }, 'Wild held item contains'),
      h('input', { class: 'input', value: F.held, disabled: imported ? null : 'disabled', placeholder: 'e.g. Oran Berry', onchange: (e) => { F.held = e.target.value.trim(); redraw(); } })),
    h('div', { class: 'fgroup' }, h('span', { class: 'label' }, 'Base stat at least'), h('div', { class: 'row' },
      h('select', { class: 'input', style: { width: 'auto' }, disabled: imported ? null : 'disabled', onchange: (e) => { F.statKey = e.target.value; redraw(); } },
        h('option', { value: '' }, 'Stat…'), [...STAT_ORDER, ['bst', 'Total']].map(([k, l]) => h('option', { value: k, selected: F.statKey === k ? 'selected' : null }, l))),
      h('input', { class: 'input', type: 'number', min: 1, max: 720, style: { width: '90px' }, value: F.statMin, disabled: imported ? null : 'disabled',
        onchange: (e) => { F.statMin = e.target.value; redraw(); } }))),
    h('div', { class: 'fgroup' }, h('span', { class: 'label' }, 'Personal'), h('div', { class: 'chips' },
      chip('★ Favourites only', F.fav, () => { F.fav = !F.fav; redraw(); }))),
    h('div', { class: 'fgroup', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn ghost small', onclick: () => { F = { ...DEFAULT_F, q: F.q, sort: F.sort }; redraw(); } }, 'Clear filters')),
    h('p', { class: 'tiny muted', style: { flexBasis: '100%', margin: 0 } },
      'Generation = generation of introduction, not where it is found. Regional Pokédex numbers and PvP tiers are not available in the installed data (the dump lists every species as “Untiered”), so they are not offered as filters.'));
}
function activeChips() {
  if (!activeFilterCount() && F.gen === 'all') return null;
  const redraw = () => { persistFilters(); rerender(); };
  const c = [];
  if (F.gen !== 'all') c.push(['Gen ' + ['I', 'II', 'III', 'IV', 'V'][Number(F.gen) - 1], () => { F.gen = 'all'; }]);
  F.types.forEach((t) => c.push([cap(t) + (F.typeSlot !== 'any' ? ` (${F.typeSlot})` : ''), () => { F.types = F.types.filter((x) => x !== t); }]));
  if (F.region) c.push([cap(F.region), () => { F.region = ''; }]);
  if (F.horde) c.push([F.horde === '5' ? 'Horde ×5' : 'Horde', () => { F.horde = ''; }]);
  if (F.season) c.push([F.season, () => { F.season = ''; }]);
  if (F.egg) c.push(['Egg: ' + F.egg, () => { F.egg = ''; }]);
  if (F.ability) c.push(['Ability: ' + F.ability, () => { F.ability = ''; }]);
  if (F.held) c.push(['Held: ' + F.held, () => { F.held = ''; }]);
  if (F.statKey && F.statMin !== '') c.push([`${F.statKey === 'bst' ? 'Total' : STAT_ORDER.find((x) => x[0] === F.statKey)[1]} ≥ ${F.statMin}`, () => { F.statKey = ''; F.statMin = ''; }]);
  F.classes.forEach((k) => c.push([(TAG_CHIPS.find((x) => x[0] === k) || [k, k])[1], () => { F.classes = F.classes.filter((x) => x !== k); }]));
  F.reg.forEach((k) => c.push([k.replace('_', ' '), () => { F.reg = F.reg.filter((x) => x !== k); }]));
  if (F.fav) c.push(['Favourites', () => { F.fav = false; }]);
  return h('div', { class: 'active-filters', style: { padding: '6px 16px', borderBottom: '1px solid var(--border-subtle)' } },
    h('span', { class: 'tiny muted' }, 'Active:'), c.map(([l, fn]) => h('button', { class: 'chip btnlike', onclick: () => { fn(); redraw(); }, title: 'Remove filter' }, l, ' ✕')),
    h('button', { class: 'btn ghost small', onclick: () => { F = { ...DEFAULT_F, q: F.q, sort: F.sort }; redraw(); } }, 'Clear all'));
}

function drawGrid(all, sel = Number(parseHash().parts[0]) || null, selForm = parseHash().parts[1] || null) {
  if (!gridEl) return;
  const list = applyFilters(all);
  const scope = setting('pokedex.scope') || 'reference';
  const inScope = all.filter((s) => scope !== 'pokemmo' || s.dex !== 'no').length;
  if (countEl) countEl.textContent = `${list.length} of ${inScope} Pokémon shown`;
  clear(gridEl);
  if (!list.length) {
    gridEl.append(h('div', { class: 'empty', style: { gridColumn: '1 / -1' } }, h('h3', null, 'No Pokémon match'),
      activeFilterCount() || F.q || F.gen !== 'all' ? h('p', null, 'Search or filters are hiding everything. ', h('button', { class: 'btn small', onclick: () => {
        F = { ...DEFAULT_F, sort: F.sort }; persistFilters(); rerender(); } }, 'Clear search & filters')) : null));
    return;
  }
  const density = setting('pokedex.density') || 'standard';
  const tracking = !!setting('pokedex.progress_run');
  const sig = `${density}|${tracking}`;
  if (cardCache.list !== all || cardCache.sig !== sig) { cardCache.list = all; cardCache.sig = sig; cardCache.cards = new Map(); }
  gridEl.append(catalogFragment(list, { sel, selForm, density, tracking, onOpen: (s) => go(entryRoute(s)), onKey: gridKeys, grouped: F.sort === 'num', cache: cardCache.cards }));
}
/** Cards with Generation headings (when sorted by number). Shared by the main grid and popouts. */
export function catalogFragment(list, { sel, selForm, density, tracking, onOpen, onKey, grouped, cache }) {
  const frag = document.createDocumentFragment();
  const perGen = new Map();
  if (grouped) for (const x of list) perGen.set(x.gen, (perGen.get(x.gen) || 0) + 1);
  let gen = null;
  for (const s of list) {
    if (grouped && s.gen !== gen) {
      gen = s.gen;
      frag.append(h('h3', { class: 'gen-head', role: 'presentation' }, GEN_NAMES[gen - 1] || 'Generation ' + gen, h('span', { class: 'tiny muted' }, ` · ${perGen.get(gen)}`)));
    }
    const selected = s.id === sel && (s.form_key || null) === (selForm || null);
    const key = s.form_key ? `${s.id}:${s.form_key}` : String(s.id);
    let card = cache && cache.get(key);
    if (card) card.classList.toggle('selected', selected);
    else {
      card = dexCard(s, { selected, density, tracking, onOpen, onKey });
      if (cache) cache.set(key, card);
    }
    frag.append(card);
  }
  return frag;
}

/** One sprite card. Used by the main grid and the popout (same look, no caps). */
export function dexCard(s, { selected, density, tracking, onOpen, onKey }) {
  const p = s.progress || { status: 'unregistered' };
  const unseen = tracking && p.status === 'unregistered';
  const regClass = tracking ? ' reg-' + p.status : '';
  const absent = s.dex === 'no';
  const area = density === 'large' ? 96 : density === 'compact' ? 56 : 72;
  const sprite = h('div', { class: 'sprite' + (unseen ? ' unseen' : '') }, sizedSprite(s, area, { still: s.still, url: s.icon, tier: s.size || 'm' }));
  const marks = tracking ? h('span', { class: 'marks' }, p.caught_alpha ? h('span', { title: 'Caught Alpha (your entry)' }, 'α') : null,
    p.owned_shiny ? h('span', { title: 'Owned Shiny (your entry)' }, '✦') : null, p.owned_costume ? h('span', { title: 'Owned Costume (your entry)' }, '♛') : null) : null;
  const unverified = (s.tags || []).includes('unverified');
  const label = `#${pad3(s.id)} ${s.name}, ${s.types.join(' ')}${absent ? ', you marked it not listed in game' : unverified ? ', PokeMMO acquisition unverified' : ''}${tracking ? ', ' + p.status.replace('_', ' ') : ''}`;
  const el = h('div', { class: `dex-card${selected ? ' selected' : ''}${regClass}${absent ? ' absent' : ''}${s.form_key ? ' form' : ''}`, role: 'gridcell', tabindex: '0',
    dataset: { id: s.id, entry: s.form_key ? `${s.id}:${s.form_key}` : String(s.id) },
    'aria-label': label, title: density === 'compact' ? label : null, onclick: () => onOpen(s), onkeydown: onKey || null },
  h('span', { class: 'num' }, '#' + pad3(s.id)),
  s.form_key ? h('span', { class: 'form-badge', title: s.own_sprite ? 'Alternate form' : 'Alternate form — shown with the base sprite (no separate sprite in your client data)' }, s.own_sprite ? 'form' : 'form*') : null,
  unverified && density !== 'compact' ? h('span', { class: 'qmark', title: 'PokeMMO acquisition not verified yet' }, '?') : null,
  density !== 'compact' ? favButton(s) : null, marks, sprite,
  h('div', { class: 'nm' + (unseen ? ' muted' : '') }, s.name),
  density !== 'compact' ? h('div', { class: 'types' }, s.types.map((t) => typeChip(t, true))) : null,
  density === 'large' ? h('div', { class: 'avail' }, s.avail + (s.bst ? ` · BST ${s.bst}` : '')) :
    density === 'standard' ? h('div', { class: 'avail' }, absent ? 'Not listed (your check)' : s.avail) : null);
  makePinDraggable(el, { kind: 'pokemon', id: s.id });
  return el;
}
function favButton(s) {
  const b = h('button', { class: 'fav-btn fav' + (s.fav ? ' on' : ''), title: s.fav ? 'Remove favourite' : 'Add favourite', 'aria-label': 'Favourite',
    'aria-pressed': String(!!s.fav), onclick: async (e) => { e.stopPropagation(); s.fav = !s.fav; b.classList.toggle('on', s.fav);
      b.querySelector('path').setAttribute('fill', s.fav ? 'currentColor' : 'none'); await api('PUT', `/api/dex/species/${s.id}/favourite`, { fav: s.fav }); } }, icon('star'));
  if (s.fav) b.querySelector('path').setAttribute('fill', 'currentColor');
  return b;
}
function gridKeys(e) {
  const cards = [...gridEl.querySelectorAll('.dex-card')];
  const i = cards.indexOf(e.currentTarget);
  const cols = Math.max(1, Math.round(gridEl.clientWidth / (cards[0].getBoundingClientRect().width + 8)));
  const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
  if (move) { e.preventDefault(); const t = cards[Math.min(cards.length - 1, Math.max(0, i + move))]; t && t.focus(); }
  if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.click(); }
}

// ------------------------------------------------------------- availability report
export async function rosterDialog() {
  const body = h('div', { class: 'stack' });
  const mark = async (id, v) => { await api('PUT', '/api/dex/roster/' + id, { in_dex: v }); draw(await get('/api/dex/roster')); };
  const row = (x) => h('div', { class: 'list-row', style: { cursor: 'default' } },
    x.icon ? h('img', { class: 'pixel', src: x.icon, width: 32, height: 32, alt: '', loading: 'lazy' }) : h('span', { class: 'muted', style: { width: '32px' } }, '#' + pad3(x.id)),
    h('span', { class: 'grow' }, `#${pad3(x.id)} ${x.name}`, h('div', { class: 'tiny muted' }, `${x.label} · ${x.evidence}` + (x.membership_basis === 'your-check' ? ` · you: ${x.membership === 'yes' ? 'listed' : 'not listed'}` : ''))),
    h('button', { class: 'btn small', onclick: () => mark(x.id, 'yes') }, 'It’s listed'), h('button', { class: 'btn small', onclick: () => mark(x.id, 'no') }, 'Not listed'),
    x.membership_basis === 'your-check' ? h('button', { class: 'btn small ghost', onclick: () => mark(x.id, 'clear') }, 'Clear') : null);
  const counterTable = (o, mine) => h('div', { class: 'card inset stack tight' },
    h('div', { class: 'small' }, h('strong', null, fmtDate(o.observed_at)), ' · ', mine ? (o.client_note || 'Your reading') : o.source),
    h('div', { class: 'row wrap small' }, Object.entries(o.counters).map(([k, v]) => h('span', { class: 'counter' }, h('span', { class: 'muted' }, k.replace('_', ' ') + ' '),
      h('strong', null, typeof v === 'object' ? `${v.have ?? '—'} / ${v.max ?? '—'}` : `? / ${v}`)))),
    o.note ? h('div', { class: 'tiny muted' }, o.note) : null,
    mine ? h('button', { class: 'btn ghost small', onclick: async () => { await api('DELETE', '/api/dex/observations/' + o.id); draw(await get('/api/dex/roster')); } }, 'Delete reading') : null);
  const obsForm = () => {
    const f = { observed_at: new Date().toISOString().slice(0, 10), counters: {} };
    const metrics = [['seen', 'Seen'], ['owned', 'Owned'], ['caught_ot', 'Caught OT'], ['caught_alpha', 'Caught Alpha'], ['owned_shiny', 'Owned Shiny'], ['costume', 'Costumes']];
    const num = (k, part) => h('input', { class: 'input', type: 'number', min: 0, max: 5000, style: { width: '76px' }, 'aria-label': `${k} ${part}`,
      oninput: (e) => { (f.counters[k] ||= {})[part] = e.target.value === '' ? null : Number(e.target.value); } });
    const note = h('input', { class: 'input', placeholder: 'Character / note (optional)', maxlength: 300, oninput: (e) => { f.client_note = e.target.value; } });
    return h('details', null, h('summary', { class: 'small' }, 'Record what your in-game Pokédex counters show today'),
      h('div', { class: 'stack tight', style: { marginTop: '6px' } },
        h('div', { class: 'grid-2', style: { gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' } }, metrics.map(([k, l]) => h('div', { class: 'row' },
          h('span', { class: 'small', style: { width: '90px' } }, l), num(k, 'have'), h('span', { class: 'muted' }, '/'), num(k, 'max')))),
        note, h('button', { class: 'btn small primary', onclick: async () => {
          try { await post('/api/dex/observations', f); toast('Reading saved'); draw(await get('/api/dex/roster')); } catch (e) { toast(e.message, { kind: 'warn' }); } } }, 'Save reading')));
  };
  const draw = (r) => mount(body,
    notice('info', r.note),
    h('div', { class: 'row wrap' },
      h('span', { class: 'counter' }, 'Reference species: ', h('strong', null, r.reference_species)),
      h('span', { class: 'counter' }, 'Available permanently: ', h('strong', null, r.permanent)),
      h('span', { class: 'counter' }, 'Only special/temporary: ', h('strong', null, r.not_permanent)),
      h('span', { class: 'counter' }, 'Unverified: ', h('strong', null, r.unverified)),
      h('span', { class: 'counter' }, 'Your checks: ', h('strong', null, `${r.membership.your_listed} listed · ${r.membership.your_not_listed} not listed`))),
    h('div', { class: 'tiny muted' }, `Registry ${r.registry_version} (checked ${fmtDate(r.checked_at)})` + (r.dump_date ? ` · dump files dated ${r.dump_date}` : '') +
      ' · ' + Object.entries(r.method_counts).map(([k, v]) => `${r.method_labels[k] || k} ${v}`).join(' · ')),
    r.conflicts.length ? [h('h3', { style: { margin: '6px 0 0' } }, 'Conflicts between your checks and the registry'), h('div', { class: 'list-rows' }, r.conflicts.map(row))] : null,
    r.needs_review.length ? [h('h3', { style: { margin: '6px 0 0' } }, 'Needs review after a later patch'), h('div', { class: 'list-rows' }, r.needs_review.map(row))] : null,
    h('h3', { style: { margin: '6px 0 0' } }, 'Sourced legendary, raid, roaming, event and story entries'),
    h('div', { class: 'list-rows', style: { maxHeight: '34vh', overflow: 'auto' } }, r.authored.map(row)),
    h('h3', { style: { margin: '6px 0 0' } }, 'In-game counter readings'),
    r.registry_observations.map((o) => counterTable(o, false)), r.your_observations.map((o) => counterTable(o, true)), obsForm(),
    h('details', null, h('summary', { class: 'small' }, `Sources (${Object.keys(r.sources).length})`),
      h('ul', { class: 'small' }, Object.entries(r.sources).map(([id, src]) => h('li', null, src.url && src.url.startsWith('http') ? extLink(src.url, src.title) : src.title,
        h('span', { class: 'tiny muted' }, ` · ${src.kind} · checked ${src.checked}`))))));
  draw(await get('/api/dex/roster'));
  await modal({ title: 'Availability report', body, wide: true, actions: [
    { label: 'Export (JSON)', kind: 'ghost', handler: async () => { downloadJson(`pokemmo-availability-report-${new Date().toISOString().slice(0, 10)}.json`, await get('/api/dex/roster')); return false; } },
    { label: 'Close', kind: 'primary' }] });
  await loadList(true);
  if (location.hash.startsWith('#/pokedex')) rerender();
}

// ---------------------------------------------------------------- detail
const EVO = { LEVEL: (e) => `Level ${e.value}`, ITEM: (e) => e.item || 'Item', TRADE: () => 'Trade', TRADE_WITH_ITEM: (e) => `Trade holding ${e.item || 'item'}`,
  HAPPINESS: () => 'High friendship', HAPPINESS_DAY: () => 'Friendship (day)', HAPPINESS_NIGHT: () => 'Friendship (night)',
  LEVEL_WITH_SKILL: () => 'Level up knowing a move', LEVEL_FEMALE: (e) => `Level ${e.value} (female)`, LEVEL_MALE: (e) => `Level ${e.value} (male)`,
  ITEM_MALE: (e) => `${e.item || 'Item'} (male)`, ITEM_FEMALE: (e) => `${e.item || 'Item'} (female)`, LEVEL_ITEM_NIGHT: () => 'Level up holding item (night)',
  LEVEL_ITEM_DAY: () => 'Level up holding item (day)', ATK_GREATER_THAN_DEF: (e) => `Level ${e.value}, Atk > Def`, ATK_LESS_THAN_DEF: (e) => `Level ${e.value}, Atk < Def`,
  ATK_EQUAL_TO_DEF: (e) => `Level ${e.value}, Atk = Def`, LEVEL_WITH_MONSTER: () => 'Level up with another Pokémon in party' };
const evoText = (via) => (EVO[via.method] ? EVO[via.method](via) : via.method.replace(/_/g, ' ').toLowerCase());
const MAIN_TABS = [['summary', 'Summary'], ['moves', 'Moves'], ['stats', 'Base Stats'], ['locations', 'Wild Locations'], ['evolution', 'Evolution Tree'], ['matchups', 'Type Matchups']];
const SIDE_TABS = [['registration', 'My registration'], ['breeding', 'Breeding'], ['notes', 'Notes & Box']];

/** Choose the artwork to show for a species or form. Order: animated (your sprite library, if motion is on) →
 *  still battle art (library, then your client) → client box icon → an explicit "no artwork" placeholder.
 *  Base-species or placeholder art is never used for a form (the server already refuses it). */
export function pickArt(a, { shiny = false, isForm = false } = {}) {
  a = a || {};
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pref = setting('pokedex.animate');
  const motion = pref === undefined || pref === null ? !reduce : !!pref;
  const shinyAvail = !!(a.ani_shiny || a.static_shiny || a.front_shiny || a.icon_shiny);
  const sh = shiny && shinyAvail;
  const pickS = (n) => (sh ? a[n + '_shiny'] : a[n]);
  const lib = (k) => (a.library || {})[sh ? k + '_shiny' : k];
  const libLabel = (k) => { const p = lib(k); return p ? ({ pokeapi: 'PokéAPI', smogon: 'Smogon', showdown: 'Showdown' }[p.layout] || p.layout) : ''; };
  const hasAni = !!pickS('ani');
  const base = { shinyAvail, hasAni, motion, isForm };
  const key = (n) => (sh ? n + '_shiny' : n);
  base.bounds = a.bounds || {};
  base.tier = (a.size && a.size.tier) || 'm';
  if (motion && hasAni) return { ...base, kind: 'ani', key: key('ani'), url: pickS('ani'), label: `Animated · your sprite library (${libLabel('ani')} files)`, detail: lib('ani') && lib('ani').path };
  if (pickS('static')) return { ...base, kind: 'static', key: key('static'), url: pickS('static'), label: `Still · your sprite library (${libLabel('static')} files)`, detail: lib('static') && lib('static').path };
  if (pickS('front')) return { ...base, kind: 'front', key: key('front'), url: pickS('front'), label: 'Your PokeMMO client · battle sprite' };
  if (hasAni) return { ...base, kind: 'ani-still', key: key('ani'), url: pickS('ani'), label: 'Still frame · your sprite library' };
  if (pickS('icon')) return { ...base, kind: 'icon', key: key('icon'), url: pickS('icon'), label: isForm ? `Your PokeMMO client · box icon${a.local_status === 'unverified' ? ' (not re-verified)' : ''}` : 'Your PokeMMO client · box icon' };
  return { ...base, kind: 'none', url: null, label: isForm ? 'No verified artwork for this form' : 'No artwork installed', detail: a.local_reason };
}
/** Summary/popout artwork, sized by the shared rule in core.js (fitSprite): the species' size tier decides how much
 *  of the frame its visible outline takes, so Charmander < Charmeleon < Charizard in every view and every
 *  Legendary/Mythical gets the large tier. Refits when the frame changes size (window resize, popout mode). */
const artObserver = typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => {
  for (const e of entries) { const f = e.target.__fitArt; if (f) f(); }
}) : null;
export function artImage(art, sp) {
  if (!art.url) return h('div', { class: 'art-missing', title: art.detail || art.label, role: 'img', 'aria-label': art.label },
    silhouette(sp, 72), h('span', { class: 'tiny' }, art.isForm ? 'No form artwork' : ''));
  const img = h('img', { class: 'pixel art-img', src: art.url, alt: sp.name, decoding: 'async', style: { visibility: 'hidden' } });
  let el = img;
  const fit = () => {
    const box = el.parentElement;
    if (!box || !img.naturalWidth) return;
    const cs = getComputedStyle(box);
    const fw = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const fh = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const f = fitSprite(img.naturalWidth, img.naturalHeight, art.bounds[art.key], art.tier, fw, fh);
    Object.assign(el.style, { width: f.width.toFixed(1) + 'px', height: f.height.toFixed(1) + 'px',
      left: (parseFloat(cs.paddingLeft) + f.left).toFixed(1) + 'px', top: (parseFloat(cs.paddingTop) + f.top).toFixed(1) + 'px' });
    el.dataset.scale = f.k.toFixed(3);
    el.dataset.tier = art.tier;
    el.classList.toggle('smooth', f.smooth);
    el.style.visibility = '';
  };
  img.addEventListener('load', () => {
    if (art.kind === 'ani-still') {
      const c = h('canvas', { class: 'pixel art-img', width: img.naturalWidth, height: img.naturalHeight, role: 'img', 'aria-label': sp.name });
      try { c.getContext('2d').drawImage(img, 0, 0); img.replaceWith(c); el = c; } catch (_) { /* keep the image */ }
    }
    fit();
    const box = el.parentElement;
    if (box && artObserver) { box.__fitArt = fit; artObserver.observe(box); }
  });
  img.addEventListener('error', () => img.replaceWith(h('div', { class: 'art-missing', role: 'img', 'aria-label': 'Artwork file missing' }, silhouette(sp, 72))));
  return img;
}

export async function renderDetail(pane, id, { back, popout = false, mode = 'expanded', form = null } = {}) {
  clear(pane).append(h('div', { class: 'detail-body' }, h('div', { class: 'skeleton', style: { height: '120px' } })));
  let d;
  const run = setting('pokedex.progress_run');
  try { d = await get(`/api/dex/species/${id}?run=${encodeURIComponent(run || 'none')}${form ? '&form=' + encodeURIComponent(form) : ''}`); }
  catch (e) { mount(pane, h('div', { class: 'detail-body' }, notice('bad', e.message))); return; }
  if (!popout) saveSettings({ 'pokedex.last_species': id }).catch(() => {});
  const fm = d.form;
  if (fm) { d = { ...d, base_name: d.name, base_types: d.types, name: fm.name, types: fm.types, type_matchups: d.form_matchups,
    stats: fm.stats && Object.keys(fm.stats).length ? fm.stats : d.stats, abilities: fm.abilities_source === 'same as base species' ? d.abilities : fm.abilities.map((n, i) => ({ name: n, slot: 'ability' + (i + 1) })) };
    d.bst = Object.values(d.stats || {}).reduce((a, b) => a + (b || 0), 0) || d.bst; }
  const art = pickArt(fm ? fm.art : d.art, { shiny: ui.shiny, isForm: !!fm });
  const formNav = (k) => (popout ? (location.hash = '#/species/' + id + (k ? '/' + k : '')) : go('#/pokedex/' + id + (k ? '/' + k : '')));
  const av = d.availability;
  const avClass = av.permanent ? 'good' : av.permanent === false ? 'warn' : 'unknown';
  const head = h('div', { class: 'detail-head' },
    h('div', { class: 'art-col' },
      h('div', { class: 'art' + (art.kind === 'ani' ? ' animated' : '') }, artImage(art, d),
        art.shinyAvail ? h('button', { class: 'shiny-toggle' + (ui.shiny ? ' on' : ''), title: ui.shiny ? 'Show normal colours' : 'Show shiny colours (artwork only — not ownership)',
          'aria-label': 'Shiny colours', 'aria-pressed': String(ui.shiny), onclick: () => { ui.shiny = !ui.shiny; renderDetail(pane, id, { back, popout, mode, form }); } }, '✦') : null,
        art.hasAni ? h('button', { class: 'motion-toggle' + (art.motion ? ' on' : ''), title: art.motion ? 'Show still artwork' : 'Play animation',
          'aria-label': 'Animate sprite', 'aria-pressed': String(art.motion), onclick: async () => {
            await saveSettings({ 'pokedex.animate': !art.motion }); renderDetail(pane, id, { back, popout, mode, form }); } }, art.motion ? '❚❚' : '▶') : null),
      h('div', { class: 'art-src tiny muted', title: art.detail || '' }, art.label)),
    h('div', { class: 'grow', style: { minWidth: 0 } },
      h('div', { class: 'row' }, h('span', { class: 'muted nowrap' }, 'No. ' + pad3(d.id)), h('span', { class: 'grow' }), favToggle(d),
        !popout ? pinButton({ kind: 'pokemon', id: d.id }) : null,
        !popout ? h('button', { class: 'icon-btn', title: 'Open in a separate window', 'aria-label': 'Pop out', onclick: () => openPopout('pokedex', `#/species/${id}`) }, icon('popout')) : null,
        back ? h('button', { class: 'icon-btn', title: 'Close (Esc)', 'aria-label': 'Close details', onclick: back }, icon('close')) : null),
      h('h2', null, d.name),
      h('div', { class: 'row wrap', style: { marginTop: '4px' } }, typeChips(d.types),
        fm && fm.kind !== 'cosmetic' && fm.kind !== 'season' ? h('span', { class: 'badge unknown', title: 'Whether this form can be obtained or switched to in PokeMMO is not verified' }, 'Form change not verified') :
          h('span', { class: 'badge ' + avClass, title: av.evidence }, av.label))));
  pane.replaceChildren(head);
  if (d.catalog_forms && d.catalog_forms.length) {
    pane.append(h('div', { class: 'form-strip', role: 'group', 'aria-label': `${d.base_name || d.name} forms` }, h('span', { class: 'label' }, 'Form'),
      d.catalog_forms.map((f) => h('button', { class: 'chip btnlike' + ((f.base ? !fm : fm && fm.form_key === f.form_key) ? ' active' : ''), 'aria-pressed': String(f.base ? !fm : !!(fm && fm.form_key === f.form_key)),
        onclick: () => formNav(f.base ? null : f.form_key) }, f.form_name))));
  }
  if (fm) pane.append(h('div', { class: 'detail-body', style: { paddingBottom: 0 } }, notice('info', h('strong', null, fm.form_name + '. '),
    fm.note ? fm.note + ' ' : '', `Types: ${fm.types_source}. Stats: ${fm.stats_source}. Abilities: ${fm.abilities_source}.`,
    fm.in_client === false ? ' Your installed client dump has no record for this form.' : '',
    !fm.own_sprite ? ` Artwork: ${fm.art.local_reason} Add a sprite library in Settings › Data to show it.` : '', fm.mismatch.length ? ` ⚠ Your client differs from the manifest (${fm.mismatch.join(', ')}); the client value is shown.` : '',
    ' Moves and locations below are the base species’ — form-specific moves are not listed.')));
  const body = h('div', { class: 'detail-body' });
  pane.append(body);
  if (d.imported) {
    body.append(h('div', { class: 'facts' },
      fact('Catch rate', d.catch_rate), fact('Gender', d.gender.label), fact('Egg groups', d.egg_groups.map(cap).join(', ')),
      fact('EV yield', Object.entries(d.ev_yield).map(([k, v]) => `${v} ${STAT_ORDER.find((s) => s[0] === k)[1]}`).join(', ') || '—'),
      fact('Exp group', d.growth || '—')));
  }
  if (!d.imported) {
    body.append(notice('info', h('strong', null, 'Names, numbers and types are bundled. '), 'Install your own PokeMMO data once to see the rest of this page. It stays on this computer.'),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => go('#/settings/data') }, 'Install PokeMMO data')),
      availabilityBlock(d), typeMatchups(d), notesSection(d));
    return;
  }
  if (popout && mode === 'compact') { body.append(statsSection(d, true), availabilityBlock(d, true)); return; }
  const setTab = (t, side) => { ui.tab = t; ui.side = side ? t : null; renderDetail(pane, id, { back, popout, mode, form }); };
  const active = ui.side || ui.tab;
  body.append(h('div', { class: 'detail-tabs' },
    tabs(MAIN_TABS.map(([k, l]) => ({ id: k, label: l, count: k === 'locations' ? d.locations.length : undefined })), ui.side ? null : ui.tab, (t) => setTab(t, false), 'Pokédex pages'),
    h('div', { class: 'side-tabs', role: 'group', 'aria-label': 'Companion extras' }, h('span', { class: 'tiny muted' }, 'Companion:'),
      SIDE_TABS.map(([k, l]) => h('button', { class: 'chip btnlike' + (ui.side === k ? ' active' : ''), 'aria-pressed': String(ui.side === k), onclick: () => setTab(k, true) }, l)))));
  const section = { summary, moves, stats: (x) => statsSection(x), locations, evolution, matchups: typeMatchups, registration, breeding, notes: notesSection }[active] || summary;
  body.append(section(d));
}
const fact = (label, value) => h('div', { class: 'fact' }, h('div', { class: 'fl' }, label), h('div', { class: 'fv' }, String(value ?? '—')));
function favToggle(d) {
  const b = h('button', { class: 'fav-btn' + (d.fav ? ' on' : ''), title: 'Favourite', 'aria-pressed': String(d.fav), onclick: async () => {
    d.fav = !d.fav; b.classList.toggle('on', d.fav); b.querySelector('path').setAttribute('fill', d.fav ? 'currentColor' : 'none');
    await api('PUT', `/api/dex/species/${d.id}/favourite`, { fav: d.fav }); } }, icon('star'));
  if (d.fav) b.querySelector('path').setAttribute('fill', 'currentColor');
  return b;
}

const MEMBERSHIP = { yes: 'Listed', no: 'Not listed', unknown: 'Not checked yet', conditional: 'Conditional' };
const ELIG = { seen: 'Seen', owned: 'Owned', caught_ot: 'Caught OT', caught_alpha: 'Caught Alpha', owned_shiny: 'Owned Shiny', costume: 'Costume' };
function availabilityBlock(d, compact) {
  const av = d.availability;
  const mem = av.membership;
  const method = (m) => h('div', { class: 'avail-method' },
    h('div', { class: 'row wrap' }, h('strong', null, m.label), m.location ? h('span', null, '· ' + m.location) : null, m.region ? h('span', { class: 'chip' }, cap(m.region)) : null,
      h('span', { class: 'badge ' + ({ OFFICIAL: 'good', CORROBORATED: 'good', REPORTED: 'warn', DUMP_ONLY: 'dump' }[m.confidence] || 'unknown') }, m.confidence)),
    m.detail ? h('div', { class: 'small' }, m.detail) : null,
    m.prerequisites ? h('div', { class: 'small muted' }, 'Requires: ' + m.prerequisites) : null,
    m.active_window ? h('div', { class: 'small muted' }, 'When: ' + m.active_window) : null,
    m.since ? h('div', { class: 'small muted' }, 'Since: ' + m.since) : null,
    m.review ? h('div', { class: 'small', style: { color: 'var(--warn)' } }, `Needs review: “${m.review.patch}” (${m.review.date}) came after this was verified.`) : null,
    !compact && m.sources.length ? h('div', { class: 'tiny muted' }, 'Sources: ', m.sources.map((src, i) => [i ? ' · ' : '', src.url && src.url.startsWith('http') ? extLink(src.url, src.title) : src.title]),
      m.verified_at ? ` · verified ${m.verified_at}` : '') : null);
  const lines = [
    h('div', { class: 'label' }, 'How to get it in PokeMMO'),
    av.methods.map(method),
    av.note ? h('div', { class: 'small' }, av.note) : null,
    h('div', { class: 'row wrap small' }, h('span', { class: 'muted' }, 'In-game Pokédex listing:'),
      h('span', { class: 'badge ' + (mem.state === 'yes' ? 'good' : mem.state === 'no' ? 'bad' : 'unknown') }, MEMBERSHIP[mem.state] || mem.state),
      mem.basis === 'your-check' ? h('span', { class: 'tiny muted' }, `your check, ${fmtDate(mem.checked_at)}`) : null),
    mem.conflict ? h('div', { class: 'small', style: { color: 'var(--warn)' } }, mem.conflict) : null,
    !compact && Object.values(av.eligibility).some((v) => v !== 'unknown') ? h('div', { class: 'row wrap small' }, h('span', { class: 'muted' }, 'Counts toward:'),
      Object.entries(av.eligibility).filter(([, v]) => v !== 'unknown').map(([k, v]) => h('span', { class: 'chip' + (v === 'yes' ? ' good' : '') }, `${ELIG[k] || k}: ${v}`))) : null];
  if (!compact) lines.push(h('div', { class: 'row wrap' }, h('span', { class: 'small muted' }, 'Checked your in-game Pokédex?'),
    h('button', { class: 'btn small', onclick: async () => { await api('PUT', '/api/dex/roster/' + d.id, { in_dex: 'yes' }); toast('Saved your in-game check'); } }, 'It’s listed'),
    h('button', { class: 'btn small', onclick: async () => { await api('PUT', '/api/dex/roster/' + d.id, { in_dex: 'no' }); toast('Saved your in-game check'); } }, 'Not listed')));
  return h('div', { class: 'card inset stack tight avail-block' }, lines);
}

function summary(d) {
  const abil = h('div', { class: 'stack tight' }, d.abilities.map((a) => h('div', { class: 'row' }, h('span', { style: { fontWeight: 600 } }, a.name),
    h('span', { class: 'chip' }, a.slot === 'hidden' ? 'Hidden Ability' : d.abilities.filter((x) => x.slot !== 'hidden').length === 1 ? 'Ability' : 'Ability ' + a.slot.slice(-1)))));
  const overlay = d.overlays && d.overlays[0];
  return h('div', { class: 'stack' },
    h('div', { class: 'grid-2', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' } },
      h('div', null, h('div', { class: 'label', style: { marginBottom: '6px' } }, 'Abilities'), abil),
      h('dl', { class: 'kv' },
        h('dt', null, 'Height / weight'), h('dd', null, `${d.height_m} m · ${d.weight_kg} kg`),
        h('dt', null, 'Wild held items'), h('dd', null, d.held_items.length ? d.held_items.join(', ') : '—'),
        h('dt', null, 'Forms'), h('dd', null, d.forms.filter((f) => f.name && f.name !== 'Egg').map((f) => f.name + (f.costume ? ' (costume)' : '')).join(', ') || '—'),
        overlay ? [h('dt', null, 'Patch note'), h('dd', null, overlay.note)] : null)),
    availabilityBlock(d),
    h('div', { class: 'tiny muted' }, 'Stats, moves and locations come from your installed dump. The dump’s raw “obtainable” flag ',
      `(${d.obtainable_flag}) is not used for availability.`, d.types_raw_duplicated ? ' The dump lists this single type twice; it is shown once.' : ''));
}

// Bars are drawn against 255 (the highest possible base stat) and 720 for the total, so proportions are exact.
const STAT_MAX = 255, BST_MAX = 720;
function statsSection(d, compact) {
  const bar = (v, max) => h('div', { class: 'bar', role: 'presentation' }, h('span', { style: { width: Math.min(100, (v || 0) / max * 100).toFixed(1) + '%' } }));
  return h('div', { class: 'stack tight' }, h('div', { class: 'cells stats-big' + (compact ? ' compact' : '') }, STAT_ORDER.map(([k, label]) =>
    h('div', { class: 'stat-row', dataset: { stat: k }, style: { '--stat-c': `var(--stat-${k})` }, 'aria-label': `${label} ${d.stats[k] ?? 'unknown'}` },
      h('span', { class: 'lbl' }, label), h('span', { class: 'val' }, d.stats[k] ?? '—'), bar(d.stats[k], STAT_MAX))),
  h('div', { class: 'stat-row total', 'aria-label': `Total ${d.bst}` }, h('span', { class: 'lbl' }, 'Total'), h('span', { class: 'val' }, d.bst), bar(d.bst, BST_MAX))),
  compact ? h('div', { class: 'small' }, 'Abilities: ', d.abilities.map((a) => a.name + (a.slot === 'hidden' ? ' (HA)' : '')).join(', ')) : null);
}

function typeMatchups(d) {
  const m = d.type_matchups;
  const row = (k, label, cls) => (m.groups[k].length ? h('div', { class: 'row wrap', style: { alignItems: 'center' } },
    h('span', { class: 'mult ' + cls, style: { minWidth: '44px' } }, label), m.groups[k].map((t) => typeChip(t, true))) : null);
  return h('div', { class: 'stack tight' }, h('div', { class: 'small muted' }, `Damage taken by ${d.name} (${d.types.join(' / ')}) from each attacking type:`),
    row('4', '4×', 'm4'), row('2', '2×', 'm2'), row('0.5', '½×', 'm05'), row('0.25', '¼×', 'm025'), row('0', '0×', 'm0'),
    h('details', null, h('summary', { class: 'small', style: { cursor: 'pointer' } }, `Normal damage (1×): ${m.groups['1'].length} types`),
      h('div', { class: 'row wrap', style: { marginTop: '6px' } }, m.groups['1'].map((t) => typeChip(t, true)))),
    h('div', { class: 'tiny muted' }, m.note, ' ', h('a', { href: '#/tools/typechart' }, 'Open the full type chart')));
}

const SEASONS = ['all', 'Spring', 'Summer', 'Autumn', 'Winter'];
function rateCell(r) { return h('td', { class: 'rate ' + r.kind, title: r.raw || '' }, r.label); }
function locations(d) {
  const wrap = h('div', { class: 'stack' });
  const av = d.availability;
  if (av.classes[0] !== 'wild' && av.methods[0].basis === 'registry') wrap.append(notice('info', h('strong', null, av.label), ' — ordinary wild rows don’t cover this. See Summary for sources.'));
  if (!d.locations.length) { wrap.append(h('div', { class: 'empty' }, h('h3', null, 'No ordinary wild locations in your dump'),
    h('p', null, 'That alone does not mean unobtainable — see Summary › availability for evolution, breeding, gift, fossil, roamer, raid or story sources.'))); return wrap; }
  const draw = () => {
    const rows = d.locations.filter((l) => ui.locSeason === 'all' || l.season === ui.locSeason || l.season === 'Any');
    const groups = {};
    for (const l of rows) (groups[`${l.region}|${l.area}`] ||= []).push(l);
    const out = h('div', { class: 'stack tight' });
    for (const [key, ls] of Object.entries(groups)) {
      const [region, area] = key.split('|');
      const seen = new Map();
      for (const l of ls) {
        const sig = [l.method, l.min, l.max, l.horde3, l.horde5, l.morning.label, l.day.label, l.night.label].join('|');
        if (!seen.has(sig)) seen.set(sig, { ...l, seasons: [l.season] }); else seen.get(sig).seasons.push(l.season);
      }
      const lid = ls[0].location_id != null ? `${region}:${ls[0].location_id}` : `${region}:${area}`;
      out.append(h('div', { class: 'loc-group' }, h('div', { class: 'lg-head' }, h('span', { class: 'chip' }, cap(region)),
        h('a', { href: '#/tools/locations/' + encodeURIComponent(lid), title: 'Open in the Location explorer' }, area)),
        h('table', { class: 'table compact' }, h('thead', null, h('tr', null, ['Type', 'Levels', 'Horde', 'Season', 'Morning', 'Day', 'Night'].map((c) => h('th', null, c)))),
          h('tbody', null, [...seen.values()].map((l) => h('tr', null, h('td', null, l.method), h('td', { class: 'nowrap' }, l.min === l.max ? l.min : `${l.min}–${l.max}`),
            h('td', null, l.horde5 ? '×5' : l.horde3 ? '×3' : '—'), h('td', { class: 'small' }, l.seasons.join(', ')), rateCell(l.morning), rateCell(l.day), rateCell(l.night)))))));
    }
    return out;
  };
  const holder = h('div');
  const redraw = () => mount(holder, draw());
  wrap.append(h('div', { class: 'row wrap' }, h('span', { class: 'label' }, 'Season'), seg(SEASONS.map((s) => [s, s === 'all' ? 'All' : s]), ui.locSeason, (v) => { ui.locSeason = v; redraw(); }, 'Season')),
    h('p', { class: 'tiny muted', style: { margin: 0 } }, '“Lure only”, “Special” and “Unknown rate” are shown exactly as the dump states them — never as 0% or 100%. Percentages are from your dump and may predate later patches (e.g. 29 Jul 2026 encounter rebuild, Altering Cave rotation).'),
    holder);
  redraw();
  return wrap;
}

// One continuous moves table (2026-11-23). Every method a move is learned by stays on its row, with its level;
// methods are the client's own (Start = level 1 in your dump). TM/HM come from the client's "TM??" label, read
// against the machine items in your client's item data — the "??" stays in the badge's details.
const MOVE_FILTERS = [['all', 'All'], ['levelup', 'Level-up', ['start', 'level']], ['machine', 'TM/HM', ['machine']], ['egg', 'Egg', ['egg', 'egg-item']],
  ['tutor', 'Tutor', ['tutor']], ['evolve', 'Evolve', ['evolve']], ['other', 'Other', ['special', 'prevo', 'other']]];
const MOVE_SORTS = { method: 'Method', level: 'Level', name: 'Move', type: 'Type' };
const METHOD_RANK = ['start', 'level', 'evolve', 'machine', 'egg', 'egg-item', 'tutor', 'special', 'prevo', 'other'];
function methodBadge(m) {
  const lvl = m.code === 'level' ? ` ${m.level}` : '';
  const title = m.code === 'start' ? 'Known from the start (level 1 in your dump)' : m.code === 'level' ? `Learned at level ${m.level}` : m.note || `Learn method in your dump: ${m.raw}`;
  const item = (m.machine_items || [])[0];
  const badge = h(item ? 'a' : 'span', { class: `mv-badge mv-${m.code}`, title, 'aria-label': `${m.label}${lvl}. ${title}`, href: item ? `#/tools/items/${item.item_id}` : null }, m.label + lvl);
  if (m.code === 'machine') badge.append(h('sup', { class: 'mv-q', 'aria-hidden': 'true' }, '?'));
  return badge;
}
function moves(d) {
  const rows = d.move_rows || [];
  ui.moveFilter = ui.moveFilter || 'all';
  ui.moveSort = ui.moveSort || 'method';
  const holder = h('div', { class: 'moves-scroll' });
  const firstRank = (r) => Math.min(...r.methods.map((m) => (METHOD_RANK.indexOf(m.code) + 1 || 99)));
  const cmp = {
    method: (a, b) => firstRank(a) - firstRank(b) || (a.min_level ?? 999) - (b.min_level ?? 999) || a.name.localeCompare(b.name),
    level: (a, b) => (a.min_level ?? 999) - (b.min_level ?? 999) || firstRank(a) - firstRank(b) || a.name.localeCompare(b.name),
    name: (a, b) => a.name.localeCompare(b.name),
    type: (a, b) => (a.type || '~').localeCompare(b.type || '~') || a.name.localeCompare(b.name),
  };
  const counts = Object.fromEntries(MOVE_FILTERS.map(([k, , codes]) => [k, codes ? rows.filter((r) => r.methods.some((m) => codes.includes(m.code))).length : rows.length]));
  const dash = (title) => h('span', { class: 'muted', title }, '—');
  const draw = () => {
    const f = MOVE_FILTERS.find((x) => x[0] === ui.moveFilter) || MOVE_FILTERS[0];
    const list = rows.filter((r) => !f[2] || r.methods.some((m) => f[2].includes(m.code))).sort(cmp[ui.moveSort]);
    const th = (label, key) => h('th', key ? { 'aria-sort': ui.moveSort === key ? 'ascending' : 'none' } : null,
      key ? h('button', { class: 'th-sort' + (ui.moveSort === key ? ' on' : ''), onclick: () => { ui.moveSort = key; draw(); } }, label) : label);
    mount(holder, list.length ? h('table', { class: 'table compact moves-table' },
      h('thead', null, h('tr', null, th('Method', 'method'), th('Level', 'level'), th('Move', 'name'), th('Type', 'type'), th('Category'), th('Power'), th('Accuracy'), th('PP'))),
      h('tbody', null, list.map((r) => {
        const miss = 'Not in your client dump';
        const levels = r.methods.filter((m) => m.level != null).map((m) => m.level);
        return h('tr', { dataset: { move: r.name } },
          h('td', { class: 'mv-methods' }, r.methods.map(methodBadge)),
          h('td', { class: 'num' }, levels.length ? levels.join(', ') : dash('No level for this method')),
          h('td', { class: 'mv-name' }, r.name),
          h('td', null, r.type ? typeChip(r.type, true) : dash(miss)),
          h('td', { class: 'small' }, r.category || dash(miss)),
          h('td', { class: 'num' }, r.power ? r.power : r.verified_meta ? dash('No base power (status or variable)') : dash(miss)),
          h('td', { class: 'num' }, r.accuracy == null ? dash(miss) : r.accuracy > 100 ? dash('Never misses') : r.accuracy),
          h('td', { class: 'num' }, r.pp ?? dash(miss)));
      }))) : h('div', { class: 'empty' }, 'No moves for this method.'));
  };
  const wrap = h('div', { class: 'stack tight' },
    h('div', { class: 'row wrap moves-tools' },
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Show moves learned by' }, MOVE_FILTERS.filter(([k]) => k === 'all' || counts[k]).map(([k, label]) =>
        h('button', { class: 'chip btnlike' + (ui.moveFilter === k ? ' active' : ''), 'aria-pressed': String(ui.moveFilter === k), onclick: (e) => {
          const me = e.currentTarget; ui.moveFilter = k;
          me.parentElement.querySelectorAll('.chip').forEach((c) => { c.classList.toggle('active', c === me); c.setAttribute('aria-pressed', String(c === me)); }); draw(); } },
          label, h('span', { class: 'count' }, counts[k])))),
      h('span', { class: 'grow' }), h('span', { class: 'tiny muted' }, `${rows.length} moves`)),
    holder,
    counts.machine ? h('p', { class: 'tiny muted', style: { margin: 0 } }, 'TM/HM', h('sup', null, '?'),
      ': your client lists these as “TM??”. The badge says TM or HM when your client also has that machine item (select it to open the item). Where to get a machine, and its price, are not covered.') : null);
  draw();
  return wrap;
}

function evolution(d) {
  const chain = d.evolution_chain;
  if (!chain.length || chain.length === 1) return h('div', { class: 'empty' }, 'This species does not evolve (according to your dump).');
  const byDepth = {};
  chain.forEach((n) => (byDepth[n.depth] ||= []).push(n));
  const row = h('div', { class: 'evo' });
  Object.keys(byDepth).sort().forEach((depth, i) => {
    if (i > 0) row.append(h('div', { class: 'arrow' }, byDepth[depth].map((n) => h('div', null, '→ ', evoText(n.via)))));
    row.append(h('div', { class: 'stack tight' }, byDepth[depth].map((n) => h('div', { class: 'node', role: 'button', tabindex: '0', onclick: () => go('#/pokedex/' + n.id),
      style: n.id === d.id ? { borderColor: 'var(--accent)' } : null }, spriteOrFallback(n.icon, { id: n.id, name: n.name, types: [] }, 48), h('span', { class: 'small' }, n.name)))));
  });
  return h('div', { class: 'stack' }, row, h('p', { class: 'tiny muted', style: { margin: 0 } }, 'Evolution methods from your dump; region- or form-specific details are not verified.'));
}
function registration(d) {
  const run = d.progress_run;
  if (!run) return h('div', { class: 'stack tight' }, notice('info', 'Registration is not being tracked. Choose a character run in the Pokédex toolbar (“Registration: …”) to record Seen / Owned / Caught OT / Alpha / Shiny / Costume for that character.'),
    h('div', { class: 'small muted' }, 'The Companion cannot read your PokeMMO account; everything here is entered by you.'));
  const p = { ...(d.progress || { status: 'unregistered' }) };
  const save = async () => { await api('PUT', `/api/dex/progress/${run}/${d.id}`, p); toast('Saved'); state.dexCache = null; staleGrid = true; };
  return h('div', { class: 'stack' }, h('div', { class: 'small muted' }, 'Your manual record for the selected character. Not read from your account.'),
    seg(REG_LEVELS, p.status, (v) => { p.status = v; save(); }, 'Registration status'),
    h('div', { class: 'row wrap' }, [['caught_alpha', 'Caught Alpha'], ['owned_shiny', 'Owned Shiny'], ['owned_costume', 'Owned Costume']].map(([k, l]) =>
      h('label', { class: 'chip btnlike' + (p[k] ? ' active' : '') }, h('input', { type: 'checkbox', class: 'check', checked: !!p[k], onchange: (e) => { p[k] = e.target.checked; save(); } }), l))));
}
function breeding(d) {
  const cannot = d.egg_groups.includes('cannot breed');
  return h('div', { class: 'stack' },
    h('dl', { class: 'kv' }, h('dt', null, 'Egg groups'), h('dd', null, d.egg_groups.map(cap).join(', ')), h('dt', null, 'Gender'), h('dd', null, d.gender.label)),
    cannot ? notice('warn', 'In the “cannot breed” egg group.') : null,
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn primary', disabled: cannot ? 'disabled' : null, onclick: () => go(`#/tools/breeding?a=${d.id}`) }, icon('egg'), 'Use as Parent A in Breeding Preview'),
      h('button', { class: 'btn', disabled: cannot ? 'disabled' : null, onclick: () => go(`#/tools/breeding?tab=eggmoves&species=${d.id}`) }, 'Egg move candidates')),
    h('p', { class: 'tiny muted', style: { margin: 0 } }, 'Compatibility uses standard egg-group rules. PokeMMO inheritance details (IV distribution, HA, Alpha, shiny, costumes) are not validated.'));
}
function notesSection(d) {
  const save = debounce(async (v) => { await api('PUT', `/api/dex/species/${d.id}/note`, { body: v }); status.textContent = 'Saved'; }, 500);
  const status = h('span', { class: 'tiny muted' }, d.note ? 'Saved' : '');
  return h('div', { class: 'stack' },
    h('div', { class: 'stack tight' }, h('div', { class: 'row' }, h('span', { class: 'label' }, 'Quick species note (saved on this computer)'), h('span', { class: 'grow' }), status),
      h('textarea', { class: 'input', rows: 4, placeholder: 'Hunting spots you like, natures you want, reminders…', oninput: (e) => { status.textContent = 'Saving…'; save(e.target.value); } }, d.note || '')),
    linkedNotes('species', String(d.id), d.base_name || d.name),
    h('div', { class: 'stack tight' }, h('div', { class: 'row' }, h('span', { class: 'label' }, `In My Box (${(d.box_entries || []).length})`), h('span', { class: 'grow' }),
      h('button', { class: 'btn small', onclick: () => openRoute(`#/collection/pokemon/new?species=${d.id}`) }, icon('plus'), 'Add to My Box')),
    (d.box_entries || []).length ? h('div', { class: 'row wrap' }, d.box_entries.map((e) => h('button', { class: 'mini-mon', onclick: () => openRoute('#/collection/pokemon/' + e.id) },
      e.icon ? h('img', { class: 'pixel', src: e.icon, alt: '', width: 32, height: 32 }) : null, h('span', { class: 'small' }, (e.nickname || e.species_name) + (e.shiny ? ' ✦' : '') + (e.alpha ? ' α' : ''))))) :
      h('div', { class: 'small muted' }, 'No Box entries for this species.')));
}
