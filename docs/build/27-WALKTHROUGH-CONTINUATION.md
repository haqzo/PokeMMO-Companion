# Walkthrough translation continuation

Separate Spanish and Simplified Chinese draft translations preserve original English steps and progress identifiers. The build-time generator handles only completely recognized imperative clauses and an explicit manually translated phrase dictionary. Every generated entry retains the canonical hash; numeric tokens must match. Existing manual starter translations take priority. These are community-review drafts, not a full gameplay or native-speaker review. Unrecognized and complex steps remain English.

| Region | Additional bilingual drafts | Total translated per language | Remaining per language |
|---|---:|---:|---:|
| kanto | 444 | 454 | 0 |
| johto | 121 | 131 | 486 |
| hoenn | 127 | 137 | 389 |
| sinnoh | 174 | 184 | 566 |
| unova | 65 | 75 | 423 |
| Total | 931 | 981 | 1864 |

Regenerate with `node tools/localization/build-walkthrough-phrases.mjs`. Preserve existing drafts when extending rules. Original guide content, credit, hashes and progress remain unchanged. Derivative redistribution and native-speaker review remain outstanding.

The next manual pass adds 41 Kanto drafts, checked against canonical IDs, source hashes and numeric tokens. No original guide records were changed. Full application and walkthrough localization remain open.

Four manual batches add 216 Kanto drafts (including the 41 above). All 454 Kanto step IDs now have matching Spanish and Simplified Chinese entries. Coverage does not imply native-speaker validation, gameplay verification or translated distribution permission. Other regions, interface text and source notes remain incomplete.

## Subsequent audit

The [November 25 localization audit](28-LOCALIZATION-AUDIT.md) independently counted 1,196 bilingual entries at `ee451d7` and raised coverage to 1,237 of 2,845 per language. It also documents the completed chapter heading catalog, quality fixes, stronger regression checks and the remaining application and walkthrough work.
