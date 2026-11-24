# PokeMMO Companion

An unofficial desktop companion for PokeMMO on **Linux and Windows**: Pokédex, encounter locations, guides with
timers and teams, calculators, Alpha/Swarm reports and floating tools you can keep next to the game.

**Status:** v0.1.0 development preview on `develop`. No public release yet — the owner decides when.
Unofficial community project, not affiliated with PokeMMO.

## Install

**When a release exists** (players): download one file from the GitHub *Releases* page — no Git, terminal or
Python needed.

* **Linux** (CachyOS, KDE Plasma and others): download `PokeMMO-Companion-<version>-x86_64.AppImage`, make it
  executable (right-click › Properties › *Is executable*, or `chmod +x`), double-click.
* **Windows**: download `PokeMMO-Companion-<version>-windows-x86_64.zip`, extract it anywhere, run
  `pokemmo-companion.exe`.

Uninstall: delete the AppImage / the extracted folder. Your personal data is kept separately (below) and is only
removed if you delete that folder yourself. Optional startup entries are removed in
*Settings › Startup & game › Remove all startup entries* first.

> Packaging scripts exist (`packaging/`) but no package has been built or tested yet.

**Development preview (today, Linux):**
```bash
git clone -b develop https://github.com/haqzo/PokeMMO-Companion.git && cd PokeMMO-Companion
./scripts/setup-venv.sh   # optional: PySide6 for native floating windows (else it runs in your browser)
./run.sh
```
Updating a development checkout: close every Companion window (including floating tools) and quit it from the
tray, then `git pull --ff-only` and `./run.sh`. Windows development: `run.ps1` (untested).

## First start
Everything works immediately and offline. Built in, with nothing to import:
* PokeMMO reference data — 649 species, 559 moves, 2,090 items, 629 locations, 33,405 encounter rows from the
  client of 16 Nov 2026 (dataset counts, not a claim that everything is obtainable);
* Pokémon artwork — Gen V sprites for all 649 species and 82 alternate forms, normal and shiny, static and
  animated, plus 94 female variants (see *Assets and data*);
* item icons — PokeMMO's own icons for 2,083 of the 2,090 item groups;
* the complete Kanto, Johto, Hoenn, Sinnoh and Unova walkthroughs (by their original author, with permission).

A short, skippable *Welcome* on Home lets you pick a language, find PokeMMO, turn on Alpha/Swarm alerts, test a
notification and try a floating tool. No ROMs, dumps, sprite packs or developer tools are needed. Importing your
own PokeMMO client files or sprite library is optional (*Settings › Advanced*).

## Make it yours
* **Themes** (*Settings › Appearance & themes*) — Catppuccin Mocha, Tokyo Night, Companion Default (the
  default), Graphite, Arctic, Emerald, and Custom. Hover a theme to preview it, click to use it. Every colour
  (backgrounds, sidebar, cards, dialogs, inputs, text, accent, links, buttons, hover/selected, borders, focus,
  tables, progress bars, success/warning/error, notifications, popouts, scrollbars, optionally the 17 type
  colours) has a colour picker, a hex field, opacity where it makes sense and a reset to the preset value.
  Readability warnings appear when text gets hard to read; they never block a choice. Save as many personal
  themes as you like (rename, duplicate, delete), export them as a small `.json` file to share, import theirs.
  Theme files hold colours and numbers only — imports with anything else are cleaned or refused. Changes show
  at once in every open window and floating tool.
* **Layout & scaling** — text size (60–200 %, text only) and interface scale (75–150 %, everything in the main
  window, applied once on top of your desktop scaling), font weight, density, card padding, gaps, table rows,
  borders (on/off, thickness, opacity), corner radius 0–20, sidebar width and labels, scrollbars.
* **Pokémon & sprites** — Static or Animated per place (Pokédex grid, summary, Roaming Legendaries, active and
  expired Alpha/Swarm reports, report history, Location Explorer, teams, comparison) with sizes, and one
  *Animations* switch (system / on / off) that overrides them all. Floating tools have their own sprite size
  and animation choice in their text-size menu.
* **Home** — show, hide and reorder sections; *Reset Home layout*.

## Pokédex, summaries and Type Matchups
* The Pokédex has **Normal / Shiny** and **Static / Animated** switches: one click shows every Pokémon shiny.
  It is display only — nothing is marked as caught or owned, and your search, filters and scroll position stay.
* Summaries have the same two switches (plus ♂/♀ where a female sprite exists).
* **Type Matchups › Compare two Pokémon** (main window, beside the chart; below it in narrow windows): search by
  name or number, including battle forms; both Pokémon's types against each other, weaknesses, and each one's
  learnable moves against the other with type, category, power, accuracy, PP, how it is learned, effectiveness
  and STAB — filter, sort, and pick up to four per side. Abilities that change a matchup (Levitate, Volt Absorb,
  …) are named, never applied silently. It is not a battle simulator: no damage, speed or winner.

## Using it with PokeMMO
*Settings › Startup & game* (all optional, all removable):
* **Launch PokeMMO** — detects the Flatpak (`com.pokemmo.PokeMMO`), standalone Linux launchers and Windows
  installs, or use the launcher you choose. PokeMMO is never started twice and never closed by Companion.
* **Start Companion at login**, optionally minimised to the tray; **reopen the floating tools** you had open.
* **“PokeMMO + Companion” shortcut** that starts both.
* **Open Companion automatically when you start PokeMMO** — the first option on the page. A tiny helper starts
  with your login (and right away when you turn it on) and opens Companion when the PokeMMO process appears,
  however you started the game. It only looks at the process list. Companion cannot open by itself if both it
  and this helper are closed; turning the option off also stops the helper.
* **When PokeMMO closes**: keep running (default), minimise or quit Companion.

Only one Companion runs at a time; starting it again brings the open window forward. Pressing *Launch PokeMMO*
several times, or using the shortcut while Companion also launches the game, still starts only one client.

## Guides
*Guides › All guides* shows the five regional walkthroughs — browse them without a character run — and your own
guides with category shortcuts (gym and Elite Four reruns, money-making, farming, shiny hunting, daily routines,
…). A character run is only needed to tick steps; each run keeps its own progress, separate from the bundled
text, so guide updates never erase it.

## Floating tools, window sizes and displays
Most tools can pop out into their own window (draggable, resizable, compact / standard / expanded). Every page
adapts to the window: the sidebar turns into icons in narrow windows (or by preference), lists and tables
scroll inside their own areas, dialogs keep their buttons visible. Layout follows the real window size, your OS
display scaling and Companion's text size — no restart needed. Windows that end up off-screen after a monitor is
unplugged or a resolution change are moved back automatically.

**KDE Wayland:** native Wayland does not let applications pin windows on top or place them. Companion therefore
starts through XWayland on KDE by default (*Settings › Windows & popouts › Window backend*). On native Wayland,
pin and saved positions are unavailable.

## Automatic updates (three separate things)
* **Official PokeMMO news** — the official Updates forum is checked at start-up when stale and then every 3 h
  (adjustable). New posts appear with their official title, date and link; summaries are never invented.
* **PokeMMO reference data** — signed data packages can update the built-in data without a new app version,
  with checks before activation and the previous data kept for rollback. *Not set up yet: no approved data
  location exists; the built-in data is used.*
* **Companion itself** — published GitHub releases are checked (stable or pre-release channel). Companion
  never installs or restarts by itself and never offers development builds.

Offline, everything except these checks and the optional Alpha/Swarm feed keeps working.

## Closed alpha

**Live → Phenomena** is an offline Unova encounter reference. Find current callouts and location pictures in `#phenomenon-callouts`. [PokeMMO Companion Discord](https://discord.gg/5Wbh28M3gu) · [Alphapedia](https://alpha.pokemmotools.org/)

[Tester guide](docs/closed-alpha.md) · [Standalone build instructions](packaging/README.md)

## Backups
*Settings › Backup & recovery*: complete backups (.zip with your pictures) of notes, collection, showcases, guides
with cycles and history, character runs and storyline progress, teams, timers, presets, map marks, settings and
window positions, themes and personal themes, sprite and layout preferences. Automatic daily backups (7 kept), restore preview, merge or replace, safety copy first.
Personal data folder: `~/.local/share/pokemmo-companion` (Linux), `%APPDATA%\PokeMMO-Companion` (Windows).

## Troubleshooting
* **Nothing opens / blank window** — try `./run.sh --browser`; *Settings › About & credits › Save
  diagnostics* writes versions and a log with private details removed (nothing is sent anywhere).
* **Pin / position doesn't work on KDE** — use the XWayland window backend (default on KDE).
* **“already running”** — Companion is open (maybe in the tray); the existing window was brought forward.
* **Restore a backup** — *Settings › Backup & recovery*; your current data is saved before any restore.

## What it never does
No encounter counter (PokeMMO has one), no game memory reading, injection, packet interception, macros or
automated input, no GTL scraping or account login, no telemetry.

## Community
Questions, beta testing, ideas and release news: the **PokeMMO Companion Discord** —
https://discord.gg/5Wbh28M3gu. Joining is optional: Companion never needs a Discord account, and the small link on
Home can be hidden in *Settings › Home*. New releases are announced there automatically.

## Documentation
Build reports and decisions: [`docs/build/`](docs/build/README.md) — latest:
[22 — safe shutdown, comparison polish, community Discord](docs/build/22-SHUTDOWN-COMPARISON-DISCORD-LIVE.md) (after [21](docs/build/21-NATIVE-BETA-FIXES.md), [20 — beta preparation](docs/build/20-BETA-PREP-THEMES-ASSETS.md)). Design: [`docs/design/`](docs/design/README.md).
Research: [`docs/research/`](docs/research/README.md).

## Branches
`main` — approved releases only. `develop` — ongoing work.

## Assets and data
The repository contains reference data derived from the PokeMMO client, PokeMMO item icons, region map images,
Gen V Pokémon sprites (PokeAPI/sprites) and the five regional walkthroughs, included by the owner's decision;
redistribution permissions for the sprite images and client assets are not established (see
[CREDITS](CREDITS.md) and docs/build/20). It contains no ROMs, personal dumps or proprietary string tables.
