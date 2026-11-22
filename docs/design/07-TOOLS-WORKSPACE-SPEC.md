# 07 — Tools workspace and navigation design
**Baseline:** 2026-11-22 | **Status:** Proposed design for approval, no production code.
**Applies to:** Windows/Linux main app and optional detachable tool windows.

## Goal
Tools should feel like a few well-organized, PokeMMO-native pages rather than a launcher containing twenty separate buttons. The main Companion remains a normal desktop window; user-selectable tools can detach into separately managed popouts.

## Tools landing page (one of the FIVE primary navigation categories)
- One clear page title: **Tools**, concise secondary description, small optional search.
- First row: **Continue / recently used** (maximum 3 entries, or hidden if empty). Examples: a saved breeding plan, last damage matchup, team draft.
- Three lightly distinguished groups, each showing only the most important destination plus 1–3 subsidiary links:
  - **Battle & Stats:** Damage Calculator, Type Matchups, IV/EV tools and nature reference. Damage is withheld as exact until formulas are validated.
  - **Breeding:** Breeding Preview, Breeding Plan, Egg Moves. They are views within ONE Breeding Planner tool, not three permanent launcher icons.
  - **Planning & Hunting:** Team Builder, EV/Horde planning, Hunt Notes and useful references. Do not add an encounter counter. Personal catch log remains optional, not a substitute for game capture data.
- Controls use subtle Better Default tab/pill/selected state styling; avoid bright full-card backgrounds or giant decorative graphics.
- Click a tool -> open its full page within the main app. An adjacent small popout button (or within the tool titlebar) opens a detached instance. Avoid redundant popouts and duplicated data.
- Main app navigation orientation can be vertical or horizontal, but Tools has only one primary navigation entry either way.

## Every tool shares window/data contracts
- Same persisted state, calculated inputs and saved projects in both main view and detached popouts.
- Main page may show complete workspace; popout has Compact, Standard, Expanded densities chosen by user or responsive size.
- Pinned always-on-top independent of app state where OS supports; minimizing main window must not silently close popouts.
- Popout actions: Pin, Display mode, Opacity if supported, Minimize, Close. Each tool keeps own transparency limit for legibility.
- Each window independently remembers scroll, selected tab and focus; saved tool inputs remain synchronized.
- Never force the game to lose input focus for a passive toast.
- Calculators have source/accuracy state, last verified date, and a readable explanation of estimated vs verified results.
- Do not require all tools to be installed or started in order to use basic pages; slow services and live feeds must not block Tools navigation.

## Proposed tool page layout (full main window)
Top: specific tool name / short subtitle / buttons for Save, Pop out and help, without giant decorative header.
Body: one **primary interaction area** (inputs and results).
Secondary information (history, formula notes, costs, detailed references) stays behind tabs or in a collapsible inspector, never a wall of small cards.
Bottom or detail drawer: source status and warnings relevant to the particular calculation.

## Initial build sequencing AFTER user approval
1. Tool shell/navigation and one low-risk **type-chart / nature reference** with verified PokeMMO rules.
2. Breeding user interface with clearly labelled fixture data, no promised accurate offspring until formula tests pass.
3. Breeding IV/nature/cost engine after reference fixtures validated; then tree planner/inventory and egg moves.
4. Damage calculator and catch estimator separately after source-backed numerical regression tests. Catch odds remain **estimated** if no publicly verified model.
5. Team builder and hunting tools. Link to Pokédex rather than copying species data into tools.

## Design rejection criteria
- Twenty ungrouped icons or permanently expanded calculators in the Tools landing page.
- A one-size-fits-all generic calculator view applied to breeding and team builder.
- Multiple popouts spawning because of ordinary navigation.
- Unverified Pokémon mechanics presented as exact in the UI.
- Automatically scraping GTL prices or game account state.
- In-game action automation, reading game memory or running an encounter counter.

## References
- PokeMMO Hub's publicly described breeding simulator and egg-move calculator: https://github.com/PokeMMO-Tools/pokemmo-hub
- Current third-party planner examples for planning flow only (not endorsed/assumed exact): https://mmobreeder.com/breeding-planner , https://breeding.pokemmotools.org/
- Official PokeMMO updates and released game mechanics are source of truth over older websites.
