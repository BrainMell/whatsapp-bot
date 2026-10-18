#!/usr/bin/env python3
"""bake_kingdom_sprites.py - bake KayKit Medieval Hexagon Pack (CC0) into
iso sprites for the bot's guild kingdom + player base renderers.

  python3 scripts/kingdom3d/bake_kingdom_sprites.py [PACK_DIR] [OUT_DIR]

PACK_DIR defaults to $KK_HEX_DIR (the `addons/kaykit_medieval_hexagon_pack`
folder of https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0).
OUT_DIR defaults to core/rpgasset/kingdom3d.  Output: one PNG per sprite (+ a
`<name>_sh.png` ground-shadow layer for objects) and manifest.json with anchors
and per-edge terrain signatures for the hex autotiler.  Pure CPU, ~1-2 minutes.
"""
import glob
import json
import os
import sys
import time
from multiprocessing import Pool

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kk_raster import (Atlas, load_model, transform, render, crop_alpha,  # noqa: E402
                       sample_top_color, PITCH)

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
PACK = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get('KK_HEX_DIR', '')).rstrip('/')
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(REPO, 'core', 'rpgasset', 'kingdom3d')
S = 96

# edge index order: 0=E 1=SE 2=SW 3=W 4=NW 5=NE   (x,z) midpoints, +z = screen-down
EDGE_MID = [(1.0, 0.0), (0.5, 0.8660254), (-0.5, 0.8660254), (-1.0, 0.0), (-0.5, -0.8660254), (0.5, -0.8660254)]

# which folders bake 6 rotations (hex-edge aligned pieces)
ROT_DIRS = ('tiles/roads', 'tiles/rivers', 'tiles/coast')
ROT_NEUTRAL = ('wall_', 'fence_', 'building_bridge')
SKIP = ('waterless', 'hex_grass_bottom', 'projectile')

_atlas = None


def classify(rgb):
    if rgb is None:
        return -1
    r, g, b = [float(x) for x in rgb]
    if b > r + 35 and b > g - 10:
        return 2          # water
    if r > 205 and g > 150 and b > 95 and r > b + 50:
        return 1          # sand / road
    return 0              # grass / other land


def edge_classes(model):
    out = []
    for mx, mz in EDGE_MID:
        out.append(classify(sample_top_color(model, mx * 0.9, mz * 0.9, ymin=-0.55)))
    return out


def piece_conn(model):
    """Edges a wall/fence/bridge piece physically reaches (body above y=.35)."""
    v = model['v'].reshape(-1, 3)
    body = v[v[:, 1] > 0.35]
    out = []
    for mx, mz in EDGE_MID:
        d = np.hypot(body[:, 0] - mx * 0.95, body[:, 2] - mz * 0.95) if len(body) else np.array([9.0])
        out.append(int(d.min() < 0.28))
    return out


def job(task):
    global _atlas
    path, name, yaw, kind = task
    if _atlas is None:
        _atlas = Atlas(os.path.join(PACK, 'Textures', 'hexagons_medieval.png'))
    base = load_model(path, _atlas)
    model = transform(base, yaw=yaw)
    is_obj = kind != 'tile'
    spr, sh, meta = render(model, S=S, shadow=is_obj)
    spr, meta = crop_alpha(spr, meta)
    spr.save(os.path.join(OUT, name + '.png'), optimize=True)
    entry = dict(file=name + '.png', w=meta['w'], h=meta['h'], ax=round(meta['ax'], 2), ay=round(meta['ay'], 2))
    if sh is not None:
        sh.save(os.path.join(OUT, name + '_sh.png'), optimize=True)
        m = meta['sh']
        entry['sh'] = dict(file=name + '_sh.png', w=m['w'], h=m['h'], ax=round(m['ax'], 2), ay=round(m['ay'], 2))
    if kind == 'tile' and yaw is not None:
        entry['edges'] = edge_classes(model)
    if kind == 'piece':
        entry['conn'] = piece_conn(model)
    entry['kind'] = kind
    return name, entry


def main():
    if not PACK or not os.path.isdir(PACK):
        sys.exit('set KK_HEX_DIR / pass the pack dir (addons/kaykit_medieval_hexagon_pack)')
    os.makedirs(OUT, exist_ok=True)
    gl = os.path.join(PACK, 'Assets', 'gltf')
    tasks = []
    for p in sorted(glob.glob(os.path.join(gl, '**', '*.gltf'), recursive=True)):
        rel = os.path.relpath(p, gl).replace('\\', '/')
        stem = os.path.basename(rel)[:-5]
        if any(s in rel for s in SKIP):
            continue
        if rel.startswith('tiles/'):
            if rel.startswith(ROT_DIRS):
                for r in range(6):
                    tasks.append((p, f'{stem}@{r}', 60.0 * r, 'tile'))
            else:
                tasks.append((p, stem, 0.0, 'tile'))
        elif rel.startswith('buildings/neutral/') and stem.startswith(ROT_NEUTRAL):
            for r in range(6):
                tasks.append((p, f'{stem}@{r}', 60.0 * r, 'piece'))
        else:
            tasks.append((p, stem, 0.0, 'object'))
    t0 = time.time()
    print(f'baking {len(tasks)} sprites -> {OUT}')
    manifest = dict(S=S, pitch=PITCH, sprites={})
    with Pool(2) as pool:
        for i, (name, entry) in enumerate(pool.imap_unordered(job, tasks, chunksize=4)):
            manifest['sprites'][name] = entry
            if i % 50 == 0:
                print(f'  {i}/{len(tasks)} {time.time() - t0:.0f}s')
    manifest['sprites'] = dict(sorted(manifest['sprites'].items()))
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, separators=(',', ':'))
    print(f'done {len(tasks)} sprites in {time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
