"""Application context: wires storage, services and the shell bridge together."""
from __future__ import annotations

import logging
import queue
import secrets
import threading
import time
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
from .services.region_maps import RegionMaps
from .services.timers import TimerService
from .services.guide_extras import GuideExtras
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
    def __init__(self, data_dir: str | None = None, *, internal_reporting: bool = False):
        self.paths: Paths = make_paths(data_dir)
        self.storage = Storage(self.paths.db, self.paths.backups)
        from .services import backup as _backup
        self.restore_marker = self.paths.root / "restore-in-progress.json"
        self.restore_recovered = _backup.finish_interrupted(self.storage, self.paths.media, self.restore_marker)
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
        from .services.refdata import ReferenceUpdater
        from .services.appupdate import AppUpdateChecker
        self.refdata = ReferenceUpdater(self.paths.root / "reference", self.settings, self.bus)
        self.app_updates = AppUpdateChecker(self.storage, self.settings, self.bus)
        self.items = ItemService(self.paths, self.storage)
        self.dex.machines = self.items.machines
        self.notes = NotesService(self.storage)
        self.box = BoxService(self.storage, self.dex)
        self.showcases = ShowcaseService(self.storage, self.box)
        self.cguides = CustomGuideService(self.storage)
        self.media = MediaService(self.storage, self.paths)
        self.bookmarks = BookmarkService(self.storage)
        self._cleanup_removed_features()
        self.news = NewsService(self.storage)
        self.notifier = Notifier()
        self.live = LiveService(self.storage, self.settings, self.bus, self.dex, self.notifier,
                                internal_reporting=internal_reporting)
        from .services.seasonal import Seasons
        self.seasons = Seasons(self.refdata, self.live)
        self.live.community.seasons = self.seasons
        self.region_maps = RegionMaps(self.paths, self.storage, self.bus)
        try:
            self.region_maps.recover()
        except OSError:
            log.exception("Could not check region-map artwork")
        self.timers = TimerService(self.storage, self.settings, self.bus, self.notifier)
        self.guide_extras = GuideExtras(self.storage)
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
        # one-off start-up jobs are tracked too, so shutdown can wait for them before closing the database
        self._oneoff = [threading.Thread(target=self._backfill_sprite_bounds, name="sprite-bounds", daemon=True),
                        threading.Thread(target=self.sync_local_data, name="data-sync", daemon=True)]
        for t in self._oneoff:
            t.start()
        self.live.apply_settings()
        if self.live.community.available:
            self.live.community.sync.apply_settings()
        self.news.start_auto(self.settings, self.bus)
        self.timers.start()
        self.refdata.start_auto()
        self.app_updates.start_auto()
        from .services.gamelaunch import GamePresence
        self.game = GamePresence(self.settings, self.bus, shell_queue=self.shell.submit)
        self.game.start()
        from .services.backup import AutoBackup
        self.auto_backup = AutoBackup(self.storage, self.paths.media, self.paths.backups, self.settings)
        self.auto_backup.start()

    def shutdown(self, join_timeout: float = 4.0) -> None:
        """Stop every background worker, wait for them (one shared deadline), then close the database.
        Call after server.stop() has drained the HTTP requests. Safe to call twice.
        Before 2026-11-24 the workers were only signalled, and the database could close under a worker or a
        late HTTP request (sqlite3.ProgrammingError: Cannot operate on a closed database)."""
        if getattr(self, "_shut", False):
            return
        self._shut = True
        services = [self.live, self.timers, getattr(self, "auto_backup", None), self.refdata, getattr(self, "game", None), self.app_updates]
        self.news.stop_auto()
        for svc in services:
            if svc is not None:
                svc.stop()
        threads = [getattr(svc, "_thread", None) for svc in services if svc is not None]
        threads += [self.live.phenomena._thread, self.live.community.sync._thread,
                    getattr(self.news, "_auto_thread", None)] + list(getattr(self, "_oneoff", []))
        deadline = time.monotonic() + join_timeout
        for t in threads:
            if t is not None and t.is_alive() and t is not threading.current_thread():
                t.join(max(0.0, deadline - time.monotonic()))
        still = [t.name for t in threads if t is not None and t.is_alive()]
        if still:
            # e.g. a report worker blocked in a network read checks its stop flag before touching the database
            log.info("Shutdown: still finishing after %.0f s: %s", join_timeout, ", ".join(still))
        self.storage.close()
