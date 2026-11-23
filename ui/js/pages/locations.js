// Location explorer: region tabs, an interactive map drawn from artwork YOU extracted from your own ROMs (never
// shipped), your own map marks (Edit map), and every encounter row from your installed dump with filters and
// two-way Pokémon ⇄ location search. No map coordinates, route outlines or rates are invented: a location is on
// the map only where you placed it; everything else is listed as "not on the map yet".
import { h, mount, icon, get, post, api, notice, debounce, cap, pad3, typeChip, typeChips, fmtDate, relTime, toast, on, modal,
  confirmDialog, sizedSprite, TYPE_LIST, SHELL, setting, saveSettings } from '../core.js';
import { go, popoutButton, pinButton } from '../shell.js';
import { t } from '../i18n.js';
import { linkedNotes, openRoute } from '../links.js';
import { createMapView } from '../mapview.js';
import { downloadJson, pickJsonFile } from '../components.js';

export const REGIONS = ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova'];
const TIMES = [['morning', 'Morning', 1], ['day', 'Day', 2], ['night', 'Night', 4]];
const TAGS = [['town', 'Town / city'], ['route', 'Route'], ['cave', 'Cave / dungeon'], ['special', 'Special area'], ['transition', 'Transition to another map'], ['other', 'Other']];
const f = { q: '', species: null, type: '', method: '', horde: false, time: '', season: '' };
const show = { markers: true, labels: false, highlights: true };
const cache = { locs: null, species: null, enc: {}, maps: null, layout: {} };
let unsub = [];
let view = null;
export function dispose() { unsub.forEach((u) => u()); unsub = []; if (view) view.destroy(); view = null; }

async function loadLocs() { if (!cache.locs) cache.locs = await get('/api/locations'); return cache.locs; }
async function loadSpecies() {
  if (!cache.species) { const sp = await get('/api/dex/species?run=none'); cache.species = Object.fromEntries(sp.species.map((s) => [s.id, s])); }
  return cache.species;
}
async function loadEnc(region) { if (!cache.enc[region]) cache.enc[region] = (await get('/api/locations-encounters?region=' + region)).rows; return cache.enc[region]; }
async function loadMaps(force) { if (!cache.maps || force) cache.maps = await get('/api/maps'); return cache.maps; }
async function loadLayout(region, force) { if (!cache.layout[region] || force) cache.layout[region] = await get(`/api/maps/${region}/layout`); return cache.layout[region]; }

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

function matchingLocations(region, locs, enc, species) {
  const q = f.q.trim().toLowerCase();
  const byLoc = new Map();
  for (const r of enc) if (rowPasses(r, species)) (byLoc.get(r[0]) || byLoc.set(r[0], new Set()).get(r[0])).add(r[1]);
  return locs.filter((l) => l.region === region).filter((l) => {
    if (filtersActive() && !byLoc.has(l.id)) return false;
    if (!q) return true;
    if (l.name.toLowerCase().includes(q)) return true;
    const sids = filtersActive() ? byLoc.get(l.id) : new Set(l.species);
    for (const sid of sids || []) if (((species[sid] || {}).name || '').toLowerCase().includes(q)) return true;
    return false;
  });
}

// ===================================================================== page
export async function render(el, route) {
  dispose();
  const data = await loadLocs();
  const q = route.query || new URLSearchParams();
  let region = q.get('region') || setting('locations.region') || 'kanto';
  if (!REGIONS.includes(region)) region = 'kanto';
  let sel = route.parts[1] ? decodeURIComponent(route.parts[1]) : null;
  if (sel && sel.includes(':') && REGIONS.includes(sel.split(':')[0])) region = sel.split(':')[0];
  if (q.get('species')) { f.species = Number(q.get('species')) || null; }
  const page = h('div', { class: 'page flush loc-page' });
  mount(el, page);
  page.append(h('div', { class: 'page-head', style: { padding: '14px 18px 4px' } },
    h('button', { class: 'btn ghost', onclick: () => go('#/tools') }, icon('back'), t('tools.title')),
    h('div', null, h('h1', null, t('loc.title')), h('div', { class: 'sub' }, 'Region maps from your own game files, your own map marks, and every encounter in your installed data.')),
    h('div', { class: 'actions' }, h('button', { class: 'btn small', onclick: () => importDialog(() => renderAgain()) }, icon('download'), 'Region maps…'),
      pinButton({ kind: 'tool', id: 'locations' }), popoutButton('locations'))));
  const host = h('div', { class: 'loc-host' });
  page.append(host);
  const renderAgain = async () => { await loadMaps(true); await explorer(host, { region, sel, variant: 'page', nav: go }); };
  if (!data.imported) {
    host.append(h('div', { style: { padding: '0 18px' } }, notice('info', 'Install your PokeMMO data to list locations and encounters. ', h('button', { class: 'btn small', onclick: () => go('#/settings/data') }, 'Settings › Data'))));
  }
  await explorer(host, { region, sel, variant: 'page', nav: go });
}

/** The explorer body, shared by the page and the popout. */
export async function explorer(host, { region, sel, variant = 'page', nav = go }) {
  if (view) { view.destroy(); view = null; }
  const data = await loadLocs();
  const [species, maps, enc, lay] = await Promise.all([loadSpecies().catch(() => ({})), loadMaps(), data.imported ? loadEnc(region) : [], loadLayout(region)]);
  const st = maps.regions[region];
  const inst = st.installed;
  const mapIds = inst ? inst.maps.map((m) => m.id) : [];
  const lastMap = (setting('locations.maps') || {})[region];
  let mapId = mapIds.includes(lastMap) ? lastMap : mapIds[0];
  let marks = (lay.layout.marks || []).map((m) => ({ ...m }));
  let editing = false;
  const locName = Object.fromEntries(data.locations.map((l) => [l.id, l.name]));
  const regionLocs = data.locations.filter((l) => l.region === region);

  const wrap = h('div', { class: `loc-explorer v-${variant}` + (sel ? ' has-sel' : '') });
  mount(host, wrap);

  // ---------------- region tabs (with counts when a Pokémon / filter is active)
  const tabsEl = h('div', { class: 'tabs loc-tabs', role: 'tablist', 'aria-label': 'Region' });
  const drawTabs = async () => {
    const counts = {};
    if (filtersActive() && data.imported) {
      for (const r of REGIONS) {
        const rows = cache.enc[r] || (f.species ? await loadEnc(r) : null);
        if (rows) counts[r] = new Set(rows.filter((x) => rowPasses(x, species)).map((x) => x[0])).size;
      }
    }
    mount(tabsEl, REGIONS.map((r) => h('button', { class: 'tab' + (r === region ? ' active' : ''), role: 'tab', 'aria-selected': String(r === region), dataset: { region: r },
      onclick: () => { saveSettings({ 'locations.region': r }).catch(() => {}); explorer(host, { region: r, sel: null, variant, nav }); } },
    cap(r), counts[r] !== undefined ? h('span', { class: 'count' }, counts[r]) : null)));
  };

  // ---------------- filters
  const typeSel = h('select', { class: 'input', 'aria-label': 'Type', onchange: (e) => { f.type = e.target.value; refresh(); } },
    h('option', { value: '' }, 'Any type'), TYPE_LIST.map((x) => h('option', { value: x, selected: f.type === x ? 'selected' : null }, cap(x))));
  const methods = [...new Set(regionLocs.flatMap((l) => l.methods))].sort();
  const sel_ = (label, key, opts) => h('select', { class: 'input', 'aria-label': label, onchange: (e) => { f[key] = e.target.value; refresh(); } },
    opts.map(([v, l]) => h('option', { value: v, selected: f[key] === v ? 'selected' : null }, l)));
  const pokeIn = h('input', { class: 'input', list: 'loc-species-dl', placeholder: 'Pokémon (name or #)', 'aria-label': 'Pokémon', autocomplete: 'off',
    value: f.species && species[f.species] ? species[f.species].name : '' });
  const dl = h('datalist', { id: 'loc-species-dl' }, Object.values(species).map((s) => h('option', { value: s.name }, '#' + pad3(s.id))));
  pokeIn.addEventListener('change', () => {
    const v = pokeIn.value.trim().toLowerCase().replace(/^#/, '');
    const s = Object.values(species).find((x) => x.name.toLowerCase() === v) || (/^\d+$/.test(v) ? species[Number(v)] : null);
    f.species = s ? s.id : null;
    if (s) pokeIn.value = s.name;
    refresh();
  });
  const pokeCard = h('div', { class: 'loc-poke' });
  const drawPokeCard = () => {
    const s = f.species && species[f.species];
    mount(pokeCard, s ? h('div', { class: 'row tight' }, sizedSprite(s, 40, { still: s.still, url: s.icon, tier: s.size || 'm' }),
      h('div', { class: 'grow' }, h('div', { class: 'small' }, s.name, h('span', { class: 'tiny muted' }, ' #' + pad3(s.id))), typeChips(s.types, true)),
      h('button', { class: 'btn small ghost', onclick: () => nav('#/pokedex/' + s.id + '?tab=locations') }, 'Summary'),
      h('button', { class: 'icon-btn', 'aria-label': 'Clear Pokémon', onclick: () => { f.species = null; pokeIn.value = ''; refresh(); } }, icon('close'))) : null);
  };
  const searchIn = h('input', { class: 'input', type: 'search', value: f.q, placeholder: 'Location or Pokémon', 'aria-label': 'Search locations', oninput: debounce((e) => { f.q = e.target.value; refresh(); }, 120) });
  const hordeChip = h('button', { class: 'chip btnlike' + (f.horde ? ' active' : ''), 'aria-pressed': String(f.horde), onclick: (e) => { f.horde = !f.horde; e.currentTarget.classList.toggle('active', f.horde); e.currentTarget.setAttribute('aria-pressed', String(f.horde)); refresh(); } }, 'Hordes');
  const filters = h('div', { class: 'loc-filters', role: 'search' },
    h('div', { class: 'search' }, icon('search'), searchIn),
    h('div', { class: 'field' }, pokeIn, dl), pokeCard,
    h('div', { class: 'loc-filter-grid' }, typeSel,
      sel_('Encounter type', 'method', [['', 'Any encounter type'], ...methods.map((m) => [m, m])]),
      sel_('Time of day', 'time', [['', 'Any time'], ...TIMES.map(([v, l]) => [v, l])]),
      sel_('Season', 'season', [['', 'Any season'], ...['Spring', 'Summer', 'Autumn', 'Winter'].map((s) => [s, s])]), hordeChip),
    h('button', { class: 'btn small ghost', onclick: () => { Object.assign(f, { q: '', species: null, type: '', method: '', horde: false, time: '', season: '' }); explorer(host, { region, sel, variant, nav }); } }, 'Clear filters'));

  // ---------------- map
  const mapPane = h('div', { class: 'loc-map' });
  const provCount = h('span', { class: 'loc-markcount' });
  const listEl = h('div', { class: 'loc-list', role: 'list' });
  const count = h('div', { class: 'tiny muted loc-count' });
  const side = h('div', { class: 'loc-side' });
  const editPanel = h('div', { class: 'loc-edit-panel' });

  const markOfLoc = (lid) => marks.find((m) => m.location_id === lid && m.map === mapId) || marks.find((m) => m.location_id === lid);
  let current = [];
  function highlightSet() {
    if (!filtersActive() && !f.q.trim()) return null;
    return new Set(current.map((l) => l.id));
  }

  function drawMapPane() {
    if (view) { view.destroy(); view = null; }
    if (!inst) { mount(mapPane, unavailable(region, st, () => importDialog(() => explorer(host, { region, sel, variant, nav })))); return; }
    const m = inst.maps.find((x) => x.id === mapId) || inst.maps[0];
    mapId = m.id;
    view = createMapView({
      image: { url: m.url, w: m.w, h: m.h }, alt: `${m.label} map (artwork extracted from your ${inst.game})`, marks, mapId, show, highlight: highlightSet(),
      selectedLoc: sel, labelFor: (mk) => mk.label || (mk.location_id ? locName[mk.location_id] || '(unknown location)' : mk.target_map ? '→ ' + (inst.maps.find((x) => x.id === mk.target_map) || {}).label : ''),
      onSelect: (mk) => { if (mk.location_id) selectLoc(mk.location_id); },
      onTransition: (mk) => switchMap(mk.target_map),
      onCreate: (shape) => markDialog({ shape, region, regionLocs, maps: inst.maps, mapId }),
      onEditSelect: (mk) => drawEditPanel(mk),
      onChange: (next, why) => { pushUndo(); marks = next; afterEdit(why); },
    });
    const sub = inst.maps.length > 1 ? h('div', { class: 'loc-submaps', role: 'tablist', 'aria-label': 'Sub-maps' }, inst.maps.map((x) => h('button', {
      class: 'chip btnlike' + (x.id === mapId ? ' active' : ''), role: 'tab', 'aria-selected': String(x.id === mapId), onclick: () => switchMap(x.id) }, x.label,
      marks.some((mk) => mk.map === x.id) ? h('span', { class: 'tiny muted' }, ' ' + marks.filter((mk) => mk.map === x.id).length) : null))) : null;
    const tgl = (key, label) => h('button', { class: 'chip btnlike' + (show[key] ? ' active' : ''), 'aria-pressed': String(show[key]), onclick: (e) => {
      show[key] = !show[key]; e.currentTarget.classList.toggle('active', show[key]); e.currentTarget.setAttribute('aria-pressed', String(show[key])); view.setShow({ [key]: show[key] }); } }, label);
    const fsBtn = h('button', { class: 'icon-btn', 'aria-label': 'Full screen', title: 'Full screen', onclick: () => {
      if (document.fullscreenElement) document.exitFullscreen(); else mapPane.requestFullscreen && mapPane.requestFullscreen().catch(() => mapPane.classList.toggle('pseudo-fs')); } }, icon('expand'));
    const tools = h('div', { class: 'map-tools' },
      h('button', { class: 'icon-btn', 'aria-label': 'Zoom in', title: 'Zoom in (+)', onclick: () => view.zoomBy(1.25) }, icon('plus')),
      h('button', { class: 'icon-btn', 'aria-label': 'Zoom out', title: 'Zoom out (−)', onclick: () => view.zoomBy(0.8) }, icon('minus')),
      h('button', { class: 'icon-btn', 'aria-label': 'Fit map', title: 'Fit (0)', onclick: () => view.fit() }, icon('fit')),
      h('button', { class: 'btn small ghost', onclick: () => view.reset(), title: 'Actual pixels (1:1)' }, '1:1'), fsBtn,
      h('span', { class: 'grow' }),
      variant === 'compact' ? null : [tgl('markers', 'Markers'), tgl('labels', 'Labels'), tgl('highlights', 'Highlights')],
      variant === 'page' || variant === 'expanded' ? h('button', { class: 'btn small' + (editing ? ' primary' : ''), 'aria-pressed': String(editing), onclick: () => toggleEdit() }, icon('note'), editing ? 'Done editing' : 'Edit map') : null);
    const prov = h('div', { class: 'tiny muted loc-prov' }, `${m.label} · original Town Map artwork extracted on this computer from your ${inst.game} (${inst.game_code}) on ${fmtDate(inst.extracted_at)}`,
      inst.verified ? '' : ' · unverified build — compare with your game', ' · ', provCount);
    provCount.textContent = `${marks.filter((x) => x.map === mapId).length} of your marks on this map`;
    mount(mapPane, sub, tools, view.el, prov, editing ? editPanel : null);
    if (editing) { view.setEditable(true); view.setTool(editTool); drawEditPanel(); }
    if (sel) { const mk = markOfLoc(sel); if (mk && mk.map === mapId) setTimeout(() => view && view.centerOn(mk), 80); }
  }
  function switchMap(id) { if (!id || id === mapId) return; mapId = id; saveSettings({ 'locations.maps': { ...(setting('locations.maps') || {}), [region]: id } }).catch(() => {}); drawMapPane(); }

  // ---------------- list + detail
  function drawList() {
    current = matchingLocations(region, data.locations, enc, species);
    count.textContent = `${current.length} of ${regionLocs.length} ${cap(region)} locations` + (inst ? ` · ${current.filter((l) => markOfLoc(l.id)).length} on your map` : '');
    mount(listEl, current.length ? current.map((l) => {
      const mk = markOfLoc(l.id);
      return h('button', { class: 'loc-row' + (l.id === sel ? ' selected' : ''), role: 'listitem', dataset: { loc: l.id }, onclick: () => selectLoc(l.id) },
        h('span', { class: 'grow' }, l.name, l.notes ? h('span', { class: 'tiny muted' }, ` · 📝 ${l.notes}`) : null),
        inst ? h('span', { class: 'tiny ' + (mk ? 'muted' : 'warn-text'), title: mk ? 'On your map' : 'Not on the map yet' }, mk ? '◉' : '○') : null,
        h('span', { class: 'tiny muted' }, `${l.species_count} Pokémon · ${l.methods.join(', ')}${l.horde ? ' · hordes' : ''}`));
    }) : h('div', { class: 'empty' }, data.imported ? 'No locations match these filters.' : 'No data installed.'));
  }
  async function selectLoc(id) {
    sel = id;
    wrap.classList.add('has-sel');
    if (variant === 'page') history.replaceState(null, '', '#/tools/locations/' + encodeURIComponent(id));
    for (const b of listEl.querySelectorAll('.loc-row')) b.classList.toggle('selected', b.dataset.loc === id);
    const mk = markOfLoc(id);
    if (view) { if (mk && mk.map !== mapId) switchMap(mk.map); view.setSelectedLoc(id); if (mk && view) view.centerOn(mk); }
    const pane = h('div', { class: 'loc-detail' });
    mount(side, pane);
    await renderLocation(pane, id, { back: () => { sel = null; wrap.classList.remove('has-sel'); if (view) view.setSelectedLoc(null); drawSide(); if (variant === 'page') history.replaceState(null, '', '#/tools/locations'); },
      popout: variant !== 'page', nav, onMap: inst ? (mk ? 'on' : 'off') : 'nomap' });
  }
  function drawSide() { mount(side, h('div', { class: 'loc-listwrap' }, count, listEl)); }

  function refresh() {
    drawPokeCard();
    drawList();
    if (view) view.setHighlight(highlightSet());
    drawTabs();
    if (!sel) drawSide();
  }

  // ---------------- editing
  let editTool = 'select';
  let undo = [], redo = [];
  const saveDraft = debounce(() => api('PUT', `/api/maps/${region}/draft`, { marks }).catch(() => {}), 600);
  function pushUndo() { undo.push(JSON.stringify(marks)); if (undo.length > 200) undo.shift(); redo = []; }
  function afterEdit() { if (view) view.setMarks(marks); provCount.textContent = `${marks.filter((x) => x.map === mapId).length} of your marks on this map`; saveDraft(); drawEditPanel(); drawList(); }
  async function toggleEdit() {
    if (!editing) {
      const draft = lay.draft;
      if (draft && Array.isArray(draft.marks) && JSON.stringify(draft.marks) !== JSON.stringify(lay.layout.marks)) {
        if (await confirmDialog('Restore unfinished edits?', `You have unsaved map edits from ${relTime(draft.saved_at)}. Restore them? (Choose Cancel to start from your saved layout.)`, 'Restore')) marks = draft.marks.map((m) => ({ ...m }));
      }
      editing = true; undo = []; redo = [];
    } else {
      if (JSON.stringify(marks) !== JSON.stringify(lay.layout.marks)) {
        const save = await confirmDialog('Save your map edits?', 'Save keeps them. Cancel keeps them as unfinished work you can restore next time.', 'Save');
        if (save) await saveLayout(); else saveDraft();
      }
      editing = false;
    }
    drawMapPane();
  }
  async function saveLayout() {
    try {
      const r = await api('PUT', `/api/maps/${region}/layout`, { version: 1, region, marks });
      lay.layout = r.layout; lay.draft = null; marks = r.layout.marks.map((m) => ({ ...m })); cache.layout[region] = lay;
      toast(r.problems.length ? `Saved with ${r.problems.length} correction(s): ${r.problems[0]}` : 'Map layout saved', { kind: r.problems.length ? 'warn' : 'info', timeout: 6000 });
      if (view) view.setMarks(marks);
      drawEditPanel(); drawList();
    } catch (e) { toast(e.message, { kind: 'warn' }); }
  }
  function drawEditPanel(selMark) {
    if (!editing) return;
    const mk = selMark || (view && marks.find((x) => x.id === view.selectedMark));
    const toolBtn = (id, label, title) => h('button', { class: 'btn small' + (editTool === id ? ' primary' : ''), 'aria-pressed': String(editTool === id), title, onclick: () => { editTool = id; view.setTool(id); drawEditPanel(); } }, label);
    const onMapIds = new Set(marks.map((x) => x.location_id).filter(Boolean));
    const unmapped = regionLocs.filter((l) => !onMapIds.has(l.id));
    const unmatched = marks.filter((x) => x.unmatched || (x.location_id && !locName[x.location_id]));
    mount(editPanel,
      h('div', { class: 'row tight wrap' }, toolBtn('select', 'Select / move', 'Click a mark to select it, drag to move it'),
        toolBtn('point', '+ Marker', 'Click on the map to place a marker'), toolBtn('rect', '+ Rectangle', 'Drag on the map to draw an area'),
        toolBtn('poly', '+ Polygon', 'Click corners, then double-click or press Enter to finish'),
        h('span', { class: 'grow' }),
        h('button', { class: 'icon-btn', 'aria-label': 'Undo', title: 'Undo (Ctrl+Z)', disabled: !undo.length || null, onclick: doUndo }, icon('undo')),
        h('button', { class: 'icon-btn', 'aria-label': 'Redo', title: 'Redo (Ctrl+Y)', disabled: !redo.length || null, onclick: doRedo }, h('span', { style: { display: 'inline-block', transform: 'scaleX(-1)' } }, icon('undo'))),
        h('button', { class: 'btn small primary', onclick: saveLayout }, 'Save'),
        h('button', { class: 'btn small ghost', onclick: async () => { if (await confirmDialog('Discard unsaved edits?', 'Go back to your last saved layout.', 'Discard', true)) { marks = lay.layout.marks.map((m) => ({ ...m })); await api('DELETE', `/api/maps/${region}/draft`); undo = []; redo = []; afterEdit(); } } }, 'Discard'),
        h('button', { class: 'btn small ghost', onclick: () => downloadJson(`pokemmo-companion-map-${region}.json`, { version: 1, region, exported_at: new Date().toISOString(), note: 'Your own map marks (normalised 0..1 image coordinates). Contains no artwork.', marks }) }, icon('download'), 'Export'),
        h('button', { class: 'btn small ghost', onclick: importLayout }, icon('upload'), 'Import')),
      mk ? h('div', { class: 'loc-mark-edit row tight wrap' }, h('strong', { class: 'small' }, mk.location_id ? (locName[mk.location_id] || '(unknown location)') : mk.label || 'Transition'),
        h('span', { class: 'tiny muted' }, `${mk.kind} · ${(TAGS.find((x) => x[0] === mk.tag) || ['', mk.tag])[1]}`),
        h('button', { class: 'btn small', onclick: async () => { const fields = await markDialog({ shape: mk, region, regionLocs, maps: inst.maps, mapId, edit: true }); if (fields) { pushUndo(); Object.assign(mk, fields); afterEdit(); } } }, 'Edit details'),
        h('button', { class: 'btn small ghost', onclick: () => { pushUndo(); marks = marks.filter((x) => x.id !== mk.id); view.selectMark(null); afterEdit(); } }, icon('trash'), 'Remove')) :
        h('div', { class: 'tiny muted' }, 'Select a mark to edit or remove it. Marks are saved privately, separate from the artwork, and survive re-importing it.'),
      h('details', { class: 'small' }, h('summary', null, `Not on the map yet (${unmapped.length} of ${regionLocs.length})`),
        h('div', { class: 'loc-unmapped' }, unmapped.map((l) => h('button', { class: 'chip btnlike', title: 'Choose “+ Marker”, then click this place on the map', onclick: () => { editTool = 'point'; view.setTool('point'); pendingLoc = l.id; drawEditPanel(); toast(`Click on the map where “${l.name}” is.`); } }, l.name)))),
      unmatched.length ? h('div', { class: 'small warn-text' }, `${unmatched.length} mark(s) point to locations that are not in your installed data: `, unmatched.map((x) => x.label || x.location_id).join(', ')) : null);
  }
  let pendingLoc = null;
  function doUndo() { if (!undo.length) return; redo.push(JSON.stringify(marks)); marks = JSON.parse(undo.pop()); afterEdit(); }
  function doRedo() { if (!redo.length) return; undo.push(JSON.stringify(marks)); marks = JSON.parse(redo.pop()); afterEdit(); }
  async function importLayout() {
    const payload = await pickJsonFile(); if (!payload) return;
    try {
      const r = await post(`/api/maps/${region}/layout/check`, payload);
      const known = new Set(inst.maps.map((x) => x.id));
      const other = r.layout.marks.filter((x) => !known.has(x.map)).length;
      if (!(await confirmDialog('Import map marks?', `${r.layout.marks.length} valid mark(s) for ${cap(region)}` + (r.problems.length ? `, ${r.problems.length} skipped (${r.problems[0]})` : '') +
        (other ? `. ${other} belong to sub-maps you have not imported (kept).` : '') + '. This replaces your current unsaved marks (you can undo).', 'Import'))) return;
      pushUndo(); marks = r.layout.marks; afterEdit();
    } catch (e) { toast(e.message, { kind: 'warn' }); }
  }
  const keyHandler = (e) => {
    if (!editing || e.target.matches('input, textarea, select')) return;
    if (e.ctrlKey && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) { e.preventDefault(); doUndo(); }
    else if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) { e.preventDefault(); doRedo(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && view && view.selectedMark) { e.preventDefault(); pushUndo(); marks = marks.filter((x) => x.id !== view.selectedMark); view.selectMark(null); afterEdit(); }
  };
  document.addEventListener('keydown', keyHandler);
  unsub.push(() => document.removeEventListener('keydown', keyHandler));

  // ---------------- layout
  const left = h('div', { class: 'loc-left' }, filters);
  wrap.append(tabsEl, h('div', { class: 'loc-grid' }, variant === 'compact' ? null : left, variant === 'compact' ? null : mapPane, side));
  if (variant === 'compact') wrap.querySelector('.loc-grid').prepend(h('div', { class: 'loc-filters compact' }, h('div', { class: 'search' }, icon('search'), searchIn)));
  await drawTabs();
  drawPokeCard();
  drawList();
  if (variant !== 'compact') drawMapPane();
  if (sel && regionLocs.some((l) => l.id === sel)) await selectLoc(sel); else { sel = null; drawSide(); }
  unsub.push(on('maps', async (d) => { if (d && d.region === region && d.state !== 'layout') { await loadMaps(true); explorer(host, { region, sel, variant, nav }); } }));
  // expose the pending location to the picker
  markDialog.pending = () => { const p = pendingLoc; pendingLoc = null; return p; };
}

// ===================================================================== unavailable / import
function unavailable(region, st, openImport) {
  const pend = st.pending;
  return h('div', { class: 'map-unavailable' },
    h('div', { class: 'map-unavailable-art', 'aria-hidden': 'true' }, icon('map')),
    h('h3', null, `No ${cap(region)} map artwork yet`),
    region === 'unova' ? h('p', { class: 'small muted' }, 'Black/White files are recognised, but the Unova Town Map artwork has not been located inside them yet, so it cannot be extracted. ',
      'Every Unova location and encounter is still listed here.') :
      h('p', { class: 'small muted' }, 'The Companion ships no map images. If you own ', { kanto: 'FireRed (or LeafGreen)', johto: 'HeartGold or SoulSilver', hoenn: 'Emerald', sinnoh: 'Platinum' }[region],
        ', you can extract the original Town Map artwork from your own ROM file — read-only, on this computer, never uploaded.'),
    pend ? notice('info', `New ${cap(region)} artwork from ${pend.rom_file} is waiting for your review.`) : null,
    h('button', { class: 'btn primary small', onclick: openImport }, icon('download'), pend ? 'Review import' : 'Import from my ROM…'),
    h('p', { class: 'tiny muted' }, 'The encounter list and filters on the right work without a map.'));
}

export async function importDialog(onDone) {
  const st = await loadMaps(true);
  const pathIn = h('input', { class: 'input', placeholder: '/home/you/Desktop/Roms  or  …/Pokemon - FireRed Version (USA, Europe) (Rev 1).gba', 'aria-label': 'ROM file or folder' });
  const out = h('div', { class: 'stack tight' });
  const status = h('div');
  const browse = SHELL === 'qt' ? h('button', { class: 'btn', onclick: async () => {
    const off = on('shell.file', (d) => { if (d.purpose === 'rom' && d.path) pathIn.value = d.path; off(); });
    await post('/api/shell/command', { action: 'pick_file', purpose: 'rom' }); } }, 'Browse…') : null;
  const drawStatus = async () => {
    const s = await loadMaps(true);
    mount(status, h('table', { class: 'table compact' }, h('thead', null, h('tr', null, ['Region', 'Installed artwork', 'Waiting for review', ''].map((c) => h('th', null, c)))),
      h('tbody', null, REGIONS.map((r) => { const x = s.regions[r];
        return h('tr', { dataset: { region: r } }, h('td', null, cap(r)),
          h('td', { class: 'small' }, x.installed ? [`${x.installed.game} (${x.installed.game_code}) · ${x.installed.maps.length} map(s) · ${fmtDate(x.installed.extracted_at)}`, x.installed.verified ? ' · verified' : ' · unverified build'] : r === 'unova' ? 'Not available (artwork not located in Black/White)' : '—'),
          h('td', { class: 'small' }, x.pending ? h('div', { class: 'stack tight' }, h('div', { class: 'row tight wrap' }, x.pending.maps.map((m) => h('figure', { class: 'map-thumb' }, h('img', { class: 'pixel', src: m.url, alt: m.label, width: Math.min(m.w, 200) }), h('figcaption', { class: 'tiny' }, `${m.label} · ${m.w}×${m.h}`)))),
            h('div', { class: 'tiny muted' }, `${x.pending.game} (${x.pending.game_code}, rev ${x.pending.revision}) · ${x.pending.verified ? 'decoded data matches the verified build' : 'UNVERIFIED build: check the preview carefully'}`)) : '—'),
          h('td', null, x.pending ? h('div', { class: 'row tight' },
            h('button', { class: 'btn small primary', onclick: async () => { await post(`/api/maps/${r}/accept`); cache.layout = {}; toast(`${cap(r)} map installed. Your marks were kept.`); drawStatus(); onDone && onDone(); } }, 'Accept'),
            h('button', { class: 'btn small ghost', onclick: async () => { await post(`/api/maps/${r}/reject`); drawStatus(); } }, 'Reject')) :
            x.installed ? h('button', { class: 'btn small ghost', onclick: async () => { if (await confirmDialog(`Remove ${cap(r)} artwork?`, 'Only the extracted images are removed. Your map marks are kept and come back when you import again.', 'Remove', true)) { await api('DELETE', `/api/maps/${r}`); drawStatus(); onDone && onDone(); } } }, 'Remove') : null));
      }))));
  };
  const extract = async (file) => {
    const row = h('div', { class: 'row tight small' }, h('span', { class: 'dot connecting' }), `Extracting from ${file.file}…`);
    out.prepend(row);
    try {
      const { job } = await post('/api/maps/import', { path: file.path });
      const poll = async () => {
        const j = await get('/api/maps/jobs/' + job.id);
        if (j.state === 'running') { setTimeout(poll, 300); return; }
        mount(row, j.state === 'done' ? notice('info', `${cap(j.region)}: artwork extracted — review it below, then Accept or Reject. Your current map is unchanged until you accept.`) : notice('bad', j.error));
        drawStatus();
      };
      poll();
    } catch (e) { mount(row, notice('bad', e.message)); }
  };
  const check = async () => {
    if (!pathIn.value.trim()) { toast('Type or choose a ROM file or folder first', { kind: 'warn' }); return; }
    try {
      const r = await post('/api/maps/identify', { path: pathIn.value.trim() });
      mount(out, r.files.length ? r.files.map((x) => h('div', { class: 'list-row', style: { cursor: 'default' }, dataset: { file: x.file } },
        h('div', { class: 'grow' }, h('div', { class: 'small' }, x.game ? `${x.game} — ${cap(x.region)}` : x.file),
          h('div', { class: 'tiny muted' }, x.file, x.game_code ? ` · ${x.game_code} · header version ${x.revision} · ${(x.size / 1048576).toFixed(0)} MB` : ''),
          (x.problems || []).length ? h('div', { class: 'tiny warn-text' }, x.problems.join(' ')) : null,
          x.note ? h('div', { class: 'tiny muted' }, x.note) : null,
          x.verified_with ? h('div', { class: 'tiny muted' }, 'Recipe verified with: ' + x.verified_with) : null),
        x.can_extract ? h('button', { class: 'btn small primary', onclick: () => extract(x) }, 'Extract') : h('span', { class: 'tiny muted' }, x.supported ? 'Nothing to extract' : 'Not supported'))) :
        h('div', { class: 'small muted' }, 'No .gba or .nds files found there (unzip archives first).'));
    } catch (e) { mount(out, notice('bad', e.message)); }
  };
  pathIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
  await drawStatus();
  void st;
  return modal({ title: 'Region maps from your own game files', wide: true, body: h('div', { class: 'stack' },
    notice('info', h('strong', null, 'Read-only and private. '), 'Your ROM is opened read-only and never copied, changed or uploaded. Only the original Town Map / Pokégear artwork is decoded and saved as PNG in the Companion’s private data folder. The Companion ships no map images.'),
    h('div', { class: 'row tight' }, pathIn, browse, h('button', { class: 'btn', onclick: check }, 'Check')),
    h('div', { class: 'tiny muted' }, 'Supported: FireRed/LeafGreen → Kanto + Sevii Islands · HeartGold/SoulSilver → Johto · Emerald → Hoenn · Platinum → Sinnoh. Black/White are recognised, but their Unova map artwork has not been located yet.'),
    out, h('h3', null, 'Status per region'), status),
  actions: [{ label: t('common.close'), value: true, kind: 'ghost' }] });
}

// ===================================================================== mark details dialog
export async function markDialog({ shape, region, regionLocs, maps, mapId, edit = false }) {
  const pre = !edit && markDialog.pending ? markDialog.pending() : null;
  const tagSel = h('select', { class: 'input', 'aria-label': 'Kind of place' }, TAGS.map(([v, l]) => h('option', { value: v, selected: (shape.tag || 'route') === v ? 'selected' : null }, l)));
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search your installed locations', 'aria-label': 'Search locations' });
  const locSel = h('select', { class: 'input', size: '8', 'aria-label': 'Location' });
  const fill = () => { const q = search.value.trim().toLowerCase();
    mount(locSel, regionLocs.filter((l) => !q || l.name.toLowerCase().includes(q)).map((l) => h('option', { value: l.id, selected: (shape.location_id || pre) === l.id ? 'selected' : null }, l.name))); };
  search.addEventListener('input', fill); fill();
  if (pre) { const l = regionLocs.find((x) => x.id === pre); if (l) search.value = l.name; fill(); locSel.value = pre; }
  const target = h('select', { class: 'input', 'aria-label': 'Leads to sub-map' }, h('option', { value: '' }, '—'), maps.filter((m) => m.id !== mapId).map((m) => h('option', { value: m.id, selected: shape.target_map === m.id ? 'selected' : null }, m.label)));
  const label = h('input', { class: 'input', value: shape.label || '', placeholder: 'Optional label (shown instead of the location name)', maxlength: '80', 'aria-label': 'Label' });
  const note = h('textarea', { class: 'input', rows: '2', placeholder: 'Optional note', maxlength: '500', 'aria-label': 'Note' }, shape.note || '');
  const err = h('div', { class: 'small warn-text' });
  const ok = await modal({ title: edit ? 'Edit mark' : 'What is here?', body: h('div', { class: 'stack tight' },
    h('div', { class: 'tiny muted' }, 'Choose a real location from your installed data — nothing is guessed. For a door/exit to another sub-map choose “Transition”.'),
    h('label', { class: 'field' }, h('span', { class: 'label' }, 'Kind'), tagSel),
    h('label', { class: 'field' }, h('span', { class: 'label' }, 'Location'), search, locSel),
    maps.length > 1 ? h('label', { class: 'field' }, h('span', { class: 'label' }, 'Leads to sub-map (transitions)'), target) : null,
    h('label', { class: 'field' }, h('span', { class: 'label' }, 'Label'), label),
    h('label', { class: 'field' }, h('span', { class: 'label' }, 'Note'), note), err),
  actions: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: edit ? 'Apply' : 'Add', value: true, kind: 'primary' }] });
  if (!ok) return null;
  const tag = tagSel.value;
  const loc = locSel.value || null;
  const tgt = target.value || null;
  if (!loc && !(tag === 'transition' && tgt)) { toast('Choose a location (or a target sub-map for a transition).', { kind: 'warn' }); return null; }
  return { tag, location_id: loc, target_map: tgt, label: label.value.trim(), note: note.value.trim() };
}

// ===================================================================== location detail
function rate(r) { return h('td', { class: 'rate ' + (r && r.kind || ''), title: r && r.raw || '' }, r ? r.label : '—'); }

export async function renderLocation(pane, id, { back, popout, nav, onMap } = {}) {
  let d;
  try { d = await get('/api/locations/' + encodeURIComponent(id)); } catch (e) { mount(pane, h('div', { class: 'detail-body' }, notice('bad', 'Location not found in your installed data.'))); return; }
  const go_ = nav || (popout ? openRoute : go);
  const species = await loadSpecies().catch(() => ({}));
  let all = false;
  const body = h('div', { class: 'detail-body stack' });
  const draw = () => {
    const flt = { ...f };
    const rows = d.rows.filter((r) => all || !filtersActive() || rowPasses([id, r.species_id, r.method, r.horde5 ? 5 : r.horde3 ? 3 : 0, r.season || '',
      (r.morning ? 1 : 0) | (r.day ? 2 : 0) | (r.night ? 4 : 0)], species, flt));
    const bySpecies = {};
    for (const r of rows) (bySpecies[r.species_id] ||= []).push(r);
    mount(body,
      filtersActive() ? h('div', { class: 'row tight small' }, h('span', { class: 'muted' }, `${rows.length} of ${d.rows.length} rows match your filters`),
        h('button', { class: 'btn small ghost', onclick: () => { all = !all; draw(); } }, all ? 'Only matching' : 'Show all')) : null,
      h('div', { class: 'table-scroll' }, h('table', { class: 'table compact loc-enc' }, h('thead', null, h('tr', null, ['', 'Pokémon', 'Type', 'Encounter', 'Levels', 'Horde', 'Season', 'Morning', 'Day', 'Night'].map((c) => h('th', null, c)))),
        h('tbody', null, Object.values(bySpecies).flatMap((rs) => rs.map((r, i) => {
          const s = species[r.species_id] || { id: r.species_id, name: r.name, types: r.types, icon: r.icon };
          return h('tr', { dataset: { sid: r.species_id } },
            h('td', { class: 'loc-sprite' }, i === 0 ? sizedSprite(s, 40, { still: s.still, url: s.icon || r.icon, tier: s.size || 'm' }) : null),
            h('td', null, i === 0 ? h('a', { href: '#/pokedex/' + r.species_id, onclick: (e) => { e.preventDefault(); go_('#/pokedex/' + r.species_id + '?tab=locations'); } }, r.name) : '', i === 0 ? h('span', { class: 'tiny muted' }, ' #' + pad3(r.species_id)) : null),
            h('td', null, i === 0 ? typeChips(r.types || s.types || [], true) : null),
            h('td', { class: 'small' }, r.method), h('td', { class: 'nowrap' }, r.min === r.max ? r.min : `${r.min}–${r.max}`), h('td', null, r.horde5 ? '×5' : r.horde3 ? '×3' : '—'),
            h('td', { class: 'small' }, r.season || '—'), rate(r.morning), rate(r.day), rate(r.night));
        }))))),
      !rows.length ? h('div', { class: 'empty small' }, 'No rows match the current filters.') : null,
      h('div', { class: 'tiny muted' }, d.provenance, d.dump_date ? ` Dump files dated ${fmtDate(d.dump_date)}.` : '', ' Rarity labels are shown exactly as your data gives them.'),
      d.guides.length ? h('div', { class: 'stack tight' }, h('span', { class: 'label' }, 'Your guides for this location'), d.guides.map((g) => h('button', { class: 'tool-link', onclick: () => go_('#/tools/cguides/' + g.id) }, icon('list'), g.title))) : null,
      linkedNotes('location', d.id, `${d.name} (${cap(d.region)})`));
  };
  mount(pane, h('div', { class: 'detail-head' }, h('div', { class: 'grow' },
    h('div', { class: 'row' }, h('span', { class: 'chip' }, cap(d.region)),
      onMap === 'on' ? h('span', { class: 'chip tiny' }, '◉ on your map') : onMap === 'off' ? h('span', { class: 'chip tiny', title: 'Use Edit map to place it' }, '○ not on the map yet') : null,
      h('span', { class: 'grow' }), back ? h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: back }, icon('close')) : null),
    h('h2', null, d.name), h('div', { class: 'small muted' }, `${new Set(d.rows.map((r) => r.species_id)).size} Pokémon · ${d.rows.length} encounter rows`))), body);
  draw();
  void typeChip;
}

// ===================================================================== popout
export async function renderLocationsPopout(el, mode) {
  const data = await loadLocs();
  if (!data.imported) { mount(el, notice('info', 'Install your PokeMMO data to list locations.')); return; }
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
