import { compareLabels, findSpecies, gameTerm, searchText, speciesLabel } from './game-locale.js';
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

// Reports need an explicit choice: editing the query invalidates a previously selected ID.
export function reportSpeciesPicker({ value, onChange }) {
  const listId = 'species-results-' + (++dlCounter);
  const input = h('input', { id: listId + '-input', class: 'input', role: 'combobox',
    autocomplete: 'off', placeholder: t('ui.species_search'), 'aria-autocomplete': 'list',
    'aria-expanded': 'false', 'aria-controls': listId });
  const list = h('div', { id: listId, class: 'report-species-results', role: 'listbox',
    'aria-label': t('ui.species'), hidden: true });
  const status = h('div', { class: 'small muted', role: 'status', hidden: true });
  const selection = h('div', { class: 'row wrap tight' });
  const matchesFor = (query) => {
    const number = /^#?\s*(\d+)$/.exec(query);
    if (number) return index.filter(s => s.id === Number(number[1]));
    const rank = (s) => s.terms.some(term => term.startsWith(query)) ? 0 :
      s.terms.some(term => term.includes(query)) ? 1 : 2;
    return index.map(s => ({ s, rank: rank(s) })).filter(item => item.rank < 2)
      .sort((a, b) => a.rank - b.rank || compareLabels(a.s.label, b.s.label)).map(item => item.s);
  };
  let index = [], results = [], active = -1, selected = Number(value) || null, edited = false, loaded = false;
  const face = (s) => [
    h('span', { class: 'report-species-icon', 'aria-hidden': 'true' }, spriteOrFallback(s.icon, s, 28)),
    h('span', { class: 'report-species-name' }, s.label),
    h('span', { class: 'small muted' }, '#' + pad3(s.id)),
    typeChips(s.types, true),
  ];
  function close() {
    active = -1;
    list.hidden = status.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }
  function mountSelection(s) {
    selection.replaceChildren(...(s ? [...face(s), h('button', { type: 'button', class: 'btn ghost small',
      onclick: () => { choose(null); input.focus(); } }, t('ui.clear'))] : []));
  }
  function choose(s) {
    edited = true;
    selected = s?.id || null;
    input.value = s?.label || '';
    mountSelection(s);
    close();
    onChange(selected);
  }
  function highlight(next) {
    if (active >= 0) list.children[active]?.setAttribute('aria-selected', 'false');
    active = next;
    const option = list.children[active];
    if (!option) return;
    option.setAttribute('aria-selected', 'true');
    input.setAttribute('aria-activedescendant', option.id);
    option.scrollIntoView({ block: 'nearest' });
  }
  function search() {
    close();
    const query = searchText(input.value);
    if (!loaded || !query || selected) return;
    results = matchesFor(query);
    list.replaceChildren(...results.map((s, i) => h('div', {
      class: 'report-species-option', id: listId + '-' + i, role: 'option',
      'aria-selected': 'false', onpointerdown: (e) => { if (e.pointerType === 'mouse') e.preventDefault(); },
      onclick: () => { choose(s); input.focus({ preventScroll: true }); },
    }, face(s))));
    list.scrollTop = 0;
    status.textContent = t('community.species_no_matches');
    status.hidden = Boolean(results.length);
    list.hidden = !results.length;
    input.setAttribute('aria-expanded', String(!list.hidden));
  }
  speciesIndex().then(rows => {
    index = rows.map(s => {
      const label = speciesLabel(s.id, s.name);
      return { ...s, label, terms: [s.name, label].map(searchText) };
    });
    loaded = true;
    if (!edited && selected) {
      const initial = index.find(s => s.id === selected);
      input.value = initial?.label || '';
      mountSelection(initial);
    }
    else if (document.activeElement === input) search();
  }).catch(e => { status.textContent = e.message; status.hidden = false; });
  const widget = h('div', { class: 'field report-species' },
    h('label', { for: input.id, class: 'label' }, t('ui.species')), input, list, status, selection);
  input.addEventListener('input', () => {
    edited = true;
    if (selected) { selected = null; mountSelection(null); onChange(null); }
    search();
  });
  input.addEventListener('focus', search);
  input.addEventListener('click', () => { if (list.hidden) search(); });
  widget.addEventListener('focusout', (e) => { if (e.relatedTarget && !widget.contains(e.relatedTarget)) close(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (!list.hidden || !status.hidden)) {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (list.hidden) search();
      if (!list.hidden) {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        highlight(active === -1 && step < 0 ? results.length - 1 : Math.max(0, Math.min(results.length - 1, active + step)));
      }
    } else if (e.key === 'Enter' && !list.hidden) {
      e.preventDefault();
      if (active >= 0) choose(results[active]);
    }
  });
  return widget;
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
