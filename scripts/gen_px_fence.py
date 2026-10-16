#!/usr/bin/env python3
# gen_px_fence.py — pixel-art palisade fence runs for the base/guild ring.
# Owner 2026-10-16 21:23Z (pre-restart promise): "tree wall comes out, pixel
# fence ring goes in, everything behind it = dense hazed forest".
#
# Two directional runs (each tile = 64 art px = 32 logical px; the iso grid
# steps (+32,+16) art per tile along one diagonal, so a connecting run SLOPES
# 8 logical px across its 32-logical width):
#   px_fence_a.png — runs down-right  (north + south edges, along +x)
#   px_fence_b.png — runs down-left   (east + west edges, along +y)
# Same law as gen_px_trees.py: hard logical pixels, 1px dark outline,
# nearest x2 (each logical px = 1 final screen px after SS=2 downscale).
import os
from PIL import Image, ImageDraw, ImageFilter, ImageChops

OUT = '/home/z/my-project/repos/whatsapp-bot/core/rpgasset/homestead'

OUTLINE = (24, 32, 20, 255)
# weathered oak fence wood — sits between trunk brown and moss shadow
WOOD   = (128, 96, 60)
WOOD_L = (152, 116, 74)
WOOD_D = (100, 72, 44)
WOOD_DD = (76, 54, 34)
ROPE = (196, 178, 132)

W, H = 34, 22   # logical canvas: 32-wide run + 2 for outline headroom


def canvas():
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def outline(im):
    a = im.getchannel('A')
    big = a.filter(ImageFilter.MaxFilter(3))
    ring = ImageChops.subtract(big, a)
    base = Image.new('RGBA', im.size, (0, 0, 0, 0))
    dark = Image.new('RGBA', im.size, OUTLINE)
    base.paste(dark, (0, 0), ring)
    base.alpha_composite(im)
    return base


def picket(d, x, top, drop, h, main, light, dark):
    """vertical plank, top (top) at x..x+2, bottom lands 4px into the grass
    line + the run's slope drop at that x; slight left-lit shading."""
    y0 = top + drop
    d.rectangle([x, y0, x + 2, y0 + h], fill=main)
    d.rectangle([x, y0, x, y0 + h], fill=light)          # left highlight
    d.rectangle([x + 2, y0, x + 2, y0 + h], fill=dark)   # right shade
    # pointed tip (fence picket chamfer)
    d.point([(x + 1, y0 - 1)], fill=main)


def run(direction='a'):
    im, d = canvas()
    SLOPE = 8          # logical px drop across the run (iso step per tile)
    y_base = 16        # grass line at x=0; 16+SLOPE at x=32
    if direction == 'a':
        drop_at = lambda x: round(SLOPE * x / 32)
    else:
        drop_at = lambda x: round(SLOPE * (32 - x) / 32)

    # two slanted rails (top rail double-thick for readability)
    for (ry, rh, col) in [(4, 2, WOOD_L), (9, 2, WOOD)]:
        pts = []
        for x in range(0, 33):
            pts.append((x, ry + drop_at(x)))
        for (x, y) in pts:
            for k in range(rh):
                d.point([(x, y + k)], fill=col)
        # rail underside shading
        for (x, y) in pts:
            d.point([(x, y + rh)], fill=WOOD_D)

    # pickets: shared at both ends + one mid — verticals connect the slopes
    for x in (0, 15, 31):
        picket(d, x, 1, drop_at(x) - drop_at(x), 17 + drop_at(x), WOOD, WOOD_L, WOOD_D)
    # second mid picket for density (offset from the mid one)
    for x in (8, 23):
        picket(d, x, 2, 0, 16, WOOD_D, WOOD, WOOD_DD)

    # grass tufts at the picket feet (ties the fence into the moss floor)
    MOSS = (77, 116, 52, 255)
    for (gx, gy) in [(1, 18), (9, 19), (16, 19), (24, 19), (30, 18)]:
        d.point([(gx, gy)], fill=MOSS)
        d.point([(gx + 1, gy - 1)], fill=MOSS)

    im = outline(im)
    im = im.resize((im.width * 2, im.height * 2), Image.NEAREST)
    name = f'px_fence_{direction}.png'
    im.save(os.path.join(OUT, name))
    print(f'wrote {name} {im.size}')


if __name__ == '__main__':
    run('a')
    run('b')
