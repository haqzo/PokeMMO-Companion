"""Companion application update checks (separate from PokeMMO news and reference data), 2026-11-24.

* Looks only at published GitHub *releases* of the approved repository — never at branches or develop commits.
* Stable channel ignores pre-releases; the pre-release channel includes them. Drafts are never offered.
* Never installs or restarts anything by itself. A download is verified against the release's SHA256SUMS file,
  whose Ed25519 signature (SHA256SUMS.sig) must verify with the pinned maintainer key (APP_UPDATE_PUBLIC_KEY).
  Without a configured key the Companion only links to the release page.
* The player installs the verified file when it suits them; personal data lives in the data folder, separate
  from the installed application, and is never touched by an update.
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import re
import threading
import time
import urllib.request
from pathlib import Path
from typing import Callable

from .. import __version__
from ..storage import StorageClosedError

log = logging.getLogger("companion.appupdate")
RELEASES_URL = "https://api.github.com/repos/haqzo/PokeMMO-Companion/releases?per_page=20"
APPROVED_DOWNLOAD_PREFIXES = ("https://github.com/haqzo/PokeMMO-Companion/releases/download/",)
APP_UPDATE_PUBLIC_KEY = ""          # base64 raw Ed25519 key; empty = verified downloads switched off
CHECK_HOURS = 24
MAX_RELEASES_BYTES = 2_000_000
MAX_DOWNLOAD_BYTES = 600_000_000

_VER = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$")


def parse_version(v: str) -> tuple | None:
    m = _VER.match((v or "").strip())
    if not m:
        return None
    pre = m.group(4)
    pre_key = () if pre is None else tuple((0, int(p)) if p.isdigit() else (1, p) for p in pre.split("."))
    # a release without a pre-release part sorts after all of its pre-releases (semver)
    return (int(m.group(1)), int(m.group(2)), int(m.group(3)), 1 if pre is None else 0, pre_key)


def newer(a: str, b: str) -> bool:
    pa, pb = parse_version(a), parse_version(b)
    return bool(pa and pb and pa > pb)


def platform_assets(assets: list[dict], platform: str) -> list[dict]:
    pats = {"linux": (r"\.AppImage$", r"linux.*\.(tar\.gz|tar\.xz|zip)$"), "windows": (r"\.exe$", r"(win|windows).*\.zip$")}.get(platform, ())
    return [a for a in assets if any(re.search(p, a.get("name", ""), re.I) for p in pats)]


class AppUpdateChecker:
    def __init__(self, storage, settings, bus=None, opener: Callable | None = None, public_key: str | None = None,
                 current: str = __version__):
        self.db, self.settings, self.bus = storage, settings, bus
        self.opener = opener or (lambda url, timeout: urllib.request.urlopen(urllib.request.Request(url, headers={
            "User-Agent": f"PokeMMO-Companion/{__version__}", "Accept": "application/vnd.github+json"}), timeout=timeout))
        self.public_key = APP_UPDATE_PUBLIC_KEY if public_key is None else public_key
        self.current = current
        self._stop = threading.Event()
        self._thread = None
        self.progress: dict = {}

    def status(self) -> dict:
        st = self.db.get_setting("app_updates.cache", None) or {}
        return {"current": self.current, "channel": self.settings.get("app_updates.channel") or "stable",
                "auto": bool(self.settings.get("app_updates.auto_check")), "verified_downloads": bool(self.public_key),
                **{k: v for k, v in st.items() if not k.startswith("_")}, "download": self.progress or None}

    def check(self, timeout: float = 15.0) -> dict:
        channel = self.settings.get("app_updates.channel") or "stable"
        res: dict = {"checked_at": _now(), "channel": channel}
        try:
            with self.opener(RELEASES_URL, timeout) as resp:
                body = resp.read(MAX_RELEASES_BYTES + 1)
            if len(body) > MAX_RELEASES_BYTES:
                raise ValueError("release list too large")
            releases = json.loads(body)
            if not isinstance(releases, list):
                raise ValueError("unexpected response")
        except Exception as exc:
            res.update(ok=False, error=f"{type(exc).__name__}: {str(exc)[:160]}")
            self.db.set_settings({"app_updates.cache": {**(self.db.get_setting("app_updates.cache", None) or {}), **res}})
            return self.status()
        cands = [r for r in releases if not r.get("draft") and parse_version(r.get("tag_name", ""))
                 and (channel == "prerelease" or not r.get("prerelease"))]
        cands.sort(key=lambda r: parse_version(r["tag_name"]), reverse=True)
        latest = cands[0] if cands else None
        res.update(ok=True, releases_seen=len(releases), latest=None, available=False)
        if latest:
            res["latest"] = {"version": latest["tag_name"].lstrip("v"), "name": latest.get("name") or latest["tag_name"],
                             "prerelease": bool(latest.get("prerelease")), "published_at": latest.get("published_at"),
                             "url": latest.get("html_url"), "notes": (latest.get("body") or "")[:20000],
                             "assets": [{"name": a.get("name"), "url": a.get("browser_download_url"), "bytes": a.get("size")}
                                        for a in latest.get("assets", [])]}
            res["available"] = newer(res["latest"]["version"], self.current)
        self.db.set_settings({"app_updates.cache": res})
        if self.bus and res["available"]:
            self.bus.publish("app_update", {"version": res["latest"]["version"]})
        return self.status()

    def download(self, asset_name: str, dest_dir: Path, timeout: float = 60.0) -> dict:
        """Download one asset of the latest release and verify it. Never installs it."""
        st = self.db.get_setting("app_updates.cache", None) or {}
        latest = st.get("latest")
        if not latest or not st.get("available"):
            raise ValueError("No update available")
        if not self.public_key:
            raise ValueError("Verified downloads are not configured in this build — use the release page")
        assets = {a["name"]: a for a in latest["assets"]}
        a, sums, sig = assets.get(asset_name), assets.get("SHA256SUMS"), assets.get("SHA256SUMS.sig")
        if not a or not sums or not sig:
            raise ValueError("This release has no checksum file, so it cannot be verified")
        for x in (a, sums, sig):
            if not str(x["url"]).startswith(APPROVED_DOWNLOAD_PREFIXES):
                raise ValueError("Download is not from the approved release location")
        sums_body = self._get(sums["url"], 1_000_000, timeout)
        sig_body = self._get(sig["url"], 10_000, timeout)
        from .refdata import _verify_signature
        if not _verify_signature(sums_body, sig_body.decode().strip(), self.public_key):
            raise ValueError("Checksum file signature is not valid")
        expected = None
        for line in sums_body.decode("utf-8", "replace").splitlines():
            parts = line.split()
            if len(parts) == 2 and parts[1].lstrip("*") == asset_name:
                expected = parts[0].lower()
        if not expected:
            raise ValueError("The checksum file does not list this download")
        dest_dir = Path(dest_dir)
        dest_dir.mkdir(parents=True, exist_ok=True)
        part = dest_dir / (asset_name + ".part")
        h = hashlib.sha256()
        total = int(a.get("bytes") or 0)
        got = 0
        self.progress = {"asset": asset_name, "bytes": 0, "total": total, "state": "downloading"}
        with self.opener(a["url"], timeout) as resp, open(part, "wb") as f:
            while True:
                chunk = resp.read(1 << 20)
                if not chunk:
                    break
                got += len(chunk)
                if got > MAX_DOWNLOAD_BYTES:
                    raise ValueError("Download is larger than allowed")
                h.update(chunk)
                f.write(chunk)
                self.progress.update(bytes=got)
                if self.bus:
                    self.bus.publish("app_update", {"progress": got, "total": total})
        if h.hexdigest() != expected:
            part.unlink(missing_ok=True)
            self.progress.update(state="failed", error="checksum mismatch")
            raise ValueError("Downloaded file does not match its checksum — deleted")
        final = dest_dir / asset_name
        part.replace(final)
        self.progress.update(state="verified", path=str(final))
        return {"path": str(final), "sha256": expected, "verified": True}

    def _get(self, url: str, limit: int, timeout: float) -> bytes:
        with self.opener(url, timeout) as resp:
            body = resp.read(limit + 1)
        if len(body) > limit:
            raise ValueError("download larger than allowed")
        return body

    def start_auto(self) -> None:
        if self._thread:
            return

        def loop():
            if self._stop.wait(120):
                return
            while not self._stop.is_set():
                try:
                    if self.settings.get("app_updates.auto_check"):
                        st = self.db.get_setting("app_updates.cache", None) or {}
                        if time.time() - st.get("_epoch", 0) >= CHECK_HOURS * 3600:
                            self.check()
                            self.db.set_settings({"app_updates.cache": {**(self.db.get_setting("app_updates.cache", None) or {}), "_epoch": time.time()}})
                except StorageClosedError:
                    if self._stop.is_set():      # Companion is closing: stop here, nothing left to save
                        return
                    raise
                except Exception:  # pragma: no cover
                    log.exception("update check failed")
                if self._stop.wait(3600):
                    return
        self._thread = threading.Thread(target=loop, name="app-update-check", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
