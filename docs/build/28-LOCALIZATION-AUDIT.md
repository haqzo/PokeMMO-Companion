# Spanish and Simplified Chinese localization audit

**Status: incomplete.** Both the full interface audit and the full walkthrough translation remain open. The Linux package is for development verification of this revision.

The audit started from remote `develop` at `ee451d7a42c50049090cb503e4a06ce5d0dc5f13`. The named local checkout was clean at `0da22e8` and fast-forwarded to the verified remote commit. The audit ran in an isolated checkout, leaving the unrelated uncommitted Electron workspace intact. The final application revision is `6a522e0fc83b7f53e6b443798ee70020c0739cd1`. The report and documentation are its successor. This work is local. The version remains `0.1.0`.

## Coverage

Both localized catalogs contain the same set of walkthrough IDs. Code and tests match every translated row against the canonical ID and stored source hash.

| Region | Canonical steps | Starting per language | Revised per language | Remaining per language |
|---|---:|---:|---:|---:|
| Kanto | 454 | 454 | 454 | 0 |
| Johto | 617 | 346 | 355 | 262 |
| Hoenn | 526 | 137 | 149 | 377 |
| Sinnoh | 750 | 184 | 194 | 556 |
| Unova | 498 | 75 | 85 | 413 |
| **Total** | **2,845** | **1,196** | **1,237** | **1,608** |

There are 2,474 delivered step texts across the two locales and 3,216 missing. The 41 additional bilingual rows comprise 26 source-specific translations and 15 reviewed phrase expansions. Both languages resolve all 318 distinct bundled chapter headings. The canonical data, order, IDs and stored hashes are unchanged. Kanto coverage refers to the presence and structural integrity of a translation for each step.

The application exposes 1,312 catalog keys with nonempty English, Spanish and Simplified Chinese values and matching interpolation placeholders. That is a catalog measurement. The JavaScript candidate scanner still returns 544 sites covering 509 distinct candidate texts with no literal catalog match. Some are product names, interpolated numbers or other intentional source text. It also reports 149 supplemental keys without a direct literal use. Source lookups and dynamic keys can use these at runtime, so those findings do not establish that a key is unused. An independent browser inventory recorded 2,323 identical label observations across 53 routes in all three languages. That total includes branding, reference names, and repeated navigation. The rendered inventory records the route, exact text, and whether it came from visible text or an accessibility attribute.

Independent UI and source inspection identified English in the Pokédex detail tabs, status and growth labels, Location Explorer filters, live report narratives, Settings and shortcut descriptions, custom guides, team summaries, native alerts, backend validation, the milestone outline objectives, and some walkthrough source wrappers. Bundled reference data still needs an entry-level review of locations and subareas, forms, move and ability descriptions, item labels, and encounter condition text. The application has no verified end-to-end coverage percentage.

User-entered names, notes, files and other user text retain their original language. Official external news, external reports, credits and source names retain their original wording. These do not count toward application localization.

## Review findings and corrections

- Inspected the complete 22-file diff inventory from Build 27 through the five named checkpoints and remote `develop`. The review checked catalog structure and sampled guide meaning, terminology, numeric values and UI behavior. A full line-by-line language review remains outstanding. The starting suite exposed `kanto:imp:082:10`, where Chinese used a full-width digit for the place name Five Isle Meadow. The existing numeric test rejected it. The revised place name spells out the ordinal in Chinese. Also corrected older numeric spelling exceptions so the same numeric check runs on every translated row.
- Replaced literal Chinese `以太` with the glossary’s PP-recovery item name in the Kanto guide and its generation rules. Aligned Full Heal with the glossary’s Chinese `万灵药`. Preserved the Itemfinder and Flash entries’ distinction between species marked as Owned and those marked as Caught in the Pokédex. The in-game thresholds themselves remain candidates for verification.
- Restored explicit successive movement instructions around Viridian City and Forest and on the Littleroot–Oldale return path. Numeric checks enforce the token order. An additional regression checks the association of each movement count and direction in the Johto ice puzzle.
- Localized previously English chapter headings, including the Sevii Islands, named buildings, seasonal headings, and Shoal Cave tide windows. The Storyline Tracker, regional guide browser, Storyline popout and guide search share the chapter display function. Imported chapter text is preserved. Checked Spanish and Chinese name choices against the bundled glossary and existing regional terminology references. [52Poké place-name crosswalk](https://wiki.52poke.com/zh-hans/地点列表（在其他语言中）) · [WikiDex names in other languages](https://www.wikidex.net/wiki/Lista_de_localizaciones_en_todos_los_idiomas)
- Localized the shared guide timer and team controls, timer state labels, bundled and milestone source options, Storyline popout controls and progress labels, and source tooltips and accessible names. The underlying timer, run, guide and region identifiers remain canonical.
- Removed an older duplicate declaration of the Home feed connection hint, keeping the wording that was already displayed at runtime. The source inventory now fails on a duplicate catalog ID. An unknown UI translation key formerly could resolve an inherited JavaScript property. Catalog lookup now checks that each key belongs to the dictionary before applying the existing English and key fallbacks.
- The phrase generator now checks its existing catalogs for duplicate IDs, malformed rows and missing or changed canonical sources before writing. Valid previous entries take priority over generation. Run `node tools/localization/build-walkthrough-phrases.mjs --check` to check the generated catalog without rewriting it.
- Both Argos offline model samples mistranslated movement or game terminology, including Strength and PP Up. Their output was excluded from both catalogs. The build carries no translation model or translation-service dependency.

### Gameplay and terminology review still needed

- `johto:imp:074:07` is still English because “Go west in the portal” could mean movement after warping or entering a second portal on the west side. Confirm the Bell Tower warp path before authoring this entry.
- Confirm the Lake of Rage Wednesday conditions at `johto:imp:048:10` and `johto:imp:052:00`, the ribbon requirements at `johto:imp:052:06` and `johto:imp:053:02`, and the Tuesday Route 29 prerequisite at `johto:imp:053:00`.
- Confirm the reference clock for the two Shoal Cave tide windows and the Sinnoh Pokédex threshold at `sinnoh:imp:034:00`. The data retains the original tide and quest instructions.
- The Sinnoh heading “Fight Arena” appears to refer to the Fight Area. The display label uses the regional name and leaves the original heading intact.
- Ask Spanish-speaking and Simplified Chinese-speaking players to review newer and legacy item names, local naming for PokeMMO-specific locations, ribbons, and Trainer classes. No native-speaker or gameplay validation was performed.
- The credits record permission to include the original walkthroughs. Authorization for translations and redistribution of derivative versions is still unconfirmed. The project’s existing reference-data and asset redistribution conditions still apply. See [Credits and sources](../../CREDITS.md).

## Changed files

| Area | Files |
|---|---|
| Catalog and fallback | `ui/js/ui-strings.js`, `ui/js/i18n.js`, `ui/js/core.js`, `ui/js/game-locale.js`, `tools/localization/audit-ui.cjs` |
| Guide and timer UI | `ui/js/guide-extras.js`, `ui/js/pages/guides.js`, `ui/js/pages/timers.js`, `ui/js/popouts.js` |
| Walkthrough entries and generation | `ui/js/walkthrough-locales.js`, `ui/js/walkthrough-generated.js`, `tools/localization/build-walkthrough-phrases.mjs` |
| Regression tests | `tests/test_walkthrough_locales.py`, `tests/ui/test_ui_localization.py` |
| Documentation | `docs/build/27-WALKTHROUGH-CONTINUATION.md`, `docs/build/28-LOCALIZATION-AUDIT.md` |

## Verification

- The initial full run recorded 530 passes, 51 skips, and one failure on `kanto:imp:082:10`. A separate focused run reproduced the same failure on the clean upstream checkout at `ee451d7`. The corrected catalogs pass the expanded ID, hash, numeric, encoding and Johto puzzle tests. The generator check, JavaScript syntax checks, Python compilation and `git diff --check` passed.
- Browser automation used fresh profiles in a loopback-only network namespace. The application route matrix covered 477 combinations of 53 destinations, three widths and three languages. The popout matrix covered 153 combinations of 17 tools, Compact, Standard and Expanded modes and three languages. The Storyline checks used an active character run.
- The complete clean-profile suite, started at `c63b3ab` before the final Kanto wording adjustment, finished with **543 passed, 51 skipped** in 247.95 seconds. All skips required an opt-in client dump (46) or ROM (5). The final revision `6a522e0` passed all 23 localization-focused tests in 106.42 seconds. The user’s locally available reference dump passed all 14 marked golden tests. The dump was used only by the local test suite.
- The unsigned Linux x86-64 AppImage verified 4,467 packaged UI and game-data files against the source checkout. It passed its self-check and offscreen native Qt smoke in a loopback-only namespace. The smoke switched from English to Spanish to Simplified Chinese, displayed the Johto walkthrough and Chinese Pokédex, loaded Companion Han, and preserved the Chinese preference and a saved Johto checkmark through full shutdown and restart. The controlled offscreen test disabled the Chromium sandbox because the isolated namespace mapped the test user to root.
- Visual inspection used browser captures of Home, Charizard’s Pokédex detail, Type Matchups and Phenomena. The 12 captures confirmed that Spanish accent marks and Chinese glyphs rendered and exposed English in the Charizard details and the Live header. The bundled font includes the Han characters in the changed catalogs. A control-by-control visual review and native Windows testing remain open.

The offline model sample did not meet the translation quality requirement, and the remaining text still needs source-by-source translation and review. The audit commit and local QA package preserve the verified changes. The remote branch and release state are unchanged.

The local QA folder includes the checksummed AppImage, full and focused test logs, native smoke log, screenshots, source inventory and rendered fallback inventory.
