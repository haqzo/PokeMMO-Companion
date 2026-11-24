# 19 — Release preparation pass (`develop`, v0.1.0, 2026-11-24)

Base `07c36f7`. main untouched, no release, no version bump. Owner approved the map-free Location Explorer.

## What changed
| Area | Change |
|---|---|
| Visual cleanup | Technical verification badges (DUMP_ONLY, CORROBORATED, “Community cycle”, “Dump only”, …) replaced by one discreet ⓘ whose tooltip/click explains the source in plain words (`sourceInfo()` in `core.js`). Provenance stays on every record. Version moved out of the sidebar (About keeps it). Live: one “feed is off” message instead of three; delivery details in a tooltip. Pokédex: explanation of the 649 reference list in an ⓘ. Stale “import your dump” wording removed app-wide (UI and API texts). |
| Responsive layout | Sidebar icon mode from the real window width (< 900 px × text scale) or the *Sidebar labels* preference; whole sidebar scrolls on short windows. Container queries on `.page`/`.popout-body` collapse two-column layouts, settings navigation, notes, tool grids by the *content* width. All fixed `minmax(Npx, 1fr)` grids capped at 100 %. Dialogs: header and buttons fixed, body scrolls. Tables are wrapped automatically in their own horizontal scroll box. |
| Location Explorer | Wide: filters, directory and detail scroll independently in the window height. Medium: filters fold behind a *Filters (n)* button, search always visible. Narrow: detail replaces the directory; *All locations* returns to the same scroll position with the card focused. The top visible card stays in view across resizes. Encounter tables keep a readable minimum width and scroll sideways locally. |
| Official news | Bundled summaries and feed posts merged by forum topic id → *Latest official update* is the newest **live** changelog/hotfix, bundled or newly discovered (title, date, link only — nothing invented). PTS never counts as live. Title and content edits detected (description hash, text not stored). Retry back-off 5/15/60 min, stale flag, last successful check. Events: Upcoming / Running (by schedule) / Ended / Cancelled / Dates unconfirmed. |
| Guide popouts | Storyline and My Guides popouts: guide and step timers (same TimerService timers, start/pause/resume/reset, remaining time) and the linked team, in a collapsible *Timers & team* section. *Clear finished* removes finished, non-repeating timers of earlier cycles only. |
| Backups | Complete backup archive (.zip): JSON + pictures + SHA-256 manifest. Automatic background backups (default daily, 7 kept; 10 manual, 15 database copies). Restore preview; merge remaps ids (copied runs carry their storyline extras and timers; conflicting teams are copied and the imported guides point to the copy; natural-key documents such as map layouts keep the newer one); replace needs explicit confirmation; safety copy first; an interrupted restore is finished at the next start (`restore-in-progress.json`). |
| Reference data | `companion/services/refdata.py`: signed (Ed25519) index from one approved https URL, package SHA-256 from the signed index, size / entry / decompression limits, only JSON files allowed, validation + coverage guard in `staging/`, atomic activation, `previous/` kept, rollback, built-in fallback. **Off: no approved endpoint or key configured.** Maintainer tool `tools/reference_package.py` (keygen, build with baseline check, signed index). An older personal client import no longer overrides newer reference data (its sprites are still used). |
| Companion updates | `appupdate.py`: GitHub releases of haqzo/PokeMMO-Companion only, stable / pre-release channel, semver, drafts and branches never offered. Verified download needs `SHA256SUMS` + Ed25519 `SHA256SUMS.sig` and a configured key (**not configured** → release page link only). Never installs or restarts by itself. |
| Startup & game | Settings section: detect Flatpak / standalone Linux / Windows installed & portable launchers or choose one; argument-based launch, never a second PokeMMO; when PokeMMO closes keep (default) / minimise / quit; login autostart (optionally minimised), *PokeMMO + Companion* shortcut, opt-in watcher (`--watch-game`) that starts Companion when PokeMMO appears; *Remove all startup entries*. Single instance per data folder (lock + hand-over). Start minimised, reopen floating tools. |
| Welcome | Skippable Home *Welcome*: ready offline, language, PokeMMO detection/launch, Alpha/Swarm alerts + test notification, try a floating tool, automatic updates. No ROM/dump/profile needed. |
| Native windows | `shell/geometry.py` `fit_window()`: title bar always on a screen, never larger than the screen; applied when restoring the main window and popouts and when screens are added/removed or their available area changes. |
| Diagnostics | *About & diagnostics › Save diagnostics*: versions, window system, capabilities and a sanitized log (tokens, home path, user name, URL credentials/queries removed). Nothing is uploaded. |
| Packaging | `packaging/` PyInstaller spec, Linux AppImage script, Windows zip script — **written, not built** (no network/PySide6 in this environment). |

## Verified information sources (this pass)
* Alpha 75 min — official changelog / PokeMMO wiki; Swarm ~20 min — community wiki (adjustable) — unchanged.
* The live official Updates feed could **not** be fetched in this session (approval not available); news merging
  was tested with recorded fixtures. Re-check the latest official changelog before a release.
* No new PokeMMO data audit was done in this pass (availability, forms, B2/W2 content): unchanged since doc 16.

## Tests
* Backend: 300 passed + 31 skipped on a clean profile; 331 passed with the owner’s dumps and ROM folder. New: new `test_backup_v2.py` (6), `test_updates.py` (8), `test_startup_integration.py` (9),
  news merge/edits/back-off (4), timer cleanup (1).
* Browser (headless Chromium, not native Qt): new `test_ui_layout.py` — every page × 6 viewport sizes
  (1600×900 … 420×640): every visible control reachable by keyboard-style scroll-into-view, no sideways window
  scroll; sidebar collapse without reload; short-window sidebar; dialog buttons in a 700×380 window; tables;
  Location Explorer panes, state across wide → medium → narrow, Back restores position; 140 % text size.
* `tools/clean_install_check.py`: PASS (clean profile, no ROMs/dumps).

## Performance (backend, clean profile, this machine)
| | 07c36f7 | now |
|---|---|---|
| import + data load | 0.54–0.84 s | 0.55–0.67 s |
| peak RSS (backend) | ~240 MB | ~240 MB |
| /api/dex/species | 32–48 ms | ~48 ms |
| /api/locations-encounters?region=kanto | 16–17 ms | ~21 ms |
UI (headless): Home 208 ms, Pokédex 289 ms, all-regions directory 349 ms to first card; JS heap 37 MB.
A first version of the reference loader doubled start-up memory (data decompressed twice) — fixed before commit.

## Visual gaps on a clean install (owner decides on distribution)
No Pokémon sprites, form sprites or item icons ship: Pokédex, roamers, teams and encounter tables show numbered
placeholder discs until a personal client import or sprite library is added.

## Not verified (needs the owner's machines)
Native Qt behaviour of everything above, DPI 100–200 %, mixed-DPI and portrait monitors, monitor unplugging,
tray start, autostart entries on KDE, Flatpak detection on a real install, Windows (all of it), AppImage / Windows
builds, live news feed, real GitHub release check.

## Release blockers
1. Build and test the AppImage and the Windows bundle (native checklist below).
2. Decide asset distribution (client-derived data, map images) — owner.
3. Create signing keys; publish location for reference-data packages; set `REFERENCE_INDEX_URL`,
   `REFERENCE_PUBLIC_KEY`, `APP_UPDATE_PUBLIC_KEY`.
4. Re-verify the latest official changelog and news summaries.
5. Sprites/icons for clean installs (or accept placeholders).

## Native testing checklist (owner)
1. Close every Companion window incl. popouts, quit from the tray, update, `./run.sh`.
2. Resize the main window from maximised to ~800×600 and to a tall narrow window: sidebar turns into icons, nothing
   is cut off, every page scrolls; dialogs keep their buttons.
3. Location Explorer at full width / half screen / narrow: three panes scroll separately; filters fold; open a
   place, *All locations* returns to the same spot.
4. Settings › Appearance › text size 140 %: same checks.
5. Move a popout to the second monitor, close Companion, unplug or disable that monitor, start again: the popout
   opens on the remaining screen with its title bar reachable.
6. Change display scaling (125 / 150 / 200 %) without restarting: layout adapts.
7. Settings › Startup & game: Launch PokeMMO (Flatpak), press again → “already running”; enable login autostart
   (minimised), shortcut and helper; log out/in; check the tray start; *Remove all startup entries*.
8. Start `./run.sh` twice → the second brings the window forward.
9. Guides popouts (storyline + My Guides): start/pause a guide timer and a step timer, see it in Tools › Timers.
10. Settings › Backup & recovery: Back up now, Restore → preview → Merge; check notes/pictures/guides/teams.
11. Settings › About & diagnostics › Save diagnostics: open the file, check nothing private is in it.
