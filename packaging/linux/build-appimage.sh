#!/usr/bin/env bash
# Build an unsigned, local Linux x86_64 AppImage and checksum.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/../.."
APPIMAGETOOL="${COMPANION_APPIMAGETOOL:-appimagetool}"
PYTHON="${COMPANION_BUILD_PYTHON:-python3}"
test "$(uname -m)" = x86_64
command -v "$APPIMAGETOOL" >/dev/null
"$PYTHON" -m venv .build-venv
.build-venv/bin/python -m pip install --requirement packaging/requirements-build.txt
.build-venv/bin/python -m PyInstaller --noconfirm --workpath build/pyinstaller --distpath dist packaging/companion.spec

APPDIR=build/AppDir
rm -rf "$APPDIR"
mkdir -p "$APPDIR/usr/lib" "$APPDIR/usr/share/icons/hicolor/scalable/apps"
cp -a dist/pokemmo-companion "$APPDIR/usr/lib/"
cp ui/img/pokeball.svg "$APPDIR/pokemmo-companion.svg"
cp ui/img/pokeball.svg "$APPDIR/usr/share/icons/hicolor/scalable/apps/pokemmo-companion.svg"
ln -s pokemmo-companion.svg "$APPDIR/.DirIcon"
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
VERSION="$("$PYTHON" -c 'import companion; print(companion.__version__)')"
ARTIFACT="PokeMMO-Companion-${VERSION}-x86_64.AppImage"
options=()
if [[ -n "${COMPANION_APPIMAGE_RUNTIME:-}" ]]; then
  options+=(--runtime-file "$COMPANION_APPIMAGE_RUNTIME")
fi
ARCH=x86_64 APPIMAGE_EXTRACT_AND_RUN=1 "$APPIMAGETOOL" --no-appstream "${options[@]}" "$APPDIR" "dist/$ARTIFACT"
( cd dist && sha256sum "$ARTIFACT" > SHA256SUMS )
wc -c "dist/$ARTIFACT"
