# Friends-only closed alpha

The current build identifies itself as **0.1.0**. Check the commit or checksum the owner sends with your copy. The owner-confirmed version target for the actual friends-only closed alpha is **0.8.0**. Internal development remains 0.1.0 until the alpha is ready; MaToRiuKo and the Spanish-speaking reviewer join the same 0.8.0 friends-only alpha as the owner and invited friends. Distribution still requires applicable release gates and owner approval.

## Install and start

- **Linux x86-64.** Save the owner-provided AppImage somewhere writable, make it executable in the file properties or with `chmod +x PokeMMO-Companion-<version>-x86_64.AppImage` (replace `<version>` with the supplied build version), then open it. If your system lacks FUSE, run it from a terminal with `--appimage-extract-and-run`.
- **Windows x86-64.** If the owner supplies a verified Windows ZIP, extract the entire directory and open `pokemmo-companion.exe` from that directory. The files beside the executable support the native app.
- On first launch, open Home and the Pokédex. Reference data, sprites, maps and the five regional walkthroughs are available from the installed app. Start a storyline run only if you want to track your walkthrough progress. Changes are stored in your per-user data directory.

## What to try

- Open a map and a walkthrough. Compare two Pokémon, switch between normal and shiny sprites, and change your theme. The Pokédex, maps, guides and personal tools work offline.
- Use **Live → Alpha & Swarm reports** for opt-in community reports. **Live → Phenomena** and its popout show offline Unova encounter examples. Find current Phenomenon callouts and location pictures in **#phenomenon-callouts**. [PokeMMO Companion Discord](https://discord.gg/5Wbh28M3gu) · [Alphapedia](https://alpha.pokemmotools.org/)
- Open a few floating tools, including Phenomena. Try Compact and Expanded, change text size, resize, then quit and reopen. Pinning and exact positioning depend on the window manager. KDE Wayland users who need those controls can try the XWayland option in Settings.
- Turn notifications on separately for Alpha and Swarm reports. First-sync and reconnect history are silent.

## Feedback and recovery

Send feedback to the project Discord with the build identifier, OS and desktop environment, steps, expected result and what happened. A cropped screenshot or a short, reviewed log excerpt helps. Logs are in `logs/companion.log` inside the data folder. Remove personal paths and any private report content before sharing diagnostics. [Companion community Discord](https://discord.gg/5Wbh28M3gu)

Use **Settings → Backup & recovery** to make a complete ZIP before replacing an install. The ZIP includes personal content and images, such as Box photos. The data folder is `~/.local/share/pokemmo-companion` on Linux and `%APPDATA%\PokeMMO-Companion` on Windows unless overridden. To restore a backup, preview it, then choose Merge or Replace. Companion makes a safety copy before restoring. Live report caches are outside the portable personal backup. To restore a prior database wholesale, quit Companion and use the database snapshot from the `backups` directory, keeping a copy of the current data folder first.

## Release gates

Localization is a closed-alpha development requirement: complete Spanish and Simplified Chinese interface and walkthrough coverage, review terminology and gameplay instructions, run the full rendered-interface and regression audit, and verify native glyph rendering. Coverage counts alone do not establish language quality. Target 100% of application-owned user-facing text, then verify, perform a quick CPU/RAM and performance smoke check, fix material issues and stabilize. Language review with MaToRiuKo (Simplified Chinese) and a Spanish-speaking reviewer, and normal owner/friend testing, take place during the 0.8.0 closed alpha. See the [active development checkpoint](roadmap/01-ACTIVE-DEVELOPMENT-CHECKPOINT.md) and [translation review checklist](build/30-TRANSLATION-REVIEW-AND-ALPHA-GATES.md).

| Stage | Open items |
|---|---|
| Friends-only alpha | Confirm redistribution rights for the full asset bundle, including original sprite art, PokeMMO icons, reference data and maps. Confirm walkthrough permission scope and attribution. A Git checkout or a private audience alone does not establish permission. The 0.8.0 target is agreed; confirm final build readiness and distribution method. Verify native installation, compositor behavior and instant relaunch on tester machines. Windows ZIP delivery depends on a clean Windows build and smoke test. |
| Public beta | Close all applicable alpha gates for a public audience. Verify the target Linux compatibility baseline and Windows distribution. Configure and verify Ed25519 application signing and the release checksums. Verify reference signing and index hosting if enabling automatic reference updates, and confirm the existing Discord announcement workflow with the owner before publication. |
| During alpha | Collect owner/friend functional feedback, Simplified Chinese and Spanish language review, and feedback on the Unova reference, compact-window readability and the handoff to Discord. |

## Update and signing status

The existing app updater queries published GitHub releases and supports stable and prerelease channels. It leaves installation to the user. Verified downloads require the pinned Ed25519 application public key and a signed `SHA256SUMS` file. That key is currently empty. Reference updates use a separate signed index and key, currently unconfigured. The Discord announcement workflow runs on published releases and uses its existing webhook secret. [Release infrastructure](build/19-RELEASE-PREPARATION.md)
