# 18 — Connected Companion features: Items, Notes, Box, Showcase, Maps, Guides, toolbar
**Date:** 2026-11-22. **Status:** New user-requested designs, staged—not code shipped.

## Product principle
New tools must share a **single local data model** instead of isolated mini-apps. The Companion has five global destinations Home | Pokédex | Tools | Live | Guides. Add **Item Library, Notes, My Pokémon/Box, Showcase and Map Explorer** as discoverable Tools modules and reusable contextual popouts, **without immediately bloating primary navigation**. A global Quick Access pin lets users reach favourites. Visibility is customizable. All user state local/private with backups and opt-in exports.

## 1. Item Library / Itemdex
- Searchable grid and detail view with category (Ball, Medicine, Berries, Hold items, TMs/HMs, Evolution, Breeding, Cosmetics, Key items, Other), item name, icon, description, relevant PokeMMO mechanics, source/patch.
- Locally supplied combined `Pokemmo-Dumps(5).zip` has `PokedexData.zip` with **3,006 item rows** (id/name/desc/region_id/icon_id) and `ItemSpriteDump.zip` with **2,366 PNG sprites** (sprites/itemicons/<icon_id>.png). Different counts are expected; icons can be shared, missing, or represent duplicates.
- Existing importer in `companion/services/importer.py` extracts **only a few breeding-item icons**: extend local-only extraction, dedupe by logical group while preserving all source IDs/regional variants, validate null/missing image and sanitation, lazy thumbnail + virtualized grid, metadata patch freshness.
- Interactions: favourite item, manually owned quantity (never auto-inventory), 'Use in breeding plan', 'Related evolutions', 'Where used/obtained' only if verified, popout.
- Data and sprites from user's approved local import, not automatically redistributed raw dumps/assets on public GitHub. Exact permissions and public packages gate releases.

## 2. First-class Notes workspace
- **Create, edit, duplicate, delete, archive, search**, autosave, tags/folders, favourite/pin, backups, optional Markdown/rich-text safe rendering, link notes to Pokémon species, individual owned Pokémon, Item, map route, Guide, breeding plan or arbitrary note.
- Standalone Notes within Tools; independent small translucent Note popout (Compact = one editable note; Standard = note + metadata; Expanded = list/search/editor).
- Destructive operations confirmed and undo/archived restore. Data private by default, export Markdown/JSON; never publish notes to feed or GitHub.
- Existing per-species Notes remains and can be migrated/linked; don't lose notes when feature ships.

## 3. 'My Pokémon' manual Box / personal collection
- Explicit **optional curated box**, never assumes every caught, sold, traded or storyline Pokémon belongs here. Characters can have independent collections, with optional global/shared-view read-only filters.
- A Pokémon instance is a unique record, **not merely a species registration flag**. Fields optional and user-controlled: nickname, species/form/costume, gender, shiny/secret shiny, Alpha, level, IV six stats, EV six stats (validate EV total), nature, ability/HA, four moves, held item, friendship if supported, encounter count at catch if known, obtained date/region/location/method, OT, original catch notes, local photo/screenshot, tags, showcase visibility, traded/sold/archive status.
- Fields group into **Identity, Stats & Training, Moves, Origin, Media & Notes**; progressive disclosure matching real PokeMMO Summary layout. Never require every field to add an entry; allow blank Unknowns. A per-character duplicate of same species is allowed.
- Manual entry first, *optional import from user-owned screenshots in later safe stage*. Does **not** automatically mark Pokédex Owned/Caught OT since those are distinct game mechanics. If user chooses, offer explicit per-field confirmation and reversible sync to local checklist.
- Connect one instance to the Breeding Planner parent slot (read-only defaults; do not simulate game mutation or remove from box automatically), Team Builder, hunting plan, Notes and Showcase. Track privacy and source type for every field.

## 4. Shiny Showcase for streamers / simple collection display
- Create a **Showcase layout** from selected individual Box entries. Do not require in-game PC/party, game capture or webcam.
- Templates: **Minimal card** (sprite, name, shiny badge), **Collection grid**, **Featured catch** with optional IVs, nature, encounter count and catch method/date. Sensitive fields and owner names opt-in per template; hide by default. Custom backgrounds/opacity/colors within Companion's palette.
- Animation: if user privately imports a **lawful original animation** from local resource, allow safe low-rate loop; otherwise offer subtle UI-only float/sheen motion and static sprite. Do **not claim animation for a static dump sprite**, or scrape copyrighted gifs and bundle them.
- Independent pin/move/resize/transparent popout for OBS Window Capture/Browser Source later if safe. Saved show/hide toggles and quick switch between showcase entries without editing game.
- No automatic catch detection, no account sync and no external public upload unless separately approved.

## 5. Custom Guide Builder and reusable routines
- Existing per-character five-region storyline guides remain. Add **Create guide** with title, scope (storyline / gym rerun / item hunt / seasonal event / breeding routine / custom), optional region and map location, steps, nested checklist, text, notes, attachments and manually marked completion.
- Native editor with reorder/indent, headings, checklists, images, links, reusable templates. Gym-rerun programs use **repeatable run instances**, historical completion logs and manual reset/next cycle; no input automation or claimed automatic gym availability.
- Import (with preview and source ownership/rights): `.txt`, `.md`, `.odt`, `.docx`, plus `.pdf` where text/image extraction works and `.html` sanitized. Keep tables and pictures when feasible; never execute embedded scripts or macros, sandbox document parsing, show failures/unmapped steps for review.
- Existing five user ODT walkthroughs may be imported privately; don't copy original text/embedded pictures to public repo. Preserve notes/progress through re-import using stable IDs/migration.
- Popout for steps includes transparency, run selection, font menu and task completion. A guide can link Item Library entry, species Pokédex, and encounter map.
- Export human-editable Markdown/JSON and PDF via user-selected output later; image/data licensing remains separate.

## 6. Interactive PokeMMO region map and encounter explorer
- New Tools/Guide-linked **Map Explorer** for **Kanto (Sevii Islands), Johto, Hoenn (islands/water routes), Sinnoh, Unova** and verified islands/areas. Pan/zoom/click town, route, cave, floor, room; search by species or route.
- Location page: encounter species and form, method (grass/surf/fishing/headbutt/rock smash/etc.), **3x/5x hordes**, day/morning/night, seasons, lure-specific, level ranges, release/special/raid flags, type and distance/navigation notes where source supports. Do not invent exact rarity/rates or imply a static cave rotation is current.
- Bi-directional links: Pokédex Wild Locations -> Map marker; Map -> species detail; Guide step -> town/route; Item acquisition -> map; manual hunted/saved favourite spots -> Notes.
- Implementation: own authored vector geometry or licensed cartography, distinct from copyrighted game map images. Do not copy Team Synergy's design/art/backend. UX inspiration only: https://synergymmo.com/region-maps/ ; Route Finder https://synergymmo.com/route-finder/ . Ask owner permission for data reuse if helpful.
- Data contract: `Region {id, map_asset_source, version}`, `Location {id, region, floor/area, bounds, label, source}`, `EncounterSlot {species, form, method, season, time, horde_size, lure, level_range, rarity_if_verified, patch, confidence, source}`.
- The PokeMMO dump's location rows are useful but **not a guarantee of real-time spawn** (event, cave, seasonal rebalance). Prefer 2026 patch-aware sources. Allow source-level disabled/uncertain badges.
- Phase sequence: searchable **location list** + bidirectional links -> original simple clickable map -> richer per-floor/season/horde detail -> compare routes, all with regression cases.

## 7. Toolbar, language, settings and popout refinements
- Add small **globe/language button** to main toolbar for English primary, Spanish and Chinese beta as supported; settings remains full translation management. English fallback for missing strings; translate own UI, verify PokeMMO species/item labels separately (no generic game substitutions). Save language per app, not per Pokémon or per-run.
- More toolbar customization: choose which global actions show (search, language, notification status, pinned tools) and reorder Quick Access; don't create twenty buttons by default. Compact/horizontal nav has overflow.
- Replace popout **A-/A+** with one recognizable **Text size** icon/menu containing slider 60–200% if legibility-tested, +/- small steps, Reset and preview; maintain separate per-tool settings. Direct keyboard accessible and responsive to screen readers.
- Per-tool display presets stay **freely resizable**, remember size per mode, pin, background opacity, text contrast, monitor restore.
- Settings organized in searchable categories and global defaults + per-tool overrides; persistence and backups remain.

## Integration model (concept, not yet API)
```text
ItemCatalog [item_id, regional_aliases, icon_id, category, source, patch]
Note [note_id, title, body, tags, attachments[], linked_entities[], timestamps]
OwnedPokemon [instance_id, run_id?, species/form, fields?, image?, privacy, source]
Showcase [layout_id, instance_ids[], template, visibility, opacity, mode]
Guide [guide_id, owner_run?, chapters[], steps[], asset_refs[], recurring?, source]
MapRegion/MapLocation/EncounterSlot [versioned source-backed records]
```
Use stable IDs, local migrations, attachment size limits, consistent export/import/backup and no data loss through code updates.

## Success scenarios
- Import ItemSpriteDump.zip once, browse all available logical items, handle missing icons, open breeding item and view where used.
- Make note 'Route 117 shiny hunt'; pin its popout, link to species and map route; edit/delete/restore.
- Enter one Shiny Alpha Pokémon with known IV/EV/nature and encounter count, add to curated Box, show a transparent streaming popout; unrelated Pokédex owned count doesn't magically change.
- Build custom gym-rerun guide with screenshots and steps, complete one cycle and start a second without losing prior history.
- Open Unova interactive route, filter Autumn+Night+Lure+Horde, see only provenance-backed results; missing verified encounter rates shown as Unknown.
- Switch language in toolbar without losing selected run, notes, box or active popouts.

**Not approved**: automatic game input, memory reading/injection, background capture by default, arbitrary copyrighted asset redistribution, merging Theme Creator project into this Companion.
