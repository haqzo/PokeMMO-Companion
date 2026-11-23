"""Form artwork resolution, placeholder detection, the optional sprite library, report sprites, caching,
and the user's Listed / Not listed checks (2026-11-23 pass)."""
import json
import os
import urllib.request
import zipfile
from pathlib import Path

import pytest

from companion.app import AppContext
from companion.config import BUNDLED_DATA_DIR
from companion.services.sprite_library import SpriteLibrary, image_info

from gifgen import make_gif, make_png

ART = json.loads((BUNDLED_DATA_DIR / "form_art.json").read_text(encoding="utf-8"))
FORMS = json.loads((BUNDLED_DATA_DIR / "forms.json").read_text(encoding="utf-8"))
needs_dumps = pytest.mark.skipif(not os.environ.get("POKEMMO_DUMPS_DIR"), reason="needs POKEMMO_DUMPS_DIR")


# ---------------------------------------------------------------- mapping
def test_every_catalogued_form_key_has_an_art_entry():
    keys = {f"{f['species_id']}:{f['form_key']}" for f in FORMS["forms"]}
    assert keys == set(ART["forms"]), "form_art.json must cover exactly the catalogued forms (by key, not count)"
    assert len(ART["species"]) == 649


def test_art_slots_are_not_client_record_ids_and_never_placeholders():
    slots = [e["client"]["icon_slot"] for e in ART["forms"].values() if e["client"]["icon_slot"]]
    assert len(slots) == len(set(slots)), "two forms share one art slot"
    egg = set(ART["placeholder_slots"]["egg"])
    unown = set(ART["placeholder_slots"]["unown"])
    for k, e in ART["forms"].items():
        s = e["client"]["icon_slot"]
        if s:
            assert s not in egg
            assert k.startswith("201:") or s not in unown, f"{k} mapped to an Unown slot"
    # the bug this replaced: Wash Rotom's DATA record (658) holds an Unown icon
    wash = next(f for f in FORMS["forms"] if f["species_id"] == 479 and f["form_key"] == "wash")
    assert wash["client_record"] == 658 and ART["forms"]["479:wash"]["client"]["icon_slot"] == 693


def test_external_sources_are_names_only_with_reuse_notes():
    for src in ("pokeapi", "smogon", "pokesprite"):
        assert "©" in ART["sources"][src]["reuse"] and "Not bundled" in ART["sources"][src]["reuse"]
    assert all(e["pokeapi"]["animated"] and e["pokeapi"]["animated_shiny"] for e in ART["forms"].values())
    assert ART["forms"]["646:black"]["smogon"]["name"] == "skyurem-oblack"
    assert ART["forms"]["550:blue-striped"]["smogon"]["served_name"] == "basculin-bluestriped"
    assert ART["species"]["122"]["smogon"]["name"] == "smr_mime" and ART["species"]["122"]["smogon"]["served_name"] == "mrmime"


def test_repository_contains_no_artwork():
    root = Path(__file__).resolve().parents[1]
    tracked = [p for p in root.rglob("*") if p.suffix.lower() in (".gif",) and ".git" not in p.parts]
    assert tracked == []


# ---------------------------------------------------------------- real dump
@needs_dumps
def test_form_art_resolution_against_real_dump(dump_paths):
    from companion.services.dex import DexService
    dex = DexService(dump_paths)
    st = {k: v["status"] for k, v in dex.local_form_art.items()}
    assert st["479:wash"] == "verified" and dex.art(479, "wash")["icon"].startswith("/assets/private/icons/693-0.png")
    for k in ("479:heat", "386:attack", "351:sunny", "487:origin", "492:sky", "648:pirouette", "201:b", "201:question", "585:winter"):
        assert st[k] == "verified", k
    for k in ("649:douse", "649:shock", "649:burn", "649:chill"):
        assert st[k] == "same-as-base" and dex.art(649, k.split(":")[1])["icon"] is None
    for k in ("646:black", "641:therian", "647:resolute", "493:fire"):
        assert st[k] == "none" and dex.art(int(k.split(":")[0]), k.split(":")[1])["icon"] is None
    # forms never fall back to base art
    e = dex.form_entry("646:black")
    assert e["icon"] is None and e["front"] is None and not e["own_sprite"]
    # Unown B–Q also have battle sprites in the client; R–? do not
    assert dex.art(201, "b")["front"] and dex.art(201, "r")["front"] is None
    assert dex.art(25)["front"] and dex.art(25)["local_status"] == "verified"


@needs_dumps
def test_placeholder_and_changed_art_are_detected(dump_paths):
    from companion.services.dex import DexService
    dex = DexService(dump_paths)
    dex.form_art = json.loads(json.dumps(dex.form_art))
    dex.form_art["forms"]["479:wash"]["client"]["icon_slot"] = 658   # the old record-id mapping → Unown art
    dex.form_art["forms"]["479:heat"]["client"]["icon_slot"] = 650   # egg
    dex.form_art["forms"]["479:fan"]["client"]["icon_slot"] = 479    # base Rotom
    dex.form_art["forms"]["479:mow"]["client"]["icon_sha1"] = "000000000000"  # client art changed since the check
    dex._resolve_local_form_art()
    s = dex.local_form_art
    assert s["479:wash"]["status"] == "placeholder" and s["479:heat"]["status"] == "placeholder"
    assert s["479:fan"]["status"] == "same-as-base"
    assert s["479:mow"]["status"] == "unverified" and dex.art(479, "mow")["icon"]
    assert dex.art(479, "wash")["icon"] is None


# ---------------------------------------------------------------- library
def _pokeapi_tree(root: Path, extra: dict | None = None) -> Path:
    bw = root / "sprites-master/sprites/pokemon/versions/generation-v/black-white"
    (bw / "animated/shiny").mkdir(parents=True)
    (bw / "animated/back").mkdir(parents=True)
    base649 = make_gif(colour=(150, 80, 200))
    files = {"animated/479.gif": make_gif(colour=(230, 120, 40)), "animated/479-wash.gif": make_gif(colour=(60, 120, 230), seed=1),
             "animated/shiny/479-wash.gif": make_gif(colour=(230, 60, 160), seed=2), "animated/649.gif": base649,
             "animated/649-chill.gif": base649, "animated/646-black.gif": make_gif(colour=(40, 40, 40), seed=3),
             "animated/386-attack.gif": b"GIF89a broken", "479-wash.png": make_png(), "animated/back/479-wash.gif": make_gif(),
             "animated/201-question.gif": make_gif(seed=4), "animated/999.gif": make_gif()}
    files.update(extra or {})
    for k, v in files.items():
        (bw / k).write_bytes(v)
    return root


def test_gif_validation():
    assert image_info(make_gif(frames=4))["frames"] == 4
    assert image_info(make_png())["format"] == "png"
    assert image_info(b"GIF89a broken" + b"\0" * 40) is None
    assert image_info(b"not an image at all, just some text padding") is None


def test_library_import_maps_exact_keys_and_refuses_bad_or_base_copies(tmp_path):
    from companion.config import make_paths
    paths = make_paths(tmp_path / "d")
    lib = SpriteLibrary(paths)
    src = _pokeapi_tree(tmp_path / "src")
    before = sorted((p.relative_to(src), p.stat().st_mtime) for p in src.rglob("*"))
    r = lib.import_from(src)
    assert r["forms"] == 3 and r["species"] == 2  # 479-wash, 646-black, 201-question ; 479, 649
    u = lib.urls("479-wash")
    assert set(u) == {"ani", "ani_shiny", "static"} and u["ani"].startswith("/assets/library/ani/479-wash.gif?v=")
    assert lib.urls("649-chill") == {}  # byte-identical to base Genesect → refused
    reasons = {x["path"].rsplit("/", 1)[-1]: x["reason"] for x in lib.index["refused"]}
    assert "identical to the base species" in reasons["649-chill.gif"] and "valid GIF" in reasons["386-attack.gif"]
    assert "999" not in json.dumps(lib.index["entries"])  # not a catalogued species
    assert lib.provenance("479-wash")["ani"]["layout"] == "pokeapi"
    assert sorted((p.relative_to(src), p.stat().st_mtime) for p in src.rglob("*")) == before  # source untouched


def test_library_accepts_zip_and_smogon_and_showdown_layouts(tmp_path):
    from companion.config import make_paths
    lib = SpriteLibrary(make_paths(tmp_path / "d"))
    z = tmp_path / "sprites.zip"
    with zipfile.ZipFile(z, "w") as zf:
        zf.writestr("sprites-main/src/sprites/gen5/srotom-oheat.gif", make_gif(seed=7))
        zf.writestr("sprites-main/src/sprites/gen5/srotom-oheat-s.gif", make_gif(seed=8))
        zf.writestr("sprites-main/src/sprites/gen5/srotom-oheat-b.gif", make_gif(seed=9))  # back sprite: ignored
        zf.writestr("sprites-main/src/sprites/gen5/smr_mime.gif", make_gif(seed=10))
        zf.writestr("showdown/gen5ani/kyurem-white.gif", make_gif(seed=11))
        zf.writestr("showdown/gen5ani-shiny/kyurem-white.gif", make_gif(seed=12))
    r = lib.import_from(z)
    assert set(lib.urls("479-heat")) == {"ani", "ani_shiny"} and lib.provenance("479-heat")["ani"]["layout"] == "smogon"
    assert set(lib.urls("122")) == {"ani"}
    assert set(lib.urls("646-white")) == {"ani", "ani_shiny"} and lib.provenance("646-white")["ani"]["layout"] == "showdown"
    assert r["accepted"] == 5


def test_failed_library_import_keeps_previous_library(tmp_path):
    from companion.config import make_paths
    lib = SpriteLibrary(make_paths(tmp_path / "d"))
    lib.import_from(_pokeapi_tree(tmp_path / "src"))
    v = lib.index["version"]
    empty = tmp_path / "empty"
    empty.mkdir()
    (empty / "readme.txt").write_text("nothing here")
    with pytest.raises(Exception, match="No recognised sprite files"):
        lib.import_from(empty)
    lib.reload()
    assert lib.index["version"] == v and lib.urls("479-wash")
    # an interrupted swap is recovered at start
    lib.root.rename(lib.root.with_name("sprite-library.prev"))
    SpriteLibrary(lib.paths).recover()
    lib.reload()
    assert lib.urls("479-wash")


def test_library_served_with_cache_and_only_images(client, ctx, tmp_path):
    ctx.sprite_library.import_from(_pokeapi_tree(tmp_path / "src"))
    url = ctx.sprite_library.urls("479-wash")["ani"]
    with urllib.request.urlopen(client.base + url) as r:
        assert r.headers["Content-Type"] == "image/gif" and "immutable" in r.headers["Cache-Control"]
        assert r.read()[:6] == b"GIF89a"
    (ctx.sprite_library.root / "ani" / "x.txt").write_text("secret")
    with pytest.raises(urllib.error.HTTPError):
        urllib.request.urlopen(client.base + "/assets/library/ani/x.txt")
    with pytest.raises(urllib.error.HTTPError):
        urllib.request.urlopen(client.base + "/assets/library/../companion.sqlite3")
    code, d = client.call("GET", "/api/dex/species/479?form=wash")
    assert d["form"]["art"]["ani"] == url and d["form"]["art"]["library"]["ani"]["layout"] == "pokeapi"
    code, st = client.call("GET", "/api/sprites/library")
    assert st["installed"] and st["coverage"]["forms_ani"] == 3
    code, rep = client.call("GET", "/api/dex/art")
    row = next(x for x in rep["forms"] if x["key"] == "479:wash")
    assert row["library"] == ["ani", "ani_shiny", "static"] and row["known_sources"]["pokeapi_animated"]
    code, _ = client.call("DELETE", "/api/sprites/library")
    assert not ctx.sprite_library.installed and client.call("GET", "/api/dex/species/479?form=wash")[1]["form"]["art"]["ani"] is None


def test_library_import_api_validates_folder(client):
    code, r = client.call("POST", "/api/sprites/library/import", {"folder": ""})
    assert code == 400
    code, r = client.call("POST", "/api/sprites/library/import", {"folder": "/nonexistent/folder"})
    assert code == 400 and "does not exist" in r["error"]


# ---------------------------------------------------------------- report sprites
def test_report_sprite_only_for_unambiguous_species(ctx):
    ctx.dex.sprites = {130: {"icon": "130-0.png", "front": "130-front-n.png"}, 349: {"icon": "349-0.png"}, 585: {"icon": "585-0.png"}}
    def ing(mid, title, body, topic="swarm"):
        return ctx.live.ingest({"id": mid, "event": "message", "time": 1_700_000_000, "topic": topic, "title": title, "message": body}, replay=True)
    a = ing("a", "Gyarados", "Kanto, Route 12", "alpha")
    b = ing("b", "Swarm spotted", "Hoenn, Route 119 — Feebas swarm")
    c = ing("c", "Swarm", "Unova, Route 6 — Deerling and Emolga reported")
    d = ing("d", "Alpha", "Sinnoh, Lake Acuity", "alpha")
    assert a["species_match"] == "title" and a["species_icon"].startswith("/assets/private/icons/130-0.png") and a["species_front"]
    assert b["species_match"] == "single-mention" and b["species_icon"]
    assert c["species_match"] == "ambiguous" and c["species_icon"] is None and c["species_id"]  # link kept, no sprite
    assert d["species_id"] is None and d["species_icon"] is None
    t = ctx.live.create_test("alpha")
    assert t["is_test"] and t["species_icon"] is None


def test_private_assets_cache_only_when_versioned(client, ctx):
    icons = ctx.paths.assets_dir / "icons"
    icons.mkdir(parents=True, exist_ok=True)
    (icons / "1-0.png").write_bytes(make_png(36, 36))
    with urllib.request.urlopen(client.base + "/assets/private/icons/1-0.png?v=abc") as r:
        assert "immutable" in r.headers["Cache-Control"]
    with urllib.request.urlopen(client.base + "/assets/private/icons/1-0.png") as r:
        assert r.headers["Cache-Control"] == "no-store"


def test_keepalive_responses_are_not_delayed(client):
    """TCP_NODELAY: 50 requests on one keep-alive connection must not each wait for a delayed ACK (~40 ms)."""
    import http.client, time
    host, port = client.base.split("//")[1].split(":")
    c = http.client.HTTPConnection(host, int(port))
    t = time.perf_counter()
    for _ in range(50):
        c.request("GET", "/api/settings", headers={"X-Companion-Token": client.token})
        c.getresponse().read()
    assert (time.perf_counter() - t) < 1.0  # was ~2 s before the fix


# ---------------------------------------------------------------- your Listed / Not listed checks
def test_listed_checks_persist_filter_and_stay_personal(tmp_path):
    from companion.server import CompanionServer
    from conftest import Client
    registry_before = (BUNDLED_DATA_DIR / "pokemmo_availability.json").read_bytes()
    ctx = AppContext(str(tmp_path / "data"))
    srv = CompanionServer(ctx, 0).start()
    cl = Client(srv, ctx.token)
    cl.call("PUT", "/api/dex/roster/640", {"in_dex": "no"})
    cl.call("PUT", "/api/dex/roster/25", {"in_dex": "yes"})
    srv.stop()
    ctx.shutdown()
    # "update": a new process on the same data folder
    ctx2 = AppContext(str(tmp_path / "data"))
    srv2 = CompanionServer(ctx2, 0).start()
    cl2 = Client(srv2, ctx2.token)
    _, r = cl2.call("GET", "/api/dex/species")
    by = {s["id"]: s for s in r["species"]}
    assert len(r["species"]) == 649  # reference records are kept, never removed
    assert by[640]["dex"] == "no" and "not_listed" in by[640]["tags"] and by[25]["dex"] == "yes" and "listed" in by[25]["tags"]
    _, d = cl2.call("GET", "/api/dex/species/640")
    assert d["availability"]["membership"]["basis"] == "your-check"
    assert any(m["method"] == "perma_raid" for m in d["availability"]["methods"])  # Virizion's permanent raid stays intact
    _, b = cl2.call("GET", "/api/backup/export")
    assert {x["species_id"] for x in b["tables"]["roster_checks"]} == {640, 25}
    srv2.stop()
    ctx2.shutdown()
    assert (BUNDLED_DATA_DIR / "pokemmo_availability.json").read_bytes() == registry_before  # never a universal claim


# ---------------------------------------------------------------- stills: visible bounds (2026-11-23 polish)
def test_png_alpha_bbox_reads_rgba_palette_and_opaque():
    from companion.services.sprite_library import png_alpha_bbox
    assert png_alpha_bbox(make_png(96, 96, box=(30, 29, 68, 71))) == [30, 29, 68, 71]
    assert png_alpha_bbox(make_png(96, 96, box=(9, 8, 83, 88), palette=True)) == [9, 8, 83, 88]
    assert png_alpha_bbox(make_png(12, 10)) == [0, 0, 12, 10]
    assert png_alpha_bbox(b"not a png") is None


def test_stills_carry_bounds_and_old_libraries_are_backfilled(tmp_path, ctx):
    bw = tmp_path / "s/sprites/pokemon/versions/generation-v/black-white"
    bw.mkdir(parents=True)
    (bw / "4.png").write_bytes(make_png(96, 96, box=(30, 29, 68, 71), palette=True))
    (bw / "6.png").write_bytes(make_png(96, 96, box=(9, 8, 83, 88)))
    lib = ctx.sprite_library
    lib.import_from(tmp_path / "s")
    st = lib.still("4")
    assert st["bbox"] == [30, 29, 68, 71] and st["w"] == 96 and st["url"].startswith("/assets/library/static/4.png?v=")
    # a library installed by the previous build has no bounds: they are added once, atomically
    idx = json.loads((lib.root / "index.json").read_text())
    for e in idx["entries"].values():
        e["static"].pop("bbox")
    (lib.root / "index.json").write_text(json.dumps(idx))
    lib.reload()
    assert lib.still("6")["bbox"] is None
    assert lib.backfill_bounds() == 2 and lib.backfill_bounds() == 0
    lib.reload()
    assert lib.still("6")["bbox"] == [9, 8, 83, 88]
    by = {s["id"]: s for s in ctx.dex.summaries(set(), {})}
    assert by[6]["still"]["bbox"] == [9, 8, 83, 88] and by[1]["still"] is None


def test_report_library_art_only_when_unambiguous(ctx, tmp_path):
    bw = tmp_path / "s/sprites/pokemon/versions/generation-v/black-white"
    (bw / "animated").mkdir(parents=True)
    (bw / "130.png").write_bytes(make_png(96, 96, box=(10, 10, 90, 90)))
    (bw / "animated/130.gif").write_bytes(make_gif(90, 80))
    (bw / "585.png").write_bytes(make_png(96, 96, box=(30, 30, 60, 70)))
    ctx.sprite_library.import_from(tmp_path / "s")
    def ing(mid, title, body):
        return ctx.live.ingest({"id": mid, "event": "message", "time": 1_700_000_000, "topic": "alpha", "title": title, "message": body}, replay=True)
    a = ing("a", "Gyarados", "Kanto, Route 12")
    c = ing("c", "Swarm", "Unova, Route 6 — Deerling and Emolga reported")
    assert a["species_still"]["bbox"] == [10, 10, 90, 90] and a["species_ani"].startswith("/assets/library/ani/130.gif")
    assert c["species_still"] is None and c["species_ani"] is None
    assert "still" in ctx.live.legendaries(None)["current"]["kanto"]


# ---------------------------------------------------------------- visual size tiers (docs/build/14)
LM = json.loads((BUNDLED_DATA_DIR / "legendary_mythical.json").read_text(encoding="utf-8"))


def test_legendary_mythical_list_is_the_complete_gen1_5_set():
    assert len(LM["legendary"]) == 35 and len(LM["mythical"]) == 13 and not set(LM["legendary"]) & set(LM["mythical"])
    for sid in (144, 145, 146, 150, 243, 244, 245, 249, 250, 377, 380, 381, 382, 383, 384, 480, 483, 487, 488, 638, 641, 643, 646):
        assert sid in LM["legendary"]
    for sid in (151, 251, 385, 386, 489, 490, 491, 492, 493, 494, 647, 648, 649):
        assert sid in LM["mythical"]
    assert "nothing about whether a Pokémon is obtainable" in LM["about"]


def test_legendary_and_mythical_always_use_the_large_tier(ctx):
    ctx.dex.species = {sid: {"height_dm": 2} for sid in LM["legendary"] + LM["mythical"]}  # tiny on purpose
    for sid in LM["legendary"] + LM["mythical"]:
        t = ctx.dex.size_tier(sid)
        assert t["tier"] == "l" and t["basis"] in ("legendary", "mythical")
    assert ctx.dex.size_tier(151)["basis"] == "mythical" and ctx.dex.size_tier(150)["basis"] == "legendary"


def test_size_tiers_follow_height_not_evolution_stage(ctx):
    ctx.dex.species = {4: {"height_dm": 6}, 5: {"height_dm": 11}, 6: {"height_dm": 17}, 1: {"height_dm": 7}, 2: {"height_dm": 10},
                       3: {"height_dm": 20}, 25: {"height_dm": 4}, 95: {"height_dm": 88}, 74: {"height_dm": 4}, 100: {"height_dm": 5}}
    tier = {sid: ctx.dex.size_tier(sid)["tier"] for sid in ctx.dex.species}
    assert (tier[4], tier[5], tier[6]) == ("s", "m", "l") and (tier[1], tier[2], tier[3]) == ("s", "m", "l")
    assert tier[25] == "xs" and tier[95] == "l"  # an unevolved Onix is large; actual size wins over stage
    assert ctx.dex.size_tier(7)["tier"] == "m" and ctx.dex.size_tier(7)["basis"] == "unknown"  # no data → medium
    # forms and shiny share the parent's tier, and availability is untouched by it
    assert ctx.dex.art(6)["size"]["tier"] == "l"
    assert "size" not in ctx.dex.availability(151) and ctx.dex.availability(151)["membership"]["state"] in ("unknown", "yes", "no", "conditional")


@needs_dumps
def test_tiers_and_bounds_from_the_real_dump(dump_paths):
    from companion.services.dex import DexService
    dex = DexService(dump_paths)
    t = lambda s: dex.size_tier(s)["tier"]  # noqa: E731
    assert [t(s) for s in (4, 5, 6, 1, 2, 3, 7, 8, 9)] == ["s", "m", "l"] * 3
    assert all(t(s) == "l" for s in (151, 251, 385, 492, 494, 150, 144, 243))
    a = dex.art(4)
    assert a["bounds"]["front"] and a["bounds"]["front"][2] - a["bounds"]["front"][0] < 96  # margins measured
    assert dex.art(479, "wash")["size"]["tier"] == dex.size_tier(479)["tier"]  # forms use the parent's tier
