// Build the owner-facing montage: all 11 room designs in a labelled grid.
// Usage: node scripts/probe_variant_montage.js
'use strict';
const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

const SRC = '/home/z/my-project/download/gw_variants_v3';
const OUT = '/home/z/my-project/download/gw_room_designs_montage.png';

const DESIGN_TITLES = {
    intact: 'INTACT (base plate)',
    mossy: 'MOSSY — moss baked into the bricks',
    sandy: 'SANDY — sandstone ground',
    flooded: 'FLOODED — murky shallow water',
    cracked: 'CRACKED — fractured floor',
    skulls: 'SKULLS — bone chambers',
    overgrown: 'OVERGROWN — vines + ivy',
    dim: 'DIM — torch-lit dark grade',
    skill: 'SKILL — training rune circle',
    crystal: 'CRYSTAL — luminous shards',
    emberfall: 'EMBERFALL — ember mortar + ash',
};
const ORDER = ['intact', 'mossy', 'sandy', 'flooded', 'cracked', 'skulls', 'overgrown', 'dim', 'skill', 'crystal', 'emberfall'];

(async () => {
    const COLS = 3, CELL_W = 480, CELL_H = 385, PAD = 10;
    const rows = Math.ceil(ORDER.length / COLS);
    const W = COLS * (CELL_W + PAD) + PAD;
    const H = rows * (CELL_H + PAD) + PAD;
    const cv = createCanvas(W, H);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0d0b12';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < ORDER.length; i++) {
        const v = ORDER[i];
        const img = await loadImage(path.join(SRC, `after_${v}.png`));
        const cx = PAD + (i % COLS) * (CELL_W + PAD);
        const cy = PAD + Math.floor(i / COLS) * (CELL_H + PAD);
        ctx.drawImage(img, cx, cy, CELL_W, CELL_H - 42);
        // label strip
        ctx.fillStyle = '#171320';
        ctx.fillRect(cx, cy + CELL_H - 42, CELL_W, 42);
        ctx.strokeStyle = 'rgba(255,210,74,0.25)';
        ctx.strokeRect(cx + 0.5, cy + 0.5, CELL_W - 1, CELL_H - 1);
        ctx.fillStyle = '#ffd24a';
        ctx.font = 'bold 15px sans-serif';
        ctx.textBaseline = 'middle';
        const t = DESIGN_TITLES[v];
        ctx.fillText(t.length > 44 ? t.slice(0, 43) + '…' : t, cx + 10, cy + CELL_H - 21);
    }
    fs.writeFileSync(OUT, cv.toBuffer('image/png'));
    console.log('wrote', OUT, W + 'x' + H);
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
