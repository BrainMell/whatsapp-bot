'use strict';
// qa_alchemy.js - alchemy centre dedicated-model proof (struct_alc_* wiring).
// Renders a real homestead base with the alchemy building at L1/L2/L3 through
// homesteadBaseRenderer (the live code path) + 2x close-ups of each tier.
// node scripts/qa_alchemy.js [outDir]
const fs = require('fs');
const OUT = process.argv[2] || '/tmp/qa_alchemy';
process.env.QA_MODE = '1';
const { createCanvas } = require('canvas');

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const K = require('../core/rpg/kingdom3d');
    const r = require('../core/rpg/homesteadBaseRenderer');

    const orig = K.HexWorld.prototype.put;
    let W = null;
    const alc = [];
    K.HexWorld.prototype.put = function (name, c, rr, o) {
        if (!W) W = this;
        if (/^struct_alc_/.test(name)) {
            const base = K.hexWorld(c, rr);
            alc.push({ x: o && o.wx != null ? o.wx : base.x, z: o && o.wz != null ? o.wz : base.z });
        }
        return orig.call(this, name, c, rr, o);
    };

    const crop2x = (cv, wx, wz, halfW, halfH, tag, h = 0) => {
        const p = W.proj(wx, wz, h);
        const sx = Math.max(0, Math.round(p.x - halfW)), sy = Math.max(0, Math.round(p.y - halfH));
        const sw = Math.min(cv.width - sx, halfW * 2), sh = Math.min(cv.height - sy, halfH * 2);
        const out = createCanvas(sw * 2, sh * 2), ctx = out.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(cv, sx, sy, sw, sh, 0, 0, sw * 2, sh * 2);
        fs.writeFileSync(`${OUT}/${tag}.png`, out.toBuffer('image/png'));
        console.log(tag, 'ok @px', Math.round(p.x), Math.round(p.y));
    };

    for (const lvl of [1, 2, 3]) {
        W = null; alc.length = 0;
        const state = { owner: 'Aegir', biome: 'isle', structures: [{ type: 'house', x: 10, y: 6, level: 3 }, { type: 'alchemy', x: 1, y: 1, level: lvl }, { type: 'pond', x: 12, y: 1, level: 1 }], freePlots: [] };
        const cv = await r.renderFrame(state, 0, { returnCanvas: true });
        fs.writeFileSync(`${OUT}/base_alchemy_lv${lvl}_full.png`, cv.toBuffer('image/png'));
        if (alc.length) crop2x(cv, alc[0].x, alc[0].z, 190, 155, `alchemy_lv${lvl}_2x`);
        else console.log('base lv' + lvl, 'NO ALCHEMY SPRITE PLACED - FAIL');
    }
    console.log('DONE ->', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
