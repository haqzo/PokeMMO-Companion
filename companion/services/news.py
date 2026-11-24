"""Official news / changelog / events (docs/design/03).

Bundled snapshot = independently written summaries with source URL and
provenance. The official Updates RSS feed is checked automatically (at start-up when the cache is stale, then
every N hours, with back-off after failures) and on demand. Feed posts and bundled articles are merged into ONE
list keyed by the forum topic id, so a newer official post becomes "Latest official update" immediately — with
only its official title, date and link until a summary is written. The Companion never fabricates article bodies.
Content edits are detected from a hash of the feed's description (the text itself is not stored).
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import threading
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

from .. import __version__
from ..config import BUNDLED_DATA_DIR
from ..storage import Storage, utcnow

FEED_URL = "https://forums.pokemmo.com/index.php?/forum/5-updates.xml/"
MANUAL_MIN_INTERVAL = 60          # seconds between manual checks
AUTO_MIN_HOURS = 1                # never poll more often than hourly
RETRY_MINUTES = (5, 15, 60)       # back-off after failed automatic checks (then the normal interval)
log = logging.getLogger("companion.news")
_TOPIC_RX = re.compile(r"topic/(\d+)")


def _parse_dt(value: str) -> datetime:
    v = value.replace("Z", "+00:00")
    dt = datetime.fromisoformat(v)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


HOME_WINDOW_DAYS = 90


def topic_id(url: str) -> str | None:
    m = _TOPIC_RX.search(url or "")
    return m.group(1) if m else None


def classify(title: str) -> tuple[str, str]:
    """(kind, channel) of an official post from its title — PTS is never presented as live."""
    t = (title or "").lower()
    channel = "pts" if re.search(r"\bpts\b|public test server|test server", t) else "live"
    if "hotfix" in t:
        kind = "hotfix"
    elif "changelog" in t or "patch" in t or "update" in t:
        kind = "changelog"
    elif re.search(r"\bevent\b|halloween|xmas|christmas|easter|lunar|anniversary|tournament|summer|valentine", t):
        kind = "event"
    else:
        kind = "announcement"
    return kind, channel


def published_within(items: list[dict], now: datetime, days: int = HOME_WINDOW_DAYS) -> list[dict]:
    """Items PUBLISHED in the last `days` days (newest first). Discovery time is irrelevant: a feed post we only
    just noticed but that was published a year ago is history, not news. Items without a readable date are left out."""
    cutoff = now - timedelta(days=days)
    out = []
    for it in items:
        try:
            pub = _parse_dt(it.get("published") or "")
        except (ValueError, TypeError):
            continue
        if cutoff <= pub <= now + timedelta(days=1):
            out.append((pub, it))
    return [it for _, it in sorted(out, key=lambda x: x[0], reverse=True)]


class NewsService:
    def __init__(self, storage: Storage):
        self.db = storage
        self.snapshot = json.loads((BUNDLED_DATA_DIR / "news_snapshot.json").read_text(encoding="utf-8"))
        self._lock = threading.Lock()

    def _topic_ids(self) -> set[str]:
        ids = set()
        for a in self.snapshot["articles"] + self.snapshot["events"]:
            m = _TOPIC_RX.search(a.get("source_url", ""))
            if m:
                ids.add(m.group(1))
        return ids

    def event_status(self, ev: dict, now: datetime | None = None) -> dict:
        now = now or datetime.now(timezone.utc)
        if ev.get("confirmed_status") == "cancelled":
            return {"code": "cancelled", "label": "Cancelled"}
        if ev.get("confirmed_status") == "concluded":
            return {"code": "concluded", "label": "Ended"}
        start = _parse_dt(ev["starts"]) if ev.get("starts") else None
        end = _parse_dt(ev["ends"]) if ev.get("ends") else None
        if start and now < start:
            return {"code": "upcoming", "label": "Upcoming"}
        if end and now > end:
            return {"code": "window_passed", "label": "Ended (by schedule)"}
        if start and now >= start:
            return {"code": "window_open", "label": "Running (by schedule)"}
        return {"code": "unknown", "label": "Dates unconfirmed"}

    def listing(self, now: datetime | None = None) -> dict:
        now = now or datetime.now(timezone.utc)
        articles = sorted(self.snapshot["articles"], key=lambda a: a.get("updated") or a["published"], reverse=True)
        events = []
        for e in self.snapshot["events"]:
            events.append({**e, "status": self.event_status(e, now)})
        upcoming = [e for e in events if e["status"]["code"] in ("upcoming", "window_open")]
        feed = self.db.get_setting("news.feed_cache", None)
        records = self.records(feed)
        new_posts = [r for r in records if r.get("discovered")]
        # Latest official update = newest LIVE changelog/hotfix by publication date, bundled or discovered.
        latest_rec = next((r for r in records if r["channel"] == "live" and r["kind"] in ("changelog", "hotfix")), None)
        feed_info = feed and {k: v for k, v in feed.items() if k not in ("items", "etag", "last_modified") and not k.startswith("_")}
        if feed_info is not None:
            feed_info["auto"] = bool(self.db.get_setting("updates.auto_check", True))
            hours = max(AUTO_MIN_HOURS, int(self.db.get_setting("updates.check_hours", 3) or 3))
            last_ok = feed.get("last_ok_at")
            try:
                age_h = (now - _parse_dt(last_ok)).total_seconds() / 3600 if last_ok else None
            except ValueError:
                age_h = None
            feed_info["stale"] = age_h is None or age_h > 2 * hours
            feed_info["next_check_at"] = feed.get("_next_due_iso")
        return {"snapshot_checked_at": self.snapshot["snapshot_checked_at"], "about": self.snapshot["about"],
                "articles": [self._brief(a) for a in articles], "latest": latest_rec,
                "records": records,
                "events": events, "upcoming": upcoming, "feed": feed_info,
                "auto_check": bool(self.db.get_setting("updates.auto_check", True)),
                "check_hours": self.db.get_setting("updates.check_hours", 3),
                "new_posts": new_posts,
                # Home shows only what was published recently, and only ongoing / upcoming events.
                "home": {"window_days": HOME_WINDOW_DAYS,
                         "new_posts": published_within(new_posts, now),
                         "articles": published_within([self._brief(a) for a in articles], now),
                         "events": sorted([e for e in events if e["status"]["code"] in ("window_open", "upcoming")],
                                         key=lambda e: (e["status"]["code"] != "window_open", e.get("starts") or "")),
                         "older_new_posts": len(new_posts) - len(published_within(new_posts, now))}}

    def records(self, feed: dict | None = None) -> list[dict]:
        """Bundled articles + feed posts merged by forum topic id, newest publication first.
        A bundled article keeps its summary; the feed adds edits it sees later. A post only in the feed is
        `discovered` and carries no summary (title, date and link only)."""
        feed = feed if feed is not None else (self.db.get_setting("news.feed_cache", None) or {})
        by_tid: dict[str, dict] = {}
        out: list[dict] = []
        for a in self.snapshot["articles"]:
            rec = {**self._brief(a), "topic_id": topic_id(a.get("source_url", "")), "has_summary": bool(a.get("summary")),
                   "discovered": False}
            out.append(rec)
            if rec["topic_id"]:
                by_tid[rec["topic_id"]] = rec
        for it in (feed or {}).get("items", []):
            tid = topic_id(it.get("link", ""))
            if not tid:
                continue
            if tid in by_tid:
                rec = by_tid[tid]
                if it.get("edited") or it.get("content_changed"):
                    rec["edited_upstream"] = {"title": it.get("title"), "seen_at": it.get("edited_seen_at"),
                                              "content_changed": bool(it.get("content_changed"))}
                continue
            kind, channel = classify(it.get("title", ""))
            rec = {"id": "forum-" + tid, "topic_id": tid, "kind": kind, "channel": channel, "title": it.get("title"),
                   "published": it.get("published"), "updated": it.get("edited_seen_at"), "source_url": it.get("link"),
                   "provenance": "official-direct", "summary": None, "has_summary": False, "discovered": True,
                   "first_seen_at": it.get("first_seen_at"), "edited": bool(it.get("edited") or it.get("content_changed")),
                   "summary_status": "Only the official title, date and link are known — open the post for details."}
            by_tid[tid] = rec
            out.append(rec)

        def key(r):
            try:
                return _parse_dt(r.get("published") or "1970-01-01")
            except ValueError:
                return datetime(1970, 1, 1, tzinfo=timezone.utc)
        return sorted(out, key=key, reverse=True)

    @staticmethod
    def _brief(a: dict) -> dict:
        return {k: a[k] for k in ("id", "kind", "channel", "title", "published", "summary", "provenance",
                                  "source_url") if k in a} | {"updated": a.get("updated")}

    def article(self, aid: str) -> dict | None:
        for a in self.snapshot["articles"]:
            if a["id"] == aid:
                return a
        return None

    def event(self, eid: str) -> dict | None:
        for e in self.snapshot["events"]:
            if e["id"] == eid:
                return {**e, "status": self.event_status(e)}
        return None

    # ---------------------------------------------------- refresh (auto + manual)
    def check_feed(self, timeout: float = 10.0, manual: bool = True) -> dict:
        """Fetch the official Updates feed: titles, dates and links only. Conditional request
        (ETag / Last-Modified); never fabricates article bodies; marks edited titles."""
        with self._lock:
            prev = self.db.get_setting("news.feed_cache", None) or {}
            now = time.time()
            last = prev.get("_checked_epoch", 0)
            if manual and now - last < MANUAL_MIN_INTERVAL and prev:
                return {**prev, "throttled": True, "note": "Checked less than a minute ago — showing that result."}
            result: dict = {"checked_at": utcnow(), "url": FEED_URL, "_checked_epoch": now,
                            "trigger": "manual" if manual else "automatic"}
            headers = {"User-Agent": f"PokeMMO-Companion/{__version__} (titles only; checks at most hourly)"}
            if prev.get("etag"):
                headers["If-None-Match"] = prev["etag"]
            if prev.get("last_modified"):
                headers["If-Modified-Since"] = prev["last_modified"]
            try:
                req = urllib.request.Request(FEED_URL, headers=headers)
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    body = resp.read(2_000_000)
                    etag, lm = resp.headers.get("ETag"), resp.headers.get("Last-Modified")
                items = self.merge_items(prev.get("items", []), self.parse_feed(body), result["checked_at"])
                result.update({"ok": True, "items": items, "count": len(items), "etag": etag, "last_modified": lm,
                               "last_ok_at": result["checked_at"], "unchanged": False})
            except urllib.error.HTTPError as exc:
                if exc.code == 304:
                    result.update({"ok": True, "unchanged": True, "items": prev.get("items", []),
                                   "count": len(prev.get("items", [])), "etag": prev.get("etag"),
                                   "last_modified": prev.get("last_modified"), "last_ok_at": result["checked_at"]})
                else:
                    result.update(self._failure(prev, f"HTTP {exc.code}"))
            except Exception as exc:  # network / parse — report honestly, keep the old list
                result.update(self._failure(prev, f"{type(exc).__name__}: {str(exc)[:200]}"))
            hours = max(AUTO_MIN_HOURS, int(self.db.get_setting("updates.check_hours", 3) or 3))
            fails = 0 if result.get("ok") else int(prev.get("_fails", 0)) + 1
            delay = hours * 3600 if not fails else min(hours * 3600, RETRY_MINUTES[min(fails, len(RETRY_MINUTES)) - 1] * 60)
            result["_fails"] = fails
            result["_next_due"] = now + delay
            result["_next_due_iso"] = datetime.fromtimestamp(now + delay, timezone.utc).isoformat(timespec="seconds")
            self.db.set_settings({"news.feed_cache": result})
            return result

    @staticmethod
    def _failure(prev: dict, error: str) -> dict:
        return {"ok": False, "error": error, "items": prev.get("items", []), "last_ok_at": prev.get("last_ok_at"),
                "etag": prev.get("etag"), "last_modified": prev.get("last_modified")}

    @staticmethod
    def merge_items(previous: list[dict], fresh: list[dict], now: str) -> list[dict]:
        old = {i["link"]: i for i in previous}
        out = []
        for it in fresh:
            o = old.get(it["link"])
            item = {**it, "first_seen_at": (o or {}).get("first_seen_at", now)}
            if o and o.get("title") and o["title"] != it["title"]:
                item.update(edited=True, previous_title=o["title"], edited_seen_at=now)
            elif o and o.get("edited"):
                item.update(edited=True, previous_title=o.get("previous_title"), edited_seen_at=o.get("edited_seen_at"))
            if o and o.get("desc_hash") and it.get("desc_hash") and o["desc_hash"] != it["desc_hash"]:
                item.update(content_changed=True, edited_seen_at=now)
            elif o and o.get("content_changed"):
                item.update(content_changed=True, edited_seen_at=o.get("edited_seen_at"))
            out.append(item)
        return out[:50]

    def start_auto(self, settings, bus) -> None:
        """Low-impact background check: first after 20 s, then every N hours (min 1 h)."""
        if getattr(self, "_auto_thread", None):
            return
        self._auto_stop = threading.Event()

        def loop() -> None:
            if self._auto_stop.wait(20):
                return
            while not self._auto_stop.is_set():
                try:
                    if settings.get("updates.auto_check"):
                        hours = max(AUTO_MIN_HOURS, int(settings.get("updates.check_hours") or 3))
                        prev = self.db.get_setting("news.feed_cache", None) or {}
                        due = prev.get("_next_due") or (prev.get("_checked_epoch", 0) + hours * 3600)
                        if time.time() >= min(due, prev.get("_checked_epoch", 0) + hours * 3600):
                            before = (self.records(prev)[:1] or [{}])[0].get("id")
                            res = self.check_feed(manual=False)
                            after = (self.records(res)[:1] or [{}])[0].get("id")
                            bus.publish("news", {"ok": res.get("ok"), "count": res.get("count"), "auto": True,
                                                 "changed": before != after or not res.get("unchanged")})
                except Exception:  # pragma: no cover
                    log.exception("automatic news check failed")
                if self._auto_stop.wait(300):
                    return
        self._auto_thread = threading.Thread(target=loop, name="news-auto", daemon=True)
        self._auto_thread.start()

    def stop_auto(self) -> None:
        if getattr(self, "_auto_stop", None):
            self._auto_stop.set()

    @staticmethod
    def parse_feed(body: bytes) -> list[dict]:
        root = ET.fromstring(body)
        items = []
        for it in root.iter("item"):
            title = (it.findtext("title") or "").strip()[:200]
            link = (it.findtext("link") or "").strip()
            if not link.startswith("https://forums.pokemmo.com/"):
                continue
            pub = it.findtext("pubDate")
            try:
                published = parsedate_to_datetime(pub).astimezone(timezone.utc).isoformat() if pub else None
            except (TypeError, ValueError):
                published = None
            desc = it.findtext("description") or ""
            items.append({"title": title, "link": link, "published": published,
                          "desc_hash": hashlib.sha256(desc.encode("utf-8")).hexdigest()[:16] if desc else None})
        return items[:50]
