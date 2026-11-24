"""Backups of everything the player created.

* JSON export/import (format v2): every table of personal data + settings (incl. window positions).
* Complete backup archive (.zip): the JSON plus the image files it references (Box photos, guide pictures) and a
  manifest with SHA-256 checksums. Automatic archives are written in the background at an interval and pruned.
* Restore: preview first (counts, conflicts, versions); a safety copy of the database is always taken; merge
  remaps ids so links between records survive (runs → progress, storyline timers and guide extras; teams →
  guides that use them); replace wipes personal data first. An interrupted restore is finished or rolled back
  on the next start (restore marker).

Never contains imported PokeMMO client data, ROMs or dumps (those stay in private/).
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import shutil
import threading
import time
import uuid
import zipfile
from pathlib import Path

from .. import __version__
from ..storage import SCHEMA_VERSION, Storage, utcnow

FORMAT = "pokemmo-companion-backup"
FORMAT_VERSION = 2
log = logging.getLogger("companion.backup")
# documents whose id is a natural key (one per region / guide): merge keeps the newer one instead of copying
SINGLETON_KINDS = {"map_layout", "map_draft", "guide_extras"}
MAX_ARCHIVE_ENTRIES = 20000
MAX_ARCHIVE_UNCOMPRESSED = 1_000_000_000      # 1 GB
MAX_JSON_BYTES = 200_000_000
MEDIA_NAME = re.compile(r"^media/([0-9a-f]{12})\.(png|jpg|gif|webp)$")
KEEP_AUTO = 7
KEEP_OTHER = 10
KEEP_SQLITE = 15
TABLES = ["runs", "run_regions", "step_status", "favourites", "notes", "documents", "legendary_progress",
          "cave_observations", "dex_progress", "roster_checks",
          # v3 connected tools
          "lib_notes", "note_links", "item_user", "owned_pokemon", "showcases", "custom_guides", "custom_guide_steps",
          "guide_cycles", "guide_cycle_marks", "media", "dex_observations", "bookmarks"]
# Tables copied verbatim on import (stable string ids; merge keeps existing rows with the same key).
GENERIC = {"lib_notes": ("id",), "note_links": ("note_id", "kind", "ref"), "item_user": ("item_id",),
           "owned_pokemon": ("id",), "showcases": ("id",), "custom_guides": ("id",), "custom_guide_steps": ("id",),
           "guide_cycles": ("id",), "guide_cycle_marks": ("cycle_id", "step_id"), "media": ("id",), "dex_observations": ("id",),
           "bookmarks": ("id",)}


def export_all(db: Storage) -> dict:
    data = {t: db.query(f"SELECT * FROM {t}") for t in TABLES}
    settings = {k: v for k, v in db.all_settings().items() if not k.startswith("news.")}
    return {"format": FORMAT, "format_version": FORMAT_VERSION,
            "media_note": "A .json export holds no image files; a complete backup (.zip) contains them.",
            "app_version": __version__, "schema": SCHEMA_VERSION, "exported_at": utcnow(), "tables": data, "settings": settings}


def import_all(db: Storage, payload: dict, mode: str = "merge") -> dict:
    if not isinstance(payload, dict) or payload.get("format") != FORMAT:
        raise ValueError("Not a PokeMMO Companion backup file")
    if int(payload.get("format_version", 0)) > FORMAT_VERSION:
        raise ValueError("Backup was made by a newer Companion version")
    if mode not in ("merge", "replace"):
        raise ValueError("mode must be merge or replace")
    tables = payload.get("tables", {})
    safety = str(db.backup(f"before-import-{mode}"))
    stats: dict = {"mode": mode, "safety_backup": safety, "runs_added": 0, "runs_renamed": 0}
    with db.tx() as c:
        if mode == "replace":
            for t in TABLES:
                c.execute(f"DELETE FROM {t}")
            c.execute("DELETE FROM settings WHERE key NOT LIKE 'news.%'")
        id_map: dict[str, str] = {}
        existing = {r[0] for r in c.execute("SELECT id FROM runs").fetchall()}
        for r in tables.get("runs", []):
            rid = r["id"]
            if rid in existing:  # never silently overwrite another run: import as a copy
                new = uuid.uuid4().hex[:12]
                id_map[rid] = new
                r = {**r, "id": new, "run_label": (r.get("run_label") or "") + " (imported)"}
                stats["runs_renamed"] += 1
            c.execute("INSERT INTO runs(id, character_name, run_label, last_region, created_at, updated_at, deleted_at) "
                      "VALUES(?,?,?,?,?,?,?)", (r["id"], r["character_name"], r.get("run_label", ""),
                                                r.get("last_region", "kanto"), r["created_at"], r["updated_at"],
                                                r.get("deleted_at")))
            stats["runs_added"] += 1

        def rid(x: str) -> str:
            return id_map.get(x, x)
        for r in tables.get("run_regions", []):
            c.execute("INSERT OR REPLACE INTO run_regions(run_id, region, source, active_step_id, show_optional, updated_at) "
                      "VALUES(?,?,?,?,?,?)", (rid(r["run_id"]), r["region"], r["source"], r.get("active_step_id"),
                                              r.get("show_optional", 1), r["updated_at"]))
        for r in tables.get("step_status", []):
            c.execute("INSERT OR REPLACE INTO step_status(run_id, step_id, status, text_hash, updated_at) VALUES(?,?,?,?,?)",
                      (rid(r["run_id"]), r["step_id"], r["status"], r.get("text_hash"), r["updated_at"]))
        for r in tables.get("legendary_progress", []):
            c.execute("INSERT OR REPLACE INTO legendary_progress(run_id, species_id, caught, updated_at) VALUES(?,?,?,?)",
                      (rid(r["run_id"]), r["species_id"], r["caught"], r["updated_at"]))
        for r in tables.get("favourites", []):
            c.execute("INSERT OR IGNORE INTO favourites(species_id, added_at) VALUES(?,?)", (r["species_id"], r["added_at"]))
        for r in tables.get("notes", []):
            c.execute("INSERT OR REPLACE INTO notes(species_id, body, updated_at) VALUES(?,?,?)",
                      (r["species_id"], r["body"], r["updated_at"]))
        # Documents: teams, timers, timer presets, guide extras, map layouts, … Pass 1 decides every new id,
        # pass 2 rewrites references inside the documents and inserts them, so links survive a merge.
        doc_map: dict[tuple[str, str], str] = {}
        plan = []
        for r in tables.get("documents", []):
            data = r["data"] if not isinstance(r["data"], str) else json.loads(r["data"] or "null")
            kind, doc_id = r["kind"], r["id"]
            if kind == "guide_extras":
                doc_id = _remap_guide_key(doc_id, id_map)
            if kind == "timer" and isinstance(data, dict) and data.get("owner"):
                data = {**data, "owner": _remap_owner(data["owner"], id_map)}
            have = c.execute("SELECT data, updated_at FROM documents WHERE kind=? AND id=?", (kind, doc_id)).fetchone()
            if mode == "merge" and have:
                same = json.loads(have[0] or "null") == data
                if same:
                    stats["documents_unchanged"] = stats.get("documents_unchanged", 0) + 1
                    continue
                if kind in SINGLETON_KINDS:
                    if (have[1] or "") >= (r.get("updated_at") or ""):
                        stats["documents_kept_newer"] = stats.get("documents_kept_newer", 0) + 1
                        continue
                else:
                    new = uuid.uuid4().hex[:12]
                    doc_map[(kind, r["id"])] = new
                    doc_id = new
                    stats["documents_copied"] = stats.get("documents_copied", 0) + 1
            plan.append((kind, doc_id, r, data))
        for kind, doc_id, r, data in plan:
            if kind == "guide_extras" and isinstance(data, dict) and data.get("team_id"):
                data = {**data, "team_id": doc_map.get(("team", data["team_id"]), data["team_id"])}
            if kind == "timer" and isinstance(data, dict):
                data = {**data, "id": doc_id}
            name = r["name"] + (" (imported)" if (kind, r["id"]) in doc_map and kind == "team" else "")
            c.execute("INSERT OR REPLACE INTO documents(kind, id, name, data, created_at, updated_at) VALUES(?,?,?,?,?,?)",
                      (kind, doc_id, name, json.dumps(data), r["created_at"], r["updated_at"]))
            stats["documents"] = stats.get("documents", 0) + 1
        for r in tables.get("dex_progress", []):
            c.execute("INSERT OR REPLACE INTO dex_progress(run_id, species_id, status, caught_alpha, owned_shiny, "
                      "owned_costume, updated_at) VALUES(?,?,?,?,?,?,?)",
                      (rid(r["run_id"]), r["species_id"], r["status"], r.get("caught_alpha", 0),
                       r.get("owned_shiny", 0), r.get("owned_costume", 0), r["updated_at"]))
        for r in tables.get("roster_checks", []):
            c.execute("INSERT OR REPLACE INTO roster_checks(species_id, in_dex, checked_at, note) VALUES(?,?,?,?)",
                      (r["species_id"], r["in_dex"], r["checked_at"], r.get("note")))
        for r in tables.get("cave_observations", []):
            c.execute("INSERT OR IGNORE INTO cave_observations(id, observed_at, crystal, species, method, notes, source, created_at) "
                      "VALUES(?,?,?,?,?,?,?,?)", (r["id"], r["observed_at"], r.get("crystal"), r.get("species"),
                                                 r.get("method"), r.get("notes"), r["source"], r["created_at"]))
        for t, keys in GENERIC.items():
            cols = [r[1] for r in c.execute(f"PRAGMA table_info({t})").fetchall()]
            for r in tables.get(t, []):
                row = {k: v for k, v in r.items() if k in cols}
                if "run_id" in row and row["run_id"]:
                    row["run_id"] = rid(row["run_id"])
                verb = "INSERT OR REPLACE" if mode == "replace" else "INSERT OR IGNORE"
                c.execute(f"{verb} INTO {t}({', '.join(row)}) VALUES({', '.join('?' * len(row))})", tuple(row.values()))
                stats[t] = stats.get(t, 0) + 1
        if mode == "replace":
            for k, v in payload.get("settings", {}).items():
                if k == "guides.active_run" and isinstance(v, str):
                    v = id_map.get(v, v)
                c.execute("INSERT OR REPLACE INTO settings(key, value, updated_at) VALUES(?,?,?)",
                          (k, json.dumps(v), utcnow()))
    return stats


def _remap_guide_key(key: str, run_map: dict[str, str]) -> str:
    if key.startswith("story:"):
        parts = key.split(":")
        if len(parts) == 3 and parts[1] in run_map:
            return f"story:{run_map[parts[1]]}:{parts[2]}"
    return key


def _remap_owner(owner: dict, run_map: dict[str, str]) -> dict:
    o = dict(owner)
    if o.get("run") in run_map:
        o["run"] = run_map[o["run"]]
    if isinstance(o.get("guide"), str):
        o["guide"] = _remap_guide_key(o["guide"], run_map)
    return o


# ------------------------------------------------------------------ preview
def preview(db: Storage, payload: dict) -> dict:
    """What a restore would do, without changing anything."""
    if not isinstance(payload, dict) or payload.get("format") != FORMAT:
        raise ValueError("Not a PokeMMO Companion backup file")
    tables = payload.get("tables", {})
    counts = {t: len(v) for t, v in tables.items() if isinstance(v, list) and v}
    runs_existing = {r["id"] for r in db.query("SELECT id FROM runs")}
    doc_conflicts = 0
    kinds: dict[str, int] = {}
    for r in tables.get("documents", []):
        kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
        if db.query_one("SELECT 1 AS x FROM documents WHERE kind=? AND id=?", (r["kind"], r["id"])):
            doc_conflicts += 1
    return {"app_version": payload.get("app_version"), "schema": payload.get("schema"), "exported_at": payload.get("exported_at"),
            "format_version": payload.get("format_version"), "newer": int(payload.get("format_version", 0)) > FORMAT_VERSION,
            "counts": counts, "document_kinds": kinds, "runs_conflicting": sum(1 for r in tables.get("runs", []) if r["id"] in runs_existing),
            "documents_conflicting": doc_conflicts, "settings": len(payload.get("settings", {})),
            "media_files": len(payload.get("_media", []))}


# ------------------------------------------------------------------ complete archives (.zip with images)
def write_archive(db: Storage, media_dir: Path, dest_dir: Path, label: str = "manual") -> Path:
    """Write a complete backup archive atomically (tmp file → rename). Returns its path."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    payload = export_all(db)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    target = dest_dir / f"companion-backup-{stamp}-{label}.zip"
    tmp = target.with_suffix(".zip.part")
    manifest = {"format": FORMAT, "format_version": FORMAT_VERSION, "created_at": utcnow(), "label": label, "files": {}}
    with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_DEFLATED) as z:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        z.writestr("backup.json", body)
        manifest["files"]["backup.json"] = hashlib.sha256(body).hexdigest()
        for m in payload["tables"].get("media", []):
            ext = {"image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp"}.get(m["mime"])
            src = Path(media_dir) / f"{m['id']}.{ext}"
            if ext and src.is_file():
                data = src.read_bytes()
                z.writestr(f"media/{src.name}", data, compress_type=zipfile.ZIP_STORED)
                manifest["files"][f"media/{src.name}"] = hashlib.sha256(data).hexdigest()
        z.writestr("manifest.json", json.dumps(manifest, indent=1))
    tmp.replace(target)
    return target


def read_archive(path: Path) -> tuple[dict, dict[str, bytes]]:
    """Validate and read a backup archive: size limits, safe names, checksums. Returns (payload, media files)."""
    path = Path(path)
    with zipfile.ZipFile(path) as z:
        infos = z.infolist()
        if len(infos) > MAX_ARCHIVE_ENTRIES or sum(i.file_size for i in infos) > MAX_ARCHIVE_UNCOMPRESSED:
            raise ValueError("Backup archive is too large")
        names = {i.filename for i in infos}
        if "backup.json" not in names or "manifest.json" not in names:
            raise ValueError("Not a PokeMMO Companion backup archive")
        manifest = json.loads(z.read("manifest.json"))
        if manifest.get("format") != FORMAT:
            raise ValueError("Not a PokeMMO Companion backup archive")
        body = z.read("backup.json")
        if len(body) > MAX_JSON_BYTES:
            raise ValueError("Backup data is too large")
        sums = manifest.get("files", {})
        if sums.get("backup.json") != hashlib.sha256(body).hexdigest():
            raise ValueError("Backup archive is damaged (checksum mismatch in backup.json)")
        media: dict[str, bytes] = {}
        for i in infos:
            if i.filename.startswith("media/"):
                if not MEDIA_NAME.match(i.filename):
                    raise ValueError(f"Unexpected file in backup archive: {i.filename[:80]}")
                data = z.read(i)
                if sums.get(i.filename) != hashlib.sha256(data).hexdigest():
                    raise ValueError(f"Backup archive is damaged (checksum mismatch in {i.filename})")
                media[i.filename[len("media/"):]] = data
    payload = json.loads(body)
    payload["_media"] = sorted(media)
    return payload, media


def restore_archive(db: Storage, media_dir: Path, path: Path, mode: str = "merge", marker: Path | None = None) -> dict:
    """Restore a complete archive. The database part is one transaction; image files are written afterwards with
    a restore marker, so an interruption is finished on the next start (finish_interrupted)."""
    payload, media = read_archive(path)
    if marker:
        marker.write_text(json.dumps({"archive": str(path), "stage": "database", "started_at": utcnow()}), encoding="utf-8")
    stats = import_all(db, payload, mode)
    if marker:
        marker.write_text(json.dumps({"archive": str(path), "stage": "media", "safety_backup": stats["safety_backup"]}), encoding="utf-8")
    stats["media_files"] = _write_media(Path(media_dir), media)
    if marker:
        marker.unlink(missing_ok=True)
    return stats


def _write_media(media_dir: Path, media: dict[str, bytes]) -> int:
    media_dir.mkdir(parents=True, exist_ok=True)
    n = 0
    for name, data in media.items():
        dst = media_dir / name
        if dst.is_file() and dst.stat().st_size == len(data):
            continue
        tmp = dst.with_suffix(dst.suffix + ".part")
        tmp.write_bytes(data)
        tmp.replace(dst)
        n += 1
    return n


def finish_interrupted(db: Storage, media_dir: Path, marker: Path) -> dict | None:
    """Called at start-up. Database stage interrupted → the transaction never committed, nothing to do.
    Media stage interrupted → write the remaining image files from the same archive."""
    if not marker.is_file():
        return None
    try:
        info = json.loads(marker.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        marker.unlink(missing_ok=True)
        return {"recovered": False, "reason": "unreadable marker"}
    result = {"stage": info.get("stage"), "recovered": True}
    if info.get("stage") == "media" and Path(info.get("archive", "")).is_file():
        try:
            _, media = read_archive(Path(info["archive"]))
            result["media_files"] = _write_media(media_dir, media)
        except Exception as exc:  # pragma: no cover - reported, never fatal
            result.update(recovered=False, reason=str(exc)[:200])
    marker.unlink(missing_ok=True)
    log.warning("Finished an interrupted restore: %s", result)
    return result


# ------------------------------------------------------------------ automatic backups + retention
def list_backups(dest_dir: Path) -> list[dict]:
    out = []
    for p in sorted(Path(dest_dir).glob("companion-*"), key=lambda x: x.stat().st_mtime, reverse=True):
        if p.suffix in (".zip", ".sqlite3"):
            kind = "archive" if p.suffix == ".zip" else "database copy"
            label = "automatic" if p.stem.endswith("-auto") else "safety copy" if "before-" in p.stem or "pre-migration" in p.stem else "manual"
            out.append({"name": p.name, "bytes": p.stat().st_size, "kind": kind, "label": label,
                        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(p.stat().st_mtime))})
    return out


def prune(dest_dir: Path) -> int:
    """Keep the newest 7 automatic archives, 10 other archives and 15 database copies; never touches anything else."""
    removed = 0
    files = sorted(Path(dest_dir).glob("companion-*"), key=lambda x: x.stat().st_mtime, reverse=True)
    groups = {"auto": [f for f in files if f.suffix == ".zip" and f.stem.endswith("-auto")],
              "zip": [f for f in files if f.suffix == ".zip" and not f.stem.endswith("-auto")],
              "sqlite": [f for f in files if f.suffix == ".sqlite3"]}
    for key, keep in (("auto", KEEP_AUTO), ("zip", KEEP_OTHER), ("sqlite", KEEP_SQLITE)):
        for f in groups[key][keep:]:
            f.unlink(missing_ok=True)
            removed += 1
    return removed


class AutoBackup:
    """Background automatic archives (never on the UI thread): at start-up if the last one is older than the
    interval, then re-checked hourly. Setting backup.auto_hours (0 = off)."""

    def __init__(self, db: Storage, media_dir: Path, dest_dir: Path, settings):
        self.db, self.media_dir, self.dest_dir, self.settings = db, Path(media_dir), Path(dest_dir), settings
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def due(self, now: float | None = None) -> bool:
        hours = float(self.settings.get("backup.auto_hours") or 0)
        if hours <= 0:
            return False
        autos = sorted(self.dest_dir.glob("companion-backup-*-auto.zip"), key=lambda x: x.stat().st_mtime)
        last = autos[-1].stat().st_mtime if autos else 0
        return (now or time.time()) - last >= hours * 3600

    def run_once(self) -> Path | None:
        if not self.due():
            return None
        p = write_archive(self.db, self.media_dir, self.dest_dir, "auto")
        prune(self.dest_dir)
        return p

    def start(self) -> None:
        if self._thread:
            return

        def loop():
            if self._stop.wait(60):
                return
            while not self._stop.is_set():
                try:
                    self.run_once()
                except Exception:  # pragma: no cover
                    log.exception("automatic backup failed")
                if self._stop.wait(3600):
                    return
        self._thread = threading.Thread(target=loop, name="auto-backup", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
