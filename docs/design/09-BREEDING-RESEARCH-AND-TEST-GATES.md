# 09 — Breeding current research, sources and regression gates
**Review date:** 2026-11-22 | **Status:** Source register and unresolved QA plan, not a certified formula implementation.

## Primary and comparison sources
| Source | Specific finding | Authority / caveat |
| --- | --- | --- |
| [Official Jan 13 2015 breeding changelog](https://forums.pokemmo.com/index.php?/topic/49811-changelog-13012015/) | 3 of 6 IVs directly inherited, Everstone nature guarantee, IV braces applied to specified stat | Official historical rule, not proof no later changes |
| [Official Shiny Wars 2026 changelog](https://forums.pokemmo.com/index.php?/topic/199536-changelog-shiny-wars-2026/) | Costume Pokémon can breed and pass costumes; PokeMMO species stats unchanged | Official current-era feature, needs patch follow-up |
| [Official October 30 2026 changelog](https://forums.pokemmo.com/index.php?/topic/201356-changelog-30102026/) | Costumed Pokémon breeding fixes (OT*, compatible other species) and GTL Search Breeders | Official; compare subsequent hotfixes |
| [Official Shiny Wars prize breeding notice](https://forums.pokemmo.com/index.php?/topic/198507-pokemmo-shiny-wars-2026/) | Costume heritage/tradability and original winner history may persist in offspring | Official event context; event over but permanent feature persists |
| [PokeMMO 2022 Alpha/HA changelog](https://forums.pokemmo.com/index.php?/topic/150494-changelog-15102022-pokemmos-10th-anniversary-part-3/) | Introduced Alpha/Hidden Ability and Prismatic Pearls | Official historical baseline |
| [PokeMMO official community HA/Shiny breeding guide](https://forums.pokemmo.com/index.php?/topic/161120-breeding-guide-for-hidden-ability-ha-shiny-ot/) | Shiny/Alpha/HA/OT inheritance edge cases with images | Community-written, must reverify specific mechanics |
| [MMOBreeder guide](https://mmobreeder.com/guides/breeding) | Claims last checked Nov 6 2026; explains tree build, nature step and consumptive parents | Maintained community reference, formula independently test |
| [PokeMMO Hub source](https://github.com/PokeMMO-Tools/pokemmo-hub) | Documents a breeding simulator and egg move tool | Active app code; public data repo older than current patches |
| [Community mass planner](https://forums.pokemmo.com/index.php?/topic/197269-tools-mass-breeding-planner-web-app/) | April 2026 inheritance planning bug fix; August user-export data import support | Demonstrates algorithm pitfalls, doesn't guarantee correct own plan |
| [Wiki breeding items](https://pokemmo.shoutwiki.com/wiki/Breeding_Items) | Power items and Everstone descriptions; lists brace cost 10k | Secondary, and full page currently blocks automated page access. Verify in-game price |
| [Current PokeMMO Shiny Wars forum posts and 2026 game client](https://forums.pokemmo.com/index.php?/forum/5-updates/) | Patch applicability and currently visible breeder interface | Best reality check when available, do not infer from old screenshots |

Source-access note: indexed results from official forums were used to cross-check some recent details; not every full forum page was directly retrievable (access controls/cache). Continue seeking direct official texts and in-game captures. Do NOT falsely mark those as full-source verified.

## Required recorded goldens — manual PokeMMO comparison
Each approved test case stores:
- Source/official patch and its effective date.
- Game client build or screenshot date, language and relevant region.
- Parent A and B: National #, base species, gender, form/costume, Shiny/Secret Shiny, Alpha, HA potential, moves, nature and six IV values.
- Parent items: Power Weight/Bracer/Belt/Lens/Band/Anklet, Everstone or none.
- Expected offspring species and valid eligibility, all six IV result ranges/probabilities, nature, inherited moves, gender/fee, OT/costume/shiny/alpha/HA status where known.
- Result from REAL PokeMMO breeder preview and/or specific official rules. Record exact mismatch or unknown.
- Test confidence: official stable changelog / current game observed / corroborated / estimate / unknown.

## Prioritized fixture groups
**P0 baseline:** 
A. Two parents with six equal IVs; no braces; expected guaranteed matches. 
B. Two parents with different IVs; no items; compare each preview range and any probability display against live UI. 
C. One parent braces HP and other braces Speed; verify both guaranteed IVs and other inherited rolls.
D. Parent A Everstone + Parent B brace; nature and overlapping IVs.
E. Same parent Everstone and brace selection is prevented.
F. Two incompatible parents, wrong gender, baby species, Ditto-Ditto invalid case.

**P1 graph/inventory:** 
G. A 2×31 -> 3×31 -> 4×31 path with explicit actual available parents.
H. Natured 5×31 target with alternative methods; verify item totals, genders and intermediate consumption.
I. Genderless family exceptions, male-only breeding with Ditto, species line selection.
J. Personal breeder inventory: one breeder cannot be scheduled for two branches simultaneously; user undo is reversible.
K. Egg move chain passing actual learnable moves (no unverified source/move metadata).

**P2 special/patch-sensitive:**
L. Shiny + Shiny, Shiny + non-Shiny; original trainer display and all special exceptions.
M. Alpha + Alpha vs Alpha + normal; Alpha status and HA potential inheritance.
N. Costume carrying parent + same species vs compatible other species, across 2026 fixes; preserve winner-history where confirmed.
O. Costumed Pokémon + Ditto (where breedable); verify official post-October fixes.
P. Move/ability patch regression, unusual egg groups, Shiny Wars 2026 user-export payload import, permissions and format.

## Explicit unresolved questions
- What is the **current November 2026** full offspring IV probability formula and integer rounding for mixed stats? Original 2015 changelog is insufficient for all current numerical outputs.
- Do current 2026 breeding windows retain the three-column presentation exactly? Observed forum screenshots are mostly 2020–2024. Need a fresh in-game screenshot or short clip.
- What exact fields are emitted by PokeMMO's 2026 user-export feature, and which character/private attributes are present? No import support promised before safe schema/permissions review.
- What are current fee tiers for rare gender ratios and current brace/Everstone prices? Avoid guessing as current.
- Which costume inheritance/OT history exceptions have been corrected by Oct/Nov 2026 patches? Need direct regression cases.
- What are the complete current rules for Shiny/Secret Shiny, Alpha/HA and ability/OT lineage, including Ditto exceptions?
- Current egg move inheritance/priority and special evolution family cases, including 2026 move availability.
- Whether an existing planner library can be reused legally and technically, without silently importing wrong mechanics.

## Release policy
Until P0 fixtures are validated, preview may display user data and documented **possibilities**, but numerical probabilities / "Guaranteed" claims must be disabled or labelled "Not validated" where uncertain. Plan graph may be shown using authored fixture data in Claude's future prototype but cannot present fictional perfect breeding paths as live advice.
P1/P2 special branches must be source-gated. Source/datestamp displayed on hover or in detail panel.
