# Design specification 04 — Tool page and popout contract
**Date:** 2026-11-22  
**Status:** Proposed detailed architecture and QA criteria; no production code authorized.

## Shared model, multiple presentation surfaces
One tool = one data model + saved state + accessible action semantics. Each tool appears within its main-app page and can optionally be detached into its **own independent OS window**. Never create two competing copies of a calculator's values or a guide's checklist.

Three tool density modes:
- **Compact:** minimum information, purpose-built quick-use controls, optional very light transparency. Accessible title and toolbar.
- **Standard:** normal editing and detail view, suitable small popout.
- **Expanded:** nearly full main-page depth, comparisons, rich tabs. Popout can be expanded or use main page.

The three densities are not the same page squeezed down: **each needs a purpose-designed information hierarchy.** Each tool defines its own content for every density. Resizing may intelligently switch density when allowed; user can also explicitly lock a mode. Tool state is preserved across mode changes.

## Consistent popout chrome
Every tool has stable title and actions: **Pin (always-on-top when OS supports it)**, **Display mode**, **Opacity (optional per tool)**, **Minimize**, **Close**. Allow keyboard shortcuts with user-settable, safe defaults, show focus, do not steal game input. Save preferred size/position within OS limitations. Closing a popout returns no hidden duplicate surface. Popout remains alive if main app minimized, unless user explicitly quits all windows.

- Pin is not the same as "overlay": one can use a pinned panel beside game or on second monitor.
- Opacity never makes controls unreadable; minimum usable opacity is tested by per-tool layout. Storyline Guide gets a particularly lightweight overlay-friendly step display.
- Custom toast is ephemeral, independent from a pinned tool. OS native notification is separate again. All report delivery preferences are configurable.

## Tool-specific content hierarchies
### Pokédex
- **Main/Expanded:** responsive continuous-scroll sprite GRID, search, typed filters, detailed species panel. 649 National Dex species independent of catches.
- **Standard:** filtered mini-grid, selected detail switcher, 3–5 columns as width permits; search always available.
- **Compact:** selected species sprite/name/typing + short actions to open location/evolution/moves. No arbitrary fixed-count species list.
- Location/availability and forms must use verified PokeMMO fields, with source version and uncertainty labels.

### Live Alpha/Swarm
- **Main/Expanded:** feed/history, region/type filters, delivery settings, report corrections, source timestamps.
- **Standard:** recent report cards + filters.
- **Compact:** latest valid report / connection indicator, not falsely guaranteed ongoing.
- Notifications: user chooses custom toast, native OS, both or none; source+message IDs de-dupe. No invented despawn countdown.

### Legendary Roadmap / Altering Cave
- **Main/Expanded:** current + upcoming / source evidence, known mechanics, detailed historical records.
- **Standard:** current verified rotation, next months for legendaries; cave crystal and spawn observations when timestamped.
- **Compact:** one line current status + freshness indicator. Unknown/expired if live source absent.

### Breeding Planner
- **Main/Expanded:** visually familiar to PokeMMO breeding window: left parent slot + right parent slot, held items/braces/Everstones, central compatibility and inheritance preview, offspring result plus consumption/cost breakdown. Use author-created styling, NOT redistributed client textures.
- **Standard:** same two-parent flow with tabs for IVs, nature, items and outcome.
- **Compact:** selected pair's inheritance summary + next required action. Do not compress full breeding tree into unreadable form.
- **Accuracy:** parent consumption, egg groups, gender / Ditto, item locks, IV rules, nature, alpha/shiny special rules and costs all require current PokeMMO-sourced test cases. No generic cartridge breeding assumptions.

### Damage / Catch / Type / Team tools
- **Main/Expanded:** full validated inputs, explanation and optional comparison.
- **Standard:** essential calculation inputs and outputs.
- **Compact:** a saved pair or matchup summary (damage range only after validated); catch odds clearly marked ESTIMATE until PokeMMO formula validated.
- Type chart uses PokeMMO-supported types, not auto-assumed new generations; prices are manual unless provider explicitly authorizes data use.

### Storyline Guide
- **Main/Expanded:** verified region walkthrough, area grouping, step list, contextual important items and optional per-character progress.
- **Standard:** area checklist and focused step details.
- **Compact:** unobtrusive transparent current/next objective with manual check controls. Pin, opacity, text scaling, optional auto-collapse and user-configured screen positioning.
- Source original walkthrough files remain private until permission to distribute and per-step game-update verification is complete.

## Universal test gate for Claude
For *every* tool, test (a) main-page layout, (b) three popout modes, (c) popout/main synchronization, (d) pinned and unpinned behavior, (e) OS scaling/resizing, (f) accessibility and keyboard focus, (g) offline/stale/error states, (h) duplicate/non-overlapping windows, (i) quit/minimize/tray persistence, (j) data evidence and expected source date. Implement progressively only after user authorizes project build.
