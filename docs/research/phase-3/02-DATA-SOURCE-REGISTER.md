# Source register and trust rules

| Priority | Source | Currency / confidence | Proper use |
|---|---|---|---|
| 1 | [Official PokeMMO updates](https://forums.pokemmo.com/index.php?/forum/5-updates/) / [official website](https://pokemmo.com/en/) | Primary authority for patches. Some forum HTML may block direct fetch; indexed copies have been cross-checked | Exact stable patch effects and time-bound changes |
| 1 | [Official PokeMMO rules](https://pokemmo.com/en/code_of_conduct/) and [terms](https://pokemmo.com/en/tos/) | Primary authority | Safety boundaries for external tool |
| 2 | User's local `Pokemmo-Dumps(5).zip` | Snapshot **has no embedded game extraction date**; valid data and assets but needs patch diffs | Asset inventory, foundational species info, fields/sprite mapping, candidate encounter tables; never assume a flag alone is authoritative |
| 2 | Current in-game Pokédex / tested game observation | Accurate only for captured screenshot/client version | Disputed rates, move effects, breeding, current rotations |
| 3 | [Team Synergy](https://synergymmo.com/) / [Pokédex](https://synergymmo.com/pokedex/) | Reports July 29 2026 encounter refresh; field freshness still must be checked | Independent hunt-location and strategy cross-reference |
| 3 | [PokeMMO Hub](https://pokemmohub.com/) + [app source](https://github.com/PokeMMO-Tools/pokemmo-hub) | App repo last pushed Nov 18 2026, but [separate open-data repo](https://github.com/PokeMMO-Tools/pokemmo-data) last pushed Aug 19 2025 | UI inspiration, manually verified breeding/locations; no unlicensed price API access |
| 3 | [PokeMMO Showdown](https://www.mmoshowdown.com/) / [damage calc source](https://github.com/PokeMMO-Showdown/mmoshowdown-damage-calc) | Calculator repo last pushed Nov 21 2026 | Best current candidate for formula/reference and regression fixtures, not permission to copy blindly |
| 3 | [Alphapedia](https://alpha.pokemmotools.org/alphapedia) and [ntfy topic](https://ntfy.pokemmotools.org/alphapings) | Source publicly documents alpha/swarms. Actual message JSON format and live uptime **not tested** | Timestamped community reports; freshness required |
| 3 | [PokeMMO wiki Altering Cave](https://pokemmo.shoutwiki.com/wiki/Altering_Cave) / [community cave tracker](https://alpha.pokemmotools.org/altering-cave) | Rotates every in-game day, ~6 real hours, but Oct 2026 species removals require revalidation | Rotating status / historical trends, not guaranteed future schedule |
| 4 | [PokeMMO Shoutwiki](https://pokemmo.shoutwiki.com/) / [Breeding items](https://pokemmo.shoutwiki.com/wiki/Breeding_Items) | Editorial updates vary; inspect revision time | Secondary checks for mechanics |
| 4 | [MMOBreeder](https://mmobreeder.com/) / [breeding guide](https://mmobreeder.com/guides/breeding) | Guide says last checked Nov 6, 2026 | Additional cross-check. Caveat: their displayed site data may still contain errors |
| 4 | [Roaming legendary forum FAQ](https://forums.pokemmo.com/index.php?/topic/160729-roaming-legendaries-faq/) | Older community consensus; compare subsequent updates before declaring current | Monthly cycle as candidate, not exact live spawn verification |
| 5 | General PokéAPI / cartridge guides | Gen 1–5 species baseline only, often wrong for PokeMMO | Fallback labels only, never gameplay values without explicit evidence |

## Per-field provenance contract
Every publishable game-specific field must have:
```
{value, source_kind, source_uri_or_dump_key, source_date, game_patch_min,
  game_patch_max_or_null, region, form_id, status: VERIFIED|CORROBORATED|DUMP_ONLY|ESTIMATE|STALE|UNKNOWN,
  checked_at_utc, notes}
```
Missing source is **UNKNOWN**. Recent website build dates do NOT set game facts to VERIFIED. “Event ended” clears temporary status, not all persistent changes applied alongside the event.

## Redistribution restrictions
PokeMMO's published video policy explicitly states that assets from the client may not be taken and distributed separately: https://pokemmo.com/en/video_policy/ . Keep **all** client-derived sprites/audio/raw dumps outside public repo/build artifacts, pending explicit rights review. Research-only local analysis is not a redistribution license. Prefer independently licensed art or local user import; document what is permitted before a release.