"""Filesystem locations. User data never lives inside the repository."""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path

from . import APP_ID

PACKAGE_DIR = Path(__file__).resolve().parent
REPO_DIR = PACKAGE_DIR.parent
UI_DIR = REPO_DIR / "ui"
BUNDLED_DATA_DIR = PACKAGE_DIR / "data"


def default_data_dir() -> Path:
    """Per-user data directory (XDG on Linux, %APPDATA% on Windows)."""
    override = os.environ.get("POKEMMO_COMPANION_DATA")
    if override:
        return Path(override).expanduser()
    if sys.platform.startswith("win"):
        base = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
        return Path(base) / "PokeMMO-Companion"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "PokeMMO-Companion"
    base = os.environ.get("XDG_DATA_HOME") or str(Path.home() / ".local" / "share")
    return Path(base) / APP_ID


@dataclass(frozen=True)
class Paths:
    root: Path

    @property
    def db(self) -> Path:
        return self.root / "companion.sqlite3"

    @property
    def backups(self) -> Path:
        return self.root / "backups"

    @property
    def private(self) -> Path:
        """User-imported PokeMMO client data. Never uploaded, never committed."""
        return self.root / "private"

    @property
    def dex_dir(self) -> Path:
        return self.private / "dex"

    @property
    def assets_dir(self) -> Path:
        return self.private / "assets"

    @property
    def guides_dir(self) -> Path:
        return self.private / "guides"

    @property
    def logs(self) -> Path:
        return self.root / "logs"

    def ensure(self) -> "Paths":
        for p in (self.root, self.backups, self.private, self.dex_dir, self.assets_dir,
                  self.guides_dir, self.logs):
            p.mkdir(parents=True, exist_ok=True)
        return self


def make_paths(root: str | os.PathLike | None = None) -> Paths:
    return Paths(Path(root).expanduser() if root else default_data_dir()).ensure()
