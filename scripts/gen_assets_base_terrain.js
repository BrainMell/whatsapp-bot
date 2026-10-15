'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// GEN — outdoor base terrain tiles + props (Section 6/10: base hub assets)
// 64x32 iso diamonds 1:1 (same floor scale as the room renderer), CC0-style
// hand-pixelled look, dark outline, light from upper-left.
// Run: node scripts/gen_assets_base_terrain.js
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const OUT = path.join(__dirname, '..', 'core', 'rpgasset', 'homestead');
const P = {
    outline: '#241811',
    grass: ['#5f8c46', '#55803e', '#6a9a50', '#4a7238'],
    grassD: '#3d5f2e',
    dirt: ['#9a7848', '#8a6a3e', '#a8885a'],
    path: ['#c2a071', '#b3915f', '#d0b07e'],
    water: ['#3e7f8c', '#4a909d', '#2f6673'],
    waterL: '#7ec4cf',
    rock: ['#8d9297', '#7d8287', '#6e7378', '#a8adb2'],
    wood: '#8a5a33', woodL: '#a5744a', woodD: '#6b4222', woodDD: '#4a2d17',
    leaf: '#4a7238', leafL: '#6da455', leafD: '#35521f',
    trunk: '#6b4222',
};

function sprite(w, h) {
    const cv = createCanvas(w, h);
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return { cv, ctx, w, h, px(x, y, ww, hh, col) { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), Math.round(ww), Math.round(hh)); } };
}
function finish(s, file) {
    const out = createCanvas(s.w + 2, s.h + 2);
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = false;
    const tinted = createCanvas(s.w, s.h);
    const tctx = tinted.getContext('2d');
    tctx.drawImage(s.cv, 0, 0);
    tctx.globalCompositeOperation = 'source-in';
    tctx.fillStyle = P.outline;
    tctx.fillRect(0, 0, s.w, s.h);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) octx.drawImage(tinted, 1 + dx, 1 + dy);
    octx.drawImage(s.cv, 1, 1);
    fs.writeFileSync(path.join(OUT, file), out.toBuffer('image/png'));
}
// full-tile diamond (64x32) centered at (cx,cy) — tiles are NOT auto-outlined
// (adjacent tiles must tile seamlessly); edge shading is baked instead.
function tileDiamond(ctx, cx, cy, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 16); ctx.lineTo(cx + 32, cy); ctx.lineTo(cx, cy + 16); ctx.lineTo(cx - 32, cy);
    ctx.closePath(); ctx.fill();
}

// ── grass tiles (3 variants + flower) ──
function grassTile(file, seedFn, flowers) {
    const s = sprite(64, 32);
    tileDiamond(s.ctx, 32, 16, P.grass[0]);
    const rnd = (i) => { const x = Math.sin(i * 127.1 + file.length * 13.7) * 43758.5453; return x - Math.floor(x); };
    // mottling + tufts clipped to the diamond
    s.ctx.save();
    s.ctx.beginPath();
    s.ctx.moveTo(32, 0); s.ctx.lineTo(64, 16); s.ctx.lineTo(32, 32); s.ctx.lineTo(0, 16);
    s.ctx.closePath(); s.ctx.clip();
    for (let i = 0; i < 26; i++) {
        const x = rnd(i) * 64, y = rnd(i + 50) * 32;
        s.px(x, y, 2 + Math.floor(rnd(i + 99) * 2), 1, [P.grass[1], P.grass[2], P.grass[3]][i % 3]);
    }
    for (let i = 0; i < 7; i++) {
        const x = 4 + rnd(i + 200) * 56, y = 6 + rnd(i + 300) * 22;
        s.px(x, y, 1, 3, P.grassD); s.px(x + 1.4, y + 1, 1, 2, P.leafL);
    }
    if (flowers) {
        for (let i = 0; i < 5; i++) {
            const x = 6 + rnd(i + 400) * 52, y = 6 + rnd(i + 500) * 20;
            const col = ['#e8e0d0', '#e8b84a', '#c86a8a'][i % 3];
            s.px(x, y, 2, 2, col); s.px(x - 0.6, y + 1, 1, 2, P.leaf);
        }
    }
    s.ctx.restore();
    // subtle north-lit + south-shaded edges
    s.px(32, 0, 0.01, 0.01, P.grass[2]);
    fs.writeFileSync(path.join(OUT, file), s.cv.toBuffer('image/png'));
}
grassTile('base_grass_a.png');
grassTile('base_grass_b.png');
grassTile('base_grass_c.png');
grassTile('base_grass_flowers.png', null, true);

// ── dirt path tile ──
{
    const s = sprite(64, 32);
    tileDiamond(s.ctx, 32, 16, P.path[0]);
    s.ctx.save();
    s.ctx.beginPath();
    s.ctx.moveTo(32, 0); s.ctx.lineTo(64, 16); s.ctx.lineTo(32, 32); s.ctx.lineTo(0, 16);
    s.ctx.closePath(); s.ctx.clip();
    for (let i = 0; i < 22; i++) {
        const x = Math.sin(i * 91.7) * 0.5 + 0.5, y = Math.sin(i * 45.3) * 0.5 + 0.5;
        s.px(x * 64, y * 32, 2, 1, [P.path[1], P.path[2], P.dirt[1]][i % 3]);
    }
    for (let i = 0; i < 4; i++) s.px(8 + Math.sin(i * 77) * 20 + 20, 8 + Math.sin(i * 33) * 8 + 8, 3, 1, P.dirt[0]);
    s.ctx.restore();
    fs.writeFileSync(path.join(OUT, 'base_path.png'), s.cv.toBuffer('image/png'));
}

// ── water tiles (2 frames: shimmer) ──
for (let f = 0; f < 2; f++) {
    const s = sprite(64, 32);
    tileDiamond(s.ctx, 32, 16, P.water[0]);
    s.ctx.save();
    s.ctx.beginPath();
    s.ctx.moveTo(32, 0); s.ctx.lineTo(64, 16); s.ctx.lineTo(32, 32); s.ctx.lineTo(0, 16);
    s.ctx.closePath(); s.ctx.clip();
    // depth bands
    s.px(10, 8, 44, 3, P.water[1]);
    s.px(16, 20, 32, 3, P.water[2]);
    // shimmer lines (offset per frame)
    for (let i = 0; i < 6; i++) {
        const x = (8 + i * 9 + f * 5) % 56, y = 5 + ((i * 7 + f * 3) % 22);
        s.px(x, y, 5 + (i % 3) * 2, 1, i % 2 ? P.waterL : P.water[1]);
    }
    if (f) { s.px(20, 10, 3, 1, '#dff2f6'); s.px(44, 19, 3, 1, '#dff2f6'); }
    s.ctx.restore();
    fs.writeFileSync(path.join(OUT, `base_water_${f}.png`), s.cv.toBuffer('image/png'));
}

// ── rocky tile (mines ground) ──
{
    const s = sprite(64, 32);
    tileDiamond(s.ctx, 32, 16, P.rock[1]);
    s.ctx.save();
    s.ctx.beginPath();
    s.ctx.moveTo(32, 0); s.ctx.lineTo(64, 16); s.ctx.lineTo(32, 32); s.ctx.lineTo(0, 16);
    s.ctx.closePath(); s.ctx.clip();
    for (let i = 0; i < 18; i++) {
        const x = Math.sin(i * 71.3) * 0.5 + 0.5, y = Math.sin(i * 29.7) * 0.5 + 0.5;
        s.px(x * 60, y * 28, 3 + (i % 3) * 2, 2, [P.rock[0], P.rock[2], P.rock[3]][i % 3]);
    }
    s.ctx.restore();
    fs.writeFileSync(path.join(OUT, 'base_rock.png'), s.cv.toBuffer('image/png'));
}

// ── oak tree prop (2 tiles tall) ──
{
    const s = sprite(44, 62);
    const cx = 22, base = 58;
    s.px(cx - 3, base - 26, 6, 26, P.trunk);
    s.px(cx - 3, base - 26, 2, 26, '#7d5030');
    s.px(cx - 10, base - 4, 8, 3, P.trunk); s.px(cx + 3, base - 6, 8, 3, P.trunk);
    // canopy blobs
    for (const [ox, oy, r, col] of [[0, -38, 15, P.leaf], [-9, -32, 10, P.leaf], [9, -33, 10, P.leaf], [0, -30, 12, P.leaf], [-4, -40, 9, P.leafL], [6, -40, 7, P.leafL]]) {
        s.ctx.fillStyle = col;
        s.ctx.beginPath(); s.ctx.arc(cx + ox, base + oy, r, 0, Math.PI * 2); s.ctx.fill();
    }
    // dithered highlights
    for (let i = 0; i < 10; i++) {
        const a = i * 0.63;
        s.px(cx + Math.cos(a) * 9 - 2, base - 42 + Math.sin(a) * 5, 2, 1, P.leafL);
    }
    finish(s, 'base_tree_oak.png');
}
// ── pine ──
{
    const s = sprite(36, 66);
    const cx = 18, base = 62;
    s.px(cx - 2.5, base - 12, 5, 12, P.trunk);
    for (let t = 0; t < 4; t++) {
        const y = base - 12 - t * 12, w = 13 - t * 2.6;
        s.ctx.fillStyle = t % 2 ? P.leaf : P.leafD;
        s.ctx.beginPath();
        s.ctx.moveTo(cx, y - 14); s.ctx.lineTo(cx + w, y); s.ctx.lineTo(cx - w, y);
        s.ctx.closePath(); s.ctx.fill();
        s.ctx.fillStyle = P.leafL;
        s.ctx.beginPath();
        s.ctx.moveTo(cx, y - 14); s.ctx.lineTo(cx + w * 0.45, y); s.ctx.lineTo(cx - w * 0.1, y);
        s.ctx.closePath(); s.ctx.fill();
    }
    finish(s, 'base_tree_pine.png');
}
// ── bush ──
{
    const s = sprite(24, 18);
    for (const [ox, oy, r, col] of [[7, 9, 6, P.leaf], [15, 10, 5.5, P.leafD], [11, 7, 6.5, P.leafL]]) {
        s.ctx.fillStyle = col;
        s.ctx.beginPath(); s.ctx.arc(ox, oy, r, 0, Math.PI * 2); s.ctx.fill();
    }
    s.px(9, 5, 2, 1, '#e8b84a'); s.px(15, 8, 2, 1, '#c86a8a');
    finish(s, 'base_bush.png');
}
// ── boulder ──
{
    const s = sprite(30, 22);
    s.ctx.fillStyle = P.rock[1];
    s.ctx.beginPath();
    s.ctx.moveTo(3, 18); s.ctx.quadraticCurveTo(1, 8, 10, 4);
    s.ctx.quadraticCurveTo(22, 1, 27, 9); s.ctx.quadraticCurveTo(29, 15, 24, 19);
    s.ctx.closePath(); s.ctx.fill();
    s.ctx.fillStyle = P.rock[0];
    s.ctx.beginPath(); s.ctx.moveTo(8, 6); s.ctx.quadraticCurveTo(16, 2, 22, 7);
    s.ctx.quadraticCurveTo(18, 10, 10, 10); s.ctx.closePath(); s.ctx.fill();
    s.ctx.fillStyle = P.rock[3];
    s.ctx.beginPath(); s.ctx.moveTo(9, 7); s.ctx.quadraticCurveTo(14, 4, 19, 7);
    s.ctx.quadraticCurveTo(14, 8, 9, 8); s.ctx.closePath(); s.ctx.fill();
    s.px(20, 12, 4, 2, P.rock[2]);
    finish(s, 'base_boulder.png');
}
// ── fence segment (runs along the NE-SW tile edge, i.e. x-axis edge) ──
{
    const s = sprite(66, 30);
    // two posts + two rails following iso slope (down 16 over 32 right)
    for (const [x, y] of [[4, 8], [32, 16], [60, 24]]) {
        s.px(x - 1.5, y - 14, 3, 15, P.woodD);
        s.px(x - 1.5, y - 14, 1.2, 15, P.woodL);
    }
    for (const y0 of [-9, -4]) {
        s.ctx.strokeStyle = P.wood; s.ctx.lineWidth = 2.2;
        s.ctx.beginPath(); s.ctx.moveTo(4, 8 + y0); s.ctx.lineTo(60, 24 + y0); s.ctx.stroke();
        s.ctx.strokeStyle = P.woodL; s.ctx.lineWidth = 0.9;
        s.ctx.beginPath(); s.ctx.moveTo(4, 8 + y0); s.ctx.lineTo(60, 24 + y0); s.ctx.stroke();
    }
    fs.writeFileSync(path.join(OUT, 'base_fence.png'), s.cv.toBuffer('image/png'));
}
// ── plot marker (corner stakes + rope outline of a 3x3 plot, flat) ──
{
    const s = sprite(200, 104);
    const cx = 100, cy = 52;
    const corner = (dx, dy) => {
        s.px(cx + dx - 1, cy + dy - 12, 2, 12, P.woodD);
        s.px(cx + dx - 1, cy + dy - 12, 1, 12, P.woodL);
        s.px(cx + dx - 2, cy + dy - 14, 4, 2, P.woodDD);
    };
    // 3x3 tile diamond corners: half-diagonal rx=48, ry=24
    corner(-48, 0); corner(48, 0); corner(0, -24); corner(0, 24);
    // rope between stakes (dashed)
    s.ctx.strokeStyle = '#d9c9a0'; s.ctx.lineWidth = 1.2; s.ctx.setLineDash([3, 3]);
    s.ctx.beginPath();
    s.ctx.moveTo(cx - 48, cy); s.ctx.lineTo(cx, cy - 24); s.ctx.lineTo(cx + 48, cy);
    s.ctx.lineTo(cx, cy + 24); s.ctx.closePath(); s.ctx.stroke();
    s.ctx.setLineDash([]);
    // faint plot glyph
    s.ctx.fillStyle = 'rgba(240,220,160,0.85)';
    s.ctx.font = 'bold 11px sans-serif'; s.ctx.textAlign = 'center';
    fs.writeFileSync(path.join(OUT, 'base_plot_marker.png'), s.cv.toBuffer('image/png'));
}
console.log('[gen] base terrain + props written');
