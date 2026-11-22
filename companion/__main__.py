"""Command-line entry point: ``python -m companion [options]``."""
from __future__ import annotations

import argparse
import json
import logging
import os
import signal
import sys
import time
import urllib.request
import webbrowser

from . import APP_NAME, __version__


def _setup_logging(ctx_paths, verbose: bool) -> None:
    handlers: list[logging.Handler] = [logging.StreamHandler(sys.stderr)]
    try:
        handlers.append(logging.FileHandler(ctx_paths.logs / "companion.log", encoding="utf-8"))
    except OSError:
        pass
    logging.basicConfig(level=logging.DEBUG if verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s", handlers=handlers)


def choose_qt_platform(pref: str, override: str | None) -> str | None:
    """Decide QT_QPA_PLATFORM before Qt starts. Returns the value set, or None (Qt default)."""
    choice = override or pref
    if os.environ.get("QT_QPA_PLATFORM"):
        return os.environ["QT_QPA_PLATFORM"]  # user's explicit environment wins
    if not sys.platform.startswith("linux"):
        return None
    on_wayland = bool(os.environ.get("WAYLAND_DISPLAY"))
    if choice == "xwayland" or (choice == "auto" and on_wayland and os.environ.get("DISPLAY")
                                and "KDE" in os.environ.get("XDG_CURRENT_DESKTOP", "").upper()):
        os.environ["QT_QPA_PLATFORM"] = "xcb;wayland"  # fall back to Wayland if the xcb plugin can't load
        return "xcb;wayland"
    if choice == "wayland" and on_wayland:
        os.environ["QT_QPA_PLATFORM"] = "wayland"
        return "wayland"
    return None


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="companion", description=f"{APP_NAME} {__version__}")
    p.add_argument("--browser", action="store_true", help="Run in your web browser instead of native windows")
    p.add_argument("--no-open", action="store_true", help="Browser mode: print the URL instead of opening it")
    p.add_argument("--spike", action="store_true", help="Run the native window feasibility test and write a report")
    p.add_argument("--check", action="store_true", help="Headless self-check of the backend, then exit")
    p.add_argument("--data-dir", help="Use a different user data directory")
    p.add_argument("--port", type=int, default=0, help="Local port (default: random free port)")
    p.add_argument("--import-dumps", metavar="FOLDER", help="Import your PokeMMO dump zips from FOLDER, then continue")
    p.add_argument("--import-guides", metavar="FOLDER", help="Import your walkthrough .odt files from FOLDER")
    p.add_argument("--xwayland", action="store_true", help="Force XWayland (enables pin/positioning on KDE Wayland)")
    p.add_argument("--wayland", action="store_true", help="Force native Wayland")
    p.add_argument("--verbose", action="store_true")
    p.add_argument("--version", action="version", version=f"{APP_NAME} {__version__}")
    args = p.parse_args(argv)

    from .app import AppContext
    from .server import CompanionServer
    from .services import importer

    ctx = AppContext(args.data_dir)
    _setup_logging(ctx.paths, args.verbose)
    log = logging.getLogger("companion")
    log.info("%s %s — data dir %s", APP_NAME, __version__, ctx.paths.root)
    if ctx.storage.backup_created:
        log.info("Database migrated; previous copy saved to %s", ctx.storage.backup_created)

    if args.import_dumps:
        m = importer.import_dumps(ctx.paths, folder=args.import_dumps, progress=lambda s: log.info(s))
        ctx.dex.reload()
        print(json.dumps(m["counts"], indent=1))
    if args.import_guides:
        print(json.dumps(importer.import_guides(ctx.paths, folder=args.import_guides), indent=1))

    server = CompanionServer(ctx, args.port).start()

    if args.check:
        return _self_check(ctx, server)

    if not args.browser:
        override = "xwayland" if args.xwayland else "wayland" if args.wayland else None
        platform = choose_qt_platform(ctx.settings.get("app.window_backend") or "auto", override)
        try:
            from .shell.qt_shell import run_qt  # noqa: WPS433 (optional dependency)
        except ImportError as exc:
            print(f"\nNative window shell unavailable ({exc}).\n"
                  "Install PySide6 for native pinned popouts, e.g.:\n"
                  "  python -m venv .venv && .venv/bin/pip install -r requirements-native.txt\n"
                  "Falling back to browser mode.\n", file=sys.stderr)
        else:
            return run_qt(ctx, server, spike=args.spike, qpa=platform)

    if args.spike:
        print("The feasibility spike needs the native shell (PySide6 + QtWebEngine).", file=sys.stderr)
        return 2
    url = server.url(ctx.settings.get("app.last_route") or "#/home")
    print(f"\n{APP_NAME} {__version__} is running in browser mode.\nOpen: {url}\n"
          "Keep this terminal open; press Ctrl+C to quit (this also stops live alerts).\n")
    if not args.no_open:
        webbrowser.open(url)
    stop = {"flag": False}
    signal.signal(signal.SIGINT, lambda *_: stop.update(flag=True))
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, lambda *_: stop.update(flag=True))
    ctx.start_background()
    while not stop["flag"]:
        time.sleep(0.3)
    server.stop()
    ctx.shutdown()
    return 0


def _self_check(ctx, server) -> int:
    def get(path: str) -> dict:
        req = urllib.request.Request(server.base_url.rstrip("/") + path, headers={"X-Companion-Token": ctx.token})
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    results = {}
    try:
        b = get("/api/bootstrap")
        results["bootstrap"] = b["version"]
        results["species"] = len(get("/api/dex/species")["species"])
        results["news_articles"] = len(get("/api/news")["articles"])
        results["typechart_types"] = len(get("/api/tools/typechart")["types"])
        results["dex_imported"] = b["dex"]["imported"]
        results["notifier"] = b["notifier"]["backend"]
        with urllib.request.urlopen(server.base_url, timeout=10) as r:
            results["ui_index_bytes"] = len(r.read())
        ok = results["species"] == 649 and results["typechart_types"] == 17 and results["ui_index_bytes"] > 500
    except Exception as exc:  # pragma: no cover
        results["error"] = repr(exc)
        ok = False
    print(json.dumps({"ok": ok, **results}, indent=1))
    server.stop()
    ctx.shutdown()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
