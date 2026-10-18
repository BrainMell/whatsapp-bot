#!/usr/bin/env python3
"""recolor_biomes.py - palette-swap the baked KayKit sprites into guild biomes.

  python3 scripts/kingdom3d/recolor_biomes.py [SRC_DIR] [OUT_ROOT]

Reads the base sprites in core/rpgasset/kingdom3d (the lush 'isle' look) and writes
recoloured copies of every TERRAIN / NATURE sprite (tiles, trees, hills, mountains,
rocks, plants, fields) to core/rpgasset/kingdom3d/biomes/<biome>/<same file name>.
Buildings, walls and props are not recoloured (shared).  Sprite names, anchors and the
autotile edge signatures are identical across biomes, so manifest.json is shared.
Also writes biomes/biomes.json (file lists + backdrop/haze colours for the renderer).

Pixel classes are picked by hue of the original KayKit palette:
  ground  (yellow-green grass, h .14-.30)     foliage (teal-green leaves, h .30-.50)
  water   (blue, h .50-.68, s>.4)             earth   (sand/brown/terracotta, h .02-.13)
  rock    (low saturation greys)
Each class gets (hue target or None, sat mult, val mult, optional hue shift) per biome.
"""
import colorsys, glob, json, os, sys, time
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO, 'core', 'rpgasset', 'kingdom3d')
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(SRC, 'biomes')

# class -> (target_hue | None, sat_mult, val_mult)   (None = keep hue)
BIOMES = {
    'desert': dict(
        ground=(0.108, 0.80, 1.06), foliage=(0.19, 0.70, 0.98), water=(0.50, 0.85, 1.05),
        earth=(0.065, 1.05, 0.80), rock=(0.07, 1.9, 1.08),
        backdrop=('#f2d59b', '#d9a966', '#8a5a2c'), label='Sun-scorched dunes'),
    'tundra': dict(
        ground=(0.57, 0.10, 1.22), foliage=(0.46, 0.55, 0.78), water=(0.52, 0.42, 1.18),
        earth=(0.07, 0.55, 0.78), rock=(0.60, 0.9, 1.05),
        backdrop=('#e8f2fa', '#a9c6dd', '#4f6f8c'), label='Frozen tundra'),
    'highlands': dict(
        ground=(0.135, 0.78, 0.97), foliage=(0.055, 0.85, 1.02), water=(None, 0.95, 0.97),
        earth=(None, 1.0, 0.95), rock=(0.03, 0.9, 1.0),
        backdrop=('#f0c58a', '#c9803f', '#5b2f1c'), label='Autumn highlands'),
    'volcanic': dict(
        ground=(0.03, 0.22, 0.46), foliage=(0.07, 0.55, 0.42), water=(0.065, 0.97, 1.25),
        earth=(0.03, 0.4, 0.45), rock=(0.02, 0.45, 0.62),
        backdrop=('#5a3a38', '#2b1b1c', '#0d0708'), label='Ashen volcanic wastes'),
}
PATTERNS = ('hex_', 'tree', 'hill', 'mountain', 'rock_', 'waterlily', 'waterplant', 'building_grain')


def rgb2hsv(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = a.max(-1); mn = a.min(-1); d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    rc = m & (mx == r); gc = m & (mx == g) & ~rc; bc = m & ~rc & ~gc
    h[rc] = ((g - b)[rc] / d[rc]) % 6
    h[gc] = (b - r)[gc] / d[gc] + 2
    h[bc] = (r - g)[bc] / d[bc] + 4
    h = h / 6.0
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    return h, s, mx


def hsv2rgb(h, s, v):
    i = np.floor(h * 6).astype(int) % 6; f = h * 6 - np.floor(h * 6)
    p = v * (1 - s); q = v * (1 - f * s); t = v * (1 - (1 - f) * s)
    r = np.choose(i, [v, q, p, p, t, v]); g = np.choose(i, [t, v, v, q, p, p]); b = np.choose(i, [p, p, t, v, v, q])
    return np.stack([r, g, b], -1)


def recolor(img, spec):
    a = np.asarray(img.convert('RGBA'), dtype=np.float32) / 255.0
    rgb, al = a[..., :3], a[..., 3]
    h, s, v = rgb2hsv(rgb)
    ground = (h >= 0.14) & (h < 0.30) & (s > 0.35)
    foliage = (h >= 0.30) & (h < 0.50) & (s > 0.35)
    water = (h >= 0.50) & (h < 0.68) & (s > 0.40)
    earth = ((h < 0.13) | (h > 0.95)) & (s > 0.25) & ~ground
    rock = ~(ground | foliage | water | earth)
    nh, ns, nv = h.copy(), s.copy(), v.copy()
    for mask, key in ((ground, 'ground'), (foliage, 'foliage'), (water, 'water'), (earth, 'earth'), (rock, 'rock')):
        th, sm, vm = spec[key]
        if th is not None:
            nh[mask] = th
        if key == 'rock':
            # greys have ~0 saturation: add a tint instead of multiplying
            ns[mask] = np.clip(np.maximum(s[mask], 0.10) * sm, 0, 1)
            if th is None:
                nh[mask] = h[mask]
        else:
            ns[mask] = np.clip(s[mask] * sm, 0, 1)
        nv[mask] = np.clip(v[mask] * vm, 0, 1)
    out = hsv2rgb(nh, ns, nv)
    res = np.concatenate([out, al[..., None]], -1)
    return Image.fromarray((np.clip(res, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')


def main():
    files = sorted(f for f in os.listdir(SRC) if f.endswith('.png') and f.startswith(PATTERNS) and not f.endswith('_sh.png'))
    info = {'files': files, 'biomes': {}}
    t0 = time.time()
    for name, spec in BIOMES.items():
        d = os.path.join(OUT, name); os.makedirs(d, exist_ok=True)
        for f in files:
            recolor(Image.open(os.path.join(SRC, f)), spec).save(os.path.join(d, f), optimize=True)
        info['biomes'][name] = dict(backdrop=list(spec['backdrop']), label=spec['label'])
        print(f'{name}: {len(files)} files  {time.time() - t0:.0f}s')
    with open(os.path.join(OUT, 'biomes.json'), 'w') as fh:
        json.dump(info, fh, separators=(',', ':'))


if __name__ == '__main__':
    main()
