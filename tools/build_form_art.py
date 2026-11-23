"""Build companion/data/form_art.json — where correct artwork for every catalogued form can be found.

Developer tool (not used at runtime). Inputs:
  --install DIR        a Companion data dir with an installed PokeMMO dump (for file fingerprints)
  --pokeapi FILE       `git ls-tree -r --name-only HEAD` of github.com/PokeAPI/sprites
  --smogon FILE        same for github.com/smogon/sprites
  --pokesprite FILE    same for github.com/msikma/pokesprite
Only file NAMES are read from the external repositories; no artwork is downloaded or stored.

The client icon slots below were checked by eye against the 2026-11-16 dump on 2026-11-23
(contact sheets of every slot 650-711 next to the base species). Client record ids from the
form data (forms.json "client_record") are NOT art slots: record 658 (Wash Rotom data) points at
an Unown icon, which is why art uses its own mapping here.
"""
from __future__ import annotations
import argparse, hashlib, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UNOWN = [*"bcdefghijklmnopqrstuvwxyz", "exclamation", "question"]
ICON_SLOTS: dict[str, int] = {f"201:{k}": 652 + i for i, k in enumerate(UNOWN)}
ICON_SLOTS.update({"351:sunny": 679, "351:rainy": 680, "351:snowy": 681, "386:attack": 682, "386:defense": 683, "386:speed": 684,
                   "412:sandy": 685, "412:trash": 686, "413:sandy": 687, "413:trash": 688, "421:sunshine": 689,
                   "422:east": 690, "423:east": 691, "479:heat": 692, "479:wash": 693, "479:frost": 694, "479:fan": 695, "479:mow": 696,
                   "487:origin": 697, "492:sky": 698, "550:blue-striped": 699, "555:zen": 700,
                   "585:summer": 701, "585:autumn": 702, "585:winter": 703, "586:summer": 704, "586:autumn": 705, "586:winter": 706,
                   "648:pirouette": 707,
                   # Genesect Drive slots exist but hold the base Genesect icon byte-for-byte (rejected at runtime as same-as-base).
                   "649:douse": 708, "649:shock": 709, "649:burn": 710, "649:chill": 711})
FRONT_SLOTS = {f"201:{k}": 652 + i for i, k in enumerate(UNOWN[:16])}  # Unown B–Q only; no other form battle art in the dump
PLACEHOLDER_SLOTS = {"egg": [650, 651], "unown": [201, *range(652, 679)]}


def toid(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower().replace("♀", "f").replace("♂", "m"))


def smogon_src_id(name: str) -> str:
    """Smogon's source file naming: 'Mr. Mime' → mr_mime, 'Nidoran♀' → nidoran_f, 'Ho-Oh' → ho_oh."""
    n = name.lower().replace("♀", "_f").replace("♂", "_m").replace(". ", "_").replace(" ", "_").replace("-", "_")
    return re.sub(r"[^a-z0-9_]", "", n)


def pokesprite_slug(name: str) -> str:
    n = name.lower().replace("♀", "-f").replace("♂", "-m").replace(". ", "-").replace(" ", "-")
    return re.sub(r"[^a-z0-9-]", "", n)


def sha(p: Path) -> str | None:
    return hashlib.sha1(p.read_bytes()).hexdigest()[:12] if p.is_file() else None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--install", required=True)
    ap.add_argument("--pokeapi", required=True)
    ap.add_argument("--smogon", required=True)
    ap.add_argument("--pokesprite", required=True)
    a = ap.parse_args()
    icons = Path(a.install) / "private" / "assets" / "icons"
    battle = Path(a.install) / "private" / "assets" / "battle"
    pa = set(Path(a.pokeapi).read_text().split("\n"))
    sm = set(Path(a.smogon).read_text().split("\n"))
    ps = set(Path(a.pokesprite).read_text().split("\n"))
    BW = "sprites/pokemon/versions/generation-v/black-white/"
    forms = json.loads((ROOT / "companion/data/forms.json").read_text())["forms"]
    species = {s["id"]: s for s in json.loads((ROOT / "companion/data/species_index.json").read_text())["species"]}

    def pokeapi(stem: str) -> dict:
        return {"name": stem, "animated": BW + f"animated/{stem}.gif" in pa, "animated_shiny": BW + f"animated/shiny/{stem}.gif" in pa,
                "static": BW + f"{stem}.png" in pa, "static_shiny": BW + f"shiny/{stem}.png" in pa}

    def smogon(name: str, forme: str | None) -> dict:
        sp = toid(name)
        stem = f"s{smogon_src_id(name)}" + (f"-o{forme}" if forme else "")
        g = "src/sprites/gen5/"
        ext = "gif" if g + stem + ".gif" in sm else "png" if g + stem + ".png" in sm else None
        return {"name": stem, "exists": ext is not None, "animated": ext == "gif", "shiny": bool(ext) and g + f"{stem}-s.{ext}" in sm,
                # Showdown's served name (play.pokemonshowdown.com/sprites/gen5ani/<name>.gif) is derived from the source name,
                # not checked against the live site.
                "served_name": sp + (f"-{forme.replace('_', '')}" if forme else "")}

    out_forms = {}
    for f in forms:
        key = f"{f['species_id']}:{f['form_key']}"
        sp = species[f["species_id"]]
        sid, fk = f["species_id"], f["form_key"]
        sm_forme = {"blue-striped": "blue_striped"}.get(fk, fk)
        ps_slug = f"{pokesprite_slug(sp['name'])}-{fk}"
        e = {"client": {"icon_slot": ICON_SLOTS.get(key), "front_slot": FRONT_SLOTS.get(key)},
             "pokeapi": pokeapi(f"{sid}-{fk}"), "smogon": smogon(sp["name"], sm_forme),
             "pokesprite": {"name": ps_slug, "exists": f"icons/pokemon/regular/{ps_slug}.png" in ps,
                            "shiny": f"icons/pokemon/shiny/{ps_slug}.png" in ps}}
        c = e["client"]
        if c["icon_slot"]:
            c["icon_sha1"] = sha(icons / f"{c['icon_slot']}-0.png")
            c["icon_shiny_sha1"] = sha(icons / f"{c['icon_slot']}-0-s.png")
        if c["front_slot"]:
            c["front_sha1"] = sha(battle / f"{c['front_slot']}-front-n.png")
            c["front_shiny_sha1"] = sha(battle / f"{c['front_slot']}-front-s.png")
        out_forms[key] = e
    out_species = {}
    for sid, sp in sorted(species.items()):
        out_species[str(sid)] = {"pokeapi": pokeapi(str(sid)), "smogon": smogon(sp["name"], None),
                                 "pokesprite": pokesprite_slug(sp["name"])}
    doc = {"format": 1, "checked": "2026-11-23",
           "about": "Where correct artwork for each catalogued form exists. Client slots were verified by eye against the "
                    "2026-11-16 PokeMMO dump; external entries record only whether a file NAME exists in each public repository "
                    "(no artwork is bundled). See docs/research/phase-5/01-FORM-SPRITE-COVERAGE.md.",
           "placeholder_slots": PLACEHOLDER_SLOTS,
           "sources": {
               "client": {"label": "Your PokeMMO client dump", "reuse": "Private to you; never redistributed by the Companion."},
               "pokeapi": {"label": "PokéAPI sprites (black-white)", "repo": "https://github.com/PokeAPI/sprites",
                           "reuse": "Repository CC0, but its LICENCE states all image contents are © The Pokémon Company. Not bundled."},
               "smogon": {"label": "Smogon / Pokémon Showdown sprites (gen5)", "repo": "https://github.com/smogon/sprites",
                          "reuse": "Code MIT; sprites © Nintendo/Game Freak/TPC; community-made sprites have no settled licence "
                                   "('talk to us first'). Not bundled or hotlinked."},
               "pokesprite": {"label": "PokéSprite box icons", "repo": "https://github.com/msikma/pokesprite",
                              "reuse": "Code MIT; sprite images © Nintendo/Creatures/GAME FREAK. Not bundled."}},
           "forms": out_forms, "species": out_species}
    (ROOT / "companion/data/form_art.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(len(out_forms), "forms;", len(out_species), "species")


if __name__ == "__main__":
    main()
