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
const M = 15;                 // wilderness margin (hex cells) around the grid — big enough to over-cover the diagonal card
const COLS = N + 2 * M, ROWS = N + 2 * M;
const FRAMES = 14, FRAME_MS = 110;
const SCALE = parseFloat(process.env.RENDER_BASE_SCALE || '0.44') || 0.44;
const ANIM_SCALE = parseFloat(process.env.RENDER_BASE_ANIM_SCALE || '0.62') || 0.62;
const CARD_W = 1960, CARD_H = 1420;   // fixed card; terrain over-covers it (no floating diorama)

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
//  SCENE BUILD — diagonal isometric camera (yaw 45), terrain over-covers the whole card
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

// ── value noise (deterministic) for the far-field wilds ──
function hash2(seed, x, y) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}
function vnoise(seed, x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const sm = (t) => t * t * (3 - 2 * t);
    const a = hash2(seed, xi, yi), b = hash2(seed, xi + 1, yi), c = hash2(seed, xi, yi + 1), d = hash2(seed, xi + 1, yi + 1);
    const u = sm(xf), v = sm(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (seed, x, y) => vnoise(seed, x, y) * 0.55 + vnoise(seed + 71, x * 2.1, y * 2.1) * 0.3 + vnoise(seed + 133, x * 4.3, y * 4.3) * 0.15;

const TREES = ['trees_A_large', 'trees_B_large', 'trees_A_medium', 'trees_B_medium'];
const SMALL_TREES = ['trees_A_small', 'trees_B_small', 'tree_single_A', 'tree_single_B'];
// per-terrain far-field palette: mountain / hill / forest thresholds on noise, with sprite lists
const WILDS = {
    coast: { mt: ['mountain_A_grass_trees', 'mountain_B_grass_trees', 'mountain_C_grass_trees'], hl: ['hills_A_trees', 'hills_B_trees', 'hills_C_trees', 'hills_A'], tr: TREES, fo: 0.50, hi: 0.60, mo: 0.80, rock: 0.05 },
    desert: { mt: ['mountain_A', 'mountain_B', 'mountain_C'], hl: ['hills_A', 'hills_B', 'hills_C', 'hill_single_A', 'hill_single_B'], tr: SMALL_TREES, fo: 9, hi: 0.40, mo: 0.74, rock: 0.09 },
    tundra: { mt: ['mountain_A_grass', 'mountain_B_grass', 'mountain_C_grass', 'mountain_A'], hl: ['hills_A', 'hills_B', 'hills_C', 'hill_single_A'], tr: TREES, fo: 0.44, hi: 0.58, mo: 0.76, rock: 0.07 },
    wildwood: { mt: ['mountain_A_grass_trees', 'mountain_B_grass_trees', 'mountain_C_grass_trees'], hl: ['hills_A_trees', 'hills_B_trees', 'hills_C_trees'], tr: TREES, fo: 0.38, hi: 0.60, mo: 0.80, rock: 0.04 },
    ashlands: { mt: ['mountain_A', 'mountain_B', 'mountain_C'], hl: ['hills_C', 'hills_A', 'hills_B', 'hill_single_B'], tr: SMALL_TREES, fo: 9, hi: 0.46, mo: 0.68, rock: 0.12 },
};
const ROCKS = 'ABCDE';
const FAR_R = 12;                                       // fence ring radius (hex cells) around the village green

function buildWorld(state) {
    const seedStr = state.owner || 'base';
    const seed = hashStr(seedStr);
    const rng = mulberry32(seed);
    const team = TEAMS[seed % 4];
    const realm = realmBiome(state);                    // 'isle'|'desert'|'tundra'|'highlands'|'volcanic'
    const biome = TERRAIN_OF[realm];                    // coast|desert|tundra|wildwood|ashlands
    const coastal = realm === 'isle';
    const WP = WILDS[biome];
    const B = (n) => `building_${n}_${team}`;
    const w = new K.HexWorld(COLS, ROWS, { scale: SCALE, biome: realm, oobWater: coastal, view: 'iso' });
    const used = new Set();
    const claim = (c, r) => used.add(keyOf(c, r));
    const inCells = (c, r) => w.inb(c, r);
    const centreCell = hc(8, 8);
    const ringDist = (c, r) => K.hexDist(centreCell[0], centreCell[1], c, r);
    const isLand = (c, r) => { const k = w.at(c, r); return !!k && !k.water && !k.river; };

    // ── the sea (coastal realm only): the whole east/south-east side; everything else is land ──
    const ph1 = rng() * 6.28, ph2 = rng() * 6.28;
    const coastN = (c, r) => 0.5 + 0.5 * Math.sin(c * 0.55 + ph1) * Math.cos(r * 0.5 + ph2);
    if (coastal) {
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            const gx = c - M, gy = r - M;
            if ((gx - (N - 1)) + (gy - 8) * 0.5 > 1.5 + 2.2 * coastN(c, r)) w.cell[r][c].water = true;
        }
    }
    // ── the lake NE of the village (the pond structure's pier runs out into it) ──
    const [lc, lr] = hc(16, 2);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const d = K.hexDist(lc, lr, c, r);
        if (d <= 2 || (d === 3 && rng() < 0.55)) { const k = w.cell[r][c]; k.water = true; k.lake = true; }
    }
    if (coastal) {                                      // the lake is joined to the ocean by a channel
        const [tc, tr] = hc(23, 4);
        for (const [c, r] of K.hexLine(lc, lr, tc, tr)) if (inCells(c, r)) w.cell[r][c].water = true;
    } else if (biome !== 'desert') {                    // a stream wanders off the lake to the edge of the world
        let cur = [lc, lr];
        const [tc, tr] = hc(34, -22);
        const way = [hc(22 + Math.floor(rng() * 4), -2 + Math.floor(rng() * 4)), hc(28 + Math.floor(rng() * 4), -12 + Math.floor(rng() * 4)), [tc, tr]];
        for (const nx of way) {
            for (const [c, r] of K.hexLine(cur[0], cur[1], nx[0], nx[1])) if (inCells(c, r) && !w.cell[r][c].water) w.cell[r][c].river = true;
            cur = nx;
        }
    }

    // ── streets / plaza: the saved square-grid street plan re-drawn as hex lines ──
    const roadList = [];
    const roadCells = (cells, closed = false) => {
        let prev = null, first = null;
        for (const [c, r] of cells) {
            if (!w.inb(c, r) || w.cell[r][c].water || w.cell[r][c].river) { prev = null; continue; }
            const kk = w.cell[r][c];
            if (!kk.road) roadList.push([c, r]);
            kk.road = true; claim(c, r);
            if (prev) w.link(prev[0], prev[1], c, r);
            if (!first) first = [c, r];
            prev = [c, r];
        }
        if (closed && first && prev) w.link(prev[0], prev[1], first[0], first[1]);
    };
    const roadLine = (p1, p2) => { const [c1, r1] = hc(p1[0], p1[1]), [c2, r2] = hc(p2[0], p2[1]); roadCells(K.hexLine(c1, r1, c2, r2)); };
    roadLine([8, 4], [8, N + 3]);                       // main street, through the gate and out of the village
    roadLine([3, 4], [13, 4]);                          // north lane (miners' row + pond lane)
    roadLine([2, 9], [7, 9]);                           // hunting walk
    roadLine([5, 10], [14, 10]);                        // south lanes
    {   // the road beyond the gate runs off into the wilds
        const [c1, r1] = hc(8, N + 3), [c2, r2] = hc(10, N + 14);
        roadCells(K.hexLine(c1, r1, c2, r2));
    }
    const [pc, pr] = hc(8, 7);
    roadCells(K.ring(pc, pr, 1), true);                 // village green ring
    claim(pc, pr);
    w.put('building_well_' + team, pc, pr, { sc: 1.1 });
    w.put('flag_' + team, pc, pr, { dx: 0.9, dz: 0.5 });

    // ── structure + plot footprints first, so nothing else lands on them ──
    const sts = state.structures || [];
    const sFoot = [];
    for (const st of sts) { const def = structDef(st.type); if (!def) continue; const cells = footprintCells(st, def); sFoot.push({ st, def, cells }); for (const [c, r] of cells) claim(c, r); }
    const plotFoot = [];
    for (const p of state.freePlots || []) {
        const cells = [];
        for (let i = 0; i < (p.fw || 3); i++) for (let j = 0; j < (p.fh || 3); j++) { const [c, r] = hc(p.x + i, p.y + j); cells.push([c, r]); claim(c, r); }
        plotFoot.push({ p, cells });
    }
    const nearestRoad = (cells) => {
        let best = null, bd = 1e9;
        for (const [c, r] of cells) for (const [rc, rr] of roadList) { const d = K.hexDist(c, r, rc, rr); if (d < bd) { bd = d; best = { from: [c, r], to: [rc, rr], d }; } }
        return best;
    };
    // every building / plot gets a cobble spur to the nearest street, so the village reads as ONE connected place
    for (const g of [...sFoot, ...plotFoot]) {
        if (g.st && (g.st.type === 'hunting')) continue;
        const nr = nearestRoad(g.cells);
        if (!nr || nr.d <= 1) continue;
        const path = K.hexLine(nr.from[0], nr.from[1], nr.to[0], nr.to[1]);
        const foot = new Set(g.cells.map(([c, r]) => keyOf(c, r)));
        let prev = nr.from;
        for (let i = 1; i < path.length - 1; i++) {
            const [c, r] = path[i];
            if (!w.inb(c, r) || w.cell[r][c].water || w.cell[r][c].river || (used.has(keyOf(c, r)) && !foot.has(keyOf(c, r)) && !w.cell[r][c].road)) break;
            if (!foot.has(keyOf(c, r))) { w.cell[r][c].road = true; claim(c, r); roadList.push([c, r]); }
            w.link(prev[0], prev[1], c, r);
            prev = [c, r];
        }
        if (K.hexDist(prev[0], prev[1], nr.to[0], nr.to[1]) <= 1 && !foot.has(keyOf(prev[0], prev[1]))) w.link(prev[0], prev[1], nr.to[0], nr.to[1]);
    }
    w.resolve();

    // ── gatehouse + wall wings across the south gate (hunting structure) ──
    const gh = LAYOUT.hunting;
    {
        const rowY = gh.y;
        for (const gx of [6, 7, 9, 10]) { const [c, r] = hc(gx, rowY); if (!w.cell[r][c].water) { w.put('wall_straight@0', c, r, { sort: 0.2 }); claim(c, r); } }
        const [c, r] = hc(8, rowY);
        w.put('wall_straight_gate@0', c, r, { sort: 0.2 });
        const [tc1, tr1] = hc(5, rowY), [tc2, tr2] = hc(11, rowY);
        w.put(B('tower_A'), tc1, tr1, { sc: 0.95 }); w.put(B('tower_A'), tc2, tr2, { sc: 0.95 });
        claim(tc1, tr1); claim(tc2, tr2);
        w.put('flag_' + team, c, r, { dx: -1.15, dz: 0.5 }); w.put('flag_' + team, c, r, { dx: 1.15, dz: 0.5 });
    }

    // ── the wooden palisade: follows the hex edges of a ring round the whole village, one gate on the main street ──
    {
        const inside = (c, r) => ringDist(c, r) <= FAR_R - 1;
        const gateW = K.hexWorld(...hc(8, N + 3));
        // the gate edge: a boundary road cell nearest the street's line out of the village
        let best = null, bd = 1e9;
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            if (!inside(c, r) || !w.cell[r][c].road) continue;
            for (let e = 0; e < 6; e++) {
                const nb = K.neighbor(c, r, e);
                if (inside(nb[0], nb[1])) continue;
                const ww = K.hexWorld(c, r), d = Math.hypot(ww.x - gateW.x, ww.z - gateW.z);
                if (d < bd) { bd = d; best = keyOf(c, r) + ',' + e; }
            }
        }
        w.layFenceEdges(inside, { gateAt: (c, r, e) => `${c},${r},${e}` === best });
        w.put('flag_' + team, ...(best ? best.split(',').slice(0, 2).map(Number) : [0, 0]), { dx: -1.0, dz: 0.6 });
        w.put('flag_' + team, ...(best ? best.split(',').slice(0, 2).map(Number) : [0, 0]), { dx: 1.0, dz: 0.6 });
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (ringDist(c, r) === FAR_R - 1 || ringDist(c, r) === FAR_R) claim(c, r);
    }

    // ── zones (structure-driven; same as the saved layout) ──
    const mz = LAYOUT.mines.zone, hz = LAYOUT.hunting.zone;
    const inZ = (z, gx, gy) => gx >= z.x && gx < z.x + z.fw && gy >= z.y && gy < z.y + z.fh;
    const inGrid = (gx, gy) => gx >= 0 && gy >= 0 && gx < N && gy < N;
    const rock = (c, r) => w.put('rock_single_' + ROCKS[Math.floor(rng() * 5)], c, r, { dx: (rng() - 0.5) * 0.8, dz: (rng() - 0.5) * 0.6 });
    const flip = () => rng() < 0.5;

    // ── ambient village life (cottages that face the street, yards, fields, orchards) ──
    const cottageSpots = [];
    const FARM = biome === 'coast' || biome === 'wildwood';
    const freeCell = (c, r) => { const k = w.at(c, r); return !!k && !k.water && !k.river && !k.coast && !k.road && !used.has(keyOf(c, r)); };
    const gridOK = (c, r) => { const gx = c - M, gy = r - M; return inGrid(gx, gy) && !inZ(mz, gx, gy) && !inZ(hz, gx, gy) && gx < 15; };
    const cands = [];
    for (const [rc, rr] of roadList) for (let d = 0; d < 6; d++) {
        const [c, r] = K.neighbor(rc, rr, d);
        if (freeCell(c, r) && gridOK(c, r)) cands.push({ c, r, rc, rr });
    }
    for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
    const want = Math.min(14, 8 + sts.length * 2);
    const YARD = [['barrel', 0.9, 0.7], ['crate_A_small', -0.9, 0.7], ['bucket_water', 0.8, -0.6], ['wheelbarrow', -0.8, 0.8], ['sack', 0.6, 0.9], ['resource_lumber', -0.9, -0.5], ['crate_open', 0.9, 0.6], ['pallet', -0.7, 0.8]];
    for (const cd of cands) {
        if (cottageSpots.length >= want) break;
        if (!freeCell(cd.c, cd.r)) continue;
        if (cottageSpots.some((q) => K.hexDist(q.c, q.r, cd.c, cd.r) < 3)) continue;
        if (K.hexDist(cd.c, cd.r, pc, pr) < 2) continue;
        cottageSpots.push(cd); claim(cd.c, cd.r);
        const me = K.hexWorld(cd.c, cd.r), rd = K.hexWorld(cd.rc, cd.rr);
        const west = (me.x - rd.x) > Math.abs(rd.z - me.z) * 0.6;        // road lies to the west → mirror the door that way
        const useB = rng() < 0.35;
        const hut = rng() < 0.18;
        w.put('building_dirt', cd.c, cd.r, { layer: 'flat', sc: 0.85 });
        w.put(hut ? 'tent' : (useB ? B('home_B') : B('home_A')), cd.c, cd.r, { sc: hut ? 1.2 : 0.95 + rng() * 0.12, flip: west });
        for (let i = 0; i < 2; i++) { const y = YARD[Math.floor(rng() * YARD.length)]; w.put(y[0], cd.c, cd.r, { dx: y[1], dz: y[2] }); }
        if (rng() < 0.5) w.put(SMALL_TREES[Math.floor(rng() * 4)], cd.c, cd.r, { dx: -1.1, dz: -0.9, sc: 0.85 });
    }
    // farm patch (grain) by the SE lane, or a caravan camp where there is no soil
    {
        const seedCells = [];
        for (let gy = 11; gy < 15; gy++) for (let gx = 10; gx < 15; gx++) { const [c, r] = hc(gx, gy); if (freeCell(c, r)) seedCells.push([c, r]); }
        if (seedCells.length) {
            const [sc0, sr0] = seedCells[Math.floor(rng() * seedCells.length)];
            let n = 0;
            for (const [c, r] of [[sc0, sr0], ...[0, 1, 2, 3, 4, 5].map((d) => K.neighbor(sc0, sr0, d))]) {
                if (!freeCell(c, r) || n >= 5) continue;
                if (FARM) w.put('building_grain', c, r, { sc: 1.0 });
                else if (n === 0) { w.put('tent', c, r, { sc: 1.25 }); w.put('crate_A_big', c, r, { dx: 1.0, dz: 0.8 }); }
                else if (n === 1) w.put('resource_stone', c, r, { dx: 0.3, dz: 0.2 });
                else continue;
                claim(c, r); n++;
            }
        }
    }
    // orchard: a loose grid of small trees on the green, off the lanes
    {
        let n = 0;
        for (let gy = 0; gy < N && n < 16; gy++) for (let gx = 4; gx < 12; gx++) {
            const [c, r] = hc(gx, gy);
            if (!freeCell(c, r) || !gridOK(c, r) || (gx + gy) % 3 !== 0 || rng() < 0.4) continue;
            w.put(SMALL_TREES[Math.floor(rng() * 4)], c, r, { sc: 0.85, flip: flip() }); claim(c, r); n++;
        }
    }
    // second ring of homes: farmsteads tucked behind the street cottages (with their own yard, field and trees)
    for (let tries = 0; tries < 80 && cottageSpots.length < want; tries++) {
        const base = cottageSpots[Math.floor(rng() * Math.max(1, cottageSpots.length))];
        if (!base) break;
        const d = Math.floor(rng() * 6), [c, r] = K.neighbor(...K.neighbor(base.c, base.r, d), (d + 1) % 6);
        if (!freeCell(c, r) || !gridOK(c, r) || cottageSpots.some((q) => K.hexDist(q.c, q.r, c, r) < 3) || K.hexDist(c, r, pc, pr) < 3) continue;
        cottageSpots.push({ c, r, rc: base.rc, rr: base.rr }); claim(c, r);
        w.put('building_dirt', c, r, { layer: 'flat', sc: 0.85 });
        w.put(rng() < 0.5 ? B('home_A') : B('home_B'), c, r, { sc: 0.92 + rng() * 0.1, flip: rng() < 0.5 });
        const y = YARD[Math.floor(rng() * YARD.length)]; w.put(y[0], c, r, { dx: y[1], dz: y[2] });
        for (let dd = 0; dd < 6; dd++) { const [fc, fr] = K.neighbor(c, r, dd); if (FARM && freeCell(fc, fr) && gridOK(fc, fr) && rng() < 0.35) { w.put('building_grain', fc, fr, { sc: 1.0 }); claim(fc, fr); } }
    }
    // street furniture along the roads: barrels, crates, buckets, the odd flag
    {
        const fur = ['barrel', 'crate_A_small', 'bucket_water', 'sack', 'crate_B_small', 'wheelbarrow'];
        let n = 0;
        for (const [c, r] of roadList) {
            if (n > 26 || rng() > 0.2) continue;
            const k = w.at(c, r); if (!k || k.river || k.water) continue;
            const gx = c - M, gy = r - M; if (!inGrid(gx, gy)) continue;
            w.put(fur[Math.floor(rng() * fur.length)], c, r, { dx: (rng() < 0.5 ? -1 : 1) * 0.85, dz: (rng() - 0.5) * 0.6, sc: 0.9 });
            n++;
        }
    }

    // ── fill the rest of the grid with biome wilds (village green = light, inside the palisade; far field = heavy) ──
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const k = w.cell[r][c];
        if (k.water || k.coast || k.road || used.has(keyOf(c, r))) continue;
        const gx = c - M, gy = r - M, x = rng();
        const rd = ringDist(c, r);
        if (inGrid(gx, gy) && inZ(mz, gx, gy)) {                      // quarry hills (NW)
            if (x < 0.62) { w.put(['mountain_A_grass_trees', 'mountain_B_grass', 'mountain_C_grass_trees', 'mountain_A'][Math.floor(rng() * 4)], c, r, { flip: flip() }); claim(c, r); }
            else if (x < 0.82) rock(c, r);
            continue;
        }
        if (inGrid(gx, gy) && inZ(hz, gx, gy)) {                      // hunting woods (W)
            if (x < 0.72) { w.put(TREES[Math.floor(rng() * 4)], c, r, { flip: flip() }); claim(c, r); }
            continue;
        }
        if (rd <= FAR_R - 1) {                                        // inside the palisade: tidy meadow
            if (x < 0.06) { w.put(SMALL_TREES[Math.floor(rng() * 4)], c, r, { sc: 0.85, flip: flip() }); claim(c, r); }
            else if (x < 0.10) rock(c, r);
            continue;
        }
        // far field — noise driven: ridges of mountains, rolling hills, woods, scatter; denser the further out
        const n1 = fbm(seed, c * 0.16, r * 0.16), n2 = fbm(seed + 17, c * 0.3 + 40, r * 0.3 + 9);
        const far = Math.min(1, (rd - FAR_R) / 8);
        const e = n1 * 0.8 + far * 0.30;
        if (e > WP.mo) { w.put(WP.mt[Math.floor(rng() * WP.mt.length)], c, r, { flip: flip() }); claim(c, r); }
        else if (e > WP.hi) { w.put(WP.hl[Math.floor(rng() * WP.hl.length)], c, r, { flip: flip() }); claim(c, r); }
        else if (n2 > WP.fo - 0.05 && x < 0.85) { w.put(WP.tr[Math.floor(rng() * WP.tr.length)], c, r, { flip: flip() }); claim(c, r); }
        else if (x < WP.rock) rock(c, r);
        else if (x < WP.rock + 0.07 && biome !== 'ashlands') { w.put(SMALL_TREES[Math.floor(rng() * 4)], c, r, { sc: 0.9, flip: flip() }); }
    }
    if (biome === 'coast') {                                          // dock-side lumber hut on the shore + a lighthouse-ish watch tower
        const spot = [];
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const k = w.cell[r][c]; if (k.coast && !used.has(keyOf(c, r)) && ringDist(c, r) > FAR_R - 2 && ringDist(c, r) < FAR_R + 6) spot.push([c, r]); }
        if (spot.length) { const [c, r] = spot[Math.floor(rng() * spot.length)]; w.put(B('lumbermill'), c, r, { flip: flip() }); claim(c, r); }
    }

    // ── structures ──
    const roadWorld = roadList.map(([c, r]) => K.hexWorld(c, r));
    const facing = (cen) => {                                          // sprites bake one facade; mirror it toward the nearest street
        let best = null, bd = 1e9;
        for (const rw of roadWorld) { const d = Math.hypot(rw.x - cen.x, rw.z - cen.z); if (d < bd) { bd = d; best = rw; } }
        if (!best) return false;
        const dx = best.x - cen.x, dz = best.z - cen.z;
        return -dx > dz;                                               // street is more west than south → door faces west (mirrored)
    };
    const info = [];
    const lakeShore = [];
    for (const { st, def, cells } of sFoot) {
        const lvl = Math.max(1, Math.min(def.levels.length, st.level || 1));
        const cen = centroid(cells);
        const ff = facing(cen);
        info.push({ st, def, lvl, cen });
        if (st.type !== 'hunting') w.put('building_dirt', 0, 0, { wx: cen.x, wz: cen.z, layer: 'flat', sc: def.fw >= 3 ? 1.9 : 1.2 });
        const P = (n, o = {}) => w.put(n, 0, 0, { wx: cen.x, wz: cen.z, ...(o.dx == null && o.dz == null && !('flip' in o) && n.startsWith('building_') ? { flip: ff } : {}), ...o });
        switch (st.type) {
            case 'house':
                if (lvl === 1) { P('building_home_A_' + team, { sc: 1.55 }); P('building_well_' + team, { dx: 1.5, dz: 0.9 }); P('crate_A_small', { dx: -1.4, dz: 1.0 }); }
                else if (lvl === 2) { P('building_home_B_' + team, { sc: 1.75 }); P('building_well_' + team, { dx: 1.7, dz: 1.0 }); P('crate_A_small', { dx: -1.5, dz: 0.8 }); P('barrel', { dx: -1.0, dz: 1.6 }); }
                else { P('building_home_B_' + team, { sc: 2.05 }); P('building_home_A_' + team, { dx: -2.0, dz: 0.5, sc: 0.95, flip: true }); P('building_well_' + team, { dx: 1.8, dz: 1.2 }); P('flag_' + team, { dx: 0.9, dz: 1.5 }); P('wheelbarrow', { dx: -0.3, dz: 1.9 }); }
                break;
            case 'blacksmith':
                if (lvl === 1) { P('building_blacksmith_' + team, { sc: 1.35 }); P('crate_A_small', { dx: 1.3, dz: 0.8 }); P('resource_stone', { dx: -1.2, dz: 0.9 }); }
                else if (lvl === 2) { P('building_blacksmith_' + team, { sc: 1.65 }); P('weaponrack', { dx: -1.4, dz: 0.9 }); P('resource_stone', { dx: 1.5, dz: 0.9 }); }
                else { P('building_blacksmith_' + team, { sc: 1.95 }); P('weaponrack', { dx: -1.8, dz: 1.0 }); P('resource_stone', { dx: 1.7, dz: 1.0 }); P('wheelbarrow', { dx: 1.0, dz: 1.7 }); P('barrel', { dx: -0.8, dz: 1.6 }); }
                break;
            case 'medbay':
                if (lvl === 1) { P('tent', { sc: 2.1 }); P('sack', { dx: 1.3, dz: 0.9 }); P('bucket_water', { dx: -1.3, dz: 0.9 }); }
                else if (lvl === 2) { P('building_church_' + team, { sc: 1.35 }); P('tent', { dx: 1.7, dz: 0.8, sc: 1.2 }); P('bucket_water', { dx: -1.5, dz: 0.9 }); }
                else { P('building_church_' + team, { sc: 1.8 }); P('building_well_' + team, { dx: 1.8, dz: 1.0 }); P('flag_' + team, { dx: -1.6, dz: 1.0 }); }
                break;
            case 'alchemy':
                if (lvl === 1) { P('barrel', { sc: 1.6 }); P('bucket_water', { dx: 1.2, dz: 0.8 }); P('crate_open', { dx: -1.2, dz: 0.8 }); }
                else if (lvl === 2) { P('building_tavern_' + team, { sc: 1.5 }); P('barrel', { dx: 1.5, dz: 1.0 }); P('crate_B_small', { dx: -1.4, dz: 1.0 }); }
                else { P('building_tavern_' + team, { sc: 1.9 }); P('building_windmill_' + team, { dx: -2.1, dz: -0.2, sc: 0.95 }); P('barrel', { dx: 1.8, dz: 1.1 }); P('crate_B_small', { dx: 0.9, dz: 1.7 }); }
                break;
            case 'mines':
                P('building_mine_' + team, { sc: lvl === 1 ? 1.35 : lvl === 2 ? 1.6 : 1.85 });
                if (lvl >= 2) { P('resource_stone', { dx: 1.2, dz: 0.9 }); P('wheelbarrow', { dx: -1.1, dz: 0.9 }); }
                if (lvl >= 3) { P('resource_lumber', { dx: 0.2, dz: 1.5 }); P('crate_long_A', { dx: -1.6, dz: 0.6 }); }
                break;
            case 'pond': {                                              // the lakeside boardwalk: a pier out over the water
                const [sc1, sr1] = hc(st.x + def.fw - 1, st.y + def.fh - 1);
                const len = lvl === 1 ? 2 : lvl === 2 ? 3 : 4;
                for (let i = 1; i <= len; i++) { const kk = w.at(sc1 + i, sr1); if (kk) { kk.water = true; kk.river = false; } }     // make sure the pier is over water
                lakeShore.push([sc1, sr1, len]);
                P('barrel', { dx: -1.2, dz: 0.9 }); P('crate_open', { dx: 0.4, dz: 1.3 }); P('bucket_water', { dx: -0.4, dz: -1.1 });
                if (lvl >= 2) { P('sack', { dx: -1.7, dz: 0.2 }); P('resource_lumber', { dx: -1.3, dz: -0.9 }); }
                if (lvl >= 3) { P(B('watermill'), { dx: -0.2, dz: -2.3, sc: 0.95 }); }
                break;
            }
            default: break;
        }
    }
    w.resolve();                                                      // re-resolve now that the pier cells are water
    for (const [c, r, len] of lakeShore) {
        const cells = w.layPier(c, r, 0, len);
        const last = cells[cells.length - 1];
        if (last) { w.put('barrel', last[0], last[1], { dx: 0.15, dz: 0.2, h: 0.12, sc: 0.8 }); }
    }

    // ── free expansion plots ──
    const plots = [];
    for (const pf of plotFoot) {
        const cen = centroid(pf.cells);
        plots.push({ id: pf.p.id, cen, cells: pf.cells });
        w.put('building_dirt', 0, 0, { wx: cen.x, wz: cen.z, layer: 'flat', sc: 1.95 });
        w.put('building_scaffolding', 0, 0, { wx: cen.x, wz: cen.z, sc: 0.8 });
        w.put('crate_A_small', 0, 0, { wx: cen.x, wz: cen.z, dx: -1.5, dz: 0.8 });
        w.put('resource_lumber', 0, 0, { wx: cen.x, wz: cen.z, dx: 1.5, dz: 0.9 });
        w.overlay((ctx, pp, k) => plotOverlay(ctx, w, cen, pf.p.id, k), 0, 0, { dx: cen.x, dz: cen.z });
    }
    // reeds + lilies on the lake / pond margins (nothing on the lava)
    if (realm !== 'volcanic') for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const k = w.cell[r][c];
        if (k.tile !== 'hex_water' || !k.lake || rng() > 0.12) continue;
        const n = ['waterlily_A', 'waterlily_B', 'waterplant_A', 'waterplant_B'][Math.floor(rng() * 4)];
        w.put(n, c, r, { dx: (rng() - 0.5) * 0.8, dz: (rng() - 0.5) * 0.6, h: -0.2 });
    }
    // water / lava cells (animated in renderFrame)
    const waterCells = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (w.cell[r][c].tile === 'hex_water') waterCells.push([c, r]);
    return { w, info, plots, team, biome, realm, waterCells };
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

// ── old water art (two glint frames, 64x32) → white glint masks for the animated water / lava ──
let _glints = null;
async function glints() {
    if (_glints) return _glints;
    const { createCanvas, loadImage } = require('canvas');
    const out = [];
    for (const f of ['base_water_0.png', 'base_water_1.png']) {
        try {
            const img = await loadImage(path.join(ASSETS, f));
            const c = createCanvas(img.width, img.height), x = c.getContext('2d');
            x.drawImage(img, 0, 0);
            const d = x.getImageData(0, 0, c.width, c.height);
            for (let i = 0; i < d.data.length; i += 4) {
                const lum = (d.data[i] + d.data[i + 1] + d.data[i + 2]) / 3;
                const a = d.data[i + 3];
                if (a > 20 && lum > 135) { d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; d.data[i + 3] = Math.min(255, (lum - 120) * 2); }
                else d.data[i + 3] = 0;                                    // keep ONLY the bright glints, drop the diamond fill
            }
            x.putImageData(d, 0, 0);
            out.push(c);
        } catch (e) { /* no glints: water just stays still */ }
    }
    _glints = out;
    return out;
}

// ── scene cache (static art, no HUD / animation) ──
const _scenes = new Map();
const SCENE_MAX = 3;
async function buildScene(state) {
    ensureFonts();
    const key0 = hashStr(JSON.stringify(['v10', state.owner, state.structures, state.freePlots, realmBiome(state)]));
    const hit = _scenes.get(key0);
    if (hit) { _scenes.delete(key0); _scenes.set(key0, hit); return hit; }
    const { w, info, plots, team, biome, realm, waterCells } = buildWorld(state);
    // fixed card: the village green sits slightly above centre, the over-sized grid fills every pixel
    const focus = centroid([hc(7, 7), hc(8, 7), hc(7, 8), hc(8, 8)]);
    w.layoutFixed(CARD_W, CARD_H, focus.x, focus.z, CARD_W / 2, CARD_H * 0.47);
    const { createCanvas } = require('canvas');
    const seed = hashStr(state.owner || 'base');
    const bi = (K.biomeInfo('iso').biomes || {})[realm];
    const bd = realm === 'isle' ? { top: '#cfe8ef', mid: '#8fc7b2', bot: '#3f7a5c' } : bi ? { top: bi.backdrop[0], mid: bi.backdrop[1], bot: bi.backdrop[2] } : { top: '#356f6a', mid: '#1f4a4c', bot: '#0d2527' };
    const terrain = createCanvas(CARD_W, CARD_H), tctx = terrain.getContext('2d');
    await w.draw(tctx, { phase: 'terrain', drawBackdrop: (c2) => { const g = c2.createLinearGradient(0, 0, 0, CARD_H); g.addColorStop(0, bd.top); g.addColorStop(0.5, bd.mid); g.addColorStop(1, bd.bot); c2.fillStyle = g; c2.fillRect(0, 0, CARD_W, CARD_H); } });
    const objects = createCanvas(CARD_W, CARD_H), octx = objects.getContext('2d');
    await w.draw(octx, { phase: 'objects' });
    const k = SCALE;
    const smoke = [];
    for (const it of info) {
        if (it.st.type === 'hunting') continue;
        const lv = it.def.levels.find((l) => l.level === it.lvl) || it.def.levels[0];
        const p = w.proj(it.cen.x, it.cen.z + 2.1, 0);
        plaque(octx, p.x, p.y + 2 * k * 2, it.def.name, `${lv.name} · Lv ${it.lvl}`, k);
        if (it.st.type === 'house' || it.st.type === 'blacksmith' || it.st.type === 'alchemy') {
            const sp = w.proj(it.cen.x + 0.5, it.cen.z - 0.4, 2.2); smoke.push({ x: sp.x, y: sp.y, smoky: it.st.type === 'blacksmith' });
        }
    }
    // screen polygons of every open-water cell, for the animated shimmer / lava glow
    const water = [];
    for (const [c, r] of waterCells) {
        const poly = w.cellPoly(c, r, -0.2);
        const cx = poly.reduce((a, p) => a + p.x, 0) / 6, cy = poly.reduce((a, p) => a + p.y, 0) / 6;
        if (cx < -80 || cx > CARD_W + 80 || cy < -80 || cy > CARD_H + 80) continue;
        water.push({ poly, cx, cy, h: hashStr(`${c},${r}`) });
    }
    const scene = { terrain, objects, W: CARD_W, H: CARD_H, w, k, smoke, biome, realm, water, seed };
    _scenes.set(key0, scene);
    while (_scenes.size > SCENE_MAX) _scenes.delete(_scenes.keys().next().value);
    return scene;
}

function animateWater(ctx, sc, t, G) {
    const lava = sc.realm === 'volcanic', ice = sc.realm === 'tundra';
    const cellW = 1.9 * 96 * sc.k;                                   // glint tile ≈ one cell wide
    ctx.save();
    for (const cell of sc.water) {
        const ph = (t + (cell.h % 997) / 997) % 1;
        ctx.save();
        ctx.beginPath(); cell.poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.clip();
        if (lava) {                                                  // molten pulse
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.16 + 0.16 * Math.sin(ph * Math.PI * 2);
            const g = ctx.createRadialGradient(cell.cx, cell.cy, 2, cell.cx, cell.cy, cellW * 0.7);
            g.addColorStop(0, 'rgba(255,190,70,1)'); g.addColorStop(1, 'rgba(255,70,0,0)');
            ctx.fillStyle = g; ctx.fillRect(cell.cx - cellW, cell.cy - cellW, cellW * 2, cellW * 2);
        }
        if (G && G.length) {
            const g = G[Math.floor(ph * 4) % G.length];                // two old-water frames, cycled
            const drift = Math.sin(ph * Math.PI * 2) * 5 * sc.k * 2;
            ctx.globalCompositeOperation = lava ? 'lighter' : 'source-over';
            ctx.globalAlpha = lava ? 0.5 : ice ? 0.35 : 0.6;
            ctx.drawImage(g, cell.cx - cellW / 2 + drift, cell.cy - cellW / 4, cellW, cellW / 2);
        }
        ctx.restore();
    }
    ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════════
//  FRAME RENDER (frame 0 = static card; frames animate water/lava + smoke + fireflies)
// ═══════════════════════════════════════════════════════════════════════════
async function renderFrame(state, frame, opts = {}) {
    const sc = await buildScene(state);
    // animated (mp4) frames are composed at reduced size: the clip is a half-res preview anyway and this halves the per-frame cost
    const as = opts.encoder === 'raw' ? ANIM_SCALE : 1;
    const out = require('canvas').createCanvas(Math.round(sc.W * as / 2) * 2, Math.round(sc.H * as / 2) * 2);
    const ctx = out.getContext('2d');
    if (as !== 1) ctx.scale(out.width / sc.W, out.height / sc.H);
    ctx.imageSmoothingQuality = 'low';
    const t = (frame || 0) / FRAMES;
    ctx.drawImage(sc.terrain, 0, 0);
    if (opts.animate || frame > 0) animateWater(ctx, sc, t, await glints());
    ctx.drawImage(sc.objects, 0, 0);
    const seed = sc.seed;
    if (opts.animate || frame > 0) {
        ctx.save();
        for (const s of sc.smoke) {                              // chimney / forge smoke puffs
            for (let i = 0; i < 4; i++) {
                const ph = (t + i / 4) % 1;
                ctx.globalAlpha = 0.5 * (1 - ph);
                ctx.fillStyle = s.smoky ? '#6b6b73' : '#d8d8de';
                ctx.beginPath(); ctx.arc(s.x + Math.sin(ph * 5 + i) * 4 * sc.k * 2 + ph * 6, s.y - ph * 42 * sc.k * 2, (3 + ph * 7) * sc.k * 2, 0, Math.PI * 2); ctx.fill();
            }
        }
        for (let i = 0; i < 22; i++) {                           // fireflies
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
    return hashStr(JSON.stringify(['v10-iso', state.owner, realmBiome(state), state.structures, state.freePlots, opts.hint || '', opts.static ? 1 : 0]));
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
