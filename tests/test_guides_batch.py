"""Guides batch (2026-11-24): timers owned by guides, user presets, guide extras (timer templates + linked team),
team format v2 with lazy migration, and the Location directory's data contract."""
import pytest

from companion.services.teams import TeamError, normalize_team
from companion.services.timers import TimerError, TimerService

from test_timers_news import Bus, Clock, Notifier


@pytest.fixture
def env(ctx):
    clk = Clock()
    bus, notif = Bus(), Notifier()
    svc = TimerService(ctx.storage, ctx.settings, bus, notif, wall=clk.wall, clock=clk.boot)
    return ctx, clk, bus, notif, svc


def test_guide_owned_timers_are_separate_per_run_and_cycle(env):
    ctx, clk, bus, notif, svc = env
    base = {"kind": "guide", "guide": "cg:abc", "template": "t1", "label": "Gym reruns"}
    a = svc.create("Cooldown", 600, start=True, owner={**base, "cycle": "c1"})
    b = svc.create("Cooldown", 600, start=False, owner={**base, "cycle": "c2"})
    svc.create("Other", 60)
    assert svc.find({**base, "cycle": "c1"})["id"] == a["id"]
    assert svc.find({**base, "cycle": "c2"})["id"] == b["id"]
    assert svc.find({**base, "cycle": "c3"}) is None
    assert {t["id"] for t in svc.list("cg:abc")["timers"]} == {a["id"], b["id"]}
    assert len(svc.list()["timers"]) == 3             # the Timers tool still shows every timer
    # a new cycle never touches the timer that is already running
    clk.advance(100)
    assert svc.view(svc.get(a["id"]))["remaining"] == pytest.approx(500)
    assert svc.get(b["id"])["state"] == "idle"        # nothing starts by itself


def test_guide_timer_completion_routes_to_guide_and_fires_once(env):
    ctx, clk, bus, notif, svc = env
    t = svc.create("E4", 30, start=True, owner={"kind": "guide", "guide": "story:run1:kanto", "template": "x"})
    clk.advance(31)
    svc.tick(); svc.tick()
    done = [d for k, d in bus.events if k == "timers.done"]
    assert len(done) == 1 and done[0]["route"] == "#/guides/storyline?region=kanto"
    assert svc.get(t["id"])["state"] == "done"


def test_owner_validation_and_attach(env):
    ctx, clk, bus, notif, svc = env
    with pytest.raises(TimerError):
        svc.create("x", 60, owner={"kind": "macro", "guide": "cg:a"})
    with pytest.raises(TimerError):
        svc.create("x", 60, owner={"kind": "guide", "guide": "cg:a", "step": "s" * 200})
    t = svc.create("Standalone", 120, start=True)
    clk.advance(20)
    t2 = svc.attach(t["id"], {"kind": "guide", "guide": "cg:a", "label": "Mine"})
    assert t2["owner"]["guide"] == "cg:a" and t2["state"] == "running" and t2["remaining"] == pytest.approx(100)
    assert svc.attach(t["id"], None)["owner"] is None


def test_user_presets(env):
    ctx, clk, bus, notif, svc = env
    p = svc.save_preset("  Berry  watering ", 3600 * 4, repeat=True)
    assert p["label"] == "Berry watering"
    assert [x["label"] for x in svc.presets()] == ["Berry watering"]
    assert svc.list()["user_presets"][0]["repeat"] is True
    with pytest.raises(TimerError):
        svc.save_preset("bad", 0)
    assert svc.delete_preset(p["id"]) and svc.presets() == []


def test_guide_extras_api(client):
    s, g = client.call("POST", "/api/cguides", {"title": "Gym reruns", "scope": "gym_rerun", "recurring": True})
    assert s == 200, g
    key = "cg:" + g["id"]
    s, ex = client.call("GET", f"/api/guide-extras/{key.replace(':', '%3A')}")   # as the UI sends it
    assert s == 200 and ex["timers"] == [] and ex["team"] is None
    s, ex = client.call("PUT", f"/api/guide-extras/{key}", {"timers": [{"name": "Rerun cooldown", "seconds": 18 * 3600}],
                                                             "step_timers": {"step1": [{"name": "Berry", "seconds": 60}]}})
    assert s == 200 and ex["timers"][0]["seconds"] == 64800 and ex["step_timers"]["step1"][0]["name"] == "Berry"
    s, r = client.call("PUT", f"/api/guide-extras/{key}", {"timers": [{"name": "x", "seconds": 0}]})
    assert s == 400
    s, r = client.call("PUT", f"/api/guide-extras/{key}", {"team_id": "nope"})
    assert s == 400
    s, r = client.call("GET", "/api/guide-extras/evil:key")
    assert s == 400
    # a team is linked by id: the guide shows the team's current content
    s, team = client.call("POST", "/api/docs/team", {"name": "Gym team", "data": {"slots": [25, None, 6]}})
    assert s == 200 and team["data"]["version"] == 2 and team["data"]["slots"][0] == {"species": 25}
    s, ex = client.call("PUT", f"/api/guide-extras/{key}", {"team_id": team["id"]})
    assert ex["team"]["name"] == "Gym team"
    s, used = client.call("GET", f"/api/teams/{team['id']}/guides")
    assert used["guides"] == [key]
    client.call("PUT", f"/api/docs/team/{team['id']}", {"name": "Gym team v2", "data": {"slots": [{"species": 26, "level": 50}]}})
    s, ex = client.call("GET", f"/api/guide-extras/{key}")
    assert ex["team"]["name"] == "Gym team v2" and ex["team"]["data"]["slots"][0]["level"] == 50
    client.call("DELETE", f"/api/docs/team/{team['id']}")
    s, ex = client.call("GET", f"/api/guide-extras/{key}")
    assert ex["team"] is None and ex["team_missing"] is True
    # the guide's active cycle (created when missing) gives timers a cycle to belong to
    s, cyc = client.call("POST", f"/api/cguides/{g['id']}/cycle")
    assert s == 200 and cyc["number"] == 1
    s, t = client.call("POST", "/api/timers", {"name": "Rerun cooldown", "seconds": 60, "start": True,
                                               "owner": {"kind": "guide", "guide": key, "cycle": cyc["id"], "template": ex["timers"][0]["id"]}})
    assert s == 200 and t["owner"]["cycle"] == cyc["id"]
    s, lst = client.call("GET", f"/api/timers?guide={key}")
    assert [x["id"] for x in lst["timers"]] == [t["id"]]
    # finishing a cycle keeps the earlier cycle's timer running
    client.call("POST", f"/api/cguides/{g['id']}/complete", {"note": ""})
    s, lst = client.call("GET", f"/api/timers?guide={key}")
    assert lst["timers"][0]["state"] == "running"
    # presets API
    s, p = client.call("POST", "/api/timers/presets", {"label": "Daily", "seconds": 86400 - 1})
    assert s == 200
    s, ps = client.call("GET", "/api/timers/presets")
    assert ps["presets"][0]["id"] == p["id"]
    s, _ = client.call("DELETE", f"/api/timers/presets/{p['id']}")
    assert s == 200


def test_team_normalize_and_old_format():
    t = normalize_team({"slots": [1, 4, None, 7]})
    assert t["version"] == 2 and len(t["slots"]) == 6 and t["slots"][1] == {"species": 4} and t["slots"][2] is None
    full = normalize_team({"purpose": "pvp", "notes": "n", "slots": [{"species": 3, "level": 100, "nature": "Bold", "moves": ["Giga Drain", "Sludge Bomb"],
                                                                      "ivs": {"hp": 31}, "evs": {"hp": 252, "def": 252, "spe": 6}}]})
    assert full["purpose"] == "pvp" and full["slots"][0]["moves"] == ["Giga Drain", "Sludge Bomb"]
    for bad in ({"purpose": "raid"}, {"slots": [{"species": 3, "level": 101}]}, {"slots": [{"species": 3, "ivs": {"hp": 32}}]},
                {"slots": [{"species": 3, "evs": {"hp": 252, "atk": 252, "def": 252}}]}):
        with pytest.raises(TeamError):
            normalize_team(bad)
    assert len(normalize_team({"slots": [{"species": 3, "moves": list("abcde")}]})["slots"][0]["moves"]) == 4   # extra moves are dropped


def test_team_v1_documents_still_readable(ctx):
    # a team saved by an older build (bare species ids) is untouched until it is saved again
    ctx.storage.put_document("team", "old1", "Old team", {"slots": [25, 6, None]})
    assert ctx.storage.get_document("team", "old1")["data"]["slots"] == [25, 6, None]


def test_library_scopes_include_new_categories(ctx):
    from companion.services.library import SCOPES
    for k in ("gym_rerun", "elite_four", "money", "farming", "shiny", "daily", "custom"):
        assert k in SCOPES
    g = ctx.cguides.create({"title": "Money", "scope": "money"})
    assert g["scope"] == "money"


def test_cleanup_finished_keeps_running_and_current_cycle(env):
    ctx, clk, bus, notif, svc = env
    o = {"kind": "guide", "guide": "cg:g1", "template": "t"}
    old_done = svc.create("Old", 10, start=True, owner={**o, "cycle": "c1"})
    old_running = svc.create("Old long", 9999, start=True, owner={**o, "cycle": "c1"})
    old_repeat = svc.create("Old rep", 10, start=True, repeat=True, owner={**o, "cycle": "c1"})
    cur_done = svc.create("Cur", 10, start=True, owner={**o, "cycle": "c2"})
    other_guide = svc.create("Other", 10, start=True, owner={**o, "guide": "cg:g2", "cycle": "c1"})
    clk.advance(11)
    svc.tick()
    assert svc.cleanup_finished("cg:g1", keep_cycle="c2") == 1
    ids = {t["id"] for t in svc.list()["timers"]}
    assert old_done["id"] not in ids and {old_running["id"], old_repeat["id"], cur_done["id"], other_guide["id"]} <= ids
