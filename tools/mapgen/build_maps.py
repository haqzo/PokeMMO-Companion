#!/usr/bin/env python3
"""DEVELOPER TOOL — render the Companion's original region maps and their click geometry.

    python tools/mapgen/build_maps.py

Reads tools/mapgen/regions.py (hand-made layouts) and the bundled PokeMMO reference data, and writes
companion/data/maps/<map>.svg plus companion/data/maps/geometry.json. Artwork and click targets come from the
same layout, so they always line up. The build fails if a feature names a location that does not exist in the
bundled data; locations that no feature covers are reported (and listed as "not on the map" in the app).
"""
from __future__ import annotations

import gzip
import hashlib
import json
import math
import random
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.mapgen.regions import MAPS  # noqa: E402
from tools.mapgen.game_layouts import GAME_MAPS  # noqa: E402

OUT = ROOT / "companion" / "data" / "maps"
GAME_DIR = ROOT / "companion" / "data" / "maps" / "game"  # in-game artwork (decoded with companion/services/region_maps.py)
U = 10  # px per grid unit
VERSION = 1

SEA, SEA_LINE, SAND, LAND, LAND_DARK, LAND_HI = "#4f9fdc", "#6fb6ea", "#e9dba2", "#86c763", "#5f9e48", "#a5d97c"
ROUTE, ROUTE_EDGE, SEA_ROUTE = "#f2cf72", "#b9862f", "#d9f0ff"
TOWN, TOWN_BIG, TOWN_EDGE = "#e2574c", "#cf3f3a", "#fff7ea"


def locations_by_region() -> dict[str, list[dict]]:
    sp = json.loads(gzip.decompress((ROOT / "companion" / "data" / "reference" / "species.json.gz").read_bytes()))
    out: dict[str, dict] = defaultdict(dict)
    for s in sp.values():
        for l in s.get("locations", []):
            key = f"{l['region']}:{l.get('location_id') or l['area']}"
            out[l["region"]][key] = {"id": key, "name": l["area"]}
    return {r: sorted(v.values(), key=lambda x: x["id"]) for r, v in out.items()}


def match(pattern: str, name: str) -> bool:
    pattern = pattern.lstrip("?")
    if not pattern.endswith("*"):
        return name == pattern
    p = pattern[:-1]
    if "(" in p and not p.endswith(")"):
        return name.startswith(p)
    return name == p or name.startswith(p + " (")


def P(pt, towns):
    if isinstance(pt, str):
        return towns[pt]
    return pt


def wobble_rect(x1, y1, x2, y2, r, seed):
    """A rounded rectangle with a gently irregular coastline (deterministic)."""
    rnd = random.Random(seed)
    pts = []
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    w, h = (x2 - x1) / 2 + r, (y2 - y1) / 2 + r
    n = 72
    for i in range(n):
        a = 2 * math.pi * i / n
        # superellipse gives a rounded-rectangle feel
        ca, sa = math.cos(a), math.sin(a)
        ex = 2 / 5
        x = cx + w * math.copysign(abs(ca) ** ex, ca)
        y = cy + h * math.copysign(abs(sa) ** ex, sa)
        k = 1 + 0.035 * math.sin(3 * a + seed) + 0.025 * math.sin(7 * a + seed * 2) + rnd.uniform(-0.012, 0.012)
        pts.append((cx + (x - cx) * k, cy + (y - cy) * k))
    return pts


def path_d(pts, closed=True):
    d = "M" + " L".join(f"{x * U:.1f},{y * U:.1f}" for x, y in pts)
    return d + (" Z" if closed else "")


def svg_for(m: dict) -> tuple[str, list[dict]]:
    W, H = m["size"]
    towns = {f["id"]: f["at"] for f in m["features"] if f["kind"] == "town"}
    seed = int(hashlib.sha1(m["id"].encode()).hexdigest()[:6], 16)
    land, shore = [], []
    for i, (a, b, r) in enumerate(m.get("land", [])):
        d = path_d(wobble_rect(a[0], a[1], b[0], b[1], r, seed + i))
        land.append(f'<path d="{d}"/>')
    for f in m["features"]:
        if f["kind"] == "route":
            for line in f["path"]:
                pts = [P(p, towns) for p in line]
                land.append(f'<path d="{path_d(pts, False)}" fill="none" stroke-width="{9 * U}" stroke-linecap="round" stroke-linejoin="round"/>')
        elif f["kind"] in ("town", "cave", "landmark", "area") and f.get("land", True):
            x, y = f["at"]
            land.append(f'<circle cx="{x * U}" cy="{y * U}" r="{(6.5 if f["kind"] == "town" else 4.5) * U}"/>')
    body = []
    body.append(f'<rect width="{W * U}" height="{H * U}" fill="url(#sea)"/>')
    # shore (sand) = land drawn wider underneath, then the land itself, then a lighter inner tone
    body.append(f'<g fill="{SAND}" stroke="{SAND}" stroke-width="{2.4 * U}" stroke-linejoin="round">{"".join(land)}</g>')
    body.append(f'<g fill="url(#land)" stroke="url(#land)">{"".join(land)}</g>')
    for (x, y, r) in m.get("lakes", []):
        body.append(f'<circle cx="{x * U}" cy="{y * U}" r="{(r + 0.8) * U}" fill="{SAND}"/><circle cx="{x * U}" cy="{y * U}" r="{r * U}" fill="url(#sea)"/>')
    for (x, y) in m.get("forests", []):
        g = []
        for dx, dy, s in ((-1.4, 0.6, 1.5), (1.3, 0.8, 1.4), (0, -0.9, 1.7), (0.2, 1.6, 1.2)):
            g.append(f'<circle cx="{(x + dx) * U:.0f}" cy="{(y + dy) * U:.0f}" r="{s * U:.0f}"/>')
        body.append(f'<g fill="{LAND_DARK}" stroke="#3f7a33" stroke-width="2">{"".join(g)}</g>')
    for (x, y) in m.get("mountains", []):
        X, Y = x * U, y * U
        body.append(f'<path d="M{X - 26},{Y + 18} L{X},{Y - 22} L{X + 26},{Y + 18} Z" fill="#b08a5a" stroke="#6e5232" stroke-width="3" stroke-linejoin="round"/>'
                    f'<path d="M{X - 9},{Y - 8} L{X},{Y - 22} L{X + 9},{Y - 8} L{X + 3},{Y - 5} L{X - 3},{Y - 9} Z" fill="#f4f1ea"/>')
    # sea routes (dashed lanes), land routes (paths with an outline)
    for f in m["features"]:
        if f["kind"] == "sea":
            for line in f["path"]:
                pts = [P(p, towns) for p in line]
                body.append(f'<path d="{path_d(pts, False)}" fill="none" stroke="{SEA_ROUTE}" stroke-width="{1.4 * U}" stroke-dasharray="{1.2 * U} {0.8 * U}" stroke-linecap="round" opacity=".85"/>')
    for f in m["features"]:
        if f["kind"] == "route":
            for line in f["path"]:
                pts = [P(p, towns) for p in line]
                body.append(f'<path d="{path_d(pts, False)}" fill="none" stroke="{ROUTE_EDGE}" stroke-width="{3.2 * U}" stroke-linecap="round" stroke-linejoin="round"/>')
    for f in m["features"]:
        if f["kind"] == "route":
            for line in f["path"]:
                pts = [P(p, towns) for p in line]
                body.append(f'<path d="{path_d(pts, False)}" fill="none" stroke="{ROUTE}" stroke-width="{2.3 * U}" stroke-linecap="round" stroke-linejoin="round"/>')
    for f in m["features"]:
        k, at = f["kind"], f.get("at")
        if k == "town":
            w, h = (5.2, 4.0) if f.get("big") else (4.0, 3.2)
            x, y = at[0] * U - w * U / 2, at[1] * U - h * U / 2
            body.append(f'<rect x="{x:.0f}" y="{y:.0f}" width="{w * U:.0f}" height="{h * U:.0f}" rx="8" fill="{TOWN_BIG if f.get("big") else TOWN}" stroke="{TOWN_EDGE}" stroke-width="5"/>'
                        f'<rect x="{x + 9:.0f}" y="{y + 8:.0f}" width="{w * U - 18:.0f}" height="{h * U * 0.32:.0f}" rx="3" fill="#ffffff" opacity=".35"/>')
        elif k == "cave":
            X, Y = at[0] * U, at[1] * U
            body.append(f'<path d="M{X - 17},{Y + 12} Q{X - 17},{Y - 16} {X},{Y - 16} Q{X + 17},{Y - 16} {X + 17},{Y + 12} Z" fill="#7b5a3a" stroke="#3d2b1a" stroke-width="4"/>'
                        f'<path d="M{X - 8},{Y + 12} Q{X - 8},{Y - 4} {X},{Y - 4} Q{X + 8},{Y - 4} {X + 8},{Y + 12} Z" fill="#1d140c"/>')
        elif k == "landmark":
            X, Y = at[0] * U, at[1] * U
            body.append(f'<rect x="{X - 11}" y="{Y - 15}" width="22" height="28" rx="3" fill="#d9d3c4" stroke="#4b4536" stroke-width="4"/>'
                        f'<path d="M{X - 14},{Y - 13} L{X},{Y - 25} L{X + 14},{Y - 13} Z" fill="#8a5a8a" stroke="#4b4536" stroke-width="3"/>')
        elif k == "area":
            X, Y = at[0] * U, at[1] * U
            body.append(f'<circle cx="{X}" cy="{Y}" r="22" fill="#ffffff" fill-opacity=".18" stroke="#ffffff" stroke-width="4" stroke-dasharray="7 5"/>'
                        f'<circle cx="{X}" cy="{Y}" r="6" fill="#ffffff"/>')
    defs = (f'<defs><pattern id="sea" width="16" height="12" patternUnits="userSpaceOnUse"><rect width="16" height="12" fill="{SEA}"/>'
            f'<rect y="3" width="10" height="2" fill="{SEA_LINE}"/><rect x="8" y="9" width="8" height="2" fill="{SEA_LINE}"/></pattern>'
            f'<pattern id="land" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="{LAND}"/>'
            f'<rect x="2" y="3" width="2" height="2" fill="{LAND_HI}"/><rect x="8" y="8" width="2" height="2" fill="{LAND_DARK}" opacity=".45"/></pattern></defs>')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W * U} {H * U}" width="{W * U}" height="{H * U}" shape-rendering="geometricPrecision">'
           f'<title>{m["label"]} — original PokeMMO Companion map</title>{defs}{"".join(body)}</svg>')
    return svg, towns


def geometry_for(m: dict, towns: dict, locs: list[dict]) -> tuple[list[dict], list[str]]:
    W, H = m["size"]
    errors, feats = [], []
    for f in m["features"]:
        ids = []
        for pat in f["locs"]:
            hit = [l["id"] for l in locs if match(pat, l["name"])]
            if not hit and not pat.startswith("?"):
                errors.append(f"{m['id']}/{f['id']}: no location matches {pat!r}")
            ids += [h for h in hit if h not in ids]
        g = {"id": f["id"], "name": f["name"], "kind": f["kind"], "location_ids": ids}
        if f["kind"] in ("route", "sea"):
            g["lines"] = [[[round(P(p, towns)[0] / W, 5), round(P(p, towns)[1] / H, 5)] for p in line] for line in f["path"]]
            g["width"] = 3.4 * U
        elif f["kind"] == "town":
            w, h = (5.2, 4.0) if f.get("big") else (4.0, 3.2)
            x, y = f["at"]
            g.update(x=round((x - w / 2) / W, 5), y=round((y - h / 2) / H, 5), w=round(w / W, 5), h=round(h / H, 5))
        elif f["kind"] != "list":
            g.update(x=round(f["at"][0] / W, 5), y=round(f["at"][1] / H, 5))
        feats.append(g)
    return feats, errors


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    by_region = locations_by_region()
    manifest = {"version": VERSION, "maps": [], "coverage": {}, "rights": {
        "artwork": "Original artwork drawn for the PokeMMO Companion from hand-made layouts (tools/mapgen/regions.py). "
                   "No game graphics, ROM extracts or third-party map images are used.",
        "geometry": "Click targets generated from the same layouts; linked to location ids of the bundled PokeMMO reference data.",
        "license": "Same license as the Companion source code."}}
    all_errors = []
    covered: dict[str, set] = defaultdict(set)
    for m in MAPS:
        region = m.get("region", m["id"])
        svg, towns = svg_for(m)
        (OUT / f"{m['id']}.svg").write_text(svg, encoding="utf-8")
        feats, errors = geometry_for(m, towns, by_region.get(region, []))
        all_errors += errors
        for f in feats:
            covered[region].update(f["location_ids"])
        W, H = m["size"]
        manifest["maps"].append({"id": m["id"], "region": region, "label": m["label"], "file": f"{m['id']}.svg",
                                 "w": W * U, "h": H * U, "parent": None if m.get("region") is None else region,
                                 "submaps": m.get("submaps", []),
                                 "sha256": hashlib.sha256(svg.encode()).hexdigest(), "features": feats})
    # ---- in-game artwork (owner decision): same feature ids, geometry placed on the in-game images
    import struct
    feats_by_region: dict[str, dict] = defaultdict(dict)
    for mm in manifest["maps"]:
        for f in mm["features"]:
            feats_by_region[mm["region"]][f["id"]] = f
    game_cov: dict[str, set] = defaultdict(set)
    for gm in GAME_MAPS:
        png = (GAME_DIR / gm["file"]).read_bytes()
        Wp, Hp = struct.unpack(">II", png[16:24])
        ox, oy = gm["origin"]
        nx = lambda x: round((x - ox) * 8 / Wp, 5)
        ny = lambda y: round((y - oy) * 8 / Hp, 5)
        feats = []
        for fid, shape in gm["features"].items():
            base = feats_by_region[gm["region"]].get(fid)
            if not base:
                all_errors.append(f"game/{gm['id']}: unknown feature {fid}")
                continue
            g = {"id": fid, "name": base["name"], "kind": base["kind"], "location_ids": base["location_ids"]}
            if shape[0] == "rect":
                _, x, y, w, h = shape
                g.update(x=nx(x), y=ny(y), w=round(w * 8 / Wp, 5), h=round(h * 8 / Hp, 5))
            elif shape[0] == "line":
                g["lines"] = [[[nx(x), ny(y)] for x, y in line] for line in shape[1:]]
                g["width"] = 7
            else:
                g.update(x=nx(shape[1]), y=ny(shape[2]))
            for k in ("x", "y"):
                if k in g and not 0 <= g[k] <= 1:
                    all_errors.append(f"game/{gm['id']}/{fid}: {k} outside the image")
            game_cov[gm["region"]].update(g["location_ids"])
            feats.append(g)
        # non-geographic entries (e.g. Honey Trees) stay listed
        extra = [f for f in feats_by_region[gm["region"]].values() if f["kind"] == "list" and gm["id"] == gm["region"]]
        for f in extra:
            game_cov[gm["region"]].update(f["location_ids"])
        feats += extra
        manifest["maps"].append({"id": "game-" + gm["id"], "region": gm["region"], "label": gm["label"], "file": "game/" + gm["file"],
                                 "w": Wp, "h": Hp, "style": "game", "source": gm["source"], "parent": None, "submaps": [],
                                 "sha256": hashlib.sha256(png).hexdigest(), "features": feats})
    manifest["rights"]["game_artwork"] = (
        "In-game Town Map / Pokégear artwork (© Nintendo / Creatures / GAME FREAK) decoded from the maintainer's own ROMs "
        "and shipped by OWNER DECISION 2026-11-23 (the owner takes the legal decision). Unova: in-game art not located; the "
        "original Companion map is used.")
    for region, locs in sorted(by_region.items()):
        ids = {l["id"] for l in locs}
        miss = sorted((l["name"], l["id"]) for l in locs if l["id"] not in covered[region])
        clickable = sum(1 for mm in manifest["maps"] if mm["region"] == region and mm.get("style") != "game" for f in mm["features"] if f["kind"] != "list")
        gmiss = sorted(l["name"] for l in locs if l["id"] not in game_cov[region]) if game_cov.get(region) else None
        manifest["coverage"][region] = {"locations": len(ids), "linked": len(ids & covered[region]), "click_targets": clickable,
                                        "not_on_map": [n for n, _ in miss],
                                        "game": None if gmiss is None else {"linked": len(ids & game_cov[region]), "not_on_map": gmiss,
                                                 "click_targets": sum(1 for mm in manifest["maps"] if mm["region"] == region and mm.get("style") == "game" for f in mm["features"] if f["kind"] != "list")}}
    (OUT / "geometry.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=0), encoding="utf-8")
    for r, c in manifest["coverage"].items():
        print(f"{r:7} companion map: linked {c['linked']}/{c['locations']} · targets {c['click_targets']} · missing {c['not_on_map']}")
        if c["game"]:
            print(f"{'':7} in-game map:   linked {c['game']['linked']}/{c['locations']} · targets {c['game']['click_targets']} · missing {c['game']['not_on_map']}")
    for e in all_errors:
        print("ERROR", e)
    return 1 if all_errors else 0


if __name__ == "__main__":
    sys.exit(main())
