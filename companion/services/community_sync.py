"""Companion's opt-in transport for the loopback community prototype."""

import hashlib
import http.client
import json
import logging
import os
import re
import threading
import time
from dataclasses import dataclass

from ..community_protocol import (
    CommunityError, CONTRIBUTOR, MAX_RESPONSE, PAGE_SIZE, REGULAR_ID, TEST_TOKEN, VERSION,
    seconds_between, validate_observation, wire_observation,
)
from ..phenomenon_protocol import plain, timestamp
from ..storage import StorageClosedError, utcnow

log = logging.getLogger(__name__)
SHARED = "companion-shared"
POLL_INTERVAL = 0.5
FRESH_SECONDS = 5


def _matches_observation(received, sent):
    # The service can have a different catalog display label for the same location ID.
    return all(received.get(key) == value for key, value in sent.items()
               if key != "location_label" and (key != "spot_id" or key in received))


@dataclass(frozen=True)
class TestConnection:
    port: int
    read_token: str
    contributor: str = ""
    write_token: str = ""

    @classmethod
    def from_env(cls):
        origin = re.fullmatch(r"http://127\.0\.0\.1:([0-9]{1,5})/?", os.environ.get("COMPANION_COMMUNITY_URL", ""))
        token = os.environ.get("COMPANION_COMMUNITY_READ_TOKEN", "")
        if not origin or not 0 < int(origin[1]) <= 65535 or not TEST_TOKEN.fullmatch(token):
            return None
        actor = os.environ.get("COMPANION_COMMUNITY_CONTRIBUTOR", "")
        writer = os.environ.get("COMPANION_COMMUNITY_WRITE_TOKEN", "")
        if not CONTRIBUTOR.fullmatch(actor) or not TEST_TOKEN.fullmatch(writer) or writer == token:
            actor, writer = "", ""
        return cls(int(origin[1]), token, actor, writer)

    def request(self, path, *, payload=None, service=None):
        headers = {"Authorization": "Bearer " + (self.read_token if payload is None else self.write_token),
                   "Accept": "application/json"}
        body = None
        if payload is not None:
            body = json.dumps(payload).encode("utf-8")
            headers.update({"Content-Type": "application/json", "X-Community-Service": service,
                            "X-Community-Contributor": self.contributor})
        # Explicit loopback socket. No proxy, redirects, ambient credentials, or LAN destinations.
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=2)
        try:
            conn.request("GET" if payload is None else "POST", path, body=body, headers=headers)
            with conn.getresponse() as response:
                raw = response.read(MAX_RESPONSE + 1)
                if len(raw) > MAX_RESPONSE or response.headers.get_content_type() != "application/json":
                    raise ValueError("Invalid relay response")
                data = json.loads(raw)
                if not isinstance(data, dict):
                    raise ValueError("Invalid relay response")
                if response.status != 200:
                    key = data.get("error", "")
                    permitted = {"share_denied", "share_service_changed", "stale_share", "id_conflict",
                                 "inactive", "missing", "own_only"}
                    suffix = key.removeprefix("community.") if isinstance(key, str) else ""
                    raise CommunityError(suffix if suffix in permitted else "share_rejected", response.status)
                return data
        finally:
            conn.close()


class CommunitySync:
    def __init__(self, community):
        self.community = community
        self.live = community.live
        self.db = community.db
        self.config = TestConnection.from_env()
        self.connection = "unavailable"
        self.service_id = None
        self.seq = 0
        self._last_poll = None
        self._stop = threading.Event()
        self._wake = threading.Event()
        self._io = threading.Lock()
        self._lifecycle = threading.Lock()
        self._thread = None

    def receiving(self):
        settings = self.live.settings
        return bool(settings.get("live.community.enabled") and settings.get("live.community.receive"))

    def sharing(self):
        return bool(self.receiving() and self.config and self.config.write_token and
                    self.live.settings.get("live.community.share"))

    def status(self):
        enabled = self.live.settings.get("live.community.enabled")
        base = {"enabled": enabled, "status": "local-test" if enabled else "disabled", "connection": "unavailable"}
        if self.receiving():
            base.update(connection=self.connection, receive_enabled=True,
                        can_share=bool(self.sharing() and self.service_id))
        return base

    def _status(self, value):
        if self.connection != value:
            self.connection = value
            self.live.bus.publish("live.community", self.status())

    def apply_settings(self):
        with self._lifecycle:
            if self._stop.is_set():
                return
            if not self.receiving() or not self.config:
                self._last_poll = None
                self._status("unavailable")
            elif not self._thread:
                self._status("connecting")
                self._thread = threading.Thread(target=self._run, daemon=True, name="community-test")
                self._thread.start()
            elif self.connection == "unavailable":
                self._status("connecting")
            self._wake.set()
        self.live.bus.publish("live.community", self.status())

    def stop(self):
        self._stop.set()
        self._wake.set()

    def _run(self):
        while not self._stop.is_set():
            if self.receiving() and self.config:
                self.poll()
            self._wake.wait(POLL_INTERVAL)
            self._wake.clear()

    def poll(self):
        if not self.receiving() or not self.config or self._stop.is_set():
            return
        with self._io:
            try:
                page = self.config.request("/v1/feed?after=" + str(self.seq))
                if self._stop.is_set() or not self.receiving():
                    return
                service = self._service(page)
                if service != self.service_id:
                    self.service_id = service
                    saved = self.db.query_one("SELECT seq FROM community_cursors WHERE service_id=?", (service,))
                    old = self.seq
                    self.seq = saved["seq"] if saved else 0
                    self._last_poll = None
                    self._status("connecting")
                    if old != self.seq:
                        return
                head, changes = page.get("head"), page.get("changes")
                if type(head) is not int or head < self.seq or not isinstance(changes, list) or len(changes) > PAGE_SIZE:
                    raise ValueError("Invalid feed cursor")
                after = self.seq
                now = time.monotonic()
                live = self._last_poll is not None and now - self._last_poll <= FRESH_SECONDS
                notifications, changed = [], set()
                swarm_minutes = self.live.swarm_minutes()
                if changes:
                    with self.db.tx() as conn:
                        for change in changes:
                            self._validate_change(change)
                            if change["seq"] != after + 1 or change["seq"] > head:
                                raise ValueError("Invalid feed order")
                            rid, kind, notify = self._apply(conn, change, live, swarm_minutes)
                            if kind:
                                changed.add(kind)
                            if notify:
                                notifications.append(rid)
                            after = change["seq"]
                        conn.execute("INSERT INTO community_cursors VALUES(?,?) ON CONFLICT(service_id) "
                                     "DO UPDATE SET seq=excluded.seq", (service, after))
                elif head != after:
                    raise ValueError("Incomplete feed page")
                self.seq = after
                if self.seq == head:
                    self._last_poll = time.monotonic()
                    self._status("connected")
                for rid in notifications:
                    if not self._stop.is_set():
                        self.live.deliver(self.live.get(rid))
                for kind in changed:
                    self.live.bus.publish("live.report", {"kind": kind})
            except StorageClosedError:
                if not self._stop.is_set():
                    raise
            except (OSError, ValueError, http.client.HTTPException, RecursionError):
                self._last_poll = None
                if self.receiving() and not self._stop.is_set():
                    self._status("disconnected")

    @staticmethod
    def _service(page):
        service = page.get("service_id")
        if page.get("version") != VERSION or not isinstance(service, str) or not REGULAR_ID.fullmatch(service):
            raise ValueError("Unsupported relay response")
        return service

    @staticmethod
    def _validate_change(change):
        if not isinstance(change, dict) or type(change.get("seq")) is not int:
            raise ValueError("Invalid change")
        action, rid, target = change.get("action"), change.get("id"), change.get("target")
        actor = change.get("contributor")
        if (not isinstance(rid, str) or not REGULAR_ID.fullmatch(rid) or
                not isinstance(actor, str) or not CONTRIBUTOR.fullmatch(actor) or
                not timestamp(change.get("at"))):
            raise ValueError("Invalid change identity")
        if action not in ("create", "correct", "withdraw") or (action == "create" and target is not None):
            raise ValueError("Invalid change action")
        if action != "create" and (not isinstance(target, str) or not REGULAR_ID.fullmatch(target)):
            raise ValueError("Invalid target")
        if action != "withdraw" and not isinstance(change.get("observation"), dict):
            raise ValueError("Invalid observation")

    def _find_remote(self, conn, remote_id):
        return conn.execute(
            "SELECT r.* FROM reports r LEFT JOIN community_publications p ON r.id=p.report_id "
            "WHERE (r.provider=? AND r.message_id=?) OR (p.service_id=? AND p.remote_id=?)",
            (self.provider, remote_id, self.service_id, remote_id)).fetchone()

    @property
    def provider(self):
        return SHARED + ":" + self.service_id

    def _import_fields(self, observation, received):
        location_id = observation.get("location_id")
        if isinstance(location_id, str):
            ref = self.community.dex.location_reference(location_id)
            if not ref or ref["region"] != observation.get("region"):
                # Preserve a label from a different reference catalog without correlating it.
                data = {**observation, "location_id": None, "location_text": "", "location_unknown": True, "spot_id": None}
                if observation.get("kind") != "phenomena":
                    data["location_text"] = "Uncatalogued location"
                fields = list(validate_observation(self.community.dex, data, received))
                fields[3] = plain(observation.get("location_label"), 100)
                return fields
        return validate_observation(self.community.dex, observation, received)

    def _apply(self, conn, change, live, swarm_minutes):
        action, remote_id, actor = (change[k] for k in ("action", "id", "contributor"))
        original = self._find_remote(conn, change["target"]) if change["target"] else None
        if action == "withdraw":
            if original:
                if not original["withdrawn_at"]:
                    self.community._remove(conn, original, "withdraw", change["at"])
                conn.execute("UPDATE community_publications SET state='shared', error=NULL "
                             "WHERE report_id=? AND action='withdraw' AND service_id=?",
                             (original["id"], self.service_id))
            return None, original["kind"] if original else None, False

        now = utcnow()
        observation = change["observation"]
        mid, kind, region, place, species, title, body, observed, meta = self._import_fields(observation, now)
        meta = {**json.loads(meta), "contributor": actor, "observation_id": mid,
                "corrects": original["id"] if original else None}
        local = conn.execute(
            "SELECT r.id,p.payload FROM reports r JOIN community_publications p ON r.id=p.report_id "
            "WHERE p.service_id=? AND p.contributor=? AND r.message_id=? "
            "AND (p.action=? OR p.remote_id=?)",
            (self.service_id, actor, mid, action, remote_id)).fetchone()
        if local and not _matches_observation(observation, json.loads(local["payload"])):
            local = None
        existing = self._find_remote(conn, remote_id)
        rid = (local or existing or {"id": hashlib.sha256((self.provider + remote_id).encode()).hexdigest()[:16]})["id"]
        notify = False
        if local:
            conn.execute("UPDATE community_publications SET remote_id=?, "
                         "state=CASE WHEN action=? THEN 'shared' ELSE state END, "
                         "error=CASE WHEN action=? THEN NULL ELSE error END WHERE report_id=?",
                         (remote_id, action, action, rid))
        elif not existing:
            lag = seconds_between(now, change["at"])
            replay = not live or abs(lag) > FRESH_SECONDS
            conn.execute("INSERT INTO reports(id,provider,message_id,kind,kind_basis,region,location,species_id,title,body,"
                         "source_time,received_at,community,parser_version,is_replay) VALUES(?,?,?,?,'structured',"
                         "?,?,?,?,?,?,?,?,'community-shared-1',?)",
                         (rid, self.provider, remote_id, kind, region, place, species, title, body, observed,
                          now, json.dumps(meta), int(replay)))
            if kind != "phenomena":
                row = dict(conn.execute("SELECT * FROM reports WHERE id=?", (rid,)).fetchone())
                same = original and original["event_key"] == self.live._event_key(row)
                event, status = self.live._assign_event(conn, row, swarm_minutes,
                                                        preferred=original["event_id"] if same else None)
                notify = action == "create" and not replay and event == rid and status["state"] == "recent"
                if not replay and not notify:
                    self.live._store_suppression(conn, rid, event, now, correction=action == "correct")
        if original and not original["withdrawn_at"]:
            self.community._remove(conn, original, "correct", change["at"], rid)
        return rid, kind, notify

    def prepare(self, conn, rid, fields, previous, *, explicit):
        parent = self.publication(conn, previous["id"]) if previous else None
        if parent and (parent["state"] != "shared" or parent["action"] == "withdraw"):
            raise CommunityError("settle_share", 409)
        if not explicit:
            if parent:
                raise CommunityError("share_confirmation", 409)
            return False
        if previous and not parent:
            raise CommunityError("share_rejected", 409)
        service, actor = self._write_scope(parent)
        conn.execute("INSERT INTO community_publications(report_id,service_id,contributor,action,target,state,payload) "
                     "VALUES(?,?,?,?,?,'pending',?)",
                     (rid, service, actor, "correct" if parent else "create",
                      parent["remote_id"] if parent else None, json.dumps(wire_observation(fields))))
        return True

    @staticmethod
    def publication(conn, rid):
        return conn.execute("SELECT * FROM community_publications WHERE report_id=?", (rid,)).fetchone()

    def prepare_withdrawal(self, conn, rid):
        parent = self.publication(conn, rid)
        if not parent:
            return False
        if parent["state"] != "shared" or not parent["remote_id"]:
            raise CommunityError("settle_share", 409)
        self._write_scope(parent)
        conn.execute("UPDATE community_publications SET action='withdraw', target=remote_id, "
                     "state='pending', payload='{}', error=NULL WHERE report_id=?", (rid,))
        return True

    def _write_scope(self, parent=None):
        if not self.sharing() or not self.service_id:
            raise CommunityError("share_denied", 403)
        service, actor = self.service_id, self.config.contributor
        if parent and (parent["service_id"], parent["contributor"]) != (service, actor):
            raise CommunityError("share_service_changed", 409)
        return service, actor

    def publish(self, rid, kind):
        """Only explicit submissions or explicit retries call this method."""
        self.live.bus.publish("live.report", {"id": rid, "kind": kind})
        with self._io:
            row = self.db.query_one("SELECT * FROM community_publications WHERE report_id=?", (rid,))
            if not row:
                raise CommunityError("missing", 404)
            if row["state"] == "shared":
                return
            action, target = row["action"], row["target"]
            try:
                service, actor = self._write_scope(row)
                self.db.execute("UPDATE community_publications SET state='pending', error=NULL WHERE report_id=?", (rid,))
                self.live.bus.publish("live.report", {"id": rid, "kind": kind})
                path = "/v1/reports" if action == "create" else f"/v1/reports/{target}/{action}"
                payload = json.loads(row["payload"])
                response = self.config.request(path, payload=payload, service=service)
                if self._service(response) != service:
                    raise ValueError("Wrong service")
                change = response.get("change")
                self._validate_change(change)
                if change["contributor"] != actor or change["action"] != action or change["target"] != target:
                    raise ValueError("Mismatched acknowledgment")
                if action != "withdraw" and not _matches_observation(change["observation"], payload):
                    raise ValueError("Mismatched observation")
                self.db.execute("UPDATE community_publications SET state='shared', remote_id=?, error=NULL WHERE report_id=?",
                                (target if action == "withdraw" else change["id"], rid))
            except (OSError, ValueError, http.client.HTTPException, RecursionError) as exc:
                error = str(exc) if isinstance(exc, CommunityError) else "community.share_unreachable"
                self.db.execute("UPDATE community_publications SET state='failed', error=? WHERE report_id=?", (error, rid))
        self.live.bus.publish("live.report", {"id": rid, "kind": kind})

    def decorate(self, reports):
        ids = {rid for report in reports for rid in report.get("report_ids", [report["id"]])}
        if not ids:
            return
        by_id = {}
        ids = list(ids)
        for offset in range(0, len(ids), 500):
            batch = ids[offset:offset + 500]
            marks = ",".join("?" for _ in batch)
            for row in self.db.query(f"SELECT report_id,state,error,contributor FROM community_publications "
                                     f"WHERE report_id IN ({marks})", batch):
                by_id[row["report_id"]] = row
        for report in reports:
            publication = by_id.get(report["id"])
            if publication:
                report["publication"] = publication
            if any(by_id.get(rid, {}).get("state") == "shared" for rid in report.get("report_ids", [report["id"]])):
                report["sources"] = list(dict.fromkeys([*report["sources"], SHARED]))
