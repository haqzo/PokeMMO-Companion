"""Startup & game integration (2026-11-24): detection, safe launching, no duplicate launches, presence handling,
removable integration files, single instance, window recovery after monitor changes."""
import os
import subprocess
import sys
import threading

import pytest

from companion.instance import InstanceLock
from companion.services import gamelaunch as gl
from companion.shell.geometry import fit_window


@pytest.fixture
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path / ".config"))
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path / ".local/share"))
    return tmp_path


@pytest.mark.skipif(not sys.platform.startswith("linux"), reason="Linux paths")
def test_detects_flatpak_standalone_and_manual(home, monkeypatch, tmp_path):
    fake_flatpak = tmp_path / "bin" / "flatpak"
    fake_flatpak.parent.mkdir()
    monkeypatch.setenv("PATH", str(fake_flatpak.parent))
    assert all(c["kind"] != "flatpak" for c in gl.detect())
    (home / ".local/share/flatpak/app" / gl.FLATPAK_ID).mkdir(parents=True)
    fake_flatpak.write_text("#!/bin/sh\n")
    fake_flatpak.chmod(0o755)
    sh = home / "PokeMMO" / "PokeMMO.sh"
    sh.parent.mkdir()
    sh.write_text("#!/bin/sh\n")
    sh.chmod(0o755)
    manual = tmp_path / "custom" / "PokeMMO.sh"
    manual.parent.mkdir()
    manual.write_text("#!/bin/sh\n")
    manual.chmod(0o755)
    found = gl.detect([str(manual)])
    kinds = [c["kind"] for c in found]
    assert kinds[0] == "manual" and "flatpak" in kinds and "standalone" in kinds
    fp = next(c for c in found if c["kind"] == "flatpak")
    assert fp["argv"] == [str(fake_flatpak), "run", "com.pokemmo.PokeMMO"]      # argument list, no shell string
    assert gl.validate_launcher(str(manual)) == str(manual.resolve())
    with pytest.raises(gl.GameError):
        gl.validate_launcher(str(tmp_path / "missing.sh"))


def test_launch_never_starts_a_second_copy_and_reports_failures(monkeypatch, tmp_path):
    calls = []
    monkeypatch.setattr(subprocess, "Popen", lambda argv, **kw: calls.append((argv, kw)))
    assert gl.launch(["/x/PokeMMO.sh"], check_running=lambda: True) == {"started": False, "already_running": True}
    assert calls == []
    assert gl.launch(["/x/PokeMMO.sh", "--a b"], cwd="/x", check_running=lambda: False, marker=tmp_path / "m1")["started"]
    argv, kw = calls[0]
    assert argv == ["/x/PokeMMO.sh", "--a b"] and "shell" not in kw
    with pytest.raises(gl.GameError, match="No PokeMMO launcher"):
        gl.launch([], check_running=lambda: False)

    def boom(argv, **kw):
        raise FileNotFoundError(2, "No such file or directory")
    monkeypatch.setattr(subprocess, "Popen", boom)
    with pytest.raises(gl.GameError, match="could not be started"):
        gl.launch(["/missing"], check_running=lambda: False, marker=tmp_path / "m2")


def test_simultaneous_launch_requests_start_the_game_once(monkeypatch, tmp_path):
    """A process check alone is not race-safe: 12 requests at once (threads) and a second process must still
    start exactly one client, because the game is not visible as a process yet while it starts."""
    calls = []
    gate = threading.Event()

    def slow_popen(argv, **kw):
        gate.wait(0.05)
        calls.append(argv)
    monkeypatch.setattr(subprocess, "Popen", slow_popen)
    marker = tmp_path / "launch.lock"
    results = []
    threads = [threading.Thread(target=lambda: results.append(gl.launch(["/x/PokeMMO.sh"], check_running=lambda: False, marker=marker))) for _ in range(12)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(calls) == 1 and sum(r["started"] for r in results) == 1
    assert sum(bool(r.get("already_starting")) for r in results) == 11
    # another process (shortcut started twice): the marker is shared across processes
    code = ("import subprocess,sys; from pathlib import Path; from companion.services import gamelaunch as gl;"
            "subprocess.Popen=lambda *a,**k: None;"
            f"print(gl.launch(['/x'], check_running=lambda: False, marker=Path({str(marker)!r}))['started'])")
    monkeypatch.undo()
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, cwd=os.getcwd())
    assert out.stdout.strip() == "False", out.stderr
    # after the grace period a new start is allowed again (e.g. the player closed the game and starts it later)
    old = marker.stat().st_mtime - gl.LAUNCH_GRACE - 5
    os.utime(marker, (old, old))
    monkeypatch.setattr(subprocess, "Popen", slow_popen)
    assert gl.launch(["/x/PokeMMO.sh"], check_running=lambda: False, marker=marker)["started"]
    assert len(calls) == 2


def test_presence_events_and_on_exit_policy():
    state = {"run": False}
    events, cmds = [], []

    class Bus:
        def publish(self, topic, data):
            events.append((topic, data))
    settings = {"game.on_exit": "keep"}

    class S:
        def get(self, k):
            return settings.get(k)
    p = gl.GamePresence(S(), Bus(), shell_queue=cmds.append, check=lambda: state["run"])
    assert p.poll() is None                         # first observation sets the baseline only
    state["run"] = True
    assert p.poll() == "started"
    state["run"] = False
    assert p.poll() == "closed" and cmds == []      # default: Companion keeps running
    settings["game.on_exit"] = "minimize"
    state["run"] = True
    p.poll()
    state["run"] = False
    p.poll()
    assert cmds == [{"action": "minimize_main"}]
    assert all(t == "game" for t, _ in events)


@pytest.mark.skipif(not sys.platform.startswith("linux"), reason="Linux desktop entries")
def test_integrations_are_visible_files_that_can_be_removed(home):
    (home / "Desktop").mkdir()
    for kind in gl.INTEGRATIONS:
        files = gl.install_integration(kind, minimized=True)
        assert files and all(os.path.isfile(f) for f in files)
    st = gl.integration_status()
    assert st == {"login": True, "shortcut": True, "watcher": True}
    login = (home / ".config/autostart/pokemmo-companion.desktop").read_text()
    assert "--minimized" in login and "X-PokeMMO-Companion=1" in login
    shortcut = (home / ".local/share/applications/pokemmo-companion-with-game.desktop").read_text()
    assert "--launch-game" in shortcut
    assert "--watch-game" in (home / ".config/autostart/pokemmo-companion-watcher.desktop").read_text()
    # a file the player made themselves is never deleted
    own = home / ".config/autostart/pokemmo-companion.desktop"
    own.write_text("[Desktop Entry]\nName=mine\n")
    assert gl.remove_integration("login") == []
    own.unlink()
    for kind in gl.INTEGRATIONS:
        gl.remove_integration(kind)
    assert gl.integration_status() == {"login": False, "shortcut": False, "watcher": False}


def test_watcher_starts_companion_once_when_the_game_appears():
    seq = iter([False, True, True, False, True])
    started = []
    stop = threading.Event()

    def check():
        try:
            return next(seq)
        except StopIteration:
            stop.set()
            return False
    running = {"companion": False}

    def start():
        started.append(1)
        running["companion"] = True
    gl.watch_and_start(lambda: running["companion"], start, check=check, interval=0, stop=stop)
    assert started == [1]                       # second appearance: Companion already running → nothing


def test_single_instance_lock(tmp_path):
    a = InstanceLock(tmp_path)
    assert a.acquire()
    a.publish("http://127.0.0.1:1/", "tok")
    b = InstanceLock(tmp_path)
    assert not b.acquire()
    assert b.is_held_elsewhere()
    if sys.platform != "win32":
        assert oct(os.stat(tmp_path / "instance.json").st_mode)[-3:] == "600"
    assert b.signal_running({"action": "focus_main"}, timeout=0.5) is False   # nothing listening there: no crash
    a.release()
    assert not (tmp_path / "instance.json").exists()
    assert b.acquire()
    b.release()


def test_window_recovery_after_monitor_changes():
    left, right = (0, 0, 1920, 1040), (1920, 0, 2560, 1400)
    # a window on the right monitor stays where it is while that monitor exists
    assert fit_window((2200, 100, 800, 600), [left, right]) == (2200, 100, 800, 600)
    # right monitor unplugged → back onto the remaining one, title bar reachable
    x, y, w, h = fit_window((2200, 100, 800, 600), [left])
    assert 0 <= x <= 1920 - 800 and y == 100 and (w, h) == (800, 600)
    # title bar above the top edge → moved down
    assert fit_window((100, -300, 800, 600), [left])[1] == 0
    # resolution lowered: a window bigger than the screen is shrunk
    assert fit_window((0, 0, 2400, 1300), [(0, 0, 1366, 728)]) == (0, 0, 1366, 728)
    # portrait monitor on the left with a negative x origin
    portrait = (-1080, 0, 1080, 1880)
    assert fit_window((-900, 200, 600, 900), [portrait, left]) == (-900, 200, 600, 900)


@pytest.mark.skipif(not sys.platform.startswith("linux"), reason="process test")
def test_second_launch_hands_over_to_the_running_instance(tmp_path):
    import time
    env = {**os.environ, "PYTHONPATH": os.getcwd()}
    first = subprocess.Popen([sys.executable, "-m", "companion", "--browser", "--no-open", "--data-dir", str(tmp_path)],
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
    try:
        for _ in range(100):
            if (tmp_path / "instance.json").exists():
                break
            time.sleep(0.1)
        assert (tmp_path / "instance.json").exists()
        second = subprocess.run([sys.executable, "-m", "companion", "--browser", "--no-open", "--data-dir", str(tmp_path)],
                                capture_output=True, text=True, timeout=30, env=env)
        assert second.returncode == 0 and "already running" in second.stderr
    finally:
        first.terminate()
        first.wait(timeout=20)
    assert not (tmp_path / "instance.json").exists()        # clean shutdown removes the hand-over file


def test_diagnostics_sanitize_private_details(monkeypatch):
    from companion.services.diagnostics import sanitize
    monkeypatch.setenv("USER", "haqzo")
    raw = ("GET http://127.0.0.1:8772/?token=SeCrEt123456789&x=1 X-Companion-Token: abcdefghijk "
           "/home/haqzo/PokeMMO/PokeMMO.sh https://user:pw@ntfy.example/topic?auth=xyz haqzo")
    out = sanitize(raw, home="/home/haqzo")
    for secret in ("SeCrEt123456789", "abcdefghijk", "/home/haqzo", "user:pw", "auth=xyz", " haqzo"):
        assert secret not in out, secret
    assert "~/PokeMMO/PokeMMO.sh" in out
