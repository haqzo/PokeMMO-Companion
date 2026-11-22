# 03 — Experience and platform design direction

**Theme:** cohesive quiet dark surfaces, readable text, subtle borders and restrained accent colors; not a clone of another tool or an enormous dashboard. Approve visuals with mockups before coding.

## Interaction model

- Single tiny launcher (collapsible button/strip) that may remain floating over the game; optional hide-on-game-focus setting.
- Independently draggable/resizable/minimizable tool windows: Pokédex, Alpha alerts, Legendary Roadmap, Tools, Team Builder, Breeding, Encounter Finder, optional Walkthrough.
- Each window has a task-specific **compact mode**; expand on demand, snap where OS supports it, optional transparency, font/UI size controls.
- Save tool visibility, size and (where platform allows) position per computer, with reset-to-screen safety recovery.
- Do not require entire application to be always-on-top. Offer per-window pinning and non-overlay separate-monitor mode.
- Search Pokémon and cross-link actions (Pokédex→Locations, Stats, Moves, Breeding, Team). Manual filters rather than game-state scanning.
- Alerts are user-configurable and always source-labelled, timestamped and correctable. History should not be conflated with confirmed active spawns.

## Proposed product structure

**Initial shell:** launcher + one polished Pokédex window + small Alerts window + legendary calendar.

**Next:** encounter finder and accurate lightweight utilities.

**Later, only when independently validated:** team builder, breeding, catch/damage calculators, in-depth walkthrough checklists.

**Explicit exclusions:** encounter counter, automated controls, macros, client memory reading, client injection, gameplay bots, mandatory screenshot/OCR capture, GTL scraping masquerading as an official public API.

## Technical feasibility (candidate only)

Qt 6/QML can be considered for native cross-platform windows, but **framework selection is not approved**. A small disposable prototype must compare Windows 10/11, KDE Plasma X11, and KDE Plasma Wayland in the presence of PokeMMO.

Qt documentation states that default Wayland XDG Shell typically disallows manually positioning a top-level client window. Any promise to restore absolute placement across sessions must include Wayland-specific fallback and/or user-driven positioning.

Also test game borderless/windowed mode, 100%/125%/150% DPI, multi-monitor including an adjacent portrait screen, transparency, always-on-top, click-through and focus return. Wayland stacking/focus is compositor-dependent.

## Sample acceptance behavior

- Player opens PokeMMO, taps the small launcher, opens Pokédex. Game remains playable when focus returns.
- Resizing from 320px wide to 1000px changes card columns responsively and keeps search/filters accessible.
- Closing the big panel leaves the launcher available, unless the user explicitly hides it.
- Notification toast never permanently steals game input. It can be dismissed or inspected later.
- Restoring from a disconnected monitor always places a reachable control on a visible screen.