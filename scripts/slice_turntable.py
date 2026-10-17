#!/usr/bin/env python3
"""Slice the gatehouse turntable into a labeled contact strip: frames 0/4/8/12/16/20/24/28."""
from PIL import Image, ImageDraw

SHEET = "/home/z/my-project/download/assets/packs/village/sprite/128sun/1x1_gatehouse_24bit.png"
im = Image.open(SHEET).convert("RGBA")
W, H = im.size  # 816x536 -> 8 cols x 4 rows? cell ~102x134
cols, rows = 8, 4
cw, ch = W // cols, H // rows
print(f"sheet {W}x{H}, cell {cw}x{ch}")

# contact strip of every 4th frame: 0,4,8,12,16,20,24,28
frames = [0, 4, 8, 12, 16, 20, 24, 28]
scale = 1.0
pad = 6
strip = Image.new("RGBA", (len(frames) * (cw + pad) + pad, ch + 28), (30, 30, 30, 255))
d = ImageDraw.Draw(strip)
for i, f in enumerate(frames):
    col, row = f % cols, f // cols
    cell = im.crop((col * cw, row * ch, (col + 1) * cw, (row + 1) * ch))
    x = pad + i * (cw + pad)
    strip.paste(cell, (x, 24), cell)
    d.text((x + cw // 2 - 8, 4), f"f{f}", fill=(255, 255, 0, 255))
out = "/home/z/my-project/download/assets/previews/r4proof/gatehouse_turntable.png"
strip.save(out)
print("saved", out)
