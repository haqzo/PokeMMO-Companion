import { locale, number, uiLabel } from '../i18n.js';
import { plural, t as translateUI } from '../i18n.js';
import { gameTerm, speciesLabel } from '../game-locale.js';
// Home + in-app official news / changelog / event reader (docs/design/03).
import { h, mount, icon, get, post, apiErrorText, badge, notice, relTime, fmtDate, extLink, setting, saveSettings, state, on, cap, typeChips, toast, spriteOrFallback, sizedSprite, fitSprite, seg, pad3, sourceInfo, sourceText } from '../core.js';
import { go, qaInfo, openPopout } from '../shell.js';
import { createRun } from './guides.js';
import { LANGS, lang } from '../i18n.js';
import { walkthroughReader } from '../walkthrough-loader.js';
import { animatedIn, scaled } from '../sprites.js';
import { loadList } from './pokedex.js';
import { currentCard, startTimers, likelyActive } from './live.js';
import { homePhenomena } from './phenomena.js';

// The snapshot summaries are authored by Companion. Exact source matching prevents stale translations when a news item is revised.
const SNAPSHOT_KEYS = new Map([
  [
    "Independently written summaries of official PokeMMO posts. Full forum posts are not reproduced. 'provenance' says how each summary was checked: 'official-direct' = read from the official post, 'official-via-research' = official URL recorded in the project's Phase 3 research (docs/research/phase-3), 'secondary-crosscheck' = official URL plus details confirmed through an independent community news site (PikaMMO). The official forum blocked automated access during this build, so no item is marked official-direct.",
    "newsui.snapshot_000"
  ],
  [
    "Changelog — November 19th, 2026",
    "newsui.snapshot_001"
  ],
  [
    "Latest stable patch found as of this snapshot. HM Defog can now be found as a field item in four more regions, newly created GTL listings start private to the seller as Pending with a countdown, and a batch of Android, UI-scaling, audio and battle fixes landed.",
    "newsui.snapshot_002"
  ],
  [
    "Items & exploration",
    "newsui.snapshot_003"
  ],
  [
    "HM Defog is now a field item in Kanto (Lavender Town's tower, 1F), Hoenn (Rusturf Tunnel), Johto (Route 28) and Unova (Celestial Tower rooftop). Sinnoh already had its own Defog acquisition.",
    "newsui.snapshot_004"
  ],
  [
    "GTL",
    "newsui.snapshot_005"
  ],
  [
    "New listings are first visible only to the seller and marked Pending with a countdown; the seller can cancel or reprice during that window.",
    "newsui.snapshot_006"
  ],
  [
    "Client & fixes",
    "newsui.snapshot_007"
  ],
  [
    "Android, UI scaling, import, audio and battle fixes.",
    "newsui.snapshot_008"
  ],
  [
    "Theming support for the new HUD has not been released yet, so custom themes cannot restyle those widgets.",
    "newsui.snapshot_009"
  ],
  [
    "Guides: the bundled milestone outline lists the four new Defog pickups as optional steps (placement in the route order still needs in-game verification).",
    "newsui.snapshot_010"
  ],
  [
    "Your imported walkthroughs for Kanto, Hoenn, Johto and Unova contain no Defog mention (Phase 3 research, file 10).",
    "newsui.snapshot_011"
  ],
  [
    "Changelog — November 13th, 2026",
    "newsui.snapshot_012"
  ],
  [
    "Audio and controls patch: a new GBA audio quality option, battle and DS sounds closer to the originals, safer key-binding conflict handling, a Dowsing MCHN fix and restored GTL over-valuation flags.",
    "newsui.snapshot_013"
  ],
  [
    "Audio",
    "newsui.snapshot_014"
  ],
  [
    "New GBA Audio Quality option: Auto, Fast, High, Ultra. Fast keeps the older sound and suits low-end machines.",
    "newsui.snapshot_015"
  ],
  [
    "Battle sound effects and DS audio are closer to the original games; ledge hops get their own sound.",
    "newsui.snapshot_016"
  ],
  [
    "Controls",
    "newsui.snapshot_017"
  ],
  [
    "If two actions share one button, both are reset at launch with a message naming the conflict.",
    "newsui.snapshot_018"
  ],
  [
    "Every action, including the GTL, can now be bound.",
    "newsui.snapshot_019"
  ],
  [
    "Fixes",
    "newsui.snapshot_020"
  ],
  [
    "Dowsing MCHN no longer points at hidden items on a neighbouring map.",
    "newsui.snapshot_021"
  ],
  [
    "Grouped GTL listings priced above an item's valuation are flagged again.",
    "newsui.snapshot_022"
  ],
  [
    "No Companion data changes required.",
    "newsui.snapshot_023"
  ],
  [
    "Mysterious Balls will not count towards scores in future Shiny Wars",
    "newsui.snapshot_024"
  ],
  [
    "The events team announced that shinies obtained from Mysterious Balls (for example the Halloween Mysterious Dusk Balls) will not earn team points in future Shiny Wars, to discourage stockpiling them. No specific edition or date is named; other rules may change with each edition's announcement.",
    "newsui.snapshot_025"
  ],
  [
    "Informational only.",
    "newsui.snapshot_026"
  ],
  [
    "Changelog — November 5th, 2026",
    "newsui.snapshot_027"
  ],
  [
    "Quality-of-life patch: money is shown on the HUD under the clock, the mobile battle interface was reworked, weather haze returned for sandstorm and hail, and two notable bugs were fixed.",
    "newsui.snapshot_028"
  ],
  [
    "Interface",
    "newsui.snapshot_029"
  ],
  [
    "Money now appears on the HUD beneath the clock.",
    "newsui.snapshot_030"
  ],
  [
    "'Search in GTL' from a costumed Pokémon enables the costume filter automatically.",
    "newsui.snapshot_031"
  ],
  [
    "Mobile battle interface reworked (mainly for PvP). Emoji limited to team and link chat.",
    "newsui.snapshot_032"
  ],
  [
    "Balance & visuals",
    "newsui.snapshot_033"
  ],
  [
    "Reaper's Wrath (Pumpking's signature move) gains +1 priority.",
    "newsui.snapshot_034"
  ],
  [
    "Painted Skull can be recoloured without a dye.",
    "newsui.snapshot_035"
  ],
  [
    "Sandstorm and hail visual haze shows again.",
    "newsui.snapshot_036"
  ],
  [
    "Fainting no longer sends Sinnoh/Johto players to Pallet Town instead of their healing spot.",
    "newsui.snapshot_037"
  ],
  [
    "Battles no longer freeze when a Pokémon has no usable moves left.",
    "newsui.snapshot_038"
  ],
  [
    "Changelog — 30/10/2026 (weather, new HUD, balance)",
    "newsui.snapshot_039"
  ],
  [
    "Large update: dynamic regional weather, a fully redesigned HUD (including the game's own Encounter Tracker), GTL search for breeding partners, Hail and Snowscape split again, Lickitung's catch rate raised, and some Altering Cave species temporarily removed.",
    "newsui.snapshot_040"
  ],
  [
    "Weather",
    "newsui.snapshot_041"
  ],
  [
    "Weather now varies across all five regions with seasonal, region-specific climates and gradual transitions; some areas have local weather (lake mist, Unova fog, Desert Resort sandstorms).",
    "newsui.snapshot_042"
  ],
  [
    "Current weather is shown next to the clock and season.",
    "newsui.snapshot_043"
  ],
  [
    "HUD fully redesigned (party, hotbar, Encounter Tracker, active effects, Esc menu); gamepad, HUD and chat positions were reset.",
    "newsui.snapshot_044"
  ],
  [
    "GTL: right-click 'Search in GTL' finds compatible breeding partners; advanced search can filter by costume.",
    "newsui.snapshot_045"
  ],
  [
    "Dowsing MCHN shows a radar of nearby hidden items; mailbox lets you choose what to claim.",
    "newsui.snapshot_046"
  ],
  [
    "Balance",
    "newsui.snapshot_047"
  ],
  [
    "Hail and Snowscape are separate moves again: Hail damages non-Ice Pokémon each turn, Snowscape summons snow. TM07 teaches Hail; a Snowscape TM is sold where TM07 is.",
    "newsui.snapshot_048"
  ],
  [
    "Abomasnow and Snover can have a second, hail-summoning ability. Snow Cloak lowers encounter rate in every kind of snow.",
    "newsui.snapshot_049"
  ],
  [
    "Lickitung's catch rate rises from 45 to 75.",
    "newsui.snapshot_050"
  ],
  [
    "Altering Cave: some species temporarily removed for rebalancing.",
    "newsui.snapshot_051"
  ],
  [
    "EV-lowering berries can raise happiness when that EV is already 0.",
    "newsui.snapshot_052"
  ],
  [
    "Other",
    "newsui.snapshot_053"
  ],
  [
    "Costumed Pokémon breed normally (fix). Black/White gym leaders and Elite Four speak in battle.",
    "newsui.snapshot_054"
  ],
  [
    "Name Change Contract; battle music toggle; Android client is now native; iOS needs 15+.",
    "newsui.snapshot_055"
  ],
  [
    "Companion never adds an encounter counter — the game now has its own.",
    "newsui.snapshot_056"
  ],
  [
    "Pokédex: imported dump shows Lickitung catch rate 75 (matches this patch). Snowscape learnset entries lack move metadata in the dump and are shown as 'details awaiting verification'.",
    "newsui.snapshot_057"
  ],
  [
    "Live › Altering Cave: older community species pools are treated as stale.",
    "newsui.snapshot_058"
  ],
  [
    "Black 2 / White 2 expansion — in development (Public Test Server)",
    "newsui.snapshot_059"
  ],
  [
    "The PokeMMO team confirmed a Black 2 / White 2 expansion in development. A 48-hour public preview ran on a separate test server (19–21 September, progress not saved) and a second PTS release followed on 27 October. No release date has been announced. PTS content is NOT part of the live game and is never mixed into Companion availability data.",
    "newsui.snapshot_060"
  ],
  [
    "PTS data is kept separate; nothing from the test client is treated as live.",
    "newsui.snapshot_061"
  ],
  [
    "Shiny Wars 2026 follow-up fixes (31 July)",
    "newsui.snapshot_062"
  ],
  [
    "Follow-up to the 29 July update: Zorua's wild encounter was restored and minor encounter-table corrections were made, so 29 July data alone is not sufficient.",
    "newsui.snapshot_063"
  ],
  [
    "Pokédex: Zorua (Lostlorn Forest) appears in the dump with rate '???', shown as Unknown rate — never 0% or 100%.",
    "newsui.snapshot_064"
  ],
  [
    "Changelog — Shiny Wars 2026 (29 July)",
    "newsui.snapshot_065"
  ],
  [
    "One of the largest updates in years: every encounter table in all five regions was rebuilt, the in-game Wild Locations Dex now shows exact percentages by time and season, Altering Cave began rotating daily, costumes were introduced and the desktop client became a native application.",
    "newsui.snapshot_066"
  ],
  [
    "Encounters",
    "newsui.snapshot_067"
  ],
  [
    "Encounter tables rebalanced in Kanto, Johto, Hoenn, Sinnoh and Unova; seasons now drive encounters in all regions.",
    "newsui.snapshot_068"
  ],
  [
    "Sweet Scent-exclusive hordes added in many areas; Trophy Garden and Great Marsh get semi-random daily spawns; Johto Safari Zone randomisation improved; wild encounters on Sky Pillar 2F/4F.",
    "newsui.snapshot_069"
  ],
  [
    "Altering Cave inhabitants and Pickup rewards rotate every in-game day.",
    "newsui.snapshot_070"
  ],
  [
    "Features",
    "newsui.snapshot_071"
  ],
  [
    "Costumed Pokémon introduced (cosmetic; inherited through breeding).",
    "newsui.snapshot_072"
  ],
  [
    "Gym puzzles can be skipped; the desktop client no longer needs Java.",
    "newsui.snapshot_073"
  ],
  [
    "Temporary (ended)",
    "newsui.snapshot_074"
  ],
  [
    "The +10% wild shiny bonus and 7-day season rotation applied only during the Shiny Wars event and are not current.",
    "newsui.snapshot_075"
  ],
  [
    "Pokédex locations come from your imported dump; its extraction date is unknown, so rates are labelled DUMP_ONLY until checked in game.",
    "newsui.snapshot_076"
  ],
  [
    "Live › Altering Cave never derives the current rotation from the dump (it holds only two static Unown rows).",
    "newsui.snapshot_077"
  ],
  [
    "Halloween 2026",
    "newsui.snapshot_078"
  ],
  [
    "End time 23:59 UTC as recorded in project research; start time not stated.",
    "newsui.snapshot_079"
  ],
  [
    "Seasonal world event: costumed kids and Spirits of Halloween gave candy to challenge Pumpking (including Hard Mode) near five towns, swarms were more frequent, Wisps unlocked seasonal alphas, and seven Halloween raids led to Newmoon Island. Leftover candy could be redeemed until 16 November.",
    "newsui.snapshot_080"
  ],
  [
    "Participation",
    "newsui.snapshot_081"
  ],
  [
    "Defeat costumed kids/Spirits of Halloween for candy; challenge Pumpking near Lavender Town, Fallarbor Town, Solaceon Town, Driftveil City and Ecruteak City.",
    "newsui.snapshot_082"
  ],
  [
    "Rewards",
    "newsui.snapshot_083"
  ],
  [
    "Goodie Bags (2026 cosmetics), exclusive bags and particle effect for Hard Mode, costumed Pokémon chance in swarms, Pumpcat cosmetic.",
    "newsui.snapshot_084"
  ],
  [
    "Permanence",
    "newsui.snapshot_085"
  ],
  [
    "Event spawns, boosts and raids are historical. The Reaper's Wrath balance change (5 Nov) is a normal patch item.",
    "newsui.snapshot_086"
  ],
  [
    "Black 2 / White 2 public preview weekend (PTS)",
    "newsui.snapshot_087"
  ],
  [
    "Times not recorded.",
    "newsui.snapshot_088"
  ],
  [
    "48-hour preview on a separate test server to test storyline balance; progress was not saved. Test-server only — not live content.",
    "newsui.snapshot_089"
  ],
  [
    "Server",
    "newsui.snapshot_090"
  ],
  [
    "Public Test Server (separate from live)",
    "newsui.snapshot_091"
  ],
  [
    "Shiny Wars 2026",
    "newsui.snapshot_092"
  ],
  [
    "Times announced in UTC.",
    "newsui.snapshot_093"
  ],
  [
    "Third annual team shiny-hunting competition: teams of 25–30 players scored points for wild shinies caught during the month. Registration ran 23–29 July. Costume prizes introduced this year remain in the game as a permanent feature.",
    "newsui.snapshot_094"
  ],
  [
    "Format",
    "newsui.snapshot_095"
  ],
  [
    "Team competition, 25–30 players per team",
    "newsui.snapshot_096"
  ],
  [
    "Registration",
    "newsui.snapshot_097"
  ],
  [
    "23–29 July 2026 (official forum thread)",
    "newsui.snapshot_098"
  ],
  [
    "Temporary bonuses",
    "newsui.snapshot_099"
  ],
  [
    "+10% wild shiny bonus during the event only (ended)",
    "newsui.snapshot_100"
  ]
]);
export function newsText(value) {
  return SNAPSHOT_KEYS.has(value) ? translateUI(SNAPSHOT_KEYS.get(value)) : value;
}

let unsub = [];
let newsCache = null;
const KIND_LABEL = { changelog: 'ui.news_kind_changelog', hotfix: 'ui.news_kind_hotfix', announcement: 'ui.news_kind_announcement', event: 'ui.news_kind_event' };
const kindLabel = (kind) => KIND_LABEL[kind] ? translateUI(KIND_LABEL[kind]) : (kind || translateUI('ui.news_kind_post'));

export function dispose() { unsub.forEach((u) => u()); unsub = []; }

export async function render(el, route) {
  dispose();
  if (route.page === 'news' && route.parts[0]) return renderArticle(el, route.parts[0]);
  if (route.page === 'news') return renderNewsList(el, route);
  if (route.page === 'events' && route.parts[0]) return renderEvent(el, route.parts[0]);
  if (route.page === 'events') return renderNewsList(el, route, 'events');
  return renderHome(el);
}

async function news() { newsCache = await get('/api/news'); return newsCache; }

function provenanceLine(item) {
  return h('div', { class: 'row wrap small muted' }, sourceInfo(item.provenance),
    item.channel === 'pts' ? h('span', { class: 'badge bad' }, translateUI('ui.b272_pts')) : null,
    h('span', null, translateUI('ui.news_published', { date: fmtDate(item.published) })), item.updated ? h('span', null, translateUI('ui.news_updated', { date: fmtDate(item.updated) })) : null);
}

// Home sections. Default: roamers, live, update, news, events, quick. The storyline run and favourites cards are
// opt-in (Settings › Appearance › Home sections). Lists saved by earlier builds are translated, never discarded:
// update → update + news, live → live + roamers, shortcuts → quick + run (Altering Cave is no longer on Home).
export const HOME_SECTIONS = [['roamers', 'Roaming Legendaries'], ['live', 'Alpha & Swarm'], ['update', 'Latest official update'], ['news', 'More official updates'],
  ['events', 'Official events'], ['quick', 'Quick access'], ['run', 'Storyline run'], ['favourites', 'Favourite Pokémon']];
export const HOME_DEFAULT = ['roamers', 'live', 'update', 'news', 'events', 'quick'];
export function homeSections(saved = setting('home.sections')) {
  if (!Array.isArray(saved)) return [...HOME_DEFAULT];
  const known = new Set(HOME_SECTIONS.map(([k]) => k));
  const legacy = saved.length > 0 && saved.every((k) => ['update', 'events', 'live', 'shortcuts'].includes(k)) &&
    (saved.includes('shortcuts') || !saved.some((k) => ['roamers', 'news', 'quick'].includes(k)));
  if (!legacy) return saved.filter((k) => known.has(k));
  const out = [];
  for (const k of saved) out.push(...({ update: ['update', 'news'], live: ['live', 'roamers'], shortcuts: ['quick', 'run'], events: ['events'] })[k] || []);
  return [...new Set(out)];
}

async function renderHome(el) {
  dispose();
  const page = h('div', { class: 'page home-page' });
  mount(el, page);
  const sections = homeSections();
  const on_ = (k) => sections.includes(k);
  const [n, cur, leg, runs, data, species] = await Promise.all([news(), get('/api/live/current'), get('/api/live/legendaries'),
    get('/api/guides/runs'), get('/api/data/status'), on_('favourites') ? loadList().catch(() => []) : Promise.resolve([])]);
  const active = cur.current.filter((g) => g.status.state === 'recent').length;
  const status = [
    !cur.source.enabled ? translateUI('ui.home_feed_off') : plural('ui.home_feed_active', active),
    translateUI('ui.home_roaming', { first: speciesLabel(leg.current.kanto.id, leg.current.kanto.name), second: speciesLabel(leg.current.johto.id, leg.current.johto.name) }),
    n.latest ? translateUI('ui.home_last_update', { date: fmtDate(n.latest.published) }) : null].filter(Boolean).join(' · ');
  page.append(h('div', { class: 'page-head home-head' }, h('div', null, h('h1', null, greeting()), h('div', { class: 'sub' }, status)),
    h('div', { class: 'actions' }, communityLink(), h('button', { class: 'btn ghost small', onclick: () => go('#/settings/home') }, icon('gear'), translateUI('ui.customize_home')))));
  if (!setting('app.onboarded')) page.append(getStarted(data, runs, () => renderHome(el)));
  else if (data.update_available) page.append(installBanner(data, () => renderHome(el), true));
  const grid = h('div', { class: 'home-v3' });
  page.append(grid);

  // Sections render in the order chosen in Settings › Home. Events and Quick access share one column where the
  // first of them sits. Wide windows pack sections into 12-column rows; the last card of a row takes up whatever
  // is left, so no row ends in an empty gap. Cards in one row are the same height.
  const build = {
    roamers: () => roamersCard(leg), live: () => liveCard(cur),
    update: async () => n.latest ? updateCard(n, () => { newsCache = null; renderHome(el); }) : null,
    side: () => h('div', { class: 'home-side stack' }, on_('events') ? eventsCard(n) : null, on_('quick') ? quickCard() : null),
    news: () => newsCard(n), run: () => continueCard(runs, () => renderHome(el)), favourites: () => favouritesCard(species),
  };
  const order = [...new Set(sections.map((k) => (k === 'events' || k === 'quick') ? 'side' : k))];
  const cards = [];
  for (const k of order) { const c = await build[k]?.(); if (c) { c.dataset.section = k; cards.push([k, c]); } }
  packRows(cards).forEach(([c, span]) => { c.style.setProperty('--span', span); grid.append(c); });

  unsub.push(on('news', () => { if (location.hash.startsWith('#/home')) { newsCache = null; renderHome(el); } }));
}

const HOME_SPAN = { roamers: 5, live: 7, update: 8, side: 4, news: 8, run: 6, favourites: 6 };
/** [[key, card]] → [[card, columns]]: rows of 12 columns in the chosen order. When the next card does not fit,
 *  a later card that does (e.g. the narrow Events/Quick column) moves up to fill the row; the last card of each
 *  row stretches to fill it, so a row never ends in an empty gap. */
export function packRows(cards, spans = HOME_SPAN) {
  const out = [], rest = cards.map(([k, c]) => [c, spans[k] || 12]);
  while (rest.length) {
    const row = [rest.shift()]; let used = row[0][1];
    for (let i = 0; i < rest.length && used < 12;) {
      if (used + rest[i][1] <= 12) { used += rest[i][1]; row.push(rest.splice(i, 1)[0]); } else i++;
    }
    row[row.length - 1] = [row[row.length - 1][0], row[row.length - 1][1] + 12 - used];
    out.push(...row);
  }
  return out;
}

/** Optional community link (Settings › Home can hide it). Nothing when no valid invite is configured. */
function communityLink() {
  const url = state.boot && state.boot.community && state.boot.community.discord;
  if (!url || setting('home.community_link') === false) return null;
  const a = extLink(url, translateUI('ui.home_community'));
  a.classList.add('btn', 'ghost', 'small', 'home-community');
  a.title = translateUI('ui.home_community_desc');
  return a;
}

function greeting() {
  const hr = new Date().getHours();
  return translateUI(hr < 5 ? 'ui.hello_night' : hr < 12 ? 'ui.hello_morning' : hr < 18 ? 'ui.hello_afternoon' : 'ui.hello_evening');
}

// ------------------------------------------------------------ roaming Legendaries
const motionOK = () => animatedIn('roamers');
/** Animated Gen V sprite from your sprite library (only these two on Home), else the still; large tier, never stretched. */
function roamerArt(m, size) {
  if (m.ani && motionOK()) {
    const img = h('img', { class: 'pixel', src: m.ani, alt: speciesLabel(m.id, m.name), decoding: 'async', style: { visibility: 'hidden' } });
    const box = h('div', { class: 'still-art roamer-art', style: { width: size + 'px', height: size + 'px' }, dataset: { tier: 'l' } }, img);
    img.addEventListener('load', () => {
      const f = fitSprite(img.naturalWidth, img.naturalHeight, null, 'l', size, size);
      Object.assign(img.style, { width: f.width + 'px', height: f.height + 'px', left: f.left + 'px', top: f.top + 'px', visibility: '' });
      box.classList.toggle('smooth', f.smooth);
    });
    img.addEventListener('error', () => box.replaceWith(sizedSprite(m, size, { still: m.still, url: m.icon, tier: 'l' })));
    return box;
  }
  return sizedSprite(m, size, { still: m.still, url: m.icon, tier: 'l' });
}
function roamersCard(leg) {
  const cur = leg.current, nxt = leg.next;
  const month = (mm, y) => new Date(y, mm - 1, 1).toLocaleString(locale(), { month: 'long' });
  const tile = (region, m) => h('button', { class: 'roamer', onclick: () => go('#/pokedex/' + m.id), title: translateUI('ui.home_open_dex', { species: speciesLabel(m.id, m.name) }) },
    roamerArt(m, scaled('roamers', 116)), h('div', { class: 'roamer-name' }, speciesLabel(m.id, m.name)), h('div', { class: 'tiny muted roamer-region' }, gameTerm('region', cap(region))), typeChips(m.types, true));
  return h('section', { class: 'card home-roamers half', 'aria-labelledby': 'roam-h' },
    h('div', { class: 'card-head' }, h('h2', { id: 'roam-h' }, translateUI('ui.roaming_legendaries')), h('span', { class: 'tiny muted' }, month(cur.month, cur.year)),
      h('div', { class: 'right' }, h('button', { class: 'btn ghost small', onclick: () => go('#/live/legendaries') }, translateUI('ui.calendar'), icon('chev')))),
    h('div', { class: 'roamer-row' }, tile('kanto', cur.kanto), tile('johto', cur.johto)),
    h('div', { class: 'tiny muted roamer-foot', title: uiLabel(leg.status_note) },
      nxt ? translateUI('ui.home_next_roam', { month: month(nxt.month, nxt.year), first: speciesLabel(nxt.kanto.id, nxt.kanto.name), second: speciesLabel(nxt.johto.id, nxt.johto.name) }) : '',
      sourceInfo('COMMUNITY-CYCLE', translateUI('ui.home_unchecked_roam')), extLink(leg.source_url, translateUI('ui.source'))));
}

// ------------------------------------------------------------ Alpha & Swarm
function liveCard(cur) {
  const box = h('div', { class: 'cur-grid home-cur' });
  const head = h('div', { class: 'row small home-feed' });
  const card = h('section', { class: 'card home-live half', 'aria-labelledby': 'live-h' },
    h('div', { class: 'card-head' }, h('h2', { id: 'live-h' }, translateUI('ui.alpha_swarm')), h('span', { class: 'tiny muted' }, translateUI('ui.home_report_recent')),
      h('div', { class: 'right' }, h('button', { class: 'btn ghost small', onclick: () => go('#/live/reports') }, translateUI('ui.history'), icon('chev')))), head, box, homePhenomena());
  let stop = null, expiry = null, sprites = new Map();
  const draw = (c) => {
    const src = c.source;
    const last = src.last_success_at ? translateUI('ui.home_feed_last', { age: relTime(src.last_success_at) }) : '';
    mount(head, h('span', { class: 'dot ' + (src.enabled ? src.status : '') }), h('span', { class: 'muted' },
      !src.enabled ? (c.current.length ? translateUI('ui.home_feed_cached') : translateUI('ui.home_feed_unknown')) : src.status === 'connected' ? translateUI('ui.home_feed_connected') + last
        : translateUI('ui.home_feed_degraded', { status: uiLabel(src.status), last })));
    const list = c.current.slice(0, 4);
    const skew = Date.parse(c.now) - Date.now();
    // Sprites are kept between refreshes (same report group, same animated/still state) so an animation never
    // restarts because the list or a countdown was refreshed.
    const keep = new Map();
    const cards = list.map((g) => {
      // Active reports and expired ones each follow their own Static/Animated preference (Settings › Pokémon & sprites).
      const anim = likelyActive(g, Date.now() + skew) ? animatedIn('report_active') : animatedIn('report_expired');
      const k = `${g.id}:${anim ? 'a' : 's'}`;
      const node = currentCard(g, { compact: true, animate: anim });
      const old = sprites.get(k);
      if (old) node.querySelector('.rep-sprite').replaceWith(old);
      keep.set(k, old || node.querySelector('.rep-sprite'));
      return node;
    });
    sprites = keep;
    clearTimeout(expiry);
    const ends = list.filter((g) => likelyActive(g, Date.now() + skew)).map((g) => Date.parse(g.status.ends_at) - (Date.now() + skew));
    if (ends.length) expiry = setTimeout(() => refresh(), Math.max(1000, Math.min(...ends) + 1000));   // switch to the still image when the estimate ends
    box.dataset.count = String(Math.min(list.length, 9));
    mount(box, list.length ? cards :
      h('div', { class: 'small muted', style: { gridColumn: '1/-1', padding: '6px 2px' } }, src.enabled ? translateUI('ui.home_feed_empty') : translateUI('ui.home_feed_connect')));
    if (stop) stop();
    stop = startTimers(box, Date.parse(c.now) - Date.now(), () => refresh());
  };
  const refresh = async () => { if (!card.isConnected || document.visibilityState === 'hidden') return; draw(await get('/api/live/current')); };
  draw(cur);
  const every = setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', refresh);
  unsub.push(() => { clearInterval(every); clearTimeout(expiry); document.removeEventListener('visibilitychange', refresh); if (stop) stop(); });
  unsub.push(on('live.report', refresh));
  return card;
}

// ------------------------------------------------------------ official updates
async function updateCard(n, rerender) {
  const L = n.latest;
  const full = L.discovered ? null : await get('/api/news/' + L.id).catch(() => null);
  const points = ((full && full.groups) || []).flatMap((g) => g.points).slice(0, 3);
  const f = n.feed;
  // One short status line; details (interval, summaries date, errors) live in the tooltip.
  const status = !f ? translateUI('ui.news_unknown_check') : f.ok ? translateUI('ui.news_checked', { age: relTime(f.last_ok_at || f.checked_at) }) : translateUI('ui.news_check_offline', { age: f.last_ok_at ? relTime(f.last_ok_at) : translateUI('ui.news_check_never') });
  const detail = [n.auto_check ? translateUI('ui.news_check_every', { hours: number(n.check_hours) }) : translateUI('ui.news_check_off'),
    f && !f.ok ? translateUI('ui.news_check_failure', { error: apiErrorText(f.error) }) : '', f && f.stale ? translateUI('ui.news_check_stale') : '',
    translateUI('ui.news_check_summary', { date: fmtDate(n.snapshot_checked_at) })].filter(Boolean).join(' ');
  return h('section', { class: 'card hero home-update', 'aria-labelledby': 'latest-h' },
    h('div', { class: 'hero-eyebrow' }, icon('book'), translateUI('ui.official_update'), h('span', { class: 'grow' }), provenanceLine(L)),
    h('h2', { class: 'headline', id: 'latest-h' }, L.discovered ? L.title : newsText(L.title)),
    L.has_summary === false || !L.summary ? h('p', { class: 'hero-summary muted' }, translateUI('ui.b272_news_no_summary'))
      : h('p', { class: 'hero-summary' }, newsText(L.summary)),
    points.length ? h('ul', { class: 'hero-points' }, points.map((p) => h('li', null, newsText(p)))) : null,
    L.edited_upstream ? h('div', { class: 'small', style: { color: 'var(--warn)' } }, translateUI('ui.b272_news_edited_warning')) : null,
    h('div', { class: 'row wrap' }, L.discovered ? extLink(L.source_url, translateUI('ui.news_open_official'))
      : h('button', { class: 'btn primary small', onclick: () => go('#/news/' + L.id) }, translateUI('ui.read_details')),
    h('button', { class: 'btn small', onclick: () => go('#/news') }, translateUI('ui.news_open_all'))),
    h('div', { class: 'update-foot row wrap tiny', title: detail }, h('span', { class: 'dot ' + (!f ? '' : f.ok && !f.stale ? 'connected' : 'offline') }), h('span', null, status),
      n.new_posts.length ? h('span', { class: 'muted' }, translateUI('ui.b272_news_unchecked_count', { count: number(n.new_posts.length) })) : null,
      h('span', { class: 'grow' }),
      h('button', { class: 'btn ghost small', title: detail, onclick: async (e) => { e.currentTarget.disabled = true; const r = await post('/api/news/check');
        toast(r.throttled ? translateUI('ui.b272_checked_recent') : r.ok ? translateUI(r.unchanged ? 'ui.b272_news_check_unchanged' : 'ui.b272_news_check_done') : translateUI('ui.b272_news_check_error', { error: apiErrorText(r.error) }), { kind: r.ok ? 'info' : 'warn', timeout: 6000 });
        rerender(); } }, icon('refresh'), translateUI('ui.news_check_now'))));
}

function newsCard(n) {
  // Home lists only posts PUBLISHED in the last 90 days (n.home, computed by the backend). A post the feed check
  // only just discovered can still be old news (e.g. last year's holiday event) — that stays in the archive.
  const hm = n.home || { posts: n.records || [], window_days: 90 };
  // One list, merged and sorted by PUBLICATION date in the backend (bundled + feed). Discovery or edit time never
  // moves a post up; labels say what it is: New (published in the last 7 days), Edited, or found late.
  const posts = (hm.posts || []).filter((p) => !n.latest || p.id !== n.latest.id).slice(0, 5);
  const label = (p) => p.channel === 'pts' ? h('span', { class: 'badge bad' }, 'PTS')
    : h('span', { class: 'chip' }, kindLabel(p.kind));
  const flag = (p) => p.is_edited ? h('span', { class: 'chip tiny', title: translateUI('ui.b272_post_edited') }, translateUI('ui.news_edited'))
    : p.is_new ? h('span', { class: 'chip tiny accent', title: translateUI('ui.b272_published_week') }, translateUI('ui.news_new'))
      : p.found_late ? h('span', { class: 'tiny muted', title: translateUI('ui.b272_news_found_date', { found: fmtDate(p.first_seen_at), published: fmtDate(p.published) }) }, translateUI('ui.news_discovered_late')) : null;
  const rows = posts.map((p) => {
    const inner = [label(p), h('span', { class: 'grow ellipsis', title: p.summary_status ? uiLabel(p.summary_status) : (p.discovered ? p.title : newsText(p.title)) }, p.discovered ? p.title : newsText(p.title)), flag(p), h('span', { class: 'when' }, fmtDate(p.published))];
    return p.has_summary === false || p.discovered
      ? h('div', { class: 'list-row compact new-post', dataset: { published: p.published } }, ...inner, extLink(p.source_url || p.link, translateUI('common.open')))
      : h('button', { class: 'list-row compact', dataset: { published: p.published }, onclick: () => go('#/news/' + p.id) }, ...inner);
  });
  return h('section', { class: 'card home-news half' }, h('div', { class: 'card-head' }, h('h2', null, translateUI('ui.official_updates_more')),
    h('span', { class: 'tiny muted' }, translateUI('ui.news_archive_recent', { days: number(hm.window_days) })),
    h('div', { class: 'right' }, h('button', { class: 'btn ghost small', onclick: () => go('#/news') }, translateUI('ui.news_archive'), icon('chev')))),
  rows.length ? h('div', { class: 'list-rows' }, rows) : h('div', { class: 'small muted home-empty' }, translateUI('ui.news_archive_empty', { days: number(hm.window_days) })));
}

function eventsCard(n) {
  // Only ongoing (scheduled window open) and upcoming events. Past events live in the archive, not on Home.
  const evs = ((n.home && n.home.events) || n.upcoming).slice(0, 3);
  return h('section', { class: 'card home-events' }, h('div', { class: 'card-head' }, h('h2', null, translateUI('ui.official_events')), h('div', { class: 'right' },
    h('button', { class: 'btn ghost small', onclick: () => go('#/events') }, translateUI('ui.news_archive'), icon('chev')))),
  evs.length ? h('div', { class: 'list-rows' }, evs.map((e) => eventRow(e))) :
    h('div', { class: 'small muted home-empty', title: translateUI('ui.b272_events_snapshot_date', { date: fmtDate(n.snapshot_checked_at) }) }, translateUI('ui.news_events_empty')));
}

async function continueCard(runs, rerender) {
  const run = runs.runs.find((r) => r.id === runs.active) || runs.runs[0];
  if (!run) {
    return h('section', { class: 'card half home-run row' }, icon('guides'), h('div', { class: 'grow small' }, h('strong', null, translateUI('ui.storyline_run')), h('div', { class: 'muted' }, translateUI('ui.b272_track_run'))),
      h('button', { class: 'btn small', onclick: async () => { if (await createRun()) rerender(); } }, icon('plus'), translateUI('ui.b272_create_run')));
  }
  const st = await get(`/api/guides/runs/${run.id}/state?region=${run.last_region}`);
  const step = st.steps.find((x) => x.id === st.active_step_id);
  const read = step && st.source === 'walkthrough' ? await walkthroughReader(lang(), st.source) : x => x.text;
  const c = st.source === 'milestones' ? st.counts.mandatory : st.counts.unclassified;
  const pct = c.total ? Math.round(c.done / c.total * 100) : 0;
  return h('section', { class: 'card half home-run stack tight' },
    h('div', { class: 'row' }, h('span', { class: 'initial' }, run.character_name.charAt(0).toUpperCase()), h('div', { class: 'grow' },
      h('div', { class: 'eyebrow-text' }, translateUI('ui.b272_continue')), h('div', { style: { fontWeight: 700 } }, `${run.display} — ${gameTerm('region', cap(st.region))}`)),
      h('button', { class: 'btn small', onclick: () => go('#/guides?jump=1') }, translateUI('ui.b272_open_guide')), h('button', { class: 'btn ghost small', title: translateUI('ui.guide_storyline_window'), onclick: () => openPopout('storyline') }, icon('popout'))),
    h('div', { class: 'row' }, h('div', { class: 'progress grow' }, h('span', { style: { width: pct + '%' } })), h('span', { class: 'small nowrap' }, `${c.done}/${c.total}`)),
    step ? h('div', { class: 'small' }, h('span', { class: 'muted' }, `${st.source === 'walkthrough' ? gameTerm('location', step.chapter) : step.chapter} · `), read(step)) : null);
}

function quickCard() {
  const list = (setting('nav.quick_access') || []).map((it) => ({ it, info: qaInfo(it) })).filter((x) => x.info);
  return h('section', { class: 'card home-quick' }, h('div', { class: 'card-head' }, h('h2', null, translateUI('ui.quick_access')),
    h('div', { class: 'right' }, h('button', { class: 'btn ghost small', onclick: () => go('#/tools') }, translateUI('tools.title'), icon('chev')))),
  list.length ? h('div', { class: 'quick-chips' }, list.map(({ info }) => h('button', { class: 'quick-chip' + (info.disabled ? ' disabled' : ''), title: info.disabled || info.label,
    onclick: () => (info.disabled ? toast(info.disabled, { kind: 'warn' }) : go(info.route)) },
  info.sprite ? h('img', { class: 'pixel', src: info.sprite, width: 24, height: 24, alt: '' }) : icon(info.icon), h('span', null, info.label)))) :
    h('div', { class: 'small muted' }, translateUI('ui.b272_pin_help')));
}

function favouritesCard(species) {
  const favs = species.filter((x) => x.fav).slice(0, 18);
  return h('section', { class: 'card half home-favs' }, h('div', { class: 'card-head' }, h('h2', null, translateUI('ui.favourite_pokemon')),
    h('div', { class: 'right' }, h('button', { class: 'btn ghost small', onclick: () => go('#/pokedex') }, 'Pokédex', icon('chev')))),
  favs.length ? h('div', { class: 'fav-strip' }, favs.map((x) => h('button', { class: 'fav-tile', title: `${speciesLabel(x.id, x.name)} — ${uiLabel(x.avail)}`, onclick: () => go('#/pokedex/' + x.id) },
    sizedSprite(x, 48, { still: x.still, url: x.icon, tier: x.size || 'm' }), h('span', { class: 'tiny' }, speciesLabel(x.id, x.name))))) :
    h('div', { class: 'small muted' }, translateUI('ui.b272_favorite_help')));
}

function getStarted(data, runs, rerender) {
  // A short, skippable welcome: everything here is optional and already works without it.
  const step = (done, title, body, ...action) => h('div', { class: 'gs-step' + (done ? ' done' : '') }, h('span', { class: 'gs-dot' }, done ? icon('check') : null),
    h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, title), h('div', { class: 'small muted' }, body), action.length ? h('div', { class: 'row wrap tight', style: { marginTop: '6px' } }, action) : null));
  const steps = h('div', { class: 'gs-steps' });
  const live = { enabled: !!setting('live.ntfy.enabled') };
  const draw = (game) => mount(steps,
    step(true, translateUI('ui.b272_ready'), translateUI('ui.b272_ready_desc')),
    step(false, translateUI('ui.language'), translateUI('ui.b272_language_desc'),
      h('select', { class: 'input', style: { width: 'auto', minHeight: '28px' }, 'aria-label': translateUI('ui.language'), onchange: async (e) => { await saveSettings({ 'app.language': e.target.value }); location.reload(); } },
        LANGS.map((l) => h('option', { value: l.id, selected: setting('app.language') === l.id ? 'selected' : null }, l.native)))),
    step(!!(game && game.chosen), 'PokeMMO', game && game.chosen ? translateUI('ui.b272_game_found', { game: game.chosen.label }) : translateUI('ui.b272_game_not_found'),
      game && game.chosen ? h('button', { class: 'btn small', onclick: async () => { try { const r = await post('/api/game/launch'); toast(r.already_running ? translateUI('ui.b272_game_running') : r.already_starting ? translateUI('ui.b272_game_starting') : translateUI('ui.b272_game_start')); } catch (e) { toast(e.message, { kind: 'warn' }); } } }, icon('play'), translateUI('ui.b272_game_launch')) : null,
      h('button', { class: 'btn small ghost', onclick: () => go('#/settings/startup') }, translateUI('ui.b272_startup_settings'))),
    step(!!live.enabled, translateUI('ui.b272_alpha_alerts'), translateUI('ui.b272_alpha_optional'),
      h('button', { class: 'btn small', onclick: () => go('#/live') }, live.enabled ? translateUI('ui.open_live') : translateUI('ui.b272_live_enable')),
      h('button', { class: 'btn small ghost', onclick: async () => { try { await post('/api/live/test', { kind: 'alpha' }); } catch (e) { toast(e.message, { kind: 'warn' }); } } }, translateUI('ui.b272_test_notice'))),
    step(false, translateUI('ui.b272_floating_tools'), translateUI('ui.b272_floating_help'),
      h('button', { class: 'btn small', onclick: () => openPopout('timers') }, icon('popout'), translateUI('ui.b272_timer_try'))),
    step(true, translateUI('ui.b272_up_to_date'), translateUI('ui.b272_up_to_date_desc'),
      h('button', { class: 'btn small ghost', onclick: () => go('#/settings/updates') }, translateUI('ui.b272_update_settings'))));
  draw(null);
  get('/api/game/status').then(draw).catch(() => {});
  return h('section', { class: 'card get-started' }, h('div', { class: 'card-head' }, h('h2', null, translateUI('ui.b272_welcome')), h('div', { class: 'right' },
    h('button', { class: 'btn ghost small', onclick: async () => { await saveSettings({ 'app.onboarded': true }); rerender(); } }, translateUI('ui.b272_skip_welcome')))), steps);
}

function installBanner(data, rerender, update) {
  const c = update ? data.update_available : data.candidates[0];
  return h('div', { class: 'notice info', style: { marginBottom: '14px' } }, icon('download'),
    h('div', { class: 'grow' }, h('strong', null, update ? translateUI('ui.b272_client_changed') : translateUI('ui.b272_client_found')),
      translateUI('ui.b272_client_import_help', { folder: c.folder })),
    h('button', { class: 'btn primary small', onclick: () => installNow(c.folder, rerender) }, update ? translateUI('ui.b272_reinstall') : translateUI('ui.b272_install')));
}

async function installNow(folder, rerender) {
  const { job } = await post('/api/import/dumps', { folder });
  toast(translateUI('ui.b272_data_installing'), { timeout: 2500 });
  const poll = async () => {
    const j = await get('/api/import/jobs/' + job);
    if (j.state === 'running') { setTimeout(poll, 400); return; }
    if (j.state === 'error') { toast(apiErrorText(j.error), { kind: 'warn', timeout: 8000 }); return; }
    const { loadBoot } = await import('../core.js');
    await loadBoot(); state.dexCache = null;
    toast(translateUI('ui.b272_data_installed', { species: number(j.result.counts.species), icons: number(j.result.counts.icons || 0) }));
    rerender();
  };
  poll();
}

function statusBadge(st) {
  const map = { upcoming: 'corroborated', concluded: 'unknown', window_passed: 'unknown', window_open: 'dump', cancelled: 'bad', unknown: 'unknown' };
  return h('span', { class: 'badge ' + (map[st.code] || 'unknown') }, uiLabel(st.label));
}
function eventRow(e) {
  return h('button', { class: 'list-row', onclick: () => go('#/events/' + e.id) },
    icon('calendar'), h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, newsText(e.title)),
      h('div', { class: 'small muted' }, `${fmtDate(e.starts)} – ${fmtDate(e.ends)}`)), statusBadge(e.status));
}

let listFilter = 'all';
async function renderNewsList(el, route, initial) {
  if (initial) listFilter = initial;
  const n = newsCache || await news();
  const page = h('div', { class: 'page' });
  mount(el, page);
  const draw = () => {
    // Bundled summaries and newly discovered official posts in one list (newest first).
    const all = n.records || n.articles;
    const items = listFilter === 'events' ? [] : all.filter((a) => listFilter === 'all' || (listFilter === 'pts' ? a.channel === 'pts'
      : listFilter === 'changelog' ? ['changelog', 'hotfix'].includes(a.kind) && a.channel === 'live' : a.kind === listFilter && a.channel === 'live'));
    mount(page,
      h('div', { class: 'page-head' }, h('button', { class: 'btn ghost', onclick: () => go('#/home') }, icon('back'), translateUI('ui.home')),
        h('div', null, h('h1', null, translateUI('ui.b272_updates_events')), h('div', { class: 'sub' }, n.feed && n.feed.last_ok_at ? translateUI('ui.b272_news_forum_checked', { age: relTime(n.feed.last_ok_at) }) : translateUI('ui.b272_summary_date', { date: fmtDate(n.snapshot_checked_at) })))),
      h('div', { class: 'row wrap', style: { marginBottom: '14px' } },
        ['all', 'changelog', 'announcement', 'pts', 'events'].map((f) => h('button', { class: 'chip btnlike' + (listFilter === f ? ' active' : ''), onclick: () => { listFilter = f; draw(); } },
          { all: translateUI('common.all'), changelog: translateUI('ui.b272_changelogs'), announcement: translateUI('ui.b272_announcements'), pts: translateUI('ui.b272_test_server'), events: translateUI('ui.events') }[f]))),
      h('div', { class: 'content-narrow stack' },
        listFilter === 'events' || listFilter === 'all' ? h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, translateUI('ui.events'))),
          n.upcoming.length ? null : h('p', { class: 'muted', style: { marginTop: 0 } }, translateUI('ui.b272_snapshot_events')),
          h('div', { class: 'list-rows' }, n.events.map(eventRow))) : null,
        items.length ? h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, translateUI('ui.b272_posts'))),
          h('div', { class: 'list-rows' }, items.map((a) => h(a.discovered ? 'a' : 'button', a.discovered ? { class: 'list-row', href: a.source_url, target: '_blank', rel: 'noopener noreferrer' } : { class: 'list-row', onclick: () => go('#/news/' + a.id) },
            h('div', { class: 'grow' }, h('div', { class: 'row wrap' }, h('span', { style: { fontWeight: 600 } }, a.discovered ? a.title : newsText(a.title)),
              a.channel === 'pts' ? h('span', { class: 'badge bad' }, 'PTS') : h('span', { class: 'chip' }, kindLabel(a.kind))),
            h('div', { class: 'small muted ellipsis' }, newsText(a.summary) || translateUI('ui.b272_post_only'))), h('span', { class: 'when' }, fmtDate(a.published)))))) : null,
        h('p', { class: 'small muted' }, newsText(n.about))));
  };
  draw();
}

async function renderArticle(el, id) {
  const page = h('div', { class: 'page' });
  mount(el, page, );
  let a;
  try { a = await get('/api/news/' + id); } catch (e) { mount(page, notice('bad', e.message)); return; }
  mount(page, h('div', { class: 'content-narrow' },
    h('div', { class: 'row', style: { marginBottom: '12px' } }, h('button', { class: 'btn ghost', onclick: () => history.length > 1 ? history.back() : go('#/news') }, icon('back'), translateUI('ui.back'))),
    h('article', { class: 'card article' },
      h('div', { class: 'band' }, h('div', { class: 'eyebrow card-head', style: { margin: 0 } }, a.channel === 'pts' ? translateUI('ui.b272_public_test') : (kindLabel(a.kind))),
        h('h1', { style: { margin: '4px 0 6px', fontSize: '1.45rem' } }, a.discovered ? a.title : newsText(a.title)), provenanceLine(a)),
      a.channel === 'pts' ? notice('warn', h('strong', null, translateUI('ui.b272_test_only')), translateUI('ui.b272_test_explain')) : null,
      h('p', { style: { fontSize: '1.05rem', color: 'var(--text-secondary)' } }, newsText(a.summary)),
      (a.groups || []).map((g) => [h('h2', null, newsText(g.heading)), h('ul', null, g.points.map((p) => h('li', null, newsText(p))))]),
      a.companion_impact && a.companion_impact.length ? [h('h2', null, translateUI('ui.b272_companion_impact')), h('ul', null, a.companion_impact.map((p) => h('li', null, newsText(p))))] : null,
      h('hr'),
      h('div', { class: 'small muted stack tight' },
        h('div', null, translateUI('ui.b272_source_prefix'), extLink(a.source_url, translateUI('ui.news_official_source'))),
        h('div', null, translateUI('ui.b272_independent_summary'), sourceText(a.provenance))))));
}

async function renderEvent(el, id) {
  const page = h('div', { class: 'page' });
  mount(el, page);
  let e;
  try { e = await get('/api/events/' + id); } catch (err) { mount(page, notice('bad', err.message)); return; }
  const local = (iso) => iso && iso.length > 10 ? translateUI('ui.b272_event_local_time', { local: fmtDate(iso, true), utc: iso.replace('T', ' ').replace(':00Z', ' UTC') }) : fmtDate(iso);
  const kindLabel = { seasonal: translateUI('ui.b272_event_seasonal'), competition: translateUI('ui.b272_event_catch'), test: translateUI('ui.b272_event_test'), tournament: translateUI('ui.b272_event_pvp') }[e.kind] || cap(e.kind);
  mount(page, h('div', { class: 'content-narrow' },
    h('div', { class: 'row', style: { marginBottom: '12px' } }, h('button', { class: 'btn ghost', onclick: () => history.length > 1 ? history.back() : go('#/events') }, icon('back'), translateUI('ui.back'))),
    h('article', { class: 'card article' },
      h('div', { class: 'band' }, h('div', { class: 'eyebrow card-head', style: { margin: 0 } }, kindLabel),
        h('h1', { style: { margin: '4px 0 6px', fontSize: '1.45rem' } }, newsText(e.title)),
        h('div', { class: 'row wrap' }, statusBadge(e.status), sourceInfo(e.provenance))),
      h('dl', { class: 'kv' }, h('dt', null, translateUI('ui.b272_event_starts')), h('dd', null, local(e.starts)), h('dt', null, translateUI('ui.b272_event_ends')), h('dd', null, local(e.ends)),
        h('dt', null, translateUI('ui.b272_time_zone')), h('dd', null, newsText(e.timezone_note) || '—'),
        (e.details || []).map((d) => [h('dt', null, newsText(d.label)), h('dd', null, newsText(d.value))])),
      h('p', { style: { color: 'var(--text-secondary)' } }, newsText(e.summary)),
      e.status.code === 'concluded' ? notice('info', translateUI('ui.b272_event_ended')) : null,
      h('hr'),
      h('div', { class: 'small muted' }, translateUI('ui.b272_source_prefix'), extLink(e.source_url, translateUI('ui.b272_event_source'))))));
}
