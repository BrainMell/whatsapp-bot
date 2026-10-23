'use strict';
// qa_ambient.js - life-layer regression ("bring it to life"):
// frames animate, the ocean sprinkles VISIBLY, wilds move, the guild card is a
// gif/mp4 by default (static opt intact), every realm renders without crashing.
// node scripts/qa_ambient.js
process.env.QA_MODE = '1';
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ok - ' + msg); } else { fail++; console.error('  FAIL - ' + msg); } };

(async () => {
    const r = require('../core/rpg/homesteadBaseRenderer');
    const g = require('../core/rpg/guildBaseRenderer');
    const amb = require('../core/rpg/ambient');

    const state = {
        owner: 'Mellow', biome: 'isle',                  // isle → ocean + lake
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

    const diff = (a, b, x0, y0, x1, y1) => {
        const da = a.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0).data;
        const db = b.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0).data;
        let n = 0;
        for (let i = 0; i < da.length; i += 4) {
            if (Math.abs(da[i] - db[i]) > 6 || Math.abs(da[i + 1] - db[i + 1]) > 6 || Math.abs(da[i + 2] - db[i + 2]) > 6) n++;
        }
        return n;
    };

 // 1) card geometry unchanged + frames genuinely animate
    const f0 = await r.renderFrame(state, 0, { returnCanvas: true });
    const f5 = await r.renderFrame(state, 5, { returnCanvas: true });
    ok(f0.width === 1960 && f0.height === 1420, 'static card size unchanged (1960x1420)');
    const whole = diff(f0, f5, 0, 0, f0.width, f0.height);
    ok(whole > 3000, 'frames animate (' + whole + ' px differ)');

 // 2) THE OCEAN ACTUALLY SPARKLES ("little sprinkling barely noticeable")
    const W = f0.width, H = f0.height;
    const waterPx = diff(f0, f5, Math.round(W * 0.72), Math.round(H * 0.60), Math.round(W * 0.97), Math.round(H * 0.92));
    ok(waterPx > 500, 'ocean visibly animated (' + waterPx + ' px differ in ocean region)');

 // 3) wilds alive (sway + clouds + tint + birds)
    const landPx = diff(f0, f5, Math.round(W * 0.05), Math.round(H * 0.10), Math.round(W * 0.30), Math.round(H * 0.40));
    ok(landPx > 100, 'wilds alive (' + landPx + ' px differ in woods region)');

 // 4) ambient API surface
    ok(['glints', 'animateWater', 'swayTrees', 'drawSway', 'drawBirds', 'drawButterflies', 'drawCloudShadows', 'drawTint']
        .every((k) => typeof amb[k] === 'function'), 'ambient API complete');

 // 5) guild card is a gif/mp4 BY DEFAULT now
    const gs = {
        name: 'Iron Wolves', level: 12, archetype: 'ADVENTURER',
        buildings: { hall: 5, training: 5, treasury: 5 }, memberCount: 12, memberCap: 25,
        emblemColor: '#a02c3c', emblemIcon: 'W', motto: 'Steel and mead',
        biome: 'highlands', continent: 'wildwood',
    };
    const t0 = Date.now();
    const media = await g.renderGuildBaseImage(gs, { hint: 'qa' });
    ok(media.contentType === 'video/mp4' && media.buffer.length > 150000,
        'guild card animated by default (' + media.contentType + ', ' + (media.buffer.length / 1024).toFixed(0) + 'KB, ' + (Date.now() - t0) + 'ms)');
    const st = await g.renderGuildBaseImage({ ...gs, name: 'Iron Wolves Static' }, { hint: 'qa', static: true });
    ok(st.contentType === 'image/jpeg', 'guild static opt still JPEG (' + st.contentType + ')');

 // 6) every realm animates without crashing (lava pulse + ice glints included)
    for (const biome of ['desert', 'tundra', 'volcanic', 'highlands']) {
        const b0 = await r.renderFrame({ ...state, owner: 'qa-' + biome, biome }, 2, { returnCanvas: true });
        const b1 = await r.renderFrame({ ...state, owner: 'qa-' + biome, biome }, 8, { returnCanvas: true });
        const d = diff(b0, b1, 0, 0, b0.width, b0.height);
        ok(d > 1500, biome + ' realm animates (' + d + ' px differ)');
    }

    console.log('ambient QA: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('qa crashed:', e.stack || e.message); process.exit(1); });
