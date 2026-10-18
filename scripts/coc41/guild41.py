#!/usr/bin/env python3
# guild41 — castle l1-5 / cottages a-d / training l1-5 / treasury l1-5 / WALL SET
import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
from iso41 import *
from base41a import crop_anchor, bake
from base41b import rock_blob, crystal, bake_rock

OUT = '/home/z/my-project/work/asset41/out'


def round_tower(s, cx, cy, r, h, base='castle', roof=None, roof_h=0.5, roof_col='red',
                door=False, win=False, nrows=0, finial=True, banner_z=None):
    bx, by, tx_, ty_, a, b = cylinder(s, cx, cy, r, 0, h, base, nrows=nrows or max(4, int(h / 0.2)))
    if win:
        winR(s, cx + r * 0.86, cy - r * 0.55, r * 1.1, h * 0.55, wh=0.20, w=0.13, off=0.5, lit=True)
        winL(s, cy + r * 0.86, cx - r * 0.55, r * 1.1, h * 0.38, wh=0.16, w=0.12, off=0.5, lit=True)
    if door:
        doorL(s, cy + r * 0.88, cx - 0.13, 0.3, h=0.40, w=0.22, off=0.5)
    top_z = h
    if roof:
        cone_roof(s, cx, cy, r * 1.22, h, roof_h, roof=roof_col, tiles=5)
        top_z = h + roof_h
        if finial:
            fp = s.P(cx, cy, top_z + 0.05)
            s.d.ellipse([fp[0] - 2.4 * SS, fp[1] - 2.4 * SS, fp[0] + 2.4 * SS, fp[1] + 2.4 * SS], fill=hx('gold'))
            s.d.ellipse([fp[0] - SS, fp[1] - 3.4 * SS, fp[0] + SS, fp[1] - 0.4 * SS], fill=hx('gold_d'))
    else:
        crenel_ring(s, cx, cy, r, h, base=base, mh=0.14, n=max(6, int(r * 22)))
        # machicolation band
        s.d.arc([bx - a * 1.07, s.P(cx, cy, h - 0.10)[1] - b * 1.07,
                 bx + a * 1.07, s.P(cx, cy, h - 0.10)[1] + b * 1.07], 0, 180, fill=hx('stone_d', 0.9), width=2 * SS)
    return top_z


# ═══════════════════════ CASTLE ═══════════════════════
def castle_l1(s):  # Outpost Keep — round tower + wooden gate + wall nook
    round_tower(s, 1.7, 1.5, 0.62, 1.30, win=True, door=True)
    banner(s, 1.95, 1.5, 1.62, zh=0.42, zw=0.20, col='red')
    # courtyard walls hugging the tower (L nook) + wooden gate in the wall run
    wall_seg2(s, 0.55, 2.62, 1.7, 'x', h=0.46)
    wall_seg2(s, 0.55, 2.38, 0.5, 'y', h=0.46)
    for px_ in (2.25, 2.69):
        box(s, px_, 2.52, 0.13, 0.13, 0, 0.66, 'wood_d', 'wood_d')
    box(s, 2.19, 2.48, 0.92, 0.20, 0.66, 0.12, 'wood', 'wood_d')


def castle_l2(s):  # Bailey Fort — crenellated keep + corner tower
    wall_seg2(s, 0.4, 3.0, 1.0, 'x', h=0.42)
    box(s, 1.15, 1.35, 1.75, 1.5, 0, 0.88, 'castle', 'castle', rows=5)
    crenel_x(s, 1.15, 1.35, 1.75, 1.5, 0.88, mh=0.16, n=4)
    crenel_y(s, 1.15, 1.35, 1.5, 1.75, 0.88, mh=0.16, n=3)
    doorL(s, 2.85, 1.15, 1.75, h=0.5, w=0.32, off=0.45)
    winL(s, 2.85, 1.15, 1.75, 0.52, wh=0.2, w=0.16, off=0.75, lit=True)
    winR(s, 2.9, 1.35, 1.5, 0.52, wh=0.2, w=0.16, off=0.4, lit=True)
    round_tower(s, 3.05, 1.55, 0.40, 1.28, win=True)
    banner(s, 1.7, 2.85, 1.55, zh=0.44, zw=0.22, col='red')


def castle_l3(s):  # Stone Castle — keep + twin front towers + gate wall
    wall_seg2(s, 0.3, 3.1, 0.9, 'x', h=0.44)
    # gate wall between the front towers
    box(s, 1.35, 2.55, 1.5, 0.55, 0, 0.55, 'castle', 'castle', rows=3)
    crenel_x(s, 1.35, 2.55, 1.5, 0.55, 0.55, mh=0.14, n=3)
    doorL(s, 3.1, 1.35, 1.5, h=0.52, w=0.34, off=0.5, colr='door_d')
    # twin front towers
    round_tower(s, 1.35, 2.55, 0.36, 1.30, win=True)
    round_tower(s, 2.85, 2.55, 0.36, 1.30, win=True)
    # keep
    box(s, 1.15, 1.0, 1.9, 1.5, 0, 0.95, 'castle', 'castle', rows=5)
    hip_roof(s, 1.15, 1.0, 1.9, 1.5, 0.95, 0.62, roof='red', rlf=0.3, tiles=6)
    winL(s, 2.5, 1.15, 1.9, 0.5, wh=0.22, w=0.18, off=0.3, lit=True)
    winL(s, 2.5, 1.15, 1.9, 0.5, wh=0.22, w=0.18, off=0.75, lit=True)
    winR(s, 3.05, 1.0, 1.5, 0.5, wh=0.22, w=0.16, off=0.5, lit=True)
    banner(s, 2.1, 2.5, 1.9, zh=0.46, zw=0.22, col='red')


def castle_l4(s):  # Grand Castle — tall keep + 4 turrets + gatehouse
    # corner turrets (back pair first)
    round_tower(s, 1.05, 1.15, 0.30, 1.20, roof='red', roof_h=0.42)
    round_tower(s, 3.0, 1.15, 0.30, 1.20, roof='red', roof_h=0.42)
    # keep
    box(s, 1.3, 1.3, 1.55, 1.35, 0, 1.30, 'castle', 'castle', rows=6)
    crenel_x(s, 1.3, 1.3, 1.55, 1.35, 1.30, mh=0.15, n=3)
    crenel_y(s, 1.3, 1.3, 1.35, 1.55, 1.30, mh=0.15, n=3)
    winL(s, 2.65, 1.3, 1.55, 0.5, wh=0.22, w=0.16, off=0.32, lit=True)
    winL(s, 2.65, 1.3, 1.55, 0.5, wh=0.22, w=0.16, off=0.72, lit=True)
    winL(s, 2.65, 1.3, 1.55, 0.92, wh=0.20, w=0.15, off=0.5, lit=True)
    winR(s, 2.85, 1.3, 1.35, 0.5, wh=0.2, w=0.15, off=0.5, lit=True)
    # gold string course
    a = s.P(1.3, 2.65, 1.14); b = s.P(2.85, 2.65, 1.14)
    s.line(a, b, hx('gold_d', 0.95), 2 * SS)
    # front gatehouse: 2 towers + arch wall
    round_tower(s, 1.15, 2.85, 0.34, 1.35, win=True, door=False)
    round_tower(s, 2.95, 2.85, 0.34, 1.35, win=True)
    box(s, 1.35, 2.7, 1.4, 0.5, 0, 0.62, 'castle', 'castle', rows=3)
    crenel_x(s, 1.35, 2.7, 1.4, 0.5, 0.62, mh=0.14, n=3)
    doorL(s, 3.2, 1.35, 1.4, h=0.55, w=0.36, off=0.5, colr='door_d')
    # gold portcullis hints
    for k in range(3):
        u = 1.85 + 0.4 * k / 2
        p = s.P(u, 3.2, 0.48); q = s.P(u, 3.2, 0.03)
        s.line(p, q, hx('gold_d', 0.9), max(1, SS))
    banner(s, 2.07, 3.2, 2.0, zh=0.5, zw=0.24, col='red')
    banner(s, 2.95 + 0.34, 2.85, 1.9, zh=0.4, zw=0.2, col='red')


def castle_l5(s):  # Royal Citadel — grand spire + turrets + gate + gold
    round_tower(s, 0.95, 1.3, 0.30, 1.35, roof='red', roof_h=0.45)
    round_tower(s, 3.1, 1.3, 0.30, 1.35, roof='red', roof_h=0.45)
    round_tower(s, 0.95, 3.0, 0.30, 1.45, roof='teal', roof_h=0.45)
    round_tower(s, 3.1, 3.0, 0.30, 1.45, roof='teal', roof_h=0.45)
    # main spire on a square base
    box(s, 1.35, 1.55, 1.6, 1.5, 0, 1.35, 'castle', 'castle', rows=6)
    a = s.P(1.35, 3.05, 1.20); b = s.P(2.95, 3.05, 1.20)
    s.line(a, b, hx('gold_d', 0.95), 2 * SS)
    a = s.P(2.95, 1.55, 1.20); b = s.P(2.95, 3.05, 1.20)
    s.line(a, b, hx('gold_d', 0.8), 2 * SS)
    winL(s, 3.05, 1.35, 1.6, 0.45, wh=0.22, w=0.17, off=0.3, lit=True)
    winL(s, 3.05, 1.35, 1.6, 0.45, wh=0.22, w=0.17, off=0.74, lit=True)
    winL(s, 3.05, 1.35, 1.6, 0.95, wh=0.2, w=0.15, off=0.5, lit=True)
    winR(s, 2.95, 1.55, 1.5, 0.45, wh=0.2, w=0.15, off=0.5, lit=True)
    # great cone spire + gold finial + weathervane crystal
    apex = cone_roof(s, 2.15, 2.3, 0.95, 1.35, 1.05, roof='red', tiles=0)
    fp = s.P(2.15, 2.3, 2.44)
    s.d.ellipse([fp[0] - 3 * SS, fp[1] - 3 * SS, fp[0] + 3 * SS, fp[1] + 3 * SS], fill=hx('gold'))
    crystal(s, 2.15, 2.3, 2.50, 0.26, 0.06, 'teal')
    # gatehouse with twin gold-capped towers
    round_tower(s, 1.1, 2.9, 0.36, 1.5, win=True)
    round_tower(s, 3.2, 2.9, 0.36, 1.5, win=True)
    box(s, 1.3, 2.75, 1.7, 0.55, 0, 0.68, 'castle', 'castle', rows=3)
    crenel_x(s, 1.3, 2.75, 1.7, 0.55, 0.68, mh=0.15, n=4)
    doorL(s, 3.3, 1.3, 1.7, h=0.6, w=0.4, off=0.5, colr='door_d')
    for k in range(4):
        u = 1.85 + 0.55 * k / 3
        p = s.P(u, 3.3, 0.52); q = s.P(u, 3.3, 0.03)
        s.line(p, q, hx('gold_d', 0.9), max(1, SS))
    banner(s, 2.15, 3.3, 2.15, zh=0.52, zw=0.26, col='red')
    banner(s, 0.95, 3.0 + 0.3, 2.05, zh=0.4, zw=0.2, col='teal')
    banner(s, 3.1, 3.0 + 0.3, 2.05, zh=0.4, zw=0.2, col='teal')


def wall_seg2(s, x0, y0, ln, axis, h=0.5, th=0.24, base='castle'):
    """short decorative wall run (courtyard nooks on low castle levels)"""
    w, d = (ln, th) if axis == 'x' else (th, ln)
    box(s, x0, y0, w, d, 0, h * 0.78, base, base, rows=2)
    if axis == 'x':
        crenel_x(s, x0, y0, ln, th, h * 0.78, mh=h * 0.22, n=max(2, round(ln / 0.45)))
    else:
        crenel_y(s, x0, y0, ln, th, h * 0.78, mh=h * 0.22, n=max(2, round(ln / 0.45)))


CASTLES = dict(l1=castle_l1, l2=castle_l2, l3=castle_l3, l4=castle_l4, l5=castle_l5)


# ═══════════════════════ COTTAGES (1.35 plot) ═══════════════════════
def cottage(s, w, d, wall, roof, axis='x', hip=False, chm=True, shutters=None):
    x0, y0 = (1.35 - w) / 2, (1.35 - d) / 2 + 0.08
    box(s, x0, y0, w, d, 0, 0.52, wall, wall, rows=2 if wall == 'stone' else 0,
        plaster=(wall == 'plaster'), planked=(wall == 'wood'))
    if hip:
        hip_roof(s, x0, y0, w, d, 0.52, 0.42, roof=roof, rlf=0.3, tiles=5)
    else:
        gable_roof(s, x0, y0, w, d, 0.52, 0.46, axis=axis, roof=roof, over=0.13, tiles=6)
    doorL(s, y0 + d, x0, w, h=0.38, w=0.24, off=0.34)
    winL(s, y0 + d, x0, w, 0.24, wh=0.18, w=0.16, off=0.74, lit=True)
    if chm:
        box(s, x0 + w - 0.30, y0 + 0.16, 0.18, 0.18, 0.80, 0.28, 'stone', 'stone_d', rows=2)


def cottage_a(s):  # terracotta timber cottage
    cottage(s, 1.0, 0.85, 'plaster', 'terra')


def cottage_b(s):  # straw-roofed stone cot
    cottage(s, 0.95, 0.85, 'stone', 'straw', hip=True)


def cottage_c(s):  # teal plaster cottage
    cottage(s, 1.0, 0.82, 'plaster', 'teal', axis='y')


def cottage_d(s):  # slate woodcutter's lodge
    cottage(s, 1.02, 0.85, 'wood', 'slate')


# ═══════════════════════ TRAINING (3x3) ═══════════════════════
def sand_pad(s, x0, y0, w, d):
    pts = [s.P(x0, y0, 0.02), s.P(x0 + w, y0, 0.02), s.P(x0 + w, y0 + d, 0.02), s.P(x0, y0 + d, 0.02)]
    s.poly(pts, hx('sand', 0.9))
    inner = [s.P(x0 + 0.08, y0 + 0.08, 0.02), s.P(x0 + w - 0.08, y0 + 0.08, 0.02),
             s.P(x0 + w - 0.08, y0 + d - 0.08, 0.02), s.P(x0 + 0.08, y0 + d - 0.08, 0.02)]
    s.poly(inner, hx('sand', 1.0))


def dummy(s, x, y):
    box(s, x - 0.09, y - 0.07, 0.18, 0.14, 0, 0.16, 'stone_l', 'stone')
    box(s, x - 0.06, y - 0.06, 0.12, 0.12, 0.16, 0.44, 'wood_d', 'wood_d')
    box(s, x - 0.30, y - 0.06, 0.60, 0.10, 0.42, 0.07, 'wood', 'wood_d')
    hp = s.P(x, y, 0.70)
    s.d.ellipse([hp[0] - 5.5 * SS, hp[1] - 5 * SS, hp[0] + 5.5 * SS, hp[1] + 5 * SS], fill=hx('straw', 0.98))
    s.line(s.P(x, y, 0.34), s.P(x + 0.2, y + 0.2, 0.34), hx('wood'), 3 * SS)


def rack(s, x, y, axis='x'):
    for k in (-0.2, 0.2):
        if axis == 'x':
            box(s, x + k - 0.03, y - 0.03, 0.06, 0.06, 0, 0.4, 'wood_d', 'wood_d')
        else:
            box(s, x - 0.03, y + k - 0.03, 0.06, 0.06, 0, 0.4, 'wood_d', 'wood_d')
    if axis == 'x':
        box(s, x - 0.28, y - 0.04, 0.56, 0.08, 0.40, 0.05, 'wood', 'wood_d')
        for k in (-0.12, 0.0, 0.12):  # swords
            s.line(s.P(x + k, y, 0.44), s.P(x + k, y, 0.72), hx('iron', 1.05), SS)
            gp = s.P(x + k, y, 0.42)
            s.d.ellipse([gp[0] - 1.5 * SS, gp[1] - 1.5 * SS, gp[0] + 1.5 * SS, gp[1] + 1.5 * SS], fill=hx('gold'))
    else:
        box(s, x - 0.04, y - 0.28, 0.08, 0.56, 0.40, 0.05, 'wood', 'wood_d')


def training_l1(s):  # Dust Yard
    sand_pad(s, 0.45, 0.6, 2.1, 1.8)
    dummy(s, 1.2, 1.3)
    rack(s, 2.15, 1.7)
    # corner water barrel
    cylinder(s, 0.75, 2.0, 0.14, 0.02, 0.22, 'wood', nrows=2)


def training_l2(s):  # Spar Ring — post-and-rail ring
    sand_pad(s, 0.6, 0.75, 1.8, 1.5)
    posts = [(0.7, 1.5), (0.7, 2.05), (1.3, 2.3), (1.9, 2.3), (2.35, 2.05), (2.35, 1.5), (1.9, 0.85), (1.3, 0.85)]
    for i, (px, py) in enumerate(posts):
        box(s, px - 0.04, py - 0.04, 0.08, 0.08, 0.02, 0.34, 'wood_d', 'wood_d')
        nx, ny = posts[(i + 1) % len(posts)]
        s.line(s.P(px, py, 0.30), s.P(nx, ny, 0.30), hx('wood', 0.85), 2 * SS)
    dummy(s, 1.5, 1.55)
    rack(s, 2.5, 1.5, axis='y')


def training_l3(s):  # Warrior's Ring — fenced arena + banner poles
    training_l2(s)
    for px, py in ((0.62, 0.85), (2.45, 2.25)):
        s.line(s.P(px, py, 0.02), s.P(px, py, 1.05), hx('wood_d'), 2 * SS)
        fp = s.P(px, py, 1.05)
        s.d.polygon([(fp[0], fp[1]), (fp[0] + 16 * SS, fp[1] + 3 * SS), (fp[0], fp[1] + 9 * SS)], fill=hx('red', 0.9))


def training_l4(s):  # War College — barracks + racks + flag
    sand_pad(s, 0.4, 1.9, 2.2, 0.9)
    box(s, 0.55, 0.75, 2.0, 1.15, 0, 0.62, 'plaster', 'plaster', plaster=True)
    gable_roof(s, 0.55, 0.75, 2.0, 1.15, 0.62, 0.5, axis='x', roof='red', over=0.13, tiles=6)
    doorL(s, 1.9, 0.55, 2.0, h=0.4, w=0.26, off=0.5)
    winL(s, 1.9, 0.55, 2.0, 0.26, wh=0.18, w=0.15, off=0.24, lit=True)
    winL(s, 1.9, 0.55, 2.0, 0.26, wh=0.18, w=0.15, off=0.76, lit=True)
    dummy(s, 0.95, 2.3)
    rack(s, 2.6, 2.35)
    fp = s.P(2.75, 0.95, 0)
    s.line(fp, s.P(2.75, 0.95, 1.15), hx('wood_d'), 2 * SS)
    tp = s.P(2.75, 0.95, 1.15)
    s.d.polygon([(tp[0], tp[1]), (tp[0] - 18 * SS, tp[1] + 4 * SS), (tp[0], tp[1] + 10 * SS)], fill=hx('red', 0.92))


def training_l5(s):  # Legend's Arena — stone ring + banners + statue
    sand_pad(s, 0.5, 0.65, 2.0, 1.7)
    # stone arena wall ring (two visible runs: back-left and front-right)
    wall_seg2(s, 0.55, 0.62, 1.9, 'x', h=0.5)
    wall_seg2(s, 0.5, 0.85, 1.75, 'y', h=0.5)
    wall_seg2(s, 2.42, 0.9, 1.55, 'y', h=0.5)
    wall_seg2(s, 0.6, 2.25, 1.85, 'x', h=0.5)
    # gate gap on the front-right run
    dummy(s, 1.5, 1.5)
    for px, py in ((0.7, 2.42), (2.35, 0.72)):
        s.line(s.P(px, py, 0.02), s.P(px, py, 1.25), hx('wood_d'), 2 * SS)
        fp = s.P(px, py, 1.25)
        s.d.polygon([(fp[0], fp[1]), (fp[0] + 17 * SS, fp[1] + 3.5 * SS), (fp[0], fp[1] + 10 * SS)], fill=hx('red', 0.92))
        s.d.polygon([(fp[0], fp[1]), (fp[0] - 17 * SS, fp[1] + 3.5 * SS), (fp[0], fp[1] + 10 * SS)], fill=hx('red', 0.75))
    # hero statue on a plinth
    box(s, 2.6, 2.35, 0.4, 0.4, 0, 0.18, 'stone_l', 'stone')
    sp = s.P(2.8, 2.55, 0.18)
    s.line(sp, (sp[0], sp[1] - 30 * SS), hx('stone_l', 0.95), 6 * SS)
    s.d.ellipse([sp[0] - 5 * SS, sp[1] - 40 * SS, sp[0] + 5 * SS, sp[1] - 30 * SS], fill=hx('stone_l', 0.9))
    s.line((sp[0] - 9 * SS, sp[1] - 22 * SS), (sp[0] + 3 * SS, sp[1] - 34 * SS), hx('iron', 1.05), 2 * SS)


TRAININGS = dict(l1=training_l1, l2=training_l2, l3=training_l3, l4=training_l4, l5=training_l5)


# ═══════════════════════ TREASURY (2x2) ═══════════════════════
def coin_stack(s, x, y, n=3):
    for k in range(n):
        p = s.P(x, y, 0.02 + k * 0.05)
        s.d.ellipse([p[0] - 4 * SS, p[1] - 2 * SS, p[0] + 4 * SS, p[1] + 2 * SS],
                    fill=hx('gold', 0.95 - k * 0.06))


def chest(s, x, y, w=0.62, d=0.40, h=0.30):
    box(s, x, y, w, d, 0.06, h, 'wood', 'gold_d', planked=True)
    # domed lid
    lp = [(s.P(x, y + d / 2, 0.06 + h)), (s.P(x + w, y + d / 2, 0.06 + h)),
          (s.P(x + w * 0.8, y + d / 2, 0.06 + h + 0.14)), (s.P(x + w * 0.2, y + d / 2, 0.06 + h + 0.14))]
    s.poly(lp, hx('wood_d', 0.95))
    # gold bands + lock
    for u in (0.25, 0.75):
        s.line(s.P(x + w * u, y + d, 0.06), s.P(x + w * u, y + d, 0.06 + h), hx('gold'), 2 * SS)
    kp = s.P(x + w / 2, y + d, 0.06 + h * 0.5)
    s.d.rectangle([kp[0] - 2 * SS, kp[1] - 3 * SS, kp[0] + 2 * SS, kp[1] + 3 * SS], fill=hx('gold'))
    box(s, x - 0.05, y - 0.05, w + 0.1, d + 0.1, 0, 0.06, 'stone_l', 'stone')


def treasury_l1(s):  # Coin Chest
    box(s, 0.55, 0.75, 0.9, 0.7, 0, 0.08, 'stone_l', 'stone')
    chest(s, 0.7, 0.85)
    coin_stack(s, 1.45, 1.3, 3)
    coin_stack(s, 0.55, 1.5, 2)


def treasury_l2(s):  # Vault Hut
    box(s, 0.6, 0.8, 0.95, 0.8, 0, 0.55, 'stone', 'stone', rows=3)
    gable_roof(s, 0.6, 0.8, 0.95, 0.8, 0.55, 0.35, axis='x', roof='slate', over=0.1, tiles=4)
    doorL(s, 1.6, 0.6, 0.95, h=0.4, w=0.26, off=0.5, colr='gold_d')
    coin_stack(s, 0.5, 1.75, 2)


def treasury_l3(s):  # Strongroom
    box(s, 0.5, 0.7, 1.1, 0.9, 0, 0.7, 'stone', 'stone', rows=4)
    hip_roof(s, 0.5, 0.7, 1.1, 0.9, 0.7, 0.4, roof='slate', rlf=0.3, tiles=4)
    doorL(s, 1.6, 0.5, 1.1, h=0.46, w=0.3, off=0.4, colr='gold_d')
    # barred gold window
    winL(s, 1.6, 0.5, 1.1, 0.34, wh=0.2, w=0.22, off=0.78, lit=True)
    a = s.P(1.32, 1.6, 0.34); b = s.P(1.32, 1.6, 0.54)
    s.line(a, b, hx('gold_d'), SS)
    coin_stack(s, 0.35, 1.75, 3)
    coin_stack(s, 1.7, 0.6, 2)


def treasury_l4(s):  # Gold Vault — gold dome + columns
    box(s, 0.45, 0.7, 1.2, 0.95, 0, 0.72, 'castle', 'castle', rows=4)
    # gold dome
    cone_roof(s, 1.05, 1.17, 0.72, 0.72, 0.5, roof='gold', tiles=0)
    doorL(s, 1.65, 0.45, 1.2, h=0.5, w=0.32, off=0.5, colr='gold_d')
    for cx_ in (0.6, 1.5):  # front columns
        cylinder(s, cx_, 1.72, 0.07, 0, 0.42, 'stone_l', band=False)
    coin_stack(s, 0.3, 1.85, 3)
    crystal(s, 1.05, 1.17, 1.26, 0.2, 0.05, 'gold')


def treasury_l5(s):  # Royal Treasury
    box(s, 0.4, 0.65, 1.35, 1.05, 0, 0.85, 'castle', 'castle', rows=5)
    cone_roof(s, 1.07, 1.17, 0.82, 0.85, 0.55, roof='gold', tiles=0)
    fp = s.P(1.07, 1.17, 1.44)
    s.d.ellipse([fp[0] - 2.5 * SS, fp[1] - 2.5 * SS, fp[0] + 2.5 * SS, fp[1] + 2.5 * SS], fill=hx('gold'))
    crystal(s, 1.07, 1.17, 1.5, 0.24, 0.055, 'gold')
    doorL(s, 1.7, 0.4, 1.35, h=0.56, w=0.36, off=0.5, colr='gold_d')
    for cx_ in (0.55, 1.62):
        cylinder(s, cx_, 1.78, 0.08, 0, 0.52, 'stone_l', band=False)
        cp = s.P(cx_, 1.78, 0.56)
        s.d.ellipse([cp[0] - 2.5 * SS, cp[1] - 1.2 * SS, cp[0] + 2.5 * SS, cp[1] + 1.2 * SS], fill=hx('gold_d'))
    coin_stack(s, 0.28, 1.95, 4)
    coin_stack(s, 1.9, 0.62, 3)
    crystal(s, 1.9, 1.6, 0.02, 0.18, 0.05, 'teal')
    banner(s, 1.07, 1.7, 1.32, zh=0.4, zw=0.2, col='red')


TREASURYS = dict(l1=treasury_l1, l2=treasury_l2, l3=treasury_l3, l4=treasury_l4, l5=treasury_l5)


# ═══════════════════════ WALL SET (guild perimeter) ═════════════════
def _wall_seg_common(s, ln, th, h, base='castle'):
    box(s, 0, -th / 2, ln, th, 0, h, base, base, rows=2)
    crenel_x(s, 0, -th / 2, ln, th, h, mh=0.16, n=max(2, round(ln / 0.5)))


def wall_a(s):
    """wall segment along world x (north/south edges) — anchor = segment centre
    at the cell line, 1 tile long so runs tile seamlessly"""
    _wall_seg_common(s, 1.0, 0.34, 0.82)


def wall_b(s):
    """mirror for west/east edges (along world y)"""
    th = 0.34
    pr2, pl2 = box(s, -th / 2, 0, th, 1.0, 0, 0.82, 'castle', 'castle', rows=3)
    s.courses(pr2, rows=3, alpha=64)
    s.courses(pl2, rows=4, alpha=64)
    crenel_y(s, -th / 2, 0, 1.0, th, 0.82, mh=0.16, n=2)


def wall_tower(s):
    """corner tower — anchor = cell centre"""
    round_tower(s, 0, 0, 0.50, 1.28, win=False)
    # grounded plinth skirt (no hover ring)
    box(s, -0.38, -0.38, 0.76, 0.76, 0, 0.08, 'stone_d', 'stone')


def wall_gate(s):
    """gatehouse spanning the 2 west-gate cells (along y) — anchor = midpoint"""
    # twin towers
    round_tower(s, 0, -0.55, 0.44, 1.45, win=True)
    round_tower(s, 0, 0.55, 0.44, 1.45, win=True)
    # arch wall between them along y
    th = 0.5
    box(s, -th / 2, -0.5, th, 1.0, 0, 0.95, 'castle', 'castle', rows=3)
    crenel_y(s, -th / 2, -0.5, 1.0, th, 0.95, mh=0.16, n=3)
    # arch opening on the +x face (faces the avenue, down-right)
    a = s.P(th / 2, -0.16, 0.70)
    b = s.P(th / 2, 0.16, 0.70)
    c = s.P(th / 2, 0.16, 0)
    d = s.P(th / 2, -0.16, 0)
    s.poly([a, b, c, d], hx('door_d', 0.28))
    s.d.polygon([a, (a[0] + 3 * SS, a[1] - 5 * SS), (b[0] + 3 * SS, b[1] - 5 * SS), b], fill=hx('door_d', 0.28))
    for k in range(3):
        v = -0.10 + 0.10 * k
        p = s.P(th / 2, v, 0.62); q = s.P(th / 2, v, 0.02)
        s.line(p, q, hx('gold_d', 0.9), SS)
    # guild pennants
    for ty in (-0.55, 0.55):
        fp = s.P(0, ty, 1.45 + 0.52 + 0.1)
        s.d.polygon([(fp[0], fp[1]), (fp[0] + 13 * SS, fp[1] + 3 * SS), (fp[0], fp[1] + 8 * SS)], fill=hx('red', 0.9))


def bake_w(name, fw, fh, mW, mH, draw, zoom=1.0, anchor_world=None):
    """bake with anchor at an arbitrary world point (walls anchor mid-cell)"""
    W = (fw) * 32 * zoom + 2 * mW
    H = mH + fh * 16 * zoom + 12
    ax_w, ay_w = anchor_world or (fw / 2, fh / 2)
    ox = W / 2 - (ax_w - ay_w) * 32 * zoom
    oy = H - 12 - (ax_w + ay_w) * 16 * zoom
    s = Spr(W, H, ox, oy, zoom=zoom)
    draw(s)
    im = finish(s, '/tmp/_w.png')
    ax, ay = ox + (ax_w - ay_w) * 32 * zoom, oy + (ax_w + ay_w) * 16 * zoom
    im2 = crop_anchor(im, ax, ay)
    im2.save(f'{OUT}/{name}.png')
    print(f'{name}.png {im2.size[0]}x{im2.size[1]}')


if __name__ == '__main__':
    CZOOM = dict(l1=1.15, l2=1.2, l3=1.25, l4=1.35, l5=1.5)
    for lv, fn in CASTLES.items():
        bake(f'gb_castle_{lv}', 4, 4, 70, int(300 * CZOOM[lv]) + 60, fn, zoom=CZOOM[lv])
    for nm, fn in dict(a=cottage_a, b=cottage_b, c=cottage_c, d=cottage_d).items():
        bake(f'gb_cottage_{nm}', 1.35, 1.35, 30, 120, fn, zoom=1.42)
    for lv, fn in TRAININGS.items():
        bake(f'gb_training_{lv}', 3, 3, 60, 230 if lv == 'l5' else 180, fn, zoom=1.14)
    for lv, fn in TREASURYS.items():
        bake(f'gb_treasury_{lv}', 2, 2, 46, 190, fn, zoom=1.24)
    # wall set — anchor mid-segment (0.5,0) for a/b, cell centre for tower
    bake_w('gb_wall_a', 1.4, 0.6, 26, 70, wall_a, zoom=1.0, anchor_world=(0.5, 0))
    bake_w('gb_wall_b', 0.6, 1.4, 26, 70, wall_b, zoom=1.0, anchor_world=(0, 0.5))
    bake_w('gb_wall_tower', 1.2, 1.2, 34, 130, wall_tower, zoom=1.0, anchor_world=(0, 0))
    bake_w('gb_wall_gate', 1.6, 2.2, 40, 170, wall_gate, zoom=1.0, anchor_world=(0, 0))
    print('guild41 done')
