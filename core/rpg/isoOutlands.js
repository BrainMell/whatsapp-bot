'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// ISO OUTLANDS — the procedural world beyond the fence (owner 2026-10-17
// "the world outside the fence should be procedurally generated and should
// stick to that for that player ... use rocks and mountain assets that fit,
// maybe some will have a small part that connects to an ocean on screen").
//
// LAW: one player seed → one permanent world. seed = owner jid (base) or
// guild name (guild grounds). The roll picks a BIOME; every placement and
// tile is derived from mulberry32(seed ^ cell salts) so the same player
// always sees the same outlands on every render, forever.
//
// BIOMES:
//   forest     (38%) — deep mossy woodland, dense tree wall outside the
//                      fence, conifer clusters, mossy clutter
//   highlands  (24%) — rocky highlands: monoliths, basalt clusters, shard
//                      spires and pylons in 2-4 clusters, thin tree cover
//   ruins      (18%) — an ancient mossy ruin site: arch, gate, columns,
//                      ivy tower, slabs, overgrown roots
//   coast      (20%) — the compound sits on a headland: ocean starts past
//                      the fence on the south-east edge, shoreline rocks
//                      and a stony spring mark the waterline
//
// PURE MODULE — no canvas. Returns art-space placements; the renderers draw.
// ═══════════════════════════════════════════════════════════════════════════

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

// sprite pools (polyy mossy forest clutter + pixel set, homestead dir)
const POOLS = {
    forestTrees: ['px_pine_a.png', 'px_pine_b.png', 'px_pine_c.png', 'px_oak_a.png', 'px_oak_b.png', 'px_conifer_a.png', 'px_conifer_b.png', 'px_birch.png'],
    forestClutter: ['poly_mushrooms.png', 'poly_grassy_log.png', 'poly_fairy_stump.png', 'poly_gnarled_roots.png', 'poly_root_ball.png', 'poly_fallen_tree.png', 'px_fern.png', 'px_tuft.png'],
    highRocks: ['poly_rock_monolith.png', 'poly_basalt.png', 'poly_rock_spire.png', 'poly_rock_pylon.png', 'poly_crystal_rocks.png'],
    highClutter: ['poly_ancient_slab.png', 'poly_stream_rocks.png', 'px_rock.png', 'px_boulder.png', 'px_tuft.png'],
    ruinsProps: ['poly_ruin_arch.png', 'poly_ruin_gate.png', 'poly_ruin_column.png', 'poly_ivy_tower.png', 'poly_ancient_slab.png', 'poly_ancient_well.png'],
    ruinsClutter: ['poly_ruin_clutter.png', 'poly_gnarled_roots.png', 'poly_mushrooms.png', 'poly_fairy_stump.png', 'px_fern.png'],
    shoreProps: ['poly_water_rock.png', 'poly_stream_rocks.png', 'poly_rocky_spring.png', 'px_rock.png'],
    yardProps: ['px_tuft.png', 'px_fern.png', 'px_shroom.png', 'poly_grassy_log.png'],
};

const TINT_NEAR = '#31491d';   // just outside the fence
const TINT_MID = '#2a3f18';
const TINT_FAR = '#223314';    // deep wilds
const TINT_SHORE = '#2e4020';

function pickWeighted(rnd, pool) {
    let tot = 0;
    for (const [, w] of pool) tot += w;
    let r = rnd() * tot;
    for (const [f, w] of pool) { r -= w; if (r <= 0) return f; }
    return pool[0][0];
}

// ═══════════════════════════════════════════════════════════════════════════
// biomeOf — stable per-seed biome roll
// ═══════════════════════════════════════════════════════════════════════════
function biomeOf(seedStr) {
    const r = mulberry32(hashStr(String(seedStr) + '::biome'))();
    if (r < 0.38) return 'forest';
    if (r < 0.62) return 'highlands';
    if (r < 0.80) return 'ruins';
    return 'coast';
}

// ═══════════════════════════════════════════════════════════════════════════
// outlandProps — placements for everything OUTSIDE the fence diamond.
//   opts: { seedStr, N, P, isoX, isoY, M }
//   returns { biome, tiles: [{x, y, tile}], props: [{ file, x, y, sc, tint }] }
//   tiles: terrain overrides for wild cells (x,y in grid space, may be water)
//   props: art-space sprites, bottom-anchored, depth = y
// ═══════════════════════════════════════════════════════════════════════════
function outlandProps(opts) {
    const { seedStr, N, P, isoX, isoY, M, OX: OX_ = 620, OY: OY_ = 150, TW: TW_ = 64, TH: TH_ = 32 } = opts;
    const biome = biomeOf(seedStr);
    const seed = hashStr(String(seedStr) + '::outlands');
    const tiles = [];
    const props = [];

    // grid bounds of the wild ring
    const lo = -(P + M), hi = (N - 1 + P) + M;
    // fence diamond bounds (grid space): [-P .. N-1+P]
    const f0 = -P, f1 = N - 1 + P;

    // SCREEN-ANCHOR SCALE LAW (guild v5 big canvas): every screen anchor
    // below was tuned on the 1240x850 reference card (OX 620 / OY 150);
    // scale them proportionally for bigger canvases. 1:1 for the homestead.
    const AX = OX_ / 620, AY = OY_ / 150;
    const sa = ([x, y]) => [x * AX, y * AY];
    const DEEP_CY = OY_ + 280 * AY;   // ruins deep-site screen centre (430 @ ref)


    // screen→grid helper: place set pieces by SCREEN position so they always
    // land on-card (grid-space offsets run off the diamond diagonals)
    function screenToGrid(sx, sy) {
        const a = (sx - OX_) / (TW_ / 2);       // x - y
        const b = (sy - OY_) / (TH_ / 2);       // x + y
        return [(b + a) / 2, (b - a) / 2];
    }

    // wild-cell classifier
    // coast law: ocean fills the wild band on the SOUTH-EAST edge (y > f1)
    // beyond a shore row; the shore runs the full width of the SE fence edge
    const shoreRow = f1 + 1;          // first wild row south-east of fence
    const isOceanCell = (x, y) => biome === 'coast' && y > shoreRow + oceanDepth(x, y, seed);
    function oceanDepth(x, y, sd) {
        // irregular shore: 0-2 rows of land then water, wobbling with x
        const r = mulberry32(sd + x * 7349)();
        return r < 0.42 ? 0 : (r < 0.78 ? 1 : 2);
    }

    // ── 1. terrain tiles ──
    for (let x = lo; x <= hi; x++) {
        for (let y = lo; y <= hi; y++) {
            const insideFence = x >= f0 && x <= f1 && y >= f0 && y <= f1;
            if (insideFence) continue;      // yard + playable handled by renderer
            if (isOceanCell(x, y)) { tiles.push({ x, y, tile: 'water' }); continue; }
            // wild ground: moss with rock/shroom flecks; coast land side is
            // sandy-gritty (rock tile flecks read as shingle)
            const r = mulberry32(seed + (x + 80) * 131 + (y + 80) * 17)();
            let tile;
            if (biome === 'highlands') tile = r < 0.20 ? 'forest_rock_tile.png' : (r < 0.26 ? 'forest_moss_shrooms.png' : 'grass');
            else if (biome === 'coast') tile = r < 0.12 ? 'forest_rock_tile.png' : (r < 0.17 ? 'forest_moss_shrooms.png' : 'grass');
            else tile = r < 0.05 ? 'forest_rock_tile.png' : (r < 0.10 ? 'forest_moss_shrooms.png' : 'grass');
            if (tile !== 'grass') tiles.push({ x, y, tile });
        }
    }

    // ── 2. gate trail — the walk out the gate fades into the wild ──
    // (renderer knows its gate; we draw a few trail tiles heading outward)
    // handled by renderer (path stub), not here.

    // ── 3. biome set pieces ──
    const put = (file, gx, gy, sc, tint, jx = 30, jy = 12) => {
        const rnd = mulberry32(seed + Math.round(gx * 1000 + gy) + file.length);
        const px = isoX(gx + 0.5, gy + 0.5) + (rnd() - 0.5) * jx;
        const py = isoY(gx + 0.5, gy + 0.5) + (rnd() - 0.5) * jy + 6;
        props.push({ file, x: px, y: py, sc, tint });
    };

    // cluster helper: n pieces around a centre, sc tapering outward
    function cluster(rnd, pool, cx, cy, n, baseSc, tint, spread) {
        for (let i = 0; i < n; i++) {
            const a = rnd() * Math.PI * 2;
            const d = (i === 0) ? 0 : (0.6 + rnd() * 1.5) * spread;
            const gx = cx + Math.cos(a) * d;
            const gy = cy + Math.sin(a) * d * 0.7;
            const sc = baseSc * (i === 0 ? 1 : (0.62 + rnd() * 0.3));
            put(pickWeighted(rnd, pool), gx, gy, sc, tint, 26, 10);
        }
    }

    const master = mulberry32(seed ^ 0x51ab3e);

    if (biome === 'forest') {
        // dense tree wall hugging the fence outside (2 staggered rows)
        for (let x = f0 - 2; x <= f1 + 2; x++) {
            for (const y of [f0 - 1, f0 - 2, f1 + 1, f1 + 2]) {
                if (isOceanCell(x, y)) continue;
                const r = mulberry32(seed + x * 313 + y * 977)();
                if (r < 0.5) put(pickWeighted(master, POOLS.forestTrees.map((f) => [f, 1])), x + (r - 0.5), y + (r * 0.4 - 0.2), 0.5 + r * 0.24, TINT_NEAR, 40, 14);
            }
        }
        for (let y = f0 - 2; y <= f1 + 2; y++) {
            for (const x of [f0 - 1, f0 - 2, f1 + 1, f1 + 2]) {
                if (isOceanCell(x, y)) continue;
                const r = mulberry32(seed + x * 7717 + y * 313)();
                if (r < 0.5) put(pickWeighted(master, POOLS.forestTrees.map((f) => [f, 1])), x + (r * 0.4 - 0.2), y + (r - 0.5), 0.5 + r * 0.24, TINT_NEAR, 40, 14);
            }
        }
        // deep wilds: conifer clusters + mossy clutter, at SCREEN anchors
        const wildAnchors = [[110, 180], [1110, 225], [170, 635], [1060, 600], [590, 66], [650, 792], [340, 105], [920, 772]].map(sa);
        for (let i = 0; i < 5; i++) {
            const [sx, sy] = wildAnchors[Math.floor(master() * wildAnchors.length)];
            const [gx, gy] = screenToGrid(sx + (master() - 0.5) * 120, sy + (master() - 0.5) * 50);
            cluster(master, POOLS.forestTrees.map((f) => [f, 1]), gx, gy, 2 + Math.floor(master() * 3), 0.5 + master() * 0.16, TINT_MID, 1.4);
        }
        for (let i = 0; i < 18; i++) {
            const [sx, sy] = wildAnchors[Math.floor(master() * wildAnchors.length)];
            const [gx, gy] = screenToGrid(sx + (master() - 0.5) * 260, sy + (master() - 0.5) * 110);
            put(pickWeighted(master, POOLS.forestClutter.map((f) => [f, 1])), gx, gy, 0.7 + master() * 0.3, TINT_MID, 34, 12);
        }
    }

    if (biome === 'highlands') {
        // 3-5 rock/mountain clusters ringing the compound at SCREEN anchors
        const rockAnchors = [[110, 185], [1110, 240], [175, 645], [1035, 610], [620, 62], [620, 795]].map(sa);
        const nClusters = 3 + Math.floor(master() * 3);
        const order = rockAnchors.slice().sort(() => master() - 0.5);
        for (let i = 0; i < nClusters; i++) {
            const [sx, sy] = order[i % order.length];
            const [gx, gy] = screenToGrid(sx + (master() - 0.5) * 90, sy + (master() - 0.5) * 40);
            cluster(master, POOLS.highRocks.map((f) => [f, 1]), gx, gy, 3 + Math.floor(master() * 3), 0.95 + master() * 0.2, TINT_MID, 1.5);
        }
        // scree fields + sparse wind-stunted trees between clusters
        for (let i = 0; i < 16; i++) {
            const [sx, sy] = rockAnchors[Math.floor(master() * rockAnchors.length)];
            const [gx, gy] = screenToGrid(sx + (master() - 0.5) * 300, sy + (master() - 0.5) * 120);
            if (master() < 0.7) put(pickWeighted(master, POOLS.highClutter.map((f) => [f, 1])), gx, gy, 0.75 + master() * 0.35, TINT_MID, 30, 12);
            else put(pickWeighted(master, POOLS.forestTrees.map((f) => [f, 1])), gx, gy, 0.5 + master() * 0.18, TINT_MID, 30, 12);
        }
    }

    if (biome === 'ruins') {
        // main ruin site in a near wild band (always on card), any second
        // site pushed deeper along the same direction
        const sites = 1 + Math.floor(master() * 2);
        // [top-right, right-mid, left-mid, bottom-left] wild bands (SCREEN pts)
        const bandPts = [[930, 85], [1120, 380], [90, 330], [330, 700]].map(sa);
        const ci = Math.floor(master() * 4);
        for (let s = 0; s < sites; s++) {
            let cx, cy, deep;
            if (s === 0) { [cx, cy] = screenToGrid(bandPts[ci][0], bandPts[ci][1]); deep = false; }
            else { [cx, cy] = screenToGrid(OX_ + (bandPts[ci][0] - OX_) * 1.35, DEEP_CY + (bandPts[ci][1] - DEEP_CY) * 1.35); deep = true; }
            // centerpiece: gate or tower
            put(master() < 0.5 ? 'poly_ivy_tower.png' : 'poly_ruin_gate.png', cx, cy, deep ? 0.9 : 1.05, deep ? TINT_FAR : TINT_MID, 10, 6);
            // flanking columns + arch + slabs
            cluster(master, POOLS.ruinsProps.map((f) => [f, 1]), cx + 1.2, cy + 0.6, 3 + Math.floor(master() * 2), deep ? 0.7 : 0.85, deep ? TINT_FAR : TINT_MID, 1.1);
            cluster(master, POOLS.ruinsClutter.map((f) => [f, 1]), cx - 1.4, cy - 0.8, 4 + Math.floor(master() * 3), deep ? 0.6 : 0.78, deep ? TINT_FAR : TINT_MID, 1.5);
        }
        // tree wall still hugs the fence (mossy woodland around ruins)
        for (let x = f0 - 2; x <= f1 + 2; x++) {
            for (const y of [f0 - 1, f1 + 1]) {
                const r = mulberry32(seed + x * 313 + y * 977)();
                if (r < 0.45) put(pickWeighted(master, POOLS.forestTrees.map((f) => [f, 1])), x + (r - 0.5), y + (r * 0.4 - 0.2), 0.5 + r * 0.22, TINT_NEAR, 40, 14);
            }
        }
        for (let i = 0; i < 14; i++) {
            const cx = master() * (2 * (N + P) + 6) - (N + P) - 3;
            const cy = master() * (2 * (N + P) + 6) - (N + P) - 3;
            if (cx >= f0 && cx <= f1 && cy >= f0 && cy <= f1) continue;
            put(pickWeighted(master, POOLS.forestClutter.map((f) => [f, 1])), cx, cy, 0.7 + master() * 0.3, TINT_MID, 34, 12);
        }
    }

    if (biome === 'coast') {
        // shoreline dressing along the SE waterline
        for (let x = f0 - M; x <= f1 + M; x++) {
            const y = shoreRow + oceanDepth(x, shoreRow, seed);
            if (!isOceanCell(x, y)) continue;
            const r = mulberry32(seed + x * 5501)();
            if (r < 0.55) put(pickWeighted(master, POOLS.shoreProps.map((f) => [f, 1])), x + (r - 0.5), y - 0.4, 0.85 + r * 0.35, TINT_SHORE, 30, 8);
        }
        // headland: sea stacks + rocks standing IN the water near the shore
        for (let i = 0; i < 5; i++) {
            const x = f0 - 2 + Math.floor(master() * (N + 2 * P + 4));
            const y = shoreRow + 1 + Math.floor(master() * 2);
            if (isOceanCell(x, y) && master() < 0.8) put(master() < 0.4 ? 'poly_rock_spire.png' : 'poly_water_rock.png', x, y, 0.9 + master() * 0.3, TINT_SHORE, 20, 6);
        }
        // land side: windswept tree wall + grassy clutter
        for (let x = f0 - 2; x <= f1 + 2; x++) {
            for (const y of [f0 - 1, f0 - 2, f1 + 1]) {
                if (isOceanCell(x, y)) continue;
                const r = mulberry32(seed + x * 313 + y * 977)();
                if (r < 0.45) put(pickWeighted(master, POOLS.forestTrees.map((f) => [f, 1])), x + (r - 0.5), y + (r * 0.4 - 0.2), 0.5 + r * 0.2, TINT_NEAR, 40, 14);
            }
        }
        for (let i = 0; i < 16; i++) {
            const cx = master() * (2 * (N + P) + 6) - (N + P) - 3;
            const cy = master() * (2 * (N + P) + 6) - (N + P) - 3;
            if (cx >= f0 && cx <= f1 && cy >= f0 && cy <= f1) continue;
            if (isOceanCell(Math.round(cx), Math.round(cy))) continue;
            put(pickWeighted(master, POOLS.forestClutter.map((f) => [f, 1])), cx, cy, 0.7 + master() * 0.3, TINT_MID, 34, 12);
        }
    }

    // ── 4. yard dressing (inside fence, outside playable) — tamed meadow ──
    for (let x = f0; x <= f1; x++) {
        for (let y = f0; y <= f1; y++) {
            const playable = x >= 0 && y >= 0 && x < N && y < N;
            if (playable) continue;
            const r = mulberry32(seed + (x + 60) * 197 + (y + 60) * 29)();
            if (r < 0.13) {
                const px = isoX(x + 0.5, y + 0.5) + (r - 0.5) * 30;
                const py = isoY(x + 0.5, y + 0.5) + (r * 0.4 - 0.2) * 20;
                props.push({ file: POOLS.yardProps[Math.floor(r * 97) % POOLS.yardProps.length], x: px, y: py, sc: 0.85 + r * 0.4, tint: null });
            }
        }
    }

    // TINT LAW: only pixel trees/clutter recede via tint; the polyy rock,
    // ruin and clutter sprites keep their natural palette (an 88% wash turns
    // stone into green mush) — depth reads through scale + placement instead.
    for (const pr of props) {
        if (pr.tint && !String(pr.file).startsWith('px_')) pr.tint = null;
    }
    return { biome, tiles, props };
}

module.exports = { biomeOf, outlandProps, TINT_NEAR, TINT_MID, TINT_FAR, TINT_SHORE };
