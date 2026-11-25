# Standalone build instructions

Build from a clean checkout of the intended commit. Store app data and credentials outside the checkout. The PyInstaller spec collects explicit client UI, reference and raster asset paths plus the Python runtime, PySide6/QtWebEngine and signature verification libraries. It includes normal and shiny animations, item icons, maps, all five walkthroughs and themes. The owner manages asset permissions and distribution approval. The build scripts produce local packages for development QA. [Asset credits](../CREDITS.md)

## Linux x86-64

Use a clean x86-64 Linux build host with Python and `venv`. Use the oldest distro/runtime combination you intend to support, then test on that distro and CachyOS/KDE. A build from CachyOS is suitable for local testing and may depend on newer system libraries.

1. Download and verify upstream `appimagetool`. Record the tool identity with the build. Make it executable and put it on PATH or supply its absolute path via `COMPANION_APPIMAGETOOL`. For repeat builds, retain the tool and supply the matching x86-64 type-2 runtime file via `COMPANION_APPIMAGE_RUNTIME`.
2. Run `./packaging/linux/build-appimage.sh`. The script installs pinned dependencies in `.build-venv` and produces the AppImage and local `SHA256SUMS` in `dist/`.
3. Run this from a terminal with a fresh data directory.
   ```sh
   chmod +x dist/PokeMMO-Companion-0.8.0-x86_64.AppImage
   dist/PokeMMO-Companion-0.8.0-x86_64.AppImage --appimage-extract-and-run --check --data-dir "$(mktemp -d)"
   ```
4. You can also run the AppImage with `--appimage-extract` in an empty directory, then launch `./squashfs-root/AppRun`.
5. Start the native UI with a separate empty directory, then repeat on a target desktop without the build toolchain. Verify normal double-click startup, direct FUSE startup when available, and the extraction fallback. [Upstream appimagetool](https://github.com/AppImage/appimagetool/releases/tag/1.9.1)

## Windows x86-64

Use a clean x86-64 Windows 10 or 11 VM. Use the python.org x86-64 Python 3.13.14 Windows installer for a repeatable baseline, include the `py` launcher and record the interpreter version with the artifact. Run from PowerShell at the checkout root. [Python 3.13.14 installers](https://www.python.org/downloads/release/python-31314/)

```powershell
py -3.13 --version
powershell -NoProfile -ExecutionPolicy Bypass -File .\packaging\windows\build.ps1
```

The [manual Windows development workflow](../.github/workflows/windows-development.yml) runs the same script and a fresh-profile self-check with Windows x64 Python 3.13.14. GitHub only registers manual workflows from its default branch. For optional private development QA before the official workflow is available, use an existing owner-approved private repository with `develop` as its default branch and containing this workflow. In **Actions → Windows x64 development build → Run workflow**, select `develop`. The default run builds the ZIP, checks its SHA-256, extracts it to a path containing spaces and runs the extracted executable with a fresh profile. Once redistribution is explicitly approved, set the private repository variable `ASSET_REDISTRIBUTION_APPROVED=true` and select **Upload the ZIP to this private repository after asset approval**. Approved artifacts expire after three days and are accessible to users who can read the private repository. [Manual dispatch](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow) · [Artifact access](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts)

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

1. Get separate owner approval to merge the reviewed `develop` candidate into `main` and to tag the resulting revision. After the approved merge, use a clean checkout and compare `git rev-parse origin/main` with the approved **main** SHA. Once they agree, create and push only the approved tag.

   ```sh
   git fetch origin
   git rev-parse origin/main
   git tag -a v0.8.0 APPROVED_MAIN_SHA -m 'PokeMMO Companion 0.8.0 Alpha'
   git push origin refs/tags/v0.8.0
   git switch --detach v0.8.0
   ```

2. In **Actions → Build official release packages → Run workflow**, select `main`, enter `v0.8.0` and the full approved main SHA. Both jobs must verify the exact same revision and report success. Windows Server 2025 x64 hashes, extracts and runs the ZIP’s backend self-check from a path containing spaces with a fresh profile. Ubuntu 22.04 x64 verifies the AppImage checksum, bundled assets and runtime, resolves dynamic dependencies, enforces a maximum GLIBC requirement of 2.35 and runs the extracted backend self-check. These are automated package checks. Record interactive Windows 10 and 11 desktop tests, Linux desktop tests and FUSE launch separately. [GitHub-hosted runners](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job)

3. Leave **retain_artifacts** off for verification-only runs. Signed-in GitHub users with read access to this public repository can download retained artifacts for three days. Only enable retention after the owner explicitly authorizes this exposure. Download the verified artifact for each platform from the successful run. If it was retried, check the run attempt in each artifact name against the successful job before staging. You can use `gh run download RUN_ID --repo haqzo/PokeMMO-Companion --pattern 'companion-v0.8.0-*' --dir /path/to/private/downloads`. Each artifact contains one package, its checksum and a platform build report. Use `chmod +x` on the downloaded AppImage before running it locally. The workflow uses read-only repository permissions. [Artifact access](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts)

   For private staging, use authorized local Windows x64 and Ubuntu 22.04 x64 hosts or VMs, each with a clean checkout of the same tag and Python **3.13.14 x64**. Verify the checked-out SHA against the approved main SHA on both hosts. On Windows run `py -3.13 packaging/package_release.py build --tag v0.8.0`. On Linux install the Qt dependencies and `binutils` shown in the release workflow. Download upstream appimagetool 1.9.1 and the 20251108 type-2 runtime, make appimagetool executable and export the absolute paths as `COMPANION_APPIMAGETOOL` and `COMPANION_APPIMAGE_RUNTIME`. Run `python3.13 packaging/package_release.py build --tag v0.8.0`. The release wrapper verifies both pinned tool digests before use. [Release workflow](../.github/workflows/release-build.yml) · [appimagetool](https://github.com/AppImage/appimagetool/releases/tag/1.9.1) · [Type-2 runtime](https://github.com/AppImage/type2-runtime/releases/tag/20251108)

4. Copy both packages and `linux-build.json` and `windows-build.json` into an owner-controlled staging directory. Leave the individual runner checksum files in their own directories. From the tagged checkout run:

   ```sh
   python3.13 packaging/package_release.py assemble --tag v0.8.0 --stage /path/to/private/stage
   ```

   Assembly verifies the source revision, version, platform, filename, file size and SHA-256 against the reports from the packaged executable checks. It writes the combined `SHA256SUMS` and `build-provenance.json`. Keep the desktop test results alongside this evidence and update the release notes with the actual coverage before draft review.

## Signing releases

The 0.8.0 candidate pins the production application Ed25519 public key in `companion/services/appupdate.py`. The SHA-256 fingerprint of the raw 32-byte public key is `acfe6fde90a4699b738c92047430946d5f0fb921b5b75d964c25f8e1712ee85d`. Reference-data signing uses a separate key. This signature authenticates the exact checksum bytes. Windows Authenticode and Linux OS-level code signing are separate.

Keep the encrypted private key outside checkouts on owner-controlled storage, with mode `600` and its directory mode `700`. Copy the encrypted file to an owner-controlled encrypted offline backup and store the passphrase separately. Keep the private key and passphrase off CI, GitHub and Discord. On owner-controlled storage, verify the backup by comparing the output with the pinned fingerprint.

```bash
(
  set -o pipefail
  openssl pkey -in /path/to/encrypted-backup.pem -pubout -outform DER | tail -c 32 | sha256sum
)
```

To sign the finished combined `SHA256SUMS`, set the absolute paths to the tagged checkout and private staging directory. OpenSSL prompts for the passphrase when signing. Verification uses the public pin. The following Bash commands stop on failure.

```bash
(
  set -euo pipefail
  key_dir="$HOME/.local/state/pokemmo-companion-release"
  repo=/absolute/path/to/tagged/checkout
  stage=/absolute/path/to/private/stage
  cd "$stage"
  sha256sum --check SHA256SUMS
  signature=$(mktemp .SHA256SUMS.sig.XXXXXX)
  trap 'rm -f -- "$signature"' EXIT
  openssl pkeyutl -sign -rawin -inkey "$key_dir/app-ed25519.pem" -in SHA256SUMS |
    openssl base64 -A -out "$signature"
  PYTHONPATH="$repo" python3 -c '
import sys
from pathlib import Path
from companion.services.appupdate import APP_UPDATE_PUBLIC_KEY
from companion.services.refdata import _verify_signature
signature = Path(sys.argv[1]).read_text("ascii").strip()
if not _verify_signature(Path("SHA256SUMS").read_bytes(), signature, APP_UPDATE_PUBLIC_KEY):
    raise SystemExit("Signature failed against the pinned application public key")
print("Signature verified against the pinned application public key")
' "$signature"
  mv -- "$signature" SHA256SUMS.sig
)
```

Run the verification with an interpreter that has `cryptography` installed. If either package changes, regenerate provenance and the combined checksums and sign them again.

## Draft review

After package verification and explicit owner approval to stage on GitHub, create a **draft prerelease** for the existing tag from the private staging directory.

```sh
gh release create v0.8.0 --repo haqzo/PokeMMO-Companion --verify-tag --draft --prerelease \
  --title 'PokeMMO Companion 0.8.0 Alpha' --notes-file /path/to/tagged/checkout/docs/releases/0.8.0.md \
  PokeMMO-Companion-0.8.0-x86_64.AppImage PokeMMO-Companion-0.8.0-windows-x86_64.zip \
  SHA256SUMS SHA256SUMS.sig build-provenance.json
```

If you updated the notes after QA, use the reviewed copy for `--notes-file`. On GitHub, confirm the tag and target SHA, draft and prerelease flags, package names and sizes, all five attachments and the notes’ platform testing claims. Download the draft attachments to a separate directory. Run `sha256sum --check SHA256SUMS` there and repeat the Python verification command with `SHA256SUMS.sig` as its argument. To preview Discord text, prepare a local event JSON with `release.tag_name`, `name`, `html_url`, `body`, `prerelease: true` and the final `assets` names, using the proposed public URL. Run `GITHUB_EVENT_PATH=/path/to/local/event.json python3 .github/scripts/discord_release.py release --dry-run` from the checkout. It prints the payload locally. Check the Alpha label, both downloads, release notes and checksum links.

Publish the draft only after separate approval. The publication event triggers the existing Discord announcement. Use the GitHub prerelease flag for 0.8.x and 0.9.x, and a regular release for 1.0.0 and later stable versions.
