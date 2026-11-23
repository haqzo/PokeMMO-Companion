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
const BASIS = 'builtin-v1';
const TIMES = [['morning', 'Morning', 1], ['day', 'Day', 2], ['night', 'Night', 4]];
const TAGS = [['town', 'Town / city'], ['route', 'Route'], ['cave', 'Cave / dungeon'], ['special', 'Special area'], ['transition', 'Transition to another map'], ['other', 'Other']];
const f = { q: '', species: null, type: '', method: '', horde: false, time: '', season: '' };
const show = { markers: true, labels: true, highlights: true };
const cache = { locs: null, species: null, enc: {}, maps: null, layout: {}, builtin: null };
let unsub = [];
let view = null;
export function dispose() { unsub.forEach((u) => u()); unsub = []; if (view) view.destroy(); view = null; }

async function loadLocs() { if (!cache.locs) cache.locs = await get('/api/locations'); return cache.locs; }
async function loadSpecies() {
  if (!cache.species) { const sp = await get('/api/dex/species?run=none'); cache.species = Object.fromEntries(sp.species.map((s) => [s.id, s])); }
  return cache.species;
}
async function loadEnc(region) { if (!cache.enc[region]) cache.enc[region] = (await get('/api/locations-encounters?region=' + region)).rows; return cache.enc[region]; }
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
    h('div', null, h('h1', null, t('loc.title')), h('div', { class: 'sub' }, 'Click a route, town or cave on the map to see its PokeMMO wild encounters — all five regions built in, offline.')),
    h('div', { class: 'actions' }, pinButton({ kind: 'tool', id: 'locations' }), popoutButton('locations'))));
  const host = h('div', { class: 'loc-host' });
  page.append(host);
  await explorer(host, { region, sel, variant: 'page', nav: go });
}

/** The explorer body, shared by the page and the popout. Maps and click targets ship with the app. */
export async function explorer(host, { region, sel, variant = 'page', nav = go }) {
  if (view) { view.destroy(); view = null; }
  const data = await loadLocs();
  const [species, built, enc, lay] = await Promise.all([loadSpecies().catch(() => ({})), loadBuiltin(), loadEnc(region), loadLayout(region)]);
  // In-game Town Map artwork where it exists (Kanto, Sevii, Johto, Hoenn, Sinnoh), otherwise the original Companion map.
  const hasGame = built.maps.some((m) => m.region === region && m.style === 'game');
  const style = hasGame && (setting('locations.style') || 'game') === 'game' ? 'game' : 'companion';
  const maps = built.maps.filter((m) => m.region === region && (m.style === 'game') === (style === 'game'))
    .sort((a, b) => ((a.id === region || a.id === 'game-' + region) ? -1 : (b.id === region || b.id === 'game-' + region) ? 1 : 0));
  const lastMap = (setting('locations.maps') || {})[region];
  let mapId = maps.some((m) => m.id === lastMap) ? lastMap : maps[0].id;
  const builtinMarks = maps.flatMap((m) => m.features.filter((x) => x.kind !== 'list').map((x) => featureMark(x, m.id)));
  const listFeatures = maps.flatMap((m) => m.features.filter((x) => x.kind === 'list'));
  // Marks saved before the built-in maps existed were placed on locally extracted ROM artwork: their coordinates do
  // not fit these maps, so they are kept (never deleted) but not drawn. New marks carry basis "builtin-v1".
  const legacy = (lay.layout.marks || []).filter((m) => m.basis !== BASIS);
  let personal = (lay.layout.marks || []).filter((m) => m.basis === BASIS).map((m) => ({ ...m }));
  const allMarks = () => [...builtinMarks, ...personal];
  let editing = false;
  let selFeature = null;
  const locName = Object.fromEntries(data.locations.map((l) => [l.id, l.name]));
  const regionLocs = data.locations.filter((l) => l.region === region);
  const featureOfLoc = (lid) => builtinMarks.find((m) => m.location_ids.includes(lid)) || null;
  const mapLabel = (id) => (maps.find((m) => m.id === id) || {}).label || id;

  const wrap = h('div', { class: `loc-explorer v-${variant}` });
  mount(host, wrap);

  // ---------------- region tabs (with counts when a Pokémon / filter is active)
  const tabsEl = h('div', { class: 'tabs loc-tabs', role: 'tablist', 'aria-label': 'Region' });
  const drawTabs = async () => {
    const counts = {};
    if (filtersActive()) {
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
  let current = [];
  const highlightSet = () => (!filtersActive() && !f.q.trim() ? null : new Set(current.map((l) => l.id)));
  const countPersonal = () => { provCount.textContent = personal.length ? ` · ${personal.filter((x) => x.map === mapId).length} of your own marks on this map` : ''; };

  function drawMapPane() {
    if (view) { view.destroy(); view = null; }
    const m = maps.find((x) => x.id === mapId) || maps[0];
    mapId = m.id;
    view = createMapView({
      image: { url: m.url, w: m.w, h: m.h }, alt: `${m.label} map`, marks: allMarks(), mapId, show, highlight: highlightSet(),
      selectedLoc: selFeature, labelFor: (mk) => mk.label || (mk.location_id ? locName[mk.location_id] || '(unknown location)' : ''),
      onSelect: (mk) => { if (mk.builtin) selectFeature(mk); else if (mk.location_id) selectLoc(mk.location_id); },
      onTransition: (mk) => switchMap(mk.target_map),
      onCreate: (shape) => markDialog({ shape, region, regionLocs, maps, mapId }),
      onEditSelect: (mk) => drawEditPanel(mk),
      onChange: (next) => { pushUndo(); personal = next.filter((x) => !x.builtin); afterEdit(); },
    });
    const sub = maps.length > 1 ? h('div', { class: 'loc-submaps', role: 'tablist', 'aria-label': 'Maps' }, maps.map((x) => h('button', {
      class: 'chip btnlike' + (x.id === mapId ? ' active' : ''), role: 'tab', 'aria-selected': String(x.id === mapId), dataset: { map: x.id }, onclick: () => switchMap(x.id) }, x.label))) : null;
    const tgl = (key, label) => h('button', { class: 'chip btnlike' + (show[key] ? ' active' : ''), 'aria-pressed': String(show[key]), onclick: (e) => {
      show[key] = !show[key]; e.currentTarget.classList.toggle('active', show[key]); e.currentTarget.setAttribute('aria-pressed', String(show[key])); view.setShow({ [key]: show[key] }); } }, label);
    const fsBtn = h('button', { class: 'icon-btn', 'aria-label': 'Full screen', title: 'Full screen', onclick: () => {
      if (document.fullscreenElement) document.exitFullscreen(); else mapPane.requestFullscreen && mapPane.requestFullscreen().catch(() => mapPane.classList.toggle('pseudo-fs')); } }, icon('expand'));
    const tools = h('div', { class: 'map-tools' },
      h('button', { class: 'icon-btn', 'aria-label': 'Zoom in', title: 'Zoom in (+)', onclick: () => view.zoomBy(1.25) }, icon('plus')),
      h('button', { class: 'icon-btn', 'aria-label': 'Zoom out', title: 'Zoom out (−)', onclick: () => view.zoomBy(0.8) }, icon('minus')),
      h('button', { class: 'icon-btn', 'aria-label': 'Fit map', title: 'Fit (0)', onclick: () => view.fit() }, icon('fit')),
      fsBtn, h('span', { class: 'grow' }),
      variant === 'compact' ? null : [tgl('markers', 'Areas'), tgl('labels', 'Labels'), tgl('highlights', 'Highlights')],
      hasGame && variant !== 'compact' ? h('button', { class: 'chip btnlike', title: 'Switch between the in-game map and the original Companion map', onclick: async () => {
        await saveSettings({ 'locations.style': style === 'game' ? 'companion' : 'game' }); explorer(host, { region, sel: null, variant, nav }); } },
      style === 'game' ? 'In-game map' : 'Companion map') : null,
      variant === 'page' || variant === 'expanded' ? h('button', { class: 'btn small ghost' + (editing ? ' primary' : ''), 'aria-pressed': String(editing), title: 'Optional: add your own marks on top of the built-in map', onclick: () => toggleEdit() }, icon('note'), editing ? 'Done' : 'My marks') : null);
    const prov = h('div', { class: 'tiny muted loc-prov' }, `${m.label} · ${m.style === 'game' ? `in-game map artwork (${m.source})` : 'original Companion map'} · encounters: built-in PokeMMO data${data.dump_date ? ` (client data ${fmtDate(data.dump_date)})` : ''}`, provCount);
    countPersonal();
    mount(mapPane, sub, tools, view.el, prov, editing ? editPanel : null);
    if (editing) { view.setEditable(true); view.setTool(editTool); drawEditPanel(); }
    const sm = selFeature && allMarks().find((x) => x.id === selFeature);
    if (sm && sm.map === mapId) setTimeout(() => view && view.centerOn(sm), 80);
  }
  function switchMap(id) { if (!id || id === mapId) return; mapId = id; saveSettings({ 'locations.maps': { ...(setting('locations.maps') || {}), [region]: id } }).catch(() => {}); drawMapPane(); }

  // ---------------- list + detail
  function drawList() {
    current = matchingLocations(region, data.locations, enc, species);
    count.textContent = `${current.length} of ${regionLocs.length} ${cap(region)} locations · ${regionLocs.filter((l) => featureOfLoc(l.id)).length} on the map`;
    mount(listEl, current.length ? current.map((l) => {
      const ft = featureOfLoc(l.id);
      return h('button', { class: 'loc-row', role: 'listitem', dataset: { loc: l.id }, onclick: () => selectLoc(l.id) },
        h('span', { class: 'grow' }, l.name, l.notes ? h('span', { class: 'tiny muted' }, ` · 📝 ${l.notes}`) : null),
        h('span', { class: 'tiny muted', title: ft ? `On the map: ${ft.label} (${mapLabel(ft.map)})` : 'Not a single place on the map' }, ft ? (ft.map !== maps[0].id ? mapLabel(ft.map) : '◉') : '·'),
        h('span', { class: 'tiny muted' }, `${l.species_count} Pokémon · ${l.methods.join(', ')}${l.horde ? ' · hordes' : ''}`));
    }) : h('div', { class: 'empty' }, 'No locations match these filters.'));
  }
  function selectLoc(id) {
    const ft = featureOfLoc(id);
    if (ft) return selectFeature(ft, id);
    const lf = listFeatures.find((x) => x.location_ids.includes(id));
    return showPanel({ label: lf ? lf.name : locName[id] || id, tag: 'list', location_ids: [id], map: null }, id);
  }
  function selectFeature(mk, focusLoc) {
    selFeature = mk.id;
    if (mk.map && mk.map !== mapId) switchMap(mk.map);
    if (view) { view.setSelectedLoc(mk.id); view.centerOn(mk); }
    showPanel(mk, focusLoc);
  }
  async function showPanel(mk, focusLoc) {
    wrap.classList.add('has-sel');
    const ids = mk.location_ids || [];
    const first = focusLoc && ids.includes(focusLoc) ? focusLoc : ids[0];
    if (variant === 'page') history.replaceState(null, '', '#/tools/locations/' + encodeURIComponent(first || 'place:' + (mk.feature || mk.id)) + (first ? '' : `?region=${region}`));
    for (const b of listEl.querySelectorAll('.loc-row')) b.classList.toggle('selected', ids.includes(b.dataset.loc));
    const close = () => { selFeature = null; wrap.classList.remove('has-sel'); if (view) view.setSelectedLoc(null); drawSide(); if (variant === 'page') history.replaceState(null, '', '#/tools/locations'); };
    const pane = h('div', { class: 'loc-detail', dataset: { feature: mk.feature || '' } });
    const KIND = { town: 'Town / city', route: 'Route', sea: 'Water route', cave: 'Cave / dungeon', landmark: 'Building / landmark', area: 'Area', list: 'Not one place on the map' };
    const head = h('div', { class: 'detail-head' }, h('div', { class: 'grow' },
      h('div', { class: 'row' }, h('span', { class: 'chip' }, cap(region)), h('span', { class: 'chip tiny' }, KIND[mk.tag] || 'Place'),
        mk.map && mk.map !== maps[0].id ? h('span', { class: 'chip tiny' }, mapLabel(mk.map)) : null, h('span', { class: 'grow' }),
        h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: close }, icon('close'))),
      h('h2', null, mk.label)));
    const body = h('div');
    mount(side, pane);
    pane.append(head);
    if (!ids.length) {
      pane.append(h('div', { class: 'detail-body' }, notice('info', `No wild Pokémon are listed for ${mk.label} in the built-in PokeMMO data. `,
        'Towns without water or grass have no wild encounters; nothing is guessed here.')));
      return;
    }
    if (ids.length > 1) {
      const hits = highlightSet();
      pane.append(h('div', { class: 'tabs loc-subareas', role: 'tablist', 'aria-label': 'Sub-areas' }, ids.map((id) => h('button', {
        class: 'tab' + (id === first ? ' active' : ''), role: 'tab', 'aria-selected': String(id === first), dataset: { loc: id },
        onclick: (e) => { for (const b of pane.querySelectorAll('.loc-subareas .tab')) { b.classList.toggle('active', b === e.currentTarget); b.setAttribute('aria-selected', String(b === e.currentTarget)); }
          renderLocation(body, id, { popout: variant !== 'page', nav, embedded: true }); } },
      subName(locName[id] || id, mk.label), hits && hits.has(id) ? h('span', { class: 'count' }, '●') : null))));
    }
    pane.append(body);
    await renderLocation(body, first, { popout: variant !== 'page', nav, embedded: true });
  }
  function drawSide() {
    mount(side, h('div', { class: 'loc-listwrap' }, count, listEl,
      listFeatures.length ? h('div', { class: 'tiny muted', style: { padding: '6px 8px' } }, 'Not one place on the map: ',
        listFeatures.map((x) => h('button', { class: 'chip btnlike', onclick: () => showPanel({ label: x.name, tag: 'list', location_ids: x.location_ids }) }, x.name))) : null));
  }

  function refresh() {
    drawPokeCard();
    drawList();
    if (view) view.setHighlight(highlightSet());
    drawTabs();
    if (!wrap.classList.contains('has-sel')) drawSide();
  }

  // ---------------- personal marks (optional overlay; the built-in map is never changed)
  let editTool = 'select';
  let undo = [], redo = [];
  const saveDraft = debounce(() => api('PUT', `/api/maps/${region}/draft`, { marks: personal }).catch(() => {}), 600);
  function pushUndo() { undo.push(JSON.stringify(personal)); if (undo.length > 200) undo.shift(); redo = []; }
  function afterEdit() { if (view) view.setMarks(allMarks()); countPersonal(); saveDraft(); drawEditPanel(); }
  async function toggleEdit() {
    if (!editing) {
      const draft = lay.draft;
      if (draft && Array.isArray(draft.marks) && JSON.stringify(draft.marks) !== JSON.stringify(lay.layout.marks)) {
        if (await confirmDialog('Restore unfinished edits?', `You have unsaved marks from ${relTime(draft.saved_at)}. Restore them? (Cancel starts from your saved marks.)`, 'Restore')) personal = draft.marks.map((m) => ({ ...m }));
      }
      editing = true; undo = []; redo = [];
    } else {
      if (JSON.stringify(personal) !== JSON.stringify(lay.layout.marks)) {
        const save = await confirmDialog('Save your marks?', 'Save keeps them. Cancel keeps them as unfinished work you can restore next time.', 'Save');
        if (save) await saveLayout(); else saveDraft();
      }
      editing = false;
    }
    drawMapPane();
  }
  async function saveLayout() {
    try {
      const r = await api('PUT', `/api/maps/${region}/layout`, { version: 1, region, marks: [...personal.map((m) => ({ ...m, basis: BASIS })), ...legacy] });
      lay.layout = r.layout; lay.draft = null; personal = r.layout.marks.filter((m) => m.basis === BASIS).map((m) => ({ ...m })); cache.layout[region] = lay;
      toast(r.problems.length ? `Saved with ${r.problems.length} correction(s): ${r.problems[0]}` : 'Your marks were saved', { kind: r.problems.length ? 'warn' : 'info', timeout: 6000 });
      if (view) view.setMarks(allMarks());
      drawEditPanel();
    } catch (e) { toast(e.message, { kind: 'warn' }); }
  }
  function drawEditPanel(selMark) {
    if (!editing) return;
    const mk = selMark && !selMark.builtin ? selMark : (view && personal.find((x) => x.id === view.selectedMark));
    const toolBtn = (id, label, title) => h('button', { class: 'btn small' + (editTool === id ? ' primary' : ''), 'aria-pressed': String(editTool === id), title, onclick: () => { editTool = id; view.setTool(id); drawEditPanel(); } }, label);
    const unmatched = personal.filter((x) => x.unmatched || (x.location_id && !locName[x.location_id]));
    mount(editPanel,
      h('div', { class: 'tiny muted' }, 'Optional. The built-in map and its areas are never changed; your marks are drawn on top (purple) and kept separately.'),
      h('div', { class: 'row tight wrap' }, toolBtn('select', 'Select / move', 'Click one of your marks to select it, drag to move it'),
        toolBtn('point', '+ Marker', 'Click on the map to place a marker'), toolBtn('rect', '+ Rectangle', 'Drag on the map to draw an area'),
        toolBtn('poly', '+ Polygon', 'Click corners, then double-click or press Enter to finish'),
        h('span', { class: 'grow' }),
        h('button', { class: 'icon-btn', 'aria-label': 'Undo', title: 'Undo (Ctrl+Z)', disabled: !undo.length || null, onclick: doUndo }, icon('undo')),
        h('button', { class: 'icon-btn', 'aria-label': 'Redo', title: 'Redo (Ctrl+Y)', disabled: !redo.length || null, onclick: doRedo }, h('span', { style: { display: 'inline-block', transform: 'scaleX(-1)' } }, icon('undo'))),
        h('button', { class: 'btn small primary', onclick: saveLayout }, 'Save'),
        h('button', { class: 'btn small ghost', onclick: async () => { if (await confirmDialog('Discard unsaved edits?', 'Go back to your last saved marks.', 'Discard', true)) { personal = lay.layout.marks.map((m) => ({ ...m })); await api('DELETE', `/api/maps/${region}/draft`); undo = []; redo = []; afterEdit(); } } }, 'Discard'),
        h('button', { class: 'btn small ghost', onclick: () => downloadJson(`pokemmo-companion-marks-${region}.json`, { version: 1, region, exported_at: new Date().toISOString(), note: 'Your own map marks (normalised 0..1 coordinates on the Companion maps). Contains no artwork.', marks: [...personal.map((m) => ({ ...m, basis: BASIS })), ...legacy] }) }, icon('download'), 'Export'),
        h('button', { class: 'btn small ghost', onclick: importLayout }, icon('upload'), 'Import'),
        h('button', { class: 'btn small ghost', title: 'Remove all of your own marks for this region and show only the shipped map data', onclick: async () => {
          if (!(await confirmDialog('Reset to shipped map data?', `Removes your ${personal.length} own mark(s) for ${cap(region)} (export them first if you want to keep a copy). The built-in map is unaffected.`, 'Reset', true))) return;
          pushUndo(); personal = []; await saveLayout(); afterEdit(); } }, 'Reset to shipped map data')),
      mk ? h('div', { class: 'loc-mark-edit row tight wrap' }, h('strong', { class: 'small' }, mk.location_id ? (locName[mk.location_id] || '(unknown location)') : mk.label || 'Transition'),
        h('span', { class: 'tiny muted' }, `${mk.kind} · ${(TAGS.find((x) => x[0] === mk.tag) || ['', mk.tag])[1]}`),
        h('button', { class: 'btn small', onclick: async () => { const fields = await markDialog({ shape: mk, region, regionLocs, maps, mapId, edit: true }); if (fields) { pushUndo(); Object.assign(mk, fields); afterEdit(); } } }, 'Edit details'),
        h('button', { class: 'btn small ghost', onclick: () => { pushUndo(); personal = personal.filter((x) => x.id !== mk.id); view.selectMark(null); afterEdit(); } }, icon('trash'), 'Remove')) :
        h('div', { class: 'tiny muted' }, personal.length ? 'Select one of your marks to edit or remove it.' : 'You have no own marks in this region.'),
      legacy.length ? h('div', { class: 'small muted' }, `${legacy.length} older mark(s) made on extracted ROM artwork are kept in your data but not shown, because their positions do not fit these maps.`) : null,
      unmatched.length ? h('div', { class: 'small warn-text' }, `${unmatched.length} of your marks point to locations that are not in the data: `, unmatched.map((x) => x.label || x.location_id).join(', ')) : null);
  }
  function doUndo() { if (!undo.length) return; redo.push(JSON.stringify(personal)); personal = JSON.parse(undo.pop()); afterEdit(); }
  function doRedo() { if (!redo.length) return; undo.push(JSON.stringify(personal)); personal = JSON.parse(redo.pop()); afterEdit(); }
  async function importLayout() {
    const payload = await pickJsonFile(); if (!payload) return;
    try {
      const r = await post(`/api/maps/${region}/layout/check`, payload);
      if (!(await confirmDialog('Import your marks?', `${r.layout.marks.length} valid mark(s) for ${cap(region)}` + (r.problems.length ? `, ${r.problems.length} skipped (${r.problems[0]})` : '') +
        '. This replaces your current unsaved marks (you can undo).', 'Import'))) return;
      pushUndo(); personal = r.layout.marks.map((m) => ({ ...m, basis: BASIS })); afterEdit();
    } catch (e) { toast(e.message, { kind: 'warn' }); }
  }
  const keyHandler = (e) => {
    if (!editing || e.target.matches('input, textarea, select')) return;
    if (e.ctrlKey && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) { e.preventDefault(); doUndo(); }
    else if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) { e.preventDefault(); doRedo(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && view && view.selectedMark && personal.some((x) => x.id === view.selectedMark)) { e.preventDefault(); pushUndo(); personal = personal.filter((x) => x.id !== view.selectedMark); view.selectMark(null); afterEdit(); }
  };
  document.addEventListener('keydown', keyHandler);
  unsub.push(() => document.removeEventListener('keydown', keyHandler));

  // ---------------- layout
  const left = h('div', { class: 'loc-left' }, filters);
  wrap.append(tabsEl, h('div', { class: 'loc-grid' }, variant === 'compact' ? null : left, mapPane, side));
  if (variant === 'compact') wrap.querySelector('.loc-grid').prepend(h('div', { class: 'loc-filters compact' }, h('div', { class: 'search' }, icon('search'), searchIn)));
  await drawTabs();
  drawPokeCard();
  drawList();
  drawMapPane();
  if (sel && sel.startsWith('place:')) { const mk = builtinMarks.find((x) => x.feature === sel.slice(6)); if (mk) selectFeature(mk); else drawSide(); }
  else if (sel && regionLocs.some((l) => l.id === sel)) selectLoc(sel);
  else drawSide();
}

/** A built-in map feature as a map-view mark. */
export function featureMark(x, mapId) {
  const base = { id: 'b:' + x.id, feature: x.id, map: mapId, tag: x.kind, label: x.name, location_ids: x.location_ids, builtin: true };
  if (x.kind === 'route' || x.kind === 'sea') return { ...base, kind: 'line', lines: x.lines, width: x.width };
  if (x.kind === 'town') return { ...base, kind: 'rect', x: x.x, y: x.y, w: x.w, h: x.h };
  return { ...base, kind: 'point', x: x.x, y: x.y };
}
/** "Mt. Moon (B1F)" under the feature "Mt. Moon" → "B1F". */
function subName(name, featureName) {
  if (name.startsWith(featureName + ' (')) return name.slice(featureName.length + 2, -1);
  return name;
}
async function loadBuiltin() { if (!cache.builtin) cache.builtin = await get('/api/maps/builtin'); return cache.builtin; }

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
      d.guides.length ? h('div', { class: 'stack tight' }, h('span', { class: 'label' }, 'Your guides for this location'), d.guides.map((g) => h('button', { class: 'tool-link', onclick: () => go_('#/tools/cguides/' + g.id) }, icon('list'), g.title))) : null,
      linkedNotes('location', d.id, `${d.name} (${cap(d.region)})`));
  };
  if (embedded) {
    mount(pane, h('div', { class: 'loc-sub-head small muted' }, h('strong', { class: 'loc-sub-name' }, d.name), ` · ${new Set(d.rows.map((r) => r.species_id)).size} Pokémon · ${d.rows.length} encounter rows`), body);
    draw();
    return;
  }
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
