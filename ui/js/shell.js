// Main window chrome, navigation and router.
import { h, mount, icon, logo, state, setting, saveSettings, on, reportToast, post, SHELL, TOKEN, toast, debounce, get, pad3 } from './core.js';
import * as home from './pages/home.js';
import * as pokedex from './pages/pokedex.js';
import * as tools from './pages/tools.js';
import * as live from './pages/live.js';
import * as guides from './pages/guides.js';
import * as settingsPage from './pages/settings.js';

export const NAV = [
  { id: 'home', label: 'Home', icon: 'home', page: home },
  { id: 'pokedex', label: 'Pokédex', icon: 'dex', page: pokedex },
  { id: 'tools', label: 'Tools', icon: 'tools', page: tools },
  { id: 'live', label: 'Live', icon: 'live', page: live },
  { id: 'guides', label: 'Guides', icon: 'guides', page: guides },
];
const PAGES = { home, news: home, events: home, pokedex, tools, live, guides, settings: settingsPage };

let root, mainEl, quickEl, current = { page: null, mod: null };

export function parseRoute(hash = location.hash) {
  const raw = (hash || '#/home').replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { page: parts[0] || 'home', parts: parts.slice(1), query: new URLSearchParams(qs || ''), hash: '#/' + raw };
}
export function go(hash) { if (location.hash !== hash) location.hash = hash; else renderRoute(); }

const saveRoute = debounce((hash) => { saveSettings({ 'app.last_route': hash }).catch(() => {}); }, 600);

export function startApp(el) {
  root = el;
  if (!location.hash || location.hash === '#') {
    const last = setting('app.restore_last_page') ? setting('app.last_route') : '#/home';
    history.replaceState(null, '', location.pathname + location.search + (last || '#/home'));
  }
  // remove token from the visible URL; it stays in sessionStorage for this window
  renderChrome();
  window.addEventListener('hashchange', renderRoute);
  let lastNav = setting('appearance.nav');
  document.addEventListener('settings-changed', () => {
    if (setting('appearance.nav') !== lastNav) { lastNav = setting('appearance.nav'); renderChrome(); }
  });
  on('toast', (p) => reportToast(p, (id) => go(`#/live/reports/${id}`)));
  on('navigate', (d) => d && d.route && go(d.route));
  on('settings', (d) => { if (d && Object.keys(d).includes('nav.quick_access')) setTimeout(renderQuick, 50); });
  document.addEventListener('keydown', globalKeys);
  // First-run setup now lives in a dismissible "Get started" panel on Home (no blocking modal).
}

function globalKeys(e) {
  if (e.altKey && /^[1-5]$/.test(e.key)) { e.preventDefault(); go('#/' + NAV[Number(e.key) - 1].id); }
  if (e.ctrlKey && e.key === ',') { e.preventDefault(); go('#/settings'); }
}

function navButton(n, active) {
  return h('button', { class: 'nav-item' + (active ? ' active' : ''), 'aria-current': active ? 'page' : null, dataset: { nav: n.id },
    title: `${n.label} (Alt+${NAV.indexOf(n) + 1})`, onclick: () => go('#/' + n.id) },
  icon(n.icon), h('span', { class: 'label' }, n.label));
}

function renderChrome() {
  const vertical = setting('appearance.nav') !== 'horizontal';
  const r = parseRoute();
  const activeId = ({ news: 'home', events: 'home' })[r.page] || r.page;
  const gear = h('button', { class: 'icon-btn' + (r.page === 'settings' ? ' on' : ''), title: 'Settings (Ctrl+,)', 'aria-label': 'Settings',
    onclick: () => go('#/settings') }, icon('gear'));
  const brand = h('div', { class: 'brand' }, logo(28), h('div', { class: 'text' },
    h('div', { class: 'name' }, 'PokeMMO Companion'), h('div', { class: 'ver' }, `v${state.boot.version} · dev preview`)));
  mainEl = h('main', { class: 'main', id: 'main' });
  let shell;
  quickEl = h('div', { class: vertical ? 'quick' : 'quick-strip', role: 'list', 'aria-label': 'Quick access' });
  if (vertical) {
    shell = h('div', { class: 'app nav-vertical' },
      h('aside', { class: 'sidebar' }, brand, h('nav', { 'aria-label': 'Main' }, NAV.map((n) => navButton(n, n.id === activeId))),
        h('div', { class: 'quick-head' }, h('span', { class: 'label-text' }, 'Quick access'),
          h('button', { class: 'icon-btn sm', title: 'Add tools to Quick access (Tools page: drag a tool here, or use “Pin to sidebar”)',
            'aria-label': 'Add to Quick access', onclick: () => go('#/tools') }, icon('plus'))),
        quickEl,
        h('button', { class: 'nav-item' + (r.page === 'settings' ? ' active' : ''), dataset: { nav: 'settings' }, onclick: () => go('#/settings'), title: 'Settings (Ctrl+,)' },
          icon('gear'), h('span', { class: 'label' }, 'Settings'))),
      mainEl);
  } else {
    shell = h('div', { class: 'app nav-horizontal' },
      h('header', { class: 'topbar' }, brand, h('nav', { 'aria-label': 'Main' }, NAV.map((n) => navButton(n, n.id === activeId))),
        h('span', { class: 'grow' }), quickEl, gear),
      mainEl);
  }
  shell.dataset.nav = vertical ? 'vertical' : 'horizontal';
  mount(root, shell);
  current = { page: null, mod: null };
  renderQuick();
  renderRoute();
}

function renderRoute() {
  const r = parseRoute();
  const mod = PAGES[r.page];
  if (!mod) { go('#/home'); return; }
  // update active nav without rebuilding chrome
  const activeId = ({ news: 'home', events: 'home' })[r.page] || r.page;
  document.querySelectorAll('.nav-item').forEach((b) => {
    const on_ = b.dataset.nav === activeId;
    b.classList.toggle('active', on_); b.setAttribute('aria-current', on_ ? 'page' : 'false');
  });
  document.querySelectorAll('.topbar .icon-btn[aria-label=Settings]').forEach((b) => b.classList.toggle('on', r.page === 'settings'));
  if (current.mod && current.mod !== mod && current.mod.dispose) current.mod.dispose();
  const samePage = current.mod === mod && current.page === r.page;
  current = { page: r.page, mod };
  try {
    mod.render(mainEl, r, { samePage });
  } catch (e) {
    console.error(e);
    mount(mainEl, h('div', { class: 'page' }, h('div', { class: 'notice bad' }, 'This page failed to render: ' + e.message)));
  }
  const title = (NAV.find((n) => n.id === activeId) || { label: r.page === 'settings' ? 'Settings' : '' }).label;
  document.title = `${title} — PokeMMO Companion`;
  saveRoute(r.hash);
}

// --------------------------------------------------------------- popouts
export const POPOUT_TOOLS = {
  storyline: { title: 'Storyline', w: 380, h: 460 }, pokedex: { title: 'Pokédex', w: 420, h: 560 },
  reports: { title: 'Alpha & Swarm reports', w: 380, h: 480 }, typechart: { title: 'Type matchups', w: 420, h: 520 },
  breeding: { title: 'Breeding', w: 460, h: 600 }, legendaries: { title: 'Legendaries', w: 360, h: 380 },
  cave: { title: 'Altering Cave', w: 360, h: 380 }, natures: { title: 'Natures', w: 380, h: 520 },
};
export function popoutSize(tool, mode) {
  const custom = (setting(`window.${tool}.sizes`) || {})[mode];
  if (custom && custom.w) return [custom.w, custom.h];
  const p = ((state.boot.window_presets || {})[tool] || {})[mode];
  return p || [POPOUT_TOOLS[tool].w, POPOUT_TOOLS[tool].h];
}
export async function openPopout(tool, extraHash = '') {
  const def = POPOUT_TOOLS[tool];
  const mode = setting(`window.${tool}.mode`) || 'standard';
  if (SHELL === 'qt') {
    const res = await post('/api/shell/command', { action: 'open_popout', tool, mode, hash: extraHash });
    if (res.queued) return;
  }
  const [w, h_] = popoutSize(tool, mode);
  const url = `/?token=${encodeURIComponent(TOKEN)}&popout=${tool}&mode=${mode}&shell=browser${extraHash}`;
  const win = window.open(url, 'pmc-' + tool, `popup=yes,width=${w},height=${h_}`);
  if (!win) toast('Your browser blocked the popout window. Allow popups for this page.', { kind: 'warn' });
  else toast(`${def.title} opened as a browser window. Pin / always-on-top needs the native shell.`, { timeout: 3200 });
}
export function popoutButton(tool, extraHash = '') {
  return h('button', { class: 'btn ghost small', title: 'Open as a separate window', onclick: () => openPopout(tool, extraHash) },
    icon('popout'), 'Pop out');
}

// ---------------------------------------------------------- Quick access
// Ordered, persistent list of pinned tools / pages / Pokémon (settings key nav.quick_access).
export const QA_TOOLS = {
  typechart: { label: 'Type matchups', icon: 'shield', route: '#/tools/typechart', popout: 'typechart' },
  natures: { label: 'Natures', icon: 'leaf', route: '#/tools/natures', popout: 'natures' },
  breeding: { label: 'Breeding planner', icon: 'egg', route: '#/tools/breeding', popout: 'breeding' },
  team: { label: 'Team builder', icon: 'team', route: '#/tools/team' },
  ev: { label: 'EV & horde planner', icon: 'target', route: '#/tools/ev' },
  stats: { label: 'Stat calculator', icon: 'calc', route: '#/tools/stats' },
  catch: { label: 'Catch estimate', icon: 'target', route: '#/tools/catch' },
  damage: { label: 'Damage calculator', icon: 'bolt', route: '#/tools/damage', disabled: 'Not available yet: no verified PokeMMO damage cases' },
};
const QA_PAGES = {
  pokedex: { label: 'Pokédex', icon: 'dex', route: '#/pokedex', popout: 'pokedex' },
  reports: { label: 'Alpha & Swarm reports', icon: 'live', route: '#/live/reports', popout: 'reports' },
  legendaries: { label: 'Legendaries', icon: 'crown', route: '#/live/legendaries', popout: 'legendaries' },
  cave: { label: 'Altering Cave', icon: 'crystal', route: '#/live/cave', popout: 'cave' },
  news: { label: 'Official updates', icon: 'book', route: '#/news' },
};
export function qaInfo(item) {
  if (item.kind === 'tool') return QA_TOOLS[item.id] || null;
  if (item.kind === 'page') return QA_PAGES[item.id] || null;
  if (item.kind === 'guide') return { label: 'Current guide step', icon: 'guides', route: '#/guides?jump=1', popout: 'storyline' };
  if (item.kind === 'pokemon') {
    const sp = (state.dexCache || []).find((s) => s.id === Number(item.id));
    return { label: sp ? sp.name : '#' + pad3(item.id), icon: 'dex', route: '#/pokedex/' + item.id, popout: 'pokedex',
      popoutHash: '#/species/' + item.id, sprite: sp && sp.icon };
  }
  return null;
}
const qaKey = (i) => i.kind + ':' + i.id;
export function isPinned(item) { return (setting('nav.quick_access') || []).some((x) => qaKey(x) === qaKey(item)); }
export async function pinToSidebar(item) {
  const list = [...(setting('nav.quick_access') || [])];
  if (list.some((x) => qaKey(x) === qaKey(item))) { toast('Already in Quick access'); return; }
  const info = qaInfo(item);
  if (info && info.disabled) { toast(info.disabled, { kind: 'warn' }); return; }
  list.push({ kind: item.kind, id: item.id });
  await saveSettings({ 'nav.quick_access': list });
  renderQuick();
  toast(`Pinned “${info ? info.label : item.id}” to Quick access`);
}
export async function unpin(item) {
  await saveSettings({ 'nav.quick_access': (setting('nav.quick_access') || []).filter((x) => qaKey(x) !== qaKey(item)) });
  renderQuick();
}
async function moveQuick(from, to) {
  const list = [...(setting('nav.quick_access') || [])];
  if (to < 0 || to >= list.length || from === to) return;
  const [it] = list.splice(from, 1);
  list.splice(to, 0, it);
  await saveSettings({ 'nav.quick_access': list });
  renderQuick();
}
export function pinButton(item, small = true) {
  const pinned = isPinned(item);
  return h('button', { class: 'btn ghost' + (small ? ' small' : ''), title: pinned ? 'Remove from sidebar Quick access' : 'Pin to sidebar Quick access',
    onclick: async (e) => { if (isPinned(item)) await unpin(item); else await pinToSidebar(item);
      e.currentTarget.replaceWith(pinButton(item, small)); } }, icon('pin'), pinned ? 'Unpin' : 'Pin to sidebar');
}

function qaMenu(item, idx, anchor) {
  document.querySelectorAll('.menu').forEach((m) => m.remove());
  const info = qaInfo(item) || {};
  const r = anchor.getBoundingClientRect();
  const btn = (label, fn) => h('button', { onclick: () => { menu.remove(); fn(); } }, label);
  const menu = h('div', { class: 'menu', role: 'menu', style: { top: r.bottom + 2 + 'px', left: Math.min(r.left, innerWidth - 220) + 'px' } },
    btn('Open', () => go(info.route)),
    info.popout ? btn('Open as popout window', () => openPopout(info.popout, info.popoutHash || '')) : null,
    h('div', { class: 'sep' }), btn('Move up', () => moveQuick(idx, idx - 1)), btn('Move down', () => moveQuick(idx, idx + 1)),
    h('div', { class: 'sep' }), btn('Remove from Quick access', () => unpin(item)));
  document.body.append(menu);
  const close = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', close); } };
  setTimeout(() => document.addEventListener('click', close), 0);
  menu.querySelector('button').focus();
  menu.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { menu.remove(); anchor.focus(); } });
}

export function renderQuick() {
  if (!quickEl || !quickEl.isConnected) return;
  const list = setting('nav.quick_access') || [];
  const vertical = quickEl.classList.contains('quick');
  const items = list.map((it, idx) => {
    const info = qaInfo(it);
    if (!info) return null;
    const main = h('button', { class: 'qa-item' + (info.disabled ? ' disabled' : ''), title: info.disabled || `${info.label} (drag to reorder · right-click for options · Alt+↑/↓ to move)`,
      'aria-disabled': info.disabled ? 'true' : null, draggable: 'true',
      onclick: () => { if (info.disabled) { toast(info.disabled, { kind: 'warn' }); return; } go(info.route); },
      oncontextmenu: (e) => { e.preventDefault(); qaMenu(it, idx, e.currentTarget); },
      onkeydown: (e) => {
        if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); moveQuick(idx, idx - 1); }
        if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); moveQuick(idx, idx + 1); }
        if (e.key === 'Delete') { e.preventDefault(); unpin(it); }
        if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); qaMenu(it, idx, e.currentTarget); }
      } },
    info.sprite ? h('img', { class: 'pixel qa-sprite', src: info.sprite, alt: '' }) : icon(info.icon), vertical ? h('span', { class: 'label ellipsis' }, info.label) : null);
    main.addEventListener('dragstart', (e) => { e.dataTransfer.setData('application/x-pmc-qa', String(idx)); e.dataTransfer.effectAllowed = 'move'; });
    const row = h('div', { class: 'qa-row', role: 'listitem', dataset: { idx } }, main,
      vertical && info.popout && !info.disabled ? h('button', { class: 'icon-btn sm qa-pop', title: `Open ${info.label} as a popout window`, 'aria-label': `Pop out ${info.label}`,
        onclick: () => openPopout(info.popout, info.popoutHash || '') }, icon('popout')) : null,
      vertical ? h('button', { class: 'icon-btn sm qa-more', title: 'Options', 'aria-label': `Options for ${info.label}`, onclick: (e) => qaMenu(it, idx, e.currentTarget) }, icon('dots')) : null);
    return row;
  });
  mount(quickEl, items.length ? items : (vertical ? h('div', { class: 'qa-empty' }, 'Drag tools here from the Tools page, or use “Pin to sidebar”.') : null));
}

function quickDropTarget(e) { return e.target.closest && e.target.closest('.quick, .quick-strip'); }
document.addEventListener('dragover', (e) => {
  if (!quickDropTarget(e)) return;
  const types = [...e.dataTransfer.types];
  if (types.includes('application/x-pmc-qa') || types.includes('application/x-pmc-pin')) { e.preventDefault(); quickDropTarget(e).classList.add('drop'); }
});
document.addEventListener('dragleave', (e) => { const t = quickDropTarget(e); if (t && !t.contains(e.relatedTarget)) t.classList.remove('drop'); });
document.addEventListener('drop', async (e) => {
  const target = quickDropTarget(e);
  if (!target) return;
  e.preventDefault();
  target.classList.remove('drop');
  const rowEl = e.target.closest('.qa-row');
  const toIdx = rowEl ? Number(rowEl.dataset.idx) : (setting('nav.quick_access') || []).length;
  const from = e.dataTransfer.getData('application/x-pmc-qa');
  if (from !== '') { await moveQuick(Number(from), Math.min(toIdx, (setting('nav.quick_access') || []).length - 1)); return; }
  try {
    const item = JSON.parse(e.dataTransfer.getData('application/x-pmc-pin'));
    await pinToSidebar(item);
    if (rowEl) await moveQuick((setting('nav.quick_access') || []).length - 1, toIdx);
  } catch (_) { /* not ours */ }
});
/** Make an element draggable into Quick access. */
export function makePinDraggable(el, item) {
  el.setAttribute('draggable', 'true');
  el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('application/x-pmc-pin', JSON.stringify(item)); e.dataTransfer.effectAllowed = 'copy'; });
  return el;
}
