#!/usr/bin/env python3
"""Rebuild base_mines_l1-3 from Foozle WITH_GROUND variants (progression must read:
dark closed mine -> lit working mine -> gold-full mine)."""
from PIL import Image

MINE1 = '/home/z/my-project/download/assets/packs/mine/Foozle_2DS0008_Isometric_Gold_Mine_1/static_png'
HS = '/home/z/my-project/repos/whatsapp-bot/core/rpgasset/homestead'

JOBS = [
    ('gold_mine_with_ground_inactive.png',     f'{HS}/base_mines_l1.png', 175),
    ('gold_mine_with_ground_active_empty.png', f'{HS}/base_mines_l2.png', 195),
    ('gold_mine_with_ground_active_full.png',  f'{HS}/base_mines_l3.png', 225),
]
for src, out, w in JOBS:
    im = Image.open(f'{MINE1}/{src}').convert('RGBA')
    sc = w / im.width
    im = im.resize((int(im.width * sc), int(im.height * sc)), Image.LANCZOS)
    im.save(out)
    print(out, im.size)

# quick visual check sheet
ims = [Image.open(o).convert('RGBA') for _, o, _ in JOBS]
W = sum(im.width for im in ims) + 40
H = max(im.height for im in ims) + 10
canvas = Image.new('RGBA', (W, H), (40, 44, 38, 255))
x = 10
for im in ims:
    canvas.paste(im, (x, 5), im)
    x += im.width + 10
canvas.convert('RGB').save('/tmp/mine_sprites_v2.jpg', quality=92)
print('check sheet saved')
