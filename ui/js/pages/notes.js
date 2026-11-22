// Global Notes (docs/design/18 §2): create / edit (autosave) / pin / tag / link / archive /
// trash → restore → delete forever, search, Markdown export, floating note windows.
// Per-species Pokédex notes stay a separate feature and are listed read-only here.
import { h, mount, icon, get, api, post, setting, saveSettings, on, notice, debounce, toast, relTime, confirmDialog, WINDOW_ID, POPOUT } from '../core.js';
import { go, popoutButton, pinButton, openPopout } from '../shell.js';
import { t, lang } from '../i18n.js';
import { linkChip, pickLink, downloadText, openRoute } from '../links.js';

const COLOURS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'grey'];
let unsub = [];
let st = { q: '', tag: '', state: 'active', sel: null };
export function dispose() { unsub.forEach((u) => u()); unsub = []; }

/** Small renderer for note text: **bold**, *italic*, `code`, lists, links. Text is escaped first. */
export function renderNoteText(text) {
  const esc = (x) => x.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const inline = (x) => esc(x).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\bhttps:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
  const div = document.createElement('div');
  div.className = 'note-render';
  const out = [];
  let list = null;
  for (const line of (text || '').split('\n')) {
    const m = line.match(/^\s*(?:[-*]|\d+\.)\s+(\[( |x)\]\s+)?(.*)$/);
    if (m) { if (!list) { list = []; out.push(list); } list.push((m[1] ? (m[2] === 'x' ? '☑ ' : '☐ ') : '') + inline(m[3])); continue; }
    list = null;
    const hd = line.match(/^(#{1,3})\s+(.*)$/);
    out.push(hd ? `<h${hd[1].length + 2}>${inline(hd[2])}</h${hd[1].length + 2}>` : line.trim() ? `<p>${inline(line)}</p>` : '');
  }
  div.innerHTML = out.map((x) => (Array.isArray(x) ? `<ul>${x.map((i) => `<li>${i}</li>`).join('')}</ul>` : x)).join('');
  return div;
}

async function newNote(extra = {}) {
  const n = await post('/api/notes', { title: '', body: '', ...extra });
  return n;
}

/** Editor for one note; used by the page, the popout and quick capture. */
export function noteEditor(n, { onChange, compact, popout } = {}) {
  const status = h('span', { class: 'tiny muted', 'aria-live': 'polite' }, `${t('common.saved')} · ${relTime(n.updated_at)}`);
  const trash = n.state === 'trash';
  let pending = {};
  const flush = async () => {
    const patch = pending; pending = {};
    if (!Object.keys(patch).length) return;
    try { const r = await api('PATCH', `/api/notes/${n.id}`, patch); Object.assign(n, r); status.textContent = t('common.saved'); onChange && onChange(n, 'edit'); }
    catch (e) { status.textContent = e.message; Object.assign(pending, patch); }
  };
  const save = debounce(flush, 450);
  const queue = (patch) => { Object.assign(pending, patch); status.textContent = t('common.saving'); save(); };
  const title = h('input', { class: 'input note-title', value: n.title, placeholder: t('notes.title_ph'), maxlength: 200, 'aria-label': t('notes.title_ph'),
    disabled: trash ? 'disabled' : null, oninput: (e) => queue({ title: e.target.value }) });
  const body = h('textarea', { class: 'input note-body', placeholder: t('notes.body_ph'), 'aria-label': 'Note text', disabled: trash ? 'disabled' : null,
    oninput: (e) => queue({ body: e.target.value }), onblur: flush,
    onkeydown: (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); flush(); } } }, n.body);
  const preview = h('div', { class: 'note-preview', hidden: true });
  let previewing = false;
  const togglePreview = () => { previewing = !previewing; preview.hidden = !previewing; body.hidden = previewing;
    if (previewing) mount(preview, renderNoteText(body.value)); prevBtn.textContent = previewing ? 'Edit' : 'Preview'; };
  const prevBtn = h('button', { class: 'btn ghost small', onclick: togglePreview }, 'Preview');
  const tags = h('input', { class: 'input', value: n.tags.join(', '), placeholder: 'tags, comma separated', 'aria-label': t('common.tags'), disabled: trash ? 'disabled' : null,
    onchange: (e) => queue({ tags: e.target.value }) });
  const links = h('div', { class: 'row wrap link-row' });
  const drawLinks = () => mount(links, n.links.map((l) => linkChip(l, trash ? null : async () => { Object.assign(n, await api('DELETE', `/api/notes/${n.id}/links/${l.kind}/${encodeURIComponent(l.ref)}`)); drawLinks(); onChange && onChange(n, 'links'); })),
    trash ? null : h('button', { class: 'btn ghost small', onclick: async () => { const l = await pickLink(); if (!l) return; Object.assign(n, await post(`/api/notes/${n.id}/links`, l)); drawLinks(); onChange && onChange(n, 'links'); } }, icon('plus'), t('notes.link_add')));
  drawLinks();
  const act = async (a) => { await flush(); const r = await post(`/api/notes/${n.id}/${a}`); onChange && onChange(r, a); return r; };
  const pin = h('button', { class: 'icon-btn' + (n.pinned ? ' on' : ''), title: n.pinned ? 'Unpin' : 'Pin to top', 'aria-pressed': String(n.pinned), disabled: trash ? 'disabled' : null,
    onclick: () => { n.pinned = !n.pinned; pin.classList.toggle('on', n.pinned); queue({ pinned: n.pinned }); } }, icon('pin'));
  const colours = h('div', { class: 'row', role: 'radiogroup', 'aria-label': 'Colour' }, [null, ...COLOURS].map((c) => h('button', {
    class: 'swatch' + (n.colour === c ? ' on' : ''), dataset: { c: c || 'none' }, role: 'radio', 'aria-checked': String(n.colour === c), title: c || 'No colour', disabled: trash ? 'disabled' : null,
    onclick: (e) => { n.colour = c; [...colours.children].forEach((b) => { b.classList.remove('on'); b.setAttribute('aria-checked', 'false'); }); e.currentTarget.classList.add('on'); queue({ colour: c }); } })));
  const actions = trash ? [h('button', { class: 'btn', onclick: () => act('restore') }, icon('undo'), t('common.restore')),
    h('button', { class: 'btn danger', onclick: async () => { if (!(await confirmDialog(t('notes.purge'), 'This note will be deleted permanently. This cannot be undone.', t('notes.purge'), true))) return;
      await api('DELETE', `/api/notes/${n.id}`); onChange && onChange(n, 'purge'); } }, icon('trash'), t('notes.purge'))] :
    [n.state === 'archived' ? h('button', { class: 'btn ghost small', onclick: () => act('unarchive') }, icon('archive'), t('common.unarchive')) :
      h('button', { class: 'btn ghost small', onclick: () => act('archive') }, icon('archive'), t('common.archive')),
    h('button', { class: 'btn ghost small', onclick: () => act('duplicate') }, t('common.duplicate')),
    h('button', { class: 'btn ghost small', onclick: async () => { await flush(); const r = await get(`/api/notes/export?ids=${n.id}`); downloadText(`${(n.title || 'note').replace(/[^\w-]+/g, '_')}.md`, r.markdown); } }, icon('download'), 'Markdown'),
    !popout ? h('button', { class: 'btn ghost small', title: 'Open this note in its own floating window', onclick: async () => { await flush(); await saveSettings({ 'notes.popout_note': n.id }); openPopout('notes', '#/note/' + n.id); } }, icon('popout'), t('common.popout')) : null,
    h('button', { class: 'btn ghost small', onclick: async () => { await flush(); const r = await act('trash');
      toast('Moved to the trash', { action: { label: t('common.restore'), fn: async () => { await post(`/api/notes/${n.id}/restore`); onChange && onChange(r, 'restore'); } } }); } }, icon('trash'), t('common.delete'))];
  return h('div', { class: 'note-editor stack tight' + (n.colour ? ' nc-' + n.colour : ''), dataset: { id: n.id } },
    trash ? notice('warn', 'This note is in the trash. Restore it to edit.') : null,
    h('div', { class: 'row' }, title, pin),
    body, preview,
    compact ? null : h('div', { class: 'row wrap' }, h('span', { class: 'label' }, t('common.tags')), tags),
    compact ? null : h('div', { class: 'stack tight' }, h('span', { class: 'label' }, t('common.links')), links),
    compact ? null : colours,
    h('div', { class: 'row wrap' }, status, h('span', { class: 'grow' }), compact ? null : prevBtn, compact ? null : actions));
}

function noteRow(n, sel, onClick) {
  return h('button', { class: 'note-row' + (n.id === sel ? ' selected' : '') + (n.colour ? ' nc-' + n.colour : ''), dataset: { id: n.id }, onclick: onClick, 'aria-current': n.id === sel ? 'true' : null },
    h('div', { class: 'row' }, n.pinned ? h('span', { title: t('notes.pinned') }, '📌') : null, h('strong', { class: 'grow ellipsis' }, n.title || t('notes.untitled')), h('span', { class: 'tiny muted nowrap' }, relTime(n.updated_at))),
    h('div', { class: 'small muted ellipsis' }, (n.body || '').replace(/\s+/g, ' ').slice(0, 120) || '—'),
    n.tags.length || n.links.length ? h('div', { class: 'tiny muted ellipsis' }, n.tags.map((x) => '#' + x).join(' '), n.links.length ? ` · 🔗 ${n.links.length}` : '') : null);
}

export async function render(el, route) {
  dispose();
  if (route.parts[1] === 'new') { const n = await newNote(); go('#/tools/notes/' + n.id); return; }
  st.sel = route.parts[1] || st.sel;
  const page = h('div', { class: 'page flush' });
  mount(el, page);
  page.append(h('div', { class: 'page-head', style: { padding: '14px 18px 4px' } },
    h('button', { class: 'btn ghost', onclick: () => go('#/tools') }, icon('back'), t('tools.title')),
    h('div', null, h('h1', null, t('notes.title')), h('div', { class: 'sub' }, t('notes.desc'))),
    h('div', { class: 'actions' },
      h('button', { class: 'btn primary', onclick: async () => { const n = await newNote(); st.state = 'active'; go('#/tools/notes/' + n.id); } }, icon('plus'), t('notes.new')),
      h('button', { class: 'btn ghost', onclick: async () => { const r = await get('/api/notes/export'); downloadText(`pokemmo-notes-${new Date().toISOString().slice(0, 10)}.md`, r.markdown); } }, icon('download'), t('common.export')),
      pinButton({ kind: 'tool', id: 'notes' }), popoutButton('notes'))));
  const layout = h('div', { class: 'notes-layout' });
  page.append(layout);
  const side = h('div', { class: 'notes-side' });
  const pane = h('div', { class: 'notes-pane' });
  layout.append(side, pane);
  const draw = async () => {
    const res = await get(`/api/notes?state=${st.state}&q=${encodeURIComponent(st.q)}&tag=${encodeURIComponent(st.tag)}`);
    if (st.sel && !res.notes.some((n) => n.id === st.sel)) {
      try { const n = await get('/api/notes/' + st.sel); if (n.state !== st.state && st.state !== 'all') { st.state = n.state; return draw(); } } catch (_) { st.sel = null; }
    }
    const list = h('div', { class: 'note-list', role: 'list' }, res.notes.length ? res.notes.map((n) => noteRow(n, st.sel, () => go('#/tools/notes/' + n.id))) :
      h('div', { class: 'empty' }, st.q || st.tag ? 'No notes match.' : st.state === 'active' ? h('div', null, h('p', null, t('common.empty')), h('button', { class: 'btn small primary', onclick: async () => { const n = await newNote(); go('#/tools/notes/' + n.id); } }, t('notes.new'))) : t('common.empty')));
    mount(side,
      h('div', { class: 'search' }, icon('search'), h('input', { class: 'input', type: 'search', id: 'notes-search', value: st.q, placeholder: t('common.search'), 'aria-label': 'Search notes',
        oninput: debounce((e) => { st.q = e.target.value; draw().then(() => { const s = document.getElementById('notes-search'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }); }, 200) })),
      h('div', { class: 'seg', role: 'tablist' }, [['active', t('notes.active'), res.counts.active], ['archived', t('notes.archived'), res.counts.archived], ['trash', t('notes.trash'), res.counts.trash]].map(([k, l, c]) =>
        h('button', { class: st.state === k ? 'active' : '', role: 'tab', 'aria-selected': String(st.state === k), onclick: () => { st.state = k; draw(); } }, `${l} (${c})`))),
      res.tags.length ? h('div', { class: 'row wrap tag-cloud' }, res.tags.slice(0, 30).map(([tg, c]) => h('button', { class: 'chip btnlike' + (st.tag === tg ? ' active' : ''),
        onclick: () => { st.tag = st.tag === tg ? '' : tg; draw(); } }, `#${tg} ${c}`))) : null,
      list,
      h('details', { class: 'species-notes' }, h('summary', { class: 'small' }, t('notes.species_notes')), h('div', { class: 'stack tight', dataset: { lazy: 'species' } })));
    side.querySelector('details.species-notes').addEventListener('toggle', async (e) => {
      if (!e.target.open) return;
      const box = e.target.querySelector('[data-lazy]');
      const sn = await get('/api/notes/species');
      mount(box, sn.notes.length ? sn.notes.map((x) => h('button', { class: 'note-row', onclick: () => go(`#/pokedex/${x.species_id}?tab=notes`) },
        h('strong', null, x.name), h('div', { class: 'small muted ellipsis' }, x.body))) : h('div', { class: 'small muted' }, 'No per-species notes. They are written in each Pokémon’s “Notes & Box” tab.'));
    });
    if (st.sel) {
      try {
        const n = await get('/api/notes/' + st.sel);
        mount(pane, noteEditor(n, { onChange: (x, a) => { if (['archive', 'unarchive', 'trash', 'restore', 'purge', 'duplicate', 'links'].includes(a) || a === 'edit') {
          if (a === 'purge') st.sel = null; if (a === 'duplicate') { go('#/tools/notes/' + x.id); return; }
          if (a !== 'edit') draw(); else { const row = side.querySelector(`.note-row[data-id="${x.id}"]`); if (row) row.replaceWith(noteRow(x, st.sel, () => go('#/tools/notes/' + x.id))); } } } }));
      } catch (e) { st.sel = null; mount(pane, notice('bad', e.message)); }
    } else mount(pane, h('div', { class: 'empty' }, h('h3', null, t('notes.title')), h('p', null, 'Pick a note on the left or create one. Notes can link to Pokémon, items, locations, your guides and Box entries.')));
  };
  await draw();
  unsub.push(on('notes', (d, ev) => { if (ev.origin !== WINDOW_ID) draw(); }));
}

// --------------------------------------------------------------- popout
// Compact: one note, editor only. Standard: one note with tags/links. Expanded: list + editor.
export async function renderNotesPopout(el, mode) {
  const m = location.hash.match(/^#\/note\/([0-9a-f]{12})/);
  if (location.hash === '#/new') { const n = await newNote(); await saveSettings({ 'notes.popout_note': n.id }); location.hash = '#/note/' + n.id; return; }
  let id = m ? m[1] : setting('notes.popout_note');
  const res = await get('/api/notes');
  if (!id || (!m && !res.notes.some((n) => n.id === id))) id = res.notes[0] && res.notes[0].id;
  const picker = h('select', { class: 'input', 'aria-label': 'Note', onchange: async (e) => { if (e.target.value === '__new') { const n = await newNote(); location.hash = '#/note/' + n.id; return; }
    await saveSettings({ 'notes.popout_note': e.target.value }); location.hash = '#/note/' + e.target.value; } },
  res.notes.map((n) => h('option', { value: n.id, selected: n.id === id ? 'selected' : null }, (n.pinned ? '📌 ' : '') + (n.title || t('notes.untitled')))),
  h('option', { value: '__new' }, '+ ' + t('notes.new')));
  const top = h('div', { class: 'row' }, picker, h('button', { class: 'icon-btn', title: t('notes.new'), 'aria-label': t('notes.new'), onclick: async () => { const n = await newNote(); location.hash = '#/note/' + n.id; } }, icon('plus')),
    h('button', { class: 'icon-btn', title: t('common.open_main'), 'aria-label': t('common.open_main'), onclick: () => openRoute('#/tools/notes/' + (id || '')) }, icon('external')));
  if (!id) { mount(el, top, h('div', { class: 'empty' }, t('common.empty'))); return; }
  let n;
  try { n = await get('/api/notes/' + id); } catch (_) { location.hash = '#/'; return; }
  const editor = noteEditor(n, { compact: mode === 'compact', popout: true, onChange: (x, a) => { if (a !== 'edit') renderNotesPopout(el, mode); } });
  if (mode === 'expanded') {
    const list = h('div', { class: 'note-list' }, res.notes.map((x) => noteRow(x, id, () => { location.hash = '#/note/' + x.id; })));
    mount(el, h('div', { class: 'notes-pop-expanded' }, h('div', { class: 'stack tight' }, top, list), editor));
  } else mount(el, top, editor);
  const ta = el.querySelector('textarea');
  if (ta && !n.body) ta.focus();
}
export const _test = { renderNoteText, lang };
void POPOUT;
