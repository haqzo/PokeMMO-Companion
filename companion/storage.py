"""SQLite persistence with versioned migrations and pre-migration backups.

Design rules (docs/design/14, 16, 17):
* Never auto-delete user data on upgrade. Before any schema migration the
  existing database file is copied to ``backups/``.
* All writes go through one connection guarded by a lock (the HTTP server is
  threaded). WAL mode + synchronous=FULL keeps checkbox autosave crash-safe.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

SCHEMA_VERSION = 4

MIGRATIONS: dict[int, list[str]] = {
    1: [
        """CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)""",
        """CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL,
               updated_at TEXT NOT NULL)""",
        """CREATE TABLE IF NOT EXISTS runs (
               id TEXT PRIMARY KEY, character_name TEXT NOT NULL, run_label TEXT NOT NULL DEFAULT '',
               last_region TEXT NOT NULL DEFAULT 'kanto', created_at TEXT NOT NULL,
               updated_at TEXT NOT NULL, deleted_at TEXT)""",
        """CREATE TABLE IF NOT EXISTS run_regions (
               run_id TEXT NOT NULL, region TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'milestones',
               active_step_id TEXT, show_optional INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL,
               PRIMARY KEY (run_id, region))""",
        """CREATE TABLE IF NOT EXISTS step_status (
               run_id TEXT NOT NULL, step_id TEXT NOT NULL, status TEXT NOT NULL,
               text_hash TEXT, updated_at TEXT NOT NULL, PRIMARY KEY (run_id, step_id))""",
        """CREATE TABLE IF NOT EXISTS step_history (
               id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, step_id TEXT NOT NULL,
               previous TEXT, current TEXT, at TEXT NOT NULL)""",
        """CREATE TABLE IF NOT EXISTS favourites (species_id INTEGER PRIMARY KEY, added_at TEXT NOT NULL)""",
        """CREATE TABLE IF NOT EXISTS notes (species_id INTEGER PRIMARY KEY, body TEXT NOT NULL,
               updated_at TEXT NOT NULL)""",
        """CREATE TABLE IF NOT EXISTS reports (
               id TEXT PRIMARY KEY, provider TEXT NOT NULL, topic TEXT, message_id TEXT NOT NULL,
               kind TEXT NOT NULL, kind_basis TEXT NOT NULL, title TEXT, body TEXT, tags TEXT,
               species_id INTEGER, source_time TEXT, received_at TEXT NOT NULL,
               status TEXT NOT NULL DEFAULT 'reported', is_test INTEGER NOT NULL DEFAULT 0,
               is_replay INTEGER NOT NULL DEFAULT 0, seen INTEGER NOT NULL DEFAULT 0,
               raw_hash TEXT, parser_version TEXT, delivery TEXT,
               UNIQUE (provider, message_id))""",
        """CREATE TABLE IF NOT EXISTS documents (
               kind TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, data TEXT NOT NULL,
               created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (kind, id))""",
        """CREATE TABLE IF NOT EXISTS legendary_progress (
               run_id TEXT NOT NULL, species_id INTEGER NOT NULL, caught INTEGER NOT NULL,
               updated_at TEXT NOT NULL, PRIMARY KEY (run_id, species_id))""",
        """CREATE TABLE IF NOT EXISTS cave_observations (
               id TEXT PRIMARY KEY, observed_at TEXT NOT NULL, crystal TEXT, species TEXT,
               method TEXT, notes TEXT, source TEXT NOT NULL, created_at TEXT NOT NULL)""",
        """CREATE TABLE IF NOT EXISTS source_health (
               source TEXT PRIMARY KEY, status TEXT NOT NULL, detail TEXT, last_attempt_at TEXT,
               last_success_at TEXT, updated_at TEXT NOT NULL)""",
    ],
    # v2 (video correction pass): manual per-character Pokédex registration and the
    # user's own dated in-game roster checks. Purely additive — no existing data touched.
    2: [
        """CREATE TABLE IF NOT EXISTS dex_progress (
               run_id TEXT NOT NULL, species_id INTEGER NOT NULL,
               status TEXT NOT NULL DEFAULT 'unregistered',
               caught_alpha INTEGER NOT NULL DEFAULT 0, owned_shiny INTEGER NOT NULL DEFAULT 0,
               owned_costume INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
               PRIMARY KEY (run_id, species_id))""",
        """CREATE TABLE IF NOT EXISTS roster_checks (
               species_id INTEGER PRIMARY KEY, in_dex TEXT NOT NULL, checked_at TEXT NOT NULL, note TEXT)""",
        "ALTER TABLE reports ADD COLUMN region TEXT",
        "ALTER TABLE reports ADD COLUMN location TEXT",
        "ALTER TABLE reports ADD COLUMN source_url TEXT",
    ],
    # v3 (accuracy + foundations pass): shared local data contracts for the connected tools —
    # global Notes with entity links, Item Library user state, individual owned Pokémon (curated
    # Box), Showcase layouts, custom Guides with repeatable cycles, media references and the
    # user's own dated in-game counter observations. Additive only; per-species notes stay.
    3: [
        """CREATE TABLE IF NOT EXISTS lib_notes (
               id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
               tags TEXT NOT NULL DEFAULT '[]', pinned INTEGER NOT NULL DEFAULT 0, colour TEXT,
               archived_at TEXT, deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)""",
        """CREATE TABLE IF NOT EXISTS note_links (
               note_id TEXT NOT NULL, kind TEXT NOT NULL, ref TEXT NOT NULL, label TEXT,
               created_at TEXT NOT NULL, PRIMARY KEY (note_id, kind, ref))""",
        "CREATE INDEX IF NOT EXISTS note_links_ref ON note_links(kind, ref)",
        """CREATE TABLE IF NOT EXISTS item_user (
               item_id INTEGER PRIMARY KEY, favourite INTEGER NOT NULL DEFAULT 0, owned_qty INTEGER,
               updated_at TEXT NOT NULL)""",
        """CREATE TABLE IF NOT EXISTS owned_pokemon (
               id TEXT PRIMARY KEY, run_id TEXT, species_id INTEGER NOT NULL, data TEXT NOT NULL DEFAULT '{}',
               status TEXT NOT NULL DEFAULT 'kept', showcase_ok INTEGER NOT NULL DEFAULT 1,
               created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT)""",
        """CREATE TABLE IF NOT EXISTS showcases (
               id TEXT PRIMARY KEY, name TEXT NOT NULL, template TEXT NOT NULL DEFAULT 'grid',
               entries TEXT NOT NULL DEFAULT '[]', options TEXT NOT NULL DEFAULT '{}',
               created_at TEXT NOT NULL, updated_at TEXT NOT NULL)""",
        """CREATE TABLE IF NOT EXISTS custom_guides (
               id TEXT PRIMARY KEY, title TEXT NOT NULL, scope TEXT NOT NULL DEFAULT 'custom', region TEXT,
               location TEXT, recurring INTEGER NOT NULL DEFAULT 0, description TEXT NOT NULL DEFAULT '',
               source TEXT, archived_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)""",
        """CREATE TABLE IF NOT EXISTS custom_guide_steps (
               id TEXT PRIMARY KEY, guide_id TEXT NOT NULL, position INTEGER NOT NULL, depth INTEGER NOT NULL DEFAULT 0,
               kind TEXT NOT NULL DEFAULT 'check', text TEXT NOT NULL DEFAULT '', links TEXT NOT NULL DEFAULT '[]',
               media_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)""",
        """CREATE TABLE IF NOT EXISTS guide_cycles (
               id TEXT PRIMARY KEY, guide_id TEXT NOT NULL, run_id TEXT, number INTEGER NOT NULL,
               started_at TEXT NOT NULL, completed_at TEXT, note TEXT)""",
        """CREATE TABLE IF NOT EXISTS guide_cycle_marks (
               cycle_id TEXT NOT NULL, step_id TEXT NOT NULL, done_at TEXT NOT NULL, PRIMARY KEY (cycle_id, step_id))""",
        """CREATE TABLE IF NOT EXISTS media (
               id TEXT PRIMARY KEY, filename TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL,
               sha256 TEXT NOT NULL, label TEXT, created_at TEXT NOT NULL)""",
        """CREATE TABLE IF NOT EXISTS dex_observations (
               id TEXT PRIMARY KEY, run_id TEXT, observed_at TEXT NOT NULL, counters TEXT NOT NULL,
               client_note TEXT, created_at TEXT NOT NULL)""",
    ],
    # v4: user-managed Websites & links (docs/design/20 §A). Seeds are inserted once by the service
    # (meta 'bookmarks_seeded'); a deleted or edited default is never re-inserted or overwritten.
    4: [
        """CREATE TABLE IF NOT EXISTS bookmarks (
               id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
               category TEXT NOT NULL DEFAULT 'General', favourite INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0,
               seed_key TEXT, deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)""",
    ],
}


def utcnow() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class Storage:
    def __init__(self, db_path: Path, backups_dir: Path):
        self.db_path = Path(db_path)
        self.backups_dir = Path(backups_dir)
        self._lock = threading.RLock()
        existed = self.db_path.exists()
        self._conn = sqlite3.connect(str(self.db_path), check_same_thread=False, isolation_level=None)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=FULL")
        self._conn.execute("PRAGMA foreign_keys=ON")
        self.migrated_from: int | None = None
        self.backup_created: str | None = None
        self._migrate(existed)

    # ------------------------------------------------------------------ infra
    def _current_version(self) -> int:
        try:
            row = self._conn.execute("SELECT value FROM meta WHERE key='schema_version'").fetchone()
            return int(row[0]) if row else 0
        except sqlite3.OperationalError:
            return 0

    def _migrate(self, existed: bool) -> None:
        with self._lock:
            current = self._current_version()
            if current > SCHEMA_VERSION:
                raise RuntimeError(
                    f"Database schema v{current} is newer than this app (v{SCHEMA_VERSION}). "
                    "Refusing to open to avoid data loss.")
            if current == SCHEMA_VERSION:
                return
            if existed and current > 0:
                self.backup_created = str(self.backup(f"pre-migration-v{current}-to-v{SCHEMA_VERSION}"))
            self.migrated_from = current
            for version in range(current + 1, SCHEMA_VERSION + 1):
                self._conn.execute("BEGIN")
                try:
                    for stmt in MIGRATIONS[version]:
                        self._conn.execute(stmt)
                    self._conn.execute(
                        "INSERT OR REPLACE INTO meta(key, value) VALUES('schema_version', ?)", (str(version),))
                    self._conn.execute("COMMIT")
                except Exception:
                    self._conn.execute("ROLLBACK")
                    raise

    def backup(self, label: str = "manual") -> Path:
        """Consistent online copy of the database into backups/."""
        self.backups_dir.mkdir(parents=True, exist_ok=True)
        stamp = time.strftime("%Y%m%d-%H%M%S")
        target = self.backups_dir / f"companion-{stamp}-{label}.sqlite3"
        with self._lock:
            dest = sqlite3.connect(str(target))
            try:
                self._conn.backup(dest)
            finally:
                dest.close()
        return target

    @contextmanager
    def tx(self) -> Iterator[sqlite3.Connection]:
        with self._lock:
            self._conn.execute("BEGIN IMMEDIATE")
            try:
                yield self._conn
                self._conn.execute("COMMIT")
            except Exception:
                self._conn.execute("ROLLBACK")
                raise

    def query(self, sql: str, params: tuple | list = ()) -> list[dict]:
        with self._lock:
            return [dict(r) for r in self._conn.execute(sql, params).fetchall()]

    def query_one(self, sql: str, params: tuple | list = ()) -> dict | None:
        rows = self.query(sql, params)
        return rows[0] if rows else None

    def execute(self, sql: str, params: tuple | list = ()) -> int:
        with self.tx() as c:
            return c.execute(sql, params).rowcount

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    # --------------------------------------------------------------- settings
    def get_setting(self, key: str, default: Any = None) -> Any:
        row = self.query_one("SELECT value FROM settings WHERE key=?", (key,))
        return json.loads(row["value"]) if row else default

    def all_settings(self) -> dict[str, Any]:
        return {r["key"]: json.loads(r["value"]) for r in self.query("SELECT key, value FROM settings")}

    def set_settings(self, values: dict[str, Any]) -> None:
        now = utcnow()
        with self.tx() as c:
            for k, v in values.items():
                c.execute("INSERT INTO settings(key, value, updated_at) VALUES(?,?,?) "
                          "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
                          (k, json.dumps(v), now))

    def delete_settings(self, prefix: str) -> int:
        with self.tx() as c:
            return c.execute("DELETE FROM settings WHERE key LIKE ?", (prefix + "%",)).rowcount

    # -------------------------------------------------------------- documents
    def list_documents(self, kind: str) -> list[dict]:
        rows = self.query("SELECT * FROM documents WHERE kind=? ORDER BY updated_at DESC", (kind,))
        for r in rows:
            r["data"] = json.loads(r["data"])
        return rows

    def get_document(self, kind: str, doc_id: str) -> dict | None:
        r = self.query_one("SELECT * FROM documents WHERE kind=? AND id=?", (kind, doc_id))
        if r:
            r["data"] = json.loads(r["data"])
        return r

    def put_document(self, kind: str, doc_id: str, name: str, data: Any) -> dict:
        now = utcnow()
        with self.tx() as c:
            c.execute("INSERT INTO documents(kind,id,name,data,created_at,updated_at) VALUES(?,?,?,?,?,?) "
                      "ON CONFLICT(kind,id) DO UPDATE SET name=excluded.name, data=excluded.data, "
                      "updated_at=excluded.updated_at", (kind, doc_id, name, json.dumps(data), now, now))
        return self.get_document(kind, doc_id)  # type: ignore[return-value]

    def delete_document(self, kind: str, doc_id: str) -> bool:
        return self.execute("DELETE FROM documents WHERE kind=? AND id=?", (kind, doc_id)) > 0
