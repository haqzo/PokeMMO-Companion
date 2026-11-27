# Friends-only closed alpha

The candidate identifies itself as **0.8.0 Alpha**. Once the owner approves distribution, use the package for your platform and verify it against the release’s `SHA256SUMS`. [0.8.0 release and install notes](releases/0.8.0.md)

## Install and start

- **Linux x86-64.** Save the AppImage somewhere writable. In your file manager, enable **Allow executing file as a program**, then open it. From a terminal, make it executable with `chmod +x ./PokeMMO-Companion-0.8.0-x86_64.AppImage`, using the filename supplied to you. Then open it. If the system cannot mount it with FUSE, run `./PokeMMO-Companion-0.8.0-x86_64.AppImage --appimage-extract-and-run` with the same filename.
- **Windows x86-64.** Right-click `PokeMMO-Companion-0.8.0-windows-x86_64.zip` and select **Extract All**. Open the extracted `pokemmo-companion` folder and run `pokemmo-companion.exe`. Keep the files and folders beside the executable together. The portable package includes Python and Qt.
- **First launch.** The Welcome panel on Home can help you pick a language and configure optional features. You can also dismiss it and start with the Pokédex, Item Library or a regional walkthrough. The installed reference data, icons and sprites are available offline without importing game files. To track a walkthrough, start a storyline run under Guides.

## Settings and floating tools

- **Settings → Performance** offers **Balanced** by default. **Lightweight** uses smaller item batches and static artwork by default. **Full quality** uses larger batches and animates the Pokédex grid by default. **Custom** lets you choose the batch size and motion defaults. Individual sprite preferences are under **Settings → Pokémon & sprites**.
- **Settings → Language** lets you choose English, Spanish or Simplified Chinese. The language and Chinese font are available offline.
- In **Tools**, use a tool’s separate-window icon or open the tool and choose **Open as a separate window**. Use the floating window’s mode control for **Compact**, **Standard** or **Expanded**. Themes are under **Settings → Appearance & themes**, and text size under **Settings → Layout & scaling**. KDE users who need pinning, opacity or position restoration can select XWayland in **Settings → Windows & popouts → Window backend (Linux)** and restart.
- Community **Alpha & Swarm reports** are optional under **Live**. The **Phenomena** reference and floating window work offline. First-sync and reconnect report history stay silent. [Companion community Discord](https://discord.gg/5Wbh28M3gu) · [Alphapedia](https://alpha.pokemmotools.org/)

## Back up, update or recover

1. In **Settings → Backup & recovery**, create a complete backup ZIP and copy it to a separate location. The ZIP includes supported personal data, settings and images such as Box photos. Portable ZIP backups and JSON exports exclude local report history. SQLite safety copies created before a database migration preserve that history. Merge keeps your current settings. Replace restores the archived settings and supported data. Both modes keep the report history already in your profile.
2. Quit Companion, including from the tray if you enabled that behavior. On Linux, open the new AppImage. On Windows, extract the new ZIP to a fresh folder and launch the executable from there. The new application uses the same data folder as before when you use the same OS account and data-folder setting.
3. Confirm your notes, guides and settings after launch. To recover from the backup, open **Settings → Backup & recovery**, select the ZIP and preview it. Use **Merge** to add or combine records, or **Replace** to restore the contents of the backup over your current data. Companion saves a SQLite safety copy before an import. This copy preserves the database. Keep a portable ZIP if you also need a backup of supported image files.

The default profile is `~/.local/share/pokemmo-companion` on Linux and `%APPDATA%\PokeMMO-Companion` on Windows. Keep that folder when replacing application files. To restore a database snapshot wholesale, quit Companion and keep a copy of the current data folder before using the snapshot in its `backups` directory.

## Send feedback

- **Bugs.** Include the build version or supplied commit, OS and desktop environment, the page or floating tool, steps to reproduce, and what you expected and saw.
- **Translations.** Include the selected language, the page, tool, regional guide and chapter if relevant, the displayed wording and your suggested correction. For missing characters or clipped text, add a screenshot if possible. Spanish and Simplified Chinese reviewers can send wording and terminology feedback during the alpha.
- **Performance.** Include your performance profile, whether sprite animations are enabled, how many windows are open, the action that slowed down and whether it happens on a fresh launch. For a shutdown issue, say how you quit and what happened when you reopened the app.

Send feedback in the project Discord. **Settings → About & credits** can save diagnostics. Review diagnostics, screenshots and log excerpts for personal information before sharing. [Companion community Discord](https://discord.gg/5Wbh28M3gu)

## Readiness and distribution

The active checkpoint records technical verification and remaining platform tests. The owner handles invited testers, asset permissions and distribution. Report the specific OS version and desktop you tried, especially for Windows 10, Windows 11 or Linux AppImage launch. [Active development checkpoint](https://github.com/haqzo/PokeMMO-Companion/blob/develop/docs/roadmap/01-ACTIVE-DEVELOPMENT-CHECKPOINT.md)

## Update and signing status

Under **Settings → Updates**, this alpha defaults to **Alpha, beta & prereleases** when you have no saved channel. The app keeps an explicit choice. Choose **Stable** to see only regular stable releases. The app verifies signed `SHA256SUMS` and package bytes when using its verified download. Install the update manually when ready. [Release notes](releases/0.8.0.md)
