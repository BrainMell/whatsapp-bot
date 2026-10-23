'use strict';
// bake_assets.js - i "utilise all the KayKit assets" proof: stills per biome
// node scripts/bake_assets.js [outDir]
const fs = require('fs');
const OUT = process.argv[2] || '/tmp/assets47i';
process.env.QA_MODE = '1';
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const r = require('../core/rpg/homesteadBaseRenderer');
    const g = require('../core/rpg/guildBaseRenderer');

 // LOW-level guild per biome: hall 2 / training 1 / treasury 2 - barracks, drill lawn,
 // market square, postern and the wilderness windmill must all show at LOW level now
    const biomes = ['isle', 'desert', 'tundra', 'highlands', 'volcanic'];
    for (const biome of biomes) {
        const gs = {
            name: biome.toUpperCase() + ' Wardens', level: 6, archetype: 'ADVENTURER',
            buildings: { hall: 2, training: 1, treasury: 2 }, memberCount: 7, memberCap: 25,
            emblemColor: '#a02c3c', emblemIcon: 'W', motto: 'Steel and mead',
            biome, continent: biome === 'isle' ? 'aldafold' : biome,
        };
        const cv = await g.renderFrame(gs, 0, { returnCanvas: true });
        fs.writeFileSync(`${OUT}/guild_${biome}_low.png`, cv.toBuffer('image/png'));
        console.log('guild', biome, 'low: ok');
    }
 // MAXED highlands guild: castle + 2nd barracks + market + archeryrange + catapult tower
    {
        const gs = {
            name: 'Iron Wolves', level: 12, archetype: 'ADVENTURER',
            buildings: { hall: 5, training: 5, treasury: 5 }, memberCount: 18, memberCap: 25,
            emblemColor: '#a02c3c', emblemIcon: 'W', motto: 'Steel and mead',
            biome: 'highlands', continent: 'wildwood',
        };
        const cv = await g.renderFrame(gs, 0, { returnCanvas: true });
        fs.writeFileSync(`${OUT}/guild_highlands_max.png`, cv.toBuffer('image/png'));
        console.log('guild highlands max: ok');
    }
 // homestead: coast biome (FARM) with blacksmith lvl3 - barn in the farm patch, fence gate on the walk
    const state = {
        owner: 'Mellow', biome: 'isle',
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
    const cv = await r.renderFrame(state, 0, { returnCanvas: true });
    fs.writeFileSync(`${OUT}/base_coast.png`, cv.toBuffer('image/png'));
    console.log('base coast: ok');
    console.log('DONE ->', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
