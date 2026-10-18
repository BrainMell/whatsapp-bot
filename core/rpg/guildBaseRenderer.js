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

const FRAMES = 14, FRAME_MS = 110;
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
const WALL_RING = 4;
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

function buildWorld(state) {
    const seed = hashStr(state.name || 'guild');
    const rng = mulberry32(seed);
    const arch = ARCH[state.archetype] ? state.archetype : 'ADVENTURER';
    const team = ARCH[arch].team;
    const hall = Math.max(0, Math.min(5, parseInt((state.buildings || {}).hall, 10) || 0));
    const train = Math.max(0, Math.min(5, parseInt((state.buildings || {}).training, 10) || 0));
    const treas = Math.max(0, Math.min(5, parseInt((state.buildings || {}).treasury, 10) || 0));
    const members = Math.max(0, Math.min(40, parseInt(state.memberCount, 10) || 0));

    const biome = KT.pickBiome(state);
    const land = true;                      // every biome (incl. the coastal 'isle') comes from the terrain generator
    const w = new K.HexWorld(COLS, ROWS, { scale: SCALE, biome, oobWater: !land });
    const used = new Set();                 // cells claimed by structures/props
    const claim = (c, r) => used.add(key(c, r));

    let riverCells = [];
    let S = null;
    if (land) {
        // land biomes: ragged haze-edged silhouette, lakes/lava pools, optional river (no sea)
        S = KT.shape(w, { seed, biome, CC, CR, keepR: 5, wallRing: WALL_RING, angleDeg, cdist });
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

    // ── wall ring + south gate ──
    const ringCells = K.ring(CC, CR, WALL_RING);
    const gateRow = CR + WALL_RING;
    const gateCell = ringCells.filter(([, r]) => r === gateRow).sort((a, b) => Math.abs(a[0] - CC) - Math.abs(b[0] - CC))[0];
    for (const [c, r] of ringCells) claim(c, r);
    w.layWall(ringCells, { closed: true, gates: new Set([key(gateCell[0], gateCell[1])]), outside: true });

    // ── roads: gate → castle avenue + spur to each facility/plot + road out of the gate ──
    const mainRoad = K.hexLine(gateCell[0], gateCell[1], CC, CR);
    const roadSet = new Set();
    const addRoad = (cells) => { for (const [c, r] of cells) { if (!w.inb(c, r) || w.cell[r][c].water || w.cell[r][c].wall && key(c, r) !== key(gateCell[0], gateCell[1])) continue; roadSet.add(key(c, r)); } };
    addRoad(mainRoad.slice(1));                                           // inside the walls (gate cell stays a wall piece)
    const outRoad = K.hexLine(gateCell[0], gateCell[1], CC, Math.min(ROWS - 2, CR + 8)).slice(1);
    for (const [c, r] of outRoad) {
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

    // ── helpers for placing buildings ──
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

    // ── CASTLE (hall) ──
    const castle = [CC, CR];
    if (hall === 0) {
        plotMarker(CC, CR, 'HALL');
        w.put('building_scaffolding', CC, CR, { sc: 0.9 });
    } else {
        w.put('building_dirt', CC, CR, { layer: 'flat' });
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
    if (train === 0) plotMarker(tc, tr, 'TRAINING');
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
    if (treas === 0) plotMarker(vc, vr, 'TREASURY');
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

    // ── member hamlet: one cottage per member (cap 12 on the plots' inner band) ──
    const hamlet = [];
    for (let d = 1; d <= 3; d++) for (const [c, r] of K.ring(CC, CR, d)) {
        if (used.has(key(c, r)) || !w.inb(c, r) || w.cell[r][c].water) continue;
        const a = angleDeg(c, r);
        if (a > 20 && a < 160) hamlet.push([c, r, d]);            // the southern half faces the viewer
    }
    hamlet.sort((a, b) => (a[2] - b[2]) * 2 + (rng() - 0.5));
    const homeN = Math.min(members, 12, hamlet.length);
    for (let i = 0; i < homeN; i++) {
        const [c, r] = hamlet[i];
        w.put(B(i % 3 === 1 ? 'home_B' : 'home_A'), c, r, { flip: i % 2 === 1 });
        claim(c, r);
    }

    // ── the wilds (outside the wall) ──
    const outer = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const k = w.cell[r][c];
        if (k.water || k.river || k.coast || used.has(key(c, r)) || cdist(c, r) <= WALL_RING) continue;
        outer.push([c, r]);
    }
    const TREES = ['trees_A_large', 'trees_B_large', 'trees_A_medium', 'trees_B_medium'];
    if (land) KT.populate(S, w, { used, claim, B, team, key, cdist, angleDeg, wallRing: WALL_RING });
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
            else if (!farmHome && x < 0.85) { farmHome = true; w.put(B('home_A'), c, r, { flip: true }); claim(c, r); }
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

    return { w, castle, gateCell, hall, train, treas, team };
}

// ── overlays ──
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

function drawBanner(ctx, x, y, k, flagCol, flagD, icon, t) {
    // pole + waving cloth above the castle roofline, emblem on the cloth
    const poleH = 86 * k * 2, cw = 70 * k * 2, ch = 46 * k * 2;
    ctx.save();
    ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = Math.max(2, 3.5 * k * 2);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - poleH); ctx.stroke();
    ctx.fillStyle = '#e8c15a'; ctx.beginPath(); ctx.arc(x, y - poleH - 3 * k * 2, 4.5 * k * 2, 0, Math.PI * 2); ctx.fill();
    const top = y - poleH + 2 * k * 2;
    ctx.beginPath();
    const wv = (u) => Math.sin(u * 6 + t * Math.PI * 2) * 3.5 * k * 2 * u;
    ctx.moveTo(x, top);
    for (let u = 0; u <= 1.001; u += 0.1) ctx.lineTo(x + u * cw, top + wv(u));
    for (let u = 1; u >= -0.001; u -= 0.1) ctx.lineTo(x + u * cw, top + ch + wv(u));
    ctx.closePath();
    const g = ctx.createLinearGradient(x, top, x + cw, top + ch);
    g.addColorStop(0, flagCol); g.addColorStop(1, flagD);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = Math.max(1, 1.4 * k * 2); ctx.stroke();
    if (icon) {
        ctx.fillStyle = '#fff4d0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `${Math.round(24 * k * 2)}px "Noto Sans", sans-serif`;
        ctx.fillText(String(icon).slice(0, 2), x + cw * 0.5, top + ch * 0.52 + wv(0.5));
    }
    ctx.restore();
}

// ── scene cache: the static art (no HUD, no animation) per state ──
const _scenes = new Map();
const SCENE_MAX = 4;
function sceneKey(state, opts) {
    return hashStr(JSON.stringify([state.name, state.level, state.archetype, state.buildings, state.memberCount, state.emblemColor, state.emblemIcon, state.biome, state.continent]));
}

async function buildScene(state) {
    ensureFonts();
    const key0 = sceneKey(state);
    const hit = _scenes.get(key0);
    if (hit) { _scenes.delete(key0); _scenes.set(key0, hit); return hit; }

    const { w, castle, hall, train, treas, team, gateCell } = buildWorld(state);
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

    const scene = { canvas, W, H, w, banner: { x: bpos.x, y: bpos.y, flagCol, flagD: archC.flagD, icon: state.emblemIcon || '' }, k };
    _scenes.set(key0, scene);
    while (_scenes.size > SCENE_MAX) _scenes.delete(_scenes.keys().next().value);
    return scene;
}

// ═══════════════════════════════════════════════════════════════════════════
//  FRAME RENDER (frame 0 = the static card)
// ═══════════════════════════════════════════════════════════════════════════
async function renderFrame(state, frame, opts = {}) {
    const sc = await buildScene(state);
    const out = require('canvas').createCanvas(sc.W, sc.H);
    const ctx = out.getContext('2d');
    ctx.drawImage(sc.canvas, 0, 0);
    const t = (frame || 0) / FRAMES;
    // waving banner over the keep
    if (sc.banner) drawBanner(ctx, sc.banner.x, sc.banner.y, sc.k, sc.banner.flagCol, sc.banner.flagD, sc.banner.icon, t);
    if (opts.animate || frame > 0) {
        // sea glints + drifting fireflies around the keep
        const seed = hashStr(state.name || 'guild');
        ctx.save();
        for (let i = 0; i < 26; i++) {
            const r1 = mulberry32(seed + 900 + i)(), r2 = mulberry32(seed + 1900 + i)();
            const ph = (t + r1) % 1;
            ctx.globalAlpha = 0.7 * Math.sin(ph * Math.PI);
            ctx.fillStyle = i % 3 ? '#ffffff' : '#ffe9a8';
            ctx.beginPath();
            ctx.arc(sc.W * (0.05 + 0.9 * r1), sc.H * (0.18 + 0.62 * r2) - ph * 12, 1.6 + (i % 3), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
    if (opts.celebrate) K.paintConfetti(ctx, sc.W, sc.H, t, hashStr(state.name || 'guild'), sc.k);   // upgrade celebration
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
    return hashStr(JSON.stringify(['v11-realms', state.name, state.biome || '', state.continent || '', state.level, state.archetype, state.buildings, state.memberCount, state.memberCap, state.emblemColor, state.emblemIcon, state.motto, opts.hint || '', opts.static === false ? 0 : 1]));
}

async function renderGuildBaseImage(state, opts = {}) {
    const k = stateHash(state, opts);
    const hit = _renderCache.get(k);
    if (hit && (Date.now() - hit.ts) < CACHE_TTL) return hit;
    const out = await mediaCache.cached('guildbase', k, async () => {
        // static card (default): composite once → JPEG
        if (opts.static !== false) return encodeOut(await renderFrame(state, 0, { ...opts, returnCanvas: true }));
        // animated bake (celebrate): banner wave + sea glints, raw frames → ffmpeg
        try {
            const frames = [];
            for (let f = 0; f < FRAMES; f++) {
                frames.push(await renderFrame(state, f, { ...opts, encoder: 'raw', animate: true }));
                await breath();
            }
            const mp4 = await encodeFramesToMp4(frames);
            if (mp4 && mp4.length > 1000) return { buffer: mp4, contentType: 'video/mp4' };
        } catch (e) {
            console.error('[guildBaseRenderer] mp4 encode failed, JPEG fallback:', e.message);
        }
        return encodeOut(await renderFrame(state, 0, { ...opts, returnCanvas: true }));
    });
    cachePut(_renderCache, k, out);
    return out;
}

module.exports = { GUILD_STRUCTS, GUILD_PLOTS, ARCH, FRAMES, renderFrame, renderGuildBaseImage, encodeFramesToMp4 };
