#!/usr/bin/env python3
# gen_px_castle.py — pixel-art CASTLE tier set for the GUILD CENTER.
# Owner 2026-10-16 21:23Z: "the center of the guild should be the castles
# asset pack" — the guild hall becomes a proper castle centerpiece. Built in
# the same chunky-pixel law as the forest set (hard logical px, 1px outline,
# nearest x2) so it sits native in the pixel forest instead of clashing with
# the smooth megikit renders. If the owner meant a specific external pack the
# swap is one sprite — this set guarantees the style stays coherent meanwhile.
#
# Tiers (guild hall L1-5): px_castle_l1..l5.png -> core/rpgasset/guildbase/
import os, random
from PIL import Image, ImageDraw, ImageFilter, ImageChops

OUT = '/home/z/my-project/repos/whatsapp-bot/core/rpgasset/guildbase'
SHEET = '/home/z/my-project/download/px_castle_sheet.png'

OUTLINE = (24, 30, 26, 255)
ST1 = (178, 174, 156)   # light stone
ST2 = (150, 146, 130)   # mid stone
ST3 = (122, 118, 104)   # shade stone
ST4 = (96, 94, 84)      # deep stone / mortar
SL   = (96, 106, 122)   # slate roof
SL_D = (72, 80, 94)
SL_L = (118, 128, 144)
WOOD  = (104, 74, 46)
WOOD_D = (76, 52, 32)
BAN   = (176, 60, 58)   # banner red
BAN_D = (132, 44, 44)
GOLD  = (222, 186, 88)
IVY   = (84, 120, 56)
IVY_D = (62, 94, 42)
WIN   = (32, 30, 28)


def canvas(w, h):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def outline(im):
    a = im.getchannel('A')
    big = a.filter(ImageFilter.MaxFilter(3))
    ring = ImageChops.subtract(big, a)
    base = Image.new('RGBA', im.size, (0, 0, 0, 0))
    dark = Image.new('RGBA', im.size, OUTLINE)
    base.paste(dark, (0, 0), ring)
    base.alpha_composite(im)
    return base


def finish(im, name, sheet_sprites):
    im2 = outline(im).resize((im.width * 2, im.height * 2), Image.NEAREST)
    im2.save(os.path.join(OUT, name))
    sheet_sprites.append((name, im2))
    print(f'wrote {name} {im2.size}')


# ── stone block helpers ───────────────────────────────────────────────────
def stone_face(d, x0, y0, w, h, rnd, lit=ST1, mid=ST2, shade=ST3):
    """stone wall face: mid base + left-lit column + block courses."""
    d.rectangle([x0, y0, x0 + w - 1, y0 + h - 1], fill=mid)
    d.rectangle([x0, y0, x0 + 1, y0 + h - 1], fill=lit)          # left light
    d.rectangle([x0 + w - 2, y0, x0 + w - 1, y0 + h - 1], fill=shade)
    for cy in range(y0 + 4, y0 + h, 5):                           # courses
        d.line([(x0 + 1, cy), (x0 + w - 2, cy)], fill=ST4)
        off = 3 if ((cy // 5) % 2) else 0
        for bx in range(x0 + off, x0 + w - 1, 7):
            d.point([(bx, cy)], fill=ST4)
    for _ in range(max(1, (w * h) // 46)):                        # speckle
        px = x0 + 2 + rnd.randrange(max(1, w - 3))
        py = y0 + 2 + rnd.randrange(max(1, h - 3))
        d.point([(px, py)], fill=rnd.choice([lit, shade, ST4]))


def battlements(d, x0, y0, w, walk=ST2):
    """merlon teeth along a wall top (drawn ABOVE y0)."""
    x = x0
    while x < x0 + w - 2:
        d.rectangle([x, y0 - 3, min(x + 2, x0 + w - 1), y0 - 1], fill=walk)
        d.point([(x, y0 - 3)], fill=ST3)
        x += 5


def slit(d, x, y, h=4):
    d.rectangle([x, y, x + 1, y + h], fill=WIN)


def window_arc(d, cx, y, w=4, h=5):
    d.rectangle([cx - w // 2, y, cx + w // 2, y + h], fill=WIN)
    d.point([(cx - w // 2, y - 1)], fill=WIN)
    d.point([(cx + w // 2, y - 1)], fill=WIN)


def gate(d, cx, y_base, w=9, h=11):
    """rounded-top wooden gate with portcullis grooves."""
    d.rectangle([cx - w // 2, y_base - h + 2, cx + w // 2, y_base - 1], fill=WOOD)
    d.point([(cx - w // 2 + 1, y_base - h + 1)], fill=WOOD)
    d.point([(cx + w // 2 - 1, y_base - h + 1)], fill=WOOD)
    d.rectangle([cx - w // 2, y_base - h + 2, cx - w // 2, y_base - 1], fill=WOOD_D)
    for gy in range(y_base - h + 3, y_base - 1, 3):
        d.line([(cx - w // 2 + 2, gy), (cx + w // 2 - 2, gy)], fill=WOOD_D)
    # stone arch ring
    for ax in range(-w // 2 - 1, w // 2 + 2):
        d.point([(cx + ax, y_base - h + (2 if abs(ax) < w // 2 else 0) - (1 if abs(ax) <= 2 else 0))], fill=ST3)


def cone(d, cx, y_base, w, h, finial=True):
    """slated conical roof, apex up; stepped left-light."""
    for yy in range(h):
        t = yy / max(1, h - 1)
        hw = max(1, round(w / 2 * t))
        col = SL_L if (yy < h // 3) else (SL if yy < 2 * h // 3 else SL_D)
        d.rectangle([cx - hw, y_base - h + yy, cx + hw, y_base - h + yy], fill=col)
        d.point([(cx - hw, y_base - h + yy)], fill=SL_L)
        d.point([(cx + hw, y_base - h + yy)], fill=SL_D)
    if finial:
        d.rectangle([cx, y_base - h - 4, cx, y_base - h - 1], fill=GOLD)
        d.point([(cx, y_base - h - 5)], fill=GOLD)


def banner(d, x, y0, h=8, col=BAN, dark=BAN_D):
    """hanging pennant with swallowtail foot."""
    d.rectangle([x, y0, x + 4, y0 + h - 1], fill=col)
    d.rectangle([x + 3, y0, x + 4, y0 + h - 1], fill=dark)
    d.point([(x, y0 + h)], fill=col)
    d.point([(x + 1, y0 + h)], fill=dark)
    d.point([(x + 4, y0 + h - 1)], fill=dark)
    d.rectangle([x, y0 - 1, x + 4, y0 - 1], fill=GOLD)


def ivy(d, x, y, rnd, n=6):
    for _ in range(n):
        px = x + rnd.randrange(-2, 3)
        py = y + rnd.randrange(-3, 3)
        d.point([(px, py)], fill=IVY if rnd.random() < 0.6 else IVY_D)


def round_tower(d, cx, y_base, w, h, rnd, roof_h=10, roof=True):
    """cylindrical tower: shaded cylinder + slit + optional cone."""
    x0 = cx - w // 2
    stone_face(d, x0, y_base - h, w, h, rnd)
    d.rectangle([x0, y_base - h, x0 + 1, y_base - 1], fill=ST1)
    d.rectangle([x0 + w - 2, y_base - h, x0 + w - 1, y_base - 1], fill=ST3)
    slit(d, cx, y_base - h + 6)
    if roof:
        cone(d, cx, y_base - h, w + 4, roof_h)
    else:
        battlements(d, x0 - 1, y_base - h, w + 2)
    # base flare
    d.rectangle([x0 - 1, y_base - 2, x0 + w, y_base - 1], fill=ST3)


def square_tower(d, cx, y_base, w, h, rnd, roof_h=9):
    x0 = cx - w // 2
    stone_face(d, x0, y_base - h, w, h, rnd)
    battlements(d, x0 - 1, y_base - h, w + 2)
    slit(d, cx, y_base - h + 5)
    cone(d, cx, y_base - h - 3, w + 2, roof_h)


def wall_span(d, x0, x1, y_base, h, rnd):
    """curtain wall between towers (x0<x1), battlemented."""
    if x1 <= x0:
        return
    stone_face(d, x0, y_base - h, x1 - x0, h, rnd)
    battlements(d, x0, y_base - h, x1 - x0)
    d.rectangle([x0, y_base - 2, x1 - 1, y_base - 1], fill=ST3)


# ═══════════════════════════════════════════════════════════════════════════
# TIERS
# ═══════════════════════════════════════════════════════════════════════════
def tier1(sheet_sprites):
    """L1 OUTPOST KEEP — lone square keep + palisade wings."""
    im, d = canvas(64, 72)
    rnd = random.Random(11)
    yb = 68
    # palisade wings
    for (x0, w) in [(6, 16), (44, 14)]:
        for px_ in range(x0, x0 + w, 4):
            d.rectangle([px_, yb - 12, px_ + 2, yb - 1], fill=WOOD)
            d.point([(px_ + 1, yb - 13)], fill=WOOD_D)
    # keep
    stone_face(d, 20, yb - 44, 26, 44, rnd)
    battlements(d, 19, yb - 44, 28)
    gate(d, 33, yb, 9, 11)
    slit(d, 26, yb - 36)
    slit(d, 39, yb - 36)
    window_arc(d, 33, yb - 26)
    ivy(d, 22, yb - 12, rnd, 4)
    finish(im, 'px_castle_l1.png', sheet_sprites)


def tier2(sheet_sprites):
    """L2 BAILEY FORT — keep + curtain + first round turret."""
    im, d = canvas(76, 80)
    rnd = random.Random(22)
    yb = 76
    wall_span(d, 8, 34, yb, 22, rnd)
    stone_face(d, 34, yb - 50, 26, 50, rnd)      # keep right of centre
    battlements(d, 33, yb - 50, 28)
    round_tower(d, 58, yb, 18, 36, rnd, roof_h=11)
    gate(d, 20, yb, 9, 11)
    slit(d, 41, yb - 42)
    window_arc(d, 47, yb - 32)
    ivy(d, 36, yb - 14, rnd, 5)
    banner(d, 45, yb - 56, 8)
    finish(im, 'px_castle_l2.png', sheet_sprites)


def tier3(sheet_sprites):
    """L3 STONE CASTLE — twin front turrets + gatehouse + keep behind."""
    im, d = canvas(92, 92)
    rnd = random.Random(33)
    yb = 88
    square_tower(d, 46, yb - 26, 24, 40, rnd, roof_h=12)   # keep, raised
    wall_span(d, 14, 78, yb, 24, rnd)
    round_tower(d, 16, yb, 18, 38, rnd, roof_h=11)
    round_tower(d, 76, yb, 18, 38, rnd, roof_h=11)
    gate(d, 46, yb, 10, 12)
    window_arc(d, 46, yb - 38)
    slit(d, 40, yb - 58)
    slit(d, 52, yb - 58)
    ivy(d, 20, yb - 12, rnd, 5)
    ivy(d, 72, yb - 12, rnd, 5)
    finish(im, 'px_castle_l3.png', sheet_sprites)


def tier4(sheet_sprites):
    """L4 GRAND CASTLE — taller cones + banners + keep roof."""
    im, d = canvas(104, 104)
    rnd = random.Random(44)
    yb = 100
    # central tall keep with cone
    stone_face(d, 38, yb - 62, 28, 56, rnd)
    battlements(d, 37, yb - 62, 30)
    cone(d, 52, yb - 65, 32, 14)
    # flanking curtain + turrets
    wall_span(d, 12, 40, yb, 26, rnd)
    wall_span(d, 64, 92, yb, 26, rnd)
    round_tower(d, 14, yb, 20, 42, rnd, roof_h=13)
    round_tower(d, 90, yb, 20, 42, rnd, roof_h=13)
    gate(d, 52, yb, 10, 12)
    window_arc(d, 52, yb - 44)
    slit(d, 45, yb - 52)
    slit(d, 59, yb - 52)
    ivy(d, 16, yb - 12, rnd, 6)
    ivy(d, 88, yb - 12, rnd, 6)
    banner(d, 46, yb - 72, 8)
    banner(d, 88, yb - 60, 7)
    finish(im, 'px_castle_l4.png', sheet_sprites)


def tier5(sheet_sprites):
    """L5 ROYAL CITADEL — four towers, grand keep, triple banners, ivy."""
    im, d = canvas(116, 118)
    rnd = random.Random(55)
    yb = 114
    # BACK row: two square towers peeking between front turrets
    square_tower(d, 38, yb - 30, 20, 36, rnd, roof_h=11)
    square_tower(d, 78, yb - 30, 20, 36, rnd, roof_h=11)
    # grand central keep
    stone_face(d, 42, yb - 70, 32, 62, rnd)
    battlements(d, 41, yb - 70, 34)
    window_arc(d, 58, yb - 58)
    window_arc(d, 58, yb - 44)
    cone(d, 58, yb - 73, 36, 15)
    # curtain walls + FRONT turrets
    wall_span(d, 12, 44, yb, 27, rnd)
    wall_span(d, 72, 104, yb, 27, rnd)
    round_tower(d, 14, yb, 21, 46, rnd, roof_h=14)
    round_tower(d, 102, yb, 21, 46, rnd, roof_h=14)
    # gatehouse block in front of the wall gap
    stone_face(d, 50, yb - 22, 16, 22, rnd)
    battlements(d, 49, yb - 22, 18)
    gate(d, 58, yb, 11, 13)
    # dress: ivy + banners + gold
    ivy(d, 16, yb - 14, rnd, 7)
    ivy(d, 100, yb - 14, rnd, 7)
    ivy(d, 44, yb - 16, rnd, 5)
    banner(d, 50, yb - 80, 8)
    banner(d, 60, yb - 80, 8)
    banner(d, 12, yb - 64, 7)
    banner(d, 100, yb - 64, 7)
    finish(im, 'px_castle_l5.png', sheet_sprites)


if __name__ == '__main__':
    sheet_sprites = []
    tier1(sheet_sprites)
    tier2(sheet_sprites)
    tier3(sheet_sprites)
    tier4(sheet_sprites)
    tier5(sheet_sprites)
    # contact sheet on moss
    pad = 14
    w = sum(im.width for _, im in sheet_sprites) + pad * (len(sheet_sprites) + 1)
    h = max(im.height for _, im in sheet_sprites) + pad * 2
    sheet = Image.new('RGBA', (w, h), (40, 54, 30, 255))
    x = pad
    for _, im in sheet_sprites:
        sheet.alpha_composite(im, (x, h - pad - im.height))
        x += im.width + pad
    sheet.save(SHEET)
    print('sheet ->', SHEET)
