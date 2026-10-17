#!/usr/bin/env python3
"""Verification sheet: every rebuilt structure sprite on one board."""
from PIL import Image, ImageDraw, ImageFont
import os

HS = "/home/z/my-project/repos/whatsapp-bot/core/rpgasset/homestead"
GB = "/home/z/my-project/repos/whatsapp-bot/core/rpgasset/guildbase"

groups = [
    ("houses", ["base_house_l1.png", "base_house_l2.png", "base_house_l3.png"]),
    ("smithy", ["base_smithy_l1.png", "base_smithy_l2.png", "base_smithy_l3.png"]),
    ("medbay", ["base_medbay_l1.png", "base_medbay_l2.png", "base_medbay_l3.png"]),
    ("alchemy", ["base_alchemy_l1.png", "base_alchemy_l2.png", "base_alchemy_l3.png"]),
    ("pond+gate", ["base_pond_l2.png", "base_pond_l3.png", "base_hunting_gate.png"]),
    ("mines", ["base_mines_l1.png", "base_mines_l2.png", "base_mines_l3.png"]),
    ("gb_cottage", ["gb_cottage_a.png", "gb_cottage_b.png", "gb_cottage_c.png", "gb_cottage_d.png"]),
    ("gb_training", [f"gb_training_l{i}.png" for i in range(1, 6)]),
    ("gb_treasury", [f"gb_treasury_l{i}.png" for i in range(1, 6)]),
    ("gb_castle", [f"gb_castle_l{i}.png" for i in range(1, 6)]),
    ("poly wilds", ["poly_ruin_arch.png", "poly_ruin_gate.png", "poly_ancient_well.png", "poly_ivy_tower.png", "poly_rock_monolith.png"]),
]

font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 16)
small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12)

ROW_H = 240
W = 1560
H = ROW_H * len(groups) + 20
cv = Image.new("RGBA", (W, H), (46, 50, 44, 255))
d = ImageDraw.Draw(cv)
y = 10
for gname, files in groups:
    d.text((10, y + 4), gname, font=font, fill=(255, 240, 160, 255))
    x = 150
    for f in files:
        p = os.path.join(HS if f.startswith(("base_", "poly_")) else GB, f)
        if not os.path.exists(p):
            x += 130
            continue
        im = Image.open(p).convert("RGBA")
        if im.width > 120:
            sc = 120 / im.width
            im = im.resize((120, int(im.height * sc)), Image.LANCZOS)
        if im.height > ROW_H - 40:
            sc = (ROW_H - 40) / im.height
            im = im.resize((int(im.width * sc), ROW_H - 40), Image.LANCZOS)
        cv.paste(im, (x, y + 26), im)
        d.text((x, y + ROW_H - 14), f.replace("base_", "").replace(".png", ""), font=small, fill=(210, 220, 200, 255))
        x += 130
    y += ROW_H
cv.convert("RGB").save("/home/z/my-project/download/assets/previews/r4proof/rebuild_check_sheet.jpg", quality=90)
print("saved sheet", cv.size)
