'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  GUILD BASE RENDERER — outdoor isometric guild grounds
//  GUILD v5 SCALE LAW (owner 2026-10-17 "still the same size as a regular
//  base... should be wayyy bigger — space inside the walls and outside
//  double, maybe triple"): 28x28 playable diamond (3x the base's 16x16
//  tile count), 5-tile tamed yard band outside the palisade, canvas grows
//  with the grounds. Same visual law as homesteadBaseRenderer.js: grass
//  tiles, isoShadow grounding, back-to-front depth sort, ambient animation.
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
// GUILD v5 SCALE LAW (owner 2026-10-17 "the space inside the walls and
// outside should be double the size maybe triple"): the whole v4 west-gate
// plan (Polyy RTS castles gb_castle_l1..l5) spreads across the 28x28
// grounds — road enters from the west, crosses a stone courtyard to the
// CASTLE dead-center, training holds the NE corner, treasury the SE,
// member cottages line the south meadow, four build plots sit NW / N / SW / E.
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
        x: 22, y: 4,
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
        x: 24, y: 25,
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
// locations to build all the various houses") — four 3x3 marked expansion
// sites ringing the castle on the v4 diagonal/axis plan.
const GUILD_PLOTS = [
    { id: 1, x: 3, y: 3 },   // NW
    { id: 2, x: 14, y: 2 },  // N (north meadow, clear of the training spur)
    { id: 3, x: 3, y: 22 },  // SW
    { id: 4, x: 23, y: 14 }, // E (east arm terminus)
];

// per-structure draw scale — ALL guild art now pre-scaled to footprint
// (POLYY ART LAW, same as the castle/cottages; training = military re-pick
// stable/shed/gatehouse/siege tower/hall, treasury l3 = granary staddle).
const GUILD_SCALE = { training: 1.0, treasury: 0.9 };
const GUILD_AY_BIAS = {};

// FENCE PAD — v5 scale law: the OUTSIDE band grows too (owner: "the space
// inside the walls and outside should be double the size maybe triple").
const P = 5;

const ARCH = {
    ADVENTURER: { flag: '#a02c3c', flagD: '#7c1e2c', label: 'Adventurers' },
    MERCHANT: { flag: '#b8862e', flagD: '#8a6420', label: 'Merchants' },
    RESEARCH: { flag: '#2a6a6e', flagD: '#1e4e52', label: 'Research' },
};

// cottage slots along the south meadow (member housing visual; clear of the
// SW plot, treasury and the south path arm). POLYY ART LAW: each slot draws
// a DIFFERENT village-building sprite (gb_cottage_a..d, cycling).
const COTTAGE_SLOTS = [[12, 24], [16, 24], [10, 26], [14, 26], [21, 25]];
// GUILD PATHS v5 — west-gate civic plan at full scale: gate road crosses the
// grounds to a STONE courtyard apron around the castle, spurs reach training
// (NE), the east plot and the treasury (SE), and a south arm serves the
// cottages.
const PATHS = [
    // west gate road (gate sits on the west fence edge at y=14)
    [0, 14], [1, 14], [2, 14], [3, 14], [4, 14], [5, 14], [6, 14], [7, 14], [8, 14], [9, 14],
    // stone courtyard apron around the castle (footprint 12-15 x 12-15)
    [10, 10], [11, 10], [12, 10], [13, 10], [14, 10], [15, 10], [16, 10], [17, 10],
    [10, 11], [10, 12], [10, 13], [10, 14], [10, 15], [10, 16],
    [17, 11], [17, 12], [17, 13], [17, 14], [17, 15], [17, 16],
    [10, 17], [11, 17], [12, 17], [13, 17], [14, 17], [15, 17], [16, 17], [17, 17],
    // north spur to training (NE corner)
    [18, 12], [19, 12], [20, 12], [21, 12], [21, 11], [21, 10], [21, 9], [21, 8], [21, 7], [21, 6], [21, 5],
    // east arm to plot 4
    [18, 14], [19, 14], [20, 14], [21, 14], [22, 14],
    // treasury spur (SE) — drops to the treasury pocket in the SE foreground
    // (kept clear of the castle's south face; the tall L5 art crowds otherwise)
    [18, 19], [19, 20], [20, 21], [21, 22], [22, 23], [23, 24],
    // south arm to the cottage meadow
    [13, 18], [13, 19], [13, 20], [13, 21], [13, 22], [13, 23],
];
// courtyard cells — the castle plaza draws STONE (civic look, distinct from
// the base's dirt trails)
const PLAZA = new Set([
    [10, 10], [11, 10], [12, 10], [13, 10], [14, 10], [15, 10], [16, 10], [17, 10],
    [10, 11], [10, 12], [10, 13], [10, 14], [10, 15], [10, 16],
    [17, 11], [17, 12], [17, 13], [17, 14], [17, 15], [17, 16],
    [10, 17], [11, 17], [12, 17], [13, 17], [14, 17], [15, 17], [16, 17], [17, 17],
].map(([x, y]) => `${x},${y}`));

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
    const canvas = require('canvas').createCanvas(ART_W * SS, ART_H * SS);
    const ctx = canvas.getContext('2d');
    ctx.scale(SS, SS);
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
    const M = 12; // full coverage to the card corners
    const outlands = isoOutlands.outlandProps({ seedStr: state.name || 'guild', N, P, isoX, isoY, M, OX, OY });
    const wildTile = new Map(outlands.tiles.map((t) => [`${t.x},${t.y}`, t.tile]));
    for (let x = -M; x < N + M; x++) {
        for (let y = -M; y < N + M; y++) {
            const px = isoX(x, y), py = isoY(x, y);
            if (px < -TW || px > ART_W + TW || py < -TH || py > ART_H + TH) continue;
            const r = mulberry32(seed + (x + 40) * 131 + (y + 40) * 17)();
            const inside = x >= 0 && y >= 0 && x < N && y < N;
            const inFence = x >= -P && x <= N - 1 + P && y >= -P && y <= N - 1 + P;
            let tile;
            if (inside) {
                if (PLAZA.has(`${x},${y}`)) tile = 'forest_rock_tile.png';                      // civic stone
                else if ((PATHS || []).some(([px2, py2]) => px2 === x && py2 === y)) tile = 'forest_trail.png';
                else tile = r < 0.07 ? 'forest_moss_shrooms.png' : grass[Math.floor(r * 3) % 3];
            } else if (inFence) {
                // the yard — tamed meadow inside the palisade
                tile = r < 0.04 ? 'forest_moss_shrooms.png' : grass[Math.floor(r * 3) % 3];
            } else {
                const wt = wildTile.get(`${x},${y}`);
                if (wt === 'water') tile = waterF;
                else if (wt) tile = wt;
                else tile = grass[Math.floor(r * 3) % 3];
            }
            const timg = await hsImg(tile);
            if (timg) ctx.drawImage(timg, px - TW / 2, py - TH / 2);
        }
    }
    // west gate trail: the road leaves through the west palisade and fades
    // into the per-player wilds
    {
        const trailImg = await hsImg('forest_trail.png');
        if (trailImg) {
            const trailCells = [[-P, 14], [-P - 1, 14], [-P - 2, 14], [-P - 3, 13], [-P - 4, 13]];
            for (const [tx, ty] of trailCells) {
                ctx.drawImage(trailImg, isoX(tx + 0.5, ty + 0.5) - TW / 2, isoY(tx + 0.5, ty + 0.5) - TH / 2);
            }
        }
    }
    // playable-area rim — SOFT moss shadow (matches the base's law)
    ctx.strokeStyle = 'rgba(24,32,14,0.22)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(isoX(0, N), isoY(0, N));
    ctx.lineTo(isoX(N, N), isoY(N, N));
    ctx.lineTo(isoX(N, 0), isoY(N, 0));
    ctx.stroke();

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

    // scattered vegetation — GUILD v3 FOREST LAW: tree wall lives OUTSIDE the
    // playable ring, pixel fence ring marks the boundary, front-shadow law
    // keeps building faces clear, understory dresses the mid ring.
    const occupied = new Set();
    for (const st of Object.values(GUILD_STRUCTS)) {
        // 1-tile clearing margin (front-shadow law handles the faces now)
        for (let ix = -1; ix <= st.fw; ix++) for (let iy = -1; iy <= st.fh; iy++) occupied.add(`${st.x + ix},${st.y + iy}`);
    }
    for (const [px, py] of PATHS) occupied.add(`${px},${py}`);
    for (const [px, py] of COTTAGE_SLOTS) {
        // 3-wide, 4-deep clearing so member cottages never hide behind trees
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 2; dy++) occupied.add(`${px + dx},${py + dy}`);
    }
    // archetype-prop meadow beside the castle's SE flank stays clear
    for (let ax = 18; ax <= 19; ax++) for (let ay = 17; ay <= 18; ay++) occupied.add(`${ax},${ay}`);
    // house-plot cells + 1 ring stay clear (the plots are the build sites)
    const plotCells = new Set();
    for (const plot of GUILD_PLOTS) {
        for (let ix = -1; ix < 4; ix++) for (let iy = -1; iy < 4; iy++) plotCells.add(`${plot.x + ix},${plot.y + iy}`);
    }
    const props = [];
    {
        // hot = ring around the castle (trees standing right by the walls)
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
            margin: false, // outside the fence is the outlands module's domain
            haze: false,
            structFoots: Object.values(GUILD_STRUCTS).map((st) => [st.x, st.y, st.fw, st.fh]),
        });
        for (const f of forestProps) {
            const im = f.tint ? await isoForest.tinted(f.file, f.tint, f.sc || 1) : await hsImg(f.file);
            if (im) props.push({ img: im, x: f.x, y: f.y, sc: f.tint ? 1 : (f.sc || 1) });
        }
        // PER-PLAYER OUTLANDS PROPS — biome placements beyond the fence
        for (const f of outlands.props) {
            const im = f.tint ? await isoForest.tinted(f.file, f.tint, f.sc || 1) : await hsImg(f.file);
            if (im) props.push({ img: im, x: f.x, y: f.y, sc: f.tint ? 1 : (f.sc || 1) });
        }
        // pixel fence ring — pushed OUTWARD by P tiles, gate on the WEST edge
        // where the civic road leaves the grounds (-P, 14)
        for (const seg of isoForest.fenceRing(N, isoX, isoY, [[-P, 14]], P)) {
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
    // village building (gb_cottage_a..d cycling), south-corner anchored
    const nCottages = Math.max(0, Math.min(COTTAGE_SLOTS.length, parseInt(state.memberCount, 10) || 0));
    const COTTAGE_SPRITES = ['gb_cottage_a.png', 'gb_cottage_b.png', 'gb_cottage_c.png', 'gb_cottage_d.png'];
    const cottages = [];
    for (let i = 0; i < nCottages; i++) {
        const [cxx, cyy] = COTTAGE_SLOTS[i];
        const { cx, ay } = anchorOf(cxx, cyy, 1.35, 1.35);
        const spr = await gbImg(COTTAGE_SPRITES[i % COTTAGE_SPRITES.length]);
        cottages.push({ cx, ay, spr });
    }
    // props merge into the depth pass
    const all = [
        ...props.map((p) => ({ kind: 'prop', x: p.x, y: p.y, img: p.img })),
        ...cottages.map((c) => ({ kind: 'cottage', x: c.cx, y: c.ay, spr: c.spr })),
        ...drawables,
    ].sort((a, b) => (a.y ?? (a.ay ?? 0)) - (b.y ?? (b.ay ?? 0)));

    // shadows first
    for (const d of all) {
        if (d.kind === 'prop') {
            if (d.img && d.img.height * (d.sc || 1) > 26) isoShadow.drawItemShadow(ctx, { img: d.img, key: `p${d.x}|${d.y}`, scale: d.sc || 1, ax: d.x, ay: d.y + 2, alpha: 0.8 });
        } else if (d.kind === 'cottage') {
            if (d.spr) isoShadow.drawItemShadow(ctx, { img: d.spr, key: `c${d.x}|${d.y}`, scale: 1, ax: d.x, ay: d.y + 2, alpha: 0.9 });
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
            if (d.spr) ctx.drawImage(d.spr, d.x - d.spr.width / 2, d.y - d.spr.height);
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

    // ── archetype props on the open SE meadow (beside the castle's flank) ──
    const apX = isoX(19.5, 18.5), apY = isoY(19.5, 18.5) + 8; // tile (19,18) centre
    drawArchProps(ctx, arch, apX, apY + 8, t);

    // ── guild banner on the west gate road (cloth waves; emblem color) ──
    const poleX = isoX(4.5, 15.5) + 18, poleBase = isoY(4.5, 15.5) + 8;
    ctx.fillStyle = '#4a2d17';
    ctx.fillRect(poleX - 1.5, poleBase - 84, 3, 84);
    const wave = Math.sin(t * Math.PI * 2) * 3;
    ctx.fillStyle = flagCol;
    ctx.beginPath();
    ctx.moveTo(poleX + 1.5, poleBase - 83);
    ctx.quadraticCurveTo(poleX + 22, poleBase - 80 + wave, poleX + 40, poleBase - 77 + wave * 0.4);
    ctx.lineTo(poleX + 38, poleBase - 63 + wave * 0.4);
    ctx.quadraticCurveTo(poleX + 20, poleBase - 66 + wave, poleX + 1.5, poleBase - 69);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.moveTo(poleX + 1.5, poleBase - 76);
    ctx.quadraticCurveTo(poleX + 22, poleBase - 73 + wave, poleX + 40, poleBase - 70 + wave * 0.4);
    ctx.lineTo(poleX + 38, poleBase - 63 + wave * 0.4);
    ctx.quadraticCurveTo(poleX + 20, poleBase - 66 + wave, poleX + 1.5, poleBase - 69);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e8b84a';
    ctx.beginPath(); ctx.arc(poleX, poleBase - 86, 3.4, 0, Math.PI * 2); ctx.fill();
    if (state.emblemIcon) {
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(state.emblemIcon).slice(0, 2), poleX + 20, poleBase - 68 + wave * 0.3);
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
        ctx.arc(OX + (r1 - 0.5) * 2000, OY + 470 + (i % 3) * 130 - ph * 30, 1.6, 0, Math.PI * 2);
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
    frames.forEach((b, i) => fs.writeFileSync(path.join(tmp, `f${String(i).padStart(3, '0')}.png`), b));
    const out = path.join(tmp, 'gbase.mp4');
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
        return fs.readFileSync(out);
    } finally {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
    }
}

const _renderCache = new Map();
const CACHE_TTL = 10 * 60 * 1000;
function stateHash(state, opts = {}) {
    return hashStr(JSON.stringify([state.name, state.level, state.archetype, state.buildings, state.memberCount, state.memberCap, state.emblemColor, state.emblemIcon, state.motto, opts.hint || '', opts.static ? 1 : 0]));
}

async function renderGuildBaseImage(state, opts = {}) {
    const key = stateHash(state, opts);
    const hit = _renderCache.get(key);
    if (hit && (Date.now() - hit.ts) < CACHE_TTL) return hit;
    const out = await mediaCache.cached('guildbase', key, async () => {
        const frames = [];
        const frameCount = opts.static === false ? FRAMES : 1;
        for (let f = 0; f < frameCount; f++) frames.push(await renderFrame(state, f, opts));
        let out = { buffer: frames[0], contentType: 'image/png' };
        if (frameCount > 1) {
            try {
                const mp4 = await encodeFramesToMp4(frames);
                if (mp4 && mp4.length > 1000) out = { buffer: mp4, contentType: 'video/mp4' };
            } catch (e) {
                console.error('[guildBaseRenderer] mp4 encode failed, PNG fallback:', e.message);
            }
        }
        return out;
    });
    if (_renderCache.size > 120) _renderCache.clear();
    _renderCache.set(key, { ...out, ts: Date.now() });
    return out;
}

module.exports = { GUILD_STRUCTS, GUILD_PLOTS, ARCH, PATHS, COTTAGE_SLOTS, PLAZA, FRAMES, renderFrame, renderGuildBaseImage, encodeFramesToMp4 };
