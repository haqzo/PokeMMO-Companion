#!/usr/bin/env python3
"""DEVELOPER TOOL — build the bundled, offline PokeMMO reference dataset shipped with the Companion.

Players never run this. The maintainer imports their own PokeMMO client dump privately once
(`python -m companion --import-dumps <folder> --data-dir <private dir>`), then runs:

    python tools/build_reference.py <private data dir>/private/dex

It writes companion/data/reference/{species,extras,items}.json.gz + manifest.json.

What is kept (facts): species numbers, names, types, base stats, abilities, egg groups, growth, EV yields,
catch rate, evolutions, learnsets (move names/levels/methods), move statistics, item names/categories,
and every wild-encounter row (region, area, method, levels, season, horde, morning/day/night label).
What is removed: item description texts (game prose), artwork references (sprite/icon file names — no
images are bundled), and anything pointing at the maintainer's private paths.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "companion" / "data" / "reference"


def dump(name: str, data) -> dict:
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
    (OUT / name).write_bytes(gzip.compress(raw, 9, mtime=0))
    return {"file": name, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}


def main(src: str) -> None:
    src_dir = Path(src)
    mf = json.loads((src_dir / "manifest.json").read_text(encoding="utf-8"))
    species = json.loads((src_dir / "species.json").read_text(encoding="utf-8"))
    extras = json.loads((src_dir / "extras.json").read_text(encoding="utf-8"))
    items = json.loads((src_dir / "items.json").read_text(encoding="utf-8"))
    for g in items.get("groups", []):
        g.pop("desc", None)
        g.pop("descs", None)
        g.pop("icon", None)
        for r in g.get("records", []):
            r["has_icon"] = False
    st = items.get("stats") or {}
    if "records" in st:
        st.update(with_icon=0, missing_icon=st["records"])
    items["note"] = (items.get("note", "") + " Bundled copy: item description texts and icons are not included.").strip()
    OUT.mkdir(parents=True, exist_ok=True)
    files = [dump("species.json.gz", species), dump("extras.json.gz", extras), dump("items.json.gz", items)]
    rows = sum(len(s.get("locations", [])) for s in species.values())
    regions: dict[str, dict] = {}
    for s in species.values():
        for l in s.get("locations", []):
            r = regions.setdefault(l["region"], {"rows": 0, "locations": set()})
            r["rows"] += 1
            r["locations"].add(l.get("location_id") or l["area"])
    manifest = {
        "importer": mf.get("importer"), "schema": 1, "bundled": True,
        "built_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "imported_at": mf.get("imported_at"), "dump_date": mf.get("dump_date"),
        "source": {"kind": "PokeMMO client data dump (maintainer's own client files, processed privately)",
                   "files": {k: {"file": v.get("file"), "sha256": v.get("sha256")} for k, v in (mf.get("sources") or {}).items()
                             if k in ("pokedex", "strings")},
                   "dump_date": mf.get("dump_date")},
        "counts": {"species": len(species), "location_rows": rows, "skills": len(extras.get("skills", [])),
                   "item_groups": len(items.get("groups", [])),
                   "regions": {k: {"rows": v["rows"], "locations": len(v["locations"])} for k, v in sorted(regions.items())}},
        "files": files,
        "excluded": ["sprites, icons, battle sprites, item icons, cries (artwork/audio are not redistributed)",
                     "item description texts", "any path or file from the maintainer's computer"],
        "caveats": ["Encounter rows are as the client data lists them on the dump date; later patches may change them.",
                    "Rates are the client's own per-time labels; nothing is converted or estimated.",
                    "July 2026 encounter rebuild: verify against the dump date before calling data current."],
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(manifest["counts"], indent=1))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
