// ═══════════════════════════════════════════════════════════════════════════
//  BASE BUILDER RENDERER — server-side scene compositing (prototype)
// ═══════════════════════════════════════════════════════════════════════════
//
//  Renders three scene kinds as JPEG buffers for WhatsApp:
//    1. WORLD MAP  — parchment-framed chart, 10 top-down environments in a
//                    5x2 grid with dirt roads between them, numbered badges,
//                    landmark sprites, and a "you are here" marker.
//    2. ZONE VIEW  — one environment at travel scale: hand-painted ground,
//                    depth-sorted sprite props with soft shadows, banner.
//    3. ROOM VIEW  — the isometric homestead interior with the player's
//                    furniture placed on a 7x7 projective grid.
//
//  Asset pipeline: z-ai generated hand-painted art, white-bg keyed to alpha,
//  stored in core/rpgasset/base/ (gitattributes-excluded from LFS so the
//  boxes' reset --hard deploys serve real pixels — same contract as the
//  ruins/crystal exclusions).
//
//  Geometry ported from the web prototype (Task 42 pass 1): the floor quad
//  homography verts were measured from the iso room art (top 488,393 /
//  right 938,622 / left 62,640 / bottom 494,904) — do not eyeball-edit them.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');

const ASSET_DIR = path.join(__dirname, '..', 'rpgasset', 'base');

// ─── asset definitions ────────────────────────────────────────────────────────
// h = world-space height in px at zone scale (600x440), width from aspect.
const WORLD_ASSETS = {
    tree_oak: { file: 'tree_oak.png', h: 150 },
    tree_pine: { file: 'tree_pine.png', h: 162 },
    tree_palm: { file: 'tree_palm.png', h: 152 },
    cactus: { file: 'cactus.png', h: 92 },
    rock: { file: 'rock.png', h: 72 },
    bush: { file: 'bush.png', h: 56 },
    dead_tree: { file: 'dead_tree.png', h: 128 },
    well: { file: 'well.png', h: 84 },
    fence: { file: 'fence.png', h: 46 },
    crate: { file: 'crate.png', h: 56 },
    hay_cart: { file: 'hay_cart.png', h: 88 },
    wagon: { file: 'wagon.png', h: 110 },
    market_stall: { file: 'market_stall.png', h: 120 },
    torch_post: { file: 'torch_post.png', h: 112 },
    house_main: { file: 'house_main.png', h: 218 },
    cabin: { file: 'cabin.png', h: 155 },
};

const GROUNDS = {
    meadow: 'ground_meadow.jpg',
    forest: 'ground_forest.jpg',
    desert: 'ground_desert.jpg',
    snow: 'ground_snow.jpg',
    farmland: 'ground_farmland.jpg',
    beach: 'ground_beach.jpg',
    volcano: 'ground_volcano.jpg',
    swamp: 'ground_swamp.jpg',
    town: 'ground_town.jpg',
    canyon: 'ground_canyon.jpg',
};

// ─── room catalog (iso furniture) ─────────────────────────────────────────────
const ROOM_CFG = {
    n: 7,
    verts: { top: [488, 393], right: [938, 622], left: [62, 640], bottom: [494, 904] },
};

const FURNITURE = {
    furn_bed: { file: 'furn_bed.png', wFactor: 1.32, label: 'Bed' },
    furn_sofa: { file: 'furn_sofa.png', wFactor: 1.28, label: 'Sofa' },
    furn_table: { file: 'furn_table.png', wFactor: 0.95, label: 'Table' },
    furn_chair: { file: 'furn_chair.png', wFactor: 0.72, label: 'Chair' },
    furn_shelf: { file: 'furn_shelf.png', wFactor: 0.9, label: 'Bookshelf' },
    furn_plant: { file: 'furn_plant.png', wFactor: 0.68, label: 'Plant' },
    furn_lamp: { file: 'furn_lamp.png', wFactor: 0.78, label: 'Lamp' },
    furn_rug: { file: 'furn_rug.png', wFactor: 1.42, flat: true, label: 'Rug' },
    furn_chest: { file: 'furn_chest.png', wFactor: 0.82, label: 'Chest' },
    furn_fireplace: { file: 'furn_fireplace.png', wFactor: 0.9, label: 'Fireplace' },
};

// ─── world layout (ported from the web prototype worldgen) ────────────────────
const ZW = 600, ZH = 440, GAP = 48, BORDER = 70;
const WORLD_W = BORDER * 2 + 5 * ZW + 4 * GAP;
const WORLD_H = BORDER * 2 + 2 * ZH + GAP;

const ZONE_DEFS = [
    { name: 'Willow Creek', ground: 'meadow' },
    { name: 'Pinewood', ground: 'forest' },
    { name: 'Dune Sea', ground: 'desert' },
    { name: 'Frostvale', ground: 'snow' },
    { name: 'Green Acres', ground: 'farmland' },
    { name: 'Palm Shore', ground: 'beach' },
    { name: 'Ember Wastes', ground: 'volcano' },
    { name: 'Mirefen', ground: 'swamp' },
    { name: 'Stonecross Town', ground: 'town' },
    { name: 'Red Canyon', ground: 'canyon' },
];

// the enterable house sits at the center of Willow Creek (zone 0)
const HOUSE = { zone: 0, x: BORDER + ZW / 2, y: BORDER + ZH / 2 + 30 };

function zoneRect(i) {
    const col = i % 5;
    const row = Math.floor(i / 5);
    return { x: BORDER + col * (ZW + GAP), y: BORDER + row * (ZH + GAP), w: ZW, h: ZH };
}

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        return t;
    };
}

function scatter(rng, z, count, asset, opts = {}) {
    const margin = opts.margin ?? 70;
    const minDist = opts.minDist ?? 95;
    const out = [];
    let tries = 0;
    while (out.length < count && tries < 400) {
        tries++;
        const x = z.x + margin + rng() * (z.w - margin * 2);
        const y = z.y + margin + rng() * (z.h - margin * 2);
        let bad = false;
        for (const p of out) {
            if (Math.hypot(p.x - x, (p.y - y) * 1.6) < minDist) { bad = true; break; }
        }
        if (!bad) {
            for (const e of opts.avoid ?? []) {
                if (Math.hypot(e.x - x, (e.y - y) * 1.4) < e.r) { bad = true; break; }
            }
        }
        if (!bad) out.push({ asset, x, y });
    }
    return out;
}

// fantasy prop layout — NO vehicles (owner ruling: fantasy world)
let _zonesCache = null;
function buildZones() {
    if (_zonesCache) return _zonesCache;
    const zones = [];
    for (let i = 0; i < 10; i++) {
        zones.push({ id: i, name: ZONE_DEFS[i].name, ground: ZONE_DEFS[i].ground, ...zoneRect(i), props: [] });
    }
    const rng = mulberry32(20261015);
    const houseAvoid = [{ x: HOUSE.x, y: HOUSE.y, r: 175 }];

    // -- 0 Willow Creek (homestead) --
    const z0 = zones[0];
    z0.props.push(
        { asset: 'house_main', x: HOUSE.x, y: HOUSE.y, fixed: true },
        { asset: 'well', x: HOUSE.x + 148, y: HOUSE.y - 28, fixed: true },
        { asset: 'hay_cart', x: HOUSE.x - 190, y: HOUSE.y + 138, fixed: true },
        { asset: 'fence', x: HOUSE.x - 148, y: HOUSE.y - 120, fixed: true },
        { asset: 'fence', x: HOUSE.x - 74, y: HOUSE.y - 132, fixed: true },
        { asset: 'fence', x: HOUSE.x + 74, y: HOUSE.y - 132, fixed: true },
        { asset: 'fence', x: HOUSE.x + 148, y: HOUSE.y - 120, fixed: true },
        ...scatter(rng, z0, 3, 'tree_oak', { minDist: 120, avoid: houseAvoid }),
        ...scatter(rng, z0, 3, 'bush', { minDist: 70, avoid: houseAvoid })
    );

    // -- 1 Pinewood --
    zones[1].props.push(
        ...scatter(rng, zones[1], 8, 'tree_pine', { minDist: 100 }),
        ...scatter(rng, zones[1], 3, 'bush', { minDist: 70 }),
        ...scatter(rng, zones[1], 1, 'crate', { minDist: 80 })
    );

    // -- 2 Dune Sea --
    zones[2].props.push({ asset: 'wagon', x: zones[2].x + ZW * 0.64, y: zones[2].y + ZH * 0.74, fixed: true });
    zones[2].props.push(
        ...scatter(rng, zones[2], 4, 'cactus', { minDist: 95 }),
        ...scatter(rng, zones[2], 2, 'rock', { minDist: 95 })
    );

    // -- 3 Frostvale --
    zones[3].props.push({ asset: 'cabin', x: zones[3].x + ZW * 0.7, y: zones[3].y + ZH * 0.34, fixed: true });
    zones[3].props.push(
        ...scatter(rng, zones[3], 4, 'tree_pine', { minDist: 100 }),
        ...scatter(rng, zones[3], 2, 'rock', { minDist: 95 })
    );

    // -- 4 Green Acres --
    const z4 = zones[4];
    const fy = z4.y + ZH * 0.62;
    for (let k = 0; k < 5; k++) z4.props.push({ asset: 'fence', x: z4.x + 130 + k * 88, y: fy, fixed: true });
    z4.props.push(
        ...scatter(rng, z4, 2, 'tree_oak', { minDist: 130 }),
        ...scatter(rng, z4, 2, 'crate', { minDist: 85 })
    );

    // -- 5 Palm Shore --
    zones[5].props.push(
        ...scatter(rng, zones[5], 3, 'tree_palm', { minDist: 110 }),
        ...scatter(rng, zones[5], 2, 'rock', { minDist: 95 })
    );

    // -- 6 Ember Wastes --
    zones[6].props.push(
        ...scatter(rng, zones[6], 3, 'dead_tree', { minDist: 110 }),
        ...scatter(rng, zones[6], 3, 'rock', { minDist: 95 })
    );

    // -- 7 Mirefen --
    zones[7].props.push(
        ...scatter(rng, zones[7], 2, 'dead_tree', { minDist: 110 }),
        ...scatter(rng, zones[7], 3, 'bush', { minDist: 75 }),
        ...scatter(rng, zones[7], 1, 'crate', { minDist: 85 })
    );

    // -- 8 Stonecross Town (fantasy market town — replaced Gridlock City) --
    const z8 = zones[8];
    z8.props.push(
        { asset: 'market_stall', x: z8.x + ZW * 0.3, y: z8.y + ZH * 0.4, fixed: true },
        { asset: 'market_stall', x: z8.x + ZW * 0.72, y: z8.y + ZH * 0.38, fixed: true },
        { asset: 'hay_cart', x: z8.x + ZW * 0.52, y: z8.y + ZH * 0.68, fixed: true },
        { asset: 'well', x: z8.x + ZW * 0.5, y: z8.y + ZH * 0.22, fixed: true },
        { asset: 'torch_post', x: z8.x + 100, y: z8.y + ZH - 70, fixed: true },
        { asset: 'torch_post', x: z8.x + ZW - 100, y: z8.y + ZH - 70, fixed: true },
        { asset: 'crate', x: z8.x + ZW * 0.82, y: z8.y + ZH * 0.72, fixed: true }
    );

    // -- 9 Red Canyon --
    zones[9].props.push(
        ...scatter(rng, zones[9], 4, 'rock', { minDist: 95 }),
        ...scatter(rng, zones[9], 2, 'dead_tree', { minDist: 110 }),
        ...scatter(rng, zones[9], 1, 'crate', { minDist: 85 })
    );

    _zonesCache = zones;
    return zones;
}

// ─── homography (ported verbatim from the web prototype) ─────────────────────
function homography(src, dst) {
    const A = [], b = [];
    for (let k = 0; k < 4; k++) {
        const [u, v] = src[k];
        const [x, y] = dst[k];
        A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
        A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
    }
    const n = 8;
    for (let col = 0; col < n; col++) {
        let piv = col;
        for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
        [A[col], A[piv]] = [A[piv], A[col]];
        [b[col], b[piv]] = [b[piv], b[col]];
        for (let r = col + 1; r < n; r++) {
            const f = A[r][col] / A[col][col];
            for (let c2 = col; c2 < n; c2++) A[r][c2] -= f * A[col][c2];
            b[r] -= f * b[col];
        }
    }
    const h = new Array(8).fill(0);
    for (let r = n - 1; r >= 0; r--) {
        let s = b[r];
        for (let c2 = r + 1; c2 < n; c2++) s -= A[r][c2] * h[c2];
        h[r] = s / A[r][r];
    }
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function invert3(m) {
    const [a, b, c, d, e, f, g, h, i] = m;
    const A = e * i - f * h, B = c * h - b * i, C = b * f - c * e;
    const D = f * g - d * i, E = a * i - c * g, F = c * d - a * f;
    const G = d * h - e * g, Hh = b * g - a * h, I = a * e - b * d;
    const det = a * A + b * D + c * G;
    return [A / det, B / det, C / det, D / det, E / det, F / det, G / det, Hh / det, I / det];
}

function applyH(H, x, y) {
    const w = H[6] * x + H[7] * y + H[8];
    return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
}

// ─── resource loading (lazy, cached) ─────────────────────────────────────────
let _fontRegistered = false;
function ensureFont(canvasMod) {
    if (_fontRegistered) return;
    try {
        const reg = canvasMod.registerFont || (canvasMod.GlobalFonts && canvasMod.GlobalFonts.registerFromPath);
        const p = path.join(ASSET_DIR, 'MedievalSharp.ttf');
        if (reg && fs.existsSync(p)) reg(p, { family: 'BB-Fantasy' });
    } catch (e) { /* fall back to default font silently */ }
    _fontRegistered = true;
}

const _imgCache = new Map();
async function img(file) {
    if (_imgCache.has(file)) return _imgCache.get(file);
    const canvasMod = require('canvas');
    const loaded = await canvasMod.loadImage(path.join(ASSET_DIR, file));
    _imgCache.set(file, loaded);
    return loaded;
}

function assetPath(file) { return path.join(ASSET_DIR, file); }

// draw a world prop anchored bottom-center at (x, y), world-space height h
function drawProp(ctx, def, x, y, scale = 1) {
    const im = _imgCache.get(def.file);
    if (!im) return;
    const h = def.h * scale;
    const w = h * (im.width / im.height);
    // soft ground shadow
    ctx.fillStyle = 'rgba(20,12,6,0.28)';
    ctx.beginPath();
    ctx.ellipse(x, y - h * 0.04, w * 0.3, h * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(im, x - w / 2, y - h, w, h);
}

async function preloadAll() {
    for (const k of Object.keys(WORLD_ASSETS)) await img(WORLD_ASSETS[k].file);
    for (const k of Object.keys(GROUNDS)) await img(GROUNDS[k]);
    for (const k of Object.keys(FURNITURE)) await img(FURNITURE[k].file);
    await img('iso_room.png');
}

// ─── scene 1: world map ───────────────────────────────────────────────────────
async function renderWorldMap(curZone) {
    const { createCanvas } = require('canvas');
    ensureFont(require('canvas'));
    const zones = buildZones();
    for (const z of zones) for (const p of z.props) await img(WORLD_ASSETS[p.asset].file);
    for (const g of Object.keys(GROUNDS)) await img(GROUNDS[g]);

    const cv = createCanvas(WORLD_W, WORLD_H);
    const ctx = cv.getContext('2d');

    // dirt road base (the gaps between tiles read as roads)
    ctx.fillStyle = '#8a6c48';
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    // subtle dirt mottling
    const rng = mulberry32(777);
    for (let i = 0; i < 900; i++) {
        ctx.fillStyle = `rgba(${105 + (rng() * 40) | 0},${82 + (rng() * 35) | 0},${54 + (rng() * 28) | 0},0.35)`;
        const r = 3 + rng() * 9;
        ctx.beginPath();
        ctx.arc(rng() * WORLD_W, rng() * WORLD_H, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // zone tiles: ground + landmark sprite + plate
    const LANDMARK = { 0: 'house_main', 1: 'tree_pine', 2: 'wagon', 3: 'cabin', 4: 'well', 5: 'tree_palm', 6: 'dead_tree', 7: 'dead_tree', 8: 'market_stall', 9: 'rock' };
    for (let i = 0; i < zones.length; i++) {
        const z = zones[i];
        const g = await img(GROUNDS[z.ground]);
        ctx.drawImage(g, z.x, z.y, z.w, z.h);

        // landmark centered-ish
        const lm = WORLD_ASSETS[LANDMARK[i]];
        const lmi = await img(lm.file);
        const lmH = (i === 0 ? 190 : i === 8 ? 150 : 130);
        const lmW = lmH * (lmi.width / lmi.height);
        ctx.fillStyle = 'rgba(20,12,6,0.28)';
        ctx.beginPath();
        ctx.ellipse(z.x + z.w / 2, z.y + z.h / 2 + 26, lmW * 0.3, lmH * 0.06, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.drawImage(lmi, z.x + z.w / 2 - lmW / 2, z.y + z.h / 2 + 26 - lmH, lmW, lmH);

        // number badge
        ctx.beginPath();
        ctx.arc(z.x + 34, z.y + 34, 22, 0, Math.PI * 2);
        ctx.fillStyle = '#3a2a1e';
        ctx.fill();
        ctx.strokeStyle = '#eadcc4';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = '#f3e9d2';
        ctx.font = 'bold 24px "BB-Fantasy", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), z.x + 34, z.y + 35);

        // name plate under tile
        ctx.font = '38px "BB-Fantasy", serif';
        const tw = ctx.measureText(z.name.toUpperCase()).width;
        ctx.fillStyle = 'rgba(42,30,18,0.82)';
        ctx.fillRect(z.x + z.w / 2 - tw / 2 - 14, z.y + z.h + 4, tw + 28, 40);
        ctx.fillStyle = '#f0e6cf';
        ctx.fillText(z.name.toUpperCase(), z.x + z.w / 2, z.y + z.h + 25);

        // "you are here" ring
        if (curZone === i) {
            ctx.strokeStyle = '#ffd76a';
            ctx.lineWidth = 7;
            ctx.setLineDash([18, 12]);
            ctx.strokeRect(z.x + 4, z.y + 4, z.w - 8, z.h - 8);
            ctx.setLineDash([]);
            ctx.font = 'bold 26px "BB-Fantasy", serif';
            const hereTxt = 'YOU ARE HERE';
            const hw = ctx.measureText(hereTxt).width;
            ctx.fillStyle = '#ffd76a';
            ctx.fillText(hereTxt, z.x + z.w / 2, z.y - 18);
            ctx.fillStyle = 'rgba(42,30,18,0.75)';
            ctx.fillRect(z.x + z.w / 2 - hw / 2 - 10, z.y - 36, hw + 20, 30);
            ctx.fillStyle = '#ffd76a';
            ctx.fillText(hereTxt, z.x + z.w / 2, z.y - 15);
        }
    }

    // title band (top border area)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '56px "BB-Fantasy", serif';
    ctx.fillStyle = '#f6ecd4';
    ctx.fillText('THE HOMESTEAD CHART', WORLD_W / 2, 38);

    // frame
    ctx.strokeStyle = '#4a3623';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, WORLD_W - 10, WORLD_H - 10);
    ctx.strokeStyle = '#c8a25a';
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 18, WORLD_W - 36, WORLD_H - 36);

    // downscale to WhatsApp-friendly width
    const OUT_W = 1800;
    const out = createCanvas(OUT_W, Math.round(WORLD_H * OUT_W / WORLD_W));
    const octx = out.getContext('2d');
    octx.drawImage(cv, 0, 0, out.width, out.height);
    return out.toBuffer('image/jpeg', 0.88);
}

// ─── scene 2: zone view ───────────────────────────────────────────────────────
async function renderZone(zoneId) {
    const { createCanvas } = require('canvas');
    ensureFont(require('canvas'));
    const zones = buildZones();
    const z = zones[zoneId];
    const S = 2; // render scale over world coords
    const cv = createCanvas(z.w * S, z.h * S);
    const ctx = cv.getContext('2d');

    const g = await img(GROUNDS[z.ground]);
    ctx.drawImage(g, 0, 0, cv.width, cv.height);

    for (const p of z.props) await img(WORLD_ASSETS[p.asset].file);
    const sorted = [...z.props].sort((a, b) => a.y - b.y);
    for (const p of sorted) {
        const def = WORLD_ASSETS[p.asset];
        drawProp(ctx, def, (p.x - z.x) * S, (p.y - z.y) * S, S);
    }

    // enterable-house hint — bottom band (the top area is reserved for the
    // zone banner; a badge there got hidden behind it)
    if (z.id === HOUSE.zone) {
        const bh = 64;
        ctx.fillStyle = 'rgba(42,30,18,0.86)';
        ctx.fillRect(0, cv.height - bh, cv.width, bh);
        ctx.strokeStyle = '#c8a25a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, cv.height - bh); ctx.lineTo(cv.width, cv.height - bh);
        ctx.stroke();
        ctx.font = '30px "BB-Fantasy", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffd76a';
        ctx.fillText('✦ A cozy cottage stands here — step inside with the enter command', cv.width / 2, cv.height - bh / 2);
    }

    // banner
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '52px "BB-Fantasy", serif';
    const title = z.name.toUpperCase();
    const tw = ctx.measureText(title).width;
    const bw = tw + 72, bh = 78, bx = cv.width / 2 - bw / 2, by = 26;
    ctx.fillStyle = 'rgba(42,30,18,0.86)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#c8a25a';
    ctx.lineWidth = 4;
    ctx.strokeRect(bx + 5, by + 5, bw - 10, bh - 10);
    ctx.fillStyle = '#f3e6c8';
    ctx.fillText(title, cv.width / 2, by + bh / 2 + 2);

    return cv.toBuffer('image/jpeg', 0.88);
}

// ─── scene 3: room view ───────────────────────────────────────────────────────
function roomHomography() {
    const { top, right, left, bottom } = ROOM_CFG.verts;
    const fwd = homography([[0, 0], [1, 0], [0, 1], [1, 1]], [top, right, left, bottom]);
    return fwd;
}

function cellCenterImg(H, r, c) {
    const n = ROOM_CFG.n;
    return applyH(H, (c + 0.5) / n, (r + 0.5) / n);
}

function cellDiamondImg(H, r, c) {
    const n = ROOM_CFG.n;
    return [
        applyH(H, c / n, r / n),
        applyH(H, (c + 1) / n, r / n),
        applyH(H, (c + 1) / n, (r + 1) / n),
        applyH(H, c / n, (r + 1) / n),
    ];
}

async function renderRoom(placements, opts = {}) {
    const { createCanvas } = require('canvas');
    ensureFont(require('canvas'));
    const roomImg = await img('iso_room.png');
    for (const p of placements || []) if (FURNITURE[p.item]) await img(FURNITURE[p.item].file);

    const cv = createCanvas(roomImg.width, roomImg.height);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#16110c';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(roomImg, 0, 0);

    const H = roomHomography();
    const n = ROOM_CFG.n;

    // faint grid so slot numbers have a reference
    ctx.strokeStyle = 'rgba(255,248,230,0.14)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const a = applyH(H, 0, t), b = applyH(H, 1, t);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        const c1 = applyH(H, t, 0), d1 = applyH(H, t, 1);
        ctx.beginPath(); ctx.moveTo(c1.x, c1.y); ctx.lineTo(d1.x, d1.y); ctx.stroke();
    }

    // tiny slot numbers (under furniture) — the back row (row 0) sits ON the
    // wall visually, so it gets no numbers and no placement (see place rules)
    ctx.font = '22px "BB-Fantasy", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,244,214,0.34)';
    for (let r = 1; r < n; r++) {
        for (let c = 0; c < n; c++) {
            const cc = cellCenterImg(H, r, c);
            ctx.fillText(String(r * n + c + 1), cc.x, cc.y);
        }
    }

    // furniture sorted by depth ((r+c)*2, flat first within tie)
    const sorted = [...(placements || [])]
        .filter((p) => FURNITURE[p.item])
        .sort((a, b) => {
            const fa = FURNITURE[a.item], fb = FURNITURE[b.item];
            const ka = (Math.floor((a.slot - 1) / n) + ((a.slot - 1) % n)) * 2 + (fa.flat ? 0 : 1);
            const kb = (Math.floor((b.slot - 1) / n) + ((b.slot - 1) % n)) * 2 + (fb.flat ? 0 : 1);
            return ka - kb;
        });
    for (const it of sorted) {
        const def = FURNITURE[it.item];
        const fimg = await img(def.file);
        const r = Math.floor((it.slot - 1) / n), c = (it.slot - 1) % n;
        const ccImg = cellCenterImg(H, r, c);
        const dia = cellDiamondImg(H, r, c);
        const edgeW = (
            Math.hypot(dia[1].x - dia[0].x, dia[1].y - dia[0].y) +
            Math.hypot(dia[2].x - dia[3].x, dia[2].y - dia[3].y)
        ) / 2;
        const w = edgeW * def.wFactor;
        const h = (w / (fimg.width / fimg.height)) * (def.flat ? 0.55 : 1);
        if (!def.flat) {
            ctx.fillStyle = 'rgba(15,10,6,0.25)';
            ctx.beginPath();
            ctx.ellipse(ccImg.x, ccImg.y, w * 0.32, w * 0.1, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.drawImage(fimg, ccImg.x - w / 2, ccImg.y - h, w, h);
    }

    // bottom caption band
    const bh = 64;
    ctx.fillStyle = 'rgba(42,30,18,0.86)';
    ctx.fillRect(0, cv.height - bh, cv.width, bh);
    ctx.strokeStyle = '#c8a25a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, cv.height - bh); ctx.lineTo(cv.width, cv.height - bh);
    ctx.stroke();
    ctx.font = '30px "BB-Fantasy", serif';
    ctx.fillStyle = '#f3e6c8';
    const who = opts.who ? ` — ${opts.who}` : '';
    ctx.fillText(`Homestead Interior${who}`, cv.width / 2, cv.height - bh / 2);

    // downscale a touch for WhatsApp
    const OUT_W = 1080;
    const out = createCanvas(OUT_W, Math.round(cv.height * OUT_W / cv.width));
    out.getContext('2d').drawImage(cv, 0, 0, out.width, out.height);
    return out.toBuffer('image/jpeg', 0.9);
}

// ─── render cache (zone/map renders are deterministic; room keyed by state) ──
const _renderCache = new Map();
const CACHE_MAX = 48;
function cacheGet(key) {
    const v = _renderCache.get(key);
    if (v) { _renderCache.delete(key); _renderCache.set(key, v); } // LRU touch
    return v;
}
function cacheSet(key, buf) {
    if (_renderCache.size >= CACHE_MAX) {
        const oldest = _renderCache.keys().next().value;
        _renderCache.delete(oldest);
    }
    _renderCache.set(key, buf);
}

async function worldMapBuffer(curZone) {
    const key = `map:${curZone ?? 'x'}`;
    if (cacheGet(key)) return cacheGet(key);
    const buf = await renderWorldMap(curZone);
    cacheSet(key, buf);
    return buf;
}

async function zoneBuffer(zoneId) {
    const key = `zone:${zoneId}`;
    if (cacheGet(key)) return cacheGet(key);
    const buf = await renderZone(zoneId);
    cacheSet(key, buf);
    return buf;
}

async function roomBuffer(placements, who) {
    const key = `room:${JSON.stringify(placements || [])}:${who || ''}`;
    if (cacheGet(key)) return cacheGet(key);
    const buf = await renderRoom(placements, { who });
    cacheSet(key, buf);
    return buf;
}

module.exports = {
    // catalog data (commands read these for validation/labels)
    ZONE_DEFS, FURNITURE, WORLD_ASSETS, HOUSE, ROOM_CFG,
    zoneCount: ZONE_DEFS.length,
    // renderers (LRU-cached)
    worldMapBuffer, zoneBuffer, roomBuffer,
    preloadAll,
    // internals exposed for QA
    buildZones, roomHomography, assetPath, cellCenterImg, cellDiamondImg,
};
