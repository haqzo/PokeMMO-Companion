"""Generate offline display names from pinned PokéAPI CSVs and bundled PokeMMO data.

Run from the repository root with the CSV directory as the only argument.
PokéAPI source revision: de6760be38b60a3024f1d9054330ff265f0dc619.
"""
import csv
import gzip
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

DATA = Path("companion/data/reference")
LANGUAGES = {"9": "en", "7": "es", "12": "zh"}


def normalize(text):
    return "".join(c for c in unicodedata.normalize("NFKD", text.lower()) if c.isalnum())


def rows(path, table):
    with (path / f"{table}.csv").open(encoding="utf-8", newline="") as source:
        return list(csv.DictReader(source))


def translations(path, table, field="name"):
    out = defaultdict(dict)
    for row in rows(path, table):
        if (language := LANGUAGES.get(row["local_language_id"])) and row.get(field):
            out[next(iter(row.values()))][language] = row[field]
    return out


def by_english(translated):
    names = defaultdict(list)
    for entry in translated.values():
        if entry.get("en"):
            names[normalize(entry["en"])].append(entry)
    return {name: entries[0] for name, entries in names.items() if len(entries) == 1}


def load(name):
    with gzip.open(DATA / f"{name}.json.gz", "rt", encoding="utf-8") as stream:
        return json.load(stream)


def build(path):
    species, items, extras = load("species"), load("items")["groups"], load("extras")
    species_names = translations(path, "pokemon_species_names")
    species_categories = translations(path, "pokemon_species_names", "genus")
    form_metadata = {row["id"]: row for row in rows(path, "pokemon_forms")}
    pokemon_species = {row["id"]: row["species_id"] for row in rows(path, "pokemon")}
    form_names = translations(path, "pokemon_form_names", "form_name")
    forms = json.loads(Path("companion/data/forms.json").read_text(encoding="utf-8"))["forms"]
    out = {lang: {} for lang in LANGUAGES.values()}
    for lang in out:
        out[lang]["species"] = {sid: species_names[sid][lang] for sid in species if lang in species_names[sid]}
        out[lang]["category"] = {sid: species_categories[sid][lang] for sid in species if lang in species_categories[sid]}

    def add(domain, table, candidates=None):
        terms = by_english(translations(path, table))
        keys = set(terms) if candidates is None else {normalize(name) for name in candidates if name}
        for lang in out:
            out[lang][domain] = {key: terms[key][lang] for key in sorted(keys) if lang in terms.get(key, {})}

    add("move", "move_names", [move["name"] for move in extras["skills"]] +
        [move["name"] for entry in species.values() for move in entry["moves"]])
    # These four legacy client spellings share their move IDs with the named PokéAPI rows.
    renamed_moves = {11: "ViceGrip", 136: "Hi Jump Kick", 185: "Faint Attack", 265: "SmellingSalt"}
    move_names = translations(path, "move_names")
    for move in extras["skills"]:
        if renamed_moves.get(move["id"]) != move["name"]:
            continue
        for lang in out:
            if name := move_names[str(move["id"])].get(lang):
                out[lang]["move"][normalize(move["name"])] = name
    add("ability", "ability_names", [ability["name"] for entry in species.values() for ability in entry["abilities"]])
    add("item", "item_names", [item["name"] for item in items])
    add("location", "location_names", [loc["area"] for entry in species.values() for loc in entry["locations"]])
    for domain, table in (("type", "type_names"), ("nature", "nature_names"), ("region", "region_names"),
                          ("stat", "stat_names"), ("egg", "egg_group_prose"), ("growth", "growth_rate_prose"),
                          ("category_move", "move_damage_class_prose"), ("encounter", "encounter_method_prose"),
                          ("evolution", "evolution_trigger_prose")):
        add(domain, table)
    for entry in rows(Path("tools/localization"), "location-names"):
        for lang in ("es", "zh"):
            out[lang]["location"][normalize(entry["en"])] = entry[lang]
    for lang in ("es", "zh"):
        for item in items:
            if name := item.get("names", {}).get(lang):
                out[lang]["item"][normalize(item["name"])] = name
    # Expand known client references without modifying the raw bundled data.
    item_fixes = json.loads(Path('tools/localization/item-string-references.json').read_text(encoding='utf-8'))
    for lang in ('es', 'zh'):
        for key, value in out[lang]['item'].items():
            out[lang]['item'][key] = re.sub(r'\{STRING_(\d+)\}',
                lambda m: item_fixes['tokens'].get(m[1], {}).get(lang, m[0]), value)
        for key, value in item_fixes['overrides'].get(lang, {}).items():
            out[lang]['item'][key] = value
    # Match form names on both species and normalized English form labels.
    known_forms = defaultdict(dict)
    for fid, labels in form_names.items():
        row = form_metadata.get(fid)
        sid = pokemon_species.get(row["pokemon_id"]) if row else None
        if sid and labels.get("en"):
            known_forms[sid][normalize(labels["en"])] = labels

    base_forms = json.loads(Path("companion/data/forms.json").read_text(encoding="utf-8"))["base_form_names"]
    for lang in out:
        out[lang]["form"] = {}
        for entry in forms:
            sid, label = str(entry["species_id"]), entry["form_name"]
            found = known_forms[sid].get(normalize(label))
            if found and lang in found:
                out[lang]["form"][f"{sid}:{normalize(label)}"] = found[lang]
        for sid, label in base_forms.items():
            found = known_forms[sid].get(normalize(label))
            if found and lang in found:
                out[lang]["form"][f"{sid}:{normalize(label)}"] = found[lang]
    return out


if __name__ == "__main__":
    catalog = build(Path(sys.argv[1]))
    # One line per domain makes the generated catalog diffable without expanding every entry.
    lines = ["// Generated by tools/build_game_terms.py. See CREDITS.md for attribution.", "export const GAME_TERMS = {"]
    for lang, domains in catalog.items():
        lines.append(f"  {lang}: {{")
        for domain, entries in domains.items():
            lines.append(f"    {domain}: {json.dumps(entries, ensure_ascii=False, separators=(',', ':'))},")
        lines.append("  },")
        print(lang, {key: len(entries) for key, entries in domains.items()})
    lines.append("};")
    Path("ui/js/game-terms.js").write_text("\n".join(lines) + "\n", encoding="utf-8")
