// Tools workspace (docs/design/07): grouped hub + individual tools.
import { h, mount, icon, get, post, api, state, badge, notice, typeChip, typeChips, cap, seg, toast, extLink, confirmDialog, on } from '../core.js';
import { go, popoutButton, pinButton, makePinDraggable, openPopout, isPinned, pinToSidebar } from '../shell.js';
import { speciesPicker, speciesIndex, natureSelect } from '../components.js';
import * as breeding from './breeding.js';

const STATS = [['hp', 'HP'], ['attack', 'Atk'], ['defense', 'Def'], ['sp_attack', 'SpA'], ['sp_defense', 'SpD'], ['speed', 'Spe']];
let unsub = [];
export function dispose() { unsub.forEach((u) => u()); unsub = []; breeding.dispose && breeding.dispose(); }

const TOOLS = {
  typechart: { title: 'Type matchups', icon: 'shield', group: 'battle', status: 'CORROBORATED', desc: '17-type chart (no Fairy) + defensive checker', render: renderTypeChart },
  natures: { title: 'Natures', icon: 'leaf', group: 'battle', status: 'CORROBORATED', desc: 'All 25 natures and their stat effects', render: renderNatures },
  stats: { title: 'Stat calculator', icon: 'calc', group: 'battle', status: 'ESTIMATE', desc: 'Standard formula with your dump’s base stats', render: renderStats },
  damage: { title: 'Damage calculator', icon: 'bolt', group: 'battle', status: 'UNAVAILABLE', desc: 'Withheld until PokeMMO cases are verified', render: renderDamage },
  breeding: { title: 'Breeding planner', icon: 'egg', group: 'breeding', status: 'PARTIAL', desc: 'Preview · Plan · Egg moves', render: (el, r) => breeding.render(el, r) },
  team: { title: 'Team builder', icon: 'team', group: 'planning', status: 'CORROBORATED', desc: 'Type coverage and weaknesses for six slots', render: renderTeam },
  ev: { title: 'EV & horde planner', icon: 'target', group: 'planning', status: 'DUMP_ONLY', desc: 'EV yields and horde arithmetic', render: renderEv },
  catch: { title: 'Catch estimate', icon: 'target', group: 'planning', status: 'ESTIMATE', desc: 'Generic model — clearly unverified', render: renderCatch },
};
const STATUS_BADGE = { CORROBORATED: ['CORROBORATED', 'Corroborated'], ESTIMATE: ['ESTIMATE', 'Estimate'], DUMP_ONLY: ['DUMP_ONLY', 'Dump data'],
  UNAVAILABLE: ['UNKNOWN', 'Not available yet'], PARTIAL: ['DUMP_ONLY', 'Rules partly verified'] };

export async function render(el, route) {
  dispose();
  const tool = route.parts[0];
  if (tool && TOOLS[tool]) {
    const t = TOOLS[tool];
    const page = h('div', { class: 'page' });
    mount(el, page);
    page.append(h('div', { class: 'page-head' }, h('button', { class: 'btn ghost', onclick: () => go('#/tools') }, icon('back'), 'Tools'),
      h('div', null, h('h1', null, t.title), h('div', { class: 'sub' }, t.desc)),
      h('div', { class: 'actions' }, badge(...STATUS_BADGE[t.status]),
        t.status !== 'UNAVAILABLE' ? pinButton({ kind: 'tool', id: tool }) : null,
        ['typechart', 'natures', 'breeding'].includes(tool) ? popoutButton(tool) : null)));
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
  page.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Tools'),
    h('div', { class: 'sub' }, 'Calculators and planners. Each tool says how far its numbers can be trusted. Drag a tool onto the sidebar to pin it to Quick access.'))));
  const [plans, teams] = await Promise.all([get('/api/docs/breeding_plan'), get('/api/docs/team')]);
  const recent = [...plans.items.map((p) => ({ ...p, k: 'breeding' })), ...teams.items.map((t) => ({ ...t, k: 'team' }))]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 4);
  const POP = { typechart: 'typechart', natures: 'natures', breeding: 'breeding' };
  const toolCard = (k, t) => {
    const disabled = t.status === 'UNAVAILABLE';
    const card = h('div', { class: 'tool-card' + (disabled ? ' disabled' : ''), role: 'group', 'aria-label': t.title },
      h('button', { class: 'tool-main', onclick: () => go('#/tools/' + k) },
        h('span', { class: 'tool-ic' }, icon(t.icon)),
        h('span', { class: 'grow' }, h('span', { class: 'tl-title' }, t.title), h('span', { class: 'small muted tl-desc' }, t.desc))),
      h('div', { class: 'tool-foot' }, badge(...STATUS_BADGE[t.status]), h('span', { class: 'grow' }),
        POP[k] ? h('button', { class: 'icon-btn sm', title: `Open ${t.title} as a popout window`, 'aria-label': `Pop out ${t.title}`, onclick: () => openPopout(POP[k]) }, icon('popout')) : null,
        !disabled ? h('button', { class: 'icon-btn sm' + (isPinned({ kind: 'tool', id: k }) ? ' on' : ''), title: 'Pin to sidebar Quick access', 'aria-label': `Pin ${t.title} to sidebar`,
          onclick: async (e) => { await pinToSidebar({ kind: 'tool', id: k }); e.currentTarget.classList.add('on'); } }, icon('pin')) : null));
    if (!disabled) makePinDraggable(card, { kind: 'tool', id: k });
    return card;
  };
  const group = (id, title, sub) => h('section', { class: 'tool-group' }, h('div', { class: 'tg-head' }, h('h2', null, title), h('div', { class: 'small muted' }, sub)),
    h('div', { class: 'tool-cards' }, Object.entries(TOOLS).filter(([, t]) => t.group === id).map(([k, t]) => toolCard(k, t))));
  page.append(h('div', { class: 'tools-layout' },
    h('div', { class: 'stack' },
      group('battle', 'Battle & Stats', 'Matchups, natures and stats'),
      group('breeding', 'Breeding', 'Familiar Parent A | Offspring | Parent B workflow, plan tree and egg moves'),
      group('planning', 'Planning & Hunting', 'Teams, EV training and catching')),
    h('aside', { class: 'stack' },
      h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Continue')),
        recent.length ? h('div', { class: 'stack tight' }, recent.map((d) => h('button', { class: 'tool-link', onclick: () => go(d.k === 'breeding' ? `#/tools/breeding?tab=plan&plan=${d.id}` : `#/tools/team?team=${d.id}`) },
          icon(d.k === 'breeding' ? 'egg' : 'team'), h('div', null, h('div', { class: 'tl-title' }, d.name), h('div', { class: 'small muted' }, (d.k === 'breeding' ? 'Breeding plan' : 'Team') + ' · saved ' + relTimeShort(d.updated_at)))))) :
          h('div', { class: 'small muted' }, 'Saved breeding plans and teams appear here.')),
      h('section', { class: 'card stack tight' }, h('h2', { style: { margin: 0, fontSize: '1.05rem' } }, 'Trust levels'),
        h('div', { class: 'small' }, badge('CORROBORATED', 'Corroborated'), ' rules that match PokeMMO’s data and in-game charts.'),
        h('div', { class: 'small' }, badge('DUMP_ONLY', 'Dump data'), ' numbers from your installed dump (date unknown).'),
        h('div', { class: 'small' }, badge('ESTIMATE', 'Estimate'), ' generic formulas, never exact odds.'),
        h('div', { class: 'small' }, badge('UNKNOWN', 'Not available yet'), ' withheld until verified.'),
        h('p', { class: 'small muted', style: { margin: 0 } }, 'No encounter counter (PokeMMO has one). Nothing here reads the game, automates input or fetches GTL prices.')))));
}
function relTimeShort(iso) { const d = (Date.now() - new Date(iso)) / 86400000; return d < 1 ? 'today' : `${Math.floor(d)} d ago`; }

// ------------------------------------------------------------ type chart
// Attacker = row (Y), defender = column (X). Hover/focus highlights the whole row AND column;
// click (or Enter) locks the selection; Esc clears. 17 types, Gen II–V rules, no Fairy.
let tc = null;
const MULT_TEXT = { 2: 'super effective', 0.5: 'not very effective', 0: 'no effect', 1: 'normal damage' };
const multLabel = (m) => (m === 0.5 ? '½×' : m === 0.25 ? '¼×' : `${m}×`);
export function typeChartReadout(a, d) {
  const m = tc.matrix[tc.types.indexOf(a)][tc.types.indexOf(d)];
  return { m, text: `${cap(a)} attack → ${cap(d)} defender: ${multLabel(m)} (${MULT_TEXT[m]})` };
}
export async function renderTypeChart(el, route, { compact = false } = {}) {
  tc = tc || await get('/api/tools/typechart');
  const T = tc.types;
  let lock = null;          // {r, c} locked cell
  let focusView = compact;  // compact windows start in the focused row/column view
  let focusAxis = 'attacker', focusType = 'flying';
  let defTypes = [], offType = null;
  const out = h('div', { class: 'stack' });
  el.append(out);

  const readout = h('div', { class: 'tc-readout', 'aria-live': 'polite' }, 'Hover or focus a cell — rows attack, columns defend. Click to lock.');
  const setReadout = (r, c, locked) => {
    if (r == null) { readout.replaceChildren('Hover or focus a cell — rows attack, columns defend. Click to lock.'); return; }
    const { m, text } = typeChartReadout(T[r], T[c]);
    readout.replaceChildren(h('span', { class: 'mult ' + ({ 2: 'm2', 0.5: 'm05', 0: 'm0', 1: 'm1' }[m]) }, multLabel(m)), ' ', text,
      locked ? h('button', { class: 'btn ghost small', style: { marginLeft: '8px' }, onclick: () => { lock = null; paint(null, null); setReadout(null); } }, 'Unlock (Esc)') : null);
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
    table = h('table', { class: 'typechart', role: 'grid', 'aria-label': 'Type effectiveness. Rows: attacking type. Columns: defending type.' },
      h('thead', null, h('tr', null, h('th', { class: 'corner', scope: 'col' }, h('div', null, 'DEFENDER →'), h('div', null, 'ATTACKER ↓')),
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
  const legend = h('div', { class: 'row wrap small' }, h('span', { class: 'mult m2' }, '2×'), 'super effective', h('span', { class: 'mult m05' }, '½×'), 'not very effective',
    h('span', { class: 'mult m0' }, '0×'), 'no effect', h('span', { class: 'mult m1' }, ' '), 'blank = normal (1×)');

  const focusPanel = () => {
    const idx = T.indexOf(focusType);
    const vals = T.map((o, k) => ({ t: o, m: focusAxis === 'attacker' ? tc.matrix[idx][k] : tc.matrix[k][idx] }));
    const group = (m) => vals.filter((v) => v.m === m).map((v) => typeChip(v.t, true));
    return h('div', { class: 'card stack tight' },
      h('div', { class: 'row wrap' }, seg([['attacker', 'As attacker (row)'], ['defender', 'As defender (column)']], focusAxis, (v) => { focusAxis = v; draw(); }, 'Axis'),
        h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': 'Type', onchange: (e) => { focusType = e.target.value; draw(); } },
          T.map((t) => h('option', { value: t, selected: t === focusType ? 'selected' : null }, cap(t))))),
      h('div', { class: 'small muted' }, focusAxis === 'attacker' ? `${cap(focusType)} attacking each defending type:` : `Each attacking type hitting a ${cap(focusType)} defender:`),
      [[2, '2×', 'm2'], [0.5, '½×', 'm05'], [0, '0×', 'm0'], [1, '1×', 'm1']].map(([m, l, cls]) => (group(m).length ? h('div', { class: 'row wrap' }, h('span', { class: 'mult ' + cls, style: { minWidth: '40px' } }, l), group(m)) : null)));
  };
  const defensive = () => {
    const groups = { '4': [], '2': [], '0.5': [], '0.25': [], '0': [] };
    if (defTypes.length) T.forEach((a, i) => { const m = defTypes.reduce((acc, d) => acc * tc.matrix[i][T.indexOf(d)], 1); if (String(m) in groups) groups[String(m)].push(a); });
    return h('div', { class: 'card stack tight' }, h('div', { class: 'card-head', style: { margin: 0 } }, h('h3', null, 'Defensive check'), h('span', { class: 'small muted' }, 'Up to two defending types')),
      h('div', { class: 'row wrap' }, T.map((t) => h('button', { class: 'chip btnlike' + (defTypes.includes(t) ? ' active' : ''), 'aria-pressed': String(defTypes.includes(t)),
        onclick: () => { defTypes = defTypes.includes(t) ? defTypes.filter((x) => x !== t) : [...defTypes, t].slice(-2); draw(); } }, typeChip(t, true)))),
      defTypes.length ? h('div', { class: 'stack tight' }, h('div', { class: 'small muted' }, `Attacks against a ${defTypes.map(cap).join(' / ')} Pokémon:`),
        [['4', '4×', 'm4'], ['2', '2×', 'm2'], ['0.5', '½×', 'm05'], ['0.25', '¼×', 'm025'], ['0', '0×', 'm0']].map(([k, l, cls]) => groups[k].length ? h('div', { class: 'row wrap' },
          h('span', { class: 'mult ' + cls, style: { minWidth: '40px' } }, l), groups[k].map((t) => typeChip(t, true))) : null)) : null);
  };
  const offensive = () => {
    const i = offType ? T.indexOf(offType) : -1;
    const by = (m) => (i < 0 ? [] : T.filter((d, j) => tc.matrix[i][j] === m));
    return h('div', { class: 'card stack tight' }, h('div', { class: 'card-head', style: { margin: 0 } }, h('h3', null, 'Offensive check'), h('span', { class: 'small muted' }, 'One attacking move type')),
      h('div', { class: 'row wrap' }, T.map((t) => h('button', { class: 'chip btnlike' + (offType === t ? ' active' : ''), 'aria-pressed': String(offType === t),
        onclick: () => { offType = offType === t ? null : t; draw(); } }, typeChip(t, true)))),
      offType ? h('div', { class: 'stack tight' }, h('div', { class: 'small muted' }, `A ${cap(offType)} move against single-type defenders:`),
        [[2, '2×', 'm2'], [0.5, '½×', 'm05'], [0, '0×', 'm0']].map(([m, l, cls]) => by(m).length ? h('div', { class: 'row wrap' },
          h('span', { class: 'mult ' + cls, style: { minWidth: '40px' } }, l), by(m).map((t) => typeChip(t, true))) : null)) : null);
  };
  const draw = () => {
    const viewSwitch = seg([['matrix', 'Full chart'], ['focus', 'Focus one type']], focusView ? 'focus' : 'matrix', (v) => { focusView = v === 'focus'; draw(); }, 'Chart view');
    lock = null;
    mount(out, h('div', { class: 'row wrap' }, viewSwitch, h('span', { class: 'grow' }), legend),
      focusView ? focusPanel() : h('div', { class: 'stack tight' }, readout, h('div', { class: 'tc-scroll' }, buildMatrix())),
      h('div', { class: compact ? 'stack' : 'grid-2' }, defensive(), offensive()),
      h('p', { class: 'small muted', style: { margin: 0 } }, tc.note));
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
    mount(holder, h('table', { class: 'table compact' }, h('thead', null, h('tr', null, h('th', null, 'Nature'), h('th', null, 'Raises (+10%)'), h('th', null, 'Lowers (−10%)'))),
      h('tbody', null, rows.map((x) => h('tr', null, h('td', { style: { fontWeight: 600 } }, x.name),
        h('td', { style: { color: x.up ? 'var(--good)' : 'var(--text-muted)' } }, x.up ? n.labels[x.up] : 'Neutral'),
        h('td', { style: { color: x.down ? '#e07b77' : 'var(--text-muted)' } }, x.down ? n.labels[x.down] : '—'))))));
  };
  el.append(h('div', { class: 'stack', style: { maxWidth: '640px' } },
    h('div', { class: 'row wrap' }, h('span', { class: 'label' }, 'Involving stat'), seg([['', 'All'], ...Object.entries(n.labels).filter(([k]) => k !== 'hp')], filter, (v) => { filter = v; draw(); })),
    holder, compact ? null : h('p', { class: 'small muted' }, 'Standard 25 natures; neutral natures change nothing. Everstone passes a parent’s nature when breeding (official rule).')));
  draw();
}

// ------------------------------------------------------------ stat calc
async function renderStats(el) {
  if (!state.boot.dex.imported) { el.append(needsImport()); return; }
  const s = { species: null, level: 50, nature: null, ivs: Object.fromEntries(STATS.map(([k]) => [k, 31])), evs: Object.fromEntries(STATS.map(([k]) => [k, 0])) };
  const out = h('div');
  const run = async () => {
    if (!s.species) { mount(out, h('div', { class: 'muted' }, 'Choose a species.')); return; }
    try {
      const r = await post('/api/tools/stats', s);
      mount(out, h('div', { class: 'stack tight' }, h('table', { class: 'table' }, h('thead', null, h('tr', null, STATS.map(([, l]) => h('th', null, l)))),
        h('tbody', null, h('tr', null, STATS.map(([k]) => h('td', { style: { fontWeight: 700, fontSize: '1.15rem' } }, r.stats[k]))))),
      r.ev_warning ? notice('warn', `EV total ${r.ev_total} exceeds the usual 510 cap.`) : h('div', { class: 'small muted' }, `EV total ${r.ev_total} / 510`),
      notice('warn', h('strong', null, 'Estimate. '), r.note)));
    } catch (e) { mount(out, notice('bad', e.message)); }
  };
  const numRow = (key, max) => h('div', { class: 'iv-grid', style: { gridTemplateColumns: '60px repeat(6, minmax(0,1fr))' } }, h('span', { class: 'label' }, key === 'ivs' ? 'IVs' : 'EVs'),
    STATS.map(([k, l]) => h('input', { class: 'input iv-input', type: 'number', min: 0, max, value: s[key][k], 'aria-label': `${l} ${key}`, oninput: (e) => { s[key][k] = Number(e.target.value || 0); run(); } })));
  el.append(h('div', { class: 'grid-2', style: { alignItems: 'start' } },
    h('div', { class: 'card stack' }, speciesPicker({ onChange: (id) => { s.species = id; run(); } }),
      h('div', { class: 'row' }, h('div', { class: 'field', style: { width: '110px' } }, h('label', null, 'Level'),
        h('input', { class: 'input', type: 'number', min: 1, max: 100, value: 50, oninput: (e) => { s.level = Number(e.target.value || 1); run(); } })),
      h('div', { class: 'field grow' }, h('label', null, 'Nature'), natureSelect(null, (v) => { s.nature = v; run(); }))),
      h('div', { class: 'iv-grid', style: { gridTemplateColumns: '60px repeat(6, minmax(0,1fr))' } }, h('span'), STATS.map(([, l]) => h('span', { class: 'label', style: { textAlign: 'center' } }, l))),
      numRow('ivs', 31), numRow('evs', 255)),
    h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, 'Calculated stats')), out)));
  run();
}

// ------------------------------------------------------------- damage
function renderDamage(el) {
  el.append(h('div', { class: 'content-narrow stack' },
    notice('warn', h('strong', null, 'Not available in v0.1.0. '), 'A damage calculator is only shown once its results match verified PokeMMO cases. Showing generic cartridge numbers would look precise while being possibly wrong.'),
    h('div', { class: 'card stack tight' }, h('h3', { style: { margin: 0 } }, 'What is needed before it can be enabled'),
      h('ul', { style: { margin: 0 } }, h('li', null, 'Recorded in-game cases (attacker/defender, level, IVs/EVs, nature, item, ability, weather, crits) with observed damage ranges.'),
        h('li', null, 'PokeMMO-specific rules: Hail ≠ Snowscape (30 Oct 2026), current abilities and items.'),
        h('li', null, 'A regression suite that passes on those cases.')),
      h('div', { class: 'small muted' }, 'Research candidate: ', extLink('https://github.com/PokeMMO-Showdown/mmoshowdown-damage-calc', 'PokeMMO Showdown damage calc source'), ' (reference only; not copied).')),
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => go('#/tools/typechart') }, 'Use type matchups instead'))));
}

// ------------------------------------------------------------- catch
async function renderCatch(el) {
  if (!state.boot.dex.imported) { el.append(needsImport()); return; }
  const s = { species: null, hp_percent: 100, ball: 1, status: 1, acknowledged: false };
  const out = h('div');
  const run = async () => {
    if (!s.acknowledged) { mount(out, notice('info', 'Tick the confirmation to show an estimate.')); return; }
    if (!s.species) { mount(out, h('div', { class: 'muted' }, 'Choose a species.')); return; }
    try {
      const r = await post('/api/tools/catch', s);
      mount(out, h('div', { class: 'stack' }, h('div', { class: 'row' }, h('span', { style: { fontSize: '2rem', fontWeight: 700 } }, `~${r.estimate_percent}%`), badge('ESTIMATE', 'Unverified estimate')),
        h('div', { class: 'small muted' }, `Per ball thrown · catch rate ${r.catch_rate} from your dump · model: ${r.model}`),
        h('ul', { class: 'small', style: { margin: 0, color: 'var(--text-secondary)' } }, r.warnings.map((w) => h('li', null, w)))));
    } catch (e) { mount(out, notice('bad', e.message)); }
  };
  const hpLabel = h('span', { class: 'small' }, '100%');
  el.append(h('div', { class: 'grid-2', style: { alignItems: 'start' } },
    h('div', { class: 'card stack' }, notice('warn', h('strong', null, 'PokeMMO’s catch formula is not public. '), 'This uses a generic, simplified model. It can be wrong and must never be read as exact odds.'),
      h('label', { class: 'row' }, h('input', { type: 'checkbox', class: 'check', onchange: (e) => { s.acknowledged = e.target.checked; run(); } }), 'I understand this is an unverified estimate'),
      speciesPicker({ onChange: (id) => { s.species = id; run(); } }),
      h('div', { class: 'field' }, h('label', null, 'Target HP remaining'), h('div', { class: 'row' }, h('input', { type: 'range', min: 1, max: 100, value: 100,
        oninput: (e) => { s.hp_percent = Number(e.target.value); hpLabel.textContent = e.target.value + '%'; run(); } }), hpLabel)),
      h('div', { class: 'row' }, h('div', { class: 'field grow' }, h('label', null, 'Ball (standard-game multipliers, unverified)'),
        h('select', { class: 'input', onchange: (e) => { s.ball = Number(e.target.value); run(); } }, [['1', 'Poké Ball ×1'], ['1.5', 'Great Ball ×1.5'], ['2', 'Ultra Ball ×2'], ['3', 'Conditional ball ×3'], ['3.5', 'Dusk Ball (qualifying) ×3.5']].map(([v, l]) => h('option', { value: v }, l)))),
      h('div', { class: 'field grow' }, h('label', null, 'Status'), h('select', { class: 'input', onchange: (e) => { s.status = Number(e.target.value); run(); } },
        [['1', 'None'], ['1.5', 'Paralysis / Poison / Burn ×1.5'], ['2.5', 'Sleep / Freeze ×2.5']].map(([v, l]) => h('option', { value: v }, l))))),
      h('p', { class: 'tiny muted', style: { margin: 0 } }, 'Dusk Ball cave bonus no longer applies at Twist Mountain Center (official, 30 Oct 2026) — not every cave-named location qualifies.')),
    h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, 'Estimate')), out)));
  run();
}

// ------------------------------------------------------------ EV planner
async function renderEv(el) {
  if (!state.boot.dex.imported) { el.append(needsImport()); return; }
  const idx = await speciesIndex();
  let stat = 'speed', target = 252, horde = 5, region = '';
  const out = h('div');
  const draw = () => {
    const cands = idx.filter((s) => s.ev && s.ev[stat] && (horde === 1 || s.horde5) && (!region || (s.regions || []).includes(region)))
      .sort((a, b) => (b.ev[stat] - a.ev[stat]) || a.id - b.id).slice(0, 40);
    mount(out, h('div', { class: 'stack' }, h('div', { class: 'small muted' }, `${cands.length ? 'Top' : 'No'} species yielding ${STATS.find((x) => x[0] === stat)[1]} EVs${horde === 5 ? ' that appear in ×5 hordes (dump)' : ''}${region ? ' in ' + cap(region) : ''}.`),
      h('table', { class: 'table compact' }, h('thead', null, h('tr', null, ['Pokémon', 'Yield', `EVs per ${horde === 5 ? 'horde' : 'battle'}`, `Battles for ${target}`, ''].map((c) => h('th', null, c)))),
        h('tbody', null, cands.map((s) => { const per = s.ev[stat] * horde; return h('tr', null, h('td', null, s.name, ' ', typeChips(s.types, true)), h('td', null, `+${s.ev[stat]}`),
          h('td', null, per), h('td', { style: { fontWeight: 700 } }, Math.ceil(target / per)),
          h('td', null, h('button', { class: 'btn small ghost', onclick: () => go(`#/pokedex/${s.id}?tab=locations`) }, 'Locations'))); }))),
      notice('info', 'Plain arithmetic from your dump’s EV yields. Power items, Macho Brace, Pokérus and any PokeMMO-specific modifiers are not applied. Horde availability comes from dump rows and may predate patches.')));
  };
  el.append(h('div', { class: 'stack' }, h('div', { class: 'card row wrap' },
    h('div', { class: 'field' }, h('label', null, 'Stat'), seg(STATS.map(([k, l]) => [k, l]), stat, (v) => { stat = v; draw(); })),
    h('div', { class: 'field', style: { width: '120px' } }, h('label', null, 'Target EVs'), h('input', { class: 'input', type: 'number', min: 1, max: 255, value: target, oninput: (e) => { target = Math.max(1, Number(e.target.value || 1)); draw(); } })),
    h('div', { class: 'field' }, h('label', null, 'Encounter'), seg([[5, 'Horde ×5'], [1, 'Single']], horde, (v) => { horde = v; draw(); })),
    h('div', { class: 'field' }, h('label', null, 'Region'), h('select', { class: 'input', onchange: (e) => { region = e.target.value; draw(); } }, h('option', { value: '' }, 'Any'),
      ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova'].map((r) => h('option', { value: r }, cap(r)))))), out));
  draw();
}

// ------------------------------------------------------------- team
async function renderTeam(el, route) {
  tc = tc || await get('/api/tools/typechart');
  const idx = await speciesIndex();
  const teams = (await get('/api/docs/team')).items;
  const want = route.query.get('team');
  let doc = teams.find((t) => t.id === want) || null;
  let slots = doc ? [...doc.data.slots] : [null, null, null, null, null, null];
  let name = doc ? doc.name : 'New team';
  const out = h('div');
  const save = async () => {
    const res = doc ? await api('PUT', `/api/docs/team/${doc.id}`, { name, data: { slots } }) : await post('/api/docs/team', { name, data: { slots } });
    doc = res; toast('Team saved'); go('#/tools/team?team=' + res.id);
  };
  const analyse = () => {
    const members = slots.map((id) => idx.find((s) => s.id === id)).filter(Boolean);
    if (!members.length) return h('div', { class: 'muted' }, 'Add Pokémon to see coverage.');
    const def = tc.types.map((a, i) => {
      const ms = members.map((m) => m.types.reduce((acc, d) => acc * tc.matrix[i][tc.types.indexOf(d)], 1));
      return { a, weak: ms.filter((m) => m > 1).length, resist: ms.filter((m) => m < 1 && m > 0).length, immune: ms.filter((m) => m === 0).length };
    });
    const stab = [...new Set(members.flatMap((m) => m.types))];
    const covered = tc.types.filter((d, j) => stab.some((a) => tc.matrix[tc.types.indexOf(a)][j] > 1));
    return h('div', { class: 'stack' },
      h('div', null, h('div', { class: 'label', style: { marginBottom: '6px' } }, 'Defensive overview (members weak / resistant / immune per attacking type)'),
        h('table', { class: 'table compact' }, h('thead', null, h('tr', null, ['Attacking', 'Weak', 'Resist', 'Immune'].map((c) => h('th', null, c)))),
          h('tbody', null, def.map((r) => h('tr', null, h('td', null, typeChip(r.a, true)), h('td', { style: { color: r.weak >= 3 ? '#e07b77' : null, fontWeight: r.weak >= 3 ? 700 : 400 } }, r.weak || '—'),
            h('td', null, r.resist || '—'), h('td', null, r.immune || '—')))))),
      h('div', null, h('div', { class: 'label', style: { marginBottom: '6px' } }, `Same-type (STAB) super-effective coverage: ${covered.length}/17`),
        h('div', { class: 'row wrap' }, tc.types.map((t) => h('span', { style: { opacity: covered.includes(t) ? 1 : 0.3 } }, typeChip(t, true))))),
      h('p', { class: 'tiny muted', style: { margin: 0 } }, 'Types only — abilities (e.g. Levitate), moves and items are not considered.'));
  };
  const slotEls = slots.map((id, i) => h('div', { class: 'card tight' }, speciesPicker({ label: `Slot ${i + 1}`, value: id, onChange: (sid) => { slots[i] = sid; mount(out, analyse()); } })));
  mount(el, h('div', { class: 'stack' },
    h('div', { class: 'card row wrap' }, h('div', { class: 'field grow' }, h('label', null, 'Team name'), h('input', { class: 'input', value: name, maxlength: 60, oninput: (e) => { name = e.target.value; } })),
      h('div', { class: 'field' }, h('label', null, 'Saved teams'), h('select', { class: 'input', onchange: (e) => go(e.target.value ? `#/tools/team?team=${e.target.value}` : '#/tools/team') },
        h('option', { value: '' }, '— New team —'), teams.map((t) => h('option', { value: t.id, selected: doc && t.id === doc.id ? 'selected' : null }, t.name)))),
      h('button', { class: 'btn primary', onclick: save }, 'Save team'),
      doc ? h('button', { class: 'btn danger', onclick: async () => { if (await confirmDialog('Delete team', `Delete “${doc.name}”?`, 'Delete', true)) { await api('DELETE', `/api/docs/team/${doc.id}`); go('#/tools/team'); } } }, 'Delete') : null),
    h('div', { class: 'team-slots' }, slotEls),
    h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, 'Coverage')), out)));
  mount(out, analyse());
}

function needsImport() {
  return h('div', { class: 'content-narrow stack' }, notice('info', h('strong', null, 'Needs your local PokeMMO data. '), 'This tool uses base stats, catch rates or EV yields from your own dump. Import it once in Settings › Data.'),
    h('div', null, h('button', { class: 'btn primary', onclick: () => go('#/settings/data') }, 'Open data import')));
}
