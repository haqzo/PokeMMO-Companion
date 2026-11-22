"""Guides: catalogs + named character runs with independent per-region progress.

Catalog sources per region:
  * ``milestones`` — bundled independently written outline (always available)
  * ``imported``   — the user's own walkthrough, parsed locally (private/guides)
Progress is keyed by stable step IDs, so wording changes keep checkmarks; a
changed text hash is surfaced for review instead of silently transferring.
"""
from __future__ import annotations

import itertools
import json
import re
import uuid

from ..config import Paths
from ..data.guide_milestones import SOURCE as MILESTONE_SOURCE, milestone_steps
from ..data.reference import REGIONS
from ..storage import Storage, utcnow

NAME_RX = re.compile(r"^[\w .'\-]{1,24}$", re.UNICODE)
_batch = itertools.count(1)


class GuideError(ValueError):
    pass


class GuideService:
    def __init__(self, storage: Storage, paths: Paths):
        self.db = storage
        self.paths = paths
        self._imported_cache: dict[str, dict] = {}

    # ----------------------------------------------------------- catalog
    def imported(self, region: str) -> dict | None:
        f = self.paths.guides_dir / f"{region}.json"
        if not f.exists():
            return None
        mtime = f.stat().st_mtime
        cached = self._imported_cache.get(region)
        if cached and cached["_mtime"] == mtime:
            return cached
        data = json.loads(f.read_text(encoding="utf-8"))
        data["_mtime"] = mtime
        self._imported_cache[region] = data
        return data

    def sources(self, region: str) -> list[dict]:
        out = [{"id": "milestones", **MILESTONE_SOURCE, "steps": len(milestone_steps(region))}]
        imp = self.imported(region)
        if imp:
            out.append({"id": "imported", "kind": "user-import", "label": f"Your walkthrough ({imp['file']})",
                        "checked_at": imp["imported_at"], "status": "imported-unverified",
                        "note": "Parsed locally from your private file. Not verified against the current game; "
                                "steps are auto-tagged. Kept on this computer only.",
                        "steps": len(imp["steps"])})
        return out

    def steps(self, region: str, source: str) -> list[dict]:
        if region not in REGIONS:
            raise GuideError("Unknown region")
        if source == "imported":
            imp = self.imported(region)
            return imp["steps"] if imp else []
        return milestone_steps(region)

    # -------------------------------------------------------------- runs
    def list_runs(self, include_deleted: bool = False) -> list[dict]:
        sql = "SELECT * FROM runs" + ("" if include_deleted else " WHERE deleted_at IS NULL") + \
              " ORDER BY updated_at DESC"
        runs = self.db.query(sql)
        for r in runs:
            r["display"] = r["character_name"] + (f" · {r['run_label']}" if r["run_label"] else "")
        return runs

    def get_run(self, run_id: str) -> dict:
        r = self.db.query_one("SELECT * FROM runs WHERE id=? AND deleted_at IS NULL", (run_id,))
        if not r:
            raise GuideError("Run not found")
        r["display"] = r["character_name"] + (f" · {r['run_label']}" if r["run_label"] else "")
        return r

    def _validate(self, name: str, label: str) -> tuple[str, str]:
        name = (name or "").strip()
        label = (label or "").strip()
        if not NAME_RX.match(name):
            raise GuideError("Character name: 1–24 letters, digits, spaces, . ' or -")
        if label and not NAME_RX.match(label):
            raise GuideError("Run label: up to 24 letters, digits, spaces, . ' or -")
        return name, label

    def _ensure_unique(self, name: str, label: str, exclude: str | None = None) -> None:
        clash = self.db.query_one(
            "SELECT id FROM runs WHERE deleted_at IS NULL AND lower(character_name)=lower(?) AND lower(run_label)=lower(?)"
            + (" AND id<>?" if exclude else ""), (name, label, exclude) if exclude else (name, label))
        if clash:
            raise GuideError("A run with that character name and label already exists — add a different run label.")

    def create_run(self, name: str, label: str = "", region: str = "kanto") -> dict:
        name, label = self._validate(name, label)
        if region not in REGIONS:
            raise GuideError("Unknown region")
        self._ensure_unique(name, label)
        rid = uuid.uuid4().hex[:12]
        now = utcnow()
        self.db.execute("INSERT INTO runs(id, character_name, run_label, last_region, created_at, updated_at) "
                        "VALUES(?,?,?,?,?,?)", (rid, name, label, region, now, now))
        return self.get_run(rid)

    def rename_run(self, run_id: str, name: str, label: str) -> dict:
        self.get_run(run_id)
        name, label = self._validate(name, label)
        self._ensure_unique(name, label, exclude=run_id)
        self.db.execute("UPDATE runs SET character_name=?, run_label=?, updated_at=? WHERE id=?",
                        (name, label, utcnow(), run_id))
        return self.get_run(run_id)

    def duplicate_run(self, run_id: str, label: str) -> dict:
        src = self.get_run(run_id)
        new = self.create_run(src["character_name"], label or (src["run_label"] + " copy").strip(), src["last_region"])
        with self.db.tx() as c:
            c.execute("INSERT INTO run_regions(run_id, region, source, active_step_id, show_optional, updated_at) "
                      "SELECT ?, region, source, active_step_id, show_optional, ? FROM run_regions WHERE run_id=?",
                      (new["id"], utcnow(), run_id))
            c.execute("INSERT INTO step_status(run_id, step_id, status, text_hash, updated_at) "
                      "SELECT ?, step_id, status, text_hash, updated_at FROM step_status WHERE run_id=?",
                      (new["id"], run_id))
            c.execute("INSERT INTO legendary_progress(run_id, species_id, caught, updated_at) "
                      "SELECT ?, species_id, caught, updated_at FROM legendary_progress WHERE run_id=?",
                      (new["id"], run_id))
        return new

    def delete_run(self, run_id: str) -> None:
        self.get_run(run_id)
        self.db.execute("UPDATE runs SET deleted_at=? WHERE id=?", (utcnow(), run_id))

    def restore_run(self, run_id: str) -> dict:
        r = self.db.query_one("SELECT * FROM runs WHERE id=?", (run_id,))
        if not r:
            raise GuideError("Run not found")
        self._ensure_unique(r["character_name"], r["run_label"], exclude=run_id)
        self.db.execute("UPDATE runs SET deleted_at=NULL, updated_at=? WHERE id=?", (utcnow(), run_id))
        return self.get_run(run_id)

    # --------------------------------------------------------- progress
    def _region_row(self, run_id: str, region: str) -> dict:
        row = self.db.query_one("SELECT * FROM run_regions WHERE run_id=? AND region=?", (run_id, region))
        if not row:
            default_source = "milestones"
            self.db.execute("INSERT OR IGNORE INTO run_regions(run_id, region, source, updated_at) VALUES(?,?,?,?)",
                            (run_id, region, default_source, utcnow()))
            row = self.db.query_one("SELECT * FROM run_regions WHERE run_id=? AND region=?", (run_id, region))
        return row  # type: ignore[return-value]

    def state(self, run_id: str, region: str) -> dict:
        run = self.get_run(run_id)
        if region not in REGIONS:
            raise GuideError("Unknown region")
        rr = self._region_row(run_id, region)
        source = rr["source"]
        if source == "imported" and not self.imported(region):
            source = "milestones"
        steps = self.steps(region, source)
        ids = {s["id"] for s in steps}
        rows = self.db.query("SELECT step_id, status, text_hash FROM step_status WHERE run_id=?", (run_id,))
        status = {r["step_id"]: r for r in rows if r["step_id"] in ids}
        done = {sid for sid, r in status.items() if r["status"] == "done"}
        changed = [s["id"] for s in steps if s["id"] in done and s.get("text_hash")
                   and status[s["id"]]["text_hash"] and status[s["id"]]["text_hash"] != s["text_hash"]]
        mandatory = [s for s in steps if s.get("mandatory") is True]
        optional = [s for s in steps if s.get("mandatory") is False]
        unclassified = [s for s in steps if s.get("mandatory") is None]
        active = rr["active_step_id"] if rr["active_step_id"] in ids else None
        if not active:
            pool = mandatory or unclassified or steps
            active = next((s["id"] for s in pool if s["id"] not in done), pool[-1]["id"] if pool else None)
        counts = {
            "mandatory": {"done": sum(1 for s in mandatory if s["id"] in done), "total": len(mandatory)},
            "optional": {"done": sum(1 for s in optional if s["id"] in done), "total": len(optional)},
            "unclassified": {"done": sum(1 for s in unclassified if s["id"] in done), "total": len(unclassified)},
        }
        return {"run": run, "region": region, "source": source, "sources": self.sources(region),
                "active_step_id": active, "show_optional": bool(rr["show_optional"]), "done": sorted(done),
                "changed": changed, "counts": counts}

    def set_region_prefs(self, run_id: str, region: str, source: str | None = None,
                         active_step_id: str | None = None, show_optional: bool | None = None) -> None:
        self.get_run(run_id)
        self._region_row(run_id, region)
        now = utcnow()
        with self.db.tx() as c:
            if source is not None:
                if source not in ("milestones", "imported"):
                    raise GuideError("Unknown guide source")
                c.execute("UPDATE run_regions SET source=?, active_step_id=NULL, updated_at=? WHERE run_id=? AND region=?",
                          (source, now, run_id, region))
            if active_step_id is not None:
                c.execute("UPDATE run_regions SET active_step_id=?, updated_at=? WHERE run_id=? AND region=?",
                          (active_step_id, now, run_id, region))
            if show_optional is not None:
                c.execute("UPDATE run_regions SET show_optional=?, updated_at=? WHERE run_id=? AND region=?",
                          (1 if show_optional else 0, now, run_id, region))
            c.execute("UPDATE runs SET last_region=?, updated_at=? WHERE id=?", (region, now, run_id))

    def _hash_for(self, step_id: str) -> str | None:
        region = step_id.split(":")[0]
        if ":imp:" in step_id:
            imp = self.imported(region)
            for s in (imp or {}).get("steps", []):
                if s["id"] == step_id:
                    return s.get("text_hash")
        return None

    def set_steps(self, run_id: str, step_ids: list[str], done: bool) -> dict:
        self.get_run(run_id)
        token = f"{utcnow()}#{next(_batch)}"
        now = utcnow()
        changed = 0
        with self.db.tx() as c:
            for sid in step_ids:
                if not isinstance(sid, str) or sid.split(":")[0] not in REGIONS:
                    raise GuideError(f"Invalid step id {sid!r}")
                prev = c.execute("SELECT status FROM step_status WHERE run_id=? AND step_id=?", (run_id, sid)).fetchone()
                prev_s = prev[0] if prev else None
                cur = "done" if done else None
                if prev_s == cur:
                    continue
                if done:
                    c.execute("INSERT INTO step_status(run_id, step_id, status, text_hash, updated_at) VALUES(?,?,?,?,?) "
                              "ON CONFLICT(run_id, step_id) DO UPDATE SET status=excluded.status, "
                              "text_hash=excluded.text_hash, updated_at=excluded.updated_at",
                              (run_id, sid, "done", self._hash_for(sid), now))
                else:
                    c.execute("DELETE FROM step_status WHERE run_id=? AND step_id=?", (run_id, sid))
                c.execute("INSERT INTO step_history(run_id, step_id, previous, current, at) VALUES(?,?,?,?,?)",
                          (run_id, sid, prev_s, cur, token))
                changed += 1
            c.execute("UPDATE runs SET updated_at=? WHERE id=?", (now, run_id))
        return {"changed": changed, "batch": token}

    def mark_through(self, run_id: str, region: str, step_id: str, preview: bool = False) -> dict:
        st = self.state(run_id, region)
        steps = self.steps(region, st["source"])
        ids = [s["id"] for s in steps]
        if step_id not in ids:
            raise GuideError("Step not in this guide")
        target = ids[: ids.index(step_id) + 1]
        todo = [i for i in target if i not in set(st["done"])]
        if preview:
            return {"would_mark": len(todo)}
        res = self.set_steps(run_id, todo, True)
        nxt = ids[ids.index(step_id) + 1] if ids.index(step_id) + 1 < len(ids) else step_id
        self.set_region_prefs(run_id, region, active_step_id=nxt)
        return res

    def undo(self, run_id: str) -> dict:
        self.get_run(run_id)
        last = self.db.query_one("SELECT at FROM step_history WHERE run_id=? ORDER BY id DESC LIMIT 1", (run_id,))
        if not last:
            return {"undone": 0}
        rows = self.db.query("SELECT * FROM step_history WHERE run_id=? AND at=? ORDER BY id DESC", (run_id, last["at"]))
        now = utcnow()
        with self.db.tx() as c:
            for r in rows:
                if r["previous"] == "done":
                    c.execute("INSERT INTO step_status(run_id, step_id, status, text_hash, updated_at) VALUES(?,?,?,?,?) "
                              "ON CONFLICT(run_id, step_id) DO UPDATE SET status='done', updated_at=excluded.updated_at",
                              (run_id, r["step_id"], "done", self._hash_for(r["step_id"]), now))
                else:
                    c.execute("DELETE FROM step_status WHERE run_id=? AND step_id=?", (run_id, r["step_id"]))
                c.execute("DELETE FROM step_history WHERE id=?", (r["id"],))
        return {"undone": len(rows)}

    def acknowledge_changes(self, run_id: str, step_ids: list[str]) -> int:
        n = 0
        with self.db.tx() as c:
            for sid in step_ids:
                n += c.execute("UPDATE step_status SET text_hash=? WHERE run_id=? AND step_id=?",
                               (self._hash_for(sid), run_id, sid)).rowcount
        return n

    def overview(self, run_id: str) -> dict:
        return {r: self.state(run_id, r)["counts"] for r in REGIONS}
