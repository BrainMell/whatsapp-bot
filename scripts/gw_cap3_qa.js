#!/usr/bin/env node
// QA — OWNER RULE 2026-10-05: max THREE enemies in any given room.
// Renders a combat room whose SEEDED payload still carries 4 enemies
// (already-seeded events) — the drawn pack must cap at 3.
const fs = require('fs');
const path = require('path');
const roomScene = require('../core/rpg/guildWar/roomScene');

const OUT = '/home/z/my-project/download/gw_qa_1005';
fs.mkdirSync(OUT, { recursive: true });

function makeDoc(seed) {
    const rooms = [];
    const types = { '0,0': 'empty', '1,0': 'combat', '2,0': 'empty' };
    for (let x = 0; x < 3; x++) {
        const key = `${x},0`;
        rooms.push({ key, x, y: 0, region: 0, type: types[key] || 'empty', state: 'UNEXPLORED', payload: {}, ring: 0.9, clearedBy: null, clearedByGuild: null, clearedAt: null, occupants: [], residue: null });
    }
    rooms.find((r) => r.key === '1,0').payload = {
        theme: 'ember', enemies: [{ level: 12 }, { level: 12 }, { level: 12 }, { level: 12 }], // SEEDED 4
    };
    const edges = ['0,0|e', '1,0|e'];
    return { eventId: 'gw_cap3_qa', seed, type: 'normal', state: 'ACTIVE', side: 3, rooms, edges, coreKey: '2,0', deadWorld: 'ember', players: [] };
}

(async () => {
    const doc = makeDoc(20261005);
    const player = {
        jid: 'qa@s.whatsapp.net', name: 'Brainard', classId: 'FIGHTER', spriteIndex: 0,
        roomId: '1,0', prevRoomId: '0,0', discovered: ['1,0'],
        guildId: 'ember', guildName: 'Ember',
        level: 9, stats: { hp: 84, maxHp: 110, energy: 60, maxEnergy: 142 },
    };
    const room = doc.rooms.find((r) => r.key === '1,0');
    const exits = roomScene.exitsFor(doc, player);
    const plan = roomScene.planFor(doc, player, room, exits);
    const drawn = plan.enemies.length;
    console.log(`payload enemies=4  →  drawn pack=${drawn}  ${drawn === 3 ? 'PASS ✓' : 'FAIL ✗'}`);
    const png = await roomScene._renderInProcess(doc, player, room, { exits, plan });
    fs.writeFileSync(path.join(OUT, 'cap3_four_seeded.png'), png);
    console.log('OUT:', path.join(OUT, 'cap3_four_seeded.png'));
    process.exit(drawn === 3 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
