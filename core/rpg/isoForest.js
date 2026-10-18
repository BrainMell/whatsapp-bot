'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// ISO FOREST — shared "the whole thing is a forest" law (owner 2026-10-16
// 11:57Z: "make the entire thing a forest with trees surrounding where the
// player house is" + "redesign the tiles an terrain").
//
//  paintBackdrop()  replaces the old blue-sky law with a deep-forest wall:
//                   canopy gradient → 3 hazed treeline rows → light shafts
//                   → drifting mist → dark under-island floor shade.
//  islandForest()   computes dense tree/understory placements for an island:
//                   2-tree border ring, mid-ring scatter, clearing trees
//                   around "hot" cells (the player house), understory ferns
//                   /mushrooms/tufts — never on occupied/path/plot tiles.
//
// Both base renderers (homestead + guild) share this so the two views read
// as the same forest. Tree/understory sprites are the Quaternius forest set
// already shipped in core/rpgasset/homestead (base_tree_*, forest_*).
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'rpgasset', 'homestead');

// tree pool for the ring — PIXEL SET (owner 2026-10-16 20:20Z: "could we
// make the trees something else?? a different set of trees more pixel arty")
// — chunky pixel sprites that match the pixel moss tiles. [file, weight]
const RING_TREES = [
    ['px_pine_a.png', 3], ['px_pine_b.png', 2.5], ['px_pine_c.png', 2],
    ['px_oak_a.png', 3], ['px_oak_b.png', 2.5],
    ['px_birch.png', 1.6], ['px_dead.png', 0.7], ['px_stump.png', 0.4],
];
// understory pool — small ground clutter (pixel set)
const UNDERSTORY = [
    ['px_fern.png', 4], ['px_tuft.png', 5], ['px_shroom.png', 2],
    ['px_bush_a.png', 2.5], ['px_bush_b.png', 2],
    ['px_rock.png', 1.4], ['px_boulder.png', 0.9],
];
// deep-margin conifers — far ring outside the wall + backdrop treelines
const FAR_TREES = [
    ['px_conifer_a.png', 3], ['px_conifer_b.png', 2.2],
    ['px_pine_a.png', 1.2], ['px_pine_b.png', 1.0],
];
// ── TREE CLUSTER LAW (owner 2026-10-18 "look up books, look up images ...
// right amount of environmental assets, rules and regulations"): trees read
// as INTENTIONAL when they mass in species groups (cozy-iso village refs),
// never salt-and-pepper. Clusters are seeded cells + species + count so a
// renderer can art-direct the massing while the seeded jitter keeps it
// organic. big = the px_bigtree feature tree (plaza/landmark duty).
const CLUSTER_POOLS = {
    conifer: [['px_conifer_a.png', 3], ['px_conifer_b.png', 2.2], ['px_pine_a.png', 1.4], ['px_pine_b.png', 1.2]],
    oak: [['px_oak_a.png', 3], ['px_oak_b.png', 2.5]],
    birch: [['px_birch.png', 3], ['px_oak_b.png', 1]],
    pine: [['px_pine_a.png', 3], ['px_pine_b.png', 2.4], ['px_pine_c.png', 1.6]],
    big: [['px_bigtree.png', 1]],
};

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
function pickWeighted(rnd, pool) {
    let tot = 0;
    for (const [, w] of pool) tot += w;
    let r = rnd() * tot;
    for (const [f, w] of pool) { r -= w; if (r <= 0) return f; }
    return pool[0][0];
}

const _imgCache = new Map();
function loadImg(file) {
    if (_imgCache.has(file)) return _imgCache.get(file);
    let out = null;
    try { out = require('canvas').loadImage(path.join(ASSETS, file)); } catch (e) { out = null; }
    _imgCache.set(file, out);
    return out;
}

// ── tinted sprite cache (for treeline rows) ──
const _tintCache = new Map();
async function tinted(file, col, scale) {
    const key = `${file}|${col}|${scale}`;
    if (_tintCache.has(key)) return _tintCache.get(key);
    const base = await loadImg(file);
    let out = null;
    if (base) {
        const w = Math.max(2, Math.round(base.width * scale));
        const h = Math.max(2, Math.round(base.height * scale));
        const cv = require('canvas').createCanvas(w, h);
        const cx = cv.getContext('2d');
        cx.imageSmoothingEnabled = true;
        cx.drawImage(base, 0, 0, w, h);
        cx.globalCompositeOperation = 'source-atop';
        cx.globalAlpha = 0.88;
        cx.fillStyle = col;
        cx.fillRect(0, 0, w, h);
        out = cv;
    }
    _tintCache.set(key, out);
    return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// BACKDROP — deep forest wall behind the island (replaces sky+sun+clouds)
// horizonY: art-space y where the island's north edge sits (~top corner).
// islandBottomY: art-space y of the island's south corner; below it the
// dark forest floor fills the rest of the canvas.
// ═══════════════════════════════════════════════════════════════════════════
async function paintBackdrop(ctx, W, H, frame, FRAMES, horizonY, islandBottomY) {
    // 1) canopy gradient — dark high canopy to misty green at the horizon
    const sky = ctx.createLinearGradient(0, 0, 0, Math.max(horizonY + 40, 10));
    sky.addColorStop(0, '#16230f');
    sky.addColorStop(0.45, '#233517');
    sky.addColorStop(0.78, '#39511f');
    sky.addColorStop(1, '#55742f');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    // under-island: dark forest floor shade
    const under = ctx.createLinearGradient(0, islandBottomY - 30, 0, H);
    under.addColorStop(0, '#1d2a12');
    under.addColorStop(1, '#121a0b');
    ctx.fillStyle = under;
    ctx.fillRect(0, islandBottomY - 30, W, H - islandBottomY + 30);

    // 2) three hazed treeline rows behind the island
    const rows = [
        { y: horizonY - 44, scale: 0.34, col: '#1a2812', alpha: 0.94, step: 34, jit: 10 },
        { y: horizonY - 16, scale: 0.52, col: '#223516', alpha: 0.95, step: 44, jit: 14 },
        { y: horizonY + 26, scale: 0.74, col: '#2c4419', alpha: 1.0, step: 58, jit: 18 },
    ];
    const drift = (frame / FRAMES) * 6; // ultra-slow sway illusion via offset per row
    for (let ri = 0; ri < rows.length; ri++) {
        const row = rows[ri];
        const files = FAR_TREES.map(([f]) => f);
        const rnd = mulberry32(101 + ri * 7);
        const rowW = W + 120;
        for (let x = -60 + drift * (ri + 1) * 0.4; x < rowW; x += row.step * (0.8 + rnd() * 0.5)) {
            const f = files[Math.floor(rnd() * files.length)];
            const spr = await tinted(f, row.col, row.scale);
            if (!spr) continue;
            const y = row.y + (rnd() - 0.5) * row.jit;
            ctx.save();
            ctx.globalAlpha = row.alpha;
            ctx.drawImage(spr, x, y - spr.height);
            ctx.restore();
        }
        // mist band between rows
        const mist = ctx.createLinearGradient(0, row.y - 60 * row.scale, 0, row.y + 26);
        mist.addColorStop(0, 'rgba(196,214,176,0)');
        mist.addColorStop(0.75, `rgba(196,214,176,${0.10 + ri * 0.05})`);
        mist.addColorStop(1, 'rgba(196,214,176,0)');
        ctx.fillStyle = mist;
        ctx.fillRect(0, row.y - 70 * row.scale, W, 90 * row.scale + 30);
    }

    // 3) god rays — very soft diagonal light shafts, clipped to the backdrop
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, Math.max(10, islandBottomY - 20));
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
        const ph = Math.sin((frame / FRAMES) * Math.PI * 2 + i * 2.1) * 0.5 + 0.5;
        const rayS = W / 1240; // spread rays across bigger canvases (1:1 @ reference card)
        const x0 = 140 * rayS + i * 330 * rayS;
        ctx.globalAlpha = 0.028 + ph * 0.02;
        ctx.fillStyle = '#e8f2c0';
        ctx.beginPath();
        ctx.moveTo(x0, -40);
        ctx.lineTo(x0 + 150, -40);
        ctx.lineTo(x0 + 430 + i * 60, H * 0.72);
        ctx.lineTo(x0 + 130 + i * 60, H * 0.72);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();

    // 4) drifting mist wisps over the treeline base
    ctx.save();
    for (let i = 0; i < 4; i++) {
        const sp = 0.5 + (i % 3) * 0.35;
        const mx = ((frame / FRAMES) * 90 * sp + i * 340) % (W + 300) - 150;
        const my = horizonY - 6 + (i % 2) * 26;
        const mg = ctx.createRadialGradient(mx, my, 4, mx, my, 150);
        mg.addColorStop(0, 'rgba(214,228,196,0.16)');
        mg.addColorStop(1, 'rgba(214,228,196,0)');
        ctx.fillStyle = mg;
        ctx.beginPath(); ctx.arc(mx, my, 150, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════════
// ISLAND FOREST — placement law for the trees ON the island.
//   opts: { seed, N, isoX, isoY, occupied:Set("x,y"), paths:[[x,y]...],
//           hot:[[x,y]...], plotCells:Set("x,y"), margin:bool,
//           structFoots:[[x,y,fw,fh]...] }
// Returns [{ file, x, y }] art-px placements (bottom-anchored draw law):
//   - margin mode: wall lives OUTSIDE (cells -1/N, sc 0.58-0.78), far
//     wilderness conifer ring at cells -2/N+1, in-map border = mid density
//   - hot cells (around the player house): clearing trees @ 42% — and NO
//     tall trees in the 2-tile front-shadow band of any structure
//   - every other free tile: understory clutter @ 17% (8% in shadow)
// ═══════════════════════════════════════════════════════════════════════════
function islandForest(opts) {
    const { seed, N, isoX, isoY, occupied, paths = [], hot = [], plotCells, margin, structFoots,
            // TREE-RATE opts (owner 2026-10-17 'too many trees' on the 28x28
            // guild grounds): renderers can thin the mid ring + the hot ring
            // around the castle. Defaults = the historical rates, so the
            // homestead caller stays byte-identical.
            midRate = 0.45, hotRate = 0.42,
            // WOODS LAW (v5): explicit cells that stay WOODED (the fenced
            // hunting woods read as woods, not lawn) at their own rates.
            woods = null,          // { cells:[[x,y]], treeRate, underRate }
            // CLUSTER LAW (v5): art-directed tree massing — seeded cells
            // win over scatter; scatter rates are expected to drop when
            // clusters are provided.
            clusters = [] } = opts;
    if (woods && woods.cells && !woods.cellSet) woods.cellSet = new Set(woods.cells.map(([x, y]) => `${x},${y}`));
    const pathSet = new Set(paths.map(([x, y]) => `${x},${y}`));
    const hotSet = new Set(hot.map(([x, y]) => `${x},${y}`));
    const blocked = new Set([...(occupied || []), ...pathSet, ...(plotCells || [])]);
    // FRONT-SHADOW LAW (owner 20:20Z "houses seem to be on top of the trees"):
    // cells in the 2-tile south-easterly band of a structure get NO tall
    // trees — a tree there draws in front of the building and buries its
    // front face. Understory (ferns/rocks) still allowed at half rate, and
    // trees BEHIND (north-west of) buildings stay — canopies peeking over
    // roofs is the cozy look we want.
    const frontShadow = new Set();
    for (const foot of structFoots || []) {
        const [fx, fy, fw, fh] = foot;
        for (let ix = 0; ix < fw; ix++) {
            for (let iy = 0; iy < fh; iy++) {
                for (let dx = -1; dx <= 2; dx++) {
                    for (let dy = -1; dy <= 2; dy++) {
                        if (dx + dy >= 2) frontShadow.add(`${fx + ix + dx},${fy + iy + dy}`);
                    }
                }
            }
        }
    }
    const rnd = mulberry32(hashStr(seed ^ 0x6d2b79f5));
    const out = [];
    const jitter = (m) => (rnd() - 0.5) * m;
    const taken = new Set();   // cluster cells claim their spots first

    // ── CLUSTER PASS — art-directed massing beats scatter (v5). Each cluster
    // claims up to n FREE cells within radius r of its seed (seeded nearest
    // order), never on blocked/front-shadow ground, then plants species-
    // weighted trees with tight organic jitter. Feature trees (sp 'big')
    // also skip the front-shadow band.
    for (const cl of clusters || []) {
        const pool = CLUSTER_POOLS[cl.sp] || CLUSTER_POOLS.oak;
        const r = cl.r ?? 1;
        const cands = [];
        for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
                const cx = cl.x + dx, cy = cl.y + dy;
                const k = `${cx},${cy}`;
                if (cx < 0 || cy < 0 || cx >= N || cy >= N) continue;
                if (blocked.has(k) || taken.has(k) || frontShadow.has(k)) continue;
                if (hotSet.has(k) && (cl.sp !== 'big')) continue; // house clearing law holds
                cands.push([cx, cy, dx * dx + dy * dy]);
            }
        }
        cands.sort((a, b) => (a[2] - b[2]) + (rnd() - 0.5) * 0.9);
        for (const [cx, cy] of cands.slice(0, cl.n || 1)) {
            taken.add(`${cx},${cy}`);
            const px = isoX(cx + 0.5, cy + 0.5), py = isoY(cx + 0.5, cy + 0.5);
            out.push({
                file: pickWeighted(rnd, pool),
                x: px + jitter(22), y: py + jitter(10) + 6,
                sc: cl.sp === 'big' ? (1.05 + rnd() * 0.12) : (0.92 + rnd() * 0.18),
            });
        }
    }
    // HAZE LAW (owner pre-restart promise: "everything behind [the fence] =
    // dense hazed forest"): wild props outside the playable ring carry a tint
    // the renderer applies via tinted() — deeper ring = darker, so the wilds
    // recede behind the pixel fence line.
    const haze = !!opts.haze;
    const FAR_TINT = '#263d17';
    const WALL_TINT = '#31491d';

    // margin mode (owner 2026-10-16: ground/world continues past the borders):
    // the dense tree wall plants OUTSIDE the playable ring (cells -1 and N),
    // and the former in-map border ring drops to mid density so playable
    // cells stop being eaten by trees.
    const lo = margin ? -2 : 0, hi = margin ? N + 1 : N - 1;
    for (let x = lo; x <= hi; x++) {
        for (let y = lo; y <= hi; y++) {
            const key = `${x},${y}`;
            const outside = x < 0 || y < 0 || x >= N || y >= N;
            if (outside && !margin) continue;
            const far = x <= -2 || y <= -2 || x >= N + 1 || y >= N + 1;
            const inMapBorder = (x === 0 || y === 0 || x === N - 1 || y === N - 1);
            // GUILD/BASE v4 (owner 2026-10-17): the outside-the-map work moved
            // to isoOutlands (fence + procedural wilds live there now), so an
            // in-map border row calms to MID density instead of walling the
            // playable edge with trees.
            const border = outside;
            const mid = !border && !far && (x === 1 || y === 1 || x === N - 2 || y === N - 2 || (margin && inMapBorder) || inMapBorder);
            if (blocked.has(key) || taken.has(key)) continue;
            const px = isoX(x + 0.5, y + 0.5);
            const py = isoY(x + 0.5, y + 0.5);
            if (far) {
                // far wilderness ring (owner 20:20Z: "improve the
                // environmental ones outside the tree wall") — dark conifers
                // fading toward the backdrop, scattered wild clutter
                if (rnd() < 0.62) out.push({ file: pickWeighted(rnd, FAR_TREES), x: px + jitter(44), y: py + jitter(18) + 6, sc: 0.4 + rnd() * 0.16, ...(haze ? { tint: FAR_TINT } : {}) });
                if (rnd() < 0.12) out.push({ file: pickWeighted(rnd, UNDERSTORY), x: px + jitter(40), y: py + jitter(14) + 8, sc: 0.85, ...(haze ? { tint: FAR_TINT } : {}) });
            } else if (border) {
                if (outside) {
                    // margin wall — reads as forest EDGE, not a suffocating
                    // donut: 1 tree/tile + 45% second, scaled 0.58-0.78 so the
                    // playable map stays readable behind it
                    out.push({ file: pickWeighted(rnd, RING_TREES), x: px + jitter(46), y: py + jitter(16) + 6, sc: 0.58 + rnd() * 0.2, ...(haze ? { tint: WALL_TINT } : {}) });
                    if (rnd() < 0.45) out.push({ file: pickWeighted(rnd, RING_TREES), x: px + jitter(46), y: py + jitter(16) + 6, sc: 0.58 + rnd() * 0.2, ...(haze ? { tint: WALL_TINT } : {}) });
                    if (rnd() < 0.30) out.push({ file: pickWeighted(rnd, UNDERSTORY), x: px + jitter(34), y: py + jitter(12) + 8, ...(haze ? { tint: WALL_TINT } : {}) });
                } else {
                    // dense wall — 2 staggered trees per border tile
                    for (let k = 0; k < 2; k++) {
                        out.push({ file: pickWeighted(rnd, RING_TREES), x: px + jitter(30), y: py + jitter(12) + 6 });
                    }
                    if (rnd() < 0.35) out.push({ file: pickWeighted(rnd, UNDERSTORY), x: px + jitter(26), y: py + jitter(10) + 8 });
                }
            } else if (woods && woods.cellSet.has(key)) {
                // WOODS LAW (v5): fenced hunting woods stay a WOOD — tall
                // trees at the woods rate (never in a structure's front
                // shadow), thick understory floor. Checked BEFORE the mid
                // ring so woods cells at x==1 don't fall to lawn rates.
                const sh = frontShadow.has(key);
                if (!sh && rnd() < (woods.treeRate ?? 0.30)) out.push({ file: pickWeighted(rnd, RING_TREES), x: px + jitter(24), y: py + jitter(10) + 6, sc: 0.9 + rnd() * 0.16 });
                if (rnd() < (woods.underRate ?? 0.30)) out.push({ file: pickWeighted(rnd, UNDERSTORY), x: px + jitter(24), y: py + 8 });
            } else if (mid) {
                // margin mode calms the mid ring so zones/paths stay visible
                const rate = margin ? 0.22 : midRate;
                const sh = frontShadow.has(key);
                if (!sh && rnd() < rate) out.push({ file: pickWeighted(rnd, RING_TREES), x: px + jitter(26), y: py + jitter(10) + 6 });
                if (rnd() < (sh ? 0.10 : 0.18)) out.push({ file: pickWeighted(rnd, UNDERSTORY), x: px + jitter(26), y: py + 8 });
            } else if (hotSet.has(key)) {
                // clearing around the house — trees beside it, never crowding
                // the walls (owner 20:20Z: "houses seem to be on top of the
                // trees") — lower rate, tighter outward jitter
                const sh = frontShadow.has(key);
                if (!sh && rnd() < hotRate) out.push({ file: pickWeighted(rnd, RING_TREES), x: px + jitter(16), y: py + jitter(8) + 4, sc: 0.88 + rnd() * 0.14 });
                if (rnd() < (sh ? 0.12 : 0.25)) out.push({ file: pickWeighted(rnd, UNDERSTORY), x: px + jitter(24), y: py + 6 });
            } else {
                const sh = frontShadow.has(key);
                if (rnd() < (sh ? 0.08 : 0.17)) out.push({ file: pickWeighted(rnd, UNDERSTORY), x: px + jitter(28), y: py + 8 });
            }
        }
    }
    return out;
}

module.exports = { paintBackdrop, islandForest, fenceRing, RING_TREES, UNDERSTORY, FAR_TREES, CLUSTER_POOLS, loadImg, tinted };

// ═══════════════════════════════════════════════════════════════════════
// FENCE RING — pixel palisade placements around the playable diamond
// (owner pre-restart promise: "tree wall comes out, pixel fence ring goes
// in"). Two directional runs connect along the iso diagonals: px_fence_a
// (north/south edges, along +x), px_fence_b (east/west edges, along +y).
// Each placement is bottom-anchored ON the boundary line (y=0 / y=N /
// x=0 / x=N), depth = anchor y so the depth sort slots fences naturally
// between the map content and the wild margin behind them.
// gates: [[x,y]...] BORDER TILE cells whose outward fence segment is left
// open (the walk exits there) — base gate (5,15), guild gate (7,15).
// pad (owner 2026-10-17 "the fence should be further away because the space
// is bigger"): pushes the whole ring OUTWARD by `pad` tiles, so the compound
// encloses a yard ring around the playable map. Gate cells are given in the
// same padded border coordinates (e.g. y = N-1+pad for the south run).
function fenceRing(N, isoX, isoY, gates = [], pad = 0) {
    const out = [];
    const gateSet = new Set(gates.map(([x, y]) => `${x},${y}`));
    const lo = -pad, hiN = N - 1 + pad;
    for (let x = lo; x <= hiN; x++) {
        if (!gateSet.has(`${x},${lo}`)) out.push({ file: 'px_fence_a.png', x: isoX(x + 0.5, lo), y: isoY(x + 0.5, lo) + 4 });
        if (!gateSet.has(`${x},${hiN}`)) out.push({ file: 'px_fence_a.png', x: isoX(x + 0.5, hiN), y: isoY(x + 0.5, hiN) + 4 });
    }
    for (let y = lo; y <= hiN; y++) {
        if (!gateSet.has(`${lo},${y}`)) out.push({ file: 'px_fence_b.png', x: isoX(lo, y + 0.5), y: isoY(lo, y + 0.5) + 4 });
        if (!gateSet.has(`${hiN},${y}`)) out.push({ file: 'px_fence_b.png', x: isoX(hiN, y + 0.5), y: isoY(hiN, y + 0.5) + 4 });
    }
    return out;
}
