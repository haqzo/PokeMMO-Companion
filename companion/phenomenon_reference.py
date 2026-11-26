"""Small, offline Phenomena reference backed by existing Location Explorer IDs."""

import re
import unicodedata

# Spot directions and access requirements come from the owner-verified callouts
# summarized in tests/fixtures/phenomena.json and docs/build/25-PHENOMENA-REFERENCE.md.
SPOTS = {
    "village-bridge-southwest": ("unova:255", "grass", "bottom left"),
    "route-1-west-middle": ("unova:317", "shadow", "middle left"),
}

# Only the two abbreviations supplied in the Batch 04 handoff. They identify areas.
CALLOUTS = {"三草": ("Route 3", "grass"), "11水": ("Route 11", "water")}
NAMES = {
    "puente villa": "Village Bridge", "村庄桥": "Village Bridge",
    "cueva manantial": "Wellspring Cave", "泉源洞穴": "Wellspring Cave",
}
TYPES = {
    "grass": ("grass", "rustling grass", "hierba que se agita", "摇动的草丛"),
    "water": ("water", "rippling water", "agua agitada", "涟漪水面"),
    "dust": ("dust", "dust cloud", "nube de polvo", "扬尘"),
    "shadow": ("shadow", "moving shadow", "flying shadow", "sombra en movimiento", "移动的影子"),
}


def label(text):
    return " ".join(unicodedata.normalize("NFKC", text or "").casefold().split())


def match_area(dex, region, text):
    name = label(text)
    callout = CALLOUTS.get(name) if region == "unova" else None
    if callout:
        name = callout[0]
    if match := re.fullmatch(r"(?:ruta (\d+)|(\d+)号道路)", name):
        name = "Route " + (match[1] or match[2])
    for alias, canonical in NAMES.items():
        if name == alias or name.startswith((alias + " ", alias + "(")):
            name = canonical + name[len(alias):]
            break
    return dex.match_location(region, name)


def relay_location(dex, report):
    raw = label(report["location"])
    region = report["region"]
    kind = next((kind for kind, names in TYPES.items() if label(report["type"]) in names), None)
    callout = CALLOUTS.get(raw) if region in (None, "unova") else None
    if callout and kind in (None, callout[1]):
        region, kind = "unova", callout[1]
    area = match_area(dex, region, raw)
    direction = label(report["notes"]).removeprefix("(").removesuffix(")").strip()
    spot = next((key for key, value in SPOTS.items() if value == (area.get("id"), kind, direction)), None)
    return {"location_match": area, "phenomenon_type": kind, "spot_id": spot, "resolved_region": region}


def reference(dex):
    rows = [
        ("unova:255", "grass", "village-bridge-southwest", "documented", 587),
        ("unova:365", "grass", None, "example", 587),
        ("unova:326", "water", None, "example", 594),
        ("unova:317", "shadow", "route-1-west-middle", "documented", None),
        ("unova:321", "grass", None, "callout", None),
        ("unova:365", "water", None, "callout", None),
        ("unova:324", None, None, "catalog", None),
        ("unova:325", None, None, "catalog", None),
    ]
    entries = []
    for location_id, kind, spot, evidence, species in rows:
        area = dex.location_reference(location_id)
        if area and area["region"] == "unova":
            entries.append({"area": area, "type": kind, "spot": spot, "evidence": evidence, "species": species})
    # Victory Road has repeated floor names. Preserve the group-level example separately.
    entries.append({"area": {"name": "Victory Road", "region": "unova"}, "type": "dust",
                    "spot": None, "evidence": "example", "species": 530})
    return entries
