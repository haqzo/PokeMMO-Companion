# Companion release QA

The application remains 0.8.0 Alpha. This checkpoint is for owner evaluation of a proposed 0.8.1 Alpha.

| Identity | Commit |
| --- | --- |
| Published 0.8.0 package snapshot | `1d79fe31c850816c55fa0037cc0d898bcd52807a` |
| Develop functionality tested | `59946c4c4937969b69c945d6514c0ac8dc19f050` |
| Local QA AppImage and inventory changes | `384d956817ac471c25301fd0dbf1cd3058c58480` |
| Optimized source used for native comparison | `66229d65c2854979866bd8196ba9557010793a27` |

The runtime Python and browser UI are byte-identical between the tested development commit and the local package build source. All profiles were temporary. The local optional dumps and ROMs were read-only test inputs.

## QA matrix

| Area | Result | Coverage and limits |
| --- | --- | --- |
| Home, navigation, Quick Access and favourites | Passed | Backend, Chromium and local startup. |
| Pokédex, forms, sprites and Collection | Passed | Local dump and bundled modes, forms, registration, animated and static artwork, and native window opening. |
| Location Explorer and regional encounters | Passed | Local ROM and dump regressions, encounter filters and regional map navigation. Bundled/offline layouts were checked separately. |
| Moves and Item Library | Passed | Bundled and local dump catalog tests, filters, sources and item links. |
| Type Chart, Team Builder, Breeding Plan, catch/EV/stat calculations | Passed | Directional fixtures in both Type Chart orientations, two-Pokémon comparison, save/reopen, and existing calculator fixtures. |
| Notes, My Pokémon and Shiny Showcase | Passed | CRUD, links, explicit registrations, seeded upgrade, and visibility/privacy defaults. |
| Walkthroughs and Storyline | Passed | All five regions, independent character state, one completed and one partially completed chapter in the upgrade, localized browsers and native popouts. The four compact/size-sensitive Storyline cases passed in five consecutive focused runs. The earlier intermittent failure did not recur. |
| Custom guides and timers | Passed | Workflow, cycle state, timer actions, ownership, backup and restart. |
| Alpha, Swarm, Phenomena, Legendaries and Altering Cave | Passed | Synthetic/provider fixtures, stale reports, deduplication, quiet reconnect and history, offline references and rotations. QA Corrections 01–02 cover native report interaction and the actual legacy loopback relay. |
| Seasonal definitions | Passed | Synthetic activation and timing, invalid schema and signed reference checks. Bundled default contains zero events. |
| Settings, themes, languages and shortcuts | Passed | English, Spanish and Simplified Chinese. Chromium checked route inventory and responsive layout in multiple viewport sizes and verified key/placeholder parity. |
| Native Linux popouts | Passed | 51/51 on KDE/XWayland and 51/51 on KDE Wayland. Each backend opened all 17 tools in Compact, Standard and Expanded. Checks included text scale, resize and saved size, focus, closing/reopening, and three simultaneous windows. |
| Wayland pinning, absolute position and native window opacity | Skipped, platform limitation | The compositor controls these features. KDE/XWayland passed pin and native opacity. |
| Migration and archive restoration | Passed with scope limit | Published AppImage to candidate, SQLite v5 to v9, one pre-migration SQLite safety copy and two candidate launches. Merge retained target settings and extra content. Replace restored archived settings and content. Portable ZIPs omit local report history. Migration and the SQLite safety copy preserved it. |
| Windows Server regression | Passed | 225 tests and the offline clean-install check. [Workflow run](https://github.com/haqzo/PokeMMO-Companion/actions/runs/45983631915) |
| Windows portable ZIP build | Published package passed, new candidate skipped | Reviewed the current builder and validated the signed published ZIP and recorded Windows Server package self-check. This Linux host has no usable Windows build VM or client session. Interactive Windows 10/11 and a candidate ZIP remain open. |
| Linux packaging | Failed inventory checks corrected | The release source policy now excludes development-only `AGENTS.md` and `CLAUDE.md`. The package allowlist now includes the empty seasonal catalog. The local candidate was built and verified. |
| Local AppImage distribution compatibility | Failed on the local build host | The local artifact requires glibc 2.44, above the official 2.35 ceiling. A distribution build on the supported baseline is still needed. |
| Windows desktop, Linux FUSE and owner review | Requires interactive/platform acceptance | Linux AppImage verification used extraction. The local host has no FUSE device. |

The full Linux suite recorded **775 passed, zero skipped** with optional inputs. The clean-profile UI and reference tests still exercised their separate no-input paths. No application behavior changes were required.

## Upgrade, packaging and provenance

- The published source tag supplied the seed package. Two synthetic characters, storyline progress, notes, team, breeding plan, shiny Pokémon and showcase, collection registration, timer, demo Alpha and Swarm reports, Spanish, Arctic theme and saved window preferences were read back with their original IDs.
- Verified the published Linux AppImage and Windows ZIP against the GitHub release asset digests and signed checksum manifest. The bundled production public key accepted the original manifest and rejected altered bytes. The candidate successfully checked the real 0.8.0 prerelease over HTTPS. Its frozen self-check also passed with only loopback networking. Signed download acceptance and checksum rejection were also exercised in synthetic regression tests. [Public 0.8.0](https://github.com/haqzo/PokeMMO-Companion/releases/tag/v0.8.0)
- Local inventory contains 4,582 retained paths, 202 excluded paths, and a generated `RELEASE-SOURCE` marker. The 4,401 allowlisted raster, SVG and font assets are byte-identical to the public tag. Checked the staged tree and package for prohibited profile, research, private-key, ROM, dump and log paths.
- The changed reference records are the two additions for Phenomena and the empty seasonal catalog. Rechecked provenance and conservative precision. Community callouts retain their source status and the two documented exact-spot IDs remain the matching boundary. Ambiguous floors remain area-level and conflicting location claims remain qualified. The empty seasonal catalog supplies no current event claims.
- Local candidate `PokeMMO-Companion-0.8.0-x86_64.AppImage` is **300,247,544 bytes**, SHA-256 `ba86496f633429038cb46aeae0077bf3af90b22b42ed7a0ea3535a4b629df915`. It is unsigned and separate from the published packages. Package smoke checks covered checksum, bundled assets and runtimes, HTTPS trust store and fresh-profile self-check. The official Windows ZIP built and passed its packaged self-check at the published tag. [Published package build](https://github.com/haqzo/PokeMMO-Companion/actions/runs/45708065896)

[Compact Spanish Storyline on XWayland](release-qa/kde-xwayland-storyline-es.png) · [Location Explorer on XWayland](release-qa/kde-xwayland-locations.png) · [Expanded Chinese Pokédex on Wayland](release-qa/kde-wayland-pokedex-zh.png)

## Matched native performance comparison

Both runs used fresh profiles on the same CachyOS/KDE XWayland host, Python 3.14.10, Qt WebEngine 6.12.0, Balanced and the same screens. The harness settled for five seconds and sampled for eight seconds per phase. PSS is median proportional process-tree memory. CPU is percent of one logical core during each sample. The Pokédex phase measures the rendered 649-card grid.

| Workload | Baseline PSS MiB | QA PSS MiB | Baseline CPU | QA CPU |
| --- | ---: | ---: | ---: | ---: |
| Animated Home | 453.3 | 464.6 | 16.0% | 17.7% |
| Static Home | 473.9 | 477.5 | 6.7% | 5.9% |
| Animated Home after toggling | 484.2 | 488.2 | 18.2% | 19.9% |
| Pokédex | 539.5 | 541.1 | 6.9% | 6.7% |
| Item Library | 563.8 | 564.3 | 7.2% | 6.1% |
| Three popouts, first cycle | 706.4 | 709.7 | 15.6% | 19.3% |
| After first close | 581.4 | 581.7 | 16.3% | 16.3% |
| Three popouts, second cycle | 703.9 | 707.7 | 18.7% | 14.3% |
| After second close | 587.2 | 589.6 | 16.2% | 19.2% |

Startup to ready Home measured **1.304 s** and **1.168 s** respectively. Both runs loaded two animated Home sprites, zero in static mode, and two again after re-enabling animation. Both performed two open/close cycles for Calculator, Item Library and Pokédex. After each close the native windows, views and pages were destroyed and none of their tracked renderer PIDs remained live at the end of the recovery sample. CPU varied in both directions between phases. These single matched runs do not establish a sustained CPU change.

A separate XWayland launch check used an isolated profile with three open popouts saved. Two actual Companion launches restored Reports, Notes and Type Chart with their selected view modes and restored the saved Reports dimensions. Both exited cleanly using the shell quit action.

## Published package checksum record

| Published 0.8.0 artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Linux AppImage | 259,471,864 | `af063e5adf50c8ec25e2dd79be3e1dc41e4d9fb0757d1d5dc19877df41caecbf` |
| Windows portable ZIP | 260,580,895 | `f5a32ed069b28a7c3457007ecfd9c437db5339154e9ea0c27d9e6d692466afa2` |

The proposed README, changelog, release notes, showcase and forum and Discord drafts were prepared in a local review archive outside the repository. Publication and final artifact acceptance remain with the owner.
