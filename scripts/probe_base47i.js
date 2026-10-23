'use strict';
// probe_base47i.js - exact card-pixel positions of fence gates / barns on homestead cards
process.env.QA_MODE = '1';
const K = require('../core/rpg/kingdom3d');
const r = require('../core/rpg/homesteadBaseRenderer');
const orig = K.HexWorld.prototype.put;
let W = null;
const hits = [];
K.HexWorld.prototype.put = function (name, c, rr, o) {
    if (/fence_wood_straight_gate|house_barn/.test(name)) {
        const base = K.hexWorld(c, rr);
        const x = o && o.wx != null ? o.wx : base.x;
        const z = o && o.wz != null ? o.wz : base.z;
        hits.push({ name, x, z, flip: !!(o && o.flip) });
    }
    if (!W) W = this;                                   // first world instance = the render's world
    return orig.call(this, name, c, rr, o);
};
(async () => {
    const owners = process.argv[2] ? process.argv[2].split(',') : ['Aegir'];
    for (const owner of owners) {
        hits.length = 0; W = null;
        const state = {
            owner, biome: 'isle',
            structures: [
                { type: 'house', x: 10, y: 6, level: 3 },
                { type: 'blacksmith', x: 13, y: 5, level: 3 },
                { type: 'medbay', x: 12, y: 10, level: 2 },
                { type: 'alchemy', x: 4, y: 5, level: 2 },
                { type: 'mines', x: 1, y: 1, level: 2 },
                { type: 'pond', x: 12, y: 1, level: 3 },
            ],
            freePlots: [{ id: 1, x: 2, y: 13, fw: 3, fh: 3 }, { id: 2, x: 5, y: 11, fw: 3, fh: 3 }],
        };
        await r.renderFrame(state, 0, { returnCanvas: true });
        console.log('=== ' + owner);
        for (const h of hits) {
            const p = W.proj(h.x, h.z);
            console.log(`  ${h.name} px(${Math.round(p.x)},${Math.round(p.y)}) flip=${h.flip}`);
        }
    }
})().catch((e) => { console.error(e); process.exit(1); });
