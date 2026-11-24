"""PyInstaller onedir spec shared by Linux and Windows."""
import re
import sys
from pathlib import Path

root = Path(SPECPATH).resolve().parent
# Explicit asset paths and formats. No whole-tree copy of data, settings, relay code or tooling.
asset_patterns = (
    r"ui/(?:index\.html|css/[a-z-]+\.css|img/[a-z-]+\.svg|js/(?:pages/)?[a-z0-9-]+\.js)",
    r"companion/data/(?:catalog_reference_synergy|form_art|forms|legendaries|legendary_mythical|news_snapshot|"
    r"pokemmo_availability|species_index|themes)\.json",
    r"companion/data/item-icons/(?:[0-9]+\.png|manifest\.json)",
    r"companion/data/sprites/(?:(?:static(?:-shiny)?|ani(?:-shiny)?)/[A-Za-z0-9_-]+\.(?:png|gif)|index\.json)",
    r"companion/data/maps/(?:[a-z0-9-]+\.svg|geometry\.json|game/[a-z0-9-]+\.png)",
    r"companion/data/reference/(?:manifest\.json|(?:extras|items|species)\.json\.gz)",
    r"companion/data/walkthroughs/(?:kanto|johto|hoenn|sinnoh|unova)\.json",
)
allow = re.compile("|".join(asset_patterns))
datas = [(str(root / "CREDITS.md"), ".")]
for directory in ("ui", "companion/data"):
    for file in sorted((root / directory).rglob("*")):
        relative = file.relative_to(root)
        if file.is_file() and allow.fullmatch(relative.as_posix()):
            if file.resolve() != file:
                raise ValueError(f"Packaged asset must be a regular file: {relative}")
            datas.append((str(file), relative.parent.as_posix()))

hidden = ["companion.shell.qt_shell", "cryptography.hazmat.primitives.asymmetric.ed25519"]
excludes = ["tkinter", "pytest", "playwright"]
a = Analysis([str(root / "packaging" / "entry.py")], pathex=[str(root)], datas=datas,
             hiddenimports=hidden, excludes=excludes)
pyz = PYZ(a.pure)
# The repository has no Windows .ico file. PyInstaller supplies its default icon.
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="pokemmo-companion",
          console=not sys.platform.startswith("win"))
coll = COLLECT(exe, a.binaries, a.datas, name="pokemmo-companion")
