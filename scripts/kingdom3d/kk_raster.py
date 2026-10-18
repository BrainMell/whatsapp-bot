"""kk_raster.py - tiny headless software rasteriser for KayKit glTF models.

No GPU / GL needed: orthographic camera, z-buffer, Lambert shading from the
KayKit gradient-atlas colours, 3x supersampled anti-aliasing and a projected
ground shadow.  Output sprites are what the Node compositor
(core/rpg/kingdom3d.js) draws at runtime, so the bot never touches 3D.

Camera (matches the KayKit promo shots): looks from +Z, tilted down by PITCH.
  screen_x  = x
  screen_up = y*cos(p) - z*sin(p)        (farther = higher on screen)
  depth     = z*cos(p) + y*sin(p)        (bigger = closer to camera)
A model's world origin (hex centre, top surface) projects to the sprite anchor.
"""
import math
import numpy as np
import trimesh
from PIL import Image, ImageFilter

PITCH = 40.0
LIGHT = np.array([-0.50, 0.78, 0.42])   # direction TOWARDS the sun (x left, y up, z to camera)
LIGHT = LIGHT / np.linalg.norm(LIGHT)
AMBIENT = 0.62
DIFFUSE = 0.52


class Atlas:
    def __init__(self, path):
        self.tex = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
        self.h, self.w = self.tex.shape[:2]

    def sample(self, uv):
        u = np.clip(uv[..., 0], 0, 1) * (self.w - 1)
        v = (1 - np.clip(uv[..., 1], 0, 1)) * (self.h - 1)
        return self.tex[v.round().astype(int), u.round().astype(int)]


def load_model(path, atlas):
    """-> dict(v:(N,3,3) tri verts, c:(N,3,3) per-vertex RGB, n:(N,3,3) normals)."""
    scene = trimesh.load(path, force='scene', process=False)
    vs, cs, ns = [], [], []
    for m in scene.dump(concatenate=False):
        f = np.asarray(m.faces)
        v = np.asarray(m.vertices, dtype=np.float64)
        uv = np.asarray(getattr(m.visual, 'uv', None))
        if uv is None or uv.ndim != 2:
            col = np.full((len(v), 3), 180.0, dtype=np.float32)
        else:
            col = atlas.sample(uv)
        n = np.asarray(m.vertex_normals, dtype=np.float64)
        vs.append(v[f]); cs.append(col[f]); ns.append(n[f])
    return dict(v=np.concatenate(vs), c=np.concatenate(cs), n=np.concatenate(ns))


def rot_y(deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def transform(model, yaw=0.0, scale=1.0):
    r = rot_y(yaw)
    out = dict(model)
    out['v'] = (model['v'] @ r.T) * scale
    out['n'] = model['n'] @ r.T
    return out


def project(v, pitch=PITCH):
    p = math.radians(pitch)
    cp, sp = math.cos(p), math.sin(p)
    x = v[..., 0]
    up = v[..., 1] * cp - v[..., 2] * sp
    d = v[..., 2] * cp + v[..., 1] * sp
    return x, up, d


def _raster(tris_xy, tris_d, tris_col, W, H, color, depth, cover=None):
    """Fill triangles into (H,W) buffers.  tris_xy (N,3,2) pixel coords."""
    for i in range(len(tris_xy)):
        t = tris_xy[i]
        x0, y0 = t[0]; x1, y1 = t[1]; x2, y2 = t[2]
        minx = max(int(math.floor(min(x0, x1, x2))), 0)
        maxx = min(int(math.ceil(max(x0, x1, x2))), W - 1)
        miny = max(int(math.floor(min(y0, y1, y2))), 0)
        maxy = min(int(math.ceil(max(y0, y1, y2))), H - 1)
        if minx > maxx or miny > maxy:
            continue
        den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(den) < 1e-9:
            continue
        xs = np.arange(minx, maxx + 1) + 0.5
        ys = np.arange(miny, maxy + 1) + 0.5
        gx, gy = np.meshgrid(xs, ys)
        l0 = ((y1 - y2) * (gx - x2) + (x2 - x1) * (gy - y2)) / den
        l1 = ((y2 - y0) * (gx - x2) + (x0 - x2) * (gy - y2)) / den
        l2 = 1 - l0 - l1
        eps = -1e-4
        inside = (l0 >= eps) & (l1 >= eps) & (l2 >= eps)
        if not inside.any():
            continue
        d = l0 * tris_d[i][0] + l1 * tris_d[i][1] + l2 * tris_d[i][2]
        sub = depth[miny:maxy + 1, minx:maxx + 1]
        win = inside & (d > sub)
        if not win.any():
            continue
        sub[win] = d[win]
        if color is not None:
            col = (l0[..., None] * tris_col[i][0] + l1[..., None] * tris_col[i][1]
                   + l2[..., None] * tris_col[i][2])
            color[miny:maxy + 1, minx:maxx + 1][win] = col[win]
        if cover is not None:
            cover[miny:maxy + 1, minx:maxx + 1][win] = 1.0


def shade(model):
    """Per-vertex lit colours (N,3,3)."""
    n = model['n']
    nl = np.linalg.norm(n, axis=-1, keepdims=True)
    n = n / np.where(nl < 1e-9, 1, nl)
    lam = np.clip((n * LIGHT).sum(-1), 0, 1)[..., None]
    k = AMBIENT + DIFFUSE * lam
    return np.clip(model['c'] * k, 0, 255)


def render(model, S=96, ss=3, pitch=PITCH, shadow=True, pad=3):
    """Return (sprite RGBA PIL, shadow RGBA PIL or None, meta)."""
    sx, sup, dep = project(model['v'], pitch)
    lit = shade(model)
    minx, maxx = sx.min(), sx.max()
    miny, maxy = (-sup).min(), (-sup).max()      # pixel y grows downward
    pxs = ss * S
    ox = -minx * pxs + pad * ss
    oy = -miny * pxs + pad * ss
    W = int(math.ceil((maxx - minx) * pxs + 2 * pad * ss))
    H = int(math.ceil((maxy - miny) * pxs + 2 * pad * ss))
    W += (-W) % ss; H += (-H) % ss
    xy = np.stack([sx * pxs + ox, -sup * pxs + oy], -1)
    color = np.zeros((H, W, 3), np.float32)
    depth = np.full((H, W), -1e9, np.float32)
    cover = np.zeros((H, W), np.float32)
    _raster(xy, dep, lit, W, H, color, depth, cover)
    # supersample down (premultiplied)
    w, h = W // ss, H // ss
    a = cover.reshape(h, ss, w, ss).mean((1, 3))
    c = (color * cover[..., None]).reshape(h, ss, w, ss, 3).mean((1, 3))
    c = np.where(a[..., None] > 1e-4, c / np.maximum(a[..., None], 1e-4), 0)
    rgba = np.dstack([np.clip(c, 0, 255), a * 255]).astype(np.uint8)
    sprite = Image.fromarray(rgba, 'RGBA')
    meta = dict(w=w, h=h, ax=ox / ss, ay=oy / ss)
    shim = None
    if shadow:
        v = model['v']
        # project every vertex onto y=0 along the light direction
        t = v[..., 1] / LIGHT[1]
        gv = v - LIGHT * t[..., None]
        gv[..., 1] = 0
        gx, gup, _ = project(gv, pitch)
        gy = -gup
        smin_x, smax_x = gx.min(), gx.max()
        smin_y, smax_y = gy.min(), gy.max()
        sp = 4
        sox = -smin_x * S * sp + 8 * sp
        soy = -smin_y * S * sp + 8 * sp
        SW = int(math.ceil((smax_x - smin_x) * S * sp + 16 * sp))
        SH = int(math.ceil((smax_y - smin_y) * S * sp + 16 * sp))
        if SW * SH < 40_000_000:
            sxy = np.stack([gx * S * sp + sox, gy * S * sp + soy], -1)
            sd = np.zeros(sxy.shape[:2], np.float32)
            sc = np.zeros((SH, SW), np.float32)
            sdepth = np.full((SH, SW), -1e9, np.float32)
            _raster(sxy, sd, None, SW, SH, None, sdepth, sc)
            sm = Image.fromarray((sc * 255).astype(np.uint8), 'L')
            sm = sm.resize((max(1, SW // sp), max(1, SH // sp)), Image.BOX)
            sm = sm.filter(ImageFilter.GaussianBlur(S * 0.035))
            arr = np.asarray(sm).astype(np.float32)
            out = np.zeros(arr.shape + (4,), np.uint8)
            out[..., 0:3] = (20, 24, 48)
            out[..., 3] = np.clip(arr * 0.42, 0, 255).astype(np.uint8)
            shim = Image.fromarray(out, 'RGBA')
            meta['sh'] = dict(w=shim.width, h=shim.height, ax=sox / sp, ay=soy / sp)
    return sprite, shim, meta


def crop_alpha(img, meta, thr=2):
    """Trim transparent border, keep anchor consistent."""
    a = np.asarray(img)[..., 3]
    ys, xs = np.where(a > thr)
    if len(xs) == 0:
        return img, meta
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    m = dict(meta)
    m.update(w=int(x1 - x0), h=int(y1 - y0), ax=meta['ax'] - x0, ay=meta['ay'] - y0)
    return img.crop((x0, y0, x1, y1)), m


def sample_top_color(model, x, z, ymin=-0.6):
    """Colour of the highest surface at world (x,z) (brute force barycentric)."""
    v = model['v']; c = model['c']
    best = None
    for i in range(len(v)):
        t = v[i]
        x0, z0 = t[0][0], t[0][2]; x1, z1 = t[1][0], t[1][2]; x2, z2 = t[2][0], t[2][2]
        den = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2)
        if abs(den) < 1e-9:
            continue
        l0 = ((z1 - z2) * (x - x2) + (x2 - x1) * (z - z2)) / den
        l1 = ((z2 - z0) * (x - x2) + (x0 - x2) * (z - z2)) / den
        l2 = 1 - l0 - l1
        if min(l0, l1, l2) < -1e-6:
            continue
        y = l0 * t[0][1] + l1 * t[1][1] + l2 * t[2][1]
        if y < ymin:
            continue
        if best is None or y > best[0]:
            best = (y, l0 * c[i][0] + l1 * c[i][1] + l2 * c[i][2])
    return None if best is None else best[1]
