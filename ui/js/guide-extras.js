// Timers and a team attached to a guide (My Guides "cg:<id>" or a run's storyline region "story:<run>:<region>").
// Templates are only recipes stored with the guide; pressing Start creates a timer in the Timers service with an owner
// (guide, step, run, cycle, template) — so it keeps running when you leave the page, close a popout or restart, it
// shows in Tools › Timers too, and another run or cycle gets its own timer. Nothing starts by itself, and a finished
// timer never ticks a step.
import { h, mount, icon, get, post, api, on, toast, confirmDialog, modal } from './core.js';
import { go } from './shell.js';
import { fmt } from './pages/timers.js';
import { teamStrip, editTeamDialog, purposeLabel } from './team-editor.js';

const STATE = { idle: 'Ready', running: 'Running', paused: 'Paused', done: 'Finished' };
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
  const name = h('input', { class: 'input', value: initial.name || '', maxlength: '60', placeholder: 'e.g. Rematch cooldown', 'aria-label': 'Timer name' });
  const num = (l, max, v) => h('input', { class: 'input tm-num', type: 'number', min: '0', max: String(max), value: String(v), 'aria-label': l });
  const hh = num('Hours', 99, Math.floor(sec / 3600)), mm = num('Minutes', 59, Math.floor((sec % 3600) / 60)), ss = num('Seconds', 59, sec % 60);
  const rep = h('input', { type: 'checkbox', checked: !!initial.repeat }), snd = h('input', { type: 'checkbox', checked: initial.sound !== false }),
    ntf = h('input', { type: 'checkbox', checked: initial.notify !== false });
  const apply = (p) => { name.value = name.value || p.label; hh.value = Math.floor(p.seconds / 3600); mm.value = Math.floor((p.seconds % 3600) / 60); ss.value = p.seconds % 60;
    if ('repeat' in p) rep.checked = !!p.repeat; if ('sound' in p) snd.checked = !!p.sound; if ('notify' in p) ntf.checked = !!p.notify; };
  const all = [...presets.map((p) => ({ ...p, mine: true })), ...builtin];
  const body = h('div', { class: 'stack' },
    all.length ? h('div', { class: 'field' }, h('label', null, 'From a preset'), h('div', { class: 'row wrap tight' }, all.map((p) =>
      h('button', { class: 'btn small', type: 'button', onclick: () => apply(p) }, p.mine ? icon('star') : null, `${p.label} · ${fmt(p.seconds)}`)))) : null,
    h('div', { class: 'field' }, h('label', null, 'Name'), name),
    h('div', { class: 'row tight' }, hh, h('span', null, 'h'), mm, h('span', null, 'm'), ss, h('span', null, 's')),
    h('div', { class: 'row wrap' }, h('label', { class: 'row tight small' }, rep, 'Repeat'), h('label', { class: 'row tight small' }, snd, 'Sound'),
      h('label', { class: 'row tight small' }, ntf, 'Notification')),
    h('p', { class: 'tiny muted', style: { margin: 0 } }, 'The timer only starts when you press Start. When it finishes it notifies you; it never ticks a step.'));
  const ok = await modal({ title: initial.id ? 'Edit timer' : 'Add timer', body, actions: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Save', value: true, kind: 'primary' }] });
  if (!ok) return null;
  const seconds = (Number(hh.value) || 0) * 3600 + (Number(mm.value) || 0) * 60 + (Number(ss.value) || 0);
  if (seconds < 1) { toast('Set a duration', { kind: 'warn' }); return null; }
  return { ...(initial.id ? { id: initial.id } : {}), name: name.value.trim() || fmt(seconds), seconds, repeat: rep.checked, sound: snd.checked, notify: ntf.checked };
}

/**
 * The guide's state, shared by the panel and step controls of one guide page.
 * ctx: { key, title, run (storyline run id), cycle: async (create) => cycle id | null, steps: {id: title} }
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
    const startBtn = (label) => h('button', { class: 'btn small primary', onclick: () => start(tpl, step), title: 'Start this timer' }, label);
    if (!t) return [h('span', { class: 'gx-rem mono muted' }, fmt(tpl.seconds)), startBtn('Start')];
    return [remEl(t), h('span', { class: 'tiny muted' }, STATE[t.state]),
      t.state === 'running' ? h('button', { class: 'btn small', onclick: () => act(t, 'pause') }, 'Pause')
        : t.state === 'paused' ? h('button', { class: 'btn small primary', onclick: () => act(t, 'resume') }, 'Resume') : startBtn(t.state === 'done' ? 'Start again' : 'Start'),
      h('button', { class: 'btn small ghost', onclick: () => act(t, 'reset') }, 'Reset')];
  }

  /** Small timer chips for one step (storyline or My Guides step row). */
  function stepTimers(stepId) {
    const box = h('div', { class: 'gx-step' });
    const draw = () => {
      if (!st.extras) return;
      const list = (st.extras.step_timers || {})[String(stepId)] || [];
      mount(box, list.map((tpl) => h('div', { class: 'gx-step-timer', dataset: { tpl: tpl.id } }, icon('clock'), h('span', { class: 'small' }, tpl.name), ...controls(tpl, stepId),
        h('button', { class: 'icon-btn tiny', 'aria-label': 'Remove timer ' + tpl.name, title: 'Remove this timer from the step (a running timer keeps running in Timers)', onclick: async () => {
          const map = { ...st.extras.step_timers }; map[String(stepId)] = list.filter((x) => x.id !== tpl.id); await save({ step_timers: map }); } }, icon('close')))),
      h('button', { class: 'btn tiny ghost gx-add-step', title: 'Add a timer to this step', onclick: async () => {
        const tpl = await templateDialog(); if (!tpl) return;
        const map = { ...st.extras.step_timers }; map[String(stepId)] = [...list, tpl]; try { await save({ step_timers: map }); } catch (e) { toast(e.message, { kind: 'warn' }); } } }, icon('clock'), '+ timer'));
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
        h('h3', { class: 'gx-h' }, icon('clock'), 'Timers'), h('div', { class: 'row wrap tight' },
          h('button', { class: 'btn small', onclick: async () => { const tpl = await templateDialog(); if (tpl) { try { await save({ timers: [...ex.timers, tpl] }); } catch (e) { toast(e.message, { kind: 'warn' }); } } } }, icon('plus'), 'Add timer'),
          h('button', { class: 'btn small ghost', title: 'Attach a timer you already made in Tools › Timers', onclick: attachDialog }, 'Attach existing')),
        ex.timers.length ? ex.timers.map((tpl) => h('div', { class: 'gx-timer', dataset: { tpl: tpl.id } }, h('div', { class: 'gx-tname' }, tpl.name,
          tpl.repeat ? h('span', { class: 'chip tiny' }, '↻ repeat') : null), h('div', { class: 'row tight wrap' }, ...controls(tpl, null), h('span', { class: 'grow' }),
        h('button', { class: 'icon-btn tiny', 'aria-label': 'Edit timer ' + tpl.name, onclick: async () => { const n = await templateDialog(tpl); if (n) await save({ timers: ex.timers.map((x) => (x.id === tpl.id ? n : x)) }); } }, icon('note')),
        h('button', { class: 'icon-btn tiny', 'aria-label': 'Remove timer ' + tpl.name, onclick: async () => {
          if (await confirmDialog('Remove timer?', `“${tpl.name}” is removed from this guide. A timer that is running keeps running in Tools › Timers.`, 'Remove', true)) await save({ timers: ex.timers.filter((x) => x.id !== tpl.id) }); } }, icon('close')))))
          : h('div', { class: 'small muted' }, 'No guide timers yet. Add one (e.g. a rerun cooldown), or add a timer to a single step with “+ timer”.'),
        others.length ? h('div', { class: 'stack tight' }, h('div', { class: 'label' }, ctx.cycle ? 'Other timers of this guide (earlier cycles or attached)' : 'Other timers of this guide'),
          others.map((t) => h('div', { class: 'gx-timer row tight wrap' }, h('span', { class: 'grow small' }, t.name, t.owner && t.owner.cycle && t.owner.cycle !== String(curCycle() || '') ? h('span', { class: 'chip tiny' }, 'earlier cycle') : null),
            remEl(t), h('span', { class: 'tiny muted' }, STATE[t.state]),
            t.state === 'running' ? h('button', { class: 'btn small', onclick: () => act(t, 'pause') }, 'Pause') : t.state === 'paused' ? h('button', { class: 'btn small', onclick: () => act(t, 'resume') }, 'Resume') : null,
            h('button', { class: 'icon-btn tiny', title: 'Detach from this guide (the timer stays in Tools › Timers)', 'aria-label': 'Detach ' + t.name, onclick: async () => { await api('PUT', `/api/timers/${t.id}/owner`, { owner: null }); load(); } }, icon('close'))))) : null,
        h('button', { class: 'btn tiny ghost', onclick: () => go('#/tools/timers') }, 'Open Timers', icon('chev')));
      const teamCard = h('section', { class: 'card stack tight gx-team' }, h('h3', { class: 'gx-h' }, icon('box'), 'Team'),
        h('div', { class: 'row wrap tight' }, ex.team ? [
          h('button', { class: 'btn small', onclick: async () => { const d = await editTeamDialog({ ...ex.team }); if (d) load(); } }, 'Edit'),
          h('button', { class: 'btn small ghost', onclick: attachTeam }, 'Replace'),
          h('button', { class: 'btn small ghost', onclick: () => go('#/tools/team?team=' + ex.team.id) }, 'Open in Team builder'),
          h('button', { class: 'btn small ghost', onclick: async () => { await save({ team_id: null }); } }, 'Unlink')] : [
          h('button', { class: 'btn small primary', onclick: async () => { const d = await editTeamDialog(null); if (d) await save({ team_id: d.id }); } }, icon('plus'), 'Create team'),
          h('button', { class: 'btn small', onclick: attachTeam }, 'Attach saved team')]),
      ex.team ? h('div', { class: 'stack tight' }, h('div', { class: 'row tight' }, h('strong', null, ex.team.name), ex.team.data && ex.team.data.purpose ? h('span', { class: 'chip tiny' }, purposeLabel(ex.team.data.purpose)) : null),
        await teamStrip(ex.team), ex.team.data && ex.team.data.notes ? h('div', { class: 'small muted', style: { whiteSpace: 'pre-wrap' } }, ex.team.data.notes) : null,
        h('div', { class: 'tiny muted' }, 'Shared with Team builder and any other guide using this team — edits show everywhere.'))
        : ex.team_missing ? h('div', { class: 'notice warn small' }, 'The linked team was deleted. Attach another team or unlink it.')
          : h('div', { class: 'small muted' }, 'No team linked. A linked team is the same saved team you see in Tools › Team builder.'));
      mount(box, timersCard, teamCard);
    };
    async function attachDialog() {
      const all = (await get('/api/timers')).timers.filter((t) => !t.owner);
      if (!all.length) { toast('No standalone timers to attach — make one in Tools › Timers'); return; }
      const sel = h('select', { class: 'input', 'aria-label': 'Timer' }, all.map((t) => h('option', { value: t.id }, `${t.name} · ${fmt(t.remaining)} · ${STATE[t.state]}`)));
      if (!await modal({ title: 'Attach existing timer', body: h('div', { class: 'stack' }, sel, h('p', { class: 'tiny muted' }, 'The timer keeps its time and state; it is listed with this guide and in Tools › Timers.')),
        actions: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Attach', value: true, kind: 'primary' }] })) return;
      if (ctx.cycle) ctx.cycleId = await ctx.cycle(false);
      await api('PUT', `/api/timers/${sel.value}/owner`, { owner: { kind: 'guide', guide: ctx.key, run: ctx.run || undefined, cycle: ctx.cycleId || undefined, label: ctx.title.slice(0, 80) } });
      load();
    }
    async function attachTeam() {
      const teams = (await get('/api/docs/team')).items;
      if (!teams.length) { toast('No saved teams yet — create one'); return; }
      const sel = h('select', { class: 'input', 'aria-label': 'Team' }, teams.map((t) => h('option', { value: t.id, selected: st.extras.team_id === t.id ? 'selected' : null },
        t.name + (t.data && t.data.purpose ? ' · ' + purposeLabel(t.data.purpose) : ''))));
      if (await modal({ title: 'Attach saved team', body: sel, actions: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Attach', value: true, kind: 'primary' }] })) await save({ team_id: sel.value });
    }
    st.listeners.add(draw); draw();
    return box;
  }

  st.unsub.push(on('timers', () => { if (st.extras) load().catch(() => {}); }));
  st.unsub.push(on('guide_extras', (d) => { if (d && d.key === ctx.key) load().catch(() => {}); }));
  st.unsub.push(on('documents', (d) => { if (st.extras && d && d.kind === 'team' && d.id === st.extras.team_id) load().catch(() => {}); }));
  return { load, panel, stepTimers, dispose: () => { st.unsub.forEach((u) => u()); st.listeners.clear(); } };
}
