// Live workspace (docs/design/10–13): Reports, Legendaries, Altering Cave.
import { animatedIn, motionGlobal } from '../sprites.js';
import { h, mount, icon, get, post, api, state, setting, saveSettings, badge, notice, relTime, fmtDate, cap, tabs, seg, toast, confirmDialog, modal,
  on, extLink, debounce, typeChips, spriteOrFallback, stillArt, fitSprite, sourceInfo } from '../core.js';
import { go, popoutButton } from '../shell.js';

let unsub = [];
let ui = { kind: 'all', q: '', hideTests: false, calendar: false };
export function dispose() { unsub.forEach((u) => u()); unsub = []; }

// ---------------------------------------------------------------- current reports & estimated timers
// Times come from the server ("now" + each report's start), so a wrong or changed local clock only shifts the
// offset once per refresh. Timers tick locally; the list is re-fetched every minute and whenever the window
// becomes visible again (sleep/resume), which also re-classifies reports.
const STATE_CLASS = { recent: 'ok', uncertain: 'warn', ended: 'muted', replayed: 'muted', test: 'test', info: 'muted' };
const durText = (s) => { const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
export function timerText(st, nowMs) {
  if (!st || !st.duration_min) return '';
  const end = Date.parse(st.ends_at);
  const left = Math.round((end - nowMs) / 1000);
  if (st.state === 'recent' && left > 0) return `≈ ${durText(left)} left (estimate)`;
  if (left <= 0 && (st.state === 'recent' || st.state === 'uncertain')) return `Estimated window ended ${durText(-left)} ago`;
  return '';
}
export function startTimers(root, skewMs, onExpire) {
  let seen = false;
  const tick = () => {
    if (!root.isConnected) { if (seen) clearInterval(id); return; }  // not in the page yet, or gone (page switched)
    seen = true;
    const now = Date.now() + skewMs;
    let expired = false;
    root.querySelectorAll('[data-ends]').forEach((el) => {
      const st = { state: el.dataset.state, duration_min: 1, ends_at: el.dataset.ends };
      el.textContent = timerText(st, now);
      if (el.dataset.state === 'recent' && Date.parse(el.dataset.ends) <= now) expired = true;
    });
    if (expired && onExpire) onExpire();
  };
  const id = setInterval(tick, 15000);
  tick();
  // built before it is placed in the page (Home assembles its sections first): fill the countdowns as soon as it is
  if (!seen) { const t0 = Date.now(); const early = setInterval(() => { if (root.isConnected) { tick(); clearInterval(early); } else if (Date.now() - t0 > 5000) clearInterval(early); }, 50); }
  requestAnimationFrame(tick);
  return () => clearInterval(id);
}
const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
/** Card for one current Alpha/Swarm (several identical reports are one card, timed from the earliest). */
export function currentCard(g, { compact = false, animate = false } = {}) {
  const st = g.status;
  const sure = g.species_name && g.species_match !== 'ambiguous';  // a report naming several Pokémon shows its own title
  const where = [g.region && cap(g.region), g.location].filter(Boolean).join(' · ');
  return h('button', { class: `cur-card kind-${g.kind}${compact ? ' compact' : ''}`, dataset: { report: g.id, state: st.state },
    onclick: () => go('#/live/reports/' + g.id), 'aria-label': `${g.kind} ${sure ? g.species_name : g.title}, ${where}, ${st.label}` },
  reportSprite(g, { animate }),
  h('div', { class: 'cur-text' },
    h('div', { class: 'row tight' }, h('span', { class: `kind-label kind-${g.kind}` }, g.kind),
      h('span', { class: `cur-state ${STATE_CLASS[st.state]}` }, st.state === 'recent' ? 'Likely active' : st.label)),
    h('div', { class: 'cur-name ellipsis' }, (sure ? g.species_name : g.title) || '(no title)'),
    sure || !g.species_name ? null : h('div', { class: 'tiny muted ellipsis' }, 'Names several Pokémon'),
    where ? h('div', { class: 'small ellipsis cur-where' }, where) : h('div', { class: 'small muted' }, 'Location not identified'),
    h('div', { class: 'tiny muted' }, `Reported ${timeOf(st.start)} · ${relTime(st.start)}`, g.duplicates ? ` · reported ${g.duplicates + 1}×` : '', g.caught_up ? ' · caught up on reconnect' : ''),
    h('div', { class: 'tiny cur-timer', dataset: { ends: st.ends_at, state: st.state } }, st.ends_at ? timerText({ state: st.state, duration_min: 1, ends_at: st.ends_at }, Date.now()) : ''),
    compact ? null : h('div', { class: 'tiny muted' }, `${g.provider === 'ntfy' ? 'Alphapedia ntfy' : g.provider} · community report`, st.notes.length ? ' · ⚠ ' + st.notes[0] : '')));
}
export function estimatesNote(est) {
  return h('p', { class: 'tiny muted', style: { margin: 0 } }, `Timers are estimates counted from when a Pokémon was reported (not when it spawned): Alpha ${est.alpha_minutes} min (official changelog), `,
    `Swarm ~${est.swarm_minutes} min (community estimate, not official — adjustable in Settings › Live). Nothing here confirms a Pokémon is still there.`);
}
const ROUTE_LABEL = { off: 'Off', toast: 'Companion toast', os: 'OS notification', both: 'Toast + OS' };

export async function render(el, route) {
  dispose();
  const sub = ['reports', 'legendaries', 'cave'].includes(route.parts[0]) ? route.parts[0] : 'reports';
  const page = h('div', { class: 'page' });
  mount(el, page);
  const src = await get('/api/live/source');
  page.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Live'), h('div', { class: 'sub' }, 'Time-sensitive information — each item shows its source and age. Nothing here reads the game.')),
    h('div', { class: 'actions' }, popoutButton(sub))),
  h('div', { class: 'row wrap', style: { marginBottom: '14px' } }, tabs([{ id: 'reports', label: 'Alpha & Swarm reports' }, { id: 'legendaries', label: 'Legendaries' }, { id: 'cave', label: 'Altering Cave' }],
    sub, (t) => go('#/live/' + t), 'Live sections')));
  const body = h('div');
  page.append(body);
  if (sub === 'legendaries') return renderLegendaries(body);
  if (sub === 'cave') return renderCave(body);
  return renderReports(body, route.parts[1], src);
}

// ---------------------------------------------------------------- reports
export function sourceBar(src, { compact = false } = {}) {
  const label = !src.enabled ? 'Report feed is off' : { connected: 'Connected · listening (read-only)', connecting: 'Connecting…', offline: 'Feed unavailable', error: 'Feed error', disabled: 'Off' }[src.status] || src.status;
  return h('div', { class: 'source-bar' }, h('span', { class: 'dot ' + (src.enabled ? src.status : '') }),
    h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, label),
      compact ? null : h('div', { class: 'small muted' }, src.enabled ? `${src.server}/${src.topic} · ${src.detail || ''}` : 'Opt-in. When on, the Companion only reads the public Alphapedia ntfy topic.',
        src.last_success_at ? ` · last data ${relTime(src.last_success_at)}` : '')),
    compact ? null : (src.enabled ? h('button', { class: 'btn', onclick: async () => { await saveSettings({ 'live.ntfy.enabled': false }); toast('Report feed turned off'); go('#/live/reports'); } }, 'Turn off')
      : h('button', { class: 'btn primary', onclick: consentDialog }, 'Connect report feed…')));
}

async function consentDialog() {
  const ok = await modal({ title: 'Connect the Alphapedia report feed?', body: h('div', { class: 'stack tight' },
    h('p', { style: { margin: 0 } }, 'The Companion will open a read-only connection to the public ntfy topic advertised by Alphapedia and save incoming community reports to your local history.'),
    h('ul', { class: 'small', style: { margin: 0, color: 'var(--text-secondary)' } },
      h('li', null, 'Read-only: nothing is posted, no account or game data is sent.'),
      h('li', null, 'Reports are community observations, shown as “Reported …”, never as guaranteed active.'),
      h('li', null, 'The exact Alphapedia message format has not been validated yet; reports show the provider’s own text and any Alpha/Swarm or species labels are detected from that text.'),
      h('li', null, 'Old messages replayed after (re)connecting go to history without notifications.')),
    h('div', { class: 'small' }, extLink('https://forums.pokemmo.com/index.php?/topic/197731-alphapedia-real-time-alphaswarm-pok%C3%A9mon-notifications-and-history-for-pc-mobile/', 'Alphapedia forum topic'), ' · ',
      extLink('https://docs.ntfy.sh/subscribe/api/', 'ntfy subscribe API'))),
  actions: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Connect (read-only)', value: true, kind: 'primary' }] });
  if (ok) { await saveSettings({ 'live.ntfy.consented': true, 'live.ntfy.enabled': true }); toast('Connecting to the report feed…'); go('#/live/reports'); }
}

async function testDialog() {
  const kind = await modal({ title: 'Send a TEST notification', body: h('div', { class: 'stack tight' },
    h('p', { style: { margin: 0 } }, 'Creates a clearly labelled local test entry and delivers it through your notification settings. It is not a real report and says nothing about the game.'),
    h('div', { class: 'small muted' }, `Test delivery: ${ROUTE_LABEL[setting('notify.test')]} · change in Settings › Notifications`)),
  actions: [{ label: 'Cancel', value: null, kind: 'ghost' }, { label: 'Test as Swarm', value: 'swarm' }, { label: 'Test as Alpha', value: 'alpha', kind: 'primary' }] });
  if (!kind) return;
  const r = await post('/api/live/test', { kind });
  const d = r.delivery || {};
  const parts = [];
  if (d.toast) parts.push(`toast ${d.toast.delivered ? 'shown' : 'not shown'} (${d.toast.backend})`);
  if (d.os) parts.push(`OS notification ${d.os.delivered ? 'sent' : 'failed'} (${d.os.backend}${d.os.error ? ': ' + d.os.error : ''})`);
  toast(`TEST delivered: ${parts.join(', ') || 'route is Off — saved to history only'}`, { timeout: 7000 });
}

async function renderReports(el, selectedId, src) {
  const listBox = h('div', { class: 'stack tight' });
  const inspector = h('div');
  const load = async () => {
    const qs = new URLSearchParams();
    if (ui.kind !== 'all') qs.set('kind', ui.kind);
    if (ui.q) qs.set('q', ui.q);
    qs.set('tests', ui.hideTests ? '0' : '1');
    const r = await get('/api/live/reports?' + qs);
    mount(listBox, r.reports.length ? r.reports.map((x) => reportRow(x, x.id === selectedId)) : h('div', { class: 'empty' },
      h('h3', null, 'No reports'), h('p', null, src.enabled ? 'Nothing received yet. This does not mean there are no Alphas or Swarms right now.' :
        'The feed is off, so the Companion makes no claim about current Alphas or Swarms.')));
    if (selectedId) {
      try { renderReportDetail(inspector, await get('/api/live/reports/' + selectedId)); } catch (_) { mount(inspector); }
    } else mount(inspector, h('div', { class: 'card muted small' }, 'Select a report to see its source details.'));
  };
  const notifier = state.boot.notifier;
  const curBox = h('div', { class: 'cur-grid' });
  const curNote = h('div');
  let stopTimers = null;
  const loadCurrent = async () => {
    const c = await get('/api/live/current');
    const skew = Date.parse(c.now) - Date.now();
    const warn = !c.source.enabled ? notice('info', c.current.length ? 'The report feed is off — new reports are not being received. These cards were received while it was on.'
      : null)
      : !c.complete ? notice('warn', `The feed is ${c.source.status}${c.source.last_success_at ? ` (last data ${relTime(c.source.last_success_at)})` : ''} — recent reports may be missing. This does not mean none are active.`) : null;
    mount(curBox, c.current.length ? c.current.map((g) => currentCard(g)) :
      h('div', { class: 'empty small', style: { gridColumn: '1/-1' } }, c.source.enabled ? 'No Alpha or Swarm reported recently. This does not mean none are active.' : 'Turn on the report feed to see community reports here.'));
    mount(curNote, h('div', { class: 'stack tight' }, warn, estimatesNote(c.estimates)));
    if (stopTimers) stopTimers();
    stopTimers = startTimers(curBox, skew, () => loadCurrent());
  };
  const refreshCurrent = () => { if (document.visibilityState !== 'hidden') loadCurrent(); };
  const every = setInterval(refreshCurrent, 60000);
  document.addEventListener('visibilitychange', refreshCurrent);
  unsub.push(() => { clearInterval(every); document.removeEventListener('visibilitychange', refreshCurrent); if (stopTimers) stopTimers(); });
  el.append(h('div', { class: 'stack' }, sourceBar(src),
    h('section', { class: 'stack tight', 'aria-labelledby': 'cur-h' }, h('div', { class: 'row' }, h('h2', { class: 'section-title', id: 'cur-h' }, 'Current / recently reported'),
      sourceInfo('REPORTED', 'Only recent community reports appear here; TEST entries and older history are in Report history.')), curBox, curNote),
    h('h2', { class: 'section-title history-title' }, 'Report history'),
    h('div', { class: 'row wrap' },
      seg([['all', 'All'], ['alpha', 'Alpha'], ['swarm', 'Swarm'], ['other', 'Other']], ui.kind, (v) => { ui.kind = v; load(); }, 'Report type'),
      h('div', { class: 'search', style: { flex: '1 1 200px', maxWidth: '300px' } }, icon('search'), h('input', { class: 'input', type: 'search', placeholder: 'Search reports', value: ui.q,
        oninput: debounce((e) => { ui.q = e.target.value; load(); }, 200) })),
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: ui.hideTests, onchange: (e) => { ui.hideTests = e.target.checked; load(); } }), h('span', { class: 'small' }, 'Hide TEST entries')),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: testDialog }, icon('bell'), 'Send TEST notification'),
      h('button', { class: 'btn ghost', title: `Delivery settings — Alpha: ${ROUTE_LABEL[setting('notify.alpha')]} · Swarm: ${ROUTE_LABEL[setting('notify.swarm')]}${notifier.available ? '' : ' · system notifications unavailable'}`,
        onclick: () => go('#/settings/notifications') }, icon('gear'), 'Delivery')),
    setting('notify.quiet') ? h('div', { class: 'small muted' }, 'Do not disturb is on — notifications are silent.') : null,
    h('div', { class: 'grid-2', style: { gridTemplateColumns: 'minmax(0,1.3fr) minmax(300px,1fr)', alignItems: 'start' } }, listBox, inspector),
    h('div', { class: 'row' }, h('button', { class: 'btn ghost small', onclick: async () => { if (await confirmDialog('Clear TEST entries', 'Remove all TEST notifications from history?')) { await post('/api/live/clear', { tests_only: true }); load(); } } }, 'Clear TEST entries'),
      h('button', { class: 'btn ghost small', onclick: async () => { if (await confirmDialog('Clear report history', 'Remove all saved reports? Settings are kept.', 'Clear', true)) { await post('/api/live/clear', {}); load(); } } }, 'Clear history'))));
  await Promise.all([load(), loadCurrent()]);
  unsub.push(on('live.report', () => { load(); loadCurrent(); }));
  unsub.push(on('live.source', (s) => { const bar = el.querySelector('.source-bar'); if (bar) bar.replaceWith(sourceBar(s)); }));
}

/** Pokémon sprite for a report, or a neutral fallback when the report doesn't name one species clearly.
 *  Box icons are 36 px art and battle sprites 96 px; CSS shows them at whole-number scales so pixels stay sharp. */
/**
 * Home only: a report is "likely active" while its estimated window is still open — counted from the EARLIEST report
 * of the group (duplicates never restart it) and only when the report carries its own time (a report time is still
 * not a confirmed spawn time). Reports without a usable time, expired ones and test entries are not.
 */
export function likelyActive(g, nowMs = Date.now()) {
  const st = g.status || {};
  return !g.is_test && st.state === 'recent' && st.start_basis === 'report time' && !!st.ends_at && Date.parse(st.ends_at) > nowMs;
}
export function reportSprite(r, { battle = false, animate = false } = {}) {
  const kind = r.is_test ? 'test' : r.kind;
  const wrap = (child, cls = '') => h('div', { class: 'rep-sprite' + (battle ? ' battle' : '') + cls }, child);
  // A report naming several Pokémon gets the neutral icon, never a guessed sprite.
  if (r.species_match === 'ambiguous') return wrap(spriteFallback(r, kind));
  // Animated Gen V sprite (your sprite library) only where asked (Home, likely-active reports) and motion is allowed.
  // Live itself always shows still images.
  if (animate && r.species_ani && motionAllowed()) {
    const holder = wrap(null, ' library animated');
    const img = h('img', { class: 'pixel rep-ani', src: r.species_ani, alt: r.species_name || '', decoding: 'async', style: { visibility: 'hidden' } });
    const box = h('div', { class: 'still-art' }, img);
    holder.append(box);
    img.addEventListener('load', () => {
      const size = holder.clientWidth || 72;
      const f = fitSprite(img.naturalWidth, img.naturalHeight, null, 'm', size, size);
      Object.assign(box.style, { width: size + 'px', height: size + 'px' });
      Object.assign(img.style, { width: f.width + 'px', height: f.height + 'px', left: f.left + 'px', top: f.top + 'px', visibility: '' });
      box.classList.toggle('smooth', f.smooth);
    });
    img.addEventListener('error', () => holder.replaceWith(reportSprite(r, { battle })));
    return holder;
  }
  if (r.species_still) {
    const holder = wrap(null, ' library');
    // the box size comes from CSS (it changes with the window), so fit the still once it is in the page
    requestAnimationFrame(() => { const size = holder.clientWidth || 72; holder.append(stillArt(r.species_still, { name: r.species_name || '' }, size, { cap: battle ? 2 : 1.5 })); });
    return holder;
  }
  const url = battle ? (r.species_front || r.species_icon) : r.species_icon;
  if (url) {
    const img = h('img', { class: 'pixel', src: url, alt: r.species_name || '', decoding: 'async', title: r.species_name || null });
    img.addEventListener('error', () => img.replaceWith(spriteFallback(r, kind)));
    return wrap(img);
  }
  return wrap(spriteFallback(r, kind));
}
const motionAllowed = () => motionGlobal();
function spriteFallback(r, kind) {
  const why = r.species_match === 'ambiguous' ? 'This report mentions more than one Pokémon — no sprite shown'
    : r.species_id ? 'No local sprite — install your PokeMMO data' : 'No Pokémon identified in this report';
  return h('span', { class: 'rep-fallback', title: why, 'aria-label': why }, icon(kind === 'test' ? 'bell' : 'live'));
}

export function reportRow(r, selected, compact) {
  const kind = r.is_test ? 'test' : r.kind;
  return h('div', { class: 'report-row' + (selected ? ' selected' : ''), role: 'button', tabindex: '0', onclick: () => go('#/live/reports/' + r.id),
    onkeydown: (e) => { if (e.key === 'Enter') go('#/live/reports/' + r.id); } },
  reportSprite(r, { animate: animatedIn('live_history') }),
  h('div', { style: { minWidth: 0 } }, h('div', { class: 'row' }, h('span', { class: `kind-label kind-${kind}` }, kind === 'test' ? 'TEST · not real' : kind),
    r.species_name && (r.species_icon || r.species_still) ? h('span', { class: 'small rep-species' }, r.species_name) : null,
    r.kind_basis === 'text-keyword' ? h('span', { class: 'tiny muted' }, '(detected from text)') : null,
    r.status && !r.is_test ? h('span', { class: `cur-state ${STATE_CLASS[r.status.state]}` }, r.status.state === 'recent' ? 'Likely active' : r.status.label) : null,
    r.is_replay ? h('span', { class: 'tiny muted' }, '· received on reconnect') : null),
  h('div', { class: 'ellipsis', style: { fontWeight: 600 } }, r.title || r.body), compact ? null : h('div', { class: 'small muted ellipsis' }, r.body)),
  h('div', { class: 'small muted nowrap' }, 'Reported ', relTime(r.source_time || r.received_at)));
}

function renderReportDetail(el, r) {
  const kind = r.is_test ? 'test' : r.kind;
  const d = r.delivery || {};
  mount(el, h('div', { class: 'card stack' },
    h('div', { class: 'row' }, h('span', { class: `kind-label kind-${kind}` }, kind === 'test' ? 'TEST notification' : kind + ' report'), h('span', { class: 'grow' }),
      r.is_test ? badge('TEST', 'Local test — not a real report') : sourceInfo('REPORTED', 'Community report.')),
    h('div', { class: 'rep-detail-head' }, reportSprite(r, { battle: true, animate: animatedIn('live_history') }),
      h('div', { style: { minWidth: 0 } }, h('h3', { style: { margin: 0 } }, r.title || '(no title)'),
        r.species_name && (r.species_name !== r.title || r.species_match === 'ambiguous') ? h('div', { class: 'small muted' }, r.species_name,
          r.species_match === 'ambiguous' ? ' — the report names several Pokémon, so no sprite is shown' : '') : null)),
    r.body ? h('p', { style: { margin: 0, whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' } }, r.body) : null,
    r.species_id ? h('div', { class: 'row' }, h('span', { class: 'small muted' }, 'Species mentioned (detected from text):'),
      h('button', { class: 'btn small', onclick: () => go('#/pokedex/' + r.species_id) }, r.species_name, icon('chev'))) : null,
    h('dl', { class: 'kv small' },
      h('dt', null, 'Reported'), h('dd', null, r.source_time ? fmtDate(r.source_time, true) + ` (${relTime(r.source_time)})` : 'No source time'),
      h('dt', null, 'Received'), h('dd', null, fmtDate(r.received_at, true) + (r.is_replay ? ' — replayed from history, no alert' : '')),
      h('dt', null, 'Status'), h('dd', null, r.status ? [r.status.label, r.status.duration_min ? ` — ${timerText(r.status, Date.now()) || 'estimate passed'}` : '',
        h('div', { class: 'tiny muted' }, r.status.estimate ? `${r.status.estimate}, counted from the ${r.status.start_basis}. Not a confirmation that it is still there.` : 'No timer for this report type.',
          ...r.status.notes.map((n) => h('div', null, '⚠ ' + n)))] : 'Reported — not confirmed active'),
      h('dt', null, 'Source'), h('dd', null, `${r.provider}${r.topic ? ' / ' + r.topic : ''} · message ${r.message_id}`),
      h('dt', null, 'Parser'), h('dd', null, r.parser_version + (r.provider === 'ntfy' ? ' (payload format not yet validated)' : '')),
      h('dt', null, 'Delivery'), h('dd', null, deliveryText(d))),
    r.tags && r.tags.length ? h('div', { class: 'row wrap' }, r.tags.map((t) => h('span', { class: 'chip' }, t))) : null));
}
function deliveryText(d) {
  if (!d || !d.route) return 'Not delivered (history only)';
  if (d.suppressed) return d.suppressed;
  const p = [`Route: ${ROUTE_LABEL[d.route] || d.route}`];
  if (d.toast) p.push(`toast ${d.toast.delivered ? 'shown' : 'not shown'} via ${d.toast.backend}`);
  if (d.os) p.push(`OS ${d.os.delivered ? 'delivered' : 'failed'} via ${d.os.backend}${d.os.error ? ' — ' + d.os.error : ''}`);
  return p.join(' · ');
}

// ----------------------------------------------------------- legendaries
export async function renderLegendaries(el, { compact = false } = {}) {
  const L = await get('/api/live/legendaries');
  const runs = await get('/api/guides/runs');
  const run = runs.runs.find((r) => r.id === runs.active);
  const card = (region, mon) => {
    const caught = !!L.caught[mon.id];
    return h('div', { class: 'legend-card' }, h('div', { style: { width: '72px', height: '72px', display: 'grid', placeItems: 'center' } }, spriteOrFallback(mon.icon, mon, compact ? 48 : 72)),
      h('div', { class: 'grow' }, h('div', { class: 'tiny muted', style: { textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 600 } }, cap(region) + ' roamer'),
        h('div', { style: { fontWeight: 700, fontSize: '1.15rem' } }, mon.name), typeChips(mon.types, true),
        compact ? null : h('div', { class: 'row', style: { marginTop: '6px' } }, run ? h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: caught,
          onchange: async (e) => { await post('/api/live/legendaries/caught', { species: mon.id, caught: e.target.checked }); toast(`${mon.name} marked ${e.target.checked ? 'caught' : 'not caught'} for ${run.display}`); } }),
        h('span', { class: 'small' }, `Caught (${run.display})`)) : h('span', { class: 'tiny muted' }, 'Create a run in Guides to track catches per character.'),
        h('button', { class: 'btn small ghost', onclick: () => go('#/pokedex/' + mon.id) }, 'Pokédex'))));
  };
  const monthName = (m, y) => new Date(y, m - 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });
  const cur = L.current, nxt = L.next;
  mount(el, h('div', { class: 'stack', style: { maxWidth: '980px' } },
    h('div', { class: 'card stack' }, h('div', { class: 'row wrap' }, h('h2', { style: { margin: 0, fontSize: '1.15rem' } }, `This month · ${monthName(cur.month, cur.year)}`), h('span', { class: 'grow' }),
      sourceInfo('COMMUNITY-CYCLE')),
    h('div', { class: 'legend-pair' }, card('kanto', cur.kanto), card('johto', cur.johto)),
    h('div', { class: 'small muted' }, L.status_note)),
    compact ? null : h('div', { class: 'card' }, h('div', { class: 'row wrap' }, h('strong', null, `Next · ${monthName(nxt.month, nxt.year)}: `), h('span', { style: { marginLeft: '6px' } }, `${nxt.kanto.name} (Kanto) · ${nxt.johto.name} (Johto)`),
      h('span', { class: 'grow' }), h('button', { class: 'btn small', onclick: () => { ui.calendar = !ui.calendar; renderLegendaries(el); } }, ui.calendar ? 'Hide calendar' : 'Show 12-month calendar')),
    ui.calendar ? h('div', { class: 'cal', style: { marginTop: '12px' } }, L.calendar.map((m, i) => h('div', { class: 'm' + (i === 0 ? ' now' : '') },
      h('div', { class: 'small muted' }, monthName(m.month, m.year)), h('div', null, m.kanto.name), h('div', null, m.johto.name)))) : null),
    compact ? null : h('div', { class: 'grid-2' },
      h('div', { class: 'card stack tight' }, h('h3', { style: { margin: 0 } }, 'Requirements'), h('div', { class: 'small' }, h('strong', null, 'Kanto: '), L.requirements.kanto),
        h('div', { class: 'small' }, h('strong', null, 'Johto: '), L.requirements.johto),
        h('div', { class: 'small muted' }, 'Rollover time and timezone are unknown, so no countdown is shown.')),
      h('div', { class: 'card stack tight' }, h('h3', { style: { margin: 0 } }, 'Not monthly roamers'), L.not_roamers.map((n) => h('div', { class: 'small' }, h('strong', null, n.label), ' — ', n.note)),
        h('div', { class: 'small muted' }, 'Raids, events, storyline and contested legendaries are separate acquisition classes.'))),
    compact ? null : h('div', { class: 'small muted' }, 'Source: ', extLink(L.source_url, 'Roaming Legendaries FAQ (official forum, community guide)'), ` · checked ${fmtDate(L.checked_at)}`)));
  unsub.push(on('legendaries', () => {}));
}

// ------------------------------------------------------------- cave
export async function renderCave(el, { compact = false } = {}) {
  const C = await get('/api/live/cave');
  const latest = C.observations[0];
  const now = new Date(); now.setSeconds(0, 0);
  const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const form = h('form', { class: 'stack tight', onsubmit: async (e) => { e.preventDefault(); const f = new FormData(form);
    const when = f.get('observed_at') ? new Date(f.get('observed_at')).toISOString() : new Date().toISOString();
    try { await post('/api/live/cave', { observed_at: when, crystal: f.get('crystal'), species: f.get('species'), method: f.get('method'), notes: f.get('notes') });
      toast('Observation saved'); renderCave(el); } catch (err) { toast(err.message, { kind: 'warn' }); } } },
  h('div', { class: 'row wrap' }, h('div', { class: 'field' }, h('label', null, 'When'), h('input', { class: 'input', type: 'datetime-local', name: 'observed_at', value: localIso })),
    h('div', { class: 'field grow' }, h('label', null, 'Crystal / biome (as you saw it)'), h('input', { class: 'input', name: 'crystal', maxlength: 60, placeholder: 'e.g. what the cave showed' }))),
  h('div', { class: 'row wrap' }, h('div', { class: 'field grow' }, h('label', null, 'Pokémon / items seen'), h('input', { class: 'input', name: 'species', maxlength: 200 })),
    h('div', { class: 'field' }, h('label', null, 'Kind'), h('select', { class: 'input', name: 'method' }, ['Single', 'Horde', 'Pickup', 'Other'].map((m) => h('option', null, m))))),
  h('div', { class: 'field' }, h('label', null, 'Notes'), h('input', { class: 'input', name: 'notes', maxlength: 500 })),
  h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'submit' }, 'Save my observation'), h('span', { class: 'small muted' }, 'Stored locally and always labelled as yours.')));
  mount(el, h('div', { class: 'stack', style: { maxWidth: '980px' } },
    h('div', { class: 'card stack tight' }, h('div', { class: 'row' }, icon('crystal'), h('h2', { style: { margin: 0, fontSize: '1.15rem' } }, 'Current rotation'), h('span', { class: 'grow' }), badge('UNKNOWN', 'Unknown')),
      h('div', { style: { fontWeight: 600 } }, C.current.label), h('div', { class: 'small muted' }, C.current.reason),
      latest ? h('div', { class: 'small' }, `Your latest observation: ${latest.crystal || '—'} · ${latest.species || '—'} · ${relTime(latest.observed_at)} `,
        h('span', { class: 'small muted' }, latest.freshness === 'recent' ? 'Your report · under 6 h old' : 'Older report')) : null),
    compact ? null : h('div', { class: 'card stack tight' }, h('h3', { style: { margin: 0 } }, 'Known mechanics'), C.mechanics.map((m) => h('div', { class: 'small' }, '• ', m.text, ' ', h('span', { class: 'muted' }, '— '), extLink(m.url, m.source)))),
    compact ? null : h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, 'Log what you see')), form),
    compact ? null : h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, 'Your observation history')),
      C.observations.length ? h('table', { class: 'table compact' }, h('thead', null, h('tr', null, ['When', 'Crystal / biome', 'Seen', 'Kind', 'Notes', ''].map((c) => h('th', null, c)))),
        h('tbody', null, C.observations.map((o) => h('tr', null, h('td', { class: 'nowrap' }, fmtDate(o.observed_at, true), h('div', { class: 'tiny muted' }, o.freshness)),
          h('td', null, o.crystal || '—'), h('td', null, o.species || '—'), h('td', null, o.method || '—'), h('td', { class: 'small' }, o.notes || ''),
          h('td', null, h('button', { class: 'icon-btn', 'aria-label': 'Delete observation', onclick: async () => { await api('DELETE', '/api/live/cave/' + o.id); renderCave(el); } }, icon('trash'))))))) :
        h('div', { class: 'muted small' }, 'No observations yet. History never predicts future rotations.')),
    compact ? null : h('div', { class: 'small muted' }, 'Community sources (not integrated): ', C.community.map((c, i) => [i ? ' · ' : '', extLink(c.url, c.label)]))));
}
