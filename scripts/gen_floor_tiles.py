#!/usr/bin/env python3
"""forest_floor_a/b/c.png — dark woodland floor tiles (64x32 iso diamonds).

Owner 2026-10-17 (v81 proof stack): "I don't see any tree terrains outside
like in my reference image". The reference (MELLOW-SAN base) shows the trees
outside the fence standing on a DARK mossy forest floor — the ground itself
changes character under the woodland, instead of the bright lawn moss
continuing to the horizon.

Generated directly at 64x32 with PIL: dark olive-brown carpet (~35% darker
and browner than forest_moss (77,104,50)), organic soil patches, leaf-litter
flecks, tiny twig strokes and sparse moss highlights. Three variants + a
per-cell seeded pick = no visible tiling across big wild fields. Low
per-tile contrast on purpose — these tile across hundreds of cells.
"""
from PIL import Image, ImageDraw
import random

W, H = 64, 32
CX, CY = W / 2, H / 2

# dark forest-floor carpet families: [base, alt, dark]
CARPETS = [
    ((58, 66, 40), (52, 60, 36), (44, 51, 30)),
    ((61, 68, 42), (55, 61, 37), (46, 52, 31)),
    ((56, 63, 39), (50, 57, 35), (43, 49, 29)),
]
# leaf litter / dry needles
LITTER = [(82, 68, 40), (91, 76, 46), (74, 60, 36), (86, 72, 42)]
# damp soil patches
SOIL = ((49, 44, 30), (54, 48, 33))
# moss highlight specks (sparse — canopy lets a little light through)
MOSS_HI = [(88, 100, 52), (94, 106, 57)]
TWIG = (62, 52, 32)


def inside(x, y, shrink=0.0):
    dx = abs(x - CX) / (W / 2 - shrink)
    dy = abs(y - CY) / (H / 2 - shrink)
    return dx + dy <= 1.0


def gen(seed):
    rnd = random.Random(seed)
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    carpet = rnd.choice(CARPETS)

    # 1) carpet field with per-pixel family jitter
    for y in range(H):
        for x in range(W):
            if not inside(x, y):
                continue
            r = rnd.random()
            if r < 0.62:
                c = carpet[0]
            elif r < 0.88:
                c = carpet[1]
            else:
                c = carpet[2]
            # gentle per-pixel brightness wobble keeps it organic, not flat
            w = rnd.randint(-3, 3)
            d.point((x, y), (max(0, c[0] + w), max(0, c[1] + w), max(0, c[2] + w), 255))

    # 2) damp soil blobs (2-4 per tile, organic rounded clusters)
    for _ in range(rnd.randint(2, 4)):
        sx, sy = rnd.uniform(6, W - 6), rnd.uniform(4, H - 4)
        if not inside(sx, sy, 3):
            continue
        rw, rh = rnd.uniform(2.5, 5.5), rnd.uniform(1.2, 2.6)
        for yy in range(H):
            for xx in range(W):
                if ((xx - sx) / rw) ** 2 + ((yy - sy) / rh) ** 2 <= 1 and inside(xx, yy) and rnd.random() < 0.85:
                    d.point((xx, yy), SOIL[0] if rnd.random() < 0.6 else SOIL[1])

    # 3) leaf-litter flecks (1-2px, the reference floor's signature texture)
    for _ in range(rnd.randint(26, 40)):
        lx, ly = rnd.uniform(1, W - 1), rnd.uniform(1, H - 1)
        if not inside(lx, ly, 1.5):
            continue
        c = rnd.choice(LITTER)
        d.point((lx, ly), c)
        if rnd.random() < 0.45:
            d.point((lx + rnd.choice((-1, 1)), ly + rnd.choice((-1, 0, 1))), c)

    # 4) tiny twig strokes (fallen wood, 2-4px, iso-diagonal bias)
    for _ in range(rnd.randint(2, 4)):
        tx, ty = rnd.uniform(4, W - 4), rnd.uniform(3, H - 3)
        if not inside(tx, ty, 2):
            continue
        ln = rnd.randint(2, 4)
        dxs, dys = rnd.choice(((1, 0), (0, 1), (1, 1), (1, -1)))
        for i in range(ln):
            px_, py_ = tx + dxs * i, ty + dys * i * 0.6
            if inside(px_, py_, 1.5):
                d.point((px_, py_), TWIG)

    # 5) sparse moss highlights (light starves under canopy — keep rare)
    for _ in range(rnd.randint(4, 9)):
        mx, my = rnd.uniform(1, W - 1), rnd.uniform(1, H - 1)
        if inside(mx, my, 1.5):
            d.point((mx, my), rnd.choice(MOSS_HI))

    return im


if __name__ == '__main__':
    import os
    out = os.path.join(os.path.dirname(__file__), '..', 'core', 'rpgasset', 'homestead')
    for i, seed in enumerate((20261017, 777001, 313370)):
        im = gen(seed)
        p = os.path.join(out, f'forest_floor_{chr(97 + i)}.png')
        im.save(p)
        px = [q for q in im.getdata() if q[3] > 200]
        avg = tuple(sum(c[j] for c in px) // len(px) for j in range(3))
        print(p, im.size, 'avg', avg)
