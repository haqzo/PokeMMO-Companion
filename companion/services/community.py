"""Structured, profile-local observations and encounter actions."""

import json
import uuid
from collections import defaultdict

from ..community_protocol import CommunityError, KINDS, PHENOMENA, validate_observation
from ..storage import utcnow
from .community_sync import CommunitySync

PROVIDER = "companion-local"
FEEDBACK = ("still_here", "not_found")
PERSONAL = ("complete", "reopen")


class Community:
    def __init__(self, live):
        self.live = live
        self.db = live.db
        self.dex = live.dex
        self.sync = CommunitySync(self)

    def source_status(self):
        return self.sync.status()

    def options(self):
        return {"source": self.source_status(), "kinds": KINDS, "phenomenon_types": PHENOMENA,
                "locations": [ref for loc in self.dex.locations()
                              if (ref := self.dex.location_reference(loc["id"]))]}

    def _require_enabled(self):
        if not self.source_status()["enabled"]:
            raise CommunityError("disabled", 403)

    def submit(self, data, correction=None):
        """Insert one observation and reserve its notification in the same write transaction."""
        self._require_enabled()
        received, rid = utcnow(), uuid.uuid4().hex[:16]
        swarm_minutes = self.live.swarm_minutes()
        sharing = False
        with self.db.tx() as conn:
            previous = self._target(conn, correction, own=True) if correction else None
            fields = validate_observation(self.dex, data, received, previous)
            if type(data.get("share", False)) is not bool:
                raise CommunityError("invalid_report")
            mid, kind, region, place, species, title, body, observed, meta = fields
            existing = conn.execute("SELECT * FROM reports WHERE provider=? AND message_id=?", (PROVIDER, mid)).fetchone()
            if existing:
                stored = tuple(existing[key] for key in ("message_id", "kind", "region", "location",
                                                         "species_id", "title", "body", "source_time", "community"))
                if stored != fields:
                    raise CommunityError("id_conflict", 409)
                rid, notify, changed = existing["id"], False, False
                prior_publication = self.sync.publication(conn, rid)
                if data.get("share") and not prior_publication:
                    raise CommunityError("id_conflict", 409)
                sharing = bool(data.get("share") and prior_publication and prior_publication["action"] != "withdraw"
                               and not existing["withdrawn_at"])
            else:
                if previous and previous["withdrawn_at"]:
                    raise CommunityError("inactive", 409)
                conn.execute(
                    "INSERT INTO reports(id, provider, message_id, kind, kind_basis, region, location, species_id, "
                    "title, body, source_time, received_at, community, parser_version) "
                    "VALUES(?,?,?,?,'structured',?,?,?,?,?,?,?,?,'community-local-1')",
                    (rid, PROVIDER, mid, kind, region, place, species, title, body, observed, received, meta))
                notify, changed = False, True
                if kind != "phenomena":
                    row = dict(conn.execute("SELECT * FROM reports WHERE id=?", (rid,)).fetchone())
                    same_key = previous and previous["event_key"] == self.live._event_key(row)
                    event_id, status = self.live._assign_event(conn, row, swarm_minutes,
                                                               preferred=previous["event_id"] if same_key else None)
                    notify = not previous and event_id == rid and status["state"] == "recent"
                    if not notify:
                        self.live._store_suppression(conn, rid, event_id, received, correction=bool(previous))
                if previous:
                    self._remove(conn, previous, "correct", received, rid)
                sharing = self.sync.prepare(conn, rid, fields, previous, explicit=data.get("share", False))
        report = self.live.get(rid)
        if notify:
            report["delivery"] = self.live.deliver(report)
        if changed:
            self.live.bus.publish("live.report", {"id": rid, "kind": report["kind"]})
        if sharing:
            self.sync.publish(rid, report["kind"])
            report = self.live.get(rid)
        return report

    @staticmethod
    def _target(conn, rid, *, own=False):
        row = conn.execute("SELECT * FROM reports WHERE id=?", (rid,)).fetchone()
        if not row or row["kind"] not in KINDS or row["is_test"] or row["kind"] == "phenomena" and not row["community"]:
            raise CommunityError("missing", 404)
        if own and row["provider"] != PROVIDER:
            raise CommunityError("own_only", 403)
        return row

    @staticmethod
    def _append(conn, row, action, now, related=None):
        conn.execute("INSERT INTO live_actions(report_id, event_id, action, created_at, related_id) VALUES(?,?,?,?,?)",
                     (row["id"], row["event_id"] or row["id"], action, now, related))

    def _remove(self, conn, row, action, now, related=None):
        conn.execute("UPDATE reports SET withdrawn_at=? WHERE id=?", (now, row["id"]))
        self._append(conn, row, action, now, related)

    def act(self, rid, action):
        self._require_enabled()
        if action not in (*FEEDBACK, *PERSONAL, "withdraw"):
            raise CommunityError("invalid_action")
        sharing = False
        with self.db.tx() as conn:
            row = self._target(conn, rid, own=action == "withdraw")
            if row["withdrawn_at"]:
                if action == "withdraw" and conn.execute(
                    "SELECT 1 FROM live_actions WHERE report_id=? AND action='withdraw'", (rid,)
                ).fetchone():
                    return {"updated": False}
                raise CommunityError("inactive", 409)
            now = utcnow()
            if action == "withdraw":
                sharing = self.sync.prepare_withdrawal(conn, rid)
                self._remove(conn, row, action, now)
            else:
                lane = FEEDBACK if action in FEEDBACK else PERSONAL
                previous = conn.execute("SELECT action FROM live_actions WHERE event_id=? AND action IN (?,?) "
                                        "ORDER BY id DESC LIMIT 1", (row["event_id"] or rid, *lane)).fetchone()
                if previous and previous["action"] == action or not previous and action == "reopen":
                    return {"updated": False}
                self._append(conn, row, action, now)
        self.live.bus.publish("live.report", {"id": rid, "kind": row["kind"]})
        if sharing:
            self.sync.publish(rid, row["kind"])
        return {"updated": True}

    def retry_share(self, rid):
        self._require_enabled()
        with self.db.tx() as conn:
            row = self._target(conn, rid, own=True)
            if not self.sync.publication(conn, rid):
                raise CommunityError("missing", 404)
        self.sync.publish(rid, row["kind"])
        return self.live.get(rid)

    def decorate(self, reports, *, history=False):
        """Attach this profile's feedback. A profile is one observer, regardless of report count."""
        if not reports:
            return reports
        event_ids = {r["event_id"] or r["id"] for r in reports}
        keys = ",".join("?" for _ in event_ids)
        actions = defaultdict(dict)
        for row in self.db.query(
                f"SELECT a.* FROM live_actions a JOIN (SELECT MAX(id) AS id FROM live_actions "
                f"WHERE event_id IN ({keys}) AND action IN ('still_here','not_found','complete','reopen') "
                "GROUP BY event_id, action IN ('complete','reopen')) latest ON a.id=latest.id", tuple(event_ids)):
            lane = "sighting" if row["action"] in FEEDBACK else "personal"
            actions[row["event_id"]][lane] = row
        for report in reports:
            event = report["event_id"] or report["id"]
            report["local_feedback"] = actions[event]
            if history:
                report["local_history"] = self.db.query(
                    "SELECT report_id, action, created_at, related_id FROM live_actions WHERE report_id=? "
                    "OR (event_id=? AND action IN ('still_here','not_found','complete','reopen')) "
                    "ORDER BY id DESC LIMIT 50", (report["id"], event))
        self.sync.decorate(reports)
        return reports

    def phenomena(self):
        rows = self.db.query("SELECT * FROM reports WHERE kind='phenomena' AND community IS NOT NULL "
                             "ORDER BY received_at DESC, rowid DESC LIMIT 100")
        return self.decorate([self.live._row(row) for row in rows])
