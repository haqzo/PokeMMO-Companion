"""Local diagnostics and a sanitized log for troubleshooting (2026-11-24). Nothing is sent anywhere: the player
saves the text and decides whether to share it. Session tokens, the home folder path, user names in paths and
URL credentials/query strings are removed."""
from __future__ import annotations

import os
import platform
import re
import sys
from pathlib import Path

from .. import __version__

MAX_LOG_LINES = 3000
_TOKEN = re.compile(r"(token=|X-Companion-Token[\"']?\s*[:=]\s*[\"']?)[A-Za-z0-9_\-]{8,}", re.I)
_URL_CRED = re.compile(r"(https?://)[^/@\s]+@")
_QUERY = re.compile(r"(https?://[^\s?#\"']+)\?[^\s\"']*")


def sanitize(text: str, home: str | None = None) -> str:
    home = home or str(Path.home())
    out = _TOKEN.sub(r"\1[removed]", text)
    out = _URL_CRED.sub(r"\1[removed]@", out)
    out = _QUERY.sub(r"\1?[removed]", out)
    if home and len(home) > 1:
        out = out.replace(home, "~")
    user = os.environ.get("USER") or os.environ.get("USERNAME")
    if user and len(user) > 2:
        out = re.sub(rf"(?<![A-Za-z0-9]){re.escape(user)}(?![A-Za-z0-9])", "[user]", out)
    return out


def report(ctx) -> dict:
    caps = ctx.shell.capabilities
    m = ctx.dex.manifest or {}
    return {"companion": __version__, "python": sys.version.split()[0], "os": f"{platform.system()} {platform.release()}",
            "desktop": os.environ.get("XDG_CURRENT_DESKTOP"), "session": os.environ.get("XDG_SESSION_TYPE"),
            "window_mode": ctx.shell.mode, "qt": caps.get("qt"), "qt_platform": caps.get("platform"),
            "capabilities": {k: v for k, v in caps.items() if isinstance(v, bool)},
            "reference_data": {"source": m.get("source_kind"), "dump_date": m.get("dump_date")},
            "species": len(ctx.dex.species), "timers": len(ctx.timers.timers),
            "settings_changed": sorted(k for k in ctx.storage.all_settings() if not k.startswith(("news.", "app_updates.cache")))[:200]}


def sanitized_log(log_dir: Path) -> str:
    f = Path(log_dir) / "companion.log"
    if not f.is_file():
        return "(no log file yet)\n"
    lines = f.read_text(encoding="utf-8", errors="replace").splitlines()[-MAX_LOG_LINES:]
    return sanitize("\n".join(lines)) + "\n"
