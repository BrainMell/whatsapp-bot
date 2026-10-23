'use strict';
// probe47i.js - log every sprite placement for a guild seed (asset-utilisation audit)
process.env.QA_MODE = '1';
const K = require('../core/rpg/kingdom3d');
const g = require('../core/rpg/guildBaseRenderer');
const orig = K.HexWorld.prototype.put;
const log = [];
K.HexWorld.prototype.put = function (name, c, r, o) {
    if (o && o.wx != null) log.push(`${name} @ world(${o.wx.toFixed(1)},${o.wz.toFixed(1)})`);
    else log.push(`${name} @ hex(${c},${r})`);
    return orig.call(this, name, c, r, o);
};
const WANT = process.argv[2] ? JSON.parse(process.argv[2]) : null;
(async () => {
    const states = WANT ? [WANT] : ['isle', 'desert', 'tundra', 'highlands', 'volcanic'].map((biome) => ({
        name: biome.toUpperCase() + ' Wardens', level: 6, archetype: 'ADVENTURER', buildings: { hall: 2, training: 1, treasury: 2 }, memberCount: 7, memberCap: 25, biome, continent: biome,
    }));
    for (const gs of states) {
        log.length = 0;
        await g.renderFrame(gs, 0, { returnCanvas: true });
        console.log('=== ' + gs.name + ' (' + (gs.biome || '?') + ') - ' + log.length + ' placements');
        const want = /windmill|barracks|stage|market|crate_long|pallet|bucket_arrows|target|weaponrack|gate|postern|wall_straight_gate|mine|watermill|lumbermill/;
        for (const l of log) if (want.test(l)) console.log('  ' + l);
    }
})().catch((e) => { console.error(e); process.exit(1); });
