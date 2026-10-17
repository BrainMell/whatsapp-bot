#!/usr/bin/env python3
"""Zoom the 4 iso-corner candidate frames of village sheets + the castle, to pick the hero frame."""
from PIL import Image, ImageDraw

SHEET = "/home/z/my-project/download/assets/packs/village/sprite/128sun/1x1_gatehouse_24bit.png"
SHEET2 = "/home/z/my-project/download/assets/packs/village/sprite/128sun/1x1_thatched_cottage_24bit.png"
im = Image.open(SHEET).convert("RGBA")
im2 = Image.open(SHEET2).convert("RGBA")
cols, rows = 8, 4
cw, ch = im.size[0] // cols, im.size[1] // rows
cw2, ch2 = im2.size[0] // cols, im2.size[1] // rows

# gatehouse corner frames big
frames = [2, 4, 6, 12, 20, 26, 28, 30]  # include intermediate angles to see rotation direction
scale = 2
pad = 8
strip = Image.new("RGBA", (len(frames) * (cw * scale + pad) + pad, ch * scale + 30), (40, 40, 45, 255))
d = ImageDraw.Draw(strip)
for i, f in enumerate(frames):
    col, row = f % cols, f // cols
    cell = im.crop((col * cw, row * ch, (col + 1) * cw, (row + 1) * ch))
    cell = cell.resize((cw * scale, ch * scale), Image.NEAREST)
    x = pad + i * (cw * scale + pad)
    strip.paste(cell, (x, 26), cell)
    d.text((x + cw, 6), f"f{f}", fill=(255, 255, 0, 255))
out = "/home/z/my-project/download/assets/previews/r4proof/gatehouse_corners.png"
strip.save(out)
print("saved", out, strip.size)

# thatched cottage corner frames big
frames2 = [4, 12, 20, 28]
strip2 = Image.new("RGBA", (len(frames2) * (cw2 * scale + pad) + pad, ch2 * scale + 30), (40, 40, 45, 255))
d2 = ImageDraw.Draw(strip2)
for i, f in enumerate(frames2):
    col, row = f % cols, f // cols
    cell = im2.crop((col * cw2, row * ch2, (col + 1) * cw2, (row + 1) * ch2))
    cell = cell.resize((cw2 * scale, ch2 * scale), Image.NEAREST)
    x = pad + i * (cw2 * scale + pad)
    strip2.paste(cell, (x, 26), cell)
    d2.text((x + cw2, 6), f"f{f}", fill=(255, 255, 0, 255))
out2 = "/home/z/my-project/download/assets/previews/r4proof/cottage_corners.png"
strip2.save(out2)
print("saved", out2, strip2.size)
