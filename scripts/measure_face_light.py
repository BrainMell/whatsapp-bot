#!/usr/bin/env python3
"""Measure baked lighting per visible face for turntable frames f4/f28 vs the RTS castle.

Splits each sprite into left-face / right-face wall regions (below roofline) and
compares mean luminance, so we know which side the pack lights up.
"""
from PIL import Image
import numpy as np

def face_lum(img_path, frame=None, cols=8, rows=4):
    im = Image.open(img_path).convert("RGBA")
    if frame is not None:
        W, H = im.size
        cw, ch = W // cols, H // rows
        col, row = frame % cols, frame // cols
        im = im.crop((col * cw, row * ch, (col + 1) * cw, (row + 1) * ch))
    a = np.asarray(im).astype(float)
    h, w = a.shape[:2]
    # visible pixels
    vis = a[..., 3] > 40
    ys, xs = np.nonzero(vis)
    if len(xs) == 0:
        return None
    cx = (xs.min() + xs.max()) / 2
    wall = ys > ys.min() + (ys.max() - ys.min()) * 0.55
    left = wall & (xs < cx)
    right = wall & (xs >= cx)
    lum = a[..., :3].mean(axis=2)
    lv = lum[ys[left], xs[left]].mean() if left.any() else float("nan")
    rv = lum[ys[right], xs[right]].mean() if right.any() else float("nan")
    return lv, rv, int(left.sum()), int(right.sum())

village = "/home/z/my-project/download/assets/packs/village/sprite/128sun/1x1_thatched_cottage_24bit.png"
village2 = "/home/z/my-project/download/assets/packs/village/sprite/128sun/1x1_gatehouse_24bit.png"
village3 = "/home/z/my-project/download/assets/packs/village/sprite/128sun/1x1_stone_chapel_24bit.png"
castle = "/home/z/my-project/repos/whatsapp-bot/core/rpgasset/guildbase/gb_castle_l5.png"

print(f"{'sprite':<28}{'L(SW) lum':>10}{'R(SE) lum':>10}{'L px':>8}{'R px':>8}")
for name, path, f in [
    ("cottage f4", village, 4),
    ("cottage f28", village, 28),
    ("gatehouse f4", village2, 4),
    ("gatehouse f28", village2, 28),
    ("chapel f4", village3, 4),
    ("chapel f28", village3, 28),
    ("RTS castle L5 (static)", castle, None),
]:
    r = face_lum(path, f)
    if r:
        print(f"{name:<28}{r[0]:>10.1f}{r[1]:>10.1f}{r[2]:>8}{r[3]:>8}")
