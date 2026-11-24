"""Complete backups (2026-11-24): images inside the archive, checksums, preview, relationship remapping on merge,
replace with confirmation, interrupted restore recovery, automatic backups and retention."""
import base64
import json
import time
import zipfile

import pytest

from companion.app import AppContext
from companion.services import backup

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")


def _seed(ctx):
    """A realistic profile: a run with storyline progress, a custom guide with a cycle, a team linked to both a
    custom guide and the storyline, owned timers, a preset, an image and settings incl. window geometry."""
    run = ctx.guides.create_run("Ash")
    g = ctx.cguides.create({"title": "Gym reruns", "scope": "gym_rerun", "recurring": True})
    ctx.cguides.put_steps(g["id"], [{"kind": "check", "depth": 0, "text": "Brock", "links": []}])
    cyc = ctx.cguides.active_cycle(g["id"], create=True)
    ctx.storage.put_document("team", "team1", "Rerun team", {"version": 2, "purpose": "gym_rerun", "slots": [{"species": 130}, None, None, None, None, None]})
    ctx.guide_extras.put("cg:" + g["id"], {"timers": [{"name": "Cooldown", "seconds": 600}], "team_id": "team1"})
    ctx.guide_extras.put(f"story:{run['id']}:kanto", {"timers": [{"name": "Heal", "seconds": 60}], "team_id": "team1"})
    t1 = ctx.timers.create("Cooldown", 600, start=True, owner={"kind": "guide", "guide": "cg:" + g["id"], "cycle": cyc["id"], "template": "x"})
    t2 = ctx.timers.create("Heal", 60, owner={"kind": "guide", "guide": f"story:{run['id']}:kanto", "run": run["id"], "template": "y"})
    ctx.timers.save_preset("Daily", 86400)
    m = ctx.media.add("pic.png", base64.b64encode(PNG).decode(), "step picture")
    ctx.settings.update({"window.locations.geometry": {"x": 10, "y": 20, "w": 800, "h": 600}, "guides.active_run": run["id"]})
    ctx.storage.put_document("map_layout", "kanto", "kanto map layout", {"version": 1, "region": "kanto", "marks": [{"id": "m1"}], "updated_at": "2026-11-01T00:00:00Z"})
    return run, g, cyc, t1, t2, m


@pytest.fixture
def two(tmp_path):
    a = AppContext(str(tmp_path / "a"))
    b = AppContext(str(tmp_path / "b"))
    yield a, b
    a.shutdown()
    b.shutdown()


def test_archive_contains_images_and_checksums(two):
    a, _ = two
    *_, m = _seed(a)
    p = backup.write_archive(a.storage, a.paths.media, a.paths.backups, "manual")
    with zipfile.ZipFile(p) as z:
        names = set(z.namelist())
        assert {"backup.json", "manifest.json", f"media/{m['id']}.png"} <= names
        assert not any(n.startswith("private/") for n in names)
    payload, media = backup.read_archive(p)
    assert media[f"{m['id']}.png"] == PNG and payload["format_version"] == 2
    # a damaged archive is refused
    bad = p.with_name("companion-bad.zip")
    with zipfile.ZipFile(p) as src, zipfile.ZipFile(bad, "w") as dst:
        for i in src.infolist():
            data = src.read(i)
            dst.writestr(i, PNG[:10] if i.filename.startswith("media/") else data)
    with pytest.raises(ValueError, match="damaged"):
        backup.read_archive(bad)


def test_restore_into_fresh_profile_keeps_every_relationship(two):
    a, b = two
    run, g, cyc, t1, t2, m = _seed(a)
    p = backup.write_archive(a.storage, a.paths.media, a.paths.backups, "manual")
    pv = backup.preview(b.storage, backup.read_archive(p)[0])
    assert pv["counts"]["runs"] == 1 and pv["media_files"] == 1 and pv["documents_conflicting"] == 0
    st = backup.restore_archive(b.storage, b.paths.media, p, "replace", b.restore_marker)
    b.timers.load()
    assert st["media_files"] == 1 and (b.paths.media / f"{m['id']}.png").read_bytes() == PNG
    assert not b.restore_marker.exists()
    ex = b.guide_extras.get("cg:" + g["id"])
    assert ex["team"]["name"] == "Rerun team"
    assert b.guide_extras.get(f"story:{run['id']}:kanto")["team_id"] == "team1"
    assert {t["id"] for t in b.timers.list("cg:" + g["id"])["timers"]} == {t1["id"]}
    assert b.timers.list(f"story:{run['id']}:kanto")["timers"][0]["owner"]["run"] == run["id"]
    assert [p_["label"] for p_ in b.timers.presets()] == ["Daily"]
    assert b.settings.get("window.locations.geometry")["w"] == 800 and b.settings.get("guides.active_run") == run["id"]
    assert b.cguides.get(g["id"])["cycle"]["id"] == cyc["id"]
    assert b.region_maps.layout("kanto")["marks"][0]["id"] == "m1"


def test_merge_with_conflicting_ids_remaps_links(two):
    a, b = two
    run, g, cyc, t1, t2, m = _seed(a)
    p = backup.write_archive(a.storage, a.paths.media, a.paths.backups, "manual")
    # b already restored this once and then changed its own copy of the team and the storyline extras
    backup.restore_archive(b.storage, b.paths.media, p, "replace", b.restore_marker)
    b.storage.put_document("team", "team1", "My edited team", {"version": 2, "purpose": "pvp", "slots": [{"species": 6}, None, None, None, None, None]})
    st = backup.restore_archive(b.storage, b.paths.media, p, "merge", b.restore_marker)
    b.timers.load()
    assert st["runs_renamed"] == 1                                     # same run id → imported as a copy
    new_run = [r for r in b.storage.query("SELECT id FROM runs") if r["id"] != run["id"]][0]["id"]
    # the copied run brings its storyline extras and timers along, re-keyed to the new run id
    ex = b.guide_extras.get(f"story:{new_run}:kanto")
    assert ex["timers"][0]["name"] == "Heal"
    # the conflicting team was copied with a new id, and the imported extras point to THAT copy
    copy_id = ex["team_id"]
    assert copy_id != "team1" and b.storage.get_document("team", copy_id)["data"]["purpose"] == "gym_rerun"
    assert b.storage.get_document("team", "team1")["name"] == "My edited team"     # the local edit survives
    owned = b.timers.list(f"story:{new_run}:kanto")["timers"]
    assert owned and owned[0]["owner"]["run"] == new_run
    # the newer local map layout is kept (natural-key document), unchanged documents are not duplicated
    assert st.get("documents_unchanged", 0) >= 1
    assert len([d for d in b.storage.list_documents("timer_preset")]) == 1


def test_replace_needs_confirmation_over_http(client, tmp_path):
    s, r = client.call("POST", "/api/backup/archive")
    assert s == 200 and r["name"].endswith("-manual.zip")
    s, pv = client.call("POST", "/api/backup/preview", {"name": r["name"]})
    assert s == 200 and pv["name"] == r["name"]
    s, err = client.call("POST", "/api/backup/restore", {"name": r["name"], "mode": "replace"})
    assert s == 400
    s, ok = client.call("POST", "/api/backup/restore", {"name": r["name"], "mode": "replace", "confirm": True})
    assert s == 200 and ok["safety_backup"]
    s, err = client.call("POST", "/api/backup/restore", {"name": "../../etc/passwd", "mode": "merge"})
    assert s == 400
    s, lst = client.call("GET", "/api/backup/list")
    assert any(x["name"] == r["name"] for x in lst["backups"])


def test_interrupted_media_stage_is_finished_on_next_start(two, tmp_path):
    a, b = two
    *_, m = _seed(a)
    p = backup.write_archive(a.storage, a.paths.media, a.paths.backups, "manual")
    backup.import_all(b.storage, backup.read_archive(p)[0], "replace")          # database part committed …
    b.restore_marker.write_text(json.dumps({"archive": str(p), "stage": "media"}))  # … then the app died
    res = backup.finish_interrupted(b.storage, b.paths.media, b.restore_marker)
    assert res["recovered"] and res["media_files"] == 1 and not b.restore_marker.exists()
    assert (b.paths.media / f"{m['id']}.png").is_file()


def test_auto_backup_interval_and_retention(two):
    a, _ = two
    ab = backup.AutoBackup(a.storage, a.paths.media, a.paths.backups, a.settings)
    a.settings.update({"backup.auto_hours": 24})
    assert ab.run_once() is not None
    assert ab.run_once() is None                       # not due again yet
    for i in range(12):
        p = a.paths.backups / f"companion-backup-2020010{i % 10}-00000{i}-auto.zip"
        p.write_bytes(b"x")
        t = time.time() - 86400 * (i + 2)
        import os
        os.utime(p, (t, t))
    backup.prune(a.paths.backups)
    assert len(list(a.paths.backups.glob("*-auto.zip"))) == backup.KEEP_AUTO
    a.settings.update({"backup.auto_hours": 0})
    assert not ab.due()
