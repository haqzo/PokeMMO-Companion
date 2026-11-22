# Design spec 06 — Responsive Pokédex, species details and popouts
**Date:** 2026-11-22  
**Status:** Proposed detailed UX, ready for user review. No implementation authorized.  
**Primary style:** Better Default baseline (see spec 05); no purple concept-art palette.

## Product intent
The **main app's Pokédex is a comfortable, attractive, searchable, pixel-crisp card grid** showing all standard National Pokédex entries #001–#649; users do NOT need to register catches to browse species. Special forms/costumes are subordinate to their species. This is not a generic Pokémon wiki: all PokeMMO-specific facts must use patch-aware data with visible uncertainty when applicable.

### Real asset audit (local analysis, not redistribution)
- User's `Pokemmo-Dumps(5).zip` contains 2,860 `monstericons` PNG files, all **36×36 px**, and 3,033 battle-sprite PNG files, all **96×96 px** (dimensions checked across every PNG in the nested ZIPs on 2026-11-22).
- Internal observed paths are like `sprites/monstericons/25-0.png` and `sprites/battlesprites/25-front-n.png`. **Do not assume every species uses these exact forms:** some gender/form sprites need other indices; build an actual file manifest.
- Do **not** publish extracted client assets or bundle them into the public application without separate rights clearance. Plan a clearly labelled user-supplied local asset import or a separately licensed art source; validate the fallback experience.
- Suggested crisp rendering: 36 px icons at **72×72** (2× integer nearest-neighbour) on cards. Battle detail sprite renders at 96×96 or an integer upscaled multiple when space allows. No smoothing or arbitrary fractional interpolation; tune real Windows/Linux DPI tests.

## Main page — information hierarchy
**Toolbar (persistent within Pokédex, not global app chrome):**
- Prominent Search, with placeholder 'Pokémon name or number'; optionally ability/type keyword search as separately described and matched.
- Scope toggle: `All National` / `Gen I`…`Gen V` means **generation of introduction**, NOT encounter region.
- Simple filter opener and Sort. Remember last filters per app preference.
- Current result count and a subtle selected-filters count; never make a huge permanent filter bar.
- A small source/version indicator, e.g. 'Encounter data checked [date]' in the filter/detailed location view, not repeated in every tile.

**Filter drawer**, designed to stay closed by default:
- Pokédex scope: origin generation, regional Pokédex membership (if verified), encounter region (Kanto, Johto, Hoenn, Sinnoh, Unova) separately.
- Pokémon: 1–2 types, ability, evolution stage, egg group, favourite, known acquisition kind.
- Hunting: normal wild, special/lure, horde x3, horde x5; chosen season and morning/day/night; optional location/subarea.
- Special: shiny/alpha availability only if backed by verifiable PokeMMO mechanics. Rotating/seasonal/event is a separate dimension; default excludes expired event-only availability from 'currently wild'.
- Sorting: National # ascending by default, alphabetical, by selected stat **only when verified**, favourites. Sorting persists per surface when appropriate.
- Every filter can be cleared; show which constraints are applied and prevent misleading 'No Pokémon found' caused by invisible filters.

**Responsive card grid:**
- Proposed minimum card width **132–150 logical px**, gap around 8–12 px; final widths adapt to font scaling and page margins.
- A card contains: **National ID** small, fav star small, 36 px sprite at 2× (72 px), Pokémon name, one/two type chips. If acquisition status is shown, use one restrained source-backed word/icon at most; never crowded rarity percentages in the card.
- Target a pleasant 4–6 column grid in standard main page at normal desktop widths, automatically expanding/shrinking by *available content width* rather than fixed 10 columns. Small popouts may use 2–3 columns. Use virtualization for thousands of icon references and smooth scrolling.
- Click once to select/open details according to main-window width and user mode; keyboard arrows navigate cards, Enter opens details, Esc closes. Focus ring and predictable tab order.
- Loading missing art: show a neutral silhouette/ID/type tile (not a broken image) with a clear optional local asset prompt. Never silently replace gender/form art with a wrong Pokémon.
- Press-and-hold/right-click optional shortcuts: 'Open in popout', 'Find locations', 'Add to favourites', 'Send to breeding/team' when applicable.

## Details — deliberate layouts at each width
**Wide main page (~1000+ px content width):** two-column *grid + detail pane* only when both remain comfortable. Never force an unreadably narrow grid. Detail remains independently scrollable.
**Narrow main page:** detail **replaces** grid; Back returns exactly to search/filter/scroll/card focus.
**Independent popout:** dedicated species view with own selected form/tab, Compact/Standard/Expanded modes; can pin over game. Opening a popout must NOT hijack scroll or navigation in the main window.

**Details header:**
- Species name, National number, selectable verified forms/sex sprite variants, type chips, optional favouriting.
- Sharp 96×96 source sprite or clean alternative; optional Shiny toggle if art exists, explicitly not a claim of player ownership.
- Small 'Verified / dump only / unknown' summary to open detailed provenance, not a badge explosion.

**Tabs / panes:**
1. **Overview:** base stats as six numeric values and restrained bars, abilities (normal and Hidden Ability carefully distinguished), height/weight, EV yield, gender ratio and relevant PokeMMO flags. Avoid duplicate first/second identical ability names in the UI without explaining slots.
2. **Locations:** rows grouped by region > area > method with level range, normal/horde flag and *chosen* season/time values. Clearly separate rotating/special/story-only sources. Group seasonal duplicates visually without erasing actual data. Link location to a regional guide only if a real verified page exists.
3. **Moves:** Level, Egg, Tutor, TM/HM and special categories, sortable by learned level/name/type; learnset `TM??` means **unconfirmed category**, not automatically a purchasable/learnable TM. A move referenced without metadata remains visible as 'details awaiting verification' rather than disappearing.
4. **Evolution:** chain in compact horizontal/vertical graph as space permits, clear evolution requirements, other regions/forms only when source confirmed.
5. **Forms:** alternate released/costume/gender appearances distinctly, never treating `id>649` as a new ordinary National species; 'is_released' alone cannot prove permanently obtainable.
6. **Breeding:** egg groups and compatible family hints, with action to open Breeding Planner. Clearly distinguish research data from unvalidated PokeMMO egg inheritance outcomes.
7. **Personal:** optional favourites, player-written notes and optional manual 'owned / caught' markers; no automatic game-client/account read, no assumption players track every Pokémon they catch.

A dedicated **Pokémon summary popout** may prioritize Compact: big readable name/type, key stats and 'Locations' action; Standard: tabs; Expanded: full detailed view. Popout data synchronized with parent, navigation and scroll per-surface independent.

## Encounter display contract (from actual dump, not generic cartridge assumptions)
One dump location entry can provide `region_name`, `location_name_full`, `type`, `min_level`, `max_level`, `season`, `is_horde_3x`, `is_horde_5x`, `rarity_morning`, `rarity_day`, `rarity_night`.
- Exact numeric percentage strings can be interpreted as percentages only under the appropriate matching method/season/time and current-patch validation.
- `Lure`, `Special`, `???`, `--` are **not** equal to 0%, 100%, or one another.
- Show Horde x3/x5 explicitly; a species appearing in a horde is not automatically a 5× source.
- Changes from July–November 2026 must overlay base records with source date and patch applicability; no destructive rewriting of original dump.
- User may filter by target hunting time of day and season. A selected time never silently modifies another region's spawn data.
- Roaming legendaries, Altering Cave, events, raids, storyline-only Pokémon and contested legendaries require separate acquisition metadata, not a fake persistent Grass/Cave location.

## Navigation flows (test these)
1. From Home, open last-viewed Pokémon -> specific species detail -> 'Locations' -> a verified Unova route -> back restores prior selected detail.
2. From grid, search 'Pikachu' -> choose form/sex (where available) -> open stand-alone popout -> close popout -> grid remains at same scroll.
3. From Pokémon summary popout, 'Open breeding planner' -> opens Tools/Breeding in main app or separate popout as explicitly chosen; same Pokémon selected as one parent only if breedable.
4. From Horde filter, click a location -> show region, season, time, horde size and source; if unknown say so.
5. From Alpha alert, open species -> see Pokédex detail without marking that Pokémon caught or the alert permanently active.

## Golden UX/data acceptance fixtures
- **Bulbasaur #001, Viridian Forest:** dump reports `Lure` for its three time periods. No invented percent.
- **Pikachu #025:** dump repeats ELECTRIC in two type slots; display **one** type chip. Its Power Plant spring example reports morning/day/night `20%`; only show source-specific values when judged current.
- **Zorua #570, Lostlorn Forest:** four seasonal location entries, x3 horde flag; rates `???`; render *Unknown rate*, not zero or 100.
- **Zekrom #644:** dump says `obtainable: true` but zero location rows; special story mechanics need separate evidence; never call permanently wild.
- **Moltres #146:** zero ordinary dump location entries doesn't mean completely unobtainable; see verified roamer source and current rotation.
- **Unfezant #521 / Frillish #592 / Jellicent #593:** use sprite manifest and gender variant fallback; no broken default path assumptions.
- **Snowscape:** a referenced learned move absent from skill catalog metadata must remain listed with 'Unverified move details'; don't silently disappear or inherit Hail mechanics.
- **Altering Cave:** only two Unown static dump records, not the live rotation; no forged current cave spawn lineup.
- At 100%, 125%, 150%, 200% OS scaling, grid does not clip text; cards do not randomly alter sort/focus order during sprite lazy-load.
- Offline/no sprites: display stable fallback cards and details; not a blank Pokédex.

## Implementation acceptance (NOT authorization)
- Interactive main-grid and species-detail mock data should be **labelled clearly test fixtures** until real verified database is ready.
- Confirm local sprite import uses no file paths outside user-selected data; do not upload them or commit them to public GitHub.
- Favor shared data services and per-surface state (main app and each popout); changes to favourites/notes synchronized, while scroll/focus/tab selection can remain independent.
- All game-specific display data carry source & last-verified metadata and unknown-state behavior.
- The user must review UI density and page behavior before Claude begins production implementation.
