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

PHENOMENA_RELAY_URL = ""  # Reserved for internal relay testing.

ALPHAPEDIA_URL = "https://alpha.pokemmotools.org/"
ALPHAPEDIA_DISCORD_URL = "https://discord.gg/Qeuc9k4yMw"
ALPHAPEDIA_PHENOMENA_URL = ALPHAPEDIA_URL + "pheno-list"
ALPHAPEDIA_REPORTING_URL = ALPHAPEDIA_URL + "help#tab-publish"
ALPHAPEDIA_PHENOMENA_REPORTING_URL = ALPHAPEDIA_URL + "help#publish-pheno-panel"


def alphapedia_links() -> dict:
    return {"website": ALPHAPEDIA_URL, "discord": ALPHAPEDIA_DISCORD_URL,
            "phenomena": ALPHAPEDIA_PHENOMENA_URL, "reporting": ALPHAPEDIA_REPORTING_URL,
            "phenomena_reporting": ALPHAPEDIA_PHENOMENA_REPORTING_URL}


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
    def media(self) -> Path:
        """Images the user attached (Box photos, guide step pictures). Local only."""
        return self.root / "media"

    @property
    def logs(self) -> Path:
        return self.root / "logs"

    def ensure(self) -> "Paths":
        for p in (self.root, self.backups, self.private, self.dex_dir, self.assets_dir,
                  self.guides_dir, self.logs, self.media):
            p.mkdir(parents=True, exist_ok=True)
        return self


def make_paths(root: str | os.PathLike | None = None) -> Paths:
    return Paths(Path(root).expanduser() if root else default_data_dir()).ensure()

# Community (2026-11-24) — the one place the public invite lives. Discord is optional: nothing in Companion needs
# a Discord account or membership. An empty or malformed value turns every community link off.
COMMUNITY_DISCORD_INVITE = "https://discord.gg/5Wbh28M3gu"


def community_links() -> dict:
    import re
    url = (COMMUNITY_DISCORD_INVITE or "").strip()
    ok = re.fullmatch(r"https://discord\.gg/[A-Za-z0-9-]{2,32}", url)
    return {"discord": url if ok else None}
