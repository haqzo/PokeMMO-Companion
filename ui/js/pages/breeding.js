// Breeding planner (docs/design/08): Preview (A | Offspring | B), Plan tree, Egg moves.
import { h, mount, icon, get, post, api, state, badge, notice, typeChip, typeChips, cap, tabs, toast, confirmDialog, on, debounce, spriteOrFallback, extLink, pad3, modal, WINDOW_ID, sourceInfo } from '../core.js';
import { go } from '../shell.js';
import { speciesPicker, speciesIndex, natureSelect, downloadJson, pickJsonFile } from '../components.js';

const STATS = [['hp', 'HP'], ['attack', 'Atk'], ['defense', 'Def'], ['sp_attack', 'SpA'], ['sp_defense', 'SpD'], ['speed', 'Spe']];
const ITEMS = ['none', 'Everstone', 'Power Weight', 'Power Bracer', 'Power Belt', 'Power Lens', 'Power Band', 'Power Anklet'];
const ITEM_STAT = { 'Power Weight': 'HP', 'Power Bracer': 'Atk', 'Power Belt': 'Def', 'Power Lens': 'SpA', 'Power Band': 'SpD', 'Power Anklet': 'Spe' };
const blankParent = () => ({ species: null, gender: null, nature: null, item: 'none', ivs: {} });
let tab = 'preview';
let pairing = null;
let unsub = [];
let itemIcons = {};
export function dispose() { unsub.forEach((u) => u()); unsub = []; }

async function loadPairing() {
  const d = await get('/api/docs/pairing');
  const cur = d.items.find((x) => x.id === 'current');
  pairing = cur ? cur.data : { a: blankParent(), b: blankParent() };
  return pairing;
}
const savePairing = debounce(() => api('PUT', '/api/docs/pairing/current', { name: 'Current preview', data: pairing }).catch(() => {}), 300);

export async function render(el, route, { popout = false, mode = 'expanded' } = {}) {
  dispose();
  if (route && route.query) {
    if (route.query.get('tab')) tab = route.query.get('tab');
  }
  if (!state.boot.dex.imported) {
    mount(el, notice('info', h('strong', null, 'Breeding needs your local PokeMMO data '), '(egg groups, gender ratios, learnsets). Import it in Settings › Data.'),
      h('div', { style: { marginTop: '10px' } }, h('button', { class: 'btn primary', onclick: () => go('#/settings/data') }, 'Open data import')));
    return;
  }
  await loadPairing();
  try { itemIcons = (await get('/api/tools/breeding/items')).icons || {}; } catch (_) { itemIcons = {}; }
  if (route && route.query && route.query.get('a')) {
    pairing.a = { ...blankParent(), species: Number(route.query.get('a')) };
    savePairing();
    history.replaceState(null, '', location.pathname + location.search + '#/tools/breeding');
  }
  const body = h('div');
  const draw = () => {
    const bar = popout ? null : tabs([{ id: 'preview', label: 'Breeding Preview' }, { id: 'plan', label: 'Breeding Plan' }, { id: 'eggmoves', label: 'Egg Moves' }], tab,
      (t) => { tab = t; draw(); }, 'Breeding views');
    mount(el, h('div', { class: 'stack' }, bar, body));
    if (tab === 'plan' && !popout) renderPlan(body, route);
    else if (tab === 'eggmoves' && !popout) renderEggMoves(body, route);
    else renderPreview(body, { popout, mode });
  };
  draw();
  unsub.push(on('documents', async (d, ev) => { if (ev.origin === WINDOW_ID) return; if (d && d.kind === 'pairing' && tab === 'preview') { await loadPairing(); renderPreview(body, { popout, mode }); } }));
}

// ---------------------------------------------------------------- preview
async function renderPreview(el, { popout, mode }) {
  const idx = await speciesIndex();
  const result = h('div');
  const compat = h('div');
  let seq = 0;
  const update = async () => {
    savePairing();
    const mine = ++seq;  // ignore out-of-order responses from earlier keystrokes
    let p;
    try { p = await post('/api/tools/breeding/preview', pairing); } catch (e) { if (mine === seq) mount(result, notice('bad', e.message)); return; }
    if (mine === seq) drawResult(p);
  };
  const parentCard = (key, label) => {
    const P = pairing[key];
    const sp = idx.find((s) => s.id === P.species);
    const gc = sp ? sp.gender_code : null;
    const genders = gc === 255 ? [['genderless', 'Genderless']] : gc === 0 ? [['male', '♂ Male']] : gc === 254 ? [['female', '♀ Female']] : [['male', '♂ Male'], ['female', '♀ Female']];
    if (sp && genders.length === 1) P.gender = genders[0][0];
    const ivRow = h('div', { class: 'iv-grid' }, h('span', { class: 'label' }, 'IVs'),
      STATS.map(([k, l]) => h('input', { class: 'input iv-input', type: 'number', min: 0, max: 31, placeholder: '?', value: P.ivs[k] ?? '', title: `${l} IV (0–31, blank = unknown)`,
        'aria-label': `${label} ${l} IV`, oninput: (e) => { const v = e.target.value === '' ? null : Math.max(0, Math.min(31, Number(e.target.value))); P.ivs[k] = v; update(); } })));
    const itemSel = h('select', { class: 'input', 'aria-label': `${label} held item`, onchange: (e) => { P.item = e.target.value; update(); } },
      ITEMS.map((it) => h('option', { value: it, selected: P.item === it ? 'selected' : null }, it === 'none' ? 'No item' : ITEM_STAT[it] ? `${it} (${ITEM_STAT[it]})` : it)));
    const ic = itemIcons[P.item];
    return h('div', { class: 'parent-card' },
      h('div', { class: 'row' }, h('span', { class: 'eyebrow card-head', style: { margin: 0, fontSize: '.75rem', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 } }, label)),
      speciesPicker({ label: null, value: P.species, onChange: (id) => { P.species = id; P.gender = null; update(); redrawCols(); } }),
      h('div', { class: 'row' },
        h('select', { class: 'input', 'aria-label': `${label} gender`, onchange: (e) => { P.gender = e.target.value || null; update(); } }, genders.length > 1 ? h('option', { value: '' }, '— Gender —') : null,
          genders.map(([v, l]) => h('option', { value: v, selected: P.gender === v ? 'selected' : null }, l))),
        natureSelect(P.nature, (v) => { P.nature = v; update(); })),
      h('div', { class: 'row' }, ic ? h('img', { class: 'pixel', src: ic, width: 24, height: 24, alt: '' }) : null, itemSel),
      h('div', { class: 'tiny muted' }, 'One held item per parent: an Everstone and a Power item cannot share a parent.'),
      ivRow);
  };
  const cols = h('div', { class: popout && mode !== 'expanded' ? 'stack' : 'breed-cols' });
  const redrawCols = () => mount(cols, parentCard('a', 'Parent A'), result, parentCard('b', 'Parent B'));
  const drawResult = (p) => {
    const c = p.compatibility;
    const off = c.offspring;
    const cls = { compatible: 'ok', needs_verification: 'warn', incompatible: 'bad', issues: 'bad' }[c.status] || '';
    mount(result, h('div', { class: 'offspring-card' },
      h('div', { class: 'eyebrow', style: { fontSize: '.75rem', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 } }, 'Expected offspring · prediction'),
      off ? h('div', { class: 'row' }, h('div', { style: { width: '48px', height: '48px', display: 'grid', placeItems: 'center' } }, spriteOrFallback(off.icon, off, 48)),
        h('div', null, h('div', { style: { fontWeight: 700, fontSize: '1.1rem' } }, off.name), typeChips(off.types, true))) : h('div', { class: 'muted' }, 'Choose two compatible parents'),
      h('div', { class: 'iv-grid' }, h('span'), STATS.map(([, l]) => h('span', { class: 'label', style: { textAlign: 'center' } }, l))),
      h('div', { class: 'iv-grid' }, h('span', { class: 'label' }, 'IV'), p.ivs.map((r) => h('div', { class: 'iv-cell ' + r.state, title: r.text },
        r.state === 'guaranteed' ? (r.value ?? '?') : r.values && r.values.length ? r.values.join('/') : '?'))),
      h('div', { class: 'small' }, h('span', { class: 'label' }, 'Nature: '), p.nature.state === 'guaranteed' ? h('strong', null, p.nature.value || '(set parent nature)') : null, ' ', h('span', { class: 'muted' }, p.nature.text)),
      h('div', { class: 'row wrap tiny' }, h('span', { class: 'iv-cell guaranteed', style: { padding: '0 6px' } }, 'guaranteed'), h('span', { class: 'iv-cell possible', style: { padding: '0 6px' } }, 'possible'),
        h('span', { class: 'iv-cell range', style: { padding: '0 6px' } }, 'one of'), h('span', { class: 'muted' }, 'Hover a cell for the rule.'))));
    mount(compat, h('div', { class: 'compat ' + cls }, icon(cls === 'ok' ? 'check' : 'warn'),
      h('div', { class: 'grow' }, h('strong', null, { compatible: 'Compatible', needs_verification: 'Compatible — needs verification', incompatible: 'Not compatible', issues: 'Check inputs',
        incomplete: 'Incomplete', needs_data: 'Needs data' }[c.status] || c.status), ' — ', c.reason,
      (c.flags || []).map((f) => h('div', { class: 'small', style: { color: 'var(--warn)' } }, f))),
      h('details', null, h('summary', { class: 'small', style: { cursor: 'pointer' } }, 'See why'),
        h('div', { class: 'small stack tight', style: { marginTop: '6px', maxWidth: '520px' } }, (c.notes || []).map((n) => h('div', null, n)),
          h('div', null, 'Rules applied: egg groups/gender/Ditto (standard); brace → guaranteed stat and Everstone → nature (', extLink(p.source, 'official 2015 changelog'), ').'),
          h('div', null, 'Not validated: ', p.unverified.join('; '), '.')))),
    notice('warn', p.consumption));
  };
  const actions = popout ? null : h('div', { class: 'row wrap' },
    h('button', { class: 'btn', onclick: () => { const t = pairing.a; pairing.a = pairing.b; pairing.b = t; redrawCols(); update(); } }, 'Swap parents'),
    h('button', { class: 'btn', onclick: async () => { const r = await post('/api/docs/pairing', { name: pairingName(idx), data: JSON.parse(JSON.stringify(pairing)) }); toast(`Saved pairing “${r.name}”`); } }, 'Save pairing'),
    h('button', { class: 'btn ghost', onclick: savedPairingsDialog }, 'Saved pairings…'),
    h('button', { class: 'btn ghost', onclick: () => { pairing = { a: blankParent(), b: blankParent() }; redrawCols(); update(); } }, 'Reset'),
    h('span', { class: 'grow' }), h('span', { class: 'small muted' }, 'The Companion never breeds for you — confirm in game.'));
  mount(el, h('div', { class: 'stack' }, cols, compat, actions));
  redrawCols();
  update();

  async function savedPairingsDialog() {
    const list = (await get('/api/docs/pairing')).items.filter((x) => x.id !== 'current');
    modal({ title: 'Saved pairings', body: list.length ? h('div', { class: 'list-rows' }, list.map((x) => h('div', { class: 'list-row' }, h('span', { class: 'grow' }, x.name),
      h('button', { class: 'btn small', onclick: () => { pairing = JSON.parse(JSON.stringify(x.data)); savePairing(); document.querySelector('.modal-back').remove(); renderPreview(el, { popout, mode }); } }, 'Load'),
      h('button', { class: 'btn small danger', onclick: async (e) => { await api('DELETE', `/api/docs/pairing/${x.id}`); e.target.closest('.list-row').remove(); } }, 'Delete')))) : h('p', { class: 'muted' }, 'No saved pairings yet.'),
    actions: [{ label: 'Close', kind: 'ghost' }] });
  }
}
function pairingName(idx) {
  const n = (id) => (idx.find((s) => s.id === id) || {}).name || '?';
  return `${n(pairing.a.species)} × ${n(pairing.b.species)}`;
}

// ------------------------------------------------------------------- plan
let selectedNode = null;
async function renderPlan(el, route) {
  const plans = (await get('/api/docs/breeding_plan')).items;
  const wantId = route && route.query ? route.query.get('plan') : null;
  let doc = wantId === '__new' ? null : (plans.find((p) => p.id === wantId) || plans[0] || null);
  let plan = doc ? doc.data : { species: null, nature: null, ivs: ['hp', 'attack', 'defense', 'sp_defense', 'speed'], node_status: {}, prices: {} };
  let name = doc ? doc.name : 'New plan';
  const treeBox = h('div'), side = h('div', { class: 'stack' });
  const persist = debounce(async () => {
    if (!doc) return;
    doc = await api('PUT', `/api/docs/breeding_plan/${doc.id}`, { name, data: plan });
  }, 400);
  const compute = async () => {
    const s = await post('/api/tools/breeding/plan', plan);
    if (s.error) { mount(treeBox, notice('info', s.error)); mount(side); return; }
    const flat = [];
    const walk = (n, depth, item) => { flat.push({ n, depth, item }); if (!n.leaf) n.parents.forEach((p) => walk(p.node, depth + 1, p.item)); };
    walk(s.tree, 0, null);
    mount(treeBox, h('div', { class: 'tree', role: 'tree' }, flat.map(({ n, depth, item }) => {
      const status = plan.node_status[n.id] || 'not_started';
      return h('div', { class: 'tree-node' + (selectedNode === n.id ? ' selected' : '') + (status === 'done' ? ' done' : ''), role: 'treeitem',
        style: { marginLeft: depth * 22 + 'px' }, tabindex: '0', onclick: () => { selectedNode = n.id; compute(); } },
      h('span', { class: 'chip', style: { minWidth: '62px', justifyContent: 'center' } }, n.leaf ? 'Breeder' : `${n.traits.length}× goal`),
      h('span', { class: 'lbl grow' }, n.label), item ? h('span', { class: 'item' }, 'holds ', item) : null,
      h('select', { class: 'input', style: { width: 'auto', minHeight: '26px', padding: '1px 6px' }, 'aria-label': 'Node status', onclick: (e) => e.stopPropagation(),
        onchange: (e) => { plan.node_status[n.id] = e.target.value; persist(); compute(); } },
      [['not_started', 'Not started'], ['ready', 'Breeders ready'], ['item_missing', 'Item missing'], ['done', 'Done'], ['skipped', 'Skipped / alternative']].map(([v, l]) =>
        h('option', { value: v, selected: status === v ? 'selected' : null }, l))));
    })));
    const priceRows = Object.entries(s.items).map(([it, count]) => h('tr', null, h('td', null, it), h('td', null, '×' + count),
      h('td', null, h('input', { class: 'input', type: 'number', min: 0, step: 1000, style: { width: '120px' }, value: plan.prices[it] ?? '', placeholder: 'price',
        'aria-label': `${it} price`, onchange: (e) => { plan.prices[it] = e.target.value === '' ? undefined : Number(e.target.value); persist(); compute(); } }))));
    const sel = selectedNode && flat.find((f) => f.n.id === selectedNode);
    mount(side,
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, 'Summary')),
        h('dl', { class: 'kv' }, h('dt', null, 'Base breeders'), h('dd', null, s.leaves), h('dt', null, 'Breeds'), h('dd', null, s.breeds),
          h('dt', null, 'Progress'), h('dd', null, `${s.progress.done} of ${s.progress.nodes} nodes marked done`))),
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, 'Items & your prices')),
        h('table', { class: 'table compact' }, h('tbody', null, priceRows)),
        h('div', { style: { marginTop: '8px', fontWeight: 600 } }, s.cost.total !== null ? `Item total: ¥${s.cost.total.toLocaleString()}` :
          `Partial total ¥${s.cost.partial_total.toLocaleString()} — enter prices for: ${s.cost.missing_prices.join(', ')}`),
        h('div', { class: 'tiny muted' }, 'Manual prices only — no GTL data is fetched. Gender-selection fees and breeder purchases are not included.')),
      sel ? h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, 'Selected step')), h('div', null, sel.n.label),
        !sel.n.leaf ? h('div', { class: 'small muted', style: { margin: '6px 0' } }, `Parents: ${sel.n.parents.map((p) => `${p.node.label} holding ${p.item}`).join('  ×  ')}`) : h('div', { class: 'small muted' }, 'A base breeder you buy or catch.'),
        !sel.n.leaf ? h('button', { class: 'btn', onclick: () => loadStepIntoPreview(sel.n) }, 'Open this step in Breeding Preview') : null) : h('div', { class: 'small muted' }, 'Select a node to inspect it.'),
      h('div', { class: 'small muted' }, s.notes.map((n) => h('div', null, '• ' + n))));
  };
  const loadStepIntoPreview = async (n) => {
    const cur = await get('/api/docs/pairing');
    const base = (cur.items.find((x) => x.id === 'current') || { data: { a: blankParent(), b: blankParent() } }).data;
    const mk = (p, prev) => { const ivs = {}; p.node.traits.forEach((t) => { if (!t.startsWith('nature:')) ivs[t] = 31; });
      const nat = p.node.traits.find((t) => t.startsWith('nature:'));
      return { ...prev, species: plan.species, ivs, item: p.item, nature: nat ? nat.slice(7) : prev.nature }; };
    const data = { a: mk(n.parents[0], base.a), b: mk(n.parents[1], base.b) };
    await api('PUT', '/api/docs/pairing/current', { name: 'Current preview', data });
    tab = 'preview';
    go('#/tools/breeding?tab=preview');
  };
  const goalChecks = h('div', { class: 'row wrap' }, STATS.map(([k, l]) => h('label', { class: 'chip btnlike' + (plan.ivs.includes(k) ? ' active' : '') },
    h('input', { type: 'checkbox', class: 'check', checked: plan.ivs.includes(k), onchange: (e) => { plan.ivs = e.target.checked ? [...plan.ivs, k] : plan.ivs.filter((x) => x !== k);
      plan.node_status = {}; persist(); renderPlanAgain(); } }), `${l} 31`)));
  const renderPlanAgain = () => renderPlan(el, { query: new URLSearchParams(doc ? 'plan=' + doc.id : '') });
  mount(el, h('div', { class: 'stack' },
    h('div', { class: 'card row wrap', style: { alignItems: 'flex-end' } },
      h('div', { class: 'field' }, h('label', null, 'Saved plans'), h('select', { class: 'input', onchange: (e) => renderPlan(el, { query: new URLSearchParams(e.target.value ? 'plan=' + e.target.value : 'plan=__new') }) },
        h('option', { value: '' }, '— New plan —'), plans.map((p) => h('option', { value: p.id, selected: doc && p.id === doc.id ? 'selected' : null }, p.name)))),
      h('div', { class: 'field grow' }, h('label', null, 'Plan name'), h('input', { class: 'input', value: name, maxlength: 60, oninput: (e) => { name = e.target.value; persist(); } })),
      doc ? null : h('button', { class: 'btn primary', onclick: async () => { doc = await post('/api/docs/breeding_plan', { name, data: plan }); toast('Plan saved — changes now autosave'); renderPlanAgain(); } }, 'Save plan'),
      doc ? h('span', { class: 'small muted' }, 'Autosaves') : null,
      h('button', { class: 'btn ghost', onclick: () => downloadJson(`breeding-plan-${(name || 'plan').replace(/\W+/g, '-')}.json`, { format: 'pokemmo-companion-breeding-plan', version: 1, name, plan }) }, icon('download'), 'Export'),
      h('button', { class: 'btn ghost', onclick: async () => { try { const f = await pickJsonFile(); if (!f) return; if (f.format !== 'pokemmo-companion-breeding-plan') throw new Error('Not a breeding plan file');
        doc = await post('/api/docs/breeding_plan', { name: f.name + ' (imported)', data: f.plan }); renderPlanAgain(); } catch (e) { toast(e.message, { kind: 'warn' }); } } }, icon('upload'), 'Import'),
      doc ? h('button', { class: 'btn danger', onclick: async () => { if (await confirmDialog('Delete plan', `Delete “${doc.name}”? Your in-game Pokémon are not affected.`, 'Delete', true)) {
        await api('DELETE', `/api/docs/breeding_plan/${doc.id}`); doc = null; renderPlan(el, { query: new URLSearchParams('plan=__new') }); } } }, 'Delete') : null),
    h('div', { class: 'card stack' }, h('div', { class: 'row wrap' },
      h('div', { style: { minWidth: '260px' } }, speciesPicker({ label: 'Target species', value: plan.species, onChange: (id) => { plan.species = id; persist(); } })),
      h('div', { class: 'field' }, h('label', null, 'Nature goal'), natureSelect(plan.nature, (v) => { plan.nature = v; plan.node_status = {}; persist(); renderPlanAgain(); }))),
    h('div', { class: 'field' }, h('label', null, 'IV goals (31 in each selected stat)'), goalChecks),
    h('div', { class: 'tiny muted' }, 'Tree uses the common community brace method: each goal comes from two parents that share all but one trait, each holding the item for its unique trait. It is not claimed to be the cheapest path.')),
    h('div', { class: 'grid-2', style: { gridTemplateColumns: 'minmax(0,1.4fr) minmax(260px,1fr)', alignItems: 'start' } }, h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, 'Plan tree')), treeBox), side)));
  compute();
}

// --------------------------------------------------------------- egg moves
async function renderEggMoves(el, route) {
  const out = h('div');
  const load = async (id) => {
    if (!id) return;
    mount(out, h('div', { class: 'skeleton', style: { height: '80px' } }));
    const r = await get('/api/tools/breeding/eggmoves/' + id);
    if (r.error) { mount(out, notice('info', r.error)); return; }
    mount(out, h('div', { class: 'stack' }, h('div', { class: 'small muted' }, `${r.species} · egg groups: ${r.egg_groups.join(', ') || 'none breedable'}`),
      r.moves.length ? r.moves.map((m) => h('div', { class: 'card tight stack tight' }, h('div', { class: 'row' }, h('strong', null, m.move), m.type ? typeChip(m.type, true) : null,
        m.verified_meta ? null : sourceInfo('DUMP_ONLY', 'Move details are not checked in game yet.'), h('span', { class: 'grow' }), h('span', { class: 'small muted' }, `${m.father_count} candidate father species`)),
      h('div', { class: 'row wrap' }, m.fathers.map((f) => h('button', { class: 'chip btnlike', title: f.methods.join(', '), onclick: () => go('#/pokedex/' + f.id) }, f.name,
        f.tm_unconfirmed ? h('span', { style: { color: 'var(--st-dump)' } }, ' (TM?)') : null))))) : h('div', { class: 'empty' }, 'No egg moves listed for this species in the PokeMMO data.'),
      notice('warn', r.note)));
  };
  const sid = route && route.query ? Number(route.query.get('species')) || null : null;
  mount(el, h('div', { class: 'stack' }, h('div', { class: 'card', style: { maxWidth: '420px' } }, speciesPicker({ label: 'Species', value: sid, onChange: load })), out));
  if (sid) load(sid);
}
