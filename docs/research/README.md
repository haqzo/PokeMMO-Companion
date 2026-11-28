# PokeMMO Companion — Research Library

**Snapshot date:** 22 November 2026. **Status:** work in progress, research only. This is a PokeMMO-specific study, not a verified gameplay database or a playable app.

## Current design / next steps (read these first)
- [Approved main app and popout architecture](../../docs/design/00-APP-STRUCTURE-AND-WINDOWS.md)
- [Alpha/Swarm custom toasts, native notifications and report history](../../docs/design/01-LIVE-ALERTS-AND-NOTIFICATIONS.md)
- [Next decisions and Claude approval gates](../../docs/design/02-NEXT-DECISIONS-AND-CLAUDE-GATES.md)

**Design decision update (22 Nov 2026):** Main application is a normal Windows/Linux desktop window with optional pinned popout tools (not an all-overlay launcher). There are three viewing densities per tool, grouped navigation in horizontal/vertical configurations, and configurable Alpha/Swarm custom toasts or OS notifications with persistent history. Actual OS support remains subject to test.

## Start here
- **[Phase 3 — current handoff](phase-3/00-START-HERE.md)**: most recent research, official changelog impact, current source register, Pokémon availability issues, calculator validation, rotating encounters, UX and test plans.
- [Official changelog impact](phase-3/01-OFFICIAL-CHANGELOG-IMPACT.md)
- [Source register and reliability rules](phase-3/02-DATA-SOURCE-REGISTER.md)
- [Golden test cases](phase-3/03-DUMP-GOLDEN-TESTS.csv)
- [Sprite-card Pokédex design](phase-3/04-POKEDEX-GRID-DESIGN.md)
- [Calculator validation](phase-3/05-CALCULATORS-AND-VALIDATION.md)
- [Alphas, swarms, legendary rotations and Altering Cave](phase-3/06-LIVE-ALERTS-AND-ROTATIONS.md)
- [Windows/Linux floating-window QA](phase-3/07-PLATFORM-FLOATING-UX-AND-QA.md)
- [Claude's research/prebuild handoff](phase-3/08-CLAUDE-RESEARCH-HANDOFF.md)
- [Walkthrough change gaps](phase-3/10-WALKTHROUGH-CHANGE-GAPS.md)

## Historical research
- [Phase 1](phase-1/00-START-HERE.md): preliminary data and feasibility audit.
- [Phase 2](phase-2/00-READ-ME-FIRST.md): expanded dump forensics and grid design.

**Phase 3 takes precedence when earlier notes conflict.** Some supporting machine-generated raw audit JSON and earlier private planning bundles were intentionally not published; the committed documents contain the key findings. Links in older phase documents to uncommitted supporting files may not resolve.

## Accuracy and release policy
1. Official PokeMMO live-game changelogs and verified current-game evidence take priority over static community databases.
2. Distinguish game-specific confirmed facts, source-derived claims, dump observations, estimates, and unresolved questions.
3. A local archive may be newer than some datasets, but its creation date does not prove every mechanic is correct.
4. Event-only data must not be presented as currently available after an event ends.
5. Do not publish extracted PokeMMO sprites, sounds, raw client dumps, ROMs, or original walkthrough attachments here without permission. Data statistics and research notes only.
6. Claude implements only after the user approves design, architecture, data QA and platform feasibility gates.

## Development workflow
Two long-lived branches only:
- `main`: approved and tested releases.
- `develop`: research, planning, implementation and testing. Claude works here.

No encounter counter, game memory reading, automated gameplay, or injected client code. The app should complement the game via independent floating windows on Windows and Linux.

- [Recovered historical QA and design notes (2026-11-28)](2026-11-28-RECOVERED-HISTORICAL-QA.md) — archival regression lessons, not current requirements.
