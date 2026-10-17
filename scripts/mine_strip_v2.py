#!/usr/bin/env python3
"""Mine progression strip straight from the sprite files (clean, unambiguous)."""
from PIL import Image, ImageDraw, ImageFont

HS = "/home/z/my-project/repos/whatsapp-bot/core/rpgasset/homestead"
OUT = "/home/z/my-project/download/assets/previews/r4proof"

font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
items = [
    ("base_mines_l1.png", "L1 CAVE MOUTH"),
    ("base_mines_l2.png", "L2 TIMBER MINE"),
    ("base_mines_l3.png", "L3 DEEP MINE"),
]
pad = 16
head = 46
ims = []
for f, _ in items:
    im = Image.open(f"{HS}/{f}").convert("RGBA")
    sc = 300 / im.width
    ims.append(im.resize((300, int(im.height * sc)), Image.LANCZOS))
W = sum(im.width for im in ims) + pad * (len(ims) + 1)
H = max(im.height for im in ims) + head + pad * 2
cv = Image.new("RGBA", (W, H), (34, 38, 33, 255))
d = ImageDraw.Draw(cv)
x = pad
for (f, label), im in zip(items, ims):
    cv.paste(im, (x, head), im)
    d.text((x, 12), label, font=font, fill=(240, 230, 190, 255))
    x += im.width + pad
cv.convert("RGB").save(f"{OUT}/r4v2_mine_progression.jpg", quality=92)
print("saved", cv.size)
