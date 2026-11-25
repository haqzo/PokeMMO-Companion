# Active development checkpoint — 25 November 2026

Development is at **0.8.0 Alpha** on `develop`. The approved version series are 0.8.x Alpha, 0.9.x Beta, 1.0.0 first stable and 1.x.x stable updates. GitHub Releases is the official download location once the owner approves publication from `main`. [Release runbook](../../packaging/README.md#release-packages)

| Area | Current state | Remaining work |
|---|---|---|
| Desktop and personal tools | Earlier native Linux QA exercised fresh launch, single instance, immediate relaunch, popouts, backup and persistence | Interactive checks on the final Linux package and Windows 10 and 11 |
| Offline reference | 649 species, 559 moves, 2,090 items, 629 locations and 33,405 encounters available from bundled data | Continue routine data and translation review |
| Regression | 620 passed and 51 ROM- or dump-dependent tests skipped on the final candidate. The clean-install check passed | Capture package and desktop verification for the approved release tag |
| Balanced performance | Earlier native workloads passed both popout cycles with full renderer recovery | Collect ordinary performance reports during alpha |
| Linux package | Earlier internal AppImage passed offline and extracted KDE smoke tests on CachyOS | Build and check the release on Ubuntu 22.04 x86-64 and test direct FUSE launch |
| Windows package | Hosted Windows x64 build and extracted ZIP backend self-check prepared | Run the release workflow and verify interactive use separately |
| Application updates | Production public key pinned. Prerelease is the default for alpha and beta builds when no channel is saved | Sign and verify the final combined checksums on owner-controlled storage |
| Friends-only alpha | Tester instructions and release notes prepared | Owner approves final source, package staging and distribution |

## Closed-alpha sequence

1. After owner approval for `main` and the release tag, build both packages from the same approved revision. Record package sizes, checksums and the actual platform checks.
2. Run the desktop checklist on target machines and update the release notes with the results. Use the [tester guide](../closed-alpha.md) for installation, recovery and feedback.
3. Ask alpha testers to report wording, layout and interaction issues in Spanish and Simplified Chinese. Review asset permissions and distribution with the owner before any upload. [Earlier Linux QA evidence](../build/31-FINAL-OPTIMIZATION-AND-ALPHA-QA.md)

## Deferred scope

Android, OCR and cross-device accounts and sync remain future research. Encounter counters, damage calculation, GTL scraping, PokeMMO Hub API integration, automated gameplay and memory access remain outside this batch. For prior feature and design decisions, see the [original roadmap](00-2026-11-22-FEATURE-STAGING.md) and [decision checkpoint](../build/09-V0.1.0-COMPLETE-DECISION-CHECKPOINT.md).
