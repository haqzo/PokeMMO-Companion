# 01 — Direct dump forensics
**Evidence:** Direct extraction of user-uploaded `Pokemmo-Dumps(5).zip`. These are SOURCE CONTENT observations, not automatic claims of current in-game accuracy.

## Nine embedded ZIPs
| Member | Contents observed |
|---|---|
| ItemSpriteDump.zip | 2,366 PNG item icons plus XML metadata |
| PokemmoBattleSpritesDump.zip | 3,033 PNG battle sprites plus XML and scaling/offset tables |
| PokemmoIconsDump.zip | 2,860 PNG 36×36 monster icons plus XML |
| OverworldNPCSpritesDump.zip | 24,659 PNG overworld/NPC sprites plus XML |
| TRainerSpritesDump.zip | 569 trainer sprites plus XML |
| PokemmoCriesDump.zip | 649 WAV cries plus XML |
| PokedexData.zip | JSON datasets: 720 monsters, 559 skills, 3,006 items |
| Stroryline-Strings.zip | Six English storyline XML files |
| XML-Strings.zip | Eleven localized string files (de, ja, ko, fr, it, es, en, zh, pl, zh-Hant, pt-BR) |

All nine inner ZIPs passed ZIP CRC checks. Source metadata `info.xml` identifies a `Dumped Resources` resource (`version="0.0"`) but does **not** give an authoritative game build/version; the archive's upload or modification date is not proof of current in-game data.

## The Pokédex
- 720 monster records: all IDs 1–649 (National Gen I–V) plus 71 extra internal entries beyond 649, including special forms/boss/event/debug data.
- Dump Boolean `obtainable=true`: **622**. Dump Boolean `obtainable=false`: **98**. This is not a verified current permanently-ownable species count.
- Location rows: **33,405** total, of which **7,520 Kanto**, **6,006 Johto**, **5,539 Hoenn**, **7,438 Sinnoh**, **6,902 Unova**.
- **559** monster records have at least one location row; **63** records with `obtainable=true` have *no* conventional location row.
- **906** records tagged 3× horde, **4,076** tagged 5× horde: these are **season/method rows**, not unique horde spots.
- Location row fields: `form`, `type`, `region_id`, `region_name`, `location_id`, `location_name`, `location_name_full`, `min_level`, `max_level`, `season`, `is_horde_3x`, `is_horde_5x`, `rarity_flags`, `rarity_morning`, `rarity_day`, `rarity_night`.
- Encounter methods observed: Cave, Grass, Water, Super Rod, Good Rod, Inside, Old Rod, Dark Grass, Rocks, Headbutt, Fishing, Shadow, Dust Cloud, Sweet Scent, Honey Tree.
- Seasons observed: Spring, Summer, Autumn, Winter, Any. Do not assume `Any` means a fifth season.
- Rarity values mix numeric percentage strings with `Lure`, `Special`, and `--`. These must **never** be coerced into 0%, summed arbitrarily, or displayed as guaranteed odds.
- `rarity_flags` values observed: 0, 32, 64, 256, 512, 1024, 2560. Meanings require verification; do not hardcode guessed semantics.

## Sprite mapping audit
- All 649 National species IDs have **at least one** corresponding icon in `sprites/monstericons/`.
- Every National species ID has at least one normal front battle sprite in `sprites/battlesprites/`.
- **Three** species lack the naive generic icon path `<id>-0.png`: **521 Unfezant, 592 Frillish, 593 Jellicent**. All three have gender-suffixed alternatives such as `<id>-0-m.png` and `<id>-0-f.png`. This is a concrete reason for a sprite resolver with gender/form fallbacks, not filename concatenation.
- Standard icon images inspected are **36×36 px**; battle sprite examples inspected are **96×96 px**. Use pixel-accurate nearest-neighbor scaling where appropriate; don't stretch small icons arbitrarily or silently use a shiny sprite.
- `items.json` includes `icon_id` and `region_id`; 20 of 3,006 item records do not resolve by direct `sprites/itemicons/<icon_id>.png`. Some icon IDs need special mapping/fallback or missing-asset indicators.
- Battle sprite filenames distinguish front/back, normal/shiny, and sometimes male/female. Full form/costume mapping needs additional verification.
- Overworld/NPC assets should not be dumped into normal app UI or shipped merely because the file contains them.

## Pokémon data fields observed
ID, name, growth/experience group, catch rate, Boolean obtainable, `gender_ratio`, height, weight, egg groups, abilities, forms, evolution links, move acquisition entries, types, six base stats, EV yields, PvP tiers, held items and locations.

Important pitfalls:
- Move acquisition method `TM??` appears **44,705 times** across monster learnsets; the label is ambiguous. **Do not display those entries as confirmed currently obtainable TMs.**
- `gender_ratio` is stored as a numeric code (e.g. Bulbasaur `31`), **not a directly renderable percentage** without mapping validation.
- Ability lists may contain repeated IDs; normalize display without losing slot/hidden-ability semantics.
- `items.json` gives names/descriptions/IDs; it does **not** supply a trustworthy current GTL market price feed.
- `skills.json` has IDs, names, type, category, power, accuracy, PP, priority, targeting, and `true_damage`; it is not a complete engine for status effects, abilities, weather, raids, multi-hit modifiers or damage.
- Several entries with `obtainable=true` (including Zekrom, Mewtwo, roaming legendaries) do not have wild locations. Those require different acquisition and ownership classes.
- Actual internal `forms` counts include **739 nested form records** and **14 marked costume forms**; do not confuse extra `monsters.json` internal IDs with dex species or alternate forms.

## Concrete raw records for test fixtures
- **Bulbasaur (#001):** `obtainable=true`; sample Viridian Forest grass entry with `rarity_morning="Lure"`. This is a dump fact, not a claim of verified live encounter percentage.
- **Pikachu (#025):** dump includes seasonal Power Plant Inside encounters and season/time-aware Route 1 entries, along with a separate 5× horde row. A species can have multiple context-dependent encounter rows; a UI must never show one global encounter rate.
- **Zekrom (#644):** `obtainable=true` and zero normal location entries. Official PokeMMO support confirms the catch is temporary in the Unova storyline; permanently-ownable status is not implied.
- **Unfezant (#521):** gendered icons exist but the unsuffixed `521-0.png` doesn't.

## Release packaging and legal considerations
Official PokeMMO video policy says client assets must not be extracted and distributed separately. Do **not** push sprites, cries, trainer art or XML string dumps into a public repository as part of our default plan. Keep all raw dumps private, review permission requirements, and prefer a user's local import workflow or assets with redistribution rights. See sources in `09-SOURCES-AND-OPEN-ISSUES.md`.

## Machine audit
See `RAW-DUMP-AUDIT.json` for exact counts, discovered flags, SHA-256 and integrity checks; it contains **no sprites, ROMs, cries, or extracted game JSON data**.