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
const { encodeRawStreamMp4 } = require('../utils/bakeStream');   // 47-k10: streaming bake — one frame alive at a time
const ambient = require('./ambient');   // shared life layer (owner 2026-10-19: "bring it to life")
const dayNight = require('./dayNight');   // Task 21: shared day/night cycle for every render

const N = 16;                 // base tiles per side (saved-structure grid)
const M = 15;                 // wilderness margin (hex cells) around the grid — big enough to over-cover the diagonal card
const COLS = N + 2 * M, ROWS = N + 2 * M;
const FRAMES = 14, FRAME_MS = 143;   // 2 s loop, 14 frames (cold bake was the slow part: ~30% cheaper than 20)
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
    shop: { x: 10, y: 11, fw: 2, fh: 2 },          // merchant market — south-east, fronting the south lane
    barracks: { x: 13, y: 11, fw: 2, fh: 2 },      // summons barracks — beside the market
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

// main sprite of a structure at a level — the one that drops in on a landing celebrate
// (owner 2026-10-19: "the building should fall in"). null → no fall (pond pier: burst only).
function mainSpriteOf(st, lvl, team) {
    const T = st.type;
    if (T === 'house') return lvl === 1 ? { name: 'building_home_A_' + team, sc: 1.55 } : { name: 'building_home_B_' + team, sc: lvl === 2 ? 1.75 : 2.05 };
    if (T === 'blacksmith') return { name: 'building_blacksmith_' + team, sc: lvl === 1 ? 1.35 : lvl === 2 ? 1.65 : 1.95 };
    if (T === 'medbay') {
        if (K.hasSprite('struct_med_tent', 'iso')) return { name: ['struct_med_tent', 'struct_med_infirmary', 'struct_med_sanatorium'][lvl - 1], sc: lvl === 1 ? 1.9 : lvl === 2 ? 1.65 : 1.5 };
        return lvl === 1 ? { name: 'tent', sc: 2.1 } : { name: 'building_church_' + team, sc: lvl === 2 ? 1.35 : 1.8 };
    }
    if (T === 'alchemy') {
        // dedicated models (alchemy centre 3D): brew hut → glasshouse → observatory;
        // barrel/tavern stand-ins stay as the fallback when sprites are missing
        if (K.hasSprite('struct_alc_brewhut', 'iso')) return { name: ['struct_alc_brewhut', 'struct_alc_glasshouse', 'struct_alc_observatory'][lvl - 1], sc: lvl === 1 ? 1.9 : lvl === 2 ? 1.75 : 1.6 };
        return lvl === 1 ? { name: 'barrel', sc: 1.6 } : { name: 'building_tavern_' + team, sc: lvl === 2 ? 1.5 : 1.9 };
    }
    if (T === 'shop') return { name: 'building_market_' + team, sc: lvl === 1 ? 1.25 : lvl === 2 ? 1.5 : 1.8 };
    if (T === 'barracks') return lvl === 1 ? { name: 'tent', sc: 2.0 } : { name: 'building_barracks_' + team, sc: lvl === 2 ? 1.45 : 1.8 };
    if (T === 'mines') {
        // 47-k8 (owner: "implement some of the Clash assets ... make it fit in"): Clash-grade gold-mine
        // ladder on the SAME worksite — wooden hut → stone mine → deep dark seam (tinted to the palette,
        // GPLv3 credit in docs/asset_credits.md). KayKit cave stays as the fallback below.
        if (K.hasSprite('coc_mine_l1', 'iso')) return { name: 'coc_mine_l' + lvl, sc: lvl === 1 ? 1.05 : lvl === 2 ? 1.15 : 1.25, dx: 0.1, dz: 0.15 };
        // the pack's own cave (rock face + walkway-into-rocks) IS the mine — owner 2026-10-19:
        // "For the player base not just the guild base" (it replaces the struct_mine family)
        if (K.hasSprite('building_mine_' + team, 'iso')) return { name: 'building_mine_' + team, sc: lvl === 1 ? 1.55 : lvl === 2 ? 1.75 : 1.95, dx: 0.1, dz: 0.15 };
        if (K.hasSprite('struct_mine_cave', 'iso')) return { name: ['struct_mine_cave', 'struct_mine_timber', 'struct_mine_deep'][lvl - 1], sc: lvl === 1 ? 1.95 : lvl === 2 ? 1.7 : 1.45, dx: 0.5, dz: 0.7 };
        return { name: 'building_mine_' + team, sc: lvl === 1 ? 1.35 : lvl === 2 ? 1.6 : 1.85 };
    }
    if (T === 'market')                                         // owner 2026-10-20: "a market model from the clash assets"
        return lvl === 1 ? { name: 'house_shop_' + team, sc: 1.5 } : { name: 'building_market_' + team, sc: lvl === 2 ? 1.55 : 1.9 };
    if (T === 'barracks') return { name: 'building_barracks_' + team, sc: lvl === 1 ? 1.4 : lvl === 2 ? 1.65 : 1.95 };
    return null;
}
function drawSummonPad(ctx, x, y, r) {
    ctx.save(); ctx.translate(x, y);
    const g = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
    g.addColorStop(0, 'rgba(160,140,255,0.35)'); g.addColorStop(1, 'rgba(160,140,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(170,150,255,0.85)'; ctx.lineWidth = Math.max(1.5, r * 0.06);
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.8, r * 0.36, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
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

function buildWorld(state, cel = null) {
    const seedStr = state.owner || 'base';
    const seed = hashStr(seedStr);
    const rng = mulberry32(seed);
    const team = TEAMS[seed % 4];
    const realm = realmBiome(state);                    // 'isle'|'desert'|'tundra'|'highlands'|'volcanic'
    const biome = TERRAIN_OF[realm];                    // coast|desert|tundra|wildwood|ashlands
    const coastal = realm === 'isle';
    const WP = WILDS[biome];
    const B = (n) => `building_${n}_${team}`;

    // ── per-base macro profile (owner brief 2026-10-19: bases on the same continent must not be twins) ──
    // Claude-method (traced: seeded kind + realm-appropriate palettes + spread-not-clump): every
    // choice below is a SEEDED pick from curated LEGAL variants. The street plan, gate law and
    // facade law stay canonical (v4 invariants) — only the scenery compass story and the village
    // texture (house kinds, yard dressing, farm story) re-roll per owner seed. Stable per base.
    const FARM = biome === 'coast' || biome === 'wildwood';
    const mir = rng() < 0.5;                                              // scenery mirror E/W (layout untouched)
    const MX = (gx) => (mir ? (N - 1) - gx : gx);
    const LAKE_C = [[16, 2], [15, 3], [17, 1]][Math.floor(rng() * 3)];    // lake nook in the (mirrored) NE quadrant
    const KIND_PROFILES = {
        village: null,                                                                    // default weights
        farmstead: { barn: 2.4, hut: 1.8, cottage: 1.2, townhouse: 0.4, stone: 0.6, tudor: 0.9, shop: 0.4 },
        town: { townhouse: 2.4, shop: 2.0, cottage: 0.8, stone: 1.0, tudor: 1.3, hut: 0.3, barn: 0 },
        hill: { stone: 2.4, tudor: 1.4, cottage: 1.2, townhouse: 0.5, hut: 0.8, barn: 0, shop: 0.4 },
    };
    const HW = KIND_PROFILES[Object.keys(KIND_PROFILES)[Math.floor(rng() * 4)]];
    const yardTheme = Math.floor(rng() * 3);
    const farmGrain = FARM && rng() < 0.72;                               // grain field vs tree grove
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
            if ((MX(gx) - (N - 1)) + (gy - 8) * 0.5 > 1.5 + 2.2 * coastN(c, r)) w.cell[r][c].water = true;
        }
    }
    // ── the lake in the (per-base mirrored) NE nook — the pond pier is forced over water so any nook works ──
    // owner 2026-10-20 ("fix the pond generation, the angles should be different depending"): the old
    // fill was a fixed round hexDist blob — every base's pond read as the SAME circle. The lake is now
    // a SEEDED rotated superellipse: each base rolls its own bearing, elongation and ragged shoreline,
    // so ponds point different directions on different bases.
    const [lc, lr] = hc(MX(LAKE_C[0]), LAKE_C[1]);
    const LW = K.hexWorld(lc, lr);
    const lakeAng = rng() * Math.PI;                              // bearing of the long axis (per base)
    const lakeStretch = 1.25 + rng() * 0.95;                      // 1.25x .. 2.2x elongation
    const lakeR = 3.4 + rng() * 0.8;                              // mean radius in world units
    const lakeCos = Math.cos(lakeAng), lakeSin = Math.sin(lakeAng);
    const lakeEdge = (c, r) => vnoise(seed + 911, c * 0.55, r * 0.55) * 1.1 - 0.55;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const Wp = K.hexWorld(c, r);
        const dxc = Wp.x - LW.x, dzc = Wp.z - LW.z;
        if (Math.abs(dxc) > 8 || Math.abs(dzc) > 8) continue;     // cheap pre-cull
        const rx = (dxc * lakeCos - dzc * lakeSin) / lakeStretch; // long axis → rotated x
        const rz = dxc * lakeSin + dzc * lakeCos;
        if (Math.sqrt(rx * rx + rz * rz) <= lakeR + lakeEdge(c, r)) { const kk = w.cell[r][c]; kk.water = true; kk.lake = true; }
    }
    // pier guarantee: the pond boardwalk extends off the plot's SE corner — keep that line water.
    // (implicit when the lake was a fixed blob; a rotated/stretched lake can swing away from it)
    {
        const [pc0, pr0] = hc(LAYOUT.pond.x + LAYOUT.pond.fw - 1, LAYOUT.pond.y + LAYOUT.pond.fh - 1);
        for (let i = 0; i <= 4; i++) {
            const kk = w.at(pc0 + i, pr0);
            if (kk) { kk.water = true; kk.lake = true; kk.river = false; }
        }
    }
    if (coastal) {                                      // the lake is joined to the ocean by a channel
        const [tc, tr] = hc(MX(23), 4);
        for (const [c, r] of K.hexLine(lc, lr, tc, tr)) if (inCells(c, r)) w.cell[r][c].water = true;
    } else if (biome !== 'desert') {                    // a stream wanders off the lake to the edge of the world
        let cur = [lc, lr];
        const [tc, tr] = hc(34, -22);
        const way = [hc(MX(22 + Math.floor(rng() * 4)), -2 + Math.floor(rng() * 4)), hc(MX(28 + Math.floor(rng() * 4)), -12 + Math.floor(rng() * 4)), [tc, tr]];
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
    // ── the HUNTING GROUNDS = FOREST (owner 2026-10-21: "the hunting grounds is supposed to be a forest"): no camp, no
    // buildings — the west woods stay thick and a small unclaimed-by-props glade holds wandering game (deer, boar, rabbit).
    {
        for (let gx = 0; gx <= 3; gx++) for (let gy = 6; gy <= 12; gy++) { if (gy === 9) continue; const [c, r] = hc(MX(gx), gy); if (w.inb(c, r) && gx >= 1 && gx <= 2 && gy >= 5 && gy <= 8) claim(c, r); }
        w.__huntCell = hc(MX(2), 7);
        try {
            const SS = require('./structureScenes');
            const crit = [[1, 6, 'deer', 38, false, true], [2, 7, 'deer', 32, true, false], [1, 8, 'boar', 30, false], [2, 5, 'deer', 26, true, false], [1, 5, 'boar', 24, true]];
            for (const [gx, gy, kind, sz, fl, st2] of crit) {
                const [cc, rr] = hc(MX(gx), gy); if (!w.inb(cc, rr) || w.cell[rr][cc].water) continue;
                w.overlay((ctx, p, k) => { const z2 = sz * k * 2 / 1.5; if (kind === 'deer') SS.drawDeer(ctx, p.x, p.y, z2, fl, st2); else SS.drawBoar(ctx, p.x, p.y, z2, fl); }, cc, rr, { dx: (gy % 2 ? 0.2 : -0.2) });
            }
        } catch (e) { /* decoration only */ }
    }
    w.resolve();

    // (2026-10-22: the stone wall + towers that used to cut across the south of the village are gone — the palisade's own
    //  gate is the one entrance, so nothing wall-like sits INSIDE the base any more)
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
        // the hunting walk's gate into the woods (LAYOUT v3 law: lanes terminate at
        // destinations — the west walk ends at the palisade, so the fence gets a REAL
        // gate piece there instead of a mute fence line, owner "diverse gates" 2026-10-19)
        let walkGate = null;
        {
            const we = K.hexWorld(...hc(2, LAYOUT.hunting.walkY));
            let wc = null, wd = 1e9;
            for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
                if (!inside(c, r) || ringDist(c, r) !== FAR_R - 1 || w.cell[r][c].water) continue;
                const ww = K.hexWorld(c, r), d = Math.hypot(ww.x - we.x, ww.z - we.z);
                if (d < wd) { wd = d; wc = [c, r]; }
            }
            if (wc && (!best || keyOf(wc[0], wc[1]) !== best.split(',').slice(0, 2).join(','))) {
                let bn = null, bx = 1e9;                                   // gate on the edge opening west into the woods
                for (let e = 0; e < 6; e++) {
                    const nb = K.neighbor(wc[0], wc[1], e);
                    if (inside(nb[0], nb[1])) continue;
                    const nk = w.at(nb[0], nb[1]);
                    if (!nk || nk.water || nk.river) continue;
                    const nx = K.hexWorld(nb[0], nb[1]).x;
                    if (nx < bx) { bx = nx; bn = e; }
                }
                if (bn != null) walkGate = `${wc[0]},${wc[1]},${bn}`;
            }
        }
        // village tier = the home's level (owner 2026-10-19/20: the base grows more impressive as it is upgraded):
        // lv2 = corner watchtowers on the palisade, lv3 = the palisade becomes a STONE wall ring with towers.
        const homeSt = (state.structures || []).find((x) => x.type === 'house');
        const vTier = Math.max(1, Math.min(3, (homeSt && homeSt.level) || 1));
        const ringCells = K.ring(centreCell[0], centreCell[1], FAR_R - 1);
        const dry = ([c, r]) => w.inb(c, r) && !w.cell[r][c].water && !w.cell[r][c].river;
        let stoneWall = false;
        if (vTier >= 3 && ringCells.length > 6 && best) {
            // lay the stone curtain in contiguous DRY runs (a lake or river breaks the ring into arcs)
            const gc2 = best.split(',').slice(0, 2).join(',');
            const start = ringCells.findIndex((x) => !dry(x));
            const rot = start < 0 ? ringCells : ringCells.slice(start).concat(ringCells.slice(0, start));
            const runs = []; let cur = [];
            for (const x of rot) { if (dry(x)) cur.push(x); else if (cur.length) { runs.push(cur); cur = []; } }
            if (cur.length) runs.push(cur);
            if (start < 0) runs.splice(0, runs.length, ringCells);
            for (const run of runs) {
                if (run.length < 3) continue;
                w.layWall(run, { closed: start < 0, gates: new Set([gc2]), outside: true });
            }
            stoneWall = true;
        } else {
            w.layFenceEdges(inside, { gateAt: (c, r, e) => `${c},${r},${e}` === best || `${c},${r},${e}` === walkGate });
        }
        if (vTier >= 2 && ringCells.length > 6) {
            for (let i = 0; i < 6; i++) {
                const [tc, tr] = ringCells[Math.floor(i * ringCells.length / 6)];
                if (!w.inb(tc, tr) || w.cell[tr][tc].water) continue;
                w.put('building_tower_A_' + team, tc, tr, { sc: vTier >= 3 ? 1.15 : 0.85, sort: 0.5 });
                if (vTier >= 3) w.put('flag_' + team, tc, tr, { dx: 0.3, dz: -0.2, h: 1.4, sc: 0.7 });
            }
        }
        if (!stoneWall && best && K.hasSprite('struct_gate_90', 'iso')) {                   // the village entrance: a stone gatehouse spanning the palisade gap
            const [gc, gr, ge] = best.split(',').map(Number); const nbG = K.neighbor(gc, gr, ge);
            const a0 = K.hexWorld(gc, gr), a1 = K.hexWorld(nbG[0], nbG[1]);
            // sprite yaw must equal MINUS the edge's world tangent (the bake yaws the model
            // clockwise, the iso cam yaw cancels out): tangents are e0/e3 90°, e1/e4 150°,
            // e2/e5 30° → yaws 90/30/150. The old +60e mapping walled every E/SE/W/NW gap sideways.
            w.put('struct_gate_' + [90, 30, 150, 90, 30, 150][ge], 0, 0, { wx: (a0.x + a1.x) / 2, wz: (a0.z + a1.z) / 2, sc: 1.35, sort: 0.6 });
        }
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
    const freeCell = (c, r) => { const k = w.at(c, r); return !!k && !k.water && !k.river && !k.coast && !k.road && !used.has(keyOf(c, r)); };
    const gridOK = (c, r) => { const gx = c - M, gy = r - M; return inGrid(gx, gy) && !inZ(mz, gx, gy) && !inZ(hz, gx, gy) && gx < 15; };
    const cands = [];
    for (const [rc, rr] of roadList) for (let d = 0; d < 6; d++) {
        const [c, r] = K.neighbor(rc, rr, d);
        if (freeCell(c, r) && gridOK(c, r)) cands.push({ c, r, rc, rr });
    }
    for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
    const want = Math.min(14, 8 + sts.length * 2);
    const YARD_THEMES = [
        [['barrel', 0.9, 0.7], ['crate_A_small', -0.9, 0.7], ['bucket_water', 0.8, -0.6], ['wheelbarrow', -0.8, 0.8], ['sack', 0.6, 0.9], ['resource_lumber', -0.9, -0.5], ['crate_open', 0.9, 0.6], ['pallet', -0.7, 0.8]],
        [['crate_A_small', 0.9, 0.7], ['crate_open', -0.9, 0.7], ['sack', 0.8, -0.6], ['crate_B_small', -0.8, 0.8], ['pallet', 0.6, 0.9], ['barrel', -0.9, -0.5], ['crate_long_A', 0.9, 0.6], ['crate_A_big', -0.7, 0.8]],
        [['bucket_water', 0.9, 0.7], ['barrel', -0.9, 0.7], ['resource_lumber', 0.8, -0.6], ['wheelbarrow', -0.8, 0.8], ['crate_long_A', 0.6, 0.9], ['sack', -0.9, -0.5], ['crate_B_small', 0.9, 0.6], ['pallet', -0.7, 0.8]],
    ];
    const YARD = YARD_THEMES[yardTheme];
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
        w.put(hut ? 'tent' : (K.houseName(rng, biome, { view: 'iso', weights: HW }) || (useB ? B('home_B') : B('home_A'))), cd.c, cd.r, { sc: hut ? 1.2 : 1.12 + rng() * 0.12, flip: west });
        for (let i = 0; i < 2; i++) { const y = YARD[Math.floor(rng() * YARD.length)]; w.put(y[0], cd.c, cd.r, { dx: y[1], dz: y[2] }); }
        if (rng() < 0.5) w.put(SMALL_TREES[Math.floor(rng() * 4)], cd.c, cd.r, { dx: -1.1, dz: -0.9, sc: 0.85 });
    }
    // farm patch (grain) by the SE lane, or a caravan camp where there is no soil
    {
        const seedCells = [];
        for (let gy = 11; gy < 15; gy++) for (let gx = 10; gx < 15; gx++) { const [c, r] = hc(MX(gx), gy); if (freeCell(c, r)) seedCells.push([c, r]); }
        if (seedCells.length) {
            const [sc0, sr0] = seedCells[Math.floor(rng() * seedCells.length)];
            let n = 0;
            const story = FARM ? (farmGrain ? 'grain' : 'grove') : 'caravan';
            for (const [c, r] of [[sc0, sr0], ...[0, 1, 2, 3, 4, 5].map((d) => K.neighbor(sc0, sr0, d))]) {
                if (!freeCell(c, r) || n >= 5) continue;
                if (story === 'grain' && n === 0) w.put(K.houseName(rng, biome, { view: 'iso', farm: true, kinds: ['barn'] }) || 'house_barn_red', c, r, { sc: 1.12, flip: flip() });   // the farm gets its barn (unused pack asset)
                else if (story === 'grain') w.put('building_grain', c, r, { sc: 1.0 });
                else if (story === 'grove') w.put(SMALL_TREES[Math.floor(rng() * 4)], c, r, { sc: 0.85, flip: flip() });
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
        w.put(K.houseName(rng, biome, { view: 'iso', farm: FARM, shop: false, weights: HW }) || (rng() < 0.5 ? B('home_A') : B('home_B')), c, r, { sc: 1.08 + rng() * 0.1, flip: rng() < 0.5 });
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
            if (rng() < 0.16) { w.put(rng() < 0.5 ? 'coc_flag_rally' : 'coc_flag_pirate', c, r, { dx: (rng() < 0.5 ? -1 : 1) * 0.9, dz: (rng() - 0.5) * 0.5, sc: 0.8 }); n++; continue; }   // 47-k8: the odd Clash banner along the lanes
            w.put(fur[Math.floor(rng() * fur.length)], c, r, { dx: (rng() < 0.5 ? -1 : 1) * 0.85, dz: (rng() - 0.5) * 0.6, sc: 0.9 });
            n++;
        }
    }

    // ── 2026-10-22 "make it more base like": a small FARM quarter (fields + windmill + hay) on the free ground in the SW and a
    // tree belt just inside the palisade — the village reads as a settled, working base instead of scattered huts in a big empty field.
    {
        const free = (c, r) => w.inb(c, r) && !w.cell[r][c].water && !w.cell[r][c].river && !w.cell[r][c].road && !w.cell[r][c].coast && !used.has(keyOf(c, r));
        const fieldCells = [];
        for (let gx = 3; gx <= 7; gx++) for (let gy = 11; gy <= 13; gy++) { const [c, r] = hc(gx, gy); if (free(c, r) && ringDist(c, r) <= FAR_R - 2) fieldCells.push([c, r]); }
        const hasG = K.hasSprite('building_grain', 'iso');
        let mill = false;
        fieldCells.slice(0, 7).forEach(([c, r], i) => {
            if (!mill && i === 3 && K.hasSprite('building_windmill_' + team, 'iso')) { w.put('building_windmill_' + team, c, r, { sc: 0.95 }); mill = true; claim(c, r); return; }
            if (hasG) w.put('building_grain', c, r, {}); else w.put('sack', c, r, {});
            claim(c, r);
        });
        if (fieldCells.length > 7) { const [c, r] = fieldCells[7]; w.put('sack', c, r, { dx: 0.3 }); claim(c, r); }
    }

    // ── fill the rest of the grid with biome wilds (village green = light, inside the palisade; far field = heavy) ──
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const k = w.cell[r][c];
        if (k.water || k.coast || k.road || used.has(keyOf(c, r))) continue;
        const gx = c - M, gy = r - M, x = rng();
        const rd = ringDist(c, r);
        if (inGrid(gx, gy) && inZ(mz, MX(gx), gy)) {                      // quarry hills (NW, mirrored per base)
            if (x < 0.62) { w.put(['mountain_A_grass_trees', 'mountain_B_grass', 'mountain_C_grass_trees', 'mountain_A'][Math.floor(rng() * 4)], c, r, { flip: flip() }); claim(c, r); }
            else if (x < 0.82) rock(c, r);
            continue;
        }
        if (inGrid(gx, gy) && inZ(hz, MX(gx), gy)) {                      // hunting woods (W, mirrored per base)
            if (x < 0.93) { w.put(TREES[Math.floor(rng() * 4)], c, r, { flip: flip() }); claim(c, r); }
            continue;
        }
        if (rd === FAR_R - 1) {                                       // tree belt hugging the inside of the fence
            if (x < 0.55) { w.put(TREES[Math.floor(rng() * 4)], c, r, { sc: 0.9, flip: flip() }); claim(c, r); }
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
    let fall = null;
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
        if (cel && st.type === cel.type && st.x === cel.x && st.y === cel.y) {
            // the celebrated structure is OMITTED from the scene (plot keeps its dirt pad);
            // its main sprite goes to the frame overlay, which drops it in from the sky
            // (paintLanding). An UPGRADE (cel.prev >= 1) also records the replaced building's
            // main sprite — the overlay sinks it into the ground as the new one comes in.
            w.put('building_dirt', 0, 0, { wx: cen.x, wz: cen.z, layer: 'flat', sc: def.fw >= 3 ? 1.9 : 1.2 });
            const ms = mainSpriteOf(st, lvl, team);
            if (ms) {
                fall = { name: ms.name, wx: cen.x + (ms.dx || 0), wz: cen.z + (ms.dz || 0), sc: ms.sc, flip: ff };
                const prev = Number.isInteger(cel.prev) ? Math.max(1, cel.prev) : 0;      // 0 = fresh build, nothing to swallow
                if (prev >= 1 && prev < lvl) {
                    const oms = mainSpriteOf(st, prev, team);
                    if (oms) fall.old = { name: oms.name, wx: cen.x + (oms.dx || 0), wz: cen.z + (oms.dz || 0), sc: oms.sc, flip: ff };
                }
            }
            continue;
        }
        if (st.type !== 'hunting' && st.type !== 'barracks') w.put('building_dirt', 0, 0, { wx: cen.x, wz: cen.z, layer: 'flat', sc: def.fw >= 3 ? 1.9 : 1.2 });
        const P = (n, o = {}) => w.put(n, 0, 0, { wx: cen.x, wz: cen.z, ...(o.dx == null && o.dz == null && !('flip' in o) && (n.startsWith('building_') || n.startsWith('struct_')) ? { flip: ff } : {}), ...o });
        switch (st.type) {
            case 'house':
                if (lvl === 1) { P('building_home_A_' + team, { sc: 1.55 }); P('building_well_' + team, { dx: 1.5, dz: 0.9 }); P('crate_A_small', { dx: -1.4, dz: 1.0 }); }
                else if (lvl === 2) { P('building_home_B_' + team, { sc: 1.75 }); P('building_well_' + team, { dx: 1.7, dz: 1.0 }); P('crate_A_small', { dx: -1.5, dz: 0.8 }); P('barrel', { dx: -1.0, dz: 1.6 }); }
                else { P('building_home_B_' + team, { sc: 2.05 }); P('building_home_A_' + team, { dx: -2.0, dz: 0.5, sc: 0.95, flip: true }); P('building_well_' + team, { dx: 1.8, dz: 1.2 }); P('flag_' + team, { dx: 0.9, dz: 1.5 }); P('wheelbarrow', { dx: -0.3, dz: 1.9 }); P('coc_statue_dragon', { dx: 2.3, dz: 2.0, sc: 0.62, flip: true }); }
                break;
            case 'blacksmith':
                if (lvl === 1) { P('building_blacksmith_' + team, { sc: 1.35 }); P('crate_A_small', { dx: 1.3, dz: 0.8 }); P('resource_stone', { dx: -1.2, dz: 0.9 }); }
                else if (lvl === 2) { P('building_blacksmith_' + team, { sc: 1.65 }); P('weaponrack', { dx: -1.4, dz: 0.9 }); P('resource_stone', { dx: 1.5, dz: 0.9 }); }
                else { P('building_blacksmith_' + team, { sc: 1.95 }); P('weaponrack', { dx: -1.8, dz: 1.0 }); P('resource_stone', { dx: 1.7, dz: 1.0 }); P('wheelbarrow', { dx: 1.0, dz: 1.7 }); P('barrel', { dx: -0.8, dz: 1.6 }); P('coc_torch', { dx: 0.7, dz: -1.5, sc: 0.85 }); }
                break;
            case 'medbay':                                                // dedicated models: medic tent → infirmary → sanatorium
                if (K.hasSprite('struct_med_tent', 'iso')) {
                    P(['struct_med_tent', 'struct_med_infirmary', 'struct_med_sanatorium'][lvl - 1], { sc: lvl === 1 ? 1.9 : lvl === 2 ? 1.65 : 1.5 });
                    P('bucket_water', { dx: -1.5, dz: 1.0 }); if (lvl === 3) P('flag_' + team, { dx: 1.7, dz: 1.1 });
                    break;
                }
                if (lvl === 1) { P('tent', { sc: 2.1 }); P('sack', { dx: 1.3, dz: 0.9 }); P('bucket_water', { dx: -1.3, dz: 0.9 }); }
                else if (lvl === 2) { P('building_church_' + team, { sc: 1.35 }); P('tent', { dx: 1.7, dz: 0.8, sc: 1.2 }); P('bucket_water', { dx: -1.5, dz: 0.9 }); }
                else { P('building_church_' + team, { sc: 1.8 }); P('building_well_' + team, { dx: 1.8, dz: 1.0 }); P('flag_' + team, { dx: -1.6, dz: 1.0 }); }
                break;
            case 'alchemy':                                               // dedicated models: brew hut → glasshouse → observatory
                if (K.hasSprite('struct_alc_brewhut', 'iso')) {
                    P(['struct_alc_brewhut', 'struct_alc_glasshouse', 'struct_alc_observatory'][lvl - 1], { sc: lvl === 1 ? 1.9 : lvl === 2 ? 1.75 : 1.6 });
                    P('bucket_water', { dx: 1.4, dz: 1.0 }); if (lvl === 3) P('coc_statue_wizard', { dx: -1.7, dz: 1.2, sc: 0.65 });
                    break;
                }
                if (lvl === 1) { P('barrel', { sc: 1.6 }); P('bucket_water', { dx: 1.2, dz: 0.8 }); P('crate_open', { dx: -1.2, dz: 0.8 }); }
                else if (lvl === 2) { P('building_tavern_' + team, { sc: 1.5 }); P('barrel', { dx: 1.5, dz: 1.0 }); P('crate_B_small', { dx: -1.4, dz: 1.0 }); }
                else { P('building_tavern_' + team, { sc: 1.9 }); P('building_windmill_' + team, { dx: -2.1, dz: -0.2, sc: 0.95 }); P('barrel', { dx: 1.8, dz: 1.1 }); P('crate_B_small', { dx: 0.9, dz: 1.7 }); P('coc_statue_wizard', { dx: 2.2, dz: 0.3, sc: 0.65 }); }
                break;
            case 'shop':                                                  // the pack's merchant market, growing from stall to bazaar
                P('building_market_' + team, { sc: lvl === 1 ? 1.25 : lvl === 2 ? 1.5 : 1.8 });
                P('crate_A_small', { dx: 1.4, dz: 0.9 }); P('barrel', { dx: -1.3, dz: 1.0 });
                if (lvl >= 2) { P('crate_long_A', { dx: -1.9, dz: 0.2 }); P('sack', { dx: 1.7, dz: 0.2 }); P('flag_' + team, { dx: 1.1, dz: -1.0 }); }
                if (lvl >= 3) { P('building_market_' + team, { dx: -2.3, dz: -0.6, sc: 1.0, flip: true }); P('wheelbarrow', { dx: 0.4, dz: 1.8 }); P('crate_B_big', { dx: 2.0, dz: 1.0 }); }
                break;
            case 'barracks': {                                            // OWNER 2026-10-21: green ground + the SUMMON SPRITES (no building)
                const SS = require('./structureScenes');
                const n = lvl === 1 ? 2 : lvl === 2 ? 3 : 4;
                const names = SS.pickSummons(hashStr(String(st.uid || st.type) + ':b'), n);
                const spots = [[-2.1, 0.7], [2.1, 0.5], [0.0, -1.1], [0.0, 2.0]];
                w.overlay((ctx, p, k) => { const rr = 230 * k * 2 / 1.5; const g = ctx.createRadialGradient(p.x, p.y, rr * 0.2, p.x, p.y, rr); g.addColorStop(0, 'rgba(96,170,76,0.95)'); g.addColorStop(0.7, 'rgba(96,170,76,0.8)'); g.addColorStop(1, 'rgba(96,170,76,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(p.x, p.y, rr, rr * 0.5, 0, 0, Math.PI * 2); ctx.fill(); }, 0, 0, { dx: cen.x, dz: cen.z + 0.3 });   // the green lawn under the muster
                names.forEach((nm, i) => {
                    const [ox, oz] = spots[i];
                    w.overlay((ctx, p, k) => { const kk = k * 2 / 1.5; drawSummonPad(ctx, p.x, p.y, 62 * kk); SS.drawSummonSprite(ctx, p.x, p.y + 4 * kk, 150 * kk, nm, i % 2 === 1); }, 0, 0, { dx: cen.x + ox, dz: cen.z + oz });
                });
                P('flag_' + team, { dx: -1.9, dz: -0.9, sc: 1.1 });
                if (lvl >= 2) P('flag_' + team, { dx: 1.9, dz: -0.9, sc: 1.1 });
                if (lvl >= 3) { P('fence_wood_straight@0', { dx: -0.2, dz: 2.3 }); P('weaponrack', { dx: -1.9, dz: 1.5, sc: 0.9 }); }
                break;
            }
            case 'mines':                                                 // the pack cave (walkway-into-rocks) is THE mine at every level —
                // owner 2026-10-19: "Move the cave inside the base ... For the player base not just the guild base".
                // The worksite GROWS with the level: bare cave → ladder + cart → full ore-hoist yard.
                if (K.hasSprite('building_mine_' + team, 'iso')) {
                    P(B('mine'), { sc: lvl === 1 ? 1.55 : lvl === 2 ? 1.75 : 1.95, dx: 0.1, dz: 0.15 });
                    P('resource_stone', { dx: 1.7, dz: 1.3 });
                    if (lvl >= 2) { P('ladder', { dx: -1.25, dz: 0.55, sc: 0.9 }); P('wheelbarrow', { dx: 1.15, dz: 1.85 }); }
                    if (lvl >= 3) { P('building_scaffolding', { dx: -1.4, dz: 0.3, sc: 0.9, flip: true }); P('resource_lumber', { dx: 0.45, dz: 1.95 }); P('crate_long_A', { dx: -1.9, dz: 1.15 }); }
                    break;
                }
                if (K.hasSprite('struct_mine_cave', 'iso')) {              // legacy fallback if the pack sprite ever goes missing
                    P(['struct_mine_cave', 'struct_mine_timber', 'struct_mine_deep'][lvl - 1], { sc: lvl === 1 ? 1.95 : lvl === 2 ? 1.7 : 1.45, dx: 0.5, dz: 0.7 });
                    break;
                }
                P('building_mine_' + team, { sc: lvl === 1 ? 1.35 : lvl === 2 ? 1.6 : 1.85 });
                break;
            case 'pond': {                                              // the lakeside boardwalk: a pier out over the water, aimed at THIS base's lake
                // (owner 2026-10-20: "fix the pond generation, the angles should be different") — the lake
                // nook, the shore cell and the pier heading all follow the per-base lake, so ponds differ.
                let sc1 = cells[0][0], sr1 = cells[0][1], bdl = 1e9;
                for (const [c, r] of cells) { const dd = K.hexDist(c, r, lc, lr); if (dd < bdl) { bdl = dd; sc1 = c; sr1 = r; } }
                let pd = 0, pb = 1e9;
                for (let e = 0; e < 6; e++) {
                    const nb = K.neighbor(sc1, sr1, e);
                    if (cells.some(([c, r]) => c === nb[0] && r === nb[1])) continue;
                    const dd = K.hexDist(nb[0], nb[1], lc, lr) + (e === 3 || e === 4 ? 0.4 : 0);   // W/NW piers hide behind the dock hut: slightly less likely
                    if (dd < pb) { pb = dd; pd = e; }
                }
                const len = lvl === 1 ? 2 : lvl === 2 ? 3 : 4;
                { let cc = sc1, rr = sr1; for (let i = 0; i < len; i++) { const nb = K.neighbor(cc, rr, pd); const kk = w.at(nb[0], nb[1]); if (kk) { kk.water = true; kk.river = false; } cc = nb[0]; rr = nb[1]; } }
                lakeShore.push([sc1, sr1, len, pd]);
                // dock yard props sit on the landward side, opposite the pier
                const w0 = K.hexWorld(sc1, sr1), w1 = K.hexWorld(...K.neighbor(sc1, sr1, pd));
                const vx = w1.x - w0.x, vz = w1.z - w0.z, px = -vz, pz = vx;          // pier direction + perpendicular
                const back = (a2, b2) => ({ dx: -vx * a2 + px * b2, dz: -vz * a2 + pz * b2 });
                P('barrel', back(0.8, 0.5)); P('crate_open', back(0.5, -0.9)); P('bucket_water', back(1.2, 0.0));
                if (lvl >= 2) { P('sack', back(1.1, 0.9)); P('resource_lumber', back(0.3, 1.2)); }
                if (lvl >= 3) { P(B('watermill'), { ...back(1.9, 0.2), sc: 0.95 }); }
                break;
            }
            default: break;
        }
    }
    w.resolve();                                                      // re-resolve now that the pier cells are water
    for (const [c, r, len, pd] of lakeShore) {
        const cells = w.layPier(c, r, pd || 0, len);
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
    return { w, info, plots, team, biome, realm, waterCells, fall };
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

// ── old water glint masks + the boosted water animation now live in ./ambient ──

// ── scene cache (static art, no HUD / animation) ──
const _scenes = new Map();
const SCENE_MAX = 3;
async function buildScene(state, opts = {}) {
    ensureFonts();
    const cel = (opts.celebrate && typeof opts.celebrate === 'object') ? opts.celebrate : null;
    const key0 = hashStr(JSON.stringify(['v11-life', state.owner, state.structures, state.freePlots, realmBiome(state), cel || '']));
    const hit = _scenes.get(key0);
    if (hit) { _scenes.delete(key0); _scenes.set(key0, hit); return hit; }
    const { w, info, plots, team, biome, realm, waterCells, fall } = buildWorld(state, cel);
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
        const lv = it.def.levels.find((l) => l.level === it.lvl) || it.def.levels[0];
        const huntSpot = it.st.type === 'hunting' ? K.hexWorld(...(w.__huntCell || hc(2, 10))) : null;      // the plaque stands at the hunting CAMP, not the gatehouse
        const p = huntSpot ? w.proj(huntSpot.x, huntSpot.z + 1.5, 0) : w.proj(it.cen.x, it.cen.z + 2.1, 0);
        plaque(octx, p.x, p.y + 2 * k * 2, it.st.type === 'hunting' ? 'Hunting Grounds' : it.def.name, it.st.type === 'hunting' ? 'Deep Woods' : `${lv.name} · Lv ${it.lvl}`, k);
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
        let shore = false;                                           // touches land → ripple rings
        for (let d = 0; d < 6 && !shore; d++) { const nb = K.neighbor(c, r, d); const nk = w.at(nb[0], nb[1]); if (nk && !nk.water && !nk.river) shore = true; }
        water.push({ poly, cx, cy, h: hashStr(`${c},${r}`), shore });
    }
    const sway = await ambient.swayTrees(w);                         // tree sprites for the wind shuffle
    const walkers = ambient.buildWalkers(w, seed, { n: 10, maxY: CARD_H - 190 });
    const boats = ambient.buildBoats(water, seed, k);
    // Task 21 day/night: where the night LIGHT SOURCES live — every building
    // gets a warm window glow once the sun is down.
    const lights = [];
    for (const it of info) {
        const wp = w.proj(it.cen.x, it.cen.z, 1.5);
        lights.push({ x: wp.x, y: wp.y, warm: it.st.type === 'blacksmith' ? '#ff9a4a' : it.st.type === 'alchemy' ? '#9ae89a' : '#ffcf7a' });
    }
    const scene = { terrain, objects, W: CARD_W, H: CARD_H, w, k, smoke, lights, biome, realm, water, sway, walkers, boats, seed, fall };
    _scenes.set(key0, scene);
    while (_scenes.size > SCENE_MAX) _scenes.delete(_scenes.keys().next().value);
    return scene;
}

// ═══════════════════════════════════════════════════════════════════════════
//  FRAME RENDER (frame 0 = static card; frames animate water/lava + smoke +
//  fireflies + tree sway + birds + butterflies + cloud shadows + tint — the
//  owner 2026-10-19 "bring it to life" pass, shared code in ./ambient)
// ═══════════════════════════════════════════════════════════════════════════
async function renderFrame(state, frame, opts = {}) {
    const sc = await buildScene(state, opts);
    // animated (mp4) frames are composed at reduced size: the clip is a half-res preview anyway and this halves the per-frame cost
    const as = opts.encoder === 'raw' ? ANIM_SCALE : 1;
    const out = require('canvas').createCanvas(Math.round(sc.W * as / 2) * 2, Math.round(sc.H * as / 2) * 2);
    const ctx = out.getContext('2d');
    if (as !== 1) ctx.scale(out.width / sc.W, out.height / sc.H);
    ctx.imageSmoothingQuality = 'low';
    const t = (frame || 0) / FRAMES;
    ctx.drawImage(sc.terrain, 0, 0);
    if (opts.animate || frame > 0) ambient.animateWater(ctx, sc, t, await ambient.glints());
    ctx.drawImage(sc.objects, 0, 0);
    const seed = sc.seed;
    if (opts.animate || frame > 0) {
        ambient.drawSway(ctx, sc.sway, t);                       // trees shuffle in the wind
        ambient.drawBoats(ctx, sc.boats, t, sc.k);               // sailboats on the lake / sea
        ambient.drawWalkers(ctx, sc.walkers, t, sc.k);           // villagers strolling the lanes
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
        ambient.drawCloudShadows(ctx, sc.W, sc.H, t, seed);      // slow light drift over the land
        ambient.drawBirds(ctx, sc.W, sc.H, t, seed);             // flocks crossing the sky
        ambient.drawButterflies(ctx, sc.W, sc.H, t, seed);       // garden flutter
        ambient.drawTint(ctx, sc.W, sc.H, t);                    // warm/cool breathing
    }
    // ── DAY & NIGHT CYCLE (Task 21: the village gets darker, its windows and
    // forges glow through the dark) — applies to the static card too ──
    const dnPhase = opts.phase || dayNight.phaseAt();
    dayNight.grade(ctx, sc.W, sc.H, dnPhase);
    if (dnPhase === 'night' || dnPhase === 'dusk') {
        for (const l of (sc.lights || [])) {
            dayNight.light(ctx, l.x, l.y, sc.H * 0.055, l.warm, dnPhase === 'night' ? 0.5 : 0.26, false);
            dayNight.light(ctx, l.x, l.y, sc.H * 0.014, l.warm, dnPhase === 'night' ? 0.55 : 0.3);
        }
        if (dnPhase === 'night') {
            dayNight.moonStars(ctx, sc.W, sc.H, { seed: 51, moonX: 0.9, moonY: 0.07, stars: 16, starAlpha: 0.75, skyH: 0.22 });
            dayNight.fireflies(ctx, sc.W, sc.H, t, sc.seed, 6, { x: sc.W * 0.1, y: sc.H * 0.45, w: sc.W * 0.8, h: sc.H * 0.45 });
        }
    }
    if (opts.celebrate) {
        // owner 2026-10-19: the building falls in and the confetti explodes FROM it —
        // landing celebrate when the frame knows the target, card-wide rain otherwise
        const cel = (opts.celebrate && typeof opts.celebrate === 'object') ? opts.celebrate : null;
        if (!(cel && sc.fall && await K.paintLanding(ctx, sc.w, sc.W, sc.H, t, seed, sc.k, sc.fall))) {
            K.paintConfetti(ctx, sc.W, sc.H, t, seed, sc.k);
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
    return hashStr(JSON.stringify(['v12-iso-life', state.owner, realmBiome(state), state.structures, state.freePlots, opts.hint || '', opts.static ? 1 : 0, opts.celebrate ? JSON.stringify(opts.celebrate) : '', opts.phase || dayNight.phaseAt()]));
}

async function renderBaseImage(state, opts = {}) {
    const k = stateHash(state, opts);
    const hit = _renderCache.get(k);
    if (hit && (Date.now() - hit.ts) < CACHE_TTL) return hit;
    const out = await mediaCache.cached('base', k, async () => {
        if (opts.static) return encodeOut(await renderFrame(state, 0, { ...opts, returnCanvas: true }));
        // STREAMING BAKE (47-k10, Task-37 pattern): feed ffmpeg's stdin AS
        // frames render — the old loop held all 20 raw BGRA frames (~100MB+)
        // before the encode started; now one frame lives at a time and the
        // encode overlaps the render. Byte-identical encode output.
        try {
            const f0 = await renderFrame(state, 0, { ...opts, encoder: 'raw', animate: true });
            await breath();
            const mp4 = await encodeRawStreamMp4({
                first: f0, count: FRAMES, frameMs: FRAME_MS, tmpPrefix: 'base',
                next: async (f) => { const fr = await renderFrame(state, f, { ...opts, encoder: 'raw', animate: true }); await breath(); return fr; },
            });
            if (mp4 && mp4.length > 1000) return { buffer: mp4, contentType: 'video/mp4' };
        } catch (e) { console.error('[baseRenderer] mp4 encode failed, JPEG fallback:', e.message); }
        return encodeOut(await renderFrame(state, 0, { ...opts, returnCanvas: true }));
    }, { state, opts: { hint: opts.hint, celebrate: opts.celebrate } },   // 47-k8c: journal for renderWarmer (post-deploy re-bake; `static` stripped so replays take the default mp4 path)
    { label: 'bake:base', timeoutMs: 90000 });   // 47-k9: serialize through renderQueue — concurrent .j bakes pm2-killed the box (2026-10-20 03:11Z)
    cachePut(_renderCache, k, out);
    return out;
}

// ═══════════════════════════════════════════════════════════════════════════
//  STRUCTURE CLOSE-UP (owner 2026-10-20: ".j base <index> … zoomed in … wire
//  it all up") — ONE structure, big: the SAME seeded world as the base map,
//  camera tight on the structure's centroid, static overlay plate at the
//  bottom. Overlay content is derived from (type, level) ONLY so the bake
//  cache stays hot for the whole base — per-user numbers (energy, hunt
//  counters, guild stats) go in the command caption, not the art.
// ═══════════════════════════════════════════════════════════════════════════
const STRUCT_ZOOM = { 2: 2.35, 3: 1.55 };            // final scale by footprint width (map scale is 0.44)
const STRUCT_PANEL = {
    house: { emoji: '🏠', flavor: 'Your hearth and home on the village green.', cta: 'base house — step inside' },
    mines: { emoji: '⛏️', flavor: 'The quarry works day and night — strike the veins.', cta: 'mine — dig for ores' },
    pond: { emoji: '🎣', flavor: 'Still water, fat fish — the boardwalk is ready.', cta: 'base upgrade pond — richer waters' },
    hunting: { emoji: '🏹', flavor: 'Game aplenty beyond the gate — camp is struck.', cta: 'hunt — take the hunt' },
    blacksmith: { emoji: '⚒️', flavor: 'Forge, repair, enhance — the anvil never cools.', cta: 'blacksmith — the anvil' },
    medbay: { emoji: '⚕️', flavor: 'Quiet hands and clean linen mend what claws break.', cta: 'clinic — get healed' },
    alchemy: { emoji: '⚗️', flavor: 'Bubbles, powders, recipes best not asked about.', cta: 'brew — the cauldron' },
    market: { emoji: '🏪', flavor: 'Stalls, scales and honest(ish) prices.', cta: 'shop — browse the wares' },
    barracks: { emoji: '🛡️', flavor: 'Your summons muster here, ready to march.', cta: 'summons — open the roster' },
};

function drawStructurePlate(ctx, W, H, def, lv, team, k) {
    const meta = STRUCT_PANEL[def.id] || { emoji: '🏗️', flavor: def.name, cta: 'base info — the ledger' };
    const Hh = 168, x0 = 30, y0 = H - Hh - 26, Wp = W - 60;
    ctx.save();
    ctx.fillStyle = 'rgba(24,17,10,0.9)'; K.roundRect(ctx, x0, y0, Wp, Hh, 14); ctx.fill();
    ctx.strokeStyle = '#a67c2e'; ctx.lineWidth = 2.5; K.roundRect(ctx, x0 + 4, y0 + 4, Wp - 8, Hh - 8, 10); ctx.stroke();
    ctx.strokeStyle = 'rgba(166,124,46,0.35)'; ctx.lineWidth = 1; K.roundRect(ctx, x0 + 9, y0 + 9, Wp - 18, Hh - 18, 8); ctx.stroke();
    ctx.textBaseline = 'middle';
    // title row: emoji + NAME — level form (Lv.N)
    ctx.textAlign = 'left';
    ctx.font = '34px "Cinzel Deco", Cinzel'; ctx.fillStyle = '#ecd9a6';
    ctx.fillText(`${meta.emoji} ${def.name}`, x0 + 26, y0 + 40);
    ctx.font = '19px Cinzel'; ctx.fillStyle = '#c9a65a';
    ctx.fillText(`${lv.name} · Lv.${lv.level}`, x0 + 26, y0 + 74);
    // level pips (right)
    const maxLv = def.levels.length;
    for (let i = 0; i < maxLv; i++) {
        const px = x0 + Wp - 40 - (maxLv - 1 - i) * 30;
        ctx.beginPath(); ctx.arc(px, y0 + 40, 9, 0, Math.PI * 2);
        ctx.fillStyle = i < lv.level ? '#e0b45c' : 'rgba(232,213,163,0.18)'; ctx.fill();
        ctx.strokeStyle = '#a67c2e'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    // flavor + CTA
    ctx.font = '20px Medieval'; ctx.fillStyle = '#cbb98a';
    ctx.fillText(meta.flavor, x0 + 26, y0 + 108);
    ctx.font = '19px Medieval'; ctx.fillStyle = '#e6c87a';
    ctx.fillText(`▸ ${meta.cta}`, x0 + 26, y0 + 138);
    ctx.restore();
}

async function renderStructureCard(state, opts = {}) {
    const type = String(opts.type || '');
    const def = structDef(type);
    if (!def) throw new Error(`unknown structure type: ${type}`);
    const k = hashStr(JSON.stringify(['basestruct-v2', state.owner, state.structures, state.freePlots, realmBiome(state), type, opts.index]));
    const hit = _renderCache.get(k);
    if (hit && (Date.now() - hit.ts) < CACHE_TTL) return hit;
    const out = await mediaCache.cached('basecard', k, async () => {
        // the SAME seeded world the map draws — the close-up matches the map 1:1
        const world = buildWorld(state, null);
        const w = world.w;
        let entry = Number.isInteger(opts.index) ? world.info.find((it) => it.st === (state.structures || [])[opts.index]) : null;
        if (!entry) entry = world.info.find((it) => it.st.type === type);
        if (!entry) throw new Error(`structure ${type} not present in this base`);
        const lv = entry.def.levels.find((l) => l.level === entry.lvl) || entry.def.levels[0];
        // camera: tight on the centroid; the pond pulls focus toward its pier
        const zoom = STRUCT_ZOOM[entry.def.fw] || 1.55;
        const focusDx = type === 'pond' ? 1.4 : 0;
        const focusDz = type === 'hunting' ? -1.6 : 0.5;   // hunting: pull north so the woods + camp share the frame
        w.scale = zoom;
        w.layoutFixed(CARD_W, CARD_H, entry.cen.x + focusDx, entry.cen.z + focusDz, CARD_W / 2, CARD_H * 0.46);
        const seed = hashStr(state.owner || 'base');
        const bi = (K.biomeInfo('iso').biomes || {})[world.realm];
        const bd = world.realm === 'isle' ? { top: '#cfe8ef', mid: '#8fc7b2', bot: '#3f7a5c' } : bi ? { top: bi.backdrop[0], mid: bi.backdrop[1], bot: bi.backdrop[2] } : { top: '#356f6a', mid: '#1f4a4c', bot: '#0d2527' };
        const { createCanvas } = require('canvas');
        const terrain = createCanvas(CARD_W, CARD_H), tctx = terrain.getContext('2d');
        await w.draw(tctx, { phase: 'terrain', drawBackdrop: (c2) => { const g = c2.createLinearGradient(0, 0, 0, CARD_H); g.addColorStop(0, bd.top); g.addColorStop(0.5, bd.mid); g.addColorStop(1, bd.bot); c2.fillStyle = g; c2.fillRect(0, 0, CARD_W, CARD_H); } });
        const objects = createCanvas(CARD_W, CARD_H), octx = objects.getContext('2d');
        await w.draw(octx, { phase: 'objects' });
        tctx.drawImage(objects, 0, 0);
        drawStructurePlate(tctx, CARD_W, CARD_H, entry.def, lv, world.team, zoom);
        return encodeOut(terrain);
    }, { state, opts: { type, index: opts.index } }, { label: 'bake:base', timeoutMs: 90000 });
    cachePut(_renderCache, k, out);
    return out;
}

module.exports = { LAYOUT, N, FRAMES, renderFrame, renderBaseImage, renderStructureCard, encodeFramesToMp4, structDef, structures, buildWorld }; // buildWorld: QA hook (pond-variety probe, 2026-10-20)
