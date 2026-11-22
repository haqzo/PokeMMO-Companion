# 17 — Storyline guide content correctness, progress and QA gates
**Date:** 2026-11-22 | **Status:** Required research and validation before publishing real walkthrough content.

## Data origin / permission
- User provided five detailed regional walkthroughs (Kanto, Johto, Hoenn, Sinnoh, Unova), including a prior desire for Empty Map works at their correct locations.
- **Do not publish originals, extracted copyrighted images, or unrelated guide text** to public GitHub until rights review. Distinguish user-authored notes and licensed/official facts from redistributed third-party text.
- Use short independently authored objectives grounded in verified PokeMMO progression, not blind copy-paste from cartridge walkthroughs.
- The sample reference tracker in the user's clip is **interaction inspiration**, not a source of license for its code, avatars or exact UX assets.

## Guide verification fields
For each step: stable step ID, region, route/city/area and subarea, ordered objective, prerequisite step IDs, mandatory vs optional, source URL/owner, inspected date, earliest patch applicability, current verification status, translated labels, optional note/HM/item/map reference. Detailed step order must be reviewed in PokeMMO-specific context.

## Current update-impact tests
- Official Nov 19 2026 update added Defog HM acquisition in additional regions. Validate Kanto, Hoenn, Johto, Unova routes/availability; Sinnoh already had its own acquisition — separate it from generic Pokémon-game guidance.
- Validate July 2026 encounter-table change relevance for optional catching/EV steps; do NOT rewrite story objectives from encounter rate changes alone.
- Halloween 2026 ended Nov 13; temporary event-only tasks are historical and not mandatory current storyline.
- Regional Elite Four completion and post-story areas need separate optional/postgame categories rather than one misleading 'region completed' Boolean.
- Items, berries, hidden pickups and Empty Map locations are optional checklist components and need a separate verify status.
- No assumption user or their alt completed every optional trainer battle/item just because Elite Four cleared.

## Run progress model / migration
- Source guide updates and character state are stored separately. Stable IDs map checkbox states to current region guide revision.
- Changing text on a stable step keeps progress; splitting/removing/merging a step must trigger review, not silently transfer completion incorrectly.
- All progress manual, with optional bulk-advance to a known checkpoint and undo. Never read game client save/memory.
- Results in Home, main Guides, compact popout and Standard overlay must reconcile immediately to one source of local truth.
- Autosave after each change, crash safe. Export/import with explicit merge/replace and version handling; don't attach backups to telemetry.

## Matrix (human + Claude QA after approval)
- 2 characters / 5 regions, switching under active in-game overlay; no cross-character or cross-region state leakage.
- Guide update after progress stored -> unchanged steps remain checked; changed objectives visibly reviewed.
- Multiple checked/unchecked within area; region progress denominator clearly mandatory only; optional totals separate.
- Current-area checklist works in Compact/Standard/Expanded across 800×580 main and small resizable popout.
- Transparent overlay over bright and dark PokeMMO maps, 100–200% text scaling; text remains readable; focus and pointer work.
- Main app on different monitor, popout on game monitor. Minimize main; popout remains open while application running.
- Windows, KDE X11 and Wayland; exclusive fullscreen and windowed/borderless tests with graceful unsupported-mode fallback.
- Original transcript/screenshots used for design only; do not make third-party program performance claims from the video alone.

## Still blocked
Actual latest source catalog and licences, per-region current-game validation, working window-framework tests, approved Better Default colour extraction and final user visual signoff. No guide code or assets should be merged to main yet.
