# Active development checkpoint — 25 November 2026

Current development version **0.1.0**, develop only. Owner reconfirmed on 25 November 2026: **0.8.0 is the target version for the actual friends-only closed-alpha build**, not for internal QA; translation reviewers join the 0.8.0 closed alpha. Do not bump until that build is ready. This is a status reconciliation, not a new feature authorization. The [original roadmap](00-2026-11-22-FEATURE-STAGING.md), [decision checkpoint](../build/09-V0.1.0-COMPLETE-DECISION-CHECKPOINT.md), and [closed-alpha gates](../closed-alpha.md) retain authority; later approved corrections supersede earlier implementation descriptions.

| Area | State | Remaining gate |
|---|---|---|
| Desktop core, connected tools, settings, themes, popouts | Implemented in prior builds | Regressions, real KDE/Windows behavior, owner review |
| Pokédex, encounters, mechanics, live reports | Implemented with source limitations | Continue daily change watch and weekly accuracy review; do not infer availability or live reports |
| Guides and walkthroughs | 2,845 steps and 318 headings per translated language | Verify coverage and known instruction issues; native-speaker review during closed alpha; derivative redistribution permission |
| Interface localization | English, Spanish and Simplified Chinese offline; 2950 supplemental catalog keys | Remaining reference/service prose, interaction-by-interaction rendered fallback review, font/terminology checks |
| Verification | Prior Build 28: 543 passed, 51 skipped before final correction; subsequent targeted source checks | Full test suite at current exact SHA, full browser route/popout matrix, real dump checks where locally available |
| Packaging | Prior Linux AppImage verified at Build 28, not current | Fresh Linux and Windows QA packages, native tests, checksums; no distribution before approval |
| Friends-only alpha (0.8.0 target) | Version target agreed; build and distribution not approved | Complete localization, verification, quick performance smoke, targeted stabilization, applicable rights and final owner sign-off; language reviewers join alpha |
| Public beta / 1.0 | Future | Alpha feedback, signing and approved reference hosting, platform baseline |

## Owner-confirmed fast path (25 November 2026)

1. **Finish localization.** Target 100% of application-owned user-facing text in English, Spanish and Simplified Chinese: all pages, tools, popouts, dialogs, settings, notifications, native UI, game terms and walkthroughs. Use the existing catalogs, audit and tests; address actual gaps in batches. Intentional originals (personal content, external reports/news, brand names, filenames, technical identifiers and logs) are not missing translations. No unsupported coverage percentage.
2. **Verify.** Run the existing automated regression and localization checks on the current candidate, check rendered fallbacks, glyphs, guide IDs/hashes and preserved data, and resolve material failures. Confirm offline operation, persistence and basic native Linux/Windows launch. Reuse existing route/popout tests instead of creating another exhaustive manual review phase. Local Windows packaging remains an alternative to the private-only hosted workflow; keep its guard.
3. **Quick performance check.** Measure startup and idle CPU/RAM for the app and its child processes, typical navigation, a few floating tools, sprite animations, and shutdown/reopen. Compare with previous evidence where available; investigate only material slowdowns, excessive resource use or leaks. No extensive optimization campaign or arbitrary new performance targets.
4. **Targeted stabilization.** Fix actual blockers and obvious usability defects, retest affected workflows, and run final candidate checks. No new features or unnecessary polishing passes. Confirm applicable asset/reference/walkthrough rights and distribution method.
5. **Friends-only closed alpha 0.8.0.** When the candidate is ready, bump from 0.1.0 to 0.8.0, build and verify the exact versioned Linux and Windows packages and checksums, and share with the owner and invited friends after approval. MaToRiuKo reviews Simplified Chinese and a Spanish-speaking tester reviews Spanish **during this same closed alpha**. Owner gameplay/visual feedback and further language corrections happen during alpha, not as separate mandatory pre-alpha phases. No premature public release, merge, tag or announcement.

See [alpha checklist](../build/30-TRANSLATION-REVIEW-AND-ALPHA-GATES.md). This owner correction supersedes the earlier 99% target and separate pre-alpha reviewer/owner testing stages.

## Deferred / prohibited scope
Android, OCR and cross-device accounts/sync remain future research. No encounter counter, damage calculator, GTL scraping, PokeMMO Hub API, automated gameplay, memory access or merging unrelated projects. Do not reset or overwrite unpublished local work; reconcile with the owner's checkout before a pull.

## Evidence
Latest source changes are tracked in [Build 29](../build/29-LOCALIZATION-SERVICE-ERRORS.md). The connector environment cannot run the full Python/Playwright/Qt app: it has no local checkout, private dump or network clone access. Test results in older reports apply only to the recorded revisions. No release or asset redistribution approval is implied.
