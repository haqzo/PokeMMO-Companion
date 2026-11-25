# Build 29 — timer, bookmark and item-terminology continuation

Starting checkpoint: 67f0b244ad623c2304bf783acfa5cdbe43b9c81d.

- 39 additional three-language interface keys and 14 native message entries (64cff994782f124c347b37c5a5c9535f965d75c2). Localized timer completion, guide notification links, late timer messages, duration validation, built-in presets, bookmark categories/descriptions, bookmark validation, and floating Pokédex catalog labels.
- Corrected 102 unresolved item string references (50 Spanish, 52 Chinese) using 33 known client string references. Added two missing Spanish potion variants, and corrected the two Chinese Kanto particle-effect labels. The correction table is used by the catalog generator, and the item display helper no longer prefers an unresolved imported label over the corrected catalog. Raw data and canonical IDs remain untouched.
- Custom bookmark descriptions are preserved unless their seed key and exact original source text match. Standard bookmark category display labels are localized; category values remain unchanged. Timer completion names and routing are preserved.
- All 2,729 interface keys are unique, nonempty and have matching placeholders. Isolated JavaScript helper checks passed in en/es/zh. New browser assertions and native timer notification regression cases added; not executed in the full application. The item catalog now contains zero unresolved STRING references in either translated language.
- Custom item token expansions are descriptive when the official wording is unavailable; native-speaker and client terminology verification remain open. Raw imported item descriptions may still have unresolved references. The full runtime audit, full regression suite, and QA builds remain pending.

Version remains 0.1.0; develop only. No release or merge.
