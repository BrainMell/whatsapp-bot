// ============================================
// 🗺️ MAP ENGINE — Guild War Overhaul 2026-10-03
// Seeded procedural generation: grid → spanning tree + extra edges → room
// types → spawns. Pure module: generate(seed, playerCount, opts) → map.
// The backend state is the source of truth; images are only representations.
// ============================================

const CFG = require('./config');

// ── seeded PRNG (mulberry32) + string hash ──
function hashSeed(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function mulberry32(seedU32) {
    let a = seedU32 >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function makeRng(seedStr) {
    const rng = mulberry32(hashSeed(String(seedStr)));
    return {
        next: rng,
        int: (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1)),
        pick: (arr) => arr[Math.floor(rng() * arr.length)],
        shuffle: (arr) => {
            const a = arr.slice();
            for (let i = a.length - 1; i > 0; i--) {
                const j = Math.floor(rng() * (i + 1));
                [a[i], a[j]] = [a[j], a[i]];
            }
            return a;
        },
        weighted: (entries) => { // [[value, weight], ...]
            const total = entries.reduce((s, e) => s + e[1], 0);
            let roll = rng() * total;
            for (const [v, w] of entries) {
                roll -= w;
                if (roll <= 0) return v;
            }
            return entries[entries.length - 1][0];
        },
    };
}

const DIRS = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const DIR_OPS = { n: 's', s: 'n', e: 'w', w: 'e' };
const key = (x, y) => `${x},${y}`;

// ── generation ──
// Returns { side, rooms: Map(key→room), adjacency: Map(key→{n,s,e,w:bool}),
//           spawns: [key], coreKey, regions: [{x0,x1,worldId}] }
function generate(seed, playerCount, opts = {}) {
    const alignment = !!opts.alignment;
    const cfg = alignment ? {
        k: CFG.MAP.K_ALIGNMENT,
        min: CFG.MAP.SIDE_MIN_ALIGNMENT,
        max: CFG.MAP.SIDE_MAX_ALIGNMENT,
        types: CFG.MAP.TYPES_ALIGNMENT,
        regions: Math.max(1, Math.min(CFG.MAP.REGIONS_ALIGNMENT, opts.regions || CFG.MAP.REGIONS_ALIGNMENT)),
    } : {
        k: CFG.MAP.K_NORMAL,
        min: CFG.MAP.SIDE_MIN,
        max: CFG.MAP.SIDE_MAX,
        types: CFG.MAP.TYPES,
        regions: 1,
    };
    const side = Math.max(cfg.min, Math.min(cfg.max, Math.ceil(Math.sqrt(Math.max(1, playerCount) * cfg.k))));
    const rng = makeRng(seed);

    // region bands (vertical slices) — alignment themes each band by a world
    const bandWidth = Math.floor(side / cfg.regions);
    const regions = [];
    for (let r = 0; r < cfg.regions; r++) {
        regions.push({
            index: r,
            x0: r * bandWidth,
            x1: r === cfg.regions - 1 ? side - 1 : (r + 1) * bandWidth - 1,
            worldId: opts.worldIds ? opts.worldIds[r % opts.worldIds.length] : null,
        });
    }
    const regionOf = (x) => regions.find((r) => x >= r.x0 && x <= r.x1) || regions[regions.length - 1];

    // ── topology: randomized DFS spanning tree over 4-neighbors ──
    const adj = new Map();
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) adj.set(key(x, y), { n: false, s: false, e: false, w: false });
    const visited = new Set([key(0, 0)]);
    const stack = [[0, 0]];
    while (stack.length) {
        const [cx, cy] = stack[stack.length - 1];
        const options = [];
        for (const [d, [dx, dy]] of Object.entries(DIRS)) {
            const nx = cx + dx, ny = cy + dy;
            if (nx >= 0 && ny >= 0 && nx < side && ny < side && !visited.has(key(nx, ny))) options.push([d, nx, ny]);
        }
        if (!options.length) { stack.pop(); continue; }
        const [d, nx, ny] = rng.pick(options);
        adj.get(key(cx, cy))[d] = true;
        adj.get(key(nx, ny))[DIR_OPS[d]] = true;
        visited.add(key(nx, ny));
        stack.push([nx, ny]);
    }

    // ── extra edges (loops) ──
    const extraEdges = Math.floor(side * side * CFG.MAP.EXTRA_EDGE_RATIO);
    for (let i = 0; i < extraEdges; i++) {
        const x = rng.int(0, side - 1), y = rng.int(0, side - 1);
        const d = rng.pick(Object.keys(DIRS));
        const [dx, dy] = DIRS[d];
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= side || ny >= side) continue;
        // cross-region edges are rarer: dimensional paths added later instead
        if (cfg.regions > 1 && regionOf(x).index !== regionOf(nx).index && rng.next() < 0.7) continue;
        adj.get(key(x, y))[d] = true;
        adj.get(key(nx, ny))[DIR_OPS[d]] = true;
    }

    // ── room types (distance-from-center modulates danger/reward tier) ──
    const c = (side - 1) / 2;
    const maxDist = Math.hypot(c, c) || 1;
    const typeEntries = Object.entries(cfg.types).map(([t, w]) => [t, w]);
    const rooms = new Map();
    for (let y = 0; y < side; y++) {
        for (let x = 0; x < side; x++) {
            const k = key(x, y);
            const distFrac = Math.hypot(x - c, y - c) / maxDist; // 0 center → 1 corner
            let type = rng.weighted(typeEntries);
            if (rng.next() < CFG.MAP.EMPTY_RATIO) type = 'empty';
            const room = {
                key: k, x, y,
                region: regionOf(x).index,
                type,
                state: 'UNEXPLORED',
                payload: {},
                ring: Math.round(distFrac * 10) / 10, // 0..1, danger/reward tier input
                clearedBy: null, clearedByGuild: null, clearedAt: null,
                occupants: [],
                residue: null,
            };
            rooms.set(k, room);
        }
    }

    // ── World Core at center (overwrite) ──
    const coreX = Math.floor(side / 2), coreY = Math.floor(side / 2);
    const coreKey = key(coreX, coreY);
    const core = rooms.get(coreKey);
    core.type = 'core';
    core.ring = 1;

    // landmarks: a few named points spread out (lore anchors)
    const landmarkCandidates = rng.shuffle([...rooms.values()].filter((r) => r.type !== 'core'));
    const landmarkCount = Math.max(1, Math.floor(side / 8));
    for (let i = 0; i < landmarkCount && i < landmarkCandidates.length; i++) {
        const r = landmarkCandidates[i];
        r.type = 'landmark';
        r.ring = Math.max(r.ring, 0.5);
    }

    // ── spawns: even ring walk (guaranteed min spacing = perimeter/count),
    // then players are SHUFFLED onto spawn slots at event start so same-guild
    // players are not adjacent. Min pairwise Manhattan distance is capped by
    // what the ring can physically fit at high player counts.
    const baseDist = Math.max(2, Math.floor(side * CFG.MAP.SPAWN_MIN_DIST_FRAC));
    const targetCount = Math.min(playerCount, 150);
    const feasible = Math.max(1, Math.floor((4 * (side - 1)) / Math.max(1, targetCount - 1)));
    const minDist = Math.min(baseDist, feasible);
    const perimeter = [];
    for (let x = 0; x < side - 1; x++) perimeter.push([x, 0]);
    for (let y = 0; y < side - 1; y++) perimeter.push([side - 1, y]);
    for (let x = side - 1; x > 0; x--) perimeter.push([x, side - 1]);
    for (let y = side - 1; y > 0; y--) perimeter.push([0, y]);
    const spawns = [];
    const count = Math.min(targetCount, perimeter.length);
    const gap = perimeter.length / count;
    const rot = rng.int(0, perimeter.length - 1); // seed variety, spacing preserved
    for (let i = 0; i < count; i++) {
        const [x, y] = perimeter[(rot + Math.floor(i * gap)) % perimeter.length];
        const r = rooms.get(key(x, y));
        if (r && r.type !== 'core') spawns.push(r.key);
    }

    return {
        side,
        rooms,               // Map key → room record (backend source of truth)
        adjacency: adj,      // Map key → {n,s,e,w}
        spawns,
        coreKey,
        regions,
        alignment,
        seed,
    };
}

// ── BFS connectivity check (sim/QA) ──
function reachable(map, from) {
    const seen = new Set([from]);
    const q = [from];
    while (q.length) {
        const k = q.pop();
        for (const [d, open] of Object.entries(map.adjacency.get(k))) {
            if (!open) continue;
            const [x, y] = k.split(',').map(Number);
            const [dx, dy] = DIRS[d];
            const nk = key(x + dx, y + dy);
            if (!seen.has(nk)) { seen.add(nk); q.push(nk); }
        }
    }
    return seen;
}

// move from (x,y) in direction d if edge exists → new key or null
function step(map, fromKey, d) {
    const dir = d[0]; // accept 'north'/'n'
    const D = DIRS[dir];
    if (!D || !map.adjacency.get(fromKey)?.[dir]) return null;
    const [x, y] = fromKey.split(',').map(Number);
    return key(x + D[0], y + D[1]);
}

// fog reveal: 8-neighborhood around a room
function revealAround(map, roomKey) {
    const [x, y] = roomKey.split(',').map(Number);
    const out = [roomKey];
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < map.side && ny < map.side) out.push(key(nx, ny));
        }
    }
    return out;
}

// blink pathfind: shortest path (BFS) from→to limited to discovered rooms, ≤ maxRooms steps
function blinkPath(map, discoveredSet, fromKey, toKey, maxRooms) {
    if (!discoveredSet.has(toKey) && toKey !== fromKey) return null;
    const prev = new Map([[fromKey, null]]);
    const q = [fromKey];
    while (q.length) {
        const k = q.shift();
        if (k === toKey) {
            const path = [];
            let cur = toKey;
            while (cur) { path.unshift(cur); cur = prev.get(cur); }
            return path.length - 1 <= maxRooms ? path : null;
        }
        for (const [d, open] of Object.entries(map.adjacency.get(k))) {
            if (!open) continue;
            const [x, y] = k.split(',').map(Number);
            const [dx, dy] = DIRS[d];
            const nk = key(x + dx, y + dy);
            if (!prev.has(nk) && discoveredSet.has(nk)) { prev.set(nk, k); q.push(nk); }
        }
    }
    return null;
}

// quadrant of a room (for the L3 enemy-carrier ping)
function quadrant(map, roomKey) {
    const [x, y] = roomKey.split(',').map(Number);
    const mid = (map.side - 1) / 2;
    const ns = y <= mid ? 'north' : 'south';
    const ew = x <= mid ? 'west' : 'east';
    return `${ns}-${ew}`;
}

module.exports = {
    makeRng, hashSeed,
    DIRS, DIR_OPS, key,
    generate, reachable, step, revealAround, blinkPath, quadrant,
};
