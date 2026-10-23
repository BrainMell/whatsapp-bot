#!/usr/bin/env python3
"""patch_house_kit_v2.py - fix the kit wall/railing composition in
homesteadRenderer.js on the feat/house-builder worktree:
  - segment width 64px (matches the per-tile anchor step; the old 128 doubled it)
  - 2:1 slant applied via shear transform (old: axis-aligned rects = staircase)
  - timber frame overlay so pack textures read as framed walls
  - railing drawn with the same shear on the deck edge
"""
import re, sys

P = '/tmp/hbqa/core/rpg/homesteadRenderer.js'
src = open(P).read()

OLD_KIT = '''const KIT_SEG_W = TW * 2;              // one 2m segment spans 2 tiles
const KIT_SEGS = N / 2;                // 12 tiles = 6 segments per wall run
const KIT_BASE_FRAC = 116 / 134;       // baked wall base line inside the sprite
async function drawKitWalls(ctx, theme, seed) {
    const base = await img(`${theme.wallKit}.png`);
    if (!base) return false;
    const win = await img(`${theme.wallKit}_win.png`);
    const lh = WALL_H;
    const by = Math.round(lh * KIT_BASE_FRAC);
    const paint = (spr, bx, gy, mirror) => {
        if (mirror) {
            ctx.save();
            ctx.translate(bx, gy);
            ctx.scale(-1, 1);
            ctx.drawImage(spr, -KIT_SEG_W / 2, -by, KIT_SEG_W, lh);
            ctx.restore();
        } else {
            ctx.drawImage(spr, bx - KIT_SEG_W / 2, gy - by, KIT_SEG_W, lh);
        }
    };
    for (let k = 0; k < KIT_SEGS; k++) {
        const spr = win && k % 3 === 1 ? win : base;   // two windows per run (2nd + 5th segment)
        paint(spr, isoX(0, 2 * k + 1), isoY(0, 2 * k + 1), false);   // left run
        paint(spr, isoX(2 * k + 1, 0), isoY(2 * k + 1, 0), true);    // right run (mirrored)
    }
    return true;
}'''

NEW_KIT = '''const KIT_SEG_W = TW;                  // a 2m segment = 2 tiles = 64px on screen
const KIT_SEGS = N / 2;                // 12 tiles = 6 segments per wall run
const KIT_SKIRT = 14;                  // baked base band below the base line
async function drawKitWalls(ctx, theme, seed) {
    const base = await img(`${theme.wallKit}.png`);
    if (!base) return false;
    const win = await img(`${theme.wallKit}_win.png`);
    const paint = (spr, bx, by, mirror) => {
        ctx.save();
        ctx.translate(bx, by);
        if (mirror) ctx.scale(-1, 1);
        ctx.transform(1, 0.5, 0, 1, 0, 0);   // base line slants at the room's 2:1
        ctx.drawImage(spr, 0, -WALL_H, KIT_SEG_W, WALL_H + KIT_SKIRT);
        ctx.restore();
    };
    // timber frame overlay (posts + beams) so pack textures read as framed walls
    const timber = theme.wall[2], timberD = theme.wall[3];
    const frameSeg = (bx, by, mirror, s) => {
        ctx.save();
        ctx.translate(bx, by);
        if (mirror) ctx.scale(-1, 1);
        ctx.transform(1, 0.5, 0, 1, 0, 0);
        ctx.strokeStyle = s % 2 ? timberD : timber;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0.5, 0); ctx.lineTo(0.5, -WALL_H);
        ctx.moveTo(0, -WALL_H + 3); ctx.lineTo(KIT_SEG_W, -WALL_H + 3);
        ctx.moveTo(0, -WALL_H * 0.55); ctx.lineTo(KIT_SEG_W, -WALL_H * 0.55);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,235,190,0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -WALL_H + 6); ctx.lineTo(KIT_SEG_W, -WALL_H + 6);
        ctx.stroke();
        ctx.restore();
    };
    for (let k = 0; k < KIT_SEGS; k++) {
        const spr = win && k % 3 === 1 ? win : base;   // window on the 2nd + 5th segment
        paint(spr, isoX(0, 2 * k), isoY(0, 2 * k), true);    // left run (mirrored: descends left)
        paint(spr, isoX(2 * k, 0), isoY(2 * k, 0), false);   // right run: descends right
        frameSeg(isoX(0, 2 * k), isoY(0, 2 * k), true, k);
        frameSeg(isoX(2 * k, 0), isoY(2 * k, 0), false, k + 7);
    }
    return true;
}'''

OLD_RAIL = '''        const railSpr = await img('kit/hou_railing.png');
        if (railSpr) {
            for (let k = 0; k < N / 2; k++) {
                if (k === 4) continue;   // opening where the stairs land
                const bx = isoX(mezzDepth, 2 * k + 1), by = isoY(mezzDepth, 2 * k + 1);
                ctx.drawImage(railSpr, bx - KIT_SEG_W / 2, by - MEZZ_LIFT - 52, KIT_SEG_W, 60);
            }
        }'''

NEW_RAIL = '''        const railSpr = await img('kit/hou_railing.png');
        if (railSpr) {
            for (let k = 0; k < N / 2; k++) {
                if (k === 4) continue;   // opening where the stairs land
                const bx = isoX(mezzDepth, 2 * k), by = isoY(mezzDepth, 2 * k);
                ctx.save();
                ctx.translate(bx, by - MEZZ_LIFT);
                ctx.scale(-1, 1);                 // deck edge runs along the left axis
                ctx.transform(1, 0.5, 0, 1, 0, 0);
                ctx.drawImage(railSpr, 0, -70, KIT_SEG_W, 70);
                ctx.restore();
            }
        }'''

if OLD_KIT not in src:
    print('ABORT: kit block anchor not found'); sys.exit(1)
if OLD_RAIL not in src:
    print('ABORT: railing block anchor not found'); sys.exit(1)

src = src.replace(OLD_KIT, NEW_KIT).replace(OLD_RAIL, NEW_RAIL)
open(P, 'w').write(src)
print('patched drawKitWalls + railing')
