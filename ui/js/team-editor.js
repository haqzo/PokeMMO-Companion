import { number, t as translateUI, uiLabel } from './i18n.js';
import { gameTerm, searchText, speciesLabel } from './game-locale.js';
// Team editor shared by Tools › Team builder and Guides. Teams are saved documents (kind "team") referenced by id,
// so a team linked to several guides is the same team everywhere. Only the Pokémon is needed; every other field
// is optional. Coverage uses types only (no abilities or items), from moves when moves are entered.
import { h, mount, get, post, api, toast, typeChip, cap, sizedSprite, pad3, confirmDialog, modal } from './core.js';
import { animatedIn, scaled } from './sprites.js';
import { speciesPicker, NATURES } from './components.js';

export const PURPOSES = [['', '—'], ['gym_rerun', 'Gym reruns'], ['elite_four', 'Elite Four'], ['pvp', 'PvP'], ['storyline', 'Storyline'], ['custom', 'Custom']];
const STATS = [['hp', 'HP'], ['atk', 'Atk'], ['def', 'Def'], ['spa', 'SpA'], ['spd', 'SpD'], ['spe', 'Spe']];
let cache = { tc: null, idx: null, moves: null };

async function deps() {
  const [tc, idx, mv] = await Promise.all([cache.tc || get('/api/tools/typechart'), cache.idx || get('/api/dex/species?run=none').then((r) => r.species),
    cache.moves || get('/api/dex/moves').then((r) => r.moves).catch(() => [])]);
  Object.assign(cache, { tc, idx, moves: mv });
  return cache;
}

/** Old teams stored a bare species id per slot; newer ones store an object. Both are read here. */
export function normSlot(s) { if (s == null || s === '') return null; if (typeof s === 'number') return { species: s }; return s.species ? { ...s } : null; }
export function normTeam(data) {
  const slots = [...((data && data.slots) || [])].slice(0, 6).map(normSlot);
  while (slots.length < 6) slots.push(null);
  return { version: 2, purpose: (data && data.purpose) || '', notes: (data && data.notes) || '', slots };
}
export const purposeLabel = (p) => uiLabel((PURPOSES.find((x) => x[0] === p) || ['', ''])[1]);

/** A compact read-only strip of the team's sprites. */
export async function teamStrip(team) {
  const { idx } = await deps();
  const t = normTeam(team.data);
  return h('div', { class: 'team-strip' }, t.slots.map((s) => {
    const sp = s && idx.find((x) => x.id === s.species);
    return h('div', { class: 'team-strip-slot' + (sp ? '' : ' vacant'), title: sp ? speciesLabel(sp.id, sp.name) + (s.level ? translateUI('ui.team_level_short', { level: number(s.level) }) : '') : translateUI('ui.team_empty_slot') },
      sp ? sizedSprite(sp, scaled('team', 40), { still: sp.still, url: sp.icon, tier: sp.size || 'm', ani: animatedIn('team') ? sp.ani : null }) : null);
  }));
}

export function analyseTeam(t, { tc, idx, moves }) {
  const members = t.slots.filter(Boolean).map((s) => ({ s, sp: idx.find((x) => x.id === s.species) })).filter((m) => m.sp);
  if (!members.length) return h('div', { class: 'muted' }, translateUI('ui.team_empty_coverage'));
  const def = tc.types.map((a, i) => {
    const ms = members.map((m) => m.sp.types.reduce((acc, d) => acc * tc.matrix[i][tc.types.indexOf(d)], 1));
    return { a, weak: ms.filter((m) => m > 1).length, resist: ms.filter((m) => m < 1 && m > 0).length, immune: ms.filter((m) => m === 0).length };
  });
  // offensive: damaging moves the player entered; members without moves count with their own types (STAB)
  const byName = Object.fromEntries((moves || []).map((m) => [m.name.toLowerCase(), m]));
  let fromMoves = 0;
  const attackTypes = new Set();
  for (const m of members) {
    const dmg = (m.s.moves || []).map((n) => byName[n.toLowerCase()]).filter((x) => x && x.category !== 'Status' && x.type);
    if (dmg.length) { fromMoves++; dmg.forEach((x) => attackTypes.add(x.type)); } else m.sp.types.forEach((x) => attackTypes.add(x));
  }
  const covered = tc.types.filter((d, j) => [...attackTypes].some((a) => tc.types.includes(a) && tc.matrix[tc.types.indexOf(a)][j] > 1));
  return h('div', { class: 'stack' },
    h('div', null, h('div', { class: 'label', style: { marginBottom: '6px' } }, translateUI('ui.team_defense')),
      h('table', { class: 'table compact' }, h('thead', null, h('tr', null, [translateUI('ui.attacking'), translateUI('ui.weak'), translateUI('ui.resist'), translateUI('ui.immune')].map((c) => h('th', null, c)))),
        h('tbody', null, def.map((r) => h('tr', null, h('td', null, typeChip(r.a, true)), h('td', { style: { color: r.weak >= 3 ? '#e07b77' : null, fontWeight: r.weak >= 3 ? 700 : 400 } }, r.weak || '—'),
          h('td', null, r.resist || '—'), h('td', null, r.immune || '—')))))),
    h('div', null, h('div', { class: 'label', style: { marginBottom: '6px' } }, translateUI('ui.team_effectiveness', { covered: number(covered.length), total: number(tc.types.length) })),
      h('div', { class: 'tiny muted', style: { marginBottom: '4px' } }, fromMoves ? translateUI('ui.team_move_coverage', { count: number(fromMoves) }) + (fromMoves < members.length ? translateUI('ui.team_own_types_note') : '.') : translateUI('ui.team_coverage_by_types')),
      h('div', { class: 'row wrap' }, tc.types.map((x) => h('span', { style: { opacity: covered.includes(x) ? 1 : 0.3 } }, typeChip(x, true))))),
    h('p', { class: 'tiny muted', style: { margin: 0 } }, translateUI('ui.team_scope')));
}

/**
 * Editable team. `doc` = saved team document or null for a new team.
 * Returns an element; `onSaved(doc)` is called after every save.
 */
export async function teamEditor(doc, { onSaved, onDeleted, compact = false } = {}) {
  const d = await deps();
  const t = normTeam(doc ? doc.data : null);
  let name = doc ? doc.name : translateUI('ui.team_new_team');
  const out = h('div');
  const moveAliases = new Map(d.moves.map((m) => [searchText(gameTerm('move', m.name)), m.name]));
  const moveDl = h('datalist', { id: 'team-moves-dl' }, d.moves.map((m) => h('option', { value: gameTerm('move', m.name) })));
  const redraw = () => mount(out, analyseTeam(t, d));
  const save = async () => {
    try {
      const body = { name, data: t };
      const res = doc ? await api('PUT', `/api/docs/team/${doc.id}`, body) : await post('/api/docs/team', body);
      doc = res; toast(translateUI('ui.team_saved'));
      onSaved && onSaved(res);
    } catch (e) { toast(e.message, { kind: 'warn' }); }
  };
  const slotEl = (i) => {
    const box = h('div', { class: 'card tight team-slot' });
    const draw = () => {
      const s = t.slots[i];
      const details = h('details', { class: 'team-slot-details' }, h('summary', { class: 'small' }, translateUI('ui.details_optional')));
      if (s) {
        const field = (label, el) => h('label', { class: 'field' }, h('span', { class: 'label' }, label), el);
        const txt = (k, n, ph, list) => h('input', { class: 'input', value: s[k] || '', maxlength: n, placeholder: ph || '', list: list || null, oninput: (e) => { s[k] = e.target.value; } });
        const num = (obj, k, hi) => h('input', { class: 'input tm-num', type: 'number', min: '0', max: String(hi), value: (s[obj] || {})[k] ?? '', 'aria-label': translateUI('toolui.stat_input', { stat: translateUI('boxui.stat_' + STATS.find(([key]) => key === k)[1].toLowerCase()), kind: translateUI(obj === 'ivs' ? 'ui.team_ivs' : 'ui.team_evs') }),
          oninput: (e) => { s[obj] = { ...(s[obj] || {}) }; if (e.target.value === '') delete s[obj][k]; else s[obj][k] = Number(e.target.value); } });
        const moves = [0, 1, 2, 3].map((m) => h('input', { class: 'input', list: 'team-moves-dl', value: gameTerm('move', (s.moves || [])[m]) || '', placeholder: translateUI('ui.team_move', { count: number(m + 1) }), maxlength: 40,
          oninput: (e) => { const mv = [...(s.moves || [])]; mv[m] = moveAliases.get(searchText(e.target.value)) || e.target.value; s.moves = mv.filter((x, k) => x || k < 4); redraw(); } }));
        details.append(h('div', { class: 'team-slot-grid' },
          field(uiLabel('Form'), txt('form', 40, translateUI('ui.team_form_example'))), field(uiLabel('Level'), h('input', { class: 'input', type: 'number', min: '1', max: '100', value: s.level ?? '', oninput: (e) => { s.level = e.target.value === '' ? undefined : Number(e.target.value); } })),
          field(uiLabel('Nature'), h('select', { class: 'input', onchange: (e) => { s.nature = e.target.value || undefined; } }, h('option', { value: '' }, '—'), NATURES.map((n) => h('option', { value: n, selected: s.nature === n ? 'selected' : null }, gameTerm('nature', n))))),
          field(uiLabel('Ability'), txt('ability', 40)), field(uiLabel('Held item'), txt('item', 60))),
        h('div', { class: 'team-moves' }, moves),
        h('div', { class: 'team-stats' }, h('span', { class: 'label' }, translateUI('ui.team_ivs')), STATS.map(([k, l]) => h('label', { class: 'tiny' }, translateUI('boxui.stat_' + l.toLowerCase()), num('ivs', k, 31)))),
        h('div', { class: 'team-stats' }, h('span', { class: 'label' }, translateUI('ui.team_evs')), STATS.map(([k, l]) => h('label', { class: 'tiny' }, translateUI('boxui.stat_' + l.toLowerCase()), num('evs', k, 252)))),
        field(uiLabel('Notes'), h('textarea', { class: 'input', rows: '2', maxlength: '1000', oninput: (e) => { s.notes = e.target.value; } }, s.notes || '')));
      }
      mount(box, speciesPicker({ label: translateUI('ui.team_slot', { count: number(i + 1) }), value: s ? s.species : null, onChange: (sid) => {
        t.slots[i] = sid ? { ...(t.slots[i] && t.slots[i].species === sid ? t.slots[i] : {}), species: sid } : null; draw(); redraw(); } }), s ? details : null);
    };
    draw();
    return box;
  };
  const el = h('div', { class: 'stack team-editor' + (compact ? ' compact' : '') },
    h('div', { class: 'card row wrap' },
      h('div', { class: 'field grow' }, h('label', null, translateUI('ui.team_name')), h('input', { class: 'input', value: name, maxlength: 60, oninput: (e) => { name = e.target.value; } })),
      h('div', { class: 'field' }, h('label', null, translateUI('ui.team_purpose')), h('select', { class: 'input', onchange: (e) => { t.purpose = e.target.value; } },
        PURPOSES.map(([v, l]) => h('option', { value: v, selected: t.purpose === v ? 'selected' : null }, uiLabel(l))))),
      h('button', { class: 'btn primary', onclick: save }, translateUI('ui.team_save')),
      doc && onDeleted ? h('button', { class: 'btn danger', onclick: async () => {
        const used = (await get(`/api/teams/${doc.id}/guides`)).guides.length;
        if (await confirmDialog(translateUI('ui.team_delete'), translateUI('ui.team_delete_prompt', { label: doc.name }) + (used ? translateUI('ui.team_delete_guide', { count: number(used) }) : ''), translateUI('ui.delete'), true)) {
          await api('DELETE', `/api/docs/team/${doc.id}`); onDeleted(); } } }, translateUI('ui.delete')) : null),
    moveDl,
    h('div', { class: 'team-slots' }, [0, 1, 2, 3, 4, 5].map(slotEl)),
    h('div', { class: 'card' }, h('label', { class: 'label' }, translateUI('ui.team_notes')), h('textarea', { class: 'input', rows: '2', maxlength: '4000', oninput: (e) => { t.notes = e.target.value; } }, t.notes)),
    h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, translateUI('ui.team_coverage'))), out));
  redraw();
  return el;
}

/** Edit a team in a dialog (used from guides). Resolves with the saved doc or null. */
export async function editTeamDialog(doc) {
  let saved = null;
  const body = await teamEditor(doc, { onSaved: (d) => { saved = d; }, compact: true });
  await modal({ title: doc ? translateUI('ui.team_edit', { label: doc.name }) : translateUI('ui.team_new_team'), wide: true, body, actions: [{ label: translateUI('ui.close'), value: true, kind: 'ghost' }] });
  return saved;
}

export { cap, pad3 };
