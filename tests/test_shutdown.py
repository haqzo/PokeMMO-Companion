"""Shutdown ordering (native report 2026-11-24: `sqlite3.ProgrammingError: Cannot operate on a closed database`
while the shortcut settings API ran after Companion was closed).

Cause: `server.stop()` only stopped the accept loop; handler threads kept serving keep-alive connections from
closing windows, and background workers were only signalled — so a request or a worker could reach the database
after `ctx.shutdown()` closed it. These tests reproduce both paths and the close → relaunch race."""
import http.client
import json
import logging
import os
import subprocess
import sys
import threading
import time
import urllib.error

import pytest

from companion.app import AppContext
from companion.instance import InstanceLock
from companion.server import CompanionServer
from companion.storage import StorageClosedError


def _errors(caplog):
    return [r.getMessage()[:300] for r in caplog.records if r.levelno >= logging.ERROR]


@pytest.fixture
def running(tmp_path):
    ctx = AppContext(tmp_path / "data")
    srv = CompanionServer(ctx, 0).start()
    yield ctx, srv
    srv.stop(drain_timeout=1)
    ctx.shutdown(join_timeout=1)


def _conn(srv):
    return http.client.HTTPConnection("127.0.0.1", srv.port, timeout=10)


def test_request_running_at_shutdown_finishes_before_the_database_closes(running, caplog, monkeypatch):
    """The original race: GET /api/shortcuts is mid-flight (settings read) when the app shuts down."""
    ctx, srv = running
    caplog.set_level(logging.INFO, logger="companion")
    real_get = ctx.settings.get
    entered = threading.Event()

    def slow_get(key, *a, **k):
        if key == "shortcuts.bindings":
            entered.set()
            time.sleep(0.6)                   # still reading when shutdown starts
        return real_get(key, *a, **k)
    monkeypatch.setattr(ctx.settings, "get", slow_get)
    out = {}

    def call():
        c = _conn(srv)
        c.request("GET", "/api/shortcuts", headers={"X-Companion-Token": ctx.token})
        r = c.getresponse()
        out["status"], out["body"] = r.status, r.read()
    t = threading.Thread(target=call)
    t.start()
    assert entered.wait(5)
    assert srv.stop(drain_timeout=5) is True          # waits for the running request
    ctx.shutdown(join_timeout=2)
    t.join(5)
    assert out["status"] == 200 and "actions" in json.loads(out["body"])
    assert not _errors(caplog)


def test_keep_alive_request_after_stop_gets_503_and_never_touches_the_database(running, caplog):
    """A window that is closing reuses its open connection after the server stopped and the database closed."""
    ctx, srv = running
    caplog.set_level(logging.INFO, logger="companion")
    c = _conn(srv)
    c.request("GET", "/api/shortcuts", headers={"X-Companion-Token": ctx.token})
    r = c.getresponse()
    assert r.status == 200
    r.read()
    srv.stop(drain_timeout=2)
    ctx.shutdown(join_timeout=1)
    assert ctx.storage.closed
    try:
        c.request("GET", "/api/shortcuts", headers={"X-Companion-Token": ctx.token})
        r = c.getresponse()
        assert r.status == 503 and json.loads(r.read())["error"] == "Companion is closing"
    except (ConnectionError, http.client.HTTPException, OSError):
        pass                                           # the connection may also be closed outright — both are fine
    assert not _errors(caplog)


def test_closed_storage_raises_a_typed_error_and_the_api_maps_it_to_503(tmp_path, caplog):
    ctx = AppContext(tmp_path / "d")
    ctx.storage.close()
    ctx.storage.close()                                # idempotent
    with pytest.raises(StorageClosedError):
        ctx.storage.query("SELECT 1")
    with pytest.raises(StorageClosedError):
        ctx.settings.get("shortcuts.bindings")
    # a request that slips past the gate (bypassing it on purpose here) is answered 503, logged at INFO, not ERROR
    srv = CompanionServer(ctx, 0).start()
    caplog.set_level(logging.INFO, logger="companion")
    try:
        c = _conn(srv)
        c.request("GET", "/api/shortcuts", headers={"X-Companion-Token": ctx.token})
        assert c.getresponse().status == 503
        assert not _errors(caplog)
    finally:
        srv.stop(drain_timeout=1)


def test_real_database_errors_are_not_hidden(running, caplog):
    ctx, srv = running
    caplog.set_level(logging.ERROR, logger="companion")
    from companion import storage as st
    with pytest.raises(Exception) as exc:
        ctx.storage.query("SELECT * FROM no_such_table")
    assert not isinstance(exc.value, st.StorageClosedError)


def test_shutdown_waits_for_workers_including_a_connecting_live_provider(tmp_path, caplog, monkeypatch):
    """The ntfy worker blocked while connecting must not write its status into a closed database."""
    import urllib.request
    caplog.set_level(logging.INFO, logger="companion")
    release = threading.Event()

    def hanging_urlopen(req, timeout=0, *, context=None):
        release.wait(timeout=3)                        # connecting… until the network gives up
        raise urllib.error.URLError("connection reset during shutdown")
    monkeypatch.setattr(urllib.request, "urlopen", hanging_urlopen)
    ctx = AppContext(tmp_path / "w")
    ctx.settings.update({"live.ntfy.enabled": True, "live.ntfy.consented": True})
    srv = CompanionServer(ctx, 0).start()
    ctx.start_background()
    time.sleep(0.3)
    assert ctx.live._thread.is_alive()
    t0 = time.monotonic()
    srv.stop(drain_timeout=2)
    ctx.shutdown(join_timeout=0.5)                     # the provider is still "connecting" past the deadline
    assert time.monotonic() - t0 < 5
    release.set()                                      # its connection attempt now fails — after the database closed
    ctx.live._thread.join(5)
    assert not ctx.live._thread.is_alive()
    assert not _errors(caplog), _errors(caplog)
    assert not [t for t in (ctx.timers._thread, ctx.auto_backup._thread, ctx.game._thread) if t and t.is_alive()]


def test_repeated_close_and_relaunch_on_the_same_profile(tmp_path, caplog):
    caplog.set_level(logging.INFO, logger="companion")
    for i in range(4):
        ctx = AppContext(tmp_path / "loop")
        srv = CompanionServer(ctx, 0).start()
        ctx.start_background()
        c = _conn(srv)
        c.request("GET", "/api/shortcuts", headers={"X-Companion-Token": ctx.token})
        assert c.getresponse().status == 200
        srv.stop(drain_timeout=2)
        ctx.shutdown(join_timeout=2)
        ctx.shutdown()                                 # second call is a no-op
    assert not _errors(caplog), _errors(caplog)


def test_relaunch_while_the_previous_instance_is_still_closing_waits_for_it(tmp_path):
    """A second launch that cannot reach the closing instance waits for the lock instead of exiting."""
    root = tmp_path / "inst"
    root.mkdir()
    code = ("import sys,time; sys.path.insert(0, %r); from companion.instance import InstanceLock; from pathlib import Path;"
            "l=InstanceLock(Path(%r)); assert l.acquire(); print('held', flush=True); time.sleep(1.2); l.release()") % (os.getcwd(), str(root))
    p = subprocess.Popen([sys.executable, "-c", code], stdout=subprocess.PIPE, text=True)
    assert p.stdout.readline().strip() == "held"
    me = InstanceLock(root)
    assert not me.acquire()
    assert not me.signal_running({"action": "focus_main"})   # nothing answering (it is "closing")
    t0 = time.monotonic()
    assert me.acquire_wait(10)
    assert 0.5 < time.monotonic() - t0 < 5
    me.release()
    p.wait(5)
