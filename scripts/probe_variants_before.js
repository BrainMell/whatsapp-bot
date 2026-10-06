// Reproduce what the owner sees: current ROOM_VARIANTS overlay + TYPE_TINT.
// Renders every variant on the LFR plate, combat room (worst case: pack + HUD).
// Usage: node scripts/probe_variants_before.js [outdir]
'use strict';
const path = require('path');
const fs = require('fs');

const OUT = process.argv[2] || '/home/z/my-project/download/gw_variants_before';
fs.mkdirSync(OUT, { recursive: true });

const roomScene = require('../core/rpg/guildWar/roomScene');
const { ROOM_VARIANTS } = roomScene;

function mkEvent() {
    return {
        eventId: 'qa', seed: 'variant-seed-1', deadWorld: 'emberfall',
        side: 9, coreKey: '4,4', edges: [],
        rooms: [{ key: '3,3', type: 'combat', state: 'ACTIVE', ring: 1, payload: {}, occupants: [] }],
        players: [],
    };
}
function mkPlayer() {
    return {
        jid: 'champ@s.whatsapp.net', name: 'Brainard', guildId: 'g1', guildName: 'Valhalla',
        roomId: '3,3', prevRoomId: '2,3', discovered: [],
        stats: { hp: 52, maxHp: 100, energy: 142, maxEnergy: 142 },
        level: 9, classId: 'APPRENTICE', spriteIndex: 0, adventurerRank: 'D',
    };
}
// all three arches open → LFR plate (the richest base)
function exitsAll() {
    return ['n', 'e', 's', 'w'].map((dir) => ({ dir, edge: dir !== 's', known: true, kind: 'combat', cleared: false, key: '3,3' }));
}

(async () => {
    const ev = mkEvent();
    const pl = mkPlayer();
    const exits = exitsAll();
    for (const variant of ROOM_VARIANTS) {
        const room = {
            key: '3,3', type: 'combat', state: 'ACTIVE', ring: 1,
            variant, // ROOM_VARIANTS includes 'intact' (no overlay)
            payload: { enemies: [{ level: 10 }, { level: 11 }, { level: 12 }] },
        };
        const png = await roomScene._renderInProcess(ev, pl, room, { exits, prefix: '.' });
        const f = path.join(OUT, `before_${variant}.png`);
        fs.writeFileSync(f, png);
        console.log('wrote', f);
    }
    // hazard type tint demo (green full-screen wash — 'the other colors')
    for (const t of ['hazard', 'puzzle', 'core']) {
        const room = { key: '3,3', type: t, state: 'UNEXPLORED', ring: 1, variant: 'intact', payload: {} };
        const png = await roomScene._renderInProcess(ev, pl, room, { exits, prefix: '.' });
        const f = path.join(OUT, `before_tint_${t}.png`);
        fs.writeFileSync(f, png);
        console.log('wrote', f);
    }
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
