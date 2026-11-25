import { compareLabels, findSpecies, gameTerm, speciesLabel } from './game-locale.js';
import { t } from './i18n.js';
// Shared widgets.
import { h, get, state, pad3, spriteOrFallback, typeChips } from './core.js';

let dlCounter = 0;
export async function speciesIndex() {
  if (!state.dexCache) state.dexCache = (await get('/api/dex/species')).species;
  return state.dexCache;
}

/** Text input with suggestions; resolves to a species id. */
export function speciesPicker({ value, onChange, label = t('ui.species'), placeholder = t('ui.species_search'), id }) {
  const listId = 'species-dl-' + (++dlCounter);
  const input = h('input', { class: 'input', list: listId, placeholder, id: id || null, autocomplete: 'off', 'aria-label': label });
  const dl = h('datalist', { id: listId });
  const preview = h('div', { class: 'row', style: { minHeight: '36px' } });
  speciesIndex().then((idx) => {
    const sorted = [...idx].sort((a, b) => compareLabels(speciesLabel(a.id, a.name), speciesLabel(b.id, b.name)));
    dl.append(...sorted.map((s) => h('option', { value: speciesLabel(s.id, s.name) }, '#' + pad3(s.id))));
    if (value) { const s = idx.find((x) => x.id === Number(value)); if (s) { input.value = speciesLabel(s.id, s.name); show(s); } }
  });
  function show(s) {
    preview.replaceChildren(...(s ? [h('div', { style: { width: '36px', height: '36px', display: 'grid', placeItems: 'center' } }, spriteOrFallback(s.icon, s, 36)),
      h('span', { class: 'small muted' }, '#' + pad3(s.id)), typeChips(s.types, true)] : []));
  }
  input.addEventListener('change', async () => {
    const idx = await speciesIndex();
    const s = findSpecies(idx, input.value);
    show(s);
    if (s) input.value = speciesLabel(s.id, s.name);
    onChange(s ? s.id : null, s);
  });
  return h('div', { class: 'field' }, label ? h('label', null, label) : null, input, dl, preview);
}

export function downloadJson(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
export function pickJsonFile() {
  return new Promise((resolve, reject) => {
    const inp = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
    inp.addEventListener('change', () => {
      const f = inp.files[0]; if (!f) return resolve(null);
      const r = new FileReader();
      r.onload = () => { try { resolve(JSON.parse(r.result)); } catch (e) { reject(new Error('That file is not valid JSON')); } inp.remove(); };
      r.readAsText(f);
    });
    document.body.append(inp); inp.click();
  });
}
export const NATURES = ['Adamant', 'Bashful', 'Bold', 'Brave', 'Calm', 'Careful', 'Docile', 'Gentle', 'Hardy', 'Hasty', 'Impish', 'Jolly', 'Lax',
  'Lonely', 'Mild', 'Modest', 'Naive', 'Naughty', 'Quiet', 'Quirky', 'Rash', 'Relaxed', 'Sassy', 'Serious', 'Timid'];
export function natureSelect(value, onChange, allowNone = true) {
  return h('select', { class: 'input', onchange: (e) => onChange(e.target.value || null), 'aria-label': t('ui.nature') },
    allowNone ? h('option', { value: '' }, '— ' + t('ui.nature') + ' —') : null,
    NATURES.map((n) => h('option', { value: n, selected: n === value ? 'selected' : null }, gameTerm('nature', n))));
}
