# PokeMMO Companion — Design specification
**Updated:** 2026-11-22 · **Branch:** `develop` · **Status:** research-led design, production not yet authorized.

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

## Open approvals
- Exact actual Better Default preset colours and layout measurements still need locally readable theme package, not inferred hex codes.
- Confirm final design layout after user review; no generated previews unless requested.
- Data/asset provenance, live sources, formula verification and Windows/X11/Wayland popout feasibility remain separate release gates.
- Claude implements only when user gives explicit approval; `main` stays untouched until an approved stable release.
