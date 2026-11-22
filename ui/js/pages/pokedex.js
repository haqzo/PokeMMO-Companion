// Pokédex (docs/design/06 + 2026-11-22 video correction pass).
// Default scope = PokeMMO roster (authored availability registry + your in-game checks + dump families);
// "All Gen I–V reference" is an explicit choice. Registration status is manual, per character run,
// and never claimed to come from your account.
import { h, mount, clear, icon, get, api, post, state, setting, saveSettings, on, badge, notice, typeChip, typeChips, pad3, cap,
  spriteOrFallback, debounce, tabs, seg, toast, extLink, modal, relTime, fmtDate, WINDOW_ID } from '../core.js';
import { go, popoutButton, openPopout, pinButton, makePinDraggable } from '../shell.js';
import { downloadJson } from '../components.js';

export const TYPES = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel'];
const REGIONS = ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova'];
const STAT_ORDER = [['hp', 'HP'], ['attack', 'Attack'], ['defense', 'Defense'], ['sp_attack', 'Sp. Atk'], ['sp_defense', 'Sp. Def'], ['speed', 'Speed']];
export const REG_LEVELS = [['unregistered', 'Unregistered'], ['seen', 'Seen'], ['owned', 'Owned'], ['caught_ot', 'Caught OT']];
const CLASS_CHIPS = [['wild', 'Wild'], ['evolution_or_breeding', 'Evolve / breed'], ['gift', 'Gift'], ['fossil', 'Fossil'], ['roaming', 'Roamer'],
  ['raid', 'Raid'], ['story_temporary', 'Story (temporary)'], ['unknown', 'Unverified'], ['unavailable', 'Not in PokeMMO']];
const DEFAULT_F = { q: '', gen: 'all', types: [], typeSlot: 'any', region: '', horde: '', egg: '', fav: false, sort: 'num', season: '',
  ability: '', held: '', statKey: '', statMin: '', classes: [], reg: [] };
let F = null;
let ui = { drawer: false, tab: 'summary', side: null, scroll: 0, locSeason: 'all', moveTab: 'level', shiny: false };
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
    meta = res;
  }
  return state.dexCache;
}
export function dexMeta() { return meta; }
const persistFilters = debounce(() => saveSettings({ 'pokedex.filters': { ...F, q: '' } }).catch(() => {}), 700);
export function currentFilters() { if (!F) F = { ...DEFAULT_F, ...(setting('pokedex.filters') || {}) }; return F; }

export function applyFilters(all, f = currentFilters(), scope = setting('pokedex.scope')) {
  const q = (f.q || '').trim().toLowerCase();
  const tracking = !!setting('pokedex.progress_run');
  const out = all.filter((s) => {
    if (scope !== 'reference' && s.dex === 'no') return false;
    if (q) {
      const num = q.replace(/^#/, '');
      const hit = s.name.toLowerCase().includes(q) || (/^\d+$/.test(num) && String(s.id) === String(Number(num))) ||
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
    if (f.classes.length && !f.classes.some((c) => (s.classes || []).includes(c))) return false;
    if (tracking && f.reg.length) {
      const p = s.progress || { status: 'unregistered' };
      const ok = f.reg.some((r) => (r === 'caught_alpha' ? p.caught_alpha : r === 'owned_shiny' ? p.owned_shiny : r === 'owned_costume' ? p.owned_costume : p.status === r));
      if (!ok) return false;
    }
    if (f.fav && !s.fav) return false;
    return true;
  });
  const by = { num: (a, b) => a.id - b.id, name: (a, b) => a.name.localeCompare(b.name), bst: (a, b) => (b.bst || 0) - (a.bst || 0) || a.id - b.id,
    fav: (a, b) => (b.fav - a.fav) || a.id - b.id };
  out.sort(by[f.sort] || by.num);
  return out;
}
function activeFilterCount() {
  return F.types.length + (F.region ? 1 : 0) + (F.horde ? 1 : 0) + (F.egg ? 1 : 0) + (F.fav ? 1 : 0) + (F.season ? 1 : 0) +
    (F.ability ? 1 : 0) + (F.held ? 1 : 0) + (F.statKey && F.statMin !== '' ? 1 : 0) + F.classes.length + F.reg.length;
}
const rerender = () => render(document.getElementById('main'), parseHash());

export async function render(el, route) {
  dispose();
  currentFilters();
  const all = await loadList();
  const sel = route.parts[0] ? Number(route.parts[0]) : null;
  if (route.query.get('tab')) { ui.tab = route.query.get('tab'); }
  const wide = el.clientWidth >= 1080;
  const page = h('div', { class: 'page flush' });
  mount(el, page);
  if (sel && !wide) {
    const pane = h('div', { class: 'dex-detail', style: { borderLeft: 0, flex: 1 } });
    page.append(pane);
    await renderDetail(pane, sel, { back: () => go('#/pokedex') });
    return;
  }
  const layout = h('div', { class: 'dex-layout' + (sel ? ' split' : '') });
  page.append(layout);
  const gridWrap = h('div', { class: 'dex-grid-wrap' });
  layout.append(gridWrap);
  await buildToolbar(gridWrap, all);
  const scroll = h('div', { class: 'dex-scroll', tabindex: '-1' });
  gridEl = h('div', { class: 'dex-grid density-' + (setting('pokedex.density') || 'standard'), role: 'grid', 'aria-label': 'Pokémon' });
  scroll.append(gridEl);
  gridWrap.append(scroll);
  drawGrid(all, sel);
  scroll.scrollTop = ui.scroll;
  scroll.addEventListener('scroll', () => { ui.scroll = scroll.scrollTop; });
  if (sel) {
    const pane = h('div', { class: 'dex-detail' });
    layout.append(pane);
    await renderDetail(pane, sel, { back: () => go('#/pokedex') });
    const card = gridEl.querySelector(`[data-id="${sel}"]`);
    if (card) card.scrollIntoView({ block: 'nearest' });
  }
  const refresh = async () => { await loadList(true); if (gridEl && gridEl.isConnected) rerender(); };
  unsub.push(on('favourites', refresh));
  unsub.push(on('dex.roster', refresh));
  unsub.push(on('dex.progress', (d, ev) => { if (ev.origin !== WINDOW_ID) refresh(); }));
  unsub.push(on('import', async (d) => { if (d.state === 'done' && d.kind === 'dumps') refresh(); }));
  const keyh = (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'f') { e.preventDefault(); const s = el.querySelector('#dex-search'); s && s.focus(); }
    if (e.key === 'Escape' && sel && !document.querySelector('.modal-back')) go('#/pokedex');
  };
  document.addEventListener('keydown', keyh);
  unsub.push(() => document.removeEventListener('keydown', keyh));
}
function parseHash() { const raw = location.hash.replace(/^#\/?/, ''); const [p, qs] = raw.split('?'); const parts = p.split('/').filter(Boolean);
  return { page: parts[0], parts: parts.slice(1), query: new URLSearchParams(qs || ''), hash: location.hash }; }

async function buildToolbar(wrap, all) {
  const scope = setting('pokedex.scope') || 'pokemmo';
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
    seg([['pokemmo', 'PokeMMO Dex'], ['reference', 'All Gen I–V (649)']], scope, async (v) => { await saveSettings({ 'pokedex.scope': v }); rerender(); }, 'Roster scope'),
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
  const scope = setting('pokedex.scope') || 'pokemmo';
  const runs = await get('/api/guides/runs');
  const runId = setting('pokedex.progress_run');
  const reg = meta && meta.registry;
  const hidden = all.filter((s) => s.dex === 'no').length;
  const unknown = all.filter((s) => s.dex === 'unknown').length;
  const runSel = h('select', { class: 'input', style: { width: 'auto', minHeight: '28px', padding: '2px 6px' }, 'aria-label': 'Registration tracking',
    onchange: async (e) => { await saveSettings({ 'pokedex.progress_run': e.target.value || null }); await loadList(true); rerender(); } },
  h('option', { value: '' }, 'Registration: not tracked'),
  runs.runs.map((r) => h('option', { value: r.id, selected: r.id === runId ? 'selected' : null }, `Registration: ${r.display}`)));
  const counters = h('div', { class: 'row wrap small' });
  if (runId) {
    get(`/api/dex/progress/${runId}/counts?scope=${scope}`).then((c) => mount(counters,
      [['Seen', c.seen], ['Owned', c.owned], ['Caught OT', c.caught_ot], ['Caught Alpha', c.caught_alpha], ['Owned Shiny', c.owned_shiny], ['Costumes', c.owned_costume]]
        .map(([l, v]) => h('span', { class: 'counter' }, h('span', { class: 'muted' }, l + ' '), h('strong', null, v), h('span', { class: 'muted' }, ' / ' + c.scope_size))),
      h('span', { class: 'tiny muted', title: c.note }, '· entered by you'))).catch(() => {});
  }
  return h('div', { class: 'dex-info' },
    h('div', { class: 'row wrap grow', style: { gap: '6px 14px' } },
      countEl,
      scope === 'pokemmo' ? h('span', { class: 'small muted' }, `${hidden} reported absent from PokeMMO hidden · ${unknown} unverified shown with “?”`) :
        h('span', { class: 'small muted' }, 'Full Gen I–V reference — not every entry exists in PokeMMO'),
      h('button', { class: 'btn ghost small', onclick: rosterDialog, title: 'Compare with the in-game Pokédex and record what your client shows' }, icon('info'), 'Roster report'),
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
    h('div', { class: 'fgroup' }, h('span', { class: 'label' }, 'Availability (PokeMMO registry / your dump)'), h('div', { class: 'chips' },
      CLASS_CHIPS.map(([k, l]) => chip(l, F.classes.includes(k), () => { F.classes = toggle(F.classes, k); redraw(); })))),
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
  F.classes.forEach((k) => c.push([(CLASS_CHIPS.find((x) => x[0] === k) || [k, k])[1], () => { F.classes = F.classes.filter((x) => x !== k); }]));
  F.reg.forEach((k) => c.push([k.replace('_', ' '), () => { F.reg = F.reg.filter((x) => x !== k); }]));
  if (F.fav) c.push(['Favourites', () => { F.fav = false; }]);
  return h('div', { class: 'active-filters', style: { padding: '6px 16px', borderBottom: '1px solid var(--border-subtle)' } },
    h('span', { class: 'tiny muted' }, 'Active:'), c.map(([l, fn]) => h('button', { class: 'chip btnlike', onclick: () => { fn(); redraw(); }, title: 'Remove filter' }, l, ' ✕')),
    h('button', { class: 'btn ghost small', onclick: () => { F = { ...DEFAULT_F, q: F.q, sort: F.sort }; redraw(); } }, 'Clear all'));
}

function drawGrid(all, sel = Number(parseHash().parts[0]) || null) {
  if (!gridEl) return;
  const list = applyFilters(all);
  const scope = setting('pokedex.scope') || 'pokemmo';
  const inScope = all.filter((s) => scope === 'reference' || s.dex !== 'no').length;
  if (countEl) countEl.textContent = `${list.length} of ${inScope} shown`;
  clear(gridEl);
  if (!list.length) {
    gridEl.append(h('div', { class: 'empty', style: { gridColumn: '1 / -1' } }, h('h3', null, 'No Pokémon match'),
      activeFilterCount() || F.q || F.gen !== 'all' ? h('p', null, 'Search or filters are hiding everything. ', h('button', { class: 'btn small', onclick: () => {
        F = { ...DEFAULT_F, sort: F.sort }; persistFilters(); rerender(); } }, 'Clear search & filters')) : null));
    return;
  }
  const density = setting('pokedex.density') || 'standard';
  const tracking = !!setting('pokedex.progress_run');
  const frag = document.createDocumentFragment();
  for (const s of list) frag.append(dexCard(s, { selected: s.id === sel, density, tracking, onOpen: (id) => go('#/pokedex/' + id), onKey: gridKeys }));
  gridEl.append(frag);
}

/** One sprite card. Used by the main grid and the popout (same look, no caps). */
export function dexCard(s, { selected, density, tracking, onOpen, onKey }) {
  const p = s.progress || { status: 'unregistered' };
  const unseen = tracking && p.status === 'unregistered';
  const regClass = tracking ? ' reg-' + p.status : '';
  const absent = s.dex === 'no';
  const sprite = h('div', { class: 'sprite' + (unseen ? ' unseen' : '') }, spriteOrFallback(s.icon, s, density === 'large' ? 96 : density === 'compact' ? 48 : 72));
  const marks = tracking ? h('span', { class: 'marks' }, p.caught_alpha ? h('span', { title: 'Caught Alpha (your entry)' }, 'α') : null,
    p.owned_shiny ? h('span', { title: 'Owned Shiny (your entry)' }, '✦') : null, p.owned_costume ? h('span', { title: 'Owned Costume (your entry)' }, '♛') : null) : null;
  const label = `#${pad3(s.id)} ${s.name}, ${s.types.join(' ')}${absent ? ', not in PokeMMO' : s.dex === 'unknown' ? ', availability unverified' : ''}${tracking ? ', ' + p.status.replace('_', ' ') : ''}`;
  const el = h('div', { class: `dex-card${selected ? ' selected' : ''}${regClass}${absent ? ' absent' : ''}`, role: 'gridcell', tabindex: '0', dataset: { id: s.id },
    'aria-label': label, title: density === 'compact' ? label : null, onclick: () => onOpen(s.id), onkeydown: onKey || null },
  h('span', { class: 'num' }, '#' + pad3(s.id)),
  s.dex === 'unknown' ? h('span', { class: 'qmark', title: 'Availability in PokeMMO not verified yet' }, '?') : null,
  density !== 'compact' ? favButton(s) : null, marks, sprite,
  density !== 'compact' ? h('div', { class: 'nm' + (unseen ? ' muted' : '') }, s.name) : null,
  density !== 'compact' ? h('div', { class: 'types' }, s.types.map((t) => typeChip(t, true))) : null,
  density === 'large' ? h('div', { class: 'avail' }, s.avail + (s.bst ? ` · BST ${s.bst}` : '')) :
    density === 'standard' ? h('div', { class: 'avail' }, absent ? 'Not in PokeMMO' : s.avail) : null);
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
  const cards = [...gridEl.children];
  const i = cards.indexOf(e.currentTarget);
  const cols = Math.max(1, Math.round(gridEl.clientWidth / (cards[0].getBoundingClientRect().width + 8)));
  const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
  if (move) { e.preventDefault(); const t = cards[Math.min(cards.length - 1, Math.max(0, i + move))]; t && t.focus(); }
  if (e.key === 'Enter') { e.preventDefault(); go('#/pokedex/' + e.currentTarget.dataset.id); }
}

// ------------------------------------------------------------- roster report
export async function rosterDialog() {
  const rep = await get('/api/dex/roster');
  const body = h('div', { class: 'stack' });
  const draw = (r) => mount(body,
    notice('info', r.note),
    h('div', { class: 'row wrap' }, h('span', { class: 'counter' }, 'In PokeMMO (registry/your checks/dump): ', h('strong', null, r.counts.yes)),
      h('span', { class: 'counter' }, 'Reported absent: ', h('strong', null, r.counts.no)), h('span', { class: 'counter' }, 'Unverified: ', h('strong', null, r.counts.unknown)),
      h('span', { class: 'counter' }, `In-game Seen denominator (your 22 Nov video): `, h('strong', null, r.observed.seen_denominator))),
    h('div', { class: 'small' }, `Still to identify: ${r.still_to_identify} of ${r.expected_not_in_dex} species that the in-game Pokédex does not count. Registry ${r.registry_version} (checked ${fmtDate(r.checked_at)}).`),
    h('h3', { style: { margin: '6px 0 0' } }, 'Reported absent from the in-game Pokédex'),
    h('div', { class: 'list-rows' }, r.not_in_dex.map((x) => rosterRow(x))),
    h('h3', { style: { margin: '6px 0 0' } }, 'Unverified — check these in your in-game Pokédex'),
    h('div', { class: 'small muted' }, 'Search the species in PokeMMO’s Pokédex. Record whether it is listed. Your dated observation overrides the registry and stays on this computer.'),
    h('div', { class: 'list-rows', style: { maxHeight: '40vh', overflow: 'auto' } }, r.unknown.map((x) => rosterRow(x))));
  const rosterRow = (x) => h('div', { class: 'list-row', style: { cursor: 'default' } },
    h('span', { class: 'muted', style: { width: '44px' } }, '#' + pad3(x.id)), h('span', { class: 'grow' }, x.name, h('div', { class: 'tiny muted' }, `${x.label} · ${x.basis} · ${x.source || ''}`)),
    h('button', { class: 'btn small', onclick: async () => { await api('PUT', '/api/dex/roster/' + x.id, { in_dex: 'yes' }); draw(await get('/api/dex/roster')); } }, 'In my game dex'),
    h('button', { class: 'btn small', onclick: async () => { await api('PUT', '/api/dex/roster/' + x.id, { in_dex: 'no' }); draw(await get('/api/dex/roster')); } }, 'Not listed'),
    x.basis === 'your-check' ? h('button', { class: 'btn small ghost', onclick: async () => { await api('PUT', '/api/dex/roster/' + x.id, { in_dex: 'clear' }); draw(await get('/api/dex/roster')); } }, 'Clear') : null);
  draw(rep);
  await modal({ title: 'PokeMMO roster report', body, wide: true, actions: [
    { label: 'Export report (JSON)', kind: 'ghost', handler: async () => { downloadJson(`pokemmo-roster-report-${new Date().toISOString().slice(0, 10)}.json`, await get('/api/dex/roster')); return false; } },
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
const SIDE_TABS = [['registration', 'My registration'], ['breeding', 'Breeding'], ['notes', 'Notes']];

export async function renderDetail(pane, id, { back, popout = false, mode = 'expanded' } = {}) {
  clear(pane).append(h('div', { class: 'detail-body' }, h('div', { class: 'skeleton', style: { height: '120px' } })));
  let d;
  const run = setting('pokedex.progress_run');
  try { d = await get(`/api/dex/species/${id}?run=${encodeURIComponent(run || 'none')}`); } catch (e) { mount(pane, h('div', { class: 'detail-body' }, notice('bad', e.message))); return; }
  if (!popout) saveSettings({ 'pokedex.last_species': id }).catch(() => {});
  const shinyAvail = d.sprites.front_shiny || d.sprites.icon_shiny;
  const art = ui.shiny && shinyAvail ? (d.sprites.front_shiny || d.sprites.icon_shiny) : (d.sprites.front || d.sprites.icon);
  const av = d.availability;
  const avClass = av.in_game_dex === 'no' ? 'bad' : av.in_game_dex === 'yes' ? 'good' : 'unknown';
  const head = h('div', { class: 'detail-head' },
    h('div', { class: 'art' }, spriteOrFallback(art, d, art && art.includes('/battle/') ? 96 : 72, true),
      shinyAvail ? h('button', { class: 'shiny-toggle' + (ui.shiny ? ' on' : ''), title: ui.shiny ? 'Show normal colours' : 'Show shiny colours (artwork only — not ownership)',
        'aria-pressed': String(ui.shiny), onclick: () => { ui.shiny = !ui.shiny; renderDetail(pane, id, { back, popout, mode }); } }, '✦') : null),
    h('div', { class: 'grow', style: { minWidth: 0 } },
      h('div', { class: 'row' }, h('span', { class: 'muted nowrap' }, 'No. ' + pad3(d.id)), h('span', { class: 'grow' }), favToggle(d),
        !popout ? pinButton({ kind: 'pokemon', id: d.id }) : null,
        !popout ? h('button', { class: 'icon-btn', title: 'Open in a separate window', 'aria-label': 'Pop out', onclick: () => openPopout('pokedex', `#/species/${id}`) }, icon('popout')) : null,
        back ? h('button', { class: 'icon-btn', title: 'Close (Esc)', 'aria-label': 'Close details', onclick: back }, icon('close')) : null),
      h('h2', null, d.name),
      h('div', { class: 'row wrap', style: { marginTop: '4px' } }, typeChips(d.types),
        h('span', { class: 'badge ' + avClass, title: `${av.source || ''} (${av.evidence})` }, av.label))));
  pane.replaceChildren(head);
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
  const setTab = (t, side) => { ui.tab = t; ui.side = side ? t : null; renderDetail(pane, id, { back, popout, mode }); };
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

function availabilityBlock(d, compact) {
  const av = d.availability;
  const lines = [
    h('div', { class: 'row wrap' }, h('strong', null, 'In PokeMMO’s Pokédex: '),
      h('span', { class: 'badge ' + (av.in_game_dex === 'yes' ? 'good' : av.in_game_dex === 'no' ? 'bad' : 'unknown') }, { yes: 'Yes', no: 'No (reported)', unknown: 'Not verified' }[av.in_game_dex]),
      h('span', { class: 'small muted' }, 'How: ' + av.classes.map((c) => (CLASS_CHIPS.find((x) => x[0] === c) || [c, c])[1]).join(', '))),
    h('div', { class: 'small muted' }, `${av.evidence} · ${av.source || 'No source recorded'}`, av.url ? [' · ', extLink(av.url, 'source')] : null),
    av.note ? h('div', { class: 'small' }, av.note) : null,
    av.conflict ? h('div', { class: 'small', style: { color: 'var(--warn)' } }, av.conflict) : null,
    av.user_check ? h('div', { class: 'small' }, `Your in-game check: ${av.user_check.in_dex === 'yes' ? 'listed' : 'not listed'} (${fmtDate(av.user_check.checked_at)})`) : null];
  if (!compact) lines.push(h('div', { class: 'row wrap' }, h('span', { class: 'small muted' }, 'Checked your in-game Pokédex?'),
    h('button', { class: 'btn small', onclick: async () => { await api('PUT', '/api/dex/roster/' + d.id, { in_dex: 'yes' }); toast('Saved your in-game check'); } }, 'It’s listed'),
    h('button', { class: 'btn small', onclick: async () => { await api('PUT', '/api/dex/roster/' + d.id, { in_dex: 'no' }); toast('Saved your in-game check'); } }, 'Not listed')));
  return h('div', { class: 'card inset stack tight' }, lines);
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
        h('dt', null, 'Forms'), h('dd', null, d.forms.map((f) => f.name + (f.costume ? ' (costume)' : '')).join(', ')),
        overlay ? [h('dt', null, 'Patch note'), h('dd', null, overlay.note)] : null)),
    availabilityBlock(d),
    h('div', { class: 'tiny muted' }, 'Stats, moves and locations come from your installed dump (its extraction date is unknown). The dump’s raw “obtainable” flag ',
      `(${d.obtainable_flag}) is not used for availability.`, d.types_raw_duplicated ? ' The dump lists this single type twice; it is shown once.' : ''));
}

function statsSection(d, compact) {
  const max = 180;
  return h('div', { class: 'stack tight' }, h('div', { class: 'cells stats-big' + (compact ? ' compact' : '') }, STAT_ORDER.map(([k, label]) => h('div', { class: 'stat-row' },
    h('span', { class: 'lbl' }, label), h('span', { class: 'val' }, d.stats[k] ?? '—'),
    h('div', { class: 'bar' }, h('span', { style: { width: Math.min(100, (d.stats[k] || 0) / max * 100) + '%', '--bc': `var(--stat-${k})` } })))),
  h('div', { class: 'stat-row' }, h('span', { class: 'lbl' }, 'Total'), h('span', { class: 'val' }, d.bst),
    h('div', { class: 'bar' }, h('span', { style: { width: Math.min(100, d.bst / 720 * 100) + '%', '--bc': 'var(--text-primary)' } })))),
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
  if (!['wild'].includes(av.classes[0]) && av.basis === 'registry') wrap.append(notice('info', h('strong', null, av.label), ` — ${av.source}. Ordinary wild rows don’t cover this.`));
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
      out.append(h('div', { class: 'loc-group' }, h('div', { class: 'lg-head' }, h('span', { class: 'chip' }, cap(region)), area),
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

const MOVE_TABS = [['level', 'Level-up', (m) => m.method === 'level'], ['egg', 'Egg', (m) => m.method === 'EGG' || m.method === 'EGG & ITEM'],
  ['tutor', 'Tutor', (m) => m.method === 'TUTOR'], ['tm', 'TM (unconfirmed)', (m) => m.method === 'TM??'],
  ['other', 'Other', (m) => !['level', 'EGG', 'EGG & ITEM', 'TUTOR', 'TM??'].includes(m.method)]];
function moves(d) {
  const holder = h('div');
  const draw = () => {
    const [, , pred] = MOVE_TABS.find((t) => t[0] === ui.moveTab) || MOVE_TABS[0];
    let ms = d.moves.filter(pred);
    const seen = new Set(); ms = ms.filter((m) => { const k = m.id + '|' + m.level + '|' + m.method; if (seen.has(k)) return false; seen.add(k); return true; });
    if (ui.moveTab === 'level') ms.sort((a, b) => (a.level || 0) - (b.level || 0)); else ms.sort((a, b) => a.name.localeCompare(b.name));
    mount(holder, ms.length ? h('table', { class: 'table compact' },
      h('thead', null, h('tr', null, [ui.moveTab === 'level' ? 'Lv' : '', 'Move', 'Type', 'Cat.', 'Pow', 'Acc', 'PP'].map((c) => h('th', null, c)))),
      h('tbody', null, ms.map((m) => h('tr', null, h('td', { class: 'muted' }, ui.moveTab === 'level' ? m.level : ui.moveTab === 'other' ? m.method : ''),
        h('td', null, m.name), m.verified_meta ? [h('td', null, typeChip(m.type, true)), h('td', { class: 'small' }, m.category), h('td', null, m.power || '—'),
          h('td', null, m.accuracy > 100 ? '—' : m.accuracy), h('td', null, m.pp)] : h('td', { colspan: 5, class: 'small', style: { color: 'var(--st-dump)' } }, 'Details awaiting verification (no move metadata in dump)'))))) :
      h('div', { class: 'empty' }, 'No moves in this category.'));
  };
  const counts = Object.fromEntries(MOVE_TABS.map(([k, , p]) => [k, d.moves.filter(p).length]));
  const wrap = h('div', { class: 'stack' });
  wrap.append(h('div', null, tabs(MOVE_TABS.map(([k, l]) => ({ id: k, label: l, count: counts[k] })), ui.moveTab, (t) => { ui.moveTab = t; wrap.replaceWith(moves(d)); }, 'Move categories')),
    ui.moveTab === 'tm' ? notice('warn', '“TM??” in the dump means the TM source is unconfirmed — not promised to be purchasable or learnable as a TM.') : null, holder);
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
  const save = async () => { await api('PUT', `/api/dex/progress/${run}/${d.id}`, p); toast('Saved'); state.dexCache = null; };
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
  return h('div', { class: 'stack tight' }, h('div', { class: 'row' }, h('span', { class: 'label' }, 'Your notes (saved on this computer)'), h('span', { class: 'grow' }), status),
    h('textarea', { class: 'input', rows: 5, placeholder: 'Hunting spots you like, natures you want, reminders…', oninput: (e) => { status.textContent = 'Saving…'; save(e.target.value); } }, d.note || ''));
}
