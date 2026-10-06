#!/usr/bin/env python3
"""PHASE A-final — extract the three walkway sprites (front / left / right)
as clean reusable assets. The combo plates stay UNTOUCHED (the established
walkway system keeps working exactly as before); these sprites are the
extracted 'paste-in' library the owner asked for.

Tight structural windows around each arch; interior-fill so the arch pastes
as one solid piece; ring-based color-match to the foundation plate; feather.
"""

from PIL import Image, ImageFilter
import numpy as np
import os

RUINS = '/home/z/my-project/repo/core/rpgasset/guildwar/ruins'
DOORS_OUT = os.path.join(RUINS, 'doors')
QA = '/home/z/my-project/qa_art'
os.makedirs(DOORS_OUT, exist_ok=True)


def load(name):
    return np.array(Image.open(os.path.join(RUINS, name)).convert('RGBA'), dtype=np.float32)


def save(arr, path):
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(path)


def dilate(m, px):
    for _ in range(px):
        m2 = m.copy()
        m2[1:, :] |= m[:-1, :]
        m2[:-1, :] |= m[1:, :]
        m2[:, 1:] |= m[:, :-1]
        m2[:, :-1] |= m[:, 1:]
        m = m2
    return m


plate0 = load('ruins_door_0.png')


def extract(src_name, window, out_name, margin=10, thresh=55, close_px=2, fill_thresh=14):
    src = load(src_name)
    x0, y0, x1, y1 = window
    d = np.abs(src[:, :, :3] - plate0[:, :, :3]).sum(axis=2)
    m = np.zeros(d.shape, bool)
    m[y0:y1, x0:x1] = d[y0:y1, x0:x1] > thresh
    if m.sum() < 100:
        print(' !! too little structure in', src_name, window)
        return None
    m = dilate(m, close_px)
    ys, xs = np.where(m)
    bx0, bx1, by0, by1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    # interior fill: inside the bbox, include anything that differs at all
    # (keeps the arch one solid piece — no pinholes of foundation showing)
    inner = np.zeros(d.shape, bool)
    inner[by0:by1 + 1, bx0:bx1 + 1] = d[by0:by1 + 1, bx0:bx1 + 1] > fill_thresh
    pm = m | inner
    # kill stray specks outside the main blob: keep only the largest connected
    # region (4-neighbour flood fill)
    from collections import deque
    lab = np.zeros(d.shape, np.int32)
    cur = 0
    best, best_n = 0, 0
    H, W = d.shape
    for sy in range(max(0, by0 - 4), min(H, by1 + 5)):
        for sx in range(max(0, bx0 - 4), min(W, bx1 + 5)):
            if pm[sy, sx] and lab[sy, sx] == 0:
                cur += 1
                q = deque([(sy, sx)])
                lab[sy, sx] = cur
                n = 0
                while q:
                    y, x = q.popleft()
                    n += 1
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        yy, xx = y + dy, x + dx
                        if 0 <= yy < H and 0 <= xx < W and pm[yy, xx] and lab[yy, xx] == 0:
                            lab[yy, xx] = cur
                            q.append((yy, xx))
                if n > best_n:
                    best_n, best = n, cur
    pm = lab == best
    pm = dilate(pm, 1)
    # color-match ring stats
    ring = dilate(pm, 8) & ~pm
    out = src.copy()
    for c in range(3):
        s = out[:, :, c][pm]
        s_ring_src = out[:, :, c][ring]
        s_ring_dst = plate0[:, :, c][ring]
        gain = np.clip(s_ring_dst.std() / max(s_ring_src.std(), 1e-3), 0.85, 1.18)
        shift = s_ring_dst.mean() - s_ring_src.mean() * gain
        out[:, :, c] = np.clip(out[:, :, c] * gain + shift, 0, 255)
    alpha = pm.astype(np.float32) * 255.0
    a = Image.fromarray(alpha.astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0))
    out[:, :, 3] = np.array(a, dtype=np.float32)
    bb = (max(0, bx0 - margin), max(0, by0 - margin), min(1200, bx1 + 1 + margin), min(900, by1 + 1 + margin))
    crop = out[bb[1]:bb[3], bb[0]:bb[2]]
    save(crop, os.path.join(DOORS_OUT, out_name))
    print(f' {out_name}: bbox {bb}  size {bb[2]-bb[0]}x{bb[3]-bb[1]}  px {int(pm.sum())}')

    # QA paste: composite the patch back over plate_0 and save a crop
    al = out[:, :, 3:4] / 255.0
    comp = plate0 * (1 - al) + out * al
    qa0 = Image.fromarray(np.clip(comp[bb[1]-40:bb[3]+40, max(0,bb[0]-40):min(1200,bb[2]+40)].astype(np.uint8), 0, 255))
    qa1 = Image.open(os.path.join(RUINS, src_name)).convert('RGB').crop((bb[1-1] and bb[0]-40 or 0, bb[1]-40, min(1200, bb[2]+40), min(900, bb[3]+40)))
    sheet = Image.new('RGB', (qa0.width * 2 + 20, qa0.height), (20, 18, 14))
    sheet.paste(qa0.convert('RGB'), (0, 0))
    sheet.paste(qa1, (qa0.width + 20, 0))
    sheet.save(os.path.join(QA, 'walkqa_' + out_name))
    return out, pm, bb


print('== FRONT (from plate_F — exact structural diff) ==')
extract('ruins_door_F.png', (480, 55, 850, 370), 'ruins_walk_front.png', thresh=40, fill_thresh=8, close_px=2)
print('== RIGHT (from plate_R) ==')
extract('ruins_door_R.png', (920, 340, 1198, 700), 'ruins_walk_right.png', thresh=55, fill_thresh=16)
print('== LEFT a/b (from plate_L_a / L_b) ==')
extract('ruins_door_L_a.png', (2, 340, 290, 700), 'ruins_walk_left.png', thresh=55, fill_thresh=16)
extract('ruins_door_L_b.png', (2, 340, 290, 700), 'ruins_walk_left_b.png', thresh=55, fill_thresh=16)
print('done')
