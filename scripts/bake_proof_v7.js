'use strict';
// bake_proof_v7.js — GUILD v6 CITADEL PLAN proof (owner 2026-10-17:
// "change around the layout formula ... castle at the edge of the right
// side topwards, paths leading out to different areas that can host
// houses, procedural generation around that, too many trees, background
// looks weird, rotate the castle").
// L5 full grounds + L1 + L3 + L0 variants so every tier of the new plan
// can be eyeballed before deploy.
const fs = require('fs');
const path = require('path');
const guild = require('../core/rpg/guildBaseRenderer');

const OUT = '/home/z/my-project/download/proof_v7';
fs.mkdirSync(OUT, { recursive: true });

const gState = {
    name: 'Iron Vanguard', level: 4, archetype: 'ADVENTURER',
    buildings: { hall: 5, training: 3, treasury: 5 },
    memberCount: 5, memberCap: 20,
    emblemColor: '#a02c3c', emblemIcon: 'V', motto: 'Steel and mead',
};

(async () => {
    const t0 = Date.now();
    const shots = [
        ['guild_v6_l5.png', gState],
        ['guild_v6_l3.png', { ...gState, buildings: { hall: 3, training: 2, treasury: 3 }, memberCount: 3 }],
        ['guild_v6_l1.png', { ...gState, buildings: { hall: 1, training: 0, treasury: 0 }, memberCount: 1 }],
        ['guild_v6_l0.png', { ...gState, buildings: { hall: 0, training: 0, treasury: 0 }, memberCount: 0 }],
        ['guild_v6_merchant.png', { ...gState, archetype: 'MERCHANT', emblemColor: '#b8862e' }],
    ];
    for (const [name, st] of shots) {
        const buf = await guild.renderFrame(st, 0, { static: true });
        fs.writeFileSync(path.join(OUT, name), buf);
        console.log(name, (buf.length / 1024).toFixed(0) + 'KB', Date.now() - t0 + 'ms');
    }
    console.log('DONE ->', OUT);
    process.exit(0);
})().catch((e) => { console.error('PROOF FAIL:', e); process.exit(1); });
