"""Live: community reports, notification routing, legendary roadmap, Altering Cave.

ntfy adapter (docs/design/11, 13):
  * Read-only subscription, disabled until the user consents.
  * Follows the documented ntfy JSON stream API (https://docs.ntfy.sh/subscribe/api/).
    The Alphapedia payload format has NOT been validated with real samples, so
    reports show the provider's own title/message text (sanitised plain text).
    Alpha/Swarm kind and species are *detected from text* and labelled as such.
  * ``expires`` is ntfy cache retention — never shown as a despawn time.
  * Deduplicated by (provider, message id) and correlated across observations
    of the same verified species and place. Catch-up messages stay silent.
"""
from __future__ import annotations

import hashlib
import http.client
import json
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from typing import Callable

from .. import __version__
from ..config import ALPHAPEDIA_URL, BUNDLED_DATA_DIR
from ..events import EventBus
from ..settings import Settings
from ..localization import native_text
from ..storage import Storage, utcnow
from .dex import DexService, normalize_location_text
from .notify import Notifier
from .phenomena import Phenomena

PARSER_VERSION = "alphapedia-ntfy-3"
TOPIC_KIND = {"alphapings": "alpha", "swarmpings": "swarm"}
REGION_NAMES = {"kanto", "johto", "hoenn", "sinnoh", "unova"}
# Payload shape recorded from real messages on 2026-11-17 (owner project notes, companion/STATUS.md):
#   alphapings: title="Ditto",   message="Kanto, Cerulean Cave"
#   swarmpings: title="Wailmer", message="Johto\nRoute 40"
# Not re-captured live in this build; anything that doesn't match falls back to showing the raw text.
_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


# ---------------------------------------------------------------- report status & estimated timers
# Alpha: 75 real-world minutes (official PokeMMO changelog, see docs/build/15). Swarms: community estimates
# disagree (≈15 / 20 / 30 min), so a provisional, user-adjustable estimate is used (default 20 min).
# A report's time is when someone REPORTED it, not when it spawned: timers are estimates of the latest
# possible end, never a confirmation that the Pokémon is still there, and there is no next-spawn countdown.
ALPHA_MINUTES = 75
FUTURE_TOLERANCE = timedelta(minutes=2)
DUPLICATE_NOTICE = "Same Alpha/Swarm already reported — saved to history, not notified again"
EXPIRED_NOTICE = "The estimated report window has passed — saved to history only"


def _parse_iso(v: str | None) -> datetime | None:
    if not v:
        return None
    try:
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def report_status(r: dict, now: datetime, swarm_minutes: int = 20) -> dict:
    """Classify one report: test · replayed · recent (likely active) · uncertain · ended · info (no timer)."""
    received = _parse_iso(r.get("received_at")) or now
    reported = _parse_iso(r.get("source_time"))
    notes = []
    start, basis = reported, "report time"
    if reported is None:
        start, basis = received, "time received"
        notes.append("The report has no timestamp; the time it reached the Companion is used.")
    elif reported > now + FUTURE_TOLERANCE or reported > received + FUTURE_TOLERANCE:
        start, basis = received, "time received"
        notes.append("The report's timestamp is in the future (clock difference); the time it reached the Companion is used.")
    kind = "test" if r.get("is_test") else r.get("kind")
    minutes = ALPHA_MINUTES if kind == "alpha" else swarm_minutes if kind == "swarm" else None
    if minutes and reported and received - reported > timedelta(minutes=minutes):
        notes.append("This report reached the Companion after its estimated window had already passed.")
    age = max(0.0, (now - start).total_seconds())
    out = {"start": start.isoformat(timespec="seconds"), "start_basis": basis, "age_s": int(age), "notes": notes,
           "duration_min": minutes, "ends_at": (start + timedelta(minutes=minutes)).isoformat(timespec="seconds") if minutes else None,
           "estimate": None if not minutes else ("Alpha duration 75 min (official changelog)" if kind == "alpha"
                                                 else f"Swarm duration ~{minutes} min (community estimate, not official)")}
    if r.get("is_replay") and basis == "time received" and minutes:
        state = "replayed"
        out.update(ends_at=None, duration_min=None, estimate=None)
    elif kind == "test":
        state = "test"
    elif not minutes:
        state = "info"
    elif age < minutes * 60:
        state = "recent"
    elif age < minutes * 60 + max(15 * 60, minutes * 30):
        state = "uncertain"
    else:
        state = "replayed" if r.get("is_replay") else "ended"
    out["state"] = state
    out["label"] = {"test": "TEST entry", "info": "Report", "recent": "Recently reported · likely active",
                    "uncertain": "Status uncertain", "ended": "Old · likely ended", "replayed": "Replayed history"}[state]
    out["remaining_s"] = int(minutes * 60 - age) if state == "recent" else 0
    return out


def sanitize(text: object, limit: int = 2000) -> str:
    if text is None:
        return ""
    return _CTRL.sub("", str(text))[:limit].strip()


def iso_from_epoch(ts: object) -> str | None:
    try:
        return datetime.fromtimestamp(int(ts), timezone.utc).isoformat().replace("+00:00", "Z")
    except (TypeError, ValueError, OSError, OverflowError):
        return None


def reported_location(body: str) -> tuple[str | None, str | None]:
    # Keep the provider's spelling in the observation, including any floor or qualifier.
    parts = re.split(r"[,，\n\r]", body, maxsplit=1)
    region = normalize_location_text(parts[0])
    if region not in REGION_NAMES:
        return None, None
    place = parts[1].strip() if len(parts) > 1 else ""
    return region, place or None


class LiveService:
    def __init__(self, storage: Storage, settings: Settings, bus: EventBus, dex: DexService, notifier: Notifier):
        self.db = storage
        self.settings = settings
        self.bus = bus
        self.dex = dex
        self.notifier = notifier
        self.phenomena = Phenomena(self)
        self.toast_backend: Callable[[dict], bool] | None = None  # set by the Qt shell
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self.legend = json.loads((BUNDLED_DATA_DIR / "legendaries.json").read_text(encoding="utf-8"))
        self._names = sorted(((s["name"], sid) for sid, s in dex.index.items()), key=lambda x: -len(x[0]))
        self._index_saved_events()

    # --------------------------------------------------------- source health
    def _health(self, status: str, detail: str = "", success: bool = False) -> None:
        now = utcnow()
        with self.db.tx() as c:
            c.execute("INSERT INTO source_health(source, status, detail, last_attempt_at, last_success_at, updated_at) "
                      "VALUES('ntfy', ?, ?, ?, ?, ?) ON CONFLICT(source) DO UPDATE SET status=excluded.status, "
                      "detail=excluded.detail, last_attempt_at=excluded.last_attempt_at, "
                      "last_success_at=COALESCE(excluded.last_success_at, source_health.last_success_at), "
                      "updated_at=excluded.updated_at", (status, detail, now, now if success else None, now))
        self.bus.publish("live.source", self.source_status())

    def source_status(self) -> dict:
        row = self.db.query_one("SELECT * FROM source_health WHERE source='ntfy'") or {}
        enabled = bool(self.settings.get("live.ntfy.enabled"))
        return {"enabled": enabled, "consented": bool(self.settings.get("live.ntfy.consented")),
                "status": row.get("status", "disabled") if enabled else "disabled",
                "detail": row.get("detail", ""), "last_success_at": row.get("last_success_at"),
                "last_attempt_at": row.get("last_attempt_at"),
                "server": self.settings.get("live.ntfy.server"), "topic": self.settings.get("live.ntfy.topic"),
                "parser": PARSER_VERSION, "payload_validated": False,
                "payload_note": "Parser follows message samples recorded on 17 Nov 2026 (owner notes); not re-captured live in this build."}

    # ---------------------------------------------------------- normalise
    def detect(self, title: str, body: str, tags: list[str], topic: str | None = None) -> dict:
        """Kind from the provider topic; species from an exact title match; region/location from the message."""
        out: dict = {"kind": "other", "basis": "none", "species": None, "region": None, "location": None}
        if topic in TOPIC_KIND:
            out.update(kind=TOPIC_KIND[topic], basis="topic")
        else:
            hay = " ".join([title, body, " ".join(tags)]).lower()
            if "swarm" in hay:
                out.update(kind="swarm", basis="text-keyword")
            elif "alpha" in hay:
                out.update(kind="alpha", basis="text-keyword")
        exact = self.dex.find_by_name(title) if title else None
        if exact:
            out["species"] = exact
            out["species_basis"] = "title"
        else:
            hay = " ".join([title, body]).lower()
            for name, sid in self._names:
                if re.search(r"(?<![\w])" + re.escape(name.lower()) + r"(?![\w])", hay):
                    out["species"], out["species_basis"] = sid, "text"
                    break
        out["region"], out["location"] = reported_location(body)
        return out

    def ingest(self, msg: dict, provider: str = "ntfy", replay: bool = False) -> dict | None:
        """Store one provider message. Returns the stored report if new, else None (duplicate/invalid)."""
        mid = sanitize(msg.get("id"), 64)
        if not mid or msg.get("event", "message") != "message":
            return None
        title = sanitize(msg.get("title"), 200)
        body = sanitize(msg.get("message"))
        if not title and not body:
            return None
        raw_tags = msg.get("tags")
        tags = [sanitize(t, 40) for t in raw_tags if isinstance(t, (str, int))][:10] if isinstance(raw_tags, list) else []
        topic = sanitize(msg.get("topic"), 64) or None
        det = self.detect(title, body, tags, topic)
        kind, basis, species = det["kind"], det["basis"], det["species"]
        source_url = None
        actions = msg.get("actions")
        for a in actions if isinstance(actions, list) else ():
            url = a.get("url") if isinstance(a, dict) else None
            if isinstance(url, str) and url.startswith(ALPHAPEDIA_URL):
                source_url = url[:300]
                break
        raw_hash = hashlib.sha256(json.dumps(msg, sort_keys=True, default=str).encode()).hexdigest()[:16]
        rid = uuid.uuid4().hex[:16]
        received = utcnow()
        source_time = iso_from_epoch(msg.get("time"))
        swarm_minutes = self.swarm_minutes()
        deliver = not replay
        with self.db.tx() as c:
            cur = c.execute(
                "INSERT OR IGNORE INTO reports(id, provider, topic, message_id, kind, kind_basis, title, body, tags, "
                "species_id, source_time, received_at, is_replay, raw_hash, parser_version, region, location, source_url) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (rid, provider, topic, mid, kind, basis, title, body, json.dumps(tags),
                 species, source_time, received, int(replay), raw_hash, PARSER_VERSION,
                 det["region"], det["location"], source_url))
            if cur.rowcount == 0:
                return None
            if kind in ("alpha", "swarm"):
                row = dict(c.execute("SELECT * FROM reports WHERE id=?", (rid,)).fetchone())
                event_id, status = self._assign_event(c, row, swarm_minutes)
                if deliver and (event_id != rid or status["state"] != "recent"):
                    result = {"suppressed": DUPLICATE_NOTICE if event_id != rid else EXPIRED_NOTICE, "at": received}
                    if event_id != rid:
                        result["same_as"] = event_id
                    c.execute("UPDATE reports SET delivery=? WHERE id=?", (json.dumps(result), rid))
                    deliver = False
        report = self.get(rid)
        if deliver:
            report["delivery"] = self.deliver(report)
        self.bus.publish("live.report", {"id": rid, "replay": replay})
        return report

    # ------------------------------------------------------------ queries
    def _location_match(self, r: dict) -> dict:
        region, place = reported_location(r.get("body") or "")
        return self.dex.match_location(region or r.get("region"), place or r.get("location"))

    def _event_key(self, r: dict) -> str | None:
        sid = r.get("species_id")
        match = self._location_match(r)
        if match["status"] == "verified" and sid and self.species_match(r.get("title") or "", "", sid) != "ambiguous":
            return json.dumps([r["kind"], sid, match["id"]])
        return None

    def _index_saved_events(self) -> None:
        """Index pre-v6 observations in receipt order, preserving their original fields and delivery."""
        swarm_minutes = self.swarm_minutes()
        with self.db.tx() as c:
            rows = c.execute("SELECT * FROM reports WHERE is_test=0 AND kind IN ('alpha','swarm') "
                             "AND event_id IS NULL ORDER BY rowid").fetchall()
            for row in rows:
                self._assign_event(c, dict(row), swarm_minutes)

    def _assign_event(self, c, row: dict, swarm_minutes: int) -> tuple[str, dict]:
        """Assign one observation atomically. A window never grows past one estimated duration."""
        status = report_status(row, _parse_iso(row["received_at"]), swarm_minutes)
        trustworthy_time = status["start_basis"] == "report time"
        at = int(_parse_iso(status["start"]).timestamp()) if trustworthy_time or not row["is_replay"] else None
        key = self._event_key(row) if trustworthy_time else None
        event_id = row["id"]
        if key:
            seconds = status["duration_min"] * 60
            lower, upper = at - seconds, at + seconds
            # Check both ends, so an out-of-order report cannot chain two windows together.
            # If more than one window fits, favor the latest one already open at this report time.
            candidate = c.execute("""
                SELECT event_id FROM reports
                WHERE event_id IN (
                    SELECT event_id FROM reports WHERE event_key=? AND event_at>? AND event_at<?
                )
                GROUP BY event_id
                HAVING MIN(event_at)>? AND MAX(event_at)<?
                ORDER BY MIN(event_at)>?, MIN(event_at) DESC, event_id LIMIT 1
            """, (key, lower, upper, lower, upper, at)).fetchone()
            if candidate:
                event_id = candidate["event_id"]
        c.execute("UPDATE reports SET event_id=?, event_key=?, event_at=? WHERE id=?", (event_id, key, at, row["id"]))
        return event_id, status

    def _row(self, r: dict, *, status: dict | None = None) -> dict:
        r["tags"] = json.loads(r["tags"] or "[]")
        r["delivery"] = json.loads(r["delivery"]) if r.get("delivery") else None
        sid = r.get("species_id")
        r["species_name"] = self.dex.name(sid) if sid else None
        # Sprites are shown only when the report names its species unambiguously (display-only check; the
        # stored detection is unchanged). A report mentioning several species keeps its link but gets no sprite.
        r["species_match"] = self.species_match(r.get("title") or "", r.get("body") or "", sid) if sid else None
        ok = r["species_match"] in ("title", "single-mention")
        r["species_icon"] = self.dex.sprite_url(sid) if ok else None
        r["species_front"] = self.dex.sprite_url(sid, "front") if ok else None
        # Your Gen V sprite library (if installed): a still for rows, one animation for the report detail.
        r["species_still"] = self.dex.still(sid) if ok else None
        lib = self.dex.library
        r["species_ani"] = (lib.urls(str(sid)).get("ani") if ok and lib is not None and lib.installed else None)
        r["location_match"] = self._location_match(r)
        r["status"] = status or report_status(r, datetime.now(timezone.utc), self.swarm_minutes())
        r.pop("event_key", None)
        r.pop("event_at", None)
        return r

    def swarm_minutes(self) -> int:
        try:
            return max(5, min(120, int(self.settings.get("live.swarm_estimate_minutes") or 20)))
        except (TypeError, ValueError):
            return 20

    def current(self, now: datetime | None = None) -> dict:
        """Featured 'Current / recently reported': credible Alpha & Swarm reports whose estimated window is open
        (or just closed → 'status uncertain'). TEST entries and old history never appear here. Several reports of
        the same Pokémon at the same place within one window are one entry, timed from the EARLIEST report.
        Reports caught up after (re)connecting count by their own timestamp and are labelled as such."""
        now = now or datetime.now(timezone.utc)
        sw = self.swarm_minutes()
        # Include older anchors when a group's latest observation is still within view.
        # Correlation can have used a larger Swarm estimate before a settings change.
        horizon = int((now - timedelta(minutes=max(ALPHA_MINUTES, sw) * 2)).timestamp())
        rows = self.db.query(
            "SELECT * FROM reports WHERE event_id IN (SELECT event_id FROM reports WHERE event_at >= ?) "
            "ORDER BY event_at, rowid", (horizon,))
        include_catchup = self.settings.get("live.current_include_catchup") is not False
        groups: dict[str, list[dict]] = {}
        for row in rows:
            groups.setdefault(row["event_id"], []).append(row)
        out = []
        for observations in groups.values():
            visible = observations if include_catchup else [row for row in observations if not row["is_replay"]]
            if not visible:
                continue
            first = observations[0]
            st = report_status(first, now, sw)
            if st["state"] not in ("recent", "uncertain"):
                continue
            out.append({**self._row(visible[0], status=st), "duplicates": len(visible) - 1,
                        "report_ids": [row["id"] for row in visible], "latest_id": visible[-1]["id"],
                        "caught_up": bool(visible[0]["is_replay"])})
        out.sort(key=lambda x: (x["status"]["state"] != "recent", -_parse_iso(x["status"]["start"]).timestamp()))
        src = self.source_status()
        return {"now": now.isoformat(timespec="seconds"), "current": out, "source": src,
                "estimates": {"alpha_minutes": ALPHA_MINUTES, "alpha_basis": "official PokeMMO changelog",
                              "swarm_minutes": sw, "swarm_basis": "provisional community estimate (reports say ~15, 20 or 30 min)"},
                "complete": False}

    def species_match(self, title: str, body: str, sid: int) -> str:
        """How reliably a report identifies species `sid`: 'title' (the title is exactly the name),
        'single-mention' (the only species named in the text) or 'ambiguous'."""
        if title and self.dex.find_by_name(title) == sid:
            return "title"
        hay = f"{title} {body}".lower()
        found = set()
        for name, other in self._names:
            pat = r"(?<![\w])" + re.escape(name.lower()) + r"(?![\w])"
            if re.search(pat, hay):
                found.add(other)
                hay = re.sub(pat, " ", hay)  # "Mr. Mime" must not also count as another name inside it
        return "single-mention" if found == {sid} else "ambiguous"

    def get(self, rid: str) -> dict:
        r = self.db.query_one("SELECT * FROM reports WHERE id=?", (rid,))
        if not r:
            raise KeyError(rid)
        anchor = self.db.query_one("SELECT * FROM reports WHERE event_id=? ORDER BY event_at, rowid LIMIT 1",
                                   (r["event_id"],)) if r["event_id"] else None
        status = report_status(anchor, datetime.now(timezone.utc), self.swarm_minutes()) if anchor else None
        return self._row(r, status=status)

    def list(self, kind: str | None = None, q: str | None = None, include_tests: bool = True,
             limit: int = 300, region: str | None = None) -> list[dict]:
        sql = "SELECT * FROM reports WHERE kind<>'phenomena'"
        args: list = []
        if region in REGION_NAMES:
            sql += " AND region=?"
            args.append(region)
        if kind in ("alpha", "swarm", "other", "test"):
            sql += " AND kind=?"
            args.append(kind)
        if not include_tests:
            sql += " AND is_test=0"
        if q:
            sql += " AND (title LIKE ? OR body LIKE ?)"
            args += [f"%{q}%", f"%{q}%"]
        sql += " ORDER BY COALESCE(source_time, received_at) DESC LIMIT ?"
        args.append(limit)
        return [self._row(r) for r in self.db.query(sql, args)]

    def mark_seen(self, rid: str | None = None) -> int:
        if rid:
            return self.db.execute("UPDATE reports SET seen=1 WHERE id=?", (rid,))
        return self.db.execute("UPDATE reports SET seen=1 WHERE seen=0")

    def clear(self, tests_only: bool = False) -> int:
        n = self.db.execute("DELETE FROM reports WHERE kind<>'phenomena'" + (" AND is_test=1" if tests_only else ""))
        self.bus.publish("live.report", {"cleared": n})
        return n

    def prune(self) -> int:
        days = int(self.settings.get("notify.retention_days") or 30)
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat().replace("+00:00", "Z")
        return self.db.execute("DELETE FROM reports WHERE kind<>'phenomena' AND received_at < ?", (cutoff,))

    # ------------------------------------------------------------ delivery
    def deliver(self, report: dict) -> dict:
        kind = "test" if report["is_test"] else report["kind"]
        route = self.settings.get(f"notify.{kind}") or "off"
        quiet = bool(self.settings.get("notify.quiet"))
        result = self.dispatch_notification(route, quiet, self.toast_payload(report))
        self.db.execute("UPDATE reports SET delivery=? WHERE id=?", (json.dumps(result), report["id"]))
        return result

    def dispatch_notification(self, route: str, quiet: bool, payload: dict) -> dict:
        result: dict = {"route": route, "quiet": quiet, "at": utcnow()}
        if quiet and not payload["is_test"]:
            result["suppressed"] = "Do not disturb is on — saved to history only"
        else:
            if route in ("toast", "both"):
                if self.toast_backend:
                    try:
                        result["toast"] = {"delivered": bool(self.toast_backend(payload)), "backend": "qt-window"}
                    except Exception as exc:  # pragma: no cover
                        result["toast"] = {"delivered": False, "error": str(exc)}
                else:
                    self.bus.publish("toast", payload)
                    result["toast"] = {"delivered": self.bus.subscriber_count > 0, "backend": "in-window",
                                       "note": "Shown inside open Companion windows (browser mode)"}
            if route in ("os", "both"):
                result["os"] = self.notifier.notify(payload["title"], payload["line"])
        return result

    def toast_payload(self, report: dict) -> dict:
        label = {"alpha": "Alpha report", "swarm": "Swarm report", "phenomena": "Phenomenon report", "test": "TEST notification"}.get(
            "test" if report["is_test"] else report["kind"], "Community report")
        where = ", ".join(x for x in ((report.get("region") or "").capitalize(), report.get("location") or "") if x)
        language = self.settings.get("app.language") or "en"
        label = native_text(label, language)
        report_title = report['title'] or report['species_name'] or native_text('Details in Live', language)
        line = report['body'] or ''
        if report['is_test']:
            report_title = native_text(report_title, language)
            line = native_text(line, language)
        title = f"{label}: {report_title}"
        if where and not report["is_test"]:
            title += f" — {where}"
        when = report.get("source_time") or report["received_at"]
        return {"id": report["id"], "kind": "test" if report["is_test"] else report["kind"], "title": title[:120],
                "line": line[:200], "reported": when, "is_test": bool(report["is_test"]),
                "species_icon": report.get("species_icon"),
                "corner": self.settings.get("notify.toast_corner"),
                "duration": self.settings.get("notify.toast_duration"),
                "opacity": self.settings.get("notify.toast_opacity"),
                "screen": self.settings.get("notify.toast_screen")}

    def create_test(self, kind: str = "alpha") -> dict:
        kind = kind if kind in ("alpha", "swarm") else "alpha"
        rid = uuid.uuid4().hex[:16]
        title = f"TEST — demo {kind} notification"
        body = ("Local test generated by the Companion to check toasts and OS notifications. "
                "This is NOT a real Alpha/Swarm report and says nothing about the game.")
        self.db.execute("INSERT INTO reports(id, provider, topic, message_id, kind, kind_basis, title, body, tags, "
                        "received_at, is_test, parser_version) VALUES(?,?,?,?,?,?,?,?,?,?,1,?)",
                        (rid, "companion-test", None, rid, kind, "test", title, body, "[]", utcnow(), "test"))
        report = self.get(rid)
        report["delivery"] = self.deliver(report)
        self.bus.publish("live.report", {"id": rid, "test": True})
        return report

    # ------------------------------------------------------------ ntfy loop
    def apply_settings(self) -> None:
        enabled = bool(self.settings.get("live.ntfy.enabled")) and bool(self.settings.get("live.ntfy.consented"))
        running = self._thread is not None and self._thread.is_alive()
        if enabled and not running:
            self._stop.clear()
            self._thread = threading.Thread(target=self._run, name="ntfy", daemon=True)
            self._thread.start()
        elif not enabled and running:
            self._stop.set()
            self._health("disabled", "Turned off by you")

    def stop(self) -> None:
        self._stop.set()
        self.phenomena.stop()

    def _run(self) -> None:
        backoff = 5
        while not self._stop.is_set():
            server = str(self.settings.get("live.ntfy.server")).rstrip("/")
            topic = str(self.settings.get("live.ntfy.topic"))
            if not re.match(r"^https://[\w.\-]+(:\d+)?$", server) or not re.match(r"^[\w\-]{1,64}(,[\w\-]{1,64}){0,4}$", topic):
                self._health("error", "Invalid server or topic (HTTPS host and simple topic name required)")
                return
            # A bounded catch-up also works when the last cached ID belongs to another topic
            # or has expired from the provider's cache. The database deduplicates overlap.
            url = f"{server}/{urllib.parse.quote(topic, safe=',')}/json?since=12h"
            self._health("connecting", url)
            requested_at = time.time()
            try:
                req = urllib.request.Request(url, headers={"User-Agent": f"PokeMMO-Companion/{__version__} (read-only)"})
                with urllib.request.urlopen(req, timeout=75) as resp:
                    self._health("connected", "Listening (read-only)", success=True)
                    backoff = 5
                    for line in resp:
                        if self._stop.is_set():
                            return
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            msg = json.loads(line)
                        except ValueError:
                            msg = None
                        if not isinstance(msg, dict):
                            self._health("connected", "Ignored a malformed line from the feed", success=True)
                            continue
                        ev = msg.get("event")
                        if ev == "keepalive" or ev == "open":
                            self._health("connected", "Listening (read-only)", success=True)
                            continue
                        if ev != "message":
                            continue  # message_delete/clear semantics unverified for this provider
                        reported = _parse_iso(iso_from_epoch(msg.get("time")))
                        replay = reported is None or reported.timestamp() < requested_at
                        self.ingest(msg, "ntfy", replay=replay)
                    if not self._stop.is_set():
                        self._health("offline", f"Feed connection closed — retrying in {backoff}s")
            except (OSError, ValueError, http.client.HTTPException) as exc:
                if self._stop.is_set():          # closing: the connection was cut on purpose; nothing to record
                    return
                self._health("offline", f"{type(exc).__name__}: {str(exc)[:160]} — retrying in {backoff}s")
            if self._stop.wait(backoff):
                return
            backoff = min(backoff * 2, 120)

    # --------------------------------------------------------- legendaries
    def legendaries(self, run_id: str | None, today: datetime | None = None) -> dict:
        now = today or datetime.now()
        month = now.month
        cyc = self.legend["cycle"]

        def pair(m: int) -> dict:
            out = {}
            for region in ("kanto", "johto"):
                sid = cyc[region][str(m)]
                lib = self.dex.library
                out[region] = {"id": sid, "name": self.dex.name(sid), "icon": self.dex.sprite_url(sid), "still": self.dex.still(sid),
                               "ani": lib.urls(str(sid)).get("ani") if lib is not None and lib.installed else None,
                               "types": self.dex.index[sid]["types"]}
            return out
        caught = {}
        if run_id:
            caught = {r["species_id"]: bool(r["caught"]) for r in
                      self.db.query("SELECT species_id, caught FROM legendary_progress WHERE run_id=?", (run_id,))}
        months = []
        for i in range(12):
            m = (month - 1 + i) % 12 + 1
            year = now.year + ((month - 1 + i) // 12)
            months.append({"month": m, "year": year, **pair(m)})
        return {"current": months[0], "next": months[1], "calendar": months, "caught": caught,
                "status": self.legend["status"], "status_note": self.legend["status_note"],
                "source_url": self.legend["source_url"], "checked_at": self.legend["checked_at"],
                "requirements": self.legend["requirements"], "not_roamers": self.legend["not_roamers"]}

    def set_caught(self, run_id: str, species_id: int, caught: bool) -> None:
        if species_id not in (144, 145, 146, 243, 244, 245):
            raise ValueError("Only the six monthly roamers are tracked here")
        self.db.execute("INSERT INTO legendary_progress(run_id, species_id, caught, updated_at) VALUES(?,?,?,?) "
                        "ON CONFLICT(run_id, species_id) DO UPDATE SET caught=excluded.caught, updated_at=excluded.updated_at",
                        (run_id, species_id, 1 if caught else 0, utcnow()))

    # -------------------------------------------------------- Altering Cave
    def cave(self) -> dict:
        obs = self.db.query("SELECT * FROM cave_observations ORDER BY observed_at DESC LIMIT 200")
        now = datetime.now(timezone.utc)
        for o in obs:
            try:
                age_h = (now - datetime.fromisoformat(o["observed_at"].replace("Z", "+00:00"))).total_seconds() / 3600
            except ValueError:
                age_h = None
            o["age_hours"] = round(age_h, 1) if age_h is not None else None
            o["freshness"] = "recent" if age_h is not None and age_h < 6 else "historical"
        return {
            "current": {"status": "unknown",
                        "label": "No confirmed current rotation available",
                        "reason": "No verified, permitted live source for Altering Cave is connected. "
                                  "The dump's two static Unown rows are not a rotation feed."},
            "mechanics": [
                {"text": "Inhabitants and Pickup rewards rotate every in-game day.",
                 "source": "Official changelog 29 Jul 2026",
                 "url": "https://forums.pokemmo.com/index.php?/topic/199536-changelog-shiny-wars-2026/"},
                {"text": "An in-game day is commonly reported as about six real hours — server sync not verified, "
                         "so no countdown is shown.", "source": "PokeMMO wiki (community)",
                 "url": "https://pokemmo.shoutwiki.com/wiki/Altering_Cave"},
                {"text": "Some species were temporarily removed for rebalancing on 30 Oct 2026; older species "
                         "pools are stale.", "source": "Official changelog 30 Oct 2026",
                 "url": "https://forums.pokemmo.com/index.php?/topic/201356-changelog-30102026/"},
            ],
            "community": [{"label": "Community Altering Cave tracker (not integrated — feed/permission unverified)",
                           "url": ALPHAPEDIA_URL + "altering-cave"},
                          {"label": "Altering Cave data thread (official forum, community posts)",
                           "url": "https://forums.pokemmo.com/index.php?/topic/199670-altering-cave-data/"}],
            "observations": obs,
        }

    def add_observation(self, data: dict) -> dict:
        oid = uuid.uuid4().hex[:12]
        observed = sanitize(data.get("observed_at"), 40) or utcnow()
        try:
            datetime.fromisoformat(observed.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("observed_at must be an ISO date/time") from exc
        self.db.execute("INSERT INTO cave_observations(id, observed_at, crystal, species, method, notes, source, created_at) "
                        "VALUES(?,?,?,?,?,?,?,?)",
                        (oid, observed, sanitize(data.get("crystal"), 60), sanitize(data.get("species"), 200),
                         sanitize(data.get("method"), 40), sanitize(data.get("notes"), 500), "your-observation", utcnow()))
        return {"id": oid}

    def delete_observation(self, oid: str) -> bool:
        return self.db.execute("DELETE FROM cave_observations WHERE id=?", (oid,)) > 0
