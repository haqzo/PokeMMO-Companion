# Build 23 — Phenomena and closed-alpha preparation

Base commit `0da22e85d5b69f1a76bb4ee6bf8ec3495676b5d5` on `develop`. App version `0.1.0`.

## Implemented

- Companion Live uses the owner-operated relay for Phenomena. The relay reads one Discord channel, filters by bot ID, retains a bounded snapshot and publishes a versioned JSON feed with source status. The client preserves original timestamps across edits and keeps saved reports through outages and restarts.
- Home shows reports from the past hour. Live offers history, type, region and text filters, with attribution and screenshot enlargement. The independent popout uses the existing Qt or browser window controls. Age indicates when a report was posted. Phenomena have no activity or despawn estimate.
- Phenomenon notifications are off by default and use separate preferences and the existing delivery routes. The initial snapshot, reconnect catch-up, duplicate messages and edits are silent. Alpha and Swarm continue using the existing ntfy adapter.
- The database migration adds one field to the existing report table and uses the existing pre-migration backup. The client poll worker finishes before shutdown where possible and discards any late network result after stopping.

## Packages

| Local output | Validation |
|---|---|
| `PokeMMO-Companion-0.1.0-x86_64.AppImage` | 270,674,424 bytes. SHA-256 `1c756b04a11e65961fb2e3f2182e96882277f26720320aa1dc9fc3466508770c`. Built on CachyOS x86-64 using Python 3.14.10, pinned Python build dependencies and appimagetool 1.9.1. |
| Windows x86-64 ZIP | All pinned wheels resolved for Windows x86-64 and Python 3.13. Run the Windows PowerShell build and verify the output on a fresh Windows VM. |

Extracted and compared 4,459 packaged UI and data files byte-for-byte. Checked the bundle and frozen module inventory for prohibited artifacts and relay modules. The AppImage backend self-check ran with only standard shell utilities on PATH. Native Qt offscreen smoke tests used a fresh user directory with online sources disabled. Both start/quit cycles loaded the bundled Pokédex, walkthroughs, themes, a map and an item icon. The existing reports window and expanded Phenomena window opened, and their profile settings survived restart. Direct FUSE launch and compositor-specific pinning and positioning still need target-desktop testing. PyInstaller reported an optional Qt TIFF plugin dependency on `libtiff.so.5`; the bundled reference assets and supported report formats use other image types.

## Test results

- Full regression run with Python 3.14.10 and Playwright Chromium covered 553 cases. It recorded 496 passes, 51 skips and 6 failures before focused corrections. The skips include tests that require the owner's private dump.
- All 27 new Phenomena cases passed across relay, storage, worker and UI coverage. Subsequent focused runs passed the five previously failing checks for database migration, generated build files, system Flatpak detection, the disabled Phenomena feed, and the 1024 × 768 layout audit. The enlarged-text layout check also passed with the corrected audit.
- One failure remains. The theme editor test expects a “Readability” label after changing text colour. The same assertion fails on the exact Build 22 base. The theme implementation is outside this pass.

## Owner checklist

- Follow the [private relay setup](../../relay/README.md) to verify Discord permissions, genuine report embeds and screenshot fetches. Confirm report and image redistribution permission before hosting the feed outside loopback.
- Use the [standalone build instructions](../../packaging/README.md) for Windows and additional Linux checks. The test build runs locally from the existing asset inventory. Sharing that inventory requires permission.
- Review the [tester guide and release gates](../closed-alpha.md) before choosing the version and distribution channel. App and reference signing remain owner-controlled.

## Changed files

- `.gitignore`
- `CREDITS.md`
- `README.md`
- `companion/app.py`
- `companion/data/window_presets.py`
- `companion/phenomenon_protocol.py`
- `companion/server.py`
- `companion/services/live.py`
- `companion/services/phenomena.py`
- `companion/settings.py`
- `companion/shell/qt_shell.py`
- `companion/storage.py`
- `docs/build/23-PHENOMENA-CLOSED-ALPHA.md`
- `docs/build/README.md`
- `docs/closed-alpha.md`
- `packaging/README.md`
- `packaging/companion.spec`
- `packaging/linux/build-appimage.sh`
- `packaging/requirements-build.txt`
- `packaging/windows/build.ps1`
- `relay/README.md`
- `relay/__init__.py`
- `relay/phenomena.py`
- `requirements-dev.txt`
- `tests/fixtures/phenomena.json`
- `tests/test_links_shortcuts.py`
- `tests/test_phenomena.py`
- `tests/test_sprites.py`
- `tests/test_startup_integration.py`
- `tests/ui/test_ui_layout.py`
- `tests/ui/test_ui_native_fixes.py`
- `tests/ui/test_ui_phenomena.py`
- `tools/layout_audit.py`
- `ui/css/app.css`
- `ui/js/pages/home.js`
- `ui/js/pages/live.js`
- `ui/js/pages/phenomena.js`
- `ui/js/pages/settings.js`
- `ui/js/popouts.js`
- `ui/js/shell.js`
