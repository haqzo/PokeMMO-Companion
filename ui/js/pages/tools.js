import { uiLabel } from '../i18n.js';
import { number, plural, t as translateUI } from '../i18n.js';
import { gameTerm, speciesLabel } from '../game-locale.js';
// Tools workspace (docs/design/07): grouped hub + individual tools.
import { teamEditor, purposeLabel } from '../team-editor.js';
import { t as tr } from '../i18n.js';
import * as calcPage from './calculator.js';
import { legacyRoute } from './collection.js';
import { h, mount, icon, get, post, api, state, badge, notice, typeChip, typeChips, cap, seg, toast, extLink, confirmDialog, on } from '../core.js';
import { go, popoutButton, pinButton, makePinDraggable, openPopout, isPinned, pinToSidebar } from '../shell.js';
import { speciesPicker, speciesIndex, natureSelect } from '../components.js';
import * as breeding from './breeding.js';

const STATS = [['hp', 'HP'], ['attack', 'Atk'], ['defense', 'Def'], ['sp_attack', 'SpA'], ['sp_defense', 'SpD'], ['speed', 'Spe']];
// Only translate application-authored calculator messages; leave calculations and API values intact.
const CALC_MESSAGE_KEYS = {
  "Generation II–V chart with 17 types (no Fairy), matching PokeMMO's dump and the in-game type chart. Steel resists Ghost and Dark.": "toolui.chart_note",
  "Gen III+ formula with integer rounding (same core formula as the PokeMMO Showdown and PokéStats calculators). Base stats from your installed data.": "toolui.stat_note",
  "Gen III+ formula with integer rounding (same core formula as the PokeMMO Showdown and PokéStats calculators). Base stats from your installed data (form-specific).": "toolui.stat_form_note",
  "Your installed dump": "toolui.dump",
  "Official changelog 30 Oct 2026: Lickitung base catch rate 45 → 75": "toolui.lickitung",
  "Gen III/IV capture formula with four shake checks, as used by public PokeMMO catch calculators.": "toolui.catch_formula",
  "Percentages are per ball thrown. Balls marked “condition not confirmed” use mainline values whose PokeMMO behaviour has not been confirmed.": "toolui.catch_unconfirmed",
  "Alpha, raid and legendary capture rules are not modelled.": "toolui.catch_excluded",
  "Always catches": "toolui.master",
  "Water/Bug target ×3": "toolui.net_yes",
  "Not Water/Bug ×1": "toolui.net_no",
  "Night or cave ×3.5": "toolui.dusk_yes",
  "Daytime outside caves ×1": "toolui.dusk_no",
  "First turn ×5": "toolui.quick_yes",
  "After turn 1 ×1": "toolui.quick_no",
  "Already registered as caught ×3": "toolui.repeat_yes",
  "Not caught before ×1": "toolui.repeat_no",
  "Surfing/fishing ×3.5": "toolui.dive_yes",
  "On land ×1": "toolui.dive_no",
  "Sleeping target ×4": "toolui.dream_yes",
  "Target awake ×1": "toolui.dream_no",
  "×1 (raises friendship only)": "toolui.luxury",
  "catch rate must be 1–255": "toolui.catch_rate_error",
  "HP must be 1 ≤ current ≤ max": "toolui.hp_error",
  "Unknown status": "toolui.status_error",
  "IV must be 0–31": "toolui.iv_error",
  "EV must be 0–252": "toolui.ev_error",
  "Level must be 1–100": "toolui.level_error",
  "Import data and choose a species": "toolui.choose_error",
  "Unknown form": "toolui.unknown_form",
  "Encounter size must be 1, 3 or 5": "errorui.horde_size",
  "EVs must be 0–252": "errorui.ev_range_plural"
};
export function calcMessage(value) {
  if (Object.hasOwn(CALC_MESSAGE_KEYS, value)) return translateUI(CALC_MESSAGE_KEYS[value]);
  if (typeof value !== 'string') return value;
  let m;
  if ((m = /^\(41 − level (\d+)\) ÷ 10, minimum ×1$/.exec(value))) return translateUI('toolui.nest', { level: m[1] });
  if ((m = /^1 \+ turns passed × 0\.3, max ×4 \(turn (\d+)\)$/.exec(value))) return translateUI('toolui.timer', { turn: m[1] });
  if ((m = /^EV total (\d+) is over 510$/.exec(value))) return translateUI('toolui.total_error', { total: m[1] });
  return value;
}
const statShort = (label) => translateUI('boxui.stat_' + label.toLowerCase());

let unsub = [];
export function dispose() { unsub.forEach((u) => u()); unsub = []; breeding.dispose && breeding.dispose(); calcPage.dispose();  if (typeof ownMod !== 'undefined' && ownMod && ownMod.dispose) ownMod.dispose(); }

const TOOLS = {
  typechart: { title: 'Type matchups', icon: 'shield', group: 'battle', status: 'CORROBORATED', desc: '17-type chart (no Fairy), defensive checker and a two-Pokémon comparison', descKey: 'ui.b272_tool_desc_typechart', render: (el, route) => renderTypeChart(el, route, { compare: true }) },
  natures: { title: 'Natures', icon: 'leaf', group: 'battle', status: 'CORROBORATED', desc: 'All 25 natures and their stat effects', descKey: 'ui.b272_tool_desc_natures', render: renderNatures },
  stats: { title: 'Stat calculator', icon: 'calc', group: 'battle', status: 'ESTIMATE', desc: 'Standard formula with PokeMMO base stats', descKey: 'ui.b272_tool_desc_stats', render: renderStats },
  breeding: { title: 'Breeding planner', icon: 'egg', group: 'breeding', status: 'PARTIAL', desc: 'Preview · Plan · Egg moves', descKey: 'ui.b272_tool_desc_breeding', render: (el, r) => breeding.render(el, r) },
  team: { title: 'Team builder', icon: 'team', group: 'planning', status: 'CORROBORATED', desc: 'Type coverage and weaknesses for six slots', descKey: 'ui.b272_tool_desc_team', render: renderTeam },
  ev: { title: 'EV & horde planner', icon: 'target', group: 'planning', status: 'DUMP_ONLY', desc: 'EV yields and horde arithmetic', descKey: 'ui.b272_tool_desc_ev', render: renderEv },
  catch: { title: 'Catch calculator', icon: 'target', group: 'planning', status: '', desc: 'Capture chance per ball with PokeMMO ball conditions', descKey: 'ui.b272_tool_desc_catch', render: renderCatch },
  calculator: { title: 'Calculator', icon: 'calc', group: 'planning', status: '', desc: 'Everyday arithmetic: + − × ÷, percent, keyboard input', descKey: 'ui.b272_tool_desc_calculator', render: (el) => calcPage.renderCalculator(el) },
  timers: { title: 'Timers', icon: 'clock', group: 'planning', status: '', own: () => import('./timers.js'), desc: 'Several named countdowns with presets, repeat, sound and notifications', descKey: 'ui.b272_tool_desc_timers', popout: 'timers' },
  // Connected tools render their own full page (header, pin, popout).
  items: { title: 'Item Library', i18n: 'items.title', icon: 'bag', group: 'collection', status: '', own: () => import('./items.js'), descKey: 'items.desc', popout: 'items' },
  notes: { title: 'Notes', i18n: 'notes.title', icon: 'note', group: 'collection', status: '', own: () => import('./notes.js'), descKey: 'notes.desc', popout: 'notes' },
  box: { title: 'My Pokémon', i18n: 'collection.mine', icon: 'box', group: 'collection', status: '', own: () => import('./box.js'), descKey: 'box.desc', popout: 'box' },
  showcase: { title: 'Showcase', i18n: 'showcase.title', icon: 'sparkle', group: 'collection', status: '', own: () => import('./box.js').then((m) => ({ render: m.renderShowcasePage, dispose: m.dispose })), descKey: 'showcase.desc', popout: 'showcase' },
  locations: { title: 'Location explorer', i18n: 'loc.title', icon: 'map', group: 'collection', status: '', own: () => import('./locations.js'), descKey: 'loc.desc', popout: 'locations' },
  links: { title: 'Websites & links', i18n: 'links.title', icon: 'external', group: 'collection', status: '', own: () => import('./websites.js'), descKey: 'links.desc' },
};
let ownMod = null;
// Owner decision 2026-11-22: researched + tested tools carry no status badge; uncertainty is shown
// per record/value inside the tool. Only genuinely incomplete tools would get an 'Experimental' badge.
const STATUS_BADGE = { EXPERIMENTAL: ['UNKNOWN', 'Experimental'] };
const statusBadge = (t) => (STATUS_BADGE[t.status] ? badge(...STATUS_BADGE[t.status]) : null);
const ttl = (t) => (t.i18n ? tr(t.i18n) : uiLabel(t.title));
const tdesc = (t) => (t.descKey ? tr(t.descKey) : uiLabel(t.desc));

export async function render(el, route) {
  dispose();
  if (ownMod && ownMod.dispose) ownMod.dispose();
  ownMod = null;
  const tool = route.parts[0];
  if (tool === 'box' || tool === 'showcase') {  // My Box and Showcase now live in Collection
    location.replace(legacyRoute(tool, route.parts.slice(1), route.query)); return;
  }
  if (tool === 'damage') { toast(translateUI('ui.b272_tools_removed'), { kind: 'warn', timeout: 5000 }); go('#/tools'); return; }
  if (tool && TOOLS[tool] && TOOLS[tool].own) {
    ownMod = await TOOLS[tool].own();
    await ownMod.render(el, route);
    return;
  }
  if (tool && TOOLS[tool]) {
    const t = TOOLS[tool];
    const page = h('div', { class: 'page' });
    mount(el, page);
    page.append(h('div', { class: 'page-head' }, h('button', { class: 'btn ghost', onclick: () => go('#/tools') }, icon('back'), translateUI('tools.title')),
      h('div', null, h('h1', null, ttl(t)), h('div', { class: 'sub' }, tdesc(t))),
      h('div', { class: 'actions' }, statusBadge(t),
        pinButton({ kind: 'tool', id: tool }),
        ['typechart', 'natures', 'breeding', 'calculator'].includes(tool) ? popoutButton(tool) : null)));
    const body = h('div');
    page.append(body);
    await t.render(body, route);
    return;
  }
  renderHub(el);
}

async function renderHub(el) {
  const page = h('div', { class: 'page' });
  mount(el, page);
  page.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, translateUI('tools.title')),
    h('div', { class: 'sub' }, translateUI('ui.b272_tools_intro')))));
  const [plans, teams] = await Promise.all([get('/api/docs/breeding_plan'), get('/api/docs/team')]);
  const recent = [...plans.items.map((p) => ({ ...p, k: 'breeding' })), ...teams.items.map((t) => ({ ...t, k: 'team' }))]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 4);
  const POP = { typechart: 'typechart', natures: 'natures', breeding: 'breeding' };
  const toolCard = (k, t) => {
    const pop = t.popout || POP[k];
    const card = h('div', { class: 'tool-card', role: 'group', 'aria-label': ttl(t) },
      h('button', { class: 'tool-main', onclick: () => go('#/tools/' + k) },
        h('span', { class: 'tool-ic' }, icon(t.icon)),
        h('span', { class: 'grow' }, h('span', { class: 'tl-title' }, ttl(t)), h('span', { class: 'small muted tl-desc' }, tdesc(t)))),
      h('div', { class: 'tool-foot' }, statusBadge(t), h('span', { class: 'grow' }),
        pop ? h('button', { class: 'icon-btn sm', title: translateUI('ui.b272_tool_open_popout', { tool: ttl(t) }), 'aria-label': translateUI('ui.b272_tool_popout', { tool: ttl(t) }), onclick: () => openPopout(pop) }, icon('popout')) : null,
        h('button', { class: 'icon-btn sm' + (isPinned({ kind: 'tool', id: k }) ? ' on' : ''), title: translateUI('ui.b272_tools_pin'), 'aria-label': translateUI('ui.b272_tool_pin_aria', { tool: ttl(t) }),
          onclick: async (e) => { await pinToSidebar({ kind: 'tool', id: k }); e.currentTarget.classList.add('on'); } }, icon('pin'))));
    makePinDraggable(card, { kind: 'tool', id: k });
    return card;
  };
  const group = (id, title, sub) => h('section', { class: 'tool-group' }, h('div', { class: 'tg-head' }, h('h2', null, title), h('div', { class: 'small muted' }, sub)),
    h('div', { class: 'tool-cards' }, Object.entries(TOOLS).filter(([, t]) => t.group === id).map(([k, t]) => toolCard(k, t))));
  page.append(h('div', { class: 'tools-layout' },
    h('div', { class: 'stack' },
      group('battle', translateUI('ui.b272_tools_battle'), translateUI('ui.b272_tools_battle_sub')),
      group('breeding', translateUI('ui.b272_tools_breeding'), translateUI('ui.b272_tools_breeding_sub')),
      group('planning', translateUI('ui.b272_tools_planning'), translateUI('ui.b272_tools_planning_sub')),
      group('collection', tr('tools.group.collection'), tr('tools.group.collection_sub'))),
    h('aside', { class: 'stack' },
      h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, translateUI('ui.b272_continue'))),
        recent.length ? h('div', { class: 'stack tight' }, recent.map((d) => h('button', { class: 'tool-link', onclick: () => go(d.k === 'breeding' ? `#/tools/breeding?tab=plan&plan=${d.id}` : `#/tools/team?team=${d.id}`) },
          icon(d.k === 'breeding' ? 'egg' : 'team'), h('div', null, h('div', { class: 'tl-title' }, d.name), h('div', { class: 'small muted' }, translateUI('toolui.recent', { kind: translateUI(d.k === 'breeding' ? 'ui.breeding_plan' : 'ui.team'), age: relTimeShort(d.updated_at) })))))) :
          h('div', { class: 'small muted' }, translateUI('ui.b272_tools_continue_empty'))),
      h('section', { class: 'card stack tight' }, h('h2', { style: { margin: 0, fontSize: '1.05rem' } }, translateUI('ui.b272_tools_numbers')),
        h('div', { class: 'small' }, translateUI('ui.b272_tools_numbers_desc')),
        h('p', { class: 'small muted', style: { margin: 0 } }, translateUI('ui.b272_tools_scope'))))));
}
function relTimeShort(iso) { const d = (Date.now() - new Date(iso)) / 86400000; return d < 1 ? translateUI('toolui.today') : translateUI('toolui.days_ago', { days: number(Math.floor(d)) }); }

// ------------------------------------------------------------ type chart
// Attacker = row (Y), defender = column (X). Hover/focus highlights the whole row AND column;
// click (or Enter) locks the selection; Esc clears. 17 types, Gen II–V rules, no Fairy.
let tc = null;
const MULT_TEXT = { 2: 'ui.b272_chart_super', 0.5: 'ui.b272_chart_weak', 0: 'ui.b272_chart_zero', 1: 'ui.b272_chart_normal' };
const multLabel = (m) => (m === 0.5 ? '½×' : m === 0.25 ? '¼×' : `${m}×`);
export function typeChartReadout(a, d) {
  const m = (tc.matrix[tc.types.indexOf(a)] || [])[tc.types.indexOf(d)];
  return { m, text: translateUI('ui.b272_chart_readout', { attack: gameTerm('type', cap(a)), defender: gameTerm('type', cap(d)), multiplier: multLabel(m), effect: translateUI(MULT_TEXT[m]) }) };
}
export async function renderTypeChart(el, route, { compact = false, compare = false } = {}) {
  tc = tc || await get('/api/tools/typechart');
  const T = tc.types;
  let lock = null;          // {r, c} locked cell
  let focusView = compact;  // compact windows start in the focused row/column view
  let focusAxis = 'attacker', focusType = 'flying';
  let defTypes = [], offType = null;
  const out = h('div', { class: 'stack' });
  // Main page only: the comparison panel sits right of the chart (below it on narrow windows). Popouts never get it.
  if (compare) {
    const side = h('div', { class: 'tc-compare-slot' });
    const movesSlot = h('div', { class: 'tc-moves-slot' });
    el.append(h('div', { class: 'tc-layout' }, out, side), movesSlot);
    import('./compare.js').then((m) => m.comparePanel(tc, { movesSlot })).then((p) => side.append(p)).catch((e) => side.append(h('div', { class: 'notice warn small' }, translateUI('ui.b272_chart_comparison_error', { error: e.message }))));
  } else el.append(out);

  const readout = h('div', { class: 'tc-readout', 'aria-live': 'polite' }, translateUI('ui.b272_chart_hover'));
  const setReadout = (r, c, locked) => {
    if (r == null) { mount(readout, translateUI('ui.b272_chart_hover')); return; }
    const { m, text } = typeChartReadout(T[r], T[c]);
    mount(readout, h('span', { class: 'mult ' + ({ 2: 'm2', 0.5: 'm05', 0: 'm0', 1: 'm1' }[m]) }, multLabel(m)), ' ', text,
      locked ? h('button', { class: 'btn ghost small', style: { marginLeft: '8px' }, onclick: () => { lock = null; paint(null, null); setReadout(null); } }, translateUI('ui.b272_chart_unlock')) : null);
  };
  let table;
  const paint = (r, c) => {
    table.querySelectorAll('.hl-row, .hl-col, .hl-x').forEach((x) => x.classList.remove('hl-row', 'hl-col', 'hl-x'));
    if (r == null) return;
    table.querySelectorAll(`[data-r="${r}"]`).forEach((x) => x.classList.add('hl-row'));
    table.querySelectorAll(`[data-c="${c}"]`).forEach((x) => x.classList.add('hl-col'));
    const cell = table.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
    if (cell) cell.classList.add('hl-x');
  };
  const buildMatrix = () => {
    table = h('table', { class: 'typechart', role: 'grid', 'aria-label': translateUI('ui.b272_chart_aria') },
      h('thead', null, h('tr', null, h('th', { class: 'corner', scope: 'col' }, h('div', null, translateUI('ui.b272_chart_defender')), h('div', null, translateUI('ui.b272_chart_attacker'))),
        T.map((t, j) => h('th', { scope: 'col', dataset: { c: j }, class: 'colhead' }, h('span', { class: 'tc' }, typeChip(t, true)))))),
      h('tbody', null, T.map((a, i) => h('tr', null, h('th', { scope: 'row', dataset: { r: i }, class: 'rowhead' }, typeChip(a, true)), T.map((d, j) => {
        const m = tc.matrix[i][j];
        return h('td', { class: m === 2 ? 'x2' : m === 0.5 ? 'x05' : m === 0 ? 'x0' : '', dataset: { r: i, c: j }, tabindex: i === 0 && j === 0 ? '0' : '-1', role: 'gridcell',
          'aria-label': typeChartReadout(a, d).text }, m === 1 ? '' : m === 0.5 ? '½' : String(m));
      })))));
    table.addEventListener('mouseover', (e) => {
      if (lock) return;
      const td = e.target.closest('td[data-r]');
      const rh = e.target.closest('th[data-r]'), ch = e.target.closest('th[data-c]');
      if (td) { paint(+td.dataset.r, +td.dataset.c); setReadout(+td.dataset.r, +td.dataset.c); }
      else if (rh) { paint(+rh.dataset.r, -1); }
      else if (ch) { paint(-1, +ch.dataset.c); }
    });
    table.addEventListener('mouseleave', () => { if (!lock) { paint(null, null); setReadout(null); } });
    table.addEventListener('click', (e) => {
      const td = e.target.closest('td[data-r]');
      if (!td) return;
      const r = +td.dataset.r, c = +td.dataset.c;
      lock = lock && lock.r === r && lock.c === c ? null : { r, c };
      paint(lock ? r : null, lock ? c : null); setReadout(lock ? r : null, lock ? c : null, !!lock);
      td.focus();
    });
    table.addEventListener('focusin', (e) => {
      const td = e.target.closest('td[data-r]');
      if (td && !lock) { paint(+td.dataset.r, +td.dataset.c); setReadout(+td.dataset.r, +td.dataset.c); }
    });
    table.addEventListener('keydown', (e) => {
      const td = e.target.closest('td[data-r]');
      if (!td) return;
      let r = +td.dataset.r, c = +td.dataset.c;
      const mv = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
      if (mv) {
        e.preventDefault();
        r = Math.max(0, Math.min(16, r + mv[0])); c = Math.max(0, Math.min(16, c + mv[1]));
        const next = table.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
        td.tabIndex = -1; next.tabIndex = 0; next.focus();
        if (lock) { lock = { r, c }; paint(r, c); setReadout(r, c, true); }
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); lock = lock ? null : { r, c }; paint(r, c); setReadout(r, c, !!lock);
      } else if (e.key === 'Escape') {
        lock = null; paint(null, null); setReadout(null);
      }
    });
    return table;
  };
  const legend = h('div', { class: 'row wrap small' }, h('span', { class: 'mult m2' }, '2×'), translateUI('ui.b272_chart_super'), h('span', { class: 'mult m05' }, '½×'), translateUI('ui.b272_chart_weak'),
    h('span', { class: 'mult m0' }, '0×'), translateUI('ui.b272_chart_zero'), h('span', { class: 'mult m1' }, ' '), translateUI('ui.b272_chart_blank'));

  const focusPanel = () => {
    const idx = T.indexOf(focusType);
    const vals = T.map((o, k) => ({ t: o, m: focusAxis === 'attacker' ? tc.matrix[idx][k] : tc.matrix[k][idx] }));
    const group = (m) => vals.filter((v) => v.m === m).map((v) => typeChip(v.t, true));
    return h('div', { class: 'card stack tight' },
      h('div', { class: 'row wrap' }, seg([['attacker', translateUI('ui.b272_chart_as_attacker')], ['defender', translateUI('ui.b272_chart_as_defender')]], focusAxis, (v) => { focusAxis = v; draw(); }, translateUI('ui.b272_chart_axis')),
        h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': translateUI('ui.type'), onchange: (e) => { focusType = e.target.value; draw(); } },
          T.map((t) => h('option', { value: t, selected: t === focusType ? 'selected' : null }, gameTerm('type', cap(t)))))),
      h('div', { class: 'small muted' }, focusAxis === 'attacker' ? translateUI('ui.b272_chart_attack_focus', { type: gameTerm('type', cap(focusType)) }) : translateUI('ui.b272_chart_defend_focus', { type: gameTerm('type', cap(focusType)) })),
      [[2, '2×', 'm2'], [0.5, '½×', 'm05'], [0, '0×', 'm0'], [1, '1×', 'm1']].map(([m, l, cls]) => (group(m).length ? h('div', { class: 'row wrap' }, h('span', { class: 'mult ' + cls, style: { minWidth: '40px' } }, l), group(m)) : null)));
  };
  const defensive = () => {
    const groups = { '4': [], '2': [], '0.5': [], '0.25': [], '0': [] };
    if (defTypes.length) T.forEach((a, i) => { const m = defTypes.reduce((acc, d) => acc * tc.matrix[i][T.indexOf(d)], 1); if (String(m) in groups) groups[String(m)].push(a); });
    return h('div', { class: 'card stack tight' }, h('div', { class: 'card-head', style: { margin: 0 } }, h('h3', null, translateUI('ui.b272_chart_defensive')), h('span', { class: 'small muted' }, translateUI('ui.b272_chart_defensive_sub'))),
      h('div', { class: 'row wrap' }, T.map((t) => h('button', { class: 'chip btnlike' + (defTypes.includes(t) ? ' active' : ''), 'aria-pressed': String(defTypes.includes(t)),
        onclick: () => { defTypes = defTypes.includes(t) ? defTypes.filter((x) => x !== t) : [...defTypes, t].slice(-2); draw(); } }, typeChip(t, true)))),
      defTypes.length ? h('div', { class: 'stack tight' }, h('div', { class: 'small muted' }, translateUI('ui.b272_chart_defending_types', { types: defTypes.map(x => gameTerm('type', cap(x))).join(' / ') })),
        [['4', '4×', 'm4'], ['2', '2×', 'm2'], ['0.5', '½×', 'm05'], ['0.25', '¼×', 'm025'], ['0', '0×', 'm0']].map(([k, l, cls]) => groups[k].length ? h('div', { class: 'row wrap' },
          h('span', { class: 'mult ' + cls, style: { minWidth: '40px' } }, l), groups[k].map((t) => typeChip(t, true))) : null)) : null);
  };
  const offensive = () => {
    const i = offType ? T.indexOf(offType) : -1;
    const by = (m) => (i < 0 ? [] : T.filter((d, j) => tc.matrix[i][j] === m));
    return h('div', { class: 'card stack tight' }, h('div', { class: 'card-head', style: { margin: 0 } }, h('h3', null, translateUI('ui.b272_chart_offensive')), h('span', { class: 'small muted' }, translateUI('ui.b272_chart_offensive_sub'))),
      h('div', { class: 'row wrap' }, T.map((t) => h('button', { class: 'chip btnlike' + (offType === t ? ' active' : ''), 'aria-pressed': String(offType === t),
        onclick: () => { offType = offType === t ? null : t; draw(); } }, typeChip(t, true)))),
      offType ? h('div', { class: 'stack tight' }, h('div', { class: 'small muted' }, translateUI('ui.b272_chart_attacking_type', { type: gameTerm('type', cap(offType)) })),
        [[2, '2×', 'm2'], [0.5, '½×', 'm05'], [0, '0×', 'm0']].map(([m, l, cls]) => by(m).length ? h('div', { class: 'row wrap' },
          h('span', { class: 'mult ' + cls, style: { minWidth: '40px' } }, l), by(m).map((t) => typeChip(t, true))) : null)) : null);
  };
  const draw = () => {
    const viewSwitch = seg([['matrix', translateUI('ui.b272_chart_full')], ['focus', translateUI('ui.b272_chart_focus')]], focusView ? 'focus' : 'matrix', (v) => { focusView = v === 'focus'; draw(); }, translateUI('ui.b272_chart_view'));
    lock = null;
    mount(out, h('div', { class: 'row wrap' }, viewSwitch, h('span', { class: 'grow' }), legend),
      focusView ? focusPanel() : h('div', { class: 'stack tight' }, readout, h('div', { class: 'tc-scroll' }, buildMatrix())),
      h('div', { class: compact ? 'stack' : 'grid-2' }, defensive(), offensive()),
      h('p', { class: 'small muted', style: { margin: 0 } }, calcMessage(tc.note)));
    setReadout(null);
  };
  draw();
}

// ---------------------------------------------------------------- natures
export async function renderNatures(el, route, { compact = false } = {}) {
  const n = await get('/api/tools/natures');
  let filter = '';
  const holder = h('div');
  const draw = () => {
    const rows = n.natures.filter((x) => !filter || x.up === filter || x.down === filter);
    mount(holder, h('table', { class: 'table compact' }, h('thead', null, h('tr', null, h('th', null, translateUI('ui.nature')), h('th', null, translateUI('ui.b272_nature_up')), h('th', null, translateUI('ui.b272_nature_down')))),
      h('tbody', null, rows.map((x) => h('tr', null, h('td', { style: { fontWeight: 600 } }, gameTerm('nature', x.name)),
        h('td', { style: { color: x.up ? 'var(--good)' : 'var(--text-muted)' } }, x.up ? uiLabel(n.labels[x.up]) : translateUI('ui.b272_nature_neutral')),
        h('td', { style: { color: x.down ? '#e07b77' : 'var(--text-muted)' } }, x.down ? uiLabel(n.labels[x.down]) : '—'))))));
  };
  el.append(h('div', { class: 'stack', style: { maxWidth: '640px' } },
    h('div', { class: 'row wrap' }, h('span', { class: 'label' }, translateUI('ui.b272_nature_stat')), seg([['', translateUI('ui.all')], ...Object.entries(n.labels).filter(([k]) => k !== 'hp').map(([k, v]) => [k, uiLabel(v)])], filter, (v) => { filter = v; draw(); })),
    holder, compact ? null : h('p', { class: 'small muted' }, translateUI('ui.b272_nature_note'))));
  draw();
}

// ------------------------------------------------------------ stat calc
async function renderStats(el) {
  if (!state.boot.dex.imported) { el.append(needsImport()); return; }
  const s = { species: null, level: 50, nature: null, ivs: Object.fromEntries(STATS.map(([k]) => [k, 31])), evs: Object.fromEntries(STATS.map(([k]) => [k, 0])) };
  const out = h('div');
  const run = async () => {
    if (!s.species) { mount(out, h('div', { class: 'muted' }, translateUI('ui.choose_species'))); return; }
    try {
      const r = await post('/api/tools/stats', s);
      const rowOf = (label, vals, strong) => h('tr', null, h('th', { class: 'small' }, label), STATS.map(([k]) => h('td', { style: strong ? { fontWeight: 700, fontSize: '1.15rem' } : null }, vals[k])));
      mount(out, h('div', { class: 'stack tight' }, h('table', { class: 'table' }, h('thead', null, h('tr', null, h('th'), STATS.map(([, l]) => h('th', null, statShort(l))))),
        h('tbody', null, rowOf(translateUI('ui.b272_stats_level', { level: number(r.level) }), r.stats, true), r.level !== 50 ? rowOf(translateUI('ui.b272_stats_level', { level: 50 }), r.at_50) : null, r.level !== 100 ? rowOf(translateUI('ui.b272_stats_level', { level: 100 }), r.at_100) : null, rowOf(translateUI('ui.b272_stats_base'), r.base))),
      h('div', { class: 'small muted' }, translateUI('ui.b272_stats_ev_total', { count: number(r.ev_total) })), h('div', { class: 'tiny muted' }, calcMessage(r.note))));
    } catch (e) { mount(out, notice('bad', calcMessage(e.message))); }
  };
  const evSum = h('span', { class: 'tiny muted' });
  const numRow = (key, max) => h('div', { class: 'iv-grid', style: { gridTemplateColumns: '60px repeat(6, minmax(0,1fr))' } }, h('span', { class: 'label' }, translateUI(key === 'ivs' ? 'ui.team_ivs' : 'ui.team_evs')),
    STATS.map(([k, l]) => h('input', { class: 'input iv-input', type: 'number', min: 0, max, value: s[key][k], 'aria-label': translateUI('toolui.stat_input', { stat: statShort(l), kind: translateUI(key === 'ivs' ? 'ui.team_ivs' : 'ui.team_evs') }),
      oninput: (e) => { s[key][k] = Math.max(0, Math.min(max, Number(e.target.value || 0))); evSum.textContent = translateUI('ui.b272_stats_ev_total', { count: number(STATS.reduce((a, [x]) => a + (s.evs[x] || 0), 0)) }); run(); } })));
  el.append(h('div', { class: 'grid-2', style: { alignItems: 'start' } },
    h('div', { class: 'card stack' }, speciesPicker({ onChange: (id) => { s.species = id; run(); } }),
      h('div', { class: 'row' }, h('div', { class: 'field', style: { width: '110px' } }, h('label', null, translateUI('ui.level')),
        h('input', { class: 'input', type: 'number', min: 1, max: 100, value: 50, oninput: (e) => { s.level = Math.max(1, Math.min(100, Number(e.target.value || 1))); run(); } })),
      h('div', { class: 'field grow' }, h('label', null, translateUI('ui.nature')), natureSelect(null, (v) => { s.nature = v; run(); }))),
      h('div', { class: 'iv-grid', style: { gridTemplateColumns: '60px repeat(6, minmax(0,1fr))' } }, h('span'), STATS.map(([, l]) => h('span', { class: 'label', style: { textAlign: 'center' } }, statShort(l)))),
      numRow('ivs', 31), numRow('evs', 252), evSum, h('div', { class: 'tiny muted' }, translateUI('ui.b272_stats_limits'))),
    h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, translateUI('ui.b272_stats_result'))), out)));
  run();
}

// ------------------------------------------------------------- catch
async function renderCatch(el) {
  if (!state.boot.dex.imported) { el.append(needsImport()); return; }
  const s = { species: null, hp_percent: 100, max_hp: 100, status: 'none', turn: 1, time: 'day', cave: false, water: false, level: 30, caught_before: false };
  const out = h('div');
  const run = async () => {
    if (!s.species) { mount(out, h('div', { class: 'muted' }, translateUI('ui.choose_species'))); return; }
    try {
      const r = await post('/api/tools/catch', s);
      mount(out, h('div', { class: 'stack tight' },
        h('div', { class: 'small' }, translateUI('ui.catch_result', { species: speciesLabel(s.species, r.name), rate: number(r.catch_rate),
          source: calcMessage(r.rate_source), current: number(r.cur_hp), maximum: number(r.max_hp),
          status: ['sleep', 'freeze', 'paralysis', 'poison', 'burn', 'none'].includes(r.status) ? translateUI('ui.catch_' + r.status) : r.status })),
        h('table', { class: 'table compact' }, h('thead', null, h('tr', null, [translateUI('ui.catch_ball'), translateUI('ui.catch_condition'), translateUI('ui.catch_per_ball'), translateUI('ui.catch_90'), translateUI('ui.catch_99')].map((c) => h('th', null, c)))),
          h('tbody', null, r.rows.map((x) => h('tr', null, h('td', null, gameTerm('item', x.label)), h('td', { class: 'small' }, calcMessage(x.condition), x.confirmed ? null : h('span', { class: 'tiny', style: { color: 'var(--warn)' }, title: translateUI('ui.b272_catch_confirm') }, translateUI('ui.catch_unconfirmed'))),
            h('td', { style: { fontWeight: 700 } }, x.guaranteed ? translateUI('ui.catch_guaranteed') : (x.percent >= 99.995 ? '>99.99%' : x.percent + '%')),
            h('td', null, x.balls_for_90 ? plural('ui.catch_count', x.balls_for_90) : '—'), h('td', null, x.balls_for_99 ? plural('ui.catch_count', x.balls_for_99) : '—'))))),
        h('ul', { class: 'tiny muted', style: { margin: 0 } }, r.notes.map((w) => h('li', null, calcMessage(w))))));
    } catch (e) { mount(out, notice('bad', calcMessage(e.message))); }
  };
  const hpLabel = h('span', { class: 'small' }, '100%');
  const sel = (label, key, opts, conv = (v) => v) => h('div', { class: 'field grow' }, h('label', null, label), h('select', { class: 'input', onchange: (e) => { s[key] = conv(e.target.value); run(); } },
    opts.map(([v, l]) => h('option', { value: v, selected: String(s[key]) === String(v) ? 'selected' : null }, l))));
  const chk = (label, key) => h('label', { class: 'row small' }, h('input', { type: 'checkbox', class: 'check', onchange: (e) => { s[key] = e.target.checked; run(); } }), label);
  el.append(h('div', { class: 'grid-2', style: { alignItems: 'start' } },
    h('div', { class: 'card stack' },
      speciesPicker({ onChange: (id) => { s.species = id; run(); } }),
      h('div', { class: 'field' }, h('label', null, translateUI('ui.catch_hp')), h('div', { class: 'row' }, h('input', { type: 'range', min: 1, max: 100, value: 100, 'aria-label': translateUI('ui.catch_hp_label'),
        oninput: (e) => { s.hp_percent = Number(e.target.value); hpLabel.textContent = e.target.value + '%'; run(); } }), hpLabel)),
      h('div', { class: 'row' }, sel(translateUI('ui.catch_status'), 'status', [['none', translateUI('ui.none')], ['sleep', (translateUI('ui.catch_sleep') + ' ×' + number(2))], ['freeze', (translateUI('ui.catch_freeze') + ' ×' + number(2))], ['paralysis', (translateUI('ui.catch_paralysis') + ' ×' + number(1.5))], ['poison', (translateUI('ui.catch_poison') + ' ×' + number(1.5))], ['burn', (translateUI('ui.catch_burn') + ' ×' + number(1.5))]]),
        sel(translateUI('ui.time'), 'time', [['day', translateUI('ui.catch_morning')], ['night', translateUI('ui.night')]])),
      h('div', { class: 'row' }, h('div', { class: 'field', style: { width: '110px' } }, h('label', null, translateUI('ui.catch_turn')), h('input', { class: 'input', type: 'number', min: 1, max: 99, value: 1, oninput: (e) => { s.turn = Number(e.target.value || 1); run(); } })),
        h('div', { class: 'field', style: { width: '120px' } }, h('label', null, translateUI('ui.catch_wild_level')), h('input', { class: 'input', type: 'number', min: 1, max: 100, value: 30, oninput: (e) => { s.level = Number(e.target.value || 1); run(); } }))),
      h('div', { class: 'row wrap' }, chk(translateUI('ui.catch_cave'), 'cave'), chk(translateUI('ui.catch_water'), 'water'), chk(translateUI('ui.catch_caught'), 'caught_before')),
      h('p', { class: 'tiny muted', style: { margin: 0 } }, translateUI('ui.catch_warning'))),
    h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, translateUI('ui.catch_ball_heading'))), out)));
  run();
}

async function renderEv(el) {
  if (!state.boot.dex.imported) { el.append(needsImport()); return; }
  const idx = await speciesIndex();
  let stat = 'speed', target = 252, horde = 5, region = '', current = 0, macho = false;
  const out = h('div');
  const draw = () => {
    const cands = idx.filter((s) => s.ev && s.ev[stat] && (horde === 1 || (horde === 5 ? s.horde5 : s.horde)) && (!region || (s.regions || []).includes(region)))
      .sort((a, b) => (b.ev[stat] - a.ev[stat]) || a.id - b.id).slice(0, 40);
    mount(out, h('div', { class: 'stack' }, h('div', { class: 'small muted' }, translateUI(cands.length ? 'ui.planner_top' : 'ui.planner_no_results', {
      stat: statShort(STATS.find((x) => x[0] === stat)[1]), horde: horde === 5 ? translateUI('ui.planner_horde_only') : '',
      region: region ? translateUI('ui.planner_region_filter', { region: gameTerm('region', cap(region)) }) : '',
    })),
      h('table', { class: 'table compact' }, h('thead', null, h('tr', null, [translateUI('ui.pokemon'), translateUI('ui.planner_yield'),
        translateUI(horde > 1 ? 'ui.planner_ev_horde' : 'ui.planner_ev_battle'),
        translateUI('ui.planner_ev_battles', { current: number(current), target: number(target) }), ''].map((c) => h('th', null, c)))),
        h('tbody', null, cands.map((s) => { const per = s.ev[stat] * (macho ? 2 : 1) * horde; const rem = Math.max(0, target - current);
          return h('tr', null, h('td', null, speciesLabel(s.id, s.name), ' ', typeChips(s.types, true)), h('td', null, `+${s.ev[stat]}`),
          h('td', null, per), h('td', { style: { fontWeight: 700 } }, rem ? Math.ceil(rem / per) : 0),
          h('td', null, h('button', { class: 'btn small ghost', onclick: () => go(`#/pokedex/${s.id}?tab=locations`) }, translateUI('ui.locations')))); }))),
      h('div', { class: 'tiny muted' }, translateUI('ui.planner_ev_formula', { macho: macho ? translateUI('ui.planner_ev_macho') : '' }))));
  };
  el.append(h('div', { class: 'stack' }, h('div', { class: 'card row wrap' },
    h('div', { class: 'field' }, h('label', null, translateUI('ui.planner_stat')), seg(STATS.map(([k, l]) => [k, statShort(l)]), stat, (v) => { stat = v; draw(); })),
    h('div', { class: 'field', style: { width: '110px' } }, h('label', null, translateUI('ui.planner_current_evs')), h('input', { class: 'input', type: 'number', min: 0, max: 252, value: current, oninput: (e) => { current = Math.max(0, Math.min(252, Number(e.target.value || 0))); draw(); } })),
    h('div', { class: 'field', style: { width: '110px' } }, h('label', null, translateUI('ui.planner_target_evs')), h('input', { class: 'input', type: 'number', min: 1, max: 252, value: target, oninput: (e) => { target = Math.max(1, Math.min(252, Number(e.target.value || 1))); draw(); } })),
    h('div', { class: 'field' }, h('label', null, translateUI('ui.planner_encounter')), seg([5, 3, 1].map(count => [count, count === 1 ? translateUI('ui.live_method_single') : translateUI('ui.loc_horde_count', { count })]), horde, (v) => { horde = v; draw(); })),
    h('label', { class: 'row small', style: { alignSelf: 'end' } }, h('input', { type: 'checkbox', class: 'check', onchange: (e) => { macho = e.target.checked; draw(); } }), translateUI('ui.planner_macho')),
    h('div', { class: 'field' }, h('label', null, translateUI('ui.region')), h('select', { class: 'input', onchange: (e) => { region = e.target.value; draw(); } }, h('option', { value: '' }, translateUI('ui.planner_any')),
      ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova'].map((r) => h('option', { value: r }, gameTerm('region', cap(r))))))), out));
  draw();
}

// ------------------------------------------------------------- team
async function renderTeam(el, route) {
  const teams = (await get('/api/docs/team')).items;
  const want = route.query.get('team');
  const doc = teams.find((x) => x.id === want) || null;
  const used = doc ? (await get(`/api/teams/${doc.id}/guides`)).guides : [];
  const picker = h('div', { class: 'card row wrap' },
    h('div', { class: 'field' }, h('label', null, translateUI('ui.planner_saved_teams')), h('select', { class: 'input', onchange: (e) => go(e.target.value ? `#/tools/team?team=${e.target.value}` : '#/tools/team') },
      h('option', { value: '' }, translateUI('ui.planner_new_team')), teams.map((x) => h('option', { value: x.id, selected: doc && x.id === doc.id ? 'selected' : null }, x.name + (x.data && x.data.purpose ? ` · ${purposeLabel(x.data.purpose)}` : ''))))),
    used.length ? h('span', { class: 'small muted' }, translateUI('ui.planner_team_links', { count: number(used.length) })) : null);
  const editor = await teamEditor(doc, { onSaved: (res) => go('#/tools/team?team=' + res.id), onDeleted: () => go('#/tools/team') });
  mount(el, h('div', { class: 'stack' }, picker, editor));
}

function needsImport() {
  return h('div', { class: 'content-narrow stack' }, notice('warn', h('strong', null, translateUI('ui.planner_data_failed')), translateUI('ui.planner_data_required')),
    h('div', null, h('button', { class: 'btn', onclick: () => go('#/settings/about') }, translateUI('ui.planner_diagnostics'))));
}
