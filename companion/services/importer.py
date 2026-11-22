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
import re
import shutil
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from typing import Callable

from ..config import Paths
from ..data.reference import REGIONS
from ..storage import utcnow

IMPORTER_VERSION = "dex-1"
GUIDE_PARSER_VERSION = "odt-1"

DUMP_PATTERNS = {
    "pokedex": re.compile(r"pokedex.*data.*\.zip$", re.I),
    "icons": re.compile(r"icons?dump.*\.zip$|monstericons.*\.zip$", re.I),
    "battle": re.compile(r"battle.*sprites?.*\.zip$", re.I),
    "items": re.compile(r"item.*sprite.*\.zip$", re.I),
}


class ImportError_(Exception):
    """Raised with a user-readable message."""


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# ---------------------------------------------------------------- detection
def detect_sources(folder: str | Path) -> dict:
    """Find dump zips and walkthrough .odt files in a user-chosen folder (2 levels deep)."""
    root = Path(folder).expanduser()
    if not root.exists() or not root.is_dir():
        raise ImportError_(f"Folder not found: {root}")
    found: dict = {"folder": str(root), "dumps": {}, "combined": [], "guides": {}}
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
    out: dict[str, zipfile.ZipFile] = {}
    for key, path in paths.items():
        out[key] = zipfile.ZipFile(path)
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
            "tiers": m.get("tiers", []), "obtainable_flag": m.get("obtainable"),
            "forms": [{"form_id": f.get("form_id"), "name": f.get("name"), "costume": f.get("is_costume"),
                       "released": f.get("is_released")} for f in m.get("forms", [])],
            "evolutions": evolutions, "prevo": prevo.get(sid), "base_species": base,
            "moves": moves, "locations": locs,
        }
    internal = [{"id": m["id"], "name": m["name"]} for m in monsters if m["id"] > 649]
    breeding_items = {}
    for i in items:
        if i["name"] in ("Everstone", "Power Weight", "Power Bracer", "Power Belt", "Power Lens",
                         "Power Band", "Power Anklet", "Destiny Knot"):
            breeding_items[i["name"]] = {"id": i["id"], "icon_id": i.get("icon_id"), "desc": i.get("desc")}
    return {"species": species, "internal_records": internal, "missing_move_meta": missing_moves,
            "breeding_items": breeding_items,
            "skills": [{"id": s["id"], "name": s["name"], "type": s["type"].lower(),
                        "category": s["skill_damage_type"], "power": s["base_power"],
                        "accuracy": s["base_accuracy"], "pp": s["base_pp"], "priority": s["priority"]}
                       for s in skills],
            "items_count": len(items), "item_names": {str(k): v["name"] for k, v in item_by_id.items()}}


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
        (dest / base).write_bytes(zf.read(info))
        n += 1
    return n


def build_sprite_manifest(icons_dir: Path, battle_dir: Path) -> dict:
    icons = {p.name for p in icons_dir.glob("*.png")} if icons_dir.exists() else set()
    battle = {p.name for p in battle_dir.glob("*.png")} if battle_dir.exists() else set()
    manifest = {}
    for sid in range(1, 650):
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
        manifest[sid] = {k: v for k, v in entry.items() if v}
    return manifest


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
    for key, zf in zips.items():
        src = found["dumps"].get(key)
        if src:
            manifest["sources"][key] = {"file": Path(src).name, "sha256": _sha256(Path(src).read_bytes())}
        else:
            manifest["sources"][key] = {"file": "(nested in combined archive)"}

    say("Reading Pokédex data…")
    pz = zips["pokedex"]
    names = {Path(n).name: n for n in pz.namelist()}
    try:
        monsters = json.loads(pz.read(names["monsters.json"]))
        skills = json.loads(pz.read(names["skills.json"]))
        items = json.loads(pz.read(names["items.json"]))
    except KeyError as exc:
        raise ImportError_(f"PokedexData.zip is missing {exc.args[0]}") from exc
    dex = normalise_dex(monsters, skills, items)
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
        wanted = {str(v["icon_id"]) + ".png" for v in dex["breeding_items"].values() if v.get("icon_id") is not None}
        manifest["counts"]["item_icons"] = _extract_pngs(zips["items"], "sprites/itemicons/", assets_tmp / "items",
                                                         lambda b: b in wanted)
    sprites = build_sprite_manifest(assets_tmp / "icons", assets_tmp / "battle")
    (tmp / "sprites.json").write_text(json.dumps(sprites), encoding="utf-8")
    manifest["counts"]["species_with_icon"] = sum(1 for v in sprites.values() if "icon" in v)
    manifest["counts"]["species_with_front"] = sum(1 for v in sprites.values() if "front" in v)
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
