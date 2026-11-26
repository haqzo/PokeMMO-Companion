# Active development checkpoint — 26 November 2026

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

## Batch 01 — Live reliability and Type Chart

- Started from verified `develop` at `3d24fdd713ad3ce2f1d19699faeb03b13ee11fb6`. Type Chart columns now use the same vertical writing mode without the extra rotation. Hover and focus readouts omit the optional Unlock button until needed. The grid, sticky headers, checkers, floating presets and main-page comparison retain their existing layouts and behavior.
- Alpha/Swarm reports keep the provider's text, source, message ID, report timestamp and receipt timestamp. Region-scoped catalog matching accepts case, spacing, Unicode and fully qualified spelling variants. General cave names with several floors, shared catalog labels and unknown places stay visibly unresolved.
- A local event links observations with a verified species and place within one estimated window. A repeat shares the earliest eligible report time and keeps its own history row. Source/message IDs deduplicate retry deliveries, while event assignment and the alert decision share a SQLite transaction. Migration v6 indexes saved reports without re-alerting them and makes a pre-migration database backup.
- Reconnect requests up to 12 hours of provider cache, subject to availability. Replayed messages and reports whose estimated window has passed are silent. Home and Live show that a connected feed can still miss encounters, and history survives an outage. Alpha estimates remain 75 minutes. Swarm estimates remain provisional and configurable, with a 20-minute default. The timestamps record reports and receipts. Actual spawn times are unknown.
- The default routes for Alpha, Swarm, timer and test notifications use top-right toasts. Saved notification routes, corners and quiet mode remain in effect. Phenomena keeps its separate opt-in and notification preferences.

### Community reporting handoff

- `LiveService.ingest` is the current Alpha/Swarm entry point. A future adapter should map the source into an observation with a stable provider-scoped message ID, kind, species, explicit region and place, report time and replay state. Record receipt time locally and route the observation through the existing transactional event assignment and notification decision. `reports.event_id` is a local correlation identifier. An earlier valid observation can shorten a countdown. Later repeats keep its original deadline.
- The correlation window is an estimate. Two spawns of the same species at the same verified location within that window may be indistinguishable without more information. An unresolved place or missing reliable timestamp leaves the observation separate. If a future source provides a corroborated spawn identifier or spawn time, preserve that separately.
- Phenomena still enters through `Phenomena._store` with its relay message ID, edit merging and catch-up baseline. Reuse the shared `dispatch_notification` path and retain Phenomenon's existing evidence and timing rules when adding another source.

### Batch verification

- Linux backend suite: 441 passed, 31 ROM/dump-dependent skips and one pre-existing showcase-media failure. The failing `test_artwork_only_in_the_prepared_builtin_library` also failed on the starting commit because it rejects the existing showcase GIFs.
- Linux Chromium suite: 204 passed, 20 dump-dependent skips and one pre-existing showcase-media failure. The failing `test_no_rom_or_dump_files_in_repository` also failed on the starting commit because it rejects the existing showcase screenshots, GIFs and videos.
- Linux Chromium screenshots were inspected for English, Spanish and Simplified Chinese and Compact, Standard and Expanded popouts. Linux Qt 6.12.0 offscreen smoke passed the main chart, all three native popout modes and top-right toast. The offline fresh-profile acceptance check passed with bundled reference data and zero ROM/dump files.
- No Windows package or interactive desktop run was available for this batch. The Windows development workflow requires a private repository with `develop` as its default branch. The successful automated package verification covers the released `v0.8.0` baseline at `1d79fe31c850816c55fa0037cc0d898bcd52807a`. [Release package CI](https://github.com/haqzo/PokeMMO-Companion/actions/runs/45708065896)

## Batch 01.1 — Maintenance follow-up

- Started from `cb76130e2588a5c54bd92413619f55d54c745532`. Breeding recalculates from the current editor state. Saved-plan writes are serialized per plan, later edits are retained during a save, and a failed save can be retried. An unsaved draft stays in the current window when switching plans or tabs. Export/import and pairing preview use the selected plan. Changing goals asks before clearing marked steps.
- Live history and report details use the same earliest event observation as Home and Live cards. The individual observation retains its own source, report time, receipt time and message ID.
- The two media guards now recognize the 30 already-published showcase files by exact path and SHA-256. Additional or modified showcase files still fail. Existing restrictions on ROMs, dumps, archives and other media remain in force.
- Linux verification passed in temporary profiles. The backend suite recorded 444 passed and 31 ROM/dump-dependent skips. Chromium recorded 208 passed and 20 dump-dependent skips. The offline clean-install check passed. Both media guards passed with the approved files and rejected an extra GIF and a modified approved GIF in a disposable checkout.
- The public Windows regression job runs source tests and the offline clean-install check on a standard Windows runner with temporary profiles. The private package job and official release workflows keep their existing gates. While the regression workflow lives only on `develop`, add `[windows-regression]` to the tip commit message to opt in on push. Ordinary pushes skip the Windows job. GitHub's standalone manual dispatch requires the workflow on the default branch. [GitHub Actions triggers](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch)
- Windows Server 2025 x64 passed the offline clean-install check and all 103 selected tests at `71404266d9a04d7c246e141b9234874a65c8ee3d`. The initial run stopped on console encoding during the clean-install report. The successful run used UTF-8 and exercised source and Chromium tests. [Successful run](https://github.com/haqzo/PokeMMO-Companion/actions/runs/45853373475)
- The snapshot policy excludes the new development workflow. The inventory audit still identifies `AGENTS.md` and `CLAUDE.md` as unclassified on both the starting and updated trees.

## Batch 02 — In-app community reporting

- Started from `b8925b9d17334aabb4fd5f728d35beeec5cfc9cb`. Companion Community is opt-in under Live and Settings. Report forms are available in the Alpha/Swarm and Phenomena workspaces and their floating windows. Reports and actions are saved in the local profile. The source panel identifies the shared feed as unavailable.
- Alpha and Swarm use canonical species and region-scoped location IDs. The searchable selector requires an explicit location entry for ambiguous names. Unlisted locations stay visibly unverified and separate from matching. Manual Phenomena may record an unknown exact location and have no countdown. The existing Phenomena relay and its rules remain separate.
- A report stores the observation time from opening the form and the local receipt time from saving it. Firsthand and relayed evidence and the reported onset are explicit. Countdown estimates use the earliest observation and retain the existing Alpha and Swarm durations. The form records no confirmed spawn time.
- Local and Alphapedia records retain their individual provider, message ID and timestamps. The existing transactional event assignment reserves only one notification for a matching Alpha or Swarm window. Corrections keep the original observation time and category, append a new revision and retain prior revisions under the usual history retention. Withdrawing the only observation removes a card. Other observations keep their original deadline.
- Still here, Not found and personal completion apply to this profile. They neither confirm an encounter independently nor change its global state. Manual Phenomena observations stay separate from the relay and have no alert or automatic correlation in this batch.
- Schema v7 adds structured metadata, withdrawals and local actions to the existing database. Migration makes a pre-migration copy using the existing backup mechanism. The release inventory still needs explicit classification for `AGENTS.md` and `CLAUDE.md` before a release snapshot.

### Batch 03 integration

- `Community.submit` accepts a validated structured observation and a stable request ID for retries. The local provider is fixed to `companion-local`. A shared adapter should supply its own provider namespace and stable observation IDs, retain separate reported, received and any corroborated spawn times, and pass eligible Alpha and Swarm observations through the same `LiveService._assign_event` transaction. Keep arrivals independent so a local or Alphapedia report can appear immediately.
- `live_actions` records local actions and correction links. Shared reporting will need contributor ownership and retry semantics at its own boundary. A local repeated action or relayed report supplies no additional independent confirmation.

### Reporting views

[English Live workspace](batch02/community-live-en.png) · [English expanded report window](batch02/community-popout-en.png) · [Spanish compact report window](batch02/community-popout-es.png) · [Simplified Chinese Phenomena window](batch02/community-popout-zh.png)

## Next development phase

- **0.8.x Alpha:** prioritize real user feedback, interactive Windows QA, Linux compatibility, reproducible bug fixes, data accuracy, translation and performance corrections, and regressions. Preserve existing tools and user data. No new large feature batch unless the owner explicitly approves it.
- **0.9.x Beta:** refinement, stability and readiness; only advance after owner approval.
- **1.0.0:** first stable release; **1.x.x** subsequent stable updates.
- Develop on `develop`, with full development history preserved. Keep `main` as clean release snapshots plus public documentation. Never merge, change the version, move a published tag, replace signed release assets or publish a release without explicit owner approval.
- Before any changes, read the current branch head, inspect relevant code and tests, and reconcile newer changes rather than resetting to this recorded baseline. Report actual verification and open risks. Update this checkpoint when meaningful work is completed.
- Android, OCR, cross-device accounts/sync, online statistics and other brainstormed integrations remain future research, not approved implementation scope. No encounter counter, damage simulator, GTL scraping, automated gameplay, code injection or game memory access. Keep ROM-free default installation and opt-in online reports.

See the [release notes](../releases/0.8.0.md), [tester and recovery guide](../closed-alpha.md), [release runbook](../../packaging/README.md#release-packages), [earlier QA](../build/31-FINAL-OPTIMIZATION-AND-ALPHA-QA.md), [original roadmap](00-2026-11-22-FEATURE-STAGING.md) and [decision checkpoint](../build/09-V0.1.0-COMPLETE-DECISION-CHECKPOINT.md).

## Open research brief (not approved implementation)

The owner requested a feedback-driven incremental 0.8.x roadmap, beginning with a proposed 0.8.1, plus research into Android (potentially before desktop 1.0), saved chat-log-assisted tools, live catch-rate estimates, Pokéyen/activity statistics, profiles and optional cross-device progression. These are speculative research directions only. See [post-alpha research brief](02-POST-ALPHA-RESEARCH-BRIEF.md). No version bump, code, infrastructure or feature implementation is authorized by that brief.
