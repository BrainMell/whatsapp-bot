#!/usr/bin/env python3
"""Rebuild cache_chest_open.png as a REAL open chest (owner: "2 chest Sprites
one open and one closed" — the old one read as a detached/upside-down lid).

Measured off the closed sprite: gold band rows 74..93 (box's top rim trim),
corner posts x≈28-52 / 168-192, lid arch spans x 22..198 above y 74.

Composition (220x217 — 16px headroom for the raised lid; the runtime anchors
sprites by CONTENT bbox so the taller canvas grounds correctly):
  1. lid    — closed-lid pixels above y74, swung open BEHIND the box: raised
              off the hinge, slightly narrower (back-tilt), inner face shaded
              dark; its base tucks behind the cavity's back rim
  2. body   — closed chest from y74 down (full band + lock + legs), untouched
  3. cavity — the box's open top between the posts: dark inset with coins +
              warm inner glow; drawn OVER the lid's base so the lid reads as
              rising from behind the opening
"""

from PIL import Image, ImageDraw, ImageFilter
import numpy as np
import os

PROP = '/home/z/my-project/repo/core/rpgasset/guildwar/ruins/props'
src = Image.open(os.path.join(PROP, 'cache_chest.png')).convert('RGBA')
W, H = src.size
a = np.array(src, dtype=np.float32)

SEAM = 74            # band top — lid is everything above, box owns the band
SHIFT = 16           # extra headroom for the raised lid
NH = H + SHIFT

# ── 1. lid open behind (inner face shaded) ──
lid_src = a[:SEAM, :, :].copy()
shade = np.zeros_like(lid_src)
shade[:, :, 0], shade[:, :, 1], shade[:, :, 2] = 0.60, 0.56, 0.52
lid_inner = lid_src * shade
lid_inner[:, :, 3] = lid_src[:, :, 3]
lid_img = Image.fromarray(np.clip(lid_inner, 0, 255).astype(np.uint8))
LSCX, LSCY = 0.97, 0.82
lw, lh = int(W * LSCX), int(SEAM * LSCY)          # 213 x 60
lid_small = lid_img.resize((lw, lh), Image.NEAREST)

canvas = Image.new('RGBA', (W, NH), (0, 0, 0, 0))
paste_x = (W - lw) // 2
hinge_y = SEAM + SHIFT - 26 - 2                   # cavity top (64) — lid base
canvas.alpha_composite(lid_small, (paste_x, hinge_y - lh))
cd = ImageDraw.Draw(canvas)
# faint light on the lid's inner lip (base edge)
cd.line([paste_x + 8, hinge_y - 1, paste_x + lw - 8, hinge_y - 1], fill=(176, 132, 44, 140), width=1)

# ── 2. body (full band down) ──
body = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).crop((0, SEAM, W, H))
canvas.alpha_composite(body, (0, SEAM + SHIFT))

# ── 3. cavity between the posts, overlapping the lid's base ──
cav_x0, cav_x1 = 54, 166
cav_y0, cav_y1 = hinge_y - 2, SEAM + SHIFT + 1    # back rim (over lid base) → band top
d = ImageDraw.Draw(canvas)
d.rounded_rectangle([cav_x0, cav_y0, cav_x1, cav_y1], radius=7, fill=(18, 10, 3, 255))
glow = Image.new('RGBA', (W, NH), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.ellipse([cav_x0 + 10, cav_y0 + 2, cav_x1 - 10, cav_y1 + 4], fill=(214, 160, 40, 66))
gd.ellipse([W // 2 - 52, cav_y0 + 4, W // 2 + 52, cav_y1 + 2], fill=(255, 214, 90, 72))
glow = glow.filter(ImageFilter.GaussianBlur(5))
canvas.alpha_composite(glow)
d = ImageDraw.Draw(canvas)
# inner shadow under the lid's hinge
d.rectangle([cav_x0 + 3, cav_y0 + 2, cav_x1 - 3, cav_y0 + 6], fill=(10, 6, 2, 160))
# coin pile tucked in the cavity, bottoms clipped by the front rim
coins = [(78, cav_y1 - 2, 10, 4), (100, cav_y1 + 1, 12, 5), (122, cav_y1 - 1, 11, 4),
         (142, cav_y1 - 3, 9, 4), (89, cav_y1 - 6, 8, 3), (111, cav_y1 - 7, 9, 4), (131, cav_y1 - 8, 7, 3)]
for cx, cy, rx, ry in coins:
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(217, 168, 40, 255))
    d.ellipse([cx - int(rx * 0.5), cy - ry - int(ry * 0.3), cx + int(rx * 0.4), cy + int(ry * 0.35)],
              fill=(242, 207, 92, 255))
for sx, sy in [(84, cav_y0 + 10), (108, cav_y0 + 7), (134, cav_y0 + 11), (95, cav_y1 - 9), (122, cav_y1 - 11)]:
    d.ellipse([sx - 1, sy - 1, sx + 2, sy + 2], fill=(255, 239, 160, 235))

canvas.save(os.path.join(PROP, 'cache_chest_open.png'))
print('open chest rebuilt (canvas %dx%d)' % (W, NH))

# ── QA sheet ──
cl = Image.open(os.path.join(PROP, 'cache_chest.png')).convert('RGBA')
op = Image.open(os.path.join(PROP, 'cache_chest_open.png')).convert('RGBA')
sheet = Image.new('RGBA', (cl.width + op.width + 30, max(cl.height, op.height) + 16), (44, 38, 30, 255))
sheet.paste(cl, (8, 8), cl)
sheet.paste(op, (cl.width + 22, 8), op)
sheet = sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST)
sheet.convert('RGB').save('/home/z/my-project/qa_art/chest_pair_v3.png')
print('QA sheet: qa_art/chest_pair_v3.png')
