# Final package compatibility QA

27 November 2026. Feature freeze and owner acceptance remain active. The package checks below follow [comprehensive release QA](03-RELEASE-QA.md).

## Source and packages

- Starting development checkpoint: `56709501edf905759fef7f17315acf1e297e006d`.
- Reviewed development source: `6cbef11b859d5ef457132f7b25dc533be3a4bc76`.
- Shared untagged package snapshot: `7f600219f18b2d084e12316c9680b65a4997d834`, tree `fae76c234d5845f501560cad9677746381995857`. The sole parent is the public main commit `527398f4d3142878c57288cdb1e9d98b481c4472`.
- The release snapshot inventory retained 4,582 paths, excluded 206, and added the `RELEASE-SOURCE` marker. The runtime trees match the reviewed development source. Both build checkouts used this exact detached commit. Candidate mode uses the published builder's tool versions and validation. Official tag and main ancestry requirements still govern release mode.

| Platform | Package | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Linux x86-64, Ubuntu 22.04 build | `PokeMMO-Companion-0.8.0-x86_64.AppImage` | 259,516,920 | `393badd2f21443160d2bd99647355728aeecec68989cc720f04c8633312ff243` |
| Windows x86-64, local Wine diagnostic build | `PokeMMO-Companion-0.8.0-windows-x86_64.zip` | 257,158,758 | `0883ec1bd27b4b3e2e258b702511537f2eb31885b76c930165e6dd0657652a43` |

These unsigned private files carry the existing 0.8.0 build version. Candidate packages and publication drafts are held locally outside the repository.

## Linux

- Built in an isolated Ubuntu 22.04 x86-64 filesystem from the official OCI image. The amd64 manifest digest was `sha256:b682e31336cc8e0a73ed91ab32b7a95e32591c5ff09994490a20accf9b3600f9` and the verified layer digest was `sha256:ba082564e6605eeb2e1abc91a762985d2e8afea393433de08e798c1eee36d028`. The environment used the local kernel and Ubuntu glibc 2.35.
- Used Python 3.13.14 x86-64 from the official Actions Ubuntu 22.04 toolchain, the pinned build dependencies and both pinned AppImage binaries. Added the Jammy runtime libraries required to resolve Qt in the minimal build environment.
- `package_release.py build --candidate` passed package checksum, bundled source asset comparisons, Python and Qt inventory, unresolved ELF dependency checks, and the existing maximum glibc requirement of **2.35**. Packaged command-line trust-store validation and fresh-profile self-check passed.
- At startup in a loopback-only environment, the package served 649 Pokédex species, the bundled Unova Phenomena reference, all five regional guide catalogs, a regional map and an item icon. The self-check also read eight bundled news articles and the 17-type grid. The actual HTTPS application update check retrieved the published 0.8.0 prerelease metadata with certificate verification enabled.
- The published 0.8.0 AppImage seeded a disposable profile. The candidate upgraded SQLite from v5 to v9 and retained two characters and their progress, notes, a team, a breeding plan, collection and showcase items, a timer, settings and two local test reports. The one pre-migration SQLite copy retained both reports, and the second candidate start kept the same data and copy.
- Packaged Qt on KDE/XWayland and Wayland opened Reports, Notes and Type Chart in their three requested modes. Both backends restored the same windows after a clean quit and relaunch. Backup and restore scope text was visible. Qt logged Fontconfig warnings against the newer CachyOS desktop configuration. Window rendering and the tested controls passed.
- Direct FUSE startup was attempted with a fresh disposable profile. `fusermount3` returned “mount failed: Operation not permitted”. Extraction-based execution passed. Owner FUSE acceptance remains open.

## Windows

- Built a diagnostic ZIP locally under Wine 11.22 with python.org Windows Python 3.13.14 x86-64 and the same pinned dependencies, PyInstaller specification and ZIP creation used by the PowerShell builder. PowerShell probes did not execute the script body in this environment, so those existing Python build commands were run directly. The ZIP passed the official builder's extracted-package smoke function, including bundled asset comparison, Python and Qt inventory, HTTPS trust store and fresh-profile backend self-check.
- In a second Wine prefix without the build interpreter, the extracted executable passed a loopback-only clean install and read the bundled Pokédex and type data. Its actual HTTPS check retrieved the public release metadata. Upgrade from the published Windows ZIP preserved the same seeded personal data through two launches, including both local reports and one v5 SQLite migration copy. The Qt Windows backend started and accepted a Compact Type Chart popout command under Wine. Windows-specific Chromium host-integration warnings occurred under Wine.
- The earlier Windows Server 2025 automation covered source regression and the published 0.8.0 package in separate runs. The new candidate was checked locally under Wine. Windows-native candidate build and verification remain open, along with interactive Windows 10/11 startup, window positioning, pinning, tray behavior and upgrade acceptance. No approved private Windows build host was available. The official workflow requires a tag on main and the Windows development build workflow requires a private repository. No workflow or artifact upload was used. [Source regression](https://github.com/haqzo/PokeMMO-Companion/actions/runs/45983631915) · [Published package build](https://github.com/haqzo/PokeMMO-Companion/actions/runs/45708065896)

## Backup and recovery

- Portable ZIP backups and JSON exports exclude local report history. SQLite migration safety copies preserve it. Merge retains current settings and combines supported personal data. Replace restores supported personal data and settings from the archive. Both modes preserve the destination profile's existing local reports.
- Verified importing the published ZIP in Merge and the current ZIP in Replace with disposable profiles and distinct destination data. They preserved destination report history and did not introduce source reports. Both created a pre-import SQLite safety copy. The Backup & recovery page and restore dialog disclose the scope in English, Spanish and Simplified Chinese. The focused backup and packaged TLS suite passed all 11 tests.

## Owner acceptance

- Launch the Linux candidate directly with `./PokeMMO-Companion-0.8.0-x86_64.AppImage --data-dir "$(mktemp -d -t companion-qa-XXXXXXXX)"` from its directory. If direct launch returns a FUSE error, retry with `--appimage-extract-and-run` before `--data-dir` and record the two results separately.
- Extract the diagnostic ZIP privately for Windows owner testing. Use a temporary profile and launch on a supported Windows desktop without Python. A native Windows build from the shared source snapshot is still required for release acceptance.
- Private publication drafts cover the README, changelog, release notes, showcase, PokeMMO forum opening and update posts, and Discord. They describe local reporting and separately configured sharing, the empty seasonal foundation, source credits and the platform coverage.
