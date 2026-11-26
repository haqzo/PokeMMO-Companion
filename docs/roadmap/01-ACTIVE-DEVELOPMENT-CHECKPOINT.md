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

### Batch 03 integration handoff

- `Community.submit` accepts a validated structured observation and a stable request ID for retries. The local provider is fixed to `companion-local`. A shared adapter should supply its own provider namespace and stable observation IDs, retain separate reported, received and any corroborated spawn times, and pass eligible Alpha and Swarm observations through the same `LiveService._assign_event` transaction. Keep arrivals independent so a local or Alphapedia report can appear immediately.
- `live_actions` records local actions and correction links. Shared reporting will need contributor ownership and retry semantics at its own boundary. A local repeated action or relayed report supplies no additional independent confirmation.

### Reporting views

[English Live workspace](batch02/community-live-en.png) · [English expanded report window](batch02/community-popout-en.png) · [Spanish compact report window](batch02/community-popout-es.png) · [Simplified Chinese Phenomena window](batch02/community-popout-zh.png)

### Batch 02 verification

- Tested implementation commit `bda9948da3e6b0126a1b7654f1389a448eebb29f`. Linux backend recorded 465 passed and 31 ROM/dump-dependent skips. The selected Chromium suites recorded 146 passed and 8 dump-dependent skips. All 21 focused backend cases and four reporting browser cases passed. The browser cases passed again after the final compact layout adjustment.
- Offline clean-install checks and Linux Qt 6.12 offscreen smoke passed. Native smoke covered opening and fitting the Compact Reports and Standard Phenomena reporting dialogs. Screenshots use synthetic reports and temporary profiles.
- Windows Server 2025 x64 passed the offline clean-install check and all 128 selected tests at the implementation commit, including the new reporting API and Chromium cases. [Windows develop regression](https://github.com/haqzo/PokeMMO-Companion/actions/runs/45859019065)

## Batch 03 — Shared community reporting prototype

- Started from `7f732f2bbabf6204fa4f54247e6bd31094b5cbed`. The standalone loopback service keeps Alpha, Swarm and Phenomena in a versioned SQLite journal with bounded requests, stable IDs, contributor-scoped idempotency, and a separate read credential. Corrections and withdrawals append to the journal and require the original contributor's write credential.
- Sharing is explicit per new report. The client preserves local reports during an outage and tracks pending, shared, failed and withdrawn states. The next feed read can confirm a write whose response was lost. A failed request can be retried explicitly with the original request ID. Existing local history never becomes a publication queue. A fresh publication older than ten minutes is rejected by the service.
- Each profile keeps its feed cursor across restarts. Historical catch-up remains silent. The existing Alpha/Swarm correlation groups compatible shared and Alphapedia observations under one deadline and alert while retaining each observation's time and provenance. Unknown or unverified places remain separate. Relayed evidence does not count as independent confirmation. Shared Phenomena keep their own observation history without a countdown and continue alongside the existing Phenomena relay.
- The expanded and compact reporting views use the same connection states. Shared observations show their contributor without exposing another contributor's correction or withdrawal controls. Still here, Not found and personal completion remain local. Schema v8 adds feed cursors and publication records through the existing backup-before-migration path.
- The service uses plain HTTP, static synthetic bearer tokens and an append-only test journal. A feed reader can see all shared notes and all earlier revisions. Only use synthetic reports and credentials on one machine. For eventual public hosting, deploy a separate service under HTTPS with authenticated identities and revocable scoped credentials, request and contributor rate limits, abuse reporting and moderation, a retention and deletion policy, monitored backups with tested recovery, load tests and a security review. Keep Companion's desktop API private.

[Loopback setup and test commands](../../relay/README.md#shared-community-test-service)

### Batch 03 reporting views

[Connected Live with both sources](batch03/shared-live-en.png) · [Disconnected Live with retained history](batch03/disconnected-live-en.png) · [Spanish Reports popout](batch03/shared-popout-es.png) · [Simplified Chinese Reports popout](batch03/shared-popout-zh.png)

### Batch 03 verification

- Tested implementation commit `ac74614d1db6e6dbc9e94aa2ed90b9cf312511c1`. On Linux, the standalone service and two separate Companion processes successfully propagated a synthetic report, correction and withdrawal while preserving contributor ownership. The standalone service reopened its journal with the same service ID. An isolated v7-to-v8 migration preserved a local report and personal completion and produced a readable v7 backup.
- Linux backend reported 474 passed, 31 ROM/dump-dependent skips and 235 UI tests deselected in 246.11 seconds. Selected Chromium suites reported 100 passed and two dump-dependent skips in 233.62 seconds. Offline clean-install and both media guards passed. All development tests used temporary profiles.
- The Linux loopback measurement used nine synthetic observations, three each for Alpha, Swarm and Phenomena, with a 500 ms polling interval. Submission to storage in the receiving profile took 490.0–522.8 ms, with a median of 502.3 ms. This measures Companion distribution on one machine. It provides no measurement of Alphapedia publication latency.
- The opt-in Windows Server 2025 x64 job passed offline clean install and 140 selected regressions in 110.60 seconds, including the new two-profile and Chromium cases. Interactive native Windows QA remains pending. [Windows develop regression](https://github.com/haqzo/PokeMMO-Companion/actions/runs/45888756917)

## Batch 03.1 — Storyline reliability and usability

- Started from `5a031b1dcdc9c82f7c23a5f4fb53a67cae4aa61d`. A short Chromium window reproduced the clipped read-only and active walkthroughs. The Guides wrapper let the page expand to the full document height inside the clipped shell. The chapter list used a fixed viewport subtraction, and the popout put navigation after its step list. The wrapper now sizes to the available height, the chapter list has a responsive scroll area, and the popout keeps navigation above a single scrollable step area. The guide scrollbars use the theme's width, colors and hidden setting.
- The old clients calculated advancement from the steps and progress they had rendered and sent the next pointer as a separate write. Legacy pointers could stay on a completed Route 102 while later checkboxes changed. The backend now saves checkbox progress and advances the objective in one transaction. It skips completed and hidden optional steps and can advance beyond the chapter. At the end it identifies a completed walkthrough and keeps the last objective available. Explicit navigation can still select a completed step.
- The main view follows the current objective unless a chapter or All chapters is selected for browsing. Jump to current resumes following. Both windows read the saved character and region, guard stale renders, and preserve scroll during unrelated progress updates. Chapter indices plus stable step IDs distinguish repeated visits. Timers and team remain available in collapsible panels with saved preferences. The existing keyboard shortcuts keep their semantics: Previous and Next move one visible step, and the keyboard tick toggles without moving the pointer.
- At very short floating-window heights, navigation stays fixed while the header and appearance controls move into the step scroll area. Restoring height returns those controls to their normal positions.
- Schema v9 records deliberate pointer choices and enough history for Undo to restore an objective moved by a checkbox or Mark up to current. Legacy saves lacked that distinction. A completed legacy pointer with an entirely completed chapter is recovered from the next unfinished visible objective. Migration makes the usual pre-migration backup. Verification uses temporary profiles.

[Hoenn main view](batch03-1/storyline-main-hoenn.png) · [Spanish Compact](batch03-1/storyline-compact-es.png) · [English Standard](batch03-1/storyline-standard-en.png) · [Simplified Chinese Expanded](batch03-1/storyline-expanded-zh.png)

### Batch 03.1 verification

- Linux backend reported 482 passed and 31 ROM/dump-dependent skips in 246.13 seconds. Selected Chromium regressions reported 139 passed and eight dump-dependent skips in 332.96 seconds. The focused set covered all 2,845 bundled steps, the Hoenn reproduction and both windows. All six focused browser cases passed again after making the browser input assertions independent of scroll-animation timing.
- The Linux offline clean-install and both media guards passed. Offscreen Qt 6.12 on Linux verified Compact, Standard and Expanded at the native 260×180 minimum with 200% text scaling, saved background opacity and the always-on-top flag. The tests used synthetic profiles, including the v8-to-v9 migration and its backup.
- Windows Server 2025 x64 passed offline clean install and all 181 selected regressions in 183.53 seconds at `c2f4b0c04dc4ddb809c3e4f7bd5afa06b2b95b71`. Two earlier runs each timed out in the same test's exact-bottom End-key assertion. The final test exercises Page Down, the wheel and thumb dragging independently. Native interactive Windows desktop QA remains pending. [Successful Windows regression](https://github.com/haqzo/PokeMMO-Companion/actions/runs/45894052987)

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

## Batch 04 — Phenomena reference and reporting

- Started at verified develop `005b3dc31c1500557906fd93cc18c0742c5f1933`. Implementation commit `222fa3d869e62504b721c14688a2788b9511428a` adds an offline location search with English, Spanish and Simplified Chinese names, phenomenon-type filtering, direct Location Explorer navigation and prefilled reporting. The main workspace and the three floating presets use the same reference.
- Documented callouts supply the lower-left Village Bridge grass spot (`unova:255`, no HM) and left-middle Route 1 shadow spot (`unova:317`, Surf). A regionless Route 1 relay callout remains unresolved. Existing Route 11 grass, Route 4 water and Victory Road dust encounter examples retain their area scope.
- Mato's observations inform the search and coverage messaging. The assignment supplies `三草` for Route 3 (`unova:321`) grass and `11水` for Route 11 (`unova:365`) water. Their exact spots remain unverified. Wellspring Cave 1F (`unova:324`) and B1F (`unova:325`) are separate catalog entries with unverified phenomenon categories. The full multilingual reference credited to Mato and yuisigamy was unavailable in the inspected local materials. Its Route 1 translations and exact Route 3, Route 11 and Wellspring Cave descriptions still need review against that source.
- Live shows relay status, original callout provenance, time, age, local receipt and silent recovery from history. Home can show a recent relay observation when the feed is enabled. Shared and local observations retain their own history, evidence, ownership and personal actions.
- A Community observation appears under a relay callout as a possible match only when exactly one relay candidate has the same documented spot and category within 120 seconds. This is an evidence window. The existing 60-minute relay display window, 60-second poll and 180-second staleness threshold retain their meanings. Reports display unknown end time and linked observations carry no count of independent confirmations. Edits, corrections and withdrawals change the grouping from current evidence. Personal completion and Not found remain local. Alpha and Swarm keep their separate correlation rules.
- The relay remains conditional on configuration. No private Discord or QQ data was retrieved and no service was exposed publicly. The release inventory still needs explicit classification for `AGENTS.md` and `CLAUDE.md` before a release snapshot.

[English expanded popout](batch04/phenomena-en-expanded.png) · [Spanish compact popout](batch04/phenomena-es-compact.png) · [Simplified Chinese Wellspring Cave reference](batch04/phenomena-reference-zh.png)

- Focused Phenomena backend, loopback sharing and initial Chromium checks recorded 42 passes. The offline clean-install check passed with zero ROM or dump files. Final Linux suite results and the Windows regression run are tracked in the verification follow-up. Interactive native Windows testing remains pending.
- Next checkpoint is independent source review, followed by source review of the missing multilingual reference if it becomes available. Flexible seasonal foundations are a separate batch.
