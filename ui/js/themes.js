// Themes (2026-11-24): six built-in presets + Custom, applied as CSS variables on <html>. A theme is data only —
// colours, numbers and choices checked on the server (companion/services/themes.py); nothing here ever inserts
// CSS text, URLs or scripts. Companion Default with no changes sets nothing, so tokens.css stays the source of the
// approved look. High contrast wins over theme colours (it is an accessibility setting).
import { state } from './core.js';

export const COLOR_GROUPS = [
  ['Surfaces', [['bg_app', 'App background'], ['sidebar', 'Sidebar'], ['panel', 'Panels'], ['header', 'Headers'], ['card', 'Cards'],
    ['elevated', 'Raised controls'], ['inset', 'Insets'], ['dialog', 'Dialogs'], ['input', 'Inputs'], ['popout', 'Popouts'], ['notification', 'Notifications']]],
  ['Text', [['text', 'Primary text'], ['text2', 'Secondary text'], ['muted', 'Muted text'], ['on_accent', 'Text on accent'], ['link', 'Links']]],
  ['Accent & states', [['accent', 'Accent'], ['focus', 'Focus ring'], ['selected', 'Selected'], ['hover', 'Hover'],
    ['success', 'Success'], ['warning', 'Warning'], ['error', 'Error']]],
  ['Buttons', [['button', 'Button'], ['button_text', 'Button text'], ['button_hover', 'Button hover']]],
  ['Borders', [['border', 'Border'], ['border_strong', 'Strong border'], ['popout_border', 'Popout border']]],
  ['Tables & progress', [['table_head', 'Table header'], ['table_row', 'Table row'], ['table_row_alt', 'Alternate row'], ['table_hover', 'Row hover'],
    ['progress_track', 'Progress track'], ['progress_fill', 'Progress fill']]],
  ['Scrollbars', [['scroll_track', 'Scrollbar track'], ['scroll_thumb', 'Scrollbar thumb']]],
];
/** Colours where an opacity slider makes sense (stored as #rrggbbaa). */
export const OPACITY_KEYS = new Set(['selected', 'hover', 'border', 'border_strong', 'scroll_thumb', 'table_hover', 'table_row_alt']);
export const TYPES = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel'];
/** Pairs checked for readability: [foreground, background, label, minimum ratio]. */
export const CONTRAST = [['text', 'panel', 'Primary text on panels', 4.5], ['text', 'card', 'Primary text on cards', 4.5], ['text2', 'panel', 'Secondary text on panels', 4.5],
  ['muted', 'panel', 'Muted text on panels', 3], ['on_accent', 'accent', 'Text on accent buttons', 4.5], ['link', 'panel', 'Links on panels', 4.5],
  ['button_text', 'button', 'Button text', 4.5], ['text', 'input', 'Text in inputs', 4.5], ['text', 'sidebar', 'Sidebar text', 4.5]];

const VARS = {
  bg_app: ['--bg-app'], sidebar: ['--bg-sidebar'], panel: ['--bg-window'], header: ['--bg-header'], card: ['--bg-card'], elevated: ['--bg-elevated', '--bg-label'],
  inset: ['--bg-inset'], dialog: ['--bg-dialog'], input: ['--bg-control'], notification: ['--bg-toast'],
  text: ['--text-primary'], text2: ['--text-secondary'], muted: ['--text-muted', '--stat-total', '--st-unknown'], on_accent: ['--text-on-accent'], link: ['--link'],
  accent: ['--accent'], focus: ['--focus'], selected: ['--bg-selected'], hover: ['--bg-hover'], success: ['--good'], warning: ['--warn'], error: ['--danger'],
  button: ['--bg-button'], button_text: ['--btn-text'], button_hover: ['--btn-hover', '--card-hover'], border: ['--border-subtle'], border_strong: ['--border-strong'],
  table_head: ['--table-head'], table_row: ['--table-row'], table_row_alt: ['--table-row-alt'], table_hover: ['--table-hover'],
  progress_track: ['--progress-track'], progress_fill: ['--progress-fill'], scroll_track: ['--scroll-track'], scroll_thumb: ['--scroll-thumb'],
};
const DERIVED = ['--accent-soft', '--accent-ring', '--focus-ring', '--bg-popout-rgb', '--bg-popout-bar-rgb', '--popout-border-rgb', '--radius-sm', '--radius', '--radius-lg',
  '--bw', '--card-pad', '--grid-gap', '--section-gap', '--nav-w', '--scroll-w', '--weight', '--cell-pad', '--sp-1', '--sp-2', '--sp-3', '--sp-4', '--sp-5', '--sp-6'];
const ALL_VARS = [...new Set([...Object.values(VARS).flat(), ...DERIVED, ...TYPES.map((t) => '--type-' + t)])];

export const catalog = () => (state.boot && state.boot.themes) || null;
export const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;

export function rgb(hex) {
  const v = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
}
export function alphaOf(hex) { return hex.length === 9 ? Math.round(parseInt(hex.slice(7), 16) / 2.55) : 100; }
export function withAlpha(hex, pct) {
  const base = hex.slice(0, 7);
  return pct >= 100 ? base : base + Math.round(Math.max(0, pct) * 2.55).toString(16).padStart(2, '0');
}
function lum(hex) {
  return rgb(hex).map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; })
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
}
/** WCAG contrast ratio of two opaque colours (alpha ignored). */
export function contrast(a, b) {
  const [x, y] = [lum(a.slice(0, 7)), lum(b.slice(0, 7))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** The full set of values for a theme: preset base + the theme's own changes + defaults. */
export function resolve(theme, cat = catalog()) {
  if (!cat) return null;
  const t = theme || {};
  const base = cat.presets[t.base] ? t.base : cat.default;
  return {
    base, name: t.name || cat.presets[base].name,
    colors: { ...cat.presets[base].colors, ...(t.colors || {}) },
    types: { ...cat.type_colors, ...(t.types || {}) },
    shape: { ...cat.shape_defaults, ...(t.shape || {}) },
    layout: { ...cat.layout_defaults, ...(t.layout || {}) },
  };
}
const empty = (o) => !o || !Object.keys(o).length;
/** True when nothing differs from the untouched Companion Default. */
export function isPristineDefault(theme, cat = catalog()) {
  return !theme || ((!theme.base || theme.base === (cat && cat.default)) && empty(theme.colors) && empty(theme.types) && empty(theme.shape) && empty(theme.layout));
}

const DENSITY = { compact: 0.75, standard: 1, comfortable: 1.2 };
const SCROLL_W = { thin: 6, standard: 10, wide: 14, hidden: 0 };
const WEIGHT = { light: 300, normal: 400, medium: 500 };
const CELL = { compact: '3px 8px', standard: '6px 10px', comfortable: '9px 12px' };

export function applyTheme(theme, root = document.documentElement, { highContrast = false } = {}) {
  const cat = catalog();
  for (const v of ALL_VARS) root.style.removeProperty(v);
  root.classList.remove('themed', 'themed-scroll', 'no-scrollbars');
  if (!cat || isPristineDefault(theme, cat)) return;
  const r = resolve(theme, cat);
  const set = (k, v) => root.style.setProperty(k, String(v));
  root.classList.add('themed');
  if (!highContrast) {
    const borderPct = r.shape.border_opacity;
    for (const [k, vars] of Object.entries(VARS)) {
      let c = r.colors[k];
      if (!c || !HEX.test(c)) continue;
      if ((k === 'border' || k === 'border_strong') && borderPct < 100) c = withAlpha(c, Math.round(alphaOf(c) * borderPct / 100));
      vars.forEach((v) => set(v, c));
    }
    const a = rgb(r.colors.accent), f = rgb(r.colors.focus);
    set('--accent-soft', `rgba(${a.join(', ')}, .10)`); set('--accent-ring', `rgba(${a.join(', ')}, .55)`); set('--focus-ring', `rgba(${f.join(', ')}, .35)`);
    set('--bg-popout-rgb', rgb(r.colors.popout).join(', ')); set('--bg-popout-bar-rgb', rgb(r.colors.header).join(', '));
    set('--popout-border-rgb', rgb(r.colors.popout_border).join(', '));
    for (const t of TYPES) if (HEX.test(r.types[t] || '')) set('--type-' + t, r.types[t]);
  }
  const rad = r.shape.radius;
  set('--radius-sm', Math.round(rad * 0.67) + 'px'); set('--radius', rad + 'px'); set('--radius-lg', Math.round(rad * 1.5) + 'px');
  set('--bw', (r.shape.border_visible ? r.shape.border_width : 0) + 'px');
  const d = DENSITY[r.layout.density] || 1;
  [4, 8, 12, 16, 24, 32].forEach((px, i) => set(`--sp-${i + 1}`, Math.round(px * d) + 'px'));
  set('--card-pad', r.layout.card_padding + 'px'); set('--grid-gap', r.layout.grid_gap + 'px'); set('--section-gap', r.layout.section_gap + 'px');
  set('--nav-w', r.layout.sidebar_width + 'px'); set('--weight', WEIGHT[r.layout.font_weight] || 400);
  set('--cell-pad', CELL[r.layout.table_density] || CELL.standard);
  if (r.layout.scrollbar === 'hidden') root.classList.add('no-scrollbars');
  else { root.classList.add('themed-scroll'); set('--scroll-w', SCROLL_W[r.layout.scrollbar] + 'px'); }
}

/** Readability problems of a resolved theme: [{label, ratio, min}] below the minimum. */
export function contrastIssues(resolved) {
  const c = resolved.colors, out = [];
  for (const [fg, bg, label, min] of CONTRAST) {
    if (!HEX.test(c[fg] || '') || !HEX.test(c[bg] || '')) continue;
    const ratio = contrast(c[fg], c[bg]);
    if (ratio < min) out.push({ fg, bg, label, ratio: Math.round(ratio * 10) / 10, min });
  }
  return out;
}

/** Export file: the validated theme plus format/version, never anything else. */
export function exportDoc(theme) {
  const cat = catalog();
  const r = theme || { base: cat.default };
  return { format: 'pokemmo-companion-theme', version: 1, name: r.name || cat.presets[r.base || cat.default].name, base: r.base || cat.default,
    colors: r.colors || {}, types: r.types || {}, shape: r.shape || {}, layout: r.layout || {}, exported_at: new Date().toISOString() };
}
