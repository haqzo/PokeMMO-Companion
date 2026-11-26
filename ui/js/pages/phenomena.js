import { gameTerm, searchText, speciesLabel } from '../game-locale.js';
import { lang, t } from '../i18n.js';
import { h, mount, state, setting, extLink, get, fmtDate, relTime, notice, cap } from '../core.js';
import { go } from '../shell.js';
import { communityActions, communityBar, communityEnabled, communityEvidence, communityHistory,
  communitySavedRoute, localFeedback, locationSearchTerms, phenomenonType, reportPhenomenon, spotLabel } from './community.js';

const LOCATION_GUIDE = 'https://forums.pokemmo.com/index.php?/topic/77087-phenomenon-locations-guide/';
const ROOT = '/api/live/phenomena';
const TYPES = ['grass', 'water', 'dust', 'shadow'];
const views = new WeakMap();
const location = (name) => gameTerm('location', name);
const locationRoute = (id) => '#/tools/locations/' + encodeURIComponent(id);

function callouts(showDiscord = true) {
  const discord = showDiscord && state.boot.community?.discord;
  return h('div', { class: 'stack tight' },
    discord ? h('div', { class: 'small' }, t('ui.phenomena_discord', { channel: '#phenomenon-callouts' })) : null,
    h('div', { class: 'row wrap small' }, extLink(state.boot.alphapedia.website, 'Alphapedia'),
      discord ? extLink(discord, 'PokeMMO Companion Discord') : null));
}

export function homePhenomena() {
  const recent = h('div', { class: 'stack tight' });
  const section = h('section', { class: 'stack tight home-phenomena' },
    h('div', { class: 'row wrap' }, h('strong', { class: 'grow' }, t('ui.phenomena')),
      h('button', { class: 'btn ghost small', onclick: () => go('#/live/phenomena') }, t('ui.reference_encounter'))),
    recent, callouts(setting('home.community_link') !== false));
  let revision = 0;
  async function refresh() {
    const requested = ++revision;
    try {
      const data = await get(ROOT + '?view=home');
      if (!section.isConnected || requested !== revision) return;
      const r = data.source.enabled && data.recent[0];
      const where = r && (r.location_match.name ? location(r.location_match.name) : r.location);
      mount(recent, r ? h('div', { class: 'row wrap small' },
        h('button', { class: 'btn ghost small', onclick: () => go('#/live/phenomena/' + r.message_id) },
          [r.phenomenon_type ? phenomenonType(r.phenomenon_type) : r.type, where].filter(Boolean).join(' · ') || t('ui.phenomena')),
        h('span', { class: 'tiny muted' }, 'Alphapedia · ', relTime(r.reported_at), ' · ', t('community.no_phenomenon_timer'))) : null);
    } catch { /* The local reference remains available. */ }
  }
  refresh();
  return { section, refresh };
}

async function referencePanel(panel, compact, open, saved) {
  try {
    const { entries } = await get(ROOT + '/reference');
    if (!panel.isConnected) return;
    const results = h('div', { class: 'phenomenon-grid' });
    const search = h('input', { class: 'input grow', type: 'search', 'aria-label': t('community.search_location'),
      placeholder: t('community.search_location') });
    const type = h('select', { class: 'input', 'aria-label': t('community.choose_phenomenon') },
      h('option', { value: '' }, t('phenomena.all_types')),
      TYPES.map(value => h('option', { value }, phenomenonType(value))));
    const communityEntries = h('input', { type: 'checkbox' });
    const draw = () => {
      const query = searchText(search.value);
      const matches = entries.filter(({ area, type: kind, spot, evidence, landmark, aliases }) =>
        (evidence !== 'community' || communityEntries.checked || query || type.value) &&
        (!type.value || type.value === kind) &&
        [...locationSearchTerms(area.name), area.name.includes('Wellspring Cave') && '地下水脉',
          ...Object.values(landmark || {}), ...(aliases || []), spot && spotLabel(spot),
          evidence === 'callout' && (kind === 'grass' ? '三草' : '11水')]
          .some(value => value && searchText(value).includes(query)));
      mount(results, matches.length ? matches.map(({ area, type: kind, spot, species, evidence, landmark, encounters, moves, visibility, conflict }) => {
        const here = location(area.name);
        const example = species && t(kind === 'dust' ? 'ui.phenomena_example_dust' : 'ui.phenomena_example_water',
          { pokemon: speciesLabel(species), location: here });
        const reportHere = async () => {
          const report = await reportPhenomenon({ region: area.region, locationId: area.id, type: kind, spot });
          if (report) saved(report);
        };
        return h('article', { class: 'card stack tight phenomenon-card' },
          h('strong', null, here),
          kind ? h('div', { class: 'small' }, phenomenonType(kind)) : null,
          h('div', { class: 'small muted' }, t('phenomena.reference.' + evidence)),
          example ? h('div', { class: 'small' }, example) : null,
          landmark ? h('div', { class: 'small' }, landmark[lang()] || landmark.en) : null,
          encounters?.length ? h('div', { class: 'small' }, t('phenomena.reported_species',
            { names: encounters.map(id => speciesLabel(id)).join(', ') })) : null,
          moves?.length ? h('div', { class: 'small' }, moves.map(move => t('phenomena.move.' + move)).join(' · ')) : null,
          visibility ? h('div', { class: 'small muted' }, t('phenomena.visual_bug')) : null,
          conflict ? h('div', { class: 'small muted' }, t('phenomena.category_conflict')) : null,
          spot ? h('div', { class: 'small' }, spotLabel(spot), ' · ',
            t(kind === 'grass' ? 'ui.phenomena_grass_requirements' : 'ui.phenomena_shadow_requirements')) : null,
          h('div', { class: 'row wrap' },
            area.id ? h('button', { class: 'btn ghost small', onclick: () => open(locationRoute(area.id)) },
              t('phenomena.open_location')) : null,
            area.id && kind && communityEnabled() ? h('button', { class: 'btn ghost small', onclick: reportHere },
              t('phenomena.report_here')) : null));
      }) : h('div', { class: 'small muted' }, t('phenomena.no_matches')));
    };
    search.addEventListener('input', draw);
    type.addEventListener('change', draw);
    communityEntries.addEventListener('change', draw);
    const controls = h('div', { class: 'row wrap' }, search, type,
      h('label', { class: 'row small' }, communityEntries, t('phenomena.show_community')));
    mount(panel, compact
      ? h('details', { open: true, class: 'stack tight' }, h('summary', null, t('ui.reference_encounter')), controls, results)
      : [h('h3', { class: 'section-title' }, t('ui.reference_encounter')), controls, results]);
    draw();
  } catch (e) { if (panel.isConnected) mount(panel, notice('bad', e.message)); }
}

function timing(observed, received) {
  return h('div', { class: 'small muted' },
    t('community.observed'), ' ', fmtDate(observed, true), ' · ', relTime(observed), ' · ',
    t('ui.received'), ' ', fmtDate(received, true));
}

function relayCard(r, observations, drawObservation, open) {
  const match = r.location_match;
  const region = r.resolved_region && gameTerm('region', cap(r.resolved_region));
  const where = match.status === 'verified' ? location(match.name) : r.location;
  return h('article', { class: 'card stack tight', dataset: { relay: r.message_id } },
    h('strong', null, [r.phenomenon_type ? phenomenonType(r.phenomenon_type) : r.type, region, where].filter(Boolean).join(' · ') ||
      t('ui.phenomena')),
    h('div', { class: 'small muted' }, 'Alphapedia · ', t('phenomena.relay'),
      r.caught_up ? ' · ' + t('phenomena.replay') : ''),
    timing(r.reported_at, r.received_at),
    h('div', { class: 'small muted' }, r.spot_id ? spotLabel(r.spot_id) :
      t(match.status === 'ambiguous' ? 'ui.live_location_ambiguous' :
        match.status === 'verified' ? 'phenomena.area_only' : 'ui.live_location_unverified')),
    ...[r.description, r.notes, r.required_hms].filter(Boolean).map(value => h('div', { class: 'small' }, value)),
    h('div', { class: 'tiny muted' }, t('community.no_phenomenon_timer')),
    h('div', { class: 'row wrap' },
      r.source_url ? extLink(r.source_url, t('phenomena.original_report')) : null,
      match.id ? h('button', { class: 'btn ghost small', onclick: () => open(locationRoute(match.id)) },
        t('phenomena.open_location')) : null),
    observations.length ? h('details', { class: 'stack tight' },
      h('summary', null, t('phenomena.linked')), observations.map(drawObservation)) : null);
}

async function refreshReports(view, selectedId, compact, open, saved) {
  const { sourceBox, reportsBox } = view;
  const revision = ++view.revision;
  const relayId = /^\d{17,20}$/.test(selectedId || '') ? selectedId : null;
  try {
    const [data, selected] = await Promise.all([
      get(ROOT + (relayId ? '?id=' + encodeURIComponent(relayId) : '')),
      selectedId && !relayId ? get('/api/live/reports/' + encodeURIComponent(selectedId)).catch(() => null) : null,
    ]);
    if (revision !== view.revision || !reportsBox.isConnected) return;
    const { source, links } = data;
    mount(sourceBox, h('strong', null, t('phenomena.relay')),
      h('div', { class: 'small muted' }, t('phenomena.status.' + source.status),
        source.last_success_at ? ' · ' + t('phenomena.last_refresh', { at: fmtDate(source.last_success_at, true) }) : ''),
      h('div', { class: 'small muted' }, t('phenomena.coverage')));
    const drawObservation = r => h('article', { class: 'card stack tight', dataset: { observation: r.id } },
      h('strong', null, phenomenonType(r.community.phenomenon_type)), communityEvidence(r),
      h('div', { class: 'small' }, gameTerm('region', cap(r.region)), ' · ',
        r.community.location_id ? location(r.location) : r.location
          ? r.location + ' · ' + t('ui.live_location_unverified') : t('community.location_unknown')),
      h('div', { class: 'small muted' }, r.community.spot_id ? spotLabel(r.community.spot_id) :
        r.community.location_id ? t('phenomena.area_only') : null),
      timing(r.source_time, r.received_at),
      r.body ? h('div', { class: 'small' }, r.body) : null,
      h('div', { class: 'tiny muted' }, t('community.no_phenomenon_timer')),
      localFeedback(r), communityActions(r, { compact, onSaved: saved }), communityHistory(r),
      r.id !== selectedId ? h('button', { class: 'btn ghost small', onclick: () => open(communitySavedRoute(r)) },
        t('community.view_report')) : null);
    const reports = new Map(data.observations.map(r => [r.id, r]));
    if (selected?.kind === 'phenomena' && selected.community) reports.set(selected.id, selected);
    const visibleRelay = new Map((compact ? data.recent.slice(0, 1) : data.recent).map(r => [r.message_id, r]));
    if (data.selected) visibleRelay.set(data.selected.message_id, data.selected);
    const older = data.history.filter(r => !visibleRelay.has(r.message_id));
    const renderRelay = r => relayCard(r, (links[r.message_id] || []).filter(id => id !== selected?.id).map(id => reports.get(id)).filter(Boolean),
      drawObservation, open);
    const linked = new Set(Object.values(links).flat());
    const standalone = [...reports.values()].filter(r => !linked.has(r.id) && r.id !== selected?.id);
    const shown = compact ? standalone.slice(0, 1) : standalone;
    mount(reportsBox, h('h2', { class: 'section-title' }, t('community.phenomena_history')),
      h('p', { class: 'small muted' }, t('phenomena.uncertainty')),
      selected?.community && selected.kind === 'phenomena' ? drawObservation(selected) : null,
      ...[...visibleRelay.values()].map(renderRelay), ...shown.map(drawObservation),
      older.length ? h('details', { class: 'stack tight' }, h('summary', null, t('phenomena.relay_history')),
        older.map(renderRelay)) : null,
      !reports.size && !data.history.length ? h('div', { class: 'small muted' }, t('community.no_phenomena')) : null);
  } catch (e) { if (revision === view.revision && reportsBox.isConnected) mount(reportsBox, notice('bad', e.message)); }
}

export function renderPhenomena(el, { variant = 'workspace', selectedId = null, open = go } = {}) {
  const compact = variant === 'compact';
  const saved = (report) => { if (variant === 'workspace' || report.kind !== 'phenomena') open(communitySavedRoute(report)); };
  const key = [variant, lang(), selectedId, communityEnabled()].join(':');
  let view = views.get(el);
  if (!view || view.key !== key || !el.contains(view.reportsBox)) {
    view = { key, revision: 0, reportsBox: h('section', { class: 'stack tight' }),
      sourceBox: h('section', { class: 'card stack tight' }) };
    views.set(el, view);
    const reference = h('section', { class: 'stack tight' });
    mount(el, h('div', { class: 'stack' },
      communityBar('phenomena', saved), view.sourceBox, view.reportsBox,
      h('section', { class: 'card stack tight' }, h('h2', { class: 'section-title' }, t('ui.phenomena_unova')),
        h('p', { class: 'small muted' }, t('ui.phenomena_intro')), callouts()),
      reference,
      h('div', { class: 'row wrap small' }, extLink(state.boot.alphapedia.phenomena, t('ui.provider_pheno_list')),
        extLink(LOCATION_GUIDE, t('ui.reference_locations')))));
    referencePanel(reference, compact, open, saved);
  }
  return refreshReports(view, selectedId, compact, open, saved);
}
