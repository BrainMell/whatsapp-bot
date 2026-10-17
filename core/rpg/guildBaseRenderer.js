'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  GUILD BASE RENDERER — outdoor isometric guild grounds
//  GUILD v7 KINGDOM PLAN (owner 2026-10-17 23:13Z msg 1561155345102151774
//  "Remake the guild area to structure more like a kingdom ... the castle
//  is touching the edge? ... move it to the center area of the fence, now
//  rearrange the path again ... with the guild banner floating on top of
//  the castle"): the castle is the HEART of the grounds — centred on the
//  28x28 diamond inside a stone COURT; the 2-wide grand avenue runs from
//  the west gate straight to the keep; district lanes fan from the court
//  edges to the five house plots, the training yard and the cottage
//  hamlet; the guild banner FLOATS above the castle's roofline (hover bob
//  + cloth wave). Same visual law as homesteadBaseRenderer.js: grass
//  tiles, isoShadow grounding, back-to-front depth sort, ambient anim.
//  Structures mirror GUILD_UPGRADES (guilds.js): hall L0-5 (4x4),
//  training L0-5 (3x3), treasury L0-5 (2x2). L0 = building plot (scaffold).
//  Archetype theming (ADVENTURER/MERCHANT/RESEARCH) + member cottages.
//  Media law (owner §6): views render STATIC PNG; build/upgrade moments
//  may pass opts.celebrate for the mp4-gif transformation.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const os = require('os');
const isoShadow = require('./isoShadow');
const isoForest = require('./isoForest');
const isoOutlands = require('./isoOutlands');
const mediaCache = require('./mediaCache');

const SS = 2;
const TW = 64, TH = 32;
const N = 28;                          // playable diamond: 784 tiles ≈ 3× the base's 256
const ART_W = 2560, ART_H = 1500;      // canvas grows with the grounds
const OX = ART_W / 2;
const OY = 210;
const FRAMES = 14, FRAME_MS = 110;

const PREFIX = '.j'; // display-only default; engine passes real prefix via opts.hint when it matters
const GB_ASSETS = path.join(__dirname, '..', 'rpgasset', 'guildbase');
const HS_ASSETS = path.join(__dirname, '..', 'rpgasset', 'homestead');
const FONTS = path.join(__dirname, '..', 'rpgasset', 'fonts');

// ── structure defs (mirror of GUILD_UPGRADES visual states) ──
// GUILD v7 KINGDOM PLAN: the CASTLE is the heart of the grounds — centred
// on the 28x28 diamond (footprint 12..15 x 12..15) inside the stone court;
// treasury tucks into the court's south-west inner corner so the keep
// complex reads as one unit; training holds the south-east yard.
const GUILD_STRUCTS = {
    hall: {
        id: 'hall', name: 'Guild Hall', fw: 4, fh: 4,
        x: 12, y: 12,
        levels: [
            { level: 1, sprite: 'gb_castle_l1', name: 'Outpost Keep' },
            { level: 2, sprite: 'gb_castle_l2', name: 'Bailey Fort' },
            { level: 3, sprite: 'gb_castle_l3', name: 'Stone Castle' },
            { level: 4, sprite: 'gb_castle_l4', name: 'Grand Castle' },
            { level: 5, sprite: 'gb_castle_l5', name: 'Royal Citadel' },
        ],
    },
    training: {
        id: 'training', name: 'Training Ground', fw: 3, fh: 3,
        x: 23, y: 17,
        levels: [
            { level: 1, sprite: 'gb_training_l1', name: 'Dust Yard' },
            { level: 2, sprite: 'gb_training_l2', name: 'Spar Ring' },
            { level: 3, sprite: 'gb_training_l3', name: "Warrior's Ring" },
            { level: 4, sprite: 'gb_training_l4', name: 'War College' },
            { level: 5, sprite: 'gb_training_l5', name: "Legend's Arena" },
        ],
    },
    treasury: {
        id: 'treasury', name: 'Treasury', fw: 2, fh: 2,
        x: 9, y: 16,
        levels: [
            { level: 1, sprite: 'gb_treasury_l1', name: 'Coin Chest' },
            { level: 2, sprite: 'gb_treasury_l2', name: 'Vault Hut' },
            { level: 3, sprite: 'gb_treasury_l3', name: 'Strongroom' },
            { level: 4, sprite: 'gb_treasury_l4', name: 'Gold Vault' },
            { level: 5, sprite: 'gb_treasury_l5', name: 'Royal Treasury' },
        ],
    },
};

// GUILD HOUSE PLOTS (owner 2026-10-16 21:23Z: "the guild should also have
// locations to build all the various houses"; v7 owner: "structured like
// a kingdom") — five 3x3 marked expansion sites, each serviced by its own
// lane off the castle court or the grand avenue.
const GUILD_PLOTS = [
    { id: 1, x: 3, y: 3 },   // NW — end of the north-west spur
    { id: 2, x: 2, y: 10 },  // W — just north of the gate road
    { id: 3, x: 4, y: 22 },  // SW — end of the south-west spur
    { id: 4, x: 12, y: 20 }, // S — gates the cottage hamlet
    { id: 5, x: 23, y: 12 }, // E — the east arm beneath the citadel
];

// per-structure draw scale — ALL guild art now pre-scaled to footprint
// (POLYY ART LAW). Treasury 0.75: the L5 windmill towered over the member
// cottages and read as the biggest thing on the grounds (owner: guild
// buildings should sit in the castle's shadow, not compete with it).
const GUILD_SCALE = { training: 1.0, treasury: 0.75 };
const GUILD_AY_BIAS = {};

// FENCE PAD — v5 scale law: the OUTSIDE band grows too (owner: "the space
// inside the walls and outside should be double the size maybe triple").
const P = 5;

const ARCH = {
    ADVENTURER: { flag: '#a02c3c', flagD: '#7c1e2c', label: 'Adventurers' },
    MERCHANT: { flag: '#b8862e', flagD: '#8a6420', label: 'Merchants' },
    RESEARCH: { flag: '#2a6a6e', flagD: '#1e4e52', label: 'Research' },
};

// cottage slots along the south hamlet (member housing visual; the S spur
// road runs between plot 4 and the hamlet). POLYY ART LAW: each slot draws
// a DIFFERENT village-building sprite (gb_cottage_a..d cycling).
const COTTAGE_SLOTS = [[12, 24], [16, 24], [10, 26], [14, 26], [18, 25]];
// COTTAGE SCALE LAW (owner 2026-10-17, g6 live render: "now the houses are
// too big again... fix that"): the full-size village sprites read bigger
// than a low-tier castle and swamped their 3x3 plots — member homes shrink
// into the castle's shadow (0.7 keeps the art crisp at the SS2 canvas).
const COTTAGE_SCALE = 0.7;

// GUILD PATHS v7 — kingdom plan: the 2-wide GRAND AVENUE enters from the
// west gate and runs dead straight to the castle court's west face; the
// COURT stone rings the centred keep; district lanes fan from the court
// edges — NW to plot 1, W off the avenue to plot 2, SW to plot 3, S to
// plot 4, E to plot 5, SE to the training yard — and the hamlet lane
// drops south to the cottage rows (owner: "structured like a kingdom").
const COURT = { x0: 9, y0: 9, x1: 18, y1: 18 };  // the keep's stone court
// ROAD LAW: iso tiles only share EDGES with 4-connected neighbours — a
// diagonal step touches at a single point and the trail reads beaded. All
// diagonal runs are expanded into orthogonal staircases (braids nicely
// when a 2-wide road staircases in opposite phase).
function stair(a, b) {
    const out = [];
    let [x, y] = a;
    out.push([x, y]);
    while (x !== b[0] || y !== b[1]) {
        const dx = Math.sign(b[0] - x), dy = Math.sign(b[1] - y);
        if (dx && dy) { x += dx; out.push([x, y]); y += dy; out.push([x, y]); }
        else if (dx) { x += dx; out.push([x, y]); }
        else { y += dy; out.push([x, y]); }
    }
    return out;
}
const PATHS = [
    // grand avenue — west gate (y=14,15) straight to the court's west face
    ...stair([0, 14], [8, 14]),
    ...stair([0, 15], [8, 15]),
    // NW lane — court's north corner to plot 1
    ...stair([10, 10], [6, 6]), [6, 5],
    // W spur — plot 2 (off the avenue)
    [4, 13],
    // SW lane — court's west corner to plot 3
    ...stair([10, 18], [6, 21]),
    // S lane — court's south face to plot 4
    [13, 18], [13, 19],
    // hamlet lane — past plot 4 down to the cottage rows
    ...stair([14, 18], [16, 23]),
    // E lane — court to plot 5
    ...stair([18, 11], [22, 11]), [22, 12],
    // SE lane — court to the training yard's west face
    [17, 18], ...stair([18, 18], [22, 18]),
].filter((c, i, arr) => arr.findIndex((d) => d[0] === c[0] && d[1] === c[1]) === i);
// planted allée flanking the grand avenue (deliberate, spaced — the only
// trees allowed near the roads; everything else stays in pockets)
const ALLEE = [[6, 13], [8, 13], [9, 13], [3, 16], [5, 16]];
// courtyard cells — the castle court draws STONE (civic look,
// distinct from the base's dirt trails)
const PLAZA = new Set(
    (() => { const a = []; for (let x = COURT.x0; x <= COURT.x1; x++) for (let y = COURT.y0; y <= COURT.y1; y++) a.push([x, y]); return a; })()
        .map(([x, y]) => `${x},${y}`));

let fontsReady = false;
function ensureFonts() {
    if (fontsReady) return true;
    try {
        const canvas = require('canvas');
        const registerFont = canvas.registerFont || (canvas.GlobalFonts && canvas.GlobalFonts.registerFromPath);
        if (!registerFont) return false;
        for (const [f, o] of [
            ['CinzelDecorative-Black.ttf', { family: 'Cinzel Deco' }],
            ['Cinzel-Variable.ttf', { family: 'Cinzel' }],
            ['MedievalSharp.ttf', { family: 'Medieval' }],
        ]) {
            const p = path.join(FONTS, f);
            if (fs.existsSync(p)) { try { registerFont(p, o); } catch (e) { /* skip */ } }
        }
        fontsReady = true;
        return true;
    } catch (e) { return false; }
}

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

const _img = new Map();
async function img(dir, file) {
    const key = dir + '/' + file;
    if (_img.has(key)) return _img.get(key);
    let out = null;
    try { out = await require('canvas').loadImage(path.join(dir, file)); } catch (e) { out = null; }
    _img.set(key, out);
    return out;
}
const gbImg = (f) => img(GB_ASSETS, f);
const hsImg = (f) => img(HS_ASSETS, f);

function isoX(x, y) { return OX + (x - y) * (TW / 2); }
function isoY(x, y) { return OY + (x + y) * (TH / 2); }
function footCenter(x, y) { return { x: isoX(x, y), y: isoY(x, y) }; }
// sprite bottom anchor so the base diamond sits on its footprint — POLYY
// ART LAW (owner 2026-10-17): anchor = footprint SOUTH CORNER (+4 sink) for
// the new castle/cottage art; megikit training/treasury carry GUILD_AY_BIAS.
function anchorOf(x, y, fw, fh) {
    const c = footCenter(x + fw / 2, y + fh / 2);
    return { cx: c.x, ay: c.y + (fw + fh) * (TH / 4) + 4 };
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

// building plot: rope-fenced site with corner stakes + scaffold frame
function drawPlot(ctx, cx, ay, fw, fh, t) {
    const EW = fw * 32, NS2 = fh * 16;
    const bx = cx, by = ay - 2;
    ctx.save();
    ctx.strokeStyle = 'rgba(120,86,40,0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(bx, by - NS2 * 2);
    ctx.lineTo(bx + EW, by - NS2);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx - EW, by - NS2);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    // corner stakes
    ctx.fillStyle = '#4a2d17';
    for (const [sx, sy] of [[bx, by - NS2 * 2], [bx + EW, by - NS2], [bx, by], [bx - EW, by - NS2]]) {
        ctx.fillRect(sx - 1.5, sy - 16, 3, 16);
    }
    // scaffold A-frame at the middle
    const bounce = Math.sin(t * Math.PI * 2) * 1.2;
    ctx.fillStyle = '#6b4222';
    ctx.fillRect(bx - 14, by - NS2 - 26 + bounce, 4, 26);
    ctx.fillRect(bx + 10, by - NS2 - 26 + bounce, 4, 26);
    ctx.fillStyle = '#8a5a33';
    ctx.fillRect(bx - 16, by - NS2 - 30 + bounce, 32, 4);
    ctx.fillStyle = '#a5744a';
    ctx.fillRect(bx - 10, by - NS2 - 22 + bounce, 20, 3);
    ctx.restore();
}

// archetype props near the hall (drawn at render time — keeps sprites clean)
function drawArchProps(ctx, arch, cx, baseY, t) {
    ctx.save();
    if (arch === 'MERCHANT') {
        // crate stack + market awning hint
        for (const [ox, oy, w, h, c] of [[-58, -12, 22, 16, '#8a5a33'], [-34, -8, 18, 12, '#a5744a'], [-50, -26, 16, 12, '#b8882e']]) {
            ctx.fillStyle = c;
            ctx.fillRect(cx + ox, baseY + oy - h, w, h);
            ctx.strokeStyle = '#4a2d17'; ctx.lineWidth = 1.4;
            ctx.strokeRect(cx + ox, baseY + oy - h, w, h);
            ctx.beginPath(); ctx.moveTo(cx + ox, baseY + oy - h); ctx.lineTo(cx + ox + w, baseY + oy); ctx.stroke();
        }
    } else if (arch === 'RESEARCH') {
        // crystal cluster with glow pulse
        const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
        for (const [ox, hgt, w] of [[-48, 26, 10], [-36, 16, 7], [-58, 12, 6]]) {
            ctx.fillStyle = '#9adce8';
            ctx.beginPath();
            ctx.moveTo(cx + ox - w / 2, baseY - 8);
            ctx.lineTo(cx + ox, baseY - 8 - hgt);
            ctx.lineTo(cx + ox + w / 2, baseY - 8);
            ctx.closePath(); ctx.fill();
        }
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.25 + 0.2 * pulse;
        const g = ctx.createRadialGradient(cx - 46, baseY - 24, 2, cx - 46, baseY - 24, 30);
        g.addColorStop(0, 'rgba(154,220,232,0.8)');
        g.addColorStop(1, 'rgba(154,220,232,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx - 46, baseY - 24, 30, 0, Math.PI * 2); ctx.fill();
    } else {
        // ADVENTURER: practice target
        ctx.fillStyle = '#4a2d17';
        ctx.fillRect(cx - 46, baseY - 26, 3, 26);
        ctx.fillStyle = '#c2a05a';
        ctx.beginPath(); ctx.arc(cx - 44, baseY - 30, 12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#a02c3c';
        ctx.beginPath(); ctx.arc(cx - 44, baseY - 30, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#d4b470';
        ctx.beginPath(); ctx.arc(cx - 44, baseY - 30, 2.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════════
// ONE FRAME
// ═══════════════════════════════════════════════════════════════════════════
async function renderFrame(state, frame, opts = {}) {
    ensureFonts();
    // SS OVERRIDE (Task 37 speed round, owner "increase processing speed for
    // gif and card"): animated bakes render at ss=1 — the mp4 target was
    // ALWAYS half-res (ART_W x ART_H), so an SS=2 raw frame was a 4x-more-
    // pixels render whose pixels ffmpeg immediately threw half away. Static
    // cards render at GUILD_STATIC_SS (1.5) — still supersampled for the
    // 2560px JPEG out, 44% fewer pixels than SS=2.
    const ss = Math.max(0.5, Math.min(4, parseFloat(opts.ss) || SS));
    const canvas = require('canvas').createCanvas(ART_W * ss, ART_H * ss);
    const ctx = canvas.getContext('2d');
    ctx.scale(ss, ss);
    ctx.imageSmoothingEnabled = false;

    const seed = hashStr(state.name || 'guild');
    const t = frame / FRAMES;
    const arch = ARCH[state.archetype] ? state.archetype : 'ADVENTURER';
    const archCol = ARCH[arch];
    const flagCol = (state.emblemColor && /^#[0-9a-fA-F]{3,8}$/.test(state.emblemColor)) ? state.emblemColor : archCol.flag;
    const flagD = archCol.flagD;

    // ── FOREST LAW (owner 2026-10-16 11:57Z): no sky — deep forest wall ──
    await isoForest.paintBackdrop(ctx, ART_W, ART_H, frame, FRAMES, isoY(0, 0) - 16, isoY(N - 1, N - 1) + 16);

    // ── terrain — mossy forest floor, GUILD v4: stone courtyard, west gate
    // road, per-player procedural outlands beyond the fence ──
    const grass = ['forest_moss_a.png', 'forest_moss_b.png', 'forest_moss_c.png'];
    const waterF = frame % 4 < 2 ? 'forest_water_0.png' : 'forest_water_1.png';
    const M = 36; // full coverage to the card corners (v6: the M=12 field
                  // diamond fell short of the 2560x1500 card corners and the
                  // backdrop showed through as hard dark triangles — owner
                  // "the background looks weird again". Covering a card this
                  // tall needs y_max ~ 61 -> M = 36; the per-cell screen cull
                  // keeps the extra iterations cheap.)
    const outlands = isoOutlands.outlandProps({ seedStr: state.name || 'guild', N, P, isoX, isoY, M, OX, OY, gates: [[-P, 14], [-P, 15]] });
    const wildTile = new Map(outlands.tiles.map((t) => [`${t.x},${t.y}`, t.tile]));
    // ── STONE WALKWAY LAW (owner 2026-10-17, g6 live render: "add walk ways
    // like the one in this image ... generate walk ways with stone ... not
    // the old shit you had, leave the existing dirt ground walk ways
    // alongside it for more detail"): roads + civic stone bake as COBBLE
    // (forest_cobble_a/b/c, seeded per cell so long runs never visibly
    // repeat), and the old dirt trail stays alive as WORN SHOULDERS hugging
    // every road + the wild-side gate stub fading out.
    const COBBLE = ['forest_cobble_a.png', 'forest_cobble_b.png', 'forest_cobble_c.png'];
    const pathSet = new Set((PATHS || []).map(([x, y]) => `${x},${y}`));
    const shoulder = new Set();
    for (const [px, py] of PATHS || []) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const k = `${px + dx},${py + dy}`;
            if (!pathSet.has(k) && !PLAZA.has(k)) shoulder.add(k);
        }
    }
    // ── PER-BAKE TERRAIN LAYER (shutdown fix, part 2): the tiles+trail+rim
    // plane is frame-independent except the 2-state water shimmer, so an
    // animated bake paints it ONCE per state instead of 14x (the
    // 2560x1500 guild bake measured 70s of tile redraws). Bakes pass an
    // opts.terrainLayers store; single-frame callers get a transient layer
    // that is GC'd after the blit — behaviour identical either way.
    const layerStore = opts.terrainLayers || null;
    let ground = layerStore ? layerStore[waterF] : null;
    if (!ground) {
        ground = require('canvas').createCanvas(ART_W * ss, ART_H * ss);
        const g = ground.getContext('2d');
        g.scale(ss, ss);
        g.imageSmoothingEnabled = false;
        if (layerStore) layerStore[waterF] = ground;
        const TCTX = g;   // terrain target for this block
    for (let x = -M; x < N + M; x++) {
        for (let y = -M; y < N + M; y++) {
            const px = isoX(x, y), py = isoY(x, y);
            if (px < -TW || px > ART_W + TW || py < -TH || py > ART_H + TH) continue;
            const r = mulberry32(seed + (x + 40) * 131 + (y + 40) * 17)();
            const r2 = mulberry32(seed + (x + 40) * 131 + (y + 40) * 17 + 7)();
            const inside = x >= 0 && y >= 0 && x < N && y < N;
            const inFence = x >= -P && x <= N - 1 + P && y >= -P && y <= N - 1 + P;
            let tile;
            if (inside) {
                if (PLAZA.has(`${x},${y}`)) tile = r2 < 0.2 ? 'forest_rock_tile.png' : COBBLE[Math.floor(r2 * 13) % 3];  // civic cobble
                else if (pathSet.has(`${x},${y}`)) tile = COBBLE[Math.floor(r2 * 13) % 3];                             // stone walkway
                else if (shoulder.has(`${x},${y}`) && r2 < 0.5) tile = 'forest_trail.png';                             // worn dirt shoulder
                else tile = r < 0.07 ? 'forest_moss_shrooms.png' : grass[Math.floor(r * 3) % 3];
            } else if (inFence) {
                // the yard — tamed meadow inside the palisade; the gate road
                // cobbles across the yard so the walk reads gate-to-hub
                const isGateRoad = (y === 14 || y === 15) && x >= -P && x < 0;
                if (isGateRoad) tile = COBBLE[Math.floor(r2 * 13) % 3];
                else tile = r < 0.04 ? 'forest_moss_shrooms.png' : grass[Math.floor(r * 3) % 3];
            } else {
                const wt = wildTile.get(`${x},${y}`);
                if (wt === 'water') tile = waterF;
                else if (wt) tile = wt;
                else tile = grass[Math.floor(r * 3) % 3];
            }
            const timg = await hsImg(tile);
            if (timg) TCTX.drawImage(timg, px - TW / 2, py - TH / 2);
        }
    }
    // west gate trail: the road leaves through the west palisade — cobble
    // apron at the gate mouth, then the old dirt walk fading into the
    // per-player wilds (owner: keep the dirt alongside the stone for detail)
    {
        const trailImg = await hsImg('forest_trail.png');
        const cob0 = await hsImg(COBBLE[0]);
        const cob1 = await hsImg(COBBLE[1]);
        if (trailImg) {
            const trailCells = [[-P, 14], [-P - 1, 14], [-P - 2, 14], [-P - 3, 13], [-P - 4, 13],
                                [-P, 15], [-P - 1, 15], [-P - 2, 15], [-P - 3, 16], [-P - 4, 16]];
            for (const [tx, ty] of trailCells) {
                const stone = tx >= -P - 1;
                const im = stone ? ((tx + ty) % 2 === 0 ? cob0 : cob1) : trailImg;
                if (im) TCTX.drawImage(im, isoX(tx + 0.5, ty + 0.5) - TW / 2, isoY(tx + 0.5, ty + 0.5) - TH / 2);
            }
        }
    }
    // playable-area rim — SOFT moss shadow (matches the base's law)
    TCTX.strokeStyle = 'rgba(24,32,14,0.22)';
    TCTX.lineWidth = 3;
    TCTX.beginPath();
    TCTX.moveTo(isoX(0, N), isoY(0, N));
    TCTX.lineTo(isoX(N, N), isoY(N, N));
    TCTX.lineTo(isoX(N, 0), isoY(N, 0));
    TCTX.stroke();
    }
    ctx.drawImage(ground, 0, 0, ART_W, ART_H);

    // ── wild haze floor wash — clipped to the FENCE diamond: the yard stays
    // bright and tamed; only the procedural wilds beyond the palisade recede
    ctx.save();
    ctx.beginPath();
    ctx.rect(-8, -8, ART_W + 16, ART_H + 16);
    ctx.moveTo(isoX(-P, -P), isoY(-P, -P));
    ctx.lineTo(isoX(N + P, -P), isoY(N + P, -P));
    ctx.lineTo(isoX(N + P, N + P), isoY(N + P, N + P));
    ctx.lineTo(isoX(-P, N + P), isoY(-P, N + P));
    ctx.closePath();
    ctx.clip('evenodd');
    const hz = ctx.createLinearGradient(0, isoY(-P, -P) - 60, 0, isoY(N + P, N + P) + 30);
    hz.addColorStop(0, 'rgba(18,28,14,0.38)');
    hz.addColorStop(0.5, 'rgba(24,36,16,0.26)');
    hz.addColorStop(1, 'rgba(12,20,10,0.44)');
    ctx.fillStyle = hz;
    ctx.fillRect(0, 0, ART_W, ART_H);
    ctx.restore();

    // scattered vegetation — GUILD v6 THINNING LAW (owner: "too many trees"):
    // the interior is a MANICURED citadel ground — roads get a 1-tile
    // clearcut either side, the plots + castle keep wide lawns, and the
    // remaining trees live in a few edge pockets + the planted avenue
    // allée. Understory still dresses the open ground.
    const occupied = new Set();
    for (const st of Object.values(GUILD_STRUCTS)) {
        // 1-tile clearing margin (front-shadow law handles the faces now)
        for (let ix = -1; ix <= st.fw; ix++) for (let iy = -1; iy <= st.fh; iy++) occupied.add(`${st.x + ix},${st.y + iy}`);
    }
    // the castle sprite spills ~3 tiles past its 4x4 footprint — a hot-ring
    // tree on the apron or the south lawn drew OVER the keep's front wall
    // (v6 fix): 2-ring around the hall + the whole front lawn stays clear
    {
        const hall = GUILD_STRUCTS.hall;
        for (let ix = -2; ix <= hall.fw + 2; ix++) for (let iy = -2; iy <= hall.fh + 2; iy++) occupied.add(`${hall.x + ix},${hall.y + iy}`);
        for (let ix = -2; ix <= hall.fw + 2; ix++) for (let iy = hall.fh + 1; iy <= hall.fh + 4; iy++) occupied.add(`${hall.x + ix},${hall.y + iy}`);
    }
    // nothing plants on the civic stone (hub roundabout + citadel apron)
    for (const key of PLAZA) occupied.add(key);
    for (const [px, py] of PATHS) {
        occupied.add(`${px},${py}`);
        // road clearcut: nothing plants against the spokes (roads must READ)
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) occupied.add(`${px + dx},${py + dy}`);
    }
    for (const [px, py] of ALLEE) occupied.add(`${px},${py}`);
    for (const [px, py] of COTTAGE_SLOTS) {
        // 3-wide, 4-deep clearing so member cottages never hide behind trees
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 2; dy++) occupied.add(`${px + dx},${py + dy}`);
    }
    // archetype-prop lawn west of the court, off the avenue's south shoulder
    for (let ax = 6; ax <= 8; ax++) for (let ay = 16; ay <= 18; ay++) occupied.add(`${ax},${ay}`);
    // house-plot cells + 1 ring stay clear (the plots are the build sites)
    const plotCells = new Set();
    for (const plot of GUILD_PLOTS) {
        for (let ix = -1; ix < 4; ix++) for (let iy = -1; iy < 4; iy++) plotCells.add(`${plot.x + ix},${plot.y + iy}`);
    }
    const props = [];
    {
        // hot = ring around the castle (a few trees by the walls, thinned)
        const hall = GUILD_STRUCTS.hall;
        const hot = [];
        for (let hx = hall.x - 1; hx <= hall.x + hall.fw; hx++) {
            for (let hy = hall.y - 1; hy <= hall.y + hall.fh; hy++) {
                if (hx >= hall.x && hx < hall.x + hall.fw && hy >= hall.y && hy < hall.y + hall.fh) continue;
                hot.push([hx, hy]);
            }
        }
        const forestProps = isoForest.islandForest({
            seed, N, isoX, isoY,
            occupied,
            paths: PATHS || [],
            hot,
            plotCells,
            midRate: 0.03,  // owner 2026-10-17 21:18Z: "remove most of the trees from the guild area too" — interior is garnish now
            hotRate: 0.04,  // v6 0.16/0.22 → v9.2 0.12/0.14 → v10 0.03/0.04 (the compound reads open; the woodland lives in the outlands)
            margin: false, // outside the fence is the outlands module's domain
            haze: false,
            structFoots: Object.values(GUILD_STRUCTS).map((st) => [st.x, st.y, st.fw, st.fh]),
        });
        for (const f of forestProps) {
            const im = f.tint ? await isoForest.tinted(f.file, f.tint, f.sc || 1) : await hsImg(f.file);
            if (im) props.push({ img: im, x: f.x, y: f.y, sc: f.tint ? 1 : (f.sc || 1) });
        }
        // planted allée along the citadel avenue — deliberate, spaced, full
        // scale (the one place trees are WANTED near a road)
        {
            const ringTrees = isoForest.RING_TREES;
            for (let i = 0; i < ALLEE.length; i++) {
                const [ax2, ay2] = ALLEE[i];
                const r = mulberry32(seed + 9100 + i)();
                const file = ringTrees[Math.floor(r * ringTrees.length) % ringTrees.length];
                const im = await hsImg(file);
                if (im) props.push({ img: im, x: isoX(ax2 + 0.5, ay2 + 0.5), y: isoY(ax2 + 0.5, ay2 + 0.5) + 6, sc: 1.0 });
            }
        }
        // PER-PLAYER OUTLANDS PROPS — biome placements beyond the fence
        for (const f of outlands.props) {
            const im = f.tint ? await isoForest.tinted(f.file, f.tint, f.sc || 1) : await hsImg(f.file);
            if (im) props.push({ img: im, x: f.x, y: f.y, sc: f.tint ? 1 : (f.sc || 1) });
        }
        // pixel fence ring — pushed OUTWARD by P tiles, gate on the WEST edge
        // where the civic road leaves the grounds (-P, 14 / -P, 15)
        for (const seg of isoForest.fenceRing(N, isoX, isoY, [[-P, 14], [-P, 15]], P)) {
            const fim = await hsImg(seg.file);
            if (fim) props.push({ img: fim, x: seg.x, y: seg.y, sc: 1 });
        }
    }

    // ── guild structures (hall / training / treasury; L0 = plot) ──
    const structs = [];
    for (const st of Object.values(GUILD_STRUCTS)) {
        const lvl = Math.max(0, Math.min(5, parseInt((state.buildings || {})[st.id], 10) || 0));
        if (lvl <= 0) {
            structs.push({ kind: 'plot', st, lvl: 0 });
            continue;
        }
        const lv = st.levels.find((l) => l.level === lvl) || st.levels[0];
        structs.push({ kind: 'struct', st, lvl, lv });
    }

    const drawables = [];
    for (const s of structs) {
        if (s.kind === 'plot') {
            drawables.push({ kind: 'plot', st: s.st, order: s.st.x + s.st.y });
            continue;
        }
        const spr = await gbImg(`${s.lv.sprite}.png`);
        if (!spr) continue;
        const { cx, ay } = anchorOf(s.st.x, s.st.y, s.st.fw, s.st.fh);
        const sc = GUILD_SCALE[s.st.id] || 1;
        const bias = GUILD_AY_BIAS[s.st.id] || 0;
        drawables.push({ kind: 'struct', st: s.st, lvl: s.lvl, lv: s.lv, spr, cx, ay: ay + bias, w: spr.width * sc, h: spr.height * sc, sc, order: s.st.x + s.st.y });
    }
    // member cottages — POLYY ART LAW: each member house is a different
    // village building (gb_cottage_a..d cycling), south-corner anchored,
    // COTTAGE_SCALE 0.7 (owner: houses were reading bigger than the castle)
    const nCottages = Math.max(0, Math.min(COTTAGE_SLOTS.length, parseInt(state.memberCount, 10) || 0));
    const COTTAGE_SPRITES = ['gb_cottage_a.png', 'gb_cottage_b.png', 'gb_cottage_c.png', 'gb_cottage_d.png'];
    const cottages = [];
    for (let i = 0; i < nCottages; i++) {
        const [cxx, cyy] = COTTAGE_SLOTS[i];
        const { cx, ay } = anchorOf(cxx, cyy, 1.35, 1.35);
        const spr = await gbImg(COTTAGE_SPRITES[i % COTTAGE_SPRITES.length]);
        cottages.push({ cx, ay, spr, sc: COTTAGE_SCALE });
    }
    // props merge into the depth pass
    const all = [
        ...props.map((p) => ({ kind: 'prop', x: p.x, y: p.y, img: p.img })),
        ...cottages.map((c) => ({ kind: 'cottage', x: c.cx, y: c.ay, spr: c.spr, sc: c.sc })),
        ...drawables,
    ].sort((a, b) => (a.y ?? (a.ay ?? 0)) - (b.y ?? (b.ay ?? 0)));

    // shadows first
    for (const d of all) {
        if (d.kind === 'prop') {
            if (d.img && d.img.height * (d.sc || 1) > 26) isoShadow.drawItemShadow(ctx, { img: d.img, key: `p${d.x}|${d.y}`, scale: d.sc || 1, ax: d.x, ay: d.y + 2, alpha: 0.8 });
        } else if (d.kind === 'cottage') {
            if (d.spr) isoShadow.drawItemShadow(ctx, { img: d.spr, key: `c${d.x}|${d.y}`, scale: d.sc || 1, ax: d.x, ay: d.y + 2, alpha: 0.9 });
        } else if (d.kind === 'struct') {
            isoShadow.drawItemShadow(ctx, { img: d.spr, key: `${d.st.id}_${d.lvl}`, scale: d.sc || 1, ax: d.cx, ay: d.ay, alpha: 1 });
        }
    }
    // sprites
    for (const d of all) {
        if (d.kind === 'prop') {
            // pixel-snap + scale-aware (honours the forest's sc field)
            const pw = d.img.width * (d.sc || 1), ph = d.img.height * (d.sc || 1);
            ctx.drawImage(d.img, (d.x - pw / 2) | 0, (d.y - ph) | 0, pw | 0, ph | 0);
        } else if (d.kind === 'cottage') {
            if (d.spr) {
                const cw = d.spr.width * (d.sc || 1), ch = d.spr.height * (d.sc || 1);
                ctx.drawImage(d.spr, d.x - cw / 2, d.y - ch, cw, ch);
            }
        } else if (d.kind === 'struct') {
            ctx.drawImage(d.spr, d.cx - d.w / 2, d.ay - d.h);
        } else if (d.kind === 'plot') {
            drawPlot(ctx, anchorOf(d.st.x, d.st.y, d.st.fw, d.st.fh).cx, anchorOf(d.st.x, d.st.y, d.st.fw, d.st.fh).ay, d.st.fw, d.st.fh, t);
        }
    }

    // ── guild house plot markers (floor annotations, post-depth so the
    // forest never buries them) ──
    {
        const plotImg = await hsImg('base_plot_marker.png');
        if (plotImg) {
            for (const plot of GUILD_PLOTS) {
                const c = footCenter(plot.x + 1.5, plot.y + 1.5);
                const bob = Math.sin((frame / FRAMES) * Math.PI * 2 + plot.id) * 1.2;
                ctx.save();
                ctx.globalAlpha = 0.88;
                ctx.drawImage(plotImg, c.x - plotImg.width / 2, isoY(plot.x + 1.5, plot.y + 1.5) - plotImg.height / 2 + bob);
                ctx.font = '15px Medieval, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillStyle = 'rgba(35,25,12,0.9)';
                ctx.fillText(`PLOT ${plot.id}`, c.x, isoY(plot.x + 1.5, plot.y + 1.5) + 5 + bob);
                ctx.fillStyle = '#f2e2b8';
                ctx.fillText(`PLOT ${plot.id}`, c.x, isoY(plot.x + 1.5, plot.y + 1.5) + 4 + bob);
                ctx.restore();
            }
        }
    }

    // ── archetype props on the west lawn (framing the grand avenue) ──
    const apX = isoX(7, 17), apY = isoY(7, 17) + 8; // lawn off the avenue's south shoulder
    drawArchProps(ctx, arch, apX, apY + 8, t);

    // ── GUILD BANNER — floats above the keep (owner msg 1561155345102151774:
    // "structured like a kingdom with the guild banner floating on top of
    // the castle"): heraldic swallowtail cloth hovering over the castle's
    // roofline — slow hover bob + cloth wave, emblem colour, gold finial
    // orb with a soft glow pulse. Replaces the old gate-road pole banner. ──
    {
        const hallD = drawables.find((d) => d.kind === 'struct' && d.st.id === 'hall');
        const ha = anchorOf(GUILD_STRUCTS.hall.x, GUILD_STRUCTS.hall.y, GUILD_STRUCTS.hall.fw, GUILD_STRUCTS.hall.fh);
        const bx = ha.cx;
        const topY = hallD ? (hallD.ay - hallD.h) : (ha.ay - 110);
        const bob = Math.sin(t * Math.PI * 2) * 3.2;
        const wave = Math.sin(t * Math.PI * 2 + 0.9) * 3.4;
        const wave2 = Math.sin(t * Math.PI * 2 + 2.1) * 2.2;
        const bw = 52, bh = 72;
        const x0 = bx - bw / 2, y0 = topY - bh - 20 + bob;
        const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
        // gold glow halo
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.15 + 0.10 * pulse;
        const gg = ctx.createRadialGradient(bx, y0 + bh / 2, 4, bx, y0 + bh / 2, 78);
        gg.addColorStop(0, 'rgba(255,214,120,0.9)');
        gg.addColorStop(1, 'rgba(255,214,120,0)');
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(bx, y0 + bh / 2, 78, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // swallowtail cloth
        ctx.fillStyle = flagCol;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(bx, y0 - 6 + wave2, x0 + bw, y0 + wave2);
        ctx.lineTo(x0 + bw, y0 + bh - 14 + wave);
        ctx.lineTo(x0 + bw / 2, y0 + bh + wave2 * 0.5);
        ctx.lineTo(x0, y0 + bh - 14 + wave);
        ctx.closePath();
        ctx.fill();
        // top shading band
        ctx.fillStyle = 'rgba(0,0,0,0.20)';
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(bx, y0 - 6 + wave2, x0 + bw, y0 + wave2);
        ctx.lineTo(x0 + bw, y0 + 16 + wave2);
        ctx.quadraticCurveTo(bx, y0 + 10 + wave2 * 0.6, x0, y0 + 14);
        ctx.closePath();
        ctx.fill();
        // cloth border
        ctx.strokeStyle = 'rgba(35,20,10,0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(bx, y0 - 6 + wave2, x0 + bw, y0 + wave2);
        ctx.lineTo(x0 + bw, y0 + bh - 14 + wave);
        ctx.lineTo(x0 + bw / 2, y0 + bh + wave2 * 0.5);
        ctx.lineTo(x0, y0 + bh - 14 + wave);
        ctx.closePath();
        ctx.stroke();
        // emblem
        if (state.emblemIcon) {
            ctx.font = '26px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#f2e2b8';
            ctx.fillText(String(state.emblemIcon).slice(0, 2), bx, y0 + bh / 2 + 4 + wave * 0.3);
        }
        // gold finial orb floating over the cloth
        ctx.fillStyle = '#e8b84a';
        ctx.beginPath(); ctx.arc(bx, y0 - 10 + bob * 0.6, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,240,180,0.9)';
        ctx.beginPath(); ctx.arc(bx - 1.2, y0 - 11.2 + bob * 0.6, 1.4, 0, Math.PI * 2); ctx.fill();
    }

    // ── ambient animation ──
    // hall smoke (L3+)
    const hallD = drawables.find((d) => d.st.id === 'hall');
    if (hallD && hallD.lvl >= 3) {
        ctx.save();
        for (let i = 0; i < 3; i++) {
            const ph = (t + i / 3) % 1;
            ctx.globalAlpha = 0.30 * (1 - ph);
            ctx.fillStyle = '#e8e4da';
            ctx.beginPath();
            ctx.ellipse(hallD.cx + 34 + Math.sin(ph * 5 + i) * 8, hallD.ay - hallD.h + 26 - ph * 46, 4 + ph * 10, 3 + ph * 7, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
    // treasury sparkle (L2+)
    const treasD = drawables.find((d) => d.st.id === 'treasury');
    if (treasD && treasD.lvl >= 2) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
            const ph = (t * 1.6 + i / 3) % 1;
            ctx.globalAlpha = 0.65 * Math.sin(ph * Math.PI);
            ctx.fillStyle = '#ffe9a8';
            const sx = treasD.cx + Math.sin(i * 2.1 + t * 6.28) * 26;
            const sy = treasD.ay - 26 - ph * 18;
            ctx.beginPath(); ctx.arc(sx, sy, 1.8, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }
    // training glint (L2+): sword flash over the ring
    const trainD = drawables.find((d) => d.st.id === 'training');
    if (trainD && trainD.lvl >= 2) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const ph = (t * 2) % 1;
        if (ph < 0.25) {
            ctx.globalAlpha = 1 - ph * 4;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            const gx = trainD.cx - 30, gy = trainD.ay - 46;
            ctx.beginPath(); ctx.moveTo(gx, gy - 10); ctx.lineTo(gx + 9, gy + 2); ctx.stroke();
        }
        ctx.restore();
    }
    // fireflies
    ctx.save();
    for (let i = 0; i < 6; i++) {
        const r1 = mulberry32(seed + 3000 + i)();
        const ph = (t + r1) % 1;
        ctx.globalAlpha = 0.5 * Math.sin(ph * Math.PI);
        ctx.fillStyle = '#ffe9a8';
        ctx.beginPath();
        ctx.arc(OX + (r1 - 0.5) * 2000, OY + 380 + (i % 4) * 170 - ph * 30, 1.6, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // vignette
    const vg = ctx.createRadialGradient(OX, OY + 560, 620, OX, OY + 560, 1500);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(20,14,6,0.42)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, ART_W, ART_H);

    drawHud(ctx, state, opts);
    // RAW ENCODER — see homesteadBaseRenderer (owner 2026-10-17 '.j base
    // shuts down'): the 2560x1500 guild card's sync PNG encode is even
    // heavier than the base's; animated guild bakes render raw BGRA frames.
    if (opts.encoder === 'raw') {
        return { raw: canvas.toBuffer('raw'), w: canvas.width, h: canvas.height };
    }
    // RETURN-CANVAS (Task 36 memory round) — internal callers encode the
    // finished art themselves (downscale + JPEG); skipping the full-res PNG
    // encode saves ~2-4s AND the ~4.4MB PNG buffer it allocates.
    if (opts.returnCanvas) return canvas;
    return canvas.toBuffer('image/png');
}

// ── HUD plate ──
function drawHud(ctx, state, opts) {
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

    const arch = ARCH[state.archetype] ? state.archetype : 'ADVENTURER';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e8d5a3';
    ctx.font = '26px "Cinzel Deco", Cinzel';
    ctx.textAlign = 'left';
    ctx.fillText(`${state.emblemIcon ? state.emblemIcon + ' ' : ''}${String(state.name || 'Guild').slice(0, 20)}`, x0 + 26, y0 + 34);
    ctx.font = '16px Medieval';
    ctx.fillStyle = '#9c8455';
    ctx.fillText(`${ARCH[arch].label} Guild · Level ${state.level || 1}`, x0 + 26, y0 + 60);

    // right side: members + three building chips
    ctx.textAlign = 'center';
    ctx.font = '20px Cinzel';
    ctx.fillStyle = '#e8d5a3';
    ctx.fillText(`${state.memberCount || 0}/${state.memberCap || '?'}`, x0 + Wp - 84, y0 + 34);
    ctx.font = '13px Medieval';
    ctx.fillStyle = '#9c8455';
    ctx.fillText('MEMBERS', x0 + Wp - 84, y0 + 56);

    const chips = [
        ['CASTLE', (state.buildings || {}).hall],
        ['TRAINING', (state.buildings || {}).training],
        ['TREASURY', (state.buildings || {}).treasury],
    ];
    let chipX = x0 + Wp - 250;
    for (const [label, lvl] of chips) {
        const built = (parseInt(lvl, 10) || 0) > 0;
        ctx.fillStyle = built ? 'rgba(166,124,46,0.25)' : 'rgba(90,70,40,0.35)';
        roundRect(ctx, chipX - 52, y0 + 22, 100, 40, 8);
        ctx.fill();
        ctx.font = '16px Cinzel';
        ctx.fillStyle = built ? '#e8d5a3' : '#7a663f';
        ctx.fillText(`${label} ${built ? `L${lvl}` : '—'}`, chipX - 2, y0 + 43);
        chipX -= 116;
    }

    ctx.textAlign = 'center';
    ctx.font = '15px Medieval';
    ctx.fillStyle = '#7a663f';
    const foot = opts.hint || (state.motto ? `\u201C${String(state.motto).slice(0, 70)}\u201D` : `${PREFIX} guild upgrade hall \u2022 ${PREFIX} guild donate \u2022 ${PREFIX} guild perks`);
    ctx.fillText(foot, x0 + Wp / 2, y0 + H - 24);
    ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC: static view PNG (default) or celebrate mp4-gif
// ═══════════════════════════════════════════════════════════════════════════
async function encodeFramesToMp4(frames) {
    const ffmpeg = require('fluent-ffmpeg');
    try { ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH || 'ffmpeg'); } catch (e) { /* engine sets it too */ }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gbase-'));
    const out = path.join(tmp, 'gbase.mp4');
    try {
        // RAW PATH — BGRA memcpy frames skip the giant PNG round-trip.
        // Direct spawn (NOT fluent-ffmpeg — it silently hung on the rawvideo
        // input; see homesteadBaseRenderer).
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
                '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '23',
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
                    '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '23',
                    '-movflags', '+faststart', '-an', '-y',
                ])
                .output(out)
                .on('end', resolve)
                .on('error', reject)
                .run();
        });
        return fs.readFileSync(out);
    } finally {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
    }
}

// OUT ENCODER (Task 36: owner "the guild area is 5mb+ in size???? Yhh that
// won't do") — the guild card ships DOWNSCALED + JPEG instead of the full-res
// SS=2 PNG: the 5120x3000 art canvas encoded a ~4.4MB PNG (plus a ~1.4x
// base64 copy in the send path, plus every entry parked in the hot render
// cache). Phones never show more than ~1200px — downscale to OUT_MAX_W and
// encode JPEG q0.88: visually identical in-app, ~0.8-1.1MB.
const OUT_MAX_W = Math.max(640, parseInt(process.env.RENDER_OUT_MAX_W || '2560', 10) || 2560);
const OUT_JPEG_Q = Math.min(0.95, Math.max(0.5, parseFloat(process.env.RENDER_OUT_JPEG_Q || '0.88') || 0.88));
// GUILD STATIC SS (Task 37 speed round) — 1.5 keeps the downscale-to-2560
// supersampling benefit while cutting static render pixels 44% vs SS=2.
const GUILD_STATIC_SS = Math.max(1, Math.min(2, parseFloat(process.env.RENDER_GUILD_STATIC_SS || '1.5') || 1.5));
function encodeOut(canvas) {
    let c = canvas;
    if (canvas.width > OUT_MAX_W) {
        const h = Math.round(canvas.height * OUT_MAX_W / canvas.width);
        c = require('canvas').createCanvas(OUT_MAX_W, h);
        c.getContext('2d').drawImage(canvas, 0, 0, OUT_MAX_W, h);
    }
    return { buffer: c.toBuffer('image/jpeg', OUT_JPEG_Q), contentType: 'image/jpeg' };
}

// HOT CACHE BYTE CAP (Task 36: "why are there such large memory spikes?") —
// the old cap was 120 ENTRIES; at multi-MB cards that is half a GB of
// resident buffers. Cap by bytes instead (oldest evicted first).
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

const _renderCache = new Map();
const CACHE_TTL = 10 * 60 * 1000;
function stateHash(state, opts = {}) {
    return hashStr(JSON.stringify([state.name, state.level, state.archetype, state.buildings, state.memberCount, state.memberCap, state.emblemColor, state.emblemIcon, state.motto, opts.hint || '', opts.static ? 1 : 0]));
}

// EVENT-LOOP BREATH — real timers between frames keep the canary heartbeat
// alive during an animated bake (microtask yields don't feed timers).
const FRAME_BREATH_MS = 8;
const breath = () => new Promise((r) => setTimeout(r, FRAME_BREATH_MS));

async function renderGuildBaseImage(state, opts = {}) {
    const key = stateHash(state, opts);
    const hit = _renderCache.get(key);
    if (hit && (Date.now() - hit.ts) < CACHE_TTL) return hit;
    const out = await mediaCache.cached('guildbase', key, async () => {
        // static card (default): render once at 1.5x supersample, downscale +
        // JPEG — no full-res PNG encode, no 4.4MB buffer, 44% fewer pixels
        if (opts.static !== false) return encodeOut(await renderFrame(state, 0, { ...opts, returnCanvas: true, ss: GUILD_STATIC_SS }));
        // animated bake (celebrate): STREAMING raw frames — the old loop held
        // all 14 SS=2 raw frames (~61MB each = ~860MB resident) before the
        // encode even started. Feed ffmpeg's stdin as frames render:
        // render f -> pipe -> release -> render f+1.
        const layers = {};
        try {
            const fbin = process.env.FFMPEG_PATH || 'ffmpeg';
            const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gbase-'));
            const outFile = path.join(tmp, 'gbase.mp4');
            try {
                const f0 = await renderFrame(state, 0, { ...opts, encoder: 'raw', ss: 1, terrainLayers: layers });
                await breath();
                const { w, h } = f0;
                const args = [
                    '-f', 'rawvideo', '-pix_fmt', 'bgra', '-video_size', `${w}x${h}`,
                    '-framerate', `${1000 / FRAME_MS}`, '-i', 'pipe:0',
                    // even-dim guard (no-op on even input) — replaces the old
                    // half-res scale: ss=1 frames ARE the mp4 target size now
                    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
                    '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0',
                    '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '23',
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
                            const fr = await renderFrame(state, f, { ...opts, encoder: 'raw', ss: 1, terrainLayers: layers });
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
            console.error('[guildBaseRenderer] mp4 encode failed, JPEG fallback:', e.message);
        }
        return encodeOut(await renderFrame(state, 0, { ...opts, returnCanvas: true }));  // fallback card
    });
    cachePut(_renderCache, key, out);
    return out;
}

module.exports = { GUILD_STRUCTS, GUILD_PLOTS, ARCH, PATHS, COTTAGE_SLOTS, ALLEE, PLAZA, FRAMES, renderFrame, renderGuildBaseImage, encodeFramesToMp4 };
