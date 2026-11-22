# Claude handoff: research and architecture gate, NO full build yet

You are implementation lead for Haqzo's fresh PokeMMO Companion at https://github.com/haqzo/PokeMMO-Companion . The researcher and user own research/planning/testing. Do not resurrect old Companion design, automate in-game actions, or copy unrelated project code.

## Your first response must do these things
1. Read docs 00–07 plus CSV (and earlier Phase 1/Phase 2 research materials if available). List unresolved game-mechanics unknowns; distinguish what was verified in dump versus official changelogs and community claims.
2. Propose a coherent visual DESIGN SYSTEM for a truly floating companion: collapse launcher, card-grid Pokédex and detail view, compact alpha notification, legendary calendar, cave tracker, separately movable/resizable tools. Keep user approval gate before code. Show layout metrics, responsive behavior, keyboard/accessibility tests and state handling.
3. Propose normalized, versioned data schemas with per-field source and confidence. Preserve original dump as immutable and apply independently versioned game-patch overlays. Extra records 650+ are NOT separate normal species.
4. Propose a concise Windows/Linux cross-platform FEASIBILITY SPIKE, separate from production app. Investigate Qt/QML against alternative(s), especially KDE Wayland positioning and clickthrough, and propose test instructions. **Do not start the spike before user approves it**.
5. Build a test strategy with golden PokeMMO cases in `03-DUMP-GOLDEN-TESTS.csv` and explicit unresolved source checks. No fake exact catch rates; no blanket copy of a generic Gen V calculator.
6. Determine how locally imported, user-owned sprite dumps can be used without publicly distributing extracted game assets, and check PokeMMO terms/policies before public release.
7. Produce an architecture and release plan approved by user; then, and only then, begin implementation in small reviewable milestones. Develop branch only; keep main release-oriented.

## The very first features AFTER approval
- Responsive Pokédex sprite GRID with species details, filters and provenance, no caught prerequisites.
- Minimal launcher and floating-window behaviors on Windows/Linux, proven in prototype.
- Read-only live notifications and monthly legendary tracker, clear stale indicators.
- Type chart/quick nature tools with verified data.
- Next: full damage/breeding/catch estimators only after formulas and fixtures validated.

## Explicit NOs
- No encounter counter.
- No main dashboard taking over game screen.
- No gameplay automation/client injection/memory reading.
- No silent assumptions that Halloween spawns are live or PTS is production.
- No massive vague build prompt, no uncontrolled feature scope.
- No committing original PokeMMO sprites/audio/dump into public repository.
- No claiming the source calendar's current live events without an actual fresh check.