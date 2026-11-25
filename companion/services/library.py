"""Shared local data contracts for the connected tools (schema v3).

* Notes       — global notes library with tags, pin, archive, trash/restore and entity links.
* Box         — individual Pokémon the user chooses to record (never inferred from the game).
* Showcase    — display layouts built from selected Box entries.
* CustomGuide — user-written guides with steps and repeatable cycles (gym reruns etc.).
* Media       — local images attached to Box entries or guide steps (never uploaded).
* Observations— the user's own dated in-game Pokédex counter readings.

Every record is local, stable-ID based, included in backups, and validated here (not in the UI).
"""
from __future__ import annotations

import base64
import hashlib
import json
import re
import uuid
from datetime import date
from typing import Any

from ..config import Paths
from ..data import reference as ref
from ..storage import Storage, utcnow


class LibraryError(ValueError):
    """User-readable validation error (HTTP 400)."""


def _id() -> str:
    return uuid.uuid4().hex[:12]


def _text(v: Any, field: str, max_len: int, required: bool = False) -> str:
    s = "" if v is None else str(v)
    s = s.replace("\x00", "").strip() if field != "body" else s.replace("\x00", "")
    if required and not s.strip():
        raise LibraryError(f"{field} is required")
    if len(s) > max_len:
        raise LibraryError(f"{field} is too long (max {max_len} characters)")
    return s


def _tags(v: Any) -> list[str]:
    if v is None:
        return []
    if isinstance(v, str):
        v = [t for t in re.split(r"[,#]", v)]
    if not isinstance(v, list):
        raise LibraryError("tags must be a list")
    out: list[str] = []
    for t in v:
        t = re.sub(r"\s+", " ", str(t)).strip().lower()
        if not t:
            continue
        if len(t) > 40:
            raise LibraryError("A tag can be at most 40 characters")
        if t not in out:
            out.append(t)
    if len(out) > 20:
        raise LibraryError("At most 20 tags per note")
    return out


LINK_KINDS = {"species": "Pokémon", "item": "Item", "location": "Location", "guide": "Guide", "guide_step": "Guide step",
              "owned": "Box entry", "breeding_plan": "Breeding plan", "note": "Note", "custom_guide": "Custom guide"}


def _links(v: Any) -> list[dict]:
    if v is None:
        return []
    if not isinstance(v, list) or len(v) > 50:
        raise LibraryError("links must be a list of at most 50 entries")
    out = []
    for l in v:
        if not isinstance(l, dict) or l.get("kind") not in LINK_KINDS:
            raise LibraryError(f"Unknown link kind: {l.get('kind') if isinstance(l, dict) else l}")
        r = str(l.get("ref", "")).strip()
        if not r or len(r) > 80:
            raise LibraryError("Link reference missing")
        out.append({"kind": l["kind"], "ref": r, "label": _text(l.get("label"), "link label", 120)})
    return out


# ================================================================== notes
class NotesService:
    STATES = ("active", "archived", "trash", "all")

    def __init__(self, storage: Storage):
        self.db = storage

    def _row(self, r: dict, links: dict[str, list] | None = None) -> dict:
        out = {**r, "tags": json.loads(r["tags"] or "[]"), "pinned": bool(r["pinned"])}
        out["links"] = (links.get(r["id"]) or []) if links is not None else self.links(r["id"])
        out["state"] = "trash" if r["deleted_at"] else "archived" if r["archived_at"] else "active"
        return out

    def links(self, note_id: str) -> list[dict]:
        return self.db.query("SELECT kind, ref, label FROM note_links WHERE note_id=? ORDER BY created_at", (note_id,))

    def list(self, q: str = "", tag: str = "", state: str = "active", kind: str = "", ref_: str = "") -> dict:
        if state not in self.STATES:
            raise LibraryError("state must be active, archived, trash or all")
        where, params = [], []
        if state == "active":
            where.append("deleted_at IS NULL AND archived_at IS NULL")
        elif state == "archived":
            where.append("deleted_at IS NULL AND archived_at IS NOT NULL")
        elif state == "trash":
            where.append("deleted_at IS NOT NULL")
        if kind and ref_:
            where.append("id IN (SELECT note_id FROM note_links WHERE kind=? AND ref=?)")
            params += [kind, ref_]
        rows = self.db.query("SELECT * FROM lib_notes" + (" WHERE " + " AND ".join(where) if where else "") +
                             " ORDER BY pinned DESC, updated_at DESC", params)
        links: dict[str, list] = {}
        for l in self.db.query("SELECT note_id, kind, ref, label FROM note_links ORDER BY created_at"):
            links.setdefault(l["note_id"], []).append({"kind": l["kind"], "ref": l["ref"], "label": l["label"]})
        notes = [self._row(r, links) for r in rows]
        if tag:
            notes = [n for n in notes if tag.lower() in n["tags"]]
        if q:
            terms = q.lower().split()
            notes = [n for n in notes if all(t in (n["title"] + "\n" + n["body"] + "\n" + " ".join(n["tags"]) + "\n" +
                                                   " ".join((l["label"] or "") for l in n["links"])).lower() for t in terms)]
        tags: dict[str, int] = {}
        for r in self.db.query("SELECT tags FROM lib_notes WHERE deleted_at IS NULL"):
            for t in json.loads(r["tags"] or "[]"):
                tags[t] = tags.get(t, 0) + 1
        counts = self.db.query_one("SELECT SUM(deleted_at IS NULL AND archived_at IS NULL) a, "
                                   "SUM(deleted_at IS NULL AND archived_at IS NOT NULL) r, SUM(deleted_at IS NOT NULL) t FROM lib_notes") or {}
        return {"notes": notes, "tags": sorted(tags.items(), key=lambda x: (-x[1], x[0])),
                "counts": {"active": counts.get("a") or 0, "archived": counts.get("r") or 0, "trash": counts.get("t") or 0}}

    def get(self, nid: str) -> dict:
        r = self.db.query_one("SELECT * FROM lib_notes WHERE id=?", (nid,))
        if not r:
            raise KeyError(nid)
        return self._row(r)

    def create(self, body: dict) -> dict:
        now = utcnow()
        nid = _id()
        title = _text(body.get("title"), "title", 200)
        text = _text(body.get("body"), "body", 200_000)
        tags = _tags(body.get("tags"))
        links = _links(body.get("links"))
        with self.db.tx() as c:
            c.execute("INSERT INTO lib_notes(id, title, body, tags, pinned, colour, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?)",
                      (nid, title, text, json.dumps(tags), int(bool(body.get("pinned"))), body.get("colour"), now, now))
            for l in links:
                c.execute("INSERT OR IGNORE INTO note_links(note_id, kind, ref, label, created_at) VALUES(?,?,?,?,?)",
                          (nid, l["kind"], l["ref"], l["label"], now))
        return self.get(nid)

    def update(self, nid: str, body: dict) -> dict:
        cur = self.get(nid)
        if cur["state"] == "trash":
            raise LibraryError("Restore the note from the trash before editing it")
        fields: dict[str, Any] = {}
        if "title" in body:
            fields["title"] = _text(body["title"], "title", 200)
        if "body" in body:
            fields["body"] = _text(body["body"], "body", 200_000)
        if "tags" in body:
            fields["tags"] = json.dumps(_tags(body["tags"]))
        if "pinned" in body:
            fields["pinned"] = int(bool(body["pinned"]))
        if "colour" in body:
            col = body["colour"]
            if col is not None and not re.fullmatch(r"(red|orange|yellow|green|blue|purple|grey)", str(col)):
                raise LibraryError("Unknown note colour")
            fields["colour"] = col
        now = utcnow()
        with self.db.tx() as c:
            if fields:
                fields["updated_at"] = now
                c.execute("UPDATE lib_notes SET " + ", ".join(f"{k}=?" for k in fields) + " WHERE id=?", (*fields.values(), nid))
            if "links" in body:
                links = _links(body["links"])
                c.execute("DELETE FROM note_links WHERE note_id=?", (nid,))
                for l in links:
                    c.execute("INSERT OR IGNORE INTO note_links(note_id, kind, ref, label, created_at) VALUES(?,?,?,?,?)",
                              (nid, l["kind"], l["ref"], l["label"], now))
                c.execute("UPDATE lib_notes SET updated_at=? WHERE id=?", (now, nid))
        return self.get(nid)

    def add_link(self, nid: str, link: dict) -> dict:
        l = _links([link])[0]
        self.get(nid)
        self.db.execute("INSERT OR IGNORE INTO note_links(note_id, kind, ref, label, created_at) VALUES(?,?,?,?,?)",
                        (nid, l["kind"], l["ref"], l["label"], utcnow()))
        self.db.execute("UPDATE lib_notes SET updated_at=? WHERE id=?", (utcnow(), nid))
        return self.get(nid)

    def remove_link(self, nid: str, kind: str, ref_: str) -> dict:
        self.db.execute("DELETE FROM note_links WHERE note_id=? AND kind=? AND ref=?", (nid, kind, ref_))
        return self.get(nid)

    def set_state(self, nid: str, action: str) -> dict:
        self.get(nid)
        now = utcnow()
        sql = {"archive": "UPDATE lib_notes SET archived_at=?, updated_at=? WHERE id=?",
               "unarchive": "UPDATE lib_notes SET archived_at=NULL, updated_at=? WHERE id=?",
               "trash": "UPDATE lib_notes SET deleted_at=?, updated_at=? WHERE id=?",
               "restore": "UPDATE lib_notes SET deleted_at=NULL, updated_at=? WHERE id=?"}.get(action)
        if not sql:
            raise LibraryError("Unknown action")
        self.db.execute(sql, (now, now, nid) if sql.count("?") == 3 else (now, nid))
        return self.get(nid)

    def purge(self, nid: str) -> bool:
        cur = self.get(nid)
        if cur["state"] != "trash":
            raise LibraryError("Only notes in the trash can be deleted permanently")
        with self.db.tx() as c:
            c.execute("DELETE FROM note_links WHERE note_id=?", (nid,))
            c.execute("DELETE FROM lib_notes WHERE id=?", (nid,))
        return True

    def duplicate(self, nid: str) -> dict:
        cur = self.get(nid)
        return self.create({"title": (cur["title"] or "Untitled") + " (copy)", "body": cur["body"], "tags": cur["tags"],
                            "links": cur["links"]})

    def export_markdown(self, ids: list[str] | None = None) -> str:
        notes = [self.get(i) for i in ids] if ids else self.list(state="all")["notes"]
        parts = []
        for n in notes:
            meta = [f"tags: [{', '.join(n['tags'])}]"] if n["tags"] else []
            meta += [f"state: {n['state']}", f"created: {n['created_at']}", f"updated: {n['updated_at']}"]
            if n["links"]:
                meta.append("links: " + "; ".join(f"{l['kind']}:{l['ref']}" + (f" ({l['label']})" if l["label"] else "") for l in n["links"]))
            parts.append(f"# {n['title'] or 'Untitled'}\n\n<!-- " + " | ".join(meta) + " -->\n\n" + n["body"].rstrip() + "\n")
        return "\n---\n\n".join(parts)


# ===================================================================== box
GENDERS = ("male", "female", "genderless", "unknown")
OBTAIN_METHODS = ("", "wild", "horde", "fishing", "raid", "egg", "trade", "gtl", "gift", "event", "fossil", "roamer", "other")
BOX_STATUS = ("kept", "traded", "sold", "released", "archived")
STAT_KEYS = [k for k in ref.STATS]
NATURE_NAMES = {n["name"] for n in ref.natures_table()} if hasattr(ref, "natures_table") else set()


def _opt_int(v: Any, field: str, lo: int, hi: int) -> int | None:
    if v in (None, ""):
        return None
    try:
        i = int(v)
    except (TypeError, ValueError):
        raise LibraryError(f"{field} must be a whole number")
    if i < lo or i > hi:
        raise LibraryError(f"{field} must be between {lo} and {hi}")
    return i


def validate_owned(d: dict, dex) -> dict:
    sid = _opt_int(d.get("species_id"), "species", 1, 649)
    if sid is None:
        raise LibraryError("Choose a species")
    ivs = {k: _opt_int((d.get("ivs") or {}).get(k), f"IV {k}", 0, 31) for k in STAT_KEYS}
    evs = {k: _opt_int((d.get("evs") or {}).get(k), f"EV {k}", 0, 252) for k in STAT_KEYS}
    if sum(v for v in evs.values() if v) > 510:
        raise LibraryError("EV total cannot exceed 510")
    moves = d.get("moves") or []
    if not isinstance(moves, list) or len(moves) > 4:
        raise LibraryError("A Pokémon can have at most 4 moves")
    nature = _text(d.get("nature"), "nature", 20)
    if nature and NATURE_NAMES and nature not in NATURE_NAMES:
        raise LibraryError(f"Unknown nature: {nature}")
    gender = d.get("gender") or "unknown"
    if gender not in GENDERS:
        raise LibraryError("Unknown gender")
    method = d.get("method") or ""
    if method not in OBTAIN_METHODS:
        raise LibraryError("Unknown obtain method")
    region = (d.get("region") or "").lower()
    if region and region not in ref.REGIONS:
        raise LibraryError("Unknown region")
    od = d.get("obtained_date") or ""
    if od:
        try:
            date.fromisoformat(od)
        except ValueError:
            raise LibraryError("Obtained date must be YYYY-MM-DD")
    return {
        "species_id": sid, "nickname": _text(d.get("nickname"), "nickname", 24), "form": _text(d.get("form"), "form", 40),
        "gender": gender, "shiny": bool(d.get("shiny")), "secret_shiny": bool(d.get("secret_shiny")), "alpha": bool(d.get("alpha")),
        "level": _opt_int(d.get("level"), "level", 1, 100), "nature": nature, "ability": _text(d.get("ability"), "ability", 40),
        "held_item_id": _opt_int(d.get("held_item_id"), "held item", -1, 99999), "ivs": ivs, "evs": evs,
        "moves": [_text(m, "move", 40) for m in moves if str(m).strip()], "ot": _text(d.get("ot"), "OT", 24),
        "obtained_date": od, "region": region, "location": _text(d.get("location"), "location", 80), "method": method,
        "encounter_count": _opt_int(d.get("encounter_count"), "encounter count", 0, 10_000_000),
        "tags": _tags(d.get("tags")), "notes": _text(d.get("notes"), "notes", 5000),
        "media_id": (str(d["media_id"])[:24] if d.get("media_id") else None),
    }


class BoxService:
    def __init__(self, storage: Storage, dex):
        self.db, self.dex = storage, dex

    def _row(self, r: dict) -> dict:
        data = json.loads(r["data"] or "{}")
        return {"id": r["id"], "run_id": r["run_id"], "species_id": r["species_id"], "status": r["status"],
                "showcase_ok": bool(r["showcase_ok"]), "created_at": r["created_at"], "updated_at": r["updated_at"],
                "deleted_at": r["deleted_at"], **data, "species_name": self.dex.name(r["species_id"]),
                "icon": self.dex.sprite_url(r["species_id"], "icon_shiny" if data.get("shiny") else "icon") or self.dex.sprite_url(r["species_id"]),
                "front": self.dex.sprite_url(r["species_id"], "front_shiny" if data.get("shiny") else "front") or self.dex.sprite_url(r["species_id"], "front"),
                "media_url": f"/media/{data['media_id']}" if data.get("media_id") else None,
                "iv_total": sum(v for v in (data.get("ivs") or {}).values() if v is not None) if any(
                    v is not None for v in (data.get("ivs") or {}).values()) else None}

    def list(self, run_id: str | None = None, include_deleted: bool = False) -> list[dict]:
        where, p = [], []
        if not include_deleted:
            where.append("deleted_at IS NULL")
        if run_id:
            where.append("run_id=?")
            p.append(run_id)
        rows = self.db.query("SELECT * FROM owned_pokemon" + (" WHERE " + " AND ".join(where) if where else "") +
                             " ORDER BY updated_at DESC", p)
        return [self._row(r) for r in rows]

    def get(self, oid: str) -> dict:
        r = self.db.query_one("SELECT * FROM owned_pokemon WHERE id=?", (oid,))
        if not r:
            raise KeyError(oid)
        return self._row(r)

    def _run_ok(self, run_id: str | None) -> str | None:
        if not run_id:
            return None
        if not self.db.query_one("SELECT id FROM runs WHERE id=? AND deleted_at IS NULL", (run_id,)):
            raise LibraryError("Unknown character run")
        return run_id

    def save(self, body: dict, oid: str | None = None) -> dict:
        data = validate_owned(body, self.dex)
        status = body.get("status") or "kept"
        if status not in BOX_STATUS:
            raise LibraryError("Unknown status")
        run_id = self._run_ok(body.get("run_id"))
        sid = data.pop("species_id")
        now = utcnow()
        if oid:
            self.get(oid)
            self.db.execute("UPDATE owned_pokemon SET run_id=?, species_id=?, data=?, status=?, showcase_ok=?, updated_at=? WHERE id=?",
                            (run_id, sid, json.dumps(data, ensure_ascii=False), status, int(body.get("showcase_ok", True)), now, oid))
        else:
            oid = _id()
            self.db.execute("INSERT INTO owned_pokemon(id, run_id, species_id, data, status, showcase_ok, created_at, updated_at) "
                            "VALUES(?,?,?,?,?,?,?,?)", (oid, run_id, sid, json.dumps(data, ensure_ascii=False), status,
                                                        int(body.get("showcase_ok", True)), now, now))
        return self.get(oid)

    def delete(self, oid: str) -> dict:
        self.get(oid)
        self.db.execute("UPDATE owned_pokemon SET deleted_at=?, updated_at=? WHERE id=?", (utcnow(), utcnow(), oid))
        return self.get(oid)

    def restore(self, oid: str) -> dict:
        self.db.execute("UPDATE owned_pokemon SET deleted_at=NULL, updated_at=? WHERE id=?", (utcnow(), oid))
        return self.get(oid)

    def sync_dex(self, oid: str, run_id: str, status: str) -> dict:
        """Explicit, user-confirmed copy of one entry into the manual Pokédex registration. Returns the previous value."""
        if status not in ("seen", "owned", "caught_ot"):
            raise LibraryError("status must be seen, owned or caught_ot")
        self._run_ok(run_id)
        e = self.get(oid)
        prev = self.db.query_one("SELECT * FROM dex_progress WHERE run_id=? AND species_id=?", (run_id, e["species_id"]))
        flags = {"caught_alpha": int(bool(e.get("alpha")) or bool(prev and prev["caught_alpha"])),
                 "owned_shiny": int(bool(e.get("shiny")) or bool(prev and prev["owned_shiny"])),
                 "owned_costume": int(bool(prev and prev["owned_costume"]))}
        self.db.execute("INSERT INTO dex_progress(run_id, species_id, status, caught_alpha, owned_shiny, owned_costume, updated_at) "
                        "VALUES(?,?,?,?,?,?,?) ON CONFLICT(run_id, species_id) DO UPDATE SET status=excluded.status, "
                        "caught_alpha=excluded.caught_alpha, owned_shiny=excluded.owned_shiny, updated_at=excluded.updated_at",
                        (run_id, e["species_id"], status, flags["caught_alpha"], flags["owned_shiny"], flags["owned_costume"], utcnow()))
        return {"species_id": e["species_id"], "previous": prev and {k: prev[k] for k in ("status", "caught_alpha", "owned_shiny", "owned_costume")},
                "now": {"status": status, **flags}}


# ================================================================ showcase
TEMPLATES = ("minimal", "grid", "featured")
SHOW_FIELDS = ("nickname", "level", "nature", "ivs", "encounter_count", "method", "date", "ot", "location")
DEFAULT_SHOW = {"nickname": True, "level": False, "nature": False, "ivs": False, "encounter_count": False,
                "method": False, "date": False, "ot": False, "location": False}


def validate_showcase(body: dict) -> dict:
    tpl = body.get("template") or "grid"
    if tpl not in TEMPLATES:
        raise LibraryError("Unknown template")
    entries = body.get("entries") or []
    if not isinstance(entries, list) or len(entries) > 60:
        raise LibraryError("A showcase can hold at most 60 entries")
    opt = body.get("options") or {}
    show = {k: bool((opt.get("show") or {}).get(k, DEFAULT_SHOW[k])) for k in SHOW_FIELDS}
    motion = opt.get("motion") or "none"
    if motion not in ("none", "float", "sheen"):
        raise LibraryError("Unknown motion")
    bg = opt.get("background") or "panel"
    if bg not in ("panel", "transparent", "dark", "light"):
        raise LibraryError("Unknown background")
    return {"name": _text(body.get("name") or "My showcase", "name", 80, True), "template": tpl,
            "entries": [str(e)[:24] for e in entries],
            "options": {"title": _text(opt.get("title"), "title", 80), "show": show, "motion": motion, "background": bg,
                        "bg_opacity": _opt_int(opt.get("bg_opacity", 85), "background opacity", 0, 100),
                        "cycle_seconds": _opt_int(opt.get("cycle_seconds", 0), "cycle seconds", 0, 600),
                        "columns": _opt_int(opt.get("columns", 4), "columns", 1, 10), "big_sprites": bool(opt.get("big_sprites", True))}}


class ShowcaseService:
    def __init__(self, storage: Storage, box: BoxService):
        self.db, self.box = storage, box

    def _row(self, r: dict, resolve: bool = False) -> dict:
        out = {**r, "entries": json.loads(r["entries"]), "options": json.loads(r["options"])}
        if resolve:
            items = []
            for oid in out["entries"]:
                try:
                    e = self.box.get(oid)
                except KeyError:
                    continue
                if e["deleted_at"] or not e["showcase_ok"]:
                    continue
                show = out["options"]["show"]
                items.append({"id": e["id"], "species_id": e["species_id"], "species_name": e["species_name"], "icon": e["icon"],
                              "front": e["front"], "shiny": e.get("shiny"), "secret_shiny": e.get("secret_shiny"), "alpha": e.get("alpha"),
                              "nickname": e.get("nickname") if show["nickname"] else None,
                              "level": e.get("level") if show["level"] else None, "nature": e.get("nature") if show["nature"] else None,
                              "ivs": e.get("ivs") if show["ivs"] else None, "iv_total": e.get("iv_total") if show["ivs"] else None,
                              "encounter_count": e.get("encounter_count") if show["encounter_count"] else None,
                              "method": e.get("method") if show["method"] else None, "date": e.get("obtained_date") if show["date"] else None,
                              "ot": e.get("ot") if show["ot"] else None, "location": e.get("location") if show["location"] else None,
                              "media_url": e.get("media_url")})
            out["items"] = items
        return out

    def list(self) -> list[dict]:
        return [self._row(r) for r in self.db.query("SELECT * FROM showcases ORDER BY updated_at DESC")]

    def get(self, sid: str, resolve: bool = True) -> dict:
        r = self.db.query_one("SELECT * FROM showcases WHERE id=?", (sid,))
        if not r:
            raise KeyError(sid)
        return self._row(r, resolve)

    def save(self, body: dict, sid: str | None = None) -> dict:
        v = validate_showcase(body)
        now = utcnow()
        if sid:
            self.get(sid, False)
            self.db.execute("UPDATE showcases SET name=?, template=?, entries=?, options=?, updated_at=? WHERE id=?",
                            (v["name"], v["template"], json.dumps(v["entries"]), json.dumps(v["options"]), now, sid))
        else:
            sid = _id()
            self.db.execute("INSERT INTO showcases(id, name, template, entries, options, created_at, updated_at) VALUES(?,?,?,?,?,?,?)",
                            (sid, v["name"], v["template"], json.dumps(v["entries"]), json.dumps(v["options"]), now, now))
        return self.get(sid)

    def delete(self, sid: str) -> bool:
        return self.db.execute("DELETE FROM showcases WHERE id=?", (sid,)) > 0


# ============================================================ custom guides
SCOPES = {"gym_rerun": "Gym rerun", "elite_four": "Elite Four rerun", "money": "Money-making", "farming": "Farming",
          "shiny": "Shiny hunting", "daily": "Daily routine", "item_hunt": "Item hunt", "seasonal": "Seasonal event",
          "breeding": "Breeding routine", "hunting": "Hunting plan", "storyline": "Storyline", "custom": "Custom"}
STEP_KINDS = ("heading", "check", "text")


def parse_guide_text(text: str) -> list[dict]:
    """Markdown/plain text → steps. '#' headings, '- [ ]'/'- '/'1.' checklist items, other lines as text."""
    steps = []
    for raw in text.replace("\r\n", "\n").split("\n"):
        line = raw.rstrip()
        if not line.strip():
            continue
        indent = (len(line) - len(line.lstrip(" \t"))) // 2
        s = line.strip()
        m = re.match(r"^(#{1,6})\s+(.*)$", s)
        if m:
            steps.append({"kind": "heading", "depth": 0, "text": m.group(2).strip()})
            continue
        m = re.match(r"^(?:[-*+]\s+\[(?: |x|X)\]\s+|[-*+]\s+|\d+[.)]\s+)(.*)$", s)
        if m:
            steps.append({"kind": "check", "depth": min(indent, 3), "text": m.group(1).strip()})
            continue
        steps.append({"kind": "text", "depth": min(indent, 3), "text": s})
    return steps[:2000]


class CustomGuideService:
    def __init__(self, storage: Storage):
        self.db = storage

    def _guide(self, r: dict) -> dict:
        return {**r, "recurring": bool(r["recurring"]), "scope_label": SCOPES.get(r["scope"], r["scope"])}

    def list(self, include_archived: bool = False) -> list[dict]:
        rows = self.db.query("SELECT * FROM custom_guides" + ("" if include_archived else " WHERE archived_at IS NULL") +
                             " ORDER BY updated_at DESC")
        out = []
        for r in rows:
            g = self._guide(r)
            cnt = self.db.query_one("SELECT COUNT(*) n FROM custom_guide_steps WHERE guide_id=? AND kind='check'", (r["id"],))["n"]
            cyc = self.active_cycle(r["id"], create=False)
            done = self.db.query_one("SELECT COUNT(*) n FROM guide_cycle_marks WHERE cycle_id=?", (cyc["id"],))["n"] if cyc else 0
            g.update(checks=cnt, done=done, cycle_number=cyc["number"] if cyc else 0,
                     cycles_completed=self.db.query_one("SELECT COUNT(*) n FROM guide_cycles WHERE guide_id=? AND completed_at IS NOT NULL",
                                                        (r["id"],))["n"])
            out.append(g)
        return out

    def get(self, gid: str) -> dict:
        r = self.db.query_one("SELECT * FROM custom_guides WHERE id=?", (gid,))
        if not r:
            raise KeyError(gid)
        g = self._guide(r)
        steps = self.db.query("SELECT * FROM custom_guide_steps WHERE guide_id=? ORDER BY position", (gid,))
        cyc = self.active_cycle(gid, create=False)
        marks = {m["step_id"]: m["done_at"] for m in self.db.query("SELECT * FROM guide_cycle_marks WHERE cycle_id=?", (cyc["id"],))} if cyc else {}
        g["steps"] = [{**s, "links": json.loads(s["links"] or "[]"), "done_at": marks.get(s["id"]),
                       "media_url": f"/media/{s['media_id']}" if s["media_id"] else None} for s in steps]
        g["cycle"] = cyc
        g["history"] = [{**c, "done": self.db.query_one("SELECT COUNT(*) n FROM guide_cycle_marks WHERE cycle_id=?", (c["id"],))["n"]}
                        for c in self.db.query("SELECT * FROM guide_cycles WHERE guide_id=? ORDER BY number DESC", (gid,))]
        g["checks"] = sum(1 for s in steps if s["kind"] == "check")
        g["done"] = sum(1 for s in g["steps"] if s["kind"] == "check" and s["done_at"])
        return g

    def _meta(self, body: dict) -> dict:
        scope = body.get("scope") or "custom"
        if scope not in SCOPES:
            raise LibraryError("Unknown guide type")
        region = (body.get("region") or "").lower() or None
        if region and region not in ref.REGIONS:
            raise LibraryError("Unknown region")
        return {"title": _text(body.get("title"), "title", 120, True), "scope": scope, "region": region,
                "location": _text(body.get("location"), "location", 80) or None, "recurring": int(bool(body.get("recurring"))),
                "description": _text(body.get("description"), "description", 4000)}

    def create(self, body: dict) -> dict:
        m = self._meta(body)
        gid = _id()
        now = utcnow()
        self.db.execute("INSERT INTO custom_guides(id, title, scope, region, location, recurring, description, source, created_at, updated_at) "
                        "VALUES(?,?,?,?,?,?,?,?,?,?)", (gid, m["title"], m["scope"], m["region"], m["location"], m["recurring"],
                                                       m["description"], _text(body.get("source"), "source", 200) or None, now, now))
        if body.get("steps"):
            self.put_steps(gid, body["steps"])
        return self.get(gid)

    def update(self, gid: str, body: dict) -> dict:
        cur = self.get(gid)
        m = self._meta({**cur, **body})
        self.db.execute("UPDATE custom_guides SET title=?, scope=?, region=?, location=?, recurring=?, description=?, updated_at=? WHERE id=?",
                        (m["title"], m["scope"], m["region"], m["location"], m["recurring"], m["description"], utcnow(), gid))
        return self.get(gid)

    def put_steps(self, gid: str, steps: list) -> dict:
        """Replace the step list (editor save). Existing step IDs are kept so cycle marks survive edits/reorders."""
        self.get(gid)
        if not isinstance(steps, list) or len(steps) > 2000:
            raise LibraryError("A guide can have at most 2000 steps")
        existing = {r["id"] for r in self.db.query("SELECT id FROM custom_guide_steps WHERE guide_id=?", (gid,))}
        now = utcnow()
        keep: list[str] = []
        with self.db.tx() as c:
            for pos, s in enumerate(steps):
                kind = s.get("kind") or "check"
                if kind not in STEP_KINDS:
                    raise LibraryError("Unknown step kind")
                depth = _opt_int(s.get("depth", 0), "indent", 0, 3) or 0
                text = _text(s.get("text"), "step text", 4000)
                links = json.dumps(_links(s.get("links")))
                media = str(s["media_id"])[:24] if s.get("media_id") else None
                sid = s.get("id") if s.get("id") in existing else _id()
                keep.append(sid)
                if sid in existing:
                    c.execute("UPDATE custom_guide_steps SET position=?, depth=?, kind=?, text=?, links=?, media_id=?, updated_at=? WHERE id=?",
                              (pos, depth, kind, text, links, media, now, sid))
                else:
                    c.execute("INSERT INTO custom_guide_steps(id, guide_id, position, depth, kind, text, links, media_id, created_at, updated_at) "
                              "VALUES(?,?,?,?,?,?,?,?,?,?)", (sid, gid, pos, depth, kind, text, links, media, now, now))
            gone = existing - set(keep)
            for sid in gone:
                c.execute("DELETE FROM custom_guide_steps WHERE id=?", (sid,))
                c.execute("DELETE FROM guide_cycle_marks WHERE step_id=?", (sid,))
            c.execute("UPDATE custom_guides SET updated_at=? WHERE id=?", (now, gid))
        return self.get(gid)

    def active_cycle(self, gid: str, create: bool = True) -> dict | None:
        c = self.db.query_one("SELECT * FROM guide_cycles WHERE guide_id=? AND completed_at IS NULL ORDER BY number DESC LIMIT 1", (gid,))
        if c or not create:
            return c
        n = (self.db.query_one("SELECT MAX(number) n FROM guide_cycles WHERE guide_id=?", (gid,))["n"] or 0) + 1
        cid = _id()
        self.db.execute("INSERT INTO guide_cycles(id, guide_id, number, started_at) VALUES(?,?,?,?)", (cid, gid, n, utcnow()))
        return self.db.query_one("SELECT * FROM guide_cycles WHERE id=?", (cid,))

    def mark(self, gid: str, step_id: str, done: bool) -> dict:
        if not self.db.query_one("SELECT id FROM custom_guide_steps WHERE id=? AND guide_id=?", (step_id, gid)):
            raise KeyError(step_id)
        cyc = self.active_cycle(gid)
        if done:
            self.db.execute("INSERT OR IGNORE INTO guide_cycle_marks(cycle_id, step_id, done_at) VALUES(?,?,?)", (cyc["id"], step_id, utcnow()))
        else:
            self.db.execute("DELETE FROM guide_cycle_marks WHERE cycle_id=? AND step_id=?", (cyc["id"], step_id))
        self.db.execute("UPDATE custom_guides SET updated_at=? WHERE id=?", (utcnow(), gid))
        return self.get(gid)

    def complete_cycle(self, gid: str, note: str = "", start_next: bool = True) -> dict:
        g = self.get(gid)
        cyc = self.active_cycle(gid)
        self.db.execute("UPDATE guide_cycles SET completed_at=?, note=? WHERE id=?", (utcnow(), _text(note, "note", 500) or None, cyc["id"]))
        if start_next and g["recurring"]:
            self.active_cycle(gid)
        return self.get(gid)

    def archive(self, gid: str, archived: bool = True) -> dict:
        self.db.execute("UPDATE custom_guides SET archived_at=?, updated_at=? WHERE id=?", (utcnow() if archived else None, utcnow(), gid))
        return self.get(gid)

    def delete(self, gid: str) -> bool:
        with self.db.tx() as c:
            for cy in c.execute("SELECT id FROM guide_cycles WHERE guide_id=?", (gid,)).fetchall():
                c.execute("DELETE FROM guide_cycle_marks WHERE cycle_id=?", (cy[0],))
            c.execute("DELETE FROM guide_cycles WHERE guide_id=?", (gid,))
            c.execute("DELETE FROM custom_guide_steps WHERE guide_id=?", (gid,))
            n = c.execute("DELETE FROM custom_guides WHERE id=?", (gid,)).rowcount
        return n > 0

    def export_markdown(self, gid: str) -> str:
        g = self.get(gid)
        lines = [f"# {g['title']}", "", f"<!-- type: {g['scope_label']}" + (f" | region: {g['region']}" if g["region"] else "") + " -->", ""]
        if g["description"]:
            lines += [g["description"], ""]
        for s in g["steps"]:
            pad = "  " * s["depth"]
            if s["kind"] == "heading":
                lines += ["", f"## {s['text']}"]
            elif s["kind"] == "check":
                lines.append(f"{pad}- [{'x' if s['done_at'] else ' '}] {s['text']}")
            else:
                lines.append(f"{pad}{s['text']}")
        return "\n".join(lines).strip() + "\n"


# ================================================================== media
MEDIA_TYPES = {b"\x89PNG\r\n\x1a\n": ("image/png", "png"), b"\xff\xd8\xff": ("image/jpeg", "jpg"),
               b"GIF87a": ("image/gif", "gif"), b"GIF89a": ("image/gif", "gif")}
MAX_MEDIA = 5 * 1024 * 1024


class MediaService:
    def __init__(self, storage: Storage, paths: Paths):
        self.db, self.paths = storage, paths
        self.dir = paths.media
        self.dir.mkdir(parents=True, exist_ok=True)

    def add(self, filename: str, data_b64: str, label: str = "") -> dict:
        try:
            data = base64.b64decode(data_b64 or "", validate=True)
        except (ValueError, TypeError):
            raise LibraryError("Image data is not valid base64")
        if len(data) > MAX_MEDIA:
            raise LibraryError("Images can be at most 5 MB")
        kind = next((v for k, v in MEDIA_TYPES.items() if data.startswith(k)), None)
        if not kind and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            kind = ("image/webp", "webp")
        if not kind:
            raise LibraryError("Only PNG, JPEG, GIF or WebP images can be attached")
        mid = _id()
        (self.dir / f"{mid}.{kind[1]}").write_bytes(data)
        self.db.execute("INSERT INTO media(id, filename, mime, bytes, sha256, label, created_at) VALUES(?,?,?,?,?,?,?)",
                        (mid, _text(filename, "filename", 200) or f"image.{kind[1]}", kind[0], len(data), hashlib.sha256(data).hexdigest(),
                         _text(label, "label", 200), utcnow()))
        return {"id": mid, "url": f"/media/{mid}", "mime": kind[0], "bytes": len(data)}

    def path(self, mid: str):
        if not re.fullmatch(r"[0-9a-f]{12}", mid or ""):
            return None
        r = self.db.query_one("SELECT * FROM media WHERE id=?", (mid,))
        if not r:
            return None
        ext = {"image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp"}[r["mime"]]
        p = self.dir / f"{mid}.{ext}"
        return (p, r["mime"]) if p.is_file() else None

    def delete(self, mid: str) -> bool:
        found = self.path(mid)
        if found:
            found[0].unlink(missing_ok=True)
        return self.db.execute("DELETE FROM media WHERE id=?", (mid,)) > 0


# ============================================================ observations
OBS_METRICS = ("seen", "owned", "caught_ot", "caught_alpha", "owned_shiny", "costume")


def validate_observation(body: dict) -> dict:
    od = body.get("observed_at") or date.today().isoformat()
    try:
        date.fromisoformat(od)
    except ValueError:
        raise LibraryError("Date must be YYYY-MM-DD")
    counters = {}
    for k in OBS_METRICS:
        v = (body.get("counters") or {}).get(k) or {}
        have = _opt_int(v.get("have"), f"{k} value", 0, 5000)
        mx = _opt_int(v.get("max"), f"{k} maximum", 0, 5000)
        if have is not None and mx is not None and have > mx:
            raise LibraryError(f"{k}: value cannot exceed the maximum shown")
        if have is not None or mx is not None:
            counters[k] = {"have": have, "max": mx}
    if not counters:
        raise LibraryError("Enter at least one counter as shown in your game")
    return {"observed_at": od, "counters": counters, "client_note": _text(body.get("client_note"), "note", 300)}
