# Active development checkpoint — 25 November 2026

Version 0.1.0, develop only. This is a status reconciliation, not a new feature authorization. The [original roadmap](00-2026-11-22-FEATURE-STAGING.md), [decision checkpoint](../build/09-V0.1.0-COMPLETE-DECISION-CHECKPOINT.md), and [closed-alpha gates](../closed-alpha.md) retain authority; later approved corrections supersede earlier implementation descriptions.

| Area | State | Remaining gate |
|---|---|---|
| Desktop core, connected tools, settings, themes, popouts | Implemented in prior builds | Regressions, real KDE/Windows behavior, owner review |
| Pokédex, encounters, mechanics, live reports | Implemented with source limitations | Continue daily change watch and weekly accuracy review; do not infer availability or live reports |
| Guides and walkthroughs | 2,845 steps and 318 headings per translated language | Native-speaker/gameplay review and derivative redistribution permission |
| Interface localization | English, Spanish and Simplified Chinese offline; 2895 supplemental catalog keys | Remaining reference/service prose, interaction-by-interaction rendered fallback review, font/terminology checks |
| Verification | Prior Build 28: 543 passed, 51 skipped before final correction; subsequent targeted source checks | Full test suite at current exact SHA, full browser route/popout matrix, real dump checks where locally available |
| Packaging | Prior Linux AppImage verified at Build 28, not current | Fresh Linux and Windows QA packages, native tests, checksums; no distribution before approval |
| Friends-only alpha | Not approved | Localization, asset and walkthrough rights, version/distribution approval, native QA, owner sign-off |
| Public beta / 1.0 | Future | Alpha feedback, signing and approved reference hosting, platform baseline |

## Next work in order
1. Finish remaining application-owned localization; preserve user text, provider content, canonical IDs and source data. Distinguish translation coverage from language review.
2. Run clean-profile regression suite and browser audit in three languages, 53 destinations and 17 popout tools across modes and sizes; capture fallback and glyph issues rather than merely counting translations. Recheck persistence, backup, mechanics, offline startup, and live-source opt-in.
3. Prepare local QA builds and run real native Linux/KDE and Windows checks. Existing Windows hosted workflow is private-only; repository visibility observed public on 25 November. Do not bypass the guard or upload artifacts without approval. Local Windows packaging remains an alternative.
4. Owner manual review and correction pass; confirm all rights and release gates before any alpha distribution, merge, tag or version change.

## Deferred / prohibited scope
Android, OCR and cross-device accounts/sync remain future research. No encounter counter, damage calculator, GTL scraping, PokeMMO Hub API, automated gameplay, memory access or merging unrelated projects. Do not reset or overwrite unpublished local work; reconcile with the owner's checkout before a pull.

## Evidence
Latest source changes are tracked in [Build 29](../build/29-LOCALIZATION-SERVICE-ERRORS.md). The connector environment cannot run the full Python/Playwright/Qt app: it has no local checkout, private dump or network clone access. Test results in older reports apply only to the recorded revisions. No release or asset redistribution approval is implied.
