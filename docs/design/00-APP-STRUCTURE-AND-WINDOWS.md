# Companion UX decision record — Main window + detachable tools
**Date:** 2026-11-22  
**Status:** Direction approved by user, detailed layouts/technology pending testing  
**Branch:** `develop`; no production code authorized

## Product model (approved)
PokeMMO Companion is a normal, resizable desktop app for Windows and Linux, intended to sit on a second monitor or beside the game. It is **not primarily a game overlay**. Useful tools can be opened as independent, optionally pinned, transparent popout windows while the main app stays open elsewhere.

- Five primary sections only: **Home**, **Pokédex**, **Tools**, **Live**, **Guides**. Settings via a gear icon, not a sixth prominent navigation category.
- Main app navigation can be **vertical sidebar or horizontal top navigation**, with matching functions and saved preference.
- Clean visual system based on the **actual Better Default 1.8.0 theme** (extract palette/tokens and review licensing before copying anything). No purple aesthetic. Retain a small Poké Ball identity mark.
- Main app gives each page enough room for its own appropriate layout; do not compress the full app into a giant overlay.
- App may be resized, minimized, placed on another monitor, and used without any popouts. No encounter counter.

## Home — in-app content, not external-link directory
**Quiet, intentionally sparse:** a single important official changelog summary, up to a few official news/events, a compact live-activity summary and user-selected shortcuts. Prioritize relevance over card counts.

- Official changelog opens a **real readable in-app article detail**: summary, grouped changes, PokeMMO applicability, source date, region/tool effects, link to original post. Do not reproduce full copyrighted forum posts.
- Official events open **in-app event details** based on event type: schedule/timezone, eligibility, location, rules, prizes and registration details *only when verified from announcement*. Distinguish upcoming, elapsed but not confirmed complete, cancelled, concluded.
- Live cards contain timestamped community **reports**, not falsely verified live game state. Clicking opens Live.
- On network failure, cached news is readable with **last-fetched** label; do not silently assert ongoing status.
- Do not automatically display every piece of news as a popup. Official news alerts optional and off by default.

## Tool layout contracts
Each tool has ONE shared state/data model used by its main-page layout and detachable views:
1. **Compact popout:** essential few data points, readable while playing.
2. **Standard popout:** everyday controls and key details.
3. **Expanded popout/main page:** complete tabs, data and richer interactions. Main-page layout may use multi-column structure when appropriate.

**Popout capabilities:** own Pin/unpin (always-on-top where supported), minimize/close, drag/resize, opacity where useful, text scaling, snap/restore where platform allows. Close a popout without clearing its underlying tool state; main and popout synchronize inputs. No large invisible mouse-intercepting surface. If the main window is minimized, existing popouts remain functional. Close-to-tray and exit semantics must be explicit, user-controlled and tested.

**Window constraints:** Windows, KDE X11, KDE Wayland require independent tests. On Wayland positioning and fullscreen overlays may be restricted by compositor: do not promise universal always-on-top, screen corner anchoring, focus or XY restore before empirical tests. A capability-specific graceful fallback is required.

## Page-by-page layout direction
- **Pokédex:** prominent responsive continuous-scrolling sprite-card grid (#001–#649), search+filters, species details; split side-panel at wide width, in-place detail at narrow width. No mandatory pagination or account-owned prerequisites. All PokeMMO-specific facts need provenance and unknown state.
- **Tools:** grouped calculators and planning, each with its own appropriate interaction model. Breeding planner should mimic the **familiar in-game breeder workflow** (two parent slots, gender/egg compatibility, Everstone, braces, inherited IVs, nature, consumptive parents and planned offspring), without copying extracted game art into a public build.
- **Live:** subtabs for Alpha/Swarm reports + notification history, Legendary Roadmap and Altering Cave. Source freshness prominently shown. No assumption all share a single feed.
- **Guides:** step-by-step walkthroughs for five regions, optional personal completion per character, compact semi-transparent current-step popout; do not assume the old walkthrough documents are current without verification.
- **Settings:** theme accents derived from Better Default, layout direction, per-popout modes, native notifications/toasts, privacy, language, text size, opacity, sound and accessibility.

## Open design gates
1. Derive precise color/typography/border/spacing design tokens from Better Default source and approve them.
2. Specify each page's compact/standard/expanded information density, keyboard navigation, and minimum window size.
3. Choose desktop implementation technology only after an isolated Windows/KDE X11/Wayland window feasibility spike is approved and passes.
4. Approve live-source contracts and patch-specific Pokémon data before claims of live accuracy.
5. Claude starts implementation on `develop` only after explicit user approval. Do not add extra permanent branches.
