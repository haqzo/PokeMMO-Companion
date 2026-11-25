# Active development checkpoint — 25 November 2026

## Current status: public 0.8.0 Alpha

PokeMMO Companion's first public alpha went live on **25 November 2026** (22:22:53 UTC / 23:22:53 CET on GitHub). The owner approved publication. It is a public prerelease, not a draft or a friends-only build. Treat older closed-alpha, build-preparation and 0.1.0 documents as historical records, not current instructions.

- [Public v0.8.0 release and downloads](https://github.com/haqzo/PokeMMO-Companion/releases/tag/v0.8.0)
- [PokeMMO forum announcement](https://forums.pokemmo.com/index.php?/topic/201960-tools-pokemmo-companion-your-all-in-one-pokemmo-companion-tool-080-alpha/)
- [Discord community](https://discord.gg/5Wbh28M3gu)
- [Public showcase](https://github.com/haqzo/PokeMMO-Companion/tree/main/showcase)
- [Issue tracker](https://github.com/haqzo/PokeMMO-Companion/issues)
- [Official successful build](https://github.com/haqzo/PokeMMO-Companion/actions/runs/45708065896)
- [Successful automatic Discord release workflow](https://github.com/haqzo/PokeMMO-Companion/actions/runs/45712735799)

## Immutable release baseline

| Item | Recorded value |
|---|---|
| Release tag | `v0.8.0` |
| Tagged source | `1d79fe31c850816c55fa0037cc0d898bcd52807a` |
| Annotated tag object | `9bc46a7aa7a438ffc17cf74015aad6da9945e4f6` |
| Last pre-handoff develop checkpoint | `b56f172464e5973690d8effeb70dc31a63d13c19` (forum link and launch notice) |
| Main after launch README update | `1801d4061555da1cb8343d997e3a78fe4ddf3176` |
| Build environments | Windows Server 2025 x64, Ubuntu 22.04 x64 |

The two packages, signed checksums and provenance were published together. The owner downloaded the staged assets and compared them byte-for-byte with the signed originals. GitHub asset digests match:

| Asset | Bytes | SHA-256 |
|---|---:|---|
| PokeMMO-Companion-0.8.0-windows-x86_64.zip | 260580895 | `f5a32ed069b28a7c3457007ecfd9c437db5339154e9ea0c27d9e6d692466afa2` |
| PokeMMO-Companion-0.8.0-x86_64.AppImage | 259471864 | `af063e5adf50c8ec25e2dd79be3e1dc41e4d9fb0757d1d5dc19877df41caecbf` |
| SHA256SUMS | 215 | `ca5bf4420031f7f223c2d7793d8e8dc4c61977654c79068d3a74f240e8385855` |
| SHA256SUMS.sig | 88 | `33cce88ef7290c20d726221959ab224e52756a300cb81130a4cf1bcebabdb498` |
| build-provenance.json | 3153 | `31c230e4321d21208741928fbf79e85d7e4b93ecb592e9ba914ae20af1b8c411` |

## Verification and open issues

- The pre-final TLS-fix candidate at `26d787d7924af2df00df78e1c1cbaee4bee41513` recorded 620 passed and 51 skipped ROM/dump-dependent tests. Five new TLS tests passed after the fix; do not claim a full suite rerun on the exact final tag. Both official packages passed automated packaged verification.
- Bundled clean-install baseline: 649 Pokémon catalog entries, 559 moves, 2,090 items, 629 locations and 33,405 encounter rows. Reference entries do not guarantee current in-game availability.
- Final Linux package: owner confirmed CachyOS KDE launch through extraction, live Alpha/Swarm reports and official news connectivity. The initial automatic temporary extraction failed with Exec format error; manual fresh extraction and a fresh TMPDIR worked. Direct FUSE launch remains unverified.
- Windows ZIP: automated build, fresh-profile backend and package verification passed on the hosted runner; interactive Windows 10 and 11 desktop testing, including rendering and floating windows, remains pending. Do not advertise it as fully desktop-tested.
- Spanish and Simplified Chinese are available offline but translations and game terminology remain under community review. Do not claim complete translation coverage without current evidence.
- Signed checksum verification is implemented; public end-to-end in-app update installation remains unverified. Installation is manual.
- The Discord release workflow succeeded; the personal forum-linked Discord announcement was prepared separately, not independently verified as posted.
- Documentation follow-up: credit MightyBoxer by name and link the [original storyline guide](https://forums.pokemmo.com/index.php?/topic/76529-storyline-guide-kanto-johto-hoenn-sinnoh-unova-complete-walkthrough-all-items-hidden-items/) in CREDITS.md. The owner confirmed permission and credited him in the public forum announcement.

## Product baseline

The public app includes Home, Pokédex and manual per-character registration, moves and items, Location Explorer, five regional walkthroughs and custom recurring guides, type matchups and Pokémon comparisons, team and breeding planning, EV/horde, catch and stat calculators, natures, arithmetic calculator, timers, notes, bookmarks, My Pokémon and Shiny Showcase, optional Alpha/Swarm reports, Legendary rotations, Phenomena and Altering Cave reference/observations, customizable floating windows, themes, language and performance settings, backup/recovery and update checks. Use the released source to verify exact feature limits rather than inferring from old design documents.

## Next development phase

- **0.8.x Alpha:** prioritize real user feedback, interactive Windows QA, Linux compatibility, reproducible bug fixes, data accuracy, translation and performance corrections, and regressions. Preserve existing tools and user data. No new large feature batch unless the owner explicitly approves it.
- **0.9.x Beta:** refinement, stability and readiness; only advance after owner approval.
- **1.0.0:** first stable release; **1.x.x** subsequent stable updates.
- Develop on `develop`, with full development history preserved. Keep `main` as clean release snapshots plus public documentation. Never merge, change the version, move a published tag, replace signed release assets or publish a release without explicit owner approval.
- Before any changes, read the current branch head, inspect relevant code and tests, and reconcile newer changes rather than resetting to this recorded baseline. Report actual verification and open risks. Update this checkpoint when meaningful work is completed.
- Android, OCR, cross-device accounts/sync, online statistics and other brainstormed integrations remain future research, not approved implementation scope. No encounter counter, damage simulator, GTL scraping, automated gameplay, code injection or game memory access. Keep ROM-free default installation and opt-in online reports.

See the [release notes](../releases/0.8.0.md), [tester and recovery guide](../closed-alpha.md), [release runbook](../../packaging/README.md#release-packages), [earlier QA](../build/31-FINAL-OPTIMIZATION-AND-ALPHA-QA.md), [original roadmap](00-2026-11-22-FEATURE-STAGING.md) and [decision checkpoint](../build/09-V0.1.0-COMPLETE-DECISION-CHECKPOINT.md).
