import { t as translateUI } from '../i18n.js';
// Websites & links (docs/design/20 §A): your own bookmarks, opened in your default browser.
// Nothing is embedded, fetched or scraped; only https links can be saved.
import { h, mount, icon, get, api, post, on, notice, debounce, toast, modal, confirmDialog, WINDOW_ID } from '../core.js';
import { go, pinButton } from '../shell.js';
import { t } from '../i18n.js';

let unsub = [];
const f = { q: '', cat: '', fav: false };
export function dispose() { unsub.forEach((u) => u()); unsub = []; }

export async function openBookmark(b) {
  try {
    const r = await post(`/api/bookmarks/${b.id}/open`);
    if (r.ok) toast(`Opening ${r.url.replace(/^https:\/\//, '')} in your browser`, { timeout: 2500 });
    else toast(r.message || 'Your browser could not be started.', { kind: 'warn', action: { label: translateUI('ui.copy_address'), fn: () => navigator.clipboard && navigator.clipboard.writeText(r.url) } });
  } catch (e) { toast(e.message, { kind: 'warn' }); }
}

async function editDialog(b, categories) {
  const v = { title: b?.title || '', url: b?.url || '', description: b?.description || '', category: b?.category || 'General', favourite: !!b?.favourite };
  const err = h('div', { class: 'small', role: 'alert', style: { color: 'var(--bad)' } });
  const list = h('datalist', { id: 'bm-cats' }, categories.map((c) => h('option', { value: c })));
  const body = h('div', { class: 'stack tight' },
    h('label', { class: 'label', for: 'bm-url' }, translateUI('ui.addr_https')), h('input', { id: 'bm-url', class: 'input', value: v.url, placeholder: 'https://forums.pokemmo.com/…', oninput: (e) => { v.url = e.target.value; } }),
    h('label', { class: 'label', for: 'bm-title' }, translateUI('ui.title')), h('input', { id: 'bm-title', class: 'input', value: v.title, maxlength: 120, oninput: (e) => { v.title = e.target.value; } }),
    h('label', { class: 'label', for: 'bm-cat' }, translateUI('ui.category')), h('input', { id: 'bm-cat', class: 'input', list: 'bm-cats', value: v.category, maxlength: 40, oninput: (e) => { v.category = e.target.value; } }), list,
    h('label', { class: 'label', for: 'bm-desc' }, translateUI('ui.description_optional')), h('textarea', { id: 'bm-desc', class: 'input', rows: 2, maxlength: 500, oninput: (e) => { v.description = e.target.value; } }, v.description),
    h('label', { class: 'row' }, h('input', { type: 'checkbox', class: 'check', checked: v.favourite, onchange: (e) => { v.favourite = e.target.checked; } }), 'Favourite (shown first)'),
    err);
  return modal({ title: b ? 'Edit link' : 'Add a website', body, actions: [{ label: t('common.cancel'), kind: 'ghost', value: null },
    { label: t('common.save'), kind: 'primary', handler: async () => {
      try { return b ? await api('PATCH', '/api/bookmarks/' + b.id, v) : await post('/api/bookmarks', v); } catch (e) { err.textContent = e.message; return false; } } }] });
}

export async function render(el, route) {
  dispose();
  let data = await get('/api/bookmarks');
  const page = h('div', { class: 'page' });
  mount(el, page);
  page.append(h('div', { class: 'page-head' }, h('button', { class: 'btn ghost', onclick: () => go('#/tools') }, icon('back'), t('tools.title')),
    h('div', null, h('h1', null, t('links.title')), h('div', { class: 'sub' }, translateUI('ui.enter_new_site'))),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: async () => { const r = await editDialog(null, data.categories); if (r) { toast(translateUI('ui.link_added')); draw(true); } } }, icon('plus'), 'Add website'),
      pinButton({ kind: 'tool', id: 'links' }))));
  const body = h('div', { class: 'stack' });
  page.append(body);
  const draw = async (reload) => {
    if (reload) data = await get('/api/bookmarks');
    const q = f.q.toLowerCase();
    const list = data.bookmarks.filter((b) => (!f.cat || b.category === f.cat) && (!f.fav || b.favourite) &&
      (!q || b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q) || b.description.toLowerCase().includes(q) || b.category.toLowerCase().includes(q)));
    const groups = {};
    for (const b of list) (groups[b.favourite ? '★ Favourites' : b.category] ||= []).push(b);
    const move = async (b, d) => { const ids = data.bookmarks.map((x) => x.id); const i = ids.indexOf(b.id); const j = i + d; if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]]; await post('/api/bookmarks/order', { ids }); draw(true); };
    const card = (b) => h('div', { class: 'bm-card', role: 'group', 'aria-label': b.title, dataset: { id: b.id } },
      h('button', { class: 'bm-main', title: `Open ${b.url} in your browser`, onclick: () => openBookmark(b) },
        h('span', { class: 'bm-ic', 'aria-hidden': 'true' }, (b.host || '?').replace(/^www\./, '').charAt(0).toUpperCase()),
        h('span', { class: 'grow', style: { minWidth: 0 } }, h('span', { class: 'bm-title ellipsis' }, b.title), h('span', { class: 'tiny muted ellipsis' }, b.url.replace(/^https:\/\//, '')),
          b.description ? h('span', { class: 'small muted bm-desc' }, b.description) : null), icon('external')),
      h('div', { class: 'bm-foot' },
        h('button', { class: 'icon-btn sm' + (b.favourite ? ' on' : ''), title: b.favourite ? 'Remove favourite' : 'Favourite', 'aria-pressed': String(b.favourite),
          onclick: async () => { await api('PATCH', '/api/bookmarks/' + b.id, { favourite: !b.favourite }); draw(true); } }, icon('star')),
        h('button', { class: 'icon-btn sm', title: translateUI('ui.move_up'), 'aria-label': `Move ${b.title} up`, onclick: () => move(b, -1) }, '↑'),
        h('button', { class: 'icon-btn sm', title: translateUI('ui.move_down'), 'aria-label': `Move ${b.title} down`, onclick: () => move(b, 1) }, '↓'),
        h('button', { class: 'icon-btn sm', title: translateUI('ui.copy_address'), 'aria-label': `Copy ${b.title} address`, onclick: () => { navigator.clipboard && navigator.clipboard.writeText(b.url); toast(translateUI('ui.address_copied')); } }, '⧉'),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn ghost small', onclick: async () => { const r = await editDialog(b, data.categories); if (r) draw(true); } }, t('common.edit')),
        h('button', { class: 'btn ghost small', onclick: async () => { if (!(await confirmDialog(translateUI('ui.delete_link'), `“${b.title}” will be removed. Default links are not added back automatically.`, t('common.delete'), true))) return;
          await api('DELETE', '/api/bookmarks/' + b.id); draw(true); toast(translateUI('ui.link_deleted'), { action: { label: t('common.restore'), fn: async () => { await post(`/api/bookmarks/${b.id}/restore`); draw(true); } } }); } }, t('common.delete'))));
    mount(body,
      h('div', { class: 'row wrap' }, h('div', { class: 'search grow' }, icon('search'), h('input', { class: 'input', type: 'search', id: 'links-search', value: f.q, placeholder: t('common.search'), 'aria-label': translateUI('ui.search_links'),
        oninput: debounce((e) => { f.q = e.target.value; draw().then(() => { const s = document.getElementById('links-search'); s && (s.focus(), s.setSelectionRange(s.value.length, s.value.length)); }); }, 150) })),
      h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': translateUI('ui.category'), onchange: (e) => { f.cat = e.target.value; draw(); } }, h('option', { value: '' }, translateUI('ui.all_categories')),
        data.categories.map((c) => h('option', { value: c, selected: f.cat === c ? 'selected' : null }, c))),
      h('button', { class: 'chip btnlike' + (f.fav ? ' active' : ''), 'aria-pressed': String(f.fav), onclick: () => { f.fav = !f.fav; draw(); } }, '★ ' + t('common.favourite'))),
      list.length ? Object.entries(groups).map(([g, items]) => h('section', null, h('h3', { class: 'gen-head' }, g), h('div', { class: 'bm-grid' }, items.map(card)))) :
        h('div', { class: 'empty' }, data.bookmarks.length ? 'No links match.' : 'No links yet.'),
      data.defaults_missing.length ? h('div', { class: 'row wrap small muted' }, `Removed default links: ${data.defaults_missing.join(', ')}.`,
        h('button', { class: 'btn ghost small', onclick: async () => { await post('/api/bookmarks/restore-defaults'); draw(true); } }, translateUI('ui.restore_default_links'))) : null,
      h('p', { class: 'tiny muted' }, 'Bookmarks are plain links. PokeMMO Hub and Synergy are separate community websites; the Companion uses none of their data, prices or APIs.'));
  };
  await draw();
  unsub.push(on('bookmarks', (d, ev) => { if (ev.origin !== WINDOW_ID) draw(true); }));
}
