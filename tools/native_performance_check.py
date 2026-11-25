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


def renderer_alive(process):
    try:
        return process.is_running() and process.status() != psutil.STATUS_ZOMBIE
    except psutil.NoSuchProcess:
        return False


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

    from PySide6.QtCore import QCoreApplication, QTimer, QUrl, Qt
    from PySide6.QtGui import QGuiApplication
    from PySide6.QtWidgets import QApplication
    from shiboken6 import isValid
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

    # Each yielded delay returns control to QApplication.exec(). DeferredDelete
    # events posted by WA_DeleteOnClose then run at the level that posted them.
    def js(view, expression):
        result = []
        view.page().runJavaScript(expression, result.append)
        deadline = time.monotonic() + 3
        while not result:
            if time.monotonic() >= deadline:
                raise RuntimeError("native JavaScript probe timed out")
            yield 25
        return result[0]

    def ready(view, predicate, label):
        deadline = time.monotonic() + 25
        while time.monotonic() < deadline:
            if (yield from js(view, "Boolean(" + predicate + ")")) is True:
                return
            yield 150
        raise RuntimeError("rendered content not ready: " + label)

    def measure(name, extra=None):
        yield int(args.settle * 1000)
        result, errors = [], []
        def collect():
            try:
                result.append(sample(psutil.Process(), args.seconds))
            except Exception as exc:
                errors.append(exc)
        thread = threading.Thread(target=collect, daemon=True)
        thread.start()
        while thread.is_alive():
            yield 100
        thread.join()
        if errors:
            raise errors[0]
        report["samples"][name] = {**result[0], **(extra or {})}
        save()
        print(name, json.dumps(report["samples"][name]), flush=True)

    def images(view):
        return json.loads((yield from js(view, """JSON.stringify([...document.querySelectorAll('.home-page img')]
            .filter(i => i.complete && i.naturalWidth > 0)
            .map(i => ({gif: /\\.gif(?:[?#]|$)/i.test(i.currentSrc || i.src)})))""")))

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
            yield from ready(view, "location.hash === '#/home' && document.querySelector('.home-roamers img') && [...document.querySelectorAll('.home-roamers img')].every(i => i.complete && i.naturalWidth > 0)", "Home artwork")

        def navigate(route, predicate):
            yield from js(view, "location.hash = " + json.dumps(route) + "; true")
            yield from ready(view, "location.hash === " + json.dumps(route) + " && (" + predicate + ")", route)

        def reload_home(motion):
            ctx.settings.update({"sprites.motion": motion})
            # Force a fresh document, not another load of the same hash-only URL.
            url = server.url("#/home")
            url = url.replace("#/home", "&qa_motion=" + motion + "#/home")
            view.load(QUrl(url))
            yield from ready(view, "location.search.includes('qa_motion=" + motion + "') && document.querySelector('.home-roamers img') && [...document.querySelectorAll('.home-roamers img')].every(i => i.complete && i.naturalWidth > 0)", motion + " Home")
            return sum(i["gif"] for i in (yield from images(view)))

        def close_popouts():
            objects = {}
            renderers = {}
            for tool, pop in list(shell.popouts.items()):
                pop_view = pop.view
                page = pop_view.page()
                objects[tool] = (pop, pop_view, page)
                pid = page.renderProcessPid()
                if pid > 0 and pid != view.page().renderProcessPid():
                    try:
                        renderers[pid] = psutil.Process(pid)
                    except psutil.NoSuchProcess:
                        pass
                if not pop.close():
                    raise RuntimeError("native window refused to close: " + tool)
            if shell.popouts:
                raise RuntimeError("closed popouts remain in shell registry")
            deadline = time.monotonic() + 5
            while any(isValid(obj) for group in objects.values() for obj in group):
                if time.monotonic() >= deadline:
                    pending = [f"{tool}/{kind}" for tool, group in objects.items()
                               for kind, obj in zip(("window", "view", "page"), group) if isValid(obj)]
                    raise RuntimeError("closed native objects still alive: " + ", ".join(pending))
                yield 25
            return sorted(objects), renderers

        def workload():
            yield from home_ready()
            report["startup_to_home_ready_seconds"] = round(time.monotonic() - started, 3)
            normal_gifs = sum(i["gif"] for i in (yield from images(view)))
            if not normal_gifs:
                raise RuntimeError("normal Home did not show loaded GIF artwork")
            yield from measure("home_normal", {"loaded_gifs": normal_gifs})
            static_gifs = yield from reload_home("off")
            if static_gifs:
                raise RuntimeError("static Home still contains loaded GIF artwork")
            yield from measure("home_static", {"loaded_gifs": static_gifs})
            normal_gifs = yield from reload_home("on")
            if not normal_gifs:
                raise RuntimeError("normal Home GIF artwork did not return")
            yield from measure("home_normal_again", {"loaded_gifs": normal_gifs})
            yield from navigate("#/pokedex", "document.querySelectorAll('.dex-card').length === 649")
            yield from measure("pokedex", {"cards": 649})
            yield from navigate("#/tools/items", "document.querySelectorAll('.item-tile').length > 0")
            tiles = yield from js(view, "document.querySelectorAll('.item-tile').length")
            yield from measure("items", {"initial_tiles": tiles})
            yield from navigate("#/home", "document.querySelector('.home-live')")
            for cycle in (1, 2):
                for tool, selector in (("calculator", ".calc-key"), ("items", ".item-tile"), ("pokedex", ".dex-card")):
                    pop = shell.open_popout(tool, "standard", "")
                    yield from ready(pop.view, "document.querySelector(" + json.dumps(selector) + ")", tool)
                yield from measure(f"popouts_{cycle}", {"open_tools": sorted(shell.popouts)})
                destroyed, renderers = yield from close_popouts()
                recovery = f"recovery_{cycle}"
                yield from measure(recovery, {"destroyed_windows_views_pages": destroyed})
                report["samples"][recovery]["popout_renderer_pids"] = sorted(renderers)
                report["samples"][recovery]["popout_renderers_alive"] = sorted(
                    pid for pid, proc in renderers.items()
                    if renderer_alive(proc)
                )
                save()

        steps = workload()

        def advance():
            try:
                delay = next(steps)
            except StopIteration:
                report["status"] = "passed"
            except Exception as exc:
                report["status"] = "failed"
                report["error"] = str(exc)
                print("Native workload failed:", exc, file=sys.stderr, flush=True)
            else:
                QTimer.singleShot(delay, advance)
                return
            try:
                save()
            finally:
                shell.quit()

        QTimer.singleShot(0, advance)
        app.exec()
        server.stop()
        ctx.shutdown()
        if report["status"] != "passed":
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
