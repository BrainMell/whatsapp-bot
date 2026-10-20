'use strict';
// proof: node scripts/render_base_qa.js [outDir]  → static player-base card with the
// 47-k8 Clash gold-mine ladder + Clash garnish, plus three single-structure zooms.
const fs = require('fs');
const OUT = process.argv[2] || '/tmp/baseqa';
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const R = require('../core/rpg/homesteadBaseRenderer');
    const L = R.LAYOUT;
    const mk = (levels) => ({
        owner: 'QA47k8',
        structures: [
            { type: 'house', level: levels.house, x: L.house.x, y: L.house.y },
            { type: 'mines', level: levels.mines, x: L.mines.x, y: L.mines.y },
            { type: 'pond', level: 2, x: L.pond.x, y: L.pond.y },
            { type: 'hunting', level: 1, x: L.hunting.x, y: L.hunting.y },
            ...(levels.full ? [
                { type: 'blacksmith', level: 3, x: 8, y: 1 },      // plot 1: forge torch + lv3 Great Forge
                { type: 'alchemy', level: 3, x: 13, y: 7 },        // plot 2: wizard statue + Observatory
                { type: 'medbay', level: 3, x: 4, y: 5 },          // plot 3: sanatorium
            ] : []),
        ],
        freePlots: levels.full ? [{ id: 4, x: 2, y: 13, fw: 3, fh: 3, free: true, built: null }] : [],
    });
    for (const lv of [{ house: 1, mines: 1 }, { house: 2, mines: 2 }, { house: 3, mines: 3, full: true }]) {
        const t0 = Date.now();
        const out = await R.renderBaseImage(mk(lv), { static: true });
        const f = `${OUT}/base_h${lv.house}_m${lv.mines}.jpg`;
        fs.writeFileSync(f, out.buffer);
        console.log('wrote', f, (out.buffer.length / 1024).toFixed(0) + 'KB', (Date.now() - t0) + 'ms');
    }
})().catch((e) => { console.error(e.stack); process.exit(1); });
