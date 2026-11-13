'use strict';
// 🃏 ENVIRONMENT CARDS for the Wall Breach encounter. One is drawn at the start of every round and
// reshapes that round: which siege tools shine, whether turrets can see, what the terrain does to
// both sides. `mods` multiply per-action damage; `turret` multiplies defender turret output;
// `golem` multiplies golem attack; `hazard` hurts the attacking party (fraction of max HP);
// `repair` heals the wall (fraction of max per section); `rule` flags are read by breach.js.
// biomes: realm biomes it can appear in ('*' = anywhere). weight: draw weight.
const A = (o) => Object.assign({ ram: 1, ladder: 1, sapper: 1, fire: 1, rune: 1, shield: 1, scout: 1 }, o);
const CARDS = [
    // ── weather ───────────────────────────────────────────────────────────────────────────────
    { id: 'rain', name: 'Driving Rain', icon: '🌧️', biomes: ['isle', 'highlands', 'tundra'], weight: 8, palette: ['#2b3a4a', '#6f8aa3'], text: 'Fires sputter and sap-wood swells. Ladders turn slick; the ram bogs in mud.', mods: A({ fire: 0.45, ram: 0.9, ladder: 0.8 }), turret: 1, flags: ['wetWood'] },
    { id: 'fog', name: 'Sea Fog', icon: '🌫️', biomes: ['isle', 'highlands'], weight: 7, palette: ['#c9d2d6', '#8b979d'], text: 'The wall vanishes. Turrets fire blind — but you can\'t see the gate either.', mods: A({ scout: 1.6, ram: 0.85 }), turret: 0.55, flags: ['blindfire'] },
    { id: 'whiteout', name: 'Whiteout', icon: '❄️', biomes: ['tundra'], weight: 9, palette: ['#e8f1f6', '#9db7c8'], text: 'A wall of snow. Nobody can aim; everybody is freezing.', mods: A({ fire: 1.3, ladder: 0.7, scout: 0.5 }), turret: 0.5, hazard: 0.03 },
    { id: 'sandstorm', name: 'Sandstorm', icon: '🏜️', biomes: ['desert'], weight: 9, palette: ['#c98f4b', '#8c5a2a'], text: 'Grit scours the stone. Rams grind, ladders fall, nobody sees past ten paces.', mods: A({ ram: 1.1, ladder: 0.6, rune: 0.8, scout: 0.6 }), turret: 0.6, hazard: 0.025 },
    { id: 'heatwave', name: 'Killing Heat', icon: '☀️', biomes: ['desert', 'volcanic'], weight: 7, palette: ['#f3b34c', '#c4552d'], text: 'Armour burns the skin. Wood dries to tinder — fire is wonderful.', mods: A({ fire: 1.5, ram: 0.9 }), turret: 1, hazard: 0.04, flags: ['dryWood'] },
    { id: 'thunder', name: 'Thunderhead', icon: '⛈️', biomes: ['isle', 'highlands'], weight: 6, palette: ['#242a3a', '#7d8fd4'], text: 'Lightning walks the battlements. Runes sing; anything metal is a lightning rod.', mods: A({ rune: 1.5, fire: 0.7, shield: 0.8 }), turret: 0.9, hazard: 0.03, flags: ['lightning'] },
    { id: 'aurora', name: 'Aurora Surge', icon: '🌌', biomes: ['tundra', 'isle'], weight: 5, palette: ['#14233a', '#4de2b4'], text: 'The sky bleeds green. Ley-energy is thick: runes strengthen, wards flare.', mods: A({ rune: 1.6, scout: 1.2 }), turret: 1, golem: 1.1, flags: ['leyBloom'] },
    { id: 'tailwind', name: 'Tailwind', icon: '💨', biomes: ['*'], weight: 6, palette: ['#a9d4c4', '#5e9b8a'], text: 'The wind is at your back — flames lick toward the gate and arrows fall short.', mods: A({ fire: 1.25, ladder: 1.1 }), turret: 0.8 },
    { id: 'clear', name: 'Clear Dawn', icon: '🌅', biomes: ['*'], weight: 10, palette: ['#f4d6a4', '#d48a5c'], text: 'A fair day to lay siege. No tricks — just steel, stone and nerve.', mods: A({}), turret: 1 },
    { id: 'night', name: 'Moonless Night', icon: '🌑', biomes: ['*'], weight: 6, palette: ['#0c1020', '#3c4a78'], text: 'Cover of darkness. Sappers thrive; scouts find weak points; the turrets squint.', mods: A({ sapper: 1.5, scout: 1.4, ram: 0.9 }), turret: 0.7 },
    // ── terrain ───────────────────────────────────────────────────────────────────────────────
    { id: 'mud', name: 'Churned Mud', icon: '🟤', biomes: ['isle', 'highlands', 'tundra'], weight: 6, palette: ['#4b3a2a', '#7a5f43'], text: 'The approach is a bog. The ram can\'t build speed; sappers dig easily.', mods: A({ ram: 0.55, sapper: 1.4 }), turret: 1.1 },
    { id: 'sinkhole', name: 'Sinkhole Field', icon: '🕳️', biomes: ['desert', 'highlands'], weight: 5, palette: ['#3d3226', '#9a8266'], text: 'The ground gives way. Tunnels collapse early — or take the wall with them.', mods: A({ sapper: 1.8, ram: 0.8 }), turret: 1, hazard: 0.03, flags: ['sapperRisk'] },
    { id: 'rockslide', name: 'Rockslide', icon: '🪨', biomes: ['highlands', 'volcanic', 'tundra'], weight: 5, palette: ['#58504a', '#9b8f84'], text: 'The slope above the wall lets go. Whoever is in the open pays.', mods: A({ shield: 1.6, ladder: 0.7 }), turret: 1, hazard: 0.08 },
    { id: 'quake', name: 'Tremor', icon: '🌋', biomes: ['volcanic', 'desert'], weight: 5, palette: ['#4a2a22', '#e0703a'], text: 'The earth shudders. Old masonry cracks — everyone\'s footing is bad.', mods: A({ ram: 1.3, sapper: 1.5, ladder: 0.5 }), turret: 0.9, hazard: 0.02, flags: ['crackWall'] },
    { id: 'thinice', name: 'Thin Ice', icon: '🧊', biomes: ['tundra'], weight: 6, palette: ['#cfe4f2', '#7fa9c4'], text: 'The moat is ice. It holds a ram… barely. Fire cracks it open.', mods: A({ ram: 1.1, fire: 1.4, sapper: 0.5 }), turret: 1, flags: ['iceMoat'] },
    { id: 'lava', name: 'Lava Flow', icon: '🔥', biomes: ['volcanic'], weight: 8, palette: ['#2a1410', '#ff6a2a'], text: 'A river of slag cuts the approach. Ladders are suicide; the wall glows red.', mods: A({ fire: 0.5, ladder: 0.4, rune: 1.2, ram: 0.8 }), turret: 1, hazard: 0.05 },
    { id: 'tide', name: 'Rising Tide', icon: '🌊', biomes: ['isle'], weight: 8, palette: ['#1b4a6a', '#4aa5c9'], text: 'The causeway floods. Rams float, ladders sit in surf — the gate is almost undefended from the water.', mods: A({ ram: 0.6, ladder: 1.3, sapper: 0.4 }), turret: 0.9, flags: ['tidal'] },
    { id: 'quicksand', name: 'Quicksand', icon: '⏳', biomes: ['desert'], weight: 5, palette: ['#d6a864', '#8f6a34'], text: 'Heavy things sink. The ram stalls; light climbers have the advantage.', mods: A({ ram: 0.5, ladder: 1.3 }), turret: 1 },
    { id: 'thornbriar', name: 'Briar Surge', icon: '🌿', biomes: ['highlands'], weight: 7, palette: ['#244224', '#6aa84a'], text: 'The forest crawls over your siege lines. Fire is the answer.', mods: A({ fire: 1.7, ram: 0.8, ladder: 0.7 }), turret: 1, hazard: 0.02 },
    // ── defender tricks ───────────────────────────────────────────────────────────────────────
    { id: 'oil', name: 'Boiling Oil', icon: '🛢️', biomes: ['*'], weight: 7, palette: ['#3a2a14', '#d8a03a'], text: 'Cauldrons tip off the parapet. Anyone at the wall foot is scalded — shields matter.', mods: A({ ladder: 0.6, shield: 1.8 }), turret: 1.2, hazard: 0.06, flags: ['flammableOil'] },
    { id: 'volley', name: 'Massed Volley', icon: '🏹', biomes: ['*'], weight: 7, palette: ['#2c2a24', '#c9b27c'], text: 'The garrison empties every quiver. A hail of arrows — hide or die.', mods: A({ shield: 2.0 }), turret: 1.6 },
    { id: 'wardsurge', name: 'Ward Surge', icon: '🔮', biomes: ['*'], weight: 6, palette: ['#2a1a40', '#b080ff'], text: 'Defender runes flare. Plain steel bounces; only arcane work bites.', mods: A({ ram: 0.7, fire: 0.7, rune: 1.4 }), turret: 1, flags: ['wardUp'] },
    { id: 'awaken', name: 'Golems Awaken', icon: '🗿', biomes: ['*'], weight: 5, palette: ['#3a3a3a', '#7ed6c1'], text: 'Sigils glow along the garrison. Golems hit harder this round and the next.', mods: A({}), turret: 1, golem: 1.35, flags: ['golemSurge'] },
    { id: 'mender', name: 'Wall Menders', icon: '🧱', biomes: ['*'], weight: 6, palette: ['#6a5a44', '#b09a72'], text: 'Masons swarm the damage with mortar. Hit hard now, or the wall mends itself.', mods: A({ scout: 1.3 }), turret: 1, repair: 0.08 },
    { id: 'tar', name: 'Tar Pit', icon: '⚫', biomes: ['*'], weight: 4, palette: ['#14120e', '#4a3f2a'], text: 'Tar sluices down the wall. A spark would turn it into an inferno — on whoever stands close.', mods: A({ fire: 1.8, ladder: 0.6 }), turret: 1, hazard: 0.03, flags: ['flammableOil'] },
    { id: 'ravens', name: 'Raven Swarm', icon: '🐦‍⬛', biomes: ['*'], weight: 4, palette: ['#1c1c28', '#6a6a88'], text: 'A black cloud blinds your scouts and harries the ladders.', mods: A({ scout: 0.4, ladder: 0.8 }), turret: 1 },
    // ── lucky breaks ──────────────────────────────────────────────────────────────────────────
    { id: 'rot', name: 'Dry Rot', icon: '🍂', biomes: ['*'], weight: 4, palette: ['#4a3a1a', '#a08a4a'], text: 'Old timbers fail. Wooden gates take extra damage from everything.', mods: A({ ram: 1.3, fire: 1.3 }), turret: 1, flags: ['woodVuln'] },
    { id: 'deserter', name: 'Deserter at the Gate', icon: '🕯️', biomes: ['*'], weight: 3, palette: ['#2a2218', '#d8b872'], text: 'A frightened sentry cracks the postern. The weak point reveals itself.', mods: A({ scout: 2.0, sapper: 1.2 }), turret: 0.8, flags: ['revealWeak'] },
    { id: 'eclipse', name: 'Eclipse', icon: '🌘', biomes: ['*'], weight: 2, palette: ['#05050a', '#c8a2ff'], text: 'The sun goes out. Runes go wild — for both sides.', mods: A({ rune: 1.8, fire: 0.8 }), turret: 0.8, golem: 1.2, hazard: 0.02, flags: ['leyBloom'] },
];
const BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));

/** weighted draw for a realm biome; avoids repeating the last two cards. `rng` is () => [0,1) */
function draw(biome, rng, recent = []) {
    const pool = CARDS.filter((c) => (c.biomes.includes('*') || c.biomes.includes(biome)) && !recent.slice(-2).includes(c.id));
    const total = pool.reduce((s, c) => s + c.weight, 0);
    let r = rng() * total;
    for (const c of pool) { r -= c.weight; if (r <= 0) return c; }
    return pool[pool.length - 1];
}
module.exports = { CARDS, BY_ID, draw };
