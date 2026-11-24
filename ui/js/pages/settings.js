// Settings (docs/design/16) + data import + first-run onboarding.
import { HOME_SECTIONS, homeSections } from './home.js';
import { h, mount, icon, get, post, api, state, setting, saveSettings, badge, notice, cap, seg, switchEl, toast, confirmDialog, modal, on, fmtDate, relTime, SHELL, extLink } from '../core.js';
import { go, openPopout, POPOUT_TOOLS } from '../shell.js';
import { downloadJson, pickJsonFile } from '../components.js';
import { createRun } from './guides.js';
import { LANGS, coverage, t } from '../i18n.js';
import { comboFromEvent, displayCombo, setRecording, loadShortcuts } from '../shortcuts.js';

const SECTIONS = [['appearance', 'Appearance'], ['language', 'Language'], ['windows', 'Windows & popouts'], ['shortcuts', 'Keyboard shortcuts'], ['notifications', 'Notifications'],
  ['sources', 'Live sources & news'], ['guides', 'Guides & characters'], ['data', 'Data & privacy'], ['about', 'About']];
let unsub = [];
export function dispose() { unsub.forEach((u) => u()); unsub = []; }

const row = (label, desc, control) => h('div', { class: 'set-row' }, h('div', null, h('div', { style: { fontWeight: 600 } }, label), desc ? h('div', { class: 'desc' }, desc) : null), h('div', null, control));
const set = (k) => (v) => saveSettings({ [k]: v }).then(() => toast('Saved', { timeout: 1200 })).catch((e) => toast(e.message, { kind: 'warn' }));

export async function render(el, route) {
  dispose();
  const sec = SECTIONS.some(([k]) => k === route.parts[0]) ? route.parts[0] : 'appearance';
  const page = h('div', { class: 'page' });
  mount(el, page);
  page.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Settings'), h('div', { class: 'sub' }, 'Saved immediately on this computer.'))));
  const body = h('div', { class: 'card' });
  page.append(h('div', { class: 'settings-layout' }, h('nav', { class: 'settings-nav', 'aria-label': 'Settings sections' },
    SECTIONS.map(([k, l]) => h('button', { class: 'chapter-btn' + (k === sec ? ' active' : ''), onclick: () => go('#/settings/' + k) }, l))), body));
  await ({ appearance, language, windows, shortcuts: shortcutsSec, notifications, sources, guides: guidesSec, data, about })[sec](body);
}

// --------------------------------------------------------------- language
async function language(b) {
  const cov = coverage();
  const cur = setting('app.language') || 'en';
  b.append(h('h2', { style: { marginTop: 0 } }, 'Language'),
    row('Companion language', 'English is complete. Spanish and Chinese are beta: menus, navigation and the new tools are translated; other pages still show English. Translations were written for this build and have not been reviewed by native speakers yet.',
      h('div', { class: 'stack tight' }, LANGS.map((l) => h('label', { class: 'row' }, h('input', { type: 'radio', name: 'lang', checked: cur === l.id ? 'checked' : null,
        onchange: async () => { await saveSettings({ 'app.language': l.id }); (await import('../shell.js')).renderChrome(); go('#/settings/language'); } }),
      h('span', null, l.native, l.native !== l.label ? h('span', { class: 'tiny muted' }, ` (${l.label})`) : null),
      l.status === 'beta' ? h('span', { class: 'badge unknown' }, 'beta') : null)))),
    row('Translation coverage', 'Keys in the Companion’s interface dictionary. Missing keys fall back to English.',
      h('div', { class: 'stack tight' }, cov.map((c) => h('div', { class: 'small' }, `${c.native}: ${c.keys} / ${c.total}`)))),
    row('Game names', 'Pokémon names stay in English (your client dump has no translated species names). Item names and descriptions use your own client’s Spanish/Chinese text when your installed data includes XML-Strings.', h('span', { class: 'tiny muted' }, '—')),
    row('Language button in the toolbar', 'Shows the globe button in the sidebar / top bar for quick switching.',
      switchEl((setting('app.toolbar') || []).includes('language'), (v) => saveSettings({ 'app.toolbar': v ? [...new Set([...(setting('app.toolbar') || []), 'language'])] : (setting('app.toolbar') || []).filter((x) => x !== 'language') }).then(async () => (await import('../shell.js')).renderChrome()))),
    row('“New note” button in the toolbar', 'Adds a quick button that opens a new floating note.',
      switchEl((setting('app.toolbar') || []).includes('notes'), (v) => saveSettings({ 'app.toolbar': v ? [...new Set([...(setting('app.toolbar') || []), 'notes'])] : (setting('app.toolbar') || []).filter((x) => x !== 'notes') }).then(async () => (await import('../shell.js')).renderChrome()))));
}

// ------------------------------------------------------- keyboard shortcuts
async function shortcutsSec(b) {
  let data = await get('/api/shortcuts');
  let q = '';
  const listEl = h('div', { class: 'stack tight' });
  const record = (a, btn) => {
    setRecording(true);
    btn.textContent = 'Press keys… (Esc cancels)';
    btn.classList.add('recording');
    const stop = () => { setRecording(false); document.removeEventListener('keydown', onKey, true); };
    const onKey = async (e) => {
      e.preventDefault(); e.stopPropagation();
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
      stop();
      if (e.key === 'Escape') { draw(); return; }
      const combo = comboFromEvent(e);
      if (!combo) { toast('That key cannot be used for a shortcut.', { kind: 'warn' }); draw(); return; }
      try { data = await api('PUT', '/api/shortcuts/' + a.id, { binding: combo }); toast(`${a.label}: ${displayCombo(combo)}`); }
      catch (err) {
        if (/already used/.test(err.message) && await confirmDialog('Shortcut in use', err.message + ' Replace it?', 'Replace')) {
          try { data = await api('PUT', '/api/shortcuts/' + a.id, { binding: combo, replace: true }); } catch (x) { toast(x.message, { kind: 'warn' }); }
        } else if (!/already used/.test(err.message)) toast(err.message, { kind: 'warn' });
      }
      await loadShortcuts(); draw();
    };
    document.addEventListener('keydown', onKey, true);
  };
  const draw = () => {
    const groups = {};
    for (const a of data.actions.filter((x) => !q || x.label.toLowerCase().includes(q) || x.group.toLowerCase().includes(q) || (x.binding || '').toLowerCase().includes(q))) (groups[a.group] ||= []).push(a);
    mount(listEl, Object.entries(groups).map(([g, acts]) => h('section', { class: 'stack tight' }, h('h3', { style: { margin: '8px 0 0' } }, g),
      acts.map((a) => {
        const rec = h('button', { class: 'btn small kb-rec', 'aria-label': `Change shortcut for ${a.label}`, onclick: (e) => record(a, e.currentTarget) }, a.binding ? 'Change' : 'Assign');
        return h('div', { class: 'set-row kb-row' }, h('div', null, h('div', { style: { fontWeight: 600 } }, a.label),
          h('div', { class: 'desc' }, { app: 'Any Companion window', guides: 'Guides page or Storyline popout', pokedex: 'Pokédex page or popout', notes: 'Notes page or popout', items: 'Item Library', links: 'Websites page' }[a.scope] || a.scope,
            a.default && a.default !== a.binding ? ` · default ${displayCombo(a.default)}` : '')),
        h('div', { class: 'row' }, h('kbd', { class: 'kb' + (a.binding ? '' : ' none') }, displayCombo(a.binding)), rec,
          a.binding ? h('button', { class: 'btn ghost small', 'aria-label': `Clear shortcut for ${a.label}`, onclick: async () => { data = await api('PUT', '/api/shortcuts/' + a.id, { binding: null }); await loadShortcuts(); draw(); } }, 'Clear') : null,
          a.default !== a.binding ? h('button', { class: 'btn ghost small', onclick: async () => {
            try { data = await api('PUT', '/api/shortcuts/' + a.id, { reset: true }); } catch (err) {
              if (await confirmDialog('Default in use', err.message + ' Replace it?', 'Replace')) data = await api('PUT', '/api/shortcuts/' + a.id, { reset: true, replace: true }); }
            await loadShortcuts(); draw(); } }, t('common.reset')) : null));
      }))));
  };
  b.append(h('h2', { style: { marginTop: 0 } }, t('shortcuts.title')),
    notice('info', data.global_note),
    row('Shortcuts on', 'Turn all Companion shortcuts off without losing your bindings.', switchEl(setting('shortcuts.enabled') !== false, set('shortcuts.enabled'))),
    row('System-wide (global) shortcuts', 'Not available in v0.1.0 — always off. The Companion never captures keys while PokeMMO has focus.', switchEl(false, () => toast('System-wide shortcuts are not available.', { kind: 'warn' }))),
    h('div', { class: 'row', style: { margin: '8px 0' } }, h('div', { class: 'search grow' }, icon('search'), h('input', { class: 'input', type: 'search', placeholder: 'Search actions or keys', 'aria-label': 'Search shortcuts',
      oninput: (e) => { q = e.target.value.toLowerCase(); draw(); } })),
    h('button', { class: 'btn ghost', onclick: async () => { if (await confirmDialog('Reset all shortcuts?', 'Every action goes back to its default key (or unassigned).', t('common.reset'))) { data = await post('/api/shortcuts/reset'); await loadShortcuts(); draw(); } } }, 'Reset all')),
    listEl,
    h('p', { class: 'tiny muted' }, 'Shortcuts never fire while you type in a text field or while a dialog is open. Holding a key down does not repeat a tick. Storyline actions always use the character run and region shown in the Guides page or Storyline popout; at the first/last step nothing is changed.'));
  draw();
}

// ------------------------------------------------------------ appearance
async function appearance(b) {
  const s = state.settings;
  const scaleLbl = h('span', { class: 'small', style: { width: '48px' } }, s['appearance.text_scale'] + '%');
  b.append(h('h2', { style: { marginTop: 0 } }, 'Appearance'),
    row('Navigation', 'Vertical sidebar or horizontal top bar — same five sections; your current page is kept.',
      seg([['vertical', 'Vertical'], ['horizontal', 'Horizontal']], s['appearance.nav'], (v) => saveSettings({ 'appearance.nav': v }).then(() => document.dispatchEvent(new CustomEvent('settings-changed'))), 'Navigation')),
    row('Text size', 'Scales all text and controls in the main window (80–160%).',
      h('div', { class: 'row' }, h('input', { type: 'range', min: 80, max: 160, step: 5, value: s['appearance.text_scale'], 'aria-label': 'Text size',
        oninput: (e) => { scaleLbl.textContent = e.target.value + '%'; state.settings['appearance.text_scale'] = Number(e.target.value); document.documentElement.style.setProperty('--scale', String(e.target.value / 100)); },
        onchange: (e) => set('appearance.text_scale')(Number(e.target.value)) }), scaleLbl)),
    row('High contrast', 'Stronger borders and pure white text.', switchEl(s['appearance.high_contrast'], set('appearance.high_contrast'))),
    row('Reduced motion', 'Turns off transitions and shimmer.', switchEl(s['appearance.reduced_motion'], set('appearance.reduced_motion'))),
    row('Stat bars', 'Better Default “Soft colours” or a single accent colour.', seg([['soft', 'Soft colours'], ['accent', 'Accent']], s['appearance.stat_bars'], set('appearance.stat_bars'))),
    row('Reopen last page', 'Start where you left off.', switchEl(s['app.restore_last_page'], set('app.restore_last_page'))),
    row('Home sections', 'Choose what Home shows. Storyline run and Favourite Pokémon are off by default; your runs and favourites are kept either way.',
      h('div', { class: 'row wrap' }, HOME_SECTIONS.map(([k, l]) =>
        h('label', { class: 'chip btnlike' + (homeSections(s['home.sections']).includes(k) ? ' active' : '') }, h('input', { type: 'checkbox', class: 'check', checked: homeSections(s['home.sections']).includes(k), onchange: (e) => {
          const cur = new Set(homeSections(state.settings['home.sections'])); e.target.checked ? cur.add(k) : cur.delete(k);
          e.target.parentElement.classList.toggle('active', e.target.checked);
          set('home.sections')(HOME_SECTIONS.map(([x]) => x).filter((x) => cur.has(x))); } }), l)))),
    false && row('Home shortcuts', 'Up to a few “Continue” actions.', h('div', { class: 'row wrap' }, [['guide', 'Current guide step'], ['pokedex_last', 'Last Pokémon'], ['breeding', 'Breeding planner'], ['typechart', 'Type matchups']].map(([k, l]) =>
      h('label', { class: 'chip btnlike' }, h('input', { type: 'checkbox', class: 'check', checked: s['home.shortcuts'].includes(k), onchange: (e) => {
        const cur = new Set(state.settings['home.shortcuts']); e.target.checked ? cur.add(k) : cur.delete(k); set('home.shortcuts')([...cur]); } }), l)))),
    h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn ghost', onclick: async () => {
      if (await confirmDialog('Reset appearance', 'Reset navigation, text size, contrast, motion and stat bars to defaults? Character runs and other data are not touched.')) {
        await post('/api/settings/reset', { prefix: 'appearance.' }); location.reload(); } } }, 'Reset appearance')),
    h('p', { class: 'tiny muted' }, 'Colours are sampled from Better Default v1.8.0 screenshots and await confirmation against the theme files.'));
}

// -------------------------------------------------------------- windows
async function windows(b) {
  const caps = (await get('/api/shell/capabilities'));
  const s = state.settings;
  const capRow = (label, ok) => h('div', { class: 'row small' }, h('span', { class: 'dot ' + (ok ? 'connected' : '') }), label, h('span', { class: 'muted' }, ok ? 'supported' : 'not available'));
  b.append(h('h2', { style: { marginTop: 0 } }, 'Windows & popouts'),
    h('div', { class: 'card inset stack tight' }, h('div', null, h('strong', null, caps.mode === 'qt' ? 'Native window shell' : 'Browser mode'), h('span', { class: 'muted small' }, ` · platform: ${caps.platform}`)),
      h('div', { class: 'grid-3' }, capRow('Separate popout windows', caps.native_windows || caps.mode === 'browser'), capRow('Pin / always on top', caps.pin), capRow('Window opacity', caps.window_opacity),
        capRow('Companion toast window', caps.toast_window), capRow('Tray icon', caps.tray), capRow('Restore window position', caps.position)),
      (caps.notes || []).map((n) => h('div', { class: 'small muted' }, '• ', n))),
    row('Window backend (Linux)', 'Applies at next launch. Auto uses XWayland on KDE Wayland so pinning and toast placement work; native Wayland may ignore them.',
      seg([['auto', 'Auto'], ['xwayland', 'XWayland'], ['wayland', 'Native Wayland']], s['app.window_backend'], set('app.window_backend'))),
    row('Closing the main window', 'Quit stops everything, including alerts. Tray keeps popouts and alerts running until you choose Quit from the tray menu.',
      seg([['quit', 'Quit the Companion'], ['tray', 'Keep running in tray']], s['app.close_behavior'], (v) => {
        if (v === 'tray' && !caps.tray) { toast('No tray icon is available in this mode — the Companion will quit on close.', { kind: 'warn' }); }
        set('app.close_behavior')(v); })),
    h('h3', null, 'Popout windows'),
    h('p', { class: 'small muted', style: { marginTop: 0 } }, 'Each mode opens at its own starting size. Resize freely afterwards — your size is remembered for that tool and mode. Background opacity fades only the panel behind the text; window opacity fades the whole window (native shell only).'),
    h('div', { class: 'tool-pref-grid' }, Object.entries(POPOUT_TOOLS).map(([t, def]) => toolPrefCard(t, def, caps))),
    h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn ghost', onclick: async () => {
      if (await confirmDialog('Reset window preferences', 'Reset popout modes, sizes, opacity, pin and lock for every tool? Your data is not touched.')) { await post('/api/settings/reset', { prefix: 'window.' }); location.reload(); } } }, 'Reset all window preferences')));
}
function toolPrefCard(t, def, caps) {
  const s = state.settings;
  const presets = (state.boot.window_presets || {})[t] || {};
  const sizes = s[`window.${t}.sizes`] || {};
  const sizeLine = ['compact', 'standard', 'expanded'].map((m) => {
    const p = presets[m] || [];
    const c = sizes[m];
    return h('div', { class: 'row small', style: { justifyContent: 'space-between' } }, h('span', { class: 'muted' }, cap(m)),
      h('span', null, c ? `${c.w}×${c.h} (yours)` : `${p[0]}×${p[1]} (preset)`),
      c ? h('button', { class: 'btn ghost small', title: 'Forget your size for this mode', onclick: async () => { const nx = { ...sizes }; delete nx[m]; await set(`window.${t}.sizes`)(nx); render(document.getElementById('main'), { parts: ['windows'] }); } }, 'Reset') : h('span', { style: { width: '52px' } }));
  });
  return h('div', { class: 'card tool-pref stack tight' },
    h('div', { class: 'row' }, h('strong', null, def.title), h('span', { class: 'grow' }), h('button', { class: 'btn small', onclick: () => openPopout(t) }, icon('popout'), 'Open')),
    h('div', { class: 'row wrap' }, h('span', { class: 'label', style: { width: '90px' } }, 'Default mode'),
      seg([['compact', 'Compact'], ['standard', 'Standard'], ['expanded', 'Expanded']], s[`window.${t}.mode`], set(`window.${t}.mode`), 'Mode')),
    h('div', { class: 'stack tight' }, sizeLine),
    h('label', { class: 'switch small' }, h('input', { type: 'checkbox', checked: s[`window.${t}.keep_size`], onchange: (e) => set(`window.${t}.keep_size`)(e.target.checked) }), h('span', null, 'Keep my size when switching modes')),
    h('div', { class: 'row wrap' },
      h('label', { class: 'switch small', title: caps.pin ? '' : 'Not supported in this mode' }, h('input', { type: 'checkbox', checked: s[`window.${t}.pinned`], disabled: caps.pin ? null : 'disabled', onchange: (e) => set(`window.${t}.pinned`)(e.target.checked) }), h('span', null, 'Pin on open')),
      h('label', { class: 'switch small', title: caps.native_windows ? '' : 'Native shell only' }, h('input', { type: 'checkbox', checked: s[`window.${t}.locked`], disabled: caps.native_windows ? null : 'disabled', onchange: (e) => set(`window.${t}.locked`)(e.target.checked) }), h('span', null, 'Lock position'))),
    h('div', { class: 'pref-sliders' }, h('span', { class: 'label' }, 'Background'), rangeCell(`window.${t}.bg_opacity`, 35, 100),
      h('span', { class: 'label' }, 'Window'), rangeCell(`window.${t}.window_opacity`, 40, 100, !caps.window_opacity),
      h('span', { class: 'label' }, 'Text size'), rangeCell(`window.${t}.text_scale`, 70, 180)));
}
function rangeCell(key, min, max, disabled) {
  const lbl = h('span', { class: 'tiny muted', style: { width: '34px', display: 'inline-block' } }, state.settings[key] + '%');
  return h('div', { class: 'row', style: { minWidth: '140px' } }, h('input', { type: 'range', min, max, step: 5, value: state.settings[key], disabled: disabled ? 'disabled' : null, 'aria-label': key,
    oninput: (e) => { lbl.textContent = e.target.value + '%'; }, onchange: (e) => set(key)(Number(e.target.value)) }), lbl);
}

// --------------------------------------------------------- notifications
async function notifications(b) {
  const s = state.settings;
  const n = state.boot.notifier;
  const routes = [['off', 'Off'], ['toast', 'Toast'], ['os', 'OS'], ['both', 'Both']];
  b.append(h('h2', { style: { marginTop: 0 } }, 'Notifications'),
    notice('info', 'Every received report is saved to Live › history whatever you choose here. Toasts are the Companion’s own small window; OS notifications go through your desktop’s notification centre (its Do-Not-Disturb rules apply).'),
    row('Alpha reports', null, seg(routes, s['notify.alpha'], set('notify.alpha'))),
    row('Swarm reports', null, seg(routes, s['notify.swarm'], set('notify.swarm'))),
    row('Other reports', 'Messages without an Alpha/Swarm keyword.', seg(routes, s['notify.other'], set('notify.other'))),
    row('TEST notifications', 'For the “Send TEST notification” button in Live.', seg(routes, s['notify.test'], set('notify.test'))),
    row('Timers', 'When one of your Tools › Timers finishes. Do not disturb silences these too (the timer still completes).', seg(routes, s['notify.timer'], set('notify.timer'))),
    row('Do not disturb', 'Manual switch: saves reports silently (TEST notifications still show).', switchEl(s['notify.quiet'], set('notify.quiet'))),
    row('Toast corner', 'On Native Wayland the compositor may decide placement.', seg([['top-left', '↖'], ['top-right', '↗'], ['bottom-left', '↙'], ['bottom-right', '↘']], s['notify.toast_corner'], set('notify.toast_corner'))),
    row('Toast screen', null, seg([['primary', 'Primary screen'], ['main-window', 'Screen with main window']], s['notify.toast_screen'], set('notify.toast_screen'))),
    row('Toast duration', null, h('div', { class: 'row' }, h('input', { class: 'input', type: 'number', min: 3, max: 60, value: s['notify.toast_duration'], style: { width: '90px' }, onchange: (e) => set('notify.toast_duration')(Number(e.target.value)) }), 'seconds')),
    row('Toast opacity', null, rangeCell('notify.toast_opacity', 60, 100)),
    row('Keep history for', null, h('div', { class: 'row' }, h('input', { class: 'input', type: 'number', min: 1, max: 365, value: s['notify.retention_days'], style: { width: '90px' }, onchange: (e) => set('notify.retention_days')(Number(e.target.value)) }), 'days')),
    row('OS notification backend', n.available ? 'Detected and available.' : n.reason, h('span', { class: 'badge ' + (n.available ? 'verified' : 'unknown') }, n.backend)),
    h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn', onclick: async () => { const r = await post('/api/live/test', { kind: 'alpha' }); const d = r.delivery || {};
      toast(`TEST sent — toast: ${d.toast ? (d.toast.delivered ? 'shown' : 'not shown') : 'off'}, OS: ${d.os ? (d.os.delivered ? 'sent' : 'failed: ' + (d.os.error || '')) : 'off'}`, { timeout: 6000 }); } }, icon('bell'), 'Send TEST notification')));
}

// -------------------------------------------------------------- sources
async function sources(b) {
  const src = await get('/api/live/source');
  const n = await get('/api/news');
  b.append(h('h2', { style: { marginTop: 0 } }, 'Live sources & news'),
    row('Alpha/Swarm report feed', 'Read-only subscription to the public Alphapedia ntfy topics (alphapings, swarmpings). Off until you connect it in Live.',
      h('div', { class: 'stack tight' }, h('div', { class: 'row' }, h('span', { class: 'dot ' + (src.enabled ? src.status : '') }), src.enabled ? cap(src.status) : 'Off',
        src.last_success_at ? h('span', { class: 'small muted' }, ' · last data ', relTime(src.last_success_at)) : null),
      h('div', { class: 'tiny muted' }, src.payload_note || ''),
      src.enabled ? h('button', { class: 'btn small', onclick: async () => { await saveSettings({ 'live.ntfy.enabled': false }); render(document.getElementById('main'), { parts: ['sources'] }); } }, 'Turn off') :
        h('button', { class: 'btn small', onclick: () => go('#/live/reports') }, 'Connect in Live…'))),
    row('Feed server and topic', 'Advanced. HTTPS only.', h('div', { class: 'row wrap' },
      h('input', { class: 'input', style: { width: '260px' }, value: state.settings['live.ntfy.server'], onchange: (e) => set('live.ntfy.server')(e.target.value.trim()) }),
      h('input', { class: 'input', style: { width: '200px' }, value: state.settings['live.ntfy.topic'], title: 'Comma-separated topics', onchange: (e) => set('live.ntfy.topic')(e.target.value.trim()) }))),
    row('Swarm duration estimate', 'Used only for the “≈ time left” estimate on swarm reports. Community reports disagree (≈15, 20 or 30 min); this is not an official despawn time. Alphas use 75 min from the official changelog.',
      h('div', { class: 'row' }, h('input', { class: 'input', type: 'number', min: 5, max: 120, value: state.settings['live.swarm_estimate_minutes'], style: { width: '80px' },
        'aria-label': 'Swarm duration estimate in minutes', onchange: (e) => set('live.swarm_estimate_minutes')(Math.max(5, Math.min(120, Number(e.target.value) || 20))) }), h('span', { class: 'small' }, 'minutes'))),
    row('Reports caught up on reconnect', 'When the Companion starts or reconnects it catches up on recent reports. Show those in “Current” if their own report time is still recent (they never trigger alerts).',
      switchEl(state.settings['live.current_include_catchup'] !== false, set('live.current_include_catchup'))),
    row('Official news snapshot', `Bundled, independently written summaries checked ${fmtDate(n.snapshot_checked_at)}.`, h('span', { class: 'small' }, `${n.articles.length} posts · ${n.events.length} events`)),
    row('Automatic check of official news', 'Fetches only the official Updates feed (titles, dates, links) in the background, at most hourly. New titles show “Summary pending verification”.',
      h('div', { class: 'row wrap' }, switchEl(state.settings['updates.auto_check'], set('updates.auto_check')),
        h('span', { class: 'small' }, 'every'), h('input', { class: 'input', type: 'number', min: 1, max: 24, value: state.settings['updates.check_hours'], style: { width: '70px' },
          onchange: (e) => set('updates.check_hours')(Number(e.target.value)) }), h('span', { class: 'small' }, 'hours'))),
    row('Check official forum now', 'Same feed, on demand (at most once a minute).',
      h('div', { class: 'stack tight' }, h('button', { class: 'btn small', onclick: async (e) => { e.target.disabled = true; const r = await post('/api/news/check');
        toast(r.ok ? `Checked: ${r.count} posts` : `Could not refresh: ${r.error}`, { kind: r.ok ? 'info' : 'warn', timeout: 6000 }); render(document.getElementById('main'), { parts: ['sources'] }); } }, icon('refresh'), 'Check now'),
      n.feed ? h('span', { class: 'small muted' }, n.feed.ok ? `Last check OK ${relTime(n.feed.checked_at)}` : `Last check failed ${relTime(n.feed.checked_at)}: ${n.feed.error}`) : h('span', { class: 'small muted' }, 'Never checked'))),
    row('Altering Cave live source', 'No verified, permitted feed exists in this build; Live shows Unknown plus your own observations.', badge('UNKNOWN', 'Not connected')));
}

// --------------------------------------------------------------- guides
async function guidesSec(b) {
  const runs = await get('/api/guides/runs');
  b.append(h('h2', { style: { marginTop: 0 } }, 'Guides & characters'),
    row('Active run', 'Used by Home, the Storyline popout and legendary tracking.', runs.runs.length ? h('select', { class: 'input', style: { width: 'auto' }, onchange: (e) => set('guides.active_run')(e.target.value) },
      runs.runs.map((r) => h('option', { value: r.id, selected: r.id === runs.active ? 'selected' : null }, r.display))) : h('button', { class: 'btn', onclick: async () => { await createRun(); render(document.getElementById('main'), { parts: ['guides'] }); } }, 'Create a run')),
    h('h3', null, 'Runs'),
    h('table', { class: 'table compact' }, h('thead', null, h('tr', null, ['Character', 'Label', 'Last region', 'Updated', ''].map((c) => h('th', null, c)))),
      h('tbody', null, runs.runs.map((r) => h('tr', null, h('td', null, r.character_name), h('td', null, r.run_label || '—'), h('td', null, cap(r.last_region)), h('td', { class: 'small' }, relTime(r.updated_at)),
        h('td', null, h('button', { class: 'btn small danger', onclick: async () => { if (await confirmDialog('Delete run', `Delete “${r.display}”? You can restore it later.`, 'Delete', true)) {
          await api('DELETE', '/api/guides/runs/' + r.id); render(document.getElementById('main'), { parts: ['guides'] }); } } }, 'Delete')))),
      runs.deleted.map((r) => h('tr', { style: { opacity: 0.7 } }, h('td', null, r.character_name), h('td', null, r.run_label || '—'), h('td', null, 'deleted'), h('td', { class: 'small' }, relTime(r.deleted_at)),
        h('td', null, h('button', { class: 'btn small', onclick: async () => { try { await post(`/api/guides/runs/${r.id}/restore`); render(document.getElementById('main'), { parts: ['guides'] }); } catch (e) { toast(e.message, { kind: 'warn' }); } } }, 'Restore')))))),
    h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn', onclick: async () => { await createRun(); render(document.getElementById('main'), { parts: ['guides'] }); } }, icon('plus'), 'New run'),
      h('button', { class: 'btn ghost', onclick: () => go('#/settings/data') }, 'Backups & walkthrough import')));
}

// ----------------------------------------------------------------- data
export async function data(b) {
  const boot = await get('/api/bootstrap');
  const sugg = (await get('/api/import/suggest')).candidates;
  const m = boot.dex.manifest;
  const dumpPath = h('input', { class: 'input', placeholder: '/home/you/Documents/PokeMMO-Companion/Pokemmo-Dumps', value: sugg.find((x) => /Dumps$/.test(x)) || sugg[0] || '', 'aria-label': 'Dump folder' });
  const guidePath = h('input', { class: 'input', placeholder: '/home/you/Documents/PokeMMO-Companion/Storyline-guides', value: sugg.find((x) => /guides$/i.test(x)) || '', 'aria-label': 'Walkthrough folder' });
  const browse = (input, purpose) => SHELL === 'qt' ? h('button', { class: 'btn', onclick: async () => {
    const off = on('shell.folder', (d) => { if (d.purpose === purpose && d.path) { input.value = d.path; } off(); });
    await post('/api/shell/command', { action: 'pick_folder', purpose }); } }, 'Browse…') : null;
  const jobBox = h('div', { class: 'small' });
  const runImport = async (kind, folder) => {
    if (!folder.trim()) { toast('Type or choose a folder first', { kind: 'warn' }); return; }
    try {
      const det = await post('/api/import/detect', { folder: folder.trim() });
      const what = kind === 'dumps' ? Object.keys(det.dumps).join(', ') || (det.combined.length ? 'combined archive' : 'nothing recognised') : Object.keys(det.guides).join(', ') || 'no walkthrough files';
      if (kind === 'dumps' && !det.dumps.pokedex && !det.combined.length) { mount(jobBox, notice('warn', `PokedexData.zip not found in that folder (found: ${what}).`)); return; }
      if (kind === 'guides' && !Object.keys(det.guides).length) { mount(jobBox, notice('warn', 'No “<REGION> COMPLETE WALKTHROUGH.odt” files found in that folder.')); return; }
      mount(jobBox, h('div', { class: 'row' }, h('span', { class: 'dot connecting' }), `Importing (${what})…`));
      const { job } = await post('/api/import/' + kind, { folder: folder.trim() });
      const poll = async () => {
        const j = await get('/api/import/jobs/' + job);
        if (j.state === 'running') { mount(jobBox, h('div', { class: 'row' }, h('span', { class: 'dot connecting' }), (j.messages || []).slice(-1)[0] || 'Working…')); setTimeout(poll, 400); return; }
        if (j.state === 'error') { mount(jobBox, notice('bad', j.error)); return; }
        toast(kind === 'dumps' ? 'Pokédex data imported' : 'Walkthroughs imported');
        state.dexCache = null; await (await import('../core.js')).loadBoot();
        render(document.getElementById('main'), { parts: ['data'] });
      };
      poll();
    } catch (e) { mount(jobBox, notice('bad', e.message)); }
  };
  const guideSources = await Promise.all(['kanto', 'johto', 'hoenn', 'sinnoh', 'unova'].map((r) => get('/api/guides/sources/' + r)));
  const importedGuides = guideSources.map((g, i) => [['kanto', 'johto', 'hoenn', 'sinnoh', 'unova'][i], g.sources.find((s) => s.id === 'imported')]).filter(([, s]) => s);
  const ds = await get('/api/data/status');
  b.append(h('div', null, h('h2', { style: { marginTop: 0 } }, 'Data & privacy'),
    h('h3', null, 'PokeMMO data'),
    (() => { const rb = boot.dex.reference || {}; const rc = rb.counts || {};
      return h('div', { class: 'card inset small stack tight bundled-data' }, h('div', null, badge('DUMP_ONLY', 'Built in'),
        ` PokeMMO reference data, client data dated ${rb.dump_date ? fmtDate(rb.dump_date) : 'unknown'} · ${rc.species || 0} species · ${rc.location_rows || 0} encounter rows · all five region maps`),
        h('div', { class: 'muted' }, 'Ships with the Companion and works offline. Nothing to install. ',
          m && m.source_kind !== 'bundled' && !m.error ? 'Your own client data (below) is currently used instead.' : '')); })(),
    h('details', { class: 'adv-data' }, h('summary', null, 'Optional, advanced: use your own PokeMMO client files (adds your client’s icons and sprites)'),
    notice('info', h('strong', null, 'Your files stay on this computer. '), 'Never required. The Companion copies what it needs into its private data folder once and never modifies, uploads or commits your originals. Remove the personal copy any time to go back to the built-in data.'),
    ds.candidates.length ? h('div', { class: 'stack tight', style: { marginBottom: '8px' } }, h('div', { class: 'label' }, 'Found on this computer'),
      ds.candidates.map((c) => h('div', { class: 'list-row', style: { cursor: 'default' } }, icon('download'), h('div', { class: 'grow' }, h('div', { class: 'mono small' }, c.folder),
        h('div', { class: 'tiny muted' }, `contains: ${c.parts.join(', ') || 'combined archive'}${c.guides.length ? ' · walkthroughs: ' + c.guides.join(', ') : ''}`)),
      h('button', { class: 'btn small' + (ds.installed ? '' : ' primary'), onclick: () => { dumpPath.value = c.folder; runImport('dumps', c.folder); } }, ds.installed ? 'Re-install from here' : 'Install'),
      c.guides.length ? h('button', { class: 'btn small', onclick: () => runImport('guides', c.folder) }, 'Import walkthroughs') : null))) :
      h('div', { class: 'small muted', style: { marginBottom: '8px' } }, 'No PokeMMO dump found in the usual folders (Documents/PokeMMO-Companion, the PokeMMO Flatpak data folder, Downloads). Enter its folder below.'),
    ds.update_available ? notice('warn', 'Your dump has changed since it was installed — re-install to refresh. Runs, checkmarks and settings are kept.') : null,
    m && !m.error && m.source_kind !== 'bundled' ? h('div', { class: 'card inset small stack tight' }, h('div', null, badge('DUMP_ONLY', 'Imported'), ` ${fmtDate(m.imported_at, true)} · ${m.counts.species} species · ${m.counts.location_rows} location rows · ${m.counts.icons || 0} icons · ${m.counts.battle_sprites || 0} battle sprites`),
      h('div', { class: 'muted' }, Object.entries(m.sources).map(([k, v]) => `${k}: ${v.file}${v.sha256 ? ' (sha256 ' + v.sha256.slice(0, 12) + '…)' : ''}`).join(' · ')),
      (m.notes || []).map((x) => h('div', { class: 'muted' }, x))) : h('div', { class: 'small muted' }, m && m.error ? m.error : 'Not used — the built-in data is active.'),
    h('div', { class: 'row', style: { marginTop: '8px' } }, h('div', { class: 'grow' }, dumpPath), browse(dumpPath, 'dumps'), h('button', { class: 'btn primary', onclick: () => runImport('dumps', dumpPath.value) }, icon('download'), m ? 'Re-import' : 'Import')),
    h('div', { class: 'tiny muted' }, 'Folder with PokedexData.zip (and optionally PokemmoIconsDump.zip, PokemmoBattleSpritesDump.zip, ItemSpriteDump.zip), or a combined Pokemmo-Dumps archive.')),
    h('h3', null, 'Your walkthrough files (private)'),
    importedGuides.length ? h('div', { class: 'small' }, importedGuides.map(([r, s]) => h('div', null, `${cap(r)}: ${s.label.replace('Your walkthrough ', '')} · ${s.steps} steps · imported ${fmtDate(s.checked_at, true)}`))) : h('div', { class: 'small muted' }, 'None imported. Guides use the bundled milestone outline.'),
    h('div', { class: 'row', style: { marginTop: '8px' } }, h('div', { class: 'grow' }, guidePath), browse(guidePath, 'guides'), h('button', { class: 'btn primary', onclick: () => runImport('guides', guidePath.value) }, icon('download'), 'Import walkthroughs')),
    h('div', { class: 'tiny muted' }, 'Reads “KANTO COMPLETE WALKTHROUGH.odt” etc. Re-importing keeps your checkmarks (stable step IDs) and flags any step whose wording changed.'),
    jobBox,
    await spriteLibrarySection(browse),
    h('h3', null, 'Backup'),
    h('div', { class: 'row wrap' }, h('button', { class: 'btn', onclick: async () => downloadJson(`pokemmo-companion-backup-${new Date().toISOString().slice(0, 10)}.json`, await get('/api/backup/export')) }, icon('download'), 'Export backup (JSON)'),
      h('button', { class: 'btn', onclick: () => importBackup('merge') }, icon('upload'), 'Import backup — merge'),
      h('button', { class: 'btn danger', onclick: () => importBackup('replace') }, 'Import backup — replace'),
      h('button', { class: 'btn ghost', onclick: async () => { const r = await post('/api/backup/snapshot'); toast('Database snapshot saved: ' + r.path, { timeout: 7000 }); } }, 'Save database snapshot')),
    h('div', { class: 'tiny muted' }, 'Backups contain your runs, checkmarks, favourites, notes, plans, teams, observations and settings — never PokeMMO client data. A safety snapshot is taken before every import.'),
    h('h3', null, 'Storage'),
    h('div', { class: 'small' }, 'Data folder: ', h('span', { class: 'mono' }, boot.data_dir)),
    h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn ghost', onclick: async () => { if (await confirmDialog('Clear report history', 'Delete all saved Alpha/Swarm reports and TEST entries?', 'Clear', true)) { await post('/api/live/clear', {}); toast('Report history cleared'); } } }, 'Clear report history')),
    h('p', { class: 'small muted' }, 'Privacy: no telemetry, no accounts, no game memory access, no automation. Network is used for the opt-in report feed and the official news check (automatic, can be turned off in Live sources & news).')));

  async function importBackup(mode) {
    try {
      const payload = await pickJsonFile(); if (!payload) return;
      if (mode === 'replace' && !(await confirmDialog('Replace all data?', 'This replaces your runs, progress, favourites, notes, plans and settings with the backup. A safety snapshot is saved first.', 'Replace', true))) return;
      const r = await post('/api/backup/import', { payload, mode });
      toast(`Backup imported (${r.runs_added} runs${r.runs_renamed ? `, ${r.runs_renamed} imported as copies to avoid overwriting` : ''})`, { timeout: 7000 });
      setTimeout(() => location.reload(), 900);
    } catch (e) { toast(e.message, { kind: 'warn', timeout: 6000 }); }
  }
}

// Optional sprite library: animated Gen V battle sprites the user supplies (never bundled or downloaded by the app).
async function spriteLibrarySection(browse) {
  const st = await get('/api/sprites/library');
  const box = h('div', { class: 'stack tight' });
  const path = h('input', { class: 'input', placeholder: '/home/you/Downloads/sprites-master  (folder or .zip)', 'aria-label': 'Sprite library folder', value: st.source || '' });
  const msg = h('div', { class: 'small' });
  const c = st.coverage;
  const lf = st.local_forms || {};
  const refresh = () => render(document.getElementById('main'), { parts: ['data'] });
  const run = async () => {
    try {
      await post('/api/sprites/library/import', { folder: path.value.trim() });
      mount(msg, h('div', { class: 'row' }, h('span', { class: 'dot connecting' }), 'Reading the sprite files… your current library stays in use until this finishes.'));
      const poll = async () => {
        const j = (await get('/api/sprites/library')).job;
        if (j.state === 'running') { setTimeout(poll, 500); return; }
        if (j.state === 'error') { mount(msg, notice('bad', j.error)); return; }
        toast(`Sprite library installed: ${j.forms} forms, ${j.species} species${j.refused ? `, ${j.refused} files refused` : ''}`, { timeout: 7000 });
        state.dexCache = null; refresh();
      };
      poll();
    } catch (e) { mount(msg, notice('bad', e.message)); }
  };
  box.append(h('h3', null, 'Animated sprite library (optional)'),
    h('p', { class: 'small muted', style: { margin: 0 } }, 'The Companion ships no Pokémon artwork. Your PokeMMO client provides box icons and still battle sprites; ',
      `it has correct art for ${lf.verified || 0} of ${c.forms_total} alternate forms`, lf['same-as-base'] ? ` (${lf['same-as-base']} more only reuse the base art)` : '', '. ',
      'For animated Black/White-style sprites and the remaining forms you can point the Companion at your own copy of a sprite collection — for example a download of ',
      extLink('https://github.com/PokeAPI/sprites', 'PokéAPI sprites'), ' or ', extLink('https://github.com/smogon/sprites', 'Smogon sprites'),
      '. Their artwork is © Nintendo / Game Freak / The Pokémon Company (Smogon also asks to be contacted before its community-made sprites are reused), so it is copied only into your private data folder, for your own use, and never shared.'),
    st.installed ? h('div', { class: 'card inset small stack tight' },
      h('div', null, badge('LOCAL', 'Your files'), ` Installed ${fmtDate(st.imported_at, true)} from `, h('span', { class: 'mono' }, st.source)),
      h('div', null, `Forms: ${c.forms_ani} animated · ${c.forms_ani_shiny} animated shiny · ${c.forms_static} still — of ${c.forms_total}. `,
        `Species: ${c.species_ani} animated · ${c.species_ani_shiny} animated shiny — of ${c.species_total}.`),
      st.refused_count ? h('details', null, h('summary', null, `${st.refused_count} files refused`),
        h('ul', { class: 'tiny' }, st.refused.slice(0, 60).map((r) => h('li', null, h('span', { class: 'mono' }, r.path), ' — ', r.reason)))) : null) :
      h('div', { class: 'small muted' }, 'No sprite library installed. Summaries use your PokeMMO client artwork.'),
    h('div', { class: 'row' }, h('div', { class: 'grow' }, path), browse(path, 'sprites'),
      h('button', { class: 'btn primary', onclick: run }, icon('download'), st.installed ? 'Re-install' : 'Install sprite library'),
      st.installed ? h('button', { class: 'btn ghost', onclick: async () => { if (await confirmDialog('Remove sprite library', 'Remove the copied sprite files? Your source folder is not touched.', 'Remove', true)) {
        await api('DELETE', '/api/sprites/library'); state.dexCache = null; refresh(); } } }, 'Remove') : null),
    h('div', { class: 'tiny muted' }, 'Accepted layouts: PokéAPI …/black-white/animated[/shiny]/479-wash.gif, Smogon src/sprites/gen5/srotom-owash.gif, Showdown gen5ani[-shiny]/rotom-wash.gif. A file is used only for the exact species or form its name states; copies of base-form art are refused. Grid tiles keep the small static icons.'),
    msg,
    h('details', null, h('summary', { class: 'small' }, 'Form artwork report'), await formArtReport()));
  return box;
}
async function formArtReport() {
  const r = await get('/api/dex/art');
  const label = { verified: 'Client ✓', unverified: 'Client (changed)', 'same-as-base': 'Base art only', placeholder: 'Placeholder', none: '—' };
  return h('div', { class: 'stack tight' }, h('div', { class: 'tiny muted' }, `Client slots checked by eye on ${r.checked}. “Known sources” lists where an exact file name exists in each public repository (not downloaded).`),
    h('table', { class: 'table compact sprite-cov tiny' }, h('thead', null, h('tr', null, ['Form', 'Your client', 'Your library', 'Known sources'].map((x) => h('th', null, x)))),
      h('tbody', null, r.forms.map((f) => h('tr', null, h('td', null, `${f.species} — ${f.name}`),
        h('td', { title: f.local_reason }, label[f.local_status] || f.local_status),
        h('td', null, f.library.length ? f.library.join(', ').replace(/_/g, ' ') : '—'),
        h('td', null, [f.known_sources.pokeapi_animated ? 'PokéAPI anim' : null, f.known_sources.pokeapi_animated_shiny ? '+shiny' : null,
          f.known_sources.smogon_animated ? 'Smogon anim' : null, f.known_sources.pokesprite_icon ? 'PokéSprite icon' : null].filter(Boolean).join(' · ') || '—'))))));
}

// ---------------------------------------------------------------- about
async function about(b) {
  const boot = state.boot;
  b.append(h('h2', { style: { marginTop: 0 } }, 'About'),
    h('dl', { class: 'kv' }, h('dt', null, 'Version'), h('dd', null, `${boot.version} (development preview)`), h('dt', null, 'Window mode'), h('dd', null, boot.mode === 'qt' ? 'Native shell (PySide6)' : 'Browser'),
      h('dt', null, 'Data folder'), h('dd', { class: 'mono' }, boot.data_dir)),
    h('h3', null, 'Keyboard'),
    h('div', { class: 'small stack tight' }, h('div', null, h('span', { class: 'kbd' }, 'Alt+1…5'), ' switch sections · ', h('span', { class: 'kbd' }, 'Ctrl+,'), ' settings · ', h('span', { class: 'kbd' }, 'Ctrl+F'), ' search Pokédex · ',
      h('span', { class: 'kbd' }, 'Esc'), ' close details/dialogs · arrows + Enter in the Pokédex grid')),
    h('h3', null, 'What this app never does'),
    h('ul', { class: 'small', style: { color: 'var(--text-secondary)' } }, h('li', null, 'No encounter counter (PokeMMO has one).'), h('li', null, 'No reading game memory, injecting code, automating input or OCR.'),
      h('li', null, 'No GTL scraping or account login.'), h('li', null, 'No claims of live Alpha/Swarm/cave activity without a dated source.')),
    h('p', { class: 'small muted' }, 'Unofficial community project, not affiliated with PokeMMO. Pokémon names are trademarks of their owners. PokeMMO client sprites and data are only shown from your own local import and are never bundled or redistributed.'));
}

// ----------------------------------------------------------- onboarding
export async function onboarding() {
  const s = state.settings;
  let nav = s['appearance.nav'];
  const body = h('div', { class: 'stack' },
    h('p', { style: { margin: 0 } }, 'A normal desktop app for your second monitor, with optional pinned popouts over the game. A few quick choices:'),
    h('div', { class: 'field' }, h('label', null, 'Navigation'), seg([['vertical', 'Vertical sidebar'], ['horizontal', 'Horizontal top bar']], nav, (v) => { nav = v; })),
    h('div', { class: 'field' }, h('label', null, 'Your PokeMMO data (optional, recommended)'),
      h('div', { class: 'small muted' }, 'Stats, locations, moves and sprites come from your own dump files. You can import them now in Settings › Data, or later.')),
    h('div', { class: 'field' }, h('label', null, 'Guides'), h('div', { class: 'small muted' }, 'Create a named character run to track storyline progress per character.')),
    h('div', { class: 'tiny muted' }, 'No encounter counter, no game memory access, no automation. Everything you enter stays on this computer.'));
  const r = await modal({ title: 'Welcome to PokeMMO Companion 0.1.0', body, actions: [
    { label: 'Skip', value: 'skip', kind: 'ghost' }, { label: 'Create a run', value: 'run' }, { label: 'Import data now', value: 'data', kind: 'primary' }] });
  await saveSettings({ 'app.onboarded': true, 'appearance.nav': nav });
  document.dispatchEvent(new CustomEvent('settings-changed'));
  if (r === 'data') go('#/settings/data');
  if (r === 'run') { await createRun(); go('#/guides/storyline'); }
}
