import { t as translateUI, lang } from '../i18n.js';
import { speciesLabel, speciesNameLabel, gameTerm } from '../game-locale.js';
// Breeding planner (docs/design/08): Preview (A | Offspring | B), Plan tree, Egg moves.
import { h, mount, icon, get, post, api, state, badge, notice, typeChip, typeChips, cap, tabs, toast, confirmDialog, on, debounce, spriteOrFallback, extLink, pad3, modal, WINDOW_ID, sourceInfo } from '../core.js';
import { go } from '../shell.js';
import { speciesPicker, speciesIndex, natureSelect, downloadJson, pickJsonFile } from '../components.js';

const STATS = [['hp', 'HP'], ['attack', 'Atk'], ['defense', 'Def'], ['sp_attack', 'SpA'], ['sp_defense', 'SpD'], ['speed', 'Spe']];
const ITEMS = ['none', 'Everstone', 'Power Weight', 'Power Bracer', 'Power Belt', 'Power Lens', 'Power Band', 'Power Anklet'];
const ITEM_STAT = { 'Power Weight': 'HP', 'Power Bracer': 'Atk', 'Power Belt': 'Def', 'Power Lens': 'SpA', 'Power Band': 'SpD', 'Power Anklet': 'Spe' };

// Translate only service-owned breeding messages; keep canonical payloads unchanged.
const BREED_MESSAGES = {
  "Import your PokeMMO Pokédex data to check egg groups.": "breedui.needs_data",
  "Choose a species for both parents.": "breedui.choose_species",
  "Two Ditto cannot breed with each other.": "breedui.two_ditto",
  "Ditto can pair with any breedable species, including genderless ones.": "breedui.ditto_pair",
  "Choose a gender for both parents.": "breedui.choose_gender",
  "Parents must be one male and one female.": "breedui.opposite",
  "Nidoran♀ / Volbeat / Illumise special offspring rules are not verified.": "breedui.special",
  "Compatible pairing.": "breedui.compatible",
  "One parent's value — both braced the same stat (selection rule not validated)": "breedui.both_braced",
  "From Parent A (brace — official rule)": "breedui.from_a",
  "From Parent B (brace — official rule)": "breedui.from_b",
  "May come from either parent or not be inherited — distribution not validated": "breedui.possible",
  "Both hold Everstone — which nature passes is not validated": "breedui.both_everstone",
  "Parent A's nature (Everstone — official rule)": "breedui.nature_a",
  "Parent B's nature (Everstone — official rule)": "breedui.nature_b",
  "Not guaranteed without an Everstone": "breedui.no_everstone",
  "Both parents are consumed when you breed in PokeMMO. Double-check this prediction in the game's breeding window before confirming.": "breedui.consumption",
  "Unbraced IV distribution and rounding": "breedui.unbraced",
  "Gender-selection fee": "breedui.gender_fee",
  "Egg moves": "breedui.egg_moves",
  "Hidden Ability, Alpha, Shiny and costume inheritance": "breedui.inheritance",
  "Choose at least two goals (IV stats and/or a nature) to build a tree.": "breedui.min_goals",
  "At most 6 IVs + nature.": "breedui.max_goals",
  "Item counts assume each breed uses one item per parent (community brace-tree method).": "breedui.item_counts",
  "Gender-selection fees and breeder purchase prices are not included — enter your own.": "breedui.fees",
  "A used breeder is consumed; mark nodes Done only after you breed in game.": "breedui.used",
  "Import data and choose a species.": "breedui.import_choose",
  "Candidates come from dump learnsets of species sharing an egg group. PokeMMO egg-move inheritance rules are not validated; 'TM??' means the TM source is unconfirmed.": "breedui.candidates"
};
const itemName = (v) => gameTerm('item', v);
const groupsName = (v) => v.split(', ').map(g => gameTerm('egg', g)).join(', ');
const parentName = (v) => v === 'Parent A' ? translateUI('ui.b273_breeding_015') : v === 'Parent B' ? translateUI('ui.b273_breeding_016') : v;
const genderName = (v) => ({ male: translateUI('breedui.male'), female: translateUI('breedui.female'), genderless: translateUI('breedui.no_gender') }[v] || v);
const speciesName = speciesNameLabel;
export const nodeName = (n) => lang() === 'en' ? n.label : n.traits.map(t => t.startsWith('nature:') ? gameTerm('nature', t.slice(7)) : gameTerm('stat', ({ sp_attack: 'special attack', sp_defense: 'special defense' })[t] || t) + ' 31').join(' + ');
export function breedMessage(v) {
  if (lang() === 'en' || typeof v !== 'string') return v;
  if (Object.hasOwn(BREED_MESSAGES, v)) return translateUI(BREED_MESSAGES[v]);
  let m;
  if ((m = /^Shared egg group: (.+)\.$/.exec(v))) return translateUI('breedui.shared_group', { groups: groupsName(m[1]) });
  if ((m = /^(.+) is in the 'cannot breed' egg group\.$/.exec(v))) return translateUI('breedui.no_breed', { species: speciesName(m[1]) });
  if ((m = /^(.+) is genderless and can only breed with Ditto\.$/.exec(v))) return translateUI('breedui.genderless', { species: speciesName(m[1]) });
  if ((m = /^No shared egg group: (.+) \((.+)\) vs (.+) \((.+)\)\.$/.exec(v))) return translateUI('breedui.no_shared', { a: speciesName(m[1]), ag: groupsName(m[2]), b: speciesName(m[3]), bg: groupsName(m[4]) });
  if ((m = /^(Parent [AB]): unknown held item$/.exec(v))) return translateUI('breedui.unknown_item', { parent: parentName(m[1]) });
  if ((m = /^(Parent [AB]): (.+) cannot be (.+) \(possible: (.+)\)$/.exec(v))) return translateUI('breedui.gender_issue', { parent: parentName(m[1]), species: speciesName(m[2]), gender: genderName(m[3]), options: m[4].split(', ').map(genderName).join(', ') });
  if ((m = /^Baby species: offspring may be (.+) or (.+) depending on incense rules — not verified for PokeMMO\.$/.exec(v))) return translateUI('breedui.baby', { a: speciesName(m[1]), b: m[2] === 'its evolution' ? translateUI('breedui.evolution') : speciesName(m[2]) });
  return v;
}

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
    mount(el, notice('info', h('strong', null, translateUI('ui.b273_breeding_001')), translateUI('ui.b273_breeding_002')),
      h('div', { style: { marginTop: '10px' } }, h('button', { class: 'btn primary', onclick: () => go('#/settings/data') }, translateUI('ui.b273_breeding_003'))));
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
    const bar = popout ? null : tabs([{ id: 'preview', label: translateUI('ui.b273_breeding_004') }, { id: 'plan', label: translateUI('ui.b273_breeding_005') }, { id: 'eggmoves', label: translateUI('ui.b273_breeding_006') }], tab,
      (t) => { tab = t; draw(); }, translateUI('ui.b273_breeding_007'));
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
    const genders = gc === 255 ? [['genderless', translateUI('ui.b273_breeding_008')]] : gc === 0 ? [['male', translateUI('ui.b273_breeding_009')]] : gc === 254 ? [['female', translateUI('ui.b273_breeding_010')]] : [['male', translateUI('ui.b273_breeding_009')], ['female', translateUI('ui.b273_breeding_010')]];
    if (sp && genders.length === 1) P.gender = genders[0][0];
    const ivRow = h('div', { class: 'iv-grid' }, h('span', { class: 'label' }, translateUI('ui.b273_breeding_011')),
      STATS.map(([k, l]) => h('input', { class: 'input iv-input', type: 'number', min: 0, max: 31, placeholder: '?', value: P.ivs[k] ?? '', title: translateUI('ui.b273_breeding_070', { stat: l }),
        'aria-label': translateUI('ui.b273_breeding_071', { parent: label, stat: l }), oninput: (e) => { const v = e.target.value === '' ? null : Math.max(0, Math.min(31, Number(e.target.value))); P.ivs[k] = v; update(); } })));
    const itemSel = h('select', { class: 'input', 'aria-label': translateUI('ui.b273_breeding_072', { parent: label }), onchange: (e) => { P.item = e.target.value; update(); } },
      ITEMS.map((it) => h('option', { value: it, selected: P.item === it ? 'selected' : null }, it === 'none' ? translateUI('ui.b273_breeding_012') : ITEM_STAT[it] ? `${itemName(it)} (${ITEM_STAT[it]})` : itemName(it))));
    const ic = itemIcons[P.item];
    return h('div', { class: 'parent-card' },
      h('div', { class: 'row' }, h('span', { class: 'eyebrow card-head', style: { margin: 0, fontSize: '.75rem', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 } }, label)),
      speciesPicker({ label: null, value: P.species, onChange: (id) => { P.species = id; P.gender = null; update(); redrawCols(); } }),
      h('div', { class: 'row' },
        h('select', { class: 'input', 'aria-label': translateUI('ui.b273_breeding_073', { parent: label }), onchange: (e) => { P.gender = e.target.value || null; update(); } }, genders.length > 1 ? h('option', { value: '' }, translateUI('ui.b273_breeding_013')) : null,
          genders.map(([v, l]) => h('option', { value: v, selected: P.gender === v ? 'selected' : null }, l))),
        natureSelect(P.nature, (v) => { P.nature = v; update(); })),
      h('div', { class: 'row' }, ic ? h('img', { class: 'pixel', src: ic, width: 24, height: 24, alt: '' }) : null, itemSel),
      h('div', { class: 'tiny muted' }, translateUI('ui.b273_breeding_014')),
      ivRow);
  };
  const cols = h('div', { class: popout && mode !== 'expanded' ? 'stack' : 'breed-cols' });
  const redrawCols = () => mount(cols, parentCard('a', translateUI('ui.b273_breeding_015')), result, parentCard('b', translateUI('ui.b273_breeding_016')));
  const drawResult = (p) => {
    const c = p.compatibility;
    const off = c.offspring;
    const cls = { compatible: 'ok', needs_verification: 'warn', incompatible: 'bad', issues: 'bad' }[c.status] || '';
    mount(result, h('div', { class: 'offspring-card' },
      h('div', { class: 'eyebrow', style: { fontSize: '.75rem', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 } }, translateUI('ui.b273_breeding_017')),
      off ? h('div', { class: 'row' }, h('div', { style: { width: '48px', height: '48px', display: 'grid', placeItems: 'center' } }, spriteOrFallback(off.icon, off, 48)),
        h('div', null, h('div', { style: { fontWeight: 700, fontSize: '1.1rem' } }, speciesLabel(off.id, off.name)), typeChips(off.types, true))) : h('div', { class: 'muted' }, translateUI('ui.compatible_parents')),
      h('div', { class: 'iv-grid' }, h('span'), STATS.map(([, l]) => h('span', { class: 'label', style: { textAlign: 'center' } }, l))),
      h('div', { class: 'iv-grid' }, h('span', { class: 'label' }, 'IV'), p.ivs.map((r) => h('div', { class: 'iv-cell ' + r.state, title: breedMessage(r.text) },
        r.state === 'guaranteed' ? (r.value ?? '?') : r.values && r.values.length ? r.values.join('/') : '?'))),
      h('div', { class: 'small' }, h('span', { class: 'label' }, translateUI('ui.b273_breeding_018')), p.nature.state === 'guaranteed' ? h('strong', null, gameTerm('nature', p.nature.value) || translateUI('ui.b273_breeding_019')) : null, ' ', h('span', { class: 'muted' }, breedMessage(p.nature.text))),
      h('div', { class: 'row wrap tiny' }, h('span', { class: 'iv-cell guaranteed', style: { padding: '0 6px' } }, translateUI('ui.b273_breeding_020')), h('span', { class: 'iv-cell possible', style: { padding: '0 6px' } }, translateUI('ui.b273_breeding_021')),
        h('span', { class: 'iv-cell range', style: { padding: '0 6px' } }, translateUI('ui.b273_breeding_022')), h('span', { class: 'muted' }, translateUI('ui.b273_breeding_023')))));
    mount(compat, h('div', { class: 'compat ' + cls }, icon(cls === 'ok' ? 'check' : 'warn'),
      h('div', { class: 'grow' }, h('strong', null, { compatible: translateUI('ui.b273_breeding_024'), needs_verification: translateUI('ui.b273_breeding_025'), incompatible: translateUI('ui.b273_breeding_026'), issues: translateUI('ui.b273_breeding_027'),
        incomplete: translateUI('ui.b273_breeding_028'), needs_data: translateUI('ui.b273_breeding_029') }[c.status] || c.status), ' — ', breedMessage(c.reason),
      (c.flags || []).map((f) => h('div', { class: 'small', style: { color: 'var(--warn)' } }, breedMessage(f)))),
      h('details', null, h('summary', { class: 'small', style: { cursor: 'pointer' } }, translateUI('ui.b273_breeding_030')),
        h('div', { class: 'small stack tight', style: { marginTop: '6px', maxWidth: '520px' } }, (c.notes || []).map((n) => h('div', null, breedMessage(n))),
          h('div', null, translateUI('ui.b273_breeding_031'), extLink(p.source, translateUI('ui.b273_breeding_032')), ').'),
          h('div', null, translateUI('ui.b273_breeding_033'), p.unverified.map(breedMessage).join('; '), '.')))),
    notice('warn', breedMessage(p.consumption)));
  };
  const actions = popout ? null : h('div', { class: 'row wrap' },
    h('button', { class: 'btn', onclick: () => { const t = pairing.a; pairing.a = pairing.b; pairing.b = t; redrawCols(); update(); } }, translateUI('ui.swap_parents')),
    h('button', { class: 'btn', onclick: async () => { const r = await post('/api/docs/pairing', { name: pairingName(idx), data: JSON.parse(JSON.stringify(pairing)) }); toast(translateUI('ui.b273_breeding_074', { name: r.name })); } }, translateUI('ui.save_pairing')),
    h('button', { class: 'btn ghost', onclick: savedPairingsDialog }, translateUI('ui.b273_breeding_034')),
    h('button', { class: 'btn ghost', onclick: () => { pairing = { a: blankParent(), b: blankParent() }; redrawCols(); update(); } }, translateUI('ui.reset')),
    h('span', { class: 'grow' }), h('span', { class: 'small muted' }, translateUI('ui.b273_breeding_035')));
  mount(el, h('div', { class: 'stack' }, cols, compat, actions));
  redrawCols();
  update();

  async function savedPairingsDialog() {
    const list = (await get('/api/docs/pairing')).items.filter((x) => x.id !== 'current');
    modal({ title: translateUI('ui.saved_pairings'), body: list.length ? h('div', { class: 'list-rows' }, list.map((x) => h('div', { class: 'list-row' }, h('span', { class: 'grow' }, x.name),
      h('button', { class: 'btn small', onclick: () => { pairing = JSON.parse(JSON.stringify(x.data)); savePairing(); document.querySelector('.modal-back').remove(); renderPreview(el, { popout, mode }); } }, translateUI('ui.b273_breeding_036')),
      h('button', { class: 'btn small danger', onclick: async (e) => { await api('DELETE', `/api/docs/pairing/${x.id}`); e.target.closest('.list-row').remove(); } }, translateUI('ui.delete'))))) : h('p', { class: 'muted' }, translateUI('ui.b273_breeding_037')),
    actions: [{ label: translateUI('ui.close'), kind: 'ghost' }] });
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
  let name = doc ? doc.name : translateUI('breedui.new_plan');
  const treeBox = h('div'), side = h('div', { class: 'stack' });
  const persist = debounce(async () => {
    if (!doc) return;
    doc = await api('PUT', `/api/docs/breeding_plan/${doc.id}`, { name, data: plan });
  }, 400);
  const compute = async () => {
    const s = await post('/api/tools/breeding/plan', plan);
    if (s.error) { mount(treeBox, notice('info', breedMessage(s.error))); mount(side); return; }
    const flat = [];
    const walk = (n, depth, item) => { flat.push({ n, depth, item }); if (!n.leaf) n.parents.forEach((p) => walk(p.node, depth + 1, p.item)); };
    walk(s.tree, 0, null);
    mount(treeBox, h('div', { class: 'tree', role: 'tree' }, flat.map(({ n, depth, item }) => {
      const status = plan.node_status[n.id] || 'not_started';
      return h('div', { class: 'tree-node' + (selectedNode === n.id ? ' selected' : '') + (status === 'done' ? ' done' : ''), role: 'treeitem',
        style: { marginLeft: depth * 22 + 'px' }, tabindex: '0', onclick: () => { selectedNode = n.id; compute(); } },
      h('span', { class: 'chip', style: { minWidth: '62px', justifyContent: 'center' } }, n.leaf ? translateUI('ui.b273_breeding_038') : translateUI('ui.b273_breeding_075', { count: n.traits.length })),
      h('span', { class: 'lbl grow' }, nodeName(n)), item ? h('span', { class: 'item' }, translateUI('ui.b273_breeding_039'), itemName(item)) : null,
      h('select', { class: 'input', style: { width: 'auto', minHeight: '26px', padding: '1px 6px' }, 'aria-label': translateUI('ui.b273_breeding_040'), onclick: (e) => e.stopPropagation(),
        onchange: (e) => { plan.node_status[n.id] = e.target.value; persist(); compute(); } },
      [['not_started', translateUI('ui.b273_breeding_041')], ['ready', translateUI('ui.b273_breeding_042')], ['item_missing', translateUI('ui.b273_breeding_043')], ['done', translateUI('ui.b273_breeding_044')], ['skipped', translateUI('ui.b273_breeding_045')]].map(([v, l]) =>
        h('option', { value: v, selected: status === v ? 'selected' : null }, l))));
    })));
    const priceRows = Object.entries(s.items).map(([it, count]) => h('tr', null, h('td', null, itemName(it)), h('td', null, '×' + count),
      h('td', null, h('input', { class: 'input', type: 'number', min: 0, step: 1000, style: { width: '120px' }, value: plan.prices[it] ?? '', placeholder: translateUI('ui.b273_breeding_046'),
        'aria-label': translateUI('ui.b273_breeding_076', { item: it }), onchange: (e) => { plan.prices[it] = e.target.value === '' ? undefined : Number(e.target.value); persist(); compute(); } }))));
    const sel = selectedNode && flat.find((f) => f.n.id === selectedNode);
    mount(side,
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, translateUI('ui.summary'))),
        h('dl', { class: 'kv' }, h('dt', null, translateUI('ui.b273_breeding_047')), h('dd', null, s.leaves), h('dt', null, translateUI('ui.b273_breeding_048')), h('dd', null, s.breeds),
          h('dt', null, translateUI('ui.progress')), h('dd', null, translateUI('ui.b273_breeding_077', { done: s.progress.done, total: s.progress.nodes })))),
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, translateUI('ui.b273_breeding_049'))),
        h('table', { class: 'table compact' }, h('tbody', null, priceRows)),
        h('div', { style: { marginTop: '8px', fontWeight: 600 } }, s.cost.total !== null ? translateUI('ui.b273_breeding_078', { total: s.cost.total.toLocaleString() }) :
          translateUI('ui.b273_breeding_079', { total: s.cost.partial_total.toLocaleString(), items: s.cost.missing_prices.map(itemName).join(', ') })),
        h('div', { class: 'tiny muted' }, translateUI('ui.b273_breeding_050'))),
      sel ? h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, translateUI('ui.b273_breeding_051'))), h('div', null, nodeName(sel.n)),
        !sel.n.leaf ? h('div', { class: 'small muted', style: { margin: '6px 0' } }, translateUI('breedui.parents', { parents: sel.n.parents.map(p => translateUI('breedui.holding', { parent: nodeName(p.node), item: itemName(p.item) })).join('  ×  ') })) : h('div', { class: 'small muted' }, translateUI('ui.b273_breeding_052')),
        !sel.n.leaf ? h('button', { class: 'btn', onclick: () => loadStepIntoPreview(sel.n) }, translateUI('ui.b273_breeding_053')) : null) : h('div', { class: 'small muted' }, translateUI('ui.b273_breeding_054')),
      h('div', { class: 'small muted' }, s.notes.map((n) => h('div', null, '• ' + breedMessage(n)))));
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
      h('div', { class: 'field' }, h('label', null, translateUI('ui.b273_breeding_055')), h('select', { class: 'input', onchange: (e) => renderPlan(el, { query: new URLSearchParams(e.target.value ? 'plan=' + e.target.value : 'plan=__new') }) },
        h('option', { value: '' }, translateUI('ui.b273_breeding_056')), plans.map((p) => h('option', { value: p.id, selected: doc && p.id === doc.id ? 'selected' : null }, p.name)))),
      h('div', { class: 'field grow' }, h('label', null, translateUI('ui.b273_breeding_057')), h('input', { class: 'input', value: name, maxlength: 60, oninput: (e) => { name = e.target.value; persist(); } })),
      doc ? null : h('button', { class: 'btn primary', onclick: async () => { doc = await post('/api/docs/breeding_plan', { name, data: plan }); toast(translateUI('ui.b273_breeding_058')); renderPlanAgain(); } }, translateUI('ui.b273_breeding_059')),
      doc ? h('span', { class: 'small muted' }, translateUI('ui.b273_breeding_060')) : null,
      h('button', { class: 'btn ghost', onclick: () => downloadJson(`breeding-plan-${(name || 'plan').replace(/\W+/g, '-')}.json`, { format: 'pokemmo-companion-breeding-plan', version: 1, name, plan }) }, icon('download'), translateUI('ui.export')),
      h('button', { class: 'btn ghost', onclick: async () => { try { const f = await pickJsonFile(); if (!f) return; if (f.format !== 'pokemmo-companion-breeding-plan') throw new Error(translateUI('ui.b273_breeding_061'));
        doc = await post('/api/docs/breeding_plan', { name: f.name + ' (imported)', data: f.plan }); renderPlanAgain(); } catch (e) { toast(e.message, { kind: 'warn' }); } } }, icon('upload'), translateUI('ui.import')),
      doc ? h('button', { class: 'btn danger', onclick: async () => { if (await confirmDialog(translateUI('ui.b273_breeding_062'), translateUI('ui.b273_breeding_080', { name: doc.name }), translateUI('ui.delete'), true)) {
        await api('DELETE', `/api/docs/breeding_plan/${doc.id}`); doc = null; renderPlan(el, { query: new URLSearchParams('plan=__new') }); } } }, translateUI('ui.delete')) : null),
    h('div', { class: 'card stack' }, h('div', { class: 'row wrap' },
      h('div', { style: { minWidth: '260px' } }, speciesPicker({ label: translateUI('ui.b273_breeding_063'), value: plan.species, onChange: (id) => { plan.species = id; persist(); } })),
      h('div', { class: 'field' }, h('label', null, translateUI('ui.b273_breeding_064')), natureSelect(plan.nature, (v) => { plan.nature = v; plan.node_status = {}; persist(); renderPlanAgain(); }))),
    h('div', { class: 'field' }, h('label', null, translateUI('ui.b273_breeding_065')), goalChecks),
    h('div', { class: 'tiny muted' }, translateUI('ui.b273_breeding_066'))),
    h('div', { class: 'grid-2', style: { gridTemplateColumns: 'minmax(0,1.4fr) minmax(260px,1fr)', alignItems: 'start' } }, h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, translateUI('ui.b273_breeding_067'))), treeBox), side)));
  compute();
}

// --------------------------------------------------------------- egg moves
async function renderEggMoves(el, route) {
  const out = h('div');
  const load = async (id) => {
    if (!id) return;
    mount(out, h('div', { class: 'skeleton', style: { height: '80px' } }));
    const r = await get('/api/tools/breeding/eggmoves/' + id);
    if (r.error) { mount(out, notice('info', breedMessage(r.error))); return; }
    mount(out, h('div', { class: 'stack' }, h('div', { class: 'small muted' }, translateUI('breedui.groups', { species: speciesLabel(r.species_id, r.species), groups: r.egg_groups.map(g => gameTerm('egg', g)).join(', ') || translateUI('breedui.none_groups') })),
      r.moves.length ? r.moves.map((m) => h('div', { class: 'card tight stack tight' }, h('div', { class: 'row' }, h('strong', null, gameTerm('move', m.move)), m.type ? typeChip(m.type, true) : null,
        m.verified_meta ? null : sourceInfo('DUMP_ONLY', translateUI('ui.b273_breeding_068')), h('span', { class: 'grow' }), h('span', { class: 'small muted' }, translateUI('ui.b273_breeding_081', { count: m.father_count }))),
      h('div', { class: 'row wrap' }, m.fathers.map((f) => h('button', { class: 'chip btnlike', title: f.methods.join(', '), onclick: () => go('#/pokedex/' + f.id) }, speciesLabel(f.id, f.name),
        f.tm_unconfirmed ? h('span', { style: { color: 'var(--st-dump)' } }, ' (TM?)') : null))))) : h('div', { class: 'empty' }, translateUI('ui.b273_breeding_069')),
      notice('warn', breedMessage(r.note))));
  };
  const sid = route && route.query ? Number(route.query.get('species')) || null : null;
  mount(el, h('div', { class: 'stack' }, h('div', { class: 'card', style: { maxWidth: '420px' } }, speciesPicker({ label: translateUI('ui.species'), value: sid, onChange: load })), out));
  if (sid) load(sid);
}
