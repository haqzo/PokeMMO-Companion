import { walkthroughReader } from '../walkthrough-loader.js';
import { lang } from '../i18n.js';
import { gameTerm, searchText, walkthroughChapter } from '../game-locale.js';
import { t as translateUI } from '../i18n.js';
// Guides (docs/design/14–17): named character runs, five regions, manual progress.
import { guideContext, shortcutFor, displayCombo } from '../shortcuts.js';
import { h, mount, icon, get, post, api, saveSettings, notice, cap, tabs, toast, confirmDialog, modal, on, debounce, relTime, extLink, sourceInfo } from '../core.js';
import { go, openPopout } from '../shell.js';
import { downloadJson } from '../components.js';
import { guideExtras } from '../guide-extras.js';
import { REGIONS, storyChapters, visibleStorySteps, changeStory, refreshStoryWhenIdle,
  patchStory, checkStory, moveStory, revealStoryStep, storyExtrasDetails } from '../storyline.js';

let unsub = [];
let renderVersion = 0;
const views = new Map();
let watchedHost;
let unwatch = [];
const STEP_KIND_LABELS = { battle: 'ui.guide_kind_battle', gym: 'ui.guide_kind_gym',
  item: 'ui.item', league: 'ui.guide_kind_league', story: 'ui.guide_kind_story' };

function guideSourceLabel(source, region) {
  if (source.id === 'walkthrough') {
    return translateUI('ui.guide_source_complete', { region: gameTerm('region', cap(region)) });
  }
  return source.id === 'milestones' ? translateUI('ui.guide_source_milestones') : source.label;
}

function releaseView() { unsub.forEach((u) => u()); unsub = []; }
export function dispose() {
  renderVersion++;
  releaseView();
  unwatch.forEach(u => u());
  unwatch = [];
  watchedHost = null;
}

function watchProgress(el, route) {
  if (watchedHost === el || route.query.has('browse') || route.query.has('region')) return;
  watchedHost = el;
  const refresh = debounce(() => {
    if (el.isConnected) refreshStoryWhenIdle(() => render(el, route).catch(error => toast(error.message, { kind: 'warn' })));
  }, 70);
  unwatch = [on('guides', refresh), on('settings', (data) => {
    if (Object.hasOwn(data || {}, 'guides.active_run')) refresh();
  })];
}

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
  if (!el.isConnected) return;
  const version = ++renderVersion;
  const obsolete = () => version !== renderVersion || !el.isConnected;
  watchProgress(el, route);
  const page = h('div', { class: 'page story-page story-scroll', tabindex: '0', 'aria-label': translateUI('ui.storyline') });
  const runs = await get('/api/guides/runs');
  if (obsolete()) return;
  // Browse the bundled walkthroughs without a character run (or with ?browse=1): read-only, nothing is ticked.
  if (route.query.get('browse') || (!runs.runs.length && REGIONS.includes(route.query.get('region')))) {
    releaseView();
    mount(el, page);
    return browse(page, route, runs);
  }
  if (!runs.runs.length) {
    releaseView();
    page.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, translateUI('ui.storyline')), h('div', { class: 'sub' }, translateUI('ui.guide_storyline_intro')))),
      h('div', { class: 'card content-narrow stack', style: { maxWidth: '620px' } }, h('h2', { style: { margin: 0 } }, translateUI('ui.guide_character_run_first')),
        h('p', { class: 'muted', style: { margin: 0 } }, translateUI('ui.guide_character_run_help')),
        h('div', { class: 'row wrap' }, h('button', { class: 'btn primary', onclick: async () => { if (await createRun()) render(el, route); } }, icon('plus'), translateUI('ui.guide_character_run_create')),
          h('button', { class: 'btn ghost', onclick: () => go('#/guides/storyline?browse=1&region=kanto') }, translateUI('ui.guide_read_before_run'))),
        runs.deleted.length ? h('div', { class: 'small muted' }, translateUI('ui.b274_guides_031', { count: runs.deleted.length })) : null));
    mount(el, page);
    return;
  }
  const run = runs.runs.find((r) => r.id === runs.active) || runs.runs[0];
  const region = run.last_region || 'kanto';
  const requested = route.query.get('region');
  if (REGIONS.includes(requested)) {
    if (requested !== region) await api('PATCH', `/api/guides/runs/${run.id}`, { region: requested });
    if (!obsolete()) go('#/guides/storyline');
    return;
  }
  const [st, overview] = await Promise.all([get(`/api/guides/runs/${run.id}/state?region=${region}`),
    get(`/api/guides/runs/${run.id}/overview`)]);
  const displayStep = await walkthroughReader(lang(), st.source);
  if (obsolete()) return;
  if (st.run.last_region !== region) return render(el, route);
  const previous = el.querySelector('.story-page');
  const scope = `${run.id}:${region}:${st.source}`;
  const sameView = previous?.dataset.scope === scope;
  const oldScroll = sameView ? previous.scrollTop : 0;
  const oldChapters = sameView ? previous.querySelector('.chapters')?.scrollTop || 0 : 0;
  const oldObjective = sameView ? previous.dataset.objective : null;
  const focused = sameView && previous.contains(document.activeElement) ? document.activeElement : null;
  page.dataset.scope = scope;
  page.dataset.objective = st.active_step_id || '';
  const refresh = () => {
    if (page.isConnected) render(el, route).catch(error => toast(error.message, { kind: 'warn' }));
  };
  const act = (write) => changeStory(write, refresh);
  releaseView();
  Object.assign(guideContext, { run: run.id, region, step: st.active_step_id, source: st.source, refresh });
  unsub.push(() => Object.assign(guideContext, { run: null, region: null, step: null, source: null, refresh: null }));

  page.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, translateUI('ui.storyline')), h('div', { class: 'sub' }, translateUI('ui.guide_manual_progress'))),
    h('div', { class: 'actions' }, runSelector(runs, run, el, route),
      h('button', { class: 'btn', title: translateUI('ui.guide_window_open'), onclick: () => openPopout('storyline') }, icon('popout'), translateUI('ui.guide_storyline_window')))));
  const sk = ['guide.prev', 'guide.next', 'guide.toggle'].map((a) => shortcutFor(a));
  page.append(h('div', { class: 'tiny muted', style: { margin: '-6px 0 10px' } }, sk.some(Boolean) ?
    translateUI('ui.b274_guides_032', { previous: displayCombo(sk[0]), next: displayCombo(sk[1]), toggle: displayCombo(sk[2]) }) :
    translateUI('ui.b274_guides_002')));

  page.append(h('div', { class: 'row wrap', style: { marginBottom: '12px' } }, tabs(REGIONS.map((r) => {
    const counts = r === region ? st.counts : overview[r];
    const c = counts.mandatory.total ? counts.mandatory : counts.unclassified;
    return { id: r, label: gameTerm('region', cap(r)), count: c.total ? `${c.done}/${c.total}` : undefined };
  }), region, (r) => act(() => patchStory(st, { region: r })), translateUI('ui.guide_regions'))));

  const steps = visibleStorySteps(st);
  const displayChapter = st.source === 'imported' ? (name) => name : walkthroughChapter;
  const done = new Set(st.done);
  const src = st.sources.find((s) => s.id === st.source);
  const isImported = st.source !== 'milestones';   // a full walkthrough (built-in or your own): every step counts
  const counts = isImported ? st.counts.unclassified : st.counts.mandatory;
  const pct = counts.total ? Math.round(counts.done / counts.total * 100) : 0;

  const sourceSel = h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': translateUI('ui.guide_source_control'), onchange: async (e) => {
    const source = e.target.value;
    act(() => patchStory(st, { source })); } },
  st.sources.map((s) => h('option', { value: s.id, selected: s.id === st.source ? 'selected' : null }, translateUI('ui.b274_guides_033', { source: guideSourceLabel(s, region), count: s.steps }))));

  const header = h('div', { class: 'card stack tight', style: { marginBottom: '14px' } },
    h('div', { class: 'row wrap' }, h('h2', { style: { margin: 0, fontSize: '1.2rem' } }, gameTerm('region', cap(region))), sourceSel, sourceInfo(src.status),
      !isImported ? h('label', { class: 'row small' }, h('input', { class: 'check', type: 'checkbox', checked: st.show_optional,
        onchange: (e) => { const show_optional = e.target.checked; act(() => patchStory(st, { show_optional })); } }),
      translateUI('ui.guide_show_optional')) : null),
    h('div', { class: 'row' }, h('div', { class: 'progress grow' }, h('span', { style: { width: pct + '%' } })),
      h('span', { class: 'small nowrap' }, isImported ? translateUI('ui.guide_steps', { done: counts.done, total: counts.total }) : translateUI('ui.b274_guides_035', { done: counts.done, total: counts.total }))),
    h('div', { class: 'small muted' }, isImported
      ? (st.source === 'walkthrough'
        ? translateUI('ui.b274_guides_004')
        : translateUI('ui.b274_guides_005'))
      : translateUI('ui.b274_guides_036', { done: st.counts.optional.done, total: st.counts.optional.total, note: translateUI('ui.guide_source_milestone_note') })),
    null);
  const controls = h('div', { class: 'row wrap story-controls' },
    h('button', { class: 'btn ghost small', onclick: () => jumpToCurrent(), disabled: !st.active_step_id }, icon('target'), translateUI('ui.guide_jump_current')),
    h('button', { class: 'btn ghost small', title: translateUI('ui.guide_undo_step'), onclick: () => act(async () => {
      const r = await post(`/api/guides/runs/${run.id}/undo`);
      toast(r.undone ? translateUI('ui.b274_guides_034', { count: r.undone }) : translateUI('ui.guide_undo_none'));
    }) }, icon('undo'), translateUI('ui.b274_guides_003')),
    h('button', { class: 'btn ghost small', onclick: () => bulkMark().catch(error => toast(error.message, { kind: 'warn' })),
      disabled: !st.active_step_id }, translateUI('ui.guide_check_current')),
    st.finished ? h('strong', { class: 'small' }, translateUI('ui.guide_finished')) : null);
  page.append(header, controls);
  const gx = guideExtras({ key: `story:${run.id}:${region}`, title: `${cap(region)} storyline · ${run.display}`, run: run.id,
    steps: Object.fromEntries(st.steps.map((s) => [s.id, s.text.slice(0, 40)])) });
  unsub.push(gx.dispose);
  page.append(storyExtrasDetails('guides.extras_open', 'gx-story',
    h('summary', { class: 'small' }, translateUI('ui.b274_guides_006')), gx.panel()));
  gx.load().catch((e) => console.warn(e));

  if (st.changed.length) {
    page.append(h('div', { style: { marginBottom: '12px' } }, notice('warn', h('strong', null, translateUI('ui.b274_guides_037', { count: st.changed.length })),
      translateUI('ui.b274_guides_007'),
      h('button', { class: 'btn small', style: { marginLeft: '8px' }, onclick: async () => { await post(`/api/guides/runs/${run.id}/acknowledge`, { steps: st.changed }); render(el, route); } }, translateUI('ui.b274_guides_008')))));
  }

  const chapters = storyChapters(steps);
  const currentChapter = chapters.find(c => c.steps.some(s => s.id === st.active_step_id));
  if (!views.has(scope)) views.set(scope, { mode: 'follow', chapterOnly: st.source === 'imported', search: '' });
  const view = views.get(scope);
  const stepsBox = h('div', { class: 'stack tight story-steps' });
  const searchIn = h('input', { class: 'input', type: 'search', placeholder: translateUI('ui.guide_search_steps_in_region'),
    'aria-label': translateUI('ui.guide_search_steps'), value: view.search, oninput: (e) => {
      view.search = e.target.value;
      drawSteps();
    } });
  const chapterList = h('nav', { class: 'chapters story-scroll', tabindex: '0', 'aria-label': translateUI('ui.guide_chapters') });
  const selectedChapter = () => view.mode === 'chapter' ? chapters.find(c => c.key === view.chapter) : currentChapter;
  const showAll = () => view.mode === 'all' || (view.mode === 'follow' && !view.chapterOnly);
  const selectChapter = (chapter) => {
    view.mode = chapter ? 'chapter' : 'all';
    view.chapter = chapter?.key;
    view.search = searchIn.value = '';
    drawChapters();
    drawSteps();
    revealStoryStep(page, stepsBox.firstElementChild, controls.offsetHeight);
  };
  const drawChapters = () => mount(chapterList,
    h('button', { class: 'chapter-btn' + (showAll() ? ' active' : ''), onclick: () => selectChapter(null),
      'aria-current': showAll() ? 'true' : null }, translateUI('ui.guide_all_chapters'),
      h('span', { class: 'pc' }, `${steps.filter(s => done.has(s.id)).length}/${steps.length}`)),
    chapters.map(c => {
      const count = c.steps.filter(s => done.has(s.id)).length;
      const selected = !showAll() && c === selectedChapter();
      return h('button', { class: 'chapter-btn' + (selected ? ' active' : '') + (count === c.steps.length ? ' complete' : ''),
        dataset: { chapter: c.key, current: c === currentChapter ? 'true' : 'false' },
        'aria-current': selected ? 'true' : null, onclick: () => selectChapter(c) },
        c === currentChapter ? icon('target') : null, h('span', { class: 'ellipsis' }, displayChapter(c.name)),
        h('span', { class: 'pc' }, `${count}/${c.steps.length}`));
    }));
  const drawSteps = () => {
    const q = searchText(view.search);
    const all = showAll();
    const list = q ? steps.filter(s => [s.text, displayStep(s), s.chapter, displayChapter(s.chapter)]
      .some(v => searchText(v).includes(q))) : all ? steps : selectedChapter()?.steps || [];
    const out = storyChapters(list).flatMap(chapter => [
      (all || q) ? h('div', { class: 'step-chapter', dataset: { chapter: chapter.key } }, displayChapter(chapter.name)) : null,
      ...chapter.steps.map(stepRow)
    ]);
    mount(stepsBox, out.length ? out : h('div', { class: 'empty' }, translateUI('ui.guide_no_steps')));
  };
  const stepRow = (s) => {
    const isDone = done.has(s.id);
    const changed = st.changed.includes(s.id);
    const cb = h('input', { type: 'checkbox', class: 'check', checked: isDone,
      'aria-label': translateUI('ui.guide_done_label', { step: displayStep(s).slice(0, 80) }),
      onchange: (e) => { const checked = e.target.checked; act(() => checkStory(st, s.id, checked)); } });
    return h('div', { class: 'step' + (isDone ? ' done' : '') + (s.id === st.active_step_id ? ' current' : ''), dataset: { step: s.id } }, cb,
      h('div', null, h('div', { class: 's-text' }, displayStep(s)),
        h('div', { class: 's-meta' }, s.id === st.active_step_id ? h('span', { class: 'badge corroborated plain' }, translateUI('ui.current')) : null,
          s.mandatory === false ? h('span', { class: 'chip' }, translateUI('ui.optional')) : null, s.kind && s.kind !== 'route' ? h('span', { class: 'chip' }, (STEP_KIND_LABELS[s.kind] ? translateUI(STEP_KIND_LABELS[s.kind]) : cap(s.kind)) + (isImported ? translateUI('ui.b274_guides_009') : '')) : null,
          s.source_url ? extLink(s.source_url, translateUI('ui.b274_guides_010')) : null, changed ? h('span', { class: 'chip tiny warn', title: translateUI('ui.guide_changed_hint') }, translateUI('ui.guide_changed')) : null), gx.stepTimers(s.id)),
      s.id !== st.active_step_id ? h('button', { class: 'btn ghost small', title: translateUI('ui.b274_guides_011'), onclick: () => act(() => moveStory(st, 'current', s.id)) }, translateUI('ui.guide_set_current')) : h('span'));
  };

  page.append(h('div', { class: 'guide-layout' }, h('div', { class: 'stack tight story-sidebar' }, searchIn, chapterList), stepsBox));
  const jump = route.query.has('jump');
  if (jump) {
    route.query.delete('jump');
    view.mode = 'follow';
    view.chapterOnly = true;
    view.search = searchIn.value = '';
  }
  drawChapters();
  drawSteps();
  mount(el, page);
  const measureControls = () => page.style.setProperty('--story-controls-height', controls.offsetHeight + 'px');
  const resizeControls = new ResizeObserver(measureControls);
  resizeControls.observe(controls);
  unsub.push(() => resizeControls.disconnect());
  measureControls();
  page.scrollTop = oldScroll;
  chapterList.scrollTop = oldChapters;
  if (focused?.matches('input.check')) {
    const stepId = focused.closest('[data-step]')?.dataset.step;
    const checkbox = [...stepsBox.querySelectorAll('.step')].find(row => row.dataset.step === stepId)?.querySelector('input.check');
    checkbox?.focus({ preventScroll: true });
  }
  if (jump || (view.mode === 'follow' && !view.search && oldObjective !== st.active_step_id)) revealCurrent();

  function revealCurrent() {
    revealStoryStep(chapterList, chapterList.querySelector('[data-current="true"]'));
    revealStoryStep(page, stepsBox.querySelector('.step.current'), controls.offsetHeight);
  }

  function jumpToCurrent() {
    view.search = searchIn.value = '';
    view.mode = 'follow';
    view.chapterOnly = true;
    drawChapters();
    drawSteps();
    revealCurrent();
  }

  async function bulkMark() {
    const body = { region, step: st.active_step_id, source: st.source };
    const path = `/api/guides/runs/${run.id}/mark-through`;
    const p = await post(path, { ...body, preview: true });
    if (p.stale) { toast(translateUI('shortcutui.stale'), { kind: 'warn' }); refresh(); return; }
    if (!p.would_mark) { toast(translateUI('ui.b274_guides_012')); return; }
    if (await confirmDialog(translateUI('ui.b274_guides_013'), translateUI('ui.b274_guides_038', { count: p.would_mark, region: gameTerm('region', cap(region)), run: run.display }), translateUI('ui.b274_guides_014'))) {
      act(() => post(path, body));
    }
  }
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
async function browse(page, route, runs) {
  const region = REGIONS.includes(route.query.get('region')) ? route.query.get('region') : 'kanto';
  const cat = await get('/api/guides/catalog/' + region);
  const stepLabel = await walkthroughReader(lang());
  const q = (route.query.get('q') || '').toLowerCase();
  page.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, translateUI('ui.storyline')),
    h('div', { class: 'sub' }, translateUI('ui.guide_source_readonly'))),
  h('div', { class: 'actions' }, runs.runs.length ? h('button', { class: 'btn', onclick: () => go(`#/guides/storyline?region=${region}`) }, translateUI('ui.b274_guides_027'))
    : h('button', { class: 'btn primary', onclick: async () => { if (await createRun()) go(`#/guides/storyline?region=${region}`); } }, icon('plus'), translateUI('ui.b274_guides_028')))));
  page.append(h('div', { class: 'row wrap', style: { marginBottom: '12px' } }, tabs(REGIONS.map((r) => ({ id: r, label: gameTerm('region', cap(r)) })), region,
    (r) => go(`#/guides/storyline?browse=1&region=${r}`), translateUI('ui.guide_regions'))));
  const chapters = storyChapters(cat.steps);
  const search = h('input', { class: 'input', type: 'search', placeholder: translateUI('ui.guide_search_region'), value: q, 'aria-label': translateUI('ui.guide_search_steps'), style: { maxWidth: '320px' } });
  const list = h('div', { class: 'stack tight browse-steps' });
  const draw = () => {
    const term = searchText(search.value);
    mount(list, chapters.map((c) => {
      const hits = term ? c.steps.filter((x) => [x.text, stepLabel(x), c.name, walkthroughChapter(c.name)].some((v) => searchText(v).includes(term))) : c.steps;
      if (!hits.length) return null;
      return h('details', { class: 'card tight browse-chapter', open: term ? '' : null },
        h('summary', null, h('strong', null, walkthroughChapter(c.name) || translateUI('ui.b274_guides_029')), h('span', { class: 'tiny muted' }, translateUI('ui.b274_guides_041', { count: hits.length }))),
        h('ol', { class: 'browse-list' }, hits.map((x) => h('li', null, stepLabel(x)))));
    }));
  };
  search.addEventListener('input', draw);
  page.append(h('div', { class: 'row wrap', style: { marginBottom: '8px' } }, search, h('span', { class: 'small muted' }, translateUI('ui.b274_guides_042', { steps: cat.steps.length, chapters: chapters.length }))), list,
    h('p', { class: 'tiny muted' }, translateUI('ui.b274_guides_043')));
  draw();
}
