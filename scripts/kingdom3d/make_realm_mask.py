#!/usr/bin/env python3
"""Derive per-realm land masks from the traced chart (core/rpgasset/continents/five_realms.jpg).
Output: core/rpgasset/continents/realm_mask.json  (grid of chars: '.'=sea/unusable, '1'..'5'=realm land)
Marker placement uses it, so a guild's pin always lands on real land of the chosen realm."""
import json, sys
from PIL import Image, ImageFilter
import numpy as np
SRC = sys.argv[1] if len(sys.argv) > 1 else 'core/rpgasset/continents/five_realms.jpg'
OUT = 'core/rpgasset/continents/realm_mask.json'
im = Image.open(SRC).convert('RGB'); a = np.array(im).astype(float); H, W = a.shape[:2]
X0, X1, Y0, Y1 = 58, 810, 175, 868
sea = np.array([176, 199, 191.]); d = np.sqrt(((a - sea) ** 2).sum(2))
land = (d > 38) | ((a.sum(2) > 690) & (d > 14))
m = np.zeros((H, W), bool); m[Y0:Y1, X0:X1] = land[Y0:Y1, X0:X1]
mi = Image.fromarray((m * 255).astype(np.uint8))
mi = mi.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(9)).filter(ImageFilter.MaxFilter(5))
mi = mi.filter(ImageFilter.MinFilter(15))          # erode: keep pins off the coast
m = np.array(mi) > 127
# things that are not land: compass, sea label, realm-name plaques (+margin)
for (x0, y0, x1, y1) in [(60, 760, 160, 868), (350, 495, 530, 540),
                         (350, 275, 515, 312), (110, 440, 270, 478), (575, 440, 755, 480),
                         (180, 665, 340, 705), (545, 658, 715, 698)]:
    m[y0:y1, x0:x1] = False
STEP = 4
ids = {'frostreach': '1', 'wildwood': '2', 'stormreach': '3', 'sunscorch': '4', 'emberfields': '5'}
def realm(x, y):
    if y < 325 and 255 <= x <= 650: return 'frostreach'
    if (y >= 615 and x >= 545) or (y >= 650 and x >= 440): return 'emberfields'
    if y >= 650 and x < 440: return 'sunscorch'
    if x >= 470: return 'stormreach'
    return 'wildwood'
rows = []
for gy in range(0, H // STEP):
    s = ''
    for gx in range(0, W // STEP):
        x, y = gx * STEP + STEP // 2, gy * STEP + STEP // 2
        s += ids[realm(x, y)] if m[y, x] else '.'
    rows.append(s)
json.dump({'w': W, 'h': H, 'step': STEP, 'ids': ids, 'rows': rows}, open(OUT, 'w'), separators=(',', ':'))
print('wrote', OUT, len(rows), 'x', len(rows[0]), {k: sum(r.count(v) for r in rows) for k, v in ids.items()})
