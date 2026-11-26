import { gameTerm, speciesLabel } from '../game-locale.js';
import { t as translateUI } from '../i18n.js';
import { h, mount, state, setting, extLink, get, fmtDate, notice, cap } from '../core.js';
import { go } from '../shell.js';
import { communityActions, communityBar, communityEnabled, communityEvidence, communityHistory,
  communitySavedRoute, localFeedback, phenomenonType } from './community.js';

const LOCATION_GUIDE = 'https://forums.pokemmo.com/index.php?/topic/77087-phenomenon-locations-guide/';

// Selected Unova examples from Alphapedia and the owner's verified callouts.
const location = (name) => gameTerm('location', name);
const encounters = () => [
  ['ui.grass_rustling', 'ui.phenomena_example_grass', { pokemon: speciesLabel(587, 'Emolga'), first: location('Village Bridge'), second: location('Route 11') }, 'ui.phenomena_grass_requirements'],
  ['ui.water_rippling', 'ui.phenomena_example_water', { pokemon: speciesLabel(594, 'Alomomola'), location: location('Route 4') }],
  ['ui.dust_cloud', 'ui.phenomena_example_dust', { pokemon: speciesLabel(530, 'Excadrill'), location: location('Victory Road') }],
  ['ui.shadow_moving', 'ui.phenomena_example_shadow', { location: location('Route 1') }, 'ui.phenomena_shadow_requirements'],
];

function callouts(showDiscord = true) {
  const discord = showDiscord && state.boot.community?.discord;
  return h('div', { class: 'stack tight' },
    discord ? h('div', { class: 'small' }, translateUI('ui.phenomena_discord', { channel: '#phenomenon-callouts' })) : null,
    h('div', { class: 'row wrap small' }, extLink(state.boot.alphapedia.website, 'Alphapedia'),
      discord ? extLink(discord, 'PokeMMO Companion Discord') : null));
}

export function homePhenomena() {
  return h('section', { class: 'stack tight home-phenomena' },
    h('div', { class: 'row wrap' }, h('strong', { class: 'grow' }, translateUI('ui.phenomena')),
      h('button', { class: 'btn ghost small', onclick: () => go('#/live/phenomena') }, translateUI('ui.reference_encounter'))),
    callouts(setting('home.community_link') !== false));
}

export async function renderPhenomena(el, { variant = 'workspace', selectedId = null, open = go } = {}) {
  const compact = variant === 'compact';
  const local = h('section', { class: 'stack tight' });
  const saved = (report) => { if (variant === 'workspace' || report.kind !== 'phenomena') open(communitySavedRoute(report)); };
  mount(el, h('div', { class: 'stack' },
    communityBar('phenomena', saved), local,
    h('section', { class: 'card stack tight' }, h('h2', { class: 'section-title' }, translateUI('ui.phenomena_unova')),
      h('p', { class: 'small muted', style: { margin: 0 } },
        translateUI('ui.phenomena_intro')),
      callouts()),
    h('section', { class: 'stack tight' }, h('h3', { class: 'section-title' }, translateUI('ui.encounter_examples')),
      h('div', { class: 'phenomenon-grid' }, encounters().map(([type, example, vars, access]) =>
        h('article', { class: 'card stack tight phenomenon-card' },
          h('strong', null, translateUI(type)), h('div', { class: 'small' }, translateUI(example, vars)),
          access ? h('div', { class: 'small muted' }, translateUI(access)) : null)))),
    compact ? null : h('div', { class: 'row wrap small' },
      extLink(state.boot.alphapedia.phenomena, translateUI('ui.provider_pheno_list')),
      extLink(LOCATION_GUIDE, translateUI('ui.reference_locations')))));
  try {
    const { reports } = await get('/api/live/community/phenomena');
    const selected = selectedId ? await get('/api/live/reports/' + encodeURIComponent(selectedId)) : null;
    if (!local.isConnected || !reports.length && !communityEnabled()) return;
    const visible = compact ? reports.slice(0, 1) : reports;
    if (selected?.kind === 'phenomena' && selected.community) {
      const index = visible.findIndex(r => r.id === selected.id);
      if (index < 0) visible.unshift(selected);
      else visible[index] = selected;
    }
    mount(local, h('h2', { class: 'section-title' }, translateUI('community.phenomena_history')),
      visible.length ? visible.map(r => h('article', { class: 'card stack tight', dataset: { observation: r.id } },
        h('strong', null, phenomenonType(r.community.phenomenon_type)), communityEvidence(r),
        h('div', { class: 'small' }, gameTerm('region', cap(r.region)), ' · ',
          r.community.location_id ? location(r.location) : r.location
            ? r.location + ' · ' + translateUI('ui.live_location_unverified') : translateUI('community.location_unknown')),
        h('div', { class: 'small muted' }, translateUI('community.observed'), ' ', fmtDate(r.source_time, true), ' · ',
          translateUI('ui.received'), ' ', fmtDate(r.received_at, true)),
        r.body ? h('div', { class: 'small' }, r.body) : null,
        h('div', { class: 'tiny muted' }, translateUI('community.no_phenomenon_timer')),
        localFeedback(r), communityActions(r, { compact, onSaved: saved }), communityHistory(r),
        r.id !== selectedId ? h('button', { class: 'btn ghost small', onclick: () => open(communitySavedRoute(r)) },
          translateUI('community.view_report')) : null))
        : h('div', { class: 'small muted' }, translateUI('community.no_phenomena')));
  } catch (e) { if (local.isConnected) mount(local, notice('bad', e.message)); }
}
