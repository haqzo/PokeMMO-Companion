// Core helpers: API client, DOM builder, icons, live sync, toasts, dialogs, formatting.
import { applyTheme } from './themes.js';
const params = new URLSearchParams(location.search);
const tokenFromUrl = params.get('token');
if (tokenFromUrl) { try { sessionStorage.setItem('companion-token', tokenFromUrl); } catch (_) {} }
export const TOKEN = tokenFromUrl || (() => { try { return sessionStorage.getItem('companion-token'); } catch (_) { return null; } })();
export const POPOUT = params.get('popout');
export const SHELL = params.get('shell') || 'browser';
export const WINDOW_ID = (POPOUT ? 'popout-' + POPOUT : 'main') + '-' + Math.random().toString(36).slice(2, 7);
export const state = { boot: null, settings: {}, caps: {}, dexCache: null };

export class ApiError extends Error {}

export async function api(method, path, body) {
  const opts = { method, headers: { 'X-Companion-Token': TOKEN || '' } };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(path + (method !== 'GET' ? `${sep}origin=${WINDOW_ID}` : ''), opts);
  let data = null;
  try { data = await res.json(); } catch (_) { /* non-JSON */ }
  if (!res.ok) throw new ApiError((data && data.error) || `Request failed (${res.status})`);
  return data;
}
export const get = (p) => api('GET', p);
export const post = (p, b = {}) => api('POST', p, b);

// ------------------------------------------------------------------ DOM
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
      else if (k === 'style' && typeof v === 'object') setStyle(el, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}
/** Inline styles from an object. CSS custom properties ('--tc') must go through setProperty():
 *  Object.assign(el.style, {'--tc': …}) only sets a plain JS property and the variable never reaches CSS. */
export function setStyle(el, styles) {
  for (const [k, v] of Object.entries(styles)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('--')) el.style.setProperty(k, String(v));
    else el.style[k] = v;
  }
  return el;
}
function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const mount = (el, ...children) => { clear(el); append(el, children); return el; };

// ---------------------------------------------------------------- icons
const P = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  dex: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  tools: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z',
  live: 'M10 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14',
  guides: 'M5 21V4M5 4h12l-2.5 4 2.5 4H5',
  gear: 'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1',
  search: 'M4 11a7 7 0 1 0 14 0a7 7 0 1 0-14 0M21 21l-5-5',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z',
  popout: 'M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  pin: 'M9 3h6l-1 6 3 3H7l3-3zM12 12v9',
  close: 'M6 6l12 12M18 6L6 18', min: 'M5 12h14', back: 'M15 6l-6 6 6 6', chev: 'M9 6l6 6-6 6', down: 'M6 9l6 6 6-6',
  check: 'M5 12l5 5 9-10', info: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 8h.01M11 12h1v5h1',
  warn: 'M12 3l10 18H2zM12 10v4M12 17h.01', bell: 'M6 9a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0',
  filter: 'M3 5h18l-7 8v6l-4 2v-8z',
  play: 'M7 4.5v15l12-7.5z', lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3', opacity: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 3v18M12 8h7M12 12h9M12 16h7',
  layout: 'M4 4h16v16H4zM4 9h16M9 9v11', undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3', plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13', download: 'M12 3v12M7 10l5 5 5-5M4 21h16', upload: 'M12 21V9M7 14l5-5 5 5M4 3h16',
  egg: 'M12 3c4 0 7 7 7 11a7 7 0 0 1-14 0c0-4 3-11 7-11z', calc: 'M5 3h14v18H5zM8 7h8M8 12h2M14 12h2M8 16h2M14 16h2',
  shield: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z', team: 'M5 8a3 3 0 1 0 6 0a3 3 0 1 0-6 0M13 8a3 3 0 1 0 6 0a3 3 0 1 0-6 0M3 20c0-3 2-5 5-5s5 2 5 5M11 20c0-3 2-5 5-5s5 2 5 5',
  leaf: 'M5 19c0-8 6-14 15-14 0 9-6 15-14 15M5 19l7-7', crystal: 'M12 2l6 7-6 13-6-13zM6 9h12', crown: 'M3 8l4 4 5-7 5 7 4-4-2 11H5z',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7', book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM8 7h7M4 21h15',
  calendar: 'M4 5h16v16H4zM4 9h16M8 3v4M16 3v4', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  dots: 'M5 12h.01M12 12h.01M19 12h.01', target: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5', note: 'M5 3h10l4 4v14H5zM14 3v5h5M8 13h8M8 17h5',
  map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15', filter: 'M3 5h18l-7 8v6l-4 2v-8z', clock: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 7v5l3 2',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', fit: 'M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5M9 9h6v6H9z',
  globe: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18', note: 'M5 3h10l4 4v14H5zM15 3v4h4M8 12h8M8 16h6',
  bag: 'M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2', box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10', sparkle: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
  textsize: 'M4 18L9 6l5 12M6 14h6M15 18l3-7 3 7M16 16h4', archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4', list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01', minus: 'M5 12h14', bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
};
const ICON_TPL = new Map();
/** Inline SVG icon. Built once per name, then cloned (cheap when a page shows hundreds of them). */
export function icon(name, cls) {
  const key = P[name] ? name : 'dots';
  let tpl = ICON_TPL.get(key);
  if (!tpl) {
    tpl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    tpl.setAttribute('viewBox', '0 0 24 24');
    tpl.setAttribute('fill', 'none'); tpl.setAttribute('stroke', 'currentColor');
    tpl.setAttribute('stroke-width', '1.8'); tpl.setAttribute('stroke-linecap', 'round'); tpl.setAttribute('stroke-linejoin', 'round');
    tpl.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', P[key]);
    tpl.appendChild(p);
    ICON_TPL.set(key, tpl);
  }
  const svg = tpl.cloneNode(true);
  if (cls) svg.setAttribute('class', cls);
  return svg;
}
export function logo(size = 28) {
  const img = h('img', { src: 'img/pokeball.svg', width: size, height: size, alt: '' });
  return img;
}

// ------------------------------------------------------------ live sync
const handlers = {};
export function on(topic, fn) { (handlers[topic] ||= new Set()).add(fn); return () => handlers[topic].delete(fn); }
let es = null;
export function connectEvents() {
  if (es) return;
  es = new EventSource(`/api/events/stream?token=${encodeURIComponent(TOKEN || '')}`);
  es.onmessage = (m) => {
    let ev; try { ev = JSON.parse(m.data); } catch (_) { return; }
    for (const fn of handlers[ev.topic] || []) { try { fn(ev.data, ev); } catch (e) { console.error(e); } }
    for (const fn of handlers['*'] || []) { try { fn(ev.data, ev); } catch (e) { console.error(e); } }
  };
  es.onerror = () => { /* EventSource auto-reconnects */ };
}

// ------------------------------------------------------------- settings
export async function loadBoot() {
  state.boot = await get('/api/bootstrap');
  state.settings = state.boot.settings;
  state.caps = state.boot.capabilities;
  applyAppearance();
  return state.boot;
}
export function setting(key) { return state.settings[key]; }
export async function saveSettings(patch) {
  Object.assign(state.settings, patch);
  applyAppearance();
  const res = await api('PATCH', '/api/settings', patch);
  Object.assign(state.settings, res.applied);
  return res;
}
export function applyAppearance() {
  const s = state.settings, root = document.documentElement;
  let scale = (s['appearance.text_scale'] || 100) / 100;
  if (POPOUT) scale *= (s[`window.${POPOUT}.text_scale`] || 100) / 100;
  root.style.setProperty('--scale', String(scale));
  root.classList.toggle('high-contrast', !!s['appearance.high_contrast']);
  applyTheme(s['appearance.theme'], root, { highContrast: !!s['appearance.high_contrast'] });
  // Interface scale: the native shell zooms the whole page (Qt zoom factor, applied once on top of the desktop's
  // scaling). Browser mode uses CSS zoom on the main window. Popouts keep their own per-window scale.
  if (!POPOUT && SHELL !== 'qt') document.body && (document.body.style.zoom = String((s['appearance.ui_scale'] || 100) / 100));
  root.classList.toggle('reduced-motion', !!s['appearance.reduced_motion']);
  root.classList.toggle('stat-accent', s['appearance.stat_bars'] === 'accent');
  root.lang = ({ en: 'en', es: 'es', zh: 'zh-Hans' })[s['app.language'] || 'en'] || 'en';
  if (POPOUT) root.classList.toggle('text-outline', !!s[`window.${POPOUT}.text_outline`]);
  if (POPOUT) root.style.setProperty('--panel-alpha', String((s[`window.${POPOUT}.bg_opacity`] || 92) / 100));
  const stack = document.getElementById('toasts');
  if (stack) stack.className = 'toast-stack ' + (s['notify.toast_corner'] || 'bottom-right');
}

// ------------------------------------------------------------- toasts
export function toast(message, { kind = 'info', timeout = 3800, action } = {}) {
  const stack = document.getElementById('toasts');
  if (!stack) return;
  const close = h('button', { class: 'icon-btn', 'aria-label': 'Dismiss', onclick: () => el.remove() }, icon('close'));
  const el = h('div', { class: `toast msg ${kind}` },
    h('div', null, h('div', { class: 't-line', style: { color: 'var(--text-primary)' } }, message),
      action ? h('button', { class: 'btn small ghost', style: { marginTop: '4px' }, onclick: () => { action.fn(); el.remove(); } }, action.label) : null),
    close);
  stack.append(el);
  if (timeout) setTimeout(() => el.remove(), timeout);
}
on('external.open_failed', () => toast('Could not open your default browser.', { kind: 'warn' }));

export function reportToast(p, openFn) {
  // In-window custom toast (browser mode). Native shell shows its own frameless toast window.
  const stack = document.getElementById('toasts');
  if (!stack) return;
  const img = p.species_icon ? h('img', { class: 'pixel', src: p.species_icon, width: 36, height: 36, alt: '' }) : icon(p.kind === 'test' ? 'bell' : p.kind === 'timer' ? 'clock' : 'live');
  const el = h('div', { class: 'toast' + (p.is_test ? ' test' : ''), role: 'alert' },
    h('div', { class: 't-icon' }, img),
    h('div', null,
      h('div', { class: `kind-label kind-${p.kind}` }, p.is_test ? 'TEST · not a real report' : p.kind),
      h('div', { class: 't-title' }, p.title),
      p.line ? h('div', { class: 't-line' }, p.line) : null,
      h('div', { class: 't-meta' }, p.meta || ['Reported ', relTime(p.reported)]),
      h('div', { class: 'row', style: { marginTop: '6px' } },
        h('button', { class: 'btn small', onclick: () => { openFn && openFn(p.id, p); el.remove(); } }, p.open_label || 'Open in Live'))),
    h('button', { class: 'icon-btn', 'aria-label': 'Dismiss', onclick: () => el.remove() }, icon('close')));
  stack.append(el);
  while (stack.children.length > 4) stack.firstChild.remove();
  setTimeout(() => el.remove(), (p.duration || 8) * 1000);
}

// ------------------------------------------------------------- dialogs
export function modal({ title, body, actions = [], onClose, wide }) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const done = (v) => { back.remove(); document.removeEventListener('keydown', esc); if (prev && prev.focus) prev.focus(); onClose && onClose(v); resolve(v); };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
    const foot = h('div', { class: 'm-foot' }, actions.map((a) => h('button', {
      class: 'btn ' + (a.kind || ''), onclick: async () => { if (a.handler) { const r = await a.handler(); if (r === false) return; done(r === undefined ? a.value : r); } else done(a.value); },
    }, a.label)));
    const m = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: wide ? { width: 'min(760px,100%)' } : null },
      h('div', { class: 'm-head' }, h('h2', null, title), h('span', { class: 'grow' }),
        h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => done(null) }, icon('close'))),
      h('div', { class: 'm-body' }, body), actions.length ? foot : null);
    const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) done(null); } }, m);
    document.body.append(back);
    document.addEventListener('keydown', esc);
    const first = m.querySelector('input, select, textarea, .m-foot .btn.primary, .m-foot .btn');
    (first || m).focus && setTimeout(() => (first || m).focus(), 10);
  });
}
export const confirmDialog = (title, text, okLabel = 'Confirm', danger = false) =>
  modal({ title, body: h('p', { style: { margin: 0 } }, text), actions: [
    { label: 'Cancel', value: false, kind: 'ghost' }, { label: okLabel, value: true, kind: danger ? 'danger' : 'primary' }] });

// ----------------------------------------------------------- formatting
export function relTime(iso) {
  if (!iso) return 'unknown time';
  const d = new Date(iso); const s = (Date.now() - d.getTime()) / 1000;
  if (isNaN(s)) return iso;
  if (s < 0) { const f = -s; if (f < 86400) return `in ${Math.round(f / 3600)} h`; return `in ${Math.round(f / 86400)} days`; }
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 45) return `${Math.floor(s / 86400)} days ago`;
  return fmtDate(iso);
}
export function fmtDate(iso, withTime = false) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso);
  if (isNaN(d)) return iso;
  const o = { year: 'numeric', month: 'short', day: 'numeric' };
  if (withTime) Object.assign(o, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString(undefined, o);
}
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export const pad3 = (n) => String(n).padStart(3, '0');
// PokeMMO's battle chart uses these 17 types (no Fairy).
export const TYPE_LIST = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel'];
/** Type badge. Colour + readable label colour come from the .t-<type> class (tokens.css palette), not inline styles. */
export function typeChip(t, small) {
  const k = String(t || '').toLowerCase();
  return h('span', { class: `type-chip t-${TYPE_LIST.includes(k) ? k : 'unknown'}` + (small ? ' sm' : ''), dataset: { type: k } }, k);
}
export function typeChips(types, small) { return h('span', { class: 'row', style: { gap: '3px' } }, types.map((t) => typeChip(t, small))); }
const BADGE = { VERIFIED: 'verified', CORROBORATED: 'corroborated', DUMP_ONLY: 'dump', ESTIMATE: 'estimate', UNKNOWN: 'unknown', TEST: 'test',
  'official-via-research': 'corroborated', 'secondary-crosscheck': 'corroborated', 'official-direct': 'verified', 'COMMUNITY-CYCLE': 'dump',
  'outline-unverified': 'dump', 'imported-unverified': 'dump' };
const BADGE_LABEL = { DUMP_ONLY: 'Dump only', ESTIMATE: 'Estimate', 'official-via-research': 'Official source · via research', 'secondary-crosscheck': 'Official source · cross-checked',
  'official-direct': 'Official · read directly', 'COMMUNITY-CYCLE': 'Community cycle', 'outline-unverified': 'Outline · unverified', 'imported-unverified': 'Your import · unverified' };
export function badge(status, label, title) {
  return h('span', { class: 'badge ' + (BADGE[status] || 'unknown'), title: title || null }, label || BADGE_LABEL[status] || cap(String(status).toLowerCase()));
}
// Player-facing source information (2026-11-24 cleanup): the record keeps its provenance, but instead of a coloured
// technical badge the UI shows one discreet ⓘ button whose tooltip / click explains it in plain words.
const SOURCE_TEXT = { VERIFIED: 'Checked against an official PokeMMO source.', OFFICIAL: 'From an official PokeMMO source.',
  CORROBORATED: 'Confirmed by more than one independent source.', DUMP_ONLY: 'From the PokeMMO game data (client snapshot of 16 Nov 2026); not checked in game.',
  REPORTED: 'Reported by players; not confirmed.', ESTIMATE: 'An estimate, not an exact value.', LOCAL: 'From your own files.',
  'official-direct': 'Read directly from the official post.', 'official-via-research': 'Summarised from the official post.',
  'secondary-crosscheck': 'From the official post, cross-checked with a second source.', 'COMMUNITY-CYCLE': 'Community-documented cycle; not confirmed in game.',
  'outline-unverified': 'A milestone outline; not yet checked step by step.', 'imported-unverified': 'Your own import; not checked.' };
export function sourceText(status) { return SOURCE_TEXT[status] || ''; }
export function sourceInfo(status, extra) {
  const text = [SOURCE_TEXT[status] || '', extra || ''].filter(Boolean).join(' ');
  if (!text) return null;
  return h('button', { class: 'src-info', type: 'button', title: text, 'aria-label': 'Source: ' + text, dataset: { source: status || '' },
    onclick: (e) => { e.stopPropagation(); toast(text, { timeout: 6000 }); } }, icon('info'));
}
export function notice(kind, ...content) {
  return h('div', { class: 'notice ' + kind }, icon(kind === 'warn' || kind === 'bad' ? 'warn' : 'info'), h('div', null, ...content));
}
export function spriteOrFallback(url, sp, size = 72, eager = false) {
  if (url) {
    const img = h('img', { class: 'pixel', src: url, width: size, height: size, alt: sp.name, loading: eager ? 'eager' : 'lazy', decoding: 'async' });
    img.addEventListener('error', () => img.replaceWith(silhouette(sp, size)));
    return img;
  }
  return silhouette(sp, size);
}
/* ---------------------------------------------------------------- sprite sizing
 * ONE size rule for the Pokédex grid, the Summary popup and the popouts (docs/build/14).
 * The server gives every species a size tier from its real height (your installed dump), with ALL Legendary and
 * Mythical Pokémon in the large tier:  xs < 0.5 m · s < 0.9 m · m < 1.5 m · l ≥ 1.5 m (or Legendary/Mythical).
 * The tier sets how much of the frame's shorter side the Pokémon's VISIBLE outline may take; transparent margins
 * don't count. Art is never stretched (one scale for both axes), never enlarged past 4×, never shown below its
 * native size unless that is needed to fit, and the outline always stays inside the frame.
 * Forms use their parent's tier; shiny art uses the same tier as normal art. */
export const SIZE_TIER_FILL = { xs: 0.4, s: 0.55, m: 0.74, l: 0.94 };
export const MAX_UPSCALE = 4;   // pixel art is never blown up more than 4× (a tiny sprite then sits a little below its tier)
export function fitSprite(w, ht, bbox, tier, frameW, frameH) {
  const [x0, y0, x1, y1] = bbox && bbox.length === 4 ? bbox : [0, 0, w, ht];
  const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
  const target = (SIZE_TIER_FILL[tier] || SIZE_TIER_FILL.m) * Math.min(frameW, frameH);
  // tier size, but never below native size (only shrink to fit the frame) and never above MAX_UPSCALE
  const k = Math.max(0.05, Math.min(Math.max(target / Math.max(bw, bh), 1), frameW / bw, frameH / bh, MAX_UPSCALE));
  return { k, width: w * k, height: ht * k, left: (frameW - bw * k) / 2 - x0 * k, top: (frameH - bh * k) / 2 - y0 * k,
    // large or whole-number scales stay pixel-sharp; small in-between scales are smoothed instead of jagged
    smooth: k < 2 && Math.abs(k - Math.round(k)) > 0.01 };
}
function placeSprite(img, box, f) {
  Object.assign(img.style, { width: f.width.toFixed(1) + 'px', height: f.height.toFixed(1) + 'px', left: f.left.toFixed(1) + 'px', top: f.top.toFixed(1) + 'px' });
  box.classList.toggle('smooth', f.smooth);
  box.dataset.scale = f.k.toFixed(3);
}
/** Grid/row sprite in a size×size frame. With `still` ({url, w, h, bbox}) the size is known before loading. */
export function sizedSprite(sp, size, { still = null, url = null, tier = 'm', eager = false, ani = null } = {}) {
  if (ani) {   // animated Gen V sprite (already cropped to the Pokémon), fitted by the same size rule
    const img = h('img', { src: ani, alt: sp.name, decoding: 'async', style: { visibility: 'hidden' } });
    const box = h('div', { class: 'still-art', style: { width: size + 'px', height: size + 'px' }, dataset: { tier } }, img);
    img.addEventListener('load', () => { placeSprite(img, box, fitSprite(img.naturalWidth, img.naturalHeight, null, tier, size, size)); img.style.visibility = ''; });
    img.addEventListener('error', () => box.replaceWith(sizedSprite(sp, size, { still, url, tier, eager })));
    return box;
  }
  const src = still ? still.url : url;
  if (!src) return silhouette(sp, size);
  const img = h('img', { src, alt: sp.name, loading: eager ? 'eager' : 'lazy', decoding: 'async' });
  const box = h('div', { class: 'still-art', style: { width: size + 'px', height: size + 'px' }, dataset: { tier } }, img);
  if (still) placeSprite(img, box, fitSprite(still.w, still.h, still.bbox, tier, size, size));
  else {
    img.style.visibility = 'hidden';
    img.addEventListener('load', () => { placeSprite(img, box, fitSprite(img.naturalWidth, img.naturalHeight, null, tier, size, size)); img.style.visibility = ''; });
  }
  img.addEventListener('error', () => box.replaceWith(silhouette(sp, size)));
  return box;
}
/** Report rows and Home tiles (not part of the Pokédex size system): a still trimmed to its outline, enlarged at most `cap`×. */
export function stillArt(still, sp, size = 72, { cap = 1.5, eager = false } = {}) {
  const [x0, y0, x1, y1] = still.bbox || [0, 0, still.w, still.h];
  const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
  const k = Math.min(size / Math.max(bw, bh), cap);
  const img = h('img', { src: still.url, alt: sp.name, loading: eager ? 'eager' : 'lazy', decoding: 'async' });
  const box = h('div', { class: 'still-art', style: { width: size + 'px', height: size + 'px' } }, img);
  placeSprite(img, box, { k, width: still.w * k, height: still.h * k, left: (size - bw * k) / 2 - x0 * k, top: (size - bh * k) / 2 - y0 * k,
    smooth: Math.abs(k - Math.round(k)) > 0.01 });
  img.addEventListener('error', () => box.replaceWith(silhouette(sp, size)));
  return box;
}
export function silhouette(sp, size = 60) {
  const t = (sp.types && sp.types[0]) || 'normal';
  return h('div', { class: `silhouette t-${t}`, style: { '--tc': `var(--type-${t})`, width: size * 0.83 + 'px', height: size * 0.83 + 'px' },
    title: 'No sprite available for this Pokémon' }, '#' + pad3(sp.id));
}
export function extLink(url, label) {
  return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, label || url, ' ', icon('external', 'inline-ic'));
}
export function debounce(fn, ms = 200) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export function seg(options, value, onChange, label) {
  const wrap = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label || null });
  for (const [v, text] of options) {
    wrap.append(h('button', { class: v === value ? 'active' : '', role: 'radio', 'aria-checked': String(v === value),
      onclick: () => { [...wrap.children].forEach((b) => { b.classList.remove('active'); b.setAttribute('aria-checked', 'false'); });
        const btn = wrap.children[options.findIndex((o) => o[0] === v)]; btn.classList.add('active'); btn.setAttribute('aria-checked', 'true'); onChange(v); } }, text));
  }
  return wrap;
}
export function tabs(items, active, onSelect, label) {
  const bar = h('div', { class: 'tabs', role: 'tablist', 'aria-label': label || null });
  for (const it of items) {
    bar.append(h('button', { class: 'tab' + (it.id === active ? ' active' : ''), role: 'tab', 'aria-selected': String(it.id === active),
      onclick: () => onSelect(it.id) }, it.label, it.count !== undefined ? h('span', { class: 'count' }, it.count) : null));
  }
  return bar;
}
export function switchEl(checked, onChange, label) {
  const input = h('input', { type: 'checkbox', checked, onchange: (e) => onChange(e.target.checked) });
  return h('label', { class: 'switch' }, input, label ? h('span', null, label) : null);
}
