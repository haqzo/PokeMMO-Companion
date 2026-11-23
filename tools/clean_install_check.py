#!/usr/bin/env python3
"""Clean-install acceptance check (run by developers and CI; safe for anyone to run).

Starts the Companion on a brand-new, empty data folder with NO PokeMMO dump, NO ROMs and NO network
(outgoing connections other than to this computer are refused), then prints:
  * Pokédex / item / encounter counts that are available immediately,
  * the five built-in region maps (files present, integrity),
  * per region: eligible locations, locations linked to clickable map areas, click targets,
    encounter rows reachable from the map / all rows,
  * any broken links (map areas pointing to unknown locations),
  * one real click result per region (route → its PokeMMO encounters), through the HTTP API.

    python tools/clean_install_check.py
Exit status 0 only if every check passes.
"""
from __future__ import annotations

import hashlib
import json
import os
import socket
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# ---- no network: refuse every non-loopback connection for the whole check
_orig_connect = socket.socket.connect


def _guarded_connect(self, addr):
    host = addr[0] if isinstance(addr, tuple) else addr
    if host not in ("127.0.0.1", "::1", "localhost"):
        raise OSError(f"network disabled for the clean-install check (tried {host})")
    return _orig_connect(self, addr)


socket.socket.connect = _guarded_connect
os.environ.pop("POKEMMO_DUMPS_DIR", None)

from companion.app import AppContext  # noqa: E402
from companion.server import CompanionServer  # noqa: E402

CLICKS = {"kanto": "r1", "johto": "r29", "hoenn": "r101", "sinnoh": "r201", "unova": "r1u"}


def main() -> int:
    failures: list[str] = []
    with tempfile.TemporaryDirectory(prefix="pmc-clean-") as tmp:
        data = Path(tmp) / "data"
        ctx = AppContext(str(data))
        srv = CompanionServer(ctx, 0).start()

        def api(path):
            req = urllib.request.Request(srv.base_url.rstrip("/") + path, headers={"X-Companion-Token": ctx.token})
            with urllib.request.urlopen(req, timeout=10) as r:
                return json.loads(r.read())

        try:
            private = data / "private"
            pfiles = [p for p in private.rglob("*") if p.is_file()] if private.exists() else []
            print(f"Data folder: {data} (new) · files under private/: {len(pfiles)} (no personal PokeMMO data, no ROM artwork)")
            if pfiles:
                failures.append("private data unexpectedly present")
            st = api("/api/bootstrap")["dex"]
            print(f"Pokédex: {len(ctx.dex.species)} species with stats/moves · source {st.get('source_kind')} · client data dated {(st.get('manifest') or {}).get('dump_date')}")
            if st.get("source_kind") != "bundled" or len(ctx.dex.species) < 649:
                failures.append("bundled Pokédex data not active")
            print(f"Items: {len(ctx.items.catalog.get('groups', [])) if ctx.items.catalog else 0} · moves: {len(ctx.dex.extras.get('skills', []))}")
            locs = api("/api/locations")["locations"]
            all_ids = {l["id"] for l in locs}
            total_rows = sum(len(ctx.dex._locations[i]["rows"]) for i in all_ids)
            print(f"Encounter locations: {len(locs)} · encounter rows: {total_rows}")
            built = api("/api/maps/builtin")
            maps_dir = ROOT / "companion" / "data" / "maps"
            print("\nMaps")
            for m in built["maps"]:
                f = maps_dir / m["file"]
                ok = f.is_file() and hashlib.sha256(f.read_bytes()).hexdigest() == m["sha256"]
                with urllib.request.urlopen(srv.base_url.rstrip("/") + m["url"].split("?")[0], timeout=10) as r:
                    served = r.status == 200 and r.headers["Content-Type"] in ("image/svg+xml", "image/png")
                print(f"  {m['id']:16} {m['label']:22} {m['w']}×{m['h']} file {'ok' if ok else 'MISSING/CHANGED'} · served {'ok' if served else 'NO'} · {len(m['features'])} features")
                if not (ok and served):
                    failures.append(f"map {m['id']} not available")
            print("\nCoverage per region")
            print("  region   map style  linked/eligible  click targets  rows on map/all rows  broken ids")
            for region, style in [(r, st) for r in ("kanto", "johto", "hoenn", "sinnoh", "unova") for st in ("in-game", "companion")]:
                rmaps = [m for m in built["maps"] if m["region"] == region and (m.get("style") == "game") == (style == "in-game")]
                if not rmaps and style == "in-game":
                    print(f"  {region:7}  {style:9}  — no in-game artwork located; the Companion map is used")
                    continue
                if not rmaps:
                    failures.append(f"no map for {region}")
                    continue
                elig = {l["id"] for l in locs if l["region"] == region}
                linked, broken, targets = set(), [], 0
                for m in rmaps:
                    for f in m["features"]:
                        targets += f["kind"] != "list"
                        for i in f["location_ids"]:
                            (linked.add(i) if i in all_ids else broken.append(i))
                rows_all = sum(len(ctx.dex._locations[i]["rows"]) for i in elig)
                rows_map = sum(len(ctx.dex._locations[i]["rows"]) for i in elig & linked)
                print(f"  {region:7}  {style:9}  {len(elig & linked):4}/{len(elig):<4}        {targets:4}          {rows_map:5}/{rows_all:<5}          {len(broken)}")
                if broken or len(elig & linked) != len(elig):
                    failures.append(f"{region}: {len(elig) - len(elig & linked)} unlinked, {len(broken)} broken ids")
            print("\nOne click per region (map area → PokeMMO encounters)")
            for (region, fid), style in [(x, st) for x in CLICKS.items() for st in ("game", "companion")]:
                feat = next((f for m in built["maps"] if m["region"] == region and (m.get("style") == "game") == (style == "game")
                             for f in m["features"] if f["id"] == fid), None)
                if feat is None:
                    print(f"  {region:7} {style:9} (no in-game artwork for this region)")
                    continue
                d = api("/api/locations/" + urllib.request.quote(feat["location_ids"][0], safe=""))
                methods = sorted({r["method"] for r in d["rows"]})
                sample = ", ".join(sorted({f"{r['name']} Lv{r['min']}-{r['max']}" for r in d["rows"]})[:4])
                print(f"  {region:7} {style:9} click '{feat['name']}' → {d['id']} {d['name']}: {len({r['species_id'] for r in d['rows']})} Pokémon, "
                      f"{len(d['rows'])} rows, methods {methods}; e.g. {sample}")
                if not d["rows"]:
                    failures.append(f"{region}: click on {feat['name']} shows no encounters")
            sens = [p for p in ctx.paths.root.rglob("*") if p.suffix.lower() in (".gba", ".nds", ".zip")]
            print(f"\nROM / dump files in the data folder: {len(sens)}")
            if sens:
                failures.append("unexpected ROM/dump files in the data folder")
        finally:
            srv.stop()
            ctx.shutdown()
    print("\nRESULT:", "PASS" if not failures else "FAIL — " + "; ".join(failures))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
