// My Box (curated individual Pokémon, docs/design/18 §3) and Showcase (§4).
// Nothing here is read from the game; nothing updates the Pokédex registration unless you press
// “Copy to Pokédex registration” (with undo).
import { h, mount, icon, get, api, post, setting, saveSettings, on, notice, debounce, toast, pad3, cap, confirmDialog, WINDOW_ID, spriteOrFallback } from '../core.js';
import { go, popoutButton, pinButton } from '../shell.js';
import { speciesIndex } from '../components.js';
import { t } from '../i18n.js';
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
  return [e.shiny ? h('span', { class: 'mk shiny', title: 'Shiny' }, '✦') : null, e.secret_shiny ? h('span', { class: 'mk', title: 'Secret shiny' }, '✧') : null,
    e.alpha ? h('span', { class: 'mk alpha', title: 'Alpha' }, 'α') : null];
}
export function boxCard(e, onOpen, selected) {
  return h('button', { class: 'box-card' + (selected ? ' selected' : '') + (e.status !== 'kept' ? ' faded' : ''), dataset: { id: e.id }, onclick: () => onOpen(e),
    'aria-label': `${e.nickname || e.species_name}${e.shiny ? ', shiny' : ''}${e.alpha ? ', alpha' : ''}` },
  h('div', { class: 'bc-sprite' }, spriteOrFallback(e.icon, { id: e.species_id, name: e.species_name, types: [] }, 48)),
  h('div', { class: 'bc-name ellipsis' }, e.nickname || e.species_name), h('div', { class: 'tiny muted ellipsis' }, e.nickname ? e.species_name : `#${pad3(e.species_id)}`),
  h('div', { class: 'bc-marks' }, marks(e), e.iv_total != null ? h('span', { class: 'tiny muted' }, `IV ${e.iv_total}`) : null));
}

/** Collection = My Pokémon (your manually recorded entries; nothing is imported from the Pokédex) + Showcases.
 *  Same records, APIs and popouts as the former My Box and Showcase pages; their old routes redirect here. */
function collectionHead(active, actions, style) {
  const tab = (id, label, route) => h('button', { role: 'tab', class: 'tab' + (active === id ? ' active' : ''), 'aria-selected': String(active === id), onclick: () => go(route) }, label);
  return h('div', { class: 'page-head collection-head', style },
    h('div', null, h('h1', null, t('collection.title')),
      h('div', { class: 'sub' }, active === 'pokemon' ? 'Only the Pokémon you choose to record — not your whole PC or Pokédex. Entered by you; never read from the game.'
        : 'Pick recorded Pokémon to display. Sensitive details (OT, IVs, encounter counts) stay hidden unless you switch them on.'),
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
    const list = data.entries.filter((e) => (!q || (e.nickname || '').toLowerCase().includes(q) || e.species_name.toLowerCase().includes(q) || (e.tags || []).some((x) => x.includes(q))) &&
      (!f.run || e.run_id === f.run) && (!f.shiny || e.shiny) && (!f.alpha || e.alpha) && (f.status === 'all' || e.status === f.status));
    count.textContent = `${list.length} of ${data.entries.length}`;
    mount(grid, list.length ? list.map((e) => boxCard(e, (x) => go('#/collection/pokemon/' + x.id), e.id === sel)) :
      h('div', { class: 'empty', style: { gridColumn: '1/-1' } }, data.entries.length ? 'No entries match.' : h('div', null, h('h3', null, 'Your Box is empty'),
        h('p', null, 'Add a Pokémon you want to remember — a shiny, a breeding parent, a competitive build.'), h('button', { class: 'btn primary', onclick: () => go('#/collection/pokemon/new') }, t('box.add')))));
  };
  const chip = (label, key) => h('button', { class: 'chip btnlike', 'aria-pressed': 'false', onclick: (e) => { f[key] = !f[key]; e.currentTarget.classList.toggle('active', f[key]); e.currentTarget.setAttribute('aria-pressed', String(f[key])); draw(); } }, label);
  left.append(h('div', { class: 'dex-toolbar' },
    h('div', { class: 'search' }, icon('search'), h('input', { class: 'input', type: 'search', placeholder: 'Nickname, species or tag', 'aria-label': 'Search Box', oninput: debounce((e) => { f.q = e.target.value; draw(); }, 120) })),
    h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': 'Character run', onchange: (e) => { f.run = e.target.value; draw(); } }, h('option', { value: '' }, 'All characters'),
      data.runs.map((r) => h('option', { value: r.id }, r.display))),
    h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': 'Status', onchange: (e) => { f.status = e.target.value; draw(); } },
      [['all', 'Any status'], ...STATUS].map(([v, l]) => h('option', { value: v, selected: v === 'kept' ? 'selected' : null }, l))),
    chip('✦ Shiny', 'shiny'), chip('α Alpha', 'alpha'), count), h('div', { class: 'dex-scroll' }, grid));
  layout.append(left);
  draw();
  if (sel || isNew) {
    const pane = h('div', { class: 'dex-detail' });
    layout.append(pane);
    const entry = sel ? data.entries.find((e) => e.id === sel) || await get('/api/box/' + sel).catch(() => null) : { species_id: Number(route.query.get('species')) || null, ivs: {}, evs: {}, moves: [], tags: [], status: 'kept', showcase_ok: true, gender: 'unknown' };
    if (!entry) { mount(pane, notice('bad', 'Entry not found')); return; }
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
  const sel = (k, opts) => h('select', { class: 'input', onchange: (ev) => { v[k] = ev.target.value; } }, opts.map(([a, b]) => h('option', { value: a, selected: (v[k] || '') === a ? 'selected' : null }, b)));
  const check = (k, label) => h('label', { class: 'chip btnlike' + (v[k] ? ' active' : '') }, h('input', { type: 'checkbox', class: 'check', checked: !!v[k], onchange: (ev) => { v[k] = ev.target.checked; ev.target.parentElement.classList.toggle('active', v[k]); } }), label);
  const spInput = h('input', { class: 'input', list: 'box-species', value: v.species_id ? `${species.find((s) => s.id === v.species_id)?.name || ''} #${pad3(v.species_id)}` : '', placeholder: 'Species', 'aria-label': 'Species',
    onchange: (ev) => { const m = ev.target.value.match(/#?(\d{1,3})\s*$/); const byName = species.find((s) => s.name.toLowerCase() === ev.target.value.trim().toLowerCase());
      v.species_id = m ? Number(m[1]) : byName ? byName.id : null; } });
  const dl = h('datalist', { id: 'box-species' }, species.map((s) => h('option', { value: `${s.name} #${pad3(s.id)}` })));
  const evTot = h('span', { class: 'tiny muted' });
  const evTotal = () => { const s = STATS.reduce((a, [k]) => a + (v.evs[k] || 0), 0); evTot.textContent = `EV total ${s} / 510`; evTot.style.color = s > 510 ? 'var(--bad)' : ''; };
  const photo = h('div', { class: 'row' });
  const drawPhoto = () => mount(photo, v.media_id ? h('img', { src: '/media/' + v.media_id, alt: 'Your screenshot', style: { maxWidth: '160px', maxHeight: '120px', borderRadius: '6px' } }) : null,
    h('button', { class: 'btn small', onclick: async () => { const file = await pickFile('image/png,image/jpeg,image/gif,image/webp'); if (!file) return;
      try { const m = await post('/api/media', { filename: file.name, data_b64: await fileToBase64(file) }); v.media_id = m.id; drawPhoto(); } catch (x) { toast(x.message, { kind: 'warn' }); } } }, v.media_id ? 'Replace picture' : 'Attach your screenshot'),
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
    h('div', { class: 'grow' }, h('div', { class: 'row' }, h('span', { class: 'muted' }, e.id ? 'Box entry' : t('box.add')), h('span', { class: 'grow' }),
      h('button', { class: 'icon-btn', title: t('common.close'), 'aria-label': t('common.close'), onclick: onClose }, icon('close'))),
    h('h2', null, e.nickname || e.species_name || t('box.add')), e.species_id ? h('a', { href: '#/pokedex/' + e.species_id }, 'Open in Pokédex') : null)),
  h('div', { class: 'detail-body stack' },
    h('div', { class: 'grid-2' }, field('Species', h('div', null, spInput, dl)), field('Nickname', txt('nickname', '', 24))),
    h('div', { class: 'row wrap' }, check('shiny', '✦ Shiny'), check('secret_shiny', '✧ Secret shiny'), check('alpha', 'α Alpha'), check('showcase_ok', 'Allow in Showcase')),
    h('div', { class: 'grid-3' }, field('Level', num(v, 'level', 1, 100, '100%')), field('Gender', sel('gender', [['unknown', '—'], ['male', '♂ Male'], ['female', '♀ Female'], ['genderless', 'Genderless']])),
      field('Nature', sel('nature', [['', '—'], ...natures.map((n) => [n.name, n.name + (n.up ? ` (+${n.up} −${n.down})` : '')])]))),
    h('div', { class: 'grid-2' }, field('Ability', txt('ability', '', 40)), field('Form', txt('form', 'e.g. Heat Rotom, costume', 40))),
    h('div', { class: 'stack tight' }, h('span', { class: 'label' }, 'IVs (0–31) · EVs (0–252, 510 total)'),
      h('div', { class: 'iv-grid', style: { gridTemplateColumns: '44px repeat(6, minmax(0,1fr))' } }, h('span'), STATS.map(([, l]) => h('span', { class: 'tiny muted', style: { textAlign: 'center' } }, l)),
        h('span', { class: 'tiny' }, 'IV'), STATS.map(([k]) => num(v.ivs, k, 0, 31, '100%')), h('span', { class: 'tiny' }, 'EV'), STATS.map(([k]) => num(v.evs, k, 0, 252, '100%'))), evTot),
    h('div', { class: 'stack tight' }, h('span', { class: 'label' }, 'Moves (up to 4)'), h('div', { class: 'grid-2' }, [0, 1, 2, 3].map((i) =>
      h('input', { class: 'input', value: v.moves[i] || '', maxlength: 40, placeholder: `Move ${i + 1}`, oninput: (ev) => { v.moves[i] = ev.target.value; } })))),
    h('div', { class: 'grid-3' }, field('Obtained', h('input', { class: 'input', type: 'date', value: v.obtained_date || '', onchange: (ev) => { v.obtained_date = ev.target.value; } })),
      field('Method', sel('method', METHODS)), field('Encounters (your count)', num(v, 'encounter_count', 0, 10000000, '100%'))),
    h('div', { class: 'grid-3' }, field('Region', sel('region', REGIONS.map((r) => [r, r ? cap(r) : '—']))), field('Location', txt('location', 'e.g. Route 119', 80)), field('OT', txt('ot', '', 24))),
    h('div', { class: 'grid-2' }, field('Character', h('select', { class: 'input', onchange: (ev) => { v.run_id = ev.target.value || null; } }, h('option', { value: '' }, '—'),
      runs.map((r) => h('option', { value: r.id, selected: v.run_id === r.id ? 'selected' : null }, r.display)))), field('Status', sel('status', STATUS))),
    field(t('common.tags'), h('input', { class: 'input', value: (v.tags || []).join(', '), placeholder: 'breeder, comp, shiny-hunt', oninput: (ev) => { v.tags = ev.target.value; } })),
    field('Notes', h('textarea', { class: 'input', rows: 3, maxlength: 5000, oninput: (ev) => { v.notes = ev.target.value; } }, v.notes || '')),
    h('div', { class: 'stack tight' }, h('span', { class: 'label' }, 'Picture'), photo, h('div', { class: 'tiny muted' }, 'Stored only in your Companion data folder.')),
    err,
    h('div', { class: 'row wrap' }, h('button', { class: 'btn primary', onclick: save }, t('common.save')), h('button', { class: 'btn ghost', onclick: onClose }, t('common.cancel')), h('span', { class: 'grow' }),
      e.id ? h('button', { class: 'btn ghost', title: 'Explicitly copy this entry into the manual Pokédex registration of a character', onclick: () => syncDialog(e, runs) }, 'Copy to Pokédex registration…') : null,
      e.id ? h('button', { class: 'btn danger ghost', onclick: async () => { if (!(await confirmDialog('Remove from Box?', 'You can restore it right after from the notification.', 'Remove', true))) return;
        await api('DELETE', '/api/box/' + e.id); toast('Removed from Box', { action: { label: t('common.restore'), fn: async () => { await post(`/api/box/${e.id}/restore`); onSaved(e); } } }); onClose(); } }, icon('trash'), t('common.remove')) : null),
    e.id ? linkedNotes('owned', e.id, e.nickname || e.species_name) : null));
  evTotal();
}

async function syncDialog(e, runs) {
  if (!runs.length) { toast('Create a character run in Guides first.', { kind: 'warn' }); return; }
  const runSel = h('select', { class: 'input' }, runs.map((r) => h('option', { value: r.id, selected: r.id === e.run_id ? 'selected' : null }, r.display)));
  const stSel = h('select', { class: 'input' }, [['caught_ot', 'Caught OT'], ['owned', 'Owned'], ['seen', 'Seen']].map(([a, b]) => h('option', { value: a }, b)));
  const { modal } = await import('../core.js');
  const ok = await modal({ title: 'Copy to Pokédex registration', body: h('div', { class: 'stack tight' }, h('p', { class: 'small', style: { margin: 0 } },
    `Sets ${e.species_name} for the chosen character (plus Alpha/Shiny marks from this entry). This only changes your manual registration, and you can undo it.`),
  h('label', { class: 'label' }, 'Character'), runSel, h('label', { class: 'label' }, 'Status'), stSel),
  actions: [{ label: t('common.cancel'), kind: 'ghost', value: false }, { label: 'Copy', kind: 'primary', value: true }] });
  if (!ok) return;
  const r = await post(`/api/box/${e.id}/sync-dex`, { run_id: runSel.value, status: stSel.value });
  toast('Pokédex registration updated', { action: { label: 'Undo', fn: async () => {
    await api('PUT', `/api/dex/progress/${runSel.value}/${r.species_id}`, r.previous || { status: 'unregistered' }); toast('Restored the previous registration'); } } });
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
        h('div', null, h('h2', { style: { margin: 0 } }, e.nickname || e.species_name), h('div', { class: 'small muted' }, e.species_name, ' ', marks(e)))),
      h('div', { class: 'small' }, [e.level ? `Lv ${e.level}` : null, e.nature, e.ability].filter(Boolean).join(' · ') || '—'),
      e.iv_total != null ? h('div', { class: 'small' }, 'IVs ', STATS.map(([k, l]) => `${l} ${e.ivs[k] ?? '—'}`).join(' · ')) : null,
      (e.moves || []).length ? h('div', { class: 'small' }, 'Moves: ', e.moves.join(', ')) : null,
      e.location ? h('div', { class: 'small muted' }, [e.location, e.region && cap(e.region), e.obtained_date].filter(Boolean).join(' · ')) : null,
      h('button', { class: 'btn small', onclick: () => openRoute('#/collection/pokemon/' + e.id) }, t('common.open_main'))));
    return;
  }
  const kept = data.entries.filter((e) => e.status === 'kept');
  mount(el, kept.length ? h('div', { class: 'box-grid' + (mode === 'compact' ? ' compact' : '') }, kept.map((e) => boxCard(e, (x) => { location.hash = '#/owned/' + x.id; }))) :
    h('div', { class: 'empty' }, 'Your Box is empty. ', h('button', { class: 'btn small', onclick: () => openRoute('#/collection/pokemon/new') }, t('box.add'))));
}

// --------------------------------------------------------------- Showcase
export function showcaseView(sc, { mode = 'standard', index = 0 } = {}) {
  const o = sc.options;
  const items = sc.items || [];
  const wrap = h('div', { class: `showcase sc-${sc.template} sc-bg-${o.background} sc-motion-${o.motion}`, style: { '--sc-alpha': String((o.bg_opacity ?? 85) / 100), '--sc-cols': String(o.columns || 4) } },
    o.title ? h('div', { class: 'sc-title' }, o.title) : null);
  const line = (it) => [it.nickname, it.level ? `Lv ${it.level}` : null, it.nature, it.iv_total != null ? `IV ${it.iv_total}` : null,
    it.encounter_count != null ? `${it.encounter_count.toLocaleString()} encounters` : null, it.method ? cap(it.method) : null, it.location, it.date, it.ot ? 'OT ' + it.ot : null].filter(Boolean);
  const card = (it, big) => h('div', { class: 'sc-item' + (big ? ' big' : '') },
    h('div', { class: 'sc-sprite' }, h('img', { class: 'pixel', src: (big || o.big_sprites) && it.front ? it.front : it.icon || it.front, alt: it.species_name, width: big ? 160 : o.big_sprites ? 96 : 48, height: big ? 160 : o.big_sprites ? 96 : 48 }),
      h('span', { class: 'sc-marks' }, it.shiny ? '✦' : '', it.alpha ? ' α' : '')),
    sc.template !== 'minimal' ? h('div', { class: 'sc-name' }, it.nickname || it.species_name) : null,
    sc.template !== 'minimal' && line(it).length > (it.nickname ? 1 : 0) ? h('div', { class: 'sc-line' }, line(it).filter((x) => x !== it.nickname).join(' · ')) : null);
  if (!items.length) wrap.append(h('div', { class: 'sc-empty' }, 'No entries yet — add Box entries to this showcase.'));
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
  page.append(collectionHead('showcases', [h('button', { class: 'btn primary', onclick: async () => { const sc = await post('/api/showcases', { name: 'My showcase' }); go('#/collection/showcases/' + sc.id); } }, icon('plus'), t('common.new')),
    pinButton({ kind: 'tool', id: 'showcase' }), popoutButton('showcase')]));
  if (!list.showcases.length) { page.append(h('div', { class: 'empty' }, h('h3', null, 'No showcases yet'), h('p', null, box.entries.length ? 'Create one and choose entries from your Box.' : 'Add Pokémon to My Box first.'),
    h('button', { class: 'btn', onclick: () => go(box.entries.length ? '#/collection/showcases' : '#/collection/pokemon/new') }, box.entries.length ? 'Create a showcase above' : t('box.add')))); return; }
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
      h('select', { class: 'input', 'aria-label': 'Showcase', onchange: (e) => go('#/collection/showcases/' + e.target.value) }, list.showcases.map((x) => h('option', { value: x.id, selected: x.id === sc.id ? 'selected' : null }, x.name))),
      h('label', { class: 'label' }, 'Name'), h('input', { class: 'input', value: v.name, maxlength: 80, oninput: (e) => { v.name = e.target.value; save(); } }),
      h('label', { class: 'label' }, 'Title shown in the window'), h('input', { class: 'input', value: v.options.title || '', maxlength: 80, oninput: (e) => { v.options.title = e.target.value; save(); } }),
      h('label', { class: 'label' }, 'Layout'), h('select', { class: 'input', onchange: (e) => { v.template = e.target.value; save(); } },
        [['grid', 'Grid'], ['minimal', 'Minimal sprites'], ['featured', 'Featured (one at a time)']].map(([a, b]) => h('option', { value: a, selected: v.template === a ? 'selected' : null }, b))),
      h('div', { class: 'row wrap' }, h('label', { class: 'label' }, 'Columns'), h('input', { class: 'input', type: 'number', min: 1, max: 10, value: v.options.columns, style: { width: '70px' }, onchange: (e) => { v.options.columns = Number(e.target.value); save(); } }),
        h('label', { class: 'label' }, 'Cycle every (s, 0 = off)'), h('input', { class: 'input', type: 'number', min: 0, max: 600, value: v.options.cycle_seconds, style: { width: '70px' }, onchange: (e) => { v.options.cycle_seconds = Number(e.target.value); save(); } })),
      h('div', { class: 'row wrap' }, h('label', { class: 'label' }, t('common.background')), h('select', { class: 'input', style: { width: 'auto' }, onchange: (e) => { v.options.background = e.target.value; save(); } },
        [['panel', 'Panel'], ['dark', 'Dark'], ['light', 'Light'], ['transparent', 'Transparent']].map(([a, b]) => h('option', { value: a, selected: v.options.background === a ? 'selected' : null }, b))),
      h('input', { type: 'range', min: 0, max: 100, value: v.options.bg_opacity, 'aria-label': 'Background opacity', oninput: (e) => { v.options.bg_opacity = Number(e.target.value); save(); } })),
      h('div', { class: 'row wrap' }, h('label', { class: 'label' }, 'Motion'), h('select', { class: 'input', style: { width: 'auto' }, onchange: (e) => { v.options.motion = e.target.value; save(); } },
        [['none', 'None'], ['float', 'Gentle float'], ['sheen', 'Shiny sheen']].map(([a, b]) => h('option', { value: a, selected: v.options.motion === a ? 'selected' : null }, b))),
      h('label', { class: 'chip btnlike' + (v.options.big_sprites ? ' active' : '') }, h('input', { type: 'checkbox', class: 'check', checked: v.options.big_sprites, onchange: (e) => { v.options.big_sprites = e.target.checked; save(); } }), 'Large sprites')),
      h('span', { class: 'label' }, 'Show details'), h('div', { class: 'row wrap' }, sw('nickname', 'Nickname'), sw('level', 'Level'), sw('nature', 'Nature'), sw('ivs', 'IVs'),
        sw('encounter_count', 'Encounters'), sw('method', 'Method'), sw('location', 'Location'), sw('date', 'Date'), sw('ot', 'OT')),
      h('span', { class: 'label' }, `Entries (${v.entries.length})`),
      eligible.length ? h('div', { class: 'stack tight sc-pick', style: { maxHeight: '260px', overflow: 'auto' } }, eligible.map((e) => h('label', { class: 'row' },
        h('input', { type: 'checkbox', class: 'check', checked: v.entries.includes(e.id), onchange: (ev) => { v.entries = ev.target.checked ? [...v.entries, e.id] : v.entries.filter((x) => x !== e.id); save(); } }),
        h('img', { class: 'pixel', src: e.icon, width: 28, height: 28, alt: '' }), h('span', { class: 'small' }, (e.nickname || e.species_name) + (e.shiny ? ' ✦' : '') + (e.alpha ? ' α' : ''))))) :
        h('div', { class: 'small muted' }, 'No Box entries allowed in Showcase yet.'),
      h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: async () => { await saveSettings({ 'showcase.active': sc.id }); toast('Shown in the Showcase window'); } }, 'Use in Showcase window'),
        h('span', { class: 'grow' }), h('button', { class: 'btn danger ghost small', onclick: async () => { if (await confirmDialog('Delete showcase?', 'Box entries are not affected.', t('common.delete'), true)) { await api('DELETE', '/api/showcases/' + sc.id); go('#/collection/showcases'); } } }, t('common.delete')))),
    h('div', { class: 'stack tight' }, h('div', { class: 'row' }, h('span', { class: 'label' }, 'Preview'), h('span', { class: 'grow' }),
      v.template === 'featured' ? [h('button', { class: 'btn ghost small', onclick: () => { idx -= 1; redraw(); } }, '‹'), h('button', { class: 'btn ghost small', onclick: () => { idx += 1; redraw(); } }, '›')] : null), preview)));
  redraw();
}

export async function renderShowcasePopout(el, mode) {
  const list = await get('/api/showcases');
  const id = setting('showcase.active') || (list.showcases[0] && list.showcases[0].id);
  if (!id) { mount(el, h('div', { class: 'empty' }, 'No showcase yet. ', h('button', { class: 'btn small', onclick: () => openRoute('#/collection/showcases') }, 'Create one'))); return; }
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
