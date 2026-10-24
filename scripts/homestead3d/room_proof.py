"""room_proof.py - proof render of the owner's reference cutaway room, built ONLY from the
house-builder pack GLBs (+ a few primitive boxes for foundation / posts / glazing)."""
import sys, os, glob, time, random
from iso3d import Mesh, render

PACK = os.environ.get('HB_PACK', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pack_models'))
idx = {}
for p in glob.glob(PACK + '/**/*.glb', recursive=True):
    idx.setdefault(os.path.basename(p), p)
G = lambda n: idx[n if n.endswith('.glb') else n + '.glb']

F = 1.7           # pack furniture is dollhouse scale
L = 1.55          # loft deck height
m = Mesh()

def rug(cx, cy, z, w, d, yaw=0):
    """woven rug: red border, cream band, blue field with red lozenges (matches the reference)"""
    m.add_box((cx, cy, z + 0.012), (w, d, 0.024), (0.62, 0.17, 0.14), yaw=yaw)
    m.add_box((cx, cy, z + 0.02), (w * 0.9, d * 0.88, 0.024), (0.93, 0.86, 0.68), yaw=yaw)
    m.add_box((cx, cy, z + 0.028), (w * 0.8, d * 0.74, 0.024), (0.17, 0.33, 0.52), yaw=yaw)
    import math
    c, sn = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
    for k in range(-2, 3):
        ox = k * w * 0.15
        px, py = cx + ox * c, cy + ox * sn
        m.add_box((px, py, z + 0.04), (w * 0.09, d * 0.2, 0.02), (0.64, 0.18, 0.14), yaw=yaw + 45)

def plank_floor(x0, x1, y0, y1, z, thick=0.12, seed=3):
    rr = random.Random(seed)
    n = int((y1 - y0) / 0.24)
    for i in range(n):
        y = y0 + (i + 0.5) * (y1 - y0) / n
        g = 0.78 + rr.random() * 0.4
        m.add_box(((x0 + x1) / 2, y, z - thick / 2), (x1 - x0, (y1 - y0) / n * 0.96, thick), (0.52 * g, 0.31 * g, 0.16 * g))

def stairs(x, y_top, z_top, n=10, w=0.95, run=0.24):
    """solid plank stair climbing toward +y, top step flush with the loft edge"""
    rise = z_top / n
    for i in range(n):
        yc = y_top - (i + 0.5) * run
        h = z_top - i * rise
        g = 0.85 + (i % 2) * 0.12
        m.add_box((x, yc, h / 2), (w, run * 0.98, h), (0.50 * g, 0.29 * g, 0.15 * g))
    for sx in (-w / 2 - 0.05, w / 2 + 0.05):          # stringers
        for i in range(n):
            yc = y_top - (i + 0.5) * run
            h = z_top - i * rise + 0.12
            m.add_box((x + sx, yc, h / 2), (0.1, run * 1.02, h), (0.24, 0.13, 0.07))

# ── shell ───────────────────────────────────────────────────────────────────
m.add_model(G('raised_platform_6x5_wood_deck'), pos=(0, 0, 0), zmin=-0.2)
rnd = random.Random(7)
def stone_edge(x0, y0, x1, y1, along_x):
    n = int(abs((x1 - x0) if along_x else (y1 - y0)) / 0.55)
    for i in range(n):
        t = (i + 0.5) / n
        x = x0 + (x1 - x0) * t; y = y0 + (y1 - y0) * t
        g = 0.50 + rnd.random() * 0.10
        sz = ((x1 - x0) / n * 0.97, 0.3, 0.55) if along_x else (0.3, (y1 - y0) / n * 0.97, 0.55)
        m.add_box((x, y, -0.3), sz, (g, g * 0.98, g * 0.9))
stone_edge(-3.05, -2.62, 3.05, -2.62, True)     # front-left face
stone_edge(3.17, -2.55, 3.17, 2.6, False)       # front-right face

for i, x in enumerate((-2.08, 0.0, 2.08)):      # back-right wall (y=+)
    m.add_model(G('tier02_half_timber_wall'), pos=(x, 2.62, 0.03))
for i, y in enumerate((-2.08, 0.0, 2.08)):      # back-left wall (x=-)
    m.add_model(G('tier02_half_timber_wall_with_window' if i == 0 else 'tier02_half_timber_wall'), pos=(-3.14, y + 0.02, 0.03), yaw=90)
# window glazing behind the left wall's window cut-out
m.add_box((-3.30, -2.08, 1.35), (0.04, 0.80, 0.85), (0.93, 0.74, 0.34))
# door in the back-right wall
m.add_model(G('medieval_arch_doorframe'), pos=(2.3, 2.40, 0.03), scale=(0.8, 1.0, 0.95))
m.add_box((2.3, 2.55, 1.05), (0.9, 0.06, 2.0), (0.38, 0.2, 0.1))

# ── loft (mezzanine) ────────────────────────────────────────────────────────
LY0, LY1, LX0, LX1 = -0.15, 2.5, -3.0, 0.25
plank_floor(LX0, LX1, LY0, LY1, L)
m.add_box(((LX0 + LX1) / 2, (LY0 + LY1) / 2, L - 0.16), (LX1 - LX0, LY1 - LY0, 0.2), (0.28, 0.16, 0.09))     # deck fascia
m.add_box(((LX0 + LX1) / 2, LY0, L - 0.28), (LX1 - LX0 + .1, 0.14, 0.14), (0.24, 0.13, 0.07))
for (px, py) in ((LX0 + 0.1, LY0), (-1.4, LY0), (LX1 - 0.05, LY0), (LX1 - 0.05, 1.3)):                         # posts down to floor
    m.add_box((px, py, L / 2), (0.16, 0.16, L), (0.26, 0.14, 0.08))
# railing along the open front (-y) edge and right (+x) edge
m.add_model(G('balcony_railing_segment_2m'), pos=(-2.0, LY0, L), scale=(1.0, 1.0, 1.0))
m.add_model(G('balcony_railing_segment_2m'), pos=(LX1 - 0.02, 1.15, L), yaw=90, scale=(1.3, 1.0, 1.0))
# stairs: top at the loft front edge, climbing toward +y
stairs(-0.55, LY0 + 0.02, L)

# ── loft furniture ──────────────────────────────────────────────────────────
rug(-1.0, 0.75, L, 2.1, 1.3)
m.add_model(G('bed_noble'), pos=(-1.15, 1.75, L), scale=F * 1.0, yaw=0)
m.add_model(G('nightstand'), pos=(-2.55, 2.05, L), scale=F, yaw=0)
m.add_model(G('candelabra'), pos=(-2.55, 2.05, L + 0.99), scale=F * 0.7)
m.add_model(G('desk_scribe'), pos=(-2.25, 0.25, L), scale=F, yaw=0)
m.add_model(G('chair_wood'), pos=(-2.25, -0.2, L), scale=F * 0.8, yaw=180)

# ── ground floor ────────────────────────────────────────────────────────────
m.add_model(G('hearth_brick'), pos=(0.85, 2.15, 0.03), scale=F * 1.05, yaw=0)
m.add_model(G('barrel_oak'), pos=(-1.6, 1.95, 0.03), scale=F)
rug(1.6, -0.55, 0.03, 2.5, 1.7)
m.add_model(G('table_small'), pos=(1.65, -0.55, 0.03), scale=F * 1.15)
m.add_model(G('chair_wood'), pos=(0.75, -0.6, 0.03), scale=F * 0.85, yaw=-90)
m.add_model(G('stool_amber'), pos=(2.45, -1.45, 0.03), scale=F * 0.9)
m.add_model(G('plant_shrub'), pos=(-2.2, -1.8, 0.03), scale=F * 1.1, tint_white=(0.78, 0.36, 0.26))
m.add_model(G('pot_herbs'), pos=(1.45, -0.55, 0.03 + 0.5 * F * 1.15 + 0.12), scale=F * 0.55)
m.add_model(G('vase_blue'), pos=(1.9, -0.45, 0.03 + 0.5 * F * 1.15 + 0.12), scale=F * 0.4)
m.add_model(G('barrel_tall'), pos=(2.85, 1.0, 0.03), scale=F * 0.95)
m.add_model(G('chest_wood'), pos=(0.5, 1.55, 0.03), scale=F)
m.add_model(G('shelf_books'), pos=(-2.85, -1.0, 0.03), scale=F * 0.95, yaw=90)

m.finalize()
t = time.time()
im = render(m, W=1500, H=1300, scale=135, origin=(0, 0, 0.9), ss=2, ambient=0.78, diffuse=0.55)
im.save(sys.argv[1] if len(sys.argv) > 1 else 'proof.png')
print('tris', len(m.V), 'secs', round(time.time() - t, 1))
