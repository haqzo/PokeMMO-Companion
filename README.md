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
Everything works immediately and offline: the PokeMMO data (649 species, 559 moves, 2,090 items, 629 locations,
33,405 encounter rows from the client of 16 Nov 2026) is built in. A short, skippable *Welcome* on Home lets you
pick a language, find PokeMMO, turn on Alpha/Swarm alerts, test a notification and try a floating tool.
No ROMs, dumps, sprite packs, character profile or developer tools are needed. Importing your own PokeMMO client
files is optional (*Settings › Data & privacy*) and only adds your client's sprites and icons.

## Using it with PokeMMO
*Settings › Startup & game* (all optional, all removable):
* **Launch PokeMMO** — detects the Flatpak (`com.pokemmo.PokeMMO`), standalone Linux launchers and Windows
  installs, or use the launcher you choose. PokeMMO is never started twice and never closed by Companion.
* **Start Companion at login**, optionally minimised to the tray; **reopen the floating tools** you had open.
* **“PokeMMO + Companion” shortcut** that starts both.
* **Start Companion when PokeMMO starts** — a tiny helper started at login. Companion cannot start by itself
  if both it and this helper are closed.
* **When PokeMMO closes**: keep running (default), minimise or quit Companion.

Only one Companion runs at a time; starting it again brings the open window forward.

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

## Backups
*Settings › Backup & recovery*: complete backups (.zip with your pictures) of notes, collection, showcases, guides
with cycles and history, character runs and storyline progress, teams, timers, presets, map marks, settings and
window positions. Automatic daily backups (7 kept), restore preview, merge or replace, safety copy first.
Personal data folder: `~/.local/share/pokemmo-companion` (Linux), `%APPDATA%\PokeMMO-Companion` (Windows).

## Troubleshooting
* **Nothing opens / blank window** — try `./run.sh --browser`; *Settings › About & diagnostics › Save
  diagnostics* writes versions and a log with private details removed (nothing is sent anywhere).
* **Pin / position doesn't work on KDE** — use the XWayland window backend (default on KDE).
* **“already running”** — Companion is open (maybe in the tray); the existing window was brought forward.
* **Restore a backup** — *Settings › Backup & recovery*; your current data is saved before any restore.

## What it never does
No encounter counter (PokeMMO has one), no game memory reading, injection, packet interception, macros or
automated input, no GTL scraping or account login, no telemetry.

## Documentation
Build reports and decisions: [`docs/build/`](docs/build/README.md) — latest:
[19 — release preparation](docs/build/19-RELEASE-PREPARATION.md). Design: [`docs/design/`](docs/design/README.md).
Research: [`docs/research/`](docs/research/README.md).

## Branches
`main` — approved releases only. `develop` — ongoing work.

## Assets and data
The repository contains reference data derived from the PokeMMO client and region map images, included by the
owner's decision; distribution permissions are not established (see docs/build/17 and 19). It contains no ROMs,
personal dumps, proprietary string tables or walkthrough documents.
