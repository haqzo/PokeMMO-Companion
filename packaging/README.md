# Packaging (maintainers only)

Players never need Git, a terminal or Python: they download one file per platform from a GitHub release.

| Platform | Script | Output | Status |
|---|---|---|---|
| Linux x86_64 (CachyOS, KDE, …) | `packaging/linux/build-appimage.sh` | `PokeMMO-Companion-<ver>-x86_64.AppImage` | written, **not built/tested yet** |
| Windows x86_64 | `packaging/windows/build.ps1` | `PokeMMO-Companion-<ver>-windows-x86_64.zip` (portable folder) | written, **not built/tested yet** |

Both use `packaging/companion.spec` (PyInstaller onedir): Python runtime, PySide6 + QtWebEngine, `ui/`, and
`companion/data/` (approved reference data). Never ROMs, dumps or user data. User data stays in the per-user
data folder (`~/.local/share/pokemmo-companion`, `%APPDATA%\PokeMMO-Companion`), so upgrading or deleting the
app never touches it.

Before a release (owner decision):
1. Build on a clean machine per platform and run the native checklist in `docs/build/19-…`.
2. Create an Ed25519 key pair; put the public key in `companion/services/appupdate.py` (`APP_UPDATE_PUBLIC_KEY`)
   and sign `SHA256SUMS` → `SHA256SUMS.sig` (base64 signature of the file bytes).
3. Upload the files + `SHA256SUMS` + `SHA256SUMS.sig` to the GitHub release.

Reference-data packages: `python3 tools/reference_package.py --help` (signing key + index; see docs/build/19).
