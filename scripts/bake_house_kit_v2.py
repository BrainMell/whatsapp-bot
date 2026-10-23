#!/usr/bin/env python3
"""bake_house_kit_v2.py - rebuild the house-builder interior kit from Polyy.AI
pack art (256sun frontal crops) instead of hand-modeled GLBs.

Wall sprites are UPRIGHT rectangles (128x140: 126px wall + 14px skirt) - the
room renderer applies the 2:1 shear at draw time, so every 2m segment tiles
seamlessly with the next (the old bake baked no slant and the segments
staircased apart)."""
import os
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

FRAMES = '/home/z/my-project/download/assets/packs/frames'
OUT = '/tmp/hbqa/core/rpgasset/homestead/kit'
os.makedirs(OUT, exist_ok=True)

WALL_W, WALL_H, SKIRT = 64, 126, 14
WALL_TOTAL = WALL_H + SKIRT

def load(name):
    return Image.open(f'{FRAMES}/{name}_f0.png').convert('RGBA')

def crop_tiled(im, box, out_w, out_h, tiles_y, jitter=6, seed=1, mirror_x=True):
    """crop box, scale to out_w, tile vertically with brightness jitter;
    horizontal mirror-tiling (flip alternate tiles) kills vertical seams."""
    c = im.crop(box)
    sc = c.resize((out_w, int(c.height * out_w / c.width)), Image.LANCZOS)
    th = max(1, out_h // tiles_y)
    sc = sc.resize((out_w, th), Image.LANCZOS)
    rng = np.random.default_rng(seed)
    canvas = Image.new('RGBA', (out_w, out_h))
    y = 0
    while y < out_h:
        arr = np.asarray(sc, float).copy()
        arr[..., :3] *= 1.0 + (rng.random() - 0.5) * (jitter / 100.0)
        tile = Image.fromarray(np.clip(arr, 0, 255).astype('uint8'))
        canvas.paste(tile, (0, y))
        if y + th < out_h:
            d = ImageDraw.Draw(canvas)
            d.line([(0, y + th - 1), (out_w, y + th - 1)], fill=(0, 0, 0, 60))
        y += th
    if mirror_x:
        half = canvas.crop((0, 0, out_w // 2, out_h))
        canvas.paste(half.transpose(Image.FLIP_LEFT_RIGHT), (out_w - out_w // 2, 0))
    return canvas

def seam_shade(wall, base_y):
    """AO at the bottom of the wall + a soft top light."""
    arr = np.asarray(wall, float)
    h = base_y
    yy = np.arange(h)[:, None, None]
    ao = np.clip((yy - (h - 26)) / 26.0, 0, 1) * 0.30          # bottom AO
    hi = np.clip((26 - yy) / 26.0, 0, 1) * 0.10                # top light
    arr[:h, :, :3] = arr[:h, :, :3] * (1 - ao + hi)
    return Image.fromarray(np.clip(arr, 0, 255).astype('uint8'), 'RGBA')

def skirt_band(tex, w=WALL_W, h=SKIRT):
    """dark timber base band under the wall."""
    band = tex.resize((w, h), Image.LANCZOS)
    arr = np.asarray(band, float).copy()
    arr[..., :3] *= 0.45
    return Image.fromarray(np.clip(arr, 0, 255).astype('uint8'))

def make_wall(src, box, tiles_y, out, tint=1.0, seed=1):
    im = load(src)
    wall = crop_tiled(im, box, WALL_W, WALL_H, tiles_y, seed=seed)
    if tint != 1.0:
        arr = np.asarray(wall, float)[:, :, :3] * tint
        wall = Image.fromarray(np.clip(arr, 0, 255).astype('uint8'), 'RGBA')
    wall = seam_shade(wall, WALL_H)
    sprite = Image.new('RGBA', (WALL_W, WALL_TOTAL), (0, 0, 0, 0))
    sprite.paste(wall, (0, 0))
    sprite.paste(skirt_band(im.crop(box)), (0, WALL_H))
    sprite.save(f'{OUT}/{out}.png', optimize=True)
    print(f'{out:22s} {WALL_W}x{WALL_TOTAL}')
    return sprite

# ── wall tiers (theme -> pack source crop, f0 frontal faces) ──────────
# t1 rustic plank  <- 66 norwegian timber plank band (trimmed off the roof edge)
make_wall('66_norwegian_timber', (58, 106, 128, 126), 6, 'hou_wall_t1', seed=2)
# t2 half-timber   <- 7 rustic kingdom plaster+timber band (flat, no roof)
make_wall('7_rustic_kingdom', (65, 95, 125, 118), 5, 'hou_wall_t2', seed=3)
# t3 brick         <- 71 flemish brick tower upper face (flat brick)
make_wall('71_flemish_brick', (100, 20, 133, 60), 3, 'hou_wall_t3', seed=4)
# t4 rubble stone  <- 7 rustic kingdom stone tower shaft (tall, flat)
make_wall('7_rustic_kingdom', (48, 118, 76, 198), 2, 'hou_wall_t4', seed=5)
# t5 dressed stone <- 79 alsatian timber plaster tower shaft (tall cream)
make_wall('79_alsatian_timber', (58, 185, 92, 255), 2, 'hou_wall_t5', seed=6)

# window variants (real windows/shutters/slits from the same packs)
make_wall('79_alsatian_timber', (30, 155, 105, 182), 4, 'hou_wall_t2_win', seed=7)
make_wall('71_flemish_brick', (78, 105, 126, 170), 2, 'hou_wall_t3_win', seed=8)
make_wall('62_alpine_granite', (58, 140, 108, 215), 2, 'hou_wall_t4_win', seed=9)
make_wall('23_bergfried_keep', (100, 58, 130, 90), 4, 'hou_wall_t5_win', seed=10)
make_wall('66_norwegian_timber', (85, 155, 160, 185), 2, 'hou_wall_t1_win', seed=11)

# ── doorframe: flemish gate arch ──────────────────────────────────────────
im = load('71_flemish_brick')
door = im.crop((95, 143, 135, 202)).resize((56, 115), Image.LANCZOS)
door.save(f'{OUT}/hou_doorframe.png', optimize=True)
print('hou_doorframe          56x115')

# ── mezzanine decks: diamond top (dark plank) + timber skirt ─────────────
def deck_sprite(dw, dh, name, dark=0.72):
    """dw x dh tiles deck, top diamond + skirt; renderer contract:
    w=(dw+dh)*32, h=(dw+dh)*16+14, diamond centered at top."""
    w, h = (dw + dh) * 32, (dw + dh) * 16 + 14
    im = load('66_norwegian_timber')
    tex = crop_tiled(im, (58, 106, 152, 126), 256, (dw + dh) * 16, 4, seed=12)
    arr = np.asarray(tex, float).copy()
    arr[..., :3] *= dark
    tex = Image.fromarray(np.clip(arr, 0, 255).astype('uint8')).resize((w, h), Image.LANCZOS)
    spr = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(spr)
    cx, cy = w // 2, (dw + dh) * 8          # diamond top centre
    pts = [(cx, cy - (dw + dh) * 8), (cx + w // 2, cy), (cx, cy + (dw + dh) * 8), (cx - w // 2, cy)]
    # fill the diamond with plank texture via mask
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).polygon(pts, fill=255)
    spr.paste(tex, (0, 0), mask)
    d = ImageDraw.Draw(spr)
    d.polygon(pts, outline=(43, 28, 14, 255), width=2)
    # skirt: parallelogram bands below the SW and SE diamond edges (14px)
    wx, wy = cx - w // 2, cy                     # west point
    ex, ey = cx + w // 2, cy                     # east point
    sx, sy = cx, cy + (dw + dh) * 8              # south point
    d.polygon([(wx, wy), (sx, sy), (sx, sy + 14), (wx, wy + 14)], fill=(58, 38, 19, 255))
    d.polygon([(sx, sy), (ex, ey), (ex, ey + 14), (sx, sy + 14)], fill=(46, 30, 15, 255))
    # plank seams on the skirt
    for f in np.linspace(0.15, 0.85, 6):
        d.line([(wx + (sx - wx) * f, wy + (sy - wy) * f), (wx + (sx - wx) * f, wy + (sy - wy) * f + 14)], fill=(38, 24, 12, 255))
        d.line([(sx + (ex - sx) * f, sy + (ey - sy) * f), (sx + (ex - sx) * f, sy + (ey - sy) * f + 14)], fill=(32, 20, 10, 255))
    spr = spr.filter(ImageFilter.SMOOTH_MORE)
    spr.save(f'{OUT}/{name}.png', optimize=True)
    print(f'{name:22s} {w}x{h}')
    return spr

deck_sprite(4, 3, 'hou_mezz')
deck_sprite(6, 5, 'hou_deck_wood', dark=0.66)
deck_sprite(2, 2, 'hou_platform_ext', dark=0.70)

# ── railing: upright segment, renderer shears it like the walls ──────────
rw, rh = 64, 74
rail = Image.new('RGBA', (rw, rh), (0, 0, 0, 0))
d = ImageDraw.Draw(rail)
post_c, rail_c, rail_hi = (74, 48, 24, 255), (94, 62, 31, 255), (139, 96, 52, 255)
for px in (4, rw - 8):
    d.rectangle([px, 8, px + 5, rh], fill=post_c)
    d.rectangle([px, 8, px + 2, rh], fill=rail_hi)
d.rectangle([0, 10, rw, 17], fill=rail_c)      # top rail
d.rectangle([0, 10, rw, 12], fill=rail_hi)
d.rectangle([0, 38, rw, 44], fill=rail_c)      # mid rail
d.rectangle([0, 38, rw, 40], fill=rail_hi)
for px in range(14, rw - 8, 18):               # balusters
    d.rectangle([px, 17, px + 3, 38], fill=post_c)
rail.save(f'{OUT}/hou_railing.png', optimize=True)
print('hou_railing            128x74')

# ── kit.json v2 (same names; anchors per renderer contract) ──────────────
kit = {
    'title': 'Medieval house builder interior kit (Polyy.AI pack-derived)',
    'camera': {'yaw': 45.0, 'pitch': 26.565, 'px_per_m': 45.2548},
    'provenance': {
        'source': 'Polyy.AI itch.io packs (CC0): City Builder Village Buildings + RTS Castles 105',
        'slicing': '256sun frontal face crops, clone-tiled, AO/shade baked; slant applied by renderer shear',
        'fetched': 'scripts/fetch_polyy2.sh (signed-URL click-capture)',
        'baked_by': 'scripts/bake_house_kit_v2.py',
    },
    'sprites': {
        'hou_wall_t1':      dict(file='kit/hou_wall_t1.png', w=WALL_W, h=WALL_TOTAL),
        'hou_wall_t1_win':  dict(file='kit/hou_wall_t1_win.png', w=WALL_W, h=WALL_TOTAL),
        'hou_wall_t2':      dict(file='kit/hou_wall_t2.png', w=WALL_W, h=WALL_TOTAL),
        'hou_wall_t2_win':  dict(file='kit/hou_wall_t2_win.png', w=WALL_W, h=WALL_TOTAL),
        'hou_wall_t3':      dict(file='kit/hou_wall_t3.png', w=WALL_W, h=WALL_TOTAL),
        'hou_wall_t3_win':  dict(file='kit/hou_wall_t3_win.png', w=WALL_W, h=WALL_TOTAL),
        'hou_wall_t4':      dict(file='kit/hou_wall_t4.png', w=WALL_W, h=WALL_TOTAL),
        'hou_wall_t4_win':  dict(file='kit/hou_wall_t4_win.png', w=WALL_W, h=WALL_TOTAL),
        'hou_wall_t5':      dict(file='kit/hou_wall_t5.png', w=WALL_W, h=WALL_TOTAL),
        'hou_wall_t5_win':  dict(file='kit/hou_wall_t5_win.png', w=WALL_W, h=WALL_TOTAL),
        'hou_doorframe':    dict(file='kit/hou_doorframe.png', w=56, h=115),
        'hou_mezz':         dict(file='kit/hou_mezz.png', w=224, h=126),
        'hou_deck_wood':    dict(file='kit/hou_deck_wood.png', w=352, h=174),
        'hou_platform_ext': dict(file='kit/hou_platform_ext.png', w=128, h=78),
        'hou_railing':      dict(file='kit/hou_railing.png', w=128, h=74),
    },
}
# carry over entries for pieces this bake doesn't touch (floors, stone deck, stairs)
old_kit_path = f'{OUT}/kit.json'
carried = {}
if os.path.exists(old_kit_path):
    try:
        old = json.load(open(old_kit_path))
        for kname in ('hou_floor_wood', 'hou_floor_stone', 'hou_deck_stone', 'hou_mezz_stairs'):
            if kname in old.get('sprites', {}):
                carried[kname] = old['sprites'][kname]
    except Exception as e:
        print('carry-over skipped:', e)

kit['sprites'].update(carried)
kit['sprites'] = dict(sorted(kit['sprites'].items()))
json.dump(kit, open(f'{OUT}/kit.json', 'w'), indent=1)
print('kit.json written (carried:', list(carried), ')')
