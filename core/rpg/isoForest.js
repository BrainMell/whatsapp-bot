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
        const x0 = 140 + i * 330;
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
//           hot:[[x,y]...], plotCells:Set("x,y") }
// Returns [{ file, x, y }] art-px placements (bottom-anchored draw law):
//   - border ring (x/y on 0 or N-1): 2 trees per tile, dense wall
//   - second ring: 1 tree @ 45%
//   - hot cells (around the player house): clearing trees @ 55%
//   - every other free tile: understory clutter @ 24%
// ═══════════════════════════════════════════════════════════════════════════
function islandForest(opts) {
    const { seed, N, isoX, isoY, occupied, paths = [], hot = [], plotCells, margin } = opts;
    const pathSet = new Set(paths.map(([x, y]) => `${x},${y}`));
    const hotSet = new Set(hot.map(([x, y]) => `${x},${y}`));
    const blocked = new Set([...(occupied || []), ...pathSet, ...(plotCells || [])]);
    const rnd = mulberry32(hashStr(seed ^ 0x6d2b79f5));
    const out = [];
    const jitter = (m) => (rnd() - 0.5) * m;

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
            const border = outside || (!margin && inMapBorder);
            const mid = !border && !far && (x === 1 || y === 1 || x === N - 2 || y === N - 2 || (margin && inMapBorder));
            if (blocked.has(key)) continue;
            const px = isoX(x + 0.5, y + 0.5);
            const py = isoY(x + 0.5, y + 0.5);
            if (far) {
                // far wilderness ring (owner 20:20Z: "improve the
                // environmental ones outside the tree wall") — dark conifers
                // fading toward the backdrop, scattered wild clutter
                if (rnd() < 0.55) out.push({ file: pickWeighted(rnd, FAR_TREES), x: px + jitter(56), y: py + jitter(18) + 6, sc: 0.4 + rnd() * 0.16 });
                if (rnd() < 0.10) out.push({ file: pickWeighted(rnd, UNDERSTORY), x: px + jitter(40), y: py + jitter(14) + 8, sc: 0.85 });
            } else if (border) {
                if (outside) {
                    // margin wall — reads as forest EDGE, not a suffocating
                    // donut: 1 tree/tile + 45% second, scaled 0.58-0.78 so the
                    // playable map stays readable behind it
                    out.push({ file: pickWeighted(rnd, RING_TREES), x: px + jitter(46), y: py + jitter(16) + 6, sc: 0.58 + rnd() * 0.2 });
                    if (rnd() < 0.45) out.push({ file: pickWeighted(rnd, RING_TREES), x: px + jitter(46), y: py + jitter(16) + 6, sc: 0.58 + rnd() * 0.2 });
                    if (rnd() < 0.30) out.push({ file: pickWeighted(rnd, UNDERSTORY), x: px + jitter(34), y: py + jitter(12) + 8 });
                } else {
                    // dense wall — 2 staggered trees per border tile
                    for (let k = 0; k < 2; k++) {
                        out.push({ file: pickWeighted(rnd, RING_TREES), x: px + jitter(30), y: py + jitter(12) + 6 });
                    }
                    if (rnd() < 0.35) out.push({ file: pickWeighted(rnd, UNDERSTORY), x: px + jitter(26), y: py + jitter(10) + 8 });
                }
            } else if (mid) {
                // margin mode calms the mid ring so zones/paths stay visible
                const rate = margin ? 0.22 : 0.45;
                if (rnd() < rate) out.push({ file: pickWeighted(rnd, RING_TREES), x: px + jitter(26), y: py + jitter(10) + 6 });
                if (rnd() < 0.30) out.push({ file: pickWeighted(rnd, UNDERSTORY), x: px + jitter(26), y: py + 8 });
            } else if (hotSet.has(key)) {
                // clearing around the house — trees beside it, never crowding
                // the walls (owner 20:20Z: "houses seem to be on top of the
                // trees") — lower rate, tighter outward jitter
                if (rnd() < 0.42) out.push({ file: pickWeighted(rnd, RING_TREES), x: px + jitter(16), y: py + jitter(8) + 4, sc: 0.88 + rnd() * 0.14 });
                if (rnd() < 0.40) out.push({ file: pickWeighted(rnd, UNDERSTORY), x: px + jitter(24), y: py + 6 });
            } else {
                if (rnd() < 0.17) out.push({ file: pickWeighted(rnd, UNDERSTORY), x: px + jitter(28), y: py + 8 });
            }
        }
    }
    return out;
}

module.exports = { paintBackdrop, islandForest, RING_TREES, UNDERSTORY, FAR_TREES, loadImg };
