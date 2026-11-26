import { h, mount, get, post, on, extLink, fmtDate, modal, toast, saveSettings } from '../core.js';
import { lang, t } from '../i18n.js';
import { gameTerm, speciesLabel } from '../game-locale.js';
import { communityActions, communityEnabled, communityEvidence, localFeedback } from './community.js';

const local = value => value[lang()] || value.en;
const option = (value, label, selected) => h('option', { value, selected: value === selected }, label);
const field = (label, input) => h('label', { class: 'field' }, h('span', { class: 'label' }, label), input);

function reportDialog(event, activity, original) {
  const id = crypto.randomUUID();
  const observed = new Date().toISOString();
  const meta = original?.community;
  const position = h('select', { class: 'input' }, option('', t('community.location_unknown'), meta?.location_id),
    activity.places.map(place => option(place.id, gameTerm('location', place.name), meta?.location_id)));
  const onset = h('select', { class: 'input' },
    option('already_active', t('community.already_active'), meta?.onset),
    option('just_appeared', t('community.just_appeared'), meta?.onset));
  const provenance = h('select', { class: 'input' },
    option('firsthand', t('community.firsthand'), meta?.provenance), option('relayed', t('community.relayed'), meta?.provenance));
  const details = h('textarea', { class: 'input', maxlength: 240, rows: 2 }, original?.body || '');
  const error = h('div', { role: 'alert', class: 'small muted' });
  return modal({
    title: local(activity.report),
    body: h('div', { class: 'stack' }, h('p', { class: 'small muted' }, t('community.local_only')),
      activity.places.length ? field(t('community.choose_location'), position) : null,
      field(t('community.choose_onset'), onset), field(t('community.choose_provenance'), provenance),
      field(t('community.details'), details), error),
    actions: [{ label: t('ui.cancel') }, { label: t('community.save'), kind: 'primary', handler: async () => {
      try {
        return await post('/api/live/community/reports' + (original ? '/' + original.id + '/correct' : ''), {
          observation_id: id, kind: 'seasonal', event_id: event.id, year: event.year, activity: activity.id,
          observed_at: observed, location_id: position.value || null, onset: onset.value,
          provenance: provenance.value, details: details.value,
        });
      } catch (e) { error.textContent = e.rawMessage?.startsWith('community.') ? t(e.rawMessage) : e.message; return false; }
    } }],
  });
}

function activityView(event, activity, open) {
  return h('article', { class: 'stack tight' },
    h('strong', null, local(activity.name)), h('div', { class: 'small' }, local(activity.description)),
    h('div', { class: 'row wrap' }, activity.places.map(place =>
      h('button', { class: 'btn ghost small', onclick: () => open('#/tools/locations/' + encodeURIComponent(place.id)) },
        gameTerm('location', place.name)))),
    activity.pokemon.length ? h('div', { class: 'small muted' }, activity.pokemon.map(p => speciesLabel(p.id, p.name)).join(', ')) : null,
    h('div', { class: 'row wrap' },
      activity.report ? h('button', { class: 'btn ghost small', onclick: async () => {
        if (!communityEnabled()) await saveSettings({ 'live.community.enabled': true });
        await reportDialog(event, activity);
      } }, communityEnabled() ? t('community.new') : t('seasonal.enable_report')) : null,
      activity.manual_seconds ? h('button', { class: 'btn ghost small', onclick: async () => {
        try {
          await post('/api/timers', { name: local(activity.name).slice(0, 60), seconds: activity.manual_seconds, start: true });
          open('#/tools/timers');
        } catch (e) { toast(e.message, { kind: 'warn' }); }
      } }, t('seasonal.manual_timer')) : null));
}

export function bindSeasonal(panel, { compact = false, open }) {
  let timeout, revision = 0, stopped = false;
  const expanded = new Map();
  async function refresh() {
    clearTimeout(timeout);
    const request = ++revision;
    try {
      const { events, reports, next_change_at: next } = await get('/api/live/seasonal');
      if (stopped || request !== revision || !panel.isConnected) return;
      panel.hidden = !events.length;
      mount(panel, events.map(event => {
        const key = event.id + ':' + event.year;
        const activity = id => event.activities.find(item => item.id === id);
        const ownReports = reports.filter(r => r.community.event_id === event.id && r.community.year === event.year);
        const changed = event.changes || [];
        const contents = h('div', { class: 'stack tight' },
          h('div', { class: 'small' }, local(event.description)),
          h('div', { class: 'small muted' }, t('seasonal.confirmed_window', {
            start: fmtDate(event.starts_at, true), end: fmtDate(event.ends_at, true) })),
          event.redemption_ends_at ? h('div', { class: 'small muted' }, t('seasonal.redemption_until',
            { end: fmtDate(event.redemption_ends_at, true) })) : null,
          h('div', { class: 'row wrap small' }, extLink(event.source, t('ui.source')),
            h('span', { class: 'muted' }, t('seasonal.revision', { revision: event.revision, date: event.verified_on }))),
          changed.length ? h('details', null, h('summary', null, t('seasonal.changes')), changed.map(change =>
            h('div', { class: 'small' }, t('seasonal.' + change.kind), ' · ', fmtDate(change.at, true), ' · ',
              local(change.description), ' ', extLink(change.source, t('ui.source'))))) : null,
          event.phase === 'active' ? event.activities.map(a => activityView(event, a, open)) : null,
          ...ownReports.slice(0, compact ? 2 : 20).map(r => {
            const a = activity(r.community.activity);
            const estimate = r.community.estimated_end;
            return h('article', { class: 'card stack tight', dataset: { seasonalReport: r.id } },
              h('strong', null, a?.report ? local(a.report) : r.title), communityEvidence(r),
              h('div', { class: 'small muted' }, t('community.observed'), ' ', fmtDate(r.source_time, true)),
              r.location ? h('div', { class: 'small' }, gameTerm('location', r.location)) : null,
              r.body ? h('div', { class: 'small' }, r.body) : null,
              estimate ? h('div', { class: 'small muted' }, t('seasonal.estimated_end', { end: fmtDate(estimate, true) }),
                ' · ', extLink(r.community.timing_source, t('ui.source'))) : h('div', { class: 'small muted' }, t('community.no_phenomenon_timer')),
              localFeedback(r), a?.report && event.phase === 'active' ? communityActions(r,
                { compact, correct: original => reportDialog(event, a, original) }) : null);
          }));
        const card = h('details', { class: 'card stack tight', open: expanded.get(key) ?? !compact,
          ontoggle: e => { expanded.set(key, e.currentTarget.open); } },
          h('summary', null, local(event.name), ' · ', t('seasonal.' + event.phase)), contents);
        return card;
      }));
      if (next) timeout = setTimeout(refresh, Math.min(2147483647, Math.max(100, Date.parse(next) - Date.now() + 100)));
    } catch { if (!stopped && request === revision && panel.isConnected) timeout = setTimeout(refresh, 30000); }
  }
  const remove = [on('reference', refresh), on('live.report', data => { if (data?.kind === 'seasonal') refresh(); }),
    on('settings', data => { if (Object.hasOwn(data || {}, 'live.community.enabled')) refresh(); })];
  refresh();
  return () => { stopped = true; clearTimeout(timeout); remove.forEach(stop => stop()); };
}
