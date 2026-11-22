// Independent popout windows (docs/design/04, 15). One shared backend state; each
// popout has its own mode/scroll. In the native shell, Qt draws the titlebar
// (pin, mode, window opacity, lock, minimise, close); in browser mode we draw it.
import { h, mount, clear, icon, get, post, api, state, setting, saveSettings, on, POPOUT, SHELL, toast, cap, relTime, typeChips, spriteOrFallback, pad3, badge, notice, applyAppearance, debounce } from './core.js';
import { POPOUT_TOOLS } from './shell.js';
import { renderDetail } from './pages/pokedex.js';
import { renderTypeChart, renderNatures } from './pages/tools.js';
import { render as renderBreeding } from './pages/breeding.js';
import { sourceBar, reportRow, renderLegendaries, renderCave } from './pages/live.js';
import { speciesIndex } from './components.js';

let root, bodyEl, mode, savedMode;
const MODES = [['compact', 'C', 'Compact'], ['standard', 'S', 'Standard'], ['expanded', 'E', 'Expanded']];

function openInMain(route) {
  if (SHELL === 'qt') { post('/api/shell/command', { action: 'navigate_main', route }); return; }
  if (window.opener && !window.opener.closed) { window.opener.location.hash = route; window.opener.focus(); }
  else toast('Main window not found — open the Companion main window.', { kind: 'warn' });
}

export function startPopout(el) {
  root = el;
  document.body.classList.add('popout', 'shell-' + SHELL);
  mode = new URLSearchParams(location.search).get('mode') || setting(`window.${POPOUT}.mode`) || 'standard';
  savedMode = setting(`window.${POPOUT}.mode`);
  const def = POPOUT_TOOLS[POPOUT] || { title: POPOUT };
  document.title = def.title + ' — PokeMMO Companion';
  bodyEl = h('div', { class: 'popout-body readable' });
  draw();
  document.addEventListener('settings-changed', () => {
    const m = setting(`window.${POPOUT}.mode`);
    applyAppearance();
    if (m && m !== savedMode) { savedMode = m; mode = m; draw(); } else drawBar();
  });
  const refresh = debounce(() => renderBody(), 120);
  for (const t of ({ storyline: ['guides'], reports: ['live.report', 'live.source'], pokedex: ['favourites', 'notes'], breeding: [], legendaries: ['legendaries', 'guides'], cave: ['cave'] })[POPOUT] || []) on(t, refresh);
  window.addEventListener('hashchange', () => renderBody());
}

let barEl, footEl;
function draw() {
  const def = POPOUT_TOOLS[POPOUT] || { title: POPOUT };
  barEl = h('div');
  footEl = h('div', { class: 'popout-foot' });
  mount(root, h('div', { class: `popout-root mode-${mode}` }, barEl, bodyEl, footEl));
  drawBar();
  renderBody();
}

function drawBar() {
  const def = POPOUT_TOOLS[POPOUT] || { title: POPOUT };
  if (SHELL !== 'qt') {
    mount(barEl, h('div', { class: 'popout-bar' }, h('span', { class: 'ptitle ellipsis' }, def.title),
      h('button', { class: 'icon-btn', disabled: 'disabled', title: 'Pin / always-on-top needs the native shell (PySide6). Browser windows cannot be pinned.' }, icon('pin')),
      MODES.map(([m, short, long]) => h('button', { class: 'icon-btn' + (m === mode ? ' on' : ''), title: long + ' view', 'aria-pressed': String(m === mode),
        onclick: () => { mode = m; savedMode = m; saveSettings({ [`window.${POPOUT}.mode`]: m }); draw(); } }, h('span', { style: { fontWeight: 700, fontSize: '.8rem' } }, short))),
      h('button', { class: 'icon-btn', title: 'Close popout (your data is kept)', 'aria-label': 'Close', onclick: () => window.close() }, icon('close'))));
  } else {
    clear(barEl);
  }
  const bg = setting(`window.${POPOUT}.bg_opacity`);
  const ts = setting(`window.${POPOUT}.text_scale`);
  mount(footEl,
    h('label', { class: 'row', title: 'Panel background opacity — text stays fully opaque' }, icon('opacity'),
      h('input', { type: 'range', min: 35, max: 100, step: 5, value: bg, style: { width: '90px' }, 'aria-label': 'Background opacity',
        oninput: (e) => document.documentElement.style.setProperty('--panel-alpha', String(e.target.value / 100)),
        onchange: (e) => saveSettings({ [`window.${POPOUT}.bg_opacity`]: Number(e.target.value) }) }), h('span', { class: 'tiny muted' }, bg + '%')),
    h('button', { class: 'btn ghost small', title: 'Smaller text', 'aria-label': 'Smaller text', onclick: () => saveSettings({ [`window.${POPOUT}.text_scale`]: Math.max(70, ts - 10) }).then(applyAppearance) }, 'A−'),
    h('button', { class: 'btn ghost small', title: 'Larger text', 'aria-label': 'Larger text', onclick: () => saveSettings({ [`window.${POPOUT}.text_scale`]: Math.min(180, ts + 10) }).then(applyAppearance) }, 'A+'),
    h('span', { class: 'grow' }),
    SHELL === 'qt' ? h('span', { class: 'tiny muted' }, cap(mode)) : null,
    h('button', { class: 'btn ghost small', onclick: () => openInMain(mainRoute()) }, 'Open in main'));
}
function mainRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  return { storyline: '#/guides?jump=1', pokedex: hash.startsWith('species/') ? '#/pokedex/' + hash.split('/')[1] : '#/pokedex', reports: '#/live/reports',
    typechart: '#/tools/typechart', natures: '#/tools/natures', breeding: '#/tools/breeding', legendaries: '#/live/legendaries', cave: '#/live/cave' }[POPOUT] || '#/home';
}

async function renderBody() {
  const keep = bodyEl.scrollTop;
  try {
    const fn = { storyline, pokedex, reports, typechart, breeding, legendaries, cave, natures }[POPOUT];
    if (!fn) { mount(bodyEl, notice('bad', 'Unknown popout: ' + POPOUT)); return; }
    await fn(bodyEl);
  } catch (e) { mount(bodyEl, notice('bad', e.message)); }
  bodyEl.scrollTop = keep;
}

// ---------------------------------------------------------------- storyline
let storyRegion = null;
async function storyline(el) {
  const runs = await get('/api/guides/runs');
  const run = runs.runs.find((r) => r.id === runs.active) || runs.runs[0];
  if (!run) { mount(el, h('div', { class: 'stack tight' }, h('div', { class: 'objective' }, 'No character run yet.'),
    h('button', { class: 'btn', onclick: () => openInMain('#/guides') }, 'Create one in Guides'))); return; }
  const region = storyRegion || run.last_region;
  const st = await get(`/api/guides/runs/${run.id}/state?region=${region}`);
  const steps = st.steps.filter((s) => st.show_optional || s.mandatory !== false);
  const done = new Set(st.done);
  const i = Math.max(0, steps.findIndex((s) => s.id === st.active_step_id));
  const cur = steps[i];
  const counts = st.source === 'imported' ? st.counts.unclassified : st.counts.mandatory;
  const setActive = async (idx) => { const s = steps[Math.max(0, Math.min(steps.length - 1, idx))]; if (s) { await api('PATCH', `/api/guides/runs/${run.id}`, { region, active_step_id: s.id }); storyline(el); } };
  const toggle = async (s, val) => {
    const idx = steps.findIndex((x) => x.id === s.id);
    const next = steps.slice(idx + 1).find((x) => !done.has(x.id));
    await post(`/api/guides/runs/${run.id}/steps`, { step: s.id, done: val, region, advance: val && s.id === st.active_step_id, next_active: next && next.id });
    storyline(el);
  };
  const stepEl = (s, big) => h('label', { class: 'step' + (done.has(s.id) ? ' done' : '') + (s.id === cur.id ? ' current' : ''), style: { gridTemplateColumns: 'auto 1fr', cursor: 'pointer', padding: big ? '10px' : '7px 9px' } },
    h('input', { type: 'checkbox', class: 'check', checked: done.has(s.id), onchange: (e) => toggle(s, e.target.checked) }),
    h('div', null, h('div', { class: big ? 'objective s-text' : 's-text small' }, s.text), big ? h('div', { class: 'tiny muted' }, s.chapter) : null));
  const header = h('div', { class: 'stack tight', style: { marginBottom: '8px' } },
    h('div', { class: 'row' }, h('span', { class: 'initial' }, run.character_name.charAt(0).toUpperCase()), h('div', { class: 'grow', style: { minWidth: 0 } },
      h('div', { class: 'ellipsis', style: { fontWeight: 700 } }, run.display), h('div', { class: 'tiny muted ellipsis' }, `${cap(region)} · ${cur ? cur.chapter : ''}`)),
    mode !== 'compact' ? h('select', { class: 'input', style: { width: 'auto', minHeight: '26px', padding: '1px 4px' }, 'aria-label': 'Region', onchange: async (e) => {
      storyRegion = e.target.value; await api('PATCH', `/api/guides/runs/${run.id}`, { region: storyRegion }); storyline(el); } },
    ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova'].map((r) => h('option', { value: r, selected: r === region ? 'selected' : null }, cap(r)))) : null),
    h('div', { class: 'row' }, h('div', { class: 'progress grow' }, h('span', { style: { width: (counts.total ? counts.done / counts.total * 100 : 0) + '%' } })),
      h('span', { class: 'tiny' }, `${counts.done}/${counts.total}`)));
  const nav = h('div', { class: 'row', style: { marginTop: '8px' } },
    h('button', { class: 'btn small', onclick: () => setActive(i - 1), title: 'Previous step', 'aria-label': 'Previous step' }, icon('back')),
    h('button', { class: 'btn small', onclick: () => setActive(i + 1), title: 'Next step', 'aria-label': 'Next step' }, icon('chev')),
    h('span', { class: 'tiny muted' }, `Step ${i + 1} of ${steps.length}`), h('span', { class: 'grow' }),
    mode !== 'compact' && runs.runs.length > 1 ? h('select', { class: 'input', style: { width: 'auto', minHeight: '26px', padding: '1px 4px' }, 'aria-label': 'Switch character run',
      onchange: async (e) => { storyRegion = null; await saveSettings({ 'guides.active_run': e.target.value }); storyline(el); } },
    runs.runs.map((r) => h('option', { value: r.id, selected: r.id === run.id ? 'selected' : null }, r.display))) : null);
  if (!cur) { mount(el, header, h('div', { class: 'muted' }, 'This guide has no steps.')); return; }
  if (mode === 'compact') { mount(el, header, stepEl(cur, true), nav); return; }
  if (mode === 'standard') {
    const win = steps.slice(Math.max(0, i - 1), i + 6);
    mount(el, header, h('div', { class: 'stack tight' }, win.map((s) => stepEl(s, s.id === cur.id))), nav);
    return;
  }
  // contiguous block of steps in the current chapter (a town visited twice is two separate blocks)
  let lo = i, hi = i;
  while (lo > 0 && steps[lo - 1].chapter === cur.chapter) lo--;
  while (hi < steps.length - 1 && steps[hi + 1].chapter === cur.chapter) hi++;
  const chapterSteps = steps.slice(lo, hi + 1);
  mount(el, header, h('div', { class: 'step-chapter', style: { marginTop: '4px' } }, cur.chapter), h('div', { class: 'stack tight' }, chapterSteps.map((s) => stepEl(s, s.id === cur.id))), nav,
    h('div', { class: 'tiny muted', style: { marginTop: '8px' } }, st.source === 'imported' ? 'Your imported walkthrough (unverified).' : 'Milestone outline (unverified).'));
}

// ---------------------------------------------------------------- pokédex
let miniQuery = '';
async function pokedex(el) {
  const m = location.hash.match(/^#\/species\/(\d+)/);
  if (m) {
    const back = () => { location.hash = '#/'; };
    await renderDetail(el, Number(m[1]), { back, popout: true, mode });
    return;
  }
  const idx = await speciesIndex();
  const results = h('div', { class: 'dex-grid', style: { gridTemplateColumns: `repeat(auto-fill, minmax(${mode === 'compact' ? 90 : 104}px, 1fr))`, gap: '6px' } });
  const drawList = () => {
    const q = miniQuery.trim().toLowerCase();
    const list = idx.filter((s) => !q || s.name.toLowerCase().includes(q) || String(s.id) === q.replace('#', '') || s.types.includes(q)).slice(0, mode === 'expanded' ? 200 : 60);
    mount(results, list.map((s) => h('div', { class: 'dex-card', role: 'button', tabindex: '0', style: { padding: '6px' }, onclick: () => { location.hash = '#/species/' + s.id; } },
      h('span', { class: 'num' }, '#' + pad3(s.id)), h('div', { class: 'sprite', style: { width: '48px', height: '48px', marginTop: '8px' } }, spriteOrFallback(s.icon, s, 48)),
      h('div', { class: 'nm small' }, s.name), mode !== 'compact' ? h('div', { class: 'types' }, typeChips(s.types, true)) : null)));
  };
  mount(el, h('div', { class: 'stack tight' }, h('div', { class: 'search' }, icon('search'), h('input', { class: 'input', type: 'search', placeholder: 'Search Pokémon', value: miniQuery,
    oninput: debounce((e) => { miniQuery = e.target.value; drawList(); }, 120) })), results));
  drawList();
}

// ---------------------------------------------------------------- reports
async function reports(el) {
  const r = await get('/api/live/reports?tests=1');
  const list = r.reports.slice(0, mode === 'compact' ? 1 : mode === 'standard' ? 8 : 30);
  const link = (x) => { const row = reportRow(x, false, mode !== 'expanded'); row.onclick = null; row.addEventListener('click', () => openInMain('#/live/reports/' + x.id)); return row; };
  mount(el, h('div', { class: 'stack tight' }, sourceBar(r.source, { compact: true }),
    list.length ? list.map(link) : h('div', { class: 'small muted' }, r.source.enabled ? 'No reports received yet — this does not mean none are active.' : 'Report feed is off; nothing is claimed about current activity.')));
}

async function typechart(el) { clear(el); await renderTypeChart(el, null, { compact: mode !== 'expanded' }); }
async function natures(el) { clear(el); await renderNatures(el, null, { compact: mode === 'compact' }); }
async function breeding(el) { await renderBreeding(el, null, { popout: true, mode }); }
async function legendaries(el) { await renderLegendaries(el, { compact: mode !== 'expanded' }); }
async function cave(el) { await renderCave(el, { compact: mode !== 'expanded' }); }
