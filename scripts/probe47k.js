'use strict';
// probe47k.js — the pack cave lives INSIDE the walls now (owner 2026-10-19: "Move the
// cave inside the base, it should replace the existing mines"). Audit: exactly one
// building_mine_ per guild card, placed at cdist <= 5 (inside the ring-6 wall), dressed
// on the same cell (scaffold + ladder + stone), and NO mine left out in the wilds.
// Homestead mines untouched (struct family main, pack second shaft from lv2).
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
    // ── guild: every biome × hall 1/3/5 — the cave sits inside the walls ──
    for (const biome of ['isle', 'desert', 'tundra', 'highlands', 'volcanic']) {
        for (const hall of [1, 3, 5]) {
            total++;
            log.length = 0; hexes.length = 0; W = null;
            const gs = { name: biome.toUpperCase() + ' Wardens', level: 6, archetype: 'ADVENTURER', buildings: { hall, training: 1, treasury: 2 }, memberCount: 7, memberCap: 25, biome, continent: biome };
            await g.renderFrame(gs, 0, { returnCanvas: true });
            const mines = hexes.filter(([n]) => /^building_mine_/.test(n));
            const inside = mines.every(([, c, rr]) => cdist(c, rr) <= WALL_RING - 1);
            const wild = mines.some(([, c, rr]) => cdist(c, rr) >= WALL_RING);
            const dressed = mines.some(([m, mc, mr]) => ['building_scaffolding', 'ladder', 'resource_stone'].every((dn) => hexes.some(([n, c, rr]) => n === dn && c === mc && rr === mr)));
            const ok = mines.length === 1 && inside && dressed && !wild;
            if (!ok) fail++;
            const pos = mines[0] ? `ring ${cdist(mines[0][1], mines[0][2])} @(${mines[0][1]},${mines[0][2]})` : 'NONE';
            console.log(`${ok ? 'PASS' : 'FAIL'} guild ${biome} hall${hall}: mine=${mines.length} ${pos} inside=${inside} dressed=${dressed} wildLeft=${wild}`);
        }
    }
    // ── homestead regression: struct family main + pack second shaft from lv2 ──
    for (const lvl of [1, 2, 3]) {
        total++;
        log.length = 0; hexes.length = 0; W = null;
        const state = { owner: 'Aegir', biome: 'isle', structures: [{ type: 'house', x: 10, y: 6, level: 3 }, { type: 'mines', x: 1, y: 1, level: lvl }, { type: 'pond', x: 12, y: 1, level: 1 }], freePlots: [] };
        await r.renderFrame(state, 0, { returnCanvas: true });
        const mine = count(/^building_mine_/), lad = count(/^ladder/), str = count(/^struct_mine_/);
        const ok = lvl === 1 ? (mine === 0 && str >= 1) : (mine === 1 && lad >= 1 && str >= 1);
        if (!ok) fail++;
        console.log(`${ok ? 'PASS' : 'FAIL'} base mines lv${lvl}: struct=${str} packMine=${mine} ladder=${lad}`);
    }
    console.log(fail === 0 ? `PROBE ${total}/${total} GREEN` : `PROBE ${total - fail}/${total} — ${fail} FAIL`);
    process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
