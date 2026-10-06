// Render the NEW baked-in room design variants (full matrix).
// Usage: node scripts/probe_variants_after.js [outdir]
'use strict';
const path = require('path');
const fs = require('fs');

const OUT = process.argv[2] || '/home/z/my-project/download/gw_variants_after';
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
function exitsAll() {
    return ['n', 'e', 's', 'w'].map((dir) => ({ dir, edge: dir !== 's', known: true, kind: 'combat', cleared: false, key: '3,3' }));
}

(async () => {
    const ev = mkEvent();
    const pl = mkPlayer();
    const exits = exitsAll();
    const t0 = Date.now();
    for (const variant of ROOM_VARIANTS) {
        const room = {
            key: '3,3', type: 'combat', state: 'ACTIVE', ring: 1,
            variant,
            payload: { enemies: [{ level: 10 }, { level: 11 }, { level: 12 }] },
        };
        const ts = Date.now();
        const png = await roomScene._renderInProcess(ev, pl, room, { exits, prefix: '.' });
        const f = path.join(OUT, `after_${variant}.png`);
        fs.writeFileSync(f, png);
        console.log(`wrote ${f} (${Date.now() - ts}ms)`);
    }
    // cross-plate sanity: mossy + flooded on different door plates, no actor clutter
    for (const [variant, exKey] of [['mossy', 'LR'], ['flooded', 'F'], ['skill', '0'], ['crystal', 'F'], ['emberfall', 'LR']]) {
        const exits2 = exKey === 'LR' ? ['n', 'e', 's', 'w'].map((d) => ({ dir: d, edge: d === 'e' || d === 'w', known: true, kind: 'empty', cleared: false, key: '3,3' }))
            : exKey === 'F' ? ['n', 'e', 's', 'w'].map((d) => ({ dir: d, edge: d === 'n', known: true, kind: 'empty', cleared: false, key: '3,3' }))
                : ['n', 'e', 's', 'w'].map((d) => ({ dir: d, edge: false, known: false, kind: null, cleared: false, key: '3,3' }));
        const room = { key: '4,4', type: 'empty', state: 'UNEXPLORED', ring: 0, variant, payload: {} };
        const png = await roomScene._renderInProcess(ev, pl, room, { exits: exits2, prefix: '.' });
        const f = path.join(OUT, `plate_${exKey}_${variant}.png`);
        fs.writeFileSync(f, png);
        console.log('wrote', f);
    }
    console.log('total ms:', Date.now() - t0);
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
