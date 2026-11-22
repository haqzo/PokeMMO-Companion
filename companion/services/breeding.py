"""Breeding Planner logic (docs/design/08 + 09).

What this module claims, and how strongly:
  * Egg-group / gender / Ditto / 'cannot breed' compatibility — standard rules,
    CORROBORATED (community guides + PokeMMO breeding UI); edge cases flagged.
  * One held item per parent; Everstone and a Power item can't share a parent —
    official rule (Jan 2015 changelog).
  * Braced stat is guaranteed from that parent — official rule (Jan 2015).
  * Everstone passes that parent's nature — official rule (Jan 2015).
  * Everything else (unbraced IV distribution, rounding, gender fees, costume /
    alpha / shiny / HA inheritance) is NOT validated: returned as 'possible' or
    'unknown', never as a number or probability.
  * Both parents are consumed — documented PokeMMO behaviour; the Companion
    never performs or confirms a breed.
"""
from __future__ import annotations

from ..data.reference import STATS, STAT_LABELS
from .dex import DexService

BRACES = {"Power Weight": "hp", "Power Bracer": "attack", "Power Belt": "defense",
          "Power Lens": "sp_attack", "Power Band": "sp_defense", "Power Anklet": "speed"}
STAT_TO_BRACE = {v: k for k, v in BRACES.items()}
ITEMS = ["none", "Everstone", *BRACES.keys()]
BABIES = {172, 173, 174, 175, 236, 238, 239, 240, 298, 360, 406, 433, 438, 439, 440, 446, 447, 458}
OFFICIAL_2015 = "https://forums.pokemmo.com/index.php?/topic/49811-changelog-13012015/"


def _gender_options(code: int | None) -> list[str]:
    if code == 255:
        return ["genderless"]
    if code == 0:
        return ["male"]
    if code == 254:
        return ["female"]
    return ["male", "female"]


def check_pair(dex: DexService, a: dict, b: dict) -> dict:
    """a/b: {species, gender, ivs{stat:int|None}, nature, item}."""
    issues: list[str] = []
    notes: list[str] = []
    if not dex.imported:
        return {"status": "needs_data", "reason": "Import your PokeMMO Pokédex data to check egg groups."}
    sa, sb = dex.species.get(a.get("species") or 0), dex.species.get(b.get("species") or 0)
    if not sa or not sb:
        return {"status": "incomplete", "reason": "Choose a species for both parents."}

    # held items (one per parent; Everstone XOR brace is enforced by the single slot)
    for label, p in (("Parent A", a), ("Parent B", b)):
        if p.get("item", "none") not in ITEMS:
            issues.append(f"{label}: unknown held item")

    ga, gb = a.get("gender"), b.get("gender")
    for label, p, sp in (("Parent A", a, sa), ("Parent B", b, sb)):
        opts = _gender_options(sp["gender_code"])
        if p.get("gender") and p["gender"] not in opts:
            issues.append(f"{label}: {sp['name']} cannot be {p['gender']} (possible: {', '.join(opts)})")

    ditto_a, ditto_b = "ditto" in sa["egg_groups"], "ditto" in sb["egg_groups"]
    if "cannot breed" in sa["egg_groups"] or "cannot breed" in sb["egg_groups"]:
        who = sa["name"] if "cannot breed" in sa["egg_groups"] else sb["name"]
        return {"status": "incompatible", "reason": f"{who} is in the 'cannot breed' egg group.", "issues": issues}
    if ditto_a and ditto_b:
        return {"status": "incompatible", "reason": "Two Ditto cannot breed with each other.", "issues": issues}

    if ditto_a or ditto_b:
        other, other_p = (sb, b) if ditto_a else (sa, a)
        mother = other
        notes.append("Ditto can pair with any breedable species, including genderless ones.")
    else:
        if sa["gender_code"] == 255 or sb["gender_code"] == 255:
            g = sa if sa["gender_code"] == 255 else sb
            return {"status": "incompatible", "reason": f"{g['name']} is genderless and can only breed with Ditto.",
                    "issues": issues}
        shared = sorted(set(sa["egg_groups"]) & set(sb["egg_groups"]))
        if not shared:
            return {"status": "incompatible",
                    "reason": (f"No shared egg group: {sa['name']} ({', '.join(sa['egg_groups'])}) vs "
                               f"{sb['name']} ({', '.join(sb['egg_groups'])})."), "issues": issues}
        if not ga or not gb:
            return {"status": "incomplete", "reason": "Choose a gender for both parents.",
                    "shared_groups": shared, "issues": issues}
        if ga == gb:
            return {"status": "incompatible", "reason": "Parents must be one male and one female.", "issues": issues}
        mother = sa if ga == "female" else sb
        notes.append(f"Shared egg group: {', '.join(shared)}.")

    off_id = mother.get("base_species") or mother["id"]
    flags = []
    if off_id in BABIES:
        stage1 = next((e["to"] for e in dex.species[off_id].get("evolutions", [])), None)
        flags.append(f"Baby species: offspring may be {dex.name(off_id)} or {dex.name(stage1) if stage1 else 'its evolution'} "
                     "depending on incense rules — not verified for PokeMMO.")
    if mother["id"] in (29, 30, 31, 313, 314):
        flags.append("Nidoran♀ / Volbeat / Illumise special offspring rules are not verified.")
    off = dex.species.get(off_id, mother)
    status = "issues" if issues else ("needs_verification" if flags else "compatible")
    return {"status": status, "reason": "Compatible pairing." if not issues else issues[0], "issues": issues,
            "notes": notes, "flags": flags,
            "offspring": {"id": off["id"], "name": off["name"], "types": off["types"],
                          "icon": dex.sprite_url(off["id"]),
                          "gender": {"code": off["gender_code"]}}}


def preview(dex: DexService, a: dict, b: dict) -> dict:
    compat = check_pair(dex, a, b)
    item_a, item_b = a.get("item", "none"), b.get("item", "none")
    brace_a, brace_b = BRACES.get(item_a), BRACES.get(item_b)
    ivs = []
    for stat in STATS:
        va, vb = (a.get("ivs") or {}).get(stat), (b.get("ivs") or {}).get(stat)
        row = {"stat": stat, "label": STAT_LABELS[stat], "a": va, "b": vb}
        if brace_a == stat and brace_b == stat:
            row.update(state="range", text="One parent's value — both braced the same stat (selection rule not validated)",
                       values=[v for v in (va, vb) if v is not None])
        elif brace_a == stat:
            row.update(state="guaranteed", text="From Parent A (brace — official rule)", value=va)
        elif brace_b == stat:
            row.update(state="guaranteed", text="From Parent B (brace — official rule)", value=vb)
        else:
            vals = sorted({v for v in (va, vb) if v is not None})
            row.update(state="possible", values=vals,
                       text="May come from either parent or not be inherited — distribution not validated")
        ivs.append(row)
    if item_a == "Everstone" and item_b == "Everstone":
        nature = {"state": "range", "values": [a.get("nature"), b.get("nature")],
                  "text": "Both hold Everstone — which nature passes is not validated"}
    elif item_a == "Everstone":
        nature = {"state": "guaranteed", "value": a.get("nature"), "text": "Parent A's nature (Everstone — official rule)"}
    elif item_b == "Everstone":
        nature = {"state": "guaranteed", "value": b.get("nature"), "text": "Parent B's nature (Everstone — official rule)"}
    else:
        nature = {"state": "unknown", "text": "Not guaranteed without an Everstone"}
    return {"compatibility": compat, "ivs": ivs, "nature": nature,
            "items": {"a": item_a, "b": item_b},
            "consumption": "Both parents are consumed when you breed in PokeMMO. "
                           "Double-check this prediction in the game's breeding window before confirming.",
            "unverified": ["Unbraced IV distribution and rounding", "Gender-selection fee", "Egg moves",
                           "Hidden Ability, Alpha, Shiny and costume inheritance"],
            "source": OFFICIAL_2015}


# ------------------------------------------------------------- plan tree
def build_tree(traits: list[str]) -> dict:
    """Canonical brace tree: a k-trait Pokémon comes from two (k-1)-trait parents
    sharing k-2 traits; each parent holds the item for its unique trait.
    Community method — not proven to be the cheapest path."""
    def item_for(trait: str) -> str:
        return "Everstone" if trait.startswith("nature:") else STAT_TO_BRACE[trait]

    def node(ts: list[str], path: str) -> dict:
        if len(ts) == 1:
            return {"id": path, "traits": ts, "leaf": True}
        left_t = ts[:-1]
        right_t = ts[:-2] + ts[-1:]
        return {"id": path, "traits": ts, "leaf": False,
                "parents": [
                    {"item": item_for(ts[-2]), "node": node(left_t, path + "A")},
                    {"item": item_for(ts[-1]), "node": node(right_t, path + "B")},
                ]}
    return node(traits, "r")


def plan_summary(plan: dict) -> dict:
    stats = [s for s in plan.get("ivs", []) if s in STATS]
    traits = list(stats)
    if plan.get("nature"):
        traits = [f"nature:{plan['nature']}"] + traits  # nature as an early trait (common practice)
    if len(traits) < 2:
        return {"error": "Choose at least two goals (IV stats and/or a nature) to build a tree."}
    if len(traits) > 7:
        return {"error": "At most 6 IVs + nature."}
    tree = build_tree(traits)
    counts: dict[str, int] = {}
    leaves: list[dict] = []
    breeds = 0
    statuses = plan.get("node_status", {})

    def walk(n: dict, depth: int) -> None:
        nonlocal breeds
        n["depth"] = depth
        n["status"] = statuses.get(n["id"], "not_started")
        n["label"] = " + ".join(t.replace("nature:", "") + ("" if t.startswith("nature:") else " 31")
                                for t in n["traits"])
        if n["leaf"]:
            leaves.append(n)
            return
        breeds += 1
        for p in n["parents"]:
            counts[p["item"]] = counts.get(p["item"], 0) + 1
            walk(p["node"], depth + 1)
    walk(tree, 0)
    prices = plan.get("prices", {})
    priced = {k: v for k, v in prices.items() if isinstance(v, (int, float)) and v >= 0}
    total = sum(counts.get(k, 0) * v for k, v in priced.items())
    missing = [k for k in counts if k not in priced]
    done = sum(1 for s in statuses.values() if s == "done")
    return {"tree": tree, "leaves": len(leaves), "breeds": breeds, "items": counts,
            "cost": {"total": total if not missing else None, "partial_total": total,
                     "missing_prices": missing, "currency": "¥ (your manual prices)"},
            "progress": {"done": done, "nodes": breeds + len(leaves)},
            "notes": ["Item counts assume each breed uses one item per parent (community brace-tree method).",
                      "Gender-selection fees and breeder purchase prices are not included — enter your own.",
                      "A used breeder is consumed; mark nodes Done only after you breed in game."]}


# ------------------------------------------------------------- egg moves
def egg_move_candidates(dex: DexService, species_id: int) -> dict:
    sp = dex.species.get(species_id)
    if not sp:
        return {"error": "Import data and choose a species."}
    base = dex.species.get(sp.get("base_species") or species_id, sp)
    egg_moves = [m for m in base["moves"] if m["method"] in ("EGG", "EGG & ITEM")]
    groups = [g for g in base["egg_groups"] if g not in ("cannot breed", "ditto")]
    pool = sorted({s for g in groups for s in dex.egg_group_members(g)})
    result = []
    for mv in egg_moves:
        fathers = []
        for sid in pool:
            cand = dex.species[sid]
            if cand["gender_code"] in (254, 255):
                continue
            methods = sorted({m["method"] for m in cand["moves"] if m["id"] == mv["id"]})
            if methods:
                fathers.append({"id": sid, "name": cand["name"], "methods": methods,
                                "tm_unconfirmed": methods == ["TM??"]})
        result.append({"move": mv["name"], "move_id": mv["id"], "type": mv.get("type"),
                       "verified_meta": mv.get("verified_meta", False), "fathers": fathers[:40],
                       "father_count": len(fathers)})
    return {"species": base["name"], "species_id": base["id"], "egg_groups": groups, "moves": result,
            "note": "Candidates come from dump learnsets of species sharing an egg group. PokeMMO egg-move "
                    "inheritance rules are not validated; 'TM??' means the TM source is unconfirmed."}
