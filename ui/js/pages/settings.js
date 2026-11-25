import { uiLabel } from '../i18n.js';
import { t as translateUI } from '../i18n.js';
// Settings (docs/design/16) + data import + first-run onboarding.
import { CONTEXTS } from '../sprites.js';
import { appearanceSec, layoutSec, homeSec } from './settings-theme.js';
import { h, mount, icon, get, post, api, state, setting, saveSettings, badge, notice, cap, seg, switchEl, toast, confirmDialog, modal, on, fmtDate, relTime, SHELL, extLink } from '../core.js';
import { go, openPopout, POPOUT_TOOLS } from '../shell.js';
import { downloadJson, pickJsonFile } from '../components.js';
import { createRun } from './guides.js';
import { LANGS, t } from '../i18n.js';
import { comboFromEvent, displayCombo, setRecording, loadShortcuts } from '../shortcuts.js';

const SECTIONS = [['appearance', 'Appearance & themes'], ['layout', 'Layout & scaling'], ['sprites', 'Pokémon & sprites'], ['home', 'Home'], ['language', 'Language'],
  ['startup', 'Startup & game'], ['windows', 'Windows & popouts'], ['shortcuts', 'Shortcuts'], ['notifications', 'Notifications'], ['sources', 'Live sources & news'],
  ['guides', 'Guides & characters'], ['updates', 'Updates'], ['backup', 'Backup & recovery'], ['data', 'Advanced'], ['about', 'About & credits']];
const ALIASES = { advanced: 'data', themes: 'appearance', scaling: 'layout' };
let unsub = [];
export function dispose() { unsub.forEach((u) => u()); unsub = []; }

const row = (label, desc, control) => h('div', { class: 'set-row' }, h('div', null, h('div', { style: { fontWeight: 600 } }, label), desc ? h('div', { class: 'desc' }, desc) : null), h('div', null, control));
const set = (k) => (v) => saveSettings({ [k]: v }).then(() => toast(translateUI('ui.saved'), { timeout: 1200 })).catch((e) => toast(e.message, { kind: 'warn' }));

export async function render(el, route) {
  dispose();
  const want = ALIASES[route.parts[0]] || route.parts[0];
  const sec = SECTIONS.some(([k]) => k === want) ? want : 'appearance';
  const page = h('div', { class: 'page' });
  mount(el, page);
  page.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, translateUI('ui.settings')), h('div', { class: 'sub' }, translateUI('ui.saved_on_computer')))));
  const body = h('div', { class: 'card' });
  page.append(h('div', { class: 'settings-layout' }, h('nav', { class: 'settings-nav', 'aria-label': translateUI('ui.settings_sections') },
    SECTIONS.map(([k, l]) => h('button', { class: 'chapter-btn' + (k === sec ? ' active' : ''), onclick: () => go('#/settings/' + k) }, uiLabel(l)))), body));
  await ({ appearance: appearanceSec, layout: layoutSec, home: homeSec, language, windows, shortcuts: shortcutsSec, notifications, sources, guides: guidesSec, backup: backupSec, updates: updatesSec, startup: startupSec, sprites: spritesSec, data, about })[sec](body);
}

// --------------------------------------------------------------- language
async function language(b) {
  const cur = setting('app.language') || 'en';
  b.append(h('h2', { style: { marginTop: 0 } }, translateUI('ui.language')),
    row(translateUI('ui.language_companion'), translateUI('ui.language_review'),
      h('div', { class: 'stack tight' }, LANGS.map((l) => h('label', { class: 'row' }, h('input', { type: 'radio', name: 'lang', checked: cur === l.id ? 'checked' : null,
        onchange: async () => { await saveSettings({ 'app.language': l.id }); } }),
      h('span', null, l.native, l.native !== l.label ? h('span', { class: 'tiny muted' }, ` (${l.label})`) : null),
      l.status === 'beta' ? h('span', { class: 'badge unknown' }, translateUI('ui.locale_beta')) : null)))),
    row(translateUI('ui.language_terminology'), t('lang.game_names'), h('span', { class: 'small muted' }, '—')),
    row(translateUI('ui.language_toolbar'), translateUI('ui.language_toolbar_help'),
      switchEl((setting('app.toolbar') || []).includes('language'), (v) => saveSettings({ 'app.toolbar': v ? [...new Set([...(setting('app.toolbar') || []), 'language'])] : (setting('app.toolbar') || []).filter((x) => x !== 'language') }).then(async () => (await import('../shell.js')).renderChrome()))),
    row(translateUI('ui.toolbar_note'), translateUI('ui.toolbar_note_help'),
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
          a.binding ? h('button', { class: 'btn ghost small', 'aria-label': `Clear shortcut for ${a.label}`, onclick: async () => { data = await api('PUT', '/api/shortcuts/' + a.id, { binding: null }); await loadShortcuts(); draw(); } }, translateUI('ui.clear')) : null,
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
// -------------------------------------------------------------- windows
async function windows(b) {
  const caps = (await get('/api/shell/capabilities'));
  const s = state.settings;
  const capRow = (label, ok) => h('div', { class: 'row small' }, h('span', { class: 'dot ' + (ok ? 'connected' : '') }), label, h('span', { class: 'muted' }, ok ? 'supported' : 'not available'));
  b.append(h('h2', { style: { marginTop: 0 } }, translateUI('ui.windows_popouts')),
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
      c ? h('button', { class: 'btn ghost small', title: 'Forget your size for this mode', onclick: async () => { const nx = { ...sizes }; delete nx[m]; await set(`window.${t}.sizes`)(nx); render(document.getElementById('main'), { parts: ['windows'] }); } }, translateUI('ui.reset')) : h('span', { style: { width: '52px' } }));
  });
  return h('div', { class: 'card tool-pref stack tight' },
    h('div', { class: 'row' }, h('strong', null, def.title), h('span', { class: 'grow' }), h('button', { class: 'btn small', onclick: () => openPopout(t) }, icon('popout'), 'Open')),
    h('div', { class: 'row wrap' }, h('span', { class: 'label', style: { width: '90px' } }, 'Default mode'),
      seg([['compact', translateUI('ui.compact')], ['standard', translateUI('ui.standard')], ['expanded', translateUI('ui.expanded')]], s[`window.${t}.mode`], set(`window.${t}.mode`), 'Mode')),
    h('div', { class: 'stack tight' }, sizeLine),
    h('label', { class: 'switch small' }, h('input', { type: 'checkbox', checked: s[`window.${t}.keep_size`], onchange: (e) => set(`window.${t}.keep_size`)(e.target.checked) }), h('span', null, 'Keep my size when switching modes')),
    h('div', { class: 'row wrap' },
      h('label', { class: 'switch small', title: caps.pin ? '' : 'Not supported in this mode' }, h('input', { type: 'checkbox', checked: s[`window.${t}.pinned`], disabled: caps.pin ? null : 'disabled', onchange: (e) => set(`window.${t}.pinned`)(e.target.checked) }), h('span', null, 'Pin on open')),
      h('label', { class: 'switch small', title: caps.native_windows ? '' : 'Native shell only' }, h('input', { type: 'checkbox', checked: s[`window.${t}.locked`], disabled: caps.native_windows ? null : 'disabled', onchange: (e) => set(`window.${t}.locked`)(e.target.checked) }), h('span', null, 'Lock position'))),
    h('div', { class: 'pref-sliders' }, h('span', { class: 'label' }, translateUI('ui.background')), rangeCell(`window.${t}.bg_opacity`, 35, 100),
      h('span', { class: 'label' }, translateUI('ui.window')), rangeCell(`window.${t}.window_opacity`, 40, 100, !caps.window_opacity),
      h('span', { class: 'label' }, translateUI('ui.text_size')), rangeCell(`window.${t}.text_scale`, 70, 180)));
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
  b.append(h('h2', { style: { marginTop: 0 } }, translateUI('ui.notifications')),
    notice('info', 'Every received report is saved to Live › history whatever you choose here. Toasts are the Companion’s own small window; OS notifications go through your desktop’s notification centre (its Do-Not-Disturb rules apply).'),
    row('Alpha reports', null, seg(routes, s['notify.alpha'], set('notify.alpha'))),
    row('Swarm reports', null, seg(routes, s['notify.swarm'], set('notify.swarm'))),
    row('Other reports', 'Messages without an Alpha/Swarm keyword.', seg(routes, s['notify.other'], set('notify.other'))),
    row('TEST notifications', 'For the “Send TEST notification” button in Live.', seg(routes, s['notify.test'], set('notify.test'))),
    row(translateUI('ui.timers'), 'When one of your Tools › Timers finishes. Do not disturb silences these too (the timer still completes).', seg(routes, s['notify.timer'], set('notify.timer'))),
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
  const [src, n] = await Promise.all([get('/api/live/source'), get('/api/news')]);
  b.append(h('h2', { style: { marginTop: 0 } }, translateUI('ui.live_news')),
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
  b.append(h('h2', { style: { marginTop: 0 } }, translateUI('ui.guides_characters')),
    row('Active run', 'Used by Home, the Storyline popout and legendary tracking.', runs.runs.length ? h('select', { class: 'input', style: { width: 'auto' }, onchange: (e) => set('guides.active_run')(e.target.value) },
      runs.runs.map((r) => h('option', { value: r.id, selected: r.id === runs.active ? 'selected' : null }, r.display))) : h('button', { class: 'btn', onclick: async () => { await createRun(); render(document.getElementById('main'), { parts: ['guides'] }); } }, 'Create a run')),
    h('h3', null, 'Runs'),
    h('table', { class: 'table compact' }, h('thead', null, h('tr', null, [translateUI('ui.select_character'), 'Label', 'Last region', 'Updated', ''].map((c) => h('th', null, c)))),
      h('tbody', null, runs.runs.map((r) => h('tr', null, h('td', null, r.character_name), h('td', null, r.run_label || '—'), h('td', null, cap(r.last_region)), h('td', { class: 'small' }, relTime(r.updated_at)),
        h('td', null, h('button', { class: 'btn small danger', onclick: async () => { if (await confirmDialog('Delete run', `Delete “${r.display}”? You can restore it later.`, 'Delete', true)) {
          await api('DELETE', '/api/guides/runs/' + r.id); render(document.getElementById('main'), { parts: ['guides'] }); } } }, translateUI('ui.delete'))))),
      runs.deleted.map((r) => h('tr', { style: { opacity: 0.7 } }, h('td', null, r.character_name), h('td', null, r.run_label || '—'), h('td', null, 'deleted'), h('td', { class: 'small' }, relTime(r.deleted_at)),
        h('td', null, h('button', { class: 'btn small', onclick: async () => { try { await post(`/api/guides/runs/${r.id}/restore`); render(document.getElementById('main'), { parts: ['guides'] }); } catch (e) { toast(e.message, { kind: 'warn' }); } } }, translateUI('ui.restore'))))))),
    h('div', { class: 'row wrap', style: { marginTop: '12px' } }, h('button', { class: 'btn', onclick: async () => { await createRun(); render(document.getElementById('main'), { parts: ['guides'] }); } }, icon('plus'), 'New run'),
      h('button', { class: 'btn ghost wrap', onclick: () => go('#/settings/backup') }, translateUI('ui.backup_recovery')), h('button', { class: 'btn ghost wrap', onclick: () => go('#/settings/data') }, 'Walkthrough import')));
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
  b.append(h('div', null, h('h2', { style: { marginTop: 0 } }, translateUI('ui.advanced')),
    h('p', { class: 'small muted', style: { marginTop: 0 } }, 'Everything Companion needs is built in. The options here are optional extras for people who want to use their own files.'),
    h('h3', null, 'PokeMMO data'),
    (() => { const rb = boot.dex.reference || {}; const rc = rb.counts || {};
      return h('div', { class: 'card inset small stack tight bundled-data' }, h('div', null, h('strong', null, 'Built in'),
        ` — PokeMMO reference data, client data dated ${rb.dump_date ? fmtDate(rb.dump_date) : 'unknown'} · ${rc.species || 0} species · ${rc.location_rows || 0} encounter rows`),
        h('div', { class: 'muted' }, 'Ships with the Companion and works offline. Nothing to install. ',
          m && m.source_kind !== 'bundled' && !m.error ? 'Your own client data (below) is currently used instead.' : '')); })(),
    h('details', { class: 'adv-data' }, h('summary', null, 'Optional, advanced: use your own PokeMMO client files (adds your client’s icons and sprites)'),
    notice('info', h('strong', null, 'Your files stay on this computer. '), 'Never required. The Companion copies what it needs into its private data folder once and never modifies, uploads or commits your originals. Remove the personal copy any time to go back to the built-in data.'),
    ds.candidates.length ? h('div', { class: 'stack tight', style: { marginBottom: '8px' } }, h('div', { class: 'label' }, 'Found on this computer'),
      ds.candidates.map((c) => h('div', { class: 'list-row', style: { cursor: 'default' } }, icon('download'), h('div', { class: 'grow' }, h('div', { class: 'mono small' }, c.folder),
        h('div', { class: 'tiny muted' }, `contains: ${c.parts.join(', ') || 'combined archive'}${c.guides.length ? ' · walkthroughs: ' + c.guides.join(', ') : ''}`)),
      h('button', { class: 'btn small' + (ds.installed ? '' : ' primary'), onclick: () => { dumpPath.value = c.folder; runImport('dumps', c.folder); } }, ds.installed ? 'Re-install from here' : 'Install'),
      c.guides.length ? h('button', { class: 'btn small', onclick: () => runImport('guides', c.folder) }, 'Import walkthroughs') : null))) :
      h('div', { class: 'small muted', style: { marginBottom: '8px' } }, 'No PokeMMO client files found in the usual folders (Documents/PokeMMO-Companion, the PokeMMO Flatpak data folder, Downloads). Enter its folder below.'),
    ds.update_available ? notice('warn', 'Your client files changed since they were imported — re-import to refresh. Runs, checkmarks and settings are kept.') : null,
    m && !m.error && m.source_kind !== 'bundled' ? h('div', { class: 'card inset small stack tight' }, h('div', null, h('strong', null, 'Your client files in use'), ` · imported ${fmtDate(m.imported_at, true)} · ${m.counts.species} species · ${m.counts.location_rows} location rows · ${m.counts.icons || 0} icons · ${m.counts.battle_sprites || 0} battle sprites`),
      h('div', { class: 'muted' }, Object.entries(m.sources).map(([k, v]) => `${k}: ${v.file}${v.sha256 ? ' (sha256 ' + v.sha256.slice(0, 12) + '…)' : ''}`).join(' · ')),
      (m.notes || []).map((x) => h('div', { class: 'muted' }, x))) : h('div', { class: 'small muted' }, m && m.error ? m.error : 'Not used — the built-in data is active.'),
    h('div', { class: 'row', style: { marginTop: '8px' } }, h('div', { class: 'grow' }, dumpPath), browse(dumpPath, 'dumps'), h('button', { class: 'btn primary', onclick: () => runImport('dumps', dumpPath.value) }, icon('download'), m ? 'Re-import' : 'Import')),
    h('div', { class: 'tiny muted' }, 'Folder with PokedexData.zip (and optionally PokemmoIconsDump.zip, PokemmoBattleSpritesDump.zip, ItemSpriteDump.zip), or a combined Pokemmo-Dumps archive.')),
    h('h3', null, 'Your own walkthrough files (optional)'),
    h('div', { class: 'tiny muted' }, 'The five regional walkthroughs are already built in (Guides › Storyline). Import your own .odt copies only to use a different version; your checkmarks stay with each character run.'),
    importedGuides.length ? h('div', { class: 'small' }, importedGuides.map(([r, s]) => h('div', null, `${cap(r)}: ${s.label.replace('Your walkthrough ', '')} · ${s.steps} steps · imported ${fmtDate(s.checked_at, true)}`))) : h('div', { class: 'small muted' }, 'None imported. Guides use the bundled milestone outline.'),
    h('div', { class: 'row', style: { marginTop: '8px' } }, h('div', { class: 'grow' }, guidePath), browse(guidePath, 'guides'), h('button', { class: 'btn primary', onclick: () => runImport('guides', guidePath.value) }, icon('download'), 'Import walkthroughs')),
    h('div', { class: 'tiny muted' }, 'Reads “KANTO COMPLETE WALKTHROUGH.odt” etc. Re-importing keeps your checkmarks (stable step IDs) and flags any step whose wording changed.'),
    jobBox,
    await spriteLibrarySection(browse),
    h('h3', null, 'Storage'),
    h('div', { class: 'small' }, 'Data folder: ', h('span', { class: 'mono' }, boot.data_dir)),
    h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn ghost', onclick: async () => { if (await confirmDialog('Clear report history', 'Delete all saved Alpha/Swarm reports and TEST entries?', 'Clear', true)) { await post('/api/live/clear', {}); toast('Report history cleared'); } } }, 'Clear report history')),
    h('p', { class: 'small muted' }, 'Privacy: no telemetry, no accounts, no game memory access, no automation. Network is used for the opt-in report feed and the official news check (automatic, can be turned off in Live sources & news).')));

}

// Optional sprite library: animated Gen V battle sprites the user supplies (never bundled or downloaded by the app).
async function spriteLibrarySection(browse) {
  const st = await get('/api/sprites/library');
  const box = h('div', { class: 'stack tight' });
  const path = h('input', { class: 'input', placeholder: '/home/you/Downloads/sprites-master  (folder or .zip)', 'aria-label': 'Sprite library folder', value: st.personal ? st.source || '' : '' });
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
        toast(`Your sprite library is now in use: ${j.forms} forms, ${j.species} species${j.refused ? `, ${j.refused} files not used` : ''}`, { timeout: 7000 });
        state.dexCache = null; refresh();
      };
      poll();
    } catch (e) { mount(msg, notice('bad', e.message)); }
  };
  // Built-in sprites ship with Companion; a personal library is only an optional override (native fix 2026-11-24:
  // the built-in set used to be shown as "Your files — installed from built-in").
  const own = !!st.personal;
  const controls = h('div', { class: 'stack tight' },
    h('div', { class: 'row' }, h('div', { class: 'grow' }, path), browse(path, 'sprites'),
      h('button', { class: 'btn ' + (own ? '' : 'primary'), onclick: run }, icon('download'), own ? 'Replace with this folder' : 'Use this folder instead')),
      h('div', { class: 'tiny muted' }, 'Accepted layouts: PokéAPI …/black-white/animated[/shiny]/479-wash.gif, Smogon src/sprites/gen5/srotom-owash.gif, Showdown gen5ani[-shiny]/rotom-wash.gif. A file is used only for the exact species or form its name states; copies of base-form art are refused. Grid tiles keep the small static icons.'));
  box.append(h('h3', null, 'Pokémon sprites'),
    own ? h('div', { class: 'card inset small stack tight' },
      h('div', null, h('strong', null, 'Your own sprite library is in use'), ` — installed ${fmtDate(st.imported_at, true)} from `, h('span', { class: 'mono' }, st.source)),
      c ? h('div', null, `Forms: ${c.forms_ani} animated · ${c.forms_ani_shiny} animated shiny · ${c.forms_static} still — of ${c.forms_total}. `,
        `Species: ${c.species_ani} animated · ${c.species_ani_shiny} animated shiny — of ${c.species_total}.`) : null,
      st.refused_count ? h('details', null, h('summary', null, `${st.refused_count} files were not used`),
        h('ul', { class: 'tiny' }, st.refused.slice(0, 60).map((r) => h('li', null, h('span', { class: 'mono' }, r.path), ' — ', r.reason)))) : null,
      h('div', { class: 'row' }, h('button', { class: 'btn ghost small', onclick: async () => {
        if (await confirmDialog('Go back to the built-in sprites', 'Remove the copy of your sprite library from Companion’s data folder and use the built-in sprites again? Your own folder is not touched.', 'Use built-in sprites', true)) {
          await api('DELETE', '/api/sprites/library'); state.dexCache = null; refresh(); } } }, 'Remove and use the built-in sprites')))
      : h('div', { class: 'card inset small stack tight' },
        h('div', null, h('strong', null, 'Built-in sprites'), ' — included with Companion, nothing to install.'),
        h('div', { class: 'muted' }, `${c ? c.species_total : 649} Pokémon and ${c ? c.forms_total : 82} alternate forms${st.female ? `, ${st.female} female variants` : ''}: normal and shiny, still and animated. Sources are listed in About & credits.`)),
    own ? h('details', null, h('summary', { class: 'small' }, 'Replace it with another folder'), controls)
      : h('details', null, h('summary', { class: 'small' }, 'Optional: use your own sprite collection instead'),
        h('p', { class: 'small muted' }, 'Only if you prefer your own copy of a sprite collection (for example ', extLink('https://github.com/PokeAPI/sprites', 'PokéAPI sprites'), ' or ',
          extLink('https://github.com/smogon/sprites', 'Smogon sprites'), '). It is copied into your private data folder and used instead of the built-in set until you remove it.'), controls),
    msg,
    h('details', null, h('summary', { class: 'small' }, 'Form artwork report'), await formArtReport()));
  return box;
}
async function formArtReport() {
  const r = await get('/api/dex/art');
  const label = { verified: 'Client ✓', unverified: 'Client (changed)', 'same-as-base': 'Base art only', placeholder: 'Placeholder', none: '—' };
  return h('div', { class: 'stack tight' }, h('div', { class: 'tiny muted' }, `Client slots checked by eye on ${r.checked}. “Known sources” lists where an exact file name exists in each public repository (not downloaded).`),
    h('table', { class: 'table compact sprite-cov tiny' }, h('thead', null, h('tr', null, [translateUI('ui.form'), 'Your client', 'Your library', 'Known sources'].map((x) => h('th', null, x)))),
      h('tbody', null, r.forms.map((f) => h('tr', null, h('td', null, `${f.species} — ${f.name}`),
        h('td', { title: f.local_reason }, label[f.local_status] || f.local_status),
        h('td', null, f.library.length ? f.library.join(', ').replace(/_/g, ' ') : '—'),
        h('td', null, [f.known_sources.pokeapi_animated ? 'PokéAPI anim' : null, f.known_sources.pokeapi_animated_shiny ? '+shiny' : null,
          f.known_sources.smogon_animated ? 'Smogon anim' : null, f.known_sources.pokesprite_icon ? 'PokéSprite icon' : null].filter(Boolean).join(' · ') || '—'))))));
}

// ---------------------------------------------------------------- about
// --------------------------------------------------------------- Pokémon & sprites
async function spritesSec(b) {
  const s = state.settings;
  const anim = { ...(s['sprites.animation'] || {}) };
  const size = { ...(s['sprites.size'] || {}) };
  const lib = await get('/api/sprites/library').catch(() => null);
  const redraw = () => { b.innerHTML = ''; spritesSec(b); };
  b.append(h('div', null, h('h2', { style: { marginTop: 0 } }, translateUI('ui.pokemon_sprites')),
    row('Animations', 'Follow the system’s reduced-motion setting, always allow, or switch every animation off. This overrides the choices below.',
      seg([['system', 'Follow system'], ['on', 'On'], ['off', translateUI('ui.status_off')]], s['sprites.motion'] || 'system', async (v) => { await saveSettings({ 'sprites.motion': v }); document.dispatchEvent(new CustomEvent('sprites-changed')); }, 'Animations')),
    row('Pokédex colours', 'Show the whole Pokédex grid in normal or shiny colours. Display only — nothing is marked as owned.',
      seg([['normal', translateUI('ui.normal')], ['shiny', translateUI('ui.shiny')]], s['pokedex.shiny'] ? 'shiny' : 'normal', (v) => saveSettings({ 'pokedex.shiny': v === 'shiny' }), 'Pokédex colours')),
    h('h3', null, 'Where sprites move'),
    h('div', { class: 'sprite-prefs' }, CONTEXTS.map(([id, label, def, hasSize]) => h('div', { class: 'set-row' },
      h('div', null, h('div', { style: { fontWeight: 600 } }, label), h('div', { class: 'desc' }, `Default: ${def === 'animated' ? 'animated' : 'static'}`)),
      h('div', { class: 'row wrap tight' },
        seg([['static', translateUI('ui.static')], ['animated', translateUI('ui.animated')]], anim[id] || def, async (v) => { anim[id] = v; await saveSettings({ 'sprites.animation': { ...anim } }); }, label + ' animation'),
        hasSize ? h('label', { class: 'row tight small' }, 'Size', h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': label + ' size',
          onchange: async (e) => { const v = Number(e.target.value); if (v === 100) delete size[id]; else size[id] = v; await saveSettings({ 'sprites.size': { ...size } }); } },
          [70, 85, 100, 115, 130, 150].map((p) => h('option', { value: p, selected: (size[id] || 100) === p ? 'selected' : null }, p + ' %')))) : null)))),
    h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn ghost small', onclick: async () => {
      await saveSettings({ 'sprites.animation': {}, 'sprites.size': {}, 'sprites.motion': 'system' }); toast('Sprite settings reset'); redraw(); } }, 'Reset sprite settings')),
    h('h3', null, 'Artwork'),
    lib ? h('div', { class: 'small' }, lib.source_kind === 'personal' ? 'Using your own sprite library (Settings › Advanced). ' : 'Built-in sprites: ',
      `${lib.coverage.species_static} species, ${lib.coverage.forms_ani} alternate forms, ${lib.female} female variants — static and animated, normal and shiny. `,
      lib.derived_stills ? `${lib.derived_stills} form stills are the first frame of that form’s animation. ` : '',
      h('a', { href: '#/settings/about' }, translateUI('ui.credits'))) : null));
}

// --------------------------------------------------------------- startup & game integration
async function startupSec(b) {
  const g = await get('/api/game/status');
  const s = state.settings;
  const redraw = () => { b.innerHTML = ''; startupSec(b); };
  const native = SHELL === 'qt';
  const integ = (kind, extra = {}) => async (on_) => {
    try { await post('/api/game/integration', { kind, enable: on_, ...extra }); toast(on_ ? 'Added' : 'Removed'); } catch (e) { toast(e.message, { kind: 'warn' }); }
    redraw();
  };
  const pathIn = h('input', { class: 'input', value: g.manual || '', placeholder: g.platform.startsWith('win') ? 'C:\\…\\PokeMMO.exe' : '/home/you/PokeMMO/PokeMMO.sh', 'aria-label': 'PokeMMO launcher' });
  const savePath = async (v) => { try { await api('PUT', '/api/game/launcher', { path: v }); toast(v ? 'Launcher saved' : 'Using the detected launcher'); } catch (e) { toast(e.message, { kind: 'warn' }); } redraw(); };
  if (native) unsub.push(on('shell.file', (d) => { if (d && d.purpose === 'launcher' && d.path) savePath(d.path); }));
  b.append(h('div', null, h('h2', { style: { marginTop: 0 } }, 'Startup & game integration'),
    h('p', { class: 'small muted', style: { marginTop: 0 } }, 'Everything here is optional and can be switched off again. Companion never changes, closes or reads PokeMMO.'),
    h('div', { class: 'card tight startup-hero', style: { margin: '4px 0 12px' } },
      row('Open Companion automatically when you start PokeMMO', 'Start PokeMMO the way you always do (shortcut, menu, Steam-less launcher) and Companion opens with it. '
        + 'This uses a tiny helper that starts with your login and only watches for the PokeMMO process — it never reads, changes or closes the game. '
        + 'The helper has to be running: after turning this on, log out and in once (or restart). Turn it off here at any time.',
        switchEl(g.integrations.watcher, integ('watcher')))),
    row('Reopen last page', 'Start where you left off.', switchEl(s['app.restore_last_page'], set('app.restore_last_page'))),
    h('h3', null, 'PokeMMO'),
    row('PokeMMO launcher', g.chosen ? g.chosen.label : 'Not found automatically. Choose PokeMMO.exe or PokeMMO.sh — or the Flatpak is used when installed.',
      h('div', { class: 'row wrap' }, h('button', { class: 'btn primary', disabled: g.chosen ? null : 'disabled', onclick: async () => {
        try { const r = await post('/api/game/launch'); toast(r.already_running ? 'PokeMMO is already running' : r.already_starting ? 'PokeMMO is already starting' : 'Starting PokeMMO…'); } catch (e) { toast(e.message, { kind: 'warn', timeout: 7000 }); } } }, icon('play'), g.running ? 'PokeMMO is running' : 'Launch PokeMMO'))),
    h('div', { class: 'row wrap', style: { margin: '4px 0 10px' } },
      native ? h('button', { class: 'btn small', onclick: () => post('/api/shell/command', { action: 'pick_launcher', purpose: 'launcher' }) }, 'Choose launcher…')
        : [h('div', { class: 'grow', style: { minWidth: '220px' } }, pathIn), h('button', { class: 'btn small', onclick: () => savePath(pathIn.value.trim()) }, translateUI('ui.save'))],
      g.manual ? h('button', { class: 'btn small ghost', onclick: () => savePath('') }, 'Use detected launcher') : null),
    g.launchers.length > 1 ? h('div', { class: 'tiny muted' }, 'Also found: ', g.launchers.slice(1).map((l) => l.label).join(' · ')) : null,
    row('When PokeMMO closes', 'Companion keeps running by default. It never closes PokeMMO.',
      h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': 'When PokeMMO closes', onchange: (e) => saveSettings({ 'game.on_exit': e.target.value }) },
        [['keep', 'Keep Companion running'], ['minimize', 'Minimise Companion'], ['quit', 'Quit Companion']].map(([v, l]) => h('option', { value: v, selected: s['game.on_exit'] === v ? 'selected' : null }, l)))),
    h('h3', null, 'Starting Companion'),
    row('Start Companion when you log in', 'Adds a normal autostart entry you can see in your system settings.', switchEl(g.integrations.login, integ('login', { minimized: !!s['app.start_minimized'] }))),
    row('Start minimised to the tray', 'Companion starts in the background; open it from the tray icon.', switchEl(!!s['app.start_minimized'], async (v) => {
      await saveSettings({ 'app.start_minimized': v }); if (g.integrations.login) await post('/api/game/integration', { kind: 'login', enable: true, minimized: v }); })),
    row('Reopen floating tools', 'Popouts that were open when Companion closed open again.', switchEl(!!s['app.restore_popouts'], (v) => saveSettings({ 'app.restore_popouts': v }))),
    row('“PokeMMO + Companion” shortcut', 'A menu/desktop shortcut that starts both. PokeMMO is never started twice.', switchEl(g.integrations.shortcut, integ('shortcut'))),
    h('div', { class: 'tiny muted' }, 'Opening Companion together with PokeMMO is the first option on this page.'),
    h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn ghost small', onclick: async () => {
      if (!(await confirmDialog('Remove startup entries?', 'Removes the autostart entry, the shortcut and the helper that Companion created. Nothing else is touched.', 'Remove'))) return;
      const r = await post('/api/game/integration/remove-all'); toast(`${r.removed.length} item(s) removed`); redraw(); } }, 'Remove all startup entries'))));
}

// --------------------------------------------------------------- updates (news, reference data, Companion)
async function updatesSec(b) {
  const [ref, app, n] = await Promise.all([get('/api/reference/status'), get('/api/app-update/status'), get('/api/news')]);
  const redraw = () => { b.innerHTML = ''; updatesSec(b); };
  const s = state.settings;
  const f = n.feed;
  const refUsing = ref.using === 'downloaded' ? `Updated data from ${fmtDate(ref.downloaded.dump_date)} (revision ${ref.downloaded.revision})`
    : `Built-in data from the PokeMMO client of ${fmtDate(ref.built_in.dump_date)}`;
  const latest = app.latest;
  b.append(h('div', null, h('h2', { style: { marginTop: 0 } }, translateUI('ui.updates')),
    h('p', { class: 'small muted', style: { marginTop: 0 } }, 'Three separate things, each checked in the background. Nothing interrupts a game or a running timer.'),
    h('h3', null, 'Official PokeMMO news'),
    row('Check automatically', f ? `Last successful check ${f.last_ok_at ? relTime(f.last_ok_at) : 'never'}${f.ok === false ? ` · last attempt failed (${f.error})` : ''}.` : 'Not checked yet.',
      switchEl(!!s['updates.auto_check'], (v) => saveSettings({ 'updates.auto_check': v }))),
    h('div', { class: 'row wrap' }, h('button', { class: 'btn small', onclick: async () => { const r = await post('/api/news/check'); toast(r.ok ? 'Official news checked' : `Could not check: ${r.error}`, { kind: r.ok ? 'info' : 'warn' }); redraw(); } }, icon('refresh'), 'Check now')),
    h('h3', null, 'PokeMMO reference data'),
    h('div', { class: 'small' }, refUsing, '.'),
    ref.private_superseded ? notice('info', `Your own client import (${fmtDate(ref.private_superseded.private_date)}) is older than this data, so the newer data is used. Your sprites and icons are still shown.`) : null,
    ref.configured ? [
      row('Install verified data updates automatically', ref.last_check_at ? `Last check ${relTime(ref.last_check_at)}.` : 'Not checked yet.', switchEl(!!s['reference.auto_update'], (v) => saveSettings({ 'reference.auto_update': v }))),
      ref.last_error ? notice('warn', ref.last_error) : null,
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn small', onclick: async () => { try { const r = await post('/api/reference/install'); toast(r.installed ? `Reference data updated (${fmtDate(r.dump_date)})` : r.reason); } catch (e) { toast(e.message, { kind: 'warn' }); } redraw(); } }, icon('refresh'), 'Check and update'),
        ref.previous_available ? h('button', { class: 'btn small ghost', onclick: async () => { await post('/api/reference/rollback'); toast('Previous data restored'); redraw(); } }, 'Go back to the previous data') : null,
        ref.downloaded ? h('button', { class: 'btn small ghost', onclick: async () => { await post('/api/reference/reset'); toast('Using the built-in data'); redraw(); } }, 'Use built-in data') : null)]
      : h('div', { class: 'small muted' }, 'Data updates are not set up in this build yet; the built-in data works fully offline. When they are, approved and signed data packages install here automatically, and the previous data is kept so you can go back.'),
    h('h3', null, 'PokeMMO Companion'),
    row('Check for new versions', `This is version ${app.current}.${app.checked_at ? ` Last check ${relTime(app.checked_at)}.` : ''} Companion never installs or restarts by itself.`,
      switchEl(!!s['app_updates.auto_check'], (v) => saveSettings({ 'app_updates.auto_check': v }))),
    row('Release channel', 'Stable releases only, or also pre-releases. Development builds are never offered.',
      seg([['stable', 'Stable'], ['prerelease', 'Beta & pre-releases']], s['app_updates.channel'] || 'stable', async (v) => {
        if (v === 'prerelease' && !await confirmDialog('Beta releases', 'Beta and pre-release versions are for testing: they can contain bugs. Make a backup first (Settings › Backup & recovery). You can switch back to Stable at any time; Companion will then offer the next stable release.', 'Use beta releases')) { redraw(); return; }
        saveSettings({ 'app_updates.channel': v });
      }, 'Release channel')),
    h('div', { class: 'row wrap' }, h('button', { class: 'btn small', onclick: async (e) => { e.currentTarget.disabled = true; await post('/api/app-update/check'); redraw(); } }, icon('refresh'), 'Check for updates')),
    app.ok === false ? notice('warn', `Could not check: ${app.error}`) : null,
    app.ok && !latest ? h('div', { class: 'small muted' }, 'No release has been published yet.') : null,
    latest ? h('div', { class: 'card inset stack tight' },
      h('div', null, h('strong', null, app.available ? `Version ${latest.version} is available` : `You have the latest ${latest.prerelease ? 'pre-release' : 'release'} (${latest.version})`),
        h('span', { class: 'tiny muted' }, latest.published_at ? ` · ${fmtDate(latest.published_at)}` : '')),
      app.available && latest.notes ? h('details', null, h('summary', { class: 'small' }, 'What’s new'), h('pre', { class: 'small', style: { whiteSpace: 'pre-wrap', margin: 0 } }, latest.notes)) : null,
      app.available ? h('div', { class: 'row wrap' }, extLink(latest.url, 'Open release page'),
        app.verified_downloads ? h('span', { class: 'tiny muted' }, 'Verified download: choose your file on the release page, or use the download button when it appears here.') : h('span', { class: 'tiny muted' }, 'Download it from the release page. Your personal data stays where it is.')) : null) : null));
}

// --------------------------------------------------------------- backup & recovery
async function backupSec(b) {
  const st = await get('/api/backup/list');
  const auto = st.backups.find((x) => x.label === 'automatic');
  const fmtSize = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const listEl = h('div', { class: 'list-rows' }, st.backups.length ? st.backups.map((x) => h('div', { class: 'list-row compact' },
    h('div', { class: 'grow' }, h('div', null, fmtDate(x.created_at, true), h('span', { class: 'tiny muted' }, ` · ${x.label}`)),
      h('div', { class: 'tiny muted mono ellipsis' }, `${x.name} · ${fmtSize(x.bytes)}`)),
    x.kind === 'archive' ? h('button', { class: 'btn small', onclick: () => restoreFlow({ name: x.name }) }, 'Restore…')
      : h('span', { class: 'tiny muted', title: 'A copy of the database file. Use a complete backup (.zip) to restore from inside the Companion.' }, 'database copy'))) :
    h('div', { class: 'small muted' }, translateUI('ui.settings_backup_no')));
  b.append(h('div', null, h('h2', { style: { marginTop: 0 } }, translateUI('ui.backup_recovery')),
    st.recovered ? notice(st.recovered.recovered ? 'info' : 'warn', st.recovered.recovered ? 'A restore was interrupted last time; it has been finished.' : `A restore was interrupted and could not be finished (${st.recovered.reason}). Your safety copy is in the backup folder.`) : null,
    h('p', { class: 'small muted', style: { marginTop: 0 } }, translateUI('ui.settings_backup_full')),
    row(translateUI('ui.settings_backup_auto'), auto ? `Last: ${fmtDate(auto.created_at, true)}. The newest 7 are kept.` : 'Made in the background; the newest 7 are kept.',
      h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': translateUI('ui.settings_backup_auto'), onchange: (e) => saveSettings({ 'backup.auto_hours': Number(e.target.value) }) },
        [[0, 'Off'], [6, 'Every 6 hours'], [12, 'Every 12 hours'], [24, 'Daily'], [72, 'Every 3 days'], [168, 'Weekly']].map(([v, l]) =>
          h('option', { value: v, selected: Number(st.auto_hours) === v ? 'selected' : null }, l)))),
    h('div', { class: 'row wrap', style: { margin: '10px 0' } },
      h('button', { class: 'btn primary', onclick: async (e) => { e.currentTarget.disabled = true; const r = await post('/api/backup/archive'); toast(`Backup saved: ${r.name}`, { timeout: 6000 }); b.innerHTML = ''; backupSec(b); } }, icon('download'), translateUI('ui.settings_backup_now')),
      h('button', { class: 'btn', onclick: () => pickBackupFile() }, icon('upload'), translateUI('ui.settings_backup_restore')),
      h('button', { class: 'btn ghost', onclick: async () => downloadJson(`pokemmo-companion-data-${new Date().toISOString().slice(0, 10)}.json`, await get('/api/backup/export')) }, translateUI('ui.settings_backup_export'))),
    h('div', { class: 'small' }, translateUI('ui.settings_backup_folder'), h('span', { class: 'mono' }, st.folder)),
    h('h3', null, translateUI('ui.settings_backup_saved')), listEl));

  function pickBackupFile() {
    const inp = h('input', { type: 'file', accept: '.zip,.json,application/zip,application/json', style: { display: 'none' } });
    inp.addEventListener('change', () => {
      const f = inp.files[0]; inp.remove(); if (!f) return;
      const r = new FileReader();
      if (f.name.toLowerCase().endsWith('.json')) {
        r.onload = () => { try { restoreFlow({ payload: JSON.parse(r.result) }); } catch (e) { toast('That file is not a valid backup', { kind: 'warn' }); } };
        r.readAsText(f);
      } else {
        r.onload = () => restoreFlow({ data_b64: String(r.result).split(',')[1] });
        r.readAsDataURL(f);
      }
    });
    document.body.append(inp); inp.click();
  }

  async function restoreFlow(src) {
    let pv;
    try { pv = await post('/api/backup/preview', src); } catch (e) { toast(e.message, { kind: 'warn', timeout: 7000 }); return; }
    if (pv.name) { src = { name: pv.name }; }      // an uploaded archive was saved into the backup folder
    const LABEL = { runs: 'character runs', step_status: 'storyline checkmarks', custom_guides: 'personal guides', guide_cycles: 'guide cycles',
      lib_notes: 'notes', owned_pokemon: 'collection entries', showcases: 'showcases', media: 'pictures', documents: 'teams, timers and other items' };
    const lines = Object.entries(pv.counts).filter(([k]) => LABEL[k]).map(([k, n]) => h('li', null, `${n} ${LABEL[k]}`));
    const mode = await modal({ title: 'Restore backup', body: h('div', { class: 'stack' },
      h('div', { class: 'small' }, `Made ${pv.exported_at ? fmtDate(pv.exported_at, true) : 'at an unknown time'} by Companion ${pv.app_version || '?'}.`),
      pv.newer ? notice('warn', 'This backup was made by a newer version of Companion and cannot be restored here.') : null,
      h('ul', { class: 'small', style: { margin: 0 } }, lines),
      pv.runs_conflicting || pv.documents_conflicting ? h('div', { class: 'small muted' }, `${pv.runs_conflicting} run(s) and ${pv.documents_conflicting} item(s) already exist here. Merge keeps yours and adds the backup’s versions as copies, with their links intact.`) : null,
      h('div', { class: 'small muted' }, 'A safety copy of your current data is saved first.')),
    actions: [{ label: translateUI('ui.cancel'), value: null, kind: 'ghost' }, { label: 'Replace my data', value: 'replace', kind: 'danger' }, { label: 'Merge', value: 'merge', kind: 'primary' }] });
    if (!mode || pv.newer) return;
    if (mode === 'replace' && !(await confirmDialog('Replace all your data?', 'Everything you created in Companion is replaced by this backup. A safety copy is saved first, so this can be undone by restoring it.', 'Replace', true))) return;
    try {
      const r = src.payload ? await post('/api/backup/import', { payload: src.payload, mode }) : await post('/api/backup/restore', { ...src, mode, confirm: mode === 'replace' });
      toast(`Backup restored${r.runs_renamed ? ` — ${r.runs_renamed} run(s) added as copies` : ''}.`, { timeout: 7000 });
      setTimeout(() => location.reload(), 900);
    } catch (e) { toast(e.message, { kind: 'warn', timeout: 7000 }); }
  }
}

async function about(b) {
  const boot = state.boot;
  const discord = boot.community && boot.community.discord;
  b.append(h('h2', { style: { marginTop: 0 } }, translateUI('ui.about_credits')),
    h('dl', { class: 'kv' }, h('dt', null, 'Version'), h('dd', null, `${boot.version} (development preview)`), h('dt', null, 'Window mode'), h('dd', null, boot.mode === 'qt' ? 'Native shell (PySide6)' : 'Browser'),
      h('dt', null, translateUI('ui.settings_data_folder')), h('dd', { class: 'mono' }, boot.data_dir)),
    discord ? h('div', null, h('h3', null, translateUI('ui.community')),
      h('p', { class: 'small', style: { marginTop: 0 } }, 'Questions, beta testing, ideas and release news are on the PokeMMO Companion Discord. Joining is optional — Companion never needs a Discord account. ',
        extLink(discord, translateUI('ui.discord_join')))) : null,
    h('section', null, h('h3', null, translateUI('ui.about_developer')),
      h('div', { class: 'stack tight small' },
        h('strong', null, 'Haqzo — Creator & Developer'),
        h('div', null, 'PokeMMO player and community creator developing tools, themes and mods.'),
        h('div', null, 'PokeMMO Companion, Better Default, Better Items, and ROM Patch Manager (co-developed with MaToRiuKo).'),
        h('div', { class: 'row wrap' }, extLink('https://github.com/haqzo', 'GitHub'),
          discord ? extLink(discord, 'Discord') : null))),
    h('h3', null, translateUI('ui.credits')),
    h('ul', { class: 'small', style: { color: 'var(--text-secondary)', marginTop: 0 } },
      h('li', null, 'Pokémon sprites: Gen V Black/White sprites from the PokeAPI/sprites repository (CC0 repository; images © Nintendo / Creatures Inc. / GAME FREAK / The Pokémon Company).'),
      h('li', null, 'Item icons and reference data: from the PokeMMO client.'),
      h('li', null, 'Regional walkthroughs: by their original author, included with permission.'),
      h('li', null, 'Theme palettes: Catppuccin (MIT) and enkia’s Tokyo Night (MIT).'),
      h('li', null, 'Alpha and Swarm reports and Phenomenon reference examples · ', extLink(boot.alphapedia.website, 'Alphapedia'),
        ' · ', extLink(boot.alphapedia.discord, 'Alphapedia Discord'))),
    h('h3', null, translateUI('ui.diagnostics')),
    h('p', { class: 'small muted', style: { marginTop: 0 } }, 'For troubleshooting: versions, window system and a log with private details removed (session tokens, your home folder and user name). Nothing is sent anywhere — you decide whether to share the file.'),
    h('div', { class: 'row wrap' }, h('button', { class: 'btn small', onclick: async () => {
      const d = await get('/api/diagnostics');
      const blob = new Blob([JSON.stringify(d.report, null, 1) + '\n\n----- log (sanitized) -----\n' + d.log], { type: 'text/plain' });
      const a = h('a', { href: URL.createObjectURL(blob), download: `pokemmo-companion-diagnostics-${new Date().toISOString().slice(0, 10)}.txt` });
      document.body.append(a); a.click(); a.remove(); } }, icon('download'), translateUI('ui.save_diagnostics'))),
    h('h3', null, 'Keyboard'),
    h('div', { class: 'small stack tight' }, h('div', null, h('span', { class: 'kbd' }, 'Alt+1…5'), ' switch sections · ', h('span', { class: 'kbd' }, 'Ctrl+,'), ' settings · ', h('span', { class: 'kbd' }, 'Ctrl+F'), ' search Pokédex · ',
      h('span', { class: 'kbd' }, 'Esc'), ' close details/dialogs · arrows + Enter in the Pokédex grid')),
    h('h3', null, 'What this app never does'),
    h('ul', { class: 'small', style: { color: 'var(--text-secondary)' } }, h('li', null, 'No encounter counter (PokeMMO has one).'), h('li', null, 'No reading game memory, injecting code, automating input or OCR.'),
      h('li', null, 'No GTL scraping or account login.'), h('li', null, 'No claims of live Alpha/Swarm/cave activity without a dated source.')),
    h('p', { class: 'small muted' }, 'Unofficial community project, not affiliated with PokeMMO. Pokémon names are trademarks of their owners. The built-in reference data was produced from the PokeMMO client (snapshot 16 Nov 2026); client sprites and icons are only shown from your own optional import.'));
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
