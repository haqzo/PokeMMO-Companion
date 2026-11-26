"""Reference-data updates, independent of application updates (2026-11-24).

The PokeMMO reference dataset (species, moves, items, locations, encounters) ships with the app in
companion/data/reference/. Newer datasets can be published by the maintainer as a *data package* and installed
here automatically — no code is ever executed from a package; it contains only JSON.

Trust model
  * Only the approved index URL in REFERENCE_INDEX_URL (empty = updates switched off) is ever contacted.
  * The index must carry an Ed25519 signature that verifies with the maintainer public key pinned in
    REFERENCE_PUBLIC_KEY (requires the `cryptography` package). No key configured → nothing is installed.
  * Every package is checked against the SHA-256 in the signed index, size-limited, unpacked with entry and
    decompression limits, and validated (schema, per-file checksums in its manifest, structure, no coverage loss)
    in a staging folder before activation.

Layout under <data>/reference/:  active/  previous/  staging/  state.json
Activation is a directory rename (atomic on one filesystem); the previous known-good dataset is kept for rollback.
The bundled dataset is always the offline fallback.
"""
from __future__ import annotations

import base64
import gzip
import hashlib
import io
import json
import logging
import shutil
import threading
import time
import urllib.request
import zipfile
from pathlib import Path
from typing import Callable

from .. import __version__
from ..config import BUNDLED_DATA_DIR
from ..storage import StorageClosedError
from ..seasonal import validate_catalog

log = logging.getLogger("companion.refdata")

# Not configured yet: the owner decides where approved data packages are published (see docs/build/19).
REFERENCE_INDEX_URL = ""
REFERENCE_PUBLIC_KEY = ""          # base64 raw Ed25519 public key (32 bytes)
SUPPORTED_SCHEMA = 1
ALLOWED_FILES = {"manifest.json", "species.json.gz", "extras.json.gz", "items.json.gz", "seasonal.json"}
REQUIRED_FILES = {"manifest.json", "species.json.gz", "extras.json.gz"}
MAX_INDEX_BYTES = 1_000_000
MAX_PACKAGE_BYTES = 60_000_000
MAX_UNPACKED_BYTES = 250_000_000
MAX_ENTRIES = 16
CHECK_HOURS = 24


class RefDataError(Exception):
    pass


def _verify_signature(body: bytes, sig_b64: str, pub_b64: str) -> bool:
    try:
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    except ImportError:
        raise RefDataError("Signature checking is not available in this build")
    try:
        Ed25519PublicKey.from_public_bytes(base64.b64decode(pub_b64)).verify(base64.b64decode(sig_b64), body)
        return True
    except Exception:
        return False


def dataset_key(manifest: dict) -> tuple:
    """Ordering of datasets: client snapshot date first, then the dataset revision."""
    return (str(manifest.get("dump_date") or ""), int(manifest.get("dataset_revision") or 0))


def read_seasonal(path: Path, checksums=None):
    try:
        with path.open("rb") as stream:
            raw = stream.read(512_001)
        if len(raw) > 512_000 or (checksums is not None and checksums.get(path.name) != hashlib.sha256(raw).hexdigest()):
            raise ValueError("Seasonal reference has the wrong size or checksum")
        return validate_catalog(json.loads(raw))
    except (OSError, ValueError, TypeError, RecursionError, OverflowError) as exc:
        raise RefDataError(f"seasonal.json: {exc}") from exc


def read_dataset(d: Path) -> dict:
    """Load and validate a dataset directory. Raises RefDataError when anything is off."""
    try:
        manifest = json.loads((d / "manifest.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise RefDataError(f"manifest unreadable: {exc}")
    if int(manifest.get("schema", 0)) != SUPPORTED_SCHEMA:
        raise RefDataError(f"unsupported dataset schema {manifest.get('schema')}")
    sums = manifest.get("package_files") or {}
    out = {"manifest": manifest}
    if (d / "seasonal.json").is_file():
        out["seasonal"] = read_seasonal(d / "seasonal.json", sums)
    for name, key in (("species.json.gz", "species"), ("extras.json.gz", "extras"), ("items.json.gz", "items")):
        p = d / name
        if not p.is_file():
            if name in REQUIRED_FILES:
                raise RefDataError(f"{name} missing")
            continue
        raw = p.read_bytes()
        if sums and sums.get(name) != hashlib.sha256(raw).hexdigest():
            raise RefDataError(f"{name}: checksum mismatch")
        try:
            data = json.loads(gzip.GzipFile(fileobj=io.BytesIO(raw)).read(MAX_UNPACKED_BYTES + 1))
        except (OSError, ValueError) as exc:
            raise RefDataError(f"{name}: {exc}")
        out[key] = data
    sp = out["species"]
    if not isinstance(sp, dict) or not sp or not all(isinstance(v, dict) and v.get("name") for v in list(sp.values())[:50]):
        raise RefDataError("species data has the wrong structure")
    if not isinstance(out["extras"], dict) or not isinstance(out["extras"].get("skills", []), list):
        raise RefDataError("extras data has the wrong structure")
    out["species"] = {int(k): v for k, v in sp.items()}
    return out


def coverage(ds: dict) -> dict:
    sp = ds["species"]
    return {"species": len(sp), "location_rows": sum(len(v.get("locations", [])) for v in sp.values()),
            "skills": len(ds["extras"].get("skills", [])),
            "item_groups": len((ds.get("items") or {}).get("groups", [])) if ds.get("items") else None}


class ReferenceUpdater:
    def __init__(self, root: Path, settings=None, bus=None, opener: Callable | None = None,
                 index_url: str | None = None, public_key: str | None = None):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.settings, self.bus = settings, bus
        self.opener = opener or (lambda url, timeout: urllib.request.urlopen(
            urllib.request.Request(url, headers={"User-Agent": f"PokeMMO-Companion/{__version__} (reference data)"}), timeout=timeout))
        self.index_url = REFERENCE_INDEX_URL if index_url is None else index_url
        self.public_key = REFERENCE_PUBLIC_KEY if public_key is None else public_key
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread = None
        self.recover()

    def recover(self) -> list[str]:
        """Finish or undo an activation/rollback that was interrupted (power loss, crash, killed process).
        Activation is two renames (active → previous, staging → active); between them there is no active dataset.
        Leftover staging is never activated — it was not validated to completion. Returns what was repaired."""
        done: list[str] = []
        if self.staging.exists():
            shutil.rmtree(self.staging, ignore_errors=True)
            done.append("removed unfinished staging")
        broken = self.root / "rolled-back"
        if not (self.active / "manifest.json").is_file():
            for cand, why in ((self.previous, "restored previous dataset"), (broken, "restored dataset from an interrupted rollback")):
                try:
                    if (cand / "manifest.json").is_file():
                        read_dataset(cand)
                        shutil.rmtree(self.active, ignore_errors=True)
                        cand.replace(self.active)
                        done.append(why)
                        break
                except (RefDataError, OSError):
                    continue
        if broken.exists():
            shutil.rmtree(broken, ignore_errors=True)
        if done:
            log.warning("Reference data recovered: %s", "; ".join(done))
        return done

    # ---------------------------------------------------------------- paths/state
    @property
    def active(self) -> Path:
        return self.root / "active"

    @property
    def previous(self) -> Path:
        return self.root / "previous"

    @property
    def staging(self) -> Path:
        return self.root / "staging"

    def state(self) -> dict:
        try:
            return json.loads((self.root / "state.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}

    def _save_state(self, **kw) -> dict:
        st = {**self.state(), **kw}
        tmp = self.root / "state.json.part"
        tmp.write_text(json.dumps(st, indent=1), encoding="utf-8")
        tmp.replace(self.root / "state.json")
        return st

    @property
    def configured(self) -> bool:
        return bool(self.index_url and self.public_key)

    def bundled_manifest(self) -> dict:
        return json.loads((BUNDLED_DATA_DIR / "reference" / "manifest.json").read_text(encoding="utf-8"))

    def installed_manifest(self) -> dict | None:
        try:
            return json.loads((self.active / "manifest.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None

    def current_key(self) -> tuple:
        inst = self.installed_manifest()
        b = self.bundled_manifest()
        return max(dataset_key(b), dataset_key(inst)) if inst else dataset_key(b)

    def status(self) -> dict:
        st = self.state()
        inst = self.installed_manifest()
        b = self.bundled_manifest()
        using = "downloaded" if inst and dataset_key(inst) > dataset_key(b) else "built-in"
        return {"configured": self.configured, "using": using,
                "built_in": {"dump_date": b.get("dump_date"), "revision": b.get("dataset_revision", 0)},
                "downloaded": inst and {"dump_date": inst.get("dump_date"), "revision": inst.get("dataset_revision", 0),
                                        "installed_at": st.get("installed_at")},
                "previous_available": (self.previous / "manifest.json").is_file(),
                "last_check_at": st.get("last_check_at"), "last_error": st.get("last_error"),
                "auto": bool(self.settings.get("reference.auto_update")) if self.settings else True}

    # ---------------------------------------------------------------- network
    def _get(self, url: str, limit: int, timeout: float = 20.0) -> bytes:
        if not url.startswith("https://"):
            raise RefDataError("only https sources are accepted")
        with self.opener(url, timeout) as resp:
            body = resp.read(limit + 1)
        if len(body) > limit:
            raise RefDataError("download is larger than allowed")
        return body

    def fetch_index(self) -> dict:
        if not self.configured:
            raise RefDataError("No approved data source is configured in this build")
        raw = self._get(self.index_url, MAX_INDEX_BYTES)
        try:
            doc = json.loads(raw)
            body = base64.b64decode(doc["index"])
            sig = doc["signature"]
        except (ValueError, KeyError, TypeError):
            raise RefDataError("data index has the wrong format")
        if not _verify_signature(body, sig, self.public_key):
            raise RefDataError("data index signature is not valid — ignored")
        index = json.loads(body)
        if index.get("format") != "pokemmo-companion-reference-index":
            raise RefDataError("not a Companion data index")
        return index

    def check(self) -> dict:
        """Look for a newer compatible dataset. Never installs by itself."""
        try:
            index = self.fetch_index()
        except Exception as exc:
            self._save_state(last_check_at=_now(), last_error=str(exc)[:200])
            return {"ok": False, "error": str(exc), "configured": self.configured}
        cur = self.current_key()
        cands = [e for e in index.get("datasets", []) if int(e.get("schema", 0)) == SUPPORTED_SCHEMA
                 and str(e.get("url", "")).startswith("https://") and dataset_key(e) > cur]
        best = max(cands, key=dataset_key) if cands else None
        self._save_state(last_check_at=_now(), last_error=None)
        return {"ok": True, "available": best, "current": {"dump_date": cur[0], "revision": cur[1]}}

    def install(self, entry: dict, package: bytes | None = None) -> dict:
        """Download (or take `package`), verify, stage, validate and activate one dataset."""
        with self._lock:
            if package is None:
                package = self._get(str(entry["url"]), int(entry.get("bytes") or MAX_PACKAGE_BYTES))
            if len(package) > MAX_PACKAGE_BYTES:
                raise RefDataError("package is larger than allowed")
            if hashlib.sha256(package).hexdigest() != entry.get("sha256"):
                raise RefDataError("package checksum does not match the signed index")
            shutil.rmtree(self.staging, ignore_errors=True)
            self.staging.mkdir(parents=True)
            try:
                with zipfile.ZipFile(io.BytesIO(package)) as z:
                    infos = z.infolist()
                    if len(infos) > MAX_ENTRIES or sum(i.file_size for i in infos) > MAX_UNPACKED_BYTES:
                        raise RefDataError("package unpacks to more than allowed")
                    names = {i.filename for i in infos}
                    if not REQUIRED_FILES <= names or not names <= ALLOWED_FILES:
                        raise RefDataError("package contains unexpected files")
                    for i in infos:
                        (self.staging / i.filename).write_bytes(z.read(i))
                ds = read_dataset(self.staging)
                m = ds["manifest"]
                if dataset_key(m) != dataset_key(entry):
                    raise RefDataError("package manifest does not match the index")
                cur = self.load_current()
                if cur and not m.get("allow_coverage_drop"):
                    a, b = coverage(cur), coverage(ds)
                    lost = [k for k in ("species", "location_rows", "skills") if (b.get(k) or 0) < (a.get(k) or 0)]
                    if lost:
                        raise RefDataError(f"package has less data than the current one ({', '.join(lost)})")
            except (zipfile.BadZipFile, RefDataError, OSError, ValueError) as exc:
                shutil.rmtree(self.staging, ignore_errors=True)
                self._save_state(last_error=f"install refused: {exc}"[:200])
                raise RefDataError(str(exc)) from None
            # activate: active → previous, staging → active (renames on one filesystem)
            shutil.rmtree(self.previous, ignore_errors=True)
            if self.active.exists():
                self.active.replace(self.previous)
            self.staging.replace(self.active)
            st = self._save_state(installed_at=_now(), last_error=None, installed=dataset_key(m))
            log.info("Reference data %s r%s activated", m.get("dump_date"), m.get("dataset_revision"))
            if self.bus:
                self.bus.publish("reference", {"installed": True})
            return {"installed": True, "dump_date": m.get("dump_date"), "revision": m.get("dataset_revision"), "state": st}

    def rollback(self) -> dict:
        with self._lock:
            if not (self.previous / "manifest.json").is_file():
                raise RefDataError("No previous dataset to go back to")
            read_dataset(self.previous)            # never roll back onto something broken
            broken = self.root / "rolled-back"
            shutil.rmtree(broken, ignore_errors=True)
            if self.active.exists():
                self.active.replace(broken)
            self.previous.replace(self.active)
            shutil.rmtree(broken, ignore_errors=True)
            self._save_state(rolled_back_at=_now())
            if self.bus:
                self.bus.publish("reference", {"rolled_back": True})
            return {"rolled_back": True}

    def remove_download(self) -> None:
        """Back to the built-in dataset (keeps nothing downloaded)."""
        with self._lock:
            for d in (self.active, self.previous, self.staging):
                shutil.rmtree(d, ignore_errors=True)
            self._save_state(installed_at=None, installed=None)

    def load_current(self) -> dict | None:
        """The newest valid dataset: a downloaded one when it is newer than the built-in one, else None
        (meaning: use the bundled data). A broken download is ignored, never fatal."""
        inst = self.installed_manifest()
        if not inst or dataset_key(inst) <= dataset_key(self.bundled_manifest()):
            return None
        try:
            return read_dataset(self.active)
        except RefDataError as exc:
            log.warning("Downloaded reference data ignored: %s", exc)
            return None

    def seasonal_catalog(self):
        """Read the optional validated companion file without decompressing the Dex dataset."""
        with self._lock:
            manifest = self.installed_manifest()
            downloaded = self.active / "seasonal.json"
            try:
                if manifest and dataset_key(manifest) > dataset_key(self.bundled_manifest()) and downloaded.is_file():
                    return read_seasonal(downloaded, manifest.get("package_files") or {})
            except (RefDataError, TypeError, ValueError, AttributeError) as exc:
                log.warning("Downloaded seasonal reference ignored: %s", exc)
            return read_seasonal(BUNDLED_DATA_DIR / "reference" / "seasonal.json")

    # ---------------------------------------------------------------- automatic
    def start_auto(self) -> None:
        if self._thread or not self.configured:
            return

        def loop():
            if self._stop.wait(90):
                return
            while not self._stop.is_set():
                try:
                    if not self.settings or self.settings.get("reference.auto_update"):
                        last = self.state().get("last_check_epoch", 0)
                        if time.time() - last >= CHECK_HOURS * 3600:
                            self._save_state(last_check_epoch=time.time())
                            res = self.check()
                            if res.get("ok") and res.get("available"):
                                self.install(res["available"])
                except StorageClosedError:
                    if self._stop.is_set():      # Companion is closing: stop here, nothing left to save
                        return
                    raise
                except Exception:  # pragma: no cover
                    log.exception("automatic reference-data update failed")
                if self._stop.wait(3600):
                    return
        self._thread = threading.Thread(target=loop, name="refdata-auto", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()


def build_package(src_dir: Path, revision: int) -> tuple[bytes, dict]:
    """Maintainer tool helper: zip a dataset directory into a package and describe it for the index."""
    src_dir = Path(src_dir)
    manifest = json.loads((src_dir / "manifest.json").read_text(encoding="utf-8"))
    files = {n: (src_dir / n).read_bytes() for n in sorted(ALLOWED_FILES - {"manifest.json"}) if (src_dir / n).is_file()}
    manifest = {**manifest, "dataset_revision": revision, "bundled": False,
                "package_files": {n: hashlib.sha256(b).hexdigest() for n, b in files.items()}}
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_STORED) as z:
        z.writestr("manifest.json", json.dumps(manifest, indent=1))
        for n, b in files.items():
            z.writestr(n, b)
    pkg = buf.getvalue()
    entry = {"dump_date": manifest.get("dump_date"), "dataset_revision": revision, "schema": manifest.get("schema", SUPPORTED_SCHEMA),
             "sha256": hashlib.sha256(pkg).hexdigest(), "bytes": len(pkg), "counts": manifest.get("counts")}
    return pkg, entry


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
