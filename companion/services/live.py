"""Live: community reports, notification routing, legendary roadmap, Altering Cave.

ntfy adapter (docs/design/11, 13):
  * Read-only subscription, disabled until the user consents.
  * Follows the documented ntfy JSON stream API (https://docs.ntfy.sh/subscribe/api/).
    The Alphapedia payload format has NOT been validated with real samples, so
    reports show the provider's own title/message text (sanitised plain text).
    Alpha/Swarm kind and species are *detected from text* and labelled as such.
  * ``expires`` is ntfy cache retention — never shown as a despawn time.
  * De-duplicated by (provider, message id). Messages older than the moment of
    (re)connection are replayed into history without toasts.
"""
from __future__ import annotations

import hashlib
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
from ..config import BUNDLED_DATA_DIR
from ..events import EventBus
from ..settings import Settings
from ..storage import Storage, utcnow
from .dex import DexService
from .notify import Notifier

PARSER_VERSION = "alphapedia-ntfy-2"
TOPIC_KIND = {"alphapings": "alpha", "swarmpings": "swarm"}
REGION_NAMES = {"kanto", "johto", "hoenn", "sinnoh", "unova"}
# Payload shape recorded from real messages on 2026-11-17 (owner project notes, companion/STATUS.md):
#   alphapings: title="Ditto",   message="Kanto, Cerulean Cave"
#   swarmpings: title="Wailmer", message="Johto\nRoute 40"
# Not re-captured live in this build; anything that doesn't match falls back to showing the raw text.
_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def sanitize(text: object, limit: int = 2000) -> str:
    if text is None:
        return ""
    return _CTRL.sub("", str(text))[:limit].strip()


def iso_from_epoch(ts: object) -> str | None:
    try:
        return datetime.fromtimestamp(int(ts), timezone.utc).isoformat().replace("+00:00", "Z")
    except (TypeError, ValueError, OSError):
        return None


class LiveService:
    def __init__(self, storage: Storage, settings: Settings, bus: EventBus, dex: DexService, notifier: Notifier):
        self.db = storage
        self.settings = settings
        self.bus = bus
        self.dex = dex
        self.notifier = notifier
        self.toast_backend: Callable[[dict], bool] | None = None  # set by the Qt shell
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._connected_at: float | None = None
        self.legend = json.loads((BUNDLED_DATA_DIR / "legendaries.json").read_text(encoding="utf-8"))
        self._names = sorted(((s["name"], sid) for sid, s in dex.index.items()), key=lambda x: -len(x[0]))

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
        parts = [p.strip() for p in re.split(r"[,\n]", body or "", maxsplit=1) if p.strip()]
        if parts and parts[0].lower() in REGION_NAMES:
            out["region"] = parts[0].lower()
            out["location"] = parts[1] if len(parts) > 1 else None
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
        tags = [sanitize(t, 40) for t in (msg.get("tags") or []) if isinstance(t, (str, int))][:10]
        topic = sanitize(msg.get("topic"), 64) or None
        det = self.detect(title, body, tags, topic)
        kind, basis, species = det["kind"], det["basis"], det["species"]
        source_url = None
        for a in (msg.get("actions") or []):
            url = a.get("url") if isinstance(a, dict) else None
            if isinstance(url, str) and url.startswith("https://alpha.pokemmotools.org/"):
                source_url = url[:300]
                break
        raw_hash = hashlib.sha256(json.dumps(msg, sort_keys=True, default=str).encode()).hexdigest()[:16]
        rid = uuid.uuid4().hex[:16]
        with self.db.tx() as c:
            cur = c.execute(
                "INSERT OR IGNORE INTO reports(id, provider, topic, message_id, kind, kind_basis, title, body, tags, "
                "species_id, source_time, received_at, is_replay, raw_hash, parser_version, region, location, source_url) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (rid, provider, topic, mid, kind, basis, title, body, json.dumps(tags),
                 species, iso_from_epoch(msg.get("time")), utcnow(), 1 if replay else 0, raw_hash, PARSER_VERSION,
                 det["region"], sanitize(det["location"], 120) or None, source_url))
            if cur.rowcount == 0:
                return None
        report = self.get(rid)
        if not replay:
            self.deliver(report)
        self.bus.publish("live.report", {"id": rid, "replay": replay})
        return report

    # ------------------------------------------------------------ queries
    def _row(self, r: dict) -> dict:
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
        return r

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
        return self._row(r)

    def list(self, kind: str | None = None, q: str | None = None, include_tests: bool = True,
             limit: int = 300) -> list[dict]:
        sql = "SELECT * FROM reports WHERE 1=1"
        args: list = []
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
        n = self.db.execute("DELETE FROM reports" + (" WHERE is_test=1" if tests_only else ""))
        self.bus.publish("live.report", {"cleared": n})
        return n

    def prune(self) -> int:
        days = int(self.settings.get("notify.retention_days") or 30)
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat().replace("+00:00", "Z")
        return self.db.execute("DELETE FROM reports WHERE received_at < ?", (cutoff,))

    # ------------------------------------------------------------ delivery
    def deliver(self, report: dict) -> dict:
        kind = "test" if report["is_test"] else report["kind"]
        route = self.settings.get(f"notify.{kind}") or "off"
        quiet = bool(self.settings.get("notify.quiet"))
        result: dict = {"route": route, "quiet": quiet, "at": utcnow()}
        if quiet and not report["is_test"]:
            result["suppressed"] = "Do not disturb is on — saved to history only"
        else:
            if route in ("toast", "both"):
                payload = self.toast_payload(report)
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
                p = self.toast_payload(report)
                result["os"] = self.notifier.notify(p["title"], p["line"])
        self.db.execute("UPDATE reports SET delivery=? WHERE id=?", (json.dumps(result), report["id"]))
        return result

    def toast_payload(self, report: dict) -> dict:
        label = {"alpha": "Alpha report", "swarm": "Swarm report", "test": "TEST notification"}.get(
            "test" if report["is_test"] else report["kind"], "Community report")
        where = ", ".join(x for x in ((report.get("region") or "").capitalize(), report.get("location") or "") if x)
        title = f"{label}: {report['title'] or report['species_name'] or 'Details in Live'}"
        if where and not report["is_test"]:
            title += f" — {where}"
        when = report.get("source_time") or report["received_at"]
        return {"id": report["id"], "kind": "test" if report["is_test"] else report["kind"], "title": title[:120],
                "line": (report["body"] or "")[:200], "reported": when, "is_test": bool(report["is_test"]),
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

    def _last_message_id(self) -> str | None:
        r = self.db.query_one("SELECT message_id FROM reports WHERE provider='ntfy' AND is_test=0 "
                              "ORDER BY COALESCE(source_time, received_at) DESC LIMIT 1")
        return r["message_id"] if r else None

    def _run(self) -> None:
        backoff = 5
        while not self._stop.is_set():
            server = str(self.settings.get("live.ntfy.server")).rstrip("/")
            topic = str(self.settings.get("live.ntfy.topic"))
            if not re.match(r"^https://[\w.\-]+(:\d+)?$", server) or not re.match(r"^[\w\-]{1,64}(,[\w\-]{1,64}){0,4}$", topic):
                self._health("error", "Invalid server or topic (HTTPS host and simple topic name required)")
                return
            since = self._last_message_id() or "12h"
            url = f"{server}/{urllib.parse.quote(topic, safe=',')}/json?since={urllib.parse.quote(since)}"
            self._health("connecting", url)
            try:
                req = urllib.request.Request(url, headers={"User-Agent": f"PokeMMO-Companion/{__version__} (read-only)"})
                with urllib.request.urlopen(req, timeout=75) as resp:
                    self._connected_at = time.time()
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
                            self._health("connected", "Ignored a malformed line from the feed", success=True)
                            continue
                        ev = msg.get("event")
                        if ev == "keepalive" or ev == "open":
                            self._health("connected", "Listening (read-only)", success=True)
                            continue
                        if ev != "message":
                            continue  # message_delete/clear semantics unverified for this provider
                        try:
                            replay = int(msg.get("time", 0)) < (self._connected_at or 0) - 30
                        except (TypeError, ValueError):
                            replay = True
                        self.ingest(msg, "ntfy", replay=replay)
            except (urllib.error.URLError, OSError, ValueError) as exc:
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
                out[region] = {"id": sid, "name": self.dex.name(sid), "icon": self.dex.sprite_url(sid), "still": self.dex.still(sid),
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
                           "url": "https://alpha.pokemmotools.org/altering-cave"},
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
