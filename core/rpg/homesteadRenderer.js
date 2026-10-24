'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  HOMESTEAD RENDERER — isometric house builder art pipeline
// ═══════════════════════════════════════════════════════════════════════════
//  Draws a 12x12 isometric room (2:1 pixel iso) with procedural brick walls,
//  CC0 hand-pixelled furniture (OpenGameArt "Isometric Furniture and Walls",
//  CC0 — segmented into individual sprites), torch/hearth/cauldron/well
//  animation, dust motes, and a Homestead HUD plate.
//
//  Outputs:
//    renderRoomFrames(state, opts) → [PNG Buffer]   (FRAMES animated frames)
//    encodeFramesToMp4(frames)     → Buffer          (WhatsApp "GIF")
//    renderRoomImage(state, opts)  → { buffer, contentType }  (mp4 w/ png fallback)
//    renderCatalogPage(page, pages, opts) → PNG Buffer (outfitter cards)
//
//  All geometry lives in ART pixels (device = art × SS supersample).
//  Item sprites are drawn at 2× source scale; floors at 1:1 (source tiles
//  are authored for 64×32 diamonds). imageSmoothing stays OFF everywhere so
//  the pixel art never mushes.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const os = require('os');
const isoShadow = require('./isoShadow');
const mediaCache = require('./mediaCache');
const { fillTextMixed } = require('./emojiFont');   // 2026-10-20: astral emoji color bitmaps (owner 'use colors not hex code')

// ── world constants ──
const SS = 2;               // supersample (device px per art px)
const TW = 64, TH = 32;     // floor tile size (2:1)
const N = 12;               // room tiles per side
const WALL_H = 126;         // wall height (art px)
const ART_W = 900, ART_H = 900;
const OX = ART_W / 2;
const OY = 64 + WALL_H;     // top corner of the floor diamond

const FRAMES = 14, FRAME_MS = 100;

// ── themes: megakit floor tiles + plaster-and-timber wall palette ──
// (interior restyle 2026-10-16: floors are MVM-rendered diamonds, walls
// painted in the same plaster+timber law as the new village buildings;
// palette = [plaster, plasterShade, timber, timberDark], frame = beam style)
const THEMES = {
    oakhaven:    { name: 'Oakhaven',    floor: ['floor_mvm_wooddark'],    wall: ['#e6d9bd', '#d6c6a4', '#6b4a2a', '#4a3118'], mortar: '#4a2d17', frame: 'grid',  price: 0 },
    stonehearth: { name: 'Stonehearth', floor: ['floor_mvm_brick'],       wall: ['#d9d4cc', '#c4beb4', '#5a5e62', '#3d4044'], mortar: '#474b4f', frame: 'post',  price: 5000 },
    sunspire:    { name: 'Sunspire',    floor: ['floor_mvm_woodlight'],   wall: ['#efe0b8', '#e0cd9c', '#8a6a3e', '#5e4626'], mortar: '#7a6232', frame: 'brace', price: 9000 },
    tidecourt:   { name: 'Tidecourt',   floor: ['floor_mvm_redbrick'],    wall: ['#cfe0dc', '#b8cdc8', '#3e6a72', '#27454c'], mortar: '#1f434b', frame: 'post',  price: 14000 },
    arcaneum:    { name: 'Arcaneum',    floor: ['floor_mvm_wooddark'],    wall: ['#ddd2e0', '#c8bacb', '#5a3a66', '#38203f'], mortar: '#3d1a35', frame: 'grid',  price: 20000 },
    blackvault:  { name: 'Blackvault',  floor: ['floor_mvm_unevenbrick'], wall: ['#c9c9c9', '#b0b0b0', '#3a3d42', '#232527'], mortar: '#232527', frame: 'post',  price: 26000 },
};

// ── rarity chrome for cards ──
const RARITY = {
    common:    { col: '#9aa5b1', glow: 'rgba(154,165,177,0.25)' },
    uncommon:  { col: '#58c06a', glow: 'rgba(88,192,106,0.30)' },
    rare:      { col: '#4a9be8', glow: 'rgba(74,155,232,0.35)' },
    epic:      { col: '#b06ae8', glow: 'rgba(176,106,232,0.40)' },
    legendary: { col: '#f0a83c', glow: 'rgba(240,168,60,0.45)' },
};

// ── asset paths ──
const ASSETS = path.join(__dirname, '..', 'rpgasset', 'homestead');
const FONTS = path.join(__dirname, '..', 'rpgasset', 'fonts');

// ── fonts ──
let fontsReady = false;
function ensureFonts() {
    if (fontsReady) return true;
    try {
        const canvas = require('canvas');
        const registerFont = canvas.registerFont || (canvas.GlobalFonts && canvas.GlobalFonts.registerFromPath);
        if (!registerFont) return false;
        const regs = [
            ['CinzelDecorative-Black.ttf', { family: 'Cinzel Deco' }],
            ['Cinzel-Variable.ttf', { family: 'Cinzel' }],
            ['MedievalSharp.ttf', { family: 'Medieval' }],
        ];
        for (const [f, o] of regs) {
            const p = path.join(FONTS, f);
            if (fs.existsSync(p)) { try { registerFont(p, o); } catch (e) { /* skip */ } }
        }
        fontsReady = true;
        return true;
    } catch (e) { return false; }
}

// ── rng ──
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function hashStr(s) {
    let h = 2166136261;
    s = String(s || '');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

// ── asset caches ──
const _img = new Map();
async function img(file) {
    if (_img.has(file)) return _img.get(file);
    let out = null;
    try { out = await require('canvas').loadImage(path.join(ASSETS, file)); } catch (e) { out = null; }
    _img.set(file, out);
    return out;
}

let CATALOG = null;
function catalog() {
    if (!CATALOG) {
        try { CATALOG = JSON.parse(fs.readFileSync(path.join(ASSETS, 'catalog.json'), 'utf8')); }
        catch (e) { CATALOG = { items: [], floors: {} }; }
    }
    return CATALOG;
}
const _itemIdx = new Map();
function itemDef(id) {
    const c = catalog();
    if (!_itemIdx.size) for (const it of c.items) _itemIdx.set(it.id, it);
    return _itemIdx.get(id);
}

// ── iso projection ──
function isoX(x, y) { return OX + (x - y) * (TW / 2); }
function isoY(x, y) { return OY + (x + y) * (TH / 2); }
function footCenter(x, y, fw, fh) {
    const cx = x + fw / 2, cy = y + fh / 2;
    return { x: isoX(cx, cy), y: isoY(cx, cy) };
}

// ── color helper ──
function shade(hex, f) {
    let n = NaN;
    try { n = parseInt(String(hex).slice(1), 16); } catch (e) {}
    if (!Number.isFinite(n)) return '#7a5a3a';
    const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * f)));
    const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * f)));
    const b = Math.max(0, Math.min(255, Math.round((n & 255) * f)));
    return `rgb(${r},${g},${b})`;
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// ══════════════════════════════════════════════════════════════════════════
// WALLS — plaster + timber frame (matches the MVM village exterior);
// same sloped-run geometry law as before (N segments along the iso edge)
// ══════════════════════════════════════════════════════════════════════════
function drawWallRun(ctx, x0, y0, x1, y1, theme, seedBase, frame) {
    const segs = N;
    const dx = (x1 - x0) / segs, dy = (y1 - y0) / segs;
    const rng = mulberry32(seedBase);
    const plaster = theme.wall[0], plasterD = theme.wall[1];
    const timber = theme.wall[2], timberD = theme.wall[3];
    const lightSide = x1 > x0 ? 1.06 : 0.86;

    // plaster backing (per-segment tone variation)
    for (let s = 0; s < segs; s++) {
        const bx0 = x0 + dx * s, by0 = y0 + dy * s;
        const bx1 = x0 + dx * (s + 1), by1 = y0 + dy * (s + 1);
        ctx.beginPath();
        ctx.moveTo(bx0, by0); ctx.lineTo(bx1, by1);
        ctx.lineTo(bx1, by1 - WALL_H); ctx.lineTo(bx0, by0 - WALL_H);
        ctx.closePath();
        ctx.fillStyle = shade(rng() < 0.5 ? plaster : plasterD, lightSide * (0.94 + rng() * 0.12));
        ctx.fill();
    }
    // soft plaster shading (light above, AO below)
    const gsh = ctx.createLinearGradient(0, y0 - WALL_H, 0, y0);
    gsh.addColorStop(0, 'rgba(255,240,210,0.10)');
    gsh.addColorStop(0.72, 'rgba(0,0,0,0)');
    gsh.addColorStop(1, 'rgba(0,0,0,0.16)');
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    ctx.lineTo(x1, y1 - WALL_H); ctx.lineTo(x0, y0 - WALL_H);
    ctx.closePath();
    ctx.fillStyle = gsh; ctx.fill();
    ctx.restore();

    // timber frame — horizontal beams
    for (const [hh, col, lw] of [[0, timber, 7], [WALL_H - 7, timberD, 7], [WALL_H * 0.52, timber, 4]]) {
        ctx.strokeStyle = shade(col, lightSide);
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(x0, y0 - hh); ctx.lineTo(x1, y1 - hh);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,235,190,0.14)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, y0 - hh - lw / 2); ctx.lineTo(x1, y1 - hh - lw / 2);
        ctx.stroke();
    }
    // vertical posts at every segment boundary
    for (let s = 0; s <= segs; s++) {
        const px = x0 + dx * s, py = y0 + dy * s;
        ctx.strokeStyle = shade(s % 2 ? timber : timberD, lightSide);
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(px, py); ctx.lineTo(px, py - WALL_H);
        ctx.stroke();
    }
    // braces between posts
    if (theme.frame === 'grid') {
        ctx.strokeStyle = shade(timberD, lightSide);
        ctx.lineWidth = 3.5;
        for (let s = 0; s < segs; s++) {
            const ax = x0 + dx * s, ay = y0 + dy * s;
            const bx = x0 + dx * (s + 1), by = y0 + dy * (s + 1);
            ctx.beginPath(); ctx.moveTo(ax + dx * 0.12, ay - 6); ctx.lineTo(bx - dx * 0.12, by - WALL_H + 6); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(bx - dx * 0.12, by - 6); ctx.lineTo(ax + dx * 0.12, ay - WALL_H + 6); ctx.stroke();
        }
    } else if (theme.frame === 'brace') {
        ctx.strokeStyle = shade(timberD, lightSide);
        ctx.lineWidth = 4;
        for (let s = 0; s < segs; s += 2) {
            const ax = x0 + dx * s, ay = y0 + dy * s;
            const bx = x0 + dx * (s + 1), by = y0 + dy * (s + 1);
            ctx.beginPath(); ctx.moveTo(ax + dx * 0.1, ay - WALL_H + 8); ctx.lineTo(bx - dx * 0.1, by - 10); ctx.stroke();
        }
    }
    // top cap — extends "back" (away from viewer)
    let capdx, capdy;
    if (x1 < x0) { capdx = -TW / 2; capdy = -TH / 2; }   // left wall → up-left
    else { capdx = +TW / 2; capdy = -TH / 2; }           // right wall → up-right
    ctx.beginPath();
    ctx.moveTo(x0, y0 - WALL_H);
    ctx.lineTo(x1, y1 - WALL_H);
    ctx.lineTo(x1 + capdx, y1 - WALL_H + capdy);
    ctx.lineTo(x0 + capdx, y0 - WALL_H + capdy);
    ctx.closePath();
    ctx.fillStyle = shade(theme.wall[0], 0.58);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,235,190,0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // cut-end cross-section (open front ends of the cutaway room)
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1, y1 - WALL_H);
    ctx.lineTo(x1 + capdx, y1 - WALL_H + capdy);
    ctx.lineTo(x1 + capdx, y1 + capdy);
    ctx.closePath();
    ctx.fillStyle = shade(theme.wall[3], 0.55);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.stroke();

    // baseboard AO strip
    const grad = ctx.createLinearGradient(0, y1 - 8, 0, y1 + 26);
    grad.addColorStop(0, 'rgba(0,0,0,0.30)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    ctx.lineTo(x1, y1 + 26); ctx.lineTo(x0, y0 + 26);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
}

// torch sconces (always present, animated)
function drawTorch(ctx, wx, wy, frame, seed) {
    const fl = (Math.sin(frame * 1.9 + seed) * 0.5 + 0.5);
    ctx.fillStyle = '#3a2b1c';
    ctx.fillRect(wx - 3, wy - 26, 6, 10);
    ctx.fillStyle = '#5a4327';
    ctx.fillRect(wx - 2, wy - 40, 4, 16);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const R = 30 + fl * 8;
    const g = ctx.createRadialGradient(wx, wy - 52, 2, wx, wy - 52, R);
    g.addColorStop(0, 'rgba(255,190,90,0.55)');
    g.addColorStop(0.5, 'rgba(255,140,50,0.22)');
    g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(wx, wy - 52, R, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    const flame = (h, w, col) => {
        ctx.beginPath();
        ctx.moveTo(wx, wy - 44 - h);
        ctx.quadraticCurveTo(wx + w, wy - 44 - h * 0.4, wx, wy - 42);
        ctx.quadraticCurveTo(wx - w, wy - 44 - h * 0.4, wx, wy - 44 - h);
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.fill();
    };
    flame(15 + fl * 5, 5.5, 'rgba(255,120,30,0.85)');
    flame(10 + fl * 4, 3.5, 'rgba(255,200,60,0.95)');
    flame(5 + fl * 2, 2, 'rgba(255,245,200,0.95)');
}

// ═══════════════════════════════════════════════════════════════════════════
// ONE FRAME
// ═══════════════════════════════════════════════════════════════════════════
async function renderFrame(state, frame, opts = {}) {
    ensureFonts();
    // SS OVERRIDE (Task 37 speed round, owner "increase processing speed for
    // gif and card"): animated bakes render at ss=1 — the mp4 target was
    // ALWAYS half-res (ART_W x ART_H), so an SS=2 raw frame was a 4x-more-
    // pixels render whose pixels ffmpeg immediately threw half away.
    const ss = Math.max(0.5, Math.min(4, parseFloat(opts.ss) || SS));
    const canvas = require('canvas').createCanvas(ART_W * ss, ART_H * ss);
    const ctx = canvas.getContext('2d');
    ctx.scale(ss, ss);
    ctx.imageSmoothingEnabled = false;

    const theme = THEMES[state.theme] || THEMES.oakhaven;
    const seed = hashStr(state.owner + '|' + state.theme);

    // backdrop
    ctx.fillStyle = '#14100c';
    ctx.fillRect(0, 0, ART_W, ART_H);
    const amb = ctx.createRadialGradient(OX, OY + 130, 60, OX, OY + 130, 560);
    amb.addColorStop(0, '#2e2417');
    amb.addColorStop(0.55, '#1d1610');
    amb.addColorStop(1, '#120e0a');
    ctx.fillStyle = amb;
    ctx.fillRect(0, 0, ART_W, ART_H);

    // walls + corner shading
    const leftEnd = { x: isoX(0, N), y: isoY(0, N) };
    const rightEnd = { x: isoX(N, 0), y: isoY(N, 0) };
    drawWallRun(ctx, OX, OY, leftEnd.x, leftEnd.y, theme, seed + 1, frame);
    drawWallRun(ctx, OX, OY, rightEnd.x, rightEnd.y, theme, seed + 2, frame);
    const cg = ctx.createLinearGradient(OX - 10, 0, OX + 10, 0);
    cg.addColorStop(0, 'rgba(0,0,0,0.22)');
    cg.addColorStop(0.5, 'rgba(0,0,0,0)');
    cg.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = cg;
    ctx.fillRect(OX - 10, OY - WALL_H - 8, 20, WALL_H + 10);

    // torches
    drawTorch(ctx, isoX(0, 3.5), isoY(0, 3.5) - 40, frame, seed + 11);
    drawTorch(ctx, isoX(0, 8.5), isoY(0, 8.5) - 40, frame, seed + 12);
    drawTorch(ctx, isoX(3.5, 0), isoY(3.5, 0) - 40, frame, seed + 13);
    drawTorch(ctx, isoX(8.5, 0), isoY(8.5, 0) - 40, frame, seed + 14);

    // wall banners
    const wallBanners = (state.placed || []).filter(p => (itemDef(p.item) || {}).layer === 'wall');
    for (const p of wallBanners) {
        const spr = await img(`${p.item}.png`);
        if (!spr) continue;
        const t = Math.max(1, Math.min(N - 1, p.x));
        const right = p.y === 1;
        const wx = right ? isoX(t + 0.5, 0) : isoX(0, t + 0.5);
        const wy = right ? isoY(t + 0.5, 0) : isoY(0, t + 0.5);
        const bob = Math.sin(frame / FRAMES * Math.PI * 2 + p.x) * 1.5;
        const w = spr.width * 2, h = spr.height * 2;
        ctx.drawImage(spr, wx - w / 2, wy - h - 18 + bob, w, h);
    }

    // floor
    const floorImgs = [];
    for (const f of theme.floor) {
        const im = await img(`${f}.png`);
        if (im) floorImgs.push(im);
    }
    for (let sum = 0; sum <= 2 * (N - 1); sum++) {
        for (let x = Math.max(0, sum - N + 1); x <= Math.min(N - 1, sum); x++) {
            const y = sum - x;
            const r = mulberry32(seed + x * 131 + y * 17)();
            const timg = floorImgs[Math.floor(r * floorImgs.length)] || floorImgs[0];
            if (!timg) continue;
            ctx.drawImage(timg, isoX(x, y) - TW / 2, isoY(x, y) - TH / 2);
        }
    }
    // front edge rim
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(isoX(0, N), isoY(0, N));
    ctx.lineTo(isoX(N, N), isoY(N, N));
    ctx.lineTo(isoX(N, 0), isoY(N, 0));
    ctx.stroke();

    // wall base AO
    const aoL = ctx.createLinearGradient(0, OY, 0, OY + 46);
    aoL.addColorStop(0, 'rgba(0,0,0,0.26)');
    aoL.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(OX, OY); ctx.lineTo(leftEnd.x, leftEnd.y);
    ctx.lineTo(leftEnd.x + TW / 2, leftEnd.y + TH / 2 + 34);
    ctx.lineTo(OX + TW / 2, OY + TH / 2 + 34);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = aoL;
    ctx.fillRect(0, 0, ART_W, ART_H);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(OX, OY); ctx.lineTo(rightEnd.x, rightEnd.y);
    ctx.lineTo(rightEnd.x - TW / 2, rightEnd.y + TH / 2 + 34);
    ctx.lineTo(OX - TW / 2, OY + TH / 2 + 34);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = aoL;
    ctx.fillRect(0, 0, ART_W, ART_H);
    ctx.restore();

    // warm light pool
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pool = ctx.createRadialGradient(OX, OY + N * TH / 2 + 20, 30, OX, OY + N * TH / 2 + 20, 430);
    pool.addColorStop(0, 'rgba(255,190,110,0.14)');
    pool.addColorStop(1, 'rgba(255,160,80,0)');
    ctx.fillStyle = pool;
    ctx.fillRect(0, 0, ART_W, ART_H);
    ctx.restore();

    // rugs then depth-sorted items
    const placed = (state.placed || []).map(p => ({ ...p, def: itemDef(p.item) })).filter(p => p.def);
    const rugs = placed.filter(p => p.def.layer === 'rug');
    const items = placed.filter(p => p.def.layer === 'item')
        .sort((a, b) => ((a.x + a.def.fw / 2) + (a.y + a.def.fh / 2)) - ((b.x + b.def.fw / 2) + (b.y + b.def.fh / 2)));

    for (const p of rugs) {
        const spr = await img(`${p.item}.png`);
        if (!spr) continue;
        const c = footCenter(p.x, p.y, p.def.fw, p.def.fh);
        const w = spr.width * 2, h = spr.height * 2;
        ctx.drawImage(spr, c.x - w / 2, c.y - h / 2, w, h);
    }

    // ── grid preview overlay (Section 3): floor-pass — labelled axes + cells ──
    if (opts.grid) drawGridFloor(ctx, opts.grid, frame);

    const t = frame / FRAMES;

    // preload sprites + compute anchors once for both passes
    const drawn = [];
    for (const p of items) {
        const spr = await img(`${p.item}.png`);
        if (!spr) continue;
        const c = footCenter(p.x, p.y, p.def.fw, p.def.fh);
        // anchor: lowest painted floor vertex of the footprint (+2px settle) —
        // a sprite's base line lands exactly on its own tiles' south edge.
        const anchorY = c.y + (p.def.fw + p.def.fh) * (TH / 4) - TH / 2 + 2;
        drawn.push({ p, spr, c, anchorY, w: spr.width * 2, h: spr.height * 2 });
    }

    // ── move locomotion (owner 2026-10-16 "moving doesn't trigger an
    // animation"): when pop carries a `from` cell, the piece SLIDES from the
    // old tile to the new one with easeOutCubic + a dust kick at the origin.
    if (opts.pop && opts.pop.from) {
        for (const d of drawn) {
            if (opts.pop.item !== d.p.item || opts.pop.x !== d.p.x || opts.pop.y !== d.p.y) continue;
            const fc = footCenter(opts.pop.from.x, opts.pop.from.y, d.p.def.fw, d.p.def.fh);
            const e = Math.min(1, t * 1.5);
            const k = 1 - Math.pow(1 - e, 3); // easeOutCubic
            // owner 2026-10-16 21:23Z "if the destination is close ... it should
            // just slide in from its last position": the lift mid-slide scales
            // with distance — a close move is a FLAT glide, only long hauls hop
            const slideDist = Math.hypot(d.c.x - fc.x, d.c.y - fc.y);
            const hop = Math.sin(k * Math.PI) * Math.min(9, slideDist * 0.12);
            d.c = { x: fc.x + (d.c.x - fc.x) * k, y: fc.y + (d.c.y - fc.y) * k };
            d.anchorY = d.c.y + (d.p.def.fw + d.p.def.fh) * (TH / 4) - TH / 2 + 2 - hop;
            if (k < 1) {
                // dust kick at the origin cell, strongest right after the push-off
                const pr = mulberry32(seed + 1234);
                ctx.save();
                ctx.globalAlpha = 0.5 * (1 - k);
                ctx.fillStyle = '#d8c8a2';
                for (let i = 0; i < 6; i++) {
                    const a = pr() * Math.PI * 2, rr = 4 + pr() * 14 * (0.4 + k);
                    ctx.beginPath();
                    ctx.ellipse(fc.x + Math.cos(a) * rr, fc.y + 6 + Math.sin(a) * rr * 0.4, 3.4, 2, 0, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }
        }
    }

    // ═══ SHADOWS — rebuilt from scratch (owner: "scrap it and redo") ═══
    // isoShadow.js: sprite-SILHOUETTE cast shadows squashed onto the floor
    // plane and marched along the key-light direction (upper-left key →
    // lower-right cast, consistent with the sprite art's own shading), plus
    // a tight contact-AO band under each base line. No more generic
    // rhombi/ellipses that didn't fit the sprites.
    for (const d of drawn) {
        let sal = 1;
        if (opts.pop && !opts.pop.from && opts.pop.item === d.p.item && opts.pop.x === d.p.x && opts.pop.y === d.p.y) {
            // placement fades its shadow in; a SLIDE keeps its shadow riding
            // along under the piece for the whole glide
            sal = Math.min(1, t * 4);
        }
        isoShadow.drawItemShadow(ctx, {
            img: d.spr, key: `${d.p.item}${d.p.f ? ':f' : ''}`, scale: 2,
            ax: d.c.x, ay: d.anchorY, flip: !!d.p.f, alpha: sal,
        });
    }

    // ═══ SPRITES (depth-sorted back→front) ═══
    for (const d of drawn) {
        const { p, spr, c, anchorY, w, h } = d;
        // placement pop-in — ONLY for real placements (no `from`): a slide
        // must never also drop from above (owner 2026-10-16 21:23Z close-move
        // law). rotate passes pop without `from` and keeps its turn-bounce.
        let drop = 0, alpha = 1;
        if (opts.pop && !opts.pop.from && opts.pop.item === p.item && opts.pop.x === p.x && opts.pop.y === p.y) {
            const pt = Math.min(1, t * 2.2);
            const bounce = pt < 1 ? Math.abs(Math.cos(pt * Math.PI * 1.6)) * Math.pow(1 - pt, 1.6) : 0;
            drop = -(1 - pt) * 90 - bounce * 26;
            alpha = Math.min(1, pt * 4);
            if (pt > 0.92) {
                const pr = mulberry32(seed + 99);
                ctx.save();
                ctx.globalAlpha = (1 - pt) * 6 * 0.4;
                ctx.fillStyle = '#cbb78f';
                for (let i = 0; i < 7; i++) {
                    const a = pr() * Math.PI * 2, rr = 8 + pr() * 26;
                    ctx.beginPath();
                    ctx.ellipse(c.x + Math.cos(a) * rr, anchorY - 4 + Math.sin(a) * rr * 0.4, 4, 2.4, 0, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }
        }

        ctx.save();
        ctx.globalAlpha = alpha;
        if (p.f) {
            // flip = mirror around the item's own center axis (iso 90° fake,
            // standard for sprites with a single authored facing)
            ctx.translate(2 * c.x, 0);
            ctx.scale(-1, 1);
        }
        if (p.item === 'hearth_brick') await drawHearth(ctx, spr, c, anchorY, frame, seed, w, h, drop);
        else if (p.item === 'cauldron') await drawCauldron(ctx, spr, c, anchorY, frame, seed, w, h, drop);
        else if (p.item === 'well_wishing') await drawWell(ctx, spr, c, anchorY, frame, seed, w, h, drop);
        else ctx.drawImage(spr, c.x - w / 2, anchorY - h + drop, w, h);
        ctx.restore();
    }

    // ── grid preview overlay (above items): pulsing selection + chevron ──
    if (opts.grid) drawGridSelection(ctx, opts.grid, frame);

    // dust motes
    const mr = mulberry32(seed + 777);
    ctx.save();
    for (let i = 0; i < 10; i++) {
        const bx = OX + (mr() - 0.5) * 640;
        const by = OY + 40 + mr() * 300;
        const drift = (t + mr()) % 1;
        const mx = bx + Math.sin((t + i) * Math.PI * 2) * 14 - drift * 10;
        const my = by - drift * 34;
        ctx.globalAlpha = 0.14 + 0.16 * Math.sin((t + mr()) * Math.PI * 2) ** 2;
        ctx.fillStyle = '#ffe9b8';
        ctx.beginPath(); ctx.arc(mx, my, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // vignette
    const vg = ctx.createRadialGradient(OX, OY + 150, 320, OX, OY + 150, 760);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(8,5,2,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, ART_W, ART_H);

    drawHud(ctx, state, theme, opts);
    // RAW ENCODER — see homesteadBaseRenderer (owner 2026-10-17 '.j base
    // shuts down'): animated room bakes render raw BGRA frames so the bake
    // never sync-encodes 13 PNGs back to back.
    if (opts.encoder === 'raw') {
        return { raw: canvas.toBuffer('raw'), w: canvas.width, h: canvas.height };
    }
    // RETURN-CANVAS (Task 37 speed round) — internal callers encode the
    // finished art themselves (downscale + JPEG) without a full-res PNG
    // encode round-trip.
    if (opts.returnCanvas) return canvas;
    return canvas.toBuffer('image/png');
}

// ── animated furniture specials ──
async function drawHearth(ctx, spr, c, anchorY, frame, seed, w, h, drop) {
    ctx.drawImage(spr, c.x - w / 2, anchorY - h + drop, w, h);
    const fl = (Math.sin(frame * 2.3 + seed) * 0.5 + 0.5) * 0.6 + (Math.sin(frame * 5.1 + seed * 2) * 0.5 + 0.5) * 0.4;
    const fx = c.x - w * 0.04, fy = anchorY - h * 0.16;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const R = 34 + fl * 10;
    const g = ctx.createRadialGradient(fx, fy, 2, fx, fy, R);
    g.addColorStop(0, 'rgba(255,170,60,0.60)');
    g.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(fx, fy, R, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    const flame = (hh, ww, col, ox) => {
        ctx.beginPath();
        ctx.moveTo(fx + ox, fy - hh);
        ctx.quadraticCurveTo(fx + ox + ww, fy - hh * 0.35, fx + ox, fy + 3);
        ctx.quadraticCurveTo(fx + ox - ww, fy - hh * 0.35, fx + ox, fy - hh);
        ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    };
    flame(16 + fl * 6, 6, 'rgba(255,110,20,0.9)', 0);
    flame(11 + fl * 4, 4, 'rgba(255,190,60,0.95)', 1);
    flame(6 + fl * 3, 2.2, 'rgba(255,244,200,0.95)', 0);
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#cfc4b0';
    const st = (frame / FRAMES) % 1;
    ctx.beginPath();
    ctx.ellipse(fx + Math.sin(st * Math.PI * 2) * 6, fy - 30 - st * 46, 5 + st * 8, 7 + st * 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

async function drawCauldron(ctx, spr, c, anchorY, frame, seed, w, h, drop) {
    ctx.drawImage(spr, c.x - w / 2, anchorY - h + drop, w, h);
    const fx = c.x, fy = anchorY - h * 0.62;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(fx, fy, 2, fx, fy, 26 + Math.sin(frame) * 4);
    g.addColorStop(0, 'rgba(120,255,140,0.34)');
    g.addColorStop(1, 'rgba(60,255,110,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(fx, fy, 30, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    const rr = mulberry32(seed + 31);
    for (let i = 0; i < 4; i++) {
        const ph = ((frame / FRAMES) + rr()) % 1;
        ctx.globalAlpha = 0.75 * (1 - ph);
        ctx.strokeStyle = 'rgba(160,255,170,0.8)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(c.x - 8 + rr() * 16, fy + 6 - ph * 22, 2.5 + ph * 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.globalAlpha = 0.13;
    ctx.fillStyle = '#bfffd0';
    const st = (frame / FRAMES) % 1;
    ctx.beginPath();
    ctx.ellipse(c.x + Math.sin(st * 6.28) * 5, fy - 14 - st * 40, 6 + st * 9, 8 + st * 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

async function drawWell(ctx, spr, c, anchorY, frame, seed, w, h, drop) {
    ctx.drawImage(spr, c.x - w / 2, anchorY - h + drop, w, h);
    const fy = anchorY - h * 0.30;
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.2 * Math.sin(frame * 1.4);
    const g = ctx.createRadialGradient(c.x, fy, 1, c.x, fy, 14);
    g.addColorStop(0, 'rgba(140,220,255,0.9)');
    g.addColorStop(1, 'rgba(60,130,200,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(c.x, fy, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (frame % 4 === 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(220,245,255,0.9)';
        ctx.beginPath(); ctx.arc(c.x + 4, fy - 2, 1.6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
}

// ── grid preview overlay (movement system, Section 3) ──
function drawDiamond(ctx, cx, cy, rx, ry) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - ry); ctx.lineTo(cx + rx, cy); ctx.lineTo(cx, cy + ry); ctx.lineTo(cx - rx, cy);
    ctx.closePath();
}
function drawGridFloor(ctx, g, frame) {
    // v2 (owner 2026-10-16 17:27Z "the grid isn't a very visible overlay… tiny"):
    // full hairline grid across EVERY floor tile + BIG bold coordinate
    // numbers sitting IN the front-edge tiles, dark-outlined gold so they
    // read at WhatsApp thumbnail size. Front rims stroked gold.
    ctx.save();
    // 1) full grid hairlines
    ctx.strokeStyle = 'rgba(250,240,210,0.30)';
    ctx.lineWidth = 1.2;
    for (let i = 1; i < N; i++) {
        ctx.beginPath(); ctx.moveTo(isoX(i, 0), isoY(i, 0)); ctx.lineTo(isoX(i, N), isoY(i, N)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(isoX(0, i), isoY(0, i)); ctx.lineTo(isoX(N, i), isoY(N, i)); ctx.stroke();
    }
    // 2) gold front rims (SW + SE edges of the floor)
    ctx.strokeStyle = 'rgba(244,206,110,0.95)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(isoX(0, N), isoY(0, N)); ctx.lineTo(isoX(N, N), isoY(N, N)); ctx.lineTo(isoX(N, 0), isoY(N, 0));
    ctx.stroke();
    // 3) bold coordinate numbers centred in the front-edge tiles
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 26px Cinzel, Medieval, sans-serif';
    for (let i = 0; i < N; i++) {
        const spots = [
            [isoX(i, N - 1), isoY(i, N - 1) - 1],   // SW edge tile (X axis)
            [isoX(N - 1, i) + 1, isoY(N - 1, i) - 1], // SE edge tile (Y axis)
        ];
        for (const [tx, ty] of spots) {
            ctx.lineWidth = 5;
            ctx.strokeStyle = 'rgba(28,17,6,0.88)';
            ctx.strokeText(String(i), tx, ty);
            ctx.fillStyle = '#ffd76a';
            ctx.fillText(String(i), tx, ty);
        }
    }
    // axis captions, oversized
    ctx.font = 'bold 30px Cinzel, Medieval, sans-serif';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(28,17,6,0.9)';
    ctx.strokeText('X →', isoX(N, N - 1) - 26, isoY(N, N - 1) + 26);
    ctx.fillStyle = '#ffe6a0';
    ctx.fillText('X →', isoX(N, N - 1) - 26, isoY(N, N - 1) + 26);
    ctx.strokeText('↓ Y', isoX(N - 1, N) + 30, isoY(N - 1, N) + 24);
    ctx.fillStyle = '#ffe6a0';
    ctx.fillText('↓ Y', isoX(N - 1, N) + 30, isoY(N - 1, N) + 24);
    // footprint cell highlight (kept from v1, brightened)
    const pulse = 0.5 + 0.5 * Math.sin((frame / FRAMES) * Math.PI * 2);
    const valid = g.valid !== false;
    for (let ix = 0; ix < (g.fw || 1); ix++) {
        for (let iy = 0; iy < (g.fh || 1); iy++) {
            const cx = isoX(g.x + ix, g.y + iy), cy = isoY(g.x + ix, g.y + iy);
            drawDiamond(ctx, cx, cy, TW / 2 - 2, TH / 2 - 1);
            ctx.fillStyle = valid ? `rgba(255,214,100,${0.16 + 0.14 * pulse})` : `rgba(235,70,50,${0.18 + 0.16 * pulse})`;
            ctx.fill();
            ctx.strokeStyle = valid ? `rgba(255,214,100,${0.65 + 0.35 * pulse})` : `rgba(240,85,60,${0.7 + 0.3 * pulse})`;
            ctx.lineWidth = 3;
            ctx.stroke();
        }
    }
    ctx.restore();
}
function drawGridSelection(ctx, g, frame) {
    // bobbing chevron above the selected piece
    const cx = isoX(g.x + (g.fw || 1) / 2, g.y + (g.fh || 1) / 2);
    const topY = isoY(g.x + (g.fw || 1) / 2, g.y + (g.fh || 1) / 2)
        - ((g.fw || 1) + (g.fh || 1)) * (TH / 4) - 78 + Math.sin((frame / FRAMES) * Math.PI * 2) * 4;
    ctx.save();
    ctx.fillStyle = g.valid !== false ? 'rgba(240,200,90,0.95)' : 'rgba(230,80,60,0.95)';
    ctx.strokeStyle = 'rgba(20,12,6,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 9, topY - 10); ctx.lineTo(cx + 9, topY - 10); ctx.lineTo(cx, topY);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    if (g.label) {
        ctx.font = '14px Medieval, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(20,12,6,0.85)';
        ctx.lineWidth = 3;
        ctx.strokeText(g.label, cx, topY - 22);
        ctx.fillStyle = '#f2e2b8';
        ctx.fillText(g.label, cx, topY - 22);
    }
    ctx.restore();
}

// ═══ 3D INTERIOR OVERLAYS (owner 2026-10-24: "add the moving gif we used to have
// for the old furniture system for this, the grid too — functionality wise it
// should be similar except better; leave the new Models and rendering untouched") ═══
// The 3D room bakes ONE interior raster (interior3d models + rasteriser stay
// untouched); every loop frame is that raster + these CHEAP projected overlays,
// streamed through the same ffmpeg mp4 "GIF" pipe the 2D room uses:
//   • the old furniture-system selection grid (1227b6c §3) — hairlines, gold
//     front rims, X/Y coordinate labels on the front edges, pulsing footprint
//     cells, bobbing chevron + name/(x,y) label — ported from
//     drawGridFloor/drawGridSelection and re-projected through the 3D camera
//   • living-room ambience — hearth/oven/candelabra/lantern glow pulse + rising
//     embers + drifting dust motes (the old 2D loop's life, in overlay form)
//   • move/moveto feedback — fading slide trail + expanding impact ring
const I3 = require('./interior3d/scene');
const HRooms = require('./homesteadRooms');
const LIGHT_IDS = new Set(['hearth_brick', 'oven_brick', 'oven_stone', 'candelabra', 'lantern_stand', 'cauldron']);

function draw3dOverlay(ctx, room, k, oy, state, frame, opts) {
    if (!room.project) return;   // older interior build — overlays silently off
    const N3 = I3.N;
    const ft = (frame / FRAMES) * Math.PI * 2;
    const fz = (lvl) => (lvl === 1 ? I3.LOFT_Z : 0) + 0.02;
    // project world -> room px -> ART px (room is drawn at (0, oy, ART_W, h))
    const P = (x, y, z) => { const p = room.project(x, y, z); return [p[0] * k, oy + p[1] * k]; };
    const cellC = (gx, gy, z) => P(I3.cellX(gx) + I3.CELL / 2, I3.cellY(gy) - I3.CELL / 2, z);
    ctx.save();

    // ── A0. selection highlight (interior3d v5) — the selected piece re-rendered
    // ALONE with the room's own camera, composited OVER the raster so it GLOWS
    // and stays visible THROUGH walls (annex back walls, loft slab, partitions)
    // — owner 2026-10-24 21:00Z "anything that is selected should glow and be
    // visible through walls". Gold halo while the spot fits, red when blocked.
    if (room.hl) {
        const pulse = 0.5 + 0.5 * Math.sin(ft);
        const valid = !(opts.grid && opts.grid.valid === false);
        const dw = room.width * k, dh = room.height * k;
        ctx.save();
        ctx.shadowColor = valid ? `rgba(255,206,88,${(0.80 + 0.20 * pulse).toFixed(3)})` : `rgba(242,84,56,${(0.80 + 0.20 * pulse).toFixed(3)})`;
        ctx.shadowBlur = 24 + 12 * pulse;
        ctx.drawImage(room.hl, 0, oy, dw, dh);
        ctx.drawImage(room.hl, 0, oy, dw, dh);      // double pass deepens the halo
        ctx.shadowBlur = 0;
        ctx.drawImage(room.hl, 0, oy, dw, dh);      // crisp piece on top
        ctx.restore();
    }

    // ── A. selection grid (opts.grid) ──
    if (opts.grid) {
        const g = opts.grid;
        // Draw on the selected platform instead of underneath the loft slab.
        // Ground level follows the main room and every built annex; the loft
        // uses its own 6x6 footprint.
        const floorZ = fz(g.lvl);
        const regions = g.lvl === 1
            ? [HRooms.LOFT]
            : [
                { x0: 0, y0: 0, x1: N3, y1: N3 },
                ...(state.annex || []).map((a) => HRooms.SIDES[a.side]).filter(Boolean),
            ];

        ctx.strokeStyle = 'rgba(250,240,210,0.38)';
        ctx.lineWidth = 1.2;
        for (const r of regions) {
            for (let i = r.x0 + 1; i < r.x1; i++) {
                const a = P(I3.cellX(i), I3.cellY(r.y0), floorZ);
                const b = P(I3.cellX(i), I3.cellY(r.y1), floorZ);
                ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
            }
            for (let i = r.y0 + 1; i < r.y1; i++) {
                const a = P(I3.cellX(r.x0), I3.cellY(i), floorZ);
                const b = P(I3.cellX(r.x1), I3.cellY(i), floorZ);
                ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
            }
        }

        // Gold front rims at the same height as the selected floor.
        ctx.strokeStyle = 'rgba(244,206,110,0.95)';
        ctx.lineWidth = 3;
        for (const r of regions) {
            ctx.beginPath();
            for (let i = r.x0; i <= r.x1; i++) {
                const p = P(I3.cellX(i), I3.cellY(r.y1), floorZ);
                if (i === r.x0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
            }
            ctx.stroke();
            ctx.beginPath();
            for (let i = r.y0; i <= r.y1; i++) {
                const p = P(I3.cellX(r.x1), I3.cellY(i), floorZ);
                if (i === r.y0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
            }
            ctx.stroke();
        }

        // Front-edge coordinates use global positions for annexes. Labels on
        // the lower edge show X; labels on the right edge show Y. Dedupe the
        // shared corner so its two labels do not overprint one another.
        const edgeCells = new Map();
        for (const r of regions) {
            for (let gx = r.x0; gx < r.x1; gx++) {
                edgeCells.set(String(gx) + ',' + String(r.y1 - 1), { x: gx, y: r.y1 - 1, label: String(gx) });
            }
            for (let gy = r.y0; gy < r.y1; gy++) {
                const key = String(r.x1 - 1) + ',' + String(gy);
                if (!edgeCells.has(key)) edgeCells.set(key, { x: r.x1 - 1, y: gy, label: String(gy) });
            }
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 26px Cinzel, Medieval, sans-serif';
        for (const cell of edgeCells.values()) {
            const [tx, ty] = cellC(cell.x, cell.y, floorZ);
            ctx.lineWidth = 5;
            ctx.strokeStyle = 'rgba(28,17,6,0.88)';
            ctx.strokeText(cell.label, tx, ty);
            ctx.fillStyle = '#ffd76a';
            ctx.fillText(cell.label, tx, ty);
        }

        // The pulsing footprint and selection chevron track the item's level.
        const pulse = 0.5 + 0.5 * Math.sin(ft);
        const fw = g.fw || 1, fh = g.fh || 1, valid = g.valid !== false;
        for (let ix = 0; ix < fw; ix++) {
            for (let iy = 0; iy < fh; iy++) {
                const gx = g.x + ix, gy = g.y + iy;
                const quad = [
                    P(I3.cellX(gx), I3.cellY(gy + 1), floorZ), P(I3.cellX(gx + 1), I3.cellY(gy + 1), floorZ),
                    P(I3.cellX(gx + 1), I3.cellY(gy), floorZ), P(I3.cellX(gx), I3.cellY(gy), floorZ),
                ];
                ctx.beginPath();
                quad.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
                ctx.closePath();
                ctx.fillStyle = valid ? ('rgba(255,214,100,' + (0.16 + 0.14 * pulse) + ')') : ('rgba(235,70,50,' + (0.18 + 0.16 * pulse) + ')');
                ctx.fill();
                ctx.strokeStyle = valid ? ('rgba(255,214,100,' + (0.65 + 0.35 * pulse) + ')') : ('rgba(240,85,60,' + (0.7 + 0.3 * pulse) + ')');
                ctx.lineWidth = 3;
                ctx.stroke();
            }
        }

        const cc = cellC(g.x + fw / 2, g.y + fh / 2, floorZ + 1.35);
        const topY = cc[1] - 26 + Math.sin(ft) * 4;
        ctx.fillStyle = valid ? 'rgba(240,200,90,0.95)' : 'rgba(230,80,60,0.95)';
        ctx.strokeStyle = 'rgba(20,12,6,0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cc[0] - 11, topY - 12); ctx.lineTo(cc[0] + 11, topY - 12); ctx.lineTo(cc[0], topY);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        if (g.label) {
            ctx.font = '15px Medieval, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle = 'rgba(20,12,6,0.85)';
            ctx.lineWidth = 3;
            ctx.strokeText(g.label, cc[0], topY - 24);
            ctx.fillStyle = '#f2e2b8';
            ctx.fillText(g.label, cc[0], topY - 24);
        }
    }

    // ── B. living-room ambience (every view) ──
    const placed = state.placed || [];
    // warm glow + embers at light sources
    placed.forEach((p, idx) => {
        if (!LIGHT_IDS.has(p.item)) return;
        const def = itemDef(p.item) || {};
        const z = fz(p.lvl || 0);
        const [cx, cy] = cellC(p.x + (def.fw || 1) / 2, p.y - (def.fh || 1) / 2, z);
        const flick = 0.10 + 0.05 * Math.sin(ft + idx * 1.3) + 0.02 * Math.sin(ft * 3.1 + idx);
        const grad = ctx.createRadialGradient(cx, cy - 30, 6, cx, cy - 30, 150);
        grad.addColorStop(0, `rgba(255,176,72,${0.85 * flick + 0.10})`);
        grad.addColorStop(0.4, `rgba(255,140,50,${0.45 * flick})`);
        grad.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(cx, cy - 30, 150, 0, Math.PI * 2); ctx.fill();
        // three embers per source, seeded rise
        for (let e = 0; e < 3; e++) {
            const seed = ((idx * 7 + e * 13) % 100) / 100;
            const t = (frame / FRAMES + seed) % 1;
            const ex = cx + Math.sin(t * Math.PI * 2 + seed * 9) * 14;
            const ey = cy - 40 - t * 78;
            ctx.fillStyle = `rgba(255,${160 + Math.round(60 * seed)},60,${(0.55 * (1 - t)).toFixed(3)})`;
            ctx.beginPath(); ctx.arc(ex, ey, 2.4, 0, Math.PI * 2); ctx.fill();
        }
    });
    // drifting dust motes
    for (let m = 0; m < 16; m++) {
        const seed = ((m * 37) % 100) / 100;
        const mx = (seed * 1.7 * ART_W + frame * 2.2 + m * 53) % ART_W;
        const my = 120 + ((seed * 5.3 * ART_H + m * 97) % (ART_H - 240)) + Math.sin(ft + m) * 6;
        ctx.fillStyle = `rgba(240,225,190,${(0.05 + 0.05 * (0.5 + 0.5 * Math.sin(ft * 2 + seed * 6))).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(mx, my, 1.8, 0, Math.PI * 2); ctx.fill();
    }

    // ── C. move/moveto pop feedback — slide trail + impact ring ──
    if (opts.pop) {
        const pop = opts.pop;
        const z = fz(pop.lvl || 0);
        const [dx, dy] = cellC(pop.x, pop.y, z);
        if (pop.from) {
            const [fx, fy] = cellC(pop.from.x, pop.from.y, z);
            for (let s = 0; s < 3; s++) {
                const t = 0.25 + s * 0.25;
                const alpha = 0.55 - s * 0.16 - (frame / FRAMES) * 0.3;
                if (alpha <= 0.03) continue;
                ctx.fillStyle = `rgba(255,214,100,${alpha.toFixed(3)})`;
                ctx.beginPath(); ctx.arc(fx + (dx - fx) * t, fy + (dy - fy) * t, 6 - s * 1.4, 0, Math.PI * 2); ctx.fill();
            }
        }
        if (frame < 5) {
            const t = frame / 5;
            ctx.strokeStyle = `rgba(255,214,100,${(0.75 * (1 - t)).toFixed(3)})`;
            ctx.lineWidth = 3.5;
            ctx.beginPath(); ctx.arc(dx, dy, 12 + t * 52, 0, Math.PI * 2); ctx.stroke();
        }
    }
    ctx.restore();
}

// ── HUD plate ──
function drawHud(ctx, state, theme, opts) {
    const H = 132, Wp = ART_W - 60;
    const x0 = 30, y0 = ART_H - H - 22;
    ctx.save();
    ctx.fillStyle = 'rgba(24,17,10,0.88)';
    roundRect(ctx, x0, y0, Wp, H, 14);
    ctx.fill();
    ctx.strokeStyle = '#a67c2e';
    ctx.lineWidth = 2.5;
    roundRect(ctx, x0 + 4, y0 + 4, Wp - 8, H - 8, 10);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(166,124,46,0.35)';
    ctx.lineWidth = 1;
    roundRect(ctx, x0 + 9, y0 + 9, Wp - 18, H - 18, 8);
    ctx.stroke();

    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e8d5a3';
    ctx.font = '26px "Cinzel Deco", Cinzel';
    ctx.textAlign = 'left';
    ctx.fillText(String(state.owner || 'Adventurer').slice(0, 22), x0 + 26, y0 + 38);
    ctx.font = '16px Medieval';
    ctx.fillStyle = '#9c8455';
    ctx.fillText(`Homestead of ${state.owner} — ${theme.name} style`, x0 + 26, y0 + 64);

    const comfort = (state.placed || []).reduce((s, p) => s + ((itemDef(p.item) || {}).comfort || 0), 0);
    ctx.textAlign = 'center';
    ctx.font = '20px Cinzel';
    ctx.fillStyle = '#e8d5a3';
    ctx.fillText(`${comfort}`, x0 + Wp - 210, y0 + 38);
    ctx.font = '14px Medieval';
    ctx.fillStyle = '#9c8455';
    ctx.fillText('COMFORT', x0 + Wp - 210, y0 + 62);

    ctx.font = '20px Cinzel';
    ctx.fillStyle = '#e8d5a3';
    ctx.fillText(`${(state.placed || []).filter(p => (itemDef(p.item) || {}).layer !== 'wall').length}`, x0 + Wp - 90, y0 + 38);
    ctx.font = '14px Medieval';
    ctx.fillStyle = '#9c8455';
    ctx.fillText('PIECES', x0 + Wp - 90, y0 + 62);

    ctx.textAlign = 'center';
    ctx.font = '15px Medieval';
    ctx.fillStyle = '#7a663f';
    ctx.fillText(opts.hint || '.home select <item>  •  .home move <dir>  •  .home catalog', x0 + Wp / 2, y0 + H - 26);
    ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC: room animation (WhatsApp GIF = mp4) with PNG fallback
// ═══════════════════════════════════════════════════════════════════════════
async function encodeFramesToMp4(frames) {
    const ffmpeg = require('fluent-ffmpeg');
    try { ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH || 'ffmpeg'); } catch (e) { /* engine sets it too */ }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'homestead-'));
    const out = path.join(tmp, 'room.mp4');
    try {
        // RAW PATH — BGRA memcpy frames skip the PNG round-trip
        if (frames.length && frames[0] && frames[0].raw) {
            const { w, h } = frames[0];
            const fbin = process.env.FFMPEG_PATH || 'ffmpeg';
            // stdin-stream the BGRA frames (renders and encode run in
            // parallel — v10d proved a 215MB frames.raw costs ~200s on the
            // box's slow disk in write+read alone) and encode at HALF
            // resolution (the mp4 plays thumbnail-sized; static PNGs stay
            // full-res). fluent-ffmpeg hung on this input entirely.
            const args = [
                '-f', 'rawvideo', '-pix_fmt', 'bgra', '-video_size', `${w}x${h}`,
                '-framerate', `${1000 / FRAME_MS}`, '-i', 'pipe:0',
                '-vf', `scale=${Math.round(w / 2)}:${Math.round(h / 2)}`,
                '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0',
                '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', String(process.env.RENDER_CRF || '25'),   // 47-k10: -20.7% bytes, zoom-verified identical
                '-movflags', '+faststart', '-an', '-y', out,
            ];
            await new Promise((resolve, reject) => {
                const p = require('child_process').spawn(fbin, args, { stdio: ['pipe', 'ignore', 'pipe'] });
                let err = '';
                p.stderr.on('data', (d) => { err += d; if (err.length > 6000) err = err.slice(-3000); });
                p.on('error', reject);
                p.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${err.slice(-500)}`)));
                (async () => {
                    for (const f of frames) {
                        if (!p.stdin.write(f.raw)) await new Promise((r) => p.stdin.once('drain', r));
                    }
                    p.stdin.end();
                })().catch((e) => { try { p.kill('SIGKILL'); } catch (e2) {} reject(e); });
            });
            return fs.readFileSync(out);
        }
        // PNG PATH — plain buffers (QA smoke bakes / 3-frame renders)
        frames.forEach((b, i) => {
            if (!Buffer.isBuffer(b)) throw new Error(`frame ${i} is ${(b && typeof b === 'object') ? 'a raw-frame object, not a Buffer' : typeof b} — mixed encoder paths`);
            fs.writeFileSync(path.join(tmp, `f${String(i).padStart(3, '0')}.png`), b);
        });
        await new Promise((resolve, reject) => {
            ffmpeg()
                .input(path.join(tmp, 'f%03d.png'))
                .inputOptions(['-framerate', `${1000 / FRAME_MS}`])
                .outputOptions([
                    '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0',
                    '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', String(process.env.RENDER_CRF || '25'),   // 47-k10: -20.7% bytes, zoom-verified identical
                    '-movflags', '+faststart', '-an', '-y',
                ])
                .output(out)
                .on('end', resolve)
                .on('error', reject)
                .run();
        });
        const buf = fs.readFileSync(out);
        return buf;
    } finally {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
    }
}

// state-hash render cache — same room state never re-renders
const _renderCache = new Map(); // key → { buffer, contentType, ts }
const CACHE_TTL = 10 * 60 * 1000;

// OUT ENCODER (Task 36/37) — cards ship downscaled JPEG instead of full-res
// PNG; room cards are 1800x1800 at SS=2, JPEG q0.88 ≈ 250-400KB.
const OUT_MAX_W = Math.max(640, parseInt(process.env.RENDER_OUT_MAX_W || '2560', 10) || 2560);
const OUT_JPEG_Q = Math.min(0.95, Math.max(0.5, parseFloat(process.env.RENDER_OUT_JPEG_Q || '0.88') || 0.88));
function encodeOut(canvas) {
    let c = canvas;
    if (canvas.width > OUT_MAX_W) {
        const h = Math.round(canvas.height * OUT_MAX_W / canvas.width);
        c = require('canvas').createCanvas(OUT_MAX_W, h);
        c.getContext('2d').drawImage(canvas, 0, 0, OUT_MAX_W, h);
    }
    return { buffer: c.toBuffer('image/jpeg', OUT_JPEG_Q), contentType: 'image/jpeg' };
}

// HOT CACHE BYTE CAP (Task 36) — bytes, not entries.
const RENDER_CACHE_MAX_BYTES = 64 * 1048576;
function cachePut(map, key, out) {
    let total = (out && out.buffer && out.buffer.length) || 0;
    for (const v of map.values()) total += (v && v.buffer && v.buffer.length) || 0;
    while (total > RENDER_CACHE_MAX_BYTES && map.size) {
        const oldestKey = map.keys().next().value;
        const v = map.get(oldestKey);
        total -= (v && v.buffer && v.buffer.length) || 0;
        map.delete(oldestKey);
    }
    map.set(key, { ...out, ts: Date.now() });
}
function stateHash(state, opts = {}) {
    return hashStr(JSON.stringify([state.owner, state.theme, state.placed, state.annex || null, state.upper || 0, state.upperWalls || 0, state.style || '', opts.pop || null, opts.hint || '', opts.grid || null, opts.hl || null, opts.static ? 1 : 0]));
}

// EVENT-LOOP BREATH — real timers between frames keep the canary heartbeat
// alive during an animated bake (microtask yields don't feed timers).
const FRAME_BREATH_MS = 8;
const breath = () => new Promise((r) => setTimeout(r, FRAME_BREATH_MS));

// Media matrix (owner 2026-10-16 10:09Z "bring gifs back and make the
// generation faster" — restores the agreed law, supersedes the 10-15 static
// matrix): the ROOM VIEW is an ANIMATED GIF again (hearth/cauldron/torches
// idle); select + placement-mode grids stay STATIC 1-frame cards for snappy
// placement feedback; v2 locomotion (owner 2026-10-16 "moving doesn't
// trigger an animation"): move/rotate now pass pop → ANIMATED render with
// the grid overlay drawn (slide/turn plays under the labelled grid).
// Speed: the bake is disk-cached per stateHash (mediaCache.js) — first view
// renders, every repeat is an instant disk read even across restarts.
// 3D interior (pure-Node rasteriser over the house-builder GLB pack). Default ON;
// HOMESTEAD_3D=0 or any render error falls back to the legacy 2D sprite room.
async function render3dBase(state, opts) {
    const interior = require('./interior3d');
    return interior.renderInterior(state, { grid: opts.grid, hl: opts.hl, ss: 2 });
}

// compose one ART-space frame: the 3D raster + projected overlay + HUD plate
function compose3dFrame(room, state, frame, opts) {
    const { createCanvas } = require('canvas');
    const k = ART_W / room.width;
    const h = ART_W * room.height / room.width;
    const c = createCanvas(ART_W, ART_H), ctx = c.getContext('2d');
    ctx.fillStyle = '#18141c'; ctx.fillRect(0, 0, ART_W, ART_H);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(room, 0, 78, ART_W, h);
    draw3dOverlay(ctx, room, k, 78, state, frame, opts);
    drawHud(ctx, state, THEMES[state.theme] || THEMES.oakhaven, opts);
    return c;
}

async function render3dCard(state, opts) {
    ensureFonts();
    return compose3dFrame(await render3dBase(state, opts), state, 0, opts);
}

async function renderRoomImage(state, opts = {}) {
    // 3D GLB room rendering is canonical. HOMESTEAD_3D=0 used to silently
    // route deployments back to legacy sprites, hiding whether models worked.
    // The 2D renderer is now explicit emergency recovery only.
    const legacyFallback = process.env.HOMESTEAD_3D_LEGACY_FALLBACK === '1';
    const key = stateHash(state, { ...opts, v3d: legacyFallback ? 0 : 1 });
    if (!legacyFallback) {
        const hit3 = _renderCache.get(key);
        if (hit3 && (Date.now() - hit3.ts) < CACHE_TTL) return hit3;
        try {
            const out3 = await mediaCache.cached('room', 'v3d' + require('./interior3d').VERSION + '-' + key, async () => {
                // STATIC law (owner 2026-10-24 21:29Z "make the .j base 1
                // basically your regular house view a png"): the plain
                // house-entry view skips the 14-frame mp4 bake — ONE interior
                // raster + frame 0 as a full-res PNG. stateHash already folds
                // opts.static in, so this caches separately from the animated
                // bake and never evicts it.
                if (opts.static) {
                    const roomS = await render3dBase(state, opts);
                    return { buffer: compose3dFrame(roomS, state, 0, opts).toBuffer('image/png'), contentType: 'image/png' };
                }
                // ONE interior raster per bake (GLB models + rasteriser stay
                // untouched) — the loop is that raster + cheap projected
                // overlays streamed through the SAME ffmpeg mp4 "GIF" pipe the
                // 2D room uses (owner 2026-10-24: "add the moving gif we used
                // to have for the old furniture system for this, the grid too
                // — similar except better"). Select previews animate again,
                // hearths/lanterns flicker, embers rise, moves leave a trail.
                const room = await render3dBase(state, opts);
                const frameAt = async (f) => {
                    const c = compose3dFrame(room, state, f, opts);
                    return { raw: c.toBuffer('raw'), w: c.width, h: c.height };
                };
                const fbin = process.env.FFMPEG_PATH || 'ffmpeg';
                const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'homestead3d-'));
                const outFile = path.join(tmp, 'room3d.mp4');
                try {
                    const f0 = await frameAt(0);
                    await breath();
                    const args = [
                        '-f', 'rawvideo', '-pix_fmt', 'bgra', '-video_size', `${f0.w}x${f0.h}`,
                        '-framerate', `${1000 / FRAME_MS}`, '-i', 'pipe:0',
                        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
                        '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0',
                        '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', String(process.env.RENDER_CRF || '25'),
                        '-movflags', '+faststart', '-an', '-y', outFile,
                    ];
                    await new Promise((resolve, reject) => {
                        const p = require('child_process').spawn(fbin, args, { stdio: ['pipe', 'ignore', 'pipe'] });
                        let err = '';
                        p.stderr.on('data', (d) => { err += d; if (err.length > 6000) err = err.slice(-3000); });
                        p.on('error', reject);
                        p.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${err.slice(-500)}`)));
                        (async () => {
                            const feed = async (raw) => { if (!p.stdin.write(raw)) await new Promise((r) => p.stdin.once('drain', r)); };
                            await feed(f0.raw);
                            for (let f = 1; f < FRAMES; f++) {
                                const fr = await frameAt(f);
                                await feed(fr.raw);
                                await breath();
                            }
                            p.stdin.end();
                        })().catch((e) => { try { p.stdin.destroy(); } catch (e2) {} try { p.kill('SIGKILL'); } catch (e3) {} reject(e); });
                    });
                    const mp4 = fs.readFileSync(outFile);
                    if (mp4 && mp4.length > 1000) return { buffer: mp4, contentType: 'video/mp4' };
                } finally {
                    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e2) {}
                }
                console.warn('[homesteadRenderer] 3D mp4 encode failed — static 3D card fallback');
                return encodeOut(compose3dFrame(room, state, 0, opts));
            }, null, { label: 'bake:room3d', timeoutMs: 90000 });
            cachePut(_renderCache, key, out3);
            return out3;
        } catch (e) {
            console.error('[homestead] 3D render failed; refusing silent legacy 2D output:', e.message);
            // Surface deployment/model errors instead of disguising them as a successful sprite render.
            throw e;
        }
    }
    const hit = _renderCache.get(key);
    if (hit && (Date.now() - hit.ts) < CACHE_TTL) return hit;
    const out = await mediaCache.cached('room', key, async () => {
        // static card: render once, JPEG (no full-res PNG encode)
        if (opts.static) return encodeOut(await renderFrame(state, 0, { ...opts, returnCanvas: true }));
        // STREAMING BAKE (Task 37): feed ffmpeg's stdin AS frames render at
        // ss=1 (the old loop held all 14 SS=2 raw frames ~180MB before the
        // encode started). Frame pixels land exactly on the mp4 target.
        try {
            const fbin = process.env.FFMPEG_PATH || 'ffmpeg';
            const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'homestead-'));
            const outFile = path.join(tmp, 'room.mp4');
            try {
                const f0 = await renderFrame(state, 0, { ...opts, encoder: 'raw', ss: 1 });
                await breath();
                const { w, h } = f0;
                const args = [
                    '-f', 'rawvideo', '-pix_fmt', 'bgra', '-video_size', `${w}x${h}`,
                    '-framerate', `${1000 / FRAME_MS}`, '-i', 'pipe:0',
                    // even-dim guard (no-op on even input) — replaces the old
                    // half-res scale: ss=1 frames ARE the mp4 target size now
                    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
                    '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0',
                    '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', String(process.env.RENDER_CRF || '25'),   // 47-k10: -20.7% bytes, zoom-verified identical
                    '-movflags', '+faststart', '-an', '-y', outFile,
                ];
                await new Promise((resolve, reject) => {
                    const p = require('child_process').spawn(fbin, args, { stdio: ['pipe', 'ignore', 'pipe'] });
                    let err = '';
                    p.stderr.on('data', (d) => { err += d; if (err.length > 6000) err = err.slice(-3000); });
                    p.on('error', reject);
                    p.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${err.slice(-500)}`)));
                    (async () => {
                        const feed = async (raw) => { if (!p.stdin.write(raw)) await new Promise((r) => p.stdin.once('drain', r)); };
                        await feed(f0.raw);
                        for (let f = 1; f < FRAMES; f++) {
                            const fr = await renderFrame(state, f, { ...opts, encoder: 'raw', ss: 1 });
                            await feed(fr.raw);
                            await breath();
                        }
                        p.stdin.end();
                    })().catch((e) => { try { p.stdin.destroy(); } catch (e2) {} try { p.kill('SIGKILL'); } catch (e3) {} reject(e); });
                });
                const mp4 = fs.readFileSync(outFile);
                if (mp4 && mp4.length > 1000) return { buffer: mp4, contentType: 'video/mp4' };
            } finally {
                try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e2) {}
            }
        } catch (e) {
            console.error('[homesteadRenderer] mp4 encode failed, JPEG fallback:', e.message);
        }
        return encodeOut(await renderFrame(state, 0, { ...opts, returnCanvas: true }));  // fallback card
    }, null, { label: 'bake:room', timeoutMs: 90000 });   // 47-k9: serialize through renderQueue — concurrent .j bakes pm2-killed the box (2026-10-20 03:11Z); no journal (room replays come from .j base house views)
    cachePut(_renderCache, key, out);
    return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC: catalog cards
// ═══════════════════════════════════════════════════════════════════════════
// catalogue ordered by what your house unlocks, then price (stable ids → stable pages)
function catalogSorted() {
    const rooms = require('./homesteadRooms');
    return catalog().items.slice().sort((a, b) => (rooms.itemMinHouse(a) - rooms.itemMinHouse(b)) || (a.price - b.price) || a.id.localeCompare(b.id));
}

// ── 3D item thumbs (owner 2026-10-24 21:00Z: "the items in the shop, the
// images are still the old 2d ones not the new 3d ones") — every outfitter /
// inventory icon is the piece's own GLB through the SAME interior3d rasteriser,
// disk-cached per item via mediaCache (survives restarts AND deploys). Any
// failure falls back to the legacy 2D sprite, so the shop can never blank.
async function itemThumb3d(id) {
    try {
        const out = await mediaCache.cached('itemthumb', 'i3' + require('./interior3d').VERSION + '-' + id, async () => {
            const buf = await require('./interior3d').renderItemThumb(id);
            if (!buf || buf.length < 800) throw new Error('thumb render failed');
            return { buffer: buf, contentType: 'image/png' };
        }, null, { label: 'thumb:' + id, timeoutMs: 45000 });
        return out && out.buffer ? out.buffer : null;
    } catch (e) { console.warn('[homesteadRenderer] 3D thumb failed for', id, e.message); return null; }
}

function renderArchitectCard(ctx, canvas, o) {
    const { W, H, rooms, houseLv } = o;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8d5a3'; ctx.font = '30px Cinzel';
    ctx.fillText('ARCHITECT — rooms & floors', W / 2, 262);
    const B = Object.values(rooms.BUILD);
    const cw = 470, ch = 330, gx = 60, gy = 310, gap = 40;
    B.forEach((b, i) => {
        const x = gx + (i % 2) * (cw + gap), y = gy + Math.floor(i / 2) * (ch + 30);
        const locked = houseLv < b.minHouse;
        ctx.fillStyle = 'rgba(32,24,14,0.92)'; roundRect(ctx, x, y, cw, ch, 14); ctx.fill();
        ctx.strokeStyle = locked ? '#7a3a2e' : '#a67c2e'; ctx.lineWidth = 2.5; roundRect(ctx, x, y, cw, ch, 14); ctx.stroke();
        // plan glyph
        ctx.save(); ctx.translate(x + 120, y + 150);
        ctx.strokeStyle = '#c9a85a'; ctx.fillStyle = 'rgba(201,168,90,0.14)'; ctx.lineWidth = 3;
        ctx.fillRect(-50, -40, 100, 80); ctx.strokeRect(-50, -40, 100, 80);
        if (b.id === 'annex_walled') { ctx.fillStyle = 'rgba(120,200,150,0.2)'; ctx.fillRect(50, -40, 60, 80); ctx.strokeRect(50, -40, 60, 80); ctx.clearRect(47, -12, 7, 24); }
        if (b.id === 'annex_open') { ctx.fillStyle = 'rgba(120,200,150,0.2)'; ctx.fillRect(50, -40, 60, 80); ctx.setLineDash([6, 5]); ctx.strokeRect(50, -40, 60, 80); ctx.setLineDash([]); }
        if (b.id === 'loft' || b.id === 'loft_walls') { ctx.fillStyle = 'rgba(120,170,230,0.25)'; ctx.fillRect(-50, -40, 50, 40); ctx.strokeRect(-50, -40, 50, 40); for (let k = 0; k < 4; k++) ctx.strokeRect(0 + k * 12, 0, 12, 40 - k * 10); }
        if (b.id === 'loft_walls') { ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-50, 40); ctx.lineTo(-50, -40); ctx.lineTo(50, -40); ctx.stroke(); }
        ctx.restore();
        ctx.textAlign = 'left';
        ctx.fillStyle = '#e8d5a3'; ctx.font = '26px Cinzel'; ctx.fillText(b.name, x + 250, y + 62);
        ctx.fillStyle = '#f0c05a'; ctx.font = '24px Cinzel'; ctx.fillText(`◆ ${b.price.toLocaleString()}`, x + 250, y + 100);
        ctx.fillStyle = locked ? '#e07060' : '#7ec8a0'; ctx.font = '17px Medieval';
        ctx.fillText(locked ? `🔒 needs ${rooms.HOUSE_NAMES[b.minHouse]} (house ${b.minHouse})` : `✔ open at house ${b.minHouse}`, x + 250, y + 132);
        ctx.fillStyle = '#b8a070'; ctx.font = '15px Medieval';
        const words = b.desc.split(' '); let line = '', yy = 172;
        for (const w of words) { if (ctx.measureText(line + w).width > cw - 40) { ctx.fillText(line, x + 24, y + 250 - 20 + (yy - 172)); line = ''; yy += 22; } line += w + ' '; }
        ctx.fillText(line, x + 24, y + 250 - 20 + (yy - 172));
        ctx.fillStyle = '#7a663f'; ctx.fillText(b.id === 'loft' ? '.home rooms loft' : b.id === 'loft_walls' ? '.home rooms loftwalls' : `.home rooms annex <side> ${b.id === 'annex_open' ? 'open' : 'walled'}`, x + 24, y + ch - 24);
        ctx.textAlign = 'center';
    });
    ctx.fillStyle = '#9c8455'; ctx.font = '20px Medieval';
    ctx.fillText('Stack rooms on ANY side • Remade house styles: .home styles (locked)', W / 2, H - 46);
    return canvas.toBuffer('image/png');
}

async function renderCatalogPage(page, pages, opts = {}) {
    ensureFonts();
    const W = 1080, H = 1350;
    const canvas = require('canvas').createCanvas(W * SS, H * SS);
    const ctx = canvas.getContext('2d');
    ctx.scale(SS, SS);
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = '#161009';
    ctx.fillRect(0, 0, W, H);
    const bg = ctx.createRadialGradient(W / 2, 300, 100, W / 2, 675, 900);
    bg.addColorStop(0, '#2a1e10');
    bg.addColorStop(1, '#120c06');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e8d5a3';
    ctx.font = '44px "Cinzel Deco", Cinzel';
    ctx.fillText('HOMESTEAD OUTFITTER', W / 2, 84);
    ctx.font = '22px Medieval';
    ctx.fillStyle = '#9c8455';
    // search mode shows what was searched; plain mode shows the page counter
    ctx.fillText(opts.searchTerm ? `— search: "${String(opts.searchTerm).slice(0, 28)}" —` : `— page ${page + 1} of ${pages} —`, W / 2, 128);
    ctx.strokeStyle = '#a67c2e';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(120, 158); ctx.lineTo(W - 120, 158); ctx.stroke();
    ctx.strokeStyle = 'rgba(166,124,46,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(150, 164); ctx.lineTo(W - 150, 164); ctx.stroke();

    if (opts.balance != null) {
        ctx.font = '22px Cinzel';
        ctx.fillStyle = '#f0c05a';
        ctx.fillText(`${Number(opts.balance).toLocaleString()} ZENI`, W / 2, 196);
    }

    const items = opts.items || catalogSorted();
    const COLS = 4, ROWS = 3, PER = COLS * ROWS;
    const rooms = require('./homesteadRooms');
    const houseLv = opts.houseLv || 1;
    if (!opts.items && page >= Math.ceil(items.length / PER)) return renderArchitectCard(ctx, canvas, { W, H, page, pages, houseLv, rooms, balance: opts.balance });
    const gx0 = 60, gy0 = 236, cw = 234, ch = 320, gapx = 16, gapy = 20;
    for (let i = 0; i < PER; i++) {
        const it = items[page * PER + i];
        if (!it) break;
        const x = gx0 + (i % COLS) * (cw + gapx);
        const y = gy0 + Math.floor(i / COLS) * (ch + gapy);
        const R = RARITY[it.rarity] || RARITY.common;
        const need = rooms.itemMinHouse(it), locked = houseLv < need;

        ctx.fillStyle = 'rgba(32,24,14,0.92)';
        roundRect(ctx, x, y, cw, ch, 12);
        ctx.fill();
        ctx.strokeStyle = R.col;
        ctx.lineWidth = it.rarity === 'common' ? 1.5 : 2.5;
        roundRect(ctx, x, y, cw, ch, 12);
        ctx.stroke();
        if (it.rarity === 'epic' || it.rarity === 'legendary') {
            ctx.save();
            ctx.shadowColor = R.glow;
            ctx.shadowBlur = 18;
            roundRect(ctx, x, y, cw, ch, 12);
            ctx.stroke();
            ctx.restore();
        }

        const dcx = x + cw / 2, dcy = y + 176;
        // 3D representation first (GLB through the interior3d rasteriser);
        // the legacy 2D sprite + wood sliver remain as the fallback
        const thumb = await itemThumb3d(it.id);
        if (thumb) {
            const im = await require('canvas').loadImage(thumb);
            const s = Math.min((cw - 24) / im.width, 180 / im.height);
            ctx.save();
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(im, dcx - (im.width * s) / 2, dcy - im.height * s + 10, im.width * s, im.height * s);
            ctx.restore();
        } else {
            const fl = await img('floor_wood.png');
            if (fl) {
                ctx.save();
                ctx.globalAlpha = 0.85;
                ctx.drawImage(fl, dcx - 32, dcy - 16);
                ctx.restore();
            }

            const spr = await img(`${it.id}.png`);
            if (spr) {
                const w = spr.width * 2, h = spr.height * 2;
                const maxH = 180, maxW = cw - 30;
                let s = 2;
                if (h > maxH) s = maxH / spr.height;
                if (w * (s / 2) > maxW) s = Math.min(s, (maxW / spr.width));
                const dw = spr.width * s, dh = spr.height * s;
                ctx.drawImage(spr, dcx - dw / 2, dcy - dh + 6, dw, dh);
            }
        }

        ctx.font = '22px Medieval';
        ctx.fillStyle = '#e8d5a3';
        let nm = it.name;
        while (ctx.measureText(nm).width > cw - 18 && nm.length > 4) nm = nm.slice(0, -2);
        if (nm !== it.name) nm += '…';
        ctx.fillText(nm, x + cw / 2, y + 228);

        ctx.font = '15px Medieval';
        ctx.fillStyle = R.col;
        ctx.fillText(it.rarity.toUpperCase(), x + cw / 2, y + 253);

        ctx.font = '26px Cinzel';
        ctx.fillStyle = '#f0c05a';
        ctx.fillText(`◆ ${it.price.toLocaleString()}`, x + cw / 2, y + 288);

        if (it.comfort > 0) {
            ctx.font = '16px Medieval';
            ctx.fillStyle = '#7ec8a0';
            ctx.fillText('♥'.repeat(Math.min(it.comfort, 8)), x + cw / 2, y + 310);
        }
        // house-level tag (top-left chip) + lock veil
        ctx.save();
        ctx.fillStyle = locked ? 'rgba(150,40,30,0.92)' : 'rgba(40,70,48,0.9)';
        roundRect(ctx, x + 8, y + 8, 78, 25, 8); ctx.fill();
        ctx.font = '15px Medieval'; ctx.fillStyle = '#f4e8c8'; ctx.textAlign = 'center';
        ctx.fillText(`${locked ? '🔒 ' : ''}House ${need}`, x + 47, y + 21);
        if (locked) {
            ctx.fillStyle = 'rgba(10,6,3,0.55)';
            roundRect(ctx, x, y, cw, ch, 12); ctx.fill();
            ctx.font = '22px Cinzel'; ctx.fillStyle = '#e07060';
            ctx.fillText(`Needs ${rooms.HOUSE_NAMES[need]}`, x + cw / 2, y + 150);
        }
        ctx.restore();
        // buy-by-number chip (top-right, above any lock veil — still readable):
        // the caption lists the same numbers, `.home buy <n>` buys off this page
        ctx.save();
        ctx.fillStyle = 'rgba(201,168,90,0.16)';
        roundRect(ctx, x + cw - 44, y + 8, 36, 25, 8); ctx.fill();
        ctx.strokeStyle = 'rgba(201,168,90,0.55)'; ctx.lineWidth = 1.5;
        roundRect(ctx, x + cw - 44, y + 8, 36, 25, 8); ctx.stroke();
        ctx.font = 'bold 17px Cinzel'; ctx.fillStyle = '#f0c05a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), x + cw - 26, y + 21);
        ctx.restore();
    }

    ctx.font = '22px Medieval';
    ctx.fillStyle = '#9c8455';
    ctx.fillText(opts.searchTerm ? '.home buy <name>   •   .home catalog — full stock' : '.home buy <name>   •   .home catalog search <name>   •   .home rooms', W / 2, H - 46);
    ctx.strokeStyle = 'rgba(166,124,46,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(120, H - 78); ctx.lineTo(W - 120, H - 78); ctx.stroke();

    return canvas.toBuffer('image/png');
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC: owned-furniture names card ("rpg_base_building_redesign.md" §5 —
// ".j home select shows an image card listing the NAMES of all furniture
//  items available to them" + §5 inventory: placed vs storage at a glance)
// ═══════════════════════════════════════════════════════════════════════════
const STAR = { common: '⚪', uncommon: '🟢', rare: '🔵', epic: '🟣', legendary: '🟠' };
const ROWS_PER_PAGE = 12;   // owner 2026-10-24 21:19Z "the names and the listed items are wayyyy too small" — fewer, taller rows

// Shared row model — ONE numbering law for the card AND the command layer:
// rows are 1-based across pages, placed pieces first (room order), then storage.
// `.home select 7` / `.home remove 2-5` use these exact numbers.
function inventoryRows(rec) {
    const roomsR = require('./homesteadRooms');
    const placedRows = (rec.placed || []).map((p) => {
        const d = itemDef(p.item) || {};
        // space-aware status (owner 21:34Z): the card + caption tell you WHERE
        // each piece lives — loft, an annex side, or the main hall
        let status;
        if (d.layer === 'wall') status = `wall ${p.x}`;
        else if (p.lvl) status = `↑loft (${p.x},${p.y})`;
        else {
            const reg = roomsR.regionAt(rec, p.x, p.y);
            const tag = reg && reg !== 'main' ? `${reg.toUpperCase()}-annex ` : '';
            status = `${tag}(${p.x},${p.y})`;
        }
        return { d, status, placed: true, uid: p.uid };
    });
    const storedRows = (rec.owned || []).map((o) => ({ d: itemDef(o.id) || {}, status: 'storage', placed: false, uid: o.uid }));
    const rows = [...placedRows, ...storedRows];
    rows.forEach((r, i) => { r.n = i + 1; });
    return rows;
}

async function renderInventoryCard(rec, opts = {}) {
    ensureFonts();
    const rows = inventoryRows(rec);
    const placedRows = rows.filter((r) => r.placed);
    const storedRows = rows.filter((r) => !r.placed);
    const pages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
    let page = parseInt(opts.page, 10);
    if (!Number.isFinite(page) || page < 1) page = 1;
    if (page > pages) page = pages;

    const W = 1080, H = 1350;
    const canvas = require('canvas').createCanvas(W * SS, H * SS);
    const ctx = canvas.getContext('2d');
    ctx.scale(SS, SS);
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = '#161009';
    ctx.fillRect(0, 0, W, H);
    const bg = ctx.createRadialGradient(W / 2, 300, 100, W / 2, 675, 900);
    bg.addColorStop(0, '#2a1e10');
    bg.addColorStop(1, '#120c06');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e8d5a3';
    ctx.font = '44px "Cinzel Deco", Cinzel';
    ctx.fillText('YOUR FURNITURE', W / 2, 84);
    ctx.font = '20px Medieval';
    ctx.fillStyle = '#9c8455';
    ctx.fillText(pages > 1 ? `— page ${page} of ${pages} —` : '— every piece you own —', W / 2, 128);
    ctx.strokeStyle = '#a67c2e';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(120, 158); ctx.lineTo(W - 120, 158); ctx.stroke();

    const comfort = (rec.placed || []).reduce((s, p) => s + ((itemDef(p.item) || {}).comfort || 0), 0);
    ctx.font = '24px Cinzel';
    ctx.fillStyle = '#7ec8a0';
    fillTextMixed(ctx, `♥ ${comfort} comfort   •   📍 ${placedRows.length} placed   •   📦 ${storedRows.length} storage`, W / 2, 196);

    const slice = rows.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);
    const y0 = 240, rh = 80;
    let lastPlaced = null;
    for (let i = 0; i < slice.length; i++) {
        const row = slice[i];
        const y = y0 + i * rh;
        const R = RARITY[row.d.rarity] || RARITY.common;
        // section divider
        if (row.placed !== lastPlaced) {
            lastPlaced = row.placed;
            ctx.font = '20px Medieval';
            ctx.fillStyle = '#c9a25e';
            ctx.textAlign = 'center';
            fillTextMixed(ctx, row.placed ? '— 📍 PLACED IN YOUR ROOM —' : '— 📦 IN STORAGE —', W / 2, y + 8);
        }
        const rowY = y + 46;
        // row plate (taller)
        ctx.fillStyle = 'rgba(32,24,14,0.72)';
        roundRect(ctx, 60, rowY - 27, W - 120, 58, 10);
        ctx.fill();
        ctx.strokeStyle = 'rgba(166,124,46,0.35)';
        ctx.lineWidth = 1;
        roundRect(ctx, 60, rowY - 27, W - 120, 58, 10);
        ctx.stroke();
        // pick number — the SAME number `.home select <n>` / `.home remove <n>` takes
        ctx.save();
        ctx.fillStyle = 'rgba(201,168,90,0.16)';
        roundRect(ctx, 74, rowY - 18, 40, 40, 9); ctx.fill();
        ctx.strokeStyle = 'rgba(201,168,90,0.55)'; ctx.lineWidth = 1.5;
        roundRect(ctx, 74, rowY - 18, 40, 40, 9); ctx.stroke();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = 'bold 25px Cinzel';
        ctx.fillStyle = '#f0c05a';
        ctx.fillText(String(row.n), 94, rowY + 2);
        ctx.restore();
        // 3D thumbnail (GLB through the interior3d rasteriser) — 2D sprite fallback
        const thumb = row.d.id ? await itemThumb3d(row.d.id) : null;
        if (thumb) {
            const im = await require('canvas').loadImage(thumb);
            const s = Math.min(48 / im.height, 76 / im.width);
            ctx.save();
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(im, 148 - (im.width * s) / 2, rowY - (im.height * s) / 2, im.width * s, im.height * s);
            ctx.restore();
        } else {
            const spr = row.d.id ? await img(`${row.d.id}.png`) : null;
            if (spr) {
                const maxH = 46, maxW = 72;
                let s = Math.min(maxH / spr.height, maxW / spr.width, 2);
                ctx.drawImage(spr, 148 - (spr.width * s) / 2, rowY - (spr.height * s) / 2, spr.width * s, spr.height * s);
            }
        }
        // name + star (bigger — owner 21:19Z "wayyyy too small")
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = '28px Medieval';
        ctx.fillStyle = R.col;
        let nm = `${STAR[row.d.rarity] || '⚪'} ${row.d.name || row.d.id}`;
        const maxNm = W - 120 - 200 - 170 - 90;
        while (ctx.measureText(nm).width > maxNm && nm.length > 4) nm = nm.slice(0, -2);
        if (nm !== `${STAR[row.d.rarity] || '⚪'} ${row.d.name || row.d.id}`) nm += '…';
        ctx.fillText(nm, 196, rowY);
        // comfort chips
        if (row.d.comfort > 0) {
            ctx.font = '17px Medieval';
            ctx.fillStyle = '#7ec8a0';
            ctx.fillText('♥'.repeat(Math.min(row.d.comfort, 5)), 196 + ctx.measureText(nm).width + 18, rowY + 1);
        }
        // status (right-aligned)
        ctx.textAlign = 'right';
        ctx.font = '24px Medieval';
        ctx.fillStyle = row.placed ? '#e8d5a3' : '#9c8455';
        ctx.fillText(row.placed ? `📍 ${row.status}` : '📦 storage', W - 84, rowY);
    }
    if (!slice.length) {
        ctx.font = '26px Medieval';
        ctx.fillStyle = '#9c8455';
        ctx.textAlign = 'center';
        ctx.fillText('An empty homestead — visit the outfitter!', W / 2, 400);
    }

    ctx.textAlign = 'center';
    ctx.font = '22px Medieval';
    ctx.fillStyle = '#9c8455';
    ctx.fillText(`${opts.prefix || '.'}home select <number|name>   •   ${opts.prefix || '.'}home remove <numbers>   •   ${opts.prefix || '.'}home place <name> [x y]`, W / 2, H - 46);
    ctx.strokeStyle = 'rgba(166,124,46,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(120, H - 78); ctx.lineTo(W - 120, H - 78); ctx.stroke();

    return canvas.toBuffer('image/png');
}

module.exports = {
    THEMES,
    RARITY,
    N,
    FRAMES,
    renderFrame,
    renderRoomImage,
    renderCatalogPage,
    renderInventoryCard,
    inventoryRows,
    INV_ROWS_PER_PAGE: ROWS_PER_PAGE,
    encodeFramesToMp4,
    itemDef,
    catalog,
};
