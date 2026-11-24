#!/usr/bin/env python3
"""Clean-install acceptance check (run by developers and CI; safe for anyone to run).

Starts the Companion on a brand-new, empty data folder with NO PokeMMO dump, NO ROMs and NO network
(outgoing connections other than to this computer are refused), then prints:
  * Pokédex / item / encounter counts that are available immediately,
  * coverage against the bundled-data baseline (species, moves, items, locations, encounter rows),
  * the shipped map assets (files present, integrity — kept in the repository although the player UI
    no longer shows interactive maps since 2026-11-24),
  * per region: locations reachable from the Location Explorer directory (place cards + ungrouped
    locations) / all locations, encounter rows reachable / all rows, broken ids,
  * one real directory result per region (first route card → its PokeMMO encounters), through the HTTP API.

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

FIRST = {"kanto": "r1", "johto": "r29", "hoenn": "r101", "sinnoh": "r201", "unova": "r1u"}
# Bundled-data baseline (docs/build/16): a clean install must offer at least this much.
BASELINE = {"species": 649, "moves": 559, "items": 2090, "locations": 629, "rows": 33405}


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
            n_items = len(ctx.items.catalog.get('groups', [])) if ctx.items.catalog else 0
            n_moves = len(ctx.dex.extras.get('skills', []))
            print(f"Items: {n_items} · moves: {n_moves}")
            locs = api("/api/locations")["locations"]
            all_ids = {l["id"] for l in locs}
            total_rows = sum(len(ctx.dex._locations[i]["rows"]) for i in all_ids)
            print(f"Encounter locations: {len(locs)} · encounter rows: {total_rows}")
            have = {"species": len(ctx.dex.species), "moves": n_moves, "items": n_items, "locations": len(locs), "rows": total_rows}
            for k, need in BASELINE.items():
                if have[k] < need:
                    failures.append(f"{k}: {have[k]} < baseline {need}")
            print("Baseline: " + ", ".join(f"{k} {have[k]}/{v}" for k, v in BASELINE.items()))
            built = api("/api/maps/builtin")
            maps_dir = ROOT / "companion" / "data" / "maps"
            print("\nShipped map assets (kept; not shown as interactive maps)")
            for m in built["maps"]:
                f = maps_dir / m["file"]
                ok = f.is_file() and hashlib.sha256(f.read_bytes()).hexdigest() == m["sha256"]
                with urllib.request.urlopen(srv.base_url.rstrip("/") + m["url"].split("?")[0], timeout=10) as r:
                    served = r.status == 200 and r.headers["Content-Type"] in ("image/svg+xml", "image/png")
                print(f"  {m['id']:16} {m['label']:22} {m['w']}×{m['h']} file {'ok' if ok else 'MISSING/CHANGED'} · served {'ok' if served else 'NO'} · {len(m['features'])} features")
                if not (ok and served):
                    failures.append(f"map {m['id']} not available")
            print("\nLocation Explorer directory per region (no interactive map in the player UI)")
            print("  region   place cards  reachable/all locations  rows reachable/all  broken ids")
            companion = [m for m in built["maps"] if m.get("style") != "game"]
            for region in ("kanto", "johto", "hoenn", "sinnoh", "unova"):
                elig = {l["id"] for l in locs if l["region"] == region}
                grouped, broken, cards = set(), [], 0
                for m in (m for m in companion if m["region"] == region):
                    for f in m["features"]:
                        ids = [i for i in f["location_ids"]]
                        cards += 1
                        for i in ids:
                            (grouped.add(i) if i in all_ids else broken.append(i))
                ungrouped = elig - grouped           # listed as their own card, so every location is reachable
                cards += len(ungrouped)
                reach = (elig & grouped) | ungrouped
                rows_all = sum(len(ctx.dex._locations[i]["rows"]) for i in elig)
                rows_reach = sum(len(ctx.dex._locations[i]["rows"]) for i in reach)
                print(f"  {region:7}  {cards:6}       {len(reach):4}/{len(elig):<4}               {rows_reach:5}/{rows_all:<5}       {len(broken)}")
                if broken or reach != elig or not elig:
                    failures.append(f"{region}: {len(elig - reach)} unreachable, {len(broken)} broken ids")
            print("\nFirst route card per region → PokeMMO encounters")
            for region, fid in FIRST.items():
                feat = next((f for m in companion if m["region"] == region for f in m["features"] if f["id"] == fid), None)
                if feat is None:
                    failures.append(f"{region}: no '{fid}' place")
                    continue
                d = api("/api/locations/" + urllib.request.quote(feat["location_ids"][0], safe=""))
                methods = sorted({r["method"] for r in d["rows"]})
                sample = ", ".join(sorted({f"{r['name']} Lv{r['min']}-{r['max']}" for r in d["rows"]})[:4])
                print(f"  {region:7} '{feat['name']}' → {d['id']} {d['name']}: {len({r['species_id'] for r in d['rows']})} Pokémon, "
                      f"{len(d['rows'])} rows, methods {methods}; e.g. {sample}")
                if not d["rows"]:
                    failures.append(f"{region}: {feat['name']} shows no encounters")
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
