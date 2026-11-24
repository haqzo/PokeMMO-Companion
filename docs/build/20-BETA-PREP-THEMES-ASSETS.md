# 20 — v0.9.0 beta preparation: themes, customization, built-in assets (`develop`, still v0.1.0, 2026-11-24)

Base `9339c61`. main untouched at `6c90033`. No release, no version bump (0.9.0 waits for the owner's approval),
no published packages. Commits: `09bcdcf` built-in assets · `eda3a6a` sprite preferences & shiny Pokédex ·
then themes/customization, Home/Guides/Type Matchups, release blockers, docs.

## What changed
| Area | Change |
|---|---|
| Built-in sprites | `companion/data/sprites/` (84 MB, `index.json` manifest v-stamped, prepared by `tools/build_sprites.py` from the owner's PokeAPI/sprites checkout): **825 entries = 649 species + 82 forms + 94 female variants**; every entry has static + static-shiny, 824 have animated + animated-shiny. 48 form/female stills had no still file and were **derived from frame 0 of the same Pokémon's animation** (`derived: true`); 12 candidate files identical to the base sprite were refused. Your own library (Settings › Advanced) still overrides it; removing it falls back to the built-in set. Local paths are stripped from the manifest. |
| Built-in item icons | `companion/data/item-icons/` (4.5 MB): 1,087 PokeMMO client icons mapped by the client's **icon id** (not item id) → 2,083 of 2,090 item groups have an icon; the other 7 have no icon in the client. Served at `/assets/item-icons/<icon_id>.png`. |
| Clean-install art everywhere | `DexService.sprite_url()` falls back to the built-in still of the *same* species (never another one) for icon/front, so Collection, Breeding, Notes, Items, Live and evolution lists show artwork without client files. |
| Walkthroughs | `companion/data/walkthroughs/{kanto,johto,hoenn,sinnoh,unova}.json` parsed from the owner's five `COMPLETE WALKTHROUGH(2).odt` files: 454 / 617 / 526 / 750 / 498 steps. Step ids are the same as the earlier private import, so existing checkmarks carry over. New runs default to the bundled walkthrough; existing runs keep their source. Browsable without a run (`#/guides/storyline?browse=1&region=…`, `GET /api/guides/catalog/<region>`). The .odt files contain no author name and no images. |
| Sprite preferences | Settings › Pokémon & sprites: Static/Animated + size per context (Pokédex grid static, summary animated, Roaming animated, active reports animated, expired static, report history static, Location Explorer static, teams static, comparison static), global *Animations: system / on / off* override, reset. Popouts: own sprite size and animation in the text-size menu. Active → expired reports switch to the expired preference when their estimate ends; sprites are kept across refreshes so animations never restart. |
| Pokédex | Toolbar *Normal / Shiny* and *Static / Animated* switches (remembered; display only — no ownership change, filters/sort/search/scroll kept, only visible tiles change, lazy `IntersectionObserver`; animations only for tiles near the viewport and back to stills when they leave). |
| Summary | Floating sparkle/pause buttons replaced by labelled *Normal / Shiny*, *Static / Animated* and ♂/♀ switches under the art (wrap/stack in narrow windows). “Your sprite library (PokéAPI files)” wording removed; sources are in About & credits. |
| Themes | `companion/data/themes.json` (versioned): exactly **Catppuccin Mocha, Tokyo Night, Companion Default (default), Graphite, Arctic, Emerald + Custom**. 37 semantic colour tokens + optional 17 type colours + shape (radius, border on/width/opacity) + layout (density, padding, gaps, sidebar width, scrollbars, table rows, font weight). `ui/js/themes.js` applies them as CSS variables on `<html>`; Companion Default with no changes sets **nothing** (tokens.css stays the approved look). High contrast wins over theme colours. |
| Theme management | Hover = preview, click = use; colour picker + hex (validated live) + opacity where meaningful + per-colour reset + WCAG contrast warnings (never blocking). Personal themes (`theme` documents): save as new, save changes, rename, duplicate, delete, export `.json`, import (server-validated; unknown keys dropped and listed), discard changes, Restore Companion Default. Live in every window through the settings event — no reload. Included in backups (documents + settings). |
| Theme safety | `companion/services/themes.py`: object-only, format/version checked, fixed key lists, colours must match `#rrggbb[aa]`, names without `< > { } \` $ \\`, numbers clamped, choices from fixed lists. A theme can never carry CSS text, URLs, scripts or file paths; nothing in the UI inserts CSS text from a theme. |
| Layout & scaling | Text size 60–200 % (text only) and a separate **interface scale** 75–150 %: native shell → `QWebEngineView.setZoomFactor` on the main window (CSS pixels, applied once on top of the desktop scaling — no double DPI); browser mode → CSS zoom. Popouts keep their own scale. Density (sets padding/gaps together), card padding, grid gap, section spacing, table rows, borders on/off/thickness/opacity, corner radius 0–20, sidebar width, labels, navigation, scrollbars hidden/thin/standard/wide; *Reset layout*. |
| Settings | 15 sections: Appearance & themes · Layout & scaling · Pokémon & sprites · Home · Language · Startup & game · Windows & popouts · Shortcuts · Notifications · Live sources & news · Guides & characters · Updates · Backup & recovery · Advanced (optional imports, storage) · About & credits. Section navigation scrolls on its own. New texts are English (explicit fallback in Spanish/Chinese). |
| Home | Sections render in the order chosen in Settings › Home (show/hide, ▲/▼, reset). 12-column rows: a later narrow card moves up to fill a row, the last card of a row stretches — no empty gaps; cards in a row share one height (Roaming Legendaries and Alpha & Swarm align top and bottom; their footers sit at the bottom; 0, 1 or many reports). Narrow windows stack. |
| News audit | Bundled articles were ordered by *edit* date: an old, recently edited post could top the list. Now everything is ordered by **publication** date; edits (`updated` / `edited_upstream`) and discovery (`first_seen_at`) stay separate fields and never reorder. |
| Type Matchups | *Compare two Pokémon* on the **main page only** (right of the chart ≥ 1380 px, below it otherwise; the popout is unchanged). Name/number search incl. battle forms (cosmetic forms excluded), sprites, types, abilities, Summary/Clear/Swap. Both directions with the 17-type chart (STAB types), weaknesses. Learnset table per side (deduplicated, all learn methods listed): type, effectiveness vs the other Pokémon (— for status), power, accuracy, PP, category, how learned, STAB; filters (name, type, category, method, super-effective only), sortable, up to 4 chosen moves per side. Type-changing abilities (Levitate, Volt Absorb, Wonder Guard, Flash Fire, …) are **named, never applied**. Forms share the species' learnset (stated). No damage, speed or winner. |
| Guides | All guides: both cards share a height; Storyline shows the five regions (progress with a run, step counts and browse without one); My Guides shows recent guides + category shortcuts (open yours, or *new guide* prefilled with that category — nothing is created by itself). |
| Launch with PokeMMO | Not rebuilt. *Open Companion automatically when you start PokeMMO* is now the first, explained option in Startup & game; turning it on also starts the helper immediately; the helper exits by itself when the option is turned off. **Race-safe launch:** an in-process lock plus an atomic `O_EXCL` marker file (60 s grace) — 12 simultaneous requests and a second process start exactly one client; a second request reports *already starting*. |
| Reference data | Review: staging, checksum, signature, limits and coverage guard were sound; **gap fixed**: an interruption between the two activation renames (or during a rollback) left no active dataset. `ReferenceUpdater.recover()` now runs at start: discards unfinished staging, restores `previous/` or the interrupted-rollback copy. Still **off** (no endpoint/key). |
| Companion updates | Channel renamed *Stable* / *Beta & pre-releases*; choosing beta asks for confirmation (backup advice). Stable never sees pre-releases. |
| Wording | Form notes no longer say “your PokeMMO client dump”; Advanced texts no longer claim Companion ships no artwork; the private-walkthrough import is labelled optional. |

## Maintainer procedure — signed reference-data updates (not activated)
1. On a private machine: `python3 tools/reference_package.py keygen --out ~/companion-refdata-key` — keep the
   private key file **outside the repository**, never in logs, CI variables printed to logs, packages or docs.
2. Put the printed **public** key (base64, 32 bytes) into `REFERENCE_PUBLIC_KEY` and the approved https index
   URL into `REFERENCE_INDEX_URL` in `companion/services/refdata.py` (owner decision; commit only the public key).
3. For each new client dump: `python3 tools/reference_package.py build --src <prepared reference folder>
   --revision N --out <dir>` (the app refuses packages with less data than the current one unless the manifest
   explicitly allows it).
4. `python3 tools/reference_package.py index --key <private key> --url-base https://<approved location>/ <entry
   files…>` → `index.json` with its Ed25519 signature.
5. Upload the package(s) and `index.json` to the approved location; test with a throw-away profile
   (`./run.sh --data-dir /tmp/refdata-test`), check *Settings › Updates*, then roll back once to confirm.
6. Rotating the key needs an app release with the new public key; old apps keep refusing unsigned/foreign data.

## Accuracy review (targeted)
* Forms: 22 battle forms checked for types and abilities (Rotom ×5, Wormadam ×2, Shaymin-Sky, Giratina-Origin,
  Kyurem-Black/White, Therian ×3, Meloetta-Pirouette, Darmanitan-Zen, Castform ×3, Deoxys-Attack, Arceus-Fire,
  Keldeo-Resolute): all correct. Black 2/White 2-only forms (Kyurem fusions, Therian formes, Keldeo-Resolute) are
  shown as *Form change not verified* and described as not playable — unchanged policy.
* Item icons mapped by client icon id (an earlier item-id mapping matched only 979 groups and was wrong).
* Learnsets in the comparison come from the bundled PokeMMO data (the same as the summary's Moves tab).

## Not verified / limits
* **Live official news feed:** `forums.pokemmo.com` could not be fetched from this environment (client error);
  ordering, edits and back-off are tested with fixtures only. Check *Settings › Updates › Check now* natively.
* **Walkthrough author name** is not in the files or project records — the owner needs to add it (CREDITS.md).
* **Packaging:** PySide6 and PyInstaller are not installable here (no network) → no AppImage/Windows build. The
  spec bundles the whole `companion/data` folder (sprites, icons, walkthroughs, themes.json are included).
* **Native Qt:** not run here. Interface scale (zoom factor), live theme change with popouts open, KDE/Wayland
  behaviour and the watcher need the owner's native check.
* Redistribution permission for the sprite images (© Nintendo/Creatures/GAME FREAK/TPC) and PokeMMO client
  assets is not established — the owner decides before any public package.

## Performance (this machine; headless Chromium is indicative only)
| | 9339c61 | now |
|---|---|---|
| import + context | 0.64–0.88 s | 0.62–0.64 s |
| RSS after start | 239–242 MB | 242 MB |
| `/api/bootstrap` | 11 KB | 20 KB (theme catalog) |
| `/api/dex/species` | 41–58 ms, 513 KB | 48–50 ms, 828 KB (grid art URLs) |
| Pokédex first cards (clean profile, 1600×1000) | 485 ms, **no artwork** | 872 ms with artwork |
| Pokédex full scroll, 120 px per frame: median / p95 frame | 22 / 47 ms (no images) | static 31 / 83 · shiny 48 / 157 · animated 73 / 266 ms |
| GIFs alive after scrolling 649 tiles (animated mode) | – | 46 (only near the viewport) |
| JS heap | 4 MB | 5–6 MB |
The baseline clean profile drew no artwork at all, so the grid numbers are not like-for-like; the scroll test is
a worst case (a new row every frame, first decode of every image). Theme, sprite-mode and layout changes do not
reload the page (tested).

## Tests
See the final report for the numbers of the last run. New: `tests/test_themes.py` (11), news ordering (1),
race-safe launch (1), refdata recovery (1), `tests/ui/test_ui_themes.py` (5: live theme in main + popout, invalid
hex never applied, restore default, layout/scales, Home order/equal heights/stacking, shiny Pokédex keeps
filters/scroll, sprite preferences + global override), `tests/ui/test_ui_compare_guides.py` (4: both directions,
4×/¼×/0×, forms, abilities named, status moves, filters, 4-move limit, swap/clear, narrow layout, absent from the
popout, Guides landing alignment/browse without a run/stacking). Updated for intended changes: summary switches,
Settings › Home, built-in art in reports, ROM/dump guard (allows the built-in artwork folders, still bans
ROMs/dumps/archives).
