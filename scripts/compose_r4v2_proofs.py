#!/usr/bin/env python3
"""Compose r4v2 facing-fix proof set: biome collage + guild shot + mine strip."""
from PIL import Image, ImageDraw, ImageFont

P = "/home/z/my-project/download/assets/previews/r4v2"
OUT = "/home/z/my-project/download/assets/previews/r4proof"

font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 30)
small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 20)

# 1) biome collage 2x2
biomes = [
    ("base_forest_Player0.png", "FOREST ROLL (Player0)"),
    ("base_highlands_Player6.png", "HIGHLANDS ROLL (Player6)"),
    ("base_ruins_Player1.png", "RUINS ROLL (Player1)"),
    ("base_coast_Player2.png", "COAST ROLL (Player2)"),
]
tile_w = 660
tile_h = 452
pad = 8
head = 56
W = tile_w * 2 + pad * 3
H = (tile_h + head) * 2 + pad * 3
cv = Image.new("RGB", (W, H), (24, 26, 22))
d = ImageDraw.Draw(cv)
for i, (f, label) in enumerate(biomes):
    x = pad + (i % 2) * (tile_w + pad)
    y = pad + (i // 2) * (tile_h + head + pad)
    im = Image.open(f"{P}/{f}").convert("RGB").resize((tile_w, tile_h), Image.LANCZOS)
    cv.paste(im, (x, y + head))
    d.text((x + 6, y + 12), label, font=font, fill=(240, 230, 190))
cv.save(f"{OUT}/r4v2_biomes_collage.jpg", quality=88)
print("collage saved")

# 2) guild L5 full-res (already 660 wide) — re-encode jpg
Image.open(f"{P}/guild_l5.png").convert("RGB").save(f"{OUT}/r4v2_guild_l5.jpg", quality=92)
print("guild saved")

# 3) mine progression strip: crop the mine area from each solo view (center crop)
crops = []
for lv, label in [(1, "L1 CAVE MOUTH"), (2, "L2 TIMBER MINE"), (3, "L3 DEEP MINE")]:
    im = Image.open(f"{P}/mine_l{lv}.png").convert("RGB")
    w, h = im.size
    box = (w // 2 - 240, 90, w // 2 + 240, 480)
    crops.append((im.crop(box), label))
cw, ch = crops[0][0].size
pad = 10
W = cw * 3 + pad * 4
H = ch + head + pad * 2
cv = Image.new("RGB", (W, H), (24, 26, 22))
d = ImageDraw.Draw(cv)
x = pad
for im, label in crops:
    cv.paste(im, (x, head))
    d.text((x + 6, 14), label, font=small, fill=(240, 230, 190))
    x += cw + pad
cv.save(f"{OUT}/r4v2_mine_progression.jpg", quality=90)
print("mine strip saved")
