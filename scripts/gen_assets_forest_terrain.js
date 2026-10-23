'use strict';
// ===========================================================================
// GEN - mossy FOREST terrain tiles (11:57Z "make the entire
// thing a forest" + "maybe even redesign the tiles an terrain").
// Same 64x32 iso diamond law as gen_assets_base_terrain.js but the palette
// shifts to deep mossy forest floor: dark moss greens, leaf litter, roots,
// dirt trails, mushrooms instead of meadow flowers. Tiles stay seamless
// (no auto-outline) so adjacent diamonds still merge.
// Run: node scripts/gen_assets_forest_terrain.js
// ===========================================================================
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('/home/z/my-project/repo/node_modules/canvas');

const OUT = path.join(__dirname, '..', 'core', 'rpgasset', 'homestead');
const P = {
    moss: ['#4d6b33', '#445e2c', '#57793b', '#3a5225'],   // base moss floor
    mossD: '#2e421e',
    mossHi: '#6d8f4a',
    litter: ['#8a6a3e', '#7a5830', '#9c7c48', '#6b4a28'], // dead leaves
    twig: '#5e4526',
    dirt: ['#8a6a44', '#7a5a38', '#9a7a50'],
    water: ['#3a6e78', '#468089', '#2c5a63'],
    waterL: '#8ecfd4',
    rock: ['#7d8287', '#6e7378', '#8d9297', '#5a5e62'],
    mushroom: ['#c86a52', '#e0e0d4'],
};

function sprite(w, h) {
    const cv = createCanvas(w, h);
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return { cv, ctx, w, h, px(x, y, ww, hh, col) { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), Math.round(ww), Math.round(hh)); } };
}
function tileDiamond(ctx, cx, cy, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 16); ctx.lineTo(cx + 32, cy); ctx.lineTo(cx, cy + 16); ctx.lineTo(cx - 32, cy);
    ctx.closePath(); ctx.fill();
}
function clipDiamond(ctx) {
    ctx.beginPath();
    ctx.moveTo(32, 0); ctx.lineTo(64, 16); ctx.lineTo(32, 32); ctx.lineTo(0, 16);
    ctx.closePath(); ctx.clip();
}
// deterministic per-file rng
function rngFor(file) {
    let s = 0;
    for (let i = 0; i < file.length; i++) s = (s * 31 + file.charCodeAt(i)) >>> 0;
    return (i) => { const x = Math.sin(i * 127.1 + s % 1000 * 0.137) * 43758.5453; return x - Math.floor(x); };
}

// -- mossy forest floor (3 variants) --
function mossTile(file, opts = {}) {
    const s = sprite(64, 32);
    tileDiamond(s.ctx, 32, 16, P.moss[0]);
    const rnd = rngFor(file);
    s.ctx.save();
    clipDiamond(s.ctx);
 // moss mottling
    for (let i = 0; i < 30; i++) {
        const x = rnd(i) * 64, y = rnd(i + 50) * 32;
        s.px(x, y, 2 + Math.floor(rnd(i + 99) * 3), 1, [P.moss[1], P.moss[2], P.moss[3], P.mossHi][i % 4]);
    }
 // moss clumps
    for (let i = 0; i < 5; i++) {
        const x = 4 + rnd(i + 150) * 54, y = 5 + rnd(i + 250) * 22;
        s.px(x, y, 4, 2, P.mossD); s.px(x + 1, y - 1, 2, 1, P.mossHi);
    }
 // leaf litter
    for (let i = 0; i < 7; i++) {
        const x = 3 + rnd(i + 300) * 56, y = 4 + rnd(i + 400) * 24;
        s.px(x, y, 2, 1, P.litter[i % 4]);
        s.px(x + 1, y + 1, 1, 1, P.litter[(i + 1) % 4]);
    }
 // tiny twigs
    for (let i = 0; i < 3; i++) {
        const x = 6 + rnd(i + 500) * 50, y = 6 + rnd(i + 600) * 20;
        s.px(x, y, 3, 1, P.twig); s.px(x + 2, y + 1, 2, 1, P.twig);
    }
    if (opts.mushrooms) {
        for (let i = 0; i < 3; i++) {
            const x = 8 + rnd(i + 700) * 46, y = 7 + rnd(i + 800) * 18;
            s.px(x, y, 2, 1, P.mushroom[0]); s.px(x, y - 1, 1, 1, P.mushroom[1]);
        }
    }
    s.ctx.restore();
    fs.writeFileSync(path.join(OUT, file), s.cv.toBuffer('image/png'));
}
mossTile('forest_moss_a.png');
mossTile('forest_moss_b.png');
mossTile('forest_moss_c.png');
mossTile('forest_moss_shrooms.png', { mushrooms: true });

// -- dirt trail through the forest (worn earth + leaves) --
{
    const s = sprite(64, 32);
    tileDiamond(s.ctx, 32, 16, P.dirt[0]);
    const rnd = rngFor('trail');
    s.ctx.save();
    clipDiamond(s.ctx);
    for (let i = 0; i < 24; i++) {
        const x = rnd(i) * 64, y = rnd(i + 40) * 32;
        s.px(x, y, 2, 1, [P.dirt[1], P.dirt[2], P.litter[1]][i % 3]);
    }
 // pressed leaf litter along the edges
    for (let i = 0; i < 6; i++) {
        const x = rnd(i + 100) < 0.5 ? 2 + rnd(i + 130) * 8 : 54 + rnd(i + 130) * 8;
        const y = 4 + rnd(i + 160) * 24;
        s.px(x, y, 2, 1, P.mossD);
    }
    for (let i = 0; i < 4; i++) {
        const x = 4 + rnd(i + 200) * 54, y = 5 + rnd(i + 260) * 22;
        s.px(x, y, 2, 1, P.litter[i % 4]);
    }
 // pebbles
    for (let i = 0; i < 3; i++) {
        const x = 6 + rnd(i + 300) * 50, y = 6 + rnd(i + 340) * 20;
        s.px(x, y, 2, 2, P.rock[i % 3]);
    }
    s.ctx.restore();
    fs.writeFileSync(path.join(OUT, 'forest_trail.png'), s.cv.toBuffer('image/png'));
}

// -- mossy rock tile (mines ground) --
{
    const s = sprite(64, 32);
    tileDiamond(s.ctx, 32, 16, P.rock[1]);
    const rnd = rngFor('mossrock');
    s.ctx.save();
    clipDiamond(s.ctx);
    for (let i = 0; i < 18; i++) {
        const x = rnd(i) * 60, y = rnd(i + 30) * 28;
        s.px(x, y, 3 + (i % 3) * 2, 2, [P.rock[0], P.rock[2], P.rock[3]][i % 3]);
    }
 // moss creeping over the stone
    for (let i = 0; i < 8; i++) {
        const x = 4 + rnd(i + 80) * 54, y = 4 + rnd(i + 110) * 24;
        s.px(x, y, 3, 1, P.moss[0]); s.px(x + 2, y - 1, 1, 1, P.mossHi);
    }
    s.ctx.restore();
    fs.writeFileSync(path.join(OUT, 'forest_rock_tile.png'), s.cv.toBuffer('image/png'));
}

// -- dark forest pond (2 frames shimmer) --
for (let f = 0; f < 2; f++) {
    const s = sprite(64, 32);
    tileDiamond(s.ctx, 32, 16, P.water[0]);
    const rnd = rngFor('pond' + f);
    s.ctx.save();
    clipDiamond(s.ctx);
    s.px(10, 8, 44, 3, P.water[1]);
    s.px(16, 20, 32, 3, P.water[2]);
    for (let i = 0; i < 6; i++) {
        const x = (8 + i * 9 + f * 5) % 56, y = 5 + ((i * 7 + f * 3) % 22);
        s.px(x, y, 5 + (i % 3) * 2, 1, i % 2 ? P.waterL : P.water[1]);
    }
 // lily pads (static both frames, offset ripple)
    for (let i = 0; i < 3; i++) {
        const x = 8 + rnd(i) * 46, y = 5 + rnd(i + 20) * 20;
        s.px(x, y, 3, 2, P.mossHi); s.px(x + 3, y, 1, 1, P.mossD);
    }
    if (f) { s.px(20, 10, 3, 1, '#dff2f6'); s.px(44, 19, 3, 1, '#dff2f6'); }
    s.ctx.restore();
    fs.writeFileSync(path.join(OUT, `forest_water_${f}.png`), s.cv.toBuffer('image/png'));
}

console.log('[gen] forest terrain tiles written');
