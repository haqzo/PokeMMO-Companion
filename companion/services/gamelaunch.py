"""Startup & game integration (2026-11-24).

* Detects PokeMMO installs (Linux Flatpak `com.pokemmo.PokeMMO`, standalone Linux launchers, Windows installed
  and portable launchers) or uses a launcher the player picked. Launching is argument-based (no shell string).
* Never starts PokeMMO twice: a running client is detected from the process list first.
* Never closes, modifies, downloads or reads PokeMMO. No memory access, no injection, no automation.
* Optional integrations are plain, visible files the player can remove at any time (nothing hidden or privileged):
    - login autostart entry for Companion,
    - "PokeMMO + Companion" shortcut that starts both,
    - an opt-in lightweight watcher started at login that only starts Companion when PokeMMO appears.
  Companion cannot start by itself if both Companion and that watcher are closed.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path
from ..storage import StorageClosedError

log = logging.getLogger("companion.game")
FLATPAK_ID = "com.pokemmo.PokeMMO"
PROC_MARKERS = ("pokemmo",)                       # case-insensitive, matched against the process name / command
SELF_MARKERS = ("companion", "pokemmo-companion")  # never mistake ourselves for the game


class GameError(Exception):
    pass


def _home() -> Path:
    return Path(os.environ.get("HOME") or os.path.expanduser("~"))


# ------------------------------------------------------------------ detection
def detect(extra_paths: list[str] | None = None) -> list[dict]:
    """Every PokeMMO launcher found on this computer, best first. Each: {kind, label, argv, cwd}."""
    out: list[dict] = []
    if sys.platform.startswith("linux"):
        fp = shutil.which("flatpak")
        dirs = [_home() / ".local/share/flatpak/app" / FLATPAK_ID, Path("/var/lib/flatpak/app") / FLATPAK_ID]
        if fp and any(d.exists() for d in dirs):
            out.append({"kind": "flatpak", "label": "PokeMMO (Flatpak)", "argv": [fp, "run", FLATPAK_ID], "cwd": None})
        cands = [_home() / "PokeMMO" / "PokeMMO.sh", _home() / "Games" / "PokeMMO" / "PokeMMO.sh", _home() / ".local/share/pokemmo/PokeMMO.sh",
                 _home() / "pokemmo" / "PokeMMO.sh", Path("/opt/pokemmo/PokeMMO.sh")]
        for c in cands:
            if c.is_file():
                out.append({"kind": "standalone", "label": f"PokeMMO ({c.parent})", "argv": [str(c)], "cwd": str(c.parent)})
        for name in ("pokemmo", "pokemmo-installer"):
            w = shutil.which(name)
            if w:
                out.append({"kind": "standalone", "label": f"PokeMMO ({w})", "argv": [w], "cwd": None})
    elif sys.platform.startswith("win"):
        env = os.environ
        roots = [env.get("LOCALAPPDATA", "") + r"\Programs\PokeMMO", env.get("ProgramFiles", "") + r"\PokeMMO",
                 env.get("ProgramFiles(x86)", "") + r"\PokeMMO", env.get("USERPROFILE", "") + r"\PokeMMO",
                 env.get("USERPROFILE", "") + r"\Desktop\PokeMMO", env.get("USERPROFILE", "") + r"\Downloads\PokeMMO"]
        for r in roots:
            exe = Path(r) / "PokeMMO.exe"
            if r and exe.is_file():
                kind = "installed" if "Program" in r else "portable"
                out.append({"kind": kind, "label": f"PokeMMO ({r})", "argv": [str(exe)], "cwd": str(exe.parent)})
    for p in extra_paths or []:
        if p and Path(p).is_file():
            out.insert(0, {"kind": "manual", "label": f"PokeMMO ({p})", "argv": [p], "cwd": str(Path(p).parent)})
    seen, uniq = set(), []
    for c in out:
        k = tuple(c["argv"])
        if k not in seen:
            seen.add(k)
            uniq.append(c)
    return uniq


def validate_launcher(path: str) -> str:
    p = Path(path).expanduser()
    if not p.is_file():
        raise GameError("That file does not exist")
    if sys.platform.startswith("win"):
        if p.suffix.lower() not in (".exe", ".bat", ".cmd", ".lnk"):
            raise GameError("Choose PokeMMO.exe (or its shortcut)")
    elif not os.access(p, os.X_OK) and p.suffix not in (".sh",):
        raise GameError("That file is not a program that can be started")
    return str(p.resolve())


# ------------------------------------------------------------------ process presence
def game_running() -> bool:
    try:
        if sys.platform.startswith("linux"):
            me = os.getpid()
            for d in Path("/proc").iterdir():
                if not d.name.isdigit() or int(d.name) == me:
                    continue
                try:
                    raw = (d / "cmdline").read_bytes().replace(b"\0", b" ").decode("utf-8", "replace").lower()
                    comm = (d / "comm").read_text().strip().lower()
                except OSError:
                    continue
                text = comm + " " + raw
                if any(m in text for m in PROC_MARKERS) and not any(s in text for s in SELF_MARKERS):
                    return True
            return False
        if sys.platform.startswith("win"):
            res = subprocess.run(["tasklist", "/FO", "CSV", "/NH"], capture_output=True, text=True, timeout=10,
                                 creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            return any(line.lower().startswith('"pokemmo') for line in res.stdout.splitlines())
    except Exception:  # pragma: no cover - presence is best effort
        log.debug("process check failed", exc_info=True)
    return False


LAUNCH_GRACE = 60.0          # seconds: PokeMMO (especially the Flatpak) needs a while before its process is visible
_launch_lock = threading.Lock()


def _marker_path() -> Path:
    base = os.environ.get("XDG_RUNTIME_DIR") or os.environ.get("TEMP") or "/tmp"
    return Path(base) / f"pokemmo-companion-launch-{os.getuid() if hasattr(os, 'getuid') else 'user'}.lock"


def _claim_launch(marker: Path, grace: float = LAUNCH_GRACE) -> bool:
    """Atomically claim the right to start the game (O_EXCL create — one winner across threads AND processes).
    A claim younger than `grace` blocks further starts; an older one is stale and replaced."""
    for _ in range(2):
        try:
            fd = os.open(str(marker), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            os.write(fd, f"{os.getpid()} {time.time():.0f}".encode())
            os.close(fd)
            return True
        except FileExistsError:
            try:
                if time.time() - marker.stat().st_mtime < grace:
                    return False
                marker.unlink()          # stale: replace it (if another process wins the re-create, we lose)
            except FileNotFoundError:
                continue
        except OSError:
            log.debug("launch marker unavailable; falling back to the in-process lock", exc_info=True)
            return True
    return False


def launch(argv: list[str], cwd: str | None = None, check_running=game_running, marker: Path | None = None) -> dict:
    """Start PokeMMO detached from Companion (closing Companion never closes the game).

    Race-safe (2026-11-24): a process check alone is not enough — two requests arriving together (double click,
    the combined shortcut plus the Launch button, two shortcut starts) would both see "not running". Starts are
    serialised in-process by a lock and across processes by an atomic marker file; a second request within the
    grace period reports `already_starting` instead of starting another client."""
    if not argv:
        raise GameError("No PokeMMO launcher found — choose it in Settings › Startup & game integration")
    with _launch_lock:
        if check_running():
            return {"started": False, "already_running": True}
        if not _claim_launch(marker or _marker_path()):
            return {"started": False, "already_running": False, "already_starting": True}
        return _spawn(argv, cwd)


def _spawn(argv: list[str], cwd: str | None) -> dict:
    kw: dict = {"cwd": cwd or None, "stdin": subprocess.DEVNULL, "stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}
    if sys.platform.startswith("win"):
        kw["creationflags"] = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    else:
        kw["start_new_session"] = True
    try:
        subprocess.Popen([str(a) for a in argv], **kw)   # argument list, never a shell string
    except OSError as exc:
        raise GameError(f"PokeMMO could not be started: {exc.strerror or exc}") from None
    return {"started": True, "already_running": False}


class GamePresence:
    """While Companion runs: notice PokeMMO starting/closing (polls every 10 s, very cheap). On close it does what
    the player chose: keep running (default), minimise to tray, or quit Companion. It never touches the game."""

    def __init__(self, settings, bus, shell_queue=None, check=game_running, interval: float = 10.0):
        self.settings, self.bus, self.shell_queue, self.check, self.interval = settings, bus, shell_queue, check, interval
        self.running: bool | None = None
        self._stop = threading.Event()
        self._thread = None

    def poll(self) -> str | None:
        now = bool(self.check())
        prev, self.running = self.running, now
        if prev is None or prev == now:
            return None
        event = "started" if now else "closed"
        self.bus.publish("game", {"running": now, "event": event})
        if event == "closed":
            action = self.settings.get("game.on_exit") or "keep"
            if action in ("minimize", "quit") and self.shell_queue:
                self.shell_queue({"action": "minimize_main" if action == "minimize" else "quit"})
        return event

    def start(self) -> None:
        if self._thread:
            return

        def loop():
            while not self._stop.is_set():
                try:
                    if self.settings.get("game.watch") or (self.settings.get("game.on_exit") or "keep") != "keep":
                        self.poll()
                except StorageClosedError:
                    if self._stop.is_set():      # Companion is closing: stop here, nothing left to save
                        return
                    raise
                except Exception:  # pragma: no cover
                    log.exception("game presence check failed")
                if self._stop.wait(self.interval):
                    return
        self._thread = threading.Thread(target=loop, name="game-presence", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()


# ------------------------------------------------------------------ how to start Companion itself
def companion_command() -> list[str]:
    if getattr(sys, "frozen", False):                      # packaged build
        appimage = os.environ.get("APPIMAGE")
        return [appimage] if appimage else [sys.executable]
    root = Path(__file__).resolve().parents[2]
    if sys.platform.startswith("win"):
        return ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(root / "run.ps1")]
    return [str(root / "run.sh")]


def _desktop_quote(a: str) -> str:
    return '"' + a.replace("\\", "\\\\").replace('"', '\\"').replace("`", "\\`").replace("$", "\\$") + '"' if any(c in a for c in ' "\'\\$`') else a


def _desktop_entry(name: str, comment: str, argv: list[str], icon: str | None, autostart: bool) -> str:
    lines = ["[Desktop Entry]", "Type=Application", f"Name={name}", f"Comment={comment}",
             "Exec=" + " ".join(_desktop_quote(a) for a in argv), "Terminal=false", "Categories=Game;Utility;"]
    if icon:
        lines.append(f"Icon={icon}")
    if autostart:
        lines.append("X-GNOME-Autostart-enabled=true")
    lines.append("X-PokeMMO-Companion=1")
    return "\n".join(lines) + "\n"


def _win_cmd(argv: list[str]) -> str:
    q = lambda a: '"' + a.replace('"', '') + '"'  # noqa: E731
    return "@echo off\r\nstart \"\" " + " ".join(q(a) for a in argv) + "\r\n"


INTEGRATIONS = ("login", "shortcut", "watcher")


def integration_paths(kind: str) -> list[Path]:
    if sys.platform.startswith("win"):
        appdata = Path(os.environ.get("APPDATA", ""))
        startup = appdata / "Microsoft/Windows/Start Menu/Programs/Startup"
        desktop = Path(os.environ.get("USERPROFILE", "")) / "Desktop"
        return {"login": [startup / "PokeMMO Companion.cmd"], "shortcut": [desktop / "PokeMMO + Companion.cmd"],
                "watcher": [startup / "PokeMMO Companion (start with PokeMMO).cmd"]}[kind]
    cfg = Path(os.environ.get("XDG_CONFIG_HOME") or _home() / ".config")
    data = Path(os.environ.get("XDG_DATA_HOME") or _home() / ".local/share")
    desk = _home() / "Desktop"
    return {"login": [cfg / "autostart/pokemmo-companion.desktop"],
            "shortcut": [data / "applications/pokemmo-companion-with-game.desktop"] + ([desk / "pokemmo-companion-with-game.desktop"] if desk.is_dir() else []),
            "watcher": [cfg / "autostart/pokemmo-companion-watcher.desktop"]}[kind]


def install_integration(kind: str, minimized: bool = False, icon: str | None = None) -> list[str]:
    base = companion_command()
    spec = {"login": ("PokeMMO Companion", "Start PokeMMO Companion at login", base + (["--minimized"] if minimized else [])),
            "shortcut": ("PokeMMO + Companion", "Start PokeMMO and PokeMMO Companion", base + ["--launch-game"]),
            "watcher": ("PokeMMO Companion (start with PokeMMO)", "Starts PokeMMO Companion when PokeMMO starts", base + ["--watch-game"])}[kind]
    written = []
    for p in integration_paths(kind):
        p.parent.mkdir(parents=True, exist_ok=True)
        if sys.platform.startswith("win"):
            p.write_text(_win_cmd(spec[2]), encoding="utf-8")
        else:
            p.write_text(_desktop_entry(spec[0], spec[1], spec[2], icon, autostart=kind != "shortcut"), encoding="utf-8")
            if p.parent.name == "Desktop":
                p.chmod(0o755)              # KDE/GNOME only run desktop-folder launchers that are executable
        written.append(str(p))
    return written


def remove_integration(kind: str) -> list[str]:
    removed = []
    for p in integration_paths(kind):
        if p.is_file():
            # only ever delete files we wrote ourselves
            txt = p.read_text(encoding="utf-8", errors="replace")
            if "X-PokeMMO-Companion=1" in txt or (sys.platform.startswith("win") and "companion" in txt.lower()):
                p.unlink()
                removed.append(str(p))
    return removed


def integration_status() -> dict:
    return {k: any(p.is_file() for p in integration_paths(k)) for k in INTEGRATIONS}


def start_watcher_now() -> bool:
    """Start the helper right away (instead of only at next login). It holds its own single-instance lock, so a
    second copy exits at once; it stops by itself when its autostart entry is removed."""
    if os.environ.get("COMPANION_NO_SPAWN"):          # tests
        return False
    try:
        subprocess.Popen(companion_command() + ["--watch-game"], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         **({"start_new_session": True} if not sys.platform.startswith("win") else
                            {"creationflags": getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NO_WINDOW", 0)}))
        return True
    except OSError:
        log.warning("could not start the PokeMMO watcher", exc_info=True)
        return False


def watch_and_start(is_companion_running, start_companion, check=game_running, interval: float = 10.0, stop=None) -> None:
    """The opt-in login watcher: when PokeMMO appears and Companion is not running, start Companion. Nothing else."""
    was = False
    stop = stop or threading.Event()
    while not stop.is_set():
        now = bool(check())
        if now and not was and not is_companion_running():
            start_companion()
        was = now
        stop.wait(interval)
