# 02 — Pokédex grid: original UI/UX specification
**Status: PROPOSED, not built.** Primary user requirement: visually clean sprite boxes, fast browsing, much better usability than long rows, stays useful while playing.

## Core principle
Show the full National Gen I–V species grid (not just currently owned/caught), with independent views of special forms and special acquisition methods. Use big visual targets to browse and a clear detail view to learn; never cram the entire Pokédex entry onto every tile.

## Floating navigation
- **Launcher**: minimal movable vertical pill or short horizontal bar with Pokédex, Search, Tools, Alerts, Legends, Settings icons; collapses to one icon. No heavy homepage requirement.
- **Quick Pokédex**: default small floating window, about 600–700 logical px wide, ~420–550 high, resizable, with its own title, search, filters and grid.
- **Expanded Pokédex**: resizable standalone reference window; adaptive grid on left, focused details on right; no full-screen forced takeover.
- Every tool can open separately and can be moved/minimized/hidden. A master hide/show action must not close PokeMMO or shift the game's focus unexpectedly.
- Save geometry independently on systems that support it; on Wayland, record and restore sizes but don't promise exact absolute positioning.

## Tile/card anatomy (proposed 112–132 px minimum width)
```
┌───────────────────┐
│ #025         ☆    │
│                   │
│    [SPRITE]       │
│                   │
│    Pikachu        │
│  ELECTRIC         │
│  ● Availability   │
└───────────────────┘
```
- Large, centered sprite with pixel-crisp scaling, not oversized text. Normal icon by default; front battle sprite optionally in expanded detail.
- National number, Pokémon name, up to two color-coded **text-labeled** type chips, small optional favorite marker.
- Availability indicator must use meaningful text/accessible tooltip; cannot rely on green/yellow/red color only. "Wild", "Evolve", "Roamer", "Raid", "Event", "Story", "Unavailable", "Unknown" are possible compact labels with verified back-end semantics.
- Don't clutter tiles with every stat or catch flag. On hover/focus, show a **tiny preview** with two most useful facts; click opens full detail.
- Optional manual "Owned / OT / Shiny / Alpha" markers may appear as small corner icons but are **off by default**, never presumed to come from account data.
- Loading and missing sprite tiles must look intentional, not collapse or display broken icons.

## Responsive grid
- **Always use responsive columns, never a fixed 10-column layout**. Minimum child width ~110 px, gaps 8–10 px, and automatic recomputation on resize/DPI change.
- 330 px narrow tool: 2–3 columns depending on accessibility text scale. 620 px: ~4–5 columns. 980 px: ~7–8. Actual numbers subject to measured usable area (sidebar and padding included).
- Virtualize visible items for 649+ species and nested forms. Avoid loading 3,000 battle sprites into memory at once. Lazy thumbnails and bounded cache.
- Do not trap wheel scrolling; smooth, deterministic scrolling with no hover-motion jumps. Keep filter and scroll state when opening a Pokémon, if enabled.
- Keyboard navigation: type-to-search, arrow keys through grid, Enter detail, Escape back, and a visible focus outline. UI text scaling should work without clipped card names; ellipsis with tooltip only as fallback.
- At 125/150/200% OS display scale, no lost controls, dead overlay areas or tiny unreadable labels. Avoid opacity low enough to destroy readability.

## Search/filter model
Primary top bar: search by name or National number, result count, two obvious filter dropdowns (Region/Gen and Type), compact Sort control, button for advanced filters. Clear-all is one action.
Advanced filter drawer (does not occupy the main grid permanently):
- **Generation introduced** (I, II, III, IV, V) separate from **regional Pokédex membership** (Kanto, Johto, Hoenn, Sinnoh, Unova).
- **Encounter region** separate again: a Kanto-introduced species may occur in Unova.
- One/two types, move learned (with known method/verification), ability, egg group, base stat range, EV yield, held item, favorite, optional manually owned, and availability class.
- For locations: season, time-of-day, method, standard/3×/5× horde, sublocation, form; no global "rarity" slider unless context is selected.
- Sorting: National ID default, alphabetical, verified BST, Speed, HP, Attack, etc. Do not sort by "rarity" across incompatible encounter methods.
- Search suggestions and recently viewed species are optional. Selecting a location creates an "all Pokémon here" view with same grid, not a giant row table.

## Full Pokémon detail panel
Header: large sprite, #number, name, types, form selector, normal/shiny toggle (viewer only, not ownership claim), verified availability, favorite, source/data age.
Tabs or sections:
1. **Overview**: base stats six progress bars with numbers; gender ratio after correct decoding; abilities with hidden ability distinctions; egg groups, EV yield, held items, catch rate as raw species field (NOT chance), height/weight with verified units, evolution chain and acquisition summary.
2. **Where to find**: grouped by Kanto/Johto/Hoenn/Sinnoh/Unova, location / named subarea / method / level / season / morning/day/night; horde flag 3×/5×. Distinguish "no normal wild encounter" from "not obtainable". Unverified badges on data not checked against current game.
3. **Moves**: level-up, confirmed TM, tutors, egg, special, evolution/pre-evolution categories; PP, accuracy, power and type; don't mislabel `TM??` as current TM availability.
4. **Forms / evolution**: species vs alternate, costume vs Alpha vs Shiny (Shiny/Alpha are qualities not new National species); conditions and source links where verified.
5. **Battle / tools**: type matchup multipliers, nature/stat calculator, catch calculator when validated, team-builder cross-link. Clearly separate base catch rate from actual ball capture probability.
All key facts have an Info/source action; "verified as of" appears for volatile rows. Progressive disclosure: not every field on the first screen.

## Visual identity
- PokeMMO-adjacent, not a direct game UI copy: dark charcoal/slate, controlled accent, subtle borders, compact comfortable spacing, rounded corners, predictable elevation and consistent icon language.
- Polished card hover/selection, no constant animation. Type colors accessible on dark surfaces with readable text.
- Independent UI themes later: neutral default, light/high-contrast, optionally presets resembling Better Default. Do not couple to PokeMMO's mod/theme renderer.
- Custom card density and text scale settings should affect all windows consistently.

## Original vs source inspiration
Reference: `https://github.com/muphy09/3s-PokeMMO-Tool` and its official forum screenshot of a 3-column card grid. We may learn interaction patterns without copying UI, assets, data, or source under uncertain license. A separate older game Pokédex grid is also visually informative, but we need an original design.

## UX acceptance criteria
- Show all 649 base National species without needing to mark them caught.
- Search "25" and "Pikachu" produce the same #025.
- A gendered icon such as Unfezant never appears broken due to an absent unsuffixed path.
- Result count correct across filters, including combinations.
- A species with zero wild-location rows but a valid special method shows the special acquisition mechanism rather than "unobtainable".
- Users can browse 649 tiles without noticeable stutter on the target laptop/desktop.
- On small window, left-side filtering collapses and full detail opens in same window, preserving Back history; on large window, detail may appear side by side.
- An unavailable/unverified record is never incorrectly rendered as a green normal wild spawn.