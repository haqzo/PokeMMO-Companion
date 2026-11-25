import { uiLabel, t as translateUI } from '../i18n.js';
// Settings › Appearance & themes, Layout & scaling, Home (2026-11-24).
import { h, mount, get, post, api, state, saveSettings, seg, switchEl, toast, confirmDialog, modal, debounce, applyAppearance, icon } from '../core.js';
import { downloadJson, pickJsonFile } from '../components.js';
import { COLOR_GROUPS, OPACITY_KEYS, TYPES, HEX, catalog, resolve, applyTheme, contrastIssues, exportDoc, alphaOf, withAlpha, isPristineDefault } from '../themes.js';
import { gameTerm } from '../game-locale.js';
import { HOME_SECTIONS, HOME_DEFAULT, homeSections } from './home.js';

const row = (label, desc, control) => h('div', { class: 'set-row' }, h('div', null, h('div', { style: { fontWeight: 600 } }, label), desc ? h('div', { class: 'desc' }, desc) : null), h('div', null, control));
const THEME_LABEL_KEYS = {
  "Surfaces": "theme.label_surfaces",
  "App background": "theme.label_app_background",
  "Sidebar": "theme.label_sidebar",
  "Panels": "theme.label_panels",
  "Headers": "theme.label_headers",
  "Cards": "theme.label_cards",
  "Raised controls": "theme.label_raised",
  "Insets": "theme.label_insets",
  "Dialogs": "theme.label_dialogs",
  "Inputs": "theme.label_inputs",
  "Popouts": "theme.label_popouts",
  "Notifications": "theme.label_notifications",
  "Text": "theme.label_text",
  "Primary text": "theme.label_primary",
  "Secondary text": "theme.label_secondary",
  "Muted text": "theme.label_muted",
  "Text on accent": "theme.label_on_accent",
  "Links": "theme.label_links",
  "Accent & states": "theme.label_accent_states",
  "Accent": "theme.label_accent",
  "Focus ring": "theme.label_focus",
  "Selected": "theme.label_selected",
  "Hover": "theme.label_hover",
  "Success": "theme.label_success",
  "Warning": "theme.label_warning",
  "Error": "theme.label_error",
  "Buttons": "theme.label_buttons",
  "Button": "theme.label_button",
  "Button text": "theme.label_button_text",
  "Button hover": "theme.label_button_hover",
  "Borders": "theme.label_borders",
  "Border": "theme.label_border",
  "Strong border": "theme.label_strong_border",
  "Popout border": "theme.label_popout_border",
  "Tables & progress": "theme.label_tables_progress",
  "Table header": "theme.label_table_header",
  "Table row": "theme.label_table_row",
  "Alternate row": "theme.label_alternate_row",
  "Row hover": "theme.label_row_hover",
  "Progress track": "theme.label_progress_track",
  "Progress fill": "theme.label_progress_fill",
  "Scrollbars": "theme.label_scrollbars",
  "Scrollbar track": "theme.label_scroll_track",
  "Scrollbar thumb": "theme.label_scroll_thumb",
  "Primary text on panels": "theme.label_primary_panels",
  "Primary text on cards": "theme.label_primary_cards",
  "Secondary text on panels": "theme.label_secondary_panels",
  "Muted text on panels": "theme.label_muted_panels",
  "Text on accent buttons": "theme.label_accent_buttons",
  "Links on panels": "theme.label_links_panels",
  "Text in inputs": "theme.label_text_inputs",
  "Sidebar text": "theme.label_sidebar_text"
};
const themeLabel = (label) => THEME_LABEL_KEYS[label] ? translateUI(THEME_LABEL_KEYS[label]) : label;
const changed = () => document.dispatchEvent(new CustomEvent('settings-changed'));

// ------------------------------------------------------------------ theme state
/** Drop values equal to the base preset / defaults, so a theme only stores what the player changed. */
export function normalize(theme) {
  const cat = catalog();
  const base = cat.presets[theme.base] ? theme.base : cat.default;
  const p = cat.presets[base];
  const strip = (obj, ref) => Object.fromEntries(Object.entries(obj || {}).filter(([k, v]) => ref[k] !== v));
  return { name: theme.name || p.name, base, colors: strip(theme.colors, p.colors), types: strip(theme.types, cat.type_colors),
    shape: strip(theme.shape, cat.shape_defaults), layout: strip(theme.layout, cat.layout_defaults) };
}
const current = () => normalize(state.settings['appearance.theme'] || { base: catalog().default });
const currentId = () => state.settings['appearance.theme_id'] || catalog().default;
const saveSoon = debounce((theme, id) => saveSettings({ 'appearance.theme': isPristineDefault(theme) ? null : theme, 'appearance.theme_id': id })
  .catch((e) => toast(e.message, { kind: 'warn' })), 250);
/** Apply now (this window), save shortly after (every other window follows through the settings event). */
export function commitTheme(theme, id = currentId()) {
  const t = normalize(theme);
  state.settings['appearance.theme'] = isPristineDefault(t) ? null : t;
  state.settings['appearance.theme_id'] = id;
  applyAppearance();
  saveSoon(t, id);
  return t;
}
const sameTheme = (a, b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
const changeCount = (t) => Object.keys(t.colors).length + Object.keys(t.types).length;

function swatches(colors) {
  return h('div', { class: 'theme-swatches', 'aria-hidden': 'true' },
    ['bg_app', 'panel', 'card', 'button', 'accent', 'link', 'success', 'error'].map((k) => h('span', { style: { background: colors[k] } })),
    h('span', { class: 'sw-text', style: { background: colors.panel, color: colors.text } }, 'Aa'));
}

// ------------------------------------------------------------ appearance & themes
export async function appearanceSec(b, { personal } = {}) {
  const cat = catalog();
  if (!cat) { b.append(h('p', null, translateUI('ui.b272_settings_092'))); return; }
  personal = personal || (await get('/api/themes')).personal;
  const s = state.settings;
  const redraw = (p = personal) => { mount(b); appearanceSec(b, { personal: p }); };
  const theme = current(), id = currentId();
  const mine = personal.find((p) => p.id === id);
  const savedRef = mine || { base: cat.presets[id] ? id : theme.base };
  const modified = !sameTheme({ ...theme, shape: {}, layout: {}, name: '' }, { ...savedRef, shape: {}, layout: {}, name: '' });
  const resolved = resolve(theme);
  const activeName = mine ? mine.name : cat.presets[id] ? cat.presets[id].name : theme.name;

  const withLayout = (t) => ({ ...t, shape: t.shape ?? theme.shape, layout: t.layout ?? theme.layout });
  const pick = (t, newId) => { commitTheme(withLayout(t), newId); redraw(); };
  const preview = (t) => applyTheme(t, document.documentElement, { highContrast: !!s['appearance.high_contrast'] });
  const unpreview = () => applyAppearance();
  const card = (key, t, label, sub, isActive) => h('button', {
    class: 'theme-card' + (isActive ? ' active' : ''), 'aria-pressed': isActive ? 'true' : 'false', dataset: { theme: key },
    onclick: () => pick(t, key), onmouseenter: () => preview(withLayout(t)), onmouseleave: unpreview, title: translateUI('ui.b272_settings_093') },
    swatches(resolve(t).colors), h('div', { class: 'theme-name' }, label), h('div', { class: 'tiny muted' }, sub));

  const presetCards = cat.order.map((k) => card(k, { base: k, name: cat.presets[k].name }, cat.presets[k].name,
    k === cat.default ? translateUI('theme.default') : cat.sources[k] ? translateUI('theme.builtin_source', { source: k === 'catppuccin-mocha' ? 'Catppuccin' : 'enkia' }) : translateUI('theme.builtin'), id === k));
  const customCard = h('button', { class: 'theme-card custom' + (modified && !mine ? ' active' : ''), onclick: () => b.querySelector('#theme-editor')?.scrollIntoView({ behavior: 'smooth' }) },
    swatches(resolved.colors), h('div', { class: 'theme-name' }, translateUI('theme.custom')), h('div', { class: 'tiny muted' }, translateUI('ui.b272_settings_094')));
  const personalCards = personal.map((p) => card(p.id, p, p.name, translateUI('theme.yours', { name: cat.presets[p.base]?.name || translateUI('theme.default') }), id === p.id));

  // ---- actions
  const askName = async (title, value) => {
    const inp = h('input', { class: 'input', value: value || '', maxlength: 40, 'aria-label': translateUI('ui.b272_settings_095') });
    const r = await modal({ title, body: h('div', { class: 'field' }, h('label', null, translateUI('ui.name')), inp), actions: [
      { label: translateUI('ui.cancel'), value: null, kind: 'ghost' }, { label: translateUI('ui.save'), kind: 'primary', handler: () => inp.value.trim() || false }] });
    return r;
  };
  const saveNew = async (t, name) => {
    try {
      const res = await post('/api/themes', { ...t, name });
      commitTheme(res, res.id); toast(translateUI('theme.saved', { name: res.name }));
      redraw((await get('/api/themes')).personal);
    } catch (e) { toast(e.message, { kind: 'warn' }); }
  };
  const actions = h('div', { class: 'row wrap tight' },
    h('button', { class: 'btn small', onclick: async () => { const n = await askName(translateUI('ui.b272_settings_096'), modified ? translateUI('theme.custom_name', { name: activeName }) : translateUI('theme.copy_name', { name: activeName })); if (n) saveNew(theme, n); } }, translateUI('ui.b272_settings_097')),
    mine && modified ? h('button', { class: 'btn small primary', onclick: async () => {
      try { const res = await api('PUT', '/api/themes/' + mine.id, { ...theme, name: mine.name }); commitTheme(res, mine.id); toast(translateUI('ui.b272_settings_098')); redraw((await get('/api/themes')).personal); }
      catch (e) { toast(e.message, { kind: 'warn' }); } } }, translateUI('ui.b272_settings_099')) : null,
    modified ? h('button', { class: 'btn small ghost', onclick: () => { commitTheme({ ...savedRef, shape: theme.shape, layout: theme.layout }, id); redraw(); } }, translateUI('ui.b272_settings_100')) : null,
    mine ? h('button', { class: 'btn small ghost', onclick: async () => { const n = await askName(translateUI('ui.b272_settings_101'), mine.name); if (!n) return;
      try { const res = await api('PUT', '/api/themes/' + mine.id, { ...mine, name: n }); commitTheme({ ...theme, name: res.name }, mine.id); redraw((await get('/api/themes')).personal); } catch (e) { toast(e.message, { kind: 'warn' }); } } }, translateUI('ui.rename')) : null,
    mine ? h('button', { class: 'btn small ghost', onclick: () => saveNew(mine, translateUI('theme.copy_name', { name: mine.name }).slice(0, 40)) }, translateUI('ui.duplicate')) : null,
    mine ? h('button', { class: 'btn small ghost', onclick: async () => {
      if (!await confirmDialog(translateUI('ui.b272_settings_102'), translateUI('theme.delete_confirm', { name: mine.name }), translateUI('ui.delete'), true)) return;
      await api('DELETE', '/api/themes/' + mine.id); commitTheme({ ...theme }, mine.base); redraw((await get('/api/themes')).personal); } }, translateUI('ui.delete')) : null,
    h('span', { class: 'grow' }),
    h('button', { class: 'btn small ghost', onclick: async () => {
      let raw; try { raw = await pickJsonFile(); } catch (e) { toast(e.message, { kind: 'warn' }); return; }
      if (!raw) return;
      try {
        const v = await post('/api/themes/validate', raw);
        if (v.dropped.length) toast(translateUI('theme.import_skipped', { count: v.dropped.length, values: v.dropped.slice(0, 4).join(', ') + (v.dropped.length > 4 ? '…' : '') }), { kind: 'warn', timeout: 7000 });
        await saveNew(v.theme, v.theme.name);
      } catch (e) { toast(translateUI('theme.import_error', { error: e.message }), { kind: 'warn', timeout: 6000 }); }
    } }, icon('upload'), translateUI('ui.import_more')),
    h('button', { class: 'btn small ghost', onclick: () => downloadJson(`companion-theme-${(activeName || 'theme').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`, exportDoc({ ...theme, name: activeName })) }, icon('download'), translateUI('ui.export')),
    id !== cat.default || !isPristineDefault(theme) ? h('button', { class: 'btn small ghost', onclick: async () => {
      if (await confirmDialog(translateUI('ui.b272_settings_103'), translateUI('ui.b272_settings_104'))) {
        commitTheme({ base: cat.default }, cat.default); redraw(); } } }, translateUI('ui.b272_settings_103')) : null);

  // ---- colour editor
  const issues = contrastIssues(resolved);
  const colorRow = (key, label, value, baseValue, onSet) => {
    const hex = h('input', { class: 'input mono hex-in', value, maxlength: 9, 'aria-label': translateUI('theme.hex_label', { label }), spellcheck: 'false' });
    const pickEl = h('input', { type: 'color', value: value.slice(0, 7), 'aria-label': translateUI('theme.colour_label', { label }) });
    const op = OPACITY_KEYS.has(key) ? h('input', { type: 'range', min: 0, max: 100, step: 5, value: alphaOf(value), 'aria-label': translateUI('theme.opacity_label', { label }), title: translateUI('ui.opacity') }) : null;
    const err = h('span', { class: 'tiny bad-text', role: 'alert' });
    const put = (v) => { err.textContent = ''; hex.classList.remove('invalid'); onSet(v); };
    pickEl.addEventListener('input', () => { const v = op ? withAlpha(pickEl.value, Number(op.value)) : pickEl.value; hex.value = v; put(v); });
    hex.addEventListener('input', () => {
      const v = hex.value.trim().toLowerCase();
      if (HEX.test(v)) { pickEl.value = v.slice(0, 7); if (op) op.value = alphaOf(v); put(v); }
      else { hex.classList.add('invalid'); err.textContent = translateUI('theme.use_hex'); }
    });
    op && op.addEventListener('input', () => { const v = withAlpha(pickEl.value, Number(op.value)); hex.value = v; put(v); });
    const bad = issues.filter((i) => i.fg === key || i.bg === key);
    return h('div', { class: 'color-row', dataset: { key } },
      h('span', { class: 'cr-label' }, label, value !== baseValue ? h('span', { class: 'tiny muted' }, translateUI('theme.changed')) : null),
      h('div', { class: 'row tight' }, pickEl, hex, op, value !== baseValue ? h('button', { class: 'btn ghost small', title: translateUI('ui.b272_settings_105'), onclick: () => onSet(null, true) }, translateUI('ui.reset')) : null),
      bad.length ? h('span', { class: 'tiny warn-text', title: bad.map((i) => translateUI('theme.contrast_needs', { label: themeLabel(i.label), ratio: i.ratio, min: i.min })).join('\n') }, translateUI('theme.contrast_low')) : null, err);
  };
  const editColors = (section, key) => (v, reset) => {
    const t = current();
    t[section] = { ...t[section] };
    if (reset) delete t[section][key]; else t[section][key] = v;
    const next = commitTheme(t, id);
    if (reset) redraw(); else refreshIssues(resolve(next));
  };
  const issueBox = h('div', { class: 'small', role: 'status' });
  const refreshIssues = (resolvedTheme) => {
    const list = contrastIssues(resolvedTheme);
    mount(issueBox, list.length ? h('div', { class: 'notice warn small' }, h('strong', null, translateUI('theme.readability')),
      list.map((i) => translateUI('theme.contrast_aim', { label: themeLabel(i.label), ratio: i.ratio, min: i.min })).join(' · ')) : h('span', { class: 'muted' }, translateUI('ui.b272_settings_106')));
  };
  refreshIssues(resolved);
  const p = cat.presets[theme.base].colors;
  const editor = h('div', { id: 'theme-editor', class: 'stack tight' },
    h('h3', null, translateUI('ui.customize_colours')),
    h('p', { class: 'small muted', style: { margin: 0 } }, translateUI('theme.starting_point', { name: cat.presets[theme.base].name }),
      s['appearance.high_contrast'] ? translateUI('theme.high_contrast') : ''),
    issueBox,
    COLOR_GROUPS.map(([title, keys], gi) => h('details', { class: 'color-group', open: gi === 0 ? '' : null },
      h('summary', null, themeLabel(title), h('span', { class: 'tiny muted' }, translateUI('theme.changed_count', { count: keys.filter(([k]) => theme.colors[k]).length }))),
      h('div', { class: 'color-grid' }, keys.map(([k, l]) => colorRow(k, themeLabel(l), resolved.colors[k], p[k], editColors('colors', k)))))),
    h('details', { class: 'color-group' }, h('summary', null, translateUI('ui.b272_settings_107'), h('span', { class: 'tiny muted' }, translateUI('theme.changed_count', { count: Object.keys(theme.types).length }))),
      h('p', { class: 'tiny muted' }, translateUI('ui.b272_settings_108')),
      h('div', { class: 'color-grid' }, TYPES.map((t) => colorRow('type_' + t, gameTerm('type', t[0].toUpperCase() + t.slice(1)), resolved.types[t], cat.type_colors[t], editColors('types', t))))));

  mount(b, h('h2', { style: { marginTop: 0 } }, translateUI('ui.appearance_themes')),
    h('div', { class: 'row wrap tight theme-status' }, h('strong', null, activeName), modified ? h('span', { class: 'chip' }, (changeCount(theme) === 1 ? translateUI('theme.changes_one', { count: changeCount(theme) }) : translateUI('theme.changes', { count: changeCount(theme) }))) : null),
    h('div', { class: 'theme-grid', role: 'group', 'aria-label': translateUI('ui.themes') }, presetCards, customCard),
    personalCards.length ? h('div', null, h('h3', null, translateUI('ui.b272_settings_109')), h('div', { class: 'theme-grid' }, personalCards)) : null,
    actions,
    editor,
    h('h3', null, translateUI('ui.accessibility')),
    row(translateUI('ui.b272_settings_110'), translateUI('ui.b272_settings_111'), switchEl(s['appearance.high_contrast'], async (v) => { await saveSettings({ 'appearance.high_contrast': v }); redraw(); })),
    row(translateUI('ui.b272_settings_112'), translateUI('theme.motion_help'), switchEl(s['appearance.reduced_motion'], (v) => saveSettings({ 'appearance.reduced_motion': v }))),
    row(translateUI('ui.b272_settings_113'), translateUI('ui.b272_settings_114'), seg([['soft', translateUI('ui.b272_settings_115')], ['accent', translateUI('ui.b272_settings_116')]], s['appearance.stat_bars'], (v) => saveSettings({ 'appearance.stat_bars': v }))),
    h('p', { class: 'tiny muted' }, translateUI('theme.license')));
}

// ------------------------------------------------------------ layout & scaling
const DENSITY_PRESET = { compact: { card_padding: 10, grid_gap: 8, section_gap: 10 }, standard: { card_padding: 16, grid_gap: 12, section_gap: 16 }, comfortable: { card_padding: 22, grid_gap: 16, section_gap: 22 } };
export function layoutSec(b) {
  const cat = catalog();
  const s = state.settings;
  const theme = current(), r = resolve(theme), id = currentId();
  const redraw = () => { mount(b); layoutSec(b); };
  const setPart = (section, patch, again = false) => { const t = current(); t[section] = { ...t[section], ...patch }; commitTheme(t, id); if (again) redraw(); };
  const slider = (label, desc, section, key, min, max, step, unit = 'px') => {
    const lbl = h('span', { class: 'small', style: { width: '52px' } }, r[section][key] + unit);
    return row(label, desc, h('div', { class: 'row' }, h('input', { type: 'range', min, max, step, value: r[section][key], 'aria-label': label,
      oninput: (e) => { lbl.textContent = e.target.value + unit; setPart(section, { [key]: Number(e.target.value) }); } }), lbl));
  };
  const pct = (label, desc, key, min, max, live) => {
    const lbl = h('span', { class: 'small', style: { width: '52px' } }, (s[key] || 100) + '%');
    return row(label, desc, h('div', { class: 'row' }, h('input', { type: 'range', min, max, step: 5, value: s[key] || 100, 'aria-label': label,
      oninput: (e) => { lbl.textContent = e.target.value + '%'; if (live) { state.settings[key] = Number(e.target.value); applyAppearance(); } },
      onchange: (e) => saveSettings({ [key]: Number(e.target.value) }).catch((er) => toast(er.message, { kind: 'warn' })) }), lbl,
      (s[key] || 100) !== 100 ? h('button', { class: 'btn ghost small', onclick: async () => { await saveSettings({ [key]: 100 }); redraw(); } }, translateUI('ui.reset')) : null));
  };
  mount(b, h('h2', { style: { marginTop: 0 } }, translateUI('ui.layout_scaling')),
    h('h3', { style: { marginTop: 0 } }, translateUI('theme.size')),
    pct(translateUI('ui.text_size'), translateUI('theme.text_only'), 'appearance.text_scale', 60, 200, true),
    pct(translateUI('ui.b272_settings_117'), translateUI('theme.scale_help'), 'appearance.ui_scale', 75, 150, false),
    row(translateUI('ui.b272_settings_118'), translateUI('ui.b272_settings_119'), seg([['light', translateUI('theme.light_weight')], ['normal', translateUI('ui.normal')], ['medium', translateUI('ui.medium')]], r.layout.font_weight, (v) => setPart('layout', { font_weight: v }), translateUI('ui.b272_settings_118'))),
    h('h3', null, translateUI('theme.spacing')),
    row(translateUI('ui.b272_settings_120'), translateUI('ui.b272_settings_121'),
      seg([['compact', translateUI('ui.compact')], ['standard', translateUI('ui.standard')], ['comfortable', translateUI('ui.b272_settings_127')]], r.layout.density, (v) => setPart('layout', { density: v, ...DENSITY_PRESET[v] }, true), translateUI('ui.b272_settings_120'))),
    slider(translateUI('ui.b272_settings_122'), null, 'layout', 'card_padding', 6, 28, 1),
    slider(translateUI('ui.b272_settings_123'), translateUI('ui.b272_settings_124'), 'layout', 'grid_gap', 4, 24, 1),
    slider(translateUI('ui.b272_settings_125'), null, 'layout', 'section_gap', 6, 32, 1),
    row(translateUI('ui.b272_settings_126'), null, seg([['compact', translateUI('ui.compact')], ['standard', translateUI('ui.standard')], ['comfortable', translateUI('ui.b272_settings_127')]], r.layout.table_density, (v) => setPart('layout', { table_density: v }), translateUI('ui.b272_settings_128'))),
    h('h3', null, translateUI('theme.borders_corners')),
    row(translateUI('ui.b272_settings_129'), null, switchEl(r.shape.border_visible, (v) => setPart('shape', { border_visible: v }, true), translateUI('ui.b272_settings_130'))),
    r.shape.border_visible ? slider(translateUI('theme.border_thickness'), null, 'shape', 'border_width', 1, 3, 1) : null,
    r.shape.border_visible ? slider(translateUI('theme.border_opacity'), translateUI('theme.border_help'), 'shape', 'border_opacity', 0, 100, 5, '%') : null,
    slider(translateUI('ui.b272_settings_131'), translateUI('ui.b272_settings_132'), 'shape', 'radius', 0, 20, 1),
    h('h3', null, translateUI('theme.navigation_scroll')),
    row(translateUI('ui.b272_settings_133'), translateUI('ui.b272_settings_134'), seg([['vertical', translateUI('ui.b272_settings_135')], ['horizontal', translateUI('ui.b272_settings_136')]], s['appearance.nav'], (v) => saveSettings({ 'appearance.nav': v }).then(changed), translateUI('ui.b272_settings_133'))),
    row(translateUI('ui.b272_settings_137'), translateUI('ui.b272_settings_138'), seg([['auto', translateUI('theme.automatic')], ['icons', translateUI('ui.b272_settings_139')], ['full', translateUI('ui.b272_settings_140')]], s['appearance.sidebar'] || 'auto', (v) => saveSettings({ 'appearance.sidebar': v }).then(changed), translateUI('ui.b272_settings_137'))),
    slider(translateUI('ui.b272_settings_141'), null, 'layout', 'sidebar_width', 150, 300, 2),
    row(translateUI('ui.b272_settings_142'), null, seg([['hidden', translateUI('ui.b272_settings_143')], ['thin', translateUI('ui.b272_settings_144')], ['standard', translateUI('ui.standard')], ['wide', translateUI('ui.b272_settings_145')]], r.layout.scrollbar, (v) => setPart('layout', { scrollbar: v }), translateUI('ui.b272_settings_142'))),
    h('p', { class: 'tiny muted' }, translateUI('theme.layout_help')),
    h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn ghost', onclick: async () => {
      if (!await confirmDialog(translateUI('theme.reset_layout'), translateUI('theme.reset_layout_help'))) return;
      const t = current(); t.shape = {}; t.layout = {}; commitTheme(t, id);
      await saveSettings({ 'appearance.text_scale': 100, 'appearance.ui_scale': 100 }); redraw(); } }, translateUI('theme.reset_layout'))),
    );
}

// ---------------------------------------------------------------------- home
export function homeSec(b) {
  const s = state.settings;
  const enabled = homeSections(s['home.sections']);
  const all = [...enabled, ...HOME_SECTIONS.map(([k]) => k).filter((k) => !enabled.includes(k))];
  const label = Object.fromEntries(HOME_SECTIONS);
  const redraw = () => { mount(b); homeSec(b); };
  const save = async (list) => { await saveSettings({ 'home.sections': list }); redraw(); };
  mount(b, h('h2', { style: { marginTop: 0 } }, translateUI('ui.home')),
    h('p', { class: 'small muted', style: { marginTop: 0 } }, translateUI('theme.home_help')),
    h('ol', { class: 'home-order' }, all.map((k) => {
      const on_ = enabled.includes(k), i = enabled.indexOf(k);
      return h('li', { class: 'home-order-row' + (on_ ? '' : ' off'), dataset: { section: k } },
        h('label', { class: 'row tight grow' }, h('input', { type: 'checkbox', class: 'check', checked: on_, 'aria-label': translateUI('theme.show_section', { label: uiLabel(label[k]) }),
          onchange: (e) => save(e.target.checked ? [...enabled, k] : enabled.filter((x) => x !== k)) }), uiLabel(label[k])),
        h('button', { class: 'icon-btn', 'aria-label': translateUI('theme.move_up', { label: uiLabel(label[k]) }), disabled: !on_ || i === 0 ? 'disabled' : null,
          onclick: () => { const l = [...enabled]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; save(l); } }, '▲'),
        h('button', { class: 'icon-btn', 'aria-label': translateUI('theme.move_down', { label: uiLabel(label[k]) }), disabled: !on_ || i === enabled.length - 1 ? 'disabled' : null,
          onclick: () => { const l = [...enabled]; [l[i + 1], l[i]] = [l[i], l[i + 1]]; save(l); } }, '▼'));
    })),
    h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn ghost', onclick: () => save([...HOME_DEFAULT]) }, translateUI('theme.reset_home'))),
    state.boot && state.boot.community && state.boot.community.discord
      ? row(translateUI('theme.discord'), translateUI('theme.discord_help'),
        switchEl(s['home.community_link'] !== false, (v) => saveSettings({ 'home.community_link': v }), translateUI('theme.discord_show'))) : null);
}
