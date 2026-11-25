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

For a build with automated verification and a provenance report, run `py -3.13 packaging/package_release.py build` from the checkout root. This uses the same Windows builder, verifies its checksum, compares packaged files against source, checks for the included Python and Qt WebEngine runtimes, and smoke-tests the extracted executable from a path with spaces. The Windows manual workflow runs this command and can include `windows-build.json` with an approved private upload. Run the desktop checklist on Windows client machines without the build toolchain.

To check an existing ZIP on a Windows x64 machine, compare `Get-FileHash -Algorithm SHA256` for the ZIP with the supplied checksum, then use **Extract All**. Run the executable from the extracted folder on a machine without Python. Try a fresh profile without touching your usual data, using PowerShell from the extracted app folder.

```powershell
$qaProfile = Join-Path $env:TEMP ("companion-qa-" + [guid]::NewGuid())
Start-Process -FilePath .\pokemmo-companion.exe -ArgumentList '--data-dir', "`"$qaProfile`""
```

Run the desktop checklist on Windows, then use the same command for the relaunch so it opens the same QA profile. Keep the full ZIP contents together when moving or extracting the package.

## Desktop checklist

- Confirm there is no previous data directory. Launch, open a Pokédex entry with normal and shiny animation, inspect item icons and regional maps, open a walkthrough and apply a theme.
- Disconnect wide-area networking and repeat the reference workflows. Open an existing popout and the Phenomena popout. Check position, resize, pin where supported, text scale and view modes.
- Switch among English, Spanish and Simplified Chinese. Exercise Lightweight, Balanced, Full quality and Custom under **Settings → Performance**. Preview and apply a theme.
- Make a personal note and a complete backup. Preview the backup and recover a test record. Launch a second instance while the first is running and confirm it focuses the original. Quit from the tray or app menu, confirm the application and its WebEngine helpers exit, and immediately relaunch. Check that the note, window settings and separate data directory survive replacing the application files.
- Compare packaged asset bytes to the approved source inventory. Inspect bundle contents for ROMs, dumps, personal data, dotenv files, private keys, bot tokens, and webhook configuration. Record SHA-256 and both file sizes before distribution.

## Release packages

Work from clean checkouts of the same approved release tag. Fetch `origin/main` and the exact tag. The builder verifies that the tag resolves to HEAD, is on `origin/main` and matches both version declarations. Use Python 3.13.14 x64 on both builders.

- **Windows:** On an approved Windows host run `py -3.13 packaging/package_release.py build --tag v0.8.0`.
- **Linux:** On Ubuntu 22.04 x86-64 install the system libraries needed by Qt and `binutils`. Use verified copies of upstream [appimagetool 1.9.1](https://github.com/AppImage/appimagetool/releases/tag/1.9.1) and the [20251108 type-2 runtime](https://github.com/AppImage/type2-runtime/releases/tag/20251108). Export their absolute paths as `COMPANION_APPIMAGETOOL` and `COMPANION_APPIMAGE_RUNTIME`, then run `python3.13 packaging/package_release.py build --tag v0.8.0`. Run the desktop checklist on the target desktop.
- Copy the two packages plus `linux-build.json` and `windows-build.json` from their `dist/` folders to one owner-approved private staging directory. From the same tag run `python3.13 packaging/package_release.py assemble --tag v0.8.0 --stage /path/to/private/stage`. This rehashes both files, verifies they match the source and per-platform reports, and writes one `SHA256SUMS` and `build-provenance.json`. Keep any separate native QA results with the review evidence.

The [release workflow](../.github/workflows/release-build.yml) also runs both build checks by manual dispatch from `main` after registration on the default branch. The two upstream SHA-256 pins in the workflow also apply to the corresponding local downloads. Enter the exact approved tag in the workflow input. Use the local staging path above to retain the files for release. The hosted checks have read-only repository permissions and no artifact upload step.

## Signing releases

The updater’s application signing key is separate from reference-data signing. An empty `APP_UPDATE_PUBLIC_KEY` keeps the release-page download flow. To enable signed application downloads, use these steps before the release commit is finalized.

1. On owner-controlled signing storage outside every clone, generate an encrypted Ed25519 private key with `openssl genpkey -algorithm ED25519 -aes-256-cbc -out app-ed25519.pem`. Save a secure backup and passphrase separately. Keep the private key off GitHub, build runners, working directories and public artifacts.
2. Export the public half with `openssl pkey -in app-ed25519.pem -pubout -out app-ed25519-public.pem`. Using Python with `cryptography`, convert the public PEM to raw public bytes and print it in base64.

   ```sh
   python -c 'import base64,sys; from pathlib import Path; from cryptography.hazmat.primitives.serialization import load_pem_public_key; key = load_pem_public_key(Path(sys.argv[1]).read_bytes()); print(base64.b64encode(key.public_bytes_raw()).decode("ascii"))' /path/to/app-ed25519-public.pem
   ```

   Commit only the resulting base64 public key in `companion/services/appupdate.py`. If signing is deferred, builds with an empty pin will continue using the release page until players manually install a build with the pin.
3. From private staging, sign the finished `SHA256SUMS` with OpenSSL 3. The release signature file is base64 text.

   ```sh
   openssl pkeyutl -sign -rawin -inkey /private/app-ed25519.pem -in SHA256SUMS -out checksums.sig.raw
   openssl pkeyutl -verify -pubin -rawin -inkey /private/app-ed25519-public.pem -in SHA256SUMS -sigfile checksums.sig.raw
   openssl base64 -A -in checksums.sig.raw -out SHA256SUMS.sig
   ```

   Verify the final text signature with the app’s verifier and the committed public pin. Upload `SHA256SUMS.sig`, not the raw signature or private key. Reassemble and re-sign if either package changes. The signature authenticates the checksum file, apart from any OS code signing.

## Draft review

Create a draft using an approved existing tag. For 0.8.0, run the following from the private staging directory after package verification and owner authorization for staging on GitHub. Add `SHA256SUMS.sig` to the listed attachments if signing is configured and verified.

```sh
gh release create v0.8.0 --repo haqzo/PokeMMO-Companion --verify-tag --draft --prerelease \
  --title "PokeMMO Companion 0.8.0 Alpha" --notes-file /path/to/repository/docs/releases/0.8.0.md \
  PokeMMO-Companion-0.8.0-x86_64.AppImage PokeMMO-Companion-0.8.0-windows-x86_64.zip \
  SHA256SUMS build-provenance.json
```

Publish the reviewed draft only after explicit owner approval. The publication event drives the existing Discord announcement. Use `--prerelease` for 0.8.x and 0.9.x. Use a regular GitHub release for stable versions. [Approval and release checklist](../docs/build/32-ALPHA-RELEASE-PREPARATION.md)
