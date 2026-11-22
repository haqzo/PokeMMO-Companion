"""Official news / changelog / events (docs/design/03).

Bundled snapshot = independently written summaries with source URL and
provenance. An optional *manual* "Check official forum" fetches the official
Updates RSS feed (titles + dates + links only). New posts appear as
"no in-app summary yet" — the Companion never fabricates an article body.
No network request is made unless the user presses the button.
"""
from __future__ import annotations

import json
import re
import threading
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

from .. import __version__
from ..config import BUNDLED_DATA_DIR
from ..storage import Storage, utcnow

FEED_URL = "https://forums.pokemmo.com/index.php?/forum/5-updates.xml/"
_TOPIC_RX = re.compile(r"topic/(\d+)")


def _parse_dt(value: str) -> datetime:
    v = value.replace("Z", "+00:00")
    dt = datetime.fromisoformat(v)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


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

    def listing(self) -> dict:
        articles = sorted(self.snapshot["articles"], key=lambda a: a.get("updated") or a["published"], reverse=True)
        events = []
        for e in self.snapshot["events"]:
            events.append({**e, "status": self.event_status(e)})
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
        return {"snapshot_checked_at": self.snapshot["snapshot_checked_at"], "about": self.snapshot["about"],
                "articles": [self._brief(a) for a in articles], "latest": latest_live and self._brief(latest_live),
                "events": events, "upcoming": upcoming, "feed": feed and {k: v for k, v in feed.items() if k != "items"},
                "new_posts": new_posts}

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

    # ------------------------------------------------------- manual refresh
    def check_feed(self, timeout: float = 10.0) -> dict:
        with self._lock:
            result: dict = {"checked_at": utcnow(), "url": FEED_URL}
            try:
                req = urllib.request.Request(FEED_URL, headers={
                    "User-Agent": f"PokeMMO-Companion/{__version__} (manual check; titles only)"})
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    body = resp.read(2_000_000)
                items = self.parse_feed(body)
                result.update({"ok": True, "items": items, "count": len(items)})
            except Exception as exc:  # network/HTTP/parse — report honestly
                prev = self.db.get_setting("news.feed_cache", None) or {}
                result.update({"ok": False, "error": f"{type(exc).__name__}: {str(exc)[:200]}",
                               "items": prev.get("items", []), "last_ok_at": prev.get("last_ok_at")})
            if result.get("ok"):
                result["last_ok_at"] = result["checked_at"]
            self.db.set_settings({"news.feed_cache": result})
            return result

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
