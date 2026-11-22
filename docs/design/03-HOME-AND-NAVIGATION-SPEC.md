# Design specification 03 — Main window, navigation, Home and in-app news
**Date:** 2026-11-22  
**Status:** Proposed detailed page specification for user review; architecture direction already approved. No production code authorized.  
**Target:** Windows 10/11 and Linux KDE Plasma (X11/Wayland). Normal desktop app; overlay is optional, via popouts.

## Non-negotiable experience
- This is a **normal, polished main desktop application**, ideally living on a second monitor or beside PokeMMO. Never force the whole main application above the game.
- Design for a clean, moderately spacious main window; no unnecessarily busy dashboard. News and events have **readable full detail inside the Companion**, not link-only cards.
- Popout windows are optional, separate, consistently styled and synced with main-page state.
- No more than **five** main navigation destinations: Home, Pokédex, Tools, Live, Guides. Settings is a gear icon. No standalone Encounter Counter.
- Visual baseline should be *actual Better Default 1.8.0* color/typographic tokens, not generic purple. **Extraction of exact palette is pending local file access; do not invent hex values.**

## Window frame / regions (logical dimensions are preliminary, verify usability under DPI scaling)
- Initial comfortable main window target: **1080 × 740 logical px**; practical minimum around **800 × 580** with responsive content. No fixed pixel dependencies; support resizing, portrait-monitor usage, OS scaling.
- Shell: restrained titlebar, logo/Poké Ball emblem, current page title, optional global search only where useful, unobtrusive settings gear, standard OS minimize/maximize/close controls.
- **Vertical navigation** layout: a ~176–208 px left sidebar at generous width, with five clearly labelled destinations. At tighter widths collapse to icons **with accessible tooltips**; no permanently cluttered second panel.
- **Horizontal navigation** layout: one compact row at the top using the same five destinations. This is a user's preference, not a different information architecture. Preserve the active page when switching nav orientation.
- Do not include persistent data panels (live feed / timers) in the global chrome. App title and navigation only. Keep all information inside pages.
- Main page has one primary column. On wider screens certain pages may use a secondary supporting column **only when it reduces navigation effort**, never to fill empty space.
- Restore page location, selected species, filters and scroll where enabled. Users may opt out of last-page restore.

## Home: first-load content hierarchy
Home should answer: *What changed? What's coming up? Is anything important happening? What do I want to open?*.

At a comfortable main window:
1. **Latest important official update:** one clear headline, publication date, a 2–4 sentence *accurate in-app summary* and a subtle "Read details" link/action. Source identity shown.
2. **Official events:** next upcoming or recently updated events, at most two or three concise rows with event type, schedule + local timezone, region/location if applicable, and verified current status. No fake "Live" label. Full details open within app.
3. **Live activity summary:** limited to latest relevant Alpha/Swarm *reports*, current monthly legendary rotation (if verified), and latest Altering Cave *reported* state. Each shows last-confirmed time; disconnected/unknown where appropriate. Do not overwhelm Home with full tracking tools.
4. **Continue / shortcuts:** up to 3 user-configurable actions such as last Pokémon entry, active storyline step, favourite calculator. Hide section when none are configured rather than adding filler.

At narrow width: **one vertical content stream** in the same order, with shorter excerpts. At wider width: official update remains primary; events and brief activity may be side-by-side **only with adequate room**. Do not turn it into a tiled KPI dashboard.

Optional settings: reorder/hide Home sections and select a small number of favourites. Avoid building a fully draggable widget canvas in v1.

## Official news/changelog: in-app reading
News is reached from Home's latest card / "See updates"; not an additional top-level navigation destination.
- List view: official update posts with date, category (changelog, announcement, event), source label, short excerpt, optional filtering/search.
- Article/detail view: **composed summary**, grouped game changes, relevant fixes, new items/locations where source confirms them, applicable effective date, "What this changes in Companion" notes when verified.
- External original-post link remains secondary as citation/attribution, never the only way to read the news. Do not republish entire copyrighted forum content.
- Source information: original URL, author/source classification, published and edited times if known, fetched/verified time. If body untrusted or incomplete, label summary as incomplete; don't manufacture a full article.
- Changelog editor updates and official events must not be conflated with community replies or speculation.
- A previously edited article invalidates cached derived values pending refresh/QA. An official PTS notice is labelled PTS; never treated as a stable live update.

## Official events: distinct informative views
- Event list may optionally be a compact calendar; initially prioritize readable rows and verified date/time.
- Detail view for **PvP tournament**: format, bracket/registrations, tier, player count, rules, prizes, schedule, location/channel when stated. For **catching event**: eligible species, location, scoring rules, duration, allowed methods, prizes. For **seasonal world event**: availability interval, participation prerequisites, rewards, permanent vs temporary changes.
- Never use the wrong generic template just to fill fields. Missing details are hidden or labelled unknown.
- Status transitions: upcoming, start time passed/unconfirmed, confirmed ongoing, completed, cancelled. Automatic date arithmetic alone cannot prove event completion or actual occurrence. Local timezone and source timezone both available.
- News/events caching: offline copy readable; clearly show "last checked". Live-sensitive fields must downgrade to stale/unknown if source is unavailable.

## Home data/loading states
- Initial no-network: "Cannot refresh official updates" with last cached snapshot date or an empty-state explanation.
- Skeleton loading in place; avoid overlay spinner obscuring other sections.
- Permission / rate limit / parsing failure: clear message and non-destructive retry.
- No verified event: "No upcoming official events confirmed" instead of static placeholder examples.
- Alpha feed outage: "Reports unavailable — last update X" rather than no activity or "All clear".
- Event ended: historical record remains in news/events history, not primary active highlight.

## High-level internal page routing (proposed)
- `home`, `news.list`, `news.detail(id)`, `events.list`, `events.detail(id)`.
- `pokedex.grid`, `pokedex.species(id,form?)`.
- `tools.index`, `tools.damage`, `tools.catch`, `tools.breeding`, `tools.team`, `tools.type`.
- `live.index`, `live.report(id)`, `live.legendaries`, `live.altering-cave`, `live.history`.
- `guides.index`, `guides.region(region)`, `guides.step(id)`.
- `settings` in a secondary action, not a sixth main tab.

## Navigation and accessibility acceptance
- Same destinations and route state regardless of vertical or horizontal nav.
- Switching main pages does **not** close independent popout tools; minimizing main app does not terminate notifications if user explicitly enabled tray/background.
- Search and keyboard navigation work logically; focus visible, Escape returns to prior view, adequate tap/click targets, text scale. Reduced-motion settings apply globally.
- All windows must remain usable at 125%, 150%, 200% system scaling and on multi-monitor layouts.
- Each feature details **what it can prove from PokeMMO sources**, not merely what looks nice.

## Open items before design signoff
- Verify the palette/token set by reading local Better Default 1.8.0 archive. Current ChatGPT file-library object is discoverable but could not be materialized to raw bytes. Exact token values are **not extracted or approved**.
- Approve main window density and typography before Claude builds the production shell.
- Determine a legally permitted way to show local user-imported sprite assets without redistributing client files.
- Verify an approved source/format for official news and events that enables reliable in-app article summaries and detailed event facts.
- Run an approved multi-platform window/notifications spike before pin/toast guarantees.
