// Tools workspace (docs/design/07): grouped hub + individual tools.
import { h, mount, icon, get, post, api, state, badge, notice, typeChip, typeChips, cap, seg, toast, extLink, confirmDialog, on } from '../core.js';
import { go, popoutButton } from '../shell.js';
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
  page.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Tools'), h('div', { class: 'sub' }, 'Calculators and planners. Each tool says how far its numbers can be trusted.'))));
  const [plans, teams] = await Promise.all([get('/api/docs/breeding_plan'), get('/api/docs/team')]);
  const recent = [...plans.items.map((p) => ({ ...p, k: 'breeding' })), ...teams.items.map((t) => ({ ...t, k: 'team' }))]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 3);
  if (recent.length) {
    page.append(h('section', { class: 'card', style: { marginBottom: '16px' } }, h('div', { class: 'card-head' }, h('h2', null, 'Continue')),
      h('div', { class: 'grid-3' }, recent.map((d) => h('button', { class: 'tool-link', onclick: () => go(d.k === 'breeding' ? `#/tools/breeding?tab=plan&plan=${d.id}` : `#/tools/team?team=${d.id}`) },
        icon(d.k === 'breeding' ? 'egg' : 'team'), h('div', null, h('div', { class: 'tl-title' }, d.name), h('div', { class: 'small muted' }, d.k === 'breeding' ? 'Breeding plan' : 'Team')))))));
  }
  const group = (id, title, sub) => h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('div', null, h('h2', null, title), h('div', { class: 'small muted' }, sub))),
    h('div', { class: 'stack tight' }, Object.entries(TOOLS).filter(([, t]) => t.group === id).map(([k, t]) => h('button', {
      class: 'tool-link' + (t.status === 'UNAVAILABLE' ? ' disabled' : ''), onclick: () => go('#/tools/' + k) },
    icon(t.icon), h('div', { class: 'grow' }, h('div', { class: 'row' }, h('span', { class: 'tl-title' }, t.title), h('span', { class: 'grow' }), badge(...STATUS_BADGE[t.status])),
      h('div', { class: 'small muted' }, t.desc))))));
  page.append(h('div', { class: 'tool-groups' },
    group('battle', 'Battle & Stats', 'Matchups, natures and stats'),
    group('breeding', 'Breeding', 'Familiar Parent A | Offspring | Parent B workflow'),
    group('planning', 'Planning & Hunting', 'Teams, EV training and catching')),
  h('p', { class: 'small muted', style: { marginTop: '16px' } }, 'There is deliberately no encounter counter — PokeMMO has its own. Nothing here reads the game, automates input or fetches GTL prices.'));
}

// ------------------------------------------------------------ type chart
let tc = null;
export async function renderTypeChart(el, route, { compact = false } = {}) {
  tc = tc || await get('/api/tools/typechart');
  let defTypes = [];
  const out = h('div');
  const draw = () => {
    const matrix = h('table', { class: 'typechart', 'aria-label': 'Type effectiveness: attacking type in rows, defending type in columns' },
      h('thead', null, h('tr', null, h('th', { class: 'small muted' }, 'ATK ↓ DEF →'), tc.types.map((t, j) => h('th', { dataset: { col: j } },
        h('span', { class: 'tc' }, typeChip(t, true)))))),
      h('tbody', null, tc.types.map((a, i) => h('tr', null, h('th', { style: { textAlign: 'right' } }, typeChip(a, true)), tc.types.map((d, j) => {
        const m = tc.matrix[i][j];
        return h('td', { class: m === 2 ? 'x2' : m === 0.5 ? 'x05' : m === 0 ? 'x0' : '', title: `${cap(a)} → ${cap(d)}: ×${m}`, dataset: { col: j } }, m === 1 ? '' : m === 0.5 ? '½' : String(m));
      })))));
    matrix.addEventListener('mouseover', (e) => {
      const col = e.target.closest('[data-col]'); matrix.querySelectorAll('.hl').forEach((x) => x.classList.remove('hl'));
      if (col) matrix.querySelectorAll(`[data-col="${col.dataset.col}"]`).forEach((x) => x.classList.add('hl'));
    });
    const picker = h('div', { class: 'row wrap' }, tc.types.map((t) => h('button', { class: 'chip btnlike' + (defTypes.includes(t) ? ' active' : ''),
      'aria-pressed': String(defTypes.includes(t)), onclick: () => { defTypes = defTypes.includes(t) ? defTypes.filter((x) => x !== t) : [...defTypes, t].slice(-2); draw(); } }, typeChip(t, true))));
    const groups = { '4': [], '2': [], '0.5': [], '0.25': [], '0': [] };
    if (defTypes.length) tc.types.forEach((a, i) => {
      const m = defTypes.reduce((acc, d) => acc * tc.matrix[i][tc.types.indexOf(d)], 1);
      if (String(m) in groups) groups[String(m)].push(a);
    });
    const checker = h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, 'Defensive check'), h('span', { class: 'small muted' }, 'Pick one or two defending types')),
      picker, defTypes.length ? h('div', { class: 'stack tight', style: { marginTop: '12px' } },
        [['4', '×4 weak'], ['2', '×2 weak'], ['0.5', '½ resists'], ['0.25', '¼ resists'], ['0', 'Immune']].map(([k, l]) => groups[k].length ? h('div', { class: 'row wrap' },
          h('span', { class: 'mult m' + k.replace('.', '') }, l.split(' ')[0]), h('span', { class: 'small muted', style: { width: '70px' } }, l.split(' ').slice(1).join(' ')),
          groups[k].map((t) => typeChip(t, true))) : null)) : null);
    mount(out, h('div', { class: compact ? 'stack' : 'grid-2', style: compact ? null : { gridTemplateColumns: 'minmax(0,auto) minmax(280px,1fr)', alignItems: 'start' } },
      compact ? null : h('div', { class: 'card', style: { overflow: 'auto' } }, matrix), checker),
    h('p', { class: 'small muted' }, tc.note));
  };
  draw();
  el.append(out);
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
