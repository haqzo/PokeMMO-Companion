"""Clients that disconnect mid-response (native report 2026-11-24: BrokenPipeError tracebacks in server.py).

A local UI cancels requests all the time — sprites scrolled out of view, page changes, closed popouts. That must
not produce error logs, tracebacks or a second write to the dead socket; real server errors must still be logged."""
import json
import logging
import socket
import struct
import time
import urllib.request

import pytest

from companion.server import CompanionServer


@pytest.fixture
def srv(ctx):
    s = CompanionServer(ctx, 0).start()
    yield s
    s.stop()


def _drop(port: int, raw: bytes) -> None:
    """Send a request, then reset the connection at once (SO_LINGER 0 → RST) while the server is still writing."""
    c = socket.create_connection(("127.0.0.1", port))
    c.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 1024)
    c.sendall(raw)
    time.sleep(0.01)
    c.setsockopt(socket.SOL_SOCKET, socket.SO_LINGER, struct.pack("ii", 1, 0))
    c.close()


def _req(path: str, token: str) -> bytes:
    return (f"GET {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nX-Companion-Token: {token}\r\n\r\n").encode()


def test_dropped_connections_are_quiet_and_the_server_keeps_working(ctx, srv, caplog, capfd):
    caplog.set_level(logging.DEBUG, logger="companion")
    big_sprite = max((ctx.sprite_library.root / "ani").glob("*.gif"), key=lambda p: p.stat().st_size).name
    for _ in range(15):
        _drop(srv.port, _req("/api/dex/species", ctx.token))                       # ~800 KB JSON
        _drop(srv.port, _req(f"/assets/library/ani/{big_sprite}", ctx.token))      # largest built-in GIF
        _drop(srv.port, _req("/js/pages/pokedex.js", ctx.token))
    # half-sent request body: the client vanishes while the server reads it
    c = socket.create_connection(("127.0.0.1", srv.port))
    c.sendall(b"POST /api/themes/validate HTTP/1.1\r\nHost: 127.0.0.1\r\nX-Companion-Token: " + ctx.token.encode()
              + b"\r\nContent-Type: application/json\r\nContent-Length: 5000\r\n\r\n{\"na")
    c.setsockopt(socket.SOL_SOCKET, socket.SO_LINGER, struct.pack("ii", 1, 0))
    c.close()
    time.sleep(0.5)
    # still serving
    r = urllib.request.urlopen(urllib.request.Request(srv.base_url + "api/bootstrap", headers={"X-Companion-Token": ctx.token}))
    assert r.status == 200 and json.loads(r.read())["themes"]
    errors = [r for r in caplog.records if r.levelno >= logging.ERROR]
    assert not errors, [r.getMessage()[:200] for r in errors]
    err = capfd.readouterr().err
    assert "Traceback" not in err and "BrokenPipeError" not in err and "Exception occurred during processing" not in err


def test_real_server_errors_are_still_logged(ctx, srv, caplog, monkeypatch):
    caplog.set_level(logging.ERROR, logger="companion")

    def boom(*a, **k):
        raise RuntimeError("genuine bug")
    monkeypatch.setattr(ctx.news, "listing", boom)
    try:
        urllib.request.urlopen(urllib.request.Request(srv.base_url + "api/news", headers={"X-Companion-Token": ctx.token}))
        raise AssertionError("expected HTTP 500")
    except urllib.error.HTTPError as exc:
        assert exc.code == 500
    assert any("API error" in r.getMessage() and "genuine bug" in r.getMessage() for r in caplog.records)
