"""Connected tools (schema v3): Notes, Item Library, Box, Showcase, custom Guides, media, locations."""
import base64
import json
import sqlite3
import zipfile

import pytest

from companion.services import backup
from companion.services.items import build_catalog, categorize
from companion.services.library import parse_guide_text
from companion.storage import MIGRATIONS, Storage

PNG = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\0" * 32).decode()


# ------------------------------------------------------------------ notes
def test_notes_crud_tags_search_archive_trash_restore(client):
    code, n = client.call("POST", "/api/notes", {"title": "Route 1 plan", "body": "Hunt **Pikachu** at night", "tags": "hunt, Kanto,hunt",
                                                 "links": [{"kind": "species", "ref": "25", "label": "Pikachu"}]})
    assert code == 200 and n["tags"] == ["hunt", "kanto"] and n["links"][0]["ref"] == "25" and n["state"] == "active"
    _, n2 = client.call("POST", "/api/notes", {"title": "Shopping", "body": "Buy ultra balls", "tags": ["shop"]})
    assert [x["id"] for x in client.call("GET", "/api/notes?q=pikachu%20night")[1]["notes"]] == [n["id"]]
    assert [x["id"] for x in client.call("GET", "/api/notes?tag=shop")[1]["notes"]] == [n2["id"]]
    assert [x["id"] for x in client.call("GET", "/api/notes?kind=species&ref=25")[1]["notes"]] == [n["id"]]
    code, e = client.call("PATCH", f"/api/notes/{n['id']}", {"body": "Edited", "pinned": True})
    assert e["body"] == "Edited" and e["pinned"]
    client.call("POST", f"/api/notes/{n2['id']}/archive")
    assert [x["id"] for x in client.call("GET", "/api/notes")[1]["notes"]] == [n["id"]]
    assert client.call("GET", "/api/notes?state=archived")[1]["notes"][0]["id"] == n2["id"]
    code, _ = client.call("DELETE", f"/api/notes/{n['id']}")
    assert code == 400  # must be in trash first
    client.call("POST", f"/api/notes/{n['id']}/trash")
    code, _ = client.call("PATCH", f"/api/notes/{n['id']}", {"body": "x"})
    assert code == 400
    client.call("POST", f"/api/notes/{n['id']}/restore")
    assert client.call("GET", f"/api/notes/{n['id']}")[1]["state"] == "active"
    client.call("POST", f"/api/notes/{n['id']}/trash")
    assert client.call("DELETE", f"/api/notes/{n['id']}")[0] == 200
    assert client.call("GET", f"/api/notes/{n['id']}")[0] == 404


def test_note_validation_and_links(client):
    assert client.call("POST", "/api/notes", {"title": "x" * 201})[0] == 400
    assert client.call("POST", "/api/notes", {"links": [{"kind": "script", "ref": "1"}]})[0] == 400
    assert client.call("POST", "/api/notes", {"tags": [f"t{i}" for i in range(21)]})[0] == 400
    _, n = client.call("POST", "/api/notes", {"title": "a"})
    _, n = client.call("POST", f"/api/notes/{n['id']}/links", {"kind": "location", "ref": "kanto:12", "label": "Route 1"})
    assert n["links"] == [{"kind": "location", "ref": "kanto:12", "label": "Route 1"}]
    _, n = client.call("DELETE", f"/api/notes/{n['id']}/links/location/kanto%3A12")
    assert n["links"] == []


def test_notes_export_markdown_and_duplicate(client):
    _, n = client.call("POST", "/api/notes", {"title": "Gym list", "body": "1. Brock", "tags": ["gyms"]})
    _, d = client.call("POST", f"/api/notes/{n['id']}/duplicate")
    assert d["title"] == "Gym list (copy)" and d["id"] != n["id"]
    _, ex = client.call("GET", f"/api/notes/export?ids={n['id']}")
    assert ex["markdown"].startswith("# Gym list") and "tags: [gyms]" in ex["markdown"] and len(ex["json"]["notes"]) == 1


def test_species_notes_stay_separate(client, ctx):
    client.call("PUT", "/api/dex/species/25/note", {"body": "old per-species note"})
    assert client.call("GET", "/api/notes")[1]["notes"] == []
    sn = client.call("GET", "/api/notes/species")[1]["notes"]
    assert sn[0]["species_id"] == 25 and sn[0]["body"] == "old per-species note"


# ------------------------------------------------------------------ items
ITEMS = [
    {"id": 5083, "name": "Thunderstone", "desc": "A peculiar stone that makes certain species of POKéMON evolve.", "region_id": 2, "icon_id": 5083, "name_string_id": 1, "desc_string_id": 2},
    {"id": 83, "name": "Thunderstone", "desc": "A peculiar stone that makes certain species of POKéMON evolve.", "region_id": 0, "icon_id": 5083, "name_string_id": 1, "desc_string_id": 2},
    {"id": 5155, "name": "Oran Berry", "desc": "Restores HP.", "region_id": 2, "icon_id": 5155, "name_string_id": 3, "desc_string_id": 4},
    {"id": 9, "name": "???", "desc": "", "region_id": 0, "icon_id": -1},
    {"id": 777, "name": "TM - Thunderbolt", "desc": "Teaches Thunderbolt.", "region_id": 2, "icon_id": 4000},
]
SPECIES = {25: {"evolutions": [{"to": 26, "method": "ITEM", "value": 5083}], "held_item_ids": [5155]}, 1: {"evolutions": [], "held_item_ids": []}}


def test_catalog_groups_aliases_without_losing_source_ids():
    cat = build_catalog(ITEMS, SPECIES, {"5083.png", "5155.png"}, {"es": {1: "Piedra Trueno"}})
    stone = [g for g in cat["groups"] if g["name"] == "Thunderstone"][0]
    assert sorted(r["id"] for r in stone["records"]) == [83, 5083] and stone["category"] == "evolution"
    assert stone["names"] == {"es": "Piedra Trueno"} and stone["evolution_uses"][0]["to"] == 26
    berry = [g for g in cat["groups"] if g["name"] == "Oran Berry"][0]
    assert berry["held_by"] == [25] and berry["category"] == "berries"
    tm = [g for g in cat["groups"] if g["name"].startswith("TM")][0]
    assert tm["icon"] is None and tm["move_name"] == "Thunderbolt" and tm["category"] == "tms"
    assert [g for g in cat["groups"] if g["name"] == "???"][0]["category"] == "placeholder"
    assert cat["stats"] == {"records": 5, "with_icon": 3, "missing_icon": 2}


def test_category_rules_explain_themselves():
    assert categorize({"id": 1, "name": "Ultra Ball", "desc": "A Poké Ball"}, set()) == ("balls", "name ends with “Ball”")
    assert categorize({"id": 2, "name": "Leftovers", "desc": "An item to be held by a POKéMON."}, set())[0] == "hold"
    assert categorize({"id": 3, "name": "Goodie Bag (2023)", "desc": "contains an unknown reward"}, set())[0] == "rewards"


def test_item_api_requires_installed_data(client):
    code, r = client.call("GET", "/api/items")
    assert code == 200 and r["available"] is False and "Install" in r["reason"]
    assert client.call("GET", "/api/items/5083")[0] == 404


def test_item_user_state_and_alias_lookup(client, ctx):
    (ctx.paths.dex_dir).mkdir(parents=True, exist_ok=True)
    (ctx.paths.dex_dir / "items.json").write_text(json.dumps(build_catalog(ITEMS, SPECIES, {"5083.png"}, {})))
    ctx.items.reload()
    code, r = client.call("PUT", "/api/items/83/user", {"favourite": True, "qty": 3})  # alias id resolves to the group
    assert code == 200 and r == {"id": 83, "fav": True, "qty": 3} or r["qty"] == 3
    _, d = client.call("GET", "/api/items/5083")
    assert d["fav"] and d["qty"] == 3 and len(d["records"]) == 2
    assert client.call("PUT", "/api/items/5083/user", {"qty": -1})[0] == 400
    lst = client.call("GET", "/api/items")[1]
    assert lst["available"] and lst["counts"]["evolution"] == 1


@pytest.mark.skipif(not __import__("os").environ.get("POKEMMO_DUMPS_DIR"), reason="needs POKEMMO_DUMPS_DIR")
def test_real_dump_item_library(dump_paths):
    from companion.services.items import ItemService
    from companion.storage import Storage as S
    svc = ItemService(dump_paths, S(dump_paths.db, dump_paths.backups))
    stats = svc.catalog["stats"]
    assert stats["records"] == 3006 and stats["with_icon"] + stats["missing_icon"] == 3006
    names = {g["name"] for g in svc.catalog["groups"]}
    assert {"Master Ball", "Thunderstone", "Destiny Knot", "Leftovers"} <= names
    thunder = svc.by_id[5083]
    assert any(u["to"] == 26 for u in thunder["evolution_uses"])
    # icons were extracted only into the private data folder
    assert (dump_paths.assets_dir / "items" / "5083.png").exists()


# --------------------------------------------------------------- box / showcase
def test_box_validation_and_sync_is_explicit(client, ctx):
    run = ctx.guides.create_run("Ash")
    assert client.call("POST", "/api/box", {"species_id": 25, "ivs": {"hp": 32}})[0] == 400
    assert client.call("POST", "/api/box", {"species_id": 25, "evs": {"hp": 252, "attack": 252, "defense": 252}})[0] == 400
    assert client.call("POST", "/api/box", {"species_id": 25, "moves": ["a", "b", "c", "d", "e"]})[0] == 400
    assert client.call("POST", "/api/box", {"species_id": 25, "nature": "Grumpy"})[0] == 400
    code, e = client.call("POST", "/api/box", {"species_id": 25, "nickname": "Sparky", "shiny": True, "alpha": True, "nature": "Timid",
                                              "ivs": {"hp": 31, "speed": 31}, "run_id": run["id"], "method": "horde", "encounter_count": 4021})
    assert code == 200 and e["iv_total"] == 62 and e["species_name"] == "Pikachu"
    # recording a Box entry does not touch the Pokédex registration
    assert ctx.storage.query("SELECT * FROM dex_progress") == []
    _, res = client.call("POST", f"/api/box/{e['id']}/sync-dex", {"run_id": run["id"], "status": "caught_ot"})
    assert res["previous"] is None and res["now"]["owned_shiny"] == 1 and res["now"]["caught_alpha"] == 1
    client.call("DELETE", f"/api/box/{e['id']}")
    assert client.call("GET", "/api/box")[1]["entries"] == []
    client.call("POST", f"/api/box/{e['id']}/restore")
    assert len(client.call("GET", "/api/box")[1]["entries"]) == 1


def test_showcase_hides_sensitive_fields_by_default(client):
    _, e = client.call("POST", "/api/box", {"species_id": 6, "nickname": "Blaze", "ot": "Secret", "ivs": {"hp": 31}, "encounter_count": 99})
    _, hidden = client.call("POST", "/api/box", {"species_id": 7, "showcase_ok": False})
    code, sc = client.call("POST", "/api/showcases", {"name": "Shinies", "entries": [e["id"], hidden["id"], "missing"]})
    assert code == 200 and len(sc["items"]) == 1
    it = sc["items"][0]
    assert it["nickname"] == "Blaze" and it["ot"] is None and it["ivs"] is None and it["encounter_count"] is None
    _, sc = client.call("PUT", f"/api/showcases/{sc['id']}", {"name": "Shinies", "entries": [e["id"]],
                                                               "options": {"show": {"ot": True, "encounter_count": True}}})
    assert sc["items"][0]["ot"] == "Secret" and sc["items"][0]["encounter_count"] == 99
    assert client.call("POST", "/api/showcases", {"name": "x", "template": "hologram"})[0] == 400


# ------------------------------------------------------------ custom guides
def test_custom_guide_steps_cycles_and_history(client):
    code, g = client.call("POST", "/api/cguides", {"title": "Kanto gym rerun", "scope": "gym_rerun", "region": "kanto", "recurring": True,
                                                   "steps": [{"kind": "heading", "text": "Pewter"}, {"kind": "check", "text": "Brock"},
                                                             {"kind": "check", "text": "Misty"}]})
    assert code == 200 and g["checks"] == 2 and g["done"] == 0
    s1 = g["steps"][1]["id"]
    _, g = client.call("POST", f"/api/cguides/{g['id']}/mark", {"step_id": s1, "done": True})
    assert g["done"] == 1 and g["cycle"]["number"] == 1
    # editing/reordering keeps step ids and marks
    steps = [g["steps"][2], g["steps"][1], {"kind": "check", "text": "Lt. Surge"}]
    _, g = client.call("PUT", f"/api/cguides/{g['id']}/steps", {"steps": steps})
    assert g["steps"][1]["id"] == s1 and g["steps"][1]["done_at"] and g["checks"] == 3
    _, g = client.call("POST", f"/api/cguides/{g['id']}/complete", {"note": "week 47"})
    assert g["cycle"]["number"] == 2 and g["done"] == 0
    assert [h["number"] for h in g["history"]] == [2, 1] and g["history"][1]["done"] == 1
    _, ex = client.call("GET", f"/api/cguides/{g['id']}/export")
    assert "- [ ] Brock" in ex["markdown"]


def test_guide_text_import_preview():
    steps = parse_guide_text("# Pewter City\n- [ ] Beat Brock\n  - buy potions\nPlain text\n1. Numbered")
    assert [s["kind"] for s in steps] == ["heading", "check", "check", "text", "check"] and steps[2]["depth"] == 1


def test_guide_import_rejects_pdf_and_reads_docx(client):
    assert client.call("POST", "/api/cguides/import/preview", {"filename": "a.pdf", "content_b64": base64.b64encode(b"%PDF").decode()})[0] == 400
    import io
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
                   '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Route 1</w:t></w:r></w:p>'
                   '<w:p><w:r><w:t>Catch Rattata</w:t></w:r></w:p></w:body></w:document>')
    code, r = client.call("POST", "/api/cguides/import/preview", {"filename": "g.docx", "content_b64": base64.b64encode(buf.getvalue()).decode()})
    assert code == 200 and [s["kind"] for s in r["steps"]] == ["heading", "check"] and r["title"] == "g"


# ------------------------------------------------------------------ media
def test_media_upload_validates_type_and_serves_locally(client, ctx):
    assert client.call("POST", "/api/media", {"filename": "x.svg", "data_b64": base64.b64encode(b"<svg/>").decode()})[0] == 400
    code, m = client.call("POST", "/api/media", {"filename": "shot.png", "data_b64": PNG})
    assert code == 200 and m["url"].startswith("/media/")
    import urllib.request
    with urllib.request.urlopen(client.base + m["url"]) as r:
        assert r.headers["Content-Type"] == "image/png" and r.read().startswith(b"\x89PNG")
    assert (ctx.paths.media / f"{m['id']}.png").exists()


# --------------------------------------------------------------- migration / backup
def test_v2_database_migrates_to_v3_keeping_progress(tmp_path):
    db = tmp_path / "v2.sqlite3"
    con = sqlite3.connect(db)
    for v in (1, 2):
        for stmt in MIGRATIONS[v]:
            con.execute(stmt)
    con.execute("INSERT INTO meta(key, value) VALUES('schema_version', '2')")
    con.execute("INSERT INTO runs(id, character_name, run_label, last_region, created_at, updated_at) VALUES('r1','Old','', 'kanto','t','t')")
    con.execute("INSERT INTO dex_progress(run_id, species_id, status, updated_at) VALUES('r1', 640, 'owned', 't')")
    con.execute("INSERT INTO notes(species_id, body, updated_at) VALUES(25, 'keep me', 't')")
    con.commit(); con.close()
    s = Storage(db, tmp_path / "b")
    assert s.migrated_from == 2 and "pre-migration-v2-to-v" in s.backup_created
    assert s.query_one("SELECT status FROM dex_progress WHERE species_id=640")["status"] == "owned"
    assert s.query_one("SELECT body FROM notes WHERE species_id=25")["body"] == "keep me"
    for t in ("lib_notes", "note_links", "item_user", "owned_pokemon", "showcases", "custom_guides", "custom_guide_steps",
              "guide_cycles", "guide_cycle_marks", "media", "dex_observations"):
        s.query(f"SELECT * FROM {t}")
    s.close()
    s2 = Storage(db, tmp_path / "b")  # idempotent re-open
    assert s2.migrated_from is None
    s2.close()


def test_backup_roundtrip_includes_connected_tools(client, ctx):
    _, n = client.call("POST", "/api/notes", {"title": "keep", "links": [{"kind": "species", "ref": "1"}]})
    _, e = client.call("POST", "/api/box", {"species_id": 1})
    client.call("POST", "/api/cguides", {"title": "g", "steps": [{"kind": "check", "text": "a"}]})
    data = backup.export_all(ctx.storage)
    for t in ("lib_notes", "note_links", "owned_pokemon", "custom_guides", "custom_guide_steps"):
        assert data["tables"][t], t
    ctx.storage.execute("DELETE FROM lib_notes")
    ctx.storage.execute("DELETE FROM note_links")
    backup.import_all(ctx.storage, data, "merge")
    assert client.call("GET", f"/api/notes/{n['id']}")[1]["links"][0]["ref"] == "1"


# ----------------------------------------------------------- species + forms catalog
REQUIRED_FORMS = ["386:attack", "386:defense", "386:speed", "351:sunny", "351:rainy", "351:snowy", "479:heat", "479:wash", "479:frost",
                  "479:fan", "479:mow", "412:sandy", "412:trash", "413:sandy", "413:trash", "422:east", "423:east", "585:summer", "586:winter",
                  "550:blue-striped", "555:zen", "641:therian", "642:therian", "645:therian", "646:black", "646:white", "647:resolute",
                  "648:pirouette", "649:douse", "649:shock", "649:burn", "649:chill", "487:origin", "492:sky", "493:fire", "201:question"]


def test_catalog_has_649_species_plus_named_forms(client):
    _, r = client.call("GET", "/api/dex/species")
    assert len(r["species"]) == 649 and len(r["forms"]) == 82
    keys = {f["entry"] for f in r["forms"]}
    assert set(REQUIRED_FORMS) <= keys and len(keys) == 82


def test_catalog_parity_with_synergy_reference_by_key_not_count(client, ctx):
    _, p = client.call("GET", "/api/dex/catalog/parity")
    assert p["match"] and p["ours_total"] == p["reference_total"] == 731
    assert p["missing_here"] == [] and p["not_in_reference"] == [] and p["unresolved_reference_slugs"] == []
    # dropping one form must be reported as a missing key, not hidden by a matching total
    ctx.dex.forms.pop("479:wash")
    from companion.config import BUNDLED_DATA_DIR
    p2 = ctx.dex.parity(json.loads((BUNDLED_DATA_DIR / "catalog_reference_synergy.json").read_text()))
    assert p2["missing_here"] == ["479:wash"] and not p2["match"]


def test_form_types_stats_and_honest_availability(client):
    _, d = client.call("GET", "/api/dex/species/646?form=black")
    f = d["form"]
    assert f["types"] == ["dragon", "ice"] and f["stats"]["attack"] == 170 and f["types_source"] == "Companion forms manifest"
    assert "flying" not in d["form_matchups"]["groups"]["0"] and len(d["forms"]) == 3 and d["forms"][0]["base"]
    _, r = client.call("GET", "/api/dex/species")
    kb = [x for x in r["forms"] if x["entry"] == "646:black"][0]
    assert kb["permanent"] is None and kb["tags"] == ["unverified"]  # a form is never assumed obtainable
    burmy = [x for x in r["forms"] if x["entry"] == "412:sandy"][0]
    assert burmy["tags"] == [s for s in r["species"] if s["id"] == 412][0]["tags"]  # cosmetic variant follows its species
    assert client.call("GET", "/api/dex/species/25?form=nope")[0] == 404


def test_forms_never_inflate_registration_counts(client, ctx):
    run = ctx.guides.create_run("A")
    client.call("PUT", f"/api/dex/progress/{run['id']}/479", {"status": "owned"})
    _, c = client.call("GET", f"/api/dex/progress/{run['id']}/counts")
    assert c["owned"] == 1 and c["scope_size"] == 649


@pytest.mark.skipif(not __import__("os").environ.get("POKEMMO_DUMPS_DIR"), reason="needs POKEMMO_DUMPS_DIR")
def test_manifest_agrees_with_users_client_form_records(dex):
    checked = 0
    for key in dex.forms:
        e = dex.form_entry(key)
        assert e["mismatch"] == [], key
        if e["client_record"]:
            assert e["in_client"] and e["stats_source"] == "your client dump", key
            checked += 1
    assert checked == 18
