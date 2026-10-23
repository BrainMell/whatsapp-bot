#!/usr/bin/env python3
"""bake_pack_models.py - bake the "joker building identity rework" GLBs (pack_models/) into sprites.

  KK_YAW=45 python3 scripts/kingdom3d/bake_pack_models.py     # player-base iso view -> core/rpgasset/kingdom3d_iso
  python3 scripts/kingdom3d/bake_pack_models.py               # top-down guild view  -> core/rpgasset/kingdom3d

Models are Z-up with vertex colours; they are converted to the rasteriser's Y-up model dict, scaled to the
procedural-struct footprint, rendered with kk_raster (same camera/light/shadow as every other sprite) and
merged into the existing manifest.json.
"""
import json, os, sys
import numpy as np
import trimesh
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kk_raster import transform, render, crop_alpha, PITCH

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
CAM_YAW = float(os.environ.get('KK_YAW', '0'))
CAM_PITCH = float(os.environ.get('KK_PITCH', str(PITCH)))
OUT = os.path.join(REPO, 'core', 'rpgasset', 'kingdom3d_iso' if CAM_YAW else 'kingdom3d')
S = 96
# sprite name -> (glb, scale to struct units). Alchemy: lv1 stillhouse, lv2 balcony tower, lv3 research complex
JOBS = {
    'struct_alc_tower_1': ('alchemy_tower_stage_1.glb', 0.44),
    'struct_alc_tower_2': ('alchemy_tower_stage_3.glb', 0.40),
    'struct_alc_tower_3': ('alchemy_tower_stage_5.glb', 0.36),
}


def load_glb(path, scale, flip):
    scene = trimesh.load(path, force='scene', process=False)
    vs, cs, ns = [], [], []
    for m in scene.dump(concatenate=False):
        f = np.asarray(m.faces)
        v = np.asarray(m.vertices, float)
        v = np.stack([v[:, 0], v[:, 2], -v[:, 1]], 1)                     # Z-up -> Y-up
        if flip:
            v = np.stack([v[:, 0], v[:, 1], -v[:, 2]], 1)
        col = np.asarray(m.visual.vertex_colors, float)[:, :3] if m.visual.kind == 'vertex' else np.full((len(v), 3), 180.0)
        tv = v[f]
        n = np.cross(tv[:, 1] - tv[:, 0], tv[:, 2] - tv[:, 0])
        nl = np.linalg.norm(n, axis=1, keepdims=True); n = n / np.where(nl < 1e-12, 1, nl)
        vs.append(tv); cs.append(col[f]); ns.append(np.repeat(n[:, None, :], 3, 1))
    model = dict(v=np.concatenate(vs), c=np.concatenate(cs), n=np.concatenate(ns))
    model['v'] = model['v'] * scale
    # centre on the footprint, sit on y=0
    b = model['v'].reshape(-1, 3)
    model['v'][..., 0] -= (b[:, 0].min() + b[:, 0].max()) / 2
    model['v'][..., 2] -= (b[:, 2].min() + b[:, 2].max()) / 2
    model['v'][..., 1] -= b[:, 1].min()
    return model


def main():
    mp = os.path.join(OUT, 'manifest.json')
    manifest = json.load(open(mp))
    flip = os.environ.get('KK_FLIP') == '1'
    for name, (glb, sc) in JOBS.items():
        base = load_glb(os.path.join(HERE, 'pack_models', glb), sc, flip)
        cam = transform(base, yaw=CAM_YAW)
        spr, sh, meta = render(cam, S=S, pitch=CAM_PITCH, shadow=True)
        spr, meta = crop_alpha(spr, meta)
        spr.save(os.path.join(OUT, name + '.png'), optimize=True)
        entry = dict(file=name + '.png', w=meta['w'], h=meta['h'], ax=round(meta['ax'], 2), ay=round(meta['ay'], 2))
        if sh is not None:
            sh.save(os.path.join(OUT, name + '_sh.png'), optimize=True)
            m = meta['sh']
            entry['sh'] = dict(file=name + '_sh.png', w=m['w'], h=m['h'], ax=round(m['ax'], 2), ay=round(m['ay'], 2))
        entry['kind'] = 'object'
        manifest['sprites'][name] = entry
        print(name, entry['w'], entry['h'])
    manifest['sprites'] = dict(sorted(manifest['sprites'].items()))
    json.dump(manifest, open(mp, 'w'), separators=(',', ':'))


if __name__ == '__main__':
    main()
