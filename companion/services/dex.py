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

CLASS_LABELS = {"wild": "Wild", "evolution_or_breeding": "Evolve / breed", "gift": "Gift", "fossil": "Fossil",
                "roaming": "Roamer", "raid": "Raid", "event_or_time_limited": "Event", "story_temporary": "Story (temporary)",
                "contested_temporary": "Contested", "unavailable": "Not in PokeMMO", "unknown": "Unverified"}
PROGRESS_LEVELS = ["unregistered", "seen", "owned", "caught_ot"]


class DexService:
    def __init__(self, paths: Paths):
        self.paths = paths
        self._lock = threading.Lock()
        idx = json.loads((BUNDLED_DATA_DIR / "species_index.json").read_text(encoding="utf-8"))
        self.index_meta = {k: v for k, v in idx.items() if k != "species"}
        self.index = {s["id"]: s for s in idx["species"]}
        self.registry = json.loads((BUNDLED_DATA_DIR / "pokemmo_availability.json").read_text(encoding="utf-8"))
        self.user_checks: dict[int, dict] = {}  # set by the app from storage (your dated in-game checks)
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
            # evolution families that contain at least one species with ordinary wild rows
            self._wild_family: set[int] = set()
            fam: dict[int, set[int]] = {}
            for sid, sp in self.species.items():
                fam.setdefault(sp.get("base_species") or sid, set()).add(sid)
            for members in fam.values():
                if any(self.species[m].get("locations") for m in members):
                    self._wild_family |= members

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

    def availability(self, sid: int) -> dict:
        """Combine authored registry, the user's own in-game checks and dump-derived classes.

        Precedence for the in-game-dex axis: your dated in-game check > authored registry >
        dump family reachability > unknown. Conflicts are reported, not hidden."""
        sp = self.species.get(sid)
        reg = self.registry["species"].get(str(sid))
        check = self.user_checks.get(sid)
        out: dict = {"in_game_dex": "unknown", "basis": "none", "classes": ["unknown"], "evidence": "UNVERIFIED",
                     "source": None, "url": None, "note": None, "user_check": check, "conflict": None}
        if reg:
            out.update(in_game_dex=reg["in_game_dex"], basis="registry", classes=list(reg["classes"]),
                       evidence=reg["evidence"], source=reg.get("source"), url=reg.get("url"), note=reg.get("note"))
        elif sp:
            if sp.get("locations"):
                out.update(in_game_dex="yes", basis="dump-wild", classes=["wild"], evidence="DUMP_ONLY",
                           source="Wild rows in your installed dump (extraction date unknown)")
            elif sid in self._wild_family:
                out.update(in_game_dex="yes", basis="dump-family", classes=["evolution_or_breeding"], evidence="DUMP_ONLY",
                           source="Evolution family has wild rows in your installed dump")
            else:
                out.update(source="No wild rows in your dump for this family; acquisition needs checking")
        else:
            out.update(source="Install your PokeMMO data to derive encounter classes")
        if check:
            if reg and reg["in_game_dex"] in ("yes", "no") and reg["in_game_dex"] != check["in_dex"]:
                out["conflict"] = (f"Your in-game check ({check['checked_at'][:10]}) says '{check['in_dex']}', the registry says "
                                   f"'{reg['in_game_dex']}'. Your current in-game observation is used.")
            out.update(in_game_dex=check["in_dex"], basis="your-check")
        label = CLASS_LABELS.get(out["classes"][0], "Unverified")
        if out["in_game_dex"] == "no":
            label = "Not in PokeMMO Pokédex"
        out["label"] = label
        return out

    # ------------------------------------------------------------ queries
    def summaries(self, favourites: set[int], progress: dict[int, dict] | None = None) -> list[dict]:
        out = []
        for sid, base in self.index.items():
            sp = self.species.get(sid)
            av = self.availability(sid)
            entry = {"id": sid, "name": base["name"], "types": base["types"], "gen": base["gen"],
                     "fav": sid in favourites, "icon": self.sprite_url(sid, "icon"),
                     "dex": av["in_game_dex"], "avail": av["label"], "classes": av["classes"], "evidence": av["evidence"]}
            if progress is not None:
                entry["progress"] = progress.get(sid) or {"status": "unregistered"}
            if sp:
                entry.update({
                    "regions": sorted({l["region"] for l in sp["locations"]}),
                    "methods": sorted({l["method"] for l in sp["locations"]}),
                    "horde": any(l["horde3"] or l["horde5"] for l in sp["locations"]),
                    "horde5": any(l["horde5"] for l in sp["locations"]),
                    "egg_groups": sp["egg_groups"],
                    "abilities": [a["name"] for a in sp["abilities"]],
                    "held_items": sp["held_items"],
                    "stats": sp.get("stats") or {},
                    "bst": sum(sp["stats"].values()) if sp.get("stats") else None,
                    "seasons": sorted({l["season"] for l in sp["locations"] if l.get("season")}),
                    "ev": {ref.EV_KEYS[k]: v for k, v in sp["yields"].items() if k in ref.EV_KEYS and v},
                    "gender_code": sp["gender_code"],
                })
            out.append(entry)
        return out

    def roster_report(self) -> dict:
        """Difference report: Companion roster vs the owner's observed in-game denominators."""
        rows = [{"id": sid, "name": self.index[sid]["name"], **{k: v for k, v in self.availability(sid).items()
                                                                 if k in ("in_game_dex", "basis", "evidence", "label", "source")}}
                for sid in self.index]
        no = [r for r in rows if r["in_game_dex"] == "no"]
        unknown = [r for r in rows if r["in_game_dex"] == "unknown"]
        yes = [r for r in rows if r["in_game_dex"] == "yes"]
        obs = self.registry["observed_in_game"]
        expected_missing = len(self.index) - obs["seen_denominator"]
        return {"registry_version": self.registry["registry_version"], "checked_at": self.registry["checked_at"],
                "reference_species": len(self.index), "observed": obs, "expected_not_in_dex": expected_missing,
                "identified_not_in_dex": len(no), "still_to_identify": max(0, expected_missing - len(no)),
                "counts": {"yes": len(yes), "no": len(no), "unknown": len(unknown)},
                "not_in_dex": no, "unknown": unknown,
                "note": ("PokeMMO's in-game Pokédex (owner video, 22 Nov 2026) counts "
                         f"{obs['seen_denominator']} species for Seen; the Gen I–V reference has {len(self.index)}. "
                         f"{len(no)} of the {expected_missing} uncounted species are identified so far. "
                         "Use 'Check in game' on unverified species to record what your client shows.")}

    def detail(self, sid: int, favourites: set[int], note: str | None) -> dict | None:
        base = self.index.get(sid)
        if not base:
            return None
        sp = self.species.get(sid)
        result = {"id": sid, "name": base["name"], "types": base["types"], "gen": base["gen"],
                  "fav": sid in favourites, "note": note, "imported": sp is not None,
                  "sprites": {k: self.sprite_url(sid, k) for k in
                              ("icon", "icon_f", "icon_shiny", "front", "front_f", "front_shiny")},
                  "availability": self.availability(sid),
                  "type_matchups": self.type_matchups(base["types"]),
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

    @staticmethod
    def type_matchups(types: list[str]) -> dict:
        prof = ref.defensive_profile(types)
        groups: dict[str, list[str]] = {"4": [], "2": [], "1": [], "0.5": [], "0.25": [], "0": []}
        for t, m in prof.items():
            groups[{4.0: "4", 2.0: "2", 1.0: "1", 0.5: "0.5", 0.25: "0.25", 0.0: "0"}[m]].append(t)
        return {"defending": types, "groups": groups, "status": "CORROBORATED",
                "note": "Types only (Gen II–V chart, 17 types). Abilities such as Levitate are not applied."}

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
