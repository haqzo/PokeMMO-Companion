from copy import deepcopy
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from companion.app import AppContext
from companion.seasonal import schedule, validate_catalog

SOURCE = "https://forums.pokemmo.com/topic/1-synthetic-season/"


def names(en, es="Ejemplo de temporada", zh="季节示例"):
    return {"en": en, "es": es, "zh": zh}


def fixture(now=None):
    now = (now or datetime.now(timezone.utc)).replace(microsecond=0)
    iso = lambda hours: (now + timedelta(hours=hours)).isoformat()
    return {"schema": 1, "events": [{
        "id": "synthetic", "year": now.year, "revision": 1, "source": SOURCE,
        "verified_on": now.date().isoformat(), "name": names("Synthetic seasonal event"),
        "description": names("Synthetic verification fixture"), "starts_at": iso(-1), "ends_at": iso(1),
        "redemption_ends_at": iso(3), "activities": [{
            "id": "timed", "name": names("Synthetic activity"), "description": names("Synthetic rule"),
            "report": names("Synthetic observation"), "locations": ["unova:321"], "species": [531],
            "manual_seconds": 300, "timing": {"basis": "witnessed_onset", "seconds": 60, "source": SOURCE},
        }, {"id": "unknown", "name": names("Untimed activity"), "description": names("Timing unavailable"),
            "report": names("Untimed observation")}],
    }]}


def test_revision_schedule_overlaps_and_separate_redemption():
    now = datetime(2030, 1, 1, 12, tzinfo=timezone.utc)
    doc = fixture(now)
    first = doc["events"][0]
    extended = {**first, "revision": 2, "ends_at": (now + timedelta(hours=2)).isoformat(),
                "changes": [{"kind": kind, "at": now.isoformat(), "source": SOURCE, "description": names(kind)}
                            for kind in ("extension", "correction", "hotfix")]}
    doc["events"] += [extended, {**first, "id": "another"}]
    validate_catalog(doc)
    assert schedule(doc, now - timedelta(hours=2))[0] == []
    events, next_change = schedule(doc, now)
    assert [(e["id"], e["revision"], e["phase"]) for e in events] == [("another", 1, "active"), ("synthetic", 2, "active")]
    assert next_change == now + timedelta(hours=1)
    assert [e["phase"] for e in schedule(doc, next_change)[0]] == ["redemption", "active"]
    assert schedule(doc, now + timedelta(hours=3)) == ([], None)


@pytest.mark.parametrize("change", [
    {"starts_at": "2030-01-01T12:00:00"}, {"redemption_ends_at": "2001-01-01T00:00Z"},
    {"source": "https://example.org/"}, {"year": True}, {"name": {"en": "Missing languages"}},
    {"activities": [{"id": "missing-activity-fields"}]}, {"verified_on": "2030-02-30"},
])
def test_invalid_records(change):
    doc = fixture()
    doc["events"][0].update(change)
    with pytest.raises(ValueError):
        validate_catalog(doc)


def test_unsupported_schema_and_duplicate_revision():
    with pytest.raises(ValueError, match="schema"):
        validate_catalog({"schema": 2, "events": []})
    doc = fixture()
    doc["events"] *= 2
    with pytest.raises(ValueError, match="duplicate"):
        validate_catalog(doc)


@pytest.mark.parametrize("ctx", [True], indirect=True)
def test_reports_stay_local_and_reopen_with_profile(ctx, client, monkeypatch):
    assert client.call("GET", "/api/live/seasonal")[1]["events"] == []
    doc = fixture()
    monkeypatch.setattr(ctx.refdata, "seasonal_catalog", lambda: doc)
    ctx.settings.update({"live.community.enabled": True})
    root = "/api/live/community/reports"
    data = {"observation_id": uuid4().hex, "kind": "seasonal", "event_id": "synthetic",
            "year": doc["events"][0]["year"], "activity": "timed", "observed_at": datetime.now(timezone.utc).isoformat(),
            "onset": "just_appeared", "provenance": "firsthand", "location_id": "unova:321"}
    assert client.call("POST", root, {**data, "share": True})[0] == 400
    status, report = client.call("POST", root, data)
    assert status == 200 and report["community"]["estimated_end"]
    assert report["status"]["ends_at"] is None and "publication" not in report
    assert client.call("POST", root, data)[1]["id"] == report["id"]
    late = client.call("POST", root, {**data, "observation_id": uuid4().hex, "provenance": "relayed"})[1]
    assert late["community"]["estimated_end"] is None
    unknown = client.call("POST", root, {**data, "observation_id": uuid4().hex,
                          "activity": "unknown", "location_id": None})[1]
    assert unknown["community"]["estimated_end"] is None
    corrected = client.call("POST", root + "/" + report["id"] + "/correct",
                            {**data, "observation_id": uuid4().hex, "details": "Corrected"})[1]
    assert corrected["community"]["corrects"] == report["id"]
    assert len(client.call("GET", "/api/live/seasonal")[1]["reports"]) == 4
    assert ctx.live.list() == []
    # SQLite records survive a restart even while the currently installed catalog is empty.
    copy = AppContext(str(ctx.paths.root), internal_reporting=True)
    try:
        assert copy.live.get(corrected["id"])["body"] == "Corrected"
        assert copy.seasons.view()["events"] == []
    finally:
        copy.shutdown()
