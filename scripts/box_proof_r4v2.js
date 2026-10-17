// box_proof_r4v2.js — facing-fix-v2 proofs on box (real node-canvas).
// Bakes: 4 biome rolls (one owner per isoOutlands.biomeOf roll) + guild L5
// + guild L1 + mine L1/L2/L3 solo views for the progression strip.
const path = require('path');
const fs = require('fs');
const ROOT = '/home/ubuntu/whatsapp-bot';
process.chdir(ROOT);
const hs = require(ROOT + '/core/rpg/homesteadBaseRenderer.js');
const gb = require(ROOT + '/core/rpg/guildBaseRenderer.js');
const { biomeOf } = require(ROOT + '/core/rpg/isoOutlands.js');

const OUT = '/tmp/r4v2_proofs';
fs.mkdirSync(OUT, { recursive: true });

const baseState = (owner, minesLevel) => ({
    owner,
    structures: [
        { type: 'house', x: 6, y: 7, level: 2 },
        { type: 'mines', x: 1, y: 1, level: minesLevel },
        { type: 'pond', x: 12, y: 1, level: 2 },
        { type: 'blacksmith', x: 2, y: 6, level: 2 },
        { type: 'medbay', x: 12, y: 6, level: 2 },
        { type: 'alchemy', x: 8, y: 12, level: 3 },
        { type: 'hunting', x: 3, y: 8, level: 1 },
    ],
    freePlots: [{ id: 1, x: 12, y: 11 }, { id: 2, x: 3, y: 12 }],
});

(async () => {
    // 1) one owner per biome roll
    const want = ['forest', 'highlands', 'ruins', 'coast'];
    const found = {};
    for (let i = 0; i < 600 && Object.keys(found).length < want.length; i++) {
        const key = 'Player' + i;
        const b = biomeOf(key);
        if (!found[b]) found[b] = key;
    }
    console.log('biome map:', JSON.stringify(found));
    for (const b of want) {
        const owner = found[b];
        if (!owner) { console.log('MISSING biome', b); continue; }
        const buf = await hs.renderFrame(baseState(owner, 2), 0, { static: true });
        fs.writeFileSync(`${OUT}/base_${b}_${owner}.png`, buf);
        console.log('base', b, owner, (buf.length / 1024).toFixed(0) + 'KB');
    }

    // 2) guild L5 + L1 (progression)
    const gState = {
        name: 'Iron Vale', archetype: 'ADVENTURER', level: 7,
        buildings: { hall: 5, training: 3, treasury: 3 },
        memberCount: 5, memberCap: 20,
        emblemColor: '#a02c3c', emblemIcon: '★',
    };
    const g5 = await gb.renderFrame(gState, 0, { static: true });
    fs.writeFileSync(`${OUT}/guild_l5.png`, g5);
    console.log('guild l5', (g5.length / 1024).toFixed(0) + 'KB');
    const g1 = await gb.renderFrame({ ...gState, buildings: { hall: 1, training: 0, treasury: 0 }, memberCount: 1 }, 0, { static: true });
    fs.writeFileSync(`${OUT}/guild_l1.png`, g1);
    console.log('guild l1', (g1.length / 1024).toFixed(0) + 'KB');

    // 3) mine progression: solo mines per level
    for (const lv of [1, 2, 3]) {
        const st = baseState(found.forest || 'Player0', lv);
        st.structures = [{ type: 'mines', x: 6, y: 6, level: lv }];
        st.freePlots = [];
        const buf = await hs.renderFrame(st, 0, { static: true });
        fs.writeFileSync(`${OUT}/mine_l${lv}.png`, buf);
        console.log('mine l' + lv, (buf.length / 1024).toFixed(0) + 'KB');
    }
    console.log('PROOFS DONE -> ' + OUT);
    process.exit(0);
})().catch((e) => { console.error('PROOF FAIL', e); process.exit(1); });
