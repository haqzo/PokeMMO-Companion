# Friends-only closed alpha

Internal builds identify themselves as **0.1.0**. The owner will approve the **0.8.0** friends-only build and provide the package and checksum. Use the exact package for your platform.

## Install and start

- **Linux x86-64.** Save the AppImage somewhere writable. In your file manager, enable **Allow executing file as a program**, then open it. From a terminal, make it executable with `chmod +x ./PokeMMO-Companion-0.8.0-x86_64.AppImage`, using the filename supplied to you. Then open it. If the system cannot mount it with FUSE, run `./PokeMMO-Companion-0.8.0-x86_64.AppImage --appimage-extract-and-run` with the same filename.
- **Windows x86-64.** Right-click the portable ZIP and select **Extract All**. Open the extracted `pokemmo-companion` folder and run `pokemmo-companion.exe`. Keep the files and folders beside the executable together. The portable package includes its Python runtime.
- **First launch.** The Welcome panel on Home can help you pick a language and configure optional features. You can also dismiss it and start with the Pokédex, Item Library or a regional walkthrough. The installed reference data, icons and sprites are available offline without importing game files. To track a walkthrough, start a storyline run under Guides.

## Settings and floating tools

- **Settings → Performance** offers **Balanced** by default. **Lightweight** uses smaller item batches and static artwork by default. **Full quality** uses larger batches and animates the Pokédex grid by default. **Custom** lets you choose the batch size and motion defaults. Individual sprite preferences are under **Settings → Pokémon & sprites**.
- **Settings → Language** lets you choose English, Spanish or Simplified Chinese. The language and Chinese font are available offline.
- In **Tools**, use a tool’s separate-window icon or open the tool and choose **Open as a separate window**. Use the floating window’s mode control for **Compact**, **Standard** or **Expanded**. Themes are under **Settings → Appearance & themes**, and text size under **Settings → Layout & scaling**. KDE users who need pinning, opacity or position restoration can select XWayland in **Settings → Windows & popouts → Window backend (Linux)** and restart.
- Community **Alpha & Swarm reports** are optional under **Live**. The **Phenomena** reference and floating window work offline. First-sync and reconnect report history stay silent. [Companion community Discord](https://discord.gg/5Wbh28M3gu) · [Alphapedia](https://alpha.pokemmotools.org/)

## Back up, update or recover

1. In **Settings → Backup & recovery**, create a complete backup ZIP and copy it to a separate location. The ZIP includes personal content and images such as Box photos.
2. Quit Companion, including from the tray if you enabled that behavior. On Linux, open the new AppImage. On Windows, extract the new ZIP to a fresh folder and launch the executable from there. The new application uses the same data folder as before when you use the same OS account and data-folder setting.
3. Confirm your notes, guides and settings after launch. To recover from the backup, open **Settings → Backup & recovery**, select the ZIP and preview it. Use **Merge** to add or combine records, or **Replace** to restore the contents of the backup over your current data. Companion makes a safety copy before restoring.

The default profile is `~/.local/share/pokemmo-companion` on Linux and `%APPDATA%\PokeMMO-Companion` on Windows. Keep that folder when replacing application files. To restore a database snapshot wholesale, quit Companion and keep a copy of the current data folder before using the snapshot in its `backups` directory.

## Send feedback

- **Bugs.** Include the build version or supplied commit, OS and desktop environment, the page or floating tool, steps to reproduce, and what you expected and saw.
- **Translations.** Include the selected language, the page, tool, regional guide and chapter if relevant, the displayed wording and your suggested correction. For missing characters or clipped text, add a screenshot if possible. Spanish and Simplified Chinese reviewers can send wording and terminology feedback during the alpha.
- **Performance.** Include your performance profile, whether sprite animations are enabled, how many windows are open, the action that slowed down and whether it happens on a fresh launch. For a shutdown issue, say how you quit and what happened when you reopened the app.

Send feedback in the project Discord. **Settings → About & credits** can save diagnostics. Review diagnostics, screenshots and log excerpts for personal information before sharing. [Companion community Discord](https://discord.gg/5Wbh28M3gu)

## Readiness and distribution

The active checkpoint records technical verification and remaining platform tests. The owner handles version approval, invited testers, asset permissions and distribution. The first public beta also needs a tested Linux compatibility baseline and approved signing and publication setup. [Active development checkpoint](roadmap/01-ACTIVE-DEVELOPMENT-CHECKPOINT.md) · [Closed-alpha checklist](build/30-TRANSLATION-REVIEW-AND-ALPHA-GATES.md)

## Update and signing status

The existing app updater queries published GitHub releases and supports stable and prerelease channels. It leaves installation to the user. Verified downloads require the pinned Ed25519 application public key and a signed `SHA256SUMS` file. That key is currently empty. Reference updates use a separate signed index and key, currently unconfigured. The Discord announcement workflow runs on published releases and uses its existing webhook secret. [Release infrastructure](build/19-RELEASE-PREPARATION.md)
