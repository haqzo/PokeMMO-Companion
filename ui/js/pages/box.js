import { t as translateUI } from '../i18n.js';
import { findSpecies, gameTerm, speciesLabel, speciesMatches } from '../game-locale.js';
// My Box (curated individual Pokémon, docs/design/18 §3) and Showcase (§4).
// Nothing here is read from the game; nothing updates the Pokédex registration unless you press
// “Copy to Pokédex registration” (with undo).
import { h, mount, icon, get, api, post, setting, saveSettings, on, notice, debounce, toast, pad3, cap, confirmDialog, WINDOW_ID, spriteOrFallback } from '../core.js';
import { go, popoutButton, pinButton } from '../shell.js';
import { speciesIndex } from '../components.js';
import { t, uiLabel, number } from '../i18n.js';
import { linkedNotes, fileToBase64, pickFile, openRoute } from '../links.js';

const STATS = [['hp', 'HP'], ['attack', 'Atk'], ['defense', 'Def'], ['sp_attack', 'SpA'], ['sp_defense', 'SpD'], ['speed', 'Spe']];
const METHODS = [['', '—'], ['wild', 'Wild'], ['horde', 'Horde'], ['fishing', 'Fishing'], ['raid', 'Raid'], ['egg', 'Egg / bred'], ['trade', 'Trade'], ['gtl', 'GTL'],
  ['gift', 'Gift'], ['event', 'Event'], ['fossil', 'Fossil'], ['roamer', 'Roamer'], ['other', 'Other']];
const STATUS = [['kept', 'Kept'], ['traded', 'Traded'], ['sold', 'Sold'], ['released', 'Released'], ['archived', 'Archived']];
const REGIONS = ['', 'kanto', 'johto', 'hoenn', 'sinnoh', 'unova'];
let unsub = [];
let natures = null;
export function dispose() { unsub.forEach((u) => u()); unsub = []; }

function marks(e) {
  return [e.shiny ? h('span', { class: 'mk shiny', title: translateUI('ui.shiny') }, '✦') : null, e.secret_shiny ? h('span', { class: 'mk', title: translateUI('ui.b272_collection_055') }, '✧') : null,
    e.alpha ? h('span', { class: 'mk alpha', title: translateUI('ui.b272_collection_056') }, 'α') : null];
}
export function boxCard(e, onOpen, selected) {
  return h('button', { class: 'box-card' + (selected ? ' selected' : '') + (e.status !== 'kept' ? ' faded' : ''), dataset: { id: e.id }, onclick: () => onOpen(e),
    'aria-label': `${e.nickname || speciesLabel(e.species_id, e.species_name)}${e.shiny ? ', shiny' : ''}${e.alpha ? ', alpha' : ''}` },
  h('div', { class: 'bc-sprite' }, spriteOrFallback(e.icon, { id: e.species_id, name: e.species_name, types: [] }, 48)),
  h('div', { class: 'bc-name ellipsis' }, e.nickname || speciesLabel(e.species_id, e.species_name)), h('div', { class: 'tiny muted ellipsis' }, e.nickname ? speciesLabel(e.species_id, e.species_name) : `#${pad3(e.species_id)}`),
  h('div', { class: 'bc-marks' }, marks(e), e.iv_total != null ? h('span', { class: 'tiny muted' }, `IV ${e.iv_total}`) : null));
}

/** Collection = My Pokémon (your manually recorded entries; nothing is imported from the Pokédex) + Showcases.
 *  Same records, APIs and popouts as the former My Box and Showcase pages; their old routes redirect here. */
function collectionHead(active, actions, style) {
  const tab = (id, label, route) => h('button', { role: 'tab', class: 'tab' + (active === id ? ' active' : ''), 'aria-selected': String(active === id), onclick: () => go(route) }, label);
  return h('div', { class: 'page-head collection-head', style },
    h('div', null, h('h1', null, t('collection.title')),
      h('div', { class: 'sub' }, active === 'pokemon' ? translateUI('ui.b272_collection_001')
        : translateUI('ui.b272_collection_002')),
      h('div', { class: 'tabs collection-tabs', role: 'tablist', 'aria-label': t('collection.title') },
        tab('pokemon', t('collection.mine'), '#/collection'), tab('showcases', t('collection.showcases'), '#/collection/showcases'))),
    h('div', { class: 'actions' }, actions));
}

export async function render(el, route) {
  dispose();
  const [data, sp] = await Promise.all([get('/api/box'), speciesIndex()]);
  const sel = route.parts[1] && route.parts[1] !== 'new' ? route.parts[1] : null;
  const isNew = route.parts[1] === 'new';
  const f = { q: '', run: '', shiny: false, alpha: false, status: 'kept' };
  const page = h('div', { class: 'page flush' });
  mount(el, page);
  page.append(collectionHead('pokemon', [h('button', { class: 'btn primary', onclick: () => go('#/collection/pokemon/new') }, icon('plus'), t('box.add')),
    pinButton({ kind: 'tool', id: 'box' }), popoutButton('box')], { padding: '14px 18px 4px' }));
  const layout = h('div', { class: 'dex-layout' + (sel || isNew ? ' split' : '') });
  page.append(layout);
  const left = h('div', { class: 'dex-grid-wrap' });
  const grid = h('div', { class: 'box-grid' });
  const count = h('span', { class: 'small muted' });
  const draw = () => {
    const q = f.q.toLowerCase();
    const list = data.entries.filter((e) => (!q || (e.nickname || '').toLowerCase().includes(q) || speciesMatches({ id: e.species_id, name: e.species_name }, q) || (e.tags || []).some((x) => x.includes(q))) &&
      (!f.run || e.run_id === f.run) && (!f.shiny || e.shiny) && (!f.alpha || e.alpha) && (f.status === 'all' || e.status === f.status));
    count.textContent = translateUI('ui.b272_collection_094', { shown: number(list.length), total: number(data.entries.length) });
    mount(grid, list.length ? list.map((e) => boxCard(e, (x) => go('#/collection/pokemon/' + x.id), e.id === sel)) :
      h('div', { class: 'empty', style: { gridColumn: '1/-1' } }, data.entries.length ? translateUI('ui.b272_collection_003') : h('div', null, h('h3', null, translateUI('ui.b272_collection_004')),
        h('p', null, translateUI('ui.b272_collection_005')), h('button', { class: 'btn primary', onclick: () => go('#/collection/pokemon/new') }, t('box.add')))));
  };
  const chip = (label, key) => h('button', { class: 'chip btnlike', 'aria-pressed': 'false', onclick: (e) => { f[key] = !f[key]; e.currentTarget.classList.toggle('active', f[key]); e.currentTarget.setAttribute('aria-pressed', String(f[key])); draw(); } }, label);
  left.append(h('div', { class: 'dex-toolbar' },
    h('div', { class: 'search' }, icon('search'), h('input', { class: 'input', type: 'search', placeholder: translateUI('ui.b272_collection_006'), 'aria-label': translateUI('ui.b272_collection_007'), oninput: debounce((e) => { f.q = e.target.value; draw(); }, 120) })),
    h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': translateUI('ui.b272_collection_063'), onchange: (e) => { f.run = e.target.value; draw(); } }, h('option', { value: '' }, translateUI('ui.b272_collection_008')),
      data.runs.map((r) => h('option', { value: r.id }, r.display))),
    h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': translateUI('ui.status'), onchange: (e) => { f.status = e.target.value; draw(); } },
      [['all', translateUI('ui.b272_collection_009')], ...STATUS].map(([v, l]) => h('option', { value: v, selected: v === 'kept' ? 'selected' : null }, uiLabel(l)))),
    chip(translateUI('ui.b272_collection_057'), 'shiny'), chip(translateUI('ui.b272_collection_059'), 'alpha'), count), h('div', { class: 'dex-scroll' }, grid));
  layout.append(left);
  draw();
  if (sel || isNew) {
    const pane = h('div', { class: 'dex-detail' });
    layout.append(pane);
    const entry = sel ? data.entries.find((e) => e.id === sel) || await get('/api/box/' + sel).catch(() => null) : { species_id: Number(route.query.get('species')) || null, ivs: {}, evs: {}, moves: [], tags: [], status: 'kept', showcase_ok: true, gender: 'unknown' };
    if (!entry) { mount(pane, notice('bad', translateUI('ui.b272_collection_010'))); return; }
    await boxEditor(pane, entry, { runs: data.runs, species: sp, onSaved: (e) => go('#/collection/pokemon/' + e.id), onClose: () => go('#/collection') });
  }
  unsub.push(on('box', (d, ev) => { if (ev.origin !== WINDOW_ID) render(el, route); }));
}

async function boxEditor(pane, e, { runs, species, onSaved, onClose }) {
  if (!natures) natures = (await get('/api/tools/natures').catch(() => ({ natures: [] }))).natures || [];
  const v = JSON.parse(JSON.stringify(e));
  v.ivs ||= {}; v.evs ||= {}; v.moves ||= [];
  const err = h('div', { class: 'small', style: { color: 'var(--bad)' }, role: 'alert' });
  const field = (label, input, hint) => h('div', { class: 'field' }, h('label', null, label), input, hint ? h('div', { class: 'tiny muted' }, hint) : null);
  const txt = (k, ph, max) => h('input', { class: 'input', value: v[k] || '', placeholder: ph || '', maxlength: max || 80, oninput: (ev) => { v[k] = ev.target.value; } });
  const num = (obj, k, lo, hi, w = '64px') => h('input', { class: 'input', type: 'number', min: lo, max: hi, value: obj[k] ?? '', style: { width: w }, 'aria-label': k,
    oninput: (ev) => { obj[k] = ev.target.value === '' ? null : Number(ev.target.value); evTotal(); } });
  const sel = (k, opts) => h('select', { class: 'input', onchange: (ev) => { v[k] = ev.target.value; } }, opts.map(([a, b]) => h('option', { value: a, selected: (v[k] || '') === a ? 'selected' : null }, uiLabel(b))));
  const check = (k, label) => h('label', { class: 'chip btnlike' + (v[k] ? ' active' : '') }, h('input', { type: 'checkbox', class: 'check', checked: !!v[k], onchange: (ev) => { v[k] = ev.target.checked; ev.target.parentElement.classList.toggle('active', v[k]); } }), label);
  const spInput = h('input', { class: 'input', list: 'box-species', value: v.species_id ? `${speciesLabel(v.species_id, species.find((s) => s.id === v.species_id)?.name)} #${pad3(v.species_id)}` : '', placeholder: translateUI('ui.species'), 'aria-label': translateUI('ui.species'),
    onchange: (ev) => { const m = ev.target.value.match(/#?(\d{1,3})\s*$/); const byName = findSpecies(species, ev.target.value);
      v.species_id = m ? Number(m[1]) : byName ? byName.id : null; } });
  const dl = h('datalist', { id: 'box-species' }, species.map((s) => h('option', { value: `${speciesLabel(s.id, s.name)} #${pad3(s.id)}` })));
  const evTot = h('span', { class: 'tiny muted' });
  const evTotal = () => { const s = STATS.reduce((a, [k]) => a + (v.evs[k] || 0), 0); evTot.textContent = translateUI('ui.b272_stats_ev_total', { count: number(s) }); evTot.style.color = s > 510 ? 'var(--bad)' : ''; };
  const photo = h('div', { class: 'row' });
  const drawPhoto = () => mount(photo, v.media_id ? h('img', { src: '/media/' + v.media_id, alt: translateUI('ui.b272_collection_011'), style: { maxWidth: '160px', maxHeight: '120px', borderRadius: '6px' } }) : null,
    h('button', { class: 'btn small', onclick: async () => { const file = await pickFile('image/png,image/jpeg,image/gif,image/webp'); if (!file) return;
      try { const m = await post('/api/media', { filename: file.name, data_b64: await fileToBase64(file) }); v.media_id = m.id; drawPhoto(); } catch (x) { toast(x.message, { kind: 'warn' }); } } }, v.media_id ? translateUI('ui.b272_collection_012') : translateUI('ui.b272_collection_013')),
    v.media_id ? h('button', { class: 'btn ghost small', onclick: () => { v.media_id = null; drawPhoto(); } }, t('common.remove')) : null);
  drawPhoto();
  const save = async () => {
    err.textContent = '';
    try {
      const body = { ...v, tags: typeof v.tags === 'string' ? v.tags : (v.tags || []).join(','), moves: v.moves.filter(Boolean) };
      const r = e.id ? await api('PUT', '/api/box/' + e.id, body) : await post('/api/box', body);
      toast(t('common.saved')); onSaved(r);
    } catch (x) { err.textContent = x.message; }
  };
  mount(pane, h('div', { class: 'detail-head' }, h('div', { class: 'art' }, e.front || e.icon ? h('img', { class: 'pixel', src: e.front || e.icon, alt: '', width: 96, height: 96 }) : icon('box')),
    h('div', { class: 'grow' }, h('div', { class: 'row' }, h('span', { class: 'muted' }, e.id ? translateUI('ui.b272_collection_014') : t('box.add')), h('span', { class: 'grow' }),
      h('button', { class: 'icon-btn', title: t('common.close'), 'aria-label': t('common.close'), onclick: onClose }, icon('close'))),
    h('h2', null, e.nickname || speciesLabel(e.species_id, e.species_name) || t('box.add')), e.species_id ? h('a', { href: '#/pokedex/' + e.species_id }, translateUI('ui.pokedex_open')) : null)),
  h('div', { class: 'detail-body stack' },
    h('div', { class: 'grid-2' }, field(translateUI('ui.species'), h('div', null, spInput, dl)), field(translateUI('ui.b272_collection_069'), txt('nickname', '', 24))),
    h('div', { class: 'row wrap' }, check('shiny', translateUI('ui.b272_collection_057')), check('secret_shiny', translateUI('ui.b272_collection_058')), check('alpha', translateUI('ui.b272_collection_059')), check('showcase_ok', translateUI('ui.b272_collection_015'))),
    h('div', { class: 'grid-3' }, field(translateUI('ui.level'), num(v, 'level', 1, 100, '100%')), field(translateUI('ui.gender'), sel('gender', [['unknown', '—'], ['male', translateUI('ui.b272_collection_060')], ['female', translateUI('ui.b272_collection_061')], ['genderless', translateUI('ui.b272_collection_062')]])),
      field(translateUI('ui.nature'), sel('nature', [['', '—'], ...natures.map((n) => [n.name, gameTerm('nature', n.name) + (n.up ? ` (+${n.up} −${n.down})` : '')])]))),
    h('div', { class: 'grid-2' }, field(translateUI('ui.ability'), txt('ability', '', 40)), field(translateUI('ui.form'), txt('form', translateUI('ui.b272_collection_016'), 40))),
    h('div', { class: 'stack tight' }, h('span', { class: 'label' }, translateUI('ui.b272_collection_017')),
      h('div', { class: 'iv-grid', style: { gridTemplateColumns: '44px repeat(6, minmax(0,1fr))' } }, h('span'), STATS.map(([, l]) => h('span', { class: 'tiny muted', style: { textAlign: 'center' } }, l)),
        h('span', { class: 'tiny' }, 'IV'), STATS.map(([k]) => num(v.ivs, k, 0, 31, '100%')), h('span', { class: 'tiny' }, 'EV'), STATS.map(([k]) => num(v.evs, k, 0, 252, '100%'))), evTot),
    h('div', { class: 'stack tight' }, h('span', { class: 'label' }, translateUI('ui.b272_collection_018')), h('div', { class: 'grid-2' }, [0, 1, 2, 3].map((i) =>
      h('input', { class: 'input', value: v.moves[i] || '', maxlength: 40, placeholder: translateUI('ui.b272_collection_095', { index: i + 1 }), oninput: (ev) => { v.moves[i] = ev.target.value; } })))),
    h('div', { class: 'grid-3' }, field(translateUI('ui.b272_collection_019'), h('input', { class: 'input', type: 'date', value: v.obtained_date || '', onchange: (ev) => { v.obtained_date = ev.target.value; } })),
      field(translateUI('ui.method'), sel('method', METHODS)), field(translateUI('ui.b272_collection_020'), num(v, 'encounter_count', 0, 10000000, '100%'))),
    h('div', { class: 'grid-3' }, field(translateUI('ui.region'), sel('region', REGIONS.map((r) => [r, r ? gameTerm('region', cap(r)) : '—']))), field(translateUI('ui.location'), txt('location', translateUI('ui.b272_collection_021'), 80)), field('OT', txt('ot', '', 24))),
    h('div', { class: 'grid-2' }, field(translateUI('ui.select_character'), h('select', { class: 'input', onchange: (ev) => { v.run_id = ev.target.value || null; } }, h('option', { value: '' }, '—'),
      runs.map((r) => h('option', { value: r.id, selected: v.run_id === r.id ? 'selected' : null }, r.display)))), field(translateUI('ui.catch_status'), sel('status', STATUS))),
    field(t('common.tags'), h('input', { class: 'input', value: (v.tags || []).join(', '), placeholder: translateUI('ui.b272_collection_022'), oninput: (ev) => { v.tags = ev.target.value; } })),
    field(translateUI('ui.notes'), h('textarea', { class: 'input', rows: 3, maxlength: 5000, oninput: (ev) => { v.notes = ev.target.value; } }, v.notes || '')),
    h('div', { class: 'stack tight' }, h('span', { class: 'label' }, translateUI('ui.b272_collection_023')), photo, h('div', { class: 'tiny muted' }, translateUI('ui.b272_collection_024'))),
    err,
    h('div', { class: 'row wrap' }, h('button', { class: 'btn primary', onclick: save }, t('common.save')), h('button', { class: 'btn ghost', onclick: onClose }, t('common.cancel')), h('span', { class: 'grow' }),
      e.id ? h('button', { class: 'btn ghost', title: translateUI('ui.b272_collection_025'), onclick: () => syncDialog(e, runs) }, translateUI('ui.b272_collection_026')) : null,
      e.id ? h('button', { class: 'btn danger ghost', onclick: async () => { if (!(await confirmDialog(translateUI('ui.b272_collection_027'), translateUI('ui.b272_collection_028'), 'Remove', true))) return;
        await api('DELETE', '/api/box/' + e.id); toast(translateUI('ui.entry_removed'), { action: { label: t('common.restore'), fn: async () => { await post(`/api/box/${e.id}/restore`); onSaved(e); } } }); onClose(); } }, icon('trash'), t('common.remove')) : null),
    e.id ? linkedNotes('owned', e.id, e.nickname || speciesLabel(e.species_id, e.species_name)) : null));
  evTotal();
}

async function syncDialog(e, runs) {
  if (!runs.length) { toast(translateUI('ui.b272_collection_029'), { kind: 'warn' }); return; }
  const runSel = h('select', { class: 'input' }, runs.map((r) => h('option', { value: r.id, selected: r.id === e.run_id ? 'selected' : null }, r.display)));
  const stSel = h('select', { class: 'input' }, [['caught_ot', 'Caught OT'], ['owned', 'Owned'], ['seen', 'Seen']].map(([a, b]) => h('option', { value: a }, uiLabel(b))));
  const { modal } = await import('../core.js');
  const ok = await modal({ title: translateUI('ui.b272_collection_030'), body: h('div', { class: 'stack tight' }, h('p', { class: 'small', style: { margin: 0 } },
    translateUI('ui.b272_collection_096', { species: speciesLabel(e.species_id, e.species_name) })),
  h('label', { class: 'label' }, translateUI('ui.select_character')), runSel, h('label', { class: 'label' }, translateUI('ui.status')), stSel),
  actions: [{ label: t('common.cancel'), kind: 'ghost', value: false }, { label: 'Copy', kind: 'primary', value: true }] });
  if (!ok) return;
  const r = await post(`/api/box/${e.id}/sync-dex`, { run_id: runSel.value, status: stSel.value });
  toast(translateUI('ui.b272_collection_031'), { action: { label: 'Undo', fn: async () => {
    await api('PUT', `/api/dex/progress/${runSel.value}/${r.species_id}`, r.previous || { status: 'unregistered' }); toast(translateUI('ui.b272_collection_032')); } } });
}

// --------------------------------------------------------------- Box popout
export async function renderBoxPopout(el, mode) {
  const data = await get('/api/box');
  const m = location.hash.match(/^#\/owned\/([0-9a-f]{12})/);
  if (m) {
    const e = data.entries.find((x) => x.id === m[1]);
    if (!e) { location.hash = '#/'; return; }
    mount(el, h('button', { class: 'btn ghost small', onclick: () => { location.hash = '#/'; } }, icon('back'), t('common.back')),
      h('div', { class: 'stack tight', style: { marginTop: '6px' } }, h('div', { class: 'row' }, h('img', { class: 'pixel', src: e.front || e.icon, width: 96, height: 96, alt: '' }),
        h('div', null, h('h2', { style: { margin: 0 } }, e.nickname || speciesLabel(e.species_id, e.species_name)), h('div', { class: 'small muted' }, speciesLabel(e.species_id, e.species_name), ' ', marks(e)))),
      h('div', { class: 'small' }, [e.level ? `Lv ${e.level}` : null, gameTerm('nature', e.nature), gameTerm('ability', e.ability)].filter(Boolean).join(' · ') || '—'),
      e.iv_total != null ? h('div', { class: 'small' }, 'IVs ', STATS.map(([k, l]) => `${l} ${e.ivs[k] ?? '—'}`).join(' · ')) : null,
      (e.moves || []).length ? h('div', { class: 'small' }, translateUI('ui.moves') + ': ', e.moves.map(move => gameTerm('move', move)).join(', ')) : null,
      e.location ? h('div', { class: 'small muted' }, [e.location, e.region && gameTerm('region', cap(e.region)), e.obtained_date].filter(Boolean).join(' · ')) : null,
      h('button', { class: 'btn small', onclick: () => openRoute('#/collection/pokemon/' + e.id) }, t('common.open_main'))));
    return;
  }
  const kept = data.entries.filter((e) => e.status === 'kept');
  mount(el, kept.length ? h('div', { class: 'box-grid' + (mode === 'compact' ? ' compact' : '') }, kept.map((e) => boxCard(e, (x) => { location.hash = '#/owned/' + x.id; }))) :
    h('div', { class: 'empty' }, translateUI('ui.b272_collection_033'), h('button', { class: 'btn small', onclick: () => openRoute('#/collection/pokemon/new') }, t('box.add'))));
}

// --------------------------------------------------------------- Showcase
export function showcaseView(sc, { mode = 'standard', index = 0 } = {}) {
  const o = sc.options;
  const items = sc.items || [];
  const wrap = h('div', { class: `showcase sc-${sc.template} sc-bg-${o.background} sc-motion-${o.motion}`, style: { '--sc-alpha': String((o.bg_opacity ?? 85) / 100), '--sc-cols': String(o.columns || 4) } },
    o.title ? h('div', { class: 'sc-title' }, o.title) : null);
  const line = (it) => [it.nickname, it.level ? `Lv ${it.level}` : null, gameTerm('nature', it.nature), it.iv_total != null ? `IV ${it.iv_total}` : null,
    it.encounter_count != null ? translateUI('ui.b272_collection_097', { count: number(it.encounter_count) }) : null, it.method ? uiLabel(METHODS.find(([id]) => id === it.method)?.[1] || cap(it.method)) : null, it.location, it.date, it.ot ? 'OT ' + it.ot : null].filter(Boolean);
  const card = (it, big) => h('div', { class: 'sc-item' + (big ? ' big' : '') },
    h('div', { class: 'sc-sprite' }, h('img', { class: 'pixel', src: (big || o.big_sprites) && it.front ? it.front : it.icon || it.front, alt: speciesLabel(it.species_id, it.species_name), width: big ? 160 : o.big_sprites ? 96 : 48, height: big ? 160 : o.big_sprites ? 96 : 48 }),
      h('span', { class: 'sc-marks' }, it.shiny ? '✦' : '', it.alpha ? ' α' : '')),
    sc.template !== 'minimal' ? h('div', { class: 'sc-name' }, it.nickname || speciesLabel(it.species_id, it.species_name)) : null,
    sc.template !== 'minimal' && line(it).length > (it.nickname ? 1 : 0) ? h('div', { class: 'sc-line' }, line(it).filter((x) => x !== it.nickname).join(' · ')) : null);
  if (!items.length) wrap.append(h('div', { class: 'sc-empty' }, translateUI('ui.b272_collection_034')));
  else if (sc.template === 'featured') {
    const it = items[((index % items.length) + items.length) % items.length];
    wrap.append(card(it, true), items.length > 1 ? h('div', { class: 'sc-dots', 'aria-hidden': 'true' }, items.map((_, i) => h('span', { class: i === index % items.length ? 'on' : '' }))) : null);
  } else wrap.append(h('div', { class: 'sc-grid' }, items.map((it) => card(it, false))));
  void mode;
  return wrap;
}

export async function renderShowcasePage(el, route) {
  dispose();
  const [list, box] = await Promise.all([get('/api/showcases'), get('/api/box')]);
  const selId = route.parts[1] || list.active || (list.showcases[0] && list.showcases[0].id);
  const page = h('div', { class: 'page' });
  mount(el, page);
  page.append(collectionHead('showcases', [h('button', { class: 'btn primary', onclick: async () => { const sc = await post('/api/showcases', { name: translateUI('ui.b272_collection_035') }); go('#/collection/showcases/' + sc.id); } }, icon('plus'), t('common.new')),
    pinButton({ kind: 'tool', id: 'showcase' }), popoutButton('showcase')]));
  if (!list.showcases.length) { page.append(h('div', { class: 'empty' }, h('h3', null, translateUI('ui.b272_collection_036')), h('p', null, box.entries.length ? translateUI('ui.b272_collection_037') : translateUI('ui.b272_collection_038')),
    h('button', { class: 'btn', onclick: () => go(box.entries.length ? '#/collection/showcases' : '#/collection/pokemon/new') }, box.entries.length ? translateUI('ui.b272_collection_039') : t('box.add')))); return; }
  const sc = await get('/api/showcases/' + selId).catch(() => null) || await get('/api/showcases/' + list.showcases[0].id);
  const v = { name: sc.name, template: sc.template, entries: [...sc.entries], options: JSON.parse(JSON.stringify(sc.options)) };
  const preview = h('div', { class: 'sc-preview' });
  let idx = 0;
  const redraw = async () => { const cur = await get('/api/showcases/' + sc.id); mount(preview, showcaseView(cur, { index: idx })); };
  const save = debounce(async () => { try { await api('PUT', '/api/showcases/' + sc.id, v); redraw(); } catch (x) { toast(x.message, { kind: 'warn' }); } }, 300);
  const sw = (key, label) => h('label', { class: 'chip btnlike' + (v.options.show[key] ? ' active' : '') }, h('input', { type: 'checkbox', class: 'check', checked: !!v.options.show[key],
    onchange: (e) => { v.options.show[key] = e.target.checked; e.target.parentElement.classList.toggle('active', e.target.checked); save(); } }), label);
  const eligible = box.entries.filter((e) => e.showcase_ok);
  page.append(h('div', { class: 'grid-2', style: { gridTemplateColumns: 'minmax(280px, 380px) 1fr', alignItems: 'start' } },
    h('div', { class: 'card stack tight' },
      h('select', { class: 'input', 'aria-label': translateUI('ui.b272_collection_064'), onchange: (e) => go('#/collection/showcases/' + e.target.value) }, list.showcases.map((x) => h('option', { value: x.id, selected: x.id === sc.id ? 'selected' : null }, x.name))),
      h('label', { class: 'label' }, translateUI('ui.name')), h('input', { class: 'input', value: v.name, maxlength: 80, oninput: (e) => { v.name = e.target.value; save(); } }),
      h('label', { class: 'label' }, translateUI('ui.b272_collection_040')), h('input', { class: 'input', value: v.options.title || '', maxlength: 80, oninput: (e) => { v.options.title = e.target.value; save(); } }),
      h('label', { class: 'label' }, translateUI('ui.b272_collection_065')), h('select', { class: 'input', onchange: (e) => { v.template = e.target.value; save(); } },
        [['grid', 'Grid'], ['minimal', translateUI('ui.b272_collection_041')], ['featured', translateUI('ui.b272_collection_042')]].map(([a, b]) => h('option', { value: a, selected: v.template === a ? 'selected' : null }, uiLabel(b)))),
      h('div', { class: 'row wrap' }, h('label', { class: 'label' }, translateUI('ui.b272_collection_066')), h('input', { class: 'input', type: 'number', min: 1, max: 10, value: v.options.columns, style: { width: '70px' }, onchange: (e) => { v.options.columns = Number(e.target.value); save(); } }),
        h('label', { class: 'label' }, translateUI('ui.b272_collection_043')), h('input', { class: 'input', type: 'number', min: 0, max: 600, value: v.options.cycle_seconds, style: { width: '70px' }, onchange: (e) => { v.options.cycle_seconds = Number(e.target.value); save(); } })),
      h('div', { class: 'row wrap' }, h('label', { class: 'label' }, t('common.background')), h('select', { class: 'input', style: { width: 'auto' }, onchange: (e) => { v.options.background = e.target.value; save(); } },
        [['panel', 'Panel'], ['dark', 'Dark'], ['light', 'Light'], ['transparent', 'Transparent']].map(([a, b]) => h('option', { value: a, selected: v.options.background === a ? 'selected' : null }, uiLabel(b)))),
      h('input', { type: 'range', min: 0, max: 100, value: v.options.bg_opacity, 'aria-label': translateUI('ui.background_opacity'), oninput: (e) => { v.options.bg_opacity = Number(e.target.value); save(); } })),
      h('div', { class: 'row wrap' }, h('label', { class: 'label' }, translateUI('ui.b272_collection_067')), h('select', { class: 'input', style: { width: 'auto' }, onchange: (e) => { v.options.motion = e.target.value; save(); } },
        [['none', translateUI('ui.none')], ['float', translateUI('ui.b272_collection_044')], ['sheen', translateUI('ui.b272_collection_045')]].map(([a, b]) => h('option', { value: a, selected: v.options.motion === a ? 'selected' : null }, b))),
      h('label', { class: 'chip btnlike' + (v.options.big_sprites ? ' active' : '') }, h('input', { type: 'checkbox', class: 'check', checked: v.options.big_sprites, onchange: (e) => { v.options.big_sprites = e.target.checked; save(); } }), translateUI('ui.b272_collection_046'))),
      h('span', { class: 'label' }, translateUI('ui.b272_collection_047')), h('div', { class: 'row wrap' }, sw('nickname', translateUI('ui.b272_collection_069')), sw('level', translateUI('ui.level')), sw('nature', translateUI('ui.nature')), sw('ivs', 'IVs'),
        sw('encounter_count', translateUI('ui.b272_collection_092')), sw('method', translateUI('ui.method')), sw('location', translateUI('ui.location')), sw('date', translateUI('ui.b272_collection_093')), sw('ot', 'OT')),
      h('span', { class: 'label' }, translateUI('ui.b272_collection_098', { count: number(v.entries.length) })),
      eligible.length ? h('div', { class: 'stack tight sc-pick', style: { maxHeight: '260px', overflow: 'auto' } }, eligible.map((e) => h('label', { class: 'row' },
        h('input', { type: 'checkbox', class: 'check', checked: v.entries.includes(e.id), onchange: (ev) => { v.entries = ev.target.checked ? [...v.entries, e.id] : v.entries.filter((x) => x !== e.id); save(); } }),
        h('img', { class: 'pixel', src: e.icon, width: 28, height: 28, alt: '' }), h('span', { class: 'small' }, (e.nickname || speciesLabel(e.species_id, e.species_name)) + (e.shiny ? ' ✦' : '') + (e.alpha ? ' α' : ''))))) :
        h('div', { class: 'small muted' }, translateUI('ui.b272_collection_048')),
      h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: async () => { await saveSettings({ 'showcase.active': sc.id }); toast(translateUI('ui.b272_collection_049')); } }, translateUI('ui.b272_collection_050')),
        h('span', { class: 'grow' }), h('button', { class: 'btn danger ghost small', onclick: async () => { if (await confirmDialog(translateUI('ui.b272_collection_051'), translateUI('ui.b272_collection_052'), t('common.delete'), true)) { await api('DELETE', '/api/showcases/' + sc.id); go('#/collection/showcases'); } } }, t('common.delete')))),
    h('div', { class: 'stack tight' }, h('div', { class: 'row' }, h('span', { class: 'label' }, translateUI('ui.b272_collection_068')), h('span', { class: 'grow' }),
      v.template === 'featured' ? [h('button', { class: 'btn ghost small', onclick: () => { idx -= 1; redraw(); } }, '‹'), h('button', { class: 'btn ghost small', onclick: () => { idx += 1; redraw(); } }, '›')] : null), preview)));
  redraw();
}

export async function renderShowcasePopout(el, mode) {
  const list = await get('/api/showcases');
  const id = setting('showcase.active') || (list.showcases[0] && list.showcases[0].id);
  if (!id) { mount(el, h('div', { class: 'empty' }, translateUI('ui.b272_collection_053'), h('button', { class: 'btn small', onclick: () => openRoute('#/collection/showcases') }, translateUI('ui.b272_collection_054')))); return; }
  let sc;
  try { sc = await get('/api/showcases/' + id); } catch (_) { sc = await get('/api/showcases/' + list.showcases[0].id); }
  let idx = 0;
  const draw = () => mount(el, showcaseView(sc, { mode, index: idx }));
  draw();
  if (sc.template === 'featured' && sc.options.cycle_seconds && (sc.items || []).length > 1) {
    const timer = setInterval(() => { if (!el.isConnected) { clearInterval(timer); return; } idx += 1; draw(); }, sc.options.cycle_seconds * 1000);
  }
  el.onkeydown = (e) => { if (e.key === 'ArrowRight') { idx += 1; draw(); } if (e.key === 'ArrowLeft') { idx -= 1; draw(); } };
}
