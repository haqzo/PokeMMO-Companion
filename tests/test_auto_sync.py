"""Regression: old private PokeMMO dumps are synchronized without repeat UI imports."""
import json
from pathlib import Path

from companion.config import make_paths
from companion.services import importer


def _legacy_import(tmp_path: Path):
    paths = make_paths(tmp_path / "appdata")
    source = tmp_path / "earlier-import"
    source.mkdir()
    archive = source / "PokedexData.zip"
    archive.write_bytes(b"already-selected-source")  # detection only; parser is mocked
    manifest = {
        "importer": "dex-1",
        "folder": str(source),
        "sources": {"pokedex": {"path": str(archive), "fingerprint": importer.fingerprint(archive)}},
        "counts": {"species": 649, "items": 3006},
    }
    (paths.dex_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (paths.dex_dir / "species.json").write_text('{"1":{"name":"Bulbasaur"}}', encoding="utf-8")
    return paths, source, archive


def test_no_dump_does_not_make_an_unapproved_import(tmp_path):
    paths = make_paths(tmp_path / "no-data")
    assert importer.sync_existing_import(paths)["state"] == "not-installed"
    assert not (paths.dex_dir / "items.json").exists()


def test_legacy_dump_automatically_builds_missing_item_catalog(tmp_path, monkeypatch):
    paths, source, archive = _legacy_import(tmp_path)
    calls = []

    def fake_import(found_paths, folder=None, progress=None, guard=False):
        assert guard is True  # automatic refreshes always guard against shrinking
        assert found_paths == paths
        assert Path(folder) == source
        calls.append(folder)
        (paths.dex_dir / "items.json").write_text('{"groups":[]}', encoding="utf-8")
        return {"counts": {"item_groups": 2090}}

    monkeypatch.setattr(importer, "import_dumps", fake_import)
    status = importer.sync_existing_import(paths)
    assert status["state"] == "synchronized" and status["reason"] == "missing item catalog" and status["items"] == 2090
    assert calls == [str(source)]
    assert archive.read_bytes() == b"already-selected-source"
    assert (paths.dex_dir / "species.json").exists()

    # The catalog is already there; unchanged local data does not trigger a re-import.
    mf = paths.dex_dir / "manifest.json"
    mf.write_text(json.dumps({**json.loads(mf.read_text()), "importer": importer.IMPORTER_VERSION}))
    assert importer.sync_existing_import(paths)["state"] == "current"
    assert len(calls) == 1


def test_unavailable_previous_source_preserves_installed_species(tmp_path):
    paths, source, archive = _legacy_import(tmp_path)
    archive.unlink()
    source.rmdir()
    res = importer.sync_existing_import(paths)
    assert res["state"] == "source-unavailable" and "ItemSpriteDump.zip" in res["reason"] and str(source) in res["folders"]
    assert (paths.dex_dir / "manifest.json").is_file()
    assert json.loads((paths.dex_dir / "species.json").read_text())["1"]["name"] == "Bulbasaur"


def test_changed_known_source_syncs_but_no_unrelated_folders(tmp_path, monkeypatch):
    paths, source, archive = _legacy_import(tmp_path)
    (paths.dex_dir / "items.json").write_text('{"groups":[]}', encoding="utf-8")
    manifest_file = paths.dex_dir / "manifest.json"
    data = json.loads(manifest_file.read_text())
    data["sources"]["pokedex"]["fingerprint"] = "old:source:timestamp"
    data["importer"] = importer.IMPORTER_VERSION
    manifest_file.write_text(json.dumps(data), encoding="utf-8")
    calls = []

    def fake_import(_, folder=None, progress=None, guard=False):
        calls.append(folder)
        return {"counts": {"item_groups": 2090}}

    monkeypatch.setattr(importer, "import_dumps", fake_import)
    result = importer.sync_existing_import(paths)
    assert result["state"] == "synchronized"
    assert result["reason"] == "local source changed"
    assert calls == [str(source)]


def test_malformed_item_catalog_repaired_from_previous_source(tmp_path, monkeypatch):
    paths, source, _ = _legacy_import(tmp_path)
    (paths.dex_dir / "items.json").write_text('not valid JSON', encoding="utf-8")
    calls = []

    def fake_import(_, folder=None, progress=None, guard=False):
        calls.append(folder)
        return {"counts": {"item_groups": 1}}

    monkeypatch.setattr(importer, "import_dumps", fake_import)
    assert importer.sync_existing_import(paths)["state"] == "synchronized"
    assert calls == [str(source)]



# ------------------------------------------------------------------------------------------------
# Real installs built from the owner's dump (POKEMMO_DUMPS_DIR) — not mocked.
import os
import shutil

import pytest

DUMPS = os.environ.get("POKEMMO_DUMPS_DIR")
real = pytest.mark.skipif(not DUMPS, reason="needs POKEMMO_DUMPS_DIR")


def _copy_source(tmp_path):
    src = tmp_path / "Pokemmo-Dumps"
    src.mkdir()
    for f in Path(DUMPS).iterdir():
        if f.suffix == ".zip":
            shutil.copy(f.resolve(), src / f.name)
    return src


def _make_legacy(paths):
    """Turn a real current install into what the first v0.1.0 build (importer dex-1) left on disk."""
    mf = paths.dex_dir / "manifest.json"
    m = json.loads(mf.read_text())
    m["importer"] = "dex-1"
    m["sources"].pop("strings", None)
    for k in ("item_groups", "items_with_icon", "items_missing_icon", "string_langs", "form_records_with_sprite"):
        m["counts"].pop(k, None)
    m.pop("dump_date", None)
    mf.write_text(json.dumps(m))
    (paths.dex_dir / "items.json").unlink()
    ex = json.loads((paths.dex_dir / "extras.json").read_text())
    ex.pop("form_records", None)
    (paths.dex_dir / "extras.json").write_text(json.dumps(ex))
    keep = {f"{v['icon_id']}.png" for v in ex["breeding_items"].values() if v.get("icon_id") is not None}
    for f in (paths.assets_dir / "items").glob("*.png"):
        if f.name not in keep:
            f.unlink()
    return m


def _snapshot(paths):
    return {"species": (paths.dex_dir / "species.json").read_bytes(),
            "icons": sorted(p.name for p in (paths.assets_dir / "icons").glob("*.png")),
            "fronts": len(list((paths.assets_dir / "battle").glob("*.png")))}


@real
def test_fresh_install_then_unchanged_start_does_not_reimport(tmp_path, monkeypatch):
    src = _copy_source(tmp_path)
    paths = make_paths(tmp_path / "data")
    m = importer.import_dumps(paths, folder=str(src))
    assert m["importer"] == importer.IMPORTER_VERSION and m["counts"]["item_groups"] > 2000
    calls = []
    monkeypatch.setattr(importer, "import_dumps", lambda *a, **k: calls.append(1))
    assert importer.sync_existing_import(paths)["state"] == "current" and calls == []


@real
def test_upgrade_from_legacy_install_builds_items_without_manual_import(tmp_path):
    from companion.app import AppContext
    src = _copy_source(tmp_path)
    data = tmp_path / "data"
    paths = make_paths(data)
    importer.import_dumps(paths, folder=str(src))
    _make_legacy(paths)
    before = _snapshot(paths)
    src_bytes = {f.name: f.stat().st_mtime_ns for f in src.iterdir()}
    ctx = AppContext(str(data))
    ctx.storage.execute("INSERT INTO runs(id, character_name, run_label, last_region, created_at, updated_at) VALUES('r1','Keep','', 'kanto','t','t')")
    ctx.notes.create({"title": "keep me"})
    before_items = ctx.items.listing()
    assert before_items["available"] and before_items["stats"].get("with_icon", 0) == 0  # built-in catalog (no icons) until the sync
    res = ctx.sync_local_data()
    assert res["state"] == "synchronized" and res["reason"] == "missing item catalog"
    lst = ctx.items.listing()
    assert lst["available"] and len(lst["items"]) > 2000 and lst["stats"]["with_icon"] > 2900
    assert (paths.assets_dir / "items" / "5083.png").exists()
    assert ctx.dex.form_entry("479:wash")["in_client"] is True
    after = _snapshot(paths)
    assert after["species"] == before["species"] and after["icons"] == before["icons"] and after["fronts"] >= before["fronts"]
    assert {f.name: f.stat().st_mtime_ns for f in src.iterdir()} == src_bytes  # source archives untouched
    assert ctx.storage.query_one("SELECT character_name FROM runs WHERE id='r1'")["character_name"] == "Keep"
    assert ctx.notes.list()["notes"][0]["title"] == "keep me"
    # next start: nothing to do
    assert ctx.sync_local_data()["state"] == "current"
    ctx.shutdown()


@real
def test_failed_swap_keeps_previous_install(tmp_path, monkeypatch):
    src = _copy_source(tmp_path)
    paths = make_paths(tmp_path / "data")
    importer.import_dumps(paths, folder=str(src))
    _make_legacy(paths)
    before = _snapshot(paths)
    real_rename = Path.rename
    def flaky(self, target):
        if self.name == "assets.tmp":  # dex already swapped, assets fails
            raise OSError("disk full")
        return real_rename(self, target)
    monkeypatch.setattr(Path, "rename", flaky)
    res = importer.sync_existing_import(paths)
    monkeypatch.setattr(Path, "rename", real_rename)
    assert res["state"] == "source-error" and "disk full" in res["reason"]
    assert json.loads((paths.dex_dir / "manifest.json").read_text())["importer"] == "dex-1"  # rolled back together
    assert _snapshot(paths) == before and not (paths.dex_dir / "items.json").exists()
    assert not paths.dex_dir.with_name("dex.prev").exists()


@real
def test_interrupted_swap_is_recovered_at_start(tmp_path):
    src = _copy_source(tmp_path)
    paths = make_paths(tmp_path / "data")
    importer.import_dumps(paths, folder=str(src))
    before = _snapshot(paths)
    paths.dex_dir.rename(paths.dex_dir.with_name("dex.prev"))  # crash between the two renames
    assert importer.recover_interrupted_swap(paths) == ["dex"]
    assert _snapshot(paths) == before


@real
def test_partial_source_never_replaces_a_complete_install(tmp_path):
    src = _copy_source(tmp_path)
    paths = make_paths(tmp_path / "data")
    importer.import_dumps(paths, folder=str(src))
    _make_legacy(paths)
    before = _snapshot(paths)
    # the icon archive at the remembered path now holds far fewer icons
    import zipfile
    icons = next(p for p in src.iterdir() if "icon" in p.name.lower() and "item" not in p.name.lower())
    with zipfile.ZipFile(icons) as z:
        names = [n for n in z.namelist() if n.endswith(".png")][:50]
        data = {n: z.read(n) for n in names}
    with zipfile.ZipFile(icons, "w") as z:
        for n, b in data.items():
            z.writestr(n, b)
    res = importer.sync_existing_import(paths)
    assert res["state"] == "source-error" and "fewer" in res["reason"]
    assert _snapshot(paths) == before


@real
def test_moved_source_reports_limitation_and_keeps_pokemon(tmp_path):
    src = _copy_source(tmp_path)
    paths = make_paths(tmp_path / "data")
    importer.import_dumps(paths, folder=str(src))
    _make_legacy(paths)
    before = _snapshot(paths)
    shutil.rmtree(src)
    res = importer.sync_existing_import(paths)
    assert res["state"] == "source-unavailable" and "no longer available" in res["reason"]
    assert _snapshot(paths) == before
