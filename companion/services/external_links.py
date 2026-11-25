"""Open HTTP(S) links with the system browser, outside the bundled runtime."""
from __future__ import annotations

import logging
import os
from pathlib import Path
import shutil
import subprocess
import sys
import threading
from urllib.parse import urlsplit
import webbrowser

log = logging.getLogger("companion.links")

# PyInstaller's PySide6 hook sets the Qt plugin and QML paths. Also filter other
# search paths that can refer into an AppImage when supplied by its launcher.
_SEARCH_PATHS = (
    "LD_LIBRARY_PATH", "PATH", "QT_PLUGIN_PATH", "QT_QPA_PLATFORM_PLUGIN_PATH",
    "QML2_IMPORT_PATH", "QML_IMPORT_PATH", "XDG_DATA_DIRS",
)


def linux_browser_environment() -> dict[str, str]:
    """Give a system process host libraries and keep Companion's environment intact."""
    env = os.environ.copy()
    meipass = getattr(sys, "_MEIPASS", None) if getattr(sys, "frozen", False) else None
    appdir = env.get("APPDIR")
    roots = [Path(root).resolve() for root in (meipass, appdir) if root]
    if meipass:
        env["LD_LIBRARY_PATH"] = env.pop("LD_LIBRARY_PATH_ORIG", "")
    if appdir:
        for key in ("APPDIR", "APPIMAGE", "ARGV0", "OWD", "APPIMAGE_EXTRACT_AND_RUN"):
            env.pop(key, None)
    if not roots:
        return env

    for key in _SEARCH_PATHS:
        if key not in env:
            continue
        entries = [entry for entry in env[key].split(os.pathsep) if entry
                   and not any(Path(entry).resolve().is_relative_to(root) for root in roots)]
        if entries:
            env[key] = os.pathsep.join(entries)
        else:
            env.pop(key)
    # An emptied PATH must not cause subprocess to search the AppImage's working directory.
    env.setdefault("PATH", os.defpath)
    return env


def _valid_url(url: str) -> bool:
    if not isinstance(url, str) or any(c.isspace() or ord(c) < 32 or c == "\\" or ord(c) == 127 for c in url):
        return False
    try:
        parts = urlsplit(url)
        return parts.scheme in ("http", "https") and bool(parts.hostname) and parts.username is None and parts.password is None
    except ValueError:
        return False


def _watch_browser(process: subprocess.Popen, on_failure) -> None:
    status = process.wait()
    if status:
        log.warning("System browser launcher exited with status %s.", status)
        if on_failure is not None:
            on_failure()


def open_external_url(url: str, *, new: int = 0, desktop_open=None, on_failure=None) -> bool:
    """Return whether dispatch started. Report a later launcher failure via on_failure."""
    if not _valid_url(url):
        return False
    try:
        if not sys.platform.startswith("linux"):
            return bool(desktop_open(url) if desktop_open is not None else webbrowser.open(url, new=new))

        env = linux_browser_environment()
        path = env.get("PATH", os.defpath)
        if opener := shutil.which("xdg-open", path=path):
            command = [opener, url]
        elif opener := shutil.which("gio", path=path):
            command = [opener, "open", url]
        else:
            log.warning("No system browser launcher found (xdg-open or gio).")
            return False
        process = subprocess.Popen(command, env=env, start_new_session=True, stdin=subprocess.DEVNULL,
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except (OSError, ValueError, RuntimeError, webbrowser.Error) as exc:
        log.warning("Could not start the system browser launcher (%s).", type(exc).__name__)
        return False
    threading.Thread(target=_watch_browser, args=(process, on_failure), name="browser-launcher", daemon=True).start()
    return True
