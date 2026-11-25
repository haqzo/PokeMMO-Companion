import { gameTerm, speciesLabel } from '../game-locale.js';
import { t as translateUI } from '../i18n.js';
import { h, mount, state, setting, extLink } from '../core.js';
import { go } from '../shell.js';

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

export function renderPhenomena(el, { variant = 'workspace' } = {}) {
  const compact = variant === 'compact';
  mount(el, h('div', { class: 'stack' },
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
}
