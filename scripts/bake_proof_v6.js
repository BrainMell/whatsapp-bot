'use strict';
// bake_proof_v6.js — GUILD v5 SCALE LAW proof (owner 2026-10-17: "it's still
// the same size as a regular base... space inside the walls and outside
// should be double the size maybe triple").
// Renders the v5 guild grounds (28x28 playable diamond = 3x the base's tile
// count, 5-tile outside yard band, 2560x1500 canvas) at the SAME tile scale
// as a regular 16x16 base (1240x850 canvas) so the size jump is provable,
// plus L5 / L1 guild singles.
const fs = require('fs');
const path = require('path');
const hsBase = require('../core/rpg/homesteadBaseRenderer');
const guild = require('../core/rpg/guildBaseRenderer');

const OUT = '/home/z/my-project/download/proof_v6';
fs.mkdirSync(OUT, { recursive: true });
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

const gState = {
    name: 'Iron Vanguard', level: 4, archetype: 'ADVENTURER',
    buildings: { hall: 5, training: 3, treasury: 5 },
    memberCount: 3, memberCap: 20,
    emblemColor: '#a02c3c', emblemIcon: 'V', motto: 'Steel and mead',
};

(async () => {
    const t0 = Date.now();
    const base = await hsBase.renderFrame(baseState('PlayerA0'), 0, { static: true });
    fs.writeFileSync(path.join(OUT, 'base_16_ref.png'), base);
    console.log('base 16x16 ', (base.length / 1024).toFixed(0) + 'KB', Date.now() - t0 + 'ms');

    const g5 = await guild.renderFrame(gState, 0, { static: true });
    fs.writeFileSync(path.join(OUT, 'guild_v5_castle_l5.png'), g5);
    console.log('guild v5 l5', (g5.length / 1024).toFixed(0) + 'KB', Date.now() - t0 + 'ms');

    const g1 = await guild.renderFrame({ ...gState, buildings: { hall: 1, training: 0, treasury: 0 }, memberCount: 1 }, 0, { static: true });
    fs.writeFileSync(path.join(OUT, 'guild_v5_castle_l1.png'), g1);
    console.log('guild v5 l1', (g1.length / 1024).toFixed(0) + 'KB', Date.now() - t0 + 'ms');
    console.log('DONE ->', OUT);
    process.exit(0);
})().catch((e) => { console.error('PROOF FAIL:', e); process.exit(1); });
