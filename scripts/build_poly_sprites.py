#!/usr/bin/env python3
"""Build the Polyy/Foozle sprite set into the repo (base structures, outland
clutter, guild castles + cottages).
FACING LAW v2 (owner 2026-10-17 'still facing the wrong direction' after the
f0 attempt): the sheets are turntables; our world is 2:1 iso, camera at the
S corner, sun NW (isoShadow marches down-right), so a correct building shows
TWO walls with its door gable on the SW (image-left, LIT) face - like the
RTS castle and the old Quaternius kit. Village sheets: f0 = flat frontal
elevation (billboard, reads 45 deg off-grid), f28 = corner view with the
front on the SE face; the pack bakes its light from image-RIGHT, so we use
f28 MIRRORED = front on the lit SW face, pack light flipped onto the SW.
RTS castle sheets (LIGHT LAW v3, owner 2026-10-17 'rotate the castle to face
the right direction'): measured with measure_castle_light.py — every castle
frame bakes its light from image-RIGHT (lit-SE raw = conflicts with our sun
NW; the gate sat in shadow while the wrong faces glowed). Fix = MIRROR f0:
lit faces flip onto SW (L/R 1.21, matches the village reference family) and
the gate lands centered on the S corner, still facing the camera/approach.
CASTLE LAW = f0 MIRRORED, same recipe as the village buildings.
Mossy 24-rot sheets: frontal - 45deg = f21, mirrored, same recipe.
Scales: base diamond width = (fw+fh) * 32px (TW/2), +spill for monuments."""
import os
from PIL import Image, ImageOps

PACKS = '/home/z/my-project/download/assets/packs'
HS = '/home/z/my-project/repos/whatsapp-bot/core/rpgasset/homestead'
GB = '/home/z/my-project/repos/whatsapp-bot/core/rpgasset/guildbase'
os.makedirs(GB, exist_ok=True)

VILLAGE = f'{PACKS}/village/sprite/128sun'
CASTLES = f'{PACKS}/castles/sprite/128sun'
FOREST = f'{PACKS}/mossyforest/sprite/1x/sun_fixed'
MINE1 = f'{PACKS}/mine/Foozle_2DS0008_Isometric_Gold_Mine_1/static_png'

def frames(path):
    im = Image.open(path).convert('RGBA')
    W, H = im.size
    cw, ch = W / 8, H / 4
    out = []
    for i in range(32):
        r, c = divmod(i, 8)
        f = im.crop((int(c * cw), int(r * ch), int((c + 1) * cw), int((r + 1) * ch)))
        bbox = f.getbbox()
        out.append(f.crop(bbox) if bbox else f)
    return out

def village_hero(path):
    """f28 mirrored: corner view, door gable on the LIT SW face (see header)."""
    return ImageOps.mirror(frames(path)[28])

def frame24(path, idx=21):
    """mossy forest: 24 rotations, grid 8x3 (probe). idx 21 = frontal - 45deg;
    caller mirrors for the lit-SW law."""
    im = Image.open(path).convert('RGBA')
    W, H = im.size
    r = W / H
    cols, rows = (8, 3) if abs(r - 8 / 3) < 0.25 else (6, 4)
    cw, ch = W / cols, H / rows
    rr, cc = divmod(idx, cols)
    f = im.crop((int(cc * cw), int(rr * ch), int((cc + 1) * cw), int((rr + 1) * ch)))
    bbox = f.getbbox()
    return f.crop(bbox) if bbox else f

def save(im, out, width=None, height=None):
    if width:
        sc = width / im.width
        im = im.resize((int(im.width * sc), int(im.height * sc)), Image.LANCZOS)
    im.save(out)
    print(f'{out}  {im.size}')

# ── base structures (facing law v2 — village_hero = f28 mirrored; see header)
# [target, source, out, width]
JOBS = [
    # house progression: round hut -> thatched cottage -> longhouse (3x3, 200px)
    ('V', '1x1_round_cottage_24bit.png',       f'{HS}/base_house_l1.png', 170),
    ('V', '1x1_thatched_cottage_24bit.png',    f'{HS}/base_house_l2.png', 195),
    ('V', '1x1_longhouse_24bit.png',           f'{HS}/base_house_l3.png', 230),
    # blacksmith: lumber shed -> forge -> forge (grand)
    ('V', '1x1_lumber_shed_24bit.png',         f'{HS}/base_smithy_l1.png', 175),
    ('V', '1x1_blacksmith_forge_24bit.png',    f'{HS}/base_smithy_l2.png', 200),
    ('V', '1x1_blacksmith_forge_24bit.png',    f'{HS}/base_smithy_l3.png', 225),
    # medbay: apothecary -> bakery -> stone chapel (sanatorium)
    ('V', '1x1_apothecary_24bit.png',          f'{HS}/base_medbay_l1.png', 185),
    ('V', '1x1_bakery_24bit.png',              f'{HS}/base_medbay_l2.png', 200),
    ('V', '1x1_stone_chapel_24bit.png',        f'{HS}/base_medbay_l3.png', 215),
    # alchemy: witch hut -> tavern inn -> wizard tower
    ('V', '1x1_witch_hut_24bit.png',           f'{HS}/base_alchemy_l1.png', 175),
    ('V', '1x1_tavern_inn_24bit.png',          f'{HS}/base_alchemy_l2.png', 205),
    ('V', '1x1_wizard_tower_24bit.png',        f'{HS}/base_alchemy_l3.png', 195),
    # pond: keep l1 (lily pond env art) / fisherman hut dock / rocky spring
    ('V', '1x1_fisherman_hut_24bit.png',       f'{HS}/base_pond_l2.png', 160),
    ('V', '1x1_stone_well_24bit.png',          f'{HS}/base_pond_l3.png', 150),
    # hunting gate
    ('V', '1x1_gatehouse_24bit.png',           f'{HS}/base_hunting_gate.png', 185),
    # guild member cottages (owner 2026-10-17 'guild buildings haven't been
    # fixed like the player base' — member houses now use the SAME bright
    # player-base building art, not dark barn/stable picks)
    ('V', '1x1_thatched_cottage_24bit.png',    f'{GB}/gb_cottage_a.png', 110),
    ('V', '1x1_timber_frame_house_24bit.png',  f'{GB}/gb_cottage_b.png', 115),
    ('V', '1x1_farmhouse_barn_24bit.png',      f'{GB}/gb_cottage_c.png', 115),
    ('V', '1x1_round_cottage_24bit.png',       f'{GB}/gb_cottage_d.png', 100),
]

for kind, src, out, w in JOBS:
    if kind == 'V':
        save(village_hero(f'{VILLAGE}/{src}'), out, width=w)

# ── mines (Foozle, 3 progression states, WITH ground so tiers read) ────────
save(Image.open(f'{MINE1}/gold_mine_with_ground_inactive.png').convert('RGBA'), f'{HS}/base_mines_l1.png', width=175)
save(Image.open(f'{MINE1}/gold_mine_with_ground_active_empty.png').convert('RGBA'), f'{HS}/base_mines_l2.png', width=195)
save(Image.open(f'{MINE1}/gold_mine_with_ground_active_full.png').convert('RGBA'), f'{HS}/base_mines_l3.png', width=225)

# ── outland clutter (mossy forest, frame 8 of 24) ─────────────────────────
OUTLANDS = [
    ('Rock_Monolith_128',        'poly_rock_monolith.png', 150),
    ('basalt_cluster_128',       'poly_basalt.png', 140),
    ('crystal_forest_rocks_128', 'poly_crystal_rocks.png', 130),
    ('rock_pylon_128',           'poly_rock_pylon.png', 120),
    ('rock_shard_spire_128',     'poly_rock_spire.png', 130),
    ('stream_rocks_128',         'poly_stream_rocks.png', 120),
    ('rocky_spring_128',         'poly_rocky_spring.png', 140),
    ('water_rock_128',           'poly_water_rock.png', 120),
    ('ancient_well_128',         'poly_ancient_well.png', 110),
    ('ruins_stone_arch_128',     'poly_ruin_arch.png', 140),
    ('ruins_stone_gate_128',     'poly_ruin_gate.png', 130),
    ('ruins_column_128',         'poly_ruin_column.png', 100),
    ('stone_ivy_tower_128',      'poly_ivy_tower.png', 150),
    ('ruins_clutter_128',        'poly_ruin_clutter.png', 120),
    ('Ancient_Slab_128',         'poly_ancient_slab.png', 110),
    ('grassy_log_128',           'poly_grassy_log.png', 110),
    ('mushroom_cluster_128',     'poly_mushrooms.png', 110),
    ('overgrown_fallen_tree_128','poly_fallen_tree.png', 130),
    ('root_ball_128',            'poly_root_ball.png', 100),
    ('gnarled_roots_128',        'poly_gnarled_roots.png', 110),
    ('fairy_stump_128',          'poly_fairy_stump.png', 100),
    ('fossilized_wood_128',      'poly_fossil_wood.png', 120),
]
for src, out, w in OUTLANDS:
    save(ImageOps.mirror(frame24(f'{FOREST}/{src}_1x_24rot.png', 21)), f'{HS}/{out}', width=w)

# also copy pond l3 as poly_rocky_spring is used in outlands; pond keeps well
# (pond l2 = fisherman hut, l3 = well -> hmm well for Crystal Spring? use spring)
save(ImageOps.mirror(frame24(f'{FOREST}/rocky_spring_128_1x_24rot.png', 21)), f'{HS}/base_pond_l3.png', width=160)

# ── guild castles (hall L1-5) ──────────────────────────────────────────────
CASTLE_JOBS = [
    ('23_bergfried_keep_nopalette.png',      f'{GB}/gb_castle_l1.png', 215),
    ('25_norman_keep_nopalette.png',         f'{GB}/gb_castle_l2.png', 240),
    ('24_crusader_concentric_nopalette.png', f'{GB}/gb_castle_l3.png', 265),
    ('1_marble_citadel_nopalette.png',       f'{GB}/gb_castle_l4.png', 280),
    ('8_forest_duchy_nopalette.png',         f'{GB}/gb_castle_l5.png', 310),
]
for src, out, w in CASTLE_JOBS:
    save(ImageOps.mirror(frames(f'{CASTLES}/{src}')[0]), out, width=w)

print('DONE')
