"""Item Library: catalog built from the user's own locally installed PokeMMO dump.

Nothing here is bundled. The catalog is written to the private data folder by the importer and
read back by ItemService. Item metadata (name, description, icon id, region code) comes from the
dump's items.json; links (held by wild Pokémon, used for evolution) are made only through item IDs
present in the same dump. Categories are *inferred* from name/description patterns and labelled so.
Owned quantity and favourites are entered by the user; the Companion never reads the game inventory.
"""
from __future__ import annotations

import json
import re
import threading

from ..config import Paths
from ..storage import Storage, utcnow

CATALOG_VERSION = 1
CATEGORIES = [
    ("balls", "Poké Balls"), ("medicine", "Medicine"), ("berries", "Berries"), ("hold", "Hold items"),
    ("tms", "TMs & HMs"), ("evolution", "Evolution"), ("breeding", "Breeding"), ("training", "Training"),
    ("battle", "Battle items"), ("field", "Field & lures"), ("farming", "Seeds & farming"), ("fossils", "Fossils"),
    ("rewards", "Event rewards & boxes"), ("cosmetics", "Cosmetics & effects"), ("mail", "Mail"), ("key", "Key items"),
    ("other", "Other"), ("placeholder", "Placeholder records"),
]
CATEGORY_LABELS = dict(CATEGORIES)
BREEDING_NAMES = {"Everstone", "Power Weight", "Power Bracer", "Power Belt", "Power Lens", "Power Band", "Power Anklet",
                  "Destiny Knot"}
KEY_HINTS = re.compile(r"\b(letter|ticket|pass|key|card|case|rod|bike|bicycle|map|radar|scope|flute|machine part|"
                       r"parcel|tea|journal|vs\.? seeker|coin case|town map|itemfinder|dowsing|sprayduck|wailmer pail)\b", re.I)
MEDICINE = re.compile(r"restores? (the )?(hp|pp)|heals?|cures?|revives?|status condition|faint", re.I)
TRAINING = re.compile(r"raises the base|lowers the base|base .* stat|ev(s)?\b|effort|nature of a pok|modifies the nature|"
                      r"raises? .* level|level of a pok|rare candy|ability capsule|hidden ability", re.I)
HOLD = re.compile(r"to be held|held by|holder|hold item|if held|when held", re.I)


def _norm(t: str | None) -> str:
    return re.sub(r"\s+", " ", (t or "").replace("\\n", " ")).strip().lower()


def categorize(item: dict, evolution_ids: set[int]) -> tuple[str, str]:
    """Return (category, basis). Basis explains which rule matched (shown in the UI)."""
    name = item.get("name") or ""
    desc = item.get("desc") or ""
    if name in ("???", "Unknown Item", "") or name.upper().startswith("DEBUG"):
        return "placeholder", "name is a placeholder"
    if re.match(r"^(TM|HM)\b", name):
        return "tms", "name starts with TM/HM"
    if name.endswith(" Ball") or "poké ball" in desc.lower() and "ball" in name.lower():
        return "balls", "name ends with “Ball”"
    if name.endswith(" Berry"):
        return "berries", "name ends with “Berry”"
    if name.endswith(" Mail"):
        return "mail", "name ends with “Mail”"
    low = desc.lower()
    if "cosmetic item" in low or re.search(r"\bdye\b", name, re.I) or "assign this particle" in low or "particle effect" in name.lower():
        return "cosmetics", "description says cosmetic / dye / particle effect"
    if re.search(r"unknown reward|contains an unknown|use to open", low) or re.search(r"\((19|20)\d\d\)$", name):
        return "rewards", "description mentions an unknown reward / dated event item"
    if "fossil" in name.lower():
        return "fossils", "name contains “Fossil”"
    if re.search(r"\bseed\b|planted|apricorn|berry pots|mulch|watering", name + " " + low, re.I):
        return "farming", "name/description mentions seeds or planting"
    if name in BREEDING_NAMES:
        return "breeding", "known breeding item"
    if item.get("id") in evolution_ids:
        return "evolution", "used by an evolution in your dump"
    if name.endswith(" Stone") and "evolve" in desc.lower():
        return "evolution", "evolution stone description"
    if TRAINING.search(desc) or TRAINING.search(name):
        return "training", "description mentions stats / EVs / nature / level"
    if re.search(r"in battle|during (a )?battle", low) and not HOLD.search(desc):
        return "battle", "description mentions use in battle"
    if re.search(r"\blure\b|repel|ocarina|summons a pok|explorer kit|escape rope|outside of a battle", name + " " + low, re.I):
        return "field", "description mentions use outside battle / lures"
    if MEDICINE.search(desc):
        return "medicine", "description mentions restoring / healing"
    if HOLD.search(desc):
        return "hold", "description mentions holding"
    if KEY_HINTS.search(name):
        return "key", "name looks like a key item"
    return "other", "no rule matched"


def build_catalog(items: list[dict], species: dict, icon_files: set[str], strings: dict[str, dict[int, str]]) -> dict:
    """Group the dump's item records into logical items without dropping any source ID."""
    evolution_ids: set[int] = set()
    used_for: dict[int, list[dict]] = {}
    held_by: dict[int, list[int]] = {}
    for sid, sp in species.items():
        sid = int(sid)
        for e in sp.get("evolutions", []):
            if "ITEM" in (e.get("method") or "") and isinstance(e.get("value"), int):
                evolution_ids.add(e["value"])
                used_for.setdefault(e["value"], []).append({"from": sid, "to": e["to"], "method": e["method"]})
        for iid in sp.get("held_item_ids", []):
            held_by.setdefault(iid, []).append(sid)
    groups: dict[tuple, dict] = {}
    stats = {"records": len(items), "with_icon": 0, "missing_icon": 0}
    for it in sorted(items, key=lambda x: x.get("id", 0)):
        if not isinstance(it.get("id"), int):
            continue
        icon = f"{it.get('icon_id')}.png"
        has_icon = icon in icon_files
        stats["with_icon" if has_icon else "missing_icon"] += 1
        key = (_norm(it.get("name")), _norm(it.get("desc")))
        g = groups.get(key)
        if not g:
            cat, basis = categorize(it, evolution_ids)
            g = groups[key] = {"id": it["id"], "name": it.get("name") or f"Item {it['id']}", "desc": (it.get("desc") or "").replace("\\n", "\n"),
                               "category": cat, "category_basis": basis, "icon": icon if has_icon else None,
                               "records": [], "names": {}, "descs": {}}
        g["records"].append({"id": it["id"], "region_code": it.get("region_id"), "icon_id": it.get("icon_id"), "has_icon": has_icon})
        if not g["icon"] and has_icon:
            g["icon"] = icon
        for lang, table in strings.items():
            n = table.get(it.get("name_string_id"))
            d = table.get(it.get("desc_string_id"))
            if n and lang not in g["names"]:
                g["names"][lang] = n
            if d and lang not in g["descs"]:
                g["descs"][lang] = d
        ids = {r["id"] for r in g["records"]}
        g["held_by"] = sorted({s for i in ids for s in held_by.get(i, [])})
        g["evolution_uses"] = [u for i in sorted(ids) for u in used_for.get(i, [])]
        if g["evolution_uses"] and g["category"] in ("other", "hold", "key"):
            g["category"], g["category_basis"] = "evolution", "used by an evolution in your dump"
    out = sorted(groups.values(), key=lambda g: (g["name"].lower(), g["id"]))
    tm = re.compile(r"^(TM|HM)\s*[-–]?\s*(.+)$")
    for g in out:
        m = tm.match(g["name"])
        g["move_name"] = m.group(2).strip() if m and g["category"] == "tms" else None
    return {"version": CATALOG_VERSION, "built_at": utcnow(), "groups": out, "stats": stats,
            "langs": sorted(strings), "note": "Categories are inferred from names/descriptions; links come only from item IDs in your dump."}


class ItemService:
    def __init__(self, paths: Paths, storage: Storage):
        self.paths, self.storage = paths, storage
        self._lock = threading.Lock()
        self.reload()

    def reload(self) -> None:
        with self._lock:
            self.catalog: dict | None = None
            self.by_id: dict[int, dict] = {}
            f = self.paths.dex_dir / "items.json"
            try:
                if f.exists():
                    self.catalog = json.loads(f.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                self.catalog = None
            if not self.catalog:
                from .dex import load_bundled_items
                self.catalog = load_bundled_items()
            self.machine_items: dict[str, list[dict]] = {}
            for g in (self.catalog or {}).get("groups", []):
                for r in g["records"]:
                    self.by_id[r["id"]] = g
                # "TM - Focus Punch" / "HM - Cut" items in your client (used to read the client's "TM??" move method)
                kind = g["name"][:2] if g["name"].startswith(("TM - ", "HM - ")) else None
                if kind and g.get("move_name"):
                    self.machine_items.setdefault(g["move_name"].lower(), []).append({"kind": kind, "item_id": g["id"], "name": g["name"]})

    def machines(self, move_name: str) -> list[dict]:
        return self.machine_items.get((move_name or "").lower(), []) if self.catalog else []

    @property
    def available(self) -> bool:
        return bool(self.catalog)

    def _user(self) -> dict[int, dict]:
        return {r["item_id"]: r for r in self.storage.query("SELECT * FROM item_user")}

    @staticmethod
    def icon_url(g: dict) -> str | None:
        return f"/assets/private/items/{g['icon']}" if g.get("icon") else None

    def label(self, g: dict, lang: str) -> str:
        return g.get("names", {}).get(lang) or g["name"]

    def listing(self, lang: str = "en") -> dict:
        if not self.catalog:
            return {"available": False, "items": [], "categories": CATEGORIES,
                    "reason": "Install (or re-install) your PokeMMO data to build the Item Library from your own dump."}
        user = self._user()
        out = []
        for g in self.catalog["groups"]:
            u = user.get(g["id"]) or {}
            out.append({"id": g["id"], "name": g["name"], "label": self.label(g, lang), "category": g["category"],
                        "icon": self.icon_url(g), "records": len(g["records"]), "fav": bool(u.get("favourite")),
                        "qty": u.get("owned_qty"), "held": len(g.get("held_by", [])), "evo": len(g.get("evolution_uses", [])),
                        "translated": lang in g.get("names", {}),
                        "search": " ".join([g["name"], *g.get("names", {}).values(), g.get("move_name") or ""]).lower()})
        counts: dict[str, int] = {}
        for g in out:
            counts[g["category"]] = counts.get(g["category"], 0) + 1
        return {"available": True, "items": out, "categories": CATEGORIES, "counts": counts, "stats": self.catalog["stats"],
                "langs": self.catalog.get("langs", []), "built_at": self.catalog.get("built_at"), "note": self.catalog.get("note")}

    def detail(self, item_id: int, dex, lang: str = "en") -> dict | None:
        g = self.by_id.get(item_id)
        if not g:
            return None
        u = self._user().get(g["id"]) or {}
        held = [{"id": s, "name": dex.name(s), "icon": dex.sprite_url(s)} for s in g.get("held_by", [])]
        evo = [{**e, "from_name": dex.name(e["from"]), "to_name": dex.name(e["to"]), "icon": dex.sprite_url(e["to"])}
               for e in g.get("evolution_uses", [])]
        move = None
        if g.get("move_name"):
            mv = next((s for s in dex.skills() if s["name"].lower() == g["move_name"].lower()), None)
            move = mv
        return {**{k: v for k, v in g.items() if k not in ("held_by", "evolution_uses")}, "icon": self.icon_url(g),
                "label": self.label(g, lang), "desc_local": g.get("descs", {}).get(lang),
                "category_label": CATEGORY_LABELS.get(g["category"], g["category"]), "fav": bool(u.get("favourite")),
                "qty": u.get("owned_qty"), "user_updated_at": u.get("updated_at"), "held_by": held, "evolution_uses": evo,
                "move": move, "breeding": g["name"] in BREEDING_NAMES,
                "provenance": "Your installed PokeMMO dump (DUMP_ONLY). Region codes are the dump's raw values."}

    def set_user(self, item_id: int, favourite: bool | None = None, qty: int | None | str = "keep") -> dict:
        g = self.by_id.get(item_id)
        if not g:
            raise KeyError(item_id)
        cur = self._user().get(g["id"]) or {"favourite": 0, "owned_qty": None}
        fav = cur["favourite"] if favourite is None else int(bool(favourite))
        q = cur["owned_qty"] if qty == "keep" else qty
        if q is not None:
            q = int(q)
            if q < 0 or q > 999_999:
                raise ValueError("Quantity must be between 0 and 999999")
        self.storage.execute("INSERT INTO item_user(item_id, favourite, owned_qty, updated_at) VALUES(?,?,?,?) "
                             "ON CONFLICT(item_id) DO UPDATE SET favourite=excluded.favourite, owned_qty=excluded.owned_qty, "
                             "updated_at=excluded.updated_at", (g["id"], fav, q, utcnow()))
        return {"id": g["id"], "fav": bool(fav), "qty": q}
