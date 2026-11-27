# Automatic application updates — priority roadmap (27 November 2026)

**Owner-confirmed desired feature; high priority for an early 0.8.x development batch, ideally before 0.9.0 Beta.** The owner wants this potentially very soon. Exact release number, implementation start and publication remain subject to separate approval. This document records requirements and a proposed approach, not completed functionality.

## Baseline

Public v0.8.1 Alpha, tag source `52a7dacb6a9a603c2ddf8cea824036608970d69b`, is the current release. [Release](https://github.com/haqzo/PokeMMO-Companion/releases/tag/v0.8.1). The owner successfully manually replaced the installed Linux AppImage after checksum verification and confirmed the update on their everyday CachyOS KDE installation. Interactive Windows 10/11 acceptance is still outstanding.

The existing [application updater](https://github.com/haqzo/PokeMMO-Companion/blob/v0.8.1/companion/services/appupdate.py) already implements release checks (24-hour interval, initial delay), stable/prerelease filtering, platform-specific package selection, progress, approved GitHub release URL checks, Ed25519 verification of SHA256SUMS against the pinned key, and package SHA-256 verification. It explicitly never installs or restarts itself. A public v0.8.0 AppImage detected and verified the v0.8.1 download during release QA. The owner observed the update available UI without an obvious download button; reproduce and inspect UI/API state rather than assume the cause. See [active checkpoint](01-ACTIVE-DEVELOPMENT-CHECKPOINT.md).

## Desired experience

- Detect a new compatible published release, display its version and changelog in an in-app notification and Settings > Updates.
- Offer **Notify only**, **Automatically download, ask before installing** (proposed preferred default after explicit preference/consent), and opt-in **Automatically install on normal exit**. Keep manual release-page and verified-download fallback. Existing channel and auto-check preferences must survive; do not silently enable downloads or installs against a user's previous choices.
- Show download size, progress, verification status, pause/cancel or retry as appropriate, and clear failure messages. Packages are currently roughly 260 MB; background downloading must be bounded and unobtrusive.
- Offer Download & Install / Restart & Update, Remind me later, and install-on-exit where selected. Never forcibly close an active session or PokeMMO. Save pending edits, flush SQLite and close Companion popouts/services cleanly.
- Preserve the original installation location, launcher shortcuts, per-character data, configuration, themes, notes, saved progression, collections and floating-window settings. Keep all personal files separate from the install directory.
- Localize the full experience in English, Spanish and Simplified Chinese, respect existing themes and scaling, and preserve offline use.

## Proposed architecture and safeguards

Reuse the existing update checker, release naming and official GitHub builds. No separate server, account, telemetry, mandatory online connection or new private signing key service. Continue owner-held Ed25519 signing; private key and passphrase must never be embedded or uploaded.

Implement a small trusted, independent, platform-specific update helper (or equivalent audited launcher strategy) that can operate after Companion exits. Validate its provenance, installed location and invocation arguments. Do not execute arbitrary commands supplied by release metadata. Keep release-channel selection and compatibility gates, reject downgrades/replays by default, pin release version/platform and checksum/signature to the same approved release, and reverify the staged payload immediately before installation. Review redirect handling, path traversal, symlinks, archive bombs, unexpected members, permissions, size/free-space limits, partial downloads, concurrency and time-of-check/time-of-use issues. Fail closed if verification fails; never bypass signature checks.

Linux: replace the actual writable AppImage at its existing path atomically using a temporary file on the same filesystem; preserve executable mode and launcher target, and retain prior package. Resolve original APPIMAGE path correctly for direct FUSE and extract-and-run. Do not overwrite temporary extracted executables. Detect read-only, root-owned, externally managed or unsupported installs and offer manual instructions, without requesting privilege escalation automatically.

Windows: portable ZIP into a staging directory, validate complete expected package inventory, wait for app and relevant child processes to release files, then use a recoverable directory swap or journaled replacement. Keep the helper and rollback payload outside the directory being replaced. Preserve executable path and shortcuts; handle antivirus/file locks, spaces, non-ASCII and long paths, limited permissions, and partial replacement. Do not overlay arbitrary old dependency files or delete user-created files. No forced administrator elevation; no promise of Authenticode signing.

Before activation, ensure enough space for download, staging, rollback and data backup. Record a durable transaction state and a consistent database/settings backup outside the install tree. Keep the old binary/package until the new version reports a successful native startup and compatible migration through an explicit health handshake. On failure, safely recover interrupted transaction or roll back the old package and its compatible data backup; never run an old binary on an incompatible migrated DB or silently discard user writes. Prevent multiple simultaneous updaters and restart loops. Document limits of automatic rollback, manual recovery and preservation of backups. Restart only when the user requested it; install-on-exit must honor normal exit semantics.

## Suggested delivery and acceptance gates

1. Reproduce current missing download control; audit existing UI/API and updater tests, installation layouts, settings, release source policy and packaging.
2. Design a documented transaction/rollback protocol and testable helper using signed synthetic packages in disposable profiles and installation directories, not owner data.
3. Build UI and background download/verification with preference migration and explicit consent; add restart/install flow on both OSes.
4. Exercise failure injection: unsigned/tampered files, malformed metadata, incorrect platform/version, prerelease/stable boundaries, interrupted network/disk writes, low disk space, permission denial, locked files, concurrent processes, app shutdown, failed startup, failed schema migration, crash at each transaction phase, rollback and manual recovery.
5. Native packaged tests: supported Linux including CachyOS KDE Wayland/XWayland, glibc 2.35 baseline, FUSE and extraction fallback; Windows Server CI plus interactive Windows 10/11 desktop (currently outstanding). Verify actual portable and shortcut-launched installs, profiles with real-shaped synthetic data, settings, popouts and upgrades over multiple versions. Check offline startup, no surprise network or restarts, bounded CPU/memory, and full regression suite.
6. Bootstrap: current v0.8.1 and earlier versions cannot automatically install the future helper. First updater-capable release requires the current manual replacement workflow; test later transitions from that signed release to another signed release. Do not advertise one-click updates before native acceptance and public end-to-end verification.
7. Update README/forum installation instructions and release QA only when the feature is delivered. Keep main/tag/public releases unchanged until the owner approves a reviewed release snapshot.

The preferred early delivery is a complete, reliable Windows/Linux flow, not a Linux-only shortcut or an unverified updater that risks user data. The owner may prioritize this over larger speculative features; exact scheduling remains open.
