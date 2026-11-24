"""Player themes (2026-11-24): six built-in presets + personal themes, one versioned, validated JSON format.

A theme is data only: colours (#rrggbb or #rrggbbaa), a few numbers and choices. It can never carry scripts,
CSS, URLs or file paths — every value is checked against a fixed list of keys and a strict pattern, unknown keys
are dropped (and reported), numbers are clamped. Built-in presets live in companion/data/themes.json and cannot
be changed or deleted, so they are always recoverable.
"""
from __future__ import annotations

import json
import re
import uuid

from ..config import BUNDLED_DATA_DIR
from ..storage import utcnow

FORMAT = "pokemmo-companion-theme"
VERSION = 1
KIND = "theme"
MAX_THEMES = 100
_HEX = re.compile(r"^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$")
_NAME = re.compile(r"^[^<>{}\\`$]{1,40}$")
TYPES = ("normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground", "flying", "psychic",
         "bug", "rock", "ghost", "dragon", "dark", "steel")
CHOICES = {"density": ("compact", "standard", "comfortable"), "table_density": ("compact", "standard", "comfortable"),
           "scrollbar": ("hidden", "thin", "standard", "wide"),
           "font_weight": ("light", "normal", "medium")}
NUMBERS = {"radius": (0, 20), "border_width": (0, 3), "border_opacity": (0, 100), "card_padding": (6, 28), "grid_gap": (4, 24),
           "section_gap": (6, 32), "sidebar_width": (150, 300)}


class ThemeError(ValueError):
    pass


def catalog() -> dict:
    return json.loads((BUNDLED_DATA_DIR / "themes.json").read_text(encoding="utf-8"))


def validate(raw: dict, strict: bool = False) -> tuple[dict, list[str]]:
    """Return (clean theme, dropped keys). Raises ThemeError for things that cannot be a theme."""
    cat = catalog()
    if not isinstance(raw, dict):
        raise ThemeError("A theme must be a JSON object")
    if raw.get("format", FORMAT) != FORMAT:
        raise ThemeError("Not a PokeMMO Companion theme")
    if int(raw.get("version", 1) or 1) > VERSION:
        raise ThemeError("This theme was made by a newer Companion version")
    dropped: list[str] = []
    base = raw.get("base") if raw.get("base") in cat["presets"] else cat["default"]
    name = str(raw.get("name") or cat["presets"][base]["name"]).strip()
    if not _NAME.match(name):
        raise ThemeError("Theme names are 1–40 characters without < > { } ` $ or \\")
    out = {"format": FORMAT, "version": VERSION, "name": name, "base": base, "colors": {}, "types": {}, "shape": {}, "layout": {}}
    for section, allowed in (("colors", set(cat["color_keys"])), ("types", set(TYPES))):
        val = raw.get(section)
        val = {} if val is None else val
        if not isinstance(val, dict):
            raise ThemeError(f"{section} must be an object")
        for k, v in val.items():
            if k in allowed and isinstance(v, str) and _HEX.match(v.strip()):
                out[section][k] = v.strip().lower()
            elif k in allowed:
                if strict:
                    raise ThemeError(f"{section}.{k}: '{str(v)[:20]}' is not a colour like #1e1e2e")
                dropped.append(f"{section}.{k}")
            else:
                dropped.append(f"{section}.{str(k)[:30]}")
    for section, defaults in (("shape", cat["shape_defaults"]), ("layout", cat["layout_defaults"])):
        val = raw.get(section)
        val = {} if val is None else val
        if not isinstance(val, dict):
            raise ThemeError(f"{section} must be an object")
        for k, v in val.items():
            if k not in defaults:
                dropped.append(f"{section}.{str(k)[:30]}")
            elif k in CHOICES:
                if v in CHOICES[k]:
                    out[section][k] = v
                else:
                    dropped.append(f"{section}.{k}")
            elif k == "border_visible":
                out[section][k] = bool(v)
            elif k in NUMBERS and isinstance(v, (int, float)) and not isinstance(v, bool):
                lo, hi = NUMBERS[k]
                out[section][k] = int(min(hi, max(lo, v)))
            else:
                dropped.append(f"{section}.{k}")
    for k in raw:
        if k not in ("format", "version", "name", "base", "colors", "types", "shape", "layout", "id", "exported_at"):
            dropped.append(str(k)[:30])
    return out, dropped


class ThemeStore:
    def __init__(self, storage):
        self.db = storage

    def list(self) -> list[dict]:
        out = []
        for d in self.db.list_documents(KIND):
            doc = self.db.get_document(KIND, d["id"])
            if doc and isinstance(doc.get("data"), dict):
                out.append({"id": d["id"], **doc["data"], "updated_at": doc.get("updated_at")})
        return sorted(out, key=lambda t: t["name"].lower())

    def save(self, raw: dict, tid: str | None = None) -> dict:
        clean, dropped = validate(raw)
        if tid is None and len(self.db.list_documents(KIND)) >= MAX_THEMES:
            raise ThemeError(f"At most {MAX_THEMES} personal themes")
        tid = tid or uuid.uuid4().hex[:12]
        if not re.fullmatch(r"[0-9a-f]{12}", tid):
            raise ThemeError("Unknown theme")
        self.db.put_document(KIND, tid, clean["name"], clean)
        return {"id": tid, **clean, "dropped": dropped, "saved_at": utcnow()}

    def delete(self, tid: str) -> bool:
        return bool(self.db.delete_document(KIND, tid))
