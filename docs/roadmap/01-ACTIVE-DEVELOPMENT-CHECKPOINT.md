# Active development checkpoint — 25 November 2026

Current development version **0.1.0**, develop only. Owner reconfirmed on 25 November 2026: **0.8.0 is the target version for the actual friends-only closed-alpha build**, not for translation review or internal QA. Do not bump until that build is ready. This is a status reconciliation, not a new feature authorization. The [original roadmap](00-2026-11-22-FEATURE-STAGING.md), [decision checkpoint](../build/09-V0.1.0-COMPLETE-DECISION-CHECKPOINT.md), and [closed-alpha gates](../closed-alpha.md) retain authority; later approved corrections supersede earlier implementation descriptions.

| Area | State | Remaining gate |
|---|---|---|
| Desktop core, connected tools, settings, themes, popouts | Implemented in prior builds | Regressions, real KDE/Windows behavior, owner review |
| Pokédex, encounters, mechanics, live reports | Implemented with source limitations | Continue daily change watch and weekly accuracy review; do not infer availability or live reports |
| Guides and walkthroughs | 2,845 steps and 318 headings per translated language | Native-speaker/gameplay review and derivative redistribution permission |
| Interface localization | English, Spanish and Simplified Chinese offline; 2900 supplemental catalog keys | Remaining reference/service prose, interaction-by-interaction rendered fallback review, font/terminology checks |
| Verification | Prior Build 28: 543 passed, 51 skipped before final correction; subsequent targeted source checks | Full test suite at current exact SHA, full browser route/popout matrix, real dump checks where locally available |
| Packaging | Prior Linux AppImage verified at Build 28, not current | Fresh Linux and Windows QA packages, native tests, checksums; no distribution before approval |
| Friends-only alpha (0.8.0 target) | Version target agreed; build and distribution not approved | Localization review, asset and walkthrough rights, native QA, final owner sign-off |
| Public beta / 1.0 | Future | Alpha feedback, signing and approved reference hosting, platform baseline |

## Owner-confirmed work order (25 November 2026)

1. Finish Spanish and Simplified Chinese throughout the application, targeting approximately 99% coverage of application-owned user-facing text before translation-review testing. Include every page, tool, popout, mode, settings section, onboarding, dialogs, notifications, error/empty states, accessibility, native UI, game terms and walkthroughs where possible. Intentional original-language user text, external reports/news, filenames, URLs, technical logs, brand names and invariant identifiers do not count as missing translations. Counts alone do not establish a measured percentage.
2. Verify source coverage, terminology, numeric placeholders, guide IDs/hashes, font rendering and original data preservation. Run the current exact SHA's clean-profile regression suite and rendered browser audit in three languages (53 destinations × three sizes, 17 popout tools × three modes). Test interactions and error states, not just initial page render. Recheck persistence, backup, mechanics, offline startup and live-source opt-in. Prepare fresh Linux/Windows development QA packages. Existing Windows hosted workflow is private-only; repository visibility observed public on 25 November. Keep the guard; local Windows build is an alternative. No artifact redistribution before appropriate permission.
3. Translation review with MaToRiuKo (Simplified Chinese) and a Spanish-speaking reviewer (name not specified). Keep version 0.1.0 for the review builds. Provide a clear review checklist and record build SHA, locale, page/tool, original and corrected wording, issue type, and screenshots where appropriate. Correct terminology, gameplay instructions, wrapping, glyphs, and untranslated application text. Recheck corrected translations. Owner and reviewers can coordinate review; this is not the friends-only alpha launch.
4. Owner's full functional and visual test pass (including review videos) across existing tools, main window and popouts. Fix bugs, performance, layout, usability, data accuracy, persistence and platform-specific issues; preserve all existing agreed features and personal data. Repeat tests as necessary.
5. Final stabilization: full regression and native Linux/KDE and Windows smoke tests on the final candidate, package inventory/checksums, tester guide and recovery instructions. Confirm asset and walkthrough derivative redistribution rights, intended audience, and final distribution approval. No claims of completion without evidence.
6. When the actual friends-only alpha build is ready, bump version from 0.1.0 to **0.8.0**, build and verify that exact version, and distribute with owner approval. No premature version bump, main merge, release, tag or public launch. The precise release/tag mechanism is a separate decision; the agreed app version is 0.8.0.

See [translation review checklist](../build/30-TRANSLATION-REVIEW-AND-ALPHA-GATES.md). This sequence supersedes outdated earlier wording that left the target version undecided.

## Deferred / prohibited scope
Android, OCR and cross-device accounts/sync remain future research. No encounter counter, damage calculator, GTL scraping, PokeMMO Hub API, automated gameplay, memory access or merging unrelated projects. Do not reset or overwrite unpublished local work; reconcile with the owner's checkout before a pull.

## Evidence
Latest source changes are tracked in [Build 29](../build/29-LOCALIZATION-SERVICE-ERRORS.md). The connector environment cannot run the full Python/Playwright/Qt app: it has no local checkout, private dump or network clone access. Test results in older reports apply only to the recorded revisions. No release or asset redistribution approval is implied.
