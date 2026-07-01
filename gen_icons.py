#!/usr/bin/env python3
"""Generate placeholder PNG icons (a filled orange circle) for the extension.

Pure standard library — no Pillow needed. Run: python3 gen_icons.py
"""
import os
import struct
import zlib


def make_png(path, size):
    cx = cy = (size - 1) / 2
    r = size / 2 - max(1, size * 0.06)
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter type 0 (none) for this scanline
        for x in range(size):
            dx, dy = x - cx, y - cy
            if (dx * dx + dy * dy) ** 0.5 <= r:
                # Brand gradient: #ffd56b (top-left) -> #ff9a6b (bottom-right)
                t = (x + y) / (2 * size)
                rr = 255
                gg = int(0xD5 - (0xD5 - 0x9A) * t)
                bb = int(0x6B)
                aa = 255
            else:
                rr = gg = bb = aa = 0
            raw += bytes((rr, gg, bb, aa))

    def chunk(typ, data):
        return (
            struct.pack(">I", len(data))
            + typ
            + data
            + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)
        )

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    idat = zlib.compress(bytes(raw), 9)
    png = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print("wrote", path)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    icons = os.path.join(here, "icons")
    os.makedirs(icons, exist_ok=True)
    for s in (16, 48, 128):
        make_png(os.path.join(icons, f"icon{s}.png"), s)


if __name__ == "__main__":
    main()
