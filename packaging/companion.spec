"""PyInstaller onedir spec shared by Linux and Windows."""
import sys
from pathlib import Path
from runpy import run_path

root = Path(SPECPATH).resolve().parent
bundle_assets = run_path(str(root / "packaging" / "bundle_assets.py"))["bundle_assets"]
datas = [(str(root / file), file.parent.as_posix()) for file in bundle_assets(root)]

hidden = ["companion.shell.qt_shell", "cryptography.hazmat.primitives.asymmetric.ed25519"]
if sys.platform == "win32":
    from PyInstaller.utils.hooks import copy_metadata

    hidden.append("truststore._windows")
    # The wheel's dist-info includes the upstream MIT license notice.
    datas += copy_metadata("truststore")
excludes = ["tkinter", "pytest", "playwright"]
a = Analysis([str(root / "packaging" / "entry.py")], pathex=[str(root)], datas=datas,
             hiddenimports=hidden, excludes=excludes)
if sys.platform.startswith("linux"):
    # The Qt wheel's TIFF plugin needs libtiff.so.5, which is absent on newer
    # distros. Companion accepts PNG, JPEG, GIF and WebP for imported images.
    a.binaries = [entry for entry in a.binaries if Path(entry[0]).name != "libqtiff.so"]
pyz = PYZ(a.pure)
# The repository has no Windows .ico file. PyInstaller supplies its default icon.
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="pokemmo-companion",
          console=not sys.platform.startswith("win"))
coll = COLLECT(exe, a.binaries, a.datas, name="pokemmo-companion")
