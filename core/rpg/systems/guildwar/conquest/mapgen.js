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
            const prov = provinces[provOf(x, y)];
            const r = rng();
            // province character biases what spawns
            const ch = prov.character;
            let kind = 'plain';
            const bias = { bountiful: 0.16, barren: -0.05 }[ch] || 0;
            if (r < 0.14 + bias) kind = 'village';
            else if (r < 0.34) kind = 'forest';
            else if (r < 0.40 + (ch === 'ancient' ? 0.08 : 0)) kind = 'ruins';
            else if (r < 0.43 + (ch === 'sacred' ? 0.06 : 0)) kind = 'shrine';
            else if (r < 0.46 + (ch === 'borderland' || ch === 'frontier' ? 0.03 : 0)) kind = 'fortress';
            else if (r < 0.48 + (ch === 'highland' ? 0.05 : 0)) kind = 'pass';
            const id = tileId(c.key, x, y);
            const t = { id, realm: c.key, biome, x, y, prov: prov.index, provName: prov.name, kind, name: pick(sc[kind]), vein: 0, defaults: null };
            tiles.set(id, t); prov.tiles.push(id);
        }
        // landmarks: keep slots at the 4 corners-ish of the realm (guild starts), ley gates at province junctions, titan lair at centre
        const keepSpots = [[2, 2], [W - 3, 2], [2, H - 3], [W - 3, H - 3], [Math.floor(W / 2), Math.floor(H / 2) + 4], [Math.floor(W / 2), 2]];
        keepSpots.forEach(([x, y]) => { const t = tiles.get(tileId(c.key, x, y)); t.kind = 'keep'; t.name = sc.keep[0]; });
        const gateSpots = [[5, 5], [10, 5], [15, 5], [5, 10], [10, 10], [15, 10]];
        gateSpots.forEach(([x, y]) => { const t = tiles.get(tileId(c.key, x, y)); if (t.kind !== 'keep') { t.kind = 'ley_gate'; t.name = pick(sc.ley_gate); } });
        const tt = tiles.get(tileId(c.key, Math.floor(W / 2), Math.floor(H / 2))); tt.kind = 'titan'; tt.name = sc.titan[0]; tt.titan = true;
        // realm bridges: east edge of realm i links west edge of realm i+1 (a ring)
        const edge = []; for (let yy = 4; yy < H - 3; yy += 3) edge.push(yy);
        for (const yy of edge) { for (const xx of [0, W - 1]) { const t = tiles.get(tileId(c.key, xx, yy)); if (t.kind !== 'keep') { t.kind = 'pass'; t.name = 'Realm Gate ' + (xx === 0 ? '(west)' : '(east)'); t.bridge = true; } } }
        // gem veins: scarce — 3% of tiles, clustered 1-4 tiles ("entire veins")
        const nVeins = Math.round(W * H * 0.03 / 2.4);
        for (let v = 0; v < nVeins; v++) {
            const cx = 1 + Math.floor(rng() * (W - 2)), cy = 1 + Math.floor(rng() * (H - 2));
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

function neighbors(map, id) {
    const { realm, x, y } = parse(id); const out = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = tileId(realm, x + dx, y + dy); if (map.tiles.has(n)) out.push(n); }
    const t = map.tiles.get(id);
    if (t && t.bridge) { // realm gates link the ring: east of realm i <-> west of realm i+1 at same row
        const keys = realmKeys(); const i = keys.indexOf(realm);
        const other = x === W - 1 ? keys[(i + 1) % keys.length] : x === 0 ? keys[(i + keys.length - 1) % keys.length] : null;
        if (other) { const o = tileId(other, x === W - 1 ? 0 : W - 1, y); if (map.tiles.has(o)) out.push(o); }
    }
    return out;
}
/** BFS tile distance (≤ limit), or Infinity */
function distance(map, a, b, limit = 80) {
    if (a === b) return 0; const seen = new Set([a]); let frontier = [a];
    for (let d = 1; d <= limit; d++) { const next = []; for (const id of frontier) for (const n of neighbors(map, id)) { if (n === b) return d; if (!seen.has(n)) { seen.add(n); next.push(n); } } frontier = next; if (!frontier.length) break; }
    return Infinity;
}
module.exports = { generate, neighbors, distance, tileId, parse, provOf, KINDS, SCENERY, W, H, mulberry32, hashStr, realmKeys };
