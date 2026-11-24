"""Built-in player assets (2026-11-24): sprite library, PokeMMO item icons and the five regional walkthroughs.
A clean profile must show artwork and walkthroughs without any import."""
import gzip
import json
from pathlib import Path

from companion.config import BUNDLED_DATA_DIR

SPR = BUNDLED_DATA_DIR / "sprites"


def test_sprite_library_coverage_and_files():
    idx = json.loads((SPR / "index.json").read_text())
    art = json.loads((BUNDLED_DATA_DIR / "form_art.json").read_text())
    e = idx["entries"]
    for sid in art["species"]:
        for kind in ("static", "static_shiny", "ani", "ani_shiny"):
            assert kind in e[sid], (sid, kind)
    for fk in art["forms"]:
        key = fk.replace(":", "-")
        assert {"ani", "ani_shiny", "static", "static_shiny"} <= set(e[key]), key
    derived = [k for k, v in e.items() for kind in ("static", "static_shiny") if (v.get(kind) or {}).get("derived")]
    assert derived and all("-" in k for k in derived)          # only forms / female variants needed derived stills
    for key, v in e.items():
        for kind, x in v.items():
            f = SPR / kind.replace("_", "-") / x["file"]
            assert f.is_file() and f.stat().st_size > 50, (key, kind)
            assert not x["from"].startswith("/"), "no local paths in the manifest"
    assert sum(1 for k in e if k.endswith("-female")) >= 80
    assert idx["credits"]["sprites"] and idx["version"]


def test_clean_install_serves_builtin_sprites(client):
    code, d = client.call("GET", "/api/dex/species/6")
    assert d["art"]["ani"].startswith("/assets/library/ani/6.gif") and d["art"]["static_shiny"]
    import urllib.request
    with urllib.request.urlopen(client.base + d["art"]["ani"]) as r:
        assert r.read()[:6] == b"GIF89a"
    code, lst = client.call("GET", "/api/dex/species")
    s = next(x for x in lst["species"] if x["id"] == 25)
    assert s["still"]["url"] and s["still_shiny"]["url"] and s["ani"] and s["ani_shiny"]
    code, st = client.call("GET", "/api/sprites/library")
    assert st["installed"] and st["source_kind"] == "built-in" and not st["personal"]


def test_female_variant_exposed_only_where_it_differs(client):
    code, d = client.call("GET", "/api/dex/species/521")      # Unfezant: distinct female artwork
    assert d["art"].get("female", {}).get("static")
    code, d = client.call("GET", "/api/dex/species/6")
    assert "female" not in d["art"]


def test_item_icons_map_to_pokemmo_icon_ids():
    m = json.loads((BUNDLED_DATA_DIR / "item-icons" / "manifest.json").read_text())
    items = json.loads(gzip.decompress((BUNDLED_DATA_DIR / "reference" / "items.json.gz").read_bytes()))
    icon_ids = {str(r["icon_id"]) for g in items["groups"] for r in g["records"] if r.get("icon_id") is not None}
    assert set(m["files"]) <= icon_ids and m["groups_with_icon"] >= 2000
    for iid in list(m["files"])[:50]:
        assert (BUNDLED_DATA_DIR / "item-icons" / f"{iid}.png").read_bytes()[:4] == b"\x89PNG"


def test_bundled_walkthroughs_default_and_browsing_without_a_run(client, ctx):
    for region, n in (("kanto", 400), ("johto", 500), ("hoenn", 450), ("sinnoh", 650), ("unova", 450)):
        code, c = client.call("GET", f"/api/guides/catalog/{region}")
        assert code == 200 and c["source"] == "walkthrough" and len(c["steps"]) > n
        assert c["sources"][0]["id"] == "walkthrough" and c["steps"][0]["id"].startswith(f"{region}:imp:")
    run = ctx.guides.create_run("Walker")
    st = ctx.guides.state(run["id"], "kanto")
    assert st["source"] == "walkthrough"
    ctx.guides.set_steps(run["id"], [st["active_step_id"]], True)
    other = ctx.guides.create_run("Other")
    assert ctx.guides.state(other["id"], "kanto")["done"] == []          # progress is per character run
    code, c = client.call("GET", "/api/guides/catalog/kanto?source=milestones")
    assert c["source"] == "milestones" and len(c["steps"]) < 100


def test_existing_run_keeps_its_chosen_source(ctx):
    run = ctx.guides.create_run("Old")
    ctx.guides.set_region_prefs(run["id"], "johto", source="milestones")
    assert ctx.guides.state(run["id"], "johto")["source"] == "milestones"
