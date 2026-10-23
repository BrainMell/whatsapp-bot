'use strict';
// ===========================================================================
// GEN v2 - outdoor base structures, 3 upgrade levels each (Sections 6/7/10)
// Correct iso math: square footprint wT tiles → base diamond half-extents
// EW = wT*32 (screen x), NS = wT*16 (screen y). Ridge runs along grid +x.
// Run: node scripts/gen_assets_base_structures.js (writes structures.json too)
// ===========================================================================
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const OUT = path.join(__dirname, '..', 'core', 'rpgasset', 'homestead');
const P = {
    outline: '#241811',
    wood: '#8a5a33', woodL: '#a5744a', woodD: '#6b4222', woodDD: '#4a2d17',
    plaster: '#e0d0b0', plasterD: '#c4b090', plasterL: '#efe3c8',
    stone: '#8d9297', stoneL: '#a8adb2', stoneD: '#6e7378', stoneDD: '#565a5e',
    brick: '#b06a52', brickD: '#8a4a38',
    roofR: '#a8433a', roofRD: '#7c2f28', roofRL: '#c05a4c',
    roofT: '#3e7f8c', roofTD: '#2f6673', roofTL: '#4a909d',
    roofP: '#7c3f74', roofPD: '#5d2e56', roofPL: '#8d4a85',
    iron: '#5a5e64', ironL: '#7d8287',
    gold: '#e8b84a', goldD: '#b8882e',
    white: '#eee8dc', whiteD: '#d5cbb8',
    leaf: '#4a7238', leafL: '#6da455', leafD: '#35521f',
    water: '#4a909d', waterL: '#7ec4cf', waterD: '#2f6673',
    glass: '#7ec47a', glassL: '#aee8aa', glassD: '#4e9450',
    crystal: '#9adce8', crystalL: '#d0f2f8',
    thatch: '#c2a05a', thatchD: '#a08040', thatchL: '#d4b470',
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

// square footprint prism: wT tiles along each grid axis, hPx tall
function prism(s, cx, cy, wT, hPx, top, left, right) {
    const EW = wT * 32, NS = wT * 16;
    const N = [cx, cy - hPx - NS], E = [cx + EW, cy - hPx], S = [cx, cy - hPx + NS], W = [cx - EW, cy - hPx];
    poly(s, [N, E, S, W], top);
    poly(s, [W, S, [S[0], S[1] + hPx], [W[0], W[1] + hPx]], left);
    poly(s, [E, S, [S[0], S[1] + hPx], [E[0], E[1] + hPx]], right);
    return { N, E, S, W, EW, NS, hPx };
}

// gabled roof along grid +x over a wT prism whose walls are hBase tall
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

// helpers anchored to faces
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
 // u along S→E (0..1), v = height fraction of wall (0 bottom..1 top)
    const m = mid(S, E);
    const x = m[0] + (E[0] - m[0]) * (u - 0.5) * 2;
    const y = m[1] + hPx * (1 - v);
    s.px(x - w / 2, y - h, w, h, P.woodDD);
    s.px(x - w / 2 + 1.2, y - h + 1.2, w - 2.4, h - 2.4, glass || P.glass);
    s.px(x - w / 2 + 1.2, y - h / 2, w - 2.4, 1, P.woodDD);
}
function chimneyAt(s, x, yTop, w, h) {
    s.px(x, yTop, w, h, P.brickD);
    s.px(x, yTop, w, 2.4, P.brick);
    s.px(x + 1, yTop + 3, 1.4, h - 6, '#8a4a38');
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

const DEF = [];
function def(id, file, w, h, fn, meta) {
    const s = sprite(w, h);
    fn(s, w / 2, h - 10); // cx, ground-center y
    s.file = file;
    finish(s, file);
    DEF.push({ id, file: `rpgasset/homestead/${file}`, ...meta });
}

// =========== HOUSE (3x3) ===========
def('house', 'base_house_l1.png', 200, 128, (s, cx, cy) => {
    const p = prism(s, cx, cy, 3, 26, P.thatch, P.plasterD, P.plaster);
    roofX(s, cx, cy, 3, 26, 22, P.thatchD, P.thatch, P.thatchL, 0.1);
 // thatch comb lines on the SW slope
    s.ctx.strokeStyle = 'rgba(120,90,40,0.55)'; s.ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
        s.ctx.beginPath();
        s.ctx.moveTo(cx - 96 + i * 14, cy - 26 - 8 + i * 4);
        s.ctx.lineTo(cx - 60 + i * 14, cy - 26 + 16 + i * 4);
        s.ctx.stroke();
    }
    doorOn(s, p.S, p.E, 26, 16, 20);
    winOn(s, p.S, p.W, 26, 0.4, 0.55, 12, 9, '#3a2b1c');
}, { name: 'Hovel', fw: 3, fh: 3 });

def('house', 'base_house_l2.png', 210, 150, (s, cx, cy) => {
    const p = prism(s, cx, cy, 3, 34, P.plasterL, P.plasterD, P.plaster);
 // timber framing on left wall
    s.ctx.strokeStyle = P.woodDD; s.ctx.lineWidth = 2;
    s.ctx.beginPath();
    s.ctx.moveTo(p.W[0] + 6, p.W[1] + 4); s.ctx.lineTo(p.W[0] + 6, p.W[1] + 34);
    s.ctx.moveTo(mid(p.W, p.S)[0] - 20, mid(p.W, p.S)[1] + 12); s.ctx.lineTo(mid(p.W, p.S)[0] - 20, mid(p.W, p.S)[1] + 32);
    s.ctx.stroke();
    const r = roofX(s, cx, cy, 3, 34, 26, P.roofRD, P.roofR, P.roofRL, 0.08);
    chimneyAt(s, cx + 40, r.rB[1] + 6, 11, cy - 10 - (r.rB[1] + 6));
    doorOn(s, p.S, p.E, 34, 17, 24, P.woodD);
    winOn(s, p.S, p.W, 34, 0.35, 0.5, 13, 11);
    winOn(s, p.S, p.E, 34, 0.75, 0.5, 12, 10);
    s.px(cx - 8, cy - 2, 14, 2, P.stoneD);
}, { name: 'Cottage', fw: 3, fh: 3 });

def('house', 'base_house_l3.png', 230, 176, (s, cx, cy) => {
    const p = prism(s, cx, cy, 3, 44, P.plasterL, P.plasterD, P.plaster);
    const r = roofX(s, cx, cy, 3, 44, 32, P.roofRD, P.roofR, P.roofRL, 0.07);
 // tower on the west side
    const tp = prism(s, cx - 86, cy + 12, 1.1, 74, P.stoneL, P.stoneD, P.stone);
    poly(s, [[tp.N[0], tp.N[1] - 26], [tp.N[0] + 26, tp.E[1] + 4], [tp.W[0] + 2, tp.W[1] + 4]], P.roofPD);
    winOn(s, tp.S, tp.E, 74, 0.5, 0.75, 9, 10);
    winOn(s, tp.S, tp.E, 74, 0.5, 0.45, 9, 10);
    doorOn(s, p.S, p.E, 44, 18, 28, P.woodD);
    winOn(s, p.S, p.W, 44, 0.35, 0.55, 14, 12);
    winOn(s, p.S, p.E, 44, 0.72, 0.55, 13, 11);
    bannerOn(s, cx + 62, cy - 96, '#2a6a4e', '#1e4a38');
    chimneyAt(s, cx - 6, r.rA[1] + 10, 10, cy - 16 - (r.rA[1] + 10));
}, { name: 'Manor', fw: 3, fh: 3 });

// =========== BLACKSMITH (3x3) ===========
def('blacksmith', 'base_smithy_l1.png', 200, 118, (s, cx, cy) => {
    const p = prism(s, cx, cy, 3, 24, P.stoneD, P.stoneD, P.brickD);
    roofX(s, cx, cy, 3, 24, 18, P.iron, P.ironL, P.ironL, 0.1);
 // open forge mouth on right wall + glow
    const m = mid(p.S, p.E);
    s.ctx.fillStyle = '#1a0e08';
    s.ctx.beginPath();
    s.ctx.moveTo(m[0] - 22, m[1] + 24); s.ctx.lineTo(m[0] - 22, m[1] + 8);
    s.ctx.quadraticCurveTo(m[0], m[1] - 2, m[0] + 22, m[1] + 8);
    s.ctx.lineTo(m[0] + 22, m[1] + 24); s.ctx.closePath(); s.ctx.fill();
    s.px(m[0] - 14, m[1] + 18, 22, 6, '#d95f2b'); s.px(m[0] - 6, m[1] + 16, 8, 3, '#f4a24a');
    chimneyAt(s, cx + 52, cy - 74, 12, 22);
 // anvil
    s.px(cx - 66, cy - 12, 13, 5, P.ironL); s.px(cx - 61, cy - 7, 4, 5, P.woodDD);
}, { name: 'Forge Shed', fw: 3, fh: 3 });

def('blacksmith', 'base_smithy_l2.png', 210, 138, (s, cx, cy) => {
    const p = prism(s, cx, cy, 3, 30, P.stoneD, P.brickD, P.brick);
    const r = roofX(s, cx, cy, 3, 30, 22, P.ironD, P.iron, P.ironL, 0.08);
    chimneyAt(s, cx + 56, r.rB[1] + 4, 13, 26);
    chimneyAt(s, cx - 58, r.rA[1] + 16, 11, 18);
    const m = mid(p.S, p.E);
    s.ctx.fillStyle = '#1a0e08';
    s.ctx.beginPath();
    s.ctx.moveTo(m[0] - 26, m[1] + 30); s.ctx.lineTo(m[0] - 26, m[1] + 10);
    s.ctx.quadraticCurveTo(m[0], m[1] - 4, m[0] + 26, m[1] + 10);
    s.ctx.lineTo(m[0] + 26, m[1] + 30); s.ctx.closePath(); s.ctx.fill();
    s.px(m[0] - 17, m[1] + 22, 26, 8, '#d95f2b'); s.px(m[0] - 7, m[1] + 20, 9, 4, '#ffd24a');
    doorOn(s, p.S, p.W, 30, 15, 20, P.woodDD);
 // quench trough
    s.px(cx - 78, cy - 10, 18, 7, P.woodDD); s.px(cx - 76, cy - 12, 14, 3, P.water);
}, { name: 'Stone Forge', fw: 3, fh: 3 });

def('blacksmith', 'base_smithy_l3.png', 220, 160, (s, cx, cy) => {
    const p = prism(s, cx, cy, 3, 38, P.stoneD, P.brickD, P.brick);
    const r = roofX(s, cx, cy, 3, 38, 26, P.ironD, P.ironD, P.iron, 0.07);
 // great chimney stack
    chimneyAt(s, cx + 34, r.rB[1] - 26, 18, cy - 20 - (r.rB[1] - 26));
    const m = mid(p.S, p.E);
    s.ctx.fillStyle = '#1a0e08';
    s.ctx.beginPath();
    s.ctx.moveTo(m[0] - 30, m[1] + 38); s.ctx.lineTo(m[0] - 30, m[1] + 12);
    s.ctx.quadraticCurveTo(m[0], m[1] - 6, m[0] + 30, m[1] + 12);
    s.ctx.lineTo(m[0] + 30, m[1] + 38); s.ctx.closePath(); s.ctx.fill();
    s.px(m[0] - 19, m[1] + 28, 30, 10, '#e06a2b'); s.px(m[0] - 8, m[1] + 25, 10, 5, '#ffd24a');
 // power hammer post
    s.px(cx - 84, cy - 52, 5, 44, P.woodDD);
    s.px(cx - 84, cy - 54, 30, 5, P.ironL);
    s.px(cx - 58, cy - 50, 8, 8, P.iron);
    doorOn(s, p.S, p.W, 38, 16, 24, P.woodDD);
 // anvil on block
    s.px(cx + 78, cy - 14, 14, 6, P.ironL); s.px(cx + 82, cy - 8, 5, 6, P.woodDD);
}, { name: 'Great Forge', fw: 3, fh: 3 });

// =========== MED BAY (3x3) ===========
def('medbay', 'base_medbay_l1.png', 200, 112, (s, cx, cy) => {
    const p = prism(s, cx, cy, 3, 20, P.white, P.whiteD, P.white);
    roofX(s, cx, cy, 3, 20, 17, P.roofTD, P.roofT, P.roofTL, 0.1);
 // red cross on left wall
    const m = mid(p.S, p.W);
    s.px(m[0] - 3, m[1] + 2, 6, 15, '#c8443a'); s.px(m[0] - 9, m[1] + 6, 18, 7, '#c8443a');
 // open flap on right wall
    const m2 = mid(p.S, p.E);
    s.ctx.fillStyle = '#b8ac94';
    s.ctx.beginPath();
    s.ctx.moveTo(m2[0] - 16, m2[1] + 20); s.ctx.lineTo(m2[0] - 16, m2[1] + 6);
    s.ctx.quadraticCurveTo(m2[0], m2[1] - 2, m2[0] + 16, m2[1] + 6);
    s.ctx.lineTo(m2[0] + 16, m2[1] + 20); s.ctx.closePath(); s.ctx.fill();
 // stretcher
    s.px(cx + 74, cy - 10, 18, 3, P.whiteD); s.px(cx + 76, cy - 7, 2, 5, P.woodD); s.px(cx + 88, cy - 7, 2, 5, P.woodD);
}, { name: 'Medic Tent', fw: 3, fh: 3 });

def('medbay', 'base_medbay_l2.png', 210, 132, (s, cx, cy) => {
    const p = prism(s, cx, cy, 3, 28, P.white, P.whiteD, P.white);
    roofX(s, cx, cy, 3, 28, 22, P.roofTD, P.roofT, P.roofTL, 0.08);
 // hanging cross sign
    s.px(cx + 48, cy - 52, 2, 13, P.woodDD);
    s.px(cx + 40, cy - 46, 18, 5, '#c8443a'); s.px(cx + 46, cy - 52, 6, 17, '#c8443a');
    doorOn(s, p.S, p.E, 28, 16, 22, P.woodD);
    winOn(s, p.S, p.W, 28, 0.35, 0.5, 13, 11);
    winOn(s, p.S, p.E, 28, 0.75, 0.5, 12, 10);
 // herb planter
    s.px(cx - 80, cy - 8, 16, 5, P.woodD); s.px(cx - 76, cy - 12, 3, 5, P.leaf); s.px(cx - 70, cy - 13, 3, 6, P.leafL);
}, { name: 'Infirmary', fw: 3, fh: 3 });

def('medbay', 'base_medbay_l3.png', 230, 168, (s, cx, cy) => {
    const p = prism(s, cx, cy, 3, 34, P.white, P.whiteD, P.white);
    roofX(s, cx, cy, 3, 34, 26, P.roofTD, P.roofT, P.roofTL, 0.07);
 // white tower east
    const tp = prism(s, cx + 86, cy + 10, 1.1, 82, P.white, P.whiteD, P.white);
    poly(s, [[tp.N[0], tp.N[1] - 28], [tp.E[0] + 2, tp.E[1] + 6], [tp.S[0] - 2, tp.S[1] + 2]], P.roofTD);
    winOn(s, tp.S, tp.E, 82, 0.5, 0.7, 9, 10);
    winOn(s, tp.S, tp.E, 82, 0.5, 0.4, 9, 10);
 // glowing cross on tower
    s.px(tp.S[0] - 3, tp.S[1] - 96, 6, 15, '#ffd24a'); s.px(tp.S[0] - 9, tp.S[1] - 92, 18, 6, '#ffd24a');
    doorOn(s, p.S, p.W, 34, 16, 22, P.woodD);
    winOn(s, p.S, p.E, 34, 0.5, 0.55, 13, 11);
    bannerOn(s, cx - 78, cy - 70, '#c8443a', '#9c3028');
}, { name: 'Sanatorium', fw: 3, fh: 3 });

// =========== ALCHEMY (3x3) ===========
def('alchemy', 'base_alchemy_l1.png', 190, 120, (s, cx, cy) => {
    const p = prism(s, cx, cy, 3, 22, P.woodL, P.woodD, P.wood);
    roofX(s, cx, cy, 3, 22, 20, P.roofPD, P.roofP, P.roofPL, 0.1);
    doorOn(s, p.S, p.E, 22, 14, 18, P.woodDD);
 // bubbling cauldron out front
    s.ctx.fillStyle = P.iron;
    s.ctx.beginPath(); s.ctx.ellipse(cx - 62, cy - 10, 11, 6, 0, 0, Math.PI * 2); s.ctx.fill();
    s.ctx.fillStyle = P.glass;
    s.ctx.beginPath(); s.ctx.ellipse(cx - 62, cy - 11, 8.5, 4, 0, 0, Math.PI * 2); s.ctx.fill();
    s.px(cx - 65, cy - 20, 2, 8, P.glassL); s.px(cx - 60, cy - 24, 2, 5, P.glassL);
}, { name: 'Brew Hut', fw: 3, fh: 3 });

def('alchemy', 'base_alchemy_l2.png', 200, 140, (s, cx, cy) => {
    const p = prism(s, cx, cy, 3, 30, P.stoneL, P.stoneD, P.stone);
 // glass dome roof
    s.ctx.fillStyle = P.glassD;
    s.ctx.beginPath(); s.ctx.ellipse(cx, cy - 30 - 20, 104, 26, 0, Math.PI, 0); s.ctx.fill();
    s.ctx.fillStyle = P.glass;
    s.ctx.beginPath(); s.ctx.ellipse(cx - 12, cy - 30 - 20, 62, 19, 0, Math.PI, 0); s.ctx.fill();
    s.px(cx - 26, cy - 62, 4, 3, P.glassL);
 // bulb windows
    for (const [ox, oy, r] of [[-48, -16, 7], [44, -18, 8]]) {
        s.ctx.fillStyle = P.glassD;
        s.ctx.beginPath(); s.ctx.arc(cx + ox, cy + oy, r, 0, Math.PI * 2); s.ctx.fill();
        s.ctx.fillStyle = P.glassL;
        s.ctx.beginPath(); s.ctx.arc(cx + ox - 2, cy + oy - 2, r * 0.4, 0, Math.PI * 2); s.ctx.fill();
    }
    doorOn(s, p.S, p.E, 30, 15, 20, P.woodDD);
 // pipe vents
    s.px(cx + 62, cy - 40, 4, 24, P.iron); s.px(cx + 66, cy - 36, 9, 4, P.iron);
}, { name: 'Glasshouse', fw: 3, fh: 3 });

def('alchemy', 'base_alchemy_l3.png', 220, 168, (s, cx, cy) => {
    const p = prism(s, cx, cy, 3, 46, P.stoneL, P.stoneD, P.stone);
 // observatory dome
    s.ctx.fillStyle = P.roofPD;
    s.ctx.beginPath(); s.ctx.ellipse(cx, cy - 46 - 22, 100, 28, 0, Math.PI, 0); s.ctx.fill();
    s.ctx.fillStyle = P.roofPL;
    s.ctx.beginPath(); s.ctx.ellipse(cx - 14, cy - 46 - 22, 58, 20, 0, Math.PI, 0); s.ctx.fill();
    s.px(cx + 8, cy - 78, 4, 14, '#241811');
    s.ctx.fillStyle = P.gold;
    s.ctx.beginPath(); s.ctx.arc(cx, cy - 76, 4, 0, Math.PI * 2); s.ctx.fill();
 // side lab west
    const lp = prism(s, cx - 88, cy + 8, 1.2, 26, P.stoneL, P.stoneD, P.stone);
    roofX(s, cx - 88, cy + 8, 1.2, 26, 14, P.roofPD, P.roofP, P.roofPL, 0.08);
    winOn(s, lp.S, lp.E, 26, 0.5, 0.55, 9, 9, P.glass);
    doorOn(s, p.S, p.E, 46, 16, 24, P.woodDD);
 // arcane circle
    s.ctx.strokeStyle = 'rgba(140,220,150,0.95)'; s.ctx.lineWidth = 1.6;
    s.ctx.beginPath(); s.ctx.ellipse(cx + 72, cy - 4, 18, 9, 0, 0, Math.PI * 2); s.ctx.stroke();
    s.ctx.beginPath(); s.ctx.ellipse(cx + 72, cy - 4, 10, 5, 0, 0, Math.PI * 2); s.ctx.stroke();
}, { name: 'Observatory', fw: 3, fh: 3 });

// =========== MINES (2x2) ===========
def('mines', 'base_mines_l1.png', 140, 84, (s, cx, cy) => {
    s.ctx.fillStyle = P.stoneD;
    s.ctx.beginPath();
    s.ctx.moveTo(cx - 60, cy + 2); s.ctx.quadraticCurveTo(cx - 58, cy - 34, cx - 22, cy - 46);
    s.ctx.quadraticCurveTo(cx + 14, cy - 56, cx + 42, cy - 34);
    s.ctx.quadraticCurveTo(cx + 58, cy - 20, cx + 56, cy + 2);
    s.ctx.closePath(); s.ctx.fill();
    s.ctx.fillStyle = P.stone;
    s.ctx.beginPath();
    s.ctx.moveTo(cx - 42, cy - 26); s.ctx.quadraticCurveTo(cx - 20, cy - 44, cx + 8, cy - 42);
    s.ctx.quadraticCurveTo(cx - 6, cy - 30, cx - 12, cy - 20); s.ctx.closePath(); s.ctx.fill();
    s.ctx.fillStyle = '#14100c';
    s.ctx.beginPath();
    s.ctx.moveTo(cx - 20, cy + 2); s.ctx.quadraticCurveTo(cx - 20, cy - 22, cx, cy - 22);
    s.ctx.quadraticCurveTo(cx + 20, cy - 22, cx + 20, cy + 2); s.ctx.closePath(); s.ctx.fill();
    s.px(cx + 32, cy - 4, 8, 4, P.stone); s.px(cx - 42, cy - 2, 6, 3, P.stoneD);
}, { name: 'Cave Mouth', fw: 2, fh: 2 });

def('mines', 'base_mines_l2.png', 150, 92, (s, cx, cy) => {
    s.ctx.fillStyle = P.stoneD;
    s.ctx.beginPath();
    s.ctx.moveTo(cx - 62, cy + 2); s.ctx.quadraticCurveTo(cx - 60, cy - 38, cx - 24, cy - 50);
    s.ctx.quadraticCurveTo(cx + 14, cy - 60, cx + 44, cy - 38);
    s.ctx.quadraticCurveTo(cx + 62, cy - 22, cx + 60, cy + 2);
    s.ctx.closePath(); s.ctx.fill();
 // timber portal
    s.px(cx - 28, cy - 38, 7, 40, P.woodD); s.px(cx + 22, cy - 38, 7, 40, P.woodD);
    s.px(cx - 32, cy - 46, 68, 8, P.wood); s.px(cx - 32, cy - 46, 68, 2.4, P.woodL);
    s.ctx.fillStyle = '#14100c';
    s.ctx.beginPath();
    s.ctx.moveTo(cx - 21, cy + 2); s.ctx.quadraticCurveTo(cx, cy - 32, cx + 21, cy + 2);
    s.ctx.closePath(); s.ctx.fill();
 // lantern
    s.px(cx + 28, cy - 34, 5, 7, '#f4d47a'); s.px(cx + 27, cy - 36, 7, 2, P.iron);
 // rail
    s.px(cx - 46, cy + 3, 92, 2, P.woodDD); s.px(cx - 46, cy + 7, 92, 2, P.woodDD);
    s.px(cx - 14, cy + 2, 3, 7, P.iron); s.px(cx + 16, cy + 2, 3, 7, P.iron);
}, { name: 'Timber Mine', fw: 2, fh: 2 });

def('mines', 'base_mines_l3.png', 160, 108, (s, cx, cy) => {
    s.ctx.fillStyle = P.stoneD;
    s.ctx.beginPath();
    s.ctx.moveTo(cx - 68, cy + 4); s.ctx.quadraticCurveTo(cx - 66, cy - 44, cx - 26, cy - 58);
    s.ctx.quadraticCurveTo(cx + 16, cy - 70, cx + 50, cy - 44);
    s.ctx.quadraticCurveTo(cx + 70, cy - 24, cx + 66, cy + 4);
    s.ctx.closePath(); s.ctx.fill();
    s.ctx.fillStyle = P.stone;
    s.ctx.beginPath();
    s.ctx.moveTo(cx - 48, cy - 34); s.ctx.quadraticCurveTo(cx - 26, cy - 54, cx + 8, cy - 52);
    s.ctx.quadraticCurveTo(cx - 8, cy - 36, cx - 14, cy - 26); s.ctx.closePath(); s.ctx.fill();
 // headframe + wheel
    s.px(cx - 26, cy - 50, 8, 54, P.woodD); s.px(cx + 22, cy - 50, 8, 54, P.woodD);
    s.px(cx - 30, cy - 58, 64, 9, P.wood); s.px(cx - 30, cy - 58, 64, 2.6, P.woodL);
    s.ctx.strokeStyle = P.woodDD; s.ctx.lineWidth = 3;
    s.ctx.beginPath(); s.ctx.moveTo(cx - 24, cy - 50); s.ctx.lineTo(cx + 30, cy + 2); s.ctx.stroke();
    s.ctx.strokeStyle = P.ironL; s.ctx.lineWidth = 2.6;
    s.ctx.beginPath(); s.ctx.arc(cx - 22, cy - 64, 9, 0, Math.PI * 2); s.ctx.stroke();
    s.ctx.beginPath(); s.ctx.moveTo(cx - 31, cy - 64); s.ctx.lineTo(cx - 13, cy - 64);
    s.ctx.moveTo(cx - 22, cy - 73); s.ctx.lineTo(cx - 22, cy - 55); s.ctx.stroke();
 // adit + glow
    s.ctx.fillStyle = '#14100c';
    s.ctx.beginPath();
    s.ctx.moveTo(cx - 16, cy + 2); s.ctx.quadraticCurveTo(cx - 16, cy - 24, cx + 2, cy - 24);
    s.ctx.quadraticCurveTo(cx + 20, cy - 24, cx + 20, cy + 2); s.ctx.closePath(); s.ctx.fill();
    s.px(cx - 4, cy - 8, 6, 3, '#f4a24a');
 // ore cart
    s.px(cx + 34, cy - 2, 20, 9, P.woodDD); s.px(cx + 36, cy - 4, 16, 3, P.woodD);
    s.ctx.fillStyle = P.iron;
    s.ctx.beginPath(); s.ctx.arc(cx + 39, cy + 8, 3, 0, Math.PI * 2); s.ctx.fill();
    s.ctx.beginPath(); s.ctx.arc(cx + 51, cy + 8, 3, 0, Math.PI * 2); s.ctx.fill();
    s.px(cx + 37, cy - 6, 5, 2, P.gold);
}, { name: 'Deep Mine', fw: 2, fh: 2 });

// =========== POND (2x2) ===========
def('pond', 'base_pond_l1.png', 120, 46, (s, cx, cy) => {
    for (const [ox, oy, r] of [[-30, -2, 12], [10, -8, 15], [34, 2, 10]]) {
        s.ctx.fillStyle = P.leaf;
        s.ctx.beginPath(); s.ctx.ellipse(cx + ox, cy + oy, r, r * 0.45, 0, 0, Math.PI * 2); s.ctx.fill();
        s.ctx.fillStyle = P.leafD;
        s.ctx.beginPath(); s.ctx.moveTo(cx + ox - r, cy + oy); s.ctx.lineTo(cx + ox, cy + oy + r * 0.45);
        s.ctx.lineTo(cx + ox + r * 0.4, cy + oy); s.ctx.lineTo(cx + ox, cy + oy - r * 0.45);
        s.ctx.closePath(); s.ctx.fill();
    }
    s.px(cx + 8, cy - 10, 3, 2, '#f0c8d8'); s.px(cx - 28, cy - 4, 3, 2, P.white);
    for (const [ox, hh] of [[44, 16], [50, 12], [-48, 14]]) {
        s.px(cx + ox, cy - hh, 1.6, hh, P.leafD);
        s.px(cx + ox, cy - hh - 2, 1.6, 2, P.thatch);
    }
}, { name: 'Lily Pond', fw: 2, fh: 2 });

def('pond', 'base_pond_l2.png', 120, 56, (s, cx, cy) => {
    s.ctx.fillStyle = P.wood;
    s.ctx.beginPath();
    s.ctx.moveTo(cx - 8, cy - 22); s.ctx.lineTo(cx + 26, cy - 34); s.ctx.lineTo(cx + 40, cy - 26);
    s.ctx.lineTo(cx + 6, cy - 14); s.ctx.closePath(); s.ctx.fill();
    s.ctx.fillStyle = P.woodD;
    s.ctx.beginPath();
    s.ctx.moveTo(cx - 8, cy - 22); s.ctx.lineTo(cx + 6, cy - 14); s.ctx.lineTo(cx + 6, cy - 10);
    s.ctx.lineTo(cx - 8, cy - 18); s.ctx.closePath(); s.ctx.fill();
    s.px(cx + 2, cy - 8, 3, 8, P.woodDD); s.px(cx + 30, cy - 20, 3, 8, P.woodDD);
    s.ctx.fillStyle = P.woodD;
    s.ctx.beginPath(); s.ctx.ellipse(cx + 16, cy - 34, 6, 5, 0, 0, Math.PI * 2); s.ctx.fill();
    s.px(cx + 10, cy - 34, 12, 6, P.wood); s.px(cx + 10, cy - 33, 12, 1.4, P.iron);
    s.px(cx + 34, cy - 44, 1.4, 18, P.woodDD);
    s.ctx.fillStyle = P.leaf;
    s.ctx.beginPath(); s.ctx.ellipse(cx - 34, cy - 4, 10, 4.5, 0, 0, Math.PI * 2); s.ctx.fill();
    s.px(cx - 36, cy - 6, 3, 2, '#f0c8d8');
    s.ctx.beginPath(); s.ctx.ellipse(cx - 8, cy + 2, 8, 3.6, 0, 0, Math.PI * 2); s.ctx.fill();
}, { name: 'Fishing Dock', fw: 2, fh: 2 });

def('pond', 'base_pond_l3.png', 120, 74, (s, cx, cy) => {
    for (const [ox, hh, w, col, colL] of [[0, 46, 12, P.crystal, P.crystalL], [-14, 30, 8, '#7ec4cf', P.crystalL], [13, 26, 7, '#7ec4cf', P.crystalL], [-4, 20, 6, '#b8e8f0', P.crystalL]]) {
        s.ctx.fillStyle = col;
        s.ctx.beginPath();
        s.ctx.moveTo(cx + ox, cy - hh); s.ctx.lineTo(cx + ox + w / 2, cy - hh * 0.3);
        s.ctx.lineTo(cx + ox + w * 0.2, cy + 2); s.ctx.lineTo(cx + ox - w * 0.35, cy - hh * 0.15);
        s.ctx.closePath(); s.ctx.fill();
        s.ctx.fillStyle = colL;
        s.ctx.beginPath();
        s.ctx.moveTo(cx + ox, cy - hh); s.ctx.lineTo(cx + ox + w * 0.2, cy - hh * 0.4);
        s.ctx.lineTo(cx + ox - w * 0.1, cy - hh * 0.1); s.ctx.closePath(); s.ctx.fill();
    }
    s.px(cx - 2, cy - 40, 2, 2, P.white); s.px(cx + 8, cy - 20, 2, 2, P.white);
    s.ctx.fillStyle = P.stoneD;
    s.ctx.beginPath(); s.ctx.ellipse(cx, cy + 2, 42, 17, 0, 0, Math.PI * 2); s.ctx.fill();
    s.ctx.fillStyle = P.water;
    s.ctx.beginPath(); s.ctx.ellipse(cx, cy + 1, 36, 14, 0, 0, Math.PI * 2); s.ctx.fill();
    s.px(cx - 20, cy - 2, 12, 1.6, P.waterL);
}, { name: 'Crystal Spring', fw: 2, fh: 2 });

// =========== HUNTING GATE (2x2) ===========
def('hunting', 'base_hunting_gate.png', 150, 96, (s, cx, cy) => {
    s.px(cx - 66, cy - 20, 4, 22, P.woodD); s.px(cx - 46, cy - 12, 4, 22, P.woodD);
    s.ctx.strokeStyle = P.wood; s.ctx.lineWidth = 2.4;
    s.ctx.beginPath(); s.ctx.moveTo(cx - 66, cy - 14); s.ctx.lineTo(cx - 46, cy - 6); s.ctx.stroke();
    s.ctx.beginPath(); s.ctx.moveTo(cx - 66, cy - 8); s.ctx.lineTo(cx - 46, cy); s.ctx.stroke();
    s.px(cx + 42, cy - 14, 4, 22, P.woodD); s.px(cx + 62, cy - 6, 4, 22, P.woodD);
    s.ctx.beginPath(); s.ctx.moveTo(cx + 42, cy - 8); s.ctx.lineTo(cx + 62, cy); s.ctx.stroke();
 // arch
    s.px(cx - 15, cy - 52, 6, 52, P.woodD); s.px(cx + 12, cy - 52, 6, 52, P.woodD);
    s.px(cx - 22, cy - 58, 46, 8, P.wood); s.px(cx - 22, cy - 58, 46, 2.4, P.woodL);
 // sign
    s.px(cx + 3, cy - 50, 1.6, 6, P.woodDD);
    s.px(cx - 4, cy - 44, 15, 10, P.wood); s.px(cx - 4, cy - 44, 15, 2, P.woodL);
    s.px(cx - 1, cy - 41, 9, 4, P.leafD);
 // torch
    s.px(cx + 13, cy - 60, 3, 5, P.woodDD);
    s.px(cx + 12.4, cy - 66, 4, 5, '#f4a24a'); s.px(cx + 13.2, cy - 68, 2.4, 3, '#ffe08a');
}, { name: 'Hunting Gate', fw: 2, fh: 2 });

// -- structures.json manifest --
const STRUCTURES = {
    structures: [
        { id: 'house', name: 'House', fixed: true, free: true, fw: 3, fh: 3, interior: true,
          levels: [
            { level: 1, sprite: 'base_house_l1', price: 0, name: 'Hovel' },
            { level: 2, sprite: 'base_house_l2', price: 8000, name: 'Cottage' },
            { level: 3, sprite: 'base_house_l3', price: 16000, name: 'Manor' },
        ] },
        { id: 'blacksmith', name: 'Blacksmith', fw: 3, fh: 3,
          levels: [
            { level: 1, sprite: 'base_smithy_l1', price: 12000, name: 'Forge Shed' },
            { level: 2, sprite: 'base_smithy_l2', price: 20000, name: 'Stone Forge' },
            { level: 3, sprite: 'base_smithy_l3', price: 35000, name: 'Great Forge' },
        ] },
        { id: 'medbay', name: 'Med Bay', fw: 3, fh: 3,
          levels: [
            { level: 1, sprite: 'base_medbay_l1', price: 10000, name: 'Medic Tent' },
            { level: 2, sprite: 'base_medbay_l2', price: 18000, name: 'Infirmary' },
            { level: 3, sprite: 'base_medbay_l3', price: 30000, name: 'Sanatorium' },
        ] },
        { id: 'alchemy', name: 'Alchemy Centre', fw: 3, fh: 3,
          levels: [
            { level: 1, sprite: 'base_alchemy_l1', price: 15000, name: 'Brew Hut' },
            { level: 2, sprite: 'base_alchemy_l2', price: 25000, name: 'Glasshouse' },
            { level: 3, sprite: 'base_alchemy_l3', price: 40000, name: 'Observatory' },
        ] },
        { id: 'mines', name: 'Mines', fixed: true, fw: 2, fh: 2,
          levels: [
            { level: 1, sprite: 'base_mines_l1', price: 0, name: 'Cave Mouth' },
            { level: 2, sprite: 'base_mines_l2', price: 6000, name: 'Timber Mine' },
            { level: 3, sprite: 'base_mines_l3', price: 10000, name: 'Deep Mine' },
        ] },
        { id: 'pond', name: 'Pond', fixed: true, fw: 2, fh: 2,
          levels: [
            { level: 1, sprite: 'base_pond_l1', price: 0, name: 'Lily Pond' },
            { level: 2, sprite: 'base_pond_l2', price: 5000, name: 'Fishing Dock' },
            { level: 3, sprite: 'base_pond_l3', price: 9000, name: 'Crystal Spring' },
        ] },
        { id: 'hunting', name: 'Hunting Grounds', fixed: true, fw: 2, fh: 2, noUpgrade: true,
          levels: [
            { level: 1, sprite: 'base_hunting_gate', price: 0, name: 'Hunting Gate' },
        ] },
    ],
};
fs.writeFileSync(path.join(OUT, 'structures.json'), JSON.stringify(STRUCTURES, null, 1) + '\n');
console.log(`[gen] structures written: ${DEF.length} sprites, ${STRUCTURES.structures.length} structure types`);
