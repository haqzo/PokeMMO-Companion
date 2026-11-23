"""Built-in PokeMMO reference data and built-in region maps: a clean installation works with no player imports."""
import gzip
import hashlib
import json
import re
import shutil
import socket
from pathlib import Path

import pytest

from companion.config import BUNDLED_DATA_DIR, make_paths
from companion.services.dex import DexService
from companion.services.items import ItemService

REF = BUNDLED_DATA_DIR / "reference"
MAPS = BUNDLED_DATA_DIR / "maps"


def test_clean_install_uses_bundled_data(ctx):
    assert not (ctx.paths.dex_dir / "manifest.json").exists()
    assert ctx.dex.imported and ctx.dex.manifest["source_kind"] == "bundled"
    assert len(ctx.dex.species) == 649 and len(ctx.dex.locations()) == 629
    assert ctx.items.available and ctx.dex.extras["skills"]
    assert ctx.dex.location("kanto:4867")["name"] == "Route 1"
    assert "built-in PokeMMO data" in ctx.dex.location("kanto:4867")["provenance"]
    st = ctx.dex.status()
    assert st["source_kind"] == "bundled" and st["reference"]["counts"]["location_rows"] == 33405


def test_bundled_manifest_integrity_and_no_private_material():
    m = json.loads((REF / "manifest.json").read_text())
    for f in m["files"]:
        raw = gzip.decompress((REF / f["file"]).read_bytes())
        assert hashlib.sha256(raw).hexdigest() == f["sha256"]
    blob = "".join(gzip.decompress((REF / f["file"]).read_bytes()).decode() for f in m["files"]) + json.dumps(m)
    assert not re.search(r"/home/|/tmp/|/mnt/|C:\\\\Users", blob)
    items = json.loads(gzip.decompress((REF / "items.json.gz").read_bytes()))
    assert all("desc" not in g and "descs" not in g and "icon" not in g for g in items["groups"])
    sp = json.loads(gzip.decompress((REF / "species.json.gz").read_bytes()))
    assert sum(len(s.get("locations", [])) for s in sp.values()) == m["counts"]["location_rows"]


def test_personal_import_takes_precedence(tmp_path):
    """Owners who imported their own client data keep using it (bundled data is only the default)."""
    paths = make_paths(tmp_path / "data")
    paths.dex_dir.mkdir(parents=True, exist_ok=True)
    sp = json.loads(gzip.decompress((REF / "species.json.gz").read_bytes()))
    sp["25"]["name"] = "Pikachu (personal copy)"
    (paths.dex_dir / "species.json").write_text(json.dumps(sp))
    (paths.dex_dir / "extras.json").write_text(gzip.decompress((REF / "extras.json.gz").read_bytes()).decode())
    (paths.dex_dir / "sprites.json").write_text("{}")
    (paths.dex_dir / "manifest.json").write_text(json.dumps({"imported_at": "2026-11-22T00:00:00Z", "dump_date": "2026-11-16"}))
    d = DexService(paths)
    assert d.species[25]["name"] == "Pikachu (personal copy)" and d.manifest.get("source_kind") != "bundled"
    # a corrupt personal copy falls back to the bundled data instead of leaving the app empty
    (paths.dex_dir / "species.json").write_text("{broken")
    d.reload()
    assert d.manifest["source_kind"] == "bundled" and len(d.species) == 649
    assert ItemService(paths, None).available


def test_geometry_links_every_location_to_a_valid_id(ctx):
    g = json.loads((MAPS / "geometry.json").read_text())
    ids = {l["id"]: l for l in ctx.dex.locations()}
    regions = {m["region"] for m in g["maps"]}
    assert regions == {"kanto", "johto", "hoenn", "sinnoh", "unova"}
    linked = set()
    for m in g["maps"]:
        assert (MAPS / m["file"]).is_file()
        assert hashlib.sha256((MAPS / m["file"]).read_bytes()).hexdigest() == m["sha256"]
        fids = [f["id"] for f in m["features"]]
        assert len(fids) == len(set(fids))
        for f in m["features"]:
            for i in f["location_ids"]:
                assert i in ids, (m["id"], f["id"], i)
                assert ids[i]["region"] == m["region"]
                linked.add(i)
            if f["kind"] in ("route", "sea"):
                assert all(0 <= x <= 1 and 0 <= y <= 1 for line in f["lines"] for x, y in line)
            elif f["kind"] == "town":
                assert 0 <= f["x"] and f["x"] + f["w"] <= 1 and 0 <= f["y"] and f["y"] + f["h"] <= 1
            elif f["kind"] != "list":
                assert 0 <= f["x"] <= 1 and 0 <= f["y"] <= 1
    assert linked == set(ids)                       # every PokeMMO location can be reached from a map
    for r, c in g["coverage"].items():
        assert c["linked"] == c["locations"] and not c["not_on_map"]


def test_floors_stay_separate_and_names_match(ctx):
    g = json.loads((MAPS / "geometry.json").read_text())
    feats = {f["id"]: f for m in g["maps"] for f in m["features"]}
    names = {l["id"]: l["name"] for l in ctx.dex.locations()}
    assert sorted(names[i] for i in feats["mt-moon"]["location_ids"]) == ["Mt. Moon (1F)", "Mt. Moon (B1F)", "Mt. Moon (B2F)"]
    assert [names[i] for i in feats["r204n"]["location_ids"]] == ["Route 204 (North)"]
    assert [names[i] for i in feats["r204s"]["location_ids"]] == ["Route 204 (South)"]
    assert all(names[i].startswith("Route 1") is False or names[i] == "Route 1" for i in feats["r1u"]["location_ids"])
    assert feats["saffron"]["location_ids"] == []      # no wild Pokémon listed: the app says so, nothing is invented


def test_maps_are_original_svg_without_embedded_images():
    for f in MAPS.glob("*.svg"):
        s = f.read_text()
        assert s.startswith("<svg") and "<image" not in s and "data:image" not in s and "href" not in s.replace("xmlns", "")


def test_maps_rebuild_is_reproducible(tmp_path, monkeypatch):
    import tools.mapgen.build_maps as bm
    monkeypatch.setattr(bm, "OUT", tmp_path)
    assert bm.main() == 0
    for f in MAPS.glob("*.svg"):
        assert (tmp_path / f.name).read_bytes() == f.read_bytes()
    assert json.loads((tmp_path / "geometry.json").read_text()) == json.loads((MAPS / "geometry.json").read_text())


def test_builtin_map_api_and_assets_offline(client, monkeypatch):
    real = socket.socket.connect

    def guard(self, addr):
        assert addr[0] in ("127.0.0.1", "::1", "localhost"), f"network used: {addr}"
        return real(self, addr)
    monkeypatch.setattr(socket.socket, "connect", guard)
    s, g = client.call("GET", "/api/maps/builtin")
    assert s == 200 and len([m for m in g["maps"] if m.get("style") != "game"]) == 7
    game = [m for m in g["maps"] if m.get("style") == "game"]
    assert {m["region"] for m in game} == {"kanto", "johto", "hoenn", "sinnoh"} and all(m["file"].startswith("game/") for m in game)
    import urllib.request
    url = g["maps"][0]["url"]
    with urllib.request.urlopen(client.base + url) as r:
        assert r.headers["Content-Type"] == "image/svg+xml" and r.read().startswith(b"<svg")
    for bad in ("/assets/builtin-maps/../reference/manifest.json", "/assets/builtin-maps/geometry.json"):
        try:
            urllib.request.urlopen(client.base + bad)
            raise AssertionError(bad)
        except urllib.error.HTTPError as e:
            assert e.code == 404
    s, enc = client.call("GET", "/api/locations-encounters?region=unova")
    assert s == 200 and len(enc["rows"]) == 6902


def test_time_bitmask_excludes_not_in_period(client):
    s, enc = client.call("GET", "/api/locations-encounters?region=kanto")
    s, d = client.call("GET", "/api/locations/kanto%3A4867")
    hooth = [r for r in d["rows"] if r["name"] == "Hoothoot" and r["day"]["kind"] == "none" and r["morning"]["kind"] == "none"]
    assert hooth
    rows = [r for r in enc["rows"] if r[0] == "kanto:4867" and r[1] == 163]
    assert any(r[5] == 4 for r in rows)              # night only


def test_legacy_marks_are_kept_on_upgrade(ctx):
    """Marks saved by c562c0e (on extracted ROM artwork) are preserved, flagged as legacy (no basis)."""
    old = {"marks": [{"kind": "point", "map": "kanto", "x": 0.3, "y": 0.4, "tag": "town", "location_id": "kanto:4867"}]}
    ctx.region_maps.save_layout("kanto", old, set())
    lay = ctx.region_maps.layout("kanto")
    assert lay["marks"][0]["basis"] is None
    new = {"marks": lay["marks"] + [{"kind": "point", "map": "kanto", "x": 0.5, "y": 0.5, "tag": "route", "location_id": "kanto:4867", "basis": "builtin-v1"}]}
    ctx.region_maps.save_layout("kanto", new, set())
    marks = ctx.region_maps.layout("kanto")["marks"]
    assert [m["basis"] for m in marks] == [None, "builtin-v1"]


def test_onboarding_and_ui_have_no_mandatory_import_text():
    ui = Path(__file__).resolve().parents[1] / "ui" / "js"
    home = (ui / "pages" / "home.js").read_text()
    assert "Install your PokeMMO data (one time)" not in home
    loc = (ui / "pages" / "locations.js").read_text()
    assert "Region maps…" not in loc and "Import from my ROM" not in loc
