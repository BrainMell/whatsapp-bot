'use strict';
// bake47k.js — Task 47-k proof: hall-tier city evolution + cave-in-base + emblem crest.
// Bakes full guild cards at hall 1/2/5, x2 close-ups (mine yard, castle crest, ward belt),
// and the player-base mines plot at lv1/2/3 with the pack cave as THE mine.
//   node scripts/bake47k.js [outDir]
const fs = require('fs');
const OUT = process.argv[2] || '/tmp/assets47k';
process.env.QA_MODE = '1';
const { createCanvas } = require('canvas');

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const K = require('../core/rpg/kingdom3d');
    const g = require('../core/rpg/guildBaseRenderer');
    const r = require('../core/rpg/homesteadBaseRenderer');

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
    const ROOF_H = [0, 2.3, 2.2, 2.0, 4.1, 4.1];

    // ── guild tiers: progression cards + close-ups ──
    for (const [biome, hall] of [['volcanic', 1], ['volcanic', 2], ['isle', 2], ['desert', 2], ['volcanic', 5], ['isle', 5]]) {
        W = null; mines.length = 0;
        const gs = { name: biome.toUpperCase() + ' Wardens', level: 6, archetype: 'ADVENTURER', buildings: { hall, training: 1, treasury: 2 }, memberCount: 7, memberCap: 25, biome, continent: biome };
        const cv = await g.renderFrame(gs, 0, { returnCanvas: true });
        const tag = `guild_${biome}_h${hall}`;
        fs.writeFileSync(`${OUT}/${tag}_full.png`, cv.toBuffer('image/png'));
        if (mines.length) crop2x(cv, mines[0].x, mines[0].z, 200, 155, `${tag}_mine`);
        // the emblem crest crowns the keep
        const wc = K.hexWorld(11, 15);
        crop2x(cv, wc.x, wc.z, 150, 190, `${tag}_crest`, (ROOF_H[hall] || 2.5) + 0.9);
        // the ward belt between the double walls (hall 5)
        if (hall >= 4) { const wb = K.hexWorld(11, 22); crop2x(cv, wb.x, wb.z, 230, 150, `${tag}_belt`); }
    }

    // ── base: the pack cave is THE mine — lv1/2/3 ──
    for (const lvl of [1, 2, 3]) {
        W = null; mines.length = 0;
        const state = { owner: 'Aegir', biome: 'isle', structures: [{ type: 'house', x: 10, y: 6, level: 3 }, { type: 'mines', x: 1, y: 1, level: lvl }, { type: 'pond', x: 12, y: 1, level: 1 }], freePlots: [] };
        const cv = await r.renderFrame(state, 0, { returnCanvas: true });
        fs.writeFileSync(`${OUT}/base_mines_lv${lvl}_full.png`, cv.toBuffer('image/png'));
        if (mines.length) crop2x(cv, mines[0].x, mines[0].z, 190, 150, `base_mines_lv${lvl}`);
        else console.log('base lv' + lvl, 'NO MINE — FAIL');
    }
    console.log('DONE ->', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
