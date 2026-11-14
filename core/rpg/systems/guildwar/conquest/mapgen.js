'use strict';
// 🗺️ CONQUEST MAP GENERATOR — seeded, deterministic, static. Same seed => same 1500-tile world on
// every instance, so the DB only stores OVERLAYS (owner/defences/vein remaining), never the map.
const { CFG } = require('./config');
const continents = require('../../world/continents');

function mulberry32(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

const W = CFG.PROV_COLS * CFG.PROV_SIZE, H = CFG.PROV_ROWS * CFG.PROV_SIZE;

// ── tile kinds: how they are claimed, what they yield ──────────────────────────────────────────
const KINDS = {
    plain:     { label: 'Open Ground',     claim: 'skirmish', gp: 1, sup: 1, gem: 0, glyph: '·' },
    village:   { label: 'Village',         claim: 'skirmish', gp: 1, sup: 4, gem: 0, glyph: '⌂' },
    forest:    { label: 'Deep Wood',       claim: 'skirmish', gp: 1, sup: 2, gem: 0, glyph: '♣' },
    pass:      { label: 'Mountain Pass',   claim: 'siege',    gp: 2, sup: 0, gem: 0, glyph: '⛰' },
    ruins:     { label: 'Ancient Ruins',   claim: 'ritual',   gp: 3, sup: 1, gem: 0, glyph: '𓉸' },
    shrine:    { label: 'Neutral Shrine',  claim: 'treaty',   gp: 2, sup: 1, gem: 0, glyph: '☥' },
    gem_vein:  { label: 'Aether Vein',     claim: 'skirmish', gp: 1, sup: 0, gem: 1, glyph: '◆' },
    fortress:  { label: 'Fortress',        claim: 'siege',    gp: 4, sup: 2, gem: 0, glyph: '♜' },
    ley_gate:  { label: 'Ley Gate',        claim: 'siege',    gp: 2, sup: 0, gem: 0, glyph: '⌖' },
    titan:     { label: "Titan's Lair",    claim: 'titan',    gp: 8, sup: 3, gem: 0, glyph: '☠' },
    keep:      { label: 'Guild Keep',      claim: 'siege',    gp: 5, sup: 6, gem: 0, glyph: '♚' },
};

// scenery per biome x kind — flavour used by renderer + breach card art keys
const SCENERY = {
    isle: {
        plain: ['Salt Meadow', 'Driftwood Flats', 'Gull Shingle', 'Kelp Shallows'], village: ['Fishing Hamlet', 'Lantern Quay', 'Net-Menders\' Row'],
        forest: ['Windbent Pines', 'Mangrove Maze'], pass: ['Thunder Strait', 'Cliffside Causeway'], ruins: ['Sunken Chapel', 'Drowned Lighthouse'],
        shrine: ['Tide Shrine', 'Pearl Altar'], gem_vein: ['Abyssal Seam', 'Brinestone Vein'], fortress: ['Storm Bastion', 'Harbour Citadel'],
        ley_gate: ['Tidal Gate', 'Whirlpool Arch'], titan: ['Leviathan\'s Maw'], keep: ['Stormheim Keep'],
    },
    desert: {
        plain: ['Glass Dunes', 'Sunbaked Flats', 'Scarab Plain', 'Mirage Basin'], village: ['Oasis Camp', 'Caravanserai', 'Wellkeepers\' Ward'],
        forest: ['Palm Grove', 'Thornbrake'], pass: ['Sun-Split Canyon', 'Bone Gap'], ruins: ['Buried Ziggurat', 'Pharaoh\'s Vault'],
        shrine: ['Sun Shrine', 'Dune Obelisk'], gem_vein: ['Sunstone Seam', 'Amber Vein'], fortress: ['Brass Citadel', 'Mirage Fort'],
        ley_gate: ['Solar Gate', 'Sand-Arch'], titan: ['Colossus Pit'], keep: ['Solheim Keep'],
    },
    tundra: {
        plain: ['Whiteout Steppe', 'Frozen Lake', 'Snowdrift Moor', 'Rime Field'], village: ['Longhouse Camp', 'Ice-Fishers\' Huts', 'Hearth Hollow'],
        forest: ['Frostpine Stand', 'Ghost Birch'], pass: ['Howling Col', 'Glacier Notch'], ruins: ['Frozen Temple', 'Ice-Locked Barrow'],
        shrine: ['Aurora Shrine', 'Wolf Cairn'], gem_vein: ['Glacier Vein', 'Frostglass Seam'], fortress: ['Rime Bulwark', 'Iron-Ice Fort'],
        ley_gate: ['Aurora Gate', 'Frost Arch'], titan: ['Rimeheim Behemoth'], keep: ['Rimeheim Keep'],
    },
    highlands: {
        plain: ['Heather Moor', 'Mossy Down', 'Elk Meadow', 'Fernland'], village: ['Woodcutters\' Rest', 'Hunter\'s Lodge', 'Mill Hamlet'],
        forest: ['Elder Wood', 'Hollow Grove', 'Whispering Thicket'], pass: ['Stag Pass', 'Rootbridge Gap'], ruins: ['Druid Circle', 'Overgrown Abbey'],
        shrine: ['Green Shrine', 'Antler Altar'], gem_vein: ['Emerald Seam', 'Rootstone Vein'], fortress: ['Oakwall Fort', 'Briar Citadel'],
        ley_gate: ['Standing Gate', 'Ring-Arch'], titan: ['Elder Treant Grove'], keep: ['Skogheim Keep'],
    },
    volcanic: {
        plain: ['Basalt Flats', 'Ash Plain', 'Cinder Moor', 'Obsidian Shelf'], village: ['Forge Hamlet', 'Smelters\' Row', 'Ember Camp'],
        forest: ['Charred Wood', 'Smoke Grove'], pass: ['Magma Gap', 'Ember Ridge'], ruins: ['Cinder Temple', 'Slag-Buried Hall'],
        shrine: ['Flame Shrine', 'Ash Idol'], gem_vein: ['Magma Seam', 'Rubystone Vein'], fortress: ['Slag Bastion', 'Cinder Citadel'],
        ley_gate: ['Vent Gate', 'Lava Arch'], titan: ['Ifrit\'s Caldera'], keep: ['Eldheim Keep'],
    },
};

const PROV_NAMES = {
    isle: ['Gullwatch', 'Salt Marshes', 'Thunderhead Cape', 'Pearl Shallows', 'Drowned Steps', 'Squall Reach', 'Anchor Rest', 'Kraken Bight', 'Beacon Isles', 'Mistwater', 'Stormwall', 'Brine Heights'],
    desert: ['Glass Dunes', 'Sunspire', 'Oasis Verge', 'Bone Wastes', 'Scorpion Run', 'Gilded Basin', 'Mirage Reach', 'Tomb Road', 'Dustwind', 'Brass Hills', 'Emir\'s Rest', 'Salt Sea'],
    tundra: ['Whiteout', 'Aurora Fields', 'Wolf Barrows', 'Glacier Teeth', 'Frostmere', 'Long Night', 'Ice Road', 'Rime Downs', 'Mammoth Run', 'Bleak Cairn', 'Snowhearth', 'Hoarfrost'],
    highlands: ['Elder Wood', 'Stag Moor', 'Mossgate', 'Root Hollows', 'Antler Ridge', 'Fernmoor', 'Briarlands', 'Hunter\'s Reach', 'Oakholt', 'Greenfast', 'Heather Deep', 'Whisperwood'],
    volcanic: ['Cinder Flats', 'Magma Gap', 'Ash Plain', 'Forge Reach', 'Obsidian Rim', 'Ember Vale', 'Slag Hills', 'Caldera Edge', 'Smoke Fields', 'Basalt Run', 'Furnace Deep', 'Sulfur Pools'],
};
const PROV_CHARACTER = ['heartland', 'wilds', 'borderland', 'ancient', 'bountiful', 'barren', 'sacred', 'warren', 'frontier', 'highland', 'lowland', 'hollow'];

const realmKeys = () => continents.CONTINENTS.map((c) => c.key);
const tileId = (realm, x, y) => `${realm}:${x},${y}`;
const parse = (id) => { const [realm, xy] = String(id).split(':'); const [x, y] = (xy || '').split(',').map(Number); return { realm, x, y }; };
const provOf = (x, y) => Math.floor(y / CFG.PROV_SIZE) * CFG.PROV_COLS + Math.floor(x / CFG.PROV_SIZE);

const _cache = new Map();
// smooth value noise (2 octaves) → coherent regions of terrain instead of per-tile dice
const lat = (s, ix, iy) => { let h = (s ^ Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const vnoise = (s, x, y) => { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy; const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); const a = lat(s, ix, iy), b = lat(s, ix + 1, iy), c = lat(s, ix, iy + 1), d = lat(s, ix + 1, iy + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
const fbm = (s, x, y, f) => (vnoise(s, x * f, y * f) * 0.65 + vnoise(s + 77, x * f * 2.1, y * f * 2.1) * 0.35);
/** terrain at a grid cell: lake | mountain | hills | forest | marsh | farm | plain */
function terrainAt(seed, key, x, y) {
    const s = (seed ^ hashStr('ter:' + key)) >>> 0; const e = fbm(s, x, y, 0.12), mo = fbm(s ^ 0x9e37, x + 40, y - 25, 0.09), lk = fbm(s ^ 0x51ed, x, y, 0.045);
    if (lk < 0.2 && e < 0.5) return 'lake';
    if (e > 0.74) return 'mountain';
    if (e > 0.65) return 'hills';
    if (mo > 0.62 && e < 0.34) return 'marsh';
    if (mo > 0.6) return 'forest';
    if (mo > 0.4 && e < 0.5) return 'farm';
    return 'plain';
}
const _fit = {};
/** each realm's land bbox on the chart (u*864 x v*1210 px), fitted uniformly into the W x H hex grid (world: x=2*col, z=1.732*row) */
function fitOf(c) {
    if (_fit[c.key]) return _fit[c.key]; let u0 = 9, u1 = -9, v0 = 9, v1 = -9;
    for (let v = 0; v <= 1; v += 0.004) for (let u = 0; u <= 1; u += 0.004) if (continents.landAt(u, v) === c.key) { if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
    const bw = Math.max(1e-3, (u1 - u0) * 864), bh = Math.max(1e-3, (v1 - v0) * 1210); const GW = 2 * W, GH = 1.7320508 * H; const s = Math.min(GW / bw, GH / bh) * 0.97;
    return (_fit[c.key] = { u0, v0, bw, bh, s, ox: (GW - bw * s) / 2, oy: (GH - bh * s) / 2 });
}
function onLand(c, x, y) { const f = fitOf(c); const wx = 2 * (x + 0.5 * (y & 1)) + 1, wz = 1.7320508 * y + 0.9; const u = f.u0 + ((wx - f.ox) / f.s) / 864, v = f.v0 + ((wz - f.oy) / f.s) / 1210; return continents.landAt(u, v) === c.key; }
const isLand = (key, x, y) => { const c = continents.BY_KEY ? continents.BY_KEY[key] : continents.CONTINENTS.find((k) => k.key === key); return !!c && x >= 0 && y >= 0 && x < W && y < H && onLand(c, x, y); };
/** generate(seed) -> { seed, W, H, tiles: Map<id,tile>, realms:[{key,name,biome,provinces:[...]}], titanTiles, vein ids ... } */
function generate(seed) {
    seed = seed >>> 0;
    if (_cache.has(seed)) return _cache.get(seed);
    const tiles = new Map(); const realms = [];
    for (const c of continents.CONTINENTS) {
        const rng = mulberry32(seed ^ hashStr('realm:' + c.key));
        const biome = c.biome; const sc = SCENERY[biome];
        const provinces = [];
        for (let p = 0; p < CFG.PROV_COLS * CFG.PROV_ROWS; p++) {
            provinces.push({ id: `${c.key}#${p}`, index: p, name: PROV_NAMES[biome][p], character: PROV_CHARACTER[(p + Math.floor(rng() * 12)) % 12], col: p % CFG.PROV_COLS, row: Math.floor(p / CFG.PROV_COLS), tiles: [] });
        }
        const pick = (arr) => arr[Math.floor(rng() * arr.length)];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const r = rng(); if (!onLand(c, x, y)) continue; // sea cell: no tile (drawn as water)
            const terrain = terrainAt(seed, c.key, x, y); if (terrain === 'lake') continue; // inland lake: water hex, impassable
            const prov = provinces[provOf(x, y)]; const ch = prov.character;
            let kind = 'plain'; const r3 = rng();
            const vill = terrain === 'farm' ? 0.2 : terrain === 'plain' ? 0.06 : 0.015; const vb = ch === 'bountiful' ? 0.05 : 0;
            if (terrain === 'forest') kind = r < 0.78 ? 'forest' : r < 0.84 ? 'village' : r < 0.9 ? 'ruins' : 'plain';
            else if (r < vill + vb) kind = 'village';
            else if (r3 < 0.035 + (ch === 'ancient' ? 0.04 : 0)) kind = 'ruins';
            else if (r3 < 0.055 + (ch === 'sacred' ? 0.04 : 0)) kind = 'shrine';
            else if (r3 < 0.075 + (ch === 'borderland' || ch === 'frontier' ? 0.02 : 0) && terrain !== 'mountain') kind = 'fortress';
            else if (terrain === 'mountain' && r3 < 0.14) kind = 'pass';
            else if (terrain === 'hills' && r3 < 0.9 && r3 > 0.85) kind = 'pass';
            const id = tileId(c.key, x, y);
            const t = { id, realm: c.key, biome, x, y, terrain, prov: prov.index, provName: prov.name, kind, name: pick(sc[kind]), vein: 0, defaults: null };
            tiles.set(id, t); prov.tiles.push(id);
        }
        // landmarks (all snapped to the nearest LAND tile): 6 guild keeps spread over the realm, ley gates at province junctions, titan lairs, realm gates on the coast
        const land = [...tiles.values()].filter((t) => t.realm === c.key); const taken = new Set();
        const nearest = (gx, gy, ok = () => true) => { let best = null, bd = 1e9; for (const t of land) { if (taken.has(t.id) || !ok(t)) continue; const d = (t.x - gx) ** 2 + (t.y - gy) ** 2; if (d < bd) { bd = d; best = t; } } if (best) taken.add(best.id); return best; };
        const solid = (t, R = 3) => { let seen = new Set([t.id]), fr = [[t.x, t.y]], n = 0, ok = 0; for (let d = 0; d < R; d++) { const nx = []; for (const [x, y] of fr) for (let k = 0; k < 6; k++) { const [a, b2] = hexNb(x, y, k); const id = tileId(c.key, a, b2); if (seen.has(id)) continue; seen.add(id); n++; if (tiles.has(id)) { ok++; nx.push([a, b2]); } } fr = nx; } return ok >= n * 0.95; };
        const kx = [0.2, 0.8, 0.2, 0.8, 0.5, 0.5], ky = [0.18, 0.18, 0.82, 0.82, 0.62, 0.2];
        kx.forEach((fx, i) => { const t = nearest(fx * W, ky[i] * H, (q) => solid(q, 4) && (q.terrain === 'plain' || q.terrain === 'farm')); if (t) { t.kind = 'keep'; t.name = sc.keep[0]; } });
        for (let py = 1; py < CFG.PROV_ROWS; py++) for (let px = 1; px < CFG.PROV_COLS; px++) { const t = nearest(px * CFG.PROV_SIZE, py * CFG.PROV_SIZE); if (t && t.kind !== 'keep') { t.kind = 'ley_gate'; t.name = pick(sc.ley_gate); } }
        for (const [fx, fy] of [[0.5, 0.5], [0.3, 0.45], [0.7, 0.45]]) { const tt = nearest(fx * W, fy * H, (q) => solid(q, 3) && q.terrain !== 'mountain'); if (tt) { tt.kind = 'titan'; tt.name = sc.titan[0]; tt.titan = true; } }
        // realm gates: the west-/east-most land tile of every 6th row (the ring that links realm i to i+1)
        for (let yy = 4; yy < H - 3; yy += 6) { const row = land.filter((t) => t.y === yy); if (!row.length) continue; row.sort((a, b2) => a.x - b2.x); for (const t of [row[0], row[row.length - 1]]) if (t.kind !== 'keep' && t.kind !== 'titan') { t.kind = 'pass'; t.name = 'Realm Gate ' + (t === row[0] ? '(west)' : '(east)'); t.bridge = true; t.bridgeSide = t === row[0] ? 'w' : 'e'; } }
        // gem veins: scarce — 3% of tiles, clustered 1-4 tiles ("entire veins")
        const nVeins = Math.round(land.length * 0.03 / 2.4);
        for (let v = 0; v < nVeins; v++) {
            const lt = land[Math.floor(rng() * land.length)]; if (!lt) break; const cx = lt.x, cy = lt.y;
            const len = 1 + Math.floor(rng() * 4); let x = cx, y = cy;
            for (let i = 0; i < len; i++) {
                const t = tiles.get(tileId(c.key, x, y));
                if (t && ['plain', 'forest', 'village', 'pass'].includes(t.kind) && !t.bridge) { t.kind = 'gem_vein'; t.name = pick(sc.gem_vein); t.vein = Math.round(CFG.GEM_VEIN_SUPPLY[0] + rng() * (CFG.GEM_VEIN_SUPPLY[1] - CFG.GEM_VEIN_SUPPLY[0])); }
                if (rng() < 0.5) x = Math.max(1, Math.min(W - 2, x + (rng() < 0.5 ? -1 : 1))); else y = Math.max(1, Math.min(H - 2, y + (rng() < 0.5 ? -1 : 1)));
            }
        }
        for (const t of tiles.values()) if (t.realm === c.key) t.defaults = neutralDefences(t, rng);
        realms.push({ key: c.key, name: c.name, biome, epithet: c.epithet, provinces });
    }
    const map = { seed, W, H, tiles, realms };
    _cache.set(seed, map); if (_cache.size > 3) _cache.delete(_cache.keys().next().value);
    return map;
}

/** neutral (un-owned) garrison per tile kind — what a guild must beat on first claim */
function neutralDefences(t, rng) {
    switch (t.kind) {
        case 'fortress': return { wall: { type: 'stone', hp: CFG.WALL_BASE_HP.stone }, golems: [{ kind: 'stone', lvl: 1 }, { kind: 'clay', lvl: 1 }], turrets: [{ kind: 'ballista', lvl: 1 }] };
        case 'ley_gate': return { wall: { type: 'wood', hp: CFG.WALL_BASE_HP.wood }, golems: [{ kind: 'clay', lvl: 1 }], turrets: [] };
        case 'pass': return { wall: { type: 'wood', hp: CFG.WALL_BASE_HP.wood }, golems: [], turrets: [{ kind: 'ballista', lvl: 1 }] };
        case 'keep': return { wall: { type: 'stone', hp: CFG.WALL_BASE_HP.stone }, golems: [{ kind: 'stone', lvl: 1 }], turrets: [{ kind: 'ballista', lvl: 1 }] };
        default: return { wall: null, golems: rng() < 0.35 ? [{ kind: 'clay', lvl: 1 }] : [], turrets: [] };
    }
}

// pointy-top hex grid, odd-r offset (x=col, y=row) — IDENTICAL to world/kingdom3d.js so tiles render 1:1 as KayKit hexes.
// edge order: 0=E 1=SE 2=SW 3=W 4=NW 5=NE
const NB_EVEN = [[1, 0], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]];
const NB_ODD = [[1, 0], [1, 1], [0, 1], [-1, 0], [0, -1], [1, -1]];
const hexNb = (x, y, d) => { const o = (y & 1 ? NB_ODD : NB_EVEN)[d]; return [x + o[0], y + o[1]]; };
function neighbors(map, id) {
    const { realm, x, y } = parse(id); const out = [];
    for (let d = 0; d < 6; d++) { const [nx, ny] = hexNb(x, y, d); const n = tileId(realm, nx, ny); if (map.tiles.has(n)) out.push(n); }
    const t = map.tiles.get(id);
    if (t && t.bridge) { // realm gates link the ring: east gate of realm i <-> a west gate of realm i+1 (nearest row)
        const keys = realmKeys(); const i = keys.indexOf(realm);
        const other = t.bridgeSide === 'e' ? keys[(i + 1) % keys.length] : keys[(i + keys.length - 1) % keys.length];
        let best = null, bd = 1e9; for (const o of map.tiles.values()) if (o.realm === other && o.bridge && o.bridgeSide !== t.bridgeSide) { const d = Math.abs(o.y - y); if (d < bd) { bd = d; best = o; } }
        if (best) out.push(best.id);
    }
    return out;
}
/** BFS tile distance (≤ limit), or Infinity */
function distance(map, a, b, limit = 80) {
    if (a === b) return 0; const seen = new Set([a]); let frontier = [a];
    for (let d = 1; d <= limit; d++) { const next = []; for (const id of frontier) for (const n of neighbors(map, id)) { if (n === b) return d; if (!seen.has(n)) { seen.add(n); next.push(n); } } frontier = next; if (!frontier.length) break; }
    return Infinity;
}
module.exports = { isLand, onLand, generate, neighbors, hexNb, distance, tileId, parse, provOf, KINDS, SCENERY, W, H, mulberry32, hashStr, realmKeys };
