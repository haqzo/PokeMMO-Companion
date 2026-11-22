# Pokédex: mandatory design and data contract

## UX (before implementation: approve designs)
- Default visual navigation is a *RESPONSIVE GRID OF SPRITE CARDS*, not rows. Every National Dex #001–#649 appears regardless of catch history; extra/special forms are nested under their original species, never double-counted.
- Tile (approx. 114–132 px minimum width, subject to text-size QA): National number (top-left); favourite toggle (top-right); pixel-sharp icon, name, one/two text-labelled type chips, compact **evidence-backed** availability indicator. No more data in card; details on click.
- Example compact tile:
```
┌────────────────────┐
│ #025          ☆    │
│                    │
│   [CRISP SPRITE]   │
│                    │
│      Pikachu       │
│     ELECTRIC       │
│  Wild · Verified   │
└────────────────────┘
```
- A small standalone floating panel with search and filters, maximizable to a roomy split view: responsive grid left and detailed species view right; never blocks whole game forcibly. Layout width can start at ~620 px but is user-resizable. Columns adapt to width and font scaling.
- Search by species name/number/ability/type; optional advanced filters for region of intro, regional Dex, actual encountered region, season, time, wild method, horde size, abilities, egg groups, stat thresholds, Shiny/Alpha availability and special acquisition status.
- Crucial: generation of introduction is distinct from current region of occurrence and separate from regional Pokédex membership.
- Cards: click or keyboard Enter to open, type/name Ctrl+F to search, Esc back, arrows navigate; use virtualization and lazy icon loading. Remember search, filters and scroll location when returning from species details if enabled.
- Species detail tabs: Overview (sprite, types, base stats, abilities, gender ratio, nature/EV yield), Locations, Evolution, Moves (level/egg/tutor/TM with patch status), Forms & Costumes, Breeding, Notes. Stat chart values must be sourced; user data/owned flags optional and default empty.
- Locations: pivot by region, sublocation, encounter method, season, morning/day/night, horde size. Percent values only for comparable denominators. Show `Lure`, `Special`, `???`, `--` as labeled availability kinds, not `0%` or `100%`.
- Availability categories should be **multi-dimensional** rather than one green checkbox: {normal_wild, special_wild, gift, evolution, breeding, roamer, permanent_raid, seasonal_event, limited_event, storyline_temporary, unique_contested, unavailable, unknown}; source and dates mandatory.
- Shiny, Alpha and costume markers are independent from ownership and alternate forms. Player-owned dex is manual/optional and starts empty; NO automatic claim to reading PokeMMO account state.
- Always show a visible 'Data checked [date]' and source link for important mechanics; stale fields say 'Needs verification'. No fabricated exact appearance rates.

## Datasets / canonical keys
- `species_id` (National Pokédex), `form_id`, `costume_id`, `source_version`, `source_origin`, `availability_status`.
- `location_id`, normalized region + subarea, `season`, `timeofday`, `method`, `horde_size`, `rarity_kind`, optional precise percentage, evidence metadata.
- Resolve special overrides in a **patch-aware overlay table** on top of baseline dump, never mutate dump source destructively.
- `id>649` may represent regular alternates, event boss monsters, placeholder/debug. Keep out of main species list, render only legitimate released forms explicitly verified.
- Avoid duplicates in single-type arrays; use sprite existence manifest; have fallback to normal icon if gender or form-specific path missing.

## Acceptance cases
1. Narrow / medium / wide resizing preserves visual boxes and correct focus order; 125%/150%/200% OS scaling causes no clipping.
2. #521 / #592 / #593 show gender-specific sprites, not broken images.
3. Bulbasaur's Lure entry remains 'Lure', not an invented percent.
4. Zekrom shows story-only/temporary after proper confirmation, not plain 'freely obtainable'.
5. Zorua may have a named wild location while its exact encounter rate is UNKNOWN.
6. Rotating cave or weekly event cannot contaminate persistent location table.
7. No encounter counter is added anywhere, including the launcher or settings.