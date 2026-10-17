#!/usr/bin/env python3
"""Zoom castle f0/f4/f28/f30 at 2x to locate the gate face."""
from PIL import Image, ImageDraw

CASTLE = "/home/z/my-project/download/assets/packs/castles/sprite/128sun/8_forest_duchy_nopalette.png"
im = Image.open(CASTLE).convert("RGBA")
W, H = im.size
cols, rows = 8, 4
cw, ch = int(W / cols), int(H / rows)

frames = [0, 4, 28, 30]
scale = 2
pad = 10
strip = Image.new("RGBA", (len(frames) * (cw * scale + pad) + pad, ch * scale + 26), (40, 40, 45, 255))
d = ImageDraw.Draw(strip)
x = pad
for f in frames:
    r, c = divmod(f, cols)
    cell = im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
    cell = cell.resize((cw * scale, ch * scale), Image.LANCZOS)
    strip.paste(cell, (x, 22), cell)
    d.text((x + cw, 4), f"f{f}", fill=(255, 255, 0, 255))
    x += cw * scale + pad
out = "/home/z/my-project/download/assets/previews/r4proof/castle_gate_check.png"
strip.save(out)
print("saved", out)
