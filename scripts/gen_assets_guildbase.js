'use strict';
// ===========================================================================
// GEN - GUILD BASE structures (hall L1-5, training L1-5, treasury L1-5, cottage)
// Same style DNA as gen_assets_base_structures.js (palette P, prism/roofX law,
// 1px #241811 outline via source-in tint). Footprints: hall 4x4, training 3x3,
// treasury 2x2. Run: node scripts/gen_assets_guildbase.js
// ===========================================================================
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const OUT = path.join(__dirname, '..', 'core', 'rpgasset', 'guildbase');
fs.mkdirSync(OUT, { recursive: true });

const P = {
    outline: '#241811',
    wood: '#8a5a33', woodL: '#a5744a', woodD: '#6b4222', woodDD: '#4a2d17',
    plaster: '#e0d0b0', plasterD: '#c4b090', plasterL: '#efe3c8',
    stone: '#8d9297', stoneL: '#a8adb2', stoneD: '#6e7378', stoneDD: '#565a5e',
    brick: '#b06a52', brickD: '#8a4a38',
    roofR: '#a8433a', roofRD: '#7c2f28', roofRL: '#c05a4c',
    roofT: '#3e7f8c', roofTD: '#2f6673', roofTL: '#4a909d',
    roofP: '#7c3f74', roofPD: '#5d2e56', roofPL: '#8d4a85',
    iron: '#5a5e64', ironL: '#7d8287', ironD: '#43464a',
    gold: '#e8b84a', goldL: '#f4d06a', goldD: '#b8882e',
    white: '#eee8dc', whiteD: '#d5cbb8',
    leaf: '#4a7238', leafL: '#6da455', leafD: '#35521f',
    glass: '#7ec47a', glassL: '#aee8aa', glassD: '#4e9450',
    crystal: '#9adce8', crystalL: '#d0f2f8',
    thatch: '#c2a05a', thatchD: '#a08040', thatchL: '#d4b470',
    sand: '#d8c48c', sandD: '#b8a070',
    crimson: '#a02c3c', crimsonD: '#7c1e2c',
    teal: '#2a6a6e', tealD: '#1e4e52',
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
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        octx.drawImage(tinted, 1 + dx, 1 + dy);
    }
    octx.drawImage(s.cv, 1, 1);
    fs.writeFileSync(path.join(OUT, file), out.toBuffer('image/png'));
}
function poly(s, pts, col) {
    s.ctx.fillStyle = col;
    s.ctx.beginPath();
    s.ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) s.ctx.lineTo(pts[i][0], pts[i][1]);
    s.ctx.closePath(); s.ctx.fill();
}
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

function prism(s, cx, cy, wT, hPx, top, left, right) {
    const EW = wT * 32, NS = wT * 16;
    const N = [cx, cy - hPx - NS], E = [cx + EW, cy - hPx], S = [cx, cy - hPx + NS], W = [cx - EW, cy - hPx];
    poly(s, [N, E, S, W], top);
    poly(s, [W, S, [S[0], S[1] + hPx], [W[0], W[1] + hPx]], left);
    poly(s, [E, S, [S[0], S[1] + hPx], [E[0], E[1] + hPx]], right);
    return { N, E, S, W, EW, NS, hPx };
}
function roofX(s, cx, cy, wT, hBase, ridgeH, neCol, swCol, gableCol, overhang = 0.06) {
    const wT2 = wT * (1 + overhang);
    const EW = wT2 * 32, NS = wT2 * 16;
    const N = [cx, cy - hBase - NS], E = [cx + EW, cy - hBase], S = [cx, cy - hBase + NS], W = [cx - EW, cy - hBase];
    const rA = [cx - EW / 2, cy - hBase - NS / 2 - ridgeH], rB = [cx + EW / 2, cy - hBase + NS / 2 - ridgeH];
    poly(s, [rA, rB, E, N], neCol);
    poly(s, [rA, rB, S, W], swCol);
    poly(s, [E, S, rB], gableCol);
    return { rA, rB, N, E, S, W };
}
function doorOn(s, S, E, hPx, wW, hH, col) {
    const m = mid(S, E);
    const by = m[1] + hPx;
    s.ctx.fillStyle = col || P.woodDD;
    s.ctx.beginPath();
    s.ctx.moveTo(m[0] - wW / 2, by); s.ctx.lineTo(m[0] - wW / 2, by - hH * 0.7);
    s.ctx.quadraticCurveTo(m[0], by - hH * 1.12, m[0] + wW / 2, by - hH * 0.7);
    s.ctx.lineTo(m[0] + wW / 2, by); s.ctx.closePath(); s.ctx.fill();
    s.px(m[0] + wW / 2 - 3.2, by - hH * 0.45, 1.6, 1.6, P.gold);
}
function winOn(s, S, E, hPx, u, v, w, h, glass) {
    const m = mid(S, E);
    const x = m[0] + (E[0] - m[0]) * (u - 0.5) * 2;
    const y = m[1] + hPx * (1 - v);
    s.px(x - w / 2, y - h, w, h, P.woodDD);
    s.px(x - w / 2 + 1.2, y - h + 1.2, w - 2.4, h - 2.4, glass || P.glass);
    s.px(x - w / 2 + 1.2, y - h / 2, w - 2.4, 1, P.woodDD);
}
function towerPrism(s, cx, cy, wT, hPx, top, left, right) {
    return prism(s, cx, cy, wT, hPx, top, left, right);
}
function coneRoof(s, apexX, apexY, spanL, spanR, baseY, colL, colR) {
    poly(s, [[apexX, apexY], [apexX + spanR, baseY], [apexX, baseY + (baseY - apexY) * 0.28]], colL);
    poly(s, [[apexX, apexY], [apexX - spanL, baseY], [apexX, baseY + (baseY - apexY) * 0.28]], colR);
}
function bannerOn(s, x, y, col, colD) {
    s.px(x - 1, y, 2, 15, P.woodDD);
    s.ctx.fillStyle = col;
    s.ctx.beginPath();
    s.ctx.moveTo(x + 1, y + 1); s.ctx.lineTo(x + 12, y + 1); s.ctx.lineTo(x + 12, y + 13);
    s.ctx.lineTo(x + 6.5, y + 9); s.ctx.lineTo(x + 1, y + 13);
    s.ctx.closePath(); s.ctx.fill();
    s.ctx.fillStyle = colD;
    s.ctx.beginPath();
    s.ctx.moveTo(x + 6.5, y + 1); s.ctx.lineTo(x + 12, y + 1); s.ctx.lineTo(x + 12, y + 13);
    s.ctx.lineTo(x + 6.5, y + 9); s.ctx.closePath(); s.ctx.fill();
}
function flagPole(s, x, yBase, hgt, col, colD) {
    s.px(x - 1, yBase - hgt, 2.5, hgt, P.woodDD);
    s.ctx.fillStyle = col;
    s.ctx.beginPath();
    s.ctx.moveTo(x + 1.5, yBase - hgt + 1); s.ctx.lineTo(x + 20, yBase - hgt + 4);
    s.ctx.lineTo(x + 1.5, yBase - hgt + 12);
    s.ctx.closePath(); s.ctx.fill();
    s.ctx.fillStyle = colD;
    s.ctx.beginPath();
    s.ctx.moveTo(x + 1.5, yBase - hgt + 6); s.ctx.lineTo(x + 20, yBase - hgt + 4);
    s.ctx.lineTo(x + 1.5, yBase - hgt + 12);
    s.ctx.closePath(); s.ctx.fill();
    s.px(x + 0.2, yBase - hgt - 2.4, 4, 3, P.gold);
}
function dummy(s, x, y, scale = 1) {
    const k = scale;
    s.px(x - 3 * k, y - 30 * k, 6 * k, 30 * k, P.woodD);       // post
    s.px(x - 16 * k, y - 26 * k, 32 * k, 4 * k, P.woodDD);     // arms bar
    s.ctx.fillStyle = P.thatch;                                 // straw head
    s.ctx.beginPath(); s.ctx.arc(x, y - 34 * k, 6 * k, 0, Math.PI * 2); s.ctx.fill();
    s.px(x - 10 * k, y - 16 * k, 20 * k, 3 * k, P.woodDD);     // belt
    s.px(x + 12 * k, y - 40 * k, 4 * k, 14 * k, P.ironL);      // stuck sword
}
function rackOn(s, x, y) {
    s.px(x - 14, y - 20, 3, 20, P.woodDD); s.px(x + 11, y - 20, 3, 20, P.woodDD);
    s.px(x - 14, y - 20, 28, 3, P.woodDD);
    for (let i = 0; i < 3; i++) s.px(x - 9 + i * 8, y - 26, 2.5, 15, i === 1 ? P.ironL : P.iron);
}
function goldPile(s, x, y, k = 1) {
    s.ctx.fillStyle = P.goldD;
    s.ctx.beginPath(); s.ctx.ellipse(x, y, 16 * k, 6 * k, 0, 0, Math.PI * 2); s.ctx.fill();
    s.ctx.fillStyle = P.gold;
    s.ctx.beginPath(); s.ctx.ellipse(x, y - 4 * k, 12 * k, 5 * k, 0, 0, Math.PI * 2); s.ctx.fill();
    s.ctx.fillStyle = P.goldL;
    s.ctx.beginPath(); s.ctx.ellipse(x, y - 8 * k, 7 * k, 3.4 * k, 0, 0, Math.PI * 2); s.ctx.fill();
}
function brazier(s, x, y) {
    s.px(x - 5, y - 8, 10, 3, P.ironD);
    s.px(x - 2, y - 5, 4, 5, P.ironD);
    s.px(x - 6, y - 12, 12, 4, P.iron);
    s.px(x - 3, y - 16, 6, 4, '#e06a2b'); s.px(x - 1.5, y - 18, 3, 3, '#ffd24a');
}

function def(file, w, h, fn) {
    const s = sprite(w, h);
    fn(s, w / 2, h - 10);
    finish(s, file);
    console.log(`[gen] ${file} (${w}x${h})`);
}

// =========== GUILD HALL - 4x4 (EW=128, NS=64) ===========
def('gb_hall_l1.png', 300, 210, (s, cx, cy) => {
    const p = prism(s, cx, cy, 4, 38, P.woodL, P.woodD, P.wood);
    roofX(s, cx, cy, 4, 38, 30, P.thatchD, P.thatch, P.thatchL, 0.07);
    doorOn(s, p.S, p.E, 38, 22, 30);
    winOn(s, p.S, p.W, 38, 0.35, 0.55, 14, 11, '#3a2b1c');
    winOn(s, p.S, p.E, 38, 0.72, 0.55, 13, 10, '#3a2b1c');
    flagPole(s, cx - 96, cy - 84, 52, P.crimson, P.crimsonD);
 // bench + shield by the door
    s.px(cx + 84, cy - 8, 22, 5, P.woodDD); s.px(cx + 88, cy - 5, 3, 5, P.woodDD); s.px(cx + 99, cy - 5, 3, 5, P.woodDD);
});
def('gb_hall_l2.png', 306, 224, (s, cx, cy) => {
    const p = prism(s, cx, cy, 4, 46, P.stoneL, P.stoneD, P.stone);
    roofX(s, cx, cy, 4, 46, 32, P.roofRD, P.roofR, P.roofRL, 0.07);
    doorOn(s, p.S, p.E, 46, 22, 32, P.woodD);
    winOn(s, p.S, p.W, 46, 0.32, 0.55, 15, 12);
    winOn(s, p.S, p.W, 46, 0.68, 0.55, 15, 12);
    winOn(s, p.S, p.E, 46, 0.75, 0.55, 13, 11);
    flagPole(s, cx - 100, cy - 92, 58, P.crimson, P.crimsonD);
    bannerOn(s, cx + 66, cy - 108, '#2a6a4e', '#1e4a38');
 // stone steps
    s.px(cx + 52, cy - 2, 30, 4, P.stoneD); s.px(cx + 56, cy + 2, 22, 3, P.stoneDD);
});
def('gb_hall_l3.png', 316, 244, (s, cx, cy) => {
    const p = prism(s, cx, cy, 4, 52, P.stoneL, P.stoneD, P.stone);
    const r = roofX(s, cx, cy, 4, 52, 34, P.roofRD, P.roofR, P.roofRL, 0.06);
 // west watch tower
    const tp = towerPrism(s, cx - 108, cy + 14, 1.3, 86, P.stoneL, P.stoneD, P.stone);
    coneRoof(s, tp.N[0], tp.N[1] - 34, 30, 34, tp.W[1] + 6, P.roofRD, P.roofPD);
    winOn(s, tp.S, tp.E, 86, 0.5, 0.72, 9, 11);
    winOn(s, tp.S, tp.E, 86, 0.5, 0.42, 9, 11);
    flagPole(s, tp.N[0] - 2, tp.N[1] - 30, 26, P.crimson, P.crimsonD);
    doorOn(s, p.S, p.E, 52, 24, 34, P.woodD);
    winOn(s, p.S, p.W, 52, 0.35, 0.55, 15, 12);
    winOn(s, p.S, p.E, 52, 0.72, 0.55, 14, 12);
    bannerOn(s, cx + 78, cy - 118, '#2a6a4e', '#1e4a38');
    chimneyAt(s, cx - 10, r.rA[1] + 12, 11, cy - 20 - (r.rA[1] + 12));
});
function chimneyAt(s, x, yTop, w, h) {
    s.px(x, yTop, w, h, P.brickD);
    s.px(x, yTop, w, 2.4, P.brick);
    s.px(x + 1, yTop + 3, 1.4, h - 6, '#8a4a38');
}
def('gb_hall_l4.png', 330, 262, (s, cx, cy) => {
    const p = prism(s, cx, cy, 4, 58, P.plasterL, P.plasterD, P.plaster);
    const r = roofX(s, cx, cy, 4, 58, 38, P.roofTD, P.roofT, P.roofTL, 0.06);
 // twin towers
    const t1 = towerPrism(s, cx - 112, cy + 16, 1.2, 92, P.stoneL, P.stoneD, P.stone);
    coneRoof(s, t1.N[0], t1.N[1] - 36, 28, 32, t1.W[1] + 6, P.roofTD, P.roofPD);
    const t2 = towerPrism(s, cx + 112, cy - 26, 1.2, 92, P.stoneL, P.stoneD, P.stone);
    coneRoof(s, t2.N[0], t2.N[1] - 36, 28, 32, t2.W[1] + 6, P.roofTD, P.roofPD);
    flagPole(s, t1.N[0] - 2, t1.N[1] - 32, 26, P.gold, P.goldD);
    winOn(s, t1.S, t1.E, 92, 0.5, 0.6, 8, 10);
    winOn(s, t2.S, t2.W, 92, 0.5, 0.6, 8, 10);
 // gold ridge trim
    s.ctx.strokeStyle = P.gold; s.ctx.lineWidth = 2.4;
    s.ctx.beginPath(); s.ctx.moveTo(r.rA[0], r.rA[1] - 1); s.ctx.lineTo(r.rB[0], r.rB[1] - 1); s.ctx.stroke();
    doorOn(s, p.S, p.E, 58, 26, 38, P.woodDD);
    winOn(s, p.S, p.W, 58, 0.35, 0.55, 16, 13);
    winOn(s, p.S, p.E, 58, 0.72, 0.55, 15, 12);
    bannerOn(s, cx + 84, cy - 132, '#b8862e', '#8a6420');
});
def('gb_hall_l5.png', 344, 282, (s, cx, cy) => {
    const p = prism(s, cx, cy, 4, 64, P.stoneL, P.stoneDD, P.stoneD);
    const r = roofX(s, cx, cy, 4, 64, 42, P.roofPD, P.roofP, P.roofPL, 0.06);
 // central keep tower
    const kt = towerPrism(s, cx + 6, cy - 96, 1.5, 104, P.stoneL, P.stoneD, P.stone);
    coneRoof(s, kt.N[0], kt.N[1] - 40, 34, 38, kt.W[1] + 7, P.roofPD, P.roofRD);
    flagPole(s, kt.N[0] - 2, kt.N[1] - 36, 30, P.gold, P.goldD);
    winOn(s, kt.S, kt.E, 104, 0.5, 0.62, 10, 12, P.crystal);
    winOn(s, kt.S, kt.E, 104, 0.5, 0.34, 10, 12, P.crystal);
 // flanking towers
    const t1 = towerPrism(s, cx - 116, cy + 18, 1.15, 96, P.stoneL, P.stoneD, P.stone);
    coneRoof(s, t1.N[0], t1.N[1] - 38, 28, 32, t1.W[1] + 6, P.roofPD, P.roofRD);
    flagPole(s, t1.N[0] - 2, t1.N[1] - 34, 26, P.gold, P.goldD);
    const t2 = towerPrism(s, cx + 118, cy - 22, 1.15, 96, P.stoneL, P.stoneD, P.stone);
    coneRoof(s, t2.N[0], t2.N[1] - 38, 28, 32, t2.W[1] + 6, P.roofPD, P.roofRD);
 // gold gate arch
    doorOn(s, p.S, p.E, 64, 30, 44, P.woodDD);
    const m = mid(p.S, p.E);
    s.ctx.strokeStyle = P.gold; s.ctx.lineWidth = 3;
    s.ctx.beginPath();
    s.ctx.moveTo(m[0] - 17, m[1] + 64); s.ctx.lineTo(m[0] - 17, m[1] + 26);
    s.ctx.quadraticCurveTo(m[0], m[1] + 8, m[0] + 17, m[1] + 26);
    s.ctx.lineTo(m[0] + 17, m[1] + 64); s.ctx.stroke();
    winOn(s, p.S, p.W, 64, 0.35, 0.55, 16, 13, P.crystal);
    winOn(s, p.S, p.E, 64, 0.72, 0.55, 15, 12, P.crystal);
    bannerOn(s, cx - 88, cy - 148, '#b8862e', '#8a6420');
    bannerOn(s, cx + 92, cy - 128, '#b8862e', '#8a6420');
});

// =========== TRAINING GROUND - 3x3 open yard ===========
def('gb_training_l1.png', 230, 130, (s, cx, cy) => {
    dummy(s, cx - 40, cy - 12, 1.15);
    rackOn(s, cx + 44, cy - 4);
    s.px(cx - 78, cy + 2, 26, 3, P.sandD);
});
def('gb_training_l2.png', 238, 146, (s, cx, cy) => {
 // wooden spar ring
    s.ctx.strokeStyle = P.woodD; s.ctx.lineWidth = 3;
    s.ctx.beginPath(); s.ctx.ellipse(cx, cy - 14, 92, 34, 0, 0, Math.PI * 2); s.ctx.stroke();
    for (const a of [0.2, 0.65, 1.1, 1.55, 2.0, 2.45, 2.9, 3.35, 3.8, 4.25, 4.7, 5.15, 5.6, 6.05]) {
        const px2 = cx + Math.cos(a) * 92, py = cy - 14 + Math.sin(a) * 34;
        s.px(px2 - 1.5, py - 12, 3, 12, P.woodDD);
    }
    dummy(s, cx - 34, cy - 18, 1.2);
    rackOn(s, cx + 52, cy - 8);
});
def('gb_training_l3.png', 244, 158, (s, cx, cy) => {
    s.ctx.strokeStyle = P.woodD; s.ctx.lineWidth = 3.4;
    s.ctx.beginPath(); s.ctx.ellipse(cx, cy - 16, 98, 37, 0, 0, Math.PI * 2); s.ctx.stroke();
    for (const a of [0.2, 0.65, 1.1, 1.55, 2.0, 2.45, 2.9, 3.35, 3.8, 4.25, 4.7, 5.15, 5.6, 6.05]) {
        const px2 = cx + Math.cos(a) * 98, py = cy - 16 + Math.sin(a) * 37;
        s.px(px2 - 1.5, py - 14, 3, 14, P.woodDD);
    }
    dummy(s, cx - 40, cy - 20, 1.2);
    dummy(s, cx + 30, cy - 6, 1.0);
 // archery butt
    s.px(cx + 74, cy - 34, 3, 26, P.woodDD);
    s.ctx.fillStyle = P.thatch; s.ctx.beginPath(); s.ctx.arc(cx + 76, cy - 40, 11, 0, Math.PI * 2); s.ctx.fill();
    s.ctx.fillStyle = P.crimson; s.ctx.beginPath(); s.ctx.arc(cx + 76, cy - 40, 6, 0, Math.PI * 2); s.ctx.fill();
    s.ctx.fillStyle = P.thatchL; s.ctx.beginPath(); s.ctx.arc(cx + 76, cy - 40, 2.4, 0, Math.PI * 2); s.ctx.fill();
    rackOn(s, cx - 88, cy - 2);
});
def('gb_training_l4.png', 250, 172, (s, cx, cy) => {
 // stone ring
    s.ctx.strokeStyle = P.stoneD; s.ctx.lineWidth = 5;
    s.ctx.beginPath(); s.ctx.ellipse(cx, cy - 16, 102, 39, 0, 0, Math.PI * 2); s.ctx.stroke();
    s.ctx.strokeStyle = P.stoneL; s.ctx.lineWidth = 1.6;
    s.ctx.beginPath(); s.ctx.ellipse(cx, cy - 18, 102, 39, 0, 0, Math.PI * 2); s.ctx.stroke();
    dummy(s, cx - 44, cy - 22, 1.25);
    dummy(s, cx + 34, cy - 4, 1.05);
    flagPole(s, cx - 108, cy - 6, 44, P.crimson, P.crimsonD);
    flagPole(s, cx + 104, cy - 44, 40, P.crimson, P.crimsonD);
    rackOn(s, cx - 6, cy - 48);
});
def('gb_training_l5.png', 258, 186, (s, cx, cy) => {
 // stone arena with inner sand floor
    s.ctx.fillStyle = P.sand;
    s.ctx.beginPath(); s.ctx.ellipse(cx, cy - 16, 100, 38, 0, 0, Math.PI * 2); s.ctx.fill();
    s.ctx.strokeStyle = P.stoneD; s.ctx.lineWidth = 7;
    s.ctx.beginPath(); s.ctx.ellipse(cx, cy - 16, 106, 41, 0, 0, Math.PI * 2); s.ctx.stroke();
    s.ctx.strokeStyle = P.stoneL; s.ctx.lineWidth = 2;
    s.ctx.beginPath(); s.ctx.ellipse(cx, cy - 18, 106, 41, 0, 0, Math.PI * 2); s.ctx.stroke();
 // tier seats hint (back arc)
    s.ctx.strokeStyle = P.stone; s.ctx.lineWidth = 4;
    s.ctx.beginPath(); s.ctx.ellipse(cx, cy - 24, 112, 43, 0, Math.PI * 1.05, Math.PI * 1.95); s.ctx.stroke();
    dummy(s, cx - 46, cy - 24, 1.3);
    dummy(s, cx + 38, cy - 6, 1.1);
    brazier(s, cx - 118, cy - 4);
    brazier(s, cx + 112, cy - 40);
    flagPole(s, cx - 2, cy - 66, 52, P.gold, P.goldD);
    flagPole(s, cx - 132, cy - 8, 46, P.crimson, P.crimsonD);
});

// =========== TREASURY - 2x2 (EW=64, NS=32) ===========
def('gb_treasury_l1.png', 150, 108, (s, cx, cy) => {
 // great coin chest
    s.px(cx - 30, cy - 26, 60, 26, P.woodD);
    s.px(cx - 32, cy - 34, 64, 10, P.wood);
    s.ctx.strokeStyle = P.gold; s.ctx.lineWidth = 2;
    s.px(cx - 4, cy - 30, 8, 8, P.gold);
    s.px(cx - 30, cy - 18, 60, 3, P.goldD);
    s.ctx.fillStyle = P.gold;
    for (const [ox, oy] of [[-18, -4], [0, -2], [16, -5]]) s.ctx.beginPath(), s.ctx.arc(cx + ox, cy + oy, 4, 0, Math.PI * 2), s.ctx.fill();
    s.px(cx - 3, cy - 22, 6, 5, P.ironL);
});
def('gb_treasury_l2.png', 156, 124, (s, cx, cy) => {
    const p = prism(s, cx, cy, 2, 26, P.stoneL, P.stoneD, P.stone);
    roofX(s, cx, cy, 2, 26, 18, P.ironD, P.iron, P.ironL, 0.1);
 // iron-banded door
    const m = mid(p.S, p.E);
    s.px(m[0] - 9, m[1] + 26, 18, 20, P.woodDD);
    s.px(m[0] - 9, m[1] + 30, 18, 2.4, P.ironL); s.px(m[0] - 9, m[1] + 38, 18, 2.4, P.ironL);
    s.px(m[0] + 4, m[1] + 36, 3, 3, P.gold);
    winOn(s, p.S, p.W, 26, 0.5, 0.6, 10, 8, '#3a2b1c');
});
def('gb_treasury_l3.png', 162, 134, (s, cx, cy) => {
    const p = prism(s, cx, cy, 2, 32, P.stoneL, P.stoneD, P.stone);
    roofX(s, cx, cy, 2, 32, 20, P.roofRD, P.roofR, P.roofRL, 0.1);
    const m = mid(p.S, p.E);
 // gold door
    s.px(m[0] - 11, m[1] + 32, 22, 24, P.goldD);
    s.px(m[0] - 9, m[1] + 34, 18, 20, P.gold);
    s.px(m[0] - 2, m[1] + 42, 4, 4, P.woodDD);
    winOn(s, p.S, p.W, 32, 0.5, 0.55, 11, 9, '#3a2b1c');
 // bars on window
    s.px(m[0] + 20, m[1] + 8, 1.6, 9, P.woodDD);
    goldPile(s, cx - 52, cy - 4, 0.8);
});
def('gb_treasury_l4.png', 172, 146, (s, cx, cy) => {
    const p = prism(s, cx, cy, 2, 38, P.stoneL, P.stoneDD, P.stoneD);
    roofX(s, cx, cy, 2, 38, 22, P.ironD, P.ironD, P.iron, 0.1);
    const m = mid(p.S, p.E);
    s.px(m[0] - 12, m[1] + 38, 24, 26, P.goldD);
    s.px(m[0] - 10, m[1] + 40, 20, 22, P.gold);
    s.px(m[0] - 2, m[1] + 48, 4, 5, P.woodDD);
    winOn(s, p.S, p.W, 38, 0.5, 0.55, 11, 10, '#3a2b1c');
    goldPile(s, cx - 56, cy - 4, 1.0);
    goldPile(s, cx + 58, cy - 8, 0.85);
 // corner buttress
    s.px(cx + 44, cy - 30, 5, 30, P.stone);
});
def('gb_treasury_l5.png', 184, 160, (s, cx, cy) => {
    const p = prism(s, cx, cy, 2, 44, P.stoneL, P.stoneDD, P.stoneD);
    roofX(s, cx, cy, 2, 44, 24, P.roofPD, P.roofP, P.roofPL, 0.1);
 // gold dome finial
    s.ctx.fillStyle = P.gold;
    s.ctx.beginPath(); s.ctx.arc(cx, cy - 44 - 32 - 14, 6, 0, Math.PI * 2); s.ctx.fill();
    s.px(cx - 1.4, cy - 44 - 32 - 24, 2.8, 10, P.goldL);
    const m = mid(p.S, p.E);
    s.px(m[0] - 13, m[1] + 44, 26, 28, P.goldD);
    s.px(m[0] - 11, m[1] + 46, 22, 24, P.gold);
    s.px(m[0] - 2, m[1] + 55, 4, 5, P.woodDD);
    winOn(s, p.S, p.W, 44, 0.5, 0.55, 12, 10, P.crystal);
    winOn(s, p.S, p.E, 44, 0.5, 0.55, 12, 10, P.crystal);
    goldPile(s, cx - 58, cy - 4, 1.1);
    goldPile(s, cx + 60, cy - 10, 0.95);
    s.ctx.fillStyle = P.crystal;
    s.ctx.beginPath(); s.ctx.moveTo(cx + 40, cy - 18); s.ctx.lineTo(cx + 45, cy - 30); s.ctx.lineTo(cx + 50, cy - 18); s.ctx.closePath(); s.ctx.fill();
});

// =========== MEMBER COTTAGE (small, 1-tile-ish) ===========
def('gb_cottage.png', 104, 78, (s, cx, cy) => {
    const p = prism(s, cx, cy, 1.35, 16, P.plaster, P.plasterD, P.plaster);
    roofX(s, cx, cy, 1.35, 16, 13, P.thatchD, P.thatch, P.thatchL, 0.12);
    doorOn(s, p.S, p.E, 16, 9, 12);
    winOn(s, p.S, p.W, 16, 0.5, 0.5, 7, 6, '#3a2b1c');
});

console.log('[gen] guild base sprites complete');
