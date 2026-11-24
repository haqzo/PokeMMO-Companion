// Settings › Appearance & themes, Layout & scaling, Home (2026-11-24).
import { h, mount, get, post, api, state, saveSettings, seg, switchEl, toast, confirmDialog, modal, debounce, applyAppearance, icon } from '../core.js';
import { downloadJson, pickJsonFile } from '../components.js';
import { COLOR_GROUPS, OPACITY_KEYS, TYPES, HEX, catalog, resolve, applyTheme, contrastIssues, exportDoc, alphaOf, withAlpha, isPristineDefault } from '../themes.js';
import { HOME_SECTIONS, HOME_DEFAULT, homeSections } from './home.js';

const row = (label, desc, control) => h('div', { class: 'set-row' }, h('div', null, h('div', { style: { fontWeight: 600 } }, label), desc ? h('div', { class: 'desc' }, desc) : null), h('div', null, control));
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
  if (!cat) { b.append(h('p', null, 'Themes are unavailable in this build.')); return; }
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
    onclick: () => pick(t, key), onmouseenter: () => preview(withLayout(t)), onmouseleave: unpreview, title: 'Hover to preview, click to use' },
    swatches(resolve(t).colors), h('div', { class: 'theme-name' }, label), h('div', { class: 'tiny muted' }, sub));

  const presetCards = cat.order.map((k) => card(k, { base: k, name: cat.presets[k].name }, cat.presets[k].name,
    k === cat.default ? 'Default' : cat.sources[k] ? 'Built-in · ' + (k === 'catppuccin-mocha' ? 'Catppuccin' : 'enkia') : 'Built-in', id === k));
  const customCard = h('button', { class: 'theme-card custom' + (modified && !mine ? ' active' : ''), onclick: () => b.querySelector('#theme-editor')?.scrollIntoView({ behavior: 'smooth' }) },
    swatches(resolved.colors), h('div', { class: 'theme-name' }, 'Custom'), h('div', { class: 'tiny muted' }, 'Change any colour below'));
  const personalCards = personal.map((p) => card(p.id, p, p.name, 'Yours · from ' + (cat.presets[p.base]?.name || 'Default'), id === p.id));

  // ---- actions
  const askName = async (title, value) => {
    const inp = h('input', { class: 'input', value: value || '', maxlength: 40, 'aria-label': 'Theme name' });
    const r = await modal({ title, body: h('div', { class: 'field' }, h('label', null, 'Name'), inp), actions: [
      { label: 'Cancel', value: null, kind: 'ghost' }, { label: 'Save', kind: 'primary', handler: () => inp.value.trim() || false }] });
    return r;
  };
  const saveNew = async (t, name) => {
    try {
      const res = await post('/api/themes', { ...t, name });
      commitTheme(res, res.id); toast(`Saved “${res.name}”`);
      redraw((await get('/api/themes')).personal);
    } catch (e) { toast(e.message, { kind: 'warn' }); }
  };
  const actions = h('div', { class: 'row wrap tight' },
    h('button', { class: 'btn small', onclick: async () => { const n = await askName('Save as a new theme', modified ? activeName + ' (custom)' : activeName + ' copy'); if (n) saveNew(theme, n); } }, 'Save as new theme…'),
    mine && modified ? h('button', { class: 'btn small primary', onclick: async () => {
      try { const res = await api('PUT', '/api/themes/' + mine.id, { ...theme, name: mine.name }); commitTheme(res, mine.id); toast('Theme saved'); redraw((await get('/api/themes')).personal); }
      catch (e) { toast(e.message, { kind: 'warn' }); } } }, 'Save changes') : null,
    modified ? h('button', { class: 'btn small ghost', onclick: () => { commitTheme({ ...savedRef, shape: theme.shape, layout: theme.layout }, id); redraw(); } }, 'Discard changes') : null,
    mine ? h('button', { class: 'btn small ghost', onclick: async () => { const n = await askName('Rename theme', mine.name); if (!n) return;
      try { const res = await api('PUT', '/api/themes/' + mine.id, { ...mine, name: n }); commitTheme({ ...theme, name: res.name }, mine.id); redraw((await get('/api/themes')).personal); } catch (e) { toast(e.message, { kind: 'warn' }); } } }, 'Rename') : null,
    mine ? h('button', { class: 'btn small ghost', onclick: () => saveNew(mine, (mine.name + ' copy').slice(0, 40)) }, 'Duplicate') : null,
    mine ? h('button', { class: 'btn small ghost', onclick: async () => {
      if (!await confirmDialog('Delete theme', `Delete “${mine.name}”? The built-in themes are not affected.`, 'Delete', true)) return;
      await api('DELETE', '/api/themes/' + mine.id); commitTheme({ ...theme }, mine.base); redraw((await get('/api/themes')).personal); } }, 'Delete') : null,
    h('span', { class: 'grow' }),
    h('button', { class: 'btn small ghost', onclick: async () => {
      let raw; try { raw = await pickJsonFile(); } catch (e) { toast(e.message, { kind: 'warn' }); return; }
      if (!raw) return;
      try {
        const v = await post('/api/themes/validate', raw);
        if (v.dropped.length) toast(`Imported; ignored ${v.dropped.length} unknown or invalid value${v.dropped.length === 1 ? '' : 's'}: ${v.dropped.slice(0, 4).join(', ')}${v.dropped.length > 4 ? '…' : ''}`, { kind: 'warn', timeout: 7000 });
        await saveNew(v.theme, v.theme.name);
      } catch (e) { toast('Not imported: ' + e.message, { kind: 'warn', timeout: 6000 }); }
    } }, icon('upload'), 'Import…'),
    h('button', { class: 'btn small ghost', onclick: () => downloadJson(`companion-theme-${(activeName || 'theme').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`, exportDoc({ ...theme, name: activeName })) }, icon('download'), 'Export'),
    id !== cat.default || !isPristineDefault(theme) ? h('button', { class: 'btn small ghost', onclick: async () => {
      if (await confirmDialog('Restore Companion Default', 'Switch back to the Companion Default theme and clear colour, border and layout changes? Your saved themes are kept.')) {
        commitTheme({ base: cat.default }, cat.default); redraw(); } } }, 'Restore Companion Default') : null);

  // ---- colour editor
  const issues = contrastIssues(resolved);
  const colorRow = (key, label, value, baseValue, onSet) => {
    const hex = h('input', { class: 'input mono hex-in', value, maxlength: 9, 'aria-label': label + ' colour (hex)', spellcheck: 'false' });
    const pickEl = h('input', { type: 'color', value: value.slice(0, 7), 'aria-label': label + ' colour' });
    const op = OPACITY_KEYS.has(key) ? h('input', { type: 'range', min: 0, max: 100, step: 5, value: alphaOf(value), 'aria-label': label + ' opacity', title: 'Opacity' }) : null;
    const err = h('span', { class: 'tiny bad-text', role: 'alert' });
    const put = (v) => { err.textContent = ''; hex.classList.remove('invalid'); onSet(v); };
    pickEl.addEventListener('input', () => { const v = op ? withAlpha(pickEl.value, Number(op.value)) : pickEl.value; hex.value = v; put(v); });
    hex.addEventListener('input', () => {
      const v = hex.value.trim().toLowerCase();
      if (HEX.test(v)) { pickEl.value = v.slice(0, 7); if (op) op.value = alphaOf(v); put(v); }
      else { hex.classList.add('invalid'); err.textContent = 'Use #rrggbb'; }
    });
    op && op.addEventListener('input', () => { const v = withAlpha(pickEl.value, Number(op.value)); hex.value = v; put(v); });
    const bad = issues.filter((i) => i.fg === key || i.bg === key);
    return h('div', { class: 'color-row', dataset: { key } },
      h('span', { class: 'cr-label' }, label, value !== baseValue ? h('span', { class: 'tiny muted' }, ' · changed') : null),
      h('div', { class: 'row tight' }, pickEl, hex, op, value !== baseValue ? h('button', { class: 'btn ghost small', title: 'Back to the preset colour', onclick: () => onSet(null, true) }, 'Reset') : null),
      bad.length ? h('span', { class: 'tiny warn-text', title: bad.map((i) => `${i.label}: ${i.ratio}:1 (needs ${i.min}:1)`).join('\n') }, '⚠ low contrast') : null, err);
  };
  const editColors = (section, key) => (v, reset) => {
    const t = current();
    t[section] = { ...t[section] };
    if (reset) delete t[section][key]; else t[section][key] = v;
    commitTheme(t, id);
    if (reset) redraw(); else refreshIssues();
  };
  const issueBox = h('div', { class: 'small' });
  const refreshIssues = debounce(() => {
    const list = contrastIssues(resolve(current()));
    mount(issueBox, list.length ? h('div', { class: 'notice warn small' }, h('strong', null, 'Readability: '),
      list.map((i) => `${i.label} ${i.ratio}:1 (aim for ${i.min}:1)`).join(' · ')) : h('span', { class: 'muted' }, 'All checked text colours meet the WCAG contrast targets.'));
  }, 200);
  refreshIssues();
  const p = cat.presets[theme.base].colors;
  const editor = h('div', { id: 'theme-editor', class: 'stack tight' },
    h('h3', null, 'Customize colours'),
    h('p', { class: 'small muted', style: { margin: 0 } }, `Starting point: ${cat.presets[theme.base].name}. Changes apply at once to every window; save them as a theme to keep several looks.`,
      s['appearance.high_contrast'] ? ' High contrast is on, so theme colours are paused until you turn it off.' : ''),
    issueBox,
    COLOR_GROUPS.map(([title, keys], gi) => h('details', { class: 'color-group', open: gi === 0 ? '' : null },
      h('summary', null, title, h('span', { class: 'tiny muted' }, ` · ${keys.filter(([k]) => theme.colors[k]).length || 'none'} changed`)),
      h('div', { class: 'color-grid' }, keys.map(([k, l]) => colorRow(k, l, resolved.colors[k], p[k], editColors('colors', k)))))),
    h('details', { class: 'color-group' }, h('summary', null, 'Type colours (optional)', h('span', { class: 'tiny muted' }, ` · ${Object.keys(theme.types).length || 'none'} changed`)),
      h('p', { class: 'tiny muted' }, 'Used on type badges and the type chart. Badge text switches between dark and light for readability.'),
      h('div', { class: 'color-grid' }, TYPES.map((t) => colorRow('type_' + t, t[0].toUpperCase() + t.slice(1), resolved.types[t], cat.type_colors[t], editColors('types', t))))));

  mount(b, h('h2', { style: { marginTop: 0 } }, 'Appearance & themes'),
    h('div', { class: 'row wrap tight theme-status' }, h('strong', null, activeName), modified ? h('span', { class: 'chip' }, `${changeCount(theme)} change${changeCount(theme) === 1 ? '' : 's'}`) : null),
    h('div', { class: 'theme-grid', role: 'group', 'aria-label': 'Themes' }, presetCards, customCard),
    personalCards.length ? h('div', null, h('h3', null, 'Your themes'), h('div', { class: 'theme-grid' }, personalCards)) : null,
    actions,
    editor,
    h('h3', null, 'Accessibility'),
    row('High contrast', 'Stronger borders and pure white text. Overrides theme colours while on.', switchEl(s['appearance.high_contrast'], async (v) => { await saveSettings({ 'appearance.high_contrast': v }); redraw(); })),
    row('Reduced motion', 'Turns off transitions and shimmer. Sprite animation has its own switch in Pokémon & sprites.', switchEl(s['appearance.reduced_motion'], (v) => saveSettings({ 'appearance.reduced_motion': v }))),
    row('Stat bars', 'Soft colours per stat or a single accent colour.', seg([['soft', 'Soft colours'], ['accent', 'Accent']], s['appearance.stat_bars'], (v) => saveSettings({ 'appearance.stat_bars': v }))),
    h('p', { class: 'tiny muted' }, 'Catppuccin Mocha uses the Catppuccin palette (MIT); Tokyo Night uses enkia’s Tokyo Night palette (MIT). Theme files hold colours and numbers only — no scripts, styles, web addresses or file paths.'));
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
      (s[key] || 100) !== 100 ? h('button', { class: 'btn ghost small', onclick: async () => { await saveSettings({ [key]: 100 }); redraw(); } }, 'Reset') : null));
  };
  mount(b, h('h2', { style: { marginTop: 0 } }, 'Layout & scaling'),
    h('h3', { style: { marginTop: 0 } }, 'Size'),
    pct('Text size', 'Text only (60–200%). Layout, icons and sprites keep their size. Popouts have their own text size.', 'appearance.text_scale', 60, 200, true),
    pct('Interface scale', 'Everything in the main window — text, controls, spacing and sprites — together (75–150%). Applied once on top of your desktop’s own display scaling.', 'appearance.ui_scale', 75, 150, false),
    row('Font weight', 'Body text weight.', seg([['light', 'Light'], ['normal', 'Normal'], ['medium', 'Medium']], r.layout.font_weight, (v) => setPart('layout', { font_weight: v }), 'Font weight')),
    h('h3', null, 'Spacing'),
    row('Density', 'Sets spacing, card padding and gaps together. Fine-tune them below.',
      seg([['compact', 'Compact'], ['standard', 'Standard'], ['comfortable', 'Comfortable']], r.layout.density, (v) => setPart('layout', { density: v, ...DENSITY_PRESET[v] }, true), 'Density')),
    slider('Card padding', null, 'layout', 'card_padding', 6, 28, 1),
    slider('Grid gap', 'Space between cards and Pokédex tiles.', 'layout', 'grid_gap', 4, 24, 1),
    slider('Section spacing', null, 'layout', 'section_gap', 6, 32, 1),
    row('Table rows', null, seg([['compact', 'Compact'], ['standard', 'Standard'], ['comfortable', 'Comfortable']], r.layout.table_density, (v) => setPart('layout', { table_density: v }), 'Table density')),
    h('h3', null, 'Borders & corners'),
    row('Borders', null, switchEl(r.shape.border_visible, (v) => setPart('shape', { border_visible: v }, true), 'Show borders')),
    r.shape.border_visible ? slider('Border thickness', null, 'shape', 'border_width', 1, 3, 1) : null,
    r.shape.border_visible ? slider('Border opacity', 'Border colours are in Appearance & themes › Borders.', 'shape', 'border_opacity', 0, 100, 5, '%') : null,
    slider('Corner radius', '0 is square; 20 is very round.', 'shape', 'radius', 0, 20, 1),
    h('h3', null, 'Navigation & scrollbars'),
    row('Navigation', 'Vertical sidebar or horizontal top bar.', seg([['vertical', 'Vertical'], ['horizontal', 'Horizontal']], s['appearance.nav'], (v) => saveSettings({ 'appearance.nav': v }).then(changed), 'Navigation')),
    row('Sidebar labels', 'Automatic shows icons only when the window is narrow.', seg([['auto', 'Automatic'], ['icons', 'Icons only'], ['full', 'Always labels']], s['appearance.sidebar'] || 'auto', (v) => saveSettings({ 'appearance.sidebar': v }).then(changed), 'Sidebar labels')),
    slider('Sidebar width', null, 'layout', 'sidebar_width', 150, 300, 2),
    row('Scrollbars', null, seg([['hidden', 'Hidden'], ['thin', 'Thin'], ['standard', 'Standard'], ['wide', 'Wide']], r.layout.scrollbar, (v) => setPart('layout', { scrollbar: v }), 'Scrollbars')),
    h('p', { class: 'tiny muted' }, 'Pokédex grid density and sprite sizes are in Pokémon & sprites. Popout size, opacity and scale are per window in Windows & popouts.'),
    h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn ghost', onclick: async () => {
      if (!await confirmDialog('Reset layout', 'Reset spacing, borders, corners, scrollbars, text size and interface scale? Colours and themes are not changed.')) return;
      const t = current(); t.shape = {}; t.layout = {}; commitTheme(t, id);
      await saveSettings({ 'appearance.text_scale': 100, 'appearance.ui_scale': 100 }); redraw(); } }, 'Reset layout')),
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
  mount(b, h('h2', { style: { marginTop: 0 } }, 'Home'),
    h('p', { class: 'small muted', style: { marginTop: 0 } }, 'Choose and order the sections on Home. On wide windows sections sit side by side in this order; cards in a row share one height. Hidden sections keep their data.'),
    h('ol', { class: 'home-order' }, all.map((k) => {
      const on_ = enabled.includes(k), i = enabled.indexOf(k);
      return h('li', { class: 'home-order-row' + (on_ ? '' : ' off'), dataset: { section: k } },
        h('label', { class: 'row tight grow' }, h('input', { type: 'checkbox', class: 'check', checked: on_, 'aria-label': 'Show ' + label[k],
          onchange: (e) => save(e.target.checked ? [...enabled, k] : enabled.filter((x) => x !== k)) }), label[k]),
        h('button', { class: 'icon-btn', 'aria-label': `Move ${label[k]} up`, disabled: !on_ || i === 0 ? 'disabled' : null,
          onclick: () => { const l = [...enabled]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; save(l); } }, '▲'),
        h('button', { class: 'icon-btn', 'aria-label': `Move ${label[k]} down`, disabled: !on_ || i === enabled.length - 1 ? 'disabled' : null,
          onclick: () => { const l = [...enabled]; [l[i + 1], l[i]] = [l[i], l[i + 1]]; save(l); } }, '▼'));
    })),
    h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn ghost', onclick: () => save([...HOME_DEFAULT]) }, 'Reset Home layout')),
    state.boot && state.boot.community && state.boot.community.discord
      ? row('Community Discord link', 'A small optional link in the Home header. Companion works fully without Discord.',
        switchEl(s['home.community_link'] !== false, (v) => saveSettings({ 'home.community_link': v }), 'Show the community Discord link')) : null);
}
