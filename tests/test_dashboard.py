"""Unified moves table data, Live status / estimated timers, Home & navigation defaults (2026-11-23 pass)."""
import json
import os
import time
from datetime import datetime, timedelta, timezone

import pytest

from companion.services.live import ALPHA_MINUTES, report_status

needs_dumps = pytest.mark.skipif(not os.environ.get("POKEMMO_DUMPS_DIR"), reason="needs POKEMMO_DUMPS_DIR")


# ---------------------------------------------------------------- moves
def _mv(name, method, level=None, mid=None, meta=True):
    m = {"id": mid if mid is not None else abs(hash(name)) % 10000, "name": name, "method": method, "level": level, "verified_meta": meta}
    if meta:
        m.update({"type": "fire", "category": "Special", "power": 40, "accuracy": 100, "pp": 25, "priority": 0})
    return m


def test_move_rows_group_methods_and_keep_every_record(ctx):
    ctx.dex.machines = lambda name: {"cut": [{"kind": "HM", "item_id": 339, "name": "HM - Cut"}],
                                     "flash": [{"kind": "TM", "item_id": 9, "name": "TM - Flash"}, {"kind": "HM", "item_id": 10, "name": "HM - Flash"}],
                                     "ember": [{"kind": "TM", "item_id": 5, "name": "TM - Ember"}]}.get(name.lower(), [])
    moves = [_mv("Ember", "level", 1, 52), _mv("Ember", "level", 4, 52), _mv("Ember", "TM??", None, 52), _mv("Ember", "level", 4, 52),  # exact duplicate
             _mv("Cut", "TM??", None, 15), _mv("Flash", "TM??", None, 148), _mv("Rage", "TM??", None, 99), _mv("Howl", "SPECIAL", None, 336),
             _mv("Volt Tackle", "EGG & ITEM", None, 344), _mv("Petal Dance", "EVOLVE", None, 80), _mv("Power Whip", "PREVO", None, 438),
             _mv("Bind", "TUTOR", None, 20), _mv("Ingrain", "EGG", None, 275), _mv("Snowscape", "TM??", None, 883, meta=False), _mv("Odd", "WEIRD", None, 1)]
    rows = {r["name"]: r for r in ctx.dex.move_rows(moves)}
    assert len(rows) == 12  # one row per move (15 records)
    ember = rows["Ember"]["methods"]
    assert [(m["label"], m["level"]) for m in ember] == [("Start", 1), ("Level", 4), ("TM", None)]  # duplicate record dropped, levels kept
    assert rows["Ember"]["min_level"] == 1
    assert rows["Cut"]["methods"][0]["label"] == "HM" and rows["Cut"]["methods"][0]["machine_items"][0]["item_id"] == 339
    assert rows["Flash"]["methods"][0]["label"] == "TM/HM"
    rage = rows["Rage"]["methods"][0]
    assert rage["label"] == "TM??" and rage["raw"] == "TM??" and "No matching TM/HM item" in rage["note"]  # client label kept
    assert "TM??" in rows["Cut"]["methods"][0]["note"] and "price" in rows["Cut"]["methods"][0]["note"]  # uncertainty preserved
    assert rows["Volt Tackle"]["methods"][0]["label"] == "Egg + item" and rows["Howl"]["methods"][0]["label"] == "Special"
    assert rows["Petal Dance"]["methods"][0]["label"] == "Evolve" and rows["Power Whip"]["methods"][0]["label"] == "Pre-evolution"
    assert rows["Odd"]["methods"][0] == {"code": "other", "label": "WEIRD", "raw": "WEIRD", "level": None}
    snow = rows["Snowscape"]
    assert snow["verified_meta"] is False and snow["type"] is None and snow["power"] is None  # never invented


@needs_dumps
def test_real_dump_move_rows_preserve_all_62729_records(dump_paths):
    from companion.services.dex import DexService
    from companion.services.items import ItemService
    from companion.storage import Storage
    dex = DexService(dump_paths)
    items = ItemService(dump_paths, Storage(dump_paths.db, dump_paths.backups))
    dex.machines = items.machines
    total = entries = 0
    for sp in dex.species.values():
        rows = dex.move_rows(sp["moves"])
        uniq = {(m.get("id"), m["method"], m.get("level")) for m in sp["moves"]}
        total += len(uniq)
        entries += sum(len(r["methods"]) for r in rows)
    assert entries == total
    rows = {r["name"]: r for r in dex.move_rows(dex.species[6]["moves"])}
    assert [m["label"] for m in rows["Air Slash"]["methods"]] == ["Start", "Evolve", "TM"]
    assert [m["label"] for m in rows["Flare Blitz"]["methods"]] == ["Start", "Level", "TM"] and rows["Flare Blitz"]["methods"][1]["level"] == 54
    assert rows["Cut"]["methods"][0]["label"] == "HM"
    pika = {r["name"]: r for r in dex.move_rows(dex.species[25]["moves"])}
    assert pika["Flash"]["methods"][0]["label"] == "TM/HM"


# ---------------------------------------------------------------- Live status / timers
NOW = datetime(2026, 11, 23, 16, 0, tzinfo=timezone.utc)


def _r(kind, mins_ago, **kw):
    t = (NOW - timedelta(minutes=mins_ago)).isoformat()
    return {"kind": kind, "source_time": t, "received_at": t, "is_test": 0, "is_replay": 0, **kw}


@pytest.mark.parametrize("kind,ago,state,left", [("alpha", 10, "recent", 65 * 60), ("alpha", 74, "recent", 60), ("alpha", 75, "uncertain", 0),
                                                 ("alpha", 110, "uncertain", 0), ("alpha", 113, "ended", 0), ("alpha", 200, "ended", 0), ("swarm", 5, "recent", 15 * 60),
                                                 ("swarm", 21, "uncertain", 0), ("swarm", 40, "ended", 0), ("other", 1, "info", 0)])
def test_timer_arithmetic_and_states(kind, ago, state, left):
    st = report_status(_r(kind, ago), NOW, 20)
    assert st["state"] == state and st["remaining_s"] == left
    if kind == "alpha":
        assert st["duration_min"] == ALPHA_MINUTES == 75 and "official" in st["estimate"]
    if kind == "swarm":
        assert st["duration_min"] == 20 and "not official" in st["estimate"]
    if kind == "other":
        assert st["ends_at"] is None and st["estimate"] is None


def test_timer_edge_cases():
    st = report_status(_r("swarm", 5), NOW, 30)  # adjustable swarm estimate
    assert st["remaining_s"] == 25 * 60
    fut = {**_r("alpha", -40), "received_at": (NOW - timedelta(minutes=3)).isoformat()}  # sender clock ahead
    st = report_status(fut, NOW)
    assert st["start_basis"] == "time received" and st["remaining_s"] == 72 * 60 and "future" in st["notes"][0]
    late = {**_r("swarm", 50), "received_at": NOW.isoformat()}
    assert "after its estimated window" in report_status(late, NOW, 20)["notes"][0]
    assert report_status({**_r("swarm", 500), "is_replay": 1}, NOW)["state"] == "replayed"
    assert report_status({**_r("alpha", 1), "is_test": 1}, NOW)["state"] == "test"
    nostamp = {"kind": "alpha", "source_time": None, "received_at": (NOW - timedelta(minutes=5)).isoformat(), "is_test": 0, "is_replay": 0}
    assert report_status(nostamp, NOW)["start_basis"] == "time received"


def _ingest(ctx, mid, topic, title, body, ago_min, replay=False):
    return ctx.live.ingest({"id": mid, "event": "message", "time": int(time.time()) - ago_min * 60, "topic": topic, "title": title, "message": body}, replay=replay)


def test_current_groups_duplicates_and_excludes_tests_old_and_history(ctx):
    _ingest(ctx, "s1", "swarmpings", "Houndoom", "Johto\nBurned Tower (1F)", 6)
    _ingest(ctx, "s2", "swarmpings", "Houndoom", "Johto\nBurned Tower 1F", 4)       # same floor, reported again
    _ingest(ctx, "s2", "swarmpings", "Houndoom", "Johto\nBurned Tower 1F", 4)       # exact re-delivery (same message id)
    _ingest(ctx, "a1", "alphapings", "Magmortar", "Sinnoh, Stark Mountain", 12)
    _ingest(ctx, "b1", "swarmpings", "Blissey", "Hoenn\nArtisan Cave", 14, replay=True)  # caught up on reconnect
    _ingest(ctx, "z1", "swarmpings", "Zangoose", "Kanto\nRoute 14", 26)
    _ingest(ctx, "o1", "swarmpings", "Slakoth", "Unova\nRoute 2", 300, replay=True)       # old history
    ctx.live.create_test("alpha")
    c = ctx.live.current()
    by = {g["species_name"]: g for g in c["current"]}
    assert set(by) == {"Houndoom", "Magmortar", "Blissey", "Zangoose"}
    h = by["Houndoom"]
    assert h["duplicates"] == 1 and len(h["report_ids"]) == 2 and h["status"]["age_s"] >= 6 * 60 - 5  # timed from the EARLIEST report
    assert by["Blissey"]["caught_up"] and by["Zangoose"]["status"]["state"] == "uncertain"
    assert c["current"][-1]["species_name"] == "Zangoose"  # likely-active first
    assert c["estimates"]["alpha_minutes"] == 75 and c["estimates"]["swarm_minutes"] == 20 and not c["complete"]  # feed off → incomplete
    ctx.settings.update({"live.current_include_catchup": False})
    assert "Blissey" not in {g["species_name"] for g in ctx.live.current()["current"]}
    ctx.settings.update({"live.current_include_catchup": True, "live.swarm_estimate_minutes": 30})
    assert ctx.live.current()["estimates"]["swarm_minutes"] == 30
    ctx.settings.update({"live.swarm_estimate_minutes": 20})


def test_ambiguous_reports_are_not_merged_by_species(ctx):
    _ingest(ctx, "x1", "swarmpings", "Swarm", "Unova, Route 6 — Deerling and Emolga reported", 3)
    _ingest(ctx, "x2", "swarmpings", "Deerling", "Unova\nRoute 6", 2)
    cur = ctx.live.current()["current"]
    assert len(cur) == 2


def test_swarm_estimate_setting_is_validated(ctx):
    from companion.settings import SettingsError
    ctx.settings.update({"live.swarm_estimate_minutes": 500})  # numbers are clamped, like every other range setting
    assert ctx.settings.get("live.swarm_estimate_minutes") == 120
    ctx.settings.update({"live.swarm_estimate_minutes": 1})
    assert ctx.settings.get("live.swarm_estimate_minutes") == 5
    with pytest.raises(SettingsError):
        ctx.settings.update({"live.current_include_catchup": "yes"})


def test_current_api(client, ctx):
    _ingest(ctx, "a9", "alphapings", "Ditto", "Kanto, Cerulean Cave", 3)
    code, d = client.call("GET", "/api/live/current")
    assert code == 200 and d["current"][0]["species_name"] == "Ditto" and d["current"][0]["status"]["state"] == "recent"
    code, lst = client.call("GET", "/api/live/reports?tests=1")
    assert lst["reports"][0]["status"]["state"] == "recent"


# ---------------------------------------------------------------- defaults
def test_home_and_quick_access_defaults(ctx):
    assert ctx.settings.get("home.sections") == ["roamers", "live", "update", "news", "events", "quick"]
    qa = ctx.settings.get("nav.quick_access")
    assert {"kind": "tool", "id": "typechart"} not in qa  # Type matchups is in the main navigation now
    assert ctx.settings.get("live.swarm_estimate_minutes") == 20


def test_custom_home_and_quick_access_are_preserved(tmp_path):
    from companion.app import AppContext
    a = AppContext(str(tmp_path / "d"))
    a.settings.update({"home.sections": ["update", "events", "live", "shortcuts"], "nav.quick_access": [{"kind": "tool", "id": "typechart"}]})
    a.shutdown()
    b = AppContext(str(tmp_path / "d"))
    assert b.settings.get("home.sections") == ["update", "events", "live", "shortcuts"]  # stored as saved; translated in the UI
    assert b.settings.get("nav.quick_access") == [{"kind": "tool", "id": "typechart"}]
    b.shutdown()


def test_calculator_popout_is_registered(ctx):
    from companion.data.window_presets import PRESETS
    assert "calculator" in PRESETS and ctx.settings.get("window.calculator.mode") == "standard"


def test_roamers_include_animation_only_with_a_library(ctx, tmp_path):
    from gifgen import make_gif
    leg = ctx.live.legendaries(None)
    k0 = leg["current"]["kanto"]["id"]
    assert leg["current"]["kanto"]["ani"].startswith(f"/assets/library/ani/{k0}.gif")      # built-in library
    bw = tmp_path / "s/sprites/pokemon/versions/generation-v/black-white/animated"
    bw.mkdir(parents=True)
    k = leg["current"]["kanto"]["id"]
    (bw / f"{k}.gif").write_bytes(make_gif(80, 60))
    ctx.sprite_library.import_from(tmp_path / "s")
    assert ctx.live.legendaries(None)["current"]["kanto"]["ani"].startswith(f"/assets/library/ani/{k}.gif")
    assert json.dumps(ctx.live.legendaries(None)["status"]) == '"COMMUNITY-CYCLE"'  # classification unchanged
