#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════
#  ISO41 — CoC-style isometric sprite factory (task 41 v2, owner: "stick
#  to 3d ... the guild area should be a wall ... make this perfect")
#
#  ART LAWS (every sprite obeys all of them):
#   1. STRICT 2:1 dimetric — every horizontal edge runs at exactly 2:1,
#      every vertical edge vertical. Tile = 64x32 px. NO rotated pieces
#      (the KayKit cottage-b lesson).
#   2. COC PALETTE — warm cream/stone walls (never white plastic), hot
#      saturated roofs (terracotta / red / teal), gold trim, dark warm AO.
#   3. FACE LIGHT LAW — top 1.0, left(+y) face 0.86, right(+x) 0.66;
#      light from the upper-left (matches the renderers' facade law).
#   4. TEXTURE LAW — every face gets material: stone courses (running
#      bond), plaster + timber frames, roof tile rows, plank seams.
#   5. AO LAW — vertical gradient to the ground on wall faces, seam
#      darkening at junctions, soft contact ellipse at the base.
#   6. Sprites bake at 1x ART scale, bottom-centre of the image = the
#      footprint's SOUTH CORNER (renderer anchor law), supersampled 3x.
# ═══════════════════════════════════════════════════════════════════════
import math
from PIL import Image, ImageDraw, ImageFilter

SS = 3            # supersample
HW = 32 * SS      # half tile width  (screen px per world unit)
HH = 16 * SS      # half tile height
ZS = 34 * SS      # vertical px per world z unit (wall-height scale)

PAL = {
    'stone':      (185, 169, 140),
    'stone_d':    (140, 126, 100),
    'stone_l':    (214, 199, 168),
    'castle':     (206, 192, 162),
    'plaster':    (238, 224, 194),
    'plaster_d':  (201, 182, 145),
    'timber':     (122, 79, 45),
    'timber_d':   (91, 58, 32),
    'wood':       (156, 107, 61),
    'wood_d':     (117, 78, 43),
    'terra':      (201, 111, 63),
    'terra_d':    (163, 84, 46),
    'terra_l':    (224, 141, 90),
    'red':        (176, 58, 55),
    'red_d':      (133, 40, 38),
    'red_l':      (208, 92, 84),
    'teal':       (63, 143, 139),
    'teal_d':     (44, 104, 101),
    'blue':       (74, 111, 165),
    'blue_d':     (52, 80, 122),
    'slate':      (112, 122, 133),
    'slate_d':    (82, 90, 99),
    'straw':      (207, 165, 78),
    'straw_d':    (168, 127, 56),
    'gold':       (230, 185, 77),
    'gold_d':     (184, 134, 46),
    'rock':       (154, 142, 122),
    'rock_d':     (113, 103, 87),
    'rock_l':     (188, 176, 154),
    'snow':       (240, 242, 244),
    'snow_d':     (205, 212, 220),
    'door':       (101, 62, 33),
    'door_d':     (74, 44, 23),
    'win':        (58, 48, 66),
    'winlit':     (255, 214, 130),
    'leaf':       (96, 156, 66),
    'leaf_d':     (66, 118, 46),
    'dark':       (62, 44, 30),
    'sand':       (216, 190, 138),
    'iron':       (105, 100, 104),
}


def hx(name, shade=1.0, toward=(70, 50, 36), alpha=255):
    r, g, b = PAL[name]
    t = max(0.0, 1.0 - shade)
    return (max(0, min(255, int(r * min(shade, 1) + toward[0] * t))),
            max(0, min(255, int(g * min(shade, 1) + toward[1] * t))),
            max(0, min(255, int(b * min(shade, 1) + toward[2] * t))), alpha)


def shade_col(col, shade, toward=(70, 50, 36)):
    t = max(0.0, 1.0 - shade)
    return (max(0, min(255, int(col[0] * min(shade, 1) + toward[0] * t))),
            max(0, min(255, int(col[1] * min(shade, 1) + toward[1] * t))),
            max(0, min(255, int(col[2] * min(shade, 1) + toward[2] * t))), col[3] if len(col) > 3 else 255)


class Spr:
    def __init__(self, w, h, ox, oy, zoom=1.0):
        self.w, self.h, self.ox, self.oy = int(w), int(h), ox * SS, oy * SS
        self.zm = zoom
        self.HW, self.HH, self.ZS = HW * zoom, HH * zoom, ZS * zoom
        self.im = Image.new('RGBA', (self.w * SS, self.h * SS), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    def P(self, x, y, z=0.0):
        return (self.ox + (x - y) * self.HW, self.oy + (x + y) * self.HH - z * self.ZS)

    def poly(self, pts, col):
        self.d.polygon([(p[0], p[1]) for p in pts], fill=col)

    def line(self, a, b, col, wd=1):
        self.d.line([(a[0], a[1]), (b[0], b[1])], fill=col, width=wd)

    # ── box faces ─────────────────────────────────────────────────────
    def top(self, x0, y0, w, d, z, base='stone', shade=1.0):
        pts = [self.P(x0, y0, z), self.P(x0 + w, y0, z),
               self.P(x0 + w, y0 + d, z), self.P(x0, y0 + d, z)]
        self.poly(pts, hx(base, shade))

    def faceR(self, x1, y0, d, z0, z1, base='stone', shade=0.66, grad=0.20):
        pts = [self.P(x1, y0, z1), self.P(x1, y0 + d, z1),
               self.P(x1, y0 + d, z0), self.P(x1, y0, z0)]
        self.poly(pts, hx(base, shade))
        self._vgrad(pts, hx(base, shade), grad)
        return pts

    def faceL(self, x0, y1, w, z0, z1, base='stone', shade=0.86, grad=0.16):
        pts = [self.P(x0, y1, z1), self.P(x0 + w, y1, z1),
               self.P(x0 + w, y1, z0), self.P(x0, y1, z0)]
        self.poly(pts, hx(base, shade))
        self._vgrad(pts, hx(base, shade), grad)
        return pts

    def _vgrad(self, pts, col, amt):
        ys = [p[1] for p in pts]
        y_top, y_bot = min(ys), max(ys)
        if y_bot - y_top < 3: return
        mask = Image.new('L', self.im.size, 0)
        ImageDraw.Draw(mask).polygon(pts, fill=255)
        grad = Image.new('RGBA', self.im.size, (0, 0, 0, 0))
        gd = ImageDraw.Draw(grad)
        steps = max(3, int((y_bot - y_top) / (2 * SS)))
        for i in range(steps):
            f = i / steps
            yy = y_top + (y_bot - y_top) * f
            hh = (y_bot - y_top) / steps + 1
            a = int(255 * amt * (f ** 1.4))
            gd.rectangle([-10, yy, self.im.size[0] + 10, yy + hh], fill=(40, 28, 18, a))
        grad.putalpha(Image.composite(grad.split()[3], Image.new('L', self.im.size, 0), mask))
        self.im.alpha_composite(grad)
        self.d = ImageDraw.Draw(self.im)

    def _faceparam(self, pts):
        """p0,p1,p2,p3 -> origin(top-left), axisU(p1-p0), axisV(p3-p0)"""
        p0, p1, p2, p3 = pts
        return p0, (p1[0] - p0[0], p1[1] - p0[1]), (p3[0] - p0[0], p3[1] - p0[1])

    # ── face-space texture helpers (call right after the face fill) ───
    def courses(self, pts, rows=4, block=0.58, alpha=46):
        """running-bond stone courses on a side face"""
        p0, U, V = self._faceparam(pts)
        wd = max(1, SS)
        m = (30, 20, 12, alpha)
        hi = (255, 244, 214, int(alpha * 0.55))
        for r in range(rows):
            t0 = r / rows
            a = (p0[0] + V[0] * t0, p0[1] + V[1] * t0)
            b = (p0[0] + U[0] + V[0] * t0, p0[1] + U[1] + V[1] * t0)
            self.line(a, b, m, wd)
            off = block / 2 if r % 2 else 0.0
            nj = int(1 / block) + 2
            for j in range(nj):
                u0 = off + j * block
                if u0 <= 0.02 or u0 >= 0.98: continue
                ja = (p0[0] + U[0] * u0 + V[0] * t0, p0[1] + U[1] * u0 + V[1] * t0)
                jb = (p0[0] + U[0] * u0 + V[0] * (t0 + 1 / rows), p0[1] + U[1] * u0 + V[1] * (t0 + 1 / rows))
                self.line(ja, jb, m, wd)
            t1 = t0 + (1 / rows) * 0.24
            a = (p0[0] + V[0] * t1, p0[1] + V[1] * t1)
            b = (p0[0] + U[0] + V[0] * t1, p0[1] + U[1] + V[1] * t1)
            self.line(a, b, hi, max(1, SS - 1))

    def planks(self, pts, vcols=7, alpha=58):
        p0, U, V = self._faceparam(pts)
        m = (30, 18, 10, alpha)
        for j in range(1, vcols):
            u = j / vcols
            a = (p0[0] + U[0] * u, p0[1] + U[1] * u)
            b = (p0[0] + U[0] * u + V[0], p0[1] + U[1] * u + V[1])
            self.line(a, b, m, max(1, SS - 1))

    def mottle(self, pts, n=14, alpha=7, col=(168, 148, 116)):
        """plaster mottle — SOFT tone variation, never dirt holes"""
        p0, U, V = self._faceparam(pts)
        for i in range(n):
            u = (i * 0.61803) % 1.0
            v = (i * 0.75488) % 1.0
            r = 1.1 * SS
            c = (p0[0] + U[0] * u + V[0] * v, p0[1] + U[1] * u + V[1] * v)
            self.d.ellipse([c[0] - r, c[1] - r, c[0] + r, c[1] + r], fill=col + (alpha,))


def box(s, x0, y0, w, d, z0, h, wall='stone', top=None, rows=0, plaster=False,
        planked=False, shR=0.66, shL=0.86):
    """axis-aligned box; rows>0 adds stone courses, plaster adds mottle,
    planked adds plank seams"""
    pr = s.faceR(x0 + w, y0, d, z0, z0 + h, wall, shR)
    pl = s.faceL(x0, y0 + d, w, z0, z0 + h, wall, shL)
    if rows:
        s.courses(pr, rows=max(2, int(rows * 0.8)))
        s.courses(pl, rows=rows)
    if plaster:
        s.mottle(pr, n=14)
        s.mottle(pl, n=20)
    if planked:
        s.planks(pr, vcols=max(4, int(d * 6)))
        s.planks(pl, vcols=max(4, int(w * 6)))
    s.top(x0, y0, w, d, z0 + h, top or wall, 1.0)
    return pr, pl


def crenel_x(s, x0, y0, ln, th, z, mh=0.16, base='castle', n=None):
    """merlons along a wall top running along x (screen down-right)"""
    n = n or max(2, round(ln / 0.42))
    step = ln / n
    mw = step * 0.62
    for i in range(n):
        mx = x0 + i * step + step * 0.19
        box(s, mx, y0, mw, th, z, mh, base, base, shR=0.62, shL=0.82)


def crenel_y(s, x0, y0, ln, th, z, mh=0.16, base='castle', n=None):
    n = n or max(2, round(ln / 0.42))
    step = ln / n
    mw = step * 0.62
    for i in range(n):
        my = y0 + i * step + step * 0.19
        box(s, x0, my, th, mw, z, mh, base, base, shR=0.62, shL=0.82)


def cylinder(s, cx, cy, r, z0, h, base='castle', band=True, nrows=0):
    """round tower — vertical strips for smooth cylindrical shading"""
    a, b = r * s.HW, r * s.HH
    bx, by = s.P(cx, cy, z0)
    tx_, ty_ = s.P(cx, cy, z0 + h)
    steps = 30
    for i in range(steps):
        u0 = -1 + 2 * i / steps
        u1 = -1 + 2 * (i + 1) / steps
        midu = (u0 + u1) / 2
        sh = 0.58 + 0.40 * (1 - (midu * 0.5 + 0.5)) ** 1.15
        sh = min(1.02, sh)
        f0 = math.sqrt(max(0.0, 1 - u0 * u0))
        f1 = math.sqrt(max(0.0, 1 - u1 * u1))
        pts = [(bx + u0 * a, by - f0 * b), (bx + u1 * a, by - f1 * b),
               (bx + u1 * a, ty_ - f1 * b), (bx + u0 * a, ty_ - f0 * b)]
        s.poly(pts, hx(base, sh))
    if band:
        n = nrows or max(3, int(h / 0.17))
        for k in range(1, n):
            zt = z0 + h * k / n
            yy = s.P(cx, cy, zt)[1]
            s.d.arc([bx - a, yy - b, bx + a, yy + b], 0, 180, fill=(0, 0, 0, 40), width=max(1, SS))
    s.d.ellipse([bx - a, ty_ - b, bx + a, ty_ + b], fill=hx(base, 1.0))
    return (bx, by, tx_, ty_, a, b)


def crenel_ring(s, cx, cy, r, z, base='castle', mh=0.14, n=9):
    """merlons around a round tower rim (visible lower half)"""
    for i in range(n):
        ang = math.pi * (i + 0.5) / n
        u, v = math.cos(ang), math.sin(ang)
        px, py = cx + u * r, cy + v * r
        w2 = 0.5 * (math.pi * r / n)
        a = s.P(px - w2 * 0.6, py - w2 * 0.6, z)
        b = s.P(px + w2 * 0.6, py + w2 * 0.6, z)
        sh = 0.68 + 0.22 * (1 - (u * 0.5 + 0.5))
        mh_px = mh * s.ZS
        s.d.rectangle([min(a[0], b[0]), min(a[1], b[1]) - mh_px,
                       max(a[0], b[0]), max(a[1], b[1])], fill=hx(base, sh))
        s.d.rectangle([min(a[0], b[0]), min(a[1], b[1]) - mh_px - 2 * SS,
                       max(a[0], b[0]), min(a[1], b[1]) - mh_px], fill=hx(base, 0.96))


def cone_roof(s, cx, cy, r, z0, h, roof='terra', tiles=6):
    a, b = r * s.HW, r * s.HH
    bx, by = s.P(cx, cy, z0)
    apex = s.P(cx, cy, z0 + h)
    steps = 30
    for i in range(steps):
        u0 = -1 + 2 * i / steps
        u1 = -1 + 2 * (i + 1) / steps
        midu = (u0 + u1) / 2
        sh = 0.58 + 0.38 * (1 - (midu * 0.5 + 0.5)) ** 1.1
        sh = min(1.02, sh)
        f0 = math.sqrt(max(0.0, 1 - u0 * u0))
        f1 = math.sqrt(max(0.0, 1 - u1 * u1))
        s.poly([(bx + u0 * a, by - f0 * b), (bx + u1 * a, by - f1 * b), apex], hx(roof, sh))
    tiles = min(tiles, max(3, int(h * 3.2)))
    for k in range(1, tiles):
        f = k / tiles
        rr = a * (1 - f)
        yy = by + (apex[1] - by) * f
        bb = b * (1 - f * 0.72)
        if rr > 2:
            s.d.arc([bx - rr, yy - bb, bx + rr, yy + bb], 0, 180, fill=(0, 0, 0, 30), width=max(1, SS))
    # eave ring
    s.d.arc([bx - a * 1.06, by - b * 1.06, bx + a * 1.06, by + b * 1.06], 0, 180,
            fill=hx('wood_d', 0.9), width=max(2, int(2.2 * SS)))
    return apex


def hip_roof(s, x0, y0, w, d, z0, rh, roof='terra', over=0.15, rlf=0.0, tiles=5, cap='wood_d'):
    """hip roof; rlf = ridge length factor 0..1 (0 = pyramid)"""
    e = over
    ex0, ey0, ex1, ey1 = x0 - e, y0 - e, x0 + w + e, y0 + d + e
    cx, cy = (ex0 + ex1) / 2, (ey0 + ey1) / 2
    if w >= d:
        rl = w * rlf
        ra, rb = s.P(cx - rl / 2, cy, z0 + rh), s.P(cx + rl / 2, cy, z0 + rh)
    else:
        rl = d * rlf
        ra, rb = s.P(cx, cy - rl / 2, z0 + rh), s.P(cx, cy + rl / 2, z0 + rh)
    # +y slope (lit), +x slope (dark), +x end triangle
    slL = [s.P(ex0, ey1, z0), s.P(ex1, ey1, z0), rb, ra]
    slR = [s.P(ex1, ey0, z0), s.P(ex1, ey1, z0), rb, ra]
    endR = [s.P(ex1, ey0, z0), s.P(ex1, ey1, z0), ra if w < d else rb]
    s.poly(slL, hx(roof, 0.86))
    s.poly(slR, hx(roof, 0.64))
    s.poly(endR, hx(roof, 0.72))
    # tile rows: interpolate eave edge -> ridge edge
    def rows(slope, eave_idx, ridge_pts):
        p_eave = slope[eave_idx[0]:eave_idx[1]]
        for k in range(1, tiles):
            f = k / tiles
            a2 = p_eave[0]; a3 = p_eave[-1]
            b2 = ridge_pts[0]; b3 = ridge_pts[-1]
            qa = (a2[0] + (b2[0] - a2[0]) * f, a2[1] + (b2[1] - a2[1]) * f)
            qb = (a3[0] + (b3[0] - a3[0]) * f, a3[1] + (b3[1] - a3[1]) * f)
            s.line(qa, qb, (0, 0, 0, 42), max(1, SS))
    rows(slL, (0, 2), [ra, rb])
    rows(slR, (0, 2), [rb, ra] if w >= d else [ra, rb])
    # ridge cap + fascia
    s.line(ra, rb, hx(cap, 0.95), max(2, int(2.4 * SS)))
    s.line(slL[0], slL[1], hx(cap, 0.60), max(2, int(2.6 * SS)))
    s.line(slR[0], slR[1], hx(cap, 0.52), max(2, int(2.6 * SS)))
    return (ra, rb)


def gable_roof(s, x0, y0, w, d, z0, rh, axis='x', roof='terra', over=0.15, tiles=6, cap='wood_d'):
    e = over
    ex0, ey0, ex1, ey1 = x0 - e, y0 - e, x0 + w + e, y0 + d + e
    cy, cx = (ey0 + ey1) / 2, (ex0 + ex1) / 2
    if axis == 'x':
        ra, rb = s.P(ex0, cy, z0 + rh), s.P(ex1, cy, z0 + rh)
        slL = [s.P(ex0, ey1, z0), s.P(ex1, ey1, z0), rb, ra]
        slR = [s.P(ex1, ey0, z0), s.P(ex1, ey1, z0), rb, ra]
        endR = [s.P(ex1, ey0, z0), s.P(ex1, ey1, z0), rb]
    else:
        ra, rb = s.P(cx, ey0, z0 + rh), s.P(cx, ey1, z0 + rh)
        slL = [s.P(ex0, ey1, z0), s.P(ex1, ey1, z0), rb, ra]
        slR = [s.P(ex1, ey0, z0), s.P(ex1, ey1, z0), rb, ra]
        endR = [s.P(ex1, ey0, z0), s.P(ex1, ey1, z0), rb]
    s.poly(slL, hx(roof, 0.86))
    s.poly(slR, hx(roof, 0.62))
    s.poly(endR, hx(roof, 0.70))
    def rows(slope):
        p_eave = [slope[0], slope[1]]
        p_ridge = [slope[3], slope[2]]
        for k in range(1, tiles):
            f = k / tiles
            qa = (p_eave[0][0] + (p_ridge[0][0] - p_eave[0][0]) * f,
                  p_eave[0][1] + (p_ridge[0][1] - p_eave[0][1]) * f)
            qb = (p_eave[1][0] + (p_ridge[1][0] - p_eave[1][0]) * f,
                  p_eave[1][1] + (p_ridge[1][1] - p_eave[1][1]) * f)
            s.line(qa, qb, (0, 0, 0, 42), max(1, SS))
    rows(slL); rows(slR)
    s.line(ra, rb, hx(cap, 0.95), max(2, int(2.4 * SS)))
    s.line(slL[0], slL[1], hx(cap, 0.60), max(2, int(2.6 * SS)))
    s.line(slR[0], slR[1], hx(cap, 0.52), max(2, int(2.6 * SS)))


def contact_shadow(s, x0, y0, w, d, alpha=54, grow=0.12):
    cx, cy = x0 + w / 2 + grow / 2, y0 + d / 2 + grow / 2
    p = s.P(cx, cy, 0)
    a, b = (w + d) / 2 * s.HW * 0.62, (w + d) / 2 * s.HH * 0.62
    sh = Image.new('RGBA', s.im.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([p[0] - a, p[1] - b, p[0] + a, p[1] + b], fill=(20, 26, 12, alpha))
    sh = sh.filter(ImageFilter.GaussianBlur(3 * SS))
    s.im.alpha_composite(sh)
    s.d = ImageDraw.Draw(s.im)


# ── facade furniture (windows/doors on +y faces and +x faces) ─────────
def winL(s, y1, fx0, fw, z, wh=0.30, w=0.22, off=0.5, lit=False, base_z=0.0):
    col = hx('winlit' if lit else 'win', 1.0)
    fr = (60, 40, 24, 255)
    a = s.P(fx0 + fw * (off - w / 2), y1, base_z + z + wh)
    b = s.P(fx0 + fw * (off + w / 2), y1, base_z + z + wh)
    c = s.P(fx0 + fw * (off + w / 2), y1, base_z + z)
    e = s.P(fx0 + fw * (off - w / 2), y1, base_z + z)
    s.poly([a, b, c, e], col)
    for p, q in ((a, b), (e, c), (a, e), (b, c)):
        s.line(p, q, fr, max(1, SS))
    s.line((a[0] - 2 * SS, a[1] - 2 * SS), (b[0] + 2 * SS, b[1] - 2 * SS), fr, max(1, SS))


def winR(s, x1, fy0, fd, z, wh=0.30, w=0.22, off=0.5, lit=False, base_z=0.0):
    col = hx('winlit' if lit else 'win', 1.0)
    fr = (60, 40, 24, 255)
    a = s.P(x1, fy0 + fd * (off - w / 2), base_z + z + wh)
    b = s.P(x1, fy0 + fd * (off + w / 2), base_z + z + wh)
    c = s.P(x1, fy0 + fd * (off + w / 2), base_z + z)
    e = s.P(x1, fy0 + fd * (off - w / 2), base_z + z)
    s.poly([a, b, c, e], col)
    for p, q in ((a, b), (e, c), (a, e), (b, c)):
        s.line(p, q, fr, max(1, SS))


def doorL(s, y1, fx0, fw, h=0.52, w=0.30, off=0.5, colr='door', lintel='castle'):
    a = s.P(fx0 + fw * (off - w / 2), y1, h)
    b = s.P(fx0 + fw * (off + w / 2), y1, h)
    c = s.P(fx0 + fw * (off + w / 2), y1, 0)
    e = s.P(fx0 + fw * (off - w / 2), y1, 0)
    s.poly([a, b, c, e], hx(colr, 0.74))
    s.line(a, b, hx('timber_d'), max(1, SS))
    s.line(a, e, hx('timber_d'), max(1, SS))
    s.line(b, c, hx('timber_d'), max(1, SS))
    for k in (1, 2):
        u = off - w / 2 + w * k / 3
        p = s.P(fx0 + fw * u, y1, h * 0.92)
        q = s.P(fx0 + fw * u, y1, 0.02)
        s.line(p, q, (0, 0, 0, 60), max(1, SS - 1))
    la = s.P(fx0 + fw * (off - w / 2) - 0.05, y1, h + 0.06)
    lb = s.P(fx0 + fw * (off + w / 2) + 0.05, y1, h + 0.06)
    s.line(la, lb, hx(lintel, 0.5), max(2, int(2.4 * SS)))
    # gold knob
    k = s.P(fx0 + fw * (off + w / 4), y1, h * 0.45)
    s.d.ellipse([k[0] - SS, k[1] - SS, k[0] + SS, k[1] + SS], fill=hx('gold'))


def banner(s, x, y, z_top, zh=0.62, zw=0.30, col='red', pole='wood_d'):
    """vertical hanging banner on a wall/face (screen-space rect is fine
    because banners hang flat against a face — we draw in the face plane
    via points a/b at the same world x/y)"""
    top = s.P(x, y, z_top)
    bot = s.P(x, y, z_top - zh)
    wd = zw * s.HW * 0.9
    s.d.rectangle([top[0] - wd / 2, top[1], top[0] + wd / 2, bot[1]], fill=hx(col, 0.82))
    # swallowtail notch
    s.d.polygon([(top[0] - wd / 2, bot[1]), (top[0] + wd / 2, bot[1]),
                 (top[0], bot[1] + wd * 0.28)], fill=(0, 0, 0, 0))
    # darker band + emblem dot
    s.d.rectangle([top[0] - wd / 2, top[1] + (bot[1] - top[1]) * 0.12 - 2 * SS,
                   top[0] + wd / 2, top[1] + (bot[1] - top[1]) * 0.12], fill=hx('gold_d', 0.9))
    s.d.ellipse([top[0] - wd * 0.16, top[1] + (bot[1] - top[1]) * 0.38 - wd * 0.16,
                 top[0] + wd * 0.16, top[1] + (bot[1] - top[1]) * 0.38 + wd * 0.16],
                fill=hx('gold', 0.95))
    s.d.rectangle([top[0] - wd / 2 - SS, top[1] - 2 * SS, top[0] + wd / 2 + SS, top[1]], fill=hx('gold_d'))


def finish(s, path):
    im = s.im.resize((s.w, s.h), Image.LANCZOS)
    im.save(path)
    return im
