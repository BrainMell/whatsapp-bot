"""iso3d.py - headless multi-model isometric rasteriser for the homestead interior.

Unlike kk_raster.py (one KayKit model -> one sprite) this renders a WHOLE ROOM
in a single pass, so lofts/stairs/furniture occlude each other correctly and
cast real shadows onto each other:

  1. visibility pass   - z-buffer keeps the nearest triangle id per sample
  2. shadow pass       - same rasteriser from the sun's point of view
  3. shading pass      - per-pixel barycentric UV -> texture, Lambert + ambient
                         + shadow-map lookup + ambient-occlusion-ish floor falloff

Z is UP. Camera: classic iso looking toward (-x,+y), so the far walls are x=-W/2
(left) and y=+D/2 (right) - the same framing as the owner's reference image.
No GPU/GL: numpy + Pillow + trimesh only (same toolchain as the kingdom bake).
"""
import math
import numpy as np
import trimesh
from PIL import Image

EL = math.radians(33.0)                       # camera elevation
_R = np.array([0.70710678, 0.70710678, 0.0])  # screen right
_D = np.array([-math.cos(EL) * 0.70710678, math.cos(EL) * 0.70710678, -math.sin(EL)])  # view dir
_U = np.cross(_R, _D)                         # screen up
SUN = np.array([-0.38, -0.62, 0.69]); SUN /= np.linalg.norm(SUN)   # towards the sun


class Mesh:
    """flattened triangle soup with per-triangle material info"""
    def __init__(self):
        self.v = []      # (n,3,3)
        self.uv = []     # (n,3,2)
        self.mat = []    # (n,) material ids
        self.mats = []   # list of dict(color=(3,), tex=ndarray|None)
        self.tag = []

    def add_model(self, path, pos=(0, 0, 0), yaw=0.0, scale=1.0, tint=None, tex=True, sz=None, clip=None, zmin=None, tint_white=None):
        sc = trimesh.load(path, force='scene', process=False)
        yawr = math.radians(yaw)
        c, s = math.cos(yawr), math.sin(yawr)
        Rz = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
        sc3 = np.array(scale if hasattr(scale, '__len__') else [scale, scale, scale if sz is None else sz], dtype=float)
        for g in sc.dump():
            verts = np.asarray(g.vertices, float)
            faces = np.asarray(g.faces)
            w = (verts * sc3) @ Rz.T + np.array(pos, float)
            keep = np.ones(len(faces), bool)
            if zmin is not None:      # drop stilts/legs below a height
                keep &= w[faces][:, :, 2].max(axis=1) > zmin
            if clip is not None:      # (xmin,xmax,ymin,ymax) on triangle centroids
                cen = w[faces].mean(axis=1)
                keep &= (cen[:, 0] >= clip[0]) & (cen[:, 0] <= clip[1]) & (cen[:, 1] >= clip[2]) & (cen[:, 1] <= clip[3])
            faces = faces[keep]
            tri = w[faces]
            vis = g.visual
            mat = getattr(vis, 'material', None)
            color = np.array([0.6, 0.6, 0.6])
            tarr = None
            uvs = None
            if mat is not None and hasattr(mat, 'baseColorFactor') and mat.baseColorFactor is not None:
                color = np.array(mat.baseColorFactor[:3], float) / 255.0
                img = getattr(mat, 'baseColorTexture', None)
                if tex and img is not None and getattr(vis, 'uv', None) is not None:
                    tarr = np.asarray(img.convert('RGB'), float) / 255.0
                    uvs = np.asarray(vis.uv, float)[faces]
            elif hasattr(vis, 'face_colors') and vis.face_colors is not None and len(vis.face_colors):
                fc = np.asarray(vis.face_colors, float)[:, :3] / 255.0
                color = fc.mean(axis=0) if len(set(map(tuple, fc.round(3)))) == 1 else None
                if color is None:  # per-face colours -> one material per distinct colour
                    for col in np.unique(fc.round(3), axis=0):
                        m = np.all(fc.round(3) == col, axis=1)
                        self._push(tri[m], None, col, None, tint)
                    continue
            if tint_white is not None and color is not None and np.min(color) > 0.7:
                color = color * np.array(tint_white, float)
            self._push(tri, uvs, color, tarr, tint)
        return self

    def add_box(self, center, size, color, yaw=0.0, tint=None):
        cx, cy, cz = center
        sx, sy, sz = (np.array(size, float) / 2)
        c = np.array([[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], float) * [sx, sy, sz]
        yr = math.radians(yaw); co, si = math.cos(yr), math.sin(yr)
        c = c @ np.array([[co, -si, 0], [si, co, 0], [0, 0, 1]]).T + [cx, cy, cz]
        quads = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        tri = np.array([[c[a], c[b], c[d]] for a, b, d, e in quads for (a, b, d) in ((a, b, d), (a, d, e))])
        self._push(tri, None, np.array(color, float) / (255.0 if max(color) > 1 else 1.0), None, tint)
        return self

    def _push(self, tri, uvs, color, tarr, tint):
        n = len(tri)
        if n == 0:
            return
        col = np.array(color, float)
        if tint is not None:
            col = col * np.array(tint, float)
        self.v.append(tri)
        self.uv.append(uvs if uvs is not None else np.zeros((n, 3, 2)))
        self.mats.append(dict(color=col, tex=tarr))
        self.mat.append(np.full(n, len(self.mats) - 1))

    def finalize(self):
        self.V = np.concatenate(self.v)
        self.UV = np.concatenate(self.uv)
        self.M = np.concatenate(self.mat)
        a = self.V[:, 1] - self.V[:, 0]
        b = self.V[:, 2] - self.V[:, 0]
        nrm = np.cross(a, b)
        ln = np.linalg.norm(nrm, axis=1, keepdims=True)
        self.N = nrm / np.maximum(ln, 1e-9)
        return self


def _raster_ids(P, W, H, cull=None):
    """P: (n,3,3) screen x, screen y(down), depth. -> id buffer (H,W), depth (H,W)"""
    zb = np.full((H, W), np.inf)
    ib = np.full((H, W), -1, np.int32)
    for i in range(len(P)):
        t = P[i]
        x0 = max(int(math.floor(t[:, 0].min())), 0); x1 = min(int(math.ceil(t[:, 0].max())) + 1, W)
        y0 = max(int(math.floor(t[:, 1].min())), 0); y1 = min(int(math.ceil(t[:, 1].max())) + 1, H)
        if x1 <= x0 or y1 <= y0:
            continue
        d = (t[1, 1] - t[2, 1]) * (t[0, 0] - t[2, 0]) + (t[2, 0] - t[1, 0]) * (t[0, 1] - t[2, 1])
        if abs(d) < 1e-9:
            continue
        xs = np.arange(x0, x1) + 0.5
        ys = np.arange(y0, y1)[:, None] + 0.5
        l0 = ((t[1, 1] - t[2, 1]) * (xs - t[2, 0]) + (t[2, 0] - t[1, 0]) * (ys - t[2, 1])) / d
        l1 = ((t[2, 1] - t[0, 1]) * (xs - t[2, 0]) + (t[0, 0] - t[2, 0]) * (ys - t[2, 1])) / d
        l2 = 1 - l0 - l1
        inside = (l0 >= -1e-6) & (l1 >= -1e-6) & (l2 >= -1e-6)
        if not inside.any():
            continue
        z = l0 * t[0, 2] + l1 * t[1, 2] + l2 * t[2, 2]
        sub = zb[y0:y1, x0:x1]
        win = inside & (z < sub)
        sub[win] = z[win]
        ib[y0:y1, x0:x1][win] = i
    return ib, zb


def _bary(P, ids, X, Y):
    t = P[ids]
    d = (t[:, 1, 1] - t[:, 2, 1]) * (t[:, 0, 0] - t[:, 2, 0]) + (t[:, 2, 0] - t[:, 1, 0]) * (t[:, 0, 1] - t[:, 2, 1])
    d = np.where(np.abs(d) < 1e-12, 1e-12, d)
    l0 = ((t[:, 1, 1] - t[:, 2, 1]) * (X - t[:, 2, 0]) + (t[:, 2, 0] - t[:, 1, 0]) * (Y - t[:, 2, 1])) / d
    l1 = ((t[:, 2, 1] - t[:, 0, 1]) * (X - t[:, 2, 0]) + (t[:, 0, 0] - t[:, 2, 0]) * (Y - t[:, 2, 1])) / d
    return l0, l1, 1 - l0 - l1


def render(mesh, W=1600, H=1500, scale=150.0, origin=(0, 0, 0), ss=2, bg=(18, 20, 26),
           ambient=0.52, diffuse=0.62, shadows=True, warm=(1.0, 0.93, 0.82), cool=(0.80, 0.86, 1.0)):
    """origin = world point mapped to the canvas anchor (cx, cy)."""
    S = ss
    w, h = W * S, H * S
    sc = scale * S
    o = np.array(origin, float)
    rel = mesh.V - o
    sx = rel @ _R * sc + w * 0.5
    sy = -(rel @ _U) * sc + h * 0.56
    sd = rel @ _D
    P = np.stack([sx, sy, sd], -1)
    ib, zb = _raster_ids(P, w, h)

    # shadow pass: orthographic from the sun
    shadow_ok = None
    if shadows:
        Ls = SUN
        up = np.array([0.0, 0.0, 1.0])
        sr = np.cross(up, Ls); sr /= np.linalg.norm(sr)
        su = np.cross(Ls, sr)
        res = int(max(w, h) * 0.9)
        lsx = rel @ sr * (sc * 0.9) + res * 0.5
        lsy = -(rel @ su) * (sc * 0.9) + res * 0.5
        lsd = -(rel @ Ls)    # smaller = closer to the sun
        PL = np.stack([lsx, lsy, lsd], -1)
        _, zl = _raster_ids(PL, res, res)

    ys, xs = np.nonzero(ib >= 0)
    ids = ib[ys, xs]
    X = xs + 0.5
    Y = ys + 0.5
    l0, l1, l2 = _bary(P, ids, X, Y)
    wp = (mesh.V[ids] * np.stack([l0, l1, l2], -1)[..., None]).sum(1)

    col = np.zeros((len(ids), 3))
    M = mesh.M[ids]
    for m in np.unique(M):
        sel = M == m
        mt = mesh.mats[m]
        base = np.tile(mt['color'], (sel.sum(), 1))
        if mt['tex'] is not None:
            uv = (mesh.UV[ids[sel]] * np.stack([l0[sel], l1[sel], l2[sel]], -1)[..., None]).sum(1)
            T = mt['tex']
            u = (uv[:, 0] % 1.0) * (T.shape[1] - 1)
            v = ((1 - uv[:, 1]) % 1.0) * (T.shape[0] - 1)
            tc = T[v.round().astype(int), u.round().astype(int)]
            # pack textures are near-white grain maps: glTF rule, factor x texture
            base = np.clip(base * tc * 1.08, 0, 1)
        col[sel] = base

    n = mesh.N[ids]
    # faces are double-sided: flip to face the camera
    flip = (n @ _D) > 0
    n = np.where(flip[:, None], -n, n)
    lam = np.clip(n @ SUN, 0, 1)
    lit = np.ones(len(ids))
    if shadows:
        rel_p = wp - o
        lx = rel_p @ sr * (sc * 0.9) + res * 0.5
        ly = -(rel_p @ su) * (sc * 0.9) + res * 0.5
        ld = -(rel_p @ Ls)
        ix = np.clip(lx.astype(int), 0, res - 1)
        iy = np.clip(ly.astype(int), 0, res - 1)
        blocked = zl[iy, ix] < ld - 0.045
        lit = np.where(blocked, 0.0, 1.0)
        # soften: 3x3 box over the light-space occupancy is costly; blur result image later
    sun = warm
    amb = cool
    # hemisphere ambient: up-facing receives more sky
    skyk = 0.65 + 0.35 * np.clip(n[:, 2], 0, 1)
    light = (np.array(amb)[None] * (ambient * skyk)[:, None]) + np.array(sun)[None] * (diffuse * (lam * lit))[:, None]
    # AO-ish: darken the floor near the base of walls/furniture by height
    ao = np.clip(0.80 + 0.20 * np.clip(wp[:, 2] / 0.5, 0, 1), 0.8, 1.0)
    out = np.clip(col * light * ao[:, None], 0, 1)

    img = np.zeros((h, w, 3), float)
    img[...] = np.array(bg) / 255.0
    cov = np.zeros((h, w), float)
    img[ys, xs] = out
    cov[ys, xs] = 1.0
    im = Image.fromarray((img * 255).astype(np.uint8))
    im = im.resize((W, H), Image.LANCZOS)
    return im
