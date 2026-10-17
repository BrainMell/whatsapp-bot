#!/usr/bin/env python3
"""Guild training/treasury re-pick: military/civic reads, zero houses.
training: stable -> forge -> gatehouse -> watchtower -> village hall
treasury l3: well -> granary staddle (elevated storehouse).
l2 re-picks (owner 2026-10-17 'guild buildings haven't been fixed like the
player base'): training l2 lumber_shed read ghost-pale -> blacksmith_forge
(weapon forge on the training yard); treasury l2 dark watchtower ->
market_stall (trade-wealth progression dovecote->stall->granary->barn->mill).
FACING LAW v2 (see build_poly_sprites.py header): village turntable f28
MIRRORED = corner view, door gable on the lit SW face. f0 frontal and f8
side both read as facing off-grid."""
from PIL import Image, ImageDraw, ImageFont, ImageOps

V = '/home/z/my-project/download/assets/packs/village/sprite/128sun'
GB = '/home/z/my-project/repos/whatsapp-bot/core/rpgasset/guildbase'

def frame_hero(path):
    """village pack = 32-step turntable (8x4 sheet, row-major);
    f28 mirrored = corner view with the front on the LIT SW face."""
    im = Image.open(path).convert('RGBA')
    W, H = im.size
    cw, ch = W / 8, H / 4
    r, c = divmod(28, 8)
    f = im.crop((int(c * cw), int(r * ch), int((c + 1) * cw), int((r + 1) * ch)))
    b = f.getbbox()
    f = f.crop(b) if b else f
    return ImageOps.mirror(f)

def cut_road_strip(im):
    """gatehouse frame ships with a road strip welded below — cut at the widest
    fully-transparent horizontal gap in the lower half."""
    a = im.getchannel('A')
    W, H = im.size
    empty_rows = [y for y in range(H // 3, H) if a.crop((0, y, W, y + 1)).getextrema()[0] == 0]
    if not empty_rows:
        return im
    # longest run of empty rows
    best, cur = None, [empty_rows[0], empty_rows[0]]
    for y in empty_rows[1:]:
        if y == cur[1] + 1:
            cur[1] = y
        else:
            if best is None or cur[1] - cur[0] > best[1] - best[0]:
                best = cur
            cur = [y, y]
    if best is None or cur[1] - cur[0] > best[1] - best[0]:
        best = cur
    cut = (best[0] + best[1]) // 2
    return im.crop((0, 0, W, cut))

JOBS = [
    ('1x1_stable_24bit.png',           f'{GB}/gb_training_l1.png', 115, False),
    ('1x1_blacksmith_forge_24bit.png', f'{GB}/gb_training_l2.png', 130, False),
    ('1x1_gatehouse_24bit.png',        f'{GB}/gb_training_l3.png', 150, True),
    ('1x1_watchtower_24bit.png',       f'{GB}/gb_training_l4.png', 150, False),
    ('1x1_village_hall_24bit.png',     f'{GB}/gb_training_l5.png', 185, False),
    ('1x1_granary_staddle_24bit.png',  f'{GB}/gb_treasury_l3.png', 140, False),
    # treasury tiers l1/l2/l4/l5 rebuilt at the hero frame too (old frames faced away)
    ('1x1_dovecote_24bit.png',         f'{GB}/gb_treasury_l1.png', 105, False),
    ('1x1_market_stall_24bit.png',     f'{GB}/gb_treasury_l2.png', 125, False),
    ('1x1_farmhouse_barn_24bit.png',   f'{GB}/gb_treasury_l4.png', 165, False),
    ('1x1_windmill_24bit.png',         f'{GB}/gb_treasury_l5.png', 185, False),
]
for src, out, w, de_road in JOBS:
    im = frame_hero(f'{V}/{src}')
    if de_road:
        im = cut_road_strip(im)
    sc = w / im.width
    im = im.resize((int(im.width * sc), int(im.height * sc)), Image.LANCZOS)
    im.save(out)
    print(out.split('/')[-1], im.size)

# check sheet
files = [o for _, o, _, _ in JOBS]
ims = [Image.open(f).convert('RGBA') for f in files]
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 15)
W = sum(im.width for im in ims) + 16 * (len(ims) + 1)
H = max(im.height for im in ims) + 40
canvas = Image.new('RGBA', (W, H), (40, 44, 38, 255))
d = ImageDraw.Draw(canvas)
x = 16
for f, im in zip(files, ims):
    canvas.paste(im, (x, 30), im)
    d.text((x, 6), f.split('/')[-1].replace('gb_', '').replace('.png', ''), font=font, fill=(240, 236, 220, 255))
    x += im.width + 16
canvas.convert('RGB').save('/tmp/gb_v2_sheet.jpg', quality=92)
print('sheet saved')
