# PokeMMO Companion — Design specification
**Updated:** 2026-11-22 · **Branch:** `develop` · **Status:** design documented; v0.1.0 development preview implemented on `develop` (see [implementation report](../build/03-V0.1.0-IMPLEMENTATION-REPORT.md)).

## Current implementation direction
The user now wants one broad, usable **v0.1.0 development preview** before the first video review. Start with [v0.1.0 build plan](../build/00-V0.1.0-FIRST-PASS-PLAN.md) and [Claude implementation handoff](../build/01-CLAUDE-V0.1.0-KICKOFF.md). Older design-phase gates calling for *more design before any code* are superseded by this newer instruction. Source/data correctness and platform limitations still apply.

## Updated v0.1.0 reality check (22 Nov 2026)
The older 649-species browse requirement is a **complete reference index, not a claim about PokeMMO's in-game Dex**. The user's new in-game recording documents different in-game counters/availability. The reviewed v0.1.0 build must be corrected against [the three-video audit](../reviews/2026-11-22-three-video-audit.md) and [Claude correction handoff](../build/04-V0.1.0-VIDEO-CORRECTION-PASS.md). Do not silently treat 649 as today's game release roster or assume user ownership from sprites.

## Approved high-level direction
One ordinary desktop Companion main window beside/on another monitor, with optional separately pinned and translucent popout tools over PokeMMO; five grouped main destinations; alternate vertical/horizontal navigation; source-backed official News/Events on Home; Alpha/Swarm OS notifications, custom toasts and internal history; three meaningful layout densities per tool; calm styling derived from Better Default. No encounter counter.

## Read in order
1. [Main app, Home, and detachable tools](00-APP-STRUCTURE-AND-WINDOWS.md)
2. [Live Alpha/Swarm notifications](01-LIVE-ALERTS-AND-NOTIFICATIONS.md)
3. [Next decisions and approval gates](02-NEXT-DECISIONS-AND-CLAUDE-GATES.md)
4. [Home and main navigation detailed spec](03-HOME-AND-NAVIGATION-SPEC.md)
5. [Every tool's compact/standard/expanded contract](04-TOOL-PAGE-AND-POPOUT-CONTRACT.md)
6. [Better Default 1.8.0 style and semantic token plan](05-BETTER-DEFAULT-STYLE-TOKENS.md)
7. [Detailed responsive Pokédex design and golden UI tests](06-POKEDEX-DETAILED-SPEC.md)

8. [Tools landing page and grouped workspace](07-TOOLS-WORKSPACE-SPEC.md)
9. [Breeding Planner familiar three-column preview and planning tree](08-BREEDING-PLANNER-DETAILED-SPEC.md)
10. [Breeding mechanics: source register and current-game QA gates](09-BREEDING-RESEARCH-AND-TEST-GATES.md)

11. [Live workspace with Reports, Legendaries and Altering Cave](10-LIVE-WORKSPACE-SPEC.md)
12. [Alpha and Swarm reports, toasts and notification history](11-ALPHA-SWARM-REPORTS-AND-TOASTS.md)
13. [Legendary Roadmap and Altering Cave detailed layouts](12-LEGENDARIES-AND-ALTERING-CAVE.md)
14. [Source reliability, data contracts and validation gates](13-LIVE-DATA-PROVIDERS-AND-QA.md)

15. [Guides workspace and typed-name character runs](14-GUIDES-NAMED-CHARACTER-RUNS.md)
16. [Semi-transparent floating Storyline Guide for gameplay](15-STORYLINE-FLOATING-POPOUT.md)
17. [Settings, character management and per-window preferences](16-SETTINGS-AND-RUN-MANAGEMENT.md)
18. [Guide source verification, progress migration and QA](17-GUIDES-ACCURACY-AND-QA.md)

## Open approvals
- Exact actual Better Default preset colours and layout measurements still need locally readable theme package, not inferred hex codes.
- Confirm final design layout after user review; no generated previews unless requested.
- Data/asset provenance, live sources, formula verification and Windows/X11/Wayland popout feasibility remain separate release gates.
- Claude's comprehensive first-build handoff is ready; user must initiate Claude's coding run. `main` stays untouched until the user approves a stable release.
