#!/usr/bin/env python3
# gen_px_trees.py — pixel-art tree/understory set for the iso forest law.
# Replaces the smooth Quaternius renders for trees/clutter (owner 2026-10-16
# 20:20Z: "could we make the trees something else?? A different set of trees
# more pixel arty"). Buildings stay megikit renders; the LIVING layer goes
# chunky so it matches the pixel moss tiles.
#
# Law: draw at LOGICAL resolution with hard (aliased) pixels, auto-outline
# 1px, then nearest-neighbour x2 -> each logical pixel = 2 art px = 1 final
# screen px after the renderer's SS=2 downscale. Crisp chunky pixels.
import os, random
from PIL import Image, ImageDraw, ImageFilter, ImageChops

OUT = '/home/z/my-project/repos/whatsapp-bot/core/rpgasset/homestead'
SHEET = '/home/z/my-project/download/px_tree_sheet.png'

# ── palette (moss-forest coordinated, muted, 1px dark outline) ──
OUTLINE = (24, 32, 20, 255)
FIR  = [(36, 62, 32), (46, 78, 38), (60, 100, 48), (78, 124, 60)]     # green fir
PINE = [(40, 66, 46), (50, 82, 56), (66, 104, 70), (86, 130, 88)]     # blue-green spruce
YOUNG= [(52, 88, 38), (66, 108, 48), (84, 132, 60), (104, 156, 74)]   # bright young pine
OAK  = [(58, 76, 30), (72, 92, 38), (90, 112, 48), (110, 134, 60)]    # olive oak
OAK2 = [(66, 84, 34), (82, 102, 42), (100, 122, 52), (120, 144, 64)]
BIRC = [(96, 128, 54), (116, 150, 66), (138, 172, 80)]
TRUNK, TRUNK_L, TRUNK_D = (92, 65, 40, 255), (110, 79, 48, 255), (68, 47, 32, 255)
BIRCH_BARK, BIRCH_BARK_D = (216, 211, 192, 255), (58, 53, 44, 255)
DEAD, DEAD_D, DEAD_DD = (104, 92, 79, 255), (76, 66, 56, 255), (56, 48, 41, 255)
ROCK, ROCK_L, ROCK_D = (118, 121, 110, 255), (146, 150, 138, 255), (88, 91, 82, 255)
CAP, CAP_L, STEM = (172, 66, 45, 255), (200, 94, 62, 255), (214, 200, 176, 255)
BERRY = (172, 58, 58, 255)
MOSS = (77, 116, 52, 255)
CONIF_A, CONIF_B = (42, 58, 34, 255), (36, 51, 30, 255)   # far silhouettes

def canvas(w, h):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)

def outline(im):
    """1px dark outline: dilate alpha, subtract, fill dark behind."""
    a = im.getchannel('A')
    big = a.filter(ImageFilter.MaxFilter(3))
    ring = ImageChops.subtract(big, a)
    base = Image.new('RGBA', im.size, (0, 0, 0, 0))
    dark = Image.new('RGBA', im.size, OUTLINE)
    base.paste(dark, (0, 0), ring)
    base.alpha_composite(im)
    return base

def save(im, name, sheet_sprites):
    im2 = outline(im).resize((im.width * 2, im.height * 2), Image.NEAREST)
    im2.save(os.path.join(OUT, name))
    sheet_sprites.append((name, im2))

# ── drawing helpers (all hard pixels) ─────────────────────────────────────
def tri(d, cx, base_y, half_w, h, col):
    """solid iso-ish triangle row: apex top, flat base, stepped edges."""
    for yy in range(h):
        t = yy / max(1, h - 1)
        hw = max(1, round(half_w * t))
        d.rectangle([cx - hw, base_y - h + yy, cx + hw, base_y - h + yy], fill=col)

def blob(d, cx, cy, rx, ry, col):
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=col)

def shade_under(d, cx, cy, rx, ry, col):
    """darker bottom-right crescent inside a canopy blob."""
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=col)
    d.ellipse([cx - rx - 1, cy - ry - 2, cx + rx - 3, cy + ry - 4], None)
    # carve light back: overdraw main blob offset up-left — caller does this

def canopy_texture(d, cx, cy, rx, ry, cols, rng, density=0.34):
    """scatter 1-2px highlight/leaf clusters, denser top-left."""
    n = int(rx * ry * density / 4)
    for _ in range(n):
        ang = rng.random() * 6.283
        rr = rng.random() ** 0.5
        px = cx + int(rx * 0.92 * rr * __import__('math').cos(ang))
        py = cy + int(ry * 0.92 * rr * __import__('math').sin(ang))
        if px >= cx - 1 and py <= cy + 1:      # top-left bias
            c = cols[min(len(cols) - 1, 2 + rng.randint(0, 1))]
        else:
            c = cols[rng.randint(0, len(cols) - 2)]
        d.rectangle([px, py, px + rng.randint(0, 1), py + rng.randint(0, 1)], fill=c)

def trunk(d, cx, top, bot, w, lcol, col, dcol):
    """tapered trunk with root flare + left light edge."""
    for yy in range(top, bot):
        t = (yy - top) / max(1, bot - top)
        ww = max(1, round(w * (0.55 + 0.45 * t)))
        d.rectangle([cx - ww, yy, cx + ww, yy], fill=col)
        d.rectangle([cx - ww, yy, cx - ww, yy], fill=lcol)
    # root flare
    d.rectangle([cx - w - 2, bot - 2, cx - w - 1, bot], fill=dcol)
    d.rectangle([cx + w + 1, bot - 2, cx + w + 2, bot], fill=dcol)

def branch(d, x, y, dx, dy, steps, w, col, rng):
    """gnarled branch: short segments with kinks, tapering."""
    for i in range(steps):
        nx, ny = x + dx, y + dy
        if rng.random() < 0.3: nx += rng.randint(-1, 1)
        d.line([x, y, nx, ny], fill=col, width=max(1, w - i * w // steps))
        x, y = nx, ny
    return x, y

rng = random.Random(1337)
SPRITES = []

# ═══ 1) px_pine_a — classic fir, 3 stacked tiers ═══
im, d = canvas(48, 80)
trunk(d, 24, 58, 74, 4, TRUNK_L, TRUNK, TRUNK_D)
tiers = [(34, 8, 30, FIR[0]), (30, 9, 46, FIR[1]), (24, 9, 60, FIR[2])]
for (hw, hh, by, col) in tiers:
    tri(d, 24, by, hw, hh, col)
# light left edges + snow-free tip highlight
for (hw, hh, by, col) in tiers:
    for yy in range(hh):
        t = yy / max(1, hh - 1); hw2 = max(1, round(hw * t))
        d.rectangle([24 - hw2, by - hh + yy, 24 - hw2 + 1, by - hh + yy], fill=FIR[3])
canopy_texture(d, 24, 34, 26, 24, FIR, rng, 0.22)
d.rectangle([23, 17, 25, 21], fill=FIR[3])   # connected tip
save(im, 'px_pine_a.png', SPRITES)

# ═══ 2) px_pine_b — tall slender spruce, blue-green, 4 tiers ═══
im, d = canvas(44, 90)
trunk(d, 22, 70, 84, 3, TRUNK_L, TRUNK, TRUNK_D)
tiers = [(26, 14, 34, PINE[0]), (23, 13, 48, PINE[1]), (19, 12, 60, PINE[2]), (13, 10, 70, PINE[3])]
for (hw, hh, by, col) in tiers:
    tri(d, 22, by, hw, hh, col)
for (hw, hh, by, col) in tiers:
    for yy in range(hh):
        t = yy / max(1, hh - 1); hw2 = max(1, round(hw * t))
        d.rectangle([22 - hw2, by - hh + yy, 22 - hw2, by - hh + yy], fill=PINE[3])
canopy_texture(d, 22, 40, 18, 30, PINE, rng, 0.2)
d.rectangle([21, 15, 23, 19], fill=PINE[3])  # connected tip
save(im, 'px_pine_b.png', SPRITES)

# ═══ 3) px_pine_c — young pine, bright, 2 tiers ═══
im, d = canvas(34, 58)
trunk(d, 17, 44, 52, 3, TRUNK_L, TRUNK, TRUNK_D)
tri(d, 17, 46, 13, 22, YOUNG[0]); tri(d, 17, 46, 13, 22, YOUNG[0])
for yy in range(22):
    t = yy / 21; hw2 = max(1, round(13 * t))
    d.rectangle([17 - hw2, 24 + yy, 17 - hw2 + 1, 24 + yy], fill=YOUNG[2])
tri(d, 17, 30, 9, 16, YOUNG[1])
for yy in range(16):
    t = yy / 15; hw2 = max(1, round(9 * t))
    d.rectangle([17 - hw2, 14 + yy, 17 - hw2 + 1, 14 + yy], fill=YOUNG[3])
canopy_texture(d, 17, 34, 12, 16, YOUNG, rng, 0.25)
save(im, 'px_pine_c.png', SPRITES)

# ═══ 4) px_oak_a — round canopy oak ═══
im, d = canvas(52, 76)
trunk(d, 26, 50, 70, 5, TRUNK_L, TRUNK, TRUNK_D)
d.line([26, 56, 26, 34], fill=TRUNK_D, width=3)
blob(d, 26, 30, 24, 21, OAK[1])          # main canopy
blob(d, 14, 36, 10, 8, OAK[1])           # left lobe
blob(d, 39, 35, 10, 8, OAK[0])           # right lobe (shadow side)
blob(d, 20, 22, 12, 9, OAK[2])           # top light mass
blob(d, 33, 24, 8, 6, OAK[3])            # sunlit crown
# carve: re-stamp shadow side crescents
blob(d, 40, 37, 8, 6, OAK[0])
canopy_texture(d, 26, 29, 22, 18, OAK, rng, 0.5)
save(im, 'px_oak_a.png', SPRITES)

# ═══ 5) px_oak_b — wide grandma oak, olive ═══
im, d = canvas(58, 78)
trunk(d, 29, 52, 72, 6, TRUNK_L, TRUNK, TRUNK_D)
d.line([29, 58, 20, 44], fill=TRUNK_D, width=2)
d.line([29, 58, 38, 44], fill=TRUNK_D, width=2)
blob(d, 29, 30, 27, 19, OAK2[1])
blob(d, 12, 36, 9, 7, OAK2[0]); blob(d, 46, 36, 9, 7, OAK2[0])
blob(d, 22, 21, 13, 9, OAK2[2]); blob(d, 36, 23, 10, 7, OAK2[3])
blob(d, 47, 37, 7, 5, OAK2[0])
canopy_texture(d, 29, 29, 25, 16, OAK2, rng, 0.5)
save(im, 'px_oak_b.png', SPRITES)

# ═══ 6) px_birch — pale trunk, airy canopy ═══
im, d = canvas(36, 70)
for yy in range(34, 64):
    ww = 2 if yy < 58 else 3
    d.rectangle([17 - ww, yy, 17 + ww, yy], fill=BIRCH_BARK)
    d.rectangle([17 - ww, yy, 17 - ww, yy], fill=(232, 228, 210, 255))
for yy in (38, 44, 45, 51, 57, 58):
    d.rectangle([15, yy, 20, yy], fill=BIRCH_BARK_D)
blob(d, 18, 22, 15, 14, BIRC[0])
blob(d, 12, 16, 8, 7, BIRC[1]); blob(d, 25, 18, 7, 6, BIRC[1])
blob(d, 18, 12, 7, 5, BIRC[2])
canopy_texture(d, 18, 20, 13, 11, BIRC, rng, 0.45)
save(im, 'px_birch.png', SPRITES)

# ═══ 7) px_dead — bare gnarled tree ═══
im, d = canvas(40, 66)
d.line([20, 60, 20, 26], fill=DEAD_D, width=5)
d.line([18, 60, 18, 26], fill=DEAD, width=2)
r2 = random.Random(77)
for (sx, sy, dx, dy, st, w) in [
    (20, 30, 8, -6, 7, 3), (20, 34, -9, -5, 7, 3),
    (20, 26, 3, -9, 8, 3), (24, 38, 10, -2, 5, 2), (16, 42, -8, 0, 4, 2),
]:
    ex, ey = branch(d, sx, sy, dx, dy, st, w, DEAD_D, r2)
    branch(d, ex, ey, dx // 2, -2, 3, 1, DEAD_DD, r2)
d.rectangle([16, 58, 25, 62], fill=DEAD_DD)
d.rectangle([14, 60, 27, 62], fill=DEAD_DD)
save(im, 'px_dead.png', SPRITES)

# ═══ 8) px_stump ═══
im, d = canvas(20, 16)
d.rectangle([5, 6, 14, 13], fill=TRUNK_D)
d.rectangle([5, 6, 7, 13], fill=TRUNK_L)
d.ellipse([3, 2, 16, 9], fill=TRUNK)
d.ellipse([5, 3, 14, 8], fill=(150, 112, 72, 255))
d.ellipse([7, 4, 12, 7], fill=TRUNK)
save(im, 'px_stump.png', SPRITES)

# ═══ 9) px_bush_a ═══
im, d = canvas(24, 20)
blob(d, 12, 11, 10, 7, OAK[1])
blob(d, 8, 9, 5, 4, OAK[2]); blob(d, 16, 10, 4, 3, OAK[3])
blob(d, 12, 14, 8, 3, OAK[0])
canopy_texture(d, 12, 11, 8, 5, OAK, rng, 0.5)
save(im, 'px_bush_a.png', SPRITES)

# ═══ 10) px_bush_b — berry bush ═══
im, d = canvas(26, 20)
blob(d, 13, 11, 11, 7, FIR[1])
blob(d, 9, 9, 5, 4, FIR[2]); blob(d, 17, 10, 5, 4, FIR[3])
for (bx, by) in [(7, 10), (12, 8), (16, 12), (19, 9), (10, 13), (14, 11)]:
    d.rectangle([bx, by, bx + 1, by + 1], fill=BERRY)
save(im, 'px_bush_b.png', SPRITES)

# ═══ 11) px_fern — 5 fronds ═══
im, d = canvas(28, 17)
for (dx, dy, ln) in [(-10, 3, 9), (-5, -1, 11), (0, -3, 12), (5, -1, 11), (10, 3, 9)]:
    for i in range(ln):
        t = i / ln
        d.rectangle([14 + int(dx * t), 13 + int(dy * t) - i // 3, 15 + int(dx * t), 13 + int(dy * t) - i // 3],
                    fill=YOUNG[1] if i < ln // 2 else YOUNG[2])
d.rectangle([13, 12, 15, 14], fill=YOUNG[0])
save(im, 'px_fern.png', SPRITES)

# ═══ 12) px_tuft ═══
im, d = canvas(15, 10)
for (x0, h) in [(2, 4), (4, 6), (6, 8), (8, 7), (10, 5), (12, 3)]:
    d.rectangle([x0, 9 - h, x0, 9], fill=YOUNG[2] if h > 5 else YOUNG[1])
d.rectangle([3, 9, 12, 9], fill=YOUNG[0])
save(im, 'px_tuft.png', SPRITES)

# ═══ 13) px_shroom — red cap ═══
im, d = canvas(13, 11)
d.rectangle([5, 6, 7, 10], fill=STEM)
d.rectangle([5, 6, 5, 10], fill=(232, 222, 198, 255))
d.ellipse([1, 2, 11, 7], fill=CAP)
d.ellipse([3, 2, 9, 5], fill=CAP_L)
for (sx, sy) in [(4, 3), (8, 4), (6, 5)]:
    d.rectangle([sx, sy, sx, sy], fill=(232, 221, 200, 255))
save(im, 'px_shroom.png', SPRITES)

# ═══ 14) px_rock ═══
im, d = canvas(22, 18)
d.ellipse([2, 4, 19, 16], fill=ROCK)
d.ellipse([4, 3, 13, 9], fill=ROCK_L)
d.ellipse([9, 8, 19, 16], fill=ROCK_D)
d.rectangle([4, 12, 8, 14], fill=MOSS)
d.rectangle([3, 14, 18, 16], fill=ROCK_D)
save(im, 'px_rock.png', SPRITES)

# ═══ 15) px_boulder — mossy ═══
im, d = canvas(30, 24)
d.ellipse([2, 5, 27, 22], fill=ROCK)
d.ellipse([5, 4, 17, 12], fill=ROCK_L)
d.ellipse([15, 10, 27, 22], fill=ROCK_D)
d.rectangle([5, 6, 11, 8], fill=MOSS)
d.rectangle([4, 16, 10, 19], fill=MOSS)
d.rectangle([3, 20, 26, 22], fill=ROCK_D)
save(im, 'px_boulder.png', SPRITES)

# ═══ 16/17) far conifer silhouettes (backdrop treeline + deep margin) ═══
for name, (w, h, col, tiers) in {
    'px_conifer_a.png': (30, 46, CONIF_A, [(12, 16, 40), (10, 13, 30), (7, 11, 20)]),
    'px_conifer_b.png': (24, 38, CONIF_B, [(10, 13, 33), (8, 11, 25), (6, 9, 17)]),
}.items():
    im, d = canvas(w, h)
    cx = w // 2
    d.rectangle([cx - 2, h - 8, cx + 1, h - 1], fill=col)
    for (hw, hh, by) in tiers:
        tri(d, cx, by, hw, hh, col)
    d.rectangle([cx - 1, h - h + 2, cx, 8], fill=col)
    save(im, name, SPRITES)

# ── contact sheet for visual QA ──
cols_n = 6
cell_w, cell_h = 130, 200
rows_n = (len(SPRITES) + cols_n - 1) // cols_n
sheet = Image.new('RGBA', (cols_n * cell_w, rows_n * cell_h), (56, 68, 44, 255))
sd = ImageDraw.Draw(sheet)
for i, (name, im2) in enumerate(SPRITES):
    cx, cy = (i % cols_n) * cell_w + cell_w // 2, (i // cols_n) * cell_h + cell_h - 14
    th = min(im2.height, cell_h - 30)
    tw = min(im2.width, cell_w - 10)
    disp = im2
    if im2.height > cell_h - 30 or im2.width > cell_w - 10:
        disp = im2.resize((min(im2.width, cell_w - 10), min(im2.height, cell_h - 30)), Image.NEAREST)
    sheet.paste(disp, (cx - disp.width // 2, cy - disp.height), disp)
    sd.text((cx - 40, cy + 2), name.replace('px_', '').replace('.png', ''), fill=(230, 225, 200, 255))
sheet.save(SHEET)
print('generated', len(SPRITES), 'sprites ->', OUT)
print('sheet ->', SHEET)
