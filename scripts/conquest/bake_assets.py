#!/usr/bin/env python3
"""Bakes conquest art into core/rpgasset/guildwar/conquest/.
Sources: DCSS/RLTiles (CC0, https://github.com/crawl/crawl crawl-ref/source/rltiles) + the bot's own core/rpgasset/enemies sprites.
usage: bake_assets.py <path-to-crawl-ref/source/rltiles>   (run from repo root)"""
import shutil, colorsys, os, sys
from PIL import Image
R = sys.argv[1].rstrip('/') + '/'; D = 'core/rpgasset/guildwar/conquest/'; E = 'core/rpgasset/enemies/'
for d in ['walls', 'floors', 'gates', 'turrets', 'golems']: os.makedirs(D + d, exist_ok=True)
walls = {'wood': ['brick_brown%d' % i for i in range(4)] + ['brick_brown-vines0', 'brick_brown-vines1'],
 'isle': ['stone_gray%d' % i for i in range(4)] + ['brick_gray0', 'brick_gray1'], 'desert': ['sandstone_wall%d' % i for i in range(6)],
 'tundra': ['ice_wall%d' % i for i in range(4)] + ['rime_wall0', 'rime_wall1'], 'highlands': ['wall_stone_lair%d' % i for i in range(4)] + ['lair0', 'lair1'],
 'volcanic': ['volcanic_wall%d' % i for i in range(6)], 'runed': ['elf-stone_runic%d' % i for i in range(4)] + ['stone_magic_crackle_1a', 'stone_magic_crackle_2a']}
for fam, l in walls.items():
    for i, n in enumerate(l): shutil.copy(R + 'dngn/wall/%s.png' % n, D + 'walls/%s_%d.png' % (fam, i))
floors = {'isle': ['limestone0', 'bog_green0', 'pebble_brown0'], 'desert': ['sand0', 'sandstone_floor0'], 'tundra': ['ice0', 'ice1', 'icy_floor0'],
 'highlands': ['grass/grass-dark0', 'grass/grass-dark1', 'moss0'], 'volcanic': ['volcanic_floor0', 'volcanic_floor1', 'infernal01'], 'mud': ['mud0', 'mud1']}
for fam, l in floors.items():
    for i, n in enumerate(l):
        import glob
        src = R + 'dngn/floor/%s.png' % n
        if not os.path.exists(src):
            g = sorted(glob.glob(R + 'dngn/floor/%s*.png' % n.rstrip('0123456789')))
            src = g[0]
        shutil.copy(src, D + 'floors/%s_%d.png' % (fam, i))
for st in ['closed', 'runed', 'broken', 'open']:
    for side in ['left', 'middle', 'right']: shutil.copy(R + 'dngn/doors/gate_%s_%s.png' % (st, side), D + 'gates/gate_%s_%s.png' % (st, side))
for n in ['statue_archer', 'statue_sword', 'statue_orb', 'statue_orb_guardian', 'statue_iron', 'metal_statue', 'zot_fire_orb_statue', 'zot_winter_orb_statue', 'zot_entropy_orb_statue', 'orcish_idol', 'crumbled_column_1', 'crumbled_column_2']:
    shutil.copy(R + 'dngn/statues/%s.png' % n, D + 'turrets/%s.png' % n)
def hue(im, shift, sat=1.0, val=1.0):
    im = im.convert('RGBA'); px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0: continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255); h = (h + shift) % 1; s = min(1, s * sat); v = min(1, v * val)
            r2, g2, b2 = colorsys.hsv_to_rgb(h, s, v); px[x, y] = (int(r2 * 255), int(g2 * 255), int(b2 * 255), a)
    return im
Image.open(E + 'earth (4).png').convert('RGBA').save(D + 'golems/clay.png')
hue(Image.open(E + 'earth (1).png'), 0.0, 0.15, 0.95).save(D + 'golems/stone.png')
Image.open(E + 'ice (1).png').convert('RGBA').save(D + 'golems/iron.png')
hue(Image.open(E + 'earth (2).png'), 0.62, 1.2, 1.05).save(D + 'golems/rune.png')
for realm, f in {'stormreach': 'water (4).png', 'sunscorch': 'fire (7).png', 'frostreach': 'ice (1).png', 'wildwood': 'highlevelbosses (11).png', 'emberfields': 'fire (11).png'}.items():
    Image.open(E + f).convert('RGBA').save(D + 'golems/titan_%s.png' % realm)
