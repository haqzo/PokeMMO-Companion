# Build 26 — Linux AppImage external links

Base commit `e1024188fd96087d9b1970f2f0b2772d5b98d5f4`. The AppImage was built from application commit `006a7bd425ba1d71a0af952b1846a9250effabd4`. The app version remains `0.1.0`.

The host KDE opener needs Qt 6.12. A loader check reproduced the version error when KDE inherited the bundle's Qt 6.10.2 library path. With the bundled path excluded, KDE resolved `libQt6Core.so.6` from `/usr/lib`.

The three native Qt link paths, browser-mode startup and Websites & Links now share the HTTP(S) launcher. On Linux it uses `xdg-open` to honor desktop handler settings, with `gio open` as a fallback when xdg-open is absent. The child environment restores PyInstaller's original library path when present and excludes bundle entries from library, executable, Qt and desktop search paths. The app keeps its original runtime environment. PyInstaller's PySide6 hook supplies the bundled Qt plugin and QML variables. AppRun only resolves its own directory and execs Companion. The AppImage runtime metadata is removed from the child environment, and Companion's Qt platform choice is passed to Qt as an argument so it stays local to that app. Windows native links retain Qt's desktop handler. Bookmark URL validation still applies, and a failed dispatch reports a browser-opening error. [PyInstaller external program guidance](https://pyinstaller.org/en/stable/common-issues-and-pitfalls.html#launching-external-programs-from-the-frozen-application)

## Verification

- The focused automated suite recorded 78 passes, four skips and one timeout in a guide-menu test. That same test passed on an isolated rerun. Launcher tests exercised a real recording subprocess in source and simulated-frozen modes, checked parent environment isolation and URL validation, and mocked the Windows desktop handler.
- Actual native Qt navigation in both the source app and the frozen AppImage sent seven expected URLs to a recording opener in each mode. This covered Home, Phenomena, Websites & Links, Discord and official news, including same-window and new-window Qt paths.
- In a separate end-to-end native test, the real AppImage opened a localhost probe through the host's `xdg-open` and `kde-open`. The probe received a request from the installed Firefox running in an isolated, temporary headless profile. That test used a temporary KDE handler configuration.
- The Linux AppImage passed its checksum, matched all 4,459 packaged UI and data files byte-for-byte, and passed the standalone self-check and two native Qt startup and shutdown cycles.

| Local artifact | Bytes | SHA-256 |
|---|---:|---|
| `PokeMMO-Companion-0.1.0-x86_64.AppImage` | 270,682,616 | `574d49dc0befa5daa4b46d7e5c8e1a0e7fe153d6265839fc751920569d9b4994` |
