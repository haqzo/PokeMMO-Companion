// Pokédex: responsive sprite-card grid + species detail (docs/design/06, research phase-3/04).
import { h, mount, clear, icon, get, api, state, setting, saveSettings, on, badge, notice, typeChip, typeChips, pad3, cap,
  spriteOrFallback, debounce, tabs, seg, toast, extLink } from '../core.js';
import { go, popoutButton, openPopout } from '../shell.js';

const TYPES = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel'];
const REGIONS = ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova'];
const STAT_ORDER = [['hp', 'HP'], ['attack', 'Attack'], ['defense', 'Defense'], ['sp_attack', 'Sp. Atk'], ['sp_defense', 'Sp. Def'], ['speed', 'Speed']];
const DEFAULT_F = { q: '', gen: 'all', types: [], region: '', horde: '', egg: '', fav: false, sort: 'num', season: '' };
let F = null;
let ui = { drawer: false, tab: 'overview', scroll: 0, locSeason: 'all', moveTab: 'level' };
let unsub = [];
let gridEl = null, countEl = null, list = [];

export function dispose() { unsub.forEach((u) => u()); unsub = []; }

async function loadList(force) {
  if (!state.dexCache || force) state.dexCache = (await get('/api/dex/species')).species;
  return state.dexCache;
}
// Filters persist across restarts; the search text only within this session (avoids a mysteriously short list later).
const persistFilters = debounce(() => saveSettings({ 'pokedex.filters': { ...F, q: '' } }).catch(() => {}), 700);

function applyFilters(all) {
  const q = F.q.trim().toLowerCase();
  let out = all.filter((s) => {
    if (q) {
      const num = q.replace(/^#/, '');
      const hit = s.name.toLowerCase().includes(q) || (/^\d+$/.test(num) && String(s.id) === String(Number(num))) ||
        (s.abilities || []).some((a) => a.toLowerCase().includes(q)) || s.types.includes(q);
      if (!hit) return false;
    }
    if (F.gen !== 'all' && String(s.gen) !== F.gen) return false;
    if (F.types.length && !F.types.every((t) => s.types.includes(t))) return false;
    if (F.region && !(s.regions || []).includes(F.region)) return false;
    if (F.horde === 'any' && !s.horde) return false;
    if (F.horde === '5' && !s.horde5) return false;
    if (F.egg && !(s.egg_groups || []).includes(F.egg)) return false;
    if (F.season && !(s.seasons || []).some((x) => x === F.season || x === 'Any')) return false;
    if (F.fav && !s.fav) return false;
    return true;
  });
  const by = { num: (a, b) => a.id - b.id, name: (a, b) => a.name.localeCompare(b.name), bst: (a, b) => (b.bst || 0) - (a.bst || 0) || a.id - b.id,
    fav: (a, b) => (b.fav - a.fav) || a.id - b.id };
  out.sort(by[F.sort] || by.num);
  return out;
}
function activeFilterCount() {
  return (F.types.length) + (F.region ? 1 : 0) + (F.horde ? 1 : 0) + (F.egg ? 1 : 0) + (F.fav ? 1 : 0) + (F.season ? 1 : 0);
}

export async function render(el, route) {
  dispose();
  if (!F) F = { ...DEFAULT_F, ...(setting('pokedex.filters') || {}) };
  const all = await loadList();
  const sel = route.parts[0] ? Number(route.parts[0]) : null;
  if (route.query.get('tab')) ui.tab = route.query.get('tab');
  const wide = el.clientWidth >= 1080;
  const page = h('div', { class: 'page flush' });
  mount(el, page);

  if (sel && !wide) {  // narrow: detail replaces grid
    const pane = h('div', { class: 'dex-detail', style: { borderLeft: 0, flex: 1 } });
    page.append(pane);
    await renderDetail(pane, sel, { back: () => go('#/pokedex') });
    return;
  }
  const layout = h('div', { class: 'dex-layout' + (sel ? ' split' : '') });
  page.append(layout);
  const gridWrap = h('div', { class: 'dex-grid-wrap' });
  layout.append(gridWrap);
  buildToolbar(gridWrap, all);
  const scroll = h('div', { class: 'dex-scroll', tabindex: '-1' });
  gridEl = h('div', { class: 'dex-grid', role: 'grid', 'aria-label': 'Pokémon' });
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
    if (card && !ui.scrolledTo) { card.scrollIntoView({ block: 'nearest' }); }
  }
  unsub.push(on('favourites', async () => { await loadList(true); if (gridEl && gridEl.isConnected) drawGrid(state.dexCache, sel); }));
  unsub.push(on('import', async (d) => { if (d.state === 'done' && d.kind === 'dumps') { await loadList(true); render(el, route); } }));
  const keyh = (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'f') { e.preventDefault(); const s = el.querySelector('#dex-search'); s && s.focus(); }
    if (e.key === 'Escape' && sel && !document.querySelector('.modal-back')) go('#/pokedex');
  };
  document.addEventListener('keydown', keyh);
  unsub.push(() => document.removeEventListener('keydown', keyh));
}

function buildToolbar(wrap, all) {
  const search = h('input', { id: 'dex-search', class: 'input', type: 'search', placeholder: 'Pokémon name, number, type or ability', value: F.q,
    'aria-label': 'Search Pokémon', oninput: debounce((e) => { F.q = e.target.value; persistFilters(); drawGrid(all); }, 120) });
  countEl = h('span', { class: 'small muted nowrap' });
  const filterBtn = h('button', { class: 'btn' + (ui.drawer ? ' primary' : ''), 'aria-expanded': String(ui.drawer), onclick: () => { ui.drawer = !ui.drawer; render(document.getElementById('main'), parseHash()); } },
    icon('filter'), 'Filters', activeFilterCount() ? h('span', { class: 'chip', style: { padding: '0 6px' } }, activeFilterCount()) : null);
  const sort = h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': 'Sort', onchange: (e) => { F.sort = e.target.value; persistFilters(); drawGrid(all); } },
    [['num', 'National #'], ['name', 'Name A–Z'], ['bst', 'Base stat total'], ['fav', 'Favourites first']].map(([v, t]) =>
      h('option', { value: v, selected: F.sort === v ? 'selected' : null, disabled: v === 'bst' && !state.boot.dex.imported ? 'disabled' : null }, t)));
  wrap.append(h('div', { class: 'dex-toolbar' },
    h('div', { class: 'search' }, icon('search'), search),
    seg([['all', 'All'], ['1', 'I'], ['2', 'II'], ['3', 'III'], ['4', 'IV'], ['5', 'V']], F.gen, (v) => { F.gen = v; persistFilters(); render(document.getElementById('main'), parseHash()); }, 'Generation of introduction'),
    filterBtn, sort, h('span', { class: 'grow' }), countEl,
    state.boot.dex.imported ? badge('DUMP_ONLY', 'Your dump data', 'Details come from your imported dump; extraction date unknown') :
      h('button', { class: 'btn small', onclick: () => go('#/settings/data') }, icon('download'), 'Import data'),
    popoutButton('pokedex')));
  if (ui.drawer) wrap.append(filterDrawer(all));
  const chips = activeChips(all);
  if (chips) wrap.append(chips);
}
function parseHash() { const raw = location.hash.replace(/^#\/?/, ''); const [p, qs] = raw.split('?'); const parts = p.split('/').filter(Boolean);
  return { page: parts[0], parts: parts.slice(1), query: new URLSearchParams(qs || ''), hash: location.hash }; }

function filterDrawer(all) {
  const imported = state.boot.dex.imported;
  const redraw = () => { persistFilters(); render(document.getElementById('main'), parseHash()); };
  const chip = (label, on_, fn, disabled) => h('button', { class: 'chip btnlike' + (on_ ? ' active' : ''), disabled: disabled ? 'disabled' : null, onclick: fn }, label);
  const eggGroups = [...new Set(all.flatMap((s) => s.egg_groups || []))].sort();
  return h('div', { class: 'filter-drawer' },
    h('div', { class: 'fgroup' }, h('span', { class: 'label' }, 'Type (match all selected)'), h('div', { class: 'chips' },
      TYPES.map((t) => h('button', { class: 'chip btnlike' + (F.types.includes(t) ? ' active' : ''), onclick: () => {
        F.types = F.types.includes(t) ? F.types.filter((x) => x !== t) : [...F.types, t].slice(-2); redraw(); } }, typeChip(t, true))))),
    h('div', { class: 'fgroup' }, h('span', { class: 'label' }, 'Encounter region (dump)' + (imported ? '' : ' — needs import')), h('div', { class: 'chips' },
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
    h('div', { class: 'fgroup' }, h('span', { class: 'label' }, 'Personal'), h('div', { class: 'chips' },
      chip('★ Favourites only', F.fav, () => { F.fav = !F.fav; redraw(); }))),
    h('div', { class: 'fgroup', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn ghost small', onclick: () => { F = { ...DEFAULT_F, q: F.q, sort: F.sort }; redraw(); } }, 'Clear filters')),
    h('p', { class: 'tiny muted', style: { flexBasis: '100%', margin: 0 } },
      'Generation = generation of introduction, not where it is found. Encounter filters use your dump’s rows (pre-patch freshness unknown); rotating, event and roaming Pokémon are not in those rows.'));
}
function activeChips(all) {
  if (!activeFilterCount() && F.gen === 'all') return null;
  const redraw = () => { persistFilters(); render(document.getElementById('main'), parseHash()); };
  const c = [];
  if (F.gen !== 'all') c.push(['Gen ' + ['I', 'II', 'III', 'IV', 'V'][Number(F.gen) - 1], () => { F.gen = 'all'; }]);
  F.types.forEach((t) => c.push([cap(t), () => { F.types = F.types.filter((x) => x !== t); }]));
  if (F.region) c.push([cap(F.region), () => { F.region = ''; }]);
  if (F.horde) c.push([F.horde === '5' ? 'Horde ×5' : 'Horde', () => { F.horde = ''; }]);
  if (F.season) c.push([F.season, () => { F.season = ''; }]);
  if (F.egg) c.push(['Egg: ' + F.egg, () => { F.egg = ''; }]);
  if (F.fav) c.push(['Favourites', () => { F.fav = false; }]);
  return h('div', { class: 'active-filters', style: { padding: '6px 16px', borderBottom: '1px solid var(--border-subtle)' } },
    h('span', { class: 'tiny muted' }, 'Active:'), c.map(([l, fn]) => h('button', { class: 'chip btnlike', onclick: () => { fn(); redraw(); }, title: 'Remove filter' }, l, ' ✕')),
    h('button', { class: 'btn ghost small', onclick: () => { F = { ...DEFAULT_F, q: F.q, sort: F.sort }; redraw(); } }, 'Clear all'));
}

function drawGrid(all, sel = Number(parseHash().parts[0]) || null) {
  if (!gridEl) return;
  list = applyFilters(all);
  if (countEl) countEl.textContent = `${list.length} of ${all.length}`;
  clear(gridEl);
  if (!list.length) {
    gridEl.append(h('div', { class: 'empty', style: { gridColumn: '1 / -1' } }, h('h3', null, 'No Pokémon match'),
      activeFilterCount() || F.q ? h('p', null, 'Search or filters are hiding everything. ', h('button', { class: 'btn small', onclick: () => {
        F = { ...DEFAULT_F, sort: F.sort }; persistFilters(); render(document.getElementById('main'), parseHash()); } }, 'Clear search & filters')) : null));
    return;
  }
  const frag = document.createDocumentFragment();
  for (const s of list) frag.append(card(s, s.id === sel));
  gridEl.append(frag);
}
function card(s, selected) {
  const favBtn = h('button', { class: 'fav-btn fav' + (s.fav ? ' on' : ''), title: s.fav ? 'Remove favourite' : 'Add favourite', 'aria-label': 'Favourite',
    'aria-pressed': String(!!s.fav), onclick: async (e) => { e.stopPropagation(); s.fav = !s.fav; favBtn.classList.toggle('on', s.fav);
      await api('PUT', `/api/dex/species/${s.id}/favourite`, { fav: s.fav }); } }, icon('star'));
  if (s.fav) favBtn.querySelector('path').setAttribute('fill', 'currentColor');
  const el = h('div', { class: 'dex-card' + (selected ? ' selected' : ''), role: 'gridcell', tabindex: '0', dataset: { id: s.id },
    'aria-label': `#${pad3(s.id)} ${s.name}, ${s.types.join(' ')}`,
    onclick: () => go('#/pokedex/' + s.id), onkeydown: gridKeys },
  h('span', { class: 'num' }, '#' + pad3(s.id)), favBtn,
  h('div', { class: 'sprite' }, spriteOrFallback(s.icon, s, 72)),
  h('div', { class: 'nm' }, s.name), h('div', { class: 'types' }, s.types.map((t) => typeChip(t, true))),
  s.availability && s.availability.kind !== 'unknown' ? h('div', { class: 'avail' }, s.availability.kind === 'special' ? 'Special acquisition' : s.availability.label) : null);
  return el;
}
function gridKeys(e) {
  const cards = [...gridEl.children];
  const i = cards.indexOf(e.currentTarget);
  const cols = Math.max(1, Math.round(gridEl.clientWidth / (cards[0].getBoundingClientRect().width + 10)));
  const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
  if (move) { e.preventDefault(); const t = cards[Math.min(cards.length - 1, Math.max(0, i + move))]; t && t.focus(); }
  if (e.key === 'Enter') { e.preventDefault(); go('#/pokedex/' + e.currentTarget.dataset.id); }
}

// ---------------------------------------------------------------- detail
const EVO = { LEVEL: (e) => `Level ${e.value}`, ITEM: (e) => e.item || 'Item', TRADE: () => 'Trade', TRADE_WITH_ITEM: (e) => `Trade holding ${e.item || 'item'}`,
  HAPPINESS: () => 'High friendship', HAPPINESS_DAY: () => 'Friendship (day)', HAPPINESS_NIGHT: () => 'Friendship (night)',
  LEVEL_WITH_SKILL: () => 'Level up knowing a move', LEVEL_FEMALE: (e) => `Level ${e.value} (female)`, LEVEL_MALE: (e) => `Level ${e.value} (male)`,
  ITEM_MALE: (e) => `${e.item || 'Item'} (male)`, ITEM_FEMALE: (e) => `${e.item || 'Item'} (female)`, LEVEL_ITEM_NIGHT: () => 'Level up holding item (night)',
  LEVEL_ITEM_DAY: () => 'Level up holding item (day)', ATK_GREATER_THAN_DEF: (e) => `Level ${e.value}, Atk > Def`, ATK_LESS_THAN_DEF: (e) => `Level ${e.value}, Atk < Def`,
  ATK_EQUAL_TO_DEF: (e) => `Level ${e.value}, Atk = Def`, LEVEL_WITH_MONSTER: () => 'Level up with another Pokémon in party' };
const evoText = (via) => (EVO[via.method] ? EVO[via.method](via) : via.method.replace(/_/g, ' ').toLowerCase()) ;

export async function renderDetail(pane, id, { back, popout = false, mode = 'expanded' } = {}) {
  clear(pane).append(h('div', { class: 'detail-body' }, h('div', { class: 'skeleton', style: { height: '120px' } })));
  let d;
  try { d = await get('/api/dex/species/' + id); } catch (e) { mount(pane, h('div', { class: 'detail-body' }, notice('bad', e.message))); return; }
  if (!popout) saveSettings({ 'pokedex.last_species': id }).catch(() => {});
  const favBtn = h('button', { class: 'fav-btn' + (d.fav ? ' on' : ''), title: 'Favourite', 'aria-pressed': String(d.fav), onclick: async () => {
    d.fav = !d.fav; favBtn.classList.toggle('on', d.fav); favBtn.querySelector('path').setAttribute('fill', d.fav ? 'currentColor' : 'none');
    await api('PUT', `/api/dex/species/${id}/favourite`, { fav: d.fav }); } }, icon('star'));
  if (d.fav) favBtn.querySelector('path').setAttribute('fill', 'currentColor');
  const front = d.sprites.front || d.sprites.icon;
  const head = h('div', { class: 'detail-head' },
    h('div', { class: 'art' }, spriteOrFallback(front, d, front === d.sprites.front ? 96 : 72)),
    h('div', { class: 'grow' },
      h('div', { class: 'row' }, h('span', { class: 'muted' }, '#' + pad3(d.id)), h('span', { class: 'grow' }), favBtn,
        !popout ? h('button', { class: 'icon-btn', title: 'Open in a separate window', 'aria-label': 'Pop out', onclick: () => openPopout('pokedex', `#/species/${id}`) }, icon('popout')) : null,
        back ? h('button', { class: 'icon-btn', title: 'Close (Esc)', 'aria-label': 'Close details', onclick: back }, icon('close')) : null),
      h('h2', null, d.name), h('div', { class: 'row wrap', style: { marginTop: '4px' } }, typeChips(d.types),
        h('span', { class: 'chip' }, 'Gen ' + ['I', 'II', 'III', 'IV', 'V'][d.gen - 1])),
      h('div', { class: 'row wrap small', style: { marginTop: '6px' } }, d.imported ? badge('DUMP_ONLY', 'Dump only', 'From your imported dump; extraction date unknown') :
        badge('UNKNOWN', 'Details not imported'), d.availability ? h('span', { class: 'muted' }, d.availability.label) : null)));
  pane.replaceChildren(head);
  const body = h('div', { class: 'detail-body' });
  pane.append(body);
  if (!d.imported) {
    body.append(notice('info', h('strong', null, 'Only bundled facts are available. '), 'Import your PokeMMO dump (Settings › Data) to see stats, abilities, locations, moves, evolutions and sprites. Nothing is downloaded or uploaded.'),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => go('#/settings/data') }, 'Open data import')), notesSection(d));
    return;
  }
  const T = [['overview', 'Overview'], ['locations', 'Locations', d.locations.length], ['moves', 'Moves', d.moves.length], ['evolution', 'Evolution'], ['forms', 'Forms'], ['breeding', 'Breeding'], ['notes', 'Notes']];
  if (popout && mode === 'compact') { body.append(overview(d, true)); return; }
  const tabBar = tabs(T.map(([id_, label, count]) => ({ id: id_, label, count })), ui.tab, (t) => { ui.tab = t; renderDetail(pane, id, { back, popout, mode }); }, 'Species sections');
  body.append(tabBar);
  const section = { overview, locations, moves, evolution, forms, breeding, notes: notesSection }[ui.tab] || overview;
  body.append(section(d));
}

function overview(d, compact) {
  const max = 180;
  const stats = h('div', { class: 'cells' }, STAT_ORDER.map(([k, label]) => h('div', { class: 'stat-row' },
    h('span', { class: 'lbl' }, label), h('span', { class: 'val' }, d.stats[k] ?? '—'),
    h('div', { class: 'bar' }, h('span', { style: { width: Math.min(100, (d.stats[k] || 0) / max * 100) + '%', '--bc': `var(--stat-${k})` } })))),
  h('div', { class: 'stat-row' }, h('span', { class: 'lbl' }, 'Total'), h('span', { class: 'val' }, d.bst),
    h('div', { class: 'bar' }, h('span', { style: { width: Math.min(100, d.bst / 720 * 100) + '%', '--bc': 'var(--text-primary)' } }))));
  if (compact) return h('div', { class: 'stack' }, stats, h('div', { class: 'small' }, 'Abilities: ', d.abilities.map((a) => a.name + (a.slot === 'hidden' ? ' (HA)' : '')).join(', ')));
  const abil = h('div', { class: 'stack tight' }, d.abilities.map((a) => h('div', { class: 'row' }, h('span', { style: { fontWeight: 600 } }, a.name),
    h('span', { class: 'chip' }, a.slot === 'hidden' ? 'Hidden Ability' : a.slot === 'slot1' && d.abilities.filter((x) => x.slot !== 'hidden').length === 1 ? 'Ability' : 'Ability ' + a.slot.slice(-1)))));
  const ev = Object.entries(d.ev_yield).map(([k, v]) => `${v} ${STAT_ORDER.find((s) => s[0] === k)[1]}`).join(', ') || '—';
  const overlay = d.overlays && d.overlays[0];
  return h('div', { class: 'stack' },
    h('div', null, h('div', { class: 'label', style: { marginBottom: '6px' } }, 'Base stats'), stats),
    h('div', null, h('div', { class: 'label', style: { marginBottom: '6px' } }, 'Abilities'), abil),
    h('dl', { class: 'kv' },
      h('dt', null, 'Catch rate'), h('dd', null, String(d.catch_rate), overlay ? h('span', { class: 'small', style: { marginLeft: '8px' } }, badge('CORROBORATED', 'Matches ' + overlay.source, overlay.note)) : null),
      h('dt', null, 'Gender'), h('dd', null, d.gender.label, h('span', { class: 'tiny muted' }, ' (standard code mapping)')),
      h('dt', null, 'Egg groups'), h('dd', null, d.egg_groups.map(cap).join(', ')),
      h('dt', null, 'EV yield'), h('dd', null, ev),
      h('dt', null, 'Growth'), h('dd', null, d.growth || '—'),
      h('dt', null, 'Height / weight'), h('dd', null, `${d.height_m} m · ${d.weight_kg} kg`),
      d.held_items.length ? [h('dt', null, 'Wild held items'), h('dd', null, d.held_items.join(', '))] : null,
      h('dt', null, 'Dump “obtainable”'), h('dd', null, String(d.obtainable_flag), h('div', { class: 'tiny muted' }, 'Raw dump flag — does not mean currently wild or permanently ownable.'))),
    d.types_raw_duplicated ? h('p', { class: 'tiny muted', style: { margin: 0 } }, 'The dump lists this single type twice; it is shown once.') : null);
}

const SEASONS = ['all', 'Spring', 'Summer', 'Autumn', 'Winter'];
function rateCell(r) { return h('td', { class: 'rate ' + r.kind, title: r.raw || '' }, r.label); }
function locations(d) {
  const wrap = h('div', { class: 'stack' });
  if (d.availability.kind === 'special') wrap.append(notice('info', h('strong', null, d.availability.label), '. Ordinary location rows do not cover this acquisition.'));
  if (!d.locations.length) { wrap.append(h('div', { class: 'empty' }, h('h3', null, 'No ordinary wild locations in your dump'),
    h('p', null, 'That does not mean unobtainable — it may come from evolution, breeding, a gift, a roamer, an event or the storyline. Unknown here.'))); return wrap; }
  const draw = () => {
    const rows = d.locations.filter((l) => ui.locSeason === 'all' || l.season === ui.locSeason || l.season === 'Any');
    const groups = {};
    for (const l of rows) {
      const key = `${l.region}|${l.area}`;
      (groups[key] ||= []).push(l);
    }
    const out = h('div', { class: 'stack tight' });
    for (const [key, ls] of Object.entries(groups)) {
      const [region, area] = key.split('|');
      // collapse identical rows that only differ by season when showing all seasons
      const seen = new Map();
      for (const l of ls) {
        const sig = [l.method, l.min, l.max, l.horde3, l.horde5, l.morning.label, l.day.label, l.night.label].join('|');
        if (!seen.has(sig)) seen.set(sig, { ...l, seasons: [l.season] }); else seen.get(sig).seasons.push(l.season);
      }
      out.append(h('div', { class: 'loc-group' }, h('div', { class: 'lg-head' }, h('span', { class: 'chip' }, cap(region)), area),
        h('table', { class: 'table compact' }, h('thead', null, h('tr', null, ['Method', 'Lv', 'Horde', 'Season', 'Morning', 'Day', 'Night'].map((c) => h('th', null, c)))),
          h('tbody', null, [...seen.values()].map((l) => h('tr', null, h('td', null, l.method), h('td', { class: 'nowrap' }, l.min === l.max ? l.min : `${l.min}–${l.max}`),
            h('td', null, l.horde5 ? '×5' : l.horde3 ? '×3' : '—'), h('td', { class: 'small' }, l.seasons.join(', ')), rateCell(l.morning), rateCell(l.day), rateCell(l.night)))))));
    }
    return out;
  };
  const holder = h('div');
  const redraw = () => mount(holder, draw());
  wrap.append(h('div', { class: 'row wrap' }, h('span', { class: 'label' }, 'Season'), seg(SEASONS.map((s) => [s, s === 'all' ? 'All' : s]), ui.locSeason, (v) => { ui.locSeason = v; redraw(); }, 'Season')),
    h('p', { class: 'tiny muted', style: { margin: 0 } }, '“Lure only”, “Special” and “Unknown rate” are shown as the dump states them — never as 0% or 100%. Percentages come from your dump and may predate later patches.'),
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
  const bar = tabs(MOVE_TABS.map(([k, l]) => ({ id: k, label: l, count: counts[k] })), ui.moveTab,
    (t) => { ui.moveTab = t; wrap.replaceWith(moves(d)); }, 'Move categories');
  wrap.append(h('div', null, bar),
    ui.moveTab === 'tm' ? notice('warn', '“TM??” in the dump means the TM source is unconfirmed — these are not promised to be purchasable or learnable as TMs.') : null, holder);
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
function forms(d) {
  return h('div', { class: 'stack' },
    h('table', { class: 'table compact' }, h('thead', null, h('tr', null, ['Form', 'Kind', 'Dump “released”'].map((c) => h('th', null, c)))),
      h('tbody', null, d.forms.map((f) => h('tr', null, h('td', null, f.name), h('td', null, f.costume ? 'Costume' : f.form_id === 0 ? 'Default' : 'Alternate form'),
        h('td', null, String(f.released)))))),
    h('p', { class: 'tiny muted', style: { margin: 0 } }, 'Costumes are cosmetic (official, Jul 2026) and are not separate species. “Released” is a raw dump flag and does not prove a form is currently obtainable.'));
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
