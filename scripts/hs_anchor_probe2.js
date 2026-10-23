'use strict';
// v2 probe v2: per-item ISOLATED renders (no cross-contamination).
// Measures: sprite TOP edge (robust: sprite tops are against dark backdrop) and
// shadow BOTTOM edge (lowest weak-diff pixel). Derives empirical anchorY from
// sprite top: anchor = top + spr.height*2 - topPad - 1 (canvas top row = anchorY-h).
const path = require('path');
process.chdir(path.join(__dirname, '..'));
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');
const R = require('../core/rpg/homesteadRenderer');

const TW = 64, TH = 32, OX = 450, OY = 190;

const ITEMS = [
    { item: 'barrel_small', x: 5, y: 5, fw: 1, fh: 1 },
    { item: 'bed_noble',    x: 3, y: 3, fw: 2, fh: 1 },
    { item: 'clock_grand',  x: 8, y: 7, fw: 1, fh: 1 },
    { item: 'table_feast',  x: 6, y: 8, fw: 2, fh: 1 },
    { item: 'wardrobe',     x: 4, y: 7, fw: 1, fh: 1 },
];

function footC(p) {
    return {
        x: OX + (p.x + p.fw / 2 - (p.y + p.fh / 2)) * (TW / 2),
        y: OY + (p.x + p.fw / 2 + p.y + p.fh / 2) * (TH / 2),
    };
}

(async () => {
    const emptyBuf = await R.renderFrame({ owner: 'probe', theme: 'oakhaven', placed: [] }, 0, {});
    const empty = await loadImage(emptyBuf);
    const ecan = createCanvas(empty.width, empty.height); ecan.getContext('2d').drawImage(empty, 0, 0);
    const E = ecan.getContext('2d').getImageData(0, 0, empty.width, empty.height).data;
    const W = empty.width;
    const px = (D, x, y) => { const i = (y * W + x) * 4; return [D[i], D[i + 1], D[i + 2]]; };

    console.log('item            footC.y  vertex  curANCH  fixANCH  topMEAS  anchorEMP  shadBOT  verdict');
    for (const p of ITEMS) {
        const buf = await R.renderFrame({ owner: 'probe', theme: 'oakhaven', placed: [p] }, 0, {});
        const im = await loadImage(buf);
        const can = createCanvas(im.width, im.height); can.getContext('2d').drawImage(im, 0, 0);
        const I = can.getContext('2d').getImageData(0, 0, im.width, im.height).data;

        const c = footC(p);
        const curA = c.y + (p.fw + p.fh) * (TH / 2) - 2;
        const fixA = c.y + (p.fw + p.fh) * (TH / 4) - TH / 2 + 2;
        const vertex = c.y + (p.fw + p.fh) * (TH / 4) - TH / 2;

        const spr = await loadImage(path.join('core/rpgasset/homestead', p.item + '.png'));
 // sprite top pad (first row with alpha>128) - via temp canvas
        let topPad = 0;
        {
            const tc = createCanvas(spr.width, spr.height);
            const tx = tc.getContext('2d'); tx.drawImage(spr, 0, 0);
            const td = tx.getImageData(0, 0, spr.width, spr.height).data;
            for (let y = 0; y < spr.height; y++) {
                let any = false;
                for (let x = 0; x < spr.width; x++) if (td[(y * spr.width + x) * 4 + 3] > 128) { any = true; break; }
                if (any) { topPad = y; break; }
            }
        }
        const h = spr.height * 2; // drawn height (2x)

        const xd = Math.round(c.x * SS0());
 // sprite TOP: first strong-diff pixel scanning DOWN the center column from well above
        let top = -1;
        for (let yd = Math.round((c.y - h - 40) * 2); yd < Math.round(c.y * 2); yd++) {
            const [r1, g1, b1] = px(E, xd, yd); const [r2, g2, b2] = px(I, xd, yd);
            if (Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2) > 60) { top = yd; break; }
        }
 // shadow BOTTOM: last weak-diff pixel scanning UP from well below
        let shadBot = -1;
        for (let yd = Math.round((curA + 60) * 2); yd > Math.round(c.y * 2); yd--) {
            const [r1, g1, b1] = px(E, xd, yd); const [r2, g2, b2] = px(I, xd, yd);
            if (Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2) > 25) { shadBot = yd; break; }
        }
        const topA = top < 0 ? -1 : top / 2;
        const anchorEmp = topA < 0 ? -1 : topA + h - topPad - 1;
        const shadA = shadBot < 0 ? -1 : (shadBot + 1) / 2;
        const verdict = Math.abs(anchorEmp - (curA - 1)) <= 2 ? '== CURRENT' :
                        Math.abs(anchorEmp - (fixA - 1)) <= 2 ? '== CORRECTED' : '?? check';
        console.log(`${p.item.padEnd(15)} ${c.y.toFixed(0).padStart(7)} ${vertex.toFixed(0).padStart(7)} ${curA.toFixed(0).padStart(8)} ${fixA.toFixed(0).padStart(8)} ${topA.toFixed(0).padStart(8)} ${anchorEmp.toFixed(1).padStart(9)}  ${shadA.toFixed(0).padStart(6)}  ${verdict}`);
    }
    function SS0() { return 2; }
})().catch(e => { console.error('ERR', e); process.exit(1); });
