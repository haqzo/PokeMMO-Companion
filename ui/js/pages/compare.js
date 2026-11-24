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
  Levitate: 'Ground moves do not hit it', 'Wonder Guard': 'only super-effective moves hit it', 'Flash Fire': 'Fire moves power it up instead',
  'Volt Absorb': 'Electric moves heal it', 'Water Absorb': 'Water moves heal it', 'Lightning Rod': 'draws Electric moves',
  'Motor Drive': 'Electric moves raise its Speed', 'Storm Drain': 'draws Water moves', 'Dry Skin': 'Water heals it, Fire hurts more',
  'Thick Fat': 'Fire and Ice hurt it less', Heatproof: 'Fire hurts it less', Filter: 'super-effective hits hurt it less',
  'Solid Rock': 'super-effective hits hurt it less', 'Sap Sipper': 'Grass moves raise its Attack',
};
const MAX_PICKS = 4;
const mult = (s) => (s === 0.5 ? '½×' : s === 0.25 ? '¼×' : `${s}×`);
const multCls = (m) => ({ 4: 'm4', 2: 'm2', 1: 'm1', 0.5: 'm05', 0.25: 'm025', 0: 'm0' })[m] || 'm1';

// kept while the app runs, so coming back to Type matchups shows the same comparison
const memo = { sides: [null, null], filters: [{}, {}], sort: ['vs', 'vs'], picks: [[], []] };

export async function comparePanel(tc) {
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
  const chip = (t) => (known(t) ? typeChip(norm(t), true) : h('span', { class: 'chip tiny', title: 'Type not confirmed in the PokeMMO data' }, '?'));
  const list = await loadList().catch(() => []);
  const options = [];
  for (const s of list) options.push({ key: String(s.id), id: s.id, name: s.name, types: s.types, still: s.still, abilities: s.abilities || [] });
  // battle forms only (cosmetic forms share the base Pokémon's types and moves)
  const forms = (await get('/api/dex/species?run=none').catch(() => ({ forms: [] }))).forms || [];
  for (const f of forms) if (f.kind !== 'cosmetic') options.push({ key: f.key, id: f.id, form: f.form_key, name: f.name, types: f.types, abilities: f.abilities || [], form_name: f.form_name });

  const box = h('aside', { class: 'card compare-panel', 'aria-labelledby': 'cmp-h' });
  const draw = () => mount(box,
    h('div', { class: 'card-head' }, h('h2', { id: 'cmp-h' }, 'Compare two Pokémon'),
      h('div', { class: 'right row tight' }, h('button', { class: 'btn ghost small', title: 'Swap sides', 'aria-label': 'Swap sides', disabled: !memo.sides[0] && !memo.sides[1] ? 'disabled' : null,
        onclick: () => { memo.sides.reverse(); memo.filters.reverse(); memo.sort.reverse(); memo.picks.reverse(); draw(); } }, '⇄ Swap'))),
    h('p', { class: 'tiny muted', style: { margin: '0 0 8px' } }, 'Type effectiveness and learnable moves only — not a battle simulator: no damage, speed or winner.'),
    h('div', { class: 'cmp-sides' }, [0, 1].map((i) => sideHead(i))),
    memo.sides[0] && memo.sides[1] ? matchup() : h('div', { class: 'empty small' }, 'Pick a Pokémon on each side to compare them.'),
    [0, 1].map((i) => memo.sides[i] && memo.sides[1 - i] ? movesBlock(i) : null));

  // ---------------------------------------------------------------- picking
  const sideHead = (i) => {
    const s = memo.sides[i];
    if (!s) return h('div', { class: 'cmp-side empty-side' }, picker(i));
    const notes = (s.abilities || []).filter((a) => ABILITY_NOTES[a]);
    return h('div', { class: 'cmp-side', dataset: { side: i } },
      h('div', { class: 'row tight' }, sizedSprite(s, scaled('compare', 56), { url: s.art_still, tier: 's', ani: animatedIn('compare') ? s.art_ani : null }),
        h('div', { class: 'grow', style: { minWidth: 0 } }, h('div', { class: 'cmp-name' }, s.name), typeChips(s.types, true),
          h('div', { class: 'tiny muted' }, (s.abilities || []).join(' · ') || 'Abilities unknown'))),
      notes.length ? h('div', { class: 'tiny warn-text' }, notes.map((a) => `${a}: ${ABILITY_NOTES[a]}`).join(' · ')) : null,
      h('div', { class: 'row tight' },
        h('button', { class: 'btn ghost small', onclick: () => go('#/pokedex/' + s.id + (s.form ? '/' + s.form : '')) }, 'Summary'),
        h('button', { class: 'btn ghost small', 'aria-label': `Clear ${s.name}`, onclick: () => { memo.sides[i] = null; memo.picks[i] = []; draw(); } }, 'Clear')));
  };
  const picker = (i) => {
    const input = h('input', { class: 'input', type: 'search', placeholder: i === 0 ? 'First Pokémon…' : 'Second Pokémon…', 'aria-label': `Pokémon ${i + 1}`, autocomplete: 'off' });
    const results = h('div', { class: 'cmp-results', role: 'listbox' });
    const show = () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { mount(results); return; }
      const num = /^\d+$/.test(q) ? Number(q) : null;
      const hits = options.filter((o) => (num ? o.id === num : o.name.toLowerCase().includes(q))).slice(0, 8);
      mount(results, hits.length ? hits.map((o) => h('button', { class: 'cmp-hit', role: 'option', onclick: () => choose(i, o) },
        h('span', null, o.name), typeChips(o.types, true))) : h('div', { class: 'tiny muted', style: { padding: '4px' } }, 'No match'));
    };
    input.addEventListener('input', debounce(show, 80));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const f = results.querySelector('.cmp-hit'); f && f.click(); } });
    return h('div', { class: 'stack tight' }, input, results);
  };
  const choose = async (i, o) => {
    const d = await get(`/api/dex/species/${o.id}?run=none${o.form ? '&form=' + encodeURIComponent(o.form) : ''}`);
    const f = o.form && d.form ? d.form : null;
    memo.sides[i] = { id: o.id, form: o.form || null, name: f ? f.name : d.name, types: f ? f.types : d.types,
      abilities: f ? f.abilities : (d.abilities || []).map((a) => a.name), art_still: (f ? f.art && f.art.static : d.art && d.art.static) || o.still?.url || null,
      art_ani: (f ? f.art && f.art.ani : d.art && d.art.ani) || null,
      moves: d.moves || [], formMovesShared: !!f };
    memo.picks[i] = [];
    draw();
  };

  // ---------------------------------------------------------------- types both ways
  const matchup = () => {
    const [a, b] = memo.sides;
    const row = (att, def) => h('div', { class: 'cmp-dir' }, h('div', { class: 'small' }, h('strong', null, att.name), ' attacking ', h('strong', null, def.name), h('span', { class: 'tiny muted' }, ' — its own types (STAB)')),
      h('div', { class: 'row wrap tight' }, att.types.map((t) => { const m = eff(t, def.types); return h('span', { class: 'row tight cmp-eff' }, chip(t), m == null ? h('span', { class: 'tiny muted', title: 'Type not in the 17-type chart' }, 'unknown') : h('span', { class: 'mult ' + multCls(m) }, mult(m))); })));
    const weak = (s) => T.map((t) => [t, eff(t, s.types)]).filter(([, m]) => m != null && m >= 2);
    return h('div', { class: 'stack tight cmp-matchup' }, row(a, b), row(b, a),
      h('div', { class: 'tiny muted' }, `${a.name} is weak to `, weak(a).map(([t, m]) => `${cap(t)} ${mult(m)}`).join(', ') || 'nothing', ` · ${b.name} is weak to `,
        weak(b).map(([t, m]) => `${cap(t)} ${mult(m)}`).join(', ') || 'nothing', '.'));
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
      && (!f.q || m.name.toLowerCase().includes(f.q)) && (!f.hitting || (m.vs != null && m.vs >= 2)));
    const key = memo.sort[i];
    const cmp = { vs: (x, y) => (y.vs ?? -1) - (x.vs ?? -1) || (y.power || 0) - (x.power || 0), power: (x, y) => (y.power || 0) - (x.power || 0), name: (x, y) => String(x.name).localeCompare(String(y.name)),
      type: (x, y) => (x.type || '~').localeCompare(y.type || '~') || x.name.localeCompare(y.name), acc: (x, y) => (y.accuracy || 0) - (x.accuracy || 0), pp: (x, y) => (y.pp || 0) - (x.pp || 0) }[key];
    shown.sort(cmp);
    const picks = memo.picks[i];
    const setF = (k, v) => { memo.filters[i] = { ...f, [k]: v || undefined }; draw(); };
    const th = (k, label) => h('th', { class: 'th-sort' + (key === k ? ' active' : ''), tabindex: '0', 'aria-sort': key === k ? 'descending' : 'none',
      onclick: () => { memo.sort[i] = k; draw(); }, onkeydown: (e) => { if (e.key === 'Enter') { memo.sort[i] = k; draw(); } } }, label);
    const chosen = picks.map((id) => rows.find((m) => m.id === id)).filter(Boolean);
    return h('section', { class: 'cmp-moves', dataset: { side: i } },
      h('h3', null, `${me.name}’s moves against ${foe.name}`),
      me.formMovesShared ? h('div', { class: 'tiny muted' }, 'Forms share the species’ learnset here; form-only moves are not listed separately.') : null,
      chosen.length ? h('div', { class: 'cmp-chosen' }, h('div', { class: 'tiny muted' }, `Chosen (${chosen.length}/${MAX_PICKS})`),
        h('div', { class: 'row wrap tight' }, chosen.map((m) => h('span', { class: 'chip' }, chip(m.type), ' ', m.name, ' ',
          m.vs == null ? h('span', { class: 'tiny muted' }, m.unverified ? 'details awaiting verification' : 'status') : h('span', { class: 'mult ' + multCls(m.vs) }, mult(m.vs)), m.stab ? h('span', { class: 'tiny', title: 'Same-type attack bonus' }, ' STAB') : null)))) : null,
      h('div', { class: 'row wrap tight cmp-filters' },
        h('input', { class: 'input', type: 'search', placeholder: 'Move…', value: f.q || '', style: { width: '120px' }, 'aria-label': 'Filter moves by name',
          onchange: (e) => setF('q', e.target.value.trim().toLowerCase()) }),
        h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': 'Move type', onchange: (e) => setF('type', e.target.value) },
          h('option', { value: '' }, 'All types'), T.map((t) => h('option', { value: t, selected: f.type === t ? 'selected' : null }, cap(t)))),
        h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': 'Category', onchange: (e) => setF('cat', e.target.value) },
          [['', 'All categories'], ['Physical', 'Physical'], ['Special', 'Special'], ['Status', 'Status']].map(([v, l]) => h('option', { value: v, selected: (f.cat || '') === v ? 'selected' : null }, l))),
        h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': 'How it is learned', onchange: (e) => setF('method', e.target.value) },
          [['', 'Any method'], ['Lv', 'Level'], ['TM/HM', 'TM/HM'], ['Tutor', 'Tutor'], ['Egg', 'Egg'], ['Evolution', 'Evolution'], ['Special', 'Special']].map(([v, l]) => h('option', { value: v, selected: (f.method || '') === v ? 'selected' : null }, l))),
        h('label', { class: 'row tight small' }, h('input', { type: 'checkbox', class: 'check', checked: !!f.hitting, onchange: (e) => setF('hitting', e.target.checked) }), 'Super effective only')),
      h('div', { class: 'tc-scroll cmp-table-wrap' }, h('table', { class: 'table cmp-table' },
        h('thead', null, h('tr', null, h('th', null, h('span', { class: 'sr-only' }, 'Choose')), th('name', 'Move'), th('type', 'Type'), th('vs', 'vs ' + foe.name),
          th('power', 'Pow'), th('acc', 'Acc'), th('pp', 'PP'), h('th', null, 'Cat.'), h('th', null, 'Learned'))),
        h('tbody', null, shown.map((m) => {
          const on = picks.includes(m.id);
          return h('tr', { class: on ? 'picked' : null },
            h('td', null, h('input', { type: 'checkbox', class: 'check', checked: on, disabled: !on && picks.length >= MAX_PICKS ? 'disabled' : null, 'aria-label': 'Choose ' + m.name,
              onchange: (e) => { memo.picks[i] = e.target.checked ? [...picks, m.id].slice(0, MAX_PICKS) : picks.filter((x) => x !== m.id); draw(); } })),
            h('td', null, m.name, m.unverified ? h('span', { class: 'tiny muted', title: 'Type, category and power are not in the PokeMMO data yet' }, ' · awaiting verification') : null, m.stab ? h('span', { class: 'tiny muted', title: 'Same-type attack bonus' }, ' STAB') : null),
            h('td', null, chip(m.type)),
            h('td', null, m.vs == null ? h('span', { class: 'tiny muted', title: m.unverified ? 'Details awaiting verification in the PokeMMO data — no effectiveness shown' : 'Status move' }, m.unverified ? '?' : '—') : h('span', { class: 'mult ' + multCls(m.vs) }, mult(m.vs))),
            h('td', null, m.power || '—'), h('td', null, m.accuracy || '—'), h('td', null, m.pp ?? '—'),
            h('td', { class: 'small', title: m.unverified ? 'Details awaiting verification in the PokeMMO data' : m.category }, m.unverified && !m.category ? '?' : ({ Physical: 'Phys.', Special: 'Spec.', Status: 'Status' })[m.category] || m.category),
            h('td', { class: 'small muted' }, m.methods.join(', ')));
        })))),
      h('div', { class: 'tiny muted' }, `${shown.length} of ${rows.length} moves`));
  };

  draw();
  return box;
}
