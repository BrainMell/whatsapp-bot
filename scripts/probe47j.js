'use strict';
// probe47j.js — the pack's own mine (walkway-into-rocks) must show on every guild card
// and join the player-base mines plot from lv2. Audit + px projection.
process.env.QA_MODE = '1';
const K = require('../core/rpg/kingdom3d');
const g = require('../core/rpg/guildBaseRenderer');
const r = require('../core/rpg/homesteadBaseRenderer');
const orig = K.HexWorld.prototype.put;
const log = [];
let W = null;
K.HexWorld.prototype.put = function (name, c, rr, o) {
    log.push(name + (o && o.wx != null ? ` @world(${o.wx.toFixed(1)},${o.wz.toFixed(1)})` : ` @hex(${c},${rr})`));
    if (!W) W = this;
    return orig.call(this, name, c, rr, o);
};
const count = (re) => log.filter((l) => re.test(l)).length;

(async () => {
    let fail = 0;
    // ── guild: every biome card carries mine + scaffold + ladder ──
    for (const biome of ['isle', 'desert', 'tundra', 'highlands', 'volcanic']) {
        log.length = 0; W = null;
        const gs = { name: biome.toUpperCase() + ' Wardens', level: 6, archetype: 'ADVENTURER', buildings: { hall: 2, training: 1, treasury: 2 }, memberCount: 7, memberCap: 25, biome, continent: biome };
        await g.renderFrame(gs, 0, { returnCanvas: true });
        const mine = count(/^building_mine_/), scf = count(/^building_scaffolding/), lad = count(/^ladder/);
        const minePx = (() => { const l = log.find((x) => /^building_mine_/.test(x)); if (!l || !/world/.test(l)) return null; const m = l.match(/world\((-?[\d.]+),(-?[\d.]+)\)/); const p = W.proj(+m[1], +m[2]); return `px(${Math.round(p.x)},${Math.round(p.y)})`; })();
        const ok = mine >= 1 && scf >= 1 && lad >= 1;
        if (!ok) fail++;
        console.log(`${ok ? 'PASS' : 'FAIL'} guild ${biome}: mine=${mine} scaffold=${scf} ladder=${lad} ${minePx || ''}`);
    }
    // ── base: mines lv1 = struct only; lv2/3 = pack mine second shaft + ladder ──
    for (const lvl of [1, 2, 3]) {
        log.length = 0; W = null;
        const state = {
            owner: 'Aegir', biome: 'isle',
            structures: [
                { type: 'house', x: 10, y: 6, level: 3 },
                { type: 'mines', x: 1, y: 1, level: lvl },
                { type: 'pond', x: 12, y: 1, level: 1 },
            ],
            freePlots: [],
        };
        await r.renderFrame(state, 0, { returnCanvas: true });
        const mine = count(/^building_mine_/), lad = count(/^ladder/), str = count(/^struct_mine_/);
        const ok = lvl === 1 ? (mine === 0 && str >= 1) : (mine === 1 && lad >= 1 && str >= 1);
        if (!ok) fail++;
        console.log(`${ok ? 'PASS' : 'FAIL'} base mines lv${lvl}: struct=${str} packMine=${mine} ladder=${lad}`);
    }
    console.log(fail === 0 ? 'PROBE 8/8 GREEN' : `PROBE ${8 - fail}/8 — ${fail} FAIL`);
    process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
