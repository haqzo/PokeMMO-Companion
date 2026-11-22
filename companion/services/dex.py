"""Pokédex repository: bundled public species index + optional private dump import.

Field provenance (docs/research/phase-3/02):
  * name / number / types / generation → bundled public facts (CORROBORATED)
  * everything else → user's imported dump (DUMP_ONLY: extraction date unknown)
Missing data is reported as unavailable, never invented.
"""
from __future__ import annotations

import json
import threading

from ..config import BUNDLED_DATA_DIR, Paths
from ..data import reference as ref

# Golden-case overlays from official changelogs (patch-aware; never mutate the dump).
OVERLAYS = {
    108: [{"field": "catch_rate", "value": 75, "source": "Official changelog 30/10/2026",
           "url": "https://forums.pokemmo.com/index.php?/topic/201356-changelog-30102026/",
           "note": "Lickitung catch rate 45 → 75. Dump value matches."}],
}

# Special acquisition classes that must never be shown as ordinary wild spawns.
SPECIAL_ACQUISITION = {
    144: "Monthly roamer (Kanto) — see Live › Legendaries", 145: "Monthly roamer (Kanto) — see Live › Legendaries",
    146: "Monthly roamer (Kanto) — see Live › Legendaries", 243: "Monthly roamer (Johto) — see Live › Legendaries",
    244: "Monthly roamer (Johto) — see Live › Legendaries", 245: "Monthly roamer (Johto) — see Live › Legendaries",
    644: "Unova storyline encounter (temporary) — not a permanent wild spawn",
    643: "Storyline-related legendary — acquisition class unverified",
}


class DexService:
    def __init__(self, paths: Paths):
        self.paths = paths
        self._lock = threading.Lock()
        idx = json.loads((BUNDLED_DATA_DIR / "species_index.json").read_text(encoding="utf-8"))
        self.index_meta = {k: v for k, v in idx.items() if k != "species"}
        self.index = {s["id"]: s for s in idx["species"]}
        self.reload()

    # ------------------------------------------------------------ loading
    def reload(self) -> None:
        with self._lock:
            self.species: dict[int, dict] = {}
            self.extras: dict = {}
            self.sprites: dict[int, dict] = {}
            self.manifest: dict | None = None
            d = self.paths.dex_dir
            try:
                if (d / "manifest.json").exists():
                    self.manifest = json.loads((d / "manifest.json").read_text(encoding="utf-8"))
                    self.species = {int(k): v for k, v in
                                    json.loads((d / "species.json").read_text(encoding="utf-8")).items()}
                    self.extras = json.loads((d / "extras.json").read_text(encoding="utf-8"))
                    self.sprites = {int(k): v for k, v in
                                    json.loads((d / "sprites.json").read_text(encoding="utf-8")).items()}
            except (OSError, ValueError) as exc:  # corrupt import → behave as not imported
                self.manifest = {"error": f"Imported data could not be read: {exc}"}
                self.species, self.extras, self.sprites = {}, {}, {}
            self._egg_index: dict[str, list[int]] = {}
            for sid, sp in self.species.items():
                for g in sp.get("egg_groups", []):
                    self._egg_index.setdefault(g, []).append(sid)

    @property
    def imported(self) -> bool:
        return bool(self.species)

    def status(self) -> dict:
        return {"imported": self.imported, "manifest": self.manifest, "index": self.index_meta,
                "species_total": len(self.index)}

    # ------------------------------------------------------------ helpers
    def sprite_url(self, sid: int, kind: str = "icon") -> str | None:
        f = self.sprites.get(sid, {}).get(kind)
        if not f:
            return None
        folder = "icons" if kind.startswith("icon") else "battle"
        return f"/assets/private/{folder}/{f}"

    def name(self, sid: int) -> str:
        return self.index.get(sid, {}).get("name", f"#{sid:03d}")

    def find_by_name(self, name: str) -> int | None:
        n = name.strip().lower()
        for sid, s in self.index.items():
            if s["name"].lower() == n:
                return sid
        return None

    def _availability(self, sid: int, sp: dict | None) -> dict:
        if sid in SPECIAL_ACQUISITION:
            return {"kind": "special", "label": SPECIAL_ACQUISITION[sid]}
        if not sp:
            return {"kind": "unknown", "label": "Import data to see"}
        if sp.get("locations"):
            regions = sorted({l["region"] for l in sp["locations"]})
            return {"kind": "wild", "label": "Wild (dump)", "regions": regions}
        if sp.get("prevo"):
            return {"kind": "evolution", "label": "Evolve / breed"}
        return {"kind": "unknown", "label": "No wild rows in dump"}

    # ------------------------------------------------------------ queries
    def summaries(self, favourites: set[int]) -> list[dict]:
        out = []
        for sid, base in self.index.items():
            sp = self.species.get(sid)
            entry = {"id": sid, "name": base["name"], "types": base["types"], "gen": base["gen"],
                     "fav": sid in favourites, "icon": self.sprite_url(sid, "icon"),
                     "availability": self._availability(sid, sp)}
            if sp:
                regions = sorted({l["region"] for l in sp["locations"]})
                entry.update({
                    "regions": regions,
                    "methods": sorted({l["method"] for l in sp["locations"]}),
                    "horde": any(l["horde3"] or l["horde5"] for l in sp["locations"]),
                    "horde5": any(l["horde5"] for l in sp["locations"]),
                    "egg_groups": sp["egg_groups"],
                    "abilities": [a["name"] for a in sp["abilities"]],
                    "bst": sum(sp["stats"].values()) if sp.get("stats") else None,
                    "seasons": sorted({l["season"] for l in sp["locations"] if l.get("season")}),
                    "ev": {ref.EV_KEYS[k]: v for k, v in sp["yields"].items() if k in ref.EV_KEYS and v},
                    "gender_code": sp["gender_code"],
                })
            out.append(entry)
        return out

    def detail(self, sid: int, favourites: set[int], note: str | None) -> dict | None:
        base = self.index.get(sid)
        if not base:
            return None
        sp = self.species.get(sid)
        result = {"id": sid, "name": base["name"], "types": base["types"], "gen": base["gen"],
                  "fav": sid in favourites, "note": note, "imported": sp is not None,
                  "sprites": {k: self.sprite_url(sid, k) for k in
                              ("icon", "icon_f", "icon_shiny", "front", "front_f", "front_shiny")},
                  "availability": self._availability(sid, sp),
                  "provenance": {"basic": "Bundled public species facts",
                                 "detail": ("Your imported PokeMMO dump (DUMP_ONLY — extraction date unknown)"
                                            if sp else "Not imported")},
                  "overlays": OVERLAYS.get(sid, [])}
        if not sp:
            return result
        stats = sp.get("stats", {})
        result.update({
            "stats": {k: stats.get(k) for k in ref.STATS}, "bst": sum(stats.values()) if stats else None,
            "abilities": sp["abilities"], "catch_rate": sp["catch_rate"],
            "gender": {"code": sp["gender_code"], "label": ref.GENDER_CODES.get(sp["gender_code"],
                                                                                f"Code {sp['gender_code']} (unmapped)")},
            "height_m": (sp["height_dm"] or 0) / 10, "weight_kg": (sp["weight_hg"] or 0) / 10,
            "egg_groups": sp["egg_groups"], "growth": sp["growth"],
            "ev_yield": {ref.EV_KEYS[k]: v for k, v in sp["yields"].items() if k in ref.EV_KEYS and v},
            "exp_yield": sp["yields"].get("exp"), "held_items": sp["held_items"], "tiers": sp["tiers"],
            "obtainable_flag": sp["obtainable_flag"], "types_raw_duplicated": sp["types_raw_duplicated"],
            "forms": sp["forms"], "moves": sp["moves"], "locations": sp["locations"],
            "evolution_chain": self.evolution_chain(sid),
        })
        return result

    def evolution_chain(self, sid: int) -> list[dict]:
        sp = self.species.get(sid)
        if not sp:
            return []
        root = sp.get("base_species") or sid
        out: list[dict] = []

        def walk(node: int, depth: int, via: dict | None) -> None:
            n = self.species.get(node)
            if not n or depth > 4:
                return
            out.append({"id": node, "name": n["name"], "depth": depth, "via": via, "icon": self.sprite_url(node)})
            for e in n.get("evolutions", []):
                if 1 <= e["to"] <= 649:
                    walk(e["to"], depth + 1, {"method": e["method"], "value": e["value"], "item": e["item"]})
        walk(root, 0, None)
        return out

    def egg_group_members(self, group: str) -> list[int]:
        return self._egg_index.get(group, [])

    def skills(self) -> list[dict]:
        return self.extras.get("skills", [])
