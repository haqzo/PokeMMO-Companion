# Build 27 — Offline localization checkpoint

Build 27 improves Spanish and Simplified Chinese across the existing application. Both are community-review drafts. The closed-alpha requirement for using every page and tool without English remains open.

The starting `develop` commit was `24667ba339d3c417cae7b70ed026eee02313db79`. The AppImage was built from `19f1df92e7774dc5ccdfdd64e90ba93317924497`. The version is `0.1.0`. The report commit is the documentation-only successor to the application commit.

## Implementation and sources

- `ui/js/i18n.js` and `ui/js/ui-strings.js` provide source-keyed messages, safe placeholders, plural rules, and locale-aware number, date, and relative-time helpers. The stored setting drives web chrome, open popouts, and the native Qt tray and popout controls. User-generated values remain stored verbatim.
- `tools/build_game_terms.py`, `tools/localization/location-names.csv`, `ui/js/game-terms.js`, and `ui/js/game-locale.js` keep names separate from PokeMMO IDs and mechanics. The Pokédex, shared Pokémon pickers, catch and stats tools, team editor, comparison, collection, breeding, locations, items, Home, and report displays consume the names. Pokémon queries accept the selected language, English, and numbers. Spanish search normalizes accents.
- `ui/js/walkthrough-locales.js` provides optional translations for each original step ID and source-text hash. The storyline browser, run and popout use that table. Imported guide content retains its original text and headings. The canonical walkthroughs, progress hashes, and source attribution remain in the original assets.
- `companion/localization.py` and `companion/shell/qt_shell.py` hold the native Qt messages. The packaging spec includes the generated tables, license text and Companion Han, a renamed Noto Sans CJK SC subset. The native external browser launcher remains the Build 26 implementation.
- The owner's local PokeMMO definitions and string tables were inspected first. Samples of species, moves, abilities and places in the Spanish and Chinese tables used English. Existing verified item labels remain authoritative. The supplied storyline string archive contained English files. Private archives were used locally for inspection. [PokeMMO language packs and ROM language](https://support.pokemmo.com/knowledgebase/article/rom-language-and-chinese-language-pack)
- PokéAPI rows use pinned revision `de6760be38b60a3024f1d9054330ff265f0dc619`. Display names come from exact canonical-name joins, species IDs, validated form joins, or four legacy move names confirmed by their client move IDs. Regional place names also use a selected crosswalk of 196 names from 52Poké. Review the crosswalk's CC BY-NC-SA 3.0 conditions before redistribution. Both sources are attributed in `CREDITS.md`. The PokéAPI project license includes a Pokémon trademark notice. [PokéAPI CSV tables](https://github.com/PokeAPI/pokeapi/tree/de6760be38b60a3024f1d9054330ff265f0dc619/data/v2/csv) · [52Poké location crosswalk](https://wiki.52poke.com/wiki/地点列表（在其他语言中）)
- The OS-provided Noto Sans CJK SC Regular font supplied the licensed source for the subset. The package includes the copyright notice and OFL in `ui/fonts/ofl.txt`. The subset covers the GB2312 repertoire and characters collected from the build's text corpus. [Noto CJK](https://github.com/notofonts/noto-cjk)

Run `python tools/build_game_terms.py /path/to/pinned-csv-directory` from the repository root to regenerate the game names. The source tables are build-time inputs. Users can use the packaged language catalogs offline with no ROM, private dump, language pack, or translation API.

The application changes span 43 files. The complete changed-file list is available in the [application commit comparison](https://github.com/haqzo/PokeMMO-Companion/compare/24667ba339d3c417cae7b70ed026eee02313db79...19f1df92e7774dc5ccdfdd64e90ba93317924497).

## Measured coverage

Counts use the bundled reference baseline. English uses canonical PokeMMO names, including legacy move spellings. Items count entries in the grouping table, including placeholders. Locations count unique canonical area strings observed in the encounter table, including floor and subarea strings. This is a narrower denominator than every location label shown in the product.

| Coverage | English | Spanish | Simplified Chinese |
|---|---:|---:|---:|
| Application message keys with a value | 573/573 | 573/573 | 573/573 |
| Native Qt message catalog | 27/27 | 27/27 | 27/27 |
| Species display names | 649/649 | 649/649 | 649/649 |
| Species categories | 649/649 | 649/649 | 649/649 |
| Alternate form labels | 82/82 | 66/82 | 39/82 |
| Base-form labels | 23/23 | 20/23 | 19/23 |
| Move display names | 560/560 | 560/560 | 560/560 |
| Ability display names | 171/171 | 168/171 | 168/171 |
| Item display names | 2,090/2,090 | 1,619/2,090 | 1,590/2,090 |
| Natures | 25/25 | 25/25 | 25/25 |
| PokeMMO types | 17/17 | 17/17 | 17/17 |
| Playable regions | 5/5 | 5/5 | 5/5 |
| Encounter area labels | 471/471 | 214/471 | 214/471 |
| Walkthrough steps | 2,845/2,845 | 50/2,845 | 50/2,845 |

The three unmapped ability names are Hail Warning, Reactive Gas and Snow Plow. Their PokeMMO IDs differ from the apparent mainline equivalents, so the display keeps the client terms. Remaining form labels and item or area names fall back to the canonical names. Most of the missing area translations are floor, subarea or PokeMMO-specific labels. The current catalog adds zero localized species flavor texts, move descriptions, ability descriptions or item descriptions. The item catalog supplied zero description rows in the bundled baseline. Mainline gameplay descriptions require an accuracy review against PokeMMO before they can be displayed as game reference.

The first ten original steps in each region have newly authored Spanish and Chinese translations. Every entry was checked against the original hash.

| Region | Original steps | Translated per language | Remaining per language |
|---|---:|---:|---:|
| Kanto | 454 | 10 | 444 |
| Johto | 617 | 10 | 607 |
| Hoenn | 526 | 10 | 516 |
| Sinnoh | 750 | 10 | 740 |
| Unova | 498 | 10 | 488 |
| **Total** | **2,845** | **50** | **2,795** |

## Remaining work

The English fallback still appears in ordinary workflows. The message counts measure the catalog only. The maintained inventory command below currently finds 1,022 direct string sites and 942 unique candidate texts across the JavaScript UI. It also flags 140 supplemental keys with no direct literal reference. Registry resolution and dynamic keys account for some of those flags. The tool captures file, line, and exact candidate text. Indirect rendering, HTML, backend-authored content, and bundled prose need separate review.

```sh
NODE_PATH=/path/to/acorn-and-acorn-walk/node_modules node tools/localization/audit-ui.cjs
```

| Area | Remaining translation work |
|---|---|
| Home, navigation, news and events | Onboarding, update and review dialogs, live-error states, keyboard shortcuts, menu feedback, and Companion-authored news summaries |
| Pokédex and comparison | Advanced filters, scope and tracking help, artwork status, move and ability explanations, source labels, form details, evolution and encounter conditions, compare prompts and result sentences |
| Tools | Type-chart legends, tool registry descriptions, stats and EV explanations, catch conditions and assumptions returned by the backend, arithmetic history and errors, timer presets and completion messages |
| Breeding and teams | Full plan/cost summaries, incompatibility and validation, inheritance and egg-move prose, saved document dialogs, and slot action accessibility |
| Collection, Showcase, Item Library and Notes | Editor controls, metadata summaries, item category labels and sources, collection confirmations, stream settings, note links and JSON/file errors |
| Locations, live and reference pages | Location details, encounter requirements, feed setup and statuses, history filters, original-report wrappers, notification payloads, roamers and Altering Cave timing and provenance |
| Guides, routines and floating windows | Remaining chapters, step text and built-in milestones, guide source and navigation prose, run administration, custom routine/template metadata, mode-specific controls and empty states |
| Settings and Theme Editor | Most descriptions, advanced and backup confirmations, accessibility text, data and browser errors, profile controls, color names, preview and contrast feedback, and About prose |
| Native Qt and Python routes | Native startup errors, OS notification payloads, service errors and dialogs outside the localized shell catalog, and platform-provided dialog controls |
| Map images | Some original assets contain English labels baked into the image. The current Location Explorer uses a directory. Verified localized overlays were not added. |
| Review | Spanish and Chinese native-speaker review, full visual inspection in all languages at each supported size and theme, and native Windows launch and glyph verification |

User-written notes, custom guides, nicknames, bookmark and profile titles, personal paths, URLs, author credits, branding, external news titles/content and community reports are intentional original-language content. Technical logs may remain English. Locate missing application-owned text with the audit command and translate it in its rendering context. For the remaining walkthrough steps, extend the separate locale table using the original IDs and hashes, retaining the existing author's attribution and confirming derivative redistribution terms first.

## Validation and local package

- The full suite finished with 528 passes and 51 skips. An earlier parallel run timed out in the existing two-run guide menu test. It passed on its own and in the final full run.
- All six built-in themes applied in each language in browser mode. This smoke covered 18 settings combinations. Existing customized-theme tests also passed in the full suite.
- The focused suite passed all 20 tests. It exercised language switching, reloading with the stored preference, updating an already-open compact Phenomena window, localized Pokémon searches and pickers, guide progress and hash preservation, and the shared external launcher. The browser route pass loaded 53 destinations per language with non-loopback browser requests blocked. It checked destination rendering and errors. The scope is narrower than an interaction-by-interaction audit.
- A separate offline browser smoke rendered every registered popout in compact, standard, and expanded modes in each language. All 153 combinations rendered without a page error or an error panel.
- The AppImage self-check passed without system Python on its executable search path. All 4,466 UI and data asset files matched the input bytes. The credits matched, and the archive inventory contained no ROMs, private dumps or credential-related file names. Two isolated native Qt startup and shutdown cycles opened report and expanded Phenomena popouts. A separate frozen Qt check switched languages, found the localized Home and Pikachu detail, confirmed that Companion Han loaded, and verified the selection after a full native restart. This check ran in a network namespace with loopback as its only interface.
- Source and frozen native link dispatch recorded seven expected destinations each. The separate desktop test used the actual AppImage, host `xdg-open` and `kde-open`, and the installed Firefox. A temporary KDE configuration directed the link to an isolated headless Firefox profile, which reached the loopback destination.
- Twelve browser screenshots cover Home, Charizard's Pokédex detail, Type Matchups, and Phenomena in all three languages. They are in the local `output/build-27-local/screenshots/` folder. The generated JavaScript string inventory is in `output/build-27-local/ui-localization-audit.json`.
- The existing Windows x86-64 workflow and common packaging spec still apply. The workflow can be run manually as described in [Build 24](https://github.com/haqzo/PokeMMO-Companion/blob/24667ba339d3c417cae7b70ed026eee02313db79/docs/build/24-FINAL-CLOSED-ALPHA-PREPARATION.md). Windows packaging and native Windows rendering were not run in this batch.

| Local file in `~/Documents/ChatGPT/PokeMMO/output/build-27-local/` | Bytes | SHA-256 |
|---|---:|---|
| `PokeMMO-Companion-0.1.0-x86_64.AppImage` | 273,263,096 | `518d393aa9b7a029f7ca4073c4a6cff71e4a348afa34ebb7378b4c60ca2c0ee7` |

The local `SHA256SUMS` was checked against the copied AppImage. This is a private development artifact. Redistribution approval for the existing game assets and the new localization material is still required.
