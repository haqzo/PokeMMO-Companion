"""Synthetic structured observations, local interactions and provider interoperability."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from companion.services.community import CommunityError
from companion.storage import utcnow

ROOT = "/api/live/community"


def place(ctx, name, region="kanto"):
    return next(item["id"] for item in ctx.live.community.options()["locations"]
                if item["region"] == region and item["name"] == name)


def observation(ctx, **changes):
    return {**{"observation_id": str(uuid4()), "kind": "alpha", "region": "kanto",
               "location_id": place(ctx, "Route 1"), "species_id": 25, "observed_at": utcnow(),
               "onset": "already_active", "provenance": "firsthand", "details": "Synthetic observation"},
            **changes}


@pytest.fixture
def community(ctx, monkeypatch):
    ctx.settings.update({"live.community.enabled": True})
    notifications = []
    deliver = ctx.live.deliver
    monkeypatch.setattr(ctx.live, "deliver", lambda report: notifications.append(report["id"]) or deliver(report))
    return ctx.live.community, notifications


def test_opt_in_and_authenticated_local_api(ctx, client):
    code, status = client.call("GET", ROOT + "/source")
    assert code == 200 and status == {"enabled": False, "status": "disabled", "connection": "unavailable"}
    data = observation(ctx)
    assert client.call("POST", ROOT + "/reports", data)[0] == 403
    ctx.settings.update({"live.community.enabled": True})
    assert client.call("GET", ROOT + "/source")[1]["status"] == "local-test"
    assert client.call("POST", ROOT + "/reports", data, token=False)[0] in (401, 403)
    code, report = client.call("POST", ROOT + "/reports", data)
    assert code == 200 and report["provider"] == "companion-local" and report["message_id"] == data["observation_id"]
    assert report["source_time"] == data["observed_at"] and report["received_at"]
    assert report["kind_basis"] == "structured" and report["community"]["onset"] == "already_active"
    ctx.settings.update({"live.community.enabled": False})
    assert client.call("POST", ROOT + f"/reports/{report['id']}/actions", {"action": "withdraw"})[0] == 403
    assert client.call("GET", f"/api/live/reports/{report['id']}")[1]["community"]["provenance"] == "firsthand"


@pytest.mark.parametrize(("changes", "error"), [
    ({"kind": "seasonal"}, "choose_kind"),
    ({"region": ""}, "choose_region"),
    ({"species_id": True}, "choose_species"),
    ({"species_id": None}, "choose_species"),
    ({"onset": ""}, "onset_required"),
    ({"provenance": ""}, "provenance_required"),
    ({"observed_at": "2026-01-01"}, "invalid_time"),
    ({"location_id": "johto:1"}, "choose_location"),
    ({"location_id": None, "location_text": ""}, "choose_location"),
    ({"location_id": None, "location_text": "Cerulean Cave"}, "explicit_location"),
    ({"location_id": None, "location_text": "Route 1"}, "explicit_location"),
    ({"kind": "phenomena", "species_id": None}, "choose_phenomenon"),
    ({"details": "x" * 241}, "short_details"),
])
def test_required_fields_and_exact_selection(ctx, community, changes, error):
    service, _ = community
    with pytest.raises(CommunityError, match="community." + error):
        service.submit(observation(ctx, **changes))
    assert not ctx.live.list() and not service.phenomena()


def test_explicit_floors_distinct_regions_and_unlisted_locations(ctx, community):
    service, _ = community
    one = service.submit(observation(ctx, location_id=place(ctx, "Cerulean Cave (1F)")))
    two = service.submit(observation(ctx, location_id=place(ctx, "Cerulean Cave (2F)")))
    kanto = service.submit(observation(ctx))
    unova = service.submit(observation(ctx, region="unova", location_id=place(ctx, "Route 1", "unova")))
    unknown = dict(location_text="Out by the old bridge", location_id=None)
    a = service.submit(observation(ctx, **unknown))
    b = service.submit(observation(ctx, **unknown))
    assert len({r["event_id"] for r in (one, two, kanto, unova, a, b)}) == 6
    assert a["location_match"] == {"status": "unverified"} and a["location"] == unknown["location_text"]


@pytest.mark.parametrize(("kind", "manual_first"), [
    ("alpha", True), ("alpha", False), ("swarm", True), ("swarm", False),
])
def test_combines_provider_and_local_without_restart_or_duplicate_alerts(ctx, community, kind, manual_first):
    service, notified = community
    now = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(minutes=2)
    older = now - timedelta(minutes=3)
    first, later = (older, now)

    def ntfy(at):
        return ctx.live.ingest({"id": "existing-ntfy", "topic": "alphapings" if kind == "alpha" else "swarmpings",
                                "title": "Pikachu", "message": "Kanto, Route 1", "time": int(at.timestamp())})

    local = observation(ctx, kind=kind, observed_at=(first if manual_first else later).isoformat(), provenance="relayed")
    if manual_first:
        a, b = service.submit(local), ntfy(later)
    else:
        a, b = ntfy(first), service.submit(local)
    replay = service.submit(local)
    assert notified == [a["id"]] and replay["provider"] == "companion-local"
    assert a["event_id"] == b["event_id"] and b["received_at"]
    assert a["status"]["ends_at"] == b["status"]["ends_at"]
    card, = ctx.live.current()["current"]
    assert card["status"]["ends_at"] == a["status"]["ends_at"]
    assert card["duplicates"] == 1 and card["own_report_id"] == replay["id"]
    assert [r["provider"] for r in ctx.live.list()] == [b["provider"], a["provider"]]
    assert not card["local_feedback"]  # a relayed report is not a separate confirmation
    with pytest.raises(CommunityError, match="id_conflict"):
        service.submit({**local, "details": "different payload"})


def test_corrections_withdrawal_and_personal_actions_preserve_other_sources(ctx, community):
    service, notified = community
    original = service.submit(observation(ctx))
    external = ctx.live.ingest({"id": "ntfy-report", "topic": "alphapings", "title": "Pikachu",
                                "message": "Kanto, Route 1", "time": int(datetime.now().timestamp())})
    eid = original["event_id"]
    assert service.act(external["id"], "still_here")["updated"]
    assert not service.act(original["id"], "still_here")["updated"]
    service.act(external["id"], "not_found")
    service.act(external["id"], "complete")
    card, = ctx.live.current()["current"]
    assert card["status"]["state"] == "recent"
    assert card["local_feedback"]["sighting"]["action"] == "not_found"
    assert card["local_feedback"]["personal"]["action"] == "complete"
    service.act(external["id"], "reopen")
    still = observation(ctx, details="Corrected details")
    corrected = service.submit(still, correction=original["id"])
    assert corrected["event_id"] == eid and corrected["source_time"] == original["source_time"]
    assert service.submit(still, correction=original["id"])["id"] == corrected["id"]
    other = service.submit(observation(ctx, location_id=place(ctx, "Route 2")), correction=corrected["id"])
    assert other["event_id"] != eid and other["source_time"] == original["source_time"]
    assert ctx.live.get(original["id"])["body"] == "Synthetic observation"
    assert ctx.live.get(original["id"])["local_history"][0]["related_id"] == corrected["id"]
    assert other["community"]["corrects"] == corrected["id"]
    assert notified == [original["id"]]
    for action in ("withdraw", "correct"):
        with pytest.raises(CommunityError, match="own_only"):
            if action == "withdraw":
                service.act(external["id"], action)
            else:
                service.submit(observation(ctx), correction=external["id"])
    assert service.act(other["id"], "withdraw")["updated"]
    assert not service.act(other["id"], "withdraw")["updated"]
    card, = ctx.live.current()["current"]
    assert card["id"] == external["id"] and card["status"]["ends_at"] == original["status"]["ends_at"]
    assert len(ctx.live.list()) == 4 and ctx.live.get(other["id"])["withdrawn_at"]
    assert card["local_feedback"]["personal"]["action"] == "reopen"


def test_local_phenomena_have_provenance_without_timer_or_relay_interference(ctx, community):
    service, notified = community
    kwargs = {"kind": "phenomena", "phenomenon_type": "dust", "species_id": None, "location_id": None, "location_unknown": True}
    a = service.submit(observation(ctx, **kwargs))
    b = service.submit(observation(ctx, **kwargs))
    assert a["status"]["ends_at"] is None and a["location"] is None
    assert a["community"]["phenomenon_type"] == "dust" and a["event_id"] is None
    assert {r["id"] for r in service.phenomena()} == {a["id"], b["id"]}
    assert not ctx.live.current()["current"] and not ctx.live.phenomena.history()["history"]
    assert not notified
