import { number, uiLabel, t as translateUI } from '../i18n.js';
import { compareLabels, gameTerm, itemCategory, itemEvolutionMethod, itemDescription, itemLabel, matchesTerm, searchText, speciesLabel } from '../game-locale.js';
// Item Library (docs/design/18 §1): every item group from the user's own installed dump.
// Categories are inferred and say so; links come only from item IDs in the same dump.
import { h, mount, clear, icon, get, api, state, setting, saveSettings, on, notice, badge, debounce, toast, pad3, seg, WINDOW_ID } from '../core.js';
import { go, popoutButton, pinButton } from '../shell.js';
import { t, lang } from '../i18n.js';
import { linkedNotes, openRoute } from '../links.js';

const SOURCE_KEYS = {"name is a placeholder":"itemui.basis_placeholder","name starts with TM/HM":"itemui.basis_tm","name ends with “Ball”":"itemui.basis_ball","name ends with “Berry”":"itemui.basis_berry","name ends with “Mail”":"itemui.basis_mail","description says cosmetic / dye / particle effect":"itemui.basis_cosmetic","description mentions an unknown reward / dated event item":"itemui.basis_reward","name contains “Fossil”":"itemui.basis_fossil","name/description mentions seeds or planting":"itemui.basis_farming","known breeding item":"itemui.basis_breeding","used by an evolution in the game data":"itemui.basis_evolution","evolution stone description":"itemui.basis_stone","description mentions stats / EVs / nature / level":"itemui.basis_training","description mentions use in battle":"itemui.basis_battle","description mentions use outside battle / lures":"itemui.basis_field","description mentions restoring / healing":"itemui.basis_medicine","description mentions holding":"itemui.basis_hold","name looks like a key item":"itemui.basis_key","no rule matched":"itemui.basis_other","PokeMMO game data. Region codes are the game data's raw values.":"itemui.provenance","Install (or re-install) your PokeMMO data to build the Item Library from your own dump.":"itemui.unavailable"};
const itemSource = (value) => SOURCE_KEYS[value] ? translateUI(SOURCE_KEYS[value]) : uiLabel(value);

let cache = null, unsub = [];
const F0 = { q: '', cat: 'all', fav: false, held: false, evo: false, placeholders: false, sort: 'name' };
let F = null;
export function dispose() { unsub.forEach((u) => u()); unsub = []; }

async function load(force) {
  if (!cache || force || cache.lang !== lang()) cache = { ...(await get('/api/items?lang=' + lang())), lang: lang() };
  return cache;
}
function filters() { if (!F) F = { ...F0, ...(setting('items.filters') || {}), q: '' }; return F; }
const persist = debounce(() => saveSettings({ 'items.filters': { ...F, q: '' } }).catch(() => {}), 600);

export function applyItemFilters(items, f) {
  const q = searchText(f.q);
  const out = items.filter((i) => {
    if (!f.placeholders && i.category === 'placeholder') return false;
    if (f.cat !== 'all' && i.category !== f.cat) return false;
    if (f.fav && !i.fav) return false;
    if (f.held && !i.held) return false;
    if (f.evo && !i.evo) return false;
    if (q && !(searchText(i.search).includes(q) || searchText(itemLabel(i)).includes(q) || matchesTerm('item', i.name, q) || String(i.id) === q)) return false;
    return true;
  });
  const by = { name: (a, b) => compareLabels(itemLabel(a), itemLabel(b)), id: (a, b) => a.id - b.id, qty: (a, b) => (b.qty || 0) - (a.qty || 0) || compareLabels(itemLabel(a), itemLabel(b)) };
  return out.sort(by[f.sort] || by.name);
}

export function itemTile(i, { selected, onOpen, compact } = {}) {
  return h('button', { class: 'item-tile' + (selected ? ' selected' : '') + (compact ? ' compact' : ''), dataset: { id: i.id }, title: itemLabel(i) + (itemLabel(i) !== i.name ? ` (${i.name})` : ''),
    'aria-label': itemLabel(i) + (i.fav ? translateUI('itemui.favourite_suffix') : '') + (i.qty != null ? translateUI('itemui.quantity_suffix', { count: i.qty }) : ''), onclick: () => onOpen(i.id) },
  i.icon ? h('img', { class: 'pixel', src: i.icon, alt: '', width: 32, height: 32, loading: 'lazy' }) : h('span', { class: 'item-noicon', title: translateUI('ui.b272_item_no_icon') }, '?'),
  h('span', { class: 'it-name ellipsis' }, itemLabel(i)), i.fav ? h('span', { class: 'it-fav', 'aria-hidden': 'true' }, '★') : null,
  i.qty != null ? h('span', { class: 'it-qty' }, '×' + i.qty) : null);
}

function catOptions(data) {
  return [['all', `${t('common.all')} (${Object.entries(data.counts).filter(([k]) => k !== 'placeholder').reduce((a, [, v]) => a + v, 0)})`],
    ...data.categories.filter(([k]) => data.counts[k] && k !== 'placeholder').map(([k, l]) => [k, `${itemCategory(k, l)} (${number(data.counts[k])})`])];
}

export async function render(el, route) {
  dispose();
  filters();
  const data = await load();
  const page = h('div', { class: 'page flush' });
  mount(el, page);
  const head = h('div', { class: 'page-head', style: { padding: '14px 18px 4px' } },
    h('button', { class: 'btn ghost', onclick: () => go('#/tools') }, icon('back'), t('tools.title')),
    h('div', null, h('h1', null, t('items.title')), h('div', { class: 'sub' }, t('items.desc'))),
    h('div', { class: 'actions' }, pinButton({ kind: 'tool', id: 'items' }), popoutButton('items')));
  page.append(head);
  if (!data.available) {
    page.append(h('div', { style: { padding: '0 18px' } }, notice(data.syncing ? 'info' : 'warn', itemSource(data.reason) || t('items.not_installed'), ' ',
      data.syncing ? null : h('button', { class: 'btn small', onclick: () => go('#/settings/data') }, translateUI('itemui.settings_data')))));
    unsub.push(on('import', async (d) => { if (d.state === 'done') { await load(true); render(el, route); } }));
    if (data.syncing) setTimeout(async () => { if (el.isConnected && location.hash.startsWith('#/tools/items')) { await load(true); render(el, route); } }, 4000);
    return;
  }
  const sel = route.parts[1] ? Number(route.parts[1]) : null;
  const layout = h('div', { class: 'dex-layout items-layout' + (sel ? ' split' : '') });
  page.append(layout);
  const left = h('div', { class: 'dex-grid-wrap' });
  layout.append(left);
  const count = h('span', { class: 'small muted nowrap' });
  const grid = h('div', { class: 'item-grid', role: 'list', 'aria-label': t('items.title') });
  const scroll = h('div', { class: 'dex-scroll' }, grid);
  const draw = () => {
    const list = applyItemFilters(data.items, F);
    count.textContent = translateUI('ui.item_counts', { count: number(list.length), total: number(data.items.filter((i) => i.category !== 'placeholder').length) });
    clear(grid);
    let shown = 0;
    const more = () => {
      const frag = document.createDocumentFragment();
      for (const i of list.slice(shown, shown + 240)) frag.append(itemTile(i, { selected: i.id === sel, onOpen: (id) => go(`#/tools/items/${id}`) }));
      shown += 240; grid.append(frag);
      if (shown < list.length) { const s = h('div', { class: 'more-sentinel', style: { gridColumn: '1/-1', height: '1px' } }); grid.append(s);
        new IntersectionObserver((ents, obs) => { if (ents[0].isIntersecting) { obs.disconnect(); s.remove(); more(); } }, { root: scroll }).observe(s); }
    };
    if (!list.length) grid.append(h('div', { class: 'empty', style: { gridColumn: '1/-1' } }, h('h3', null, translateUI('ui.item_empty')), h('button', { class: 'btn small', onclick: () => { F = { ...F0 }; persist(); draw(); } }, translateUI('ui.b272_item_clear_filter'))));
    else more();
  };
  const chip = (label, key) => h('button', { class: 'chip btnlike' + (F[key] ? ' active' : ''), 'aria-pressed': String(!!F[key]), onclick: (e) => { F[key] = !F[key]; e.currentTarget.classList.toggle('active', F[key]); e.currentTarget.setAttribute('aria-pressed', String(F[key])); persist(); draw(); } }, label);
  left.append(h('div', { class: 'dex-toolbar' },
    h('div', { class: 'search' }, icon('search'), h('input', { class: 'input', type: 'search', id: 'item-search', placeholder: translateUI('ui.item_search_detail'), 'aria-label': translateUI('ui.search_items'),
      oninput: debounce((e) => { F.q = e.target.value; draw(); }, 120) })),
    h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': t('items.category'), onchange: (e) => { F.cat = e.target.value; persist(); draw(); } },
      catOptions(data).map(([v, l]) => h('option', { value: v, selected: F.cat === v ? 'selected' : null }, l))),
    chip('★ ' + t('common.favourite'), 'fav'), chip(t('items.held_by'), 'held'), chip(t('items.evolution'), 'evo'),
    h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': translateUI('ui.sort'), onchange: (e) => { F.sort = e.target.value; persist(); draw(); } },
      [['name', translateUI('ui.name_az')], ['id', translateUI('ui.item_id')], ['qty', translateUI('ui.item_quantity')]].map(([v, l]) => h('option', { value: v, selected: F.sort === v ? 'selected' : null }, l)))),
  h('div', { class: 'dex-info' }, h('div', { class: 'row wrap grow', style: { gap: '6px 14px' } }, count,
    h('span', { class: 'small muted' }, translateUI('ui.item_records', { records: number(data.stats.records), distinct: number(data.items.length), missing: number(data.stats.missing_icon) })),
    lang() !== 'en' ? h('span', { class: 'small muted' }, translateUI('ui.item_name_source')) : null,
    h('span', { class: 'tiny muted' }, translateUI('ui.item_cat_inferred')))), scroll);
  draw();
  if (sel) {
    const pane = h('div', { class: 'dex-detail' });
    layout.append(pane);
    await renderItemDetail(pane, sel, { back: () => go('#/tools/items') });
    const tile = grid.querySelector(`[data-id="${sel}"]`); if (tile) tile.scrollIntoView({ block: 'nearest' });
  }
  unsub.push(on('items', async (d, ev) => { if (ev.origin !== WINDOW_ID) { await load(true); render(el, route); } }));
  unsub.push(on('import', async (d) => { if (d.state === 'done') { await load(true); render(el, route); } }));
}

export async function renderItemDetail(pane, id, { back, popout } = {}) {
  let d;
  try { d = await get(`/api/items/${id}?lang=${lang()}`); } catch (e) { mount(pane, h('div', { class: 'detail-body' }, notice('bad', e.message))); return; }
  const description = itemDescription(d);
  const qty = h('input', { class: 'input', type: 'number', min: 0, max: 999999, value: d.qty ?? '', style: { width: '110px' }, 'aria-label': t('items.owned_qty'),
    placeholder: '—', onchange: async (e) => { const v = e.target.value === '' ? null : Number(e.target.value);
      try { await api('PUT', `/api/items/${d.id}/user`, { qty: v }); cache = null; toast(t('common.saved')); } catch (err) { toast(err.message, { kind: 'warn' }); } } });
  const fav = h('button', { class: 'fav-btn' + (d.fav ? ' on' : ''), title: t('common.favourite'), 'aria-pressed': String(d.fav), onclick: async () => {
    d.fav = !d.fav; fav.classList.toggle('on', d.fav); fav.querySelector('path').setAttribute('fill', d.fav ? 'currentColor' : 'none');
    await api('PUT', `/api/items/${d.id}/user`, { favourite: d.fav }); cache = null; } }, icon('star'));
  if (d.fav) fav.querySelector('path').setAttribute('fill', 'currentColor');
  const go_ = (r) => (popout ? openRoute(r) : go(r));
  mount(pane,
    h('div', { class: 'detail-head' },
      h('div', { class: 'art item-art' }, d.icon ? h('img', { class: 'pixel', src: d.icon, alt: '', width: 64, height: 64 }) : h('span', { class: 'item-noicon big' }, '?')),
      h('div', { class: 'grow', style: { minWidth: 0 } },
        h('div', { class: 'row' }, h('span', { class: 'muted nowrap' }, translateUI('itemui.item_number', { id: d.id })), h('span', { class: 'grow' }), fav,
          back ? h('button', { class: 'icon-btn', title: t('common.close'), 'aria-label': t('common.close'), onclick: back }, icon('close')) : null),
        h('h2', null, itemLabel(d)), itemLabel(d) !== d.name ? h('div', { class: 'small muted' }, d.name) : null,
        h('div', { class: 'row wrap', style: { marginTop: '4px' } }, h('span', { class: 'chip' }, itemCategory(d.category, d.category_label)),
          h('span', { class: 'tiny muted', title: translateUI('ui.b272_item_cat_basis') }, itemSource(d.category_basis))))),
    h('div', { class: 'detail-body stack' },
      description.fallback ? h('div', { class: 'small muted' }, translateUI('itemui.desc_english_fallback')) : null,
      h('p', { class: 'item-desc', style: { margin: 0, whiteSpace: 'pre-line' } }, description.text || h('span', { class: 'muted small' }, translateUI(description.raw.length ? 'itemui.desc_unresolved' : 'ui.b272_item_no_desc'))),
      description.english ? h('details', null, h('summary', { class: 'small' }, translateUI('ui.b272_item_en_desc')), h('p', { class: 'small', style: { whiteSpace: 'pre-line' } }, description.english)) : null,
      description.raw.length ? h('details', null, h('summary', { class: 'small' }, translateUI('itemui.desc_original')), description.raw.map(text => h('p', { class: 'small', style: { whiteSpace: 'pre-line' } }, text))) : null,
      h('div', { class: 'row wrap' }, h('label', { class: 'label', for: 'qty-' + d.id }, t('items.owned_qty')), qty,
        h('span', { class: 'tiny muted' }, translateUI('ui.b272_item_qty_manual'))),
      d.move ? h('div', { class: 'card inset' }, h('div', { class: 'label' }, translateUI('itemui.teaches')), h('div', null, h('strong', null, gameTerm('move', d.move.name)), translateUI('itemui.move_stats', { type: gameTerm('type', d.move.type), category: gameTerm('category_move', d.move.category), power: d.move.power || '—', accuracy: d.move.accuracy > 100 ? '—' : d.move.accuracy, pp: d.move.pp }))) : null,
      d.evolution_uses.length ? h('div', { class: 'stack tight' }, h('div', { class: 'label' }, t('items.evolution')),
        h('div', { class: 'row wrap' }, d.evolution_uses.map((e) => h('button', { class: 'mini-mon', onclick: () => go_('#/pokedex/' + e.to), title: `${speciesLabel(e.from, e.from_name)} → ${speciesLabel(e.to, e.to_name)} (${itemEvolutionMethod(e.method)})` },
          e.icon ? h('img', { class: 'pixel', src: e.icon, alt: '', width: 32, height: 32 }) : null, h('span', { class: 'small' }, `${speciesLabel(e.from, e.from_name)} → ${speciesLabel(e.to, e.to_name)}`))))) : null,
      d.held_by.length ? h('div', { class: 'stack tight' }, h('div', { class: 'label' }, `${t('items.held_by')} (${d.held_by.length})`),
        h('div', { class: 'row wrap' }, d.held_by.map((s) => h('button', { class: 'mini-mon', onclick: () => go_('#/pokedex/' + s.id), title: speciesLabel(s.id, s.name) },
          s.icon ? h('img', { class: 'pixel', src: s.icon, alt: '', width: 32, height: 32, loading: 'lazy' }) : null, h('span', { class: 'small' }, speciesLabel(s.id, s.name))))),
        h('div', { class: 'tiny muted' }, translateUI('ui.b272_item_held_data'))) : null,
      d.breeding ? h('div', { class: 'row wrap' }, h('span', { class: 'small' }, translateUI('ui.b272_item_breeding')), h('button', { class: 'btn small', onclick: () => go_('#/tools/breeding') }, icon('egg'), translateUI('ui.b272_item_open_breeding'))) : null,
      h('details', null, h('summary', { class: 'small' }, translateUI('ui.b272_item_records', { count: number(d.records.length) })),
        h('table', { class: 'table compact' }, h('thead', null, h('tr', null, [translateUI('ui.item_id'), translateUI('ui.b272_item_region_code'), translateUI('ui.b272_item_icon_id'), translateUI('ui.b272_item_icon')].map((c) => h('th', null, c)))),
          h('tbody', null, d.records.map((r) => h('tr', null, h('td', null, r.id), h('td', null, r.region_code), h('td', null, r.icon_id), h('td', null, r.has_icon ? '✓' : translateUI('itemui.missing')))))),
        h('div', { class: 'tiny muted' }, itemSource(d.provenance))),
      linkedNotes('item', String(d.id), itemLabel(d)),
      !popout ? h('div', { class: 'row' }, popoutButton('items', `#/item/${d.id}`)) : null));
}

// ------------------------------------------------------------- popout
export async function renderItemsPopout(el, mode) {
  filters();
  const data = await load();
  if (!data.available) { mount(el, notice('info', itemSource(data.reason) || t('items.not_installed'))); return; }
  const m = location.hash.match(/^#\/item\/(\d+)/);
  if (m) {
    const pane = h('div', { class: 'popout-detail' });
    mount(el, h('button', { class: 'btn ghost small', onclick: () => { location.hash = '#/'; } }, icon('back'), t('common.back')), pane);
    await renderItemDetail(pane, Number(m[1]), { popout: true });
    return;
  }
  const grid = h('div', { class: 'item-grid' + (mode === 'compact' ? ' compact' : '') });
  const countEl = h('span', { class: 'tiny muted' });
  const draw = () => {
    const list = applyItemFilters(data.items, F);
    countEl.textContent = translateUI('itemui.count', { count: number(list.length), total: number(data.items.filter((i) => i.category !== 'placeholder').length) });
    mount(grid, list.map((i) => itemTile(i, { compact: mode === 'compact', onOpen: (id) => { location.hash = `#/item/${id}`; } })));
  };
  mount(el, h('div', { class: 'row', style: { marginBottom: '6px' } },
    h('input', { class: 'input', type: 'search', placeholder: t('common.search'), 'aria-label': translateUI('ui.search_items'), value: F.q, oninput: debounce((e) => { F.q = e.target.value; draw(); }, 120) }),
    mode !== 'compact' ? h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': t('items.category'), onchange: (e) => { F.cat = e.target.value; draw(); } },
      catOptions(data).map(([v, l]) => h('option', { value: v, selected: F.cat === v ? 'selected' : null }, l))) : null), countEl, grid);
  draw();
}
