"""Maintainer tool: prepare the built-in Pokémon sprite library and item icons (2026-11-24).

  python3 tools/build_sprites.py --sprites <pokeapi-sprites folder or zip> [--items ItemSpriteDump.zip]

Sprites: the app's own validated importer (companion/services/sprite_library.py) reads a PokeAPI/sprites
checkout (Gen V Black/White front sprites only), maps every file by its exact species / form / female path,
refuses anything malformed or identical to the base artwork, and writes companion/data/sprites/. A form or
female variant that has an animation but no still gets a still made from the FIRST FRAME of that same
animation (same form, transparency kept, placed on the usual 96×96 canvas) and is marked `derived` — never a
different form's artwork. Nothing that does not exist is invented.

Item icons: PokeMMO's own item icon files (sprites/itemicons/<icon id>.png from the client's ItemSpriteDump)
are copied for the icon ids the bundled item dataset's records name (record id → icon_id, read from the client's
item data), so every icon maps to a PokeMMO item identifier.

The player application never needs the sources: everything ends up in companion/data/.
"""
import argparse
import gzip
import hashlib
import io
import json
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from companion.config import make_paths  # noqa: E402
from companion.services.sprite_library import SpriteLibrary, png_alpha_bbox  # noqa: E402

OUT = ROOT / "companion" / "data" / "sprites"
ITEM_OUT = ROOT / "companion" / "data" / "item-icons"
CREDITS = {
    "sprites": "Gen V Black/White sprites from the PokeAPI/sprites repository (github.com/PokeAPI/sprites). "
               "The repository is CC0; the images themselves are © Nintendo / Creatures Inc. / GAME FREAK / The Pokémon Company.",
    "derived": "Stills marked 'derived' are the first frame of that same Pokémon's animation.",
}


def first_frame_still(gif: bytes) -> bytes:
    from PIL import Image
    im = Image.open(io.BytesIO(gif))
    im.seek(0)
    fr = im.convert("RGBA")
    canvas = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    w, h = fr.size
    if w > 96 or h > 96:
        fr.thumbnail((96, 96), Image.NEAREST)
        w, h = fr.size
    canvas.paste(fr, ((96 - w) // 2, 96 - h - 4 if h <= 92 else 0))   # standing on the canvas floor like the BW stills
    b = io.BytesIO()
    canvas.save(b, "PNG", optimize=True)
    return b.getvalue()


def build_sprites(src: Path) -> dict:
    tmpdir = Path(tempfile.mkdtemp())
    lib = SpriteLibrary(make_paths(tmpdir / "profile"))
    res = lib.import_from(src)
    root = lib.private_root
    idx = json.loads((root / "index.json").read_text(encoding="utf-8"))
    derived = 0
    for key, e in idx["entries"].items():
        for still, ani in (("static", "ani"), ("static_shiny", "ani_shiny")):
            if still not in e and ani in e:
                data = first_frame_still((root / ani.replace("_", "-") / e[ani]["file"]).read_bytes())
                name = f"{key}.png"
                (root / still.replace("_", "-") / name).write_bytes(data)
                e[still] = {"file": name, "from": e[ani]["from"] + "#frame0", "layout": e[ani]["layout"], "frames": 1,
                            "w": 96, "h": 96, "sha1": hashlib.sha1(data).hexdigest()[:12], "bbox": png_alpha_bbox(data),
                            "derived": "first frame of the animation"}
                derived += 1
    for e in idx["entries"].values():
        for x in e.values():
            x["from"] = x["from"].split("sprites/pokemon/", 1)[-1]          # no local paths in the manifest
    idx.update({"format": 1, "kind": "built-in", "source": "PokeAPI/sprites (generation-v/black-white)", "credits": CREDITS,
                "imported_at": None, "refused": idx.get("refused", [])})
    idx["version"] = hashlib.sha1(json.dumps(idx["entries"], sort_keys=True).encode()).hexdigest()[:10]
    shutil.rmtree(OUT, ignore_errors=True)
    shutil.copytree(root, OUT)
    (OUT / "index.json").write_text(json.dumps(idx, separators=(",", ":")), encoding="utf-8")
    shutil.rmtree(tmpdir, ignore_errors=True)
    return {**res, "derived_stills": derived}


def build_items(src: Path) -> dict:
    items = json.loads(gzip.decompress((ROOT / "companion" / "data" / "reference" / "items.json.gz").read_bytes()))
    ids = {r["icon_id"] for g in items["groups"] for r in g["records"] if r.get("icon_id") is not None}
    shutil.rmtree(ITEM_OUT, ignore_errors=True)
    ITEM_OUT.mkdir(parents=True)
    have = {}
    with zipfile.ZipFile(src) as z:
        for n in z.namelist():
            name = n.rsplit("/", 1)[-1]
            if not n.startswith("sprites/itemicons/") or not name.endswith(".png"):
                continue
            try:
                iid = int(name[:-4])
            except ValueError:
                continue
            if iid in ids:
                data = z.read(n)
                if data[:8] != b"\x89PNG\r\n\x1a\n" or len(data) > 200_000:
                    continue
                (ITEM_OUT / name).write_bytes(data)
                have[iid] = hashlib.sha1(data).hexdigest()[:12]
    groups_with = sum(1 for g in items["groups"] if any(r.get("icon_id") in have for r in g["records"]))
    manifest = {"format": 1, "source": "PokeMMO client item icons (ItemSpriteDump, sprites/itemicons/<icon id>.png, mapped by the item data icon_id)",
                "client_date": items.get("dump_date") or "2026-11-16", "icons": len(have), "icon_ids_referenced": len(ids),
                "groups_total": len(items["groups"]), "groups_with_icon": groups_with, "files": {str(k): v for k, v in sorted(have.items())}}
    (ITEM_OUT / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")), encoding="utf-8")
    return {k: v for k, v in manifest.items() if k != "files"}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--sprites")
    ap.add_argument("--items")
    a = ap.parse_args()
    if a.sprites:
        print(json.dumps(build_sprites(Path(a.sprites)), indent=1))
    if a.items:
        print(json.dumps(build_items(Path(a.items)), indent=1))
