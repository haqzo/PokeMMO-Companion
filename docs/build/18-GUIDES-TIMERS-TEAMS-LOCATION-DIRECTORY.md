# 18 — Location directory, unified Guides, guide timers, Team Builder v2, Alpha/Swarm animation (`develop`, v0.1.0)

**Date:** 2026-11-24 · **Base:** `72ac96c` · main untouched, no release, no version bump.

## 1. Location Explorer: a directory, not a map
The player UI no longer shows interactive maps (no canvas, zoom/pan, hover rings, click areas, map editing, map style
or map setup). Kept: every map asset (`companion/data/maps/**`, `geometry.json`), the map build tools
(`tools/mapgen/`), the `/api/maps…` endpoints, `ui/js/mapview.js` (unused) and personal map marks (`region_maps`).

* Region tabs Kanto · Johto · Hoenn · Sinnoh · Unova · All regions; Kanto has a Mainland / Sevii Islands switch.
* Categories: All · Routes · Towns & cities · Caves · Forests · Islands · Special areas (from the location kind and
  name; a place can be in more than one). Natural sort (Route 2 before Route 10).
* Place cards come from the companion map's grouping (one card per place, e.g. Mt. Moon with its floors);
  locations not in any group get their own card, so every bundled location is reachable (see coverage below).
* Search by place, Pokémon search across regions (tab counts), filters for type, encounter method, time of day,
  season and hordes; result count; *Clear filters*.
* Detail beside the list on wide windows, replacing it (with *All locations* back button) below 980 px (760 px in
  popouts). Floors/sections are separate tabs. Encounter tables unchanged (Serebii-style: sprite, types, levels,
  method, morning/day/night, season, percentages only where the data has them, otherwise rarity labels, hordes, lures).
* Popout keeps compact / standard / expanded.

## 2. Guides: one destination
`#/guides` (All guides) · `#/guides/storyline` · `#/guides/mine[/<id>]`.
Old routes still work: `#/tools/cguides[/<id>]` redirects to `#/guides/mine[/<id>]` (bookmarks, notes links,
Quick access); `#/guides?region=…` and `#/guides?jump=1` open Storyline. The *My guides* card was removed from Tools
(the Quick access entry keeps its id `cguides`, now pointing to `#/guides/mine`).
My Guides never need a character run. New categories: Elite Four rerun, Money-making, Farming, Shiny hunting,
Daily routine (plus the existing ones). Runs, cycles, history, notes, links, images, import/export and popouts unchanged.

## 3. Timers in guides
* **Templates** (name, h/m/s, repeat, sound, notification) are stored with the guide in a `guide_extras` document
  (key `cg:<guide>` or `story:<run>:<region>`): guide-level timers and per-step timers (`step_timers[step id]`).
* **Start** (always a click) creates a timer in the existing TimerService with an `owner`
  `{kind: "guide", guide, step, run, cycle, template, label}`. TimerService stays the single source of truth, so the
  timer survives navigation, closing popouts, minimising, sleep and restart; it shows in Tools › Timers with a chip
  naming its guide, and completion notifications/sounds fire once, respect Do not disturb and open the guide.
* Different runs and different cycles never share a timer (the owner includes run and cycle). Finishing a cycle
  does not touch running timers; they are listed under *Other timers of this guide (earlier cycles or attached)*.
* *Attach existing* moves a standalone timer under a guide without changing its time; detaching returns it.
* A finished timer never ticks a step.
* **User presets** (Tools › Timers › *Save as preset*, documents kind `timer_preset`) are offered in Tools › Timers and
  in the guide timer dialog.

## 4. Team Builder v2
Team documents (kind `team`) gain `version: 2`, `purpose` (Gym reruns, Elite Four, PvP, Storyline, Custom), team notes and
optional per-slot details (form, level, nature, ability, held item, up to 4 moves, IVs 0–31, EVs 0–252 / 510 total,
notes). Validation: `companion/services/teams.py`. **Migration:** none needed up front — old teams (`slots` = species
ids) are read as-is everywhere and rewritten as v2 only when saved again.
Coverage: defensive table as before; super-effective coverage now uses the damaging moves entered (members without
moves count with their own types); a note states that abilities, items and move effects are not considered.
Guides link a team by id (`team_id` in `guide_extras`): create, attach, view, edit, replace, unlink, open in Team
builder (`#/tools/team?team=<id>`). Team builder shows how many guides use a team. Deleting a linked team leaves the
guide showing "team was deleted".

## 5. Alpha/Swarm animation
Durations re-checked 2026-11-24: Alpha 75 min (PokeMMO wiki / official changelog), Swarm ~20 min (community wiki
estimate; still adjustable in Settings › Live). No newer official figure was found.
Home animates a report's library sprite only while its estimated window is open, counted from the **earliest**
report of the group (duplicates never restart it) and only when the report carries its own timestamp; it switches to
the still image when the estimate ends (timer at the end time), and is still immediately if the estimate already
expired, timing is unknown, motion is reduced, or the report is a test. A report naming several Pokémon shows the
neutral icon. Sprite elements are reused across refreshes, so animations do not restart. Live is still everywhere
(the report detail no longer animates).

## Migration summary
| Data | Change |
|---|---|
| Custom guides, cycles, history, storyline runs/progress | unchanged |
| Timers | optional `owner` field added; existing timers have none and behave as before |
| Teams | v1 read as-is; v2 written on next save |
| New documents | `guide_extras`, `timer_preset` |
| Settings | new `guides.extras_open` (default true) |

## Tests
Backend: `tests/test_guides_batch.py` (owners per run/cycle, routing, attach, presets, guide-extras API incl. URL-encoded
keys, team links/missing team, cycle completion keeps timers running, team validation, v1 docs untouched, categories).
Browser (headless Chromium, not the native Qt shell): `tests/ui/test_ui_builtin_maps.py` (directory on a clean profile,
no network), `tests/ui/test_ui_guides_batch.py`, updated `test_ui_flows.py` / `test_ui_visual.py`.
`tools/clean_install_check.py` now checks the directory: every location reachable, the data baseline
(649 species, 559 moves, 2,090 items, 629 locations, 33,405 rows) and map asset integrity.

## Known limitations
* Native Qt windows (popout dragging/resizing, tray, OS notifications) were not exercised by the automated tests.
* Storyline step timers are per run + region; the storyline popout shows the run's timers only through Tools › Timers.
* Move-based coverage uses the move's type only; Struggle-type special cases, Hidden Power types etc. are not modelled.
* Category assignment is rule-based from names/kinds; a few special areas may sit in "Special areas".
