import { formLabel, gameTerm, speciesLabel } from '../game-locale.js';
import { uiLabel, shortcutLabel } from '../i18n.js';
import { t as translateUI } from '../i18n.js';
// Settings (docs/design/16) + data import + first-run onboarding.
import { CONTEXTS, defaultAnimation } from '../sprites.js';
import { appearanceSec, layoutSec, homeSec } from './settings-theme.js';
import { h, mount, icon, get, post, api, apiErrorText, isShortcutConflict, state, setting, saveSettings, badge, notice, cap, seg, switchEl, toast, confirmDialog, modal, on, fmtDate, relTime, SHELL, extLink } from '../core.js';
import { go, openPopout, POPOUT_TOOLS } from '../shell.js';
import { downloadJson, pickJsonFile } from '../components.js';
import { createRun } from './guides.js';
import { communityEnabled, communitySourceText } from './community.js';
import { LANGS, t } from '../i18n.js';
import { comboFromEvent, displayCombo, setRecording, loadShortcuts } from '../shortcuts.js';

const SECTIONS = [['appearance', 'Appearance & themes'], ['layout', 'Layout & scaling'], ['sprites', 'Pokémon & sprites'], ['performance', 'Performance'], ['home', 'Home'], ['language', 'Language'],
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
  await ({ appearance: appearanceSec, layout: layoutSec, home: homeSec, language, windows, shortcuts: shortcutsSec, notifications, sources, guides: guidesSec, backup: backupSec, updates: updatesSec, startup: startupSec, sprites: spritesSec, performance: performanceSec, data, about })[sec](body);
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
    btn.textContent = translateUI('ui.b272_settings_001');
    btn.classList.add('recording');
    const stop = () => { setRecording(false); document.removeEventListener('keydown', onKey, true); };
    const onKey = async (e) => {
      e.preventDefault(); e.stopPropagation();
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
      stop();
      if (e.key === 'Escape') { draw(); return; }
      const combo = comboFromEvent(e);
      if (!combo) { toast(translateUI('ui.b272_settings_002'), { kind: 'warn' }); draw(); return; }
      try { data = await api('PUT', '/api/shortcuts/' + a.id, { binding: combo }); toast(`${shortcutLabel(a.label)}: ${displayCombo(combo)}`); }
      catch (err) {
        if (isShortcutConflict(err) && await confirmDialog(translateUI('ui.b272_settings_003'), err.message + translateUI('settings.replace_question'), translateUI('settings.replace'))) {
          try { data = await api('PUT', '/api/shortcuts/' + a.id, { binding: combo, replace: true }); } catch (x) { toast(x.message, { kind: 'warn' }); }
        } else if (!isShortcutConflict(err)) toast(err.message, { kind: 'warn' });
      }
      await loadShortcuts(); draw();
    };
    document.addEventListener('keydown', onKey, true);
  };
  const draw = () => {
    const groups = {};
    for (const a of data.actions.filter((x) => !q || x.label.toLowerCase().includes(q) || shortcutLabel(x.label).toLowerCase().includes(q) || x.group.toLowerCase().includes(q) || shortcutLabel(x.group).toLowerCase().includes(q) || (x.binding || '').toLowerCase().includes(q))) (groups[a.group] ||= []).push(a);
    mount(listEl, Object.entries(groups).map(([g, acts]) => h('section', { class: 'stack tight' }, h('h3', { style: { margin: '8px 0 0' } }, shortcutLabel(g)),
      acts.map((a) => {
        const rec = h('button', { class: 'btn small kb-rec', 'aria-label': translateUI('settings.shortcut_change_for', { label: shortcutLabel(a.label) }), onclick: (e) => record(a, e.currentTarget) }, a.binding ? translateUI('settings.shortcut_change') : translateUI('settings.shortcut_assign'));
        return h('div', { class: 'set-row kb-row' }, h('div', null, h('div', { style: { fontWeight: 600 } }, shortcutLabel(a.label)),
          h('div', { class: 'desc' }, { app: translateUI('ui.b272_settings_005'), guides: translateUI('ui.b272_settings_006'), pokedex: translateUI('ui.b272_settings_007'), notes: translateUI('ui.b272_settings_008'), items: t('items.title'), links: translateUI('ui.b272_settings_009') }[a.scope] || a.scope,
            a.default && a.default !== a.binding ? translateUI('settings.shortcut_default', { key: displayCombo(a.default) }) : '')),
        h('div', { class: 'row' }, h('kbd', { class: 'kb' + (a.binding ? '' : ' none') }, displayCombo(a.binding)), rec,
          a.binding ? h('button', { class: 'btn ghost small', 'aria-label': translateUI('settings.shortcut_clear_for', { label: shortcutLabel(a.label) }), onclick: async () => { data = await api('PUT', '/api/shortcuts/' + a.id, { binding: null }); await loadShortcuts(); draw(); } }, translateUI('ui.clear')) : null,
          a.default !== a.binding ? h('button', { class: 'btn ghost small', onclick: async () => {
            try { data = await api('PUT', '/api/shortcuts/' + a.id, { reset: true }); } catch (err) {
              if (isShortcutConflict(err)) {
                if (await confirmDialog(translateUI('ui.b272_settings_004'), err.message + translateUI('settings.replace_question'), translateUI('settings.replace'))) data = await api('PUT', '/api/shortcuts/' + a.id, { reset: true, replace: true });
              } else toast(err.message, { kind: 'warn' }); }
            await loadShortcuts(); draw(); } }, t('common.reset')) : null));
      }))));
  };
  b.append(h('h2', { style: { marginTop: 0 } }, t('shortcuts.title')),
    notice('info', shortcutLabel(data.global_note)),
    row(translateUI('ui.b272_settings_010'), translateUI('ui.b272_settings_011'), switchEl(setting('shortcuts.enabled') !== false, set('shortcuts.enabled'))),
    row(translateUI('ui.b272_settings_012'), translateUI('ui.b272_settings_013'), switchEl(false, () => toast(translateUI('ui.b272_settings_014'), { kind: 'warn' }))),
    h('div', { class: 'row', style: { margin: '8px 0' } }, h('div', { class: 'search grow' }, icon('search'), h('input', { class: 'input', type: 'search', placeholder: translateUI('ui.b272_settings_015'), 'aria-label': translateUI('ui.b272_settings_016'),
      oninput: (e) => { q = e.target.value.toLowerCase(); draw(); } })),
    h('button', { class: 'btn ghost', onclick: async () => { if (await confirmDialog(translateUI('ui.b272_settings_017'), translateUI('ui.b272_settings_018'), t('common.reset'))) { data = await post('/api/shortcuts/reset'); await loadShortcuts(); draw(); } } }, translateUI('ui.b272_settings_019'))),
    listEl,
    h('p', { class: 'tiny muted' }, translateUI('settings.shortcut_help')));
  draw();
}

// ------------------------------------------------------------ appearance
// -------------------------------------------------------------- windows
const CAPABILITY_NOTES = {"Browser mode: popouts open as browser windows. Pin/always-on-top, window opacity and native toasts need the native shell (PySide6).":"settings.cap_browser","Native Wayland: the compositor controls window position and stacking, so Pin and position restore are disabled. Relaunch with ./run.sh --xwayland (or Settings › Window backend) to enable them.":"settings.cap_wayland","Pin keeps a popout above normal windows. Exclusive-fullscreen games may still cover it — use windowed/borderless PokeMMO.":"settings.cap_pin","No system tray found: closing the main window quits the Companion.":"settings.cap_tray"};
export function capabilityNote(note) {
  return Object.hasOwn(CAPABILITY_NOTES, note) ? translateUI(CAPABILITY_NOTES[note]) : note;
}
async function windows(b) {
  const caps = (await get('/api/shell/capabilities'));
  const s = state.settings;
  const capRow = (label, ok) => h('div', { class: 'row small' }, h('span', { class: 'dot ' + (ok ? 'connected' : '') }), label, h('span', { class: 'muted' }, ok ? translateUI('settings.supported') : translateUI('settings.not_available')));
  b.append(h('h2', { style: { marginTop: 0 } }, translateUI('ui.windows_popouts')),
    h('div', { class: 'card inset stack tight' }, h('div', null, h('strong', null, caps.mode === 'qt' ? translateUI('ui.b272_settings_020') : translateUI('ui.b272_settings_021')), h('span', { class: 'muted small' }, translateUI('settings.platform', { name: caps.platform }))),
      h('div', { class: 'grid-3' }, capRow(translateUI('ui.b272_settings_022'), caps.native_windows || caps.mode === 'browser'), capRow(translateUI('ui.b272_settings_023'), caps.pin), capRow(translateUI('ui.b272_settings_024'), caps.window_opacity),
        capRow(translateUI('ui.b272_settings_025'), caps.toast_window), capRow(translateUI('ui.b272_settings_026'), caps.tray), capRow(translateUI('ui.b272_settings_027'), caps.position)),
      (caps.notes || []).map((n) => h('div', { class: 'small muted' }, '• ', capabilityNote(n)))),
    row(translateUI('ui.b272_settings_028'), translateUI('ui.b272_settings_029'),
      seg([['auto', translateUI('settings.auto')], ['xwayland', 'XWayland'], ['wayland', translateUI('ui.b272_settings_030')]], s['app.window_backend'], set('app.window_backend'))),
    row(translateUI('ui.b272_settings_031'), translateUI('ui.b272_settings_032'),
      seg([['quit', translateUI('ui.b272_settings_033')], ['tray', translateUI('ui.b272_settings_034')]], s['app.close_behavior'], (v) => {
        if (v === 'tray' && !caps.tray) { toast(translateUI('ui.b272_settings_035'), { kind: 'warn' }); }
        set('app.close_behavior')(v); })),
    h('h3', null, translateUI('ui.b272_settings_036')),
    h('p', { class: 'small muted', style: { marginTop: 0 } }, translateUI('settings.window_help')),
    h('div', { class: 'tool-pref-grid' }, Object.entries(POPOUT_TOOLS).map(([t, def]) => toolPrefCard(t, def, caps))),
    h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn ghost', onclick: async () => {
      if (await confirmDialog(translateUI('ui.b272_settings_037'), translateUI('ui.b272_settings_038'))) { await post('/api/settings/reset', { prefix: 'window.' }); location.reload(); } } }, translateUI('ui.b272_settings_039'))));
}
function toolPrefCard(toolId, def, caps) {
  const s = state.settings;
  const presets = (state.boot.window_presets || {})[toolId] || {};
  const sizes = s[`window.${toolId}.sizes`] || {};
  const sizeLine = ['compact', 'standard', 'expanded'].map((m) => {
    const p = presets[m] || [];
    const c = sizes[m];
    return h('div', { class: 'row small', style: { justifyContent: 'space-between' } }, h('span', { class: 'muted' }, uiLabel(cap(m))),
      h('span', null, c ? translateUI('settings.your_size', { w: c.w, h: c.h }) : translateUI('settings.preset_size', { w: p[0], h: p[1] })),
      c ? h('button', { class: 'btn ghost small', title: translateUI('ui.b272_settings_040'), onclick: async () => { const nx = { ...sizes }; delete nx[m]; await set(`window.${toolId}.sizes`)(nx); render(document.getElementById('main'), { parts: ['windows'] }); } }, translateUI('ui.reset')) : h('span', { style: { width: '52px' } }));
  });
  return h('div', { class: 'card tool-pref stack tight' },
    h('div', { class: 'row' }, h('strong', null, (def.i18n ? t(def.i18n) : uiLabel(def.title))), h('span', { class: 'grow' }), h('button', { class: 'btn small', onclick: () => openPopout(toolId) }, icon('popout'), t('common.open'))),
    h('div', { class: 'row wrap' }, h('span', { class: 'label', style: { width: '90px' } }, translateUI('ui.b272_settings_041')),
      seg([['compact', translateUI('ui.compact')], ['standard', translateUI('ui.standard')], ['expanded', translateUI('ui.expanded')]], s[`window.${toolId}.mode`], set(`window.${toolId}.mode`), translateUI('settings.mode'))),
    h('div', { class: 'stack tight' }, sizeLine),
    h('label', { class: 'switch small' }, h('input', { type: 'checkbox', checked: s[`window.${toolId}.keep_size`], onchange: (e) => set(`window.${toolId}.keep_size`)(e.target.checked) }), h('span', null, translateUI('ui.b272_settings_042'))),
    h('div', { class: 'row wrap' },
      h('label', { class: 'switch small', title: caps.pin ? '' : translateUI('ui.b272_settings_043') }, h('input', { type: 'checkbox', checked: s[`window.${toolId}.pinned`], disabled: caps.pin ? null : 'disabled', onchange: (e) => set(`window.${toolId}.pinned`)(e.target.checked) }), h('span', null, translateUI('ui.b272_settings_044'))),
      h('label', { class: 'switch small', title: caps.native_windows ? '' : translateUI('ui.b272_settings_045') }, h('input', { type: 'checkbox', checked: s[`window.${toolId}.locked`], disabled: caps.native_windows ? null : 'disabled', onchange: (e) => set(`window.${toolId}.locked`)(e.target.checked) }), h('span', null, translateUI('ui.b272_settings_046')))),
    h('div', { class: 'pref-sliders' }, h('span', { class: 'label' }, translateUI('ui.background')), rangeCell(`window.${toolId}.bg_opacity`, 35, 100, false, translateUI('ui.background')),
      h('span', { class: 'label' }, translateUI('ui.window')), rangeCell(`window.${toolId}.window_opacity`, 40, 100, !caps.window_opacity, translateUI('ui.window')),
      h('span', { class: 'label' }, translateUI('ui.text_size')), rangeCell(`window.${toolId}.text_scale`, 70, 180, false, translateUI('ui.text_size'))));
}
function rangeCell(key, min, max, disabled, label = key) {
  const lbl = h('span', { class: 'tiny muted', style: { width: '34px', display: 'inline-block' } }, state.settings[key] + '%');
  return h('div', { class: 'row', style: { minWidth: '140px' } }, h('input', { type: 'range', min, max, step: 5, value: state.settings[key], disabled: disabled ? 'disabled' : null, 'aria-label': label,
    oninput: (e) => { lbl.textContent = e.target.value + '%'; }, onchange: (e) => set(key)(Number(e.target.value)) }), lbl);
}

// --------------------------------------------------------- notifications
async function notifications(b) {
  const s = state.settings;
  const n = state.boot.notifier;
  const routes = [['off', translateUI('settings.off')], ['toast', translateUI('settings.toast')], ['os', translateUI('settings.os')], ['both', translateUI('settings.both')]];
  b.append(h('h2', { style: { marginTop: 0 } }, translateUI('ui.notifications')),
    notice('info', translateUI('settings.notification_help')),
    row(translateUI('ui.b272_settings_047'), null, seg(routes, s['notify.alpha'], set('notify.alpha'))),
    row(translateUI('ui.b272_settings_048'), null, seg(routes, s['notify.swarm'], set('notify.swarm'))),
    row(translateUI('ui.b272_settings_049'), translateUI('ui.b272_settings_050'), seg(routes, s['notify.other'], set('notify.other'))),
    row(translateUI('ui.b272_settings_051'), translateUI('ui.b272_settings_052'), seg(routes, s['notify.test'], set('notify.test'))),
    row(translateUI('ui.timers'), translateUI('settings.timer_alert_help'), seg(routes, s['notify.timer'], set('notify.timer'))),
    row(translateUI('ui.b272_settings_053'), translateUI('ui.b272_settings_054'), switchEl(s['notify.quiet'], set('notify.quiet'))),
    row(translateUI('ui.b272_settings_055'), translateUI('ui.b272_settings_056'), seg([['top-left', '↖'], ['top-right', '↗'], ['bottom-left', '↙'], ['bottom-right', '↘']], s['notify.toast_corner'], set('notify.toast_corner'))),
    row(translateUI('ui.b272_settings_057'), null, seg([['primary', translateUI('ui.b272_settings_058')], ['main-window', translateUI('ui.b272_settings_059')]], s['notify.toast_screen'], set('notify.toast_screen'))),
    row(translateUI('ui.b272_settings_060'), null, h('div', { class: 'row' }, h('input', { class: 'input', type: 'number', min: 3, max: 60, value: s['notify.toast_duration'], style: { width: '90px' }, onchange: (e) => set('notify.toast_duration')(Number(e.target.value)) }), translateUI('settings.seconds'))),
    row(translateUI('ui.b272_settings_061'), null, rangeCell('notify.toast_opacity', 60, 100)),
    row(translateUI('ui.b272_settings_062'), null, h('div', { class: 'row' }, h('input', { class: 'input', type: 'number', min: 1, max: 365, value: s['notify.retention_days'], style: { width: '90px' }, onchange: (e) => set('notify.retention_days')(Number(e.target.value)) }), translateUI('settings.days'))),
    row(translateUI('ui.b272_settings_063'), n.available ? translateUI('ui.b272_settings_064') : apiErrorText(n.reason), h('span', { class: 'badge ' + (n.available ? 'verified' : 'unknown') }, n.backend)),
    h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn', onclick: async () => { const r = await post('/api/live/test', { kind: 'alpha' }); const d = r.delivery || {};
      toast(translateUI('settings.test_delivery', { toast: d.toast ? (d.toast.delivered ? translateUI('settings.shown') : translateUI('settings.not_shown')) : translateUI('settings.off'), os: d.os ? (d.os.delivered ? translateUI('settings.sent') : translateUI('settings.failed', { error: apiErrorText(d.os.error) || '' })) : translateUI('settings.off') }), { timeout: 6000 }); } }, icon('bell'), translateUI('settings.send_test'))));
}

// -------------------------------------------------------------- sources
async function sources(b) {
  const [src, n] = await Promise.all([get('/api/live/source'), get('/api/news')]);
  const communityStatus = h('span', { class: 'small muted' }, communitySourceText(), ' · ', translateUI('community.source_unavailable'));
  b.append(h('h2', { style: { marginTop: 0 } }, translateUI('ui.live_news')),
    row(translateUI('community.name'), translateUI('community.local_only'),
      h('label', { class: 'row wrap' }, h('input', { type: 'checkbox', class: 'check', checked: communityEnabled(),
        'aria-label': translateUI('community.enable'), onchange: async (e) => {
          await set('live.community.enabled')(e.target.checked);
          communityStatus.textContent = communitySourceText() + ' · ' + translateUI('community.source_unavailable');
        } }), communityStatus)),
    row(translateUI('ui.b272_settings_065'), translateUI('ui.b272_settings_066'),
      h('div', { class: 'stack tight' }, h('div', { class: 'row' }, h('span', { class: 'dot ' + (src.enabled ? src.status : '') }), src.enabled ? uiLabel(cap(src.status)) : translateUI('settings.off'),
        src.last_success_at ? h('span', { class: 'small muted' }, translateUI('settings.last_data'), relTime(src.last_success_at)) : null),
      h('div', { class: 'tiny muted' }, src.payload_note || ''),
      src.enabled ? h('button', { class: 'btn small', onclick: async () => { await saveSettings({ 'live.ntfy.enabled': false }); render(document.getElementById('main'), { parts: ['sources'] }); } }, translateUI('settings.turn_off')) :
        h('button', { class: 'btn small', onclick: () => go('#/live/reports') }, translateUI('settings.connect_live')))),
    row(translateUI('ui.b272_settings_067'), translateUI('ui.b272_settings_068'), h('div', { class: 'row wrap' },
      h('input', { class: 'input', style: { width: '260px' }, value: state.settings['live.ntfy.server'], onchange: (e) => set('live.ntfy.server')(e.target.value.trim()) }),
      h('input', { class: 'input', style: { width: '200px' }, value: state.settings['live.ntfy.topic'], title: translateUI('settings.topics'), onchange: (e) => set('live.ntfy.topic')(e.target.value.trim()) }))),
    row(translateUI('ui.b272_settings_069'), translateUI('settings.swarm_help'),
      h('div', { class: 'row' }, h('input', { class: 'input', type: 'number', min: 5, max: 120, value: state.settings['live.swarm_estimate_minutes'], style: { width: '80px' },
        'aria-label': translateUI('settings.swarm_duration'), onchange: (e) => set('live.swarm_estimate_minutes')(Math.max(5, Math.min(120, Number(e.target.value) || 20))) }), h('span', { class: 'small' }, translateUI('settings.minutes')))),
    row(translateUI('ui.b272_settings_070'), translateUI('settings.catchup_help'),
      switchEl(state.settings['live.current_include_catchup'] !== false, set('live.current_include_catchup'))),
    row(translateUI('ui.b272_settings_071'), translateUI('settings.news_checked', { date: fmtDate(n.snapshot_checked_at) }), h('span', { class: 'small' }, translateUI('settings.news_counts', { posts: n.articles.length, events: n.events.length }))),
    row(translateUI('ui.b272_settings_072'), translateUI('settings.feed_help'),
      h('div', { class: 'row wrap' }, switchEl(state.settings['updates.auto_check'], set('updates.auto_check')),
        h('span', { class: 'small' }, translateUI('settings.every')), h('input', { class: 'input', type: 'number', min: 1, max: 24, value: state.settings['updates.check_hours'], style: { width: '70px' },
          onchange: (e) => set('updates.check_hours')(Number(e.target.value)) }), h('span', { class: 'small' }, translateUI('settings.hours')))),
    row(translateUI('ui.b272_settings_073'), translateUI('ui.b272_settings_074'),
      h('div', { class: 'stack tight' }, h('button', { class: 'btn small', onclick: async (e) => { e.target.disabled = true; const r = await post('/api/news/check');
        toast(r.ok ? translateUI('settings.checked_posts', { count: r.count }) : translateUI('settings.refresh_failed', { error: apiErrorText(r.error) }), { kind: r.ok ? 'info' : 'warn', timeout: 6000 }); render(document.getElementById('main'), { parts: ['sources'] }); } }, icon('refresh'), translateUI('settings.check_now')),
      n.feed ? h('span', { class: 'small muted' }, n.feed.ok ? translateUI('settings.last_check_ok', { date: relTime(n.feed.checked_at) }) : translateUI('settings.last_check_failed', { date: relTime(n.feed.checked_at), error: apiErrorText(n.feed.error) })) : h('span', { class: 'small muted' }, translateUI('settings.never_checked')))),
    row(translateUI('ui.b272_settings_075'), translateUI('settings.no_feed'), badge('UNKNOWN', translateUI('settings.not_connected'))));
}

// --------------------------------------------------------------- guides
async function guidesSec(b) {
  const runs = await get('/api/guides/runs');
  b.append(h('h2', { style: { marginTop: 0 } }, translateUI('ui.guides_characters')),
    row(translateUI('ui.b272_settings_076'), translateUI('settings.run_help'), runs.runs.length ? h('select', { class: 'input', style: { width: 'auto' }, onchange: (e) => set('guides.active_run')(e.target.value) },
      runs.runs.map((r) => h('option', { value: r.id, selected: r.id === runs.active ? 'selected' : null }, r.display))) : h('button', { class: 'btn', onclick: async () => { await createRun(); render(document.getElementById('main'), { parts: ['guides'] }); } }, translateUI('settings.create_run'))),
    h('h3', null, translateUI('settings.runs')),
    h('table', { class: 'table compact' }, h('thead', null, h('tr', null, [translateUI('ui.select_character'), translateUI('settings.label'), translateUI('settings.last_region'), translateUI('settings.updated'), ''].map((c) => h('th', null, c)))),
      h('tbody', null, runs.runs.map((r) => h('tr', null, h('td', null, r.character_name), h('td', null, r.run_label || '—'), h('td', null, gameTerm('region', cap(r.last_region))), h('td', { class: 'small' }, relTime(r.updated_at)),
        h('td', null, h('button', { class: 'btn small danger', onclick: async () => { if (await confirmDialog(translateUI('settings.delete_run'), translateUI('settings.delete_run_confirm', { name: r.display }), t('common.delete'), true)) {
          await api('DELETE', '/api/guides/runs/' + r.id); render(document.getElementById('main'), { parts: ['guides'] }); } } }, translateUI('ui.delete'))))),
      runs.deleted.map((r) => h('tr', { style: { opacity: 0.7 } }, h('td', null, r.character_name), h('td', null, r.run_label || '—'), h('td', null, translateUI('settings.deleted')), h('td', { class: 'small' }, relTime(r.deleted_at)),
        h('td', null, h('button', { class: 'btn small', onclick: async () => { try { await post(`/api/guides/runs/${r.id}/restore`); render(document.getElementById('main'), { parts: ['guides'] }); } catch (e) { toast(e.message, { kind: 'warn' }); } } }, translateUI('ui.restore'))))))),
    h('div', { class: 'row wrap', style: { marginTop: '12px' } }, h('button', { class: 'btn', onclick: async () => { await createRun(); render(document.getElementById('main'), { parts: ['guides'] }); } }, icon('plus'), translateUI('settings.new_run')),
      h('button', { class: 'btn ghost wrap', onclick: () => go('#/settings/backup') }, translateUI('ui.backup_recovery')), h('button', { class: 'btn ghost wrap', onclick: () => go('#/settings/data') }, translateUI('settings.walkthrough_import'))));
}

// ----------------------------------------------------------------- data
export async function data(b) {
  const boot = await get('/api/bootstrap');
  const sugg = (await get('/api/import/suggest')).candidates;
  const m = boot.dex.manifest;
  const dumpPath = h('input', { class: 'input', placeholder: '/home/you/Documents/PokeMMO-Companion/Pokemmo-Dumps', value: sugg.find((x) => /Dumps$/.test(x)) || sugg[0] || '', 'aria-label': translateUI('advanced.dump_folder') });
  const guidePath = h('input', { class: 'input', placeholder: '/home/you/Documents/PokeMMO-Companion/Storyline-guides', value: sugg.find((x) => /guides$/i.test(x)) || '', 'aria-label': translateUI('advanced.guide_folder') });
  const browse = (input, purpose) => SHELL === 'qt' ? h('button', { class: 'btn', onclick: async () => {
    const off = on('shell.folder', (d) => { if (d.purpose === purpose && d.path) { input.value = d.path; } off(); });
    await post('/api/shell/command', { action: 'pick_folder', purpose }); } }, translateUI('advanced.browse')) : null;
  const jobBox = h('div', { class: 'small' });
  const runImport = async (kind, folder) => {
    if (!folder.trim()) { toast(translateUI('advanced.choose_folder'), { kind: 'warn' }); return; }
    try {
      const det = await post('/api/import/detect', { folder: folder.trim() });
      const what = kind === 'dumps' ? Object.keys(det.dumps).join(', ') || (det.combined.length ? translateUI('advanced.combined_archive') : translateUI('advanced.nothing_recognised')) : Object.keys(det.guides).join(', ') || translateUI('advanced.no_guides');
      if (kind === 'dumps' && !det.dumps.pokedex && !det.combined.length) { mount(jobBox, notice('warn', translateUI('advanced.missing_dex', { what }))); return; }
      if (kind === 'guides' && !Object.keys(det.guides).length) { mount(jobBox, notice('warn', translateUI('advanced.missing_guides'))); return; }
      mount(jobBox, h('div', { class: 'row' }, h('span', { class: 'dot connecting' }), translateUI('advanced.importing', { what })));
      const { job } = await post('/api/import/' + kind, { folder: folder.trim() });
      const poll = async () => {
        const j = await get('/api/import/jobs/' + job);
        if (j.state === 'running') { mount(jobBox, h('div', { class: 'row' }, h('span', { class: 'dot connecting' }), apiErrorText((j.messages || []).slice(-1)[0]) || translateUI('advanced.working'))); setTimeout(poll, 400); return; }
        if (j.state === 'error') { mount(jobBox, notice('bad', apiErrorText(j.error))); return; }
        toast(kind === 'dumps' ? translateUI('advanced.dex_imported') : translateUI('advanced.guides_imported'));
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
    h('p', { class: 'small muted', style: { marginTop: 0 } }, translateUI('advanced.advanced_help')),
    h('h3', null, translateUI('advanced.game_data')),
    (() => { const rb = boot.dex.reference || {}; const rc = rb.counts || {};
      return h('div', { class: 'card inset small stack tight bundled-data' }, h('div', null, h('strong', null, translateUI('advanced.built_in')),
        translateUI('advanced.ref_stats', { date: rb.dump_date ? fmtDate(rb.dump_date) : translateUI('advanced.unknown'), species: rc.species || 0, rows: rc.location_rows || 0 })),
        h('div', { class: 'muted' }, translateUI('advanced.offline_help'),
          m && m.source_kind !== 'bundled' && !m.error ? translateUI('advanced.personal_active') : '')); })(),
    h('details', { class: 'adv-data' }, h('summary', null, translateUI('advanced.client_optional')),
    notice('info', h('strong', null, translateUI('advanced.files_private')), translateUI('advanced.files_help')),
    ds.candidates.length ? h('div', { class: 'stack tight', style: { marginBottom: '8px' } }, h('div', { class: 'label' }, translateUI('advanced.found_files')),
      ds.candidates.map((c) => h('div', { class: 'list-row', style: { cursor: 'default' } }, icon('download'), h('div', { class: 'grow' }, h('div', { class: 'mono small' }, c.folder),
        h('div', { class: 'tiny muted' }, translateUI('advanced.contains', { parts: c.parts.join(', ') || translateUI('advanced.combined_archive') }) + (c.guides.length ? translateUI('advanced.contains_guides', { guides: c.guides.join(', ') }) : ''))),
      h('button', { class: 'btn small' + (ds.installed ? '' : ' primary'), onclick: () => { dumpPath.value = c.folder; runImport('dumps', c.folder); } }, ds.installed ? translateUI('advanced.reinstall') : translateUI('advanced.install')),
      c.guides.length ? h('button', { class: 'btn small', onclick: () => runImport('guides', c.folder) }, translateUI('advanced.import_guides')) : null))) :
      h('div', { class: 'small muted', style: { marginBottom: '8px' } }, translateUI('advanced.not_found')),
    ds.update_available ? notice('warn', translateUI('advanced.client_changed')) : null,
    m && !m.error && m.source_kind !== 'bundled' ? h('div', { class: 'card inset small stack tight' }, h('div', null, h('strong', null, translateUI('advanced.client_active')), translateUI('advanced.import_stats', { date: fmtDate(m.imported_at, true), species: m.counts.species, locations: m.counts.location_rows, icons: m.counts.icons || 0, sprites: m.counts.battle_sprites || 0 })),
      h('div', { class: 'muted' }, Object.entries(m.sources).map(([k, v]) => `${k}: ${v.file}${v.sha256 ? ' (sha256 ' + v.sha256.slice(0, 12) + '…)' : ''}`).join(' · ')),
      (m.notes || []).map((x) => h('div', { class: 'muted' }, x))) : h('div', { class: 'small muted' }, m && m.error ? apiErrorText(m.error) : translateUI('advanced.client_inactive')),
    h('div', { class: 'row', style: { marginTop: '8px' } }, h('div', { class: 'grow' }, dumpPath), browse(dumpPath, 'dumps'), h('button', { class: 'btn primary', onclick: () => runImport('dumps', dumpPath.value) }, icon('download'), m ? translateUI('advanced.reimport') : t('common.import'))),
    h('div', { class: 'tiny muted' }, translateUI('advanced.dump_help'))),
    h('h3', null, translateUI('advanced.personal_guides')),
    h('div', { class: 'tiny muted' }, translateUI('advanced.personal_guides_help')),
    importedGuides.length ? h('div', { class: 'small' }, importedGuides.map(([r, s]) => h('div', null, translateUI('advanced.imported_guide', { region: gameTerm('region', cap(r)), name: s.label.replace('Your walkthrough ', ''), steps: s.steps, date: fmtDate(s.checked_at, true) })))) : h('div', { class: 'small muted' }, translateUI('advanced.no_imported_guides')),
    h('div', { class: 'row', style: { marginTop: '8px' } }, h('div', { class: 'grow' }, guidePath), browse(guidePath, 'guides'), h('button', { class: 'btn primary', onclick: () => runImport('guides', guidePath.value) }, icon('download'), translateUI('advanced.import_guides'))),
    h('div', { class: 'tiny muted' }, translateUI('advanced.guide_format')),
    jobBox,
    await spriteLibrarySection(browse),
    h('h3', null, translateUI('advanced.storage')),
    h('div', { class: 'small' }, translateUI('advanced.data_folder'), h('span', { class: 'mono' }, boot.data_dir)),
    h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn ghost', onclick: async () => { if (await confirmDialog(translateUI('advanced.clear_history'), translateUI('advanced.clear_history_confirm'), translateUI('ui.clear'), true)) { await post('/api/live/clear', {}); toast(translateUI('advanced.clear_history_done')); } } }, translateUI('advanced.clear_history'))),
    h('p', { class: 'small muted' }, translateUI('advanced.privacy'))));

}

// Optional sprite library: animated Gen V battle sprites the user supplies (never bundled or downloaded by the app).
async function spriteLibrarySection(browse) {
  const st = await get('/api/sprites/library');
  const box = h('div', { class: 'stack tight' });
  const path = h('input', { class: 'input', placeholder: '/home/you/Downloads/sprites-master  (folder or .zip)', 'aria-label': translateUI('advanced.sprite_folder'), value: st.personal ? st.source || '' : '' });
  const msg = h('div', { class: 'small' });
  const c = st.coverage;
  const lf = st.local_forms || {};
  const refresh = () => render(document.getElementById('main'), { parts: ['data'] });
  const run = async () => {
    try {
      await post('/api/sprites/library/import', { folder: path.value.trim() });
      mount(msg, h('div', { class: 'row' }, h('span', { class: 'dot connecting' }), translateUI('advanced.sprite_reading')));
      const poll = async () => {
        const j = (await get('/api/sprites/library')).job;
        if (j.state === 'running') { setTimeout(poll, 500); return; }
        if (j.state === 'error') { mount(msg, notice('bad', apiErrorText(j.error))); return; }
        toast(translateUI('advanced.sprite_installed', { forms: j.forms, species: j.species, refused: j.refused ? translateUI('advanced.sprite_refused_suffix', { count: j.refused }) : '' }), { timeout: 7000 });
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
      h('button', { class: 'btn ' + (own ? '' : 'primary'), onclick: run }, icon('download'), own ? translateUI('advanced.sprite_replace') : translateUI('advanced.sprite_use'))),
      h('div', { class: 'tiny muted' }, translateUI('advanced.sprite_formats')));
  box.append(h('h3', null, translateUI('advanced.pokemon_sprites')),
    own ? h('div', { class: 'card inset small stack tight' },
      h('div', null, h('strong', null, translateUI('advanced.sprite_personal_active')), translateUI('advanced.sprite_source', { date: fmtDate(st.imported_at, true) }), h('span', { class: 'mono' }, st.source)),
      c ? h('div', null, translateUI('advanced.sprite_form_stats', { animated: c.forms_ani, shiny: c.forms_ani_shiny, still: c.forms_static, total: c.forms_total }),
        translateUI('advanced.sprite_species_stats', { animated: c.species_ani, shiny: c.species_ani_shiny, total: c.species_total })) : null,
      st.refused_count ? h('details', null, h('summary', null, translateUI('advanced.sprite_refused', { count: st.refused_count })),
        h('ul', { class: 'tiny' }, st.refused.slice(0, 60).map((r) => h('li', null, h('span', { class: 'mono' }, r.path), ' — ', apiErrorText(r.reason))))) : null,
      h('div', { class: 'row' }, h('button', { class: 'btn ghost small', onclick: async () => {
        if (await confirmDialog(translateUI('advanced.sprite_go_back'), translateUI('advanced.sprite_remove_confirm'), translateUI('advanced.sprite_builtin_action'), true)) {
          await api('DELETE', '/api/sprites/library'); state.dexCache = null; refresh(); } } }, translateUI('advanced.sprite_remove'))))
      : h('div', { class: 'card inset small stack tight' },
        h('div', null, h('strong', null, translateUI('advanced.sprite_builtin')), translateUI('advanced.sprite_builtin_help')),
        h('div', { class: 'muted' }, translateUI('advanced.sprite_builtin_stats', { species: c ? c.species_total : 649, forms: c ? c.forms_total : 82, female: st.female ? translateUI('advanced.female_suffix', { count: st.female }) : '' }))),
    own ? h('details', null, h('summary', { class: 'small' }, translateUI('advanced.sprite_replace_other')), controls)
      : h('details', null, h('summary', { class: 'small' }, translateUI('advanced.sprite_optional')),
        h('p', { class: 'small muted' }, translateUI('advanced.sprite_optional_intro'), extLink('https://github.com/PokeAPI/sprites', 'PokéAPI sprites'), translateUI('advanced.sprite_optional_or'),
          extLink('https://github.com/smogon/sprites', 'Smogon sprites'), translateUI('advanced.sprite_optional_end')), controls),
    msg,
    h('details', null, h('summary', { class: 'small' }, translateUI('advanced.art_report')), await formArtReport()));
  return box;
}
export function artworkReportLabel(row) {
  const sid = Number(String(row.key || '').split(':')[0]);
  return [speciesLabel(sid, row.species), formLabel(sid, row.name)].filter(Boolean).join(' — ');
}
export function artworkVariantLabel(kind) {
  const labels = { ani: 'advanced.art_animation', ani_shiny: 'advanced.art_animation_shiny',
    static: 'advanced.art_static', static_shiny: 'advanced.art_static_shiny' };
  return Object.hasOwn(labels, kind) ? translateUI(labels[kind]) : kind;
}
async function formArtReport() {
  const r = await get('/api/dex/art');
  const label = { verified: translateUI('advanced.client_verified'), unverified: translateUI('advanced.client_changed_art'), 'same-as-base': translateUI('advanced.base_art'), placeholder: translateUI('advanced.placeholder'), none: '—' };
  return h('div', { class: 'stack tight' }, h('div', { class: 'tiny muted' }, translateUI('advanced.art_checked', { date: r.checked })),
    h('table', { class: 'table compact sprite-cov tiny' }, h('thead', null, h('tr', null, [translateUI('ui.form'), translateUI('advanced.your_client'), translateUI('advanced.your_library'), translateUI('advanced.known_sources')].map((x) => h('th', null, x)))),
      h('tbody', null, r.forms.map((f) => h('tr', null, h('td', null, artworkReportLabel(f)),
        h('td', { title: uiLabel(f.local_reason) }, label[f.local_status] || f.local_status),
        h('td', null, f.library.length ? f.library.map(artworkVariantLabel).join(', ') : '—'),
        h('td', null, [f.known_sources.pokeapi_animated ? translateUI('advanced.pokeapi_anim') : null, f.known_sources.pokeapi_animated_shiny ? translateUI('advanced.shiny_suffix') : null,
          f.known_sources.smogon_animated ? translateUI('advanced.smogon_anim') : null, f.known_sources.pokesprite_icon ? translateUI('advanced.pokesprite_icon') : null].filter(Boolean).join(' · ') || '—'))))));
}

// ---------------------------------------------------------------- about
// --------------------------------------------------------------- Pokémon & sprites
async function performanceSec(b) {
  const profile = setting('performance.profile') || 'balanced';
  const choices = (key, values, fallback, label, onChange) => h('select', { class: 'input', 'aria-label': label,
    onchange: async e => { try { await saveSettings({ [key]: e.target.value }); if (onChange) onChange(); toast(translateUI('ui.saved')); }
      catch (err) { toast(apiErrorText(err), { kind: 'warn' }); } } },
    values.map(v => h('option', { value: v, selected: (setting(key) || fallback) === v ? 'selected' : null }, translateUI('performance.' + v))));
  const redraw = () => { if (b.isConnected) { b.replaceChildren(); performanceSec(b); } };
  b.append(h('h2', { style: { marginTop: 0 } }, translateUI('ui.performance')),
    h('p', { class: 'small muted' }, translateUI('performance.intro')),
    row(translateUI('performance.profile'), translateUI('performance.' + profile + '_help'),
      choices('performance.profile', ['lightweight', 'balanced', 'quality', 'custom'], 'balanced', translateUI('performance.profile'), redraw)),
    profile === 'custom' ? row(translateUI('performance.batch'), translateUI('performance.batch_help'),
      choices('performance.item_batch', ['small', 'normal', 'large'], 'normal', translateUI('performance.batch'))) : null,
    profile === 'custom' ? row(translateUI('performance.motion'), translateUI('performance.motion_help'),
      choices('performance.default_motion', ['conservative', 'standard', 'enhanced'], 'standard', translateUI('performance.motion'))) : null,
    h('p', { class: 'small muted' }, translateUI('performance.overrides')),
    h('p', { class: 'small muted' }, translateUI('performance.always')),
    h('button', { class: 'btn ghost small', onclick: async () => {
      await saveSettings({ 'performance.profile': 'balanced', 'performance.item_batch': 'normal', 'performance.default_motion': 'standard' }); redraw();
    } }, translateUI('performance.reset')));
}

async function spritesSec(b) {
  const s = state.settings;
  const anim = { ...(s['sprites.animation'] || {}) };
  const size = { ...(s['sprites.size'] || {}) };
  const lib = await get('/api/sprites/library').catch(() => null);
  const redraw = () => { b.innerHTML = ''; spritesSec(b); };
  b.append(h('div', null, h('h2', { style: { marginTop: 0 } }, translateUI('ui.pokemon_sprites')),
    row(translateUI('ui.b272_settings_077'), translateUI('settings.motion_help'),
      seg([['system', translateUI('settings.follow_system')], ['on', translateUI('settings.on')], ['off', translateUI('ui.status_off')]], s['sprites.motion'] || 'system', async (v) => { await saveSettings({ 'sprites.motion': v }); document.dispatchEvent(new CustomEvent('sprites-changed')); }, translateUI('ui.b272_settings_077'))),
    row(translateUI('ui.b272_settings_078'), translateUI('settings.shiny_help'),
      seg([['normal', translateUI('ui.normal')], ['shiny', translateUI('ui.shiny')]], s['pokedex.shiny'] ? 'shiny' : 'normal', (v) => saveSettings({ 'pokedex.shiny': v === 'shiny' }), translateUI('ui.b272_settings_078'))),
    h('h3', null, translateUI('settings.sprite_context')),
    h('div', { class: 'sprite-prefs' }, CONTEXTS.map(([id, label, def, hasSize]) => h('div', { class: 'set-row' },
      h('div', null, h('div', { style: { fontWeight: 600 } }, uiLabel(label)), h('div', { class: 'desc' }, translateUI('settings.sprite_default', { mode: defaultAnimation(id) === 'animated' ? translateUI('ui.animated') : translateUI('ui.static') }))),
      h('div', { class: 'row wrap tight' },
        seg([['static', translateUI('ui.static')], ['animated', translateUI('ui.animated')]], anim[id] || defaultAnimation(id), async (v) => { anim[id] = v; await saveSettings({ 'sprites.animation': { ...anim } }); }, translateUI('settings.sprite_animation', { label: uiLabel(label) })),
        hasSize ? h('label', { class: 'row tight small' }, translateUI('theme.size'), h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': translateUI('settings.sprite_size', { label: uiLabel(label) }),
          onchange: async (e) => { const v = Number(e.target.value); if (v === 100) delete size[id]; else size[id] = v; await saveSettings({ 'sprites.size': { ...size } }); } },
          [70, 85, 100, 115, 130, 150].map((p) => h('option', { value: p, selected: (size[id] || 100) === p ? 'selected' : null }, p + ' %')))) : null)))),
    h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn ghost small', onclick: async () => {
      await saveSettings({ 'sprites.animation': {}, 'sprites.size': {}, 'sprites.motion': 'system' }); toast(translateUI('settings.sprite_reset_done')); redraw(); } }, translateUI('settings.sprite_reset'))),
    h('h3', null, translateUI('settings.artwork')),
    lib ? h('div', { class: 'small' }, lib.source_kind === 'personal' ? translateUI('settings.using_own') : translateUI('settings.builtin_sprites'),
      translateUI('settings.sprite_stats', { species: lib.coverage.species_static, forms: lib.coverage.forms_ani, female: lib.female }),
      lib.derived_stills ? translateUI('settings.derived_stills', { count: lib.derived_stills }) : '',
      h('a', { href: '#/settings/about' }, translateUI('ui.credits'))) : null));
}

// --------------------------------------------------------------- startup & game integration
async function startupSec(b) {
  const g = await get('/api/game/status');
  const s = state.settings;
  const redraw = () => { b.innerHTML = ''; startupSec(b); };
  const native = SHELL === 'qt';
  const integ = (kind, extra = {}) => async (on_) => {
    try { await post('/api/game/integration', { kind, enable: on_, ...extra }); toast(on_ ? translateUI('system.added') : translateUI('system.removed')); } catch (e) { toast(e.message, { kind: 'warn' }); }
    redraw();
  };
  const pathIn = h('input', { class: 'input', value: g.manual || '', placeholder: g.platform.startsWith('win') ? 'C:\\…\\PokeMMO.exe' : '/home/you/PokeMMO/PokeMMO.sh', 'aria-label': translateUI('ui.b272_settings_081') });
  const savePath = async (v) => { try { await api('PUT', '/api/game/launcher', { path: v }); toast(v ? translateUI('system.launcher_saved') : translateUI('system.detected_launcher')); } catch (e) { toast(e.message, { kind: 'warn' }); } redraw(); };
  if (native) unsub.push(on('shell.file', (d) => { if (d && d.purpose === 'launcher' && d.path) savePath(d.path); }));
  b.append(h('div', null, h('h2', { style: { marginTop: 0 } }, translateUI('system.startup')),
    h('p', { class: 'small muted', style: { marginTop: 0 } }, translateUI('system.startup_help')),
    h('div', { class: 'card tight startup-hero', style: { margin: '4px 0 12px' } },
      row(translateUI('system.auto_open'), translateUI('system.auto_open_intro')
        + translateUI('system.auto_open_helper')
        + translateUI('system.auto_open_restart'),
        switchEl(g.integrations.watcher, integ('watcher')))),
    row(translateUI('ui.b272_settings_079'), translateUI('ui.b272_settings_080'), switchEl(s['app.restore_last_page'], set('app.restore_last_page'))),
    h('h3', null, 'PokeMMO'),
    row(translateUI('ui.b272_settings_081'), g.chosen ? g.chosen.label : translateUI('system.launcher_missing'),
      h('div', { class: 'row wrap' }, h('button', { class: 'btn primary', disabled: g.chosen ? null : 'disabled', onclick: async () => {
        try { const r = await post('/api/game/launch'); toast(r.already_running ? translateUI('system.already_running') : r.already_starting ? translateUI('system.already_starting') : translateUI('system.starting_game')); } catch (e) { toast(e.message, { kind: 'warn', timeout: 7000 }); } } }, icon('play'), g.running ? translateUI('system.running_game') : translateUI('system.launch')))),
    h('div', { class: 'row wrap', style: { margin: '4px 0 10px' } },
      native ? h('button', { class: 'btn small', onclick: () => post('/api/shell/command', { action: 'pick_launcher', purpose: 'launcher' }) }, translateUI('system.choose_launcher'))
        : [h('div', { class: 'grow', style: { minWidth: '220px' } }, pathIn), h('button', { class: 'btn small', onclick: () => savePath(pathIn.value.trim()) }, translateUI('ui.save'))],
      g.manual ? h('button', { class: 'btn small ghost', onclick: () => savePath('') }, translateUI('system.use_detected')) : null),
    g.launchers.length > 1 ? h('div', { class: 'tiny muted' }, translateUI('system.also_found'), g.launchers.slice(1).map((l) => l.label).join(' · ')) : null,
    row(translateUI('ui.b272_settings_082'), translateUI('ui.b272_settings_083'),
      h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': translateUI('ui.b272_settings_082'), onchange: (e) => saveSettings({ 'game.on_exit': e.target.value }) },
        [['keep', translateUI('system.keep_running')], ['minimize', translateUI('system.minimise')], ['quit', translateUI('system.quit')]].map(([v, l]) => h('option', { value: v, selected: s['game.on_exit'] === v ? 'selected' : null }, l)))),
    h('h3', null, translateUI('system.starting_companion')),
    row(translateUI('ui.b272_settings_084'), translateUI('system.autostart_help'), switchEl(g.integrations.login, integ('login', { minimized: !!s['app.start_minimized'] }))),
    row(translateUI('ui.b272_settings_085'), translateUI('system.tray_help'), switchEl(!!s['app.start_minimized'], async (v) => {
      await saveSettings({ 'app.start_minimized': v }); if (g.integrations.login) await post('/api/game/integration', { kind: 'login', enable: true, minimized: v }); })),
    row(translateUI('ui.b272_settings_086'), translateUI('system.restore_popouts'), switchEl(!!s['app.restore_popouts'], (v) => saveSettings({ 'app.restore_popouts': v }))),
    row(translateUI('system.game_shortcut'), translateUI('system.game_shortcut_help'), switchEl(g.integrations.shortcut, integ('shortcut'))),
    h('div', { class: 'tiny muted' }, translateUI('system.auto_first')),
    h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn ghost small', onclick: async () => {
      if (!(await confirmDialog(translateUI('system.remove_startup'), translateUI('system.remove_startup_help'), t('common.remove')))) return;
      const r = await post('/api/game/integration/remove-all'); toast(translateUI('system.removed_count', { count: r.removed.length })); redraw(); } }, translateUI('system.remove_all')))));
}

// --------------------------------------------------------------- updates (news, reference data, Companion)
async function updatesSec(b) {
  const [ref, app, n] = await Promise.all([get('/api/reference/status'), get('/api/app-update/status'), get('/api/news')]);
  const redraw = () => { b.innerHTML = ''; updatesSec(b); };
  const s = state.settings;
  const f = n.feed;
  const refUsing = ref.using === 'downloaded' ? translateUI('system.updated_data', { date: fmtDate(ref.downloaded.dump_date), revision: ref.downloaded.revision })
    : translateUI('system.builtin_data', { date: fmtDate(ref.built_in.dump_date) });
  const latest = app.latest;
  b.append(h('div', null, h('h2', { style: { marginTop: 0 } }, translateUI('ui.updates')),
    h('p', { class: 'small muted', style: { marginTop: 0 } }, translateUI('system.updates_intro')),
    h('h3', null, translateUI('system.official_news')),
    row(translateUI('ui.b272_settings_087'), f ? translateUI('system.last_success', { date: f.last_ok_at ? relTime(f.last_ok_at) : translateUI('system.never'), failure: f.ok === false ? translateUI('system.last_failure', { error: apiErrorText(f.error) }) : '' }) : translateUI('system.not_checked'),
      switchEl(!!s['updates.auto_check'], (v) => saveSettings({ 'updates.auto_check': v }))),
    h('div', { class: 'row wrap' }, h('button', { class: 'btn small', onclick: async () => { const r = await post('/api/news/check'); toast(r.ok ? translateUI('system.news_done') : translateUI('system.check_error', { error: apiErrorText(r.error) }), { kind: r.ok ? 'info' : 'warn' }); redraw(); } }, icon('refresh'), translateUI('settings.check_now'))),
    h('h3', null, translateUI('system.reference')),
    h('div', { class: 'small' }, refUsing, '.'),
    ref.private_superseded ? notice('info', translateUI('system.superseded', { date: fmtDate(ref.private_superseded.private_date) })) : null,
    ref.configured ? [
      row(translateUI('ui.b272_settings_088'), ref.last_check_at ? translateUI('system.last_check', { date: relTime(ref.last_check_at) }) : translateUI('system.not_checked'), switchEl(!!s['reference.auto_update'], (v) => saveSettings({ 'reference.auto_update': v }))),
      ref.last_error ? notice('warn', ref.last_error) : null,
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn small', onclick: async () => { try { const r = await post('/api/reference/install'); toast(r.installed ? translateUI('system.ref_updated', { date: fmtDate(r.dump_date) }) : apiErrorText(r.reason)); } catch (e) { toast(e.message, { kind: 'warn' }); } redraw(); } }, icon('refresh'), translateUI('system.check_update')),
        ref.previous_available ? h('button', { class: 'btn small ghost', onclick: async () => { await post('/api/reference/rollback'); toast(translateUI('system.previous_restored')); redraw(); } }, translateUI('system.previous_data')) : null,
        ref.downloaded ? h('button', { class: 'btn small ghost', onclick: async () => { await post('/api/reference/reset'); toast(translateUI('system.builtin_active')); redraw(); } }, translateUI('system.use_builtin')) : null)]
      : h('div', { class: 'small muted' }, translateUI('system.no_data_updates')),
    h('h3', null, 'PokeMMO Companion'),
    row(translateUI('ui.b272_settings_089'), translateUI('system.app_version', { version: app.current, check: app.checked_at ? translateUI('system.last_check_suffix', { date: relTime(app.checked_at) }) : '' }),
      switchEl(!!s['app_updates.auto_check'], (v) => saveSettings({ 'app_updates.auto_check': v }))),
    row(translateUI('ui.b272_settings_090'), translateUI('ui.b272_settings_091'),
      seg([['stable', translateUI('system.stable')], ['prerelease', translateUI('system.beta_pre')]], s['app_updates.channel'] || 'stable', async (v) => {
        if (v === 'prerelease' && !await confirmDialog(translateUI('system.beta'), translateUI('system.beta_help'), translateUI('system.use_beta'))) { redraw(); return; }
        await saveSettings({ 'app_updates.channel': v });
        redraw();
      }, translateUI('ui.b272_settings_090'))),
    h('div', { class: 'row wrap' }, h('button', { class: 'btn small', onclick: async (e) => { e.currentTarget.disabled = true; await post('/api/app-update/check'); redraw(); } }, icon('refresh'), translateUI('system.check_updates'))),
    app.ok === false ? notice('warn', translateUI('system.check_error', { error: apiErrorText(app.error) })) : null,
    app.ok && !latest ? h('div', { class: 'small muted' }, translateUI('system.no_release')) : null,
    latest ? h('div', { class: 'card inset stack tight' },
      h('div', null, h('strong', null, app.available ? translateUI('system.version_available', { version: latest.version }) : (latest.prerelease ? translateUI('system.latest_pre', { version: latest.version }) : translateUI('system.latest_release', { version: latest.version }))),
        h('span', { class: 'tiny muted' }, latest.published_at ? ` · ${fmtDate(latest.published_at)}` : '')),
      app.available && latest.notes ? h('details', null, h('summary', { class: 'small' }, translateUI('system.whats_new')), h('pre', { class: 'small', style: { whiteSpace: 'pre-wrap', margin: 0 } }, latest.notes)) : null,
      app.available ? h('div', { class: 'row wrap' }, extLink(latest.url, translateUI('system.release_page')),
        app.verified_downloads ? h('span', { class: 'tiny muted' }, translateUI('system.verified_download')) : h('span', { class: 'tiny muted' }, translateUI('system.download'))) : null) : null));
}

// --------------------------------------------------------------- backup & recovery
async function backupSec(b) {
  const st = await get('/api/backup/list');
  const auto = st.backups.find((x) => x.label === 'automatic');
  const fmtSize = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const listEl = h('div', { class: 'list-rows' }, st.backups.length ? st.backups.map((x) => h('div', { class: 'list-row compact' },
    h('div', { class: 'grow' }, h('div', null, fmtDate(x.created_at, true), h('span', { class: 'tiny muted' }, ` · ${x.label}`)),
      h('div', { class: 'tiny muted mono ellipsis' }, `${x.name} · ${fmtSize(x.bytes)}`)),
    x.kind === 'archive' ? h('button', { class: 'btn small', onclick: () => restoreFlow({ name: x.name }) }, translateUI('system.restore'))
      : h('span', { class: 'tiny muted', title: translateUI('system.database_help') }, translateUI('system.database_copy')))) :
    h('div', { class: 'small muted' }, translateUI('ui.settings_backup_no')));
  b.append(h('div', null, h('h2', { style: { marginTop: 0 } }, translateUI('ui.backup_recovery')),
    st.recovered ? notice(st.recovered.recovered ? 'info' : 'warn', st.recovered.recovered ? translateUI('system.restore_finished') : translateUI('system.restore_interrupted', { reason: apiErrorText(st.recovered.reason) })) : null,
    h('p', { class: 'small muted', style: { marginTop: 0 } }, translateUI('ui.settings_backup_full')),
    row(translateUI('ui.settings_backup_auto'), auto ? translateUI('system.backup_last', { date: fmtDate(auto.created_at, true) }) : translateUI('system.backup_auto'),
      h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': translateUI('ui.settings_backup_auto'), onchange: (e) => saveSettings({ 'backup.auto_hours': Number(e.target.value) }) },
        [[0, translateUI('settings.off')], [6, translateUI('system.every6')], [12, translateUI('system.every12')], [24, translateUI('system.daily')], [72, translateUI('system.every3days')], [168, translateUI('system.weekly')]].map(([v, l]) =>
          h('option', { value: v, selected: Number(st.auto_hours) === v ? 'selected' : null }, l)))),
    h('div', { class: 'row wrap', style: { margin: '10px 0' } },
      h('button', { class: 'btn primary', onclick: async (e) => { e.currentTarget.disabled = true; const r = await post('/api/backup/archive'); toast(translateUI('system.backup_saved', { name: r.name }), { timeout: 6000 }); b.innerHTML = ''; backupSec(b); } }, icon('download'), translateUI('ui.settings_backup_now')),
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
        r.onload = () => { try { restoreFlow({ payload: JSON.parse(r.result) }); } catch (e) { toast(translateUI('system.invalid_backup'), { kind: 'warn' }); } };
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
    const LABEL = { runs: translateUI('system.runs'), step_status: translateUI('system.checkmarks'), custom_guides: translateUI('system.personal_guides'), guide_cycles: translateUI('system.cycles'),
      lib_notes: translateUI('system.notes'), owned_pokemon: translateUI('system.collection'), showcases: translateUI('system.showcases'), media: translateUI('system.pictures'), documents: translateUI('system.documents') };
    const lines = Object.entries(pv.counts).filter(([k]) => LABEL[k]).map(([k, n]) => h('li', null, `${n} ${LABEL[k]}`));
    const mode = await modal({ title: translateUI('system.restore_backup'), body: h('div', { class: 'stack' },
      h('div', { class: 'small' }, translateUI('system.backup_made', { date: pv.exported_at ? fmtDate(pv.exported_at, true) : translateUI('system.unknown_date'), version: pv.app_version || '?' })),
      pv.newer ? notice('warn', translateUI('system.newer_backup')) : null,
      h('ul', { class: 'small', style: { margin: 0 } }, lines),
      pv.runs_conflicting || pv.documents_conflicting ? h('div', { class: 'small muted' }, translateUI('system.conflicts', { runs: pv.runs_conflicting, items: pv.documents_conflicting })) : null,
      h('div', { class: 'small muted' }, translateUI('system.safety_copy'))),
    actions: [{ label: translateUI('ui.cancel'), value: null, kind: 'ghost' }, { label: translateUI('system.replace_data'), value: 'replace', kind: 'danger' }, { label: translateUI('system.merge'), value: 'merge', kind: 'primary' }] });
    if (!mode || pv.newer) return;
    if (mode === 'replace' && !(await confirmDialog(translateUI('system.replace_all'), translateUI('system.replace_all_help'), translateUI('settings.replace'), true))) return;
    try {
      const r = src.payload ? await post('/api/backup/import', { payload: src.payload, mode }) : await post('/api/backup/restore', { ...src, mode, confirm: mode === 'replace' });
      toast(translateUI('system.restored', { copies: r.runs_renamed ? translateUI('system.restored_copies', { count: r.runs_renamed }) : '' }), { timeout: 7000 });
      setTimeout(() => location.reload(), 900);
    } catch (e) { toast(e.message, { kind: 'warn', timeout: 7000 }); }
  }
}

async function about(b) {
  const boot = state.boot;
  const discord = boot.community && boot.community.discord;
  b.append(h('h2', { style: { marginTop: 0 } }, translateUI('ui.about_credits')),
    h('dl', { class: 'kv' }, h('dt', null, translateUI('system.version')), h('dd', null, translateUI('system.alpha_version', { version: boot.version })), h('dt', null, translateUI('system.window_mode')), h('dd', null, boot.mode === 'qt' ? translateUI('system.native') : translateUI('system.browser')),
      h('dt', null, translateUI('ui.settings_data_folder')), h('dd', { class: 'mono' }, boot.data_dir)),
    discord ? h('div', null, h('h3', null, translateUI('ui.community')),
      h('p', { class: 'small', style: { marginTop: 0 } }, translateUI('system.community_help'),
        extLink(discord, translateUI('ui.discord_join')))) : null,
    h('section', null, h('h3', null, translateUI('ui.about_developer')),
      h('div', { class: 'stack tight small' },
        h('strong', null, translateUI('system.creator')),
        h('div', null, translateUI('system.creator_bio')),
        h('div', null, translateUI('system.projects')),
        h('div', { class: 'row wrap' }, extLink('https://github.com/haqzo', 'GitHub'),
          discord ? extLink(discord, 'Discord') : null))),
    h('h3', null, translateUI('ui.credits')),
    h('ul', { class: 'small', style: { color: 'var(--text-secondary)', marginTop: 0 } },
      h('li', null, translateUI('system.credit_sprites')),
      h('li', null, translateUI('system.credit_items')),
      h('li', null, translateUI('system.credit_guides')),
      h('li', null, translateUI('system.credit_themes')),
      h('li', null, translateUI('system.credit_live'), extLink(boot.alphapedia.website, 'Alphapedia'),
        ' · ', extLink(boot.alphapedia.discord, 'Alphapedia Discord'))),
    h('h3', null, translateUI('ui.diagnostics')),
    h('p', { class: 'small muted', style: { marginTop: 0 } }, translateUI('system.diagnostics_help')),
    h('div', { class: 'row wrap' }, h('button', { class: 'btn small', onclick: async () => {
      const d = await get('/api/diagnostics');
      const blob = new Blob([JSON.stringify(d.report, null, 1) + '\n\n----- log (sanitized) -----\n' + d.log], { type: 'text/plain' });
      const a = h('a', { href: URL.createObjectURL(blob), download: `pokemmo-companion-diagnostics-${new Date().toISOString().slice(0, 10)}.txt` });
      document.body.append(a); a.click(); a.remove(); } }, icon('download'), translateUI('ui.save_diagnostics'))),
    h('h3', null, translateUI('system.keyboard')),
    h('div', { class: 'small stack tight' }, h('div', null, h('span', { class: 'kbd' }, 'Alt+1…5'), translateUI('system.switch_sections'), h('span', { class: 'kbd' }, 'Ctrl+,'), translateUI('system.settings_short'), h('span', { class: 'kbd' }, 'Ctrl+F'), translateUI('system.search_dex'),
      h('span', { class: 'kbd' }, 'Esc'), translateUI('system.close_details'))),
    h('h3', null, translateUI('system.never_does')),
    h('ul', { class: 'small', style: { color: 'var(--text-secondary)' } }, h('li', null, translateUI('system.no_counter')), h('li', null, translateUI('system.no_memory')),
      h('li', null, translateUI('system.no_gtl')), h('li', null, translateUI('system.no_claims'))),
    h('p', { class: 'small muted' }, translateUI('system.disclaimer')));
}

// ----------------------------------------------------------- onboarding
export async function onboarding() {
  const s = state.settings;
  let nav = s['appearance.nav'];
  const body = h('div', { class: 'stack' },
    h('p', { style: { margin: 0 } }, translateUI('system.welcome_intro')),
    h('div', { class: 'field' }, h('label', null, translateUI('system.navigation')), seg([['vertical', translateUI('system.vertical')], ['horizontal', translateUI('system.horizontal')]], nav, (v) => { nav = v; })),
    h('div', { class: 'field' }, h('label', null, translateUI('system.your_data')),
      h('div', { class: 'small muted' }, translateUI('system.your_data_help'))),
    h('div', { class: 'field' }, h('label', null, translateUI('system.guides')), h('div', { class: 'small muted' }, translateUI('system.guide_help'))),
    h('div', { class: 'tiny muted' }, translateUI('system.welcome_privacy')));
  const r = await modal({ title: translateUI('system.welcome', { version: state.boot.version }), body, actions: [
    { label: translateUI('system.skip'), value: 'skip', kind: 'ghost' }, { label: translateUI('settings.create_run'), value: 'run' }, { label: translateUI('system.import_now'), value: 'data', kind: 'primary' }] });
  await saveSettings({ 'app.onboarded': true, 'appearance.nav': nav });
  document.dispatchEvent(new CustomEvent('settings-changed'));
  if (r === 'data') go('#/settings/data');
  if (r === 'run') { await createRun(); go('#/guides/storyline'); }
}
