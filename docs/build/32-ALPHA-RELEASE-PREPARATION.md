# 32 — First alpha release preparation

Development version **0.1.0**. The build batch started from `d6326ed0ccebf280e841fd28a725aa4d9d10fca8` on `develop`. The Build 31 verification and AppImage apply to `66229d65c2854979866bd8196ba9557010793a27`. [Build 31 verification](31-FINAL-OPTIMIZATION-AND-ALPHA-QA.md)

| Versions | Use | GitHub Release |
|---|---|---|
| 0.1.0 | Internal development | — |
| 0.8.x | Alpha | Prerelease |
| 0.9.x | Beta | Prerelease |
| 1.0.0 | First stable | Regular |
| 1.x.x | Stable development | Regular when approved for release |

Continue development on `develop`. After initial approval, release source comes from `main`. GitHub Releases is the official download location. The draft [0.8.0 changelog and release description](../releases/0.8.0.md) assumes two verified packages. Update the platform notes to match the actual tests before publication.

## First Windows QA run

Use an owner-authorized Windows x64 PC or VM with Python 3.13.14 x64 and a clean checkout of the reviewed `develop` commit. In PowerShell run `py -3.13 packaging/package_release.py build`. Keep `dist/PokeMMO-Companion-0.1.0-windows-x86_64.zip`, `dist/SHA256SUMS`, and `dist/windows-build.json` on the approved host or approved private storage. Compare the build report’s SHA, package size and checksum to the files you test.

An existing authorized private staging repository can also run the Windows development workflow if its default branch contains the workflow and is `develop`. The private workflow keeps its current upload approvals. A Windows Server runner can check the extracted ZIP, runtime, assets and fresh-profile backend. Schedule interactive QA on Windows 10 and Windows 11 x86-64 with no Python installed, using a path with spaces and a fresh test profile. The public repository needs the workflow on its default branch before manual dispatch. [GitHub workflow dispatch requirements](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch)

Run the [desktop checklist](../../packaging/README.md#desktop-checklist) on both client versions and record OS build, package SHA-256, native display results and observed process exit. A Windows ZIP and native verification are still pending.

## Release packaging and Linux baseline

The [release verification workflow](../../.github/workflows/release-build.yml) is manually dispatched from `main` with the exact tag. Both jobs verify the tag’s source is on `main`, build with the existing platform scripts, verify bundled data and runtime files, and run the package against a fresh profile. They produce checksums and provenance. Hosted verification leaves packages on its runners. Build the downloadable copies on authorized hosts and assemble them in private staging before creating a release draft. The existing private Windows workflow can still provide approved development artifacts. [Packaging commands](../../packaging/README.md#release-packages)

Use Ubuntu 22.04 x86-64 (glibc 2.35) as the first Linux build and test baseline. Qt 6.10 starts at glibc 2.34. PyInstaller leaves glibc to the host. The release wrapper enforces a 2.35 ceiling on versioned GLIBC imports across the AppImage and its extracted ELF files. That check leaves system Qt/X11/Wayland dependencies and native behavior for OS-level testing. Verify the final package on Ubuntu 22.04 and tested KDE setups, including mounted AppImage launch where FUSE is available and the extraction fallback. The existing CachyOS AppImage was built on glibc 2.44. Its previous desktop results cover CachyOS KDE XWayland and Wayland. [Qt 6.10 supported platforms](https://doc.qt.io/qt-6.10/supported-platforms.html) · [PyInstaller compatibility guidance](https://pyinstaller.org/en/stable/usage.html#making-gnu-linux-apps-forward-compatible)

## Updater and signing

Stable installations skip the 0.8.x and 0.9.x series and any other release marked prerelease or carrying a prerelease suffix. The prerelease channel can move across alpha, beta and stable versions. Ask alpha testers to opt into the prerelease channel in **Settings → Updates**. Drafts are skipped. A channel switch clears the prior channel’s offer. The app links to the GitHub release page. Its verified download service checks the asset name, architecture and version for the running platform, authenticates the exact checksum file with Ed25519, checks the downloaded bytes and leaves installation to the player.

Signing is unconfigured. The owner can explicitly choose the release-page path for 0.8.0 or arrange signing before freezing its source. [Signing procedure](../../packaging/README.md#signing-releases)

## After explicit owner approval

1. Approve the version bump and verify the development candidate. Update the declarations below on `develop`. Run the full suite again on that exact source. Decide whether 0.8.0 uses signing. If it does, pin the owner’s public key before the final source review.
2. Approve the merge separately. Merge the reviewed `develop` change into `main`, approve the final main revision and create the exact annotated tag `v0.8.0` at that commit. Use protected branches and tags where configured.
3. Authorize the build hosts and intended distribution. Build Linux and Windows from the same tag, run the package and native checks, stage both packages, and create combined checksums and provenance. Sign the exact combined checksum file if signing was selected. Save the hashes, sizes and test results for review.
4. Create the GitHub release as a **draft prerelease** for the existing tag. Upload both verified packages and their combined `SHA256SUMS`, provenance and signature if available. Use the release notes draft and confirm names, checksums, platform claims and tag target against the final files. Run the Discord dry-run using the final draft’s intended title, body and asset list with the prospective public URL. [Draft preparation](../../packaging/README.md#draft-review)
5. After explicit approval to publish, publish the existing draft from GitHub. The existing Discord workflow reacts to the published release. Confirm the release and announcement URLs and the download list. Keep future `0.8.x` and `0.9.x` releases flagged as prereleases. Publish `1.0.0` and approved successors as regular releases.

### Version change checklist

- `companion/__init__.py` — change `__version__` and update the module’s development-status sentence.
- `pyproject.toml` — update `[project].version` and the development-preview description. Both native builders, the CLI and the About version read the runtime version.
- `ui/js/ui-strings.js` — update `system.welcome` in English, Spanish and Simplified Chinese. Remove the old version reference from the system-wide shortcut notice (`ui.b272_settings_013`).
- `companion/settings.py` — remove the old version reference from both system-wide shortcut validation messages.
- `tests/test_core.py` — make the bootstrap version assertion use `companion.__version__`. Explicit test-only versions used to simulate earlier releases can stay.
- `README.md`, `run.ps1`, `packaging/README.md`, `docs/closed-alpha.md`, and `docs/roadmap/01-ACTIVE-DEVELOPMENT-CHECKPOINT.md` — update current status, current-release install examples and platform claims to match the approved release. Keep historical build reports tied to their original source and version.
- Use tag `v0.8.0` and title **PokeMMO Companion 0.8.0 Alpha**. Confirm both package names and all checksum/provenance entries carry the intended version. GitHub’s prerelease flag controls discovery on external release pages and must be set even though the app independently recognizes the series.

Credits, asset permissions and distribution decisions are owned by the project owner. The standalone package retains the existing asset inventory and bundled notices.
