"""Native OS notification backends.

Order: Qt system tray (when the native shell is running) → freedesktop
``notify-send`` / ``gdbus`` on Linux → unsupported. Each call reports what
actually happened so history never claims a delivery that did not occur.
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from typing import Callable

from .. import APP_NAME


class Notifier:
    def __init__(self) -> None:
        self.shell_backend: Callable[[str, str], bool] | None = None

    def describe(self) -> dict:
        if self.shell_backend:
            return {"backend": "qt-tray", "available": True}
        if sys.platform.startswith("linux"):
            if shutil.which("notify-send"):
                return {"backend": "notify-send", "available": True}
            if shutil.which("gdbus"):
                return {"backend": "gdbus", "available": True}
        return {"backend": "none", "available": False,
                "reason": "No notification backend: start with the native window shell (PySide6) "
                          "or install libnotify (notify-send)."}

    def notify(self, title: str, body: str) -> dict:
        title = title[:120]
        body = body[:400]
        if self.shell_backend:
            try:
                ok = self.shell_backend(title, body)
                return {"delivered": bool(ok), "backend": "qt-tray"}
            except Exception as exc:  # pragma: no cover - platform specific
                return {"delivered": False, "backend": "qt-tray", "error": str(exc)}
        if sys.platform.startswith("linux"):
            try:
                if shutil.which("notify-send"):
                    subprocess.run(["notify-send", f"--app-name={APP_NAME}", title, body],
                                   check=True, timeout=5, capture_output=True)
                    return {"delivered": True, "backend": "notify-send"}
                if shutil.which("gdbus"):
                    subprocess.run(["gdbus", "call", "--session", "--dest", "org.freedesktop.Notifications",
                                    "--object-path", "/org/freedesktop/Notifications",
                                    "--method", "org.freedesktop.Notifications.Notify", APP_NAME, "0", "",
                                    title, body, "[]", "{}", "8000"],
                                   check=True, timeout=5, capture_output=True)
                    return {"delivered": True, "backend": "gdbus"}
            except (subprocess.SubprocessError, OSError) as exc:
                return {"delivered": False, "backend": "linux", "error": str(exc)[:200]}
        return {"delivered": False, "backend": "none", "error": self.describe().get("reason")}
