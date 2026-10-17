#!/usr/bin/env python3
# compose_g5_proofs.py — GUILD v5 SCALE LAW proof sheet:
# stack a regular 16x16 base ABOVE the 28x28 guild grounds at the same tile
# scale, so the "wayyy bigger" jump is undeniable in one attachment.
import os
from PIL import Image, ImageDraw, ImageFont

OUT = '/home/z/my-project/download/proof_v6'
os.makedirs(OUT, exist_ok=True)

base = Image.open(f'{OUT}/base_16_ref.png').convert('RGB')
g5 = Image.open(f'{OUT}/guild_v5_castle_l5.png').convert('RGB')
g1 = Image.open(f'{OUT}/guild_v5_castle_l1.png').convert('RGB')
print('sizes:', base.size, g5.size, g1.size)

F_BIG = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 72)
F_SUB = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 46)


def label(d, cx, y, txt, font, fill=(232, 213, 163)):
    w = d.textlength(txt, font=font)
    d.text((cx - w / 2, y), txt, font=font, fill=fill)


# ── 1) stacked comparison sheet ──
W = max(base.width, g5.width)
LBL1, LBL2, PAD = 120, 130, 46
H = LBL1 + base.height + LBL2 + g5.height + PAD
comp = Image.new('RGB', (W, H), (10, 14, 7))
d = ImageDraw.Draw(comp)

y = 26
label(d, W // 2, y, 'REGULAR BASE — 16x16 plot (256 tiles)', F_BIG)
y += LBL1
comp.paste(base, ((W - base.width) // 2, y))
y += base.height + 34
label(d, W // 2, y, 'GUILD GROUNDS — 28x28 walled plan (784 tiles = 3x)', F_BIG)
y += LBL2
label(d, W // 2, y, 'wider yard outside the palisade + deep per-guild wilds', F_SUB, (156, 132, 85))
y += 92
comp.paste(g5, ((W - g5.width) // 2, y))

scale = 3000 / comp.width
comp2 = comp.resize((3000, int(comp.height * scale)), Image.LANCZOS)
comp2.save(f'{OUT}/g5_guild_vs_base.jpg', quality=82)
print('vs sheet:', comp2.size, os.path.getsize(f'{OUT}/g5_guild_vs_base.jpg') // 1024, 'KB')


def single(img, name, width=2400, q=84):
    s = width / img.width
    im2 = img.resize((width, int(img.height * s)), Image.LANCZOS)
    p = f'{OUT}/{name}'
    im2.save(p, quality=q)
    print(name, im2.size, os.path.getsize(p) // 1024, 'KB')


single(g5, 'g5_guild_l5.jpg')
single(g1, 'g5_guild_l1.jpg')
print('DONE')
