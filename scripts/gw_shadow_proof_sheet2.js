#!/usr/bin/env node
// compose BEFORE/AFTER proof sheet #2 — V1 ground-hug (user rejected: shadow
// hides behind the body, item reads floating) vs V2 mass-anchor + spill pool
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const BEFORE = '/home/z/my-project/download/gw_item_shadow_after';
const AFTER = '/home/z/my-project/download/gw_item_shadow_v3';
const OUT = '/home/z/my-project/download/gw_item_shadow_proof2.png';

const ROWS = [
    ['d_fresh', 'GOLD PILE (fresh)'],
    ['d_looted', 'THE PIT (looted)'],
    ['r_active', 'CHEST (closed)'],
    ['r_looted', 'CHEST (looted)'],
    ['s_fresh', 'IDOL PEDESTAL'],
    ['l_active', 'RUNE STELE'],
];
const CW = 400, CH = Math.round(400 * 380 / 420);
const PAD = 10, LABEL = 34, HEAD = 40;
const W = PAD + CW * 2 + PAD * 3, H = HEAD + LABEL * ROWS.length + CH * ROWS.length + PAD * (ROWS.length + 1);

(async () => {
    const c = createCanvas(W, H);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#14100c'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e8d9b0'; ctx.font = 'bold 22px "DejaVu Sans", sans-serif';
    ctx.fillText('ITEM SHADOWS — previous hug vs NOW (mass-anchored + spill pool)', PAD + 4, 28);
    ctx.font = 'bold 17px "DejaVu Sans", sans-serif';
    const bx = PAD + CW / 2, ax = PAD * 3 + CW + CW / 2;
    ctx.fillStyle = '#ff8f8f'; ctx.fillText('BEFORE — shadow hides behind the body', bx, HEAD + 4);
    ctx.fillStyle = '#9fe89f'; ctx.fillText('NOW — pool spills out, touching the base', ax, HEAD + 4);
    for (let i = 0; i < ROWS.length; i++) {
        const [tag, label] = ROWS[i];
        const y = HEAD + PAD + i * (LABEL + CH + PAD);
        ctx.fillStyle = '#e8d9b0'; ctx.font = 'bold 15px "DejaVu Sans", sans-serif';
        ctx.fillText(label, PAD + 2, y + 14);
        const b = await loadImage(path.join(BEFORE, tag + '.png'));
        const a = await loadImage(path.join(AFTER, tag + '.png'));
        ctx.drawImage(b, PAD, y + LABEL, CW, CH);
        ctx.drawImage(a, PAD * 2 + CW, y + LABEL, CW, CH);
    }
    ctx.strokeStyle = 'rgba(159,232,159,0.5)'; ctx.lineWidth = 2;
    ctx.strokeRect(PAD * 2 + CW - 1, HEAD + PAD - 1, CW + 2, ROWS.length * (LABEL + CH + PAD) - PAD + 2);
    fs.writeFileSync(OUT, c.toBuffer('image/png'));
    console.log(OUT, fs.statSync(OUT).size, 'bytes');
})().catch((e) => { console.error(e); process.exit(1); });
