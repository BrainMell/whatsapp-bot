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

// ── world constants ──
const SS = 2;               // supersample (device px per art px)
const TW = 64, TH = 32;     // floor tile size (2:1)
const N = 12;               // room tiles per side
const WALL_H = 126;         // wall height (art px)
const ART_W = 900, ART_H = 900;
const OX = ART_W / 2;
const OY = 64 + WALL_H;     // top corner of the floor diamond

const FRAMES = 14, FRAME_MS = 100;

// ── themes: floor tiles + procedural wall brick palette ──
const THEMES = {
    oakhaven:    { name: 'Oakhaven',    floor: ['floor_wood', 'floor_wood2'], wall: ['#8a5a33', '#7a4d2a', '#9a6a3e', '#5e3a1f'], mortar: '#4a2d17', price: 0 },
    stonehearth: { name: 'Stonehearth', floor: ['floor_stone'],               wall: ['#7d8287', '#6e7378', '#8d9297', '#565a5e'], mortar: '#474b4f', price: 5000 },
    sunspire:    { name: 'Sunspire',    floor: ['floor_sand'],                wall: ['#c2a061', '#b3915a', '#d0b070', '#96793f'], mortar: '#7a6232', price: 9000 },
    tidecourt:   { name: 'Tidecourt',   floor: ['floor_pale'],                wall: ['#3e7f8c', '#356f7b', '#4a909d', '#285660'], mortar: '#1f434b', price: 14000 },
    arcaneum:    { name: 'Arcaneum',    floor: ['floor_slate'],               wall: ['#7c3f74', '#6d3566', '#8d4a85', '#532548'], mortar: '#3d1a35', price: 20000 },
    blackvault:  { name: 'Blackvault',  floor: ['floor_grass'],               wall: ['#4a4d52', '#3f4247', '#5a5e64', '#303236'], mortar: '#232527', price: 26000 },
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

// ═══════════════════════════════════════════════════════════════════════════
// WALLS — procedural brick quads following the iso floor edge
// ═══════════════════════════════════════════════════════════════════════════
function drawWallRun(ctx, x0, y0, x1, y1, theme, seedBase, frame) {
    const segs = N;
    const dx = (x1 - x0) / segs, dy = (y1 - y0) / segs;
    const rng = mulberry32(seedBase);
    const BH = 14;
    const rows = Math.ceil(WALL_H / BH);
    const lightSide = x1 > x0 ? 1.06 : 0.86;   // right wall catches more light

    // backing fill
    for (let s = 0; s < segs; s++) {
        const bx0 = x0 + dx * s, by0 = y0 + dy * s;
        const bx1 = x0 + dx * (s + 1), by1 = y0 + dy * (s + 1);
        ctx.beginPath();
        ctx.moveTo(bx0, by0); ctx.lineTo(bx1, by1);
        ctx.lineTo(bx1, by1 - WALL_H); ctx.lineTo(bx0, by0 - WALL_H);
        ctx.closePath();
        ctx.fillStyle = shade(theme.wall[3], lightSide);
        ctx.fill();
    }
    // bricks
    for (let r = 0; r < rows; r++) {
        const h0 = r * BH, h1 = Math.min(WALL_H, (r + 1) * BH);
        const mortar = 2;
        const offset = (r % 2) * 0.5;
        const perSeg = 2;
        for (let s = 0; s < segs; s++) {
            for (let b = 0; b < perSeg; b++) {
                const u0 = (b + offset) / perSeg;
                const u1 = (b + 1 + offset) / perSeg;
                if (u1 <= 0 || u0 >= 1) continue;
                const ax = x0 + dx * (s + Math.max(0, u0)), ay = y0 + dy * (s + Math.max(0, u0));
                const bx = x0 + dx * (s + Math.min(1, u1)), by = y0 + dy * (s + Math.min(1, u1));
                const jitter = rng();
                const tone = theme.wall[(r + s + b) % 3];
                const f = lightSide * (0.92 + jitter * 0.16) * (1 - (h0 / WALL_H) * 0.18);
                ctx.beginPath();
                ctx.moveTo(ax, ay - h0 - mortar / 2);
                ctx.lineTo(bx, by - h0 - mortar / 2);
                ctx.lineTo(bx, by - h1 + mortar / 2);
                ctx.lineTo(ax, ay - h1 + mortar / 2);
                ctx.closePath();
                ctx.fillStyle = shade(tone, f);
                ctx.fill();
            }
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
    const canvas = require('canvas').createCanvas(ART_W * SS, ART_H * SS);
    const ctx = canvas.getContext('2d');
    ctx.scale(SS, SS);
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

    // ═══ SHADOWS — rebuilt from scratch (owner: "scrap it and redo") ═══
    // isoShadow.js: sprite-SILHOUETTE cast shadows squashed onto the floor
    // plane and marched along the key-light direction (upper-left key →
    // lower-right cast, consistent with the sprite art's own shading), plus
    // a tight contact-AO band under each base line. No more generic
    // rhombi/ellipses that didn't fit the sprites.
    for (const d of drawn) {
        let sal = 1;
        if (opts.pop && opts.pop.item === d.p.item && opts.pop.x === d.p.x && opts.pop.y === d.p.y) {
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
        // placement pop-in
        let drop = 0, alpha = 1;
        if (opts.pop && opts.pop.item === p.item && opts.pop.x === p.x && opts.pop.y === p.y) {
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
    // labelled axes along the two FRONT edges, just outside the floor diamond
    ctx.save();
    ctx.font = '12px Medieval, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < N; i++) {
        // X indices along the south-west edge (tiles (*, N-1))
        ctx.fillStyle = 'rgba(232,213,163,0.85)';
        ctx.fillText(String(i), isoX(i, N - 1) - 17, isoY(i, N - 1) + 27);
        // Y indices along the south-east edge (tiles (N-1, *))
        ctx.fillText(String(i), isoX(N - 1, i) + 18, isoY(N - 1, i) + 27);
    }
    ctx.fillStyle = 'rgba(240,200,110,0.95)';
    ctx.font = '13px Medieval, sans-serif';
    ctx.fillText('X', isoX(N, N - 1) - 2, isoY(N, N - 1) + 30);
    ctx.fillText('Y', isoX(N - 1, N) + 8, isoY(N - 1, N) + 30);
    // footprint cell highlight
    const pulse = 0.5 + 0.5 * Math.sin((frame / FRAMES) * Math.PI * 2);
    const valid = g.valid !== false;
    for (let ix = 0; ix < (g.fw || 1); ix++) {
        for (let iy = 0; iy < (g.fh || 1); iy++) {
            const cx = isoX(g.x + ix, g.y + iy), cy = isoY(g.x + ix, g.y + iy);
            drawDiamond(ctx, cx, cy, TW / 2 - 3, TH / 2 - 1.5);
            ctx.fillStyle = valid ? `rgba(240,200,90,${0.10 + 0.10 * pulse})` : `rgba(220,70,50,${0.13 + 0.13 * pulse})`;
            ctx.fill();
            ctx.strokeStyle = valid ? `rgba(240,200,90,${0.45 + 0.4 * pulse})` : `rgba(230,80,60,${0.5 + 0.4 * pulse})`;
            ctx.lineWidth = 1.6;
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
    frames.forEach((b, i) => fs.writeFileSync(path.join(tmp, `f${String(i).padStart(3, '0')}.png`), b));
    const out = path.join(tmp, 'room.mp4');
    try {
        await new Promise((resolve, reject) => {
            ffmpeg()
                .input(path.join(tmp, 'f%03d.png'))
                .inputOptions(['-framerate', `${1000 / FRAME_MS}`])
                .outputOptions([
                    '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0',
                    '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '23',
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
function stateHash(state, opts = {}) {
    return hashStr(JSON.stringify([state.owner, state.theme, state.placed, opts.pop || null, opts.hint || '', opts.grid || null, opts.static ? 1 : 0]));
}

// Media matrix (owner 2026-10-15 "rpg_base_building_redesign.md" §6):
//   viewing / browsing / grids  → STATIC image card (opts.static, frame 0)
//   successful placement (pop)  → ANIMATED GIF (full frames + mp4)
async function renderRoomImage(state, opts = {}) {
    const key = stateHash(state, opts);
    const hit = _renderCache.get(key);
    if (hit && (Date.now() - hit.ts) < CACHE_TTL) return hit;
    const frames = [];
    const frameCount = opts.static ? 1 : FRAMES;
    for (let f = 0; f < frameCount; f++) frames.push(await renderFrame(state, f, opts));
    let out = { buffer: frames[0], contentType: 'image/png' };
    if (!opts.static) {
        try {
            const mp4 = await encodeFramesToMp4(frames);
            if (mp4 && mp4.length > 1000) out = { buffer: mp4, contentType: 'video/mp4' };
        } catch (e) {
            console.error('[homesteadRenderer] mp4 encode failed, PNG fallback:', e.message);
        }
    }
    if (_renderCache.size > 120) _renderCache.clear();
    _renderCache.set(key, { ...out, ts: Date.now() });
    return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC: catalog cards
// ═══════════════════════════════════════════════════════════════════════════
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
    ctx.font = '20px Medieval';
    ctx.fillStyle = '#9c8455';
    ctx.fillText(`— page ${page + 1} of ${pages} —`, W / 2, 128);
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

    const items = catalog().items;
    const COLS = 4, ROWS = 3, PER = COLS * ROWS;
    const gx0 = 60, gy0 = 236, cw = 234, ch = 320, gapx = 16, gapy = 20;
    for (let i = 0; i < PER; i++) {
        const it = items[page * PER + i];
        if (!it) break;
        const x = gx0 + (i % COLS) * (cw + gapx);
        const y = gy0 + Math.floor(i / COLS) * (ch + gapy);
        const R = RARITY[it.rarity] || RARITY.common;

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

        ctx.font = '19px Medieval';
        ctx.fillStyle = '#e8d5a3';
        let nm = it.name;
        while (ctx.measureText(nm).width > cw - 20 && nm.length > 4) nm = nm.slice(0, -2);
        if (nm !== it.name) nm += '…';
        ctx.fillText(nm, x + cw / 2, y + 232);

        ctx.font = '13px Medieval';
        ctx.fillStyle = R.col;
        ctx.fillText(it.rarity.toUpperCase(), x + cw / 2, y + 254);

        ctx.font = '22px Cinzel';
        ctx.fillStyle = '#f0c05a';
        ctx.fillText(`◆ ${it.price.toLocaleString()}`, x + cw / 2, y + 286);

        if (it.comfort > 0) {
            ctx.font = '14px Medieval';
            ctx.fillStyle = '#7ec8a0';
            ctx.fillText('♥'.repeat(Math.min(it.comfort, 8)), x + cw / 2, y + 306);
        }
    }

    ctx.font = '20px Medieval';
    ctx.fillStyle = '#9c8455';
    ctx.fillText('.home buy <name>   •   .home place <name>   •   .home catalog <page>', W / 2, H - 46);
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
const ROWS_PER_PAGE = 14;

async function renderInventoryCard(rec, opts = {}) {
    ensureFonts();
    // rows: placed pieces first (room order), then storage
    const placedRows = (rec.placed || []).map((p) => {
        const d = itemDef(p.item) || {};
        return { d, status: d.layer === 'wall' ? `wall ${p.x}` : `(${p.x},${p.y})`, placed: true };
    });
    const storedRows = (rec.owned || []).map((o) => ({ d: itemDef(o.id) || {}, status: 'storage', placed: false }));
    const rows = [...placedRows, ...storedRows];
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
    ctx.font = '22px Cinzel';
    ctx.fillStyle = '#7ec8a0';
    ctx.fillText(`♥ ${comfort} comfort   •   📍 ${placedRows.length} placed   •   📦 ${storedRows.length} storage`, W / 2, 196);

    const slice = rows.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);
    const y0 = 236, rh = 64;
    let lastPlaced = null;
    for (let i = 0; i < slice.length; i++) {
        const row = slice[i];
        const y = y0 + i * rh;
        const R = RARITY[row.d.rarity] || RARITY.common;
        // section divider
        if (row.placed !== lastPlaced) {
            lastPlaced = row.placed;
            ctx.font = '17px Medieval';
            ctx.fillStyle = '#c9a25e';
            ctx.textAlign = 'center';
            ctx.fillText(row.placed ? '— 📍 PLACED IN YOUR ROOM —' : '— 📦 IN STORAGE —', W / 2, y + 10);
        }
        const rowY = y + 34;
        // row plate
        ctx.fillStyle = 'rgba(32,24,14,0.72)';
        roundRect(ctx, 70, rowY - 21, W - 140, 44, 9);
        ctx.fill();
        ctx.strokeStyle = 'rgba(166,124,46,0.35)';
        ctx.lineWidth = 1;
        roundRect(ctx, 70, rowY - 21, W - 140, 44, 9);
        ctx.stroke();
        // sprite thumbnail
        const spr = row.d.id ? await img(`${row.d.id}.png`) : null;
        if (spr) {
            const maxH = 36, maxW = 56;
            let s = Math.min(maxH / spr.height, maxW / spr.width, 2);
            ctx.drawImage(spr, 100 - (spr.width * s) / 2, rowY - (spr.height * s) / 2, spr.width * s, spr.height * s);
        }
        // name + star
        ctx.textAlign = 'left';
        ctx.font = '22px Medieval';
        ctx.fillStyle = R.col;
        let nm = `${STAR[row.d.rarity] || '⚪'} ${row.d.name || row.d.id}`;
        const maxNm = W - 140 - 220 - 130;
        while (ctx.measureText(nm).width > maxNm && nm.length > 4) nm = nm.slice(0, -2);
        if (nm !== `${STAR[row.d.rarity] || '⚪'} ${row.d.name || row.d.id}`) nm += '…';
        ctx.fillText(nm, 140, rowY);
        // comfort chips
        if (row.d.comfort > 0) {
            ctx.font = '15px Medieval';
            ctx.fillStyle = '#7ec8a0';
            ctx.fillText('♥'.repeat(Math.min(row.d.comfort, 5)), 140 + ctx.measureText(nm).width + 18, rowY + 1);
        }
        // status (right-aligned)
        ctx.textAlign = 'right';
        ctx.font = '20px Medieval';
        ctx.fillStyle = row.placed ? '#e8d5a3' : '#9c8455';
        ctx.fillText(row.placed ? `📍 ${row.status}` : '📦 storage', W - 100, rowY);
    }
    if (!slice.length) {
        ctx.font = '24px Medieval';
        ctx.fillStyle = '#9c8455';
        ctx.textAlign = 'center';
        ctx.fillText('An empty homestead — visit the outfitter!', W / 2, 400);
    }

    ctx.textAlign = 'center';
    ctx.font = '20px Medieval';
    ctx.fillStyle = '#9c8455';
    ctx.fillText(`${opts.prefix || '.'}home select <name>   •   ${opts.prefix || '.'}home place <name> [x y]   •   ${opts.prefix || '.'}home store [x y]`, W / 2, H - 46);
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
    encodeFramesToMp4,
    itemDef,
    catalog,
};
