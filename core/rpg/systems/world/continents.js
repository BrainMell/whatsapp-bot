'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  CONTINENTS — the five realms of the First World, each tied to ONE biome.
//
//  A guild picks a realm when it is founded; the realm decides the biome of its
//  guild kingdom AND of every member's home base. The guild gets a marker at a
//  seeded random spot of the realm's land (lore: where its charter-stone stands)
//  and member home bases sit in a loose cluster around that marker.
//
//  Pure data + pure functions (no I/O). Map geometry is CANONICAL: every realm has a
//  fixed shape (fixed seed) in a 0..1 × 0..1 map space, so markers are comparable
//  across guilds and the continent map never changes between renders.
//
//  Cosmology fit (cosmology_orbits.md invariants): realms are lands *of the First
//  World*; they scatter across all four quadrants; timelines never appear as regions.
//  Names are the surveyor field-names already charted in worldMapRenderer's catalog.
// ═══════════════════════════════════════════════════════════════════════════

// Order matters: it is the same order as kingdomTerrain.BIOMES, so a guild with no
// stored continent keeps exactly the biome it already had (hash % 5).
const CONTINENTS = [
    {
        key: 'stormreach', name: 'Stormheim', biome: 'isle', epithet: 'Coast of Gulls and Thunder',
        alias: ['storm reach', 'the storm reach'],
        centre: [0.81, 0.42], rx: 0.125, ry: 0.205, seed: 4101, ink: '#2E6E73',
        lore: 'The only realm that touches the open sea. Green headlands, fishing huts and a lighthouse on every cape; the storm-line sits on the horizon and nobody has seen it move.',
        regions: [['Gullwatch', 0.8160, 0.3273], ['The Salt Marshes', 0.7060, 0.4050], ['Thunderhead Cape', 0.7870, 0.4421]],
        guide: 'Sea-side guilds: lighthouse, river mouth, fishing huts.',
    },
    {
        key: 'sunscorch', name: 'Solheim', biome: 'desert', epithet: 'Glass Dunes and Mirage Wells',
        alias: ['sunscorch', 'the sunscorch'],
        centre: [0.27, 0.80], rx: 0.17, ry: 0.115, seed: 5202, ink: '#9C5B23',
        lore: 'Gold dunes under a white sun. Water is a rumour kept by oases, and every oasis has an owner. Ruined caravan-forts stud the Bone Road.',
        regions: [['The Glass Dunes', 0.2373, 0.5884], ['Mirage Wells', 0.3125, 0.6157], ['The Bone Road', 0.3009, 0.6388]],
        guide: 'Dune guilds: oasis pools, scrub, sandstone ridges, war camps.',
    },
    {
        key: 'frostreach', name: 'Rimeheim', biome: 'tundra', epithet: 'Rimewall and the Whitefast',
        alias: ['frost reach', 'the frost reach'],
        centre: [0.50, 0.125], rx: 0.20, ry: 0.075, seed: 6303, ink: '#4A6A8C',
        lore: 'Snow to the horizon, pine-dark valleys and frozen lakes the colour of old glass. The rivers never thaw; the roads are kept open by those who live on them.',
        regions: [['Rimewall', 0.4282, 0.2124], ['The Whitefast', 0.5012, 0.1959], ['Lantern Fjord', 0.5787, 0.2198]],
        guide: 'Tundra guilds: frozen lakes, pine woods, snowy ridgelines.',
    },
    {
        key: 'wildwood', name: 'Skogheim', biome: 'highlands', epithet: 'Amberdeep and the Hundred Oaks',
        alias: ['wildwood', 'the wildwood'],
        centre: [0.18, 0.45], rx: 0.105, ry: 0.185, seed: 7404, ink: '#8B5A1E',
        lore: 'An autumn that never ends: copper oaks, mossy hills, mills on every river. The woodcutters say the forest remembers who walked it.',
        regions: [['Amberdeep', 0.2199, 0.3570], ['The Hundred Oaks', 0.2315, 0.4091], ['Millrace', 0.1968, 0.4463]],
        guide: 'Forest guilds: autumn woods, farms, mills, rivers.',
    },
    {
        key: 'emberfields', name: 'Eldheim', biome: 'volcanic', epithet: 'Cinder Steps and Slagmouth',
        alias: ['ember fields', 'the ember fields'],
        centre: [0.76, 0.79], rx: 0.15, ry: 0.125, seed: 8505, ink: '#8B1A2B',
        lore: 'Black basalt and rivers of lava. Ash falls like slow snow. Eldheim is the continent of smiths: forges are built where the ground is already hot.',
        regions: [['The Cinder Steps', 0.6829, 0.5785], ['Slugwraith', 0.7581, 0.6033], ['Ashfall Basin', 0.7176, 0.6322]],
        guide: 'Volcanic guilds: lava pools and rivers, basalt ridges, ruins.',
    },
];
const BY_KEY = Object.fromEntries(CONTINENTS.map((c) => [c.key, c]));
const BY_BIOME = Object.fromEntries(CONTINENTS.map((c) => [c.biome, c]));
// the sea at the heart of the chart (existing charted world "the drowned sea")
const CENTRE_SEA = { name: 'The Drowned Sea', at: [0.50, 0.43] };
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

function get(key) {
    const k = String(key || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!k) return null;
    for (const c of CONTINENTS) {
        if (c.key === k || String(c.name).toLowerCase().replace(/[^a-z]/g, '') === k) return c;
        if (c.alias && c.alias.some((a) => a.toLowerCase().replace(/[^a-z]/g, '') === k)) return c;
    }
    return null;
}
/** fuzzy lookup: 'storm', 'the frost reach', 'desert', 'ember' … */
function find(text) {
    const t = String(text || '').toLowerCase().replace(/[^a-z ]/g, '').replace(/^the\s+/, '').trim();
    if (!t) return null;
    for (const c of CONTINENTS) {
        const n = c.name.toLowerCase().replace(/^the\s+/, '');
        if (c.key === t.replace(/ /g, '') || n === t || n.startsWith(t) || c.key.startsWith(t.replace(/ /g, '')) || c.biome === t) return c;
        if (n.split(' ').some((w) => w === t)) return c;
    }
    const alias = { sea: 'stormreach', coast: 'stormreach', coastal: 'stormreach', island: 'stormreach', storm: 'stormreach', stormheim: 'stormreach', gull: 'stormreach', dune: 'sunscorch', dunes: 'sunscorch', desert: 'sunscorch', sand: 'sunscorch', sun: 'sunscorch', solheim: 'sunscorch', glass: 'sunscorch', snow: 'frostreach', ice: 'frostreach', frozen: 'frostreach', frost: 'frostreach', rime: 'frostreach', rimeheim: 'frostreach', tundra: 'frostreach', forest: 'wildwood', autumn: 'wildwood', wood: 'wildwood', skogheim: 'wildwood', skog: 'wildwood', oak: 'wildwood', lava: 'emberfields', fire: 'emberfields', volcano: 'emberfields', ash: 'emberfields', eldheim: 'emberfields', eld: 'emberfields', ember: 'emberfields' };
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

// ── canonical geometry: land masks traced from core/rpgasset/continents/five_realms.jpg ─────────
// Map space is the chart image normalised to 0..1 (u = x/864, v = y/1210). The mask grid
// (scripts/kingdom3d/make_realm_mask.py) marks which cells are land of which realm.
const fs = require('fs');
const path = require('path');
const CHART = path.join(__dirname, '..', 'rpgasset', 'continents', 'five_realms.jpg');
let _mask = null;
function mask() {
    if (_mask) return _mask;
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rpgasset', 'continents', 'realm_mask.json'), 'utf8'));
    const byId = Object.fromEntries(Object.entries(j.ids).map(([k, v]) => [v, k]));
    const gh = j.rows.length, gw = j.rows[0].length;
    // distance (in grid cells) from each land cell to the nearest non-land cell of its realm — chamfer pass
    const dist = new Float32Array(gw * gh);
    const land = (x, y) => x >= 0 && y >= 0 && x < gw && y < gh && j.rows[y][x] !== '.';
    const same = (x, y, ch) => x >= 0 && y >= 0 && x < gw && y < gh && j.rows[y][x] === ch;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) dist[y * gw + x] = same(x, y, j.rows[y][x]) && land(x, y) ? 1e3 : 0;
    const at = (x, y) => (x < 0 || y < 0 || x >= gw || y >= gh ? 0 : dist[y * gw + x]);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const i = y * gw + x; if (dist[i]) dist[i] = Math.min(dist[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.4, at(x + 1, y - 1) + 1.4); }
    for (let y = gh - 1; y >= 0; y--) for (let x = gw - 1; x >= 0; x--) { const i = y * gw + x; if (dist[i]) dist[i] = Math.min(dist[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.4, at(x - 1, y + 1) + 1.4); }
    _mask = { j, gw, gh, byId, dist, W: j.w, H: j.h, step: j.step };
    return _mask;
}
/** realm key whose land is at map-space (u, v), or null (sea) */
function landAt(u, v) {
    const m = mask(), x = Math.floor((u * m.W) / m.step), y = Math.floor((v * m.H) / m.step);
    if (x < 0 || y < 0 || x >= m.gw || y >= m.gh) return null;
    const ch = m.j.rows[y][x];
    return ch === '.' ? null : m.byId[ch];
}
const inside = (key, u, v) => landAt(u, v) === key;
/** distance from the realm's coast, in map-space units (≈0.004 per grid cell) */
function edgeDist(key, u, v) {
    const m = mask(), x = Math.floor((u * m.W) / m.step), y = Math.floor((v * m.H) / m.step);
    if (x < 0 || y < 0 || x >= m.gw || y >= m.gh || !inside(key, u, v)) return 0;
    return m.dist[y * m.gw + x] * (m.step / m.W);
}
function regionAt(c, u, v) {
    let best = null, bd = 9;
    for (const [name, rx, ry] of c.regions) {
        const d = Math.hypot((u - rx) * 0.72, v - ry);       // the chart is portrait: weight x so distance is ~isotropic
        if (d < bd) { bd = d; best = { name, x: rx, y: ry }; }
    }
    return best;
}

/** a seeded RANDOM spot on the realm's land (kept off the coast) — the guild's charter-stone. */
function markerFor(guildName, continentKey) {
    const c = get(continentKey) || defaultFor(guildName);
    const m = mask();
    const rng = mulberry32(hashStr(`marker:${guildName}:${c.key}`));
    const cells = [];
    for (let y = 0; y < m.gh; y++) for (let x = 0; x < m.gw; x++) if (m.j.rows[y][x] === m.j.ids[c.key] && m.dist[y * m.gw + x] >= 2 && y * m.step >= 268) cells.push([x, y]);   // keep the pin + floating emblem inside the chart frame
    const [gx, gy] = cells[Math.floor(rng() * cells.length)] || [0, 0];
    const u = +((gx + 0.5 + (rng() - 0.5) * 0.8) * m.step / m.W).toFixed(4), v = +((gy + 0.5 + (rng() - 0.5) * 0.8) * m.step / m.H).toFixed(4);
    const reg = regionAt(c, u, v);
    return { x: +u.toFixed(4), y: +v.toFixed(4), region: reg.name };
}
/** full placement for a new guild (what gets stored on the guild). */
function placementFor(guildName, continentKey) {
    const c = get(continentKey) || defaultFor(guildName);
    return { continent: c.key, marker: markerFor(guildName, c.key) };
}
/** placement of an existing guild record; fills in anything missing deterministically.
 *  A stored marker from the old procedural map (not on this chart's land) is re-derived. */
function placementOf(guildName, guild) {
    const c = continentOf({ name: guildName, continent: guild && guild.continent });
    const ok = guild && guild.marker && typeof guild.marker.x === 'number' && inside(c.key, guild.marker.x, guild.marker.y);
    return { continent: c.key, marker: ok ? guild.marker : markerFor(guildName, c.key) };
}
/** where `n` member home bases sit: a loose ring of hamlets around the guild marker (stays on land). */
function baseSites(guildName, guild, n) {
    const { continent, marker } = placementOf(guildName, guild);
    const rng = mulberry32(hashStr('bases:' + guildName));
    const out = [];
    for (let i = 0; i < n; i++) {
        const a = i * 2.399 + rng() * 0.6;
        let rad = 0.020 + 0.010 * Math.sqrt(i + 1) + rng() * 0.008;
        const r4 = (n) => +n.toFixed(4);
        let x = r4(marker.x + Math.cos(a) * rad * 0.72), y = r4(marker.y + Math.sin(a) * rad);
        for (let g = 0; g < 8 && !(inside(continent, x, y) && edgeDist(continent, x, y) > 0.004); g++) { rad *= 0.7; x = r4(marker.x + Math.cos(a) * rad * 0.72); y = r4(marker.y + Math.sin(a) * rad); }
        if (!inside(continent, x, y)) { x = r4(marker.x + (rng() - 0.5) * 0.004); y = r4(marker.y + (rng() - 0.5) * 0.004); if (!inside(continent, x, y)) { x = marker.x; y = marker.y; } }
        out.push({ x, y });
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

module.exports = { CONTINENTS, BY_KEY, BY_BIOME, CENTRE_SEA, PLANET, get, find, defaultFor, continentOf, biomeOf, landAt, inside, edgeDist, regionAt, CHART, markerFor, placementFor, placementOf, baseSites, baseBiome, list, chooserText, hashStr, mulberry32 };
