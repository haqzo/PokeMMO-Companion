# Walkthroughs: concrete discrepancy against November 19 official changelog

Five uploaded walkthroughs were checked by extracting their ODT `content.xml` text (without changing files).

| File | `Defog` mentions | Interpretation |
|---|---:|---|
| KANTO COMPLETE WALKTHROUGH(3).odt | 0 | Missing the newly introduced HM Defog acquisition at Lavender Town tower 1F |
| HOENN COMPLETE WALKTHROUGH(3).odt | 0 | Missing newly introduced HM Defog acquisition at Rusturf Tunnel |
| JOHTO COMPLETE WALKTHROUGH(3).odt | 0 | Missing newly introduced HM Defog acquisition at Route 28 |
| UNOVA COMPLETE WALKTHROUGH(3).odt | 0 | Missing newly introduced HM Defog acquisition at Celestial Tower Rooftop |
| SINNOH COMPLETE WALKTHROUGH(3).odt | 8 | Existing Sinnoh Defog instructions present; not automatically confirmed accurate |

**Important:** Zero mentions only proves the textual omission, not the exact step where an item should be added. Do not edit the original walkthroughs or automatically insert instructions without validating area access and route progression in current PokeMMO. New item locations were specified by the official November 19, 2026 changelog at:
https://forums.pokemmo.com/index.php?/topic/201822-changelog-november-19th-2026/

## Claude / research requirement
- Normalize all five region guides into steps with `region`, `location`, `order`, `text`, `kind` (item, badge, NPC, route, battle, optional), `verified_patch`, `verified_at`, `source`, and `optional`.
- Preserve original wording in source and generate a separate correction overlay. The original guide may contain other outdated instructions; absence of Defog is only our first automated confirmed gap.
- User controls all checkmarks manually, per character; save automatically and allow backups. Do not infer progress from game or capture screen without opt-in.
- Cross-link step references to Pokédex location data, but avoid making walkthrough availability dependent on whether an individual Pokemon is obtainable.