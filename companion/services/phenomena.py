"""Poll the owner-configured relay and keep Phenomenon history in Live storage."""
from __future__ import annotations

import http.client
import ipaddress
import json
import socket
import threading
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError
from urllib.request import Request

from ..phenomenon_protocol import (
    IMAGE_HOST, MAX_REPORTS, endpoint_url, image_url, merge_report, opener, read_json, timestamp, validate_report,
)
from ..storage import utcnow

POLL_SECONDS = 60
RECENT_MINUTES = 60  # Display age only, never used as an activity or despawn estimate.
STALE_SECONDS = 180
VALID_SOURCE = {"starting", "connected", "offline", "invalid_response", "access_denied", "rate_limited"}
MAX_IMAGE_BYTES = 12 * 1024 * 1024


def cutoff(now, minutes):
    return timestamp((now - timedelta(minutes=minutes)).isoformat())


def parse_feed(raw):
    if not isinstance(raw, dict) or type(raw.get("version")) is not int or raw["version"] != 1:
        raise ValueError("Unsupported feed version")
    source, reports = raw.get("source"), raw.get("reports")
    if (not isinstance(source, dict) or not isinstance(source.get("status"), str)
            or source["status"] not in VALID_SOURCE or not isinstance(reports, list) or len(reports) > MAX_REPORTS):
        raise ValueError("Malformed feed")
    last_success = timestamp(source.get("last_success_at"))
    if source["status"] == "connected" and not last_success:
        raise ValueError("Missing refresh time")
    normalized = {}
    for raw_report in reports:
        report = validate_report(raw_report)
        if report is None:
            raise ValueError("Malformed report")
        mid = report["message_id"]
        normalized[mid] = merge_report(normalized.get(mid), report)
    return {"status": source["status"], "last_success_at": last_success}, normalized.values()


class Phenomena:
    def __init__(self, live):
        self.live = live
        self.db = live.db
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._wake = threading.Event()
        self._thread = None
        self._endpoint = ""
        self._generation = 0
        self._source = {"status": "disabled", "last_success_at": None}
        self._baseline = None

    def apply_settings(self):
        try:
            endpoint = endpoint_url(self.live.settings.get("live.phenomena.endpoint"))
        except ValueError:  # A settings backup may predate validation.
            endpoint = ""
        with self._lock:
            if self._stop.is_set() or endpoint == self._endpoint:
                return
            self._endpoint = endpoint
            self._generation += 1
            self._baseline = None
            self._source = {"status": "starting" if endpoint else "disabled", "last_success_at": None}
            if endpoint and self._thread is None:
                self._thread = threading.Thread(target=self._run, name="phenomena", daemon=True)
                self._thread.start()
            self._wake.set()
        self.live.bus.publish("live.phenomena")

    def stop(self):
        with self._lock:
            self._stop.set()
            self._wake.set()

    def _run(self):
        while not self._stop.is_set():
            with self._lock:
                self._wake.clear()
                endpoint, generation = self._endpoint, self._generation
            if endpoint:
                self.poll(endpoint, generation)
            self._wake.wait(POLL_SECONDS if endpoint else None)

    def poll(self, endpoint, generation, fetch=opener.open):
        try:
            with fetch(Request(endpoint, headers={"Accept": "application/json"}), timeout=3) as response:
                source, reports = parse_feed(read_json(response))
        except HTTPError as exc:
            exc.close()
            source, reports = None, ()
        except (OSError, ValueError, http.client.HTTPException):
            source, reports = None, ()
        now = datetime.now(timezone.utc)
        now_iso = timestamp(now.isoformat())
        with self._lock:
            if self._stop.is_set() or generation != self._generation:
                return
            if source is None:
                self._source = {**self._source, "status": "offline"}
            else:
                self._source = source
            last = self._source["last_success_at"]
            if self._source["status"] == "connected" and not (
                cutoff(now, STALE_SECONDS / 60) <= last <= timestamp((now + timedelta(minutes=2)).isoformat())
            ):
                self._source["status"] = "stale"
            healthy = self._source["status"] == "connected"
            lower = self._baseline if healthy else None
            if healthy:
                # Use the relay's previous refresh time. Replays after downtime establish a new baseline.
                self._baseline = max(last, self._baseline or last)
            else:
                self._baseline = None
            pending = self._store(reports, lower, now_iso) if reports else []
        self.live.bus.publish("live.phenomena")
        for rid, route, quiet, payload in pending:
            if self._stop.is_set():
                return
            result = self.live.dispatch_notification(route, quiet, payload)
            with self._lock:
                if not self._stop.is_set():
                    self.db.execute("UPDATE reports SET delivery=? WHERE id=?", (json.dumps(result), rid))

    def _store(self, reports, lower, now):
        pending = []
        route = self.live.settings.get("notify.phenomena")
        quiet = bool(self.live.settings.get("notify.quiet"))
        with self.db.tx() as conn:
            for incoming in reports:
                mid = incoming["message_id"]
                rid = "phenomena-" + mid
                row = conn.execute("SELECT phenomenon FROM reports WHERE id=?", (rid,)).fetchone()
                previous = json.loads(row[0]) if row else None
                report = merge_report(previous, incoming)
                if report == previous:
                    continue
                title = " at ".join(t for t in (report["type"], report["location"]) if t) or "Phenomenon report"
                fields = (title, report["description"], report["reported_at"], report["region"], report["location"],
                          report["source_url"], json.dumps(report))
                if previous:
                    conn.execute("UPDATE reports SET title=?, body=?, source_time=?, region=?, location=?, source_url=?, "
                                 "phenomenon=? WHERE id=?", (*fields, rid))
                    continue
                fresh = bool(lower and lower < report["reported_at"] <= now)
                conn.execute("INSERT INTO reports(id, provider, message_id, kind, kind_basis, title, body, source_time, "
                             "region, location, source_url, phenomenon, received_at, is_replay) "
                             "VALUES(?, 'discord-relay', ?, 'phenomena', 'provider', ?,?,?,?,?,?,?,?,?)",
                             (rid, mid, *fields, utcnow(), int(not fresh)))
                if fresh and route != "off":
                    payload = self.live.toast_payload({"id": rid, "kind": "phenomena", "is_test": False,
                        "title": title, "body": report["notes"] or report["description"],
                        "source_time": report["reported_at"]})
                    pending.append((rid, route, quiet, {**payload, "route": "#/live/phenomena/" + mid}))
        return pending

    def history(self, mid=None, now=None, *, home=False):
        now = now or datetime.now(timezone.utc)
        with self._lock:
            source = dict(self._source)
        rows = self.db.query("SELECT phenomenon, is_replay FROM reports WHERE kind='phenomena' "
                             "ORDER BY source_time DESC, message_id DESC LIMIT 300")
        reports = [{**json.loads(row["phenomenon"]), "caught_up": bool(row["is_replay"])} for row in rows]
        recent = [r for r in reports if cutoff(now, RECENT_MINUTES) <= r["reported_at"] <= timestamp(now.isoformat())]
        if home:
            return {"source": source, "recent": recent[:2], "recent_minutes": RECENT_MINUTES}
        selected = self.report(mid) if mid else None
        return {"source": source, "recent": recent, "history": reports, "selected": selected,
                "recent_minutes": RECENT_MINUTES}

    def report(self, mid):
        row = self.db.query_one("SELECT phenomenon, is_replay FROM reports WHERE kind='phenomena' AND message_id=?", (mid,))
        return {**json.loads(row["phenomenon"]), "caught_up": bool(row["is_replay"])} if row else None


class PublicImageConnection(http.client.HTTPSConnection):
    def connect(self):
        # Connect directly to a checked address while still verifying TLS for the approved hostname.
        addresses = socket.getaddrinfo(self.host, self.port, type=socket.SOCK_STREAM)
        for family, socktype, proto, _, sockaddr in addresses:
            ip = ipaddress.ip_address(sockaddr[0])
            if not ip.is_global or ip.is_multicast or ip.is_reserved or ip.is_site_local:
                continue
            with socket.socket(family, socktype, proto) as raw:
                raw.settimeout(self.timeout)
                try:
                    raw.connect(sockaddr)
                except OSError:
                    continue
                self.sock = self._context.wrap_socket(raw, server_hostname=self.host)
                return
        raise OSError("Approved image host unavailable")


def fetch_image(url):
    """Read original raster bytes from the approved host. Redirects and proxies are excluded."""
    if not image_url(url):
        raise ValueError("Unsupported image URL")
    ext = url.rsplit(".", 1)[1].lower()
    mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}[ext]
    conn = PublicImageConnection(IMAGE_HOST, timeout=3)
    try:
        conn.request("GET", "/" + url.rsplit("/", 1)[1], headers={"Accept": mime})
        with conn.getresponse() as response:
            if response.status != 200 or response.headers.get_content_type() != mime:
                raise ValueError("Unsupported image response")
            data = response.read(MAX_IMAGE_BYTES + 1)
        signatures = {"image/jpeg": b"\xff\xd8\xff", "image/png": b"\x89PNG\r\n\x1a\n", "image/webp": b"RIFF"}
        if (len(data) > MAX_IMAGE_BYTES or not data.startswith(signatures[mime])
                or (mime == "image/webp" and data[8:12] != b"WEBP")):
            raise ValueError("Invalid image")
        return mime, data
    finally:
        conn.close()
