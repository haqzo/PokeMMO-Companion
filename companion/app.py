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
from .services.bookmarks import BookmarkService
from .services.items import ItemService
import threading

from .services.sprite_library import SpriteLibrary
from .services.importer import recover_interrupted_swap, sync_existing_import
from .services.library import BoxService, CustomGuideService, MediaService, NotesService, ShowcaseService
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
        # Interrupted earlier swap? Put the last complete private install back before anything reads it.
        try:
            restored = recover_interrupted_swap(self.paths)
            if restored:
                log.warning("Restored previous private PokeMMO data after an interrupted update: %s", restored)
        except OSError:
            log.exception("Could not check for an interrupted data update")
        self.data_sync: dict = {"state": "pending"}
        self.dex = DexService(self.paths)
        self.sprite_library = SpriteLibrary(self.paths, self.bus)
        self.sprite_library.recover()
        self.sprite_library.reload()
        self.dex.library = self.sprite_library
        self.guides = GuideService(self.storage, self.paths)
        self.items = ItemService(self.paths, self.storage)
        self.notes = NotesService(self.storage)
        self.box = BoxService(self.storage, self.dex)
        self.showcases = ShowcaseService(self.storage, self.box)
        self.cguides = CustomGuideService(self.storage)
        self.media = MediaService(self.storage, self.paths)
        self.bookmarks = BookmarkService(self.storage)
        self._cleanup_removed_features()
        self.news = NewsService(self.storage)
        self.notifier = Notifier()
        self.live = LiveService(self.storage, self.settings, self.bus, self.dex, self.notifier)
        self.shell = ShellBridge()
        self.load_roster_checks()
        self.token = secrets.token_urlsafe(24)
        self.version = __version__
        self.import_jobs: dict[str, dict] = {}
        self._import_lock = threading.Lock()
        self.on_quit: Callable[[], None] | None = None
        try:
            self.live.prune()
        except Exception:  # pragma: no cover
            log.exception("prune failed")

    def load_roster_checks(self) -> None:
        self.dex.user_checks = {r["species_id"]: r for r in self.storage.query("SELECT * FROM roster_checks")}

    def dex_progress(self, run_id: str | None) -> dict[int, dict] | None:
        if not run_id:
            return None
        rows = self.storage.query("SELECT * FROM dex_progress WHERE run_id=?", (run_id,))
        return {r["species_id"]: {"status": r["status"], "caught_alpha": bool(r["caught_alpha"]),
                                  "owned_shiny": bool(r["owned_shiny"]), "owned_costume": bool(r["owned_costume"])}
                for r in rows}

    def _cleanup_removed_features(self) -> None:
        """The Damage calculator was removed in v0.1.0 (owner decision 2026-11-22): drop saved Quick access pins to it."""
        qa = self.settings.get("nav.quick_access") or []
        kept = [q for q in qa if not (q.get("kind") == "tool" and q.get("id") == "damage")]
        if kept != qa:
            self.settings.update({"nav.quick_access": kept})

    def sync_local_data(self) -> dict:
        """Bring an existing private install up to date from its previously approved local source.

        Runs once per start, off the UI thread. Installed data stays in use until a complete new copy
        is ready; any failure keeps it unchanged. Users never have to re-import after an update."""
        self.data_sync = {"state": "running"}
        try:
            res = sync_existing_import(self.paths, progress=log.info)
        except Exception as exc:  # noqa: BLE001
            log.exception("Local PokeMMO data sync failed; existing data preserved")
            res = {"state": "source-error", "reason": str(exc)}
        if res["state"] == "synchronized":
            self.dex.reload()
            self.items.reload()
            self.bus.publish("import", {"state": "done", "auto": True, "reason": res.get("reason")})
            log.info("Private PokeMMO data synchronized: %s", res)
        elif res["state"] not in ("current", "not-installed"):
            log.warning("Private PokeMMO data sync not applied: %s", res)
        self.data_sync = res
        return res

    def _backfill_sprite_bounds(self) -> None:
        try:
            if self.sprite_library.backfill_bounds():
                self.sprite_library.reload()
                self.bus.publish("sprites", {"state": "bounds"})
        except Exception:  # cosmetic only: the grid simply shows untrimmed stills
            log.warning("Could not measure sprite bounds", exc_info=True)

    def start_background(self) -> None:
        threading.Thread(target=self._backfill_sprite_bounds, name="sprite-bounds", daemon=True).start()
        threading.Thread(target=self.sync_local_data, name="data-sync", daemon=True).start()
        self.live.apply_settings()
        self.news.start_auto(self.settings, self.bus)

    def shutdown(self) -> None:
        self.live.stop()
        self.news.stop_auto()
        self.storage.close()
