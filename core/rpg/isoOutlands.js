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
    const { seedStr, N, P, isoX, isoY, M, OX: OX_ = 620, OY: OY_ = 150, TW: TW_ = 64, TH: TH_ = 32, gates = [] } = opts;
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
    // TREE-SCALE LAW (owner 2026-10-17: the guild's outside trees must read
    // like the player base reference): sprite px are absolute while the
    // guild card is 2.06x wider than the base reference card — the same sc
    // reads half-size. Scale tree sprites by the canvas factor (base stays
    // byte-identical at TS=1; rocks/ruins keep their own scales — those are
    // already monumental polyy sprites).
    const TS = Math.min(AX, 1.55);    // big-canvas tree scale (1.55 ≈ the
    // reference's 1.3-1.9-tile trees; higher turned the south edge into a
    // solid canopy wall that swallowed the fence and the front yard)
    const CS = Math.min(AX, 1.35);    // ground clutter cap (logs/ferns/shrooms)


    // screen→grid helper: place set pieces by SCREEN position so they always
    // land on-card (grid-space offsets run off the diamond diagonals)
    function screenToGrid(sx, sy) {
        const a = (sx - OX_) / (TW_ / 2);       // x - y
        const b = (sy - OY_) / (TH_ / 2);       // x + y
        return [(b + a) / 2, (b - a) / 2];
    }

    // ── GATE CORRIDOR LAW (owner 2026-10-17: roads must walk out of the
    // gate into the wilds) — renderers declare their gate cells (padded
    // border coords); a ~5-deep corridor beyond each gate stays treeless so
    // the road reads gate-to-horizon in EVERY biome.
    const corridorRects = [];
    for (const [gx, gy] of gates) {
        if (gx === f0) corridorRects.push([f0 - 6, gy - 2.5, f0 + 1, gy + 3.5]);        // west gate
        else if (gx === f1) corridorRects.push([f1 - 1, gy - 2.5, f1 + 6, gy + 3.5]);   // east gate
        else if (gy === f0) corridorRects.push([gx - 2.5, f0 - 6, gx + 3.5, f0 + 1]);   // north gate
        else corridorRects.push([gx - 2.5, f1 - 1, gx + 3.5, f1 + 6]);                  // south gate
    }
    const inGateCorridor = (x, y) => corridorRects.some(([a, b, c, d]) => x >= a && y >= b && x <= c && y <= d);

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
    // ROCK-GROUND LAW v2 (owner 2026-10-17 'the background looks weird
    // again'): the old iid per-cell rock roll scattered lone flat stone
    // diamonds across the moss — they read as glitch squares, worse the
    // bigger the wild band (guild 28x28). Rocks now grow as CLUSTERED BLOBS:
    // a few deterministic seeds per biome expand into organic stony patches,
    // so they read as rocky ground, not floating tiles.
    const rockRnd = mulberry32(seed ^ 0x51ed270b);
    const nRocks = { highlands: 26, coast: 16, ruins: 8, forest: 10 }[biome] || 10;
    const rockSeeds = [];
    for (let i = 0; i < nRocks; i++) {
        rockSeeds.push([Math.floor(rockRnd() * (hi - lo + 1)) + lo, Math.floor(rockRnd() * (hi - lo + 1)) + lo, 1 + Math.floor(rockRnd() * 2)]);
    }
    const rockAt = (x, y) => {
        for (const [cx, cy, cr] of rockSeeds) {
            if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) <= cr) {
                const rr = mulberry32(seed + (x + 80) * 131 + (y + 80) * 17)();
                if (rr < 0.82) return true;   // nibble the blob edge so patches stay organic
            }
        }
        return false;
    };
    // ── TREE TERRAIN LAW (owner 2026-10-17, v81 stack: "I don't see any
    // tree terrains outside like in my reference image") — the reference's
    // woodland does not stand on lawn: the ground under/around the outside
    // trees rolls onto a DARK mossy forest floor (forest_floor_a/b/c,
    // ~35% darker + browner than the yard moss). The floor grows as organic
    // blobs that hug the fence and thin out with distance, so the tree wall
    // visibly sits on its own terrain exactly like the reference; rock
    // blobs keep overriding (stony ground pokes through the carpet).
    const floorRnd = mulberry32(seed ^ 0x0f10e5);
    const nFloor = { forest: 34, coast: 26, ruins: 24, highlands: 15 }[biome] || 24;
    const floorSeeds = [];
    for (let i = 0; i < nFloor; i++) {
        floorSeeds.push([Math.floor(floorRnd() * (hi - lo + 1)) + lo, Math.floor(floorRnd() * (hi - lo + 1)) + lo, 1.5 + floorRnd() * 2.5]);
    }
    const floorAt = (x, y) => {
        const d = Math.max(f0 - x, x - f1, f0 - y, y - f1);   // 0 inside fence, 1+ wilds
        if (d <= 0) return false;
        if (d <= 2) return true;                              // the wall band always stands on floor
        const keep = Math.max(0, 0.78 - d * 0.11);            // coverage decays with depth
        for (const [cx, cy, cr] of floorSeeds) {
            if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) <= cr) {
                const rr = mulberry32(seed + (x + 120) * 131 + (y + 120) * 17)();
                if (rr < keep) return true;
            }
        }
        return false;
    };
    for (let x = lo; x <= hi; x++) {
        for (let y = lo; y <= hi; y++) {
            const insideFence = x >= f0 && x <= f1 && y >= f0 && y <= f1;
            if (insideFence) continue;      // yard + playable handled by renderer
            if (isOceanCell(x, y)) { tiles.push({ x, y, tile: 'water' }); continue; }
            // wild ground: moss with rock/shroom flecks; coast land side is
            // sandy-gritty (rock tile flecks read as shingle)
            const r = mulberry32(seed + (x + 80) * 131 + (y + 80) * 17)();
            let tile;
            if (rockAt(x, y)) tile = 'forest_rock_tile.png';
            else if (floorAt(x, y)) tile = `forest_floor_${'abc'[Math.floor(mulberry32(seed + (x + 200) * 131 + (y + 200) * 17)() * 29) % 3]}.png`;
            else if (r < 0.05) tile = 'forest_moss_shrooms.png';
            else tile = 'grass';
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

    // ── STAGGERED FENCE WALL (owner 2026-10-17, g6 live render: "see how
    // the trees outside the wall are set??? that's the kinda arrangement I
    // want for trees outside the fence") — the forest biome's dense
    // 2-row staggered treatment around ALL FOUR fence edges, extended to
    // every biome (coast skips ocean cells; the gate corridor always stays
    // open). FRONT-ROW THINNING: the south/east rows draw IN FRONT of the
    // whole compound (painter's order) — they scatter at half rate with no
    // stagger so the grounds stay visible behind them, exactly like the
    // reference's sparse front band.
    const treeWall = (rate, scBase, scVar, tint) => {
        const plant = (x, y, r) => {
            if (isOceanCell(x, y) || inGateCorridor(x, y)) return;
            const hero = mulberry32(seed + Math.round(x * 733) * 3 + Math.round(y * 991))() < 0.12;
            const sc = Math.min((hero ? 1.0 + r * 0.18 : scBase + r * scVar) * TS, 1.65);
            put(pickWeighted(master, POOLS.forestTrees.map((f) => [f, 1])), x + (r - 0.5), y + (r * 0.4 - 0.2), sc, tint, 40, 14);
        };
        for (let x = f0 - 2; x <= f1 + 2; x++) {
            for (const y of [f0 - 1, f0 - 2, f1 + 1, f1 + 2]) {
                const south = y >= f1 + 1;
                const rr = south ? rate * 0.5 : rate;
                const r = mulberry32(seed + x * 929 + y * 613)();
                if (r < rr) plant(x, y, r);
                if (!south && r < rr * 0.8) plant(x + 0.3, y + 0.4, mulberry32(seed + x * 929 + y * 613 + 5)()); // stagger
            }
        }
        for (let y = f0 - 2; y <= f1 + 2; y++) {
            for (const x of [f0 - 1, f0 - 2, f1 + 1, f1 + 2]) {
                const east = x >= f1 + 1;
                const rr = east ? rate * 0.7 : rate;
                const r = mulberry32(seed + x * 457 + y * 1319)();
                if (r < rr) plant(x, y, r);
                if (r < rr * 0.8) plant(x + 0.4, y + 0.3, mulberry32(seed + x * 457 + y * 1319 + 5)()); // stagger
            }
        }
    };

    // ── WILD WOODLAND DECAY (same owner note: the reference's woodland
    // extends well past the wall rows, thinning as it goes — it does not
    // stop after 2 rows into empty lawn) — rows d=3..6 beyond the fence on
    // every edge, rate + canopy shrinking with depth; ocean cells and gate
    // corridors stay clear; the south/east keep their front-row thinning
    // factors so the compound's foreground stays readable.
    const wildWood = (rateBase) => {
        const DECAY = [0, 0, 0, 0.34, 0.2, 0.11, 0.05];
        const plantDeep = (x, y, r, south, east) => {
            if (isOceanCell(x, y) || inGateCorridor(x, y)) return;
            const d = Math.max(f0 - y, y - f1, f0 - x, x - f1);
            const rr = rateBase * DECAY[d] * (south ? 0.5 : 1) * (east ? 0.7 : 1);
            if (r >= rr) return;
            const sc = Math.min((0.5 + r * 0.2) * TS * (d >= 5 ? 0.85 : 1), 1.6);
            put(pickWeighted(master, POOLS.forestTrees.map((f) => [f, 1])), x + (r - 0.5), y + (r * 0.4 - 0.2), sc, d >= 4 ? TINT_MID : TINT_NEAR, 40, 14);
        };
        for (let x = f0 - 6; x <= f1 + 6; x++) {
            for (const y of [f0 - 6, f0 - 5, f0 - 4, f0 - 3, f1 + 3, f1 + 4, f1 + 5, f1 + 6]) {
                plantDeep(x, y, mulberry32(seed + x * 613 + y * 929 + 11)(), y >= f1 + 3, false);
            }
        }
        for (let y = f0 - 6; y <= f1 + 6; y++) {
            for (const x of [f0 - 6, f0 - 5, f0 - 4, f0 - 3, f1 + 3, f1 + 4, f1 + 5, f1 + 6]) {
                plantDeep(x, y, mulberry32(seed + x * 1319 + y * 457 + 11)(), false, x >= f1 + 3);
            }
        }
    };
    // ── NEAR-BAND UNDERGROWTH — ferns/tufts/logs/mushrooms scattered on the
    // dark floor right outside the wall so the band reads as thicket floor,
    // not a tree border on raked lawn.
    const wildUndergrowth = (rate) => {
        const cells = [];
        for (let x = f0 - 3; x <= f1 + 3; x++) for (const y of [f0 - 3, f0 - 2, f0 - 1, f1 + 1, f1 + 2, f1 + 3]) cells.push([x, y]);
        for (let y = f0 - 3; y <= f1 + 3; y++) for (const x of [f0 - 3, f0 - 2, f0 - 1, f1 + 1, f1 + 2, f1 + 3]) cells.push([x, y]);
        for (const [x, y] of cells) {
            if (isOceanCell(x, y) || inGateCorridor(x, y)) continue;
            const r = mulberry32(seed + x * 331 + y * 701 + 23)();
            if (r < rate) put(pickWeighted(master, POOLS.forestClutter.map((f) => [f, 1])), x + (r - 0.5), y + (r * 0.4 - 0.2), (0.55 + r * 1.6) * CS, TINT_NEAR, 34, 12);
        }
    };

    if (biome === 'forest') {
        // dense tree wall hugging the fence outside (2 staggered rows) —
        // THE REFERENCE ARRANGEMENT (untouched rates; gate corridor added)
        for (let x = f0 - 2; x <= f1 + 2; x++) {
            for (const y of [f0 - 1, f0 - 2, f1 + 1, f1 + 2]) {
                if (isOceanCell(x, y) || inGateCorridor(x, y)) continue;
                const r = mulberry32(seed + x * 313 + y * 977)();
                if (y >= f1 + 1 && TS > 1.3 && r > 0.28) continue;   // big canvas: sparse front band
                if (r < 0.5) put(pickWeighted(master, POOLS.forestTrees.map((f) => [f, 1])), x + (r - 0.5), y + (r * 0.4 - 0.2), (0.5 + r * 0.24) * TS, TINT_NEAR, 40, 14);
            }
        }
        for (let y = f0 - 2; y <= f1 + 2; y++) {
            for (const x of [f0 - 1, f0 - 2, f1 + 1, f1 + 2]) {
                if (isOceanCell(x, y) || inGateCorridor(x, y)) continue;
                const r = mulberry32(seed + x * 7717 + y * 313)();
                if (x >= f1 + 1 && TS > 1.3 && r > 0.36) continue;   // big canvas: east edge lighter
                if (r < 0.5) put(pickWeighted(master, POOLS.forestTrees.map((f) => [f, 1])), x + (r * 0.4 - 0.2), y + (r - 0.5), (0.5 + r * 0.24) * TS, TINT_NEAR, 40, 14);
            }
        }
        wildWood(0.5);
        wildUndergrowth(0.16);
        // deep wilds: conifer clusters + mossy clutter, at SCREEN anchors
        const wildAnchors = [[110, 180], [1110, 225], [170, 635], [1060, 600], [590, 66], [650, 792], [340, 105], [920, 772]].map(sa);
        for (let i = 0; i < 5; i++) {
            const [sx, sy] = wildAnchors[Math.floor(master() * wildAnchors.length)];
            const [gx, gy] = screenToGrid(sx + (master() - 0.5) * 120, sy + (master() - 0.5) * 50);
            cluster(master, POOLS.forestTrees.map((f) => [f, 1]), gx, gy, 2 + Math.floor(master() * 3), (0.5 + master() * 0.16) * TS, TINT_MID, 1.4);
        }
        for (let i = 0; i < 18; i++) {
            const [sx, sy] = wildAnchors[Math.floor(master() * wildAnchors.length)];
            const [gx, gy] = screenToGrid(sx + (master() - 0.5) * 260, sy + (master() - 0.5) * 110);
            put(pickWeighted(master, POOLS.forestClutter.map((f) => [f, 1])), gx, gy, (0.7 + master() * 0.3) * CS, TINT_MID, 34, 12);
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
        // scree fields + sparse wind-stunted trees between clusters, PLUS
        // a thin staggered fence wall so the compound still nests in woodland
        treeWall(0.3, 0.55, 0.24, TINT_NEAR);
        wildWood(0.3);
        wildUndergrowth(0.09);
        for (let i = 0; i < 16; i++) {
            const [sx, sy] = rockAnchors[Math.floor(master() * rockAnchors.length)];
            const [gx, gy] = screenToGrid(sx + (master() - 0.5) * 300, sy + (master() - 0.5) * 120);
            if (master() < 0.7) put(pickWeighted(master, POOLS.highClutter.map((f) => [f, 1])), gx, gy, (0.75 + master() * 0.35) * CS, TINT_MID, 30, 12);
            else put(pickWeighted(master, POOLS.forestTrees.map((f) => [f, 1])), gx, gy, (0.5 + master() * 0.18) * TS, TINT_MID, 30, 12);
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
        // tree wall still hugs the fence (mossy woodland around ruins) —
        // now the full staggered treatment (was 2 rows at 0.45, no E/W edge)
        treeWall(0.44, 0.58, 0.26, TINT_NEAR);
        wildWood(0.44);
        wildUndergrowth(0.13);
        for (let i = 0; i < 14; i++) {
            const cx = master() * (2 * (N + P) + 6) - (N + P) - 3;
            const cy = master() * (2 * (N + P) + 6) - (N + P) - 3;
            if (cx >= f0 && cx <= f1 && cy >= f0 && cy <= f1) continue;
            put(pickWeighted(master, POOLS.forestClutter.map((f) => [f, 1])), cx, cy, (0.7 + master() * 0.3) * CS, TINT_MID, 34, 12);
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
        // land side: THE REFERENCE WALL (owner: arrange the outside trees
        // like the player base) — full staggered fence wall, ocean cells
        // and the gate corridor stay clear
        treeWall(0.5, 0.6, 0.28, TINT_NEAR);
        wildWood(0.5);
        wildUndergrowth(0.14);
        // deep woodland clumps on the LAND sides (the old coast law had no
        // clusters at all — the wilds read as empty lawn)
        const landAnchors = [[110, 180], [170, 635], [590, 66], [340, 105], [90, 330], [620, 760]].map(sa);
        for (let i = 0; i < 4; i++) {
            const [sx, sy] = landAnchors[Math.floor(master() * landAnchors.length)];
            const [gx, gy] = screenToGrid(sx + (master() - 0.5) * 120, sy + (master() - 0.5) * 50);
            if (isOceanCell(Math.round(gx), Math.round(gy))) continue;
            cluster(master, POOLS.forestTrees.map((f) => [f, 1]), gx, gy, 2 + Math.floor(master() * 3), (0.5 + master() * 0.18) * TS, TINT_MID, 1.4);
        }
        for (let i = 0; i < 12; i++) {
            const [sx, sy] = landAnchors[Math.floor(master() * landAnchors.length)];
            const [gx, gy] = screenToGrid(sx + (master() - 0.5) * 260, sy + (master() - 0.5) * 110);
            if (isOceanCell(Math.round(gx), Math.round(gy))) continue;
            put(pickWeighted(master, POOLS.forestClutter.map((f) => [f, 1])), gx, gy, (0.7 + master() * 0.3) * CS, TINT_MID, 34, 12);
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
