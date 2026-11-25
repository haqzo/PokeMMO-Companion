import { lang, number, t as translateUI, uiLabel } from '../i18n.js';
import { compareLabels, formLabel, gameTerm, matchesTerm, searchText, speciesCategory, speciesLabel, speciesMatches } from '../game-locale.js';
// Pokédex (docs/design/06, 19 + 2026-11-22 accuracy pass).
// Main Pokédex shows one tile for each of 649 Gen I–V species. The 82 researched
// alternate forms remain selectable INSIDE their species details, not as duplicate cards.
// Reference catalog, in-game membership, acquisition and manual registration stay independent.
import { animatedIn, motionGlobal, spriteScale } from '../sprites.js';
import { h, mount, clear, icon, get, api, post, state, setting, saveSettings, on, badge, notice, typeChip, typeChips, pad3, cap,
  spriteOrFallback, silhouette, sizedSprite, fitSprite, debounce, tabs, seg, toast, extLink, modal, relTime, fmtDate, WINDOW_ID, sourceInfo } from '../core.js';
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
const GEN_NAMES = ['I', 'II', 'III', 'IV', 'V'];
const statLabel = (key) => key === 'bst' ? translateUI('dex.stat_total') : uiLabel(STAT_ORDER.find(([id]) => id === key)?.[1] || key);
const entryRoute = (s) => '#/pokedex/' + s.id + (s.form_key ? '/' + s.form_key : '');
const DEFAULT_F = { q: '', gen: 'all', types: [], typeSlot: 'any', region: '', horde: '', egg: '', fav: false, sort: 'num', season: '',
  ability: '', held: '', statKey: '', statMin: '', classes: [], reg: [] };
let F = null;
let ui = { drawer: false, tab: 'summary', side: null, scroll: 0, locSeason: 'all', moveFilter: 'all', moveSort: 'method', shiny: null, shinyFor: null, anim: null, female: false };
let unsub = [];
let gridEl = null, countEl = null, meta = null;

export function dispose({ keepCards = false } = {}) {
  unsub.forEach((u) => u()); unsub = [];
  releaseGridArt(gridEl);
  if (!keepCards) { cardCache.cards.clear(); cardCache.list = null; }
  gridEl = null; countEl = null; lastFocus = null;
}

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
let formTextLanguage, formTextFor = null, formTextMap = new Map();
function formText() {
  if (formTextFor !== state.dexForms || formTextLanguage !== setting('app.language')) {
    formTextFor = state.dexForms; formTextLanguage = setting('app.language'); formTextMap = new Map();
    for (const f of state.dexForms || []) formTextMap.set(f.id, (formTextMap.get(f.id) || '') + ' ' + searchText([f.form_name, f.name, formLabel(f.id, f.form_name)].filter(Boolean).join(' ')));
  }
  return formTextMap;
}
// Main-grid card elements are built once per loaded list and reused by filters, search, sort and returning to the page.
// Anything that changes a card's content (favourite, registration, import) reloads the list, which empties this cache.
const cardCache = { list: null, sig: '', cards: new Map() };
const persistFilters = debounce(() => saveSettings({ 'pokedex.filters': { ...F, q: '' } }).catch(() => {}), 700);
export function currentFilters() { if (!F) F = { ...DEFAULT_F, ...(setting('pokedex.filters') || {}) }; return F; }

export function applyFilters(all, f = currentFilters(), scope = setting('pokedex.scope')) {
  const q = searchText(f.q);
  const tracking = !!setting('pokedex.progress_run');
  const out = all.filter((s) => {
    if (scope === 'pokemmo' && s.dex === 'no') return false;
    if (q) {
      const formHit = (formText().get(s.id) || '').includes(q);
      const hit = speciesMatches(s, q) || formHit ||
        (s.abilities || []).some((a) => matchesTerm('ability', a, q)) || s.types.some((type) => matchesTerm('type', type, q));
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
    if (f.ability && !(s.abilities || []).some((a) => matchesTerm('ability', a, f.ability))) return false;
    if (f.held && !(s.held_items || []).some((a) => matchesTerm('item', a, f.held))) return false;
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
  const by = { num: (a, b) => a.id - b.id || (a.form_key ? 1 : 0) - (b.form_key ? 1 : 0), name: (a, b) => compareLabels(speciesLabel(a.id, a.name), speciesLabel(b.id, b.name)), bst: (a, b) => (b.bst || 0) - (a.bst || 0) || a.id - b.id,
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
      h('div', { class: 'dex-summary', role: 'dialog', 'aria-modal': 'true', 'aria-label': translateUI('ui.species_summary'), tabindex: '-1' }));
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
  dispose({ keepCards: true });
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
  gridEl = h('div', { class: 'dex-grid density-' + (setting('pokedex.density') || 'standard'), role: 'grid', 'aria-label': translateUI('ui.pokemon') });
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
  const search = h('input', { id: 'dex-search', class: 'input', type: 'search', placeholder: translateUI('ui.search_dex'), value: F.q,
    'aria-label': translateUI('ui.search_pokemon'), oninput: debounce((e) => { F.q = e.target.value; drawGrid(all); }, 120) });
  countEl = h('span', { class: 'small muted nowrap' });
  const filterBtn = h('button', { class: 'btn' + (ui.drawer ? ' primary' : ''), 'aria-expanded': String(ui.drawer), onclick: () => { ui.drawer = !ui.drawer; rerender(); } },
    icon('filter'), translateUI('ui.filters'), activeFilterCount() ? h('span', { class: 'chip', style: { padding: '0 6px' } }, activeFilterCount()) : null);
  const sort = h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': translateUI('ui.sort'), onchange: (e) => { F.sort = e.target.value; persistFilters(); drawGrid(all); } },
    [['num', translateUI('ui.national_number')], ['name', translateUI('ui.name_az')], ['bst', translateUI('ui.bst')], ['fav', translateUI('ui.favourites_first')]].map(([v, t]) =>
      h('option', { value: v, selected: F.sort === v ? 'selected' : null, disabled: v === 'bst' && !state.boot.dex.imported ? 'disabled' : null }, t)));
  wrap.append(h('div', { class: 'dex-toolbar' },
    h('div', { class: 'search' }, icon('search'), search),
    seg([['all', translateUI('ui.all')], ['1', 'I'], ['2', 'II'], ['3', 'III'], ['4', 'IV'], ['5', 'V']], F.gen, (v) => { F.gen = v; persistFilters(); rerender(); }, translateUI('dex.generation_filter')),
    filterBtn, sort,
    seg([['compact', translateUI('ui.small')], ['standard', translateUI('ui.medium')], ['large', translateUI('ui.large')]], setting('pokedex.density') || 'standard', async (v) => {
      await saveSettings({ 'pokedex.density': v }); gridEl.className = 'dex-grid density-' + v; drawGrid(all); }, translateUI('dex.card_size')),
    // Display only: never ownership, never availability. Cards are updated in place (filters & scroll stay).
    seg([['normal', translateUI('ui.normal')], ['shiny', translateUI('ui.shiny')]], setting('pokedex.shiny') ? 'shiny' : 'normal', async (v) => {
      await saveSettings({ 'pokedex.shiny': v === 'shiny' }); refreshGridArt(); }, translateUI('dex.art_colours_choice')),
    seg([['static', translateUI('ui.static')], ['animated', translateUI('ui.animated')]], animatedIn('dex_grid') ? 'animated' : 'static', async (v) => {
      await saveSettings({ 'sprites.animation': { ...(setting('sprites.animation') || {}), dex_grid: v } }); refreshGridArt(); }, translateUI('dex.art_motion_choice')),
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
  const runSel = h('select', { class: 'input', style: { width: 'auto', minHeight: '28px', padding: '2px 6px' }, 'aria-label': translateUI('dex.registration_tracking'),
    onchange: async (e) => { await saveSettings({ 'pokedex.progress_run': e.target.value || null }); await loadList(true); rerender(); } },
  h('option', { value: '' }, translateUI('dex.registration_inactive')),
  runs.runs.map((r) => h('option', { value: r.id, selected: r.id === runId ? 'selected' : null }, translateUI('dex.registration_run', { character: r.display }))));
  const counters = h('div', { class: 'row wrap small' });
  if (runId) {
    get(`/api/dex/progress/${runId}/counts?scope=${scope}`).then((c) => mount(counters,
      [['Seen', c.seen], ['Owned', c.owned], ['Caught OT', c.caught_ot], ['Caught Alpha', c.caught_alpha], ['Owned Shiny', c.owned_shiny], ['Costumes', c.owned_costume]]
        .map(([l, v]) => h('span', { class: 'counter' }, h('span', { class: 'muted' }, uiLabel(l) + ' '), h('strong', null, v))),
      h('span', { class: 'tiny muted', title: uiLabel(c.note) }, translateUI('dex.counter_scope')))).catch(() => {});
  }
  return h('div', { class: 'dex-info' },
    h('div', { class: 'row wrap grow', style: { gap: '6px 14px' } },
      countEl,
      h('button', { class: 'src-info', type: 'button', 'aria-label': translateUI('dex.about_list'),
        title: translateUI('dex.catalog_info', {
          count: number(all.length), forms: forms ? translateUI('dex.catalog_forms', { count: number(forms) }) : '',
          registry: reg ? translateUI('dex.catalog_registry', { version: reg.registry_version }) : '',
        }),
        onclick: (e) => toast(e.currentTarget.title, { timeout: 8000 }) }, icon('info')),
      scope === 'pokemmo' && hidden ? h('span', { class: 'small muted' }, translateUI('dex.catalog_hidden', { count: number(hidden) })) : null,
      h('button', { class: 'btn ghost small', onclick: rosterDialog, title: translateUI('dex.availability_details') }, translateUI('ui.availability_report'))),
    h('div', { class: 'row wrap', style: { gap: '6px 12px' } }, runs.runs.length ? runSel : null, counters));
}

function filterDrawer(all) {
  const imported = state.boot.dex.imported;
  const redraw = () => { persistFilters(); rerender(); };
  const chip = (label, on_, fn, disabled) => h('button', { class: 'chip btnlike' + (on_ ? ' active' : ''), disabled: disabled ? 'disabled' : null, 'aria-pressed': String(!!on_), onclick: fn }, label);
  const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const eggGroups = [...new Set(all.flatMap((s) => s.egg_groups || []))].sort();
  const tracking = !!setting('pokedex.progress_run');
  return h('div', { class: 'filter-drawer' },
    h('div', { class: 'fgroup wide' }, h('span', { class: 'label' }, translateUI('ui.type')), h('div', { class: 'chips' },
      TYPES.map((t) => h('button', { class: 'chip btnlike' + (F.types.includes(t) ? ' active' : ''), 'aria-pressed': String(F.types.includes(t)), onclick: () => {
        F.types = F.types.includes(t) ? F.types.filter((x) => x !== t) : [...F.types, t].slice(-2); redraw(); } }, typeChip(t, true)))),
    seg([['any', translateUI('dex.all_selected_types')], ['primary', translateUI('dex.primary_type')], ['secondary', translateUI('dex.secondary_type')]], F.typeSlot, (v) => { F.typeSlot = v; redraw(); }, translateUI('dex.type_slot'))),
    h('div', { class: 'fgroup' }, h('span', { class: 'label' }, translateUI('dex.acquisition_filter')), h('div', { class: 'chips' },
      TAG_CHIPS.map(([k, l]) => chip(uiLabel(l), F.classes.includes(k), () => { F.classes = toggle(F.classes, k); redraw(); })),
      chip(translateUI('dex.hide_unlisted'), setting('pokedex.scope') === 'pokemmo', async () => {
        await saveSettings({ 'pokedex.scope': setting('pokedex.scope') === 'pokemmo' ? 'reference' : 'pokemmo' }); rerender(); }))),
    tracking ? h('div', { class: 'fgroup' }, h('span', { class: 'label' }, translateUI('dex.manual_registration')), h('div', { class: 'chips' },
      [...REG_LEVELS, ['caught_alpha', 'Caught Alpha'], ['owned_shiny', 'Owned Shiny'], ['owned_costume', 'Owned Costume']].map(([k, l]) =>
        chip(uiLabel(l), F.reg.includes(k), () => { F.reg = toggle(F.reg, k); redraw(); })))) : null,
    h('div', { class: 'fgroup' }, h('span', { class: 'label' }, translateUI(imported ? 'dex.encounter_region' : 'dex.encounter_region_needs_data')), h('div', { class: 'chips' },
      chip(translateUI('dex.any'), !F.region, () => { F.region = ''; redraw(); }, !imported),
      REGIONS.map((r) => chip(gameTerm('region', cap(r)), F.region === r, () => { F.region = F.region === r ? '' : r; redraw(); }, !imported)))),
    h('div', { class: 'fgroup' }, h('span', { class: 'label' }, translateUI('dex.hunting')), h('div', { class: 'chips' },
      chip(translateUI('dex.any'), !F.horde, () => { F.horde = ''; redraw(); }, !imported), chip(translateUI('dex.any_horde'), F.horde === 'any', () => { F.horde = F.horde === 'any' ? '' : 'any'; redraw(); }, !imported),
      chip(translateUI('dex.horde_five'), F.horde === '5', () => { F.horde = F.horde === '5' ? '' : '5'; redraw(); }, !imported))),
    h('div', { class: 'fgroup' }, h('span', { class: 'label' }, translateUI('ui.season')), h('div', { class: 'chips' },
      chip(translateUI('dex.any'), !F.season, () => { F.season = ''; redraw(); }, !imported),
      ['Spring', 'Summer', 'Autumn', 'Winter'].map((s) => chip(uiLabel(s), F.season === s, () => { F.season = F.season === s ? '' : s; redraw(); }, !imported)))),
    h('div', { class: 'fgroup' }, h('span', { class: 'label' }, translateUI('ui.egg_group')),
      h('select', { class: 'input', disabled: imported ? null : 'disabled', onchange: (e) => { F.egg = e.target.value; redraw(); } },
        h('option', { value: '' }, translateUI('dex.any')), eggGroups.map((g) => h('option', { value: g, selected: F.egg === g ? 'selected' : null }, gameTerm('egg', g))))),
    h('div', { class: 'fgroup' }, h('span', { class: 'label' }, translateUI('dex.ability_contains')),
      h('input', { class: 'input', value: F.ability, disabled: imported ? null : 'disabled', placeholder: translateUI('dex.ability_example'), onchange: (e) => { F.ability = e.target.value.trim(); redraw(); } })),
    h('div', { class: 'fgroup' }, h('span', { class: 'label' }, translateUI('dex.held_contains')),
      h('input', { class: 'input', value: F.held, disabled: imported ? null : 'disabled', placeholder: translateUI('dex.held_example'), onchange: (e) => { F.held = e.target.value.trim(); redraw(); } })),
    h('div', { class: 'fgroup' }, h('span', { class: 'label' }, translateUI('dex.minimum_stat')), h('div', { class: 'row' },
      h('select', { class: 'input', style: { width: 'auto' }, disabled: imported ? null : 'disabled', onchange: (e) => { F.statKey = e.target.value; redraw(); } },
        h('option', { value: '' }, translateUI('dex.stat_placeholder')), [...STAT_ORDER, ['bst', translateUI('dex.stat_total')]].map(([k, l]) => h('option', { value: k, selected: F.statKey === k ? 'selected' : null }, uiLabel(l)))),
      h('input', { class: 'input', type: 'number', min: 1, max: 720, style: { width: '90px' }, value: F.statMin, disabled: imported ? null : 'disabled',
        onchange: (e) => { F.statMin = e.target.value; redraw(); } }))),
    h('div', { class: 'fgroup' }, h('span', { class: 'label' }, translateUI('dex.personal')), h('div', { class: 'chips' },
      chip(translateUI('dex.favourites_only'), F.fav, () => { F.fav = !F.fav; redraw(); }))),
    h('div', { class: 'fgroup', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn ghost small', onclick: () => { F = { ...DEFAULT_F, q: F.q, sort: F.sort }; redraw(); } }, translateUI('dex.clear_filters'))),
    h('p', { class: 'tiny muted', style: { flexBasis: '100%', margin: 0 } },
      translateUI('dex.filter_help')));
}
function activeChips() {
  if (!activeFilterCount() && F.gen === 'all') return null;
  const redraw = () => { persistFilters(); rerender(); };
  const c = [];
  if (F.gen !== 'all') c.push([translateUI('dex.generation_short', { generation: GEN_NAMES[Number(F.gen) - 1] || F.gen }), () => { F.gen = 'all'; }]);
  F.types.forEach((t) => c.push([gameTerm('type', t) + (F.typeSlot !== 'any' ? ` (${translateUI(F.typeSlot === 'primary' ? 'dex.primary_type' : 'dex.secondary_type')})` : ''), () => { F.types = F.types.filter((x) => x !== t); }]));
  if (F.region) c.push([gameTerm('region', cap(F.region)), () => { F.region = ''; }]);
  if (F.horde) c.push([F.horde === '5' ? translateUI('dex.horde_five') : translateUI('dex.horde'), () => { F.horde = ''; }]);
  if (F.season) c.push([uiLabel(F.season), () => { F.season = ''; }]);
  if (F.egg) c.push([translateUI('dex.filter_egg', { value: gameTerm('egg', F.egg) }), () => { F.egg = ''; }]);
  if (F.ability) c.push([translateUI('dex.filter_ability', { value: F.ability }), () => { F.ability = ''; }]);
  if (F.held) c.push([translateUI('dex.filter_held', { value: F.held }), () => { F.held = ''; }]);
  if (F.statKey && F.statMin !== '') c.push([`${statLabel(F.statKey)} ≥ ${F.statMin}`, () => { F.statKey = ''; F.statMin = ''; }]);
  F.classes.forEach((k) => c.push([uiLabel(TAG_CHIPS.find(([id]) => id === k)?.[1] || k), () => { F.classes = F.classes.filter((x) => x !== k); }]));
  F.reg.forEach((k) => c.push([registrationLabel(k), () => { F.reg = F.reg.filter((x) => x !== k); }]));
  if (F.fav) c.push([translateUI('dex.favourites'), () => { F.fav = false; }]);
  return h('div', { class: 'active-filters', style: { padding: '6px 16px', borderBottom: '1px solid var(--border-subtle)' } },
    h('span', { class: 'tiny muted' }, translateUI('dex.active_filters')), c.map(([l, fn]) => h('button', { class: 'chip btnlike', onclick: () => { fn(); redraw(); }, title: translateUI('dex.remove_filter') }, l, ' ✕')),
    h('button', { class: 'btn ghost small', onclick: () => { F = { ...DEFAULT_F, q: F.q, sort: F.sort }; redraw(); } }, translateUI('dex.clear_all')));
}

function drawGrid(all, sel = Number(parseHash().parts[0]) || null, selForm = parseHash().parts[1] || null) {
  if (!gridEl) return;
  const list = applyFilters(all);
  const scope = setting('pokedex.scope') || 'reference';
  const inScope = all.filter((s) => scope !== 'pokemmo' || s.dex !== 'no').length;
  if (countEl) countEl.textContent = translateUI('dex.catalog_count', { shown: number(list.length), total: number(inScope) });
  releaseGridArt(gridEl);
  clear(gridEl);
  if (!list.length) {
    cardCache.cards.clear();
    gridEl.append(h('div', { class: 'empty', style: { gridColumn: '1 / -1' } }, h('h3', null, translateUI('dex.no_species_match')),
      activeFilterCount() || F.q || F.gen !== 'all' ? h('p', null, translateUI('dex.search_hides_all'), h('button', { class: 'btn small', onclick: () => {
        F = { ...DEFAULT_F, sort: F.sort }; persistFilters(); rerender(); } }, translateUI('dex.clear_search_filters'))) : null));
    return;
  }
  const density = setting('pokedex.density') || 'standard';
  const tracking = !!setting('pokedex.progress_run');
  const sig = `${density}|${tracking}`;
  if (cardCache.list !== all || cardCache.sig !== sig || cardCache.language !== setting('app.language')) { cardCache.list = all; cardCache.sig = sig; cardCache.language = setting('app.language'); cardCache.cards = new Map(); }
  const keys = new Set(list.map(s => s.form_key ? `${s.id}:${s.form_key}` : String(s.id)));
  for (const key of cardCache.cards.keys()) if (!keys.has(key)) cardCache.cards.delete(key);
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
      frag.append(h('h3', { class: 'gen-head', role: 'presentation' }, translateUI('dex.generation', { generation: GEN_NAMES[gen - 1] || gen }), h('span', { class: 'tiny muted' }, ` · ${perGen.get(gen)}`)));
    }
    const selected = s.id === sel && (s.form_key || null) === (selForm || null);
    const key = s.form_key ? `${s.id}:${s.form_key}` : String(s.id);
    let card = cache && cache.get(key);
    if (card) { card.classList.toggle('selected', selected); observeGridCard(card); }
    else {
      card = dexCard(s, { selected, density, tracking, onOpen, onKey });
      if (cache) cache.set(key, card);
    }
    frag.append(card);
  }
  return frag;
}

/** Grid artwork: still (normal or shiny) by default; animated only while a card is on screen (IntersectionObserver),
 *  so a 649-card grid never decodes hundreds of animations at once. */
// Animations start only once scrolling pauses (native performance fix 2026-11-24): tiles that fly past during a
// fast scroll keep their light still image and never start decoding a GIF. Leaving tiles go back to stills at once.
const pendingAni = new Set();
const observedCards = new Set();
const observedArt = new Set();
let aniTimer = null;
const gridArtObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entries) => {
  for (const e of entries) {
    const card = e.target;
    if (!observedCards.has(card) || !card.isConnected) continue;
    card.__inView = e.isIntersecting;
    if (!e.isIntersecting) { pendingAni.delete(card); setCardArt(card, false); continue; }
    setCardArt(card, false);                       // the still now (cheap, cached)
    pendingAni.add(card);
  }
  clearTimeout(aniTimer);
  aniTimer = setTimeout(() => {
    for (const c of pendingAni) if (observedCards.has(c) && c.__inView && c.isConnected && !document.hidden) setCardArt(c, true);
    pendingAni.clear();
  }, 140);
}, { rootMargin: '150px 0px' }) : null;
function observeGridCard(card) {
  if (gridArtObserver && !observedCards.has(card)) {
    observedCards.add(card); gridArtObserver.observe(card);
  }
}
function releaseCard(card) {
  gridArtObserver?.unobserve(card);
  observedCards.delete(card); pendingAni.delete(card);
  card.__inView = false;
  // Drop an animated image immediately, including cards retained for a filtered redraw.
  setCardArt(card, false);
}
function releaseGridArt(root) {
  root?.querySelectorAll('.dex-card').forEach(releaseCard);
  if (!pendingAni.size) { clearTimeout(aniTimer); aniTimer = null; }
}
// A single observer per document prunes removed popout grids and detail art.
// Ignore routine sprite image swaps; only removed cards/containers can retain observers.
const artCleanupObserver = typeof MutationObserver === 'function' ? new MutationObserver(records => {
  if (!records.some(r => [...r.removedNodes].some(n => n.nodeType === 1 &&
      (n.matches('.dex-card,.art') || n.querySelector('.dex-card,.art'))))) return;
  for (const card of observedCards) if (!card.isConnected) releaseCard(card);
  for (const box of observedArt) if (!box.isConnected) {
    artObserver?.unobserve(box); observedArt.delete(box); delete box.__fitArt;
  }
}) : null;
artCleanupObserver?.observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearTimeout(aniTimer); pendingAni.clear();
    for (const card of observedCards) setCardArt(card, false);
  } else {
    for (const card of observedCards) if (card.isConnected && card.__inView) setCardArt(card, true);
  }
});
function cardArt(s, density) {
  const shiny = !!setting('pokedex.shiny');
  const area = density === 'large' ? 96 : density === 'compact' ? 56 : 72;
  const still = shiny ? (s.still_shiny || null) : s.still;
  return { area, still, ani: shiny ? s.ani_shiny : s.ani, shiny, missingShiny: shiny && !s.still_shiny && !s.ani_shiny };
}
function setCardArt(card, visible) {
  const s = card.__s; if (!s) return;
  const a = cardArt(s, card.__density);
  const want = visible && !document.hidden && a.ani && animatedIn('dex_grid') ? 'ani' : 'still';
  const k = `${want}|${a.shiny}`;
  if (card.__artKey === k) return;
  card.__artKey = k;
  const box = card.querySelector('.sprite');
  if (!box) return;
  if (want === 'ani') {
    const img = h('img', { class: 'pixel', src: a.ani, alt: '', decoding: 'async', style: { visibility: 'hidden', position: 'absolute' } });
    const holder = h('div', { class: 'still-art', style: { width: a.area + 'px', height: a.area + 'px' } }, img);
    img.addEventListener('load', () => {
      const f = fitSprite(img.naturalWidth, img.naturalHeight, null, s.size || 'm', a.area, a.area);
      Object.assign(img.style, { width: f.width + 'px', height: f.height + 'px', left: f.left + 'px', top: f.top + 'px', visibility: '' });
      holder.classList.toggle('smooth', f.smooth);
    });
    mount(box, holder);
  } else {
    // unloading the <img> stops the animation's decoding work when the card leaves the screen
    mount(box, sizedSprite(s, a.area, { still: a.still, url: a.shiny ? null : s.icon, tier: s.size || 'm' }));
  }
  card.classList.toggle('no-shiny-art', a.missingShiny);
}
export function refreshGridArt(root = document) {
  root.querySelectorAll('.dex-card').forEach((c) => { c.__artKey = null; const r = c.getBoundingClientRect(); setCardArt(c, r.bottom > -150 && r.top < innerHeight + 150); });
}

/** One sprite card. Used by the main grid and the popout (same look, no caps). */
export function dexCard(s, { selected, density, tracking, onOpen, onKey }) {
  const p = s.progress || { status: 'unregistered' };
  const unseen = tracking && p.status === 'unregistered';
  const regClass = tracking ? ' reg-' + p.status : '';
  const absent = s.dex === 'no';
  const area = density === 'large' ? 96 : density === 'compact' ? 56 : 72;
  const sprite = h('div', { class: 'sprite' + (unseen ? ' unseen' : '') });
  const marks = tracking ? h('span', { class: 'marks' }, p.caught_alpha ? h('span', { title: translateUI('dex.caught_alpha_entry') }, 'α') : null,
    p.owned_shiny ? h('span', { title: translateUI('dex.owned_shiny_entry') }, '✦') : null, p.owned_costume ? h('span', { title: translateUI('dex.owned_costume_entry') }, '♛') : null) : null;
  const unverified = (s.tags || []).includes('unverified');
  const label = [
    `#${pad3(s.id)} ${speciesLabel(s.id, s.name)}`, s.types.map((type) => gameTerm('type', type)).join(' '),
    absent ? translateUI('dex.card_not_listed') : unverified ? translateUI('dex.card_unverified') : '',
    tracking ? registrationLabel(p.status) : '',
  ].filter(Boolean).join(', ');
  const el = h('div', { class: `dex-card${selected ? ' selected' : ''}${regClass}${absent ? ' absent' : ''}${s.form_key ? ' form' : ''}`, role: 'gridcell', tabindex: '0',
    dataset: { id: s.id, entry: s.form_key ? `${s.id}:${s.form_key}` : String(s.id) },
    'aria-label': label, title: density === 'compact' ? label : null, onclick: () => onOpen(s), onkeydown: onKey || null },
  h('span', { class: 'num' }, '#' + pad3(s.id)),
  s.form_key ? h('span', { class: 'form-badge', title: s.own_sprite ? translateUI('dex.alternate_form') : translateUI('dex.alternate_base_sprite') }, s.own_sprite ? translateUI('dex.form_short') : translateUI('dex.form_base_short')) : null,
  unverified && density !== 'compact' ? h('span', { class: 'qmark', title: translateUI('dex.acquisition_unverified') }, '?') : null,
  density !== 'compact' ? favButton(s) : null, marks, sprite,
  h('div', { class: 'nm' + (unseen ? ' muted' : '') }, speciesLabel(s.id, s.name)),
  density !== 'compact' ? h('div', { class: 'types' }, s.types.map((t) => typeChip(t, true))) : null,
  density === 'large' ? h('div', { class: 'avail' }, uiLabel(s.avail) + (s.bst ? translateUI('dex.card_stats', { total: number(s.bst) }) : '')) :
    density === 'standard' ? h('div', { class: 'avail' }, absent ? translateUI('dex.not_listed_checked') : uiLabel(s.avail)) : null);
  makePinDraggable(el, { kind: 'pokemon', id: s.id });
  el.__s = s; el.__density = density;
  setCardArt(el, false);
  observeGridCard(el);
  return el;
}
function favButton(s) {
  const b = h('button', { class: 'fav-btn fav' + (s.fav ? ' on' : ''), title: s.fav ? translateUI('dex.remove_favourite') : translateUI('dex.add_favourite'), 'aria-label': translateUI('dex.favourite'),
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
    h('span', { class: 'grow' }, `#${pad3(x.id)} ${speciesLabel(x.id, x.name)}`, h('div', { class: 'tiny muted' }, [uiLabel(x.label), uiLabel(x.evidence)].join(' · ') + (x.membership_basis === 'your-check' ? translateUI('dex.report_check', { state: translateUI(x.membership === 'yes' ? 'dex.listed_lower' : 'dex.not_listed_lower') }) : ''))),
    h('button', { class: 'btn small', onclick: () => mark(x.id, 'yes') }, translateUI('dex.listed')), h('button', { class: 'btn small', onclick: () => mark(x.id, 'no') }, translateUI('dex.not_listed')),
    x.membership_basis === 'your-check' ? h('button', { class: 'btn small ghost', onclick: () => mark(x.id, 'clear') }, translateUI('ui.clear')) : null);
  const counterTable = (o, mine) => h('div', { class: 'card inset stack tight' },
    h('div', { class: 'small' }, h('strong', null, fmtDate(o.observed_at)), ' · ', mine ? (o.client_note || translateUI('dex.your_reading')) : uiLabel(o.source)),
    h('div', { class: 'row wrap small' }, Object.entries(o.counters).map(([k, v]) => h('span', { class: 'counter' }, h('span', { class: 'muted' }, registrationLabel(k) + ' '),
      h('strong', null, typeof v === 'object' ? `${v.have ?? '—'} / ${v.max ?? '—'}` : `? / ${v}`)))),
    o.note ? h('div', { class: 'tiny muted' }, mine ? o.note : uiLabel(o.note)) : null,
    mine ? h('button', { class: 'btn ghost small', onclick: async () => { await api('DELETE', '/api/dex/observations/' + o.id); draw(await get('/api/dex/roster')); } }, translateUI('dex.delete_reading')) : null);
  const obsForm = () => {
    const f = { observed_at: new Date().toISOString().slice(0, 10), counters: {} };
    const metrics = [['seen', 'Seen'], ['owned', 'Owned'], ['caught_ot', 'Caught OT'], ['caught_alpha', 'Caught Alpha'], ['owned_shiny', 'Owned Shiny'], ['costume', 'Costumes']];
    const num = (k, part) => h('input', { class: 'input', type: 'number', min: 0, max: 5000, style: { width: '76px' }, 'aria-label': translateUI(part === 'have' ? 'dex.counter_part_have' : 'dex.counter_part_max', { counter: registrationLabel(k) }),
      oninput: (e) => { (f.counters[k] ||= {})[part] = e.target.value === '' ? null : Number(e.target.value); } });
    const note = h('input', { class: 'input', placeholder: translateUI('dex.reading_note'), maxlength: 300, oninput: (e) => { f.client_note = e.target.value; } });
    return h('details', null, h('summary', { class: 'small' }, translateUI('dex.record_counters')),
      h('div', { class: 'stack tight', style: { marginTop: '6px' } },
        h('div', { class: 'grid-2', style: { gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' } }, metrics.map(([k, l]) => h('div', { class: 'row' },
          h('span', { class: 'small', style: { width: '90px' } }, uiLabel(l)), num(k, 'have'), h('span', { class: 'muted' }, '/'), num(k, 'max')))),
        note, h('button', { class: 'btn small primary', onclick: async () => {
          try { await post('/api/dex/observations', f); toast(translateUI('dex.reading_saved')); draw(await get('/api/dex/roster')); } catch (e) { toast(e.message, { kind: 'warn' }); } } }, translateUI('dex.save_reading'))));
  };
  const draw = (r) => mount(body,
    notice('info', translateUI('dex.report_note')),
    h('div', { class: 'row wrap' },
      h('span', { class: 'counter' }, translateUI('dex.reference_species'), h('strong', null, r.reference_species)),
      h('span', { class: 'counter' }, translateUI('dex.report_permanent'), h('strong', null, r.permanent)),
      h('span', { class: 'counter' }, translateUI('dex.report_temporary'), h('strong', null, r.not_permanent)),
      h('span', { class: 'counter' }, translateUI('dex.report_unverified'), h('strong', null, r.unverified)),
      h('span', { class: 'counter' }, translateUI('dex.report_your_checks'), h('strong', null, translateUI('dex.report_checks_totals', { listed: number(r.membership.your_listed), unlisted: number(r.membership.your_not_listed) })))),
    h('div', { class: 'tiny muted' }, translateUI('dex.report_registry', { version: r.registry_version, date: fmtDate(r.checked_at) }) + (r.dump_date ? translateUI('dex.report_dump_date', { date: r.dump_date }) : '') +
      ' · ' + Object.entries(r.method_counts).map(([k, v]) => `${uiLabel(r.method_labels[k] || k)} ${number(v)}`).join(' · ')),
    r.conflicts.length ? [h('h3', { style: { margin: '6px 0 0' } }, translateUI('dex.conflicting_checks')), h('div', { class: 'list-rows' }, r.conflicts.map(row))] : null,
    r.needs_review.length ? [h('h3', { style: { margin: '6px 0 0' } }, translateUI('dex.later_patch')), h('div', { class: 'list-rows' }, r.needs_review.map(row))] : null,
    h('h3', { style: { margin: '6px 0 0' } }, translateUI('dex.sourced_entries')),
    h('div', { class: 'list-rows', style: { maxHeight: '34vh', overflow: 'auto' } }, r.authored.map(row)),
    h('h3', { style: { margin: '6px 0 0' } }, translateUI('dex.counter_readings')),
    r.registry_observations.map((o) => counterTable(o, false)), r.your_observations.map((o) => counterTable(o, true)), obsForm(),
    h('details', null, h('summary', { class: 'small' }, translateUI('dex.report_sources', { count: number(Object.keys(r.sources).length) })),
      h('ul', { class: 'small' }, Object.entries(r.sources).map(([id, src]) => h('li', null, src.url && src.url.startsWith('http') ? extLink(src.url, uiLabel(src.title)) : uiLabel(src.title),
        h('span', { class: 'tiny muted' }, translateUI('dex.source_checked', { kind: uiLabel(src.kind), date: src.checked })))))));
  draw(await get('/api/dex/roster'));
  await modal({ title: translateUI('ui.availability_report'), body, wide: true, actions: [
    { label: translateUI('dex.export_json'), kind: 'ghost', handler: async () => { downloadJson(`pokemmo-availability-report-${new Date().toISOString().slice(0, 10)}.json`, await get('/api/dex/roster')); return false; } },
    { label: translateUI('ui.close'), kind: 'primary' }] });
  await loadList(true);
  if (location.hash.startsWith('#/pokedex')) rerender();
}

// ---------------------------------------------------------------- detail
const evoItem = (e) => gameTerm('item', e.item) || translateUI('ui.item');
const evoLevel = (e, key = 'dex.evo_level') => translateUI(key, { level: e.value });
const evoCompare = (e, operator) => translateUI('dex.evo_attack_defense', { level: e.value, operator });
const EVO = {
  LEVEL: (e) => evoLevel(e), ITEM: evoItem, TRADE: () => translateUI('dex.trade'),
  TRADE_WITH_ITEM: (e) => translateUI('dex.evo_trade_hold', { item: gameTerm('item', e.item) || translateUI('dex.item_lower') }),
  HAPPINESS: () => translateUI('dex.friendship'), HAPPINESS_DAY: () => translateUI('dex.evo_friendship_day'),
  HAPPINESS_NIGHT: () => translateUI('dex.evo_friendship_night'), LEVEL_WITH_SKILL: () => translateUI('dex.evo_knowing_move'),
  LEVEL_FEMALE: (e) => evoLevel(e, 'dex.evo_level_female'), LEVEL_MALE: (e) => evoLevel(e, 'dex.evo_level_male'),
  ITEM_MALE: (e) => translateUI('dex.evo_item_male', { item: evoItem(e) }),
  ITEM_FEMALE: (e) => translateUI('dex.evo_item_female', { item: evoItem(e) }),
  LEVEL_ITEM_NIGHT: () => translateUI('dex.evo_item_night'), LEVEL_ITEM_DAY: () => translateUI('dex.evo_item_day'),
  ATK_GREATER_THAN_DEF: (e) => evoCompare(e, '>'), ATK_LESS_THAN_DEF: (e) => evoCompare(e, '<'),
  ATK_EQUAL_TO_DEF: (e) => evoCompare(e, '='), LEVEL_WITH_MONSTER: () => translateUI('dex.evo_party'),
};
const evoText = (via) => (EVO[via.method] ? EVO[via.method](via) : via.method.replace(/_/g, ' ').toLowerCase());
const MAIN_TABS = ['summary', 'moves', 'stats', 'locations', 'evolution', 'matchups'];
const SIDE_TABS = ['registration', 'breeding', 'notes'];

/** Choose the artwork to show for a species or form. Order: animated (your sprite library, if motion is on) →
 *  still battle art (library, then your client) → client box icon → an explicit "no artwork" placeholder.
 *  Base-species or placeholder art is never used for a form (the server already refuses it). */
export function pickArt(a, { shiny = false, isForm = false, animated = null, ctx = 'summary' } = {}) {
  a = a || {};
  const motion = animated === null ? animatedIn(ctx) : !!animated && motionGlobal();
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
  if (motion && hasAni) return { ...base, kind: 'ani', key: key('ani'), url: pickS('ani'), label: translateUI('ui.animated'), detail: lib('ani') && lib('ani').path };
  if (pickS('static')) return { ...base, kind: 'static', key: key('static'), url: pickS('static'), label: translateUI('dex.still'), detail: lib('static') && lib('static').path };
  if (pickS('front')) return { ...base, kind: 'front', key: key('front'), url: pickS('front'), label: translateUI('dex.client_sprite') };
  if (hasAni) return { ...base, kind: 'ani-still', key: key('ani'), url: pickS('ani'), label: translateUI('dex.still_frame') };
  if (pickS('icon')) return { ...base, kind: 'icon', key: key('icon'), url: pickS('icon'), label: translateUI(isForm && a.local_status === 'unverified' ? 'dex.box_icon_unverified' : 'dex.box_icon') };
  return { ...base, kind: 'none', url: null, label: isForm ? translateUI('dex.no_form_art') : translateUI('dex.no_art'), detail: uiLabel(a.local_reason) };
}
/** Summary/popout artwork, sized by the shared rule in core.js (fitSprite): the species' size tier decides how much
 *  of the frame its visible outline takes, so Charmander < Charmeleon < Charizard in every view and every
 *  Legendary/Mythical gets the large tier. Refits when the frame changes size (window resize, popout mode). */
const artObserver = typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => {
  for (const e of entries) { const f = e.target.__fitArt; if (e.target.isConnected && f) f(); }
}) : null;
export function artImage(art, sp) {
  if (!art.url) return h('div', { class: 'art-missing', title: art.detail || art.label, role: 'img', 'aria-label': art.label },
    silhouette(sp, 72), h('span', { class: 'tiny' }, art.isForm ? translateUI('dex.no_form_art_short') : ''));
  const img = h('img', { class: 'pixel art-img', src: art.url, alt: speciesLabel(sp.id, sp.name), decoding: 'async', style: { visibility: 'hidden' } });
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
      const c = h('canvas', { class: 'pixel art-img', width: img.naturalWidth, height: img.naturalHeight, role: 'img', 'aria-label': speciesLabel(sp.id, sp.name) });
      try { c.getContext('2d').drawImage(img, 0, 0); img.replaceWith(c); el = c; } catch (_) { /* keep the image */ }
    }
    fit();
    const box = el.parentElement;
    if (box?.isConnected && artObserver) { box.__fitArt = fit; observedArt.add(box); artObserver.observe(box); }
  });
  img.addEventListener('error', () => img.replaceWith(h('div', { class: 'art-missing', role: 'img', 'aria-label': translateUI('dex.art_file_missing') }, silhouette(sp, 72))));
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
  // Summary display choices: start from the Pokédex grid's Normal/Shiny mode and the Summary animation
  // preference, then each can be changed here (display only — never ownership).
  if (ui.shiny === null || ui.shinyFor !== id) { ui.shiny = !!setting('pokedex.shiny'); ui.shinyFor = id; ui.anim = null; ui.female = false; }
  const srcArt = fm ? fm.art : d.art;
  const femaleArt = !fm && srcArt && srcArt.female ? { ...srcArt, ...srcArt.female, library: {} } : null;
  const art = pickArt(ui.female && femaleArt ? femaleArt : srcArt, { shiny: ui.shiny, isForm: !!fm, animated: ui.anim });
  const redraw = () => renderDetail(pane, id, { back, popout, mode, form });
  const segBtn = (on, label, onclick, title) => h('button', { class: on ? 'active' : '', 'aria-pressed': String(on), title: title || null, onclick }, label);
  const artControls = h('div', { class: 'art-controls' },
    art.shinyAvail ? h('div', { class: 'seg small', role: 'group', 'aria-label': translateUI('dex.colours') },
      segBtn(!ui.shiny, translateUI('ui.normal'), () => { ui.shiny = false; redraw(); }), segBtn(ui.shiny, translateUI('ui.shiny'), () => { ui.shiny = true; redraw(); }, translateUI('dex.shiny_art'))) : null,
    art.hasAni ? h('div', { class: 'seg small', role: 'group', 'aria-label': translateUI('dex.motion') },
      segBtn(!art.motion, translateUI('ui.static'), () => { ui.anim = false; redraw(); }), segBtn(art.motion, translateUI('ui.animated'), () => { ui.anim = true; redraw(); },
        motionGlobal() ? null : translateUI('dex.animations_disabled'))) : null,
    femaleArt ? h('div', { class: 'seg small', role: 'group', 'aria-label': translateUI('ui.gender') },
      segBtn(!ui.female, '♂', () => { ui.female = false; redraw(); }, translateUI('dex.male_art')), segBtn(ui.female, '♀', () => { ui.female = true; redraw(); }, translateUI('dex.female_art'))) : null);
  const formNav = (k) => (popout ? (location.hash = '#/species/' + id + (k ? '/' + k : '')) : go('#/pokedex/' + id + (k ? '/' + k : '')));
  const av = d.availability;
  const avClass = av.permanent ? 'good' : av.permanent === false ? 'warn' : 'unknown';
  const head = h('div', { class: 'detail-head' },
    h('div', { class: 'art-col' },
      h('div', { class: 'art' + (art.kind === 'ani' ? ' animated' : ''), style: { '--art-scale': spriteScale('summary') } }, artImage(art, d)),
      artControls),
    h('div', { class: 'grow', style: { minWidth: 0 } },
      h('div', { class: 'row' }, h('span', { class: 'muted nowrap' }, translateUI('dex.number', { number: pad3(d.id) })), h('span', { class: 'grow' }), favToggle(d),
        !popout ? pinButton({ kind: 'pokemon', id: d.id }) : null,
        !popout ? h('button', { class: 'icon-btn', title: translateUI('dex.popout_detail'), 'aria-label': translateUI('ui.popout'), onclick: () => openPopout('pokedex', `#/species/${id}`) }, icon('popout')) : null,
        back ? h('button', { class: 'icon-btn', title: translateUI('dex.close_esc'), 'aria-label': translateUI('ui.close_details'), onclick: back }, icon('close')) : null),
      h('h2', null, detailName(d)),
      h('div', { class: 'row wrap', style: { marginTop: '4px' } }, typeChips(d.types),
        fm && fm.kind !== 'cosmetic' && fm.kind !== 'season' ? h('span', { class: 'badge unknown', title: translateUI('dex.form_availability') }, translateUI('dex.form_unverified')) :
          h('span', { class: 'badge ' + avClass, title: uiLabel(av.evidence) }, availabilityLabel(av)))));
  pane.replaceChildren(head);
  if (d.catalog_forms && d.catalog_forms.length) {
    pane.append(h('div', { class: 'form-strip', role: 'group', 'aria-label': translateUI('dex.species_forms', { pokemon: speciesLabel(d.id, d.base_name || d.name) }) }, h('span', { class: 'label' }, translateUI('ui.form')),
      d.catalog_forms.map((f) => h('button', { class: 'chip btnlike' + ((f.base ? !fm : fm && fm.form_key === f.form_key) ? ' active' : ''), 'aria-pressed': String(f.base ? !fm : !!(fm && fm.form_key === f.form_key)),
        onclick: () => formNav(f.base ? null : f.form_key) }, formLabel(d.id, f.form_name)))));
  }
  if (fm) pane.append(h('div', { class: 'detail-body', style: { paddingBottom: 0 } }, notice('info', h('strong', null, formLabel(d.id, fm.form_name) + '. '),
    fm.note ? uiLabel(fm.note) + ' ' : '', translateUI('dex.form_provenance', {
      types: uiLabel(fm.types_source), stats: uiLabel(fm.stats_source), abilities: uiLabel(fm.abilities_source),
    }),
    fm.in_client === false ? translateUI('dex.form_no_record') : '',
    !fm.own_sprite && !(fm.art && (fm.art.static || fm.art.ani)) ? translateUI('dex.form_no_sprite') : '', fm.mismatch.length ? translateUI('dex.form_mismatch', { fields: fm.mismatch.map(uiLabel).join(', ') }) : '',
    translateUI('dex.form_base_data'))));
  const body = h('div', { class: 'detail-body' });
  pane.append(body);
  if (d.imported) {
    body.append(h('div', { class: 'facts' },
      fact(translateUI('ui.catch_rate'), d.catch_rate), fact(translateUI('ui.gender'), genderText(d.gender)), fact(translateUI('ui.egg_groups'), d.egg_groups.map((group) => gameTerm('egg', group)).join(', ')),
      fact(translateUI('dex.ev_yield'), Object.entries(d.ev_yield).map(([k, v]) => `${v} ${statLabel(k)}`).join(', ') || '—'),
      fact(translateUI('dex.exp_group'), gameTerm('growth', d.growth) || '—')));
  }
  if (!d.imported) {
    body.append(notice('info', h('strong', null, translateUI('dex.bundled_summary')), translateUI('dex.install_summary')),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => go('#/settings/data') }, translateUI('dex.install_data'))),
      availabilityBlock(d), typeMatchups(d), notesSection(d));
    return;
  }
  if (popout && mode === 'compact') { body.append(statsSection(d, true), availabilityBlock(d, true)); return; }
  const setTab = (t, side) => { ui.tab = t; ui.side = side ? t : null; renderDetail(pane, id, { back, popout, mode, form }); };
  const active = ui.side || ui.tab;
  body.append(h('div', { class: 'detail-tabs' },
    tabs(MAIN_TABS.map((k) => ({ id: k, label: translateUI('dex.detail_' + k), count: k === 'locations' ? d.locations.length : undefined })), ui.side ? null : ui.tab, (t) => setTab(t, false), translateUI('dex.detail_pages')),
    h('div', { class: 'side-tabs', role: 'group', 'aria-label': translateUI('dex.detail_extras') }, h('span', { class: 'tiny muted' }, translateUI('dex.companion_prefix')),
      SIDE_TABS.map((k) => h('button', { class: 'chip btnlike' + (ui.side === k ? ' active' : ''), 'aria-pressed': String(ui.side === k), onclick: () => setTab(k, true) }, translateUI('dex.detail_' + k))))));
  const section = { summary, moves, stats: (x) => statsSection(x), locations, evolution, matchups: typeMatchups, registration, breeding, notes: notesSection }[active] || summary;
  body.append(section(d));
}
const fact = (label, value) => h('div', { class: 'fact' }, h('div', { class: 'fl' }, label), h('div', { class: 'fv' }, String(value ?? '—')));
function favToggle(d) {
  const b = h('button', { class: 'fav-btn' + (d.fav ? ' on' : ''), title: translateUI('dex.favourite'), 'aria-pressed': String(d.fav), onclick: async () => {
    d.fav = !d.fav; b.classList.toggle('on', d.fav); b.querySelector('path').setAttribute('fill', d.fav ? 'currentColor' : 'none');
    await api('PUT', `/api/dex/species/${d.id}/favourite`, { fav: d.fav }); } }, icon('star'));
  if (d.fav) b.querySelector('path').setAttribute('fill', 'currentColor');
  return b;
}

const MEMBERSHIP = { yes: 'Listed', no: 'Not listed', unknown: 'Not checked yet', conditional: 'Conditional' };
const ELIG = { unregistered: 'Unregistered', seen: 'Seen', owned: 'Owned', caught_ot: 'Caught OT', caught_alpha: 'Caught Alpha', owned_shiny: 'Owned Shiny', costume: 'Costume', owned_costume: 'Owned Costume' };
const registrationLabel = (key) => uiLabel(ELIG[key] || key);

function detailName(species) {
  if (lang() === 'en') return species.name;
  const name = speciesLabel(species.id, species.base_name || species.name);
  return species.form ? `${name} · ${formLabel(species.id, species.form.form_name)}` : name;
}

function genderText(gender) {
  if (gender.code === 255) return translateUI('dex.genderless');
  const parts = [...gender.label.matchAll(/(\d+(?:\.\d+)?)% (male|female)/g)];
  return parts.length ? parts.map(([, percent, sex]) => translateUI('dex.gender_single', {
    percent: number(Number(percent)), gender: translateUI('dex.' + sex),
  })).join(' · ') : translateUI('dex.gender_unknown', { code: gender.code });
}

function availabilityLabel(availability) {
  const method = availability.methods[0];
  return method.location ? `${uiLabel(method.label)} · ${gameTerm('location', method.location)}` : uiLabel(method.label);
}

function acquisitionDetail(detail) {
  const count = /^(\d+) locations? in the PokeMMO game data$/.exec(detail);
  return count ? translateUI(count[1] === '1' ? 'dex.acquisition_wild_one' : 'dex.acquisition_wild_count', {
    count: number(Number(count[1])),
  }) : uiLabel(detail);
}

function membershipConflict(message) {
  if (lang() === 'en') return message;
  const conflict = /^Your in-game check \(([^)]+)\) says '(yes|no)', the registry says '(yes|no)'\./.exec(message);
  if (!conflict) return message;
  const [, date, observed, registry] = conflict;
  return translateUI('dex.membership_conflict', {
    date: fmtDate(date),
    observed: translateUI(observed === 'yes' ? 'dex.listed' : 'dex.not_listed'),
    registry: translateUI(registry === 'yes' ? 'dex.listed' : 'dex.not_listed'),
  });
}

function availabilityBlock(d, compact) {
  const av = d.availability;
  const mem = av.membership;
  const method = (m) => h('div', { class: 'avail-method' },
    h('div', { class: 'row wrap' }, h('strong', null, uiLabel(m.label)), m.location ? h('span', null, '· ' + gameTerm('location', m.location)) : null, m.region ? h('span', { class: 'chip' }, gameTerm('region', cap(m.region))) : null,
      sourceInfo(m.confidence, [m.sources.filter((x) => !(x.url && x.url.startsWith('http'))).map((x) => uiLabel(x.title)).join('; '), m.verified_at ? translateUI('dex.source_verified_date', { date: m.verified_at }) : ''].filter(Boolean).join(' · '))),
    m.detail ? h('div', { class: 'small' }, acquisitionDetail(m.detail)) : null,
    m.prerequisites ? h('div', { class: 'small muted' }, translateUI('dex.method_prerequisites', { requirements: uiLabel(m.prerequisites) })) : null,
    m.active_window ? h('div', { class: 'small muted' }, translateUI('dex.method_active_window', { window: uiLabel(m.active_window) })) : null,
    m.since ? h('div', { class: 'small muted' }, translateUI('dex.method_since', { date: m.since })) : null,
    m.review ? h('div', { class: 'small', style: { color: 'var(--warn)' } }, translateUI('dex.method_review', { patch: uiLabel(m.review.patch), date: m.review.date })) : null,
    !compact && m.sources.some((x) => x.url && x.url.startsWith('http')) ? h('div', { class: 'tiny muted' }, translateUI('dex.source_prefix'),
      m.sources.filter((x) => x.url && x.url.startsWith('http')).map((src, i) => [i ? ' · ' : '', extLink(src.url, uiLabel(src.title))])) : null);
  const lines = [
    h('div', { class: 'label' }, translateUI('dex.obtain_heading')),
    av.methods.map(method),
    av.note ? h('div', { class: 'small' }, uiLabel(av.note)) : null,
    h('div', { class: 'row wrap small' }, h('span', { class: 'muted' }, translateUI('dex.in_game_dex')),
      h('span', { class: 'badge ' + (mem.state === 'yes' ? 'good' : mem.state === 'no' ? 'bad' : 'unknown') }, uiLabel(MEMBERSHIP[mem.state] || mem.state)),
      mem.basis === 'your-check' ? h('span', { class: 'tiny muted' }, translateUI('dex.your_check', { date: fmtDate(mem.checked_at) })) : null),
    mem.conflict ? h('div', { class: 'small', style: { color: 'var(--warn)' } }, membershipConflict(mem.conflict)) : null,
    !compact && Object.values(av.eligibility).some((v) => v !== 'unknown') ? h('div', { class: 'row wrap small' }, h('span', { class: 'muted' }, translateUI('dex.counts_toward')),
      Object.entries(av.eligibility).filter(([, v]) => v !== 'unknown').map(([k, v]) => h('span', { class: 'chip' + (v === 'yes' ? ' good' : '') }, translateUI('dex.eligibility', { counter: registrationLabel(k), state: uiLabel(v) })))) : null];
  if (!compact) lines.push(h('div', { class: 'row wrap' }, h('span', { class: 'small muted' }, translateUI('dex.checked_prompt')),
    h('button', { class: 'btn small', onclick: async () => { await api('PUT', '/api/dex/roster/' + d.id, { in_dex: 'yes' }); toast(translateUI('dex.saved_check')); } }, translateUI('dex.listed')),
    h('button', { class: 'btn small', onclick: async () => { await api('PUT', '/api/dex/roster/' + d.id, { in_dex: 'no' }); toast(translateUI('dex.saved_check')); } }, translateUI('dex.not_listed'))));
  return h('div', { class: 'card inset stack tight avail-block' }, lines);
}

function summary(d) {
  const abil = h('div', { class: 'stack tight' }, d.abilities.map((a) => h('div', { class: 'row' }, h('span', { style: { fontWeight: 600 } }, gameTerm('ability', a.name)),
    a.slot === 'hidden' ? h('span', { class: 'chip' }, translateUI('ui.hidden_ability')) : null)));
  const category = speciesCategory(d.id);
  const overlay = d.overlays && d.overlays[0];
  return h('div', { class: 'stack' },
    h('div', { class: 'grid-2', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' } },
      h('div', null, h('div', { class: 'label', style: { marginBottom: '6px' } }, translateUI('ui.abilities')), abil),
      h('dl', { class: 'kv' },
        category ? [h('dt', null, translateUI('ui.category')), h('dd', null, category)] : null,
        h('dt', null, translateUI('ui.height_weight')), h('dd', null, `${d.height_m} m · ${d.weight_kg} kg`),
        h('dt', null, translateUI('ui.held_items')), h('dd', null, d.held_items.length ? d.held_items.map((item) => gameTerm('item', item)).join(', ') : '—'),
        h('dt', null, translateUI('ui.forms')), h('dd', null, d.forms.filter((f) => f.name && f.name !== 'Egg').map((f) => formLabel(d.id, f.name) + (f.costume ? translateUI('dex.costume_suffix') : '')).join(', ') || '—'),
        overlay ? [h('dt', null, translateUI('ui.patch_note')), h('dd', null, uiLabel(overlay.note))] : null)),
    availabilityBlock(d),
    h('div', { class: 'tiny muted' }, translateUI('dex.summary_data', { flag: d.obtainable_flag }), d.types_raw_duplicated ? translateUI('dex.duplicate_type') : ''));
}

// Bars are drawn against 255 (the highest possible base stat) and 720 for the total, so proportions are exact.
const STAT_MAX = 255, BST_MAX = 720;
function statsSection(d, compact) {
  const bar = (v, max) => h('div', { class: 'bar', role: 'presentation' }, h('span', { style: { width: Math.min(100, (v || 0) / max * 100).toFixed(1) + '%' } }));
  return h('div', { class: 'stack tight' }, h('div', { class: 'cells stats-big' + (compact ? ' compact' : '') }, STAT_ORDER.map(([k, label]) =>
    h('div', { class: 'stat-row', dataset: { stat: k }, style: { '--stat-c': `var(--stat-${k})` }, 'aria-label': `${uiLabel(label)} ${d.stats[k] ?? translateUI('dex.compare_unknown')}` },
      h('span', { class: 'lbl' }, uiLabel(label)), h('span', { class: 'val' }, d.stats[k] ?? '—'), bar(d.stats[k], STAT_MAX))),
  h('div', { class: 'stat-row total', 'aria-label': `${translateUI('dex.stat_total')} ${d.bst}` }, h('span', { class: 'lbl' }, translateUI('dex.stat_total')), h('span', { class: 'val' }, d.bst), bar(d.bst, BST_MAX))),
  compact ? h('div', { class: 'small' }, translateUI('dex.abilities_prefix'), d.abilities.map((a) => gameTerm('ability', a.name) + (a.slot === 'hidden' ? translateUI('dex.hidden_short') : '')).join(', ')) : null);
}

function typeMatchups(d) {
  const m = d.type_matchups;
  const row = (k, label, cls) => (m.groups[k].length ? h('div', { class: 'row wrap', style: { alignItems: 'center' } },
    h('span', { class: 'mult ' + cls, style: { minWidth: '44px' } }, label), m.groups[k].map((t) => typeChip(t, true))) : null);
  return h('div', { class: 'stack tight' }, h('div', { class: 'small muted' }, translateUI('dex.damage_taken', { pokemon: detailName(d), types: d.types.map((type) => gameTerm('type', type)).join(' / ') })),
    row('4', '4×', 'm4'), row('2', '2×', 'm2'), row('0.5', '½×', 'm05'), row('0.25', '¼×', 'm025'), row('0', '0×', 'm0'),
    h('details', null, h('summary', { class: 'small', style: { cursor: 'pointer' } }, translateUI('dex.normal_damage', { count: number(m.groups['1'].length) })),
      h('div', { class: 'row wrap', style: { marginTop: '6px' } }, m.groups['1'].map((t) => typeChip(t, true)))),
    h('div', { class: 'tiny muted' }, translateUI('dex.matchup_note'), ' ', h('a', { href: '#/tools/typechart' }, translateUI('dex.full_type_chart'))));
}

const SEASONS = ['all', 'Spring', 'Summer', 'Autumn', 'Winter'];
function rateCell(r) { return h('td', { class: 'rate ' + r.kind, title: r.raw ? uiLabel(r.label) : '' }, uiLabel(r.label)); }
function locations(d) {
  const wrap = h('div', { class: 'stack' });
  const av = d.availability;
  if (av.classes[0] !== 'wild' && av.methods[0].basis === 'registry') wrap.append(notice('info', h('strong', null, availabilityLabel(av)), translateUI('dex.non_wild_sources')));
  if (!d.locations.length) { wrap.append(h('div', { class: 'empty' }, h('h3', null, translateUI('dex.no_wild_locations')),
    h('p', null, translateUI('dex.no_wild_help')))); return wrap; }
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
      out.append(h('div', { class: 'loc-group' }, h('div', { class: 'lg-head' }, h('span', { class: 'chip' }, gameTerm('region', cap(region))),
        h('a', { href: '#/tools/locations/' + encodeURIComponent(lid), title: translateUI('ui.location_open') }, gameTerm('location', area))),
        h('table', { class: 'table compact' }, h('thead', null, h('tr', null, [translateUI('ui.type'), translateUI('ui.levels'), translateUI('dex.horde'), translateUI('ui.season'), translateUI('ui.morning'), translateUI('ui.day'), translateUI('ui.night')].map((c) => h('th', null, c)))),
          h('tbody', null, [...seen.values()].map((l) => h('tr', null, h('td', null, gameTerm('encounter', l.method)), h('td', { class: 'nowrap' }, l.min === l.max ? l.min : `${l.min}–${l.max}`),
            h('td', null, l.horde5 ? '×5' : l.horde3 ? '×3' : '—'), h('td', { class: 'small' }, l.seasons.map(uiLabel).join(', ')), rateCell(l.morning), rateCell(l.day), rateCell(l.night)))))));
    }
    return out;
  };
  const holder = h('div');
  const redraw = () => mount(holder, draw());
  const firstRegion = d.locations[0] && d.locations[0].region;
  wrap.append(h('div', { class: 'row wrap' }, h('span', { class: 'label' }, translateUI('ui.season')), seg(SEASONS.map((s) => [s, s === 'all' ? translateUI('ui.all') : uiLabel(s)]), ui.locSeason, (v) => { ui.locSeason = v; redraw(); }, translateUI('ui.season')),
    h('span', { class: 'grow' }), h('a', { class: 'btn small ghost', href: `#/tools/locations?region=${firstRegion || 'kanto'}&species=${d.id}`, title: translateUI('dex.location_explorer_hint') }, icon('map'), translateUI('dex.show_location_explorer'))),
    h('p', { class: 'tiny muted', style: { margin: 0 } }, translateUI('dex.rate_help')),
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
function machineNote(method) {
  if (lang() === 'en') return method.note;
  const names = (method.machine_items || []).map((item) => gameTerm('item', item.name));
  return names.length ? translateUI('dex.machine_note_item', { items: names.join(' / ') })
    : translateUI('dex.machine_note_unknown');
}

function methodBadge(m) {
  const lvl = m.code === 'level' ? ` ${m.level}` : '';
  const label = m.label === 'TM/HM' ? translateUI('ui.b272_cmp_method_tmhm') : uiLabel(m.label);
  const title = m.code === 'start' ? translateUI('dex.move_known_start')
    : m.code === 'level' ? translateUI('dex.level_learned', { level: m.level })
    : m.code === 'machine' && m.note ? machineNote(m)
    : translateUI('dex.move_raw_method', { method: m.raw });
  const item = (m.machine_items || [])[0];
  const badge = h(item ? 'a' : 'span', { class: `mv-badge mv-${m.code}`, title, 'aria-label': `${label}${lvl}. ${title}`, href: item ? `#/tools/items/${item.item_id}` : null }, label + lvl);
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
  const dash = (title, text = '—') => h('span', { class: 'muted', title }, text);
  const draw = () => {
    const f = MOVE_FILTERS.find((x) => x[0] === ui.moveFilter) || MOVE_FILTERS[0];
    const list = rows.filter((r) => !f[2] || r.methods.some((m) => f[2].includes(m.code))).sort(cmp[ui.moveSort]);
    const th = (label, key) => h('th', key ? { 'aria-sort': ui.moveSort === key ? 'ascending' : 'none' } : null,
      key ? h('button', { class: 'th-sort' + (ui.moveSort === key ? ' on' : ''), onclick: () => { ui.moveSort = key; draw(); } }, label) : label);
    mount(holder, list.length ? h('table', { class: 'table compact moves-table' },
      h('thead', null, h('tr', null, th(translateUI('dex.move_method'), 'method'), th(translateUI('ui.level'), 'level'), th(translateUI('ui.move'), 'name'), th(translateUI('ui.type'), 'type'), th(translateUI('ui.category')), th(translateUI('ui.power')), th(translateUI('ui.accuracy')), th('PP'))),
      h('tbody', null, list.map((r) => {
        const miss = translateUI('dex.move_missing_data');
        const levels = r.methods.filter((m) => m.level != null).map((m) => m.level);
        return h('tr', { dataset: { move: r.name } },
          h('td', { class: 'mv-methods' }, r.methods.map(methodBadge)),
          h('td', { class: 'num' }, levels.length ? levels.join(', ') : dash(translateUI('dex.move_no_level'))),
          h('td', { class: 'mv-name' }, gameTerm('move', r.name)),
          h('td', null, r.type ? typeChip(r.type, true) : dash(miss)),
          h('td', { class: 'small' }, gameTerm('category_move', r.category) || dash(miss)),
          h('td', { class: 'num' }, r.power === 1 ? dash(translateUI('dex.move_variable_power'), translateUI('dex.move_var_short')) : r.power ? r.power : r.verified_meta ? dash(translateUI('dex.move_no_power')) : dash(miss)),
          h('td', { class: 'num' }, r.accuracy == null ? dash(miss) : r.accuracy > 100 ? dash(translateUI('dex.move_never_misses')) : r.accuracy),
          h('td', { class: 'num' }, r.pp ?? dash(miss)));
      }))) : h('div', { class: 'empty' }, translateUI('dex.move_no_method_matches')));
  };
  const wrap = h('div', { class: 'stack tight' },
    h('div', { class: 'row wrap moves-tools' },
      h('div', { class: 'chips', role: 'group', 'aria-label': translateUI('dex.move_filter_title') }, MOVE_FILTERS.filter(([k]) => k === 'all' || counts[k]).map(([k, label]) =>
        h('button', { class: 'chip btnlike' + (ui.moveFilter === k ? ' active' : ''), 'aria-pressed': String(ui.moveFilter === k), onclick: (e) => {
          const me = e.currentTarget; ui.moveFilter = k;
          me.parentElement.querySelectorAll('.chip').forEach((c) => { c.classList.toggle('active', c === me); c.setAttribute('aria-pressed', String(c === me)); }); draw(); } },
          uiLabel(label), h('span', { class: 'count' }, counts[k])))),
      h('span', { class: 'grow' }), h('span', { class: 'tiny muted' }, translateUI('dex.move_count', { count: number(rows.length) }))),
    holder,
    counts.machine ? h('p', { class: 'tiny muted', style: { margin: 0 } }, translateUI('ui.b272_cmp_method_tmhm'), h('sup', null, '?'),
      translateUI('dex.machine_help')) : null);
  draw();
  return wrap;
}

function evolution(d) {
  const chain = d.evolution_chain;
  if (!chain.length || chain.length === 1) return h('div', { class: 'empty' }, translateUI('dex.no_evolution'));
  const byDepth = {};
  chain.forEach((n) => (byDepth[n.depth] ||= []).push(n));
  const row = h('div', { class: 'evo' });
  Object.keys(byDepth).sort().forEach((depth, i) => {
    if (i > 0) row.append(h('div', { class: 'arrow' }, byDepth[depth].map((n) => h('div', null, '→ ', evoText(n.via)))));
    row.append(h('div', { class: 'stack tight' }, byDepth[depth].map((n) => h('div', { class: 'node', role: 'button', tabindex: '0', onclick: () => go('#/pokedex/' + n.id),
      style: n.id === d.id ? { borderColor: 'var(--accent)' } : null }, spriteOrFallback(n.icon, { id: n.id, name: n.name, types: [] }, 48), h('span', { class: 'small' }, speciesLabel(n.id, n.name))))));
  });
  return h('div', { class: 'stack' }, row, h('p', { class: 'tiny muted', style: { margin: 0 } }, translateUI('dex.evolution_help')));
}
function registration(d) {
  const run = d.progress_run;
  if (!run) return h('div', { class: 'stack tight' }, notice('info', translateUI('dex.registration_empty')),
    h('div', { class: 'small muted' }, translateUI('dex.manual_account')));
  const p = { ...(d.progress || { status: 'unregistered' }) };
  const save = async () => { await api('PUT', `/api/dex/progress/${run}/${d.id}`, p); toast(translateUI('ui.saved')); state.dexCache = null; staleGrid = true; };
  return h('div', { class: 'stack' }, h('div', { class: 'small muted' }, translateUI('dex.manual_selected')),
    seg(REG_LEVELS.map(([key, label]) => [key, uiLabel(label)]), p.status, (v) => { p.status = v; save(); }, translateUI('dex.registration_status')),
    h('div', { class: 'row wrap' }, [['caught_alpha', 'Caught Alpha'], ['owned_shiny', 'Owned Shiny'], ['owned_costume', 'Owned Costume']].map(([k, l]) =>
      h('label', { class: 'chip btnlike' + (p[k] ? ' active' : '') }, h('input', { type: 'checkbox', class: 'check', checked: !!p[k], onchange: (e) => { p[k] = e.target.checked; save(); } }), uiLabel(l)))));
}
function breeding(d) {
  const cannot = d.egg_groups.includes('cannot breed');
  return h('div', { class: 'stack' },
    h('dl', { class: 'kv' }, h('dt', null, translateUI('ui.egg_groups')), h('dd', null, d.egg_groups.map((group) => gameTerm('egg', group)).join(', ')), h('dt', null, translateUI('ui.gender')), h('dd', null, genderText(d.gender))),
    cannot ? notice('warn', translateUI('dex.cannot_breed')) : null,
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn primary', disabled: cannot ? 'disabled' : null, onclick: () => go(`#/tools/breeding?a=${d.id}`) }, icon('egg'), translateUI('dex.parent_a')),
      h('button', { class: 'btn', disabled: cannot ? 'disabled' : null, onclick: () => go(`#/tools/breeding?tab=eggmoves&species=${d.id}`) }, translateUI('dex.egg_candidates'))),
    h('p', { class: 'tiny muted', style: { margin: 0 } }, translateUI('dex.breeding_help')));
}
function notesSection(d) {
  const save = debounce(async (v) => { await api('PUT', `/api/dex/species/${d.id}/note`, { body: v }); status.textContent = translateUI('ui.saved'); }, 500);
  const status = h('span', { class: 'tiny muted' }, d.note ? translateUI('ui.saved') : '');
  return h('div', { class: 'stack' },
    h('div', { class: 'stack tight' }, h('div', { class: 'row' }, h('span', { class: 'label' }, translateUI('dex.quick_note')), h('span', { class: 'grow' }), status),
      h('textarea', { class: 'input', rows: 4, placeholder: translateUI('dex.quick_note_placeholder'), oninput: (e) => { status.textContent = translateUI('dex.saving'); save(e.target.value); } }, d.note || '')),
    linkedNotes('species', String(d.id), d.base_name || d.name),
    h('div', { class: 'stack tight' }, h('div', { class: 'row' }, h('span', { class: 'label' }, translateUI('dex.box_count', { count: number((d.box_entries || []).length) })), h('span', { class: 'grow' }),
      h('button', { class: 'btn small', onclick: () => openRoute(`#/collection/pokemon/new?species=${d.id}`) }, icon('plus'), translateUI('dex.add_to_box'))),
    (d.box_entries || []).length ? h('div', { class: 'row wrap' }, d.box_entries.map((e) => h('button', { class: 'mini-mon', onclick: () => openRoute('#/collection/pokemon/' + e.id) },
      e.icon ? h('img', { class: 'pixel', src: e.icon, alt: '', width: 32, height: 32 }) : null, h('span', { class: 'small' }, (e.nickname || speciesLabel(e.species_id, e.species_name)) + (e.shiny ? ' ✦' : '') + (e.alpha ? ' α' : ''))))) :
      h('div', { class: 'small muted' }, translateUI('dex.empty_box'))));
}
