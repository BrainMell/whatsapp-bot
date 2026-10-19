"""houses.py - procedural low-poly houses in the KayKit Medieval Hexagon look
(cream plaster, brown timber, saturated roofs, grey stone chimneys).

The Hexagon pack only ships two cottage shapes (home_A / home_B), so every
village looked cloned.  These meshes are authored here (pure numpy, same
dict(v,n,c) model format as kk_raster.load_model) and baked by
bake_kingdom_sprites.py exactly like the pack models.

Conventions: y up, +z towards the camera (front of the house), hex centre at
the origin, ground at y=0.  A cottage is ~0.8-1.1 units wide (home_A: 0.8).

  HOUSES[kind] -> list of roof colour names;   make_house(kind, roof) -> model
"""
import math
import numpy as np

PLASTER = (238, 228, 208)
PLASTER_D = (222, 206, 178)
TIMBER = (124, 82, 52)
TIMBER_D = (96, 64, 42)
STONE = (134, 134, 142)
STONE_D = (98, 98, 108)
SLATE = (84, 94, 112)
DOOR = (146, 96, 58)
GLASS = (64, 78, 104)
HAY = (222, 186, 92)
BARN = (168, 74, 52)
ROOFS = {
    'red': (212, 56, 50), 'green': (40, 152, 98), 'blue': (62, 104, 192),
    'orange': (214, 118, 58), 'slate': SLATE, 'thatch': (214, 178, 88),
    'moss': (122, 156, 78), 'brown': (120, 84, 62), 'plum': (136, 64, 120),
}

# kind -> roof colour variants that get baked (house_<kind>_<roof>)
HOUSES = {
    'cottage': ['red', 'green', 'blue', 'orange'],
    'townhouse': ['red', 'blue', 'orange', 'plum'],
    'tudor': ['green', 'red', 'orange'],
    'stone': ['slate', 'red', 'green'],
    'roundhut': ['thatch', 'moss'],
    'barn': ['brown', 'red'],
    'shop': ['red', 'blue', 'green'],
}


# ── mesh primitives (list of (tri_verts(3,3), normal(3), colour(3))) ──────────
class Mesh:
    def __init__(self):
        self.t = []

    def poly(self, pts, col, centre):
        """convex polygon, normal oriented away from `centre`."""
        p = [np.array(q, float) for q in pts]
        n = np.cross(p[1] - p[0], p[2] - p[0])
        ln = np.linalg.norm(n)
        if ln < 1e-9:
            return
        n = n / ln
        mid = sum(p) / len(p)
        if np.dot(n, mid - np.array(centre, float)) < 0:
            n = -n
        for i in range(1, len(p) - 1):
            self.t.append((np.array([p[0], p[i], p[i + 1]]), n, np.array(col, float)))

    def box(self, x0, x1, y0, y1, z0, z1, col, top=None, front=None):
        c = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
        q = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        for idx, cc in (((0, 3, 2, 1), col), ((4, 5, 6, 7), front or col), ((0, 4, 7, 3), col),
                        ((1, 2, 6, 5), col), ((3, 7, 6, 2), top or col), ((0, 1, 5, 4), col)):
            self.poly([q[i] for i in idx], cc, c)

    def gable(self, x0, x1, z0, z1, y_eave, y_ridge, roof, wall, over=0.09, axis='x', trim=TIMBER):
        """gable roof with eave overhang + wall-coloured gable ends. axis 'x': ridge runs along x."""
        if axis == 'z':                                   # build along x then swap axes (x<->z)
            sub = Mesh()
            sub.gable(z0, z1, x0, x1, y_eave, y_ridge, roof, wall, over, 'x', trim)
            for v, n, c in sub.t:
                v2 = v[:, [2, 1, 0]]; n2 = n[[2, 1, 0]]
                self.t.append((v2, n2, c))
            return
        zm = (z0 + z1) / 2
        ctr = ((x0 + x1) / 2, (y_eave + y_ridge) / 2 - 0.05, zm)
        rx0, rx1 = x0 - over * 0.5, x1 + over * 0.5
        rz0, rz1 = z0 - over, z1 + over
        ye = y_eave - over * 0.45
        nb = 7                                            # tile rows: alternating shade bands up the slope
        for zs, ze in ((rz0, rz0), (rz1, rz1)):
            for b in range(nb):
                f0, f1 = b / nb, (b + 1) / nb
                za = zs + (zm - zs) * f0; zb = zs + (zm - zs) * f1
                ya = ye + (y_ridge - ye) * f0; yb = ye + (y_ridge - ye) * f1
                sh = tuple(min(255, v * (0.90 if b % 2 else 1.04)) for v in roof)
                self.poly([(rx0, ya, za), (rx1, ya, za), (rx1, yb, zb), (rx0, yb, zb)], sh, ctr)
        for xx in (x0, x1):                               # gable-end triangles
            self.poly([(xx, y_eave, z0), (xx, y_eave, z1), (xx, y_ridge - 0.02, zm)], wall, ctr)
        # ridge cap + eave fascia (thin timber boards so the roof reads as a slab)
        self.box(rx0, rx1, y_ridge - 0.01, y_ridge + 0.025, zm - 0.025, zm + 0.025, trim)
        self.box(rx0, rx1, ye - 0.025, ye + 0.012, rz0 - 0.005, rz0 + 0.02, trim)
        self.box(rx0, rx1, ye - 0.025, ye + 0.012, rz1 - 0.02, rz1 + 0.005, trim)

    def cone(self, r_base, y0, y1, n, col, shade=0.0):
        ctr = (0, (y0 + y1) / 2 - 0.05, 0)
        for i in range(n):
            a0 = 2 * math.pi * i / n; a1 = 2 * math.pi * (i + 1) / n
            c2 = tuple(min(255, max(0, v * (1 + shade * (1 if i % 2 else -1)))) for v in col)
            self.poly([(r_base * math.cos(a0), y0, r_base * math.sin(a0)), (r_base * math.cos(a1), y0, r_base * math.sin(a1)), (0, y1, 0)], c2, ctr)

    def prism(self, r, y0, y1, n, col):
        ctr = (0, (y0 + y1) / 2, 0)
        for i in range(n):
            a0 = 2 * math.pi * (i + 0.5) / n; a1 = 2 * math.pi * (i + 1.5) / n
            p0 = (r * math.cos(a0), r * math.sin(a0)); p1 = (r * math.cos(a1), r * math.sin(a1))
            self.poly([(p0[0], y0, p0[1]), (p1[0], y0, p1[1]), (p1[0], y1, p1[1]), (p0[0], y1, p0[1])], col if i % 2 else PLASTER_D, ctr)

    def build(self):
        v = np.array([t[0] for t in self.t]); n = np.array([[t[1]] * 3 for t in self.t])
        c = np.array([[t[2]] * 3 for t in self.t])
        return dict(v=v, n=n, c=c)


def _window(m, x, y, z, w=0.075, h=0.095, side='front'):
    if side == 'front':
        m.box(x - w / 2 - 0.014, x + w / 2 + 0.014, y - h / 2 - 0.014, y + h / 2 + 0.014, z, z + 0.012, TIMBER)
        m.box(x - w / 2, x + w / 2, y - h / 2, y + h / 2, z, z + 0.022, GLASS)
        m.box(x - 0.006, x + 0.006, y - h / 2, y + h / 2, z, z + 0.03, TIMBER)
    else:                                                 # on the +x / -x wall (side = ±1)
        m.box(z - 0.0, z + 0.012, y - h / 2 - 0.014, y + h / 2 + 0.014, x - w / 2 - 0.014, x + w / 2 + 0.014, TIMBER)


def _door(m, x, z, w=0.13, h=0.2, col=DOOR):
    m.box(x - w / 2 - 0.016, x + w / 2 + 0.016, 0, h + 0.016, z, z + 0.014, TIMBER_D)
    m.box(x - w / 2, x + w / 2, 0, h, z, z + 0.026, col)
    m.box(x + w / 2 - 0.035, x + w / 2 - 0.02, h * 0.45, h * 0.45 + 0.02, z + 0.026, z + 0.036, HAY)   # knob


def _chimney(m, x, z, y0, y1, col=STONE_D):
    m.box(x - 0.055, x + 0.055, y0, y1, z - 0.055, z + 0.055, col)
    m.box(x - 0.07, x + 0.07, y1, y1 + 0.035, z - 0.07, z + 0.07, STONE)


def _plinth(m, x0, x1, z0, z1, h=0.045):
    m.box(x0 - 0.02, x1 + 0.02, 0, h, z0 - 0.02, z1 + 0.02, STONE)


def make_house(kind, roof):
    rc = ROOFS[roof]
    m = Mesh()
    if kind == 'cottage':                      # long single-storey cottage, ridge across the front
        x0, x1, z0, z1, he = -0.5, 0.5, -0.30, 0.30, 0.34
        _plinth(m, x0, x1, z0, z1)
        m.box(x0, x1, 0.045, he, z0, z1, PLASTER)
        m.box(x0 - 0.012, x1 + 0.012, 0.045, 0.075, z0 - 0.012, z1 + 0.012, TIMBER)
        for xx in (x0, x1, -0.16, 0.16):       # timber studs on the front
            m.box(xx - 0.012, xx + 0.012, 0.045, he, z1, z1 + 0.012, TIMBER)
        m.gable(x0, x1, z0, z1, he, 0.78, rc, PLASTER, axis='x')
        _door(m, 0.0, z1)
        _window(m, -0.33, 0.21, z1); _window(m, 0.33, 0.21, z1)
        _chimney(m, 0.34, -0.1, 0.5, 0.88)
        m.box(-0.1, 0.1, 0, 0.03, z1 + 0.02, z1 + 0.12, STONE)       # doorstep
    elif kind == 'townhouse':                  # two floors, jettied upper floor, steep front gable
        _plinth(m, -0.33, 0.33, -0.3, 0.3)
        m.box(-0.33, 0.33, 0.045, 0.40, -0.3, 0.3, PLASTER)
        m.box(-0.37, 0.37, 0.40, 0.46, -0.34, 0.36, TIMBER_D)           # jetty beam
        m.box(-0.36, 0.36, 0.46, 0.80, -0.33, 0.36, PLASTER_D)
        for xx in (-0.35, 0.0, 0.35):
            m.box(xx - 0.013, xx + 0.013, 0.46, 0.80, 0.36, 0.373, TIMBER)
        m.box(-0.36, 0.36, 0.60, 0.625, 0.36, 0.373, TIMBER)
        m.gable(-0.36, 0.36, -0.33, 0.36, 0.80, 1.22, rc, PLASTER_D, over=0.1, axis='z')
        _door(m, 0.0, 0.3, w=0.14, h=0.22)
        _window(m, -0.2, 0.22, 0.3); _window(m, 0.2, 0.22, 0.3)
        _window(m, -0.16, 0.62, 0.373, h=0.11); _window(m, 0.16, 0.62, 0.373, h=0.11)
        _window(m, 0.0, 0.95, 0.373, w=0.07, h=0.08)
        _chimney(m, -0.18, -0.15, 0.9, 1.3)
    elif kind == 'tudor':                      # L-shaped: long wing + front cross-gable
        _plinth(m, -0.52, 0.3, -0.26, 0.26)
        m.box(-0.52, 0.30, 0.045, 0.34, -0.26, 0.26, PLASTER)
        m.gable(-0.52, 0.30, -0.26, 0.26, 0.34, 0.74, rc, PLASTER, axis='x')
        _plinth(m, 0.0, 0.46, -0.1, 0.5)
        m.box(0.0, 0.46, 0.045, 0.34, -0.1, 0.5, PLASTER_D)
        m.gable(0.0, 0.46, -0.1, 0.5, 0.34, 0.66, rc, PLASTER_D, axis='z')
        for zz in (0.5,):
            for xx in (0.0, 0.23, 0.46):
                m.box(xx - 0.012, xx + 0.012, 0.045, 0.34, zz, zz + 0.012, TIMBER)
            m.box(0.0, 0.46, 0.20, 0.222, zz, zz + 0.012, TIMBER)
        _door(m, 0.23, 0.5, w=0.12, h=0.19)
        _window(m, -0.3, 0.2, 0.26); _window(m, -0.06, 0.2, 0.26)
        _window(m, 0.23, 0.50, 0.5, w=0.06, h=0.07)
        _chimney(m, -0.36, 0.0, 0.5, 0.86)
    elif kind == 'stone':                      # sturdy stone house, slate/red roof, porch
        _plinth(m, -0.38, 0.38, -0.32, 0.32, 0.06)
        m.box(-0.38, 0.38, 0.06, 0.46, -0.32, 0.32, STONE, front=STONE)
        for (xx, zz) in ((-0.38, 0.32), (0.38, 0.32)):                   # corner quoins
            m.box(xx - 0.03, xx + 0.03, 0.06, 0.46, zz - 0.03, zz + 0.03, STONE_D)
        for yy in (0.16, 0.26, 0.36):
            m.box(-0.38, 0.38, yy, yy + 0.012, 0.32, 0.326, STONE_D)
        m.gable(-0.38, 0.38, -0.32, 0.32, 0.46, 0.96, rc, STONE, axis='z', trim=STONE_D)
        m.box(-0.14, 0.14, 0.0, 0.015, 0.32, 0.5, STONE_D)               # porch slab
        m.box(-0.14, -0.115, 0.0, 0.26, 0.45, 0.48, TIMBER); m.box(0.115, 0.14, 0.0, 0.26, 0.45, 0.48, TIMBER)
        m.gable(-0.16, 0.16, 0.30, 0.52, 0.26, 0.38, rc, STONE, over=0.04, axis='z', trim=STONE_D)
        _door(m, 0.0, 0.32, w=0.13, h=0.2, col=TIMBER_D)
        _window(m, -0.25, 0.28, 0.32); _window(m, 0.25, 0.28, 0.32)
        _window(m, 0.0, 0.7, 0.32 + 0.002, w=0.07, h=0.09)
        _chimney(m, 0.22, -0.12, 0.7, 1.08, STONE)
    elif kind == 'roundhut':                   # round thatched hut
        m.prism(0.34, 0.0, 0.34, 8, PLASTER)
        m.prism(0.355, 0.0, 0.06, 8, STONE)
        m.cone(0.47, 0.32, 0.9, 8, rc, shade=0.05)
        m.box(-0.012, 0.012, 0.88, 0.97, -0.012, 0.012, TIMBER_D)         # finial
        _door(m, 0.0, 0.30, w=0.12, h=0.19)
        _window(m, 0.22, 0.2, 0.26, w=0.06, h=0.07)
        _chimney(m, -0.22, -0.1, 0.55, 0.84, STONE)
        m.box(0.3, 0.42, 0.0, 0.09, 0.22, 0.34, HAY)                       # haystack
    elif kind == 'barn':                       # big barn, front gable with double doors + hay loft
        _plinth(m, -0.5, 0.5, -0.38, 0.38, 0.04)
        m.box(-0.5, 0.5, 0.04, 0.46, -0.38, 0.38, BARN)
        for xx in np.linspace(-0.45, 0.45, 7):
            m.box(xx - 0.008, xx + 0.008, 0.04, 0.46, 0.38, 0.388, TIMBER_D)
        m.gable(-0.5, 0.5, -0.38, 0.38, 0.46, 0.95, rc, BARN, over=0.07, axis='x', trim=TIMBER_D)
        m.box(-0.2, 0.2, 0.0, 0.33, 0.38, 0.40, TIMBER)                   # double doors
        m.box(-0.19, -0.01, 0.01, 0.32, 0.40, 0.414, BARN); m.box(0.01, 0.19, 0.01, 0.32, 0.40, 0.414, BARN)
        for s in (1, -1):                                                  # X braces
            m.box(-0.19 if s > 0 else 0.01, -0.01 if s > 0 else 0.19, 0.16, 0.175, 0.414, 0.424, PLASTER)
        m.box(-0.1, 0.1, 0.52, 0.66, 0.38, 0.40, TIMBER_D)                 # loft hatch
        m.box(-0.085, 0.085, 0.535, 0.645, 0.40, 0.41, HAY)
        m.box(0.52, 0.66, 0.0, 0.12, 0.05, 0.25, HAY)                      # hay bale beside
        m.box(0.52, 0.66, 0.12, 0.2, 0.08, 0.22, HAY)
    elif kind == 'shop':                       # cottage + striped awning + hanging sign
        x0, x1, z0, z1, he = -0.44, 0.44, -0.30, 0.30, 0.36
        _plinth(m, x0, x1, z0, z1)
        m.box(x0, x1, 0.045, he, z0, z1, PLASTER_D)
        m.box(x0 - 0.012, x1 + 0.012, 0.045, 0.075, z0 - 0.012, z1 + 0.012, TIMBER)
        m.gable(x0, x1, z0, z1, he, 0.82, rc, PLASTER_D, axis='x')
        _window(m, -0.25, 0.2, z1, w=0.14, h=0.11)
        _door(m, 0.2, z1, w=0.13, h=0.2)
        stripes = [(216, 70, 60), (246, 240, 226)]
        n = 6
        for i in range(n):
            xa = x0 + 0.02 + (x1 - x0 - 0.04) * i / n; xb = x0 + 0.02 + (x1 - x0 - 0.04) * (i + 1) / n
            m.poly([(xa, 0.30, z1 + 0.005), (xb, 0.30, z1 + 0.005), (xb, 0.245, z1 + 0.2), (xa, 0.245, z1 + 0.2)], stripes[i % 2], (0, 0.1, 0))
        m.box(x0 + 0.02, x0 + 0.032, 0.0, 0.25, z1 + 0.17, z1 + 0.19, TIMBER)
        m.box(x1 - 0.032, x1 - 0.02, 0.0, 0.25, z1 + 0.17, z1 + 0.19, TIMBER)
        m.box(x1 + 0.0, x1 + 0.1, 0.30, 0.314, z1 - 0.01, z1 + 0.01, TIMBER_D)   # sign arm
        m.box(x1 + 0.05, x1 + 0.1, 0.22, 0.30, z1 - 0.005, z1 + 0.012, HAY)
        _chimney(m, -0.28, -0.1, 0.55, 0.92)
        m.box(-0.36, -0.26, 0, 0.1, z1 + 0.04, z1 + 0.14, TIMBER)          # crate
    else:
        raise KeyError(kind)
    return m.build()
