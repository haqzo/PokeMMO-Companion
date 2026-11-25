# Active development checkpoint — 25 November 2026

Development remains **0.1.0** on `develop`. The owner will approve the version change to **0.8.0** for the friends-only closed alpha. The [final optimization and packaging report](../build/31-FINAL-OPTIMIZATION-AND-ALPHA-QA.md) records the tested source, measurements, package checksum and verification limits.

| Area | Current state | Remaining work |
|---|---|---|
| Desktop and personal tools | Fresh launch, single instance, immediate relaunch, popout lifecycle, backup and persistence verified on Linux | Windows build and fresh-machine smoke test |
| Offline reference | Clean-profile check passed with 649 species, 559 moves, 2,090 items, 629 locations and 33,405 encounters. All five walkthroughs rendered from the package | Continue normal reference maintenance and accuracy review |
| English, Spanish, Simplified Chinese | Automated route and popout checks. The packaged app rendered each language and loaded the bundled Companion Han font | Spanish and Simplified Chinese language feedback during closed alpha |
| Balanced performance | Complete. Both native workloads passed two popout cycles with full renderer recovery | Collect ordinary performance reports during the alpha |
| Regression | 605 passed, 51 skipped, zero failures on the packaged source | See skip reasons in the QA evidence |
| Linux package | Version 0.1.0 x86-64 AppImage passed integrity checks, extraction fallback, offline QA and KDE smokes | Verify mounted execution on a FUSE-enabled host and determine the supported Linux compatibility baseline |
| Windows package | Build and private-only hosted workflow ready for Windows verification. The workflow checks the extracted ZIP | Build the ZIP and run the Windows desktop checklist |
| Friends-only alpha | Ready for an owner-approved build on the tested KDE Linux configuration via extraction | Owner approves 0.8.0, final package scope and distribution |
| Public beta / 1.0 | Future | Alpha feedback, signing, approved reference hosting and platform baseline |

## Closed-alpha sequence

1. Verify the Windows ZIP on a Windows x64 machine for a two-platform alpha. Use the [packaging guide](../../packaging/README.md#windows-x86-64) and the same offline, restart and personal-data checks as Linux.
2. Once the owner approves the wave and version, build and verify the 0.8.0 packages, record their source commit and checksums, and use the [tester guide](../closed-alpha.md) for installation, recovery and feedback.
3. MaToRiuKo reviews Simplified Chinese and a Spanish-speaking tester reviews Spanish during the same 0.8.0 closed alpha. Use their feedback for wording, terminology, layout and interaction fixes.

Distribution decisions, asset and walkthrough permissions, and credits belong to the owner. Independent internal packaging uses the existing bundled assets and notices. Public release, tags, main merge and announcements require owner approval.

## Deferred scope

Android, OCR and cross-device accounts and sync remain future research. Encounter counters, damage calculation, GTL scraping, PokeMMO Hub API integration, automated gameplay and memory access remain outside this batch. For prior feature and design decisions, see the [original roadmap](00-2026-11-22-FEATURE-STAGING.md) and [decision checkpoint](../build/09-V0.1.0-COMPLETE-DECISION-CHECKPOINT.md).
