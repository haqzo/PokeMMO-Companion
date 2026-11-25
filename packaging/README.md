# Standalone build instructions

Build from a clean checkout of the intended commit. Store app data and credentials outside the checkout. The PyInstaller spec collects explicit client UI, reference and raster asset paths plus the Python runtime, PySide6/QtWebEngine and signature verification libraries. It includes normal and shiny animations, item icons, maps, all five walkthroughs and themes. The owner manages asset permissions and distribution approval. The build scripts produce local packages for development QA. [Asset credits](../CREDITS.md)

## Linux x86-64

Use a clean x86-64 Linux build host with Python and `venv`. Use the oldest distro/runtime combination you intend to support, then test on that distro and CachyOS/KDE. A build from CachyOS is suitable for local testing and may depend on newer system libraries.

1. Download and verify upstream `appimagetool`. Record the tool identity with the build. Make it executable and put it on PATH or supply its absolute path via `COMPANION_APPIMAGETOOL`. For repeat builds, retain the tool and supply the matching x86-64 type-2 runtime file via `COMPANION_APPIMAGE_RUNTIME`.
2. Run `./packaging/linux/build-appimage.sh`. The script installs pinned dependencies in `.build-venv` and produces the AppImage and local `SHA256SUMS` in `dist/`.
3. Run this from a terminal with a fresh data directory.
   ```sh
   chmod +x dist/PokeMMO-Companion-0.1.0-x86_64.AppImage
   dist/PokeMMO-Companion-0.1.0-x86_64.AppImage --appimage-extract-and-run --check --data-dir "$(mktemp -d)"
   ```
4. You can also run the AppImage with `--appimage-extract` in an empty directory, then launch `./squashfs-root/AppRun`.
5. Start the native UI with a separate empty directory, then repeat on a target desktop without the build toolchain. Verify normal double-click startup, direct FUSE startup when available, and the extraction fallback. [Upstream appimagetool](https://github.com/AppImage/appimagetool/releases/tag/1.9.1)

## Windows x86-64

Use a clean x86-64 Windows 10 or 11 VM. Use the python.org x86-64 Python 3.13.14 Windows installer for a repeatable baseline, include the `py` launcher and record the interpreter version with the artifact. Run from PowerShell at the checkout root. [Python 3.13.14 installers](https://www.python.org/downloads/release/python-31314/)

```powershell
py -3.13 --version
powershell -NoProfile -ExecutionPolicy Bypass -File .\packaging\windows\build.ps1
```

The [manual Windows development workflow](../.github/workflows/windows-development.yml) runs the same script and a fresh-profile self-check with Windows x64 Python 3.13.14. GitHub only registers manual workflows from its default branch. For a hosted test without changing the public repository’s `main`, use an owner-approved private staging repository with `develop` as its default branch and containing this workflow. In **Actions → Windows x64 development build → Run workflow**, select `develop`. The default run builds the ZIP, checks its SHA-256, extracts it to a path containing spaces and runs the extracted executable with a fresh profile. Once redistribution is explicitly approved, set the private repository variable `ASSET_REDISTRIBUTION_APPROVED=true` and select **Upload the ZIP to this private repository after asset approval**. Approved artifacts expire after three days and are accessible to users who can read the private repository. [Manual dispatch](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow) · [Artifact access](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts)

The same pinned PyInstaller and Qt dependencies are listed in `packaging/requirements-build.txt`. The script fails on tool errors and outputs a portable ZIP and checksum. Unpack the ZIP on a fresh VM without Python, launch the executable, and run the desktop checklist below. Windows execution still needs a Windows host.

To check an existing ZIP on a Windows x64 machine, compare `Get-FileHash -Algorithm SHA256` for the ZIP with the supplied checksum, then use **Extract All**. Run the executable from the extracted folder on a machine without Python. Try a fresh profile without touching your usual data, using PowerShell from the extracted app folder.

```powershell
$qaProfile = Join-Path $env:TEMP ("companion-qa-" + [guid]::NewGuid())
Start-Process -FilePath .\pokemmo-companion.exe -ArgumentList '--data-dir', "`"$qaProfile`""
```

Run the desktop checklist on Windows, then use the same command for the relaunch so it opens the same QA profile. Keep the full ZIP contents together when moving or extracting the package.

## Desktop checklist

- Confirm there is no previous data directory. Launch, open a Pokédex entry with normal and shiny animation, inspect item icons and regional maps, open a walkthrough and apply a theme.
- Disconnect wide-area networking and repeat the reference workflows. Open an existing popout and the Phenomena popout. Check position, resize, pin where supported, text scale and view modes.
- Make a personal note and a complete backup. Quit and immediately reopen. Check preservation of the note, window settings and the separate data directory after replacing the application files.
- Compare packaged asset bytes to the approved source inventory. Inspect bundle contents for ROMs, dumps, personal data, dotenv files, private keys, bot tokens, and webhook configuration. Record SHA-256 and both file sizes before distribution.

## Signing for later distribution

The individual build scripts write one unsigned checksum line each. For an approved release assemble a single `SHA256SUMS` with both lines. With the owner’s signing setup, sign the exact bytes into `SHA256SUMS.sig` using the Ed25519 key whose public half is pinned in `companion/services/appupdate.py`. Check signature verification and the stable/prerelease announcement selection before publication. [Existing release preparation](../docs/build/19-RELEASE-PREPARATION.md)
