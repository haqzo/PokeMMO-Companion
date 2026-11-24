import json
import os
import sys
import urllib.request
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("COMPANION_NO_SPAWN", "1")      # tests never start the real PokeMMO watcher

from companion.app import AppContext  # noqa: E402
from companion.server import CompanionServer  # noqa: E402

DUMPS = os.environ.get("POKEMMO_DUMPS_DIR")


@pytest.fixture
def ctx(tmp_path):
    c = AppContext(str(tmp_path / "data"))
    yield c
    c.shutdown()


@pytest.fixture(scope="session")
def dump_paths(tmp_path_factory):
    """Imports the user's real dumps once per session (skipped if POKEMMO_DUMPS_DIR is unset)."""
    if not DUMPS or not Path(DUMPS).is_dir():
        pytest.skip("POKEMMO_DUMPS_DIR not set — real-dump golden tests skipped")
    from companion.config import make_paths
    from companion.services import importer
    paths = make_paths(tmp_path_factory.mktemp("dumpdata"))
    importer.import_dumps(paths, folder=DUMPS)
    return paths


@pytest.fixture
def dex(dump_paths):
    from companion.services.dex import DexService
    return DexService(dump_paths)


class Client:
    def __init__(self, server, token):
        self.base = server.base_url.rstrip("/")
        self.token = token

    def call(self, method, path, body=None, token=True, headers=None):
        data = json.dumps(body).encode() if body is not None else None
        h = {"Content-Type": "application/json"}
        if token:
            h["X-Companion-Token"] = self.token
        h.update(headers or {})
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status, json.loads(r.read() or b"null")
        except urllib.error.HTTPError as e:
            raw = e.read()
            try:
                return e.code, json.loads(raw)
            except ValueError:
                return e.code, raw.decode(errors="replace")


@pytest.fixture
def client(ctx):
    srv = CompanionServer(ctx, 0).start()
    yield Client(srv, ctx.token)
    srv.stop()
