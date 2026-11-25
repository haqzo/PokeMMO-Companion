import { WALKTHROUGH_TEXT } from '../walkthrough-locales.js';
import { lang } from '../i18n.js';
import { gameTerm, searchText } from '../game-locale.js';
import { t as translateUI } from '../i18n.js';
// Guides (docs/design/14–17): named character runs, five regions, manual progress.
import { guideContext, shortcutFor, displayCombo } from '../shortcuts.js';
import { h, mount, icon, get, post, api, state, setting, saveSettings, badge, notice, cap, tabs, toast, confirmDialog, modal, on, debounce, fmtDate, relTime, extLink, sourceInfo } from '../core.js';
import { go, openPopout } from '../shell.js';
import { downloadJson } from '../components.js';
import { guideExtras } from '../guide-extras.js';

const REGIONS = ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova'];
let unsub = [];
let ui = { chapter: {}, search: '', all: {} };
function stepLabel(step) {
  const entry = WALKTHROUGH_TEXT[step.id];
  if (entry && entry[0] === step.text_hash && lang() !== 'en') return entry[lang() === 'es' ? 1 : 2];
  return step.text;
}
const chapterLabel = (name) => gameTerm('location', name);

export function dispose() { unsub.forEach((u) => u()); unsub = []; }

export function runInitial(run) { return (run.character_name || '?').trim().charAt(0).toUpperCase(); }

export async function runForm({ title = 'New character run', name = '', label = '', region = 'kanto', withRegion = true, okLabel = 'Create run' } = {}) {
  const err = h('div', { class: 'small', style: { color: 'var(--danger)' } });
  const nameIn = h('input', { class: 'input', maxlength: 24, value: name, placeholder: 'Your character’s name', 'aria-label': 'Character name', autocomplete: 'off' });
  const labelIn = h('input', { class: 'input', maxlength: 24, value: label, placeholder: 'e.g. Main, Alt, Nuzlocke', 'aria-label': 'Run label' });
  const regionSel = h('select', { class: 'input', 'aria-label': 'Start region' }, REGIONS.map((r) => h('option', { value: r, selected: r === region ? 'selected' : null }, cap(r))));
  return modal({ title, body: h('div', { class: 'stack tight' },
    h('div', { class: 'field' }, h('label', null, 'Character name (required)'), nameIn),
    h('div', { class: 'field' }, h('label', null, 'Run label (optional) — separate playthroughs of the same character'), labelIn),
    withRegion ? h('div', { class: 'field' }, h('label', null, 'Open region first (you can switch any time)'), regionSel) : null,
    h('div', { class: 'tiny muted' }, 'Just a typed name — no avatars or account login. Progress is stored on this computer.'), err),
  actions: [{ label: translateUI('ui.cancel'), value: null, kind: 'ghost' }, { label: okLabel, kind: 'primary', handler: () => {
    const v = { name: nameIn.value.trim(), label: labelIn.value.trim(), region: regionSel.value };
    if (!v.name) { err.textContent = 'Please type a character name.'; nameIn.focus(); return false; }
    return v; } }] });
}

export async function createRun() {
  const v = await runForm();
  if (!v) return null;
  try { const run = await post('/api/guides/runs', v); toast(`Created run “${run.display}”`); return run; }
  catch (e) { toast(e.message, { kind: 'warn', timeout: 6000 }); return null; }
}

export async function render(el, route) {
  dispose();
  const page = h('div', { class: 'page' });
  mount(el, page);
  const runs = await get('/api/guides/runs');
  // Browse the bundled walkthroughs without a character run (or with ?browse=1): read-only, nothing is ticked.
  if (route.query.get('browse') || (!runs.runs.length && REGIONS.includes(route.query.get('region')))) return browse(page, route, runs, el);
  if (!runs.runs.length) {
    page.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, translateUI('ui.storyline')), h('div', { class: 'sub' }, 'Storyline walkthroughs with your own per-character progress. My Guides work without a run.'))),
      h('div', { class: 'card content-narrow stack', style: { maxWidth: '620px' } }, h('h2', { style: { margin: 0 } }, 'Create your first character run'),
        h('p', { class: 'muted', style: { margin: 0 } }, 'Type your character’s name. Each run keeps its own checkmarks in all five regions; you can create as many as you like.'),
        h('div', { class: 'row wrap' }, h('button', { class: 'btn primary', onclick: async () => { if (await createRun()) render(el, route); } }, icon('plus'), 'Create run'),
          h('button', { class: 'btn ghost', onclick: () => go('#/guides/storyline?browse=1&region=kanto') }, 'Browse the walkthroughs first')),
        runs.deleted.length ? h('div', { class: 'small muted' }, `${runs.deleted.length} deleted run(s) can be restored from the run menu after creating a run, or in Settings › Guides.`) : null));
    return;
  }
  let run = runs.runs.find((r) => r.id === runs.active) || runs.runs[0];
  if (run.id !== runs.active) await saveSettings({ 'guides.active_run': run.id });
  const region = REGIONS.includes(route.query.get('region')) ? route.query.get('region') : run.last_region || 'kanto';
  const st = await get(`/api/guides/runs/${run.id}/state?region=${region}`);
  const overview = await get(`/api/guides/runs/${run.id}/overview`);
  Object.assign(guideContext, { run: run.id, region, step: st.active_step_id, refresh: () => { if (el.isConnected && location.hash.startsWith('#/guides')) render(el, route); } });
  unsub.push(() => Object.assign(guideContext, { run: null, region: null, step: null, refresh: null }));

  page.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, translateUI('ui.storyline')), h('div', { class: 'sub' }, 'Every checkmark is yours to set — nothing is read from the game.')),
    h('div', { class: 'actions' }, runSelector(runs, run, el, route),
      h('button', { class: 'btn', title: 'Open the Storyline popout', onclick: () => openPopout('storyline') }, icon('popout'), 'Storyline popout'))));
  const sk = ['guide.prev', 'guide.next', 'guide.toggle'].map((a) => shortcutFor(a));
  page.append(h('div', { class: 'tiny muted', style: { margin: '-6px 0 10px' } }, sk.some(Boolean) ?
    `Keyboard (while this window is focused): previous ${displayCombo(sk[0])} · next ${displayCombo(sk[1])} · tick/untick ${displayCombo(sk[2])} — change in Settings › Keyboard shortcuts.` :
    'Guide keyboard shortcuts are unassigned — set them in Settings › Keyboard shortcuts.'));

  page.append(h('div', { class: 'row wrap', style: { marginBottom: '12px' } }, tabs(REGIONS.map((r) => {
    const c = overview[r].mandatory.total ? overview[r].mandatory : overview[r].unclassified;
    return { id: r, label: cap(r), count: c.total ? `${c.done}/${c.total}` : undefined };
  }), region, async (r) => { await api('PATCH', `/api/guides/runs/${run.id}`, { region: r }); go(`#/guides/storyline?region=${r}`); }, 'Regions')));

  const steps = st.steps;
  const done = new Set(st.done);
  const src = st.sources.find((s) => s.id === st.source);
  const isImported = st.source !== 'milestones';   // a full walkthrough (built-in or your own): every step counts
  const ownFile = st.source === 'imported';         // view defaults unchanged: only your own files open chapter by chapter
  const counts = isImported ? st.counts.unclassified : st.counts.mandatory;
  const pct = counts.total ? Math.round(counts.done / counts.total * 100) : 0;

  const sourceSel = h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': 'Guide source', onchange: async (e) => {
    await api('PATCH', `/api/guides/runs/${run.id}`, { region, source: e.target.value }); render(el, route); } },
  st.sources.map((s) => h('option', { value: s.id, selected: s.id === st.source ? 'selected' : null }, `${s.label} · ${s.steps} steps`)));

  const header = h('div', { class: 'card stack tight', style: { marginBottom: '14px' } },
    h('div', { class: 'row wrap' }, h('h2', { style: { margin: 0, fontSize: '1.2rem' } }, cap(region)), sourceSel, sourceInfo(src.status), h('span', { class: 'grow' }),
      h('button', { class: 'btn ghost small', onclick: () => jumpToCurrent() }, icon('target'), 'Jump to current'),
      h('button', { class: 'btn ghost small', title: 'Undo the last checkbox change', onclick: async () => { const r = await post(`/api/guides/runs/${run.id}/undo`); toast(r.undone ? `Undid ${r.undone} change(s)` : 'Nothing to undo'); render(el, route); } }, icon('undo'), 'Undo'),
      h('button', { class: 'btn ghost small', onclick: () => bulkMark() }, 'Mark up to current…')),
    h('div', { class: 'row' }, h('div', { class: 'progress grow' }, h('span', { style: { width: pct + '%' } })),
      h('span', { class: 'small nowrap' }, isImported ? translateUI('ui.guide_steps', { done: counts.done, total: counts.total }) : `${counts.done}/${counts.total} main-story milestones`)),
    h('div', { class: 'small muted' }, isImported
      ? (st.source === 'walkthrough'
        ? 'Complete walkthrough by its original author, included with Companion. Progress counts every step. Steps are tagged automatically (battle, item, …).'
        : 'Your own walkthrough file: progress counts every step. Steps are tagged automatically and not checked against the current game.')
      : `Progress counts main-story milestones only. Optional steps: ${st.counts.optional.done}/${st.counts.optional.total}. ${src.note}`),
    null);
  page.append(header);
  const gx = guideExtras({ key: `story:${run.id}:${region}`, title: `${cap(region)} storyline · ${run.display}`, run: run.id,
    steps: Object.fromEntries(st.steps.map((s) => [s.id, s.text.slice(0, 40)])) });
  unsub.push(gx.dispose);
  page.append(h('details', { class: 'gx-story', open: setting('guides.extras_open') === false ? null : '' , ontoggle: (e) => saveSettings({ 'guides.extras_open': e.target.open }).catch(() => {}) },
    h('summary', { class: 'small' }, 'Timers & team for this region'), gx.panel()));
  gx.load().catch((e) => console.warn(e));

  if (st.changed.length) {
    page.append(h('div', { style: { marginBottom: '12px' } }, notice('warn', h('strong', null, `${st.changed.length} checked step(s) changed wording since you ticked them. `),
      'Your checkmarks were kept. Review them (marked “changed”) and acknowledge.',
      h('button', { class: 'btn small', style: { marginLeft: '8px' }, onclick: async () => { await post(`/api/guides/runs/${run.id}/acknowledge`, { steps: st.changed }); render(el, route); } }, 'Acknowledge all'))));
  }

  // chapters
  const chapters = [];
  for (const s of steps) { const last = chapters[chapters.length - 1]; if (!last || last.key !== (s.chapter_index ?? s.chapter)) chapters.push({ key: s.chapter_index ?? s.chapter, name: s.chapter, steps: [s] }); else last.steps.push(s); }
  const curChapter = chapters.find((c) => c.steps.some((s) => s.id === st.active_step_id)) || chapters[0];
  const showAll = ui.all[region + st.source] ?? !ownFile;
  let selKey = ui.chapter[region + st.source] ?? curChapter.key;
  const stepsBox = h('div', { class: 'stack tight' });
  const searchIn = h('input', { class: 'input', type: 'search', placeholder: translateUI('ui.guide_search_steps_in_region'), value: ui.search, oninput: debounce((e) => { ui.search = e.target.value; drawSteps(); }, 150) });
  const chapterList = h('div', { class: 'chapters', role: 'listbox', 'aria-label': 'Chapters' });
  const drawChapters = () => mount(chapterList,
    h('button', { class: 'chapter-btn' + (showAll && ui.all[region + st.source] !== false ? ' active' : ''), onclick: () => { ui.all[region + st.source] = true; drawChapters(); drawSteps(); } }, translateUI('ui.guide_all_chapters'), h('span', { class: 'pc' }, `${steps.filter((s) => done.has(s.id)).length}/${steps.length}`)),
    chapters.map((c) => { const d = c.steps.filter((s) => done.has(s.id)).length;
      return h('button', { class: 'chapter-btn' + (!(ui.all[region + st.source] ?? !ownFile) && c.key === selKey ? ' active' : '') + (d === c.steps.length ? ' complete' : ''), role: 'option',
        onclick: () => { ui.all[region + st.source] = false; selKey = c.key; ui.chapter[region + st.source] = c.key; drawChapters(); drawSteps(); } },
      c.steps.some((s) => s.id === st.active_step_id) ? icon('target') : null, h('span', { class: 'ellipsis' }, chapterLabel(c.name)), h('span', { class: 'pc' }, `${d}/${c.steps.length}`)); }));
  const drawSteps = () => {
    const all = ui.all[region + st.source] ?? !ownFile;
    let list = all ? steps : (chapters.find((c) => c.key === selKey) || curChapter).steps;
    const q = searchText(ui.search);
    if (q) list = steps.filter((s) => [s.text, stepLabel(s), s.chapter, chapterLabel(s.chapter)].some((v) => searchText(v).includes(q)));
    const out = [];
    let lastChapter = null;
    for (const s of list) {
      if ((all || q) && s.chapter !== lastChapter) { out.push(h('div', { class: 'step-chapter' }, chapterLabel(s.chapter))); lastChapter = s.chapter; }
      out.push(stepRow(s));
    }
    mount(stepsBox, out.length ? out : h('div', { class: 'empty' }, translateUI('ui.guide_no_steps')));
  };
  const stepRow = (s) => {
    const isDone = done.has(s.id);
    const changed = st.changed.includes(s.id);
    const cb = h('input', { type: 'checkbox', class: 'check', checked: isDone, 'aria-label': 'Done: ' + s.text.slice(0, 80), onchange: async (e) => {
      const nowDone = e.target.checked;
      const idx = steps.findIndex((x) => x.id === s.id);
      const next = steps.slice(idx + 1).find((x) => !done.has(x.id));
      await post(`/api/guides/runs/${run.id}/steps`, { step: s.id, done: nowDone, region, advance: nowDone && s.id === st.active_step_id, next_active: next && next.id });
      if (nowDone) done.add(s.id); else done.delete(s.id);
      render(el, route);
    } });
    return h('div', { class: 'step' + (isDone ? ' done' : '') + (s.id === st.active_step_id ? ' current' : ''), id: 'step-' + s.id.replace(/[^\w-]/g, '_') }, cb,
      h('div', null, h('div', { class: 's-text' }, stepLabel(s)),
        h('div', { class: 's-meta' }, s.id === st.active_step_id ? h('span', { class: 'badge corroborated plain' }, translateUI('ui.current')) : null,
          s.mandatory === false ? h('span', { class: 'chip' }, translateUI('ui.optional')) : null, s.kind && s.kind !== 'route' ? h('span', { class: 'chip' }, cap(s.kind) + (isImported ? ' (auto-tag)' : '')) : null,
          s.source_url ? extLink(s.source_url, 'Official changelog') : null, changed ? h('span', { class: 'chip tiny warn', title: 'This step changed in the guide after you ticked it' }, 'Changed') : null), gx.stepTimers(s.id)),
      s.id !== st.active_step_id ? h('button', { class: 'btn ghost small', title: 'Make this your current step', onclick: async () => {
        await api('PATCH', `/api/guides/runs/${run.id}`, { region, active_step_id: s.id }); render(el, route); } }, 'Set current') : h('span'));
  };
  page.append(h('div', { class: 'guide-layout' }, h('div', { class: 'stack tight' }, searchIn, chapterList), stepsBox));
  drawChapters(); drawSteps();

  function jumpToCurrent() {
    ui.search = ''; searchIn.value = '';
    ui.all[region + st.source] = false; selKey = curChapter.key; ui.chapter[region + st.source] = selKey;
    drawChapters(); drawSteps();
    const t = document.getElementById('step-' + st.active_step_id.replace(/[^\w-]/g, '_'));
    if (t) t.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  async function bulkMark() {
    const p = await post(`/api/guides/runs/${run.id}/mark-through`, { region, step: st.active_step_id, preview: true });
    if (!p.would_mark) { toast('Everything up to the current step is already checked.'); return; }
    if (await confirmDialog('Mark earlier steps done', `This ticks ${p.would_mark} unchecked step(s) up to and including your current step in ${cap(region)} for ${run.display}. You can undo it.`, 'Mark done')) {
      await post(`/api/guides/runs/${run.id}/mark-through`, { region, step: st.active_step_id }); render(el, route);
    }
  }
  unsub.push(on('guides', (d, ev) => { if (ev.origin && ev.origin.startsWith('main')) return; render(el, route); }));
  if (route.query.get('jump')) setTimeout(jumpToCurrent, 50);
}

function runSelector(runs, run, el, route) {
  const btn = h('button', { class: 'run-pill', style: { cursor: 'pointer', color: 'inherit' }, 'aria-haspopup': 'menu', title: 'Switch or manage character runs' },
    h('span', { class: 'initial' }, runInitial(run)), h('span', { style: { fontWeight: 600 } }, run.character_name),
    run.run_label ? h('span', { class: 'small muted' }, run.run_label) : null, icon('down'));
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.menu').forEach((m) => m.remove());
    const r = btn.getBoundingClientRect();
    const item = (label, fn, ic) => h('button', { onclick: async () => { menu.remove(); await fn(); } }, ic ? icon(ic) : null, label);
    const menu = h('div', { class: 'menu', role: 'menu', style: { top: r.bottom + 4 + 'px', right: (innerWidth - r.right) + 'px' } },
      runs.runs.map((x) => item(x.display + (x.id === run.id ? '  ✓' : ''), async () => { await saveSettings({ 'guides.active_run': x.id }); render(el, { ...route, query: new URLSearchParams() }); })),
      h('div', { class: 'sep' }),
      item('New run…', async () => { if (await createRun()) render(el, { ...route, query: new URLSearchParams() }); }, 'plus'),
      item('Rename…', async () => { const v = await runForm({ title: 'Rename run', name: run.character_name, label: run.run_label, withRegion: false, okLabel: 'Save' });
        if (v) { try { await api('PATCH', `/api/guides/runs/${run.id}`, { name: v.name, label: v.label }); render(el, route); } catch (e2) { toast(e2.message, { kind: 'warn' }); } } }),
      item('Duplicate as new run…', async () => { const v = await runForm({ title: 'Duplicate run (independent copy)', name: run.character_name, label: (run.run_label + ' copy').trim(), withRegion: false, okLabel: 'Duplicate' });
        if (v) { try { const n = await post(`/api/guides/runs/${run.id}/duplicate`, { label: v.label }); await saveSettings({ 'guides.active_run': n.id }); render(el, route); } catch (e2) { toast(e2.message, { kind: 'warn' }); } } }),
      item('Export backup', async () => downloadJson(`pokemmo-companion-backup-${new Date().toISOString().slice(0, 10)}.json`, await get('/api/backup/export')), 'download'),
      runs.deleted.length ? item(`Restore deleted run (${runs.deleted.length})…`, () => restoreDialog(runs.deleted, el, route)) : null,
      h('div', { class: 'sep' }),
      item('Delete this run…', async () => { if (await confirmDialog('Delete run', `Delete “${run.display}”? It can be restored from this menu later (and from backups).`, 'Delete', true)) {
        await api('DELETE', `/api/guides/runs/${run.id}`); render(el, { ...route, query: new URLSearchParams() }); } }, 'trash'));
    document.body.append(menu);
    const close = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 0);
    menu.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { menu.remove(); btn.focus(); } });
    menu.querySelector('button').focus();
  });
  return btn;
}

async function restoreDialog(deleted, el, route) {
  await modal({ title: 'Restore a deleted run', body: h('div', { class: 'list-rows' }, deleted.map((d) => h('div', { class: 'list-row' }, h('span', { class: 'grow' }, d.display),
    h('span', { class: 'when' }, 'deleted ', relTime(d.deleted_at)),
    h('button', { class: 'btn small', onclick: async () => { try { await post(`/api/guides/runs/${d.id}/restore`); document.querySelector('.modal-back').remove(); render(el, route); toast('Run restored'); }
      catch (e) { toast(e.message, { kind: 'warn' }); } } }, translateUI('ui.restore'))))), actions: [{ label: translateUI('ui.close'), kind: 'ghost' }] });
}

// ------------------------------------------------------------ browse without a run
export const WALKTHROUGH_CREDIT = 'Walkthrough text by the original guide author, bundled with permission (see Settings › About & credits).';
async function browse(page, route, runs, el) {
  const region = REGIONS.includes(route.query.get('region')) ? route.query.get('region') : 'kanto';
  const cat = await get('/api/guides/catalog/' + region);
  const q = (route.query.get('q') || '').toLowerCase();
  page.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, translateUI('ui.storyline')),
    h('div', { class: 'sub' }, translateUI('ui.guide_source_readonly'))),
  h('div', { class: 'actions' }, runs.runs.length ? h('button', { class: 'btn', onclick: () => go(`#/guides/storyline?region=${region}`) }, 'Back to my run')
    : h('button', { class: 'btn primary', onclick: async () => { if (await createRun()) go(`#/guides/storyline?region=${region}`); } }, icon('plus'), 'Create a run'))));
  page.append(h('div', { class: 'row wrap', style: { marginBottom: '12px' } }, tabs(REGIONS.map((r) => ({ id: r, label: cap(r) })), region,
    (r) => go(`#/guides/storyline?browse=1&region=${r}`), 'Regions')));
  const chapters = [];
  for (const st of cat.steps) { const last = chapters[chapters.length - 1]; if (!last || last.name !== st.chapter) chapters.push({ name: st.chapter, steps: [st] }); else last.steps.push(st); }
  const search = h('input', { class: 'input', type: 'search', placeholder: translateUI('ui.guide_search_region'), value: q, 'aria-label': translateUI('ui.guide_search_steps'), style: { maxWidth: '320px' } });
  const list = h('div', { class: 'stack tight browse-steps' });
  const draw = () => {
    const term = searchText(search.value);
    mount(list, chapters.map((c) => {
      const hits = term ? c.steps.filter((x) => [x.text, stepLabel(x), c.name, chapterLabel(c.name)].some((v) => searchText(v).includes(term))) : c.steps;
      if (!hits.length) return null;
      return h('details', { class: 'card tight browse-chapter', open: term ? '' : null },
        h('summary', null, h('strong', null, chapterLabel(c.name) || 'Steps'), h('span', { class: 'tiny muted' }, ` · ${hits.length} step${hits.length === 1 ? '' : 's'}`)),
        h('ol', { class: 'browse-list' }, hits.map((x) => h('li', null, stepLabel(x)))));
    }));
  };
  search.addEventListener('input', draw);
  page.append(h('div', { class: 'row wrap', style: { marginBottom: '8px' } }, search, h('span', { class: 'small muted' }, `${cat.steps.length} steps in ${chapters.length} chapters`)), list,
    h('p', { class: 'tiny muted' }, WALKTHROUGH_CREDIT));
  draw();
}
