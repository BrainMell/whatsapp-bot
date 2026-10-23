#!/usr/bin/env python3
"""bake_house_kit.py - bake the medieval house-builder architecture GLBs
(pack_models/house_kit/) into sprites for the INTERIOR room renderer
(core/rpg/homesteadRenderer.js).

The room view is 2:1 pixel iso (TW=64, TH=32 art px per tile), so this bake
uses a different camera from the kingdom3d_iso world sprites:
  yaw   = 45 deg   (diagonal room axes -> left/right wall runs)
  pitch = 30 deg   (tan(pitch) = 0.5 -> true 2:1 diamond)
  S     = 64/sqrt(2) = 45.2548 px per metre along x after yaw
  => 1 GLB metre == 1 room tile. A 2x2m floor tile lands at exactly 128x64 px,
     a 2m wall segment spans 2 tiles (128 px) like drawWallRun's rhythm.

Output: core/rpgasset/homestead/kit/<name>.png (+ _sh.png ground shadow for
pieces that sit on the floor) + kit.json (dims/anchors + provenance block).
"""
import json
import os
import sys

import numpy as np
import trimesh
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from kk_raster import transform, render, crop_alpha  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
SRC = os.path.join(HERE, 'pack_models', 'house_kit')
OUT = os.path.join(REPO, 'core', 'rpgasset', 'homestead', 'kit')

CAM_YAW = 45.0
CAM_PITCH = 30.0
S = 64.0 / (2 ** 0.5)

# sprite -> (glb, scale, ground_shadow)
# scale tweaks per piece so proportions sit right inside the room view
JOBS = {
    'hou_wall_t1':      ('tier01_rustic_plank_wall.glb', 1.0, True),
    'hou_wall_t1_win':  ('tier01_rustic_plank_wall_with_window.glb', 1.0, True),
    'hou_wall_t2':      ('tier02_half_timber_wall.glb', 1.0, True),
    'hou_wall_t2_win':  ('tier02_half_timber_wall_with_window.glb', 1.0, True),
    'hou_wall_t3':      ('tier03_brick_masonry_wall.glb', 1.0, True),
    'hou_wall_t3_win':  ('tier03_brick_masonry_wall_with_window.glb', 1.0, True),
    'hou_wall_t4':      ('tier04_rubble_stone_wall.glb', 1.0, True),
    'hou_wall_t4_win':  ('tier04_rubble_stone_wall_with_window.glb', 1.0, True),
    'hou_wall_t5':      ('tier05_dressed_stone_wall.glb', 1.0, True),
    'hou_wall_t5_win':  ('tier05_dressed_stone_wall_with_window.glb', 1.0, True),
    'hou_floor_wood':   ('floor_wood_plank_tile_2x2.glb', 1.0, False),
    'hou_floor_stone':  ('floor_stone_flagstone_tile_2x2.glb', 1.0, False),
    'hou_mezz':         ('mezzanine_platform_4x3.glb', 1.0, False),
    'hou_mezz_stairs':  ('mezzanine_staircase_10_step.glb', 1.0, True),
    'hou_railing':      ('balcony_railing_segment_2m.glb', 1.0, False),
    'hou_deck_wood':    ('raised_platform_6x5_wood_deck.glb', 1.0, True),
    'hou_deck_stone':   ('raised_platform_6x5_stone_foundation.glb', 1.0, True),
    'hou_platform_ext': ('small_platform_extension_2x2.glb', 1.0, True),
    'hou_doorframe':    ('medieval_arch_doorframe.glb', 1.0, True),
    'hou_window_lead':  ('medieval_leaded_window.glb', 1.0, False),
    'hou_window_goth':  ('medieval_gothic_arch_window.glb', 1.0, False),
}


def load_glb(path, scale):
    """house kit is Z-up metres with vertex colours -> rasteriser Y-up dict."""
    scene = trimesh.load(path, force='scene', process=False)
    vs, cs, ns = [], [], []
    for m in scene.dump(concatenate=False):
        f = np.asarray(m.faces)
        v = np.asarray(m.vertices, float)
        v = np.stack([v[:, 0], v[:, 2], -v[:, 1]], 1)  # Z-up -> Y-up
        col = (np.asarray(m.visual.vertex_colors, float)[:, :3]
               if m.visual.kind == 'vertex' else np.full((len(v), 3), 180.0))
        tv = v[f]
        n = np.cross(tv[:, 1] - tv[:, 0], tv[:, 2] - tv[:, 0])
        nl = np.linalg.norm(n, axis=1, keepdims=True)
        n = n / np.where(nl < 1e-12, 1, nl)
        vs.append(tv)
        cs.append(col[f])
        ns.append(np.repeat(n[:, None, :], 3, 1))
    model = dict(v=np.concatenate(vs), c=np.concatenate(cs), n=np.concatenate(ns))
    model['v'] = model['v'] * scale
    b = model['v'].reshape(-1, 3)
    model['v'][..., 0] -= (b[:, 0].min() + b[:, 0].max()) / 2
    model['v'][..., 2] -= (b[:, 2].min() + b[:, 2].max()) / 2
    model['v'][..., 1] -= b[:, 1].min()
    return model


def main():
    os.makedirs(OUT, exist_ok=True)
    kit = {
        'title': 'Medieval house builder architecture kit (interior sprites)',
        'camera': {'yaw': CAM_YAW, 'pitch': CAM_PITCH, 'px_per_m': round(S, 4)},
        'provenance': {
            'source': 'joker_medieval_house_builder starter kit (handcrafted GLBs, in-house)',
            'generator': 'upload joker_medieval_house_builder/build_structure_assets.py (trimesh, vertex colours)',
            'license': 'in-house art for this repo',
            'baked_by': 'scripts/kingdom3d/bake_house_kit.py with scripts/kingdom3d/kk_raster.py',
        },
        'sprites': {},
    }
    only = sys.argv[1:] if len(sys.argv) > 1 else None
    for name, (glb, sc, shadow) in JOBS.items():
        if only and name not in only:
            continue
        model = load_glb(os.path.join(SRC, glb), sc)
        cam = transform(model, yaw=CAM_YAW)
        spr, sh, meta = render(cam, S=S, pitch=CAM_PITCH, shadow=shadow)
        spr, meta = crop_alpha(spr, meta)
        spr.save(os.path.join(OUT, name + '.png'), optimize=True)
        entry = dict(file='kit/' + name + '.png', w=meta['w'], h=meta['h'],
                     ax=round(meta['ax'], 2), ay=round(meta['ay'], 2))
        if sh is not None:
            sh, m = crop_alpha(sh, meta['sh'])
            sh.save(os.path.join(OUT, name + '_sh.png'), optimize=True)
            entry['sh'] = dict(file='kit/' + name + '_sh.png', w=m['w'], h=m['h'],
                               ax=round(m['ax'], 2), ay=round(m['ay'], 2))
        kit['sprites'][name] = entry
        print(f"{name:18s} {entry['w']:4d}x{entry['h']:<4d} ax={entry['ax']:7.2f} ay={entry['ay']:7.2f}")
    kit['sprites'] = dict(sorted(kit['sprites'].items()))
    json.dump(kit, open(os.path.join(OUT, 'kit.json'), 'w'), indent=1)
    print('kit.json written')


if __name__ == '__main__':
    main()
