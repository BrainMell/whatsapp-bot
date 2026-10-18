#!/usr/bin/env python3
# poly41 — warm stone regen for the poly_* props (outlands garnish)
import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
from iso41 import *
from base41a import crop_anchor
from base41b import rock_blob, crystal

OUT = '/home/z/my-project/work/asset41/out'


def bake_named(name, w, h, draw):
    s = Spr(w, h, w / 2, h - 4)
    draw(s)
    im = finish(s, '/tmp/_p.png')
    bb = im.getbbox()
    if bb:
        out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        l, t, r, b = bb
        out.paste(im.crop(bb), (max(0, int(w / 2 - (w / 2 - l) + 0)), 0))
        # simpler: centre content horizontally, bottom at h-2
        cw, ch = r - l, b - t
        out.paste(im.crop(bb), (int((w - cw) / 2), int(h - ch - 2)))
        out.save(f'{OUT}/{name}.png')
        print(f'{name}.png {w}x{h}')


def main():
    bake_named('poly_basalt', 93, 69, lambda s: (
        rock_blob(s, -0.25, 0.1, 0.5, 0.4, base='rock_d'),
        rock_blob(s, 0.25, 0.05, 0.62, 0.55, base='rock'),
    ))
    def crys(s):
        rock_blob(s, -0.35, 0.12, 0.55, 0.42, base='rock_d')
        rock_blob(s, 0.3, 0.05, 0.7, 0.55, base='rock')
        crystal(s, -0.05, -0.1, 0.30, 0.5, 0.09, 'teal')
        crystal(s, 0.42, -0.15, 0.26, 0.4, 0.08, 'teal')
        crystal(s, -0.5, 0.2, 0.16, 0.28, 0.06, 'teal')
    bake_named('poly_crystal_rocks', 180, 115, crys)

    def mono(s):
        rock_blob(s, 0, 0.1, 0.34, 1.5, base='rock', peak=1)
        rock_blob(s, 0.28, 0.2, 0.18, 0.55, base='rock_d', peak=1)
    bake_named('poly_rock_monolith', 80, 116, mono)

    def pyl(s):
        rock_blob(s, -0.22, 0.15, 0.3, 1.25, base='rock', peak=1)
        rock_blob(s, 0.3, 0.1, 0.26, 1.6, base='rock_d', peak=1)
    bake_named('poly_rock_pylon', 99, 125, pyl)

    bake_named('poly_rock_spire', 62, 89, lambda s: rock_blob(s, 0, 0.1, 0.3, 1.3, base='rock', peak=1))
    bake_named('poly_stream_rocks', 74, 45, lambda s: (
        rock_blob(s, -0.3, 0.1, 0.34, 0.26, base='rock_d'),
        rock_blob(s, 0.25, 0.05, 0.42, 0.34, base='rock'),
    ))

    def wr(s):
        # shallow water pool + boulder
        p = s.P(0, 0, 0)
        s.d.ellipse([p[0] - 1.15 * s.HW, p[1] - 0.5 * s.HW, p[0] + 1.15 * s.HW, p[1] + 0.5 * s.HW],
                    fill=(88, 148, 178, 255))
        s.d.ellipse([p[0] - 0.95 * s.HW, p[1] - 0.38 * s.HW, p[0] + 0.95 * s.HW, p[1] + 0.38 * s.HW],
                    fill=(120, 178, 200, 255))
        rock_blob(s, 0, -0.05, 0.62, 0.5, base='rock')
    bake_named('poly_water_rock', 179, 108, wr)

    def slab(s):
        box(s, -0.42, -0.30, 0.84, 0.6, 0.0, 0.22, 'rock', 'rock_l', rows=1)
        box(s, -0.34, -0.22, 0.68, 0.44, 0.22, 0.10, 'rock_d', 'rock')
    bake_named('poly_ancient_slab', 47, 48, slab)

    def arch(s):
        for px in (-0.28, 0.28):
            box(s, px - 0.09, -0.09, 0.18, 0.18, 0, 0.85, 'rock', 'rock_l', rows=3)
        box(s, -0.4, -0.1, 0.8, 0.2, 0.85, 0.14, 'rock_d', 'rock')
        rock_blob(s, 0.05, 0.25, 0.3, 0.22, base='rock_d')
    bake_named('poly_ruin_arch', 60, 63, arch)

    bake_named('poly_ruin_column', 28, 41, lambda s: (
        cylinder(s, 0, 0, 0.16, 0, 0.72, 'rock', nrows=4),
    ))

    def gate(s):
        for px in (-0.3, 0.3):
            box(s, px - 0.11, -0.11, 0.22, 0.22, 0, 1.3, 'rock', 'rock_l', rows=5)
        box(s, -0.45, -0.12, 0.9, 0.24, 1.3, 0.16, 'rock_d', 'rock')
    bake_named('poly_ruin_gate', 95, 134, gate)

    def clut(s):
        box(s, -0.4, -0.2, 0.5, 0.4, 0, 0.3, 'rock', 'rock_l', rows=2)
        box(s, 0.05, 0.02, 0.34, 0.3, 0, 0.2, 'rock_d', 'rock')
        rock_blob(s, -0.1, 0.3, 0.2, 0.16, base='rock_d')
    bake_named('poly_ruin_clutter', 61, 50, clut)

    def ivy(s):
        cylinder(s, 0, 0, 0.3, 0, 0.9, 'rock', nrows=5)
        # ivy cap
        bx, by = s.P(0, 0, 0.92)
        a, b = 0.36 * s.HW, 0.36 * s.HH
        s.d.ellipse([bx - a, by - b, bx + a, by + b], fill=hx('leaf', 0.95))
        s.d.ellipse([bx - a * 0.6, by - b * 0.7, bx + a * 0.4, by + b * 0.5], fill=hx('leaf_d', 0.9))
        # ivy drapes
        for u in (-0.7, 0.1, 0.6):
            p = s.P(u * 0.3, u * 0.2, 0.78)
            s.d.ellipse([p[0] - 3 * SS, p[1] - 5 * SS, p[0] + 3 * SS, p[1] + 4 * SS], fill=hx('leaf', 0.8))
    bake_named('poly_ivy_tower', 73, 116, ivy)


if __name__ == '__main__':
    main()
