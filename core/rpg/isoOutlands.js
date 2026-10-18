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
// BIOMES (owner 2026-10-17: "a max of 5" terrains the bases exist in —
// "diversify ... add rocks and what not, mountains blah blah"):
//   forest     (30%) — mossy woodland: 2-4 ORGANIC FOREST PATCHES rolled
//                      out in the open wilds (dark floor, dense interior
//                      trees, thinning rim) + rare lone strays
//   mountains  (22%) — a high valley: snow-capped massifs on the west/
//                      east shoulders, a dark far ridge crowning the
//                      horizon, scree fields and boulder aprons below,
//                      stunted woodland as rolled patches
//   coast      (18%) — the compound sits on a headland: ocean starts past
//                      the fence on the south-east edge, shoreline rocks
//                      and a stony spring mark the waterline; land-side
//                      woodland arrives as patches (never ocean cells)
//   highlands  (16%) — rocky highlands: monoliths, basalt clusters, shard
//                      spires and pylons in 2-4 clusters, rolled woodland
//   ruins      (14%) — an ancient mossy ruin site: arch, gate, columns,
//                      ivy tower, slabs, overgrown roots, woodland patches
//
// BOULDER LAW ("add rocks and what not"): every soft biome (forest /
// ruins / coast) also scatters 3-5 seeded boulder/stone clusters on the
// open moss, and rocky biomes (highlands / mountains) seed a few tame
// rocks into the yard margins — clustered always, never lone glitch
// diamonds.
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
    mountainPeaks: ['px_mountain_a.png', 'px_mountain_b.png'],
    mountainClutter: ['px_boulder.png', 'px_rock.png', 'px_stone.png', 'px_cliff.png', 'poly_stream_rocks.png'],
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
    if (r < 0.30) return 'forest';
    if (r < 0.52) return 'mountains';
    if (r < 0.70) return 'coast';
    if (r < 0.86) return 'highlands';
    return 'ruins';
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
    const nRocks = { highlands: 26, mountains: 22, coast: 16, ruins: 8, forest: 10 }[biome] || 10;
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
    // ── FOREST PATCH LAW (owner 2026-10-17, v91 stack: "no that isn't what
    // I meant this is, the yellow circled parts like they look like a
    // natural forest of sorts just like how sometimes some sides generate
    // water, not just green [trees] at the fucking edges of the fence") —
    // THE FENCE WALL IS DEAD. No more 2-row tree borders hugging the
    // palisade. Instead each player seed rolls 1-3 ORGANIC WOODLAND
    // PATCHES out in the open wilds — the reference's yellow-circled
    // forests: a dark forest-floor carpet with dense interior trees and
    // undergrowth, thinning to a wobbled natural edge. Same spirit as the
    // coast's water band: sometimes a side grows a forest, sometimes it
    // doesn't, and WHICH sides is rolled per seed and permanent for that
    // player. The dark floor now belongs to the PATCH (not the whole
    // wilds), so open moss separates the forests instead of a wall of
    // green on the fence line.
    const patchRnd = mulberry32(seed ^ 0x70f11e);
    const nPatch = { forest: 2, coast: 1, ruins: 1, highlands: 1, mountains: 1 }[biome]
        + (patchRnd() < 0.55 ? 1 : 0) + (patchRnd() < 0.25 ? 1 : 0);
    // side anchors (ref-card screen pts) — pushed WELL out into the wilds
    // so patches read as open-country forests, never as fence dressing
    const patchAnchors = [[125, 148], [1112, 168], [88, 425], [1152, 472], [305, 88], [898, 772], [178, 682], [1082, 642], [430, 795], [620, 62]].map(sa);
    const patchSeeds = [];
    {
        const order = patchAnchors.map((_, i) => i).sort(() => patchRnd() - 0.5);
        for (let i = 0; i < Math.min(nPatch, order.length); i++) {
            const [sx, sy] = patchAnchors[order[i]];
            const [gx, gy] = screenToGrid(sx + (patchRnd() - 0.5) * 80, sy + (patchRnd() - 0.5) * 40);
            patchSeeds.push({
                cx: Math.max(lo + 2, Math.min(hi - 2, gx)),
                cy: Math.max(lo + 2, Math.min(hi - 2, gy)),
                r: 3.8 + patchRnd() * 2.6,               // 3.8-6.4 tile radius
                wob: patchRnd() * Math.PI * 2,           // organic edge phase
            });
        }
    }
    const patchOf = (x, y) => {
        for (const p of patchSeeds) {
            const dx = x - p.cx, dy = y - p.cy;
            const d = Math.sqrt(dx * dx + dy * dy);
            const edge = p.r + Math.sin(Math.atan2(dy, dx) * 2.7 + p.wob) * 1.15;  // wobbled boundary
            if (d <= edge) return { p, d, edge };
        }
        return null;
    };
    const floorAt = (x, y) => {
        // dark woodland floor ONLY inside patches now — the old wall-band
        // carpet + reverse-blob clearings belonged to the fence-wall law
        return !!patchOf(x, y);
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

    // a placement is only valid in the OPEN wilds: never inside the fence
    // diamond (a peak standing in the yard margin is a glitch) and never
    // in a gate corridor (roads walk out to the horizon)
    const openWild = (gx, gy) => !(gx >= f0 && gx <= f1 && gy >= f0 && gy <= f1) && !inGateCorridor(gx, gy);

    // BOULDER LAW — seeded stone clusters on the open moss for the soft
    // biomes ("add rocks and what not"): 2-4 chunky boulders/stones around
    // a wild anchor, clustered so they read as outcrops, never lone tiles
    const boulderAnchors = [[160, 195], [1075, 210], [120, 590], [1115, 585], [350, 115], [905, 130], [300, 745], [935, 720]];
    const scatterBoulders = (n, avoidOcean) => {
        const order = boulderAnchors.slice().sort(() => master() - 0.5);
        for (let i = 0; i < n; i++) {
            const [sx, sy] = sa(order[i % order.length]);
            const [gx, gy] = screenToGrid(sx + (master() - 0.5) * 220, sy + (master() - 0.5) * 90);
            if (!openWild(gx, gy)) continue;
            if (avoidOcean && isOceanCell(Math.round(gx), Math.round(gy))) continue;
            cluster(master, POOLS.mountainClutter.map((f) => [f, 1]), gx, gy, 2 + Math.floor(master() * 3), (0.7 + master() * 0.5) * CS, TINT_MID, 1.3);
        }
    };

    // ── PATCH TREE PLANTING (replaces the dead fence wall + decay rows) —
    // dense interior canopy with a naturally thinning rim, rare lone
    // strays on the open moss. THE ANTI-'GREEN FENCE EDGE' LAW: nothing
    // plants just because a cell is near the fence — only patch members
    // and seeded strays exist.
    const plantWildTrees = () => {
        for (let x = lo; x <= hi; x++) {
            for (let y = lo; y <= hi; y++) {
                if (isOceanCell(x, y) || inGateCorridor(x, y)) continue;
                if (x >= f0 && x <= f1 && y >= f0 && y <= f1) continue;   // yard + playable
                const r = mulberry32(seed + x * 613 + y * 929 + 41)();
                const hit = patchOf(x, y);
                if (hit) {
                    const edgeT = hit.d / hit.edge;            // 0 centre → 1 rim
                    const rate = edgeT > 0.72 ? 0.24 : 0.62;   // natural thinning rim
                    if (r >= rate) continue;
                    const hero = r < 0.09;
                    const sc = Math.min((hero ? 1.0 + r * 2.2 : 0.52 + r * 0.42) * TS, 1.62);
                    put(pickWeighted(master, POOLS.forestTrees.map((f) => [f, 1])), x + (r - 0.5), y + (r * 0.4 - 0.2), sc, edgeT > 0.72 ? TINT_NEAR : TINT_MID, 40, 14);
                } else if (r < 0.028) {
                    // lone stray on the open moss — big, solitary, no clutter
                    const sc = Math.min((0.85 + r * 8) * TS, 1.5);
                    put(pickWeighted(master, POOLS.forestTrees.map((f) => [f, 1])), x + (r - 0.5), y + (r * 0.4 - 0.2), sc, null, 40, 14);
                }
            }
        }
    };
    // patch undergrowth — ferns/tufts/logs INSIDE the woodland carpet only,
    // so the floor reads as lived-in thicket ground
    const plantPatchUndergrowth = () => {
        for (let x = lo; x <= hi; x++) {
            for (let y = lo; y <= hi; y++) {
                if (isOceanCell(x, y) || inGateCorridor(x, y)) continue;
                if (x >= f0 && x <= f1 && y >= f0 && y <= f1) continue;
                if (!patchOf(x, y)) continue;
                const r = mulberry32(seed + x * 331 + y * 701 + 23)();
                if (r < 0.13) put(pickWeighted(master, POOLS.forestClutter.map((f) => [f, 1])), x + (r - 0.5), y + (r * 0.4 - 0.2), Math.min((0.55 + r * 1.6) * CS, 1.15), TINT_NEAR, 34, 12);
            }
        }
    };

    if (biome === 'forest') {
        // FOREST PATCH LAW — no fence wall; 2-4 rolled woodland patches +
        // rare strays carry the whole look now
        plantWildTrees();
        plantPatchUndergrowth();
        // deep-wilds mossy clutter (the patches' floor already carries the
        // woodland read — only scatter remains from the old cluster law)
        const wildAnchors = [[110, 180], [1110, 225], [170, 635], [1060, 600], [590, 66], [650, 792], [340, 105], [920, 772]].map(sa);
        for (let i = 0; i < 14; i++) {
            const [sx, sy] = wildAnchors[Math.floor(master() * wildAnchors.length)];
            const [gx, gy] = screenToGrid(sx + (master() - 0.5) * 260, sy + (master() - 0.5) * 110);
            if (gx >= f0 && gx <= f1 && gy >= f0 && gy <= f1) continue;
            put(pickWeighted(master, POOLS.forestClutter.map((f) => [f, 1])), gx, gy, Math.min((0.7 + master() * 0.3) * CS, 0.95), TINT_MID, 34, 12);
        }
        // BOULDER LAW — a few stone outcrops on the open moss
        scatterBoulders(4);
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
        // scree fields + sparse wind-stunted trees between clusters;
        // FOREST PATCH LAW — 1-3 rolled woodland patches + strays, no fence
        // wall (the compound nests beside woodland, not inside a border)
        plantWildTrees();
        plantPatchUndergrowth();
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
        // FOREST PATCH LAW — mossy woodland arrives as rolled patches
        // around the ruin sites, not as a fence border
        plantWildTrees();
        plantPatchUndergrowth();
        for (let i = 0; i < 14; i++) {
            const cx = master() * (2 * (N + P) + 6) - (N + P) - 3;
            const cy = master() * (2 * (N + P) + 6) - (N + P) - 3;
            if (cx >= f0 && cx <= f1 && cy >= f0 && cy <= f1) continue;
            put(pickWeighted(master, POOLS.forestClutter.map((f) => [f, 1])), cx, cy, Math.min((0.7 + master() * 0.3) * CS, 0.95), TINT_MID, 34, 12);
        }
        // BOULDER LAW — mossy outcrops among the ruins
        scatterBoulders(3);
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
        // land side: FOREST PATCH LAW (owner v91 stack — natural forests of
        // sorts like the reference's yellow circles, NOT a green fence
        // edge); ocean cells and the gate corridor stay clear
        plantWildTrees();
        plantPatchUndergrowth();
        // deep woodland clutter on the LAND sides
        const landAnchors = [[110, 180], [170, 635], [590, 66], [340, 105], [90, 330], [620, 760]].map(sa);
        for (let i = 0; i < 10; i++) {
            const [sx, sy] = landAnchors[Math.floor(master() * landAnchors.length)];
            const [gx, gy] = screenToGrid(sx + (master() - 0.5) * 260, sy + (master() - 0.5) * 110);
            if (isOceanCell(Math.round(gx), Math.round(gy))) continue;
            if (gx >= f0 && gx <= f1 && gy >= f0 && gy <= f1) continue;
            put(pickWeighted(master, POOLS.forestClutter.map((f) => [f, 1])), gx, gy, Math.min((0.7 + master() * 0.3) * CS, 0.95), TINT_MID, 34, 12);
        }
        // BOULDER LAW — land-side stone outcrops (never in the water)
        scatterBoulders(4, true);
    }

    if (biome === 'mountains') {
        // ── MOUNTAINS LAW (owner 2026-10-17: "diversify the terrains the
        // player and guild bases exist in, add rocks and what not, mountains
        // blah blah") — the compound sits in a HIGH VALLEY:
        //   1. a dark far ridge crowns the horizon behind the north fence
        //      corner (TINT_FAR aerial perspective),
        //   2. true snow-capped massifs stand on the WEST/EAST shoulders
        //      (never the south foreground — nothing may cover the yard),
        //   3. scree + boulder aprons spill below the peaks,
        //   4. stunted woodland arrives as the usual rolled patches.
        // MS: mountain scale follows the canvas law (guild card reads them
        // at the same relative size as the base card, like TS for trees —
        // capped lower would re-create the "reads half-size on the big
        // canvas" trap; peaks are sparse so no canopy-wall risk)
        const MS = Math.min(AX, 2.1);
        // 1. far horizon ridge — deepest, darkest, drawn first (small y)
        const farAnchors = [[140, 100], [1095, 105], [350, 72], [890, 72]];
        const nFar = 1 + Math.floor(master() * 3);
        const farOrder = farAnchors.slice().sort(() => master() - 0.5);
        let placedFar = 0;
        for (let i = 0; i < farOrder.length && placedFar < nFar; i++) {
            const [sx, sy] = sa(farOrder[i]);
            const [gx, gy] = screenToGrid(sx + (master() - 0.5) * 90, sy + (master() - 0.5) * 30);
            if (!openWild(gx, gy)) continue;
            put('px_mountain_far.png', gx, gy, (0.85 + master() * 0.3) * MS, TINT_FAR, 20, 8);
            placedFar++;
        }
        // 2. main massifs — west/east shoulder + corner bands; every skipped
        // anchor retries the next one so the roll always plants its quota
        // (the guild's west gate corridor eats the raw left-mid anchors)
        const peakAnchors = [[125, 148], [1112, 168], [88, 425], [1152, 472], [105, 560], [1120, 560], [240, 660], [990, 665]];
        const nPeaks = 4 + Math.floor(master() * 3);
        const order = peakAnchors.slice().sort(() => master() - 0.5);
        let placedPeaks = 0;
        for (let i = 0; i < order.length && placedPeaks < nPeaks; i++) {
            const [rx, ry] = order[i];
            const [sx, sy] = sa([rx, ry]);
            const [gx, gy] = screenToGrid(sx + (master() - 0.5) * 70, sy + (master() - 0.5) * 40);
            if (!openWild(gx, gy)) continue;
            put(pickWeighted(master, POOLS.mountainPeaks.map((f) => [f, 1])), gx, gy, (1.25 + master() * 0.45) * MS, null, 22, 10);
            placedPeaks++;
        }
        // 3. scree aprons below the massifs + lone cliff shelves
        for (let i = 0; i < 6; i++) {
            const [rx, ry] = peakAnchors[Math.floor(master() * peakAnchors.length)];
            const [sx, sy] = sa([rx, ry]);
            const [gx, gy] = screenToGrid(sx + (master() - 0.5) * 260, sy + 55 + (master() - 0.5) * 130);
            if (!openWild(gx, gy)) continue;
            cluster(master, POOLS.mountainClutter.map((f) => [f, 1]), gx, gy, 2 + Math.floor(master() * 3), (0.75 + master() * 0.45) * CS, null, 1.25);
        }
        // 4. stunted woodland — the patch law, same as every biome
        plantWildTrees();
        plantPatchUndergrowth();
    }

    // ── 4. yard dressing (inside fence, outside playable) — tamed meadow ──
    // rocky biomes seed a few TAME stones into the yard margins too
    // ("add rocks and what not") — clustered rolls, never a scatter of
    // lone glitch diamonds
    const rockyYard = biome === 'highlands' || biome === 'mountains';
    for (let x = f0; x <= f1; x++) {
        for (let y = f0; y <= f1; y++) {
            const playable = x >= 0 && y >= 0 && x < N && y < N;
            if (playable) continue;
            const r = mulberry32(seed + (x + 60) * 197 + (y + 60) * 29)();
            if (r < 0.13) {
                const yr = mulberry32(seed + (x + 60) * 197 + (y + 60) * 29 + 5)();
                const rocky = rockyYard && yr < 0.42;
                const px = isoX(x + 0.5, y + 0.5) + (r - 0.5) * 30;
                const py = isoY(x + 0.5, y + 0.5) + (r * 0.4 - 0.2) * 20;
                props.push({
                    file: rocky ? (yr < 0.21 ? 'px_rock.png' : 'px_stone.png') : POOLS.yardProps[Math.floor(r * 97) % POOLS.yardProps.length],
                    x: px, y: py, sc: 0.85 + r * 0.4, tint: null,
                });
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
