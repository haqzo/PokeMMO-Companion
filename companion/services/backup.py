"""Human-readable, versioned JSON export/import of all user-created data.

Never contains imported PokeMMO client data (that stays in private/ and can be
re-imported from the user's own archive).
"""
from __future__ import annotations

import json
import uuid

from .. import __version__
from ..storage import SCHEMA_VERSION, Storage, utcnow

FORMAT = "pokemmo-companion-backup"
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
    return {"format": FORMAT, "format_version": 1,
            "media_note": "Image files (Box photos, guide pictures) stay in the data folder's media/ directory and are not inside this JSON.", "app_version": __version__, "schema": SCHEMA_VERSION,
            "exported_at": utcnow(), "tables": data, "settings": settings}


def import_all(db: Storage, payload: dict, mode: str = "merge") -> dict:
    if not isinstance(payload, dict) or payload.get("format") != FORMAT:
        raise ValueError("Not a PokeMMO Companion backup file")
    if int(payload.get("format_version", 0)) > 1:
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
        for r in tables.get("documents", []):
            doc_id = r["id"]
            if mode == "merge" and c.execute("SELECT 1 FROM documents WHERE kind=? AND id=?", (r["kind"], doc_id)).fetchone():
                doc_id = uuid.uuid4().hex[:12]
            c.execute("INSERT INTO documents(kind, id, name, data, created_at, updated_at) VALUES(?,?,?,?,?,?)",
                      (r["kind"], doc_id, r["name"], r["data"] if isinstance(r["data"], str) else json.dumps(r["data"]),
                       r["created_at"], r["updated_at"]))
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
                c.execute("INSERT OR REPLACE INTO settings(key, value, updated_at) VALUES(?,?,?)",
                          (k, json.dumps(v), utcnow()))
    return stats
