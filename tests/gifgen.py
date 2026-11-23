"""Tiny pure-Python animated GIF / PNG writer for tests (no Pillow). Produces real, browser-decodable images."""
from __future__ import annotations

import struct
import zlib


def _lzw_2bit(pixels: list[int]) -> bytes:
    """LZW stream for a 4-colour image: a clear code before every two pixels keeps codes at 3 bits."""
    codes, bits, nbits, out = [], 0, 0, bytearray()
    for i in range(0, len(pixels), 2):
        codes.append(4)
        codes.extend(pixels[i:i + 2])
    codes.append(5)
    for c in codes:
        bits |= c << nbits
        nbits += 3
        while nbits >= 8:
            out.append(bits & 0xFF)
            bits >>= 8
            nbits -= 8
    if nbits:
        out.append(bits & 0xFF)
    blocks = bytearray()
    for i in range(0, len(out), 255):
        chunk = out[i:i + 255]
        blocks += bytes([len(chunk)]) + chunk
    return bytes(blocks) + b"\x00"


def make_gif(w: int = 40, h: int = 40, frames: int = 3, colour: tuple = (200, 60, 60), seed: int = 0) -> bytes:
    pal = bytes([0, 0, 0, *colour, 255, 255, 255, 30, 30, 30])
    out = bytearray(b"GIF89a" + struct.pack("<HH", w, h) + bytes([0xF1, 0, 0]) + pal)
    out += b"\x21\xFF\x0BNETSCAPE2.0\x03\x01\x00\x00\x00"  # loop forever
    for f in range(frames):
        out += b"\x21\xF9\x04\x04" + struct.pack("<H", 10) + b"\x00\x00"  # 100 ms per frame
        out += b"\x2C" + struct.pack("<HHHH", 0, 0, w, h) + b"\x00\x02"
        px = [1 if ((x + y + f + seed) // 4) % 2 else (2 if (x * y + seed) % 7 == 0 else 0) for y in range(h) for x in range(w)]
        out += _lzw_2bit(px)
    return bytes(out + b"\x3B")


def _chunk(t, d):
    return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)


def make_png(w: int = 40, h: int = 40, colour: tuple = (60, 120, 200), box: tuple | None = None, palette: bool = False) -> bytes:
    """Opaque RGB PNG, or (with box=(x0, y0, x1, y1)) a transparent canvas with an opaque rectangle —
    RGBA by default, 4-bit palette + tRNS with palette=True (like most PokéAPI stills). Rows use mixed filters."""
    sig = b"\x89PNG\r\n\x1a\n"
    if box is None:
        raw = b"".join(b"\x00" + bytes(colour) * w for _ in range(h))
        return sig + _chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + _chunk(b"IDAT", zlib.compress(raw)) + _chunk(b"IEND", b"")
    x0, y0, x1, y1 = box
    inside = lambda x, y: x0 <= x < x1 and y0 <= y < y1  # noqa: E731
    if palette:
        rows = []
        for y in range(h):
            px = [1 if inside(x, y) else 0 for x in range(w)]
            px += [0] * (len(px) % 2)
            rows.append(b"\x00" + bytes((px[i] << 4) | px[i + 1] for i in range(0, len(px), 2)))
        return (sig + _chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 4, 3, 0, 0, 0)) + _chunk(b"PLTE", bytes([0, 0, 0, *colour]))
                + _chunk(b"tRNS", b"\x00\xff") + _chunk(b"IDAT", zlib.compress(b"".join(rows))) + _chunk(b"IEND", b""))
    rows, prev = [], bytes(w * 4)
    for y in range(h):
        line = b"".join(bytes([*colour, 255]) if inside(x, y) else b"\x00\x00\x00\x00" for x in range(w))
        if y % 2:  # "Up" filter on odd rows
            rows.append(b"\x02" + bytes((line[i] - prev[i]) & 255 for i in range(len(line))))
        else:
            rows.append(b"\x00" + line)
        prev = line
    return sig + _chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)) + _chunk(b"IDAT", zlib.compress(b"".join(rows))) + _chunk(b"IEND", b"")
