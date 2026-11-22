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

    def fake_import(found_paths, folder=None, progress=None):
        assert found_paths == paths
        assert Path(folder) == source
        calls.append(folder)
        (paths.dex_dir / "items.json").write_text('{"groups":[]}', encoding="utf-8")
        return {"counts": {"item_groups": 2090}}

    monkeypatch.setattr(importer, "import_dumps", fake_import)
    status = importer.sync_existing_import(paths)
    assert status == {"state": "synchronized", "reason": "missing item catalog", "items": 2090}
    assert calls == [str(source)]
    assert archive.read_bytes() == b"already-selected-source"
    assert (paths.dex_dir / "species.json").exists()

    # The catalog is already there; unchanged local data does not trigger a re-import.
    assert importer.sync_existing_import(paths)["state"] == "current"
    assert len(calls) == 1


def test_unavailable_previous_source_preserves_installed_species(tmp_path):
    paths, source, archive = _legacy_import(tmp_path)
    archive.unlink()
    source.rmdir()
    assert importer.sync_existing_import(paths)["state"] == "source-unavailable"
    assert (paths.dex_dir / "manifest.json").is_file()
    assert json.loads((paths.dex_dir / "species.json").read_text())["1"]["name"] == "Bulbasaur"


def test_changed_known_source_syncs_but_no_unrelated_folders(tmp_path, monkeypatch):
    paths, source, archive = _legacy_import(tmp_path)
    (paths.dex_dir / "items.json").write_text('{"groups":[]}', encoding="utf-8")
    manifest_file = paths.dex_dir / "manifest.json"
    data = json.loads(manifest_file.read_text())
    data["sources"]["pokedex"]["fingerprint"] = "old:source:timestamp"
    manifest_file.write_text(json.dumps(data), encoding="utf-8")
    calls = []

    def fake_import(_, folder=None, progress=None):
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

    def fake_import(_, folder=None, progress=None):
        calls.append(folder)
        return {"counts": {"item_groups": 1}}

    monkeypatch.setattr(importer, "import_dumps", fake_import)
    assert importer.sync_existing_import(paths)["state"] == "synchronized"
    assert calls == [str(source)]
