#!/usr/bin/env python3
# base41a — homestead buildings: house / smithy / medbay (3 levels each)
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from iso41 import *

OUT = '/home/z/my-project/work/asset41/out'
os.makedirs(OUT, exist_ok=True)


def crop_anchor(im, ax, ay, pad=4):
    """keep renderer anchor law: image bottom-centre == footprint south corner.
    ax/ay = anchor in this image's coords."""
    bb = im.getbbox()
    if not bb:
        return im.crop((0, 0, 8, 8))
    l, t, r, b = bb
    W = int(2 * max(ax - l, r - ax) + 2 * pad)
    H = int((b - t) + pad * 2)
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    out.paste(im.crop((l, t, r, b)), (int(W / 2 - ax + l), int(H - (b - t) - pad)))
    return out


def crop_anchor2(im, ax, ay):
    """anchor lands exactly at (W/2, H): renderer draws bottom-centre at the
    footprint's south corner"""
    bb = im.getbbox()
    if not bb: return im.crop((0, 0, 8, 8))
    l, t, r, b = bb
    W = int(2 * max(ax - l, r - ax) + 4)
    H = int(max(b - ay, 2) + (ay - t))
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    out.paste(im.crop((l, t, r, b)), (int(W / 2 - (ax - l)), int(H - (ay - t))))
    return out


def bake(name, fw, fh, mW=90, mH=190, draw=None, shadow=True, zoom=1.0):
    """draw on a generous canvas; south corner of footprint anchored bottom-centre"""
    W = (fw + fh) * 32 * zoom + 2 * mW
    H = mH + (fw + fh) * 16 * zoom + 10
    ox = W / 2 - (fw - fh) * 32 * zoom
    oy = H - 10 - (fw + fh) * 16 * zoom
    s = Spr(W, H, ox, oy, zoom=zoom)
    if shadow:
        contact_shadow(s, 0, 0, fw, fh, alpha=46)
    draw(s)
    im = finish(s, '/tmp/_iso_tmp.png')
    ax, ay = ox + (fw - fh) * 32 * zoom, oy + (fw + fh) * 16 * zoom
    im2 = crop_anchor2(im, ax, ay)
    im2.save(f'{OUT}/{name}.png')
    print(f'{name}.png {im2.size[0]}x{im2.size[1]}')


# ═══════════════════════ HOUSE ═══════════════════════
def house_l1(s):  # Hovel — tiny straw-roofed cottage
    w, d = 1.55, 1.35
    x0, y0 = (3 - w) / 2, (3 - d) / 2 + 0.15
    box(s, x0, y0, w, d, 0, 0.60, 'plaster', 'wood_d', plaster=True)
    # timber corners
    for bx in (x0 + 0.03, x0 + w - 0.12):
        box(s, bx, y0 + d - 0.09, 0.09, 0.09, 0, 0.60, 'timber_d', 'timber_d')
    gable_roof(s, x0, y0, w, d, 0.60, 0.58, axis='x', roof='straw', over=0.17, tiles=7, cap='wood_d')
    doorL(s, y0 + d, x0, w, h=0.40, w=0.26, off=0.42)
    winL(s, y0 + d, x0, w, 0.28, wh=0.22, w=0.18, off=0.78, lit=True)
    # stone chimney stub
    box(s, x0 + w - 0.34, y0 + 0.16, 0.24, 0.24, 0.86, 0.34, 'stone', 'stone_d', rows=2)
    # firewood pile
    for i, (bx, bz) in enumerate(((x0 - 0.34, 0.0), (x0 - 0.34, 0.13), (x0 - 0.34, 0.26))):
        s.line(s.P(bx, y0 + d - 0.55 + i * 0.06, bz + 0.09), s.P(bx + 0.42, y0 + d - 0.85 + i * 0.06, bz + 0.09),
               hx('wood', 0.9 - i * 0.1), wd=3 * SS)


def house_l2(s):  # Cottage — terracotta hip, chimney, flower boxes
    w, d = 2.0, 1.7
    x0, y0 = (3 - w) / 2, (3 - d) / 2 + 0.1
    box(s, x0, y0, w, d, 0, 0.16, 'stone', 'stone', rows=1)                    # stone skirt
    box(s, x0 + 0.04, y0 + 0.04, w - 0.08, d - 0.08, 0.16, 0.58, 'plaster', 'plaster', plaster=True)
    hip_roof(s, x0 + 0.04, y0 + 0.04, w - 0.08, d - 0.08, 0.74, 0.62, roof='terra', rlf=0.34, tiles=6)
    doorL(s, y0 + d, x0, w, h=0.48, w=0.30, off=0.40)
    winL(s, y0 + d, x0, w, 0.44, wh=0.24, w=0.20, off=0.76, lit=True, base_z=0.16)
    winR(s, x0 + w, y0, d, 0.44, wh=0.24, w=0.18, off=0.5, base_z=0.16)
    # flower boxes under the lit window
    fb = s.P(x0 + w * 0.76, y0 + d, 0.40)
    s.d.rectangle([fb[0] - 16 * SS, fb[1] - 4 * SS, fb[0] + 16 * SS, fb[1] + 3 * SS], fill=hx('wood', 0.85))
    for i in range(-1, 2):
        s.d.ellipse([fb[0] + i * 9 * SS - 3 * SS, fb[1] - 10 * SS, fb[0] + i * 9 * SS + 3 * SS, fb[1] - 3 * SS],
                    fill=hx('leaf' if i else 'red', 0.95))
    # chimney with cap
    box(s, x0 + 0.28, y0 + 0.28, 0.28, 0.28, 1.02, 0.44, 'stone', 'stone_d', rows=3)
    box(s, x0 + 0.24, y0 + 0.24, 0.36, 0.36, 1.46, 0.09, 'stone_d', 'stone_d')
    # barrel by the door
    bx, by = x0 + w * 0.40, y0 + d + 0.28
    cylinder(s, bx, by, 0.14, 0, 0.24, 'wood', band=True, nrows=2)


def house_l3(s):  # Manor — stone hall + jettied timber upper + red roof
    w, d = 2.2, 1.8
    x0, y0 = (3 - w) / 2, (3 - d) / 2 + 0.1
    box(s, x0, y0, w, d, 0, 0.52, 'stone', 'stone', rows=3)
    # jettied upper (slightly larger footprint)
    uw, ud = w + 0.14, d + 0.14
    ux, uy = x0 - 0.07, y0 - 0.07
    box(s, ux, uy, uw, ud, 0.52, 0.56, 'plaster', 'wood_d', plaster=True)
    # jetty beam
    for (jx, jy, jw, jd) in ((ux, uy + ud - 0.08, uw, 0.08), (ux, uy, 0.08, ud)):
        box(s, jx, jy, jw, jd, 0.48, 0.10, 'timber_d', 'timber_d')
    # timber verticals on the upper
    for u in (0.08, 0.5, 0.92):
        box(s, ux + uw * u - 0.045, uy + ud - 0.08, 0.09, 0.08, 0.52, 0.56, 'timber', 'timber')
    gable_roof(s, ux, uy, uw, ud, 1.08, 0.72, axis='x', roof='red', over=0.16, tiles=7, cap='gold_d')
    doorL(s, y0 + d, x0, w, h=0.46, w=0.32, off=0.5, colr='door_d')
    # steps
    box(s, x0 + w * 0.36, y0 + d, w * 0.28, 0.16, 0, 0.08, 'stone_l', 'stone')
    winL(s, y0 + d, x0, w, 0.20, wh=0.20, w=0.18, off=0.20, lit=True)
    winL(s, y0 + d, x0, w, 0.20, wh=0.20, w=0.18, off=0.80, lit=True)
    winL(s, y0 + d, x0, w, 0.70, wh=0.24, w=0.20, off=0.30, lit=True, base_z=0.52)
    winL(s, y0 + d, x0, w, 0.70, wh=0.24, w=0.20, off=0.70, lit=True, base_z=0.52)
    winR(s, x0 + w, y0, d, 0.70, wh=0.24, w=0.18, off=0.5, base_z=0.52)
    # twin chimneys + weathervane
    box(s, x0 + 0.22, y0 + 0.22, 0.24, 0.24, 1.42, 0.42, 'stone', 'stone_d', rows=3)
    box(s, x0 + w - 0.46, y0 + 0.22, 0.24, 0.24, 1.42, 0.30, 'stone', 'stone_d', rows=2)
    vp = s.P(x0 + w * 0.55, y0 + d * 0.5, 1.84)
    s.line(vp, (vp[0], vp[1] - 14 * SS), hx('iron'), 2 * SS)
    s.line((vp[0] - 8 * SS, vp[1] - 10 * SS), (vp[0] + 5 * SS, vp[1] - 13 * SS), hx('gold'), 2 * SS)
    s.d.ellipse([vp[0] - 2 * SS, vp[1] - 16 * SS, vp[0] + 2 * SS, vp[1] - 12 * SS], fill=hx('gold'))


# ═══════════════════════ SMITHY ═══════════════════════
def smithy_l1(s):  # Forge Shed — timber shed + stone stack + ember door
    w, d = 1.95, 1.55
    x0, y0 = (3 - w) / 2, (3 - d) / 2 + 0.1
    box(s, x0, y0, w, d, 0, 0.62, 'wood', 'wood_d', planked=True)
    gable_roof(s, x0, y0, w, d, 0.62, 0.52, axis='x', roof='slate', over=0.18, tiles=5)
    # forge mouth (lit) on the +y face
    a = s.P(x0 + w * 0.30, y0 + d, 0.44)
    b = s.P(x0 + w * 0.66, y0 + d, 0.44)
    c = s.P(x0 + w * 0.66, y0 + d, 0.06)
    e = s.P(x0 + w * 0.30, y0 + d, 0.06)
    s.poly([a, b, c, e], hx('door_d', 0.30))
    glow = s.P(x0 + w * 0.48, y0 + d, 0.25)
    s.d.ellipse([glow[0] - 6 * SS, glow[1] - 4 * SS, glow[0] + 6 * SS, glow[1] + 4 * SS], fill=hx('winlit', 0.95))
    # BIG stone chimney at the back
    box(s, x0 + w - 0.52, y0 + 0.12, 0.40, 0.40, 0.98, 0.80, 'stone', 'stone_d', rows=4)
    box(s, x0 + w - 0.58, y0 + 0.06, 0.52, 0.52, 1.78, 0.10, 'stone_d', 'stone_d')
    # anvil block out front
    bx, by = x0 + 0.28, y0 + d + 0.34
    box(s, bx, by, 0.26, 0.20, 0, 0.22, 'iron', 'iron')
    s.d.polygon([s.P(bx - 0.04, by + 0.10, 0.22), s.P(bx + 0.30, by + 0.10, 0.22),
                 s.P(bx + 0.30, by + 0.10, 0.30), s.P(bx - 0.04, by + 0.10, 0.30)], fill=hx('iron', 1.15))
    # quench barrel
    cylinder(s, x0 + w + 0.26, y0 + d - 0.1, 0.13, 0, 0.22, 'wood', nrows=2)


def smithy_l2(s):  # Stone Forge
    w, d = 2.05, 1.65
    x0, y0 = (3 - w) / 2, (3 - d) / 2 + 0.1
    box(s, x0, y0, w, d, 0, 0.74, 'stone', 'stone_d', rows=4)
    hip_roof(s, x0, y0, w, d, 0.74, 0.56, roof='slate', rlf=0.30, tiles=6)
    doorL(s, y0 + d, x0, w, h=0.50, w=0.30, off=0.30, colr='red_d')
    # forge mouth lit
    a = s.P(x0 + w * 0.62, y0 + d, 0.46)
    b = s.P(x0 + w * 0.88, y0 + d, 0.46)
    c = s.P(x0 + w * 0.88, y0 + d, 0.08)
    e = s.P(x0 + w * 0.62, y0 + d, 0.08)
    s.poly([a, b, c, e], hx('door_d', 0.30))
    glow = s.P(x0 + w * 0.75, y0 + d, 0.27)
    s.d.ellipse([glow[0] - 6 * SS, glow[1] - 4 * SS, glow[0] + 6 * SS, glow[1] + 4 * SS], fill=hx('winlit'))
    winR(s, x0 + w, y0, d, 0.34, wh=0.22, w=0.18, off=0.5, lit=True)
    # horseshoe sign on the front
    sp = s.P(x0 + w * 0.14, y0 + d, 0.56)
    s.d.arc([sp[0] - 7 * SS, sp[1] - 9 * SS, sp[0] + 7 * SS, sp[1] + 5 * SS], 200, 540, fill=hx('gold_d'), width=3 * SS)
    # chimney
    box(s, x0 + w - 0.56, y0 + 0.16, 0.36, 0.36, 1.20, 0.66, 'stone', 'stone_d', rows=3)
    # trough + horseshoes on the ground
    box(s, x0 + 0.16, y0 + d + 0.18, 0.44, 0.18, 0, 0.14, 'wood_d', 'iron')
    s.d.arc([s.P(x0 + w + 0.30, y0 + d + 0.1, 0)[0] - 5 * SS, s.P(x0 + w + 0.30, y0 + d + 0.1, 0)[1] - 3 * SS,
             s.P(x0 + w + 0.30, y0 + d + 0.1, 0)[0] + 5 * SS, s.P(x0 + w + 0.30, y0 + d + 0.1, 0)[1] + 3 * SS],
            0, 360, fill=hx('iron', 1.1), width=2 * SS)


def smithy_l3(s):  # Great Forge — twin stacks, gold-trimmed red roof, banner
    w, d = 2.2, 1.8
    x0, y0 = (3 - w) / 2, (3 - d) / 2 + 0.1
    box(s, x0, y0, w, d, 0, 0.80, 'stone', 'stone', rows=4)
    # gold string course
    for (fx, fy, fw2, fd2, fz) in ((x0, y0 + d, w, 0.0, 0.80), (x0 + w, y0, 0.0, d, 0.80)):
        pass
    a = s.P(x0, y0 + d, 0.84); b = s.P(x0 + w, y0 + d, 0.84)
    s.line(a, b, hx('gold_d', 0.95), wd=2 * SS)
    a = s.P(x0 + w, y0, 0.84); b = s.P(x0 + w, y0 + d, 0.84)
    s.line(a, b, hx('gold_d', 0.80), wd=2 * SS)
    hip_roof(s, x0, y0, w, d, 0.80, 0.62, roof='red', rlf=0.30, tiles=6, cap='gold')
    doorL(s, y0 + d, x0, w, h=0.52, w=0.32, off=0.24, colr='door_d')
    # great glowing forge mouth
    a = s.P(x0 + w * 0.52, y0 + d, 0.50)
    b = s.P(x0 + w * 0.86, y0 + d, 0.50)
    c = s.P(x0 + w * 0.86, y0 + d, 0.08)
    e = s.P(x0 + w * 0.52, y0 + d, 0.08)
    s.poly([a, b, c, e], hx('door_d', 0.28))
    ar = [a, b]
    # arched top
    s.d.polygon([a, (a[0] + 6 * SS, a[1] - 5 * SS), (b[0] - 6 * SS, b[1] - 5 * SS), b], fill=hx('door_d', 0.28))
    glow = s.P(x0 + w * 0.69, y0 + d, 0.28)
    s.d.ellipse([glow[0] - 8 * SS, glow[1] - 5 * SS, glow[0] + 8 * SS, glow[1] + 5 * SS], fill=hx('winlit'))
    winL(s, y0 + d, x0, w, 0.30, wh=0.22, w=0.18, off=0.13, lit=True)
    banner(s, x0 + w * 0.5, y0 + d, 1.34, zh=0.56, zw=0.26, col='red')
    winR(s, x0 + w, y0, d, 0.36, wh=0.24, w=0.18, off=0.5, lit=True)
    # twin chimneys
    box(s, x0 + 0.18, y0 + 0.18, 0.30, 0.30, 1.30, 0.62, 'stone', 'stone_d', rows=3)
    box(s, x0 + w - 0.52, y0 + 0.18, 0.34, 0.34, 1.30, 0.86, 'stone', 'stone_d', rows=4)
    box(s, x0 + w - 0.58, y0 + 0.12, 0.46, 0.46, 2.16, 0.10, 'stone_d', 'stone_d')
    # anvil + glowing bar out front
    bx, by = x0 + 0.30, y0 + d + 0.36
    box(s, bx, by, 0.28, 0.20, 0, 0.24, 'iron', 'iron')
    s.d.polygon([s.P(bx - 0.05, by + 0.10, 0.24), s.P(bx + 0.33, by + 0.10, 0.24),
                 s.P(bx + 0.33, by + 0.10, 0.33), s.P(bx - 0.05, by + 0.10, 0.33)], fill=hx('iron', 1.15))
    hp = s.P(bx + 0.14, by + 0.10, 0.36)
    s.d.ellipse([hp[0] - 3 * SS, hp[1] - 2 * SS, hp[0] + 3 * SS, hp[1] + 2 * SS], fill=hx('winlit'))


# ═══════════════════════ MEDBAY ═══════════════════════
def medbay_l1(s):  # Medic Tent — canvas tent with red cross
    w, d = 1.9, 1.6
    x0, y0 = (3 - w) / 2, (3 - d) / 2 + 0.1
    # tent body = low box + big hip canopy in plaster(canvas)
    box(s, x0 + 0.12, y0 + 0.12, w - 0.24, d - 0.24, 0, 0.34, 'plaster_d', 'plaster_d')
    ra, rb = hip_roof(s, x0, y0, w, d, 0.30, 0.78, roof='plaster', rlf=0.14, tiles=0, cap='wood_d')
    # canvas seam lines on the +y slope
    for u in (0.25, 0.5, 0.75):
        a = s.P(x0 + w * u, y0 + d + 0.15, 0.30)
        b = s.P(x0 + w * u, y0 + d / 2 + 0.0, 1.02)
        s.line(a, b, (120, 100, 70, 90), max(1, SS))
    # red cross on the +y slope
    cxp = s.P(x0 + w * 0.5, y0 + d * 0.98, 0.62)
    arm = 16 * SS
    s.d.polygon([(cxp[0] - 5 * SS, cxp[1] - arm), (cxp[0] + 5 * SS, cxp[1] - arm),
                 (cxp[0] + 5 * SS, cxp[1] + arm), (cxp[0] - 5 * SS, cxp[1] + arm)], fill=hx('red', 0.95))
    s.d.polygon([(cxp[0] - arm, cxp[1] - 5 * SS), (cxp[0] + arm, cxp[1] - 5 * SS),
                 (cxp[0] + arm, cxp[1] + 5 * SS), (cxp[0] - arm, cxp[1] + 5 * SS)], fill=hx('red', 0.95))
    # red valance band at the eave
    a = s.P(x0, y0 + d + 0.15, 0.30); b = s.P(x0 + w + 0.15, y0 + d + 0.15, 0.30)
    s.line(a, b, hx('red', 0.85), wd=4 * SS)
    # entrance flap shadow
    a = s.P(x0 + w * 0.38, y0 + d + 0.16, 0.30)
    b = s.P(x0 + w * 0.62, y0 + d + 0.16, 0.30)
    c = s.P(x0 + w * 0.62, y0 + d + 0.16, 0.04)
    e = s.P(x0 + w * 0.38, y0 + d + 0.16, 0.04)
    s.poly([a, b, c, e], hx('door_d', 0.55))
    # pegs + bedroll
    for px_ in (x0 - 0.05, x0 + w + 0.05):
        p = s.P(px_, y0 + d + 0.18, 0)
        s.line(p, (p[0], p[1] - 8 * SS), hx('wood_d'), 2 * SS)
    box(s, x0 + w * 0.62, y0 - 0.34, 0.5, 0.22, 0, 0.10, 'plaster_d', 'red')


def medbay_l2(s):  # Infirmary — plaster cottage + teal roof + cross sign + herbs
    w, d = 2.0, 1.65
    x0, y0 = (3 - w) / 2, (3 - d) / 2 + 0.1
    box(s, x0, y0, w, d, 0, 0.68, 'plaster', 'plaster', plaster=True)
    hip_roof(s, x0, y0, w, d, 0.68, 0.58, roof='teal', rlf=0.32, tiles=6)
    doorL(s, y0 + d, x0, w, h=0.48, w=0.28, off=0.36)
    winL(s, y0 + d, x0, w, 0.26, wh=0.24, w=0.20, off=0.72, lit=True)
    winR(s, x0 + w, y0, d, 0.26, wh=0.22, w=0.18, off=0.5, lit=True)
    # hanging cross sign
    sp = s.P(x0 + w * 0.52, y0 + d + 0.02, 0.88)
    s.line(sp, (sp[0], sp[1] - 8 * SS), hx('iron'), 2 * SS)
    sq = (sp[0], sp[1] + 6 * SS)
    s.d.rectangle([sq[0] - 9 * SS, sq[1] - 9 * SS, sq[0] + 9 * SS, sq[1] + 9 * SS], fill=hx('plaster', 0.7))
    s.d.rectangle([sq[0] - 2.5 * SS, sq[1] - 8 * SS, sq[0] + 2.5 * SS, sq[1] + 8 * SS], fill=hx('red'))
    s.d.rectangle([sq[0] - 8 * SS, sq[1] - 2.5 * SS, sq[0] + 8 * SS, sq[1] + 2.5 * SS], fill=hx('red'))
    # herb planters along the front
    for i in range(3):
        bx = x0 + 0.18 + i * 0.62
        box(s, bx, y0 + d + 0.1, 0.4, 0.16, 0, 0.12, 'wood', 'wood_d')
        for k in range(3):
            gp = s.P(bx + 0.08 + k * 0.12, y0 + d + 0.18, 0.14)
            s.d.ellipse([gp[0] - 3 * SS, gp[1] - 6 * SS, gp[0] + 3 * SS, gp[1] + 2 * SS], fill=hx('leaf', 0.9 + k * 0.04))
    # chimney
    box(s, x0 + 0.24, y0 + 0.24, 0.24, 0.24, 1.12, 0.36, 'stone', 'stone_d', rows=2)


def medbay_l3(s):  # Sanatorium — stone base + plaster hall + teal roof + gardens
    w, d = 2.2, 1.8
    x0, y0 = (3 - w) / 2, (3 - d) / 2 + 0.1
    box(s, x0, y0, w, d, 0, 0.30, 'stone', 'stone', rows=2)
    box(s, x0 + 0.04, y0 + 0.04, w - 0.08, d - 0.08, 0.30, 0.52, 'plaster', 'plaster', plaster=True)
    hip_roof(s, x0, y0, w, d, 0.82, 0.60, roof='teal', rlf=0.30, tiles=6, cap='gold_d')
    doorL(s, y0 + d, x0, w, h=0.50, w=0.32, off=0.30)
    winL(s, y0 + d, x0, w, 0.42, wh=0.22, w=0.20, off=0.62, lit=True, base_z=0.30)
    winL(s, y0 + d, x0, w, 0.42, wh=0.22, w=0.20, off=0.86, lit=True, base_z=0.30)
    winR(s, x0 + w, y0, d, 0.42, wh=0.22, w=0.18, off=0.5, base_z=0.30)
    # red cross banner on the wall
    banner(s, x0 + w * 0.5, y0 + d, 1.30, zh=0.52, zw=0.26, col='plaster')
    bp = s.P(x0 + w * 0.5, y0 + d, 1.02)
    s.d.rectangle([bp[0] - 2.5 * SS, bp[1] - 8 * SS, bp[0] + 2.5 * SS, bp[1] + 8 * SS], fill=hx('red'))
    s.d.rectangle([bp[0] - 8 * SS, bp[1] - 2.5 * SS, bp[0] + 8 * SS, bp[1] + 2.5 * SS], fill=hx('red'))
    # side herb garden with stone rim
    box(s, x0 + 0.14, y0 + d + 0.12, 1.0, 0.3, 0, 0.10, 'stone_l', 'stone')
    for k in range(5):
        gp = s.P(x0 + 0.24 + k * 0.2, y0 + d + 0.24, 0.12)
        s.d.ellipse([gp[0] - 3 * SS, gp[1] - 7 * SS, gp[0] + 3 * SS, gp[1] + 1 * SS],
                    fill=hx('leaf' if k % 2 else 'leaf_d', 0.95))
    # chimney + mortar&pestle pot
    box(s, x0 + w - 0.5, y0 + 0.2, 0.26, 0.26, 1.30, 0.40, 'stone', 'stone_d', rows=2)
    cylinder(s, x0 + w + 0.2, y0 + d - 0.06, 0.12, 0, 0.18, 'stone_d', nrows=2)


if __name__ == '__main__':
    bake('base_house_l1', 3, 3, 70, 150, house_l1, zoom=1.30)
    bake('base_house_l2', 3, 3, 70, 170, house_l2, zoom=1.26)
    bake('base_house_l3', 3, 3, 70, 210, house_l3, zoom=1.22)
    bake('base_smithy_l1', 3, 3, 70, 190, smithy_l1, zoom=1.28)
    bake('base_smithy_l2', 3, 3, 70, 190, smithy_l2, zoom=1.26)
    bake('base_smithy_l3', 3, 3, 70, 240, smithy_l3, zoom=1.22)
    bake('base_medbay_l1', 3, 3, 70, 170, medbay_l1, zoom=1.30)
    bake('base_medbay_l2', 3, 3, 70, 170, medbay_l2, zoom=1.26)
    bake('base_medbay_l3', 3, 3, 70, 190, medbay_l3, zoom=1.22)
    print('base41a done')
