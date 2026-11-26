"""Structured, profile-local observations and encounter actions."""

import json
import re
import uuid
from collections import defaultdict

from ..phenomenon_protocol import REGIONS, plain, timestamp
from ..storage import utcnow

PROVIDER = "companion-local"
KINDS = ("alpha", "swarm", "phenomena")
PHENOMENA = ("grass", "water", "dust", "shadow")
FEEDBACK = ("still_here", "not_found")
PERSONAL = ("complete", "reopen")


class CommunityError(ValueError):
    def __init__(self, key, status=400):
        super().__init__(f"community.{key}")
        self.status = status


class Community:
    def __init__(self, live):
        self.live = live
        self.db = live.db
        self.dex = live.dex

    def source_status(self):
        enabled = self.live.settings.get("live.community.enabled")
        return {"enabled": enabled, "status": "local-test" if enabled else "disabled", "connection": "unavailable"}

    def options(self):
        return {"source": self.source_status(), "kinds": KINDS, "phenomenon_types": PHENOMENA,
                "locations": [ref for loc in self.dex.locations()
                              if (ref := self.dex.location_reference(loc["id"]))]}

    def _require_enabled(self):
        if not self.source_status()["enabled"]:
            raise CommunityError("disabled", 403)

    def _validate(self, data, received, previous=None):
        if not isinstance(data, dict):
            raise CommunityError("invalid_report")
        mid = data.get("observation_id")
        if not isinstance(mid, str) or not re.fullmatch(r"[A-Za-z0-9_-]{16,64}", mid):
            raise CommunityError("invalid_id")
        kind, region = data.get("kind"), data.get("region")
        if kind not in KINDS or previous and kind != previous["kind"]:
            raise CommunityError("choose_kind")
        if not isinstance(region, str) or region not in REGIONS:
            raise CommunityError("choose_region")
        observed = previous["source_time"] if previous else timestamp(data.get("observed_at"))
        if not observed:
            raise CommunityError("invalid_time")
        # Retain the same UTC second precision and ordering used by the live engine.
        observed = observed.split(".")[0] + "Z" if "." in observed else observed
        if observed > received:
            raise CommunityError("invalid_time")
        location_id, raw_place = data.get("location_id"), data.get("location_text", "")
        if location_id is not None and not isinstance(location_id, str):
            raise CommunityError("choose_location")
        if not isinstance(raw_place, str) or len(raw_place) > 100 or location_id and raw_place.strip():
            raise CommunityError("choose_location")
        place = plain(raw_place, 100)
        if location_id:
            ref = self.dex.location_reference(location_id)
            if not ref or ref["region"] != region:
                raise CommunityError("choose_location")
            place = ref["name"]
        elif place and self.dex.match_location(region, place)["status"] != "unverified":
            raise CommunityError("explicit_location")
        elif not place and (kind != "phenomena" or data.get("location_unknown") is not True):
            raise CommunityError("choose_location")
        species, phenomenon = data.get("species_id"), data.get("phenomenon_type")
        if kind == "phenomena":
            if phenomenon not in PHENOMENA or species is not None:
                raise CommunityError("choose_phenomenon")
            title = phenomenon
        else:
            if type(species) is not int or species not in self.dex.index or phenomenon is not None:
                raise CommunityError("choose_species")
            title = self.dex.name(species)
        if data.get("onset") not in ("just_appeared", "already_active"):
            raise CommunityError("onset_required")
        if data.get("provenance") not in ("firsthand", "relayed"):
            raise CommunityError("provenance_required")
        details = data.get("details", "")
        if not isinstance(details, str) or len(details) > 240:
            raise CommunityError("short_details")
        body = plain(details, 240) or ""
        meta = {"location_id": location_id or None, "onset": data["onset"], "provenance": data["provenance"],
                "phenomenon_type": phenomenon, "corrects": previous["id"] if previous else None}
        return (mid, kind, region, place, species, title, body, observed, json.dumps(meta))

    def submit(self, data, correction=None):
        """Insert one observation and reserve its notification in the same write transaction."""
        self._require_enabled()
        received, rid = utcnow(), uuid.uuid4().hex[:16]
        swarm_minutes = self.live.swarm_minutes()
        with self.db.tx() as conn:
            previous = self._target(conn, correction, own=True) if correction else None
            fields = self._validate(data, received, previous)
            mid, kind, region, place, species, title, body, observed, meta = fields
            existing = conn.execute("SELECT * FROM reports WHERE provider=? AND message_id=?", (PROVIDER, mid)).fetchone()
            if existing:
                stored = tuple(existing[key] for key in ("message_id", "kind", "region", "location",
                                                         "species_id", "title", "body", "source_time", "community"))
                if stored != fields:
                    raise CommunityError("id_conflict", 409)
                rid, notify, changed = existing["id"], False, False
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
        report = self.live.get(rid)
        if notify:
            report["delivery"] = self.live.deliver(report)
        if changed:
            self.live.bus.publish("live.report", {"id": rid, "kind": report["kind"]})
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
                self._remove(conn, row, action, now)
            else:
                lane = FEEDBACK if action in FEEDBACK else PERSONAL
                previous = conn.execute("SELECT action FROM live_actions WHERE event_id=? AND action IN (?,?) "
                                        "ORDER BY id DESC LIMIT 1", (row["event_id"] or rid, *lane)).fetchone()
                if previous and previous["action"] == action or not previous and action == "reopen":
                    return {"updated": False}
                self._append(conn, row, action, now)
        self.live.bus.publish("live.report", {"id": rid, "kind": row["kind"]})
        return {"updated": True}

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
        return reports

    def phenomena(self):
        rows = self.db.query("SELECT * FROM reports WHERE kind='phenomena' AND provider=? "
                             "ORDER BY received_at DESC, rowid DESC LIMIT 100", (PROVIDER,))
        return self.decorate([self.live._row(row) for row in rows])
