# Official changelog: chronology and downstream consequences
**Baseline:** November 22, 2026. Apply non-event permanent patches; do not retain finished event bonuses.

## July 29, 2026 — Shiny Wars 2026
Source: https://forums.pokemmo.com/index.php?/topic/199536-changelog-shiny-wars-2026/
- Thorough encounter table rebalance in Kanto, Johto, Hoenn, Sinnoh, Unova.
- Official in-game Wild Locations Dex now has exact encounter percentage breakdowns, morning/day/night, seasonal variations, more precise area labels, form-specific encounters, and Sweet Scent as independent method.
- Some random/semi-random daily pools e.g. Trophy Garden, Great Marsh, Johto Safari Zone.
- Altering Cave acquires rotating inhabitants and Pickup rewards per in-game day.
- Costume Pokémon and inherited costumes introduced; Shiny-specific icons and different sprite assets.
- **TEMPORARY EVENT ONLY:** +10% wild Shiny bonus; 7-day season rotation for event. Do not use as permanent baseline.
- July 31 follow-up fixed Zorua wild encounter and made minor encounter-table corrections. Therefore July 29 as-of data alone is insufficient.

## Oct 29/30, 2026 — HUD, weather, balance
Source: https://forums.pokemmo.com/index.php?/topic/201356-changelog-30102026/
- New HUD with encounter tracker already in client: we explicitly do not duplicate it.
- Overworld weather dynamic across regions; weather/season can affect encounters; UI settings changed.
- Hail and Snowscape distinct: Hail causes damaging hail; Snowscape creates Snow; separate TM added.
- Snow Cloak ability weather behavior altered; Snover/Abomasnow secondary ability change.
- Lickitung's catch rate changed 45 -> 75 (dump matches).
- Some Altering Cave species removed pending balancing review; older community pools are stale unless individually revalidated.
- Dusk Ball lost cave bonus for Twist Mountain Center (in official bug fixes). Calculator must handle this; never assume all cave-named locations qualify.
- UI supported no longer fixed; floating Companion should not rely on exact HUD geometry.

## Nov 1–13, 2026 — Halloween and patches
Source: https://forums.pokemmo.com/index.php?/topic/201445-changelog-halloween-2026/
- Event ended Nov 13 23:59 UTC. Event bosses, limited encounter tables/bonuses, and rewards belong in historical/event data only, not current hunting availability.
- Nov 5 stable patch: mobile UI adjustments, weather/visibility tweaks, battle move/event priority fix. Source https://forums.pokemmo.com/index.php?/topic/201571-changelog-november-5th-2026/
- Nov 13 official patch exists: obtain full changes before shipping affected mechanics; it must be part of the future periodic review queue (https://pokemmo.com/en/).

## Nov 19, 2026 — latest found stable changelog as of snapshot
Source: https://forums.pokemmo.com/index.php?/topic/201822-changelog-november-19th-2026/
- GTL newly created listings initially private to seller and marked Pending with countdown; seller can cancel/reprice; relevant to guide/UI references, not a live GTL API.
- HM Defog added as field item in: Kanto Lavender Town's tower 1F, Hoenn Rusturf Tunnel, Johto Route 28, Unova Celestial Tower Rooftop.
- Some Android, UI scaling, import, audio, battle/client fixes.
- Theming support for new HUD not yet released; user theme project is separate, so Companion must not assume those widgets are themable.

## PTS (NOT LIVE): BW2 / Unova 2 test client
Source: https://forums.pokemmo.com/index.php?/topic/201308-bw2-pts-release-2-october-27th/
- Public TEST server updates cannot be included in normal player access/availability filters unless a later stable changelog confirms release. Keep `channel = pts` separate from `channel = live`.

## Changelog regression requirements
- Every new official changelog must trigger a review of: species availability/forms, encounter locations/methods/odds, move data and learnsets, abilities, items/field mechanics, catch-rate exceptions, EV/training locations, legendaries/raids/rotations, notifications, new in-game features that make Companion duplicates, and game/UI compatibility.
- Maintain an explicit history: superseded facts are not deleted; they are marked no longer active and associated with game patch date.