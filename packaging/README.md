# Standalone build instructions

Build from a clean checkout of the intended commit. Store app data and credentials outside the checkout. The PyInstaller spec collects explicit client UI, reference and raster asset paths plus the Python runtime, PySide6/QtWebEngine and signature verification libraries. It includes normal and shiny animations, item icons, maps, all five walkthroughs and themes. Review [credits and distribution rights](../CREDITS.md) before sharing any bundle, including to closed-alpha testers.

## Linux x86-64

Use a clean x86-64 Linux build host with Python and `venv`. Use the oldest distro/runtime combination you intend to support, then test on that distro and CachyOS/KDE. A build from CachyOS is suitable for local testing and may depend on newer system libraries.

1. Download and verify upstream `appimagetool`. The local build uses 1.9.1. Make it executable and put it on PATH or supply its absolute path via `COMPANION_APPIMAGETOOL`. For repeat builds, retain the tool and supply the matching x86-64 type-2 runtime file via `COMPANION_APPIMAGE_RUNTIME`.
2. Run `./packaging/linux/build-appimage.sh`. The script installs pinned dependencies in `.build-venv` and produces the AppImage and local `SHA256SUMS` in `dist/`.
3. Run this from a terminal with a fresh data directory.
   ```sh
   chmod +x dist/PokeMMO-Companion-0.1.0-x86_64.AppImage
   dist/PokeMMO-Companion-0.1.0-x86_64.AppImage --appimage-extract-and-run --check --data-dir "$(mktemp -d)"
   ```
4. Start the native UI with a separate empty directory, then repeat on a target desktop without the build toolchain. Verify normal double-click startup, direct FUSE startup when available, and the extraction fallback. [Upstream appimagetool](https://github.com/AppImage/appimagetool/releases/tag/1.9.1)

## Windows x86-64

Use a clean x86-64 Windows 10 or 11 VM and the latest python.org x86-64 Python 3.13 maintenance build available as a Windows installer. Include the `py` launcher and record the precise interpreter version with the artifact. Run from PowerShell at the checkout root.

```powershell
py -3.13 --version
powershell -NoProfile -ExecutionPolicy Bypass -File .\packaging\windows\build.ps1
```

The same pinned PyInstaller and Qt dependencies are listed in `packaging/requirements-build.txt`. The script fails on tool errors and outputs a portable ZIP and checksum. Unpack the ZIP on a fresh VM without Python, launch the executable, and run the desktop checklist below. Windows execution still needs a Windows host.

## Desktop checklist

- Confirm there is no previous data directory. Launch, open a Pokédex entry with normal and shiny animation, inspect item icons and regional maps, open a walkthrough and apply a theme.
- Disconnect wide-area networking and repeat the reference workflows. Open an existing popout and the Phenomena popout. Check position, resize, pin where supported, text scale and view modes.
- Make a personal note and a complete backup. Quit and immediately reopen. Check preservation of the note, window settings and the separate data directory after replacing the application files.
- Compare packaged asset bytes to the approved source inventory. Inspect bundle contents for ROMs, dumps, personal data, dotenv files, private keys, bot tokens, and webhook configuration. Record SHA-256 and both file sizes before distribution.

## Signing for later distribution

The individual build scripts write one unsigned checksum line each. For an approved release assemble a single `SHA256SUMS` with both lines. With the owner’s signing setup, sign the exact bytes into `SHA256SUMS.sig` using the Ed25519 key whose public half is pinned in `companion/services/appupdate.py`. Check signature verification and the stable/prerelease announcement selection before publication. [Existing release preparation](../docs/build/19-RELEASE-PREPARATION.md)
