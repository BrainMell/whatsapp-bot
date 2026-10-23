#!/usr/bin/env python3
"""fx_scene_demo.py — animated battle-card scene demo (owner 2026-10-23 11:11Z:
"lasers that lead to explosions, hands coming out of the ground, fire, freezing,
place it in a battle card scene").
Side layout: enemies left (SIDE_ENEMY_X=290 GY=645), player right (890, ~806),
stage 1920x1440 (abyssScene.js constants), HIT_TINT rgba(122,16,12,.58).
Output: 640x480 animated GIF, 26 frames @ 90ms."""
import os, math, random, glob, re
from PIL import Image, ImageDraw

REPO = "/home/z/my-project/whatsapp-bot"
FX = f"{REPO}/core/rpgasset/fx"
ART = f"{REPO}/core/rpgasset"
OUT_DIR = "/home/z/my-project/download/fx_demo"
os.makedirs(OUT_DIR, exist_ok=True)
W, H = 1920, 1440
OUT_W, OUT_H = 640, 480
FRAMES = 26
DUR = 90
rng = random.Random(77)

BG = Image.open(f"{ART}/environment/abyss/regular/bone_fields_abyss.png").convert("RGBA").resize((W, H), Image.LANCZOS)

# ---------- helpers ----------
def nat_sort(paths):
    return sorted(paths, key=lambda p: [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", os.path.basename(p))])

def load_actor(path, h, flip=False):
    im = Image.open(path).convert("RGBA")
    w = max(1, round(im.width * h / im.height))
    im = im.resize((w, h), Image.LANCZOS)
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    return im

def tint(im, rgba):
    """fill sprite content box with color using its own alpha (source-atop)."""
    if im is None: return None
    layer = Image.new("RGBA", im.size, rgba)
    mask = im.getchannel("A")
    out = im.copy()
    out.paste(layer, (0, 0), mask)
    return out

def recolor(im, fn):
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a:
                px[x, y] = fn(r, g, b, a)
    return im

def paste(canvas, im, cx, bottom_gy, squash=1.0):
    if im is None: return
    c = im
    if squash != 1.0:
        c = im.resize((im.width, max(1, round(im.height * squash))), Image.LANCZOS)
    canvas.paste(c, (round(cx - c.width / 2), round(bottom_gy - c.height)), c)

def draw_laser(draw, x0, y0, x1, y1, t):
    """pixel laser: outer glow, mid, white core, dither, muzzle + impact flare."""
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy)
    ux, uy = dx / L, dy / L
    j = rng.randint(-3, 3)
    layers = [(56, (122, 60, 255, 80)), (30, (190, 120, 255, 170)), (13, (255, 255, 255, 255))]
    for wd, col in layers:
        draw.line([x0, y0 + j, x1, y1 + j], fill=col, width=wd)
    # dithered edge pixels
    for i in range(0, int(L), 16):
        px, py = x0 + ux * i, y0 + uy * i + j
        off = rng.choice([-1, 1]) * (rng.randint(16, 34))
        draw.point((px + uy * off, py - ux * off), fill=(210, 150, 255, 200))
    # muzzle star
    for a in range(4):
        ang = a * math.pi / 2 + 0.4
        draw.line([x0, y0, x0 + math.cos(ang) * 40, y0 + math.sin(ang) * 40], fill=(255, 240, 200, 255), width=8)
    # impact flare
    for r, col in [(46, (255, 200, 90, 220)), (24, (255, 255, 255, 255))]:
        draw.ellipse([x1 - r, y1 + j - r, x1 + r, y1 + j + r], fill=col)

def draw_shards(draw, cx, cy, seed, n=8, spread=180, hgt=(60, 180)):
    r2 = random.Random(seed)
    for i in range(n):
        sx = cx + r2.randint(-spread, spread)
        sh = r2.randint(*hgt)
        sw = r2.randint(8, 16)
        col = r2.choice([(225, 245, 255, 255), (185, 230, 255, 255), (240, 252, 255, 230)])
        draw.polygon([(sx, cy), (sx - sw, cy), (sx - sw // 2, cy - sh)], fill=col)
        if r2.random() < 0.6:
            draw.polygon([(sx + 14, cy), (sx + 14 - sw // 2, cy), (sx + 14 - sw // 4, cy - sh // 2)], fill=col)

def synth_hand(rise, sway=0, mirror=False):
    """pixel skeletal hand rising from ground. Grid 26x30 px, scale x10."""
    S = 10
    gw, gh = 26, 30
    im = Image.new("RGBA", (gw, gh), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    bone, dark, shade = (205, 195, 174, 255), (61, 53, 41, 255), (168, 156, 134, 255)
    # palm block
    d.rectangle([7, 16, 18, 24], fill=dark)
    d.rectangle([8, 17, 17, 23], fill=bone)
    d.rectangle([14, 17, 17, 23], fill=shade)
    # fingers (fanned, sway shifts tips)
    fxs = [(8, 7), (11, 5), (14, 4), (17, 6)]
    for i, (fx, fy) in enumerate(fxs):
        tip = fy + (0 if i in (1, 2) else 1)
        d.rectangle([fx + sway, tip, fx + 2 + sway, 17], fill=dark)
        d.rectangle([fx + 1 + sway, tip + 1, fx + 1 + sway, 16], fill=bone)
    # thumb
    d.rectangle([4 + sway, 14, 6 + sway, 20], fill=dark)
    d.rectangle([5 + sway, 15, 5 + sway, 19], fill=bone)
    # wrist stub below palm
    d.rectangle([10, 24, 15, 29], fill=dark)
    d.rectangle([11, 24, 14, 28], fill=shade)
    im = im.resize((gw * S, gh * S), Image.NEAREST)
    if mirror:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    # crop by rise (0..full): reveal from bottom
    full = im.height
    vis = max(4, round(full * rise))
    return im.crop((0, full - vis, full and im.width, full))

# ---------- load actors ----------
hero = load_actor(f"{ART}/summons/digimon/aegiochusmon_dark_.png", 750, flip=True)
e1 = load_actor(f"{ART}/enemies/mutated (1).png", 690)          # laser + fire target
e2 = load_actor(f"{ART}/enemies/calamaties (2).png", 530)       # grave hands target
e3 = load_actor(f"{ART}/enemies/ice (1).png", 480)              # freeze target

# abyssScene.js SIDE_* constants live in the 1200x900 cover-fit space; scene is 1920x1440 → scale 1.6
HERO_X, HERO_GY = 1424, 1290
E1_X, E1_GY = 480, 1032
E2_X, E2_GY = 264, 960
E3_X, E3_GY = 712, 944
MUZZLE = (HERO_X - 260, HERO_GY - 420)
E1_CHEST = (E1_X + 30, E1_GY - 370)

# ---------- load fx sequences ----------
def seq_dir(d, pat="*.png"):
    return nat_sort(glob.glob(os.path.join(d, pat)))

circle_fx = [recolor(Image.open(p).convert("RGBA"), lambda r, g, b, a: (min(255, int(r * 0.35) + 40), min(255, int(g * 1.25) + 40), min(255, int(b * 0.5)), a))
             for p in nat_sort(seq_dir(f"{FX}/circle"))[::4]]      # blue rune -> toxic green
explo_fx = [Image.open(p).convert("RGBA") for p in nat_sort(seq_dir(f"{FX}/gfx/68"))[::5]][:5]
fire_fx = [Image.open(p).convert("RGBA") for p in nat_sort(seq_dir(f"{FX}/fire/3"))]
ice_fx = [recolor(Image.open(p).convert("RGBA"), lambda r, g, b, a: (min(255, int(r * 0.55) + 60), min(255, int(g * 0.95) + 60), 255, a))
          for p in nat_sort(seq_dir(f"{FX}/water/02"))]

def prep(seq, target_w, squash=1.0):
    out = []
    for im in seq:
        s = target_w / im.width
        im2 = im.resize((target_w, round(im.height * s)), Image.LANCZOS)
        out.append(im2)
    return out

circle_fx = prep(circle_fx, 640)
explo_fx = prep(explo_fx, 900)
fire_fx = prep(fire_fx, 800)
ice_fx = prep(ice_fx, 690)

# ---------- frame composers ----------
def stage(actors, tints=None):
    c = BG.copy()
    for a in actors:
        im = a["im"]
        if tints and a.get("key") in tints:
            im = tint(im, tints[a["key"]])
        paste(c, im, a["x"], a["gy"])
    return c

def fx_im(seq, idx, alpha=1.0):
    im = seq[idx % len(seq)].copy()
    if alpha < 1.0:
        a = im.getchannel("A").point(lambda v: int(v * alpha))
        im.putalpha(a)
    return im

frames = []
for f in range(FRAMES):
    c = stage([{"im": e1, "x": E1_X, "gy": E1_GY, "key": "e1"},
               {"im": e2, "x": E2_X, "gy": E2_GY, "key": "e2"},
               {"im": e3, "x": E3_X, "gy": E3_GY, "key": "e3"},
               {"im": hero, "x": HERO_X, "gy": HERO_GY, "key": "hero"}])
    d = ImageDraw.Draw(c, "RGBA")

    # GROUND HANDS (enemy2) — f5..end, rise over 4 stages
    if f >= 5:
        rise = min(1.0, (f - 5) / 6.0)
        circle_alpha = min(1.0, (f - 4) / 3.0)
        paste(c, fx_im(circle_fx, f, circle_alpha), E2_X, E2_GY + 56, squash=0.42)
        for (hx, hgy, mir, ph) in [(E2_X - 150, E2_GY + 74, False, 0), (E2_X + 115, E2_GY + 96, True, 2)]:
            r = max(0.0, min(1.0, (f - 5 - ph) / 5.0))
            if r > 0:
                hand = synth_hand(r, sway=(1 if (f // 2) % 2 else -1), mirror=mir)
                c.paste(hand, (round(hx - hand.width / 2), round(hgy - hand.height + 50)), hand)
        # dirt particles while rising
        if f < 13:
            r2 = random.Random(f)
            for _ in range(16):
                px = E2_X + r2.randint(-190, 190)
                py = E2_GY + r2.randint(-50, 64)
                d.ellipse([px, py, px + 9, py + 9], fill=(96, 66, 46, 220))

    # LASER CHARGE f2-3
    if 2 <= f <= 3:
        r = 14 + f * 10
        d.ellipse([MUZZLE[0] - r, MUZZLE[1] - r, MUZZLE[0] + r, MUZZLE[1] + r], fill=(190, 120, 255, 200))
        d.ellipse([MUZZLE[0] - r // 2, MUZZLE[1] - r // 2, MUZZLE[0] + r // 2, MUZZLE[1] + r // 2], fill=(255, 255, 255, 255))
    # LASER FIRE f4-7 (+ hit tint on e1)
    if 4 <= f <= 7:
        draw_laser(d, MUZZLE[0], MUZZLE[1], E1_CHEST[0], E1_CHEST[1], f)
    e1_tint = None
    if f == 4: e1_tint = (255, 255, 255, 170)
    elif 5 <= f <= 9: e1_tint = (122, 16, 12, 150)
    elif 10 <= f <= 14: e1_tint = (122, 16, 12, 90)
    # EXPLOSION f7-11
    if 7 <= f <= 11:
        paste(c, fx_im(explo_fx, f - 7), E1_X + 16, E1_GY - 210)
        r2 = random.Random(f + 40)
        for _ in range(12):  # embers
            px, py = E1_X + r2.randint(-250, 250), E1_GY - r2.randint(90, 480)
            d.point((px, py), fill=(255, 170, 60, 255))
            d.point((px + 4, py - 5), fill=(255, 210, 90, 220))
    # FIRE RING f10-15 at e1 feet
    if 10 <= f <= 15:
        a = 1.0 if f <= 13 else max(0.0, 1.0 - (f - 13) / 2.0)
        paste(c, fx_im(fire_fx, f - 10, a), E1_X + 16, E1_GY + 64, squash=0.55)
    # FREEZE f13-21 on e3
    if 13 <= f <= 17:
        paste(c, fx_im(ice_fx, f - 13), E3_X, E3_GY - 64, squash=0.8)
    frost_on = f >= 15
    if frost_on and f <= 24:
        draw_shards(d, E3_X, E3_GY + 10, seed=f)
    e3_tint = (170, 220, 255, 110) if 15 <= f <= 25 else None
    e2_tint = (60, 90, 40, 70) if f >= 8 else None  # sickly green tinge once hands grab

    # restage with tints (draw under FX already pasted? simpler: overlay tint copies)
    if e1_tint or e2_tint or e3_tint:
        tl = Image.new("RGBA", c.size, (0, 0, 0, 0))
        dd = ImageDraw.Draw(tl)
        for im, x, gy, tn in [(e1, E1_X, E1_GY, e1_tint), (e2, E2_X, E2_GY, e2_tint), (e3, E3_X, E3_GY, e3_tint)]:
            if tn:
                t = tint(im, tn)
                tl.paste(t, (round(x - t.width / 2), round(gy - t.height)), t)
        c = Image.alpha_composite(c, tl)
        d = ImageDraw.Draw(c, "RGBA")
        if f >= 15 and f <= 24:
            draw_shards(d, E3_X, E3_GY + 10, seed=f)

    # downscale + quantize-friendly
    small = c.resize((OUT_W, OUT_H), Image.LANCZOS)
    frames.append(small.convert("RGB").quantize(colors=128, method=Image.MEDIANCUT))

out = os.path.join(OUT_DIR, "battle_scene_demo.gif")
frames[0].save(out, save_all=True, append_images=frames[1:], duration=DUR, loop=0)
# also dump 3 key frames as PNG for quick inspection
for name, f in [("idle", 1), ("laser", 5), ("hands_fire", 12), ("freeze", 18)]:
    frames[f].convert("RGB").save(os.path.join(OUT_DIR, f"scene_f{f:02d}_{name}.png"))
print("BUILT", out, os.path.getsize(out) // 1024, "KB,", len(frames), "frames")
