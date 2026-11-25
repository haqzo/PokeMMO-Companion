import { plural, t as translateUI } from './i18n.js';
// Timers and a team attached to a guide (My Guides "cg:<id>" or a run's storyline region "story:<run>:<region>").
// Templates are only recipes stored with the guide; pressing Start creates a timer in the Timers service with an owner
// (guide, step, run, cycle, template) — so it keeps running when you leave the page, close a popout or restart, it
// shows in Tools › Timers too, and another run or cycle gets its own timer. Nothing starts by itself, and a finished
// timer never ticks a step.
import { h, mount, icon, get, post, api, on, toast, confirmDialog, modal } from './core.js';
import { go } from './shell.js';
import { fmt, timerStateLabel, builtinPresetLabel } from './pages/timers.js';
import { teamStrip, editTeamDialog, purposeLabel } from './team-editor.js';

let ticker = null;
function tick() {
  const now = Date.now() / 1000;
  document.querySelectorAll('.gx-rem[data-end]').forEach((e) => {
    const txt = fmt(Math.max(0, Number(e.dataset.end) - now));
    if (e.textContent !== txt) e.textContent = txt;
  });
  if (!document.querySelector('.gx-rem[data-end]')) { clearInterval(ticker); ticker = null; }
}
const ensureTicker = () => { if (!ticker) ticker = setInterval(tick, 250); };

function remEl(t) {
  const e = h('span', { class: 'gx-rem mono', role: 'timer' }, fmt(t.remaining));
  if (t.state === 'running') { e.dataset.end = String(Date.now() / 1000 + t.remaining); ensureTicker(); }
  return e;
}

/** Ask for a timer recipe (name, h/m/s, repeat, sound, notification) — optionally from a saved preset. */
export async function templateDialog(initial = {}) {
  const presets = (await get('/api/timers/presets').catch(() => ({ presets: [] }))).presets;
  const builtin = (await get('/api/timers').catch(() => ({ presets: [] }))).presets || [];
  const sec = initial.seconds || 600;
  const name = h('input', { class: 'input', value: initial.name || '', maxlength: '60', placeholder: translateUI('ui.guide_extra_example'), 'aria-label': translateUI('ui.b272_timer_name') });
  const num = (l, max, v) => h('input', { class: 'input tm-num', type: 'number', min: '0', max: String(max), value: String(v), 'aria-label': l });
  const hh = num(translateUI('ui.b272_timer_hours'), 99, Math.floor(sec / 3600)), mm = num(translateUI('ui.minutes'), 59, Math.floor((sec % 3600) / 60)), ss = num(translateUI('ui.seconds'), 59, sec % 60);
  const rep = h('input', { type: 'checkbox', checked: !!initial.repeat }), snd = h('input', { type: 'checkbox', checked: initial.sound !== false }),
    ntf = h('input', { type: 'checkbox', checked: initial.notify !== false });
  const apply = (p) => { name.value = name.value || p.label; hh.value = Math.floor(p.seconds / 3600); mm.value = Math.floor((p.seconds % 3600) / 60); ss.value = p.seconds % 60;
    if ('repeat' in p) rep.checked = !!p.repeat; if ('sound' in p) snd.checked = !!p.sound; if ('notify' in p) ntf.checked = !!p.notify; };
  const all = [...presets.map((p) => ({ ...p, mine: true })), ...builtin.map(p => ({ ...p, label: builtinPresetLabel(p) }))];
  const body = h('div', { class: 'stack' },
    all.length ? h('div', { class: 'field' }, h('label', null, translateUI('ui.guide_extra_from_preset')), h('div', { class: 'row wrap tight' }, all.map((p) =>
      h('button', { class: 'btn small', type: 'button', onclick: () => apply(p) }, p.mine ? icon('star') : null, `${p.label} · ${fmt(p.seconds)}`)))) : null,
    h('div', { class: 'field' }, h('label', null, translateUI('ui.name')), name),
    h('div', { class: 'row tight' }, hh, h('span', null, translateUI('timerui.hour')), mm, h('span', null, translateUI('timerui.minute')), ss, h('span', null, translateUI('timerui.second'))),
    h('div', { class: 'row wrap' }, h('label', { class: 'row tight small' }, rep, translateUI('ui.repeat')), h('label', { class: 'row tight small' }, snd, translateUI('ui.sound')),
      h('label', { class: 'row tight small' }, ntf, translateUI('ui.guide_extra_notification'))),
    h('p', { class: 'tiny muted', style: { margin: 0 } }, translateUI('ui.guide_extra_timer_help')));
  const ok = await modal({ title: initial.id ? translateUI('ui.guide_extra_edit_timer') : translateUI('ui.guide_extra_add_timer'), body, actions: [{ label: translateUI('ui.cancel'), value: false, kind: 'ghost' }, { label: translateUI('ui.save'), value: true, kind: 'primary' }] });
  if (!ok) return null;
  const seconds = (Number(hh.value) || 0) * 3600 + (Number(mm.value) || 0) * 60 + (Number(ss.value) || 0);
  if (seconds < 1) { toast(translateUI('ui.guide_extra_duration_required'), { kind: 'warn' }); return null; }
  return { ...(initial.id ? { id: initial.id } : {}), name: name.value.trim() || fmt(seconds), seconds, repeat: rep.checked, sound: snd.checked, notify: ntf.checked };
}

/**
 * The guide's state, shared by the panel and step controls of one guide page.
 * ctx: { key, title, run (storyline run id), cycle: async (create) => cycle id | null, steps: {id: title},
 *        nav (route opener: the main window from a popout) }
 */
export function guideExtras(ctx) {
  const st = { extras: null, timers: [], listeners: new Set(), unsub: [] };
  const owner = (tpl, step, cycle) => ({ kind: 'guide', guide: ctx.key, step: step || undefined, run: ctx.run || undefined, cycle: cycle || undefined, template: tpl.id,
    label: (ctx.title + (step && ctx.steps && ctx.steps[step] ? ' · ' + ctx.steps[step] : '')).slice(0, 80) });
  const curCycle = () => (ctx.cycle ? ctx.cycleId : undefined);
  const instanceOf = (tpl, step) => st.timers.find((t) => {
    const o = t.owner || {};
    return o.template === tpl.id && (o.step || '') === String(step || '') && (o.run || '') === String(ctx.run || '') && (o.cycle || '') === String(curCycle() || '');
  });
  async function load() {
    const [ex, tm] = await Promise.all([get('/api/guide-extras/' + encodeURIComponent(ctx.key)), get('/api/timers?guide=' + encodeURIComponent(ctx.key))]);
    st.extras = ex; st.timers = tm.timers;
    if (ctx.cycle) ctx.cycleId = await ctx.cycle(false);
    st.listeners.forEach((f) => f());
  }
  const save = async (patch) => { st.extras = await api('PUT', '/api/guide-extras/' + encodeURIComponent(ctx.key), patch); st.listeners.forEach((f) => f()); };
  async function start(tpl, step) {
    const inst = instanceOf(tpl, step);
    try {
      if (inst) await post(`/api/timers/${inst.id}/${inst.state === 'paused' ? 'resume' : 'start'}`);
      else {
        if (ctx.cycle) ctx.cycleId = await ctx.cycle(true);
        await post('/api/timers', { name: tpl.name, seconds: tpl.seconds, repeat: tpl.repeat, sound: tpl.sound, notify: tpl.notify, start: true, owner: owner(tpl, step, ctx.cycleId) });
      }
      await load();
    } catch (e) { toast(e.message, { kind: 'warn' }); }
  }
  const act = async (t, a) => { try { await post(`/api/timers/${t.id}/${a}`); await load(); } catch (e) { toast(e.message, { kind: 'warn' }); } };

  function controls(tpl, step) {
    const t = instanceOf(tpl, step);
    const startBtn = (label) => h('button', { class: 'btn small primary', onclick: () => start(tpl, step), title: translateUI('ui.guide_extra_start_timer') }, label);
    if (!t) return [h('span', { class: 'gx-rem mono muted' }, fmt(tpl.seconds)), startBtn(translateUI('ui.start'))];
    return [remEl(t), h('span', { class: 'tiny muted' }, timerStateLabel(t.state)),
      t.state === 'running' ? h('button', { class: 'btn small', onclick: () => act(t, 'pause') }, translateUI('ui.pause'))
        : t.state === 'paused' ? h('button', { class: 'btn small primary', onclick: () => act(t, 'resume') }, translateUI('ui.resume')) : startBtn(t.state === 'done' ? translateUI('ui.guide_extra_start_again') : translateUI('ui.start')),
      h('button', { class: 'btn small ghost', onclick: () => act(t, 'reset') }, translateUI('ui.reset'))];
  }

  /** Small timer chips for one step (storyline or My Guides step row). */
  function stepTimers(stepId) {
    const box = h('div', { class: 'gx-step' });
    const draw = () => {
      if (!st.extras) return;
      const list = (st.extras.step_timers || {})[String(stepId)] || [];
      mount(box, list.map((tpl) => h('div', { class: 'gx-step-timer', dataset: { tpl: tpl.id } }, icon('clock'), h('span', { class: 'small' }, tpl.name), ...controls(tpl, stepId),
        h('button', { class: 'icon-btn tiny', 'aria-label': translateUI('ui.guide_extra_remove_named', { name: tpl.name }), title: translateUI('ui.guide_extra_remove_step_timer'), onclick: async () => {
          const map = { ...st.extras.step_timers }; map[String(stepId)] = list.filter((x) => x.id !== tpl.id); await save({ step_timers: map }); } }, icon('close')))),
      h('button', { class: 'btn tiny ghost gx-add-step', title: translateUI('ui.guide_extra_add_step_timer'), onclick: async () => {
        const tpl = await templateDialog(); if (!tpl) return;
        const map = { ...st.extras.step_timers }; map[String(stepId)] = [...list, tpl]; try { await save({ step_timers: map }); } catch (e) { toast(e.message, { kind: 'warn' }); } } }, icon('clock'), translateUI('ui.guide_extra_plus_timer')));
    };
    st.listeners.add(draw); draw();
    return box;
  }

  /** The guide-level card: guide timers, other timers belonging to this guide, and the linked team. */
  function panel() {
    const box = h('div', { class: 'gx-panel stack' });
    const draw = async () => {
      if (!st.extras) return;
      const ex = st.extras;
      const tplIds = new Set([...ex.timers.map((x) => x.id), ...Object.values(ex.step_timers || {}).flat().map((x) => x.id)]);
      const others = st.timers.filter((t) => { const o = t.owner || {};
        return !tplIds.has(o.template) || (o.cycle || '') !== String(curCycle() || '') || (o.run || '') !== String(ctx.run || ''); });
      const timersCard = h('section', { class: 'card stack tight gx-timers' },
        h('h3', { class: 'gx-h' }, icon('clock'), translateUI('ui.timers')), h('div', { class: 'row wrap tight' },
          h('button', { class: 'btn small', onclick: async () => { const tpl = await templateDialog(); if (tpl) { try { await save({ timers: [...ex.timers, tpl] }); } catch (e) { toast(e.message, { kind: 'warn' }); } } } }, icon('plus'), translateUI('ui.guide_extra_add_timer')),
          h('button', { class: 'btn small ghost', title: translateUI('ui.guide_extra_attach_timer_hint'), onclick: attachDialog }, translateUI('ui.guide_extra_attach_existing'))),
        ex.timers.length ? ex.timers.map((tpl) => h('div', { class: 'gx-timer', dataset: { tpl: tpl.id } }, h('div', { class: 'gx-tname' }, tpl.name,
          tpl.repeat ? h('span', { class: 'chip tiny' }, translateUI('ui.b272_timer_repeat_chip')) : null), h('div', { class: 'row tight wrap' }, ...controls(tpl, null), h('span', { class: 'grow' }),
        h('button', { class: 'icon-btn tiny', 'aria-label': translateUI('ui.guide_extra_edit_named', { name: tpl.name }), onclick: async () => { const n = await templateDialog(tpl); if (n) await save({ timers: ex.timers.map((x) => (x.id === tpl.id ? n : x)) }); } }, icon('note')),
        h('button', { class: 'icon-btn tiny', 'aria-label': translateUI('ui.guide_extra_remove_named', { name: tpl.name }), onclick: async () => {
          if (await confirmDialog(translateUI('ui.guide_extra_remove_timer'), translateUI('ui.guide_extra_remove_confirm', { name: tpl.name }), translateUI('ui.remove'), true)) await save({ timers: ex.timers.filter((x) => x.id !== tpl.id) }); } }, icon('close')))))
          : h('div', { class: 'small muted' }, translateUI('ui.guide_extra_no_timers')),
        others.length ? h('div', { class: 'stack tight' }, h('div', { class: 'row' }, h('div', { class: 'label grow' }, ctx.cycle ? translateUI('ui.guide_extra_other_timers_cycles') : translateUI('ui.guide_extra_other_timers')),
          others.some((t) => t.state === 'done' && !t.repeat) ? h('button', { class: 'btn tiny ghost', title: translateUI('ui.guide_extra_clear_finished_hint'),
            onclick: async () => { const r = await post('/api/timers/cleanup', { guide: ctx.key, keep_cycle: curCycle() || null }); toast(plural('ui.guide_extra_cleared', r.removed)); load(); } }, translateUI('ui.guide_extra_clear_finished')) : null),
          others.map((t) => h('div', { class: 'gx-timer row tight wrap' }, h('span', { class: 'grow small' }, t.name, t.owner && t.owner.cycle && t.owner.cycle !== String(curCycle() || '') ? h('span', { class: 'chip tiny' }, translateUI('ui.guide_extra_earlier_cycle')) : null),
            remEl(t), h('span', { class: 'tiny muted' }, timerStateLabel(t.state)),
            t.state === 'running' ? h('button', { class: 'btn small', onclick: () => act(t, 'pause') }, translateUI('ui.pause')) : t.state === 'paused' ? h('button', { class: 'btn small', onclick: () => act(t, 'resume') }, translateUI('ui.resume')) : null,
            h('button', { class: 'icon-btn tiny', title: translateUI('ui.guide_extra_detach_hint'), 'aria-label': translateUI('ui.guide_extra_detach_named', { name: t.name }), onclick: async () => { await api('PUT', `/api/timers/${t.id}/owner`, { owner: null }); load(); } }, icon('close'))))) : null,
        h('button', { class: 'btn tiny ghost', onclick: () => (ctx.nav || go)('#/tools/timers') }, translateUI('ui.guide_extra_open_timers'), icon('chev')));
      const teamCard = h('section', { class: 'card stack tight gx-team' }, h('h3', { class: 'gx-h' }, icon('box'), translateUI('ui.team')),
        h('div', { class: 'row wrap tight' }, ex.team ? [
          h('button', { class: 'btn small', onclick: async () => { const d = await editTeamDialog({ ...ex.team }); if (d) load(); } }, translateUI('common.edit')),
          h('button', { class: 'btn small ghost', onclick: attachTeam }, translateUI('ui.guide_extra_replace')),
          h('button', { class: 'btn small ghost', onclick: () => (ctx.nav || go)('#/tools/team?team=' + ex.team.id) }, translateUI('ui.guide_extra_open_team')),
          h('button', { class: 'btn small ghost', onclick: async () => { await save({ team_id: null }); } }, translateUI('ui.guide_extra_unlink'))] : [
          h('button', { class: 'btn small primary', onclick: async () => { const d = await editTeamDialog(null); if (d) await save({ team_id: d.id }); } }, icon('plus'), translateUI('ui.guide_extra_create_team')),
          h('button', { class: 'btn small', onclick: attachTeam }, translateUI('ui.guide_extra_attach_team'))]),
      ex.team ? h('div', { class: 'stack tight' }, h('div', { class: 'row tight' }, h('strong', null, ex.team.name), ex.team.data && ex.team.data.purpose ? h('span', { class: 'chip tiny' }, purposeLabel(ex.team.data.purpose)) : null),
        await teamStrip(ex.team), ex.team.data && ex.team.data.notes ? h('div', { class: 'small muted', style: { whiteSpace: 'pre-wrap' } }, ex.team.data.notes) : null,
        h('div', { class: 'tiny muted' }, translateUI('ui.guide_extra_team_shared')))
        : ex.team_missing ? h('div', { class: 'notice warn small' }, translateUI('ui.guide_extra_team_deleted'))
          : h('div', { class: 'small muted' }, translateUI('ui.guide_extra_no_team')));
      mount(box, timersCard, teamCard);
    };
    async function attachDialog() {
      const all = (await get('/api/timers')).timers.filter((t) => !t.owner);
      if (!all.length) { toast(translateUI('ui.guide_extra_no_standalone')); return; }
      const sel = h('select', { class: 'input', 'aria-label': translateUI('ui.guide_extra_timer') }, all.map((t) => h('option', { value: t.id }, `${t.name} · ${fmt(t.remaining)} · ${timerStateLabel(t.state)}`)));
      if (!await modal({ title: translateUI('ui.guide_extra_attach_existing_timer'), body: h('div', { class: 'stack' }, sel, h('p', { class: 'tiny muted' }, translateUI('ui.guide_extra_attach_help'))),
        actions: [{ label: translateUI('ui.cancel'), value: false, kind: 'ghost' }, { label: translateUI('ui.guide_extra_attach'), value: true, kind: 'primary' }] })) return;
      if (ctx.cycle) ctx.cycleId = await ctx.cycle(false);
      await api('PUT', `/api/timers/${sel.value}/owner`, { owner: { kind: 'guide', guide: ctx.key, run: ctx.run || undefined, cycle: ctx.cycleId || undefined, label: ctx.title.slice(0, 80) } });
      load();
    }
    async function attachTeam() {
      const teams = (await get('/api/docs/team')).items;
      if (!teams.length) { toast(translateUI('ui.guide_extra_no_saved_team')); return; }
      const sel = h('select', { class: 'input', 'aria-label': translateUI('ui.team') }, teams.map((t) => h('option', { value: t.id, selected: st.extras.team_id === t.id ? 'selected' : null },
        t.name + (t.data && t.data.purpose ? ' · ' + purposeLabel(t.data.purpose) : ''))));
      if (await modal({ title: translateUI('ui.guide_extra_attach_team'), body: sel, actions: [{ label: translateUI('ui.cancel'), value: false, kind: 'ghost' }, { label: translateUI('ui.guide_extra_attach'), value: true, kind: 'primary' }] })) await save({ team_id: sel.value });
    }
    st.listeners.add(draw); draw();
    return box;
  }

  st.unsub.push(on('timers', () => { if (st.extras) load().catch(() => {}); }));
  st.unsub.push(on('guide_extras', (d) => { if (d && d.key === ctx.key) load().catch(() => {}); }));
  st.unsub.push(on('documents', (d) => { if (st.extras && d && d.kind === 'team' && d.id === st.extras.team_id) load().catch(() => {}); }));
  return { load, panel, stepTimers, dispose: () => { st.unsub.forEach((u) => u()); st.listeners.clear(); } };
}
