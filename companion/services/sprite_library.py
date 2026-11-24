"""Pokémon sprite library (Gen V Black/White-style battle sprites: static + animated, normal + shiny, forms,
female variants).

Since 2026-11-24 a prepared library ships with the app in companion/data/sprites/ (built by
tools/build_sprites.py from PokeAPI/sprites; images © The Pokémon Company — see CREDITS.md). Players need
nothing else. A personal library imported in Settings › Advanced still takes precedence when present.
A user who has a copy (for example a download of github.com/PokeAPI/sprites or github.com/smogon/sprites)
can point the Companion at that folder or .zip once. Only files whose PATH names one exact species or
form in a known layout are copied, validated and stored privately under <data>/private/sprite-library.

Recognised layouts (names come from companion/data/form_art.json, built from the repositories' file lists):
  PokéAPI   …/versions/generation-v/black-white/animated[/shiny]/<id>[-<form>].gif   (+ static .png)
  Smogon    …/src/sprites/gen5/s<species>[-o<form>][-s].gif|png                      (back sprites ignored)
  Showdown  …/gen5ani[-shiny]/<species>[-<form>].gif, …/gen5[-shiny]/<…>.png          (served names, derived)

Identity never comes from guessing: a file is accepted only for the key its path names, it must be a real
GIF/PNG of sensible size, and a form file byte-identical to its base species file is refused (that is base
artwork, not the form). Your source folder is never modified.
"""
from __future__ import annotations

import hashlib
import json
import shutil
import struct
import threading
import zipfile
import zlib
from pathlib import Path

from ..config import BUNDLED_DATA_DIR, Paths
from ..storage import utcnow

KINDS = ("ani", "ani_shiny", "static", "static_shiny")
MAX_BYTES = 2_000_000
MAX_DIM = 256
MAX_FILES_SCANNED = 400_000


class SpriteLibraryError(Exception):
    pass


def image_info(data: bytes) -> dict | None:
    """Validate a GIF or PNG from its bytes (stdlib only). Returns {format, w, h, frames} or None."""
    if len(data) < 32 or len(data) > MAX_BYTES:
        return None
    if data[:6] in (b"GIF87a", b"GIF89a"):
        w, h = struct.unpack("<HH", data[6:10])
        frames = _gif_frames(data)
        if frames is None:
            return None
        return {"format": "gif", "w": w, "h": h, "frames": frames}
    if data[:8] == b"\x89PNG\r\n\x1a\n" and data[12:16] == b"IHDR":
        w, h = struct.unpack(">II", data[16:24])
        return {"format": "png", "w": w, "h": h, "frames": 1}
    return None


def _gif_frames(d: bytes) -> int | None:
    """Count image descriptors by walking the GIF block structure. None if the file is malformed."""
    try:
        i = 13
        flags = d[10]
        if flags & 0x80:
            i += 3 * (2 ** ((flags & 7) + 1))
        frames = 0
        while i < len(d):
            b = d[i]
            if b == 0x3B:  # trailer
                return frames
            if b == 0x21:  # extension: label, then sub-blocks
                i += 2
            elif b == 0x2C:  # image descriptor
                frames += 1
                f = d[i + 9]
                i += 10
                if f & 0x80:
                    i += 3 * (2 ** ((f & 7) + 1))
                i += 1  # LZW minimum code size
            else:
                return None
            while True:  # data sub-blocks
                n = d[i]
                i += 1 + n
                if n == 0:
                    break
        return frames or None  # truncated after at least one frame is still a usable image
    except IndexError:
        return None


def png_alpha_bbox(data: bytes) -> list[int] | None:
    """[x0, y0, x1, y1] of the non-transparent pixels of a PNG (stdlib only), or None if it can't be read.
    Used to trim the empty margin of 96×96 battle stills for the Pokédex grid."""
    try:
        if data[:8] != b"\x89PNG\r\n\x1a\n":
            return None
        i, idat, trns = 8, [], None
        w = h = depth = ctype = interlace = None
        while i < len(data):
            n = struct.unpack(">I", data[i:i + 4])[0]
            t = data[i + 4:i + 8]
            body = data[i + 8:i + 8 + n]
            if t == b"IHDR":
                w, h, depth, ctype, _, _, interlace = struct.unpack(">IIBBBBB", body)
            elif t == b"tRNS":
                trns = body
            elif t == b"IDAT":
                idat.append(body)
            elif t == b"IEND":
                break
            i += 12 + n
        if not w or interlace or depth not in (1, 2, 4, 8) or ctype not in (0, 2, 3, 4, 6) or w > 512 or h > 512:
            return None
        chans = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ctype]
        bpp = max(1, chans * depth // 8)
        stride = (w * chans * depth + 7) // 8
        raw = zlib.decompress(b"".join(idat))
        prev = bytearray(stride)
        x0, y0, x1, y1 = w, h, -1, -1
        pos = 0
        for y in range(h):
            f = raw[pos]
            line = bytearray(raw[pos + 1:pos + 1 + stride])
            pos += 1 + stride
            if f == 1:
                for k in range(bpp, stride):
                    line[k] = (line[k] + line[k - bpp]) & 255
            elif f == 2:
                for k in range(stride):
                    line[k] = (line[k] + prev[k]) & 255
            elif f == 3:
                for k in range(stride):
                    line[k] = (line[k] + ((line[k - bpp] if k >= bpp else 0) + prev[k]) // 2) & 255
            elif f == 4:
                for k in range(stride):
                    a = line[k - bpp] if k >= bpp else 0
                    b = prev[k]
                    c = prev[k - bpp] if k >= bpp else 0
                    pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                    line[k] = (line[k] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
            prev = line
            if ctype == 6:
                vis = [x for x in range(w) if line[x * 4 + 3]]
            elif ctype == 4:
                vis = [x for x in range(w) if line[x * 2 + 1]]
            elif ctype == 3:
                if not trns:
                    vis = [0, w - 1]
                else:
                    per = 8 // depth
                    vis = []
                    for x in range(w):
                        v = (line[x // per] >> (8 - depth * (x % per + 1))) & ((1 << depth) - 1) if depth < 8 else line[x]
                        if v >= len(trns) or trns[v]:
                            vis.append(x)
            else:
                vis = [0, w - 1]  # no alpha channel: treat as opaque
            if vis:
                x0, x1 = min(x0, vis[0]), max(x1, vis[-1])
                y0 = min(y0, y)
                y1 = y
        return [x0, y0, x1 + 1, y1 + 1] if x1 >= 0 else None
    except (struct.error, zlib.error, IndexError, ValueError):
        return None


class SpriteLibrary:
    def __init__(self, paths: Paths, bus=None):
        self.paths = paths
        self.bus = bus
        self.private_root = paths.private / "sprite-library"
        self.builtin_root = BUNDLED_DATA_DIR / "sprites"
        self.root = self.private_root
        self.art = json.loads((BUNDLED_DATA_DIR / "form_art.json").read_text(encoding="utf-8"))
        self._lock = threading.Lock()
        self.job: dict = {"state": "idle"}
        self._patterns = self._build_patterns()
        self.reload()

    # ------------------------------------------------------------ lookup
    def reload(self) -> None:
        """Personal library first (when imported), otherwise the built-in one."""
        self.index, self.source_kind = None, None
        for root, kind in ((self.private_root, "personal"), (self.builtin_root, "built-in")):
            try:
                self.index = json.loads((root / "index.json").read_text(encoding="utf-8"))
                self.root, self.source_kind = root, kind
                return
            except (OSError, ValueError):
                continue
        self.root = self.private_root

    @property
    def installed(self) -> bool:
        return bool(self.index and self.index.get("entries"))

    def backfill_bounds(self) -> int:
        """Libraries installed before 2026-11-23 have no visible bounds for their stills: add them once (atomic rewrite)."""
        idx = self.index
        if not idx or self.source_kind != "personal":
            return 0
        n = 0
        for key, e in idx.get("entries", {}).items():
            for kind in ("static", "static_shiny"):
                x = e.get(kind)
                if x and "bbox" not in x:
                    try:
                        x["bbox"] = png_alpha_bbox((self.root / kind.replace("_", "-") / x["file"]).read_bytes())
                    except OSError:
                        x["bbox"] = None
                    n += 1
        if n:
            tmp = self.root / "index.json.tmp"
            tmp.write_text(json.dumps(idx), encoding="utf-8")
            tmp.replace(self.root / "index.json")
        return n

    def still(self, key: str, shiny: bool = False) -> dict | None:
        """Gen V still (96×96 canvas) with its visible bounds, for grid tiles and report rows."""
        e = (self.index or {}).get("entries", {}).get(key) or {}
        kind = "static_shiny" if shiny else "static"
        x = e.get(kind)
        if not x:
            return None
        return {"url": f"/assets/library/{kind.replace('_', '-')}/{x['file']}?v={self.index.get('version', '')}",
                "w": x["w"], "h": x["h"], "bbox": x.get("bbox")}

    def urls(self, key: str) -> dict:
        """key = '479' or '479-wash'. URLs for whichever kinds exist (versioned for caching)."""
        e = (self.index or {}).get("entries", {}).get(key) or {}
        v = (self.index or {}).get("version", "")
        return {k: f"/assets/library/{k.replace('_', '-')}/{e[k]['file']}?v={v}" for k in KINDS if k in e}

    def bounds(self, key: str) -> dict:
        """Visible bounds per kind. Stills: measured; Gen V animations are cropped to the Pokémon, so their
        canvas is the visible area (checked over every frame of the PokéAPI set on 2026-11-23)."""
        e = (self.index or {}).get("entries", {}).get(key) or {}
        out = {}
        for k in KINDS:
            if k in e:
                x = e[k]
                out[k] = x.get("bbox") if x.get("bbox") else [0, 0, x["w"], x["h"]]
        return out

    def provenance(self, key: str) -> dict:
        e = (self.index or {}).get("entries", {}).get(key) or {}
        return {k: {"layout": e[k]["layout"], "path": e[k]["from"], "frames": e[k]["frames"]} for k in KINDS if k in e}

    def status(self) -> dict:
        idx = self.index or {}
        entries = idx.get("entries", {})
        forms = [k for k in self.art["forms"]]
        fkeys = {k.replace(":", "-") for k in forms}
        def cov(kind, keys):
            return sum(1 for k in keys if kind in entries.get(k, {}))
        species_keys = [str(s) for s in self.art["species"]]
        return {"installed": self.installed, "source_kind": self.source_kind, "personal": (self.private_root / "index.json").is_file(),
                "imported_at": idx.get("imported_at"), "source": idx.get("source") if self.source_kind == "personal" else "built-in",
                "credits": idx.get("credits"), "female": sum(1 for k in entries if k.endswith("-female")),
                "derived_stills": sum(1 for e in entries.values() for k in ("static", "static_shiny") if (e.get(k) or {}).get("derived")),
                "refused": idx.get("refused", [])[:200], "refused_count": len(idx.get("refused", [])),
                "coverage": {"forms_total": len(forms), "species_total": len(species_keys),
                             **{f"forms_{k}": cov(k, fkeys) for k in KINDS}, **{f"species_{k}": cov(k, species_keys) for k in KINDS}},
                "job": self.job, "sources": self.art["sources"]}

    # ------------------------------------------------------------ import
    def _build_patterns(self) -> dict[str, tuple[str, str, str]]:
        """Lower-case path SUFFIX → (key, kind, layout)."""
        pats: dict[str, tuple[str, str, str]] = {}
        BW = "versions/generation-v/black-white/"
        def add(key: str, e: dict) -> None:
            pa = e["pokeapi"]["name"]
            pats[f"{BW}animated/{pa}.gif"] = (key, "ani", "pokeapi")
            pats[f"{BW}animated/shiny/{pa}.gif"] = (key, "ani_shiny", "pokeapi")
            pats[f"{BW}{pa}.png"] = (key, "static", "pokeapi")
            pats[f"{BW}shiny/{pa}.png"] = (key, "static_shiny", "pokeapi")
            sm = e["smogon"]["name"]
            for ext in ("gif", "png"):
                kind = "ani" if ext == "gif" else "static"
                pats[f"src/sprites/gen5/{sm}.{ext}"] = (key, kind, "smogon")
                pats[f"src/sprites/gen5/{sm}-s.{ext}"] = (key, kind + "_shiny", "smogon")
            sd = e["smogon"]["served_name"]
            pats[f"gen5ani/{sd}.gif"] = (key, "ani", "showdown")
            pats[f"gen5ani-shiny/{sd}.gif"] = (key, "ani_shiny", "showdown")
            pats[f"gen5/{sd}.png"] = (key, "static", "showdown")
            pats[f"gen5-shiny/{sd}.png"] = (key, "static_shiny", "showdown")
        for sid, e in self.art["species"].items():
            add(sid, e)
            # female variants (PokéAPI layout only); rejected later if identical to the base artwork
            pats[f"{BW}animated/female/{sid}.gif"] = (f"{sid}-female", "ani", "pokeapi")
            pats[f"{BW}animated/shiny/female/{sid}.gif"] = (f"{sid}-female", "ani_shiny", "pokeapi")
            pats[f"{BW}female/{sid}.png"] = (f"{sid}-female", "static", "pokeapi")
            pats[f"{BW}shiny/female/{sid}.png"] = (f"{sid}-female", "static_shiny", "pokeapi")
        for k, e in self.art["forms"].items():
            add(k.replace(":", "-"), e)
        return pats

    def _match(self, rel: str) -> tuple[str, str, str] | None:
        rel = rel.replace("\\", "/").lower()
        parts = rel.split("/")
        for n in range(min(len(parts), 7), 0, -1):  # longest suffix first
            hit = self._patterns.get("/".join(parts[-n:]))
            if hit:
                return hit
        return None

    def _iter_source(self, src: Path):
        """Yield (relative path, reader) for every file in a folder or .zip. Read-only."""
        if src.is_file() and src.suffix.lower() == ".zip":
            with zipfile.ZipFile(src) as z:
                for n, info in enumerate(z.infolist()):
                    if n > MAX_FILES_SCANNED:
                        break
                    if not info.is_dir():
                        yield info.filename, (lambda i=info: z.read(i) if i.file_size <= MAX_BYTES else b"")
            return
        n = 0
        for p in src.rglob("*"):
            n += 1
            if n > MAX_FILES_SCANNED:
                break
            if p.is_file() and not p.is_symlink():
                yield str(p.relative_to(src)), (lambda q=p: q.read_bytes() if q.stat().st_size <= MAX_BYTES else b"")

    def start_import(self, folder: str) -> dict:
        src = Path(folder).expanduser()
        if not src.exists():
            raise SpriteLibraryError(f"{src} does not exist")
        with self._lock:
            if self.job.get("state") == "running":
                raise SpriteLibraryError("A sprite library import is already running")
            self.job = {"state": "running", "folder": str(src), "started_at": utcnow(), "scanned": 0, "accepted": 0}
        threading.Thread(target=self._run_import, args=(src,), name="sprite-library", daemon=True).start()
        return self.job

    def _run_import(self, src: Path) -> None:
        try:
            result = self.import_from(src)
            self.job = {"state": "done", "folder": str(src), **result}
        except Exception as exc:  # report, keep the previous library
            self.job = {"state": "error", "folder": str(src), "error": str(exc)}
        if self.bus:
            self.bus.publish("sprites", {"state": self.job["state"]})

    def import_from(self, src: Path) -> dict:
        tmp = self.private_root.with_name("sprite-library.tmp")
        shutil.rmtree(tmp, ignore_errors=True)
        for k in KINDS:
            (tmp / k.replace("_", "-")).mkdir(parents=True, exist_ok=True)
        entries: dict[str, dict] = {}
        refused: list[dict] = []
        hashes: dict[tuple[str, str], str] = {}
        rank = {"pokeapi": 0, "smogon": 1, "showdown": 2}
        scanned = 0
        for rel, read in self._iter_source(src):
            scanned += 1
            if scanned % 2000 == 0:
                self.job["scanned"] = scanned
            hit = self._match(rel)
            if not hit:
                continue
            key, kind, layout = hit
            have = entries.get(key, {}).get(kind)
            if have and rank[have["layout"]] <= rank[layout]:
                continue
            data = read()
            info = image_info(data)
            if not info:
                refused.append({"path": rel, "reason": "not a valid GIF/PNG of at most 2 MB"})
                continue
            if info["w"] > MAX_DIM or info["h"] > MAX_DIM or info["w"] < 8 or info["h"] < 8:
                refused.append({"path": rel, "reason": f"unexpected size {info['w']}×{info['h']}"})
                continue
            if kind.startswith("ani") and info["format"] != "gif":
                kind = "static" + kind[3:]
            ext = info["format"]
            name = f"{key}.{ext}"
            old = entries.get(key, {}).get(kind)
            if old:  # a better-ranked layout replaces an earlier match
                (tmp / kind.replace("_", "-") / old["file"]).unlink(missing_ok=True)
            (tmp / kind.replace("_", "-") / name).write_bytes(data)
            digest = hashlib.sha1(data).hexdigest()
            hashes[(key, kind)] = digest
            entries.setdefault(key, {})[kind] = {"file": name, "from": rel[-200:], "layout": layout, "frames": info["frames"],
                                                 "w": info["w"], "h": info["h"], "sha1": digest[:12]}
            if ext == "png":
                entries[key][kind]["bbox"] = png_alpha_bbox(data)
            self.job["accepted"] = len(hashes)
        # A form file identical to its base species file is base artwork, not the form.
        for key in [k for k in entries if "-" in k]:
            base = key.split("-", 1)[0]
            for kind in list(entries[key]):
                if hashes.get((key, kind)) and hashes.get((key, kind)) == hashes.get((base, kind)):
                    refused.append({"path": entries[key][kind]["from"], "reason": "identical to the base species artwork"})
                    (tmp / kind.replace("_", "-") / entries[key][kind]["file"]).unlink(missing_ok=True)
                    del entries[key][kind]
            if not entries[key]:
                del entries[key]
        if not entries:
            shutil.rmtree(tmp, ignore_errors=True)
            raise SpriteLibraryError("No recognised sprite files were found there. Point at a folder or .zip of "
                                     "github.com/PokeAPI/sprites or github.com/smogon/sprites (or a Showdown gen5ani folder). "
                                     "Your existing sprite library was kept.")
        version = hashlib.sha1(json.dumps(sorted(hashes.items())).encode()).hexdigest()[:10]
        (tmp / "index.json").write_text(json.dumps({"format": 1, "imported_at": utcnow(), "source": str(src), "version": version,
                                                    "scanned": scanned, "entries": entries, "refused": refused}), encoding="utf-8")
        self._swap(tmp)
        self.reload()
        forms = sum(1 for k in entries if "-" in k)
        return {"accepted": len(hashes), "entries": len(entries), "forms": forms, "species": len(entries) - forms,
                "refused": len(refused), "scanned": scanned}

    def _swap(self, tmp: Path) -> None:
        prev = self.private_root.with_name("sprite-library.prev")
        shutil.rmtree(prev, ignore_errors=True)
        moved = False
        try:
            if self.private_root.exists():
                self.private_root.rename(prev)
                moved = True
            tmp.rename(self.private_root)
        except OSError:
            if moved and not self.private_root.exists():
                prev.rename(self.private_root)
            raise
        shutil.rmtree(prev, ignore_errors=True)

    def recover(self) -> None:
        prev = self.private_root.with_name("sprite-library.prev")
        if prev.exists() and not self.private_root.exists():
            prev.rename(self.private_root)
        shutil.rmtree(self.private_root.with_name("sprite-library.tmp"), ignore_errors=True)

    def remove(self) -> None:
        shutil.rmtree(self.private_root, ignore_errors=True)
        self.reload()
