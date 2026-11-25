import { t as translateUI } from '../i18n.js';
// Tools › Timers — your own named countdowns. Completion is detected by the backend (the page does not need to
// stay open) and delivered through your notification settings. These are NOT in-game spawn timers and are
// separate from Live's estimates.
import { h, mount, icon, get, post, api, on, toast, confirmDialog } from '../core.js';
import { go, popoutButton, pinButton } from '../shell.js';

let unsub = [];
let frame = null;
export function dispose() { unsub.forEach((u) => u()); unsub = []; if (frame) cancelAnimationFrame(frame); frame = null; }

export function fmt(sec) {
  const s = Math.max(0, Math.ceil(sec - 1e-6));
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return (hh ? hh + ':' + String(mm).padStart(2, '0') : String(mm)) + ':' + String(ss).padStart(2, '0');
}
export const ownerRoute = (o) => o.guide.startsWith('cg:') ? '#/guides/mine/' + o.guide.slice(3)
  : o.guide.startsWith('story:') ? '#/guides/storyline?region=' + o.guide.split(':')[2] : '#/tools/timers';
const STATE_LABEL = { idle: 'ui.b272_timer_state_ready', running: 'ui.b272_timer_state_running', paused: 'ui.b272_timer_state_paused', done: 'ui.b272_timer_state_finished' };

function ring(progress, size) {
  const r = size / 2 - 4, c = 2 * Math.PI * r;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`); svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('class', 'tm-ring'); svg.setAttribute('aria-hidden', 'true'); svg.style.width = size + 'px'; svg.style.height = size + 'px';
  const mk = (cls) => { const e = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    e.setAttribute('cx', size / 2); e.setAttribute('cy', size / 2); e.setAttribute('r', r); e.setAttribute('class', cls); svg.append(e); return e; };
  mk('tm-ring-bg');
  const fg = mk('tm-ring-fg');
  fg.setAttribute('stroke-dasharray', String(c));
  fg.setAttribute('transform', `rotate(-90 ${size / 2} ${size / 2})`);
  svg.set = (p) => fg.setAttribute('stroke-dashoffset', String(c * (1 - Math.max(0, Math.min(1, p)))));
  svg.set(progress);
  return svg;
}

/** Shared timer list. `variant`: 'page' | 'compact' | 'standard' | 'expanded' (popout modes). */
export async function renderTimers(el, { variant = 'page' } = {}) {
  dispose();
  let data = { timers: [], presets: [] };
  let syncedAt = performance.now();
  const listEl = h('div', { class: 'tm-list ' + variant, role: 'list', 'aria-label': translateUI('ui.timers') });
  const live = h('div', { class: 'sr-only', 'aria-live': 'polite' });
  const remainingOf = (t) => (t.state === 'running' ? Math.max(0, t.remaining - (performance.now() - syncedAt) / 1000) : t.remaining);
  const act = async (t, a) => { try { await post(`/api/timers/${t.id}/${a}`); await refresh(); } catch (e) { toast(e.message, { kind: 'warn' }); } };
  const views = new Map();

  function card(t) {
    const compact = variant === 'compact';
    const timeEl = h('div', { class: 'tm-time', role: 'timer', 'aria-label': translateUI('ui.b272_timer_remaining') }, fmt(t.remaining));
    const rg = compact ? null : ring(t.progress, variant === 'expanded' || variant === 'page' ? 92 : 64);
    const toggle = t.state === 'running' ? [translateUI('ui.pause'), 'pause'] : t.state === 'paused' ? [translateUI('ui.resume'), 'resume'] : [translateUI('ui.start'), 'start'];
    const name = h('div', { class: 'tm-name' }, t.name);
    const rename = async () => {
      const inp = h('input', { class: 'input', value: t.name, 'aria-label': translateUI('ui.b272_timer_name'), maxlength: '60' });
      name.replaceWith(inp); inp.focus(); inp.select();
      const done = async (save) => { if (save && inp.value.trim() !== t.name) await api('PATCH', `/api/timers/${t.id}`, { name: inp.value }); await refresh(); };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') { e.stopPropagation(); done(false); } });
      inp.addEventListener('blur', () => done(true));
    };
    const bar = compact ? h('div', { class: 'tm-bar' }, h('span', { style: { width: (t.progress * 100).toFixed(1) + '%' } })) : null;
    const c = h('div', { class: 'tm-card ' + t.state, role: 'listitem', tabindex: '0', dataset: { id: t.id, state: t.state },
      'aria-label': `${t.name}: ${translateUI(STATE_LABEL[t.state])}`,
      onkeydown: (e) => {
        if (e.target !== c) return;
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); act(t, toggle[1]); }
        else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); act(t, 'reset'); }
      } },
    rg ? h('div', { class: 'tm-ringwrap' }, rg, timeEl) : null,
    h('div', { class: 'tm-main' },
      h('div', { class: 'row tight' }, name, t.owner && t.owner.label ? h('button', { class: 'chip tiny btnlike tm-owner', title: translateUI('ui.b272_timer_guide'),
        onclick: () => go(ownerRoute(t.owner)) }, icon('guides'), t.owner.label) : null, t.repeat ? h('span', { class: 'chip tiny', title: translateUI('ui.b272_timer_repeat_auto') }, translateUI('ui.b272_timer_repeat_chip')) : null,
        t.pinned ? h('span', { class: 'chip tiny' }, translateUI('ui.b272_timer_quick')) : null),
      compact ? h('div', { class: 'row tight' }, timeEl, bar) : null,
      h('div', { class: 'tiny muted tm-state' }, translateUI(STATE_LABEL[t.state]), t.state === 'done' && t.late_by >= 5 ? translateUI('ui.b272_timer_late') : '',
        t.state !== 'done' ? translateUI('ui.b272_timer_of', { duration: fmt(t.duration) }) : ''),
      h('div', { class: 'row tight tm-actions' },
        h('button', { class: 'btn small' + (t.state === 'running' ? '' : ' primary'), onclick: () => act(t, toggle[1]) }, toggle[0]),
        h('button', { class: 'btn small ghost', onclick: () => act(t, 'reset'), title: translateUI('ui.b272_timer_reset_key') }, translateUI('ui.reset')),
        compact ? null : h('button', { class: 'btn small ghost', onclick: () => act(t, 'duplicate') }, translateUI('ui.duplicate')),
        compact ? null : h('button', { class: 'icon-btn', 'aria-label': translateUI('ui.b272_timer_rename', { name: t.name }), title: translateUI('ui.rename'), onclick: rename }, icon('note')),
        compact ? null : h('button', { class: 'icon-btn', 'aria-pressed': String(t.repeat), 'aria-label': translateUI('ui.repeat'), title: t.repeat ? translateUI('ui.b272_timer_repeat_on') : translateUI('ui.b272_timer_repeat_off'),
          onclick: async () => { await api('PATCH', `/api/timers/${t.id}`, { repeat: !t.repeat }); refresh(); } }, icon('refresh')),
        compact ? null : h('button', { class: 'icon-btn', 'aria-pressed': String(t.sound), 'aria-label': translateUI('ui.sound'), title: t.sound ? translateUI('ui.b272_timer_sound_on') : translateUI('ui.b272_timer_sound_off'),
          onclick: async () => { await api('PATCH', `/api/timers/${t.id}`, { sound: !t.sound }); refresh(); } }, icon('bell')),
        compact ? null : h('button', { class: 'icon-btn', 'aria-label': translateUI('ui.b272_timer_delete_name', { name: t.name }), title: translateUI('ui.delete'),
          onclick: async () => { if (await confirmDialog(translateUI('ui.b272_timer_delete'), translateUI('ui.b272_timer_delete_confirm', { name: t.name }), translateUI('common.delete'), true)) { await api('DELETE', `/api/timers/${t.id}`); refresh(); } } }, icon('trash')))));
    views.set(t.id, { t, timeEl, rg, bar });
    return c;
  }

  function draw() {
    views.clear();
    mount(listEl, data.timers.length ? data.timers.map(card) : h('div', { class: 'empty small' }, translateUI('ui.b272_timer_empty')));
  }
  async function refresh() {
    const keepFocus = document.activeElement && document.activeElement.closest && document.activeElement.closest('.tm-card');
    const fid = keepFocus && keepFocus.dataset.id;
    data = await get('/api/timers');
    syncedAt = performance.now();
    draw();
    if (fid) { const n = listEl.querySelector(`.tm-card[data-id="${fid}"]`); if (n) n.focus(); }
  }
  function loop() {
    for (const { t, timeEl, rg, bar } of views.values()) {
      if (t.state !== 'running') continue;
      const rem = remainingOf(t);
      const txt = fmt(rem);
      if (timeEl.textContent !== txt) timeEl.textContent = txt;
      const p = 1 - rem / t.duration;
      if (rg) rg.set(p);
      if (bar) bar.firstChild.style.width = (p * 100).toFixed(1) + '%';
    }
    frame = el.isConnected ? requestAnimationFrame(loop) : null;
  }

  // ---- new timer form
  const nameIn = h('input', { class: 'input', placeholder: translateUI('ui.b272_timer_placeholder'), 'aria-label': translateUI('ui.b272_timer_new_name'), maxlength: '60' });
  const num = (label, max, val) => h('input', { class: 'input tm-num', type: 'number', min: '0', max: String(max), value: String(val), 'aria-label': label, inputmode: 'numeric' });
  const hh = num(translateUI('ui.b272_timer_hours'), 99, 0), mm = num(translateUI('ui.minutes'), 59, 10), ss = num(translateUI('ui.seconds'), 59, 0);
  const repeat = h('input', { type: 'checkbox', 'aria-label': translateUI('ui.repeat') });
  const sound = h('input', { type: 'checkbox', checked: true, 'aria-label': translateUI('ui.sound') });
  const add = async (start) => {
    const secs = (Number(hh.value) || 0) * 3600 + (Number(mm.value) || 0) * 60 + (Number(ss.value) || 0);
    try { await post('/api/timers', { name: nameIn.value, seconds: secs, repeat: repeat.checked, sound: sound.checked, start }); nameIn.value = ''; await refresh(); }
    catch (e) { toast(e.message, { kind: 'warn' }); }
  };
  const presets = h('div', { class: 'row tight tm-presets', role: 'group', 'aria-label': translateUI('ui.presets') });
  const form = h('form', { class: 'tm-form', onsubmit: (e) => { e.preventDefault(); add(true); } },
    variant === 'compact' ? null : nameIn,
    h('div', { class: 'row tight' }, hh, h('span', null, 'h'), mm, h('span', null, 'm'), ss, h('span', null, 's'),
      h('label', { class: 'row tight small' }, repeat, translateUI('ui.repeat')), h('label', { class: 'row tight small' }, sound, translateUI('ui.sound'))),
    h('div', { class: 'row tight' }, h('button', { class: 'btn primary small', type: 'submit' }, icon('plus'), translateUI('ui.b272_timer_add_start')),
      h('button', { class: 'btn small', type: 'button', onclick: () => add(false) }, translateUI('ui.add')),
      h('button', { class: 'btn small ghost', type: 'button', title: translateUI('ui.b272_timer_preset_help'), onclick: async () => {
        const secs = (Number(hh.value) || 0) * 3600 + (Number(mm.value) || 0) * 60 + (Number(ss.value) || 0);
        try { await post('/api/timers/presets', { label: nameIn.value || fmt(secs), seconds: secs, repeat: repeat.checked, sound: sound.checked }); toast(translateUI('ui.b272_timer_preset_saved')); drawPresets(); }
        catch (e) { toast(e.message, { kind: 'warn' }); } } }, translateUI('ui.b272_timer_preset_save'))));

  const showForm = variant !== 'compact';
  mount(el, h('div', { class: 'tm-wrap ' + variant },
    h('div', { class: 'tm-top' }, presets, showForm ? form : null),
    listEl, live,
    variant === 'page' ? h('details', { class: 'tm-help small muted' }, h('summary', null, translateUI('ui.b272_timer_help')),
      h('p', null, translateUI('ui.b272_timer_help_bg'),
        translateUI('ui.b272_timer_help_sleep')),
      h('p', null, translateUI('ui.b272_timer_help_sound'),
        translateUI('ui.b272_timer_help_manual'))) : null));
  data = await get('/api/timers');
  syncedAt = performance.now();
  function drawPresets(list) {
    const up = list || data.user_presets || [];
    mount(presets, data.presets.map((p) => h('button', { class: 'btn small', type: 'button', onclick: async () => {
      await post('/api/timers', { name: p.label, seconds: p.seconds, start: true }); refresh(); } }, p.label)),
    up.map((p) => h('span', { class: 'tm-upreset' }, h('button', { class: 'btn small', type: 'button', title: translateUI('ui.b272_timer_preset_start', { name: p.label, duration: fmt(p.seconds) }), onclick: async () => {
      await post('/api/timers', { name: p.label, seconds: p.seconds, repeat: p.repeat, sound: p.sound, notify: p.notify, start: true }); refresh(); } }, icon('star'), p.label),
    variant === 'compact' ? null : h('button', { class: 'icon-btn tiny', 'aria-label': translateUI('ui.b272_timer_preset_delete_name', { name: p.label }), title: translateUI('ui.b272_timer_preset_delete_title'), onclick: async () => {
      if (await confirmDialog(translateUI('ui.b272_timer_preset_delete'), translateUI('ui.b272_timer_preset_delete_confirm', { name: p.label }), translateUI('common.delete'), true)) { await api('DELETE', `/api/timers/presets/${p.id}`); drawPresets(); } } }, icon('close')))));
    if (!list) get('/api/timers/presets').then((r) => { data.user_presets = r.presets; drawPresets(r.presets); }).catch(() => {});
  }
  drawPresets(data.user_presets);
  draw();
  unsub.push(on('timers', (p) => { if (p && p.what === 'presets') drawPresets(); else refresh(); }));
  unsub.push(on('timers.done', (p) => { live.textContent = p.title; refresh(); }));
  frame = requestAnimationFrame(loop);
  return { refresh };
}

export async function render(el) {
  const page = h('div', { class: 'page' });
  mount(el, page);
  page.append(h('div', { class: 'page-head' },
    h('button', { class: 'btn ghost', onclick: () => go('#/tools') }, icon('back'), translateUI('tools.title')),
    h('div', null, h('h1', null, translateUI('ui.timers')), h('div', { class: 'sub' }, translateUI('ui.b272_timer_desc'))),
    h('div', { class: 'actions' }, pinButton({ kind: 'tool', id: 'timers' }), popoutButton('timers'))));
  const body = h('div');
  page.append(body);
  await renderTimers(body, { variant: 'page' });
}
