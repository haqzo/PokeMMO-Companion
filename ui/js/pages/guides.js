import { walkthroughStep } from '../walkthrough-locales.js';
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
const stepLabel = (step) => walkthroughStep(step, lang());
const chapterLabel = (name) => gameTerm('location', name);

export function dispose() { unsub.forEach((u) => u()); unsub = []; }

export function runInitial(run) { return (run.character_name || '?').trim().charAt(0).toUpperCase(); }

export async function runForm({ title = translateUI('ui.guide_new_character_run'), name = '', label = '', region = 'kanto', withRegion = true, okLabel = translateUI('ui.guide_character_run_create') } = {}) {
  const err = h('div', { class: 'small', style: { color: 'var(--danger)' } });
  const nameIn = h('input', { class: 'input', maxlength: 24, value: name, placeholder: translateUI('ui.guide_character_hint'), 'aria-label': translateUI('ui.guide_character'), autocomplete: 'off' });
  const labelIn = h('input', { class: 'input', maxlength: 24, value: label, placeholder: translateUI('ui.b274_guides_001'), 'aria-label': translateUI('ui.guide_run_label') });
  const regionSel = h('select', { class: 'input', 'aria-label': translateUI('ui.guide_starting_region') }, REGIONS.map((r) => h('option', { value: r, selected: r === region ? 'selected' : null }, gameTerm('region', cap(r)))));
  return modal({ title, body: h('div', { class: 'stack tight' },
    h('div', { class: 'field' }, h('label', null, translateUI('ui.guide_character_required')), nameIn),
    h('div', { class: 'field' }, h('label', null, translateUI('ui.guide_run_label_help')), labelIn),
    withRegion ? h('div', { class: 'field' }, h('label', null, translateUI('ui.guide_starting_region_hint')), regionSel) : null,
    h('div', { class: 'tiny muted' }, translateUI('ui.guide_run_storage')), err),
  actions: [{ label: translateUI('ui.cancel'), value: null, kind: 'ghost' }, { label: okLabel, kind: 'primary', handler: () => {
    const v = { name: nameIn.value.trim(), label: labelIn.value.trim(), region: regionSel.value };
    if (!v.name) { err.textContent = translateUI('ui.guide_character_validation'); nameIn.focus(); return false; }
    return v; } }] });
}

export async function createRun() {
  const v = await runForm();
  if (!v) return null;
  try { const run = await post('/api/guides/runs', v); toast(translateUI('ui.b274_guides_030', { name: run.display })); return run; }
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
    page.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, translateUI('ui.storyline')), h('div', { class: 'sub' }, translateUI('ui.guide_storyline_intro')))),
      h('div', { class: 'card content-narrow stack', style: { maxWidth: '620px' } }, h('h2', { style: { margin: 0 } }, translateUI('ui.guide_character_run_first')),
        h('p', { class: 'muted', style: { margin: 0 } }, translateUI('ui.guide_character_run_help')),
        h('div', { class: 'row wrap' }, h('button', { class: 'btn primary', onclick: async () => { if (await createRun()) render(el, route); } }, icon('plus'), translateUI('ui.guide_character_run_create')),
          h('button', { class: 'btn ghost', onclick: () => go('#/guides/storyline?browse=1&region=kanto') }, translateUI('ui.guide_read_before_run'))),
        runs.deleted.length ? h('div', { class: 'small muted' }, translateUI('ui.b274_guides_031', { count: runs.deleted.length })) : null));
    return;
  }
  let run = runs.runs.find((r) => r.id === runs.active) || runs.runs[0];
  if (run.id !== runs.active) await saveSettings({ 'guides.active_run': run.id });
  const region = REGIONS.includes(route.query.get('region')) ? route.query.get('region') : run.last_region || 'kanto';
  const st = await get(`/api/guides/runs/${run.id}/state?region=${region}`);
  const overview = await get(`/api/guides/runs/${run.id}/overview`);
  Object.assign(guideContext, { run: run.id, region, step: st.active_step_id, refresh: () => { if (el.isConnected && location.hash.startsWith('#/guides')) render(el, route); } });
  unsub.push(() => Object.assign(guideContext, { run: null, region: null, step: null, refresh: null }));

  page.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, translateUI('ui.storyline')), h('div', { class: 'sub' }, translateUI('ui.guide_manual_progress'))),
    h('div', { class: 'actions' }, runSelector(runs, run, el, route),
      h('button', { class: 'btn', title: translateUI('ui.guide_window_open'), onclick: () => openPopout('storyline') }, icon('popout'), translateUI('ui.guide_storyline_window')))));
  const sk = ['guide.prev', 'guide.next', 'guide.toggle'].map((a) => shortcutFor(a));
  page.append(h('div', { class: 'tiny muted', style: { margin: '-6px 0 10px' } }, sk.some(Boolean) ?
    translateUI('ui.b274_guides_032', { previous: displayCombo(sk[0]), next: displayCombo(sk[1]), toggle: displayCombo(sk[2]) }) :
    translateUI('ui.b274_guides_002')));

  page.append(h('div', { class: 'row wrap', style: { marginBottom: '12px' } }, tabs(REGIONS.map((r) => {
    const c = overview[r].mandatory.total ? overview[r].mandatory : overview[r].unclassified;
    return { id: r, label: gameTerm('region', cap(r)), count: c.total ? `${c.done}/${c.total}` : undefined };
  }), region, async (r) => { await api('PATCH', `/api/guides/runs/${run.id}`, { region: r }); go(`#/guides/storyline?region=${r}`); }, translateUI('ui.guide_regions'))));

  const steps = st.steps;
  const displayStep = st.source === 'walkthrough' ? stepLabel : (step) => step.text;
  const displayChapter = st.source === 'imported' ? (name) => name : chapterLabel;
  const done = new Set(st.done);
  const src = st.sources.find((s) => s.id === st.source);
  const isImported = st.source !== 'milestones';   // a full walkthrough (built-in or your own): every step counts
  const ownFile = st.source === 'imported';         // view defaults unchanged: only your own files open chapter by chapter
  const counts = isImported ? st.counts.unclassified : st.counts.mandatory;
  const pct = counts.total ? Math.round(counts.done / counts.total * 100) : 0;

  const sourceSel = h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': translateUI('ui.guide_source_control'), onchange: async (e) => {
    await api('PATCH', `/api/guides/runs/${run.id}`, { region, source: e.target.value }); render(el, route); } },
  st.sources.map((s) => h('option', { value: s.id, selected: s.id === st.source ? 'selected' : null }, translateUI('ui.b274_guides_033', { source: s.label, count: s.steps }))));

  const header = h('div', { class: 'card stack tight', style: { marginBottom: '14px' } },
    h('div', { class: 'row wrap' }, h('h2', { style: { margin: 0, fontSize: '1.2rem' } }, gameTerm('region', cap(region))), sourceSel, sourceInfo(src.status), h('span', { class: 'grow' }),
      h('button', { class: 'btn ghost small', onclick: () => jumpToCurrent() }, icon('target'), translateUI('ui.guide_jump_current')),
      h('button', { class: 'btn ghost small', title: translateUI('ui.guide_undo_step'), onclick: async () => { const r = await post(`/api/guides/runs/${run.id}/undo`); toast(r.undone ? translateUI('ui.b274_guides_034', { count: r.undone }) : translateUI('ui.guide_undo_none')); render(el, route); } }, icon('undo'), translateUI('ui.b274_guides_003')),
      h('button', { class: 'btn ghost small', onclick: () => bulkMark() }, translateUI('ui.guide_check_current'))),
    h('div', { class: 'row' }, h('div', { class: 'progress grow' }, h('span', { style: { width: pct + '%' } })),
      h('span', { class: 'small nowrap' }, isImported ? translateUI('ui.guide_steps', { done: counts.done, total: counts.total }) : translateUI('ui.b274_guides_035', { done: counts.done, total: counts.total }))),
    h('div', { class: 'small muted' }, isImported
      ? (st.source === 'walkthrough'
        ? translateUI('ui.b274_guides_004')
        : translateUI('ui.b274_guides_005'))
      : translateUI('ui.b274_guides_036', { done: st.counts.optional.done, total: st.counts.optional.total, note: src.note })),
    null);
  page.append(header);
  const gx = guideExtras({ key: `story:${run.id}:${region}`, title: `${cap(region)} storyline · ${run.display}`, run: run.id,
    steps: Object.fromEntries(st.steps.map((s) => [s.id, s.text.slice(0, 40)])) });
  unsub.push(gx.dispose);
  page.append(h('details', { class: 'gx-story', open: setting('guides.extras_open') === false ? null : '' , ontoggle: (e) => saveSettings({ 'guides.extras_open': e.target.open }).catch(() => {}) },
    h('summary', { class: 'small' }, translateUI('ui.b274_guides_006')), gx.panel()));
  gx.load().catch((e) => console.warn(e));

  if (st.changed.length) {
    page.append(h('div', { style: { marginBottom: '12px' } }, notice('warn', h('strong', null, translateUI('ui.b274_guides_037', { count: st.changed.length })),
      translateUI('ui.b274_guides_007'),
      h('button', { class: 'btn small', style: { marginLeft: '8px' }, onclick: async () => { await post(`/api/guides/runs/${run.id}/acknowledge`, { steps: st.changed }); render(el, route); } }, translateUI('ui.b274_guides_008')))));
  }

  // chapters
  const chapters = [];
  for (const s of steps) { const last = chapters[chapters.length - 1]; if (!last || last.key !== (s.chapter_index ?? s.chapter)) chapters.push({ key: s.chapter_index ?? s.chapter, name: s.chapter, steps: [s] }); else last.steps.push(s); }
  const curChapter = chapters.find((c) => c.steps.some((s) => s.id === st.active_step_id)) || chapters[0];
  const showAll = ui.all[region + st.source] ?? !ownFile;
  let selKey = ui.chapter[region + st.source] ?? curChapter.key;
  const stepsBox = h('div', { class: 'stack tight' });
  const searchIn = h('input', { class: 'input', type: 'search', placeholder: translateUI('ui.guide_search_steps_in_region'), value: ui.search, oninput: debounce((e) => { ui.search = e.target.value; drawSteps(); }, 150) });
  const chapterList = h('div', { class: 'chapters', role: 'listbox', 'aria-label': translateUI('ui.guide_chapters') });
  const drawChapters = () => mount(chapterList,
    h('button', { class: 'chapter-btn' + (showAll && ui.all[region + st.source] !== false ? ' active' : ''), onclick: () => { ui.all[region + st.source] = true; drawChapters(); drawSteps(); } }, translateUI('ui.guide_all_chapters'), h('span', { class: 'pc' }, `${steps.filter((s) => done.has(s.id)).length}/${steps.length}`)),
    chapters.map((c) => { const d = c.steps.filter((s) => done.has(s.id)).length;
      return h('button', { class: 'chapter-btn' + (!(ui.all[region + st.source] ?? !ownFile) && c.key === selKey ? ' active' : '') + (d === c.steps.length ? ' complete' : ''), role: 'option',
        onclick: () => { ui.all[region + st.source] = false; selKey = c.key; ui.chapter[region + st.source] = c.key; drawChapters(); drawSteps(); } },
      c.steps.some((s) => s.id === st.active_step_id) ? icon('target') : null, h('span', { class: 'ellipsis' }, displayChapter(c.name)), h('span', { class: 'pc' }, `${d}/${c.steps.length}`)); }));
  const drawSteps = () => {
    const all = ui.all[region + st.source] ?? !ownFile;
    let list = all ? steps : (chapters.find((c) => c.key === selKey) || curChapter).steps;
    const q = searchText(ui.search);
    if (q) list = steps.filter((s) => [s.text, displayStep(s), s.chapter, displayChapter(s.chapter)].some((v) => searchText(v).includes(q)));
    const out = [];
    let lastChapter = null;
    for (const s of list) {
      if ((all || q) && s.chapter !== lastChapter) { out.push(h('div', { class: 'step-chapter' }, displayChapter(s.chapter))); lastChapter = s.chapter; }
      out.push(stepRow(s));
    }
    mount(stepsBox, out.length ? out : h('div', { class: 'empty' }, translateUI('ui.guide_no_steps')));
  };
  const stepRow = (s) => {
    const isDone = done.has(s.id);
    const changed = st.changed.includes(s.id);
    const cb = h('input', { type: 'checkbox', class: 'check', checked: isDone, 'aria-label': translateUI('ui.guide_done_label', { step: displayStep(s).slice(0, 80) }), onchange: async (e) => {
      const nowDone = e.target.checked;
      const idx = steps.findIndex((x) => x.id === s.id);
      const next = steps.slice(idx + 1).find((x) => !done.has(x.id));
      await post(`/api/guides/runs/${run.id}/steps`, { step: s.id, done: nowDone, region, advance: nowDone && s.id === st.active_step_id, next_active: next && next.id });
      if (nowDone) done.add(s.id); else done.delete(s.id);
      render(el, route);
    } });
    return h('div', { class: 'step' + (isDone ? ' done' : '') + (s.id === st.active_step_id ? ' current' : ''), id: 'step-' + s.id.replace(/[^\w-]/g, '_') }, cb,
      h('div', null, h('div', { class: 's-text' }, displayStep(s)),
        h('div', { class: 's-meta' }, s.id === st.active_step_id ? h('span', { class: 'badge corroborated plain' }, translateUI('ui.current')) : null,
          s.mandatory === false ? h('span', { class: 'chip' }, translateUI('ui.optional')) : null, s.kind && s.kind !== 'route' ? h('span', { class: 'chip' }, cap(s.kind) + (isImported ? translateUI('ui.b274_guides_009') : '')) : null,
          s.source_url ? extLink(s.source_url, translateUI('ui.b274_guides_010')) : null, changed ? h('span', { class: 'chip tiny warn', title: translateUI('ui.guide_changed_hint') }, translateUI('ui.guide_changed')) : null), gx.stepTimers(s.id)),
      s.id !== st.active_step_id ? h('button', { class: 'btn ghost small', title: translateUI('ui.b274_guides_011'), onclick: async () => {
        await api('PATCH', `/api/guides/runs/${run.id}`, { region, active_step_id: s.id }); render(el, route); } }, translateUI('ui.guide_set_current')) : h('span'));
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
    if (!p.would_mark) { toast(translateUI('ui.b274_guides_012')); return; }
    if (await confirmDialog(translateUI('ui.b274_guides_013'), translateUI('ui.b274_guides_038', { count: p.would_mark, region: gameTerm('region', cap(region)), run: run.display }), translateUI('ui.b274_guides_014'))) {
      await post(`/api/guides/runs/${run.id}/mark-through`, { region, step: st.active_step_id }); render(el, route);
    }
  }
  unsub.push(on('guides', (d, ev) => { if (ev.origin && ev.origin.startsWith('main')) return; render(el, route); }));
  if (route.query.get('jump')) setTimeout(jumpToCurrent, 50);
}

function runSelector(runs, run, el, route) {
  const btn = h('button', { class: 'run-pill', style: { cursor: 'pointer', color: 'inherit' }, 'aria-haspopup': 'menu', title: translateUI('ui.b274_guides_015') },
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
      item(translateUI('ui.b274_guides_016'), async () => { if (await createRun()) render(el, { ...route, query: new URLSearchParams() }); }, 'plus'),
      item(translateUI('ui.b274_guides_017'), async () => { const v = await runForm({ title: translateUI('ui.b274_guides_018'), name: run.character_name, label: run.run_label, withRegion: false, okLabel: translateUI('ui.save') });
        if (v) { try { await api('PATCH', `/api/guides/runs/${run.id}`, { name: v.name, label: v.label }); render(el, route); } catch (e2) { toast(e2.message, { kind: 'warn' }); } } }),
      item(translateUI('ui.b274_guides_019'), async () => { const v = await runForm({ title: translateUI('ui.b274_guides_020'), name: run.character_name, label: (run.run_label + ' copy').trim(), withRegion: false, okLabel: translateUI('ui.duplicate') });
        if (v) { try { const n = await post(`/api/guides/runs/${run.id}/duplicate`, { label: v.label }); await saveSettings({ 'guides.active_run': n.id }); render(el, route); } catch (e2) { toast(e2.message, { kind: 'warn' }); } } }),
      item(translateUI('ui.b274_guides_021'), async () => downloadJson(`pokemmo-companion-backup-${new Date().toISOString().slice(0, 10)}.json`, await get('/api/backup/export')), 'download'),
      runs.deleted.length ? item(translateUI('ui.b274_guides_039', { count: runs.deleted.length }), () => restoreDialog(runs.deleted, el, route)) : null,
      h('div', { class: 'sep' }),
      item(translateUI('ui.b274_guides_022'), async () => { if (await confirmDialog(translateUI('ui.b274_guides_023'), translateUI('ui.b274_guides_040', { name: run.display }), translateUI('ui.delete'), true)) {
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
  await modal({ title: translateUI('ui.b274_guides_024'), body: h('div', { class: 'list-rows' }, deleted.map((d) => h('div', { class: 'list-row' }, h('span', { class: 'grow' }, d.display),
    h('span', { class: 'when' }, translateUI('ui.b274_guides_025'), relTime(d.deleted_at)),
    h('button', { class: 'btn small', onclick: async () => { try { await post(`/api/guides/runs/${d.id}/restore`); document.querySelector('.modal-back').remove(); render(el, route); toast(translateUI('ui.b274_guides_026')); }
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
  h('div', { class: 'actions' }, runs.runs.length ? h('button', { class: 'btn', onclick: () => go(`#/guides/storyline?region=${region}`) }, translateUI('ui.b274_guides_027'))
    : h('button', { class: 'btn primary', onclick: async () => { if (await createRun()) go(`#/guides/storyline?region=${region}`); } }, icon('plus'), translateUI('ui.b274_guides_028')))));
  page.append(h('div', { class: 'row wrap', style: { marginBottom: '12px' } }, tabs(REGIONS.map((r) => ({ id: r, label: gameTerm('region', cap(r)) })), region,
    (r) => go(`#/guides/storyline?browse=1&region=${r}`), translateUI('ui.guide_regions'))));
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
        h('summary', null, h('strong', null, chapterLabel(c.name) || translateUI('ui.b274_guides_029')), h('span', { class: 'tiny muted' }, translateUI('ui.b274_guides_041', { count: hits.length }))),
        h('ol', { class: 'browse-list' }, hits.map((x) => h('li', null, stepLabel(x)))));
    }));
  };
  search.addEventListener('input', draw);
  page.append(h('div', { class: 'row wrap', style: { marginBottom: '8px' } }, search, h('span', { class: 'small muted' }, translateUI('ui.b274_guides_042', { steps: cat.steps.length, chapters: chapters.length }))), list,
    h('p', { class: 'tiny muted' }, translateUI('ui.b274_guides_043')));
  draw();
}
