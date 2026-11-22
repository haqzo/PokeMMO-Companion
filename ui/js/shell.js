// Main window chrome, navigation and router.
import { h, mount, icon, logo, state, setting, saveSettings, on, reportToast, post, SHELL, TOKEN, toast, debounce, get } from './core.js';
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

let root, mainEl, current = { page: null, mod: null };

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
  document.addEventListener('settings-changed', () => { renderChrome(); });
  on('toast', (p) => reportToast(p, (id) => go(`#/live/reports/${id}`)));
  on('navigate', (d) => d && d.route && go(d.route));
  document.addEventListener('keydown', globalKeys);
  if (!setting('app.onboarded')) setTimeout(() => settingsPage.onboarding(), 300);
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
  if (vertical) {
    shell = h('div', { class: 'app nav-vertical' },
      h('aside', { class: 'sidebar' }, brand, h('nav', { 'aria-label': 'Main' }, NAV.map((n) => navButton(n, n.id === activeId))),
        h('div', { class: 'spacer' }),
        h('button', { class: 'nav-item' + (r.page === 'settings' ? ' active' : ''), dataset: { nav: 'settings' }, onclick: () => go('#/settings'), title: 'Settings (Ctrl+,)' },
          icon('gear'), h('span', { class: 'label' }, 'Settings'))),
      mainEl);
  } else {
    shell = h('div', { class: 'app nav-horizontal' },
      h('header', { class: 'topbar' }, brand, h('nav', { 'aria-label': 'Main' }, NAV.map((n) => navButton(n, n.id === activeId))),
        h('span', { class: 'grow' }), gear),
      mainEl);
  }
  shell.dataset.nav = vertical ? 'vertical' : 'horizontal';
  mount(root, shell);
  current = { page: null, mod: null };
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
export async function openPopout(tool, extraHash = '') {
  const def = POPOUT_TOOLS[tool];
  const mode = setting(`window.${tool}.mode`) || 'standard';
  if (SHELL === 'qt') {
    const res = await post('/api/shell/command', { action: 'open_popout', tool, mode, hash: extraHash });
    if (res.queued) return;
  }
  const url = `/?token=${encodeURIComponent(TOKEN)}&popout=${tool}&mode=${mode}&shell=browser${extraHash}`;
  const w = window.open(url, 'pmc-' + tool, `popup=yes,width=${def.w},height=${def.h}`);
  if (!w) toast('Your browser blocked the popout window. Allow popups for this page.', { kind: 'warn' });
  else toast(`${def.title} opened as a browser window. Pin / always-on-top needs the native shell.`, { timeout: 3200 });
}
export function popoutButton(tool, extraHash = '') {
  return h('button', { class: 'btn ghost small', title: 'Open as a separate window', onclick: () => openPopout(tool, extraHash) },
    icon('popout'), 'Pop out');
}
