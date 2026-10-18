'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  KINGDOM TERRAIN — seeded per-guild map generator for the 3D hex kingdom
//
//  Five biomes: `isle` (the original ocean island — the ONLY one with a sea) and four
//  land biomes (`desert`, `tundra`, `highlands`, `volcanic`).  The land biomes reuse the
//  same KayKit sprites recoloured by scripts/kingdom3d/recolor_biomes.py.
//
//  Two phases so the renderer can lay walls/roads/buildings in between:
//    shape(w, o)      silhouette (ragged edge → `void`, no sea), lakes/lava pools, one river
//    populate(S, w, o) noise-driven wilds: forest, hills, mountains, dunes, rocks, fields,
//                      mine / mill / camps / ruins / watch-tower
//  Everything is a pure function of (guild name seed, biome): same guild → same land,
//  different guild → different land.
// ═══════════════════════════════════════════════════════════════════════════
const K = require('./kingdom3d');

const BIOMES = ['isle', 'desert', 'tundra', 'highlands', 'volcanic'];
const LABELS = { isle: 'Coastal realm', desert: 'Sun-scorched dunes', tundra: 'Frozen tundra', highlands: 'Autumn highlands', volcanic: 'Ashen volcanic wastes' };

function pickBiome(state) {
    if (state && state.biome && BIOMES.includes(state.biome)) return state.biome;
    return BIOMES[K.hashStr('biome:' + String((state && state.name) || 'guild')) % BIOMES.length];
}

// ── smooth value noise (deterministic from seed) ─────────────────────────────
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
function fbm(seed, x, y) { return (vnoise(seed, x, y) * 0.55 + vnoise(seed + 71, x * 2.1, y * 2.1) * 0.3 + vnoise(seed + 133, x * 4.3, y * 4.3) * 0.15); }

// ── per-biome tuning ─────────────────────────────────────────────────────────
const P = {
    isle: {   // 'isle' key kept for compatibility: now a COASTAL realm — sea on one side only
        river: true, lakes: 1, lakeBig: 0, rim: 0.30, coastal: true,
        mountainE: 0.76, mountains: ['mountain_A_grass_trees', 'mountain_B_grass_trees', 'mountain_C_grass_trees', 'mountain_A_grass'],
        hillE: 0.52, hillP: 0.8, hills: ['hills_A_trees', 'hills_B_trees', 'hills_C_trees', 'hills_A'],
        forestM: 0.46, forestP: 0.75, trees: ['trees_A_large', 'trees_B_large', 'trees_A_medium', 'trees_B_medium'], treeM: ['trees_A_small', 'trees_B_small', 'tree_single_A', 'tree_single_B'],
        oasisTrees: false, rockP: 0.06, fields: true, camps: 1, ruins: 1, mill: true, lumber: true,
    },
    desert: {
        river: false, lakes: 1, lakeBig: 0, rim: 0.30,
        mountainE: 0.70, mountains: ['mountain_A', 'mountain_B', 'mountain_C'],
        hillE: 0.40, hillP: 0.85, hills: ['hills_A', 'hills_B', 'hills_C', 'hill_single_A', 'hill_single_B'],
        forestM: 9, forestP: 0, trees: [], treeM: ['trees_A_small', 'trees_B_small', 'tree_single_A', 'tree_single_B'],
        oasisTrees: true, rockP: 0.10, fields: false, camps: 2, ruins: 2, mill: false, lumber: false,
    },
    tundra: {
        river: true, lakes: 2, lakeBig: 1, rim: 0.28,
        mountainE: 0.70, mountains: ['mountain_A_grass', 'mountain_B_grass', 'mountain_C_grass', 'mountain_A', 'mountain_B'],
        hillE: 0.43, hillP: 0.8, hills: ['hills_A', 'hills_B', 'hills_C', 'hill_single_A', 'hill_single_B'],
        forestM: 0.50, forestP: 0.72, trees: ['trees_A_large', 'trees_B_large', 'trees_A_medium', 'trees_B_medium'], treeM: ['trees_A_small', 'trees_B_small'],
        oasisTrees: false, rockP: 0.09, fields: false, camps: 2, ruins: 1, mill: true, lumber: true,
    },
    highlands: {
        river: true, lakes: 2, lakeBig: 1, rim: 0.30,
        mountainE: 0.76, mountains: ['mountain_A_grass_trees', 'mountain_B_grass_trees', 'mountain_C_grass_trees', 'mountain_A_grass', 'mountain_B_grass'],
        hillE: 0.48, hillP: 0.8, hills: ['hills_A_trees', 'hills_B_trees', 'hills_C_trees', 'hills_A', 'hills_B'],
        forestM: 0.48, forestP: 0.75, trees: ['trees_A_large', 'trees_B_large', 'trees_A_medium', 'trees_B_medium'], treeM: ['trees_A_small', 'trees_B_small', 'tree_single_A', 'tree_single_B'],
        oasisTrees: false, rockP: 0.06, fields: true, camps: 1, ruins: 1, mill: true, lumber: true,
    },
    volcanic: {
        river: true, lakes: 2, lakeBig: 0, rim: 0.34,
        mountainE: 0.60, mountains: ['mountain_A', 'mountain_B', 'mountain_C', 'mountain_A', 'mountain_B'],
        hillE: 0.44, hillP: 0.85, hills: ['hills_A', 'hills_B', 'hills_C', 'hill_single_C'],
        forestM: 0.62, forestP: 0.35, trees: ['tree_single_A', 'tree_single_B', 'trees_A_small', 'trees_B_small'], treeM: ['tree_single_A_cut', 'tree_single_B_cut'],
        oasisTrees: false, rockP: 0.17, fields: false, camps: 2, ruins: 3, mill: false, lumber: false,
    },
};

/** Phase 1 — silhouette, lakes, river.  o: {seed, biome, CC, CR, keepR, wallRing, angleDeg, cdist} */
function shape(w, o) {
    const { seed, biome, CC, CR } = o;
    const par = P[biome];
    const rng = K.mulberry32(seed ^ 0x9e3779b9);
    const E = (c, r) => { const p = K.hexWorld(c, r); return fbm(seed + 11, p.x * 0.21, p.z * 0.21); };
    const M = (c, r) => { const p = K.hexWorld(c, r); return fbm(seed + 97, p.x * 0.19 + 40, p.z * 0.19 - 20); };

    // ragged silhouette: bigger than the island, NO sea — the edge fades into the biome haze
    const p1 = rng() * 6.28, p2 = rng() * 6.28, p3 = rng() * 6.28;
    const radius = (deg) => { const t = deg * Math.PI / 180; return 7.5 + 0.7 * Math.sin(3 * t + p1) + 0.5 * Math.sin(5 * t + p2) + 0.35 * Math.sin(2 * t + p3); };
    const R = (c, r) => radius(o.angleDeg(c, r));
    // coastal realm: the sea lies beyond a wavy shoreline on ONE side (seeded direction)
    const seaDeg = par.coastal ? [0, 45, 90, 135, 180, 225, 315][Math.floor(rng() * 7)] : null;
    const sdx = par.coastal ? Math.cos(seaDeg * Math.PI / 180) : 0, sdz = par.coastal ? Math.sin(seaDeg * Math.PI / 180) : 0;
    const coastT = (c, r) => { const p = K.hexWorld(c, r), q = K.hexWorld(CC, CR); const lat = ((p.x - q.x) * -sdz + (p.z - q.z) * sdx) / 2; return 5.7 + 0.9 * Math.sin(lat * 0.8 + p2) + 0.5 * Math.sin(lat * 1.7 + p3); };
    const along = (c, r) => { const p = K.hexWorld(c, r), q = K.hexWorld(CC, CR); return ((p.x - q.x) * sdx + (p.z - q.z) * sdz) / 2; };
    const isSea = (c, r) => par.coastal && along(c, r) > coastT(c, r);
    for (let r = 0; r < w.rows; r++) for (let c = 0; c < w.cols; c++) {
        const k = w.cell[r][c];
        k.water = false;
        k.void = o.cdist(c, r) > R(c, r) + (par.coastal && isSea(c, r) ? 1.6 : 0);
        if (isSea(c, r)) { k.water = true; k.sea = true; }
        if (o.cdist(c, r) <= o.keepR) { k.keepLand = true; k.water = false; k.sea = false; k.void = false; }
    }
    const edgeGap = (c, r) => R(c, r) - o.cdist(c, r);         // >0 inside the silhouette

    // lakes / oasis / lava pools: wettest inland spots, well away from the keep and the rim
    const lakeCells = [], centres = [];
    const cand = [];
    for (let r = 1; r < w.rows - 1; r++) for (let c = 1; c < w.cols - 1; c++) {
        const d = o.cdist(c, r);
        if (d < 6 || edgeGap(c, r) < 2.2 || w.cell[r][c].void || w.cell[r][c].water || (par.coastal && along(c, r) > coastT(c, r) - 2)) continue;
        cand.push({ c, r, s: M(c, r) + rng() * 0.45 });
    }
    cand.sort((a, b) => b.s - a.s);
    let big = par.lakeBig;
    for (const q of cand) {
        if (centres.length >= par.lakes) break;
        if (centres.some(([c, r]) => K.hexDist(c, r, q.c, q.r) < 5)) continue;
        centres.push([q.c, q.r]);
        const blob = [[q.c, q.r]];
        for (let d = 0; d < 6; d++) { const n = K.neighbor(q.c, q.r, d); if (rng() < 0.85) blob.push(n); }
        if (big > 0 && rng() < 0.6) { big--; for (const [c, r] of K.ring(q.c, q.r, 2)) if (rng() < 0.45) blob.push([c, r]); }
        for (const [c, r] of blob) if (w.inb(c, r) && !w.cell[r][c].keepLand && !w.cell[r][c].void && edgeGap(c, r) > 1.2) { w.cell[r][c].water = true; lakeCells.push([c, r]); }
    }

    // one river (lava river in the volcanic biome, frozen in the tundra) hugging ring 6;
    // 60% of guilds get it across the south road so the road needs a bridge
    const riverCells = [];
    if (par.river) {
        const south = rng() < 0.6;
        let a0 = south ? 15 + rng() * 70 : 105 + rng() * 240;
        if (par.coastal) a0 = ((seaDeg - 50 + (rng() - 0.5) * 60) + 720) % 360;     // flows to the sea
        const span = 85 + rng() * 40;
        const arc = K.ring(CC, CR, 6).filter(([c, r]) => w.inb(c, r) && ((o.angleDeg(c, r) - a0 + 360) % 360) <= span);
        const take = (c, r) => {
            const k = w.at(c, r);
            if (!k || k.void || k.water || k.keepLand) return false;
            k.river = true; riverCells.push([c, r]); return true;
        };
        for (const [c, r] of arc) take(c, r);
        // run both ends outward to the rim along the radial line
        const out = (cell) => {
            const wc = K.hexWorld(cell[0], cell[1]), wo = K.hexWorld(CC, CR);
            const to = [Math.round((wo.x + (wc.x - wo.x) * 3) / 2), Math.round((wo.z + (wc.z - wo.z) * 3) / K.SQ3)];
            for (const [c, r] of K.hexLine(cell[0], cell[1], to[0], to[1]).slice(1)) { if (!w.inb(c, r) || !take(c, r)) break; }
        };
        if (arc.length) { out(arc[0]); out(arc[arc.length - 1]); }
    }
    return { E, M, R, edgeGap, lakeCells, riverCells, par, biome, rng, seed, seaDeg };
}

/** Phase 2 — fill the wilds.  o: {used, claim, B, team, key, cdist, wallRing, TREE_FALLBACK} */
function populate(S, w, o) {
    const { E, M, edgeGap, par, biome } = S;
    const rng = K.mulberry32(S.seed ^ 0x7f4a7c15);
    const pickOf = (a) => a[Math.floor(rng() * a.length)];
    const lakeNear = (c, r, n) => S.lakeCells.some(([a, b]) => K.hexDist(a, b, c, r) <= n);
    const outer = [];
    for (let r = 0; r < w.rows; r++) for (let c = 0; c < w.cols; c++) {
        const k = w.cell[r][c];
        if (k.void || k.water || k.river || k.coast || o.used.has(o.key(c, r)) || o.cdist(c, r) <= o.wallRing) continue;
        outer.push([c, r]);
    }
    const stats = { mountain: [], hill: [], forest: [], field: [], free: [] };
    let fields = 0, windmill = null, farmHome = false;
    for (const [c, r] of outer) {
        const d = o.cdist(c, r), gap = edgeGap(c, r);
        const rim = gap < 1.8 ? par.rim * (1.8 - gap) / 1.8 : 0;                // frame the diorama with ridges
        const e = Math.min(1, E(c, r) + rim + (d >= 6 ? 0.04 : -0.12)), m = M(c, r), x = rng();
        if (e > par.mountainE && d >= 6) {
            w.put(pickOf(par.mountains), c, r); o.claim(c, r); stats.mountain.push([c, r]);
        } else if (e > par.hillE && d >= 5 && x < par.hillP) {
            w.put(pickOf(par.hills), c, r); o.claim(c, r); stats.hill.push([c, r]);
        } else if (par.oasisTrees && lakeNear(c, r, 2) && x < 0.7) {
            w.put(pickOf(par.treeM), c, r, { flip: rng() < 0.5 }); o.claim(c, r); stats.forest.push([c, r]);
        } else if (par.forestP && m > par.forestM && x < par.forestP && d >= 5) {
            w.put(pickOf(par.trees), c, r, { flip: rng() < 0.5 }); o.claim(c, r); stats.forest.push([c, r]);
        } else if (par.fields && fields < 5 && d <= 7 && e < 0.5 && m > 0.3 && x < 0.5) {
            w.put('building_grain', c, r, { layer: 'flat' }); o.claim(c, r); fields++; stats.field.push([c, r]);
        } else if (par.fields && !windmill && d <= 7 && e < 0.5 && x < 0.62) {
            windmill = [c, r]; w.put(o.B('windmill'), c, r); o.claim(c, r);
        } else if (par.fields && !farmHome && d <= 7 && e < 0.5 && x < 0.75) {
            farmHome = true; w.put(o.B('home_A'), c, r, { flip: true }); o.claim(c, r);
        } else if (x < par.rockP) {
            w.put('rock_single_' + 'ABCDE'[Math.floor(rng() * 5)], c, r, { dx: (rng() - 0.5) * 0.8, dz: (rng() - 0.5) * 0.6 });
        } else if (x < par.rockP + 0.10 && par.treeM.length && !par.oasisTrees) {
            w.put(pickOf(par.treeM), c, r, { flip: rng() < 0.5 }); o.claim(c, r);
        } else { stats.free.push([c, r]); }
    }
    const free = (pred) => { for (const [c, r] of outer) if (!o.used.has(o.key(c, r)) && !w.cell[r][c].void && pred(c, r)) return [c, r]; return null; };
    const freeNear = (c, r, maxD) => [0, 1, 2, 3, 4, 5].map((dd) => K.neighbor(c, r, dd)).filter(([a, b]) => w.inb(a, b) && !o.used.has(o.key(a, b)) && !w.cell[b][a].water && !w.cell[b][a].river && !w.cell[b][a].void && o.cdist(a, b) <= maxD);
    const placed = {};

    // mine at the foot of the nearest mountain (or hill)
    const ridge = (stats.mountain.length ? stats.mountain : stats.hill).slice().sort((a, b) => o.cdist(a[0], a[1]) - o.cdist(b[0], b[1]));
    for (const [c, r] of ridge) { const f = freeNear(c, r, 9)[0]; if (f) { w.put(o.B('mine'), f[0], f[1]); o.claim(f[0], f[1]); placed.mine = f; break; } }
    // lumber mill beside a forest
    if (par.lumber && stats.forest.length) for (const [c, r] of stats.forest) { const f = freeNear(c, r, 7)[0]; if (f) { w.put(o.B('lumbermill'), f[0], f[1]); o.claim(f[0], f[1]); placed.lumber = f; break; } }
    // watermill on the river
    if (par.mill && S.riverCells.length) { for (const [c, r] of S.riverCells) { const f = freeNear(c, r, 9)[0]; if (f) { w.put(o.B('watermill'), f[0], f[1]); o.claim(f[0], f[1]); placed.mill = f; break; } } }
    // war camps (tent + weapon rack + barrel), ruins, one watch-tower on the highest hill
    for (let i = 0; i < par.camps; i++) {
        const f = free((c, r) => o.cdist(c, r) >= 5 && o.cdist(c, r) <= 7 && !w.cell[r][c].keepLand);
        if (!f) break; w.put('tent', f[0], f[1], { dx: -0.3 }); w.put('weaponrack', f[0], f[1], { dx: 0.4, dz: 0.4 }); w.put('barrel', f[0], f[1], { dx: 0.5, dz: -0.3 }); o.claim(f[0], f[1]);
    }
    for (let i = 0; i < par.ruins; i++) {
        const f = free((c, r) => o.cdist(c, r) >= 6 && edgeGap(c, r) > 1);
        if (!f) break; w.put('building_destroyed', f[0], f[1], { flip: rng() < 0.5 }); o.claim(f[0], f[1]);
    }
    if (stats.hill.length) {
        const [c, r] = stats.hill.slice().sort((a, b) => E(b[0], b[1]) - E(a[0], a[1]))[0];
        const f = freeNear(c, r, 9)[0];
        if (f) { w.put(o.B('tower_B'), f[0], f[1], { sc: 0.9 }); o.claim(f[0], f[1]); placed.tower = f; }
    }
    if (par.coastal) {
        const shore = [];
        for (let r = 0; r < w.rows; r++) for (let c = 0; c < w.cols; c++) { const k = w.cell[r][c]; if (k.coast && !o.used.has(o.key(c, r)) && !k.river && !k.void) shore.push([c, r]); }
        const ang = (c, r) => o.angleDeg(c, r);
        shore.sort((a, b) => Math.abs(((ang(a[0], a[1]) - S.seaDeg + 540) % 360) - 180) - Math.abs(((ang(b[0], b[1]) - S.seaDeg + 540) % 360) - 180));
        if (shore.length) { const [c, r] = shore[Math.floor(rng() * Math.min(5, shore.length))]; w.put(o.B('tower_B'), c, r, { sc: 0.9 }); o.claim(c, r); placed.lighthouse = [c, r]; }
        const pool = shore.filter(([c, r]) => !o.used.has(o.key(c, r)));
        for (const [c, r] of pool.filter((_, i) => i % 3 === 0).slice(0, 3)) { w.put(o.B('home_A'), c, r, { flip: rng() < 0.5, sc: 0.9 }); o.claim(c, r); }
    }
    return { stats, placed };
}

module.exports = { BIOMES, LABELS, pickBiome, shape, populate, fbm, vnoise };
