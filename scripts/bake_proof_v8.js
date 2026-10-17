'use strict';
// bake_proof_v8.js — STONE WALKWAYS + COTTAGE SCALE + REFERENCE TREE WALL
// proof (owner 2026-10-17, reply to the g6 live render: trees outside the
// fence arranged like the player base reference / houses too big again /
// stone walkways with the dirt kept alongside).
// Coast biome (the guild seed's roll) + forest variant + L1 and L5 castles.
const fs = require('fs');
const path = require('path');
const guild = require('../core/rpg/guildBaseRenderer');

const OUT = process.env.PROOF_OUT || '/tmp/proof_v8';
fs.mkdirSync(OUT, { recursive: true });

const gState = {
    name: 'Mistfall', level: 15, archetype: 'ADVENTURER',
    buildings: { hall: 5, training: 3, treasury: 5 },
    memberCount: 5, memberCap: 25,
    emblemColor: '#a02c3c', emblemIcon: 'V', motto: 'Steel and mead',
};

(async () => {
    const t0 = Date.now();
    const shots = [
        // coast biome (was the sparse-outside offender)
        ['v8_coast_l5.png', { ...gState, name: 'Stone Watch' }],
        // the live guild look at castle L1 + 5 cottages (cottage-scale check)
        ['v8_niflheim_l1.png', { ...gState, name: 'NIFLHEIM', buildings: { hall: 1, training: 0, treasury: 0 } }],
        // other biomes after the tree-wall unification
        ['v8_forest_l5.png', gState],
        ['v8_highlands_l5.png', { ...gState, name: 'Highfell Watch' }],
        ['v8_ruins_l5.png', { ...gState, name: 'Niflheim' }],
    ];
    for (const [name, st] of shots) {
        const buf = await guild.renderFrame(st, 0, { static: true });
        fs.writeFileSync(path.join(OUT, name), buf);
        console.log(name, (buf.length / 1024).toFixed(0) + 'KB', Date.now() - t0 + 'ms');
    }
    console.log('DONE ->', OUT);
    process.exit(0);
})().catch((e) => { console.error('PROOF FAIL:', e); process.exit(1); });
