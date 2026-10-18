'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  HOMESTEAD BASE RENDERER — 3D hex player base (v8, owner 2026-10-18:
//  "make the player base look like a player base with the right terrain")
//
//  Same art + engine as the guild kingdom: KayKit Medieval Hexagon Pack (CC0)
//  baked to sprites (scripts/kingdom3d), composited by core/rpg/kingdom3d.js.
//  The persisted data model is UNCHANGED — structures still live on the
//  16x16 grid (x,y,fw,fh) so existing saves / baseBuilder.js keep working;
//  grid (x,y) maps to hex (col=x+M, row=y+M) on a bigger island whose
//  margin is the player's wilderness (biome rolled per owner seed).
//
//  Zones: house on the village green; mines = NW mountain quarry; pond = NE
//  lake; hunting grounds = west woods; the stone GATEHOUSE guards the south
//  gate on the main street; free expansion plots show as dashed build sites.
//  Public API unchanged: LAYOUT, N, FRAMES, renderFrame, renderBaseImage,
//  encodeFramesToMp4, structDef, structures.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const os = require('os');
const K = require('./kingdom3d');
const mediaCache = require('./mediaCache');

const N = 16;                 // base tiles per side (saved-structure grid)
const M = 3;                  // wilderness margin (hex cells) around the grid
const BLEED = 6;              // FULL-BLEED margin (owner 2026-10-18: no more floating island —
                              // the generation stretches to cover the full screen; these extra
                              // cells hang off every edge of the fixed canvas)
const COLS = N + 2 * (M + BLEED), ROWS = N + 2 * (M + BLEED);
const FRAMES = 14, FRAME_MS = 110;
const SCALE = parseFloat(process.env.RENDER_BASE_SCALE || '0.44') || 0.44;

const ASSETS = path.join(__dirname, '..', 'rpgasset', 'homestead');
const FONTS = path.join(__dirname, '..', 'rpgasset', 'fonts');

let STRUCT_DEF = null;
function structures() {
    if (!STRUCT_DEF) {
        try { STRUCT_DEF = JSON.parse(fs.readFileSync(path.join(ASSETS, 'structures.json'), 'utf8')); }
        catch (e) { STRUCT_DEF = { structures: [] }; }
    }
    return STRUCT_DEF;
}
function structDef(type) { return structures().structures.find((s) => s.id === type); }

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

// ── LAYOUT v3 (owner 2026-10-17 21:18Z "the arrangement of the houses??? All
// packed into the center?? Ass ... redesign their ordination, read up on
// house placement design for isometric or top down games ... leaving room
// for plots of land"): MAIN STREET VILLAGE — researched iso/top-down town
// design laws applied (roads & plazas are the lines that lead the eye;
// buildings FRONT streets with setbacks; focal space offset off dead-center;
// districts ring the green; T-junctions, no dead-end scrawl; expansion land
// fronts the lanes):
//   1. SOUTH GATE moves 5→8 and a cobble MAIN STREET runs gate → plaza →
//      north lane — the eye enters where the player enters
//   2. cobble PLAZA (3x3 ring, grass heart) at the street's T — offset NE of
//      the geometric centre, never a dead-center focal
//   3. the HOUSE fronts the plaza from the east across the street (hero
//      building faces the square) — pond stays NE (owner: "leave the pond
//      where it is"), mines NW, hunting woods west
//   4. lanes terminate at DESTINATIONS: miners' row west + pond lane east,
//      hunting walk through the fence gate, south lanes serving the plots
//   5. the 4 expansion plots re-anchor to FRONT the lanes (NE terrace, SE
//      terrace, south row, SW pocket) so the village grows along its streets
//   6. every frontage keeps ≥1 meadow setback — room for land, no cramming
//
// ── LAYOUT v4 ORIENTATION PASS (owner 2026-10-17 "The orientation still weird
// dude"): v3 moved the buildings but every sprite bakes ONE facing, so the
// smithy/medbay demo builds sat SOUTH of their lanes showing their backs,
// and the monumental stone gatehouse (the hunting structure!) stood mid-left
// aiming its arch at nothing while the real entrance was a bare fence gap.
//   1. THE GATEHOUSE GUARDS THE GATE: hunting moves (3,8)→(7,14) so its
//      2x2 footprint is CENTRED on the street column x=8 — the cobble main
//      street now passes straight THROUGH its arch into the village, and
//      the arch opening (which faces +y = along the street) greets the eye
//      entering the south fence gap. The west woods keep their fence gap at
//      the walk row (walkY) instead of a second gatehouse.
//   2. FACADE LAW (see NATURAL_FRONT below): every building checks which
//      street actually touches its front edge and MIRRORS when its natural
//      facade points the wrong way — no more backs to the road.
//   3. PLOTS re-anchor to the FRONTABLE sides of lanes (buildings can only
//      front a street from its north/west side — the south/east faces of an
//      iso box are the visible ones): #1 north terrace above the miners'/
//      pond lane, #2 SE terrace above the extended south lane, #3 west
//      main-street frontage (alchemy's natural +x facade), #4 SW pocket.
//   4. south lane east branch extended to x=14 so the SE terrace fronts it.
const LAYOUT = {
    N,
    house: { x: 10, y: 6, fw: 3, fh: 3 },
    mines: { x: 1, y: 1, fw: 2, fh: 2, zone: { x: 0, y: 0, fw: 5, fh: 4 } },
    pond: { x: 12, y: 1, fw: 2, fh: 2, zone: { x: 11, y: 0, fw: 5, fh: 4 } },
    // hunting = the stone gatehouse — now the VILLAGE GATE on the main
    // street (footprint centred on x=8); the woods gate gap lives at walkY.
    hunting: { x: 7, y: 14, fw: 2, fh: 2, zone: { x: 0, y: 5, fw: 4, fh: 8 }, fenceCol: 4, walkY: 9, walkH: 2 },
    paths: [
        // main street — gate yard (south) up to the north lane junction
        [8, 4], [8, 5], [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14], [8, 15],
        // plaza ring east of the street (grass heart at 8,7 — village green)
        [7, 6], [8, 6], [9, 6], [7, 7], [9, 7], [7, 8], [8, 8], [9, 8],
        // miners' row west + pond lane east (north lane, y=4)
        [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [9, 4], [10, 4], [11, 4], [12, 4], [13, 4],
        // hunting walk — plaza SW corner through the fence gate into the woods
        [7, 9], [6, 9], [5, 9], [4, 9], [3, 9], [2, 9],
        // south lanes serving the expansion plots — east branch runs to x=14
        // so the SE terrace (plot 2) fronts it from the north
        [7, 10], [6, 10], [5, 10], [9, 10], [10, 10], [11, 10], [12, 10], [13, 10], [14, 10],
    ],
};


// ═══════════════════════════════════════════════════════════════════════════
//  SCENE BUILD
// ═══════════════════════════════════════════════════════════════════════════
const hc = (x, y) => [x + M, y + M];                     // saved grid → hex cell
const keyOf = (c, r) => `${c},${r}`;
const TEAMS = ['blue', 'green', 'red', 'yellow'];
// A base takes the land of its realm (continents.js): its guild's realm, else a realm seeded from the owner.
// realm biome → wilds terrain:  isle→coast, desert→desert, tundra→tundra, highlands→wildwood, volcanic→ashlands
const TERRAIN_OF = { isle: 'coast', desert: 'desert', tundra: 'tundra', highlands: 'wildwood', volcanic: 'ashlands' };
function realmBiome(state) {
    if (state.biome && TERRAIN_OF[state.biome]) return state.biome;
    return require('./continents').baseBiome({ owner: state.owner || 'base', guildName: state.guildName, guild: state.guild, continent: state.continent });
}

function footprintCells(st, def) {
    const out = [];
    for (let i = 0; i < def.fw; i++) for (let j = 0; j < def.fh; j++) out.push(hc(st.x + i, st.y + j));
    return out;
}
function centroid(cells) {
    let x = 0, z = 0;
    for (const [c, r] of cells) { const w = K.hexWorld(c, r); x += w.x; z += w.z; }
    return { x: x / cells.length, z: z / cells.length };
}

function buildWorld(state) {
    const seedStr = state.owner || 'base';
    const seed = hashStr(seedStr);
    const rng = mulberry32(seed);
    const team = TEAMS[seed % 4];
    const realm = realmBiome(state);                 // 'isle'|'desert'|'tundra'|'highlands'|'volcanic'
    const biome = TERRAIN_OF[realm];                 // coast|desert|tundra|wildwood|ashlands
    const land = realm !== 'isle';                   // only the coastal realm has a sea
    const B = (n) => `building_${n}_${team}`;
    const w = new K.HexWorld(COLS, ROWS, { scale: SCALE, biome: realm, oobWater: !land });
    const used = new Set();
    const claim = (c, r) => used.add(keyOf(c, r));

    // ── full-bleed land: the 16x16 grid + ragged wilderness to the EDGES (no void, no sky) ──
    const ph1 = rng() * 6.28, ph2 = rng() * 6.28;
    const coastN = (c, r) => 0.5 + 0.5 * Math.sin(c * 0.9 + ph1) * Math.cos(r * 0.8 + ph2);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const gx = c - M, gy = r - M;
        const dx = gx < 0 ? -gx : gx > N - 1 ? gx - (N - 1) : 0;
        const dy = gy < 0 ? -gy : gy > N - 1 ? gy - (N - 1) : 0;
        const out = Math.hypot(dx, dy * 1.15);
        const reach = 1.6 + 1.5 * coastN(c, r);
        const k = w.cell[r][c];
        if (land) { k.water = false; k.void = false; }             // land realms: biome ground past the borders
        else { k.water = out > reach; k.void = false; }            // coastal realm: the sea runs to the edges
        if (out <= 1.2) k.keepLand = true;
    }
    // coastal realm / ashlands: the south-east margin is open water (sea) or a lava lake (volcanic set recolours water)
    if (biome === 'coast' || biome === 'ashlands') {
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            const gx = c - M, gy = r - M;
            if (gx > N - 1 - 2 && gy > 5) { w.cell[r][c].water = true; w.cell[r][c].keepLand = false; }
        }
    }

    // ── pond zone (NE lake): a blob around the zone centre ──
    {
        const pz = LAYOUT.pond.zone;
        const [lc, lr] = hc(pz.x + Math.floor(pz.fw / 2), pz.y + Math.floor(pz.fh / 2));
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            const d = K.hexDist(lc, lr, c, r);
            if (d <= 1 || (d === 2 && rng() < 0.7)) { const k = w.cell[r][c]; k.water = true; k.void = false; k.keepLand = false; k.lake = true; }
        }
    }

    // ── streets / plaza: the saved square-grid street plan re-drawn as hex lines ──
    const roadCells = (cells, closed = false) => {
        let prev = null, first = null;
        for (const [c, r] of cells) {
            if (!w.inb(c, r) || w.cell[r][c].water) { prev = null; continue; }
            w.cell[r][c].road = true; claim(c, r);
            if (prev) w.link(prev[0], prev[1], c, r);
            if (!first) first = [c, r];
            prev = [c, r];
        }
        if (closed && first && prev) w.link(prev[0], prev[1], first[0], first[1]);
    };
    const roadLine = (p1, p2) => {
        const [c1, r1] = hc(p1[0], p1[1]), [c2, r2] = hc(p2[0], p2[1]);
        roadCells(K.hexLine(c1, r1, c2, r2));
    };
    roadLine([8, 4], [8, N + 2 + BLEED]);                 // main street, through the gate and off into the wilds
    roadLine([3, 4], [13, 4]);                            // north lane (miners' row + pond lane)
    roadLine([2, 9], [7, 9]);                             // hunting walk
    roadLine([5, 10], [14, 10]);                          // south lanes
    {
        const [pc, pr] = hc(8, 7);                        // village green ring
        // ring cells are listed in walking order, so consecutive ones are hex neighbours
        roadCells(K.ring(pc, pr, 1), true);
        claim(pc, pr);
        w.put('building_well_' + team, pc, pr, { sc: 1.1 });
        w.put('flag_' + team, pc, pr, { dx: 0.9, dz: 0.5 });
    }
    w.resolve();

    // ── gatehouse + wall wings across the south gate (hunting structure) ──
    const gh = LAYOUT.hunting;
    const gateCells = [hc(gh.x, gh.y), hc(gh.x + 1, gh.y)];
    const gateW = centroid(gateCells);
    // walls run E-W across the street; the gate piece sits on the street cell
    const rowY = gh.y;                                   // 14
    const wallXs = [6, 10];
    for (const gx of wallXs) { const [c, r] = hc(gx, rowY); if (!w.cell[r][c].water) { w.put('wall_straight@0', c, r, { sort: 0.2 }); claim(c, r); } }
    {
        const [c, r] = hc(8, rowY);
        w.put('wall_straight_gate@0', c, r, { sort: 0.2, sc: 1.0 });
        for (const gx of [7, 9]) { const [c2, r2] = hc(gx, rowY); w.put('wall_straight@0', c2, r2, { sort: 0.2 }); claim(c2, r2); }
        const [tc1, tr1] = hc(5, rowY), [tc2, tr2] = hc(11, rowY);
        w.put(B('tower_A'), tc1, tr1, { sc: 0.95 }); w.put(B('tower_A'), tc2, tr2, { sc: 0.95 });
        claim(tc1, tr1); claim(tc2, tr2);
        w.put('flag_' + team, c, r, { dx: -1.15, dz: 0.5 });
        w.put('flag_' + team, c, r, { dx: 1.15, dz: 0.5 });
    }

    // ── zones ──
    const mz = LAYOUT.mines.zone, hz = LAYOUT.hunting.zone;
    const inZ = (z, gx, gy) => gx >= z.x && gx < z.x + z.fw && gy >= z.y && gy < z.y + z.fh;
    const TREES = ['trees_A_large', 'trees_B_large', 'trees_A_medium', 'trees_B_medium'];
    const inGrid = (gx, gy) => gx >= 0 && gy >= 0 && gx < N && gy < N;

    // reserve structure footprints first so props never land under buildings
    const sts = state.structures || [];
    for (const st of sts) { const def = structDef(st.type); if (!def) continue; for (const [c, r] of footprintCells(st, def)) claim(c, r); }
    const plotCellsAll = [];
    for (const p of state.freePlots || []) for (let i = 0; i < (p.fw || 3); i++) for (let j = 0; j < (p.fh || 3); j++) { const [c, r] = hc(p.x + i, p.y + j); claim(c, r); plotCellsAll.push([c, r]); }

    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const k = w.cell[r][c];
        if (k.water || k.coast || k.road || k.void || used.has(keyOf(c, r))) continue;
        const gx = c - M, gy = r - M, x = rng();
        if (inGrid(gx, gy) && inZ(mz, gx, gy)) {                      // quarry hills (NW)
            if (x < 0.6) { w.put(['mountain_A_grass_trees', 'mountain_B_grass', 'mountain_C_grass_trees', 'mountain_A'][Math.floor(rng() * 4)], c, r, { flip: rng() < 0.5 }); claim(c, r); }
            else if (x < 0.8) { w.put('rock_single_' + 'ABCDE'[Math.floor(rng() * 5)], c, r, { dx: (rng() - 0.5) * 0.7, dz: (rng() - 0.5) * 0.5 }); }
        } else if (inGrid(gx, gy) && inZ(hz, gx, gy)) {                // hunting woods (W)
            if (x < 0.7) { w.put(TREES[Math.floor(rng() * 4)], c, r, { flip: rng() < 0.5 }); claim(c, r); }
        } else if (inGrid(gx, gy)) {                                   // village green
            if (x < 0.07) { w.put(TREES[2 + Math.floor(rng() * 2)], c, r, { sc: 0.8, flip: rng() < 0.5 }); claim(c, r); }
            else if (x < 0.1) w.put('rock_single_' + 'ABCDE'[Math.floor(rng() * 5)], c, r, { dx: (rng() - 0.5) * 0.7, dz: (rng() - 0.5) * 0.5 });
        } else {                                                       // the wilds: biome
            const rock = () => w.put('rock_single_' + 'ABCDE'[Math.floor(rng() * 5)], c, r, { dx: (rng() - 0.5) * 0.7, dz: (rng() - 0.5) * 0.5 });
            if (biome === 'desert') {                                   // dunes, sandstone, scrub round the odd oasis palm
                if (x < 0.34) { w.put(['hills_A', 'hills_B', 'hills_C', 'hill_single_A', 'hill_single_B'][Math.floor(rng() * 5)], c, r, { flip: rng() < 0.5 }); claim(c, r); }
                else if (x < 0.44) rock();
                else if (x < 0.5) { w.put(['tree_single_A', 'tree_single_B', 'trees_A_small'][Math.floor(rng() * 3)], c, r, { flip: rng() < 0.5 }); claim(c, r); }
            } else if (biome === 'tundra') {                            // pine-dark ridges and snowy crags
                if (x < 0.34) { w.put(TREES[Math.floor(rng() * 4)], c, r, { flip: rng() < 0.5 }); claim(c, r); }
                else if (x < 0.5) { w.put(['hills_A', 'hills_B', 'hills_C', 'mountain_A_grass', 'mountain_B_grass'][Math.floor(rng() * 5)], c, r, { flip: rng() < 0.5 }); claim(c, r); }
                else if (x < 0.58) rock();
            } else if (biome === 'ashlands') {                          // basalt ridges and cinder rock
                if (x < 0.40) { w.put(['mountain_A', 'mountain_B', 'mountain_C', 'hills_C'][Math.floor(rng() * 4)], c, r, { flip: rng() < 0.5 }); claim(c, r); }
                else if (x < 0.56) rock();
                else if (x < 0.6) { w.put('hill_single_' + 'AB'[Math.floor(rng() * 2)], c, r); claim(c, r); }
            } else if (biome === 'wildwood') {                          // copper oaks with the odd mill and hill
                if (x < 0.56) { w.put(TREES[Math.floor(rng() * 4)], c, r, { flip: rng() < 0.5 }); claim(c, r); }
                else if (x < 0.64) { w.put(['hills_A_trees', 'hills_B_trees', 'hills_C'][Math.floor(rng() * 3)], c, r, { flip: rng() < 0.5 }); claim(c, r); }
                else if (x < 0.655) { w.put(B('windmill'), c, r); claim(c, r); }
                else if (x < 0.7) rock();
            } else {                                                    // coast: green headland forest
                if (x < 0.62) { w.put(TREES[Math.floor(rng() * 4)], c, r, { flip: rng() < 0.5 }); claim(c, r); }
                else if (x < 0.7) rock();
            }
        }
    }
    if (biome === 'coast') {                                           // a little dock-side lumber hut on the shore
        const spot = [];
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const k = w.cell[r][c]; if (k.coast && !used.has(keyOf(c, r))) spot.push([c, r]); }
        if (spot.length) { const [c, r] = spot[Math.floor(rng() * spot.length)]; w.put(B('lumbermill'), c, r); claim(c, r); }
    }

    // ── structures ──
    const props = (list, wx, wz, sc = 1) => { for (const [n, dx, dz, s] of list) w.put(n, 0, 0, { wx, wz, dx: dx * sc, dz: dz * sc, sc: s || 1 }); };
    const info = [];
    for (const st of sts) {
        const def = structDef(st.type); if (!def) continue;
        const lvl = Math.max(1, Math.min(def.levels.length, st.level || 1));
        const cells = footprintCells(st, def);
        const cen = centroid(cells);
        info.push({ st, def, lvl, cen });
        if (st.type !== 'pond' && st.type !== 'hunting') w.put('building_dirt', 0, 0, { wx: cen.x, wz: cen.z, layer: 'flat', sc: def.fw >= 3 ? 1.9 : 1.2 });
        const P = (n, o = {}) => w.put(n, 0, 0, { wx: cen.x, wz: cen.z, ...o });
        switch (st.type) {
            case 'house':
                if (lvl === 1) { P('building_home_A_' + team, { sc: 1.55 }); P('building_well_' + team, { dx: 1.5, dz: 0.9 }); }
                else if (lvl === 2) { P('building_home_B_' + team, { sc: 1.75 }); P('building_well_' + team, { dx: 1.7, dz: 1.0 }); P('crate_A_small', { dx: -1.5, dz: 0.8 }); }
                else { P('building_home_B_' + team, { sc: 2.05 }); P('building_home_A_' + team, { dx: -2.0, dz: 0.5, sc: 0.95, flip: true }); P('building_well_' + team, { dx: 1.8, dz: 1.2 }); P('flag_' + team, { dx: 0.9, dz: 1.5 }); }
                break;
            case 'blacksmith':
                if (lvl === 1) { P('building_blacksmith_' + team, { sc: 1.35 }); P('crate_A_small', { dx: 1.3, dz: 0.8 }); }
                else if (lvl === 2) { P('building_blacksmith_' + team, { sc: 1.65 }); P('weaponrack', { dx: -1.4, dz: 0.9 }); P('resource_stone', { dx: 1.5, dz: 0.9 }); }
                else { P('building_blacksmith_' + team, { sc: 1.95 }); P('weaponrack', { dx: -1.8, dz: 1.0 }); P('resource_stone', { dx: 1.7, dz: 1.0 }); P('wheelbarrow', { dx: 1.0, dz: 1.7 }); P('barrel', { dx: -0.8, dz: 1.6 }); }
                break;
            case 'medbay':
                if (lvl === 1) { P('tent', { sc: 2.1 }); P('sack', { dx: 1.3, dz: 0.9 }); P('bucket_water', { dx: -1.3, dz: 0.9 }); }
                else if (lvl === 2) { P('building_church_' + team, { sc: 1.35 }); P('tent', { dx: 1.7, dz: 0.8, sc: 1.2 }); }
                else { P('building_church_' + team, { sc: 1.8 }); P('building_well_' + team, { dx: 1.8, dz: 1.0 }); P('flag_' + team, { dx: -1.6, dz: 1.0 }); }
                break;
            case 'alchemy':
                if (lvl === 1) { P('barrel', { sc: 1.6 }); P('bucket_water', { dx: 1.2, dz: 0.8 }); P('crate_open', { dx: -1.2, dz: 0.8 }); }
                else if (lvl === 2) { P('building_tavern_' + team, { sc: 1.5 }); P('barrel', { dx: 1.5, dz: 1.0 }); }
                else { P('building_tavern_' + team, { sc: 1.9 }); P('building_windmill_' + team, { dx: -2.1, dz: -0.2, sc: 0.95 }); P('barrel', { dx: 1.8, dz: 1.1 }); P('crate_B_small', { dx: 0.9, dz: 1.7 }); }
                break;
            case 'mines':
                P('building_mine_' + team, { sc: lvl === 1 ? 1.35 : lvl === 2 ? 1.6 : 1.85 });
                if (lvl >= 2) { P('resource_stone', { dx: 1.2, dz: 0.9 }); P('wheelbarrow', { dx: -1.1, dz: 0.9 }); }
                if (lvl >= 3) { P('resource_lumber', { dx: 0.2, dz: 1.5 }); P('crate_long_A', { dx: -1.6, dz: 0.6 }); }
                break;
            case 'pond': {
                const mid = [hc(st.x, st.y), hc(st.x + 1, st.y), hc(st.x, st.y + 1), hc(st.x + 1, st.y + 1)];
                for (const [c, r] of mid) { w.cell[r][c].water = true; }
                P('waterlily_A', { dx: -0.6, dz: -0.2, h: -0.2 }); P('waterlily_B', { dx: 0.7, dz: 0.4, h: -0.2 }); P('waterplant_A', { dx: 0.0, dz: -0.8, h: -0.2 });
                if (lvl >= 2) { P('bucket_water', { dx: 1.7, dz: 1.2 }); P('crate_open', { dx: -1.6, dz: 1.1 }); }
                if (lvl >= 3) { P(B('watermill'), { dx: 2.0, dz: 0.2, sc: 0.95 }); }
                break;
            }
            case 'hunting': break;
            default: break;
        }
    }

    // ── free expansion plots ──
    const plots = [];
    for (const p of state.freePlots || []) {
        const cells = [];
        for (let i = 0; i < (p.fw || 3); i++) for (let j = 0; j < (p.fh || 3); j++) cells.push(hc(p.x + i, p.y + j));
        const cen = centroid(cells);
        plots.push({ id: p.id, cen, cells });
        w.put('building_dirt', 0, 0, { wx: cen.x, wz: cen.z, layer: 'flat', sc: 1.95 });
        w.put('building_scaffolding', 0, 0, { wx: cen.x, wz: cen.z, sc: 0.8 });
        w.put('crate_A_small', 0, 0, { wx: cen.x, wz: cen.z, dx: -1.5, dz: 0.8 });
        w.put('resource_lumber', 0, 0, { wx: cen.x, wz: cen.z, dx: 1.5, dz: 0.9 });
        w.overlay((ctx, pp, k) => plotOverlay(ctx, w, cen, p.id, k), 0, 0, { dx: cen.x, dz: cen.z });
    }
    // overlay anchors use world coords passed via dx/dz (hexWorld(0,0) = origin)
    return { w, info, plots, team, biome, realm };
}

function plotOverlay(ctx, w, cen, id, k) {
    ctx.save();
    ctx.setLineDash([14 * k * 2, 9 * k * 2]);
    ctx.lineWidth = Math.max(2, 3.2 * k * 2);
    ctx.strokeStyle = 'rgba(255,214,120,0.95)';
    // outline the 3x3 flower: a hexagon around the centroid, radius ~2 cells
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 180) * (60 * i);
        const p = w.proj(cen.x + 3.0 * Math.cos(a), cen.z + 2.55 * Math.sin(a), 0);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath(); ctx.stroke();
    ctx.setLineDash([]);
    const p = w.proj(cen.x, cen.z + 1.9, 0);
    const label = `PLOT ${id}`;
    ctx.font = `${Math.round(17 * k * 2)}px Cinzel`;
    const tw = ctx.measureText(label).width, bw = tw + 22 * k * 2, bh = 26 * k * 2;
    ctx.fillStyle = 'rgba(30,20,10,0.84)';
    K.roundRect(ctx, p.x - bw / 2, p.y - bh / 2, bw, bh, 8 * k * 2); ctx.fill();
    ctx.strokeStyle = '#d6a845'; ctx.lineWidth = Math.max(1.2, 1.6 * k * 2);
    K.roundRect(ctx, p.x - bw / 2, p.y - bh / 2, bw, bh, 8 * k * 2); ctx.stroke();
    ctx.fillStyle = '#f0dba0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, p.x, p.y + 1);
    ctx.restore();
}

function plaque(ctx, x, y, title, sub, k) {
    ctx.save();
    const f1 = Math.round(18 * k * 2), f2 = Math.round(13 * k * 2);
    ctx.font = `${f1}px Cinzel`; const w1 = ctx.measureText(title).width;
    ctx.font = `${f2}px Medieval`; const w2 = ctx.measureText(sub).width;
    const bw = Math.max(w1, w2) + 24 * k * 2, bh = f1 + f2 + 15 * k * 2;
    ctx.fillStyle = 'rgba(28,19,10,0.88)'; K.roundRect(ctx, x - bw / 2, y, bw, bh, 9 * k * 2); ctx.fill();
    ctx.strokeStyle = '#a67c2e'; ctx.lineWidth = Math.max(1.4, 2 * k * 2); K.roundRect(ctx, x - bw / 2, y, bw, bh, 9 * k * 2); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${f1}px Cinzel`; ctx.fillStyle = '#ecd9a6'; ctx.fillText(title, x, y + f1 * 0.85);
    ctx.font = `${f2}px Medieval`; ctx.fillStyle = '#c9a65a'; ctx.fillText(sub, x, y + f1 + f2 * 0.8 + 5 * k * 2);
    ctx.restore();
}

// ── scene cache (static art, no HUD / animation) ──
const _scenes = new Map();
const SCENE_MAX = 4;
async function buildScene(state) {
    ensureFonts();
    const key0 = hashStr(JSON.stringify([state.owner, state.structures, state.freePlots, realmBiome(state)]));
    const hit = _scenes.get(key0);
    if (hit) { _scenes.delete(key0); _scenes.set(key0, hit); return hit; }
    const { w, info, plots, team, biome, realm } = buildWorld(state);
    const { W, H } = w.layoutBleed(N + 2 * M, N + 2 * M, { top: 170, bottom: 190, left: 30, right: 30 }, BLEED);
    const canvas = require('canvas').createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const seed = hashStr(state.owner || 'base');
    const bi = (K.biomeInfo().biomes || {})[realm];
    const bd = realm === 'isle' ? { top: '#cfe8ef', mid: '#8fc7b2', bot: '#3f7a5c' } : bi ? { top: bi.backdrop[0], mid: bi.backdrop[1], bot: bi.backdrop[2] } : { top: '#356f6a', mid: '#1f4a4c', bot: '#0d2527' };
    await w.draw(ctx, { drawBackdrop: (c2) => K.paintBackdrop(c2, W, H, seed, { clouds: 7, cloudScale: SCALE * 1.1, ...bd }) });
    const liquid = K.liquidCells(w, { lava: biome === 'ashlands', seed: seed ^ 0x51ed, cap: 160 });   // animated water/lava cells
    const k = SCALE;
    const smoke = [];
    for (const it of info) {
        if (it.st.type === 'hunting') continue;
        const lv = it.def.levels.find((l) => l.level === it.lvl) || it.def.levels[0];
        const p = w.proj(it.cen.x, it.cen.z + 2.1, 0);
        plaque(ctx, p.x, p.y + 2 * k * 2, it.def.name, `${lv.name} · Lv ${it.lvl}`, k);
        if (it.st.type === 'house' || it.st.type === 'blacksmith' || it.st.type === 'alchemy') {
            const sp = w.proj(it.cen.x + 0.5, it.cen.z - 0.4, 2.2); smoke.push({ x: sp.x, y: sp.y, smoky: it.st.type === 'blacksmith' });
        }
    }
    const scene = { canvas, W, H, w, k, smoke, biome, liquid };
    _scenes.set(key0, scene);
    while (_scenes.size > SCENE_MAX) _scenes.delete(_scenes.keys().next().value);
    return scene;
}

// ═══════════════════════════════════════════════════════════════════════════
//  FRAME RENDER (frame 0 = static card; frames animate smoke + glints)
// ═══════════════════════════════════════════════════════════════════════════
async function renderFrame(state, frame, opts = {}) {
    const sc = await buildScene(state);
    const out = require('canvas').createCanvas(sc.W, sc.H);
    const ctx = out.getContext('2d');
    ctx.drawImage(sc.canvas, 0, 0);
    const t = (frame || 0) / FRAMES;
    const seed = hashStr(state.owner || 'base');
    if (opts.animate || frame > 0) {
        K.paintLiquidAnim(ctx, sc.w, sc.liquid, t);              // water shimmer / lava glow (old 2-state rhythm)
        if (opts.celebrate) K.paintConfetti(ctx, sc.W, sc.H, t, seed, sc.k);   // build/upgrade celebration
        ctx.save();
        for (const s of sc.smoke) {                              // chimney / forge smoke puffs
            for (let i = 0; i < 4; i++) {
                const ph = (t + i / 4) % 1;
                ctx.globalAlpha = 0.5 * (1 - ph);
                ctx.fillStyle = s.smoky ? '#6b6b73' : '#d8d8de';
                ctx.beginPath(); ctx.arc(s.x + Math.sin(ph * 5 + i) * 4 * sc.k * 2 + ph * 6, s.y - ph * 42 * sc.k * 2, (3 + ph * 7) * sc.k * 2, 0, Math.PI * 2); ctx.fill();
            }
        }
        for (let i = 0; i < 22; i++) {                           // fireflies / water glints
            const r1 = mulberry32(seed + 700 + i)(), r2 = mulberry32(seed + 1700 + i)();
            const ph = (t + r1) % 1;
            ctx.globalAlpha = 0.7 * Math.sin(ph * Math.PI);
            ctx.fillStyle = i % 3 ? '#ffffff' : '#ffe9a8';
            ctx.beginPath(); ctx.arc(sc.W * (0.06 + 0.88 * r1), sc.H * (0.2 + 0.6 * r2) - ph * 12, 1.6 + (i % 3), 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
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
    ctx.fillStyle = 'rgba(24,17,10,0.88)'; K.roundRect(ctx, x0, y0, Wp, Hh, 14); ctx.fill();
    ctx.strokeStyle = '#a67c2e'; ctx.lineWidth = 2.5; K.roundRect(ctx, x0 + 4, y0 + 4, Wp - 8, Hh - 8, 10); ctx.stroke();
    ctx.strokeStyle = 'rgba(166,124,46,0.35)'; ctx.lineWidth = 1; K.roundRect(ctx, x0 + 9, y0 + 9, Wp - 18, Hh - 18, 8); ctx.stroke();
    ctx.textBaseline = 'middle'; ctx.fillStyle = '#e8d5a3'; ctx.font = '26px "Cinzel Deco", Cinzel'; ctx.textAlign = 'left';
    ctx.fillText(String(state.owner || 'Adventurer').slice(0, 22), x0 + 26, y0 + 38);
    ctx.font = '16px Medieval'; ctx.fillStyle = '#9c8455'; ctx.fillText(`The base of ${state.owner}`, x0 + 26, y0 + 64);
    const count = (state.structures || []).length;
    ctx.textAlign = 'center'; ctx.font = '20px Cinzel'; ctx.fillStyle = '#e8d5a3'; ctx.fillText(`${count}`, x0 + Wp - 250, y0 + 38);
    ctx.font = '14px Medieval'; ctx.fillStyle = '#9c8455'; ctx.fillText('STRUCTURES', x0 + Wp - 250, y0 + 62);
    ctx.font = '20px Cinzel'; ctx.fillStyle = '#e8d5a3'; ctx.fillText(`${(state.freePlots || []).length}`, x0 + Wp - 90, y0 + 38);
    ctx.font = '14px Medieval'; ctx.fillStyle = '#9c8455'; ctx.fillText('FREE PLOTS', x0 + Wp - 90, y0 + 62);
    ctx.textAlign = 'center'; ctx.font = '15px Medieval'; ctx.fillStyle = '#7a663f';
    ctx.fillText(opts.hint || 'base build <type> [plot]  •  base upgrade <type|#>  •  base house 1  •  base info', x0 + Wp / 2, y0 + Hh - 26);
    ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════════
//  mp4 + public render
// ═══════════════════════════════════════════════════════════════════════════
const FRAME_BREATH_MS = 8;
const breath = () => new Promise((r) => setTimeout(r, FRAME_BREATH_MS));

async function encodeFramesToMp4(frames) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'base-'));
    const out = path.join(tmp, 'base.mp4');
    try {
        if (!(frames.length && frames[0] && frames[0].raw)) throw new Error('encodeFramesToMp4: raw frames required');
        const { w, h } = frames[0];
        const args = [
            '-f', 'rawvideo', '-pix_fmt', 'bgra', '-video_size', `${w}x${h}`,
            '-framerate', `${1000 / FRAME_MS}`, '-i', 'pipe:0',
            '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
            '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0',
            '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '23',
            '-movflags', '+faststart', '-an', '-y', out,
        ];
        await new Promise((resolve, reject) => {
            const p = require('child_process').spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
            let err = '';
            p.stderr.on('data', (d) => { err += d; if (err.length > 6000) err = err.slice(-3000); });
            p.on('error', reject);
            p.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${err.slice(-500)}`)));
            (async () => { for (const f of frames) { if (!p.stdin.write(f.raw)) await new Promise((r2) => p.stdin.once('drain', r2)); } p.stdin.end(); })().catch(reject);
        });
        return fs.readFileSync(out);
    } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* ignore */ } }
}

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
    return hashStr(JSON.stringify(['v9-realms', state.owner, realmBiome(state), state.structures, state.freePlots, opts.hint || '', opts.static ? 1 : 0, opts.celebrate ? 1 : 0]));
}

async function renderBaseImage(state, opts = {}) {
    const k = stateHash(state, opts);
    const hit = _renderCache.get(k);
    if (hit && (Date.now() - hit.ts) < CACHE_TTL) return hit;
    const out = await mediaCache.cached('base', k, async () => {
        if (opts.static) return encodeOut(await renderFrame(state, 0, { ...opts, returnCanvas: true }));
        try {
            const frames = [];
            for (let f = 0; f < FRAMES; f++) { frames.push(await renderFrame(state, f, { ...opts, encoder: 'raw', animate: true })); await breath(); }
            const mp4 = await encodeFramesToMp4(frames);
            if (mp4 && mp4.length > 1000) return { buffer: mp4, contentType: 'video/mp4' };
        } catch (e) { console.error('[baseRenderer] mp4 encode failed, JPEG fallback:', e.message); }
        return encodeOut(await renderFrame(state, 0, { ...opts, returnCanvas: true }));
    });
    cachePut(_renderCache, k, out);
    return out;
}

module.exports = { LAYOUT, N, FRAMES, renderFrame, renderBaseImage, encodeFramesToMp4, structDef, structures };
