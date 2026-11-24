# PyInstaller spec for PokeMMO Companion (onedir build). Used by packaging/linux/build-appimage.sh and
# packaging/windows/build.ps1. Bundles the Python runtime, PySide6 + QtWebEngine, the UI and the approved
# reference data. Never bundles ROMs, dumps, private/ or any user data (that lives in the per-user data folder).
# Status 2026-11-24: written but NOT yet built or tested on Linux or Windows (see docs/build/19).
import sys
from pathlib import Path

root = Path(SPECPATH).resolve().parent
datas = [(str(root / "ui"), "ui"), (str(root / "companion" / "data"), "companion/data")]
hidden = ["companion.shell.qt_shell", "cryptography.hazmat.primitives.asymmetric.ed25519"]
excludes = ["tkinter", "pytest", "playwright"]

a = Analysis([str(root / "packaging" / "entry.py")], pathex=[str(root)], datas=datas, hiddenimports=hidden, excludes=excludes)
pyz = PYZ(a.pure)
icon = str(root / "packaging" / "windows" / "pokemmo-companion.ico") if sys.platform.startswith("win") else None
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="pokemmo-companion", console=False, icon=icon)
coll = COLLECT(exe, a.binaries, a.datas, name="pokemmo-companion")
