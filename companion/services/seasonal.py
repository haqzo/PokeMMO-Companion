"""Seasonal availability and provenance for local Community observations."""

import json
import re
from datetime import datetime, timedelta, timezone

from ..community_protocol import CommunityError
from ..phenomenon_protocol import plain
from ..seasonal import instant, schedule


class Seasons:
    def __init__(self, updater, live):
        self.updater, self.live = updater, live

    def current(self, now=None):
        return schedule(self.updater.seasonal_catalog(), now or datetime.now(timezone.utc))

    def view(self):
        events, next_change = self.current()
        boundary = next_change.isoformat() if next_change else None
        if not events:
            return {"events": [], "reports": [], "next_change_at": boundary}
        rows = self.live.db.query(
            "SELECT * FROM reports WHERE kind='seasonal' AND "
            "(json_extract(community,'$.event_id'),json_extract(community,'$.year')) "
            "IN (SELECT json_extract(value,'$.id'),json_extract(value,'$.year') FROM json_each(?)) "
            "ORDER BY received_at DESC, rowid DESC LIMIT 300",
            (json.dumps([{"id": event["id"], "year": event["year"]} for event in events]),))
        reports = [self.live._row(row) for row in rows]
        for event in events:
            event["activities"] = [
                {**activity, "places": [place for key in activity.get("locations", [])
                                         if (place := self.live.dex.location_reference(key))],
                 "pokemon": [{"id": sid, "name": self.live.dex.name(sid)} for sid in activity.get("species", [])
                             if sid in self.live.dex.index]} for activity in event["activities"]]
        return {"events": events, "reports": self.live.community.decorate(reports), "next_change_at": boundary}

    def report_fields(self, data, received, previous):
        mid = data.get("observation_id")
        if not isinstance(mid, str) or not re.fullmatch(r"[A-Za-z0-9_-]{16,64}", mid):
            raise CommunityError("invalid_id")
        if data.get("share", False) is not False or previous and previous["kind"] != "seasonal":
            raise CommunityError("seasonal_local_only")
        prior = json.loads(previous["community"]) if previous else {}
        if previous and (prior["event_id"], prior["year"]) != (data.get("event_id"), data.get("year")):
            raise CommunityError("seasonal_inactive")
        now = instant(received)
        event = next((e for e in self.current(now)[0] if e["id"] == data.get("event_id")
                      and type(data.get("year")) is int and e["year"] == data["year"] and e["phase"] == "active"), None)
        activity = next((a for a in event["activities"] if a["id"] == data.get("activity") and a.get("report")), None) if event else None
        if not activity:
            raise CommunityError("seasonal_inactive")
        try:
            observed = instant(previous["source_time"] if previous else data.get("observed_at")).replace(microsecond=0)
        except (ValueError, OverflowError):
            raise CommunityError("invalid_time") from None
        if not (instant(event["starts_at"]) <= observed < instant(event["ends_at"]) and observed <= now):
            raise CommunityError("invalid_time")
        place = data.get("location_id")
        ref = self.live.dex.location_reference(place) if isinstance(place, str) else None
        if place is not None and (not ref or place not in activity.get("locations", [])):
            raise CommunityError("choose_location")
        onset, provenance = data.get("onset"), data.get("provenance")
        if onset not in ("just_appeared", "already_active") or provenance not in ("firsthand", "relayed"):
            raise CommunityError("invalid_report")
        details = data.get("details", "")
        if not isinstance(details, str) or len(details) > 240:
            raise CommunityError("short_details")
        timing = activity.get("timing")
        estimate = None
        if timing and onset == "just_appeared" and provenance == "firsthand":
            estimate = min(instant(event["ends_at"]), observed + timedelta(seconds=timing["seconds"])).isoformat()
        meta = {"event_id": event["id"], "year": event["year"], "revision": event["revision"], "activity": activity["id"],
                "onset": onset, "provenance": provenance, "location_id": place, "estimated_end": estimate,
                "timing_source": timing["source"] if estimate else None, "corrects": previous["id"] if previous else None}
        return (mid, "seasonal", ref["region"] if ref else None, ref["name"] if ref else None, None,
                activity["report"]["en"], plain(details, 240) or "", observed.isoformat().replace("+00:00", "Z"), json.dumps(meta))
