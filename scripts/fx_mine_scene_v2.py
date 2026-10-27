#!/usr/bin/env python3
# fx_mine_scene_v2.py — Mellow round-2: full mine set (cart, rails, beams, lantern),
# machine REMOVED, floating pickaxe breaks the SMALL rock in front of the big one.
# Fixes: head no longer clips off-frame (lower pivot + smaller scale), natural rock
# scatter, richer fracture cracks (branching + fracture ring + edge notches).
import math, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 640, 384
FPS = 12
FLOOR_Y = 306
DUR = 1000 // FPS
FRAMES = 80
CYC, C0 = 18, 6

PIV = (352, 168)          # pickaxe grip pivot (lowered — no more top clipping)
SC = 0.66
STRIKE_ANG = 147          # CW from up at impact
IP = (396, 264)           # impact point = small rock upper-left face
BIG  = dict(cx=502, base=300, hw=58, hh=50, seed=11)
SMALL= dict(cx=424, base=306, hw=40, hh=36, seed=22)

FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
f_hud = ImageFont.truetype(FONT_B, 15)
f_pop = ImageFont.truetype(FONT_B, 19)

def lerp(a, b, t): return a + (b - a) * t
def ease_out(t): return 1 - (1 - t) ** 2
def ease_in(t): return t ** 3

# ---------------------------------------------------------------- pickaxe sprite
def build_pickaxe():
    S = 360
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx = 180
    out = [(cx + 64 * math.cos(math.radians(a)), 100 - 64 * math.sin(math.radians(a)))
           for a in range(175, 4, -3)]                 # top of C_out, left→right
    inn = [(cx + 64 * math.cos(math.radians(a)), 118 - 64 * math.sin(math.radians(a)))
           for a in range(5, 176, 3)]                  # top of C_cut, right→left
    head = out + [(250, 132)] + inn + [(110, 132)]     # hooked horn tips
    d.polygon(head, fill=(214, 221, 232, 255), outline=(30, 32, 42, 255))
    d.arc([cx - 54, 48, cx + 54, 156], start=200, end=340,
          fill=(245, 249, 253, 255), width=4)
    d.arc([cx - 54, 52, cx + 54, 160], start=205, end=335,
          fill=(118, 127, 142, 255), width=4)
    d.rounded_rectangle([cx - 14, 44, cx + 14, 66], 5,
                        fill=(90, 98, 112, 255), outline=(30, 32, 42, 255), width=3)
    d.polygon([(cx - 8, 48), (cx + 8, 48), (cx + 5, 276), (cx - 5, 276)],
              fill=(122, 74, 34, 255), outline=(50, 28, 12, 255))
    d.line([(cx - 4, 54), (cx - 3, 272)], fill=(169, 110, 52, 255), width=3)
    for i, y in enumerate(range(238, 274, 9)):
        d.rectangle([cx - 7 + i % 2, y, cx + 7 - i % 2, y + 5],
                    fill=(74, 46, 22, 255), outline=(40, 22, 10, 255))
    d.rounded_rectangle([cx - 12, 272, cx + 12, 288], 5,
                        fill=(64, 38, 18, 255), outline=(30, 16, 6, 255), width=2)
    return im, (180, 268)

PICK, PIVOT_SPR = build_pickaxe()
PICK_S = PICK.resize((int(360 * SC), int(360 * SC)), Image.LANCZOS)
PIVOT_S = (PIVOT_SPR[0] * SC, PIVOT_SPR[1] * SC)
# --- anti-clip pad: max content radius from pivot = 153px (head top).
# The old 237px sprite box left only ~119px left-margin, so the windup swing
# (head sweeping ~150px left of pivot) was clipped by rotate(expand=False)
# — the REAL "axe head disappears" bug. 170px clearance on all sides makes
# clipping impossible at any angle.
PAD = 170
PICK_P = Image.new("RGBA", (2 * PAD, 2 * PAD), (0, 0, 0, 0))
PICK_P.paste(PICK_S, (int(PAD - PIVOT_S[0]), int(PAD - PIVOT_S[1])), PICK_S)
PIVOT_P = (PAD, PAD)

# ---------------------------------------------------------------- rocks
def make_rock(cx, base, hw, hh, seed, gems):
    r = random.Random(seed)
    pts, n = [], 9
    for i in range(n + 1):
        a = math.pi * i / n
        j = 1 + (0.10 if i % 2 else -0.08) + r.uniform(-0.04, 0.04)
        pts.append((cx + hw * j * math.cos(a), base - hh * j * math.sin(a)))
    poly = [(cx - hw * 1.04, base)] + pts + [(cx + hw * 1.04, base)]
    fac = [(cx - hw * .55, base), (cx - hw * .1, base - hh * .95),
           (cx + hw * .1, base), (cx + hw * .55, base)]
    fac2 = [(cx + hw * .1, base), (cx + hw * .5, base - hh * .7), (cx + hw * .8, base)]
    top = [(cx - hw * .5, base - hh * .72), (cx - hw * .05, base - hh * .92),
           (cx + hw * .45, base - hh * .68)]
    return dict(poly=poly, fac=fac, fac2=fac2, top=top, gems=gems)

def draw_rock(base_img, rk, fill=(96, 82, 120), cracks=None, notches=False):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, base, hw = rk["poly"][0][0] + hw_of(rk), 0, 0   # noop guard
    d.polygon(rk["poly"], fill=fill + (255,), outline=(26, 16, 44, 255))
    d.polygon(rk["fac"], fill=tuple(int(c * .82) for c in fill) + (255,))
    d.polygon(rk["fac2"], fill=tuple(int(c * .68) for c in fill) + (255,))
    d.line(rk["top"], fill=tuple(min(255, int(c * 1.45)) for c in fill) + (255,),
           width=4, joint="curve")
    for gx, gy, g in rk["gems"]:
        col = (89, 230, 255, 255) if g == "c" else (255, 179, 86, 255)
        d.polygon([(gx, gy - 5), (gx + 4, gy), (gx, gy + 5), (gx - 4, gy)],
                  fill=col, outline=(20, 12, 36, 255))
        d.point((gx - 1, gy - 2), fill=(255, 255, 255, 255))
    for pts, wd in (cracks or []):
        d.line(pts, fill=(16, 9, 30, 255), width=wd, joint="curve")
    if notches:
        for tri in rk.get("notch_tris", []):
            d.polygon(tri, fill=(14, 8, 26, 255))
    base_img.alpha_composite(layer)
    return layer

def hw_of(rk):  # small helper (unused math guard)
    return 0

SMALL_GEMS = [(410, 288, "c"), (434, 278, "a"), (442, 298, "c"), (422, 298, "a"),
              (438, 286, "c")]
BIG_GEMS = [(488, 276, "c"), (516, 288, "a"), (530, 266, "c")]
ROCK_SM = make_rock(**{k: SMALL[k] for k in ("cx", "base", "hw", "hh", "seed")},
                   gems=SMALL_GEMS)
ROCK_BG = make_rock(**{k: BIG[k] for k in ("cx", "base", "hw", "hh", "seed")},
                    gems=BIG_GEMS)
# edge notches appear with stage-3 cracks (small rock upper-left edge)
ROCK_SM["notch_tris"] = [[(390, 262), (400, 266), (393, 272)],
                         [(384, 276), (393, 278), (388, 284)],
                         [(406, 258), (414, 262), (408, 266)]]

# ---------------------------------------------------------------- cracks (natural)
def _polyline(ip, ang0, segs, r):
    pts, x, y, ang, L = [ip], ip[0], ip[1], math.radians(ang0), r.uniform(11, 15)
    branch = None
    for s in range(segs):
        ang += r.uniform(-0.42, 0.42)
        x += math.cos(ang) * L
        y += math.sin(ang) * L          # y down: angles ~90 = downward
        pts.append((x, y))
        if s == 1 and branch is None and r.random() < 0.9:
            ba = ang + r.choice((-0.7, 0.7))
            bx, by, bl = x, y, L * 0.7
            bp = [(bx, by)]
            for _ in range(2):
                ba += r.uniform(-0.4, 0.4)
                bx += math.cos(ba) * bl
                by += math.sin(ba) * bl
                bp.append((bx, by))
            branch = bp
        L *= 1.28
    return pts, branch

def _arc(ip, rad, a0, a1, r):
    span = [a0 + (a1 - a0) * i / 6 for i in range(7)]
    return [(ip[0] + rad * math.cos(math.radians(a)),
             ip[1] + rad * math.sin(math.radians(a))) for a in span]

def build_cracks(ip, seed=7):
    r = random.Random(seed)
    s0, s1, s2 = [], [], []
    for ang0 in (52, 96, 138):                      # down-right / down / down-left
        pts, br = _polyline(ip, ang0, 4, r)
        (s0 if len(s0) < 2 else s1).append((pts, 3))
        if br: s1.append((br, 2))
    for rad, a0 in ((13, 10), (21, 160), (27, 280)):
        s2.append((_arc(ip, rad, a0, a0 + 55 + r.uniform(0, 40), r), 2))
    s2.append((_arc(ip, 34, 120, 205, r), 2))
    return [s0, s0 + s1, s0 + s1 + s2]

CRACK_STAGES = build_cracks(IP)

# ---------------------------------------------------------------- static mine set
def build_backdrop():
    im = Image.new("RGBA", (W, H))
    px = im.load()
    for y in range(H):
        t = y / H
        px[0, y] = (int(lerp(22, 36, t)), int(lerp(17, 27, t)), int(lerp(38, 55, t)), 255)
        for x in range(1, W):
            px[x, y] = px[0, y]
    d = ImageDraw.Draw(im)
    r = random.Random(4)
    # wall strata + embedded ore glints
    for by in range(30, FLOOR_Y - 46, 26):
        d.line([(0, by), (W, by)], fill=(18, 13, 30, 130), width=2)
        for _ in range(2):
            sx = r.randint(10, W - 60)
            d.rectangle([sx, by + 4, sx + r.randint(24, 60), by + 9],
                        fill=(16, 11, 28, 90))
    for _ in range(6):
        gx, gy = r.randint(30, W - 30), r.randint(56, 132)
        col = (89, 210, 235, 120) if r.random() < .5 else (235, 170, 90, 120)
        d.polygon([(gx, gy - 3), (gx + 3, gy), (gx, gy + 3), (gx - 3, gy)], fill=col)
    # tunnel support beams + crossbeam
    for bx in (58, 556):
        d.rectangle([bx, 118, bx + 26, FLOOR_Y + 6], fill=(74, 53, 32, 255),
                    outline=(42, 28, 14, 255), width=2)
        d.line([(bx + 6, 124), (bx + 6, FLOOR_Y)], fill=(107, 78, 44, 255), width=3)
    d.rectangle([40, 96, 600, 122], fill=(64, 46, 28, 255),
                outline=(42, 28, 14, 255), width=2)
    for bxx in range(60, 590, 68):
        d.ellipse([bxx, 106, bxx + 5, 111], fill=(32, 22, 12, 255))
    # hanging lantern (warm key light, over the cart)
    d.line([(210, 122), (210, 138)], fill=(70, 70, 80, 255), width=2)
    d.rounded_rectangle([198, 138, 222, 168], 4, fill=(52, 46, 40, 255),
                        outline=(28, 24, 20, 255), width=2)
    d.rectangle([203, 143, 217, 162], fill=(255, 184, 78, 255))
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dg = ImageDraw.Draw(glow)
    dg.ellipse([158, 108, 262, 200], fill=(255, 176, 84, 66))
    glow = glow.filter(ImageFilter.GaussianBlur(24))
    im.alpha_composite(glow)
    # rubble mounds + rails + ties
    for mx, mw, mh in ((300, 130, 16), (480, 90, 11)):
        d.ellipse([mx - mw, FLOOR_Y - mh, mx + mw, FLOOR_Y + 8],
                  fill=(30, 22, 44, 255))
    d.rectangle([0, 299, W, 301], fill=(88, 92, 104, 255))
    d.rectangle([0, 305, W, 307], fill=(62, 66, 76, 255))
    for tx in range(8, W, 34):
        d.rectangle([tx, 300, tx + 15, 305], fill=(56, 42, 28, 255))
    # mine cart (background, intact)
    d.polygon([(122, 260), (232, 260), (219, 298), (135, 298)],
              fill=(62, 67, 78, 255), outline=(26, 28, 34, 255))
    d.rectangle([116, 254, 238, 264], fill=(84, 90, 102, 255),
                outline=(26, 28, 34, 255))
    for wy in (272, 282, 291):
        d.line([(128, wy), (226, wy)], fill=(46, 50, 58, 255), width=2)
    d.ellipse([140, 296, 166, 314], fill=(34, 36, 44, 255), outline=(18, 18, 24, 255))
    d.ellipse([196, 296, 222, 314], fill=(34, 36, 44, 255), outline=(18, 18, 24, 255))
    d.ellipse([150, 302, 158, 310], fill=(96, 100, 112, 255))
    d.ellipse([206, 302, 214, 310], fill=(96, 100, 112, 255))
    rr = random.Random(6)
    for ox in range(136, 226, 15):
        oh = rr.randint(6, 12)
        d.ellipse([ox, 246 - oh // 2, ox + 16, 258], fill=(88, 76, 108, 255),
                  outline=(26, 16, 44, 255))
    d.polygon([(160, 244), (166, 238), (171, 244), (166, 249)], fill=(89, 230, 255, 220))
    d.polygon([(196, 246), (202, 240), (207, 246), (202, 251)], fill=(255, 179, 86, 220))
    # the BIG rock (background-right, intact all loop)
    draw_rock(im, ROCK_BG, fill=(84, 72, 108))
    # back scatter rocks
    for cx, base, hw, hh, sd in ((300, 298, 10, 7, 3), (332, 302, 7, 5, 4),
                                 (258, 300, 12, 8, 5), (560, 302, 12, 8, 6)):
        draw_rock(im, make_rock(cx, base, hw, hh, sd, []), fill=(76, 64, 98))
    # floor
    d.rectangle([0, FLOOR_Y, W, H], fill=(38, 30, 50, 255))
    d.line([(0, FLOOR_Y), (W, FLOOR_Y)], fill=(84, 66, 118, 255), width=3)
    for x in range(0, W, 46):
        d.line([(x, FLOOR_Y + 22), (x + 26, FLOOR_Y + 22)], fill=(48, 38, 64, 255), width=2)
        d.line([(x + 18, FLOOR_Y + 52), (x + 44, FLOOR_Y + 52)], fill=(32, 25, 44, 255), width=2)
    for _ in range(14):
        pxx, pyy = r.randint(12, W - 12), r.randint(FLOOR_Y + 12, H - 10)
        d.ellipse([pxx - 2, pyy - 1, pxx + 2, pyy + 1], fill=(30, 23, 42, 255))
    # vignette
    m = Image.new("L", (W, H), 0)
    dm = ImageDraw.Draw(m)
    dm.ellipse([-W * .25, -H * .45, W * 1.25, H * 1.45], fill=255)
    m = m.filter(ImageFilter.GaussianBlur(60)).point(lambda v: 255 - v)
    dark = Image.new("RGBA", (W, H), (8, 4, 16, 130))
    im = Image.composite(im, Image.alpha_composite(im, dark), m.point(lambda v: 255 - v))
    return im.convert("RGBA")

BACK = build_backdrop()
FRONT_SCATTER = [(214, 314, 13, 9, 8), (182, 322, 8, 6, 9), (556, 318, 15, 11, 10),
                 (590, 326, 9, 6, 12), (500, 330, 11, 7, 13)]

# ---------------------------------------------------------------- particles
CHIPS, DUST, CHUNKS, GEMPOP = [], [], [], []
SM_CX, SM_TOP = SMALL["cx"], 284

def spawn_impact():
    CHIPS.clear()
    for _ in range(13):
        CHIPS.append([IP[0], IP[1], rng.uniform(-3.2, 3.2), rng.uniform(-6.0, -1.6),
                      rng.randint(11, 17), rng.choice([(140, 124, 168), (104, 88, 136),
                      (255, 179, 86), (89, 230, 255)]), rng.uniform(2, 4)])
    DUST.clear()
    for _ in range(6):
        DUST.append([SM_CX + rng.randint(-34, 34), 302, rng.uniform(-.7, .7),
                     rng.uniform(-1.1, -.4), rng.randint(14, 20), rng.uniform(6, 10)])

def spawn_burst():
    CHUNKS.clear()
    for _ in range(7):
        CHUNKS.append([[SM_CX + rng.randint(-28, 28), 276 + rng.randint(-14, 14)],
                       rng.uniform(-4.0, 4.0), rng.uniform(-7.2, -2.5), rng.randint(16, 26),
                       rng.uniform(-.25, .25), rng.randint(9, 16)])
    GEMPOP.clear()
    for _ in range(8):
        GEMPOP.append([SM_CX + rng.randint(-24, 24), 272, rng.uniform(-2.5, 2.5),
                       rng.uniform(-6.8, -3.2), rng.randint(24, 34),
                       rng.choice([(89, 230, 255), (255, 179, 86)])])

def step_particles():
    for p in CHIPS + GEMPOP:
        p[0] += p[2]; p[1] += p[3]; p[3] += 0.55
        if p[1] > FLOOR_Y - 2: p[1] = FLOOR_Y - 2; p[3] *= -0.35; p[2] *= 0.7
        p[4] -= 1
    for p in DUST:
        p[0] += p[2]; p[1] += p[3]; p[5] += 0.55; p[4] -= 1
    for c in CHUNKS:
        c[0][0] += c[1]; c[0][1] += c[2]; c[2] += 0.5; c[4] += c[5]
        if c[0][1] > FLOOR_Y - 4: c[0][1] = FLOOR_Y - 4; c[2] *= -0.3; c[1] *= 0.75
        c[3] -= 1

# ---------------------------------------------------------------- pose curves
def pose(f):
    for c in range(4):
        base = C0 + c * CYC
        o = f - base
        if 0 <= o < CYC:
            idle_s = math.sin((f * 0.45) % (2 * math.pi))
            if o < 5:
                return -22 + idle_s * 3, PIV[1] + idle_s * 7, 64, 0, 0
            if o < 9:
                t = ease_out((o - 5) / 4)
                return lerp(-22, -78, t), PIV[1] + 7 - 12 * t - idle_s * 4, lerp(64, 112, t), 0, 0
            if o < 11:
                return -78 + (0.8 if o == 10 else -0.8), PIV[1] - 5, 118, 0, 0
            if o < 13:
                t = ease_in((o - 11) / 2)
                return lerp(-78, STRIKE_ANG, t), PIV[1] - 5 + 20 * t, 118, 1, 0
            if o == 13:
                return STRIKE_ANG, PIV[1] + 15, 128, 0, 5
            t = (o - 13) / 4.0
            a = lerp(STRIKE_ANG, -22, ease_out(t)) + (-6 if o == 16 else 0)
            return a, PIV[1] + 15 - 22 * ease_out(t), lerp(128, 64, t), 0, 5 * (0.55 ** (o - 13))
    a0 = -22 + math.sin((f * 0.45) % (2 * math.pi)) * 3
    return a0, PIV[1] + math.sin((f * 0.45) % (2 * math.pi)) * 7, 64, 0, 0

rng = random.Random(77)
STRIKES = {C0 + c * CYC + 13 for c in range(4)}
BURST_F = C0 + 3 * CYC + 13

# ---------------------------------------------------------------- frame render
def render(f):
    img = BACK.copy()
    d = ImageDraw.Draw(img)
    ang, pyv, glow, smear, shake = pose(f)
    ang, pyv, glow = float(ang), float(pyv), int(glow)
    burst = f >= BURST_F
    stage = max(0, min(3, sum(1 for s in STRIKES if f > s) - (1 if burst else 0)))

    # shadows
    hgt = (FLOOR_Y - pyv) / 200.0
    sw, sa = 24 + hgt * 9, int(52 - hgt * 16)
    d.ellipse([PIV[0] - sw, FLOOR_Y - 2, PIV[0] + sw, FLOOR_Y + 5], fill=(8, 5, 16, sa))

    if f == BURST_F:
        spawn_burst()
    if f in STRIKES:
        spawn_impact()

    if burst:
        d.ellipse([SM_CX - 52, FLOOR_Y - 12, SM_CX + 52, FLOOR_Y + 10],
                  fill=(18, 11, 32, 255))
        d.ellipse([SM_CX - 36, FLOOR_Y - 9, SM_CX + 36, FLOOR_Y + 5],
                  fill=(32, 21, 52, 255))
        for i in range(6):
            rx = SM_CX + ((i * 31) % 84) - 42
            d.ellipse([rx - 4, FLOOR_Y - 3, rx + 4, FLOOR_Y + 3], fill=(66, 55, 90, 255))
        step_particles()
        for c in CHUNKS:
            if c[3] > 0:
                x, y = c[0]
                d.polygon([(x + 8, y), (x - 6, y + 6), (x - 3, y - 6)],
                          fill=(88, 74, 114, 255), outline=(26, 16, 44, 255))
        for p in GEMPOP:
            if p[4] > 0:
                col = p[5] + (255,)
                d.polygon([(p[0], p[1] - 5), (p[0] + 4, p[1]), (p[0], p[1] + 5),
                           (p[0] - 4, p[1])], fill=col, outline=(20, 12, 36, 255))
                if f % 6 == 0:
                    d.line([(p[0] - 7, p[1]), (p[0] + 7, p[1])], fill=(255, 255, 255, 160))
                    d.line([(p[0], p[1] - 7), (p[0], p[1] + 7)], fill=(255, 255, 255, 160))
    else:
        d.ellipse([SMALL["cx"] - SMALL["hw"], FLOOR_Y - 2,
                   SMALL["cx"] + SMALL["hw"], FLOOR_Y + 4], fill=(8, 5, 16, 60))
        draw_rock(img, ROCK_SM, fill=(108, 94, 134),
                  cracks=CRACK_STAGES[stage - 1] if stage else None,
                  notches=stage >= 3)
        step_particles()

    # front scatter (foreground rocks — natural neighbourhood)
    for cx, base, hw, hh, sd in FRONT_SCATTER:
        draw_rock(img, make_rock(cx, base, hw, hh, sd, []), fill=(70, 59, 92))

    for p in CHIPS:
        if p[4] > 0:
            d.ellipse([p[0] - p[6], p[1] - p[6], p[0] + p[6], p[1] + p[6]],
                      fill=p[5] + (255,))
    for p in DUST:
        if p[4] > 0:
            d.ellipse([p[0] - p[5], p[1] - p[5] * .6, p[0] + p[5], p[1] + p[5] * .6],
                      fill=(150, 132, 180, 70))

    if f in STRIKES or f - 1 in STRIKES:
        t = 0 if f in STRIKES else 1
        r = lerp(10, 28, t)
        a = int(lerp(200, 60, t))
        d.ellipse([IP[0] - r, IP[1] - r, IP[0] + r, IP[1] + r],
                  outline=(255, 236, 170, a), width=3)
    if f in STRIKES:
        for k in range(8):
            aa = k * math.pi / 4 + 0.35
            l1, l2 = 8, 17 + (k % 3) * 7
            d.line([(IP[0] + l1 * math.cos(aa), IP[1] + l1 * math.sin(aa)),
                    (IP[0] + l2 * math.cos(aa), IP[1] + l2 * math.sin(aa))],
                   fill=(255, 244, 200, 230), width=3)
        d.ellipse([IP[0] - 7, IP[1] - 7, IP[0] + 7, IP[1] + 7], fill=(255, 255, 240, 240))

    if smear:
        d.arc([PIV[0] - 101, pyv - 101, PIV[0] + 101, pyv + 101], start=-100, end=55,
              fill=(220, 228, 240, 90), width=8)

    gl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dg = ImageDraw.Draw(gl)
    dg.ellipse([PIV[0] - 24, pyv - 36, PIV[0] + 24, pyv + 12], fill=(176, 122, 255, glow))
    gl = gl.filter(ImageFilter.GaussianBlur(9))
    img.alpha_composite(gl)
    d = ImageDraw.Draw(img)
    for i in range(3):
        ph = f * 0.5 + i * 2.094
        sx = PIV[0] + 27 * math.cos(ph)
        sy = pyv + 9 * math.sin(ph) - 8
        d.ellipse([sx - 2.3, sy - 2.3, sx + 2.3, sy + 2.3],
                  fill=(214, 168, 255, 235) if i else (255, 255, 255, 240))
    spr = PICK_P.rotate(-ang, resample=Image.BICUBIC, center=PIVOT_P)
    img.alpha_composite(spr, (int(PIV[0] - PIVOT_P[0]), int(pyv - PIVOT_P[1])))

    if f >= BURST_F + 1:
        t = min(1, (f - BURST_F) / 6)
        yy = 232 - 30 * t
        aa = int(lerp(240, 90, t))
        tx = "ORE +5"
        tw = d.textlength(tx, font=f_pop)
        d.text((SM_CX - tw / 2 + 2, yy + 2), tx, font=f_pop, fill=(30, 16, 4, aa))
        d.text((SM_CX - tw / 2, yy), tx, font=f_pop, fill=(255, 207, 94, aa))

    d.text((22, 16), "MINING", font=f_hud, fill=(255, 255, 255, 210))
    d.text((92, 16), "CRYSTAL DEPTHS", font=f_hud, fill=(176, 150, 230, 210))
    d.line([(22, 40), (230, 40)], fill=(96, 72, 160, 160), width=2)
    done = sum(1 for s in STRIKES if f >= s)
    for i in range(4):
        x = 22 + i * 20
        col = (255, 207, 94, 255) if i < done else (70, 54, 110, 255)
        d.rectangle([x, H - 24, x + 13, H - 15], fill=col, outline=(150, 130, 200, 180))
    if f >= BURST_F:
        d.text((108, H - 26), "NODE CLEARED", font=f_hud, fill=(255, 207, 94, 220))

    # seam: fade a fresh small rock in over the crater
    if f >= FRAMES - 3:
        t = (f - (FRAMES - 4)) / 3.0
        ghost = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        draw_rock(ghost, ROCK_SM, fill=(108, 94, 134))
        gmask = ghost.split()[3].point(lambda v: int(v * t))
        solid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        solid.paste(ghost, (0, 0), gmask)
        img.alpha_composite(solid)

    if shake:
        dx = rng.uniform(-shake, shake); dy = rng.uniform(-shake, shake) * .6
        out = Image.new("RGBA", (W, H), (12, 8, 24, 255))
        out.alpha_composite(img, (int(dx), int(dy)))
        return out
    return img

# ---------------------------------------------------------------- main
def main():
    import os
    outdir = "/home/z/my-project/download/fx_demo"
    qadir = os.path.join(outdir, "qa2")
    os.makedirs(qadir, exist_ok=True)
    frames = [render(f).convert("RGB") for f in range(FRAMES)]
    pal = frames[19].quantize(colors=192, method=Image.MEDIANCUT)
    q = [fr.quantize(palette=pal, dither=Image.NONE) for fr in frames]
    gif = os.path.join(outdir, "mine_scene_pickaxe_v2.gif")
    q[0].save(gif, save_all=True, append_images=q[1:], duration=DUR,
              disposal=2, loop=0, optimize=False)
    for i in (0, 7, 10, 12, 13, 19, 37, 55, 73, 76, 79):
        frames[i].save(os.path.join(qadir, f"f{i:03d}.png"))
    print("OK", gif, len(q), "frames")

if __name__ == "__main__":
    main()
