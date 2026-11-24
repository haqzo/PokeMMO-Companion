"""Tools › Timers (time keeping across navigation, sleep and restarts; notifications) and the Home news window."""
from datetime import datetime, timedelta, timezone

import pytest

from companion.services.news import NewsService, published_within
from companion.services.timers import TimerError, TimerService


class Clock:
    """Separate wall clock and boot clock, so tests can simulate wall-clock changes and suspend."""
    def __init__(self):
        self.wall_t = 1_800_000_000.0
        self.boot_t = 500.0

    def wall(self):
        return self.wall_t

    def boot(self):
        return self.boot_t

    def advance(self, s, sleep=False):
        self.wall_t += s
        self.boot_t += s  # CLOCK_BOOTTIME counts through suspend as well


class Bus:
    def __init__(self):
        self.events = []
        self.subscriber_count = 1

    def publish(self, topic, data):
        self.events.append((topic, data))


class Notifier:
    def __init__(self):
        self.sent = []

    def notify(self, title, body):
        self.sent.append((title, body))
        return {"delivered": True}


@pytest.fixture
def env(ctx):
    clk = Clock()
    bus, notif = Bus(), Notifier()
    svc = TimerService(ctx.storage, ctx.settings, bus, notif, wall=clk.wall, clock=clk.boot)
    return ctx, clk, bus, notif, svc


def done_events(bus):
    return [d for t, d in bus.events if t == "timers.done"]


def test_arithmetic_pause_resume_reset(env):
    ctx, clk, bus, notif, svc = env
    t = svc.create("Berries", 90, start=True)
    clk.advance(30)
    assert svc.view(svc.get(t["id"]))["remaining"] == pytest.approx(60)
    svc.action(t["id"], "pause")
    clk.advance(1000)                                  # paused timers never move
    assert svc.view(svc.get(t["id"]))["remaining"] == pytest.approx(60)
    svc.action(t["id"], "resume")
    clk.advance(59)
    assert svc.tick() == [] and svc.get(t["id"])["state"] == "running"
    clk.advance(1)
    fired = svc.tick()
    assert len(fired) == 1 and svc.get(t["id"])["state"] == "done"
    svc.action(t["id"], "reset")
    assert svc.get(t["id"])["state"] == "idle" and svc.view(svc.get(t["id"]))["remaining"] == 90
    with pytest.raises(TimerError):
        svc.create("x", 0)
    with pytest.raises(TimerError):
        svc.create("x", 100 * 3600)


def test_multiple_concurrent_timers_and_duplicate_delete(env):
    ctx, clk, bus, notif, svc = env
    a = svc.create("A", 10, start=True)
    b = svc.create("B", 20, start=True)
    c = svc.action(a["id"], "duplicate")
    assert c["name"] == "A (copy)" and c["state"] == "idle" and c["duration"] == 10
    clk.advance(10)
    assert [f["timer"] for f in svc.tick()] == [a["id"]]
    clk.advance(10)
    assert [f["timer"] for f in svc.tick()] == [b["id"]]
    svc.delete(c["id"])
    assert len(svc.list()["timers"]) == 2


def test_completion_notified_once_and_wall_clock_change_ignored(env):
    ctx, clk, bus, notif, svc = env
    t = svc.create("Egg", 60, start=True)
    clk.wall_t += 3600                         # someone changes the system clock: the boot clock is unaffected
    assert svc.tick() == []
    clk.advance(60)
    svc.tick(); svc.tick(); svc.tick()
    assert len(done_events(bus)) == 1 and len(notif.sent) == 1
    assert "Egg" in notif.sent[0][0]


def test_sleep_fires_once_late_and_repeat_skips_periods(env):
    ctx, clk, bus, notif, svc = env
    one = svc.create("Once", 300, start=True)
    rep = svc.create("Every 5", 300, repeat=True, start=True)
    clk.advance(3 * 3600, sleep=True)           # laptop slept for three hours
    fired = svc.tick()
    assert sorted(f["timer"] for f in fired) == sorted([one["id"], rep["id"]])
    r = svc.get(rep["id"])
    assert r["state"] == "running" and r["skipped"] == 35 and r["cycles"] == 1
    assert 0 < svc.view(r)["remaining"] <= 300
    assert all(f["late_by"] > 0 for f in fired)
    assert svc.tick() == []


def test_survives_restart_and_reports_finished_while_closed(env):
    ctx, clk, bus, notif, svc = env
    run = svc.create("Running", 600, start=True)
    pau = svc.create("Paused", 600, start=True)
    clk.advance(100)
    svc.action(pau["id"], "pause")
    # app quits; 200 s later it starts again (new process: the boot clock is a different counter)
    clk.advance(200)
    clk.boot_t = 3.0
    svc2 = TimerService(ctx.storage, ctx.settings, bus, notif, wall=clk.wall, clock=clk.boot)
    assert svc2.view(svc2.get(run["id"]))["remaining"] == pytest.approx(300)
    assert svc2.view(svc2.get(pau["id"]))["remaining"] == pytest.approx(500)
    # closed for longer than the remaining time → one late completion at the next start, never twice
    clk.advance(1000)
    svc3 = TimerService(ctx.storage, ctx.settings, bus, notif, wall=clk.wall, clock=clk.boot)
    fired = svc3.tick()
    assert [f["timer"] for f in fired] == [run["id"]] and fired[0]["late_by"] == pytest.approx(700)
    svc4 = TimerService(ctx.storage, ctx.settings, bus, notif, wall=clk.wall, clock=clk.boot)
    assert svc4.tick() == [] and svc4.get(run["id"])["state"] == "done"


def test_quiet_mode_and_routes(env):
    ctx, clk, bus, notif, svc = env
    ctx.settings.update({"notify.quiet": True})
    svc.create("Quiet", 5, start=True)
    clk.advance(5)
    f = svc.tick()[0]
    assert "suppressed" in f and notif.sent == []
    assert done_events(bus)[0]["sound"] is False         # no chime in Do-not-disturb
    ctx.settings.update({"notify.quiet": False, "notify.timer": "toast"})
    svc.create("Toast only", 5, start=True)
    clk.advance(5)
    f = svc.tick()[0]
    assert f["toast"] == "in-window" and notif.sent == []
    toasts = [d for t, d in bus.events if t == "toast"]
    assert toasts[-1]["route"] == "#/tools/timers" and toasts[-1]["kind"] == "timer"


def test_sound_is_claimed_by_one_window_only(env):
    ctx, clk, bus, notif, svc = env
    assert svc.claim_sound("abc:1") is True
    assert svc.claim_sound("abc:1") is False
    assert svc.claim_sound("abc:2") is True


def test_timer_api(client):
    s, t = client.call("POST", "/api/timers", {"name": "  Daycare   egg ", "seconds": 900, "repeat": True})
    assert s == 200 and t["name"] == "Daycare egg" and t["repeat"] and t["state"] == "idle"
    s, t = client.call("POST", f"/api/timers/{t['id']}/start")
    assert t["state"] == "running"
    s, t = client.call("PATCH", f"/api/timers/{t['id']}", {"name": "Egg", "sound": False})
    assert t["name"] == "Egg" and t["sound"] is False
    s, lst = client.call("GET", "/api/timers")
    assert [x["label"] for x in lst["presets"]] == ["5 min", "15 min", "30 min", "1 h"] and len(lst["timers"]) == 1
    s, r = client.call("POST", f"/api/timers/{t['id']}/explode")
    assert s == 400
    s, r = client.call("POST", "/api/timers", {"seconds": -5})
    assert s == 400
    s, r = client.call("DELETE", f"/api/timers/{t['id']}")
    assert s == 200


def test_timer_setting_routes(ctx):
    from companion.settings import SettingsError
    ctx.settings.update({"notify.timer": "os"})
    with pytest.raises(SettingsError):
        ctx.settings.update({"notify.timer": "loud"})
    assert ctx.settings.get("window.timers.mode") == "standard"


# ---------------------------------------------------------------- Home news window
NOW = datetime(2026, 11, 23, 18, 0, tzinfo=timezone.utc)


def test_published_within_uses_publication_not_discovery():
    items = [{"title": "Lunar New Year 2026", "published": "2026-02-10"},       # just discovered, but old
             {"title": "Xmas 2025", "published": "2025-12-20T10:00:00Z"},
             {"title": "Nov changelog", "published": "2026-11-19"},
             {"title": "Edge in", "published": (NOW - timedelta(days=89)).isoformat()},
             {"title": "Edge out", "published": (NOW - timedelta(days=91)).isoformat()},
             {"title": "No date"}]
    got = [x["title"] for x in published_within(items, NOW)]
    assert got == ["Nov changelog", "Edge in"]


def test_news_listing_home_section(ctx, monkeypatch):
    svc = NewsService(ctx.storage)
    ctx.storage.set_settings({"news.feed_cache": {"ok": True, "items": [
        {"title": "Lunar New Year 2026", "link": "https://forums.pokemmo.com/index.php?/topic/990001-lny/", "published": "2026-02-10T00:00:00Z"},
        {"title": "Fresh post", "link": "https://forums.pokemmo.com/index.php?/topic/990002-fresh/", "published": "2026-11-21T00:00:00Z"}]}})
    n = svc.listing(now=NOW)
    assert [p["title"] for p in n["new_posts"]] == ["Fresh post", "Lunar New Year 2026"]       # archive keeps both, newest first
    assert [p["title"] for p in n["home"]["new_posts"]] == ["Fresh post"]
    assert n["home"]["older_new_posts"] == 1
    assert all((NOW - datetime.fromisoformat(a["published"]).replace(tzinfo=timezone.utc)).days <= 90 for a in n["home"]["articles"])
    assert all(e["status"]["code"] in ("upcoming", "window_open") for e in n["home"]["events"])
    # an event that is running right now is listed first
    svc.snapshot["events"] = [
        {"id": "a", "title": "Later", "starts": "2026-12-20T00:00:00Z", "ends": "2027-01-05T00:00:00Z"},
        {"id": "b", "title": "Now", "starts": "2026-11-20T00:00:00Z", "ends": "2026-11-30T00:00:00Z"},
        {"id": "c", "title": "Halloween", "starts": "2026-10-20T00:00:00Z", "ends": "2026-11-05T00:00:00Z"}]
    n = svc.listing(now=NOW)
    assert [e["id"] for e in n["home"]["events"]] == ["b", "a"] and len(n["events"]) == 3


# ---------------------------------------------------------------- merged official news (2026-11-24)
RSS = """<?xml version="1.0"?><rss version="2.0"><channel><title>Updates</title>
<item><title>{t1}</title><link>https://forums.pokemmo.com/index.php?/topic/990100-changelog-december-3rd-2026/</link>
<pubDate>Thu, 03 Dec 2026 18:00:00 +0000</pubDate><description>{d1}</description></item>
<item><title>PTS Changelog - December 1st, 2026</title><link>https://forums.pokemmo.com/index.php?/topic/990099-pts/</link>
<pubDate>Tue, 01 Dec 2026 18:00:00 +0000</pubDate><description>pts</description></item>
<item><title>Changelog — November 19th, 2026</title><link>https://forums.pokemmo.com/index.php?/topic/201822-changelog-november-19th-2026/</link>
<pubDate>Thu, 19 Nov 2026 18:00:00 +0000</pubDate><description>{d2}</description></item>
</channel></rss>"""


class _Resp:
    def __init__(self, body, headers=None):
        self.body, self.headers = body, headers or {}

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self, n=-1):
        return self.body


def test_discovered_changelog_becomes_latest_and_pts_never_does(ctx, monkeypatch):
    import urllib.request
    svc = NewsService(ctx.storage)
    monkeypatch.setattr(urllib.request, "urlopen", lambda req, timeout=0: _Resp(RSS.format(t1="Changelog - December 3rd, 2026", d1="a", d2="b").encode()))
    r = svc.check_feed(manual=False)
    assert r["ok"] and r["count"] == 3
    n = svc.listing(now=datetime(2026, 12, 4, tzinfo=timezone.utc))
    assert n["latest"]["title"] == "Changelog - December 3rd, 2026"
    assert n["latest"]["discovered"] and n["latest"]["summary"] is None            # nothing fabricated
    pts = next(x for x in n["records"] if x["topic_id"] == "990099")
    assert pts["channel"] == "pts"
    # the bundled November article is merged with its feed copy (same topic id), not listed twice
    assert sum(1 for x in n["records"] if x["topic_id"] == "201822") == 1
    assert next(x for x in n["records"] if x["topic_id"] == "201822")["has_summary"]


def test_feed_edits_are_detected_by_title_and_content(ctx, monkeypatch):
    import urllib.request
    svc = NewsService(ctx.storage)
    bodies = [RSS.format(t1="Changelog - December 3rd, 2026", d1="a", d2="b"), RSS.format(t1="Changelog - December 3rd, 2026 (updated)", d1="a", d2="b2")]
    monkeypatch.setattr(urllib.request, "urlopen", lambda req, timeout=0: _Resp(bodies.pop(0).encode()))
    svc.check_feed(manual=False)
    ctx.storage.set_settings({"news.feed_cache": {**ctx.storage.get_setting("news.feed_cache"), "_checked_epoch": 0}})
    svc.check_feed(manual=False)
    recs = {x["topic_id"]: x for x in svc.records()}
    assert recs["990100"]["edited"] and recs["990100"]["title"].endswith("(updated)")
    assert recs["201822"]["edited_upstream"]["content_changed"] is True


def test_failed_check_backs_off_then_keeps_cache(ctx, monkeypatch):
    import time as _t
    import urllib.request
    svc = NewsService(ctx.storage)
    monkeypatch.setattr(urllib.request, "urlopen", lambda req, timeout=0: _Resp(RSS.format(t1="Changelog - December 3rd, 2026", d1="a", d2="b").encode()))
    svc.check_feed(manual=False)

    def boom(req, timeout=0):
        raise OSError("offline")
    monkeypatch.setattr(urllib.request, "urlopen", boom)
    r = svc.check_feed(manual=False)
    assert not r["ok"] and r["count"] if "count" in r else True
    assert len(r["items"]) == 3                                              # offline: cached posts kept
    assert 4 * 60 < r["_next_due"] - _t.time() <= 5 * 60                     # first retry after 5 min
    r = svc.check_feed(manual=False)
    assert 14 * 60 < r["_next_due"] - _t.time() <= 15 * 60
    n = svc.listing()
    assert n["feed"]["ok"] is False and n["latest"]["title"] == "Changelog - December 3rd, 2026"


def test_stale_flag(ctx):
    svc = NewsService(ctx.storage)
    ctx.storage.set_settings({"news.feed_cache": {"ok": True, "items": [], "last_ok_at": "2026-11-01T00:00:00Z"}})
    assert svc.listing(now=datetime(2026, 11, 24, tzinfo=timezone.utc))["feed"]["stale"] is True
    ctx.storage.set_settings({"news.feed_cache": {"ok": True, "items": [], "last_ok_at": "2026-11-24T00:00:00Z"}})
    assert svc.listing(now=datetime(2026, 11, 24, 1, tzinfo=timezone.utc))["feed"]["stale"] is False


def test_news_order_is_by_publication_not_edit_or_discovery(ctx):
    """2026-11-24 audit: a post found late, or edited later, never outranks more recently published posts;
    published, edited and discovered dates stay separate fields."""
    svc = NewsService(ctx.storage)
    svc.snapshot["articles"] = [
        {"id": "old", "kind": "news", "channel": "live", "title": "Old but edited", "published": "2026-09-01", "updated": "2026-11-22", "source_url": ""},
        {"id": "new", "kind": "news", "channel": "live", "title": "Newer", "published": "2026-11-10", "source_url": ""}]
    ctx.storage.set_settings({"news.feed_cache": {"ok": True, "items": [
        {"title": "Found late, published early", "link": "https://forums.pokemmo.com/index.php?/topic/990300-x/", "published": "2026-08-01T00:00:00Z",
         "first_seen_at": "2026-11-23T00:00:00Z"},
        {"title": "Recent", "link": "https://forums.pokemmo.com/index.php?/topic/990301-y/", "published": "2026-11-20T00:00:00Z", "first_seen_at": "2026-11-20T01:00:00Z"}]}})
    n = svc.listing(now=NOW)
    assert [a["id"] for a in n["articles"]] == ["new", "old"]
    assert n["articles"][1]["updated"] == "2026-11-22" and n["articles"][1]["published"] == "2026-09-01"
    titles = [r["title"] for r in n["records"]]
    assert titles.index("Recent") < titles.index("Newer") < titles.index("Old but edited") < titles.index("Found late, published early")
    late = next(r for r in n["records"] if r["title"] == "Found late, published early")
    assert late["published"].startswith("2026-08-01") and late["first_seen_at"].startswith("2026-11-23")
