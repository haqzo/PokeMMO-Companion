"""Region-map artwork you extract yourself from your own game files, plus your private map layouts.

The Companion ships NO map artwork. If you own the games, you can point it at your own ROM files once.
Each file is opened READ-ONLY (memory-mapped with ACCESS_READ), recognised from its header, checked against
a per-game recipe, and only the original Town Map / Pokégear region artwork is decoded and saved as PNG under
<data>/private/maps. The ROM itself is never copied, modified or uploaded, and nothing is downloaded.

Recipes (verified against the owner's files on 2026-11-23; the hashes below are of the decoded resources,
not of any ROM, and contain no game data):
  FireRed  BPRE rev 1  GBA LZ77 4bpp text-BG tiles + 4 tilemaps (Kanto, Sevii 1–3, 4–5, 6–7), BGR555 palette
  Emerald  BPEE rev 0  GBA LZ77 8bpp affine-BG tiles + 64×64 tilemap, 0x90-colour palette
  HeartGold/SoulSilver (IPK*/IPG*)  NitroFS a/1/4/4 members 10 (NCGR) 11 (NSCR) 20 (NCLR): Johto Pokégear map
  Platinum (CPU*)  NitroFS graphic/tmap_gra.narc: top-screen map 19/0/22+24, bottom-screen zoom map 20/1/25+26
  Black/White (IRB*/IRA*)  recognised, but the Unova Town Map artwork has NOT been located: no extraction.
Other revisions (FireRed rev 0, LeafGreen) are searched for the same decoded resources by hash; DS games in
other languages are decoded structurally and marked "unverified" so you can judge the preview yourself.

Layouts (markers / areas you place on a map) are stored separately in the database (documents table, kind
"map_layout"), in normalised 0..1 image coordinates per sub-map, so re-importing artwork never touches them.
"""
from __future__ import annotations

import hashlib
import json
import mmap
import re
import shutil
import struct
import threading
import time
import uuid
from pathlib import Path

from ..config import Paths
from ..storage import utcnow
from . import romfmt as rf

REGIONS = ("kanto", "johto", "hoenn", "sinnoh", "unova")
ROM_SUFFIXES = (".gba", ".nds")
MAX_ROM_BYTES = 600 * 1024 * 1024

GAMES = {
    # GBA: full 4-character game code
    "BPRE": {"name": "Pokémon FireRed", "platform": "gba", "region": "kanto", "recipe": "frlg"},
    "BPGE": {"name": "Pokémon LeafGreen", "platform": "gba", "region": "kanto", "recipe": "frlg"},
    "BPEE": {"name": "Pokémon Emerald", "platform": "gba", "region": "hoenn", "recipe": "emerald"},
    # DS: first three characters (the fourth is the language)
    "IPK": {"name": "Pokémon HeartGold", "platform": "nds", "region": "johto", "recipe": "hgss"},
    "IPG": {"name": "Pokémon SoulSilver", "platform": "nds", "region": "johto", "recipe": "hgss"},
    "CPU": {"name": "Pokémon Platinum", "platform": "nds", "region": "sinnoh", "recipe": "platinum"},
    "IRB": {"name": "Pokémon Black", "platform": "nds", "region": "unova", "recipe": None},
    "IRA": {"name": "Pokémon White", "platform": "nds", "region": "unova", "recipe": None},
}
VERIFIED_WITH = {
    "frlg": "FireRed (USA, Europe) Rev 1 — BPRE",
    "emerald": "Emerald (USA, Europe) — BPEE",
    "hgss": "HeartGold (Europe) and SoulSilver (Europe) files reporting IPKE / IPGE",
    "platinum": "Platinum (Europe) file reporting CPUE",
}
NOT_LOCATED = ("The Unova Town Map artwork has not been located in Black/White yet, so nothing can be extracted. "
               "Your file was recognised and left untouched. The Location Explorer still lists every Unova encounter.")

# Decoded-resource hashes (sha1). FireRed rev 1 offsets are tried first; elsewhere the LZ streams are found by hash.
FRLG = {
    "tiles": (0x3EF68C, 0x2800, "34a6fe4d2f3a54b224652247c3634aa5f018acce"),
    "pal_rel": (-0x340, 0x100, "229339a10443c74f9ad83d6980d7b9c596a6dd44"),
    "maps": [
        ("kanto", "Kanto", 0x3F090C, "29f96fd4bc83e93c9a3bdf2828705c4bfa295bad"),
        ("sevii-123", "Sevii Islands 1–3", 0x3F0B6C, "efb0b1232b134ebd3e9f40e12fad7a01613c5da6"),
        ("sevii-45", "Sevii Islands 4–5", 0x3F0C7C, "a5d5029e2b8c6b891ab4ae833c6f8a409b0953ad"),
        ("sevii-67", "Sevii Islands 6–7", 0x3F0D60, "17e0deba9e6b0c3bdddc70ac1f60687dc11a6ea7"),
    ],
    "map_size": 0x4B0, "crop": (24, 16, 192, 144),
}
EMERALD = {
    "tiles": (0x59F77C, 0x3A40, "4c486c9c47cc81ad217b2c4b99b325bd072d6934"),
    "pal_rel": (-0x120, 0x120, "cf38c807be40f68534bf49f98e4e39ebaf736210"),
    "map": (0x5A04E0, 0x1000, "f129b76814be88f5d7055c53ac896ce9cfb4a3a0"),
    "crop": (0, 0, 248, 152),
}
HGSS = {"narc": "a/1/4/4", "cg": (10, "337bce806550c3f7e4fd65dd14d1198f4121de35"),
        "sc": (11, "ffbdc058acbf5d9f4afa8ef2b93402586086aef0"), "pal": (20, "4fef625498a5302e2141fcb6ded4415321c9da81"),
        "crop": (0, 0, 376, 160)}
PLATINUM = {"narc": "graphic/tmap_gra.narc", "maps": [
    {"id": "sinnoh", "label": "Sinnoh", "cg": (19, "2ecc0412c7193d02a6473be3c26dc163bd56e14f"),
     "pal": (0, "e574e48e70306ac82a2b46c2e06dcaade8368278"), "base": (22, "0bd6ca9f5c76afa5d750262eabd53a4e5512a99a"),
     "over": (24, "7c8d660a21492d3e892d62645dc1fde3894aa300"), "blocks": False, "crop": (20, 0, 216, 168)},
    {"id": "sinnoh-zoom", "label": "Sinnoh (zoom map, colours as stored)", "cg": (20, "1467032b6d974507241d9097d3aeedabdf23ca6a"),
     "pal": (1, "53506d8797cbc8724360a3285bd7844576bb45ff"), "base": (25, "4d749c74ea8fdbd5fe31b734deaf58e053985683"),
     "over": (26, "3f55845a6c58f7978ffbb9205440219024340385"), "blocks": True, "crop": None}
]}

MAP_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,40}$")
MARK_KINDS = ("point", "rect", "poly")
MARK_TAGS = ("town", "route", "cave", "special", "transition", "other")


class RegionMapError(Exception):
    pass


def _sha1(b) -> str:
    return hashlib.sha1(b).hexdigest()


# ------------------------------------------------------------------ recognition
def _crc16(data) -> int:
    crc = 0xFFFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            crc = (crc >> 1) ^ 0xA001 if crc & 1 else crc >> 1
    return crc


def identify_bytes(d, size: int, name: str = "") -> dict:
    """Recognise a ROM from its header only. Never raises for unknown files; returns supported=False instead."""
    out = {"file": name, "size": size, "supported": False, "can_extract": False, "platform": None,
           "game_code": None, "title": None, "revision": None, "region": None, "game": None, "problems": []}
    low = name.lower()
    if low.endswith(".gba") or (size >= 0xC0 and d[0xB2] == 0x96 and not low.endswith(".nds")):
        if size < 0xC0:
            out["problems"].append("File is too small to be a GBA ROM.")
            return out
        code = bytes(d[0xAC:0xB0]).decode("latin1", "replace")
        chk = (-(sum(d[0xA0:0xBD]) + 0x19)) & 0xFF
        out.update(platform="gba", game_code=code, title=bytes(d[0xA0:0xAC]).rstrip(b"\0").decode("latin1", "replace"),
                   revision=d[0xBC])
        if d[0xB2] != 0x96:
            out["problems"].append("GBA header fixed byte is wrong.")
        if chk != d[0xBD]:
            out["problems"].append("GBA header checksum does not match.")
        if size not in (8 << 20, 16 << 20, 32 << 20):
            out["problems"].append(f"Unexpected GBA ROM size ({size} bytes).")
        game = GAMES.get(code)
    else:
        if size < 0x200:
            out["problems"].append("File is too small to be a DS ROM.")
            return out
        code = bytes(d[0x0C:0x10]).decode("latin1", "replace")
        out.update(platform="nds", game_code=code, title=bytes(d[0:12]).rstrip(b"\0").decode("latin1", "replace"),
                   revision=d[0x1E])
        if _crc16(d[0:0x15E]) != (d[0x15E] | d[0x15F] << 8):
            out["problems"].append("DS header checksum does not match.")
        declared = 1 << (17 + d[0x14]) if d[0x14] < 16 else 0
        if declared and size > declared * 2:
            out["problems"].append("File is larger than its header declares.")
        game = GAMES.get(code[:3])
    if not game:
        out["problems"].append("Not one of the supported games (FireRed/LeafGreen, Emerald, HeartGold/SoulSilver, Platinum, Black/White).")
        return out
    out.update(game=game["name"], region=game["region"], recipe=game["recipe"])
    hard = [p for p in out["problems"] if "checksum" in p or "fixed byte" in p]
    out["supported"] = not hard
    out["can_extract"] = bool(game["recipe"]) and not hard
    if not game["recipe"]:
        out["note"] = NOT_LOCATED
    else:
        out["verified_with"] = VERIFIED_WITH[game["recipe"]]
    return out


def _open_ro(path: Path):
    if not path.is_file():
        raise RegionMapError("That file does not exist.")
    size = path.stat().st_size
    if size > MAX_ROM_BYTES:
        raise RegionMapError("That file is too large to be a GBA or DS ROM.")
    fh = open(path, "rb")  # read-only; never opened for writing
    try:
        mm = mmap.mmap(fh.fileno(), 0, access=mmap.ACCESS_READ)
    except (ValueError, OSError):
        fh.close()
        raise RegionMapError("Could not read that file.")
    return fh, mm, size


def identify(path: str | Path) -> dict:
    p = Path(path).expanduser()
    fh, mm, size = _open_ro(p)
    try:
        return identify_bytes(mm, size, p.name)
    finally:
        mm.close()
        fh.close()


# ------------------------------------------------------------------ GBA recipes
def _lz_at(d, off: int, size: int, digest: str) -> bytes | None:
    try:
        data, _ = rf.lz10(d, off, limit=size)
    except (rf.FormatError, IndexError):
        return None
    return data if len(data) == size and _sha1(data) == digest else None


def _lz_find(d, size: int, digest: str, hint: int | None) -> tuple[int, bytes] | None:
    """Look for an LZ77 stream whose decoded bytes match `digest` — first at the known offset, then by scanning
    for its exact header (type 0x10 + decoded size) at 4-byte aligned positions."""
    if hint is not None and hint + 4 <= len(d):
        got = _lz_at(d, hint, size, digest)
        if got:
            return hint, got
    head = bytes([0x10, size & 0xFF, size >> 8 & 0xFF, size >> 16 & 0xFF])
    pos = d.find(head)
    while pos != -1:
        if pos % 4 == 0 and pos != hint:
            got = _lz_at(d, pos, size, digest)
            if got:
                return pos, got
        pos = d.find(head, pos + 1)
    return None


def _gba_frlg(d) -> list[dict]:
    t_off, t_size, t_hash = FRLG["tiles"]
    found = _lz_find(d, t_size, t_hash, t_off)
    if not found:
        raise RegionMapError("The Kanto map tiles were not found in this ROM (unknown revision or modified ROM).")
    t_at, tiles = found
    rel, p_size, p_hash = FRLG["pal_rel"]
    pal_raw = bytes(d[t_at + rel:t_at + rel + p_size])
    if _sha1(pal_raw) != p_hash:
        raise RegionMapError("The Kanto map palette was not where this game keeps it (modified ROM?).")
    pal = rf.bgr555(pal_raw)
    out = []
    for mid, label, hint, digest in FRLG["maps"]:
        hit = _lz_find(d, FRLG["map_size"], digest, hint + (t_at - t_off))
        if not hit:
            raise RegionMapError(f"The {label} tilemap was not found in this ROM.")
        m_at, tm = hit
        entries = [rf.u16(tm, i) for i in range(0, len(tm), 2)]
        cv = rf.render_tiles(tiles, 4, entries, 30, 20, pal).crop(*FRLG["crop"])
        out.append({"id": mid, "label": label, "canvas": cv, "verified": True,
                    "source": {"tiles": hex(t_at), "tilemap": hex(m_at), "palette": hex(t_at + rel)}})
    return out


def _gba_emerald(d) -> list[dict]:
    t_off, t_size, t_hash = EMERALD["tiles"]
    found = _lz_find(d, t_size, t_hash, t_off)
    if not found:
        raise RegionMapError("The Hoenn map tiles were not found in this ROM.")
    t_at, tiles = found
    rel, p_size, p_hash = EMERALD["pal_rel"]
    pal_raw = bytes(d[t_at + rel:t_at + rel + p_size])
    if _sha1(pal_raw) != p_hash:
        raise RegionMapError("The Hoenn map palette was not where this game keeps it (modified ROM?).")
    m_off, m_size, m_hash = EMERALD["map"]
    hit = _lz_find(d, m_size, m_hash, m_off + (t_at - t_off))
    if not hit:
        raise RegionMapError("The Hoenn tilemap was not found in this ROM.")
    cv = rf.render_tiles(tiles, 8, list(hit[1]), 64, 64, rf.bgr555(pal_raw), affine8=True).crop(*EMERALD["crop"])
    return [{"id": "hoenn", "label": "Hoenn", "canvas": cv, "verified": True,
             "source": {"tiles": hex(t_at), "tilemap": hex(hit[0]), "palette": hex(t_at + rel)}}]


# ------------------------------------------------------------------ DS recipes
def _member(parts: list[bytes], spec: tuple[int, str], magic: bytes) -> tuple[bytes, bool]:
    idx, digest = spec
    if idx >= len(parts):
        raise RegionMapError("The map archive has fewer members than expected (different game build).")
    b = rf.nitro_decompress(parts[idx])
    if b[:4] != magic:
        raise RegionMapError(f"Map archive member {idx} is not the expected {magic.decode()} resource.")
    return b, _sha1(b) == digest


def _nds_hgss(d) -> list[dict]:
    parts = rf.narc(rf.NitroROM(d).read(HGSS["narc"]))
    cg, v1 = _member(parts, HGSS["cg"], b"RGCN")
    sc, v2 = _member(parts, HGSS["sc"], b"RCSN")
    pl, v3 = _member(parts, HGSS["pal"], b"RLCN")
    g, s = rf.ncgr(cg), rf.nscr(sc)
    cv = rf.render_tiles(g["tiles"], g["bpp"], s["map"], s["w"], s["h"], rf.nclr(pl)).crop(*HGSS["crop"])
    return [{"id": "johto", "label": "Johto", "canvas": cv, "verified": v1 and v2 and v3,
             "source": {"archive": HGSS["narc"], "members": [HGSS["cg"][0], HGSS["sc"][0], HGSS["pal"][0]]}}]


def _nds_platinum(d) -> list[dict]:
    parts = rf.narc(rf.NitroROM(d).read(PLATINUM["narc"]))
    out = []
    for m in PLATINUM["maps"]:
        cg, v1 = _member(parts, m["cg"], b"RGCN")
        pl, v2 = _member(parts, m["pal"], b"RLCN")
        base, v3 = _member(parts, m["base"], b"RCSN")
        over, v4 = _member(parts, m["over"], b"RCSN")
        g, pal = rf.ncgr(cg), rf.nclr(pl)
        s1, s2 = rf.nscr(base, blocks=m["blocks"]), rf.nscr(over, blocks=m["blocks"])
        cv = rf.render_tiles(g["tiles"], g["bpp"], s1["map"], s1["w"], s1["h"], pal)
        cv.over(rf.render_tiles(g["tiles"], g["bpp"], s2["map"], s2["w"], s2["h"], pal, transparent0=True))
        if m["crop"]:
            cv = cv.crop(*m["crop"])
        out.append({"id": m["id"], "label": m["label"], "canvas": cv, "verified": all((v1, v2, v3, v4)),
                    "source": {"archive": PLATINUM["narc"], "members": [m["cg"][0], m["pal"][0], m["base"][0], m["over"][0]]}})
    return out


RECIPES = {"frlg": _gba_frlg, "emerald": _gba_emerald, "hgss": _nds_hgss, "platinum": _nds_platinum}


def sanity(cv: rf.Canvas) -> list[str]:
    """Reject renders that are obviously wrong (blank, single colour, unresolved palette entries)."""
    issues = []
    if cv.w < 64 or cv.h < 64:
        issues.append("image is too small")
    cols = cv.distinct_colours()
    if cols < 6:
        issues.append("image has almost no colours")
    magenta = bytes((255, 0, 255, 255))
    bad = sum(1 for i in range(0, len(cv.px), 4) if cv.px[i:i + 4] == magenta)
    if bad > cv.w * cv.h * 0.02:
        issues.append("palette entries are missing")
    if cv.opaque_fraction() < 0.9:
        issues.append("image is mostly transparent")
    return issues


def extract(path: str | Path) -> tuple[dict, list[dict]]:
    """Identify and decode the region artwork from one ROM. Read-only. Returns (identity, maps)."""
    p = Path(path).expanduser()
    fh, mm, size = _open_ro(p)
    try:
        ident = identify_bytes(mm, size, p.name)
        if not ident["supported"]:
            raise RegionMapError("Not a supported, intact ROM: " + " ".join(ident["problems"]))
        if not ident["can_extract"]:
            raise RegionMapError(ident.get("note") or "No extraction recipe for this game.")
        try:
            maps = RECIPES[ident["recipe"]](mm)
        except (rf.FormatError, IndexError, KeyError, struct.error) as exc:
            raise RegionMapError(f"Could not decode the map artwork: {exc}")
        h = hashlib.sha1()
        mm.seek(0)
        for chunk in iter(lambda: mm.read(1 << 22), b""):
            h.update(chunk)
        ident["rom_sha1"] = h.hexdigest()
    finally:
        mm.close()
        fh.close()
    for m in maps:
        issues = sanity(m["canvas"])
        if issues:
            raise RegionMapError(f"{m['label']}: decoded image failed checks ({', '.join(issues)}).")
    return ident, maps


# ------------------------------------------------------------------ service
class RegionMaps:
    def __init__(self, paths: Paths, store=None, bus=None):
        self.paths, self.store, self.bus = paths, store, bus
        self.root = paths.private / "maps"
        self.installed = self.root / "installed"
        self.pending = self.root / "pending"
        self.jobs: dict[str, dict] = {}
        self._lock = threading.Lock()

    # --- storage helpers
    def recover(self) -> None:
        """Finish or undo an accept that was interrupted (e.g. power loss between the two renames)."""
        if not self.installed.is_dir():
            return
        for prev in self.installed.glob(".*.prev"):
            region = prev.name[1:-5]
            live = self.installed / region
            if live.is_dir():
                shutil.rmtree(prev, ignore_errors=True)
            else:
                prev.rename(live)
        for tmp in self.root.glob("**/.tmp-*"):
            shutil.rmtree(tmp, ignore_errors=True)

    def _manifest(self, base: Path, region: str) -> dict | None:
        f = base / region / "manifest.json"
        try:
            m = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        m["maps"] = [x for x in m.get("maps", []) if (base / region / x["file"]).is_file()]
        return m if m["maps"] else None

    def status(self) -> dict:
        regions = {}
        for r in REGIONS:
            inst = self._manifest(self.installed, r)
            pend = self._manifest(self.pending, r)
            regions[r] = {"installed": self._public(inst, "installed"), "pending": self._public(pend, "pending"),
                          "job": next((j for j in self.jobs.values() if j.get("region") == r and j["state"] == "running"), None)}
        return {"regions": regions, "games": [{"code": k, **{x: v[x] for x in ("name", "platform", "region")},
                                                "extractable": bool(v["recipe"])} for k, v in GAMES.items()],
                "verified_with": VERIFIED_WITH, "unova_note": NOT_LOCATED}

    def _public(self, m: dict | None, where: str) -> dict | None:
        if not m:
            return None
        base = "/assets/maps/" + where + "/" + m["region"] + "/"
        return {**m, "maps": [{**x, "url": base + x["file"] + "?v=" + m["extracted_at"].replace(":", "")} for x in m["maps"]]}

    def file(self, where: str, rel: str) -> Path | None:
        base = self.installed if where == "installed" else self.pending if where == "pending" else None
        if base is None:
            return None
        try:
            target = (base / rel).resolve()
            target.relative_to(base.resolve())
        except (ValueError, OSError):
            return None
        return target if target.suffix == ".png" and target.is_file() else None

    # --- import
    def scan_folder(self, folder: str) -> list[dict]:
        p = Path(folder).expanduser()
        if not p.is_dir():
            raise RegionMapError("That folder does not exist.")
        out = []
        for f in sorted(p.iterdir())[:500]:
            if f.is_file() and f.suffix.lower() in ROM_SUFFIXES:
                try:
                    out.append({**identify(f), "path": str(f)})
                except RegionMapError as exc:
                    out.append({"file": f.name, "path": str(f), "supported": False, "problems": [str(exc)]})
        return out

    def start_import(self, path: str) -> dict:
        p = Path(path).expanduser()
        if p.suffix.lower() not in ROM_SUFFIXES:
            raise RegionMapError("Choose a .gba or .nds file (unzip it first if it is in an archive).")
        ident = identify(p)
        if not ident["can_extract"]:
            raise RegionMapError(ident.get("note") or "Not a supported, intact ROM: " + " ".join(ident["problems"]))
        jid = uuid.uuid4().hex[:12]
        job = {"id": jid, "state": "running", "region": ident["region"], "file": p.name, "started": utcnow(), "error": None}
        with self._lock:
            if any(j["state"] == "running" and j["region"] == ident["region"] for j in self.jobs.values()):
                raise RegionMapError(f"An import for {ident['region'].title()} is already running.")
            self.jobs[jid] = job
        threading.Thread(target=self._run, args=(job, p), name="region-maps", daemon=True).start()
        return job

    def _run(self, job: dict, p: Path) -> None:
        try:
            self.import_rom(p)
            job["state"] = "done"
        except RegionMapError as exc:
            job.update(state="error", error=str(exc))
        except Exception as exc:  # never leave a job "running"
            job.update(state="error", error=f"Unexpected error: {exc}")
        if self.bus:
            self.bus.publish("maps", {"region": job["region"], "state": job["state"]})

    def import_rom(self, path: str | Path) -> dict:
        """Extract into pending/<region> (atomically). Installed artwork is untouched until you accept."""
        ident, maps = extract(path)
        region = ident["region"]
        self.pending.mkdir(parents=True, exist_ok=True)
        tmp = self.pending / f".tmp-{region}-{uuid.uuid4().hex[:6]}"
        tmp.mkdir()
        try:
            entries = []
            for m in maps:
                fname = m["id"] + ".png"
                (tmp / fname).write_bytes(m["canvas"].png())
                entries.append({"id": m["id"], "label": m["label"], "file": fname, "w": m["canvas"].w, "h": m["canvas"].h,
                                "verified": m["verified"], "source": m["source"]})
            manifest = {"region": region, "game": ident["game"], "game_code": ident["game_code"], "revision": ident["revision"],
                        "rom_file": Path(path).name, "rom_size": ident["size"], "rom_sha1": ident["rom_sha1"],
                        "verified": all(e["verified"] for e in entries), "extracted_at": utcnow(), "maps": entries,
                        "format": ident["platform"], "notes": "Decoded read-only from your own ROM. Private: never shared or committed."}
            (tmp / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
            dest = self.pending / region
            if dest.exists():
                shutil.rmtree(dest)
            tmp.rename(dest)
        except Exception:
            shutil.rmtree(tmp, ignore_errors=True)
            raise
        return manifest

    def accept(self, region: str) -> dict:
        if region not in REGIONS:
            raise RegionMapError("Unknown region")
        src = self.pending / region
        if not self._manifest(self.pending, region):
            raise RegionMapError("Nothing is waiting for review in this region.")
        self.installed.mkdir(parents=True, exist_ok=True)
        live = self.installed / region
        prev = self.installed / f".{region}.prev"
        if prev.exists():
            shutil.rmtree(prev)
        if live.exists():
            live.rename(prev)
        try:
            src.rename(live)
        except OSError:
            if prev.exists():
                prev.rename(live)
            raise
        shutil.rmtree(prev, ignore_errors=True)
        return self._public(self._manifest(self.installed, region), "installed")

    def reject(self, region: str) -> None:
        if region not in REGIONS:
            raise RegionMapError("Unknown region")
        shutil.rmtree(self.pending / region, ignore_errors=True)

    def remove(self, region: str) -> None:
        """Remove installed artwork for one region (your layouts are kept)."""
        if region not in REGIONS:
            raise RegionMapError("Unknown region")
        shutil.rmtree(self.installed / region, ignore_errors=True)

    # --- layouts (markers / areas) — stored apart from the artwork
    def layout(self, region: str) -> dict:
        doc = self.store.get_document("map_layout", region) if self.store else None
        return (doc or {}).get("data") or {"version": 1, "region": region, "marks": []}

    def validate_layout(self, region: str, data: dict, known_locations: set[str]) -> tuple[dict, list[str]]:
        if region not in REGIONS:
            raise RegionMapError("Unknown region")
        if not isinstance(data, dict) or not isinstance(data.get("marks"), list):
            raise RegionMapError("A layout needs a list of marks.")
        if data.get("region") not in (None, region):
            raise RegionMapError(f"This layout is for {data.get('region')}, not {region}.")
        if len(data["marks"]) > 5000:
            raise RegionMapError("Too many marks.")
        problems, clean, seen = [], [], set()

        def num(v) -> float:
            if not isinstance(v, (int, float)) or v != v or not -0.001 <= v <= 1.001:
                raise ValueError
            return round(min(1.0, max(0.0, float(v))), 5)
        for i, m in enumerate(data["marks"]):
            try:
                if not isinstance(m, dict):
                    raise ValueError
                kind = m.get("kind", "point")
                mp = str(m.get("map") or "")
                if kind not in MARK_KINDS or not MAP_ID_RE.match(mp):
                    raise ValueError
                loc = m.get("location_id")
                tag = m.get("tag", "other")
                if tag not in MARK_TAGS:
                    tag = "other"
                if loc is not None and (not isinstance(loc, str) or not loc.startswith(region + ":")):
                    problems.append(f"Mark {i + 1}: location {loc!r} is not in {region.title()} — removed.")
                    continue
                if loc is None and tag != "transition":
                    problems.append(f"Mark {i + 1}: no location chosen — removed.")
                    continue
                target = m.get("target_map")
                if target is not None and not (isinstance(target, str) and MAP_ID_RE.match(target)):
                    target = None
                out = {"id": str(m.get("id") or uuid.uuid4().hex[:10])[:24], "map": mp, "kind": kind, "tag": tag,
                       "location_id": loc, "label": str(m.get("label") or "")[:80], "note": str(m.get("note") or "")[:500],
                       "target_map": target, "unmatched": bool(loc and known_locations and loc not in known_locations),
                       "basis": m.get("basis") if m.get("basis") in ("builtin-v1",) else None}
                if kind == "point":
                    out.update(x=num(m["x"]), y=num(m["y"]))
                elif kind == "rect":
                    x, y, w, h = num(m["x"]), num(m["y"]), num(m["w"]), num(m["h"])
                    if w <= 0 or h <= 0:
                        raise ValueError
                    out.update(x=x, y=y, w=w, h=h)
                else:
                    pts = m.get("points")
                    if not isinstance(pts, list) or not 3 <= len(pts) <= 200:
                        raise ValueError
                    out["points"] = [[num(p[0]), num(p[1])] for p in pts]
                if out["id"] in seen:
                    out["id"] = uuid.uuid4().hex[:10]
                seen.add(out["id"])
                clean.append(out)
            except (ValueError, KeyError, TypeError, IndexError):
                problems.append(f"Mark {i + 1}: invalid shape or coordinates — removed.")
        return {"version": 1, "region": region, "marks": clean, "updated_at": utcnow()}, problems

    def save_layout(self, region: str, data: dict, known_locations: set[str]) -> dict:
        clean, problems = self.validate_layout(region, data, known_locations)
        self.store.put_document("map_layout", region, f"{region} map layout", clean)
        return {"layout": clean, "problems": problems}

    def draft(self, region: str) -> dict | None:
        doc = self.store.get_document("map_draft", region)
        return doc["data"] if doc else None

    def save_draft(self, region: str, data: dict) -> None:
        if region not in REGIONS:
            raise RegionMapError("Unknown region")
        if len(json.dumps(data)) > 2_000_000:
            raise RegionMapError("Draft too large")
        self.store.put_document("map_draft", region, f"{region} unfinished map edits", {**data, "saved_at": utcnow()})

    def clear_draft(self, region: str) -> None:
        self.store.delete_document("map_draft", region)


def wait_for(job: dict, timeout: float = 120.0) -> dict:
    """Test helper: block until a job finishes."""
    t0 = time.monotonic()
    while job["state"] == "running" and time.monotonic() - t0 < timeout:
        time.sleep(0.05)
    return job


__all__ = ["RegionMaps", "RegionMapError", "identify", "identify_bytes", "extract", "REGIONS", "GAMES"]
