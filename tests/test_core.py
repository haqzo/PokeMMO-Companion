"""Storage, settings, reference data and HTTP security."""
import sqlite3

import pytest

from companion.data import reference as ref
from companion.settings import SettingsError, validate
from companion.storage import SCHEMA_VERSION, Storage


def test_v1_database_migrates_to_v2_with_backup_and_keeps_data(tmp_path):
    import sqlite3 as _sq
    from companion.storage import MIGRATIONS
    db = tmp_path / "old.sqlite3"
    con = _sq.connect(db)
    for stmt in MIGRATIONS[1]:
        con.execute(stmt)
    con.execute("INSERT INTO meta(key, value) VALUES('schema_version', '1')")
    con.execute("INSERT INTO runs(id, character_name, run_label, last_region, created_at, updated_at) VALUES('r1','Old','', 'kanto','t','t')")
    con.execute("INSERT INTO step_status(run_id, step_id, status, updated_at) VALUES('r1','kanto:m:starter','done','t')")
    con.commit(); con.close()
    s = Storage(db, tmp_path / "b")
    assert s.migrated_from == 1 and s.backup_created and "pre-migration-v1-to-v" in s.backup_created
    assert s.query_one("SELECT character_name FROM runs WHERE id='r1'")["character_name"] == "Old"
    assert s.query_one("SELECT status FROM step_status WHERE run_id='r1'")["status"] == "done"
    s.execute("INSERT INTO dex_progress(run_id, species_id, status, updated_at) VALUES('r1', 1, 'seen', 't')")
    cols = [r["name"] for r in s.query("PRAGMA table_info(reports)")]
    assert {"region", "location", "source_url"} <= set(cols)
    s.close()


def test_schema_created_and_versioned(tmp_path):
    s = Storage(tmp_path / "db.sqlite3", tmp_path / "b")
    assert s._current_version() == SCHEMA_VERSION
    assert s.migrated_from == 0 and s.backup_created is None
    s.close()
    s2 = Storage(tmp_path / "db.sqlite3", tmp_path / "b")  # reopen: no migration, no backup
    assert s2.migrated_from is None
    s2.close()


def test_refuses_newer_schema_instead_of_losing_data(tmp_path):
    s = Storage(tmp_path / "db.sqlite3", tmp_path / "b")
    s.execute("UPDATE meta SET value='999' WHERE key='schema_version'")
    s.close()
    with pytest.raises(RuntimeError, match="newer"):
        Storage(tmp_path / "db.sqlite3", tmp_path / "b")


def test_backup_is_a_readable_copy(tmp_path):
    s = Storage(tmp_path / "db.sqlite3", tmp_path / "b")
    s.set_settings({"appearance.nav": "horizontal"})
    path = s.backup("t")
    con = sqlite3.connect(path)
    assert con.execute("SELECT value FROM settings WHERE key='appearance.nav'").fetchone()[0] == '"horizontal"'
    con.close()
    s.close()


@pytest.mark.parametrize("key,value", [("appearance.nav", "diagonal"), ("nope.key", 1), ("notify.alpha", "loud"),
                                       ("appearance.high_contrast", "yes"), ("app.last_route", "javascript:1")])
def test_settings_validation_rejects(key, value):
    with pytest.raises(SettingsError):
        validate(key, value)


def test_settings_clamps_opacity_to_legible_floor():
    assert validate("window.storyline.bg_opacity", 5) == 20  # floor lowered; the text outline keeps it readable
    assert validate("appearance.text_scale", 400) == 200   # text size 60–200 % (2026-11-24); interface scale is separate


def test_settings_roundtrip(ctx):
    ctx.settings.update({"appearance.nav": "horizontal", "window.storyline.bg_opacity": 60})
    s = ctx.settings.all()
    assert s["appearance.nav"] == "horizontal" and s["window.storyline.bg_opacity"] == 60
    ctx.settings.reset("appearance.")
    assert ctx.settings.all()["appearance.nav"] == "vertical"
    assert ctx.settings.all()["window.storyline.bg_opacity"] == 60  # appearance reset leaves windows alone


# ------------------------------------------------------------ type chart
def test_seventeen_types_no_fairy():
    assert len(ref.TYPES) == 17 and "fairy" not in ref.TYPES


@pytest.mark.parametrize("a,d,m", [("ghost", "steel", .5), ("dark", "steel", .5), ("ghost", "normal", 0),
                                   ("normal", "ghost", 0), ("electric", "ground", 0), ("psychic", "dark", 0),
                                   ("fire", "bug", 2), ("dragon", "dragon", 2), ("steel", "steel", .5),
                                   ("poison", "steel", 0), ("bug", "dark", 2), ("ice", "fire", .5)])
def test_type_effectiveness_gen2_5(a, d, m):
    assert ref.effectiveness(a, d) == m


def test_repeated_mono_type_counted_once():
    assert ref.matchup("ground", ["electric", "electric"]) == 2


def test_chart_totals_match_gen2_5():
    flat = [v for row in ref.chart_matrix() for v in row]
    assert flat.count(2) == 46 and flat.count(.5) == 57 and flat.count(0) == 7


# --------------------------------------------------------------- natures
def test_natures():
    assert len(ref.NATURES) == 25
    assert sum(1 for u, d in ref.NATURES.values() if u == d) == 5
    assert ref.nature_multiplier("Adamant", "attack") == 1.1 and ref.nature_multiplier("Adamant", "sp_attack") == .9
    assert ref.nature_multiplier("Hardy", "attack") == 1.0


def test_stat_formula_textbook_values():
    assert ref.calc_stat("hp", 108, 31, 0, 100, "Adamant") == 357
    assert ref.calc_stat("attack", 130, 31, 252, 100, "Adamant") == 394
    assert ref.calc_stat("hp", 1, 31, 252, 100, None) == 1  # Shedinja


# ------------------------------------------------------------------ HTTP
def test_api_requires_token(client):
    code, body = client.call("GET", "/api/bootstrap", token=False)
    assert code == 401


def test_foreign_host_rejected(client):
    code, _ = client.call("GET", "/api/bootstrap", headers={"Host": "evil.example"})
    assert code == 403


def test_static_traversal_blocked(client):
    import urllib.request
    for path in ("/../companion/app.py", "/%2e%2e/companion/app.py", "/assets/private/../../companion.sqlite3"):
        req = urllib.request.Request(client.base + path)
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                assert r.status != 200 or b"sqlite" not in r.read()[:20]
        except urllib.error.HTTPError as e:
            assert e.code in (403, 404)


def test_bootstrap_and_bad_setting(client):
    code, b = client.call("GET", "/api/bootstrap")
    assert code == 200 and b["version"] == "0.1.0" and b["mode"] == "browser"
    code, b = client.call("PATCH", "/api/settings", {"appearance.nav": "sideways"})
    assert code == 400 and "must be one of" in b["error"]


def test_species_index_is_649_without_import(client):
    """No player import: the built-in PokeMMO data is active from the first launch (2026-11-23 owner requirement)."""
    code, b = client.call("GET", "/api/dex/species")
    assert code == 200 and len(b["species"]) == 649 and b["status"]["imported"] is True and b["status"]["source_kind"] == "bundled"
    assert all(s_["dex"] != "no" for s_ in b["species"])  # nothing is hidden by the registry
    assert [s["types"] for s in b["species"] if s["id"] == 25][0] == ["electric"]


def test_sse_delivers_events(ctx, client):
    import threading
    import urllib.request
    got = []

    def listen():
        req = urllib.request.Request(client.base + f"/api/events/stream?token={ctx.token}")
        with urllib.request.urlopen(req, timeout=5) as r:
            for line in r:
                if line.startswith(b"data:"):
                    got.append(line)
                    return
    t = threading.Thread(target=listen, daemon=True)
    t.start()
    import time
    for _ in range(50):
        if ctx.bus.subscriber_count:
            break
        time.sleep(0.05)
    client.call("PATCH", "/api/settings", {"appearance.text_scale": 110})
    t.join(5)
    assert got and b'"settings"' in got[0]


def test_shell_command_in_browser_mode_is_reported_unsupported(client):
    code, b = client.call("POST", "/api/shell/command", {"action": "open_popout", "tool": "storyline"})
    assert code == 200 and b["queued"] is False and b["supported"] is False
    code, b = client.call("POST", "/api/shell/command", {"action": "rm -rf"})
    assert code == 400
