"""Single running instance per data folder (2026-11-24).

The first Companion holds an exclusive lock on <data>/companion.lock and writes <data>/instance.json (port,
token, pid; readable only by the user). A second launch finds the lock taken, asks the running instance to show
its main window (and optionally to launch PokeMMO) over the loopback API, and exits — so there are never two
sets of background workers or duplicate notifications.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
from pathlib import Path


class InstanceLock:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.lock_path = self.root / "companion.lock"
        self.info_path = self.root / "instance.json"
        self._fh = None

    def acquire(self) -> bool:
        self.root.mkdir(parents=True, exist_ok=True)
        fh = open(self.lock_path, "a+")
        try:
            if sys.platform.startswith("win"):
                import msvcrt
                fh.seek(0)
                msvcrt.locking(fh.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            fh.close()
            return False
        self._fh = fh
        return True

    def acquire_wait(self, timeout: float, interval: float = 0.25) -> bool:
        """Try to take the lock until `timeout` s have passed (a closing instance releases it when it exits)."""
        import time
        end = time.monotonic() + timeout
        while True:
            if self.acquire():
                return True
            if time.monotonic() >= end:
                return False
            time.sleep(interval)

    def publish(self, base_url: str, token: str) -> None:
        tmp = self.info_path.with_suffix(".part")
        tmp.write_text(json.dumps({"url": base_url, "token": token, "pid": os.getpid()}), encoding="utf-8")
        try:
            os.chmod(tmp, 0o600)
        except OSError:
            pass
        tmp.replace(self.info_path)

    def release(self) -> None:
        if self._fh:
            try:
                self.info_path.unlink(missing_ok=True)
            except OSError:
                pass
            self._fh.close()
            self._fh = None

    def is_held_elsewhere(self) -> bool:
        """True when another process holds the lock (used by the login watcher)."""
        probe = InstanceLock(self.root)
        if probe.acquire():
            probe.release_lock_only()
            return False
        return True

    def release_lock_only(self) -> None:
        if self._fh:
            self._fh.close()
            self._fh = None

    def signal_running(self, action: dict, timeout: float = 4.0) -> bool:
        """Ask the running instance to do something (show the main window, launch the game)."""
        try:
            info = json.loads(self.info_path.read_text(encoding="utf-8"))
            req = urllib.request.Request(info["url"].rstrip("/") + "/api/shell/command", data=json.dumps(action).encode(),
                                         headers={"Content-Type": "application/json", "X-Companion-Token": info["token"]}, method="POST")
            with urllib.request.urlopen(req, timeout=timeout):
                return True
        except Exception:
            return False
