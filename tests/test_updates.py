"""Reference-data packages and application update checks — controlled fixtures only, no real endpoint
(none is approved yet). Covers signed index, checksum, invalid/interrupted packages, rollback, coverage guard,
precedence over an older private import, version comparison and channels."""
import base64
import gzip
import hashlib
import io
import json
import zipfile

import pytest

from companion.config import BUNDLED_DATA_DIR
from companion.services import refdata
from companion.services.appupdate import AppUpdateChecker, newer, parse_version, platform_assets
from companion.services.refdata import ReferenceUpdater, RefDataError, build_package

ed25519 = pytest.importorskip("cryptography.hazmat.primitives.asymmetric.ed25519")
from cryptography.hazmat.primitives import serialization  # noqa: E402

INDEX_URL = "https://data.example.invalid/reference/index.json"


class _Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _keys():
    k = ed25519.Ed25519PrivateKey.generate()
    pub = k.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    return k, base64.b64encode(pub).decode()


def _bundled_dir(tmp_path, mutate=None):
    d = tmp_path / "src"
    d.mkdir(parents=True)
    for n in ("manifest.json", "species.json.gz", "extras.json.gz", "items.json.gz"):
        (d / n).write_bytes((BUNDLED_DATA_DIR / "reference" / n).read_bytes())
    if mutate:
        mutate(d)
    return d


def _index(key, entries):
    body = json.dumps({"format": "pokemmo-companion-reference-index", "datasets": entries}).encode()
    return json.dumps({"index": base64.b64encode(body).decode(), "signature": base64.b64encode(key.sign(body)).decode()}).encode()


def _updater(tmp_path, files, pub):
    return ReferenceUpdater(tmp_path / "data" / "reference", opener=lambda url, timeout: _Resp(files[url]), index_url=INDEX_URL, public_key=pub)


def test_signed_package_installs_atomically_and_rolls_back(tmp_path):
    key, pub = _keys()
    pkg, entry = build_package(_bundled_dir(tmp_path), revision=2)
    entry["url"] = "https://data.example.invalid/reference/r2.zip"
    u = _updater(tmp_path, {INDEX_URL: _index(key, [entry]), entry["url"]: pkg}, pub)
    res = u.check()
    assert res["ok"] and res["available"]["dataset_revision"] == 2
    out = u.install(res["available"])
    assert out["installed"] and u.status()["using"] == "downloaded"
    assert u.load_current()["manifest"]["dataset_revision"] == 2
    assert not u.staging.exists()
    # a second, newer package → the first becomes the previous known-good dataset
    pkg3, e3 = build_package(_bundled_dir(tmp_path / "b"), revision=3)
    e3["url"] = "https://data.example.invalid/reference/r3.zip"
    u.opener = lambda url, timeout: _Resp({INDEX_URL: _index(key, [entry, e3]), e3["url"]: pkg3}[url])
    u.install(u.check()["available"])
    assert u.installed_manifest()["dataset_revision"] == 3 and u.status()["previous_available"]
    u.rollback()
    assert u.installed_manifest()["dataset_revision"] == 2
    assert u.check()["available"]["dataset_revision"] == 3          # offered again, never forced
    u.remove_download()
    assert u.load_current() is None and u.status()["using"] == "built-in"


def test_interrupted_activation_is_recovered_on_next_start(tmp_path):
    """Power loss between the two activation renames leaves no active dataset: the next start restores the
    previous known-good one; unfinished staging is discarded, never activated."""
    key, pub = _keys()
    pkg, entry = build_package(_bundled_dir(tmp_path), revision=2)
    entry["url"] = "https://data.example.invalid/reference/r2.zip"
    u = _updater(tmp_path, {INDEX_URL: _index(key, [entry]), entry["url"]: pkg}, pub)
    u.install(u.check()["available"])
    # simulate: active → previous done, staging written, crash before staging → active
    u.active.replace(u.previous)
    u.staging.mkdir()
    (u.staging / "manifest.json").write_text("{}")
    u2 = _updater(tmp_path, {}, pub)
    assert not u2.staging.exists() and u2.installed_manifest()["dataset_revision"] == 2
    assert u2.load_current()["manifest"]["dataset_revision"] == 2
    # interrupted rollback (active moved aside, previous not yet moved): restored from the aside copy
    u2.active.replace(u2.root / "rolled-back")
    u3 = _updater(tmp_path, {}, pub)
    assert u3.installed_manifest()["dataset_revision"] == 2 and not (u3.root / "rolled-back").exists()
    # nothing valid anywhere: the built-in dataset is used, nothing crashes
    import shutil
    shutil.rmtree(u3.active)
    assert _updater(tmp_path, {}, pub).load_current() is None


def test_bad_signature_wrong_checksum_and_bad_contents_are_refused(tmp_path):
    key, pub = _keys()
    other, _ = _keys()
    pkg, entry = build_package(_bundled_dir(tmp_path), revision=2)
    entry["url"] = "https://data.example.invalid/r2.zip"
    u = _updater(tmp_path, {INDEX_URL: _index(other, [entry]), entry["url"]: pkg}, pub)
    r = u.check()
    assert not r["ok"] and "signature" in r["error"]
    with pytest.raises(RefDataError, match="checksum"):
        u.install({**entry, "sha256": "0" * 64}, package=pkg)
    # a package with an extra file (e.g. code) is refused before anything is activated
    buf = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(pkg)) as src, zipfile.ZipFile(buf, "w") as dst:
        for i in src.infolist():
            dst.writestr(i, src.read(i))
        dst.writestr("run_me.py", "print('no')")
    evil = buf.getvalue()
    with pytest.raises(RefDataError, match="unexpected"):
        u.install({**entry, "sha256": hashlib.sha256(evil).hexdigest()}, package=evil)
    # a truncated (interrupted) download is refused; nothing half-installed remains
    cut = pkg[: len(pkg) // 2]
    with pytest.raises(RefDataError):
        u.install({**entry, "sha256": hashlib.sha256(cut).hexdigest()}, package=cut)
    assert not u.active.exists() and not u.staging.exists()
    # non-https sources are never contacted
    with pytest.raises(RefDataError):
        u._get("http://data.example.invalid/x", 10)


def test_package_with_less_data_is_refused(tmp_path):
    key, pub = _keys()

    def shrink(d):
        sp = json.loads(gzip.decompress((d / "species.json.gz").read_bytes()))
        sp.pop(next(iter(sp)))
        (d / "species.json.gz").write_bytes(gzip.compress(json.dumps(sp).encode()))
    first, e1 = build_package(_bundled_dir(tmp_path), revision=2)
    e1["url"] = "https://data.example.invalid/r2.zip"
    u = _updater(tmp_path, {}, pub)
    u.install(e1, package=first)
    pkg, entry = build_package(_bundled_dir(tmp_path / "s", shrink), revision=3)
    with pytest.raises(RefDataError, match="less data"):
        u.install({**entry, "url": "https://x.invalid/r3.zip"}, package=pkg)
    assert u.installed_manifest()["dataset_revision"] == 2


def test_unconfigured_updater_never_downloads(tmp_path):
    u = ReferenceUpdater(tmp_path / "ref", opener=lambda *a: pytest.fail("network used"), index_url="", public_key="")
    assert not u.configured
    assert u.check()["ok"] is False and "No approved data source" in u.check()["error"]


def test_older_private_import_does_not_override_newer_reference(ctx, tmp_path, monkeypatch):
    # simulate a downloaded dataset newer than an (older) personal import
    from companion.services import dex as dexmod
    real = dexmod.load_reference

    def newer_ref(paths):
        b = real(paths)
        return {**b, "manifest": {**b["manifest"], "dump_date": "2099-01-01", "source_kind": "downloaded"}}
    monkeypatch.setattr(dexmod, "load_reference", newer_ref)
    d = ctx.paths.dex_dir
    (d / "manifest.json").write_text(json.dumps({"dump_date": "2026-01-01", "source_kind": "private"}))
    (d / "species.json").write_text(json.dumps({"1": {"name": "Bulbasaur", "locations": []}}))
    (d / "extras.json").write_text("{}")
    (d / "sprites.json").write_text(json.dumps({"1": {"front": "x.png"}}))
    ctx.dex.reload()
    assert ctx.dex.manifest["dump_date"] == "2099-01-01" and len(ctx.dex.species) == 649
    assert ctx.dex.private_superseded == {"private_date": "2026-01-01", "reference_date": "2099-01-01"}
    assert ctx.dex.sprites == {1: {"front": "x.png"}}                        # your sprites are still used
    for n in ("manifest.json", "species.json", "extras.json", "sprites.json"):
        (d / n).unlink()
    ctx.dex.reload()


# ---------------------------------------------------------------- application updates
def test_version_comparison():
    assert newer("0.1.1", "0.1.0") and newer("0.2.0", "0.1.9") and newer("1.0.0", "1.0.0-rc.3")
    assert newer("1.0.0-rc.10", "1.0.0-rc.9") and not newer("0.1.0", "0.1.0") and not newer("develop", "0.1.0")
    assert parse_version("v0.1.0") == parse_version("0.1.0")


def _releases(*rels):
    return json.dumps([{"tag_name": t, "name": t, "prerelease": pre, "draft": draft, "html_url": f"https://github.com/haqzo/PokeMMO-Companion/releases/tag/{t}",
                        "body": "notes", "published_at": "2026-12-01T00:00:00Z",
                        "assets": [{"name": f"PokeMMO-Companion-{t}-x86_64.AppImage", "browser_download_url": "https://github.com/haqzo/PokeMMO-Companion/releases/download/x/a", "size": 3}]}
                       for t, pre, draft in rels]).encode()


def test_update_check_channels_and_no_release(ctx):
    calls = []

    def opener(body):
        return lambda url, timeout: calls.append(url) or _Resp(body)
    c = AppUpdateChecker(ctx.storage, ctx.settings, opener=opener(b"[]"), current="0.1.0", public_key="")
    st = c.check()
    assert st["ok"] and st["latest"] is None and st["available"] is False            # no release published yet
    c.opener = opener(_releases(("v0.2.0-beta.1", True, False), ("v0.1.1", False, False), ("v9.9.9", False, True)))
    st = c.check()
    assert st["latest"]["version"] == "0.1.1" and st["available"]                     # stable: no pre-release, no draft
    ctx.settings.update({"app_updates.channel": "prerelease"})
    assert c.check()["latest"]["version"] == "0.2.0-beta.1"
    ctx.settings.update({"app_updates.channel": "stable"})
    assert all(u.startswith("https://api.github.com/repos/haqzo/PokeMMO-Companion/releases") for u in calls)
    assert not c.status().get("available")
    assert c.check()["latest"]["version"] == "0.1.1"
    with pytest.raises(ValueError, match="not configured"):
        c.download("PokeMMO-Companion-v0.1.1-x86_64.AppImage", ctx.paths.root / "updates")
    assert [a["name"] for a in platform_assets(st["latest"]["assets"], "linux")]


def test_verified_download_and_checksum_mismatch(ctx, tmp_path):
    key, pub = _keys()
    payload = b"APPIMAGE"
    name = "PokeMMO-Companion-v0.1.1-x86_64.AppImage"
    sums = f"{hashlib.sha256(payload).hexdigest()}  {name}\n".encode()
    base = "https://github.com/haqzo/PokeMMO-Companion/releases/download/v0.1.1/"
    rel = json.dumps([{"tag_name": "v0.1.1", "prerelease": False, "draft": False, "assets": [
        {"name": name, "browser_download_url": base + name, "size": len(payload)},
        {"name": "SHA256SUMS", "browser_download_url": base + "SHA256SUMS", "size": len(sums)},
        {"name": "SHA256SUMS.sig", "browser_download_url": base + "SHA256SUMS.sig", "size": 88}]}]).encode()
    files = {"releases": rel, base + name: payload, base + "SHA256SUMS": sums, base + "SHA256SUMS.sig": base64.b64encode(key.sign(sums))}
    c = AppUpdateChecker(ctx.storage, ctx.settings, current="0.1.0", public_key=pub,
                         opener=lambda url, timeout: _Resp(files["releases"] if "api.github.com" in url else files[url]))
    c.check()
    out = c.download(name, tmp_path / "updates")
    assert out["verified"] and (tmp_path / "updates" / name).read_bytes() == payload
    files[base + name] = b"TAMPERED"
    with pytest.raises(ValueError, match="checksum"):
        c.download(name, tmp_path / "updates2")
    assert not (tmp_path / "updates2" / name).exists()
    files[base + "SHA256SUMS"] = sums.replace(b"  ", b" *")
    del files[base + name]
    with pytest.raises(ValueError, match="signature"):
        c.download(name, tmp_path / "updates3")
    assert not (tmp_path / "updates3").exists()


@pytest.mark.parametrize(("current", "target"), [
    ("0.8.0", "0.8.1"), ("0.8.1", "0.8.12"), ("0.8.12", "0.9.0"),
    ("0.9.0", "0.9.11"), ("0.9.11", "1.0.0"), ("1.0.0", "1.0.1"),
])
def test_release_series_progression(ctx, current, target):
    checker = AppUpdateChecker(ctx.storage, ctx.settings, current=current, public_key="",
                               opener=lambda *_: _Resp(_releases((f"v{target}", False, False),
                                                                  ("v8.0.0", False, True))))
    stable = checker.check()
    assert stable["available"] == target.startswith("1.")
    ctx.settings.update({"app_updates.channel": "prerelease"})
    prerelease = checker.check()
    assert prerelease["available"] and prerelease["latest"]["version"] == target
    assert prerelease["latest"]["prerelease"] == target.startswith("0.")
    installed = AppUpdateChecker(ctx.storage, ctx.settings, current=target, public_key="")
    assert not installed.status()["available"]
    ctx.settings.update({"app_updates.channel": "stable"})
    assert not checker.status().get("available")

    def offline(*_):
        raise TimeoutError("offline")

    checker.opener = offline
    failed = checker.check()
    assert not failed["ok"] and not failed.get("available") and not failed.get("latest")


@pytest.mark.parametrize(("system", "selected"), [("win32", "windows"), ("linux", "linux"), ("darwin", None)])
def test_platform_specific_release_packages(ctx, monkeypatch, system, selected):
    from companion.services import appupdate

    monkeypatch.setattr(appupdate.sys, "platform", system)
    names = {"linux": "PokeMMO-Companion-0.8.0-x86_64.AppImage",
             "windows": "PokeMMO-Companion-0.8.0-windows-x86_64.zip"}
    release = json.loads(_releases(("v0.8.0", True, False)))[0]
    release["assets"] = [{"name": name} for name in [
        *names.values(), "PokeMMO-Companion-0.8.0-arm64.AppImage",
        "PokeMMO-Companion-0.8.11-windows-x86_64.zip", "SHA256SUMS",
    ]]
    ctx.settings.update({"app_updates.channel": "prerelease"})
    checker = AppUpdateChecker(ctx.storage, ctx.settings, public_key="example",
                               opener=lambda *_: _Resp(json.dumps([release]).encode()))
    assert [p["name"] for p in checker.check()["latest"]["packages"]] == ([names[selected]] if selected else [])
    wrong = names["linux" if selected == "windows" else "windows"]
    with pytest.raises(ValueError, match="not available for your platform"):
        checker.download(wrong, ctx.paths.root / "updates")
