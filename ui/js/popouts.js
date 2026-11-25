import { walkthroughStep } from './walkthrough-locales.js';
import { gameTerm, walkthroughChapter } from './game-locale.js';
import { lang, uiLabel } from './i18n.js';
import { t as translateUI } from './i18n.js';
// Independent popout windows (docs/design/04, 15). One shared backend state; each
// popout has its own mode/scroll. In the native shell, Qt draws the titlebar
// (pin, mode, window opacity, lock, minimise, close); in browser mode we draw it.
import { h, mount, clear, icon, get, post, api, state, setting, saveSettings, on, POPOUT, SHELL, toast, cap, relTime, typeChips, spriteOrFallback, pad3, badge, sourceInfo, notice, applyAppearance, debounce, WINDOW_ID } from './core.js';
import { POPOUT_TOOLS, popoutSize } from './shell.js';
import { renderDetail, dexCard, catalogFragment, applyFilters, loadList, currentFilters } from './pages/pokedex.js';
import { renderTypeChart, renderNatures } from './pages/tools.js';
import { render as renderBreeding } from './pages/breeding.js';
import { renderPhenomena } from './pages/phenomena.js';
import { sourceBar, reportRow, renderLegendaries, renderCave } from './pages/live.js';
import { speciesIndex } from './components.js';
import { t } from './i18n.js';
import { guideContext } from './shortcuts.js';
import { renderItemsPopout } from './pages/items.js';
import { renderNotesPopout } from './pages/notes.js';
import { renderBoxPopout, renderShowcasePopout } from './pages/box.js';
import { renderCustomGuidePopout } from './pages/cguides.js';
import { guideExtras } from './guide-extras.js';
import { renderLocationsPopout } from './pages/locations.js';
import { installTimerSound } from './timer-sound.js';

let root, bodyEl, mode, savedMode;
const MODES = [['compact', 'C', 'Compact'], ['standard', 'S', 'Standard'], ['expanded', 'E', 'Expanded']];

function openInMain(route) {
  if (SHELL === 'qt') { post('/api/shell/command', { action: 'navigate_main', route }); return; }
  if (window.opener && !window.opener.closed) { window.opener.location.hash = route; window.opener.focus(); }
  else toast(translateUI('ui.pop_main_missing'), { kind: 'warn' });
}

// These tools have no Pokémon artwork; changing sprite preferences cannot change their body.
const NO_SPRITE_BODY = new Set(['calculator', 'timers', 'natures', 'typechart']);
export function popoutSettingsImpact(tool, keys, detail = false) {
  const dexKeys = tool === 'pokedex' && keys.some(k => k.startsWith('pokedex.') && k !== 'pokedex.last_species');
  const sprites = !NO_SPRITE_BODY.has(tool) && keys.some(k => k.startsWith('sprites.') ||
    k === `window.${tool}.sprite_scale` || k === `window.${tool}.sprite_motion`);
  return { body: !!(dexKeys || sprites), filters: !!(dexKeys && !detail && keys.includes('pokedex.filters')) };
}

export function startPopout(el) {
  root = el;
  document.body.classList.add('popout', 'shell-' + SHELL);
  mode = new URLSearchParams(location.search).get('mode') || setting(`window.${POPOUT}.mode`) || 'standard';
  savedMode = setting(`window.${POPOUT}.mode`);
  let lastLanguage = lang();
  bodyEl = h('div', { class: 'popout-body readable' });
  installTimerSound();
  draw();
  document.addEventListener('settings-changed', (ev) => {
    const keys = Object.keys((ev && ev.detail) || {});
    if (lang() !== lastLanguage) { lastLanguage = lang(); draw(); return; }
    const impact = popoutSettingsImpact(POPOUT, keys, location.hash.startsWith('#/species/'));
    if (impact.filters) currentFilters(true);
    const m = setting(`window.${POPOUT}.mode`);
    applyAppearance();
    if (m && m !== savedMode) { savedMode = m; mode = m; applyBrowserSize(); draw(); return; }
    if (impact.body) refresh();
    if (keys.some(k => k === `window.${POPOUT}.bg_opacity` || k === `window.${POPOUT}.text_scale`)) drawBar();
  });
  const refresh = debounce(() => renderBody(), 120);
  for (const t of ({ notes: ['notes'], items: ['items'], showcase: ['showcase', 'box'], customguide: ['cguides'], box: ['box'], storyline: ['guides'], reports: ['live.report', 'live.source'], pokedex: ['favourites', 'notes', 'dex.roster', 'dex.progress'], breeding: [], legendaries: ['legendaries', 'guides'], cave: ['cave'] })[POPOUT] || []) on(t, async (d, ev) => {
    if (ev && ev.origin === WINDOW_ID && ['notes', 'items', 'showcase', 'customguide', 'box'].includes(POPOUT)) return;  // our own edit: don't redraw under the cursor
    if (POPOUT === 'pokedex') { state.dexCache = null; } refresh(); });
  window.addEventListener('hashchange', () => renderBody());
  window.addEventListener('resize', () => { rememberSize(); });
}

let barEl, footEl, resizingByUs = false;
function switchMode(m) {
  if (m === mode) return;
  mode = m; savedMode = m;
  saveSettings({ [`window.${POPOUT}.mode`]: m });
  applyBrowserSize();
  draw();
}
function applyBrowserSize() {
  // Browser popups opened by the Companion may be resized by script; the native shell does this itself.
  if (SHELL === 'qt' || setting(`window.${POPOUT}.keep_size`)) return;
  const [w, h_] = popoutSize(POPOUT, mode);
  resizingByUs = true;
  try { window.resizeTo(w, h_); } catch (_) { /* not allowed */ }
  setTimeout(() => { resizingByUs = false; }, 900);
}
const rememberSize = debounce(() => {
  if (SHELL === 'qt' || resizingByUs) return;
  const sizes = { ...(setting(`window.${POPOUT}.sizes`) || {}) };
  sizes[mode] = { w: window.outerWidth, h: window.outerHeight };
  saveSettings({ [`window.${POPOUT}.sizes`]: sizes }).catch(() => {});
}, 700);
function draw() {
  const def = POPOUT_TOOLS[POPOUT] || { title: POPOUT };
  document.title = (def.i18n ? t(def.i18n) : uiLabel(def.title)) + ' — PokeMMO Companion';
  barEl = h('div');
  footEl = h('div', { class: 'popout-foot' });
  mount(root, h('div', { class: `popout-root mode-${mode}` }, barEl, bodyEl, footEl));
  drawBar();
  renderBody();
}

function drawBar() {
  const def = POPOUT_TOOLS[POPOUT] || { title: POPOUT };
  if (SHELL !== 'qt') {
    mount(barEl, h('div', { class: 'popout-bar' }, h('span', { class: 'ptitle ellipsis' }, def.i18n ? t(def.i18n) : uiLabel(def.title)),
      h('button', { class: 'icon-btn', disabled: 'disabled', title: translateUI('ui.pop_pin_browser') }, icon('pin')),
      MODES.map(([m, short, long]) => h('button', { class: 'icon-btn' + (m === mode ? ' on' : ''), title: uiLabel(long + ' view'), 'aria-pressed': String(m === mode),
        onclick: () => switchMode(m) }, h('span', { style: { fontWeight: 700, fontSize: '.8rem' } }, short))),
      h('button', { class: 'icon-btn', title: translateUI('ui.pop_close'), 'aria-label': translateUI('ui.close'), onclick: () => window.close() }, icon('close'))));
  } else {
    clear(barEl);
  }
  const bg = setting(`window.${POPOUT}.bg_opacity`);
  const ts = setting(`window.${POPOUT}.text_scale`);
  mount(footEl,
    h('label', { class: 'row', title: translateUI('ui.pop_bg') }, icon('opacity'),
      h('input', { type: 'range', min: 20, max: 100, step: 5, value: bg, style: { width: '90px' }, 'aria-label': translateUI('ui.background_opacity'),
        oninput: (e) => document.documentElement.style.setProperty('--panel-alpha', String(e.target.value / 100)),
        onchange: (e) => saveSettings({ [`window.${POPOUT}.bg_opacity`]: Number(e.target.value) }) }), h('span', { class: 'tiny muted' }, bg + '%')),
    textSizeButton(ts),
    h('span', { class: 'grow' }),
    SHELL === 'qt' ? h('span', { class: 'tiny muted' }, uiLabel(cap(mode))) : h('button', { class: 'btn ghost small', title: translateUI('ui.pop_resize'),
      onclick: () => { const sizes = { ...(setting(`window.${POPOUT}.sizes`) || {}) }; delete sizes[mode]; saveSettings({ [`window.${POPOUT}.sizes`]: sizes }).then(applyBrowserSize); } }, translateUI('ui.reset_size')),
    h('button', { class: 'btn ghost small', onclick: () => openInMain(mainRoute()) }, translateUI('ui.open_main')));
}
// Text size: one button → popover with a 60–200 % slider (live), quick presets, readability
// outline for see-through backgrounds, and reset. Saved per tool window.
function textSizeButton(ts) {
  const btn = h('button', { class: 'btn ghost small ts-btn', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', title: t('popout.text_size_hint'),
    'aria-label': `${t('common.text_size')} ${ts}%`, onclick: () => openTextPopover(btn) }, icon('textsize'), h('span', { class: 'tiny' }, ts + '%'));
  return btn;
}
function openTextPopover(btn) {
  const existing = document.querySelector('.ts-pop'); if (existing) { existing.remove(); btn.setAttribute('aria-expanded', 'false'); return; }
  const key = `window.${POPOUT}.text_scale`, outlineKey = `window.${POPOUT}.text_outline`;
  let val = setting(key) || 100;
  const label = h('strong', { 'aria-live': 'polite' }, val + '%');
  const apply = (v, save) => { val = Math.max(60, Math.min(200, v)); state.settings[key] = val; applyAppearance(); label.textContent = val + '%'; slider.value = val;
    btn.querySelector('.tiny').textContent = val + '%'; if (save) saveSettings({ [key]: val }); place(); };
  const place = () => { const rr = btn.getBoundingClientRect(); pop.style.left = Math.max(6, Math.min(rr.left, innerWidth - pop.offsetWidth - 6)) + 'px';
    pop.style.bottom = Math.max(6, innerHeight - rr.top + 6) + 'px'; pop.style.maxHeight = Math.max(120, rr.top - 12) + 'px'; };
  const slider = h('input', { type: 'range', min: 60, max: 200, step: 5, value: val, 'aria-label': t('common.text_size'), style: { width: '100%' },
    oninput: (e) => apply(Number(e.target.value), false), onchange: (e) => apply(Number(e.target.value), true) });
  const outline = h('input', { type: 'checkbox', class: 'check', checked: !!setting(outlineKey), onchange: (e) => saveSettings({ [outlineKey]: e.target.checked }).then(applyAppearance) });
  const r = btn.getBoundingClientRect();
  const pop = h('div', { class: 'ts-pop menu', role: 'dialog', 'aria-label': t('common.text_size'), style: { left: Math.max(6, Math.min(r.left, innerWidth - 250)) + 'px', bottom: (innerHeight - r.top + 6) + 'px' } },
    h('div', { class: 'row' }, h('span', { class: 'grow small' }, t('common.text_size')), label),
    h('div', { class: 'row', style: { gap: '6px' } }, h('span', { class: 'tiny', 'aria-hidden': 'true' }, 'A'), slider, h('span', { 'aria-hidden': 'true', style: { fontSize: '1.2rem' } }, 'A')),
    h('div', { class: 'row', style: { gap: '4px' } }, [90, 100, 120, 150].map((p) => h('button', { class: 'btn ghost small', onclick: () => apply(p, true) }, p + '%')),
      h('span', { class: 'grow' }), h('button', { class: 'btn small', onclick: () => apply(100, true) }, t('common.reset'))),
    h('label', { class: 'row small', title: translateUI('ui.pop_outline_hint') }, outline, translateUI('ui.pop_outline')),
    // this window's Pokémon sprites (2026-11-24): size and animation just for this popout
    h('div', { class: 'row small', style: { gap: '6px' } }, h('span', { class: 'grow' }, translateUI('ui.pop_sprite_size')),
      h('select', { class: 'input', style: { width: 'auto', minHeight: '26px', padding: '2px 6px' }, 'aria-label': translateUI('ui.pop_sprite_size_window'),
        onchange: (e) => saveSettings({ [`window.${POPOUT}.sprite_scale`]: Number(e.target.value) }).then(() => document.dispatchEvent(new CustomEvent('settings-changed', { detail: { [`window.${POPOUT}.sprite_scale`]: 1 } }))) },
        [70, 85, 100, 125, 150].map((p) => h('option', { value: p, selected: (setting(`window.${POPOUT}.sprite_scale`) || 100) === p ? 'selected' : null }, p + '%')))),
    h('div', { class: 'row small', style: { gap: '6px' } }, h('span', { class: 'grow' }, translateUI('ui.floating_sprite_animation')),
      h('select', { class: 'input', style: { width: 'auto', minHeight: '26px', padding: '2px 6px' }, 'aria-label': translateUI('ui.floating_sprite_animation_window'),
        onchange: (e) => saveSettings({ [`window.${POPOUT}.sprite_motion`]: e.target.value }).then(() => document.dispatchEvent(new CustomEvent('settings-changed', { detail: { [`window.${POPOUT}.sprite_motion`]: 1 } }))) },
        [['inherit', translateUI('ui.floating_inherit_animation')], ['static', translateUI('ui.static')], ['animated', translateUI('ui.animated')]].map(([v, l]) => h('option', { value: v, selected: (setting(`window.${POPOUT}.sprite_motion`) || 'inherit') === v ? 'selected' : null }, l)))));
  document.body.append(pop);
  place();
  btn.setAttribute('aria-expanded', 'true');
  slider.focus();
  const close = (e) => { if (e.type === 'keydown' ? e.key === 'Escape' : !pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
    pop.remove(); btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); if (e.type === 'keydown') btn.focus(); } };
  setTimeout(() => { document.addEventListener('mousedown', close); document.addEventListener('keydown', close); }, 0);
}
function mainRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  return { storyline: '#/guides?jump=1', pokedex: hash.startsWith('species/') ? '#/pokedex/' + hash.split('/')[1] : '#/pokedex', reports: '#/live/reports', phenomena: '#/live/phenomena',
    typechart: '#/tools/typechart', natures: '#/tools/natures', breeding: '#/tools/breeding', legendaries: '#/live/legendaries', cave: '#/live/cave',
    notes: '#/tools/notes' + (hash.startsWith('note/') ? '/' + hash.split('/')[1] : ''), items: '#/tools/items' + (hash.startsWith('item/') ? '/' + hash.split('/')[1] : ''),
    showcase: '#/collection/showcases', customguide: '#/guides/mine', locations: '#/tools/locations', box: '#/collection', calculator: '#/tools/calculator', timers: '#/tools/timers' }[POPOUT] || '#/home';
}

async function renderBody() {
  const keep = bodyEl.scrollTop;
  try {
    const fn = { storyline, pokedex, reports, phenomena: (el) => renderPhenomena(el, { variant: mode }), typechart, breeding, legendaries, cave, natures,
      notes: (el) => renderNotesPopout(el, mode), items: (el) => renderItemsPopout(el, mode), showcase: (el) => renderShowcasePopout(el, mode),
      customguide: (el) => renderCustomGuidePopout(el, mode), locations: (el) => renderLocationsPopout(el, mode), box: (el) => renderBoxPopout(el, mode),
      calculator: (el) => import('./pages/calculator.js').then((m) => m.renderCalculator(el, { compact: mode === 'compact' })),
      timers: (el) => import('./pages/timers.js').then((m) => m.renderTimers(el, { variant: mode })) }[POPOUT];
    if (!fn) { mount(bodyEl, notice('bad', translateUI('ui.floating_unknown', { tool: POPOUT }))); return; }
    await fn(bodyEl);
  } catch (e) { mount(bodyEl, notice('bad', e.message)); }
  bodyEl.scrollTop = keep;
}

// ---------------------------------------------------------------- guide timers & team in popouts
// Same TimerService timers and saved team ids as the main window (guide-extras.js) — nothing is copied.
let popGx = null;
export function popoutExtras(ctx, { open } = {}) {
  if (popGx) popGx.dispose();
  popGx = guideExtras({ ...ctx, nav: openInMain });
  popGx.load().catch((e) => console.warn(e));
  const box = h('details', { class: 'gx-pop', open: open ? '' : null }, h('summary', { class: 'small' }, icon('clock'), translateUI('ui.guide_popout_timer_team')), popGx.panel());
  return { gx: popGx, box };
}

// ---------------------------------------------------------------- storyline
let storyRegion = null;
async function storyline(el) {
  const runs = await get('/api/guides/runs');
  const run = runs.runs.find((r) => r.id === runs.active) || runs.runs[0];
  if (!run) { mount(el, h('div', { class: 'stack tight' }, h('div', { class: 'objective' }, translateUI('ui.guide_popout_no_run')),
    h('button', { class: 'btn', onclick: () => openInMain('#/guides/storyline') }, translateUI('ui.guide_popout_create_run')))); return; }
  const region = storyRegion || run.last_region;
  const st = await get(`/api/guides/runs/${run.id}/state?region=${region}`);
  const steps = st.steps.filter((s) => st.show_optional || s.mandatory !== false);
  const done = new Set(st.done);
  const i = Math.max(0, steps.findIndex((s) => s.id === st.active_step_id));
  const cur = steps[i];
  const displayChapter = (name) => st.source === 'imported' ? name : walkthroughChapter(name);
  const counts = st.source === 'milestones' ? st.counts.mandatory : st.counts.unclassified;
  Object.assign(guideContext, { run: run.id, region, step: st.active_step_id, refresh: () => storyline(el) });
  const setActive = async (idx) => { const s = steps[Math.max(0, Math.min(steps.length - 1, idx))]; if (s) { await api('PATCH', `/api/guides/runs/${run.id}`, { region, active_step_id: s.id }); storyline(el); } };
  const toggle = async (s, val) => {
    const idx = steps.findIndex((x) => x.id === s.id);
    const next = steps.slice(idx + 1).find((x) => !done.has(x.id));
    await post(`/api/guides/runs/${run.id}/steps`, { step: s.id, done: val, region, advance: val && s.id === st.active_step_id, next_active: next && next.id });
    storyline(el);
  };
  const { gx, box: extrasBox } = popoutExtras({ key: `story:${run.id}:${region}`, title: `${cap(region)} storyline · ${run.display}`, run: run.id,
    steps: Object.fromEntries(st.steps.map((s) => [s.id, s.text.slice(0, 40)])) }, { open: mode === 'expanded' });
  const stepLabel = (s, big) => h('label', { class: 'step' + (done.has(s.id) ? ' done' : '') + (s.id === cur.id ? ' current' : ''), style: { gridTemplateColumns: 'auto 1fr', cursor: 'pointer', padding: big ? '10px' : '7px 9px' } },
    h('input', { type: 'checkbox', class: 'check', checked: done.has(s.id), onchange: (e) => toggle(s, e.target.checked) }),
    h('div', null, h('div', { class: big ? 'objective s-text' : 's-text small' }, st.source === 'imported' ? s.text : walkthroughStep(s, lang())), big ? h('div', { class: 'tiny muted' }, displayChapter(s.chapter)) : null));
  const stepEl = (s, big) => h('div', { class: 'pop-step' }, stepLabel(s, big), h('div', { style: { marginLeft: '30px' } }, gx.stepTimers(s.id)));
  const header = h('div', { class: 'stack tight', style: { marginBottom: '8px' } },
    h('div', { class: 'row' }, h('span', { class: 'initial' }, run.character_name.charAt(0).toUpperCase()), h('div', { class: 'grow', style: { minWidth: 0 } },
      h('div', { class: 'ellipsis', style: { fontWeight: 700 } }, run.display), h('div', { class: 'tiny muted ellipsis' }, `${gameTerm('region', cap(region))} · ${cur ? displayChapter(cur.chapter) : ''}`)),
    mode !== 'compact' ? h('select', { class: 'input', style: { width: 'auto', minHeight: '26px', padding: '1px 4px' }, 'aria-label': translateUI('ui.region'), onchange: async (e) => {
      storyRegion = e.target.value; await api('PATCH', `/api/guides/runs/${run.id}`, { region: storyRegion }); storyline(el); } },
    ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova'].map((r) => h('option', { value: r, selected: r === region ? 'selected' : null }, gameTerm('region', cap(r))))) : null),
    h('div', { class: 'row' }, h('div', { class: 'progress grow' }, h('span', { style: { width: (counts.total ? counts.done / counts.total * 100 : 0) + '%' } })),
      h('span', { class: 'tiny' }, `${counts.done}/${counts.total}`)));
  const nav = h('div', { class: 'row', style: { marginTop: '8px' } },
    h('button', { class: 'btn small', onclick: () => setActive(i - 1), title: translateUI('ui.guide_popout_previous'), 'aria-label': translateUI('ui.guide_popout_previous') }, icon('back')),
    h('button', { class: 'btn small', onclick: () => setActive(i + 1), title: translateUI('ui.guide_popout_next'), 'aria-label': translateUI('ui.guide_popout_next') }, icon('chev')),
    h('span', { class: 'tiny muted' }, translateUI('ui.guide_popout_position', { step: i + 1, total: steps.length })), h('span', { class: 'grow' }),
    mode !== 'compact' && runs.runs.length > 1 ? h('select', { class: 'input', style: { width: 'auto', minHeight: '26px', padding: '1px 4px' }, 'aria-label': translateUI('ui.guide_popout_switch'),
      onchange: async (e) => { storyRegion = null; await saveSettings({ 'guides.active_run': e.target.value }); storyline(el); } },
    runs.runs.map((r) => h('option', { value: r.id, selected: r.id === run.id ? 'selected' : null }, r.display))) : null);
  if (!cur) { mount(el, header, h('div', { class: 'muted' }, translateUI('ui.guide_popout_empty'))); return; }
  if (mode === 'compact') { mount(el, header, stepEl(cur, true), nav, extrasBox); return; }
  if (mode === 'standard') {
    const win = steps.slice(Math.max(0, i - 1), i + 6);
    mount(el, header, h('div', { class: 'stack tight' }, win.map((s) => stepEl(s, s.id === cur.id))), nav, extrasBox);
    return;
  }
  // contiguous block of steps in the current chapter (a town visited twice is two separate blocks)
  let lo = i, hi = i;
  while (lo > 0 && steps[lo - 1].chapter === cur.chapter) lo--;
  while (hi < steps.length - 1 && steps[hi + 1].chapter === cur.chapter) hi++;
  const chapterSteps = steps.slice(lo, hi + 1);
  mount(el, header, h('div', { class: 'step-chapter', style: { marginTop: '4px' } }, displayChapter(cur.chapter)), h('div', { class: 'stack tight' }, chapterSteps.map((s) => stepEl(s, s.id === cur.id))), nav, extrasBox,
    h('div', { class: 'tiny muted', style: { marginTop: '8px' } }, st.source === 'walkthrough' ? translateUI('ui.guide_popout_bundled') : st.source === 'imported' ? translateUI('ui.guide_popout_imported') : translateUI('ui.guide_popout_milestones'), sourceInfo(st.sources.find(({ id }) => id === st.source)?.status)));
}

// ---------------------------------------------------------------- pokédex
// Full filtered roster — no caps. Same scope/filters as the main Pokédex; own search box.
let miniQuery = '';
async function pokedex(el) {
  const m = location.hash.match(/^#\/species\/(\d+)(?:\/([a-z0-9-]+))?/);
  if (m) {
    await renderDetail(el, Number(m[1]), { back: () => { location.hash = '#/'; }, popout: true, mode, form: m[2] || null });
    return;
  }
  const all = await loadList();
  const density = { compact: 'compact', standard: 'standard', expanded: 'large' }[mode] || 'standard';
  const tracking = !!setting('pokedex.progress_run');
  const count = h('span', { class: 'tiny muted nowrap' });
  const results = h('div', { class: 'dex-grid density-' + density, role: 'grid', 'aria-label': translateUI('ui.pokemon') });
  const drawList = () => {
    const list = applyFilters(all, { ...currentFilters(), q: miniQuery });
    const scopeSize = all.filter((s) => setting('pokedex.scope') !== 'pokemmo' || s.dex !== 'no').length;
    count.textContent = translateUI('dex.catalog_count', { shown: list.length, total: scopeSize });
    results.replaceChildren(catalogFragment(list, { density, tracking, grouped: currentFilters().sort === 'num' && mode !== 'compact',
      onOpen: (s) => { location.hash = '#/species/' + s.id + (s.form_key ? '/' + s.form_key : ''); } }));
    if (!list.length) results.append(h('div', { class: 'empty', style: { gridColumn: '1 / -1' } }, translateUI('ui.floating_no_dex_matches')));
  };
  mount(el, h('div', { class: 'stack tight' }, h('div', { class: 'row' }, h('div', { class: 'search grow' }, icon('search'), h('input', { class: 'input', type: 'search', placeholder: translateUI('ui.search_pokemon'), value: miniQuery,
    'aria-label': translateUI('ui.search_pokemon'), oninput: debounce((e) => { miniQuery = e.target.value; drawList(); }, 120) })), count),
  h('div', { class: 'tiny muted' }, setting('pokedex.catalog') === 'species' ? translateUI('popui.species') : translateUI('popui.forms'), translateUI('ui.floating_dex_filters')), results));
  drawList();
}

// ---------------------------------------------------------------- reports
async function reports(el) {
  const r = await get('/api/live/reports?tests=1');
  const list = mode === 'compact' ? r.reports.slice(0, 1) : r.reports;  // compact = latest only; others show full history
  const link = (x) => { const row = reportRow(x, false, mode !== 'expanded'); row.onclick = null; row.addEventListener('click', () => openInMain('#/live/reports/' + x.id)); return row; };
  mount(el, h('div', { class: 'stack tight' }, sourceBar(r.source, { compact: true }),
    mode === 'compact' && r.reports.length > 1 ? h('div', { class: 'tiny muted' }, translateUI('ui.floating_report_count', { count: r.reports.length - 1 })) : null,
    list.length ? list.map(link) : h('div', { class: 'small muted' }, r.source.enabled ? translateUI('ui.live_popout_no_reports') : translateUI('ui.live_popout_off'))));
}

async function typechart(el) { clear(el); await renderTypeChart(el, null, { compact: mode !== 'expanded' }); }
async function natures(el) { clear(el); await renderNatures(el, null, { compact: mode === 'compact' }); }
async function breeding(el) { await renderBreeding(el, null, { popout: true, mode }); }
async function legendaries(el) { await renderLegendaries(el, { compact: mode !== 'expanded' }); }
async function cave(el) { await renderCave(el, { compact: mode !== 'expanded' }); }
