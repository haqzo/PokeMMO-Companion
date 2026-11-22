# 01 — Data inventory and accuracy policy

## Directly audited user archive

Input: `Pokemmo-Dumps(5).zip` supplied in conversation. Each of nine nested ZIPs was opened and CRC-tested successfully.

| Archive | Contents |
|---|---|
| `ItemSpriteDump.zip` | 2,366 PNGs + metadata XML |
| `PokemmoBattleSpritesDump.zip` | 3,033 PNGs + metadata/text files |
| `PokemmoIconsDump.zip` | 2,860 PNGs + metadata XML |
| `OverworldNPCSpritesDump.zip` | 24,659 PNGs + metadata XML |
| `TRainerSpritesDump.zip` | 569 PNGs + metadata XML |
| `PokemmoCriesDump.zip` | 649 WAVs + metadata XML |
| `PokedexData.zip` | 720 monster rows, 559 move rows, 3,006 item rows |
| `Stroryline-Strings.zip`, `XML-Strings.zip` | Language/string XMLs |

## Critical raw data statistics

- 720 monster entries = 649 IDs 1–649 plus 71 higher IDs (including forms, bosses, event creatures, placeholders).
- `obtainable=true`: 622; `obtainable=false`: 98. These are **dump flags only**, NOT a verified ownership guide.
- 33,405 *rows*, not necessarily unique species/location combinations (rows can vary by seasons/times/methods).
- Rows in Kanto: 7,520; Johto: 6,006; Hoenn: 5,539; Sinnoh: 7,438; Unova: 6,902.
- 559 monster entries have any location rows. 63 monsters marked `obtainable=true` have none.
- Rows tagged horde 3x: 906; horde 5x: 4,076 (these are row counts, NOT unique horde spots).
- Rarity fields contain percentages as strings **and** labels such as `Lure`, `Special`, and `--`. Do not coerce non-numeric labels to 0%, nor present unknown as a rate.
- Each location row includes `type`, `region_id`, `region_name`, `location_id`, `location_name_full`, `min_level`, `max_level`, `season`, morning/day/night rarity fields, `form`, and horde flags.
- Monster records also include types, abilities, evolutions, held items, stats, EV yields, tiers, and move acquisition methods.

## Specific false assumption demonstrated by primary source

The user dump marks Zekrom `obtainable=true` but no ordinary locations. Official PokeMMO support states that Zekrom must be caught in Unova's story, but cannot be kept after the story sequence. Therefore `obtainable=true` cannot be equated with `wild catchable` or `permanently ownable`.

Official evidence: https://support.pokemmo.com/knowledgebase/article/catching-zekrom

## Proposed *application* availability taxonomy (not native dump fields)

- `wild_permanent`: verified normal wild / permanent possession.
- `evolution_or_breeding`: available through non-wild permanent methods.
- `gift_fossil_trade_or_other`: verified permanently obtainable method.
- `monthly_roamer`: rotating with verified dates, region, rules and prerequisites.
- `raid_permanent`: permanent raid unlock/reward with verified current rules.
- `event_limited`: obtainable only at named dates/events; never imply active today without live evidence.
- `temporary_story`: obtained for a story segment, not kept afterward (verified example: Zekrom).
- `temporary_competitive_or_king_of_hill`: temporary ownership mechanics, where currently verified.
- `unavailable`: only when confirmed for the relevant game version.
- `unknown`: until verified; **prefer unknown rather than guessing**.

Store multiple availability mechanisms per species, not a single Boolean. Add source URL, exact evidence date, data version, last verification date, notes, and confidence/verification level for each claim.

## Guardrails

1. No generic PokeAPI or cartridge fallback for PokeMMO mechanics without prominently marking the field unverified.
2. Never combine percentages from separate time/day/season/method records as if they share a denominator.
3. Use separate forms and cosmetic costumes; only show variants backed by verified source data.
4. Preserve `--`, `Special` and `Lure` as named labels. Definitions of rarity flags still need field-level documentation.
5. Mark PokeMMO July 29, 2026 overhaul and the October 2026 mechanics updates as potential invalidation dates for older sources.
6. Keep an evidence ledger and regression fixture for every calculator formula; do not start by copying a generic Gen V calculator.
7. A locally generated export's modification date **does not prove** the snapshot reflects the newest server encounter tables.
8. Do not represent the guide's personal caught/owned flags as game state. Anything tracked is manually saved and per character.