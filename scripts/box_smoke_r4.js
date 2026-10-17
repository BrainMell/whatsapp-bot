// Box-side smoke render: real node-canvas render of round4 base + guild.
const path = require('path');
const fs = require('fs');
const ROOT = '/home/ubuntu/whatsapp-bot';
process.chdir(ROOT);
const hs = require(ROOT + '/core/rpg/homesteadBaseRenderer.js');
const gb = require(ROOT + '/core/rpg/guildBaseRenderer.js');

(async () => {
    const baseState = {
        owner: 'Aldric',
        structures: [
            { type: 'house', x: 6, y: 7, level: 2 },
            { type: 'mines', x: 1, y: 1, level: 2 },
            { type: 'pond', x: 12, y: 1, level: 2 },
            { type: 'blacksmith', x: 2, y: 6, level: 2 },
            { type: 'medbay', x: 12, y: 6, level: 2 },
            { type: 'alchemy', x: 8, y: 12, level: 3 },
            { type: 'hunting', x: 3, y: 8, level: 1 },
        ],
        freePlots: [{ id: 1, x: 12, y: 11 }, { id: 2, x: 3, y: 12 }],
    };
    const buf1 = await hs.renderFrame(baseState, 0, {});
    fs.writeFileSync('/tmp/r4_box_base.png', buf1);
    console.log('base frame written', buf1.length);

    const guildState = {
        name: 'Iron Vale',
        archetype: 'ADVENTURER',
        level: 7,
        buildings: { hall: 5, training: 3, treasury: 3 },
        memberCount: 5,
        emblemColor: '#a02c3c',
        emblemIcon: '★',
    };
    const buf2 = await gb.renderFrame(guildState, 0, {});
    fs.writeFileSync('/tmp/r4_box_guild.png', buf2);
    console.log('guild frame written', buf2.length);

    // second owner for a different biome
    const buf3 = await hs.renderFrame({ ...baseState, owner: 'Elder Tim' }, 0, {});
    fs.writeFileSync('/tmp/r4_box_base2.png', buf3);
    console.log('base2 frame written', buf3.length);
    console.log('SMOKE OK');
})().catch((e) => { console.error('SMOKE FAIL', e); process.exit(1); });
