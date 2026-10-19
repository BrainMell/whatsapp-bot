'use strict';
// bake47k.js — Task 47-k part 0 proof: the pack cave moved INSIDE the walled district
// (quarry yard behind the keep, dressed working site) and the ridge-foot mine is gone.
//   node scripts/bake47k.js [outDir]
const fs = require('fs');
const OUT = process.argv[2] || '/tmp/assets47k';
process.env.QA_MODE = '1';
const { createCanvas } = require('canvas');

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const K = require('../core/rpg/kingdom3d');
    const g = require('../core/rpg/guildBaseRenderer');

    const orig = K.HexWorld.prototype.put;
    let W = null;
    const mines = [];
    K.HexWorld.prototype.put = function (name, c, rr, o) {
        if (!W) W = this;
        if (/^building_mine_/.test(name)) {
            const base = K.hexWorld(c, rr);
            mines.push({ x: o && o.wx != null ? o.wx : base.x, z: o && o.wz != null ? o.wz : base.z });
        }
        return orig.call(this, name, c, rr, o);
    };

    const crop2x = (cv, wx, wz, halfW, halfH, tag) => {
        const p = W.proj(wx, wz);
        const sx = Math.max(0, Math.round(p.x - halfW)), sy = Math.max(0, Math.round(p.y - halfH));
        const sw = Math.min(cv.width - sx, halfW * 2), sh = Math.min(cv.height - sy, halfH * 2);
        const out = createCanvas(sw * 2, sh * 2), ctx = out.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(cv, sx, sy, sw, sh, 0, 0, sw * 2, sh * 2);
        fs.writeFileSync(`${OUT}/${tag}.png`, out.toBuffer('image/png'));
        console.log(tag, 'ok @px', Math.round(p.x), Math.round(p.y));
    };

    for (const [biome, hall] of [['volcanic', 2], ['isle', 2], ['desert', 2], ['volcanic', 5]]) {
        W = null; mines.length = 0;
        const gs = { name: biome.toUpperCase() + ' Wardens', level: 6, archetype: 'ADVENTURER', buildings: { hall, training: 1, treasury: 2 }, memberCount: 7, memberCap: 25, biome, continent: biome };
        const cv = await g.renderFrame(gs, 0, { returnCanvas: true });
        const tag = `guild_${biome}_h${hall}`;
        fs.writeFileSync(`${OUT}/${tag}_full.png`, cv.toBuffer('image/png'));
        if (mines.length) crop2x(cv, mines[0].x, mines[0].z, 200, 155, `${tag}_mine`);
        else console.log(tag, 'NO MINE — FAIL');
    }
    console.log('DONE ->', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
