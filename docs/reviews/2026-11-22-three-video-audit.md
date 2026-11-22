# v0.1.0 — Three-video audit, 22 November 2026
**Status:** Review findings, not fixes. **User evidence:** three privately supplied KDE Plasma 6.8 / Wayland recordings. **Code snapshot:** `develop` at `cfc0c8981befcd861a0022cb4e0a964653507561`.
**Review method:** Entire timelines covered by time-indexed frames at 1-second intervals, overview contacts every 4 seconds, and full-resolution targeted screenshots for important behaviors. Frame decoding spans all recordings; this is not a claim that each of ~35,800 individual 60fps frames was manually read. Video media/screenshots are intentionally **NOT committed** to public GitHub.

## Core user feedback (accepted as requested corrections)
- The current Pokedex feels unlike the **actual in-game PokeMMO Pokédex**; includes unavailable legendary/mythical Pokémon as ordinary entries (specifically Virizion, Tornadus, Thundurus, Landorus, Keldeo), and overstates compatibility/availability. Data correctness takes priority over decorative polish.
- Home should feel like a real, useful, well-designed Home, not a few sparse cards with a giant dark blank area. Existing **Official Events and Changelog details are LIKED** and must be preserved.
- Type chart needs **both row AND column** focus on interaction, with clear attacker->defender direction and selected matchups.
- Pokédex popout stops at first 60. Popout Compact/Standard/Expanded must each set a useful default **size**, and **all remain independently freely resizable**. Cards/layout must truly reflow when density or window width changes.
- Pokémon details/summary, settings, tools, sidebar shortcuts and general readability need a consistent coherent second pass. Wants **draggable/pinnable quick access to favourite tools on the vertical sidebar**, also usable with horizontal nav.
- **Alpha/Swarm toast default top-right**, but existing user-selectable corner setting must remain.
- **No repeated manual game-dump import**. Prefer a populated, accurate, locally usable PokeMMO data experience out-of-the-box. Find a legally/technically sound asset/data delivery path. Do NOT commit proprietary raw game dump/sprites without permission.
- Home news/event lists should **refresh automatically with honest source/verification status**, not only on user pressing Check forum.
- Keep project **v0.1.0 on develop** until user sees refined footage and approves progression; Claude should code fixes, ChatGPT should inspect/research/test. No new branches, no main merge, no premature release.

## VIDEO 1 — Screencast_20261122_183119.webm (05:07.548)
| Approx time | Observed evidence / concern | Action |
| --- | --- | --- |
| 00:00–00:16 | Onboarding modal displayed over an already compact main app; a test notification appears at desktop corner; landing layout is small within a large desktop | Clean first-use UX and empty/loaded state; do not permanently use import prompt as a major Home component |
| 00:16–00:28 | Home shows update/event/Live/Continue cards only in upper part of app. On expanding window large areas remain unused | Adaptive Home hierarchy, featured latest update, clear actions, functional quick tools rather than padding |
| 00:28–01:10 | Settings Data & Privacy, Appearance, font scale/navigation toggles shown. Settings cards/narrow columns and tiny copy; clear basic navigation works | Improve settings density/readability; retain settings persistence |
| 01:12–01:28 | Home, Live altering cave and legendary views; no obvious fake current cave; content sparse | Keep source uncertainty; strengthen secondary content and contextual actions |
| 01:28–01:35 | Guides opens an empty first-run create-run panel, most area unused | Richer guide onboarding, clear 'Create named run', sample current-step demo labelled demo; actual guides must remain evidence-backed |
| 01:36–01:47 | Tools landing: three small grouped columns across upper part, huge empty lower workspace | Improve full-height utilization and tool discovery; add sidebar Quick Access customization |
| 01:48–02:21 | Pokédex grid scrolls continuously but many miniature cards and tiny labels; 649 content shown without PokeMMO in-game availability differentiation | Correct game roster/encounter classes first, then density and visual hierarchy |
| 02:32–02:55 | Alpha/Swarm opt-in prompts, TEST notification and desktop notification observed in screenshots; keyboard/focus behavior NOT proven solely by these frames | Preserve explicit opt-in and TEST labels; set default corner top-right; verify click/focus/stacking separately |
| 02:56–03:36 | Reports popout is separate and can be moved/resized. Significant unused popout space after height changes; no sense that display modes apply optimized sizing | Purposeful preset sizes plus independently responsive layouts and persisted custom manual geometry |
| 03:40–04:18 | Natures then Type Matchups; chart labels/cells are tiny, focus is confusing when hovering; popout looks cramped | Sticky, selectable two-axis matrix, labels/legend and offensive/defensive explanation; popout should adapt |
| 04:20–05:07 | Pokédex main plus a small popout; user scrolls/moves/resizes popout and cannot reach all entries. Visual density remains a small card grid | Remove hard cap and provide full scroll/window-size responsiveness; selected species details must work |

## VIDEO 2 — Screencast_20261122_183841.webm (03:48.331)
| Approx time | Observed evidence / concern | Action |
| --- | --- | --- |
| 00:00–00:19 | Main Pokédex with Bulbasaur detail panel (sprite/name/type, tab bar, stats and metadata). Popout detail can be open alongside main; content appears cramped/dense and visually plain | Rework Pokémon summary to echo PokeMMO's Summary / Moves / Base Stats / Wild Locations / Evolution Tree / Type Matchups; expose provenance without a swarm of badges |
| 00:19–00:42 | Navigation away from selected species to Home/Guides/Tools; empty Guide and top-aligned Tools cards obvious | Preserve navigational state, make Guide/Tools purposeful |
| 00:42–01:09 | Main app widened; tools still occupy small top row with large blank area | Responsive content widths/utility highlights, not artificial filler |
| 01:12–01:21 | Live Reports and Altering Cave; minimal content but honest unknown state | Preserve source confidence and dated reports |
| 01:24–01:44 | Pokédex grid/Home and in-app latest changelog details; News/Events content is useful | Keep current functional article detail and event logic; redesign around, not discard |
| 02:00–02:21 | Settings Windows & Popouts, Notifications and Data & Privacy; table of many sliders feels dense and low-contrast | Group by tool and provide clear global presets with per-tool overrides. Preserve all existing options |
| 02:24–03:48 | Pokédex scrolls deeply while separate popout remains restricted to its miniature subset; labels are small and modes do not affect actual window sizes | Explicit no-cap popout pagination/virtualization; independent compact/standard/expanded sizes with user override |

## VIDEO 3 — Screencast_20261122_184332.webm (01:00.793)
| Approx time | Observed evidence / concern | Action |
| --- | --- | --- |
| 00:00–00:08 | PokeMMO opens; separate small Companion Pokédex popout remains visible above game. This is promising visual evidence of floating window behavior, NOT proof of every always-on-top/fullscreen/notification capability | Preserve and regression-test Qt/XWayland popouts; distinguish tested environment from universal guarantee |
| 00:08–00:28 | In game near Route 116 (autumn/night); small Companion Pokédex popout repeatedly repositioned/resized over map. Background opacity lets game remain visible | Preserve smooth free resize/opacity without text becoming unreadable |
| 00:28–00:56 | **Side-by-side in-game PokeMMO Pokédex and Companion**. In-game National Pokédex has tiny numbered species sprites/silhouettes, a Nation/Advanced Search/tier/ownership control row, and registration-colour borders. Companion instead shows larger generic all-species cards with names and types. In-game counters visible: **Seen 436/604, Owned 216/603, Caught OT 187/603, Caught Alpha 14/362, Owned Shiny 7/603, Owned Costumes 1/12**. These are account-specific, as recorded that day, not automatic data our tool has access to | Use screenshots as a golden UX reference for ordering, release set, silhouette, statuses, filtering, tiers and counts. Don't hardcode those numeric denominators or pretend we know this user's personal progress |
| 00:36–00:52 | PokeMMO's in-game list shows National numbers even where no Pokémon sprite is unlocked; entries are not all shown as fully registered. Companion renders all available icons as if registered | Distinguish species reference catalog vs in-game Pokédex progress; use manual status/import only with permission |
| 00:56–01:00 | Real game remains playable beside popout; no severe failure visible | Preserve core separate-window concept and minimize feature churn |

## Confirmed code-level root causes and file pointers
1. **Roster scope:** `companion/services/dex.py` reads bundled `companion/data/species_index.json` for **1–649**, and `ui/js/pages/pokedex.js` displays everything by default. `_availability()` infers "Wild (dump)" from location rows, with a few `SPECIAL_ACQUISITION` hardcodes; there is **no versioned PokeMMO in-game dex membership/availability source of truth**. The dump's `obtainable` flag is not equivalent to released/permanently obtainable/OT catchable.
2. **Exact 60 bug:** `ui/js/popouts.js` `pokedex()` renders `.slice(0, mode === 'expanded' ? 200 : 60)`. Replace hard cap with complete filtered list and virtual scrolling or pagination tied to actual scroll, not mode.
3. **Type focus:** `ui/js/pages/tools.js` `renderTypeChart()` attaches `mouseover` targeting only `[data-col]`; no row highlight or locked cell focus. `ATK ↓ DEF →` exists but is hard to read at current size.
4. **Window size:** `companion/shell/qt_shell.py` `Popout.set_mode()` changes button text/settings but **does not resize window to a mode-specific starting size**; `restore_geometry()` chooses a single tool default. `ui/js/popouts.js` adjusts rendered content in several tools but with limited true density behavior.
5. **Default toast corner:** `companion/settings.py` defines `notify.toast_corner = 'bottom-right'`, though UI already supports `top-right`.
6. **Home manual feed:** `companion/services/news.py` network check only runs on explicit button via `ui/js/pages/home.js`; no scheduled refresh of validated official article/event summaries. Existing source snapshot is dated.
7. **Design baseline:** `ui/css/tokens.css` values were sampled from screenshots, not actual user's Better Default theme files; `ui/css/app.css` home/tools layouts top-align small cards over a large dark workspace. Native `qt_shell.py` uses a separate hardcoded QSS palette: new app design must keep **native titlebars, toasts and webview** visually consistent.
8. **Sidebar shortcuts:** `ui/js/shell.js` draws exactly five destinations with no configurable pinned-tool section. Home supports shortcuts, but not draggable/favourite Tools quick access in sidebar.
9. **Data delivery:** `companion/services/importer.py` and `companion/services/dex.py` require imported private user data for full Pokédex. App's `README.md` currently says import manually. Design one-time auto-detect/consent solution or lawful app-shipped metadata + permitted sprites so normal users aren't forced into a raw dump import workflow.

## PokeMMO-specific ground truth and warnings
- **Most important:** The user's *actual 22 Nov 2026 in-game screenshot* shows different Dex totals for different registration measures. This should define initial visual/account-state model, not universal fixed roster numbers. Compare with actual game data version before assuming `604` is global or permanent.
- **Official Shiny Wars 2026 changelog:** PokeMMO expanded Pokédex search by egg group, primary/secondary type, abilities, held items, base stats and **ownership status** (unregistered/seen/owned/caught OT/caught Alpha/Shiny); Summary gained gender ratio, exp group and catch rate, species Type Matchups view. Source: https://forums.pokemmo.com/index.php?/topic/199536-changelog-shiny-wars-2026/ ; indexed official content was retrieved in research, but full forum page may block access. Must cross-check against in-game screen.
- PokeMMO-specific Wiki describes several late Gen V legendary/mythical species as *currently not in the game Pokédex or cannot be encountered*, including Virizion, Tornadus, Thundurus, Landorus and Keldeo (page version might lag events): https://pokemmo.shoutwiki.com/wiki/Pok%C3%A9mon . **Validate dated inclusion/temporary acquisition, do not assume absolute never-obtainable.**
- PokeMMO Pokédex categories are not mere cosmetic badges: seen, owned, caught OT, caught Alpha, owned shiny and costumes have different definitions and per-character data: https://pokemmo.shoutwiki.com/wiki/Pok%C3%A9dex .
- The user supplied *manual video of current game*; if a generic community database disagrees with the game, prefer current in-game evidence + official official patch notes.
- Do not copy full PokeMMO art/dump/client files to a public GitHub repo without permission. Automatic *local* import from user-selected/current installation/dump path, independent authored/licensed game metadata, or a separately permitted asset solution may reduce friction. Never pretend the illegal/impossible part is already solved.

## Where tests remain incomplete
Videos provide proof of visible layout and some popout behavior, **not automated test pass** for pin/window geometry across monitors, exact alt-tab focus, Windows, exclusive fullscreen, saved settings after restart, breeding formula outcomes, actual game-data accuracy, permissions for live alpha feeds, or guide content migration. Regression tests and user confirmation required.

## Priority order
**P0/game trust:** Correct PokeMMO roster/availability and exact Dex roles; remove 60/200 popout caps; clarify unsupported data; ensure no false wild/current or type claims.  
**P1/visible UX:** Actual three window size presets + free resize, genuine type XY crosshair, Home editorial hierarchy and accessibility, improved Pokémon Summary, quick access sidebar.  
**P2/polish:** Consistent palette/controls/QSS, grid-density slider, advanced filter ergonomics, settings spacing; scheduled official news refresh, regression tests and QA.  
News/event detail behavior and existing toast position choice already work well; **preserve them**.
