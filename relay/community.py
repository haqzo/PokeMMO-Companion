"""Standalone loopback test relay. Run with python -m relay.community --help."""

import argparse
import json
import secrets
import sqlite3
import tempfile
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from companion.community_protocol import (
    CommunityError, CONTRIBUTOR, MAX_NEW_AGE, MAX_REQUEST, PAGE_SIZE, REGULAR_ID, TEST_TOKEN, VERSION,
    seconds_between, validate_observation, wire_observation,
)
from companion.config import make_paths
from companion.services.dex import DexService
from companion.storage import utcnow


class Journal:
    def __init__(self, path, dex):
        self.dex = dex
        self.lock = threading.Lock()
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS service (id TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS changes (
                seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, action TEXT NOT NULL,
                contributor TEXT NOT NULL, request_id TEXT, target TEXT, observation TEXT, at TEXT NOT NULL,
                UNIQUE(contributor, request_id)
            );
            CREATE UNIQUE INDEX IF NOT EXISTS one_replacement ON changes(target) WHERE target IS NOT NULL;
        """)
        with self.db:
            self.db.execute("INSERT INTO service SELECT ? WHERE NOT EXISTS(SELECT 1 FROM service)", (uuid.uuid4().hex,))
        self.id = self.db.execute("SELECT id FROM service").fetchone()[0]

    @staticmethod
    def change(row):
        return {k: row[k] for k in ("seq", "id", "action", "contributor", "target", "at")} | {
            "observation": json.loads(row["observation"]) if row["observation"] else None}

    def feed(self, after):
        with self.lock:
            head = self.db.execute("SELECT COALESCE(MAX(seq),0) FROM changes").fetchone()[0]
            rows = self.db.execute("SELECT * FROM changes WHERE seq>? ORDER BY seq LIMIT ?", (after, PAGE_SIZE))
            return {"version": VERSION, "service_id": self.id, "head": head, "changes": [self.change(r) for r in rows]}

    def write(self, actor, action, data, target):
        with self.lock, self.db:
            self.db.execute("BEGIN IMMEDIATE")
            previous = None
            replacement = None
            if target:
                previous = self.db.execute("SELECT * FROM changes WHERE id=? AND action IN ('create','correct')",
                                           (target,)).fetchone()
                if not previous:
                    raise CommunityError("missing", 404)
                if previous["contributor"] != actor:
                    raise CommunityError("own_only", 403)
                replacement = self.db.execute("SELECT * FROM changes WHERE target=?", (target,)).fetchone()
            now = utcnow()
            if action == "withdraw":
                if data != {}:
                    raise CommunityError("invalid_report")
                if replacement and replacement["action"] == "withdraw":
                    return self.change(replacement)
                request_id, wire = None, None
            else:
                prior = json.loads(previous["observation"]) if previous else None
                reference = {"source_time": prior["observed_at"], "kind": prior["kind"], "id": target} if prior else None
                observation = wire_observation(validate_observation(self.dex, data, now, reference))
                request_id = observation["observation_id"]
                wire = json.dumps(observation, sort_keys=True)
                saved = self.db.execute("SELECT * FROM changes WHERE contributor=? AND request_id=?",
                                        (actor, request_id)).fetchone()
                if saved:
                    if (saved["target"], saved["action"], saved["observation"]) != (target, action, wire):
                        raise CommunityError("id_conflict", 409)
                    return self.change(saved)
                if action == "create":
                    if seconds_between(now, observation["observed_at"]) > MAX_NEW_AGE:
                        raise CommunityError("stale_share", 409)
            if replacement:
                raise CommunityError("inactive", 409)
            cursor = self.db.execute("INSERT INTO changes(id,action,contributor,request_id,target,observation,at) "
                                     "VALUES(?,?,?,?,?,?,?)", (uuid.uuid4().hex, action, actor, request_id, target, wire, now))
            return self.change(self.db.execute("SELECT * FROM changes WHERE seq=?", (cursor.lastrowid,)).fetchone())


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def setup(self):
        self.request.settimeout(3)
        super().setup()

    def respond(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def execute(self, handler):
        try:
            self.respond(200, handler())
        except CommunityError as exc:
            self.respond(exc.status, {"error": str(exc)})
        except (json.JSONDecodeError, UnicodeError, RecursionError):
            self.respond(400, {"error": "community.invalid_report"})
        except (TimeoutError, BrokenPipeError, ConnectionResetError):
            self.close_connection = True

    def token(self):
        scheme, _, token = self.headers.get("Authorization", "").partition(" ")
        if scheme != "Bearer" or not TEST_TOKEN.fullmatch(token):
            raise CommunityError("share_denied", 403)
        return token

    def do_GET(self):
        def read():
            if not secrets.compare_digest(self.token(), self.server.read_token):
                raise CommunityError("share_denied", 403)
            url = urlsplit(self.path)
            if url.path != "/v1/feed":
                raise CommunityError("missing", 404)
            query = parse_qs(url.query, keep_blank_values=True)
            after = query.get("after", ["0"])
            if set(query) - {"after"} or len(after) != 1 or not after[0].isascii() or not after[0].isdecimal() or len(after[0]) > 18:
                raise CommunityError("invalid_report")
            return self.server.journal.feed(int(after[0]))
        self.execute(read)

    def do_POST(self):
        def write():
            token = self.token()
            actor = self.headers.get("X-Community-Contributor")
            expected = self.server.writers.get(actor)
            if not expected or not secrets.compare_digest(token, expected):
                raise CommunityError("share_denied", 403)
            if self.headers.get("X-Community-Service") != self.server.journal.id:
                raise CommunityError("share_service_changed", 409)
            route = self.path.split("/")
            if route == ["", "v1", "reports"]:
                target, action = None, "create"
            elif len(route) == 5 and route[:3] == ["", "v1", "reports"] and REGULAR_ID.fullmatch(route[3]) and route[4] in ("correct", "withdraw"):
                target, action = route[3:]
            else:
                raise CommunityError("missing", 404)
            sizes = self.headers.get_all("Content-Length", [])
            if self.headers.get("Transfer-Encoding") is not None or len(sizes) != 1:
                raise CommunityError("invalid_report")
            size = sizes[0]
            if not size.isascii() or not size.isdecimal() or len(size) > 4 or not 0 < int(size) <= MAX_REQUEST:
                raise CommunityError("invalid_report", 413)
            if self.headers.get_content_type() != "application/json":
                raise CommunityError("invalid_report", 415)
            data = json.loads(self.rfile.read(int(size)))
            return {"version": VERSION, "service_id": self.server.journal.id,
                    "change": self.server.journal.write(actor, action, data, target)}
        self.execute(write)


class TestRelay(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, db, dex, read_token, writers, port=0):
        if (not isinstance(read_token, str) or not TEST_TOKEN.fullmatch(read_token)
                or not isinstance(writers, dict) or not writers
                or any(not isinstance(actor, str) or not CONTRIBUTOR.fullmatch(actor) or
                       not isinstance(token, str) or not TEST_TOKEN.fullmatch(token) for actor, token in writers.items())
                or len({read_token, *writers.values()}) != len(writers) + 1):
            raise ValueError("Supply distinct synthetic contributor tokens and a separate read token.")
        self.read_token, self.writers = read_token, writers
        super().__init__(("127.0.0.1", port), Handler)
        try:
            self.journal = Journal(db, dex)
        except BaseException:
            super().server_close()
            raise

    def server_close(self):
        super().server_close()
        with self.journal.lock:
            self.journal.db.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument("--credentials", type=Path, required=True)
    parser.add_argument("--port", type=int, default=8766)
    args = parser.parse_args()
    credentials = json.loads(args.credentials.read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory(prefix="companion-relay-") as ref:
        with TestRelay(args.db, DexService(make_paths(ref)), credentials["read_token"], credentials["writers"], args.port) as server:
            print(f"Community test relay listening on 127.0.0.1:{server.server_port}", flush=True)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass


if __name__ == "__main__":
    main()
