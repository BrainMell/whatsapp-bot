'use strict';
// render_base_kingdom.js - bake player-base proof cards: node scripts/render_base_kingdom.js [outDir]
const fs = require('fs'); const path = require('path');
const OUT = process.argv[2] || '/tmp/base_kingdom';
process.env.QA_MODE = process.env.QA_MODE || '1';
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const r = require('../core/rpg/homesteadBaseRenderer');
    const L = r.LAYOUT;
    const fixed = (lv) => [
        { type: 'house', level: lv.house, x: L.house.x, y: L.house.y },
        { type: 'mines', level: lv.mines, x: L.mines.x, y: L.mines.y },
        { type: 'pond', level: lv.pond, x: L.pond.x, y: L.pond.y },
        { type: 'hunting', level: 1, x: L.hunting.x, y: L.hunting.y },
    ];
    const plots = [{ id: 1, x: 8, y: 1 }, { id: 2, x: 13, y: 7 }, { id: 3, x: 4, y: 5 }, { id: 4, x: 2, y: 13 }].map((p) => ({ ...p, fw: 3, fh: 3 }));
    const shots = [
        ['starter', { owner: 'Mellow', structures: fixed({ house: 1, mines: 1, pond: 1 }), freePlots: plots }],
        ['grown', { owner: 'Kaito', structures: [...fixed({ house: 3, mines: 3, pond: 2 }), { type: 'blacksmith', level: 3, x: 8, y: 1 }, { type: 'medbay', level: 2, x: 13, y: 7 }], freePlots: plots.slice(2) }],
        ['alchemy', { owner: 'Sora Vale', structures: [...fixed({ house: 2, mines: 2, pond: 3 }), { type: 'alchemy', level: 3, x: 4, y: 5 }, { type: 'blacksmith', level: 1, x: 2, y: 13 }], freePlots: [plots[0], plots[1]] }],
    ];
    for (const [n, st] of shots) {
        const t0 = Date.now();
        const o = await r.renderBaseImage(st, { static: true });
        fs.writeFileSync(path.join(OUT, n + '.jpg'), o.buffer);
        console.log(n, (o.buffer.length / 1024).toFixed(0) + 'KB', Date.now() - t0 + 'ms');
    }
    process.exit(0);
})().catch((e) => { console.error('FAIL', e.stack || e); process.exit(1); });
