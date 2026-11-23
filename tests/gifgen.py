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


def make_png(w: int = 40, h: int = 40, colour: tuple = (60, 120, 200)) -> bytes:
    raw = b"".join(b"\x00" + bytes(colour) * w for _ in range(h))
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
