'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// WILDS — the procedural world OUTSIDE the fence (owner 2026-10-16 23:18Z:
// "the world outside the fence should be procedurally generated and should
// stick to that for that player, read on it and set the rules ... use rocks
// and mountain assets that fit, maybe some will have a small part that
// connects to an ocean on screen").
//
// ── THE RULES ──────────────────────────────────────────────────────────────
// 1. IDENTITY SEED. seed = hashStr(key + '::wilds'). The wilds are a PURE
//    function of the owner's identity (player key for bases, guild key for
//    grounds). No storage, no drift: every render regenerates the exact same
//    world, so the view "sticks to that player" forever.
// 2. BIOME ROLL. One roll from the seed picks the surrounding country:
//      0.00-0.45  DEEPWOOD   — thick conifer wilds (the classic look)
//      0.45-0.70  HIGHLANDS  — boulder fields, rock-tile ground, cliff
//                               shelves, big mountain backdrop
//      0.70-0.88  MOSSY VALE — open glades, meadow patches, scattered stones
//      0.88-1.00  COAST      — one far side of the map falls away to open
//                              sea: shoreline foam, a beached rowboat, gulls
// 3. OCEAN LAW. On COAST the sea claims the far band (2+ tiles out) of ONE
//    upper edge (NW or NE), with a wavy value-noise shoreline. The gate
//    corridor never opens into the sea — if the rolled edge would flood the
//    gate walk, the other edge is used. Water tiles replace moss in the
//    flooded band; nothing plants there.
// 4. VALUE NOISE. Two-octave value noise over the margin grid drives forest
//    density (thickets vs glades) and wiggles the shoreline.
// 5. LANDMARKS. 0-2 per map, seeded from a small pool: standing-stone
//    circle, ruined tower, grand oak, cliff shelf, boulder ring. Placed in
//    the margin band, at least 4 tiles from the gate corridor, never in the
//    sea. These make one player's wilds recognisably THEIRS.
// 6. MOUNTAINS. Big hazed peak groups on the horizon band of every biome
//    (coast gets one headland instead). Farther = smaller + darker tint.
// 7. EXCLUSIONS. The gate approach corridor stays clear of landmarks and
//    mountains. Nothing inside the fence is touched — this module only
//    ever speaks about the outside.
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

// lattice value noise — smooth, seeded, deterministic
function makeNoise(seed) {
    const lat = (ix, iy) => {
        let h = seed ^ 0x9e3779b9;
        h = Math.imul(h ^ (ix + 0x7f4a7c15), 0x85ebca6b);
        h = Math.imul(h ^ (iy + 0x165667b1), 0xc2b2ae35);
        h ^= h >>> 13;
        return ((h >>> 0) % 10000) / 10000;
    };
    const sm = (t) => t * t * (3 - 2 * t);
    return function noise(x, y) {
        const ix = Math.floor(x), iy = Math.floor(y);
        const fx = sm(x - ix), fy = sm(y - iy);
        const a = lat(ix, iy), b = lat(ix + 1, iy), c = lat(ix, iy + 1), d = lat(ix + 1, iy + 1);
        return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
}

const BIOMES = ['deepwood', 'highlands', 'vale', 'coast'];

// ═══════════════════════════════════════════════════════════════════════════
// PROFILE — one per player/guild, forever
// ═══════════════════════════════════════════════════════════════════════════
function wildsProfile(key) {
    const seed = hashStr(String(key || 'base') + '::wilds');
    const rnd = mulberry32(seed);
    const r0 = rnd();
    const biome = r0 < 0.45 ? 'deepwood' : r0 < 0.70 ? 'highlands' : r0 < 0.88 ? 'vale' : 'coast';
    const noise = makeNoise(seed ^ 0x51ed270b);

    // coast: choose the far edge (NW = x<0 band, NE = y<0 band); shore is a
    // noisy diagonal across that band
    let ocean = null;
    if (biome === 'coast') {
        // edge preference is seeded; shorePos anchors the diagonal
        const first = rnd() < 0.5 ? 'NW' : 'NE';
        const second = first === 'NW' ? 'NE' : 'NW';
        const shoreAnchor = 0.35 + rnd() * 0.4;
        ocean = { edge: first, alt: second, shoreAnchor, seed: seed ^ 0x2f8b7a11 };
    }

    // mountains: 1-2 horizon groups (coast: single headland)
    const mtnCount = biome === 'coast' ? 1 : (rnd() < 0.5 ? 2 : 1);
    const mountains = [];
    for (let i = 0; i < mtnCount; i++) {
        mountains.push({
            t: 0.12 + rnd() * 0.72,          // position along the horizon (0..1)
            side: rnd() < 0.5 ? 'NW' : 'NE', // which upper edge it hugs
            big: biome === 'highlands' || rnd() < 0.4,
            far: rnd() < 0.45,
        });
    }

    // landmarks: 0-2, never near the gate corridor (checked at placement)
    const landmarkPool = ['stones', 'ruin', 'bigtree', 'boulders', biome === 'highlands' ? 'cliffshelf' : 'meadow'];
    const landmarks = [];
    const nLm = rnd() < 0.30 ? 0 : (rnd() < 0.72 ? 1 : 2);
    for (let i = 0; i < nLm; i++) {
        landmarks.push({
            kind: landmarkPool[Math.floor(rnd() * landmarkPool.length)],
            side: rnd() < 0.5 ? 'NW' : 'NE',     // which upper margin band
            t: 0.2 + rnd() * 0.6,                // position along that band
            s: 0.85 + rnd() * 0.4,
        });
    }

    return { key: String(key || 'base'), seed, biome, noise, ocean, mountains, landmarks, rnd: mulberry32(seed ^ 0x77aa11) };
}

// cells claimed by the sea (margin coords). THE RULE (simplified shoreline):
// the sea is a wavy band 2-5 tiles out along ONE upper edge, pinching out
// before the map's lower corner — "a small part that connects to an ocean
// on screen", never a full flood.
function seaCells(prof, N, M) {
    const out = new Set();
    if (!prof.ocean) return out;
    const { edge, shoreAnchor } = prof.ocean;
    const nz = makeNoise(prof.ocean.seed);
    const phase = (shoreAnchor * 40) | 0;
    // wave(y): shoreline distance from the fence, 1.5..4.5 tiles, wavy
    const wave = (u) => Math.max(-0.4,
        1.6 * Math.sin(u * 0.30 + phase) + 1.5 * nz(u * 0.45, 3.7) - 0.4);
    for (let x = -M; x < N + M; x++) {
        for (let y = -M; y < N + M; y++) {
            const inside = x >= 0 && y >= 0 && x < N && y < N;
            if (inside) continue;
            if (edge === 'NW') {
                if (x >= 0) continue;
                // taper: sea pinches out toward the map's south-west corner
                const taper = y > N * 0.78 ? (y - N * 0.78) * 1.8 : 0;
                const shore = 2 + wave(y) + taper;
                if (-x < shore) continue;
            } else {
                if (y >= 0) continue;
                const taper = x > N * 0.78 ? (x - N * 0.78) * 1.8 : 0;
                const shore = 2 + wave(x) + taper;
                if (-y < shore) continue;
            }
            out.add(`${x},${y}`);
            // wet shoreline ring (1 cell toward the fence)
            const rx = edge === 'NW' ? x + 1 : x;
            const ry = edge === 'NE' ? y + 1 : y;
            out.add(`?${rx},${ry}`);
        }
    }
    return out;
}

// true if margin cell (x,y) is sea or the 1-cell shoreline ring
function isSeaLike(seaSet, x, y) {
    return seaSet.has(`${x},${y}`) || seaSet.has(`?${x},${y}`);
}

// margin terrain override — renderers call this for every outside tile
// baseRoll is the renderer's own wild roll (string tile name it would use)
function marginTile(prof, x, y, N, baseRoll, seaSet) {
    if (prof.ocean && seaSet) {
        if (seaSet.has(`${x},${y}`)) return 'forest_water_0.png';   // open sea
        if (seaSet.has(`?${x},${y}`)) return 'forest_rock_tile.png'; // stony wet shore
    }
    if (prof.biome === 'highlands') {
        const n = prof.noise(x * 0.31 + 50, y * 0.31 + 50);
        if (n > 0.62) return 'forest_rock_tile.png';
    }
    if (prof.biome === 'vale') {
        const n = prof.noise(x * 0.27 + 90, y * 0.27 + 90);
        if (n < 0.24) return 'forest_moss_c.png';        // bright meadow patches
    }
    return baseRoll;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROPS — mountains, landmarks, coast garnish (all OUTSIDE the fence)
// gate: [gx, gy] the fence gate tile (corridor stays clear)
// ═══════════════════════════════════════════════════════════════════════════
function wildProps(prof, N, M, isoX, isoY, gate, seaSet) {
    const out = [];
    const jit = (m) => (prof.rnd() - 0.5) * m;

    // gate corridor: outward diagonal cells from the gate tile
    const corridor = new Set();
    if (gate) {
        const [gx, gy] = gate;
        const ox = gx < N / 2 ? -1 : gx > N / 2 ? 1 : 0;   // outward x dir
        const oy = gy < N / 2 ? -1 : gy > N / 2 ? 1 : 0;
        for (let k = 1; k <= 5; k++) {
            for (let w = -2; w <= 2; w++) {
                corridor.add(`${gx + ox * k + w},${gy + oy * k}`);
                corridor.add(`${gx + ox * k},${gy + oy * k + w}`);
            }
        }
    }
    const nearGate = (x, y, pad = 1) => {
        for (let dx = -pad; dx <= pad; dx++) for (let dy = -pad; dy <= pad; dy++) {
            if (corridor.has(`${x + dx},${y + dy}`)) return true;
        }
        return false;
    };

    // ── mountains on the HORIZON ──
    // Screen-anchored: peaks hug the upper diamond edges (behind the far
    // wild ring, above the treeline), bottom-anchored so the depth sort
    // naturally slots them behind every margin tree. Tints are muted
    // blue-green haze so they read as distant range, never foreground.
    const OX0 = isoX(0, 0), OY0 = isoY(0, 0);   // the diamond's top corner
    for (const m of prof.mountains) {
        const dir = m.side === 'NW' ? -1 : 1;
        const px = OX0 + dir * (110 + m.t * 420) + jit(46);
        const py = OY0 + 50 + prof.rnd() * 30 + jit(8);   // keep peaks on-canvas
        out.push({
            file: m.big ? 'px_mountain_b.png' : 'px_mountain_a.png',
            x: px, y: py,
            sc: m.far ? 1.0 : 1.35,
            tint: m.far ? '#46654c' : '#55755a',      // hazy blue-green range
        });
        // shoulder peak — pairs read as a RANGE, single sprites read as rocks
        if (prof.rnd() < 0.85) {
            out.push({
                file: m.big ? 'px_mountain_a.png' : 'px_mountain_b.png',
                x: px + dir * (100 + prof.rnd() * 50), y: py + 16 + jit(10),
                sc: m.far ? 0.72 : 0.95,
                tint: m.far ? '#46654c' : '#4d6d52',
            });
        }
    }

    // ── landmarks ──
    for (const lm of prof.landmarks) {
        // place in the upper margin band of its side, t along the edge
        let lx, ly;
        const band = -2 - Math.floor(prof.rnd() * 2);
        if (lm.side === 'NW') { lx = band; ly = Math.round(lm.t * N); }
        else { ly = band; lx = Math.round(N - 1 - lm.t * N); }
        if (nearGate(lx, ly, 2)) continue;
        if (prof.ocean && isSeaLike(seaSet, lx, ly)) continue;
        const px = isoX(lx + 0.5, ly + 0.5), py = isoY(lx + 0.5, ly + 0.5);
        if (lm.kind === 'stones') {
            // small henge: 3 standing stones + 1 fallen
            for (const [dx, dy, sc] of [[-0.55, 0.1, lm.s], [0.5, -0.15, lm.s * 0.92], [0.05, 0.55, lm.s * 0.8]]) {
                out.push({ file: 'px_stone.png', x: px + dx * 64 + (dx + dy) * 16, y: py + dy * 32 + (dx + dy) * 8, sc, tint: '#31491d' });
            }
        } else if (lm.kind === 'ruin') {
            out.push({ file: 'px_ruin.png', x: px + jit(20), y: py + jit(10), sc: lm.s * 1.15, tint: '#31491d' });
            if (prof.rnd() < 0.7) out.push({ file: 'px_rock.png', x: px + 60 + jit(16), y: py + 12 + jit(8), tint: '#31491d' });
        } else if (lm.kind === 'bigtree') {
            out.push({ file: 'px_bigtree.png', x: px + jit(20), y: py + jit(10), sc: lm.s, tint: '#31491d' });
            for (let i = 0; i < 2; i++) out.push({ file: prof.rnd() < 0.5 ? 'px_shroom.png' : 'px_fern.png', x: px + (prof.rnd() - 0.5) * 110, y: py + (prof.rnd() - 0.2) * 40, tint: '#31491d' });
        } else if (lm.kind === 'boulders') {
            for (let i = 0; i < 4; i++) {
                const a = prof.rnd() * Math.PI * 2, r = 20 + prof.rnd() * 55;
                out.push({ file: prof.rnd() < 0.45 ? 'px_boulder.png' : 'px_cliff.png', x: px + Math.cos(a) * r, y: py + Math.sin(a) * r * 0.5, sc: (0.8 + prof.rnd() * 0.5) * lm.s, tint: '#31491d' });
            }
        } else if (lm.kind === 'cliffshelf') {
            out.push({ file: 'px_cliff.png', x: px, y: py, sc: lm.s * 1.5, tint: '#31491d' });
            out.push({ file: 'px_cliff.png', x: px + 74, y: py + 14, sc: lm.s * 1.05, tint: '#31491d' });
        } else { // meadow glade
            for (let i = 0; i < 5; i++) {
                out.push({ file: prof.rnd() < 0.5 ? 'px_tuft.png' : 'px_bush_a.png', x: px + (prof.rnd() - 0.5) * 150, y: py + (prof.rnd() - 0.4) * 50, tint: '#31491d' });
            }
        }
    }

    // ── highlands: boulder scree drifts through the margin band ──
    if (prof.biome === 'highlands') {
        const n = Math.floor(N * N * 0.05);
        for (let i = 0; i < n; i++) {
            const side = prof.rnd();
            let lx, ly;
            if (side < 0.4) { lx = -2 - Math.floor(prof.rnd() * 3); ly = Math.floor(prof.rnd() * N); }
            else if (side < 0.8) { ly = -2 - Math.floor(prof.rnd() * 3); lx = Math.floor(prof.rnd() * N); }
            else { lx = N + 1 + Math.floor(prof.rnd() * 2); ly = Math.floor(prof.rnd() * N); }
            if (nearGate(lx, ly, 1)) continue;
            const px = isoX(lx + 0.5, ly + 0.5), py = isoY(lx + 0.5, ly + 0.5);
            out.push({ file: prof.rnd() < 0.5 ? 'px_boulder.png' : 'px_rock.png', x: px + jit(40), y: py + jit(16), sc: 0.9 + prof.rnd() * 0.6, tint: '#2c431b' });
        }
    }

    // ── coast: beached boat on the shoreline + far sail ──
    if (prof.ocean && seaSet && seaSet.size) {
        // shoreline cells ('?' ring) on the flooded edge, away from the gate
        const shore = [];
        for (const k of seaSet) {
            if (!k.startsWith('?')) continue;
            const [x, y] = k.slice(1).split(',').map(Number);
            if (x < -8 || y < -8 || x >= N + 3 || y >= N + 3) continue;
            if (nearGate(x, y, 2)) continue;
            shore.push([x, y]);
        }
        if (shore.length) {
            shore.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
            const [bx, by] = shore[Math.floor(shore.length * 0.55)];
            const px = isoX(bx + 0.5, by + 0.5), py = isoY(bx + 0.5, by + 0.5);
            out.push({ file: 'px_boat.png', x: px + jit(24), y: py + jit(12) + 6, sc: 1.2, tint: '#3a5524' });
            // distant sail out on the water
            const [sx, sy] = shore[Math.floor(shore.length * 0.12)];
            out.push({ file: 'px_boat.png', x: isoX(sx + 0.5, sy + 0.5) - 40, y: isoY(sx + 0.5, sy + 0.5) + 4, sc: 0.55, tint: '#39543c' });
        }
    }

    return out;
}

module.exports = { wildsProfile, seaCells, marginTile, wildProps, mulberry32, hashStr, makeNoise };
