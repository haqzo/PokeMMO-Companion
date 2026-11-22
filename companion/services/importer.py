"""Private local import of the user's own PokeMMO dumps and walkthrough files.

* Reads ONLY files/folders the user selects. Output goes to the per-user data
  directory (``private/``), never to the repository, never uploaded.
* The original archives are opened read-only and never modified.
* Every imported dataset is versioned with a manifest (source file names,
  SHA-256, import time, counts) so provenance is visible in the UI.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import re
import shutil
import time
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from typing import Callable

from ..config import Paths
from ..data.reference import REGIONS
from ..storage import utcnow

IMPORTER_VERSION = "dex-2"  # dex-2: full item catalog + icons, held/evolution item ids, client strings, dump date
GUIDE_PARSER_VERSION = "odt-1"

DUMP_PATTERNS = {
    "pokedex": re.compile(r"pokedex.*data.*\.zip$", re.I),
    "icons": re.compile(r"icons?dump.*\.zip$|monstericons.*\.zip$", re.I),
    "battle": re.compile(r"battle.*sprites?.*\.zip$", re.I),
    "items": re.compile(r"item.*sprite.*\.zip$", re.I),
    "strings": re.compile(r"xml.?strings.*\.zip$", re.I),
}
STRING_LANGS = ("es", "zh")  # client string tables used for Spanish / Chinese game labels (English is the item record itself)
ICON_NAME = re.compile(r"^-?\d{1,6}\.png$")
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


class ImportError_(Exception):
    """Raised with a user-readable message."""


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# ---------------------------------------------------------------- detection
class _DirInfo:
    def __init__(self, filename: str, path: Path):
        self.filename, self.path = filename, path


class DirArchive:
    """Read-only ZipFile look-alike over an unpacked dump folder (e.g. the client's own dump output)."""

    def __init__(self, root: Path, prefixes: tuple[str, ...]):
        self.root = root
        self._infos: list[_DirInfo] = []
        for pre in prefixes:
            base = root / pre
            if base.is_dir():
                for f in sorted(base.rglob("*")):
                    if f.is_file():
                        self._infos.append(_DirInfo(f.relative_to(root).as_posix(), f))

    def infolist(self) -> list[_DirInfo]:
        return self._infos

    def namelist(self) -> list[str]:
        return [i.filename for i in self._infos]

    def read(self, item) -> bytes:
        if isinstance(item, _DirInfo):
            return item.path.read_bytes()
        for i in self._infos:
            if i.filename == item:
                return i.path.read_bytes()
        raise KeyError(item)


DIR_PARTS = {"pokedex": ("info",), "icons": ("sprites/monstericons",), "battle": ("sprites/battlesprites",),
             "items": ("sprites/itemicons",), "strings": ("strings",)}


def _detect_dir_form(root: Path, found: dict) -> None:
    if (root / "info" / "monsters.json").is_file():
        found["dumps"].setdefault("pokedex", str(root))
    for key in ("icons", "battle", "items"):
        if (root / DIR_PARTS[key][0]).is_dir():
            found["dumps"].setdefault(key, str(root))
    if (root / "strings" / "dump_strings_en.xml").is_file():
        found["dumps"].setdefault("strings", str(root))


def detect_sources(folder: str | Path) -> dict:
    """Find dump zips and walkthrough .odt files in a user-chosen folder (2 levels deep)."""
    root = Path(folder).expanduser()
    if not root.exists() or not root.is_dir():
        raise ImportError_(f"Folder not found: {root}")
    found: dict = {"folder": str(root), "dumps": {}, "combined": [], "guides": {}}
    _detect_dir_form(root, found)
    for sub in sorted(p for p in root.glob("*") if p.is_dir()):
        _detect_dir_form(sub, found)
    candidates = [p for p in root.glob("*") if p.is_file()] + [p for p in root.glob("*/*") if p.is_file()]
    for p in candidates:
        name = p.name
        if name.lower().endswith(".odt") and "walkthrough" in name.lower():
            for region in REGIONS:
                if region in name.lower():
                    found["guides"].setdefault(region, str(p))
            continue
        if not name.lower().endswith(".zip"):
            continue
        for key, rx in DUMP_PATTERNS.items():
            if rx.search(name):
                found["dumps"].setdefault(key, str(p))
                break
        else:
            if re.search(r"pokemmo.?dumps", name, re.I):
                found["combined"].append(str(p))
    return found


def _open_member_zips(paths: dict, combined: list[str]) -> dict[str, zipfile.ZipFile]:
    """Return {key: ZipFile}. Supports separate zips or one combined archive of nested zips."""
    out: dict = {}
    for key, path in paths.items():
        out[key] = DirArchive(Path(path), DIR_PARTS[key]) if Path(path).is_dir() else zipfile.ZipFile(path)
    for cpath in combined:
        outer = zipfile.ZipFile(cpath)
        for info in outer.infolist():
            for key, rx in DUMP_PATTERNS.items():
                if key not in out and rx.search(Path(info.filename).name):
                    out[key] = zipfile.ZipFile(io.BytesIO(outer.read(info)))
    return out


# --------------------------------------------------------------- normalise
def _norm_types(types: list[str]) -> list[str]:
    seen: list[str] = []
    for t in types:
        t = t.lower()
        if t not in seen:
            seen.append(t)
    return seen


_RATE_RX = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*%\s*$")


def classify_rate(value: str | None) -> dict:
    """Dump rarity strings are NOT all numbers (docs/research/phase-3/03 DUMP-013)."""
    if value is None:
        return {"kind": "missing", "label": "—"}
    v = str(value).strip()
    m = _RATE_RX.match(v)
    if m:
        return {"kind": "percent", "value": float(m.group(1)), "label": f"{m.group(1)}%"}
    mapping = {"Lure": ("lure", "Lure only"), "Special": ("special", "Special"),
               "???": ("unknown", "Unknown rate"), "--": ("none", "Not in this period")}
    if v in mapping:
        k, label = mapping[v]
        return {"kind": k, "label": label, "raw": v}
    return {"kind": "other", "label": v, "raw": v}


def _abilities(raw: list[dict]) -> list[dict]:
    """Dump stores 3 slots: [slot1, slot2, hidden]. '--' means no ability in that slot."""
    out = []
    for idx, a in enumerate(raw[:3]):
        name = a.get("name")
        if not name or name == "--":
            continue
        slot = "hidden" if idx == 2 else f"slot{idx + 1}"
        if idx == 1 and raw[0].get("id") == a.get("id"):
            continue  # slot2 repeats slot1 → species has a single regular ability
        out.append({"id": a.get("id"), "name": name, "slot": slot})
    return out


def normalise_dex(monsters: list[dict], skills: list[dict], items: list[dict]) -> dict:
    skill_by_id = {s["id"]: s for s in skills}
    item_by_id = {i["id"]: i for i in items}
    by_id = {m["id"]: m for m in monsters}
    prevo: dict[int, int] = {}
    for m in monsters:
        if 1 <= m["id"] <= 649:
            for e in m.get("evolutions", []):
                if 1 <= e["id"] <= 649 and e["id"] != m["id"]:
                    prevo.setdefault(e["id"], m["id"])

    missing_moves: dict[str, int] = {}
    species = {}
    for sid in range(1, 650):
        m = by_id.get(sid)
        if not m:
            continue
        moves = []
        for mv in m.get("moves", []):
            meta = skill_by_id.get(mv.get("id"))
            entry = {"id": mv.get("id"), "name": mv.get("name"), "method": mv.get("type"),
                     "level": mv.get("level")}
            if meta:
                entry.update({"type": meta["type"].lower(), "category": meta["skill_damage_type"],
                              "power": meta["base_power"], "accuracy": meta["base_accuracy"],
                              "pp": meta["base_pp"], "priority": meta["priority"], "verified_meta": True})
            else:
                entry["verified_meta"] = False
                missing_moves[mv.get("name") or str(mv.get("id"))] = missing_moves.get(mv.get("name"), 0) + 1
            moves.append(entry)
        locs = []
        for l in m.get("locations", []):
            locs.append({
                "region": (l.get("region_name") or "").lower(), "area": l.get("location_name_full") or l.get("location_name"),
                "location_id": l.get("location_id"), "method": l.get("type"), "min": l.get("min_level"),
                "max": l.get("max_level"), "season": l.get("season"), "horde3": bool(l.get("is_horde_3x")),
                "horde5": bool(l.get("is_horde_5x")), "flags": l.get("rarity_flags"),
                "morning": classify_rate(l.get("rarity_morning")), "day": classify_rate(l.get("rarity_day")),
                "night": classify_rate(l.get("rarity_night")),
            })
        evolutions = []
        for e in m.get("evolutions", []):
            evolutions.append({"to": e["id"], "to_name": e.get("name"), "method": e.get("type"),
                               "value": e.get("val"), "item": e.get("item_name")})
        base = sid
        guard = 0
        while base in prevo and guard < 5:
            base = prevo[base]
            guard += 1
        species[sid] = {
            "id": sid, "name": m["name"], "types": _norm_types(m.get("types", [])),
            "types_raw_duplicated": len(m.get("types", [])) == 2 and m["types"][0] == m["types"][1],
            "stats": m.get("stats", {}), "abilities": _abilities(m.get("abilities", [])),
            "catch_rate": m.get("catch_rate"), "gender_code": m.get("gender_ratio"),
            "height_dm": m.get("height"), "weight_hg": m.get("weight"),
            "egg_groups": m.get("egg_groups", []), "growth": m.get("exp_type_name"),
            "yields": m.get("yields", {}), "held_items": [h.get("name") for h in m.get("held_items", [])],
            "held_item_ids": [h.get("id") for h in m.get("held_items", []) if isinstance(h.get("id"), int)],
            "tiers": m.get("tiers", []), "obtainable_flag": m.get("obtainable"),
            "forms": [{"form_id": f.get("form_id"), "name": f.get("name"), "costume": f.get("is_costume"),
                       "released": f.get("is_released")} for f in m.get("forms", [])],
            "evolutions": evolutions, "prevo": prevo.get(sid), "base_species": base,
            "moves": moves, "locations": locs,
        }
    internal = [{"id": m["id"], "name": m["name"]} for m in monsters if m["id"] > 649]
    # Client form records (e.g. 650–667: Deoxys formes, Rotom appliances…). Kept so the bundled forms
    # manifest can be cross-checked against the user's own client; never redistributed.
    form_records = {}
    for m in monsters:
        if 649 < m["id"] < 1000:
            types = []
            for t in m.get("types", []):
                if t and t.lower() not in types:
                    types.append(t.lower())
            label = next((f.get("name") for mm in by_id.values() if mm["id"] <= 649 for f in mm.get("forms", []) if f.get("id") == m["id"]), None)
            abil = []
            for a in m.get("abilities", []):
                n = (a.get("name") or "").strip()
                if n and n != "--" and n not in abil:
                    abil.append(n)
            form_records[m["id"]] = {"name": m["name"], "types": types, "stats": m.get("stats") or {}, "form_label": label,
                                     "abilities": abil,
                                     "base_species": next((f_id for f_id, mm in by_id.items() if f_id <= 649 and any(
                                         f.get("id") == m["id"] for f in mm.get("forms", []))), None)}
    breeding_items = {}
    for i in items:
        if i["name"] in ("Everstone", "Power Weight", "Power Bracer", "Power Belt", "Power Lens",
                         "Power Band", "Power Anklet", "Destiny Knot"):
            breeding_items[i["name"]] = {"id": i["id"], "icon_id": i.get("icon_id"), "desc": i.get("desc")}
    return {"species": species, "internal_records": internal, "form_records": form_records, "missing_move_meta": missing_moves,
            "breeding_items": breeding_items,
            "skills": [{"id": s["id"], "name": s["name"], "type": s["type"].lower(),
                        "category": s["skill_damage_type"], "power": s["base_power"],
                        "accuracy": s["base_accuracy"], "pp": s["base_pp"], "priority": s["priority"]}
                       for s in skills],
            "items_count": len(items), "item_names": {str(k): v["name"] for k, v in item_by_id.items()}}


def _archive_date(zf) -> str | None:
    """Newest file timestamp inside the archive (YYYY-MM-DD) — the best available extraction date."""
    try:
        if isinstance(zf, DirArchive):
            ts = max((i.path.stat().st_mtime for i in zf.infolist()), default=0)
            return time.strftime("%Y-%m-%d", time.gmtime(ts)) if ts else None
        dt = max((i.date_time for i in zf.infolist()), default=None)
        return "%04d-%02d-%02d" % dt[:3] if dt and dt[0] > 1980 else None
    except (OSError, ValueError):
        return None


_STR_RX = re.compile(r'<string id="(\d+)"[^>]*>(.*?)</string>', re.S)


def read_client_strings(zf, langs: tuple[str, ...]) -> dict[str, dict[int, str]]:
    """Parse dump_strings_<lang>.xml into {lang: {string_id: text}} (only ids that differ from English)."""
    import html as _html
    names = {Path(n).name: n for n in zf.namelist()}
    def load(lang: str) -> dict[int, str]:
        n = names.get(f"dump_strings_{lang}.xml")
        if not n:
            return {}
        raw = zf.read(n).decode("utf-8", "replace")
        return {int(k): _html.unescape(v).replace("\\n", "\n") for k, v in _STR_RX.findall(raw)}
    en = load("en")
    out = {}
    for lang in langs:
        d = load(lang)
        diff = {k: v for k, v in d.items() if en.get(k) != v}
        if diff:
            out[lang] = diff
    return out


# ----------------------------------------------------------------- sprites
def _extract_pngs(zf: zipfile.ZipFile, prefix: str, dest: Path, keep: Callable[[str], bool]) -> int:
    dest.mkdir(parents=True, exist_ok=True)
    n = 0
    for info in zf.infolist():
        name = info.filename
        if not name.startswith(prefix) or not name.endswith(".png"):
            continue
        base = name[len(prefix):]
        if "/" in base or ".." in base or not keep(base):
            continue
        data = zf.read(info)
        if not data.startswith(PNG_MAGIC) or len(data) > 2_000_000:
            continue
        (dest / base).write_bytes(data)
        n += 1
    return n


def build_sprite_manifest(icons_dir: Path, battle_dir: Path) -> dict:
    icons = {p.name for p in icons_dir.glob("*.png")} if icons_dir.exists() else set()
    battle = {p.name for p in battle_dir.glob("*.png")} if battle_dir.exists() else set()
    manifest = {}
    for sid in list(range(1, 650)) + list(range(650, 1000)):
        def first(cands, pool):
            return next((c for c in cands if c in pool), None)
        entry = {
            "icon": first([f"{sid}-0.png", f"{sid}-0-m.png", f"{sid}-0-f.png"], icons),
            "icon_f": first([f"{sid}-0-f.png"], icons),
            "icon_shiny": first([f"{sid}-0-s.png", f"{sid}-0-m-s.png"], icons),
            "front": first([f"{sid}-front-n.png", f"{sid}-front-n-m.png", f"{sid}-front-n-f.png"], battle),
            "front_f": first([f"{sid}-front-n-f.png"], battle),
            "front_shiny": first([f"{sid}-front-s.png", f"{sid}-front-s-m.png", f"{sid}-front-s-f.png"], battle),
        }
        found = {k: v for k, v in entry.items() if v}
        if sid <= 649 or found:
            manifest[sid] = found
    return manifest


def fingerprint(path: str | Path, sub: str | None = None) -> str | None:
    """Cheap change detector (size + mtime), used to notice a newer dump without hashing it."""
    p = Path(path)
    try:
        if p.is_file():
            st = p.stat()
            return f"{st.st_size}:{int(st.st_mtime)}"
        target = p / sub if sub else p
        if target.exists():
            files = [f for f in target.rglob("*") if f.is_file()] if target.is_dir() else [target]
            return f"{len(files)}:{int(max((f.stat().st_mtime for f in files), default=0))}"
    except OSError:
        return None
    return None


def candidate_roots(home: Path | None = None) -> list[Path]:
    """Known, read-only places where a user's own PokeMMO dump may live. Nothing else is scanned."""
    h = Path(home) if home else Path.home()
    roots = [h / "Documents" / "PokeMMO-Companion", h / "Documents" / "PokeMMO-Companion" / "Pokemmo-Dumps",
             h / "Documents" / "Pokemmo-Dumps", h / "Downloads",
             h / ".var" / "app" / "com.pokemmo.PokeMMO" / "data" / "pokemmo-client-live",
             h / ".var" / "app" / "com.pokemmo.PokeMMO" / "data" / "pokemmo-client-live" / "dump",
             h / ".local" / "share" / "pokemmo-client-live", h / "PokeMMO", h / "Games" / "PokeMMO"]
    if sys.platform.startswith("win"):
        for env in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"):
            base = os.environ.get(env)
            if base:
                roots.append(Path(base) / "PokeMMO")
    return roots


def auto_detect(home: Path | None = None) -> list[dict]:
    out = []
    seen: set[str] = set()
    for root in candidate_roots(home):
        try:
            if not root.is_dir():
                continue
            found = detect_sources(root)
        except (ImportError_, OSError):
            continue
        if "pokedex" in found["dumps"] or found["combined"]:
            key = found["dumps"].get("pokedex") or found["combined"][0]
            if key in seen:
                continue
            seen.add(key)
            out.append({"folder": str(root), "pokedex": found["dumps"].get("pokedex"), "combined": found["combined"],
                        "parts": sorted(found["dumps"]), "guides": sorted(found["guides"]),
                        "fingerprint": fingerprint(key, "info" if Path(key).is_dir() else None)})
    return out


def data_status(paths: Paths, home: Path | None = None) -> dict:
    manifest = None
    mf = paths.dex_dir / "manifest.json"
    if mf.exists():
        try:
            manifest = json.loads(mf.read_text(encoding="utf-8"))
        except ValueError:
            manifest = None
    cands = auto_detect(home)
    update = None
    if manifest:
        src = manifest.get("sources", {}).get("pokedex", {})
        for c in cands:
            if src.get("path") and src.get("path") in (c.get("pokedex"), *(c.get("combined") or [])):
                if src.get("fingerprint") and c.get("fingerprint") and src["fingerprint"] != c["fingerprint"]:
                    update = c
    return {"installed": manifest is not None, "manifest": manifest, "candidates": cands, "update_available": update,
            "policy": "Read-only scan of known folders only. Installing copies what the Companion needs into its private "
                      "data folder on this computer; nothing is uploaded or committed."}



def sync_existing_import(paths: Paths, progress: Callable[[str], None] | None = None) -> dict:
    """Update an ALREADY installed private dump from its previously approved local source.

    Older Companion versions installed species/sprites but did not create the Item Library.
    Do not ask that user to re-import: rebuild the new catalog on startup from the original
    previously selected folder, if it is still present. Also follow updated local source
    files on later starts, without reading arbitrary paths or contacting external services.

    Never bundle source assets in Git; never modify original dump archives.
    """
    manifest_file = paths.dex_dir / "manifest.json"
    if not manifest_file.is_file():
        return {"state": "not-installed"}
    try:
        previous = json.loads(manifest_file.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"state": "invalid-manifest"}

    current_catalog = paths.dex_dir / "items.json"
    try:
        parsed_catalog = json.loads(current_catalog.read_text(encoding="utf-8"))
        needs_catalog = not isinstance(parsed_catalog, dict) or not isinstance(parsed_catalog.get("groups"), list)
    except (OSError, ValueError):
        needs_catalog = True
    sources = previous.get("sources") or {}
    if not isinstance(sources, dict):
        sources = {}
    original_folders: list[Path] = []
    if previous.get("folder"):
        original_folders.append(Path(previous["folder"]).expanduser())
    # Older manifests may contain the original archive path, but not the folder.
    for source in sources.values():
        if not isinstance(source, dict) or not source.get("path"):
            continue
        source_path = Path(source["path"]).expanduser()
        original_folders.append(source_path if source_path.is_dir() else source_path.parent)

    seen: set[str] = set()
    for folder in original_folders:
        if str(folder) in seen:
            continue
        seen.add(str(folder))
        if not folder.is_dir():
            continue
        try:
            found = detect_sources(folder)
        except (ImportError_, OSError):
            continue
        paths_by_kind = found.get("dumps") or {}
        if not paths_by_kind.get("pokedex") and not found.get("combined"):
            continue
        # A partial or moved source must not replace existing private icons/translations
        # with a smaller dataset during automatic refresh.
        previous_source_paths = [Path(src["path"]) for src in sources.values()
                                 if isinstance(src, dict) and src.get("path")]
        if any(not p.exists() for p in previous_source_paths):
            continue
        if not found.get("combined") and any(k not in paths_by_kind for k in sources):
            continue

        # Change detection uses the original source set; a new unrelated dump in some
        # other folder must never silently replace the previously installed source.
        changed = False
        for source_key, source in sources.items():
            if not isinstance(source, dict) or not source.get("path") or not source.get("fingerprint"):
                continue
            p = Path(source["path"])
            old_fp = source["fingerprint"]
            subdir = DIR_PARTS.get(source_key, ("info",))[0]
            new_fp = fingerprint(p, subdir if p.is_dir() else None)
            if new_fp is not None and new_fp != old_fp:
                changed = True
                break
        if not needs_catalog and not changed:
            return {"state": "current"}
        try:
            result = import_dumps(paths, folder=str(folder), progress=progress)
            return {"state": "synchronized", "reason": "missing item catalog" if needs_catalog else "local source changed",
                    "items": result.get("counts", {}).get("item_groups", 0)}
        except (ImportError_, OSError, ValueError, zipfile.BadZipFile) as exc:
            return {"state": "source-error", "reason": str(exc)}

    # No previous source available: leave the installed Pokémon data completely intact.
    return {"state": "source-unavailable" if needs_catalog else "current"}



# ------------------------------------------------------------------ entry
def import_dumps(paths: Paths, folder: str | None = None, explicit: dict | None = None,
                 progress: Callable[[str], None] | None = None) -> dict:
    say = progress or (lambda _m: None)
    found = detect_sources(folder) if folder else {"dumps": {}, "combined": [], "folder": None}
    if explicit:
        found["dumps"].update(explicit)
    zips = _open_member_zips(found["dumps"], found.get("combined", []))
    if "pokedex" not in zips:
        raise ImportError_("PokedexData.zip was not found in the selected folder. "
                           "Choose the folder that contains your PokeMMO dump zips.")
    manifest: dict = {"importer": IMPORTER_VERSION, "imported_at": utcnow(), "folder": found.get("folder"),
                      "sources": {}, "counts": {}, "notes": [
                          "Dump has no embedded game version or extraction date (DUMP-012): "
                          "all values are DUMP_ONLY until checked against the live game."]}
    for key in zips:
        src = found["dumps"].get(key)
        if src and Path(src).is_file():
            manifest["sources"][key] = {"file": Path(src).name, "path": str(Path(src).resolve()),
                                        "sha256": _sha256(Path(src).read_bytes()), "fingerprint": fingerprint(src)}
        elif src:
            manifest["sources"][key] = {"file": Path(src).name + "/ (folder)", "path": str(Path(src).resolve()),
                                        "fingerprint": fingerprint(src, DIR_PARTS[key][0])}
        else:
            comb = found.get("combined", [])
            manifest["sources"][key] = {"file": "(nested in combined archive)",
                                        "path": str(Path(comb[0]).resolve()) if comb else None,
                                        "fingerprint": fingerprint(comb[0]) if comb else None}

    say("Reading Pokédex data…")
    pz = zips["pokedex"]
    names = {Path(n).name: n for n in pz.namelist() if "/" not in n or n.split("/")[-2] == "info"}
    try:
        monsters = json.loads(pz.read(names["monsters.json"]))
        skills = json.loads(pz.read(names["skills.json"]))
        items = json.loads(pz.read(names["items.json"]))
    except KeyError as exc:
        raise ImportError_(f"PokedexData.zip is missing {exc.args[0]}") from exc
    dex = normalise_dex(monsters, skills, items)
    manifest["dump_date"] = _archive_date(pz)
    if manifest["dump_date"]:
        manifest["notes"] = [f"Dump files are dated {manifest['dump_date']} (newest file time in the archive); the dump "
                             "itself records no game version, so values stay DUMP_ONLY until checked against the live game."]
    manifest["counts"].update({"monster_records": len(monsters), "species": len(dex["species"]),
                               "internal_records": len(dex["internal_records"]), "skills": len(skills),
                               "items": len(items),
                               "location_rows": sum(len(s["locations"]) for s in dex["species"].values()),
                               "learnset_refs_missing_meta": sum(dex["missing_move_meta"].values())})

    tmp = paths.dex_dir.with_name("dex.tmp")
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir(parents=True)
    (tmp / "species.json").write_text(json.dumps(dex["species"], ensure_ascii=False), encoding="utf-8")
    (tmp / "extras.json").write_text(json.dumps({k: v for k, v in dex.items() if k != "species"},
                                                ensure_ascii=False), encoding="utf-8")

    assets_tmp = paths.assets_dir.with_name("assets.tmp")
    if assets_tmp.exists():
        shutil.rmtree(assets_tmp)
    assets_tmp.mkdir(parents=True)
    if "icons" in zips:
        say("Extracting Pokémon icons…")
        manifest["counts"]["icons"] = _extract_pngs(zips["icons"], "sprites/monstericons/", assets_tmp / "icons",
                                                    lambda b: b.split("-")[0].isdigit())
    if "battle" in zips:
        say("Extracting battle sprites (front only)…")
        manifest["counts"]["battle_sprites"] = _extract_pngs(
            zips["battle"], "sprites/battlesprites/", assets_tmp / "battle", lambda b: "-front-" in b)
    if "items" in zips:
        say("Extracting item icons…")
        manifest["counts"]["item_icons"] = _extract_pngs(zips["items"], "sprites/itemicons/", assets_tmp / "items",
                                                         lambda b: bool(ICON_NAME.match(b)) and b != "-1.png")
    strings = {}
    if "strings" in zips:
        say("Reading client string tables (item names in Spanish / Chinese)…")
        strings = read_client_strings(zips["strings"], STRING_LANGS)
        manifest["counts"]["string_langs"] = sorted(strings)
    say("Building the Item Library…")
    from .items import build_catalog
    icon_files = {p.name for p in (assets_tmp / "items").glob("*.png")} if (assets_tmp / "items").exists() else set()
    catalog = build_catalog(items, dex["species"], icon_files, strings)
    (tmp / "items.json").write_text(json.dumps(catalog, ensure_ascii=False), encoding="utf-8")
    manifest["counts"].update({"item_groups": len(catalog["groups"]), "items_with_icon": catalog["stats"]["with_icon"],
                               "items_missing_icon": catalog["stats"]["missing_icon"]})
    sprites = build_sprite_manifest(assets_tmp / "icons", assets_tmp / "battle")
    (tmp / "sprites.json").write_text(json.dumps(sprites), encoding="utf-8")
    manifest["counts"]["species_with_icon"] = sum(1 for k, v in sprites.items() if k <= 649 and "icon" in v)
    manifest["counts"]["species_with_front"] = sum(1 for k, v in sprites.items() if k <= 649 and "front" in v)
    manifest["counts"]["form_records_with_sprite"] = sum(1 for k, v in sprites.items() if k > 649 and "front" in v)
    (tmp / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")

    # Atomic-ish swap: keep previous import as .prev until the new one is in place.
    for live, new in ((paths.dex_dir, tmp), (paths.assets_dir, assets_tmp)):
        prev = live.with_name(live.name + ".prev")
        if prev.exists():
            shutil.rmtree(prev)
        if live.exists():
            live.rename(prev)
        new.rename(live)
        if prev.exists():
            shutil.rmtree(prev)
    say("Import complete.")
    return manifest


# ------------------------------------------------------------- walkthroughs
_NS = {"text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
       "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0"}
_T = "{%s}" % _NS["text"]


def _para_text(el: ET.Element) -> str:
    parts: list[str] = []

    def walk(node: ET.Element) -> None:
        if node.text:
            parts.append(node.text)
        for child in node:
            tag = child.tag
            if tag == _T + "s":
                parts.append(" " * int(child.get(_T + "c", "1")))
            elif tag in (_T + "tab",):
                parts.append(" ")
            elif tag == _T + "line-break":
                parts.append("\n")
            elif tag.startswith(_T) or tag.endswith("}a"):
                walk(child)
            # images/frames are ignored
            if child.tail:
                parts.append(child.tail)
    walk(el)
    return "".join(parts)


def _is_heading(text: str) -> bool:
    t = text.strip()
    return bool(t) and len(t) <= 48 and t == t.upper() and re.search(r"[A-Z]", t) is not None \
        and not t.endswith(".")


_SENT = re.compile(r"(?<=[.!?])\s*(?=[A-Z])")
_KIND_RULES = [
    ("gym", re.compile(r"gym leader|badge", re.I)),
    ("league", re.compile(r"elite four|champion", re.I)),
    ("item", re.compile(r"\bpick\b|\bget a\b|\bgive you\b|hidden", re.I)),
    ("battle", re.compile(r"\bfight\b|\bbeat\b|\bdefeat\b", re.I)),
]


def parse_walkthrough_odt(path: str | Path, region: str) -> dict:
    data = Path(path).read_bytes()
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        root = ET.fromstring(z.read("content.xml"))
    body = root.find("office:body/office:text", _NS)
    if body is None:
        raise ImportError_(f"{Path(path).name}: not a text document")
    paras = [_para_text(p) for p in body.iter() if p.tag in (_T + "p", _T + "h")]
    steps: list[dict] = []
    chapter = "Start"
    chapter_idx = 0
    para_in_chapter = 0
    seen_chapters: dict[str, int] = {}
    title_skipped = False
    lines = [ln for raw in paras for ln in raw.replace("\xa0", " ").split("\n")]
    for raw in lines:
        text = re.sub(r"[ \t]+", " ", raw).strip()
        if not text:
            continue
        if _is_heading(text):
            if not title_skipped and "WALKTHROUGH" in text:
                title_skipped = True
                continue
            seen_chapters[text] = seen_chapters.get(text, 0) + 1
            chapter = text.title().replace("Mt.", "Mt. ").replace("  ", " ")
            chapter_idx += 1
            para_in_chapter = 0
            continue
        sentences = [s.strip() for s in _SENT.split(text) if s.strip()]
        kinds = sorted({k for k, rx in _KIND_RULES if rx.search(text)})
        step_id = f"{region}:imp:{chapter_idx:03d}:{para_in_chapter:02d}"
        steps.append({"id": step_id, "region": region, "order": len(steps), "chapter": chapter,
                      "chapter_index": chapter_idx, "text": " ".join(sentences), "lines": sentences,
                      "kind": kinds[0] if kinds else "route", "tags": kinds, "mandatory": None,
                      "status": "imported-unverified",
                      "text_hash": hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]})
        para_in_chapter += 1
    return {"region": region, "file": Path(path).name, "sha256": _sha256(data), "parser": GUIDE_PARSER_VERSION,
            "imported_at": utcnow(), "chapters": chapter_idx, "steps": steps}


def import_guides(paths: Paths, folder: str | None = None, files: dict | None = None) -> dict:
    found = detect_sources(folder)["guides"] if folder else {}
    if files:
        found.update(files)
    if not found:
        raise ImportError_("No '<REGION> COMPLETE WALKTHROUGH.odt' files were found in that folder.")
    summary = {}
    for region, fpath in found.items():
        parsed = parse_walkthrough_odt(fpath, region)
        target = paths.guides_dir / f"{region}.json"
        tmp = target.with_suffix(".tmp")
        tmp.write_text(json.dumps(parsed, ensure_ascii=False), encoding="utf-8")
        tmp.replace(target)
        summary[region] = {"file": parsed["file"], "steps": len(parsed["steps"]), "chapters": parsed["chapters"]}
    return summary
