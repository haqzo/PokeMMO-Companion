# Walkthrough translation continuation

This batch preserves all original English steps and adds separate Spanish and Simplified Chinese draft translations for repetitive instructions. The generator only accepts complete, explicitly recognized imperative clauses, requires every source line in a step to be translated, verifies numeric tokens and attaches the original step hash. Existing manually authored entries take priority. This is **not** a native-speaker or gameplay verification. Review wording in context before distribution; complex steps remain English rather than being partially translated.

| Region | Newly generated | Total translated per language (including first ten) | Remaining per language |
|---|---:|---:|---:|
| kanto | 113 | 123 | 331 |
| johto | 100 | 110 | 507 |
| hoenn | 98 | 108 | 418 |
| sinnoh | 153 | 163 | 587 |
| unova | 46 | 56 | 442 |
| Total | 510 | 560 | 2285 |

Regenerate from the repository root with `node tools/localization/build-walkthrough-phrases.mjs`. The generated table is offline and requires no runtime translation service. The original walkthrough text, progress IDs, hashes and credits are unchanged. Original guide permissions and derivative redistribution remain separate from language coverage. Further manual translation and review are required.
