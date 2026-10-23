#!/usr/bin/env python3
"""patch_house_kit_v3.py - staircase rebuild in homesteadRenderer.js:
the old 6 chunky steps started 0.32 tiles off the deck edge with flat tan
fills (read as floating cardboard cards). New: 8 plank-textured steps flush
to the deck edge, lit leading edges, iso plank chords on the treads, dark
stringer boards under both sawtooth runs, floor-level contact shadows.
Anchor-verified: aborts unless the old block matches exactly once."""
import os
import sys

P = os.environ.get('HB_RENDERER', '/tmp/hb-qa/core/rpg/homesteadRenderer.js')
src = open(P).read()

OLD = '''        // staircase: chunky wooden steps from the deck edge down to the floor
        const steps = 6;
        for (let i = 0; i < steps; i++) {
            const h = MEZZ_LIFT * (1 - i / steps);
            const cx = isoX(mezzDepth + 0.32 + i * 0.33, 9.55);
            const cy = isoY(mezzDepth + 0.32 + i * 0.33, 9.55) - h;
            const w2 = TW * 0.36, h2 = TH * 0.36, face = 6 + i * 0.4;
            ctx.fillStyle = i % 2 ? '#a5713d' : '#96622f';   // tread
            ctx.beginPath();
            ctx.moveTo(cx, cy - h2); ctx.lineTo(cx + w2, cy); ctx.lineTo(cx, cy + h2); ctx.lineTo(cx - w2, cy);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#5e3c1c';                        // south-east riser
            ctx.beginPath();
            ctx.moveTo(cx + w2, cy); ctx.lineTo(cx, cy + h2); ctx.lineTo(cx, cy + h2 + face); ctx.lineTo(cx + w2, cy + face);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#4a2e14';                        // south-west riser
            ctx.beginPath();
            ctx.moveTo(cx - w2, cy); ctx.lineTo(cx, cy + h2); ctx.lineTo(cx, cy + h2 + face); ctx.lineTo(cx - w2, cy + face);
            ctx.closePath(); ctx.fill();
        }'''

NEW = '''        // staircase: plank-textured steps flush to the deck edge, stringer-linked
        const steps = 8;
        const stX0 = mezzDepth + 0.10, stDX = 0.30;
        const stC = [];
        for (let i = 0; i < steps; i++) {
            const h = MEZZ_LIFT * (1 - i / steps);
            stC.push([
                isoX(stX0 + i * stDX, 9.55), isoY(stX0 + i * stDX, 9.55) - h,
                TW * 0.34, TH * 0.34, 5 + i * 0.35, h,
            ]);
        }
        ctx.save();                                        // floor contact shadows
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = '#000000';
        for (let i = 1; i < steps; i++) {
            const [cx, cy, w2, h2, , h] = stC[i];
            ctx.beginPath();
            ctx.ellipse(cx, cy + h + 2, w2 * 0.8, h2 * 0.45, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
        for (let i = 0; i < steps; i++) {
            const [cx, cy, w2, h2, face] = stC[i];
            ctx.fillStyle = i % 2 ? '#8a5a2e' : '#7c5028';   // tread
            ctx.beginPath();
            ctx.moveTo(cx, cy - h2); ctx.lineTo(cx + w2, cy); ctx.lineTo(cx, cy + h2); ctx.lineTo(cx - w2, cy);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = 'rgba(46,26,10,0.5)';          // plank chords on the tread
            ctx.lineWidth = 1;
            for (const dy of [-h2 * 0.38, h2 * 0.34]) {
                const hw = w2 * (1 - Math.abs(dy) / h2);
                ctx.beginPath(); ctx.moveTo(cx - hw, cy + dy); ctx.lineTo(cx + hw, cy + dy); ctx.stroke();
            }
            ctx.strokeStyle = 'rgba(255,222,168,0.4)';       // lit near edges
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(cx - w2, cy); ctx.lineTo(cx, cy - h2); ctx.lineTo(cx + w2, cy); ctx.stroke();
            ctx.fillStyle = '#57381a';                        // south-east riser
            ctx.beginPath();
            ctx.moveTo(cx + w2, cy); ctx.lineTo(cx, cy + h2); ctx.lineTo(cx, cy + h2 + face); ctx.lineTo(cx + w2, cy + face);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#432a12';                        // south-west riser
            ctx.beginPath();
            ctx.moveTo(cx - w2, cy); ctx.lineTo(cx, cy + h2); ctx.lineTo(cx, cy + h2 + face); ctx.lineTo(cx - w2, cy + face);
            ctx.closePath(); ctx.fill();
        }
        ctx.strokeStyle = '#33200e';                          // stringer boards
        ctx.lineWidth = 4;
        for (const side of [-1, 1]) {
            ctx.beginPath();
            stC.forEach(([cx, cy, w2, h2, face], i) => {
                if (!i) ctx.moveTo(cx + side * w2, cy + h2 + face);
                else ctx.lineTo(cx + side * w2, cy + h2 + face);
            });
            ctx.stroke();
        }'''

if src.count(OLD) != 1:
    print(f'ABORT: stairs anchor count = {src.count(OLD)} (need 1)')
    sys.exit(1)

open(P, 'w').write(src.replace(OLD, NEW))
print('patched staircase v3')
