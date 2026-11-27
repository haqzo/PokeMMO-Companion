"""Pokédex repository: bundled public species index + optional private dump import.

Field provenance (docs/research/phase-3/02):
  * name / number / types / generation → bundled public facts (CORROBORATED)
  * everything else → user's imported dump (DUMP_ONLY: extraction date unknown)
Missing data is reported as unavailable, never invented.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import threading
import unicodedata
from collections import defaultdict

from ..config import BUNDLED_DATA_DIR, Paths
from ..data import reference as ref

# Golden-case overlays from official changelogs (patch-aware; never mutate the dump).
OVERLAYS = {
    108: [{"field": "catch_rate", "value": 75, "source": "Official changelog 30/10/2026",
           "url": "https://forums.pokemmo.com/index.php?/topic/201356-changelog-30102026/",
           "note": "Lickitung catch rate 45 → 75. Dump value matches."}],
}

CONF_RANK = {"OFFICIAL": 5, "CORROBORATED": 4, "REPORTED": 3, "WALKTHROUGH": 2, "DUMP_ONLY": 1, "UNVERIFIED": 0}
# Which method decides the headline label when several apply (permanent routes first).
METHOD_ORDER = ["perma_raid", "wild", "roamer", "gift", "fossil", "evolution", "breeding", "seasonal_raid", "event",
                "temporary_koth", "storyline_temporary", "trade", "unavailable", "unknown"]
FILTER_TAGS = {"permanent": "Available permanently", "wild": "Wild", "raid": "Raids", "roaming": "Roaming",
               "temporary": "Special / temporary", "event": "Event", "gift_fossil": "Gift / fossil", "evolution": "Evolve / breed",
               "unverified": "Unverified", "needs_review": "Needs review", "listed": "Listed (your check)", "not_listed": "Not listed (your check)"}
PROGRESS_LEVELS = ["unregistered", "seen", "owned", "caught_ot"]



log = logging.getLogger("companion.dex")


def normalize_location_text(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def _location_label(value: str) -> str:
    return re.sub(r"\s*\(\s*(.+?)\s*\)", r" (\1)", normalize_location_text(value))


def load_bundled_reference() -> dict | None:
    """The offline PokeMMO reference shipped with the app (built by tools/build_reference.py)."""
    import gzip
    d = BUNDLED_DATA_DIR / "reference"
    try:
        manifest = json.loads((d / "manifest.json").read_text(encoding="utf-8"))
        species = {int(k): v for k, v in json.loads(gzip.decompress((d / "species.json.gz").read_bytes())).items()}
        extras = json.loads(gzip.decompress((d / "extras.json.gz").read_bytes()))
    except (OSError, ValueError):
        return None
    manifest = {**manifest, "source_kind": "bundled"}
    return {"manifest": manifest, "species": species, "extras": extras}


def load_bundled_items() -> dict | None:
    import gzip
    try:
        return json.loads(gzip.decompress((BUNDLED_DATA_DIR / "reference" / "items.json.gz").read_bytes()))
    except (OSError, ValueError):
        return None


def load_reference(paths) -> dict | None:
    """The newest valid reference dataset: a downloaded, verified data package (see refdata.py) when it is newer
    than the built-in one, otherwise the built-in dataset."""
    from .refdata import ReferenceUpdater
    try:
        dl = ReferenceUpdater(paths.root / "reference").load_current()
    except Exception as exc:  # never fatal: the built-in data is always there
        log.warning("Downloaded reference data not used: %s", exc)
        dl = None
    if dl:
        return {"manifest": {**dl["manifest"], "source_kind": "downloaded"}, "species": dl["species"], "extras": dl["extras"],
                "items": dl.get("items")}
    b = load_bundled_reference()
    if b:
        b["items"] = None
    return b


def reference_manifest(paths) -> dict:
    """Cheap: only the manifest of the dataset load_reference() would use (no decompression)."""
    from .refdata import ReferenceUpdater, dataset_key
    b = json.loads((BUNDLED_DATA_DIR / "reference" / "manifest.json").read_text(encoding="utf-8"))
    try:
        inst = ReferenceUpdater(paths.root / "reference").installed_manifest()
    except Exception:
        inst = None
    return inst if inst and dataset_key(inst) > dataset_key(b) else b


def _ref_date(m: dict | None) -> str:
    return str((m or {}).get("dump_date") or "")

class DexService:
    def __init__(self, paths: Paths):
        self.paths = paths
        self._lock = threading.Lock()
        idx = json.loads((BUNDLED_DATA_DIR / "species_index.json").read_text(encoding="utf-8"))
        self.index_meta = {k: v for k, v in idx.items() if k != "species"}
        self.index = {s["id"]: s for s in idx["species"]}
        self.registry = json.loads((BUNDLED_DATA_DIR / "pokemmo_availability.json").read_text(encoding="utf-8"))
        self.forms_doc = json.loads((BUNDLED_DATA_DIR / "forms.json").read_text(encoding="utf-8"))
        self.forms = {f"{f['species_id']}:{f['form_key']}": f for f in self.forms_doc["forms"]}
        self.form_art = json.loads((BUNDLED_DATA_DIR / "form_art.json").read_text(encoding="utf-8"))
        self.library = None  # optional SpriteLibrary, set by the app
        lm = json.loads((BUNDLED_DATA_DIR / "legendary_mythical.json").read_text(encoding="utf-8"))
        self.legendary, self.mythical = set(lm["legendary"]), set(lm["mythical"])
        self._bounds_cache: dict[str, list[int] | None] = {}
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
            except (OSError, ValueError) as exc:  # corrupt personal install → fall back to the bundled data below
                log.warning("Personal PokeMMO data could not be read (%s); using the bundled reference data", exc)
                self.manifest, self.species, self.extras, self.sprites = None, {}, {}, {}
            # Every installation ships the reference dataset (companion/data/reference), so core features never need
            # a player import. A personal client import is used only when it is at least as new as the reference
            # data; an OLDER import never overrides newer verified data (its sprites/icons are still used).
            self.private_superseded = None
            newer_ref = bool(self.species) and _ref_date(self.manifest) < _ref_date(reference_manifest(self.paths))
            ref_ds = load_reference(self.paths) if (newer_ref or not self.species) else None
            if newer_ref and ref_ds:
                self.private_superseded = {"private_date": _ref_date(self.manifest), "reference_date": _ref_date(ref_ds["manifest"])}
                log.info("Personal PokeMMO import (%s) is older than the reference data (%s); using the reference data",
                         self.private_superseded["private_date"], self.private_superseded["reference_date"])
                self.manifest, self.species, self.extras = ref_ds["manifest"], ref_ds["species"], ref_ds["extras"]
            elif not self.species and ref_ds:
                self.manifest, self.species, self.extras = ref_ds["manifest"], ref_ds["species"], ref_ds["extras"]
                self.sprites = {}
            # Changes whenever data is (re)installed, so sprite URLs can be cached by the browser safely.
            self.asset_version = hashlib.sha1(str((self.manifest or {}).get("imported_at", "")).encode()).hexdigest()[:10]
            self._resolve_local_form_art()
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
            self._build_locations()

    @property
    def imported(self) -> bool:
        return bool(self.species)

    def status(self) -> dict:
        ref_m = None
        try:
            ref_m = json.loads((BUNDLED_DATA_DIR / "reference" / "manifest.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            pass
        return {"imported": self.imported, "manifest": self.manifest, "index": self.index_meta,
                "private_superseded": getattr(self, "private_superseded", None),
                "source_kind": (self.manifest or {}).get("source_kind", "private" if self.species else None),
                "reference": ref_m and {"dump_date": ref_m.get("dump_date"), "counts": ref_m.get("counts"), "built_at": ref_m.get("built_at")},
                "species_total": len(self.index)}

    # ------------------------------------------------------------ helpers
    def sprite_url(self, sid: int, kind: str = "icon") -> str | None:
        f = self.sprites.get(sid, {}).get(kind)
        if not f:
            # Clean install (no PokeMMO client data): the built-in Gen V still of the same Pokémon, never another one.
            lib = self.library
            if lib is not None and lib.installed and kind in ("icon", "icon_shiny", "front", "front_shiny"):
                return (lib.urls(str(sid)) or {}).get("static_shiny" if kind.endswith("shiny") else "static")
            return None
        folder = "icons" if kind.startswith("icon") else "battle"
        return f"/assets/private/{folder}/{f}?v={self.asset_version}"

    def name(self, sid: int) -> str:
        return self.index.get(sid, {}).get("name", f"#{sid:03d}")

    def find_by_name(self, name: str) -> int | None:
        n = name.strip().lower()
        for sid, s in self.index.items():
            if s["name"].lower() == n:
                return sid
        return None

    def _source(self, sid_: str) -> dict:
        src = self.registry.get("sources", {}).get(sid_) or {}
        return {"id": sid_, "title": src.get("title", sid_), "url": src.get("url"), "kind": src.get("kind"), "checked": src.get("checked")}

    def _review(self, method: str, verified_at: str | None) -> dict | None:
        """A record is stale when a later patch is known to affect its kind of acquisition."""
        for p in self.registry.get("patches", []):
            if method in p.get("affects", []) and verified_at and verified_at[:len(p["date"])] < p["date"]:
                return {"patch": p["title"], "date": p["date"], "url": p.get("url")}
        return None

    def availability(self, sid: int) -> dict:
        """Separate axes (docs/research/phase-4): in-game Pokédex membership, acquisition methods,
        counter eligibility, and the user's own check. No axis is derived from another."""
        sp = self.species.get(sid)
        reg = self.registry["species"].get(str(sid))
        check = self.user_checks.get(sid)
        labels = self.registry.get("methods", {})
        dump_date = (self.manifest or {}).get("dump_date")
        methods: list[dict] = []
        for m in (reg or {}).get("methods", []):
            methods.append({**{k: v for k, v in m.items() if k != "sources"}, "label": labels.get(m["method"], m["method"]),
                            "basis": "registry", "sources": [self._source(x) for x in m.get("sources", [])],
                            "review": self._review(m["method"], m.get("verified_at"))})
        have = {m["method"] for m in methods}
        if sp and "wild" not in have and sp.get("locations"):
            methods.append({"method": "wild", "label": labels.get("wild", "Wild"), "basis": "dump", "confidence": "DUMP_ONLY",
                            "detail": (lambda n: f"{n} location{'' if n == 1 else 's'} in the PokeMMO game data")(len({l['area'] for l in sp['locations']})),
                            "regions": sorted({l["region"] for l in sp["locations"]}), "verified_at": dump_date,
                            "sources": [{"id": "dump", "title": "PokeMMO game data" + (f" (client snapshot {dump_date})" if dump_date else " (date unknown)"),
                                         "url": None, "kind": "dump"}],
                            "review": self._review("wild", dump_date) if dump_date else None})
        elif sp and not have and sid in self._wild_family:
            methods.append({"method": "evolution", "label": labels.get("evolution", "Evolution"), "basis": "dump", "confidence": "DUMP_ONLY",
                            "detail": "Its evolution family appears in the wild (evolve or breed)", "verified_at": dump_date,
                            "sources": [{"id": "dump", "title": "PokeMMO game data", "url": None, "kind": "dump"}], "review": None})
        if not methods:
            methods.append({"method": "unknown", "label": labels.get("unknown", "Unverified"), "basis": "none", "confidence": "UNVERIFIED",
                            "detail": ("No wild encounters for this family in the game data; how to obtain it is not confirmed yet" if sp else
                                       "Encounter data is not available"), "sources": [], "review": None})
        methods.sort(key=lambda m: METHOD_ORDER.index(m["method"]) if m["method"] in METHOD_ORDER else 99)
        perm_set = set(self.registry.get("permanent_methods", []))
        known = [m for m in methods if m["method"] != "unknown"]
        permanent = True if any(m["method"] in perm_set for m in known) else (None if not known else False)
        membership = {"state": (reg or {}).get("membership", "unknown"), "basis": "registry" if reg else "none",
                      "checked_at": None, "conflict": None}
        if check:
            if membership["state"] in ("yes", "no") and membership["state"] != check["in_dex"]:
                membership["conflict"] = (f"Your in-game check ({check['checked_at'][:10]}) says '{check['in_dex']}', the registry says "
                                          f"'{membership['state']}'. Your observation is used.")
            membership.update(state=check["in_dex"], basis="your-check", checked_at=check["checked_at"])
        metrics = self.registry.get("eligibility_metrics", [])
        elig = {k: ((reg or {}).get("eligibility") or {}).get(k, "unknown") for k in metrics}
        tags = set()
        if permanent:
            tags.add("permanent")
        for m in methods:
            tags.add({"wild": "wild", "perma_raid": "raid", "seasonal_raid": "raid", "roamer": "roaming", "temporary_koth": "temporary",
                      "storyline_temporary": "temporary", "event": "event", "gift": "gift_fossil", "fossil": "gift_fossil",
                      "evolution": "evolution", "breeding": "evolution", "unknown": "unverified"}.get(m["method"], "other"))
            if m.get("review"):
                tags.add("needs_review")
        if membership["basis"] == "your-check":
            tags.add("listed" if membership["state"] == "yes" else "not_listed")
        tags.discard("other")
        best = max((m.get("confidence", "UNVERIFIED") for m in methods), key=lambda c: CONF_RANK.get(c, 0))
        head = methods[0]
        label = head["label"] + (f" · {head['location']}" if head.get("location") else "")
        return {"membership": membership, "methods": methods, "eligibility": elig, "permanent": permanent, "tags": sorted(tags),
                "evidence": best, "label": label, "short": head["label"], "note": (reg or {}).get("note"), "user_check": check,
                "needs_review": "needs_review" in tags,
                # compatibility with v0.1 callers
                "in_game_dex": membership["state"], "classes": [m["method"] for m in methods], "conflict": membership["conflict"],
                "basis": membership["basis"] if membership["basis"] == "your-check" else head["basis"]}

    # ------------------------------------------------------------ queries
    def summaries(self, favourites: set[int], progress: dict[int, dict] | None = None) -> list[dict]:
        out = []
        for sid, base in self.index.items():
            sp = self.species.get(sid)
            av = self.availability(sid)
            entry = {"id": sid, "name": base["name"], "types": base["types"], "gen": base["gen"],
                     "fav": sid in favourites, "icon": self.sprite_url(sid, "icon"), **self.grid_art(str(sid)),
                     "size": self.size_tier(sid)["tier"],
                     "dex": av["membership"]["state"], "avail": av["short"], "avail_long": av["label"], "classes": av["classes"],
                     "tags": av["tags"], "evidence": av["evidence"], "permanent": av["permanent"]}
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

    # ------------------------------------------------------------ forms catalog
    def form_entry(self, key: str, bounds: bool = False) -> dict | None:
        """One alternate form with types/stats/abilities resolved: client record (your dump) >
        bundled manifest > base species. Each value says where it came from."""
        f = self.forms.get(key)
        if not f:
            return None
        sid = f["species_id"]
        base = self.index[sid]
        sp = self.species.get(sid) or {}
        rec = None
        if isinstance(f.get("client_record"), int):
            rec = ((self.extras or {}).get("form_records") or {}).get(str(f["client_record"])) or \
                  ((self.extras or {}).get("form_records") or {}).get(f["client_record"])
        def pick(field, base_val):
            if rec and rec.get(field):
                return rec[field], "PokeMMO game data"
            if f.get(field):
                return f[field], "Companion forms manifest"
            return base_val, "same as base species"
        types, types_src = pick("types", base["types"])
        stats, stats_src = pick("stats", sp.get("stats") or {})
        abil, abil_src = pick("abilities", [a["name"] for a in sp.get("abilities", [])])
        mismatch = []
        if rec and f.get("types") and rec.get("types") and sorted(rec["types"]) != sorted(f["types"]):
            mismatch.append("types")
        if rec and f.get("stats") and rec.get("stats") and rec["stats"] != f["stats"]:
            mismatch.append("stats")
        cid = f.get("client_record") if isinstance(f.get("client_record"), int) else None
        art = self.art(sid, f["form_key"], bounds=bounds)
        if rec and rec.get("abilities"):
            rec = {**rec, "abilities": [a for a in dict.fromkeys(rec["abilities"]) if a and a != "--"]}
        return {"key": key, "id": sid, "form_key": f["form_key"], "form_name": f["form_name"], "kind": f["kind"],
                "name": (f"Unown {f['form_name']}" if sid == 201 else f["form_name"] if base["name"] in f["form_name"]
                         else f"{base['name']} ({f['form_name']})"),
                "types": types, "types_source": types_src, "stats": stats, "stats_source": stats_src,
                "abilities": abil, "abilities_source": abil_src, "gen": base["gen"], "note": f.get("note"),
                "client_record": cid, "in_client": bool(rec) if self.imported and cid else None,
                "own_sprite": bool(art["icon"] or art["front"] or art["ani"]), "icon": art["icon"], "front": art["front"],
                "art": art, "mismatch": mismatch}

    # ------------------------------------------------------------ artwork
    def _file_sha(self, folder: str, name: str | None) -> str | None:
        if not name:
            return None
        p = self.paths.assets_dir / folder / name
        try:
            return hashlib.sha1(p.read_bytes()).hexdigest()[:12]
        except OSError:
            return None

    def _resolve_local_form_art(self) -> None:
        """Decide, per catalogued form, whether the installed client art really shows that form.
        Client record ids are NOT art slots, so slots come from form_art.json (checked by eye) and every
        candidate file is fingerprinted: egg/Unown placeholders and copies of the base species art are
        refused; a file that differs from the checked fingerprint is used but labelled unverified."""
        self.local_form_art: dict[str, dict] = {}
        if not self.sprites:
            return
        ph = self.form_art.get("placeholder_slots", {})
        def icon_sha(slot):
            return self._file_sha("icons", (self.sprites.get(slot) or {}).get("icon"))
        egg = {icon_sha(x) for x in ph.get("egg", [])} - {None}
        unown = {icon_sha(x) for x in ph.get("unown", [])} - {None}
        for key, e in self.form_art["forms"].items():
            sid = int(key.split(":")[0])
            c = e.get("client") or {}
            out: dict = {"status": "none", "reason": "Your PokeMMO client has no artwork for this form."}
            slot = c.get("icon_slot")
            files = self.sprites.get(slot) or {} if slot else {}
            got = icon_sha(slot) if slot else None
            if slot and got:
                base = icon_sha(sid)
                if got in egg or (sid != 201 and got in unown):
                    out = {"status": "placeholder", "reason": "The client slot for this form holds placeholder artwork (Egg/Unown); not shown."}
                elif got == base:
                    out = {"status": "same-as-base", "reason": "Your client uses the base species artwork for this form; not shown as form art."}
                else:
                    ok = got == c.get("icon_sha1")
                    out = {"status": "verified" if ok else "unverified", "icon": files.get("icon"), "icon_shiny": files.get("icon_shiny"),
                           "reason": "Client artwork checked against this form on 2026-11-23." if ok else
                           "Client artwork differs from the version checked on 2026-11-23 (client update?) — not re-verified."}
                    fslot = c.get("front_slot")
                    ff = self.sprites.get(fslot) or {} if fslot else {}
                    fsha = self._file_sha("battle", ff.get("front"))
                    if fsha and fsha == c.get("front_sha1") and fsha != self._file_sha("battle", (self.sprites.get(sid) or {}).get("front")):
                        out["front"], out["front_shiny"] = ff.get("front"), ff.get("front_shiny")
            self.local_form_art[key] = out

    # ------------------------------------------------------------ moves
    # The client's learn methods, kept exactly. "TM??" is the client's own label for machine compatibility; it is
    # shown as TM / HM only when your client also has a "TM - <move>" / "HM - <move>" item, and keeps its "??" note.
    MOVE_METHODS = {"level": ("level", "Level"), "EVOLVE": ("evolve", "Evolve"), "TM??": ("machine", "TM"),
                    "EGG": ("egg", "Egg"), "EGG & ITEM": ("egg-item", "Egg + item"), "TUTOR": ("tutor", "Tutor"),
                    "SPECIAL": ("special", "Special"), "PREVO": ("prevo", "Pre-evolution")}
    METHOD_RANK = ["start", "level", "evolve", "machine", "egg", "egg-item", "tutor", "special", "prevo"]
    machines = None  # callable(move_name) -> [{"kind": "TM"|"HM", "item_id", "name"}], set by the app (Item Library)

    def move_rows(self, moves: list[dict]) -> list[dict]:
        """One row per move with every method it is learned by (levels kept). No records are dropped except
        byte-identical duplicates; metadata comes only from your dump (None when the dump has none)."""
        rows: dict = {}
        for m in moves:
            key = m.get("id") if m.get("id") is not None else m.get("name")
            r = rows.get(key)
            if r is None:
                r = rows[key] = {"id": m.get("id"), "name": m.get("name"), "verified_meta": bool(m.get("verified_meta")),
                                 **{k: m.get(k) for k in ("type", "category", "power", "accuracy", "pp", "priority")}, "methods": []}
            raw = m.get("method")
            code, label = self.MOVE_METHODS.get(raw, ("other", str(raw)))
            lvl = m.get("level")
            if code == "level" and lvl == 1:
                code, label = "start", "Start"
            meth = {"code": code, "label": label, "raw": raw, "level": lvl if code in ("level", "start") else None}
            if code == "machine":
                found = self.machines(m.get("name")) if self.machines else []
                kinds = sorted({x["kind"] for x in found}, key=lambda k: k != "TM")
                meth.update({"label": "/".join(kinds) if kinds else "TM??", "machine_items": found,
                             "note": ("Your client lists this as “TM??”. " + (f"It also has a {' and '.join(x['name'] for x in found)} item. "
                                      if found else "No matching TM/HM item was found in your client's item data. ")
                                      + "Where to get it, and its price, are not covered.")})
            if meth not in r["methods"]:
                r["methods"].append(meth)
        out = list(rows.values())
        for r in out:
            r["methods"].sort(key=lambda x: (self.METHOD_RANK.index(x["code"]) if x["code"] in self.METHOD_RANK else 99, x["level"] or 0))
            levels = [x["level"] for x in r["methods"] if x["level"] is not None]
            r["min_level"] = min(levels) if levels else None
        return out

    # Visual size tiers (docs/build/14): one rule for grid, Summary and popouts. Heights are the species'
    # height from your installed dump; every Legendary/Mythical uses the large tier whatever its height.
    SIZE_TIERS = (("xs", 0.5), ("s", 0.9), ("m", 1.5))  # height below the limit (metres) → tier; otherwise "l"

    def size_tier(self, sid: int) -> dict:
        if sid in self.legendary or sid in self.mythical:
            return {"tier": "l", "basis": "legendary" if sid in self.legendary else "mythical"}
        hd = (self.species.get(sid) or {}).get("height_dm")
        if not hd:
            return {"tier": "m", "basis": "unknown"}
        m = hd / 10
        for tier, limit in self.SIZE_TIERS:
            if m < limit:
                return {"tier": tier, "basis": "height", "height_m": m}
        return {"tier": "l", "basis": "height", "height_m": m}

    def _bounds(self, folder: str, name: str | None) -> list[int] | None:
        """Visible bounds of one of your client PNGs (cached)."""
        if not name:
            return None
        key = f"{folder}/{name}"
        if key not in self._bounds_cache:
            from .sprite_library import png_alpha_bbox
            try:
                self._bounds_cache[key] = png_alpha_bbox((self.paths.assets_dir / folder / name).read_bytes())
            except OSError:
                self._bounds_cache[key] = None
        return self._bounds_cache[key]

    def grid_art(self, key: str) -> dict:
        """Grid tile artwork for one species ('25') or form ('479-wash'): stills and animations, normal + shiny.
        Missing variants stay None — nothing is substituted."""
        lib = self.library
        if lib is None or not lib.installed:
            return {"still": None, "still_shiny": None, "ani": None, "ani_shiny": None}
        u = lib.urls(key)
        return {"still": lib.still(key), "still_shiny": lib.still(key, True), "ani": u.get("ani"), "ani_shiny": u.get("ani_shiny")}

    def still(self, sid: int, shiny: bool = False) -> dict | None:
        """Gen V still from the sprite library (built in, or your own) for grid tiles."""
        lib = self.library
        return lib.still(str(sid), shiny) if lib is not None and lib.installed else None

    def art(self, sid: int, form_key: str | None = None, bounds: bool = True) -> dict:
        """Artwork for a species or one of its forms. Never substitutes base or placeholder art for a form."""
        def u(folder, f):
            return f"/assets/private/{folder}/{f}?v={self.asset_version}" if f else None
        if form_key:
            loc = getattr(self, "local_form_art", {}).get(f"{sid}:{form_key}") or {"status": "none", "reason": "No artwork for this form."}
            out = {"icon": u("icons", loc.get("icon")), "icon_shiny": u("icons", loc.get("icon_shiny")),
                   "front": u("battle", loc.get("front")), "front_shiny": u("battle", loc.get("front_shiny")),
                   "local_status": loc["status"], "local_reason": loc["reason"]}
            lib_key = f"{sid}-{form_key}"
        else:
            sp = self.sprites.get(sid) or {}
            out = {"icon": u("icons", sp.get("icon")), "icon_shiny": u("icons", sp.get("icon_shiny")),
                   "front": u("battle", sp.get("front")), "front_shiny": u("battle", sp.get("front_shiny")),
                   "local_status": "verified" if sp else "none", "local_reason": "Your PokeMMO client artwork." if sp else "No PokeMMO data installed."}
            lib_key = str(sid)
        lib = self.library
        out.update({k: None for k in ("ani", "ani_shiny", "static", "static_shiny")})
        out["library"] = {}
        if lib is not None and lib.installed:
            out.update(lib.urls(lib_key))
            out["library"] = lib.provenance(lib_key)
            if not form_key:
                fem = lib.urls(f"{sid}-female")       # female variant where the artwork differs
                if fem:
                    out["female"] = fem
        # visible bounds per artwork (so transparent margins don't change the visual size) + the parent's size tier
        # (measured only for the Summary; lists don't need them and the first measurement reads every PNG)
        files = loc if form_key else (self.sprites.get(sid) or {})
        out["bounds"] = {k: self._bounds("icons" if k.startswith("icon") else "battle", files.get(k))
                         for k in ("icon", "icon_shiny", "front", "front_shiny") if files.get(k)} if bounds else {}
        if bounds and lib is not None and lib.installed:
            out["bounds"].update(lib.bounds(lib_key))
        out["size"] = self.size_tier(sid)
        return out

    INHERIT_KINDS = ("cosmetic", "season")

    def catalog_forms(self, favourites: set[int] = frozenset(), progress: dict | None = None) -> list[dict]:
        """Form entries for the browse catalog. Availability is the species' own for cosmetic/seasonal
        variants and in-battle changes; form changes that need an item or event stay 'unverified'."""
        out = []
        for k in self.forms:
            e = self.form_entry(k)
            av = self.availability(e["id"])
            inherit = e["kind"] in self.INHERIT_KINDS or "battle" in (e.get("note") or "").lower()
            e.update(self.grid_art(k.replace(":", "-")))
            e.update({"entry": k, "fav": e["id"] in favourites, "dex": av["membership"]["state"],
                      "avail": av["short"] if inherit else "Form change not verified",
                      "tags": av["tags"] if inherit else ["unverified"], "permanent": av["permanent"] if inherit else None,
                      "evidence": av["evidence"] if inherit else "UNVERIFIED", "classes": av["classes"] if inherit else ["unknown"],
                      "bst": sum(e["stats"].values()) if e.get("stats") else None})
            if progress is not None:
                e["progress"] = progress.get(e["id"]) or {"status": "unregistered"}
            out.append(e)
        return out

    def species_forms(self, sid: int) -> list[dict]:
        base_name = self.forms_doc.get("base_form_names", {}).get(str(sid))
        forms = [self.form_entry(k) for k, f in self.forms.items() if f["species_id"] == sid]
        return ([{"key": str(sid), "form_key": "", "form_name": base_name or "Base form", "base": True}] + forms) if forms else []


    @staticmethod
    def _slug(name: str) -> str:
        return re.sub(r"[^a-z0-9]+", "-", name.lower().replace("♀", "-f").replace("♂", "-m").replace("é", "e")).strip("-")

    def parity(self, reference: dict) -> dict:
        """Compare the forms manifest with a reference list of entry slugs (e.g. Synergy's public index)."""
        names = sorted(((self._slug(v["name"]), k) for k, v in self.index.items()), key=lambda x: -len(x[0]))
        aliases = self.forms_doc.get("base_aliases", {})
        ref_keys, unresolved = set(), []
        for slug in reference.get("form_slugs", []):
            hit = next(((n, sid) for n, sid in names if slug.startswith(n + "-")), None)
            if not hit:
                unresolved.append(slug)
                continue
            form = slug[len(hit[0]) + 1:]
            ref_keys.add(f"{hit[1]}:" + ("" if aliases.get(str(hit[1])) == form else form))
        ours = set(self.forms) | {f"{sid}:" for sid in map(int, aliases)}
        ref_extra = sorted(ref_keys - ours)
        missing = sorted(ours - ref_keys)
        return {"reference": reference.get("source"), "observed_at": reference.get("observed_at"),
                "reference_total": reference.get("entries_total"), "ours_total": len(self.index) + len(self.forms),
                "species": len(self.index), "forms": len(self.forms), "missing_here": ref_extra, "not_in_reference": missing,
                "unresolved_reference_slugs": unresolved, "match": not ref_extra and not missing and not unresolved}

    def roster_report(self, observations: list[dict] | None = None) -> dict:
        """Availability report by axis. Observed in-game counters are listed as dated observations only —
        nothing is subtracted from them to 'find missing species'."""
        rows = []
        for sid in self.index:
            av = self.availability(sid)
            rows.append({"id": sid, "name": self.index[sid]["name"], "membership": av["membership"]["state"],
                         "membership_basis": av["membership"]["basis"], "label": av["label"], "methods": av["classes"],
                         "permanent": av["permanent"], "evidence": av["evidence"], "tags": av["tags"],
                         "conflict": av["membership"]["conflict"], "icon": self.sprite_url(sid)})
        def pick(fn):
            return [r for r in rows if fn(r)]
        method_counts: dict[str, int] = {}
        for r in rows:
            for m in set(r["methods"]):
                method_counts[m] = method_counts.get(m, 0) + 1
        return {"registry_version": self.registry["registry_version"], "checked_at": self.registry["checked_at"],
                "reference_species": len(self.index),
                "membership": {"your_listed": len(pick(lambda r: r["membership_basis"] == "your-check" and r["membership"] == "yes")),
                               "your_not_listed": len(pick(lambda r: r["membership_basis"] == "your-check" and r["membership"] == "no")),
                               "unchecked": len(pick(lambda r: r["membership_basis"] != "your-check"))},
                "permanent": len(pick(lambda r: r["permanent"])), "not_permanent": len(pick(lambda r: r["permanent"] is False)),
                "unverified": len(pick(lambda r: r["permanent"] is None)), "method_counts": method_counts,
                "method_labels": self.registry.get("methods", {}),
                "authored": pick(lambda r: str(r["id"]) in self.registry["species"]),
                "needs_review": pick(lambda r: "needs_review" in r["tags"]), "conflicts": pick(lambda r: r["conflict"]),
                "your_checks": pick(lambda r: r["membership_basis"] == "your-check"),
                "registry_observations": self.registry.get("observations", []), "your_observations": observations or [],
                "sources": self.registry.get("sources", {}), "patches": self.registry.get("patches", []),
                "dump_date": (self.manifest or {}).get("dump_date"),
                "note": ("The Gen I–V reference has 649 species. PokeMMO's in-game counters (Seen, Owned, Caught OT, Alpha, Shiny, "
                         "Costumes) each follow their own eligibility rules and change with patches, so the Companion does not force "
                         "a total. Record what your client shows, and mark species “Listed / Not listed” as you check them.")}

    def detail(self, sid: int, favourites: set[int], note: str | None) -> dict | None:
        base = self.index.get(sid)
        if not base:
            return None
        sp = self.species.get(sid)
        result = {"id": sid, "name": base["name"], "types": base["types"], "gen": base["gen"],
                  "fav": sid in favourites, "note": note, "imported": sp is not None,
                  "art": self.art(sid),
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
            "forms": sp["forms"], "moves": sp["moves"], "move_rows": self.move_rows(sp["moves"]), "locations": sp["locations"],
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

    # ------------------------------------------------------------ locations
    def _build_locations(self) -> None:
        idx: dict[str, dict] = {}
        for sid, sp in self.species.items():
            for l in sp.get("locations", []):
                key = f"{l['region']}:{l.get('location_id') or l['area']}"
                loc = idx.setdefault(key, {"id": key, "region": l["region"], "name": l["area"], "location_id": l.get("location_id"),
                                           "rows": [], "species": set(), "methods": set(), "seasons": set(), "horde": False})
                loc["rows"].append({**l, "species_id": sid})
                loc["species"].add(sid)
                loc["methods"].add(l["method"])
                if l.get("season"):
                    loc["seasons"].add(l["season"])
                loc["horde"] = loc["horde"] or l["horde3"] or l["horde5"]
        names, parents = defaultdict(set), defaultdict(set)
        for key, loc in idx.items():
            name = _location_label(loc["name"])
            region = loc["region"]
            names[region, name].add(key)
            qualifier = re.fullmatch(r"(.+) \((.+)\)", name)
            if qualifier:
                base, suffix = qualifier.groups()
                parents[region, base].add(key)
                # Retain the full qualifier when accepting the spelling without parentheses.
                names[region, f"{base} {suffix}"].add(key)
        self._location_catalog = (idx, names, parents)
        self._locations = idx

    def match_location(self, region: str | None, name: str | None) -> dict:
        """Resolve only an explicit, unique name in the reported region."""
        if not region or not name:
            return {"status": "unverified"}
        if not hasattr(self, "_location_catalog"):
            self._build_locations()
        locations, names, parents = self._location_catalog
        label_key = (region, _location_label(name))
        keys = names.get(label_key, set())
        subareas = parents.get(label_key, set())
        # A numbered route has its own catalog entry. Its gate or tower is named separately.
        if subareas and keys and re.fullmatch(r"route [0-9]+", label_key[1]):
            subareas = set()
        if len(keys | subareas) > 1:
            return {"status": "ambiguous"}
        if not keys:
            return {"status": "unverified"}
        key = next(iter(keys))
        loc = locations[key]
        if str(loc["location_id"]).startswith("-") or "???" in loc["name"]:
            return {"status": "unverified"}
        return {"status": "verified", "id": key, "name": loc["name"]}

    def locations(self) -> list[dict]:
        if not hasattr(self, "_locations"):
            self._build_locations()
        return sorted(({"id": v["id"], "region": v["region"], "name": v["name"], "species_count": len(v["species"]),
                        "methods": sorted(v["methods"]), "seasons": sorted(v["seasons"]), "horde": v["horde"],
                        "species": sorted(v["species"])} for v in self._locations.values()),
                      key=lambda x: (["kanto", "johto", "hoenn", "sinnoh", "unova"].index(x["region"])
                                     if x["region"] in ("kanto", "johto", "hoenn", "sinnoh", "unova") else 9, x["name"]))

    def location_reference(self, key: str) -> dict | None:
        """Canonical identity for an explicitly selected encounter location."""
        loc = self._locations.get(key)
        if loc and not str(loc["location_id"]).startswith("-") and "???" not in loc["name"]:
            return {field: loc[field] for field in ("id", "region", "name")}
        return None

    def location(self, key: str) -> dict | None:
        if not hasattr(self, "_locations"):
            self._build_locations()
        v = self._locations.get(key)
        if not v:
            return None
        rows = sorted(v["rows"], key=lambda r: (self.name(r["species_id"]), r.get("season") or "", r["method"]))
        return {"id": key, "region": v["region"], "name": v["name"], "location_id": v["location_id"],
                "rows": [{**r, "name": self.name(r["species_id"]), "icon": self.sprite_url(r["species_id"]),
                          "types": self.index.get(r["species_id"], {}).get("types", [])} for r in rows],
                "dump_date": (self.manifest or {}).get("dump_date"),
                "source_kind": (self.manifest or {}).get("source_kind", "private"),
                "provenance": ("Encounter rows from the Companion's built-in PokeMMO data (PokeMMO client data"
                               if (self.manifest or {}).get("source_kind") == "bundled" else
                               "Encounter rows from your own PokeMMO client data (")
                              + f"dated {(self.manifest or {}).get('dump_date') or 'unknown'}). Rates are the client's own per-time labels; "
                              "events, swarms and Altering Cave rotation are not reflected."}

    def egg_group_members(self, group: str) -> list[int]:
        return self._egg_index.get(group, [])

    def skills(self) -> list[dict]:
        return self.extras.get("skills", [])
