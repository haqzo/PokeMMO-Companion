# Final release verification

27 November 2026. This checks the proposed v0.8.1 Alpha under feature freeze. The candidates use the existing 0.8.0 version metadata pending publication approval.

## Reviewed source

- Starting development checkpoint `65ba85aa1a448db5746cccf148ae7f0401f33d0e`.
- Reviewed development source `fde11f84cccf5de909a454cd1ab3053677910b12`.
- Shared untagged candidate snapshot `bbd0a4e98327bd4a5d21fb0f32c5b64122cc57b5`. Both platform builders reproduce this commit using the release inventory and recorded development and main commits.
- The main parent is `527398f4d3142878c57288cdb1e9d98b481c4472`. The official release workflow still requires an approved tag on main.

## Home and Live

Home now uses the same estimated-time pills and countdown scheduler as Live. The rounded green, amber and red pills show likely-active time remaining, uncertain timing and elapsed estimates respectively. The earliest group timestamp continues to drive the window. An estimate can expire locally without another network request and its artwork follows the existing motion preference. A repeat sighting keeps the sprite node and elapsed-time origin. Disposing a view removes its timer and listeners.

The tests covered English, Spanish, Simplified Chinese, default, Arctic and Emerald themes, artwork reuse, automatic expiry, report creation, correction, withdrawal and personal feedback. The accepted Type Chart and Live layouts were exercised in browser and packaged native checks. The local comparison folder contains before-and-after Home and Live captures with matched synthetic reports.

## Regression results

The full Linux suite passed **782 tests with zero failures and zero skips**. It used the existing local dump and ROM inputs in disposable profiles. The four shards recorded 529 backend passes and 58, 149 and 46 browser passes. An initial browser shard filled the RAM-backed temporary filesystem. The complete shard passed after moving its temporary files to workspace storage and updating the sprite reuse probe to use the shared renderer.

A separate source clean-install check passed without a dump, ROM or external network access. The clean-profile browser check recorded 16 passes and one skip. The skipped case inspects roster artwork from the optional dump. After tightening the Storyline and Pokédex test synchronization, all five affected cases passed again with and without the dump. Those changes wait for the same outcomes and restore fixture settings after a failed assertion.

## Linux package

The AppImage was built in the verified Ubuntu 22.04 environment with pinned Python 3.13.14 x86-64, pinned dependencies and AppImage tools. The maximum required glibc was **2.35**. Checksum, bundled files, native runtimes, dynamic ELF dependency resolution, HTTPS trust and the packaged self-check passed.

| Package | Bytes | SHA-256 |
| --- | ---: | --- |
| Linux x86-64 AppImage | 259,516,920 | `95801df5890de3bc5bc26e14ce47f37dac9971d7a6ad41ebf3beb80a2eb0c26c` |

The extracted candidate served the bundled Pokédex, map, item icon, Phenomena and five walkthrough catalogs in a loopback-only network namespace. The signed-download configuration completed a real HTTPS release metadata check. An isolated profile from the published 0.8.0 AppImage upgraded from SQLite v5 to v9, and retained personal data, settings and local reports across two launches. The pre-migration safety copy and portable restore behavior were also verified.

Packaged Qt on KDE/XWayland and Wayland showed the Home pills, preserved the selected Type Chart view and native sizes across modes, rendered current Legendary artwork and shut down cleanly. Direct FUSE mounting was denied by the QA host. Extraction-based execution passed. The prior accepted candidate and its checksum were preserved.

## Native Windows Server candidate

Windows Server 2025 x86-64 built the portable ZIP from the same candidate commit using the pinned Windows Python 3.13.14 toolchain. Candidate checks verified the ZIP checksum, extracted executable, bundled Python and Qt, source inventory and packaged HTTPS trust store.

| Package | Bytes | SHA-256 |
| --- | ---: | --- |
| Windows x86-64 portable ZIP | 260,658,982 | `220756eae7956f32a0194c2bfb6502302f3688ff107fa1863a9b5b4d0b33beb0` |

The extracted package passed a fresh-profile check with its outbound HTTP and HTTPS ports blocked and separately made a real HTTPS release metadata request. It served bundled reference data. An isolated profile seeded with the verified published Windows 0.8.0 ZIP upgraded from SQLite v5 to v9. Its note, settings, Storyline progress and local report survived two launches, and the SQLite safety copy retained the report.

The Windows Server clean-install and Chromium regression job passed, with **288 passes and eight skips**. All eight skipped cases require the optional local dump, which was unavailable to CI. Coverage includes the floating Type Chart, shared Home and Live estimates, reports and feedback, Storyline and Breeding Plan. The revised timing probes passed on the same runtime after an earlier run exposed fixed waits and leaked test fixture settings. [Source and browser regression job](https://github.com/haqzo/PokeMMO-Companion/actions/runs/46040667919/job/140647281611)

The candidate stayed on its temporary runner and was discarded at the end. The workflow retained zero downloadable artifacts. Source and browser tests on Windows Server exercise the same runtime and assets. Interactive Windows 10 and 11 desktop acceptance remains open. [Native build and verification job](https://github.com/haqzo/PokeMMO-Companion/actions/runs/46040667919/job/140647281077)

## Local review materials

The private review bundle includes the v0.8.1 README, showcase, changelog, release notes, forum opening post with collapsible history, forum update and Discord announcement. They describe opt-in local reporting, separate relay requirements, source credits, the empty seasonal catalog and balanced Windows and Linux downloads. These drafts remain outside the repository.
