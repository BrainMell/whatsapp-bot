'use strict';
// render_base_realms.js - the same player base in each of the five realms:
// node scripts/render_base_realms.js [outDir]
const fs = require('fs'); const path = require('path');
const OUT = process.argv[2] || '/tmp/base_realms';
process.env.QA_MODE = process.env.QA_MODE || '1';
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const r = require('../core/rpg/homesteadBaseRenderer');
    const C = require('../core/rpg/continents');
    const L = r.LAYOUT;
    const structures = [
        { type: 'house', level: 3, x: L.house.x, y: L.house.y }, { type: 'mines', level: 3, x: L.mines.x, y: L.mines.y },
        { type: 'pond', level: 2, x: L.pond.x, y: L.pond.y }, { type: 'hunting', level: 1, x: L.hunting.x, y: L.hunting.y },
        { type: 'blacksmith', level: 3, x: 8, y: 1 },
    ];
    const freePlots = [{ id: 2, x: 13, y: 7 }, { id: 3, x: 4, y: 5 }, { id: 4, x: 2, y: 13 }].map((p) => ({ ...p, fw: 3, fh: 3 }));
    for (const c of C.CONTINENTS) {
        const t0 = Date.now();
        const o = await r.renderBaseImage({ owner: 'Kaito', continent: c.key, structures, freePlots }, { static: true });
        fs.writeFileSync(path.join(OUT, `${c.key}.jpg`), o.buffer);
        console.log(c.key, (o.buffer.length / 1024).toFixed(0) + 'KB', Date.now() - t0 + 'ms');
    }
    process.exit(0);
})().catch((e) => { console.error('FAIL', e.stack || e); process.exit(1); });
