'use strict';
// bake_layout39.js — Task 39 v2 proof: LAYOUT v4 ORIENTATION PASS
// (gatehouse guards the south gate + facade law + frontable plots)
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || '/tmp/layout39';

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const base = require('../core/rpg/homesteadBaseRenderer');
    // plot anchors v4 (mirror of baseBuilder PLOTS)
    const PLOTS = [
        { id: 1, x: 8, y: 1 }, { id: 2, x: 13, y: 7 }, { id: 3, x: 4, y: 5 }, { id: 4, x: 2, y: 13 },
    ];
    const fixed = (owner) => ([
        { uid: 'a1', type: 'house', level: 1, x: 10, y: 6 },
        { uid: 'a2', type: 'mines', level: 1, x: 1, y: 1 },
        { uid: 'a3', type: 'pond', level: 1, x: 12, y: 1 },
        { uid: 'a4', type: 'hunting', level: 1, x: 7, y: 14 },
    ]);
    // 1. fresh starter base (fixed structures only, all plots free)
    const t0 = Date.now();
    const fresh = await base.renderBaseImage({ owner: 'Bio1', structures: fixed(), freePlots: PLOTS }, { static: true });
    fs.writeFileSync(path.join(OUT, 'base_fresh.jpg'), fresh.buffer);
    console.log(`base_fresh: ${(fresh.buffer.length / 1048576).toFixed(2)}MB ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    // 2. built-out base (blacksmith/medbay/alchemy on plots 1-3)
    const t1 = Date.now();
    const built = await base.renderBaseImage({
        owner: 'Bio1',
        structures: [
            ...fixed(),
            { uid: 'b1', type: 'blacksmith', level: 1, x: 8, y: 1 },
            { uid: 'b2', type: 'medbay', level: 1, x: 13, y: 7 },
            { uid: 'b3', type: 'alchemy', level: 1, x: 4, y: 5 },
        ],
        freePlots: [PLOTS[3]],
    }, { static: true });
    fs.writeFileSync(path.join(OUT, 'base_built.jpg'), built.buffer);
    console.log(`base_built: ${(built.buffer.length / 1048576).toFixed(2)}MB ${((Date.now() - t1) / 1000).toFixed(1)}s`);
    console.log('done');
    process.exit(0);
})().catch((e) => { console.error('FAIL', e && e.stack || e); process.exit(1); });
