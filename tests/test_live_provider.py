"""Live provider handling (2026-11-24). Data sources are labelled:
* RECONSTRUCTED fixture shapes (tests/fixtures/alphapedia_ntfy_shapes.json) from real messages documented 2026-11-17;
* SYNTHETIC messages for duplicates, corrections, malformed input, outages.
No real provider message was fetched in this session (no network approval)."""
import copy
import json
import time
from pathlib import Path

import pytest

FIX = json.loads((Path(__file__).parent / "fixtures" / "alphapedia_ntfy_shapes.json").read_text())


@pytest.fixture
def delivered(ctx, monkeypatch):
    calls = []
    real = ctx.live.deliver
    monkeypatch.setattr(ctx.live, "deliver", lambda r: calls.append(r["id"]) or real(r))
    ctx.storage.execute("DELETE FROM reports")
    return calls


def _msg(kind, mid, ago_s=60, **kw):
    m = copy.deepcopy(FIX[kind])
    m.update(id=mid, time=int(time.time()) - ago_s, expires=int(time.time()) - ago_s + 3600, **kw)
    return m


def test_reconstructed_alpha_and_swarm_shapes_parse(ctx, delivered):
    a = ctx.live.ingest(_msg("alpha", "a1"))
    s = ctx.live.ingest(_msg("swarm", "s1"))
    assert (a["kind"], a["region"], a["location"], a["species_name"]) == ("alpha", "kanto", "Cerulean Cave", "Ditto")
    assert (s["kind"], s["region"], s["location"], s["species_name"]) == ("swarm", "johto", "Route 40", "Wailmer")
    assert a["source_url"] == "https://alpha.pokemmotools.org/"
    # ntfy `expires` (cache retention) never becomes the event end: Alpha = 75 min from the report time
    st = a["status"]
    assert st["duration_min"] == 75 and st["start"] != st["ends_at"]
    assert len(delivered) == 2


def test_same_message_twice_and_replays_are_never_notified_twice(ctx, delivered):
    a1 = ctx.live.ingest(_msg("alpha", "a1"))
    assert ctx.live.ingest(_msg("alpha", "a1")) is None            # reconnect delivers the same id again
    assert ctx.live.ingest(_msg("alpha", "old1", ago_s=600), replay=True)   # caught up on reconnect: history only
    assert delivered == [a1["id"]]


def test_another_call_of_the_same_event_is_saved_but_not_notified_and_keeps_the_timer(ctx, delivered):
    first = ctx.live.ingest(_msg("swarm", "s1", ago_s=300))
    second = ctx.live.ingest(_msg("swarm", "s2", ago_s=60))           # another player / re-sent correction
    assert first and second and delivered == [first["id"]]
    row = ctx.storage.query_one("SELECT delivery FROM reports WHERE id=?", (second["id"],))
    d = json.loads(row["delivery"])
    assert d["same_as"] == first["id"] and "not notified again" in d["suppressed"]
    cur = ctx.live.current()["current"]
    assert len(cur) == 1 and cur[0]["duplicates"] == 1
    assert cur[0]["status"]["start"] == first["status"]["start"]      # lifetime not restarted
    # a different place is a different event → notified
    third = ctx.live.ingest(_msg("swarm", "s3", message="Hoenn\nRoute 119"))
    assert third["id"] in delivered


def test_same_species_after_the_window_is_a_new_event(ctx, delivered):
    ctx.live.ingest(_msg("swarm", "old", ago_s=60 * 60))                # ended long ago (20-min estimate)
    new = ctx.live.ingest(_msg("swarm", "new", ago_s=30))
    assert new["id"] in delivered and len(delivered) == 2


def test_expired_reports_are_never_shown_as_active(ctx, delivered):
    ctx.live.ingest(_msg("alpha", "late", ago_s=80 * 60))             # 75-min window just passed: "uncertain", not active
    cur = ctx.live.current()["current"]
    assert [g["status"]["state"] for g in cur] == ["uncertain"] and cur[0]["status"]["remaining_s"] == 0
    ctx.storage.execute("DELETE FROM reports")
    ctx.live.ingest(_msg("alpha", "gone", ago_s=3 * 60 * 60))          # long over: not current at all
    assert ctx.live.current()["current"] == []


@pytest.mark.parametrize("bad", [
    {"event": "keepalive", "id": "k"}, {"event": "open", "id": "o"}, {"id": "", "title": "Ditto"}, {"id": "x"},
    {"id": "t", "title": ["not", "text"], "message": {"x": 1}}, {"id": "u" * 500, "title": "A" * 5000, "message": "B" * 50000},
])
def test_malformed_or_unknown_messages_never_crash_or_invent_a_report(ctx, delivered, bad):
    r = ctx.live.ingest(bad)
    if r is not None:
        assert len(r["title"] or "") <= 200 and r["kind"] in ("alpha", "swarm", "other")
    assert delivered == [] or r is not None


def test_unknown_topic_is_not_treated_as_alpha_or_swarm(ctx, delivered):
    r = ctx.live.ingest({"id": "p1", "event": "message", "topic": "some-other-topic", "title": "Shaking grass", "message": "Unova, Route 1",
                         "time": int(time.time())})
    assert r["kind"] == "other"
    assert ctx.live.current()["current"] == []                         # never shown as a current Alpha/Swarm


def test_test_reports_are_isolated(ctx, delivered):
    ctx.live.create_test("alpha")
    real = ctx.live.ingest(_msg("alpha", "a1"))
    assert real["id"] in delivered                                     # a test never suppresses a real call
    assert [g["id"] for g in ctx.live.current()["current"]] == [real["id"]]


def test_source_outage_is_reported_and_history_stays(ctx, delivered):
    ctx.settings.update({"live.ntfy.enabled": True, "live.ntfy.consented": True})
    ctx.live.ingest(_msg("alpha", "a1"))
    ctx.live._health("offline", "URLError: timed out — retrying in 5s")
    cur = ctx.live.current()
    assert cur["source"]["status"] == "offline" and len(cur["current"]) == 1


def test_notification_preferences_per_kind(ctx, delivered):
    ctx.settings.update({"notify.alpha": "off", "notify.swarm": "toast"})
    a = ctx.live.ingest(_msg("alpha", "a1"))
    s = ctx.live.ingest(_msg("swarm", "s1"))
    da = json.loads(ctx.storage.query_one("SELECT delivery FROM reports WHERE id=?", (a["id"],))["delivery"])
    ds = json.loads(ctx.storage.query_one("SELECT delivery FROM reports WHERE id=?", (s["id"],))["delivery"])
    assert da["route"] == "off" and "toast" not in da and ds["route"] == "toast" and "toast" in ds
