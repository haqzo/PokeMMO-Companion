"""Validation and selection for the optional seasonal reference document."""

import re
from datetime import date, datetime, timezone
from urllib.parse import urlsplit

SLUG = re.compile(r"[a-z][a-z0-9-]{0,59}")


def instant(text):
    if not isinstance(text, str) or "T" not in text or len(text) > 40:
        raise ValueError("Seasonal timestamps need a date, time and offset")
    value = datetime.fromisoformat(text.replace("Z", "+00:00"))
    if value.tzinfo is None:
        raise ValueError("Seasonal timestamps need a timezone")
    return value.astimezone(timezone.utc)


def _local_text(value, limit):
    if (not isinstance(value, dict) or set(value) != {"en", "es", "zh"}
            or any(not isinstance(s, str) or not 0 < len(s.strip()) <= limit or len(s) > limit
                   for s in value.values())):
        raise ValueError("Seasonal text requires English, Spanish and Simplified Chinese")


def _source(value):
    url = urlsplit(value if isinstance(value, str) else "")
    if (url.scheme != "https" or url.hostname not in {"pokemmo.com", "www.pokemmo.com", "forums.pokemmo.com"}
            or url.username or url.password or url.port not in (None, 443)):
        raise ValueError("Seasonal definitions require an official HTTPS source")


def _integer(value, minimum, maximum):
    return type(value) is int and minimum <= value <= maximum


def _keys(value, required, optional=()):
    if not isinstance(value, dict) or set(required) - value.keys() or value.keys() - set(required) - set(optional):
        raise ValueError("Invalid seasonal definition fields")


def _list(value, maximum):
    if not isinstance(value, list) or len(value) > maximum:
        raise ValueError("Invalid seasonal list")
    return value


def validate_catalog(document):
    _keys(document, ("schema", "events"))
    if type(document["schema"]) is not int or document["schema"] != 1:
        raise ValueError("Unsupported seasonal schema")
    seen = set()
    for event in _list(document["events"], 160):
        _keys(event, ("id", "year", "revision", "source", "verified_on", "name", "description", "starts_at",
                      "ends_at", "activities"), ("redemption_ends_at", "changes"))
        eid, year, revision = event["id"], event["year"], event["revision"]
        if (not isinstance(eid, str) or not SLUG.fullmatch(eid) or not _integer(year, 2000, 9999)
                or not _integer(revision, 1, 999999) or (eid, year, revision) in seen):
            raise ValueError("Invalid or duplicate seasonal event revision")
        seen.add((eid, year, revision))
        start, end = instant(event["starts_at"]), instant(event["ends_at"])
        redemption = instant(event["redemption_ends_at"]) if "redemption_ends_at" in event else None
        if end <= start or (redemption is not None and redemption <= end):
            raise ValueError("Seasonal deadlines are out of order")
        _source(event["source"])
        if not isinstance(event["verified_on"], str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", event["verified_on"]):
            raise ValueError("Missing seasonal verification date")
        date.fromisoformat(event["verified_on"])
        _local_text(event["name"], 100)
        _local_text(event["description"], 600)
        for change in _list(event.get("changes", []), 20):
            _keys(change, ("kind", "at", "description", "source"))
            if change["kind"] not in ("correction", "hotfix", "extension"):
                raise ValueError("Unknown seasonal change kind")
            instant(change["at"])
            _source(change["source"])
            _local_text(change["description"], 500)
        activities = set()
        for activity in _list(event["activities"], 40):
            _keys(activity, ("id", "name", "description"), ("report", "locations", "species", "timing", "manual_seconds"))
            key = activity["id"]
            if not isinstance(key, str) or not SLUG.fullmatch(key) or key in activities:
                raise ValueError("Invalid or duplicate seasonal activity ID")
            activities.add(key)
            _local_text(activity["name"], 100)
            _local_text(activity["description"], 500)
            if "report" in activity:
                _local_text(activity["report"], 100)
            places = _list(activity.get("locations", []), 30)
            if any(not isinstance(v, str) or not re.fullmatch(r"(kanto|johto|hoenn|sinnoh|unova):[^:\s]{1,100}", v)
                   for v in places) or len(set(places)) != len(places):
                raise ValueError("Invalid seasonal location IDs")
            species = _list(activity.get("species", []), 30)
            if any(not _integer(v, 1, 9999) for v in species) or len(set(species)) != len(species):
                raise ValueError("Invalid seasonal Pokémon IDs")
            if "manual_seconds" in activity and not _integer(activity["manual_seconds"], 1, 359999):
                raise ValueError("Invalid manual timer duration")
            if "timing" in activity:
                rule = activity["timing"]
                _keys(rule, ("basis", "seconds", "source"))
                if ("report" not in activity or rule["basis"] != "witnessed_onset"
                        or not _integer(rule["seconds"], 1, 86400)):
                    raise ValueError("Invalid seasonal timing rule")
                _source(rule["source"])
    return document


def schedule(document, now):
    latest = {}
    for event in document["events"]:
        key = (event["id"], event["year"])
        if key not in latest or latest[key]["revision"] < event["revision"]:
            latest[key] = event
    result, boundaries = [], []
    for event in latest.values():
        end = instant(event["ends_at"])
        boundaries.extend([instant(event["starts_at"]), end])
        if event.get("redemption_ends_at"):
            boundaries.append(instant(event["redemption_ends_at"]))
        redemption = event.get("redemption_ends_at")
        if instant(event["starts_at"]) <= now < end:
            result.append({**event, "phase": "active"})
        elif redemption and end <= now < instant(redemption):
            result.append({**event, "phase": "redemption"})
    result.sort(key=lambda event: (instant(event["ends_at"]), event["id"], event["year"]))
    return result, min((value for value in boundaries if value > now), default=None)
