"""Storyline objectives backed by the actual regional walkthroughs."""

import sqlite3
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing

import pytest

from companion.app import AppContext
from companion.data.reference import REGIONS
from companion.storage import MIGRATIONS, utcnow


@pytest.mark.parametrize("region", REGIONS)
def test_sequential_bundled_progress_visits_every_step_and_finishes(ctx, region):
    guide = ctx.guides
    run = guide.create_run("Sequential walkthrough", region=region)["id"]
    steps = guide.steps(region, "walkthrough")
    assert len({s["chapter_index"] for s in steps}) > 1
    assert guide.state(run, region)["active_step_id"] == steps[0]["id"]
    for index, step in enumerate(steps):
        result = guide.progress_steps(run, region, [step["id"]], True, source="walkthrough")
        assert result["changed"] == 1
        expected = steps[min(index + 1, len(steps) - 1)]["id"]
        state = guide.state(run, region)
        assert state["active_step_id"] == expected
        assert state["finished"] == (index == len(steps) - 1)
    assert state["counts"]["unclassified"] == {"done": len(steps), "total": len(steps)}
    assert guide.step_action(run, region, "next", steps[-1]["id"])["boundary"] == "end"
    assert guide.undo(run) == {"undone": 1}
    state = guide.state(run, region)
    assert not state["finished"] and state["active_step_id"] == steps[-1]["id"]


def test_legacy_hoenn_pointer_recovers_and_manual_position_survives_reopen(ctx, tmp_path):
    run = "legacy-hoenn"
    steps = ctx.guides.steps("hoenn", "walkthrough")
    route102 = [s for s in steps if s["chapter_index"] == 4]
    route104 = [s for s in steps if s["chapter_index"] == 5]
    woods = [s for s in steps if s["chapter_index"] == 6]
    later104 = next(s for s in steps if s["chapter_index"] == 7)
    assert {s["chapter"] for s in route102 + route104 + woods} == {"Route 102", "Route 104", "Petalburg Woods"}
    completed = [s["id"] for s in steps if s["chapter_index"] <= 4] + [route104[0]["id"], later104["id"]]
    profile = tmp_path / "hoenn"
    profile.mkdir()
    now = utcnow()
    with closing(sqlite3.connect(profile / "companion.sqlite3")) as db, db:
        for version in range(1, 9):
            for statement in MIGRATIONS[version]:
                db.execute(statement)
        db.execute("INSERT INTO meta(key,value) VALUES('schema_version','8')")
        db.execute("INSERT INTO runs(id,character_name,last_region,created_at,updated_at) VALUES(?,?,?,?,?)",
                   (run, "Old Hoenn objective", "hoenn", now, now))
        db.execute("INSERT INTO run_regions(run_id,region,source,active_step_id,updated_at) VALUES(?,?,?,?,?)",
                   (run, "hoenn", "walkthrough", route102[-1]["id"], now))
        db.executemany("INSERT INTO step_status(run_id,step_id,status,updated_at) VALUES(?,?,'done',?)",
                       [(run, sid, now) for sid in completed])
    app = AppContext(str(profile))
    guides = app.guides
    assert app.storage.migrated_from == 8 and app.storage.backup_created
    with closing(sqlite3.connect(app.storage.backup_created)) as backup:
        assert backup.execute("SELECT value FROM meta WHERE key='schema_version'").fetchone() == ("8",)
    current = guides.state(run, "hoenn")["active_step_id"]
    assert current == route104[1]["id"]
    remaining = [s for s in route104 if s["id"] not in completed]
    for step in remaining:
        guides.progress_steps(run, "hoenn", [step["id"]], True, source="walkthrough")
    assert guides.state(run, "hoenn")["active_step_id"] == woods[0]["id"]
    assert later104["chapter"] == "Route 104"
    manual = guides.step_action(run, "hoenn", "current", woods[0]["id"], "walkthrough", route102[-1]["id"])
    assert manual["ok"]
    app.shutdown()

    reopened = AppContext(str(profile))
    try:
        state = reopened.guides.state(run, "hoenn")
        assert state["active_step_id"] == route102[-1]["id"]
        assert completed[0] in state["done"]
        assert later104["id"] in state["done"] and woods[0]["id"] not in state["done"]
    finally:
        reopened.shutdown()


def test_racing_windows_cannot_restore_an_old_objective(ctx):
    guide = ctx.guides
    run = guide.create_run("Concurrent Hoenn", region="hoenn")["id"]
    first, second, third, fourth = [s["id"] for s in guide.steps("hoenn", "walkthrough")[:4]]
    # Multiple ordered checkboxes remain valid while the current pointer advances.
    with ThreadPoolExecutor(max_workers=2) as pool:
        f = pool.submit(guide.progress_steps, run, "hoenn", [first], True, source="walkthrough")
        g = pool.submit(guide.progress_steps, run, "hoenn", [second], True, source="walkthrough")
        assert f.result()["changed"] == g.result()["changed"] == 1
    assert guide.state(run, "hoenn")["active_step_id"] == third
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: guide.step_action(run, "hoenn", "next", third), range(2)))
    assert {r["ok"] for r in results} == {True, False}
    assert any(r.get("stale") for r in results)
    assert guide.state(run, "hoenn")["active_step_id"] == fourth
    assert guide.undo(run) == {"undone": 1}
    assert guide.state(run, "hoenn")["active_step_id"] == fourth


def test_optional_filter_mark_through_with_undo_and_source_switch(client, ctx):
    guide = ctx.guides
    run = guide.create_run("Milestones")["id"]
    root = f"/api/guides/runs/{run}"
    guide.set_region_prefs(run, "kanto", source="milestones", show_optional=False)
    steps = guide.steps("kanto", "milestones")
    optional_index = next(i for i, s in enumerate(steps) if s["mandatory"] is False)
    optional = steps[optional_index]["id"]
    before = steps[optional_index - 1]["id"]
    after = steps[optional_index + 1]["id"]
    guide.set_region_prefs(run, "kanto", active_step_id=before)
    body = {"region": "kanto", "step": before, "source": "milestones"}
    assert client.call("POST", root + "/mark-through", {**body, "preview": True})[1]["would_mark"] == optional_index
    assert client.call("POST", root + "/mark-through", body)[1]["changed"] == optional_index
    assert guide.state(run, "kanto")["active_step_id"] == after
    assert optional not in guide.state(run, "kanto")["done"]
    assert client.call("POST", root + "/undo")[1]["undone"] == optional_index
    assert guide.state(run, "kanto")["active_step_id"] == before
    assert not guide.state(run, "kanto")["done"]

    guide.set_region_prefs(run, "kanto", show_optional=True)
    assert guide.step_action(run, "kanto", "next", before)["step"] == optional
    guide.set_region_prefs(run, "kanto", show_optional=False)
    assert guide.state(run, "kanto")["active_step_id"] == after
    guide.set_region_prefs(run, "kanto", source="walkthrough")
    assert client.call("POST", root + "/steps", {**body, "done": True})[1]["stale"]
    assert guide.state(run, "kanto")["done"] == []
    assert guide.state(run, "kanto")["active_step_id"] == guide.steps("kanto", "walkthrough")[0]["id"]
