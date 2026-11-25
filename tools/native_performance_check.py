"""Developer-only, repeatable native Qt workload, using a new temporary profile.

Run the same copy of this script against two clean checkouts with the same Python/Qt,
desktop, resolution, and sample settings. It does not launch PokeMMO, use the
player's database, upload anything, or alter the source checkout.
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

import psutil
from performance_smoke import sample


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seconds", type=float, default=8)
    parser.add_argument("--settle", type=float, default=5)
    args = parser.parse_args()
    if not 2 <= args.seconds <= 30 or not 1 <= args.settle <= 30:
        parser.error("seconds must be 2–30 and settle 1–30")
    repo = args.repo.resolve()
    if not (repo / "companion" / "app.py").is_file():
        parser.error("not a Companion source checkout")
    revision = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip()
    if subprocess.check_output(["git", "-C", str(repo), "status", "--porcelain", "--untracked-files=no"], text=True).strip():
        parser.error("tracked checkout files are modified")
    args.output = args.output.resolve()
    os.environ.pop("POKEMMO_DUMPS_DIR", None)
    sys.path.insert(0, str(repo))

    from PySide6.QtCore import QCoreApplication, QEventLoop, QTimer, QUrl, Qt
    from PySide6.QtGui import QGuiApplication
    from PySide6.QtWidgets import QApplication
    from companion.app import AppContext
    from companion.server import CompanionServer
    from companion.settings import DEFAULTS
    from companion import APP_NAME, __version__
    from companion.shell.qt_shell import QSS, QtShell
    from companion.__main__ import choose_qt_platform

    QCoreApplication.setAttribute(Qt.AA_ShareOpenGLContexts, True)
    QGuiApplication.setHighDpiScaleFactorRoundingPolicy(Qt.HighDpiScaleFactorRoundingPolicy.PassThrough)
    backend = choose_qt_platform("auto", None)
    app = QApplication([sys.argv[0], "-platform", backend] if backend else [sys.argv[0]])
    app.setApplicationName(APP_NAME)
    app.setApplicationVersion(__version__)
    app.setDesktopFileName('pokemmo-companion')
    app.setStyleSheet(QSS)
    app.setQuitOnLastWindowClosed(False)
    report = {
        "revision": revision, "platform": platform.platform(), "qt_platform": app.platformName(),
        "qt": __import__("PySide6").__version__, "python": platform.python_version(),
        "system_ram_mib": round(psutil.virtual_memory().total / 1048576),
        "seconds": args.seconds, "settle": args.settle, "logical_cpus": psutil.cpu_count(),
        "screens": [{"w": s.size().width(), "h": s.size().height(), "dpr": s.devicePixelRatio()} for s in app.screens()],
        "workload": "fresh bundled data, English, explicit normal motion, external feed/update/backup disabled",
        "metric_note": "PSS when complete; summed RSS may double-count; CPU percent of one core. Sampler runs in a thread in the measured process.",
        "samples": {}, "status": "incomplete",
    }

    def save():
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    def wait(ms):
        loop = QEventLoop()
        QTimer.singleShot(ms, loop.quit)
        loop.exec()

    def js(view, expression):
        loop = QEventLoop()
        timer = QTimer()
        timer.setSingleShot(True)
        result = []
        def done(value):
            result.append(value)
            loop.quit()
        timer.timeout.connect(loop.quit)
        view.page().runJavaScript(expression, done)
        timer.start(3000)
        if not result:
            loop.exec()
        timer.stop()
        if not result:
            raise RuntimeError("native JavaScript probe timed out")
        return result[0]

    def ready(view, predicate, label):
        deadline = time.monotonic() + 25
        while time.monotonic() < deadline:
            if js(view, "Boolean(" + predicate + ")") is True:
                return
            wait(150)
        raise RuntimeError("rendered content not ready: " + label)

    def measure(name, extra=None):
        wait(int(args.settle * 1000))
        result, errors = [], []
        def collect():
            try:
                result.append(sample(psutil.Process(), args.seconds))
            except Exception as exc:
                errors.append(exc)
        thread = threading.Thread(target=collect, daemon=True)
        thread.start()
        while thread.is_alive():
            wait(100)
        thread.join()
        if errors:
            raise errors[0]
        report["samples"][name] = {**result[0], **(extra or {})}
        save()
        print(name, json.dumps(report["samples"][name]), flush=True)

    def images(view):
        return json.loads(js(view, """JSON.stringify([...document.querySelectorAll('.home-page img')]
            .filter(i => i.complete && i.naturalWidth > 0)
            .map(i => ({gif: /\\.gif(?:[?#]|$)/i.test(i.currentSrc || i.src)})))"""))

    with tempfile.TemporaryDirectory(prefix="companion-native-qa-", ignore_cleanup_errors=True) as temp:
        started = time.monotonic()
        ctx = AppContext(temp)
        patch = {"app.onboarded": True, "app.last_route": "#/home", "app.language": "en",
                 "app.restore_popouts": False, "app.start_minimized": False,
                 "sprites.motion": "on", "live.ntfy.enabled": False, "live.phenomena.enabled": False,
                 "updates.auto_check": False, "reference.auto_update": False, "app_updates.auto_check": False,
                 "backup.auto_hours": 0, "game.watch": False, "home.sections": ["roamers", "live", "update", "news", "events", "quick"]}
        if "performance.profile" in DEFAULTS:
            patch["performance.profile"] = "balanced"
        ctx.settings.update({k: v for k, v in patch.items() if k in DEFAULTS})
        server = CompanionServer(ctx, 0).start()
        shell = QtShell(ctx, server, app)
        shell.main.show()
        ctx.start_background()
        view = shell.main.view

        def home_ready():
            ready(view, "location.hash === '#/home' && document.querySelector('.home-roamers img') && [...document.querySelectorAll('.home-roamers img')].every(i => i.complete && i.naturalWidth > 0)", "Home artwork")

        def navigate(route, predicate):
            js(view, "location.hash = " + json.dumps(route) + "; true")
            ready(view, "location.hash === " + json.dumps(route) + " && (" + predicate + ")", route)

        def reload_home(motion):
            ctx.settings.update({"sprites.motion": motion})
            # Force a fresh document, not another load of the same hash-only URL.
            url = server.url("#/home")
            url = url.replace("#/home", "&qa_motion=" + motion + "#/home")
            view.load(QUrl(url))
            ready(view, "location.search.includes('qa_motion=" + motion + "') && document.querySelector('.home-roamers img') && [...document.querySelectorAll('.home-roamers img')].every(i => i.complete && i.naturalWidth > 0)", motion + " Home")
            return sum(i["gif"] for i in images(view))

        def run():
            try:
                home_ready()
                report["startup_to_home_ready_seconds"] = round(time.monotonic() - started, 3)
                normal_gifs = sum(i["gif"] for i in images(view))
                if not normal_gifs:
                    raise RuntimeError("normal Home did not show loaded GIF artwork")
                measure("home_normal", {"loaded_gifs": normal_gifs})
                static_gifs = reload_home("off")
                if static_gifs:
                    raise RuntimeError("static Home still contains loaded GIF artwork")
                measure("home_static", {"loaded_gifs": static_gifs})
                normal_gifs = reload_home("on")
                if not normal_gifs:
                    raise RuntimeError("normal Home GIF artwork did not return")
                measure("home_normal_again", {"loaded_gifs": normal_gifs})
                navigate("#/pokedex", "document.querySelectorAll('.dex-card').length === 649")
                measure("pokedex", {"cards": 649})
                navigate("#/tools/items", "document.querySelectorAll('.item-tile').length > 0")
                measure("items", {"initial_tiles": js(view, "document.querySelectorAll('.item-tile').length")})
                navigate("#/home", "document.querySelector('.home-live')")
                for cycle in (1, 2):
                    for tool, selector in (("calculator", ".calc-key"), ("items", ".item-tile"), ("pokedex", ".dex-card")):
                        pop = shell.open_popout(tool, "standard", "")
                        ready(pop.view, "document.querySelector(" + json.dumps(selector) + ")", tool)
                    measure("popouts_" + str(cycle), {"open_tools": sorted(shell.popouts)})
                    for pop in list(shell.popouts.values()):
                        pop.close()
                    if shell.popouts:
                        raise RuntimeError("closed popouts remain in shell registry")
                    measure("recovery_" + str(cycle))
                report["status"] = "passed"
            except Exception as exc:
                report["status"] = "failed"
                report["error"] = str(exc)
                print("Native workload failed:", exc, file=sys.stderr, flush=True)
            finally:
                save()
                shell.quit()

        QTimer.singleShot(0, run)
        app.exec()
        server.stop()
        ctx.shutdown()
        if report["status"] != "passed":
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
