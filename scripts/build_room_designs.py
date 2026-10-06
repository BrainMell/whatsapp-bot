#!/usr/bin/env python3
"""PHASE B — build the 10 room DESIGN layers (grade + detail + optional glow)
for the guild-war ruins. Each design composites over ANY existing door plate
at runtime:  plate -> grade(blend) -> detail(source-over) -> glow(screen).
All geometry comes from plate_0 (the shared foundation); door mouths, torches
and the south chevron strip are keep-out zones. Ground-change designs reskin
the floor by mapping plate_0's floor luminance through a per-design palette
ramp — the brick pattern survives pixel-perfect, only the material changes."""

from PIL import Image, ImageDraw, ImageFilter
import numpy as np
import os, math

RUINS = '/home/z/my-project/repo/core/rpgasset/guildwar/ruins'
OUT = os.path.join(RUINS, 'variants')
QA = '/home/z/my-project/qa_art'
os.makedirs(OUT, exist_ok=True)

W, H = 1200, 900
plate0 = np.array(Image.open(os.path.join(RUINS, 'ruins_door_0.png')).convert('RGB'), dtype=np.float32)

# ---------- geometry masks ----------
def poly_mask(pts, feather=2.5, size=(W, H)):
    img = Image.new('L', size, 0)
    d = ImageDraw.Draw(img)
    d.polygon(pts, fill=255)
    if feather:
        img = img.filter(ImageFilter.GaussianBlur(feather))
    return np.array(img, dtype=np.float32) / 255.0

# floor polygon measured off the plate itself (wall-base lines traced from
# gridded crops): back-wall base y≈292, side bases curving out to the corners.
FLOOR = poly_mask([(235, 292), (965, 292), (1045, 550), (1100, 670), (1140, 760),
                   (1180, 898), (-20, 898), (0, 760), (40, 670), (95, 550)], feather=3.5)
# baked corner crates must keep their wood — punch them out of the floor
CRATES = poly_mask([(0, 788), (118, 793), (118, 900), (0, 900)], feather=2) + \
         poly_mask([(972, 752), (1200, 752), (1200, 900), (972, 900)], feather=2)
FLOOR = np.clip(FLOOR - CRATES, 0, 1)
UPPER_WALL = poly_mask([(232, 34), (965, 34), (965, 268), (232, 268)])
SIDE_L = poly_mask([(0, 256), (238, 288), (66, 758), (0, 604)])
SIDE_R = poly_mask([(1200, 256), (962, 288), (1134, 758), (1200, 604)])
CEIL = poly_mask([(0, 0), (1200, 0), (1200, 26), (0, 26)])

def band_along(p0, p1, w_up, w_dn, feather=2.0):
    """quad strip along segment p0->p1 with perpendicular half-widths"""
    (x0, y0), (x1, y1) = p0, p1
    dx, dy = x1 - x0, y1 - y0
    L = max(math.hypot(dx, dy), 1e-6)
    px, py = -dy / L, dx / L
    pts = [(x0 + px * w_up, y0 + py * w_up), (x1 + px * w_up, y1 + py * w_up),
           (x1 + px * w_dn, y1 + py * w_dn), (x0 + px * w_dn, y0 + py * w_dn)]
    return poly_mask(pts, feather)

BASE_L = band_along((238, 292), (62, 762), 4, -46)      # inside floor edge, left
BASE_R = band_along((958, 292), (1138, 762), 4, -46)
WBASE_L = band_along((238, 292), (62, 762), -6, -52)    # wall-side strip (above base line)
WBASE_R = band_along((958, 292), (1138, 762), -6, -52)

# keep-outs: door mouths + thresholds + torches + south chevron strip.
# ELLIPSES (tall, narrow) hugging each arch and its floor tongue — the old
# fat circles swallowed whole floor bays and pinched the reskin hourglass-thin.
KEEP = np.zeros((H, W), np.float32)
yy, xx = np.mgrid[0:H, 0:W]
def keep_ellipse(cx, cy, rx, ry):
    KEEP[:] = np.maximum(KEEP, np.clip(1 - np.hypot((xx - cx) / rx, (yy - cy) / ry), 0, 1) ** 0.8)
for (cx, cy, rx, ry) in [(600, 298, 128, 108),   # n arch + tongue
                         (172, 532, 96, 158),    # w arch + tongue
                         (1028, 532, 96, 158),   # e arch + tongue
                         (420, 148, 50, 50), (790, 148, 50, 50)]:  # back-wall torches
    keep_ellipse(cx, cy, rx, ry)
s_strip = np.clip(((yy - 762) / 30.0), 0, 1) * np.clip((760 - np.abs(xx - 600) * 2.2) / 60, 0, 1)
KEEP = np.maximum(KEEP, s_strip)
KEEP = np.clip(KEEP, 0, 1)

def safe(mask):
    return mask * (1 - KEEP)

# ---------- helpers ----------
def lum(a):
    return a[:, :, 0] * 0.299 + a[:, :, 1] * 0.587 + a[:, :, 2] * 0.114

def reskin(mask, ramp, src=None, sat_keep=0.0, dither=6):
    """map source luminance through palette ramp inside mask"""
    if src is None:
        src = plate0
    L = lum(src)
    lo, hi = np.percentile(L[mask > 0.5], [2, 98]) if mask.max() > 0 else (0, 255)
    t = np.clip((L - lo) / max(hi - lo, 1), 0, 1)
    xs = np.array([p for p, _ in ramp], dtype=np.float32)
    cs = np.array([c for _, c in ramp], dtype=np.float32)
    out = np.zeros((H, W, 3), np.float32)
    rng = np.random.default_rng(7)
    tn = np.clip(t + (rng.random((H, W)) - 0.5) * dither / 255.0, 0, 1)
    for c in range(3):
        out[:, :, c] = np.interp(tn, xs, cs[:, c])
    return out, t

def new_canvas():
    return np.zeros((H, W, 4), np.float32)

def put(target, rgb_or_rgba, alpha):
    a = np.clip(alpha, 0, 1)
    target[:, :, :3] = target[:, :, :3] * (1 - a[..., None]) + rgb_or_rgba * a[..., None]
    target[:, :, 3] = np.maximum(target[:, :, 3], a * np.ones((H, W), np.float32))
    return target

def blob_field(rng, mask, n, r_lo, r_hi, color, alpha, rim=None, rim_alpha=0.25, squash=0.62):
    """irregular blobs inside mask (like roomScene blob()) — returns list of draws"""
    out = new_canvas()
    ys, xs = np.where(mask > 0.55)
    if len(xs) == 0:
        return out
    idx = rng.choice(len(xs), size=min(n * 8, len(xs)), replace=False)
    placed = 0
    for i in idx:
        if placed >= n:
            break
        cx, cy = float(xs[i]), float(ys[i])
        s = rng.uniform(r_lo, r_hi)
        tmp = np.zeros((H, W), np.float32)
        for (ox, oy, sc, rot) in [(0, 0, 1, 0), (-0.55, 0.16, 0.62, 0.3), (0.5, -0.12, 0.55, -0.25)]:
            ex, ey = cx + ox * s, cy + oy * s
            rr = s * sc
            tmp = np.maximum(tmp, np.clip((rr - np.hypot((yy - ey) / squash, xx - ex)) / 1.6, 0, 1))
        tmp = safe(tmp * mask)
        if tmp.max() < 0.3:
            continue
        col = np.zeros((H, W, 3), np.float32)
        col[:, :, 0], col[:, :, 1], col[:, :, 2] = color
        put(out, col, tmp * alpha)
        if rim:
            rim_m = np.clip(tmp - np.roll(tmp, 3, axis=0), 0, 1)
            rc = np.zeros((H, W, 3), np.float32)
            rc[:, :, 0], rc[:, :, 1], rc[:, :, 2] = rim
            put(out, rc, rim_m * rim_alpha)
        placed += 1
    return out

def glow_line(draw, p0, p1, w, color, alpha):
    draw.line([p0, p1], fill=tuple(int(c) for c in color) + (int(alpha * 255),), width=w)

def crack_network(rng, mask, n, color, alpha_base, w=2):
    """branching glowing cracks inside mask (numpy raster)"""
    out = new_canvas()
    img = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(img)
    ys, xs = np.where(mask > 0.6)
    if len(xs) == 0:
        return out
    for i in range(n):
        sx, sy = float(rng.choice(xs)), float(rng.choice(ys))
        ang = rng.uniform(0, 2 * math.pi)
        segs = rng.integers(3, 6)
        cx, cy = sx, sy
        pts = [(cx, cy)]
        for k in range(segs):
            ln = rng.uniform(18, 46)
            ang += rng.uniform(-0.5, 0.5)
            cx += math.cos(ang) * ln
            cy += math.sin(ang) * ln * 0.6   # floor perspective squash
            pts.append((cx, cy))
        d.line(pts, fill=255, width=w)
    m = np.array(img, dtype=np.float32) / 255.0
    m = safe(m * mask)
    col = np.zeros((H, W, 3), np.float32)
    col[:, :, 0], col[:, :, 1], col[:, :, 2] = color
    put(out, col, m * alpha_base)
    return out

def motes(rng, mask, n, color, alpha, r=2.2):
    out = new_canvas()
    ys, xs = np.where(mask > 0.5)
    if len(xs) == 0:
        return out
    for i in range(n):
        cx, cy = float(rng.choice(xs)), float(rng.choice(ys))
        rr = r * rng.uniform(0.6, 1.4)
        m = np.clip((rr - np.hypot(yy - cy, xx - cx)) / 1.4, 0, 1)
        col = np.zeros((H, W, 3), np.float32)
        col[:, :, 0], col[:, :, 1], col[:, :, 2] = color
        put(out, col, m * alpha)
    return out

def grade_from_stops(stops):
    """vertical gradient RGB 1200x900 from [(y0,color),...]"""
    g = np.zeros((H, W, 3), np.float32)
    ys = [s[0] for s in stops]
    cs = np.array([s[1] for s in stops], dtype=np.float32)
    for c in range(3):
        col = np.interp(np.arange(H), ys, cs[:, c])
        g[:, :, c] = col[:, None]
    return g

def radial(center, r, color, peak):
    cx, cy = center
    m = np.clip((r - np.hypot(yy - cy, xx - cx)) / r, 0, 1) ** 1.6
    out = np.zeros((H, W, 3), np.float32)
    for c in range(3):
        out[:, :, c] = color[c] * m * peak
    return out

def save_rgb(a, name):
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(os.path.join(OUT, name))
    print('  ', name)

def save_rgba(a, name):
    """Layers are stored internally PREMULTIPLIED (rgb *= alpha) with alpha in
    0..1. PNG needs STRAIGHT alpha with 0..255 — unpremultiply + rescale, or
    every translucent decal would save with alpha 0 (the invisible-layers bug)."""
    out = np.zeros_like(a)
    al = np.clip(a[:, :, 3], 0.0, 1.0)
    has = al > 1e-4
    for c in range(3):
        out[:, :, c] = np.where(has, np.clip(a[:, :, c] / np.maximum(al, 1e-4), 0, 255), 0)
    out[:, :, 3] = al * 255.0
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA').save(os.path.join(OUT, name))
    print('  ', name)

rng = np.random.default_rng(20261006)
DESIGNS = {}

# ============ 1. mossfloor — Verdant Hall ============
def build_mossfloor():
    ramp = [(0.0, (34, 50, 28)), (0.35, (62, 88, 42)), (0.68, (86, 114, 54)), (1.0, (116, 144, 70))]
    floor_rgb, _ = reskin(FLOOR, ramp)
    det = new_canvas()
    m = safe(FLOOR)
    det[:, :, :3] = floor_rgb * m[..., None]   # premultiplied (straight-alpha conversion at save)
    det[:, :, 3] = m
    extra = blob_field(rng, safe(FLOOR * 0.9), 7, 22, 52, (104, 138, 66), 0.55, rim=(40, 60, 28))
    det = put(det, extra[:, :, :3], extra[:, :, 3])
    cur = blob_field(rng, safe(np.maximum(WBASE_L, WBASE_R) * (1 - FLOOR)), 6, 16, 34, (70, 98, 46), 0.5, rim=(40, 60, 28))
    det = put(det, cur[:, :, :3], cur[:, :, 3])
    grade = grade_from_stops([(0, (188, 205, 176)), (450, (198, 214, 186)), (900, (176, 198, 168))])
    return dict(grade=grade, gradeMode='multiply', detail=det, glow=None)

DESIGNS['mossfloor'] = build_mossfloor

# ============ 2. frost — Frostbound Gallery ============
def build_frost():
    ramp = [(0.0, (88, 102, 118)), (0.4, (140, 154, 170)), (0.75, (192, 204, 216)), (1.0, (226, 232, 240))]
    floor_rgb, _ = reskin(FLOOR, ramp)
    det = new_canvas()
    m = safe(FLOOR)
    det[:, :, :3] = floor_rgb * m[..., None]
    det[:, :, 3] = m
    glaze = blob_field(rng, safe(np.maximum(WBASE_L, WBASE_R) * (1 - FLOOR)), 7, 14, 30, (210, 226, 240), 0.42, rim=(150, 176, 198))
    det = put(det, glaze[:, :, :3], glaze[:, :, 3])
    ice_edges = blob_field(rng, safe(UPPER_WALL * 0.5), 5, 10, 22, (196, 214, 232), 0.30)
    det = put(det, ice_edges[:, :, :3], ice_edges[:, :, 3])
    glow = motes(rng, safe(np.maximum(FLOOR, UPPER_WALL)), 26, (220, 238, 255), 0.5, 1.9)
    grade = grade_from_stops([(0, (170, 188, 214)), (450, (168, 186, 212)), (900, (150, 168, 196))])
    return dict(grade=grade, gradeMode='soft-light', detail=det, glow=glow)

DESIGNS['frost'] = build_frost

# ============ 3. ember — Ember Forge Hall ============
def build_ember():
    ramp = [(0.0, (24, 18, 16)), (0.4, (44, 34, 30)), (0.75, (70, 54, 44)), (1.0, (96, 74, 58))]
    floor_rgb, _ = reskin(FLOOR, ramp)
    det = new_canvas()
    m = safe(FLOOR)
    det[:, :, :3] = floor_rgb * m[..., None]
    det[:, :, 3] = m
    glow = crack_network(rng, safe(FLOOR), 9, (255, 148, 40), 0.85, w=2)
    core = crack_network(rng, safe(FLOOR), 9, (255, 220, 120), 0.9, w=1)
    glow = put(glow, core[:, :, :3], core[:, :, 3])
    # torch halos as additive decal puts (alpha stays consistent until save)
    col_t = np.zeros((H, W, 3), np.float32)
    col_t[:, :, 0], col_t[:, :, 1], col_t[:, :, 2] = (255, 150, 50)
    for (tx, ty) in [(420, 150), (790, 150)]:
        hm = np.clip((130 - np.hypot(yy - ty, xx - tx)) / 130, 0, 1) ** 1.6
        glow = put(glow, col_t, hm * 0.22)
    mot = motes(rng, safe(np.maximum(FLOOR, UPPER_WALL)), 18, (255, 160, 60), 0.4, 1.8)
    glow = put(glow, mot[:, :, :3], mot[:, :, 3])
    grade = grade_from_stops([(0, (216, 170, 130)), (450, (224, 178, 134)), (900, (196, 148, 108))])
    return dict(grade=grade, gradeMode='multiply', detail=det, glow=glow)

DESIGNS['ember'] = build_ember

# ============ 4. sandy — Sand-drifted Vault ============
def build_sandy():
    ramp = [(0.0, (104, 86, 54)), (0.4, (140, 116, 74)), (0.75, (176, 148, 98)), (1.0, (206, 180, 128))]
    floor_rgb, _ = reskin(FLOOR, ramp)
    det = new_canvas()
    m = safe(FLOOR)
    det[:, :, :3] = floor_rgb * m[..., None]
    det[:, :, 3] = m
    drifts = blob_field(rng, safe(np.maximum(BASE_L, BASE_R)), 10, 18, 44, (206, 182, 130), 0.6, rim=(150, 126, 82))
    det = put(det, drifts[:, :, :3], drifts[:, :, 3])
    dust = blob_field(rng, safe(FLOOR * 0.7), 6, 26, 60, (188, 164, 118), 0.18)
    det = put(det, dust[:, :, :3], dust[:, :, 3])
    grade = grade_from_stops([(0, (214, 196, 158)), (450, (218, 200, 162)), (900, (198, 178, 140))])
    return dict(grade=grade, gradeMode='multiply', detail=det, glow=None)

DESIGNS['sandy'] = build_sandy

# ============ 5. flooded — Drowned Cistern ============
def build_flooded():
    ramp = [(0.0, (20, 30, 36)), (0.4, (38, 54, 62)), (0.75, (58, 80, 88)), (1.0, (86, 112, 118))]
    floor_rgb, _ = reskin(FLOOR, ramp)
    det = new_canvas()
    m = safe(FLOOR)
    det[:, :, :3] = floor_rgb * m[..., None]
    det[:, :, 3] = m
    damp = blob_field(rng, safe(np.maximum(WBASE_L, WBASE_R) * (1 - FLOOR)), 8, 14, 30, (30, 48, 54), 0.4)
    det = put(det, damp[:, :, :3], damp[:, :, 3])
    drips = new_canvas()
    img = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(img)
    for i in range(9):
        x = int(rng.uniform(240, 950))
        y0 = int(rng.uniform(30, 90))
        ln = int(rng.uniform(24, 70))
        if abs(x - 600) < 190:
            continue
        d.line([(x, y0), (x + int(rng.uniform(-3, 3)), y0 + ln)], fill=255, width=2)
        d.ellipse([x - 2, y0 + ln - 3, x + 2, y0 + ln + 3], fill=255)
    dm = safe(np.array(img, np.float32) / 255.0 * (1 - FLOOR))
    col = np.zeros((H, W, 3), np.float32)
    col[:, :, 0], col[:, :, 1], col[:, :, 2] = (120, 170, 180)
    put(det, col, dm * 0.4)
    glow = new_canvas()
    img2 = Image.new('L', (W, H), 0)
    d2 = ImageDraw.Draw(img2)
    for i in range(7):
        y = int(rng.uniform(360, 840))
        x0 = int(rng.uniform(120, 700))
        ln = int(rng.uniform(90, 220))
        d2.line([(x0, y), (x0 + ln, y - 6)], fill=255, width=3)
        d2.line([(x0, y + 16), (x0 + ln * 0.6, y + 13)], fill=180, width=2)
    sm = safe(np.array(img2, np.float32) / 255.0 * FLOOR)
    col2 = np.zeros((H, W, 3), np.float32)
    col2[:, :, 0], col2[:, :, 1], col2[:, :, 2] = (140, 200, 210)
    put(glow, col2, sm * 0.35)
    grade = grade_from_stops([(0, (150, 176, 180)), (450, (142, 168, 174)), (900, (122, 146, 154))])
    return dict(grade=grade, gradeMode='multiply', detail=det, glow=glow)

DESIGNS['flooded'] = build_flooded

# ============ 6. blight — Blighted Warren ============
def build_blight():
    det = new_canvas()
    rot = blob_field(rng, safe(FLOOR * 0.85), 9, 20, 48, (74, 88, 44), 0.5, rim=(40, 34, 30))
    det = put(det, rot[:, :, :3], rot[:, :, 3])
    vein = blob_field(rng, safe(np.maximum(WBASE_L, WBASE_R) * (1 - FLOOR)), 7, 12, 26, (96, 70, 104), 0.42, rim=(52, 38, 56))
    det = put(det, vein[:, :, :3], vein[:, :, 3])
    glow = motes(rng, safe(np.maximum(FLOOR, UPPER_WALL) * 0.8), 24, (170, 220, 130), 0.45, 2.0)
    grade = grade_from_stops([(0, (168, 186, 150)), (450, (172, 178, 152)), (900, (160, 158, 140))])
    tint = radial((600, 500), 720, (110, 130, 90), 0.10)
    grade = np.clip(grade * 0.96 + tint * 0.5, 0, 255)
    return dict(grade=grade, gradeMode='multiply', detail=det, glow=glow)

DESIGNS['blight'] = build_blight

# ============ 7. gilded — Gilded Reliquary ============
def build_gilded():
    ramp = [(0.0, (88, 66, 38)), (0.4, (132, 100, 58)), (0.75, (178, 142, 86)), (1.0, (212, 178, 116))]
    floor_rgb, _ = reskin(FLOOR, ramp)
    det = new_canvas()
    m = safe(FLOOR)
    det[:, :, :3] = floor_rgb * m[..., None]
    det[:, :, 3] = m
    glow = new_canvas()
    img = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(img)
    for (mask, x0, x1) in [(UPPER_WALL, 250, 940)]:
        ys2, xs2 = np.where(mask > 0.6)
        for i in range(6):
            x = float(rng.uniform(x0 + 40, x1 - 40))
            y = float(rng.uniform(60, 220))
            pts = [(x, y)]
            ang = rng.uniform(0.6, 2.5)
            cx, cy = x, y
            for k in range(rng.integers(3, 6)):
                ln = rng.uniform(14, 34)
                ang += rng.uniform(-0.9, 0.9)
                cx += math.cos(ang) * ln
                cy += math.sin(ang) * ln * 0.7
                pts.append((cx, cy))
            d.line(pts, fill=255, width=2)
    vm = safe(np.array(img, np.float32) / 255.0 * (1 - FLOOR))
    col = np.zeros((H, W, 3), np.float32)
    col[:, :, 0], col[:, :, 1], col[:, :, 2] = (255, 214, 110)
    put(glow, col, vm * 0.55)
    gl = motes(rng, safe(FLOOR), 20, (255, 226, 140), 0.4, 1.6)
    glow = put(glow, gl[:, :, :3], gl[:, :, 3])
    grade = grade_from_stops([(0, (222, 196, 148)), (450, (228, 204, 156)), (900, (206, 178, 130))])
    return dict(grade=grade, gradeMode='multiply', detail=det, glow=glow)

DESIGNS['gilded'] = build_gilded

# ============ 8. hallowed — Skill Sanctum ============
def build_hallowed():
    det = new_canvas()
    glow = new_canvas()
    cx, cy = 600, 600
    img = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(img)
    for r, w in [(140, 4), (108, 2), (64, 3)]:
        d.ellipse([cx - r, int(cy - r * 0.52), cx + r, int(cy + r * 0.52)], outline=255, width=w)
    for k in range(12):
        a = k * math.pi / 6
        x0 = cx + math.cos(a) * 108
        y0 = cy + math.sin(a) * 108 * 0.52
        x1 = cx + math.cos(a) * 140
        y1 = cy + math.sin(a) * 140 * 0.52
        d.line([(x0, y0), (x1, y1)], fill=255, width=2)
    for k in range(8):
        a = k * math.pi / 4 + 0.3
        x0 = cx + math.cos(a) * 40
        y0 = cy + math.sin(a) * 40 * 0.52
        x1 = cx + math.cos(a) * 64
        y1 = cy + math.sin(a) * 64 * 0.52
        d.line([(x0, y0), (x1, y1)], fill=255, width=3)
    sm = safe(np.array(img, np.float32) / 255.0 * FLOOR)
    col = np.zeros((H, W, 3), np.float32)
    col[:, :, 0], col[:, :, 1], col[:, :, 2] = (255, 236, 170)
    put(det, col, sm * 0.42)
    img2 = Image.new('L', (W, H), 0)
    d2 = ImageDraw.Draw(img2)
    for i, x in enumerate([330, 480, 720, 870]):
        d2.polygon([(x, 28), (x + 70, 28), (x + 130, 560), (x + 30, 560)], fill=90 + i * 20)
    sh = np.array(img2, np.float32) / 255.0
    col2 = np.zeros((H, W, 3), np.float32)
    col2[:, :, 0], col2[:, :, 1], col2[:, :, 2] = (255, 244, 210)
    put(glow, col2, sh * 0.26)
    mot = motes(rng, safe(np.maximum(FLOOR, UPPER_WALL)), 16, (255, 240, 190), 0.4, 1.8)
    glow = put(glow, mot[:, :, :3], mot[:, :, 3])
    grade = grade_from_stops([(0, (226, 222, 208)), (450, (230, 226, 210)), (900, (214, 208, 190))])
    return dict(grade=grade, gradeMode='soft-light', detail=det, glow=glow)

DESIGNS['hallowed'] = build_hallowed

# ============ 9. crimson — Blood-dimmed Shrine ============
def build_crimson():
    det = new_canvas()
    stain = blob_field(rng, safe(FLOOR * 0.9), 6, 24, 54, (74, 22, 20), 0.35, rim=(40, 12, 12))
    det = put(det, stain[:, :, :3], stain[:, :, 3])
    grade = grade_from_stops([(0, (196, 140, 132)), (450, (204, 142, 132)), (900, (172, 110, 104))])
    vig = 1 - np.clip(np.hypot((xx - 600) / 760.0, (yy - 430) / 560.0), 0, 1) ** 2 * 0.55
    grade *= vig[..., None]
    return dict(grade=grade, gradeMode='multiply', detail=det, glow=None)

DESIGNS['crimson'] = build_crimson

# ============ 10. arcane — Ley-touched Sanctum ============
def build_arcane():
    det = new_canvas()
    glow = new_canvas()
    img = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(img)
    cx, cy = 600, 620
    for k in range(7):
        a = k * 2 * math.pi / 7
        x0 = cx + math.cos(a) * 120
        y0 = cy + math.sin(a) * 120 * 0.5
        x1 = cx + math.cos(a + 2 * math.pi * 2 / 7) * 120
        y1 = cy + math.sin(a + 2 * math.pi * 2 / 7) * 120 * 0.5
        d.line([(x0, y0), (x1, y1)], fill=255, width=2)
    d.ellipse([cx - 120, int(cy - 60), cx + 120, int(cy + 60)], outline=255, width=2)
    gm = safe(np.array(img, np.float32) / 255.0 * FLOOR)
    col = np.zeros((H, W, 3), np.float32)
    col[:, :, 0], col[:, :, 1], col[:, :, 2] = (178, 138, 255)
    put(glow, col, gm * 0.62)
    img2 = Image.new('L', (W, H), 0)
    d2 = ImageDraw.Draw(img2)
    for (mx, my) in [(120, 640), (240, 700), (960, 660), (1080, 610), (350, 240), (850, 250)]:
        d2.line([(mx, my - 10), (mx, my + 10)], fill=255, width=2)
        d2.line([(mx - 7, my - 4), (mx + 7, my - 4)], fill=255, width=2)
        d2.line([(mx - 5, my + 5), (mx + 5, my + 5)], fill=255, width=2)
    gm2 = safe(np.array(img2, np.float32) / 255.0)
    put(glow, col, gm2 * 0.55)
    mot = motes(rng, safe(np.maximum(FLOOR, UPPER_WALL)), 22, (196, 160, 255), 0.45, 1.9)
    glow = put(glow, mot[:, :, :3], mot[:, :, 3])
    grade = grade_from_stops([(0, (186, 174, 222)), (450, (180, 170, 218)), (900, (162, 154, 204))])
    return dict(grade=grade, gradeMode='multiply', detail=det, glow=glow)

DESIGNS['arcane'] = build_arcane

# ---------- write ----------
print('== building design layers ==')
for name, fn in DESIGNS.items():
    d = fn()
    save_rgb(d['grade'], f'v_{name}_grade.png')
    save_rgba(d['detail'], f'v_{name}_detail.png')
    if d['glow'] is not None:
        save_rgba(d['glow'], f'v_{name}_glow.png')
    print(f'   {name}: gradeMode={d["gradeMode"]}')

# ---------- QA previews: composite over plate_LFR ----------
def blend(back, top, mode):
    a = back / 255.0
    b = np.clip(top, 0, 255) / 255.0
    if mode == 'multiply':
        r = a * b
    elif mode == 'screen':
        r = 1 - (1 - a) * (1 - b)
    elif mode == 'soft-light':
        r = np.where(b <= 0.5, a - (1 - 2 * b) * a * (1 - a), a + (2 * b - 1) * ((np.sqrt(a) if False else a ** 0.5) - a))
        r = np.where(b <= 0.5, a - (1 - 2 * b) * a * (1 - a), a + (2 * b - 1) * (a ** 0.5 - a))
    else:
        r = b
    return np.clip(r * 255, 0, 255)

base = Image.open(os.path.join(RUINS, 'ruins_door_LFR.png')).convert('RGB')
sheet = Image.new('RGB', (1250 * 2, 480 * 5), (12, 10, 8))
from PIL import ImageFont
order = ['mossfloor', 'frost', 'ember', 'sandy', 'flooded', 'blight', 'gilded', 'hallowed', 'crimson', 'arcane']
tiles = []
for name in order:
    arr = np.array(base, dtype=np.float32)
    g = np.array(Image.open(os.path.join(OUT, f'v_{name}_grade.png')).convert('RGB'), dtype=np.float32)
    arr = blend(arr, g, DESIGNS[name]()['gradeMode'])
    dt = Image.open(os.path.join(OUT, f'v_{name}_detail.png')).convert('RGBA')
    dta = np.array(dt, dtype=np.float32)
    al = dta[:, :, 3:4] / 255.0
    arr = arr * (1 - al) + dta[:, :, :3] * al
    gl_path = os.path.join(OUT, f'v_{name}_glow.png')
    if os.path.exists(gl_path):
        gl = np.array(Image.open(gl_path).convert('RGBA'), dtype=np.float32)
        alg = gl[:, :, 3:4] / 255.0
        arr = blend(arr, gl[:, :, :3] * alg, 'screen')
    tiles.append(Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).resize((610, 460)))
for i, t in enumerate(tiles):
    sheet.paste(t, (10 + (i % 2) * 1250, 10 + (i // 2) * 480))
sheet.save(os.path.join(QA, 'design_sheet_1.png'))
print('QA sheet: qa_art/design_sheet_1.png')
