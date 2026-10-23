'use strict';
// probe47k.js - hall-tier city evolution + cave-in-base + emblem crest audit.
// guild: exactly one mine INSIDE the walls (cdist <= 5) dressed, outer curtain wall on
// ring 8 only from hall 4 (+ its gatehouse), none beyond ring 6 below hall 4; every
// hall 1/3/5 x 5 biomes renders clean.
// base: the pack cave IS the mine at every level now (struct_mine family retired),
// worksite dressing grows (ladder lv2+, ore-hoist scaffold lv3).
process.env.QA_MODE = '1';
const K = require('../core/rpg/kingdom3d');
const g = require('../core/rpg/guildBaseRenderer');
const r = require('../core/rpg/homesteadBaseRenderer');
const orig = K.HexWorld.prototype.put;
let log = [], hexes = [], W = null;
K.HexWorld.prototype.put = function (name, c, rr, o) {
    log.push(name);
    hexes.push([name, c, rr]);
    if (!W) W = this;
    return orig.call(this, name, c, rr, o);
};
const count = (re) => log.filter((l) => re.test(l)).length;
const CC = 11, CR = 15, WALL_RING = 6;
const cdist = (c, rr) => K.hexDist(CC, CR, c, rr);

(async () => {
    let fail = 0, total = 0;
 // -- guild: cave inside + hall-tier walls --
    for (const biome of ['isle', 'desert', 'tundra', 'highlands', 'volcanic']) {
        for (const hall of [1, 3, 5]) {
            total++;
            log.length = 0; hexes.length = 0; W = null;
            const gs = { name: biome.toUpperCase() + ' Wardens', level: 6, archetype: 'ADVENTURER', buildings: { hall, training: 1, treasury: 2 }, memberCount: 7, memberCap: 25, biome, continent: biome };
            await g.renderFrame(gs, 0, { returnCanvas: true });
            const mines = hexes.filter(([n]) => /^building_mine_/.test(n));
            const inside = mines.every(([, c, rr]) => cdist(c, rr) <= WALL_RING - 1);
            const dressed = mines.some(([m, mc, mr]) => ['building_scaffolding', 'ladder', 'resource_stone'].every((dn) => hexes.some(([n, c, rr]) => n === dn && c === mc && rr === mr)));
            const wallsFar = hexes.filter(([n, c, rr]) => /^wall/.test(n) && cdist(c, rr) > WALL_RING + 1);
            const outerCurtain = hexes.filter(([n, c, rr]) => /^wall/.test(n) && cdist(c, rr) === WALL_RING + 2);
            const outerGate = hexes.filter(([n, c, rr]) => /^struct_gate_0/.test(n) && cdist(c, rr) === WALL_RING + 2);
            const okWalls = hall >= 4 ? (outerCurtain.length >= 10 && outerGate.length === 1) : wallsFar.length === 0;
            const ok = mines.length === 1 && inside && dressed && okWalls;
            if (!ok) fail++;
            const pos = mines[0] ? `mine ring ${cdist(mines[0][1], mines[0][2])}` : 'mine NONE';
            console.log(`${ok ? 'PASS' : 'FAIL'} guild ${biome} hall${hall}: ${pos} inside=${inside} dressed=${dressed} outerWall=${outerCurtain.length} outerGate=${outerGate.length} wallsFar=${wallsFar.length}`);
        }
    }
 // -- base: the pack cave is THE mine at every level; dressing grows --
    for (const lvl of [1, 2, 3]) {
        total++;
        log.length = 0; hexes.length = 0; W = null;
        const state = { owner: 'Aegir', biome: 'isle', structures: [{ type: 'house', x: 10, y: 6, level: 3 }, { type: 'mines', x: 1, y: 1, level: lvl }, { type: 'pond', x: 12, y: 1, level: 1 }], freePlots: [] };
        await r.renderFrame(state, 0, { returnCanvas: true });
        const mine = count(/^building_mine_/), str = count(/^struct_mine_/), lad = count(/^ladder/), scf = count(/^building_scaffolding/);
        const ok = mine >= 1 && str === 0 && (lvl >= 2 ? lad >= 1 : true) && (lvl >= 3 ? scf >= 1 : true);
        if (!ok) fail++;
        console.log(`${ok ? 'PASS' : 'FAIL'} base mines lv${lvl}: packMine=${mine} struct=${str} ladder=${lad} scaffold=${scf}`);
    }
    console.log(fail === 0 ? `PROBE ${total}/${total} GREEN` : `PROBE ${total - fail}/${total} - ${fail} FAIL`);
    process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
