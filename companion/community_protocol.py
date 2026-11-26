"""Version 1 constraints shared by the Companion and its loopback test relay."""

import json
import re
from datetime import datetime

from .phenomenon_protocol import REGIONS, plain, timestamp

VERSION = 1
PAGE_SIZE = 40
MAX_REQUEST = 4096
MAX_RESPONSE = 160_000
MAX_NEW_AGE = 600
REGULAR_ID = re.compile(r"[0-9a-f]{32}")
CONTRIBUTOR = re.compile(r"[a-z0-9][a-z0-9-]{0,31}")
TEST_TOKEN = re.compile(r"[A-Za-z0-9_-]{24,128}")

KINDS = ("alpha", "swarm", "phenomena")
PHENOMENA = ("grass", "water", "dust", "shadow")


def seconds_between(later, earlier):
    recent, old = (datetime.fromisoformat(v.replace("Z", "+00:00")) for v in (later, earlier))
    return (recent - old).total_seconds()


class CommunityError(ValueError):
    def __init__(self, key, status=400):
        super().__init__(f"community.{key}")
        self.status = status


def validate_observation(dex, data, received, previous=None):
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
    if location_id is not None and (not isinstance(location_id, str) or len(location_id) > 120):
        raise CommunityError("choose_location")
    if not isinstance(raw_place, str) or len(raw_place) > 100 or location_id and raw_place.strip():
        raise CommunityError("choose_location")
    place = plain(raw_place, 100)
    if location_id:
        ref = dex.location_reference(location_id)
        if not ref or ref["region"] != region:
            raise CommunityError("choose_location")
        place = ref["name"]
    elif place and dex.match_location(region, place)["status"] != "unverified":
        raise CommunityError("explicit_location")
    elif not place and (kind != "phenomena" or data.get("location_unknown") is not True):
        raise CommunityError("choose_location")
    species, phenomenon = data.get("species_id"), data.get("phenomenon_type")
    if kind == "phenomena":
        if phenomenon not in PHENOMENA or species is not None:
            raise CommunityError("choose_phenomenon")
        title = phenomenon
    else:
        if type(species) is not int or species not in dex.index or phenomenon is not None:
            raise CommunityError("choose_species")
        title = dex.name(species)
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


def wire_observation(fields):
    mid, kind, region, place, species, _title, body, observed, meta = fields
    meta = json.loads(meta)
    return {"observation_id": mid, "kind": kind, "region": region, "species_id": species,
            "observed_at": observed, "location_id": meta["location_id"], "location_label": place,
            "location_text": "" if meta["location_id"] else place or "",
            "location_unknown": not place, "details": body, "phenomenon_type": meta["phenomenon_type"],
            "onset": meta["onset"], "provenance": meta["provenance"]}
