// Shared entity links between the connected tools (Notes ↔ Pokédex, Items, Locations, Box, Guides).
import { h, mount, icon, get, api, post, modal, toast, debounce, relTime, pad3, spriteOrFallback, POPOUT, SHELL } from './core.js';
import { t } from './i18n.js';

export const LINK_META = {
  species: { label: 'Pokémon', icon: 'dex', route: (r) => '#/pokedex/' + r },
  item: { label: 'Item', icon: 'bag', route: (r) => '#/tools/items/' + r },
  location: { label: 'Location', icon: 'map', route: (r) => '#/tools/locations/' + encodeURIComponent(r) },
  custom_guide: { label: 'My guide', icon: 'list', route: (r) => '#/tools/cguides/' + r },
  owned: { label: 'Box entry', icon: 'box', route: (r) => '#/collection/pokemon/' + r },
  note: { label: 'Note', icon: 'note', route: (r) => '#/tools/notes/' + r },
  breeding_plan: { label: 'Breeding plan', icon: 'egg', route: (r) => `#/tools/breeding?tab=plan&plan=${r}` },
  guide: { label: 'Storyline guide', icon: 'guides', route: () => '#/guides' },
  guide_step: { label: 'Guide step', icon: 'guides', route: () => '#/guides?jump=1' },
};

export function openRoute(route) {
  if (!POPOUT) { location.hash = route; return; }
  if (SHELL === 'qt') { post('/api/shell/command', { action: 'navigate_main', route }); return; }
  if (window.opener && !window.opener.closed) { window.opener.location.hash = route; window.opener.focus(); }
  else toast('Open the main Companion window to follow this link.', { kind: 'warn' });
}

export function linkChip(l, onRemove) {
  const m = LINK_META[l.kind] || { label: l.kind, icon: 'dots', route: () => '#/home' };
  return h('span', { class: 'link-chip' },
    h('button', { class: 'lc-main', title: `${m.label}: ${l.label || l.ref}`, onclick: () => openRoute(m.route(l.ref)) }, icon(m.icon), h('span', { class: 'ellipsis' }, l.label || `${m.label} ${l.ref}`)),
    onRemove ? h('button', { class: 'lc-x', title: t('common.remove'), 'aria-label': `${t('common.remove')} ${l.label || l.ref}`, onclick: onRemove }, '✕') : null);
}

/** Search-and-pick dialog for any linkable entity. Resolves {kind, ref, label} or null. */
export async function pickLink(kinds = ['species', 'item', 'location', 'custom_guide', 'owned']) {
  const [species, items, locs, guides, box] = await Promise.all([
    kinds.includes('species') ? get('/api/dex/species?run=none').then((r) => r.species) : [],
    kinds.includes('item') ? get('/api/items').then((r) => r.items).catch(() => []) : [],
    kinds.includes('location') ? get('/api/locations').then((r) => r.locations).catch(() => []) : [],
    kinds.includes('custom_guide') ? get('/api/cguides').then((r) => r.guides) : [],
    kinds.includes('owned') ? get('/api/box').then((r) => r.entries) : []]);
  const pool = [
    ...species.map((s) => ({ kind: 'species', ref: String(s.id), label: s.name, sub: '#' + pad3(s.id), icon: s.icon })),
    ...items.filter((i) => i.category !== 'placeholder').map((i) => ({ kind: 'item', ref: String(i.id), label: i.label || i.name, sub: i.category, icon: i.icon })),
    ...locs.map((l) => ({ kind: 'location', ref: l.id, label: l.name, sub: l.region })),
    ...guides.map((g) => ({ kind: 'custom_guide', ref: g.id, label: g.title, sub: g.scope_label })),
    ...box.map((b) => ({ kind: 'owned', ref: b.id, label: b.nickname ? `${b.nickname} (${b.species_name})` : b.species_name, sub: b.shiny ? 'shiny' : '', icon: b.icon }))];
  let chosen = null;
  const list = h('div', { class: 'list-rows pick-list', role: 'listbox', 'aria-label': 'Results' });
  let kindF = 'all';
  const input = h('input', { class: 'input', type: 'search', placeholder: 'Search Pokémon, items, locations, guides, Box…', 'aria-label': 'Search what to link' });
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    const res = pool.filter((p) => (kindF === 'all' || p.kind === kindF) && (!q || p.label.toLowerCase().includes(q) || (p.sub || '').toLowerCase().includes(q))).slice(0, 80);
    mount(list, res.length ? res.map((p) => h('button', { class: 'list-row', role: 'option', onclick: () => { chosen = p; document.querySelector('.modal-back .m-foot .btn.primary')?.click(); } },
      p.icon ? h('img', { class: 'pixel', src: p.icon, width: 28, height: 28, alt: '', loading: 'lazy' }) : icon(LINK_META[p.kind].icon),
      h('span', { class: 'grow' }, p.label, h('span', { class: 'tiny muted' }, ` · ${LINK_META[p.kind].label}${p.sub ? ' · ' + p.sub : ''}`)))) :
      h('div', { class: 'small muted', style: { padding: '8px' } }, pool.length ? 'No matches.' : 'Nothing to link yet.'));
  };
  input.addEventListener('input', debounce(draw, 100));
  const kindSel = h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': 'Kind', onchange: (e) => { kindF = e.target.value; draw(); } },
    h('option', { value: 'all' }, t('common.all')), kinds.map((k) => h('option', { value: k }, LINK_META[k].label)));
  draw();
  setTimeout(() => input.focus(), 30);
  const ok = await modal({ title: t('notes.link_add'), body: h('div', { class: 'stack tight' }, h('div', { class: 'row' }, input, kindSel), list),
    actions: [{ label: t('common.cancel'), kind: 'ghost', value: false }, { label: 'Link', kind: 'primary', value: true, handler: () => !!chosen || (toast('Choose an entry from the list'), false) }] });
  return ok && chosen ? { kind: chosen.kind, ref: chosen.ref, label: chosen.label } : null;
}

/** "Notes linked to this" block for entity pages, with quick create and link-existing. */
export function linkedNotes(kind, ref, label) {
  const box = h('div', { class: 'stack tight linked-notes' });
  const draw = async () => {
    const res = await get(`/api/notes?kind=${kind}&ref=${encodeURIComponent(ref)}`);
    mount(box, h('div', { class: 'row' }, h('span', { class: 'label' }, t('notes.title')), h('span', { class: 'grow' }),
      h('button', { class: 'btn small', onclick: async () => {
        const n = await post('/api/notes', { title: label, body: '', links: [{ kind, ref, label }] });
        openRoute('#/tools/notes/' + n.id); } }, icon('plus'), t('notes.new')),
      h('button', { class: 'btn ghost small', title: 'Link an existing note', onclick: async () => {
        const all = (await get('/api/notes')).notes.filter((n) => !n.links.some((l) => l.kind === kind && l.ref === String(ref)));
        if (!all.length) { toast('No other notes to link'); return; }
        const sel = h('select', { class: 'input', 'aria-label': 'Note' }, all.map((n) => h('option', { value: n.id }, n.title || t('notes.untitled'))));
        if (await modal({ title: 'Link an existing note', body: sel, actions: [{ label: t('common.cancel'), kind: 'ghost', value: false }, { label: 'Link', kind: 'primary', value: true }] })) {
          await post(`/api/notes/${sel.value}/links`, { kind, ref: String(ref), label }); draw(); }
      } }, 'Link existing')),
    res.notes.length ? res.notes.map((n) => h('button', { class: 'note-mini', onclick: () => openRoute('#/tools/notes/' + n.id) },
      h('div', { class: 'nm-title' }, n.pinned ? '📌 ' : '', n.title || t('notes.untitled')),
      h('div', { class: 'nm-body small muted' }, (n.body || '').slice(0, 160) || '—'),
      h('div', { class: 'tiny muted' }, n.tags.map((x) => '#' + x).join(' '), ' · ', relTime(n.updated_at)))) :
      h('div', { class: 'small muted' }, 'No notes linked yet.'));
  };
  draw().catch((e) => mount(box, h('div', { class: 'small muted' }, e.message)));
  return box;
}

export function fileToBase64(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(file); });
}
export function pickFile(accept) {
  return new Promise((res) => { const i = h('input', { type: 'file', accept, style: { display: 'none' } });
    i.addEventListener('change', () => { res(i.files[0] || null); i.remove(); }); document.body.append(i); i.click(); });
}
export function downloadText(name, text, mime = 'text/markdown') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: mime + ';charset=utf-8' })), download: name });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
export { spriteOrFallback };
