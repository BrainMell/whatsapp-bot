#!/usr/bin/env python3
"""Spot-check f28 (and f4) across multiple village sheets + the Foozle mine facing."""
from PIL import Image, ImageDraw
import os

BASE = "/home/z/my-project/download/assets/packs/village/sprite/128sun"
sheets = [
    "1x1_stone_chapel_24bit.png",
    "1x1_apothecary_24bit.png",
    "1x1_wizard_tower_24bit.png",
    "1x1_longhouse_24bit.png",
    "1x1_round_cottage_24bit.png",
    "1x1_blacksmith_forge_24bit.png",
]
cols, rows = 8, 4
scale = 1
pad = 8

cells = []
maxh = 0
for s in sheets:
    im = Image.open(os.path.join(BASE, s)).convert("RGBA")
    W, H = im.size
    cw, ch = W // cols, H // rows
    for f in (4, 28):
        col, row = f % cols, f // cols
        cell = im.crop((col * cw, row * ch, (col + 1) * cw, (row + 1) * ch))
        cells.append((f"{s.split('_')[1][:10]} f{f}", cell))
        maxh = max(maxh, ch)

maxw = max(c.width for _, c in cells)
strip = Image.new("RGBA", (len(cells) * (maxw + pad) + pad, maxh + 26), (40, 40, 45, 255))
d = ImageDraw.Draw(strip)
x = pad
for label, cell in cells:
    strip.paste(cell, (x, 22), cell)
    d.text((x + 4, 4), label, fill=(255, 255, 0, 255))
    x += cell.width + pad
out = "/home/z/my-project/download/assets/previews/r4proof/f28_spotcheck.png"
strip.save(out)
print("saved", out, strip.size)

# Foozle mine sprite facing
mine = "/home/z/my-project/repos/whatsapp-bot/core/rpgasset/homestead/base_mines_l2.png"
if os.path.exists(mine):
    im = Image.open(mine)
    im.save("/home/z/my-project/download/assets/previews/r4proof/mine_l2_view.png")
    print("mine sprite:", im.size)
