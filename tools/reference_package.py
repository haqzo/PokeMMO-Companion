"""Maintainer tool: build and sign PokeMMO reference-data packages (2026-11-24).

  python3 tools/reference_package.py keygen --out ~/companion-data-key        # once; keep the private key offline
  python3 tools/reference_package.py build --src companion/data/reference --revision 2 --out dist/data
  python3 tools/reference_package.py index --key ~/companion-data-key.private --url-base https://…/ dist/data/*.json

`build` validates the dataset exactly like the app does (schema, structure, coverage) before writing
reference-<date>-r<rev>.zip and its index entry. `index` writes a signed index.json. Upload the zip(s) and index.json
to the approved location, put that URL in REFERENCE_INDEX_URL and the public key in REFERENCE_PUBLIC_KEY
(companion/services/refdata.py). Nothing here executes code from a package; packages contain only JSON.
"""
import argparse
import base64
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from companion.services.refdata import build_package, coverage, read_dataset  # noqa: E402

BASELINE = {"species": 649, "skills": 559, "location_rows": 33405}


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    k = sub.add_parser("keygen")
    k.add_argument("--out", required=True)
    b = sub.add_parser("build")
    b.add_argument("--src", required=True)
    b.add_argument("--revision", type=int, required=True)
    b.add_argument("--out", required=True)
    i = sub.add_parser("index")
    i.add_argument("--key", required=True)
    i.add_argument("--url-base", required=True)
    i.add_argument("entries", nargs="+")
    a = ap.parse_args()
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    if a.cmd == "keygen":
        key = Ed25519PrivateKey.generate()
        raw = key.private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw, serialization.NoEncryption())
        pub = key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        Path(a.out + ".private").write_text(base64.b64encode(raw).decode())
        Path(a.out + ".private").chmod(0o600)
        Path(a.out + ".public").write_text(base64.b64encode(pub).decode())
        print("public key (REFERENCE_PUBLIC_KEY):", base64.b64encode(pub).decode())
        return 0
    if a.cmd == "build":
        ds = read_dataset(Path(a.src))
        cov = coverage(ds)
        low = {k: (cov.get(k), v) for k, v in BASELINE.items() if (cov.get(k) or 0) < v}
        if low:
            print("refusing: below the coverage baseline", low, file=sys.stderr)
            return 1
        pkg, entry = build_package(Path(a.src), a.revision)
        out = Path(a.out)
        out.mkdir(parents=True, exist_ok=True)
        name = f"reference-{entry['dump_date']}-r{a.revision}.zip"
        (out / name).write_bytes(pkg)
        (out / (name + ".json")).write_text(json.dumps({**entry, "file": name}, indent=1))
        print(json.dumps({**entry, "file": name, "coverage": cov}, indent=1))
        return 0
    key = Ed25519PrivateKey.from_private_bytes(base64.b64decode(Path(a.key).read_text().strip()))
    entries = []
    for f in a.entries:
        e = json.loads(Path(f).read_text())
        e["url"] = a.url_base.rstrip("/") + "/" + e.pop("file")
        entries.append(e)
    body = json.dumps({"format": "pokemmo-companion-reference-index", "datasets": entries}, sort_keys=True).encode()
    Path("index.json").write_text(json.dumps({"index": base64.b64encode(body).decode(), "signature": base64.b64encode(key.sign(body)).decode()}))
    print("wrote index.json with", len(entries), "dataset(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
