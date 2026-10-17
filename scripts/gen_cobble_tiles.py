#!/usr/bin/env python3
"""forest_cobble_a/b/c.png — cobblestone walkway tiles (64x32 iso diamonds).

Owner 2026-10-17 (reply to the g6 live render): "find a way to generate
walk ways with stone that end up producing the results of this image and
not the old shit you had, leave the existing dirt ground walk ways alongside
it for more detail".

The reference (MELLOW-SAN base) paths = rounded river cobbles, light grey,
dark grout between stones, moss flecks at the seams. Generated directly at
64x32 with PIL: jittered cobble packing inside the diamond mask, each stone
a 3-tone blob (base / NW highlight / SE shade) so the field reads as relief
under the 2x supersample. Three variants + a per-cell seeded pick = no
visible tiling on long roads.
"""
from PIL import Image, ImageDraw
import random

W, H = 64, 32
CX, CY = W / 2, H / 2

# grout (soil between stones) — dark warm grey, sits well on moss
GROUT = (66, 66, 55, 255)
GROUT_DARK = (54, 54, 45, 255)
# stone families: [base, highlight, shade]
STONES = [
    ((140, 138, 128), (158, 156, 146), (106, 104, 96)),
    ((128, 126, 118), (146, 144, 135), (96, 94, 88)),
    ((148, 145, 134), (166, 163, 152), (110, 107, 98)),
    ((118, 116, 110), (136, 134, 126), (88, 86, 82)),
    ((142, 138, 126), (160, 156, 142), (102, 98, 88)),  # warmer stone
]
MOSS = [(110, 128, 76), (96, 116, 68), (124, 140, 84)]


def diamond_mask():
    m = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(m)
    d.polygon([(CX, 0.5), (W - 0.5, CY), (CX, H - 0.5), (0.5, CY)], fill=255)
    return m


def inside(x, y, shrink=0.0):
    # iso diamond membership with optional inward shrink (edge margin)
    dx = abs(x - CX) / (W / 2 - shrink)
    dy = abs(y - CY) / (H / 2 - shrink)
    return dx + dy <= 1.0


def gen(seed):
    rnd = random.Random(seed)
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    # grout field with a touch of variation
    for y in range(H):
        for x in range(W):
            if inside(x, y):
                d.point((x, y), GROUT if rnd.random() > 0.18 else GROUT_DARK)

    # cobble packing: staggered rows every ~5px vertically (iso-squashed),
    # stones 4-7px wide with GROUT GAPS between (the dark seams are what
    # makes it read as a cobbled walkway, not a gravel pile), clip to diamond
    row = 0
    y = 1.0
    while y < H:
        xs = -2 + (2.4 if row % 2 else 0)
        x = xs + rnd.uniform(-1.0, 1.0)
        while x < W:
            sw = rnd.uniform(4.2, 7.0)   # stone width
            sh = sw * rnd.uniform(0.55, 0.7)  # iso squash
            cx, cy = x + sw / 2, y + sh / 2
            if inside(cx, cy, shrink=1.2) and inside(x, y, shrink=0.4):
                base, hi, sh_col = STONES[rnd.randrange(len(STONES))]
                bx, by = x, y
                # base blob (slightly squashed ellipse)
                d.ellipse([bx, by, bx + sw, by + sh], fill=base + (255,))
                # NW highlight crescent
                d.ellipse([bx + sw * 0.10, by + sh * 0.08,
                           bx + sw * 0.72, by + sh * 0.62], fill=hi + (255,))
                # SE shade crescent
                d.ellipse([bx + sw * 0.42, by + sh * 0.48,
                           bx + sw * 0.98, by + sh * 0.98], fill=sh_col + (255,))
                # re-stamp base core so highlight/shade read as crescents
                d.ellipse([bx + sw * 0.18, by + sh * 0.16,
                           bx + sw * 0.78, by + sh * 0.78], fill=base + (255,))
                # occasional moss fleck at the stone seam
                if rnd.random() < 0.13:
                    mx = bx + rnd.uniform(-1, sw)
                    my = by + rnd.uniform(-1, sh)
                    if inside(mx, my, shrink=1.5):
                        d.point((mx, my), fill=MOSS[rnd.randrange(3)] + (255,))
                        if rnd.random() < 0.5:
                            d.point((mx + 1, my), fill=MOSS[rnd.randrange(3)] + (255,))
            x += sw * rnd.uniform(1.18, 1.45)
        y += 4.0 + rnd.uniform(0, 1.3)
        row += 1

    # diamond edge: darken the two lower edges so tiles stack with a soft seam
    for x in range(W):
        for y in range(H):
            if not inside(x, y):
                continue
            dx = (x - CX) / (W / 2)
            dy = (y - CY) / (H / 2)
            s = dx + dy
            if s > 0.90:
                px = im.getpixel((x, y))
                if px[3] > 0:
                    k = 1.0 - (s - 0.90) * 3.2
                    im.putpixel((x, y), (int(px[0] * k), int(px[1] * k), int(px[2] * k), 255))

    # clip everything to the diamond
    mask = diamond_mask()
    r, g, b, a = im.split()
    im = Image.composite(im, Image.new('RGBA', (W, H), (0, 0, 0, 0)), mask)
    return im


OUT = '/home/z/my-project/repos/whatsapp-bot/core/rpgasset/homestead'
for name, seed in [('forest_cobble_a', 101), ('forest_cobble_b', 707), ('forest_cobble_c', 2029)]:
    im = gen(seed)
    im.save(f'{OUT}/{name}.png')
    print(name, im.size)
print('done')
