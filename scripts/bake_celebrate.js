'use strict';
// bake_celebrate.js — confetti proof: a mid-fall celebrate frame of the player base
//   node scripts/bake_celebrate.js [outDir]
const fs = require('fs');
const OUT = process.argv[2] || '/tmp/celebrate';
process.env.QA_MODE = process.env.QA_MODE || '1';
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const r = require('../core/rpg/homesteadBaseRenderer');
    const g = require('../core/rpg/guildBaseRenderer');
    const ids = r.structures().structures.map((s) => s.id).filter((id) => ['house', 'farm', 'blacksmith', 'mines', 'pond'].includes(id));
    const state = {
        owner: 'Mellow',
        biome: 'isle',
        structures: ids.map((id, i) => ({ id, plot: i + 1, level: 2 })),
        freePlots: [],
    };
    // player base: frame 12 of 30 → confetti mid-fall, water glinting
    const f = await r.renderFrame(state, 12, { celebrate: true, returnCanvas: true });
    fs.writeFileSync(OUT + '/base_celebrate.png', f.toBuffer('image/png'));
    // guild kingdom celebrate frame
    const gs = {
        name: 'Iron Wolves', level: 12, archetype: 'ADVENTURER',
        buildings: { hall: 5, training: 5, treasury: 5 }, memberCount: 12, memberCap: 25,
        emblemColor: '#a02c3c', emblemIcon: 'W', motto: 'Steel and mead',
        biome: 'highlands', continent: 'wildwood',
    };
    const gf = await g.renderFrame(gs, 12, { celebrate: true, returnCanvas: true });
    fs.writeFileSync(OUT + '/guild_celebrate.png', gf.toBuffer('image/png'));
    console.log('celebrate frames baked to ' + OUT);
})().catch((e) => { console.error('bake failed:', e.message); process.exit(1); });
