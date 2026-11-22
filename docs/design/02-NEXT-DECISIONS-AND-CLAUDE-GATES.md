# Next decisions and test gates before production build
**Date:** 2026-11-22 · **Implementation:** Claude · **Research, design and QA:** user + ChatGPT

## Decision status
**Approved direction:** second-monitor capable normal main app + optional reliable detachable popouts; horizontal/vertical nav; Home, Pokédex, Tools, Live, Guides; Better Default-inspired styling without purple; simple Poké Ball identity; per-tool compact/standard/expanded presentation; optional per-tool opacity/pin; verified game data; Alpha/Swarm custom toasts/native notifications/history.

**Not yet approved:** full pixel-level design system, specific framework/toolkit, production build, or unverified live sources and calculators.

## Short, sequential work plan
### Gate A — Design system and page contract (NEXT)
- Review Better Default 1.8.0 local theme source and extract a *non-artwork* style token inventory: background/window/header/border/accent/text/selected/hover/danger, typography, spacing, corner radius.
- Define main window minimum/comfortable sizes and responsive horizontal/vertical navigation behavior.
- Write detailed **Home** page layout and article/event detail states: loading/empty/offline/verified/upcoming/ended/edited.
- Define the Pokédex continuous grid and detail panel interactions; preserve the current Phase 3 sprite-card rules.
- Define the **breeding planner** to follow PokeMMO's actual two-parent in-game flow and data requirements; distinguish visual familiarity from copying protected art.
- Detail compact/standard/expanded layouts for each tool; choose which controls persist between main and popout.
- Gather feedback and explicitly approve before a design freeze. No more generated previews unless user requests them.

### Gate B — Game data and formulas
- Finish species availability model, forms, stat and learnset reconciliation, special/temporary legendaries, encounter season/location/time and Zorua unknown rate.
- Cross-check July–November 2026 official PokeMMO changelogs (stable vs PTS vs event).
- Confirm calculators with known PokeMMO examples: type/EV as first low-risk tools, then damage, breeding, catching (estimated where formula unconfirmed).
- Validate guide documents against post-November-19 Defog acquisition and other patches.
- Source + verification date + patch applicability per mechanics field. No stale claims.

### Gate C — Live content
- Verify provider permissions and actual JSON/feed payloads for Alpha/Swarm, including corrected alerts and duplicates.
- Validate legendary monthly cycle against current official/credible sources, with exact rollover semantics.
- Find permitted, timestamped Altering Cave source; otherwise keep 'current rotation' unknown with historical data separate.
- Verify official PokeMMO news/events retrieval route with in-app summaries/details and safe refresh behavior.

### Gate D — Isolated platform feasibility spike (user-approved)
- Claude prototypes only one ordinary main window, one detachable pinned resizable window, one custom toast and one native OS notification.
- Test Windows 10/11, CachyOS KDE X11 and Wayland: focus, fullscreen games, multi-monitor, opacity, state restoration, native notifications.
- Decide toolkit (Qt 6/QML a candidate, not yet finalized), fallback on compositor restrictions, close-to-tray behavior, no privileged game access.

### Gate E — Production milestones AFTER approval
1. Main shell and approved Better Default-styled Home/navigation.
2. Popout manager, persistence and notification channels.
3. Source-backed responsive grid Pokédex and details, using compliant asset strategy.
4. Verified Live tools and news/events.
5. Calculators and breeding; each only when formula QA passes.
6. Guides and optional personal plans.

## Cross-cutting requirements
- Public repo stays safe: no game ROMs, client sprite dumps, audio, original walkthrough attachments, or extracted copyrighted assets.
- Use `develop` for research/Claude work; `main` only for tested releases. Do not proliferate branches.
- No encounter counter, gameplay automation, game memory reading or unverified precise encounter rates.
- Every change must be manually QA'd against game or official changelog before marked complete.
