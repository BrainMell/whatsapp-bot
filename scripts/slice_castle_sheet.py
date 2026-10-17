#!/usr/bin/env python3
"""Slice the RTS castle sheet: find grid + show f0/f2/f4/f6/f8/f12/f16/f24/f28/f30."""
from PIL import Image, ImageDraw

CASTLE = "/home/z/my-project/download/assets/packs/castles/sprite/128sun/8_forest_duchy_nopalette.png"
im = Image.open(CASTLE).convert("RGBA")
W, H = im.size
print("castle sheet:", W, H, "ratio:", round(W / H, 3))

# guess grid: try 8x4 (like village) — verify by ratio
cols, rows = 8, 4
cw, ch = W / cols, H / rows
frames = [0, 2, 4, 6, 8, 12, 16, 20, 24, 28, 30, 31]
scale = 1
pad = 8
strip = Image.new("RGBA", (len(frames) * (int(cw) + pad) + pad, int(ch) + 26), (40, 40, 45, 255))
d = ImageDraw.Draw(strip)
x = pad
for f in frames:
    r, c = divmod(f, cols)
    cell = im.crop((int(c * cw), int(r * ch), int((c + 1) * cw), int((r + 1) * ch)))
    strip.paste(cell, (x, 22), cell)
    d.text((x + 4, 4), f"f{f}", fill=(255, 255, 0, 255))
    x += int(cw) + pad
out = "/home/z/my-project/download/assets/previews/r4proof/castle_sheet_frames.png"
strip.save(out)
print("saved", out)
