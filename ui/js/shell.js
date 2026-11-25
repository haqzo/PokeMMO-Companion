import { speciesLabel } from './game-locale.js';
import { uiLabel } from './i18n.js';
import { t as translateUI } from './i18n.js';
// Main window chrome, navigation and router.
import { installTimerSound } from './timer-sound.js';
import { h, mount, icon, logo, state, setting, saveSettings, on, reportToast, post, SHELL, TOKEN, toast, debounce, get, pad3 } from './core.js';
import * as home from './pages/home.js';
import * as pokedex from './pages/pokedex.js';
import * as tools from './pages/tools.js';
import * as live from './pages/live.js';
import * as guides from './pages/guides-hub.js';
import * as collection from './pages/collection.js';
import * as settingsPage from './pages/settings.js';
import { t, LANGS, lang } from './i18n.js';

// Main navigation. Frequently used tools are first-class entries (they open the same tool pages);
// Collection groups My Pokémon (Box) and Showcases. Alt+1…8 follow this order.
export const NAV = [
  { id: 'home', label: 'Home', icon: 'home', page: home },
  { id: 'pokedex', label: 'Pokédex', icon: 'dex', page: pokedex },
  { id: 'typechart', label: 'Type matchups', icon: 'shield', route: '#/tools/typechart' },
  { id: 'notes', label: 'Notes', icon: 'note', route: '#/tools/notes' },
  { id: 'collection', label: 'Collection', icon: 'box', page: collection },
  { id: 'tools', label: 'Tools', icon: 'tools', page: tools },
  { id: 'live', label: 'Live', icon: 'live', page: live },
  { id: 'guides', label: 'Guides', icon: 'guides', page: guides },
];
const PAGES = { home, news: home, events: home, pokedex, tools, live, guides, collection, settings: settingsPage };
const navRoute = (n) => n.route || '#/' + n.id;
/** Which main-nav entry a route belongs to (tool pages that have their own entry light that entry). */
export function navIdFor(r) {
  if (r.page === 'news' || r.page === 'events') return 'home';
  if (r.page === 'tools' && ['typechart', 'notes'].includes(r.parts[0])) return r.parts[0];
  if (r.page === 'tools' && ['box', 'showcase'].includes(r.parts[0])) return 'collection';
  return r.page;
}

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
  let lastLanguage = lang();
  document.addEventListener('settings-changed', () => {
    if (lang() !== lastLanguage) { lastLanguage = lang(); renderChrome(); return; }
    if (setting('appearance.nav') !== lastNav) { lastNav = setting('appearance.nav'); renderChrome(); }
    applyNavCollapse();
  });
  // Layout follows the real window: resize, maximise, monitor/DPI moves and text-size changes all fire resize
  // (CSS px already include OS / Qt scaling, so nothing is scaled twice).
  let raf = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(applyNavCollapse); });
  on('toast', (p) => reportToast(p, (id, pl) => go(pl && pl.route ? pl.route : `#/live/reports/${id}`)));
  installTimerSound();
  on('navigate', (d) => d && d.route && go(d.route));
  on('settings', (d) => { if (d && Object.keys(d).includes('nav.quick_access')) setTimeout(renderQuick, 50); });
  document.addEventListener('keydown', globalKeys);
  // First-run setup now lives in a dismissible "Get started" panel on Home (no blocking modal).
}

/** Sidebar icon mode: preference "icons", or "auto" when the window is too narrow for labels + content. */
export function applyNavCollapse() {
  const app = document.querySelector('.app.nav-vertical');
  if (!app) return;
  const pref = setting('appearance.sidebar') || 'auto';
  const scale = Math.max(1, (Number(setting('appearance.text_scale')) || 100) / 100);
  const collapsed = pref === 'icons' || (pref === 'auto' && window.innerWidth < 900 * scale);
  app.classList.toggle('nav-collapsed', collapsed);
}

function globalKeys(e) {
  if (e.altKey && /^[1-9]$/.test(e.key) && NAV[Number(e.key) - 1]) { e.preventDefault(); go(navRoute(NAV[Number(e.key) - 1])); }
  if (e.ctrlKey && e.key === ',') { e.preventDefault(); go('#/settings'); }
}

function navButton(n, active) {
  const label = t('nav.' + n.id);
  return h('button', { class: 'nav-item' + (active ? ' active' : ''), 'aria-current': active ? 'page' : null, dataset: { nav: n.id },
    title: translateUI('ui.shell_nav_shortcut', { label, shortcut: NAV.indexOf(n) + 1 }), onclick: () => go(navRoute(n)) },
  icon(n.icon), h('span', { class: 'label' }, label));
}

// Language: toolbar globe button with an accessible menu. Changing language re-renders the
// chrome and the current page; runs, notes, Box and open popouts are untouched.
export function languageButton(compact) {
  const cur = LANGS.find((l) => l.id === lang()) || LANGS[0];
  const btn = h('button', { class: 'icon-btn lang-btn', title: `${t('lang.menu')}: ${cur.native}`, 'aria-label': `${t('lang.menu')}: ${cur.native}`,
    'aria-haspopup': 'menu', onclick: (e) => languageMenu(e.currentTarget) }, icon('globe'), compact ? null : h('span', { class: 'lang-code' }, cur.id.toUpperCase()));
  return btn;
}
function languageMenu(anchor) {
  document.querySelectorAll('.menu').forEach((m) => m.remove());
  const r = anchor.getBoundingClientRect();
  const menu = h('div', { class: 'menu lang-menu', role: 'menu', style: { top: r.bottom + 4 + 'px', left: Math.max(8, Math.min(r.left, innerWidth - 280)) + 'px' } },
    LANGS.map((l) => h('button', { role: 'menuitemradio', 'aria-checked': String(l.id === lang()), class: l.id === lang() ? 'on' : null,
      onclick: async () => { menu.remove(); if (l.id === lang()) return; await saveSettings({ 'app.language': l.id }); } },
    h('span', { class: 'grow' }, l.native, l.native !== l.label ? h('span', { class: 'tiny muted' }, ' · ' + l.label) : null),
    l.status === 'beta' ? h('span', { class: 'badge unknown', title: t('lang.beta') }, translateUI('ui.shell_beta')) : null)),
    h('div', { class: 'sep' }), h('div', { class: 'tiny muted', style: { padding: '4px 10px', maxWidth: '260px' } }, t('lang.game_names')),
    h('button', { onclick: () => { menu.remove(); go('#/settings/language'); } }, '⋯ ' + t('nav.settings')));
  document.body.append(menu);
  const close = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', close); } };
  setTimeout(() => document.addEventListener('click', close), 0);
  menu.querySelector('button').focus();
  menu.addEventListener('keydown', (ev) => {
    const items = [...menu.querySelectorAll('button')]; const i = items.indexOf(document.activeElement);
    if (ev.key === 'Escape') { menu.remove(); anchor.focus(); }
    if (ev.key === 'ArrowDown') { ev.preventDefault(); items[(i + 1) % items.length].focus(); }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  });
}
function toolbarExtras(compact) {
  const tb = setting('app.toolbar') || ['language'];
  return [tb.includes('notes') ? h('button', { class: 'icon-btn', title: t('notes.new'), 'aria-label': t('notes.new'),
    onclick: () => openPopout('notes', '#/new') }, icon('note')) : null,
  tb.includes('language') ? languageButton(compact) : null];
}

export function renderChrome() {
  const vertical = setting('appearance.nav') !== 'horizontal';
  const r = parseRoute();
  const activeId = navIdFor(r);
  const gear = h('button', { class: 'icon-btn' + (r.page === 'settings' ? ' on' : ''), title: translateUI('ui.shell_settings_shortcut'), 'aria-label': translateUI('ui.settings'), dataset: { action: 'settings' },
    onclick: () => go('#/settings') }, icon('gear'));
  const brand = h('div', { class: 'brand' }, logo(28), h('div', { class: 'text' },
    h('div', { class: 'name' }, 'PokeMMO Companion')),
  vertical ? h('div', { class: 'brand-tools' }, toolbarExtras(true)) : null);
  mainEl = h('main', { class: 'main', id: 'main' });
  let shell;
  quickEl = h('div', { class: vertical ? 'quick' : 'quick-strip', role: 'list', 'aria-label': translateUI('ui.quick_access') });
  if (vertical) {
    shell = h('div', { class: 'app nav-vertical' },
      h('aside', { class: 'sidebar' }, brand, h('nav', { 'aria-label': translateUI('ui.shell_main_navigation') }, NAV.map((n) => navButton(n, n.id === activeId))),
        h('div', { class: 'quick-head' }, h('span', { class: 'label-text' }, t('nav.quick')),
          h('button', { class: 'icon-btn sm', title: translateUI('ui.shell_add_pin_hint'),
            'aria-label': translateUI('ui.shell_add_pin'), onclick: () => go('#/tools') }, icon('plus'))),
        quickEl,
        h('button', { class: 'nav-item' + (r.page === 'settings' ? ' active' : ''), dataset: { nav: 'settings' }, onclick: () => go('#/settings'), title: translateUI('ui.shell_settings_shortcut') },
          icon('gear'), h('span', { class: 'label' }, t('nav.settings')))),
      mainEl);
  } else {
    shell = h('div', { class: 'app nav-horizontal' },
      h('header', { class: 'topbar' }, brand, h('nav', { 'aria-label': translateUI('ui.shell_main_navigation') }, NAV.map((n) => navButton(n, n.id === activeId))),
        h('span', { class: 'grow' }), quickEl, toolbarExtras(false), gear),
      mainEl);
  }
  shell.dataset.nav = vertical ? 'vertical' : 'horizontal';
  mount(root, shell);
  applyNavCollapse();
  current = { page: null, mod: null };
  renderQuick();
  renderRoute();
}

function renderRoute() {
  // old links keep working: My guides moved from Tools to Guides
  if (/^#\/tools\/cguides(\/|\?|$)/.test(location.hash)) { location.replace(location.hash.replace('#/tools/cguides', '#/guides/mine')); return; }
  const r = parseRoute();
  const mod = PAGES[r.page];
  if (!mod) { go('#/home'); return; }
  // update active nav without rebuilding chrome
  const activeId = navIdFor(r);
  document.querySelectorAll('.nav-item').forEach((b) => {
    const on_ = b.dataset.nav === activeId;
    b.classList.toggle('active', on_); b.setAttribute('aria-current', on_ ? 'page' : 'false');
  });
  document.querySelectorAll('.topbar .icon-btn[data-action=settings]').forEach((b) => b.classList.toggle('on', r.page === 'settings'));
  if (current.mod && current.mod !== mod && current.mod.dispose) current.mod.dispose();
  const samePage = current.mod === mod && current.page === r.page;
  current = { page: r.page, mod };
  try {
    mod.render(mainEl, r, { samePage });
  } catch (e) {
    console.error(e);
    mount(mainEl, h('div', { class: 'page' }, h('div', { class: 'notice bad' }, translateUI('ui.ui_error', { message: e.message }))));
  }
  const title = NAV.find((n) => n.id === activeId) ? t('nav.' + activeId) : r.page === 'settings' ? t('nav.settings') : '';
  document.title = `${title} — PokeMMO Companion`;
  saveRoute(r.hash);
}

// --------------------------------------------------------------- popouts
export const POPOUT_TOOLS = {
  storyline: { title: 'Storyline', w: 380, h: 460 }, pokedex: { title: 'Pokédex', i18n: 'nav.pokedex', w: 420, h: 560 },
  reports: { title: 'Alpha & Swarm reports', w: 380, h: 480 }, phenomena: { title: 'Phenomena', w: 420, h: 520 }, typechart: { title: 'Type matchups', w: 420, h: 520 },
  breeding: { title: 'Breeding', w: 460, h: 600 }, legendaries: { title: 'Legendaries', w: 360, h: 380 },
  cave: { title: 'Altering Cave', w: 360, h: 380 }, natures: { title: 'Natures', w: 380, h: 520 },
  notes: { title: 'Notes', w: 420, h: 520, i18n: 'notes.title' }, items: { title: 'Item Library', w: 460, h: 600, i18n: 'items.title' },
  showcase: { title: 'Showcase', w: 520, h: 420, i18n: 'showcase.title' }, customguide: { title: 'Guide steps', w: 400, h: 520, i18n: 'cguide.title' },
  locations: { title: 'Locations', w: 480, h: 620, i18n: 'loc.title' }, box: { title: 'My Box', w: 480, h: 600, i18n: 'box.title' },
  calculator: { title: 'Calculator', w: 300, h: 420, i18n: 'calc.title' },
  timers: { title: 'Timers', w: 360, h: 480 },
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
  if (!win) toast(translateUI('ui.shell_popup_blocked'), { kind: 'warn' });
  else toast(translateUI('ui.shell_browser_window', { label: def.i18n ? t(def.i18n) : uiLabel(def.title) }), { timeout: 3200 });
}
export function popoutButton(tool, extraHash = '') {
  return h('button', { class: 'btn ghost small', title: translateUI('ui.shell_open_window'), onclick: () => openPopout(tool, extraHash) },
    icon('popout'), translateUI('ui.popout'));
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
  catch: { label: 'Catch calculator', icon: 'target', route: '#/tools/catch' },
  calculator: { label: 'Calculator', i18n: 'calc.title', icon: 'calc', route: '#/tools/calculator', popout: 'calculator' },
  timers: { label: 'Timers', icon: 'clock', route: '#/tools/timers', popout: 'timers' },
  items: { label: 'Item Library', i18n: 'items.title', icon: 'bag', route: '#/tools/items', popout: 'items' },
  notes: { label: 'Notes', i18n: 'notes.title', icon: 'note', route: '#/tools/notes', popout: 'notes' },
  box: { label: 'My Pokémon', i18n: 'collection.mine', icon: 'box', route: '#/collection', popout: 'box' },
  showcase: { label: 'Showcase', i18n: 'showcase.title', icon: 'sparkle', route: '#/collection/showcases', popout: 'showcase' },
  cguides: { label: 'My guides', i18n: 'cguide.title', icon: 'list', route: '#/guides/mine', popout: 'customguide' },
  locations: { label: 'Location explorer', i18n: 'loc.title', icon: 'map', route: '#/tools/locations', popout: 'locations' },
  links: { label: 'Websites & links', i18n: 'links.title', icon: 'external', route: '#/tools/links' },
};
const QA_PAGES = {
  pokedex: { label: 'Pokédex', icon: 'dex', route: '#/pokedex', popout: 'pokedex' },
  phenomena: { label: 'Phenomena', icon: 'live', route: '#/live/phenomena', popout: 'phenomena' },
  reports: { label: 'Alpha & Swarm reports', icon: 'live', route: '#/live/reports', popout: 'reports' },
  legendaries: { label: 'Legendaries', icon: 'crown', route: '#/live/legendaries', popout: 'legendaries' },
  cave: { label: 'Altering Cave', icon: 'crystal', route: '#/live/cave', popout: 'cave' },
  news: { label: 'Official updates', icon: 'book', route: '#/news' },
};
export function qaInfo(item) {
  if (item.kind === 'tool') { const x = QA_TOOLS[item.id]; return x ? { ...x, label: x.i18n ? t(x.i18n) : uiLabel(x.label) } : null; }
  if (item.kind === 'page') { const x = QA_PAGES[item.id]; return x ? { ...x, label: uiLabel(x.label) } : null; }
  if (item.kind === 'guide') return { label: t('ui.home_current_guide'), icon: 'guides', route: '#/guides/storyline?jump=1', popout: 'storyline' };
  if (item.kind === 'pokemon') {
    const sp = (state.dexCache || []).find((s) => s.id === Number(item.id));
    return { label: sp ? speciesLabel(sp.id, sp.name) : '#' + pad3(item.id), icon: 'dex', route: '#/pokedex/' + item.id, popout: 'pokedex',
      popoutHash: '#/species/' + item.id, sprite: sp && sp.icon };
  }
  return null;
}
const qaKey = (i) => i.kind + ':' + i.id;
export function isPinned(item) { return (setting('nav.quick_access') || []).some((x) => qaKey(x) === qaKey(item)); }
export async function pinToSidebar(item) {
  const list = [...(setting('nav.quick_access') || [])];
  if (list.some((x) => qaKey(x) === qaKey(item))) { toast(translateUI('ui.shell_already_pinned')); return; }
  const info = qaInfo(item);
  if (info && info.disabled) { toast(info.disabled, { kind: 'warn' }); return; }
  list.push({ kind: item.kind, id: item.id });
  await saveSettings({ 'nav.quick_access': list });
  renderQuick();
  toast(translateUI('ui.shell_pinned', { label: info?.label || item.id }));
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
  return h('button', { class: 'btn ghost' + (small ? ' small' : ''), title: pinned ? translateUI('ui.shell_remove_pin_hint') : translateUI('ui.shell_pin_hint'),
    onclick: async (e) => { const btn = e.currentTarget; if (isPinned(item)) await unpin(item); else await pinToSidebar(item);
      if (btn && btn.isConnected) btn.replaceWith(pinButton(item, small)); } }, icon('pin'), pinned ? translateUI('ui.shell_unpin') : translateUI('ui.shell_pin'));
}

function qaMenu(item, idx, anchor) {
  document.querySelectorAll('.menu').forEach((m) => m.remove());
  const info = qaInfo(item) || {};
  const r = anchor.getBoundingClientRect();
  const btn = (label, fn) => h('button', { onclick: () => { menu.remove(); fn(); } }, label);
  const menu = h('div', { class: 'menu', role: 'menu', style: { top: r.bottom + 2 + 'px', left: Math.min(r.left, innerWidth - 220) + 'px' } },
    btn(t('common.open'), () => go(info.route)),
    info.popout ? btn(translateUI('ui.shell_qa_popup'), () => openPopout(info.popout, info.popoutHash || '')) : null,
    h('div', { class: 'sep' }), btn(translateUI('ui.move_up'), () => moveQuick(idx, idx - 1)), btn(translateUI('ui.move_down'), () => moveQuick(idx, idx + 1)),
    h('div', { class: 'sep' }), btn(translateUI('ui.shell_remove_pin'), () => unpin(item)));
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
    const main = h('button', { class: 'qa-item' + (info.disabled ? ' disabled' : ''), title: info.disabled || translateUI('ui.shell_qa_controls', { label: info.label }),
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
      vertical && info.popout && !info.disabled ? h('button', { class: 'icon-btn sm qa-pop', title: translateUI('ui.shell_open_popout', { label: info.label }), 'aria-label': translateUI('ui.shell_popout_aria', { label: info.label }),
        onclick: () => openPopout(info.popout, info.popoutHash || '') }, icon('popout')) : null,
      vertical ? h('button', { class: 'icon-btn sm qa-more', title: translateUI('ui.shell_options'), 'aria-label': translateUI('ui.shell_options_aria', { label: info.label }), onclick: (e) => qaMenu(it, idx, e.currentTarget) }, icon('dots')) : null);
    return row;
  });
  mount(quickEl, items.length ? items : (vertical ? h('div', { class: 'qa-empty' }, t('nav.quick_empty')) : null));
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
