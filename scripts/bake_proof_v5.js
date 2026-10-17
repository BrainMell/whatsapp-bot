'use strict';
// bake_proof_v5.js — round 3 proofs (local sandbox bake; canvas now available).
// Renders:
//   1. base views for FOUR different owners — one per procedural-wilds biome
//      (deepwood / highlands / vale / coast) to prove the per-player world law
//   2. guild v4 view (castle L5 + plots + stone wall + its own wilds)
//   3. guild L1 view (outpost keep)
const fs = require('fs');
const path = require('path');
const wilds = require('../core/rpg/wilds');
const hsBase = require('../core/rpg/homesteadBaseRenderer');
const guild = require('../core/rpg/guildBaseRenderer');

const OUT = '/home/z/my-project/download/proof_v5';
fs.mkdirSync(OUT, { recursive: true });

// LAYOUT mirrors homesteadBaseRenderer's v2 layout
const L = hsBase.LAYOUT;

function baseState(owner) {
    return {
        owner,
        structures: [
            { type: 'house', level: 3, x: L.house.x, y: L.house.y },
            { type: 'blacksmith', level: 3, x: 11, y: 11 },
            { type: 'medbay', level: 2, x: 1, y: 11 },
            { type: 'alchemy', level: 1, x: 12, y: 3 },
            { type: 'mines', level: 3, x: L.mines.x, y: L.mines.y },
            { type: 'pond', level: 2, x: L.pond.x, y: L.pond.y },
            { type: 'hunting', level: 1, x: L.hunting.x, y: L.hunting.y },
        ],
        freePlots: [{ id: 1, x: 5, y: 13 }, { id: 2, x: 11, y: 13 }],
    };
}

(async () => {
    // 1) find one owner key per biome
    const want = ['deepwood', 'highlands', 'vale', 'coast'];
    const found = {};
    const pool = [];
    for (let i = 0; i < 400 && Object.keys(found).length < want.length; i++) {
        const key = 'Player' + String.fromCharCode(65 + (i % 26)) + (i > 25 ? i : '');
        const b = wilds.wildsProfile(key).biome;
        pool.push([key, b]);
        if (!found[b]) found[b] = key;
    }
    console.log('biome map:', found);
    console.log('distribution sample:', pool.slice(0, 12));

    for (const b of want) {
        const owner = found[b];
        if (!owner) continue;
        const buf = await hsBase.renderFrame(baseState(owner), 0, { static: true });
        fs.writeFileSync(path.join(OUT, `base_${b}_${owner}.png`), buf);
        console.log('base', b, owner, (buf.length / 1024).toFixed(0) + 'KB');
    }

    // 2) guild v4
    const gState = {
        name: 'Iron Vanguard', level: 4, archetype: 'ADVENTURER',
        buildings: { hall: 5, training: 3, treasury: 5 },
        memberCount: 3, memberCap: 20,
        emblemColor: '#a02c3c', emblemIcon: 'V', motto: 'Steel and mead',
    };
    const g5 = await guild.renderFrame(gState, 0, { static: true });
    fs.writeFileSync(path.join(OUT, 'guild_v4_castle_l5.png'), g5);
    console.log('guild l5', (g5.length / 1024).toFixed(0) + 'KB');

    const gState1 = { ...gState, buildings: { hall: 1, training: 0, treasury: 0 }, memberCount: 1 };
    const g1 = await guild.renderFrame(gState1, 0, { static: true });
    fs.writeFileSync(path.join(OUT, 'guild_v4_castle_l1.png'), g1);
    console.log('guild l1', (g1.length / 1024).toFixed(0) + 'KB');

    console.log('DONE ->', OUT);
    process.exit(0);
})().catch((e) => { console.error('PROOF FAIL:', e); process.exit(1); });
