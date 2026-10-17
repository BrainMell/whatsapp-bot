'use strict';
// bake_proof_v9.js — TREE TERRAINS + BASE STONE WALKWAYS proof (owner
// 2026-10-17, v81 stack: "I don't see any tree terrains outside like in my
// reference image and you left the stone roads out of the base one the
// guild???"). Bakes the player BASE (stone walkways + dark wild floor) and
// guild grounds (wild floor + woodland decay) across biomes.
const fs = require('fs');
const path = require('path');
const guild = require('../core/rpg/guildBaseRenderer');
const base = require('../core/rpg/homesteadBaseRenderer');
const outlands = require('../core/rpg/isoOutlands');

const OUT = process.env.PROOF_OUT || '/tmp/proof_v9';
fs.mkdirSync(OUT, { recursive: true });

const gState = {
    name: 'Mistfall', level: 15, archetype: 'ADVENTURER',
    buildings: { hall: 5, training: 3, treasury: 5 },
    memberCount: 5, memberCap: 25,
    emblemColor: '#a02c3c', emblemIcon: 'V', motto: 'Steel and mead',
};

const baseState = (owner) => ({
    owner,
    structures: [
        { uid: 'h', type: 'house', level: 1, x: 6, y: 7 },
        { uid: 'm', type: 'mines', level: 1, x: 1, y: 1 },
        { uid: 'p', type: 'pond', level: 1, x: 12, y: 1 },
        { uid: 'hu', type: 'hunting', level: 1, x: 3, y: 8 },
    ],
    freePlots: [{ x: 3, y: 12, id: 1 }, { x: 11, y: 12, id: 2 }],
});

(async () => {
    const t0 = Date.now();
    const shots = [
        // player base — stone walkways + outside tree terrain (2 owner seeds)
        ['v9_base_a.png', () => base.renderBaseImage(baseState('Niflheim'), { static: true })],
        ['v9_base_b.png', () => base.renderBaseImage(baseState('Aria'), { static: true })],
        // guild — wild floor + woodland decay (coast = the critiqued biome)
        ['v9_guild_coast.png', () => guild.renderFrame({ ...gState, name: 'Stone Watch' }, 0, { static: true })],
        ['v9_guild_forest.png', () => guild.renderFrame(gState, 0, { static: true })],
    ];
    for (const [name, fn] of shots) {
        const buf = await fn();
        fs.writeFileSync(path.join(OUT, name), buf);
        console.log(name, (buf.length / 1024).toFixed(0) + 'KB', Date.now() - t0 + 'ms');
    }
    for (const o of ['Niflheim', 'Aria', 'Stone Watch', 'Mistfall']) {
        console.log('biomeOf', JSON.stringify(o), '->', outlands.biomeOf(o));
    }
    console.log('DONE ->', OUT);
    process.exit(0);
})().catch((e) => { console.error('PROOF FAIL:', e); process.exit(1); });
