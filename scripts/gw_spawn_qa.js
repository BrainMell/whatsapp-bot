#!/usr/bin/env node
// QA — OWNER PLAYTEST FIXES 2026-10-05 (10:43):
//   #1 facing: "bottom and left means it should be facing left towards the
//      door" — spawn/back-position sprites face TOWARD an open side arch.
//   #2 spawn safety: "players that are weaker than the monsters in a ruin
//      should never spawn into a room with monsters" — spawn rooms seed
//      NO enemies and NO boss; startEvent rebakes combat/coop spawn rooms
//      to 'empty'.
const path = require('path');
const roomScene = require('../core/rpg/guildWar/roomScene');
const encounters = require('../core/rpg/guildWar/encounters');

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
    if (cond) { pass++; console.log(`  PASS ${name}`); }
    else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}
const E = (dir, edge = true) => ({ dir, edge });

console.log('== 1. facingForSpot (owner: bottom+left → face LEFT) ==');
check('spawn-in w+s exits → face LEFT', roomScene.facingForSpot('s', [E('w'), E('s')]) === true);
check('spawn-in s+e exits → face RIGHT', roomScene.facingForSpot('s', [E('e'), E('s')]) === false);
check('spawn-in s only → native (right)', roomScene.facingForSpot('s', [E('s')]) === false);
check('spawn-in w+e tie → native (right)', roomScene.facingForSpot('s', [E('w'), E('e')]) === false);
check('north walk-in w+n → face LEFT', roomScene.facingForSpot('n', [E('w'), E('n')]) === true);
check('west walk-in unchanged → face into room (right)', roomScene.facingForSpot('w', [E('n'), E('w')]) === false);
check('east walk-in unchanged → face into room (left)', roomScene.facingForSpot('e', []) === true);

console.log('== 2. planFor spawn-in integration (spot + flip via real exits) ==');
function makeDoc() {
    const rooms = ['0,0', '1,0', '2,0', '1,1'].map((k) => {
        const [x, y] = k.split(',').map(Number);
        return { key: k, x, y, region: 0, type: 'empty', state: 'UNEXPLORED', payload: {}, ring: 0.2, clearedBy: null, clearedByGuild: null, clearedAt: null, occupants: [], residue: null };
    });
    return { eventId: 'gw_spawn_qa', seed: '20261005', type: 'normal', state: 'ACTIVE', side: 3, rooms, edges: ['0,0|e', '1,0|w', '1,0|s', '1,1|n'], coreKey: '2,0', deadWorld: 'ash', players: [] };
}
const doc = makeDoc();
const spawner = {
    jid: 'qa@s.whatsapp.net', name: 'Brainard', classId: 'RANGER', spriteIndex: 0,
    roomId: '1,0', prevRoomId: '1,0', // spawn-in: no door walked through
    discovered: ['1,0'], guildId: 'g', guildName: 'G',
    level: 2, stats: { hp: 30, maxHp: 40, energy: 20, maxEnergy: 50 }, // WEAK player
};
const room1 = doc.rooms.find((r) => r.key === '1,0');
const exits = roomScene.exitsFor(doc, spawner);
const plan = roomScene.planFor(doc, spawner, room1, exits);
check('spawn spot is the green circle (624,780)', plan.playerSpot.x === 624 && plan.playerSpot.y === 780, JSON.stringify(plan.playerSpot));
check('spawn-in flip=true (faces LEFT toward west arch)', plan.playerSpot.flip === true, `flip=${plan.playerSpot.flip}`);
check('weak spawn-in draws ZERO enemies in empty hall', plan.enemies.length === 0);
const walker = { ...spawner, prevRoomId: '0,0' }; // walked east through the west door
const planW = roomScene.planFor(doc, walker, room1, roomScene.exitsFor(doc, walker));
check('west walk-in flip unchanged (false)', planW.playerSpot.flip === false, `flip=${planW.playerSpot.flip}`);

console.log('== 3. buildRoomPayload spawn guards (no monsters at spawn) ==');
function payloadFor(type, key, seed, spawns) {
    const [x, y] = key.split(',').map(Number);
    const room = { key, x, y, region: 0, type, state: 'UNEXPLORED', payload: {}, ring: 0.5, occupants: [] };
    return encounters.buildRoomPayload({ eventId: 'qa', seed, deadWorld: 'ash' }, room, { spawns });
}
const p = payloadFor('combat', '2,0', 'sA', ['2,0']);
check('combat spawn room seeds NO enemies', !p.enemies, JSON.stringify(p.enemies));
const pn = payloadFor('combat', '3,0', 'sA', ['2,0']);
check('combat NON-spawn still seeds enemies', Array.isArray(pn.enemies) && pn.enemies.length >= 1);
const pc = payloadFor('coop', '2,0', 'sB', ['2,0']);
check('coop spawn room seeds NO guardian pack', !pc.enemies);
const pcn = payloadFor('coop', '3,0', 'sB', ['2,0']);
check('coop NON-spawn still seeds pack', Array.isArray(pcn.enemies) && pcn.enemies.length >= 1);
let spawnBoss = false, nonSpawnBoss = false;
for (let i = 0; i < 60; i++) {
    const s = `boss${i}`;
    if (payloadFor('secret', '2,0', s, ['2,0']).boss) spawnBoss = true;
    if (payloadFor('secret', '9,9', s, ['2,0']).boss) nonSpawnBoss = true;
}
check('secret SPAWN room NEVER rolls a boss (60 seeds)', !spawnBoss);
check('secret NON-spawn can still roll a boss', nonSpawnBoss);
const ps = payloadFor('secret', '2,0', 'boss0', ['2,0']);
check('secret spawn room keeps its relic treasure', !!ps.relic);

console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
