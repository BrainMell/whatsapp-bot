'use strict';
// render_guild_kingdom.js - bake guild kingdom proof cards: node scripts/render_guild_kingdom.js [outDir]
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || '/tmp/guild_kingdom';
process.env.QA_MODE = process.env.QA_MODE || '1';
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const g = require('../core/rpg/guildBaseRenderer');
    const shots = [
        ['l5_adventurer', { name: 'Iron Wolves', level: 12, archetype: 'ADVENTURER', buildings: { hall: 5, training: 5, treasury: 5 }, memberCount: 12, memberCap: 25, emblemColor: '#a02c3c', emblemIcon: 'W', motto: 'Steel and mead' }],
        ['l3_merchant', { name: 'Gilded Ledger', level: 6, archetype: 'MERCHANT', buildings: { hall: 3, training: 2, treasury: 4 }, memberCount: 7, memberCap: 20, emblemColor: '#b8862e', emblemIcon: 'M' }],
        ['starter_research', { name: 'Quiet Archive', level: 1, archetype: 'RESEARCH', buildings: { hall: 0, training: 0, treasury: 0 }, memberCount: 1, memberCap: 10, emblemColor: '#2a6a6e', emblemIcon: 'R' }],
        ['mid', { name: 'Dawn Vanguard', level: 4, archetype: 'ADVENTURER', buildings: { hall: 2, training: 1, treasury: 1 }, memberCount: 4, memberCap: 15 }],
    ];
    for (const [n, st] of shots) {
        const t0 = Date.now();
        const o = await g.renderGuildBaseImage(st, { hint: '.j guild upgrade hall • .j guild donate • .j guild perks' });
        fs.writeFileSync(path.join(OUT, n + '.jpg'), o.buffer);
        console.log(n, (o.buffer.length / 1024).toFixed(0) + 'KB', Date.now() - t0 + 'ms');
    }
    process.exit(0);
})().catch((e) => { console.error('FAIL', e.stack || e); process.exit(1); });
