#!/usr/bin/env python3
# base41b — alchemy / mines / hunting gate / rocks & mountains (warm stone law)
import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
from iso41 import *
from base41a import crop_anchor, bake

OUT = '/home/z/my-project/work/asset41/out'


def rock_blob(s, cx, cy, r, h, seedpts=None, base='rock', snow=0.0, mossy=False, peak=0.0):
    """boulder/mountain — wobbled strip dome with FLAT ground contact.
    peak=0 -> round boulder profile; peak=1 -> ridged mountain profile.
    Snow = altitude line (only high strips), never a wig."""
    a_, b_ = r * s.HW, r * s.HH
    H = h * s.ZS
    bx, by = s.P(cx, cy, 0)
    steps = 30
    p = 2.0 - peak * 0.65          # profile exponent
    def prof(u):
        return max(0.0, 1 - abs(u) ** p) ** (0.5 + peak * 0.28)
    strips = []
    for i in range(steps):
        u0 = -1 + 2 * i / steps
        u1 = -1 + 2 * (i + 1) / steps
        um = (u0 + u1) / 2
        th = (um + 1) * math.pi
        wob = 1 + (0.09 if not peak else 0.13) * math.sin(3 * th + 1.7) + 0.05 * math.sin(7 * th + 0.4)
        sh = 0.60 + 0.34 * (1 - (um * 0.5 + 0.5)) ** 1.1
        fu = math.sqrt(max(0.0, 1 - um * um))
        sh += fu ** 2 * 0.26
        wob0 = 1 + (0.09 if not peak else 0.13) * math.sin(3 * ((u0 + 1) * math.pi) + 1.7) + 0.05 * math.sin(7 * ((u0 + 1) * math.pi) + 0.4)
        wob1 = 1 + (0.09 if not peak else 0.13) * math.sin(3 * ((u1 + 1) * math.pi) + 1.7) + 0.05 * math.sin(7 * ((u1 + 1) * math.pi) + 0.4)
        x0, x1 = bx + u0 * a_ * wob0, bx + u1 * a_ * wob1
        yb0 = by - b_ * 0.12 * f0_ if (f0_ := math.sqrt(max(0.0, 1 - u0 * u0))) else by
        yb1 = by - b_ * 0.12 * f1_ if (f1_ := math.sqrt(max(0.0, 1 - u1 * u1))) else by
        h0 = H * prof(u0) * wob0
        h1 = H * prof(u1) * wob1
        yt0, yt1 = yb0 - h0, yb1 - h1
        s.poly([(x0, yb0), (x1, yb1), (x1, yt1), (x0, yt0)], hx(base, min(1.04, sh)))
        strips.append((x0, x1, yb0, yb1, yt0, yt1, sh))
    if snow > 0:
        # altitude snowline: everything above (1-snow*0.30) of the peak is white
        thl = math.sin(3 * 1.7)
        line_y = by - H * (0.66 + snow * 0.16)
        for (x0, x1, yb0, yb1, yt0, yt1, sh) in strips:
            if yt0 >= line_y and yt1 >= line_y:
                continue
            wob0s = 3 * SS * math.sin(3 * (( -1 + 2 * 0 ) + 1) * math.pi + 0.9)
            line0 = line_y + 3 * SS * math.sin(0.9)
            line1 = line_y + 3 * SS * math.sin(2.3)
            ys0 = max(yt0, line0)
            ys1 = max(yt1, line1)
            if ys0 >= yb0 and ys1 >= yb1:
                continue
            ssh = min(1.04, sh + 0.34)
            s.poly([(x0, ys0), (x1, ys1), (x1, min(yt1, ys1)), (x0, min(yt0, ys0))], hx('snow', ssh))
    if mossy:
        mp = (bx - a_ * 0.30, by - 1 * SS)
        s.d.ellipse([mp[0] - 3 * SS, mp[1] - 1.5 * SS, mp[0] + 1 * SS, mp[1] + 1.5 * SS], fill=hx('leaf_d', 0.5))
        mp2 = (bx + a_ * 0.26, by - 1 * SS)
        s.d.ellipse([mp2[0] - 1 * SS, mp2[1] - 1.5 * SS, mp2[0] + 3 * SS, mp2[1] + 1 * SS], fill=hx('leaf', 0.4))


def crystal(s, x, y, z, hgt, wdt, col='teal'):
    """gem: two visible faces of a vertical crystal"""
    a = s.P(x, y, z + hgt)
    b = s.P(x - wdt, y, z + hgt * 0.35)
    c = s.P(x + wdt, y, z + hgt * 0.3)
    d = s.P(x, y, z)
    s.poly([a, b, d], hx(col, 0.9))
    s.poly([a, c, d], hx(col, 1.12))
    s.line(a, d, hx(col, 1.25), max(1, SS))


# ═══════════════════════ ALCHEMY ═══════════════════════
def windmill(s, tower_r=0.60, tower_h=1.05, roof='wood', sails=4, l2=False):
    cx, cy = 1.5, 1.42
    # stone base plinth
    box(s, cx - 0.72, cy - 0.30, 1.44, 0.95, 0, 0.16, 'stone', 'stone', rows=1)
    bx, by, tx_, ty_, a, b = cylinder(s, cx, cy, tower_r, 0.14, tower_h, 'castle', nrows=6)
    # door + windows on the tower front (+y side)
    doorL(s, cy + tower_r * 0.82, cx - 0.14, 0.4, h=0.42, w=0.24, off=0.5)
    winR(s, cx + tower_r * 0.80, cy - 0.35, 0.7, 0.55, wh=0.18, w=0.14, off=0.5, lit=True)
    # wooden cap (cone)
    cone_roof(s, cx, cy, tower_r * 1.18, 0.14 + tower_h, 0.46, roof=roof, tiles=4)
    fin = s.P(cx, cy, 0.14 + tower_h + 0.50)
    s.d.ellipse([fin[0] - 2 * SS, fin[1] - 2 * SS, fin[0] + 2 * SS, fin[1] + 2 * SS], fill=hx('gold'))
    # sail hub on the +x upper side — vertical plane y = cy
    hx_, hy_ = s.P(cx + tower_r * 0.72, cy, 0.14 + tower_h + 0.30)
    R = 1.05 * s.HW / (32 * SS)  # ~1.05 world
    Rpx = 1.05 * s.HW
    for i in range(sails):
        phi = math.pi / 4 + i * math.pi * 2 / sails
        dx, dz = math.cos(phi), math.sin(phi)
        px_, pz_ = -dz, dx  # in-plane perpendicular
        r0, r1 = 0.13, 1.0
        w0, w1 = 0.05, 0.20
        p_a = s.P(cx + tower_r * 0.72 + R * r0 * dx, cy, 0.14 + tower_h + 0.30 + R * r0 * dz)
        p_b = s.P(cx + tower_r * 0.72 + R * r1 * dx + R * w1 * px_, cy, 0.14 + tower_h + 0.30 + R * r1 * dz + R * w1 * pz_)
        p_c = s.P(cx + tower_r * 0.72 + R * r1 * dx - R * w1 * px_, cy, 0.14 + tower_h + 0.30 + R * r1 * dz - R * w1 * pz_)
        p_d = s.P(cx + tower_r * 0.72 + R * r0 * dx + R * w0 * px_, cy, 0.14 + tower_h + 0.30 + R * r0 * dz + R * w0 * pz_)
        p_e = s.P(cx + tower_r * 0.72 + R * r0 * dx - R * w0 * px_, cy, 0.14 + tower_h + 0.30 + R * r0 * dz - R * w0 * pz_)
        s.poly([p_d, p_b, p_c, p_e], hx('plaster', 0.94))          # canvas sail
        s.poly([p_a, p_b, p_c], hx('wood', 0.85))                  # wooden spar
        # lattice strips
        for k in (1, 2):
            f = k / 3
            qa = (p_d[0] + (p_b[0] - p_d[0]) * f, p_d[1] + (p_b[1] - p_d[1]) * f)
            qb = (p_e[0] + (p_c[0] - p_e[0]) * f, p_e[1] + (p_c[1] - p_e[1]) * f)
            s.line(qa, qb, (70, 46, 26, 130), max(1, SS - 1))
    # hub
    s.d.ellipse([hx_ - 4 * SS, hy_ - 4 * SS, hx_ + 4 * SS, hy_ + 4 * SS], fill=hx('wood_d'))
    s.d.ellipse([hx_ - 2 * SS, hy_ - 2 * SS, hx_ + 2 * SS, hy_ + 2 * SS], fill=hx('gold'))
    # fence yard + dots
    if l2:
        crystal(s, cx - 0.95, cy + 0.75, 0.10, 0.30, 0.075, 'teal')


def alchemy_l1(s):
    windmill(s, 0.60, 1.02, 'wood', 4)


def alchemy_l2(s):
    windmill(s, 0.64, 1.16, 'wood_d', 4, l2=True)
    # cauldron with glow out front
    cx, cy = 0.72, 2.55
    cylinder(s, cx, cy, 0.20, 0.10, 0.24, 'iron', nrows=2)
    s.d.ellipse([p[0] for p in [s.P(cx, cy, 0.36)][0:1]] + [s.P(cx, cy, 0.36)[1] - 6 * SS,
                s.P(cx, cy, 0.36)[0] + 0.20 * s.HW, s.P(cx, cy, 0.36)[1] + 6 * SS], fill=hx('teal', 0.9))
    gp = s.P(cx, cy, 0.44)
    s.d.ellipse([gp[0] - 3 * SS, gp[1] - 2 * SS, gp[0] + 3 * SS, gp[1] + 2 * SS], fill=hx('winlit'))


def alchemy_l3(s):
    # grand lab: main turret + side tower + linking hall
    cx, cy = 1.45, 1.30
    box(s, 0.55, 1.45, 1.5, 1.0, 0, 0.55, 'castle', 'castle', rows=3)      # hall
    hip_roof(s, 0.55, 1.45, 1.5, 1.0, 0.55, 0.40, roof='blue', rlf=0.3, tiles=4)
    doorL(s, 2.45, 0.55, 1.5, h=0.44, w=0.26, off=0.42)
    winL(s, 2.45, 0.55, 1.5, 0.30, wh=0.2, w=0.16, off=0.75, lit=True)
    bx, by, tx_, ty_, a, b = cylinder(s, cx, cy, 0.46, 0, 1.45, 'castle', nrows=8)
    winR(s, cx + 0.44, cy - 0.3, 0.6, 0.9, wh=0.2, w=0.14, off=0.5, lit=True)
    doorL(s, cy + 0.44, cx - 0.12, 0.36, h=0.4, w=0.22, off=0.5)
    cone_roof(s, cx, cy, 0.56, 1.45, 0.62, roof='blue', tiles=5)
    apex = s.P(cx, cy, 1.45 + 0.66)
    crystal(s, cx, cy, 2.08, 0.24, 0.055, 'teal')
    # side tower
    sx, sy = 2.25, 1.95
    cylinder(s, sx, sy, 0.30, 0, 1.0, 'castle', nrows=5)
    cone_roof(s, sx, sy, 0.40, 1.0, 0.46, roof='teal', tiles=4)
    s.d.ellipse([p[0] - 2 * SS for p in [s.P(sx, sy, 1.5)]] and [s.P(sx, sy, 1.5)[0] - 2 * SS, s.P(sx, sy, 1.5)[1] - 2 * SS,
                s.P(sx, sy, 1.5)[0] + 2 * SS, s.P(sx, sy, 1.5)[1] + 2 * SS], fill=hx('gold'))
    # star banner on the hall
    banner(s, 1.15, 2.45, 1.28, zh=0.5, zw=0.24, col='blue')
    # sparks
    for i, (ox_, oz_) in enumerate(((0.3, 0.2), (-0.2, 0.35), (0.05, 0.5))):
        gp = s.P(cx + 0.5 + ox_, cy + 0.55, 0.6 + oz_)
        s.d.ellipse([gp[0] - SS, gp[1] - SS, gp[0] + SS, gp[1] + SS], fill=hx('winlit', 0.9))


# ═══════════════════════ MINES ═══════════════════════
def mine_mound(s, big=0.0):
    rock_blob(s, 1.05, 1.05, 0.80 + big * 0.12, 0.78 + big * 0.18)
    rock_blob(s, 1.85, 1.45, 0.42, 0.44 + big * 0.1, base='rock_d')
    # timber entrance on the +y face
    ex, ey = 0.95, 1.72 + big * 0.1
    for px_ in (ex - 0.26, ex + 0.26):
        box(s, px_ - 0.05, ey, 0.10, 0.10, 0, 0.42 + big * 0.06, 'wood_d', 'wood_d')
    box(s, ex - 0.34, ey, 0.68, 0.10, 0.42 + big * 0.06, 0.10, 'wood', 'wood_d')
    # dark opening
    a = s.P(ex - 0.20, ey + 0.02, 0.40 + big * 0.06)
    b = s.P(ex + 0.20, ey + 0.02, 0.40 + big * 0.06)
    c = s.P(ex + 0.20, ey + 0.02, 0)
    d = s.P(ex - 0.20, ey + 0.02, 0)
    s.poly([a, b, c, d], hx('door_d', 0.30))
    # rail + cart
    ry = ey + 0.42
    s.line(s.P(ex - 0.3, ry, 0.03), s.P(ex + 0.45, ry + 0.28, 0.03), hx('iron', 0.8), max(1, SS))
    s.line(s.P(ex - 0.3, ry + 0.12, 0.03), s.P(ex + 0.45, ry + 0.40, 0.03), hx('iron', 0.8), max(1, SS))
    mx, my = ex + 0.34, ry + 0.22
    box(s, mx - 0.16, my, 0.32, 0.20, 0.06, 0.16, 'wood_d', 'iron')
    for wx in (mx - 0.10, mx + 0.10):
        wp = s.P(wx, my + 0.10, 0.05)
        s.d.ellipse([wp[0] - 2.4 * SS, wp[1] - 1.2 * SS, wp[0] + 2.4 * SS, wp[1] + 1.2 * SS], fill=hx('iron'))
    # ore in the cart
    op = s.P(mx, my + 0.08, 0.24)
    s.d.ellipse([op[0] - 5 * SS, op[1] - 2.5 * SS, op[0] + 5 * SS, op[1] + 2.5 * SS], fill=hx('gold_d', 0.95))


def mines_l1(s):
    mine_mound(s, 0.0)


def mines_l2(s):
    mine_mound(s, 0.5)
    # lantern on a post
    lp = s.P(1.62, 2.1, 0.5)
    s.line(s.P(1.62, 2.1, 0), lp, hx('wood_d'), 2 * SS)
    s.d.ellipse([lp[0] - 2.5 * SS, lp[1] - 3 * SS, lp[0] + 2.5 * SS, lp[1] + 3 * SS], fill=hx('winlit'))


def mines_l3(s):
    mine_mound(s, 1.0)
    # headframe: A-frame legs + crossbar + wheel
    for sgn in (-1, 1):
        s.line(s.P(0.95 + sgn * 0.34, 1.72, 0), s.P(0.95, 1.72, 0.92), hx('wood_d'), 3 * SS)
        s.line(s.P(0.95 + sgn * 0.34, 1.86, 0), s.P(0.95, 1.80, 0.92), hx('wood', 0.9), 3 * SS)
    s.line(s.P(0.62, 1.78, 0.80), s.P(1.28, 1.78, 0.80), hx('wood_d'), 3 * SS)
    wp = s.P(0.95, 1.80, 0.92)
    s.d.ellipse([wp[0] - 7 * SS, wp[1] - 4 * SS, wp[0] + 7 * SS, wp[1] + 4 * SS], outline=hx('iron'), width=2 * SS)
    # gems at the mouth
    crystal(s, 0.62, 2.1, 0.02, 0.2, 0.05, 'teal')
    crystal(s, 1.35, 2.2, 0.02, 0.16, 0.045, 'gold')
    # lantern
    lp = s.P(1.62, 2.1, 0.56)
    s.line(s.P(1.62, 2.1, 0), lp, hx('wood_d'), 2 * SS)
    s.d.ellipse([lp[0] - 2.5 * SS, lp[1] - 3 * SS, lp[0] + 2.5 * SS, lp[1] + 3 * SS], fill=hx('winlit'))


# ═══════════════════════ HUNTING GATE (2x2) ═══════════════════════
def gate_tower(s, x0, y0, w, d, h, base='castle'):
    box(s, x0, y0, w, d, 0, h, base, base, rows=5)
    box(s, x0 - 0.05, y0 - 0.05, w + 0.1, d + 0.1, h, 0.10, base, base)       # cornice
    crenel_x(s, x0, y0, w, d, h + 0.10, mh=0.15, base=base, n=2)
    crenel_y(s, x0, y0, d, w, h + 0.10, mh=0.15, base=base, n=2)


def hunting_gate(s):
    # two flanking towers + central arch span (arch opening faces +y)
    gate_tower(s, 0.0, 0.0, 0.72, 1.9, 1.02)
    gate_tower(s, 1.28, 0.0, 0.72, 1.9, 1.02)
    # central wall with the arch cut through (+y face shows the opening)
    box(s, 0.72, 0.0, 0.56, 1.9, 0, 0.62, 'castle', 'castle', rows=3)
    box(s, 0.70, 0.0, 0.60, 1.9, 0.62, 0.14, 'castle', 'castle')
    crenel_x(s, 0.72, 0.0, 0.56, 0.5, 0.76, mh=0.13, base='castle', n=2)
    # arch opening on the +y face
    a = s.P(0.86, 1.9, 0.50)
    b = s.P(1.14, 1.9, 0.50)
    c = s.P(1.14, 1.9, 0)
    d = s.P(0.86, 1.9, 0)
    s.poly([a, b, c, d], hx('door_d', 0.28))
    s.d.polygon([a, (a[0] + 3 * SS, a[1] - 6 * SS), (b[0] - 3 * SS, b[1] - 6 * SS), b], fill=hx('door_d', 0.28))
    # gold portcullis bars
    for k in range(4):
        u = 0.86 + 0.28 * k / 3
        p = s.P(u, 1.9, 0.46)
        q = s.P(u, 1.9, 0.02)
        s.line(p, q, hx('gold_d', 0.9), max(1, SS))
    # torch sconces beside the arch
    for sx_ in (0.80, 1.20):
        tp = s.P(sx_, 1.9, 0.56)
        s.d.ellipse([tp[0] - SS, tp[1] - SS, tp[0] + SS, tp[1] + SS], fill=hx('winlit'))
    # arrow slits on the towers
    winL(s, 1.9, 0.0, 0.72, 0.62, wh=0.16, w=0.07, off=0.5)
    winR(s, 1.28 + 0.72, 0.0, 1.9, 0.62, wh=0.16, w=0.07, off=0.5)
    winL(s, 1.9, 1.28, 0.72, 0.62, wh=0.16, w=0.07, off=0.5)


# ═══════════════════════ ROCKS ═══════════════════════
def bake_rock(name, w, h, fn, target=None):
    W, H = w, h
    s = Spr(W, H, W / 2, H - 4)
    fn(s)
    im = finish(s, '/tmp/_r.png')
    bb = im.getbbox()
    if bb:
        l, t, r, b = bb
        W2 = int(r - l) + 4
        H2 = int(b - t) + 4
        out = Image.new('RGBA', (W2, H2), (0, 0, 0, 0))
        out.paste(im.crop(bb), (2, 2))
        if target:  # match the legacy canvas exactly (scale law in renderers)
            out = out.resize(target, Image.LANCZOS)
        out.save(f'{OUT}/{name}.png')
        print(f'{name}.png {out.size[0]}x{out.size[1]}')


def rock_cluster(n, spread, r, h):
    def fn(s):
        offs = [(0, 0, 1.0), (spread, spread * 0.4, 0.7), (-spread * 0.8, spread * 0.2, 0.55)][:n]
        for dx, dy, k in offs:
            rock_blob(s, 0 + dx, 0 + dy, r * k, h * k, mossy=(k == 1.0))
    return fn


def mountain(snow=0.5, w=106, h=80, sc=1.0):
    def fn(s):
        rock_blob(s, -0.28 * sc, 0.28 * sc, 0.5 * sc, 0.62 * sc, base='rock_d', snow=snow * 0.55, peak=1)
        rock_blob(s, 0.05 * sc, 0.05 * sc, 0.72 * sc, 1.05 * sc, base='rock', snow=snow, peak=1)
        rock_blob(s, 0.48 * sc, 0.30 * sc, 0.4 * sc, 0.5 * sc, base='rock', peak=1)
    return fn


if __name__ == '__main__':
    bake('base_alchemy_l1', 3, 3, 110, 240, alchemy_l1, zoom=1.10)
    bake('base_alchemy_l2', 3, 3, 110, 250, alchemy_l2, zoom=1.10)
    bake('base_alchemy_l3', 3, 3, 120, 280, alchemy_l3, zoom=1.10)
    bake('base_mines_l1', 2, 2, 60, 140, mines_l1, zoom=1.30)
    bake('base_mines_l2', 2, 2, 60, 150, mines_l2, zoom=1.30)
    bake('base_mines_l3', 2, 2, 70, 190, mines_l3, zoom=1.30)
    bake('base_hunting_gate', 2, 2, 60, 170, hunting_gate, zoom=1.42)
    # rocks (drawn around canvas centre-bottom)
    bake_rock('base_boulder', 100, 60, rock_cluster(3, 0.72, 0.42, 0.48), target=(69, 55))
    bake_rock('px_boulder', 96, 58, rock_cluster(3, 0.68, 0.38, 0.40), target=(79, 48))
    bake_rock('px_rock', 60, 40, rock_cluster(1, 0, 0.40, 0.38), target=(55, 36))
    bake_rock('base_rock', 56, 38, rock_cluster(1, 0, 0.38, 0.40), target=(49, 32))
    bake_rock('px_stone', 40, 56, rock_cluster(1, 0, 0.26, 0.78), target=(36, 52))
    bake_rock('px_cliff', 76, 48, rock_cluster(2, 0.72, 0.52, 0.66), target=(72, 44))
    # mountains (keep snowcap identity, warm the rock)
    bake_rock('px_mountain_a', 116, 92, mountain(0.5, sc=1.75), target=(106, 80))
    bake_rock('px_mountain_b', 156, 120, mountain(0.62, sc=2.35), target=(143, 108))
    bake_rock('px_mountain_far', 128, 100, mountain(0.4, sc=1.9), target=(116, 88))
    print('base41b done')
