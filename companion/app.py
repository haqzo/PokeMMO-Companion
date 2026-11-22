"""Application context: wires storage, services and the shell bridge together."""
from __future__ import annotations

import logging
import queue
import secrets
import threading
from typing import Any, Callable

from . import __version__
from .config import Paths, make_paths
from .events import EventBus
from .services.dex import DexService
from .services.guides import GuideService
from .services.live import LiveService
from .services.news import NewsService
from .services.notify import Notifier
from .settings import Settings
from .storage import Storage

log = logging.getLogger("companion")


class ShellBridge:
    """Commands from any window (via HTTP) to the native shell, executed on the GUI thread."""

    def __init__(self) -> None:
        self.mode = "browser"           # browser | qt
        self.capabilities: dict[str, Any] = {
            "native_windows": False, "pin": False, "window_opacity": False, "toast_window": False,
            "tray": False, "position": False, "platform": "browser",
            "notes": ["Browser mode: popouts open as browser windows. Pin/always-on-top, window opacity and "
                      "native toasts need the native shell (PySide6)."]}
        self.queue: "queue.Queue[dict]" = queue.Queue()
        self.attached = False

    def attach(self, capabilities: dict[str, Any]) -> None:
        self.mode = "qt"
        self.attached = True
        self.capabilities = capabilities

    def submit(self, cmd: dict) -> dict:
        if not self.attached:
            return {"queued": False, "supported": False, "reason": "No native shell (browser mode)."}
        self.queue.put(cmd)
        return {"queued": True}


class AppContext:
    def __init__(self, data_dir: str | None = None):
        self.paths: Paths = make_paths(data_dir)
        self.storage = Storage(self.paths.db, self.paths.backups)
        self.settings = Settings(self.storage)
        self.bus = EventBus()
        self.dex = DexService(self.paths)
        self.guides = GuideService(self.storage, self.paths)
        self.news = NewsService(self.storage)
        self.notifier = Notifier()
        self.live = LiveService(self.storage, self.settings, self.bus, self.dex, self.notifier)
        self.shell = ShellBridge()
        self.token = secrets.token_urlsafe(24)
        self.version = __version__
        self.import_jobs: dict[str, dict] = {}
        self._import_lock = threading.Lock()
        self.on_quit: Callable[[], None] | None = None
        try:
            self.live.prune()
        except Exception:  # pragma: no cover
            log.exception("prune failed")

    def start_background(self) -> None:
        self.live.apply_settings()

    def shutdown(self) -> None:
        self.live.stop()
        self.storage.close()
