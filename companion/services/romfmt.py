"""Read-only decoders for the handful of GBA / Nintendo DS graphics formats the region-map importer needs.

Standard library only. Nothing here writes to a ROM: callers open the file read-only (mmap ACCESS_READ)
and these helpers only slice bytes. No game data is embedded in this module.

GBA:  LZ77 (type 0x10), 4bpp text-BG tiles with 16-bit tilemap entries, 8bpp affine-BG tiles with
      8-bit tilemap entries, BGR555 palettes.
NDS:  NitroFS (FNT/FAT), NARC archives, LZ10/LZ11, NCGR (RGCN), NCLR (RLCN), NSCR (RCSN).
"""
from __future__ import annotations

import struct
import zlib


class FormatError(Exception):
    pass


def u16(b, o: int) -> int:
    return b[o] | b[o + 1] << 8


def u32(b, o: int) -> int:
    return struct.unpack_from("<I", b, o)[0]


# ------------------------------------------------------------------ compression
def lz10(b, off: int = 0, limit: int = 4 << 20) -> tuple[bytes, int]:
    """GBA/NDS LZ77 type 0x10. Returns (data, compressed length). Raises FormatError on malformed input."""
    if off >= len(b) or b[off] != 0x10:
        raise FormatError("not LZ10")
    size = b[off + 1] | b[off + 2] << 8 | b[off + 3] << 16
    if size == 0 or size > limit:
        raise FormatError("bad LZ10 size")
    out = bytearray()
    i = off + 4
    try:
        while len(out) < size:
            flags = b[i]
            i += 1
            for k in range(8):
                if len(out) >= size:
                    break
                if flags & (0x80 >> k):
                    x = b[i] << 8 | b[i + 1]
                    i += 2
                    n = (x >> 12) + 3
                    d = (x & 0xFFF) + 1
                    if d > len(out):
                        raise FormatError("LZ10 back-reference before start")
                    for _ in range(n):
                        out.append(out[-d])
                else:
                    out.append(b[i])
                    i += 1
    except IndexError as exc:
        raise FormatError("truncated LZ10 stream") from exc
    return bytes(out[:size]), i - off


def lz11(b, limit: int = 8 << 20) -> bytes:
    size = b[1] | b[2] << 8 | b[3] << 16
    i = 4
    if size == 0:
        size = u32(b, 4)
        i = 8
    if size > limit:
        raise FormatError("bad LZ11 size")
    out = bytearray()
    try:
        while len(out) < size:
            f = b[i]
            i += 1
            for k in range(8):
                if len(out) >= size:
                    break
                if f & (0x80 >> k):
                    a = b[i]
                    ind = a >> 4
                    if ind == 0:
                        n = ((a & 0xF) << 4 | b[i + 1] >> 4) + 0x11
                        d = ((b[i + 1] & 0xF) << 8 | b[i + 2]) + 1
                        i += 3
                    elif ind == 1:
                        n = ((a & 0xF) << 12 | b[i + 1] << 4 | b[i + 2] >> 4) + 0x111
                        d = ((b[i + 2] & 0xF) << 8 | b[i + 3]) + 1
                        i += 4
                    else:
                        n = ind + 1
                        d = ((a & 0xF) << 8 | b[i + 1]) + 1
                        i += 2
                    if d > len(out):
                        raise FormatError("LZ11 back-reference before start")
                    for _ in range(n):
                        out.append(out[-d])
                else:
                    out.append(b[i])
                    i += 1
    except IndexError as exc:
        raise FormatError("truncated LZ11 stream") from exc
    return bytes(out[:size])


def nitro_decompress(b: bytes) -> bytes:
    """NARC members are sometimes LZ-compressed. Leave anything that is already a Nitro file alone."""
    if len(b) >= 4 and b[:4] in (b"RGCN", b"RLCN", b"RCSN", b"RECN", b"RNAN", b"NARC"):
        return b
    if b[:1] == b"\x10":
        return lz10(b)[0]
    if b[:1] == b"\x11":
        return lz11(b)
    return b


# ------------------------------------------------------------------ palettes / canvas
def bgr555(raw) -> list[tuple[int, int, int, int]]:
    out = []
    for i in range(0, len(raw) - 1, 2):
        v = raw[i] | raw[i + 1] << 8
        r, g, bl = (v & 31) << 3, (v >> 5 & 31) << 3, (v >> 10 & 31) << 3
        out.append((r | r >> 5, g | g >> 5, bl | bl >> 5, 255))
    return out


class Canvas:
    """A plain RGBA pixel buffer."""

    def __init__(self, w: int, h: int):
        self.w, self.h = w, h
        self.px = bytearray(w * h * 4)

    def put(self, x: int, y: int, c) -> None:
        if 0 <= x < self.w and 0 <= y < self.h:
            o = (y * self.w + x) * 4
            self.px[o:o + 4] = bytes(c)

    def get(self, x: int, y: int) -> tuple:
        o = (y * self.w + x) * 4
        return tuple(self.px[o:o + 4])

    def crop(self, x: int, y: int, w: int, h: int) -> "Canvas":
        if x < 0 or y < 0 or x + w > self.w or y + h > self.h or w <= 0 or h <= 0:
            raise FormatError("crop outside image")
        out = Canvas(w, h)
        for row in range(h):
            s = ((y + row) * self.w + x) * 4
            out.px[row * w * 4:(row + 1) * w * 4] = self.px[s:s + w * 4]
        return out

    def over(self, top: "Canvas") -> None:
        """Composite `top` (binary alpha) onto this canvas."""
        if (top.w, top.h) != (self.w, self.h):
            raise FormatError("layer size mismatch")
        for i in range(0, len(self.px), 4):
            if top.px[i + 3]:
                self.px[i:i + 4] = top.px[i:i + 4]

    def scaled(self, k: int) -> "Canvas":
        """Nearest-neighbour integer upscale (keeps pixel edges sharp)."""
        out = Canvas(self.w * k, self.h * k)
        for y in range(self.h):
            row = bytearray()
            for x in range(self.w):
                o = (y * self.w + x) * 4
                row += self.px[o:o + 4] * k
            for j in range(k):
                s = ((y * k + j) * out.w) * 4
                out.px[s:s + len(row)] = row
        return out

    def opaque_fraction(self) -> float:
        n = self.w * self.h
        return sum(1 for i in range(3, len(self.px), 4) if self.px[i]) / n if n else 0.0

    def distinct_colours(self, cap: int = 4096) -> int:
        seen = set()
        for i in range(0, len(self.px), 4):
            seen.add(bytes(self.px[i:i + 4]))
            if len(seen) >= cap:
                break
        return len(seen)

    def png(self) -> bytes:
        raw = bytearray()
        stride = self.w * 4
        for y in range(self.h):
            raw.append(0)
            raw += self.px[y * stride:(y + 1) * stride]

        def chunk(t: bytes, d: bytes) -> bytes:
            return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
        return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", self.w, self.h, 8, 6, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b""))


def png_size(data: bytes) -> tuple[int, int] | None:
    if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        return None
    return struct.unpack(">II", data[16:24])


# ------------------------------------------------------------------ tile rendering
def render_tiles(tiles: bytes, bpp: int, entries: list[int], w_tiles: int, h_tiles: int, pal: list,
                 transparent0: bool = False, affine8: bool = False) -> Canvas:
    """Draw a tilemap. `entries` are 16-bit text-BG entries (tile | hflip<<10 | vflip<<11 | bank<<12) or,
    with affine8, plain 8-bit tile numbers."""
    ts = 64 if bpp == 8 else 32
    ntiles = len(tiles) // ts
    cv = Canvas(w_tiles * 8, h_tiles * 8)
    magenta = (255, 0, 255, 255)
    for t, e in enumerate(entries[:w_tiles * h_tiles]):
        if affine8:
            ti, hf, vf, pb = e, 0, 0, 0
        else:
            ti, hf, vf, pb = e & 0x3FF, e >> 10 & 1, e >> 11 & 1, e >> 12
        if ti >= ntiles:
            continue
        base = ti * ts
        tx, ty = (t % w_tiles) * 8, (t // w_tiles) * 8
        for y in range(8):
            for x in range(8):
                if bpp == 4:
                    bb = tiles[base + y * 4 + x // 2]
                    c = (bb >> 4) if x & 1 else (bb & 15)
                    ci = pb * 16 + c
                else:
                    c = tiles[base + y * 8 + x]
                    ci = c
                if transparent0 and c == 0:
                    continue
                col = pal[ci] if ci < len(pal) else magenta
                o = ((ty + (7 - y if vf else y)) * cv.w + tx + (7 - x if hf else x)) * 4
                cv.px[o:o + 4] = bytes(col)
    return cv


# ------------------------------------------------------------------ Nintendo DS
class NitroROM:
    """NitroFS reader over a read-only buffer (bytes or mmap)."""

    def __init__(self, data):
        self.d = data
        if len(data) < 0x200:
            raise FormatError("file too small for a DS ROM")
        self.fnt, self.fnt_size = u32(data, 0x40), u32(data, 0x44)
        self.fat, self.fat_size = u32(data, 0x48), u32(data, 0x4C)
        if not (0x200 <= self.fnt < len(data) and 0x200 <= self.fat < len(data)):
            raise FormatError("DS file tables out of range")
        self.files: dict[str, tuple[int, int]] = {}
        self._walk(0xF000, "", 0)

    def _walk(self, dir_id: int, prefix: str, depth: int) -> None:
        if depth > 16:
            raise FormatError("DS directory tree too deep")
        base = self.fnt + (dir_id & 0xFFF) * 8
        p = self.fnt + u32(self.d, base)
        fid = u16(self.d, base + 4)
        while True:
            t = self.d[p]
            p += 1
            if t == 0:
                break
            n = t & 0x7F
            name = bytes(self.d[p:p + n]).decode("latin1")
            p += n
            if t & 0x80:
                did = u16(self.d, p)
                p += 2
                self._walk(did, prefix + name + "/", depth + 1)
            else:
                s, e = u32(self.d, self.fat + fid * 8), u32(self.d, self.fat + fid * 8 + 4)
                if not (0 <= s <= e <= len(self.d)):
                    raise FormatError("DS file entry out of range")
                self.files[prefix + name] = (s, e)
                fid += 1

    def read(self, path: str) -> bytes:
        if path not in self.files:
            raise FormatError(f"{path} not found in the ROM file system")
        s, e = self.files[path]
        return bytes(self.d[s:e])


def narc(data: bytes) -> list[bytes]:
    if data[:4] != b"NARC":
        raise FormatError("not a NARC archive")
    off = u16(data, 0xC)
    if data[off:off + 4] != b"BTAF":
        raise FormatError("NARC without BTAF")
    n = u32(data, off + 8)
    fat = [(u32(data, off + 12 + 8 * i), u32(data, off + 16 + 8 * i)) for i in range(n)]
    off += u32(data, off + 4)
    if data[off:off + 4] != b"BTNF":
        raise FormatError("NARC without BTNF")
    off += u32(data, off + 4)
    if data[off:off + 4] != b"GMIF":
        raise FormatError("NARC without GMIF")
    img = off + 8
    return [data[img + s:img + e] for s, e in fat]


def _sections(b: bytes) -> dict[bytes, bytes]:
    hs, n = u16(b, 0xC), u16(b, 0xE)
    off, out = hs, {}
    for _ in range(n):
        if off + 8 > len(b):
            break
        m, sz = b[off:off + 4], u32(b, off + 4)
        out[m] = b[off:off + sz]
        off += sz
    return out


def ncgr(b: bytes) -> dict:
    if b[:4] != b"RGCN":
        raise FormatError("not an NCGR")
    c = _sections(b).get(b"RAHC")
    if not c:
        raise FormatError("NCGR without character data")
    bpp = 4 if u32(c, 12) == 3 else 8
    size, off = u32(c, 0x18), u32(c, 0x1C) + 8
    return {"bpp": bpp, "tiles": bytes(c[off:off + size])}


def nclr(b: bytes) -> list:
    if b[:4] != b"RLCN":
        raise FormatError("not an NCLR")
    p = _sections(b).get(b"TTLP")
    if not p:
        raise FormatError("NCLR without palette data")
    size, off = u32(p, 0x10), u32(p, 0x14) + 8
    return bgr555(p[off:off + size])


def nscr(b: bytes, blocks: bool = False) -> dict:
    """NSCR screen. With blocks=True, screens larger than 32x32 tiles stored as 32x32 blocks are linearised."""
    if b[:4] != b"RCSN":
        raise FormatError("not an NSCR")
    n = _sections(b).get(b"NRCS")
    if not n:
        raise FormatError("NSCR without screen data")
    w, h, size = u16(n, 8) // 8, u16(n, 10) // 8, u32(n, 0x10)
    data = n[0x14:0x14 + size]
    entries = [u16(data, i) for i in range(0, len(data) - 1, 2)]
    if blocks and (w > 32 or h > 32):
        lin = [0] * (w * h)
        i = 0
        for by in range(0, h, 32):
            for bx in range(0, w, 32):
                for y in range(min(32, h - by)):
                    for x in range(min(32, w - bx)):
                        if i < len(entries):
                            lin[(by + y) * w + bx + x] = entries[i]
                        i += 1
        entries = lin
    return {"w": w, "h": h, "map": entries}
