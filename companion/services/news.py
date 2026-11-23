"""Official news / changelog / events (docs/design/03).

Bundled snapshot = independently written summaries with source URL and
provenance. An optional *manual* "Check official forum" fetches the official
Updates RSS feed (titles + dates + links only). New posts appear as
"no in-app summary yet" — the Companion never fabricates an article body.
No network request is made unless the user presses the button.
"""
from __future__ import annotations

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
log = logging.getLogger("companion.news")
_TOPIC_RX = re.compile(r"topic/(\d+)")


def _parse_dt(value: str) -> datetime:
    v = value.replace("Z", "+00:00")
    dt = datetime.fromisoformat(v)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


HOME_WINDOW_DAYS = 90


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
            return {"code": "concluded", "label": "Concluded"}
        start = _parse_dt(ev["starts"]) if ev.get("starts") else None
        end = _parse_dt(ev["ends"]) if ev.get("ends") else None
        if start and now < start:
            return {"code": "upcoming", "label": "Upcoming"}
        if end and now > end:
            return {"code": "window_passed", "label": "Scheduled end passed (completion not confirmed)"}
        if start and now >= start:
            return {"code": "window_open", "label": "Scheduled window open — not confirmed live"}
        return {"code": "unknown", "label": "Status unknown"}

    def listing(self, now: datetime | None = None) -> dict:
        now = now or datetime.now(timezone.utc)
        articles = sorted(self.snapshot["articles"], key=lambda a: a.get("updated") or a["published"], reverse=True)
        events = []
        for e in self.snapshot["events"]:
            events.append({**e, "status": self.event_status(e, now)})
        upcoming = [e for e in events if e["status"]["code"] in ("upcoming", "window_open")]
        feed = self.db.get_setting("news.feed_cache", None)
        known = self._topic_ids()
        new_posts = []
        if feed:
            for item in feed.get("items", []):
                m = _TOPIC_RX.search(item.get("link", ""))
                if m and m.group(1) not in known:
                    new_posts.append(item)
        latest_live = next((a for a in articles if a["channel"] == "live" and a["kind"] == "changelog"), None)
        for p in new_posts:
            p["summary_status"] = "Summary pending verification — only the official title, date and link are known."
        feed_info = feed and {k: v for k, v in feed.items() if k not in ("items", "etag", "last_modified") and not k.startswith("_")}
        if feed_info is not None:
            feed_info["auto"] = bool(self.db.get_setting("updates.auto_check", True))
        return {"snapshot_checked_at": self.snapshot["snapshot_checked_at"], "about": self.snapshot["about"],
                "articles": [self._brief(a) for a in articles], "latest": latest_live and self._brief(latest_live),
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
                        if time.time() - prev.get("_checked_epoch", 0) >= hours * 3600:
                            res = self.check_feed(manual=False)
                            bus.publish("news", {"ok": res.get("ok"), "count": res.get("count"), "auto": True})
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
            items.append({"title": title, "link": link, "published": published})
        return items[:50]
