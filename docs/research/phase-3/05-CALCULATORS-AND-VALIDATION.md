# Calculators & quick tools — research-driven inclusion gates

## Priority and scope
**P0 safe simple:** type effectiveness, 25-nature stat table, EV yield *display* from dump if verified, ability reference. Type chart must match PokeMMO's 17 types in inspected dump, not automatically add Fairy or Gen VI+ mechanics.
**P1 research-heavy:** damage calculator, full EV horde planner, breeding planner, catch chance estimator, speed/tier/synergy.
**P2 optional:** shiny odds probability explorer (NOT counting encounters), berry schedules, team building matchup summaries, hunt planner, cost comparisons using manual prices only until GTL data access authorized.

## Damage calculator
- Research base: https://github.com/PokeMMO-Showdown/mmoshowdown-damage-calc (last pushed 2026-11-21). Its own calculator may still display features from non-PokeMMO generations: whitelist actual game mechanics.
- Test numeric results against independent game cases (two species, IV/EV/nature, move power, type, level, item, ability, weather, field, critical/random damage, multi-target, screen effects) with source/screenshots.
- October 30 rule: **Hail != Snowscape/Snow**, including relevant damage and snow effects. Do not copy Gen V assumptions without testing.
- Never declare exact until edge cases are covered; provide input profile and formula version on each saved test.

## Catch estimator
- June 2026 forum discussion reports that PokeMMO's exact catch formula isn't public; standard-game formulas can be wrong. Label output 'Estimated catch chance' with explicit model/method and caveats. Never guarantee 100% from an approximate model.
- Verify species catch rate, ball type/conditions, current/max HP, status, any Alpha/legendary/special condition. A location is not automatically a qualifying cave for Dusk Ball; Oct 30 exception: Twist Mountain Center.
- Golden case: Lickitung uses **75** not 45. Reject missing species data instead of silently falling back.

## Breeding planner
- PokeMMO consumes both parents. Support IV targets, bracing, Everstone nature, compatibility/egg group, genderless and Ditto, alpha and costume constraints, egg-move chains.
- Input breeder inventories and market price assumptions are user-entered or from an explicitly authorized provider; no GTL scraping by default.
- Shiny breeding has special inheritance rules: do not apply ordinary breeder algorithm to shinies without independent rule validation.
- Tests: 2x31 -> 3x31 -> 4x31 path, Everstone with brace, 0-31 IV cases, incompatible parents, different forms/costumes, genderless, alpha and shiny. Confirm planned offspring cost/tree with PokeMMO UI or currently validated examples.

## EV and hunting guide
- Location/season/horde sizes must use post-July data and show only verified values. Separate EV yield *per Pokémon* from total per horde, and any training-item effect in its own calculation.
- Avoid offering an encounter counter. Hunt notes/favourites and 'best current route' are informative, user-controlled only.

## Requirements for claiming a calculator 'accurate'
- Its formula source is identified and dated.
- Regression suite holds exact expected outputs or documented acceptable error range from reliable PokeMMO cases.
- Unknown mechanics shown as approximations with explanatory tooltip; disabled if estimates are dangerously misleading.
- Every patch touching abilities/moves/stats/balls/rates triggers review, not silent carry-forward.