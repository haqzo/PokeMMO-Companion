// My guides — user-authored guides with checklists and repeatable cycles (docs/design/18 §5).
// The bundled storyline guides and character runs are untouched; these are separate records.
import { guideExtras } from '../guide-extras.js';
import { h, mount, icon, get, api, post, setting, saveSettings, on, notice, toast, relTime, fmtDate, cap, confirmDialog, modal, WINDOW_ID } from '../core.js';
import { go, popoutButton, pinButton, openPopout } from '../shell.js';
import { t } from '../i18n.js';
import { linkChip, pickLink, linkedNotes, fileToBase64, pickFile, downloadText, openRoute } from '../links.js';

export const SCOPES = [['custom', 'Custom'], ['gym_rerun', 'Gym rerun'], ['elite_four', 'Elite Four rerun'], ['money', 'Money-making'], ['farming', 'Farming'],
  ['shiny', 'Shiny hunting'], ['daily', 'Daily routine'], ['item_hunt', 'Item hunt'], ['seasonal', 'Seasonal event'], ['breeding', 'Breeding routine'], ['hunting', 'Hunting plan'], ['storyline', 'Storyline']];
const REGIONS = ['', 'kanto', 'johto', 'hoenn', 'sinnoh', 'unova'];
let unsub = [];
export function dispose() { unsub.forEach((u) => u()); unsub = []; }

function progressBar(done, total) {
  const pct = total ? Math.round(done / total * 100) : 0;
  return h('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('span', { style: { width: pct + '%' } }));
}

export async function render(el, route) {
  dispose();
  const id = route.parts[1];
  if (id) return renderGuide(el, id, route);
  const res = await get('/api/cguides?archived=1');
  const page = h('div', { class: 'page' });
  mount(el, page);
  page.append(h('div', { class: 'page-head' },
    h('div', null, h('h1', null, 'My Guides'), h('div', { class: 'sub' }, 'Your own checklists — gym and Elite Four reruns, money-making, farming, shiny hunts, daily routines — with timers, a team and repeatable cycles.')),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: () => createDialog() }, icon('plus'), t('cguide.new')),
      h('button', { class: 'btn', onclick: () => importDialog() }, icon('download'), t('common.import')),
      pinButton({ kind: 'tool', id: 'cguides' }), popoutButton('customguide'))));
  const cat = route.query.get('cat') || '';
  const used = [...new Set(res.guides.map((g) => g.scope))];
  if (used.length > 1) page.append(h('div', { class: 'row wrap', style: { marginBottom: '10px' }, role: 'tablist', 'aria-label': 'Categories' },
    [['', 'All'], ...SCOPES.filter(([k]) => used.includes(k))].map(([k, l]) => h('button', { class: 'chip btnlike' + (cat === k ? ' active' : ''), role: 'tab', 'aria-selected': String(cat === k),
      onclick: () => go('#/guides/mine' + (k ? '?cat=' + k : '')) }, l, h('span', { class: 'count' }, k ? res.guides.filter((g) => g.scope === k && !g.archived_at).length : res.guides.filter((g) => !g.archived_at).length)))));
  const inCat = (g) => !cat || g.scope === cat;
  const active = res.guides.filter((g) => !g.archived_at && inCat(g)), archived = res.guides.filter((g) => g.archived_at && inCat(g));
  const card = (g) => h('button', { class: 'card cg-card', onclick: () => go('#/guides/mine/' + g.id) },
    h('div', { class: 'row' }, h('strong', { class: 'grow' }, g.title), h('span', { class: 'chip' }, g.scope_label), g.recurring ? h('span', { class: 'chip', title: 'Repeatable' }, '↻ ' + g.cycle_number) : null),
    h('div', { class: 'small muted' }, [g.region && cap(g.region), g.location].filter(Boolean).join(' · ') || ' '),
    progressBar(g.done, g.checks), h('div', { class: 'tiny muted' }, `${g.done} / ${g.checks} done · edited ${relTime(g.updated_at)}` + (g.cycles_completed ? ` · ${g.cycles_completed} cycles completed` : '')));
  page.append(active.length ? h('div', { class: 'cg-grid' }, active.map(card)) :
    h('div', { class: 'empty' }, h('h3', null, 'No guides yet'), h('p', null, 'Start with a blank guide, or import a .txt/.md/.odt/.docx file you wrote.'),
      h('button', { class: 'btn primary', onclick: () => createDialog() }, t('cguide.new'))));
  if (archived.length) page.append(h('details', null, h('summary', { class: 'small' }, `${t('notes.archived')} (${archived.length})`), h('div', { class: 'cg-grid' }, archived.map(card))));
  unsub.push(on('cguides', (d, ev) => { if (ev.origin !== WINDOW_ID) render(el, route); }));
  if (route.query.get('new')) { history.replaceState(null, '', '#/guides/mine'); createDialog(); }
}

async function createDialog(prefill = {}) {
  const v = { title: '', scope: 'custom', region: '', location: '', recurring: false, description: '', ...prefill };
  const body = h('div', { class: 'stack tight' },
    h('label', { class: 'label' }, 'Title'), h('input', { class: 'input', value: v.title, maxlength: 120, oninput: (e) => { v.title = e.target.value; } }),
    h('div', { class: 'grid-2' }, h('div', null, h('label', { class: 'label' }, 'Type'), h('select', { class: 'input', onchange: (e) => { v.scope = e.target.value; if (e.target.value === 'gym_rerun') { v.recurring = true; rec.checked = true; } } },
      SCOPES.map(([a, b]) => h('option', { value: a, selected: v.scope === a ? 'selected' : null }, b)))),
    h('div', null, h('label', { class: 'label' }, 'Region'), h('select', { class: 'input', onchange: (e) => { v.region = e.target.value; } }, REGIONS.map((r) => h('option', { value: r }, r ? cap(r) : '—'))))),
    h('label', { class: 'label' }, 'Location (optional)'), h('input', { class: 'input', maxlength: 80, oninput: (e) => { v.location = e.target.value; } }));
  const rec = h('input', { type: 'checkbox', class: 'check', checked: v.recurring, onchange: (e) => { v.recurring = e.target.checked; } });
  body.append(h('label', { class: 'row' }, rec, h('span', null, 'Repeatable (start a new cycle when finished, keep history)')));
  const ok = await modal({ title: t('cguide.new'), body, actions: [{ label: t('common.cancel'), kind: 'ghost', value: false },
    { label: 'Create', kind: 'primary', value: true, handler: () => (v.title.trim() ? true : (toast('Give the guide a title'), false)) }] });
  if (!ok) return;
  const g = await post('/api/cguides', v);
  go('#/guides/mine/' + g.id + '?edit=1');
}

async function importDialog() {
  const file = await pickFile('.txt,.md,.markdown,.odt,.docx,.html,.htm');
  if (!file) return;
  let prev;
  try { prev = await post('/api/cguides/import/preview', { filename: file.name, content_b64: await fileToBase64(file) }); } catch (e) { toast(e.message, { kind: 'warn' }); return; }
  const title = h('input', { class: 'input', value: prev.title });
  const ok = await modal({ title: 'Import guide', wide: true, body: h('div', { class: 'stack tight' },
    h('div', { class: 'small' }, `${prev.count} steps found in ${file.name}. Your file stays on this computer; the steps become a guide you can edit.`),
    prev.warnings.map((w) => notice('info', w)), h('label', { class: 'label' }, 'Title'), title,
    h('div', { class: 'cg-preview' }, prev.steps.slice(0, 60).map((s) => h('div', { class: 'cg-step k-' + s.kind, style: { paddingLeft: (s.depth * 16) + 'px' } }, s.kind === 'check' ? '☐ ' : '', s.text)),
      prev.steps.length > 60 ? h('div', { class: 'tiny muted' }, `… and ${prev.steps.length - 60} more`) : null)),
  actions: [{ label: t('common.cancel'), kind: 'ghost', value: false }, { label: t('common.import'), kind: 'primary', value: true }] });
  if (!ok) return;
  const g = await post('/api/cguides', { title: title.value || prev.title, steps: prev.steps, source: file.name });
  go('#/guides/mine/' + g.id);
}

export function stepRow(g, s, { onToggle, compact } = {}) {
  if (s.kind === 'heading') return h('h3', { class: 'cg-heading' }, s.text);
  if (s.kind === 'text') return h('p', { class: 'cg-text small', style: { marginLeft: (s.depth * 18) + 'px' } }, s.text);
  const box = h('input', { type: 'checkbox', class: 'check', checked: !!s.done_at, 'aria-label': s.text, onchange: (e) => onToggle(s, e.target.checked) });
  return h('label', { class: 'cg-check' + (s.done_at ? ' done' : ''), dataset: { step: s.id }, style: { marginLeft: (s.depth * 18) + 'px' } }, box,
    h('span', { class: 'grow' }, s.text, !compact && s.links.length ? h('span', { class: 'row wrap', style: { marginTop: '2px' } }, s.links.map((l) => linkChip(l))) : null,
      !compact && s.media_url ? h('img', { src: s.media_url, alt: '', class: 'cg-img' }) : null),
    !compact && s.done_at ? h('span', { class: 'tiny muted nowrap' }, relTime(s.done_at)) : null);
}

async function renderGuide(el, id, route) {
  let g;
  try { g = await get('/api/cguides/' + id); } catch (e) { mount(el, h('div', { class: 'page' }, notice('bad', 'Guide not found'), h('button', { class: 'btn', onclick: () => go('#/guides/mine') }, t('common.back')))); return; }
  const editing = route.query.get('edit') === '1';
  const page = h('div', { class: 'page' });
  mount(el, page);
  const toggle = async (s, done) => { g = await post(`/api/cguides/${g.id}/mark`, { step_id: s.id, done }); draw(); };
  const head = () => h('div', { class: 'page-head' }, h('button', { class: 'btn ghost', onclick: () => go('#/guides/mine') }, icon('back'), t('cguide.title')),
    h('div', null, h('h1', null, g.title), h('div', { class: 'sub' }, [g.scope_label, g.region && cap(g.region), g.location, g.recurring ? `cycle ${g.cycle ? g.cycle.number : 1}` : null].filter(Boolean).join(' · '))),
    h('div', { class: 'actions' }, editing ? h('button', { class: 'btn primary', onclick: () => go('#/guides/mine/' + g.id) }, 'Done editing') :
      h('button', { class: 'btn', onclick: () => go('#/guides/mine/' + g.id + '?edit=1') }, icon('edit'), t('common.edit')),
    h('button', { class: 'btn ghost', title: 'Open as a floating checklist', onclick: async () => { await saveSettings({ 'customguide.active': g.id }); openPopout('customguide'); } }, icon('popout'), t('common.popout')),
    h('button', { class: 'btn ghost', onclick: async () => { const r = await get(`/api/cguides/${g.id}/export`); downloadText(`${g.title.replace(/[^\w-]+/g, '_')}.md`, r.markdown); } }, icon('download'), 'Markdown')));
  const body = h('div');
  const gx = guideExtras({ key: 'cg:' + g.id, title: g.title, steps: Object.fromEntries(g.steps.map((s) => [s.id, s.text.slice(0, 40)])),
    cycle: async (create) => { if (create && !g.cycle) g.cycle = await post(`/api/cguides/${g.id}/cycle`); return g.cycle ? g.cycle.id : null; } });
  unsub.push(gx.dispose);
  const gxPanel = gx.panel();
  const row = (s) => (s.kind === 'check' ? h('div', { class: 'cg-step-wrap' }, stepRow(g, s, { onToggle: toggle }), h('div', { style: { marginLeft: (s.depth * 18 + 28) + 'px' } }, gx.stepTimers(s.id)))
    : stepRow(g, s, { onToggle: toggle }));
  const draw = () => {
    if (editing) { mount(body, editor(g, (ng) => { g = ng; })); return; }
    mount(body, h('div', { class: 'grid-2', style: { gridTemplateColumns: 'minmax(0,1fr) minmax(260px, 370px)', alignItems: 'start' } },
      h('div', { class: 'card stack tight' }, g.description ? h('p', { class: 'small', style: { margin: 0, whiteSpace: 'pre-line' } }, g.description) : null,
        h('div', { class: 'row' }, progressBar(g.done, g.checks), h('span', { class: 'small nowrap' }, `${g.done} / ${g.checks}`)),
        g.steps.length ? g.steps.map(row) : h('div', { class: 'empty' }, 'No steps yet. ', h('button', { class: 'btn small', onclick: () => go('#/guides/mine/' + g.id + '?edit=1') }, t('common.edit')))),
      h('div', { class: 'stack' },
        h('div', { class: 'card stack tight' }, h('h3', { style: { margin: 0 } }, g.recurring ? `Cycle ${g.cycle ? g.cycle.number : 1}` : 'Progress'),
          g.cycle ? h('div', { class: 'small muted' }, 'Started ' + fmtDate(g.cycle.started_at, true)) : null,
          h('button', { class: 'btn' + (g.done === g.checks && g.checks ? ' primary' : ''), onclick: async () => {
            if (g.done < g.checks && !(await confirmDialog('Finish this cycle?', `${g.checks - g.done} steps are not ticked. They stay unticked in the history.`, 'Finish cycle'))) return;
            g = await post(`/api/cguides/${g.id}/complete`, { note: '' }); toast(g.recurring ? `Cycle finished — cycle ${g.cycle.number} started` : 'Guide marked complete'); draw(); gx.load(); } },
          g.recurring ? 'Finish cycle & start next' : 'Mark complete'),
          g.history.filter((c) => c.completed_at).length ? h('div', { class: 'stack tight' }, h('span', { class: 'label' }, 'History'),
            g.history.filter((c) => c.completed_at).slice(0, 12).map((c) => h('div', { class: 'small' }, `#${c.number} · ${fmtDate(c.completed_at)} · ${c.done}/${g.checks}`, c.note ? ` · ${c.note}` : ''))) : null),
        gxPanel,
        linkedNotes('custom_guide', g.id, g.title),
        h('div', { class: 'row wrap' }, h('button', { class: 'btn ghost small', onclick: async () => { g = await post(`/api/cguides/${g.id}/archive`, { archived: !g.archived_at }); draw(); } },
          icon('archive'), g.archived_at ? t('common.unarchive') : t('common.archive')),
        h('button', { class: 'btn danger ghost small', onclick: async () => { if (await confirmDialog('Delete guide?', 'Steps and cycle history will be removed. Export it first if you want a copy.', t('common.delete'), true)) {
          await api('DELETE', '/api/cguides/' + g.id); go('#/guides/mine'); } } }, icon('trash'), t('common.delete'))))));
  };
  page.append(head(), body);
  draw();
  if (!editing) gx.load().catch((e) => console.warn(e));
  unsub.push(on('cguides', async (d, ev) => { if (ev.origin !== WINDOW_ID && d.id === g.id && !editing) { g = await get('/api/cguides/' + g.id); draw(); } }));
}

function editor(g, onSaved) {
  const meta = { title: g.title, scope: g.scope, region: g.region || '', location: g.location || '', recurring: g.recurring, description: g.description };
  let steps = g.steps.map((s) => ({ id: s.id, kind: s.kind, depth: s.depth, text: s.text, links: s.links, media_id: s.media_id }));
  const status = h('span', { class: 'tiny muted' });
  const list = h('div', { class: 'stack tight cg-edit-list' });
  const save = async () => {
    status.textContent = t('common.saving');
    try {
      await api('PATCH', '/api/cguides/' + g.id, meta);
      const ng = await api('PUT', `/api/cguides/${g.id}/steps`, { steps: steps.filter((s) => s.text.trim() || s.kind === 'heading') });
      steps = ng.steps.map((s) => ({ id: s.id, kind: s.kind, depth: s.depth, text: s.text, links: s.links, media_id: s.media_id }));
      onSaved(ng); status.textContent = t('common.saved'); drawList();
    } catch (e) { status.textContent = e.message; }
  };
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= steps.length) return; [steps[i], steps[j]] = [steps[j], steps[i]]; drawList(); };
  const drawList = () => mount(list, steps.map((s, i) => h('div', { class: 'cg-edit-row', style: { marginLeft: (s.depth * 18) + 'px' } },
    h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': 'Step kind', onchange: (e) => { s.kind = e.target.value; } },
      [['check', '☐'], ['heading', 'H'], ['text', '¶']].map(([a, b]) => h('option', { value: a, selected: s.kind === a ? 'selected' : null }, b))),
    h('input', { class: 'input grow', value: s.text, maxlength: 4000, 'aria-label': `Step ${i + 1}`, oninput: (e) => { s.text = e.target.value; },
      onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); steps.splice(i + 1, 0, { kind: s.kind === 'heading' ? 'check' : s.kind, depth: s.depth, text: '', links: [] }); drawList(); list.querySelectorAll('input.grow')[i + 1].focus(); }
        if (e.key === 'Tab') { e.preventDefault(); s.depth = Math.max(0, Math.min(3, s.depth + (e.shiftKey ? -1 : 1))); drawList(); list.querySelectorAll('input.grow')[i].focus(); } } }),
    s.links.map((l, li) => linkChip(l, () => { s.links.splice(li, 1); drawList(); })),
    h('button', { class: 'icon-btn sm', title: 'Link to a Pokémon, item, location…', 'aria-label': 'Add link', onclick: async () => { const l = await pickLink(); if (l) { s.links.push(l); drawList(); } } }, icon('plus')),
    h('button', { class: 'icon-btn sm' + (s.media_id ? ' on' : ''), title: s.media_id ? 'Picture attached (click to replace)' : 'Attach a picture', 'aria-label': 'Attach picture', onclick: async () => {
      const f = await pickFile('image/png,image/jpeg,image/gif,image/webp'); if (!f) return;
      try { const m = await post('/api/media', { filename: f.name, data_b64: await fileToBase64(f) }); s.media_id = m.id; drawList(); } catch (x) { toast(x.message, { kind: 'warn' }); } } }, icon('eye')),
    h('button', { class: 'icon-btn sm', title: 'Move up', 'aria-label': 'Move up', onclick: () => move(i, -1) }, '↑'),
    h('button', { class: 'icon-btn sm', title: 'Move down', 'aria-label': 'Move down', onclick: () => move(i, 1) }, '↓'),
    h('button', { class: 'icon-btn sm', title: t('common.remove'), 'aria-label': t('common.remove'), onclick: () => { steps.splice(i, 1); drawList(); } }, '✕'))));
  drawList();
  return h('div', { class: 'card stack tight' },
    h('div', { class: 'grid-2' }, h('div', null, h('label', { class: 'label' }, 'Title'), h('input', { class: 'input', value: meta.title, maxlength: 120, oninput: (e) => { meta.title = e.target.value; } })),
      h('div', null, h('label', { class: 'label' }, 'Type'), h('select', { class: 'input', onchange: (e) => { meta.scope = e.target.value; } }, SCOPES.map(([a, b]) => h('option', { value: a, selected: meta.scope === a ? 'selected' : null }, b))))),
    h('div', { class: 'grid-3' }, h('div', null, h('label', { class: 'label' }, 'Region'), h('select', { class: 'input', onchange: (e) => { meta.region = e.target.value; } }, REGIONS.map((r) => h('option', { value: r, selected: meta.region === r ? 'selected' : null }, r ? cap(r) : '—')))),
      h('div', null, h('label', { class: 'label' }, 'Location'), h('input', { class: 'input', value: meta.location, maxlength: 80, oninput: (e) => { meta.location = e.target.value; } })),
      h('label', { class: 'row', style: { alignSelf: 'end' } }, h('input', { type: 'checkbox', class: 'check', checked: meta.recurring, onchange: (e) => { meta.recurring = e.target.checked; } }), 'Repeatable')),
    h('label', { class: 'label' }, 'Description'), h('textarea', { class: 'input', rows: 2, maxlength: 4000, oninput: (e) => { meta.description = e.target.value; } }, meta.description),
    h('div', { class: 'tiny muted' }, 'Enter adds a step below · Tab / Shift+Tab indents · ☐ checklist, H heading, ¶ text. Ticks are kept when you reorder or edit text.'),
    list,
    h('div', { class: 'row wrap' }, h('button', { class: 'btn small', onclick: () => { steps.push({ kind: 'check', depth: 0, text: '', links: [] }); drawList(); list.querySelector('.cg-edit-row:last-child input.grow').focus(); } }, icon('plus'), 'Step'),
      h('button', { class: 'btn small ghost', onclick: () => { steps.push({ kind: 'heading', depth: 0, text: '', links: [] }); drawList(); } }, icon('plus'), 'Heading'),
      h('span', { class: 'grow' }), status, h('button', { class: 'btn primary', onclick: save }, t('common.save'))));
}

// --------------------------------------------------------------- popout
export async function renderCustomGuidePopout(el, mode) {
  const list = await get('/api/cguides');
  let id = setting('customguide.active');
  if (!list.guides.some((g) => g.id === id)) id = list.guides[0] && list.guides[0].id;
  if (!id) { mount(el, h('div', { class: 'empty' }, 'No guides yet. ', h('button', { class: 'btn small', onclick: () => openRoute('#/guides/mine') }, t('cguide.new')))); return; }
  let g = await get('/api/cguides/' + id);
  const draw = () => {
    const checks = g.steps.filter((s) => s.kind === 'check');
    const next = checks.find((s) => !s.done_at);
    const picker = h('select', { class: 'input', 'aria-label': 'Guide', onchange: async (e) => { await saveSettings({ 'customguide.active': e.target.value }); renderCustomGuidePopout(el, mode); } },
      list.guides.map((x) => h('option', { value: x.id, selected: x.id === g.id ? 'selected' : null }, x.title)));
    const toggle = async (s, done) => { g = await post(`/api/cguides/${g.id}/mark`, { step_id: s.id, done }); draw(); };
    if (mode === 'compact') {
      mount(el, h('div', { class: 'row' }, h('strong', { class: 'grow ellipsis' }, g.title), h('span', { class: 'small nowrap' }, `${g.done}/${g.checks}`)), progressBar(g.done, g.checks),
        next ? stepRow(g, next, { onToggle: toggle, compact: true }) : h('div', { class: 'small' }, '✓ All done', g.recurring ? h('button', { class: 'btn small', style: { marginLeft: '6px' }, onclick: async () => { g = await post(`/api/cguides/${g.id}/complete`, {}); draw(); } }, 'Next cycle') : null));
      return;
    }
    mount(el, h('div', { class: 'row' }, picker, h('span', { class: 'small nowrap' }, `${g.done}/${g.checks}`)), progressBar(g.done, g.checks),
      h('div', { class: 'stack tight', style: { marginTop: '6px' } }, g.steps.map((s) => stepRow(g, s, { onToggle: toggle, compact: mode !== 'expanded' }))),
      g.done === g.checks && g.checks && g.recurring ? h('button', { class: 'btn primary small', onclick: async () => { g = await post(`/api/cguides/${g.id}/complete`, {}); draw(); } }, 'Finish cycle & start next') : null);
    const n = el.querySelector(`[data-step="${next && next.id}"]`); if (n) n.scrollIntoView({ block: 'nearest' });
  };
  draw();
  on('cguides', async (d, ev) => { if (ev.origin !== WINDOW_ID && d.id === g.id && el.isConnected) { g = await get('/api/cguides/' + g.id); draw(); } });
}
