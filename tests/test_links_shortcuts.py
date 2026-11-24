"""Websites & links (bookmarks), keyboard shortcut registry, and Storyline guide step actions."""
import sqlite3

import pytest

from companion.data import shortcuts as sc
from companion.services.bookmarks import ALPHAPEDIA_DEFAULTS, DEFAULTS, PROJECT_DEFAULTS, BookmarkError, BookmarkService, normalize_url
from companion.storage import MIGRATIONS, SCHEMA_VERSION, Storage


# --------------------------------------------------------------- bookmarks
def test_defaults_seeded_exactly_once_and_never_reinserted(client, ctx):
    _, r = client.call("GET", "/api/bookmarks")
    urls = {b["url"] for b in r["bookmarks"]}
    assert urls == {"https://forums.pokemmo.com/", "https://pokemmo.com/", "https://support.pokemmo.com/",
                    "https://synergymmo.com/", "https://pokemmohub.com/"} | {d["url"] for d in PROJECT_DEFAULTS + ALPHAPEDIA_DEFAULTS}
    hub = [b for b in r["bookmarks"] if b["seed_key"] == "hub"][0]
    forums = [b for b in r["bookmarks"] if b["seed_key"] == "forums"][0]
    client.call("DELETE", f"/api/bookmarks/{hub['id']}")
    client.call("PATCH", f"/api/bookmarks/{forums['id']}", {"url": "https://forums.pokemmo.com/index.php?/forum/1/", "title": "My forum"})
    # simulate an app restart / update: seeding runs again
    assert BookmarkService(ctx.storage).seed() == 0
    _, r = client.call("GET", "/api/bookmarks")
    assert not any(b["seed_key"] == "hub" for b in r["bookmarks"])
    assert [b for b in r["bookmarks"] if b["seed_key"] == "forums"][0]["title"] == "My forum"
    assert r["defaults_missing"] == ["PokeMMO Hub"]
    _, r = client.call("POST", "/api/bookmarks/restore-defaults")
    assert r["restored"] == ["PokeMMO Hub"] and len(r["bookmarks"]) == len(DEFAULTS)
    assert [b for b in r["bookmarks"] if b["seed_key"] == "forums"][0]["title"] == "My forum"  # edits kept


def test_project_defaults_upgrade_respects_custom_bookmarks_and_deletions(ctx):
    db = ctx.storage
    db.execute("DELETE FROM bookmarks WHERE seed_key LIKE 'haqzo-%'")
    db.execute("DELETE FROM meta WHERE key='bookmarks_projects_seeded'")
    project, deleted, missing = PROJECT_DEFAULTS
    custom = ctx.bookmarks.create({"title": "My patch tool", "url": project["url"].rstrip("/"),
                                   "category": "My tools", "favourite": True})
    tombstone = ctx.bookmarks.create({"title": "Old theme link", "url": deleted["url"]})
    ctx.bookmarks.delete(tombstone["id"])

    service = BookmarkService(db)
    assert service.get(custom["id"]) == custom
    assert service.get(tombstone["id"])["deleted_at"]
    assert service.list(category="Projects by Haqzo")["bookmarks"][0]["url"] == missing["url"]
    assert len(service.list(include_deleted=True)["bookmarks"]) == len(DEFAULTS)
    assert service.seed() == 0

    service.delete(service.list(category="Projects by Haqzo")["bookmarks"][0]["id"])
    assert BookmarkService(db).list(category="Projects by Haqzo")["bookmarks"] == []
    assert project["title"] not in service.restore_defaults()["restored"]
    assert service.get(custom["id"]) == custom


def test_alphapedia_bookmarks_upgrade_respects_existing_links(ctx):
    db = ctx.storage
    db.execute("DELETE FROM bookmarks WHERE seed_key IN ('alphapedia','alphapedia-discord')")
    db.execute("DELETE FROM meta WHERE key='bookmarks_alphapedia_seeded'")
    custom = ctx.bookmarks.create({"title": "My Alpha site", "url": "https://alpha.pokemmotools.org/"})
    service = BookmarkService(db)
    links = service.list()["bookmarks"]
    assert [link for link in links if link["url"] == custom["url"]] == [custom]
    discord = next(link for link in links if link["seed_key"] == "alphapedia-discord")
    assert discord["url"] == "https://discord.gg/Qeuc9k4yMw"
    service.delete(discord["id"])
    assert BookmarkService(db).seed() == 0
    assert not any(link["id"] == discord["id"] for link in service.list()["bookmarks"])


def test_custom_bookmark_crud_search_favourite_order(client):
    code, b = client.call("POST", "/api/bookmarks", {"title": "Breeding <b>guide</b>", "url": "pikammo.fr/Pokemmo/en/guide/raids", "category": "Guides", "favourite": True})
    assert code == 200 and b["url"] == "https://pikammo.fr/Pokemmo/en/guide/raids" and b["favourite"] and b["title"] == "Breeding <b>guide</b>"
    assert client.call("POST", "/api/bookmarks", {"url": "https://pikammo.fr/Pokemmo/en/guide/raids"})[0] == 400  # duplicate
    _, r = client.call("GET", "/api/bookmarks?q=raids")
    assert [x["id"] for x in r["bookmarks"]] == [b["id"]] and "Guides" in r["categories"]
    assert client.call("GET", "/api/bookmarks")[1]["bookmarks"][0]["id"] == b["id"]  # favourites first
    _, r = client.call("GET", "/api/bookmarks?fav=1")
    assert len(r["bookmarks"]) == 1
    ids = [x["id"] for x in client.call("GET", "/api/bookmarks")[1]["bookmarks"]]
    _, r = client.call("POST", "/api/bookmarks/order", {"ids": list(reversed(ids))})
    client.call("PATCH", f"/api/bookmarks/{b['id']}", {"favourite": False})
    assert [x["id"] for x in client.call("GET", "/api/bookmarks")[1]["bookmarks"]] == list(reversed(ids))
    client.call("DELETE", f"/api/bookmarks/{b['id']}")
    assert all(x["id"] != b["id"] for x in client.call("GET", "/api/bookmarks")[1]["bookmarks"])
    client.call("POST", f"/api/bookmarks/{b['id']}/restore")
    assert any(x["id"] == b["id"] for x in client.call("GET", "/api/bookmarks")[1]["bookmarks"])


@pytest.mark.parametrize("bad", ["javascript:alert(1)", "data:text/html,hi", "file:///etc/passwd", "http://pokemmo.com", "steam://run/1",
                                 "https://user:pw@x.com", "https://localhost/", "https://127.0.0.1/", "https://192.168.0.2/", "https://a b.com", "", "notaurl"])
def test_unsafe_urls_rejected(bad):
    with pytest.raises(BookmarkError):
        normalize_url(bad)


def test_open_uses_stored_url_and_reports_failure(client, ctx, monkeypatch):
    opened = []
    monkeypatch.setattr("companion.routes_library.open_external_url", lambda url, **kwargs: opened.append(url) or True)
    b = client.call("GET", "/api/bookmarks")[1]["bookmarks"][0]
    code, r = client.call("POST", f"/api/bookmarks/{b['id']}/open", {"url": "javascript:evil()"})
    assert code == 200 and r["ok"] and opened == [b["url"]]
    monkeypatch.setattr("companion.routes_library.open_external_url", lambda url, **kwargs: False)
    _, r = client.call("POST", f"/api/bookmarks/{b['id']}/open")
    assert r["ok"] is False and "browser" in r["message"]
    # a record tampered into an unsafe scheme is refused at open time
    ctx.storage.execute("UPDATE bookmarks SET url='javascript:x' WHERE id=?", (b["id"],))
    assert client.call("POST", f"/api/bookmarks/{b['id']}/open")[0] == 400


def test_v3_database_migrates_and_seeds(tmp_path):
    db = tmp_path / "v3.sqlite3"
    con = sqlite3.connect(db)
    for v in (1, 2, 3):
        for stmt in MIGRATIONS[v]:
            con.execute(stmt)
    con.execute("INSERT INTO meta(key, value) VALUES('schema_version', '3')")
    con.execute("INSERT INTO lib_notes(id, title, created_at, updated_at) VALUES('n1', 'keep', 't', 't')")
    con.execute("INSERT INTO reports(id, provider, message_id, kind, kind_basis, received_at) "
                "VALUES('alpha', 'ntfy', 'abc', 'alpha', 'topic', 't')")
    con.commit(); con.close()
    s = Storage(db, tmp_path / "b")
    assert s.migrated_from == 3 and f"pre-migration-v3-to-v{SCHEMA_VERSION}" in s.backup_created
    assert s.query_one("SELECT kind, phenomenon FROM reports WHERE id='alpha'") == {"kind": "alpha", "phenomenon": None}
    assert s.query_one("SELECT title FROM lib_notes WHERE id='n1'")["title"] == "keep"
    svc = BookmarkService(s)  # seeds on first use
    assert len(svc.list()["bookmarks"]) == len(DEFAULTS) and svc.seed() == 0 and BookmarkService(s).seed() == 0
    s.close()


# --------------------------------------------------------------- shortcuts
def test_combo_normalization_and_rules():
    assert sc.normalize("shift+ctrl+arrowright") == "Ctrl+Shift+ArrowRight"
    assert sc.normalize("Shift+Ctrl+ArrowRight") == "Ctrl+Shift+ArrowRight"
    assert sc.normalize("Control+alt+n") == "Ctrl+Alt+N"
    assert sc.normalize("F8") == "F8"
    for bad in ("A", "Shift+A", "Ctrl+Hyper+A", "Ctrl+Bogus"):
        with pytest.raises(ValueError):
            sc.normalize(bad)
    with pytest.raises(ValueError):
        sc.validate_bindings({"guide.next": "Ctrl+W"})  # reserved
    with pytest.raises(ValueError):
        sc.validate_bindings({"guide.next": "Ctrl+Alt+K", "guide.prev": "Alt+Ctrl+K"})  # duplicate after normalization
    assert sc.validate_bindings({"guide.next": "ctrl+alt+k", "removed.action": "Ctrl+Alt+J"}) == {"guide.next": "Ctrl+Alt+K"}


def test_shortcut_api_remap_conflict_reset_persist(client, ctx):
    _, r = client.call("GET", "/api/shortcuts")
    acts = {a["id"]: a for a in r["actions"]}
    assert acts["guide.next"]["binding"] == "Ctrl+Shift+ArrowRight" and r["global"] is False
    code, r = client.call("PUT", "/api/shortcuts/guide.prev", {"binding": "Ctrl+Shift+ArrowRight"})
    assert code == 409 and "already used" in r["error"]
    _, r = client.call("PUT", "/api/shortcuts/guide.prev", {"binding": "Ctrl+Shift+ArrowRight", "replace": True})
    acts = {a["id"]: a for a in r["actions"]}
    assert acts["guide.prev"]["binding"] == "Ctrl+Shift+ArrowRight" and acts["guide.next"]["binding"] is None
    assert client.call("PUT", "/api/shortcuts/guide.toggle", {"binding": "Ctrl+C"})[0] == 400
    _, r = client.call("PUT", "/api/shortcuts/guide.toggle", {"binding": None})
    assert {a["id"]: a for a in r["actions"]}["guide.toggle"]["binding"] is None
    # persisted in settings (survives restart)
    assert ctx.settings.get("shortcuts.bindings")["guide.prev"] == "Ctrl+Shift+ArrowRight"
    assert client.call("PUT", "/api/shortcuts/guide.next", {"reset": True})[0] == 409  # default is taken now
    _, r = client.call("PUT", "/api/shortcuts/guide.next", {"reset": True, "replace": True})
    assert {a["id"]: a for a in r["actions"]}["guide.next"]["binding"] == "Ctrl+Shift+ArrowRight"
    _, r = client.call("POST", "/api/shortcuts/reset")
    assert {a["id"]: a for a in r["actions"]}["guide.prev"]["binding"] == "Ctrl+Shift+ArrowLeft"
    from companion.settings import SettingsError
    with pytest.raises(SettingsError):
        ctx.settings.update({"shortcuts.global": True})


# --------------------------------------------------------- guide step actions
def _setup(ctx, client, name="Ash"):
    run = ctx.guides.create_run(name)
    _, st = client.call("GET", f"/api/guides/runs/{run['id']}/state?region=kanto")
    return run, st


def test_guide_next_prev_toggle_and_boundaries(client, ctx):
    run, st = _setup(ctx, client)
    first = st["active_step_id"]
    visible = [x["id"] for x in st["steps"] if st["show_optional"] or x.get("mandatory") is not False]
    _, r = client.call("POST", f"/api/guides/runs/{run['id']}/action", {"action": "prev", "region": "kanto"})
    assert r["ok"] is False and r["boundary"] == "start"
    _, r = client.call("POST", f"/api/guides/runs/{run['id']}/action", {"action": "next", "region": "kanto"})
    assert r["ok"] and r["step"] == visible[visible.index(first) + 1]
    _, r = client.call("POST", f"/api/guides/runs/{run['id']}/action", {"action": "toggle", "region": "kanto"})
    assert r["ok"] and r["done"] is True and r["step"] == visible[1]  # toggling never moves the pointer
    _, r = client.call("POST", f"/api/guides/runs/{run['id']}/action", {"action": "toggle", "region": "kanto"})
    assert r["done"] is False
    # last-step boundary never completes anything
    ctx.guides.set_region_prefs(run["id"], "kanto", active_step_id=visible[-1])
    _, r = client.call("POST", f"/api/guides/runs/{run['id']}/action", {"action": "next", "region": "kanto"})
    assert r["ok"] is False and r["boundary"] == "end" and r["state"]["done"] == []


def test_guide_action_dedupes_and_respects_expected_step(client, ctx):
    run, st = _setup(ctx, client)
    _, a = client.call("POST", f"/api/guides/runs/{run['id']}/action", {"action": "toggle", "region": "kanto", "nonce": "k1"})
    _, b = client.call("POST", f"/api/guides/runs/{run['id']}/action", {"action": "toggle", "region": "kanto", "nonce": "k1"})
    assert a["ok"] and b.get("duplicate") and a["done"] is True
    assert client.call("GET", f"/api/guides/runs/{run['id']}/state?region=kanto")[1]["done"] == [st["active_step_id"]]
    _, r = client.call("POST", f"/api/guides/runs/{run['id']}/action", {"action": "toggle", "region": "kanto", "expect_step": "kanto:other"})
    assert r["ok"] is False and r.get("stale")


def test_guide_actions_isolated_per_character(client, ctx):
    a, sa = _setup(ctx, client, "Red")
    b, sb = _setup(ctx, client, "Blue")
    client.call("POST", f"/api/guides/runs/{a['id']}/action", {"action": "toggle", "region": "kanto"})
    client.call("POST", f"/api/guides/runs/{a['id']}/action", {"action": "next", "region": "kanto"})
    _, stb = client.call("GET", f"/api/guides/runs/{b['id']}/state?region=kanto")
    assert stb["done"] == [] and stb["active_step_id"] == sb["active_step_id"]
