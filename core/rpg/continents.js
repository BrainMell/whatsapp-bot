'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  CONTINENTS — Aldafold, the First World (owner 2026-10-18: name the planet,
//  drop the "Five Realms" framing, give the lands Norse names).
//
//  Aldafold (alda "the ages/mankind" + fold "earth") is the mortal world the
//  regular players live on: five continents around the Drowned Sea, each tied
//  to ONE biome. A guild picks a continent when it is founded; the choice
//  decides the biome of its guild kingdom AND of every member's home base.
//  The guild gets a marker at a seeded random spot of the land (lore: where
//  its charter-stone stands) and member home bases sit in a loose cluster
//  around that marker.
//
//  Pure data + pure functions (no I/O). Map geometry is CANONICAL: every
//  continent has a fixed shape (fixed seed) in a 0..1 × 0..1 map space, so
//  markers are comparable across guilds and the continent map never changes
//  between renders.
//
//  COMPAT: the storage keys (stormreach/sunscorch/…) and array order (=
//  kingdomTerrain.BIOMES order, for the hash%5 back-compat) are FROZEN. Only
//  display names went Norse; get()/find() resolve both the new names and the
//  old surveyor names, so nothing stored ever breaks.
// ═══════════════════════════════════════════════════════════════════════════

// Order matters: it is the same order as kingdomTerrain.BIOMES, so a guild with no
// stored continent keeps exactly the biome it already had (hash % 5).
const CONTINENTS = [
    {
        key: 'stormreach', name: 'Stormheim', biome: 'isle', epithet: 'Coast of Gulls and Thunder',
        alias: ['storm reach', 'the storm reach'],
        centre: [0.825, 0.46], rx: 0.11, ry: 0.16, seed: 4101, ink: '#2E6E73',
        lore: 'The only continent that touches the open sea. Green headlands, fishing huts and a lighthouse on every cape; the storm-line sits on the horizon and nobody has seen it move.',
        regions: [['Gullwatch', 0.30, -0.45], ['The Salt Marshes', -0.30, 0.20], ['Thunderhead Cape', 0.25, 0.50]],
        guide: 'Sea-side guilds: lighthouse, river mouth, fishing huts.',
    },
    {
        key: 'sunscorch', name: 'Solheim', biome: 'desert', epithet: 'Glass Dunes and Mirage Wells',
        alias: ['sunscorch', 'the sunscorch'],
        centre: [0.31, 0.84], rx: 0.18, ry: 0.10, seed: 5202, ink: '#9C5B23',
        lore: 'Gold dunes under a white sun. Water is a rumour kept by oases, and every oasis has an owner. Ruined caravan-forts stud the Bone Road.',
        regions: [['The Glass Dunes', -0.35, -0.20], ['Mirage Wells', 0.30, 0.15], ['The Bone Road', 0.0, 0.55]],
        guide: 'Dune guilds: oasis pools, scrub, sandstone ridges, war camps.',
    },
    {
        key: 'frostreach', name: 'Rimeheim', biome: 'tundra', epithet: 'Rimewall and the Whitefast',
        alias: ['frost reach', 'the frost reach'],
        centre: [0.52, 0.15], rx: 0.26, ry: 0.085, seed: 6303, ink: '#4A6A8C',
        lore: 'Snow to the horizon, pine-dark valleys and frozen lakes the colour of old glass. The rivers never thaw; the roads are kept open by those who live on them.',
        regions: [['Rimewall', -0.40, 0.10], ['The Whitefast', 0.05, -0.35], ['Lantern Fjord', 0.45, 0.20]],
        guide: 'Tundra guilds: frozen lakes, pine woods, snowy ridgelines.',
    },
    {
        key: 'wildwood', name: 'Skogheim', biome: 'highlands', epithet: 'Amberdeep and the Hundred Oaks',
        alias: ['wildwood', 'the wildwood'],
        centre: [0.185, 0.47], rx: 0.115, ry: 0.17, seed: 7404, ink: '#8B5A1E',
        lore: 'An autumn that never ends: copper oaks, mossy hills, mills on every river. The woodcutters say the forest remembers who walked it.',
        regions: [['Amberdeep', 0.0, -0.40], ['The Hundred Oaks', 0.25, 0.10], ['Millrace', -0.25, 0.45]],
        guide: 'Forest guilds: autumn woods, farms, mills, rivers.',
    },
    {
        key: 'emberfields', name: 'Eldheim', biome: 'volcanic', epithet: 'Cinder Steps and Slagmouth',
        alias: ['ember fields', 'the ember fields'],
        centre: [0.75, 0.83], rx: 0.13, ry: 0.105, seed: 8505, ink: '#8B1A2B',
        lore: 'Black basalt and rivers of lava. Ash falls like slow snow. Eldheim is the continent of smiths: forges are built where the ground is already hot.',
        regions: [['The Cinder Steps', -0.30, -0.25], ['Slagmouth', 0.30, 0.10], ['Ashfall Basin', -0.05, 0.50]],
        guide: 'Volcanic guilds: lava pools and rivers, basalt ridges, ruins.',
    },
];
const BY_KEY = Object.fromEntries(CONTINENTS.map((c) => [c.key, c]));
const BY_BIOME = Object.fromEntries(CONTINENTS.map((c) => [c.biome, c]));
// the sea at the heart of the chart (existing charted world "the drowned sea")
const CENTRE_SEA = { name: 'The Drowned Sea', at: [0.50, 0.50] };
// the planet itself (owner 2026-10-18: "call it the name of this specific planet — give it a name")
const PLANET = {
    name: 'Aldafold',
    kicker: 'THE COSMOLOGY - THE LANDS OF THE FIRST WORLD',
    subtitle: 'five lands, five guild kingdoms, one drowned sea between them',
};

// ── helpers ──────────────────────────────────────────────────────────────────
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

const _strip = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
function get(key) {
    const k = _strip(key);
    if (!k) return null;
    for (const c of CONTINENTS) {
        if (c.key === k || _strip(c.name) === k) return c;
        if (c.alias && c.alias.some((a) => _strip(a) === k)) return c;
    }
    return null;
}
/** fuzzy lookup: 'storm', 'rimeheim', 'the frost reach', 'desert', 'ember' … */
function find(text) {
    const t = String(text || '').toLowerCase().replace(/[^a-z ]/g, '').replace(/^the\s+/, '').trim();
    if (!t) return null;
    for (const c of CONTINENTS) {
        const n = c.name.toLowerCase();
        if (c.key === t.replace(/ /g, '') || n === t || n.startsWith(t) || c.key.startsWith(t.replace(/ /g, '')) || c.biome === t) return c;
        if (n.split(' ').some((w) => w === t)) return c;
        if (c.alias && c.alias.includes(t)) return c;
    }
    const alias = {
        sea: 'stormreach', coast: 'stormreach', coastal: 'stormreach', island: 'stormreach', storm: 'stormreach', stormheim: 'stormreach', gull: 'stormreach',
        dune: 'sunscorch', dunes: 'sunscorch', desert: 'sunscorch', sand: 'sunscorch', sun: 'sunscorch', solheim: 'sunscorch', glass: 'sunscorch',
        snow: 'frostreach', ice: 'frostreach', frozen: 'frostreach', frost: 'frostreach', rime: 'frostreach', rimeheim: 'frostreach', tundra: 'frostreach',
        forest: 'wildwood', autumn: 'wildwood', wood: 'wildwood', skogheim: 'wildwood', skog: 'wildwood', oak: 'wildwood',
        lava: 'emberfields', fire: 'emberfields', volcano: 'emberfields', ash: 'emberfields', eldheim: 'emberfields', eld: 'emberfields', ember: 'emberfields',
    };
    return alias[t] ? BY_KEY[alias[t]] : null;
}
/** the realm a guild gets when nothing was stored (back-compat: same as the old name-hash biome). */
function defaultFor(name) { return CONTINENTS[hashStr('biome:' + String(name || 'guild')) % CONTINENTS.length]; }
function continentOf(entity) {
    if (entity && entity.continent && get(entity.continent)) return get(entity.continent);
    if (entity && entity.biome && BY_BIOME[entity.biome]) return BY_BIOME[entity.biome];
    return defaultFor(entity && entity.name);
}
const biomeOf = (entity) => continentOf(entity).biome;

// ── canonical geometry (map space 0..1) ──────────────────────────────────────
const _poly = new Map();
function polygon(key) {
    if (_poly.has(key)) return _poly.get(key);
    const c = BY_KEY[key];
    const rng = mulberry32(c.seed);
    const ph = [rng() * 6.28, rng() * 6.28, rng() * 6.28, rng() * 6.28, rng() * 6.28];
    const N = 96, pts = [];
    for (let i = 0; i < N; i++) {
        const t = (i / N) * Math.PI * 2;
        // 2026-10-18 owner round: richer silhouettes than the old blobs — still
        // deterministic, still inside the chart (qa_continents checks bounds).
        const k = 1
            + 0.14 * Math.sin(2 * t + ph[0])
            + 0.10 * Math.sin(3 * t + ph[1])
            + 0.06 * Math.sin(5 * t + ph[2])
            + 0.045 * Math.sin(7 * t + ph[3])
            + 0.028 * Math.sin(11 * t + ph[4]);
        pts.push([c.centre[0] + Math.cos(t) * c.rx * k, c.centre[1] + Math.sin(t) * c.ry * k]);
    }
    _poly.set(key, pts);
    return pts;
}
function inside(pts, x, y) {
    let ins = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
    }
    return ins;
}
function edgeDist(pts, x, y) {
    let best = 9;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [ax, ay] = pts[j], [bx, by] = pts[i];
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-9;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
        best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
    }
    return best;
}
function regionAt(c, x, y) {
    let best = null, bd = 9;
    for (const [name, ox, oy] of c.regions) {
        const rx = c.centre[0] + ox * c.rx, ry = c.centre[1] + oy * c.ry;
        const d = Math.hypot(x - rx, y - ry);
        if (d < bd) { bd = d; best = { name, x: rx, y: ry }; }
    }
    return best;
}

/** a seeded RANDOM spot on the realm's land (kept off the coast) — the guild's charter-stone. */
function markerFor(guildName, continentKey) {
    const c = get(continentKey) || defaultFor(guildName);
    const pts = polygon(c.key);
    const rng = mulberry32(hashStr(`marker:${guildName}:${c.key}`));
    let x = c.centre[0], y = c.centre[1];
    for (let i = 0; i < 400; i++) {
        const cx = c.centre[0] + (rng() * 2 - 1) * c.rx * 1.3, cy = c.centre[1] + (rng() * 2 - 1) * c.ry * 1.3;
        if (inside(pts, cx, cy) && edgeDist(pts, cx, cy) > 0.03) { x = cx; y = cy; break; }
    }
    const reg = regionAt(c, x, y);
    return { x: +x.toFixed(4), y: +y.toFixed(4), region: reg.name };
}
/** full placement for a new guild (what gets stored on the guild). */
function placementFor(guildName, continentKey) {
    const c = get(continentKey) || defaultFor(guildName);
    return { continent: c.key, marker: markerFor(guildName, c.key) };
}
/** placement of an existing guild record; fills in anything missing deterministically. */
function placementOf(guildName, guild) {
    const c = continentOf({ name: guildName, continent: guild && guild.continent });
    const m = guild && guild.marker && typeof guild.marker.x === 'number' && inside(polygon(c.key), guild.marker.x, guild.marker.y) ? guild.marker : markerFor(guildName, c.key);
    return { continent: c.key, marker: m };
}
/** where `n` member home bases sit: a loose ring of hamlets around the guild marker (stays on land). */
function baseSites(guildName, guild, n) {
    const { continent, marker } = placementOf(guildName, guild);
    const pts = polygon(continent);
    const rng = mulberry32(hashStr('bases:' + guildName));
    const out = [];
    for (let i = 0; i < n; i++) {
        let a = i * 2.399 + rng() * 0.6, rad = 0.022 + 0.012 * Math.sqrt(i + 1) + rng() * 0.01;
        let x = marker.x + Math.cos(a) * rad, y = marker.y + Math.sin(a) * rad * 0.9;
        for (let g = 0; g < 8 && !(inside(pts, x, y) && edgeDist(pts, x, y) > 0.012); g++) { rad *= 0.7; x = marker.x + Math.cos(a) * rad; y = marker.y + Math.sin(a) * rad * 0.9; }
        out.push({ x: +x.toFixed(4), y: +y.toFixed(4) });
    }
    return out;
}
/** the biome for a PLAYER home base: their guild's realm, else a realm of their own (stored/seeded). */
function baseBiome({ owner, guildName, guild, continent }) {
    if (guildName && guild) return continentOf({ name: guildName, continent: guild.continent }).biome;
    if (continent && get(continent)) return get(continent).biome;
    return defaultFor(owner || 'base').biome;
}

function list() { return CONTINENTS.map((c) => ({ key: c.key, name: c.name, biome: c.biome, epithet: c.epithet })); }
function chooserText(prefix = '.j') {
    return CONTINENTS.map((c, i) => `${i + 1}. *${c.name}* — ${c.epithet}\n   _${c.guide}_  (\`${prefix} guild create <name> | <type> | ${c.key}\`)`).join('\n');
}

module.exports = { CONTINENTS, BY_KEY, BY_BIOME, CENTRE_SEA, PLANET, get, find, defaultFor, continentOf, biomeOf, polygon, inside, edgeDist, regionAt, markerFor, placementFor, placementOf, baseSites, baseBiome, list, chooserText, hashStr, mulberry32 };
