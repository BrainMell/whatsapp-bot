'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  GUILD BASE RENDERER — 3D hex KINGDOM (v8, owner 2026-10-18: "remake it with
//  the 3d … I want the guild area to look like a kingdom with plots to build
//  the various guild facilities")
//
//  Art: KayKit Medieval Hexagon Pack (CC0) baked to iso sprites by
//  scripts/kingdom3d/bake_kingdom_sprites.py; this file only COMPOSITES the
//  sprites (core/rpg/kingdom3d.js) — no 3D at runtime, ~250ms per card.
//
//  The island: a walled citadel (castle at the centre, wall ring + south
//  gate, cobble avenue), five numbered BUILD PLOTS, the three guild facilities
//  (Hall / Training / Treasury) that grow through 5 levels, a member hamlet
//  (one home per member), and a per-guild wilderness (forest, mountains,
//  river + mill, fields + windmill, lighthouse). Everything derives from the
//  guild name seed, so a guild always shows the same land.
//
//  API unchanged: renderGuildBaseImage(state, {hint,static}) → {buffer,contentType}
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const os = require('os');
const K = require('./kingdom3d');
const KT = require('./kingdomTerrain');
const mediaCache = require('./mediaCache');
const { encodeRawStreamMp4 } = require('../utils/bakeStream');   // 47-k10: streaming bake — one frame alive at a time
const ambient = require('./ambient');   // shared life layer (owner 2026-10-19: "the guild card should also be a gif")
const emojiFontMod = require('./emojiFont');   // 2026-10-20: emblem emoji glyphs; color bitmaps 2026-10-20 (owner 'use colors not hex code')
const { emojiFont, fillTextMixed } = emojiFontMod;
const emojiBitmap = require('./emojiBitmap');   // 2026-10-20 12:20Z: big emblem bitmaps for the castle close-up card

const FRAMES = 14, FRAME_MS = 143;   // 2 s loop, 14 frames (cold bake was the slow part: ~30% cheaper than 20)
const COLS = 23, ROWS = 31, CC = 11, CR = 15;   // oversized grid: terrain runs past every edge of the card, castle on (11,15)
const OLD_COLS = 17, OLD_ROWS = 15, OLD_CC = 8, OLD_CR = 7;   // the framing the card was designed around
const SCALE = parseFloat(process.env.RENDER_GUILD_SCALE || '0.5') || 0.5;
const PREFIX = '.j'; // display-only default; engine passes real prefix via opts.hint when it matters
const FONTS = path.join(__dirname, '..', 'rpgasset', 'fonts');

// ── structure defs (mirror GUILD_UPGRADES visual states in guilds.js) ──
const GUILD_STRUCTS = {
    hall: {
        id: 'hall', name: 'Guild Hall',
        levels: [
            { level: 1, name: 'Outpost Keep' }, { level: 2, name: 'Bailey Fort' },
            { level: 3, name: 'Stone Castle' }, { level: 4, name: 'Grand Castle' },
            { level: 5, name: 'Royal Citadel' },
        ],
    },
    training: {
        id: 'training', name: 'Training Ground',
        levels: [
            { level: 1, name: 'Dust Yard' }, { level: 2, name: 'Spar Ring' },
            { level: 3, name: "Warrior's Ring" }, { level: 4, name: 'War College' },
            { level: 5, name: "Legend's Arena" },
        ],
    },
    treasury: {
        id: 'treasury', name: 'Treasury',
        levels: [
            { level: 1, name: 'Coin Chest' }, { level: 2, name: 'Vault Hut' },
            { level: 3, name: 'Strongroom' }, { level: 4, name: 'Gold Vault' },
            { level: 5, name: 'Royal Treasury' },
        ],
    },
};

const ARCH = {
    ADVENTURER: { flag: '#a02c3c', flagD: '#7c1e2c', label: 'Adventurers', team: 'red' },
    MERCHANT: { flag: '#b8862e', flagD: '#8a6420', label: 'Merchants', team: 'yellow' },
    RESEARCH: { flag: '#2a6a6e', flagD: '#1e4e52', label: 'Research', team: 'green' },
};

// ── layout (hex coords, odd-r) ────────────────────────────────────────────
const step = (c, r, dir, n) => { let p = [c, r]; for (let i = 0; i < n; i++) p = K.neighbor(p[0], p[1], dir); return p; };
const WALL_RING = 6;          // the citadel covers a wide district: wall on ring 6 (was 4)
// build plots: five numbered sites on the ring-3 band (training/treasury own the E/W ones)
const SLOT = {
    hall: [CC, CR],
    training: step(CC, CR, 0, 3),               // east
    treasury: step(CC, CR, 3, 3),               // west
};
const NW3 = step(CC, CR, 4, 3), NE3 = step(CC, CR, 5, 3), SE3 = step(CC, CR, 1, 3), SW3 = step(CC, CR, 2, 3);
const GUILD_PLOTS = [
    { id: 1, c: NW3[0], r: NW3[1] },
    { id: 2, c: NE3[0], r: NE3[1] },
    { id: 3, c: SW3[0], r: SW3[1] },
    { id: 4, c: SE3[0], r: SE3[1] },
    { id: 5, c: step(NW3[0], NW3[1], 0, 1)[0], r: step(NW3[0], NW3[1], 0, 1)[1] },
];

// ── fonts ──
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

const mulberry32 = K.mulberry32, hashStr = (s) => K.hashStr(String(s || ''));

// ═══════════════════════════════════════════════════════════════════════════
//  SCENE BUILD
// ═══════════════════════════════════════════════════════════════════════════
function angleDeg(c, r) { // 0=E, 90=S(down), 180=W, 270=N
    const a = K.hexWorld(c, r), b = K.hexWorld(CC, CR);
    return (Math.atan2(a.z - b.z, a.x - b.x) * 180 / Math.PI + 360) % 360;
}
const cdist = (c, r) => K.hexDist(CC, CR, c, r);
const key = (c, r) => `${c},${r}`;

// main sprite of a guild facility at a level — the one that drops in on a landing celebrate
// (owner 2026-10-19). null → no fall (treasury crates: burst only).
function guildMainSprite(kind, lvl, team) {
    if (kind === 'hall') {
        if (lvl === 1) return { name: 'building_tower_A_' + team, sc: 1.0 };
        if (lvl === 2) return { name: 'building_tower_A_' + team, sc: 1.0, dx: 0.35, dz: -0.1 };
        if (lvl === 3) return { name: 'building_barracks_' + team, sc: 1 };
        return { name: 'building_castle_' + team, sc: 1 };
    }
    if (kind === 'training') {
        if (lvl === 1) return { name: 'tent', sc: 1 };
        if (lvl <= 4) return { name: 'building_archeryrange_' + team, sc: 1 };
        return { name: 'building_barracks_' + team, sc: 1 };
    }
    if (kind === 'treasury') {
        if (lvl === 1) return null;
        if (lvl === 2) return { name: 'building_home_B_' + team, sc: 1 };
        if (lvl === 3) return { name: 'building_market_' + team, sc: 1 };
        return { name: 'building_church_' + team, sc: 1 };
    }
    return null;
}

function buildWorld(state, cel = null) {
    const seed = hashStr(state.name || 'guild');
    const rng = mulberry32(seed);

    // ── per-guild macro profile (owner brief 2026-10-19: guilds on the same continent must not be twins) ──
    // Claude-method: the district's compass story (market / well / field band / hamlet band) mirrors
    // E/W as a unit, and the cottage kind mix + field/orchard density re-roll per guild seed. Walls,
    // gate, roads and the citadel stay canonical — realm palettes still constrain every sprite.
    const mir = rng() < 0.5;
    const ang = (a) => (mir ? (360 - a) % 360 : a);                       // compass mirror around the N-S axis
    const KIND_PROFILES = {
        village: null,                                                                    // default weights
        market: { townhouse: 2.2, shop: 2.2, cottage: 1.0, stone: 0.8, tudor: 1.2, hut: 0.3, barn: 0 },
        farmstead: { barn: 2.2, cottage: 1.4, hut: 1.4, townhouse: 0.4, stone: 0.7, tudor: 0.9, shop: 0.3 },
        stonecourt: { stone: 2.4, cottage: 1.1, tudor: 1.3, townhouse: 0.7, hut: 0.5, barn: 0, shop: 0.4 },
    };
    const HW = KIND_PROFILES[Object.keys(KIND_PROFILES)[Math.floor(rng() * 4)]];
    const fieldsWant = 3 + Math.floor(rng() * 4);                         // 3..6 grain patches in the field band
    const orchardP = 0.18 + rng() * 0.22;                                 // gap-tree density
    const shopEvery = 4 + Math.floor(rng() * 4);                          // every Nth cottage may be a shop

    const arch = ARCH[state.archetype] ? state.archetype : 'ADVENTURER';
    const team = ARCH[arch].team;
    const hall = Math.max(0, Math.min(5, parseInt((state.buildings || {}).hall, 10) || 0));
    const train = Math.max(0, Math.min(5, parseInt((state.buildings || {}).training, 10) || 0));
    const treas = Math.max(0, Math.min(5, parseInt((state.buildings || {}).treasury, 10) || 0));
    const members = Math.max(0, Math.min(40, parseInt(state.memberCount, 10) || 0));
    // hall-tier evolution (owner 2026-10-19: "if someone upgrades their guild hall the base
    // becomes progressively larger and more impressive, stone roads instead of dirt, larger
    // double layered walls ... when it's max level it becomes a full blown city"):
    //   lv2 cobbles the gate avenue · lv3 paves every street + tower banners
    //   lv4 raises a second curtain wall (ring 8, six bastions, own gatehouse) with an
    //      expansion belt between the walls · lv5 is the full city: cobbled grand ward,
    //      banner monument, market day, and the district fills with citizens' homes.
    const TIER = { stoneRoads: hall >= 3, doubleWalls: hall >= 4, fullCity: hall >= 5 };

    const biome = KT.pickBiome(state);
    const land = true;                      // every biome (incl. the coastal 'isle') comes from the terrain generator
    const w = new K.HexWorld(COLS, ROWS, { scale: SCALE, biome, oobWater: !land });
    const used = new Set();                 // cells claimed by structures/props
    const claim = (c, r) => used.add(key(c, r));
    const smokeAnchors = [];                // hearth anchors for the animated smoke (world coords)
    // ── helpers for placing buildings (declared early: the hall-tier wall pass uses B) ──
    const B = (name) => `building_${name}_${team}`;
    const nbrs = (c, r) => [0, 1, 2, 3, 4, 5].map((d) => K.neighbor(c, r, d)).filter(([a, b]) => w.inb(a, b));
    const freeNbrs = (c, r, maxD = 3) => nbrs(c, r).filter(([a, b]) => !used.has(key(a, b)) && !w.cell[b][a].water && !w.cell[b][a].river && cdist(a, b) <= maxD)
        .sort((p, q) => cdist(q[0], q[1]) - cdist(p[0], p[1]));
    const plotMarker = (c, r, tag) => {
        w.put('building_dirt', c, r, { layer: 'flat' });
        w.put('crate_A_small', c, r, { dx: -0.55, dz: 0.25 });
        w.put('ladder', c, r, { dx: 0.45, dz: -0.2 });
        w.put('resource_lumber', c, r, { dx: 0.35, dz: 0.45 });
        w.overlay((ctx, p, k) => plotOverlay(ctx, w, c, r, tag, k), c, r);
    };

    let riverCells = [];
    let S = null;
    if (land) {
        // land biomes: ragged haze-edged silhouette, lakes/lava pools, optional river (no sea)
        S = KT.shape(w, { seed, biome, CC, CR, keepR: WALL_RING + (TIER.doubleWalls ? 3 : 1), wallRing: WALL_RING, angleDeg, cdist });
        riverCells = S.riverCells;
    } else {
        // ── island silhouette (per-guild noise) ──
        const p1 = rng() * 6.28, p2 = rng() * 6.28, p3 = rng() * 6.28;
        const radius = (deg) => {
            const t = deg * Math.PI / 180;
            return 6.5 + 0.55 * Math.sin(3 * t + p1) + 0.4 * Math.sin(5 * t + p2) + 0.25 * Math.sin(2 * t + p3);
        };
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            const d = cdist(c, r);
            const rad = radius(angleDeg(c, r));
            w.cell[r][c].water = d > rad || r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;
            w.cell[r][c].void = d > rad + 1.9 + 0.5 * Math.sin(angleDeg(c, r) * 0.07 + p3);   // sea shelf, ragged edge
        }
        // keep the walled city + a margin always land
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (cdist(c, r) <= 5) { w.cell[r][c].water = false; w.cell[r][c].keepLand = true; }

        // ── river (decorative, outside the walls): arc of ring 6 → sea ──
        const riverStart = 285 + Math.floor(rng() * 40), riverSpan = 70;
        const r6 = K.ring(CC, CR, 6).filter(([c, r]) => w.inb(c, r));
        const arc = r6.filter(([c, r]) => { const a = (angleDeg(c, r) - riverStart + 360) % 360; return a <= riverSpan; });
        riverCells = [];
        for (const [c, r] of arc) if (!w.cell[r][c].water) riverCells.push([c, r]);
        const extend = (from, toward) => {
            const line = K.hexLine(from[0], from[1], toward[0], toward[1]).slice(1);
            for (const [c, r] of line) { if (!w.inb(c, r) || w.cell[r][c].water) break; riverCells.push([c, r]); }
        };
        if (arc.length) {
            const a0 = arc[0], a1 = arc[arc.length - 1];
            const far = (cell) => { const wc = K.hexWorld(cell[0], cell[1]), wo = K.hexWorld(CC, CR); const k = 3; const x = wo.x + (wc.x - wo.x) * k, z = wo.z + (wc.z - wo.z) * k; return [Math.max(0, Math.min(COLS - 1, Math.round(x / 2))), Math.max(0, Math.min(ROWS - 1, Math.round(z / K.SQ3)))]; };
            extend(a0, far(a0)); extend(a1, far(a1));
        }
        for (const [c, r] of riverCells) if (w.inb(c, r) && !w.cell[r][c].keepLand) w.cell[r][c].river = true;


    }

    // ── wall ring + south gate + north postern ──
    const ringCells = K.ring(CC, CR, WALL_RING);
    const gateRow = CR + WALL_RING;
    const gateCell = ringCells.filter(([, r]) => r === gateRow).sort((a, b) => Math.abs(a[0] - CC) - Math.abs(b[0] - CC))[0];
    // the pack's diverse gates (owner 2026-10-19): the stone gatehouse guards the south
    // road, and a quiet wall-straight-gate postern sits in the north wall behind the keep
    const postern = ringCells.filter(([, r]) => r === CR - WALL_RING).sort((a, b) => Math.abs(a[0] - CC) - Math.abs(b[0] - CC))[0];
    const gateSet = new Set([key(gateCell[0], gateCell[1])]);
    if (postern && key(postern[0], postern[1]) !== key(gateCell[0], gateCell[1])) gateSet.add(key(postern[0], postern[1]));
    for (const [c, r] of ringCells) claim(c, r);
    w.layWall(ringCells, { closed: true, gates: gateSet, outside: true });
    // the south world-road leaves through the gate: compute its cells now so the outer
    // curtain (hall 4+) can drop its own gate exactly on the line
    const outRoadCells = K.hexLine(gateCell[0], gateCell[1], CC, Math.min(ROWS - 2, CR + (TIER.doubleWalls ? 10 : 8))).slice(1);
    // hall 4+ "larger double layered walls": a second curtain two rings out with six
    // bastions and its own gatehouse on the south road; the belt between the walls
    // becomes the city's expansion ward (see the suburb pass below)
    if (TIER.doubleWalls) {
        const outerCells = K.ring(CC, CR, WALL_RING + 2);
        const outerGate = outRoadCells.find(([c, r]) => cdist(c, r) === WALL_RING + 2)
            || outerCells.filter(([, r]) => r >= CR + WALL_RING + 1).sort((a, b) => Math.abs(a[0] - CC) - Math.abs(b[0] - CC))[0];
        const outerGateSet = new Set([key(outerGate[0], outerGate[1])]);
        for (const [c, r] of outerCells) claim(c, r);
        w.layWall(outerCells, { closed: true, gates: outerGateSet, outside: true });
        if (K.hasSprite('struct_gate_0', 'top')) w.put('struct_gate_0', outerGate[0], outerGate[1], { sc: 1.15, sort: 0.6 });
        w.put('flag_' + team, outerGate[0], outerGate[1], { dx: -0.95, dz: 0.55, h: 0 });
        w.put('flag_' + team, outerGate[0], outerGate[1], { dx: 0.95, dz: 0.55, h: 0 });
        for (let d = 0; d < 6; d++) {
            const [tc, tr] = step(CC, CR, d, WALL_RING + 2);
            if (!w.inb(tc, tr) || w.cell[tr][tc].water) continue;
            w.put(B('tower_A'), tc, tr, { sc: 0.7, sort: 0.5 });
            if (TIER.fullCity) w.put('flag_' + team, tc, tr, { h: 1.5, sc: 0.72 });
        }
    }

    // ── roads: gate → castle avenue + spur to each facility/plot + road out of the gate ──
    const mainRoad = K.hexLine(gateCell[0], gateCell[1], CC, CR);
    const roadSet = new Set();
    const addRoad = (cells) => { for (const [c, r] of cells) { if (!w.inb(c, r) || w.cell[r][c].water || w.cell[r][c].wall && key(c, r) !== key(gateCell[0], gateCell[1])) continue; roadSet.add(key(c, r)); } };
    addRoad(mainRoad.slice(1));                                           // inside the walls (gate cell stays a wall piece)
    for (const [c, r] of outRoadCells) {
        if (!w.inb(c, r) || w.cell[r][c].water || w.cell[r][c].void) break;
        if (w.cell[r][c].river) { if (!land) break; w.cell[r][c].crossRoad = true; continue; }   // land biomes: bridge it
        roadSet.add(key(c, r));
    }
    const spurTo = (cell) => {
        // walk toward the nearest road cell
        let best = null, bd = 99;
        for (const k of roadSet) { const [c, r] = k.split(',').map(Number); const d = K.hexDist(cell[0], cell[1], c, r); if (d < bd && d > 0) { bd = d; best = [c, r]; } }
        if (best) addRoad(K.hexLine(cell[0], cell[1], best[0], best[1]).slice(0, -1));
    };
    const plotCells = GUILD_PLOTS.map((p) => [p.c, p.r]);
    for (const cell of [SLOT.training, SLOT.treasury, ...plotCells]) spurTo(cell);
    for (const k of roadSet) { const [c, r] = k.split(',').map(Number); if (!w.cell[r][c].wall) w.cell[r][c].road = true; }
    w.cell[CR][CC].door = true;
    for (const cell of [SLOT.training, SLOT.treasury, ...plotCells]) { w.cell[cell[1]][cell[0]].door = true; w.cell[cell[1]][cell[0]].road = false; }
    w.cell[gateCell[1]][gateCell[0]].door = true;
    w.resolve();

    for (const k of roadSet) { const [c, r] = k.split(',').map(Number); claim(c, r); }
    claim(CC, CR);
    // hall-tier paving (owner 2026-10-19: "stone roads instead of dirt") — the gate avenue
    // is cobbled from the Bailey on (hall 2), every street from the Stone Castle on (hall 3)
    if (hall >= 2) {
        const aveSet = new Set(mainRoad.slice(1).map(([c, r]) => key(c, r)));
        for (const k of roadSet) {
            const [c, r] = k.split(',').map(Number);
            if (!w.cell[r][c].road) continue;
            if (hall >= 3 || aveSet.has(k)) w.underlay((ctx, p2, kk) => cobbleOverlay(ctx, w, c, r, kk), c, r);
        }
    }

    // ── CASTLE (hall) ──
    const castle = [CC, CR];
    let fall = null;
    const fallAt = (kind, lvl, cell) => {                              // record the celebrated facility's main sprite
        const ms = guildMainSprite(kind, lvl, team);
        if (!ms) return;
        const wc = K.hexWorld(cell[0], cell[1]);
        fall = { name: ms.name, wx: wc.x + (ms.dx || 0), wz: wc.z + (ms.dz || 0), sc: ms.sc || 1, flip: false };
        // an UPGRADE (cel.prev >= 1) also records the replaced works — the overlay sinks them
        // into the ground as the new building comes in (owner 2026-10-19). Treasury lvl-1 is
        // loose crates (no main sprite): they burst away as before, nothing sinks.
        const prev = Number.isInteger(cel.prev) ? Math.max(1, cel.prev) : 0;           // 0 = fresh build
        if (prev >= 1 && prev < lvl) {
            const oms = guildMainSprite(kind, prev, team);
            if (oms) fall.old = { name: oms.name, wx: wc.x + (oms.dx || 0), wz: wc.z + (oms.dz || 0), sc: oms.sc || 1, flip: false };
        }
    };
    if (cel && cel.building === 'hall' && hall > 0) {
        fallAt('hall', hall, castle);                                  // omitted from the scene — the overlay drops it in
    } else if (hall === 0) {
        plotMarker(CC, CR, 'HALL');
        w.put('building_scaffolding', CC, CR, { sc: 0.9 });
    } else {
        w.put('building_dirt', CC, CR, { layer: 'flat' });
        { const wcC = K.hexWorld(CC, CR); smokeAnchors.push({ x: wcC.x + 0.4, z: wcC.z - 0.2, h: hall >= 4 ? 3.9 : 2.2 }); }
        if (hall === 1) { w.put(B('tower_A'), CC, CR, { sc: 1.0 }); w.put('fence_wood_straight@0', CC, CR, { dz: 0.85 }); }
        if (hall === 2) { w.put(B('tower_base'), CC, CR, { dx: -0.55, dz: 0.2 }); w.put(B('tower_A'), CC, CR, { dx: 0.35, dz: -0.1 }); }
        if (hall === 3) w.put(B('barracks'), CC, CR);
        if (hall >= 4) w.put(B('castle'), CC, CR);
        if (hall >= 5) {
            for (const d of [0, 2, 3, 5]) { const n = K.neighbor(CC, CR, d); if (w.inb(n[0], n[1])) { w.put(B('tower_B'), n[0], n[1], { sc: 0.85 }); claim(n[0], n[1]); } }
        } else if (hall >= 3) {
            for (const d of [2, 3]) { const n = K.neighbor(CC, CR, d); w.put(B('tower_A'), n[0], n[1], { sc: 0.8 }); claim(n[0], n[1]); }
        }
    }

    // ── TRAINING ──
    const [tc, tr] = SLOT.training;
    if (cel && cel.building === 'training' && train > 0) fallAt('training', train, [tc, tr]);
    else if (train === 0) plotMarker(tc, tr, 'TRAINING');
    else {
        w.put('building_dirt', tc, tr, { layer: 'flat' });
        const sat = freeNbrs(tc, tr);
        if (train === 1) { w.put('tent', tc, tr, { dx: -0.3 }); w.put('target', tc, tr, { dx: 0.5, dz: 0.35 }); w.put('weaponrack', tc, tr, { dx: 0.1, dz: 0.55 }); }
        if (train === 2) w.put(B('archeryrange'), tc, tr);
        if (train === 3) { w.put(B('archeryrange'), tc, tr); if (sat[0]) { w.put('tent', sat[0][0], sat[0][1]); w.put('target', sat[0][0], sat[0][1], { dx: 0.55, dz: 0.4 }); claim(sat[0][0], sat[0][1]); } }
        if (train === 4) { w.put(B('archeryrange'), tc, tr); if (sat[0]) { w.put(B('blacksmith'), sat[0][0], sat[0][1]); claim(sat[0][0], sat[0][1]); } }
        if (train >= 5) {
            w.put(B('barracks'), tc, tr);
            if (sat[0]) { w.put(B('archeryrange'), sat[0][0], sat[0][1]); claim(sat[0][0], sat[0][1]); }
            if (sat[1]) { w.put(B('tower_catapult'), sat[1][0], sat[1][1], { sc: 0.9 }); claim(sat[1][0], sat[1][1]); }
        }
    }
    claim(tc, tr);

    // ── TREASURY ──
    const [vc, vr] = SLOT.treasury;
    if (cel && cel.building === 'treasury' && treas > 0) fallAt('treasury', treas, [vc, vr]);
    else if (treas === 0) plotMarker(vc, vr, 'TREASURY');
    else {
        w.put('building_dirt', vc, vr, { layer: 'flat' });
        const sat = freeNbrs(vc, vr);
        if (treas === 1) { w.put('crate_A_big', vc, vr, { dx: -0.4 }); w.put('crate_B_small', vc, vr, { dx: 0.35, dz: 0.2 }); w.put('sack', vc, vr, { dx: 0.0, dz: 0.55 }); w.put('barrel', vc, vr, { dx: 0.6, dz: -0.2 }); }
        if (treas === 2) { w.put(B('home_B'), vc, vr); w.put('crate_A_small', vc, vr, { dx: 0.6, dz: 0.45 }); }
        if (treas === 3) w.put(B('market'), vc, vr);
        if (treas === 4) w.put(B('church'), vc, vr);
        if (treas >= 5) { w.put(B('church'), vc, vr); if (sat[0]) { w.put(B('tower_B'), sat[0][0], sat[0][1], { sc: 0.8 }); claim(sat[0][0], sat[0][1]); } w.put('flag_' + team, vc, vr, { dx: 0.7, dz: 0.5 }); }
    }
    claim(vc, vr);

    // ── numbered build plots ──
    for (const p of GUILD_PLOTS) { plotMarker(p.c, p.r, String(p.id)); claim(p.c, p.r); }

    // ── corner towers on the six wall corners (the ring is now wide enough to read as a fortress) ──
    for (let d = 0; d < 6; d++) {
        const [tcc, trr] = step(CC, CR, d, WALL_RING);
        if (!w.inb(tcc, trr) || w.cell[trr][tcc].water) continue;
        w.put(B('tower_A'), tcc, trr, { sc: 0.78, sort: 0.5 });
        if (hall >= 3) w.put('flag_' + team, tcc, trr, { h: 1.5, sc: 0.75 });   // tower banners once the town is stone-built
    }

    // ── the district inside the walls: market, well, fields, orchard, then one cottage per member (cap 24) ──
    const inside = [];
    for (let d = 1; d < WALL_RING; d++) for (const [c, r] of K.ring(CC, CR, d)) {
        if (used.has(key(c, r)) || !w.inb(c, r) || w.cell[r][c].water || w.cell[r][c].river) continue;
        inside.push([c, r, d, angleDeg(c, r)]);
    }
    const takeIn = (pred) => { const i = inside.findIndex((q) => !used.has(key(q[0], q[1])) && pred(q)); if (i < 0) return null; return inside[i]; };
    const mk = takeIn((q) => q[2] === 4 && ang(q[3]) > 20 && ang(q[3]) < 80)              // market square, (mirrored) south-east
        || takeIn((q) => q[2] >= 4 && q[2] <= 5 && ang(q[3]) > 20 && ang(q[3]) < 80);     // fallback: the same band one ring out
    if (mk) {
        w.put('building_dirt', mk[0], mk[1], { layer: 'flat' }); w.put(B('market'), mk[0], mk[1]); claim(mk[0], mk[1]);
        // market-day clutter: the pack's long crates, pallet and sacks around the market hall
        w.put('crate_long_B', mk[0], mk[1], { dx: -1.3, dz: 0.4 }); w.put('sack', mk[0], mk[1], { dx: 1.2, dz: 0.6 });
        w.put('pallet', mk[0], mk[1], { dx: 0.25, dz: 1.1 });
        if (rng() < 0.6) w.put('crate_long_A', mk[0], mk[1], { dx: 1.35, dz: -0.45 });
    }
    const wl = takeIn((q) => q[2] === 4 && ang(q[3]) > 100 && ang(q[3]) < 160);          // well, (mirrored) south-west
    if (wl) { w.put(B('well'), wl[0], wl[1]); w.put('barrel', wl[0], wl[1], { dx: 0.5, dz: 0.3 }); claim(wl[0], wl[1]); }
    // the guard's yard: a barracks stands beside the gate road in EVERY guild ("maybe some
    // barracks in the guild area" — owner 2026-10-19); a second joins once the keep is a castle
    const gb = takeIn((q) => q[2] >= 4 && q[2] <= 5 && ang(q[3]) > 76 && ang(q[3]) < 104)
        || takeIn((q) => q[2] >= 3 && q[2] <= 5 && ang(q[3]) > 70 && ang(q[3]) < 110);
    if (gb) {
        w.put('building_dirt', gb[0], gb[1], { layer: 'flat' });
        w.put(B('barracks'), gb[0], gb[1], { sc: 0.92 });
        w.put('weaponrack', gb[0], gb[1], { dx: 1.15, dz: 0.55 }); w.put('barrel', gb[0], gb[1], { dx: -1.1, dz: 0.7 });
        claim(gb[0], gb[1]);
    }
    if (hall >= 4) {
        const gb2 = takeIn((q) => q[2] >= 3 && q[2] <= 5 && ang(q[3]) > 60 && ang(q[3]) < 120);
        if (gb2) {
            w.put('building_dirt', gb2[0], gb2[1], { layer: 'flat' });
            w.put(B('barracks'), gb2[0], gb2[1], { sc: 0.9, flip: true }); w.put('weaponrack', gb2[0], gb2[1], { dx: -1.15, dz: 0.5 });
            claim(gb2[0], gb2[1]);
        }
    }
    // ── the grand ward (max hall, owner 2026-10-19 "full blown city"): cobbled forecourt
    // with benches before the keep, a banner monument on the avenue axis, and market day ──
    if (TIER.fullCity) {
        for (const q of inside) {
            if (used.has(key(q[0], q[1])) || q[2] > 2 || q[3] < 40 || q[3] > 140) continue;
            w.underlay((ctx, p2, kk) => cobbleOverlay(ctx, w, q[0], q[1], kk), q[0], q[1]);
            const x = rng();
            if (x < 0.3) w.put('crate_long_empty', q[0], q[1], { dx: -0.4, dz: 0.4, sc: 0.8 });
            else if (x < 0.5) w.put('barrel', q[0], q[1], { dx: 0.45, dz: 0.3 });
            claim(q[0], q[1]);
        }
        const mn = takeIn((q) => q[2] === 3 && q[3] > 70 && q[3] < 110);          // monument beside the avenue
        if (mn) {
            w.put(B('tower_base'), mn[0], mn[1], { sc: 0.78 });
            w.put('flag_' + team, mn[0], mn[1], { h: 1.15, sc: 0.85 });
            claim(mn[0], mn[1]);
        }
        if (mk) {                                                                 // market day: two extra stalls
            w.put('crate_long_B', mk[0], mk[1], { dx: -1.55, dz: -0.5 }); w.put('pallet', mk[0], mk[1], { dx: 1.5, dz: -0.35 });
            w.put('sack', mk[0], mk[1], { dx: -0.4, dz: 1.45 });
        }
    }
    // drill lawn: even before the training ground is built, targets and arrow buckets sit out on the green
    if (train < 2) {
        const dl = takeIn((q) => q[2] >= 3 && q[2] <= 5 && ang(q[3]) > 14 && ang(q[3]) < 70);
        if (dl) {
            w.put('building_dirt', dl[0], dl[1], { layer: 'flat', sc: 0.9 });
            w.put('target', dl[0], dl[1], { dx: -0.45, dz: 0.15 }); w.put('bucket_arrows', dl[0], dl[1], { dx: 0.6, dz: 0.5 });
            w.put('weaponrack', dl[0], dl[1], { dx: 0.1, dz: -0.65 });
            claim(dl[0], dl[1]);
        }
    }
    // festival stage on the (mirrored) north-east lawn — the pack's stage pieces were still idle
    const stg = takeIn((q) => q[2] >= 3 && q[2] <= 4 && (ang(q[3]) > 318 || ang(q[3]) < 12));
    if (stg) {
        w.put(['building_stage_A', 'building_stage_B', 'building_stage_C'][Math.floor(rng() * 3)], stg[0], stg[1]);
        w.put('flag_' + team, stg[0], stg[1], { dx: 0.85, dz: 0.5 });
        claim(stg[0], stg[1]);
    }
    // ── the quarry yard: the pack's own mine (walkway-into-rocks) INSIDE the walls ──
    // owner 2026-10-19: "Move the cave inside the base, it should replace the existing
    // mines" — the ridge-foot working site is gone (kingdomTerrain populate no longer
    // places it); the cave is a district feature tucked against the back rampart, with
    // the same dressed look the owner signed off on (ore-hoist, ladder, stone pile).
    const qy = takeIn((q) => q[2] >= 4 && q[3] > 195 && q[3] < 345)            // back band behind the keep
        || takeIn((q) => q[2] >= 3 && q[3] > 195 && q[3] < 345)
        || takeIn((q) => q[2] >= 3);
    if (qy) {
        w.put('building_dirt', qy[0], qy[1], { layer: 'flat' });
        w.put(B('mine'), qy[0], qy[1]);
        w.put('building_scaffolding', qy[0], qy[1], { dx: -0.85, dz: 0.32, sc: 0.85, flip: rng() < 0.5 });
        w.put('ladder', qy[0], qy[1], { dx: 0.55, dz: 0.85, sc: 0.9 });
        w.put('resource_stone', qy[0], qy[1], { dx: -0.35, dz: 1.05, sc: 0.9 });
        claim(qy[0], qy[1]);
    }
    // ── the expansion belt (double walls, hall 4+): the city outgrew its inner curtain —
    // cottages front the south road between the walls, a tavern joins at max hall, and
    // paddocks/gardens fill the rest of the ward ──
    if (TIER.doubleWalls) {
        const belt = [];
        for (const [c, r] of K.ring(CC, CR, WALL_RING + 1)) {
            if (used.has(key(c, r)) || !w.inb(c, r) || w.cell[r][c].water || w.cell[r][c].river || w.cell[r][c].wall) continue;
            belt.push([c, r, angleDeg(c, r)]);
        }
        belt.sort((a, b) => Math.abs(((a[2] - 90 + 540) % 360) - 180) - Math.abs(((b[2] - 90 + 540) % 360) - 180));   // south first
        const beltPlaced = [];
        const wantHomes = TIER.fullCity ? 5 + Math.floor(rng() * 2) : 3 + Math.floor(rng() * 2);
        for (const [c, r, a] of belt) {
            if (beltPlaced.length >= wantHomes) break;
            if (a < 15 || a > 165) continue;                                              // cottages front the south road
            if (beltPlaced.some(([pc, pr]) => K.hexDist(pc, pr, c, r) < 2)) continue;
            w.put(K.houseName(rng, w.biome || 'isle', { view: 'top', weights: HW, shop: TIER.fullCity && beltPlaced.length === 1 }) || B(beltPlaced.length % 2 ? 'home_B' : 'home_A'), c, r, { flip: rng() < 0.5 });
            const wcB = K.hexWorld(c, r); smokeAnchors.push({ x: wcB.x + 0.3, z: wcB.z + 0.1, h: 1.6 });
            beltPlaced.push([c, r]); claim(c, r);
        }
        if (TIER.fullCity) {                                                              // a roadside tavern serves the outer ward
            const tv = belt.find(([c, r, a]) => !used.has(key(c, r)) && a > 25 && a < 155 && !beltPlaced.some(([pc, pr]) => K.hexDist(pc, pr, c, r) < 2));
            if (tv) {
                w.put(B('tavern'), tv[0], tv[1], { sc: 0.95 });
                const wcT = K.hexWorld(tv[0], tv[1]); smokeAnchors.push({ x: wcT.x, z: wcT.z + 0.2, h: 2.0 });
                claim(tv[0], tv[1]);
            }
        }
        for (const [c, r] of belt) {                                                      // the rest of the belt: paddocks and gardens
            if (used.has(key(c, r))) continue;
            const x = rng();
            if (x < 0.34) w.put('building_grain', c, r, { layer: 'flat' });
            else if (x < 0.5) w.put(['trees_A_medium', 'tree_single_A', 'tree_single_B'][Math.floor(rng() * 3)], c, r, { flip: rng() < 0.5, sc: 0.85 });
            else if (x < 0.58) w.put('barrel', c, r, { dx: 0.3 });
            else continue;
            claim(c, r);
        }
    }
    let nf = 0;
    for (const q of inside) {                                                            // fields in the (mirrored) north band, ring 5
        const a2 = ang(q[3]);
        if (nf >= fieldsWant || used.has(key(q[0], q[1])) || q[2] < 5 || a2 < 215 || a2 > 325) continue;
        if (rng() < 0.55) { w.put('building_grain', q[0], q[1], { layer: 'flat' }); claim(q[0], q[1]); nf++; }
    }
    const hamlet = inside.filter((q) => !used.has(key(q[0], q[1])) && (ang(q[3]) > 20 && ang(q[3]) < 160 ? q[2] >= 1 : q[2] >= 4));
    for (const q of hamlet) q.k = Math.abs(q[2] - 4) * 0.7 + rng() * 2.4;                // spread over rings 3-5, not a clump at the keep
    hamlet.sort((a, b) => a.k - b.k);
    const placed = [];
    const homeN = Math.min(members, 24, hamlet.length);   // (spacing may place fewer on a small guild map)
    for (let i = 0, got = 0; got < homeN && i < hamlet.length; i++) {
        const [c, r] = hamlet[i];
        if (placed.some(([pc, pr]) => K.hexDist(pc, pr, c, r) < 2)) continue;           // keep a lane of air between cottages
        placed.push([c, r]); got++;
        w.put(K.houseName(rng, w.biome || 'isle', { view: 'top', weights: HW, shop: i % shopEvery === 0 }) || B(i % 3 === 1 ? 'home_B' : 'home_A'), c, r, { flip: i % 2 === 1 });
        if (hamlet[i][2] >= 4 && rng() < 0.5) w.put(['barrel', 'crate_A_small', 'sack', 'bucket_water'][Math.floor(rng() * 4)], c, r, { dx: 0.6, dz: 0.5 });
        claim(c, r);
        if (got <= 8) { const wcH = K.hexWorld(c, r); smokeAnchors.push({ x: wcH.x + (i % 2 ? -0.35 : 0.35), z: wcH.z + 0.1, h: 1.65 }); }
    }
    // max hall: the district fills with citizens' homes beyond the member hamlet — a
    // full blown city has people, not just plot markers (seeded mix, shops every third)
    if (TIER.fullCity) {
        let gotX = 0;
        for (const q of inside) {
            if (gotX >= 6) break;
            if (used.has(key(q[0], q[1])) || q[2] < 3) continue;
            if (placed.some(([pc, pr]) => K.hexDist(pc, pr, q[0], q[1]) < 2)) continue;
            placed.push([q[0], q[1]]); gotX++;
            w.put(K.houseName(rng, w.biome || 'isle', { view: 'top', weights: HW, shop: gotX % 3 === 0 }) || B('home_A'), q[0], q[1], { flip: rng() < 0.5 });
            if (gotX <= 4) { const wcX = K.hexWorld(q[0], q[1]); smokeAnchors.push({ x: wcX.x + (gotX % 2 ? -0.35 : 0.35), z: wcX.z + 0.1, h: 1.65 }); }
            claim(q[0], q[1]);
        }
    }
    for (const q of inside) {                                                            // orchard / garden trees in the gaps
        if (used.has(key(q[0], q[1])) || q[2] < 3 || rng() > orchardP) continue;
        w.put(['trees_A_medium', 'trees_B_medium', 'tree_single_A', 'tree_single_B'][Math.floor(rng() * 4)], q[0], q[1], { flip: rng() < 0.5, sc: 0.85 }); claim(q[0], q[1]);
    }

    // ── the wilds (outside the wall) ──
    const outer = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const k = w.cell[r][c];
        if (k.water || k.river || k.coast || used.has(key(c, r)) || cdist(c, r) <= WALL_RING) continue;
        outer.push([c, r]);
    }
    const TREES = ['trees_A_large', 'trees_B_large', 'trees_A_medium', 'trees_B_medium'];
    if (land) KT.populate(S, w, { used, claim, B, team, key, cdist, angleDeg, wallRing: WALL_RING + (TIER.doubleWalls ? 2 : 0) });
    else {
    let mine = null, mill = null, windmill = null, lighthouse = null, fieldsN = 0, farmHome = false;
    for (const [c, r] of outer) {
        const a = angleDeg(c, r), d = cdist(c, r), x = rng();
        if (angleDeg(c, r) > 205 && angleDeg(c, r) < 335 && d >= 5) {  // north: mountains + hills
            if (d >= 6 && x < 0.62) { w.put(['mountain_A_grass_trees', 'mountain_B_grass_trees', 'mountain_C_grass_trees', 'mountain_A', 'mountain_B'][Math.floor(rng() * 5)], c, r); claim(c, r); if (!mine && x < 0.12) mine = [c, r]; }
            else if (x < 0.85) { w.put(['hills_A_trees', 'hills_B_trees', 'hills_C_trees', 'hills_A'][Math.floor(rng() * 4)], c, r); claim(c, r); }
        } else if (a > 130 && a < 250) {                              // west/southwest: forest
            if (x < 0.72) { w.put(TREES[Math.floor(rng() * 4)], c, r, { flip: rng() < 0.5 }); claim(c, r); }
            else if (x < 0.8) { w.put('rock_single_' + 'ABCDE'[Math.floor(rng() * 5)], c, r, { dx: (rng() - 0.5) * 0.8, dz: (rng() - 0.5) * 0.6 }); }
        } else if (a >= 20 && a <= 130 && d <= 6) {                   // south-east: farmland
            if (fieldsN < 5 && x < 0.55) { w.put('building_grain', c, r, { layer: 'flat' }); fieldsN++; claim(c, r); }
            else if (!windmill && x < 0.7) { windmill = [c, r]; w.put(B('windmill'), c, r); claim(c, r); }
            else if (!farmHome && x < 0.85) { farmHome = true; w.put(K.houseName(rng, w.biome || 'isle', { view: 'top', farm: true, kinds: ['barn', 'cottage'] }) || B('home_A'), c, r, { flip: true }); claim(c, r); }
        } else if (x < 0.4) {                                         // everywhere else: sparse copses
            w.put(TREES[2 + Math.floor(rng() * 2)], c, r, { flip: rng() < 0.5 }); claim(c, r);
        }
    }
    // lumber mill beside the forest, mill on the river, mine in the mountains
    const pick = (pred) => { for (const [c, r] of outer) if (!used.has(key(c, r)) && pred(c, r)) return [c, r]; return null; };
    const lm = pick((c, r) => { const a = angleDeg(c, r); return a > 150 && a < 230 && cdist(c, r) <= 6; });
    if (lm) { w.put(B('lumbermill'), lm[0], lm[1]); claim(lm[0], lm[1]); }
    if (mine) w.put(B('mine'), mine[0], mine[1]);
    const wm = riverCells.map(([c, r]) => [c, r]).find(([c, r]) => !w.cell[r][c].water);
    if (wm) {
        const nb = freeNbrs(wm[0], wm[1], 9)[0];
        if (nb) { w.put(B('watermill'), nb[0], nb[1]); claim(nb[0], nb[1]); }
    }
    // lighthouse on the south-western shore (tower_B)
    const shore = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const k = w.cell[r][c]; if (k.coast && !used.has(key(c, r)) && angleDeg(c, r) > 85 && angleDeg(c, r) < 135) shore.push([c, r]); }
    if (shore.length) { lighthouse = shore[Math.floor(rng() * shore.length)]; w.put(B('tower_B'), lighthouse[0], lighthouse[1], { sc: 0.9 }); }
    }

    // the citadel entrance: a stone gatehouse over the south gate, flanked by torches and the guild banner
    if (K.hasSprite('struct_gate_0', 'top')) {
        w.put('struct_gate_0', gateCell[0], gateCell[1], { sc: 1.5, sort: 0.6 });
        w.put('barrel', gateCell[0], gateCell[1], { dx: 1.35, dz: 0.8 }); w.put('crate_A_small', gateCell[0], gateCell[1], { dx: -1.35, dz: 0.85 });
    }

    // gate flags + garden props inside the walls
    w.put('flag_' + team, gateCell[0], gateCell[1], { dx: -1.0, dz: 0.55, h: 0 });
    w.put('flag_' + team, gateCell[0], gateCell[1], { dx: 1.0, dz: 0.55, h: 0 });
    for (const [c, r] of K.ring(CC, CR, 2).concat(K.ring(CC, CR, 3))) {
        if (used.has(key(c, r)) || !w.inb(c, r) || w.cell[r][c].water) continue;
        const x = rng();
        if (x < 0.22) w.put(TREES[2 + (x < 0.11 ? 0 : 1)], c, r, { flip: rng() < 0.5, sc: 0.8 });
        else if (x < 0.30) w.put('rock_single_' + 'ABCDE'[Math.floor(rng() * 5)], c, r);
        else if (x < 0.36) w.put('building_well_' + team, c, r);
    }

    return { w, castle, gateCell, hall, train, treas, team, smokeAnchors, fall };
}

// ── overlays ──
function cobbleOverlay(ctx, w, c, r, k) {
    // stone paving drawn UNDER every object on a road / forecourt cell (hall-tier law,
    // owner 2026-10-19: "stone roads instead of dirt") — warm-gray slab with seeded
    // cobbles, clipped to the cell polygon so it can never bleed into neighbours
    const rnd = mulberry32(hashStr(`cobble:${c},${r}`));
    ctx.save();
    const poly = w.cellPoly(c, r, 0.015);
    ctx.beginPath();
    poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = 'rgba(158,150,138,0.96)';
    ctx.fill();
    const cx = poly.reduce((a, p) => a + p.x, 0) / 6, cy = poly.reduce((a, p) => a + p.y, 0) / 6;
    let ext = 0;
    for (const p of poly) ext = Math.max(ext, Math.hypot(p.x - cx, p.y - cy));
    for (let i = 0; i < 12; i++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * ext * 0.82;
        ctx.fillStyle = rnd() < 0.5 ? 'rgba(190,181,164,0.9)' : 'rgba(132,124,112,0.88)';
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.82, (3 + rnd() * 3.4) * (ext / 40), (2.4 + rnd() * 2.8) * (ext / 40), rnd() * 3, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function plotOverlay(ctx, w, c, r, tag, k) {
    ctx.save();
    ctx.setLineDash([14 * k * 2, 9 * k * 2]);
    ctx.lineWidth = Math.max(2, 3.2 * k * 2);
    ctx.strokeStyle = 'rgba(255,214,120,0.95)';
    K.hexPath(ctx, w, c, r, 0.13);
    ctx.stroke();
    ctx.setLineDash([]);
    // plaque
    const wc = K.hexWorld(c, r);
    const p = w.proj(wc.x, wc.z + 0.25, 0);
    const label = /^\d+$/.test(tag) ? `PLOT ${tag}` : `${tag} PLOT`;
    ctx.font = `${Math.round(17 * k * 2)}px Cinzel`;
    const tw = ctx.measureText(label).width;
    const bw = tw + 22 * k * 2, bh = 26 * k * 2;
    ctx.fillStyle = 'rgba(30,20,10,0.84)';
    K.roundRect(ctx, p.x - bw / 2, p.y - bh / 2, bw, bh, 8 * k * 2);
    ctx.fill();
    ctx.strokeStyle = '#d6a845'; ctx.lineWidth = Math.max(1.2, 1.6 * k * 2);
    K.roundRect(ctx, p.x - bw / 2, p.y - bh / 2, bw, bh, 8 * k * 2);
    ctx.stroke();
    ctx.fillStyle = '#f0dba0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, p.x, p.y + 1);
    ctx.restore();
}

function plaque(ctx, x, y, title, sub, k) {
    ctx.save();
    const f1 = Math.round(19 * k * 2), f2 = Math.round(14 * k * 2);
    ctx.font = `${f1}px Cinzel`;
    const w1 = ctx.measureText(title).width;
    ctx.font = `${f2}px Medieval`;
    const w2 = ctx.measureText(sub).width;
    const bw = Math.max(w1, w2) + 26 * k * 2, bh = (f1 + f2 + 16 * k * 2);
    ctx.fillStyle = 'rgba(28,19,10,0.88)';
    K.roundRect(ctx, x - bw / 2, y, bw, bh, 9 * k * 2); ctx.fill();
    ctx.strokeStyle = '#a67c2e'; ctx.lineWidth = Math.max(1.4, 2 * k * 2);
    K.roundRect(ctx, x - bw / 2, y, bw, bh, 9 * k * 2); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${f1}px Cinzel`; ctx.fillStyle = '#ecd9a6'; ctx.fillText(title, x, y + f1 * 0.85);
    ctx.font = `${f2}px Medieval`; ctx.fillStyle = '#c9a65a'; ctx.fillText(sub, x, y + f1 + f2 * 0.8 + 6 * k * 2);
    ctx.restore();
}

async function loadCrest(state) {
    try { if (state && typeof state.emblemImg === 'string' && /^data:image\/(png|jpe?g|webp);base64,/.test(state.emblemImg)) return await require('canvas').loadImage(state.emblemImg); } catch (e) { /* glyph fallback */ }
    return null;
}
const crestKey = (state) => (state && state.emblemImg ? hashStr(String(state.emblemImg)) : '');

function drawBanner(ctx, x, y, k, flagCol, flagD, icon, t, crest) {
    // the guild EMBLEM crowns the castle (owner 2026-10-19: "by guild banner I ment the
    // guild emblem, it ahould be the thing onto of the castle") — a heraldic shield on a
    // short mast at the keep peak, flanked by two small waving pennants so the top of
    // the keep still moves on the animated card.
    const k2 = k * 2;
    const mastH = 22 * k2, sw = 74 * k2, sh = 92 * k2;
    ctx.save();
    ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = Math.max(2, 3.2 * k2);
    // the mast dips behind the keep's roof mass so the crest reads as planted on the
    // castle (works across every hall's keep shape — no per-level anchor tuning)
    ctx.beginPath(); ctx.moveTo(x, y + 26 * k2); ctx.lineTo(x, y - mastH); ctx.stroke();
    const topY = y - mastH - sh;
    // flanking pennants fly from the shield's shoulders (drawn first, shield covers the roots)
    const penn = (sx, dir) => {
        const py = topY + 10 * k2, pw = 36 * k2, ph = 17 * k2;
        ctx.beginPath();
        const wv = (u) => Math.sin(u * 5 + t * Math.PI * 2 + (dir > 0 ? 0.9 : 2.4)) * 2.8 * k2 * u;
        ctx.moveTo(sx, py);
        for (let u = 0; u <= 1.001; u += 0.2) ctx.lineTo(sx + dir * u * pw, py + wv(u));
        for (let u = 1; u >= -0.001; u -= 0.2) ctx.lineTo(sx + dir * u * pw, py + ph + wv(u));
        ctx.closePath();
        const g2 = ctx.createLinearGradient(sx, py, sx + dir * pw, py + ph);
        g2.addColorStop(0, flagCol); g2.addColorStop(1, flagD);
        ctx.fillStyle = g2; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = Math.max(1, 1.2 * k2); ctx.stroke();
    };
    penn(x - sw * 0.46, -1); penn(x + sw * 0.46, 1);
    // heater shield: emblemColor field, gold trim, inner light border, emblem glyph large
    const shield = (w0, y0, h0) => {
        ctx.beginPath();
        ctx.moveTo(x - w0 / 2, y0);
        ctx.lineTo(x + w0 / 2, y0);
        ctx.quadraticCurveTo(x + w0 / 2, y0 + h0 * 0.55, x, y0 + h0);
        ctx.quadraticCurveTo(x - w0 / 2, y0 + h0 * 0.55, x - w0 / 2, y0);
        ctx.closePath();
    };
    shield(sw, topY, sh);
    const g = ctx.createLinearGradient(x, topY, x, topY + sh);
    g.addColorStop(0, flagCol); g.addColorStop(1, flagD);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#e8c15a'; ctx.lineWidth = Math.max(2, 3.4 * k2); ctx.stroke();
    shield(sw - 9 * k2, topY + 4.5 * k2, sh - 7 * k2);
    ctx.strokeStyle = 'rgba(255,244,208,0.5)'; ctx.lineWidth = Math.max(1, 1.6 * k2); ctx.stroke();
    if (crest) {                                                   // the guild's UPLOADED crest fills the shield (owner: emblem.img)
        ctx.save();
        shield(sw - 9 * k2, topY + 4.5 * k2, sh - 7 * k2); ctx.clip();
        const bw0 = sw - 9 * k2, bh0 = sh - 7 * k2, by0 = topY + 4.5 * k2;
        const sc0 = Math.max(bw0 / crest.width, bh0 / crest.height);
        ctx.drawImage(crest, x - crest.width * sc0 / 2, by0 + bh0 / 2 - crest.height * sc0 / 2, crest.width * sc0, crest.height * sc0);
        ctx.restore();
        shield(sw - 9 * k2, topY + 4.5 * k2, sh - 7 * k2);
        ctx.strokeStyle = 'rgba(255,244,208,0.55)'; ctx.lineWidth = Math.max(1, 1.6 * k2); ctx.stroke();
    } else if (icon) {
        ctx.fillStyle = '#fff4d0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = emojiFont(String(icon).slice(0, 2), 36 * k2);
        fillTextMixed(ctx, String(icon).slice(0, 2), x, topY + sh * 0.4);
    }
    // gold finial on the mast tip
    ctx.fillStyle = '#e8c15a';
    ctx.beginPath(); ctx.arc(x, topY - 4 * k2, 4.2 * k2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

// ── scene cache: the static art (no HUD, no animation) per state ──
const _scenes = new Map();
const SCENE_MAX = 4;
function sceneKey(state, opts) {
    return hashStr(JSON.stringify(['guild-life1', state.name, state.level, state.archetype, state.buildings, state.memberCount, state.emblemColor, state.emblemIcon, crestKey(state), state.biome, state.continent, (opts && opts.celebrate && typeof opts.celebrate === 'object') ? opts.celebrate : '']));
}

async function buildScene(state, opts = {}) {
    ensureFonts();
    const key0 = sceneKey(state, opts);
    const hit = _scenes.get(key0);
    if (hit) { _scenes.delete(key0); _scenes.set(key0, hit); return hit; }

    const cel = (opts.celebrate && typeof opts.celebrate === 'object') ? opts.celebrate : null;
    const { w, castle, hall, train, treas, team, gateCell, smokeAnchors, fall } = buildWorld(state, cel);
    const pad = { top: 190, bottom: 190, left: 36, right: 36 };
    // keep the card size and castle framing of the old 17x15 layout, but let the (larger) grid fill every pixel of it
    const ref = new K.HexWorld(OLD_COLS, OLD_ROWS, { scale: SCALE, biome: w.biome });
    const { W, H } = ref.layout(pad);
    const oc = K.hexWorld(OLD_CC, OLD_CR), refP = ref.proj(oc.x, oc.z, 0);
    w.layout(pad);
    const nc = K.hexWorld(CC, CR), newP = w.proj(nc.x, nc.z, 0);
    w.ox += refP.x - newP.x; w.oy += refP.y - newP.y; w.W = W; w.H = H;
    const canvas = require('canvas').createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const seed = hashStr(state.name || 'guild');
    const biome0 = w.biome;
    const bi = (K.biomeInfo().biomes || {})[w.biome];
    const bd = biome0 === 'isle' ? { top: '#cfe8ef', mid: '#8fc7b2', bot: '#3f7a5c' } : bi ? { top: bi.backdrop[0], mid: bi.backdrop[1], bot: bi.backdrop[2] } : {};
    await w.draw(ctx, { drawBackdrop: (c2) => K.paintBackdrop(c2, W, H, seed, { clouds: 8, cloudScale: SCALE * 1.05, ...bd }) });

    // facility plaques + banner (drawn over the art, anchored under each facility)
    const k = SCALE;
    const placePlaque = (cell, id, lvl) => {
        const wc = K.hexWorld(cell[0], cell[1]);
        const p = w.proj(wc.x, wc.z + 1.15, 0);
        const def = GUILD_STRUCTS[id];
        const lv = def.levels[lvl - 1];
        plaque(ctx, p.x, p.y + 4 * k * 2, def.name, `${lv.name} · Lv ${lvl}`, k);
    };
    if (hall > 0) placePlaque(castle, 'hall', hall);
    if (train > 0) placePlaque(SLOT.training, 'training', train);
    if (treas > 0) placePlaque(SLOT.treasury, 'treasury', treas);

    const archC = ARCH[state.archetype] || ARCH.ADVENTURER;
    const flagCol = (state.emblemColor && /^#[0-9a-fA-F]{3,8}$/.test(state.emblemColor)) ? state.emblemColor : archC.flag;
    const wc = K.hexWorld(castle[0], castle[1]);
    const roofH = [0, 2.3, 2.2, 2.0, 4.1, 4.1][hall] || 2.5;
    const bpos = w.proj(wc.x, wc.z, roofH + 0.1);

    // ── life layer inputs (owner 2026-10-19 "bring it to life") ──
    const water = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (w.cell[r][c].tile !== 'hex_water') continue;
        const poly = w.cellPoly(c, r, -0.2);
        const cx = poly.reduce((a, p) => a + p.x, 0) / 6, cy = poly.reduce((a, p) => a + p.y, 0) / 6;
        if (cx < -80 || cx > W + 80 || cy < -80 || cy > H + 80) continue;
        let shore = false;                                       // touches land → ripple rings
        for (let d = 0; d < 6 && !shore; d++) { const nb = K.neighbor(c, r, d); const nk = w.at(nb[0], nb[1]); if (nk && !nk.water && !nk.river && !nk.void) shore = true; }
        water.push({ poly, cx, cy, h: hashStr(`${c},${r}`), shore });
    }
    const sway = await ambient.swayTrees(w);
    const walkers = ambient.buildWalkers(w, seed, { n: 9, maxY: H - 190 });   // villagers on the roads
    const boats = ambient.buildBoats(water, seed, k);                     // wilds trees for the wind shuffle
    const smoke = smokeAnchors.map((a) => { const p = w.proj(a.x, a.z + 0.35, a.h); return { x: p.x, y: p.y, smoky: false }; });
    const scene = { canvas, W, H, w, banner: { x: bpos.x, y: bpos.y, flagCol, flagD: archC.flagD, icon: state.emblemIcon || '', crest: await loadCrest(state) }, k, biome: w.biome, realm: w.biome, water, sway, walkers, boats, smoke, seed, fall };
    _scenes.set(key0, scene);
    while (_scenes.size > SCENE_MAX) _scenes.delete(_scenes.keys().next().value);
    return scene;
}

// ═══════════════════════════════════════════════════════════════════════════
//  FRAME RENDER (frame 0 = the static card)
// ═══════════════════════════════════════════════════════════════════════════
const ANIM_SCALE = parseFloat(process.env.RENDER_GUILD_ANIM_SCALE || '0.62') || 0.62;
async function renderFrame(state, frame, opts = {}) {
    const sc = await buildScene(state, opts);
    // animated (mp4) frames compose at reduced size — same trick as the homestead renderer
    const as = opts.encoder === 'raw' ? ANIM_SCALE : 1;
    const out = require('canvas').createCanvas(Math.round(sc.W * as / 2) * 2, Math.round(sc.H * as / 2) * 2);
    const ctx = out.getContext('2d');
    if (as !== 1) ctx.scale(out.width / sc.W, out.height / sc.H);
    ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(sc.canvas, 0, 0);
    const t = (frame || 0) / FRAMES;
    // waving banner over the keep
    if (sc.banner) drawBanner(ctx, sc.banner.x, sc.banner.y, sc.k, sc.banner.flagCol, sc.banner.flagD, sc.banner.icon, t, sc.banner.crest);
    if (opts.animate || frame > 0) {
        const seed = hashStr(state.name || 'guild');
        ambient.animateWater(ctx, sc, t, await ambient.glints());   // lakes/lava shimmer + sparkles + shore ripples
        ambient.drawSway(ctx, sc.sway, t);                          // wilds trees shuffle
        ambient.drawBoats(ctx, sc.boats, t, sc.k);                  // sailboats on the lakes
        ambient.drawWalkers(ctx, sc.walkers, t, sc.k);              // villagers strolling the roads
        ctx.save();
        for (const s of sc.smoke) {                              // hearth smoke over the keep + hamlet
            for (let i = 0; i < 4; i++) {
                const ph = (t + i / 4) % 1;
                ctx.globalAlpha = 0.5 * (1 - ph);
                ctx.fillStyle = s.smoky ? '#6b6b73' : '#d8d8de';
                ctx.beginPath(); ctx.arc(s.x + Math.sin(ph * 5 + i) * 4 * sc.k * 2 + ph * 6, s.y - ph * 42 * sc.k * 2, (3 + ph * 7) * sc.k * 2, 0, Math.PI * 2); ctx.fill();
            }
        }
        for (let i = 0; i < 26; i++) {                           // fireflies around the keep
            const r1 = mulberry32(seed + 900 + i)(), r2 = mulberry32(seed + 1900 + i)();
            const ph = (t + r1) % 1;
            ctx.globalAlpha = 0.7 * Math.sin(ph * Math.PI);
            ctx.fillStyle = i % 3 ? '#ffffff' : '#ffe9a8';
            ctx.beginPath();
            ctx.arc(sc.W * (0.05 + 0.9 * r1), sc.H * (0.18 + 0.62 * r2) - ph * 12, 1.6 + (i % 3), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
        ambient.drawCloudShadows(ctx, sc.W, sc.H, t, seed);      // slow light drift
        ambient.drawBirds(ctx, sc.W, sc.H, t, seed);             // flocks crossing
        ambient.drawButterflies(ctx, sc.W, sc.H, t, seed);       // garden flutter
        ambient.drawTint(ctx, sc.W, sc.H, t);                    // warm/cool breathing
    }
    if (opts.celebrate) {
        // owner 2026-10-19: the upgraded facility falls in and the confetti explodes FROM it —
        // landing celebrate when the frame knows the target, card-wide rain otherwise
        const cel = (opts.celebrate && typeof opts.celebrate === 'object') ? opts.celebrate : null;
        const celSeed = hashStr(state.name || 'guild');
        if (!(cel && sc.fall && await K.paintLanding(ctx, sc.w, sc.W, sc.H, t, celSeed, sc.k, sc.fall))) {
            K.paintConfetti(ctx, sc.W, sc.H, t, celSeed, sc.k);
        }
    }
    drawHud(ctx, state, opts, sc.W, sc.H);
    if (opts.encoder === 'raw') return { raw: out.toBuffer('raw'), w: out.width, h: out.height };
    if (opts.returnCanvas) return out;
    return out.toBuffer('image/png');
}

// ── HUD plate ──
function drawHud(ctx, state, opts, W, H) {
    const Hh = 132, Wp = W - 60;
    const x0 = 30, y0 = H - Hh - 22;
    ctx.save();
    ctx.fillStyle = 'rgba(24,17,10,0.88)';
    K.roundRect(ctx, x0, y0, Wp, Hh, 14);
    ctx.fill();
    ctx.strokeStyle = '#a67c2e';
    ctx.lineWidth = 2.5;
    K.roundRect(ctx, x0 + 4, y0 + 4, Wp - 8, Hh - 8, 10);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(166,124,46,0.35)';
    ctx.lineWidth = 1;
    K.roundRect(ctx, x0 + 9, y0 + 9, Wp - 18, Hh - 18, 8);
    ctx.stroke();

    const arch = ARCH[state.archetype] ? state.archetype : 'ADVENTURER';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e8d5a3';
    ctx.font = '26px "Cinzel Deco", Cinzel';
    ctx.textAlign = 'left';
    ctx.fillText(`${state.emblemIcon ? state.emblemIcon + ' ' : ''}${String(state.name || 'Guild').slice(0, 20)}`, x0 + 26, y0 + 34);
    ctx.font = '16px Medieval';
    ctx.fillStyle = '#9c8455';
    ctx.fillText(`${ARCH[arch].label} Guild · Level ${state.level || 1} · ${require('./continents').continentOf(state).name.replace(/^The /, '')}`, x0 + 26, y0 + 60);

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
        K.roundRect(ctx, chipX - 52, y0 + 22, 100, 40, 8);
        ctx.fill();
        ctx.font = '16px Cinzel';
        ctx.fillStyle = built ? '#e8d5a3' : '#7a663f';
        ctx.fillText(`${label} ${built ? `L${lvl}` : '—'}`, chipX - 2, y0 + 43);
        chipX -= 116;
    }

    ctx.textAlign = 'center';
    ctx.font = '15px Medieval';
    ctx.fillStyle = '#7a663f';
    const foot = opts.hint || (state.motto ? `“${String(state.motto).slice(0, 70)}”` : `${PREFIX} guild upgrade hall • ${PREFIX} guild donate • ${PREFIX} guild perks`);
    ctx.fillText(foot, x0 + Wp / 2, y0 + Hh - 24);
    ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════════
//  mp4 encode (celebrate moments) — same raw-BGRA → ffmpeg stdin streaming
// ═══════════════════════════════════════════════════════════════════════════
const FRAME_BREATH_MS = 8;
const breath = () => new Promise((r) => setTimeout(r, FRAME_BREATH_MS));

async function encodeFramesToMp4(frames) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gbase-'));
    const out = path.join(tmp, 'gbase.mp4');
    try {
        if (frames.length && frames[0] && frames[0].raw) {
            const { w, h } = frames[0];
            const fbin = process.env.FFMPEG_PATH || 'ffmpeg';
            const args = [
                '-f', 'rawvideo', '-pix_fmt', 'bgra', '-video_size', `${w}x${h}`,
                '-framerate', `${1000 / FRAME_MS}`, '-i', 'pipe:0',
                '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
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
                    for (const f of frames) { if (!p.stdin.write(f.raw)) await new Promise((r2) => p.stdin.once('drain', r2)); }
                    p.stdin.end();
                })().catch(reject);
            });
            return fs.readFileSync(out);
        }
        throw new Error('encodeFramesToMp4: raw frames required');
    } finally {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    }
}

// OUT ENCODER — card ships downscaled + JPEG (owner Task 36: phones show ~1200px)
const OUT_MAX_W = Math.max(640, parseInt(process.env.RENDER_OUT_MAX_W || '2560', 10) || 2560);
const OUT_JPEG_Q = Math.min(0.95, Math.max(0.5, parseFloat(process.env.RENDER_OUT_JPEG_Q || '0.9') || 0.9));
function encodeOut(canvas) {
    let c = canvas;
    if (canvas.width > OUT_MAX_W) {
        const h = Math.round(canvas.height * OUT_MAX_W / canvas.width);
        c = require('canvas').createCanvas(OUT_MAX_W, h);
        c.getContext('2d').drawImage(canvas, 0, 0, OUT_MAX_W, h);
    }
    return { buffer: c.toBuffer('image/jpeg', { quality: OUT_JPEG_Q }), contentType: 'image/jpeg' };
}

// HOT CACHE BYTE CAP
const RENDER_CACHE_MAX_BYTES = 64 * 1048576;
function cachePut(map, k, out) {
    let total = (out && out.buffer && out.buffer.length) || 0;
    for (const v of map.values()) total += (v && v.buffer && v.buffer.length) || 0;
    while (total > RENDER_CACHE_MAX_BYTES && map.size) {
        const oldestKey = map.keys().next().value;
        const v = map.get(oldestKey);
        total -= (v && v.buffer && v.buffer.length) || 0;
        map.delete(oldestKey);
    }
    map.set(k, { ...out, ts: Date.now() });
}

const _renderCache = new Map();
const CACHE_TTL = 10 * 60 * 1000;
function stateHash(state, opts = {}) {
    return hashStr(JSON.stringify(['v12-life', state.name, state.biome || '', state.continent || '', state.level, state.archetype, state.buildings, state.memberCount, state.memberCap, state.emblemColor, state.emblemIcon, crestKey(state), state.motto, opts.hint || '', opts.static === true ? 1 : 0, opts.celebrate ? JSON.stringify(opts.celebrate) : '']));
}

async function renderGuildBaseImage(state, opts = {}) {
    const k = stateHash(state, opts);
    const hit = _renderCache.get(k);
    if (hit && (Date.now() - hit.ts) < CACHE_TTL) return hit;
    const out = await mediaCache.cached('guildbase', k, async () => {
        // static card only when explicitly asked (opts.static === true): composite once → JPEG
        if (opts.static === true) return encodeOut(await renderFrame(state, 0, { ...opts, returnCanvas: true }));
        // animated card (DEFAULT — owner 2026-10-19: "the guild card should also be a gif"):
        // water shimmer + sparkles + sway + smoke + birds + tint + banner wave, raw frames → ffmpeg
        // STREAMING BAKE (47-k10, Task-37 pattern): feed ffmpeg's stdin AS frames
        // render — the old loop held all 20 raw BGRA frames before encoding; now
        // one frame lives at a time and the encode overlaps the render.
        try {
            const f0 = await renderFrame(state, 0, { ...opts, encoder: 'raw', animate: true });
            await breath();
            const mp4 = await encodeRawStreamMp4({
                first: f0, count: FRAMES, frameMs: FRAME_MS, tmpPrefix: 'guild',
                next: async (f) => { const fr = await renderFrame(state, f, { ...opts, encoder: 'raw', animate: true }); await breath(); return fr; },
            });
            if (mp4 && mp4.length > 1000) return { buffer: mp4, contentType: 'video/mp4' };
        } catch (e) {
            console.error('[guildBaseRenderer] mp4 encode failed, JPEG fallback:', e.message);
        }
        return encodeOut(await renderFrame(state, 0, { ...opts, returnCanvas: true }));
    }, { state, opts: { hint: opts.hint, celebrate: opts.celebrate } },   // 47-k8c: journal for renderWarmer (post-deploy re-bake; `static` stripped so replays take the default mp4 path)
    { label: 'bake:guildbase', timeoutMs: 90000 });   // 47-k9: serialize through renderQueue — concurrent .j bakes pm2-killed the box (2026-10-20 03:11Z)
    cachePut(_renderCache, k, out);
    return out;
}


// ═══════════════════════════════════════════════════════════════════════════
//  GUILD HALL CARD — `.j guild`: the keep zoomed in, the emblem crowning it, and the
//  guild's information on the panel (owner 2026-10-20: "the guild hall should obviously
//  be a card zoomed in with the guilds information"). Static JPEG, disk-cached.
//  spec → structureScenes.drawPanel (title/subtitle/rows/actions/note/footer/banner)
// ═══════════════════════════════════════════════════════════════════════════
const HALL_W = 1400, HALL_H = 1000, HALL_ZOOM = 0.78;
async function renderGuildHallCard(state, spec = {}) {
    const key = hashStr(JSON.stringify(['hall2', state.name, state.biome || '', state.continent || '', state.level, state.archetype, state.buildings, state.memberCount, state.emblemColor, state.emblemIcon, crestKey(state), spec]));
    return mediaCache.cached('guildhall', key, async () => {
        try { require('./worldMapRenderer')._ensureFonts(); } catch (e) { /* default fonts */ }
        const SC = require('./structureScenes');
        const { w, castle, hall } = buildWorld(state, null);
        w.scale = HALL_ZOOM;
        const wc = K.hexWorld(castle[0], castle[1]);
        w.layoutFixed(HALL_W, HALL_H, wc.x, wc.z + 0.5, HALL_W / 2, (HALL_H - SC.PANEL_H) * 0.76);
        const cv = require('canvas').createCanvas(HALL_W, HALL_H), ctx = cv.getContext('2d');
        const seed = hashStr(state.name || 'guild');
        const bi = (K.biomeInfo().biomes || {})[w.biome];
        const bd = w.biome === 'isle' ? { top: '#cfe8ef', mid: '#8fc7b2', bot: '#3f7a5c' } : bi ? { top: bi.backdrop[0], mid: bi.backdrop[1], bot: bi.backdrop[2] } : {};
        await w.draw(ctx, { drawBackdrop: (c2) => K.paintBackdrop(c2, HALL_W, HALL_H, seed, { clouds: 6, cloudScale: HALL_ZOOM, ...bd }) });
        const archC = ARCH[state.archetype] || ARCH.ADVENTURER;
        const flagCol = (state.emblemColor && /^#[0-9a-fA-F]{3,8}$/.test(state.emblemColor)) ? state.emblemColor : archC.flag;
        const roofH = [0, 2.3, 2.2, 2.0, 4.1, 4.1][Math.max(0, Math.min(5, hall))] || 2.5;
        const bp = w.proj(wc.x, wc.z, roofH + 0.1);
        drawBanner(ctx, bp.x, bp.y, HALL_ZOOM, flagCol, archC.flagD, state.emblemIcon || '', 0.1, await loadCrest(state));
        const vg = ctx.createRadialGradient(HALL_W / 2, HALL_H * 0.42, HALL_H * 0.25, HALL_W / 2, HALL_H * 0.45, HALL_H * 0.95);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.34)');
        ctx.fillStyle = vg; ctx.fillRect(0, 0, HALL_W, HALL_H);
        SC.drawPanel(ctx, HALL_W, HALL_H, { accent: flagCol, ...spec });
        return { buffer: cv.toBuffer('image/jpeg', { quality: 0.9 }), contentType: 'image/jpeg' };
    });
}

module.exports = { GUILD_STRUCTS, GUILD_PLOTS, ARCH, FRAMES, renderFrame, renderGuildBaseImage, renderGuildHallCard, encodeFramesToMp4 };
