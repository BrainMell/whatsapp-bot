'use strict';
// bake_life.js — Task 47 "bring it to life" proof: animated mp4 of the player base + guild kingdom
//   node scripts/bake_life.js [outDir]
const fs = require('fs');
const OUT = process.argv[2] || '/tmp/life';
process.env.QA_MODE = process.env.QA_MODE || '1';
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const r = require('../core/rpg/homesteadBaseRenderer');
    const g = require('../core/rpg/guildBaseRenderer');
    const state = {
        owner: 'Mellow', biome: 'isle',                  // isle → ocean + lake: the water showpiece
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
    const t0 = Date.now();
    const base = await r.renderBaseImage(state, { hint: 'base build <type> [plot]  •  base upgrade <type|#>  •  base info' });
    console.log('base media:', base.contentType, (base.buffer.length / 1024).toFixed(0) + 'KB', (Date.now() - t0) + 'ms');
    fs.writeFileSync(OUT + '/base_life.' + (base.contentType === 'video/mp4' ? 'mp4' : 'jpg'), base.buffer);

    const gs = {
        name: 'Iron Wolves', level: 12, archetype: 'ADVENTURER',
        buildings: { hall: 5, training: 5, treasury: 5 }, memberCount: 12, memberCap: 25,
        emblemColor: '#a02c3c', emblemIcon: 'W', motto: 'Steel and mead',
        biome: 'highlands', continent: 'wildwood',
    };
    const t1 = Date.now();
    const guild = await g.renderGuildBaseImage(gs, { hint: 'guild upgrade hall • guild donate • guild perks' });
    console.log('guild media:', guild.contentType, (guild.buffer.length / 1024).toFixed(0) + 'KB', (Date.now() - t1) + 'ms');
    fs.writeFileSync(OUT + '/guild_life.' + (guild.contentType === 'video/mp4' ? 'mp4' : 'jpg'), guild.buffer);

    // contact-sheet frames (static + mid-loop)
    const bf0 = await r.renderFrame(state, 0, { returnCanvas: true });
    fs.writeFileSync(OUT + '/base_f0.png', bf0.toBuffer('image/png'));
    const bf7 = await r.renderFrame(state, 7, { returnCanvas: true });
    fs.writeFileSync(OUT + '/base_f7.png', bf7.toBuffer('image/png'));
    const gf0 = await g.renderFrame(gs, 0, { returnCanvas: true });
    fs.writeFileSync(OUT + '/guild_f0.png', gf0.toBuffer('image/png'));
    const gf7 = await g.renderFrame(gs, 7, { returnCanvas: true });
    fs.writeFileSync(OUT + '/guild_f7.png', gf7.toBuffer('image/png'));
    console.log('life bakes done -> ' + OUT);
})().catch((e) => { console.error('bake failed:', e.stack || e.message); process.exit(1); });
