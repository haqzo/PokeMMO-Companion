# 12 — Roaming Legendaries and Altering Cave UI + reliability rules
**Date:** 2026-11-22 · **Status:** Proposed UX with source gating; avoid unsupported current claims.

## A. Legendary Roadmap
Purpose: quick overview of known **monthly roamers** and progress, distinct from raid/event/story/contested legendary encounters.

### Current-month view
- Two grounded region cards: Kanto bird and Johto beast, species, source, month and basic unlocking requirements with a 'Read details' link.
- A single understated 'Next month' preview; full year in expandable calendar.
- Optional **per-character manual** caught/not caught or favourite marker; never infer real account-owned status from Pokédex flags.
- Popout mode Compact: Month, two species, 'Reported/Documented rotation', source date and progress.
- Standard: current/next month with region and acquisition tips.
- Main/Expanded: month selector / twelve-month calendar, regional details and manual catch history, verified FAQ text summary.

### Candidate monthly cycle (community guide, verify against latest official rules before claiming guaranteed)
| Months | Kanto | Johto |
| --- | --- | --- |
| Jan / Apr / Jul / Oct | Zapdos | Entei |
| Feb / May / Aug / Nov | Moltres | Suicune |
| Mar / Jun / Sep / Dec | Articuno | Raikou |

Sources: https://forums.pokemmo.com/index.php?/topic/160729-roaming-legendaries-faq/ and later official forum updates. Current research baseline Nov 2026 suggests Moltres/Suicune based on candidate cycle, NOT an independently queried live game rotation.
- Requirements: validate Kanto Elite Four/Pokédex conditions, Johto Ho-Oh storyline defeat, permitted encounter methods and any legendary lure benefits against **recent PokeMMO** sources. Do not copy speculative odds from users.
- Rollover: exact calendar timezone and whether client-local midnight corresponds to rotation change is NOT verified. Do not show a precise switch countdown before verified.
- Legendary Lure eligibility and bonus rules are separate patch-sensitive fields, not generic 'works on every legendary'.
- Storyline-only Zekrom, contested Mewtwo, raids/event legendary forms, non-current rotators do not appear as permanent wild roaming Pokémon.

### User interactions
Click month -> show pair and sources. Click species -> open Pokédex species details at a verified acquiring-method tab. Mark caught manually per character. Add a reminder only if date semantics validated and user opts in.

## B. Altering Cave
Purpose: display cave **observations with evidence**, not a fabricated real-time oracle.

### State header
- Current *reported* crystal/biome name/type if trustworthy; icon may be custom-authored / licensed.
- Last report time and **reliability label**: verified current observation, recent community report, historical/stale, unknown.
- Approx rotation cadence described (~one in-game day, often about six real hours), but **NO authoritative end countdown** until server synchronization proven.
- Cave cycle may change inhabitants and Pickup pool. Keep these subviews separately: Pokémon Singles / Hordes / Pickup.

### Encounter section
- Evidence-backed species, method, horde size (3×/5× if actually stated), limited rarity fields only if validated, report count and observation date. Distinguish an observed spawn from a guaranteed full rotation pool.
- Where current species are unknown: 'No confirmed current rotation available', not old species or an empty false zero.
- Favourite watch: user selects species; do not promise push alerts without a reliable permitted provider integration.
- Direct species -> Pokédex link, remembering currently inspected rotation in cave view.
- History lists complete/partial community observations grouped by rotation and crystal, with explicit date and source. Historic sightings do not prove future rotation probability.

### Changed game rules
- Official July 29 2026: cave inhabitants and Pickup contents rotate by in-game day.
- October 30 patch: some species temporarily removed for balancing; staff subsequently said single-encounter-only species were among those removed while re-evaluating.
- Source dump includes only two static Unown location records at Altering Cave: **not suitable as dynamic data source**.
- Community cave threads can describe mechanics, but may be outdated or speculative. Staff acknowledged not every cave mechanic was made public.
- Some community trackers: https://alpha.pokemmotools.org/altering-cave ; possible feed/API is **not yet verified or licensed**. Do not scrape without provider agreement. Community thread: https://forums.pokemmo.com/index.php?/topic/199670-altering-cave-data/ .

### Refresh / offline behavior
- Avoid reading 'current cave' from a 6+ hour cached historical entry. Use a conservative freshness threshold tied to real verified cadence, or mark all unsynchronized observations 'reported at timestamp'.
- An expired report automatically becomes Historical; missing provider cannot establish which rotation is actually running.
- If trusted source announces changed/corrected observations: preserve audit trail; update display based on appropriate provenance.
- Don't claim a species is currently catchable just because it was available before the Oct 2026 changes.

## C. Special event separation
Halloween 2026 ended by November 13, 2026; retain relevant event data as historical, not active. Post-event persistent mechanics and balance changes remain until officially reverted.
