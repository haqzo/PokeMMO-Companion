// Settings (docs/design/16) + data import + first-run onboarding.
import { h, mount, icon, get, post, api, state, setting, saveSettings, badge, notice, cap, seg, switchEl, toast, confirmDialog, modal, on, fmtDate, relTime, SHELL, extLink } from '../core.js';
import { go, openPopout, POPOUT_TOOLS } from '../shell.js';
import { downloadJson, pickJsonFile } from '../components.js';
import { createRun } from './guides.js';

const SECTIONS = [['appearance', 'Appearance'], ['windows', 'Windows & popouts'], ['notifications', 'Notifications'], ['sources', 'Live sources & news'],
  ['guides', 'Guides & characters'], ['data', 'Data & privacy'], ['about', 'About']];
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
  await ({ appearance, windows, notifications, sources, guides: guidesSec, data, about })[sec](body);
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
    row('Home sections', 'Choose what Home shows.', h('div', { class: 'row wrap' }, [['update', 'Latest update'], ['events', 'Events'], ['live', 'Live activity'], ['shortcuts', 'Continue']].map(([k, l]) =>
      h('label', { class: 'chip btnlike' }, h('input', { type: 'checkbox', class: 'check', checked: s['home.sections'].includes(k), onchange: (e) => {
        const cur = new Set(state.settings['home.sections']); e.target.checked ? cur.add(k) : cur.delete(k); set('home.sections')([...cur]); } }), l)))),
    row('Home shortcuts', 'Up to a few “Continue” actions.', h('div', { class: 'row wrap' }, [['guide', 'Current guide step'], ['pokedex_last', 'Last Pokémon'], ['breeding', 'Breeding planner'], ['typechart', 'Type matchups']].map(([k, l]) =>
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
    h('h3', null, 'Per-tool popout preferences'),
    h('p', { class: 'small muted', style: { marginTop: 0 } }, 'Background opacity fades only the panel behind the text; window opacity fades the whole window (native shell only). Minimums keep text readable.'),
    h('div', { style: { overflowX: 'auto' } }, h('table', { class: 'table compact' }, h('thead', null, h('tr', null, ['Tool', 'Mode', 'Pin', 'Background', 'Window', 'Text', 'Lock', ''].map((c) => h('th', null, c)))),
      h('tbody', null, Object.entries(POPOUT_TOOLS).map(([t, def]) => h('tr', null, h('td', null, def.title),
        h('td', null, h('select', { class: 'input', style: { width: 'auto' }, onchange: (e) => set(`window.${t}.mode`)(e.target.value) }, ['compact', 'standard', 'expanded'].map((m) => h('option', { value: m, selected: s[`window.${t}.mode`] === m ? 'selected' : null }, cap(m))))),
        h('td', null, h('input', { type: 'checkbox', class: 'check', checked: s[`window.${t}.pinned`], disabled: caps.pin ? null : 'disabled', title: caps.pin ? 'Pin by default' : 'Not supported in this mode', onchange: (e) => set(`window.${t}.pinned`)(e.target.checked) })),
        h('td', null, rangeCell(`window.${t}.bg_opacity`, 35, 100)), h('td', null, rangeCell(`window.${t}.window_opacity`, 40, 100, !caps.window_opacity)),
        h('td', null, rangeCell(`window.${t}.text_scale`, 70, 180)),
        h('td', null, h('input', { type: 'checkbox', class: 'check', checked: s[`window.${t}.locked`], disabled: caps.native_windows ? null : 'disabled', title: 'Lock position (prevents accidental dragging)', onchange: (e) => set(`window.${t}.locked`)(e.target.checked) })),
        h('td', null, h('button', { class: 'btn small', onclick: () => openPopout(t) }, 'Open'))))))),
    h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn ghost', onclick: async () => {
      if (await confirmDialog('Reset window preferences', 'Reset popout modes, opacity, pin, lock and saved sizes for every tool? Data is not touched.')) { await post('/api/settings/reset', { prefix: 'window.' }); location.reload(); } } }, 'Reset window preferences')));
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
    row('Alpha/Swarm report feed', 'Read-only subscription to the public Alphapedia ntfy topic. Off until you connect it in Live.',
      h('div', { class: 'stack tight' }, h('div', { class: 'row' }, h('span', { class: 'dot ' + (src.enabled ? src.status : '') }), src.enabled ? cap(src.status) : 'Off',
        src.last_success_at ? h('span', { class: 'small muted' }, ' · last data ', relTime(src.last_success_at)) : null),
      src.enabled ? h('button', { class: 'btn small', onclick: async () => { await saveSettings({ 'live.ntfy.enabled': false }); render(document.getElementById('main'), { parts: ['sources'] }); } }, 'Turn off') :
        h('button', { class: 'btn small', onclick: () => go('#/live/reports') }, 'Connect in Live…'))),
    row('Feed server and topic', 'Advanced. HTTPS only.', h('div', { class: 'row wrap' },
      h('input', { class: 'input', style: { width: '260px' }, value: state.settings['live.ntfy.server'], onchange: (e) => set('live.ntfy.server')(e.target.value.trim()) }),
      h('input', { class: 'input', style: { width: '140px' }, value: state.settings['live.ntfy.topic'], onchange: (e) => set('live.ntfy.topic')(e.target.value.trim()) }))),
    row('Official news snapshot', `Bundled, independently written summaries checked ${fmtDate(n.snapshot_checked_at)}.`, h('span', { class: 'small' }, `${n.articles.length} posts · ${n.events.length} events`)),
    row('Check official forum', 'Manual only: fetches the official Updates feed (titles, dates, links). Nothing runs automatically.',
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
  b.append(h('h2', { style: { marginTop: 0 } }, 'Data & privacy'),
    notice('info', h('strong', null, 'Your files stay on this computer. '), 'Imports read the folder you choose, copy what is needed into the Companion’s private data folder, and never modify, upload or commit your originals.'),
    h('h3', null, 'PokeMMO data (Pokédex, sprites)'),
    m && !m.error ? h('div', { class: 'card inset small stack tight' }, h('div', null, badge('DUMP_ONLY', 'Imported'), ` ${fmtDate(m.imported_at, true)} · ${m.counts.species} species · ${m.counts.location_rows} location rows · ${m.counts.icons || 0} icons · ${m.counts.battle_sprites || 0} battle sprites`),
      h('div', { class: 'muted' }, Object.entries(m.sources).map(([k, v]) => `${k}: ${v.file}${v.sha256 ? ' (sha256 ' + v.sha256.slice(0, 12) + '…)' : ''}`).join(' · ')),
      m.notes.map((x) => h('div', { class: 'muted' }, x))) : h('div', { class: 'small muted' }, m && m.error ? m.error : 'Not imported yet — the Pokédex shows bundled names, numbers and types only.'),
    h('div', { class: 'row', style: { marginTop: '8px' } }, h('div', { class: 'grow' }, dumpPath), browse(dumpPath, 'dumps'), h('button', { class: 'btn primary', onclick: () => runImport('dumps', dumpPath.value) }, icon('download'), m ? 'Re-import' : 'Import')),
    h('div', { class: 'tiny muted' }, 'Folder with PokedexData.zip (and optionally PokemmoIconsDump.zip, PokemmoBattleSpritesDump.zip, ItemSpriteDump.zip), or a combined Pokemmo-Dumps archive.'),
    h('h3', null, 'Your walkthrough files (private)'),
    importedGuides.length ? h('div', { class: 'small' }, importedGuides.map(([r, s]) => h('div', null, `${cap(r)}: ${s.label.replace('Your walkthrough ', '')} · ${s.steps} steps · imported ${fmtDate(s.checked_at, true)}`))) : h('div', { class: 'small muted' }, 'None imported. Guides use the bundled milestone outline.'),
    h('div', { class: 'row', style: { marginTop: '8px' } }, h('div', { class: 'grow' }, guidePath), browse(guidePath, 'guides'), h('button', { class: 'btn primary', onclick: () => runImport('guides', guidePath.value) }, icon('download'), 'Import walkthroughs')),
    h('div', { class: 'tiny muted' }, 'Reads “KANTO COMPLETE WALKTHROUGH.odt” etc. Re-importing keeps your checkmarks (stable step IDs) and flags any step whose wording changed.'),
    jobBox,
    h('h3', null, 'Backup'),
    h('div', { class: 'row wrap' }, h('button', { class: 'btn', onclick: async () => downloadJson(`pokemmo-companion-backup-${new Date().toISOString().slice(0, 10)}.json`, await get('/api/backup/export')) }, icon('download'), 'Export backup (JSON)'),
      h('button', { class: 'btn', onclick: () => importBackup('merge') }, icon('upload'), 'Import backup — merge'),
      h('button', { class: 'btn danger', onclick: () => importBackup('replace') }, 'Import backup — replace'),
      h('button', { class: 'btn ghost', onclick: async () => { const r = await post('/api/backup/snapshot'); toast('Database snapshot saved: ' + r.path, { timeout: 7000 }); } }, 'Save database snapshot')),
    h('div', { class: 'tiny muted' }, 'Backups contain your runs, checkmarks, favourites, notes, plans, teams, observations and settings — never PokeMMO client data. A safety snapshot is taken before every import.'),
    h('h3', null, 'Storage'),
    h('div', { class: 'small' }, 'Data folder: ', h('span', { class: 'mono' }, boot.data_dir)),
    h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn ghost', onclick: async () => { if (await confirmDialog('Clear report history', 'Delete all saved Alpha/Swarm reports and TEST entries?', 'Clear', true)) { await post('/api/live/clear', {}); toast('Report history cleared'); } } }, 'Clear report history')),
    h('p', { class: 'small muted' }, 'Privacy: no telemetry, no accounts, no game memory access, no automation. Network is used only for the opt-in report feed and the manual “Check forum” button.'));

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
  if (r === 'run') { await createRun(); go('#/guides'); }
}
