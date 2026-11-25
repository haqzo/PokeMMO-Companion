"""Websites & links: user-managed external bookmarks (docs/design/20 §A).

Bookmarks are plain links opened in the user's default browser. Nothing is fetched, embedded,
scraped or proxied. Only https:// URLs are accepted; everything else (javascript:, data:, file:,
custom protocols, credentials in the URL) is rejected.
"""
from __future__ import annotations

import ipaddress
import re
import uuid
from urllib.parse import urlsplit, urlunsplit

from ..config import ALPHAPEDIA_DISCORD_URL, ALPHAPEDIA_URL
from ..storage import Storage, utcnow

ORIGINAL_DEFAULTS = [
    {"seed_key": "forums", "title": "PokeMMO Forums", "url": "https://forums.pokemmo.com/", "category": "Official",
     "description": "Official forums: announcements, changelogs, guides and community threads."},
    {"seed_key": "official", "title": "PokeMMO", "url": "https://pokemmo.com/", "category": "Official",
     "description": "Official website and downloads."},
    {"seed_key": "support", "title": "PokeMMO Support", "url": "https://support.pokemmo.com/", "category": "Official",
     "description": "Official help centre and support tickets."},
    {"seed_key": "synergy", "title": "Team Synergy", "url": "https://synergymmo.com/", "category": "Community",
     "description": "Community Pokédex and guides (external website)."},
    {"seed_key": "hub", "title": "PokeMMO Hub", "url": "https://pokemmohub.com/", "category": "Community",
     "description": "Community tools website (external link only — the Companion uses no Hub data or API)."},
]
PROJECT_DEFAULTS = [
    {"seed_key": "haqzo-rom-patch-manager", "title": "ROM Patch Manager", "url": "https://haqzo.github.io/Rom-Patch-Manager/",
     "category": "Projects by Haqzo", "description": "Manage and apply patches to your own ROM files."},
    {"seed_key": "haqzo-better-default", "title": "Better Default", "url": "https://forums.pokemmo.com/index.php?/topic/201443/",
     "category": "Projects by Haqzo", "description": "A refreshed take on PokeMMO’s default theme."},
    {"seed_key": "haqzo-better-items", "title": "Better Items", "url": "https://forums.pokemmo.com/index.php?/topic/201627/",
     "category": "Projects by Haqzo", "description": "A PokeMMO mod that updates the look of item icons."},
]
ALPHAPEDIA_DEFAULTS = [
    {"seed_key": "alphapedia", "title": "Alphapedia", "url": ALPHAPEDIA_URL, "category": "Community",
     "description": "Alpha and Swarm reports and a Unova Phenomenon reference."},
    {"seed_key": "alphapedia-discord", "title": "Alphapedia Discord", "url": ALPHAPEDIA_DISCORD_URL, "category": "Community",
     "description": "The official Discord for the Alphapedia community tool."},
]
DEFAULTS = ORIGINAL_DEFAULTS + PROJECT_DEFAULTS + ALPHAPEDIA_DEFAULTS
SEED_BATCHES = (("bookmarks_seeded", ORIGINAL_DEFAULTS), ("bookmarks_projects_seeded", PROJECT_DEFAULTS),
                ("bookmarks_alphapedia_seeded", ALPHAPEDIA_DEFAULTS))
MAX_URL = 2048


class BookmarkError(ValueError):
    pass


def normalize_url(raw: str) -> str:
    """Return a safe, normalized https URL or raise BookmarkError."""
    s = (raw or "").strip()
    if not s:
        raise BookmarkError("Enter a web address")
    if len(s) > MAX_URL:
        raise BookmarkError("That address is too long")
    if re.search(r"[\x00-\x20\x7f<>\"`\\\\]", s):
        raise BookmarkError("The address contains spaces or characters that are not allowed")
    if "://" not in s:
        if re.match(r"^[a-z][a-z0-9+.-]*:", s, re.I) and not re.match(r"^[^:/]+:\d+(/|$)", s):
            raise BookmarkError("Only https:// web links can be saved")
        s = "https://" + s
    parts = urlsplit(s)
    if parts.scheme.lower() != "https":
        raise BookmarkError("Only https:// web links can be saved (http, javascript:, data:, file: and app links are blocked)")
    if parts.username or parts.password:
        raise BookmarkError("Links with a user name or password are not allowed")
    host = (parts.hostname or "").lower()
    if not host or "." not in host and host != "localhost":
        raise BookmarkError("That does not look like a website address")
    if host == "localhost" or host.endswith(".local"):
        raise BookmarkError("Links to this computer or the local network are not allowed")
    try:
        ip = ipaddress.ip_address(host.strip("[]"))
    except ValueError:
        ip = None
    if ip is not None and (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_unspecified):
        raise BookmarkError("Links to this computer or the local network are not allowed")
    if ip is None:
        try:
            ascii_host = host.encode("idna").decode("ascii")
        except UnicodeError:
            raise BookmarkError("That does not look like a website address")
        if not re.fullmatch(r"[a-z0-9.-]+", ascii_host):
            raise BookmarkError("That does not look like a website address")
    netloc = host + (f":{parts.port}" if parts.port and parts.port != 443 else "")
    return urlunsplit(("https", netloc, parts.path or "/", parts.query, parts.fragment))


def _text(v, field: str, max_len: int, required: bool = False) -> str:
    s = re.sub(r"[\x00-\x08\x0b-\x1f\x7f]", "", str(v or "")).strip()
    if required and not s:
        raise BookmarkError(f"{field} is required")
    if len(s) > max_len:
        raise BookmarkError(f"{field} is too long (max {max_len})")
    return s


class BookmarkService:
    def __init__(self, storage: Storage):
        self.db = storage
        self.seed()

    def seed(self) -> int:
        """Add each batch once and respect matching custom entries and soft-deleted rows."""
        now = utcnow()
        added = 0
        with self.db.tx() as c:
            rows = c.execute("SELECT seed_key, url FROM bookmarks").fetchall()
            keys = {r[0] for r in rows}
            urls = {r[1].rstrip("/") for r in rows}
            pos = c.execute("SELECT COALESCE(MAX(position) + 1, 0) FROM bookmarks").fetchone()[0]
            for marker, batch in SEED_BATCHES:
                if c.execute("SELECT 1 FROM meta WHERE key=?", (marker,)).fetchone():
                    continue
                for d in batch:
                    if d["seed_key"] in keys or d["url"].rstrip("/") in urls:
                        continue
                    c.execute("INSERT INTO bookmarks(id, title, url, description, category, favourite, position, seed_key, created_at, updated_at) "
                              "VALUES(?,?,?,?,?,0,?,?,?,?)", (uuid.uuid4().hex[:12], d["title"], d["url"], d["description"],
                                                           d["category"], pos + added, d["seed_key"], now, now))
                    added += 1
                c.execute("INSERT INTO meta(key, value) VALUES(?, ?)", (marker, now))
        return added

    def list(self, q: str = "", category: str = "", fav: bool = False, include_deleted: bool = False) -> dict:
        rows = self.db.query("SELECT * FROM bookmarks" + ("" if include_deleted else " WHERE deleted_at IS NULL") +
                             " ORDER BY favourite DESC, position, title COLLATE NOCASE")
        out = [{**r, "favourite": bool(r["favourite"]), "host": urlsplit(r["url"]).hostname} for r in rows]
        if q:
            ql = q.lower()
            out = [b for b in out if ql in b["title"].lower() or ql in b["url"].lower() or ql in b["description"].lower() or ql in b["category"].lower()]
        if category:
            out = [b for b in out if b["category"] == category]
        if fav:
            out = [b for b in out if b["favourite"]]
        cats = sorted({r["category"] for r in rows if not r["deleted_at"]}, key=str.lower)
        missing = [d for d in DEFAULTS if not any(self._matches_default(r, d) and not r["deleted_at"] for r in rows)]
        return {"bookmarks": out, "categories": cats, "defaults_missing": [d["title"] for d in missing]}

    def get(self, bid: str) -> dict:
        r = self.db.query_one("SELECT * FROM bookmarks WHERE id=?", (bid,))
        if not r:
            raise KeyError(bid)
        return {**r, "favourite": bool(r["favourite"]), "host": urlsplit(r["url"]).hostname}

    def _clean(self, body: dict, partial: bool = False) -> dict:
        out = {}
        if not partial or "url" in body:
            out["url"] = normalize_url(body.get("url", ""))
        if not partial or "title" in body:
            out["title"] = _text(body.get("title") or (urlsplit(out["url"]).hostname if "url" in out else ""), "Title", 120, True)
        if "description" in body or not partial:
            out["description"] = _text(body.get("description"), "Description", 500)
        if "category" in body or not partial:
            out["category"] = _text(body.get("category") or "General", "Category", 40) or "General"
        if "favourite" in body:
            out["favourite"] = int(bool(body["favourite"]))
        return out

    def create(self, body: dict) -> dict:
        v = self._clean(body)
        dup = self.db.query_one("SELECT id FROM bookmarks WHERE url=? AND deleted_at IS NULL", (v["url"],))
        if dup:
            raise BookmarkError("You already have a bookmark for this address")
        bid = uuid.uuid4().hex[:12]
        now = utcnow()
        pos = (self.db.query_one("SELECT MAX(position) p FROM bookmarks")["p"] or 0) + 1
        self.db.execute("INSERT INTO bookmarks(id, title, url, description, category, favourite, position, created_at, updated_at) "
                        "VALUES(?,?,?,?,?,?,?,?,?)", (bid, v["title"], v["url"], v["description"], v["category"], v.get("favourite", 0), pos, now, now))
        return self.get(bid)

    def update(self, bid: str, body: dict) -> dict:
        self.get(bid)
        v = self._clean(body, partial=True)
        if "url" in v and self.db.query_one("SELECT id FROM bookmarks WHERE url=? AND id<>? AND deleted_at IS NULL", (v["url"], bid)):
            raise BookmarkError("Another bookmark already uses this address")
        if v:
            v["updated_at"] = utcnow()
            self.db.execute("UPDATE bookmarks SET " + ", ".join(f"{k}=?" for k in v) + " WHERE id=?", (*v.values(), bid))
        return self.get(bid)

    def delete(self, bid: str) -> dict:
        self.get(bid)
        self.db.execute("UPDATE bookmarks SET deleted_at=?, updated_at=? WHERE id=?", (utcnow(), utcnow(), bid))
        return self.get(bid)

    def restore(self, bid: str) -> dict:
        self.db.execute("UPDATE bookmarks SET deleted_at=NULL, updated_at=? WHERE id=?", (utcnow(), bid))
        return self.get(bid)

    def reorder(self, ids: list[str]) -> dict:
        if not isinstance(ids, list) or len(ids) > 500:
            raise BookmarkError("order must be a list of bookmark ids")
        with self.db.tx() as c:
            for pos, bid in enumerate(ids):
                c.execute("UPDATE bookmarks SET position=? WHERE id=?", (pos, str(bid)))
        return self.list()

    @staticmethod
    def _matches_default(row, default):
        return row["seed_key"] == default["seed_key"] or row["url"].rstrip("/") == default["url"].rstrip("/")

    def restore_defaults(self) -> dict:
        """Explicit user action only. Restore missing defaults without duplicating a custom entry."""
        added = []
        now = utcnow()
        with self.db.tx() as c:
            rows = c.execute("SELECT seed_key, url, deleted_at, id FROM bookmarks").fetchall()
            for d in DEFAULTS:
                if any(self._matches_default(r, d) and not r["deleted_at"] for r in rows):
                    continue
                gone = next((r for r in rows if r["seed_key"] == d["seed_key"]), None)
                if gone:
                    if any(not r["deleted_at"] and r["url"] == gone["url"] for r in rows):
                        continue
                    c.execute("UPDATE bookmarks SET deleted_at=NULL, updated_at=? WHERE id=?", (now, gone["id"]))
                else:
                    c.execute("INSERT INTO bookmarks(id, title, url, description, category, favourite, position, seed_key, created_at, updated_at) "
                              "VALUES(?,?,?,?,?,0,999,?,?,?)", (uuid.uuid4().hex[:12], d["title"], d["url"], d["description"],
                                                              d["category"], d["seed_key"], now, now))
                added.append(d["title"])
        return {"restored": added, **self.list()}
