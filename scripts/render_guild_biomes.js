'use strict';
// render_guild_biomes.js — proof cards for every biome × several guild names
//   node scripts/render_guild_biomes.js [outDir] [names,comma,separated]
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || '/tmp/guild_biomes';
const NAMES = (process.argv[3] || 'Iron Wolves,Gilded Ledger,Quiet Archive').split(',');
process.env.QA_MODE = process.env.QA_MODE || '1';
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const g = require('../core/rpg/guildBaseRenderer');
    const KT = require('../core/rpg/kingdomTerrain');
    for (const biome of KT.BIOMES) for (const [i, name] of NAMES.entries()) {
        const st = { name, level: 8, archetype: ['ADVENTURER', 'MERCHANT', 'RESEARCH'][i % 3], biome, buildings: { hall: 4 + (i % 2), training: 3, treasury: 3 + i }, memberCount: 8, memberCap: 25, emblemColor: '#a02c3c', emblemIcon: 'W' };
        const t0 = Date.now();
        const o = await g.renderGuildBaseImage(st, { hint: '.j guild', static: true });
        fs.writeFileSync(path.join(OUT, `${biome}_${i}.jpg`), o.buffer);
        console.log(biome, name, (o.buffer.length / 1024).toFixed(0) + 'KB', Date.now() - t0 + 'ms');
    }
    process.exit(0);
})().catch((e) => { console.error('FAIL', e.stack || e); process.exit(1); });
