import { api, h, post, saveSettings, setting, toast } from './core.js';
import { t } from './i18n.js';

export const REGIONS = ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova'];

export function storyChapters(steps) {
  const chapters = [];
  for (const step of steps) {
    const last = chapters.at(-1);
    const identity = step.chapter_index ?? step.chapter;
    if (last?.identity === identity) last.steps.push(step);
    else chapters.push({ identity, key: step.chapter_index ?? step.id, name: step.chapter, steps: [step] });
  }
  return chapters;
}

export function visibleStorySteps(st) {
  return st.steps.filter(step => st.show_optional || step.mandatory !== false);
}

// Keep checkbox writes ordered within a window and redraw only after the last queued write.
let writes = Promise.resolve();
let pending = 0;
export function refreshStoryWhenIdle(refresh) {
  if (!pending) refresh();
}

export function changeStory(write, refresh) {
  pending++;
  writes = writes.then(write).then(result => {
    if (result?.stale) toast(t('shortcutui.stale'), { kind: 'warn' });
  }).catch(error => toast(error.message, { kind: 'warn' })).finally(() => {
    if (!--pending) refresh();
  });
  return writes;
}

export const patchStory = (st, patch) => api('PATCH', `/api/guides/runs/${st.run.id}`, { region: st.region, ...patch });
export const checkStory = (st, step, done) => post(`/api/guides/runs/${st.run.id}/steps`,
  { step, done, region: st.region, source: st.source });
export const moveStory = (st, action, step) => post(`/api/guides/runs/${st.run.id}/action`,
  { action, step, region: st.region, source: st.source, expect_step: st.active_step_id });

export function revealStoryStep(scroller, row, top = 0) {
  if (!row) return;
  const box = scroller.getBoundingClientRect();
  const target = row.getBoundingClientRect();
  const visibleTop = box.top + top;
  if (target.top < visibleTop || target.bottom > box.bottom) {
    scroller.scrollTop += target.top - visibleTop - 6;
  }
}

export function storyExtrasDetails(key, className, summary, panel) {
  const details = h('details', { class: className, open: setting(key) === true ? '' : null }, summary, panel);
  summary.addEventListener('click', () => saveSettings({ [key]: !details.open }).catch(() => {}));
  return details;
}
