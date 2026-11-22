# PokeMMO Pokédex — source conflict and availability corrections
**Verified search:** 2026-11-22. **Status:** High-priority correctness research, not an authoritative complete in-game roster. **Requires game validation**.

## Critical source conflict: Virizion
The current `develop` v0.1.0 file `companion/data/pokemmo_availability.json` marks **#640 Virizion: `in_game_dex=no`, classes=`unavailable`, evidence=REPORTED**, based on a PokeMMO wiki page. This is outdated in light of 2026 updates.

**Contrary evidence:**
- Official [Changelog: Lunar New Year 2026](https://forums.pokemmo.com/index.php?/topic/196308-changelog-lunar-new-year-2026/) announces **New Permanent Raid Dens** and 2026 changes. Independently cross-reference exact den/species mapping.
- Updated [The Ultimate Legendary Guide](https://forums.pokemmo.com/index.php?/topic/187603-the-ultimate-legendary-guide/) lists **Virizion, Pinwheel Forest, permanently** in the raids section (edited Feb 21 2026).
- [PikaMMO raid guide](https://www.pikammo.fr/Pokemmo/en/guide/raids) lists Virizion at Pinwheel Forest, 6-star permanent raid.
- [MMOBreeder Virizion](https://mmobreeder.com/pokemon/virizion) says it is catchable from a permanent raid.
- [Perfect Your Pokédex](https://forums.pokemmo.com/index.php?/topic/185042-perfect-your-pok%C3%A9dex-everything-you-can-register/) describes **Cobalion, Terrakion and Virizion added as permanent raids in February 2026**, and multiple forms/special registration conditions.

**Immediate action:** classify Virizion **eligible from permanent raid**, not `unavailable` or blanket absent; verify whether `in_game_dex=yes` appears under the current client and which progress counters it contributes to, rather than guessing number from old wiki. Correct Cobalion #638 and Terrakion #639 accordingly. Add regression tests that prevent reversion to stale 'unavailable' taxonomy.

## More important conceptual mistake: 649, 644, 604, 603 are different concepts
- 649 = National Gen I–V reference species IDs.
- 644 in the current Companion = 649 minus **five weakly identified 'absent' entries**, not verified PokeMMO Pokédex membership.
- User's real current-game screenshot labels Seen 436/604, Owned 216/603, Caught OT 187/603, Alpha 14/362, Shiny 7/603, Costumes 1/12. Their numerators are user-specific; denominators belong to potentially different eligible categories. **Don't assume that 649−604=45 unique missing species, nor that the same denominator is stable across every game update.**
- A frequently updated community completion guide at [Perfect Your Pokédex](https://forums.pokemmo.com/index.php?/topic/185042-perfect-your-pok%C3%A9dex-everything-you-can-register/) references higher maxima like 'Seen 635/635', 'Owned 626/626' and Alpha count 364/365 in later sections. These are **not directly reconcilable with the user's visible 604/603** until measurement date, region, filter, seasonal availability and exact eligibility rules are checked. Don't adopt those numbers blindly, either.
- A species can be listed, appear as a boss or KoTH, be seen, enter Owned via event PvP mode, be caught OT, be permanent, temporary, tradeable, raid-only, shiny-locked or encounterable in a different way. **All are separate axes.**

## Required revised entity model
```text
SpeciesCatalog(id, national_id, types, form_refs, source_revision)
DexMembership(species_id, dex_kind, membership=yes/no/unknown, source_url, validated_at, patch_window)
AcquisitionMethod(species_id, method=wild|roamer|perma_raid|seasonal_raid|temporary_koth|
                  storyline_temporary|event|gift|fossil|breeding|evolution|unavailable|unknown,
                  active_window?, prerequisites?, confidence, source_url, verified_at)
DexEligibility(species_id, metric=seen|owned|caught_ot|caught_alpha|owned_shiny|costume,
               eligible=yes/no/conditional/unknown, rule_source, patch_window)
PlayerDexMark(character_run_id, species_id, metric, status, user_entered_at)
```
Do not infer one axis automatically from another. In-game content screenshot provides **observations**, not a parseable client API.

## Initial high-risk species QA register
| IDs | Current research observation | Action |
| --- | --- | --- |
| 638, 639, **640** | Swords of Justice included in Feb 2026 *permanent raid* changes | Correct Virizion immediately. Validate region, prerequisite, in-game Dex membership; Cobalion/Terrakion not just unknown |
| 641, 642, 645 | Genies of Unova; old community pages say no regular acquisition | Keep `unknown` until PokeMMO 2026 evidence confirms actual Dex presence; do not say 'never obtainable' |
| 647 | Keldeo previously KoTH; community says removed and potential future content | Distinguish formerly contested temporary from permanent ownership, current availability, and historical Seen |
| 243–245, 144–146 | Johto beasts/Kanto birds monthly roaming | Verify rules and how statuses register |
| 485, 488, 648 | Heatran, Cresselia, Meloetta linked to permanent raid content | Validate species-level sources and newest game updates |
| 249, 150, 384, 493 | Lugia, Mewtwo, Rayquaza, Arceus contested or temporary modes | Must not imply permanent ownability because game client can display their icons |
| 644 | Zekrom storyline temporarily used; ownership/OT differs from appearing in Pokédex | Separate story encounter from persistent catch |
| 483, 484, 487, 649 | Creation trio/Genesect can potentially register 'Owned' during restricted event PvP, despite not permanently owned | Explicit event-registration / category rules, not generic 'unavailable' |
| 491, 385, 492 | Darkrai/Jirachi/Shaymin event or raid access differs by season and changes | Date and patch applicability required |

## Data source precedence
1. Current in-game screenshots/legitimate manual confirmation with date + version, PokeMMO staff/official changelogs.
2. Current trusted PokeMMO-specific community completion and raid guides (link, revision, disagreement notes).
3. Current PokeMMO-specific tools only with license/permission and provenance.
4. Existing local dump for **names, stats, abilities, moves, sprites** subject to patch/version, **never ownership or wild/raid eligibility by flag alone**.
5. Generic cartridge/PokéAPI data is NOT authority for PokeMMO availability, encounters, forms, rates or breeding.

If sources conflict: mark `conditional/unknown`, show reason, and queue a manual in-game verification. Do not silently publish 'confirmed' or force totals to match.

## UI/QA priorities
- **Immediate temporary UI safety:** rename currently unverified 644 default to 'PokeMMO reference — eligibility under verification' or similar, and expose known vs unknown; don't claim a complete matching in-game Dex until the manifest is validated. Keep optional 649-reference view distinct.
- **Accurate filters:** 'Available permanently', 'In-game Dex', 'Wild', 'Raids', 'Roaming', 'Special temporary', 'Unverified'; permit overlaps as multiple acquisition methods apply.
- **Regression:** Virizion cannot have `unavailable` while verified `perma_raid`; check Cobalion/Terrakion, each special category, user manual states independent of metadata; test that no hardcoded 604/603 becomes a global roster rule.
- **Source expiry:** after PokeMMO patch notes announce changes, stale affected records go into needs-review state, not auto-asserted unchanged.
- **No illicit source gathering:** PokeMMO policy prohibits reverse engineering and automated input; public [PokeMMO-Tools data repo](https://github.com/PokeMMO-Tools/pokemmo-data) notes memory-dumped item/localization data are not supported and may violate Terms. Use permitted mod resource dumps only in user-local workflows and do not fetch game memory.

## Sources
- https://forums.pokemmo.com/index.php?/topic/196308-changelog-lunar-new-year-2026/
- https://forums.pokemmo.com/index.php?/topic/187603-the-ultimate-legendary-guide/
- https://forums.pokemmo.com/index.php?/topic/185042-perfect-your-pok%C3%A9dex-everything-you-can-register/
- https://www.pikammo.fr/Pokemmo/en/guide/raids
- https://mmobreeder.com/pokemon/virizion
- https://forums.pokemmo.com/index.php?/topic/199536-changelog-shiny-wars-2026/
- https://pokemmo.com/en/code_of_conduct/
- https://support.pokemmo.com/knowledgebase/article/macroing-faq
