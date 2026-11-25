import { t as translateUI, uiLabel } from '../i18n.js';
import { formLabel, gameTerm, matchesTerm, searchText, speciesLabel, speciesMatches } from '../game-locale.js';
// Type Matchups › Compare two Pokémon (2026-11-24). Main Type Matchups page only — never in the popout.
// Shows how each side's types and learnable moves fare against the other, from the 17-type chart (no Fairy) and
// the real learnsets. Not a battle simulator: no damage numbers, no winner, no speed or stat maths.
import { h, mount, get, typeChip, typeChips, cap, sizedSprite, debounce } from '../core.js';
import { go } from '../shell.js';
import { loadList } from './pokedex.js';
import { animatedIn, scaled } from '../sprites.js';

const METHOD = { level: 'Level', TUTOR: 'Tutor', 'TM??': 'TM/HM', 'EGG & ITEM': 'Egg', EVOLVE: 'Evolution', SPECIAL: 'Special' };
const methodLabel = (m) => (m.method === 'level' ? `Lv ${m.level}` : METHOD[m.method] || cap(String(m.method || '').toLowerCase()));
// Abilities that change what a type multiplier means. Named, never applied: the chart stays the chart.
const ABILITY_NOTES = {
  Levitate: 'ui.b272_cmp_levitate', 'Wonder Guard': 'ui.b272_cmp_wonder', 'Flash Fire': 'ui.b272_cmp_flash',
  'Volt Absorb': 'ui.b272_cmp_volt', 'Water Absorb': 'ui.b272_cmp_water', 'Lightning Rod': 'ui.b272_cmp_rod',
  'Motor Drive': 'ui.b272_cmp_motor', 'Storm Drain': 'ui.b272_cmp_drain', 'Dry Skin': 'ui.b272_cmp_skin',
  'Thick Fat': 'ui.b272_cmp_fat', Heatproof: 'ui.b272_cmp_heat', Filter: 'ui.b272_cmp_filter',
  'Solid Rock': 'ui.b272_cmp_filter', 'Sap Sipper': 'ui.b272_cmp_sap',
};
const MAX_PICKS = 4;
const mult = (s) => (s === 0.5 ? '½×' : s === 0.25 ? '¼×' : `${s}×`);
const multCls = (m) => ({ 4: 'm4', 2: 'm2', 1: 'm1', 0.5: 'm05', 0.25: 'm025', 0: 'm0' })[m] || 'm1';

// kept while the app runs, so coming back to Type matchups shows the same comparison
const memo = { sides: [null, null], filters: [{}, {}], sort: ['vs', 'vs'], picks: [[], []] };

function compareSpecies(entry) {
  const name = speciesLabel(entry.id, entry.name);
  return entry.form_name && name !== entry.name ? `${name} · ${formLabel(entry.id, entry.form_name)}` : name;
}

export async function comparePanel(tc, { movesSlot = null } = {}) {
  const T = (tc.types || []).map((t) => String(t).toLowerCase());
  const norm = (t) => (t == null ? null : String(t).toLowerCase());
  /** Chart multiplier, or null when a type is missing or not one of the 17 PokeMMO types (e.g. a move whose
   *  details are still awaiting verification). Never guesses, never throws. */
  const eff = (atk, defTypes) => {
    const i = T.indexOf(norm(atk));
    const row = i >= 0 && Array.isArray(tc.matrix) ? tc.matrix[i] : null;
    if (!row || !Array.isArray(defTypes) || !defTypes.length) return null;
    let acc = 1;
    for (const d of defTypes) {
      const v = row[T.indexOf(norm(d))];
      if (typeof v !== 'number') return null;
      acc *= v;
    }
    return acc;
  };
  const known = (t) => T.includes(norm(t));
  const chip = (t) => (known(t) ? typeChip(norm(t), true) : h('span', { class: 'chip tiny', title: translateUI('ui.b272_cmp_type_unknown') }, '?'));
  const list = await loadList().catch(() => []);
  const options = [];
  for (const s of list) options.push({ key: String(s.id), id: s.id, name: s.name, types: s.types, still: s.still, abilities: s.abilities || [] });
  // battle forms only (cosmetic forms share the base Pokémon's types and moves)
  const forms = (await get('/api/dex/species?run=none').catch(() => ({ forms: [] }))).forms || [];
  for (const f of forms) if (f.kind !== 'cosmetic') options.push({ key: f.key, id: f.id, form: f.form_key, name: f.name, types: f.types, abilities: f.abilities || [], form_name: f.form_name });

  const box = h('aside', { class: 'card compare-panel', 'aria-labelledby': 'cmp-h' });
  const draw = () => mount(box,
    h('div', { class: 'card-head' }, h('h2', { id: 'cmp-h' }, translateUI('ui.b272_cmp_heading')),
      h('div', { class: 'right row tight' }, h('button', { class: 'btn ghost small', title: translateUI('ui.b272_cmp_swap'), 'aria-label': translateUI('ui.b272_cmp_swap'), disabled: !memo.sides[0] && !memo.sides[1] ? 'disabled' : null,
        onclick: () => { memo.sides.reverse(); memo.filters.reverse(); memo.sort.reverse(); memo.picks.reverse(); drawAll(); } }, translateUI('ui.b272_cmp_swap_btn')))),
    h('p', { class: 'tiny muted', style: { margin: '0 0 8px' } }, translateUI('ui.b272_cmp_scope')),
    h('div', { class: 'cmp-sides' }, [0, 1].map((i) => sideHead(i))),
    memo.sides[0] && memo.sides[1] ? matchup() : h('div', { class: 'empty small' }, translateUI('ui.b272_cmp_pick_both')),
    movesSlot ? null : movesRow());
  // The two move tables need width: on the main page they get their own full-width row under the chart and
  // this panel (side by side when wide, stacked when narrow) instead of scrolling sideways inside the panel.
  const movesRow = () => (memo.sides[0] && memo.sides[1] ? h('div', { class: 'cmp-moves-row' }, [0, 1].map((i) => movesBlock(i))) : null);
  const drawAll = () => { draw(); if (movesSlot) mount(movesSlot, movesRow()); };

  // ---------------------------------------------------------------- picking
  const sideHead = (i) => {
    const s = memo.sides[i];
    if (!s) return h('div', { class: 'cmp-side empty-side' }, picker(i));
    const notes = (s.abilities || []).filter((a) => ABILITY_NOTES[a]);
    return h('div', { class: 'cmp-side', dataset: { side: i } },
      h('div', { class: 'row tight' }, sizedSprite(s, scaled('compare', 96), { url: s.art_still, tier: 's', ani: animatedIn('compare') ? s.art_ani : null }),
        h('div', { class: 'grow', style: { minWidth: 0 } }, h('div', { class: 'cmp-name' }, compareSpecies(s)), typeChips(s.types, true),
          h('div', { class: 'tiny muted' }, (s.abilities || []).map(a => gameTerm('ability', a)).join(' · ') || translateUI('ui.b272_cmp_ability_unknown')))),
      notes.length ? h('div', { class: 'tiny warn-text' }, notes.map((a) => `${gameTerm('ability', a)}: ${translateUI(ABILITY_NOTES[a])}`).join(' · ')) : null,
      h('div', { class: 'row tight' },
        h('button', { class: 'btn ghost small', onclick: () => go('#/pokedex/' + s.id + (s.form ? '/' + s.form : '')) }, translateUI('ui.summary')),
        h('button', { class: 'btn ghost small', 'aria-label': translateUI('ui.b272_cmp_clear', { name: compareSpecies(s) }), onclick: () => { memo.sides[i] = null; memo.picks[i] = []; drawAll(); } }, translateUI('ui.clear'))));
  };
  const picker = (i) => {
    const input = h('input', { class: 'input', type: 'search', placeholder: i === 0 ? translateUI('ui.b272_cmp_first') : translateUI('ui.b272_cmp_second'), 'aria-label': translateUI('ui.b272_cmp_pokemon_index', { index: i + 1 }), autocomplete: 'off' });
    const results = h('div', { class: 'cmp-results', role: 'listbox' });
    const show = () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { mount(results); return; }
      const num = /^\d+$/.test(q) ? Number(q) : null;
      const hits = options.filter((o) => (num ? o.id === num : speciesMatches(o, q) || searchText(formLabel(o.id, o.form_name)).includes(searchText(q)))).slice(0, 8);
      mount(results, hits.length ? hits.map((o) => h('button', { class: 'cmp-hit', role: 'option', onclick: () => choose(i, o) },
        h('span', null, compareSpecies(o)), typeChips(o.types, true))) : h('div', { class: 'tiny muted', style: { padding: '4px' } }, translateUI('ui.no_match')));
    };
    input.addEventListener('input', debounce(show, 80));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const f = results.querySelector('.cmp-hit'); f && f.click(); } });
    return h('div', { class: 'stack tight' }, input, results);
  };
  const choose = async (i, o) => {
    const d = await get(`/api/dex/species/${o.id}?run=none${o.form ? '&form=' + encodeURIComponent(o.form) : ''}`);
    const f = o.form && d.form ? d.form : null;
    memo.sides[i] = { id: o.id, form: o.form || null, form_name: f?.form_name, name: f ? f.name : d.name, types: f ? f.types : d.types,
      abilities: f ? f.abilities : (d.abilities || []).map((a) => a.name), art_still: (f ? f.art && f.art.static : d.art && d.art.static) || o.still?.url || null,
      art_ani: (f ? f.art && f.art.ani : d.art && d.art.ani) || null,
      moves: d.moves || [], formMovesShared: !!f };
    memo.picks[i] = [];
    drawAll();
  };

  // ---------------------------------------------------------------- types both ways
  const matchup = () => {
    const [a, b] = memo.sides;
    const row = (att, def) => h('div', { class: 'cmp-dir' }, h('div', { class: 'small' }, h('strong', null, compareSpecies(att)), translateUI('ui.b272_cmp_attacking'), h('strong', null, compareSpecies(def)), h('span', { class: 'tiny muted' }, translateUI('ui.b272_cmp_stab_types'))),
      h('div', { class: 'row wrap tight' }, att.types.map((t) => { const m = eff(t, def.types); return h('span', { class: 'row tight cmp-eff' }, chip(t), m == null ? h('span', { class: 'tiny muted', title: translateUI('ui.b272_cmp_type_missing') }, 'unknown') : h('span', { class: 'mult ' + multCls(m) }, mult(m))); })));
    const weak = (s) => T.map((t) => [t, eff(t, s.types)]).filter(([, m]) => m != null && m >= 2);
    return h('div', { class: 'stack tight cmp-matchup' }, row(a, b), row(b, a),
      h('div', { class: 'tiny muted' }, [a, b].map(s => translateUI('ui.b272_cmp_weak_to', { name: compareSpecies(s), types: weak(s).map(([t, m]) => `${gameTerm('type', cap(t))} ${mult(m)}`).join(', ') || translateUI('ui.b272_cmp_nothing') })).join(' · ')));
  };

  // ---------------------------------------------------------------- moves
  const movesBlock = (i) => {
    const me = memo.sides[i], foe = memo.sides[1 - i], f = memo.filters[i];
    const seen = new Map();
    for (const m of me.moves) {           // one row per move; keep the earliest level-up / first method
      const prev = seen.get(m.id);
      if (!prev) seen.set(m.id, { ...m, methods: [methodLabel(m)] });
      else if (!prev.methods.includes(methodLabel(m))) prev.methods.push(methodLabel(m));
    }
    // A move without confirmed details (e.g. Snowscape in the current data: no type, category or power) is listed
    // as "awaiting verification" — no effectiveness or STAB is invented for it.
    const myTypes = (me.types || []).map(norm);
    const rows = [...seen.values()].map((m) => {
      const type = norm(m.type), unverified = !known(type) || !m.category;
      return { ...m, type, unverified, vs: unverified || m.category === 'Status' ? null : eff(type, foe.types), stab: !unverified && m.category !== 'Status' && myTypes.includes(type) };
    });
    const shown = rows.filter((m) => (!f.type || m.type === f.type) && (!f.cat || m.category === f.cat) && (!f.method || m.methods.some((x) => x.startsWith(f.method)))
      && (!f.q || matchesTerm('move', m.name, f.q)) && (!f.hitting || (m.vs != null && m.vs >= 2)));
    const key = memo.sort[i];
    const cmp = { vs: (x, y) => (y.vs ?? -1) - (x.vs ?? -1) || (y.power || 0) - (x.power || 0), power: (x, y) => (y.power || 0) - (x.power || 0), name: (x, y) => String(x.name).localeCompare(String(y.name)),
      type: (x, y) => (x.type || '~').localeCompare(y.type || '~') || x.name.localeCompare(y.name), acc: (x, y) => (y.accuracy || 0) - (x.accuracy || 0), pp: (x, y) => (y.pp || 0) - (x.pp || 0) }[key];
    shown.sort(cmp);
    const picks = memo.picks[i];
    const setF = (k, v) => { memo.filters[i] = { ...f, [k]: v || undefined }; drawAll(); };
    const th = (k, label, extra = '') => h('th', { class: 'sortable ' + extra + (key === k ? ' sorted' : ''), tabindex: '0', 'aria-sort': key === k ? 'descending' : 'none',
      onclick: () => { memo.sort[i] = k; drawAll(); }, onkeydown: (e) => { if (e.key === 'Enter') { memo.sort[i] = k; drawAll(); } } }, label);
    const chosen = picks.map((id) => rows.find((m) => m.id === id)).filter(Boolean);
    return h('section', { class: 'cmp-moves', dataset: { side: i } },
      h('h3', null, translateUI('ui.b272_cmp_moves_against', { name: compareSpecies(me), foe: compareSpecies(foe) })),
      me.formMovesShared ? h('div', { class: 'tiny muted' }, translateUI('ui.b272_cmp_form_moves')) : null,
      chosen.length ? h('div', { class: 'cmp-chosen' }, h('div', { class: 'tiny muted' }, translateUI('ui.b272_cmp_chosen', { count: chosen.length, max: MAX_PICKS })),
        h('div', { class: 'row wrap tight' }, chosen.map((m) => h('span', { class: 'chip' }, chip(m.type), ' ', gameTerm('move', m.name), ' ',
          m.vs == null ? h('span', { class: 'tiny muted' }, m.unverified ? translateUI('ui.b272_cmp_wait') : 'status') : h('span', { class: 'mult ' + multCls(m.vs) }, mult(m.vs)), m.stab ? h('span', { class: 'tiny', title: translateUI('ui.b272_cmp_stab') }, ' STAB') : null)))) : null,
      h('div', { class: 'row wrap tight cmp-filters' },
        h('input', { class: 'input', type: 'search', placeholder: translateUI('ui.move_prompt'), value: f.q || '', style: { width: '120px' }, 'aria-label': translateUI('ui.move_search'),
          onchange: (e) => setF('q', e.target.value.trim().toLowerCase()) }),
        h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': translateUI('ui.b272_cmp_move_type'), onchange: (e) => setF('type', e.target.value) },
          h('option', { value: '' }, translateUI('ui.all_types')), T.map((t) => h('option', { value: t, selected: f.type === t ? 'selected' : null }, gameTerm('type', cap(t))))),
        h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': translateUI('ui.category'), onchange: (e) => setF('cat', e.target.value) },
          [['', translateUI('ui.all_categories')], ['Physical', gameTerm('category_move', 'Physical')], ['Special', gameTerm('category_move', 'Special')], ['Status', gameTerm('category_move', 'Status')]].map(([v, l]) => h('option', { value: v, selected: (f.cat || '') === v ? 'selected' : null }, l))),
        h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': translateUI('ui.b272_cmp_method'), onchange: (e) => setF('method', e.target.value) },
          [['', translateUI('ui.b272_cmp_any_method')], ['Lv', translateUI('ui.level')], ['TM/HM', translateUI('ui.b272_cmp_method_tmhm')], ['Tutor', translateUI('ui.b272_cmp_method_tutor')], ['Egg', translateUI('ui.b272_cmp_method_egg')], ['Evolution', translateUI('ui.b272_cmp_method_evolution')], ['Special', translateUI('ui.b272_cmp_method_special')]].map(([v, l]) => h('option', { value: v, selected: (f.method || '') === v ? 'selected' : null }, l))),
        h('label', { class: 'row tight small' }, h('input', { type: 'checkbox', class: 'check', checked: !!f.hitting, onchange: (e) => setF('hitting', e.target.checked) }), translateUI('ui.b272_cmp_super'))),
      h('div', { class: 'cmp-table-wrap' }, h('table', { class: 'table cmp-table' },
        h('colgroup', null, ['c-pick', 'c-move', 'c-type', 'c-vs', 'c-num', 'c-num', 'c-num', 'c-cat', 'c-how'].map((c) => h('col', { class: c }))),
        h('thead', null, h('tr', null, h('th', null, h('span', { class: 'sr-only' }, translateUI('ui.b272_cmp_choose'))), th('name', translateUI('ui.move')), th('type', translateUI('ui.type')), th('vs', 'vs ' + compareSpecies(foe), 'num'),
          th('power', translateUI('ui.power'), 'num'), th('acc', 'Acc.', 'num'), th('pp', 'PP', 'num'), h('th', null, translateUI('ui.category')), h('th', null, translateUI('ui.b272_cmp_learned')))),
        h('tbody', null, shown.map((m) => {
          const on = picks.includes(m.id);
          return h('tr', { class: on ? 'picked' : null },
            h('td', null, h('input', { type: 'checkbox', class: 'check', checked: on, disabled: !on && picks.length >= MAX_PICKS ? 'disabled' : null, 'aria-label': translateUI('ui.b272_cmp_choose_move', { move: gameTerm('move', m.name) }),
              onchange: (e) => { memo.picks[i] = e.target.checked ? [...picks, m.id].slice(0, MAX_PICKS) : picks.filter((x) => x !== m.id); drawAll(); } })),
            h('td', { class: 'mv-name', title: m.name }, gameTerm('move', m.name), m.unverified ? h('span', { class: 'tiny muted', title: translateUI('ui.b272_cmp_move_missing') }, translateUI('ui.b272_cmp_wait_suffix')) : null, m.stab ? h('span', { class: 'tiny muted', title: translateUI('ui.b272_cmp_stab') }, ' STAB') : null),
            h('td', null, chip(m.type)),
            h('td', { class: 'num' }, m.vs == null ? h('span', { class: 'tiny muted', title: m.unverified ? translateUI('ui.b272_cmp_no_eff') : translateUI('ui.b272_cmp_status_move') }, m.unverified ? '?' : '—') : h('span', { class: 'mult ' + multCls(m.vs) }, mult(m.vs))),
            h('td', { class: 'num' }, m.power === 1 ? h('span', { class: 'muted', title: translateUI('ui.b272_cmp_variable') }, 'var.') : m.power || '—'),
            h('td', { class: 'num' }, m.accuracy > 100 ? h('span', { class: 'muted', title: translateUI('ui.b272_cmp_never_miss') }, '—') : m.accuracy ? m.accuracy + '%' : '—'),
            h('td', { class: 'num' }, m.pp ?? '—'),
            h('td', { class: 'small', title: m.unverified ? translateUI('ui.b272_cmp_details_wait') : m.category }, m.unverified && !m.category ? '?' : gameTerm('category_move', m.category)),
            h('td', { class: 'small muted mv-how' }, m.methods.map(method => method.startsWith('Lv ') ? translateUI('ui.b272_cmp_method_display', { level: method.slice(3) }) : uiLabel(method)).join(', ')));
        })))),
      h('div', { class: 'tiny muted' }, translateUI('ui.b272_cmp_count', { shown: shown.length, total: rows.length })));
  };

  drawAll();
  return box;
}
