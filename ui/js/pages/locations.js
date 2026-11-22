// Location explorer — phase 1 of PokeMMO Maps (docs/design/18 §6): region → location list with
// every encounter row from your installed dump, linked both ways to the Pokédex, Notes and your guides.
// No map artwork is shipped or drawn; no rates are invented.
import { h, mount, icon, get, notice, debounce, cap, pad3, typeChip, fmtDate } from '../core.js';
import { go, popoutButton, pinButton } from '../shell.js';
import { t } from '../i18n.js';
import { linkedNotes, openRoute } from '../links.js';

const REGIONS = ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova'];
let cache = null;
const f = { q: '', region: '', method: '', horde: false, season: '' };
export function dispose() {}

async function load() { if (!cache) cache = await get('/api/locations'); return cache; }
function filter(locs, speciesNames) {
  const q = f.q.trim().toLowerCase();
  return locs.filter((l) => (!f.region || l.region === f.region) && (!f.method || l.methods.includes(f.method)) && (!f.horde || l.horde) &&
    (!f.season || l.seasons.includes(f.season) || l.seasons.includes('Any')) &&
    (!q || l.name.toLowerCase().includes(q) || l.species.some((sid) => (speciesNames[sid] || '').toLowerCase().includes(q))));
}

export async function render(el, route) {
  const data = await load();
  const page = h('div', { class: 'page flush' });
  mount(el, page);
  page.append(h('div', { class: 'page-head', style: { padding: '14px 18px 4px' } },
    h('button', { class: 'btn ghost', onclick: () => go('#/tools') }, icon('back'), t('tools.title')),
    h('div', null, h('h1', null, t('loc.title')), h('div', { class: 'sub' }, t('loc.desc'))),
    h('div', { class: 'actions' }, pinButton({ kind: 'tool', id: 'locations' }), popoutButton('locations'))));
  if (!data.imported) { page.append(h('div', { style: { padding: '0 18px' } }, notice('info', 'Install your PokeMMO data to list locations and encounters. ', h('button', { class: 'btn small', onclick: () => go('#/settings/data') }, 'Settings › Data')))); return; }
  const sel = route.parts[1] ? decodeURIComponent(route.parts[1]) : null;
  const sp = await get('/api/dex/species?run=none');
  const names = Object.fromEntries(sp.species.map((s) => [s.id, s.name]));
  const methods = [...new Set(data.locations.flatMap((l) => l.methods))].sort();
  const layout = h('div', { class: 'dex-layout' + (sel ? ' split' : '') });
  page.append(layout);
  const left = h('div', { class: 'dex-grid-wrap' });
  const listEl = h('div', { class: 'loc-list' });
  const count = h('span', { class: 'small muted' });
  const draw = () => {
    const list = filter(data.locations, names);
    count.textContent = `${list.length} of ${data.locations.length} locations`;
    const groups = {};
    for (const l of list) (groups[l.region] ||= []).push(l);
    mount(listEl, list.length ? REGIONS.filter((r) => groups[r]).map((r) => h('section', null, h('h3', { class: 'gen-head' }, cap(r), h('span', { class: 'tiny muted' }, ` · ${groups[r].length}`)),
      groups[r].map((l) => h('button', { class: 'loc-row' + (l.id === sel ? ' selected' : ''), onclick: () => go('#/tools/locations/' + encodeURIComponent(l.id)) },
        h('span', { class: 'grow' }, l.name, l.notes ? h('span', { class: 'tiny muted' }, ` · 📝 ${l.notes}`) : null),
        h('span', { class: 'tiny muted' }, `${l.species_count} Pokémon · ${l.methods.join(', ')}${l.horde ? ' · hordes' : ''}`))))) :
      h('div', { class: 'empty' }, 'No locations match.'));
  };
  const chip = (label, key) => h('button', { class: 'chip btnlike' + (f[key] ? ' active' : ''), 'aria-pressed': String(!!f[key]), onclick: (e) => { f[key] = !f[key]; e.currentTarget.classList.toggle('active', f[key]); draw(); } }, label);
  left.append(h('div', { class: 'dex-toolbar' },
    h('div', { class: 'search' }, icon('search'), h('input', { class: 'input', type: 'search', value: f.q, placeholder: 'Location or Pokémon', 'aria-label': 'Search locations', oninput: debounce((e) => { f.q = e.target.value; draw(); }, 120) })),
    h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': 'Region', onchange: (e) => { f.region = e.target.value; draw(); } }, h('option', { value: '' }, 'All regions'), REGIONS.map((r) => h('option', { value: r, selected: f.region === r ? 'selected' : null }, cap(r)))),
    h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': 'Encounter type', onchange: (e) => { f.method = e.target.value; draw(); } }, h('option', { value: '' }, 'Any encounter type'), methods.map((m) => h('option', { value: m, selected: f.method === m ? 'selected' : null }, m))),
    h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': 'Season', onchange: (e) => { f.season = e.target.value; draw(); } }, h('option', { value: '' }, 'Any season'), ['Spring', 'Summer', 'Autumn', 'Winter'].map((s) => h('option', { value: s, selected: f.season === s ? 'selected' : null }, s))),
    chip('Hordes', 'horde'), count),
  h('div', { class: 'dex-info' }, h('span', { class: 'tiny muted' }, `From your installed dump${data.dump_date ? ` (files dated ${data.dump_date})` : ''}. Sevii Islands and interactive maps are not included yet; no map images are shipped.`)),
  h('div', { class: 'dex-scroll' }, listEl));
  layout.append(left);
  draw();
  if (sel) {
    const pane = h('div', { class: 'dex-detail' });
    layout.append(pane);
    await renderLocation(pane, sel, { back: () => go('#/tools/locations') });
  }
}

function rate(r) { return h('td', { class: 'rate ' + (r && r.kind || ''), title: r && r.raw || '' }, r ? r.label : '—'); }

export async function renderLocation(pane, id, { back, popout } = {}) {
  let d;
  try { d = await get('/api/locations/' + encodeURIComponent(id)); } catch (e) { mount(pane, h('div', { class: 'detail-body' }, notice('bad', 'Location not found in your installed data.'))); return; }
  const nav = (r) => (popout ? openRoute(r) : go(r));
  const bySpecies = {};
  for (const r of d.rows) (bySpecies[r.species_id] ||= []).push(r);
  mount(pane, h('div', { class: 'detail-head' }, h('div', { class: 'grow' },
    h('div', { class: 'row' }, h('span', { class: 'chip' }, cap(d.region)), h('span', { class: 'grow' }), back ? h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: back }, icon('close')) : null),
    h('h2', null, d.name), h('div', { class: 'small muted' }, `${Object.keys(bySpecies).length} Pokémon · ${d.rows.length} encounter rows`))),
  h('div', { class: 'detail-body stack' },
    h('table', { class: 'table compact' }, h('thead', null, h('tr', null, ['', 'Pokémon', 'Type', 'Levels', 'Horde', 'Season', 'Morning', 'Day', 'Night'].map((c) => h('th', null, c)))),
      h('tbody', null, Object.values(bySpecies).flatMap((rows) => rows.map((r, i) => h('tr', null,
        h('td', null, i === 0 && r.icon ? h('img', { class: 'pixel', src: r.icon, width: 32, height: 32, alt: '' }) : null),
        h('td', null, i === 0 ? h('a', { href: '#/pokedex/' + r.species_id, onclick: (e) => { e.preventDefault(); nav('#/pokedex/' + r.species_id + '?tab=locations'); } }, `${r.name}`) : '', i === 0 ? h('span', { class: 'tiny muted' }, ' #' + pad3(r.species_id)) : null),
        h('td', { class: 'small' }, r.method), h('td', { class: 'nowrap' }, r.min === r.max ? r.min : `${r.min}–${r.max}`), h('td', null, r.horde5 ? '×5' : r.horde3 ? '×3' : '—'),
        h('td', { class: 'small' }, r.season || '—'), rate(r.morning), rate(r.day), rate(r.night)))))),
    h('div', { class: 'tiny muted' }, d.provenance, d.dump_date ? ` Dump files dated ${fmtDate(d.dump_date)}.` : ''),
    d.guides.length ? h('div', { class: 'stack tight' }, h('span', { class: 'label' }, 'Your guides for this location'), d.guides.map((g) => h('button', { class: 'tool-link', onclick: () => nav('#/tools/cguides/' + g.id) }, icon('list'), g.title))) : null,
    linkedNotes('location', d.id, `${d.name} (${cap(d.region)})`)));
  void typeChip;
}

export async function renderLocationsPopout(el, mode) {
  const data = await load();
  if (!data.imported) { mount(el, notice('info', 'Install your PokeMMO data to list locations.')); return; }
  const m = location.hash.match(/^#\/loc\/(.+)$/);
  if (m) {
    const pane = h('div');
    mount(el, h('button', { class: 'btn ghost small', onclick: () => { location.hash = '#/'; } }, icon('back'), t('common.back')), pane);
    await renderLocation(pane, decodeURIComponent(m[1]), { popout: true });
    return;
  }
  const sp = await get('/api/dex/species?run=none');
  const names = Object.fromEntries(sp.species.map((s) => [s.id, s.name]));
  const list = h('div', { class: 'loc-list' });
  const draw = () => mount(list, filter(data.locations, names).map((l) => h('button', { class: 'loc-row', onclick: () => { location.hash = '#/loc/' + encodeURIComponent(l.id); } },
    h('span', { class: 'grow' }, l.name, h('span', { class: 'tiny muted' }, ' · ' + cap(l.region))), mode !== 'compact' ? h('span', { class: 'tiny muted' }, `${l.species_count} Pokémon`) : null)));
  mount(el, h('div', { class: 'row' }, h('input', { class: 'input', type: 'search', value: f.q, placeholder: 'Location or Pokémon', 'aria-label': 'Search locations', oninput: debounce((e) => { f.q = e.target.value; draw(); }, 120) }),
    h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': 'Region', onchange: (e) => { f.region = e.target.value; draw(); } }, h('option', { value: '' }, 'All'), REGIONS.map((r) => h('option', { value: r, selected: f.region === r ? 'selected' : null }, cap(r))))), list);
  draw();
}
