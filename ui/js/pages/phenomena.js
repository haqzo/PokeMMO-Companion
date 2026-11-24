import { h, mount, state, setting, extLink } from '../core.js';
import { go } from '../shell.js';

const LOCATION_GUIDE = 'https://forums.pokemmo.com/index.php?/topic/77087-phenomenon-locations-guide/';

// Selected Unova examples from Alphapedia and the owner's verified callouts.
const ENCOUNTERS = [
  { type: 'Rustling grass', example: 'Emolga at Village Bridge or Route 11.', access: 'The documented Village Bridge spot requires no HMs.' },
  { type: 'Rippling water', example: 'Alomomola on Route 4.' },
  { type: 'Dust cloud', example: 'Excadrill in Victory Road.' },
  { type: 'Moving shadow', example: 'A documented spot on Route 1.', access: 'Surf is required to reach that spot.' },
];

function callouts(showDiscord = true) {
  const discord = showDiscord && state.boot.community?.discord;
  return h('div', { class: 'stack tight' },
    discord ? h('div', { class: 'small' }, 'Find current Phenomenon callouts and location pictures in ', h('strong', null, '#phenomenon-callouts'), ' on our Discord.') : null,
    h('div', { class: 'row wrap small' }, extLink(state.boot.alphapedia.website, 'Alphapedia'),
      discord ? extLink(discord, 'PokeMMO Companion Discord') : null));
}

export function homePhenomena() {
  return h('section', { class: 'stack tight home-phenomena' },
    h('div', { class: 'row wrap' }, h('strong', { class: 'grow' }, 'Phenomena'),
      h('button', { class: 'btn ghost small', onclick: () => go('#/live/phenomena') }, 'Encounter reference')),
    callouts(setting('home.community_link') !== false));
}

export function renderPhenomena(el, { variant = 'workspace' } = {}) {
  const compact = variant === 'compact';
  mount(el, h('div', { class: 'stack' },
    h('section', { class: 'card stack tight' }, h('h2', { class: 'section-title' }, 'Unova Phenomena'),
      h('p', { class: 'small muted', style: { margin: 0 } },
        'Phenomena are special wild encounters. Look for the movement on the map and listen for its sound. Access requirements depend on the exact spot.'),
      callouts()),
    h('section', { class: 'stack tight' }, h('h3', { class: 'section-title' }, 'Encounter examples'),
      h('div', { class: 'phenomenon-grid' }, ENCOUNTERS.map((encounter) =>
        h('article', { class: 'card stack tight phenomenon-card' },
          h('strong', null, encounter.type), h('div', { class: 'small' }, encounter.example),
          encounter.access ? h('div', { class: 'small muted' }, encounter.access) : null)))),
    compact ? null : h('div', { class: 'row wrap small' },
      extLink(state.boot.alphapedia.phenomena, 'Alphapedia Pheno List'),
      extLink(LOCATION_GUIDE, 'Phenomenon Locations Guide'))));
}
