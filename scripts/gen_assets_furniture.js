'use strict';
// ===========================================================================
// GEN - new homestead furniture sprites (Section 5: catalogue expansion)
// Style contract: matches the CC0 set already in core/rpgasset/homestead -
// 2:1 isometric, dark 1px outline, warm palette, light from upper-LEFT.
// Every sprite is drawn at native size (rendered 2x in-room, like the rest).
// Run: node scripts/gen_assets_furniture.js (idempotent; rewrites PNGs)
// ===========================================================================
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const OUT = path.join(__dirname, '..', 'core', 'rpgasset', 'homestead');

// -- shared palette (sampled from the existing set) --
const P = {
    outline: '#241811',
    wood: '#8a5a33', woodL: '#a5744a', woodD: '#6b4222', woodDD: '#4a2d17',
    tan: '#d9b98a', tanD: '#b8935f',
    stone: '#8d9297', stoneL: '#a8adb2', stoneD: '#6e7378', stoneDD: '#565a5e',
    brick: '#b06a52', brickD: '#8a4a38',
    iron: '#5a5e64', ironL: '#7d8287',
    gold: '#e8b84a', goldD: '#b8882e',
    red: '#a83a32', redD: '#7c2a24',
    green: '#5a8c46', greenL: '#74a65c', greenD: '#3d5f2e',
    leaf: '#4a7238', leafL: '#6da455',
    water: '#4a909d', waterL: '#6ab0bd', waterD: '#2f6673',
    cloth: '#8c4a6a', clothD: '#6a3550',
    parchment: '#e8dcc0', parchmentD: '#c9baa0',
    white: '#e8e0d0', copper: '#b06a3e', copperL: '#cc8452', copperD: '#8a4a28',
};

// -- sprite builder --
function sprite(w, h) {
    const cv = createCanvas(w, h);
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const api = {
        cv, ctx, w, h,
        px(x, y, ww, hh, col) { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), Math.round(ww), Math.round(hh)); },
        diamond(cx, cy, rx, ry, col) {
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.moveTo(cx, cy - ry); ctx.lineTo(cx + rx, cy); ctx.lineTo(cx, cy + ry); ctx.lineTo(cx - rx, cy);
            ctx.closePath(); ctx.fill();
        },
    };
    return api;
}

// 1px dark rim outside the silhouette (the CC0 set's signature outline)
function autoOutline(s) {
    const { cv, ctx, w, h } = s;
    const src = cv.toBuffer('image/png');
    const out = createCanvas(w + 2, h + 2);
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = false;
    const tinted = createCanvas(w, h);
    const tctx = tinted.getContext('2d');
    tctx.drawImage(cv, 0, 0);
    tctx.globalCompositeOperation = 'source-in';
    tctx.fillStyle = P.outline;
    tctx.fillRect(0, 0, w, h);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        octx.drawImage(tinted, 1 + dx, 1 + dy);
    }
    octx.drawImage(cv, 1, 1);
    fs.writeFileSync(path.join(OUT, s.file), out.toBuffer('image/png'));
}

// iso box: base diamond centered (cx,cy), wT/dT in half-tiles, hPx tall
function isoBox(s, cx, cy, wT, dT, hPx, top, left, right) {
    const rx = wT * 16, ry = wT * 8;       // half-extents along x tiles
    const rx2 = dT * 16, ry2 = dT * 8;
 // top face (diamond)
    s.diamond(cx, cy - hPx, rx + rx2, ry + ry2, top);
 // left face (front-left: from west vertex to south vertex)
    s.ctx.fillStyle = left;
    s.ctx.beginPath();
    s.ctx.moveTo(cx - rx, cy - hPx);
    s.ctx.lineTo(cx, cy + ry2 - hPx);
    s.ctx.lineTo(cx, cy + ry2);
    s.ctx.lineTo(cx - rx, cy);
    s.ctx.closePath(); s.ctx.fill();
 // right face (front-right)
    s.ctx.fillStyle = right;
    s.ctx.beginPath();
    s.ctx.moveTo(cx + rx, cy - hPx);
    s.ctx.lineTo(cx, cy + ry2 - hPx);
    s.ctx.lineTo(cx, cy + ry2);
    s.ctx.lineTo(cx + rx, cy);
    s.ctx.closePath(); s.ctx.fill();
}

// ===========================================================================
// SPRITES - one function per item, consistent 2:1 iso, front corner down
// ===========================================================================
const ITEMS = [];

function def(id, file, fn, meta) {
    const s = sprite(meta.w + 2, meta.h + 2);
    s.file = file;
    fn(s, meta.w, meta.h);
    autoOutline(s);
    ITEMS.push({ id, file: `rpgasset/homestead/${file}`, ...meta });
}

// -- bookshelf (1x1 storage, rare-ish) --
def('shelf_books', 'shelf_books.png', (s, w, h) => {
    const cx = w / 2 + 1, base = h - 2;
    isoBox(s, cx, base - 8, 0.62, 0.42, 34, P.woodL, P.wood, P.woodD);
 // shelves + books (front-left face)
    for (let r = 0; r < 3; r++) {
        const y = base - 8 - 6 - r * 9;
        s.px(cx - 10, y, 10, 1.5, P.woodDD);
        const cols = ['#a83a32', '#4a7238', '#3e5a8c', '#b8882e', '#6a3550'];
        for (let b = 0; b < 4; b++) {
            s.px(cx - 9 + b * 2.4, y - 6 + (b % 2), 2, 6, cols[(r + b) % cols.length]);
            s.px(cx - 9 + b * 2.4, y - 6 + (b % 2), 2, 1, '#e8dcc0');
        }
    }
 // books on the right face
    for (let r = 0; r < 3; r++) {
        const y = base - 8 - 6 - r * 9;
        for (let b = 0; b < 3; b++) s.px(cx + 2 + b * 2.6, y - 5 + 2 + b * 0.6, 2, 5, ['#3e5a8c', '#a83a32', '#b8882e'][(r + b) % 3]);
    }
}, { name: 'Sage Bookshelf', cat: 'storage', layer: 'item', fw: 1, fh: 1, price: 1400, rarity: 'rare', comfort: 2, w: 26, h: 46 });

// -- standing mirror --
def('mirror_stand', 'mirror_stand.png', (s, w, h) => {
    const cx = w / 2 + 1, base = h - 2;
 // oval mirror on a wooden frame
    s.ctx.fillStyle = P.wood;
    s.ctx.beginPath(); s.ctx.ellipse(cx, base - 24, 9, 16, 0, 0, Math.PI * 2); s.ctx.fill();
    s.ctx.fillStyle = '#9db8c4';
    s.ctx.beginPath(); s.ctx.ellipse(cx, base - 24, 6.5, 13, 0, 0, Math.PI * 2); s.ctx.fill();
    s.ctx.fillStyle = '#d5e4ea';
    s.ctx.beginPath(); s.ctx.ellipse(cx - 2, base - 27, 2.5, 6, -0.3, 0, Math.PI * 2); s.ctx.fill();
 // posts + feet
    s.px(cx - 1, base - 10, 2, 8, P.woodD);
    s.diamond(cx, base - 2, 9, 4.5, P.woodL);
    s.diamond(cx, base - 3.5, 7, 3.5, P.wood);
    s.px(cx - 6, base - 4.5, 12, 1, P.woodD);
}, { name: 'Silver Mirror', cat: 'decor', layer: 'item', fw: 1, fh: 1, price: 1100, rarity: 'uncommon', comfort: 1, w: 24, h: 44 });

// -- candelabra --
def('candelabra', 'candelabra.png', (s, w, h) => {
    const cx = w / 2 + 1, base = h - 2;
    s.diamond(cx, base - 2, 8, 4, P.goldD);
    s.diamond(cx, base - 3.2, 6, 3, P.gold);
    s.px(cx - 1, base - 18, 2, 15, P.gold);
    s.px(cx - 5, base - 14, 10, 1.6, P.gold);
 // three candles + flames
    for (const [ox, top] of [[0, base - 22], [-5, base - 17], [5, base - 17]]) {
        s.px(cx + ox - 1, top, 2, 4.5, P.parchment);
        s.px(cx + ox - 0.6, top - 3, 1.2, 3, '#f8e08a');
        s.px(cx + ox - 0.3, top - 4.4, 0.8, 1.6, '#fff6c8');
    }
}, { name: 'Gilded Candelabra', cat: 'light', layer: 'item', fw: 1, fh: 1, price: 1600, rarity: 'uncommon', comfort: 2, w: 20, h: 30 });

// -- standing lantern --
def('lantern_stand', 'lantern_stand.png', (s, w, h) => {
    const cx = w / 2 + 1, base = h - 2;
    s.diamond(cx, base - 2, 9, 4.5, P.iron);
    s.px(cx - 1.2, base - 26, 2.4, 24, P.ironD);
 // lamp head
    s.px(cx - 5, base - 38, 10, 11, P.ironD);
    s.px(cx - 3.5, base - 36, 7, 7.5, '#f4d47a');
    s.px(cx - 2, base - 34, 4, 5, '#fdf0b8');
    s.px(cx - 6, base - 40, 12, 2.5, P.iron);
    s.px(cx - 1.5, base - 43, 3, 3, P.iron);
    s.px(cx - 1, base - 44, 2, 1.5, '#8a5a33');
}, { name: 'Wrought Lantern', cat: 'light', layer: 'item', fw: 1, fh: 1, price: 2400, rarity: 'rare', comfort: 2, w: 24, h: 50 });

// -- stone oven (2x1 kitchen) --
def('oven_stone', 'oven_stone.png', (s, w, h) => {
    const cx = w / 2 + 1, base = h - 2;
    isoBox(s, cx, base - 10, 1.55, 0.85, 22, P.stoneL, P.stone, P.stoneD);
 // brick arch mouth on left face
    s.ctx.fillStyle = P.brickD;
    s.ctx.beginPath();
    s.ctx.moveTo(cx - 20, base - 10); s.ctx.quadraticCurveTo(cx - 20, base - 22, cx - 11, base - 22);
    s.ctx.quadraticCurveTo(cx - 2, base - 22, cx - 2, base - 10); s.ctx.closePath(); s.ctx.fill();
    s.ctx.fillStyle = '#1a0e08';
    s.ctx.beginPath();
    s.ctx.moveTo(cx - 17, base - 10); s.ctx.quadraticCurveTo(cx - 17, base - 19, cx - 11, base - 19);
    s.ctx.quadraticCurveTo(cx - 5, base - 19, cx - 5, base - 10); s.ctx.closePath(); s.ctx.fill();
 // embers
    s.px(cx - 14, base - 11, 7, 2, '#d95f2b'); s.px(cx - 12, base - 12, 3, 1, '#f4a24a');
 // chimney
    s.px(cx + 8, base - 44, 8, 26, P.stoneD);
    s.px(cx + 8, base - 44, 8, 3, P.stone);
    s.px(cx + 9, base - 40, 2, 20, P.stoneDD);
 // top slab
    s.diamond(cx, base - 33, 26, 13, P.stoneDD);
    s.px(cx - 24, base - 34, 48, 1.5, P.stoneL);
}, { name: 'Baker\'s Oven', cat: 'kitchen', layer: 'item', fw: 2, fh: 1, price: 3400, rarity: 'rare', comfort: 1, w: 56, h: 50 });

// -- copper basin --
def('basin_copper', 'basin_copper.png', (s, w, h) => {
    const cx = w / 2 + 1, base = h - 2;
    s.ctx.fillStyle = P.copper;
    s.ctx.beginPath(); s.ctx.ellipse(cx, base - 10, 11, 6.5, 0, 0, Math.PI * 2); s.ctx.fill();
    s.ctx.fillStyle = P.copperD;
    s.ctx.beginPath(); s.ctx.moveTo(cx - 11, base - 10); s.ctx.lineTo(cx + 11, base - 10);
    s.ctx.lineTo(cx + 8, base - 2); s.ctx.lineTo(cx - 8, base - 2); s.ctx.closePath(); s.ctx.fill();
    s.ctx.fillStyle = P.copperL;
    s.ctx.beginPath(); s.ctx.ellipse(cx, base - 11, 9, 5, 0, 0, Math.PI * 2); s.ctx.fill();
    s.ctx.fillStyle = P.water;
    s.ctx.beginPath(); s.ctx.ellipse(cx, base - 11, 7.5, 4, 0, 0, Math.PI * 2); s.ctx.fill();
    s.px(cx - 4, base - 12.5, 4, 1, P.waterL);
 // stand legs
    s.px(cx - 8, base - 3, 2, 3, P.copperD); s.px(cx + 6, base - 3, 2, 3, P.copperD);
}, { name: 'Copper Basin', cat: 'kitchen', layer: 'item', fw: 1, fh: 1, price: 950, rarity: 'uncommon', comfort: 1, w: 26, h: 18 });

// -- oak bench (2x1) --
def('bench_oak', 'bench_oak.png', (s, w, h) => {
    const cx = w / 2 + 1, base = h - 2;
 // seat slab (iso diamond-ish plank)
    s.ctx.fillStyle = P.woodL;
    s.ctx.beginPath();
    s.ctx.moveTo(cx - 27, base - 13); s.ctx.lineTo(cx, base - 24);
    s.ctx.lineTo(cx + 27, base - 13); s.ctx.lineTo(cx, base - 2); s.ctx.closePath(); s.ctx.fill();
    s.ctx.fillStyle = P.wood;
    s.ctx.beginPath();
    s.ctx.moveTo(cx - 27, base - 13); s.ctx.lineTo(cx, base - 2);
    s.ctx.lineTo(cx, base + 1); s.ctx.lineTo(cx - 27, base - 10); s.ctx.closePath(); s.ctx.fill();
 // legs
    s.px(cx - 22, base - 10, 3, 9, P.woodD); s.px(cx + 19, base - 10, 3, 9, P.woodD);
    s.px(cx - 8, base - 5, 3, 6, P.woodD); s.px(cx + 5, base - 5, 3, 6, P.woodD);
 // grain
    s.px(cx - 16, base - 12, 20, 1, P.woodD); s.px(cx - 8, base - 16, 18, 1, P.woodD);
}, { name: 'Oak Bench', cat: 'seating', layer: 'item', fw: 2, fh: 1, price: 1150, rarity: 'common', comfort: 2, w: 58, h: 30 });

// -- scribe desk --
def('desk_scribe', 'desk_scribe.png', (s, w, h) => {
    const cx = w / 2 + 1, base = h - 2;
    isoBox(s, cx, base - 6, 1.4, 0.8, 16, P.woodL, P.wood, P.woodD);
 // roll-top slope
    s.ctx.fillStyle = P.woodD;
    s.ctx.beginPath();
    s.ctx.moveTo(cx - 22, base - 22); s.ctx.lineTo(cx + 2, base - 32);
    s.ctx.lineTo(cx + 22, base - 22); s.ctx.lineTo(cx + 2, base - 22); s.ctx.closePath(); s.ctx.fill();
    s.px(cx - 20, base - 23, 42, 2, P.woodL);
 // parchment + quill + inkwell on top
    s.px(cx - 8, base - 30, 10, 4, P.parchment);
    s.px(cx - 7, base - 31, 8, 1, P.parchmentD);
    s.px(cx + 6, base - 33, 1.4, 6, '#f4ead0');
    s.px(cx + 8, base - 29, 3, 3, '#3e5a8c');
 // drawer knobs
    s.px(cx - 16, base - 14, 2, 2, P.gold); s.px(cx + 14, base - 10, 2, 2, P.gold);
}, { name: 'Scribe Desk', cat: 'seating', layer: 'item', fw: 2, fh: 1, price: 2300, rarity: 'uncommon', comfort: 2, w: 50, h: 40 });

// -- armour stand --
def('armour_stand', 'armour_stand.png', (s, w, h) => {
    const cx = w / 2 + 1, base = h - 2;
 // pole + cross base
    s.px(cx - 1, base - 34, 2, 32, P.woodDD);
    s.diamond(cx, base - 2, 8, 4, P.woodD);
 // breastplate
    s.ctx.fillStyle = P.ironL;
    s.ctx.beginPath(); s.ctx.moveTo(cx - 8, base - 32); s.ctx.quadraticCurveTo(cx, base - 38, cx + 8, base - 32);
    s.ctx.lineTo(cx + 6, base - 18); s.ctx.quadraticCurveTo(cx, base - 14, cx - 6, base - 18); s.ctx.closePath(); s.ctx.fill();
    s.ctx.fillStyle = P.iron;
    s.ctx.beginPath(); s.ctx.moveTo(cx, base - 36); s.ctx.lineTo(cx + 8, base - 32);
    s.ctx.lineTo(cx + 6, base - 18); s.ctx.quadraticCurveTo(cx, base - 14, cx, base - 15); s.ctx.closePath(); s.ctx.fill();
    s.px(cx - 6, base - 28, 12, 1, P.goldD);
 // helm on top
    s.ctx.fillStyle = P.ironL;
    s.ctx.beginPath(); s.ctx.arc(cx, base - 40, 5, Math.PI, 0); s.ctx.fill();
    s.px(cx - 5, base - 40, 10, 3, P.ironL);
    s.px(cx - 1, base - 42, 1.4, 4, '#c8443a');
 // sword leaning
    s.px(cx + 9, base - 30, 1.6, 22, '#c8ccd4'); s.px(cx + 8.4, base - 10, 3, 4, P.goldD);
}, { name: 'Armour Stand', cat: 'decor', layer: 'item', fw: 1, fh: 1, price: 3200, rarity: 'rare', comfort: 1, w: 26, h: 50 });

// -- weapon rack (2x1) --
def('weapon_rack', 'weapon_rack.png', (s, w, h) => {
    const cx = w / 2 + 1, base = h - 2;
 // two uprights + crossbars
    s.px(cx - 24, base - 34, 3, 34, P.woodD); s.px(cx + 21, base - 34, 3, 34, P.woodD);
    s.px(cx - 24, base - 32, 48, 2.4, P.wood); s.px(cx - 24, base - 20, 48, 2.4, P.wood);
 // weapons: axe, sword, spear, mace
    s.px(cx - 18, base - 46, 2, 26, P.woodDD);
    s.px(cx - 22, base - 46, 8, 6, '#9aa5b1'); s.px(cx - 22, base - 41, 3, 4, '#9aa5b1');
    s.px(cx - 8, base - 44, 2, 24, '#c8ccd4'); s.px(cx - 9, base - 20, 4, 4, P.goldD);
    s.px(cx + 2, base - 48, 1.8, 28, P.woodDD); s.px(cx + 1, base - 49, 3.6, 3, P.ironL);
    s.px(cx + 12, base - 42, 2, 22, P.woodDD);
    s.ctx.fillStyle = P.iron; s.ctx.beginPath(); s.ctx.arc(cx + 13, base - 43, 4, 0, Math.PI * 2); s.ctx.fill();
    s.px(cx + 11, base - 45, 4, 2, P.ironL);
}, { name: 'Weapon Rack', cat: 'storage', layer: 'item', fw: 2, fh: 1, price: 2100, rarity: 'uncommon', comfort: 0, w: 54, h: 52 });

// -- herb pot --
def('pot_herbs', 'pot_herbs.png', (s, w, h) => {
    const cx = w / 2 + 1, base = h - 2;
    s.ctx.fillStyle = '#b06a52';
    s.ctx.beginPath(); s.ctx.ellipse(cx, base - 8, 7.5, 4.5, 0, 0, Math.PI * 2); s.ctx.fill();
    s.ctx.fillStyle = P.brickD;
    s.ctx.beginPath(); s.ctx.moveTo(cx - 7.5, base - 8); s.ctx.lineTo(cx + 7.5, base - 8);
    s.ctx.lineTo(cx + 5, base - 1); s.ctx.lineTo(cx - 5, base - 1); s.ctx.closePath(); s.ctx.fill();
 // three sprigs
    for (const [ox, hh, lean] of [[-3.5, 12, -2], [0.5, 16, 0], [4, 11, 2]]) {
        s.px(cx + ox, base - 8 - hh, 1.4, hh, P.leaf);
        s.ctx.fillStyle = P.leafL;
        s.ctx.beginPath(); s.ctx.ellipse(cx + ox + lean, base - 10 - hh * 0.6, 3.2, 2, lean * 0.1, 0, Math.PI * 2); s.ctx.fill();
        s.ctx.fillStyle = P.green;
        s.ctx.beginPath(); s.ctx.ellipse(cx + ox - lean * 0.6, base - 6 - hh * 0.35, 2.6, 1.7, -lean * 0.1, 0, Math.PI * 2); s.ctx.fill();
    }
}, { name: 'Potted Herbs', cat: 'decor', layer: 'item', fw: 1, fh: 1, price: 550, rarity: 'common', comfort: 1, w: 20, h: 26 });

// -- tall barrel --
def('barrel_tall', 'barrel_tall.png', (s, w, h) => {
    const cx = w / 2 + 1, base = h - 2;
    s.ctx.fillStyle = P.wood;
    s.ctx.beginPath(); s.ctx.ellipse(cx, base - 22, 10, 22, 0, 0, Math.PI * 2); s.ctx.fill();
    s.ctx.fillStyle = P.woodD;
    s.ctx.beginPath(); s.ctx.ellipse(cx + 3, base - 22, 7, 21, 0, 0, Math.PI * 2); s.ctx.fill();
    s.ctx.fillStyle = P.woodL;
    s.ctx.beginPath(); s.ctx.ellipse(cx - 3, base - 22, 6, 21, 0, 0, Math.PI * 2); s.ctx.fill();
 // hoops
    for (const y of [base - 34, base - 22, base - 10]) {
        s.px(cx - 10, y, 20, 2.4, P.iron);
        s.px(cx - 10, y, 20, 1, P.ironL);
    }
    s.ctx.fillStyle = P.woodL;
    s.ctx.beginPath(); s.ctx.ellipse(cx, base - 40, 9, 4.5, 0, 0, Math.PI * 2); s.ctx.fill();
    s.px(cx - 6, base - 41, 12, 1, P.woodD);
}, { name: 'Tall Barrel', cat: 'storage', layer: 'item', fw: 1, fh: 1, price: 750, rarity: 'common', comfort: 0, w: 24, h: 48 });

// -- iron chest --
def('chest_iron', 'chest_iron.png', (s, w, h) => {
    const cx = w / 2 + 1, base = h - 2;
    isoBox(s, cx, base - 5, 0.85, 0.55, 16, P.ironL, P.iron, P.ironD);
 // domed lid
    s.ctx.fillStyle = P.iron;
    s.ctx.beginPath();
    s.ctx.moveTo(cx - 14, base - 21); s.ctx.quadraticCurveTo(cx, base - 30, cx + 14, base - 21);
    s.ctx.lineTo(cx + 14, base - 19); s.ctx.lineTo(cx - 14, base - 19); s.ctx.closePath(); s.ctx.fill();
    s.px(cx - 13, base - 20, 26, 1, P.ironL);
 // bands + lock
    s.px(cx - 14, base - 17, 28, 2, P.ironDD || '#3f4247');
    s.px(cx - 1.5, base - 21, 3, 8, P.gold);
    s.px(cx - 0.5, base - 17, 1, 2, '#241811');
    s.px(cx - 12, base - 14, 2, 2, P.gold); s.px(cx + 10, base - 14, 2, 2, P.gold);
}, { name: 'Iron Bound Chest', cat: 'storage', layer: 'item', fw: 1, fh: 1, price: 2800, rarity: 'rare', comfort: 1, w: 32, h: 34 });

// -- royal bed (3x2, legendary) --
def('bed_royal', 'bed_royal.png', (s, w, h) => {
    const cx = w / 2 + 1, base = h - 2;
 // frame
    isoBox(s, cx, base - 7, 2.1, 1.35, 10, P.woodL, P.wood, P.woodD);
 // four posts
    for (const [ox, oy] of [[-31, -16], [0, -30], [31, -16], [0, -2]]) {
        s.px(cx + ox - 1.6, base + oy - 34, 3.2, 34, P.woodD);
        s.px(cx + ox - 1.6, base + oy - 34, 3.2, 3, P.gold);
    }
 // canopy rails
    s.ctx.strokeStyle = P.woodD; s.ctx.lineWidth = 2.4;
    s.ctx.beginPath();
    s.ctx.moveTo(cx - 31, base - 48); s.ctx.lineTo(cx, base - 32); s.ctx.lineTo(cx + 31, base - 48);
    s.ctx.moveTo(cx - 31, base - 48); s.ctx.lineTo(cx, base - 64); s.ctx.lineTo(cx + 31, base - 48);
    s.ctx.stroke();
 // mattress + silk
    s.diamond(cx, base - 20, 30, 15, P.parchment);
    s.diamond(cx, base - 21, 27, 13, '#8c2f3e');
    s.diamond(cx - 2, base - 22, 16, 8, '#a8455a');
    s.px(cx - 12, base - 26, 14, 5, P.white);
 // gold trim on footboard
    s.px(cx - 31, base - 14, 4, 8, P.goldD); s.px(cx + 27, base - 14, 4, 8, P.goldD);
}, { name: 'Royal Canopy Bed', cat: 'bedroom', layer: 'item', fw: 3, fh: 2, price: 15000, rarity: 'legendary', comfort: 6, w: 72, h: 72 });

// -- emerald rug (3x2) --
def('rug_emerald', 'rug_emerald.png', (s, w, h) => {
    const cx = w / 2 + 1, base = h / 2 + 1;
    s.diamond(cx, base, 46, 23, '#1e4a38');
    s.diamond(cx, base, 40, 20, '#2a6a4e');
    s.diamond(cx, base, 30, 15, '#1e4a38');
    s.diamond(cx, base, 22, 11, '#c9a84a');
    s.diamond(cx, base, 14, 7, '#2a6a4e');
    s.px(cx - 20, base - 1, 40, 1, '#c9a84a');
}, { name: 'Emerald Kilim', cat: 'rug', layer: 'rug', fw: 3, fh: 2, price: 5200, rarity: 'epic', comfort: 2, w: 96, h: 50 });

// -- serpent banner (wall) --
def('banner_serpent', 'banner_serpent.png', (s, w, h) => {
    const cx = w / 2 + 1;
 // rod
    s.px(cx - 12, 3, 24, 2.4, P.woodDD);
    s.px(cx - 13, 2, 2, 4, P.gold);
    s.px(cx + 11, 2, 2, 4, P.gold);
 // cloth with swallowtail
    s.ctx.fillStyle = '#2a6a4e';
    s.ctx.beginPath();
    s.ctx.moveTo(cx - 11, 5); s.ctx.lineTo(cx + 11, 5);
    s.ctx.lineTo(cx + 11, 34); s.ctx.lineTo(cx + 5, 28); s.ctx.lineTo(cx, 34);
    s.ctx.lineTo(cx - 5, 28); s.ctx.lineTo(cx - 11, 34); s.ctx.closePath(); s.ctx.fill();
    s.ctx.fillStyle = '#1e4a38';
    s.ctx.beginPath(); s.ctx.moveTo(cx + 2, 5); s.ctx.lineTo(cx + 11, 5);
    s.ctx.lineTo(cx + 11, 34); s.ctx.lineTo(cx + 5, 28); s.ctx.lineTo(cx + 2, 32); s.ctx.closePath(); s.ctx.fill();
 // serpent sigil
    s.ctx.strokeStyle = P.gold; s.ctx.lineWidth = 1.6;
    s.ctx.beginPath();
    s.ctx.moveTo(cx - 5, 12); s.ctx.quadraticCurveTo(cx + 4, 12, cx + 3, 17);
    s.ctx.quadraticCurveTo(cx + 2, 21, cx - 4, 20); s.ctx.quadraticCurveTo(cx - 6, 19, cx - 3, 18);
    s.ctx.stroke();
    s.px(cx + 4, 11, 1.6, 1.6, P.gold);
}, { name: 'Serpent Banner', cat: 'decor', layer: 'wall', fw: 1, fh: 1, price: 1800, rarity: 'rare', comfort: 1, w: 28, h: 38 });

// -- mantel clock --
def('clock_mantel', 'clock_mantel.png', (s, w, h) => {
    const cx = w / 2 + 1, base = h - 2;
 // body
    s.ctx.fillStyle = P.woodD;
    s.ctx.beginPath();
    s.ctx.moveTo(cx - 8, base - 1); s.ctx.lineTo(cx - 8, base - 22);
    s.ctx.arc(cx, base - 22, 8, Math.PI, 0);
    s.ctx.lineTo(cx + 8, base - 1); s.ctx.closePath(); s.ctx.fill();
    s.ctx.fillStyle = P.wood;
    s.ctx.beginPath();
    s.ctx.moveTo(cx - 8, base - 1); s.ctx.lineTo(cx - 8, base - 22);
    s.ctx.arc(cx, base - 22, 8, Math.PI, 0); s.ctx.closePath();
    s.ctx.fill();
 // face
    s.ctx.fillStyle = P.parchment;
    s.ctx.beginPath(); s.ctx.arc(cx, base - 22, 5.5, 0, Math.PI * 2); s.ctx.fill();
    s.ctx.strokeStyle = '#241811'; s.ctx.lineWidth = 0.8;
    s.ctx.beginPath(); s.ctx.arc(cx, base - 22, 5.5, 0, Math.PI * 2); s.ctx.stroke();
    s.px(cx - 0.5, base - 26, 1, 4, '#241811'); s.px(cx + 1, base - 22, 3, 1, '#241811');
 // feet + pendulum window
    s.px(cx - 8, base - 3, 3, 3, P.woodDD); s.px(cx + 5, base - 3, 3, 3, P.woodDD);
    s.px(cx - 2.4, base - 14, 5, 10, '#3a2b1c');
    s.px(cx - 0.6, base - 12, 1.6, 6, P.gold);
}, { name: 'Mantel Clock', cat: 'decor', layer: 'item', fw: 1, fh: 1, price: 2600, rarity: 'rare', comfort: 2, w: 22, h: 36 });

// -- copper bathtub (2x1) --
def('bathtub_copper', 'bathtub_copper.png', (s, w, h) => {
    const cx = w / 2 + 1, base = h - 2;
 // tub body
    s.ctx.fillStyle = P.copper;
    s.ctx.beginPath(); s.ctx.ellipse(cx, base - 12, 24, 13, 0, 0, Math.PI * 2); s.ctx.fill();
    s.ctx.fillStyle = P.copperD;
    s.ctx.beginPath();
    s.ctx.moveTo(cx - 24, base - 12); s.ctx.quadraticCurveTo(cx - 22, base + 1, cx - 14, base + 1);
    s.ctx.lineTo(cx + 14, base + 1); s.ctx.quadraticCurveTo(cx + 22, base + 1, cx + 24, base - 12);
    s.ctx.closePath(); s.ctx.fill();
    s.ctx.fillStyle = P.copperL;
    s.ctx.beginPath(); s.ctx.ellipse(cx, base - 13, 21, 10.5, 0, 0, Math.PI * 2); s.ctx.fill();
 // water + steam curl
    s.ctx.fillStyle = P.water;
    s.ctx.beginPath(); s.ctx.ellipse(cx, base - 13, 18, 8.5, 0, 0, Math.PI * 2); s.ctx.fill();
    s.px(cx - 10, base - 16, 8, 1.4, P.waterL); s.px(cx + 2, base - 11, 7, 1.2, P.waterL);
 // claw feet
    s.px(cx - 20, base, 3, 2, P.goldD); s.px(cx + 17, base, 3, 2, P.goldD);
 // rim highlights
    s.px(cx - 20, base - 20, 8, 1.4, '#e0a06a');
}, { name: 'Copper Bathtub', cat: 'bath', layer: 'item', fw: 2, fh: 1, price: 4600, rarity: 'epic', comfort: 4, w: 54, h: 26 });

// -- garden fountain (1x1 fancy decor) --
def('fountain_table', 'fountain_table.png', (s, w, h) => {
    const cx = w / 2 + 1, base = h - 2;
 // basin
    s.ctx.fillStyle = P.stone;
    s.ctx.beginPath(); s.ctx.ellipse(cx, base - 6, 13, 7, 0, 0, Math.PI * 2); s.ctx.fill();
    s.ctx.fillStyle = P.stoneDD;
    s.ctx.beginPath(); s.ctx.moveTo(cx - 13, base - 6); s.ctx.lineTo(cx + 13, base - 6);
    s.ctx.lineTo(cx + 10, base); s.ctx.lineTo(cx - 10, base); s.ctx.closePath(); s.ctx.fill();
    s.ctx.fillStyle = P.water;
    s.ctx.beginPath(); s.ctx.ellipse(cx, base - 7, 10.5, 5, 0, 0, Math.PI * 2); s.ctx.fill();
 // pedestal + upper bowl
    s.px(cx - 2, base - 14, 4, 8, P.stoneD);
    s.ctx.fillStyle = P.stoneL;
    s.ctx.beginPath(); s.ctx.ellipse(cx, base - 16, 8, 4, 0, 0, Math.PI * 2); s.ctx.fill();
    s.ctx.fillStyle = P.waterL;
    s.ctx.beginPath(); s.ctx.ellipse(cx, base - 16.5, 6, 2.8, 0, 0, Math.PI * 2); s.ctx.fill();
 // spout column of water
    s.px(cx - 0.8, base - 26, 1.6, 10, P.waterL);
    s.px(cx - 0.3, base - 28, 0.8, 3, '#dff2f6');
    s.px(cx - 5, base - 22, 2, 1.2, P.waterL); s.px(cx + 3, base - 20, 2, 1.2, P.waterL);
}, { name: 'Courtyard Fountain', cat: 'decor', layer: 'item', fw: 1, fh: 1, price: 5800, rarity: 'epic', comfort: 3, w: 30, h: 32 });

// -- wall painting (wall layer) --
def('painting_land', 'painting_land.png', (s, w, h) => {
    const cx = w / 2 + 1;
 // gilded frame
    s.px(cx - 15, 4, 30, 24, P.goldD);
    s.px(cx - 13, 6, 26, 20, '#3a2b1c');
 // landscape: sky, hills, sun
    s.px(cx - 13, 6, 26, 9, '#8cb4c9');
    s.px(cx - 13, 15, 26, 11, '#5a8c46');
    s.ctx.fillStyle = '#4a7238';
    s.ctx.beginPath(); s.ctx.moveTo(cx - 13, 20); s.ctx.quadraticCurveTo(cx - 4, 13, cx + 4, 19);
    s.ctx.quadraticCurveTo(cx + 9, 22, cx + 13, 19); s.ctx.lineTo(cx + 13, 26); s.ctx.lineTo(cx - 13, 26); s.ctx.closePath(); s.ctx.fill();
    s.ctx.fillStyle = '#f4d47a';
    s.ctx.beginPath(); s.ctx.arc(cx + 6, 10, 3, 0, Math.PI * 2); s.ctx.fill();
    s.px(cx - 13, 6, 26, 1, '#5a4327');
}, { name: 'Vale Painting', cat: 'decor', layer: 'wall', fw: 1, fh: 1, price: 3000, rarity: 'uncommon', comfort: 2, w: 34, h: 32 });

// -- write catalog --
const catPath = path.join(OUT, 'catalog.json');
const cat = JSON.parse(fs.readFileSync(catPath, 'utf8'));
const existing = new Set(cat.items.map((i) => i.id));
let added = 0;
for (const it of ITEMS) {
    if (existing.has(it.id)) continue;
    const { file, ...rest } = it;
    cat.items.push({ ...rest, file });
    added++;
}
fs.writeFileSync(catPath, JSON.stringify(cat, null, 1) + '\n');
console.log(`[gen] furniture sprites written: ${ITEMS.length} (${added} new catalog entries), total items: ${cat.items.length}`);
