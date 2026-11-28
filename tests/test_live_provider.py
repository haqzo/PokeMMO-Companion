"""Live provider handling (2026-11-24). Data sources are labelled:
* RECONSTRUCTED fixture shapes (tests/fixtures/alphapedia_ntfy_shapes.json) from real messages documented 2026-11-17;
* SYNTHETIC messages for duplicates, corrections, malformed input, outages.
No real provider message was fetched in this session (no network approval)."""
import copy
import json
import sqlite3
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path

import pytest

from companion.app import AppContext
from companion.services import live
from companion.storage import MIGRATIONS

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
    now = int(time.time())
    m.update(id=mid, time=now - ago_s, expires=now - ago_s + 3600)
    m.update(kw)
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
    old = ctx.live.ingest(_msg("swarm", "old", ago_s=60 * 60))
    new = ctx.live.ingest(_msg("swarm", "new", ago_s=30))
    assert delivered == [new["id"]]
    assert old["delivery"]["suppressed"] == live.EXPIRED_NOTICE
    assert old["event_id"] != new["event_id"]


def test_location_aliases_preserve_provider_text_and_merge_across_sources(ctx, delivered):
    first = ctx.live.ingest(_msg("alpha", "id1", ago_s=180, message="Kanto, Cerulean Cave (1F)"))
    raw = "ＫＡＮＴＯ， cERULEAN\u00a0   CAVE １ｆ"
    second = ctx.live.ingest(_msg("alpha", "id1", message=raw), provider="another-source")
    assert first["location_match"] == second["location_match"] == {
        "status": "verified", "id": "kanto:18433", "name": "Cerulean Cave (1F)"}
    assert second["body"] == raw and second["location"] == "cERULEAN\u00a0   CAVE １ｆ"
    assert second["provider"] == "another-source" and second["message_id"] == first["message_id"]
    assert second["source_time"] != first["source_time"] and second["received_at"]
    assert second["event_id"] == first["event_id"] and second["status"]["ends_at"] == first["status"]["ends_at"]
    assert delivered == [first["id"]]
    assert ctx.dex.match_location("unova", "Route 10 Gate")["id"] == "unova:358"
    assert ctx.dex.match_location("unova", "Route 10")["id"] == "unova:355"


@pytest.mark.parametrize(("text", "status"), [
    ("Kanto, Cerulean Cave", "ambiguous"),
    ("Unova, Chargestone Cave", "ambiguous"),
    ("Hoenn, Cerulean Cave (1F)", "unverified"),
    ("Kanto, Cerulean Cave (1F East)", "unverified"),
    ("Kanto, Made-up cave", "unverified"),
    ("Johto, Safari Zone", "ambiguous"),
    ("Cerulean Cave (1F)", "unverified"),
])
def test_unresolved_locations_stay_unverified_or_ambiguous(ctx, delivered, text, status):
    first = ctx.live.ingest(_msg("alpha", "a1", message=text))
    second = ctx.live.ingest(_msg("alpha", "a2", message=text))
    assert first["location_match"] == second["location_match"] == {"status": status}
    assert first["body"] == text and first["event_id"] != second["event_id"]
    assert delivered == [first["id"], second["id"]]


def test_different_floors_sublocations_and_regions_do_not_merge(ctx, delivered):
    places = ["Kanto, Cerulean Cave (1F)", "Kanto, Cerulean Cave (B1F)", "Kanto, Route 1", "Unova, Route 1",
              "Unova, Route 10", "Unova, Route 10 (Gate)"]
    reports = [ctx.live.ingest(_msg("alpha", f"a{i}", message=place)) for i, place in enumerate(places)]
    assert all(r["location_match"]["status"] == "verified" for r in reports)
    assert len({r["event_id"] for r in reports}) == len(places)
    assert delivered == [r["id"] for r in reports]


def test_out_of_order_observation_can_only_move_countdown_earlier(ctx, delivered):
    first = ctx.live.ingest(_msg("swarm", "s1", ago_s=240))
    earlier = ctx.live.ingest(_msg("swarm", "s2", ago_s=360))
    followers = [ctx.live.ingest(_msg("swarm", f"s{i}", ago_s=60)) for i in range(3, 6)]
    card, = ctx.live.current()["current"]
    assert card["event_id"] == first["event_id"] and delivered == [first["id"]]
    assert card["status"]["start"] == earlier["status"]["start"]
    assert card["status"]["ends_at"] < first["status"]["ends_at"]
    assert card["duplicates"] == 4 and all(r["event_id"] == first["event_id"] for r in followers)


def test_repetition_just_before_expiry_cannot_extend_window_or_absorb_next_spawn(ctx, delivered):
    base = int(time.time()) - 1201
    first = ctx.live.ingest(_msg("swarm", "s1", time=base), replay=True)
    duplicate = ctx.live.ingest(_msg("swarm", "s2", time=base + 1199))
    fresh = ctx.live.ingest(_msg("swarm", "s3", time=base + 1200))
    # A late report from between them must not join or repartition already separate windows.
    late = ctx.live.ingest(_msg("swarm", "s4", time=base + 900))
    cards = {r["event_id"]: r for r in ctx.live.current()["current"]}
    assert duplicate["event_id"] == late["event_id"] == first["event_id"]
    assert duplicate["status"]["ends_at"] == first["status"]["ends_at"]
    assert fresh["event_id"] != first["event_id"] and delivered == [fresh["id"]]
    assert cards[first["event_id"]]["status"]["state"] == "uncertain"
    assert cards[fresh["event_id"]]["status"]["state"] == "recent"
    ctx.settings.update({"live.current_include_catchup": False})
    card = next(r for r in ctx.live.current()["current"] if r["event_id"] == first["event_id"])
    assert card["status"]["ends_at"] == first["status"]["ends_at"] and first["id"] not in card["report_ids"]


def test_concurrent_observations_reserve_only_one_notification(ctx, delivered):
    messages = [_msg("swarm", f"s{i}") for i in range(8)]
    with ThreadPoolExecutor(max_workers=4) as pool:
        reports = list(pool.map(ctx.live.ingest, messages))
    assert len(delivered) == 1 and {r["event_id"] for r in reports} == set(delivered)
    assert ctx.live.current()["current"][0]["duplicates"] == 7


def test_reconnect_replays_overlap_and_eof_goes_offline(ctx, delivered, monkeypatch):
    started = int(time.time()) - 6
    seen = _msg("swarm", "seen", time=started - 1)
    real = ctx.live.ingest(seen)
    cached = _msg("swarm", "cached", time=started - 2)
    fresh = _msg("swarm", "fresh", time=started + 1, message="Johto, Route 41")
    streams = iter(([None, seen, cached, fresh], [fresh, cached, _msg("alpha", "undated", time=None)]))
    requests, states = [], []

    context = object()
    monkeypatch.setattr(live, "live_https_context", lambda: context)

    def open_stream(request, **kwargs):
        assert kwargs["context"] is context
        assert kwargs["timeout"] == 75
        requests.append(request.full_url)
        return BytesIO(b"\n".join(json.dumps(line).encode() for line in next(streams)))

    monkeypatch.setattr(live.urllib.request, "urlopen", open_stream)
    monkeypatch.setattr(live.time, "time", lambda: started + (4 if requests else 0))
    ctx.settings.update({"live.ntfy.enabled": True, "live.ntfy.consented": True})
    monkeypatch.setattr(ctx.live._stop, "wait", lambda seconds: states.append(ctx.live.source_status()["status"]) or len(states) == 2)
    ctx.live._run()
    assert states == ["offline", "offline"] and len(requests) == 2
    assert all(url.endswith("/json?since=12h") for url in requests)
    reports = {r["message_id"]: r for r in ctx.live.list()}
    assert set(reports) == {"seen", "cached", "fresh", "undated"}
    assert reports["cached"]["is_replay"] and reports["undated"]["status"]["ends_at"] is None
    assert delivered == [real["id"], reports["fresh"]["id"]]
    assert {r["message_id"] for r in ctx.live.current()["current"]} == {"cached", "fresh"}


def test_report_and_receipt_times_survive_timestamp_fallback(ctx, delivered):
    report = ctx.live.ingest(_msg("swarm", "forward", time=int(time.time()) + 3600))
    assert report["source_time"] > report["received_at"]
    assert report["status"]["start_basis"] == "time received"
    assert report["status"]["duration_min"] == 20
    status = ctx.live.current(now=datetime.now(timezone.utc) + timedelta(minutes=21))["current"][0]["status"]
    assert status["state"] == "uncertain" and status["remaining_s"] == 0


def test_existing_v5_profile_keeps_history_and_preferences(tmp_path):
    db = tmp_path / "companion.sqlite3"
    with closing(sqlite3.connect(db)) as conn, conn:
        for version in range(1, 6):
            for statement in MIGRATIONS[version]:
                conn.execute(statement)
        conn.execute("INSERT INTO meta(key, value) VALUES('schema_version', '5')")
        old = live.iso_from_epoch(time.time() - 180)
        conn.execute("INSERT INTO reports(id, provider, message_id, kind, kind_basis, title, body, species_id, "
                     "source_time, received_at, region, location, delivery) VALUES(?, 'ntfy', ?, 'swarm', 'topic', "
                     "'Wailmer', 'Johto, Route 40', 320, ?, ?, 'johto', 'Route 40', ?)",
                     ("past", "past-msg", old, old, '{"route":"both"}'))
        for key, val in (("notify.alpha", "os"), ("notify.swarm", "both"), ("notify.toast_corner", "bottom-left")):
            conn.execute("INSERT INTO settings VALUES(?, ?, ?)", (key, json.dumps(val), old))
    ctx = AppContext(str(tmp_path))
    try:
        assert ctx.storage.migrated_from == 5 and Path(ctx.storage.backup_created).is_file()
        assert [ctx.settings.get(k) for k in ("notify.alpha", "notify.swarm", "notify.toast_corner")] == ["os", "both", "bottom-left"]
        past = ctx.live.get("past")
        assert past["body"] == "Johto, Route 40" and past["delivery"] == {"route": "both"}
        repeated = ctx.live.ingest(_msg("swarm", "repeat"))
        assert repeated["event_id"] == "past" and repeated["delivery"]["same_as"] == "past"
    finally:
        ctx.shutdown()


def test_fresh_toast_defaults_and_quiet_mode(ctx, delivered, monkeypatch):
    toasts, system = [], []
    ctx.live.toast_backend = lambda payload: toasts.append(payload) or True
    monkeypatch.setattr(ctx.live.notifier, "notify", lambda *args: system.append(args))
    assert [ctx.settings.get(f"notify.{k}") for k in ("alpha", "swarm", "test", "timer")] == ["toast"] * 4
    assert ctx.settings.get("notify.phenomena") == "off"
    first = ctx.live.ingest(_msg("swarm", "one"))
    assert toasts[0]["corner"] == "top-right" and not system
    ctx.settings.update({"notify.quiet": True, "notify.alpha": "both"})
    quiet = ctx.live.ingest(_msg("alpha", "two"))
    assert quiet["delivery"]["quiet"] and "suppressed" in quiet["delivery"]
    ctx.live.ingest(_msg("swarm", "repeat"))
    assert len(toasts) == 1 and not system
    assert delivered == [first["id"], quiet["id"]]


def test_expired_reports_are_never_shown_as_active(ctx, delivered):
    ctx.live.ingest(_msg("alpha", "late", ago_s=80 * 60))             # 75-min window just passed: "uncertain", not active
    cur = ctx.live.current()["current"]
    assert [g["status"]["state"] for g in cur] == ["uncertain"] and cur[0]["status"]["remaining_s"] == 0
    ctx.storage.execute("DELETE FROM reports")
    ctx.live.ingest(_msg("alpha", "gone", ago_s=3 * 60 * 60))          # long over: not current at all
    assert ctx.live.current()["current"] == []


@pytest.mark.parametrize(("age_minutes", "state"), [(21, "uncertain"), (36, "ended")])
def test_history_uses_the_expired_event_window_for_repeated_observations(ctx, delivered, monkeypatch, age_minutes, state):
    now = int(time.time())
    received = iter((live.iso_from_epoch(now - 2), live.iso_from_epoch(now)))
    monkeypatch.setattr(live, "utcnow", lambda: next(received))
    original = ctx.live.ingest(_msg("swarm", "original", time=now - age_minutes * 60))
    repeat = ctx.live.ingest(_msg("swarm", "repeat", time=now - (age_minutes - 18) * 60), provider="second-source")
    assert repeat["event_id"] == original["event_id"]
    latest, = ctx.live.list(kind="swarm", region="johto", limit=1)
    detail = ctx.live.get(repeat["id"])
    for report in (latest, detail):
        assert report["status"]["start"] == original["status"]["start"]
        assert report["status"]["ends_at"] == original["status"]["ends_at"]
        assert report["status"]["state"] == state and report["status"]["remaining_s"] == 0
        assert report["source_time"] != original["source_time"] and report["received_at"] != original["received_at"]
        assert report["provider"] == "second-source" and report["message_id"] == "repeat"
    featured = ctx.live.current()["current"]
    assert [card["status"]["state"] for card in featured] == ([state] if state == "uncertain" else [])
    assert delivered == []


@pytest.mark.parametrize("bad", [
    {"event": "keepalive", "id": "k"}, {"event": "open", "id": "o"}, {"id": "", "title": "Ditto"}, {"id": "x"},
    {"id": "t", "title": ["not", "text"], "message": {"x": 1}}, {"id": "u" * 500, "title": "A" * 5000, "message": "B" * 50000},
    {"id": "overflow", "title": "Ditto", "time": 10**40, "tags": 9, "actions": 4},
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
    ctx.live._health("connected", success=True)
    assert ctx.live.current()["complete"] is False
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
