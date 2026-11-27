#!/usr/bin/env python3
"""Exercise a native Windows candidate and its published upgrade path in temporary profiles."""
from contextlib import closing, contextmanager
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from zipfile import ZipFile

PUBLISHED = (
    "https://github.com/haqzo/PokeMMO-Companion/releases/download/v0.8.0/"
    "PokeMMO-Companion-0.8.0-windows-x86_64.zip"
)
PUBLISHED_SHA256 = "f5a32ed069b28a7c3457007ecfd9c437db5339154e9ea0c27d9e6d692466afa2"
OLD_REPORTING_SETTINGS = ("live.community.enabled", "live.community.receive", "live.community.share")


@contextmanager
def running(exe, profile):
    launcher = subprocess.Popen([exe, "--browser", "--no-open", "--data-dir", profile])
    instance = profile / "instance.json"
    try:
        deadline = time.monotonic() + 45
        while not instance.is_file() and launcher.poll() is None and time.monotonic() < deadline:
            time.sleep(0.1)
        session = json.loads(instance.read_text(encoding="utf-8"))
        assert session["pid"] == launcher.pid, "Test profile belongs to a different process"

        def api(method, path, body=None):
            request = Request(
                session["url"] + path, method=method,
                headers={"X-Companion-Token": session["token"], "Content-Type": "application/json"},
                data=None if body is None else json.dumps(body).encode("utf-8"),
            )
            with urlopen(request, timeout=25) as response:
                return json.load(response)

        yield api
    finally:
        if launcher.poll() is None:
            # Browser mode has no shell quit command. Transactions are committed before this probe stops it.
            launcher.terminate()
        launcher.wait(timeout=20)
        instance.unlink(missing_ok=True)


def schema(path):
    with closing(sqlite3.connect(path)) as db:
        return int(db.execute("SELECT value FROM meta WHERE key='schema_version'").fetchone()[0])


def verify_reporting_scope(api):
    boot = api("GET", "/api/bootstrap")
    assert boot["internal_reporting"] is False
    assert boot["alphapedia"]["reporting"] == "https://alpha.pokemmotools.org/publisher-signup"
    assert not set(OLD_REPORTING_SETTINGS).intersection(boot["settings"])
    for method, path, body, code in (
        ("POST", "/api/live/community/reports", {}, 404),
        ("PATCH", "/api/settings", dict.fromkeys(OLD_REPORTING_SETTINGS, True), 403),
    ):
        try:
            api(method, path, body)
        except HTTPError as error:
            assert error.code == code
        else:
            raise AssertionError(f"{method} {path} did not return HTTP {code}")


def packaged_checks(candidate, work):
    with ZipFile(candidate) as archive:
        archive.extractall(work / "candidate")
    exe = (work / "candidate/pokemmo-companion/pokemmo-companion.exe").resolve(strict=True)
    profile = work / "offline profile"
    rule = "Companion isolated candidate offline self-check"
    # Deny the fresh profile's HTTP/HTTPS destinations without touching its ephemeral loopback API.
    subprocess.run(["netsh", "advfirewall", "firewall", "add", "rule", f"name={rule}", "dir=out",
                    "action=block", "profile=any", "protocol=TCP", "remoteport=80,443",
                    f"program={exe}"], check=True, timeout=30)
    try:
        subprocess.run([exe, "--check", "--data-dir", profile], check=True, timeout=90)
        assert (profile / "companion.sqlite3").is_file()
        assert "PokeMMO Companion 0.8.0" in (profile / "logs/companion.log").read_text(encoding="utf-8")
        print("Extracted Windows executable passed a fresh-profile self-check with its outbound HTTP/HTTPS ports blocked.")
    finally:
        subprocess.run(["netsh", "advfirewall", "firewall", "delete", "rule", f"name={rule}", f"program={exe}"],
                       check=True, timeout=30)
    with running(exe, work / "fresh HTTPS and data") as api:
        verify_reporting_scope(api)
        assert len(api("GET", "/api/dex/species")["species"]) >= 649
        assert api("GET", "/api/live/phenomena/reference")["entries"]
        for region in ("kanto", "johto", "hoenn", "sinnoh", "unova"):
            assert api("GET", "/api/guides/catalog/" + region)["steps"]
        api("PATCH", "/api/settings", {"app_updates.channel": "prerelease"})
        update = api("POST", "/api/app-update/check", {})
        assert update["ok"] and update.get("latest", {}).get("version"), update.get("error")
        print("Packaged Windows executable served bundled reference data and completed an actual HTTPS update check.")
    return exe


def verify_upgrade(exe, work):
    baseline_zip = work / "0.8.0.zip"
    with urlopen(PUBLISHED, timeout=90) as response, baseline_zip.open("wb") as dst:
        while block := response.read(1024 * 1024):
            dst.write(block)
    with baseline_zip.open("rb") as reader:
        assert hashlib.file_digest(reader, "sha256").hexdigest() == PUBLISHED_SHA256
    with ZipFile(baseline_zip) as archive:
        archive.extractall(work / "published")
    baseline = work / "published/pokemmo-companion/pokemmo-companion.exe"
    profile = work / "upgrade profile"
    database = profile / "companion.sqlite3"
    with running(baseline, profile) as api:
        api("PATCH", "/api/settings", {
            "app.onboarded": True, "app.language": "es", "app_updates.auto_check": False,
            "reference.auto_update": False, "live.ntfy.enabled": False, "notify.test": "off",
        })
        note = api("POST", "/api/notes", {"title": "Synthetic release QA note", "body": "Windows migration."})["id"]
        run = api("POST", "/api/guides/runs", {"name": "Windows QA", "region": "kanto"})["id"]
        steps = api("GET", "/api/guides/catalog/kanto")["steps"]
        step = next(item["id"] for item in steps if item.get("id"))
        api("POST", f"/api/guides/runs/{run}/steps", {"steps": [step], "done": True})
        report = api("POST", "/api/live/test", {"kind": "alpha"})["id"]
    assert schema(database) == 5
    with closing(sqlite3.connect(database)) as db:
        db.executemany("INSERT INTO settings(key, value, updated_at) VALUES (?, 'true', CURRENT_TIMESTAMP)",
                       [(key,) for key in OLD_REPORTING_SETTINGS])
        db.commit()

    for _ in range(2):
        with running(exe, profile) as api:
            verify_reporting_scope(api)
            assert api("GET", f"/api/notes/{note}")["title"] == "Synthetic release QA note"
            assert step in api("GET", f"/api/guides/runs/{run}/state?region=kanto")["done"]
            assert api("GET", f"/api/live/reports/{report}")["is_test"]
            assert api("GET", "/api/settings")["app.language"] == "es"
            assert schema(database) == 9
            copies = list(profile.rglob("*pre-migration-v5-to-v9.sqlite3"))
            assert len(copies) == 1 and schema(copies[0]) == 5
            with closing(sqlite3.connect(copies[0])) as safety:
                assert safety.execute("SELECT COUNT(*) FROM reports WHERE id=?", (report,)).fetchone()[0] == 1
    print("Published Windows 0.8.0 upgraded from SQLite v5 to v9. Settings, note, progress and local report survived restart.")
    print("One pre-migration safety copy retained the local report.")
    with closing(sqlite3.connect(database)) as db:
        retained = {key: value for key, value in db.execute("SELECT key, value FROM settings")}
        assert all(retained[key] == "true" for key in OLD_REPORTING_SETTINGS)
    print("Independent reporting stayed disabled on clean and migrated profiles with old reporting settings retained.")


if __name__ == "__main__":
    if sys.platform != "win32":
        raise SystemExit("Run on the native Windows Server candidate runner.")
    os.environ["COMPANION_NO_SPAWN"] = "1"
    # netsh's program parser requires a canonical path. The hosted runner's temp
    # directory also avoids the abbreviated user-profile path returned by Windows.
    with tempfile.TemporaryDirectory(prefix="companion-candidate-", dir=os.getenv("RUNNER_TEMP")) as directory:
        work = Path(directory)
        verify_upgrade(packaged_checks(Path(sys.argv[1]).resolve(), work), work)
