# PokeMMO Companion — Phase 3: official changelog + dump + community research
**Snapshot:** 2026-11-22 · **Status:** Research/prebuild, NO PRODUCTION CODE · **Maintainer:** Haqzo + research assistant; implementation assigned to Claude.
**Target:** Windows and Linux, with KDE Plasma Wayland/X11 as mandatory Linux acceptance cases. Public repo: https://github.com/haqzo/PokeMMO-Companion

## What is verified this round
- Source archive `Pokemmo-Dumps(5).zip` SHA-256: `b0e498fd3b2e03a4a4ebd83d1ac38f01c822c380b53288ddea50793a45fa637e`; nine nested ZIPs passed CRC checks in earlier audit.
- 720 Pokémon records: 649 National Dex entries plus 71 alternate/special/boss/debug entries; 33,405 encounter rows; 559 move records; 3,006 item records.
- At least one normal icon and front battle sprite exists for each National Dex ID 1–649. Three Pokémon (Unfezant, Frillish, Jellicent) lack the simplistic un-gendered `id-0.png` icon file; use asset manifest, never guessed filenames.
- 406 records repeat their sole type in the two-element type list. Normalize to one badge.
- 185 move learn references lack a matching move metadata record, 171 named Snowscape. `skills.json` has Hail but no Snowscape metadata. Do not delete moves or invent values.
- Oct 30 official change Lickitung catch rate 45 -> 75 matches dump (`75`); Zorua is present after official July 31 restoration but its Lostlorn Forest rate is `???` in dump.
- Only TWO dump location rows named Altering Cave, both Unown. This is not the dynamic cave dataset. The cave tracker must use verified timestamped reports / a supported feed.
- `obtainable: true` includes Zekrom, Mewtwo, Articuno, Keldeo etc with no ordinary locations. It must NOT be equated with currently wild or permanently ownable.
- The October 30 patch changed Hail vs Snowscape, some Altering Cave availability; November 19 adds HM Defog in four regions and GTL features. Halloween event ended November 13:11:59 PM UTC, so Halloween-specific spawns/bonuses must not be shown as current.

## NON-NEGOTIABLES
1. The program must complement PokeMMO; **NO ENCOUNTER COUNTER**. No automated input, memory reading, injection, client bypass or game manipulation.
2. Desktop floating launcher + separately resizable, movable, hideable/minimizable tools, with cohesive visual language. Adapt to OS capabilities rather than claiming identical Wayland geometry restore.
3. Pokédex is **responsive searchable sprite-card GRID**, never a default row table. Entire 649 National species regardless of whether player personally caught them; forms layered, not counted as new species.
4. Every mechanics/availability/encounter/calculator datum has evidence, observation date, patch applicability, and freshness status. Show unknowns honestly.
5. Official stable changelogs override older community content. PTS data stays separate, never silently considered live.
6. Raw extracted PokeMMO client assets MUST NOT be pushed to public GitHub or bundled for redistribution without permission/license clearance. Local, user-provided asset import for personal use is the safer planned workflow.
7. Claude may do isolated feasibility spikes only after the user approves them. No main application implementation until design, data and OS feasibility gates are met.

## Deliverables inside this package
- 01 changelog impact ledger
- 02 source & trust register
- 03 dump golden test cases (CSV)
- 04 Pokedex UX and data contract
- 05 calculators and accuracy gate
- 06 live alerts/rotations
- 07 cross-platform UX/QA
- 08 detailed Claude prebuild instructions
- 09 machine-readable requirements JSON

**Citation notes:** URLs and publication dates are recorded in the source register. Access to the PokeMMO forum may give a 403 to ordinary page open; relevant content was independently returned by search indexing and official PokeMMO listing. Do not claim raw full-page HTML was fetched successfully.