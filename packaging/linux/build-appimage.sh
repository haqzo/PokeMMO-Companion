#!/usr/bin/env bash
# Build a Linux x86_64 AppImage of PokeMMO Companion (maintainer machine; NOT needed by players).
# Needs: python3 -m venv, network for pip, and appimagetool on PATH (https://github.com/AppImage/appimagetool).
# Status 2026-11-24: written, not yet run — test on CachyOS/KDE before publishing anything.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/../.."
python3 -m venv .build-venv
.build-venv/bin/pip install --upgrade pip
.build-venv/bin/pip install "PySide6>=6.6" "cryptography>=42" "pyinstaller>=6"
rm -rf build/pyinstaller dist/pokemmo-companion
.build-venv/bin/pyinstaller --noconfirm --workpath build/pyinstaller --distpath dist packaging/companion.spec
APPDIR=build/AppDir
rm -rf "$APPDIR"; mkdir -p "$APPDIR/usr/lib" "$APPDIR/usr/share/icons/hicolor/scalable/apps"
cp -a dist/pokemmo-companion "$APPDIR/usr/lib/"
cp ui/img/pokeball.svg "$APPDIR/pokemmo-companion.svg"
cp ui/img/pokeball.svg "$APPDIR/usr/share/icons/hicolor/scalable/apps/pokemmo-companion.svg"
cat > "$APPDIR/AppRun" <<'RUN'
#!/bin/sh
HERE="$(dirname "$(readlink -f "$0")")"
exec "$HERE/usr/lib/pokemmo-companion/pokemmo-companion" "$@"
RUN
chmod +x "$APPDIR/AppRun"
cat > "$APPDIR/pokemmo-companion.desktop" <<'DESK'
[Desktop Entry]
Type=Application
Name=PokeMMO Companion
Comment=Unofficial companion for PokeMMO
Exec=pokemmo-companion
Icon=pokemmo-companion
Categories=Game;Utility;
DESK
VERSION="$(python3 -c 'import companion; print(companion.__version__)')"
ARCH=x86_64 appimagetool "$APPDIR" "dist/PokeMMO-Companion-${VERSION}-x86_64.AppImage"
( cd dist && sha256sum "PokeMMO-Companion-${VERSION}-x86_64.AppImage" >> SHA256SUMS )
echo "Built dist/PokeMMO-Companion-${VERSION}-x86_64.AppImage (unsigned; sign SHA256SUMS before publishing)"
