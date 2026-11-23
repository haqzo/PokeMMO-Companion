"""Region-map extraction (read-only ROM decoding), private storage with review/rollback, and map layouts.

Synthetic fixtures check the decoders, header recognition, storage and rollback. They do NOT prove real-game
compatibility: the real-ROM tests at the bottom run only when POKEMMO_ROMS_DIR points at your own ROM files
(.gba/.nds, unzipped). No ROM, extracted artwork or game data is part of the repository.
"""
import hashlib
import json
import os
import struct
from pathlib import Path

import pytest

from companion.services import region_maps as rm
from companion.services import romfmt as rf

ROMS = os.environ.get("POKEMMO_ROMS_DIR")


# ---------------------------------------------------------------- helpers: tiny encoders for fixtures
def lz10_encode(data: bytes) -> bytes:
    """Minimal LZ10 encoder: literals plus a back-reference for runs (enough to exercise the decoder)."""
    out = bytearray([0x10, len(data) & 0xFF, len(data) >> 8 & 0xFF, len(data) >> 16 & 0xFF])
    i = 0
    while i < len(data):
        flag_pos = len(out)
        out.append(0)
        flags = 0
        for k in range(8):
            if i >= len(data):
                break
            run = 0
            if i >= 1:
                while i + run < len(data) and run < 18 and data[i + run] == data[i - 1]:
                    run += 1
            if run >= 3:
                x = (run - 3) << 12 | 0  # distance 1
                out += bytes([x >> 8, x & 0xFF])
                flags |= 0x80 >> k
                i += run
            else:
                out.append(data[i])
                i += 1
        out[flag_pos] = flags
    return bytes(out)


def gba_header(code=b"BPRE", title=b"POKEMON FIRE", rev=1, size=16 << 20) -> bytearray:
    d = bytearray(size)
    d[0xA0:0xAC] = title
    d[0xAC:0xB0] = code
    d[0xB2] = 0x96
    d[0xBC] = rev
    d[0xBD] = (-(sum(d[0xA0:0xBD]) + 0x19)) & 0xFF
    return d


def nitro(magic: bytes, sections: list[tuple[bytes, bytes]]) -> bytes:
    body = b"".join(m + struct.pack("<I", 8 + len(p)) + p for m, p in sections)
    return magic + b"\xff\xfe\x00\x01" + struct.pack("<IHH", 16 + len(body), 16, len(sections)) + body


def make_ncgr(tiles: bytes, bpp=4) -> bytes:
    hdr = struct.pack("<HHIIIII", 1, 1, 3 if bpp == 4 else 4, 0, 0, len(tiles), 0x18)
    return nitro(b"RGCN", [(b"RAHC", hdr + tiles)])


def make_nclr(cols: list[tuple[int, int, int]]) -> bytes:
    raw = b"".join(struct.pack("<H", (r >> 3) | (g >> 3) << 5 | (b >> 3) << 10) for r, g, b in cols)
    return nitro(b"RLCN", [(b"TTLP", struct.pack("<IIII", 3, 0, len(raw), 0x10) + raw)])


def make_nscr(w, h, entries) -> bytes:
    data = b"".join(struct.pack("<H", e) for e in entries)
    return nitro(b"RCSN", [(b"NRCS", struct.pack("<HHII", w * 8, h * 8, 0, len(data)) + data)])


def make_narc(members: list[bytes]) -> bytes:
    fat, img, off = b"", b"", 0
    for m in members:
        fat += struct.pack("<II", off, off + len(m))
        img += m + b"\0" * (-len(m) % 4)
        off = len(img)
    btaf = b"BTAF" + struct.pack("<II", 12 + len(fat), len(members)) + fat
    btnf = b"BTNF" + struct.pack("<I", 16) + struct.pack("<IHH", 4, 0, 1)
    gmif = b"GMIF" + struct.pack("<I", 8 + len(img)) + img
    body = btaf + btnf + gmif
    return b"NARC\xfe\xff\x00\x01" + struct.pack("<IHH", 16 + len(body), 16, 3) + body


def make_nds(files: dict[str, bytes], code=b"CPUE") -> bytes:
    """A tiny NitroFS image with one level of directories, enough for the reader."""
    head = bytearray(0x200)
    head[0:12] = b"POKEMON PL\0\0"
    head[0x0C:0x10] = code
    dirs = sorted({p.rsplit("/", 1)[0] for p in files if "/" in p})
    assert len(dirs) <= 1
    names = sorted(n for n in files if "/" not in n) + sorted(n for n in files if "/" in n)  # file ids: root first
    # FNT: root (+ one subdir)
    data_off = 0x1000
    blobs, fat = bytearray(), []
    for n in names:
        fat.append((data_off + len(blobs), data_off + len(blobs) + len(files[n])))
        blobs += files[n] + b"\0" * (-len(files[n]) % 4)
    def entries(items, sub=None):
        e = bytearray()
        for name in items:
            nb = name.encode()
            e += bytes([len(nb)]) + nb
        if sub:
            nb = sub.encode()
            e += bytes([0x80 | len(nb)]) + nb + struct.pack("<H", 0xF001)
        return e + b"\0"
    root_files = [n for n in names if "/" not in n]
    sub_files = [n.split("/", 1)[1] for n in names if "/" in n]
    ndirs = 2 if dirs else 1
    root_e = entries(root_files, dirs[0] if dirs else None)
    sub_e = entries(sub_files) if dirs else b""
    tbl = 8 * ndirs
    fnt = bytearray(struct.pack("<IHH", tbl, 0, ndirs))
    if dirs:
        fnt += struct.pack("<IHH", tbl + len(root_e), len(root_files), 0xF000)  # sub-dir: first file id after the root files
    fnt += root_e + sub_e
    fnt_off, fat_off = 0x200, 0x800
    rom = bytearray(data_off + len(blobs))
    rom[0:0x200] = head
    rom[fnt_off:fnt_off + len(fnt)] = fnt
    for i, (s, e) in enumerate(fat):
        rom[fat_off + 8 * i:fat_off + 8 * i + 8] = struct.pack("<II", s, e)
    struct.pack_into("<IIII", rom, 0x40, fnt_off, len(fnt), fat_off, 8 * len(fat))
    rom[data_off:] = blobs
    crc = rm._crc16(rom[0:0x15E])
    struct.pack_into("<H", rom, 0x15E, crc)
    return bytes(rom)


# ---------------------------------------------------------------- decoders
def test_lz10_roundtrip_and_errors():
    data = bytes(range(40)) + b"\x07" * 50 + b"tail"
    enc = lz10_encode(data)
    out, used = rf.lz10(enc)
    assert out == data and used == len(enc)
    with pytest.raises(rf.FormatError):
        rf.lz10(b"\x11\x05\x00\x00abc")
    with pytest.raises(rf.FormatError):
        rf.lz10(enc[:10])            # truncated
    with pytest.raises(rf.FormatError):
        rf.lz10(bytes([0x10, 4, 0, 0, 0x80, 0x00, 0x05]))  # back-reference before start


def test_render_4bpp_flip_and_palette_banks():
    tile = bytes([0x21] * 32)                       # pixel colours 1,2 alternating
    pal = [(0, 0, 0, 255), (255, 0, 0, 255), (0, 255, 0, 255)] + [(0, 0, 0, 255)] * 13 + \
          [(0, 0, 0, 255), (0, 0, 255, 255), (255, 255, 0, 255)] + [(0, 0, 0, 255)] * 13
    cv = rf.render_tiles(tile, 4, [0, 0 | 1 << 10, 0 | 1 << 12], 3, 1, pal)
    assert cv.get(0, 0) == (255, 0, 0, 255) and cv.get(1, 0) == (0, 255, 0, 255)
    assert cv.get(8, 0) == (0, 255, 0, 255)          # hflip mirrors the tile
    assert cv.get(16, 0) == (0, 0, 255, 255)         # palette bank 1
    assert rf.png_size(cv.png()) == (24, 8)


def test_render_affine8_crop_scale_keep_pixels():
    tiles = bytes([3] * 64) + bytes([5] * 64)
    pal = [(i, i, i, 255) for i in range(256)]
    cv = rf.render_tiles(tiles, 8, [0, 1, 1, 0], 2, 2, pal, affine8=True)
    assert cv.get(0, 0)[0] == 3 and cv.get(8, 0)[0] == 5 and cv.get(0, 8)[0] == 5
    c = cv.crop(4, 4, 8, 8)
    assert (c.w, c.h) == (8, 8) and c.get(0, 0)[0] == 3 and c.get(4, 0)[0] == 5
    big = c.scaled(3)
    assert (big.w, big.h) == (24, 24) and big.get(11, 0)[0] == 3 and big.get(12, 0)[0] == 5  # nearest neighbour
    with pytest.raises(rf.FormatError):
        cv.crop(10, 10, 20, 20)


def test_nitro_formats_narc_and_block_screens():
    pal = make_nclr([(0, 0, 0), (248, 0, 0)])
    assert rf.nclr(pal)[1][:3] == (255, 0, 0)
    cg = rf.ncgr(make_ncgr(bytes([0x11] * 64)))
    assert cg["bpp"] == 4 and len(cg["tiles"]) == 64
    # a 64x32 screen stored as two 32x32 blocks: the second block's first entry must land at x=32
    ent = [1] * (32 * 32) + [2] * (32 * 32)
    sc = rf.nscr(make_nscr(64, 32, ent), blocks=True)
    assert sc["map"][31] == 1 and sc["map"][32] == 2
    parts = rf.narc(make_narc([b"RLCNxx", b"\x10\x04\x00\x00\x00abcd"]))
    assert parts[0] == b"RLCNxx" and rf.nitro_decompress(parts[1]) == b"abcd"
    with pytest.raises(rf.FormatError):
        rf.narc(b"NOPE" + bytes(40))


def test_nitro_rom_filesystem():
    rom = make_nds({"graphic/tmap_gra.narc": b"NARCdata", "top.bin": b"x"})
    fs = rf.NitroROM(rom)
    assert fs.read("graphic/tmap_gra.narc") == b"NARCdata" and fs.read("top.bin") == b"x"
    with pytest.raises(rf.FormatError):
        fs.read("missing")


# ---------------------------------------------------------------- recognition
def test_identify_gba_header_checks():
    d = gba_header()
    info = rm.identify_bytes(d, len(d), "firered.gba")
    assert info["game_code"] == "BPRE" and info["region"] == "kanto" and info["can_extract"] and not info["problems"]
    d[0xBD] ^= 0xFF
    bad = rm.identify_bytes(d, len(d), "firered.gba")
    assert not bad["supported"] and any("checksum" in p for p in bad["problems"])
    other = gba_header(code=b"AXVE", title=b"POKEMON RUBY")
    assert not rm.identify_bytes(other, len(other), "ruby.gba")["supported"]


def test_identify_nds_and_unova_not_extractable():
    rom = make_nds({"x.bin": b"1"}, code=b"IRBO")
    info = rm.identify_bytes(rom, len(rom), "black.nds")
    assert info["region"] == "unova" and info["supported"] and not info["can_extract"] and "not been located" in info["note"]
    broken = bytearray(rom)
    broken[0x15E] ^= 1
    assert any("checksum" in p for p in rm.identify_bytes(broken, len(broken), "black.nds")["problems"])


def test_extract_reads_rom_without_modifying_it(tmp_path):
    rom = tmp_path / "firered.gba"
    rom.write_bytes(bytes(gba_header()))
    before = hashlib.sha1(rom.read_bytes()).hexdigest()
    mtime = rom.stat().st_mtime_ns
    with pytest.raises(rm.RegionMapError, match="not found"):
        rm.extract(rom)               # header is fine, but there is no map data in a blank ROM
    assert hashlib.sha1(rom.read_bytes()).hexdigest() == before and rom.stat().st_mtime_ns == mtime


def test_gba_resource_search_finds_moved_stream():
    payload = bytes(range(256)) * 4
    digest = hashlib.sha1(payload).hexdigest()
    blob = bytearray(4096) + lz10_encode(payload) + bytearray(64)
    hit = rm._lz_find(blob, len(payload), digest, hint=12)      # wrong hint: falls back to the header scan
    assert hit and hit[0] == 4096 and hit[1] == payload
    assert rm._lz_find(blob, len(payload), "0" * 40, hint=None) is None


def test_platinum_recipe_on_synthetic_archive(monkeypatch):
    """The DS recipe path end to end on a synthetic archive (hash mismatch → marked unverified, still decoded)."""
    tiles = bytes([0x11] * 32) + bytes([0x22] * 32)
    pal = make_nclr([(0, 0, 0), (200, 40, 40), (40, 200, 40)] + [(0, 0, 0)] * 13)
    members = [b""] * 27
    members[0] = members[1] = pal
    members[19] = members[20] = make_ncgr(tiles * 300)
    members[22] = make_nscr(32, 24, [(i % 2) for i in range(32 * 24)])
    members[24] = make_nscr(32, 24, [0] * (32 * 24))
    members[25] = make_nscr(64, 64, [(i % 2) for i in range(64 * 64)])
    members[26] = make_nscr(64, 64, [0] * (64 * 64))
    members[23] = members[21] = make_ncgr(tiles)
    rom = make_nds({"graphic/tmap_gra.narc": make_narc(members)})
    maps = rm._nds_platinum(rom)
    assert [m["id"] for m in maps] == ["sinnoh", "sinnoh-zoom"]
    assert (maps[0]["canvas"].w, maps[0]["canvas"].h) == (216, 168) and (maps[1]["canvas"].w, maps[1]["canvas"].h) == (512, 512)
    assert not maps[0]["verified"]
    assert rm.sanity(maps[0]["canvas"]) == ["image has almost no colours"]


# ---------------------------------------------------------------- storage: review, accept, rollback
def fake_maps(colour=(10, 120, 200)):
    cv = rf.Canvas(96, 64)
    for y in range(64):
        for x in range(96):
            cv.put(x, y, ((x * 7) % 256, (y * 5) % 256, colour[2], 255))
    return [{"id": "kanto", "label": "Kanto", "canvas": cv, "verified": True, "source": {}}]


@pytest.fixture
def fake_rom(tmp_path, monkeypatch):
    rom = tmp_path / "firered.gba"
    rom.write_bytes(bytes(gba_header()))
    state = {"fail": False, "colour": (10, 120, 200)}

    def recipe(d):
        if state["fail"]:
            raise rf.FormatError("simulated decode failure")
        return fake_maps(state["colour"])
    monkeypatch.setitem(rm.RECIPES, "frlg", recipe)
    return rom, state


def test_import_review_accept_reject_and_rollback(ctx, fake_rom):
    rom, state = fake_rom
    svc = ctx.region_maps
    m = svc.import_rom(rom)
    assert m["region"] == "kanto" and m["rom_sha1"] == hashlib.sha1(rom.read_bytes()).hexdigest()
    st = svc.status()["regions"]["kanto"]
    assert st["pending"] and not st["installed"]
    pend_png = svc.pending / "kanto" / "kanto.png"
    assert rf.png_size(pend_png.read_bytes()) == (96, 64)
    svc.accept("kanto")
    inst = svc.status()["regions"]["kanto"]["installed"]
    assert inst and inst["maps"][0]["url"].startswith("/assets/maps/installed/kanto/kanto.png")
    first = (svc.installed / "kanto" / "kanto.png").read_bytes()
    # a failed re-import keeps the working map and leaves nothing pending
    state["fail"] = True
    with pytest.raises(rm.RegionMapError, match="simulated"):
        svc.import_rom(rom)
    assert (svc.installed / "kanto" / "kanto.png").read_bytes() == first and not svc.status()["regions"]["kanto"]["pending"]
    # a successful re-import waits for review; rejecting keeps the installed map
    state.update(fail=False, colour=(1, 2, 3))
    svc.import_rom(rom)
    svc.reject("kanto")
    assert (svc.installed / "kanto" / "kanto.png").read_bytes() == first
    # never a copy of the ROM in the data folder
    assert not [p for p in ctx.paths.root.rglob("*") if p.suffix in (".gba", ".nds")]


def test_recover_after_interrupted_accept(ctx, fake_rom):
    rom, _ = fake_rom
    svc = ctx.region_maps
    svc.import_rom(rom)
    svc.accept("kanto")
    # simulate a crash after "live → .prev" but before "pending → live"
    (svc.installed / "kanto").rename(svc.installed / ".kanto.prev")
    svc.recover()
    assert (svc.installed / "kanto" / "kanto.png").is_file() and not (svc.installed / ".kanto.prev").exists()


def test_artwork_paths_are_contained(ctx, fake_rom):
    rom, _ = fake_rom
    svc = ctx.region_maps
    svc.import_rom(rom)
    svc.accept("kanto")
    assert svc.file("installed", "kanto/kanto.png")
    assert svc.file("installed", "../../companion.sqlite3") is None
    assert svc.file("installed", "kanto/manifest.json") is None     # only PNGs are served
    assert svc.file("elsewhere", "kanto/kanto.png") is None


def test_layout_validation_coordinates_and_ids(ctx):
    svc = ctx.region_maps
    known = {"kanto:1", "kanto:2"}
    data = {"marks": [
        {"kind": "point", "map": "kanto", "x": 0.5, "y": 0.25, "tag": "town", "location_id": "kanto:1"},
        {"kind": "rect", "map": "kanto", "x": 0.1, "y": 0.1, "w": 0.2, "h": 0.1, "tag": "route", "location_id": "kanto:9"},
        {"kind": "poly", "map": "sevii-123", "points": [[0, 0], [0.5, 0], [0.5, 0.5]], "tag": "cave", "location_id": "kanto:2"},
        {"kind": "point", "map": "kanto", "x": 0.9, "y": 0.9, "tag": "transition", "location_id": None, "target_map": "sevii-123"},
        {"kind": "point", "map": "kanto", "x": 1.7, "y": 0.2, "tag": "town", "location_id": "kanto:1"},     # outside the image
        {"kind": "point", "map": "kanto", "x": 0.2, "y": 0.2, "tag": "town", "location_id": "johto:5"},   # wrong region
        {"kind": "point", "map": "kanto", "x": 0.2, "y": 0.2, "tag": "town"},                             # no location
        {"kind": "rect", "map": "kanto", "x": 0.2, "y": 0.2, "w": 0, "h": 0.1, "location_id": "kanto:1"},  # empty area
    ]}
    clean, problems = svc.validate_layout("kanto", data, known)
    assert len(clean["marks"]) == 4 and len(problems) == 4
    assert clean["marks"][1]["unmatched"] is True and clean["marks"][0]["unmatched"] is False
    assert clean["marks"][3]["target_map"] == "sevii-123"
    with pytest.raises(rm.RegionMapError):
        svc.validate_layout("kanto", {"region": "johto", "marks": []}, known)
    # export → import round trip is lossless
    again, problems2 = svc.validate_layout("kanto", json.loads(json.dumps(clean)), known)
    assert [ (m["x"], m["y"]) for m in again["marks"] if m["kind"] == "point"] == [(m["x"], m["y"]) for m in clean["marks"] if m["kind"] == "point"] and not problems2


def test_layout_survives_reimport_and_removal(ctx, fake_rom):
    rom, _ = fake_rom
    svc = ctx.region_maps
    svc.save_layout("kanto", {"marks": [{"kind": "point", "map": "kanto", "x": 0.3, "y": 0.4, "tag": "town", "location_id": "kanto:1"}]}, set())
    svc.import_rom(rom)
    svc.accept("kanto")
    svc.remove("kanto")
    svc.import_rom(rom)
    svc.accept("kanto")
    assert svc.layout("kanto")["marks"][0]["x"] == 0.3
    svc.save_draft("kanto", {"marks": []})
    assert svc.draft("kanto")["marks"] == []
    svc.clear_draft("kanto")
    assert svc.draft("kanto") is None


def test_map_api_routes(client, ctx, fake_rom):
    rom, _ = fake_rom
    s, r = client.call("POST", "/api/maps/identify", {"path": str(rom.parent)})
    assert s == 200 and r["files"][0]["game_code"] == "BPRE"
    s, r = client.call("POST", "/api/maps/import", {"path": str(rom)})
    assert s == 200
    rm.wait_for(ctx.region_maps.jobs[r["job"]["id"]])
    s, r = client.call("POST", "/api/maps/kanto/accept")
    assert s == 200
    s, st = client.call("GET", "/api/maps")
    url = st["regions"]["kanto"]["installed"]["maps"][0]["url"]
    import urllib.request
    with urllib.request.urlopen(client.base + url) as resp:
        assert resp.headers["Content-Type"] == "image/png"
    s, r = client.call("PUT", "/api/maps/kanto/layout", {"marks": [{"kind": "point", "map": "kanto", "x": 0.1, "y": 0.1, "tag": "town", "location_id": "kanto:1"}]})
    assert s == 200 and len(r["layout"]["marks"]) == 1
    s, r = client.call("POST", "/api/maps/import", {"path": str(rom.parent / "nope.gba")})
    assert s == 400
    s, r = client.call("POST", "/api/maps/atlantis/accept")
    assert s == 404


# ---------------------------------------------------------------- real ROMs (only with POKEMMO_ROMS_DIR)
REAL = {
    "kanto": (("BPRE", "BPGE"), ["kanto", "sevii-123", "sevii-45", "sevii-67"], (192, 144)),
    "hoenn": (("BPEE",), ["hoenn"], (248, 152)),
    "johto": (("IPK", "IPG"), ["johto"], (376, 160)),
    "sinnoh": (("CPU",), ["sinnoh", "sinnoh-zoom"], (216, 168)),
}


def _real_roms():
    if not ROMS or not Path(ROMS).is_dir():
        return []
    out = []
    for f in sorted(Path(ROMS).iterdir()):
        if f.suffix.lower() in (".gba", ".nds"):
            try:
                out.append((f, rm.identify(f)))
            except rm.RegionMapError:
                pass
    return out


@pytest.mark.skipif(not ROMS, reason="POKEMMO_ROMS_DIR not set — real-ROM extraction tests skipped")
@pytest.mark.parametrize("region", ["kanto", "hoenn", "johto", "sinnoh", "unova"])
def test_real_rom_extraction(region, tmp_path):
    files = [(f, i) for f, i in _real_roms() if i.get("region") == region]
    if not files:
        pytest.skip(f"no {region} ROM in POKEMMO_ROMS_DIR")
    for f, info in files:
        before = f.stat().st_mtime_ns
        if region == "unova":
            assert info["supported"] and not info["can_extract"]
            continue
        ident, maps = rm.extract(f)
        code, ids, size = REAL[region]
        assert ident["game_code"].startswith(code)
        assert [m["id"] for m in maps] == ids
        assert (maps[0]["canvas"].w, maps[0]["canvas"].h) == size
        assert all(m["verified"] for m in maps), "decoded data differs from the verified build"
        assert all(not rm.sanity(m["canvas"]) for m in maps)
        assert f.stat().st_mtime_ns == before
